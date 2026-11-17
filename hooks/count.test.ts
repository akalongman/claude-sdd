import type { EngineInterface, ProcessRunInit, ProcessRunResult } from 'claude-code';
import { expect, test } from 'claude-code/testing';
import { budgetsOf, countOn, DEFAULT_BUDGETS, parseCounted } from './count';

// A member of the engine no test here reaches: calling it fails the test.
function unused(): never {
    throw new Error('the test reached an engine member it does not stage');
}

// What the command's run comes to: an exit with its output, or a rejection with this message.
type Reply = { readonly exitCode: number; readonly stdout: string; readonly stderr: string } | Error;

// The session's id beneath the module, s-1 when absent, or the error its read rejects with, and the command's reply,
// `counted none 1 0 0` when absent.
type World = { readonly id?: string | Error; readonly reply?: Reply };

type Run = { readonly argv: ReadonlyArray<string>; readonly init: ProcessRunInit | undefined };

type Stage = {
    readonly engine: Pick<EngineInterface, 'process' | 'plugin' | 'session'>;
    readonly runs: ReadonlyArray<Run>;
};

function stage(world: World = {}): Stage {
    const runs: Run[] = [];
    const engine: Pick<EngineInterface, 'process' | 'plugin' | 'session'> = {
        process: {
            run: async (argv: readonly string[], init?: ProcessRunInit): Promise<ProcessRunResult> => {
                runs.push({ argv: [...argv], init });
                const reply = world.reply ?? { exitCode: 0, stdout: 'counted none 1 0 0\n', stderr: '' };
                if (reply instanceof Error) {
                    throw reply;
                }
                return { ...reply, isStdoutTruncated: false, isStderrTruncated: false };
            },
            spawn: unused,
        },
        plugin: { name: 'sdd', root: '/p' },
        session: {
            messages: unused,
            cwd: unused,
            root: unused,
            model: unused,
            turns: unused,
            id: async () => {
                if (world.id instanceof Error) {
                    throw world.id;
                }
                return world.id ?? 's-1';
            },
            repo: unused,
            surfaces: unused,
            surface: unused,
            usage: unused,
            version: unused,
            compact: unused,
            send: unused,
            append: unused,
            authorize: unused,
            identity: unused,
        },
    };
    return { engine, runs };
}

// What every run of the command is given: a limit above the command's own lock wait, and its two test seams set to
// the empty string, which it reads as unset.
const INIT = { timeoutMs: 5_000, env: { SDD_NOASK_NOW: '', SDD_NOASK_LOCK_WAIT: '' } };

// budgetsOf

test('the budgets default to 6 refused questions and 10 denials', async () => {
    expect(DEFAULT_BUDGETS).toEqual({ question: 6, denial: 10 });
    expect(budgetsOf({})).toEqual({ question: 6, denial: 10 });
});

test('a budget set to a whole number from 1 to 99999 is taken', async () => {
    expect(budgetsOf({ questionBudget: 3 })).toEqual({ question: 3, denial: 10 });
    expect(budgetsOf({ denialBudget: 1 })).toEqual({ question: 6, denial: 1 });
    expect(budgetsOf({ questionBudget: 99_999, denialBudget: 99_999 })).toEqual({ question: 99_999, denial: 99_999 });
});

test('any other value of a budget counts as its default', async () => {
    for (const value of [0, -1, 2.5, 100_000, '7', true]) {
        expect(budgetsOf({ questionBudget: value, denialBudget: value }), String(value)).toEqual(DEFAULT_BUDGETS);
    }
});

// parseCounted

test('a counted line gives what was spent', async () => {
    expect(parseCounted('counted none 1 0 0')).toEqual({ kind: 'counted', spent: 'none', note: undefined });
    expect(parseCounted('counted question 6 0 0')).toEqual({ kind: 'counted', spent: 'question', note: undefined });
    expect(parseCounted('counted permission 0 10 0')).toEqual({
        kind: 'counted',
        spent: 'permission',
        note: undefined,
    });
    expect(parseCounted('counted continuation 0 0 20')).toEqual({
        kind: 'counted',
        spent: 'continuation',
        note: undefined,
    });
    expect(parseCounted('counted none 1 0 0\n')).toEqual({ kind: 'counted', spent: 'none', note: undefined });
});

test('off gives off', async () => {
    expect(parseCounted('off')).toEqual({ kind: 'off' });
    expect(parseCounted('off\n')).toEqual({ kind: 'off' });
});

test('a line of any other form fails, with the text in the error', async () => {
    for (const text of [
        '',
        'counted none 1 0 0\ncounted none 2 0 0\n',
        'counted bogus 1 0 0',
        'counted none 1 0',
        'counted none x 0 0',
    ]) {
        const counted = parseCounted(text);
        expect(counted.kind, text).toBe('failed');
        expect(counted.kind === 'failed' ? counted.error : '', text).toContain(JSON.stringify(text));
    }
});

// countOn

test("a count runs the command for the session's id and the counter's budget", async () => {
    const world = stage();
    expect(await countOn(world.engine, undefined, 'question', DEFAULT_BUDGETS)).toEqual({
        kind: 'counted',
        spent: 'none',
        note: undefined,
    });
    expect(world.runs).toEqual([{ argv: ['/p/bin/noask', '--session', 's-1', 'count', 'question', '6'], init: INIT }]);
    expect(world.runs[0]?.init).toStrictEqual(INIT);
});

test("a subagent's count names its agent id", async () => {
    const world = stage({ reply: { exitCode: 0, stdout: 'counted permission 0 10 0\n', stderr: '' } });
    expect(await countOn(world.engine, 'a1', 'denial', DEFAULT_BUDGETS)).toEqual({
        kind: 'counted',
        spent: 'permission',
        note: undefined,
    });
    expect(world.runs).toEqual([
        { argv: ['/p/bin/noask', '--session', 's-1', '--agent', 'a1', 'count', 'denial', '10'], init: INIT },
    ]);
});

test('the budget handed over is the one counted against', async () => {
    const world = stage();
    await countOn(world.engine, undefined, 'denial', { question: 2, denial: 3 });
    expect(world.runs[0]?.argv).toEqual(['/p/bin/noask', '--session', 's-1', 'count', 'denial', '3']);
});

test('off from the command is off', async () => {
    const world = stage({ reply: { exitCode: 0, stdout: 'off\n', stderr: '' } });
    expect(await countOn(world.engine, undefined, 'question', DEFAULT_BUDGETS)).toEqual({ kind: 'off' });
});

test("the command's warning on a count that succeeded is carried as its note", async () => {
    const warning =
        'noask: the record /home/u/.local/state/sdd/budgets.d/s-1 did not parse (the record is empty); started again';
    const world = stage({ reply: { exitCode: 0, stdout: 'counted none 1 0 0\n', stderr: `${warning}\n` } });
    expect(await countOn(world.engine, undefined, 'question', DEFAULT_BUDGETS)).toEqual({
        kind: 'counted',
        spent: 'none',
        note: warning,
    });
});

test('a count the command fails is failed with its text', async () => {
    const world = stage({
        reply: { exitCode: 1, stdout: '', stderr: 'noask: the records are locked by another noask command\n' },
    });
    expect(await countOn(world.engine, undefined, 'question', DEFAULT_BUDGETS)).toEqual({
        kind: 'failed',
        error: 'noask: the records are locked by another noask command',
    });
});

test("a run that rejects is failed with the rejection's message", async () => {
    const world = stage({ reply: new Error('command still running after 5000 ms') });
    expect(await countOn(world.engine, undefined, 'question', DEFAULT_BUDGETS)).toEqual({
        kind: 'failed',
        error: 'command still running after 5000 ms',
    });
});

test('with no usable session id nothing is run', async () => {
    const rejected = stage({ id: new Error('boom') });
    expect(await countOn(rejected.engine, undefined, 'question', DEFAULT_BUDGETS)).toEqual({
        kind: 'failed',
        error: "no session id: this session's id could not be read (boom)",
    });
    expect(rejected.runs).toEqual([]);
    const reserved = stage({ id: 'count' });
    expect(await countOn(reserved.engine, undefined, 'question', DEFAULT_BUDGETS)).toEqual({
        kind: 'failed',
        error: "no session id: this session's id is not usable (count)",
    });
    expect(reserved.runs).toEqual([]);
});

test("with an agent id not of the id's form nothing is run", async () => {
    for (const agentId of ['', 'a/1', '../a1', 'a.1', 'a'.repeat(65)]) {
        const world = stage();
        expect(await countOn(world.engine, agentId, 'denial', DEFAULT_BUDGETS)).toEqual({
            kind: 'failed',
            error: `the agent id is not usable (${agentId})`,
        });
        expect(world.runs).toEqual([]);
    }
});
