#!/usr/bin/env bash
# Test for bin/noask of the sdd plugin, the noask switch's only writer, and
# for its rule text scripts/noask-rule.md. Every command runs under a
# temporary HOME (and CLAUDE_PLUGIN_DATA) made for its case and removed on
# exit, with TZ=Etc/GMT-4 and SDD_NOASK_NOW=1794423612
# (2026-11-11T23:00:12+04:00) unless the case moves the clock, and with
# CLAUDE_CODE_SESSION_ID, CLAUDE_PLUGIN_OPTION_TERMINAL, CLAUDE_CONFIG_DIR and
# SDD_NOASK_LOCK_WAIT unset unless the case sets one, so no case touches the
# real markers or records or reads the session this test runs in. Each
# command runs under `timeout 10` (case 27's and case 42's under `timeout
# 120`), so a hang fails its case instead of the run. Prints "ok <n>" or
# "FAIL <n> (<broken parts>)" per case and "skip <n> (<reason>)" for a case
# that cannot run; exits 1 when any case fails. Cases 1 to 30 are those of the
# phase 2 plan (a local working document), Task 2; cases 31 to 44 those of
# the plan of noask's first step, a local working document, Tasks 1 (31 to
# 36) and 2 (37 to 44).
#
# Usage: bash tests/test-noask.sh [SCRIPT]
#   Default SCRIPT: bin/noask in the plugin root, the parent of this script's
#   directory. The rule text is read from scripts/ beside SCRIPT's bin/, and
#   case 14 copies those two directories.
# Case 29, case 10's mode-000 sub-case, case 43's mode-500 sub-case and case
# 44's sub-cases with noask.d at 300 and 400 need a user that file modes
# bind, so they are skipped when the tests run as root: case 29 prints a skip
# line, the others a note line after their verdict.
set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
script=${1:-$here/../bin/noask}
src=$(dirname "$(dirname "$(realpath -m -- "$script")")")
rule=$src/scripts/noask-rule.md
tmp=$(cd "$(mktemp -d)" && pwd -P) || exit 1
trap 'chmod -R u+rwx "$tmp" 2>/dev/null; rm -rf "$tmp"' EXIT
as_root=
[ "$(id -u)" -ne 0 ] || as_root=1
fail=0 broken=

T0=1794423612 # 2026-11-11T23:00:12+04:00, the default clock
T1=1794425412 # 2026-11-11T23:30:12+04:00
T2=1794454800 # 2026-11-12T07:40:00+04:00
T3=1794541200 # 2026-11-13T07:40:00+04:00
gen_re='^generation=2026-11-11T23:00:12\.[0-9]{9}\+04:00-[0-9a-f]{8}$'
default=' (8 hours by default; /noask on <expiry> sets another)'
door="noask: a session's switch is typed in the session as /noask on; noask global on switches every session"
handsoff_global="noask: handsoff is a session's level; type /noask on handsoff in the session that may publish"
first=$(head -n 1 -- "$rule" 2>/dev/null)
# The lines of a readable marker, for building unreadable ones.
gl=generation=2026-11-11T23:00:12.000000000+04:00-0123abcd
sl=since=2026-11-11T23:00:12+04:00

# fresh NAME: a new, empty HOME for the case or sub-case NAME, at the default
# clock, with no extra variables and the default time limit; st, G, D and B
# are its state directory, global marker, session marker directory and the
# sessions' records' directory.
fresh() {
  home=$tmp/home-$1
  mkdir -p "$home"
  st=$home/.local/state/sdd
  G=$st/noask
  D=$st/noask.d
  B=$st/budgets.d
  now=$T0 envs=() limit=10 nohome=
}
# noask ARG...: run the script under the case's HOME (unset when nohome is
# set), clock and extra NAME=VALUE words (envs); sets out, err and rc.
noask() {
  local errf=$tmp/stderr.$BASHPID
  local cmd=(env -u CLAUDE_CODE_SESSION_ID -u CLAUDE_PLUGIN_OPTION_TERMINAL -u CLAUDE_CONFIG_DIR
    -u SDD_NOASK_LOCK_WAIT)
  if [ -n "$nohome" ]; then cmd+=(-u HOME); else cmd+=("HOME=$home"); fi
  cmd+=("CLAUDE_PLUGIN_DATA=$home/plugin-data" TZ=Etc/GMT-4 "SDD_NOASK_NOW=$now" "${envs[@]}")
  rc=0
  out=$(timeout "$limit" "${cmd[@]}" "$script" "$@" 2>"$errf") || rc=$?
  err=$(cat -- "$errf")
  rm -f -- "$errf"
}
nth() { sed -n "${1}p" <<< "$out"; } # line N of the last run's stdout
# marker FILE: m holds FILE's lines, none when FILE is not a regular file.
marker() {
  m=()
  [ -f "$1" ] && mapfile -t m < "$1"
}
gen_of() { sed -n 's/^generation=//p' -- "$1" 2>/dev/null; } # FILE's generation
# is PART RC LINE...: the last run exited RC with nothing on stderr and
# printed exactly the LINEs; otherwise PART joins the broken parts.
is() {
  local part=$1 want_rc=$2 want
  shift 2
  want=$(printf '%s\n' "$@")
  { [ "$rc" -eq "$want_rc" ] && [ -z "$err" ] && [ "$out" = "$want" ]; } || broken+=" $part"
}
# like PART RC ERE: the last run exited RC with nothing on stderr and printed
# one line that matches ERE.
like() {
  { [ "$rc" -eq "$2" ] && [ -z "$err" ] && [[ $out != *$'\n'* ]] && [[ $out =~ $3 ]]; } || broken+=" $1"
}
# step PART ARG...: run noask ARG..., which must exit 0 with nothing on stderr.
step() {
  local part=$1
  shift
  noask "$@"
  { [ "$rc" -eq 0 ] && [ -z "$err" ]; } || broken+=" $part"
}
# refused PART WANT ARG...: noask ARG... exits 2 with nothing on stdout,
# nothing under HOME, and on stderr the line WANT (a usage line for "usage").
refused() {
  local part=$1 want=$2
  shift 2
  noask "$@"
  { [ "$rc" -eq 2 ] && [ -z "$out" ] && [ -z "$(ls -A -- "$home")" ]; } || broken+=" $part"
  if [ "$want" = usage ]; then
    [[ $err == 'usage: noask '* && $err != *$'\n'* ]] || broken+=" $part-usage"
  else
    [ "$err" = "$want" ] || broken+=" $part-stderr"
  fi
}
# own_dir DIR...: make each DIR and its parents under umask 077, as the
# command makes its directories, so no switch that follows narrows them.
own_dir() { (umask 077 && mkdir -p -- "$@"); }
# two_lines FILE: an unreadable marker, its first two lines only.
two_lines() {
  own_dir "${1%/*}"
  printf '%s\n' "$gl" "$sl" > "$1"
}
# Ends a case: ok when no part broke, else FAIL with the broken parts and the
# last run's exit, stdout (its lines joined by " | ") and stderr.
verdict() {
  if [ -z "$broken" ]; then echo "ok $1"; else
    echo "FAIL $1 (${broken# }): rc=$rc; ${out//$'\n'/ | }${err:+; stderr: ${err//$'\n'/ | }}"
    fail=1
  fi
  broken='' rc=0 out='' err=''
}

# 1. No marker: off in every form; with HOME unset, or set and empty, both
#    readers read off and a switching command fails.
fresh 1
noask; is plain 0 'noask: off'
noask status; is status 0 off
noask --session s-1; is session-plain 0 'noask: off'
noask --session s-1 status; is session-status 0 off
envs=(CLAUDE_CODE_SESSION_ID=s-1)
noask; is env-plain 0 'noask: off'
noask status; is env-status 0 off
envs=() nohome=1
noask status; is nohome-status 0 off
noask; is nohome-plain 0 'noask: off'
noask global on
{ [ "$rc" -eq 1 ] && [ "$err" = 'noask: HOME is not set' ] && [ -z "$out" ]; } || broken+=" nohome-on"
envs=(HOME=) nohome=
noask status; is emptyhome-status 0 off
noask; is emptyhome-plain 0 'noask: off'
noask global on
{ [ "$rc" -eq 1 ] && [ "$err" = 'noask: HOME is not set' ] && [ -z "$out" ]; } || broken+=" emptyhome-on"
verdict 1

# 2. global on: the four lines of the marker, the four printed lines and the
#    rule text after them, and the status alone and with a session.
fresh 2
noask global on
marker "$G"
{ [ "${#m[@]}" -eq 4 ] && [[ ${m[0]} =~ $gen_re ]] && [ "${m[1]}" = since=2026-11-11T23:00:12+04:00 ] &&
  [ "${m[2]}" = until= ] && [ "${m[3]}" = level=noask ]; } || broken+=" marker"
{ [ "$rc" -eq 0 ] && [ -z "$err" ] && [ "$(nth 1)" = 'noask: on for every session since 23:00' ] &&
  [ "$(nth 2)" = "marker: $G" ] && [ "$(sed -n '3{/^$/p}' <<< "$out" | wc -l)" -eq 1 ] &&
  [[ $(nth 4) == 'noask is on: nobody answers until it is off.'* ]]; } || broken+=" lines"
[ -n "$first" ] && [ "$(tail -n +4 <<< "$out")" = "$(cat -- "$rule")" ] || broken+=" rule-text"
gen=$(gen_of "$G")
noask status; is status 0 "on $gen"
noask --session s-1 status; is session-status 0 "on $gen"
verdict 2

# 3. on, off, on under one clock: two generations.
fresh 3
step on global on
one=$(gen_of "$G")
step off global off
step again global on
two=$(gen_of "$G")
{ [ -n "$one" ] && [ -n "$two" ] && [ "$one" != "$two" ]; } || broken+=" generations"
verdict 3

# 4. on while on: nothing changed, the marker byte-identical.
fresh 4
step on global on
cp -- "$G" "$tmp/c4" 2>/dev/null
noask global on; is already 0 'noask: already on for every session since 23:00; nothing changed'
cmp -s -- "$G" "$tmp/c4" || broken+=" marker"
verdict 4

# 5. A renewal at 23:30:12: nine hours from the renewal, generation and since
#    kept.
fresh 5
step on global on
marker "$G"
before=("${m[@]}")
now=$T1
noask global on 9h
marker "$G"
{ [ "${#before[@]}" -eq 4 ] && [ "${#m[@]}" -eq 4 ] && [ "${m[0]}" = "${before[0]}" ] &&
  [ "${m[1]}" = "${before[1]}" ] && [ "${m[2]}" = until=2026-11-12T08:30:12+04:00 ] &&
  [ "${m[3]}" = level=noask ]; } || broken+=" marker"
is lines 0 'noask: on for every session since 23:00 until 2026-11-12 08:30 (expiry renewed)' "marker: $G"
verdict 5

# 6. A duration in minutes from off.
fresh 6
noask global on 90m
marker "$G"
[ "${m[2]-}" = until=2026-11-12T00:30:12+04:00 ] || broken+=" until"
{ [ "$rc" -eq 0 ] && [ "$(nth 1)" = 'noask: on for every session since 23:00 until 2026-11-12 00:30' ]; } ||
  broken+=" line"
verdict 6

# 7. until HH:MM is the next such local time strictly after now: from 23:00:12
#    the next day's, from 06:00:00 the same day's, at exactly 07:30:00 the next
#    day's. Under a zone with a clock change, a local time the change skips is
#    refused, and once that time has passed for the day the next day's is
#    taken.
for c in "$T0 2026-11-12T07:30:00+04:00" "1794448800 2026-11-12T07:30:00+04:00" \
  "1794454200 2026-11-13T07:30:00+04:00"; do
  fresh "7-${c%% *}"
  now=${c%% *}
  noask global on until 07:30
  marker "$G"
  { [ "$rc" -eq 0 ] && [ "${m[2]-}" = "until=${c#* }" ]; } || broken+=" at-$now"
done
fresh 7-skipped
envs=('TZ=CET-1CEST,M3.5.0,M10.5.0/3')
now=1774740600 # 2026-03-29T00:30:00+01:00, before the clock moves from 02:00 to 03:00
refused skipped 'noask: 02:30 does not exist on 2026-03-29 (a clock change skips it)' global on until 02:30
now=1774771200 # 2026-03-29T10:00:00+02:00
noask global on until 02:30
marker "$G"
{ [ "$rc" -eq 0 ] && [ "${m[2]-}" = until=2026-03-30T02:30:00+02:00 ]; } || broken+=" after-skip"
verdict 7

# 8. An expired global marker: read at its until exactly (an until not after
#    now is expired), on the morning after and a day later, then switched off
#    and switched on, each on a fresh copy.
fresh 8
step on global on until 07:30
cp -- "$G" "$tmp/c8" 2>/dev/null
now=1794454200 # 2026-11-12T07:30:00+04:00, the marker's until
noask status; is at-until 0 'expired 2026-11-12T07:30:00+04:00'
now=$T2
noask; is plain 0 'noask: off (expired 07:30)'
noask status; is status 0 'expired 2026-11-12T07:30:00+04:00'
now=$T3
noask; is plain-later 0 'noask: off (expired 2026-11-12 07:30)'
now=$T2
cp -- "$tmp/c8" "$G" 2>/dev/null
noask global off; is off 0 'noask: off for every session (expired 07:30; marker removed)'
[ ! -e "$G" ] || broken+=" removed"
cp -- "$tmp/c8" "$G" 2>/dev/null
old=$(gen_of "$tmp/c8")
noask global on
marker "$G"
{ [ "$rc" -eq 0 ] && [ -n "$old" ] && [ "${#m[@]}" -eq 4 ] && [ "${m[0]}" != "generation=$old" ] &&
  [ "${m[1]}" = since=2026-11-12T07:40:00+04:00 ] && [ "${m[2]}" = until= ]; } || broken+=" on"
verdict 8

# 9. off while on, then off while off.
fresh 9
step on global on
noask global off; is off 0 'noask: off for every session'
[ ! -e "$G" ] || broken+=" removed"
noask global off; is again 0 'noask: already off for every session'
verdict 9

# 10. An unreadable global marker, one sub-case each: read by status and the
#     bare command, then replaced by on and removed by off, each on a fresh
#     copy. The FIFO is a marker whose read never answers, and its status
#     line names the timeout. No status line ends in handsoff, the word that
#     lets a session publish. Run as root, the mode-000 sub-case is left out
#     and a note line follows the verdict.
# bad_global KIND: the global marker of sub-case KIND.
bad_global() {
  own_dir "$st"
  case $1 in
    two-lines) printf '%s\n' "$gl" "$sl" ;;
    no-level) printf '%s\n' "$gl" "$sl" until= ;;
    level-push) printf '%s\n' "$gl" "$sl" until= level=push ;;
    level-handsoff) printf '%s\n' "$gl" "$sl" until= level=handsoff ;;
    empty-generation) printf '%s\n' generation= "$sl" until= level=noask ;;
    generation-abc) printf '%s\n' generation=abc "$sl" until= level=noask ;;
    until-tomorrow) printf '%s\n' "$gl" "$sl" until=tomorrow level=noask ;;
    since-date) printf '%s\n' "$gl" since=2026-11-11 until= level=noask ;;
    fifth-line) printf '%s\n' "$gl" "$sl" until= level=noask extra=1 ;;
    out-of-order) printf '%s\n' "$sl" "$gl" until= level=noask ;;
    mode-000) printf '%s\n' "$gl" "$sl" until= level=noask ;;
    fifo) ;;
  esac > "$G.new"
  mv -f -- "$G.new" "$G"
  case $1 in
    mode-000) chmod 000 -- "$G" ;;
    fifo) rm -f -- "$G" && mkfifo -- "$G" ;;
  esac
}
for kind in two-lines no-level level-push level-handsoff empty-generation generation-abc until-tomorrow \
  since-date fifth-line out-of-order mode-000 fifo; do
  if [ "$kind" = mode-000 ] && [ -n "$as_root" ]; then continue; fi
  fresh "10-$kind"
  bad_global "$kind"
  noask status; like "$kind-status" 3 '^unreadable .+$'
  [[ $out != *handsoff ]] || broken+=" $kind-status-ends-handsoff"
  [ "$kind" != fifo ] || [ "$out" = 'unreadable marker read timed out' ] || broken+=" fifo-reason"
  noask; like "$kind-plain" 3 '^noask: unreadable \(.+\); sessions treat it as on; noask global off removes it$'
  fresh "10-$kind-on"
  bad_global "$kind"
  noask global on
  on_rc=$rc
  noask status
  { [ "$on_rc" -eq 0 ] && [ "$rc" -eq 0 ] && [[ $out =~ ^on\ [^\ ]+$ ]]; } || broken+=" $kind-on"
  fresh "10-$kind-off"
  bad_global "$kind"
  noask global off; is "$kind-off" 0 'noask: off for every session (unreadable marker removed)'
  [ ! -e "$G" ] || broken+=" $kind-removed"
done
verdict 10
[ -z "$as_root" ] || echo 'note 10 (the mode-000 sub-case needs a user that file modes bind)'

# 11. Wrong arguments: exit 2 before anything is touched; 99999h is taken.
fresh 11
refused 9x usage global on 9x
refused 0h usage global on 0h
refused 100000h usage global on 100000h
refused until-25 usage global on until 25:00
refused extra usage global on 9h extra
refused global usage global
refused frobnicate usage frobnicate
refused session-alone usage --session
refused session-dots usage --session ../x status
refused session-slash usage --session a/b on
refused two-sessions usage --session a --session b status
refused session-as-value usage --session --session status
refused handsoff-after usage --session s-1 on 3h handsoff
refused off-handsoff usage --session s-1 off handsoff
refused global-handsoff "$handsoff_global" global on handsoff
refused global-handsoff-9h "$handsoff_global" global on handsoff 9h
noask global on 99999h
marker "$G"
{ [ "$rc" -eq 0 ] &&
  [ "${m[2]-}" = "until=$(TZ=Etc/GMT-4 date -d "@$((T0 + 99999 * 3600))" +%Y-%m-%dT%H:%M:%S%:z)" ]; } ||
  broken+=" 99999h"
verdict 11

# 12. A regular file where the state directory should be.
fresh 12
mkdir -p -- "${st%/*}"
: > "$st"
noask global on
{ [ "$rc" -eq 1 ] && [[ $err == *"$st"* ]] && [[ $out != *'noask: on'* ]]; } || broken+=" refused"
verdict 12

# 13. After a round of switching, only the lock and an empty noask.d remain.
fresh 13
step on global on
step renew global on 9h
step session-on --session s-1 on
step session-off --session s-1 off
step off global off
{ [ "$(find "$st" -mindepth 1 -maxdepth 1 -printf '%f\n' 2>/dev/null | LC_ALL=C sort | tr '\n' ' ')" = 'lock noask.d ' ] &&
  [ -f "$st/lock" ] &&
  [ -d "$D" ] && [ -z "$(ls -A -- "$D")" ]; } || broken+=" leftovers"
verdict 13

# 14. The rule text missing from a copy of the plugin: the switch is made and
#     the missing line stands where the text would.
fresh 14
copy=$tmp/copy
mkdir -p -- "$copy"
cp -Rp -- "$src/bin" "$src/scripts" "$copy/" 2>/dev/null
rm -f -- "$copy/scripts/noask-rule.md"
own=$script
script=$copy/bin/noask
noask global on
script=$own
is lines 0 'noask: on for every session since 23:00' "marker: $G" '' \
  "noask: rule text missing at $copy/scripts/noask-rule.md; sessions get the short built-in text and rule nothing"
[ -f "$G" ] || broken+=" marker"
verdict 14

# 15. The rule text: the lines an agent ends on, the ruling form, the
#     exceptions, the four stops' words, and no tool's proper name. Read as
#     one line, newlines as spaces, so the wrapping does not matter.
joined=
[ -f "$rule" ] && joined=$(tr '\n' ' ' < "$rule")
[ -n "$joined" ] || broken+=" empty"
for s in 'noask: waiting:' 'noask: done' 'noask: blocked:' 'Ruling: <decision>. Cost if wrong: <what>' \
  'Never switch noask yourself' 'An apply run the owner launched is the exception' \
  "The other exception is the owner's word to publish" 'irreversible or destructive' 'security-sensitive' \
  'outside this worktree' 'every path forward is a guess'; do
  [[ $joined == *"$s"* ]] || broken+=" missing:${s// /_}"
done
for s in AskUserQuestion ExitPlanMode TodoWrite; do
  [[ $joined != *"$s"* ]] || broken+=" names:$s"
done
verdict 15

# 16. The command calls no jq.
{ [ -f "$script" ] && ! grep -qw jq -- "$script"; } || broken+=" jq"
verdict 16

# 17. A session's on: 8 hours by default, the printed lines, no global
#     marker; the second level in the marker, the status and the bare command.
fresh 17
noask --session s-1 on
marker "$D/s-1"
{ [ "${m[2]-}" = until=2026-11-12T07:00:12+04:00 ] && [ "${m[3]-}" = level=noask ]; } || broken+=" marker"
{ [ "$rc" -eq 0 ] && [ -z "$err" ] &&
  [ "$(nth 1)" = "noask: on for this session since 23:00 until 2026-11-12 07:00$default" ] &&
  [ "$(nth 2)" = "marker: $D/s-1" ] && [ "$(sed -n '3{/^$/p}' <<< "$out" | wc -l)" -eq 1 ] &&
  [ -n "$first" ] && [ "$(nth 4)" = "$first" ]; } || broken+=" lines"
[ ! -e "$G" ] || broken+=" global"
noask --session s-1 status
{ [ "$rc" -eq 0 ] && [[ $out == 'on '* ]] && [[ $out != *handsoff ]]; } || broken+=" status"
noask --session s-2 on handsoff
marker "$D/s-2"
[ "${m[3]-}" = level=handsoff ] || broken+=" s-2-level"
{ [ "$rc" -eq 0 ] &&
  [ "$(nth 1)" = "noask: handsoff for this session since 23:00 until 2026-11-12 07:00$default" ]; } ||
  broken+=" s-2-line"
gen=$(gen_of "$D/s-2")
noask --session s-2 status; is s-2-status 0 "on $gen until 2026-11-12T07:00:12+04:00 handsoff"
noask --session s-2; is s-2-plain 0 'noask: handsoff for this session since 23:00 until 2026-11-12 07:00'
verdict 17

# 18. A session's expiry given, kept, renewed; the level raised and never
#     lowered; the level and the expiry together.
fresh 18
noask --session s-1 on 3h
marker "$D/s-1"
gen=$(gen_of "$D/s-1")
[ "${m[2]-}" = until=2026-11-12T02:00:12+04:00 ] || broken+=" until"
{ [ "$rc" -eq 0 ] && [ "$(nth 1)" = 'noask: on for this session since 23:00 until 2026-11-12 02:00' ] &&
  [ "$(nth 2)" = "marker: $D/s-1" ] && [ "$(sed -n '3{/^$/p}' <<< "$out" | wc -l)" -eq 1 ] &&
  [ -n "$first" ] && [ "$(nth 4)" = "$first" ]; } || broken+=" lines"
cp -- "$D/s-1" "$tmp/c18" 2>/dev/null
noask --session s-1 on
is already 0 'noask: already on for this session since 23:00 until 2026-11-12 02:00; nothing changed'
cmp -s -- "$D/s-1" "$tmp/c18" || broken+=" already-marker"
now=$T1
noask --session s-1 on 90m
marker "$D/s-1"
{ [ -n "$gen" ] && [ "${m[2]-}" = until=2026-11-12T01:00:12+04:00 ] && [ "$(gen_of "$D/s-1")" = "$gen" ]; } ||
  broken+=" renew-marker"
is renew 0 'noask: on for this session since 23:00 until 2026-11-12 01:00 (expiry renewed)' "marker: $D/s-1"
before=("${m[@]}")
noask --session s-1 on handsoff
marker "$D/s-1"
{ [ "${#before[@]}" -eq 4 ] && [ "${#m[@]}" -eq 4 ] && [ "${m[0]}" = "${before[0]}" ] &&
  [ "${m[1]}" = "${before[1]}" ] && [ "${m[2]}" = "${before[2]}" ] && [ "${m[3]}" = level=handsoff ]; } ||
  broken+=" raise-marker"
is raise 0 'noask: handsoff for this session since 23:00 until 2026-11-12 01:00 (level raised)' "marker: $D/s-1"
cp -- "$D/s-1" "$tmp/c18" 2>/dev/null
noask --session s-1 on
is never-lower 0 'noask: already handsoff for this session since 23:00 until 2026-11-12 01:00; nothing changed'
cmp -s -- "$D/s-1" "$tmp/c18" || broken+=" never-lower-marker"
noask --session s-1 on 2h
marker "$D/s-1"
{ [ "$rc" -eq 0 ] && [ "${m[2]-}" = until=2026-11-12T01:30:12+04:00 ] && [ "${m[3]-}" = level=handsoff ]; } ||
  broken+=" renew-handsoff"
step s-3 --session s-3 on
marker "$D/s-3"
before=("${m[@]}")
noask --session s-3 on handsoff 2h
marker "$D/s-3"
{ [ "${#before[@]}" -eq 4 ] && [ "${#m[@]}" -eq 4 ] && [ "${m[0]}" = "${before[0]}" ] &&
  [ "${m[1]}" = "${before[1]}" ] && [ "${before[2]}" = until=2026-11-12T07:30:12+04:00 ] &&
  [ "${m[2]}" = until=2026-11-12T01:30:12+04:00 ] && [ "${before[3]}" = level=noask ] &&
  [ "${m[3]}" = level=handsoff ]; } || broken+=" both-marker"
{ [ "$rc" -eq 0 ] &&
  [ "$(nth 1)" = 'noask: handsoff for this session since 23:30 until 2026-11-12 01:30 (level raised, expiry renewed)' ]; } ||
  broken+=" both-line"
now=$((T1 + 60))
noask --session s-3 on handsoff 2h
marker "$D/s-3"
{ [ "${#m[@]}" -eq 4 ] && [ "${m[0]}" = "${before[0]-}" ] && [ "${m[2]}" = until=2026-11-12T01:31:12+04:00 ] &&
  [ "${m[3]}" = level=handsoff ]; } || broken+=" again-marker"
{ [ "$rc" -eq 0 ] &&
  [ "$(nth 1)" = 'noask: handsoff for this session since 23:30 until 2026-11-12 01:31 (expiry renewed)' ]; } ||
  broken+=" again-line"
verdict 18

# 19. One session's switch is no other's, by --session and by the variable;
#     the third step of the reading rule.
fresh 19
step s-1 --session s-1 on
gen=$(gen_of "$D/s-1")
noask --session s-2 status; is s-2 0 off
envs=(CLAUDE_CODE_SESSION_ID=s-2)
noask status; is env-s-2 0 off
envs=(CLAUDE_CODE_SESSION_ID=s-1)
noask status; is env-s-1 0 "on $gen until 2026-11-12T07:00:12+04:00"
envs=()
noask status; is none 0 off
envs=(CLAUDE_CODE_SESSION_ID=../s-1)
noask status; is env-not-an-id 0 off
envs=()
step global global on 30m
now=$((T0 + 3600))
noask --session s-2 status; is expired 0 'expired 2026-11-11T23:30:12+04:00'
noask --session s-1 status; is own 0 "on $gen until 2026-11-12T07:00:12+04:00"
verdict 19

# 20. The global marker is read first; global off names the session's own
#     switch that still holds it, at either level.
fresh 20
step s-1 --session s-1 on
own=$(gen_of "$D/s-1")
step global global on
gen=$(gen_of "$G")
noask --session s-1 status; is status 0 "on $gen"
noask --session s-1
is plain 0 'noask: on for every session since 23:00' 'noask: on for this session since 23:00 until 2026-11-12 07:00'
noask --session s-1 global off
is off 0 'noask: off for every session; still on for this session until 2026-11-12 07:00; /noask off ends that'
noask --session s-1 status; is after 0 "on $own until 2026-11-12T07:00:12+04:00"
step global-again global on
gen=$(gen_of "$G")
step s-2 --session s-2 on handsoff
noask --session s-2 status; is handsoff 0 "on $gen handsoff"
noask --session s-2 global off
is handsoff-off 0 \
  'noask: off for every session; still handsoff for this session until 2026-11-12 07:00; /noask off ends that'
verdict 20

# 21. /noask off in a session that only the global switch holds: nothing
#     removed, and the line says what still holds it; with the session's own
#     switch on as well, only its marker goes.
fresh 21
step global global on
cp -- "$G" "$tmp/c21" 2>/dev/null
noask --session s-1 off
is already 0 'noask: already off for this session; still on for every session since 23:00; noask global off ends that'
cmp -s -- "$G" "$tmp/c21" || broken+=" global-touched"
step s-1 --session s-1 on
noask --session s-1 off
is off 0 'noask: off for this session; still on for every session since 23:00; noask global off ends that'
{ [ ! -e "$D/s-1" ] && cmp -s -- "$G" "$tmp/c21"; } || broken+=" removed"
verdict 21

# 22. on and off without --session change nothing, whatever the environment.
fresh 22
for sid in '' s-1; do
  envs=()
  [ -z "$sid" ] || envs=("CLAUDE_CODE_SESSION_ID=$sid")
  refused "on${sid:+-$sid}" "$door" on
  refused "off${sid:+-$sid}" "$door" off
  refused "on-9h${sid:+-$sid}" "$door" on 9h
done
verdict 22

# 23. A terminal's listing of the sessions' own switches, and global off's
#     count of them.
fresh 23
step s-1 --session s-1 on
step s-2 --session s-2 on
step s-3 --session s-3 on handsoff
noask
is list 0 'noask: off' 'noask: on for session s-1 since 23:00 until 2026-11-12 07:00' \
  'noask: on for session s-2 since 23:00 until 2026-11-12 07:00' \
  'noask: handsoff for session s-3 since 23:00 until 2026-11-12 07:00'
noask global off
is off 0 'noask: already off for every session; sessions still on by their own switch: 3 (noask lists them)'
verdict 23

# 24. The sweep: a status writes nothing, the target is read before the sweep,
#     a switching command removes expired markers and leftover temporary
#     files, which no listing shows; an expired marker switched on afresh.
fresh 24
step s-1 --session s-1 on 30m
step s-2 --session s-2 on 3h
now=1794425460 # 2026-11-11T23:31:00+04:00
noask --session s-1 status; is status 0 'expired 2026-11-11T23:30:12+04:00'
[ -e "$D/s-1" ] || broken+=" status-wrote"
noask --session s-1 off; is off 0 'noask: off for this session (expired 23:30; marker removed)'
[ ! -e "$D/s-1" ] || broken+=" off-kept"
now=$T0
step s-1-again --session s-1 on 30m
now=1794425460
mkdir -p -- "$D"
: > "$D/.noask.abc123"
: > "$st/.noask.def456"
noask; is list 0 'noask: off' 'noask: on for session s-2 since 23:00 until 2026-11-12 02:00'
noask global off
is global-off 0 'noask: already off for every session; sessions still on by their own switch: 1 (noask lists them)'
{ [ ! -e "$D/s-1" ] && [ ! -e "$D/.noask.abc123" ] && [ ! -e "$st/.noask.def456" ] && [ -f "$D/s-2" ]; } ||
  broken+=" sweep"
now=$T0
step s-1-third --session s-1 on 30m
old=$(gen_of "$D/s-1")
now=1794425460
noask --session s-1 on handsoff
marker "$D/s-1"
{ [ -n "$old" ] && [ "${#m[@]}" -eq 4 ] &&
  [[ ${m[0]} =~ ^generation=2026-11-11T23:31:00\.[0-9]{9}\+04:00-[0-9a-f]{8}$ ]] &&
  [ "${m[0]}" != "generation=$old" ] && [ "${m[1]}" = since=2026-11-11T23:31:00+04:00 ] &&
  [ "${m[2]}" = until=2026-11-12T07:31:00+04:00 ] && [ "${m[3]}" = level=handsoff ]; } || broken+=" fresh-marker"
{ [ "$rc" -eq 0 ] &&
  [ "$(nth 1)" = "noask: handsoff for this session since 23:31 until 2026-11-12 07:31$default" ]; } ||
  broken+=" fresh-line"
verdict 24

# 25. A session's marker unreadable: its status, its bare line, another
#     session, the terminal's listing, its off, and its replacement by on.
fresh 25
two_lines "$D/s-1"
noask --session s-1 status; like status 3 '^unreadable .+$'
noask --session s-1
like plain 3 "^noask: this session's marker is unreadable \(.+\); the session treats it as on; /noask off removes it\$"
noask --session s-2 status; is other 0 off
noask
{ [ "$rc" -eq 3 ] && [ -z "$err" ] && [ "$(wc -l <<< "$out")" -eq 2 ] && [ "$(nth 1)" = 'noask: off' ] &&
  [[ $(nth 2) =~ ^noask:\ session\ s-1\ has\ an\ unreadable\ marker\ \(.+\)$ ]]; } || broken+=" terminal"
noask --session s-1 off; is off 0 'noask: off for this session (unreadable marker removed)'
[ ! -e "$D/s-1" ] || broken+=" removed"
two_lines "$D/s-1"
noask --session s-1 on handsoff
marker "$D/s-1"
{ [ "$rc" -eq 0 ] && [ "${#m[@]}" -eq 4 ] && [ "${m[3]}" = level=handsoff ]; } || broken+=" on"
noask --session s-1 status; like on-status 0 '^on .+ until .+ handsoff$'
verdict 25

# 26. The lock held by another holder: a switching command waits, then gives
#     up and writes nothing; the readers answer at once; after the holder
#     ends, the switch is made.
fresh 26
own_dir "$st"
: > "$st/lock"
mkfifo -- "$tmp/c26"
exec {pipe}<>"$tmp/c26"
flock "$st/lock" bash -c 'echo held; sleep 3' > "$tmp/c26" &
holder=$!
line=
read -r -t 10 -u "$pipe" line
[ "$line" = held ] || broken+=" holder"
envs=(SDD_NOASK_LOCK_WAIT=1)
noask global on
{ [ "$rc" -eq 1 ] && [ "$err" = 'noask: the state directory is locked by another noask command' ] &&
  [ -z "$out" ] && [ ! -e "$G" ]; } || broken+=" locked"
envs=()
noask status; is status 0 off
noask; is plain 0 'noask: off'
kill -0 "$holder" 2>/dev/null || broken+=" not-at-once"
wait "$holder"
exec {pipe}<&-
noask global on
{ [ "$rc" -eq 0 ] && [ -f "$G" ]; } || broken+=" after"
verdict 26

# 27. Forty switching commands at once: all made, every session marker on,
#     no temporary file left.
fresh 27
mkdir -p -- "$tmp/c27"
envs=(SDD_NOASK_LOCK_WAIT=60) limit=120
# spawn NAME ARG...: noask ARG... in the background, its exit in c27/NAME.
spawn() {
  local name=$1
  shift
  { noask "$@"; printf '%s\n' "$rc" > "$tmp/c27/$name"; } &
}
for i in $(seq 1 20); do
  spawn "s-$i" --session "s-$i" on
  if [ "$i" -le 10 ]; then
    spawn "on-$i" global on 9h
    spawn "off-$i" global off
  fi
done
wait
envs=() limit=10
[ "$(find "$tmp/c27" -type f | wc -l)" -eq 40 ] || broken+=" count"
for f in "$tmp/c27"/*; do
  [ "$(cat -- "$f")" = 0 ] || broken+=" ${f##*/}"
done
noask
[ "$rc" -eq 0 ] || broken+=" listing"
for i in $(seq 1 20); do
  grep -qxF "noask: on for session s-$i since 23:00 until 2026-11-12 07:00" <<< "$out" || broken+=" s-$i"
done
[ -d "$st" ] && [ -z "$(find "$st" -name '.noask.*')" ] || broken+=" leftover"
verdict 27

# 28. A session's on under the global switch says so.
fresh 28
step global global on
noask --session s-2 on
{ [ "$rc" -eq 0 ] &&
  [ "$(nth 1)" = "noask: on for this session since 23:00 until 2026-11-12 07:00$default; also on for every session since 23:00" ]; } ||
  broken+=" line"
verdict 28

# 29. A sweep that cannot remove changes neither the output nor the exit;
#     noask.d at 500 grants its group and others nothing, so it is not
#     narrowed either.
if [ -n "$as_root" ]; then
  echo 'skip 29 (run as root, which removes through any mode)'
else
  fresh 29
  step s-1 --session s-1 on 30m
  step global global on
  now=1794425460
  chmod 500 -- "$D" 2>/dev/null
  noask global off; is off 0 'noask: off for every session'
  { [ ! -e "$G" ] && [ -e "$D/s-1" ]; } || broken+=" files"
  chmod 700 -- "$D" 2>/dev/null
  verdict 29
fi

# 30. Beside an unreadable global marker a session at the second level keeps
#     its word, and a session's off says what still holds it; a session's
#     unreadable marker is named by global off, with and without a session.
fresh 30
step s-2 --session s-2 on handsoff
two_lines "$G"
noask --session s-2 status; like handsoff 3 '^unreadable .+ handsoff$'
step s-1 --session s-1 on
noask --session s-1 off
like off 0 '^noask: off for this session; still treated as on for every session: unreadable marker \(.+\); noask global off removes it$'
fresh 30-own
step global global on
two_lines "$D/s-1"
noask --session s-1 global off
like own 0 "^noask: off for every session; this session's marker is unreadable \(.+\) and treated as on; /noask off removes it\$"
noask global off
is count 0 'noask: already off for every session; sessions still on by their own switch: 1 (noask lists them)'
verdict 30

# 31. A session id that is one of the command's own words is a wrong
#     argument, whatever follows; nothing is touched. CLAUDE_CODE_SESSION_ID
#     holding one names no session, so a marker under that name is not read.
fresh 31
refused off usage --session off
refused global-on usage --session global on
refused status usage --session status
refused on-on usage --session on on
refused count-on usage --session count on
[ ! -e "$home/.local/state" ] || broken+=" state"
own_dir "$D"
printf '%s\n' "$gl" "$sl" until=2026-11-12T07:00:12+04:00 level=noask > "$D/on"
envs=(CLAUDE_CODE_SESSION_ID=on)
noask status; is env-word 0 off
verdict 31

# 32. until HH:MM in the hour a clock change repeats (Europe/Berlin,
#     2026-10-25, 03:00 back to 02:00): the next such local time strictly
#     after now, whichever of the hour's two passes date answers; once both
#     passes are behind, the next day's.
for c in '1792888800 02:30 2026-10-25T02:30:00+01:00' '1792888800 02:50 2026-10-25T02:50:00+02:00' \
  '1792891860 02:30 2026-10-26T02:30:00+01:00'; do
  read -r at hm want <<< "$c"
  fresh "32-$at-$hm"
  envs=(TZ=Europe/Berlin) now=$at
  noask global on until "$hm"
  marker "$G"
  { [ "$rc" -eq 0 ] && [ -z "$err" ] && [ "${m[2]-}" = "until=$want" ]; } || broken+=" $hm-at-$at"
done
verdict 32

# 33. The state directory and noask.d are made at 700 whatever the umask; a
#     switch narrows each of them and budgets.d that grants its group or
#     others a bit, and says so after its own lines, once; one without such
#     a bit (500) is left as it is. status and the bare command change no
#     mode.
mask=$(umask)
fresh 33
umask 002
noask global on
{ [ "$rc" -eq 0 ] && [[ $out != *narrowed* ]] && [ "$(stat -c %a -- "$st")" = 700 ]; } || broken+=" state-made"
noask --session s-1 on
{ [ "$rc" -eq 0 ] && [[ $out != *narrowed* ]] && [ "$(stat -c %a -- "$D")" = 700 ]; } || broken+=" noask.d-made"
umask "$mask"
fresh 33-wide
mkdir -p -- "$st" && chmod 775 -- "$st"
noask global on
is wide 0 'noask: on for every session since 23:00' "marker: $G" '' "$(cat -- "$rule")" \
  "noask: narrowed $st to the owner (it was 775)"
[ "$(stat -c %a -- "$st")" = 700 ] || broken+=" wide-mode"
noask global on; is wide-again 0 'noask: already on for every session since 23:00; nothing changed'
mkdir -p -- "$D" && chmod 775 -- "$st" "$D"
noask status; is wide-status 0 "on $(gen_of "$G")"
noask; is wide-plain 0 'noask: on for every session since 23:00'
[ "$(stat -c %a -- "$st") $(stat -c %a -- "$D")" = '775 775' ] || broken+=" readers-changed-mode"
fresh 33-500
own_dir "$D"
chmod 500 -- "$D"
noask global on; is 500 0 'noask: on for every session since 23:00' "marker: $G" '' "$(cat -- "$rule")"
[ "$(stat -c %a -- "$D")" = 500 ] || broken+=" 500-mode"
chmod 700 -- "$D"
fresh 33-three
own_dir "$st"
mkdir -p -- "$D" "$st/budgets.d" && chmod 755 -- "$D" && chmod 770 -- "$st/budgets.d"
noask global off
is three 0 'noask: already off for every session' "noask: narrowed $D to the owner (it was 755)" \
  "noask: narrowed $st/budgets.d to the owner (it was 770)"
[ "$(stat -c %a -- "$D") $(stat -c %a -- "$st/budgets.d")" = '700 700' ] || broken+=" three-modes"
verdict 33

# 34. A session's on beside an unreadable global marker says that the global
#     marker holds every session.
fresh 34
own_dir "$st"
printf 'x\n' > "$G"
noask --session s-1 on
{ [ "$rc" -eq 0 ] && [ -z "$err" ] && [ "$(nth 1)" = "noask: on for this session since 23:00 until 2026-11-12 07:00$default; the global marker is unreadable (the marker has 1 line, not 4) and holds every session under noask; noask global off removes it" ]; } ||
  broken+=" line"
verdict 34

# 35. The parser's reasons: the size limit (a marker of exactly 4096 bytes is
#     still parsed), the count of lines, the offset's range in a time and in
#     the generation. No reason in the script ends in handsoff.
# put_global LINE...: the global marker holding the LINEs.
put_global() {
  own_dir "$st"
  printf '%s\n' "$@" > "$G"
}
fresh 35
own_dir "$st"
printf '%5000s' '' > "$G"
noask status; is long 3 'unreadable the marker is longer than 4096 bytes'
put_global "$gl" "$sl" until= "level=$(printf '%*s' $((4080 - ${#gl} - ${#sl})) '' | tr ' ' x)"
[ "$(stat -c %s -- "$G")" = 4096 ] || broken+=" exact-size"
noask status; is exact 3 'unreadable line 4 is not level=handsoff or level=noask'
put_global "$gl"
noask status; is one-line 3 'unreadable the marker has 1 line, not 4'
put_global "$gl" "$sl"
noask status; is two-lines 3 'unreadable the marker has 2 lines, not 4'
for off in +04:60 +14:01 +15:00; do
  put_global "$gl" "since=2026-11-11T23:00:12$off" until= level=noask
  noask status; is "since$off" 3 'unreadable line 2 is not since=<time>'
done
put_global "$gl" since=2026-11-12T09:00:12+14:00 until= level=noask
noask status; is since+14:00 0 "on ${gl#generation=}"
put_global generation=2026-11-11T23:00:12.000000000+15:00-0123abcd "$sl" until= level=noask
noask status; is generation+15:00 3 'unreadable line 1 is not generation=<time>-<8 hex>'
reasons=$(grep -oE "reason=(\"[^\"]*\"|'[^']*')" -- "$script")
[ "$(grep -c . <<< "$reasons")" -ge 10 ] || broken+=" reasons-found"
[ "$(grep -cE "handsoff[\"']\$" <<< "$reasons")" -eq 0 ] || broken+=" reason-ends-handsoff"
verdict 35

# 36. Off its platform (here: no flock) no marker can exist: status and the
#     bare command read off, and every other form is refused with the
#     platform line and writes nothing. The same folder with flock added
#     makes a switch, so flock is the one thing missing.
fresh 36
bin36=$tmp/bin36
mkdir -p -- "$bin36"
for t in bash date env realpath dirname timeout head tr mkdir mktemp mv rm od cat stat chmod; do
  if p=$(command -v "$t"); then ln -s -- "$p" "$bin36/$t"; else broken+=" link-$t"; fi
done
platform='noask: this command needs Linux with bash 5, GNU coreutils and flock; noask is not available here'
envs=("PATH=$bin36")
noask status; is status 0 off
noask --session s-1 status; is session-status 0 off
noask; is plain 0 'noask: off'
noask --session s-1; is session-plain 0 'noask: off'
for a in 'global on' '--session s-1 on' 'global off' '--session s-1 count question 6'; do
  read -ra words <<< "$a"
  noask "${words[@]}"
  { [ "$rc" -eq 1 ] && [ -z "$out" ] && [ "$err" = "$platform" ]; } || broken+=" ${a// /_}"
done
[ ! -e "$home/.local/state" ] || broken+=" state"
if p=$(command -v flock); then ln -s -- "$p" "$bin36/flock"; else broken+=" link-flock"; fi
fresh 36-flock
envs=("PATH=$bin36")
noask global on
{ [ "$rc" -eq 0 ] && [ -z "$err" ] && [ -f "$G" ]; } || broken+=" with-flock"
verdict 36

# 37. A count while the session reads off: with no marker, with HOME unset,
#     and with the global marker expired, it prints off and makes no
#     budgets.d; a switch on and off with no count between makes none either.
fresh 37
noask --session s-1 count question 6; is none 0 off
[ ! -e "$B" ] || broken+=" none-made"
nohome=1
noask --session s-1 count question 6; is nohome 0 off
nohome=
step on global on 30m
now=$T1 # 23:30:12, the marker's until
noask --session s-1 count question 6; is expired 0 off
[ ! -e "$B" ] || broken+=" expired-made"
fresh 37-switch
step on global on
step off global off
{ [ -d "$st" ] && [ ! -e "$B" ]; } || broken+=" switch-made"
verdict 37

# 38. Counting refused questions against a budget of 6 under the global
#     marker: the sixth spends it, and a spent record counts nothing more;
#     the record's lines and modes. Both test variables set and empty read as
#     unset.
fresh 38
step on global on
gen=$(gen_of "$G")
for i in 1 2 3 4 5; do
  noask --session s-1 count question 6; is "question-$i" 0 "counted none $i 0 0"
done
noask --session s-1 count question 6; is question-6 0 'counted question 6 0 0'
noask --session s-1 count question 6; is question-7 0 'counted question 6 0 0'
noask --session s-1 count denial 10; is spent-denial 0 'counted question 6 0 0'
noask --session s-1 count read; is read 0 'counted question 6 0 0'
marker "$B/s-1"
{ [ -n "$gen" ] && [ "${#m[@]}" -eq 5 ] && [ "${m[0]}" = "generation=$gen" ] && [ "${m[1]}" = refusals=6 ] &&
  [ "${m[2]}" = denials=0 ] && [ "${m[3]}" = continuations=0 ] && [ "${m[4]}" = spent=question ]; } ||
  broken+=" record"
[ "$(stat -c %a -- "$B/s-1" 2>/dev/null) $(stat -c %a -- "$B" 2>/dev/null)" = '600 700' ] || broken+=" modes"
envs=(SDD_NOASK_NOW= SDD_NOASK_LOCK_WAIT=)
noask --session s-1 count denial 10; is empty-variables 0 'counted question 6 0 0'
envs=()
verdict 38

# 39. The three counters and reset: reset zeroes them while nothing is spent,
#     and changes nothing once a budget is.
fresh 39
step on global on
noask --session s-1 count denial 10; is denial-1 0 'counted none 0 1 0'
noask --session s-1 count denial 10; is denial-2 0 'counted none 0 2 0'
noask --session s-1 count continuation 20; is continuation 0 'counted none 0 2 1'
noask --session s-1 count reset; is reset 0 'counted none 0 0 0'
noask --session s-1 count question 1; is spend 0 'counted question 1 0 0'
noask --session s-1 count reset; is reset-spent 0 'counted question 1 0 0'
verdict 39

# 40. The generation rule: a record of an earlier generation starts again
#     (planted back after the switch's sweep removed it), a renewal keeps the
#     count; the record carries the generation of the marker the session
#     reads; under an unreadable global marker a new record's is empty.
fresh 40
step on global on
noask --session s-1 count question 6; is first 0 'counted none 1 0 0'
cp -- "$B/s-1" "$tmp/c40" 2>/dev/null
step off global off
step again global on
cp -- "$tmp/c40" "$B/s-1" 2>/dev/null
noask --session s-1 count question 6; is new-generation 0 'counted none 1 0 0'
[ "$(gen_of "$B/s-1")" = "$(gen_of "$G")" ] || broken+=" new-generation-record"
step renew global on 9h
noask --session s-1 count question 6; is renewed 0 'counted none 2 0 0'
fresh 40-session
step s-1 --session s-1 on
noask --session s-1 count denial 10; is session 0 'counted none 0 1 0'
own=$(gen_of "$D/s-1")
{ [ -n "$own" ] && [ "$(gen_of "$B/s-1")" = "$own" ]; } || broken+=" session-generation"
step global global on
noask --session s-1 count denial 10; is both 0 'counted none 0 1 0'
gen=$(gen_of "$G")
{ [ -n "$gen" ] && [ "$(gen_of "$B/s-1")" = "$gen" ]; } || broken+=" both-generation"
fresh 40-unreadable
two_lines "$G"
noask --session s-1 count question 6; is unreadable 0 'counted none 1 0 0'
marker "$B/s-1"
[ "${m[0]-}" = generation= ] || broken+=" unreadable-generation"
# late_count PART SWITCH...: while a holder has the records' lock, start
# `noask --session s-1 count question 6`, wait until it waits for the lock
# (its `flock -w 17 8` is running), run each SWITCH (a switching command's
# words in one string), then free the lock; rc, out and err are the count's
# (out and err one line each at most).
late_count() {
  local part=$1 held free holder waiter switching line=''
  local -a words
  shift
  rm -f -- "$tmp/late-held" "$tmp/late-free" "$tmp/late-out"
  mkfifo -- "$tmp/late-held" "$tmp/late-free"
  exec {held}<>"$tmp/late-held" {free}<>"$tmp/late-free"
  flock "$B/.lock" bash -c 'echo held; read -r -t 30 _' > "$tmp/late-held" <&"$free" &
  holder=$!
  read -r -t 10 -u "$held" line
  [ "$line" = held ] || broken+=" $part-holder"
  {
    envs=(SDD_NOASK_LOCK_WAIT=17)
    noask --session s-1 count question 6
    printf '%s\n' "$rc" "$out" "$err" > "$tmp/late-out"
  } &
  waiter=$!
  for _ in $(seq 1 100); do
    pgrep -xf 'flock -w 17 8' > /dev/null && break
    sleep 0.1
  done
  pgrep -xf 'flock -w 17 8' > /dev/null || broken+=" $part-not-waiting"
  for switching in "$@"; do
    read -ra words <<< "$switching"
    step "$part-${switching// /-}" "${words[@]}"
  done
  echo free >&"$free"
  wait "$holder"
  wait "$waiter"
  exec {held}<&- {free}<&-
  { read -r rc; read -r out; read -r err; } < "$tmp/late-out"
}
# A count waiting for the records' lock acts on the reading it takes under
# the lock: an off and an on meanwhile charge the new generation, an off
# meanwhile prints off and writes nothing.
fresh 40-late
step on global on
noask --session s-1 count question 6; is late-first 0 'counted none 1 0 0'
late_count late global\ off global\ on
is late 0 'counted none 1 0 0'
gen=$(gen_of "$G")
{ [ -n "$gen" ] && [ "$(gen_of "$B/s-1")" = "$gen" ]; } || broken+=" late-generation"
fresh 40-late-off
step on global on
noask --session s-1 count question 6; is late-off-first 0 'counted none 1 0 0'
cp -- "$B/s-1" "$tmp/c40-late-off" 2>/dev/null
late_count late-off global\ off
is late-off 0 off
cmp -s -- "$B/s-1" "$tmp/c40-late-off" || broken+=" late-off-written"
verdict 40

# 41. A subagent's record is its own, and leaves the session's as it was; an
#     agent id with a dot or a slash, or --agent before --session or with
#     another word than count, is a wrong argument.
fresh 41
step on global on
noask --session s-1 count question 6; is session 0 'counted none 1 0 0'
cp -- "$B/s-1" "$tmp/c41" 2>/dev/null
noask --session s-1 --agent a1 count denial 10; is agent 0 'counted none 0 1 0'
marker "$B/s-1.a1"
{ [ "${#m[@]}" -eq 5 ] && [ "${m[0]}" = "generation=$(gen_of "$G")" ] && [ "${m[2]}" = denials=1 ]; } ||
  broken+=" agent-record"
cmp -s -- "$B/s-1" "$tmp/c41" || broken+=" session-touched"
fresh 41-arguments
refused agent-dot usage --session s-1 --agent a.1 count denial 10
refused agent-slash usage --session s-1 --agent a/1 count denial 10
refused agent-first usage --agent a1 --session s-1 count denial 10
refused agent-status usage --session s-1 --agent a1 status
verdict 41

# 42. Twenty counts for one session at once: each exits 0 and every one is
#     counted; no temporary file is left.
fresh 42
step on global on
mkdir -p -- "$tmp/c42"
envs=(SDD_NOASK_LOCK_WAIT=60) limit=120
for i in $(seq 1 20); do
  { noask --session s-1 count denial 99; printf '%s\n' "$rc" > "$tmp/c42/$i"; } &
done
wait
envs=() limit=10
[ "$(find "$tmp/c42" -type f | wc -l)" -eq 20 ] || broken+=" runs"
for f in "$tmp/c42"/*; do
  [ "$(cat -- "$f")" = 0 ] || broken+=" run-${f##*/}"
done
marker "$B/s-1"
[ "${m[2]-}" = denials=20 ] || broken+=" denials"
[ -z "$(find "$B" -name '.noask.*' 2>/dev/null)" ] || broken+=" leftover"
verdict 42

# 43. A count that fails: the records' lock held elsewhere, budgets.d at
#     mode 500 (left out as root, with a note line after the verdict); a
#     record that does not parse is started again; wrong arguments.
fresh 43
step on global on
noask --session s-1 count question 6; is first 0 'counted none 1 0 0'
mkfifo -- "$tmp/c43"
exec {pipe}<>"$tmp/c43"
flock "$B/.lock" bash -c 'echo held; sleep 2' > "$tmp/c43" &
holder=$!
line=
read -r -t 10 -u "$pipe" line
[ "$line" = held ] || broken+=" holder"
envs=(SDD_NOASK_LOCK_WAIT=0.2)
noask --session s-1 count question 6
{ [ "$rc" -eq 1 ] && [ "$err" = 'noask: the records are locked by another noask command' ] && [ -z "$out" ]; } ||
  broken+=" locked"
envs=()
wait "$holder"
exec {pipe}<&-
marker "$B/s-1"
[ "${m[1]-}" = refusals=1 ] || broken+=" locked-counted"
printf 'x\n' > "$B/s-1"
if [ -z "$as_root" ]; then
  chmod 500 -- "$B"
  noask --session s-1 count question 6 # the record does not parse either: still one line
  { [ "$rc" -eq 1 ] && [ -z "$out" ] && [[ $err == 'noask: '* ]] && [[ $err != *$'\n'* ]]; } || broken+=" mode-500"
  chmod 700 -- "$B"
fi
noask --session s-1 count question 6
{ [ "$rc" -eq 0 ] && [ "$out" = 'counted none 1 0 0' ] &&
  [ "$err" = "noask: the record $B/s-1 did not parse (the record has 1 line, not 5); started again" ]; } ||
  broken+=" not-parsed"
fresh 43-arguments
refused no-session usage count question 6
envs=(CLAUDE_CODE_SESSION_ID=s-1)
refused env-session usage count question 6
envs=()
refused bare usage --session s-1 count
refused no-budget usage --session s-1 count question
refused zero usage --session s-1 count question 0
refused extra usage --session s-1 count question 6 7
refused reset-extra usage --session s-1 count reset 1
refused bogus usage --session s-1 count bogus 6
verdict 43
[ -z "$as_root" ] || echo 'note 43 (the mode-500 sub-case needs a user that file modes bind)'

# 44. The records' sweep by a switching command, after its own switch: a
#     record whose generation no marker that reads on carries is removed, one
#     under a session's marker that reads on stays, and so does the lock;
#     status removes nothing. While a count holds the records' lock the sweep
#     leaves the records and the temporary files to the next switch. No record
#     is removed while a marker reads unreadable, or while noask.d cannot be
#     listed (300) or searched (400) (both left out as root, with a note line).
fresh 44
step on global on
step count --session s-1 count question 6
noask global off; is off 0 'noask: off for every session'
{ [ ! -e "$B/s-1" ] && [ -f "$B/.lock" ]; } || broken+=" stale-kept"
step s-2 --session s-2 on
step s-2-count --session s-2 count denial 10
step global-on global on
{ [ -f "$B/s-2" ] && [ -f "$B/.lock" ]; } || broken+=" live-removed"
printf '%s\n' generation= refusals=0 denials=0 continuations=0 spent=none > "$B/s-9"
noask status
{ [ "$rc" -eq 0 ] && [ -f "$B/s-9" ]; } || broken+=" status-removed"
step already global on
{ [ ! -e "$B/s-9" ] && [ -f "$B/s-2" ]; } || broken+=" already-kept"
fresh 44-locked
step on global on
step count --session s-1 count question 6
: > "$B/.noask.x"
mkfifo -- "$tmp/c44"
exec {pipe}<>"$tmp/c44"
flock "$B/.lock" bash -c 'echo held; sleep 2' > "$tmp/c44" &
holder=$!
line=
read -r -t 10 -u "$pipe" line
[ "$line" = held ] || broken+=" holder"
noask global off; is locked-off 0 'noask: off for every session'
{ [ -f "$B/s-1" ] && [ -e "$B/.noask.x" ]; } || broken+=" locked-removed"
kill -0 "$holder" 2>/dev/null || broken+=" waited"
wait "$holder"
exec {pipe}<&-
noask global off; is free-off 0 'noask: already off for every session'
{ [ ! -e "$B/s-1" ] && [ ! -e "$B/.noask.x" ]; } || broken+=" free-kept"
fresh 44-unreadable
two_lines "$G"
step count --session s-1 count question 6
step s-2 --session s-2 on
[ -f "$B/s-1" ] || broken+=" unreadable-removed"
noask global off
is unreadable-off 0 \
  'noask: off for every session (unreadable marker removed); sessions still on by their own switch: 1 (noask lists them)'
{ [ ! -e "$G" ] && [ ! -e "$B/s-1" ]; } || broken+=" unreadable-kept"
if [ -z "$as_root" ]; then
  fresh 44-300
  step on global on
  step count --session s-1 count question 6
  own_dir "$D"
  chmod 300 -- "$D"
  noask global off; is 300-off 0 'noask: off for every session'
  [ -f "$B/s-1" ] || broken+=" 300-removed"
  chmod 700 -- "$D"
  fresh 44-400
  step s-1 --session s-1 on
  step count --session s-1 count question 6
  chmod 400 -- "$D"
  noask global off; is 400-off 0 'noask: already off for every session'
  [ -f "$B/s-1" ] || broken+=" 400-removed"
  chmod 700 -- "$D"
fi
verdict 44
[ -z "$as_root" ] || echo 'note 44 (the noask.d mode sub-cases need a user that file modes bind)'

exit "$fail"
