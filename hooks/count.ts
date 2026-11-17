// The module's caller of the noask command's count entry (bin/noask's header states it): a refused question or a
// denial is charged to the session's record, or to its subagent's, by the command, which alone writes the records.
// The module hands over the budget from its options, so the command reads no settings.
import type { EngineInterface, PluginOptions } from 'claude-code';
import { ID_FORM, messageOf, sessionIdOf } from './marker';

export type Counter = 'question' | 'denial';

// What the record has spent, as the command prints it: nothing yet, or the budget that ran out.
export type Spent = 'none' | 'question' | 'permission' | 'continuation';

// What a count came to: the record as it then stands, with the command's warning when it gave one (a record that
// did not parse was started again); off, the session not under noask; or why the count failed.
export type Counted =
    | { readonly kind: 'counted'; readonly spent: Spent; readonly note: string | undefined }
    | { readonly kind: 'off' }
    | { readonly kind: 'failed'; readonly error: string };

export type Budgets = { readonly question: number; readonly denial: number };

export const DEFAULT_BUDGETS: Budgets = { question: 6, denial: 10 };

// The largest budget the command takes: a budget is a whole number from 1 to 99999.
const BUDGET_MAX = 99_999;

// How long a count may run before the engine kills it, and the call rejects: above the 2 seconds the command waits
// for the records' lock.
const COUNT_TIMEOUT_MS = 5_000;

const SPENTS: ReadonlyArray<Spent> = ['none', 'question', 'permission', 'continuation'];

// The two lines a count prints on standard output: off, or the record's spent and its three counters.
const OFF_LINE = /^off\n?$/;
const COUNTED_LINE = /^counted ([a-z]+) (?:0|[1-9][0-9]{0,4}) (?:0|[1-9][0-9]{0,4}) (?:0|[1-9][0-9]{0,4})\n?$/;

// A budget option's value when it is a whole number from 1 to BUDGET_MAX, else `fallback`.
function budgetOf(value: PluginOptions[string] | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= BUDGET_MAX ? value : fallback;
}

export function budgetsOf(options: PluginOptions): Budgets {
    return {
        question: budgetOf(options['questionBudget'], DEFAULT_BUDGETS.question),
        denial: budgetOf(options['denialBudget'], DEFAULT_BUDGETS.denial),
    };
}

// What a count's standard output says: 'failed' for a line of any other form, with the text.
export function parseCounted(stdout: string): Counted {
    if (OFF_LINE.test(stdout)) {
        return { kind: 'off' };
    }
    const word = COUNTED_LINE.exec(stdout)?.[1];
    const spent = SPENTS.find((each) => each === word);
    return spent === undefined
        ? { kind: 'failed', error: `the count printed ${JSON.stringify(stdout)}` }
        : { kind: 'counted', spent, note: undefined };
}

// Runs `<plugin root>/bin/noask --session <id> [--agent <agentId>] count <counter> <budget>` by its argument vector,
// never through a shell, with the command's two test seams set to the empty string, which it reads as unset, so a
// variable the host process inherited cannot move the command's clock away from the module's. Never rejects.
export async function countOn(
    $: Pick<EngineInterface, 'process' | 'plugin' | 'session'>,
    agentId: string | undefined,
    counter: Counter,
    budgets: Budgets,
): Promise<Counted> {
    const session = await sessionIdOf($);
    if (!session.ok) {
        return { kind: 'failed', error: `no session id: ${session.error}` };
    }
    if (agentId !== undefined && !ID_FORM.test(agentId)) {
        return { kind: 'failed', error: `the agent id is not usable (${agentId})` };
    }
    const agent = agentId === undefined ? [] : ['--agent', agentId];
    const argv = [
        `${$.plugin.root}/bin/noask`,
        '--session',
        session.id,
        ...agent,
        'count',
        counter,
        `${budgets[counter]}`,
    ];
    try {
        const { exitCode, stdout, stderr } = await $.process.run(argv, {
            timeoutMs: COUNT_TIMEOUT_MS,
            env: { SDD_NOASK_NOW: '', SDD_NOASK_LOCK_WAIT: '' },
        });
        if (exitCode !== 0) {
            const reason = stderr.trim();
            return { kind: 'failed', error: reason === '' ? `the count exited ${exitCode}` : reason };
        }
        const counted = parseCounted(stdout);
        const [warning = ''] = stderr.trim().split('\n');
        return counted.kind === 'counted' && warning !== '' ? { ...counted, note: warning } : counted;
    } catch (error: unknown) {
        return { kind: 'failed', error: messageOf(error) };
    }
}
