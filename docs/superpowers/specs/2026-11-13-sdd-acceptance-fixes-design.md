# sdd: the unit's file list, and `isolated` with or without a bootstrap

Design, 2026-11-13. Status: approved by the owner on 2026-11-14, then
revised the same day for the source rule and the run's end (below). It
answers the two findings of the plugin's acceptance (`docs/decisions.md`
entry 3, commit `ad2edbf`): an OpenSpec brief carries no file list, and
`isolated` stops in every project without a worktree bootstrap. The
owner ruled the second in that entry and chose the approach to the first
on 2026-11-13. A review of this design found two more defects in today's
`isolated`, in projects with a bootstrap too, and on 2026-11-14 the
owner ruled that their fixes apply to every `isolated` run. The approved
draft fixed the first by requiring an OpenSpec change to be committed
before the launch; the owner then replaced that rule with one for every
kind of source, an OpenSpec change, a superpowers plan or a custom plan
alike: the run copies the source into its worktree as it stands and
commits none of it (Part 2, item 2). Since that copy is then the only
place holding the run's ticks and amendments, the run's end says where
it is and keeps a copy of it in the run's archive (Part 2, item 11).
Line numbers below are at `7cca493`. The build comes after the phase 2
(noask) plan's Task 9, which rewrites the same two prompt files.

## Intent

Both findings come from rules written with plan sources in mind. A
superpowers plan gives every task a `**Files:**` block, so the skill's
rules say "the brief's file list" and mean that block. An OpenSpec
section is a heading and its checkbox items, with no such block, so
those rules have nothing to read. And `isolated` assumed that every
project needs a setup script before a worktree can run its tests, which
is false for a project with no dependencies to install (a shell command
and its tests, this repository, laterbox).

### A worked example: the file list

An OpenSpec change `add-export` has this section:

```
## 2. Export
- [ ] 2.1 Add a CSV export to `bin/report`
- [ ] 2.2 Cover it with tests
```

Its implementer edits `bin/report`, creates `tests/export.bats` and
`tests/fixtures/rows.csv`, and commits. The owner types `pause` while
the reviewer runs.

Today the controller is told to run `sdd-checkpoint` "on the brief's
file list", and the brief has none. It either guesses a list (say
`bin/report` and `tests/`) or passes nothing, which exits 2 and is
ledgered `checkpoint failed (exit 2)`, which a resume reads as drift.
After a lost session a fresh controller guesses again, maybe a different
list, and any difference reads as drift although nothing moved.

After this change:

1. The brief carries a `**Files:**` block naming `bin/report`, and the
   brief script writes `section-2-files.txt` holding that one line.
2. The implementer's summary ends with
   `Files: bin/report, tests/export.bats, tests/fixtures/rows.csv`, and
   the controller appends the two paths not yet on the list.
3. The pause runs `sdd-checkpoint --list <ws>/section-2-files.txt` and
   ledgers `Section 2: paused (<point>; heads <repo> <sha7>; tree <hash>)`.
4. The resume, by the same controller or by a fresh one, reruns the
   same command on the same file. Nothing moved, so the lines are equal
   and it ledgers `Section 2: resumed`.

### A worked example: `isolated`

The same change, launched as `/sdd:apply add-export isolated` in a
project with no `worktree:setup` script.

Today the driver stops before creating anything.

After this change it creates `.worktrees/add-export` on a new branch
`add-export` and runs the project's gates there once, the whole set the
final phase runs (`openspec validate add-export --strict`, then the
project's lint, analysis and test commands). In a project like the
example they pass. The ledger says
`Commit mode: commit on add-export in .worktrees/add-export (bare
worktree: <the gate commands> passed)`, and the run goes on from the
worktree. In a PHP project whose tests need `vendor/`, the test command
fails in the bare worktree. The driver then removes that worktree and
the branch, and stops with a message that names the missing bootstrap.

### A worked example: the two defects

The owner drafts `add-export` and launches it with `isolated` before
committing it. The worktree is made from HEAD, which holds no
`openspec/changes/add-export/`. Today, in a project with a bootstrap,
the bootstrap runs and the first read of the change in the worktree
fails (the brief script exits 2 with `no tasks file`). Without a bootstrap, the gate run's
`openspec validate add-export --strict` would fail with
`Unknown item 'add-export'`, and the stop would blame the missing
bootstrap. Had an older copy of the change been committed, the run
would go on silently with that copy's tasks. A plan fares worse where
the plans folder is ignored, as in this repository: no copy of it is
ever in the worktree.

Later the owner relaunches the run after a lost session. Today the
driver runs `git worktree add .worktrees/add-export -b add-export`
again, which refuses because the branch and the folder exist, so an
`isolated` run cannot be resumed at all.

After this change the driver, right after `git worktree add`, copies
`openspec/changes/add-export/` from the checkout it was launched in into
the worktree, uncommitted, exactly as it stands there. The bootstrap or
the gate run, the brief script and every later read then find the change
the owner launched, and no commit is made on `main` or on `add-export`
for it. A plan from an ignored plans folder, or a custom plan such as an
untracked `notes/migration-plan.md`, is copied the same way. The
relaunch goes on inside `.worktrees/add-export` from its ledger and
reads that copy.

## Goals

1. Every unit, OpenSpec section or plan task, has one file list, kept in
   the run's workspace, and every rule that speaks of the unit's files
   reads it. A pause, a resume by a fresh controller and the final phase
   then compare the same paths.
2. An OpenSpec brief shows its implementer the files its section names.
3. `isolated` runs in a project without a bootstrap when the project's
   gates pass in a bare worktree, and leaves nothing behind when they
   do not.
4. Every `isolated` run, with a bootstrap or without, reads the source
   the owner launched, whatever its kind and whether or not it is
   committed, and a relaunch goes on in the run's worktree.
5. `skills/apply/SKILL.md` stays inside its size limit after noask's
   Task 9.

## Non-goals

- The private skill's copy of the same text. It is retired at the
  switch to the plugin (entry 3), and the switch installs a release that
  carries this change if it lands first.
- A file that no item names and no report has listed yet. If such a
  file holds another session's uncommitted edits at launch, nothing
  here catches it, which is also true today for every file of an
  OpenSpec change. A check by the implementer before its first edit of
  a file would close that gap; it is left for later work.
- Resolving a name given without its folder (`MigrateCommand.php`)
  against the tracked files. Measured, it adds about 3 points of
  coverage for a second rule.
- A teardown for a bare worktree.
- Plan briefs' text: their `**Files:**` block stays as the plan wrote
  it.
- A document the source only points to (a design note a task links),
  beyond a plan's `**Spec:**` line. It is not copied, and reaches an
  `isolated` worktree as HEAD holds it.

## Anti-goals

- A list that loses a line. A path once listed stays, so a resume never
  compares fewer paths than its pause did.
- Package names, routes or settings keys shown to an implementer as
  files.
- A failed gate run that leaves a worktree or a branch behind, or a
  removal that is forced.
- Any change to how a project's bootstrap runs. For a project with one,
  this design adds the source's copy just before the bootstrap (Part 2,
  items 2 and 3) and a way back into the worktree (item 1), and nothing
  else.
- A run that reads one copy of its source while its implementers work
  from another.
- A commit of the source the owner did not make, on the branch the run
  was launched from or on the run's own branch.

## Constraints

- `tests/check-skill-size.sh` limits `SKILL.md` to 19,500 characters,
  measured on the substituted text. It measures 19,477 now, and noask's
  Task 9 leaves it at 19,485 (that plan's own trial on a copy).
- `tests/check-pause-text.sh` requires `SKILL.md` to keep the phrase
  "paths of an incomplete attempt" and never to name `sdd-checkpoint`.
- A unit controller reaches only the plugin's `bin/` by bare name (the
  plugin spec, "Reaching the checkpoint script from a controller"). The
  scripts under `skills/apply/scripts/` run in the driver, through
  substituted paths.
- `sdd-checkpoint`'s `PATH...` form keeps its output for the same
  distinct paths, so a `paused` line ledgered before the change still
  compares on a resume after it.
- Scripts are bash and pass shellcheck; README's shellcheck line names
  every script.

## Approaches

For the file list there were three. The owner chose the third on
2026-11-13.

1. **The brief alone.** The brief script lists the paths the section
   names. The list exists before the first dispatch, so the launch check
   can use it, but 45% of the sections measured name no file that
   passes the test below, and those keep no list at all.
2. **The reports alone.** The implementer ends its summary with a
   `Files:` line, and the controller keeps those paths. It covers every
   file the unit touched, but holds nothing before the first report,
   and the launch check gets nothing.
3. **Both (chosen).** The brief script seeds the list with the named
   paths, and each report adds the paths it changed. The launch check
   gets what the sections name, and the checkpoint gets everything the
   unit touched.

A fourth was dropped: deriving the list from git
(`git diff --name-only <unit base>..HEAD`). In a checkout other sessions
share, that range takes in their commits, and it misses uncommitted
work.

For `isolated` the owner's ruling in entry 3 leaves no approach open:
without a bootstrap, a bare worktree and one run of the gates in it.
For the two defects the review found, the fixes could apply to bare
worktrees only, which keeps that ruling's "a project with a bootstrap
is unchanged" to the letter but leaves both defects there, or to every
`isolated` run. The owner chose every run on 2026-11-14: the defects are
the same in both paths, and each fix only adds a clear stop or a clean
way back in.

For getting the source into the worktree there were three, and the
owner chose the third on 2026-11-14:

1. **Commit it first.** An OpenSpec change must be committed and clean
   before the launch, and a plan is read from the launch checkout by
   absolute path. It was the approved draft's rule. Its commit lands on
   the branch the run is launched from, often `main` or `dev`, and a
   project that changes those only through merge requests is left with
   an unpushed commit there. It also treats an OpenSpec change and a
   plan differently.
2. **Copy it, and commit the copy** as the run branch's first commit.
   The merge request then carries the source, but the run decides what
   is committed: an untracked custom plan the owner kept out of the
   repository goes in, and a plan from an ignored folder goes in only
   by force.
3. **Copy it as it stands, commit nothing (chosen).** One rule for
   every kind of source, no commit anywhere, and the same treatment a
   run without `isolated` gives its source, which it reads in place and
   never commits (its ticks included). The cost: the run reads its own
   copy, so an edit made in the launch checkout after the launch does
   not reach it.

## Design

### Part 1: the unit's file list

1. **The list file.** Each unit's list is a file beside its brief:
   `<ws>/section-N-files.txt` for an OpenSpec section,
   `<ws>/task-N-files.txt` for a plan task, and `<ws>/final-files.txt`
   for the final phase. One path per line, relative to the repository
   root or absolute; a leading `~/` means the home folder. Lines are
   only ever added.

2. **Seeded by the brief scripts.** Each brief script creates the list
   file when it writes a brief (empty when there is nothing to list) and
   adds the brief's paths not yet on it. A brief written again after the
   source was amended can add lines and never removes one.
   - `task-brief` (plans) adds every backtick path of the task's
     `**Files:**` block, without a `:N` or `:N-M` line suffix, otherwise
     as written. Its header, which says the copy exists only to fix the
     task boundary, gains this second reason.
   - `openspec-section-brief` adds the section's named paths (item 3)
     and writes them into the brief, just before the section text, as a
     block like this one:

     ```
     **Files:** the paths this section names. The section may need
     others; your report names every file you change.
     - `bin/report`
     ```

     A section that names none gets no block.

3. **A named path (OpenSpec).** In the section's text outside code
   fences, a backtick span is a named path when all of these hold:
   - it has no whitespace, none of `( ) < > { } [ ] * ? = , ; ' " | \`,
     no `::` and no `://`, does not start with `-`, `$`, `~`, `/` or
     `@`, and does not end with `/`;
   - after dropping a `:N` or `:N-M` suffix and a leading `./`, it holds
     a `/` or ends in an extension of one to eight letters and digits
     that starts with a letter;
   - relative to the repository root it is a file, or it does not exist
     yet, holds a `/` and its folder exists (a file the section will
     create). A folder is never a named path (my call): kept, it would
     be shown to the implementer as a file, and every uncommitted file
     under it would stop the launch or read as drift on a resume.

   Words outside backticks are not read. The rule lives in one new
   script, `skills/apply/scripts/named-paths`, which prints the named
   paths of a Markdown file, one per line, in first-seen order. The
   brief script runs it on the section, and the driver runs it on the
   whole `tasks.md` at launch (item 5).

   Measured on 2026-11-13 over the OpenSpec task files on the owner's
   machine (635 distinct files, worktree copies left out, 3,631
   sections with checkbox items): 66% of sections hold a span of the
   first two kinds, and 55% hold one that also passes the third. 73
   sections name a folder that exists, 30 of them nothing else. Reading
   words outside backticks would add one section. Most of a
   sample of 45 spans that failed the third test were not files:
   package names, routes, branch names, a MIME type, model names. The
   third test ran against today's trees, where most of those changes
   are already applied; a new change names more files that do not
   exist yet, and the folder test keeps those whose folder does.

4. **Grown from the implementer's reports.** `implementer-overrides.md`
   gains one line: end the summary you return with
   `Files: <path>, <path>`, every path you created, modified, deleted
   or renamed in this dispatch or fix round, committed or not, relative
   to the repository root, or `Files: none`. The controller appends the
   paths not yet on the list in the same call that ledgers the report.
   The final phase's controller creates `final-files.txt` when it is
   missing, from every unit's list in unit order, and appends its own
   reports' paths the same way.

5. **Read by every rule about the unit's files.** The overrides gain a
   bullet defining "the unit's file list" as that file. The rules that
   read it:
   - `unit-controller-overrides.md` line 58 (the gates over the unit's
     files) and line 151 (a stopped role's replacement reads
     `git diff --stat` on the unit's paths): words unchanged, now
     defined.
   - Line 90, the condition for a controller's own ruling: "the change
     stays inside the brief's file list" becomes "inside the unit's file
     list".
   - Lines 133 to 136, the pause: `sdd-checkpoint --list <the unit's
     list file>`.
   - Line 178, the final phase: the checkpoint reads `final-files.txt`.
   - `SKILL.md` line 28, the launch check, "Stop on uncommitted changes
     in the units' files": for an OpenSpec change, those files are the
     paths `scripts/named-paths` prints for its `tasks.md`, since no
     brief exists yet at launch. The paths of an incomplete attempt are
     its list file.
   - `SKILL.md` lines 27 and 39 (the final phase's incomplete attempt,
     the prior-attempt framing): words unchanged, now defined.
   - `bin/sdd-checkpoint` lines 12 and 13, its usage comment.

   A plan unit gets the same list: its `**Files:**` block plus what its
   implementer reports (my call). One definition then serves both
   sources, and a plan unit's checkpoint also covers a file its block
   left out. The controller's own rulings may then reach a file the
   unit's implementer touched outside the block, which is a small
   widening for plans.

6. **`sdd-checkpoint --list FILE`.** The option may be given more than
   once and mixed with `PATH` arguments. It reads one path per line,
   skips blank lines, reads a leading `~/` as the home folder, and drops
   a path given earlier, keeping the first, so the order of the heads
   stays first-seen. An empty set prints `heads none; tree <hash>` and
   exits 0: a unit paused before any file is known has nothing to
   drift. A list file that does not exist exits 2, as no argument at
   all still does.

7. **Known limits.**
   - An implementer the owner stops by hand returns no report, so a
     file it created and never reported is not on the list until its
     replacement reports it; the pause's checkpoint does not cover it.
   - A brief written again during a pause (a source amended after a
     `needs-ruling`) can add paths, and the resume may then report
     drift that is only the longer list; the owner answers the drift
     question.

### Part 2: `isolated`, with a bootstrap or without

The `isolated` text leaves `SKILL.md` for a new file,
`skills/apply/references/isolated.md`. `SKILL.md` line 29 becomes one
pointer: "**Isolated.** With `isolated`, or when `.worktrees/<name>`
holds this run's ledger, `references/isolated.md` applies before item 1
and any worktree, branch or dispatch, and again before the final
message." `<name>` is the change name for
OpenSpec and, for a plan, its file name without `.md` (my call: today's
text never says, and a relaunch has to find the same folder again).

The reference says, in order:

1. **A relaunch.** When `.worktrees/<name>` holds the run's ledger
   (`progress.md` in the workspace the source has inside that worktree)
   and its `Commit mode` line names that worktree, the driver runs from
   that worktree, This machine's item 1 resumes from that ledger, and
   nothing is made, copied or run again: no worktree, no branch, no
   copy, no bootstrap, no gate run. The run goes on reading the
   worktree's copy of the source, not the launch checkout's. This holds
   for a bootstrap worktree and a bare one, for
   a relaunch from the worktree or from the main checkout, and for one
   that leaves out the word `isolated` (my call: the ledger, not the
   word, says where the run lives). A `.worktrees/<name>` folder or a
   `<name>` branch that exists without such a ledger stops the launch,
   naming what exists, and nothing is touched; a bootstrap that failed
   on a first launch leaves exactly that. Items 2 to 10 are for a
   first launch, and item 11 for the end of every run, relaunched or
   not.
2. **The source is copied as it stands.** The worktree is made from HEAD
   and holds only what is committed there: an uncommitted change is
   missing, a plan in an ignored plans folder is never there, and an
   older committed copy would be read in place of the launched one. So
   right after `git worktree add` (items 3 and 5) the driver copies the
   source's files from the checkout it was launched in into the
   worktree, at the same paths relative to the repository root, as they
   stand: a file edited there arrives edited, an untracked file
   untracked, an ignored file ignored, and a file deleted there is
   deleted in the worktree too. Nothing is committed, on the launch
   branch or on the run's (the owner, 2026-11-14).
   - The source's files: for an OpenSpec change, its folder
     `openspec/changes/<name>/`; for a plan, at any path, the plan file
     and the spec its `**Spec:**` line names, when it names one. A PRD
     or spec turned into a plan at launch is a plan here, and the PRD is
     the spec it names. A file outside the repository is not copied:
     the run reads it where it is, by its absolute path.
   - From then on every script and dispatch reads the worktree's copy,
     and the run's own amendments of the source (after a
     `needs-ruling`) and its ticks are made there. An edit made in the
     launch checkout after the launch does not reach the run, so the
     launch message names the copy's path and says so.
   - The copy, its undo (item 8) and the copy into the run's archive
     (item 11) are one script, `skills/apply/scripts/source-copy` (my
     call): the undo has to put back exactly what the copy replaced,
     and a driver following prose would choose its own commands each
     time.

   This step holds for every first launch, with a bootstrap or without
   (the owner, 2026-11-14).
3. **Find the bootstrap** as today, the first that exists of
   `composer worktree:setup`, `npm run worktree:setup` and
   `make worktree:setup`. With one, `git worktree add`, the source's
   copy (item 2), the bootstrap and the `Commit mode` line run in that
   order, and items 4 to 8 do not apply. A bootstrap that fails leaves
   the worktree and the branch as today.
4. **Without one, check the folder.** `git check-ignore -q
   .worktrees/<name>` must succeed. If `.worktrees/` is not ignored,
   stop before creating anything and say so (my call): a worktree in a
   folder git does not ignore shows in the main checkout's status and
   in every tool that walks its tree, and the plugin does not edit a
   project's ignore files.
5. **Create the worktree bare:** `git worktree add .worktrees/<name> -b
   <name>` from HEAD, then copy the source into it (item 2).
6. **Run the gates once in it**, as the final phase would (This
   machine, item 4: for OpenSpec `openspec validate <name> --strict`
   first, and `specs:lint` when the project has it), each command's
   output going to a file outside the worktree rather than into the
   session (a file inside it that git does not ignore would make the
   unforced removal of item 8 refuse).
7. **They pass, or the project defines none:** run from the worktree
   and ledger `Commit mode: commit on <name> in .worktrees/<name>
   (bare worktree: <commands> passed)`, or `(bare worktree: no gates)`.
   In a bare worktree those commands are the run's gate set (my call):
   the overrides' Gates bullet says that when the `Commit mode` line
   reads `bare worktree`, every controller runs the commands it names,
   scoped to the unit as usual, and adds none. A controller that found
   a command the probe never ran would otherwise fail on it partway
   through the run, with units already committed, which is the outcome
   the probe exists to prevent. The controllers already read the
   `Commit mode` line (overrides line 12).
8. **One fails:** undo the copy (`source-copy --undo`), which puts the
   source's paths back as HEAD holds them, so that the worktree is clean
   again; then `git worktree remove .worktrees/<name>`, then
   `git branch -d <name>`, neither forced (the branch was made seconds
   earlier and has no commit of its own). Stop before any dispatch,
   with a message that names the failing command, its exit status and
   its last lines, says that the project has no worktree bootstrap,
   and offers two ways on: add a `worktree:setup` script, or launch
   without `isolated`. It also says that if the same command fails in
   the main checkout, HEAD itself is failing (my call: the probe runs
   once, as ruled, so it cannot tell the two apart). If either removal
   refuses, stop with what is left and the commands to finish by hand.
   Nothing is ledgered, since the run's ledger would live in the
   worktree.
9. **`handsoff`** follows the same steps and asks nothing. Every stop
   in them comes before the launch, so it stops a `handsoff` run too.
10. **A bare worktree stays** until the owner removes it
    (`git worktree remove .worktrees/<name>`, and `git branch -d <name>`
    once merged), since no project teardown exists for it. While the
    run's copy of the source holds files git does not ignore, that
    unforced removal refuses, so the copy, with the run's ticks and
    amendments, cannot vanish with the worktree unnoticed; the owner
    commits it on the run's branch or deletes it first.
11. **The run's end says where the source now lives.** The worktree's
    copy is the only one holding the run's ticks and amendments, and
    item 10's refusal does not always guard it: git removes a copy it
    ignores (a plan from an ignored plans folder) with the worktree
    without a word, and a project's teardown may force the removal.
    So, after `scripts/run-archive` has printed the run's archive path
    and before the final message, the driver runs `mkdir -p
    <archive>/source` and `scripts/source-copy <worktree root>
    <archive>/source <path>...` with item 2's paths, so the source's
    final state outlives the worktree whatever git ignores (my call).
    The final message then names the copy in the worktree and the one
    in the archive, and says how to keep the run's version: for an
    OpenSpec change, run `/opsx:archive` inside the worktree, never in
    the launch checkout, which still holds its own unticked version and
    would merge those deltas into itself, then commit the result on the
    run's branch, which is how it reaches the merge; for a plan, commit
    the worktree's copy on the run's branch, or take it from the
    archive. The launch checkout's own version is left as it was, for
    the owner to delete or reconcile once the branch is merged: writing
    the run's version back there could overwrite an edit made after the
    launch. On a relaunch that finds the run done (the `all_done` path),
    the archive suggestion names the worktree the same way.

Since the reference applies before This machine's item 1, item 2's
stop on uncommitted changes in the units' files then runs in the
worktree, where a first launch has only the source's copy and a
relaunch also an incomplete attempt's edits. Edits in the launch
checkout cannot collide with a run in a worktree, so they no longer
stop an `isolated` launch; the source's own edits travel in the copy.
This changes a bootstrap
project's launch too (my call): today the check reads the main
checkout, and stops for edits the run would never see.

README's paragraph on `isolated` (lines 104 to 110) says the same in
short, the relaunch, the source's copy and the run's end included.

### Size

The pointer frees 250 characters (458 out, 208 in), and the launch
check's OpenSpec clause costs 101, so `SKILL.md` ends at 19,336 after
noask's Task 9 (both edits measured on a copy of today's file,
19,328, plus that task's 8). The rules this design
adds for every `isolated` run, the source's copy included, all live in
the reference.

### Tests

- `tests/test-sdd-checkpoint.sh`: `--list` gives the same line as the
  `PATH` form for the same paths; a repeated path is dropped; blank
  lines are skipped; `~/` is read; an empty list gives
  `heads none; tree <hash>` with exit 0; a missing list file exits 2;
  `--list` and `PATH` arguments mix.
- A new test of `named-paths`, one case per clause of Part 1, item 3:
  kept, a file that exists, a file to create in an existing folder,
  `path:12-30`, `./x`; dropped, a folder that exists (`tests/unit`),
  `laravel/horizon` (no such folder),
  `app.name` (no such file at the root), a span with a space, `src/`,
  `*.php`, `Foo::bar`, a URL, a span inside a code fence.
- A new test of both brief scripts: the block present and absent, the
  list file created, a second run adding without removing, and a plan's
  line suffix dropped.
- `tests/check-pause-text.sh` pins the pointer and the launch check's
  `named-paths` in `SKILL.md`, and the list bullet and `--list` in the
  overrides. `tests/run.sh` and `tests/test-run.sh` run the new tests.
- A test of `source-copy`: after the copy, `git status` on the
  source's paths reads the same in the worktree as in the launch
  checkout (an edited, an untracked, an ignored and a deleted file, a
  file in a folder HEAD lacks, a name with a space), and the launch
  checkout is untouched; after the undo the worktree's status is clean,
  and the unforced `git worktree remove` and `git branch -d` succeed;
  a copy into a plain folder outside every repository (item 11's
  archive) matches its source.
- A text guard for `references/isolated.md`, as `references/noask.md`
  has one (my call): it pins the relaunch rule, the source's copy, its
  undo and its copy into the run's archive, the unforced removals, and
  `/opsx:archive` inside the worktree.
- The reference is prose a driver follows, so no script test runs it.
  The next acceptance run covers it: a first launch with an uncommitted
  change (it runs from the copy, the launch branch gains no commit, and
  at the end the run's archive holds the ticked `tasks.md` and the
  final message says to run `/opsx:archive` inside the worktree), a
  first launch without a bootstrap (a bare worktree), a
  relaunch from the main checkout without the word `isolated` (it goes
  on in the worktree), a plan from an ignored plans folder, and an
  untracked custom plan outside it.

### Release and record

The change ships as the next minor version after the one the plugin
carries at the launch, since `isolated` now goes on where it used to
stop (my call). The next free `docs/decisions.md` entry records what
was built and cites this spec. Version numbers and entries go in
landing order: this build goes ahead of phase 2's held tasks, so it
ships 0.2.0 and writes entry 5, and phase 2's own release takes the
numbers after it (the owner, 2026-11-15).

## Decisions in this design (the owner may overrule)

1. Plan units get the same list file as OpenSpec sections (Part 1,
   item 5).
2. Named paths are read from backtick spans only, filtered on disk; a
   name given without its folder is not resolved, and a folder is never
   a named path.
3. An empty list is a valid checkpoint (`heads none`), and a missing
   list file is an error.
4. `isolated` without a bootstrap stops when `.worktrees/` is not
   ignored, rather than writing an ignore line.
5. A failed gate run removes the worktree and the branch with the
   unforced commands only.
6. One gate run, so the stop message names both causes it cannot tell
   apart. It runs the final phase's whole set, and in a bare worktree
   those commands bind every controller of the run.
7. A relaunch goes on in the ledgered worktree and makes, copies or
   runs nothing again, for a bootstrap worktree and a bare one (the
   owner, 2026-11-14). That it also holds from the main checkout and
   without the word `isolated` is my call.
8. A first `isolated` launch copies the source's files into the
   worktree as they stand and commits none of them, for every kind of
   source, with a bootstrap or without (the owner, 2026-11-14; it
   replaces the approved draft's rule that an OpenSpec change be
   committed first). Which files are the source's (the change's folder,
   or a plan and the spec it names) is my call.
9. For a plan, `<name>` is its file name without `.md`.
10. Under `isolated` the launch check on uncommitted changes runs in the
    worktree, so edits in the launch checkout no longer stop the
    launch, bootstrap projects included.
11. The release is a minor version step.
12. The copy and its undo are one driver-side script; a failed gate run
    undoes the copy before the unforced removals, and the gate output
    goes outside the worktree.
13. The run's end copies the source's final state into the run's
    archive and says how to keep it (for OpenSpec, `/opsx:archive`
    inside the worktree and a commit on the run's branch); nothing is
    written back to the launch checkout, and the pointer in `SKILL.md`
    sends the driver to the reference again before the final message.

## Left to the builder

- How `named-paths` and the plan `**Files:**` parse are written, and
  whether they share code.
- The exact wording of the brief's block, the implementer's line, the
  overrides bullet and the reference file, within the meaning above.
- The stop message's wording, and how the gate output files are named
  and where, outside the worktree, they go.
- `source-copy`'s arguments and how it copies, within item 2: file
  modes kept, a deleted file deleted, and nothing written in the launch
  checkout.
- The test files' layout.
- How the relaunch step finds a plan's workspace inside the worktree
  without creating one there (`sdd-workspace` creates the folder it
  prints).
