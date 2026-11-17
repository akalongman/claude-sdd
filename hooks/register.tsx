// The sdd plugin's hooks module. In this step it keeps `sdd.mainTurn`, the main loop's turn as the module last saw
// it, which its later hooks read; the markers' reader (marker.ts) and the count's caller (count.ts) are the parts
// those hooks are built from. A subagent's turn changes nothing.
import type { Register } from 'claude-code';

export const register: Register = (on) => {
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
};
