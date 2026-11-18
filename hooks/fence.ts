// The fence: what a shell call or an edit names that needs the owner. shellHits reads a shell command as bash cuts it
// into simple commands, one scan from left to right that keeps track of quotes, comments, here-documents,
// substitutions and arithmetic (where a shift opens no here-document, and a double parenthesis is read as commands as
// well), and names each push, pull request and merge request, and each call that switches noask or writes its state
// directory (tests/fence-rows.txt holds the table this reading is held to, and tests/check-fence-rows.sh holds that
// table against bash itself). configRoots, stateRoots, placed, spelled, isUnder and startsLikeConfig judge an edit's
// path, by its spelling and by where it lands. Every file call goes through inTime.
import type { EngineInterface, FsStat } from 'claude-code';
import { inTime } from './marker';

export type FenceWhat =
    | 'a push'
    | 'a pull request'
    | 'a merge request'
    | 'a push other than a plain one'
    | 'switching noask'
    | 'an edit under the configuration directory';

export type FenceHit = { readonly what: FenceWhat };

// One character of a word's literal value, and whether quoting made it literal: a quoted *, ? or [ is no pattern.
type Char = { readonly value: string; readonly isQuoted: boolean };

// A word: its literal value's characters, each substitution in it one UNKNOWN character; whether it holds a $, a
// backtick or a process substitution outside single quotes; and its text as written.
type Word = { readonly chars: ReadonlyArray<Char>; readonly isExpanding: boolean; readonly raw: string };

type Redirection = { readonly operator: string; readonly target: Word | undefined };

// A simple command as the scan collects it, with the hits of the substitutions written in it.
type SimpleCommand = { readonly words: Word[]; readonly redirections: Redirection[]; readonly inner: FenceWhat[] };

// A here-document opened on the current line: its body starts at the line's end.
type Pending = { readonly delimiter: string; readonly isTabStripped: boolean };

// The scan's place in a text, which it moves, and the here-documents waiting for the line's end.
type Scanner = { readonly text: string; index: number; readonly pending: Pending[] };

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
    return word === undefined ? '' : valueOf(word.chars);
}

// A word's name: the base name of its literal value.
function nameOf(word: Word | undefined): string {
    const value = literalOf(word);
    return value.slice(value.lastIndexOf('/') + 1);
}

function isAssignment(word: Word): boolean {
    return ASSIGNMENT.test(literalOf(word));
}

function charAt(scanner: Scanner, offset: number): string {
    return scanner.text.charAt(scanner.index + offset);
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
    while (scanner.index < scanner.text.length) {
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
    while (scanner.index < scanner.text.length) {
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

// Reads a backtick substitution and returns its hits: its text, with the backslashes bash removes inside it removed,
// is read as a text of its own.
function readBackticks(scanner: Scanner, isInDouble: boolean, places: Places): FenceWhat[] {
    let inner = '';
    scanner.index += 1;
    while (scanner.index < scanner.text.length) {
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
    return scanList({ text: inner, index: 0, pending: [] }, 'end', places);
}

// Reads a parameter expansion `${...}`, its text kept as quoted characters, the hits of the substitutions inside it
// added to `sink`.
function readParameter(scanner: Scanner, chars: Char[], sink: FenceWhat[], places: Places): void {
    const start = scanner.index;
    scanner.index += 2;
    while (scanner.index < scanner.text.length) {
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
    chars.push(...quoted(scanner.text.slice(start, scanner.index)));
}

// Reads arithmetic, from after its opening `(` or `[` to the close that matches it, as bash's parser finds that end:
// quotes, escapes and substitutions are read, the substitutions' hits added to `sink`, and nothing else is a command,
// a redirection or a here-document's opener (a shift, `<<`, opens none). Returns whether the close was found; the
// scan then stands past it.
function readArithmetic(scanner: Scanner, open: '(' | '[', sink: FenceWhat[], places: Places): boolean {
    const close = open === '(' ? ')' : ']';
    let depth = 0;
    while (scanner.index < scanner.text.length) {
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
function bothReadings(commands: ReadonlyArray<FenceWhat>, arithmetic: ReadonlyArray<FenceWhat>): FenceWhat[] {
    const unmatched = [...commands];
    const added: FenceWhat[] = [];
    for (const what of arithmetic) {
        const index = unmatched.indexOf(what);
        if (index < 0) {
            added.push(what);
        } else {
            unmatched.splice(index, 1);
        }
    }
    return [...commands, ...added];
}

// After a reading on the scan's own place, puts the here-documents that waited before it back at the head of the
// queue, ahead of those it left open. Bash keeps a line's here-documents apart from those of a substitution inside it,
// and reads after the line the body of one the substitution left open; the scan's substitutions share the queue, and
// one that spans a line end has read the line's bodies there.
function requeued(scanner: Scanner, mark: Mark): void {
    const isKept = mark.pending.every((pending, index) => scanner.pending[index] === pending);
    const opened = scanner.pending.slice(isKept ? mark.pending.length : 0);
    scanner.pending.splice(0, scanner.pending.length, ...mark.pending, ...opened);
}

// Reads a `$((`, from its `$`, and adds its hits to `sink`. Bash reads the text from `$(` to the `)` that matches it
// as a pair, then evaluates it as arithmetic or runs it as a command substitution by a test of that text. The scan
// makes no such test and keeps the hits of both readings: the arithmetic one's, read on the scan's own place, and
// those of the text read as a text of its own, as a command substitution is (`$((1+2)*(3))`, `$((git push) )`).
// Whichever reading bash takes, the line's here-documents stay apart from the substitution's. One that does not
// close is read as `$(` is.
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
    sink.push(...bothReadings(scanList({ text, index: 0, pending: [] }, 'end', places), arithmetic));
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
    sink.push(...inner);
    chars.push(...quoted(subscript));
    return /[$`]/.test(subscript);
}

// Reads an arithmetic command, from its first `(`: the text to the `)` that matches the second `(`, which a second `)`
// must follow, as bash reads one where a reserved word may stand. Bash evaluates it as arithmetic; the scan adds to
// `sink` the hits of that reading, its substitutions', and of a reading as commands too, the text inside the outer
// pair read as a text of its own (so `((git push))` is a push). An arithmetic for (`isForLoop`) has no reading as
// commands. Returns false, the scan put back where it stood, when no `))` ends it there: bash then reads a subshell
// in a subshell (`((echo a); git push)`).
function readArithmeticCommand(scanner: Scanner, sink: FenceWhat[], places: Places, isForLoop: boolean): boolean {
    const mark = markOf(scanner);
    const arithmetic: FenceWhat[] = [];
    scanner.index += 2;
    if (!readArithmetic(scanner, '(', arithmetic, places) || charAt(scanner, 0) !== ')') {
        backTo(scanner, mark);
        return false;
    }
    scanner.index += 1;
    const text = scanner.text.slice(mark.index + 1, scanner.index - 1);
    const commands = isForLoop ? [] : scanList({ text, index: 0, pending: [] }, 'end', places);
    sink.push(...bothReadings(commands, arithmetic));
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
        chars.push(...quoted(scanner.text.slice(scanner.index, scanner.index + 1 + name.length)));
        scanner.index += 1 + name.length;
    }
}

// Reads a double-quoted string; returns whether it held a `$` or a backtick.
function readDoubleQuoted(scanner: Scanner, chars: Char[], sink: FenceWhat[], places: Places): boolean {
    let isExpanding = false;
    scanner.index += 1;
    while (scanner.index < scanner.text.length) {
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
// (`isAssignable`), a `[` after a name opens an array's subscript, which bash reads as arithmetic (`a[1<<2]=x`).
function readWord(scanner: Scanner, sink: FenceWhat[], places: Places, isAssignable = false): Word {
    const start = scanner.index;
    const chars: Char[] = [];
    let isExpanding = false;
    while (!isAtWordEnd(scanner)) {
        const char = charAt(scanner, 0);
        const next = charAt(scanner, 1);
        if (char === '\\' && next === '\n') {
            scanner.index += 2;
        } else if (char === '[' && isAssignable && NAME.test(scanner.text.slice(start, scanner.index))) {
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
    return { chars, isExpanding, raw: scanner.text.slice(start, scanner.index) };
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
    for (;;) {
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
        scanner.pending.push({ delimiter, isTabStripped: operator === '<<-' });
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
            const line = scanner.text.slice(scanner.index, stop);
            scanner.index = stop + 1;
            if ((isTabStripped ? line.replace(/^\t+/, '') : line) === delimiter) {
                break;
            }
        }
    }
}

function isCommandPosition(command: SimpleCommand): boolean {
    return command.words.every((word) => LEADING.has(literalOf(word)));
}

// Whether every word is a leading word, `time` or one of its options, or, with `isAssignmentKept`, a NAME=value word:
// what may stand before the place where bash reads a reserved word, or with assignments an assignment.
function isAllLeading(words: ReadonlyArray<Word>, isAssignmentKept: boolean): boolean {
    let isAfterTime = false;
    for (const word of words) {
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
function arithmeticPlace(command: SimpleCommand): 'command' | 'for' | undefined {
    const { words } = command;
    const isFor = literalOf(words.at(-1)) === 'for';
    if (!isAllLeading(isFor ? words.slice(0, -1) : words, false)) {
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
        hits.push(...command.inner, ...commandHits(command, places));
        command = newCommand();
    };
    while (scanner.index < scanner.text.length) {
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
            scanner.index = end < 0 ? scanner.text.length : end;
        } else if ((char === '&' && next === '>') || ((char === '<' || char === '>') && next !== '(')) {
            readRedirection(scanner, command, places);
        } else if (char === ';' || char === '&' || char === '|') {
            finish();
            scanner.index += 1;
        } else if (char === '(') {
            const place = next === '(' ? arithmeticPlace(command) : undefined;
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
            const word = readWord(scanner, command.inner, places, isAllLeading(command.words, true));
            const following = charAt(scanner, 0);
            const isRedirected = (following === '<' || following === '>') && charAt(scanner, 1) !== '(';
            if (isRedirected && DESCRIPTOR.test(word.raw)) {
                readRedirection(scanner, command, places);
                continue;
            }
            if (isCommandPosition(command)) {
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
// `..` folded; undefined when it is not absolute.
function pathOf(chars: ReadonlyArray<Char>, places: Places): ReadonlyArray<ReadonlyArray<Char>> | undefined {
    const value = valueOf(chars);
    const homeLength =
        value === '~' || value.startsWith('~/')
            ? 1
            : value.startsWith('${HOME}')
              ? 7
              : /^\$HOME(?![A-Za-z0-9_])/.test(value)
                ? 5
                : 0;
    const absolute = homeLength === 0 ? chars : [...places.home, ...chars.slice(homeLength)];
    if (absolute[0]?.value !== '/') {
        return undefined;
    }
    const parts: Char[][] = [];
    let part: Char[] = [];
    for (const char of [...absolute, SLASH]) {
        if (char.value !== '/') {
            part.push(char);
            continue;
        }
        const name = valueOf(part);
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

// The index of the `]` that ends a set opened at `open`, or undefined when none does.
function setEnd(part: ReadonlyArray<Char>, open: number): number | undefined {
    let index = open + 1;
    if (isUnquoted(part[index], '!') || isUnquoted(part[index], '^')) {
        index += 1;
    }
    if (part[index]?.value === ']') {
        index += 1;
    }
    for (; index < part.length; index += 1) {
        if (isUnquoted(part[index], ']')) {
            return index;
        }
    }
    return undefined;
}

// Whether a part of a word matches a name: as written, or as a pattern when it holds an unquoted *, ? or [ (a set is
// any one character, and a leading `.` is matched like any other).
function partMatches(part: ReadonlyArray<Char> | undefined, name: string): boolean {
    if (part === undefined) {
        return false;
    }
    let source = '';
    for (let index = 0; index < part.length; index += 1) {
        const char = part[index];
        const close = isUnquoted(char, '[') ? setEnd(part, index) : undefined;
        if (isUnquoted(char, '*')) {
            source += '[\\s\\S]*';
        } else if (isUnquoted(char, '?') || close !== undefined) {
            source += '[\\s\\S]';
            index = close ?? index;
        } else {
            source += (char?.value ?? '').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
        }
    }
    return new RegExp(`^${source}$`).test(name);
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
// command, or every word after a prefix command that names one the fence reads.
function commandHits(command: SimpleCommand, places: Places): FenceWhat[] {
    const { words } = command;
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
            if (READ_AFTER_PREFIX.has(later)) {
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

// One hit for each simple command of the call that the fence names, in the call's order; empty when none.
export function shellHits(command: string, home: string): ReadonlyArray<FenceHit> {
    const hits = scanList({ text: command, index: 0, pending: [] }, 'end', placesOf(home));
    return hits.map((what) => ({ what }));
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
