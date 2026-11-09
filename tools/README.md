# Transcript measurement tools

Six read-only scripts, `python3` with no third party dependencies: two
written for the 2026-09-21 measurement of five real runs, three added on
2026-09-22: `transcript-window.py` counts per response and limits a count
to one phase of a session; `transcript-floors.py` measures the context
around `/clear` and `/compact` and the subagents' starting context;
`transcript-agents.py` tallies each subagent on its own, longest first; and
`transcript-clock.py`, added 2026-10-08, accounts for wall-clock per apply
run. They read session
transcripts in place and print to standard output; they never write to the
transcripts and never copy them anywhere. Transcripts stay private, so the
numbers they produced are quoted in `../README.md` and
`../reviews/2026-09-21-data-brief.md` by session id only.

`transcript-tokens.py` answers "what did this run cost, and where did the
tokens go". `transcript-roles.py` answers "which kind of agent spent them,
and what was the controller doing with its turns". `transcript-window.py`
answers the same first question per API response rather than per transcript
line, for a time window, and adds the controller's context per turn. Decision 1 in
`../docs/decisions.md` records why the review started here instead of with a
second reading of the skill text.

## Transcript layout the scripts expect

Both take one or more session transcripts as arguments and find the
subagents of each one by convention:

```
<project-dir>/<session-id>.jsonl              the session (controller) transcript
<project-dir>/<session-id>/subagents/agent-*.jsonl   one file per dispatched subagent
```

Each line is a JSON object; malformed lines are skipped rather than
aborting the run. The session id is taken by stripping the last six
characters of the file name, so the argument must end in `.jsonl`.
An assistant line carries `message.model` and `message.usage` with
`input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`
and `output_tokens`.

## transcript-tokens.py

```
python3 tools/transcript-tokens.py <project-dir>/<session-id>.jsonl [...]
```

Per session it prints: the timestamp span, how many lines mention the skill
name `app-subagent-apply` or `sdd:apply`, and the number of dispatch calls;
a per model table for the controller with turns, input, cache creation,
cache read and output tokens; one line per dispatch with its description,
requested model, subagent type and prompt length in characters; one block
per subagent file with its size, span, the first 90 characters of its first
user message and its own per model table; and a grand total over the
controller and all subagents.

The prompt length column is what showed dispatch prompts growing from 4.3k
to 13k characters in session eaa670bb
(`../reviews/2026-09-21-data-brief.md`).

Caveats:

- The docstring claims subagents are labelled from the dispatch description
  in the parent transcript. The code does not join them: dispatch calls and
  subagent files are printed as two independent lists, and matching a file
  to a dispatch is done by eye on the prompt head.
- The usage line in the docstring names `tokens.py`, an earlier file name.
- Every assistant line counts as a turn, and a line with no `message.model`
  is bucketed under `?`. Rows the harness writes for a failed dispatch are
  therefore counted, not filtered; the failure fixture in
  `green/fixtures/fable-limit-notification.txt` is one such event.
- Counting per line inflates every total (found 2026-09-22). A response
  with several content blocks is stored as several lines that repeat its
  `message.id` and its usage, so this script and `transcript-roles.py`
  count each response two to three times: on session f4b38d60, 1,127
  assistant lines against 501 responses, and 2.2 to 2.9 times the
  per-response tokens depending on the field. The inflation differs by role
  (2.3 lines per response for the controller of session d870e119 against
  1.8 for its subagents), so shares move too. Peak context in
  `transcript-roles.py` is a maximum and is unaffected. Use
  `transcript-window.py` for absolute totals; the 2026-09-21 figures were
  left as measured, with this caveat beside them in
  `../docs/measurements.md`.

## transcript-roles.py

```
python3 tools/transcript-roles.py <project-dir>/<session-id>.jsonl [...]
```

Per session it prints one controller line (turns, turns per model, peak
context in tokens, total cache read, total output), the twelve most used
controller tools with counts, a set of counters for the reads and shell
commands that this workflow generates, and a roll-up of the subagents by
role with the number of agents, turns, cache read, output, wall-clock
minutes and a failed count.

Peak context is the largest per turn sum of input, cache creation and cache
read tokens, which is the 650k to 781k column in `../README.md`.

Roles are classified first from the sidecar `agent-*.meta.json` the harness
writes beside each subagent transcript (since the 2026-09-25 layout). Its
`agentType` is compared with its prefix removed, so the private skill's
names (`app-sdd-unit-controller`), the plugin's (`sdd:unit-controller`) and
the plugin's name fallback (`sdd-unit-controller`) classify alike:
`unit-controller` is `unit-controller`, `implementer` is `implementer` (or
`final-fix` when the description says final and fix), `reviewer` is
`rereview`, `final-review` or `task-review` by its description. Without a
meta file, or for any other type, the first 200 characters of the
subagent's first user message, lowercased, first match wins:

| Role | Matched when the head |
|---|---|
| `unit-controller` | contains `unit controller`, `app-sdd-unit-controller`, `sdd:unit-controller` or `sdd-unit-controller`, or starts with `you run one unit` |
| `rereview` | contains `re-review`, `rereview` or `scoped re-review` |
| `final-review` | contains `final whole-branch`, `final review` or `whole-branch` |
| `final-fix` | matches the row above and also contains `fixing the findings`, or contains `fixing the findings` alone |
| `task-review` | starts with `you are reviewing`, or contains `reviewing one` |
| `implementer` | contains `you are implementing`, or `implement` in its first 60 characters |
| `skill-dispatch` | contains `skill tool` |
| `other` | none of the above |

Source: the `role_of` function in `transcript-roles.py`.

Caveats:

- The role split is approximate and `final-review` over-counts, because the
  task reviewer template names a whole-branch review in its opening lines
  and that test runs before the `task-review` test
  (`../reviews/2026-09-21-data-brief.md`).
- The failed count is a heuristic: a subagent with at most one assistant
  turn and zero output tokens. A subagent that legitimately answered in one
  turn is counted as failed.
- The read and command counters key on this machine's path conventions
  (`.superpowers/sdd`, `progress.md`, `openspec/changes`,
  `docs/superpowers/plans`) and on the transcript's own tool names. A run
  that stores its ledger elsewhere reports zeros, which is a miss, not a
  clean run.
- Per role model counts are collected and then discarded by a line that is
  explicitly a no-op, so the printed table has no model column.
- A session transcript is not one task. Session f4b38d60 covers an OpenSpec
  change of four sections plus two small changes, so its totals are the
  session's, not one change's
  (`../reviews/2026-09-21-data-brief.md`). Split by hand if a per change
  number is wanted.

## transcript-window.py

```
python3 tools/transcript-window.py [--since ISO] [--until ISO] <project-dir>/<session-id>.jsonl [...]
```

Per session it prints: the window and the controller's line and response
counts; a per model table for the controller with responses, input, cache
creation, cache read and output tokens; the controller's context per turn
(input plus cache creation plus cache read) as min, mean and max, and the
context of the first turn after each compaction command; the dispatch calls
in the window, counted by requested model and then listed with their
timestamp, model, subagent type and description; one per model table over
all subagent files that have records in the window; and a grand total.

A turn here is one API response: lines are grouped by `message.id` and the
largest value seen per usage field is kept, because the first line of a
subagent response can carry a partial output count (on session d870e119 the
first-line rule gave 102,072 subagent output tokens, the last-line and
largest-value rules 718,421; cache read was the same under every rule).

Caveats:

- `--since` and `--until` compare the record's `timestamp` string as text,
  so pass the same shape the transcript uses (`2026-09-21T13:00:00`, UTC,
  optional fractional seconds and `Z`). A record without a timestamp is
  outside every window.
- A synthetic record the harness writes with no usage counts as one
  response of zero tokens under the model `<synthetic>`, and shows up as a
  context minimum of 0.
- Compaction is detected from the harness's command marker in the user
  record; a compaction triggered automatically, without the command, is not
  reported as a floor.
- Subagent files are matched by the same directory convention as the other
  two scripts and are not joined to the dispatch list.

## transcript-floors.py

```
python3 tools/transcript-floors.py [--since ISO] <project-dir>/<session-id>.jsonl [...]
```

Per session it prints every `/clear` and `/compact` command with the
context of the last real controller turn before it and of the first real
turn after it; a real turn carries more than 20,000 tokens of context, which
skips the small helper calls the harness makes right after a clear. Over all
sessions given it then prints the distribution of the after and before
values per command, and the first-turn context of every subagent file under
`<session-id>/subagents/`. Responses are keyed on `message.id` as in
`transcript-window.py`. It produced the "Clear versus compact, and the
floor" numbers in `../docs/measurements.md` on 2026-09-22.

Caveats:

- A clear that opens a session has no before value and is reported as `NA`.
- The summarization call behind a compaction is not in the transcript, so
  its cost is inferred from the before value, not measured.
- A subagent whose first response carries no usage reports a first-turn
  context of 0; the 288-agent September figure includes a few such rows.

## transcript-agents.py

```
python3 tools/transcript-agents.py [--since ISO] [--split N] [--top K] <project-dir>/<session-id>.jsonl [...]
```

Per session it prints one line per subagent file whose first response is
at or after `--since` (default: every file), each agent counted whole:
responses, peak context, first-turn context, total cache read, the cache
read accumulated by the first `--split` responses (default 150), the number
of controller messages received after the dispatch prompt, the models seen,
the file name and the first 70 characters of the prompt; sorted longest
first, then the share of the longest `--top` agents (default 5) in the
subagent cache read. Responses are keyed on `message.id` with the largest
value per usage field, as in `transcript-window.py`. It produced "The
longest implementers, and the turn-cap question" in `../docs/measurements.md`
on 2026-09-22.

Caveats:

- An agent is in or out by its first response only; an agent that started
  inside the window and ran past its end is counted whole, so the total
  is not the window total of `transcript-window.py`.
- A resume is a user record that is a plain string or text blocks only,
  after the first response. System notifications the harness injects
  (a background-task event) count as resumes; tool results do not.
- The prompt head is the first text-only user record; a prompt delivered
  as a single string and one delivered as text blocks are both handled,
  anything else prints empty.

## transcript-clock.py

```
python3 tools/transcript-clock.py [--gap MINUTES] [--tsv] [--runs] [--gaps] <project-dir>/<session-id>.jsonl [...]
```

Answers "where did the minutes go between the apply prompt and merge-ready".
Per session it finds each apply run (from a `Skill` call naming
`app-subagent-apply` or `sdd:apply`, or from the human prompt before the
first dispatch of an `app-sdd-*`, `sdd:*` or `sdd-*` agent when the session
invokes neither skill, to the end of the controller turn in which the run's
last subagent finished) and prints one line per run: start and end in UTC,
elapsed minutes, active minutes (elapsed minus every gap over `--gap`
minutes, default 10) split into subagent busy time, controller-alone time
and the user's short answers, then the long gaps by bucket (prompt wait,
ruling wait, idle, stall), units, dispatches, prompts and questions.
`--tsv` prints the same as a table; `--runs` merges runs with the same
project and target across sessions; `--gaps` lists every long gap with the
record and line number on each side. The docstring defines the four gap
buckets and the role rule.
It produced `../reviews/2026-10-08-1211-wall-clock-brief.md`.

Caveats:

- Every record of the controller and of every subagent is an event; the
  gap before an event goes to the user when a human prompt ends it or
  follows within 60 seconds (the harness writes `attachment` and
  `queue-operation` records just before a prompt), to a ruling when an
  `AskUserQuestion` result ends it, to idle when a controller turn end
  (`turn_duration` or `away_summary`) precedes it and a controller record
  ends it, otherwise to the agents.
- A session resumed after a break with the harness's "Continue from where
  you left off" and no human prompt is charged to the agents (stall), not
  to the user.
- Subagent busy time is a union, so parallel subagents compress it and the
  controller-alone figure (active agent time minus busy) is an upper bound.
- The role of a subagent comes from its `.meta.json` (`agentType`,
  2026-09-23 on) or, before that, from the opening words of its dispatch
  prompt; a unit is a unit controller, or an implementer in runs without
  unit controllers.
- The harness's own `turn_duration` records overlap waits on background
  agents, so their sum (column `turn_sum`) exceeds elapsed and is printed
  only for reference.

## Also here

`green/` holds the after-edit scenario check of the skill text, its
fixtures, the recorded 2026-09-21 results and the S2 re-run made after the
wording fix, and `tick-script-check.sh`, a shell check of the OpenSpec
tick and brief scripts' failure paths. See `green/README.md`.

The check and test scripts live in `tests/` at the repository root, and
`bash tests/run.sh` runs them on the plugin's own files: one `ok`, `FAIL`
or `skip` line per script after its own output, then the totals, exit 1
when any failed. It skips `test-run-archive.sh` when `later` is not on
PATH, and `test-sub-skill-check.sh` when `sub-skill-check --dir` exits 2
(no installed superpowers copy), and runs the rest unconditionally.
`check-pause-text.sh` checks a prompt file for the pause rule (decisions 21
and 22); the runner gives it `skills/apply/SKILL.md` and then
`skills/apply/prompts/unit-controller-overrides.md`.
`test-sdd-checkpoint.sh` tests the checkpoint script, `bin/sdd-checkpoint`,
in two temporary git repositories and prints `ok <n>` or `FAIL <n>` for each
of six cases (decision 22). `test-run-archive.sh` tests the `Sub-skill:`
line (decision 23) and the park step (the spec of 2026-10-27) of
`skills/apply/scripts/run-archive` in an isolated temporary directory, with
the laterbox engine (`later`) linked on PATH, and prints `ok <n>` or
`FAIL <n>` for each of sixteen cases.
`check-skill-size.sh` counts the characters of `skills/apply/SKILL.md` on a
copy in which every `${CLAUDE_PLUGIN_ROOT}` is a 120-character stand-in
install path and every `${CLAUDE_SKILL_DIR}` that path plus
`/skills/apply`, and prints `ok <n>/<limit> (substituted)`, or
`FAIL <n>/<limit> (substituted)` with exit 1 at or over the limit; the
default limit of 19,500 leaves room under the 20,000 characters a
compaction re-attaches (decision 23). `test-sub-skill-check.sh` tests
`skills/apply/scripts/sub-skill-check` on copies of the sub-skill directory
that `sub-skill-check --dir` resolves, in a temporary plugin tree, and prints
`ok <n>` or `FAIL <n>` for each of seven cases: the pinned copy (also with
a trailing slash and through a symlinked config directory), a change inside
the loop's files, a change in a sibling skill, the install path read from
`installed_plugins.json`, a missing directory, a missing `plugin.json`, and
the script's own pin (the spec of 2026-10-23). `test-tools.sh` tests the
transcript tools here on fixture transcripts and prints `ok <n>` or
`FAIL <n>` for each of six cases: the three agent name forms
(`app-sdd-<role>`, `sdd:<role>`, `sdd-<role>`) in `transcript-roles.py`,
both skill names and the adding `--skill` in `transcript-clock.py`, and
`sdd:apply` in `transcript-tokens.py`.
