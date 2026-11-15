#!/usr/bin/env bash
# shellcheck disable=SC2016
# Guard for skills/apply/references/isolated.md of the sdd plugin, the apply
# driver's rules for an `isolated` run, with a project bootstrap or without:
# each command, ledger line and phrase the rules name must be in the file,
# and the forbidden ones (a forced removal, a forced branch deletion, the
# old launch word, a commit of the source) must not be. Every string is
# matched as a fixed string (grep -F; several hold parentheses or angle
# brackets) against the file joined into one line, its newlines read as
# spaces and runs of spaces read as one, as a rendered Markdown file reads,
# so the wrapping and a list's indentation are free.
# Prints "missing: <string>" for each needed string absent and
# "present: <string>" for each forbidden string found, and exits 1 on any;
# exits 0 with no output when all is well; exit 2 on a missing FILE.
#
# Usage: bash tests/check-isolated-reference.sh [FILE]
#   FILE  defaults to skills/apply/references/isolated.md in the plugin root,
#         the parent of this script's directory
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
f=${1:-$root/skills/apply/references/isolated.md}; fail=0
[ -f "$f" ] || { echo "usage: bash tests/check-isolated-reference.sh [FILE]" >&2; exit 2; }
joined=$(tr '\n' ' ' < "$f" | tr -s ' ')
# need STRING: STRING must occur in the joined file.
need() { /bin/grep -qF -- "$1" <<< "$joined" || { echo "missing: $1"; fail=1; }; }
# never STRING: STRING must not occur in the joined file.
never() { if /bin/grep -qF -- "$1" <<< "$joined"; then echo "present: $1"; fail=1; fi; }
need "holds the run's ledger"
need 'no worktree, no branch, no copy, no bootstrap, no gate run'
need 'scripts/source-copy'
need 'source-copy --undo'
need 'as they stand'
need 'openspec/changes/<name>/'
need '**Spec:**'
need 'does not reach the run'
need 'mktemp -d'
need 'composer worktree:setup'
need 'npm run worktree:setup'
need 'make worktree:setup'
need 'git check-ignore -q .worktrees/<name>'
need 'git worktree add .worktrees/<name> -b <name>'
need '(bare worktree: <commands> passed)'
need '(bare worktree: no gates)'
need 'git worktree remove .worktrees/<name>'
need 'git branch -d <name>'
need 'HEAD itself is failing'
need 'handsoff'
need '<archive>/source'
need '`/opsx:archive` inside the worktree'
never 'git worktree remove --force'
never 'git branch -D'
never 'hands-off'
never 'commit the change first'
never 'git add'
never 'git commit'
exit $fail
