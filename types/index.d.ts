// The state contract of the sdd plugin: the values its module keeps under `$.state` for the session.

// The main loop's turn as the module last saw it: none before the first turn starts (a value never written reads
// undefined, which the module reads as none), running from a turn's start, complete from its end.
export type MainTurn = 'none' | 'running' | 'complete';

declare module 'claude-code' {
    interface PluginState {
        sdd: {
            mainTurn: MainTurn;
            // That the session's start was seen, once a session: shown, the start line was shown at a resume or a
            // fork; started, the session started where no line was to be shown (a new session, which the command
            // hook spoke to, or noask off). Never written reads undefined: the start is not seen yet. Nothing reads
            // the difference between the two values; it is kept for a person who looks at the state.
            startLine: 'shown' | 'started';
        };
    }
}
