import type {
    CommandSpec,
    FsEntry,
    FsStat,
    On,
    ProcessRunInit,
    PromptOrigin,
    PromptSubmitInput,
    SessionMessage,
    ToolCallResult,
    TurnCompleteInput,
    TurnStartInput,
} from 'claude-code';
import type { Engine, MockClock, Plugin } from 'claude-code/testing';
import { expect, mock, test } from 'claude-code/testing';
import type { MainTurn } from '../types';
import type { FenceWhat } from './fence';
import { LOOK_TIMEOUT_MS } from './marker';
import { MARKER_HANDSOFF, MARKER_ON, MARKER_ON_UNTIL, MARKER_SESSION } from './marker.fixtures';
import { ASKING_TOOLS } from './register';
import {
    endingText,
    FALLBACK_RULE,
    fenceText,
    LEFT_OPEN_TEXT,
    PLAN_TEXT,
    QUESTION_PREFIX,
    START_JQ_NOTE,
    START_RULE_NOTE,
    SUBAGENT_SPENT_TEXT,
    SUBAGENT_TEXT,
    SWITCH_TEXT,
    TOO_COMPLEX_TEXT,
    WAKE_TEXT,
} from './text';

// A plugin beside sdd that reads `sdd.mainTurn` and `sdd.startLine` as a later hook does, and answers a run of
// /main-turn and of /start-line-state with what it read: the value, or `undefined` for a value never written.
const READER: Plugin = {
    name: 'reader',
    register(on) {
        on('command.run', async ($, e, next) => {
            if (e.command === 'main-turn') {
                const held = await $.state.get({ plugin: 'sdd', key: 'mainTurn' });
                return { text: held.value ?? 'undefined' };
            }
            if (e.command === 'start-line-state') {
                const held = await $.state.get({ plugin: 'sdd', key: 'startLine' });
                return { text: held.value ?? 'undefined' };
            }
            return next(e);
        });
    },
};
const WITH_READER = { plugins: [READER] };

// What the engine stamps on a run typed at the prompt; the kit's `$` takes the event's input whole.
const AT_PROMPT = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const;

const SESSION = { cwd: '/home/u/projects/org/app', surface: 'terminal', isInteractive: true } as const;

async function mainTurnOf($: Engine): Promise<string | undefined> {
    return (await $.command.run({ command: 'main-turn', args: '', ...AT_PROMPT })).text;
}

async function startLineOf($: Engine): Promise<string | undefined> {
    return (await $.command.run({ command: 'start-line-state', args: '', ...AT_PROMPT })).text;
}

// A turn's start and its end, the main loop's, or with `agentId` a subagent's.
function turnStart(turnId: string, agentId?: string): TurnStartInput {
    return agentId === undefined ? { text: '', turnId } : { text: '', turnId, agentId };
}

function turnComplete(turnId: string, agentId?: string): TurnCompleteInput {
    const fields: TurnCompleteInput = { answer: 'done', durationMs: 1, isAborted: false, turnId, reason: 'answer' };
    return agentId === undefined ? fields : { ...fields, agentId };
}

test('a fresh session reads undefined, which the module treats as none', WITH_READER, async ($) => {
    expect(await mainTurnOf($)).toBe('undefined');
});

test("the main loop's turn reads running from its start and complete from its end", WITH_READER, async ($, on) => {
    on('turn.start', (_$, e) => ({ turnId: e.turnId }));
    on('turn.complete', (_$, e) => ({ text: e.answer }));
    expect(await $.turn.start(turnStart('t1'))).toEqual({ turnId: 't1' });
    expect(await mainTurnOf($)).toBe('running');
    expect(await $.turn.complete(turnComplete('t1'))).toEqual({ text: 'done' });
    expect(await mainTurnOf($)).toBe('complete');
});

test("a subagent's turn changes nothing", WITH_READER, async ($, on) => {
    on('turn.start', (_$, e) => ({ turnId: e.turnId }));
    on('turn.complete', (_$, e) => ({ text: e.answer }));
    expect(await $.turn.start(turnStart('a-t1', 'a1'))).toEqual({ turnId: 'a-t1' });
    expect(await mainTurnOf($)).toBe('undefined');
    await $.turn.start(turnStart('t1'));
    await $.turn.complete(turnComplete('a-t1', 'a1'));
    expect(await mainTurnOf($)).toBe('running');
    await $.turn.complete(turnComplete('t1'));
    await $.turn.start(turnStart('a-t2', 'a1'));
    expect(await mainTurnOf($)).toBe('complete');
});

// /noask

// The rule file's text as the tests stage it, and the same text as the command prints it, without its last newline.
const RULE = 'noask is on: nobody answers until it is off. (The rule text, short for the tests.)';
const RULE_FILE_TEXT = `${RULE}\n`;

const STATE = '/home/u/.local/state/sdd';
const USAGE =
    'usage: noask [--session <id>] [status | on [handsoff] [<expiry>] | off | global on [<expiry>] | global off], ' +
    '<expiry> being <n>h, <n>m or until HH:MM; noask --session <id> [--agent <agent id>] count ' +
    'question|denial|continuation <budget> | count reset | count read';
const SESSION_ON = `noask: on for this session since 23:00 until 2026-11-12 07:00\nmarker: ${STATE}/noask.d/s-1`;
const HANDSOFF_ON = `noask: handsoff for this session since 23:00 until 02:00\nmarker: ${STATE}/noask.d/s-1`;
const GLOBAL_ON = `noask: on for every session since 23:00 until 2026-11-12 07:30\nmarker: ${STATE}/noask`;
const ALREADY_ON = 'noask: already on for this session since 23:00 until 2026-11-12 07:00; nothing changed';
const UNREADABLE =
    'noask: unreadable (the marker has 1 line, not 4); sessions treat it as on; noask global off removes it';
const CANNOT_WRITE = `noask: cannot write ${STATE}/noask.d/s-1`;

// What the noask command answers: an exit with its output, or a rejection of the run with this message.
type Reply = { readonly exitCode: number; readonly stdout: string; readonly stderr: string } | Error;

function printed(stdout: string): Reply {
    return { exitCode: 0, stdout, stderr: '' };
}

// The noask command as bin/noask answers, by the arguments after the session's own `--session <id>`: a new `on` prints
// its line, the marker's path, an empty line and the rule text; a count reset prints its counted line; anything it
// does not take is a wrong argument.
function noaskReply(args: ReadonlyArray<string>): Reply {
    const words = args[0] === '--session' && args[1] === 's-1' ? args.slice(2) : args;
    const typed = words.join(' ');
    if (typed === '') {
        return printed('noask: off\n');
    }
    if (typed.startsWith('on handsoff')) {
        return printed(`${HANDSOFF_ON}\n\n${RULE}\n`);
    }
    if (typed === 'on' || /^on [0-9]+[hm]$|^on until [0-9:]+$/.test(typed)) {
        return printed(`${SESSION_ON}\n\n${RULE}\n`);
    }
    if (typed === 'off') {
        return printed('noask: off for this session\n');
    }
    if (typed === 'global on' || /^global on [0-9]+[hm]$|^global on until [0-9:]+$/.test(typed)) {
        return printed(`${GLOBAL_ON}\n\n${RULE}\n`);
    }
    if (typed === 'global off') {
        return printed('noask: off for every session\n');
    }
    if (/^(?:--agent [A-Za-z0-9_-]+ )?count reset$/.test(typed)) {
        return printed('counted none 0 0 0\n');
    }
    return { exitCode: 2, stdout: '', stderr: `${USAGE}\n` };
}

// The session's history: a question asked and not answered.
const HISTORY: ReadonlyArray<SessionMessage> = [
    { role: 'user', text: 'Refactor the importer.', toolUses: [] },
    { role: 'assistant', text: 'Should the old importer stay as a fallback?', toolUses: [] },
];

// What the world beneath the plugin answers. Absent: the registration succeeds, the session's id is s-1, the command
// answers as noaskReply does and its start-line runs exit 0 with nothing printed (a session not under noask), the
// transcript holds HISTORY, the rule file holds RULE_FILE_TEXT, `$.state` is the kit's and every submission enters.
// `id` as a promise answers when it settles; `start` answers each run whose last word is start-line, a function asked
// at each such run and answered when what it returns does, an Error rejecting the run; `messages` as a function is
// asked at each read of the transcript, and answers when what it returns does; `rule: 'hang'` is a read that never
// answers, and a promise one that answers when the test settles it; `turn: 'deny'` refuses `$.state.get` of
// `sdd.mainTurn`, and a function is asked at each read of the turn and answers when what it returns does; with
// `submit: 'reject'` the submission's hook throws, and the engine skips it, so the submission rejects.
type World = {
    readonly register?: 'deny';
    readonly id?: string | Error | Promise<string>;
    readonly reply?: Reply;
    readonly start?: Reply | (() => Reply | Promise<Reply>);
    readonly messages?:
        | ReadonlyArray<SessionMessage>
        | 'deny'
        | (() => ReadonlyArray<SessionMessage> | Promise<ReadonlyArray<SessionMessage>>);
    readonly rule?: string | 'deny' | 'hang' | Promise<string>;
    readonly turn?: 'deny' | (() => MainTurn | Promise<MainTurn>);
    readonly submit?: 'drop' | 'reject';
};

const MAIN_TURN = { plugin: 'sdd', key: 'mainTurn' } as const;

// What a start-line run answers in the world: `start`, asked when it is a function, else an exit 0 with nothing.
async function startReplyOf(world: World): Promise<Reply> {
    return typeof world.start === 'function' ? world.start() : (world.start ?? printed(''));
}

// A promise the test settles itself: an answer of the world beneath that comes late, or never.
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((settle) => {
        resolve = settle;
    });
    return { promise, resolve };
}

type Run = { readonly argv: ReadonlyArray<string>; readonly init: ProcessRunInit | undefined };

// What a stage saw: the clock, each registration, toast and line logged, each run of /noask's command and each
// start-line run apart, each read of a file and each submission.
type Stage = {
    readonly clock: MockClock;
    readonly registered: CommandSpec[];
    readonly toasts: string[];
    readonly logs: string[];
    readonly runs: Run[];
    readonly starts: Run[];
    readonly reads: string[];
    readonly submits: PromptSubmitInput[];
};

function stage(on: On, world: World = {}): Stage {
    const recorded: Stage = {
        clock: mock.clock(on),
        registered: [],
        toasts: [],
        logs: [],
        runs: [],
        starts: [],
        reads: [],
        submits: [],
    };
    on('session.start', (_$, e) => ({ cwd: e.cwd }));
    on('turn.start', (_$, e) => ({ turnId: e.turnId }));
    on('turn.complete', (_$, e) => ({ text: e.answer }));
    on('command.register', (_$, e) => {
        if (world.register === 'deny') {
            return { deny: `"/${e.name}" refused: it is the user's /${e.name}` };
        }
        recorded.registered.push(e);
        return { value: { command: e.name } };
    });
    on('ui.toast', (_$, e) => {
        recorded.toasts.push(e.text);
        return { value: undefined };
    });
    on('ui.log', (_$, e) => {
        recorded.logs.push(e.text);
        return { value: undefined };
    });
    on('session.id', async () => {
        const id = world.id;
        return id instanceof Error ? { deny: id.message } : { value: await (id ?? 's-1') };
    });
    on('process.run', async (_$, e) => {
        const isStart = e.argv.at(-1) === 'start-line';
        (isStart ? recorded.starts : recorded.runs).push({ argv: [...e.argv], init: e.init });
        const reply = isStart ? await startReplyOf(world) : (world.reply ?? noaskReply(e.argv.slice(1)));
        return reply instanceof Error
            ? { deny: reply.message }
            : { value: { ...reply, isStdoutTruncated: false, isStderrTruncated: false } };
    });
    on('session.messages', async () => {
        if (world.messages === 'deny') {
            return { deny: 'no transcript in this test' };
        }
        const messages = typeof world.messages === 'function' ? await world.messages() : (world.messages ?? HISTORY);
        return { value: [...messages] };
    });
    const turn = world.turn;
    if (turn === 'deny') {
        on('state.get', MAIN_TURN, () => ({ deny: 'no state in this test' }));
    } else if (turn !== undefined) {
        on('state.get', MAIN_TURN, async () => ({ value: { value: await turn(), version: 1 } }));
    }
    on('fs.read', (_$, e) => {
        recorded.reads.push(e.path);
        if (world.rule === 'hang') {
            return new Promise<never>(() => undefined);
        }
        if (world.rule instanceof Promise) {
            return world.rule.then((value) => ({ value }));
        }
        return world.rule === 'deny' ? { deny: 'no such file in this test' } : { value: world.rule ?? RULE_FILE_TEXT };
    });
    on('prompt.submit', (_$, e) => {
        recorded.submits.push(e);
        if (world.submit === 'reject') {
            throw new Error('the test refuses the submission');
        }
        return world.submit === 'drop' ? { drop: 'dropped by the test' } : { text: e.text };
    });
    return recorded;
}

// The plugin's root, as the module wrote it before `/bin/noask` in the first run: the kit loads the plugin from its
// folder, a path the tests do not write down.
function rootOf(world: { readonly runs: ReadonlyArray<Run> }): string {
    const program = world.runs[0]?.argv[0] ?? '';
    expect(program).toMatch(/^\/.+\/bin\/noask$/);
    return program.slice(0, -'/bin/noask'.length);
}

// The arguments of each run after the program.
function argsOf(world: { readonly runs: ReadonlyArray<Run> }): ReadonlyArray<ReadonlyArray<string>> {
    return world.runs.map((run) => run.argv.slice(1));
}

// A run of /noask, typed at the prompt unless `origin` says where else it came from.
async function noask($: Engine, args: string, origin: PromptOrigin = AT_PROMPT.origin): Promise<string | undefined> {
    return (await $.command.run({ command: 'noask', args, ...AT_PROMPT, origin })).text;
}

// A session whose main loop has run a turn and finished it.
async function idle($: Engine): Promise<void> {
    await $.session.start(SESSION);
    await $.turn.start(turnStart('t1'));
    await $.turn.complete(turnComplete('t1'));
}

// What every run of the command is given: 10 seconds, and its two test seams set to the empty string, which it reads
// as unset, as the count's runs are.
const INIT = { timeoutMs: 10_000, env: { SDD_NOASK_NOW: '', SDD_NOASK_LOCK_WAIT: '' } };

// The wake-up turn as the module submits it: the owner's own words, unframed.
const WAKE_ORIGIN = { kind: 'plugin', name: 'sdd', asUser: true };

const COMMAND_SPEC: CommandSpec = {
    name: 'noask',
    description:
        'Switch noask for this session: on [3h | until 18:00], off, or alone for the status; "on handsoff" also ' +
        'lets this session push and open a request; "global on" and "global off" switch every session on this ' +
        'machine.',
    argumentHint: '[on [handsoff] [3h | until 18:00] | off | global on [9h | until 07:30] | global off]',
    immediate: true,
};

test('session start registers /noask as an immediate command with its hint', async ($, on) => {
    const world = stage(on);
    expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
    expect(world.registered).toEqual([COMMAND_SPEC]);
    expect(world.toasts).toEqual([]);
});

test('a refused registration raises a toast and the session still starts', async ($, on) => {
    const world = stage(on, { register: 'deny' });
    expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
    expect(world.registered).toEqual([]);
    expect(world.toasts).toHaveLength(1);
    expect(world.toasts[0]).toStartWith('sdd: could not register /noask: ');
    expect(world.toasts[0]).toEndWith(`"/noask" refused: it is the user's /noask`);
});

test('a reload registers /noask again with the same spec and raises no toast', async ($, on) => {
    const world = stage(on);
    expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
    expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
    expect(world.registered).toEqual([COMMAND_SPEC, COMMAND_SPEC]);
    expect(world.toasts).toEqual([]);
});

test("each command runs bin/noask by its argument vector after the session's id", async ($, on) => {
    const world = stage(on);
    await $.session.start(SESSION);
    await noask($, '');
    await noask($, 'on 9h');
    await noask($, 'on handsoff 3h');
    await noask($, 'global on until 07:30');
    const root = rootOf(world);
    expect(world.runs.map((run) => run.argv)).toEqual([
        [`${root}/bin/noask`, '--session', 's-1'],
        [`${root}/bin/noask`, '--session', 's-1', 'on', '9h'],
        [`${root}/bin/noask`, '--session', 's-1', 'on', 'handsoff', '3h'],
        [`${root}/bin/noask`, '--session', 's-1', 'global', 'on', 'until', '07:30'],
    ]);
});

test('the arguments are split on white space and passed on word for word', async ($, on) => {
    const world = stage(on);
    await $.session.start(SESSION);
    await noask($, '  global \t on   until 07:30 ');
    await noask($, 'on $(touch x); "9h"');
    expect(argsOf(world)).toEqual([
        ['--session', 's-1', 'global', 'on', 'until', '07:30'],
        ['--session', 's-1', 'on', '$(touch', 'x);', '"9h"'],
    ]);
});

test("every run is given 10 seconds and the command's two test seams blanked", async ($, on) => {
    const world = stage(on);
    await $.session.start(SESSION);
    for (const args of ['', 'on', 'off', 'global on 9h', 'global off', 'bogus']) {
        await noask($, args);
    }
    expect(world.runs).toHaveLength(6);
    for (const run of world.runs) {
        expect(run.init, run.argv.join(' ')).toStrictEqual(INIT);
    }
});

// The command's text: its standard output, then its standard error, each without the white space that ends it, and
// each only when something is left, joined by one newline.
const JOINS: ReadonlyArray<readonly [string, Reply, string]> = [
    ['both', { exitCode: 0, stdout: 'noask: off\n', stderr: 'noask: a note\n' }, 'noask: off\nnoask: a note'],
    ['standard output alone', { exitCode: 0, stdout: 'line 1\nline 2\n\n', stderr: '' }, 'line 1\nline 2'],
    ['standard error alone', { exitCode: 0, stdout: '', stderr: 'noask: a note\n' }, 'noask: a note'],
    ['white space alone', { exitCode: 0, stdout: '\n', stderr: ' \n' }, ''],
    ['white space at either end', { exitCode: 0, stdout: '  indented\n', stderr: 'last  \n' }, '  indented\nlast'],
];

for (const [name, reply, text] of JOINS) {
    test(`the text is the run's standard output followed by its standard error: ${name}`, async ($, on) => {
        const world = stage(on, { reply });
        await $.session.start(SESSION);
        expect(await noask($, '')).toBe(text);
        expect(world.toasts).toEqual([]);
    });
}

test('bare /noask answered with the unreadable line and exit 3 shows that line alone', async ($, on) => {
    const world = stage(on, { reply: { exitCode: 3, stdout: `${UNREADABLE}\n`, stderr: '' } });
    await idle($);
    const text = await noask($, '');
    await world.clock.settle();
    expect(text).toBe(UNREADABLE);
    expect(text).not.toContain('failed');
    expect(world.toasts).toEqual([]);
    expect(world.submits).toEqual([]);
});

for (const exitCode of [1, 2, 4, 127]) {
    test(`a status keeps its own lines whatever its exit: ${exitCode}`, async ($, on) => {
        const world = stage(on, { reply: { exitCode, stdout: '', stderr: 'noask: cannot read the clock\n' } });
        await $.session.start(SESSION);
        expect(await noask($, '')).toBe('noask: cannot read the clock');
        expect(await noask($, 'status')).toBe('noask: cannot read the clock');
        expect(world.toasts).toEqual([]);
    });
}

test('a second --session is passed on, and the command refuses it', async ($, on) => {
    const world = stage(on);
    await idle($);
    const text = await noask($, '--session s-2 off');
    await world.clock.settle();
    expect(argsOf(world)).toEqual([['--session', 's-1', '--session', 's-2', 'off']]);
    expect(text).toBe(USAGE);
    expect(world.toasts).toEqual([]);
    expect(world.submits).toEqual([]);
});

// The line of a session's command typed where the session's id could not be read, the test's reason in it.
function expectNoIdLine(text: string | undefined): void {
    expect(text).toStartWith("noask: this session's id could not be read (");
    expect(text).toEndWith('no id in this test); noask global on still switches every session');
}

test("with no usable id a session's command runs nothing, and a switch typed says so twice", async ($, on) => {
    const world = stage(on, { id: new Error('no id in this test') });
    await idle($);
    const switchedOn = await noask($, 'on');
    expectNoIdLine(switchedOn);
    expect(world.toasts).toEqual([switchedOn]);
    const switchedOff = await noask($, 'off');
    expectNoIdLine(switchedOff);
    expect(world.toasts).toEqual([switchedOn, switchedOff]);
    expectNoIdLine(await noask($, ''));
    expectNoIdLine(await noask($, 'on handsoff 3h'));
    expect(world.toasts).toHaveLength(3);
    await world.clock.settle();
    expect(world.runs).toEqual([]);
    expect(world.submits).toEqual([]);
});

test('an id not of the form the command takes is no usable id', async ($, on) => {
    const world = stage(on, { id: 'on' });
    await $.session.start(SESSION);
    const line = "noask: this session's id is not usable (on); noask global on still switches every session";
    expect(await noask($, 'on')).toBe(line);
    expect(world.toasts).toEqual([line]);
    expect(world.runs).toEqual([]);
});

test('with no usable id a global command runs without --session', async ($, on) => {
    const world = stage(on, { id: new Error('no id in this test') });
    await $.session.start(SESSION);
    expect(await noask($, 'global on')).toBe(`${GLOBAL_ON}\n\n${RULE}`);
    expect(await noask($, 'global off')).toBe('noask: off for every session');
    const root = rootOf(world);
    expect(world.runs.map((run) => run.argv)).toEqual([
        [`${root}/bin/noask`, 'global', 'on'],
        [`${root}/bin/noask`, 'global', 'off'],
    ]);
    expect(world.toasts).toEqual([]);
});

for (const args of ['on', 'on handsoff 3h', 'global on']) {
    test(`/noask ${args} in an idle session with a history submits the wake-up turn`, async ($, on) => {
        const world = stage(on);
        await idle($);
        await noask($, args);
        await world.clock.settle();
        expect(world.submits).toEqual([{ text: `${WAKE_TEXT}\n\n${RULE}`, wait: false, origin: WAKE_ORIGIN }]);
        expect(world.reads).toEqual([`${rootOf(world)}/scripts/noask-rule.md`]);
        expect(world.toasts).toEqual([]);
    });
}

test('a session that never ran a turn and holds messages gets the turn (a resumed or forked one)', async ($, on) => {
    const world = stage(on);
    await $.session.start(SESSION);
    await noask($, 'on');
    await world.clock.settle();
    expect(world.submits.map((submitted) => submitted.text)).toEqual([`${WAKE_TEXT}\n\n${RULE}`]);
});

test("a transcript of one user message alone gets the turn (a cleared session's)", async ($, on) => {
    const world = stage(on, {
        messages: [{ role: 'user', text: '<command-name>/clear</command-name>', toolUses: [] }],
    });
    await idle($);
    await noask($, 'global on');
    await world.clock.settle();
    expect(world.submits.map((submitted) => submitted.text)).toEqual([`${WAKE_TEXT}\n\n${RULE}`]);
});

test('an on that changed nothing still submits the one turn, rule text included', async ($, on) => {
    const world = stage(on, { reply: printed(`${ALREADY_ON}\n`) });
    await idle($);
    expect(await noask($, 'on')).toBe(`${ALREADY_ON}`);
    await world.clock.settle();
    expect(world.submits.map((submitted) => submitted.text)).toEqual([`${WAKE_TEXT}\n\n${RULE}`]);
});

test('the rule text is the file as written, but for the newlines that end it', async ($, on) => {
    const world = stage(on, { rule: 'line one\n\nline two  \n\n\n' });
    await idle($);
    await noask($, 'on');
    await world.clock.settle();
    expect(world.submits.map((submitted) => submitted.text)).toEqual([`${WAKE_TEXT}\n\nline one\n\nline two  `]);
});

test('with the rule file unreadable the turn carries the fallback rule and why', async ($, on) => {
    const world = stage(on, { rule: 'deny' });
    await idle($);
    await noask($, 'on');
    await world.clock.settle();
    expect(world.submits).toHaveLength(1);
    const text = world.submits[0]?.text ?? '';
    expect(text).toStartWith(`${WAKE_TEXT}\n\n${FALLBACK_RULE} (rule file unreadable: `);
    expect(text).toEndWith('no such file in this test)');
    expect(world.toasts).toEqual([]);
});

test('with a rule file read that never answers the turn carries the fallback once the timer fires', async ($, on) => {
    const world = stage(on, { rule: 'hang' });
    await idle($);
    const answer = noask($, 'on');
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    await world.clock.advance(1_999);
    expect(world.submits).toEqual([]);
    await world.clock.advance(1);
    expect(await answer).toBe(`${SESSION_ON}\n\n${RULE}`);
    await world.clock.settle();
    expect(world.submits.map((submitted) => submitted.text)).toEqual([
        `${WAKE_TEXT}\n\n${FALLBACK_RULE} (rule file unreadable: timed out)`,
    ]);
});

test('a busy session gets no turn', async ($, on) => {
    const world = stage(on);
    await $.session.start(SESSION);
    await $.turn.start(turnStart('t1'));
    await noask($, 'on');
    await noask($, 'global on');
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a new session, its transcript empty, gets no turn', async ($, on) => {
    const world = stage(on, { messages: [] });
    await $.session.start(SESSION);
    await noask($, 'on');
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a transcript that cannot be read submits nothing and fails nothing', async ($, on) => {
    const world = stage(on, { messages: 'deny' });
    await idle($);
    const text = await noask($, 'on');
    await world.clock.settle();
    expect(text).toBe(`${SESSION_ON}\n\n${RULE}`);
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a turn state that cannot be read submits nothing and fails nothing', async ($, on) => {
    const world = stage(on, { turn: 'deny' });
    await $.session.start(SESSION);
    const text = await noask($, 'on');
    await world.clock.settle();
    expect(text).toBe(`${SESSION_ON}\n\n${RULE}`);
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

// The session is looked at while the command runs, before its text is shown: the transcript first, as it is when
// /noask is typed, then the rule text, then the turn, each look bounded to 2 seconds.

// A transcript whose first read, the session start's own, holds HISTORY, and whose every later read answers as
// `later` does.
function afterTheStart(
    later: () => Promise<ReadonlyArray<SessionMessage>>,
): () => ReadonlyArray<SessionMessage> | Promise<ReadonlyArray<SessionMessage>> {
    let isStarted = false;
    return () => {
        if (isStarted) {
            return later();
        }
        isStarted = true;
        return HISTORY;
    };
}

test('a transcript that holds a history only once the command answered gets no turn', async ($, on) => {
    let transcript: ReadonlyArray<SessionMessage> = [];
    const world = stage(on, { messages: () => transcript });
    await idle($);
    const text = await noask($, 'on');
    transcript = HISTORY;
    await world.clock.settle();
    expect(text).toBe(`${SESSION_ON}\n\n${RULE}`);
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a turn that starts while the transcript is read gets no wake-up turn behind it', async ($, on) => {
    const transcript = deferred<ReadonlyArray<SessionMessage>>();
    const world = stage(on, { messages: afterTheStart(() => transcript.promise) });
    await idle($);
    const answer = noask($, 'on');
    await world.clock.settle();
    await $.turn.start(turnStart('t2'));
    transcript.resolve(HISTORY);
    expect(await answer).toBe(`${SESSION_ON}\n\n${RULE}`);
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a turn that starts while the transcript is read gets no turn, even when it ends at once', async ($, on) => {
    const transcript = deferred<ReadonlyArray<SessionMessage>>();
    const world = stage(on, { messages: afterTheStart(() => transcript.promise) });
    await idle($);
    const answer = noask($, 'on');
    await world.clock.settle();
    await $.turn.start(turnStart('t2'));
    transcript.resolve(HISTORY);
    expect(await answer).toBe(`${SESSION_ON}\n\n${RULE}`);
    await $.turn.complete(turnComplete('t2'));
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a turn that starts while the rule file is read gets no wake-up turn behind it', async ($, on) => {
    const ruleRead = deferred<string>();
    const world = stage(on, { rule: ruleRead.promise });
    await idle($);
    const answer = noask($, 'on');
    await world.clock.settle();
    await $.turn.start(turnStart('t2'));
    ruleRead.resolve(RULE_FILE_TEXT);
    expect(await answer).toBe(`${SESSION_ON}\n\n${RULE}`);
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a transcript that does not answer in 2 seconds wakes nothing, nor when it answers later', async ($, on) => {
    const transcript = deferred<ReadonlyArray<SessionMessage>>();
    const world = stage(on, { messages: afterTheStart(() => transcript.promise) });
    await idle($);
    const answer = noask($, 'on');
    await world.clock.advance(1_999);
    expect(world.submits).toEqual([]);
    await world.clock.advance(1);
    expect(await answer).toBe(`${SESSION_ON}\n\n${RULE}`);
    expect(world.submits).toEqual([]);
    transcript.resolve(HISTORY);
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a turn state that does not answer in 2 seconds wakes nothing, nor when it answers later', async ($, on) => {
    const turn = deferred<MainTurn>();
    const world = stage(on, { turn: () => turn.promise });
    await $.session.start(SESSION);
    const answer = noask($, 'on');
    await world.clock.advance(1_999);
    expect(world.submits).toEqual([]);
    await world.clock.advance(1);
    expect(await answer).toBe(`${SESSION_ON}\n\n${RULE}`);
    expect(world.submits).toEqual([]);
    turn.resolve('complete');
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

// The host check refuses a submission from a command.run hook still in flight, so the wake-up turn is submitted once
// the command's text is shown, after the turn is read once more, bounded too.

test('a turn that starts once the command answered, before the submission, gets no turn behind it', async ($, on) => {
    const world = stage(on);
    await idle($);
    expect(await noask($, 'on')).toBe(`${SESSION_ON}\n\n${RULE}`);
    await $.turn.start(turnStart('t2'));
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a turn running when /noask on is typed gets no turn, even when it ends before the submission', async ($, on) => {
    const world = stage(on);
    await $.session.start(SESSION);
    await $.turn.start(turnStart('t1'));
    expect(await noask($, 'on')).toBe(`${SESSION_ON}\n\n${RULE}`);
    await $.turn.complete(turnComplete('t1'));
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a turn read before the submission that does not answer in 2 seconds wakes nothing', async ($, on) => {
    const late = deferred<MainTurn>();
    const reads: string[] = [];
    const world = stage(on, {
        turn: () => {
            reads.push('turn');
            return reads.length === 1 ? 'complete' : late.promise;
        },
    });
    await $.session.start(SESSION);
    expect(await noask($, 'on')).toBe(`${SESSION_ON}\n\n${RULE}`);
    await world.clock.settle();
    expect(reads).toEqual(['turn', 'turn']);
    await world.clock.advance(2_000);
    late.resolve('complete');
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('off, global off and the bare command submit nothing in an idle session', async ($, on) => {
    const world = stage(on);
    await idle($);
    await noask($, 'off');
    await noask($, 'global off');
    await noask($, '');
    await world.clock.settle();
    expect(world.runs).toHaveLength(3);
    expect(world.submits).toEqual([]);
    expect(world.reads).toEqual([]);
});

test('a dropped submission raises a toast with the reason', async ($, on) => {
    const world = stage(on, { submit: 'drop' });
    await idle($);
    await noask($, 'on');
    await world.clock.settle();
    expect(world.submits).toHaveLength(1);
    expect(world.toasts).toEqual(['sdd: the wake-up turn could not be submitted: dropped by the test']);
});

// The engine skips the test's submission hook that throws, so nothing beneath answers the submission, which rejects
// with the engine's message; the toast carries it whole.
test('a submission that rejects raises a toast with the message', async ($, on) => {
    const world = stage(on, { submit: 'reject' });
    await idle($);
    await noask($, 'on');
    await world.clock.settle();
    expect(world.submits).toHaveLength(1);
    expect(world.toasts).toEqual(['sdd: the wake-up turn could not be submitted: no implementation for prompt.submit']);
});

for (const args of ['on', 'off', 'global on', 'global off', 'on handsoff 3h']) {
    test(`/noask ${args} that exits 1 is a failed switch, said twice, and wakes nothing`, async ($, on) => {
        const failed = `noask: the switch failed (exit 1): ${CANNOT_WRITE}`;
        const world = stage(on, { reply: { exitCode: 1, stdout: '', stderr: `${CANNOT_WRITE}\n` } });
        await idle($);
        const text = await noask($, args);
        await world.clock.settle();
        expect(text).toBe(failed);
        expect(world.toasts).toEqual([failed]);
        expect(world.submits).toEqual([]);
    });
}

for (const exitCode of [3, 4, 126, 127, 255]) {
    test(`a switching command that exits ${exitCode} is a failed switch`, async ($, on) => {
        const failed = `noask: the switch failed (exit ${exitCode}): ${CANNOT_WRITE}`;
        const world = stage(on, { reply: { exitCode, stdout: '', stderr: `${CANNOT_WRITE}\n` } });
        await idle($);
        expect(await noask($, 'on')).toBe(failed);
        await world.clock.settle();
        expect(world.toasts).toEqual([failed]);
        expect(world.submits).toEqual([]);
    });
}

test('a failed switch that printed nothing says so', async ($, on) => {
    const world = stage(on, { reply: { exitCode: 1, stdout: '', stderr: '' } });
    await $.session.start(SESSION);
    expect(await noask($, 'global off')).toBe('noask: the switch failed (exit 1): no output');
    expect(world.toasts).toEqual(['noask: the switch failed (exit 1): no output']);
});

test('an on refused with exit 2 shows the usage line and wakes nothing', async ($, on) => {
    const world = stage(on);
    await idle($);
    expect(await noask($, 'on 9x')).toBe(USAGE);
    await world.clock.settle();
    expect(argsOf(world)).toEqual([['--session', 's-1', 'on', '9x']]);
    expect(world.toasts).toEqual([]);
    expect(world.submits).toEqual([]);
});

// A run that rejects switched nothing for a form that switches nothing: its line says the command could not run, and
// no toast is raised.
const SWITCHING_NOTHING: ReadonlyArray<readonly [string, string]> = [
    ['the bare /noask', ''],
    ['/noask status', 'status'],
    ['/noask count reset', 'count reset'],
    ["a subagent's count reset", '--agent a1 count reset'],
];

for (const [name, args] of SWITCHING_NOTHING) {
    test(`a run of ${name} that rejects is said once, in the text`, async ($, on) => {
        const world = stage(on, { reply: new Error('command still running after 10000 ms') });
        await idle($);
        const text = await noask($, args);
        await world.clock.settle();
        expect(text).toStartWith('noask: the command could not run: ');
        expect(text).toEndWith('command still running after 10000 ms');
        expect(world.toasts).toEqual([]);
        expect(world.submits).toEqual([]);
    });
}

test('a run that rejects is said twice and wakes nothing', async ($, on) => {
    const world = stage(on, { reply: new Error('command still running after 10000 ms') });
    await idle($);
    const text = await noask($, 'on');
    await world.clock.settle();
    expect(text).toStartWith('noask: the switch could not run: ');
    expect(text).toEndWith('command still running after 10000 ms');
    expect(world.toasts).toEqual([text]);
    expect(world.submits).toEqual([]);
});

// The line that said this release was partial is gone: an `on` that exits 0 shows the command's lines alone, as an
// `on` that changed nothing does (the test above with ALREADY_ON).
test("every on that exits 0 shows the command's lines alone", async ($, on) => {
    const world = stage(on);
    await $.session.start(SESSION);
    expect(await noask($, 'on')).toBe(`${SESSION_ON}\n\n${RULE}`);
    expect(await noask($, 'on handsoff 3h')).toBe(`${HANDSOFF_ON}\n\n${RULE}`);
    expect(await noask($, 'global on 9h')).toBe(`${GLOBAL_ON}\n\n${RULE}`);
    expect(world.toasts).toEqual([]);
});

// An `on` that exits 1 shows its failure alone: the failed-switch tests above pin it.
test("a status, an off and an on refused with exit 2 show the command's lines alone", async ($, on) => {
    const world = stage(on);
    await $.session.start(SESSION);
    const texts = [await noask($, ''), await noask($, 'off'), await noask($, 'global off'), await noask($, 'on 9x')];
    expect(texts).toEqual(['noask: off', 'noask: off for this session', 'noask: off for every session', USAGE]);
    expect(world.toasts).toEqual([]);
});

// Who typed it: the bare command and `status`, the one word, run for every origin; every other form, a switch, a count
// or any other words, runs only when the owner typed it, at the prompt or through the bridge. From anywhere else the
// command's text is the one line below, written out here once more.
const OWNER_ONLY = 'noask: /noask acts only when the owner types it; nothing changed';
const BRIDGE: PromptOrigin = { kind: 'bridge' };
const THE_OWNER: ReadonlyArray<PromptOrigin> = [AT_PROMPT.origin, BRIDGE];
const NOT_THE_OWNER: ReadonlyArray<PromptOrigin> = [
    { kind: 'scheduled-trigger' },
    { kind: 'peer' },
    { kind: 'plugin', name: 'other' },
    { kind: 'slack-ping' },
    { kind: 'auto-continuation' },
];

for (const origin of NOT_THE_OWNER) {
    test(`every form but the bare command and status from origin ${origin.kind} runs nothing`, async ($, on) => {
        const world = stage(on);
        await idle($);
        const forms = ['count reset', '--agent a1 count reset', 'count read', 'status x', '--session s-2 status', 'x'];
        const texts: Array<string | undefined> = [];
        for (const args of forms) {
            texts.push(await noask($, args, origin));
        }
        await world.clock.settle();
        expect(texts).toEqual(forms.map(() => OWNER_ONLY));
        expect(world.runs).toEqual([]);
        expect(world.toasts).toEqual([]);
        expect(world.submits).toEqual([]);
    });

    test(`a switch from origin ${origin.kind} runs nothing, raises nothing and says so`, async ($, on) => {
        const world = stage(on);
        await idle($);
        const texts: Array<string | undefined> = [];
        for (const args of ['on handsoff', 'off', 'global off', 'global on 9h']) {
            texts.push(await noask($, args, origin));
        }
        await world.clock.settle();
        expect(texts).toEqual([OWNER_ONLY, OWNER_ONLY, OWNER_ONLY, OWNER_ONLY]);
        expect(world.runs).toEqual([]);
        expect(world.toasts).toEqual([]);
        expect(world.submits).toEqual([]);
        expect(world.reads).toEqual([]);
    });

    test(`a status from origin ${origin.kind} still runs and shows the command's lines`, async ($, on) => {
        const world = stage(on, { reply: printed('noask: off\n') });
        await idle($);
        expect(await noask($, '', origin)).toBe('noask: off');
        expect(await noask($, 'status', origin)).toBe('noask: off');
        expect(await noask($, ' \t status ', origin)).toBe('noask: off');
        await world.clock.settle();
        expect(argsOf(world)).toEqual([
            ['--session', 's-1'],
            ['--session', 's-1', 'status'],
            ['--session', 's-1', 'status'],
        ]);
        expect(world.toasts).toEqual([]);
        expect(world.submits).toEqual([]);
    });
}

for (const origin of THE_OWNER) {
    test(`a count reset from origin ${origin.kind} runs as before`, async ($, on) => {
        const world = stage(on);
        await idle($);
        expect(await noask($, 'count reset', origin)).toBe('counted none 0 0 0');
        expect(await noask($, '--agent a1 count reset', origin)).toBe('counted none 0 0 0');
        await world.clock.settle();
        const root = rootOf(world);
        expect(world.runs.map((run) => run.argv)).toEqual([
            [`${root}/bin/noask`, '--session', 's-1', 'count', 'reset'],
            [`${root}/bin/noask`, '--session', 's-1', '--agent', 'a1', 'count', 'reset'],
        ]);
        expect(world.toasts).toEqual([]);
        expect(world.submits).toEqual([]);
    });
}

test('a form not typed by the owner is refused before the session id is read', async ($, on) => {
    const world = stage(on, { id: new Error('no id in this test') });
    await $.session.start(SESSION);
    expect(await noask($, 'on', { kind: 'peer' })).toBe(OWNER_ONLY);
    expect(await noask($, 'global off', { kind: 'scheduled-trigger' })).toBe(OWNER_ONLY);
    expect(await noask($, 'count reset', { kind: 'plugin', name: 'other' })).toBe(OWNER_ONLY);
    expect(world.runs).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a switch typed through the bridge runs as one typed at the prompt', async ($, on) => {
    const world = stage(on);
    await idle($);
    expect(await noask($, 'on', BRIDGE)).toBe(`${SESSION_ON}\n\n${RULE}`);
    await world.clock.settle();
    expect(world.submits.map((submitted) => submitted.text)).toEqual([`${WAKE_TEXT}\n\n${RULE}`]);
    expect(await noask($, 'off', BRIDGE)).toBe('noask: off for this session');
    expect(await noask($, 'global off', BRIDGE)).toBe('noask: off for every session');
    expect(argsOf(world)).toEqual([
        ['--session', 's-1', 'on'],
        ['--session', 's-1', 'off'],
        ['--session', 's-1', 'global', 'off'],
    ]);
    expect(world.toasts).toEqual([]);
});

// The start line at a resume and a fork. At the session's start, once /noask is registered, a session whose start was
// not seen yet (`sdd.startLine` holds nothing) and whose transcript holds a message, a resumed or a forked one, runs
// `start-line` and shows the line the command prints, or marks the start seen when it prints none; a session whose
// transcript is empty, a new one, was spoken to by the command hook, and its start is marked seen. A failure on the
// way shows and marks nothing, so a reload, which runs session.start again in the same session, tries again.

const START_LINE =
    'noask is ON for this session since 23:00 until 2026-11-12 07:00; it rules on its own recommendations and never ' +
    'waits; /noask off to end it';
const NO_ID_LINE =
    "noask treats this session as ON: this session's id could not be read (no id was given) while a session's own " +
    'switch is on';
const UNREADABLE_LINE =
    'noask is ON for this session (noask marker unreadable: marker read timed out; treated as on); it rules on its ' +
    'own recommendations and never waits; /noask off to end it';

// What every run of start-line is given: 7 seconds, its own limit, and the command's two test seams blanked.
const START_INIT = { timeoutMs: 7_000, env: { SDD_NOASK_NOW: '', SDD_NOASK_LOCK_WAIT: '' } };

// The session's start, not awaited, and whether it has answered.
function starting($: Engine): { readonly answer: Promise<unknown>; readonly hasAnswered: () => boolean } {
    let hasAnswered = false;
    const answer = $.session.start(SESSION).then((value) => {
        hasAnswered = true;
        return value;
    });
    return { answer, hasAnswered: () => hasAnswered };
}

test("a start that finds a history shows the command's line, and keeps that it did", WITH_READER, async ($, on) => {
    const world = stage(on, { start: printed(`${START_LINE}\n`) });
    expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
    expect(world.logs).toEqual([START_LINE]);
    expect(world.starts.map((run) => run.argv)).toEqual([
        [`${rootOf({ runs: world.starts })}/bin/noask`, '--session', 's-1', 'start-line'],
    ]);
    expect(await startLineOf($)).toBe('shown');
    expect(world.registered).toEqual([COMMAND_SPEC]);
    expect(world.toasts).toEqual([]);
    expect(world.runs).toEqual([]);
});

test("the start line's run is given 7000 ms and the command's two test seams blanked", async ($, on) => {
    const world = stage(on, { start: printed(`${START_LINE}\n`) });
    await $.session.start(SESSION);
    expect(world.starts).toHaveLength(1);
    expect(world.starts[0]?.init).toStrictEqual(START_INIT);
});

test('a second session start, a reload, does not show the line again', WITH_READER, async ($, on) => {
    const world = stage(on, { start: printed(`${START_LINE}\n`) });
    await $.session.start(SESSION);
    expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
    expect(world.logs).toEqual([START_LINE]);
    expect(world.starts).toHaveLength(1);
    expect(world.registered).toEqual([COMMAND_SPEC, COMMAND_SPEC]);
    expect(await startLineOf($)).toBe('shown');
});

test('a start with an empty transcript shows nothing, nor a start after a turn', WITH_READER, async ($, on) => {
    let transcript: ReadonlyArray<SessionMessage> = [];
    const world = stage(on, { messages: () => transcript, start: printed(`${START_LINE}\n`) });
    expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
    expect(await startLineOf($)).toBe('started');
    await $.turn.start(turnStart('t1'));
    transcript = HISTORY;
    await $.turn.complete(turnComplete('t1'));
    expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
    expect(world.starts).toEqual([]);
    expect(world.logs).toEqual([]);
    expect(await startLineOf($)).toBe('started');
});

// noask off at the start: the start is seen, so a reload after a later `on` shows no late line either.
test('a start where the command prints nothing shows nothing, nor a start after', WITH_READER, async ($, on) => {
    const replies = [printed(''), printed(`${START_LINE}\n`)];
    const world = stage(on, { start: () => replies.shift() ?? printed('') });
    expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
    expect(await startLineOf($)).toBe('started');
    expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
    expect(world.starts).toHaveLength(1);
    expect(world.logs).toEqual([]);
});

// A failure on the way shows nothing and marks nothing: the next start runs the command again.
const FAILED_STARTS: ReadonlyArray<readonly [string, Reply]> = [
    ['a run that rejects', new Error('command still running after 7000 ms')],
    ['an exit of 1', { exitCode: 1, stdout: '', stderr: 'noask: cannot read the clock\n' }],
    ['an exit of 2 with a line', { exitCode: 2, stdout: `${START_LINE}\n`, stderr: '' }],
];

for (const [name, failed] of FAILED_STARTS) {
    test(`after ${name} the start shows nothing, and the next start shows the line`, WITH_READER, async ($, on) => {
        const replies = [failed, printed(`${START_LINE}\n`)];
        const world = stage(on, { start: () => replies.shift() ?? printed('') });
        expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
        expect(world.logs).toEqual([]);
        expect(await startLineOf($)).toBe('undefined');
        expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
        expect(world.logs).toEqual([START_LINE]);
        expect(world.starts).toHaveLength(2);
        expect(await startLineOf($)).toBe('shown');
        expect(world.toasts).toEqual([]);
    });
}

const UNUSABLE_IDS: ReadonlyArray<readonly [string, string | Error]> = [
    ['an id that cannot be read', new Error('no id in this test')],
    ['a reserved word', 'on'],
    ['an id of another form', 'a b'],
];

for (const [name, id] of UNUSABLE_IDS) {
    test(`with ${name} the command runs without --session`, async ($, on) => {
        const world = stage(on, { id, start: printed(`${NO_ID_LINE}\n`) });
        expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
        const root = rootOf({ runs: world.starts });
        expect(world.starts.map((run) => run.argv)).toEqual([[`${root}/bin/noask`, 'start-line']]);
        expect(world.logs).toEqual([NO_ID_LINE]);
    });
}

test('a transcript that cannot be read shows and marks nothing, and the start goes on', WITH_READER, async ($, on) => {
    const world = stage(on, { messages: 'deny', start: printed(`${START_LINE}\n`) });
    expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
    expect(world.starts).toEqual([]);
    expect(world.logs).toEqual([]);
    expect(await startLineOf($)).toBe('undefined');
});

test('a state that cannot be read runs nothing, and the start goes on', async ($, on) => {
    const world = stage(on, { start: printed(`${START_LINE}\n`) });
    on('state.get', { plugin: 'sdd', key: 'startLine' }, () => ({ deny: 'no state in this test' }));
    expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
    expect(world.starts).toEqual([]);
    expect(world.logs).toEqual([]);
});

test('a session id that never answers is let go at 2 seconds, and the command runs without it', async ($, on) => {
    const world = stage(on, { id: never(), start: printed(`${NO_ID_LINE}\n`) });
    const start = starting($);
    await world.clock.advance(LOOK_TIMEOUT_MS - 1);
    expect(start.hasAnswered()).toBe(false);
    expect(world.starts).toEqual([]);
    await world.clock.advance(1);
    expect(await start.answer).toEqual({ cwd: SESSION.cwd });
    expect(argsOf({ runs: world.starts })).toEqual([['start-line']]);
    expect(world.logs).toEqual([NO_ID_LINE]);
});

test('a run of the command that never answers is let go at 7 seconds, showing nothing', WITH_READER, async ($, on) => {
    const world = stage(on, { start: () => never() });
    const start = starting($);
    await world.clock.advance(6_999);
    expect(start.hasAnswered()).toBe(false);
    await world.clock.advance(1);
    expect(await start.answer).toEqual({ cwd: SESSION.cwd });
    expect(world.starts).toHaveLength(1);
    expect(world.logs).toEqual([]);
    expect(await startLineOf($)).toBe('undefined');
});

// Past the 2 seconds a marker's look takes: the command waited on a marker that hangs, and says so.
test('a run that answers after 3 seconds with the unreadable line has the line shown', WITH_READER, async ($, on) => {
    const world: Stage = stage(on, {
        start: async () => {
            await world.clock.sleep(3_000);
            return printed(`${UNREADABLE_LINE}\n`);
        },
    });
    const start = starting($);
    await world.clock.advance(2_999);
    expect(start.hasAnswered()).toBe(false);
    await world.clock.advance(1);
    expect(await start.answer).toEqual({ cwd: SESSION.cwd });
    expect(world.logs).toEqual([UNREADABLE_LINE]);
    expect(await startLineOf($)).toBe('shown');
});

// The line is shown before the state is written: a write that fails leaves the start unseen, so a reload shows the
// line again, which is preferred to a line never shown.
test('a state write that fails after the line was shown leaves the line, and the start goes on', async ($, on) => {
    const world = stage(on, { start: printed(`${START_LINE}\n`) });
    on('state.set', { plugin: 'sdd', key: 'startLine' }, () => ({ deny: 'the test refuses this write' }));
    expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
    expect(world.logs).toEqual([START_LINE]);
    expect(await $.session.start(SESSION)).toEqual({ cwd: SESSION.cwd });
    expect(world.logs).toEqual([START_LINE, START_LINE]);
});

// The command's notes stand on its line, each after one space.
const NOTES: ReadonlyArray<readonly [string, string]> = [
    ['the jq note', START_JQ_NOTE],
    ['the rule note', START_RULE_NOTE],
];

for (const [name, note] of NOTES) {
    test(`a resume whose line carries ${name} shows the note on the line`, async ($, on) => {
        const world = stage(on, { start: printed(`${START_LINE} ${note}\n`) });
        await $.session.start(SESSION);
        expect(world.logs).toEqual([`${START_LINE} ${note}`]);
    });
}

// Tool calls: the question refusal, the fence and the guard on the switch. The markers lie in a file system in
// memory beneath the plugin, each test's as its name says, and the count's run answers `counted none 1 0 0` unless the
// test says otherwise.

const HOME = '/home/u';
const GLOBAL = `${STATE}/noask`;
const OWN = `${STATE}/noask.d/s-1`;
const OTHER = `${STATE}/noask.d/s-2`;
const RECORD = `${STATE}/budgets.d/s-1`;
const CONFIG_FILE = `${HOME}/.claude/CLAUDE.md`;

// The clock: NOW, at which every marker of marker.fixtures.ts reads on (2026-11-11T23:00:12+04:00), and LATE, past the
// until of MARKER_SESSION, MARKER_HANDSOFF and MARKER_ON_UNTIL (2026-11-12T08:00:00+04:00).
const NOW = 1_794_423_612_000;
const LATE = 1_794_456_000_000;

// A marker the command does not write, one line where four are expected, and what an unreadable reading adds.
const BAD_MARKER = 'x\n';
const BAD_SUFFIX = ' (noask marker unreadable: 4 lines expected, found 1; treated as on)';

const COUNTED = printed('counted none 1 0 0\n');
const LOCKED = 'noask: the records are locked by another noask command';
const NOTE = `noask: the record ${RECORD} did not parse (2 lines, not 4); started again`;

type Input = Parameters<Engine['tool']['call']>[0];

const QUESTION: Input = {
    tool: 'AskUserQuestion',
    questions: [
        {
            question: 'Should the old importer stay as a fallback?',
            header: 'Importer',
            options: [
                { label: 'Keep it', description: 'The old importer stays beside the new one.' },
                { label: 'Remove it', description: 'The new importer replaces it.' },
            ],
            multiSelect: false,
        },
    ],
};
const PLAN: Input = { tool: 'ExitPlanMode' };

function shell(command: string): Input {
    return { tool: 'Bash', command };
}

function edit(path: string): Input {
    return { tool: 'Edit', file_path: path, old_string: 'a', new_string: 'b' };
}

function write(path: string): Input {
    return { tool: 'Write', file_path: path, content: 'x' };
}

function notebook(path: string): Input {
    return { tool: 'NotebookEdit', notebook_path: path, new_source: 'x' };
}

// A watch: the tool that runs a shell command and takes each line it prints as an event, or, with no command, opens
// a socket and takes each frame as one.
function watch(command: string): Input {
    return { tool: 'Monitor', description: 'the build', timeout_ms: 60_000, command };
}

const SOCKET: Input = {
    tool: 'Monitor',
    description: 'the events',
    timeout_ms: 60_000,
    ws: { url: 'wss://example.org/events' },
};

// What the tool beneath answers a call that reaches it, and the answer of a refused call.
const REACHED = { result: 'ran' };

function denied(text: string): { readonly deny: string } {
    return { deny: text };
}

function fenced(what: FenceWhat): { readonly deny: string } {
    return denied(fenceText(what));
}

const QUESTION_TEXT = `${QUESTION_PREFIX}${RULE}`;
const CONFIG_EDIT = fenced('an edit under the configuration directory');

// The call as the main agent makes it, or with `agentId` as that subagent does.
async function call($: Engine, input: Input, agentId?: string): Promise<ToolCallResult> {
    return $.tool.call(agentId === undefined ? input : { ...input, agentId });
}

// What the world beneath the plugin holds for a tool call. `files` maps each file to its text and `links` each link to
// its target; `dirs` names folders that hold nothing named, `<home>/.claude` when it is absent; every folder above a
// named path exists, and so do the session's directory and /tmp. HOME is /home/u, the session's directory SESSION.cwd
// unless `cwd` says otherwise, the session's id s-1 unless `id` does, and `env` holds the other variables. The clock
// reads NOW unless `now` says otherwise. A file call named in `hang` (`<call> <path>`, the call one of exists, read,
// list and stat) never answers, and one named in `refuse` rejects. The count's run answers `count`, by default
// COUNTED. The rule file reads RULE_FILE_TEXT; with `rule: 'deny'` every read of it is refused, and with `rule: 'bytes
// once'` its first read answers bytes, which the module does not expect, so the hook's own code throws. The read of
// HOME numbered `refusedHomeRead`, or each of them when it is a list, is refused. The tool beneath answers REACHED, or
// with `tool: 'reject'` fails.
type Scene = {
    readonly files?: Readonly<Record<string, string>>;
    readonly links?: Readonly<Record<string, string>>;
    readonly dirs?: ReadonlyArray<string>;
    readonly env?: Readonly<Record<string, string>>;
    readonly cwd?: string;
    readonly id?: string | Error;
    readonly now?: number;
    readonly hang?: ReadonlyArray<string>;
    readonly refuse?: ReadonlyArray<string>;
    readonly count?: Reply;
    readonly rule?: 'deny' | 'bytes once';
    readonly refusedHomeRead?: number | ReadonlyArray<number>;
    readonly tool?: 'reject';
};

// What a scene saw: the clock, each run of the command, and each call that reached the tool beneath.
type Seen = { readonly clock: MockClock; readonly runs: Run[]; readonly reached: string[] };

type Tree = {
    readonly files: ReadonlyMap<string, string>;
    readonly links: ReadonlyMap<string, string>;
    readonly dirs: ReadonlySet<string>;
};

function parentOf(path: string): string {
    const cut = path.lastIndexOf('/');
    return cut <= 0 ? '/' : path.slice(0, cut);
}

function treeOf(scene: Scene): Tree {
    const files = new Map(Object.entries(scene.files ?? {}));
    const links = new Map(Object.entries(scene.links ?? {}));
    const dirs = new Set<string>(['/']);
    const folders = [...(scene.dirs ?? [`${HOME}/.claude`]), SESSION.cwd, '/tmp'];
    for (const path of [...files.keys(), ...links.keys(), ...folders]) {
        for (let folder = parentOf(path); !dirs.has(folder); folder = parentOf(folder)) {
            dirs.add(folder);
        }
    }
    for (const folder of folders) {
        dirs.add(folder);
    }
    return { files, links, dirs };
}

// Where a path lands in the tree, every link on the way followed, or undefined when it leads nowhere.
function landing(tree: Tree, path: string, depth = 0): string | undefined {
    let current = '/';
    for (const part of path.split('/').filter((each) => each !== '')) {
        const next = current === '/' ? `/${part}` : `${current}/${part}`;
        const target = tree.links.get(next);
        if (target !== undefined) {
            const real = depth < 8 ? landing(tree, target, depth + 1) : undefined;
            if (real === undefined) {
                return undefined;
            }
            current = real;
        } else if (tree.files.has(next) || tree.dirs.has(next)) {
            current = next;
        } else {
            return undefined;
        }
    }
    return current;
}

// The entries of a folder, by the names of the paths directly in it.
function entriesOf(tree: Tree, folder: string): FsEntry[] {
    const entries = new Map<string, FsEntry>();
    for (const path of [...tree.files.keys(), ...tree.links.keys(), ...tree.dirs]) {
        if (path !== folder && parentOf(path) === folder) {
            const isLink = tree.links.has(path);
            const kind = isLink ? 'other' : tree.files.has(path) ? 'file' : 'dir';
            entries.set(path, { name: path.slice(path.lastIndexOf('/') + 1), kind, size: 0, mtimeMs: 0, isLink });
        }
    }
    return [...entries.values()];
}

function described(
    e: { readonly tool: string } & Partial<Record<'command' | 'file_path' | 'notebook_path', unknown>>,
): string {
    const what = e.command ?? e.file_path ?? e.notebook_path;
    return typeof what === 'string' ? `${e.tool} ${what}` : e.tool;
}

function missing(path: string): { readonly deny: string } {
    return { deny: `ENOENT: no such file or directory, '${path}'` };
}

function never(): Promise<never> {
    return new Promise<never>(() => undefined);
}

function scene(on: On, world: Scene = {}): Seen {
    const seen: Seen = { clock: mock.clock(on, { now: world.now ?? NOW }), runs: [], reached: [] };
    const tree = treeOf(world);
    const isNamed = (list: ReadonlyArray<string> | undefined, name: string): boolean => list?.includes(name) ?? false;
    const held = (call: string, path: string): Promise<never> | { readonly deny: string } | undefined => {
        if (isNamed(world.hang, `${call} ${path}`)) {
            return never();
        }
        return isNamed(world.refuse, `${call} ${path}`) ? { deny: `EACCES: permission denied, '${path}'` } : undefined;
    };
    let ruleReads = 0;
    let homeReads = 0;
    on('fs.exists', (_$, e) => held('exists', e.path) ?? { value: landing(tree, e.path) !== undefined });
    on('fs.read', (_$, e) => {
        if (e.path.endsWith('/scripts/noask-rule.md')) {
            ruleReads += 1;
            if (world.rule === 'deny') {
                return { deny: 'no such file in this test' };
            }
            return world.rule === 'bytes once' && ruleReads === 1
                ? { value: { base64: 'eA==' } }
                : { value: RULE_FILE_TEXT };
        }
        const real = landing(tree, e.path);
        const text = real === undefined ? undefined : tree.files.get(real);
        return held('read', e.path) ?? (text === undefined ? missing(e.path) : { value: text });
    });
    on('fs.list', (_$, e) => {
        const real = landing(tree, e.path);
        const isFolder = real !== undefined && tree.dirs.has(real);
        return held('list', e.path) ?? (isFolder ? { value: entriesOf(tree, real) } : missing(e.path));
    });
    on('fs.stat', (_$, e) => {
        const real = landing(tree, e.path);
        if (real === undefined) {
            return held('stat', e.path) ?? missing(e.path);
        }
        const kind = tree.files.has(real) ? 'file' : 'dir';
        const stat: FsStat = { kind, size: 0, mtimeMs: 0, isLink: tree.links.has(e.path) };
        return held('stat', e.path) ?? { value: e.resolve ? { ...stat, realPath: real } : stat };
    });
    on('env.get', (_$, e) => {
        if (e.name !== 'HOME') {
            return { value: world.env?.[e.name] };
        }
        homeReads += 1;
        const isRefused = [world.refusedHomeRead ?? []].flat().includes(homeReads);
        return isRefused ? { deny: 'the test refuses this read of HOME' } : { value: HOME };
    });
    on('session.id', () => (world.id instanceof Error ? { deny: world.id.message } : { value: world.id ?? 's-1' }));
    on('session.cwd', () => ({ value: world.cwd ?? SESSION.cwd }));
    on('process.run', (_$, e) => {
        seen.runs.push({ argv: [...e.argv], init: e.init });
        const reply = world.count ?? COUNTED;
        return reply instanceof Error
            ? { deny: reply.message }
            : { value: { ...reply, isStdoutTruncated: false, isStderrTruncated: false } };
    });
    on('tool.call', (_$, e) => {
        seen.reached.push(described(e));
        if (world.tool === 'reject') {
            throw new Error('the tool failed in this test');
        }
        return REACHED;
    });
    return seen;
}

// The count's run of a denial, of a refused question, and of each by a subagent.
const DENIAL_RUN = ['--session', 's-1', 'count', 'denial', '10'];
const QUESTION_RUN = ['--session', 's-1', 'count', 'question', '6'];
const AGENT_DENIAL_RUN = ['--session', 's-1', '--agent', 'a1', 'count', 'denial', '10'];

// The owner's word to publish: the session's own switch at handsoff.

const PUBLISHING = [
    'git push -u origin b',
    'gh pr create --fill',
    'glab mr create',
    'cd x && git push && gh pr create --fill',
];
const AT_HANDSOFF: ReadonlyArray<readonly [string, Scene]> = [
    ['the global marker off', { files: { [OWN]: MARKER_HANDSOFF } }],
    ['the global marker on', { files: { [OWN]: MARKER_HANDSOFF, [GLOBAL]: MARKER_ON } }],
];

for (const [name, world] of AT_HANDSOFF) {
    test(`at handsoff, ${name}: the main agent's push and requests reach the engine, uncounted`, async ($, on) => {
        const seen = scene(on, world);
        for (const command of PUBLISHING) {
            expect(await call($, shell(command)), command).toEqual(REACHED);
        }
        expect(seen.reached).toEqual(PUBLISHING.map((command) => `Bash ${command}`));
        expect(seen.runs).toEqual([]);
    });

    test(`at handsoff, ${name}: what the owner's word does not cover is still denied`, async ($, on) => {
        const seen = scene(on, world);
        for (const command of PUBLISHING) {
            expect(await call($, shell(command), 'a1'), command).toEqual(denied(SUBAGENT_TEXT));
        }
        expect(await call($, shell('git push --force'))).toEqual(fenced('a push other than a plain one'));
        expect(await call($, shell('git push origin a:b'))).toEqual(fenced('a push other than a plain one'));
        expect(await call($, shell('git push && noask global off'))).toEqual(fenced('switching noask'));
        expect(await call($, shell('noask global off; git push'))).toEqual(fenced('switching noask'));
        expect(await call($, edit(GLOBAL))).toEqual(fenced('switching noask'));
        expect(await call($, edit(CONFIG_FILE))).toEqual(CONFIG_EDIT);
        expect(seen.reached).toEqual([]);
        expect(argsOf(seen)).toEqual([
            ...PUBLISHING.map(() => AGENT_DENIAL_RUN),
            ...[1, 2, 3, 4, 5, 6].map(() => DENIAL_RUN),
        ]);
    });
}

test('a hit that is no publication denies the whole call with its own text, wherever it stands', async ($, on) => {
    const seen = scene(on, { files: { [OWN]: MARKER_HANDSOFF, [GLOBAL]: MARKER_ON } });
    const forced = fenced('a push other than a plain one');
    expect(await call($, shell('git push -u origin b && git push --force origin b'))).toEqual(forced);
    expect(await call($, shell('gh pr create --fill; git push origin a:b'))).toEqual(forced);
    expect(argsOf(seen)).toEqual([DENIAL_RUN, DENIAL_RUN]);
    expect(seen.reached).toEqual([]);
});

test('at handsoff a push redirected into the state directory is switching noask, counted once', async ($, on) => {
    const seen = scene(on, { files: { [OWN]: MARKER_HANDSOFF } });
    expect(await call($, shell('git push > "$HOME/.local/state/sdd/noask"'))).toEqual(fenced('switching noask'));
    expect(argsOf(seen)).toEqual([DENIAL_RUN]);
    expect(seen.reached).toEqual([]);
});

const NOT_THE_WORD: ReadonlyArray<readonly [string, Scene]> = [
    ["the session's own switch at plain noask", { files: { [OWN]: MARKER_SESSION } }],
    [
        "only another session's marker at handsoff, the global marker on",
        { files: { [OTHER]: MARKER_HANDSOFF, [GLOBAL]: MARKER_ON } },
    ],
    [
        "the session's handsoff marker past its until, the global marker on",
        { files: { [OWN]: MARKER_HANDSOFF, [GLOBAL]: MARKER_ON }, now: LATE },
    ],
];

for (const [name, world] of NOT_THE_WORD) {
    test(`the word is the session's own and current: with ${name} a push is denied`, async ($, on) => {
        const seen = scene(on, world);
        expect(await call($, shell('git push'))).toEqual(fenced('a push'));
        expect(argsOf(seen)).toEqual([DENIAL_RUN]);
    });
}

// Without noask every hook but the guard lets the call through and runs nothing.

const INERT: ReadonlyArray<readonly [string, Scene]> = [
    ['no marker', {}],
    ['the global marker expired', { files: { [GLOBAL]: MARKER_ON_UNTIL }, now: LATE }],
    ["only another session's marker on", { files: { [OTHER]: MARKER_SESSION } }],
];

for (const [name, world] of INERT) {
    test(`with ${name} the question, the plan, a push and a configuration edit reach the engine`, async ($, on) => {
        const seen = scene(on, world);
        for (const input of [QUESTION, PLAN, shell('git push'), edit(CONFIG_FILE)]) {
            expect(await call($, input), input.tool).toEqual(REACHED);
        }
        expect(seen.reached).toEqual(['AskUserQuestion', 'ExitPlanMode', 'Bash git push', `Edit ${CONFIG_FILE}`]);
        expect(seen.runs).toEqual([]);
    });
}

// The guard on the switch: in every session, whatever the marker reads.

const SWITCHING_COMMANDS = [
    'noask --session s-9 on handsoff',
    'noask --session s-1 on',
    'noask global on',
    'noask global off',
    'noask --session s-1 count reset',
    'noask --session s-1 status',
    'SDD_NOASK_NOW=1 noask status',
    'export SDD_NOASK_NOW=1',
    'env -u X noask global off',
    'env -uu noask global off',
    'env --u X noask global off',
    'env -a x noask global off',
    'time -p noask global off',
    'timeout 5 noask global off',
    'eval noask global off',
    'no""ask global off',
    'echo "${ noask global off; }"',
    'rm ~/.local/state/sdd/noask',
    'rm ~/.local/state/sdd/budgets.d/s-1',
    'rm -r ~/.local/state',
    'rm -rf ~/.local/state/*',
    ': > ~/.local/state/sdd/noask.d/s-9',
    ': >| ~/.local/state/sdd/budgets.d/s-1',
    'printf x &>> ~/.local/state/sdd/budgets.d/s-1',
    ': <> ~/.local/state/sdd/noask',
];
const SWITCHING_PATHS = [`${STATE}/noask.d/s-9`, RECORD];
const SWITCHING_EDITS = SWITCHING_PATHS.flatMap((path) => [edit(path), write(path)]);
const READING_COMMANDS = ['noask', 'noask status', 'cat ~/.local/state/sdd/noask', 'mv /tmp/report "$HOME"'];

test("outside noask every door to the switch is denied with the guard's text, uncounted", async ($, on) => {
    const seen = scene(on);
    for (const command of SWITCHING_COMMANDS) {
        expect(await call($, shell(command)), command).toEqual(denied(SWITCH_TEXT));
    }
    for (const input of SWITCHING_EDITS) {
        expect(await call($, input), described(input)).toEqual(denied(SWITCH_TEXT));
    }
    for (const command of READING_COMMANDS) {
        expect(await call($, shell(command)), command).toEqual(REACHED);
    }
    expect(seen.reached).toEqual(READING_COMMANDS.map((command) => `Bash ${command}`));
    expect(seen.runs).toEqual([]);
});

test('an edit of a marker by where the state directory lands is denied the same way', async ($, on) => {
    const seen = scene(on, {
        links: { [STATE]: `${HOME}/state/sdd` },
        dirs: [`${HOME}/state/sdd/noask.d`, `${HOME}/.claude`],
    });
    expect(await call($, edit(`${HOME}/state/sdd/noask.d/s-1`))).toEqual(denied(SWITCH_TEXT));
    expect(await call($, edit(`${HOME}/state/other`))).toEqual(REACHED);
    expect(seen.runs).toEqual([]);
});

test("under noask every door to the switch is denied with the fence's text, each counted", async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON } });
    for (const command of SWITCHING_COMMANDS) {
        expect(await call($, shell(command)), command).toEqual(fenced('switching noask'));
    }
    for (const input of SWITCHING_EDITS) {
        expect(await call($, input), described(input)).toEqual(fenced('switching noask'));
    }
    for (const command of READING_COMMANDS) {
        expect(await call($, shell(command)), command).toEqual(REACHED);
    }
    expect(argsOf(seen)).toEqual([...SWITCHING_COMMANDS, ...SWITCHING_EDITS].map(() => DENIAL_RUN));
    expect(seen.reached).toEqual(READING_COMMANDS.map((command) => `Bash ${command}`));
});

// The commands the fence's scan refuses to read. One it cannot read to its end, a push inside 200,000 nested `$(`,
// deeper than the scan follows within its work limit or its stack (hooks/fence.test.ts holds the nested `$((` of the
// review to the limit). And one in which a substitution closes on a here-document it opened and left open, which
// bash reads from the lines after the close in an order the scan does not follow. The guard denies each in every
// session, as it denies a switch, with a text of its own outside noask and the fence's under it.
const TOO_DEEP = `echo ${'$('.repeat(200_000)}git push${')'.repeat(200_000)}`;
const LEFT_OPEN = 'x=$(cat <<EOF); echo "$x"\nnoask global off\nEOF\ngit push';
const UNREAD: ReadonlyArray<readonly [FenceWhat, string, string]> = [
    ['a command too complex to read', TOO_DEEP, TOO_COMPLEX_TEXT],
    ['a here-document left open by a substitution', LEFT_OPEN, LEFT_OPEN_TEXT],
];

for (const [what, command, text] of UNREAD) {
    test(`outside noask ${what} is denied with the guard's own text, uncounted`, async ($, on) => {
        const seen = scene(on);
        expect(await call($, shell(command))).toEqual(denied(text));
        expect(seen.runs).toEqual([]);
        expect(seen.reached).toEqual([]);
    });

    test(`under noask ${what} is denied with the fence's text, counted once`, async ($, on) => {
        const seen = scene(on, { files: { [GLOBAL]: MARKER_ON } });
        expect(await call($, shell(command))).toEqual(fenced(what));
        expect(argsOf(seen)).toEqual([DENIAL_RUN]);
        expect(seen.reached).toEqual([]);
    });

    test(
        `with the fence off ${what} is denied with the guard's own text, uncounted`,
        { options: { fence: false } },
        async ($, on) => {
            const seen = scene(on, { files: { [GLOBAL]: MARKER_ON } });
            expect(await call($, shell(command))).toEqual(denied(text));
            expect(seen.runs).toEqual([]);
            expect(seen.reached).toEqual([]);
        },
    );

    test(`at handsoff ${what} is denied all the same, counted once`, async ($, on) => {
        const seen = scene(on, { files: { [OWN]: MARKER_HANDSOFF } });
        expect(await call($, shell(command))).toEqual(fenced(what));
        expect(argsOf(seen)).toEqual([DENIAL_RUN]);
        expect(seen.reached).toEqual([]);
    });
}

for (const [name, files] of [
    ["the session's own marker alone", { [OWN]: MARKER_SESSION }],
    ['the global marker', { [GLOBAL]: MARKER_ON }],
] as const) {
    test(`${name} is noask through every registration`, async ($, on) => {
        const seen = scene(on, { files });
        expect(await call($, QUESTION)).toEqual(denied(QUESTION_TEXT));
        expect(await call($, PLAN)).toEqual(denied(PLAN_TEXT));
        expect(await call($, shell('git push'))).toEqual(fenced('a push'));
        expect(await call($, watch('git push'))).toEqual(fenced('a push'));
        expect(await call($, edit(CONFIG_FILE))).toEqual(CONFIG_EDIT);
        expect(await call($, edit(GLOBAL))).toEqual(fenced('switching noask'));
        expect(argsOf(seen)).toEqual([QUESTION_RUN, DENIAL_RUN, DENIAL_RUN, DENIAL_RUN, DENIAL_RUN]);
        expect(seen.reached).toEqual([]);
    });
}

// The watch tool's command is a shell command like the shell tool's: the guard denies one that switches noask, or
// that the scan refuses to read, in every session, and under noask the fence denies a push and counts it. A watch of
// a socket holds no command and goes on.

test("outside noask a watch's switch of noask is denied with the guard's text, uncounted", async ($, on) => {
    const seen = scene(on);
    for (const command of SWITCHING_COMMANDS) {
        expect(await call($, watch(command)), command).toEqual(denied(SWITCH_TEXT));
    }
    for (const command of READING_COMMANDS) {
        expect(await call($, watch(command)), command).toEqual(REACHED);
    }
    expect(await call($, SOCKET)).toEqual(REACHED);
    expect(seen.reached).toEqual([...READING_COMMANDS.map((command) => `Monitor ${command}`), 'Monitor']);
    expect(seen.runs).toEqual([]);
});

test("under noask a watch's push and switch are fenced and counted, and a socket's watch goes on", async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON } });
    expect(await call($, watch('git push'))).toEqual(fenced('a push'));
    expect(await call($, watch('timeout 60 git push origin main'))).toEqual(fenced('a push other than a plain one'));
    expect(await call($, watch('noask global off'))).toEqual(fenced('switching noask'));
    expect(await call($, watch('tail -f build.log'))).toEqual(REACHED);
    expect(await call($, SOCKET)).toEqual(REACHED);
    expect(argsOf(seen)).toEqual([DENIAL_RUN, DENIAL_RUN, DENIAL_RUN]);
    expect(seen.reached).toEqual(['Monitor tail -f build.log', 'Monitor']);
});

test("at handsoff the main agent's watch may push as its shell may, and a subagent's may not", async ($, on) => {
    const seen = scene(on, { files: { [OWN]: MARKER_HANDSOFF } });
    expect(await call($, watch('git push -u origin b'))).toEqual(REACHED);
    expect(await call($, watch('git push -u origin b'), 'a1')).toEqual(denied(SUBAGENT_TEXT));
    expect(seen.reached).toEqual(['Monitor git push -u origin b']);
    expect(argsOf(seen)).toEqual([AGENT_DENIAL_RUN]);
});

for (const [what, command, text] of UNREAD) {
    test(`outside noask a watch of ${what} is denied with the guard's own text, uncounted`, async ($, on) => {
        const seen = scene(on);
        expect(await call($, watch(command))).toEqual(denied(text));
        expect(seen.runs).toEqual([]);
        expect(seen.reached).toEqual([]);
    });
}

for (const [marker, files] of [
    ['off', {}],
    ['on', { [GLOBAL]: MARKER_ON }],
] as const) {
    test(`with the marker ${marker} a watch hook that throws on a switch gets the guard's text`, async ($, on) => {
        const seen = scene(on, { files, refusedHomeRead: 2 });
        expect(await call($, watch('noask global on'))).toEqual(denied(SWITCH_TEXT));
        expect(seen.runs).toEqual([]);
        expect(seen.reached).toEqual([]);
    });
}

// The question refusal and the count.

test('the question is denied with the rule and counted; the plan approval is not counted', async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON } });
    expect(ASKING_TOOLS).toEqual([QUESTION.tool]);
    expect(await call($, QUESTION)).toEqual(denied(QUESTION_TEXT));
    expect(await call($, PLAN)).toEqual(denied(PLAN_TEXT));
    const root = rootOf(seen);
    expect(seen.runs.map((run) => run.argv)).toEqual([[`${root}/bin/noask`, ...QUESTION_RUN]]);
    expect(seen.runs[0]?.init).toStrictEqual({ timeoutMs: 5_000, env: { SDD_NOASK_NOW: '', SDD_NOASK_LOCK_WAIT: '' } });
});

// A subagent's plan approval is refused with the role's text, as its other refusals are, and counted nowhere.
test("a subagent's plan approval is denied with the role's text, uncounted", async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON } });
    expect(await call($, PLAN, 'a1')).toEqual(denied(SUBAGENT_TEXT));
    expect(await call($, PLAN)).toEqual(denied(PLAN_TEXT));
    expect(seen.runs).toEqual([]);
});

test("the question budget is the option's", { options: { questionBudget: 3 } }, async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON } });
    expect(await call($, QUESTION)).toEqual(denied(QUESTION_TEXT));
    expect(argsOf(seen)).toEqual([['--session', 's-1', 'count', 'question', '3']]);
});

test('an unreadable marker denies the question, the text ending on the error', async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: BAD_MARKER } });
    expect(await call($, QUESTION)).toEqual(denied(`${QUESTION_TEXT}${BAD_SUFFIX}`));
    expect(argsOf(seen)).toEqual([QUESTION_RUN]);
});

test('a spent question budget ends the turn; the plan approval keeps its text', async ($, on) => {
    scene(on, { files: { [GLOBAL]: MARKER_ON }, count: printed('counted question 6 0 0\n') });
    expect(await call($, QUESTION)).toEqual(denied(endingText('question')));
    expect(await call($, PLAN)).toEqual(denied(PLAN_TEXT));
});

test('a spent denial budget ends the turn on a push', async ($, on) => {
    scene(on, { files: { [GLOBAL]: MARKER_ON }, count: printed('counted permission 0 10 0\n') });
    expect(await call($, shell('git push'))).toEqual(denied(endingText('permission')));
});

test("a count that answers off still denies with the under-budget text, on the hook's own reading", async ($, on) => {
    scene(on, { files: { [GLOBAL]: MARKER_ON }, count: printed('off\n') });
    expect(await call($, QUESTION)).toEqual(denied(QUESTION_TEXT));
    expect(await call($, shell('git push'))).toEqual(fenced('a push'));
});

const FAILED_COUNTS: ReadonlyArray<readonly [string, Reply, string]> = [
    ["the records' lock busy", { exitCode: 1, stdout: '', stderr: `${LOCKED}\n` }, LOCKED],
    ['a run that rejects', new Error('command still running after 5000 ms'), 'command still running after 5000 ms'],
    ['a line that does not parse', printed('counted maybe\n'), 'the count printed "counted maybe\\n"'],
];

for (const [name, count, error] of FAILED_COUNTS) {
    test(`a count that fails (${name}) still denies, the failure named`, async ($, on) => {
        const seen = scene(on, { files: { [GLOBAL]: MARKER_ON }, count });
        const question = await call($, QUESTION);
        expect(question.deny).toStartWith(`${QUESTION_TEXT} (noask count failed: `);
        expect(question.deny).toEndWith(`${error})`);
        const push = await call($, shell('git push'));
        expect(push.deny).toStartWith(`${fenceText('a push')} (noask count failed: `);
        expect(push.deny).toEndWith(`${error})`);
        expect(seen.runs).toHaveLength(2);
        expect(seen.reached).toEqual([]);
    });
}

test('a session with no usable id under noask is denied, the count naming the missing id', async ($, on) => {
    const seen = scene(on, { id: new Error('no id in this test'), files: { [OTHER]: MARKER_SESSION } });
    const answer = await call($, QUESTION);
    expect(answer.deny).toStartWith(
        `${QUESTION_TEXT} (noask count failed: no session id: this session's id could not be read (`,
    );
    expect(answer.deny).toContain('no id in this test)) (noask marker unreadable: ');
    expect(answer.deny).toEndWith("while a session's own switch is on; treated as on)");
    expect(seen.runs).toEqual([]);
});

test('two refusals at once each make their own count run; the module counts nothing itself', async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON } });
    const answers = await Promise.all([call($, QUESTION), call($, QUESTION)]);
    expect(answers).toEqual([denied(QUESTION_TEXT), denied(QUESTION_TEXT)]);
    expect(argsOf(seen)).toEqual([QUESTION_RUN, QUESTION_RUN]);
    for (let refusal = 3; refusal <= 9; refusal += 1) {
        expect(await call($, QUESTION), `refusal ${refusal}`).toEqual(denied(QUESTION_TEXT));
    }
    expect(seen.runs).toHaveLength(9);
});

// The fence.

test('a push is fenced and counted as a denial; a wrapped one reaches the engine', async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON } });
    expect(await call($, shell('git push'))).toEqual(fenced('a push'));
    expect(await call($, shell("sh -c 'git push'"))).toEqual(REACHED);
    expect(argsOf(seen)).toEqual([DENIAL_RUN]);
    expect(seen.reached).toEqual(["Bash sh -c 'git push'"]);
});

test(
    'with the fence off a push reaches the engine, a question is still refused and the guard still denies',
    { options: { fence: false } },
    async ($, on) => {
        const seen = scene(on, { files: { [GLOBAL]: MARKER_ON } });
        expect(await call($, shell('git push'))).toEqual(REACHED);
        expect(await call($, edit(CONFIG_FILE))).toEqual(REACHED);
        expect(await call($, QUESTION)).toEqual(denied(QUESTION_TEXT));
        expect(await call($, shell('noask global off'))).toEqual(denied(SWITCH_TEXT));
        expect(argsOf(seen)).toEqual([QUESTION_RUN]);
    },
);

test(
    'with the fence off and the marker unreadable the guard still denies, with the error',
    { options: { fence: false } },
    async ($, on) => {
        const seen = scene(on, { files: { [GLOBAL]: BAD_MARKER } });
        expect(await call($, edit(GLOBAL))).toEqual(denied(`${SWITCH_TEXT}${BAD_SUFFIX}`));
        expect(seen.runs).toEqual([]);
    },
);

test('an edit, a write and a notebook edit under the configuration directory are fenced', async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON, [CONFIG_FILE]: '# rules\n' } });
    expect(await call($, edit(CONFIG_FILE))).toEqual(CONFIG_EDIT);
    expect(await call($, write(`${HOME}/.claude/settings.json`))).toEqual(CONFIG_EDIT);
    expect(await call($, notebook(`${HOME}/.claude/notes/x.ipynb`))).toEqual(CONFIG_EDIT);
    expect(await call($, edit(`${SESSION.cwd}/README.md`))).toEqual(REACHED);
    expect(argsOf(seen)).toEqual([DENIAL_RUN, DENIAL_RUN, DENIAL_RUN]);
});

test('an instruction file linked out of the configuration directory is fenced by its spelling', async ($, on) => {
    scene(on, {
        files: { [GLOBAL]: MARKER_ON, [`${HOME}/dotfiles/rules/x.md`]: '# rule\n' },
        links: { [`${HOME}/.claude/rules/x.md`]: `${HOME}/dotfiles/rules/x.md` },
    });
    expect(await call($, edit(`${HOME}/.claude/rules/x.md`))).toEqual(CONFIG_EDIT);
});

test('with the configuration directory a link, a file edited by its path in the checkout is fenced', async ($, on) => {
    scene(on, {
        files: { [GLOBAL]: MARKER_ON, [`${HOME}/dotfiles/claude/CLAUDE.md`]: '# rules\n' },
        links: { [`${HOME}/.claude`]: `${HOME}/dotfiles/claude` },
        dirs: [],
    });
    expect(await call($, edit(`${HOME}/dotfiles/claude/CLAUDE.md`))).toEqual(CONFIG_EDIT);
    expect(await call($, edit(`${HOME}/dotfiles/README.md`))).toEqual(REACHED);
});

test('a path elsewhere whose real path is under the configuration directory is fenced', async ($, on) => {
    scene(on, {
        files: { [GLOBAL]: MARKER_ON, [CONFIG_FILE]: '# rules\n' },
        links: { [`${SESSION.cwd}/CLAUDE.md`]: CONFIG_FILE },
    });
    expect(await call($, edit(`${SESSION.cwd}/CLAUDE.md`))).toEqual(CONFIG_EDIT);
});

test('an edit under CLAUDE_CONFIG_DIR is fenced', async ($, on) => {
    scene(on, {
        files: { [GLOBAL]: MARKER_ON },
        dirs: ['/etc/claude', `${HOME}/.claude`],
        env: { CLAUDE_CONFIG_DIR: '/etc/claude' },
    });
    expect(await call($, edit('/etc/claude/settings.json'))).toEqual(CONFIG_EDIT);
    expect(await call($, edit('/etc/hosts'))).toEqual(REACHED);
});

test('with the home unlisted a path that starts like the configuration is fenced by its spelling', async ($, on) => {
    scene(on, {
        files: { [GLOBAL]: MARKER_ON },
        dirs: [`${HOME}/.claude`, `${HOME}/.claude2/rules`],
        refuse: [`list ${HOME}`],
    });
    expect(await call($, edit(`${HOME}/.claude2/rules/x.md`))).toEqual(CONFIG_EDIT);
});

// A second profile linked out of the home, which only the listing finds.
const SECOND_PROFILE: Scene = {
    files: { [GLOBAL]: MARKER_ON, [`${HOME}/dotfiles/second-profile/rules/x.md`]: '# rule\n' },
    links: { [`${HOME}/.claude2`]: `${HOME}/dotfiles/second-profile` },
};

test("a second profile's far side is fenced while the home is listed", async ($, on) => {
    scene(on, SECOND_PROFILE);
    expect(await call($, edit(`${HOME}/dotfiles/second-profile/rules/x.md`))).toEqual(CONFIG_EDIT);
});

test("with the home unlisted a second profile's far side reaches the engine, the stated limit", async ($, on) => {
    const seen = scene(on, { ...SECOND_PROFILE, refuse: [`list ${HOME}`] });
    expect(await call($, edit(`${HOME}/dotfiles/second-profile/rules/x.md`))).toEqual(REACHED);
    expect(seen.runs).toEqual([]);
});

test('with the home listing refused the far side of a linked .claude is still fenced', async ($, on) => {
    scene(on, {
        files: { [GLOBAL]: MARKER_ON, [`${HOME}/dotfiles/claude/CLAUDE.md`]: '# rules\n' },
        links: { [`${HOME}/.claude`]: `${HOME}/dotfiles/claude` },
        dirs: [],
        refuse: [`list ${HOME}`],
    });
    expect(await call($, edit(`${HOME}/dotfiles/claude/CLAUDE.md`))).toEqual(CONFIG_EDIT);
});

test("a relative path is read against the session's directory", async ($, on) => {
    scene(on, { files: { [GLOBAL]: MARKER_ON }, cwd: HOME });
    expect(await call($, edit('.claude/CLAUDE.md'))).toEqual(CONFIG_EDIT);
    expect(await call($, edit('projects/x.md'))).toEqual(REACHED);
});

test("a relative path under a project's own .claude reaches the engine", async ($, on) => {
    scene(on, { files: { [GLOBAL]: MARKER_ON } });
    expect(await call($, edit('.claude/CLAUDE.md'))).toEqual(REACHED);
});

test('a write under folders not there yet lands where its nearest folder does', async ($, on) => {
    const seen = scene(on, {
        files: { [GLOBAL]: MARKER_ON },
        links: { [`${SESSION.cwd}/link`]: `${HOME}/.claude` },
    });
    expect(await call($, write(`${SESSION.cwd}/new/dir/file.txt`))).toEqual(REACHED);
    expect(await call($, write(`${SESSION.cwd}/link/new/file.md`))).toEqual(CONFIG_EDIT);
    expect(argsOf(seen)).toEqual([DENIAL_RUN]);
});

// The plans folder of each configuration directory, where a session in plan mode saves its plan before the plan
// approval, is the fence's one exception there: an edit below it passes, as spelled and by where it lands. The folder
// itself, a plans folder deeper in the directory and a memory note are fenced and counted as every other edit there,
// and the guard knows no exception. While the home cannot be listed, a path is judged by how it starts, a plan's too,
// and while a path cannot be placed in time, by its spelling with no exception; nor is there the exception while the
// home cannot be listed or a configuration directory cannot be resolved (the tests after the guard's below).
const PLAN_FILE = `${HOME}/.claude/plans/2026-11-20-x.md`;
const PLANS_TO_RULES: Scene = {
    files: { [GLOBAL]: MARKER_ON },
    links: { [`${HOME}/.claude/plans`]: `${HOME}/.claude/rules` },
    dirs: [`${HOME}/.claude/rules`],
};

test("an edit below a configuration directory's plans folder reaches the engine, uncounted", async ($, on) => {
    const seen = scene(on, {
        files: { [GLOBAL]: MARKER_ON, [`${HOME}/.claude3/plans/old.md`]: '# plan\n' },
        dirs: [`${HOME}/.claude/plans`, '/etc/claude/plans'],
        env: { CLAUDE_CONFIG_DIR: '/etc/claude' },
    });
    const plans = [PLAN_FILE, `${HOME}/.claude3/plans/old.md`, '/etc/claude/plans/y.md', '~/.claude/plans/z.md'];
    for (const path of plans) {
        expect(await call($, write(path)), path).toEqual(REACHED);
    }
    expect(await call($, edit(`${HOME}/.claude3/plans/old.md`))).toEqual(REACHED);
    expect(seen.runs).toEqual([]);
});

test('the plans folder itself, one deeper in the directory and a memory note are fenced and counted', async ($, on) => {
    const seen = scene(on, {
        files: { [GLOBAL]: MARKER_ON },
        dirs: [`${HOME}/.claude/plans`, `${HOME}/.claude/projects/p/memory`],
    });
    const paths = [
        `${HOME}/.claude/rules/x.md`,
        `${HOME}/.claude/projects/p/memory/MEMORY.md`,
        `${HOME}/.claude/plans`,
        `${HOME}/.claude/projects/p/plans/x.md`,
        `${HOME}/.claude/plans/../rules/x.md`,
    ];
    for (const path of paths) {
        expect(await call($, write(path)), path).toEqual(CONFIG_EDIT);
    }
    expect(argsOf(seen)).toEqual(paths.map(() => DENIAL_RUN));
});

test('a plans folder linked elsewhere into the configuration directory is fenced where it lands', async ($, on) => {
    const seen = scene(on, PLANS_TO_RULES);
    expect(await call($, edit(`${HOME}/.claude/plans/x.md`))).toEqual(CONFIG_EDIT);
    expect(argsOf(seen)).toEqual([DENIAL_RUN]);
});

test("outside noask a plans folder linked into the state directory is denied with the guard's text", async ($, on) => {
    const seen = scene(on, { links: { [`${HOME}/.claude/plans`]: STATE }, dirs: [STATE] });
    expect(await call($, edit(`${HOME}/.claude/plans/noask`))).toEqual(denied(SWITCH_TEXT));
    expect(seen.runs).toEqual([]);
});

test('under noask a plans folder linked into the state directory is a switch, counted', async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON }, links: { [`${HOME}/.claude/plans`]: STATE } });
    expect(await call($, edit(`${HOME}/.claude/plans/noask`))).toEqual(fenced('switching noask'));
    expect(argsOf(seen)).toEqual([DENIAL_RUN]);
});

test('with the home unlisted a plan is fenced by its spelling, as every path that starts like it', async ($, on) => {
    const seen = scene(on, {
        files: { [GLOBAL]: MARKER_ON },
        dirs: [`${HOME}/.claude/plans`],
        refuse: [`list ${HOME}`],
    });
    expect(await call($, write(PLAN_FILE))).toEqual(CONFIG_EDIT);
    expect(argsOf(seen)).toEqual([DENIAL_RUN]);
});

test('unplaced in time, a plan is fenced by its spelling and counted', async ($, on) => {
    const seen = scene(on, {
        files: { [GLOBAL]: MARKER_ON },
        dirs: [`${HOME}/.claude/plans`],
        hang: [`stat ${PLAN_FILE}`],
    });
    const answer = call($, write(PLAN_FILE));
    await seen.clock.settle();
    await seen.clock.advance(LOOK_TIMEOUT_MS);
    expect(await answer).toEqual(CONFIG_EDIT);
    expect(argsOf(seen)).toEqual([DENIAL_RUN]);
});

test('unplaced in time, an edit through a plans folder linked elsewhere is fenced by its spelling', async ($, on) => {
    const path = `${HOME}/.claude/plans/x.md`;
    const seen = scene(on, { ...PLANS_TO_RULES, hang: [`stat ${path}`] });
    const answer = call($, edit(path));
    await seen.clock.settle();
    await seen.clock.advance(LOOK_TIMEOUT_MS);
    expect(await answer).toEqual(CONFIG_EDIT);
    expect(argsOf(seen)).toEqual([DENIAL_RUN]);
});

test('unplaced in time, under noask a plans link into the state directory is fenced by its spelling', async ($, on) => {
    const path = `${HOME}/.claude/plans/noask`;
    const seen = scene(on, {
        files: { [GLOBAL]: MARKER_ON },
        links: { [`${HOME}/.claude/plans`]: STATE },
        hang: [`stat ${path}`],
    });
    const answer = call($, edit(path));
    await seen.clock.settle();
    await seen.clock.advance(LOOK_TIMEOUT_MS);
    expect(await answer).toEqual(CONFIG_EDIT);
    expect(argsOf(seen)).toEqual([DENIAL_RUN]);
});

// The guard judges a path it cannot place by its spelling alone, which names no state path here.
test('unplaced in time, outside noask a plans link into the state directory passes the guard', async ($, on) => {
    const path = `${HOME}/.claude/plans/noask`;
    const seen = scene(on, { links: { [`${HOME}/.claude/plans`]: STATE }, dirs: [STATE], hang: [`stat ${path}`] });
    const answer = call($, edit(path));
    await seen.clock.settle();
    await seen.clock.advance(LOOK_TIMEOUT_MS);
    expect(await answer).toEqual(REACHED);
    expect(seen.runs).toEqual([]);
});

// The exception holds only while every configuration directory is resolved and the home is listed: a directory whose
// real place is unknown may be where a plans folder that is a link leads. Here .claude is a link to /data/claude,
// whose plans folder is a link to its rules, and the edit's path is placed; only the look at .claude itself fails.
const LINKED_PLANS_TO_RULES: Scene = {
    files: { [GLOBAL]: MARKER_ON },
    links: { [`${HOME}/.claude`]: '/data/claude', '/data/claude/plans': '/data/claude/rules' },
    dirs: ['/data/claude/rules'],
};

test('with .claude unresolved in time, an edit through its plans folder is fenced by its spelling', async ($, on) => {
    const seen = scene(on, { ...LINKED_PLANS_TO_RULES, hang: [`stat ${HOME}/.claude`] });
    const answer = call($, edit(`${HOME}/.claude/plans/x.md`));
    await seen.clock.settle();
    await seen.clock.advance(LOOK_TIMEOUT_MS);
    expect(await answer).toEqual(CONFIG_EDIT);
    expect(argsOf(seen)).toEqual([DENIAL_RUN]);
});

test('with the look at .claude refused, an edit through its plans folder is fenced by its spelling', async ($, on) => {
    const seen = scene(on, { ...LINKED_PLANS_TO_RULES, refuse: [`stat ${HOME}/.claude`] });
    expect(await call($, edit(`${HOME}/.claude/plans/x.md`))).toEqual(CONFIG_EDIT);
    expect(argsOf(seen)).toEqual([DENIAL_RUN]);
});

test('with the home unlisted, a plans folder of CLAUDE_CONFIG_DIR linked elsewhere is fenced', async ($, on) => {
    const seen = scene(on, {
        files: { [GLOBAL]: MARKER_ON, [`${HOME}/dotfiles/second-profile/rules/x.md`]: '# rule\n' },
        links: {
            [`${HOME}/.claude2`]: `${HOME}/dotfiles/second-profile`,
            '/etc/claude/plans': `${HOME}/dotfiles/second-profile/rules`,
        },
        dirs: [`${HOME}/.claude`, '/etc/claude'],
        env: { CLAUDE_CONFIG_DIR: '/etc/claude' },
        refuse: [`list ${HOME}`],
    });
    expect(await call($, edit('/etc/claude/plans/x.md'))).toEqual(CONFIG_EDIT);
    expect(argsOf(seen)).toEqual([DENIAL_RUN]);
});

// A configuration directory that is not there is resolved as missing: CLAUDE_CONFIG_DIR's plans pass in a home with no
// .claude.
test('in a home with no .claude, a plan under CLAUDE_CONFIG_DIR reaches the engine, uncounted', async ($, on) => {
    const seen = scene(on, {
        files: { [GLOBAL]: MARKER_ON },
        dirs: ['/etc/claude/plans'],
        env: { CLAUDE_CONFIG_DIR: '/etc/claude' },
    });
    expect(await call($, write('/etc/claude/plans/y.md'))).toEqual(REACHED);
    expect(seen.runs).toEqual([]);
});

test('at handsoff a push behind a runner is no plain push, and is denied', async ($, on) => {
    const seen = scene(on, { files: { [OWN]: MARKER_HANDSOFF } });
    expect(await call($, shell('timeout 60 git push origin main'))).toEqual(fenced('a push other than a plain one'));
    expect(await call($, shell('nice git push'))).toEqual(fenced('a push other than a plain one'));
    expect(argsOf(seen)).toEqual([DENIAL_RUN, DENIAL_RUN]);
    expect(seen.reached).toEqual([]);
});

test('an edit or a write of a marker or a record, and an rm of a marker, are counted denials', async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON, [OWN]: MARKER_SESSION, [RECORD]: 'x\n' } });
    const inputs = [GLOBAL, OWN, RECORD].flatMap((path) => [edit(path), write(path)]);
    for (const input of [...inputs, shell('rm ~/.local/state/sdd/noask')]) {
        expect(await call($, input), described(input)).toEqual(fenced('switching noask'));
    }
    expect(argsOf(seen)).toEqual([...inputs, 'rm'].map(() => DENIAL_RUN));
});

// A subagent's refusals.

test("a subagent's push is denied with the role's text and counted on its own record", async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON } });
    expect(await call($, shell('git push'), 'a1')).toEqual(denied(SUBAGENT_TEXT));
    expect(argsOf(seen)).toEqual([AGENT_DENIAL_RUN]);
});

const AGENT_COUNTS: ReadonlyArray<readonly [string, Reply, string]> = [
    ['a spent budget', printed('counted permission 0 10 0\n'), SUBAGENT_SPENT_TEXT],
    ['a count that answers off', printed('off\n'), SUBAGENT_TEXT],
    [
        'a failed count',
        { exitCode: 1, stdout: '', stderr: `${LOCKED}\n` },
        `${SUBAGENT_TEXT} (noask count failed: ${LOCKED})`,
    ],
];

for (const [name, count, text] of AGENT_COUNTS) {
    test(`a subagent's push with ${name}`, async ($, on) => {
        scene(on, { files: { [GLOBAL]: MARKER_ON }, count });
        expect(await call($, shell('git push'), 'a1')).toEqual(denied(text));
    });
}

test("a count's note follows the main session's text", async ($, on) => {
    scene(on, {
        files: { [GLOBAL]: MARKER_ON },
        count: { exitCode: 0, stdout: 'counted none 1 0 0\n', stderr: `${NOTE}\n` },
    });
    expect(await call($, shell('git push'))).toEqual(denied(`${fenceText('a push')} (noask count: ${NOTE})`));
});

// A hook that fails: its .catch handler.

const HOOK_FAILED = ' (noask hook failed: ';

test('a question hook that throws after an on reading is denied with the rule and the failure', async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON }, rule: 'bytes once' });
    const answer = await call($, QUESTION);
    expect(answer.deny).toStartWith(`${RULE}${HOOK_FAILED}`);
    expect(answer.deny).toContain('replace');
    expect(seen.runs).toEqual([]);
    expect(seen.reached).toEqual([]);
});

// The engine names the failed call before the reason the test gave.
const REFUSED_HOME = 'the test refuses this read of HOME)';

test('a shell hook that throws after an on reading is denied with the rule and the failure', async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON }, refusedHomeRead: 2 });
    const answer = await call($, shell('git push'));
    expect(answer.deny).toStartWith(`${RULE}${HOOK_FAILED}`);
    expect(answer.deny).toEndWith(REFUSED_HOME);
    expect(seen.runs).toEqual([]);
    expect(seen.reached).toEqual([]);
});

test('a watch hook that throws after an on reading is denied with the rule and the failure', async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON }, refusedHomeRead: 2 });
    const answer = await call($, watch('git push'));
    expect(answer.deny).toStartWith(`${RULE}${HOOK_FAILED}`);
    expect(answer.deny).toEndWith(REFUSED_HOME);
    expect(seen.runs).toEqual([]);
    expect(seen.reached).toEqual([]);
});

test('a notebook hook that throws after an on reading is denied with the rule and the failure', async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON }, refusedHomeRead: 2 });
    const answer = await call($, notebook(`${SESSION.cwd}/x.ipynb`));
    expect(answer.deny).toStartWith(`${RULE}${HOOK_FAILED}`);
    expect(answer.deny).toEndWith(REFUSED_HOME);
    expect(seen.runs).toEqual([]);
    expect(seen.reached).toEqual([]);
});

test("a subagent's hook that throws is denied with the role's text and the failure", async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON }, refusedHomeRead: 2 });
    const answer = await call($, shell('git push'), 'a1');
    expect(answer.deny).toStartWith(`${SUBAGENT_TEXT}${HOOK_FAILED}`);
    expect(answer.deny).toEndWith(REFUSED_HOME);
    expect(seen.runs).toEqual([]);
});

test("a subagent's question hook that throws is denied with the role's text and the failure", async ($, on) => {
    scene(on, { files: { [GLOBAL]: MARKER_ON }, rule: 'bytes once' });
    const answer = await call($, QUESTION, 'a1');
    expect(answer.deny).toStartWith(`${SUBAGENT_TEXT}${HOOK_FAILED}`);
});

test('with the marker off a shell hook that throws lets the call through', async ($, on) => {
    const seen = scene(on, { refusedHomeRead: 2 });
    expect(await call($, shell('git push'))).toEqual(REACHED);
    expect(seen.reached).toEqual(['Bash git push']);
    expect(seen.runs).toEqual([]);
});

// The guard needs no marker, so the handler denies what it names with the switch's own text, whatever the marker
// reads, and counts nothing. Each test makes one call: the hook's own read of HOME, after the reading's, is refused.
const NAMED_BY_THE_GUARD: ReadonlyArray<readonly [string, Input]> = [
    ['noask global on', shell('noask global on')],
    ['an edit of the global marker', edit(GLOBAL)],
    ['a write of a session marker spelled with ~', write('~/.local/state/sdd/noask.d/s-1')],
    ['a notebook edit of a record', notebook(RECORD)],
];

for (const [name, input] of NAMED_BY_THE_GUARD) {
    for (const [marker, files] of [
        ['off', {}],
        ['on', { [GLOBAL]: MARKER_ON }],
    ] as const) {
        test(`with the marker ${marker} a hook that throws on ${name} gets the guard's text`, async ($, on) => {
            const seen = scene(on, { files, refusedHomeRead: 2 });
            expect(await call($, input)).toEqual(denied(SWITCH_TEXT));
            expect(seen.runs).toEqual([]);
            expect(seen.reached).toEqual([]);
        });
    }
}

// A command the scan refuses to read is named by the handler whether or not it can read HOME, since that refusal does
// not rest on the home: `[2, 3]` refuses the hook's read of HOME and the handler's own after it, and leaves the read
// of the handler's marker reading, the fourth, answered, so that with the marker off nothing else denies the call.
for (const [what, command, text] of UNREAD) {
    for (const [marker, files] of [
        ['off', {}],
        ['on', { [GLOBAL]: MARKER_ON }],
    ] as const) {
        test(`with the marker ${marker} a hook that throws on ${what} gets it`, async ($, on) => {
            const seen = scene(on, { files, refusedHomeRead: 2 });
            expect(await call($, shell(command))).toEqual(denied(text));
            expect(seen.runs).toEqual([]);
            expect(seen.reached).toEqual([]);
        });

        test(`with the marker ${marker} and HOME refused to the handler too, ${what} gets it`, async ($, on) => {
            const seen = scene(on, { files, refusedHomeRead: [2, 3] });
            expect(await call($, shell(command))).toEqual(denied(text));
            expect(seen.runs).toEqual([]);
            expect(seen.reached).toEqual([]);
        });
    }
}

// A switch is judged against the home, so a handler that cannot read HOME does not name it and goes on to its own
// reading, as it did before: with the marker off the call runs, and with it on the rule denies it.
test('with HOME refused to the handler too, a switch is left to the reading of the marker', async ($, on) => {
    const seen = scene(on, { refusedHomeRead: [2, 3] });
    expect(await call($, shell('noask global on'))).toEqual(REACHED);
    expect(seen.reached).toEqual(['Bash noask global on']);
    expect(seen.runs).toEqual([]);
});

test('with HOME refused to the handler too and the marker on, a switch is denied with the rule', async ($, on) => {
    const seen = scene(on, { files: { [GLOBAL]: MARKER_ON }, refusedHomeRead: [2, 3] });
    const answer = await call($, shell('noask global on'));
    expect(answer.deny).toStartWith(`${RULE}${HOOK_FAILED}`);
    expect(seen.reached).toEqual([]);
    expect(seen.runs).toEqual([]);
});

test('with the marker file never answering, the handler denies once the timer fires', async ($, on) => {
    const seen = scene(on, { hang: [`exists ${GLOBAL}`], rule: 'bytes once' });
    let answer: ToolCallResult | undefined;
    const pending = call($, QUESTION).then((settled) => {
        answer = settled;
    });
    await seen.clock.advance(LOOK_TIMEOUT_MS - 1);
    expect(answer).toBeUndefined();
    await seen.clock.advance(1);
    expect(answer).toBeUndefined();
    await seen.clock.advance(LOOK_TIMEOUT_MS);
    await pending;
    expect(answer?.deny).toStartWith(`${RULE}${HOOK_FAILED}`);
    expect(answer?.deny).toEndWith(' (noask marker unreadable: marker read timed out; treated as on)');
    expect(seen.reached).toEqual([]);
});

test("a failure after the call ran hands back the call's own outcome and denies nothing", async ($, on) => {
    const seen = scene(on, { files: { [OWN]: MARKER_HANDSOFF }, tool: 'reject' });
    await expect(call($, shell('git push'))).rejects.toThrow('no implementation for tool.call');
    expect(seen.reached).toEqual(['Bash git push']);
    expect(seen.runs).toEqual([]);
});

// The plan approval's hook has no call that throws before it calls next. This test pins that a failure of the call
// beneath hands back the call's own outcome, which comes back with the handler or without it: the handler's own run is
// held by no test.
test("a plan approval that fails beneath the hook hands back the call's own outcome", async ($, on) => {
    const seen = scene(on, { tool: 'reject' });
    await expect(call($, PLAN)).rejects.toThrow('no implementation for tool.call');
    expect(seen.reached).toEqual(['ExitPlanMode']);
    expect(seen.runs).toEqual([]);
});

test('with the rule file unreadable the question carries the fallback rule', async ($, on) => {
    scene(on, { files: { [GLOBAL]: MARKER_ON }, rule: 'deny' });
    const answer = await call($, QUESTION);
    expect(answer.deny).toStartWith(`${QUESTION_PREFIX}${FALLBACK_RULE} (rule file unreadable: `);
    expect(answer.deny).toEndWith('no such file in this test)');
});
