// Every text the sdd module shows the owner or submits to the session, in the spec's words, each listed once: the
// /noask command as the typeahead lists it, its lines and toasts, the wake-up turn and the rule text that turn
// carries, and the texts a refused call carries (the question, the plan approval, the fence, the guard on the switch,
// a spent budget, and what an unreadable marker, a failed count or a failed hook adds); OWNER_ONLY_LINE,
// TOO_COMPLEX_TEXT and LEFT_OPEN_TEXT carry the owner's rulings, which the spec's next revision takes up.
// register.tsx composes them; nothing else writes one. Beside them stand the texts the command's hook entries answer
// with (bin/noask holds its own copy of each, held equal to these by hooks/entry.fixtures.ts): the denied prompt, the
// continued stop, the session's start line and its context, and the terminal link's notices. The module shows a start
// line only as the command prints it, so it never formats one of those itself.
import type { EngineInterface, HookFailure } from 'claude-code';
import type { Counted, Spent } from './count';
import type { FenceWhat } from './fence';
import type { Reading } from './marker';
import { inTime } from './marker';

// The /noask command as the typeahead and /help show it.
export const COMMAND_DESCRIPTION =
    'Switch noask for this session: on [3h | until 18:00], off, or alone for the status; "on handsoff" also lets ' +
    'this session push and open a request; "global on" and "global off" switch every session on this machine.';
export const ARGUMENT_HINT = '[on [handsoff] [3h | until 18:00] | off | global on [9h | until 07:30] | global off]';

// The wake-up turn's first paragraph; an empty line and the rule text follow it.
export const WAKE_TEXT =
    'noask is on: if your last message asked the owner a question, answer it yourself under the noask rule and ' +
    'continue; if you are waiting on work of your own or have finished, change nothing and end this turn on the line ' +
    'the rule asks for';

// The rule a session gets when the rule file cannot be read: it rules nothing and blocks every choice instead.
export const FALLBACK_RULE =
    'noask is on: nobody answers until it is off, and its rule file could not be read, so rule nothing: print ' +
    '`blocked: <what>` for every choice you would ask about, do not commit on a default branch, do not push, do not ' +
    'switch noask, and end every turn on `noask: waiting: <what>`, `noask: done` or `noask: blocked: <why>` as its ' +
    'last line';

// The text of a /noask other than the bare command and `status` that did not come from the owner's own typing (the
// prompt or the bridge): nothing is run, submitted or toasted. A count is refused under the same line.
export const OWNER_ONLY_LINE = 'noask: /noask acts only when the owner types it; nothing changed';

// What a refused question carries before the rule text.
export const QUESTION_PREFIX = 'sdd noask: ';

// The refused plan approval's text.
export const PLAN_TEXT =
    "noask is on: a plan awaits the owner's review; end this turn on `noask: blocked: plan awaits review`";

// A subagent's refusal, under its budget and once the budget is spent.
export const SUBAGENT_TEXT =
    "noask is on: this action needs the owner and is denied; follow your role's rule for a denied tool";
export const SUBAGENT_SPENT_TEXT =
    "noask is on: this action needs the owner and is denied, and this agent's noask budget is spent; return under " +
    "your role's rule for a denied tool";

// The guard's text, for a call that switches noask or writes its files while the session is not under noask.
export const SWITCH_TEXT =
    "the noask switch is the owner's: it is typed as /noask in a session or as noask global in a terminal; do not " +
    'switch it or write its files; `noask` and `noask status` read it';

// The guard's text for a shell command the fence's scan could not read to its end, while the session is not under
// noask; under noask the fence's text names it. The refusal is the owner's ruling, which the spec's next revision
// takes up.
export const TOO_COMPLEX_TEXT =
    'the noask guard cannot read this command to its end: it is too long or nested too deep; write it with less ' +
    'nesting, or split it into shorter commands';

// The guard's text for a shell command in which a substitution closes on a here-document it opened and left open,
// which the fence's scan refuses to read, while the session is not under noask; under noask the fence's text names
// it. The refusal is the owner's ruling, which the spec's next revision takes up.
export const LEFT_OPEN_TEXT =
    'the noask guard does not read this command: a substitution in it closes while a here-document opened inside it ' +
    "is still open; put the here-document's body and its delimiter line before the substitution's close";

// The three lines a turn under noask ends on, and the text for a turn that ends on waiting with nothing of its own
// running: the command's Stop entry reads a message's last line for the three and continues such a turn with the
// text, from copies of its own that tests/test-noask.sh holds to these, and the three are held equal to the apply
// skill's noask reference.
export const WAITING_LINE = 'noask: waiting:';
export const DONE_LINE = 'noask: done';
export const BLOCKED_LINE = 'noask: blocked:';
export const NOTHING_RUNNING_TEXT =
    'nothing of yours is running or scheduled: `waiting` is for work of yours that will wake you, never for the ' +
    'owner; act, or end on `noask: done` or `noask: blocked: <why>`';

// The permission entry's denial for the main session, Intervention 2's words, `<the action>` standing as it is; a
// subagent's is SUBAGENT_TEXT, and a spent budget's the ending text.
export const PERMISSION_TEXT =
    'noask is on: this action needs the owner; print `blocked: <the action>` and continue with the next ' +
    'independent item';

// The stop entry's texts beside the rule text: the sentence that opens a continued stop's reason when its last line
// holds no token and an earlier line does; the one the reason ends with, after an empty line, from the sixth
// continuation on; and the block of a first stop on a machine without jq, where the entry cannot read its input.
export const LAST_LINE_TEXT = 'Your end-of-turn line must be the last line of the message; nothing follows it.';
export const SIXTH_TEXT =
    'if no tool work is left, end now with the list Rulings I made and the line ' +
    '`noask: blocked: continuation budget exhausted`; otherwise continue';
export const STOP_UNREADABLE_TEXT =
    'noask is on and its Stop hook cannot read its input (`jq` is missing): end this turn on ' +
    '`noask: blocked: stop hook unreadable`';

// The session start's line, which the session-start entry shows after `sdd: ` and the module at a resume and a fork as
// it is: the scope and the way out, then the sentences that follow it (a session's own switch after the global
// marker's line, and the notes that hold). When any follows, a full stop ends the line, and each sentence follows after
// one space; a line with none after it ends as it is. START_FAILED_LINE stands in its place in the entry's failure
// answer when the line was not built. The tails are the line's after its scope and times.
export const START_JQ_NOTE =
    "jq is not on PATH, so noask's hooks cannot tell this session from another: while any noask switch is on they " +
    'act in every session, and a stop is continued once.';
export const START_RULE_NOTE = 'The rule file could not be read, so sessions rule nothing and block every choice.';
export const START_FAILED_LINE = 'noask is ON';
const EVERY_SESSION = 'noask is ON for every session';
const THIS_SESSION = 'noask is ON for this session';
const GLOBAL_TAIL = '; sessions rule on their own recommendations and never wait; noask global off to end it';
const SESSION_TAIL = '; it rules on its own recommendations and never waits; /noask off to end it';
const HANDSOFF_TAIL =
    '; it rules on its own recommendations, never waits, and may push and open a request; /noask off to end it';

// Which switch a start line names: the global one, a session's own at either level, or both.
export type StartScope = 'global' | 'session' | 'handsoff' | 'both' | 'bothHandsoff';

// The texts of a start line's times, as the command prints them: the switch's since and until (a global switch may
// have none), and in a line of both switches the session's own until.
export type StartTimes = { readonly since: string; readonly until?: string; readonly own?: string };

// A session's own switch, named after the global marker's line: its until and its level.
export type OwnSwitch = { readonly until: string; readonly level: 'noask' | 'handsoff' };

// The sentence a session's own switch adds after the global marker's line, after the full stop that ends the line.
function ownSentence({ until, level }: OwnSwitch): string {
    return level === 'handsoff'
        ? ` This session's own switch is on too, with handsoff, until ${until}: it may push and open a request; ` +
              '/noask off ends that one.'
        : ` This session's own switch is on too until ${until}; /noask off ends that one.`;
}

// The start line of a reading that is on, for the switch the scope names, at the times given.
export function startLine(scope: 'global', times: { readonly since: string; readonly until?: string }): string;
export function startLine(
    scope: 'session' | 'handsoff',
    times: { readonly since: string; readonly until: string },
): string;
export function startLine(
    scope: 'both' | 'bothHandsoff',
    times: { readonly since: string; readonly until?: string; readonly own: string },
): string;
export function startLine(scope: StartScope, times: StartTimes): string {
    const span = times.until === undefined ? `since ${times.since}` : `since ${times.since} until ${times.until}`;
    const global = `${EVERY_SESSION} ${span}${GLOBAL_TAIL}`;
    switch (scope) {
        case 'global':
            return global;
        case 'session':
            return `${THIS_SESSION} ${span}${SESSION_TAIL}`;
        case 'handsoff':
            return `noask is ON with handsoff for this session ${span}${HANDSOFF_TAIL}`;
        case 'both':
        case 'bothHandsoff':
            return times.own === undefined
                ? global
                : `${global}.${ownSentence({ until: times.own, level: scope === 'both' ? 'noask' : 'handsoff' })}`;
        default: {
            const exhaustive: never = scope;
            return exhaustive;
        }
    }
}

// The start line of a reading that is unreadable, the global marker's or the session's own, with its reason; after
// the global marker's, the session's own switch that is on adds its sentence.
export function startUnreadableLine(scope: 'global', reason: string, own?: OwnSwitch): string;
export function startUnreadableLine(scope: 'session', reason: string): string;
export function startUnreadableLine(scope: 'global' | 'session', reason: string, own?: OwnSwitch): string {
    const unreadable: Reading = { kind: 'unreadable', error: reason };
    return scope === 'session'
        ? `${withError(THIS_SESSION, unreadable)}${SESSION_TAIL}`
        : `${withError(EVERY_SESSION, unreadable)}${GLOBAL_TAIL}${own === undefined ? '' : `.${ownSentence(own)}`}`;
}

// The start line of a session without a usable id that reads on: why it is treated as under noask.
export function startNoIdLine(reason: string): string {
    return `noask treats this session as ON: ${reason}`;
}

// The sentence that ends the session start's context, after the rule text and an empty line, for the absolute path of
// the apply skill's noask reference.
export function referenceText(path: string): string {
    return (
        `The noask reference of the apply skill is ${path}. If you drive an apply run, re-read the noask reference ` +
        'now.'
    );
}

// The session start's link step's notices, each a line of the entry's message: the terminal command added, removed,
// refused by an entry this plugin did not make, and ~/.local/bin off PATH.
export const TERMINAL_ADDED_TEXT =
    'noask: added the terminal command ~/.local/bin/noask; set sdd.terminal to off in /config to remove it.';
export const TERMINAL_REMOVED_TEXT = 'noask: removed the terminal command ~/.local/bin/noask.';
export const TERMINAL_REFUSED_TEXT =
    'noask: ~/.local/bin/noask exists and was not made by this plugin, so the terminal command was not added; remove ' +
    'it and start a new session to get it.';
export const TERMINAL_PATH_TEXT =
    'noask: ~/.local/bin is not on PATH in this session, so a terminal may not find noask; add it to PATH in your ' +
    "shell's startup file.";

// What a failed switch names when the command printed nothing.
const NO_OUTPUT = 'no output';

// The rule text, one file in the plugin beside the command.
const RULE_FILE = 'scripts/noask-rule.md';

// The newlines that end a file, which the command drops when it prints the rule text.
const FINAL_NEWLINES = /\n+$/;

export function wakeText(rule: string): string {
    return `${WAKE_TEXT}\n\n${rule}`;
}

// A switching command that exited other than 0 (done) and 2 (a wrong argument, its usage line shown as it is).
export function switchFailedLine(exitCode: number, output: string): string {
    return `noask: the switch failed (exit ${exitCode}): ${output === '' ? NO_OUTPUT : output}`;
}

// A run of a switching command that rejected: it could not start, or it outran its time and was killed.
export function switchNotRunLine(message: string): string {
    return `noask: the switch could not run: ${message}`;
}

// A run of any other form (the bare command, the status, a count) that rejected, which switched nothing.
export function commandNotRunLine(message: string): string {
    return `noask: the command could not run: ${message}`;
}

// A session's command typed where the session has no usable id; `error` is sessionIdOf's.
export function noIdLine(error: string): string {
    return `noask: ${error}; noask global on still switches every session`;
}

export function notRegisteredLine(reason: string): string {
    return `sdd: could not register /noask: ${reason}`;
}

export function notSubmittedLine(reason: string): string {
    return `sdd: the wake-up turn could not be submitted: ${reason}`;
}

// The fence's refusal of a call that needs the owner.
export function fenceText(what: FenceWhat): string {
    return (
        `noask is on: ${what} needs the owner; print \`blocked: ${what}\` and continue with the next ` +
        'independent item'
    );
}

// The main session's text once a budget is spent.
export function endingText(which: Exclude<Spent, 'none'>): string {
    return `end this turn with the list Rulings I made and the line \`noask: blocked: ${which} budget exhausted\``;
}

// `text` with an unreadable reading's error after it; every other reading leaves it as it is.
export function withError(text: string, reading: Reading): string {
    return reading.kind === 'unreadable' ? `${text} (noask marker unreadable: ${reading.error}; treated as on)` : text;
}

// `text` with a failed count's error after it, or a count's note; a count with neither leaves it as it is.
export function withCountFailure(text: string, counted: Counted): string {
    switch (counted.kind) {
        case 'failed':
            return `${text} (noask count failed: ${counted.error})`;
        case 'counted':
            return counted.note === undefined ? text : `${text} (noask count: ${counted.note})`;
        case 'off':
            return text;
        default: {
            const exhaustive: never = counted;
            return exhaustive;
        }
    }
}

// `text` with why a hook failed, for the call its `.catch` handler denies: the failure's message, or its kind when it
// carries none (a hook that ran out of time with nothing rejected).
export function withHookFailure(text: string, failure: HookFailure): string {
    return `${text} (noask hook failed: ${failure.message ?? failure.kind})`;
}

// The read of the rule file, a rejection when the call throws as it is made.
async function readRule($: Pick<EngineInterface, 'fs' | 'plugin'>): Promise<string> {
    return $.fs.read(`${$.plugin.root}/${RULE_FILE}`);
}

// The rule text the wake-up turn carries: the rule file's text without the newlines that end it, as the command
// prints it, or FALLBACK_RULE with why the file could not be read. The read is bounded by inTime, so a read that does
// not answer gives `timed out`. Never rejects.
export async function ruleText($: Pick<EngineInterface, 'fs' | 'plugin' | 'clock'>): Promise<string> {
    const read = await inTime($, readRule($));
    return read.ok ? read.value.replace(FINAL_NEWLINES, '') : `${FALLBACK_RULE} (rule file unreadable: ${read.error})`;
}
