#!/usr/bin/env bash
# Size check for skills/apply/SKILL.md of the sdd plugin. After a
# compaction the harness re-attaches an invoked or
# preloaded skill cut at 20,000 characters: the frontmatter is not
# re-attached, while the "Base directory for this skill:" line and, when the
# text does not fit, a 98-character truncation note are. The record
# repository (akalongman/claude-subagent-apply, private) holds the evidence:
# decision 23 in its docs/decisions.md, and the re-attach shape measured in
# its docs/superpowers/specs/2026-10-23-sub-skill-upgrade-content-pin-design.md.
# The 19,500 limit leaves room for that line and that note. Characters are
# counted with LC_ALL=C.UTF-8 wc -m, so a multibyte character counts once.
#
# Usage: bash tests/check-skill-size.sh [FILE] [LIMIT]
#   FILE   defaults to skills/apply/SKILL.md in the plugin root, the parent
#          of this script's directory
#   LIMIT  defaults to 19500
# The count is taken on a temporary copy of FILE, removed on exit, in which
# every ${CLAUDE_PLUGIN_ROOT} is replaced with a 120-character stand-in path
# (/home/u/.claude/plugins/cache/akalongman/sdd/0.1.0 with x characters
# appended up to 120) and every ${CLAUDE_SKILL_DIR} with that path plus
# /skills/apply, since the compaction cut falls on the substituted text.
# Prints "ok <n>/<limit> (substituted)" and exits 0 below the limit; prints
# "FAIL <n>/<limit> (substituted)" and exits 1 at or over it, <n> being the
# count of the copy. Exit 2 on a missing FILE.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
file=${1:-$root/skills/apply/SKILL.md}
limit=${2:-19500}
[ -f "$file" ] || { echo "usage: bash tests/check-skill-size.sh [FILE] [LIMIT]" >&2; exit 2; }
stand=/home/u/.claude/plugins/cache/akalongman/sdd/0.1.0
while [ "${#stand}" -lt 120 ]; do stand+=x; done
copy=$(mktemp)
trap 'rm -f "$copy"' EXIT
LC_ALL=C sed -e 's|[$]{CLAUDE_PLUGIN_ROOT}|'"$stand"'|g' \
  -e 's|[$]{CLAUDE_SKILL_DIR}|'"$stand"'/skills/apply|g' "$file" > "$copy"
n=$(LC_ALL=C.UTF-8 wc -m < "$copy")
n=${n//[[:space:]]/}
if [ "$n" -lt "$limit" ]; then
  echo "ok $n/$limit (substituted)"
else
  echo "FAIL $n/$limit (substituted)"
  exit 1
fi
