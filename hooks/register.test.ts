import type {
    CommandSpec,
    On,
    ProcessRunInit,
    PromptOrigin,
    PromptSubmitInput,
    SessionMessage,
    TurnCompleteInput,
    TurnStartInput,
} from 'claude-code';
import type { Engine, MockClock, Plugin } from 'claude-code/testing';
import { expect, mock, test } from 'claude-code/testing';
import { FALLBACK_RULE, PARTIAL_LINE, WAKE_TEXT } from './text';

// A plugin beside sdd that reads `sdd.mainTurn` as a later hook does, and answers a run of /main-turn with what it
// read: the value, or `undefined` for a value never written.
const READER: Plugin = {
    name: 'reader',
    register(on) {
        on('command.run', async ($, e, next) => {
            if (e.command !== 'main-turn') {
                return next(e);
            }
            const held = await $.state.get({ plugin: 'sdd', key: 'mainTurn' });
            return { text: held.value ?? 'undefined' };
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
// its line, the marker's path, an empty line and the rule text; anything it does not take is a wrong argument.
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
    return { exitCode: 2, stdout: '', stderr: `${USAGE}\n` };
}

// The session's history: a question asked and not answered.
const HISTORY: ReadonlyArray<SessionMessage> = [
    { role: 'user', text: 'Refactor the importer.', toolUses: [] },
    { role: 'assistant', text: 'Should the old importer stay as a fallback?', toolUses: [] },
];

// What the world beneath the plugin answers. Absent: the registration succeeds, the session's id is s-1, the command
// answers as noaskReply does, the transcript holds HISTORY, the rule file holds RULE_FILE_TEXT, `$.state` is the kit's
// and every submission enters. `messages` as a function is asked at each read of the transcript, and answers when what
// it returns does; `rule: 'hang'` is a read that never answers, and a promise one that answers when the test settles
// it; `turn: 'deny'` refuses `$.state.get`, and a function is asked at each read of the turn and answers when what it
// returns does; `submit: 'reject'` is a submission that rejects.
type World = {
    readonly register?: 'deny';
    readonly id?: string | Error;
    readonly reply?: Reply;
    readonly messages?:
        | ReadonlyArray<SessionMessage>
        | 'deny'
        | (() => ReadonlyArray<SessionMessage> | Promise<ReadonlyArray<SessionMessage>>);
    readonly rule?: string | 'deny' | 'hang' | Promise<string>;
    readonly turn?: 'deny' | (() => string | Promise<string>);
    readonly submit?: 'drop' | 'reject';
};

// A promise the test settles itself: an answer of the world beneath that comes late, or never.
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((settle) => {
        resolve = settle;
    });
    return { promise, resolve };
}

type Run = { readonly argv: ReadonlyArray<string>; readonly init: ProcessRunInit | undefined };

type Stage = {
    readonly clock: MockClock;
    readonly registered: CommandSpec[];
    readonly toasts: string[];
    readonly runs: Run[];
    readonly reads: string[];
    readonly submits: PromptSubmitInput[];
};

function stage(on: On, world: World = {}): Stage {
    const recorded: Stage = {
        clock: mock.clock(on),
        registered: [],
        toasts: [],
        runs: [],
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
    on('session.id', () => (world.id instanceof Error ? { deny: world.id.message } : { value: world.id ?? 's-1' }));
    on('process.run', (_$, e) => {
        recorded.runs.push({ argv: [...e.argv], init: e.init });
        const reply = world.reply ?? noaskReply(e.argv.slice(1));
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
        on('state.get', () => ({ deny: 'no state in this test' }));
    } else if (turn !== undefined) {
        on('state.get', async () => ({ value: { value: await turn(), version: 1 } }));
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
function rootOf(world: Stage): string {
    const program = world.runs[0]?.argv[0] ?? '';
    expect(program).toMatch(/^\/.+\/bin\/noask$/);
    return program.slice(0, -'/bin/noask'.length);
}

// The arguments of each run after the program.
function argsOf(world: Stage): ReadonlyArray<ReadonlyArray<string>> {
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

test("with no usable id a session's command runs nothing, and a switch typed says so twice", async ($, on) => {
    const world = stage(on, { id: new Error('no id in this test') });
    await idle($);
    const expectNoIdLine = (text: string | undefined): void => {
        expect(text).toStartWith("noask: this session's id could not be read (");
        expect(text).toEndWith('no id in this test); noask global on still switches every session');
    };
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
    expect(await noask($, 'global on')).toBe(`${GLOBAL_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
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
    expect(await noask($, 'on')).toBe(`${ALREADY_ON}\n${PARTIAL_LINE}`);
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
    expect(await answer).toBe(`${SESSION_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
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
    expect(text).toBe(`${SESSION_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a turn state that cannot be read submits nothing and fails nothing', async ($, on) => {
    const world = stage(on, { turn: 'deny' });
    await $.session.start(SESSION);
    const text = await noask($, 'on');
    await world.clock.settle();
    expect(text).toBe(`${SESSION_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

// The session is looked at while the command runs, before its text is shown: the transcript first, as it is when
// /noask is typed, then the rule text, then the turn, each look bounded to 2 seconds.

test('a transcript that holds a history only once the command answered gets no turn', async ($, on) => {
    let transcript: ReadonlyArray<SessionMessage> = [];
    const world = stage(on, { messages: () => transcript });
    await idle($);
    const text = await noask($, 'on');
    transcript = HISTORY;
    await world.clock.settle();
    expect(text).toBe(`${SESSION_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a turn that starts while the transcript is read gets no wake-up turn behind it', async ($, on) => {
    const transcript = deferred<ReadonlyArray<SessionMessage>>();
    const world = stage(on, { messages: () => transcript.promise });
    await idle($);
    const answer = noask($, 'on');
    await world.clock.settle();
    await $.turn.start(turnStart('t2'));
    transcript.resolve(HISTORY);
    expect(await answer).toBe(`${SESSION_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a turn that starts while the transcript is read gets no turn, even when it ends at once', async ($, on) => {
    const transcript = deferred<ReadonlyArray<SessionMessage>>();
    const world = stage(on, { messages: () => transcript.promise });
    await idle($);
    const answer = noask($, 'on');
    await world.clock.settle();
    await $.turn.start(turnStart('t2'));
    transcript.resolve(HISTORY);
    expect(await answer).toBe(`${SESSION_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
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
    expect(await answer).toBe(`${SESSION_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a transcript that does not answer in 2 seconds wakes nothing, nor when it answers later', async ($, on) => {
    const transcript = deferred<ReadonlyArray<SessionMessage>>();
    const world = stage(on, { messages: () => transcript.promise });
    await idle($);
    const answer = noask($, 'on');
    await world.clock.advance(1_999);
    expect(world.submits).toEqual([]);
    await world.clock.advance(1);
    expect(await answer).toBe(`${SESSION_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
    expect(world.submits).toEqual([]);
    transcript.resolve(HISTORY);
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a turn state that does not answer in 2 seconds wakes nothing, nor when it answers later', async ($, on) => {
    const turn = deferred<string>();
    const world = stage(on, { turn: () => turn.promise });
    await $.session.start(SESSION);
    const answer = noask($, 'on');
    await world.clock.advance(1_999);
    expect(world.submits).toEqual([]);
    await world.clock.advance(1);
    expect(await answer).toBe(`${SESSION_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
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
    expect(await noask($, 'on')).toBe(`${SESSION_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
    await $.turn.start(turnStart('t2'));
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a turn running when /noask on is typed gets no turn, even when it ends before the submission', async ($, on) => {
    const world = stage(on);
    await $.session.start(SESSION);
    await $.turn.start(turnStart('t1'));
    expect(await noask($, 'on')).toBe(`${SESSION_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
    await $.turn.complete(turnComplete('t1'));
    await world.clock.settle();
    expect(world.submits).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a turn read before the submission that does not answer in 2 seconds wakes nothing', async ($, on) => {
    const late = deferred<string>();
    const reads: string[] = [];
    const world = stage(on, {
        turn: () => {
            reads.push('turn');
            return reads.length === 1 ? 'complete' : late.promise;
        },
    });
    await $.session.start(SESSION);
    expect(await noask($, 'on')).toBe(`${SESSION_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
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

test('a submission that rejects raises a toast with the message', async ($, on) => {
    const world = stage(on, { submit: 'reject' });
    await idle($);
    await noask($, 'on');
    await world.clock.settle();
    expect(world.submits).toHaveLength(1);
    expect(world.toasts).toHaveLength(1);
    expect(world.toasts[0]).toMatch(/^sdd: the wake-up turn could not be submitted: \S/);
});

for (const args of ['on', 'off', 'global on', 'global off', 'on handsoff 3h']) {
    test(`/noask ${args} that exits 1 is a failed switch, said twice, and wakes nothing`, async ($, on) => {
        const failed = `noask: the switch failed (exit 1): ${CANNOT_WRITE}`;
        const world = stage(on, { reply: { exitCode: 1, stdout: '', stderr: `${CANNOT_WRITE}\n` } });
        await idle($);
        const text = await noask($, args);
        await world.clock.settle();
        expect(text).toBe(failed);
        expect(text).not.toContain(PARTIAL_LINE);
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

// The partial line also ends the text of an `on` that changed nothing: the test above with ALREADY_ON pins it.
test('every on that exits 0 ends on the partial line', async ($, on) => {
    const world = stage(on);
    await $.session.start(SESSION);
    expect(await noask($, 'on')).toBe(`${SESSION_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
    expect(await noask($, 'on handsoff 3h')).toBe(`${HANDSOFF_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
    expect(await noask($, 'global on 9h')).toBe(`${GLOBAL_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
    expect(world.toasts).toEqual([]);
});

// An `on` that exits 1 does not carry it either: the failed-switch tests above pin it.
test('a status, an off and an on refused with exit 2 do not carry the partial line', async ($, on) => {
    const world = stage(on);
    await $.session.start(SESSION);
    const texts = [await noask($, ''), await noask($, 'off'), await noask($, 'global off'), await noask($, 'on 9x')];
    expect(texts).toEqual(['noask: off', 'noask: off for this session', 'noask: off for every session', USAGE]);
    for (const text of texts) {
        expect(text).not.toContain(PARTIAL_LINE);
    }
    expect(world.toasts).toEqual([]);
});

// Who typed it: a switch runs only when the owner typed it, at the prompt or through the bridge; from anywhere else the
// command's text is the one line below, written out here once more, and a status still runs.
const OWNER_ONLY = 'noask: /noask switches only when the owner types it; nothing changed';
const BRIDGE: PromptOrigin = { kind: 'bridge' };
const NOT_THE_OWNER: ReadonlyArray<PromptOrigin> = [
    { kind: 'scheduled-trigger' },
    { kind: 'peer' },
    { kind: 'plugin', name: 'other' },
];

for (const origin of NOT_THE_OWNER) {
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
        await world.clock.settle();
        expect(argsOf(world)).toEqual([
            ['--session', 's-1'],
            ['--session', 's-1', 'status'],
        ]);
        expect(world.toasts).toEqual([]);
        expect(world.submits).toEqual([]);
    });
}

test('a switch not typed by the owner is refused before the session id is read', async ($, on) => {
    const world = stage(on, { id: new Error('no id in this test') });
    await $.session.start(SESSION);
    expect(await noask($, 'on', { kind: 'peer' })).toBe(OWNER_ONLY);
    expect(await noask($, 'global off', { kind: 'scheduled-trigger' })).toBe(OWNER_ONLY);
    expect(world.runs).toEqual([]);
    expect(world.toasts).toEqual([]);
});

test('a switch typed through the bridge runs as one typed at the prompt', async ($, on) => {
    const world = stage(on);
    await idle($);
    expect(await noask($, 'on', BRIDGE)).toBe(`${SESSION_ON}\n\n${RULE}\n${PARTIAL_LINE}`);
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
