import type {
    EngineInterface,
    FsBytes,
    FsEntry,
    FsReadBytesOptions,
    FsReadCall,
    FsReadOptions,
    Timer,
} from 'claude-code';
import { expect, test } from 'claude-code/testing';
import {
    BAD_MARKERS,
    MARKER_HANDSOFF,
    MARKER_ON,
    MARKER_ON_UNTIL,
    MARKER_RENEWED,
    MARKER_SESSION,
} from './marker.fixtures';
import type { Reading } from './marker';
import { inTime, isNoask, LOOK_TIMEOUT_MS, mayPublish, parseMarker, readNoask, sessionIdOf } from './marker';

const NOW = 1_794_425_400_000; // 2026-11-11T23:30:00+04:00
const GENERATED = 1_794_423_612_000; // 2026-11-11T23:00:12+04:00, the clock the generator read BAD_MARKERS at
const UNTIL = 1_794_454_200_000; // 2026-11-12T07:30:00+04:00, MARKER_ON_UNTIL's until
const LATE = 1_794_456_000_000; // 2026-11-12T08:00:00+04:00, after MARKER_ON_UNTIL's and MARKER_SESSION's until

const HOME = '/home/u';
const GLOBAL = `${HOME}/.local/state/sdd/noask`;
const DIR = `${HOME}/.local/state/sdd/noask.d`;
const GENERATION = '2026-11-11T23:00:12.000000000+04:00-00000000';
const SINCE = '2026-11-11T23:00:12+04:00';

// MARKER_SESSION under another generation, so a reading shows which marker it came from.
const MARKER_SESSION_OWN = MARKER_SESSION.replace('-00000000\n', '-11111111\n');

// `text` with its line `index` (from 0) replaced by `line`.
function rewritten(text: string, index: number, line: string): string {
    const lines = text.split('\n');
    lines[index] = line;
    return lines.join('\n');
}

// The error of a reading that is unreadable, or the reading's kind.
function errorOf(reading: Reading): string {
    return reading.kind === 'unreadable' ? reading.error : `(${reading.kind})`;
}

// Whether a text's last word, as a status line's reader splits it, is handsoff.
function endsInHandsoff(text: string): boolean {
    return /(^|\s)handsoff\s*$/.test(text);
}

// A member of the engine no test here reaches: calling it fails the test.
function unused(): never {
    throw new Error('the test reached an engine member it does not stage');
}

// A call that never answers, and `made`, which settles once the call has been made.
function hanging<T>(): { readonly made: Promise<void>; readonly call: () => Promise<T> } {
    let markMade: () => void = () => undefined;
    const made = new Promise<void>((resolve) => {
        markMade = resolve;
    });
    return {
        made,
        call: () => {
            markMade();
            return new Promise<T>(() => undefined);
        },
    };
}

// What the file system and the session answer beneath the module. Absent: HOME is /home/u, the session's id s-1, no
// file or directory exists, and the clock reads NOW. A directory exists when it is listed in `dirs` or holds a file.
// Each override answers its call for a path, or leaves it to the files when it returns undefined.
type World = {
    readonly env?: Readonly<Record<string, string>>;
    readonly id?: string | Error;
    readonly files?: Readonly<Record<string, string>>;
    readonly dirs?: ReadonlyArray<string>;
    readonly nowMs?: number;
    readonly exists?: (path: string) => Promise<boolean> | undefined;
    readonly read?: (path: string) => Promise<string> | undefined;
    readonly list?: (path: string) => Promise<FsEntry[]> | undefined;
};

// A timer the module started with `$.clock.after`.
type StagedTimer = { readonly ms: number; readonly fire: () => void; isCancelled: boolean };

type Stage = {
    readonly engine: Pick<EngineInterface, 'env' | 'fs' | 'clock' | 'session'>;
    readonly calls: ReadonlyArray<string>; // each file call, `<call> <path>`, in order
    readonly timers: ReadonlyArray<StagedTimer>;
    readonly fireTimers: () => void; // fires every timer not cancelled
};

function parentOf(path: string): string {
    return path.slice(0, path.lastIndexOf('/'));
}

function stage(world: World = {}): Stage {
    const env = world.env ?? { HOME };
    const files = world.files ?? {};
    const dirs = world.dirs ?? [];
    const calls: string[] = [];
    const timers: StagedTimer[] = [];
    const isDirectory = (path: string): boolean =>
        dirs.includes(path) || Object.keys(files).some((file) => file.startsWith(`${path}/`));
    const missing = (call: string, path: string): Promise<never> =>
        Promise.reject(new Error(`ENOENT: no such file or directory, ${call} '${path}'`));

    function read(path: string): Promise<string>;
    function read(path: string, options: FsReadBytesOptions): Promise<FsBytes>;
    function read(path: string, options: FsReadOptions): Promise<string | FsBytes>;
    function read(path: string): Promise<string | FsBytes> {
        calls.push(`read ${path}`);
        const text = files[path];
        return world.read?.(path) ?? (text === undefined ? missing('open', path) : Promise.resolve(text));
    }
    const readCall: FsReadCall = read;

    const engine: Pick<EngineInterface, 'env' | 'fs' | 'clock' | 'session'> = {
        env: {
            get: async (name: string) => env[name],
            set: unused,
        },
        fs: {
            read: readCall,
            write: unused,
            list: (path?: string) => {
                const directory = path ?? '';
                calls.push(`list ${directory}`);
                const entries: FsEntry[] = [
                    ...Object.entries(files)
                        .filter(([file]) => parentOf(file) === directory)
                        .map(([file, text]): FsEntry => {
                            const name = file.slice(directory.length + 1);
                            return { name, kind: 'file', size: text.length, mtimeMs: 0, isLink: false };
                        }),
                    ...dirs
                        .filter((dir) => parentOf(dir) === directory)
                        .map((dir): FsEntry => {
                            const name = dir.slice(directory.length + 1);
                            return { name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false };
                        }),
                ];
                return (
                    world.list?.(directory) ??
                    (isDirectory(directory) ? Promise.resolve(entries) : missing('scandir', directory))
                );
            },
            exists: (path: string) => {
                calls.push(`exists ${path}`);
                return world.exists?.(path) ?? Promise.resolve(files[path] !== undefined || isDirectory(path));
            },
            stat: unused,
            ancestors: unused,
        },
        clock: {
            now: async () => world.nowMs ?? NOW,
            sleep: unused,
            after: (ms: number, fn: () => void): Timer => {
                const timer: StagedTimer = { ms, fire: fn, isCancelled: false };
                timers.push(timer);
                return {
                    cancel: () => {
                        timer.isCancelled = true;
                    },
                };
            },
            every: unused,
        },
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
    const fireTimers = (): void => {
        for (const timer of timers.filter((each) => !each.isCancelled)) {
            timer.fire();
        }
    };
    return { engine, calls, timers, fireTimers };
}

// parseMarker

test('a marker as the command writes it is on, with its fields as written', async () => {
    expect(parseMarker(MARKER_ON, 'global', NOW)).toEqual({
        kind: 'on',
        generation: GENERATION,
        since: SINCE,
        until: undefined,
        level: 'noask',
    });
    expect(parseMarker(MARKER_ON_UNTIL, 'global', NOW)).toEqual({
        kind: 'on',
        generation: GENERATION,
        since: SINCE,
        until: '2026-11-12T07:30:00+04:00',
        level: 'noask',
    });
    expect(parseMarker(MARKER_RENEWED, 'global', NOW)).toEqual({
        kind: 'on',
        generation: GENERATION,
        since: SINCE,
        until: '2026-11-12T08:30:12+04:00',
        level: 'noask',
    });
    expect(parseMarker(MARKER_HANDSOFF, 'session', NOW)).toEqual({
        kind: 'on',
        generation: GENERATION,
        since: SINCE,
        until: '2026-11-12T07:00:12+04:00',
        level: 'handsoff',
    });
});

test('a marker is on until a second before its until, and expired at it and after', async () => {
    expect(parseMarker(MARKER_ON_UNTIL, 'global', UNTIL - 1_000).kind).toBe('on');
    const expired = { kind: 'expired', until: '2026-11-12T07:30:00+04:00' };
    expect(parseMarker(MARKER_ON_UNTIL, 'global', UNTIL)).toEqual(expired);
    expect(parseMarker(MARKER_ON_UNTIL, 'global', UNTIL + 1_000)).toEqual(expired);
});

test('a marker without its final newline is unreadable', async () => {
    expect(parseMarker(MARKER_ON_UNTIL.slice(0, -1), 'global', NOW)).toEqual({
        kind: 'unreadable',
        error: 'the last line has no newline',
    });
});

test('an offset outside the grammar is unreadable in since, in until and in the generation', async () => {
    for (const offset of ['+04:60', '+14:01', '+15:00']) {
        const since = `2026-11-11T23:00:12${offset}`;
        const until = `2026-11-12T07:30:00${offset}`;
        const generation = `2026-11-11T23:00:12.000000000${offset}-00000000`;
        expect(parseMarker(rewritten(MARKER_ON_UNTIL, 1, `since=${since}`), 'global', NOW)).toEqual({
            kind: 'unreadable',
            error: `bad since: ${since}`,
        });
        expect(parseMarker(rewritten(MARKER_ON_UNTIL, 2, `until=${until}`), 'global', NOW)).toEqual({
            kind: 'unreadable',
            error: `bad until: ${until}`,
        });
        expect(parseMarker(rewritten(MARKER_ON_UNTIL, 0, `generation=${generation}`), 'global', NOW)).toEqual({
            kind: 'unreadable',
            error: `bad generation: ${generation}`,
        });
    }
});

test('the offsets +14:00 and -00:00 are read in since, in until and in the generation', async () => {
    const cases: ReadonlyArray<readonly [number, string]> = [
        [1, 'since=2026-11-12T09:00:12+14:00'],
        [1, 'since=2026-11-11T19:00:12-00:00'],
        [2, 'until=2026-11-12T17:30:00+14:00'],
        [2, 'until=2026-11-12T03:30:00-00:00'],
        [0, 'generation=2026-11-12T09:00:12.000000000+14:00-00000000'],
        [0, 'generation=2026-11-11T19:00:12.000000000-00:00-00000000'],
    ];
    for (const [index, line] of cases) {
        const reading = parseMarker(rewritten(MARKER_ON_UNTIL, index, line), 'global', NOW);
        expect(reading.kind, line).toBe('on');
        expect(reading, line).toMatchObject({ [line.slice(0, line.indexOf('='))]: line.slice(line.indexOf('=') + 1) });
    }
    // The same instant as the until written at +04:00: expired at it under either offset.
    for (const line of ['until=2026-11-12T17:30:00+14:00', 'until=2026-11-12T03:30:00-00:00']) {
        expect(parseMarker(rewritten(MARKER_ON_UNTIL, 2, line), 'global', UNTIL).kind, line).toBe('expired');
    }
});

test('a time that does not read back as written is unreadable', async () => {
    expect(parseMarker(rewritten(MARKER_ON_UNTIL, 1, 'since=2026-02-30T00:00:00+04:00'), 'global', NOW)).toEqual({
        kind: 'unreadable',
        error: 'bad since: 2026-02-30T00:00:00+04:00',
    });
    expect(parseMarker(rewritten(MARKER_ON_UNTIL, 2, 'until=2026-11-11T24:00:00+04:00'), 'global', NOW)).toEqual({
        kind: 'unreadable',
        error: 'bad until: 2026-11-11T24:00:00+04:00',
    });
});

test('every line is matched against the grammar before a time is parsed', async () => {
    const text = rewritten(rewritten(MARKER_ON_UNTIL, 1, 'since=2026-02-30T00:00:00+04:00'), 3, 'level=push');
    expect(parseMarker(text, 'global', NOW)).toEqual({ kind: 'unreadable', error: 'bad level: push' });
});

for (const { name, text, asGlobal, asSession } of BAD_MARKERS) {
    test(`the command's reading of a text: ${name}`, async () => {
        expect(parseMarker(text, 'global', GENERATED).kind).toBe(asGlobal);
        expect(parseMarker(text, 'session', GENERATED).kind).toBe(asSession);
    });
}

// The error of a marker whose first line holds another key: the line names the key it lacks.
const OUT_OF_ORDER = 'expected generation= on line 1';

test('a text not of four lines of the grammar is unreadable, naming what was wrong', async () => {
    const [generationLine = '', sinceLine = '', untilLine = ''] = MARKER_ON_UNTIL.split('\n');
    const cases: ReadonlyArray<readonly [string, string]> = [
        [`${generationLine}\n${sinceLine}\n`, '4 lines expected, found 2'],
        [`${generationLine}\n${sinceLine}\n${untilLine}\n`, '4 lines expected, found 3'],
        [`${MARKER_ON_UNTIL}level=noask\n`, '4 lines expected, found 5'],
        [rewritten(MARKER_ON_UNTIL, 3, 'level=push'), 'bad level: push'],
        [rewritten(rewritten(MARKER_ON_UNTIL, 0, `since=${SINCE}`), 1, `generation=${GENERATION}`), OUT_OF_ORDER],
        [rewritten(MARKER_ON_UNTIL, 0, 'generation='), 'empty generation'],
        [rewritten(MARKER_ON_UNTIL, 0, 'generation=abc'), 'bad generation: abc'],
        [rewritten(MARKER_ON_UNTIL, 1, 'since=yesterday'), 'bad since: yesterday'],
        [rewritten(MARKER_ON_UNTIL, 1, 'since=2026-11-11'), 'bad since: 2026-11-11'],
        [rewritten(MARKER_ON_UNTIL, 2, 'until=tomorrow'), 'bad until: tomorrow'],
        ['', 'the marker is empty'],
        [
            `${MARKER_ON_UNTIL}${'x'.repeat(4_097 - MARKER_ON_UNTIL.length)}`,
            'the marker is longer than 4096 characters',
        ],
    ];
    for (const [text, error] of cases) {
        expect(parseMarker(text, 'global', NOW), text).toEqual({ kind: 'unreadable', error });
    }
});

test('a marker of exactly 4096 characters is still parsed', async () => {
    const text = rewritten(MARKER_ON_UNTIL, 3, `level=${'x'.repeat(4_096 - MARKER_ON_UNTIL.length + 5)}`);
    expect(text).toHaveLength(4_096);
    expect(errorOf(parseMarker(text, 'global', NOW))).toStartWith('bad level: xxx');
});

test('a marker is read by its kind, as the command reads it', async () => {
    expect(parseMarker(MARKER_HANDSOFF, 'global', NOW)).toEqual({
        kind: 'unreadable',
        error: 'handsoff in the global marker',
    });
    const withoutUntil = rewritten(MARKER_SESSION, 2, 'until=');
    expect(parseMarker(withoutUntil, 'session', NOW)).toEqual({
        kind: 'unreadable',
        error: "a session's marker without an until",
    });
    expect(parseMarker(withoutUntil, 'global', NOW)).toEqual({
        kind: 'on',
        generation: GENERATION,
        since: SINCE,
        until: undefined,
        level: 'noask',
    });
});

test('no error text ends in the word handsoff, whatever the marker holds', async () => {
    const endingInHandsoff = [
        rewritten(MARKER_ON_UNTIL, 3, 'level=handsoff '),
        rewritten(MARKER_ON_UNTIL, 3, 'level= handsoff'),
        rewritten(MARKER_ON_UNTIL, 3, 'level=x handsoff'),
        rewritten(MARKER_ON_UNTIL, 0, 'generation=handsoff'),
        rewritten(MARKER_ON_UNTIL, 1, 'since=at handsoff'),
        rewritten(MARKER_ON_UNTIL, 2, 'until=handsoff'),
        rewritten(MARKER_ON_UNTIL, 0, 'handsoff'),
        'handsoff\n',
        'handsoff',
    ];
    for (const text of [...endingInHandsoff, MARKER_HANDSOFF, ...BAD_MARKERS.map((bad) => bad.text)]) {
        for (const kind of ['global', 'session'] as const) {
            const reading = parseMarker(text, kind, NOW);
            expect(endsInHandsoff(errorOf(reading)), errorOf(reading)).toBe(false);
        }
    }
    for (const text of endingInHandsoff) {
        expect(parseMarker(text, 'global', NOW).kind, text).toBe('unreadable');
        expect(parseMarker(text, 'session', NOW).kind, text).toBe('unreadable');
    }
    expect(errorOf(parseMarker(rewritten(MARKER_ON_UNTIL, 3, 'level=x handsoff'), 'global', NOW))).toBe(
        'bad level: "x handsoff"',
    );
    expect(errorOf(parseMarker(rewritten(MARKER_ON_UNTIL, 3, 'level=handsoff '), 'global', NOW))).toBe(
        'bad level: "handsoff "',
    );
});

test('isNoask holds for on and unreadable, and for nothing else', async () => {
    expect(isNoask(parseMarker(MARKER_ON, 'global', NOW))).toBe(true);
    expect(isNoask({ kind: 'unreadable', error: 'boom' })).toBe(true);
    expect(isNoask({ kind: 'off' })).toBe(false);
    expect(isNoask(parseMarker(MARKER_ON_UNTIL, 'global', LATE))).toBe(false);
});

// inTime

test('a look waits at most two seconds', async () => {
    expect(LOOK_TIMEOUT_MS).toBe(2_000);
});

test('inTime gives what a call resolves to and cancels its timer', async () => {
    const world = stage();
    expect(await inTime(world.engine, Promise.resolve(42))).toEqual({ ok: true, value: 42 });
    expect(world.timers).toEqual([expect.objectContaining({ ms: LOOK_TIMEOUT_MS, isCancelled: true })]);
});

test("inTime gives a rejection's message and cancels its timer", async () => {
    const world = stage();
    expect(await inTime(world.engine, Promise.reject(new Error('boom')))).toEqual({ ok: false, error: 'boom' });
    expect(world.timers).toEqual([expect.objectContaining({ ms: LOOK_TIMEOUT_MS, isCancelled: true })]);
});

test('inTime gives timed out for a call that has not answered when its timer fires', async () => {
    const world = stage();
    const answer = inTime(world.engine, new Promise<number>(() => undefined));
    world.fireTimers();
    expect(await answer).toEqual({ ok: false, error: 'timed out' });
});

// readNoask, the global marker

test('HOME unset or empty reads off, and no path is asked for', async () => {
    for (const env of [{}, { HOME: '' }]) {
        const world = stage({ env, files: { [GLOBAL]: MARKER_ON } });
        expect(await readNoask(world.engine)).toEqual({ kind: 'off' });
        expect(world.calls).toEqual([]);
    }
});

test('no global marker reads off, and it is not read', async () => {
    const world = stage();
    expect(await readNoask(world.engine)).toEqual({ kind: 'off' });
    expect(world.calls[0]).toBe(`exists ${GLOBAL}`);
    expect(world.calls).not.toContain(`read ${GLOBAL}`);
});

test('a global marker gives its parsed reading, and every look cancels its timer', async () => {
    const world = stage({ files: { [GLOBAL]: MARKER_ON } });
    expect(await readNoask(world.engine)).toEqual(parseMarker(MARKER_ON, 'global', NOW));
    expect(world.calls).toEqual([`exists ${GLOBAL}`, `read ${GLOBAL}`]);
    expect(world.timers).toHaveLength(2);
    expect(world.timers.every((timer) => timer.isCancelled && timer.ms === LOOK_TIMEOUT_MS)).toBe(true);
});

test('an existence check that rejects is unreadable', async () => {
    const world = stage({ exists: () => Promise.reject(new Error('EIO: i/o error')) });
    expect(await readNoask(world.engine)).toEqual({ kind: 'unreadable', error: 'EIO: i/o error' });
});

test('a marker removed between its existence check and its read is off', async () => {
    let checks = 0;
    const world = stage({
        exists: (path) => {
            if (path !== GLOBAL) {
                return undefined;
            }
            checks += 1;
            return Promise.resolve(checks === 1);
        },
    });
    expect(await readNoask(world.engine)).toEqual({ kind: 'off' });
    expect(world.calls.slice(0, 3)).toEqual([`exists ${GLOBAL}`, `read ${GLOBAL}`, `exists ${GLOBAL}`]);
});

test("a read that rejects with the file still there is unreadable with the rejection's message", async () => {
    const world = stage({
        files: { [GLOBAL]: MARKER_ON },
        read: () => Promise.reject(new Error(`EACCES: permission denied, open '${GLOBAL}'`)),
    });
    expect(await readNoask(world.engine)).toEqual({
        kind: 'unreadable',
        error: `EACCES: permission denied, open '${GLOBAL}'`,
    });
});

test('a look that has not answered when its timer fires is unreadable', async () => {
    const existence = hanging<boolean>();
    const hungCheck = stage({ exists: (path) => (path === GLOBAL ? existence.call() : undefined) });
    const checked = readNoask(hungCheck.engine);
    await existence.made;
    hungCheck.fireTimers();
    expect(await checked).toEqual({ kind: 'unreadable', error: 'marker read timed out' });

    const reading = hanging<string>();
    const hungRead = stage({
        files: { [GLOBAL]: MARKER_ON },
        read: (path) => (path === GLOBAL ? reading.call() : undefined),
    });
    const read = readNoask(hungRead.engine);
    await reading.made;
    hungRead.fireTimers();
    expect(await read).toEqual({ kind: 'unreadable', error: 'marker read timed out' });
    expect(hungRead.timers.map((timer) => timer.ms)).toEqual([LOOK_TIMEOUT_MS, LOOK_TIMEOUT_MS, LOOK_TIMEOUT_MS]);
});

test('a global marker at level handsoff is unreadable', async () => {
    const world = stage({ files: { [GLOBAL]: MARKER_HANDSOFF } });
    expect(await readNoask(world.engine)).toEqual({ kind: 'unreadable', error: 'handsoff in the global marker' });
});

// readNoask, the two markers

test("the session's own marker is read when the global one is off", async () => {
    const world = stage({ files: { [`${DIR}/s-1`]: MARKER_SESSION_OWN } });
    expect(await readNoask(world.engine)).toEqual(parseMarker(MARKER_SESSION_OWN, 'session', NOW));
});

test("another session's marker is not this session's", async () => {
    const world = stage({ files: { [`${DIR}/s-2`]: MARKER_SESSION } });
    expect(await readNoask(world.engine)).toEqual({ kind: 'off' });
    expect(world.calls).not.toContain(`list ${DIR}`);
});

test("a global marker that is on is the reading, and the session's is not asked for", async () => {
    const world = stage({ files: { [GLOBAL]: MARKER_ON, [`${DIR}/s-1`]: MARKER_SESSION_OWN } });
    expect(await readNoask(world.engine)).toEqual(parseMarker(MARKER_ON, 'global', NOW));
    expect(world.calls.some((call) => call.endsWith(`${DIR}/s-1`))).toBe(false);
});

test("a global marker that is unreadable is the reading, and the session's is not asked for", async () => {
    const world = stage({ files: { [GLOBAL]: 'two\nlines\n', [`${DIR}/s-1`]: MARKER_SESSION_OWN } });
    expect(await readNoask(world.engine)).toEqual({ kind: 'unreadable', error: '4 lines expected, found 2' });
    expect(world.calls.some((call) => call.endsWith(`${DIR}/s-1`))).toBe(false);
});

test('an expired marker is the reading when the other is off', async () => {
    const globalExpired = stage({ nowMs: LATE, files: { [GLOBAL]: MARKER_ON_UNTIL } });
    expect(await readNoask(globalExpired.engine)).toEqual({ kind: 'expired', until: '2026-11-12T07:30:00+04:00' });
    const sessionExpired = stage({ nowMs: LATE, files: { [`${DIR}/s-1`]: MARKER_SESSION } });
    expect(await readNoask(sessionExpired.engine)).toEqual({ kind: 'expired', until: '2026-11-12T07:00:12+04:00' });
});

// readNoask, a session with no usable id

const NO_ID = new Error('boom');

test('with no usable id and no noask.d, the global reading stands and nothing is listed', async () => {
    const world = stage({ id: NO_ID });
    expect(await readNoask(world.engine)).toEqual({ kind: 'off' });
    expect(world.calls).toEqual([`exists ${GLOBAL}`, `exists ${DIR}`]);
});

test('with no usable id, a noask.d with no entry, or only expired ones, leaves the global reading', async () => {
    const empty = stage({ id: NO_ID, dirs: [DIR] });
    expect(await readNoask(empty.engine)).toEqual({ kind: 'off' });
    expect(empty.calls).toContain(`list ${DIR}`);
    const expired = stage({
        id: NO_ID,
        nowMs: LATE,
        files: { [`${DIR}/s-7`]: MARKER_SESSION, [`${DIR}/s-8`]: MARKER_SESSION },
    });
    expect(await readNoask(expired.engine)).toEqual({ kind: 'off' });
});

test('with no usable id, a listing that rejects is unreadable', async () => {
    const world = stage({
        id: NO_ID,
        dirs: [DIR],
        list: () => Promise.reject(new Error(`EACCES: permission denied, scandir '${DIR}'`)),
    });
    expect(await readNoask(world.engine)).toEqual({
        kind: 'unreadable',
        error: `EACCES: permission denied, scandir '${DIR}'`,
    });
});

test("with no usable id, a session's own switch that is on makes the reading unreadable", async () => {
    const files = { [`${DIR}/s-9`]: MARKER_SESSION };
    expect(await readNoask(stage({ id: NO_ID, files }).engine)).toEqual({
        kind: 'unreadable',
        error: "this session's id could not be read (boom) while a session's own switch is on",
    });
    expect(await readNoask(stage({ id: '../s-1', files }).engine)).toEqual({
        kind: 'unreadable',
        error: "this session's id is not usable (../s-1) while a session's own switch is on",
    });
});

test("with no usable id, a session's marker that is unreadable makes the reading unreadable", async () => {
    const world = stage({ id: NO_ID, files: { [`${DIR}/s-9`]: 'two\nlines\n' } });
    expect(await readNoask(world.engine)).toEqual({
        kind: 'unreadable',
        error: "this session's id could not be read (boom) while a session's own marker is unreadable",
    });
});

test('with no usable id, a global marker that is on is the reading and nothing is listed', async () => {
    const world = stage({ id: NO_ID, files: { [GLOBAL]: MARKER_ON, [`${DIR}/s-9`]: MARKER_SESSION } });
    expect(await readNoask(world.engine)).toEqual(parseMarker(MARKER_ON, 'global', NOW));
    expect(world.calls).toEqual([`exists ${GLOBAL}`, `read ${GLOBAL}`]);
});

test("the session's id is taken only in the id's form and when it is none of the command's words", async () => {
    expect(await sessionIdOf(stage().engine)).toEqual({ ok: true, id: 's-1' });
    expect(await sessionIdOf(stage({ id: 'a'.repeat(64) }).engine)).toEqual({ ok: true, id: 'a'.repeat(64) });
    expect(await sessionIdOf(stage({ id: NO_ID }).engine)).toEqual({
        ok: false,
        error: "this session's id could not be read (boom)",
    });
    for (const id of ['', '../s-1', 's.1', 'a'.repeat(65), 'on', 'status', 'handsoff', 'count']) {
        expect(await sessionIdOf(stage({ id }).engine)).toEqual({
            ok: false,
            error: `this session's id is not usable (${id})`,
        });
    }
});

// mayPublish

test('a session may publish when its own marker reads on at handsoff, whatever the global one reads', async () => {
    const own = { [`${DIR}/s-1`]: MARKER_HANDSOFF };
    expect(await mayPublish(stage({ files: own }).engine)).toBe(true);
    expect(await mayPublish(stage({ files: { ...own, [GLOBAL]: MARKER_ON } }).engine)).toBe(true);
});

test('every other reading, no usable id and a failed read do not let a session publish', async () => {
    const cases: ReadonlyArray<readonly [string, World]> = [
        ['level noask', { files: { [`${DIR}/s-1`]: MARKER_SESSION } }],
        ['expired', { nowMs: LATE, files: { [`${DIR}/s-1`]: MARKER_HANDSOFF } }],
        ['unreadable', { files: { [`${DIR}/s-1`]: 'two\nlines\n' } }],
        ['no marker', {}],
        ["another session's", { files: { [`${DIR}/s-2`]: MARKER_HANDSOFF } }],
        ['no usable id', { id: NO_ID, files: { [`${DIR}/s-1`]: MARKER_HANDSOFF } }],
        [
            'a read that rejects',
            { files: { [`${DIR}/s-1`]: MARKER_HANDSOFF }, read: () => Promise.reject(new Error('EIO: i/o error')) },
        ],
        ['HOME unset', { env: {}, files: { [`${DIR}/s-1`]: MARKER_HANDSOFF } }],
    ];
    for (const [name, world] of cases) {
        expect(await mayPublish(stage(world).engine), name).toBe(false);
    }
});
