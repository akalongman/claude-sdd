#!/usr/bin/env bash
# shellcheck disable=SC2016
# Guard for skills/apply/references/noask.md of the sdd plugin, the apply
# driver's rules while noask is on: each ledger line, message and phrase the
# rules name must be in the file. Every string is matched as a fixed string
# (grep -F; several hold parentheses) against the file joined into one line,
# its newlines read as spaces and runs of spaces read as one, as a rendered
# Markdown file reads, so the wrapping and a list's indentation are free.
# Prints "missing: <name>" for each string absent and exits 1 on any; exits
# 0 with no output when all are present; exit 2 on a missing FILE.
#
# Usage: bash tests/check-noask-reference.sh [FILE]
#   FILE  defaults to skills/apply/references/noask.md in the plugin root,
#         the parent of this script's directory
set -u
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
f=${1:-$root/skills/apply/references/noask.md}; fail=0
[ -f "$f" ] || { echo "usage: bash tests/check-noask-reference.sh [FILE]" >&2; exit 2; }
joined=$(tr '\n' ' ' < "$f" | tr -s ' ')
# need NAME STRING: STRING must occur in the joined file.
need() { /bin/grep -qF -- "$2" <<< "$joined" || { echo "missing: $1"; fail=1; }; }
need 'waiting line' 'noask: waiting: <the ledger line'
need 'seen on line' 'Noask: seen on at <time>'
need 'unreadable line' 'Noask: status unreadable (<error>)'
# The bare line in its backticks, so the defect path's longer line, which
# holds it as a prefix, cannot satisfy this need.
need 'dispatch mode' '`Mode: handsoff`'
need 'defect path resume' 'Mode: handsoff: rule and continue'
need 'step prompt line' 'Noask: step prompt skipped'
need 'no source named' 'noask: blocked: no source named'
need 'parked line' 'Section N: parked (noask: <question>)'
need 'blocked print' 'blocked: <question>'
need 'refused push line' 'Handsoff: not pushed (refused under noask)'
need 'done line' 'noask: done'
need 'final blocked line' 'noask: blocked: <final status>'
need 'status command' 'noask status'
need 'nothing running continuation' 'nothing of yours is running'
need 'launch branch' 'the branch it was launched on'
need 'switched off by' '`off` or `expired`'
need 'never switch' "Never switch noask yourself, for this session or for every session: \`/noask\` and \`noask global\` are the owner's."
exit $fail
