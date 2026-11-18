#!/usr/bin/env bash
# shellcheck disable=SC2016 # the texts in single quotes hold a $ on purpose
# Holds the fence's table, tests/fence-rows.txt, against bash itself. It
# first compares the output of tests/gen-fence-rows.sh with the committed
# hooks/fence.rows.ts; then it runs every record that is not marked norun
# under bash, with logging stubs in place of the programs the fence names,
# and holds what ran against the record's hits. A record marked agrees
# fails when the two differ, and one marked differs fails when they agree,
# so a marking cannot go stale.
#
# A record runs as
#   env -i HOME=<home> PATH=<stubs> FENCE_LOG=<log> "$BASH" <file>
# from a folder that holds two empty files a and b and an empty folder x,
# with standard input from /dev/null, its output read to its end and
# dropped (so that a process substitution has ended before the record is
# judged), and 20 seconds to run. The file is the record's text with
# /home/u replaced by <home> and /tmp by a temporary folder, both made anew
# for each record. <home> holds .local/state/sdd with noask, noask.d/s-1
# and budgets.d/s-1, one line each, and .local/bin/noask, a link to the
# noask stub. The stub folder holds nineteen names and nothing else: git,
# gh, glab, noask and the thirteen file programs the fence reads (rm,
# rmdir, unlink, shred, mv, cp, ln, install, truncate, tee, dd, touch and
# chmod), each a copy of one script that appends to the log its name, its arguments
# and the names of the SDD_NOASK_ variables it was given and exits 0, and
# links to the env and nohup found on PATH. A stub only logs, so no record
# removes, moves or writes a file through a program; what a record's own
# redirections write lands under <home>, the temporary folder or the run's
# folder.
#
# What ran, as the fence's kinds: a noask call with any argument but one
# "status" alone, or given an SDD_NOASK_ variable, is "switching noask"; so
# is a file under the temporary state directory that is new, changed or
# gone afterwards; and so is a call of one of the file programs that was
# handed the state directory or a path under it (as a whole argument, after
# an argument's first "=", or from the first "/" of an argument that starts
# with "-"), and, for rm, rmdir and mv, a folder above it up to <home>. A
# git call whose subcommand is push is "a push" when its arguments have a
# plain push's shape (before push nothing but one -C and its path; after it
# at most one -u or --set-upstream and at most two words, neither starting
# with - or + nor holding a ":") and "a push other than a plain one"
# otherwise; gh pr create or new and glab mr create or new are "a pull
# request" and "a merge request". The kinds are compared with the record's
# hits as sets. A record whose hit is the scan's refusal to read a command
# ("a here-document left open by a substitution") names nothing bash runs,
# so it never agrees: it is marked differs, and its detail says what bash
# ran, read off this script's own message when the record is marked agrees.
#
# Guards, which keep the run harmless: a record is not run, whatever its
# marking says, when its text, after the two replacements, holds an
# absolute path other than /dev/null or one it may become (a variable other
# than HOME before a "/", ~user, a ".." that climbs above where its path
# starts, an option with a path attached), names PATH or FENCE_LOG, gives
# env an option that empties the environment, asks command for its default
# search path, or holds an ANSI-C quoted word; a record so refused fails
# unless it is marked norun. The stub folder is checked to hold its
# nineteen names alone before every record. Before the first record the
# script proves these guards on texts that must be refused and on stub
# folders with a stray, a missing or a changed name, and stops if one lets
# its input through. The guards make the table's records harmless; they do
# not make any text harmless (bash's own builtins still run), so a new
# record is read before it is added.
#
# Not run either: a record marked norun, and on a bash older than 5.3 a
# record that holds a "${ " or "${|" substitution.
#
# Usage: bash tests/check-fence-rows.sh
#   Prints "ok <n> rows, <m> not run"; exits 1 on a failure, naming each.
set -uo pipefail
export LC_ALL=C
shopt -s nullglob dotglob globstar

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here/.." && pwd)
STUBBED=(git gh glab noask rm rmdir unlink shred mv cp ln install truncate tee dd touch chmod)
LINKED=(env nohup)
FILE_PROGRAMS=' rm rmdir unlink shred mv cp ln install truncate tee dd touch chmod '
H=$'\x01H' T=$'\x01T' N=$'\x01N' U=$'\x01U' V=$'\x01V'

die() {
  printf 'check-fence-rows: %s\n' "$1" >&2
  exit 1
}

# The committed rows file first.
bash "$here/gen-fence-rows.sh" | cmp - "$root/hooks/fence.rows.ts" ||
  die 'hooks/fence.rows.ts is not what tests/gen-fence-rows.sh prints; run it again'

work=$(cd "$(mktemp -d)" && pwd -P) || die 'cannot make a work folder'
trap 'rm -rf -- "$work"' EXIT
plain_path='^/[A-Za-z0-9._/-]+$'
[[ $work =~ $plain_path ]] || die "the work folder's path holds a character a record could misread: $work"
[[ $BASH =~ $plain_path ]] || die "bash's path holds a character a stub could misread: $BASH"
log=$work/log

# The stub's text: it appends NUL-ended fields to FENCE_LOG (to the run's
# log when exec -c emptied its environment): "call", its name, the count
# and the words of its arguments, the count and the names of the
# SDD_NOASK_ variables it was given; and it exits 0. The fields go out in
# one printf, one write to a file opened for appending, so that two stubs of
# one pipeline do not interleave their entries (an argument that holds a
# line end may split it, since bash's output is line-buffered; the log then
# fails to parse, and the record fails).
IFS= read -r -d '' stub_text << 'STUB'
#!@BASH@
# A stub of tests/check-fence-rows.sh: it logs this call and exits 0.
mapfile -t vars < <(compgen -e -X '!SDD_NOASK_*')
format='call\0%s\0%s\0'
for _ in "$@"; do format+='%s\0'; done
format+='%s\0'
for _ in "${vars[@]}"; do format+='%s\0'; done
# shellcheck disable=SC2059 # the format holds only %s and \0
printf "$format" "${0##*/}" "$#" "$@" "${#vars[@]}" "${vars[@]}" >> "${FENCE_LOG:-@LOG@}"
exit 0
STUB
stub_text=${stub_text%$'\n'}
stub_text=${stub_text//@BASH@/$BASH}
stub_text=${stub_text//@LOG@/$log}

# build_stubs DIR: makes DIR, the stub folder.
build_stubs() {
  local dir=$1 name real
  mkdir -- "$dir" || return 1
  for name in "${STUBBED[@]}"; do
    printf '%s\n' "$stub_text" > "$dir/$name" && chmod +x "$dir/$name" || return 1
  done
  for name in "${LINKED[@]}"; do
    real=$(type -P "$name") && [[ $real == /* ]] || return 1
    ln -s -- "$real" "$dir/$name" || return 1
  done
}
# stubs_only DIR: true when DIR holds the nineteen names and nothing else,
# each stub the stub's text and each link a link.
stubs_only() {
  local dir=$1 name
  local -a found=("$dir"/*)
  [ "${#found[@]}" -eq $((${#STUBBED[@]} + ${#LINKED[@]})) ] || return 1
  for name in "${STUBBED[@]}"; do
    [ -f "$dir/$name" ] && [ ! -L "$dir/$name" ] && [ "$(< "$dir/$name")" = "$stub_text" ] || return 1
  done
  for name in "${LINKED[@]}"; do
    [ -L "$dir/$name" ] || return 1
  done
}
# bounded TEXT FROM TO: sets REPLY to TEXT with every FROM that is not
# followed by a name character replaced by TO.
bounded() {
  local text=$1 from=$2 to=$3 out=''
  while [[ $text == *"$from"* ]]; do
    out+=${text%%"$from"*}
    text=${text#*"$from"}
    if [[ $text =~ ^[A-Za-z0-9._-] ]]; then out+=$from; else out+=$to; fi
  done
  REPLY=$out$text
}
# placeheld TEXT: sets REPLY to TEXT with /home/u and /tmp replaced by the
# placeholders H and T, the two replacements of a run.
placeheld() {
  bounded "$1" /home/u "$H"
  bounded "$REPLY" /tmp "$T"
}

re_absolute='(^|[^]A-Za-z0-9._~}*?])/'
re_option="(^|[[:space:]\"'=])-+[A-Za-z0-9]*/"
re_variable='\$([A-Za-z_][A-Za-z0-9_]*|\{[^}]*\}|[0-9@*#?$!-])/'
re_tilde='~[A-Za-z0-9_+-]'
re_climb='(^|[^.])\.\.([^.]|$)'
re_fold='^(.*)/(\.?[A-Za-z0-9_-][A-Za-z0-9_.-]*)/\.\.(/.*|[^A-Za-z0-9_./-].*|)$'
re_env='(^|[^A-Za-z0-9_])env([^A-Za-z0-9_]|$)'
re_empties='(^|[[:space:]])(-|-[A-Za-z0-9]*i[^[:space:]]*|--i[^[:space:]]*)([[:space:]]|$)'
re_names='(^|[^A-Za-z0-9_])(PATH|FENCE_LOG)([^A-Za-z0-9_]|$)'
re_default_path='(^|[^A-Za-z0-9_])command([[:space:]]+-[A-Za-z]+)*[[:space:]]+-[A-Za-z]*p'

# refusal TEXT: sets REFUSAL to why the record TEXT must not run, or to
# nothing. The checks of names read the text with its quotes and
# backslashes removed, so that a quoted spelling hides nothing.
refusal() {
  local text bare
  REFUSAL=
  placeheld "$1"
  text=$REPLY
  bounded "$text" /dev/null "$N"
  text=$REPLY
  text=${text//:\/\//$U}
  text=${text//\$HOME\//$V/}
  text=${text//\$\{HOME\}\//$V/}
  while [[ $text =~ $re_fold ]]; do
    text=${BASH_REMATCH[1]}${BASH_REMATCH[3]}
  done
  bare=${1//[\\\"\']/}
  if [[ $text =~ $re_absolute ]] || [[ $text =~ $re_option ]]; then
    REFUSAL='an absolute path'
  elif [[ $text =~ $re_variable ]]; then
    REFUSAL='a variable before a path'
  elif [[ $text =~ $re_tilde ]]; then
    REFUSAL="another user's home"
  elif [[ $text =~ $re_climb ]]; then
    REFUSAL='a .. that climbs above where its path starts'
  elif [[ $1 == *"\$'"* ]]; then
    REFUSAL='an ANSI-C quoted word'
  elif [[ $bare =~ $re_names ]]; then
    REFUSAL='PATH or FENCE_LOG named'
  elif [[ $bare =~ $re_env ]] && [[ $bare =~ $re_empties ]]; then
    REFUSAL='env empties the environment'
  elif [[ $bare =~ $re_default_path ]]; then
    REFUSAL="command's default search path"
  fi
}

# Prove the guards before any record runs.
must_refuse=(
  '/usr/bin/git push'
  'rm -r /home/*/.local/state/sdd'
  'echo x > /etc/x'
  'echo x >"/etc/x"'
  'cp -t/etc x'
  'echo x > $d/etc'
  'echo x > ${d}/etc'
  'echo x > ~root/x'
  'echo x > ../x'
  'echo x > /home/u/../../etc/x'
  'echo x > $HOME/../x'
  'env -i git push'
  'env -iu X noask off'
  'env - git push'
  'env --ignore-environment git push'
  'e\nv -i git push'
  "env -S '-i git push'"
  'PATH=. git push'
  'export PATH'
  'echo x > "$FENCE_LOG"'
  'command -p git push'
  'command -v -p git'
  "\$'\\x67it' push"
)
must_pass=(
  'git push'
  'rm ~/.local/state/sdd/noask'
  'rm -f "$HOME/.local/state/sdd/noask.d/s-1"'
  'rm -r ${HOME}/.local/state/sdd'
  'printf x >> /home/u/.local/state/sdd/../sdd/noask'
  'cp -t/home/u/.local/state/sdd /tmp/noask'
  'dd if=/dev/null of=/home/u/.local/state/sdd/noask'
  'git push https://example.org/o/r.git main'
  'env -u X noask global off'
  'env -C/tmp noask global off'
  'sed -i s/x/y/ ~/.local/state/sdd/budgets.d/s-1'
)
for text in "${must_refuse[@]}"; do
  refusal "$text"
  [ -n "$REFUSAL" ] || die "the guard lets this text run: $text"
done
for text in "${must_pass[@]}"; do
  refusal "$text"
  [ -z "$REFUSAL" ] || die "the guard refuses this text ($REFUSAL): $text"
done
stubs=$work/stubs
build_stubs "$stubs" || die 'cannot make the stub folder'
stubs_only "$stubs" || die 'the stub folder just made fails its own check'
if ! { build_stubs "$work/stray" && : > "$work/stray/sh"; }; then
  die 'cannot make a stub folder with a stray name'
fi
! stubs_only "$work/stray" || die 'the stub folder check lets a stray name through'
if ! { build_stubs "$work/swapped" && rm -- "$work/swapped/git" && : > "$work/swapped/sh"; }; then
  die 'cannot make a stub folder with a name swapped'
fi
! stubs_only "$work/swapped" || die 'the stub folder check lets a swapped name through'
if ! { build_stubs "$work/changed" && printf 'x\n' >> "$work/changed/rm"; }; then
  die 'cannot make a stub folder with a changed stub'
fi
! stubs_only "$work/changed" || die 'the stub folder check lets a changed stub through'
rm -rf -- "$work/stray" "$work/swapped" "$work/changed"

# folded PATH: sets REPLY to PATH with ".", ".." and empty parts folded when
# it is absolute, else to PATH.
folded() {
  local part IFS=/
  local -a parts=() kept=()
  if [[ $1 != /* ]]; then
    REPLY=$1
    return
  fi
  read -r -a parts <<< "$1"
  for part in "${parts[@]}"; do
    case $part in
      '' | .) ;;
      ..) [ "${#kept[@]}" -eq 0 ] || unset 'kept[-1]' ;;
      *) kept+=("$part") ;;
    esac
  done
  REPLY=/${kept[*]}
}
# A call's kinds, added to KINDS. home and state are the run's.
git_kind() {
  local k=0 word ups=0 operands=0 is_plain=1
  local -a words=("$@")
  while [ "$k" -lt "${#words[@]}" ] && [[ ${words[k]} == -* ]]; do
    case ${words[k]} in
      -C | -c | --git-dir | --work-tree | --namespace | --config-env | --attr-source | --super-prefix) k=$((k + 2)) ;;
      *) k=$((k + 1)) ;;
    esac
  done
  [ "${words[k]:-}" = push ] || return 0
  if [ "$k" -ne 0 ] && { [ "$k" -ne 2 ] || [ "${words[0]}" != -C ]; }; then is_plain=0; fi
  for word in "${words[@]:k+1}"; do
    case $word in
      -u | --set-upstream) ups=$((ups + 1)) ;;
      -* | +* | *:*) is_plain=0 ;;
      *) operands=$((operands + 1)) ;;
    esac
  done
  [ "$ups" -le 1 ] && [ "$operands" -le 2 ] || is_plain=0
  if [ "$is_plain" -eq 1 ]; then KINDS+=('a push'); else KINDS+=('a push other than a plain one'); fi
}
request_kind() { # NOUN KIND ARG...
  local noun=$1 kind=$2
  local -a left=()
  shift 2
  while [ "$#" -gt 0 ]; do
    case $1 in
      -R | --repo) shift 2 || shift ;;
      -*) shift ;;
      *) left+=("$1") && shift ;;
    esac
  done
  if [ "${left[0]:-}" = "$noun" ] && [[ ${left[1]:-} =~ ^(create|new)$ ]]; then KINDS+=("$kind"); fi
}
file_kind() { # NAME ARG...
  local name=$1 arg candidate
  shift
  for arg in "$@"; do
    local -a candidates=("$arg")
    [[ $arg != *=* ]] || candidates+=("${arg#*=}")
    [[ $arg != -*/* ]] || candidates+=("/${arg#*/}")
    for candidate in "${candidates[@]}"; do
      folded "$candidate"
      if [ "$REPLY" = "$state" ] || [[ $REPLY == "$state"/* ]]; then
        KINDS+=('switching noask')
        return
      fi
      case $name in
        rm | rmdir | mv)
          if [ "$REPLY" = "$home" ] || [ "$REPLY" = "$home/.local" ] || [ "$REPLY" = "$home/.local/state" ]; then
            KINDS+=('switching noask')
            return
          fi
          ;;
      esac
    done
  done
}
call_kinds() { # NAME VARIABLES ARG...
  local name=$1 variables=$2
  shift 2
  case $name in
    noask)
      if [ "$variables" -gt 0 ] || { [ "$#" -gt 0 ] && { [ "$#" -ne 1 ] || [ "$1" != status ]; }; }; then
        KINDS+=('switching noask')
      fi
      ;;
    git) git_kind "$@" ;;
    gh) request_kind pr 'a pull request' "$@" ;;
    glab) request_kind mr 'a merge request' "$@" ;;
    *) [[ $FILE_PROGRAMS != *" $name "* ]] || file_kind "$name" "$@" ;;
  esac
}
# log_kinds: adds the kinds of every call in the log to KINDS; fails on a
# log not of the stub's form.
log_kinds() {
  local at=0 count
  local -a fields=() words=()
  mapfile -d '' fields < "$log"
  while [ "$at" -lt "${#fields[@]}" ]; do
    [ "${fields[at]}" = call ] && [[ ${fields[at + 2]:-} =~ ^[0-9]+$ ]] || return 1
    count=${fields[at + 2]}
    words=("${fields[at + 1]}" "${fields[@]:at+3:count}")
    at=$((at + 3 + count))
    [[ ${fields[at]:-} =~ ^[0-9]+$ ]] || return 1
    call_kinds "${words[0]}" "${fields[at]}" "${words[@]:1}"
    at=$((at + 1 + fields[at]))
  done
}
# snapshot DIR: every entry under DIR with its kind, and each file's text.
snapshot() {
  local entry text
  for entry in "$1"/**; do
    if [ -L "$entry" ]; then
      printf 'link %s\n' "$entry"
    elif [ -d "$entry" ]; then
      printf 'dir %s\n' "$entry"
    elif [ -f "$entry" ]; then
      text=
      IFS= read -r -d '' text < "$entry"
      printf 'file %s %q\n' "$entry" "$text"
    else
      printf 'other %s\n' "$entry"
    fi
  done
}
# sorted_kinds KIND...: sets REPLY to the kinds, sorted and each once, one
# per line.
sorted_kinds() {
  REPLY=
  [ "$#" -eq 0 ] || REPLY=$(printf '%s\n' "$@" | sort -u)
}
# run_record TEXT: runs the record in a fresh home and sets REPLY to the
# kinds of what ran; fails, with WHY set, when the run cannot be judged.
run_record() {
  local base=$work/record before after status
  rm -rf -- "$base"
  home=$base/home state=$base/home/.local/state/sdd
  if ! { mkdir -p -- "$state/noask.d" "$state/budgets.d" "$home/.local/bin" "$base/tmp" "$base/run/x" &&
    printf 'marker\n' > "$state/noask" && printf 'marker\n' > "$state/noask.d/s-1" &&
    printf 'record\n' > "$state/budgets.d/s-1" && : > "$base/run/a" && : > "$base/run/b" &&
    ln -s -- "$stubs/noask" "$home/.local/bin/noask" && : > "$log"; }; then
    WHY='cannot make its home'
    return 1
  fi
  placeheld "$1"
  REPLY=${REPLY//$H/$home}
  printf '%s\n' "${REPLY//$T/$base/tmp}" > "$base/record.sh"
  before=$(snapshot "$state")
  (cd -- "$base/run" && exec timeout 20 env -i HOME="$home" PATH="$stubs" FENCE_LOG="$log" "$BASH" \
    "$base/record.sh" < /dev/null 2>&1) | cat > /dev/null
  status=${PIPESTATUS[0]}
  [ "$status" -ne 124 ] || {
    WHY='it ran past 20 seconds'
    return 1
  }
  after=$(snapshot "$state")
  KINDS=()
  log_kinds || {
    WHY='its log is not of the stub form'
    return 1
  }
  [ "$before" = "$after" ] || KINDS+=('switching noask')
  sorted_kinds "${KINDS[@]}"
}

bash "$here/gen-fence-rows.sh" --records > "$work/records" || die 'cannot read tests/fence-rows.txt'
mapfile -d '' fields < "$work/records"
[ $((${#fields[@]} % 3)) -eq 0 ] && [ "${#fields[@]}" -gt 0 ] || die 'tests/gen-fence-rows.sh --records printed no whole record'
is_old_bash=0
[ "${BASH_VERSINFO[0]}" -gt 5 ] || { [ "${BASH_VERSINFO[0]}" -eq 5 ] && [ "${BASH_VERSINFO[1]}" -ge 3 ]; } || is_old_bash=1
rows=0 not_run=0 failed=0
for ((at = 0; at < ${#fields[@]}; at += 3)); do
  rows=$((rows + 1))
  hits=${fields[at]} marking=${fields[at + 1]} text=${fields[at + 2]}
  printf -v shown '%q' "$text"
  if [[ $marking == norun:* ]] || { [ "$is_old_bash" -eq 1 ] && [[ $text == *'${ '* || $text == *'${|'* ]]; }; then
    not_run=$((not_run + 1))
    continue
  fi
  refusal "$text"
  if [ -n "$REFUSAL" ]; then
    printf 'FAIL record %s %s: marked %s, but the guard does not run it (%s)\n' "$rows" "$shown" "$marking" "$REFUSAL"
    failed=$((failed + 1))
    continue
  fi
  stubs_only "$stubs" || die "the stub folder holds more or other than its nineteen names, before record $rows"
  if ! run_record "$text"; then
    printf 'FAIL record %s %s: %s\n' "$rows" "$shown" "$WHY"
    failed=$((failed + 1))
    continue
  fi
  ran=$REPLY
  table=()
  [ "$hits" = none ] || mapfile -t table <<< "${hits//, /$'\n'}"
  sorted_kinds "${table[@]}"
  if [ "$marking" = agrees ] && [ "$REPLY" != "$ran" ]; then
    printf 'FAIL record %s %s: marked agrees; the table says {%s}, bash ran {%s}\n' "$rows" "$shown" \
      "${REPLY//$'\n'/, }" "${ran//$'\n'/, }"
    failed=$((failed + 1))
  elif [[ $marking == differs:* ]] && [ "$REPLY" = "$ran" ]; then
    printf 'FAIL record %s %s: marked %s, but bash ran what the table says {%s}\n' "$rows" "$shown" "$marking" \
      "${ran//$'\n'/, }"
    failed=$((failed + 1))
  fi
done
[ "$failed" -eq 0 ] || die "$failed of $rows rows failed"
echo "ok $rows rows, $not_run not run"
