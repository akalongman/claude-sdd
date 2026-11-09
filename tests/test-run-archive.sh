#!/usr/bin/env bash
# Test for skills/apply/scripts/run-archive of the sdd plugin: the Sub-skill
# line of the run facts (cases 1 to 3), the park
# step of 2026-10-27, which parks the ledger's "Handed to" lines in the
# project's queue through the laterbox engine (cases 4 to 16), and the run
# facts' Skill line (case 17), whose two hashes must be those of the
# SKILL.md and prompts/unit-controller-overrides.md beside the script, so a
# missing file, which the script hashes as empty, fails the case. Builds
# workspaces under a temporary config directory that holds a 6.4.1 directory
# in the claude-plugins-official cache, as this machine's cache did from
# 2026-10-12, runs the script and prints "ok <n>" or "FAIL <n>" per case;
# exits 1 when any case fails.
#
# Usage: bash tests/test-run-archive.sh [SCRIPT]
#   Default SCRIPT: skills/apply/scripts/run-archive in the plugin root, the
#   parent of this script's directory
# The archives go to the temporary config directory, never to the real one.
# The temporary directory (TMPDIR) must lie outside every git work tree, so
# the script's repository facts read none but the fixtures'. The test names
# it as cd -P spells it, so every expectation built from it uses the spelling
# the script prints when TMPDIR is reached through a symbolic link. The park
# cases need the engine (later) on PATH; they run it from a project directory
# of their own under the temporary directory, with its cache, state and
# config directories there too and CLAUDE_PLUGIN_OPTION_FILE unset, so no real
# queue, lock or stored setting is touched. Cases 6, 9, 11, 13 and 16 also run
# the script with no later on PATH, case 7 with a recording stub in its place
# (also for a note the queue no longer lists). Case 5 covers one item handed
# twice, case 10 malformed markers and empty items, case 12 Withdrawn: lines,
# cases 11 and 13 the offer: lines in disposable git repositories built under
# the temporary directory, case 13 also run from a linked worktree, a
# subdirectory, outside any repository and with a missing plan, case 15 the
# queue guard's suffix shape and a ledger that cannot be written, case 16 a
# home directory that is itself a repository (a dotfiles setup), scoped to a
# disposable one. The paste-ready command names the directory whose queue the
# note belongs to: case 13's no-engine sub-runs name the main checkout from a
# worktree, a subdirectory and a symbolic link, and replay the worktree's
# command after the worktree is removed; case 6 pins the working directory
# outside a repository, case 16 the home-directory exception. The cd -P
# spelling itself is not shown by the link sub-run, since git prints physical
# paths here even from a symlinked working directory (git 2.53, probe of
# 2026-10-28). The fixture repositories commit through the configured signing
# setup, so a signer that prompts pauses the suite. Every archive path is
# checked to lie under the temporary config directory.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
script=${1:-$root/skills/apply/scripts/run-archive}
tmp=$(cd -P "$(mktemp -d)" && pwd)
trap 'rm -rf "$tmp"' EXIT
if git -C "$tmp" rev-parse --git-dir >/dev/null 2>&1; then echo "FAIL: $tmp lies in a git work tree"; exit 1; fi
mkdir -p "$tmp/config/plugins/cache/claude-plugins-official/superpowers/6.4.1" "$tmp/proj"
fail=0

# Run the script on workspace WS under name NAME; sets out, err, rc and facts
# (the run facts' Sub-skill lines).
run() {
  rc=0
  out=$(cd "$tmp/proj" && CLAUDE_CONFIG_DIR="$tmp/config" \
    CLAUDE_CODE_SESSION_ID=test-run-archive bash "$script" "$1" "$2" 2>"$tmp/stderr") || rc=$?
  err=$(cat "$tmp/stderr")
  facts=$(grep '^Sub-skill:' "$out/run-facts.md" 2>/dev/null || true)
}
quiet() { [ "$rc" -eq 0 ] && [ -z "$err" ]; } # the last run: exit 0, no stderr
# The last park run's path is an archive under the temporary config directory.
archived() { [ -d "$path" ] && [[ $path == "$tmp/config/docs/tmp/apply-runs/"* ]]; }
pass() { echo "ok $1"; }
miss() { echo "FAIL $1: ${facts:-no Sub-skill line}${err:+; stderr: $err}"; fail=1; }

# The park cases. park_env, once before the first: links the engine into
# $tmp/bin and exports its isolation (config, cache and state directories
# under $tmp); stops the suite when no later is on PATH.
park_env() {
  local engine
  engine=$(command -v later) || { echo 'FAIL: the park cases need the laterbox engine (later) on PATH'; exit 1; }
  mkdir -p "$tmp/bin"
  ln -s "$engine" "$tmp/bin/later"
  export CLAUDE_CONFIG_DIR="$tmp/config" XDG_CACHE_HOME="$tmp/cache" XDG_STATE_HOME="$tmp/state"
}
# Run the script from directory DIR with PATH set to $park_path (default:
# $tmp/bin first on PATH), on workspace WS under name NAME (default: the
# workspace's basename); sets out (the whole stdout), err, rc and path (out's
# last line).
run_park_in() {
  rc=0
  out=$(cd "$1" && env -u CLAUDE_PLUGIN_OPTION_FILE PATH="${park_path:-$tmp/bin:$PATH}" \
    CLAUDE_CODE_SESSION_ID=test-run-archive bash "$script" "$2" ${3:+"$3"} 2>"$tmp/stderr") || rc=$?
  err=$(cat "$tmp/stderr")
  path=${out##*$'\n'}
}
# run_park_in from project CASE's directory, $tmp/p/CASE.
run_park() { mkdir -p "$tmp/p/$1"; run_park_in "$tmp/p/$1" "${@:2}"; }
# A disposable git repository at $tmp/p/CASE whose one commit holds
# docs/plan.md, the line "# Plan" followed by the lines LINE..., and its linked
# worktree at $tmp/p/CASE-wt, detached so no branch is made.
repo() {
  local dir=$tmp/p/$1; shift
  mkdir -p "$dir/docs" && printf '%s\n' '# Plan' "$@" > "$dir/docs/plan.md" && git -C "$dir" init -q \
    && git -C "$dir" add docs/plan.md && git -C "$dir" -c user.name=t -c user.email=t@t commit -q -m 'Add the plan' \
    && git -C "$dir" worktree add -q --detach "$dir-wt"
}
# The engine in project CASE's directory: later ARGS... there.
eng() {
  local dir=$tmp/p/$1; shift
  mkdir -p "$dir"
  (cd "$dir" && env -u CLAUDE_PLUGIN_OPTION_FILE "$tmp/bin/later" "$@")
}
# Park "seed one" to "seed N" in project CASE through the engine.
seed() {
  local i words=(one two three four five six seven eight nine)
  for ((i = 0; i < $2; i++)); do eng "$1" -- "seed ${words[i]:-$((i + 1))}" >/dev/null || return 1; done
}
queue() { if [ -f "$tmp/p/$1/LATER.local.md" ]; then cat "$tmp/p/$1/LATER.local.md"; fi; } # CASE's queue file
listing() { eng "$1"; } # bare later in project CASE
# Write the recording stub engine $tmp/stub/later for project CASE, with its
# call log $STUB_LOG and its queue $STUB_QUEUE under $tmp. Every call appends
# its arguments, tab-separated, as one line to the log. "-- NOTE" appends NOTE
# to the queue and prints what the engine prints, unless NOTE holds REFUSE and
# STUB_ALLOW is unset: then "stub: refused" and a second line on stderr and
# exit 1; or NOTE holds SILENT: exit 3, printing nothing. No arguments: the
# queue listed as the engine lists it, every age "today", a note holding HIDE
# left out of the listing (it keeps its index).
stub() {
  export STUB_LOG=$tmp/stub-$1.log STUB_QUEUE=$tmp/stub-$1.queue
  mkdir -p "$tmp/stub"
  cat > "$tmp/stub/later" <<'EOF'
#!/usr/bin/env bash
(IFS=$'\t'; printf '%s\n' "$*") >> "$STUB_LOG"
q=()
if [ -f "$STUB_QUEUE" ]; then mapfile -t q < "$STUB_QUEUE"; fi
if [ $# -eq 0 ]; then
  echo "stub: ${#q[@]} parked"
  for i in "${!q[@]}"; do [[ ${q[i]} == *HIDE* ]] || printf '%2d. %s (today)\n' "$((i + 1))" "${q[i]}"; done
elif [ $# -eq 2 ] && [ "$1" = -- ]; then
  if [[ $2 == *REFUSE* && -z ${STUB_ALLOW:-} ]]; then printf '%s\n' 'stub: refused' 'stub: more' >&2; exit 1; fi
  if [[ $2 == *SILENT* ]]; then exit 3; fi
  printf '%s\n' "$2" >> "$STUB_QUEUE"
  echo "later: parked -> $2"
else
  echo 'stub: unexpected arguments' >&2; exit 2
fi
EOF
  chmod +x "$tmp/stub/later"
}
run_stub() { park_path=$tmp/stub:$PATH run_park "$@"; } # run_park, the stub for the engine
# The paste-ready command for NOTE (no single quote in it) in project CASE.
paste_cmd() { printf "(cd '%s' && later -- '%s')" "$tmp/p/$1" "$2"; }
# Run each paste-ready command of the last run's "not parked (later not on
# PATH)" lines with eval, as an owner pastes it into another terminal: from
# $tmp, outside every project, with $tmp/bin first on PATH.
run_cmds() {
  local line
  while IFS= read -r line; do
    [[ $line == 'not parked (later not on PATH): '* ]] || continue
    (cd "$tmp" && unset CLAUDE_PLUGIN_OPTION_FILE && PATH="$tmp/bin:$PATH" \
      && eval "${line#'not parked (later not on PATH): '}") >/dev/null || return 1
  done <<< "$out"
}
# Ends a park case: ok when no part broke, else FAIL with the broken parts and
# the last run's stdout (its lines joined by " | ") and stderr.
verdict() {
  if [ -z "$broken" ]; then pass "$1"; else
    echo "FAIL $1 (${broken# }): ${out//$'\n'/ | }${err:+; stderr: $err}"; fail=1
  fi
}

# 1. The ledger's one Sub-skill line, copied as written; the cache's 6.4.1
#    directory plays no part.
mkdir -p "$tmp/ws/one"
printf '%s\n' '# Progress' 'Run base: abc1234' 'Sub-skill: 7.0.0 (warning: tested against 6.4.1)' \
  'Task 1: complete def5678' > "$tmp/ws/one/progress.md"
run "$tmp/ws/one" one
if quiet && [ "$facts" = 'Sub-skill: 7.0.0 (warning: tested against 6.4.1)' ]; then pass 1; else miss 1; fi

# 2. Two Sub-skill lines, a run resumed after an upgrade: both, in ledger
#    order.
mkdir -p "$tmp/ws/two"
printf '%s\n' 'Sub-skill: 6.4.1' 'Task 1: complete def5678' 'Sub-skill: 7.0.0' > "$tmp/ws/two/progress.md"
run "$tmp/ws/two" two
if quiet && [ "$facts" = $'Sub-skill: 6.4.1\nSub-skill: 7.0.0' ]; then pass 2; else miss 2; fi

# 3. A ledger without the line, then a workspace without a ledger: the facts
#    say so, the run exits 0 with nothing on stderr. A failure names its part.
broken=
mkdir -p "$tmp/ws/none"
printf '%s\n' 'Run base: abc1234' 'Resumed; Sub-skill line unchanged' > "$tmp/ws/none/progress.md"
run "$tmp/ws/none" none
quiet && [ "$facts" = 'Sub-skill: not ledgered' ] || broken+=" no-line"
mkdir -p "$tmp/ws/empty"
run "$tmp/ws/empty" empty
quiet && [ "$facts" = 'Sub-skill: not ledgered' ] || broken+=" no-ledger"
if [ -z "$broken" ]; then pass 3; else miss "3 (${broken# })"; fi

# 4. Three Handed to lines among other ledger lines, in a project whose queue
#    holds two notes, the second "Plan x: a", which the first new note's key
#    begins with: each line is parked as "Plan x: <item> Archive: <path>", the
#    report gives its ledger line and queue position (3 to 5, never the
#    shorter note's 2), and the ledger and its archive copy end with the
#    Parked: lines.
park_env
broken=
seed four 1 && eng four -- 'Plan x: a' >/dev/null || broken+=" seed"
mkdir -p "$tmp/ws/four"
printf '%s\n' 'Run base: abc1234' 'Task 1: handed to controller' 'Handed to plan x: a b c d e f g h' \
  'Open before merge: OOS1, x. Ruling: to plan x. Cost if wrong: y' 'Handed to plan x: OOS1 x y z' \
  'Handed to plan x: third item here' 'Task 1: complete def5678' > "$tmp/ws/four/progress.md"
run_park four "$tmp/ws/four"
quiet && archived || broken+=" run"
[ "$out" = "$(printf '%s\n' 'parked: line 3, now note 3: a b c d e f' 'parked: line 5, now note 4: OOS1 x y z' \
  'parked: line 6, now note 5: third item here' "$path")" ] || broken+=" report"
mapfile -t notes < <(queue four | grep '^- \[ \] ')
[[ ${notes[2]:-} == "- [ ] Plan x: a b c d e f g h Archive: $path ("* ]] \
  && [[ ${notes[3]:-} == "- [ ] Plan x: OOS1 x y z Archive: $path ("* ]] \
  && [[ ${notes[4]:-} == "- [ ] Plan x: third item here Archive: $path ("* ]] || broken+=" notes"
want=$(printf '%s\n' 'Parked: line 3: plan x: a b c d e f' 'Parked: line 5: plan x: OOS1 x y z' \
  'Parked: line 6: plan x: third item here')
[ "$(tail -n 3 "$tmp/ws/four/progress.md")" = "$want" ] || broken+=" ledger"
[ "$(tail -n 3 "$path/progress.md" 2>/dev/null)" = "$want" ] || broken+=" archive-ledger"
[ "$(listing four | grep -cE '^ *[0-9]+\. ')" = 5 ] || broken+=" listing"
verdict 4
queue four > "$tmp/four.queue"

# 5. The same workspace again: every Handed to line has its Parked: line, so
#    the report is the path alone and the queue is unchanged. Then the first
#    parked note is closed with later done and the step runs once more: the
#    Parked: line holds, nothing is parked again (four open notes). Then a
#    ledger handing one item twice (a writer slip): one note, the second line
#    reported parked earlier at the same position, two Parked: lines.
broken=
run_park four "$tmp/ws/four"
quiet && archived && [ "$out" = "$path" ] || broken+=" rerun"
cmp -s "$tmp/four.queue" "$tmp/p/four/LATER.local.md" || broken+=" rerun-queue"
eng four 'done' 3 >/dev/null 2>&1 || broken+=" done"
run_park four "$tmp/ws/four"
quiet && archived && [ "$out" = "$path" ] || broken+=" closed"
[ "$(listing four | grep -cE '^ *[0-9]+\. ')" = 4 ] || broken+=" closed-queue"
mkdir -p "$tmp/ws/five-dup"
printf '%s\n' 'Handed to plan x: twice handed item' 'Handed to plan x: twice handed item' > "$tmp/ws/five-dup/progress.md"
run_park four "$tmp/ws/five-dup"
quiet && archived && [ "$out" = "$(printf '%s\n' 'parked: line 1, now note 5: twice handed item' \
  'parked earlier: line 2, now note 5: twice handed item' "$path")" ] || broken+=" dup-report"
[ "$(listing four | grep -cE '^ *[0-9]+\. ')" = 5 ] || broken+=" dup-queue"
[ "$(tail -n 2 "$tmp/ws/five-dup/progress.md")" = "$(printf '%s\n' 'Parked: line 1: plan x: twice handed item' \
  'Parked: line 2: plan x: twice handed item')" ] || broken+=" dup-ledger"
verdict 5

# 6. Case 4's ledger with no later on PATH: each line reports the command that
#    parks its note, nothing is written, no queue appears. The commands, run
#    with eval from another directory, park the three notes; the step run
#    again with the engine finds each one (parked earlier), writes its Parked:
#    line and parks nothing.
broken=
handed=('Run base: abc1234' 'Task 1: handed to controller' 'Handed to plan x: a b c d e f g h' \
  'Open before merge: OOS1, x. Ruling: to plan x. Cost if wrong: y' 'Handed to plan x: OOS1 x y z' \
  'Handed to plan x: third item here' 'Task 1: complete def5678')
mkdir -p "$tmp/ws/six"
printf '%s\n' "${handed[@]}" > "$tmp/ws/six/progress.md"
park_path=/usr/bin:/bin run_park six "$tmp/ws/six"
quiet && archived || broken+=" run"
first_path=$path
[ "$out" = "$(printf '%s\n' \
  "not parked (later not on PATH): $(paste_cmd six "Plan x: a b c d e f g h Archive: $path")" \
  "not parked (later not on PATH): $(paste_cmd six "Plan x: OOS1 x y z Archive: $path")" \
  "not parked (later not on PATH): $(paste_cmd six "Plan x: third item here Archive: $path")" "$path")" ] \
  || broken+=" report"
cmp -s <(printf '%s\n' "${handed[@]}") "$tmp/ws/six/progress.md" || broken+=" ledger"
[ ! -e "$tmp/p/six/LATER.local.md" ] || broken+=" queue"
run_cmds || broken+=" eval"
mapfile -t notes < <(queue six | grep '^- \[ \] ')
[ "${#notes[@]}" = 3 ] && [[ ${notes[0]} == "- [ ] Plan x: a b c d e f g h Archive: $first_path ("* ]] \
  && [[ ${notes[1]} == "- [ ] Plan x: OOS1 x y z Archive: $first_path ("* ]] \
  && [[ ${notes[2]} == "- [ ] Plan x: third item here Archive: $first_path ("* ]] || broken+=" notes"
queue six > "$tmp/six.queue"
run_park six "$tmp/ws/six"
quiet && archived || broken+=" rerun"
[ "$out" = "$(printf '%s\n' 'parked earlier: line 3, now note 1: a b c d e f' \
  'parked earlier: line 5, now note 2: OOS1 x y z' 'parked earlier: line 6, now note 3: third item here' \
  "$path")" ] || broken+=" rerun-report"
cmp -s <(printf '%s\n' "${handed[@]}" 'Parked: line 3: plan x: a b c d e f' 'Parked: line 5: plan x: OOS1 x y z' \
  'Parked: line 6: plan x: third item here') "$tmp/ws/six/progress.md" || broken+=" rerun-ledger"
cmp -s "$tmp/six.queue" "$tmp/p/six/LATER.local.md" || broken+=" rerun-queue"
verdict 6

# 7. The same ledger, its second item holding REFUSE, against the recording
#    stub, which refuses that note: the first and third are parked with their
#    positions, the second is reported with the stub's reason and its command
#    and gets no Parked: line, in ledger order; every park call passes "--"
#    and the whole note, every listing no argument. With REFUSE allowed the
#    step parks the second alone. A refusal with nothing on stderr gives its
#    exit status as the reason. A note the stub parks but never lists is
#    reported with its position unknown and gets its Parked: line. Then the
#    real engine while another writer holds the queue's lock: the engine's
#    refusal is the reason.
broken=
stub seven
handed[4]='Handed to plan x: REFUSE this one please now'
mkdir -p "$tmp/ws/seven"
printf '%s\n' "${handed[@]}" > "$tmp/ws/seven/progress.md"
run_stub seven "$tmp/ws/seven"
quiet && archived || broken+=" run"
[ "$out" = "$(printf '%s\n' 'parked: line 3, now note 1: a b c d e f' \
  "not parked (stub: refused): $(paste_cmd seven "Plan x: REFUSE this one please now Archive: $path")" \
  'parked: line 6, now note 2: third item here' "$path")" ] || broken+=" report"
cmp -s <(printf '%s\n' "${handed[@]}" 'Parked: line 3: plan x: a b c d e f' \
  'Parked: line 6: plan x: third item here') "$tmp/ws/seven/progress.md" || broken+=" ledger"
cmp -s <(printf '%s\n' '' "--"$'\t'"Plan x: a b c d e f g h Archive: $path" \
  "--"$'\t'"Plan x: REFUSE this one please now Archive: $path" \
  "--"$'\t'"Plan x: third item here Archive: $path" '') "$STUB_LOG" || broken+=" argv"
STUB_ALLOW=1 run_stub seven "$tmp/ws/seven"
quiet && archived || broken+=" allowed"
[ "$out" = "$(printf '%s\n' 'parked: line 5, now note 3: REFUSE this one please now' "$path")" ] \
  || broken+=" allowed-report"
cmp -s <(printf '%s\n' "${handed[@]}" 'Parked: line 3: plan x: a b c d e f' \
  'Parked: line 6: plan x: third item here' 'Parked: line 5: plan x: REFUSE this one please now') \
  "$tmp/ws/seven/progress.md" || broken+=" allowed-ledger"
stub seven-quiet
mkdir -p "$tmp/ws/seven-quiet"
printf '%s\n' 'Handed to plan x: SILENT refusal' > "$tmp/ws/seven-quiet/progress.md"
run_stub seven-quiet "$tmp/ws/seven-quiet"
quiet && archived && [ "$out" = "$(printf '%s\n' "not parked (later exited 3): $(paste_cmd seven-quiet \
  "Plan x: SILENT refusal Archive: $path")" "$path")" ] || broken+=" quiet"
stub seven-hide
mkdir -p "$tmp/ws/seven-hide"
echo 'Handed to plan x: HIDE me once parked' > "$tmp/ws/seven-hide/progress.md"
run_stub seven-hide "$tmp/ws/seven-hide"
quiet && archived && [ "$out" = "$(printf '%s\n' 'parked: line 1, position unknown: HIDE me once parked' "$path")" ] \
  && [ "$(tail -n 1 "$tmp/ws/seven-hide/progress.md")" = 'Parked: line 1: plan x: HIDE me once parked' ] \
  || broken+=" hidden"
mkdir -p "$tmp/ws/seven-lock" "$XDG_CACHE_HOME/later/v2"
printf '%s\n' 'Handed to plan x: locked out item' > "$tmp/ws/seven-lock/progress.md"
flock "$XDG_CACHE_HOME/later/v2/$(printf '%s' "$tmp/p/seven-lock/LATER.local.md" | sha1sum | cut -d' ' -f1).lock" sleep 8 &
holder=$!
sleep 0.5
run_park seven-lock "$tmp/ws/seven-lock"
wait "$holder" || broken+=" holder"
quiet && archived || broken+=" lock-run"
[ "$out" = "$(printf '%s\n' "not parked (later: the queue is locked by another writer): $(paste_cmd seven-lock \
  "Plan x: locked out item Archive: $path")" "$path")" ] || broken+=" lock-report"
[ "$(cat "$tmp/ws/seven-lock/progress.md")" = 'Handed to plan x: locked out item' ] || broken+=" lock-ledger"
[ ! -e "$tmp/p/seven-lock/LATER.local.md" ] || broken+=" lock-queue"
verdict 7

# 8. Items shaped like the engine's subcommands ("done ...", "all") are parked
#    as text; the ledger, written without its final newline, gets each Parked:
#    line on a line of its own.
broken=
mkdir -p "$tmp/ws/eight"
printf '%s\n%s' 'Handed to plan x: done with the migration' 'Handed to plan x: all' > "$tmp/ws/eight/progress.md"
run_park eight "$tmp/ws/eight"
quiet && archived || broken+=" run"
[ "$out" = "$(printf '%s\n' 'parked: line 1, now note 1: done with the migration' \
  'parked: line 2, now note 2: all' "$path")" ] || broken+=" report"
mapfile -t notes < <(queue eight | grep '^- \[ \] ')
[ "${#notes[@]}" = 2 ] && [[ ${notes[0]} == "- [ ] Plan x: done with the migration Archive: $path ("* ]] \
  && [[ ${notes[1]} == "- [ ] Plan x: all Archive: $path ("* ]] || broken+=" notes"
[ "$(cat "$tmp/ws/eight/progress.md")" = "$(printf '%s\n' 'Handed to plan x: done with the migration' \
  'Handed to plan x: all' 'Parked: line 1: plan x: done with the migration' 'Parked: line 2: plan x: all')" ] \
  || broken+=" ledger"
verdict 8

# 9. An item holding a single quote, $, a backslash, a double quote and its
#    own " Archive: ", and an item with two spaces and a tab: both are parked
#    verbatim, canonicalised, and found in the listing (the key is the note
#    minus the suffix the script appended, not cut at the item's "Archive:").
#    The same ledger with no later on PATH: its two commands, run with eval,
#    park the same two notes; the first command spells the quote as '\''.
#    Then a run with no later on PATH from a directory holding a single
#    quote: the command's cd part spells it '\'' too, and so does its note,
#    whose archive path holds the same quote (the slug is built from the
#    working directory).
broken=
odd=("Handed to plan x: it's \$HOME \\ \"q\" Archive: not the suffix" $'Handed to plan x: two  spaces\tand a tab')
note1="Plan x: it's \$HOME \\ \"q\" Archive: not the suffix" note2='Plan x: two spaces and a tab'
mkdir -p "$tmp/ws/nine" "$tmp/ws/nine-cmd"
printf '%s\n' "${odd[@]}" > "$tmp/ws/nine/progress.md"
printf '%s\n' "${odd[@]}" > "$tmp/ws/nine-cmd/progress.md"
run_park nine "$tmp/ws/nine"
quiet && archived || broken+=" run"
[ "$out" = "$(printf '%s\n' "parked: line 1, now note 1: it's \$HOME \\ \"q\" Archive: not" \
  'parked: line 2, now note 2: two spaces and a tab' "$path")" ] || broken+=" report"
mapfile -t notes < <(queue nine | grep '^- \[ \] ')
[ "${#notes[@]}" = 2 ] && [[ ${notes[0]} == "- [ ] $note1 Archive: $path ("* ]] \
  && [[ ${notes[1]} == "- [ ] $note2 Archive: $path ("* ]] || broken+=" notes"
park_path=/usr/bin:/bin run_park nine-cmd "$tmp/ws/nine-cmd"
quiet && archived && [ "$(grep -c '^not parked (later not on PATH): ' <<< "$out")" = 2 ] \
  || broken+=" cmd-run"
esc="Plan x: it'\\''s \$HOME \\ \"q\" Archive: not the suffix Archive: $path"
[ "${out%%$'\n'*}" = "not parked (later not on PATH): (cd '$tmp/p/nine-cmd' && later -- '$esc')" ] || broken+=" cmd-quote"
run_cmds || broken+=" eval"
mapfile -t notes < <(queue nine-cmd | grep '^- \[ \] ')
[ "${#notes[@]}" = 2 ] && [[ ${notes[0]} == "- [ ] $note1 Archive: $path ("* ]] \
  && [[ ${notes[1]} == "- [ ] $note2 Archive: $path ("* ]] || broken+=" cmd-notes"
mkdir -p "$tmp/ws/nine-dir"
echo 'Handed to plan x: quoted directory' > "$tmp/ws/nine-dir/progress.md"
park_path=/usr/bin:/bin run_park "it's here" "$tmp/ws/nine-dir"
q="'\\''"
esc_note="Plan x: quoted directory Archive: ${path//\'/$q}"
quiet && archived && [ "${out%%$'\n'*}" = \
  "not parked (later not on PATH): (cd '$tmp/p/it'\\''s here' && later -- '$esc_note')" ] \
  || broken+=" dir-quote"
verdict 9

# 10. Malformed markers (no ": " after the destination, an empty destination)
#     and an empty item beside a valid line: each is reported by its ledger
#     line and gets no Parked: line; the valid line is parked.
broken=
mkdir -p "$tmp/ws/ten"
bad=('Handed to plan x' 'Handed to : x' 'Handed to plan x:   ' 'Handed to plan x: valid one')
printf '%s\n' "${bad[@]}" > "$tmp/ws/ten/progress.md"
run_park ten "$tmp/ws/ten"
quiet && archived || broken+=" run"
[ "$out" = "$(printf '%s\n' 'not parked (malformed marker): line 1' 'not parked (malformed marker): line 2' \
  'not parked (empty item): line 3' 'parked: line 4, now note 1: valid one' "$path")" ] || broken+=" report"
mapfile -t notes < <(queue ten | grep '^- \[ \] ')
[ "${#notes[@]}" = 1 ] && [[ ${notes[0]} == "- [ ] Plan x: valid one Archive: $path ("* ]] || broken+=" notes"
cmp -s <(printf '%s\n' "${bad[@]}" 'Parked: line 4: plan x: valid one') "$tmp/ws/ten/progress.md" \
  || broken+=" ledger"
verdict 10

# 11. The offer, in a repository whose docs/plan.md has the headings
#     "## Handed to plan 2e" and "## Handed to plan y": destinations compare
#     lower-cased with whitespace collapsed ("Plan 2E", "plan  2e"), one offer
#     per destination the plan has a heading for (none for "owner"), counted
#     over the lines this call attempted, in ledger order of the first line.
#     Two of the three plan 2e lines already Parked: (the other three are
#     found parked earlier, still attempted): the count 1. A fully parked
#     ledger, a plan without the headings (one a prefix, one a level-3
#     heading) and a workspace without plan-path: no offer. A ledger holding
#     only an empty plan 2e item: a parse rejection, never an attempt, so no
#     offer (ruling R1 of 2026-10-27). With no later on PATH the three lines
#     are reported not parked and still offered. A heading spelled
#     "##  Handed To  plan z" (case, spacing) offers as "## Handed to plan z".
broken=
repo eleven '## Handed to plan 2e' 'Some text.' '## Handed to plan y' || broken+=" repo"
printf '%s\n' '# Plan' '## Handed to plan 2' '### Handed to plan 2e' > "$tmp/p/eleven/docs/bare.md"
for w in eleven eleven-parked eleven-bare eleven-empty eleven-cmd; do
  mkdir -p "$tmp/ws/$w" && echo docs/plan.md > "$tmp/ws/$w/plan-path"
done
echo docs/bare.md > "$tmp/ws/eleven-bare/plan-path"
mkdir -p "$tmp/ws/eleven-nopath"
spelled=('Handed to Plan 2E: one' 'Handed to plan  2e: two' 'Handed to plan 2e: three' 'Handed to plan y: four' \
  'Handed to owner: five')
printf '%s\n' "${spelled[@]}" > "$tmp/ws/eleven/progress.md"
offer_2e() { printf 'offer: docs commit adding %s items to "## Handed to plan 2e" of docs/plan.md' "$1"; }
offer_y='offer: docs commit adding 1 items to "## Handed to plan y" of docs/plan.md'
run_park eleven "$tmp/ws/eleven"
quiet && archived || broken+=" run"
[ "$out" = "$(printf '%s\n' 'parked: line 1, now note 1: one' 'parked: line 2, now note 2: two' \
  'parked: line 3, now note 3: three' 'parked: line 4, now note 4: four' 'parked: line 5, now note 5: five' \
  "$(offer_2e 3)" "$offer_y" "$path")" ] || broken+=" report"
printf '%s\n' "${spelled[@]}" 'Parked: line 1: Plan 2E: one' 'Parked: line 2: plan 2e: two' \
  > "$tmp/ws/eleven-parked/progress.md"
run_park eleven "$tmp/ws/eleven-parked"
quiet && [ "$out" = "$(printf '%s\n' 'parked earlier: line 3, now note 3: three' \
  'parked earlier: line 4, now note 4: four' 'parked earlier: line 5, now note 5: five' \
  "$(offer_2e 1)" "$offer_y" "$path")" ] || broken+=" parked"
run_park eleven "$tmp/ws/eleven"
quiet && archived && [ "$out" = "$path" ] || broken+=" full"
echo 'Handed to plan 2e: six' > "$tmp/ws/eleven-bare/progress.md"
run_park eleven "$tmp/ws/eleven-bare"
quiet && [ "$out" = "$(printf '%s\n' 'parked: line 1, now note 6: six' "$path")" ] || broken+=" no-heading"
echo 'Handed to plan 2e: seven' > "$tmp/ws/eleven-nopath/progress.md"
run_park eleven "$tmp/ws/eleven-nopath"
quiet && [ "$out" = "$(printf '%s\n' 'parked: line 1, now note 7: seven' "$path")" ] || broken+=" no-plan-path"
echo 'Handed to plan 2e:   ' > "$tmp/ws/eleven-empty/progress.md"
run_park eleven "$tmp/ws/eleven-empty"
quiet && [ "$out" = "$(printf '%s\n' 'not parked (empty item): line 1' "$path")" ] || broken+=" empty-item"
printf '%s\n' 'Handed to plan 2e: eight' 'Handed to plan 2e: nine' 'Handed to plan 2e: ten' \
  > "$tmp/ws/eleven-cmd/progress.md"
park_path=/usr/bin:/bin run_park eleven "$tmp/ws/eleven-cmd"
quiet && [ "$out" = "$(printf '%s\n' \
  "not parked (later not on PATH): $(paste_cmd eleven "Plan 2e: eight Archive: $path")" \
  "not parked (later not on PATH): $(paste_cmd eleven "Plan 2e: nine Archive: $path")" \
  "not parked (later not on PATH): $(paste_cmd eleven "Plan 2e: ten Archive: $path")" \
  "$(offer_2e 3)" "$path")" ] || broken+=" no-later"
repo eleven-case '##  Handed To  plan z' || broken+=" case-repo"
mkdir -p "$tmp/ws/eleven-case" && echo docs/plan.md > "$tmp/ws/eleven-case/plan-path"
echo 'Handed to plan z: heading spelled otherwise' > "$tmp/ws/eleven-case/progress.md"
run_park eleven-case "$tmp/ws/eleven-case"
quiet && archived && [ "$out" = "$(printf '%s\n' 'parked: line 1, now note 1: heading spelled otherwise' \
  'offer: docs commit adding 1 items to "## Handed to plan z" of docs/plan.md' "$path")" ] || broken+=" heading-case"
verdict 11

# 12. A Withdrawn: line for the second of three handed lines, the queue
#     seeded with two notes: it is reported withdrawn and neither parked nor
#     marked Parked:; the other two are (notes 3 and 4). A line both Parked:
#     and Withdrawn: is reported withdrawn and nothing is parked.
broken=
seed twelve 2 || broken+=" seed"
mkdir -p "$tmp/ws/twelve" "$tmp/ws/twelve-both"
held=('Handed to plan x: first of three' 'Handed to plan x: second of three' 'Handed to plan x: third of three' \
  'Withdrawn: line 2: fixed in Task 3')
printf '%s\n' "${held[@]}" > "$tmp/ws/twelve/progress.md"
run_park twelve "$tmp/ws/twelve"
quiet && archived || broken+=" run"
[ "$out" = "$(printf '%s\n' 'parked: line 1, now note 3: first of three' 'withdrawn: line 2' \
  'parked: line 3, now note 4: third of three' "$path")" ] || broken+=" report"
mapfile -t notes < <(queue twelve | grep '^- \[ \] ')
[ "${#notes[@]}" = 4 ] && [[ ${notes[2]} == "- [ ] Plan x: first of three Archive: $path ("* ]] \
  && [[ ${notes[3]} == "- [ ] Plan x: third of three Archive: $path ("* ]] || broken+=" notes"
cmp -s <(printf '%s\n' "${held[@]}" 'Parked: line 1: plan x: first of three' \
  'Parked: line 3: plan x: third of three') "$tmp/ws/twelve/progress.md" || broken+=" ledger"
printf '%s\n' 'Handed to plan x: settled after all' 'Parked: line 1: plan x: settled after all' \
  'Withdrawn: line 1: done in Task 3' > "$tmp/ws/twelve-both/progress.md"
run_park twelve "$tmp/ws/twelve-both"
quiet && archived && [ "$out" = "$(printf '%s\n' 'withdrawn: line 1' "$path")" ] || broken+=" both"
[ "$(listing twelve | grep -cE '^ *[0-9]+\. ')" = 4 ] || broken+=" both-queue"
verdict 12

# 13. A repository with a linked worktree, plan-path docs/plan.md relative to
#     its root: run from the worktree, the note lands in the main checkout's
#     queue and the offer reads the worktree's plan; run from the main
#     checkout's docs/ subdirectory, the same queue, the plan found through the
#     repository root. An absolute plan-path outside the repository, its
#     heading present: no offer. A relative plan-path with the step run
#     outside any repository, and one naming a file the repository lacks: the
#     item is parked, no offer. Then no-engine sub-runs from the worktree, the
#     docs/ subdirectory and the worktree reached through a symbolic link:
#     each command names the main checkout as cd -P spells it; the
#     subdirectory's command, replayed at once, and the worktree's, replayed
#     after the worktree is removed, park into the main checkout's queue. The
#     link sub-run pins the command, not the cd -P normalisation: git prints
#     physical paths here even from a symlinked working directory.
broken=
repo thirteen '## Handed to plan x' || broken+=" repo"
mkdir -p "$tmp/ws/thirteen" "$tmp/ws/thirteen-sub" "$tmp/ws/thirteen-abs" "$tmp/ws/thirteen-out" \
  "$tmp/ws/thirteen-missing"
echo docs/plan.md > "$tmp/ws/thirteen/plan-path"
echo docs/plan.md > "$tmp/ws/thirteen-sub/plan-path"
echo docs/plan.md > "$tmp/ws/thirteen-out/plan-path"
echo docs/missing.md > "$tmp/ws/thirteen-missing/plan-path"
printf '%s\n' '# Plan' '## Handed to plan x' > "$tmp/outside-plan.md"
echo "$tmp/outside-plan.md" > "$tmp/ws/thirteen-abs/plan-path"
echo 'Handed to plan x: from the worktree' > "$tmp/ws/thirteen/progress.md"
echo 'Handed to plan x: from the subdirectory' > "$tmp/ws/thirteen-sub/progress.md"
echo 'Handed to plan x: with an outside plan' > "$tmp/ws/thirteen-abs/progress.md"
echo 'Handed to plan x: outside any repository' > "$tmp/ws/thirteen-out/progress.md"
echo 'Handed to plan x: with a missing plan' > "$tmp/ws/thirteen-missing/progress.md"
offer_x='offer: docs commit adding 1 items to "## Handed to plan x" of docs/plan.md'
run_park_in "$tmp/p/thirteen-wt" "$tmp/ws/thirteen"
quiet && archived || broken+=" run"
wt_path=$path
[ "$out" = "$(printf '%s\n' 'parked: line 1, now note 1: from the worktree' "$offer_x" "$path")" ] \
  || broken+=" worktree"
run_park_in "$tmp/p/thirteen/docs" "$tmp/ws/thirteen-sub"
sub_path=$path
quiet && [ "$out" = "$(printf '%s\n' 'parked: line 1, now note 2: from the subdirectory' "$offer_x" "$path")" ] \
  || broken+=" subdirectory"
run_park thirteen "$tmp/ws/thirteen-abs"
quiet && [ "$out" = "$(printf '%s\n' 'parked: line 1, now note 3: with an outside plan' "$path")" ] \
  || broken+=" absolute"
abs_path=$path
run_park thirteen-out "$tmp/ws/thirteen-out"
quiet && archived && [ "$out" = "$(printf '%s\n' 'parked: line 1, now note 1: outside any repository' "$path")" ] \
  || broken+=" no-repository"
run_park thirteen "$tmp/ws/thirteen-missing"
quiet && [ "$out" = "$(printf '%s\n' 'parked: line 1, now note 4: with a missing plan' "$path")" ] \
  || broken+=" missing-plan"
missing_path=$path
main=$(cd -P "$tmp/p/thirteen" && pwd)
mkdir -p "$tmp/ws/thirteen-wt-cmd" "$tmp/ws/thirteen-sub-cmd" "$tmp/ws/thirteen-link"
for w in thirteen-wt-cmd thirteen-sub-cmd thirteen-link; do echo docs/plan.md > "$tmp/ws/$w/plan-path"; done
echo 'Handed to plan x: from the worktree without engine' > "$tmp/ws/thirteen-wt-cmd/progress.md"
echo 'Handed to plan x: from the subdirectory without engine' > "$tmp/ws/thirteen-sub-cmd/progress.md"
echo 'Handed to plan x: through a link' > "$tmp/ws/thirteen-link/progress.md"
park_path=/usr/bin:/bin run_park_in "$tmp/p/thirteen-wt" "$tmp/ws/thirteen-wt-cmd"
quiet && archived && [ "$out" = "$(printf '%s\n' \
  "not parked (later not on PATH): (cd '$main' && later -- 'Plan x: from the worktree without engine Archive: $path')" \
  "$offer_x" "$path")" ] || broken+=" worktree-cmd"
wt_cmd_path=$path wt_out=$out
park_path=/usr/bin:/bin run_park_in "$tmp/p/thirteen/docs" "$tmp/ws/thirteen-sub-cmd"
quiet && archived && [ "$out" = "$(printf '%s\n' \
  "not parked (later not on PATH): (cd '$main' && later -- 'Plan x: from the subdirectory without engine Archive: $path')" \
  "$offer_x" "$path")" ] || broken+=" subdirectory-cmd"
sub_cmd_path=$path
run_cmds || broken+=" subdirectory-eval"
ln -s "$tmp/p" "$tmp/link"
park_path=/usr/bin:/bin run_park_in "$tmp/link/thirteen-wt" "$tmp/ws/thirteen-link"
quiet && archived && [ "${out%%$'\n'*}" = \
  "not parked (later not on PATH): (cd '$main' && later -- 'Plan x: through a link Archive: $path')" ] \
  || broken+=" link"
[ ! -e "$tmp/p/thirteen-wt/LATER.local.md" ] && [ ! -e "$tmp/p/thirteen/docs/LATER.local.md" ] \
  || broken+=" stray-queue"
git -C "$tmp/p/thirteen" worktree remove --force "$tmp/p/thirteen-wt" || broken+=" remove"
out=$wt_out
run_cmds || broken+=" worktree-eval"
mapfile -t notes < <(queue thirteen | grep '^- \[ \] ')
[ "${#notes[@]}" = 6 ] && [[ ${notes[0]} == "- [ ] Plan x: from the worktree Archive: $wt_path ("* ]] \
  && [[ ${notes[1]} == "- [ ] Plan x: from the subdirectory Archive: $sub_path ("* ]] \
  && [[ ${notes[2]} == "- [ ] Plan x: with an outside plan Archive: $abs_path ("* ]] \
  && [[ ${notes[3]} == "- [ ] Plan x: with a missing plan Archive: $missing_path ("* ]] \
  && [[ ${notes[4]} == "- [ ] Plan x: from the subdirectory without engine Archive: $sub_cmd_path ("* ]] \
  && [[ ${notes[5]} == "- [ ] Plan x: from the worktree without engine Archive: $wt_cmd_path ("* ]] \
  || broken+=" notes"
verdict 13

# 14. Case 3's workspaces through the park step, a ledger without a Handed to
#     line and no ledger: the path alone, no queue.
broken=
run_park fourteen "$tmp/ws/none"
quiet && archived && [ "$out" = "$path" ] || broken+=" no-handed"
run_park fourteen "$tmp/ws/empty"
quiet && archived && [ "$out" = "$path" ] || broken+=" no-ledger"
[ ! -e "$tmp/p/fourteen/LATER.local.md" ] || broken+=" queue"
verdict 14

# 15. The queue guard's shape: a seeded note "Plan x: guarded item Archive:
#     not an archive" is another note, not the item parked earlier; one
#     ending "Archive: /x/docs/tmp/apply-runs/old" is the item: found there
#     (parked earlier, note 2), nothing parked. Then a read-only ledger: the
#     note is parked and reported, its Parked: line reported not written, the
#     ledger unchanged, no second copy attempted (the first is identical),
#     exit 0, nothing on stderr. Then a sibling item the script parks, "sibling
#     item Archive: see the old run", beside the item "sibling item", in one
#     call (longer first) and across two: the shorter is parked as its own
#     note and found as that note, never as the sibling. The second copy's
#     failure branch is untested: the script creates the archive directory.
broken=
eng fifteen -- 'Plan x: guarded item Archive: not an archive' >/dev/null \
  && eng fifteen -- 'Plan x: guarded item Archive: /x/docs/tmp/apply-runs/old' >/dev/null || broken+=" seed"
mkdir -p "$tmp/ws/fifteen" "$tmp/ws/fifteen-ro"
echo 'Handed to plan x: guarded item' > "$tmp/ws/fifteen/progress.md"
run_park fifteen "$tmp/ws/fifteen"
quiet && archived && [ "$out" = "$(printf '%s\n' 'parked earlier: line 1, now note 2: guarded item' "$path")" ] \
  || broken+=" guard"
[ "$(listing fifteen | grep -cE '^ *[0-9]+\. ')" = 2 ] || broken+=" guard-queue"
[ "$(tail -n 1 "$tmp/ws/fifteen/progress.md")" = 'Parked: line 1: plan x: guarded item' ] || broken+=" guard-ledger"
echo 'Handed to plan x: unwritable ledger' > "$tmp/ws/fifteen-ro/progress.md"
chmod a-w "$tmp/ws/fifteen-ro/progress.md"
run_park fifteen "$tmp/ws/fifteen-ro"
quiet && archived && [ "$out" = "$(printf '%s\n' 'parked: line 1, now note 3: unwritable ledger' \
  'not marked (ledger write failed): line 1' "$path")" ] || broken+=" read-only"
[ "$(cat "$tmp/ws/fifteen-ro/progress.md")" = 'Handed to plan x: unwritable ledger' ] || broken+=" read-only-ledger"
[ "$(listing fifteen | grep -cE '^ *[0-9]+\. ')" = 3 ] || broken+=" read-only-queue"
chmod u+w "$tmp/ws/fifteen-ro/progress.md"
mkdir -p "$tmp/ws/fifteen-sib" "$tmp/ws/fifteen-sib2"
printf '%s\n' 'Handed to plan x: sibling item Archive: see the old run' 'Handed to plan x: sibling item' \
  > "$tmp/ws/fifteen-sib/progress.md"
echo 'Handed to plan x: sibling item' > "$tmp/ws/fifteen-sib2/progress.md"
run_park fifteen-sib "$tmp/ws/fifteen-sib"
quiet && archived && [ "$out" = "$(printf '%s\n' 'parked: line 1, now note 1: sibling item Archive: see the old' \
  'parked: line 2, now note 2: sibling item' "$path")" ] || broken+=" sibling"
run_park fifteen-sib "$tmp/ws/fifteen-sib2"
quiet && archived && [ "$out" = "$(printf '%s\n' 'parked earlier: line 1, now note 2: sibling item' "$path")" ] \
  || broken+=" sibling-rerun"
[ "$(listing fifteen-sib | grep -cE '^ *[0-9]+\. ')" = 2 ] || broken+=" sibling-queue"
verdict 15

# 16. The home-directory exception: with the home directory a repository
#     (a dotfiles setup), a run in a subdirectory of it names that
#     subdirectory, not the home directory, and the replayed command parks
#     there; a run in the home directory itself names it. The scoped home
#     holds a .claude/projects directory, as a real one does, because the
#     script's transcript search needs one.
broken=
mkdir -p "$tmp/home/sub" "$tmp/home/.claude/projects" "$tmp/ws/sixteen-sub" "$tmp/ws/sixteen-home"
git -C "$tmp/home" init -q || broken+=" repo"
echo 'Handed to plan x: under the home directory' > "$tmp/ws/sixteen-sub/progress.md"
echo 'Handed to plan x: in the home directory' > "$tmp/ws/sixteen-home/progress.md"
HOME=$tmp/home park_path=/usr/bin:/bin run_park_in "$tmp/home/sub" "$tmp/ws/sixteen-sub"
quiet && archived && [ "$out" = "$(printf '%s\n' \
  "not parked (later not on PATH): (cd '$tmp/home/sub' && later -- 'Plan x: under the home directory Archive: $path')" \
  "$path")" ] || broken+=" sub"
HOME=$tmp/home run_cmds || broken+=" sub-eval"
[ -f "$tmp/home/sub/LATER.local.md" ] && [ ! -e "$tmp/home/LATER.local.md" ] || broken+=" sub-queue"
HOME=$tmp/home park_path=/usr/bin:/bin run_park_in "$tmp/home" "$tmp/ws/sixteen-home"
quiet && archived && [ "$out" = "$(printf '%s\n' \
  "not parked (later not on PATH): (cd '$tmp/home' && later -- 'Plan x: in the home directory Archive: $path')" \
  "$path")" ] || broken+=" home"
verdict 16

# 17. The Skill line: each value is 12 hexadecimal characters, the start of
#     the sha256 of SKILL.md and of prompts/unit-controller-overrides.md in
#     the script's skill directory (the parent of its scripts/ directory).
skill_dir=$(cd "$(dirname "$script")/.." && pwd)
mkdir -p "$tmp/ws/seventeen"
run "$tmp/ws/seventeen" seventeen
line=$(grep '^Skill:' "$out/run-facts.md" 2>/dev/null || true)
form='^Skill: SKILL\.md ([0-9a-f]{12}), unit-controller-overrides\.md ([0-9a-f]{12})$'
if quiet && [[ $line =~ $form ]] \
  && [ "${BASH_REMATCH[1]}" = "$(sha256sum < "$skill_dir/SKILL.md" | cut -c1-12)" ] \
  && [ "${BASH_REMATCH[2]}" = "$(sha256sum < "$skill_dir/prompts/unit-controller-overrides.md" | cut -c1-12)" ]; then
  pass 17; else echo "FAIL 17: ${line:-no Skill line}${err:+; stderr: $err}"; fail=1; fi

exit "$fail"
