#!/usr/bin/env bash
# Test for skills/apply/scripts/sub-skill-check of the sdd plugin. Copies
# the loop's files of the sub-skill directory that
# "SCRIPT --dir" resolves into a plugin tree under a temporary config
# directory, runs the script on fresh copies of that fixture and prints
# "ok <n>" or "FAIL <n>" per case; exits 1 when any case fails.
#
# Usage: bash tests/test-sub-skill-check.sh [SCRIPT]
#   Default SCRIPT: skills/apply/scripts/sub-skill-check in the plugin root,
#   the parent of this script's directory
# The source directory comes from the caller's CLAUDE_CONFIG_DIR; case 4
# points CLAUDE_CONFIG_DIR at a fixture for its own runs only. A first run
# on the fixture (the probe) gives the hash H; every case after it pins
# SUB_SKILL_VERIFIED to "<v> H" except case 7, which tests the script's own
# pin.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
script=${1:-$root/skills/apply/scripts/sub-skill-check}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
unset SUB_SKILL_VERIFIED
fail=0

# Run the script with the given arguments; sets out, err and rc.
run() {
  rc=0
  out=$(bash "$script" "$@" 2>"$tmp/stderr") || rc=$?
  err=$(cat "$tmp/stderr")
}
quiet() { [ "$rc" -eq 0 ] && [ -z "$err" ]; } # the last run: exit 0, no stderr
pass() { echo "ok $1"; }
miss() { echo "FAIL $1${err:+: $err}"; fail=1; }
# True when the two files differ (cmp exits 1), so a change has applied.
differs() {
  local r=0
  cmp -s -- "$1" "$2" || r=$?
  [ "$r" -eq 1 ]
}

src=$(bash "$script" --dir) || { echo "FAIL setup: $script --dir resolved no directory"; exit 1; }
v=$(jq -r '.version' "$src/../../.claude-plugin/plugin.json")
v_re=${v//./\\.}
tail=plugins/cache/superpowers-marketplace/superpowers/$v
sub=$tail/skills/subagent-driven-development

# The fixture: a config directory holding the copied plugin.json, the
# sub-skill directory and code-reviewer.md, plus a sibling skill.
fixture=$tmp/fixture
mkdir -p "$fixture/$tail/.claude-plugin" "$fixture/$tail/skills/requesting-code-review" \
  "$fixture/$tail/skills/brainstorming"
cp -- "$src/../../.claude-plugin/plugin.json" "$fixture/$tail/.claude-plugin/"
cp -r -- "$src" "$fixture/$sub"
cp -- "$src/../requesting-code-review/code-reviewer.md" "$fixture/$tail/skills/requesting-code-review/"
printf 'A sibling skill outside the loop.\n' > "$fixture/$tail/skills/brainstorming/SKILL.md"

# Copy the fixture to a fresh config directory NAME; sets cfg and dir (its
# sub-skill directory).
fresh() {
  cfg=$tmp/$1
  cp -r -- "$fixture" "$cfg"
  dir=$cfg/$sub
}

# The probe: H is the hash field of its first line; its verdict is not
# checked.
run "$fixture/$sub"
hash_re="^Sub-skill: [^ ]+ loop ([0-9a-f]{12}) "
[[ $out =~ $hash_re ]] || { echo "FAIL setup: no hash in the probe's output: $out"; exit 1; }
H=${BASH_REMATCH[1]}
export SUB_SKILL_VERIFIED="$v $H"
verified="^Sub-skill: $v_re loop $H verified\$"

# 1. The fixture: one verified line, exit 0, nothing on stderr; the same with
#    a trailing slash and through a symlink to the config directory. A
#    failure names its part.
broken=
fresh c1
run "$dir"
quiet && [[ $out =~ $verified ]] || broken+=" plain"
run "$dir/"
quiet && [[ $out =~ $verified ]] || broken+=" slash"
ln -s c1 "$tmp/link"
run "$tmp/link/$sub"
[ -L "$tmp/link" ] && quiet && [[ $out =~ $verified ]] || broken+=" symlink"
if [ -z "$broken" ]; then pass 1; else miss "1 (${broken# })"; fi

# 2. A change inside the loop's files: an unverified first line with a hash
#    other than H, and a warning line naming the verified version. A failure
#    names its part.
unverified="^Sub-skill: $v_re loop ([0-9a-f]{12}) unverified \\(verified: $v_re $H\\)\$"
# Check the last run against the unverified form.
flagged() {
  local first second
  first=$(sed -n 1p <<<"$out")
  second=$(sed -n 2p <<<"$out")
  quiet && [ "$(wc -l <<<"$out")" -eq 2 ] && [[ $first =~ $unverified ]] &&
    [ "${BASH_REMATCH[1]}" != "$H" ] && [[ $second == *"$v"* ]]
}
broken=
fresh c2-template
printf 'x' >> "$dir/implementer-prompt.md"
run "$dir"
differs "$fixture/$sub/implementer-prompt.md" "$dir/implementer-prompt.md" && flagged ||
  broken+=" template"
fresh c2-added
mkdir -p "$dir/references"
printf 'An added reference.\n' > "$dir/references/extra.md"
run "$dir"
[ -f "$dir/references/extra.md" ] && flagged || broken+=" added"
fresh c2-reviewer
reviewer=$tail/skills/requesting-code-review/code-reviewer.md
printf 'x' >> "$cfg/$reviewer"
run "$dir"
differs "$fixture/$reviewer" "$cfg/$reviewer" && flagged || broken+=" reviewer"
# The new name sorts where the old one did, so a hash of the contents
# alone would not change.
fresh c2-renamed
mv -- "$dir/implementer-prompt.md" "$dir/implementer-prompt-renamed.md"
run "$dir"
[ -f "$dir/implementer-prompt-renamed.md" ] && [ ! -e "$dir/implementer-prompt.md" ] &&
  ! differs "$fixture/$sub/implementer-prompt.md" "$dir/implementer-prompt-renamed.md" &&
  flagged || broken+=" renamed"
if [ -z "$broken" ]; then pass 2; else miss "2 (${broken# })"; fi

# 3. A change in a sibling skill outside the loop: case 1's line.
fresh c3
printf 'x' >> "$cfg/$tail/skills/brainstorming/SKILL.md"
run "$dir"
if differs "$fixture/$tail/skills/brainstorming/SKILL.md" "$cfg/$tail/skills/brainstorming/SKILL.md" &&
   quiet && [[ $out =~ $verified ]]; then pass 3; else miss 3; fi

# 4. No argument, CLAUDE_CONFIG_DIR at the fixture: the user-scope entry wins
#    over a project-scope entry listed first; with the project entry alone,
#    the unknown line and exit 2, and --dir exits 2 with its reason on
#    stderr. A failure names its part.
broken=
fresh c4
plugins=$cfg/plugins/installed_plugins.json
project=$(jq -n --arg p "$cfg/$tail-absent" '{scope: "project", projectPath: "/absent", installPath: $p}')
user=$(jq -n --arg p "$cfg/$tail" --arg v "$v" '{scope: "user", installPath: $p, version: $v}')
jq -n --argjson a "$project" --argjson b "$user" \
  '{version: 2, plugins: {"superpowers@superpowers-marketplace": [$a, $b]}}' > "$plugins"
[ -f "$plugins" ] || broken+=" written"
CLAUDE_CONFIG_DIR=$cfg run
quiet && [[ $out =~ $verified ]] || broken+=" user"
CLAUDE_CONFIG_DIR=$cfg run --dir
quiet && [ "$out" = "$dir" ] || broken+=" dir"
jq -n --argjson a "$project" \
  '{version: 2, plugins: {"superpowers@superpowers-marketplace": [$a]}}' > "$plugins"
CLAUDE_CONFIG_DIR=$cfg run
[ "$rc" -eq 2 ] && [[ $out =~ ^Sub-skill:\ unknown\ \(.+\)$ ]] || broken+=" project-only"
CLAUDE_CONFIG_DIR=$cfg run --dir
[ "$rc" -eq 2 ] && [ -z "$out" ] && [ -n "$err" ] || broken+=" dir-project-only"
err= # the last run's stderr is its expected reason, not a failure's
if [ -z "$broken" ]; then pass 4; else miss "4 (${broken# })"; fi

# 5. A directory that does not exist: the unknown line, exit 2.
run "$tmp/absent/skills/subagent-driven-development"
if [ "$rc" -eq 2 ] && [[ $out =~ ^Sub-skill:\ unknown\ \(.+\)$ ]]; then pass 5; else miss 5; fi

# 6. plugin.json removed: the version reads unknown, the hash still H.
fresh c6
rm -- "$cfg/$tail/.claude-plugin/plugin.json"
run "$dir"
if [ ! -e "$cfg/$tail/.claude-plugin/plugin.json" ] && quiet &&
   [[ $out =~ ^Sub-skill:\ unknown\ loop\ $H\ verified$ ]]; then pass 6; else miss 6; fi

# 7. The pin is current: without SUB_SKILL_VERIFIED, the copy --dir resolves
#    prints one verified line with the fixture's hash.
unset SUB_SKILL_VERIFIED
run "$src"
if quiet && [[ $out =~ $verified ]]; then pass 7; else miss 7; fi

exit "$fail"
