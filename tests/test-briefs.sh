#!/usr/bin/env bash
# Test for the unit's list file of the sdd plugin: the two brief scripts
# (skills/apply/scripts/openspec-section-brief and task-brief) seed it, and
# bin/sdd-files-add grows it. Builds a temporary git repository with
# committed bin/report, an OpenSpec change add-export (proposal.md and
# tasks.md) and docs/plan.md, runs the scripts from its root and prints
# "ok <n>" or "FAIL <n>: <what was found>" per case; exits 1 when any case
# fails. Case 7 adds docs/plan-list.md and tests/a.sh to the work tree,
# uncommitted.
#
# Usage: bash tests/test-briefs.sh
# The scripts are the ones in the plugin root, the parent of this script's
# directory. The temporary commit goes through the configured signing setup.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
scripts=$root/skills/apply/scripts
add=$root/bin/sdd-files-add
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
repo=$tmp/repo
W=$tmp/ws
mkdir "$W"
fail=0
block='**Files:** the paths this section names. The section may need others; your report names every file you change.'

# Run a command from the repository root; sets out, err and rc.
run() {
  rc=0
  out=$({ cd "$repo" && "$@"; } 2>"$tmp/stderr") || rc=$?
  err=$(cat "$tmp/stderr")
}
# FILE's bytes on one line, newlines shown as \n and CRs as \r, or <none>
# when it does not exist.
show() {
  if [ -f "$1" ]; then
    local s
    s=$(cat -- "$1"; echo .)
    s=${s%.}
    s=${s//$'\r'/\\r}
    printf '%s' "${s//$'\n'/\\n}"
  elif [ -e "$1" ]; then
    printf '<not a file>'
  else
    printf '<none>'
  fi
}
# FILE holds exactly the given lines, each ended by a newline.
holds() {
  local file=$1
  shift
  [ -f "$file" ] && cmp -s -- <(printf '%s\n' "$@") "$file"
}
# What the last run left: its status, stdout and stderr.
found() { printf 'rc %s, out [%s], err [%s]' "$rc" "$out" "$err"; }
pass() { echo "ok $1"; }
miss() { echo "FAIL $1: $2"; fail=1; }

mkdir -p "$repo/bin" "$repo/openspec/changes/add-export" "$repo/docs"
printf 'report\n' > "$repo/bin/report"
printf '# Add export\n' > "$repo/openspec/changes/add-export/proposal.md"
cat > "$repo/openspec/changes/add-export/tasks.md" <<'EOF'
# Tasks

## 1. Export
- [ ] 1.1 Add a CSV export to `bin/report`

## 2. Docs
- [ ] 2.1 Describe the export
EOF
cat > "$repo/docs/plan.md" <<'EOF'
### Task 1: Export

**Files:**
- Create: `bin/export.sh`, `tests/*.sh`
- Modify: `bin/report:12-30` (the `"mode": "csv"` key), `Makefile`, `docs/My notes.md`

- [ ] **Step 1: Write it**
EOF
git init -q -b main "$repo"
git -C "$repo" add -- bin/report openspec docs
git -C "$repo" commit -q -m "Add the fixture files"

# 1. Section 1 names bin/report: the brief holds the block's two lines, then
#    a blank line, just before the section heading; the list holds the path;
#    the stdout line is the one the script printed before the list existed.
brief=$W/section-1-brief.md list=$W/section-1-files.txt
run bash "$scripts/openspec-section-brief" add-export 1 "$brief"
before=$(awk '$0 == "## 1. Export" { printf "%s\n%s\n%s.", a, b, c; exit }
  { a = b; b = c; c = $0 }' "$brief" 2>/dev/null || true)
# shellcheck disable=SC2016 # the backticks are Markdown, not a command
want=$(printf '%s\n%s\n.' "$block" '- `bin/report`')
if [ "$rc" -eq 0 ] && [ -z "$err" ] &&
   [[ $out =~ ^"wrote $brief: "[0-9]+" lines, 1 open items, 0 done or deferred"$ ]] &&
   [ "$before" = "$want" ] && holds "$list" bin/report; then
  pass 1
else
  miss 1 "$(found); lines before the heading [${before//$'\n'/\\n}]; list [$(show "$list")]"
fi

# 2. Section 2 names nothing: no block in the brief, and an empty list.
brief=$W/section-2-brief.md list=$W/section-2-files.txt
run bash "$scripts/openspec-section-brief" add-export 2 "$brief"
blocks=$(awk 'index($0, "**Files:**") == 1 { n++ } END { print n + 0 }' "$brief" 2>/dev/null || true)
if [ "$rc" -eq 0 ] && [ -z "$err" ] && [ "$blocks" = 0 ] &&
   [ -f "$list" ] && [ ! -s "$list" ]; then
  pass 2
else
  miss 2 "$(found); **Files:** lines in the brief [$blocks]; list [$(show "$list")]"
fi

# 3. A list already holding a path keeps it, and section 1 run again adds
#    its own path after it.
list=$W/section-1-files.txt
printf 'extra/kept.txt\n' > "$list"
run bash "$scripts/openspec-section-brief" add-export 1 "$W/section-1-brief.md"
if [ "$rc" -eq 0 ] && [ -z "$err" ] && holds "$list" extra/kept.txt bin/report; then
  pass 3
else
  miss 3 "$(found); list [$(show "$list")]"
fi

# 4. The plan task's **Files:** block: the glob and the quoted fragment are
#    left out, the line suffix dropped, the spaced path kept as written.
brief=$W/task-1-brief.md list=$W/task-1-files.txt
run bash "$scripts/task-brief" docs/plan.md 1 "$brief"
if [ "$rc" -eq 0 ] && [ -z "$err" ] &&
   [[ $out =~ ^"wrote $brief: "[0-9]+" lines"$ ]] &&
   holds "$list" bin/export.sh bin/report Makefile 'docs/My notes.md'; then
  pass 4
else
  miss 4 "$(found); list [$(show "$list")]"
fi

# 5. A section that does not exist: exit 3, and neither brief nor list.
run bash "$scripts/openspec-section-brief" add-export 9 "$W/section-9-brief.md"
if [ "$rc" -eq 3 ] && [ -z "$out" ] && [ -n "$err" ] &&
   [ ! -e "$W/section-9-brief.md" ] && [ ! -e "$W/section-9-files.txt" ]; then
  pass 5
else
  miss 5 "$(found); list [$(show "$W/section-9-files.txt")]"
fi

# 6. sdd-files-add on its own. Each part names itself when it fails, with
#    what it found. A run that adds exits 0 and prints nothing; a refused
#    run exits 2, prints only on stderr and writes nothing.
six=$W/six
mkdir "$six"
broken=
# The last run exited 0 and printed nothing.
quiet() { [ "$rc" -eq 0 ] && [ -z "$out" ] && [ -z "$err" ]; }
# The last run was quiet, and LIST (the first argument) holds exactly the
# remaining lines.
added() { quiet && holds "$@"; }
# The last run was refused, and FILE, when given, does not exist.
refused() {
  [ "$rc" -eq 2 ] && [ -z "$out" ] && [ -n "$err" ] && { [ $# -eq 0 ] || [ ! -e "$1" ]; }
}
# Record part NAME as broken, with the last run's result and FILE's bytes.
broke() { broken+=" $1 ($(found); list [$(show "$2")])"; }

l=$six/twice.txt
run "$add" "$l" 'docs/My notes.md' a.txt 'docs/My notes.md'
added "$l" 'docs/My notes.md' a.txt || broke twice "$l"

l=$six/no-newline.txt
printf 'x.txt' > "$l"
run "$add" "$l" y.txt
added "$l" x.txt y.txt || broke no-final-newline "$l"

# A CRLF list file given with --list: its lines without CR, the blank one
# skipped.
l=$six/from-crlf.txt
printf 'p.txt\r\n\r\nq.txt\r\n' > "$six/crlf.txt"
run "$add" "$l" --list "$six/crlf.txt"
added "$l" p.txt q.txt || broke crlf-list-file "$l"

# A CRLF LIST given its own line, an empty and a blank path: nothing is
# added, and LIST's bytes stay as they were.
l=$six/crlf-list.txt
printf 'x.txt\r\n' > "$l"
run "$add" "$l" x.txt '' ' '
{ quiet && cmp -s -- <(printf 'x.txt\r\n') "$l"; } || broke crlf-list-kept "$l"

l=$six/none/list.txt
run "$add" "$l" a.txt
refused "$six/none" || broke missing-folder "$l"

run "$add"
refused || broke no-argument ''

l=$six/refused.txt
run "$add" --list "$six/crlf.txt"
refused || broke list-first "$l"
run "$add" "$l" a.txt --list
refused "$l" || broke list-without-file "$l"
run "$add" "$l" a.txt --list "$six/missing.txt"
refused "$l" || broke missing-list-file "$l"
run "$add" "$l" a.txt --list "$six"
refused "$l" || broke directory-list-file "$l"
run "$add" "$six" a.txt
refused || broke directory-as-list ''

if [ -z "$broken" ]; then pass 6; else miss 6 "${broken# }"; fi

# 7. `--` ends sdd-files-add's options, so a path that reads like an option
#    is still a path. A plan's **Files:** block naming `--list` (a span
#    decision 2 keeps) lists it as written, followed by the next span, and
#    never reads that file's lines into the list. Each part names itself
#    when it fails.
broken=
seven=$W/seven
mkdir "$seven" "$repo/tests"
printf 'line one\n#!/usr/bin/env bash\n' > "$repo/tests/a.sh"
cat > "$repo/docs/plan-list.md" <<'EOF'
### Task 1: Checkpoint

**Files:**
- Modify: `bin/sdd-checkpoint` (new `--list` mode), `tests/a.sh`
EOF
brief=$seven/task-1-brief.md l=$seven/task-1-files.txt
run bash "$scripts/task-brief" docs/plan-list.md 1 "$brief"
{ [ "$rc" -eq 0 ] && [ -z "$err" ] && [[ $out =~ ^"wrote $brief: "[0-9]+" lines"$ ]] &&
  holds "$l" bin/sdd-checkpoint --list tests/a.sh; } || broke plan-span "$l"

# After the marker, --list and a second -- are paths.
l=$seven/marker.txt
run "$add" "$l" a.txt -- --list -- b.txt
added "$l" a.txt --list -- b.txt || broke marker "$l"

# --list before the marker is still the option.
l=$seven/list-then-marker.txt
printf 'p.txt\n' > "$seven/in.txt"
run "$add" "$l" --list "$seven/in.txt" -- --list
added "$l" p.txt --list || broke list-then-marker "$l"

# A first argument of -- is no LIST.
run "$add" -- a.txt
refused "$repo/--" || broke marker-as-list "$repo/--"

if [ -z "$broken" ]; then pass 7; else miss 7 "${broken# }"; fi

exit "$fail"
