import { expect, test } from 'claude-code/testing';
import {
    ARGUMENT_HINT,
    COMMAND_DESCRIPTION,
    FALLBACK_RULE,
    noIdLine,
    notRegisteredLine,
    notRunLine,
    notSubmittedLine,
    OWNER_ONLY_LINE,
    PARTIAL_LINE,
    switchFailedLine,
    WAKE_TEXT,
    wakeText,
    withPartialLine,
} from './text';

// The texts are the spec's, word for word: each is written out here once more, so an edit to one shows as a failure.
// ruleText is tested through the /noask hook in register.test.ts, where its read and its timer run through the kit.

test("the wake-up turn's first paragraph is the spec's", async () => {
    expect(WAKE_TEXT).toBe(
        'noask is on: if your last message asked the owner a question, answer it yourself under the noask rule and ' +
            'continue; if you are waiting on work of your own or have finished, change nothing and end this turn on ' +
            'the line the rule asks for',
    );
});

test("the fallback rule is the spec's", async () => {
    expect(FALLBACK_RULE).toBe(
        'noask is on: nobody answers until it is off, and its rule file could not be read, so rule nothing: print ' +
            '`blocked: <what>` for every choice you would ask about, do not commit on a default branch, do not ' +
            'push, do not switch noask, and end every turn on `noask: waiting: <what>`, `noask: done` or ' +
            '`noask: blocked: <why>` as its last line',
    );
});

test("the partial line is the spec's", async () => {
    expect(PARTIAL_LINE).toBe(
        'noask: this release refuses questions and fences outward calls only; a turn that ends on a question in ' +
            "plain text, a permission prompt and a tool server's question still wait for you",
    );
});

test("the command's description and argument hint are the spec's", async () => {
    expect(COMMAND_DESCRIPTION).toBe(
        'Switch noask for this session: on [3h | until 18:00], off, or alone for the status; "on handsoff" also ' +
            'lets this session push and open a request; "global on" and "global off" switch every session on this ' +
            'machine.',
    );
    expect(ARGUMENT_HINT).toBe('[on [handsoff] [3h | until 18:00] | off | global on [9h | until 07:30] | global off]');
});

test('the wake-up turn is WAKE_TEXT, an empty line and the rule text', async () => {
    expect(wakeText('the rule')).toBe(`${WAKE_TEXT}\n\nthe rule`);
});

test('the partial line follows the output on a line of its own, and stands alone after none', async () => {
    expect(withPartialLine('noask: on for this session\nmarker: /m')).toBe(
        `noask: on for this session\nmarker: /m\n${PARTIAL_LINE}`,
    );
    expect(withPartialLine('')).toBe(PARTIAL_LINE);
});

test("the command's failure lines", async () => {
    expect(switchFailedLine(1, 'noask: cannot write /m')).toBe(
        'noask: the switch failed (exit 1): noask: cannot write /m',
    );
    expect(switchFailedLine(137, '')).toBe('noask: the switch failed (exit 137): no output');
    expect(notRunLine('spawn ENOENT')).toBe('noask: the switch could not run: spawn ENOENT');
    expect(noIdLine("this session's id could not be read (boom)")).toBe(
        "noask: this session's id could not be read (boom); noask global on still switches every session",
    );
});

test("a /noask the owner did not type is refused in the owner's words", async () => {
    expect(OWNER_ONLY_LINE).toBe('noask: /noask switches only when the owner types it; nothing changed');
});

test("the module's own toasts", async () => {
    expect(notRegisteredLine('taken')).toBe('sdd: could not register /noask: taken');
    expect(notSubmittedLine('a Stop stands')).toBe('sdd: the wake-up turn could not be submitted: a Stop stands');
});
