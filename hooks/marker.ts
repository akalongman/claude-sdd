// The noask markers as the plugin's module reads them. The noask command alone writes them (bin/noask's header states
// the four lines); this reader refuses the texts the command refuses, so the two readers agree on every marker
// (hooks/marker.fixtures.ts holds the command's own readings). Every file call goes through inTime, so a file system
// that hangs costs a hook one look's time at most per call.
import type { EngineInterface, Timer } from 'claude-code';

export type MarkerKind = 'global' | 'session';

// A reading of one marker, or of a session: off (no marker), on, expired (read as off) or unreadable (read as on,
// with the error in the text).
export type Reading =
    | { readonly kind: 'off' }
    | {
          readonly kind: 'on';
          readonly generation: string;
          readonly since: string;
          readonly until: string | undefined;
          readonly level: 'noask' | 'handsoff';
      }
    | { readonly kind: 'expired'; readonly until: string }
    | { readonly kind: 'unreadable'; readonly error: string };

// What a call bounded by inTime came to: its value, or why there is none.
type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

// A look at a marker that does not answer in this time is unreadable.
export const LOOK_TIMEOUT_MS = 2_000;

// A session id and an agent id are taken only in this form, as the command takes them.
export const ID_FORM = /^[A-Za-z0-9_-]{1,64}$/;

// The command's own words, never a session id.
const RESERVED_WORDS: ReadonlySet<string> = new Set([
    'status',
    'on',
    'off',
    'global',
    'handsoff',
    'until',
    'count',
    'reset',
    'read',
    'question',
    'denial',
    'continuation',
]);

// A longer marker is unreadable. The command counts bytes; a text over this many characters is over as many bytes,
// and one within it that holds more than ASCII fails the grammar in both readers.
const MARKER_LIMIT = 4_096;

// The grammar, the command's: a time zone offset from 00:00 to 14:00 under either sign, a time to the second at an
// offset, and a generation, a time to the nanosecond at an offset followed by 8 hex characters.
const OFFSET = '[+-](?:(?:0[0-9]|1[0-3]):[0-5][0-9]|14:00)';
const DATE_TIME = '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}';
const TIME_FORM = new RegExp(`^${DATE_TIME}${OFFSET}$`);
const GENERATION_FORM = new RegExp(`^${DATE_TIME}\\.[0-9]{9}${OFFSET}-[0-9a-f]{8}$`);
const LEVELS: ReadonlyArray<'noask' | 'handsoff'> = ['noask', 'handsoff'];

// The four keys, in the order of the marker's lines.
const KEYS = ['generation', 'since', 'until', 'level'] as const;

// What inTime answers for a call that has not answered when its timer fires.
const TIMED_OUT = 'timed out';

const OFF: Reading = { kind: 'off' };

// A value shown in an error as written, when it is printable ASCII with no space at either end.
const PLAIN_VALUE = /^[!-~](?:[ -~]*[!-~])?$/;

// A text whose last word is handsoff: a status line that ends in it lets a session publish.
const ENDS_IN_HANDSOFF = /(?:^|\s)handsoff$/;

// What a rejection says.
export function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function unreadable(error: string): Reading {
    return { kind: 'unreadable', error };
}

// A value from a marker or a message as an error shows it: as written when it is plain, else in JSON's quotes, so
// that no space or control character hides and no error ends in the word handsoff.
function shown(value: string): string {
    return PLAIN_VALUE.test(value) && !ENDS_IN_HANDSOFF.test(value) ? value : JSON.stringify(value);
}

// The instant a marker's time names, when the time reads back as written: the instant written again at the text's
// own offset is the text. Date.parse reads an ISO time with an offset the same in every time zone, but alone it also
// takes 30 February and 24:00, which `date` refuses. The offset is kept as written, so a zero offset reads back under
// either sign, as `date` takes it.
function instantOf(time: string): number | undefined {
    const instant = Date.parse(time);
    if (Number.isNaN(instant)) {
        return undefined;
    }
    const offset = time.slice(-6);
    const offsetMinutes =
        (offset.startsWith('-') ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4)));
    const writtenAgain = `${new Date(instant + offsetMinutes * 60_000).toISOString().slice(0, 19)}${offset}`;
    return writtenAgain === time ? instant : undefined;
}

// The values of a marker's four lines as written, each of its key's form, or the first line's error.
type MarkerValues =
    | {
          readonly ok: true;
          readonly generation: string;
          readonly since: string;
          readonly until: string;
          readonly level: string;
      }
    | { readonly ok: false; readonly error: string };

// Whether `value` is of the form the grammar gives the line of `key`; an empty until is (the global marker's own).
function isOfForm(key: (typeof KEYS)[number], value: string): boolean {
    switch (key) {
        case 'generation':
            return GENERATION_FORM.test(value);
        case 'since':
            return TIME_FORM.test(value);
        case 'until':
            return value === '' || TIME_FORM.test(value);
        case 'level':
            return LEVELS.some((level) => level === value);
        default: {
            const exhaustive: never = key;
            return exhaustive;
        }
    }
}

// The four values of a marker's lines, each line matched against the grammar for its key; or the first error.
function valuesOf(lines: ReadonlyArray<string>): MarkerValues {
    const values: string[] = [];
    for (const [index, key] of KEYS.entries()) {
        const line = lines[index] ?? '';
        if (!line.startsWith(`${key}=`)) {
            return { ok: false, error: `expected ${key}= on line ${index + 1}` };
        }
        const value = line.slice(key.length + 1);
        const isForm = isOfForm(key, value);
        if (value === '' && !isForm) {
            return { ok: false, error: `empty ${key}` };
        }
        if (!isForm) {
            return { ok: false, error: `bad ${key}: ${shown(value)}` };
        }
        values.push(value);
    }
    const [generation = '', since = '', until = '', level = ''] = values;
    return { ok: true, generation, since, until, level };
}

// One marker's text as the command reads it, `kind` saying which marker it is, at `nowMs`: never off, since a text
// was read. The size, the final newline and the count of lines first, then each line against the grammar for its
// key, then the two times, then what the marker's kind allows, then the expiry.
export function parseMarker(text: string, kind: MarkerKind, nowMs: number): Reading {
    if (text.length > MARKER_LIMIT) {
        return unreadable(`the marker is longer than ${MARKER_LIMIT} characters`);
    }
    if (text === '') {
        return unreadable('the marker is empty');
    }
    if (!text.endsWith('\n')) {
        return unreadable('the last line has no newline');
    }
    const lines = text.slice(0, -1).split('\n');
    if (lines.length !== KEYS.length) {
        return unreadable(`${KEYS.length} lines expected, found ${lines.length}`);
    }
    const values = valuesOf(lines);
    if (!values.ok) {
        return unreadable(values.error);
    }
    const { generation, since, until, level } = values;
    if (instantOf(since) === undefined) {
        return unreadable(`bad since: ${shown(since)}`);
    }
    const untilMs = until === '' ? undefined : instantOf(until);
    if (until !== '' && untilMs === undefined) {
        return unreadable(`bad until: ${shown(until)}`);
    }
    const isHandsoff = level === 'handsoff';
    if (kind === 'global' && isHandsoff) {
        return unreadable('handsoff in the global marker');
    }
    if (kind === 'session' && until === '') {
        return unreadable("a session's marker without an until");
    }
    if (untilMs !== undefined && untilMs <= nowMs) {
        return { kind: 'expired', until };
    }
    return {
        kind: 'on',
        generation,
        since,
        until: until === '' ? undefined : until,
        level: isHandsoff ? 'handsoff' : 'noask',
    };
}

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((settle) => {
        resolve = settle;
    });
    return { promise, resolve };
}

// One file call, held no longer than LOOK_TIMEOUT_MS. Never rejects: a rejection gives its message, a call that has
// not answered when the timer fires gives 'timed out'. The timer is $.clock.after's, whose wait is not charged to the
// hook's own time as $.clock.sleep's is, and is cancelled once the call answers. A call left waiting is not
// cancelled.
export async function inTime<T>(
    $: Pick<EngineInterface, 'clock'>,
    call: Promise<T>,
): Promise<{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string }> {
    const answered = call.then(
        (value): Answer<T> => ({ ok: true, value }),
        (error: unknown): Answer<T> => ({ ok: false, error: messageOf(error) }),
    );
    const timedOut = deferred<Answer<T>>();
    let timer: Timer;
    try {
        timer = $.clock.after(LOOK_TIMEOUT_MS, () => timedOut.resolve({ ok: false, error: TIMED_OUT }));
    } catch (error: unknown) {
        return { ok: false, error: messageOf(error) };
    }
    try {
        return await Promise.race([answered, timedOut.promise]);
    } finally {
        timer.cancel();
    }
}

// Why a look failed, as a reading's error.
function lookError(error: string, timedOut: string): string {
    return error === TIMED_OUT ? timedOut : shown(error);
}

// One marker's reading. No file is off. A read that fails is followed by a second look, and a file gone by then is
// off: the marker was removed between the two looks (an off racing the read), never unreadable. Otherwise a failed
// look is unreadable.
async function lookAt(
    $: Pick<EngineInterface, 'fs' | 'clock'>,
    path: string,
    kind: MarkerKind,
    nowMs: number,
): Promise<Reading> {
    const present = await inTime($, $.fs.exists(path));
    if (!present.ok) {
        return unreadable(lookError(present.error, 'marker read timed out'));
    }
    if (!present.value) {
        return OFF;
    }
    const read = await inTime($, $.fs.read(path));
    if (read.ok) {
        return parseMarker(read.value, kind, nowMs);
    }
    const still = await inTime($, $.fs.exists(path));
    return still.ok && !still.value ? OFF : unreadable(lookError(read.error, 'marker read timed out'));
}

// The state directory under HOME, or undefined when HOME is unset or empty.
async function stateDirectoryOf($: Pick<EngineInterface, 'env'>): Promise<string | undefined> {
    const home = await $.env.get('HOME');
    return home === undefined || home === '' ? undefined : `${home}/.local/state/sdd`;
}

// The session's id when it has the id's form, else the reason it has none.
export async function sessionIdOf(
    $: Pick<EngineInterface, 'session'>,
): Promise<{ readonly ok: true; readonly id: string } | { readonly ok: false; readonly error: string }> {
    try {
        const id = await $.session.id();
        return ID_FORM.test(id) && !RESERVED_WORDS.has(id)
            ? { ok: true, id }
            : { ok: false, error: `this session's id is not usable (${id})` };
    } catch (error: unknown) {
        return { ok: false, error: `this session's id could not be read (${messageOf(error)})` };
    }
}

// The reading of a session with no usable id, its global marker off or expired: that marker's reading, unless a
// marker in noask.d reads on or unreadable, since the session may be that marker's, or noask.d cannot be listed.
async function readingWithoutId(
    $: Pick<EngineInterface, 'fs' | 'clock'>,
    directory: string,
    global: Reading,
    reason: string,
    nowMs: number,
): Promise<Reading> {
    const present = await inTime($, $.fs.exists(directory));
    if (present.ok && !present.value) {
        return global;
    }
    const listed = present.ok ? await inTime($, $.fs.list(directory)) : present;
    if (!listed.ok) {
        return unreadable(lookError(listed.error, 'the listing of noask.d timed out'));
    }
    let isUnreadable = false;
    for (const entry of listed.value.filter(({ name }) => ID_FORM.test(name))) {
        const own = await lookAt($, `${directory}/${entry.name}`, 'session', nowMs);
        if (own.kind === 'on') {
            return unreadable(`${reason} while a session's own switch is on`);
        }
        isUnreadable = isUnreadable || own.kind === 'unreadable';
    }
    return isUnreadable ? unreadable(`${reason} while a session's own marker is unreadable`) : global;
}

// The session's reading: the global marker's when that is on or unreadable; else the session's own marker's when
// that is not off; else the global marker's. Off with HOME unset or empty. Never rejects.
export async function readNoask($: Pick<EngineInterface, 'env' | 'fs' | 'clock' | 'session'>): Promise<Reading> {
    try {
        const state = await stateDirectoryOf($);
        if (state === undefined) {
            return OFF;
        }
        const nowMs = await $.clock.now();
        const global = await lookAt($, `${state}/noask`, 'global', nowMs);
        if (global.kind === 'on' || global.kind === 'unreadable') {
            return global;
        }
        const session = await sessionIdOf($);
        if (!session.ok) {
            return await readingWithoutId($, `${state}/noask.d`, global, session.error, nowMs);
        }
        const own = await lookAt($, `${state}/noask.d/${session.id}`, 'session', nowMs);
        return own.kind === 'off' ? global : own;
    } catch (error: unknown) {
        return unreadable(shown(messageOf(error)));
    }
}

export function isNoask(reading: Reading): reading is Extract<Reading, { kind: 'on' | 'unreadable' }> {
    return reading.kind === 'on' || reading.kind === 'unreadable';
}

// The owner's word to publish: the session's own marker reads on at level handsoff, whatever the global one reads.
// False for every other reading, for no usable id and for a read that fails. Never rejects.
export async function mayPublish($: Pick<EngineInterface, 'env' | 'fs' | 'clock' | 'session'>): Promise<boolean> {
    try {
        const state = await stateDirectoryOf($);
        if (state === undefined) {
            return false;
        }
        const session = await sessionIdOf($);
        if (!session.ok) {
            return false;
        }
        const own = await lookAt($, `${state}/noask.d/${session.id}`, 'session', await $.clock.now());
        return own.kind === 'on' && own.level === 'handsoff';
    } catch {
        return false;
    }
}
