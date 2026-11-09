#!/usr/bin/env bash
# Failure-path check of openspec-section-tick and section-span.awk against
# the fixtures in fixtures/. Builds a throwaway git repository per case,
# runs the installed scripts, and compares the task file and the ledger
# with what the case expects. Prints one line per case and exits non-zero
# on the first failure. No dependencies beyond bash, git, awk and coreutils.
#
# Usage: tick-script-check.sh [SCRIPTS_DIR]
#   SCRIPTS_DIR defaults to $HOME/projects/akalongman/claude-sdd/skills/apply/scripts.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
scripts=${1:-"$HOME/projects/akalongman/claude-sdd/skills/apply/scripts"}
tick="$scripts/openspec-section-tick"
brief="$scripts/openspec-section-brief"
[ -x "$tick" ] && [ -x "$brief" ] || { echo "scripts not found under $scripts" >&2; exit 2; }
work=$(mktemp -d)
trap 'chmod -R u+w "$work"; rm -rf "$work"' EXIT
fail=0
pass() { echo "ok   $1"; }
flunk() { echo "FAIL $1: $2"; fail=1; }

# fresh CHANGE FIXTURE: a repository with one change and an empty ledger
fresh() {
  local d="$work/$1"
  rm -rf "$d"; mkdir -p "$d/openspec/changes/$1" "$d/.superpowers/sdd/$1"
  git -C "$d" init -q
  cp "$here/fixtures/$2" "$d/openspec/changes/$1/tasks.md"
  chmod 644 "$d/openspec/changes/$1/tasks.md"
  printf 'Run base: 0000000\n' > "$d/.superpowers/sdd/$1/progress.md"
  echo "$d"
}
tasks() { cat "$1/openspec/changes/$2/tasks.md"; }
ledger() { cat "$1/.superpowers/sdd/$2/progress.md"; }
ledger_lines() { wc -l < "$1/.superpowers/sdd/$2/progress.md"; }

# 1. an unknown id writes nothing
d=$(fresh c1 tasks.md); before=$(tasks "$d" c1)
(cd "$d" && "$tick" c1 1 'Section 1: complete' 1.9 2>/dev/null); rc=$?
if [ "$rc" -eq 5 ] && [ "$(tasks "$d" c1)" = "$before" ] && [ "$(ledger_lines "$d" c1)" -eq 1 ]; then pass "unknown id: exit 5, nothing written"; else flunk "unknown id" "rc=$rc"; fi

# 2. a valid id mixed with an unknown one writes nothing
d=$(fresh c2 tasks.md); before=$(tasks "$d" c2)
(cd "$d" && "$tick" c2 1 'Section 1: complete' 1.1 1.9 2>/dev/null); rc=$?
if [ "$rc" -eq 5 ] && [ "$(tasks "$d" c2)" = "$before" ] && [ "$(ledger_lines "$d" c2)" -eq 1 ]; then pass "mixed ids: exit 5, nothing written"; else flunk "mixed ids" "rc=$rc"; fi

# 3. the happy path ticks the named items, appends one line, keeps the mode
d=$(fresh c3 tasks.md)
(cd "$d" && "$tick" c3 1 'Section 1: complete' 1.1 1.2 >/dev/null 2>&1); rc=$?
mode=$(stat -c %a "$d/openspec/changes/c3/tasks.md")
if [ "$rc" -eq 0 ] && tasks "$d" c3 | grep -q '^- \[x\] 1.1 ' && tasks "$d" c3 | grep -q '^- \[x\] 1.2 ' \
   && [ "$(ledger "$d" c3 | tail -n 1)" = 'Section 1: complete' ] && [ "$mode" = 644 ] && [ -z "$(ls "$d/openspec/changes/c3" | grep -v '^tasks.md$')" ]; then
  pass "happy path: ticked, ledger +1, mode kept, no temp file left"; else flunk "happy path" "rc=$rc mode=$mode"; fi

# 4. an already ticked id beside an open one proceeds; all ticked exits 3
d=$(fresh c4 tasks.md)
(cd "$d" && "$tick" c4 1 'Section 1: partial' 1.1 >/dev/null 2>&1)
(cd "$d" && "$tick" c4 1 'Section 1: complete' 1.1 1.2 >/dev/null 2>&1); rc=$?
(cd "$d" && "$tick" c4 1 'Section 1: again' 1.1 1.2 2>/dev/null); rc2=$?
if [ "$rc" -eq 0 ] && [ "$rc2" -eq 3 ] && [ "$(ledger_lines "$d" c4)" -eq 3 ]; then pass "ticked plus open proceeds; all ticked exits 3 without a ledger line"; else flunk "already ticked" "rc=$rc rc2=$rc2"; fi

# 5. a temp-file failure leaves both files untouched
d=$(fresh c5 tasks.md); before=$(tasks "$d" c5)
chmod a-w "$d/openspec/changes/c5"
(cd "$d" && "$tick" c5 1 'Section 1: complete' 2>/dev/null); rc=$?
chmod u+w "$d/openspec/changes/c5"
if [ "$rc" -ne 0 ] && [ "$(tasks "$d" c5)" = "$before" ] && [ "$(ledger_lines "$d" c5)" -eq 1 ]; then pass "temp-file failure: non-zero exit, ledger and tasks untouched"; else flunk "temp-file failure" "rc=$rc ledger=$(ledger_lines "$d" c5)"; fi

# 6. fenced examples are never items: the brief counts two open, the tick ticks two
d=$(fresh c6 tasks-fenced.md)
out=$(cd "$d" && "$brief" c6 1 "$d/brief.md" 2>&1); rc=$?
(cd "$d" && "$tick" c6 1 'Section 1: complete' >/dev/null 2>&1); rc2=$?
if [ "$rc" -eq 0 ] && [[ $out == *"2 open items, 1 done"* ]] && [ "$rc2" -eq 0 ] \
   && tasks "$d" c6 | grep -q '^- \[ \] 1.9 ' && tasks "$d" c6 | grep -q '^- \[ \] 1.8 ' \
   && tasks "$d" c6 | grep -q '^- \[x\] 1.2 ' && tasks "$d" c6 | grep -q '^- \[x\] 1.3 ' && tasks "$d" c6 | grep -q '^- \[ \] 9.9 '; then
  pass "backtick and tilde fences: brief counts 2 open, tick leaves fenced lines and Notes alone"; else flunk "fences" "rc=$rc rc2=$rc2 out=$out"; fi

# 7. a fenced id named explicitly is unknown
d=$(fresh c7 tasks-fenced.md)
(cd "$d" && "$tick" c7 1 'Section 1: complete' 1.8 2>/dev/null); rc=$?
if [ "$rc" -eq 5 ]; then pass "an id that exists only inside a fence: exit 5"; else flunk "fenced id" "rc=$rc"; fi

# 8. the default (no ids) ticks only the named section
d=$(fresh c8 tasks.md)
(cd "$d" && "$tick" c8 2b 'Section 2b: complete' >/dev/null 2>&1); rc=$?
if [ "$rc" -eq 0 ] && tasks "$d" c8 | grep -q '^- \[x\] 2.2 ' && tasks "$d" c8 | grep -q '^- \[ \] 2.1 ' && tasks "$d" c8 | grep -q '^- \[ \] 1.1 '; then pass "no ids: only section 2b ticked"; else flunk "section scope" "rc=$rc"; fi

exit $fail
