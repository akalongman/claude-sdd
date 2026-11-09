#!/usr/bin/env bash
# Test for tests/check-skill-size.sh of the sdd plugin: the substituted count
# of its two references, the limit and the missing-file exit. Writes fixtures
# to a temporary directory, removed on exit, runs the check on them and
# prints "ok <n>" or "FAIL <n>" per case; exits 1 when any case fails.
#
# Case 1 is the plan's fixture (Task 2 Step 4): 'a ${CLAUDE_PLUGIN_ROOT}/x'
# and a newline, 26 characters, in which the 21-character reference becomes
# the 120-character stand-in, so 26 - 21 + 120 = 125: "ok 125/200
# (substituted)". Case 2: 'a ${CLAUDE_SKILL_DIR}/x' and a newline, 24
# characters, in which the 19-character reference becomes the stand-in plus
# /skills/apply, 120 + 13 = 133, so 24 - 19 + 133 = 138: "ok 138/200
# (substituted)". Case 3, case 1's fixture against the limits 126, 125 and
# 124: ok and exit 0 one above the count, "FAIL 125/125 (substituted)" and
# exit 1 at it, "FAIL 125/124 (substituted)" and exit 1 over it. Case 4, a
# missing file: exit 2, nothing on stdout.
#
# Usage: bash tests/test-check-skill-size.sh [SCRIPT]
#   Default SCRIPT: tests/check-skill-size.sh beside this script
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
script=${1:-$here/check-skill-size.sh}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0

# Run the check with the given arguments; sets out, err and rc.
run() {
  rc=0
  out=$(bash "$script" "$@" 2>"$tmp/stderr") || rc=$?
  err=$(cat "$tmp/stderr")
}
pass() { echo "ok $1"; }
miss() { echo "FAIL $1: rc=$rc; ${out:-no output}${err:+; stderr: $err}"; fail=1; }

# shellcheck disable=SC2016
printf '%s\n' 'a ${CLAUDE_PLUGIN_ROOT}/x' > "$tmp/root.md"
# shellcheck disable=SC2016
printf '%s\n' 'a ${CLAUDE_SKILL_DIR}/x' > "$tmp/skill-dir.md"

# 1. The plugin root reference counts as the stand-in.
run "$tmp/root.md" 200
if [ "$rc" -eq 0 ] && [ "$out" = 'ok 125/200 (substituted)' ]; then pass 1; else miss 1; fi

# 2. The skill directory reference counts as the stand-in plus /skills/apply.
run "$tmp/skill-dir.md" 200
if [ "$rc" -eq 0 ] && [ "$out" = 'ok 138/200 (substituted)' ]; then pass 2; else miss 2; fi

# 3. The limit: below it ok, at it and over it FAIL with exit 1. A failure
#    names its part.
broken=
run "$tmp/root.md" 126
[ "$rc" -eq 0 ] && [ "$out" = 'ok 125/126 (substituted)' ] || broken+=" below"
run "$tmp/root.md" 125
[ "$rc" -eq 1 ] && [ "$out" = 'FAIL 125/125 (substituted)' ] || broken+=" at"
run "$tmp/root.md" 124
[ "$rc" -eq 1 ] && [ "$out" = 'FAIL 125/124 (substituted)' ] || broken+=" over"
if [ -z "$broken" ]; then pass 3; else miss "3 (${broken# })"; fi

# 4. A missing file: exit 2 and nothing on stdout.
run "$tmp/missing.md" 200
if [ "$rc" -eq 2 ] && [ -z "$out" ]; then pass 4; else miss 4; fi

exit "$fail"
