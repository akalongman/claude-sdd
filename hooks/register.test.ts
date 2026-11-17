import type { TurnCompleteInput, TurnStartInput } from 'claude-code';
import type { Engine, Plugin } from 'claude-code/testing';
import { expect, test } from 'claude-code/testing';

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
