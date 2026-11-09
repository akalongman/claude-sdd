#!/usr/bin/env bash
# Test for tests/run.sh of the sdd plugin: its two skip rules and its count.
# Copies the runner into a temporary tree, removed on exit, beside a stub for
# every script it runs (each prints "ran <name>" and exits 0, or 1 where a
# case says so) and, where a case wants one, a stub
# skills/apply/scripts/sub-skill-check that exits with the case's status for
# --dir after printing two reason lines on stderr. It runs the copy, never
# the real suite, with a PATH built for the case: links to bash and dirname,
# and a stub later only where the case wants one, so no case depends on
# whether this machine has later. Prints "ok <n>" or "FAIL <n>" per case;
# exits 1 when any case fails.
#
# Cases: 1, later absent: "skip test-run-archive (later not on PATH)" and its
# stub not run. 2, --dir exits 2: "skip test-sub-skill-check (<reason line
# 1>; <reason line 2>)" and its stub not run. 3, --dir exits 0, then 1: the
# test runs, "ok test-sub-skill-check". 4, no sub-skill-check: the test runs,
# and its failing stub is "FAIL test-sub-skill-check". Every case also checks
# the totals line, last, and the exit: "8 ok, 1 skipped, 0 failed" and 0 in
# cases 1 and 2, "9 ok, 0 skipped, 0 failed" and 0 in case 3, "8 ok, 0
# skipped, 1 failed" and 1 in case 4; case 5, both skips and the failing
# pause-text stub (two runs), "5 ok, 2 skipped, 2 failed" and 1. The counts
# follow the runner's nine verdict lines (check-pause-text runs twice); a
# check added to the runner needs its stub here and new counts.
#
# Usage: bash tests/test-run.sh [RUNNER]
#   Default RUNNER: tests/run.sh beside this script
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
runner=${1:-$here/run.sh}
bash_bin=$(command -v bash)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/base" "$tmp/later"
ln -s "$bash_bin" "$tmp/base/bash"
ln -s "$(command -v dirname)" "$tmp/base/dirname"
printf '%s\n' '#!/bin/sh' 'exit 0' > "$tmp/later/later"
chmod +x "$tmp/later/later"
without_later=$tmp/base
with_later=$tmp/base:$tmp/later
fail=0

# make_tree CASE [FAILING...]: the runner copied to $tmp/CASE/tests/run.sh
# beside a stub for every script it runs; the stubs named FAILING exit 1.
make_tree() {
  local d=$tmp/$1 s
  shift
  mkdir -p "$d/tests" "$d/skills/apply/scripts"
  cp "$runner" "$d/tests/run.sh"
  for s in check-skill-size check-pause-text test-run-archive test-sdd-checkpoint \
    test-sub-skill-check test-tools test-check-skill-size test-run; do
    printf 'echo "ran %s"\n' "$s" > "$d/tests/$s.sh"
  done
  for s; do printf 'echo "ran %s"\nexit 1\n' "$s" > "$d/tests/$s.sh"; done
}
# sub CASE STATUS: CASE's stub sub-skill-check; for --dir it prints two
# reason lines on stderr and exits STATUS, for anything else it exits 9.
sub() {
  # shellcheck disable=SC2016
  printf '%s\n' '[ "${1-}" = --dir ] || exit 9' "echo 'no superpowers copy' >&2" \
    "echo 'install it first' >&2" "exit $2" > "$tmp/$1/skills/apply/scripts/sub-skill-check"
}
# Run CASE's runner with PATH set to PATHS; sets out, err, rc and last (the
# last line of out).
run() {
  rc=0
  out=$(env PATH="$2" "$bash_bin" "$tmp/$1/tests/run.sh" 2>"$tmp/stderr") || rc=$?
  err=$(cat "$tmp/stderr")
  last=${out##*$'\n'}
}
has() { grep -qxF -- "$1" <<< "$out"; } # out holds the line LINE
# The last run: exit RC, nothing on stderr, totals line TOTALS last.
ends() { [ "$rc" -eq "$1" ] && [ -z "$err" ] && [ "$last" = "$2" ]; }
pass() { echo "ok $1"; }
# Ends a case: ok when no part broke, else FAIL with the broken parts and the
# last run's stdout (its lines joined by " | ") and stderr.
verdict() {
  if [ -z "$broken" ]; then pass "$1"; else
    echo "FAIL $1 (${broken# }): rc=$rc; ${out//$'\n'/ | }${err:+; stderr: $err}"; fail=1
  fi
}

# 1. No later on PATH: test-run-archive is skipped, not run, and the run
#    passes.
broken=
make_tree one
sub one 0
run one "$without_later"
has 'skip test-run-archive (later not on PATH)' || broken+=" skip-line"
! has 'ran test-run-archive' || broken+=" ran"
ends 0 '8 ok, 1 skipped, 0 failed' || broken+=" totals"
verdict 1

# 2. sub-skill-check --dir exits 2: test-sub-skill-check is skipped with the
#    reason from stderr, its two lines joined by "; ", and not run.
broken=
make_tree two
sub two 2
run two "$with_later"
has 'skip test-sub-skill-check (no superpowers copy; install it first)' || broken+=" skip-line"
! has 'ran test-sub-skill-check' || broken+=" ran"
ends 0 '8 ok, 1 skipped, 0 failed' || broken+=" totals"
verdict 2

# 3. --dir exits 0, then 1: any status but 2 runs the test.
broken=
make_tree three
for status in 0 1; do
  sub three "$status"
  run three "$with_later"
  has 'ran test-sub-skill-check' && has 'ok test-sub-skill-check' || broken+=" status-$status"
  ends 0 '9 ok, 0 skipped, 0 failed' || broken+=" totals-$status"
done
verdict 3

# 4. No sub-skill-check: the test runs, so its failing stub fails the run.
broken=
make_tree four test-sub-skill-check
run four "$with_later"
has 'ran test-sub-skill-check' && has 'FAIL test-sub-skill-check' || broken+=" fail-line"
ends 1 '8 ok, 0 skipped, 1 failed' || broken+=" totals"
verdict 4

# 5. All three counts at once: both skips, and the pause-text stub failing in
#    both of its runs.
broken=
make_tree five check-pause-text
sub five 2
run five "$without_later"
[ "$(grep -cxF 'FAIL check-pause-text' <<< "$out")" -eq 2 ] || broken+=" fail-lines"
ends 1 '5 ok, 2 skipped, 2 failed' || broken+=" totals"
verdict 5

exit "$fail"
