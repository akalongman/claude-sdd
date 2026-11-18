import type { EngineInterface, FsEntry, FsStat, Timer } from 'claude-code';
import { expect, test } from 'claude-code/testing';
import type { FenceWhat } from './fence';
import { configRoots, isPublication, isUnder, placed, shellHits, spelled, startsLikeConfig, stateRoots } from './fence';
import { FENCE_ROWS } from './fence.rows';
import { LOOK_TIMEOUT_MS } from './marker';

const HOME = '/home/u';

// shellHits, the table (tests/fence-rows.txt, generated into fence.rows.ts)

for (const [index, { command, hits }] of FENCE_ROWS.entries()) {
    test(`shellHits, record ${index + 1}: ${JSON.stringify(command)}`, async () => {
        expect(shellHits(command, HOME).map(({ what }) => what)).toEqual(hits);
    });
}

test('the table holds every record of tests/fence-rows.txt', async () => {
    expect(FENCE_ROWS).toHaveLength(253);
});

// The scan's work. Each nested text is read once per reading, and a command whose reading passes the scan's work limit
// is too complex to read: one hit of its own, refused by the guard in every session. A hook's .catch handler has 1
// second, in which it scans the command again after the hook, so each scan below must end in a quarter of it. Each of
// the review's three nestings doubled or tripled the scan's time with each level before; now a moderate depth is read
// to its end, and a deep one, past the limit, is refused.

const TOO_COMPLEX: ReadonlyArray<FenceWhat> = ['a command too complex to read'];
const TIME_BOUND_MS = 250;

// The hits of one call of shellHits, and its time.
function timed(command: string): { readonly hits: ReadonlyArray<FenceWhat>; readonly ms: number } {
    const start = performance.now();
    const hits = shellHits(command, HOME).map(({ what }) => what);
    return { hits, ms: performance.now() - start };
}

function nested(wrap: (inner: string) => string, depth: number): string {
    let text = '$(git push)';
    for (let level = 0; level < depth; level += 1) {
        text = wrap(text);
    }
    return text;
}

// A nesting: its name, one level, the whole command around it, a depth read to its end and a depth refused. The limit
// is spent at 80, 46 and 75 levels.
type Nesting = readonly [string, (inner: string) => string, (text: string) => string, number, number];

const NESTINGS: ReadonlyArray<Nesting> = [
    ['$((X))', (inner) => `$((${inner}))`, (text) => `echo ${text}`, 20, 400],
    ['$(( (( X )) ))', (inner) => `$(( (( ${inner} )) ))`, (text) => `echo ${text}`, 13, 240],
    ['$((X) )', (inner) => `$((${inner}) )`, (text) => `x=${text}`, 20, 400],
];

for (const [shape, wrap, whole, readDepth, refusedDepth] of NESTINGS) {
    test(`${shape} ${readDepth} deep is read to its end, ${refusedDepth} deep is refused, each in time`, async () => {
        const read = timed(whole(nested(wrap, readDepth)));
        expect(read.hits).toEqual(['a push']);
        expect(read.ms).toBeLessThan(TIME_BOUND_MS);
        const refused = timed(whole(nested(wrap, refusedDepth)));
        expect(refused.hits).toEqual(TOO_COMPLEX);
        expect(refused.ms).toBeLessThan(TIME_BOUND_MS);
    });
}

// A reading that does not fit (an unclosed $[ or $((, a (( that no )) ends) puts the scan back, which reads the text
// again another way. A place is read once for each queue it is read with, so such readings nested in each other cost
// no more than the text's length times their depth; each level doubled the scan's time before.
const FAILED_READINGS: ReadonlyArray<readonly [string, string]> = [
    ['an unclosed $[', `echo ${'$[x '.repeat(22)}\ngit push`],
    ['an unclosed $((', `echo ${'$((x '.repeat(18)}\ngit push`],
    ['a (( that no )) ends', nested((inner) => `((x $( ${inner} ) ); true)`, 18)],
];

for (const [name, command] of FAILED_READINGS) {
    test(`${name}, nested, is read to its end in time`, async () => {
        const read = timed(command);
        expect(read.hits).toEqual(['a push']);
        expect(read.ms).toBeLessThan(TIME_BOUND_MS);
    });
}

// Only a word's first `[` can follow a name and open a subscript; testing every later one took time growing with the
// square of the word.
test('a word of many brackets after a long name is read in time', async () => {
    const read = timed(`${'a'.repeat(40_000)}${'['.repeat(40_000)}=x\ngit push`);
    expect(read.hits).toEqual(['a push']);
    expect(read.ms).toBeLessThan(TIME_BOUND_MS);
});

test('a nesting deeper than the scan can follow is refused, never passed', async () => {
    const deep = timed(`echo ${'$('.repeat(200_000)}git push${')'.repeat(200_000)}`);
    expect(deep.hits).toEqual(TOO_COMPLEX);
    expect(deep.ms).toBeLessThan(TIME_BOUND_MS);
});

// A path's part is matched against a name by a scan that goes back only to the last run of stars: a part of many stars
// took seconds to match by a backtracking pattern, and one of many brackets made a pattern too large to build.
test('a path part of many stars or brackets is matched in time', async () => {
    const stars = '*'.repeat(300);
    for (const [command, hits] of [
        [`rm ~/.local/st${stars}Z/x`, []],
        [`rm ~/.local/st${stars}e/sdd/noask`, ['switching noask']],
        [`rm /${'['.repeat(40_000)}/x`, []],
    ] as const) {
        const matched = timed(command);
        expect(matched.hits, command.slice(0, 40)).toEqual(hits);
        expect(matched.ms, command.slice(0, 40)).toBeLessThan(TIME_BOUND_MS);
    }
});

test('a long ordinary script, here-document and all, is read to its end', async () => {
    const line = 'for f in *.txt; do grep -n "$pattern" "$f" | sed -e "s/x/y/" >> "/tmp/out-$(date +%s).log"; done\n';
    const body = 'some text of a file written through a here-document, with $dollars and `ticks`\n';
    const script = timed(`${line.repeat(1_000)}cat <<'EOF' > notes.md\n${body.repeat(20_000)}EOF\ngit push`);
    expect(script.hits).toEqual(['a push']);
    expect(script.ms).toBeLessThan(TIME_BOUND_MS);
});

// A (( that is no arithmetic is a subshell in a subshell, read as the spaced ( ( of the table is: a here-document
// opened in a substitution inside it is queued once, by the reading that follows the arithmetic one that did not fit.
// Not in the table: bash's own second reading of such a (( ran the delimiter line as a command and took the lines
// after it as a body (an echo-only run on 2026-11-18), while it reads the spaced form as the table says.
test('a (( that is no arithmetic is read as ( ( is, its here-document queued once', async () => {
    const rest = '\ngit push\nEOF\nnoask global off';
    const spaced = shellHits(`( (x $(cat <<EOF)); true)${rest}`, HOME).map(({ what }) => what);
    expect(shellHits(`((x $(cat <<EOF)); true)${rest}`, HOME).map(({ what }) => what)).toEqual(spaced);
    expect(spaced).toEqual(['switching noask']);
});

// Forms the table does not hold, read by the same rules: a $'...' word's escapes, a case pattern's `)` inside a
// substitution (also inside a subshell there), a here-document inside a substitution, two here-documents on one line,
// bash 5.3's ${| ...; }, a substitution inside a parameter expansion and inside nested backticks, and mv's -t as the
// last of its short options. All but the first agreed with bash under tests/check-fence-rows.sh on 2026-11-18; its
// guard does not run a $'...' word.
const BEYOND_THE_TABLE: ReadonlyArray<readonly [string, ReadonlyArray<FenceWhat>]> = [
    ["$'\\x67it' push", ['a push other than a plain one']],
    ['echo $(case a in a) git push;; esac)', ['a push']],
    ['echo "$( (case a in a) :;; esac); git push )"', ['a push']],
    ['x=$(cat <<EOF\n)\nEOF\n); git push', ['a push']],
    ['cat <<A <<B\nx\nA\ngit push\nB\nnoask on', ['switching noask']],
    ['echo "${ git push; }"; echo ${| noask on; }', ['a push', 'switching noask']],
    ['echo ${x:-$(git push)}', ['a push']],
    ['echo `echo \\`git push\\``', ['a push']],
    ['mv -ft /tmp ~/.local', ['switching noask']],
];

for (const [command, hits] of BEYOND_THE_TABLE) {
    test(`shellHits, beyond the table: ${JSON.stringify(command)}`, async () => {
        expect(shellHits(command, HOME).map(({ what }) => what)).toEqual(hits);
    });
}

test('a home written with a final slash is the same home', async () => {
    expect(shellHits('rm ~/.local/state/sdd/noask', '/home/u/').map(({ what }) => what)).toEqual(['switching noask']);
});

test('a push, a pull request and a merge request are publications; every other hit is not', async () => {
    const publications: ReadonlyArray<FenceWhat> = ['a push', 'a pull request', 'a merge request'];
    const others: ReadonlyArray<FenceWhat> = [
        'a push other than a plain one',
        'switching noask',
        'an edit under the configuration directory',
        'a command too complex to read',
    ];
    for (const what of publications) {
        expect(isPublication({ what }), what).toBe(true);
    }
    for (const what of others) {
        expect(isPublication({ what }), what).toBe(false);
    }
});

// isUnder and spelled

const ROOTS = ['/home/u/.claude', '/home/u/.claude2', '/home/u/.claude-work', '/home/u/.claudex'];
const CWD = '/home/u/projects/app';

test('a path spelled under a configuration root is under it', async () => {
    for (const path of [
        '/home/u/.claude/CLAUDE.md',
        '/home/u/.claude2/rules/x.md',
        '/home/u/.claude-work/skills/a/SKILL.md',
        '~/.claude/x',
        '/home/u/projects/../.claude/x',
        '/home/u/.claudex/a',
    ]) {
        expect(isUnder(spelled(path, HOME, CWD), ROOTS), path).toBe(true);
    }
});

test('a path that only starts like a root, a project folder and another home are not under one', async () => {
    const outside = ['/home/u/.claudette/x', '/home/u/projects/app/.claude/settings.json', '/home/other/.claude/x'];
    for (const path of outside) {
        expect(isUnder(spelled(path, HOME, CWD), ROOTS), path).toBe(false);
    }
});

test('a root is under itself', async () => {
    expect(isUnder('/home/u/.claude', ROOTS)).toBe(true);
});

test('spelled makes a path absolute, expands ~ and folds . and ..', async () => {
    expect(spelled('~/.claude/x', HOME, CWD)).toBe('/home/u/.claude/x');
    expect(spelled('~', HOME, CWD)).toBe('/home/u');
    expect(spelled('notes/./a/../b.md', HOME, CWD)).toBe('/home/u/projects/app/notes/b.md');
    expect(spelled('../../.claude/CLAUDE.md', HOME, CWD)).toBe('/home/u/.claude/CLAUDE.md');
    expect(spelled('/home/u//.claude/', HOME, CWD)).toBe('/home/u/.claude');
    expect(spelled('~other/x', HOME, CWD)).toBe('/home/u/projects/app/~other/x');
});

// startsLikeConfig

test('a spelled path whose first part below the home starts with .claude starts like the configuration', async () => {
    for (const path of ['/home/u/.claude2/rules/x.md', '/home/u/.claude', '/home/u/.claudette/x']) {
        expect(startsLikeConfig(path, HOME), path).toBe(true);
    }
    for (const path of ['/home/u/projects/app/.claude/x', '/home/other/.claude/x', '/home/u/.cache/x']) {
        expect(startsLikeConfig(path, HOME), path).toBe(false);
    }
});

// The file system beneath configRoots, stateRoots and placed

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

// Lets every answer that is already given reach the code that waits on it.
async function flush(): Promise<void> {
    for (let turn = 0; turn < 20; turn += 1) {
        await Promise.resolve();
    }
}

// What the file system answers beneath the module. Absent: HOME is /home/u and nothing exists. `real` maps each path
// that exists to where it lands. Each override answers its call for a path, or leaves it to `real` when it returns
// undefined.
type World = {
    readonly env?: Readonly<Record<string, string>>;
    readonly real?: Readonly<Record<string, string>>;
    readonly entries?: ReadonlyArray<string>;
    readonly list?: (path: string) => Promise<FsEntry[]> | undefined;
    readonly stat?: (path: string) => Promise<FsStat> | undefined;
};

// A timer the module started with `$.clock.after`.
type StagedTimer = { readonly ms: number; readonly fire: () => void; isCancelled: boolean };

type Stage = {
    readonly engine: Pick<EngineInterface, 'env' | 'fs' | 'clock'>;
    readonly calls: ReadonlyArray<string>; // each file call, `<call> <path>`, in order
    readonly timers: ReadonlyArray<StagedTimer>;
    readonly fireTimers: () => void; // fires every timer not cancelled
};

function stage(world: World = {}): Stage {
    const env = world.env ?? { HOME };
    const real = world.real ?? {};
    const calls: string[] = [];
    const timers: StagedTimer[] = [];
    const engine: Pick<EngineInterface, 'env' | 'fs' | 'clock'> = {
        env: {
            get: async (name: string) => env[name],
            set: unused,
        },
        fs: {
            read: unused,
            write: unused,
            list: (path?: string) => {
                const directory = path ?? '';
                calls.push(`list ${directory}`);
                const entries = (world.entries ?? []).map(
                    (name): FsEntry => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false }),
                );
                return world.list?.(directory) ?? Promise.resolve(entries);
            },
            exists: unused,
            stat: (path: string) => {
                calls.push(`stat ${path}`);
                const landing = real[path];
                const answer = (): Promise<FsStat> =>
                    landing === undefined
                        ? Promise.reject(new Error(`ENOENT: no such file or directory, stat '${path}'`))
                        : Promise.resolve({
                              kind: 'dir',
                              size: 0,
                              mtimeMs: 0,
                              isLink: landing !== path,
                              realPath: landing,
                          });
                return world.stat?.(path) ?? answer();
            },
            ancestors: unused,
        },
        clock: {
            now: unused,
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
    };
    const fireTimers = (): void => {
        for (const timer of timers.filter((each) => !each.isCancelled)) {
            timer.fire();
        }
    };
    return { engine, calls, timers, fireTimers };
}

// configRoots

// The home of the spec's example: .claude a link into the dotfiles, .claude2 a folder, and the variable's directory a
// link too, so that a root list shows whether each was resolved.
const LINKED: World = {
    env: { HOME, CLAUDE_CONFIG_DIR: '/etc/claude' },
    entries: ['.claude', '.claude2', '.cache', 'projects'],
    real: {
        '/home/u/.claude': '/home/u/dotfiles/claude',
        '/home/u/.claude2': '/home/u/.claude2',
        '/home/u/.cache': '/home/u/.cache',
        '/etc/claude': '/srv/claude',
    },
};

test("the roots are the home's entries that start with .claude and the variable, spelled and resolved", async () => {
    const world = stage(LINKED);
    expect(await configRoots(world.engine, HOME)).toEqual({
        roots: ['/home/u/.claude', '/home/u/dotfiles/claude', '/home/u/.claude2', '/etc/claude', '/srv/claude'],
        isListed: true,
    });
    expect(world.calls).not.toContain('stat /home/u/.cache');
    expect(world.calls).not.toContain('stat /home/u/projects');
    expect(world.timers).toHaveLength(world.calls.length);
    expect(world.timers.every((timer) => timer.isCancelled && timer.ms === LOOK_TIMEOUT_MS)).toBe(true);
});

test('a listing that rejects leaves .claude and the variable, each resolved without it', async () => {
    const world = stage({ ...LINKED, list: () => Promise.reject(new Error('EACCES: permission denied')) });
    expect(await configRoots(world.engine, HOME)).toEqual({
        roots: ['/home/u/.claude', '/home/u/dotfiles/claude', '/etc/claude', '/srv/claude'],
        isListed: false,
    });
});

test('a listing that does not answer in time leaves the same roots, both resolved before its timer', async () => {
    const listing = hanging<FsEntry[]>();
    const world = stage({ ...LINKED, list: () => listing.call() });
    const answer = configRoots(world.engine, HOME);
    await listing.made;
    expect(world.calls).toContain('stat /home/u/.claude');
    expect(world.calls).toContain('stat /etc/claude');
    await flush();
    world.fireTimers();
    expect(await answer).toEqual({
        roots: ['/home/u/.claude', '/home/u/dotfiles/claude', '/etc/claude', '/srv/claude'],
        isListed: false,
    });
});

test('when .claude cannot be resolved either, it stands as spelled', async () => {
    const rejected = stage({
        ...LINKED,
        list: () => Promise.reject(new Error('EIO: i/o error')),
        stat: (path) => (path === '/home/u/.claude' ? Promise.reject(new Error('EIO: i/o error')) : undefined),
    });
    expect(await configRoots(rejected.engine, HOME)).toEqual({
        roots: ['/home/u/.claude', '/etc/claude', '/srv/claude'],
        isListed: false,
    });

    const listing = hanging<FsEntry[]>();
    const resolving = hanging<FsStat>();
    const hung = stage({
        ...LINKED,
        list: () => listing.call(),
        stat: (path) => (path === '/home/u/.claude' ? resolving.call() : undefined),
    });
    const answer = configRoots(hung.engine, HOME);
    await listing.made;
    await resolving.made;
    await flush();
    hung.fireTimers();
    expect(await answer).toEqual({ roots: ['/home/u/.claude', '/etc/claude', '/srv/claude'], isListed: false });
});

test('without the variable the roots are the home alone', async () => {
    const world = stage({ ...LINKED, env: { HOME } });
    expect(await configRoots(world.engine, HOME)).toEqual({
        roots: ['/home/u/.claude', '/home/u/dotfiles/claude', '/home/u/.claude2'],
        isListed: true,
    });
});

// stateRoots

test('the state directory as spelled, and where it lands through a link above it', async () => {
    const plain = stage({ real: { '/home/u/.local/state/sdd': '/home/u/.local/state/sdd' } });
    expect(await stateRoots(plain.engine, HOME)).toEqual(['/home/u/.local/state/sdd']);

    const linked = stage({ real: { '/home/u/.local/state': '/home/u/elsewhere/state' } });
    expect(await stateRoots(linked.engine, HOME)).toEqual([
        '/home/u/.local/state/sdd',
        '/home/u/elsewhere/state/sdd',
    ]);
});

test('a state directory that cannot be placed in time stands as spelled', async () => {
    const looking = hanging<FsStat>();
    const world = stage({ stat: () => looking.call() });
    const answer = stateRoots(world.engine, HOME);
    await looking.made;
    world.fireTimers();
    expect(await answer).toEqual(['/home/u/.local/state/sdd']);
});

// placed

test('an existing file lands at its own real path', async () => {
    const world = stage({ real: { '/home/u/.claude/rules/x.md': '/home/u/dotfiles/rules/x.md' } });
    expect(await placed(world.engine, '/home/u/.claude/rules/x.md')).toBe('/home/u/dotfiles/rules/x.md');
});

test("a file not there yet lands at its folder's real path plus its name", async () => {
    const world = stage({ real: { '/home/u/.claude': '/home/u/dotfiles/claude' } });
    expect(await placed(world.engine, '/home/u/.claude/CLAUDE.md')).toBe('/home/u/dotfiles/claude/CLAUDE.md');
});

test("a file two folders under a missing folder lands at the nearest existing ancestor's real path", async () => {
    const world = stage({ real: { '/w': '/real/w' } });
    expect(await placed(world.engine, '/w/new/dir/file.txt')).toBe('/real/w/new/dir/file.txt');
    expect(world.calls).toEqual(['stat /w/new/dir/file.txt', 'stat /w/new/dir', 'stat /w/new', 'stat /w']);
    expect(world.timers.every((timer) => timer.isCancelled && timer.ms === LOOK_TIMEOUT_MS)).toBe(true);
});

test('a path with no existing ancestor cannot be placed', async () => {
    const world = stage();
    expect(await placed(world.engine, '/a/b')).toBeUndefined();
    expect(world.calls).toEqual(['stat /a/b', 'stat /a', 'stat /']);
});

test('a call that does not answer in time cannot be placed, and no ancestor is asked after it', async () => {
    const looking = hanging<FsStat>();
    const world = stage({
        real: { '/w': '/real/w' },
        stat: (path) => (path === '/w/new' ? looking.call() : undefined),
    });
    const answer = placed(world.engine, '/w/new/file.txt');
    await looking.made;
    await flush();
    world.fireTimers();
    expect(await answer).toBeUndefined();
    expect(world.calls).toEqual(['stat /w/new/file.txt', 'stat /w/new']);
});

test('a path that stats without a real path cannot be placed', async () => {
    const world = stage({
        stat: () => Promise.resolve({ kind: 'other', size: 0, mtimeMs: 0, isLink: true }),
    });
    expect(await placed(world.engine, '/w/dangling')).toBeUndefined();
});
