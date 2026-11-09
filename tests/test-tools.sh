#!/usr/bin/env bash
# Test for the transcript tools in tools/ of the sdd plugin: they take the
# private skill's agent names (app-sdd-<role>), the plugin's (sdd:<role>) and
# the name fallback's (sdd-<role>) alike, and the skill name
# app-subagent-apply or sdd:apply. Builds session transcripts in the layout
# tools/README.md describes (<project-dir>/<session-id>.jsonl, and the
# subagent pairs agent-<id>.jsonl and agent-<id>.meta.json under
# <session-id>/subagents/) in a temporary directory, removed on exit, runs
# the tools on them with python3 -I and prints "ok <n>" or "FAIL <n>" per
# case; exits 1 when any case fails.
#
# Cases 1 and 2 are the plan's: three unit controllers, one per name form,
# each opening with "You run one unit", roll up in transcript-roles.py as one
# unit-controller row of 3 and no other row; transcript-clock.py --skill
# sdd:apply exits 0 on that session. Cases 3 to 6 fail on the record's tools
# as they were before the widening: 3, nine subagents (the three roles in the
# three forms) whose opening words match no head rule take their role from
# the sidecar alone; 4, transcript-clock.py finds the run of a timestamped
# session whose controller invokes sdd:apply and dispatches
# sdd:unit-controller, names it after the skill's argument and counts one
# unit; 5, the same with --skill naming another skill, which adds to the two
# names, and that skill's own run beside it; 6, transcript-tokens.py counts
# the sdd:apply invocation as a skill mention.
#
# Usage: bash tests/test-tools.sh
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
p=$tmp/proj
mkdir -p "$p"
usage='"usage": {"input_tokens": 1, "output_tokens": 1, "cache_read_input_tokens": 1, "cache_creation_input_tokens": 1}'
fail=0

# Run tools/TOOL with the given arguments; sets out, err and rc.
run() {
  rc=0
  out=$(python3 -I "$root/tools/$1" "${@:2}" 2>"$tmp/stderr") || rc=$?
  err=$(cat "$tmp/stderr")
}
# The roll-up rows of the last transcript-roles.py run, "<role> <n>" each.
rows() { awk 'NF == 7 && $2 ~ /^[0-9]+$/ { print $1, $2 }' <<< "$out"; }
pass() { echo "ok $1"; }
miss() { echo "FAIL $1: rc=$rc; ${out//$'\n'/ | }${err:+; stderr: $err}"; fail=1; }
# Subagent pair ID of session SESSION (its path without .jsonl): the
# transcript holds the lines on stdin, the sidecar names agent type TYPE.
pair() {
  mkdir -p "$1/subagents"
  cat > "$1/subagents/agent-$2.jsonl"
  printf '{"agentType": "%s", "description": "unit"}\n' "$3" > "$1/subagents/agent-$2.meta.json"
}

# The plan's session: one assistant line whose usage fields are all 1, and
# three unit controllers, one per agent name form.
units=$p/aaaaaaaa-units
printf '{"type": "assistant", "message": {"model": "m", %s, "content": []}}\n' "$usage" > "$units.jsonl"
i=0
for t in app-sdd-unit-controller sdd:unit-controller sdd-unit-controller; do
  i=$((i + 1))
  pair "$units" "u$i" "$t" <<< '{"type": "user", "message": {"role": "user", "content": "You run one unit"}}'
done

# 1. The three roll up as one unit-controller row of 3, and no other row.
run transcript-roles.py "$units.jsonl"
if [ "$rc" -eq 0 ] && [ "$(rows)" = 'unit-controller 3' ]; then pass 1; else miss 1; fi

# 2. The clock on the same session, --skill sdd:apply: exit 0.
run transcript-clock.py --skill sdd:apply "$units.jsonl"
if [ "$rc" -eq 0 ]; then pass 2; else miss 2; fi

# 3. Nine subagents, unit-controller, implementer and reviewer in the three
#    forms, opening with words no head rule matches: the role comes from the
#    sidecar alone (a reviewer described "unit" is a task review), 3 each,
#    and no other row.
roles=$p/bbbbbbbb-roles
printf '{"type": "assistant", "message": {"model": "m", %s, "content": []}}\n' "$usage" > "$roles.jsonl"
i=0
for r in unit-controller implementer reviewer; do
  for f in app-sdd- sdd: sdd-; do
    i=$((i + 1))
    pair "$roles" "r$i" "$f$r" <<< '{"type": "user", "message": {"role": "user", "content": "Read the brief first."}}'
  done
done
run transcript-roles.py "$roles.jsonl"
if [ "$rc" -eq 0 ] && [ "$(rows)" = $'implementer 3\ntask-review 3\nunit-controller 3' ]; then
  pass 3; else miss 3; fi

# A timestamped session: the controller invokes sdd:apply with the argument
# fixture-plan and dispatches one sdd:unit-controller, whose pair follows; a
# turn end closes the run. Neither the prompt nor the dispatch names a file,
# so only the skill's argument can name the run.
clock=$p/cccccccc-clock
cat > "$clock.jsonl" <<EOF
{"type": "user", "timestamp": "2026-11-09T10:00:00Z", "message": {"role": "user", "content": "Apply the plan."}}
{"type": "assistant", "timestamp": "2026-11-09T10:00:05Z", "message": {"model": "m", $usage, "content": [{"type": "tool_use", "id": "t1", "name": "Skill", "input": {"skill": "sdd:apply", "args": "fixture-plan"}}]}}
{"type": "assistant", "timestamp": "2026-11-09T10:01:00Z", "message": {"model": "m", $usage, "content": [{"type": "tool_use", "id": "t2", "name": "Agent", "input": {"subagent_type": "sdd:unit-controller", "description": "unit", "prompt": "You run one unit."}}]}}
{"type": "system", "subtype": "turn_duration", "timestamp": "2026-11-09T10:06:00Z", "durationMs": 360000}
EOF
pair "$clock" c1 sdd:unit-controller <<'EOF'
{"type": "user", "timestamp": "2026-11-09T10:01:01Z", "message": {"role": "user", "content": "You run one unit."}}
{"type": "assistant", "timestamp": "2026-11-09T10:05:00Z", "message": {"model": "m", "content": [{"type": "text", "text": "complete"}]}}
EOF
# The clock's line for that run.
want='proj cccccccc fixture-plan: *; units 1, dispatches 1, *'

# 4. Without --skill: one run, named after the skill's argument (the run was
#    found from the sdd:apply call, not from the dispatch), with one unit.
run transcript-clock.py "$clock.jsonl"
# shellcheck disable=SC2053
if [ "$rc" -eq 0 ] && [[ $out != *$'\n'* && $out == $want ]]; then pass 4; else miss 4; fi

# 5. --skill other-skill on that session and on one that invokes other-skill
#    alone: both runs, the sdd:apply one as in case 4.
other=$p/dddddddd-other
cat > "$other.jsonl" <<EOF
{"type": "assistant", "timestamp": "2026-11-09T11:00:00Z", "message": {"model": "m", $usage, "content": [{"type": "tool_use", "id": "t3", "name": "Skill", "input": {"skill": "other-skill", "args": "other-plan"}}]}}
{"type": "assistant", "timestamp": "2026-11-09T11:02:00Z", "message": {"model": "m", $usage, "content": [{"type": "text", "text": "done"}]}}
EOF
run transcript-clock.py --skill other-skill "$clock.jsonl" "$other.jsonl"
# shellcheck disable=SC2053
if [ "$rc" -eq 0 ] && [ "$(wc -l <<< "$out")" -eq 2 ] && [[ ${out%%$'\n'*} == $want ]] &&
   [[ ${out#*$'\n'} == 'proj dddddddd other-plan: '* ]]; then pass 5; else miss 5; fi

# 6. The tokens tool counts the one line that names sdd:apply, the Skill call.
run transcript-tokens.py "$clock.jsonl"
if [ "$rc" -eq 0 ] && [[ $out == *' skill-mentions=1  Agent calls=1'* ]]; then pass 6; else miss 6; fi

exit "$fail"
