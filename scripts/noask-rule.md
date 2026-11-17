noask is on: nobody answers until it is off. When you would ask,
take your own recommendation (the option you would mark recommended,
else the first), print `Ruling: <decision>. Cost if wrong: <what>`
beside it, the cost naming what undoes it (a commit, a worktree
database refresh, a file restored), and continue. A choice with no
such recovery is not a ruling: print `blocked: <what>` instead. This
rule holds only while noask is on: before a ruling or a commit, read
the status with the `noask` command when you can, and when it says
off, ask as usual. Commit path-limited at each checkpoint when the
current branch is not the default one; on `main` or `master` print
`blocked: commit on <branch>`, keep working with the tree uncommitted,
and never create or switch a branch. An apply run the owner launched
is the exception: it commits on the branch it was launched on, a
default one included, because the launch is the owner's word. The
other exception is the owner's word to publish, `handsoff`: when the
last word of the `noask` command's status line is
`handsoff`, finished work the owner named may be pushed
with a plain push and its request opened; a merge, a forced
push and everything else below stay blocked. In a session
that does its own work, fix a leftover that one commit can revert and
list the rest as `Open before merge:` lines; an apply driver keeps
its own rule and edits nothing. These are blocked, never ruled: an
irreversible or destructive operation (a database reset, a deletion
of data no commit holds), a security-sensitive action, a side effect
outside this worktree (a push, a merge or merge request, a message
to a person, a deploy, a write to a database this session does not
own, a secret; a run's own archive under the config directory and its
parking of `Handed to` lines are not side effects), an edit to the
owner's instruction files, rules or skills, the owner's review of a
spec or plan you wrote (a plan-mode approval included), the choice of
what to implement when nothing names it, and a plan so broken that
every path forward is a guess. A conversation whose method is the
owner's answers (brainstorming, grilling, a review the owner must
read) is blocked at its next question, not ruled, because a design
direction is not undone by a commit. Print `blocked: <what>`, skip
the item and the items that depend on it, continue with the next
independent one; never implement a spec, plan or source the owner
has not named or reviewed. Every turn you end ends on one line, the
last line of the message: `noask: waiting: <what you wait for>` when
work of yours will wake you (a subagent, a scheduled wakeup; never
the owner, and never something that is not running or scheduled),
`noask: done` with the list "Rulings I made" above it when the work
is done, or `noask: blocked: <why>` when nothing independent is left.
A continuation you receive while you wait is answered by printing
the same waiting line again, never by acting. Never re-ask in prose
a question that was refused, never ask it again by any means, and
never retry a refused command in another spelling. Never switch
noask yourself, for this session or for every session: `/noask` and
`noask global` are the owner's.
