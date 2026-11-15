#!/usr/bin/env bash
# Test for bin/noask of the sdd plugin, the noask switch's only writer, and
# for its rule text scripts/noask-rule.md. Every command runs under a
# temporary HOME (and CLAUDE_PLUGIN_DATA) made for its case and removed on
# exit, with TZ=Etc/GMT-4 and SDD_NOASK_NOW=1794423612
# (2026-11-11T23:00:12+04:00) unless the case moves the clock, and with
# CLAUDE_CODE_SESSION_ID, CLAUDE_PLUGIN_OPTION_TERMINAL, CLAUDE_CONFIG_DIR and
# SDD_NOASK_LOCK_WAIT unset unless the case sets one, so no case touches the
# real markers or reads the session this test runs in. Each command runs
# under `timeout 10` (case 27's under `timeout 120`), so a hang fails its case
# instead of the run. Prints "ok <n>" or "FAIL <n> (<broken parts>)" per case
# and "skip <n> (<reason>)" for a case that cannot run; exits 1 when any case
# fails. The cases are those of the phase 2 plan (a local working document),
# Task 2.
#
# Usage: bash tests/test-noask.sh [SCRIPT]
#   Default SCRIPT: bin/noask in the plugin root, the parent of this script's
#   directory. The rule text is read from scripts/ beside SCRIPT's bin/, and
#   case 14 copies those two directories.
# Case 29 and case 10's mode-000 sub-case need a user that file modes bind,
# so they are skipped when the tests run as root.
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
# clock, with no extra variables and the default time limit; st, G and D are
# its state directory, global marker and session marker directory.
fresh() {
  home=$tmp/home-$1
  mkdir -p "$home"
  st=$home/.local/state/sdd
  G=$st/noask
  D=$st/noask.d
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
# two_lines FILE: an unreadable marker, its first two lines only.
two_lines() {
  mkdir -p -- "${1%/*}"
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

# 1. No marker: off in every form; with HOME unset both readers read off and
#    a switching command fails.
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
#     copy. The FIFO is a marker whose read never answers.
# bad_global KIND: the global marker of sub-case KIND.
bad_global() {
  mkdir -p -- "$st"
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
mkdir -p -- "$st"
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

# 29. A sweep that cannot remove changes neither the output nor the exit.
if [ -n "$as_root" ]; then
  echo 'skip 29 (run as root, which removes through any mode)'
else
  fresh 29
  step s-1 --session s-1 on 30m
  step global global on
  now=1794425460
  chmod 555 -- "$D" 2>/dev/null
  noask global off; is off 0 'noask: off for every session'
  { [ ! -e "$G" ] && [ -e "$D/s-1" ]; } || broken+=" files"
  chmod 755 -- "$D" 2>/dev/null
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

exit "$fail"
