#!/usr/bin/env bash
# Generator of hooks/marker.fixtures.ts, the markers and the readings the
# plugin's module is tested against, taken from the noask command itself:
# prints the file's text on standard output. Every command runs under a
# temporary HOME of its own (removed on exit), with TZ=Etc/GMT-4 and
# SDD_NOASK_NOW=1794423612 (2026-11-11T23:00:12+04:00), all set here, and
# with CLAUDE_CODE_SESSION_ID, CLAUDE_CONFIG_DIR and SDD_NOASK_LOCK_WAIT
# unset, so no run touches the real markers or reads the session this runs
# in.
#
# The markers, each read whole from the file the command wrote, with the
# generation's nine fractional digits and its 8 hex characters replaced by
# zeros: MARKER_ON (global on), MARKER_ON_UNTIL (global on until 07:30),
# MARKER_RENEWED (global on, then global on 9h at 1794425412), MARKER_SESSION
# (--session s-1 on) and MARKER_HANDSOFF (--session s-1 on handsoff).
# BAD_MARKERS: for each text of the list below, the first word of the status
# line the command prints with the text as the global marker (noask status)
# and, in another HOME, as noask.d/s-1 (noask --session s-1 status), both at
# 1794423612. The texts hold printable ASCII and line ends only.
#
# Usage: bash tests/gen-marker-fixtures.sh [SCRIPT] > hooks/marker.fixtures.ts
#   Default SCRIPT: bin/noask in the plugin root, the parent of this script's
#   directory. Exits 1, printing nothing on standard output, when a run of
#   the command fails or prints what this script does not expect.
set -uo pipefail
export LC_ALL=C

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
script=${1:-$here/../bin/noask}
tmp=$(cd "$(mktemp -d)" && pwd -P) || exit 1
trap 'rm -rf "$tmp"' EXIT
unset CLAUDE_CODE_SESSION_ID CLAUDE_CONFIG_DIR SDD_NOASK_LOCK_WAIT
export TZ=Etc/GMT-4 SDD_NOASK_NOW=1794423612
homes=0 nl=$'\n'
on='' on_until='' renewed='' session='' handsoff='' # the markers, set by zeroed

die() {
  printf 'gen-marker-fixtures: %s\n' "$1" >&2
  exit 1
}
# fresh: a new, empty HOME for the next runs; st is its state directory.
fresh() {
  homes=$((homes + 1))
  export HOME=$tmp/home-$homes
  st=$HOME/.local/state/sdd
  (umask 077 && mkdir -p -- "$st/noask.d") || die "cannot make $st"
}
# run ARG...: run the command, which must exit 0 with nothing on stderr.
run() {
  "$script" "$@" > /dev/null 2> "$tmp/err" || die "noask $* exited $?"
  [ ! -s "$tmp/err" ] || die "noask $* wrote to stderr: $(cat -- "$tmp/err")"
}
# zeroed FILE NAME: set NAME to FILE's text whole, its generation's
# fractional digits and hex characters zeros.
zeroed() {
  local text='' re="^(generation=[^.${nl}]*\\.)[0-9]{9}([^${nl}]*-)[0-9a-f]{8}(${nl}.*)\$"
  IFS= read -r -d '' text < "$1"
  [[ $text =~ $re ]] || die "$1 does not start with a generation line"
  printf -v "$2" '%s000000000%s00000000%s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
}
# literal TEXT: TEXT, which holds printable ASCII and line ends only, as a
# template literal.
literal() {
  local text=$1
  text=${text//\\/\\\\}
  text=${text//\`/\\\`}
  text=${text//\$\{/\\\$\{}
  printf '%s' "\`$text\`"
}
# status_word ARG...: the first word of the status line noask ARG... prints;
# fails on anything but one line led by off, on, expired or unreadable, or
# on an exit other than 0 (3 for unreadable).
status_word() {
  local out rc=0 want=0 re="^(off|on|expired|unreadable)( [^${nl}]*)?\$"
  out=$("$script" "$@" 2> "$tmp/err") || rc=$?
  [ ! -s "$tmp/err" ] || die "noask $* wrote to stderr: $(cat -- "$tmp/err")"
  [[ $out =~ $re ]] || die "noask $* printed: $out"
  [ "${BASH_REMATCH[1]}" != unreadable ] || want=3
  [ "$rc" -eq "$want" ] || die "noask $* exited $rc"
  printf '%s' "${BASH_REMATCH[1]}"
}

fresh
run global on
zeroed "$st/noask" on
fresh
run global on until 07:30
zeroed "$st/noask" on_until
fresh
run global on
SDD_NOASK_NOW=1794425412 run global on 9h
zeroed "$st/noask" renewed
fresh
run --session s-1 on
zeroed "$st/noask.d/s-1" session
fresh
run --session s-1 on handsoff
zeroed "$st/noask.d/s-1" handsoff

# MARKER_ON_UNTIL's lines, for the texts below that rewrite one of them.
mapfile -t l <<< "${on_until%"$nl"}"
[ "${#l[@]}" -eq 4 ] || die 'MARKER_ON_UNTIL does not hold four lines'
# The texts, as NAME and TEXT pairs: first those not as the command writes a
# marker, then four at the grammar's edge, each MARKER_ON_UNTIL with one
# field rewritten.
names=() texts=()
# add NAME LINE...: the text of the LINEs, each with its line end.
add() {
  local text='' line
  for line in "${@:2}"; do text+=$line$nl; done
  names+=("$1") texts+=("$text")
}
add 'an unexpired marker without its final newline' "${l[@]}"
texts[-1]=${texts[-1]%"$nl"}
add 'an expired marker without its final newline' "${l[0]}" "${l[1]}" until=2026-11-11T22:00:00+04:00 "${l[3]}"
texts[-1]=${texts[-1]%"$nl"}
add 'since on 30 February' "${l[0]}" since=2026-02-30T00:00:00+04:00 "${l[2]}" "${l[3]}"
add 'until at 24:00' "${l[0]}" "${l[1]}" until=2026-11-11T24:00:00+04:00 "${l[3]}"
add 'an offset of +04:60' "${l[0]}" since=2026-11-11T23:00:12+04:60 "${l[2]}" "${l[3]}"
add 'five lines' "${l[@]}" "${l[3]}"
add 'a leading empty line' '' "${l[@]}"
add 'a space after the level' "${l[0]}" "${l[1]}" "${l[2]}" "${l[3]} "
pad=()
while n=$((4097 - ${#on_until} - 80 * ${#pad[@]})); [ "$n" -gt 80 ]; do pad+=("$(printf '%79s' '' | tr ' ' x)"); done
add '4097 bytes' "${l[@]}" "${pad[@]}" "$(printf '%*s' $((n - 1)) '' | tr ' ' x)"
[ "${#texts[-1]}" -eq 4097 ] || die "the long text is ${#texts[-1]} bytes, not 4097"
add 'since at +14:00' "${l[0]}" since=2026-11-12T09:00:12+14:00 "${l[2]}" "${l[3]}"
add 'since at -00:00' "${l[0]}" since=2026-11-11T19:00:12-00:00 "${l[2]}" "${l[3]}"
add 'since at +14:01' "${l[0]}" since=2026-11-12T09:01:12+14:01 "${l[2]}" "${l[3]}"
add 'a generation at +15:00' generation=2026-11-11T23:00:12.000000000+15:00-00000000 "${l[@]:1}"
printable="^[ -~${nl}]*\$"
for text in "$on" "$on_until" "$renewed" "$session" "$handsoff" "${texts[@]}"; do
  [[ $text =~ $printable ]] || die 'a text holds more than printable ASCII and line ends'
done

out="// Generated by tests/gen-marker-fixtures.sh from the noask command's own markers and status lines; never edit
// it by hand: run the script again (tests/test-noask.sh, case 45, compares its output with this file).
import type { Reading } from './marker';

export const MARKER_ON = $(literal "$on");

export const MARKER_ON_UNTIL = $(literal "$on_until");

export const MARKER_RENEWED = $(literal "$renewed");

export const MARKER_SESSION = $(literal "$session");

export const MARKER_HANDSOFF = $(literal "$handsoff");

// Each text with the kind the command reads it as, as the global marker and as a session's, at 1794423612.
export const BAD_MARKERS: ReadonlyArray<{
    readonly name: string;
    readonly text: string;
    readonly asGlobal: Reading['kind'];
    readonly asSession: Reading['kind'];
}> = ["
for i in "${!texts[@]}"; do
  fresh
  printf '%s' "${texts[i]}" > "$st/noask"
  as_global=$(status_word status) || exit 1
  fresh
  printf '%s' "${texts[i]}" > "$st/noask.d/s-1"
  as_session=$(status_word --session s-1 status) || exit 1
  out+="
    {
        name: '${names[i]}',
        text: $(literal "${texts[i]}"),
        asGlobal: '$as_global',
        asSession: '$as_session',
    },"
done
out+="
];"
printf '%s\n' "$out"
