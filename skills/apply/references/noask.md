# The apply driver while noask is on

Run `noask status` at launch, before acting on every controller return and
before a push. It answers for your own session, on by the session's own
switch or by the global one, and the rules below are the same under either.
A line that ends in `handsoff` says one thing more: the owner switched this
session with `/noask on handsoff`, which is the word to publish (rule 5).
When it reads `off` or `expired` (`expired <until>`), nothing here applies,
and a run launched with `handsoff` goes on as the skill says. Anything else
means every rule below applies. The first `on ...` line of a run (the ledger
holds no `Noask: seen on` line yet) is ledgered `Noask: seen on at <time>`;
an `unreadable ...` line, or a status command that fails, is ledgered
`Noask: status unreadable (<error>)` and counts as on, as it does for the
hooks, `<error>` being the line's reason or the command's exit status and
stderr. These lines are never removed: they tell a reader why a run launched
without `handsoff` ruled for itself. `<time>` in a ledger line is the local
time of the reading, `HH:MM`, taken from the clock (`date +%H:%M`), not from
the status line. `Section N:` below stands for the unit's prefix, as in the
skill (`Task N:` for a plan, `Final phase:` in the final phase).

1. **Waiting.** Every turn you end to wait (a dispatch made, a `waiting` or
   `paused` return, a relayed hand-back, a child not yet reported, a pause
   in force) ends on `noask: waiting: <the ledger line you just wrote>` as
   the last line of the message. Answer a Stop-hook continuation received
   while a unit is live by printing that line again and ending the turn;
   never by a dispatch, a resume, a stop of a child or an edit (2026-10-13,
   an orphaned implementer ran beside the retry). Answer a continuation
   reading "nothing of yours is running" by looking for the unit's return
   first (the ledger, and ListAgents for the live attempt's controller),
   since its notification may be on the way, and then by the skill's rule
   for an incomplete attempt (This machine, item 1); never by a second
   dispatch beside an attempt that may be live.
2. **Status and mode.** While noask is on, every dispatch carries the line
   `Mode: handsoff`, the mode a controller already knows, whether or not
   the owner gave the word. A `needs-ruling` return from a controller
   dispatched without the mode is resumed once with "Mode: handsoff: rule
   and continue", the skill's defect path (driver loop, item 3). `step`'s
   continue-or-stop prompt is skipped and ledgered
   `Noask: step prompt skipped`. A controller already dispatched with the
   mode keeps ruling for its unit after noask goes off; the next dispatch
   reads the status again.
3. **No source.** `/sdd:apply` with no argument, or with several candidate
   sources, ends on `noask: blocked: no source named` and asks nothing:
   choosing what to implement is never a ruling.
4. **Parked, not asked.** The exceptions the skill makes for the owner
   become parked units, never rulings and never a whole-run stop. The drift
   question after a resume ("the tree changed while paused; continue on it,
   or stop?") and the `needs-ruling` a controller returns on a resume, which
   the skill asks of the owner even under `handsoff`, are ledgered
   `Section N: parked (noask: <question>)`; print `blocked: <question>` and
   take the next unit that does not depend on it. A `paused` return whose
   point is a denied tool, and a second `failed` return, are parked the same
   way, the denied call or the failure standing as `<question>`. With no
   independent unit left, end on `noask: blocked: <why>`. An owner's `pause`
   in force is honoured as the skill says, the turn ending on the waiting
   line. A `handsoff` run while noask is off keeps asking those two
   questions: both arise on a resume, which the owner has just typed.
5. **Publication.** Publishing is the owner's word and nothing else. The
   `handsoff` ending's push and request (the skill's Handsoff section) run
   when the owner gave the word, at the launch or by the session's switch
   (a status that ends in `handsoff` at the run's end), and never otherwise:
   a run without the word rules for itself and pushes nothing. Read the
   status once more before the push, and push with a plain push
   (`git push -u <remote> <branch>`), never a forced one. When the push is
   refused, as it is under noask in a session whose own switch is not at
   `handsoff`, ledger `Handsoff: not pushed (refused under noask)`, open no
   request, and in the final message name the branch and say the push is
   pending; never retry it in another spelling.
6. **Branch.** The run commits on the branch it was launched on, as the
   skill says (This machine, item 2), a default branch included: the owner
   launched it there, and the rule's `blocked: commit on <branch>` is for a
   session doing its own work. When the noask rule file cannot be read and
   the hooks answer with their short built-in text, rules 5 and 6 still
   govern the run, not that text's "do not commit on a default branch" and
   "do not push", which are for a session doing its own work.
7. **Own writes.** The run's own writes outside the worktree stay:
   `scripts/run-archive` copies the workspace to the config directory's
   `docs/tmp/apply-runs/` and parks the `Handed to` lines through `later`,
   and `<ws>` is deleted only after the archive printed its path, as the
   skill says. Parking a note is not acting on one.
8. **Offers.** Print the final message's `offer:` lines as report lines
   only: never ask them and never write their items into the plan file.
9. **End.** The final message ends on `noask: done`, or on
   `noask: blocked: <final status>` when the final phase ended with
   anything but `complete`.
