# Scenario check of the skill text

`claude-code-workflow.js` is the after-edit test: it puts a controller in
six situations the five measured runs actually produced, runs each one
against the new skill text and against the old, and checks the literal
text the controller says it would send, print or run. The agent never
grades itself; every check is a plain function over the structured fields
it returns, matching a pattern against the literal text or comparing a
declared field to an expected value. Decision 7 in
`../../docs/decisions.md` records why the test is shaped this way.
`claude-code-workflow.js` is kept as the record of the 2026-09-21 run and
is not runnable: the superpowers 6.3.0 copy and the fork clone it names
are no longer at those paths, and the review directory under
`~/.claude/reviews` it reads was never part of this repository.

The script has two phases. Phase Green is this test. Phase Upstream drafts
the superpowers pull request in the fork working tree and is recorded in
`../../docs/upstream.md`; it is described here only because it shares the
results file.

## Fixtures

Each scenario reads one file. The copies kept here are the fixtures as
run; the script's own `F` constant points at the review scratch directory
`~/.claude/reviews/2026-09-21-1305-app-subagent-apply/green-fixtures`, so
running from this repository means repointing `F` at `fixtures/`.

| File | What it represents |
|---|---|
| `fixtures/review-verdict-section-2.md` | a task reviewer's short verdict block: spec FAIL, quality needs fixes, findings `C1` and `I1` with file and line, minors `M1` and `M2`, and the path of the full report |
| `fixtures/fable-limit-notification.txt` | a failed dispatch notification whose result is the account's usage limit message for the top model tier |
| `fixtures/ledger-2-complete.md` | a run ledger where two sections of six are complete, so no checkpoint is due |
| `fixtures/ledger-3-complete.md` | the same ledger one section later, three of six complete, where a checkpoint is due |
| `fixtures/tasks.md` | an OpenSpec task file with sections `1.`, `2.` and a lettered `2b.`, plus a trailing `## Notes` section that must not be dispatched |
| `fixtures/tasks-fenced.md` | one section whose checkbox-looking lines inside a backtick fence and a tilde fence must never count or tick, one item already ticked, two open, and a `## Notes` section holding a checkbox that is not a unit (added 2026-09-26 for `tick-script-check.sh`) |

## The six scenarios

Every prompt gives the same frame: read the skill under test in full and
the wrapped `subagent-driven-development` skill in full, decide the very
next actions exactly as in a real session, put the literal text in the
fields, read files but run nothing, answer in the structured object only.

| Key | Situation | What is checked |
|---|---|---|
| `S1-fix-small-ctx` | the verdict fixture came back and the implementer's last notification reported 118,000 subagent tokens | resumes the same implementer; the message names the report file, not the findings; it names the open ids `C1` and `I1`; the minor findings are not in the message; a ledger line records them as deferred |
| `S2-fix-large-ctx` | same verdict, but the implementer reported 346,000 subagent tokens | dispatches a fresh implementer instead; the message carries the hand-over framing ("you own it now"); it names the report file; the minors stay out |
| `S3-fable-limit` | the final whole-branch review died on the top tier limit | redispatches the same prompt one tier down; a `Model fallback:` line goes in the ledger; the top tier is not probed again later in the session |
| `S4-units-and-tick` | a fresh run of the task file fixture | the dispatch order is exactly `1`, `2`, `2b`; `Notes` is not a unit; progress is marked with the tick script, not by hand editing the task file; the command carries the `Section 1: complete` ledger line |
| `S5-checkpoint-fires` | third section complete, no implementer live, no fix round open | stops and prints `/clear` with the re-invocation line instead of dispatching; a `Checkpoint:` line goes in the ledger (a compaction line until 2026-09-22) |
| `S6-checkpoint-holds` | second section complete, same conditions | dispatches the next section and prints no clear line |

Source: the `SCEN` array in `claude-code-workflow.js`.

## Arms and reps

Two arms: `new` is the installed skill at
`~/.claude/skills/app-subagent-apply/SKILL.md`, `old` is the copy of the
pre-rewrite text kept in the review scratch directory. Three reps per
scenario per arm, run in parallel, each a separate agent with no memory of
the others, on the mid model tier at medium effort. That is 36 green runs,
plus the single upstream agent at high effort. The old arm is the control:
a check that passes in both arms says the scenario does not separate the
two texts, and a check that passes only in the new arm is the change doing
work.

## Running it

This is a workflow script for one specific harness, not a standalone
program. It expects that harness to provide `phase()`, `log()`,
`parallel()` and, above all, `agent(prompt, { label, phase, schema, model,
effort })` returning an object that validates against the JSON schema
given per scenario. A port to another harness has to provide one thing:
a way to run an agent with a structured-output schema, plus read-only file
access so the agent can read the skill under test and the fixture. The
checks themselves are plain JavaScript functions over the returned object
and port unchanged. Absolute paths at the top of the file (the review
directory, both skill texts, the wrapped skill in the plugin cache, the
fork clone) are this machine's and must be repointed first.

## Reading the results file

`2026-09-21-results.json` is the harness's own run record. Its `result`
key holds the three things the script returns: `green`, a table of
scenario by arm with `reps`, `answered`, `all_checks_pass` and a
`per_check` count of how many of the three reps passed each check;
`samples`, the new arm's answers with their checks, chosen action and the
first 240 characters of the text they would have sent; and `upstream`,
the pull request draft object. The envelope records 37 agents, 2,510,018
tokens and 304 tool calls for the whole run.

## Results, 2026-09-21

`2026-09-21-results.json` records the run that produced the S2 tier gap, so
its samples show the pre-fix behaviour of the new text. The S2 re-run after
the fix is `2026-09-21-results-retest-s2.json`, three reps, all three
dispatching on the same tier; the other five scenarios were not re-run.

Reps passing every check, out of three.

| Scenario | New text | Old text |
|---|---|---|
| `S1-fix-small-ctx` | 3 | 3 |
| `S2-fix-large-ctx` | 3 | 0 |
| `S3-fable-limit` | 3 | 0 |
| `S4-units-and-tick` | 3 | 0 |
| `S5-checkpoint-fires` | 0 as scored, 3 re-scored (`2026-09-21-s5-rescore.md`) | 0 |
| `S6-checkpoint-holds` | 3 | 3 |

Source: `2026-09-21-results.json`, `result.green`.

Per check, where the arms differ: in S2 the old text resumed the
overloaded implementer in all three reps and never used the hand-over
framing, while both arms kept the minors out and named the report file. In
S3 both arms stepped down a tier and neither probed the top tier again,
but the old text ledgered the fallback zero times out of three. In S4 the
old text got the unit list wrong in all three reps and named the tick
script once out of three.

S5 is a defect of the check, not of the text. `stops` and
`checkpoint_ledgered` passed three times out of three in the new arm, and
the samples show the compaction line present in all three answers, but the
`compact_line` pattern is anchored to the start of the field without the
multiline flag, so a checkpoint sentence written above the line fails it.
The old text failed S5 on all three checks and dispatched the next section
instead.

On 2026-09-22 the checkpoint's printed command became `/clear` plus the
re-invocation line (`../../docs/decisions.md` 12). The S5 and S6 checks in
`claude-code-workflow.js` now expect that (`clear_line`, `reinvokes`,
`no_clear`); the recorded results above were scored against the compaction
form, and the new text has not been re-run.

## The 2026-09-25 check: driver and unit controller

`2026-09-25-unit-controller-workflow.js` checks the wrapper after the
unit-controller change (`../../docs/superpowers/specs/2026-09-25-unit-controller-design.md`).
Fourteen driver scenarios put the driver in front of a unit controller's
return, or at a fixed point of the run, and check the literal next action:

- Ten were in the first run: `D1` (`complete`), `D2` and its hands-off
  variant `D2h` (`needs-ruling`), `D3` and `D3h` (`failed` on the second
  attempt), `D5` and `D6` (the hands-off ending with a GitLab remote, off
  and on the default branch), the `step` scenario `D7`, and the two
  `isolated` scenarios `D8a` and `D8b`.
- Four were added after the review of that run and first ran in run
  `wf_263fa089-425` on 2026-09-25. `D1b`: the controller's final message
  on its first attempt is prose with no status block; the expected action
  is to resume the same controller by message and ask for its return
  block (changed after that run, see below). `D4`: `parked` under
  hands-off; the expected action is the hand-off to section `2b`. `D5b`:
  the hands-off ending off the default branch with a remote on a Gitea
  server; expected are a push, no request and a message that the branch is
  pushed. `D9`: a resume from a ledger with sections 1 and 2 complete; the
  expected next unit is `2b`, and any second dispatch of 1 or 2 fails.

Four controller scenarios (`S1` to `S4`, re-pointed from the 2026-09-21
file) put the unit controller in the fix-round, limit and ticking
situations. Fixtures: `return-complete.md`, `return-needs-ruling.md`,
`return-failed.md`, `return-parked.md`, `return-prose.md`,
`ledger-failed-once.md`, plus the 2026-09-21 verdict, limit, ledger and
task-file fixtures. There is no old arm: the driver did not exist before
this change. Results: one file per run, listed in the table below, with
one line per scenario under `result.summary`.

The script takes an argument object. `sdd`, the sub-skill directory, is
required since 2026-10-23 (see "The sub-skill directory, S17's check and
the rescore tool", below); `{ only: [<scenario keys>], reps: <n> }` runs
a subset. Without `only` every scenario runs, three times unless `reps`
says otherwise. A resumed run
returns cached answers for the longest unchanged prefix of agent calls and
runs the rest live. The four added scenarios sit at the end of the list, so
the calls of the recorded run keep their order and prompts; S1 and S2 now
carry a different schema (below), and their recorded answers have no
`round_ids` field.

Two controller scenarios were added on 2026-10-07 after decision 20 and
sit at the end of the list, before the `phase('Green')` call, so a resume
of a recorded run keeps its prefix. `S7-after-dispatch`: the implementer
has just been dispatched and the harness said it will notify; the
expected action is `end_turn_and_wait_for_notification`, and the literal
command and message text must contain no `run_in_background`, `sleep`,
`for i in`, `seq`, `until`, `while` or `inotifywait`.
`S8-handback-with-watcher-live`: a watcher shell with task id `bq7x2k1m`
that the controller started earlier is still running when the unit is
done; the expected tool calls include a `TaskStop` naming that id before
the return, the block is delivered through the hand-back tool, it reads
`Unit: 2` and `Status: complete`, and a `Section 2: background shell
stopped before return` line is ledgered. The runner takes
`{ overrides: <path> }` to point the controller scenarios at another
override text; the old arm for these two is
`yadm show 56657ea:.claude/skills/app-subagent-apply/prompts/unit-controller-overrides.md`
saved to a file. Neither scenario has been run.

Four controller scenarios for the pause rule were added on 2026-10-19
(decision 21), after S8 and before the `phase('Green')` call, so a resume
of a recorded run keeps its prefix. This paragraph and the next two
describe the scenarios as added; six of them changed on 2026-10-20
(below). `S9-pause-with-child-live`, two
states: a pause message arrives while the implementer (`a62e23f4`) runs,
and the expected `now_action` is `end_turn` with no `TaskStop` in the
literal call; then its report arrives, and the expected `then_action` is
`return_paused`, with a `Section 2: paused (...; HEAD <sha7>, tree
<hash>)` ledger line and a block carrying `Status: paused` and a `Point:`
line. `S10-child-stopped-by-hand`: the implementer's result is
`fixtures/stopped-child-notification.txt`, probe A2's notification
verbatim (`<status>killed</status>`, `was stopped by Claude`, no result);
expected are no dispatch, a `Section 2: implementer stopped by hand` line
and a `paused` block with a `Point:` line. `S11-pause-then-child-error`:
a pause is pending when the round-4 implementer's result is
`fixtures/fable-limit-notification.txt`; expected are no dispatch, a
`Model fallback: implementer` line and a `paused` block.
`S12-late-notification-earlier-round`: round 2's implementer is in
flight when the stop notification of round 1's (`a86ac5dc1bb96f866`, the
same fixture) arrives; expected are no dispatch, a ledger line naming
that id with `consumed`, `earlier round` or `not the current`, and no
`paused` block. The old arm for these four is
`yadm show e131693:.claude/skills/app-subagent-apply/prompts/unit-controller-overrides.md`
saved to a file and passed as `{ overrides: <path> }`.

Five driver scenarios were added with them. `D10-paused-return`, two
states: after a forwarded pause the return is `fixtures/return-paused.md`,
and the expected action is a hold (`other` or `stop_run`) with a
`Section 2: controller returned paused` line; then the owner types
`continue`, and the expected `then_action` is `resume_controller` with no
`Section 2: resumed` line. `D11-controller-stopped-by-hand`: the
controller's result is `fixtures/stopped-controller-notification.txt`,
probe B2's notification with the summary's ending changed to
`was stopped by user`, an ending inferred from the installed harness and
never observed (decision 21); expected are a `Stopped by user mid-unit 2`
line, a `TaskStop` in the message or command text, and no dispatch.
`D12-cleanup-stop-is-not-a-pause`: the ledger is
`fixtures/ledger-cleanup-stop.md`, a first attempt that ends with the
driver's own `failed` cleanup stop, and the notification is
`stopped-child-notification.txt`; expected are `redispatch_same_unit`
and no `Stopped by user` line. `D13-early-continue`, two states, on
`fixtures/ledger-pause-requested.md`: `continue` before the controller
returns, then `continue` again; expected are a `Section 3: pause
cancelled` line, a forwarded continue, no dispatch in either state, and a
second answer of `other` whose message says there is nothing to resume.
`D14-pause-before-first-dispatch`: `pause` after the pre-flight, before
section 1 is handed out; expected are no dispatch and a `Section 1:
pause requested` line, the form the wrapper defines for a pause with no
controller live (since the final review's fix wave). On 2026-10-20,
after the second iteration's final review (decision 22, the owner's
ruling on its I2), D14 gained a second state: the owner then types
`continue`, and expected are a `Section 1: pause released` line
(`released_line`) and `dispatch_next_unit`, the release before
section 1's `Section 1: handed to controller` line (`then_dispatches`).
The runner
now takes `{ skill: <path> }` beside `{ overrides: <path> }` to point the
driver scenarios at another wrapper text; the old arm for these five is
`yadm show dc9167e:.claude/skills/app-subagent-apply/SKILL.md` saved to a
file.

Two scenarios for a forced hand-back were added the same day (Task 8 of
the plan) at the end of the list. `S13-forced-handback`: the implementer
(`a9be696a2dc18cd6a`) is in flight, the controller holds no running work,
and `fixtures/handback-enforce-message.txt` gives, in order, probe A's
interim "waiting on its own background work" notification (only the
agent's description changed, to `Implementer`) and the peer run's
`[handback-send-enforce]` message, both verbatim; expected are a block
with `Status: waiting` and a `Child:` line, no `Status: paused`, and no
dispatch. `D15-waiting-return`, two states: a `waiting` block naming
child `a4b94892c8009ed1c`, then that child's hand-back at the driver
(`DONE, commits 2b698a3..c1d2e3f`); expected are any action but
`ask_user` with a `Section 2: controller returned waiting` line, then
`resume_controller` with a `Section 2: relayed implementer hand-back to
controller` line. The old arm for both is the text at `f00db08`, which
returned `paused` on a forced hand-back:
`yadm show f00db08:.claude/skills/app-subagent-apply/prompts/unit-controller-overrides.md`
as `{ overrides: <path> }` for S13 and
`yadm show f00db08:.claude/skills/app-subagent-apply/SKILL.md` as
`{ skill: <path> }` for D15. None of the eleven had been run then (S9,
D13 and D14 ran in their later forms on 2026-10-20, below); the
implementers of Tasks 4 and 8 ran the script body against stubbed
answers, which tests the check functions, not the skill. The fixtures
`stopped-child-notification.txt` and `handback-enforce-message.txt` keep
two long dashes each, verbatim from the harness's notification preamble.

Six scenarios were adjusted and six added on 2026-10-20 for the
ledger-driven pause (decision 22, commits `e65dac3` and `cc7ca0c`). The
adjusted ones keep their keys, because the results files and these
paragraphs cite them. The pause, its release and an owner note are
ledger lines, nothing is forwarded to a controller, and a stop is read
from `<status>killed</status>` with no `<result>`. Since the agent runs
nothing, the prompts state the line `scripts/sdd-checkpoint` would print
(`heads repo <sha7>; tree 5db26f80ee6e8244`, the script's tree hash for
clean paths in one repository, which
`printf -- '--\n--\n--\n' | sha256sum` reproduces) in place of
iteration 1's hardcoded empty-input hash. Two schemas were added:
`PAUSE_SCHEMA` for S9, S9f, S11, S14 and S15 (the literal commands, the
prompt of any dispatch and the message of any resume of a child), and
`OWNER_SCHEMA` for D13 and D17, which keeps the message to the
controller (`message_text`) apart from what the driver tells the owner
(`owner_text`).

Adjusted. `S9-pause-with-child-live`, now one state: the ledger is
`fixtures/ledger-pause-in-force.md`, which ends
`Section 3: pause requested`, and the implementer `a62e23f4` has just
reported DONE, commits `c1d2e3f..d4e5f6a` with HEAD `d4e5f6a`, section
3's own range as in S14 and S15 (since the run's final review, its I5;
Task 4 wrote the plan's `2b698a3..c1d2e3f`, which the fixture records
as section 2's completed range). Its checks are `grep_before_dispatch`
(the command text greps `^(Section 3|Final phase)` or names
`sdd-checkpoint`), `report_ledgered` (a ledger line for the report,
carrying `DONE`, `reported` or the range `c1d2e3f..d4e5f6a`, comes
before the `paused` line; added by `cc7ca0c` after Task 4's review,
because the spec's Testing section lists the report ledgered among
S9's expectations), `paused_line` (a `Section 3: paused (...)` line
carrying `heads`), `block_paused` (`Status: paused` and a `Point:` line) and
`no_dispatch` (a return with no dispatch prompt and no resume message).
`S11-pause-then-child-error`, now on section 3: the ledger ends with the
round-4 dispatch and `Section 3: pause requested` when the result is
the limit fixture; it is checked as S9 is, without `report_ledgered`,
plus `fallback_ledgered`. `S10-child-stopped-by-hand`,
`D11-controller-stopped-by-hand` and `D12-cleanup-stop-is-not-a-pause`
change in their prompts only: each describes its notification by
`<status>killed</status>` and no `<result>`, while the fixtures keep
their summary text and no check reads it; S10's prompt also says the
ledger holds no pause line for section 2. `D13-early-continue`, two
states on `fixtures/ledger-pause-requested.md`: `continue` while the
unit runs, then `continue` again. Expected are a
`Section 3: pause released` line (`released_line`), an empty message to
the controller (`no_message`), no dispatch or resume in the first state
(`no_dispatch`), at most one release line (`no_second_release`), and a
second state that reaches no controller and tells the owner there is
nothing to resume (`says_nothing_to_resume`).

Added, at the end of the list after `D15`, so a resume of a recorded run
keeps its prefix. `S9f-pause-in-final-phase`: S9 in the final phase, on
`fixtures/ledger-final-pause-in-force.md`, whose last line is
`Final phase: pause requested`, with the fix wave's implementer
reporting DONE; S9's five checks with the `Final phase:` prefix, the
checkpoint taken on the union of the three units' paths.
`S14-pause-released-in-ledger`: `fixtures/ledger-pause-released-far-back.md`
holds `pause requested` and then `pause released` for section 3, with 24
lines after the release, so a 20-line tail sees neither; expected are a
reviewer dispatch (`dispatches_reviewer`) and no `paused` line
(`no_paused_line`). `S15-owner-note-at-check`:
`fixtures/ledger-owner-note.md` ends
`Section 3: owner note: drop the README edit from this unit`; expected
are the note in the next dispatch prompt or resume message
(`note_in_dispatch`, which looks for `README`; the prompt names no file
list, so only the note can put it there) and a
`Section 3: owner note applied` line (`applied_line`).
`D16-waiting-child-killed`: after a `waiting` return naming child
`a86ac5dc1bb96f866`, that child's stop notification
(`stopped-child-notification.txt`) reaches the driver; expected are
`resume_controller` (`relays`) and no fresh dispatch or
`Stopped by user mid-unit` line (`no_fresh_dispatch`).
`D17-owner-instruction-mid-unit`, two states: the owner types "drop the
README edit from this unit" while section 3's implementer runs, then the
same words after section 3 is complete and before section 4 is handed
out; expected are a `Section 3: owner note: ` line, an empty message to
the controller and no dispatch in the first state, and a
`Section 4: owner note: ` line in the second (`note_line`,
`no_message`, `no_dispatch`, `note_for_next`).
`D18-pause-then-abort-then-continue`, two states on
`fixtures/ledger-pause-in-force.md`: `abort` while the controller and
its implementer run, then `continue` with neither running; expected are
a `Stopped by user mid-unit 3` line (`stopped_line`), and a
`Section 3: pause released` line before the fresh dispatch's
`Section 3: handed to controller` line with `redispatch_same_unit` as
the second action (`released_before_dispatch`).

No old arm is named for these twelve. The texts before the change are
the overrides and the wrapper at dotfiles `5fcb918`, the last commit
touching the skill before the run base `b8f36fb`, which a later run can
pass as `{ overrides: <path> }` and `{ skill: <path> }`. None was run
then (the owner's decision of 2026-10-19, in the spec's Non-goals); the
implementer ran the check functions against synthetic answers only,
which tests the checks, not the skill. Seven of the twelve, S9, S9f,
S14, S15, D13, D17 and D18, ran on 2026-10-20 with D14 ("Results,
2026-10-20", below). Three prompts outside the change keep iteration 1
phrases: D10's says the driver forwarded the word to the controller,
and S12's and S13's say that no pause message has arrived.

Four scenarios were added and one changed on 2026-10-20 for the
amendment of decision 22 (`d541bba`), at the end of the list after
`D18`, with five fixtures (`ledger-note-round.md`,
`ledger-final-note-after-fix.md`, `ledger-final-note-before-tick.md`,
`ledger-final-complete-pause-requested.md`, `ledger-final-held.md`). A
state-2 check that repeats a state-1 check's name takes the `then_`
prefix. `S16-note-round-reviewed-clean`, two alternative states:
section 3's task review was clean, the read before the tick found
`Section 3: owner note: drop the README edit from this unit` unapplied,
fix round 1 went to the implementer, and its re-review returns 0
Critical and 0 Important; expected are the tick (`ticks`, a
`Section 3: complete` line in the ledger lines or the command text), a
`complete` block (`block_complete`) and no `needs-ruling`
(`no_needs_ruling`). In the second state the re-review returns 0
Critical and 1 Important; expected are a fix message or dispatch to an
implementer naming `I1` (`round_two`) and no `needs-ruling`
(`then_no_needs_ruling`). `S17-final-note-after-fix-wave`, the final
phase, two alternative states. Window 2: the fix wave's implementer
has reported and `Final phase: owner note: also rename the test file`
is unapplied; expected are a dispatch or resume of an implementer
carrying the note (`note_dispatch`), no finding id in it
(`no_findings_in_note_dispatch`; since 2026-10-23 read from a declared
`round_ids` field, below), and a scoped re-review range, in its
own `rereview_range` field, that starts at `d4e5f6a`, the head the
whole-branch review saw, not at the fix wave's head `e7f8a9b`
(`rereview_from_review_head`). Window 3: the scoped re-review is clean
and the note is found before the tick; expected are the note dispatch
(`then_note_dispatch`) and no `Final phase: complete` line
(`no_complete_line`). `D19-held-final-complete`, under hands-off on the
default branch with a GitLab remote, so an unheld `complete` would
push: `Final phase: pause requested` is in force when the final phase
returns `complete`; expected are a
`Paused by user after the final phase` line (`held_line`), no
`run-archive` command (`no_archive`) and no push (`no_push`); then the
owner types `continue`, and expected are a
`Final phase: pause released` line (`released_line`) before the
`run-archive` command (`archive_after_release`).
`D20-relaunch-held-final`: a relaunch on an OpenSpec change whose load
reports `all_done`, with `Final phase: complete e7f8a9b` at HEAD and
`Paused by user after the final phase` as the ledger's last line,
where the driver's `tail -n 20` shows it; expected are the release line
(`released_line`) and the `run-archive` command before the `all_done`
table or the `/opsx:archive` suggestion (`archive_before_table`). D19
and D20 answer in `STEPS_SCHEMA`, an ordered list of steps, each a
ledger line, a command or a text to the owner, so the order checks read
positions. `D14-pause-before-first-dispatch` now answers in
`OWNER_SCHEMA` and gains `no_running_claim`: the acknowledgement
(`owner_text`, and `message_text` should it land there) is not empty
and does not say that the unit pauses when its current implementer or
reviewer reports, the form for a live unit only; with no unit live the
wrapper now says that nothing is dispatched until `continue`. The `SDD`
constant named the installed `superpowers-marketplace/superpowers/7.0.0`
copy of the sub-skill in place of the
`claude-plugins-official/superpowers/6.4.1` path, until 2026-10-23, when
it became `args.sdd` (below). The four new keys and
the amended D14 have not been run; they run after the amendment's apply
(its spec's call 7). The implementer probed the check functions with
synthetic answers only, which tests the checks, not the skill.

## Results, 2026-09-25

Run on the `opus` alias at medium effort against superpowers 6.4.1.

Reps passing every check, measured, from each file's `result.summary`.
Each file was scored by the check functions of the commit named in the
second row. An empty cell means the scenario was not in that run.

| Scenario | Original | Rescore | Retest | Added | D1b re-run |
|---|---|---|---|---|---|
| Source file | `2026-09-25-results.json` | `2026-09-25-results-rescore.json` | `2026-09-25-results-retest.json` | `2026-09-25-results-added.json` | `2026-09-25-results-d1b.json` |
| Run | `wf_11cbe361-b8c` | cache replay of `wf_11cbe361-b8c` | cache replay of `wf_1c1d9c7f-def` | `wf_263fa089-425` | `wf_a22af157-258` |
| Checks from commit | `2e6ce1c` | `67b85f1` | `67b85f1` | `3618068` | `6b0f303` |
| `D1-complete` | 0 of 3 | 3 of 3 | | | |
| `D2-needs-ruling` | 3 of 3 | 3 of 3 | | | |
| `D2h-needs-ruling-hands-off` | 3 of 3 | 3 of 3 | | | |
| `D3-failed-twice` | 3 of 3 | 3 of 3 | | | |
| `D3h-failed-twice-hands-off` | 2 of 3 | 3 of 3 | | | |
| `D5-hands-off-gitlab` | 3 of 3 | 3 of 3 | | | |
| `D6-hands-off-default-branch` | 3 of 3 | 3 of 3 | | | |
| `D7-step` | 3 of 3 | 3 of 3 | | | |
| `D8a-isolated-with-script` | 2 of 3 | 3 of 3 | | | |
| `D8b-isolated-no-script` | 2 of 3 | 3 of 3 | | | |
| `S1-fix-small-ctx` | 0 of 3 | 3 of 3 | 5 of 5 | 3 of 3 | |
| `S2-fix-large-ctx` | 0 of 3 | 0 of 3 | 5 of 5 | 3 of 3 | |
| `S3-fable-limit` | 3 of 3 | 3 of 3 | | | |
| `S4-tick-through-script` | 3 of 3 | 3 of 3 | | | |
| `D1b-prose-return` | | | | 0 of 3 | 3 of 3 |
| `D4-parked` | | | | 3 of 3 | |
| `D5b-hands-off-other-host` | | | | 3 of 3 | |
| `D9-resume` | | | | 3 of 3 | |

The rescore and the retest replay ran before 67b85f1 was committed, against
a working copy that differed from it only in the name of the minors
function (session 73cafe87-a204-4598-ac04-52895c4c2d3a). Recomputed from
the stored answers on 2026-09-25, the checks of 2e6ce1c reproduce every
stored check value in the original file, those of 67b85f1 every value in
the rescore and retest files, and those of 3618068 every value in the
added file. Two checks changed after the files they scored: S1 and S2
after 67b85f1 (the minors check below), and D1b after 3618068 (below).
Neither applies to the answers stored before its change. Every file is
kept as it was saved.

`2026-09-25-results.json` is the run as scored at the time (run
`wf_11cbe361-b8c`: 42 agents, 2,160,741 subagent tokens, 142 tool calls).
30 of 42 reps passed every check. Every failure was read by hand, and all
twelve were defects of the checks:

- `D1`, 0 of 3: the check expected `Section 3`, but `fixtures/tasks.md` has
  a lettered `2b.` section and the skill makes `2b` its own unit, so all
  three reps handed over `Section 2b`. The D1 prompt does not name the task
  file; in D3h one rep read it and went to `2b`, two did not and went to
  `3`. Either is now accepted.
- `S1` and `S2`, 0 of 6: `minors_out` failed on any mention of `M1` or
  `M2`, and every rep named them only to exclude them ("M1 and M2 are
  deferred minors; leave them alone"). The check was then replaced twice,
  each time after answers were known; "The minors check" below lists every
  version.
- `D8a`, 2 of 3: the failing rep ran the prescribed command with a
  directory flag, `git -C /repo worktree add .worktrees/demo -b demo 3473879`.
- `D3h`, 2 of 3: the failing rep wrote `Section 2: parked (controller failed
  twice)` and labelled the action `dispatch_next_unit`, which overlaps
  `park_and_continue`.
- `D8b`, 2 of 3: the failing rep created nothing, said the bootstrap script
  was missing, and offered the user options (`ask_user`) instead of
  `stop_run`.

`2026-09-25-results-rescore.json` replays the same 42 answers from the cache
against the corrected checks (answers byte-identical, no new agent calls):
39 of 42. The three failures are S2 on `prior_rounds`, a check added at the
same time as the baseline for the wording gap below.

One real wording gap was found. The fix-round override read "A prior
implementer attempted this unit R-1 times; you own it now". The wrapped
skill uses that framing only in rounds 4 and 5, but the override also
dispatches a fresh implementer in round 1 once the implementer's context
passes 300,000 tokens, where R-1 is 0. The three S2 reps wrote three
different sentences: "attempted this unit 0 times", "1 time", and "once
(the initial implementation, ...)". The override now reads "A prior
implementer built this unit and ran R-1 fix rounds; you own it now".

`2026-09-25-results-retest.json` holds S1 and S2 re-run five times each on
the new text (run `wf_1c1d9c7f-def`: 10 agents, 588,010 subagent tokens, 53
tool calls; the saved record is the cache replay against the checks of
67b85f1, so its own token count is zero). S2 passed 5 of 5, every rep
writing "A prior implementer built this unit and ran 0 fix rounds; you own
it now" word for word. S1 passed 5 of 5 in the replay, but 2 of 5 as first
scored, under the second version of the minors check (below); all five S1
reps kept the minors out of the round. The driver scenarios, S3 and S4
were not re-run; the edit touches only the fix-round paragraph of
`unit-controller-overrides.md`.

`2026-09-25-results-added.json` holds the first run of the four added
driver scenarios and a fresh run of S1 and S2 under version 4 of the
minors check, three reps each (run `wf_263fa089-425`: 18 agents, 924,744
subagent tokens, 66 tool calls, from the file's own `agentCount`,
`totalTokens` and `totalToolCalls`; every agent on `claude-opus-5-5`).
Scored by the checks of 3618068, 15 of 18 reps passed every check. D4, D5b
and D9 passed 3 of 3: every D4 and D9 rep handed over `Section 2b`, and
every D5b rep pushed, opened no request and said the branch was pushed.
S1 and S2 passed 3 of 3, with no `M` id in any `round_ids`.

`D1b`, 0 of 3, was a defect of the check. It pinned the driver's first
ruling of 2026-09-25, that a prose return counts as `failed` and is
dispatched once more with the prior-attempt line, a rule the skill text
did not state. All three reps chose `resume_controller` instead: each told
the live controller that its final message was prose, not the return
block, asked it to finish the unit (the re-review of the fix round, the
gates and the tick), and asked it to end with the return block. None
dispatched again. An owner ruling of 2026-09-25 then replaced the first
one: a prose return is resumed by message for the return block, and a
second prose return from the same controller counts as `failed`.
Driver-loop step 3 of the skill now says so in one sentence (private
dotfiles repository, commit 4ebe3cd). The D1b check now expects
`resume_controller` with a message that asks for the return block. D1b
ran again, fresh, on the revised check (`2026-09-25-results-d1b.json`,
below).

`2026-09-25-results-d1b.json` holds the fresh run of D1b on the revised
check (run `wf_a22af157-258`, started 2026-09-26 00:17 local time: 3
agents, 144,145 subagent tokens, 9 tool calls, from the file's own
`agentCount`, `totalTokens` and `totalToolCalls`; every agent on
`claude-opus-5-5`). The harness was at commit `6b0f303`, per the driver's
record of the run; the file's prompt previews match that commit's prompts.
The scoring rule was set by an owner ruling of 2026-09-26, before the run:
a rep passes when `next_action` is `resume_controller` and no
`Section 2: complete` or `Section 2: parked` ledger line is written; the
driver reads the three messages by hand and this file quotes that verdict;
the text check (`asksForBlock`) is recorded beside it and does not decide.
The structured score is 3 of 3, recomputed from the file on 2026-09-26:
every rep's `next_action` is `resume_controller` and every `ledger_lines`
is empty. The driver's hand read is 3 of 3, quoted: "each rep resumes the
same controller by message rather than a new dispatch, asks for the return
block as the whole final message, and restates the six-field grammar. Rep 2
writes `Unit: <id>` where reps 1 and 3 write `Unit: 2`." The text check is
3 of 3, recomputed from the file with the check of `6b0f303`, under which
the file's nine stored check values reproduce, 0 differ. The `3 of 3` in
the table is the structured score.

Not changed: the skill does not say what the driver does when a controller
dispatched with `Mode: hands-off` returns `needs-ruling` anyway. All three
D2h reps told the controller to park the unit as a mismatch, as the
overrides prescribe, and wrote no ledger line themselves. With no failing
baseline, no text was added for it.

### The minors check

The minors check of S1 and S2 enforces "Minor findings never enter a
round" (`unit-controller-overrides.md`). It has had four versions:

1. `!/M1|M2/` over the fix message (2e6ce1c). It fails on any mention of a
   minor id, including one that excludes it. It scored the original file.
2. `minorsOnlyDeferred`, never committed. It split the fix message into
   sentences at `.`, `;`, `:` and line breaks and required every sentence
   naming `M1` or `M2` to match
   `/defer|leave (them|it)|do not (touch|fix|work on|change)|don't (touch|fix)|out of scope/i`.
   It was in force when the retest ran, and it scored S1 at 2 of 5 and S2
   at 5 of 5 there (measured; source: the task-notification of run
   `wf_1c1d9c7f-def` in session 73cafe87-a204-4598-ac04-52895c4c2d3a,
   project directory
   `~/.claude/projects/-home-longman-projects-personal-claude-subagent-apply/`).
   It failed on the wording, not on the rule: reps 2 and 3 named the
   minors in one sentence ("The review also lists M1 and M2.") and
   excluded them in the next, and rep 4 wrote "M1 and M2 are Minor and are
   not part of this round", a phrase the pattern did not list. Applied on
   2026-09-25 to the answers stored in the retest file, which are the same
   as that run's, it gives the same 2 of 5.
3. `minorsKeptOut` (67b85f1): fails only when a minor finding's wording
   (`it_ prefix`, `docblock`) reaches the fix message. It replaced version
   2 after the retest answers were known and scored the rescore and the
   retest replay. None of the 16 stored fix messages carries that wording.
   It cannot fail on a message that puts the minor ids into the round
   without their wording ("fix C1, I1, M1 and M2"), so on its own it no
   longer tests the rule.
4. Current. S1 and S2 answer in their own schema, which adds a required
   `round_ids` array: the finding ids the fix message puts into the round.
   `minor_ids_out` fails on any `M` id in it, `open_ids_in_round` fails
   unless `C1` and `I1` are both in it (so an empty array cannot pass),
   and version 3 stays as `minors_out`. The `round_ids` field is the
   answer's own account of the round and is not cross-checked against the
   message text. The answers stored before it have no `round_ids`, so
   version 4 cannot score them. S1 and S2 ran again, fresh, in run
   `wf_263fa089-425` and passed 3 of 3 each under it
   (`2026-09-25-results-added.json`).

### Pending

D1b ran on its revised check on 2026-09-26 (`2026-09-25-results-d1b.json`,
above), under the scoring rule the owner set before the run: the
structured fields decide, the driver's hand read is quoted, and the text
check does not decide. The second half of the ruling, that a second prose
return from the same controller counts as `failed`, has no scenario and is
untested.

## Results, 2026-10-20: the pause scenarios

This is the first recorded run of a pause scenario, made by the driving
session on 2026-10-20 at 09:38 local (the first agent's `startedAt`):
one rep each, on the `opus` alias at medium effort (the harness's
`agent` call, the harness as committed at `1b5a3cc`), against the skill
at dotfiles `646dcce`, the last commit touching the skill before the
run (the next, `d6a2997`, is from 10:08). It took 8 agents, every one
on `claude-opus-5-5`, 548,810 tokens and 27 tool calls, from the file's
own `agentCount`, `totalTokens`, `totalToolCalls` and
`workflowProgress`.

| Scenario | Reps passing every check |
|---|---|
| `S9-pause-with-child-live` | 1 of 1 |
| `S9f-pause-in-final-phase` | 1 of 1 |
| `S14-pause-released-in-ledger` | 1 of 1 |
| `S15-owner-note-at-check` | 1 of 1 |
| `D13-early-continue` | 1 of 1 |
| `D14-pause-before-first-dispatch` | 1 of 1 |
| `D17-owner-instruction-mid-unit` | 1 of 1 |
| `D18-pause-then-abort-then-continue` | 1 of 1 |

Source: `2026-10-20-results-pause.json` (`769e76c`), `result.summary`.

These eight are tested at `646dcce` with one rep each, which shows that
the rule text can produce the expected action, not how often it does.
D14 is tested in the form it had then, with the checks `no_dispatch`,
`pause_line`, `released_line` and `then_dispatches` (`1b5a3cc`). Its
answer put "pause requested; the unit pauses when its current
implementer or reviewer reports" in `message_text` with nothing
running, which no check read then. That answer is the amendment's call
1: with no unit live the wrapper now says that nothing is dispatched
until `continue`, and D14's `no_running_claim` check, added at
`d541bba`, returns false on the recorded answer (computed on
2026-10-20). The amended D14 is untested. The run read the sub-skill
through the `SDD` constant's `claude-plugins-official/superpowers/6.4.1`
path, whose `SKILL.md` and prompt templates were byte-identical to the
`superpowers-marketplace/superpowers/7.0.0` copy real runs load
(`diff -rq` of the two skill directories on 2026-10-20 lists only
`scripts/sdd-workspace`), so the results stand; the constant named the
7.0.0 copy from `d541bba` until 2026-10-23, when it became `args.sdd`
(below). Still untested among the pause scenarios:
`S10-child-stopped-by-hand`, `S11-pause-then-child-error`,
`S12-late-notification-earlier-round`, `S13-forced-handback`,
`D10-paused-return`, `D11-controller-stopped-by-hand`,
`D12-cleanup-stop-is-not-a-pause`, `D15-waiting-return` and
`D16-waiting-child-killed`.

The four keys the amendment added and the amended D14 ran once each on
2026-10-20 at 12:39 local, after its apply, against dotfiles `49e897c`
with the harness at `eb5a84f`, on `opus` at effort `medium`: 5 agents
on `claude-opus-5-5`, 338,360 tokens and 24 tool calls
(`2026-10-20-results-amendment.json`). D14, S16, D19 and D20 passed
every check, so the runner accepted `STEPS_SCHEMA`. S17 passed four of
its five checks. `no_findings_in_note_dispatch` failed on a note
dispatch that named `I1` only as the history of the fix wave ("Your fix
wave for I1 ... is recorded; no review findings are carried in this
message") and carried no finding. The check matches any finding id in
the dispatch text, so it cannot tell a finding to fix from one
mentioned; the rule text stands, and the check stayed open (the
amendment apply's Task 3 deferred minor M5) until its correction on
2026-10-23 (next section).

## The sub-skill directory, S17's check and the rescore tool (2026-10-23)

This section records three changes of 2026-10-23, made for
`../../docs/superpowers/specs/2026-10-23-sub-skill-upgrade-content-pin-design.md`
(sections 5 and 6).

The harness takes the sub-skill directory as `args.sdd` and stops,
before any agent runs, with the error `args.sdd is required: the
sub-skill directory, from sub-skill-check --dir or a candidate copy`
when it is missing. An ordinary run passes the directory that
`sub-skill-check --dir` prints (the apply skill's script,
`~/.claude/skills/app-subagent-apply/scripts/sub-skill-check` in the
private dotfiles), the copy real apply runs load. To verify a release,
a run passes the candidate copy, the release fetched into a directory
of its own (spec section 6). The controller preamble names that
directory and tells the scenario agent to read its `SKILL.md` in full
and each `references/` file it says to read at the step the scenario
reaches; until then the `SDD` constant named the 7.0.0 copy's
`SKILL.md` alone.

S17's `no_findings_in_note_dispatch` reads a declared field. S17's
schema gains `round_ids` as `FIX_SCHEMA` declares it (the ids of the
review findings the fix message puts into this round), and the check
passes when it is empty. `noFindingIds`, which matched any finding id
in the dispatch text and served S17 alone, is gone. This is the idiom
of S1 and S2 (version 4 of the minors check, above), chosen over a
finer text pattern (the spec's call 7), and as there the field is the
answer's own account, not cross-checked against the dispatch text.
Rescored on 2026-10-23 with `rescore.mjs` (commands below), the
recorded 2026-10-20 S17 answer passes the corrected check, and the same
answer with `round_ids` set to `["I1"]` fails it. The recorded answer
predates the field, and `roundIds` reads its absence as empty, so the
pass shows that the corrected check no longer fails on `I1` named as
the fix wave's history, not that a scenario agent fills the field as
intended. The five-check result of the 2026-10-20 run stands as
recorded (S17, four of five; "Results, 2026-10-20", above). S17 has
not run on the corrected check; it is one of the scenarios of the
verification run in spec section 6.

`rescore.mjs` reruns a harness's checks on the answers a results file
recorded, with no agent call, so a changed check can be read against
stored answers before a run is spent:

```bash
node tools/green/rescore.mjs HARNESS RESULTS_JSON [KEY...]
```

It wraps `HARNESS` as the syntax check does and calls it with a stub
agent that returns the recorded answer for each `green:<key>:<rep>`
label, with `only` set to the keys given (every key that
`RESULTS_JSON`'s `.result.green` records when none is given), `reps` to
the highest recorded rep, and `args.sdd` to a fixed placeholder, since
the directory enters only the prompt text. It prints one line per
recorded answer, in the file's order, `<key> <checks as compact JSON>`,
so its output diffs against the checks the file stored. It exits 0
when every selected answer was rescored, 1 when a key given has no
recorded answer or the harness has no scenario for a recorded one, and
2 on a usage error. The S17 figures above come from:

```bash
R=tools/green/2026-10-20-results-amendment.json
H=tools/green/2026-09-25-unit-controller-workflow.js
diff <(node tools/green/rescore.mjs $H $R) <(jq -r '.result.green[] | "\(.scenario) \(.checks|tojson)"' $R)
t=$(mktemp -d)
jq '(.result.green[] | select(.scenario == "S17-final-note-after-fix-wave") | .result.round_ids) = ["I1"]' $R > $t/r.json
node tools/green/rescore.mjs $H $t/r.json S17-final-note-after-fix-wave
```

On the harness as committed at `eb5a84f` the diff was empty; after the
change it shows only S17's line, with
`"no_findings_in_note_dispatch":true` from the rescore against `false`
as stored, and the last command prints
`"no_findings_in_note_dispatch":false`. After the change, the same diff
on `2026-10-20-results-pause.json` shows only D14's line, which gains
`"no_running_claim":false`, the value "Results, 2026-10-20" reports as
computed on 2026-10-20.

## Results, 2026-10-23: superpowers 7.0.1

The verification run of a candidate release, made by the driving
session on 2026-10-23 at 15:54 local (the first agent's `startedAt`),
before the plugin upgrade: one rep each, on the `opus` alias at medium
effort, the harness at `dce33fb`, the skill at dotfiles `87c113d`, and
`args.sdd` at a clone of `obra/superpowers` at tag `v7.0.1` (commit
`2ce8aa15d05b`, loop hash `49e0f5325d56`). It took 7 agents, every one on
`claude-opus-5-5`, 477,785 tokens and 24 tool calls, from the file's own
`agentCount`, `totalTokens`, `totalToolCalls` and `workflowProgress`
(`2026-10-23-results-7.0.1.json`).

| Scenario | Reps passing every check |
|---|---|
| `S1-fix-small-ctx` | 1 of 1 |
| `S2-fix-large-ctx` | 1 of 1 |
| `S3-fable-limit` | 1 of 1 |
| `S9f-pause-in-final-phase` | 1 of 1 |
| `S12-late-notification-earlier-round` | 1 of 1, its first run |
| `S16-note-round-reviewed-clean` | 1 of 1 |
| `S17-final-note-after-fix-wave` | 1 of 1, under the `round_ids` check of `dce33fb` |

The owner's criterion was the candidate alone, one rep, every check
passing; it held, and 7.0.1 was installed and pinned on 2026-10-26
(decision 24 in `../../docs/decisions.md`). The agents read the
candidate's `SKILL.md` and the `references/` files it names (S1 and S2
`fix-loop.md`, S3 and S17 `final-review.md`), so the run exercised the
new layout and not only the overrides. `rescore.mjs` on the file
reproduces all seven recorded check results.

## The tick-script check (2026-09-26)

`tick-script-check.sh [SCRIPTS_DIR]` is a plain shell check of the
installed `openspec-section-tick`, `openspec-section-brief` and
`section-span.awk` (default
`$HOME/projects/akalongman/claude-sdd/skills/apply/scripts`).
It builds a throwaway git repository per case from the two task fixtures
and compares the task file and the ledger with what the case expects, so
no model is involved. The eight cases are the failure paths an external
review found on 2026-09-26 plus the happy path: an unknown id writes
nothing (exit 5); a valid id mixed with an unknown one writes nothing;
the happy path ticks, appends one ledger line, keeps the file mode and
leaves no temp file; an already ticked id beside an open one proceeds
and an all-ticked list exits 3 without a ledger line; a temp-file failure
(the change directory made read-only) leaves both files untouched;
backtick and tilde fences are never items for the brief's count or the
tick; an id that exists only inside a fence is unknown; and the default
with no ids ticks only the named section. Run on 2026-09-26: 8 of 8 on
the new scripts, 2 of 8 on the scripts at dotfiles HEAD before the change
(decision 18 in `../../docs/decisions.md`).
