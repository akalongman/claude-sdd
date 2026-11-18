// Every text the sdd module shows the owner or submits to the session, in the spec's words, each listed once: the
// /noask command as the typeahead lists it, its lines and toasts, the wake-up turn and the rule text that turn
// carries, and the texts a refused call carries (the question, the plan approval, the fence, the guard on the switch,
// a spent budget, and what an unreadable marker or a failed count adds); OWNER_ONLY_LINE is the owner's ruling, which
// the spec's next revision takes up. register.tsx composes them; nothing else writes one.
import type { EngineInterface } from 'claude-code';
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

// Shown under every `on` until the release that continues a stop and answers a prompt; step two removes it.
export const PARTIAL_LINE =
    'noask: this release refuses questions and fences outward calls only; a turn that ends on a question in plain ' +
    "text, a permission prompt and a tool server's question still wait for you";

// The text of a /noask other than the bare command and `status` that did not come from the owner's own typing (the
// prompt or the bridge): nothing is run, submitted or toasted. A count is refused under the same line.
export const OWNER_ONLY_LINE = 'noask: /noask switches only when the owner types it; nothing changed';

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

// The three lines a turn under noask ends on, and the text for a turn that ends on waiting with nothing of its own
// running; step two's Stop entry uses them, and they are held equal to the apply skill's reference from this release.
export const WAITING_LINE = 'noask: waiting:';
export const DONE_LINE = 'noask: done';
export const BLOCKED_LINE = 'noask: blocked:';
export const NOTHING_RUNNING_TEXT =
    'nothing of yours is running or scheduled: `waiting` is for work of yours that will wake you, never for the ' +
    'owner; act, or end on `noask: done` or `noask: blocked: <why>`';

// What a failed switch names when the command printed nothing.
const NO_OUTPUT = 'no output';

// The rule text, one file in the plugin beside the command.
const RULE_FILE = 'scripts/noask-rule.md';

// The newlines that end a file, which the command drops when it prints the rule text.
const FINAL_NEWLINES = /\n+$/;

export function wakeText(rule: string): string {
    return `${WAKE_TEXT}\n\n${rule}`;
}

// The text of an `on` that exited 0: the command's output, then PARTIAL_LINE on a line of its own.
export function withPartialLine(output: string): string {
    return output === '' ? PARTIAL_LINE : `${output}\n${PARTIAL_LINE}`;
}

// A switching command that exited other than 0 (done) and 2 (a wrong argument, its usage line shown as it is).
export function switchFailedLine(exitCode: number, output: string): string {
    return `noask: the switch failed (exit ${exitCode}): ${output === '' ? NO_OUTPUT : output}`;
}

// A run of the command that rejected: it could not start, or it outran its time and was killed.
export function notRunLine(message: string): string {
    return `noask: the switch could not run: ${message}`;
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
