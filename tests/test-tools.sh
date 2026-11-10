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
# sdd:apply exits 0 on that session. Cases 3 to 6 fail on the record
# repository's (akalongman/claude-subagent-apply, private) tools as they were
# before the widening: 3, nine subagents (the three roles in the
# three forms) whose opening words match no head rule take their role from
# the sidecar alone; 4, transcript-clock.py finds the run of a timestamped
# session whose controller invokes sdd:apply and dispatches
# sdd:unit-controller, names it after the skill's argument and counts one
# unit; 5, the same with --skill naming another skill, which adds to the two
# names, and that skill's own run beside it; 6, transcript-tokens.py counts
# the sdd:apply invocation as a skill mention. Cases 7 to 9 hold the prefix
# rule and the old names: 7, three subagents whose sidecars name a bare
# unit-controller, implementer or reviewer, opening with words no head rule
# matches, take no sdd role in transcript-roles.py; 8, transcript-clock.py
# finds the run of a session whose controller invokes app-subagent-apply and
# dispatches app-sdd-unit-controller and sdd-unit-controller, names it after
# the skill's argument and counts two units; 9, transcript-tokens.py counts
# that app-subagent-apply invocation as a skill mention. Cases 10 to 13 hold
# the head rules beside the bare names: 10, three subagents whose sidecars
# name a bare unit-controller, implementer or reviewer and whose prompts
# open with that role's head ("You run one unit", "You are implementing",
# "You are reviewing") take no sdd role in transcript-roles.py; 11, three
# whose sidecars name general-purpose and whose prompts open with the same
# three heads keep the roles the head rules give them there,
# unit-controller, implementer and task-review; 12, in a run without unit
# controllers, transcript-clock.py counts as a unit the general-purpose
# subagent opening "You are implementing" and neither the bare
# unit-controller, implementer and reviewer opening the same words (the
# clock reads no unit controller from a prompt head, and its reviewer role
# reaches no printed field, so the implementer head is the one under which
# a bare name shows) nor a general-purpose one opening "You are reviewing";
# 13, transcript-clock.py takes unit-controller only from a prefixed type,
# so of three general-purpose subagents it counts the one opening "You run
# one unit" as other, and in a run without unit controllers the two
# opening "You are implementing" as its units. Case 14 holds the letter
# case: both tools read an agent type case-insensitively, so of three
# subagents whose sidecars name SDD:Implementer (opening with words no head
# rule matches), Explore (opening "You are implementing") and Reviewer
# (opening "You are reviewing"), transcript-roles.py counts two
# implementers and one other, and transcript-clock.py, on the same session
# with one dispatch of each of the first two types, counts units 2 and
# dispatches 1.
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

# 7. Three subagents whose sidecars name the bare types unit-controller,
#    implementer and reviewer (a project's own agents of those names), under
#    opening words no head rule matches: a bare type is no sdd role, so the
#    three count as other, 3, and no other row.
bare=$p/eeeeeeee-bare
printf '{"type": "assistant", "message": {"model": "m", %s, "content": []}}\n' "$usage" > "$bare.jsonl"
i=0
for r in unit-controller implementer reviewer; do
  i=$((i + 1))
  pair "$bare" "b$i" "$r" <<< '{"type": "user", "message": {"role": "user", "content": "Read the brief first."}}'
done
run transcript-roles.py "$bare.jsonl"
if [ "$rc" -eq 0 ] && [ "$(rows)" = 'other 3' ]; then pass 7; else miss 7; fi

# A timestamped session in the old names: the controller invokes
# app-subagent-apply with the argument legacy-plan and dispatches one
# app-sdd-unit-controller and one sdd-unit-controller, whose pairs follow; a
# turn end closes the run. As in case 4, only the skill's argument can name
# the run.
legacy=$p/ffffffff-legacy
cat > "$legacy.jsonl" <<EOF
{"type": "user", "timestamp": "2026-11-09T12:00:00Z", "message": {"role": "user", "content": "Apply the plan."}}
{"type": "assistant", "timestamp": "2026-11-09T12:00:05Z", "message": {"model": "m", $usage, "content": [{"type": "tool_use", "id": "t4", "name": "Skill", "input": {"skill": "app-subagent-apply", "args": "legacy-plan"}}]}}
{"type": "assistant", "timestamp": "2026-11-09T12:01:00Z", "message": {"model": "m", $usage, "content": [{"type": "tool_use", "id": "t5", "name": "Agent", "input": {"subagent_type": "app-sdd-unit-controller", "description": "unit", "prompt": "You run one unit."}}]}}
{"type": "assistant", "timestamp": "2026-11-09T12:06:00Z", "message": {"model": "m", $usage, "content": [{"type": "tool_use", "id": "t6", "name": "Agent", "input": {"subagent_type": "sdd-unit-controller", "description": "unit", "prompt": "You run one unit."}}]}}
{"type": "system", "subtype": "turn_duration", "timestamp": "2026-11-09T12:11:00Z", "durationMs": 660000}
EOF
pair "$legacy" l1 app-sdd-unit-controller <<'EOF'
{"type": "user", "timestamp": "2026-11-09T12:01:01Z", "message": {"role": "user", "content": "You run one unit."}}
{"type": "assistant", "timestamp": "2026-11-09T12:05:00Z", "message": {"model": "m", "content": [{"type": "text", "text": "complete"}]}}
EOF
pair "$legacy" l2 sdd-unit-controller <<'EOF'
{"type": "user", "timestamp": "2026-11-09T12:06:01Z", "message": {"role": "user", "content": "You run one unit."}}
{"type": "assistant", "timestamp": "2026-11-09T12:10:00Z", "message": {"model": "m", "content": [{"type": "text", "text": "complete"}]}}
EOF

# 8. The clock without --skill on that session: one run, named after the
#    app-subagent-apply call's argument, with two units and two dispatches.
run transcript-clock.py "$legacy.jsonl"
if [ "$rc" -eq 0 ] && [[ $out != *$'\n'* && $out == 'proj ffffffff legacy-plan: '*'; units 2, dispatches 2, '* ]]; then
  pass 8; else miss 8; fi

# 9. The tokens tool counts the one line that names app-subagent-apply, the
#    Skill call.
run transcript-tokens.py "$legacy.jsonl"
if [ "$rc" -eq 0 ] && [[ $out == *' skill-mentions=1  Agent calls=2'* ]]; then pass 9; else miss 9; fi

# 10. Three subagents whose sidecars name the bare types unit-controller,
#     implementer and reviewer, each opening with its role's head
#     ("You run one unit", "You are implementing", "You are reviewing"),
#     which the head rules read as unit-controller, implementer and
#     task-review: a bare sdd role name is no sdd role whatever the prompt
#     opens with, so the three count as other, 3, and no other row.
bare_head=$p/gggggggg-bare-head
printf '{"type": "assistant", "message": {"model": "m", %s, "content": []}}\n' "$usage" > "$bare_head.jsonl"
declare -A heads=([unit-controller]='You run one unit' [implementer]='You are implementing' [reviewer]='You are reviewing')
i=0
for r in unit-controller implementer reviewer; do
  i=$((i + 1))
  printf '{"type": "user", "message": {"role": "user", "content": "%s"}}\n' "${heads[$r]}" | pair "$bare_head" "g$i" "$r"
done
run transcript-roles.py "$bare_head.jsonl"
if [ "$rc" -eq 0 ] && [ "$(rows)" = 'other 3' ]; then pass 10; else miss 10; fi

# 11. Three subagents whose sidecars name general-purpose, the type the
#     loop's own dispatches ran as before the sdd agents existed, each
#     opening with one of case 10's heads: every unprefixed type but the
#     three bare names keeps transcript-roles.py's head rules, so they
#     count as unit-controller, implementer and task-review, 1 each, and no
#     other row (the clock counts the first as other, case 13).
general=$p/hhhhhhhh-general
printf '{"type": "assistant", "message": {"model": "m", %s, "content": []}}\n' "$usage" > "$general.jsonl"
i=0
for r in unit-controller implementer reviewer; do
  i=$((i + 1))
  printf '{"type": "user", "message": {"role": "user", "content": "%s"}}\n' "${heads[$r]}" | pair "$general" "h$i" general-purpose
done
run transcript-roles.py "$general.jsonl"
if [ "$rc" -eq 0 ] && [ "$(rows)" = $'implementer 1\ntask-review 1\nunit-controller 1' ]; then
  pass 11; else miss 11; fi

# 12. The clock on a timestamped session whose controller invokes sdd:apply
#     with the argument mixed-plan and dispatches no unit controller, so its
#     implementers are its units. Four subagents open "You are implementing":
#     three whose sidecars name a bare unit-controller, implementer or
#     reviewer, and one whose sidecar names general-purpose; a fifth, also
#     general-purpose, opens "You are reviewing". The clock reads no unit
#     controller from a prompt head and prints nothing its reviewer role
#     decides, so the implementer head is the one under which a bare name
#     the clock failed to set apart would show, as an extra unit. Only the
#     general-purpose implementer is one: one run, units 1.
mixed=$p/iiiiiiii-mixed
cat > "$mixed.jsonl" <<EOF
{"type": "assistant", "timestamp": "2026-11-09T13:00:00Z", "message": {"model": "m", $usage, "content": [{"type": "tool_use", "id": "t7", "name": "Skill", "input": {"skill": "sdd:apply", "args": "mixed-plan"}}]}}
{"type": "system", "subtype": "turn_duration", "timestamp": "2026-11-09T13:06:00Z", "durationMs": 360000}
EOF
for t in unit-controller implementer reviewer general-purpose; do
  pair "$mixed" "$t" "$t" <<'EOF'
{"type": "user", "timestamp": "2026-11-09T13:01:00Z", "message": {"role": "user", "content": "You are implementing Task 1."}}
{"type": "assistant", "timestamp": "2026-11-09T13:05:00Z", "message": {"model": "m", "content": [{"type": "text", "text": "done"}]}}
EOF
done
pair "$mixed" general-purpose-review general-purpose <<'EOF'
{"type": "user", "timestamp": "2026-11-09T13:01:00Z", "message": {"role": "user", "content": "You are reviewing Task 1."}}
{"type": "assistant", "timestamp": "2026-11-09T13:05:00Z", "message": {"model": "m", "content": [{"type": "text", "text": "done"}]}}
EOF
run transcript-clock.py "$mixed.jsonl"
if [ "$rc" -eq 0 ] && [[ $out != *$'\n'* && $out == 'proj iiiiiiii mixed-plan: '*'; units 1, dispatches 0, '* ]]; then
  pass 12; else miss 12; fi

# 13. The clock on a timestamped session whose controller invokes sdd:apply
#     with the argument head-plan, and three subagents whose sidecars name
#     general-purpose: one opens case 10's unit-controller head "You run one
#     unit", which transcript-roles.py reads as a unit controller (case 11),
#     and two open "You are implementing". The clock takes unit-controller
#     only from a prefixed type and counts the first as other, so the run
#     has no unit controller and its two implementers are its units: one
#     run, units 2. A head rule that read "You run one unit" as a unit
#     controller would make it units 1.
general_head=$p/jjjjjjjj-general-head
cat > "$general_head.jsonl" <<EOF
{"type": "assistant", "timestamp": "2026-11-09T14:00:00Z", "message": {"model": "m", $usage, "content": [{"type": "tool_use", "id": "t8", "name": "Skill", "input": {"skill": "sdd:apply", "args": "head-plan"}}]}}
{"type": "system", "subtype": "turn_duration", "timestamp": "2026-11-09T14:06:00Z", "durationMs": 360000}
EOF
i=0
for r in unit-controller implementer implementer; do
  i=$((i + 1))
  pair "$general_head" "j$i" general-purpose <<EOF
{"type": "user", "timestamp": "2026-11-09T14:01:00Z", "message": {"role": "user", "content": "${heads[$r]}."}}
{"type": "assistant", "timestamp": "2026-11-09T14:05:00Z", "message": {"model": "m", "content": [{"type": "text", "text": "done"}]}}
EOF
done
run transcript-clock.py "$general_head.jsonl"
if [ "$rc" -eq 0 ] && [[ $out != *$'\n'* && $out == 'proj jjjjjjjj head-plan: '*'; units 2, dispatches 0, '* ]]; then
  pass 13; else miss 13; fi

# 14. Both tools read an agent type case-insensitively. A timestamped
#     session whose controller invokes sdd:apply with the argument case-plan
#     and dispatches one SDD:Implementer and one Explore (the harness's
#     built-in type); three subagents: sidecar SDD:Implementer opening with
#     words no head rule matches, sidecar Explore opening "You are
#     implementing" and sidecar Reviewer opening "You are reviewing".
#     transcript-roles.py counts implementer 2 (SDD:Implementer by its type,
#     Explore by its head) and other 1 (Reviewer, a bare name); the clock
#     finds one run with units 2 and dispatches 1, the prefixed one alone. A
#     clock reading the raw type prints units 1, dispatches 0; one that
#     lowercased inside strip_prefix would read Explore as prefixed and
#     print units 1, dispatches 2.
letter_case=$p/kkkkkkkk-letter-case
cat > "$letter_case.jsonl" <<EOF
{"type": "assistant", "timestamp": "2026-11-09T15:00:00Z", "message": {"model": "m", $usage, "content": [{"type": "tool_use", "id": "t9", "name": "Skill", "input": {"skill": "sdd:apply", "args": "case-plan"}}]}}
{"type": "assistant", "timestamp": "2026-11-09T15:01:00Z", "message": {"model": "m", $usage, "content": [{"type": "tool_use", "id": "t10", "name": "Agent", "input": {"subagent_type": "SDD:Implementer", "description": "unit", "prompt": "Read the brief first."}}]}}
{"type": "assistant", "timestamp": "2026-11-09T15:01:30Z", "message": {"model": "m", $usage, "content": [{"type": "tool_use", "id": "t11", "name": "Agent", "input": {"subagent_type": "Explore", "description": "unit", "prompt": "You are implementing Task 1."}}]}}
{"type": "system", "subtype": "turn_duration", "timestamp": "2026-11-09T15:06:00Z", "durationMs": 360000}
EOF
declare -A openings=([SDD:Implementer]='Read the brief first' [Explore]="${heads[implementer]}" [Reviewer]="${heads[reviewer]}")
i=0
for t in SDD:Implementer Explore Reviewer; do
  i=$((i + 1))
  pair "$letter_case" "k$i" "$t" <<EOF
{"type": "user", "timestamp": "2026-11-09T15:02:00Z", "message": {"role": "user", "content": "${openings[$t]}."}}
{"type": "assistant", "timestamp": "2026-11-09T15:05:00Z", "message": {"model": "m", "content": [{"type": "text", "text": "done"}]}}
EOF
done
run transcript-roles.py "$letter_case.jsonl"
if [ "$rc" -ne 0 ] || [ "$(rows)" != $'implementer 2\nother 1' ]; then
  miss 14
else
  run transcript-clock.py "$letter_case.jsonl"
  if [ "$rc" -eq 0 ] && [[ $out != *$'\n'* && $out == 'proj kkkkkkkk case-plan: '*'; units 2, dispatches 1, '* ]]; then
    pass 14; else miss 14; fi
fi

exit "$fail"
