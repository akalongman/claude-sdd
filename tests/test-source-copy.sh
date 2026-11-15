#!/usr/bin/env bash
# Test for skills/apply/scripts/source-copy of the sdd plugin. Builds a
# temporary repository R whose OpenSpec change folder holds an edited, a
# deleted, an added and an executable file, beside an ignored plan and an
# untracked note, all left uncommitted. Copies them into a new worktree,
# undoes the copy so the unforced worktree removal succeeds, tries bad
# calls on a second worktree, and copies them into a plain folder; prints
# "ok <n>" or "FAIL <n>" per case; exits 1 when any case fails.
#
# Usage: bash tests/test-source-copy.sh [SCRIPT]
#   Default SCRIPT: skills/apply/scripts/source-copy in the plugin root, the
#   parent of this script's directory
# The temporary commit goes through the configured signing setup. The
# temporary directory (TMPDIR) must lie outside every git work tree, since
# case 6 copies into a folder in no repository.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
script=${1:-$root/skills/apply/scripts/source-copy}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
R=$tmp/repo
W=$tmp/wt
W2=$tmp/wt2
A=$tmp/archive/source
change=openspec/changes/add-export
P=("$change" plans/p.md 'notes/My plan.md')
fail=0

# Run the script with the given arguments; sets out, err and rc.
run() {
  rc=0
  out=$(bash "$script" "$@" 2>"$tmp/stderr") || rc=$?
  err=$(cat "$tmp/stderr")
}
quiet() { [ "$rc" -eq 0 ] && [ -z "$out" ] && [ -z "$err" ]; } # exit 0, no output
pass() { echo "ok $1"; }
miss() { echo "FAIL $1${err:+: $err}"; fail=1; }

# The status of the source's paths in checkout D, ignored files included.
st() { git -C "$1" status --porcelain --ignored --untracked-files=all -- "${P[@]}"; }

# Succeeds when diff -r of R's and folder D's copy of each PATH prints
# nothing.
same() {
  local p d
  for p in "${P[@]}"; do
    d=$(diff -r -- "$R/$p" "$1/$p" 2>&1) || return 1
    [ -z "$d" ] || return 1
  done
}

git init -q -b main "$R"
mkdir -p "$R/$change"
printf 'plans/\n' > "$R/.gitignore"
printf 'Why: export orders.\n' > "$R/$change/proposal.md"
printf -- '- [ ] 1.1 Export\n' > "$R/$change/tasks.md"
printf 'Old text\n' > "$R/$change/old.md"
git -C "$R" add -- .gitignore "$change"
git -C "$R" commit -q -m "Add the export change"

printf -- '- [ ] 1.2 Import\n' >> "$R/$change/tasks.md"
rm -- "$R/$change/old.md"
printf 'Design\n' > "$R/$change/design.md"
printf '#!/bin/sh\nexit 0\n' > "$R/$change/check.sh"
chmod +x "$R/$change/check.sh"
mkdir -p "$R/plans" "$R/notes"
printf 'Plan\n' > "$R/plans/p.md"
printf 'Notes\n' > "$R/notes/My plan.md"

git -C "$R" worktree add -q "$W" -b add-export
before=$(git -C "$R" status --porcelain --ignored --untracked-files=all)

# 1. The copy into the worktree: exit 0, no output; the worktree's status of
#    the source's paths equals the checkout's, and is not empty.
run "$R" "$W" "${P[@]}"
copied=$rc
st_r=$(st "$R")
st_w=$(st "$W")
if quiet && [ -n "$st_w" ] && [ "$st_w" = "$st_r" ]; then pass 1; else miss 1; fi

# 2. Each PATH's copy matches R's, and the executable bit carried over.
if same "$W" && [ -x "$W/$change/check.sh" ]; then pass 2; else miss 2; fi

# 3. The copy left R's whole status as it was. Only a copy that ran counts.
if [ "$copied" -eq 0 ] &&
   [ "$(git -C "$R" status --porcelain --ignored --untracked-files=all)" = "$before" ]
then pass 3; else miss 3; fi

# 4. The undo: exit 0, no output; the worktree is clean, the deleted file is
#    back with its committed text, and the unforced worktree removal and the
#    branch deletion both succeed.
run --undo "$W" "${P[@]}"
rc1=$rc err1=$err q1=0
if quiet; then q1=1; fi
left=$(git -C "$W" status --porcelain --untracked-files=all)
old=$(cat -- "$W/$change/old.md" 2>/dev/null) || old=
rc2=0
git -C "$R" worktree remove "$W" 2>"$tmp/stderr" || rc2=$?
rc3=0
git -C "$R" branch -d add-export >/dev/null 2>>"$tmp/stderr" || rc3=$?
err=$err1$(cat "$tmp/stderr")
if [ "$q1" -eq 1 ] && [ "$rc1" -eq 0 ] && [ -z "$left" ] &&
   [ "$old" = 'Old text' ] && [ "$rc2" -eq 0 ] && [ "$rc3" -eq 0 ]
then pass 4; else miss 4; fi

# 5. Bad calls exit 2 and write nothing. Each bad PATH follows the valid
#    change folder, so a script that wrote before checking every PATH would
#    leave the change in W2's status. Every bad PATH also exists when read
#    from R (R/../x, R//etc/hosts, R/a/../b, R/), so only its own check can
#    refuse it. The copy from R into R itself would delete the source's
#    uncommitted files, so it is refused and leaves R's status as it was.
#    The undo in a folder where git finds no HEAD fails before it removes
#    anything.
git -C "$R" worktree add -q "$W2" -b t2
printf 'x\n' > "$tmp/x"
mkdir -p "$R/a" "$R/etc"
printf 'b\n' > "$R/b"
printf 'h\n' > "$R/etc/hosts"
broken=
run "$R" "$W2" "$change" nope.md
if [ "$rc" -ne 2 ]; then broken+=" nope.md"; fi
for bad in /etc/hosts ../x a/../b ''; do
  run "$R" "$W2" "$change" "$bad"
  if [ "$rc" -ne 2 ]; then broken+=" copy:'$bad'"; fi
  run --undo "$W2" "$change" "$bad"
  if [ "$rc" -ne 2 ]; then broken+=" undo:'$bad'"; fi
done
run "$R" "$W2"
if [ "$rc" -ne 2 ]; then broken+=" copy-two-arguments"; fi
run --undo "$W2"
if [ "$rc" -ne 2 ]; then broken+=" undo-one-argument"; fi
run "$tmp/no-folder" "$W2" "$change"
if [ "$rc" -ne 2 ]; then broken+=" from-not-a-folder"; fi
run "$R" "$tmp/no-folder" "$change"
if [ "$rc" -ne 2 ]; then broken+=" to-not-a-folder"; fi
run "$R" "$R" "${P[@]}"
if [ "$rc" -ne 2 ] || [ "$(st "$R")" != "$st_r" ]; then broken+=" from-is-to"; fi
mkdir -p "$tmp/plain/notes"
printf 'Notes\n' > "$tmp/plain/notes/My plan.md"
GIT_CEILING_DIRECTORIES=$tmp run --undo "$tmp/plain" 'notes/My plan.md'
if [ "$rc" -eq 0 ] || [ ! -e "$tmp/plain/notes/My plan.md" ]; then
  broken+=" undo-outside-git"
fi
if [ -n "$(git -C "$W2" status --porcelain --ignored --untracked-files=all)" ]; then
  broken+=" written"
fi
err= # the refusals above print messages; the parts named say what failed
if [ -z "$broken" ]; then pass 5; else miss "5 (${broken# })"; fi

# 6. The copy into a plain folder in no repository, as the run's end does:
#    exit 0, no output, and each PATH's copy matches R's.
mkdir -p "$A"
run "$R" "$A" "${P[@]}"
if quiet && same "$A"; then pass 6; else miss 6; fi

exit "$fail"
