#!/usr/bin/env bash
# Generator of hooks/entry.fixtures.ts, the texts the noask command's hook
# entries answer with, one per named case, which the plugin's module holds
# its own texts (hooks/text.ts) against: prints the file's text on standard
# output. Every entry runs under a temporary HOME of its own (removed on
# exit), with TZ=Etc/GMT-4 and SDD_NOASK_NOW=1794423612
# (2026-11-11T23:00:12+04:00), the tests' clock, all set here; with
# CLAUDE_CODE_SESSION_ID, CLAUDE_CONFIG_DIR, SDD_NOASK_LOCK_WAIT and every
# CLAUDE_PLUGIN_OPTION_* variable unset but those a case sets; and with
# CLAUDE_PLUGIN_DATA unset but in the four terminal notices' cases, which
# set one under the case's HOME. So no run touches the real markers,
# records, ~/.local/bin or plugin data, or reads the session this runs in.
# The inputs are those of tests/fixtures/hook-inputs, session_id set to s-1.
#
# A case's text is the one its entry answered with: the permission entry's
# denial message, the stop entry's context or its block's reason, and the
# session-start entry's message without its "sdd: " head, or its context.
# Each is then written the same on every run and in every checkout: the
# rule file's text as <rule> (but in ruleFallback, whose rule file is moved
# away), the plugin root as <root>, the case's HOME as <home>, and the
# line's times as <since>, <until> and <own until> (the session's own until
# after the global marker's line). The cases, each in a HOME of its own
# whose global switch is on until 07:30 but where it says otherwise:
#   permission: the main session's prompt; permissionSpent: the prompt that
#   spends a denial budget of 1; permissionSubagent and
#   permissionSubagentSpent: a subagent's, the same two ways;
#   permissionUnreadable: a global marker of one line and no switch on;
#   permissionNoId: a session_id of "a b"; permissionAgentUnusable: an
#   agent_id of "a b"; permissionCountFailed: budgets.d a file;
#   permissionCountNote: the session's record of one line.
#   stopRule: a stop on a message without a token; stopLastLine: a token on
#   the line before the last; stopSixth: the sixth such stop in a row;
#   stopNothingRunning: a waiting line on a first stop with nothing running
#   or scheduled; stopSpent: the stop that spends a continuation budget of
#   1; stopUnreadableInput: a first stop without jq on PATH;
#   stopCountFailed: budgets.d a file; stopHookFailed: a first stop whose
#   session_id is "a b".
#   startGlobal; startSession and startHandsoff: a session's own switch
#   alone, on for 2 hours, at each level; startBoth and startBothHandsoff:
#   both switches; startUnreadableGlobal and startUnreadableSession: that
#   marker of one line alone; startUnreadableBoth: a global marker of one
#   line beside the session's own on; startNoId: a session_id of "a b"
#   beside a session's own on; startJqNote: without jq on PATH;
#   startRuleNote: the rule file moved away, under the session's own on;
#   startBothNotes: both; startContext: the session start's context.
#   ruleFallback: a stop's text with the rule file moved away.
#   terminalAdded, terminalPath and terminalRemoved, in one HOME with no
#   switch on: a first start with that HOME's .local/bin on PATH, a second
#   with it off PATH, a third with the terminal option off;
#   terminalRefused: a file of its own at ~/.local/bin/noask.
#
# Usage: bash tests/gen-entry-texts.sh [SCRIPT] > hooks/entry.fixtures.ts
#   Default SCRIPT: bin/noask in the plugin root, the parent of this script's
#   directory; the rule text is read from scripts/ beside SCRIPT's bin/, and
#   the cases with the rule file moved away run a copy of those two
#   directories without it. Exits 1, printing nothing on standard output,
#   when a run of the command fails or answers what this script does not
#   expect.
set -uo pipefail
export LC_ALL=C

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
script=${1:-$here/../bin/noask}
root=$(dirname "$(dirname "$(realpath -- "$script")")")
fixtures=$here/fixtures/hook-inputs
tmp=$(cd "$(mktemp -d)" && pwd -P) || exit 1
trap 'rm -rf "$tmp"' EXIT
unset CLAUDE_CODE_SESSION_ID CLAUDE_CONFIG_DIR SDD_NOASK_LOCK_WAIT CLAUDE_PLUGIN_DATA
for name in $(compgen -e -X '!CLAUDE_PLUGIN_OPTION_*'); do unset "$name"; done
export TZ=Etc/GMT-4 SDD_NOASK_NOW=1794423612
homes=0 nl=$'\n'
names=() texts=()
# The lines' times as the command shows them at that clock: a switch's since, the global switch's until 07:30, and
# a session's own until, 2 hours on.
since='since 23:00' global_until='until 2026-11-12 07:30' own_until='until 2026-11-12 01:00'
# The answers' forms, each a jq filter that picks the text of one.
denial='select(.hookSpecificOutput.hookEventName == "PermissionRequest" and
  .hookSpecificOutput.decision.behavior == "deny") | .hookSpecificOutput.decision.message'
continued='select(.hookSpecificOutput.hookEventName == "Stop") | .hookSpecificOutput.additionalContext'
blocked='select(.decision == "block") | .reason'
context='select(.hookSpecificOutput.hookEventName == "SessionStart") | .hookSpecificOutput.additionalContext'

die() {
  printf 'gen-entry-texts: %s\n' "$1" >&2
  exit 1
}
# The rule text as an entry reads it: the file without the newlines that end it.
IFS= read -r -d '' rule < "$root/scripts/noask-rule.md"
rule=${rule%"${rule##*[!$'\n']}"}
[ -n "$rule" ] || die "cannot read $root/scripts/noask-rule.md"
# A folder of the tools the command calls but jq, as tests/test-noask.sh's case 16 makes it.
nojq=$tmp/nojq
mkdir -- "$nojq" || die "cannot make $nojq"
for t in bash date env realpath dirname timeout head tr mkdir mktemp mv rm od cat stat chmod flock; do
  p=$(type -P "$t") || die "$t is not on PATH"
  ln -s -- "$p" "$nojq/$t" || die "cannot link $t"
done
! env PATH="$nojq" bash -c 'command -v jq' > /dev/null 2>&1 || die 'jq is found in the folder without it'
# A copy of the plugin's bin and scripts directories without the rule file.
moved=$tmp/moved
{ mkdir -- "$moved" && cp -Rp -- "$root/bin" "$root/scripts" "$moved/" && rm -- "$moved/scripts/noask-rule.md"; } ||
  die 'cannot copy the plugin without its rule file'

# fresh: a new, empty HOME for the next runs, st its state directory; the
# entries run SCRIPT with no extra variables.
fresh() {
  homes=$((homes + 1))
  export HOME=$tmp/home-$homes
  st=$HOME/.local/state/sdd
  mkdir -p -- "$HOME" || die "cannot make $HOME"
  entry_script=$script envs=()
}
# run ARG...: run the command, which must exit 0 with nothing on stderr.
run() {
  "$script" "$@" > /dev/null 2> "$tmp/err" || die "noask $* exited $?"
  [ ! -s "$tmp/err" ] || die "noask $* wrote to stderr: $(cat -- "$tmp/err")"
}
# global_on: a fresh HOME whose global switch is on until 07:30.
global_on() {
  fresh
  run global on until 07:30
}
# one_line FILE: FILE, a marker or a record, of one line, its folders made as the command makes them.
one_line() {
  (umask 077 && mkdir -p -- "${1%/*}") || die "cannot make ${1%/*}"
  printf 'x\n' > "$1" || die "cannot write $1"
}
# input FIXTURE [FILTER]: write the hook input FIXTURE, its session_id set to s-1 and then FILTER applied, to a new
# file, whose path file holds.
input() {
  file=$(mktemp -- "$tmp/input.XXXXXX") || die 'cannot make an input file'
  jq -c --arg id s-1 ".session_id = \$id | ${2:-.}" -- "$fixtures/$1" > "$file" || die "cannot write an input of $1"
}
# entry EVENT: run `noask hook EVENT` of entry_script on the last input, under the HOME, the clock and envs; out is its
# answer, which must be one line of JSON after an exit 0 with nothing on stderr.
entry() {
  local rc=0
  out=$(timeout 10 env "${envs[@]}" "$entry_script" hook "$1" < "$file" 2> "$tmp/err") || rc=$?
  [ "$rc" -eq 0 ] || die "noask hook $1 exited $rc"
  [ ! -s "$tmp/err" ] || die "noask hook $1 wrote to stderr: $(cat -- "$tmp/err")"
  { [ -n "$out" ] && [[ $out != *$nl* ]] && jq -e . <<< "$out" > /dev/null 2>&1; } || die "noask hook $1 answered: $out"
}
# picked FILTER: text is the string jq's FILTER picks from the answer; fails when it picks none.
picked() {
  text=$(jq -je "$1 | strings" <<< "$out" 2> /dev/null && printf x) || die "the answer is not of the form expected: $out"
  text=${text%x}
}
# message: text is the session start's message without its sdd: head.
message() {
  picked .systemMessage
  [[ $text == 'sdd: '* ]] || die "the message has no sdd: head: $text"
  text=${text#sdd: }
}
# swap FROM TO: the one FROM in text becomes TO; fails when text holds FROM other than once.
swap() {
  [[ $text == *"$1"* && $text != *"$1"*"$1"* ]] || die "the text does not hold \"$1\" once: $text"
  text=${text/"$1"/"$2"}
}
# keep NAME: text is the case NAME's; it holds printable ASCII and line ends only, and no path of this run.
keep() {
  [[ $text =~ ^[\ -~$nl]*$ ]] || die "the text of $1 holds more than printable ASCII and line ends"
  [[ $text != *"$tmp"* && $text != *"$root"* ]] || die "the text of $1 names a path of this run: $text"
  names+=("$1") texts+=("$text")
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

# The permission entry.
global_on
input permission-main.json
entry permission && picked "$denial" && keep permission
global_on
input permission-main.json
envs=(CLAUDE_PLUGIN_OPTION_DENIALBUDGET=1)
entry permission && picked "$denial" && keep permissionSpent
global_on
input permission-subagent.json
entry permission && picked "$denial" && keep permissionSubagent
global_on
input permission-subagent.json
envs=(CLAUDE_PLUGIN_OPTION_DENIALBUDGET=1)
entry permission && picked "$denial" && keep permissionSubagentSpent
fresh
input permission-main.json
one_line "$st/noask"
entry permission && picked "$denial" && keep permissionUnreadable
global_on
input permission-main.json '.session_id = "a b"'
entry permission && picked "$denial" && keep permissionNoId
global_on
input permission-subagent.json '.agent_id = "a b"'
entry permission && picked "$denial" && keep permissionAgentUnusable
global_on
input permission-main.json
printf 'x\n' > "$st/budgets.d" || die "cannot write $st/budgets.d"
entry permission && picked "$denial" && swap "$HOME" '<home>' && keep permissionCountFailed
global_on
input permission-main.json
one_line "$st/budgets.d/s-1"
entry permission && picked "$denial" && swap "$HOME" '<home>' && keep permissionCountNote

# The stop entry.
global_on
input stop-first.json
entry stop && picked "$continued" && swap "$rule" '<rule>' && keep stopRule
global_on
input stop-first.json '.last_assistant_message = "noask: done\nThat is all."'
entry stop && picked "$continued" && swap "$rule" '<rule>' && keep stopLastLine
global_on
input stop-first.json
for n in 1 2 3 4 5; do
  entry stop && picked "$continued"
  [ "$text" = "$rule" ] || die "stop $n of six continued with: $text"
done
entry stop && picked "$continued" && swap "$rule" '<rule>' && keep stopSixth
global_on
input stop-first.json '.last_assistant_message = "noask: waiting: the build"'
entry stop && picked "$continued" && swap "$rule" '<rule>' && keep stopNothingRunning
global_on
input stop-first.json
envs=(CLAUDE_PLUGIN_OPTION_CONTINUATIONBUDGET=1)
entry stop && picked "$continued" && keep stopSpent
global_on
input stop-first.json
envs=("PATH=$nojq")
entry stop && picked "$blocked" && keep stopUnreadableInput
global_on
input stop-first.json
printf 'x\n' > "$st/budgets.d" || die "cannot write $st/budgets.d"
entry stop && picked "$blocked" && swap "$rule" '<rule>' && swap "$HOME" '<home>' && keep stopCountFailed
global_on
input stop-first.json '.session_id = "a b"'
entry stop && picked "$blocked" && swap "$rule" '<rule>' && keep stopHookFailed

# The session-start entry, without CLAUDE_PLUGIN_DATA, so with no link step.
global_on
input session-start-startup.json
entry session-start && message && swap "$since" 'since <since>' && swap "$global_until" 'until <until>' &&
  keep startGlobal
fresh
input session-start-startup.json
run --session s-1 on 2h
entry session-start && message && swap "$since" 'since <since>' && swap "$own_until" 'until <until>' &&
  keep startSession
fresh
input session-start-startup.json
run --session s-1 on handsoff 2h
entry session-start && message && swap "$since" 'since <since>' && swap "$own_until" 'until <until>' &&
  keep startHandsoff
global_on
input session-start-startup.json
run --session s-1 on 2h
entry session-start && message && swap "$since" 'since <since>' && swap "$global_until" 'until <until>' &&
  swap "$own_until" 'until <own until>' && keep startBoth
global_on
input session-start-startup.json
run --session s-1 on handsoff 2h
entry session-start && message && swap "$since" 'since <since>' && swap "$global_until" 'until <until>' &&
  swap "$own_until" 'until <own until>' && keep startBothHandsoff
fresh
input session-start-startup.json
one_line "$st/noask"
entry session-start && message && keep startUnreadableGlobal
fresh
input session-start-startup.json
one_line "$st/noask.d/s-1"
entry session-start && message && keep startUnreadableSession
fresh
input session-start-startup.json
run --session s-1 on 2h
one_line "$st/noask"
entry session-start && message && swap "$own_until" 'until <own until>' && keep startUnreadableBoth
fresh
input session-start-startup.json '.session_id = "a b"'
run --session s-1 on 2h
entry session-start && message && keep startNoId
global_on
input session-start-startup.json
envs=("PATH=$nojq")
entry session-start && message && swap "$since" 'since <since>' && swap "$global_until" 'until <until>' &&
  keep startJqNote
fresh
input session-start-startup.json
run --session s-1 on 2h
entry_script=$moved/bin/noask
entry session-start && message && swap "$since" 'since <since>' && swap "$own_until" 'until <until>' &&
  keep startRuleNote
global_on
input session-start-startup.json
entry_script=$moved/bin/noask envs=("PATH=$nojq")
entry session-start && message && swap "$since" 'since <since>' && swap "$global_until" 'until <until>' &&
  keep startBothNotes
global_on
input session-start-startup.json
entry session-start && picked "$context" && swap "$rule" '<rule>' && swap "$root" '<root>' && keep startContext
global_on
input stop-first.json
entry_script=$moved/bin/noask
entry stop && picked "$continued" && keep ruleFallback

# The session start's link step with no switch on, its notices the message alone.
fresh
input session-start-startup.json
envs=("CLAUDE_PLUGIN_DATA=$HOME/plugin-data" "PATH=$HOME/.local/bin:$PATH")
entry session-start && message && keep terminalAdded
envs=("CLAUDE_PLUGIN_DATA=$HOME/plugin-data" "PATH=$PATH")
entry session-start && message && keep terminalPath
envs=("CLAUDE_PLUGIN_DATA=$HOME/plugin-data" "PATH=$HOME/.local/bin:$PATH" CLAUDE_PLUGIN_OPTION_TERMINAL=off)
entry session-start && message && keep terminalRemoved
fresh
input session-start-startup.json
{ mkdir -p -- "$HOME/.local/bin" && printf 'echo mine\n' > "$HOME/.local/bin/noask"; } || die 'cannot write a noask of its own'
envs=("CLAUDE_PLUGIN_DATA=$HOME/plugin-data" "PATH=$HOME/.local/bin:$PATH")
entry session-start && message && keep terminalRefused

out="// Generated by tests/gen-entry-texts.sh from the noask command's hook entries; never edit it by hand: run the
// script again (tests/test-noask.sh, case 72, compares its output with this file). Each case's text is the one its
// entry answered with: a denial's message, a continued or a blocked stop's text, a session start's message without its
// sdd: head, or its context; the rule file's text written as <rule>, the plugin root as <root>, the case's home as
// <home> and the line's times as <since>, <until> and <own until>.
export const ENTRY_TEXTS = {"
for i in "${!names[@]}"; do
  out+="
    ${names[i]}: $(literal "${texts[i]}"),"
done
out+="
} as const;"
printf '%s\n' "$out"
