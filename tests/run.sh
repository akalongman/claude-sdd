#!/usr/bin/env bash
# Runs the test scripts of the sdd plugin on the plugin's own files, each
# with its default path: the size check of skills/apply/SKILL.md, the
# pause-text guard on that file and then on
# skills/apply/prompts/unit-controller-overrides.md (two runs, both named
# check-pause-text), and the tests of run-archive, sdd-checkpoint and
# sub-skill-check. Each script's own output is followed by one line for it:
# "ok <name>", "FAIL <name>" or "skip <name> (<reason>)", <name> being the
# script's file name without .sh. A missing prerequisite skips its test
# without failing the run: test-run-archive.sh is skipped when the laterbox
# engine (later) is not on PATH, and test-sub-skill-check.sh when
# skills/apply/scripts/sub-skill-check exists and its --dir exits 2 (no
# installed superpowers copy), with the reason --dir prints on stderr. Any
# other --dir status runs the test, so a missing sub-skill-check fails it.
#
# Usage: bash tests/run.sh
# Ends with "<n> ok, <n> skipped, <n> failed"; exits 1 when any failed.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ok=0 skipped=0 failed=0

# Run test NAME as the command that follows it; print and count the verdict.
check() {
  local name=$1
  shift
  if "$@"; then
    echo "ok $name"
    ok=$((ok + 1))
  else
    echo "FAIL $name"
    failed=$((failed + 1))
  fi
}
# Skip test NAME for REASON.
skip() {
  echo "skip $1 ($2)"
  skipped=$((skipped + 1))
}

check check-skill-size bash "$root/tests/check-skill-size.sh"
for f in "$root/skills/apply/SKILL.md" "$root/skills/apply/prompts/unit-controller-overrides.md"; do
  check check-pause-text bash "$root/tests/check-pause-text.sh" "$f"
done
if command -v later >/dev/null; then
  check test-run-archive bash "$root/tests/test-run-archive.sh"
else
  skip test-run-archive 'later not on PATH'
fi
check test-sdd-checkpoint bash "$root/tests/test-sdd-checkpoint.sh"
sub=$root/skills/apply/scripts/sub-skill-check
rc=0 reason=
if [ -f "$sub" ]; then reason=$(bash "$sub" --dir 2>&1 >/dev/null) || rc=$?; fi
if [ "$rc" -eq 2 ]; then
  reason=${reason//$'\n'/; }
  skip test-sub-skill-check "${reason:-sub-skill-check --dir exited 2}"
else
  check test-sub-skill-check bash "$root/tests/test-sub-skill-check.sh"
fi

echo "$ok ok, $skipped skipped, $failed failed"
[ "$failed" -eq 0 ]
