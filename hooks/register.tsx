// The sdd plugin's hooks module. In this step it keeps `sdd.mainTurn`, the main loop's turn as the module last saw
// it, and serves `/noask`, the session's door to the noask command (bin/noask): registered at every session start, it
// runs the command by its argument vector and shows its lines, any form but the status only when the owner typed it,
// and an `on` typed in an idle session submits the wake-up turn. The markers' reader (marker.ts) and the count's caller
// (count.ts) are the parts the later hooks are built from; every text the module shows is in text.ts. A subagent's
// turn changes nothing.
import type {
    CommandRunResult,
    CommandSpec,
    EngineInterface,
    ProcessRunInit,
    PromptOrigin,
    Register,
    SessionMessage,
} from 'claude-code';
import { inTime, messageOf, sessionIdOf } from './marker';
import {
    ARGUMENT_HINT,
    COMMAND_DESCRIPTION,
    noIdLine,
    notRegisteredLine,
    notRunLine,
    notSubmittedLine,
    OWNER_ONLY_LINE,
    ruleText,
    switchFailedLine,
    wakeText,
    withPartialLine,
} from './text';

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

export const register: Register = (on) => {
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
