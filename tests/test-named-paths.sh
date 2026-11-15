#!/usr/bin/env bash
# Test for skills/apply/scripts/named-paths of the sdd plugin. Builds a
# temporary git repository with committed bin/report, src/app.php,
# README.md, tests/unit/a.txt and Makefile, runs the script on Markdown
# inputs and prints "ok <name>" or "FAIL <name>" per case; exits 1 when any
# case fails.
#
# Usage: bash tests/test-named-paths.sh [SCRIPT]
#   Default SCRIPT: skills/apply/scripts/named-paths in the plugin root, the
#   parent of this script's directory
# The temporary commit goes through the configured signing setup. The
# errors case runs from a folder in no repository: a folder of the
# temporary directory, with GIT_CEILING_DIRECTORIES set to that directory
# so a repository around it is never found.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
script=${1:-$root/skills/apply/scripts/named-paths}
[[ $script == /* ]] || script=$PWD/$script
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
repo=$tmp/repo
in=$tmp/in.md
fail=0

# Run the script from folder DIR with the remaining arguments; sets out, err
# and rc.
run() {
  local dir=$1
  shift
  rc=0
  out=$({ cd "$dir" && bash "$script" "$@"; } 2>"$tmp/stderr") || rc=$?
  err=$(cat "$tmp/stderr")
}
pass() { echo "ok $1"; }
miss() { echo "FAIL $1${err:+: $err}"; fail=1; }
# Case NAME passes when the last run exited 0, printed EXPECTED and wrote
# nothing on stderr.
expect() {
  if [ "$rc" -eq 0 ] && [ "$out" = "$2" ] && [ -z "$err" ]; then
    pass "$1"; else miss "$1"; fi
}
# The last run was refused: exit 2, nothing on stdout, a message on stderr.
refused() { [ "$rc" -eq 2 ] && [ -z "$out" ] && [ -n "$err" ]; }
# Write one checkbox line naming SPAN between backticks to the input file.
item() {
  # shellcheck disable=SC2016 # the backticks are Markdown, not a command
  printf -- '- [ ] 1.1 Edit `%s`\n' "$1" > "$in"
}
# Case NAME: the item naming SPAN, run from the repository root, prints
# EXPECTED (empty for a dropped span).
span() {
  item "$2"
  run "$repo" "$in"
  expect "$1" "$3"
}

files=(bin/report src/app.php README.md tests/unit/a.txt Makefile)
git init -q -b main "$repo"
mkdir -p "$repo/bin" "$repo/src" "$repo/tests/unit"
for f in "${files[@]}"; do printf '%s\n' "$f" > "$repo/$f"; done
git -C "$repo" add -- "${files[@]}"
git -C "$repo" commit -q -m "Add the fixture files"

span kept-file        'bin/report'                'bin/report'
span kept-new         'tests/export.bats'         'tests/export.bats'
span kept-range       'src/app.php:12-30'         'src/app.php'
span kept-line        'src/app.php:7'             'src/app.php'
span kept-dot         './README.md'               'README.md'
span folder           'tests/unit'                ''
span no-folder        'laravel/horizon'           ''
span no-root-file     'app.name'                  ''
span new-no-folder    'new/dir/file.md'           ''
span space            'two words'                 ''
span trailing-slash   'src/'                      ''
span glob             '*.php'                     ''
span method           'Foo::bar'                  ''
span url              'https://example.com/x.md'  ''
span flag             '--strict'                  ''
# shellcheck disable=SC2016 # the span holds a literal $HOME
span variable         '$HOME/x.sh'                ''
# shellcheck disable=SC2088 # the span holds a literal ~/
span tilde            '~/x.md'                    ''
span absolute         '/etc/hosts'                ''
span scoped           '@scope/pkg.js'             ''
span setting          'APP_ENV=testing'           ''
span bare-name        'Makefile'                  ''

# order: first-seen order, each path once; the bare bin/README.md, which
# would pass the rule in backticks, is not read.
order=$tmp/order.md
# shellcheck disable=SC2016 # the backticks are Markdown, not a command
printf '%s\n' '- [ ] 1.1 `src/app.php` then `bin/report` and `src/app.php` again, and bin/README.md bare' > "$order"
run "$repo" "$order"
expect order $'src/app.php\nbin/report'

# fence: spans inside a ``` fence and a ~~~ fence are code, and so is a
# fence line of the other character inside each, which closes nothing.
fence=$tmp/fence.md
cat > "$fence" <<'EOF'
- [ ] 1.1 Run the report
```bash
run `bin/report`
~~~
still code `bin/report`
```
~~~
edit `src/app.php`
```
still code `src/app.php`
~~~
EOF
run "$repo" "$fence"
expect fence ''

# indented-fence: an indented fence inside a checkbox item is a fence, and
# the span after it closes is read again.
indented=$tmp/indented.md
cat > "$indented" <<'EOF'
- [ ] 1.1 Run the report
  ```bash
  run `bin/report`
  ```
- [ ] 1.2 Edit `src/app.php`
EOF
run "$repo" "$indented"
expect indented-fence src/app.php

# stdin: FILE - reads standard input; the order input prints what the
# order case prints from the file.
run "$repo" - < "$order"
expect stdin $'src/app.php\nbin/report'

# subfolder: run from tests/ of the repository, the disk test still runs
# against the repository root.
item bin/report
run "$repo/tests" "$in"
expect subfolder bin/report

# errors: no argument, two arguments, a missing FILE, and a run from a
# folder in no repository are each refused. A failure names its part.
mkdir "$tmp/none"
item bin/report
broken=
run "$repo"
refused || broken+=" no-argument"
run "$repo" "$in" "$in"
refused || broken+=" two-arguments"
run "$repo" "$tmp/missing.md"
refused || broken+=" missing-file"
GIT_CEILING_DIRECTORIES=$tmp run "$tmp/none" "$in"
refused || broken+=" no-repository"
if [ -z "$broken" ]; then pass errors; else miss "errors (${broken# })"; fi

exit "$fail"
