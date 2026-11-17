// Every text the sdd module shows the owner or submits to the session, in the spec's words, each listed once: the
// /noask command as the typeahead lists it, its lines and toasts, the wake-up turn and the rule text that turn
// carries. register.tsx composes them; nothing else writes one.
import type { EngineInterface } from 'claude-code';
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
