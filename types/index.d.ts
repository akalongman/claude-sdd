// The state contract of the sdd plugin: the values its module keeps under `$.state` for the session.

// The main loop's turn as the module last saw it: none before the first turn starts (a value never written reads
// undefined, which the module reads as none), running from a turn's start, complete from its end.
export type MainTurn = 'none' | 'running' | 'complete';

declare module 'claude-code' {
    interface PluginState {
        sdd: {
            mainTurn: MainTurn;
        };
    }
}
