import { expect, test } from 'claude-code/testing';
import type { Counted } from './count';
import type { FenceWhat } from './fence';
import type { Reading } from './marker';
import * as texts from './text';
import {
    ARGUMENT_HINT,
    BLOCKED_LINE,
    COMMAND_DESCRIPTION,
    DONE_LINE,
    endingText,
    FALLBACK_RULE,
    fenceText,
    LEFT_OPEN_TEXT,
    noIdLine,
    NOTHING_RUNNING_TEXT,
    notRegisteredLine,
    notRunLine,
    notSubmittedLine,
    OWNER_ONLY_LINE,
    PARTIAL_LINE,
    PLAN_TEXT,
    QUESTION_PREFIX,
    SUBAGENT_SPENT_TEXT,
    SUBAGENT_TEXT,
    SWITCH_TEXT,
    switchFailedLine,
    TOO_COMPLEX_TEXT,
    WAITING_LINE,
    WAKE_TEXT,
    wakeText,
    withCountFailure,
    withError,
    withHookFailure,
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

// The refusals' texts

test("the refusals' fixed texts are the spec's", async () => {
    expect(QUESTION_PREFIX).toBe('sdd noask: ');
    expect(PLAN_TEXT).toBe(
        "noask is on: a plan awaits the owner's review; end this turn on `noask: blocked: plan awaits review`",
    );
    expect(SUBAGENT_TEXT).toBe(
        "noask is on: this action needs the owner and is denied; follow your role's rule for a denied tool",
    );
    expect(SUBAGENT_SPENT_TEXT).toBe(
        "noask is on: this action needs the owner and is denied, and this agent's noask budget is spent; return " +
            "under your role's rule for a denied tool",
    );
    expect(SWITCH_TEXT).toBe(
        "the noask switch is the owner's: it is typed as /noask in a session or as noask global in a terminal; do " +
            'not switch it or write its files; `noask` and `noask status` read it',
    );
});

test("the guard's text for a command too complex to read is the owner's", async () => {
    expect(TOO_COMPLEX_TEXT).toBe(
        'the noask guard cannot read this command to its end: it is too long or nested too deep; write it with ' +
            'less nesting, or split it into shorter commands',
    );
});

test("the guard's text for a here-document left open by a substitution is the owner's", async () => {
    expect(LEFT_OPEN_TEXT).toBe(
        'the noask guard does not read this command: a substitution in it closes while a here-document opened ' +
            "inside it is still open; put the here-document's body and its delimiter line before the " +
            "substitution's close",
    );
    expect(fenceText('a here-document left open by a substitution')).toBe(
        'noask is on: a here-document left open by a substitution needs the owner; print ' +
            '`blocked: a here-document left open by a substitution` and continue with the next independent item',
    );
});

test("the end-of-turn lines and the text for a turn that waits on nothing are the spec's", async () => {
    expect(WAITING_LINE).toBe('noask: waiting:');
    expect(DONE_LINE).toBe('noask: done');
    expect(BLOCKED_LINE).toBe('noask: blocked:');
    expect(NOTHING_RUNNING_TEXT).toBe(
        'nothing of yours is running or scheduled: `waiting` is for work of yours that will wake you, never for ' +
            'the owner; act, or end on `noask: done` or `noask: blocked: <why>`',
    );
});

test("the fence's text names what needs the owner, twice", async () => {
    expect(fenceText('a push')).toBe(
        'noask is on: a push needs the owner; print `blocked: a push` and continue with the next independent item',
    );
});

test('the ending text names the budget that ran out', async () => {
    expect(endingText('question')).toBe(
        'end this turn with the list Rulings I made and the line `noask: blocked: question budget exhausted`',
    );
});

test('an unreadable reading adds its error to the text; every other reading leaves it as it is', async () => {
    expect(withError('the text', { kind: 'unreadable', error: 'bad level: push' })).toBe(
        'the text (noask marker unreadable: bad level: push; treated as on)',
    );
    const others: ReadonlyArray<Reading> = [
        { kind: 'off' },
        { kind: 'expired', until: '2026-11-12T07:30:00+04:00' },
        {
            kind: 'on',
            generation: '2026-11-11T23:00:12.000000000+04:00-00000000',
            since: '2026-11-11T23:00:12+04:00',
            until: undefined,
            level: 'noask',
        },
    ];
    for (const reading of others) {
        expect(withError('the text', reading), reading.kind).toBe('the text');
    }
});

test("a failed count, and a count's note, are added to the text; a count with neither leaves it", async () => {
    expect(withCountFailure('the text', { kind: 'failed', error: 'noask: the records are busy' })).toBe(
        'the text (noask count failed: noask: the records are busy)',
    );
    const noted: Counted = { kind: 'counted', spent: 'none', note: 'noask: started the record again' };
    expect(withCountFailure('the text', noted)).toBe('the text (noask count: noask: started the record again)');
    expect(withCountFailure('the text', { kind: 'counted', spent: 'question', note: undefined })).toBe('the text');
    expect(withCountFailure('the text', { kind: 'off' })).toBe('the text');
});

test("a failed hook's message is added to the text its handler denies with, or its kind when it has none", async () => {
    expect(withHookFailure('the rule', { kind: 'throw', message: 'x is not a function', budget: 1_000 })).toBe(
        'the rule (noask hook failed: x is not a function)',
    );
    expect(withHookFailure('the rule', { kind: 'timeout', budget: 1_000 })).toBe(
        'the rule (noask hook failed: timeout)',
    );
});

test('no exported text holds an em or en dash', async () => {
    const whats: ReadonlyArray<FenceWhat> = [
        'a push',
        'a pull request',
        'a merge request',
        'a push other than a plain one',
        'switching noask',
        'an edit under the configuration directory',
        'a command too complex to read',
        'a here-document left open by a substitution',
    ];
    const composed = [
        ...whats.map((what) => fenceText(what)),
        endingText('question'),
        endingText('permission'),
        endingText('continuation'),
        withError('x', { kind: 'unreadable', error: 'e' }),
        withCountFailure('x', { kind: 'failed', error: 'e' }),
        withCountFailure('x', { kind: 'counted', spent: 'none', note: 'n' }),
        withHookFailure('x', { kind: 'timeout', budget: 1_000 }),
    ];
    const fixed = Object.values(texts).filter((value): value is string => typeof value === 'string');
    expect(fixed).toContain(SWITCH_TEXT);
    expect(fixed).toContain(TOO_COMPLEX_TEXT);
    expect(fixed).toContain(LEFT_OPEN_TEXT);
    expect(fixed.length).toBeGreaterThanOrEqual(15);
    for (const text of [...fixed, ...composed]) {
        expect(/[\u2013\u2014]/.test(text), text).toBe(false);
    }
});
