#!/usr/bin/env bash
# Test for bin/sdd-checkpoint of the sdd plugin. Builds two temporary git
# repositories with one committed file
# each, runs the script against them and prints "ok <n>" or "FAIL <n>" per
# case; exits 1 when any case fails.
#
# Usage: bash tests/test-sdd-checkpoint.sh [SCRIPT]
#   Default SCRIPT: bin/sdd-checkpoint in the plugin root, the parent of this
#   script's directory
# The temporary commits go through the configured signing setup. The
# temporary directory (TMPDIR) must lie outside every git work tree, since
# case 4 needs a path in no repository.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
script=${1:-$root/bin/sdd-checkpoint}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
a=$tmp/repo-a
b=$tmp/repo-b
form='^heads [a-z0-9.-]+ [0-9a-f]{7}; tree [0-9a-f]{16}$'
fail=0

# Run the script with the given paths; sets out, err and rc.
run() {
  rc=0
  out=$(bash "$script" "$@" 2>"$tmp/stderr") || rc=$?
  err=$(cat "$tmp/stderr")
}
quiet() { [ "$rc" -eq 0 ] && [ -z "$err" ]; } # the last run: exit 0, no stderr
pass() { echo "ok $1"; }
miss() { echo "FAIL $1${err:+: $err}"; fail=1; }

# Write CONTENT to FILE in REPO and commit it.
commit() {
  printf '%s\n' "$3" > "$1/$2"
  git -C "$1" add -- "$2"
  git -C "$1" commit -q -m "Add $2"
}

git init -q -b main "$a"
git init -q -b main "$b"
commit "$a" file.txt alpha
commit "$b" file.txt beta

# 1. A clean repository: two runs print the same line, of the documented form.
run "$a/file.txt"
clean=$out rc1=$rc
run "$a/file.txt"
if [ "$rc1" -eq 0 ] && [ "$rc" -eq 0 ] && [ "$out" = "$clean" ] &&
   [[ $out =~ $form ]]; then pass 1; else miss 1; fi

# 2. A tracked file edited: the line changes, and changes again on a second
#    edit that git status shows with the same " M" line; checkout restores
#    case 1's line.
printf 'edited\n' >> "$a/file.txt"
run "$a/file.txt"
edited=$out rc1=$rc
printf 'again\n' >> "$a/file.txt"
run "$a/file.txt"
again=$out rc2=$rc
git -C "$a" checkout -q -- file.txt
run "$a/file.txt"
if [ "$rc1" -eq 0 ] && [ "$rc2" -eq 0 ] && [ "$rc" -eq 0 ] &&
   [ "$edited" != "$clean" ] && [ "$again" != "$edited" ] &&
   [[ $again =~ $form ]] && [ "$out" = "$clean" ]; then pass 2; else miss 2; fi

# 3. An untracked file created, then its content changed: the line changes at
#    both steps; the second step changes content alone, which git status
#    shows with the same "??" line.
run "$a/file.txt" "$a/new.txt"
before=$out rc1=$rc
printf 'one\n' > "$a/new.txt"
run "$a/file.txt" "$a/new.txt"
created=$out rc2=$rc
printf 'two\n' > "$a/new.txt"
run "$a/file.txt" "$a/new.txt"
rm -- "$a/new.txt"
if [ "$rc1" -eq 0 ] && [ "$rc2" -eq 0 ] && [ "$rc" -eq 0 ] &&
   [ "$created" != "$before" ] && [ "$out" != "$created" ] &&
   [[ $out =~ $form ]]; then pass 3; else miss 3; fi

# 4. Paths that do not exist; every run exits 0 with nothing on stderr. A
#    failure names its part:
#    absent        in no repository: a plain file under the name "files".
#    deleted-file  a tracked file deleted: a stable line, still repo-a with
#                  the last commit touching the file.
#    deleted-dir   a committed file whose directory is deleted, then the
#                  deletion committed: still repo-a, the head and the line
#                  follow the commit, and git's warning for the missing
#                  directory (sub/ exists, sub/gone/ does not) stays off
#                  stderr.
broken=
run "$tmp/absent.txt"
if ! { quiet && [[ $out =~ ^heads\ files\ none\;\ tree\ [0-9a-f]{16}$ ]]; }; then
  broken+=" absent"
fi

rm -- "$a/file.txt"
was="^heads repo-a $(git -C "$a" log -n 1 --format=%h -- file.txt); tree [0-9a-f]{16}\$"
run "$a/file.txt"
deleted=$out rc1=$rc err1=$err
run "$a/file.txt"
git -C "$a" checkout -q -- file.txt
if ! { [ "$rc1" -eq 0 ] && [ -z "$err1" ] && quiet && [ "$out" = "$deleted" ] &&
       [ "$deleted" != "$clean" ] && [[ $deleted =~ $was ]]; }; then
  broken+=" deleted-file"
fi

mkdir -p "$a/sub/gone"
commit "$a" sub/keep.txt keep
commit "$a" sub/gone/g.txt gamma
rm -r -- "$a/sub/gone"
was="^heads repo-a $(git -C "$a" log -n 1 --format=%h -- sub/gone/g.txt); tree [0-9a-f]{16}\$"
run "$a/sub/gone/g.txt"
deleted=$out rc1=$rc err1=$err
git -C "$a" rm -q -r -- sub/gone
git -C "$a" commit -q -m "Remove sub/gone"
now="^heads repo-a $(git -C "$a" log -n 1 --format=%h -- sub/gone/g.txt); tree [0-9a-f]{16}\$"
run "$a/sub/gone/g.txt"
if ! { [ "$rc1" -eq 0 ] && [ -z "$err1" ] && quiet && [ "$now" != "$was" ] &&
       [[ $deleted =~ $was ]] && [[ $out =~ $now ]] && [ "$out" != "$deleted" ]; }; then
  broken+=" deleted-dir"
fi
if [ -z "$broken" ]; then pass 4; else miss "4 (${broken# })"; fi

# 5. Paths in both repositories: two heads named after the directories, each
#    that repository's own last commit touching its paths. repo-b's HEAD is a
#    later commit touching another file, so a head read from HEAD fails here.
commit "$b" other.txt gamma
head_a=$(git -C "$a" log -n 1 --format=%h -- file.txt)
head_b=$(git -C "$b" log -n 1 --format=%h -- file.txt)
both="^heads repo-a $head_a, repo-b $head_b; tree [0-9a-f]{16}\$"
run "$a/file.txt" "$b/file.txt"
if [ "$rc" -eq 0 ] && [ "$head_b" != "$(git -C "$b" log -n 1 --format=%h)" ] &&
   [[ $out =~ $both ]]; then pass 5; else miss 5; fi

# 6. No arguments: usage error, exit 2, nothing on stdout.
run
if [ "$rc" -eq 2 ] && [ -z "$out" ]; then pass 6; else miss 6; fi

exit "$fail"
