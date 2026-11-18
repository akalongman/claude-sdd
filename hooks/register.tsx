// The sdd plugin's hooks module. It keeps `sdd.mainTurn`, the main loop's turn as the module last saw it, and serves
// `/noask`, the session's door to the noask command (bin/noask): registered at every session start, it runs the
// command by its argument vector and shows its lines, any form but the status only when the owner typed it, and an
// `on` typed in an idle session submits the wake-up turn. Under noask it refuses the question and the plan approval,
// and fences the shell's and the file tools' calls that need the owner (fence.ts names them), each refusal counted by
// the command (count.ts) but the plan approval's; in every session it guards the switch, denying a call that switches
// noask or writes its files. Each of those registrations carries a `.catch` handler that denies in the hook's place.
// The markers are read by marker.ts; every text the module shows is in text.ts. A subagent's turn changes nothing.
import type {
    CommandRunResult,
    CommandSpec,
    EngineInterface,
    HookFailure,
    ProcessRunInit,
    PromptOrigin,
    Register,
    SessionMessage,
} from 'claude-code';
import type { Budgets, Counter, Spent } from './count';
import { budgetsOf, countOn } from './count';
import type { FenceHit } from './fence';
import { configRoots, isPublication, isUnder, placed, shellHits, spelled, startsLikeConfig, stateRoots } from './fence';
import type { Reading } from './marker';
import { inTime, isNoask, mayPublish, messageOf, readNoask, sessionIdOf } from './marker';
import {
    ARGUMENT_HINT,
    COMMAND_DESCRIPTION,
    endingText,
    fenceText,
    noIdLine,
    notRegisteredLine,
    notRunLine,
    notSubmittedLine,
    OWNER_ONLY_LINE,
    PLAN_TEXT,
    QUESTION_PREFIX,
    ruleText,
    SUBAGENT_SPENT_TEXT,
    SUBAGENT_TEXT,
    SWITCH_TEXT,
    switchFailedLine,
    wakeText,
    withCountFailure,
    withError,
    withHookFailure,
    withPartialLine,
} from './text';

// The tools that put a question to the owner: the question tool alone, since the goal proposal is not a tool of build
// 2.1.325. Each is registered by its name, so that `claude plugin validate` lists it.
const QUESTION_TOOL = 'AskUserQuestion';
export const ASKING_TOOLS = [QUESTION_TOOL] as const;

// The state directory below the home, as the guard spells it.
const STATE_DIRECTORY = '.local/state/sdd';

// What the plugin's options make of the refusals, fixed for this activation: the budgets the count is handed, and
// whether the fence is on.
type Fence = { readonly budgets: Budgets; readonly isFenced: boolean };

// What the typed words ask, after an optional `global`: to switch a marker on or off, or anything else (the status,
// the bare command, a wrong argument), which the command answers with its own lines whatever its exit.
type Switching = 'on' | 'off' | 'none';

// What a run of the command came to: its exit and its output as the command's text, or why it did not run.
type Ran =
    | { readonly ok: true; readonly exitCode: number; readonly output: string }
    | { readonly ok: false; readonly error: string };

const COMMAND = {
    name: 'noask',
    description: COMMAND_DESCRIPTION,
    argumentHint: ARGUMENT_HINT,
    immediate: true,
} as const satisfies CommandSpec;

// Every run of the command: 10 seconds before the engine kills it and the call rejects, above the 5 seconds a switch
// waits for the lock, and the command's two test seams set to the empty string, which it reads as unset, as the
// count's runs are (count.ts), so a variable the host process inherited cannot move the command's clock.
const RUN_INIT = {
    timeoutMs: 10_000,
    env: { SDD_NOASK_NOW: '', SDD_NOASK_LOCK_WAIT: '' },
} as const satisfies ProcessRunInit;

// The exit of a run the command refused for a wrong argument, its usage line shown as it is.
const WRONG_ARGUMENT = 2;

const WHITE_SPACE = /\s+/;

function switchingOf(words: ReadonlyArray<string>): Switching {
    const [first, second] = words;
    const word = first === 'global' ? second : first;
    return word === 'on' || word === 'off' ? word : 'none';
}

// A run's output as the command's text: its standard output, then its standard error, each without the white space
// that ends it and each only when something is left, joined by one newline.
function outputOf(stdout: string, stderr: string): string {
    return [stdout.trimEnd(), stderr.trimEnd()].filter((part) => part !== '').join('\n');
}

// A toast that throws is let go: a hook's answer, and the submission that nothing awaits, must not fail on it.
function toast($: Pick<EngineInterface, 'ui'>, text: string): void {
    try {
        $.ui.toast(text);
    } catch {
        // Each toast but the registration's and the wake-up's repeats the command's text, which still shows.
    }
}

// Runs the command by its argument vector, never through a shell.
async function runCommand($: Pick<EngineInterface, 'process'>, argv: ReadonlyArray<string>): Promise<Ran> {
    try {
        const { exitCode, stdout, stderr } = await $.process.run(argv, RUN_INIT);
        return { ok: true, exitCode, output: outputOf(stdout, stderr) };
    } catch (error: unknown) {
        return { ok: false, error: messageOf(error) };
    }
}

// Whether the run came from the owner's own typing: Enter at the prompt, or a message through the bridge (the owner's
// phone or web client). A schedule or a loop, another session, a channel, another plugin, the SDK, a Slack ping and an
// automatic continuation may run only what every origin may.
function isTypedByOwner(origin: PromptOrigin): boolean {
    return origin.kind === 'composer' || origin.kind === 'bridge';
}

// What every origin may run: the bare command and `status`, the one word, which read the markers and write nothing.
// Every other form, a switch, a count or any other words, runs only when the owner typed it.
function isOpenToEveryOrigin(words: ReadonlyArray<string>): boolean {
    const [first, ...rest] = words;
    return first === undefined || (first === 'status' && rest.length === 0);
}

// The transcript, a rejection when the call throws as it is made.
async function transcriptOf($: Pick<EngineInterface, 'session'>): Promise<ReadonlyArray<SessionMessage>> {
    return $.session.messages();
}

// The main loop's turn as `sdd.mainTurn` holds it, a rejection when the call throws as it is made.
async function mainTurnOf($: Pick<EngineInterface, 'state'>): Promise<unknown> {
    return (await $.state.get({ plugin: 'sdd', key: 'mainTurn' })).value;
}

// Whether no main-loop turn is in flight, by `sdd.mainTurn` read through inTime; false when the read fails or does
// not answer in time.
async function isIdle($: Pick<EngineInterface, 'state' | 'clock'>): Promise<boolean> {
    const turn = await inTime($, mainTurnOf($));
    return turn.ok && turn.value !== 'running';
}

// The wake-up turn's text after an `on` that exited 0, WAKE_TEXT, an empty line and the rule text, or undefined when
// the session is not to take it. The session is looked at while the command runs, before its text is shown: the
// transcript first, as it is when /noask is typed, since a history may end on a question (a resumed, forked, compacted
// or cleared session) while a new session's, empty, has nothing to answer; then the rule text; then the main loop's
// turn, read last. Each look is bounded by inTime; one that fails or does not answer in time gives no turn and says
// nothing, since the switch was made and its lines are shown. Never rejects.
async function wakeTextFor(
    $: Pick<EngineInterface, 'session' | 'state' | 'fs' | 'plugin' | 'clock'>,
): Promise<string | undefined> {
    const transcript = await inTime($, transcriptOf($));
    if (!transcript.ok || transcript.value.length === 0) {
        return undefined;
    }
    const rule = await ruleText($);
    return (await isIdle($)) ? wakeText(rule) : undefined;
}

// The wake-up turn, submitted as the owner's own words once the hook has answered: the host check refuses a
// submission from a command.run hook still in flight, since it would wait on the turn the hook holds. So it waits one
// tick of the clock, reads the main loop's turn again, bounded by inTime, and submits at once when no turn is running,
// with no `$` call between that read and the submission. That narrows the window in which a turn starts between the
// look and the submission; it does not close it, and a turn that starts in it gets the wake-up turn queued behind it.
// Nothing awaits it. A wait or a read that fails gives no turn and says nothing; a submission that rejects or is
// dropped is toasted. Never rejects.
async function submitWakeUp(
    $: Pick<EngineInterface, 'clock' | 'state' | 'prompt' | 'ui'>,
    text: string,
): Promise<void> {
    try {
        await $.clock.sleep(0);
    } catch {
        return;
    }
    if (!(await isIdle($))) {
        return;
    }
    try {
        const submitted = await $.prompt.submit({ text, asUser: true });
        if (submitted.drop !== undefined) {
            toast($, notSubmittedLine(submitted.drop));
        }
    } catch (error: unknown) {
        toast($, notSubmittedLine(messageOf(error)));
    }
}

// `/noask <args>`: any form but the bare command and `status` that the owner did not type runs nothing and says so in
// OWNER_ONLY_LINE, before the session's id is read; those two run whoever asked. Otherwise the command runs with the
// words typed after `--session <the session's id>`, or after nothing for a global command in a session with no usable
// id, where a session's command runs nothing: without `--session` the command would read a status for the id in the
// host process's environment, and refuse a switch. A failed switch, its exit neither 0 nor 2, and a run that rejects
// are said twice, in the text and in a toast, and wake nothing; an `on` that exited 0 ends on the partial line, and a
// session idle with a history when it was typed gets the wake-up turn once the text is shown.
async function noask($: EngineInterface, args: string, origin: PromptOrigin): Promise<CommandRunResult> {
    const words = args.split(WHITE_SPACE).filter((word) => word !== '');
    const switching = switchingOf(words);
    if (!isOpenToEveryOrigin(words) && !isTypedByOwner(origin)) {
        return { text: OWNER_ONLY_LINE };
    }
    const session = await sessionIdOf($);
    if (!session.ok && words[0] !== 'global') {
        const line = noIdLine(session.error);
        if (switching !== 'none') {
            toast($, line);
        }
        return { text: line };
    }
    const sessionWords = session.ok ? ['--session', session.id] : [];
    const ran = await runCommand($, [`${$.plugin.root}/bin/noask`, ...sessionWords, ...words]);
    if (!ran.ok) {
        const line = notRunLine(ran.error);
        toast($, line);
        return { text: line };
    }
    if (switching !== 'none' && ran.exitCode !== 0 && ran.exitCode !== WRONG_ARGUMENT) {
        const line = switchFailedLine(ran.exitCode, ran.output);
        toast($, line);
        return { text: line };
    }
    if (switching === 'on' && ran.exitCode === 0) {
        const wakeUpText = await wakeTextFor($);
        if (wakeUpText !== undefined) {
            void submitWakeUp($, wakeUpText);
        }
        return { text: withPartialLine(ran.output) };
    }
    return { text: ran.output };
}

// The text a refused call carries. With a counter it makes one count, charged to the agent's own record when `agentId`
// is given. The role's text, SUBAGENT_TEXT for an agent and `text` for the main session, stands while nothing is spent,
// when the count answered off (the marker went off after the hook's reading, which stands), and, with the failure
// added, when the count failed; once a budget is spent the main session gets the ending text and an agent
// SUBAGENT_SPENT_TEXT. A count's note follows whichever text is returned. Without a counter (the plan approval) it
// counts nothing and returns `text`. Every return carries an unreadable reading's error. Never rejects.
export async function answerFor(
    $: Pick<EngineInterface, 'process' | 'plugin' | 'session'>,
    budgets: Budgets,
    reading: Reading,
    agentId: string | undefined,
    counter: Counter | undefined,
    text: string,
): Promise<string> {
    if (counter === undefined) {
        return withError(text, reading);
    }
    const counted = await countOn($, agentId, counter, budgets);
    const spent = counted.kind === 'counted' && counted.spent !== 'none' ? counted.spent : undefined;
    return withError(withCountFailure(roleText(text, agentId, spent), counted), reading);
}

// The role's text for a counted intervention: the caller's own for the main session and SUBAGENT_TEXT for an agent,
// or, once a budget is spent, the ending text and SUBAGENT_SPENT_TEXT.
function roleText(text: string, agentId: string | undefined, spent: Exclude<Spent, 'none'> | undefined): string {
    if (spent === undefined) {
        return agentId === undefined ? text : SUBAGENT_TEXT;
    }
    return agentId === undefined ? endingText(spent) : SUBAGENT_SPENT_TEXT;
}

// A hook's answer: the call goes on when there is no denial, else it is refused with the text.
function decided<R>(deny: string | undefined, goOn: () => R): R | { readonly deny: string } {
    return deny === undefined ? goOn() : { deny };
}

// HOME as a hook reads it; unset reads as empty.
async function homeOf($: Pick<EngineInterface, 'env'>): Promise<string> {
    return (await $.env.get('HOME')) ?? '';
}

// The directory a path is read against: the session's for a relative path, read only then.
async function directoryFor($: Pick<EngineInterface, 'session'>, path: string): Promise<string> {
    return path.startsWith('/') || path === '~' || path.startsWith('~/') ? '/' : $.session.cwd();
}

function isSwitching(hit: FenceHit): boolean {
    return hit.what === 'switching noask';
}

// Under noask the question is refused with the rule text, prefixed, and counted against the question budget.
async function questionDenial(
    $: EngineInterface,
    fence: Fence,
    agentId: string | undefined,
): Promise<string | undefined> {
    const reading = await readNoask($);
    if (!isNoask(reading)) {
        return undefined;
    }
    return answerFor($, fence.budgets, reading, agentId, 'question', `${QUESTION_PREFIX}${await ruleText($)}`);
}

// Under noask the plan approval is refused with PLAN_TEXT, counted nowhere, so it keeps its text once a budget is
// spent and the morning reads that a plan waits.
async function planDenial($: EngineInterface, fence: Fence, agentId: string | undefined): Promise<string | undefined> {
    const reading = await readNoask($);
    return isNoask(reading) ? answerFor($, fence.budgets, reading, agentId, undefined, PLAN_TEXT) : undefined;
}

// The guard's denial of a call that switches noask or writes its files: under noask with the fence on, the fence's
// text and a count; otherwise the switch's own text, counted nowhere.
async function guardDenial(
    $: EngineInterface,
    fence: Fence,
    reading: Reading,
    agentId: string | undefined,
): Promise<string> {
    return isNoask(reading) && fence.isFenced
        ? answerFor($, fence.budgets, reading, agentId, 'denial', fenceText('switching noask'))
        : withError(SWITCH_TEXT, reading);
}

// A shell call: the guard first, on a call any of whose hits switches noask; then, under noask with the fence on, a
// hit that is no publication denies the whole call with its text, and a call whose hits are all publications passes,
// uncounted, for the main agent of a session at handsoff and is denied with its first hit's text otherwise.
async function shellDenial(
    $: EngineInterface,
    fence: Fence,
    command: string,
    agentId: string | undefined,
): Promise<string | undefined> {
    const reading = await readNoask($);
    const hits = shellHits(command, await homeOf($));
    if (hits.some(isSwitching)) {
        return guardDenial($, fence, reading, agentId);
    }
    const [first] = hits;
    if (!isNoask(reading) || !fence.isFenced || first === undefined) {
        return undefined;
    }
    const held = hits.find((hit) => !isPublication(hit));
    if (held === undefined && agentId === undefined && (await mayPublish($))) {
        return undefined;
    }
    return answerFor($, fence.budgets, reading, agentId, 'denial', fenceText((held ?? first).what));
}

// An edit, a write or a notebook edit, its path judged as spelled and as placed: the guard first, on a path under the
// state directory; then, under noask with the fence on, a path under the configuration directory, or, while the home
// cannot be listed, a spelled path that starts like it. A path that cannot be placed is judged by its spelling alone.
async function editDenial(
    $: EngineInterface,
    fence: Fence,
    path: string,
    agentId: string | undefined,
): Promise<string | undefined> {
    const reading = await readNoask($);
    const home = await homeOf($);
    const spelledPath = spelled(path, home, await directoryFor($, path));
    const [states, placedPath] = await Promise.all([stateRoots($, home), placed($, spelledPath)]);
    const paths = placedPath === undefined ? [spelledPath] : [spelledPath, placedPath];
    if (paths.some((each) => isUnder(each, states))) {
        return guardDenial($, fence, reading, agentId);
    }
    if (!isNoask(reading) || !fence.isFenced) {
        return undefined;
    }
    const config = await configRoots($, home);
    const isConfig =
        paths.some((each) => isUnder(each, config.roots)) || (!config.isListed && startsLikeConfig(spelledPath, home));
    if (!isConfig) {
        return undefined;
    }
    const what = 'an edit under the configuration directory';
    return answerFor($, fence.budgets, reading, agentId, 'denial', fenceText(what));
}

// What the guard names by its words alone, with no file call and no read of a marker: a shell command one of whose
// hits switches noask, or a path spelled under the state directory as spelled. False when HOME or the session's
// directory cannot be read, or the scan throws; the handler then goes on to its own reading.
async function isNamedByGuard(
    $: Pick<EngineInterface, 'env' | 'session'>,
    call: { readonly command: string } | { readonly path: string },
): Promise<boolean> {
    try {
        const home = await homeOf($);
        if ('command' in call) {
            return shellHits(call.command, home).some(isSwitching);
        }
        const spelledPath = spelled(call.path, home, await directoryFor($, call.path));
        return isUnder(spelledPath, [spelled(STATE_DIRECTORY, home, home)]);
    } catch {
        return false;
    }
}

// The denial of a `.catch` handler for a hook that failed before its call ran. A call the guard names by its words is
// denied with the switch's own text, whatever the marker reads, since the handler cannot count; otherwise, under noask
// on the handler's own reading, with the rule text (SUBAGENT_TEXT for an agent) and the failure. Undefined lets the
// call go on.
async function caughtDenial(
    $: EngineInterface,
    agentId: string | undefined,
    failure: HookFailure,
    isNamed: boolean,
): Promise<string | undefined> {
    if (isNamed) {
        return SWITCH_TEXT;
    }
    const reading = await readNoask($);
    if (!isNoask(reading)) {
        return undefined;
    }
    const lead = agentId === undefined ? await ruleText($) : SUBAGENT_TEXT;
    return withError(withHookFailure(lead, failure), reading);
}

export const register: Register = (on, options) => {
    const fence: Fence = { budgets: budgetsOf(options), isFenced: options['fence'] !== false };
    // The refusals, the fence and the guard: one registration per tool, each with its `.catch` handler, which returns
    // the call's own result once the hook had called next, since a denial then would undo nothing.
    on('tool.call', { tool: QUESTION_TOOL }, async ($, e, next) =>
        decided(await questionDenial($, fence, e.agentId), () => next(e)),
    ).catch(async ($, e, next) =>
        next.called ? next(e) : decided(await caughtDenial($, e.agentId, next.error, false), () => next(e)),
    );
    on('tool.call', { tool: 'ExitPlanMode' }, async ($, e, next) =>
        decided(await planDenial($, fence, e.agentId), () => next(e)),
    ).catch(async ($, e, next) =>
        next.called ? next(e) : decided(await caughtDenial($, e.agentId, next.error, false), () => next(e)),
    );
    on('tool.call', { tool: 'Bash' }, async ($, e, next) =>
        decided(await shellDenial($, fence, e.command, e.agentId), () => next(e)),
    ).catch(async ($, e, next) => {
        if (next.called) {
            return next(e);
        }
        const isNamed = await isNamedByGuard($, { command: e.command });
        return decided(await caughtDenial($, e.agentId, next.error, isNamed), () => next(e));
    });
    on('tool.call', { tool: 'Edit' }, async ($, e, next) =>
        decided(await editDenial($, fence, e.file_path, e.agentId), () => next(e)),
    ).catch(async ($, e, next) => {
        if (next.called) {
            return next(e);
        }
        const isNamed = await isNamedByGuard($, { path: e.file_path });
        return decided(await caughtDenial($, e.agentId, next.error, isNamed), () => next(e));
    });
    on('tool.call', { tool: 'Write' }, async ($, e, next) =>
        decided(await editDenial($, fence, e.file_path, e.agentId), () => next(e)),
    ).catch(async ($, e, next) => {
        if (next.called) {
            return next(e);
        }
        const isNamed = await isNamedByGuard($, { path: e.file_path });
        return decided(await caughtDenial($, e.agentId, next.error, isNamed), () => next(e));
    });
    on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) =>
        decided(await editDenial($, fence, e.notebook_path, e.agentId), () => next(e)),
    ).catch(async ($, e, next) => {
        if (next.called) {
            return next(e);
        }
        const isNamed = await isNamedByGuard($, { path: e.notebook_path });
        return decided(await caughtDenial($, e.agentId, next.error, isNamed), () => next(e));
    });
    // `session.start` runs again at every reload of the plugin, so the command is registered there each time; the
    // engine replaces a name registered again, and only a refusal is toasted.
    on('session.start', async ($, e, next) => {
        try {
            await $.command.register(COMMAND);
        } catch (error: unknown) {
            toast($, notRegisteredLine(messageOf(error)));
        }
        return next(e);
    });
    on('turn.start', async ($, e, next) => {
        if (e.agentId === undefined) {
            await $.state.set({ plugin: 'sdd', key: 'mainTurn' }, 'running');
        }
        return next(e);
    });
    on('turn.complete', async ($, e, next) => {
        if (e.agentId === undefined) {
            await $.state.set({ plugin: 'sdd', key: 'mainTurn' }, 'complete');
        }
        return next(e);
    });
    // The command has no behaviour but this hook's, so next is never called. Registered with `immediate`, it may run
    // while a turn is streaming; the wake-up then finds the turn running and submits nothing.
    on('command.run', { command: 'noask' }, ($, e) => noask($, e.args, e.origin));
};
