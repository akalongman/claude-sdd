# The apply driver under `isolated`

These rules apply when the run is launched with `isolated`, or when
`.worktrees/<name>` holds the run's ledger, with the word or without it.
Read them before This machine's item 1 and before any worktree, branch or
dispatch, and again before the final message. `<name>` is the change name
for an OpenSpec change and, for a plan, the plan's file name without
`.md`, so a relaunch finds the same folder again. Look for
`.worktrees/<name>` under the main checkout's root (the first path
`git worktree list` prints), so a relaunch from inside the worktree finds
it too. `<worktree root>` is that folder's absolute path;
`<launch checkout root>` is the root of the checkout you were launched in.
"Item N" below is this file's item; This machine's items are the skill's.

1. **A relaunch.** When `.worktrees/<name>` holds the run's ledger,
   `.worktrees/<name>/.superpowers/sdd/<name>/progress.md` (the source's
   workspace inside that worktree, for an OpenSpec change and a plan
   alike), and its `Commit mode` line names that worktree, run from that
   worktree: This machine's item 1 resumes from that ledger, and nothing
   is made, copied or run again: no worktree, no branch, no copy, no
   bootstrap, no gate run. The relaunch check tests for that file and
   runs no script, so it creates nothing there (`sdd-workspace` creates
   the folder it prints). The run goes on reading the worktree's copy of
   the source, not the launch checkout's. A source loaded before this
   point came from the launch checkout, so load it again from inside the
   worktree (for OpenSpec the same `openspec instructions apply` call,
   for a plan the worktree's plan file) and use only that answer; a
   finished run then reaches the `all_done` path item 11 relies on. This
   holds for a bootstrap worktree and a bare one, for a relaunch from the
   worktree or from the main checkout, and for one that leaves out the
   word `isolated`, since the ledger, not the word, says where the run
   lives. A `.worktrees/<name>` folder or a `<name>` branch that exists
   without such a ledger stops the launch: name what exists and touch
   nothing. A bootstrap that failed on a first launch leaves exactly
   that. Items 2 to 10 are for a first launch, and item 11 for the end of
   every run, relaunched or not.
2. **The source is copied as it stands.** The worktree is made from HEAD
   and holds only what is committed there: an uncommitted change is
   missing, a plan in an ignored plans folder is never there, and an older
   committed copy would be read in place of the launched one. So right
   after `git worktree add` (items 3 and 5), copy the source's files from
   the checkout you were launched in into the worktree, at the same paths,
   as they stand:
   `scripts/source-copy <launch checkout root> <worktree root> <path>...`,
   each `<path>` relative to the repository root. A file edited there
   arrives edited, an untracked file untracked, an ignored file ignored,
   and a file deleted inside a copied folder is deleted in the worktree
   too. Nothing is committed, on the launch branch or on the run's.
   - The source's files: for an OpenSpec change, its folder
     `openspec/changes/<name>/`; for a plan, at any path, the plan file and
     the spec its `**Spec:**` line names, when it names one. A PRD or spec
     turned into a plan at launch is a plan here, and the PRD is the spec
     it names. A file outside the repository is not copied and its path is
     not passed: the run reads it where it is, by its absolute path.
   - From then on every script and dispatch reads the worktree's copy, and
     the run's own amendments of the source (after a `needs-ruling`) and
     its ticks are made there. An edit made in the launch checkout after
     the launch does not reach the run, so the launch message names the
     copy's path and says so.
   - The copy, its undo (item 8) and the copy into the run's archive
     (item 11) all go through `scripts/source-copy`, never commands of
     your own, since the undo has to put back exactly what the copy
     replaced.
   - A copy that exits 2 has refused a path before writing anything (a
     path absent from the launch checkout, say), so the worktree is as
     `git worktree add` made it. Stop before any dispatch, with a bootstrap
     or without: run `git worktree remove .worktrees/<name>`, then
     `git branch -d <name>`, neither forced and with no undo, and name the
     path the copy refused. If either removal refuses, stop with what is
     left and the commands to finish by hand, as item 8 does. A run would
     otherwise read HEAD's older copy of a source file that has vanished.

   This item holds for every first launch, with a bootstrap or without.
3. **Find the bootstrap**, the first that exists of
   `composer worktree:setup`, `npm run worktree:setup` and
   `make worktree:setup`. With one, run
   `git worktree add .worktrees/<name> -b <name>` from HEAD, the source's
   copy (item 2), the bootstrap and the ledger line
   `Commit mode: commit on <name> in .worktrees/<name>`, in that order,
   then run from the worktree; items 4 to 8 do not apply. The worktree
   stays until the owner runs the project's teardown. A bootstrap that
   fails stops the launch and leaves the worktree and the branch in
   place. The stop names the failing command and its exit status, and
   gives the owner the way back, written out in full:
   `scripts/source-copy --undo <worktree root> <path>...` with item 2's
   paths, then `git worktree remove .worktrees/<name>`, then
   `git branch -d <name>`, neither forced. The driver names these
   commands and runs none of them.
4. **Without one, check the folder.** `git check-ignore -q
   .worktrees/<name>` must succeed. If `.worktrees/` is not ignored, stop
   before creating anything and say so, editing no ignore file: a worktree
   in a folder git does not ignore shows in the main checkout's status and
   in every tool that walks its tree.
5. **Create the worktree bare:** `git worktree add .worktrees/<name> -b
   <name>` from HEAD, then copy the source into it (item 2).
6. **Run the gates once in it**, as the final phase would (This machine's
   item 4: for OpenSpec `openspec validate <name> --strict` first, and
   `specs:lint` when the project has it). Each command's output goes to a
   file in one folder made with `mktemp -d`, outside the worktree, rather
   than into the session: a file inside the worktree that git does not
   ignore would make item 8's unforced removal refuse.
7. **They pass, or the project defines none:** run from the worktree and
   ledger
   `Commit mode: commit on <name> in .worktrees/<name> (bare worktree: <commands> passed)`,
   or `Commit mode: commit on <name> in .worktrees/<name> (bare worktree: no gates)`.
   In a bare worktree those commands are the run's gate set: the
   controller overrides' Gates bullet has every controller run the
   commands the line names, scoped to the unit as usual, and add none,
   since a controller that found a command the probe never ran would
   otherwise fail on it partway through the run, with units already
   committed. The controllers already read the `Commit mode` line.
8. **One fails:** undo the copy with
   `scripts/source-copy --undo <worktree root> <path>...`, item 2's paths,
   which puts them back as HEAD holds them so that the worktree is clean
   again. Pass the worktree's root, never the launch checkout's: there the
   undo would put the launch checkout's own source back to HEAD. Then run
   `git worktree remove .worktrees/<name>`, then `git branch -d <name>`,
   neither forced, since the branch was made seconds earlier and has no
   commit of its own. Stop before any dispatch, with a message that names
   the failing command, its exit status, its last lines and the
   `mktemp -d` folder that holds the outputs, says that the project has no
   worktree bootstrap, and offers two ways on: add a `worktree:setup`
   script, or launch without `isolated`. It also says that if the same
   command fails in the main checkout, HEAD itself is failing, since the
   probe runs once and cannot tell the two apart. If either removal
   refuses, stop with what is left and the commands to finish by hand.
   Nothing is ledgered, since the run's ledger would live in the worktree.
9. **`handsoff`** follows the same steps and asks nothing. Every stop in
   them comes before the launch, so it stops a `handsoff` run too.
10. **A bare worktree stays** until the owner removes it
    (`git worktree remove .worktrees/<name>`, and `git branch -d <name>`
    once merged), since no project teardown exists for it. While the run's
    copy of the source holds files git does not ignore, that unforced
    removal refuses, so the copy, with the run's ticks and amendments,
    cannot vanish with the worktree unnoticed; the owner commits it on the
    run's branch or deletes it first.
11. **The run's end says where the source now lives.** The worktree's copy
    is the only one holding the run's ticks and amendments, and item 10's
    refusal does not always guard it: git removes a copy it ignores (a
    plan from an ignored plans folder) with the worktree without a word,
    and a project's teardown may force the removal. So, after
    `scripts/run-archive` has printed the run's archive path `<archive>`
    and before the final message, run `mkdir -p <archive>/source` and
    `scripts/source-copy <worktree root> <archive>/source <path>...` with
    item 2's paths, so the source's final state outlives the worktree
    whatever git ignores. The final message then names the copy in the
    worktree and the one in the archive, and says how to keep the run's
    version: for an OpenSpec change, run `/opsx:archive` inside the
    worktree, never in the launch checkout, which still holds its own
    unticked version and would merge those deltas into itself, then commit
    the result on the run's branch, which is how it reaches the merge; for
    a plan, commit the worktree's copy on the run's branch, or take it from
    the archive. Leave the launch checkout's own version as it was, for the
    owner to delete or reconcile once the branch is merged: writing the
    run's version back there could overwrite an edit made after the
    launch. On a relaunch that finds the run done (the `all_done` path),
    the `/opsx:archive` suggestion names the worktree the same way.

Since these rules apply before This machine's item 1, This machine's item
2, the stop on uncommitted changes in the units' files, then runs in the
worktree, where a first launch has only the source's copy and a relaunch
also an incomplete attempt's edits. Edits in the launch checkout cannot
collide with a run in a worktree, so they do not stop an `isolated`
launch; the source's own edits travel in the copy, and the paths item
2's copy brought never stop the launch. This holds for a bootstrap
project's launch too: the check reads the worktree, never the launch
checkout, whose edits the run would never see.
