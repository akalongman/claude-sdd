// The fence: what a shell call or an edit names that needs the owner. shellHits reads a shell command as bash cuts it
// into simple commands, one scan from left to right that keeps track of quotes, comments, here-documents,
// substitutions and arithmetic (where a shift opens no here-document, and a double parenthesis is read as commands as
// well), and names each push, pull request and merge request, and each call that switches noask or writes its state
// directory (tests/fence-rows.txt holds the table this reading is held to, and tests/check-fence-rows.sh holds that
// table against bash itself). It reads each nested text once per reading and counts its work: a command it cannot read
// to its end within WORK_LIMIT, or at all, is named as too complex to read, which the guard refuses in every session.
// configRoots, stateRoots, placed, spelled, isUnder and startsLikeConfig judge an edit's path, by its spelling and by
// where it lands. Every file call goes through inTime.
import type { EngineInterface, FsStat } from 'claude-code';
import { inTime } from './marker';

export type FenceWhat =
    | 'a push'
    | 'a pull request'
    | 'a merge request'
    | 'a push other than a plain one'
    | 'switching noask'
    | 'an edit under the configuration directory'
    | 'a command too complex to read';

export type FenceHit = { readonly what: FenceWhat };

// One character of a word's literal value, and whether quoting made it literal: a quoted *, ? or [ is no pattern.
type Char = { readonly value: string; readonly isQuoted: boolean };

// A word: its literal value's characters, each substitution in it one UNKNOWN character, and that value; whether it
// holds a $, a backtick or a process substitution outside single quotes; its text as written; and whether it is a
// NAME=value word. The value and the last are worked out once, as the word is read.
type Word = {
    readonly chars: ReadonlyArray<Char>;
    readonly value: string;
    readonly isExpanding: boolean;
    readonly raw: string;
    readonly isAssignment: boolean;
};

type Redirection = { readonly operator: string; readonly target: Word | undefined };

// A simple command as the scan collects it, with the hits of the substitutions written in it.
type SimpleCommand = { readonly words: Word[]; readonly redirections: Redirection[]; readonly inner: FenceWhat[] };

// A here-document opened on the current line: its body starts at the line's end. `isLeftOpen` marks one that a
// substitution in the line opened and left open: bash reads its body as that substitution ends, so before the bodies
// of the line's own here-documents.
type Pending = { readonly delimiter: string; readonly isTabStripped: boolean; readonly isLeftOpen: boolean };

// The work of one call of shellHits, shared by every scanner of the call: the steps taken, which WORK_LIMIT bounds, and
// the hits of each text read as a text of its own, kept by the text, so that a text nested in several readings is read
// once.
type Run = { steps: number; readonly texts: Map<string, ReadonlyArray<FenceWhat>> };

// What a reading of arithmetic on the scan's own place came to, kept by its place, its opening and the queue it found,
// so that a place read again is not read again: whether it closed, where the scan then stood, its substitutions' hits,
// and the queue it left, each here-document in it the index of one in the queue it found, or one opened in it.
type Arithmetic = {
    readonly isClosed: boolean;
    readonly index: number;
    readonly hits: ReadonlyArray<FenceWhat>;
    readonly pending: ReadonlyArray<number | Pending>;
};

// The scan's place in a text, which it moves, the here-documents waiting for the line's end, the call's work, and the
// readings of arithmetic made in this text.
type Scanner = {
    readonly text: string;
    index: number;
    readonly pending: Pending[];
    readonly run: Run;
    readonly arithmetic: Map<string, Arithmetic>;
};

// Where the scan stood and the here-documents it waited for, to put it back after a reading that did not fit.
type Mark = { readonly index: number; readonly pending: ReadonlyArray<Pending> };

// What a list of commands ends at: the text's end, a `)` that closes a substitution, a `}` that closes `${ ...; }`.
type Closer = 'end' | 'parenthesis' | 'brace';

// The home's path as characters, the state directory's parts, and the three folders above it in the home.
type Places = {
    readonly home: ReadonlyArray<Char>;
    readonly state: ReadonlyArray<string>;
    readonly above: ReadonlyArray<ReadonlyArray<string>>;
};

// How a command came to be read: behind a prefix command, and after a NAME=value word of its simple command.
type Reading = { readonly isPrefixed: boolean; readonly isAssigned: boolean };

// The value of a part of a word the scan does not know, a substitution's: it equals no name.
const UNKNOWN: Char = { value: '\u0000', isQuoted: true };
const SLASH: Char = { value: '/', isQuoted: true };

// The hit of a command the scan could not read to its end, alone in its answer.
const TOO_COMPLEX: FenceWhat = 'a command too complex to read';

// The characters of a word that tell whether it starts with the home: ~ and ~/, ${HOME}, and $HOME before a character
// that ends a name.
const HOME_PREFIX_LENGTH = 8;

// The steps the scan may take for one command; past them the command is too complex to read. A step reads a
// character, looks at one of a simple command's leading words, or handles one hit; looking a reading up, judging a
// simple command and copying a parameter's text are a step for each character they handle, and a line of a
// here-document's body or of a comment, which the scan skips without reading its characters one by one, is a step and
// one more for each 32 characters (SKIPPED_SHIFT). Set so that the slowest command found ends in some 120 ms in the
// plugin kit's runtime, well inside the 1 second a hook's .catch handler has, in which it scans the command again; a
// plain script of some 230 KB, or a here-document's body of some 14 MB, is read to its end.
const WORK_LIMIT = 500_000;
const SKIPPED_SHIFT = 5;

// The characters that end a word outside quotes, but for `<(` and `>(`.
const METACHARACTERS: ReadonlySet<string> = new Set([' ', '\t', '\n', ';', '&', '|', '(', ')', '<', '>']);
const BLANKS: ReadonlySet<string> = new Set([' ', '\t']);

// The redirection operators, longest first: the longest that fits is the one taken.
const OPERATORS: ReadonlyArray<string> = ['&>>', '<<<', '<<-', '&>', '<<', '<>', '<&', '>>', '>|', '>&', '<', '>'];
const HERE_DOCUMENTS: ReadonlySet<string> = new Set(['<<', '<<-']);
const WRITING: ReadonlySet<string> = new Set(['>', '>>', '>|', '&>', '&>>', '>&', '<>']);

// A descriptor: digits, or {NAME}, standing as a word of its own up to the operator.
const DESCRIPTOR = /^(?:[0-9]+|\{[A-Za-z_][A-Za-z0-9_]*\})$/;
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[[^\]]*\])?\+?=/;
const SPECIAL_PARAMETER = /^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-])/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// The leading words a simple command skips, besides NAME=value words and `time` with its options.
const LEADING: ReadonlySet<string> = new Set(['!', '{', 'if', 'then', 'elif', 'else', 'while', 'until', 'do']);
const PREFIXES: ReadonlySet<string> = new Set(['env', 'command', 'exec', 'nohup', 'sudo']);
const FILE_COMMANDS: ReadonlySet<string> = new Set([
    'rm',
    'rmdir',
    'unlink',
    'shred',
    'mv',
    'cp',
    'ln',
    'install',
    'truncate',
    'tee',
    'dd',
    'touch',
    'chmod',
]);
const READ_AFTER_PREFIX: ReadonlySet<string> = new Set(['git', 'gh', 'glab', 'noask', ...FILE_COMMANDS]);
const DECLARERS: ReadonlySet<string> = new Set(['export', 'declare', 'typeset', 'readonly', 'local']);
const VARIABLE_PREFIX = 'SDD_NOASK_';

// The options of git whose value is the next word when they hold no `=`.
const GIT_VALUED: ReadonlySet<string> = new Set([
    '-C',
    '-c',
    '--git-dir',
    '--work-tree',
    '--namespace',
    '--config-env',
    '--attr-source',
    '--super-prefix',
]);

const PUBLICATIONS: ReadonlySet<FenceWhat> = new Set<FenceWhat>(['a push', 'a pull request', 'a merge request']);

// The escapes of a $'...' word that stand for one character each.
const ANSI_C_ESCAPES: Readonly<Record<string, string>> = {
    a: '\u0007',
    b: '\b',
    e: '\u001b',
    E: '\u001b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
    v: '\v',
    '\\': '\\',
    "'": "'",
    '"': '"',
    '?': '?',
};

// inTime's error for a call that did not answer in time (marker.ts).
const TIMED_OUT = 'timed out';

function valueOf(chars: ReadonlyArray<Char>): string {
    return chars.map(({ value }) => value).join('');
}

function literalOf(word: Word | undefined): string {
    return word === undefined ? '' : word.value;
}

// A word's name: the base name of its literal value.
function nameOf(word: Word | undefined): string {
    const value = literalOf(word);
    return value.slice(value.lastIndexOf('/') + 1);
}

function isAssignment(word: Word): boolean {
    return word.isAssignment;
}

function charAt(scanner: Scanner, offset: number): string {
    return scanner.text.charAt(scanner.index + offset);
}

function scannerOf(text: string, run: Run): Scanner {
    return { text, index: 0, pending: [], run, arithmetic: new Map() };
}

// Counts steps of the call's work.
function spend(run: Run, steps: number): void {
    run.steps += steps;
}

// Counts steps of the call's work; false once more than WORK_LIMIT are taken.
function isWithinLimit(run: Run, steps: number): boolean {
    spend(run, steps);
    return run.steps <= WORK_LIMIT;
}

// Counts steps of a scan, one unless said; once the limit is spent the scan stands at its text's end, so that every
// loop of the scan ends there and returns, and shellHits answers TOO_COMPLEX.
function isScanning(scanner: Scanner, steps = 1): boolean {
    if (isWithinLimit(scanner.run, steps)) {
        return true;
    }
    scanner.index = scanner.text.length;
    return false;
}

function quoted(text: string): Char[] {
    return [...text].map((value) => ({ value, isQuoted: true }));
}

function newCommand(): SimpleCommand {
    return { words: [], redirections: [], inner: [] };
}

function markOf(scanner: Scanner): Mark {
    return { index: scanner.index, pending: [...scanner.pending] };
}

function backTo(scanner: Scanner, mark: Mark): void {
    scanner.index = mark.index;
    scanner.pending.splice(0, scanner.pending.length, ...mark.pending);
}

// A path with `.`, `..` and empty parts folded, absolute.
function folded(path: string): string {
    const parts: string[] = [];
    for (const part of path.split('/')) {
        if (part === '..') {
            parts.pop();
        } else if (part !== '' && part !== '.') {
            parts.push(part);
        }
    }
    return `/${parts.join('/')}`;
}

function joinedPath(directory: string, rest: string): string {
    return directory === '/' ? `/${rest}` : `${directory}/${rest}`;
}

// The scan

// Reads to the end of a single-quoted string, its characters quoted.
function readSingleQuoted(scanner: Scanner, chars: Char[]): void {
    scanner.index += 1;
    while (scanner.index < scanner.text.length && isScanning(scanner)) {
        const char = charAt(scanner, 0);
        scanner.index += 1;
        if (char === "'") {
            return;
        }
        chars.push({ value: char, isQuoted: true });
    }
}

// The character a backslash escape of a $'...' word stands for, the scan put past it.
function ansiCEscape(scanner: Scanner): string {
    const rest = scanner.text.slice(scanner.index + 1);
    const forms: ReadonlyArray<readonly [RegExp, (digits: string) => number]> = [
        [/^([0-7]{1,3})/, (digits) => Number.parseInt(digits, 8) & 0xff],
        [/^x([0-9A-Fa-f]{1,2})/, (digits) => Number.parseInt(digits, 16)],
        [/^u([0-9A-Fa-f]{1,4})/, (digits) => Number.parseInt(digits, 16)],
        [/^U([0-9A-Fa-f]{1,8})/, (digits) => Math.min(Number.parseInt(digits, 16), 0x10ffff)],
        [/^c([\s\S])/, (digits) => digits.charCodeAt(0) & 0x1f],
    ];
    for (const [form, code] of forms) {
        const match = form.exec(rest);
        if (match !== null) {
            scanner.index += 1 + match[0].length;
            return String.fromCodePoint(code(match[1] ?? ''));
        }
    }
    const next = rest.charAt(0);
    scanner.index += next === '' ? 1 : 2;
    return ANSI_C_ESCAPES[next] ?? `\\${next}`;
}

// Reads a $'...' word's text, from after its opening quote, with its escapes as bash reads them.
function readAnsiC(scanner: Scanner, chars: Char[]): void {
    while (scanner.index < scanner.text.length && isScanning(scanner)) {
        const char = charAt(scanner, 0);
        if (char === "'") {
            scanner.index += 1;
            return;
        }
        if (char === '\\') {
            chars.push(...quoted(ansiCEscape(scanner)));
            continue;
        }
        chars.push({ value: char, isQuoted: true });
        scanner.index += 1;
    }
}

// The hits of a text read as a text of its own, with a queue of its own, read once in a call: a backtick
// substitution's text, and the text of a double parenthesis read as commands. Its hits depend on the text alone.
function textHits(text: string, run: Run, places: Places): ReadonlyArray<FenceWhat> {
    if (!isWithinLimit(run, text.length)) {
        return [];
    }
    const known = run.texts.get(text);
    if (known !== undefined) {
        spend(run, known.length);
        return known;
    }
    const hits = scanList(scannerOf(text, run), 'end', places);
    run.texts.set(text, hits);
    return hits;
}

// Reads a backtick substitution and returns its hits: its text, with the backslashes bash removes inside it removed,
// is read as a text of its own.
function readBackticks(scanner: Scanner, isInDouble: boolean, places: Places): ReadonlyArray<FenceWhat> {
    let inner = '';
    scanner.index += 1;
    while (scanner.index < scanner.text.length && isScanning(scanner)) {
        const char = charAt(scanner, 0);
        const next = charAt(scanner, 1);
        if (char === '\\' && next !== '') {
            const isRemoved = next === '$' || next === '`' || next === '\\' || (isInDouble && next === '"');
            inner += isRemoved ? next : next === '\n' ? '' : `${char}${next}`;
            scanner.index += 2;
            continue;
        }
        scanner.index += 1;
        if (char === '`') {
            break;
        }
        inner += char;
    }
    return textHits(inner, scanner.run, places);
}

// Reads a parameter expansion `${...}`, its text kept as quoted characters, the hits of the substitutions inside it
// added to `sink`.
function readParameter(scanner: Scanner, chars: Char[], sink: FenceWhat[], places: Places): void {
    const start = scanner.index;
    scanner.index += 2;
    while (scanner.index < scanner.text.length && isScanning(scanner)) {
        const char = charAt(scanner, 0);
        const next = charAt(scanner, 1);
        if (char === '}') {
            scanner.index += 1;
            break;
        }
        if (char === '\\') {
            scanner.index += 2;
        } else if (char === "'") {
            readSingleQuoted(scanner, []);
        } else if (char === '"') {
            readDoubleQuoted(scanner, [], sink, places);
        } else if (char === '`') {
            sink.push(...readBackticks(scanner, false, places));
        } else if (char === '$' && (next === '(' || next === '{' || next === '[')) {
            readDollar(scanner, [], sink, places, false);
        } else {
            scanner.index += 1;
        }
    }
    if (isWithinLimit(scanner.run, scanner.index - start)) {
        chars.push(...quoted(scanner.text.slice(start, scanner.index)));
    }
}

// Reads arithmetic, from after its opening `(` or `[` to the close that matches it, as bash's parser finds that end:
// quotes, escapes and substitutions are read, the substitutions' hits added to `sink`, and nothing else is a command,
// a redirection or a here-document's opener (a shift, `<<`, opens none). Returns whether the close was found; the
// scan then stands past it. A place this scanner read before with a queue of the same here-documents is not read
// again: what that reading came to is given back, with this queue's own here-documents where it kept the ones it found.
function readArithmetic(scanner: Scanner, open: '(' | '[', sink: FenceWhat[], places: Places): boolean {
    const found = [...scanner.pending];
    const key = `${scanner.index} ${open} ${JSON.stringify(found)}`;
    const known = scanner.arithmetic.get(key);
    if (!isScanning(scanner, key.length + (known === undefined ? 0 : known.hits.length + known.pending.length))) {
        return false;
    }
    if (known === undefined) {
        const hits: FenceWhat[] = [];
        const isClosed = scanArithmetic(scanner, open, hits, places);
        const indexes = new Map(found.map((pending, index) => [pending, index]));
        const pending = scanner.pending.map((each) => indexes.get(each) ?? each);
        scanner.arithmetic.set(key, { isClosed, index: scanner.index, hits, pending });
        sink.push(...hits);
        return isClosed;
    }
    const left = known.pending.flatMap((each) =>
        typeof each === 'number' ? found.slice(each, each + 1) : [{ ...each }],
    );
    scanner.index = known.index;
    scanner.pending.splice(0, scanner.pending.length, ...left);
    sink.push(...known.hits);
    return known.isClosed;
}

// readArithmetic's reading itself.
function scanArithmetic(scanner: Scanner, open: '(' | '[', sink: FenceWhat[], places: Places): boolean {
    const close = open === '(' ? ')' : ']';
    let depth = 0;
    while (scanner.index < scanner.text.length && isScanning(scanner)) {
        const char = charAt(scanner, 0);
        if (char === close && depth === 0) {
            scanner.index += 1;
            return true;
        }
        if (char === '\\') {
            scanner.index += 2;
        } else if (char === "'") {
            readSingleQuoted(scanner, []);
        } else if (char === '"') {
            readDoubleQuoted(scanner, [], sink, places);
        } else if (char === '`') {
            sink.push(...readBackticks(scanner, false, places));
        } else if (char === '$') {
            readDollar(scanner, [], sink, places, false);
        } else {
            depth += char === open ? 1 : char === close ? -1 : 0;
            scanner.index += 1;
        }
    }
    return false;
}

// The hits of one text read both as commands and as arithmetic, each kind named as often as the reading that names it
// more often does: those of the commands, then each of the arithmetic's that they have not.
function bothReadings(commands: ReadonlyArray<FenceWhat>, arithmetic: ReadonlyArray<FenceWhat>, run: Run): FenceWhat[] {
    spend(run, commands.length + arithmetic.length);
    const unmatched = new Map<FenceWhat, number>();
    for (const what of commands) {
        unmatched.set(what, (unmatched.get(what) ?? 0) + 1);
    }
    const added: FenceWhat[] = [];
    for (const what of arithmetic) {
        const count = unmatched.get(what) ?? 0;
        if (count === 0) {
            added.push(what);
        } else {
            unmatched.set(what, count - 1);
        }
    }
    return [...commands, ...added];
}

// After a reading on the scan's own place, puts the queue in bash's order: the here-documents that substitutions
// before it on the line left open, then those it left open, then the line's own that waited before it. Bash reads the
// body of a here-document that a substitution left open as that substitution ends, and the line's own after the line.
// The scan's substitutions share the queue, and one that spans a line end has read the line's bodies there: those are
// put back.
function requeued(scanner: Scanner, mark: Mark): void {
    spend(scanner.run, mark.pending.length + scanner.pending.length);
    const waited = new Set(mark.pending);
    const opened = scanner.pending
        .filter((pending) => !waited.has(pending))
        .map((pending) => ({ ...pending, isLeftOpen: true }));
    const leftBefore = mark.pending.filter(({ isLeftOpen }) => isLeftOpen);
    const own = mark.pending.filter(({ isLeftOpen }) => !isLeftOpen);
    scanner.pending.splice(0, scanner.pending.length, ...leftBefore, ...opened, ...own);
}

// Reads a `$((`, from its `$`, and adds its hits to `sink`. Bash reads the text from `$(` to the `)` that matches it
// as a pair, then evaluates it as arithmetic or runs it as a command substitution by a test of that text. The scan
// makes no such test and keeps the hits of both readings: the arithmetic one's, read on the scan's own place, and
// those of the text read as a text of its own, as a command substitution is (`$((1+2)*(3))`, `$((git push) )`).
// Whichever reading bash takes, it reads the here-documents a substitution inside left open before the line's own.
// One that does not close is read as `$(` is.
function readArithmeticExpansion(scanner: Scanner, sink: FenceWhat[], places: Places): void {
    scanner.index += 2;
    const mark = markOf(scanner);
    const arithmetic: FenceWhat[] = [];
    if (!readArithmetic(scanner, '(', arithmetic, places)) {
        backTo(scanner, mark);
        sink.push(...scanList(scanner, 'parenthesis', places));
        return;
    }
    requeued(scanner, mark);
    const text = scanner.text.slice(mark.index, scanner.index - 1);
    sink.push(...bothReadings(textHits(text, scanner.run, places), arithmetic, scanner.run));
}

// Reads a `$[...]`, bash's older arithmetic expansion, from its `$`: its substitutions' hits are added to `sink` and
// its value is UNKNOWN. A `$[` that does not close leaves its `$` as it stands.
function readBracketExpansion(scanner: Scanner, chars: Char[], sink: FenceWhat[], places: Places): void {
    const mark = markOf(scanner);
    const inner: FenceWhat[] = [];
    scanner.index += 2;
    if (readArithmetic(scanner, '[', inner, places)) {
        sink.push(...inner);
        chars.push(UNKNOWN);
        return;
    }
    backTo(scanner, mark);
    chars.push(...quoted('$'));
    scanner.index += 1;
}

// Reads a `[` that follows a name where an assignment may stand: an array's subscript, which bash reads as arithmetic
// (`a[1<<2]=x`), kept in the word as written, its substitutions' hits added to `sink`. A `[` that does not close is
// one character of the word. Returns whether the subscript holds a `$` or a backtick.
function readSubscript(scanner: Scanner, chars: Char[], sink: FenceWhat[], places: Places): boolean {
    const mark = markOf(scanner);
    const inner: FenceWhat[] = [];
    scanner.index += 1;
    if (!readArithmetic(scanner, '[', inner, places)) {
        backTo(scanner, mark);
        chars.push({ value: '[', isQuoted: false });
        scanner.index += 1;
        return false;
    }
    const subscript = scanner.text.slice(mark.index, scanner.index);
    spend(scanner.run, subscript.length);
    sink.push(...inner);
    chars.push(...quoted(subscript));
    return /[$`]/.test(subscript);
}

// Reads an arithmetic command, from its first `(`: the text to the `)` that matches the second `(`, which a second `)`
// must follow, as bash reads one where a reserved word may stand. Bash evaluates it as arithmetic; the scan adds to
// `sink` the hits of that reading, its substitutions', and of a reading as commands too, the text inside the outer
// pair read as a text of its own (so `((git push))` is a push). An arithmetic for (`isForLoop`) has no reading as
// commands. The queue is then put in bash's order, as after a `$((`. Returns false, the scan put back where it stood,
// when no `))` ends it there: bash then reads a subshell in a subshell (`((echo a); git push)`).
function readArithmeticCommand(scanner: Scanner, sink: FenceWhat[], places: Places, isForLoop: boolean): boolean {
    const mark = markOf(scanner);
    const arithmetic: FenceWhat[] = [];
    scanner.index += 2;
    if (!readArithmetic(scanner, '(', arithmetic, places) || charAt(scanner, 0) !== ')') {
        backTo(scanner, mark);
        return false;
    }
    scanner.index += 1;
    requeued(scanner, mark);
    const text = scanner.text.slice(mark.index + 1, scanner.index - 1);
    const commands = isForLoop ? [] : textHits(text, scanner.run, places);
    sink.push(...bothReadings(commands, arithmetic, scanner.run));
    return true;
}

// Reads what a `$` starts: a $'...' or $"..." word, a substitution or arithmetic (its hits added to `sink`, its value
// UNKNOWN), a parameter, or a `$` that starts nothing, kept as it stands.
function readDollar(scanner: Scanner, chars: Char[], sink: FenceWhat[], places: Places, isInDouble: boolean): void {
    const next = charAt(scanner, 1);
    const after = charAt(scanner, 2);
    if (!isInDouble && next === "'") {
        scanner.index += 2;
        readAnsiC(scanner, chars);
    } else if (!isInDouble && next === '"') {
        scanner.index += 1;
        readDoubleQuoted(scanner, chars, sink, places);
    } else if (next === '(' && after === '(') {
        readArithmeticExpansion(scanner, sink, places);
        chars.push(UNKNOWN);
    } else if (next === '[') {
        readBracketExpansion(scanner, chars, sink, places);
    } else if (next === '(') {
        scanner.index += 2;
        sink.push(...scanList(scanner, 'parenthesis', places));
        chars.push(UNKNOWN);
    } else if (next === '{' && (BLANKS.has(after) || after === '\n' || after === '|')) {
        scanner.index += after === '|' ? 3 : 2;
        sink.push(...scanList(scanner, 'brace', places));
        chars.push(UNKNOWN);
    } else if (next === '{') {
        readParameter(scanner, chars, sink, places);
    } else {
        const name = SPECIAL_PARAMETER.exec(scanner.text.slice(scanner.index + 1))?.[0] ?? '';
        if (isScanning(scanner, name.length)) {
            chars.push(...quoted(scanner.text.slice(scanner.index, scanner.index + 1 + name.length)));
            scanner.index += 1 + name.length;
        }
    }
}

// Reads a double-quoted string; returns whether it held a `$` or a backtick.
function readDoubleQuoted(scanner: Scanner, chars: Char[], sink: FenceWhat[], places: Places): boolean {
    let isExpanding = false;
    scanner.index += 1;
    while (scanner.index < scanner.text.length && isScanning(scanner)) {
        const char = charAt(scanner, 0);
        const next = charAt(scanner, 1);
        if (char === '"') {
            scanner.index += 1;
            break;
        }
        if (char === '\\' && next === '\n') {
            scanner.index += 2;
        } else if (char === '\\' && next !== '' && '$`"\\'.includes(next)) {
            chars.push({ value: next, isQuoted: true });
            scanner.index += 2;
        } else if (char === '$') {
            isExpanding = true;
            readDollar(scanner, chars, sink, places, true);
        } else if (char === '`') {
            isExpanding = true;
            sink.push(...readBackticks(scanner, true, places));
            chars.push(UNKNOWN);
        } else {
            chars.push({ value: char, isQuoted: true });
            scanner.index += 1;
        }
    }
    return isExpanding;
}

// Whether the scan stands at the end of a word: at the text's end or at a metacharacter that starts no process
// substitution.
function isAtWordEnd(scanner: Scanner): boolean {
    const char = charAt(scanner, 0);
    const isProcess = (char === '<' || char === '>') && charAt(scanner, 1) === '(';
    return char === '' || (METACHARACTERS.has(char) && !isProcess);
}

// Reads one word; the hits of the substitutions in it are added to `sink`. Where an assignment may stand
// (`isAssignable`), a `[` after a name opens an array's subscript, which bash reads as arithmetic (`a[1<<2]=x`). Only
// the word's first `[` can follow a name, so the later ones are not tested.
function readWord(scanner: Scanner, sink: FenceWhat[], places: Places, isAssignable = false): Word {
    const start = scanner.index;
    const chars: Char[] = [];
    let isExpanding = false;
    let isSubscriptPlace = isAssignable;
    while (!isAtWordEnd(scanner) && isScanning(scanner)) {
        const char = charAt(scanner, 0);
        const next = charAt(scanner, 1);
        const isSubscript = char === '[' && isSubscriptPlace && NAME.test(scanner.text.slice(start, scanner.index));
        isSubscriptPlace &&= char !== '[';
        if (char === '\\' && next === '\n') {
            scanner.index += 2;
        } else if (isSubscript) {
            isExpanding = readSubscript(scanner, chars, sink, places) || isExpanding;
        } else if (char === '\\') {
            chars.push({ value: next === '' ? char : next, isQuoted: true });
            scanner.index += next === '' ? 1 : 2;
        } else if (char === "'") {
            readSingleQuoted(scanner, chars);
        } else if (char === '"') {
            isExpanding = readDoubleQuoted(scanner, chars, sink, places) || isExpanding;
        } else if (char === '$') {
            isExpanding = true;
            readDollar(scanner, chars, sink, places, false);
        } else if (char === '`') {
            isExpanding = true;
            sink.push(...readBackticks(scanner, false, places));
            chars.push(UNKNOWN);
        } else if (char === '<' || char === '>') {
            isExpanding = true;
            scanner.index += 2;
            sink.push(...scanList(scanner, 'parenthesis', places));
            chars.push(UNKNOWN);
        } else {
            chars.push({ value: char, isQuoted: false });
            scanner.index += 1;
        }
    }
    const value = valueOf(chars);
    return {
        chars,
        value,
        isExpanding,
        raw: scanner.text.slice(start, scanner.index),
        isAssignment: ASSIGNMENT.test(value),
    };
}

// A here-document's delimiter: the word's text with its quotes and backslashes removed, and nothing expanded.
function quoteRemoved(raw: string): string {
    let out = '';
    let index = 0;
    while (index < raw.length) {
        const char = raw.charAt(index);
        const next = raw.charAt(index + 1);
        if (char === '\\') {
            out += next === '\n' ? '' : next;
            index += 2;
        } else if (char === "'") {
            const end = raw.indexOf("'", index + 1);
            const stop = end < 0 ? raw.length : end;
            out += raw.slice(index + 1, stop);
            index = stop + 1;
        } else if (char === '"') {
            index += 1;
            while (index < raw.length && raw.charAt(index) !== '"') {
                const inner = raw.charAt(index);
                const escaped = raw.charAt(index + 1);
                const isEscape = inner === '\\' && escaped !== '' && '$`"\\\n'.includes(escaped);
                out += isEscape ? (escaped === '\n' ? '' : escaped) : inner;
                index += isEscape ? 2 : 1;
            }
            index += 1;
        } else {
            out += char;
            index += 1;
        }
    }
    return out;
}

function skipBlanks(scanner: Scanner): void {
    while (isScanning(scanner)) {
        if (BLANKS.has(charAt(scanner, 0))) {
            scanner.index += 1;
        } else if (charAt(scanner, 0) === '\\' && charAt(scanner, 1) === '\n') {
            scanner.index += 2;
        } else {
            return;
        }
    }
}

// Reads a redirection from its operator: its target, the rest of the word or the next word, is no word of the command;
// a here-document's opener queues its body.
function readRedirection(scanner: Scanner, command: SimpleCommand, places: Places): void {
    const operator = OPERATORS.find((each) => scanner.text.startsWith(each, scanner.index)) ?? charAt(scanner, 0);
    scanner.index += operator.length;
    skipBlanks(scanner);
    if (isAtWordEnd(scanner)) {
        command.redirections.push({ operator, target: undefined });
    } else if (HERE_DOCUMENTS.has(operator)) {
        const delimiter = quoteRemoved(readWord(scanner, [], places).raw);
        scanner.pending.push({ delimiter, isTabStripped: operator === '<<-', isLeftOpen: false });
    } else {
        command.redirections.push({ operator, target: readWord(scanner, command.inner, places) });
    }
}

// Drops the bodies of the here-documents opened on the line that just ended, each to the line that is its delimiter
// alone.
function readBodies(scanner: Scanner): void {
    for (const { delimiter, isTabStripped } of scanner.pending.splice(0)) {
        while (scanner.index < scanner.text.length) {
            const end = scanner.text.indexOf('\n', scanner.index);
            const stop = end < 0 ? scanner.text.length : end;
            if (!isScanning(scanner, 1 + ((stop - scanner.index) >> SKIPPED_SHIFT))) {
                return;
            }
            const line = scanner.text.slice(scanner.index, stop);
            scanner.index = stop + 1;
            if ((isTabStripped ? line.replace(/^\t+/, '') : line) === delimiter) {
                break;
            }
        }
    }
}

// Each word these two look at is a step of the scan's work.
function isCommandPosition(command: SimpleCommand, run: Run): boolean {
    return command.words.every((word) => {
        spend(run, 1);
        return LEADING.has(literalOf(word));
    });
}

// Whether every word is a leading word, `time` or one of its options, or, with `isAssignmentKept`, a NAME=value word:
// what may stand before the place where bash reads a reserved word, or with assignments an assignment.
function isAllLeading(words: ReadonlyArray<Word>, isAssignmentKept: boolean, run: Run): boolean {
    let isAfterTime = false;
    for (const word of words) {
        spend(run, 1);
        const value = literalOf(word);
        const isTimeOption: boolean = isAfterTime && value.startsWith('-');
        if (!LEADING.has(value) && value !== 'time' && !isTimeOption && !(isAssignmentKept && isAssignment(word))) {
            return false;
        }
        isAfterTime = value === 'time' || isTimeOption;
    }
    return true;
}

// Where a `((` here opens an arithmetic command: 'command' where a reserved word may stand, 'for' after `for` (the
// arithmetic for), undefined elsewhere.
function arithmeticPlace(command: SimpleCommand, run: Run): 'command' | 'for' | undefined {
    const { words } = command;
    const isFor = literalOf(words.at(-1)) === 'for';
    if (!isAllLeading(isFor ? words.slice(0, -1) : words, false, run)) {
        return undefined;
    }
    return isFor ? 'for' : 'command';
}

// Reads a list of commands up to `closer` and returns their hits in order, each substitution's before those of the
// command that holds it. `open` holds the parentheses and the case statements opened in the list, innermost last: a
// `)` closes the innermost parenthesis, ends a pattern of the innermost case, or, with neither open, the list.
function scanList(scanner: Scanner, closer: Closer, places: Places): FenceWhat[] {
    const hits: FenceWhat[] = [];
    const open: Array<'parenthesis' | 'case'> = [];
    let command = newCommand();
    let braces = 0;
    const finish = (): void => {
        if (command.words.length === 0 && command.redirections.length === 0 && command.inner.length === 0) {
            return;
        }
        spend(scanner.run, command.inner.length);
        hits.push(...command.inner, ...commandHits(command, places, scanner.run));
        command = newCommand();
    };
    while (scanner.index < scanner.text.length && isScanning(scanner)) {
        const char = charAt(scanner, 0);
        const next = charAt(scanner, 1);
        if (BLANKS.has(char)) {
            scanner.index += 1;
        } else if (char === '\\' && next === '\n') {
            scanner.index += 2;
        } else if (char === '\n') {
            finish();
            scanner.index += 1;
            readBodies(scanner);
        } else if (char === '#') {
            const end = scanner.text.indexOf('\n', scanner.index);
            const stop = end < 0 ? scanner.text.length : end;
            if (isScanning(scanner, (stop - scanner.index) >> SKIPPED_SHIFT)) {
                scanner.index = stop;
            }
        } else if ((char === '&' && next === '>') || ((char === '<' || char === '>') && next !== '(')) {
            readRedirection(scanner, command, places);
        } else if (char === ';' || char === '&' || char === '|') {
            finish();
            scanner.index += 1;
        } else if (char === '(') {
            const place = next === '(' ? arithmeticPlace(command, scanner.run) : undefined;
            finish();
            if (place === undefined || !readArithmeticCommand(scanner, command.inner, places, place === 'for')) {
                open.push('parenthesis');
                scanner.index += 1;
            }
        } else if (char === ')') {
            scanner.index += 1;
            finish();
            const innermost = open.at(-1);
            if (innermost === 'parenthesis') {
                open.pop();
            } else if (innermost === undefined && closer === 'parenthesis') {
                return hits;
            }
        } else {
            const word = readWord(scanner, command.inner, places, isAllLeading(command.words, true, scanner.run));
            const following = charAt(scanner, 0);
            const isRedirected = (following === '<' || following === '>') && charAt(scanner, 1) !== '(';
            if (isRedirected && DESCRIPTOR.test(word.raw)) {
                readRedirection(scanner, command, places);
                continue;
            }
            if (isCommandPosition(command, scanner.run)) {
                const value = literalOf(word);
                if (word.raw === '}' && closer === 'brace' && braces === 0) {
                    finish();
                    return hits;
                }
                braces += word.raw === '{' ? 1 : word.raw === '}' ? -1 : 0;
                if (value === 'case') {
                    open.push('case');
                } else if (value === 'esac' && open.at(-1) === 'case') {
                    open.pop();
                }
            }
            command.words.push(word);
        }
    }
    finish();
    return hits;
}

// The judging of a simple command

// The path a word's characters name, with a leading ~, $HOME or ${HOME} put as the home, as its parts with `.` and
// `..` folded; undefined when it is not absolute. The tests read the word's first characters only.
function pathOf(chars: ReadonlyArray<Char>, places: Places): ReadonlyArray<ReadonlyArray<Char>> | undefined {
    const value = valueOf(chars.slice(0, HOME_PREFIX_LENGTH));
    const homeLength =
        value === '~' || value.startsWith('~/')
            ? 1
            : value.startsWith('${HOME}')
              ? 7
              : /^\$HOME(?![A-Za-z0-9_])/.test(value)
                ? 5
                : 0;
    const absolute = homeLength === 0 ? chars : places.home.concat(chars.slice(homeLength));
    if (absolute[0]?.value !== '/') {
        return undefined;
    }
    const parts: Char[][] = [];
    let part: Char[] = [];
    for (const char of absolute.concat(SLASH)) {
        if (char.value !== '/') {
            part.push(char);
            continue;
        }
        const name = part.length > 2 ? undefined : valueOf(part);
        if (name === '..') {
            parts.pop();
        } else if (name !== '' && name !== '.') {
            parts.push(part);
        }
        part = [];
    }
    return parts;
}

function isUnquoted(char: Char | undefined, value: string): boolean {
    return char !== undefined && !char.isQuoted && char.value === value;
}

// For each index of a part, the first unquoted `]` at it or after it.
function closesOf(part: ReadonlyArray<Char>): ReadonlyArray<number | undefined> {
    const closes = new Array<number | undefined>(part.length + 1).fill(undefined);
    for (let index = part.length - 1; index >= 0; index -= 1) {
        closes[index] = isUnquoted(part[index], ']') ? index : closes[index + 1];
    }
    return closes;
}

// The index of the `]` that ends a set opened at `open`, or undefined when none does.
function setEnd(
    part: ReadonlyArray<Char>,
    open: number,
    closes: ReadonlyArray<number | undefined>,
): number | undefined {
    let index = open + 1;
    if (isUnquoted(part[index], '!') || isUnquoted(part[index], '^')) {
        index += 1;
    }
    if (part[index]?.value === ']') {
        index += 1;
    }
    return closes[index];
}

// A part of a word as a pattern: a character as written, any one character (an unquoted ?, or a set), or any run of
// characters (an unquoted *, a run of them being one).
type Token = { readonly kind: 'char'; readonly value: string } | { readonly kind: 'one' } | { readonly kind: 'run' };

function tokensOf(part: ReadonlyArray<Char>): ReadonlyArray<Token> {
    const closes = closesOf(part);
    const tokens: Token[] = [];
    for (let index = 0; index < part.length; index += 1) {
        const char = part[index];
        const close = isUnquoted(char, '[') ? setEnd(part, index, closes) : undefined;
        if (isUnquoted(char, '*')) {
            if (tokens.at(-1)?.kind !== 'run') {
                tokens.push({ kind: 'run' });
            }
        } else if (isUnquoted(char, '?') || close !== undefined) {
            tokens.push({ kind: 'one' });
            index = close ?? index;
        } else {
            const value = char?.value ?? '';
            for (let unit = 0; unit < value.length; unit += 1) {
                tokens.push({ kind: 'char', value: value.charAt(unit) });
            }
        }
    }
    return tokens;
}

// Whether the tokens match the whole name: a scan that, on a mismatch, goes back only to the last run it met, so its
// work is bounded by the product of the two lengths.
function isMatched(tokens: ReadonlyArray<Token>, name: string): boolean {
    let token = 0;
    let at = 0;
    let runToken = -1;
    let runAt = 0;
    while (at < name.length) {
        const current = tokens[token];
        if (current?.kind === 'run') {
            runToken = token;
            runAt = at;
            token += 1;
        } else if (current !== undefined && (current.kind === 'one' || current.value === name.charAt(at))) {
            token += 1;
            at += 1;
        } else if (runToken >= 0) {
            token = runToken + 1;
            runAt += 1;
            at = runAt;
        } else {
            return false;
        }
    }
    while (tokens[token]?.kind === 'run') {
        token += 1;
    }
    return token === tokens.length;
}

// Whether a part of a word matches a name: as written, or as a pattern when it holds an unquoted *, ? or [ (a set is
// any one character, and a leading `.` is matched like any other).
function partMatches(part: ReadonlyArray<Char> | undefined, name: string): boolean {
    return part !== undefined && isMatched(tokensOf(part), name);
}

// Whether the characters name the state directory or a path below it.
function namesState(chars: ReadonlyArray<Char>, places: Places): boolean {
    const parts = pathOf(chars, places);
    return (
        parts !== undefined &&
        parts.length >= places.state.length &&
        places.state.every((name, index) => partMatches(parts[index], name))
    );
}

// Whether the characters name one of the three folders above the state directory in the home.
function namesAbove(chars: ReadonlyArray<Char>, places: Places): boolean {
    const parts = pathOf(chars, places);
    return (
        parts !== undefined &&
        places.above.some(
            (above) => parts.length === above.length && above.every((name, index) => partMatches(parts[index], name)),
        )
    );
}

// What an argument names: the whole of it, the part after its first `=`, and, when it starts with `-`, its tail from
// the first `/`, `~` or `$`.
function candidatesOf(word: Word): ReadonlyArray<ReadonlyArray<Char>> {
    const { chars } = word;
    const candidates = [chars];
    const equals = chars.findIndex(({ value }) => value === '=');
    if (equals >= 0) {
        candidates.push(chars.slice(equals + 1));
    }
    const tail = chars.findIndex(({ value }) => value === '/' || value === '~' || value === '$');
    if (chars[0]?.value === '-' && tail >= 0) {
        candidates.push(chars.slice(tail));
    }
    return candidates;
}

// mv's sources: its operands but the last; all of them with a target directory (-t, alone or as the last of a word's
// short options, or --target-directory down to --t) or with --exchange (down to --e).
function sourcesOfMove(args: ReadonlyArray<Word>): ReadonlyArray<Word> {
    const operands: Word[] = [];
    let hasTarget = false;
    let isExchange = false;
    let isOptionsEnd = false;
    for (let index = 0; index < args.length; index += 1) {
        const word = args[index];
        const value = literalOf(word);
        if (word === undefined) {
            continue;
        }
        if (isOptionsEnd || !value.startsWith('-') || value === '-') {
            operands.push(word);
        } else if (value === '--') {
            isOptionsEnd = true;
        } else if (value.startsWith('--')) {
            const [option = ''] = value.slice(2).split('=');
            const isTarget = option !== '' && 'target-directory'.startsWith(option);
            hasTarget ||= isTarget;
            isExchange ||= option !== '' && 'exchange'.startsWith(option);
            index += isTarget && !value.includes('=') ? 1 : 0;
        } else {
            const target = value.indexOf('t', 1);
            hasTarget ||= target >= 0;
            index += target >= 0 && target === value.length - 1 ? 1 : 0;
        }
    }
    return hasTarget || isExchange ? operands : operands.slice(0, -1);
}

// A file program's hit: an argument names the state directory or a path below it; for rm and rmdir an argument names
// a folder above it in the home; for mv a source does.
function isFileHit(name: string, args: ReadonlyArray<Word>, places: Places): boolean {
    const names = (test: (chars: ReadonlyArray<Char>, places: Places) => boolean): boolean =>
        args.some((arg) => candidatesOf(arg).some((chars) => test(chars, places)));
    if (names(namesState)) {
        return true;
    }
    if (name === 'rm' || name === 'rmdir') {
        return names(namesAbove);
    }
    return name === 'mv' && sourcesOfMove(args).some(({ chars }) => namesAbove(chars, places));
}

// A word of a plain push is literal: no unquoted *, ?, [ or {, and no $, backtick or process substitution.
function isLiteralWord(word: Word): boolean {
    return !word.isExpanding && !word.chars.some(({ value, isQuoted }) => !isQuoted && '*?[{'.includes(value));
}

// After push: at most one -u or --set-upstream and at most two other words, a remote and a branch, neither starting
// with - or + nor holding a `:`.
function isPlainTail(words: ReadonlyArray<Word>): boolean {
    let upstreams = 0;
    let operands = 0;
    for (const word of words) {
        const value = literalOf(word);
        if (value === '-u' || value === '--set-upstream') {
            upstreams += 1;
        } else if (value.startsWith('-') || value.startsWith('+') || value.includes(':')) {
            return false;
        } else {
            operands += 1;
        }
    }
    return upstreams <= 1 && operands <= 2;
}

// git's hit: a push, plain or not, or none. `words` start with git's own.
function gitHits(words: ReadonlyArray<Word>, reading: Reading): FenceWhat[] {
    const args = words.slice(1);
    let index = 0;
    while (literalOf(args[index]).startsWith('-')) {
        index += GIT_VALUED.has(literalOf(args[index])) ? 2 : 1;
    }
    if (literalOf(args[index]) !== 'push') {
        return [];
    }
    const before = args.slice(0, index);
    const isPlain =
        !reading.isPrefixed &&
        !reading.isAssigned &&
        (before.length === 0 || (before.length === 2 && literalOf(before[0]) === '-C')) &&
        words.every(isLiteralWord) &&
        isPlainTail(args.slice(index + 1));
    return [isPlain ? 'a push' : 'a push other than a plain one'];
}

// gh's and glab's hit: `noun` then create or new as the first two words left once the options, and the value of -R
// and --repo, are skipped.
function requestHits(args: ReadonlyArray<Word>, noun: string, what: FenceWhat): FenceWhat[] {
    const left: string[] = [];
    for (let index = 0; index < args.length; index += 1) {
        const value = literalOf(args[index]);
        if (value === '-R' || value === '--repo') {
            index += 1;
        } else if (!value.startsWith('-')) {
            left.push(value);
        }
    }
    const [first, second] = left;
    return first === noun && (second === 'create' || second === 'new') ? [what] : [];
}

// The hits of the command named `name`, its words from its own on.
function readingHits(name: string, words: ReadonlyArray<Word>, reading: Reading, places: Places): FenceWhat[] {
    const args = words.slice(1);
    if (name === 'git') {
        return gitHits(words, reading);
    }
    if (name === 'gh') {
        return requestHits(args, 'pr', 'a pull request');
    }
    if (name === 'glab') {
        return requestHits(args, 'mr', 'a merge request');
    }
    if (name === 'noask') {
        const isStatus = args.length === 0 || (args.length === 1 && literalOf(args[0]) === 'status');
        return reading.isAssigned || !isStatus ? ['switching noask'] : [];
    }
    return FILE_COMMANDS.has(name) && isFileHit(name, args, places) ? ['switching noask'] : [];
}

// Each kind once, the publications first.
function ordered(kinds: ReadonlyArray<FenceWhat>): FenceWhat[] {
    const unique = [...new Set(kinds)];
    const isSwitching = (what: FenceWhat): boolean => what === 'switching noask';
    return [...unique.filter((what) => !isSwitching(what)), ...unique.filter(isSwitching)];
}

// A simple command's own hits: its leading words skipped, its NAME=value words and its redirections judged, then its
// command, or every word after a prefix command that names one the fence reads. Judging the command is a step for
// each of its characters, and so is each reading after a prefix command.
function commandHits(command: SimpleCommand, places: Places, run: Run): FenceWhat[] {
    const { words } = command;
    const size = [...words, ...command.redirections.map(({ target }) => target)].reduce(
        (sum, word) => sum + 1 + (word?.chars.length ?? 0),
        0,
    );
    if (!isWithinLimit(run, size)) {
        return [];
    }
    const kinds: FenceWhat[] = [];
    let first = 0;
    let isAssigned = false;
    while (first < words.length) {
        const value = literalOf(words[first]);
        const assigned = ASSIGNMENT.exec(value)?.[1];
        if (assigned !== undefined) {
            isAssigned = true;
            if (assigned.startsWith(VARIABLE_PREFIX)) {
                kinds.push('switching noask');
            }
        } else if (value === 'time') {
            while (literalOf(words[first + 1]).startsWith('-')) {
                first += 1;
            }
        } else if (!LEADING.has(value)) {
            break;
        }
        first += 1;
    }
    const isWritten = command.redirections.some(
        ({ operator, target }) => WRITING.has(operator) && target !== undefined && namesState(target.chars, places),
    );
    if (isWritten) {
        kinds.push('switching noask');
    }
    const name = nameOf(words[first]);
    if (PREFIXES.has(name)) {
        for (let index = first + 1; index < words.length; index += 1) {
            const later = nameOf(words[index]);
            if (READ_AFTER_PREFIX.has(later) && isWithinLimit(run, size)) {
                const isAssignedBefore = isAssigned || words.slice(0, index).some(isAssignment);
                const reading = { isPrefixed: true, isAssigned: isAssignedBefore };
                kinds.push(...readingHits(later, words.slice(index), reading, places));
            }
        }
    } else if (first < words.length) {
        kinds.push(...readingHits(name, words.slice(first), { isPrefixed: false, isAssigned }, places));
        const isDeclared = words.slice(first + 1).some((word) => literalOf(word).startsWith(VARIABLE_PREFIX));
        if (DECLARERS.has(name) && isDeclared) {
            kinds.push('switching noask');
        }
    }
    return ordered(kinds);
}

function placesOf(home: string): Places {
    const homePath = folded(home);
    const homeParts = homePath.split('/').filter((part) => part !== '');
    return {
        home: quoted(homePath),
        state: [...homeParts, '.local', 'state', 'sdd'],
        above: [homeParts, [...homeParts, '.local'], [...homeParts, '.local', 'state']],
    };
}

// The hits of the whole command, or undefined when the scan could not read it to its end: its work passed WORK_LIMIT,
// or it threw, as a nesting deeper than the stack holds does. The work and the readings kept live for this call only.
function hitsOfAll(command: string, home: string): ReadonlyArray<FenceWhat> | undefined {
    const run: Run = { steps: 0, texts: new Map() };
    try {
        const hits = scanList(scannerOf(command, run), 'end', placesOf(home));
        return run.steps <= WORK_LIMIT ? hits : undefined;
    } catch {
        return undefined;
    }
}

// One hit for each simple command of the call that the fence names, in the call's order; empty when none. A command
// the scan cannot read to its end has one hit alone, TOO_COMPLEX, whatever else it holds: it is refused, never passed.
export function shellHits(command: string, home: string): ReadonlyArray<FenceHit> {
    return (hitsOfAll(command, home) ?? [TOO_COMPLEX]).map((what) => ({ what }));
}

// 'a push', 'a pull request' and 'a merge request' are what a session at handsoff may do; every other hit is not.
export function isPublication(hit: FenceHit): boolean {
    return PUBLICATIONS.has(hit.what);
}

// The paths of an edit

// Absolute, `~` expanded, `.` and `..` folded.
export function spelled(path: string, home: string, cwd: string): string {
    const isHome = home !== '' && (path === '~' || path.startsWith('~/'));
    const expanded = isHome ? `${home}${path.slice(1)}` : path;
    return folded(expanded.startsWith('/') ? expanded : `${cwd}/${expanded}`);
}

// Equal to a root or below it.
export function isUnder(path: string, roots: ReadonlyArray<string>): boolean {
    return roots.some((root) => {
        const base = root.endsWith('/') ? root.slice(0, -1) : root;
        return path === base || path.startsWith(`${base}/`);
    });
}

// True for a spelled path whose first part below the home starts with `.claude`.
export function startsLikeConfig(spelledPath: string, home: string): boolean {
    const prefix = joinedPath(folded(home), '');
    return spelledPath.startsWith(prefix) && spelledPath.slice(prefix.length).startsWith('.claude');
}

// The calls, each made as the function runs, so that a call that throws as it is made is a rejection.
async function statOf($: Pick<EngineInterface, 'fs'>, path: string): Promise<FsStat> {
    return $.fs.stat(path, { resolve: true });
}

async function listingOf(
    $: Pick<EngineInterface, 'fs'>,
    path: string,
): Promise<ReadonlyArray<{ readonly name: string }>> {
    return $.fs.list(path);
}

// Where a path lands when it exists, or undefined.
async function realPathOf($: Pick<EngineInterface, 'fs' | 'clock'>, path: string): Promise<string | undefined> {
    const answer = await inTime($, statOf($, path));
    return answer.ok ? answer.value.realPath : undefined;
}

function defined(paths: ReadonlyArray<string | undefined>): ReadonlyArray<string> {
    return [...new Set(paths.filter((path): path is string => path !== undefined))];
}

// Every entry of the home whose name starts with `.claude`, and CLAUDE_CONFIG_DIR, each as spelled and as resolved;
// <home>/.claude whether listed or not, since a write may make it. isListed is false when the home could not be
// listed, by a rejection or a timeout: the roots are then <home>/.claude and the variable's, each also as resolved:
// those two are resolved by calls started together with the listing, which they do not need. A relative
// CLAUDE_CONFIG_DIR stands as resolved alone.
export async function configRoots(
    $: Pick<EngineInterface, 'env' | 'fs' | 'clock'>,
    home: string,
): Promise<{ readonly roots: ReadonlyArray<string>; readonly isListed: boolean }> {
    const homePath = folded(home);
    const own = joinedPath(homePath, '.claude');
    const variable = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? '';
    const isSpelled = variable.startsWith('/') || variable === '~' || variable.startsWith('~/');
    const [listed, ownReal, variableReal] = await Promise.all([
        inTime($, listingOf($, homePath)),
        realPathOf($, own),
        variable === '' ? Promise.resolve(undefined) : realPathOf($, variable),
    ]);
    const names = listed.ok
        ? listed.value.map(({ name }) => name).filter((name) => name.startsWith('.claude') && name !== '.claude')
        : [];
    const others = await Promise.all(
        names.map(async (name) => {
            const path = joinedPath(homePath, name);
            return [path, await realPathOf($, path)];
        }),
    );
    const variableSpelled = isSpelled ? spelled(variable, homePath, homePath) : undefined;
    return {
        roots: defined([own, ownReal, ...others.flat(), variableSpelled, variableReal]),
        isListed: listed.ok,
    };
}

// <home>/.local/state/sdd as spelled and as it resolves (the folder, or its nearest existing ancestor, may be a link).
export async function stateRoots(
    $: Pick<EngineInterface, 'fs' | 'clock'>,
    home: string,
): Promise<ReadonlyArray<string>> {
    const state = joinedPath(folded(home), '.local/state/sdd');
    return defined([state, await placed($, state)]);
}

// Where a path lands: its own real path, else its nearest existing ancestor's real path plus the rest.
// undefined when no ancestor exists or a call does not answer in time. Every file call goes through inTime.
// `path` is absolute, as spelled gives it. A path that stats without a real path (a link that leads nowhere) cannot
// be placed.
export async function placed($: Pick<EngineInterface, 'fs' | 'clock'>, path: string): Promise<string | undefined> {
    const missing: string[] = [];
    let current = folded(path);
    for (;;) {
        const answer = await inTime($, statOf($, current));
        if (answer.ok) {
            const real = answer.value.realPath;
            return real === undefined || missing.length === 0 ? real : joinedPath(real, missing.join('/'));
        }
        if (answer.error === TIMED_OUT || current === '/') {
            return undefined;
        }
        const cut = current.lastIndexOf('/');
        missing.unshift(current.slice(cut + 1));
        current = cut === 0 ? '/' : current.slice(0, cut);
    }
}
