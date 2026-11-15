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
# cases 4, 8 and 10 need paths in no repository.
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

L=$tmp/list.txt

# 7. --list gives the PATH form's line for the same paths.
printf '%s\n' "$a/file.txt" "$a/new.txt" > "$L"
run --list "$L"
listed=$out rc1=$rc
run "$a/file.txt" "$a/new.txt"
if [ "$rc1" -eq 0 ] && [ "$rc" -eq 0 ] && [ "$out" = "$listed" ] &&
   [[ $out =~ $form ]]; then pass 7; else miss 7; fi

# 8. Repeats dropped, keeping the first: the list twice over, plus
#    "$a/./file.txt" as a PATH, gives case 7's line. git reads a repeated
#    pathspec once, so the plain branch, which hashes each path in turn,
#    shows a repeat kept or the wrong one dropped: p.txt, q.txt and p.txt
#    again in the list, plus "$tmp/./p.txt" as a PATH, give the line of the
#    PATHs p.txt and q.txt.
printf '%s\n' "$a/file.txt" "$a/new.txt" "$a/file.txt" > "$L"
run --list "$L" "$a/./file.txt"
repeated=$out rc1=$rc
printf 'p\n' > "$tmp/p.txt"
printf 'q\n' > "$tmp/q.txt"
run "$tmp/p.txt" "$tmp/q.txt"
plain=$out rc2=$rc
printf '%s\n' "$tmp/p.txt" "$tmp/q.txt" "$tmp/p.txt" > "$L"
run --list "$L" "$tmp/./p.txt"
if [ "$rc1" -eq 0 ] && [ "$repeated" = "$listed" ] && [ "$rc2" -eq 0 ] &&
   [ "$rc" -eq 0 ] && [ "$out" = "$plain" ]; then pass 8; else miss 8; fi

# 9. Blank and whitespace-only lines skipped; CRLF ends give the LF line.
printf '\n%s\r\n   \n%s\r\n' "$a/file.txt" "$a/new.txt" > "$L"
run --list "$L"
if [ "$rc" -eq 0 ] && [ "$out" = "$listed" ]; then pass 9; else miss 9; fi

# 10. A leading ~/ is HOME: with HOME=$tmp/home holding x.txt, a list line
#     '~/x.txt' gives the line of PATH "$tmp/home/x.txt".
mkdir "$tmp/home"
printf 'x\n' > "$tmp/home/x.txt"
# shellcheck disable=SC2088 # the list line holds a literal ~/
printf '%s\n' '~/x.txt' > "$L"
HOME=$tmp/home run --list "$L"
home=$out rc1=$rc
run "$tmp/home/x.txt"
if [ "$rc1" -eq 0 ] && [ "$rc" -eq 0 ] && [ "$out" = "$home" ]; then
  pass 10; else miss 10; fi

# 11. An empty list file, and one of blank lines only: each prints exactly
#     'heads none; tree e3b0c44298fc1c14', rc 0, nothing on stderr.
none='heads none; tree e3b0c44298fc1c14'
: > "$L"
run --list "$L"
empty=$out rc1=$rc err1=$err
printf '\n  \n\n' > "$L"
run --list "$L"
if [ "$rc1" -eq 0 ] && [ -z "$err1" ] && [ "$empty" = "$none" ] && quiet &&
   [ "$out" = "$none" ]; then pass 11; else miss 11; fi

# 12. A missing list file: rc 2, nothing on stdout. '--list' as the last
#     argument: rc 2, nothing on stdout. A directory as the list file, which
#     would otherwise read as an empty list: rc 2, nothing on stdout.
run --list "$tmp/no-list.txt"
missing=$out rc1=$rc
run "$a/file.txt" --list
last=$out rc2=$rc
run --list "$tmp"
if [ "$rc1" -eq 2 ] && [ -z "$missing" ] && [ "$rc2" -eq 2 ] && [ -z "$last" ] &&
   [ "$rc" -eq 2 ] && [ -z "$out" ]; then pass 12; else miss 12; fi

# 13. --list and PATH mix in either order: repo-a's path from the list and
#     repo-b's as a PATH, then repo-a's as a PATH and repo-b's from the list,
#     each give case 5's line, two heads in first-seen order. A list line
#     "$a/my file.txt" gives the line of PATH "$a/my file.txt".
commit "$a" "my file.txt" delta
printf '%s\n' "$a/file.txt" > "$L"
run --list "$L" "$b/file.txt"
first=$out rc1=$rc
printf '%s\n' "$b/file.txt" > "$L"
run "$a/file.txt" --list "$L"
second=$out rc2=$rc
printf '%s\n' "$a/my file.txt" > "$L"
run --list "$L"
spaced=$out rc3=$rc
run "$a/my file.txt"
if [ "$rc1" -eq 0 ] && [ "$rc2" -eq 0 ] && [[ $first =~ $both ]] &&
   [ "$second" = "$first" ] && [ "$rc3" -eq 0 ] && [ "$rc" -eq 0 ] &&
   [ "$out" = "$spaced" ] && [[ $out =~ $form ]]; then pass 13; else miss 13; fi

exit "$fail"
