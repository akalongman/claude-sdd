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
    expect(FENCE_ROWS).toHaveLength(267);
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

// Judging a command's arguments is counted by the work it does: the home's characters for each argument spelled from
// the home, each candidate an argument holds, each part matched. After a prefix command every `rm` is read with every
// word after it, and a short argument spelled from the home is judged several times over; counted by its characters
// alone, such a command took half a second to refuse. The first five are the review's (the first one the calibration
// row, quick before too); the last two put a path part's pattern and a deep home under the same count. Each is refused
// in time, and so are the hook's scan and its .catch handler's second scan of the same command together.
const HOME_LONGER = '/home/longman';
const HOME_DEEP = `/${'h'.repeat(60)}/${'u'.repeat(60)}/${'x'.repeat(60)}`;
const JUDGED: ReadonlyArray<readonly [string, string, string]> = [
    ['sudo, 805 rm and a path', `sudo ${'rm '.repeat(805)}/home/u/.local/state/x`, HOME],
    ['sudo, rm -=~/a 600 times', `sudo ${'rm -=~/a '.repeat(600)}`, HOME],
    ['sudo, 150 rm, -=~/a 600 times', `sudo ${'rm '.repeat(150)}${'-=~/a '.repeat(600)}`, HOME_LONGER],
    ['sudo, 16 rm, -=~/a 4,500 times', `sudo ${'rm '.repeat(16)}${'-=~/a '.repeat(4_500)}`, HOME_LONGER],
    ['sudo, 8 rm, -=~/a 8,000 times', `sudo ${'rm '.repeat(8)}${'-=~/a '.repeat(8_000)}`, HOME_LONGER],
    ['sudo, 60 cp, a pattern 600 times', `sudo ${'cp '.repeat(60)}${'~/.l*/s*/s*x '.repeat(600)}`, HOME_LONGER],
    ['sudo, 16 rm, -=~/a 4,500 times, a deep home', `sudo ${'rm '.repeat(16)}${'-=~/a '.repeat(4_500)}`, HOME_DEEP],
];

for (const [name, command, home] of JUDGED) {
    test(`judging is counted by its work: ${name} is refused in time, twice over too`, async () => {
        const start = performance.now();
        const first = shellHits(command, home).map(({ what }) => what);
        const firstMs = performance.now() - start;
        const second = shellHits(command, home).map(({ what }) => what);
        const bothMs = performance.now() - start;
        expect(first).toEqual(TOO_COMPLEX);
        expect(second).toEqual(TOO_COMPLEX);
        expect(firstMs).toBeLessThan(TIME_BOUND_MS);
        expect(bothMs).toBeLessThan(2 * TIME_BOUND_MS);
    });
}

// The count leaves an ordinary command its room: a file program with 1,500 paths is judged to its end, and names the
// one path among them that the fence protects.
test('a long list of paths is judged to its end', async () => {
    const paths = '/home/u/projects/app/build/out.o '.repeat(1_500);
    const read = timed(`rm -f ${paths}`);
    expect(read.hits).toEqual([]);
    expect(read.ms).toBeLessThan(TIME_BOUND_MS);
    expect(timed(`rm -f ${paths}~/.local/state/sdd/noask`).hits).toEqual(['switching noask']);
    expect(timed(`sudo rm -f ${paths}~/.local/state/sdd/noask`).hits).toEqual(['switching noask']);
});

// A here-document left open by a substitution. A substitution that closes on a here-document it opened, its body not
// read, makes bash take that body from the lines after the close, before the bodies of the line's own here-documents.
// The scan does not follow that order and refuses to read the command: one hit of its own, alone, whatever else the
// command holds. (tests/fence-rows.txt holds the shapes bash was run on; these are the forms beside them.)
const LEFT_OPEN: ReadonlyArray<FenceWhat> = ['a here-document left open by a substitution'];
const LEFT_OPEN_FORMS: ReadonlyArray<readonly [string, string]> = [
    ['a command substitution', 'x=$(cat <<B)'],
    ['an input process substitution', 'diff <(cat <<B) a'],
    ['an output process substitution', 'tee >(cat <<B)'],
    ['a ${ ...; } substitution', 'x=${ cat <<B; }'],
    ['a ${| ...; } substitution', 'x=${| cat <<B; }'],
    ['a substitution in double quotes', 'x="$(cat <<B)"'],
    ['a substitution in a parameter expansion', 'x=${y:-$(cat <<B)}'],
    ['a substitution in a substitution, the inner one', 'x=$(echo $(cat <<B) )'],
    ['a substitution in a substitution, the outer one', 'x=$(cat <<B; echo $(true) )'],
    ['a substitution in a $((', 'x=$(( $(cat <<B) 1 ))'],
    ['a substitution in a (( where a command stands', '(( $(cat <<B) 1 ))'],
    ['a substitution in an arithmetic for', 'for (( i = $(cat <<B); i < 1; i++ )); do :; done'],
    ['a substitution in a $[', 'x=$[ $(cat <<B) 1 ]'],
    ['a substitution in a subscript', 'a[$(cat <<B)]=x'],
    ['a substitution in a here-document delimiter', 'cat <<"$(cat <<B)"'],
    ['a <<- opener', 'x=$(cat <<-B)'],
    ['a substitution that read one body and left another open', 'x=$(cat <<A\na\nA\ncat <<B)'],
    ['one opened after a line end inside', 'x=$(true\ncat <<B)'],
];

for (const [name, opening] of LEFT_OPEN_FORMS) {
    test(`a here-document left open by ${name} is refused, whatever else the command holds`, async () => {
        for (const rest of ['', '\ngit push\nB\nnoask global off', '; git push', '\nB\ngit push']) {
            for (const command of [`${opening}${rest}`, `noask global off; ${opening}${rest}`]) {
                expect(timed(command).hits, command).toEqual(LEFT_OPEN);
            }
        }
    });
}

// What is no refusal, each with the hits it had before: a here-document opened outside the substitution, which is the
// line's own, also when the substitution spans the line's end; one whose body the substitution holds; one left open in
// a text read as a text of its own, a backtick substitution's, which ends with that text in bash too; a shift of an
// arithmetic text, an opener only in that text's reading as commands, also where a comparison before it reads there
// as a process substitution; a here-string; and a substitution that the command's end cuts short.
const NOT_LEFT_OPEN: ReadonlyArray<readonly [string, ReadonlyArray<FenceWhat>]> = [
    [': <<A; x=$(echo hi)\ngit push\nA\nnoask global off', ['switching noask']],
    ['cat <<A <<B; x=$(echo hi)\ngit push\nA\ngit push\nB\nnoask global off', ['switching noask']],
    [': <<A; x=$(true\nA\n)\ngit push', ['a push']],
    ['x=$(cat <<B\ngit push\nB\n); noask global off', ['switching noask']],
    ['git commit -m "$(cat <<\'EOF\'\nA title\n\nIts body.\nEOF\n)"\ngit push', ['a push']],
    ['x=`cat <<B`\ngit push', ['a push']],
    ['x=`echo $(cat <<B)`\ngit push', ['a push']],
    ['echo "`echo $(cat <<B)`"\ngit push', ['a push']],
    ['echo $((1<<2))\ngit push', ['a push']],
    ['x=$(( n<(1<<10) ))\ngit push', ['a push']],
    ['x=$(( n>(1<<10) ))\ngit push', ['a push']],
    ['if (( n<(1<<10) )); then git push; fi', ['a push']],
    ['for (( i = 0; i<(1<<n); i++ )); do git push; done', ['a push']],
    ['y=$(echo $(( i<(1<<n) )))\ngit push', ['a push']],
    ['x=$((echo 1<<2) )\ngit push', ['a push']],
    ['a[n<(1<<2)]=x\ngit push', ['a push']],
    ['x=$(grep a <<<"$y"); git push', ['a push']],
    ['x=$(cat <<B\ngit push', []],
    ['cat <<B\ngit push', []],
];

for (const [command, hits] of NOT_LEFT_OPEN) {
    test(`no here-document is left open by a substitution in ${JSON.stringify(command)}`, async () => {
        expect(shellHits(command, HOME).map(({ what }) => what)).toEqual(hits);
    });
}

// A (( that is no arithmetic is a subshell in a subshell, read as the spaced ( ( is. The arithmetic reading that did
// not fit read the line's here-document at the line end inside its substitution; the reading that follows finds that
// here-document waiting again, and reads it there as the spaced form does, so the line with the odd quote is a body in
// both and the push after it is read. Not in the table: bash does not read a here-document's body inside a
// substitution that spans a line end (the table's notes on a `$(` that shares the queue), so it differs on both forms.
// A here-document that the substitution itself opens and leaves open is a refusal in both forms alike.
test('a (( that is no arithmetic is read as ( ( is, the here-document it read put back', async () => {
    const rest = "\nit's\nEOF\n)); true)\ngit push";
    const spaced = shellHits(`: <<EOF; ( (x $(true${rest}`, HOME).map(({ what }) => what);
    expect(shellHits(`: <<EOF; ((x $(true${rest}`, HOME).map(({ what }) => what)).toEqual(spaced);
    expect(spaced).toEqual(['a push']);
    const open = '\ngit push\nEOF\nnoask global off';
    expect(shellHits(`( (x $(cat <<EOF)); true)${open}`, HOME).map(({ what }) => what)).toEqual(LEFT_OPEN);
    expect(shellHits(`((x $(cat <<EOF)); true)${open}`, HOME).map(({ what }) => what)).toEqual(LEFT_OPEN);
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
        'a here-document left open by a substitution',
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
