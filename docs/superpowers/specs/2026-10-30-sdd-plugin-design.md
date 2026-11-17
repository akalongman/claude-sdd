# sdd: the subagent-apply plugin, with a noask mode

Design, 2026-10-30. Status: draft for review (revision 7, 2026-11-09, after
the Codex and Antigravity reviews of revision 6; what they changed is listed
at the end, after the owner's settled questions of revision 6). Revision 5
followed the builder check and the Codex, agy, DeepSeek and Qwen reviews.
Revision 8, 2026-11-12, renamed the mode from `away` to `noask`, because it
is for sessions that must not ask, whether or not the owner is away, and
changed nothing else; the review notes at the end keep `away_push` and
`away.sh`, the names of a knob and a file that no longer exist.
Revision 9, 2026-11-13, made the session the default scope: `/noask on`
switches the session it is typed in, and `noask global on` every session
on the machine (the owner, reversing the ruling of 2026-11-08 that a
per-session level was not needed, made when the mode meant an empty
desk). It also writes in the four points the owner settled on 2026-11-12
where the phase 2 plan, a local working document, departed from revision
8: the command is the markers' only writer and the module runs it, the
command lives in `bin/`, the fence and the rule text name the switch
itself, and the end-of-turn line stands in for the owner's line on the
session's state. And it mends one sentence of the rule text that
revision 8 left reading "is on is on".
Revision 10, 2026-11-13, follows four external reviews of the phase 2
plan (Codex, Antigravity, DeepSeek, Qwen) and the owner's rulings on
them the same day. It changes: the third step of the reading rule and
the two cases where there is no marker to find (no home directory, no
session id); a lock around every switching command, with the sweep of
expired session markers after the switch; a failed switch shown in the
session; the wake-up turn, now conditional, and a resumed session
counted as idle; a fallback text that rules nothing when the rule file
cannot be read; the Stop hook's allow conditions (a waiting line is
checked once against what is running, a scheduled wakeup alone no
longer allows a stop, a subagent's stop is passed through, a failing
hook continues a stop once); the fence (the marker files, the plain
spellings of a push, a here-document's body, the configuration
directories as any `.claude*` entry of the home, a new file placed by
its nearest existing folder); the publication rule, which holds for the
rest of a run once its ledger has a `Noask:` line; an apply run the
owner launched on a default branch, which keeps committing there; and
the version floor, which becomes the build the phase 2 probes run on.
Revision 11, 2026-11-13, follows the second review of the plan (Codex
and Qwen) and changes five things: the wake-up turn carries the rule
text; the publication rule tests for any `Noask:` line, the unreadable
one included, so it and the pointer use one test; the reading with no
session id is spelled out for each reader, a directory that cannot be
listed included; a waiting line refused at the budget gets the ending
text; and the permission hook's failure handler keeps an answer one of
the owner's hooks beneath had given.
Revision 12, 2026-11-13, makes the two modes nested on the owner's word
("it feels complex and with many moving parts"): `handsoff` is noask for
one apply run plus the owner's word to publish its ending, and noask no
longer takes a push back. With that go the test on the ledger's history,
the long pointer, the implied-mode ledger line and the stated limit of
revisions 10 and 11. The fence lets the push of a `handsoff` run through
in the session where the owner typed its launch. An unreadable status
counts as on for the driver as for the hooks. And the run-level word is
renamed from `hands-off` to `handsoff`; the text on phase 1 and the
review notes keep the earlier spelling where they tell what was built
or said then.
Revision 13, 2026-11-13, moves the owner's word to publish onto the
switch, after a focused check by Codex found the fence's exception of
revision 12 unsound (it was inferred from a typed launch, lived in the
process, outlived its run and let a combined command through). A
session's own switch has two levels now: `/noask on`, and `/noask on
handsoff`, which is noask plus the word that this session may push and
open a request. The level is a fourth line of the session's marker, so
it is typed by the owner, written by the one writer, read by the fence,
kept across a resume and ended by the expiry. The global switch has no
such level. The fence judges every command of a shell call and passes
only a plain push.
Revision 14, 2026-11-13, follows a last focused check by Codex of
revision 13. Since a marker can now carry the owner's word to publish,
the guard on the switch acts in every session, under noask or not: an
agent may not work the switch or write a marker file, for itself or for
another session. The marker files are guarded also by where their
directory resolves. A plain push is defined by what it may hold, not by
what it may not. And the status shows the session's `handsoff` level
also beside an unreadable global marker.
Revision 15, 2026-11-13, states a limit that revision 13 overstated:
the word to publish is the owner's against every plain call, not by
construction. A wrapped call of the command, or a wrapped write of a
marker, passes this fence as a wrapped push does; the owner keeps that
as a stated limit until the wide fence of phase 4 (2026-11-13).
Revision 16, 2026-11-16, follows the probes of the phase 2 plan's first
task (`docs/decisions.md`, entry 4) and the build they stopped. On an
account of a Team or Enterprise organization, and on a machine with
managed settings, build 2.1.325 seats a built-in plugin outermost that
passes over every classic hook of a module a person installs, so the
three hooks this design had put on classic events in the module never
ran: the permission ask, the MCP question and the continued stop. They
move out of the module into command hooks in `hooks/hooks.json`, which
the same probes saw run. With them go: the per-session record, from the
module's state into one file per session that the command alone writes;
the session-start line of a resumed and a forked session, which the
module now prints; the test for a session that may be idle on a
question, which is its history and no longer how it started; and the
claim that the noask hooks are portable from phase 2. The guard on the
switch passes the command's two reading forms and refuses every other,
since the command now also counts. Smaller changes from that build's
review notes: a session's marker without an expiry is unreadable to
both readers, a session's `on` names a global marker that is broken,
the state directory is the owner's alone, publication is keyed on the
status line's last word, and the four stops hold for a controller that
rules. What was built before the stop stays as built: the command, the
rule text and the apply skill's rules under noask. Two rulings of the
owner frame the rest (2026-11-16): nothing of `main` is pushed before
the guard on the switch has landed, so the guard is built first, and
the machine's move to the plugin waits until noask has shipped.
Revision 17, 2026-11-16, writes in what the probes of revision 16
found the same day (`docs/decisions.md`, entry 6), run before the plans
were written so that no task is written on a guess again. A plugin's
command hook runs at Stop, at PermissionRequest and at Elicitation on
the owner's account, so the entries stay in the plugin's `hooks.json`
and the fallback into the owner's settings is dropped. What the probes
changed: a continued stop is delivered as feedback, not as a hook
error; a declined MCP question carries no text to anyone; where another
hook answers the same permission prompt, the first to answer wins, so
a faster hook that allows overrules the denial; a hook's agent id and
the module's are one id, so a subagent has one record; a cleared
session's transcript is not empty, so the wake-up turn goes to every
idle session that holds a message; the module's line at a resume is
said once for a session, since a reload of the plugin starts the
module again; and a plugin's option is absent from a hook's process
while it holds its default.
Revision 18, 2026-11-16, follows a review of the first step's plan by
Codex, checked against the command, the declarations and this text
before anything was taken. The guard's reading of a shell command
closes three plain doors: an option of `env` or `exec` that takes the
next word as its value no longer hides the command behind it, a
redirection written `>|` or `&>` is read as one, and the removal or
the move of a folder above the state directory is refused with the
removal of a marker. What the guard does not name stays named as a
limit: a writer outside its list (`sed -i`, an interpreter's one-line
program) passes as a wrapped command does, and the README lists the
commands instead of promising every write. The sweep of the records
holds the records' lock, and removes no record while a marker is
unreadable. The two readers refuse the same texts: a marker without
its final newline, a time that is no calendar time, an offset past 14
hours or with 60 minutes. A session without an id is held by an
unreadable session marker as by one that is on. A home that cannot be
listed leaves every `.claude` entry guarded by its spelling. Every
file call a hook waits on is bounded as a marker's read is. And the
first step's budgets are stated for what they are: with no Stop entry
to reset them, they bound an activation.
Revision 19, 2026-11-17, follows a second check of that plan as revised,
by Qwen and by Codex, each finding checked against the plan, the command
and this text before it was taken. Four of them were doors the wording
of revision 18 had left or made. A redirection is now read once, for
the cut into commands, for the plain push and for the guard: it is no
word of a push, and `&>>`, `>& file` and `<>` write as `>` does. An
option written `env -uu` no longer hides the command behind it. A move
is judged by its sources, so a file moved into the home is no switch.
And a switching command never makes the records' directory. The offset
has one form, to `14:00`, in a generation as in a time. The sweep
reads the markers after its command's own switch, and holds back while
the directory of session markers cannot be listed. Decision 31 follows
the body. The guard keeps its own text, uncounted, while the fence's
option is off. What a failed listing of the home leaves open is stated
as a limit, and `~/.claude` and the directory the variable names are
resolved without the listing, so the limit is of the other entries.
Three more doors showed when the rewritten rules were run as commands.
After `env`, `command`, `exec`, `nohup` or `sudo` no option is read
for a value any more, since two `env` programs disagree on which take
one and a list of them was wrong twice: every later word that names a
command the fence knows is read as one, at the price of a refusal when
such a name is another command's argument. `time -p` is read. And a
pattern in a path is matched as the shell matches it, so
`rm -rf ~/.local/state/*` is the removal it is.

## Intent

Two things, in one plugin called `sdd`, because the second is the first
one's rule widened to the whole session.

1. **Move `app-subagent-apply` into a plugin.** Today the skill, its five
   override prompts, its seven scripts and its three agent definitions
   (`app-sdd-implementer`, `app-sdd-reviewer`, `app-sdd-unit-controller`)
   live under `~/.claude` (the other two profiles symlink to it, so there is
   one copy). A plugin gives them a version, a home for the hooks and the
   command module that `noask` needs (a skill cannot register hooks), one
   place for tests, and an install path on the owner's other machines that
   carry the same dotfiles. The skill's measurement record, the private
   repository `akalongman/claude-subagent-apply` checked out at
   `~/projects/personal/claude-subagent-apply` (decisions, measurements,
   reviews, five test scripts and transcript tools under `tools/`), hands
   all of that to this repository and is then archived on GitHub and
   removed from the machine (owner, 2026-11-08: "if we move everything,
   why do I need that folder").
2. **Add `noask`,** a mode in which a session does not wait for the owner,
   switched for one session by default and for every session on the
   machine with the word `global`. The owner's observation that drove it:
   when a session stops to ask
   ("found an edge case, I recommend X, should I?", "commit now?", "fix the
   leftovers or not?"), the answer is "as recommended" nearly every time.
   So the wait costs a night, or the owner's attention by day, and buys
   nothing. The skill already
   has the rule for this inside an apply run (`handsoff`: rule on your own
   reading, ledger `Ruling: <decision>. Cost if wrong: <what>`, keep going,
   stop only for the four stops). `noask` applies the same rule to the main
   agent of every session under it, through three interventions (a
   refused question, a refused permission ask, a continued stop) and a
   minimal fence on the few outward calls a hook can name exactly.

The mode is about whether a session may ask the owner, not about the clock
or where the owner is, hence `noask`. Names considered and dropped: `away`
(the name through revision 7; it describes the owner, who may be at the desk
and still want no session to ask), `night` (wrong axis), `handsoff`
(the run-level term, spelled `hands-off` then; reusing it for a wider
scope confuses the two), `non-interactive` (means print mode in Claude
Code), `no-hitl` and
`hitl off` (an acronym, and `hitl off` switches the mode on by saying off).

## Goals

- One installable plugin, `sdd`, replacing the private skill and agents
  with no change in the apply loop's behaviour (phase 1).
- `/noask on` makes the session it is typed in rule on its own
  recommendation instead of asking, and continue instead of ending a turn on
  a question, from its next hook event until `/noask off` or the expiry;
  `noask global on` does the same for every session on the machine
  (phase 2).
- Every ruling made while noask is on is visible in the morning in the chat and in
  the session's final "Rulings I made" list, each with its cost if wrong
  and the recovery that undoes it, so the owner can revert one decision
  without rereading a night.
- A session that reaches an outward or unrecoverable step while noask is on
  records it as `blocked:` and moves on. In phase 2 that is the rule's
  instruction to the agent, backed by a minimal fence: a push, a pull or
  merge request creation, a plan approval, a switch of noask and an edit
  under the owner's configuration directories are refused at the tool
  call. The wide fence that inspects every command is phase 4.
- The noask hooks that act at a tool call run inside Claude Code's own
  runtime and are portable the day they ship. The three that answer a
  permission prompt, an MCP server's question and a stop are entries of
  the command, bash with `jq`, since revision 16. They, the apply
  skill's scripts and the terminal command are Linux first (owner,
  2026-11-08) and become portable in phase 3, and nothing in phases 1
  and 2 is designed so that phase 3 has to undo it. Since the command
  is what switches noask, the mode as a whole works on Linux only until
  phase 3, with or without revision 16.
- Apply runs launched by day and still running when `noask` turns on keep
  going under the same rule, an owner's `pause` is honoured, and no hook
  ever makes a driver act while its unit is live.
- The hooks are inert in a session that is not under noask, so its
  behaviour does not change, and a hook that fails while noask is on
  answers the noask side instead of letting a question through.

## Non-goals

- Replacing the superpowers loop (`subagent-driven-development`), which the
  skill requires and the plugin declares as a dependency.
- The wide tool-level fence that inspects every command for a merge, a
  deploy or a database write (phase 4). Phase 2 refuses the few calls it
  can name exactly (a push, a pull or merge request creation, a plan
  approval, a switch of noask by its command or by a write to its marker
  files, an edit under the owner's configuration directories); for
  everything else noask is a rule the agent follows, not a guarantee, and a
  push wrapped in a script or a `sh -c` passes the phase 2 fence.
- Publication for every session at once. The global switch has no
  `handsoff` level, and plain noask gives no session the right to push
  or to open a request. A session publishes only on the owner's word for
  it: an apply launch with `handsoff` while noask is off, or the
  session's own switch at the level `handsoff` (owner, 2026-11-13,
  replacing "noask never publishes", agreed "for now" on 2026-11-08).
- A persistent ledger file for the main session. Rulings live in the chat
  and in the final list; apply runs keep their own `progress.md` and
  `decisions.md` as today.
- Phone alerts. The plugin prints; routing a blocked session to a phone is
  the owner's hook, not the plugin's.
- Waking a session that was already idle on a question when the global
  switch was typed from a terminal: hooks fire on events, so the marker
  reaches that session at its next event. `/noask on` typed in that
  session wakes it (below).
- Running sessions headless or in the cloud.
- Before phase 3, platforms other than Linux for the apply scripts and the
  terminal command, which are bash 5 with GNU coreutils; the README says so
  until phase 3 ships. The same holds for the command's three hook
  entries, which also need `jq`; the module's hooks have no platform
  dependency.
- An exemption for one session while the global switch is on: `/noask off`
  ends a session's own switch and leaves it under the global one, saying
  so. Nor a scope between the two (a project, a worktree). Owner,
  2026-11-13: the session is the default scope and `global` the word for
  every session, which reverses the ruling of 2026-11-08 ("not needed"),
  made when the mode meant an empty desk.
- Switching one session from outside it: a session's own switch is typed
  in that session, and a terminal switches the global one only.

## Anti-goals

- A session that "rules" by doing the irreversible thing it should have
  asked about. A wrong but revertible ruling is the accepted cost; an
  unrevertible one is the failure.
- A session that approves its own spec, plan or source and implements it
  while noask is on. The owner's review of a design, and the choice of what to
  implement, are not questions with a recommendation; they are stops.
- A session that loops on the Stop hook or on a refused tool, burning the
  night on a question it cannot settle, or that an obedient reading of the
  owner's standing rules keeps ending. Every hook is budgeted, every budget
  ends in a visible `blocked:` line, and the precedence below is written
  where every session reads it.
- A hook that fires in a session that is not under noask. Everything is
  gated on the two marker files a session reads, the global one and its
  own. One guard is the exception, and it guards the switch itself: in
  every session, on or off, an agent's own attempt to work the switch or
  to write a marker file is refused, because a marker can carry the
  owner's word to publish and that word must be typed by the owner.
- A hook that silently does nothing when the owner thinks it is armed. The
  switch reads its marker back and prints the path; a name collision fails
  loudly.
- A second ruling vocabulary. `Ruling:`, `Cost if wrong:`,
  `Open before merge:`, `blocked`, `parked` and the four stops are the
  skill's words. The plugin adds exactly three end-of-turn tokens, all
  prefixed `noask:`.

## Constraints

Verified against the Claude Code docs on 2026-10-29 and against this
machine on 2026-10-30.

- Subagents cannot ask the owner: the question tool is removed from every
  subagent before anything else. Agents in an apply run communicate by
  reports and status blocks only. Hooks from settings and plugins fire inside
  subagents too, with `agent_id` and `agent_type` in the input.
- Hooks fire on events. A session idle on a question has already run its
  Stop hook; an open question dialog or permission prompt has already run
  its hook. A marker written afterwards changes nothing in that session
  until its next event.
- A plugin's command module (laterbox's `hooks/register.tsx` is the
  precedent on this machine) runs inside Claude Code's own runtime on every
  platform and registers in-process hooks beside its commands. Read in the
  module API types on 2026-11-08 and 2026-11-09 (the types file is written
  by Claude Code 2.1.318; this machine runs 2.1.319): `tool.call` (a tool
  call, answered with `{ deny: <text> }` so the model reads the text as the
  tool's error; fires in subagent loops too, with `agentId`); `tool.check`
  (the engine's verdict `allow`, `ask` or `deny` with the `rule`,
  `setting`, `hook` or `plugin` that decided it, and no field that marks a
  tool as interactive or an ask as prompt-bound); every classic hook event
  as `classic.<Event>`, with the classic hook's whole stdin input as `e`
  and its whole JSON answer as the result, so `classic.Stop` sees
  `last_assistant_message`, `stop_hook_active`, `background_tasks` and
  `session_crons` and may return `block` with a reason,
  `classic.PermissionRequest` sees the `tool_name` and `tool_input` of a
  prompt about to reach a person and may answer `{ behavior: "deny",
  message }`, and `classic.Elicitation` sees an MCP server's question and
  may `block` it; the chain at a classic event is managed settings hooks,
  then the modules, then the other settings hooks, so a module's `next(e)`
  resolves to what the owner's own hooks decided. Also `turn.start` and
  `turn.complete` (a turn's bounds, with `agentId` for a subagent's),
  `prompt.submit` (a user turn of the plugin's own, run once the session
  is idle, which on a busy session means later), `state` (values the host
  holds for the session, across hot reloads of the plugin, declared in the
  plugin's own types, one value per id for a family key), `store` (a
  plugin JSON file under the config directory, one per machine), `fs`
  (`write` is documented as not atomic, and there is no rename) and
  `session.start`. The `plugin` namespace carries `name` and `root` only:
  a module has no data directory of its own. A hook that throws, overruns
  its budget or answers a wrong shape is skipped, and the hooks beneath
  and core run in its place, so a guard fails open unless its registration
  carries a `.catch` handler that refuses in its place.
- What the module API offers is not what runs everywhere. Observed on
  build 2.1.325 on 2026-11-15 (`docs/decisions.md`, entry 4), on an
  account of a Team organization: a built-in plugin,
  `cc-plugin-sec-default`, is seated outermost on a machine with managed
  settings and for Team and Enterprise organizations (unless the
  organization's managed settings list the plugins themselves), and it
  passes over the hooks of a module a person installs, a `--plugin-dir`
  one included, when every event the hook's pattern matches is a
  `classic.*` event or one of eight prompt and settings events
  (`prompt.section`, `prompt.context`, `prompt.attachment`,
  `prompt.compose`, `skill.prompt`, `attribution.text`,
  `session.compact`, `settings.read`); a later reading of the same build
  adds hooks on `session.append` and, under a condition, on engine
  requests at `http.fetch`. The transcript names each hook it passed
  over. So a person's module never sees a stop, a permission prompt, an
  MCP server's question or the classic session start there. Its
  `tool.call` and `session.start` hooks ran in every probe, and its
  denial at `tool.call` was read by the agent with no dialog, in a
  subagent too. Hooks that are not a module's ran: the probe plugin's
  SessionStart command hook from its `hooks.json`, and a Stop command
  hook from the settings, whose block continued the session and whose
  second input read `stop_hook_active: true`. On 2026-11-16 a second
  probe plugin's command hooks ran there at Stop, SubagentStop,
  PermissionRequest and Elicitation too, each time, with no notice of a
  hook passed over (`docs/decisions.md`, entry 6). No probe ran on an
  account of another plan.
- The same probes on the session's start. A SessionStart command hook
  runs on all five sources (`startup`, `clear`, `compact`, `resume`,
  `fork`), with the source and the session's id in its input, but its
  `systemMessage` is shown and its context read on `startup`, `clear`
  and `compact` only: on a resume and on a fork neither reaches the
  screen or the agent. The module's own `session.start` fires once for
  each process, so at a start, a resume and a fork and not at a clear or
  a compaction; its input carries no source. The module can tell a
  session with a history from a new one by its transcript
  (`$.session.turns()`, `$.session.messages()`), and can append a line
  to the transcript that the person sees and the model does not
  (`$.ui.log`). The session's id is `CLAUDE_CODE_SESSION_ID` in its
  shell; the shell, a hook's input and the module agree on it; a
  compaction and a resume keep it, a clear and a fork give a new one; a
  subagent's shell, its `tool.call` and a command hook's input inside
  it carry the main session's, and the hook's `agent_id` there is the
  module's `agentId`, letter for letter. Observed on 2026-11-16: at a
  new start the transcript calls read no message; after a clear they
  read one, the clear's own record; at a resume and at a fork they read
  the kept history, and a line appended there shows on the screen under
  the plugin's name; and `session.start` runs again when the plugin is
  reloaded in a running session.
- A plugin's `bin/` directory is on the Bash tool's PATH while the plugin
  is enabled, so its files run as bare commands (plugin manifest reference,
  read 2026-11-08). Whether that PATH reaches a subagent's shell is tested
  first. `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` and
  `${CLAUDE_SKILL_DIR}` are substituted anywhere in the Markdown body of a
  skill, a command and an agent definition at load time, and are not in the
  environment of any command the model runs through the Bash tool.
- The Stop hook fires when the main agent ends a turn, also while background
  subagents or shell commands run; its input carries `last_assistant_message`,
  `stop_hook_active`, `background_tasks` (`id`, `type` such as `shell`,
  `subagent`, `monitor`, `workflow`, `teammate`; `status`, `description`,
  `agent_type`) and `session_crons` (`recurring` among its fields), both
  arrays present only when the task registry is reachable; the exact
  `status` strings are not documented and are pinned by the build's
  throwaway test. The types of build 2.1.325 describe `background_tasks`
  as the work in flight (running or pending, and backgrounded), empty
  when nothing is, so a finished task is expected to be absent rather
  than listed with another status; the first task of revision 16 checks
  that with a live subagent. Returning `{"decision": "block", "reason": "..."}` (from
  a module, `{ block: "..." }`) makes the agent continue with the reason as
  guidance; the harness caps
  consecutive continuations without a tool call at 8
  (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` raises it), so a plugin budget above 8
  is never reached in the pure-prose case. A turn that ends in an API
  error fires `StopFailure`, not Stop. Whether a grandchild (a controller's
  implementer) appears in the driver's `background_tasks` is undocumented;
  the design does not depend on it.
- A PreToolUse hook blocks a call with exit code 2 (stderr becomes the tool
  error the agent reads) or with `permissionDecision: "deny"` plus a reason.
  Matchers are tool names; `AskUserQuestion` as a matcher follows from that
  rule but has no documented example, so it is tested first. A
  `PermissionRequest` hook can answer a permission prompt with a denial and
  a reason.
- Auto mode pauses and prompts the owner after 3 consecutive or 20 total
  classifier denials, and a permission prompt never times out. Explicit
  `ask` rules and MCP tools that require interaction prompt in auto mode
  too. In auto mode the classifier settles an `ask` verdict, so most
  unmatched calls pass `tool.check` as `ask` and are then allowed by the
  classifier without any prompt; a hook that denied every `ask` at
  `tool.check` would cripple the session, and the verdict has no field
  that tells a prompt-bound ask from one the classifier will settle. The
  PermissionRequest event fires exactly when a prompt is about to be shown
  to a person, whatever raised it (an explicit rule, the classifier
  declining to decide, a hook, another plugin), and an MCP server's own
  question fires Elicitation; those two events are where "would reach a
  person" is a fact rather than a guess. Whether a PermissionRequest
  denial counts toward the classifier's pause threshold is undocumented
  (it should not, since the classifier did not deny); the build tests it
  with three denials in a row in a throwaway session. The machine's three
  profiles all default to auto mode; a session in the manual mode stops at
  its first unapproved call.
- The question auto-continue timeout (`askUserQuestionTimeout`) never starts
  in a session attached to Remote Control, so it is no substitute for the
  hooks on this machine.
- Plugin agents are named `<plugin>:<name>`; whether the Agent tool's
  `subagent_type` accepts the scoped name is undocumented (tested first; the
  fallback is in the design). A subagent's identity is its frontmatter
  `name`, never its file name (docs, 2026-11-09), so a file linked under a
  new name still registers the name inside it. Whether a plugin agent's
  `skills:` preload may name another plugin's skill is undocumented (tested
  first; the fallback is in the design and is itself tested). superpowers
  ships no `agents/` directory, so no plugin agent name collides with it.
- Plugin hooks live in `hooks/hooks.json` with the settings schema; hook
  processes receive `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA` and
  `CLAUDE_PLUGIN_OPTION_<KEY>`. None of these exists in the shell of the
  Bash tool, in the main session or in a subagent. Substitution happens in
  skill, command and agent bodies at load time (above), never in a
  supporting file read later, so a path the controller's overrides file
  needs is either a bare `bin/` command or written into the agent
  definition. `~/.claude2/plugins` and
  `~/.claude3/plugins` are symlinks to `~/.claude/plugins`, so the plugin
  data directory is one per machine. A SessionStart hook's stdout is
  context for the agent; the owner-visible channel is the hook output's
  `systemMessage`, which laterbox uses (on three of the five sources,
  as observed above). A command hook's answers, by the hooks reference
  read on 2026-11-16 and as probed that day. At Stop, `{"decision":
  "block", "reason": ...}` continues the turn and the screen calls it a
  Stop hook error; `hookSpecificOutput.additionalContext` continues it
  the same way, under the same cap and with `stop_hook_active` true at
  the next stop, and the screen calls it Stop hook feedback; exit code
  2 blocks with the text on standard error. At PermissionRequest only
  the decision object decides (`behavior: "deny"` with a message, which
  the agent reads as the tool's error); exit code 2 is not honoured
  there and the prompt goes on. At Elicitation `action: "decline"`, or
  exit code 2, declines with no dialog, the server receives a decline,
  and neither the person nor the server nor the agent is shown a
  reason. Any other failing exit lets the event through, so a hook
  that must not fail open has to answer before it can fail. A command
  hook has 600 seconds unless its entry names a timeout. Hooks on one
  event run side by side, each on the same input, and none sees what
  another answered. How their answers combine differs by event: at
  Stop any block continues; at Elicitation a decline overrules an
  accept (the reference); at PermissionRequest the first hook to answer
  decides (probed: beside a settings hook that allowed, the allow was
  applied twice of two, and with that hook made two seconds slower the
  plugin's denial was applied twice of two). Four denials in a row from
  a PermissionRequest hook did not trip auto mode's pause. A plugin's
  option variable is absent from a hook's process while the option
  holds its default.
- A plugin declares dependencies in `plugin.json` (`dependencies`, with
  `name@marketplace` and a version range); a cross-marketplace dependency
  needs `allowCrossMarketplaceDependenciesOn` in the marketplace manifest.
- On this machine a plugin from a directory marketplace is installed as a
  versioned copy in the plugin cache, pinned to a git commit (laterbox:
  `~/.claude/plugins/cache/akalongman/laterbox/0.2.0`, which already differs
  from its checkout). Edits reach sessions through `claude plugin update`
  (a new version) or by loading the checkout in place with `--plugin-dir`
  for one session, then `/reload-plugins`.
- A marketplace is a `.claude-plugin/marketplace.json` file registered
  once per name; its entries may point at other repositories
  (`{"source": "github", "repo": "owner/repo"}`, pinned to a commit and
  refreshed by `claude plugin update`) or at directories inside its own
  repository. On this machine `akalongman` is registered as the directory
  `~/projects/akalongman/claude-laterbox`, whose file lists laterbox alone
  with source `./`; a second repository cannot be `akalongman` while that
  registration stands. A second marketplace, `personal`, is the monorepo
  `~/projects/personal/claude-plugins` (`plugins/<name>` entries), and its
  `ak` plugin held a stale copy of the apply skill and the three agents
  until 2026-11-08, when they were removed (commit `89b7131` there).
- No hook can be switched off individually at runtime; presence in the
  configuration is the only switch, which is why the marker files gate the
  scripts themselves.
- After a context compaction the harness re-attaches an invoked skill cut
  at 20,000 characters (measured in the record repository's decision 23,
  with session ids); supporting files are not re-attached. `SKILL.md` was
  19,392 characters on 2026-10-30 and is 19,749 on 2026-11-08 (a commit of
  2026-11-06 grew it), over the 19,500 guard of the record's
  `check-skill-size.sh` and 251 under the cut. The move trims it back
  under the guard, and both phases' additions are paid for by prose
  tightened in the same file, under the same test. The cut falls on the
  substituted text, in which each `${CLAUDE_PLUGIN_ROOT}` has become the
  absolute cache path, so the size test measures the file with the
  substitutions applied (the longest install path it can expect), not the
  raw bytes.
- A command module registers `/<name>` with letters, digits, `_` and `-`
  only (laterbox registers `/later`), so the in-session switch is `/noask`,
  not `/sdd:noask`; the skill namespace applies to skills, which run as a
  model turn. `$.prompt.submit` runs a turn of its own once the session is
  idle, and on a busy session that turn is queued and runs later, so a
  module that wants to wake only an idle session has to know whether a
  main-loop turn is in flight (from `turn.start` and `turn.complete`); no
  module call can dismiss an open question dialog or permission prompt.
  laterbox's module handles a taken name with a toast and its terminal
  link refuses a foreign file silently; this plugin may not fail silently
  (anti-goal).
- The record repository's five test scripts (`tools/`) default to the
  dotfiles path of the skill, and its transcript tools classify roles by
  the names `app-subagent-apply` and `app-sdd-*`. The repository has
  `docs/` (specs and plans), `reviews/`, `tools/` with a `green/` fixture
  set, `upstream/` and a parking lot with four open notes. On 2026-11-09
  its `main` was six commits ahead of `origin/main` with six uncommitted
  entries (five untracked review files and the parking lot), so the
  retirement gate below is not a formality.
- The driver's ledger vocabulary for a turn it ends to wait (verified in
  `SKILL.md`): `Section N: handed to controller`, `Section N: controller
  returned waiting (child <id>)`, `Section N: controller returned paused
  (<point>)`, `Section N: relayed <role> hand-back to controller`,
  `Section N: pause requested`, `Paused by user after <unit>`, `Stopped by
  user mid-unit <N>`. "Has not reported yet" is prose, not a ledger line.
  Those lines are written by tool calls; nothing today obliges the driver
  to print them.
- The moved scripts are bash with `inherit_errexit`, GNU `chmod
  --reference` and `realpath -ms`; `implementer-overrides.md` cites the
  owner's `~/.claude/rules/git.md`; the model aliases (`opus`, `fable`,
  `sonnet`) are the owner's account's. The plugin inherits all of that.
- `run-archive` copies the workspace to `<config dir>/docs/tmp/apply-runs/`
  and parks `Handed to` lines through the `later` command; both are writes
  outside the worktree that every run makes today. `run-archive` already
  prints the parking command for each line when `later` is not on PATH
  (verified in the script, 2026-11-09).
- The owner's settings (read 2026-11-09): `defaultMode` is `auto`, the
  allow rules include `Read(~/.claude*/**)` and `Edit(~/.claude*/**)`, 21
  `ask` rules cover outward tools, auto mode's `soft_deny` lists two
  entries, the owner's Stop hook (`~/.claude/hooks/hooks.sh stop`) is
  `async: true` and so cannot block a stop, and the `security-guidance`
  plugin registers a Stop hook of its own. The only push guard,
  `push-guard.sh`, covers the public dotfiles remote. So under auto mode
  nothing at the tool level stops a session from editing a rule file,
  pushing a branch or opening a merge request while the owner is away;
  only the rule text does, and the classifier.
- `ExitPlanMode` is a built-in tool that presents a plan to the person for
  approval, a dialog like a question (tool types, 2026-11-09). A session
  in plan mode that reaches it while noask is on would wait on that dialog.

**Assumption.** Sessions that run while noask is on use auto mode, the machine's
default in every profile. The design does not handle a manual-mode session.

**Residual waits.** With the interventions in place a session can still
stop for the owner in these cases, listed so nobody expects otherwise: the
classifier's own pause after repeated denials (and, should the build's
test show the permission intervention's denials count toward it, that
intervention ships off by default and every prompt joins this list); a
turn ending in an API error (`StopFailure`, which nothing re-wakes); a
session already idle, or holding an open question dialog or permission
prompt, when the marker appeared; a built-in dialog that no hook precedes
(the browser setup offer is one; the goal proposal is not a tool of
build 2.1.325, so no dialog of its own was there to probe); a `noask: waiting:` line printed while something of the
session's is running or scheduled, however unrelated, which the Stop hook
cannot tell from a real wait; and the budgets below running out, which
end in a visible `blocked:` line. Since revision 16 also: a machine
without `jq`, where the command's hook entries cannot read their input
(the session-start line says so; a prompt is still denied, by the rule
for a session whose id cannot be read, but a stop is continued once
and then allowed, whatever its last line says); and a permission
prompt that another hook allows before the plugin's entry has answered
(Intervention 2).

## Approaches considered

### Packaging

1. **Private hooks and a skill under `~/.claude`**, like the existing
   `push-guard.sh`: smallest build, but no in-session command, no version,
   nothing reusable.
2. **A standalone `noask` plugin** beside the private skill: clean, but the
   skill's `hands-off` integration would cross a package boundary through a
   marker path two codebases happen to agree on.
3. **One plugin carrying the skill, its agents and `noask`** (chosen): the
   rule, the ledger line and the four stops have one owner, and the marker
   is an internal contract.

### Where the hooks run

1. **Three shell hooks in `hooks.json`** (revision 5): PreToolUse on the
   question tool, PermissionRequest, Stop. Bash 5 with `jq`, Linux only,
   and the permission hook can only answer a prompt that has already been
   raised.
2. **The module for the two refusals, shell for the Stop hook**
   (revision 6): built on the belief that no module hook can block a stop,
   it needed one state file written by two runtimes (TypeScript through
   `fs`, which has no atomic write, and bash) and kept `jq` for one hook.
   Both external reviews of revision 6 ranked that file unbuildable as
   written, and the types show `classic.Stop` may block.
3. **Everything in the module** (revisions 7 to 15): the question refusal
   is a `tool.call` deny, the permission ask a `classic.PermissionRequest`
   deny, the continuation a `classic.Stop` block, the minimal fence a
   `tool.call` deny, all in `hooks/register.tsx`, with the per-session
   record in `$.state` and the marker files the only thing outside the
   runtime. One language, one state, no `jq`, portable the day it ships;
   `hooks.json` keeps SessionStart alone, and phase 3 shrinks to the apply
   scripts and the terminal command. It fell on 2026-11-15: on the
   owner's account the module's classic hooks never run (constraints).
4. **Deciding the permission ask at `tool.check`, and continuing from
   `turn.complete`**, the two module events near the lost ones that do
   run: rejected. A `tool.check` denial of every `ask` refuses the calls
   auto mode's classifier would have allowed, which is the guess
   decision 20 turned down; and `turn.complete` answers with a text
   shown beneath the answer and cannot continue a turn, so a
   continuation would be a prompt the plugin submits, a second user
   turn with its own history where a Stop block is the same turn going
   on.
5. **The module at the tool call, the command at the three classic
   events** (chosen, revision 16): the question refusal, the fence and
   the guard on the switch stay `tool.call` denials in the module; the
   permission ask, the MCP question and the continuation are command
   hooks in `hooks/hooks.json` that run entries of `bin/noask`, beside
   the SessionStart one. This is option 2's split with its defect
   removed: the per-session record has one writer, the command, in one
   language, under a lock, written by rename, and the module counts by
   running the command, as it already does to switch. The reviews of
   revision 6 raised three things against that file (the review notes
   at the end, item 1), and each is answered: the module's file API has
   no atomic write and no rename, and the module no longer writes or
   reads the file, it calls the command and uses what it prints; the
   module has no data directory, and the file sits at a fixed path
   under the state directory, beside the markers; and the text
   contradicted itself on who holds state, where it now says one thing,
   the command holds the record and the module holds only whether a
   turn is in flight. What the single writer adds is a process started
   for each count and a lock that can be busy, and both end on the
   noask side when they fail (Budgets). Revision 7's other reason for
   the module, one language that runs on every platform, is given up
   for these three hooks and costed under phase 3: it takes nothing
   from a platform today, since the command the module switches with is
   Linux-only until then. The cost is `jq`, for the input of the three
   entries, and three more pieces of bash for phase 3 to carry.

### Reaching the checkpoint script from a controller

1. **A `Skill base: <path>` line on every dispatch** (revision 5), the
   driver substituting `${CLAUDE_SKILL_DIR}` into it: one addition to the
   dispatch contract phase 1 otherwise promises to leave alone.
2. **Linking the scripts into `~/.local/bin`** at session start: a plugin
   update swaps the script under a live run, and nothing links on native
   Windows.
3. **`bin/sdd-checkpoint`** (chosen): the plugin's `bin/` is on the Bash
   tool's PATH, so the controller runs the bare name, the overrides file
   names the bare name, and the dispatch contract is unchanged. The other
   six scripts keep names too generic for a shared PATH and stay under the
   skill directory, called through substituted paths.

### Marketplace

1. **Each repository its own marketplace** (`sdd@sdd` beside
   `laterbox@akalongman`): least churn, two names for one owner.
2. **The marketplace file in the laterbox repository, listing sdd by
   GitHub source**: one name, but a laterbox commit gates every sdd listing
   change.
3. **A dedicated `akalongman/claude-plugins` repository** (chosen, owner
   2026-11-08) holding only the marketplace file with GitHub-sourced
   entries for laterbox and sdd; both plugin repositories drop their own
   marketplace files and the `akalongman` registration moves there. The
   GitHub name currently redirects to `claude-laterbox` from a past rename,
   so creating it retakes the name.

### Continuing past a question

1. **`/goal`**, the built-in prompt-judged Stop hook: no code, but it is
   per session only (typed each time), cannot be gated by the marker, and
   stops
   a session after a few turns without tool use.
2. **A Stop hook of the plugin's own, in the module** (chosen): gated by the
   marker, for one session or for all, deterministic; it needs no question
   detection
   because while noask is on the only legitimate stops are the three end-of-turn
   tokens, a session waiting on its own subagent or a scheduled wakeup, or
   the budget.

### Where rulings are kept

1. A per-session ledger file: survives context compaction, but a second
   format beside the apply ledger.
2. **The chat and the final list** (chosen, the owner's call): the apply
   loop's own convention. Accepted risk: a ruling made before a compaction
   may be missing from the final list; the transcript on disk still holds
   it.

### Telling a wait from a stall

1. **Match the driver's ledger phrases** in the last message: fragile
   (the lines are tool writes the hook never sees, `relayed` matches prose)
   and incomplete (the registry may be unreachable, the live worker may be
   a grandchild).
2. **One explicit wait token the driver prints last** (chosen, after three
   reviews converged on it): `noask: waiting: <the ledger line>`. Costs one
   rule in the noask reference, makes the hook a one-line match, and lets
   the budget suspend itself during a wait.

## Design

### Repository and layout

`akalongman/claude-sdd`, checked out at `~/projects/akalongman/claude-sdd`,
laid out like `claude-laterbox` (with its root files: `types/`, `LICENSE`,
`.github/`, `.gitignore`, `.gitattributes`):

```
.claude-plugin/plugin.json        name sdd, dependencies, userConfig (terminal, budgets, permission hook, fence)
.claude-plugin/types/             the module API types, as in laterbox
tsconfig.json                     strict config for the module
types/index.d.ts                  the plugin's own types (the marker, the module's state contract)
bin/sdd-checkpoint                the checkpoint script, on the Bash tool's PATH
bin/noask                         the switch (bash), linked into the terminal like `later`; the only writer of the markers and of the sessions' records, and the four hook entries (phase 2)
skills/apply/SKILL.md             the moved skill, invoked as /sdd:apply
skills/apply/prompts/*.md         the five override prompts (headings renamed, one edited)
skills/apply/scripts/*            the other six scripts, unchanged
skills/apply/references/noask.md  the driver's rules while noask is on (phase 2)
agents/implementer.md             sdd:implementer
agents/reviewer.md                sdd:reviewer
agents/unit-controller.md         sdd:unit-controller
hooks/hooks.json                  the module, and four command hooks that run entries of bin/noask: SessionStart, PermissionRequest, Elicitation, Stop (phase 2)
hooks/register.tsx                the module: /noask, the markers' reader, the question refusal, the fence, the guard on the switch (phase 2)
hooks/*.ts, hooks/*.test.ts       the module's parts and their tests, laid out as laterbox's
scripts/noask-rule.md             the rule text, one copy
tests/*.test.sh                   shell tests: the terminal command, and the record's five ported
tools/                            the record's transcript tools, ported
docs/superpowers/specs/           this document
README.md
```

No `marketplace.json` here: the marketplace is the separate repository
below.

Dependencies in `plugin.json`: `superpowers@superpowers-marketplace` (the
loop), with the marketplace manifest allowing that cross-marketplace
dependency. laterbox is **not** declared: `run-archive` parks `Handed to`
lines through the `later` command when it is on PATH and otherwise prints
the command that would park each one, so the plugin works without it. The
README names laterbox as recommended and says that a `later` missing from
PATH (terminal link off, `~/.local/bin` not on PATH) shows up as
`not parked` lines in the run report, never as an error.

**Marketplace.** A new repository, `akalongman/claude-plugins`, holds
`.claude-plugin/marketplace.json` named `akalongman` with two entries,
`laterbox` and `sdd`, each `{"source": "github", "repo": ...}`. The
laterbox repository drops its own marketplace file, the local `akalongman`
registration moves from the laterbox directory to that repository, and
both plugins install as `<name>@akalongman`, cloned from GitHub and pinned
to a commit. A release is therefore a push plus `claude plugin update`, and
the marketplace entry changes only when a description does. This happens
in phase 1 (sdd's first install) and is proposed to the owner before the
registration moves, since it changes how laterbox updates too.

**Dev loop.** Day to day the checkout is loaded in place with
`claude --plugin-dir ~/projects/akalongman/claude-sdd` and `/reload-plugins`
after an edit; a release is a version bump, a tag and `claude plugin update`.
The throwaway tests and the phase 1 acceptance run use `--plugin-dir`. A
long apply run keeps working across a plugin update only if the paths it
handed to its controllers still exist, so a release is not made while a run
is live.

**Prerequisites, stated in the README:** Claude Code 2.1.318 or newer
for phase 1 (the build whose module API types this design was first read
against), and from the release that carries noask the build its probes
ran on, 2.1.325 or the build of revision 16's first task (decision 23;
the noask hooks rely on `tool.call` with `agentId`, on the module's
session and transcript calls, and on the command hooks' inputs as that
build writes them), with plugins, hooks and the Agent tool; until
phase 3, Linux, bash 5 and GNU coreutils for the apply scripts and the
terminal command, `jq` (the apply scripts call it on every launch, and
the command's hook entries read their input with it; through revision
15 this line said "no `jq`" while the moved scripts already called
it), and git; the superpowers plugin; the owner's
rule file `~/.claude/rules/git.md` for the implementer's commit rules (the
plugin does not ship a copy); model aliases as the account offers them,
with the skill's own fallback ledger line when one is unavailable.

### Phase 1: move the skill (behaviour unchanged)

What moves, and the only edits made to it:

- `skills/apply/SKILL.md`: the private `SKILL.md`. Its `name` becomes
  `apply` (the invocation is `/sdd:apply`). Every `app-sdd-unit-controller`
  dispatch becomes the plugin agent's name; the sentence "definition in
  `~/.claude/agents/`" goes. The dispatch payload does not change: the one
  path a controller needs, the checkpoint script, is the bare command
  `sdd-checkpoint` from the plugin's `bin/`, named in the controller's
  overrides file alone (the skill text never names it, checked
  2026-11-09). `scripts/...` and `prompts/...` paths stay relative to the
  skill directory as today. No rule, step or ledger line changes. The file returns under 19,500
  characters, checked by the ported size test: the plan states the byte
  budget for phase 1 and phase 2 together (about 250 characters over the
  guard today plus the phase 2 pointer) and names the prose that pays for
  it (the renames `app-subagent-apply` to `apply` and `app-sdd-` to the
  plugin names return about 40 characters; the rest is tightened wording,
  never a dropped rule).
- `skills/apply/prompts/*.md`: every heading `## Overrides from
  app-subagent-apply` becomes `## Overrides from the sdd apply skill`.
  `unit-controller-overrides.md` gets two further edits and no other: the
  implementer and reviewer agent names become the plugin agents' names, and
  the hard-coded `~/.claude/skills/app-subagent-apply/scripts/sdd-checkpoint`
  becomes the bare command `sdd-checkpoint` (on PATH from the plugin's
  `bin/`; a subagent's shell has no plugin variables, so no path is
  written). The other four prompts change in the heading only
  (`implementer-overrides.md` cites `~/.claude/rules/git.md`, which is the
  owner's rule file, not the skill's, and stays).
- `skills/apply/scripts/*`: byte-identical copies of six scripts;
  `sdd-checkpoint` moves to `bin/` byte-identical.
- `agents/*.md`: the three definitions, `name` without the `app-sdd-`
  prefix, `description` reading "for `sdd:apply`" and the body "for the sdd
  plugin's apply skill" where they read "for app-subagent-apply"
  (owner, 2026-11-09, during the phase 1 run), every other frontmatter
  field preserved as it is (`model`, `skills`, `experimental: cacheTtl`;
  whether a plugin agent honours `experimental` is checked in the
  throwaway test, since losing it drops the controller's prompt cache).
  `unit-controller.md` keeps `skills: [superpowers:subagent-driven-development]`
  if the cross-plugin preload test passes; otherwise it drops the preload
  and its body opens with "invoke the superpowers subagent-driven-development
  skill before anything else", and that fallback is itself tested (a
  controller dispatched without the preload must produce the loop's ledger
  lines).
- The dated findings file in the private skill directory
  (`*.local.md`) does not move.

Agent naming fallback. The throwaway test dispatches the plugin's
unit-controller by its scoped name (`sdd:unit-controller`), then by its bare
name. If neither dispatches, the plugin's SessionStart hook writes the
three definitions into `~/.claude/agents/` as `sdd-implementer.md`,
`sdd-reviewer.md` and `sdd-unit-controller.md` with the frontmatter `name`
rewritten to those same prefixed names, because an agent's identity is its
frontmatter name: a link under a new file name would still register
`implementer` and shadow any other agent of that name. The hook marks its
copies with a comment on the first body line, rewrites only files that
carry it (so a version bump never leaves a stale copy), never overwrites a
foreign file (a notice instead), and the skill and the prompts dispatch
those names. Removal is a documented README step, since a disabled plugin
runs no hook to clean up after itself.

What changes outside the repository, all proposed to the owner before being
made:

- The private skill directory and the three agent files are removed from
  `~/.claude` (the public dotfiles) once the plugin is enabled and one real
  run has passed. One copy, one removal; the other profiles follow through
  their symlinks. Afterwards a search for `app-subagent-apply` and
  `app-sdd-` across `~/.claude` (memory notes excepted) and across the
  plugin outside `tools/` and the test fixtures returns nothing; the
  record repository keeps the old names as history, and the transcript
  tools accept both names on purpose.
- The owner's global `CLAUDE.md` working agreement that names
  `app-subagent-apply` is reworded to name `/sdd:apply`; it is the one
  reference outside the skill itself (searched 2026-10-30 across `~/.claude`
  and one client project's `.claude`).
- The record repository (`~/projects/personal/claude-subagent-apply`) is
  partly absorbed and kept: its five test scripts (`check-skill-size.sh`,
  `check-pause-text.sh`, `test-run-archive.sh`, `test-sdd-checkpoint.sh`,
  `test-sub-skill-check.sh`) are ported into the plugin's `tests/` with the
  plugin paths as their defaults; its transcript tools
  (`transcript-roles.py`, `transcript-clock.py`, `transcript-tokens.py`)
  and the `green/` fixtures move to `tools/` and accept both the old names
  and `sdd:apply`, `sdd:unit-controller`, `sdd:implementer`,
  `sdd:reviewer`, so runs before and after the move are measured alike;
  its decision log, measurements, specs, plans, reviews and `upstream/`
  stay in the record repository, which stays private as the project's
  history, because they name clients and this repository is public
  (owner, 2026-11-09, during the phase 1 run; they first moved to
  `docs/history/`, and those commits were rewritten away before any
  push); its four open parked notes are read with the owner and re-parked
  here or closed. The record's checkout is clean and every local commit is
  on `origin/main` (on 2026-11-09 six were not; the run pushed them).
- The `ak` plugin in the `personal` marketplace: done on 2026-11-08, its
  stale copies of the apply skill, the three agents, `review-mr` and
  `verify-api-docs` were removed (commit `89b7131`); a parked note in the
  global queue holds the question of what becomes of the rest of `ak`.
- Memory notes that name the skill are left; they are history.

Acceptance for phase 1:

1. The unknowns are settled by a throwaway test before the move: a plugin
   agent dispatched from the Agent tool runs under its scoped or bare name
   (else the link fallback is used), the cross-plugin `skills:` preload
   either loads or its fallback produces the loop, the agent's
   `experimental` frontmatter is honoured or its loss is recorded, and a
   `bin/` command runs by its bare name inside a subagent's shell (else the
   controller's agent definition carries `${CLAUDE_PLUGIN_ROOT}/bin/sdd-checkpoint`,
   which is substituted in agent bodies, and the overrides file says so).
2. The plugin, loaded with `--plugin-dir` and then installed from the
   `akalongman` marketplace repository, with the private skill directory
   and agent files already removed (so a leftover copy cannot mask a broken
   name or path), runs `/sdd:apply <small OpenSpec change>` on a scratch
   project through a unit, a `pause` and `continue` (the checkpoint
   script run by a controller, by its bare name), a resumed driver's
   re-dispatch, the final phase and `run-archive` exactly as the private
   skill did, with the same ledger lines and the same dispatch payload,
   and with `Handed to` lines parked when `later` is on PATH; a second
  archive with `later` off PATH reports them as `not parked` lines, not as
  an error.
3. `/sdd:apply` without arguments still infers the source from the
   conversation, and `step`, `hands-off`, `isolated` and `tier=` still parse.

### Phase 2: noask

**The switch.** Two scopes, one marker format. A session is under noask
when its own switch is on or the global one is. The session's own switch
is the default, because the owner may be at the desk, working in one
session, and want another to stop asking; `global` is the word for every
session on the machine, the owner leaving for the night. The global
marker is `~/.local/state/sdd/noask`; a session's is
`~/.local/state/sdd/noask.d/<session id>`, the id the host gives the
session, which every hook input carries and which a shell inside the
session finds in its environment (`CLAUDE_CODE_SESSION_ID`, observed in
build 2.1.322 and pinned on 2.1.325). Each marker holds
four lines: `generation=<ISO-8601 time with nanoseconds plus a random
suffix>`, `since=<ISO-8601 time>`, `until=<ISO-8601 time, or empty>` and
`level=<noask or handsoff>`; the global marker's level is always `noask`.
The offset of a time is `[+-]HH:MM`, at most `14:00`, and the
generation's time carries the same form (revision 19); a time that
is no calendar time (30 February, 24:00) is unreadable to both readers,
as is a marker without its final newline (revision 18: each reader took
some of these and refused the others).
A session's marker always carries an `until`, and one whose `until` is
empty is unreadable to the command and to the module alike: read as on
without an expiry by one of them, it would never end for that reader
while the other shows the error.
The generation changes on every `on` from off, so two toggles within one
second never share one, and never on a renewal of the expiry. The paths
are fixed rather than under `CLAUDE_PLUGIN_DATA` because the command also
runs outside any session, where no plugin variable exists, and because
the paths are the contract the skill, the module and the command share.
One writer knows the format: the command, in bash, which writes the whole
file under a temporary name and renames it into place, removes it on
`off`, and is the only place a time is computed or printed (the module
only compares a stored `until` with the clock). The state directory and
the folders in it are created for the owner alone (mode 700), whatever
the umask, since a marker can carry the owner's word to publish; an
existing directory open to others is narrowed by the next switching
command, which says so. Every switching command
runs under one lock in the state directory, from its first read of a
marker to its read-back and its sweep, so no command removes or
overwrites what another has just written; reading takes no lock, since a
rename shows a reader the old file or the new one. The module
reads the markers and runs the command for `/noask`, naming the session,
because the module's file API can neither rename nor delete (constraints
above). A reading of one marker has four outcomes: `off` (no file); `on
<generation>`, with `until <time>` when set; `expired <time>` (an `until`
in the past, which every reader treats as off); and unreadable (a file
that exists and cannot be read or parsed). A session's reading is the
global marker's when that is on or unreadable; otherwise its own
marker's when that is not off; otherwise the global marker's, so the
morning after a global night reads `expired <time>` and not a bare
`off`. Below, "the marker" and "noask is on" mean that reading, for
the session a hook fires in. Every hook treats unreadable as on, with the
error in its reason text, so a corrupt marker shows up loudly in the
first turn that meets it instead of costing a night; the apply driver
keeps its own rule for an unreadable status (below). A read that does
not answer within two seconds is unreadable too, and every other file
call a hook waits on before it answers has the same bound and takes the
side of a failed call (revision 18). Two cases have no
marker to find, and each takes the side that cannot leave a machine
armed with nothing to switch off. With no home directory in the
environment both readers read off, and a switching command fails with
that reason. A session whose id the host does not give reads the global
marker alone, unless some session's own marker is on at that moment, or
unreadable (revision 18):
then its reading is unreadable, with that reason, because the marker may
be its own and a question let through would cost the run its night. The
same holds when the directory of session markers exists and cannot be
listed. The module and the command's four hook entries apply this rule,
since they know they are in a session; the command in a shell cannot
tell a terminal from a session whose id is missing, and reads the
global marker alone.

A session's switch follows its id. What the host keeps under the same id
stays under it: a compaction, a resume and the session's subagents,
whose shells, tool calls and hook inputs carry the main session's id
(all observed on 2.1.325). What
starts under another id starts off: a session the owner clears or
forks, and a session that a run starts as a process of its own. A
resumed session keeps its switch, and the line it shows at its start
(below) says which state it is in. A session's switch always carries an expiry, 8 hours when none is
given, so that a switch forgotten in a session resumed days later has
ended itself, and every switching command, after its own switch, removes
the session markers it finds expired (the status and the bare command
write nothing). The global switch keeps its optional expiry (decision
14).

- In a session: `/noask on [expiry]`, `/noask off` and bare `/noask` act
  on the session's own switch; `/noask global on [expiry]` and `/noask
  global off` act on the global one. A session's `on` takes one more
  word, `/noask on handsoff [expiry]`, the switch's second level: noask
  plus the owner's word that this session may publish (Intervention 4).
  Its lines read `noask: handsoff for this session since <time> until
  <time>`. `on handsoff` while on raises the level and keeps the
  generation; a plain `on` never lowers it, which takes an `off`. The
  global switch has no such level, and `noask global on handsoff` is
  refused with a line that says where the word is typed. They are
  registered by the module so
  they run the moment they are typed, also mid-turn (the owner turns to
  other work while the session is working); a module command cannot carry
  the plugin prefix. The module runs the command and prints its lines,
  those on standard error included. A switch that fails is said twice,
  in the command's output and in a toast, `noask: the switch failed
  (exit <n>): <the error>`, and wakes nothing, because the owner may be
  on the way out of the room.
  Every line names its scope: `noask: on for this session since <time>
  until <time>`, `noask: on for every session since <time>` (with `until
  <time>` when set), `noask: off`, `noask: off (expired <time>)`. A
  session's `on` always prints when it ends, and says so when the expiry
  is the default rather than one the owner gave: `noask: on for this
  session since 15:00 until 23:00 (8 hours by default; /noask on <expiry>
  sets another)` (owner, 2026-11-13). A session's `on` typed while the
  global switch is on adds `; also on for every session since <time>`,
  so the owner sees the session was under noask already; typed while
  the global marker is unreadable it adds `; the global marker is
  unreadable (<reason>) and holds every session under noask; noask
  global off removes it`, because a broken marker counts as on and the
  owner would otherwise not be told. A line
  that leaves the session under noask says which switch still holds it:
  `/noask off` while the global switch is on prints `noask: off for this
  session; still on for every session since <time>; noask global off ends
  that`, and a marker that is unreadable counts as one that holds it.
  Bare `/noask` prints one line for each switch that is on for the
  session. A switching command writes the marker, reads it back and
  prints its path, so a failure cannot be quiet. `on` while on changes
  nothing and says so, unless it carries an expiry, which replaces the
  stored `until` and keeps the generation (a renewal, not a new start);
  `off` while off says so, and on an expired marker removes it. An expiry
  is a duration (`9h`, `90m`) or `until HH:MM`, the next such local time;
  the stored value is always the absolute time. `/noask on` and `/noask
  global on` typed in a session that is idle also submit one user turn,
  "noask is on: if your last message asked the owner a question, answer
  it yourself under the noask rule and continue; if you are waiting on
  work of your own or have finished, change nothing and end this turn on
  the line the rule asks for", followed by the rule text, so that a
  session switched on from a terminal, which never saw the rule, has it
  before it acts. The text is conditional because an idle
  session need not be idle on a question: an apply driver waiting on a
  unit is idle too, and must not be told to act (owner, 2026-11-13). The
  module knows whether the session is idle from the main loop's
  `turn.start` and `turn.complete` events (a turn started and not
  completed is in flight) and from the session's history, read when the
  command is typed: a session with no turn in flight and at least one
  message in its transcript is idle, since its history may end on a
  question, which covers a resumed, a forked and a compacted session
  without knowing how the session started (through revision 15 that
  came from the classic session-start event, which the module does not
  receive on the owner's account); a new session, whose transcript is
  empty, has nothing to answer and gets no turn. A cleared session gets
  the turn, since revision 17: its transcript holds the clear's own
  record, the module cannot tell that record from a prompt without
  reading into the host's formats, and the turn costs one short answer
  that ends on `noask: done` and leaves the session with the rule. On
  a busy session it submits nothing,
  because the prompt would queue and run as a spurious turn later, and
  the busy session meets the marker at its next hook event anyway. A
  session whose question dialog or permission prompt is open takes no
  typed command until the owner presses Esc, which returns to the agent
  without an answer; then `/noask on`.
- In a terminal: `noask global on [9h | until 07:30]`, `noask global
  off`, and `noask`, which prints the global switch's line and one line
  for each session whose own switch is on. `noask on` and `noask off`
  without `global` change nothing, in a terminal and in a session's shell
  alike, and print `noask: a session's switch is typed in the session as
  /noask on; noask global on switches every session`: a session's switch
  has one door, the command the owner types in it. Inside a session's
  shell `noask` and `noask status` read that session's status (the apply
  driver's check, below); a shell that carries no session id reads the
  global switch alone. The command is linked into `~/.local/bin` at
  session start the way laterbox links `later`, with the same `terminal`
  setting (`link` or `off`), but a refused link (a foreign `noask` in the
  way) and a `~/.local/bin` off PATH are reported in the session, not
  only logged. `/help` and PATH were checked for an existing `noask`
  before the name was taken, and it was free. The global marker written
  from a terminal reaches each session at its next hook event.
- Session start, resume and compaction: when the session's reading is on,
  the SessionStart hook (a command hook, matcher `startup|clear|compact`,
  the three sources on which its answer reaches the session; `compact`
  because a compaction re-attaches `SKILL.md` but not the noask
  reference) returns a `systemMessage` that names the
  scope and the way out, `sdd: noask is ON for this session since <time>
  until <time>; it rules on its own recommendations and never waits;
  /noask off to end it`, or `sdd: noask is ON for every session since
  <time>; sessions rule on their own recommendations and never wait;
  noask global off to end it`, so a session opened in the morning, or
  resumed while its own switch is still on, cannot miss it, and
  as `additionalContext` for the agent the rule
  text and the absolute path of `skills/apply/references/noask.md`, so a
  driver resumed after a compaction can re-read it without the
  substituted path it lost, plus, for an apply driver, "re-read the noask
  reference". A session whose own switch is at `handsoff` reads `sdd:
  noask is ON with handsoff for this session since <time> until <time>;
  it rules on its own recommendations, never waits, and may push and
  open a request; /noask off to end it`. A start whose input carries no
  usable id while some
  session's own switch is on says `sdd: this session's id could not be
  read while a session's own noask switch is on; the session is treated
  as under noask`, with the same context. On a resume and on a fork the
  command hook's answer reaches neither the screen nor the agent
  (constraints), so there the module speaks: its own `session.start`,
  which fires once for each process, asks the command for the same line
  and, when the reading is on and the transcript already holds a
  message, appends it to the transcript as a notice the owner sees and
  the model does not. At a new start the transcript is empty and the
  command hook has spoken, so the module adds nothing and no source
  shows the line twice. The module says its line once for a session and
  keeps that in its state, because the host runs `session.start` again
  whenever the plugin is reloaded in a running session; and the host
  heads the line with the plugin's name, so the text does not repeat
  it. The agent of a resumed or forked session gets
  no context at its start: it meets the rule at its first refused
  question, denied prompt or continued stop, each of which carries it,
  as a session switched from a terminal does, and an apply driver reads
  the status before it acts on anything (below). A row appended for the
  model was considered and left out: it would rest on a call the
  security default may refuse to a person's plugin, for a gap one
  continued stop closes. Both speakers also say what makes the mode
  weaker than the owner expects: `jq` missing from PATH, and the rule
  file unreadable.

**The rule text.** One file in the plugin, `scripts/noask-rule.md`, read by
the module for its hooks and by the command for its hook entries and its
`on`, so there is exactly one copy. It names no tool, so any
agent reading it gets the same instruction; the one command it names is
the plugin's own. Its content, in the second person to the agent:

> noask is on: nobody answers until it is off. When you would ask, take your
> own recommendation (the option you would mark recommended, else the
> first), print `Ruling: <decision>. Cost if wrong: <what>` beside it, the
> cost naming what undoes it (a commit, a worktree database refresh, a
> file restored), and continue. A choice with no such recovery is not a
> ruling: print `blocked: <what>` instead. This rule holds only while noask
> is on: before a ruling or a commit, read the status with the `noask`
> command when you can, and when it says off, ask as usual. Commit
> path-limited at each checkpoint when the current branch is not the
> default one; on `main` or `master` print `blocked: commit on <branch>`,
> keep working with the tree uncommitted, and never create or switch a
> branch. An apply run the owner launched is the exception: it commits
> on the branch it was launched on, a default one included, because the
> launch is the owner's word. The other exception is the owner's word
> to publish, `handsoff`: when the last word of the `noask` command's
> status line is `handsoff`, finished work the owner named may be pushed
> with a plain push and its request opened; a merge, a forced push and
> everything else below stay blocked. In a session that does its own work, fix a
> leftover that one
> commit can revert and list the rest as `Open before merge:` lines; an
> apply driver keeps its own rule and edits nothing. These are blocked,
> never ruled: an irreversible or destructive operation (a database reset,
> a deletion of data no commit holds), a security-sensitive action, a side
> effect outside this worktree (a push, a merge or merge request, a message
> to a person, a deploy, a write to a database this session does not own,
> a secret; a run's own archive under the config directory and its parking
> of `Handed to` lines are not side effects), an edit to the owner's
> instruction files, rules or skills, the owner's review of a spec or plan
> you wrote (a plan-mode approval included), the choice of what to
> implement when nothing names it, and a plan so broken that every path
> forward is a guess. A conversation whose method is the owner's answers
> (brainstorming, grilling, a review the owner must read) is blocked at
> its next question, not ruled, because a design direction is not undone
> by a commit. Print `blocked: <what>`, skip the item and the items that
> depend on it, continue with the next independent one; never implement a
> spec, plan or source the owner has not named or reviewed. Every turn you
> end ends on one line, the last line of the message: `noask: waiting:
> <what you wait for>` when work of yours will wake you (a subagent, a
> scheduled wakeup; never the owner, and never something that is not
> running or scheduled), `noask: done` with the list "Rulings I made"
> above it when the work is done, or `noask: blocked: <why>` when nothing
> independent is left. A continuation
> you receive while you wait is answered by printing the same waiting line
> again, never by acting. Never re-ask in prose a question that was
> refused, never ask it again by any means, and never retry a refused
> command in another spelling. Never switch noask yourself, for this
> session or for every session: `/noask` and `noask global` are the
> owner's.

The four stops of the superpowers loop are in that list word for word
(destructive, security-sensitive, outside the worktree, every path a guess),
so the main session and a unit controller stop for the same reasons.
The controller's overrides say so too, since revision 16. Their rulings
bullet listed "an external side effect is needed" among the questions a
controller under `Mode: handsoff` decides on its best reading, which
reads as leave to take the step the rule text blocks. It now says that
the mode settles what to build, never whether to act outside the
worktree: a unit that cannot go on without such a step is parked, by
the overrides' existing parked return with the step named, and without
the mode it stays a `needs-ruling`. The one publication `handsoff`
allows is the driver's, at the run's end. The status
word is keyed on the line's last word because an unreadable status can
end in the same letters (a reason that quotes `level=handsoff`); the
command's unreadable reasons are fixed strings that never end in the
word, and its tests hold that.

When the file cannot be read, nothing may be ruled on a rule nobody
delivered. `on` and the session-start message say that it is missing,
and the text a hook answers with is a short built-in one that rules
nothing: "noask is on: nobody answers until it is off, and its rule file
could not be read, so rule nothing: print `blocked: <what>` for every
choice you would ask about, do not commit on a default branch, do not
push, do not switch noask, and end every turn on `noask: waiting:
<what>`, `noask: done` or `noask: blocked: <why>` as its last line". It
is a second text on purpose, not a second copy of the rule: a shortened
rule would drift from the file, and a session without the rule should
stop, not improvise.

**Precedence over the owner's standing rules.** The owner's global
instruction file loads in every session and tells the agent to ask before
committing, to list minor review findings as a question, to lead with a
recommendation and wait, and to go through brainstorming, spec, plan and the
owner's review before implementing. Left as they are, an obedient session
keeps ending its turn and the Stop hook bounces it until the budget runs
out. So the precedence is written where every session reads it, as one
working agreement in that file, proposed to the owner with phase 2:

> While the sdd plugin's `noask` is on for a session, its rule overrides
> the agreements to commit only when asked, to ask before fixing minor
> review findings, and to end a turn on a question whose answer I would
> give as "as recommended"; it overrides nothing else. The Stops hold; a
> spec or plan written while noask is on waits for my review; and
> brainstorming, grilling and a review conversation stop at their next
> question instead of ruling.
>
> While it is on, the noask rule's end-of-turn line (`noask: waiting:
> ...`, `noask: done` or `noask: blocked: ...`) is the last line of the
> message and stands in for the line on the session's state.

The second paragraph is there because the owner's file asks every turn to
end on a line about the session's state, while the Stop hook matches the
last line only: without it an obedient session prints the token, then the
state line, and is continued until its budget runs out.

So noask overrides exactly three things (the commit question, the minors
question, the recommendation-then-wait habit) and turns the design path's
review, the Stops, the OpenSpec cycle's review points, the questioning
skills and the outward actions into `blocked:` entries. Nothing in the noask
rule lets a session edit `CLAUDE.md`, a rule file or a skill, act on a
parked note, pick its own source, or create a branch.

**Budgets.** One record per session, a file
`~/.local/state/sdd/budgets.d/<session id>` that the command alone
writes: the activation generation it was last seen under, three counters
(question refusals, permission denials, Stop continuations) and the
budget that was spent, if any (`exhausted` below means one was; the
cause is stored, not derived, so a budget the owner raises afterwards
does not leave the ending text without its reason). Through revision 15
the record lived in the module's `$.state`. It is a file now because the
hooks that count are in two runtimes, the module at the tool call and
the command at the three classic events, and they must share it: the
fence's denials and the permission prompt's count against one budget, a
budget spent at a tool call has to let the next stop through, and an
allowed stop has to reset the counts of the tool-call hooks. A file
written from both runtimes is what both reviews of revision 6 called
unbuildable, so it is not: every count, reset and reading of the record
is one call of the command (`noask count`, an entry like the hook
entries, not typed by anyone), which takes the record's own lock,
applies the generation rule below, writes the whole file under a
temporary name, renames it into place and prints what the caller needs,
the count and whether a budget is spent and which. The module runs it
as it runs the command for `/noask`; a hook entry calls it in its own
process. The caller hands over the budget it counts against, the module
from its options and a hook entry from the plugin's option variables,
taking the built-in default where a variable is absent, which it is
while the option holds its default; so the command reads no settings. A count that cannot take the lock
within two seconds, or cannot write, fails, and its caller answers the
noask side without it, as for any other failure. The record lives under
the state directory, so the guard on the switch covers it: no agent's
plain call counts, resets or writes it. A switching command's sweep
also removes the records whose generation no marker carries any more.
It does so while it holds the records' lock, taken without waiting, so
a count in flight leaves the records for the next switching command;
and while any marker reads unreadable it removes no record, since a
record made under such a marker carries no generation a later reading
could match (revision 18). The markers are read as they stand when the
sweep runs, after the command's own switch, so `noask global off` on an
unreadable marker clears the records made under it; a directory of
session markers that cannot be listed holds the sweep back as an
unreadable marker does; and a switching command never makes the
records' directory, which only a count under noask does (revision 19).
A resumed session finds its record again, where the module's state began
at zero; within one generation that keeps a spent budget spent, which
is the rule already (only a new generation clears the flag), and across
generations it changes nothing. Two calls that land together both
count, since each holds the lock for its read and its write. A hook
that finds the marker's generation differs from the record's resets the
counters and the flag and records the new generation, so an `off` then an
`on` starts the sessions under that switch afresh, while a renewal of the
expiry keeps the generation and the counts. The generation is that of the
marker the session reads, the global one when it is on and otherwise its
own, so a session that passes from one switch to the other starts afresh
too. Every allowed stop resets the three
counters, so each budget bounds consecutive interventions, not a night: a
driver that waits on twenty units is never capped, and a session that
rules on twenty separate questions is capped only when it ends twenty
turns in a row without a token, tool calls between them notwithstanding,
because the counts are strict (nothing but an allowed stop resets them). The
strictness is deliberate: a reset on every tool call, the harness's own
rule, would leave a session that reads one file and re-asks the same
question unbounded all night. Hooks that fire with an agent id present,
inside a subagent, count against a record of that agent's own
(`budgets.d/<session id>.<agent id>`) with the same budgets, so a
looping subagent is bounded too; a subagent cannot end the main
session, so its exhaustion changes only the text its denials carry.
The module reads the id as `agentId` and a hook entry as `agent_id`,
and the two are one id (observed), so a subagent's fence denials and
its denied prompts share a count as the main session's do. The budgets, each a `userConfig`
number with this default: 6 question refusals, 10 permission denials
(the fence's denials included) and 20 Stop continuations. The numbers
differ because the interventions differ: a refusal is the same question
asked again after reading the rule, six in a row is stuck; a denial is a
distinct outward action, and one stretch of work can meet several; a
continuation is a turn ended without a token, which a working session may
do many times while it still makes progress, so its budget is the widest.
When any budget is spent the command sets `exhausted`: every intervention's
text becomes the ending instruction, "end this turn with the list Rulings
I made and the line `noask: blocked: <which> budget exhausted`", and the
Stop hook allows the next stop whatever the last line says, so exhaustion
ends the session's night in one turn rather than changing the wording of
the next denial. Only a new generation clears the flag. Each budget exists
to bound this plugin's interventions, not the session's activity; an agent
can still spend tool calls between them.

**Denials inside a subagent.** The module's `tool.call` fires in
subagent loops too, with `agentId` (observed), and a command hook's
input carries `agent_id` there by the types (the revision's first task
observes it). There the reason must not tell the agent to "continue with
the next independent item": a unit controller and an implementer have
their own protocol for a denied tool (the controller's return block
carries `Denied:` lines and the unit pauses or parks). With an agent id
present the reason is role-neutral, "noask is on: this action needs the
owner and is denied; follow your role's rule for a denied tool", and the
count goes to that agent's own record.

**Intervention 1, the question refusal** (module, `tool.call` on the
tool that puts a question to the person and on the tool that presents a
plan for approval; both refusals were read by the agent with no dialog
in the probes of 2026-11-15, and the goal proposal, the one other
candidate, is not a tool of that build). Inert
without the marker. With it, the question call
is answered with a deny whose text is the rule, prefixed `sdd noask:`, and
the refusal counter is incremented. The plan-approval call is answered
with "noask is on: a plan awaits the owner's review; end this turn on
`noask: blocked: plan awaits review`" and counts nothing, since it is not a
question the agent could answer for the owner; it keeps that text after
a budget is spent, so the morning reads that a plan waits. At the budget
the question's text is the ending instruction (Budgets). The
registration carries a `.catch` handler that denies with the rule and
the error when the hook fails after the marker read on and before the
call ran, so a defect in the plugin never lets a question through; a
failure after the call ran returns the call's own result, since a denial
then would undo nothing. A hook decides on the reading it took at its
entry; its handler, which cannot see that reading, reads again.

**Intervention 2, the permission ask** (command hooks in `hooks.json` on
PermissionRequest and Elicitation, each running an entry of `bin/noask`
with the hook's input on standard input; through revision 15 these were
the module's `classic.PermissionRequest` and `classic.Elicitation`
hooks, which the owner's account never runs). Inert without the marker:
the entry reads the session's id from its input, takes the reading, and
on `off` or `expired` exits with no output. With the marker, a prompt
about to be shown to a person, whatever raised it (an explicit `ask` rule;
today the owner's `sdp` task writes, `cf` and `cfx` destructive flags and
`secrets`, all outward actions the rule blocks anyway; the classifier
declining to decide; a hook or another plugin), is answered with a
denial, the message "noask is on: this action
needs the owner; print `blocked: <the action>` and continue with the next
independent item", and the denial counter is incremented, with the same
ending at the budget. An MCP server's own question is declined in the
person's place and counted as a denial; the server receives a decline
and the agent reads whatever the server makes of one, because the host
shows a hook's reason to nobody at this event. The rule reaches such a
session by its other interventions.
Nothing is decided at `tool.check`: an `ask` verdict there may still be
settled by the classifier without any prompt, and the verdict carries no
field that tells the two apart, so a filter there (revision 6) was a guess
where PermissionRequest is a fact. One property of revision 15 is lost:
the module ran the owner's own PermissionRequest hooks first and kept
their answer, and a command hook sees no other hook's answer. What
stands in its place is a race: of the hooks that answer one prompt the
first decides, so an owner's hook that allows and answers sooner
overrules this denial, and one that answers later does not. The owner
has no such hook today, the README states the rule, and the entry
answers before it counts, so that its own lock never costs it the
race. It
ships on while noask is on, with a `userConfig` boolean to turn it
off, read by the entry from the plugin's option variable. Four denials
in a row did not trip
auto mode's pause (the classifier never ran), so the hook ships on. An
entry must not fail open, and a command hook that dies lets
the prompt through, so the entry is built to answer first: once the
reading is on (or unreadable), its failure path, a trap set before
anything else can fail, prints the denial with the error, as a
decision object with a clean exit at a permission prompt, where the
blocking exit code is not honoured. Without `jq`
the entry cannot read its input, the session's id included, so the rule
for a session with no id applies (the switch, above): it denies while
the global switch or any session's own is on, a session beside the one
under noask included, and the session's start says that `jq` is
missing.

Revision 16 kept a second home for the three entries, the owner's
settings, in case a plugin's command hook did not run under the
security default. It does, at all three events, so that branch is
dropped and with it the command's form that printed the entries.

**Intervention 3, the Stop hook** (a command hook in `hooks.json` on
Stop, running an entry of `bin/noask`; through revision 15 the module's
`classic.Stop` hook, which the owner's account never runs). Inert
without the marker, and for a stop that carries an agent id: should the
event fire inside a subagent, the entry exits with no output, because
controllers, implementers and reviewers return by their own protocol.
The owner's own Stop hooks run beside it, each on the same input, and a
stop goes on when any of them blocks: an owner's hook that blocks still
continues the session, as it does today, and one that allows does not
overrule this one, as before. With the marker the entry allows the stop, by exiting with no
output, when any of these holds:

1. The last non-empty line of `last_assistant_message`, with Markdown
   around it stripped (backticks, bold, a list marker) and a closing
   period dropped, is one of the three tokens: `noask: waiting: ...`,
   `noask: done`, `noask: blocked: ...` (matched without regard to case,
   on that line only, so a quoted rule text never ends a session, while
   an agent that quotes its own ending is still understood). A waiting
   line is checked once against what the input shows: when both arrays
   are present and hold no unfinished task of any type and no scheduled
   entry of either kind, and this stop is not itself a continuation
   (`stop_hook_active` is false), the hook continues the turn with the
   rule and "nothing of yours is running or scheduled: `waiting` is for
   work of yours that will wake you, never for the owner; act, or end on
   `noask: done` or `noask: blocked: <why>`", counted as a continuation;
   at the budget the reason is the ending alone, as for any other.
   A session that prints the line again is believed, because the
   registry may lag a notification already on its way; the check costs
   one turn at most and catches a session that parks a question for the
   owner under the waiting line (owner, 2026-11-13).
2. `background_tasks` is present and contains a task of type `subagent`
   that is in flight: the session's own work will wake it. The array
   lists only work in flight, so any `subagent` entry counts: a live
   subagent read `running` there, and after it had reported the array
   was empty (observed). A subagent's own stop is another event and
   never reaches this hook. A `shell`,
   `monitor`, `workflow` or `teammate` task, a finished task, a scheduled
   entry of either kind and an absent array (registry unreachable) are
   not reasons; the token covers the driver in every one of those cases.
   A one-shot wakeup was a reason through revision 9 and is not one now
   (owner, 2026-11-13): the input carries the wakeup's minute and hour
   and no day, so a reminder due tomorrow would let tonight's question
   wait, and a session that
   does wait on a wakeup says so with the waiting line.
3. The record's `exhausted` flag is set: a budget ended this session's
   night, and this stop is its ending, whatever the last line says.

Conditions 1 and 2 reset the three counters; condition 3 resets nothing,
since only a new generation clears the record. Otherwise the entry
increments the continuation counter and continues the turn with the
rule text as the hook's additional context, which the session reads as
Stop hook feedback. A block does the same and is shown as a hook
error; that form is kept for the failure path, where an error is what
happened.
When one of the three tokens stands on an earlier line, with text after
it, the reason opens with "Your end-of-turn line must be the last line of
the message; nothing follows it.", so a session that adds a closing line
after the token corrects itself in one turn.
From the sixth continuation on, the reason adds "if no tool work is left,
end now with the list Rulings I made and the line `noask: blocked:
continuation budget exhausted`; otherwise continue", so a session looping
in pure prose prints its ending before the harness's own cap of 8
consecutive continuations without a tool call pre-empts it, while a
session with work left keeps going up to the budget of 20. At the budget
the command sets `exhausted` and the reason is the ending alone; the next
stop is allowed by condition 3. `stop_hook_active` changes no count: a
session continuing because of this hook is the intended state, and the
budget bounds it. It is read in two places, the waiting check above and
the failure path. A command hook that dies allows the stop, so the
entry is built to answer first, as the permission entries are: once the
reading is on (or unreadable), a trap set before anything else can fail
prints the block with the rule and the error when the stop is a first
one, and allows a stop that is already a
continuation: a hook that fails every time cannot count, so its budget
would never end it, and the harness cap bounds only turns with no tool
call between them. A failing hook therefore costs one extra turn for
each stop and never a loop. The same path serves a count the command
could not take, and an input it could not read: without `jq` the entry
takes the reading of a session with no id, and when that is on or
unreadable it tests the raw input for `stop_hook_active` set true and
continues a first stop once with "noask is on and its Stop hook cannot read its input
(`jq` is missing): end this turn on `noask: blocked: stop hook
unreadable`", and allows the next. An owner's own Stop hook that blocks
keeps the last word, as by day, and whatever bounds it is the owner's.

**Intervention 4, the minimal fence** (module, `tool.call`). Inert
without the marker. With it, the calls the module can name exactly are
denied before they run, each with the text "noask is on: <what> needs the
owner; print `blocked: <what>` and continue with the next independent
item", counted as permission denials. A push: a shell command whose git
subcommand is `push`, with options between `git` and `push` in either
spelling of an option's value, behind `if`, `while`, `until`, `!`,
`env`, `command`, `exec`, `nohup`, `time` or `sudo`, inside `$(...)` or
backticks, or across a backslash line break. After `env`, `command`,
`exec`, `nohup` or `sudo` no option is read: which options take a
value differs from one `env` program to the next, so every later word
of that command that names `git`, `gh`, `glab`, `noask` or a command
of the guard's list is read as a command, with the words after it. No
spelling of an option's value hides the command behind it then
(revision 18 read the values of `-u`, `-C` and `-a`; revision 19
stopped reading options), and a line where such a name is an option's
value or another command's argument is refused without need, as
`sudo grep -rn noask docs` is, which the README says. `time` takes
its `-p` along. A redirection is no word of
a command: it is read once, descriptor, operator and target, for the
cut into commands, for the plain push and for the guard on the switch
(revision 19). A pull or merge request: a
shell command that creates one (`gh pr create`, `glab mr create`, and
`new`, the alias of each). An edit under the configuration directory: an
edit or write through the file-editing tools to a path under one of the
owner's configuration directories, where the settings auto-allow edits;
they are every entry of the home directory whose name starts with
`.claude` and the directory `CLAUDE_CONFIG_DIR` names, each also by
where it resolves, since such a directory may be a link into a dotfiles
checkout. When the home cannot be listed, every path whose first part
below the home is spelled so counts as one (revision 18). That guards
by name and not by place. `~/.claude` and the directory the variable
names need no listing and are resolved beside it, so they stay known
by where they point; any other such directory that is a link is not
while the listing fails, and none is while a path cannot be resolved
in time, so an edit that names the link's target passes then. It is a
stated limit; denying every edit then would let one hung listing spend
a night's denial budget (revision 19). The path is
judged as spelled and as resolved, so a file that
is a link out of the directory is caught by its spelling and a link
elsewhere that points into it by where it lands; a file that does not
exist yet is placed by its nearest existing folder, so a new file in a
new folder elsewhere is never refused. Switching noask: a shell command
that runs the `noask` command in any form but its two reading ones,
bare `noask` and `noask status`, each with no further word and no
variable set in front of it (through revision 15 the fence named `on`,
`off` and `global`; the command now also counts and answers for the
hooks, so the rule is turned round and says what may pass, as the plain
push's does); a shell command that sets or exports a variable whose
name starts with `SDD_NOASK_`, the command's test seams, of which one
replaces its clock; an edit or write through the file-editing
tools under `~/.local/state/sdd/`, the markers and the sessions'
records alike, judged as spelled and by where that
directory resolves; and a shell command that removes,
moves, copies over, links, truncates or redirects into a path spelled
under that directory (`rm`, `rmdir`, `unlink`, `shred`, `mv`, `cp`,
`ln`, `install`, `truncate`, `tee`, `dd`, `touch`, `chmod`, and a
redirection that can write, in any of its spellings and with or
without a descriptor: `>`, `>>`, `>|`, `&>` and, since revision 19,
`&>>`, `>&` before a file and `<>`, which makes the file it names), or
that removes or moves a folder above it (`rm`, `rmdir` or `mv` of
`~/.local/state`, `~/.local` or the home, since revision 18; for `mv`
as what is moved, never as where it goes, since revision 19: a file
moved into the home is no switch). A `*`, `?` or `[` in such a path
is matched as the shell matches a name, so `rm -rf ~/.local/state/*`
is read as the removal of the directory that it is; a brace list is
not read (revision 19). A writer
outside this list (`sed -i`, an interpreter's one-line program) passes
as a wrapped command does. The switch is fenced from both sides because one `noask
global off`, or one `rm` of the marker, typed by a session at the end
of its budget would make every hook on the machine inert, and three
written lines would put every session under noask. The fence has one
exception, the owner's word to publish. While the session's own switch
is on at the level `handsoff`, whatever the global switch reads, the
main agent's push and its request creation pass and count nothing. The
word is read from the marker at the moment of the call, so it survives
a resume and ends with the switch. It is the owner's against every plain
call: the module runs the command only for a `/noask` the owner typed,
and the fence refuses an agent's own call of the command and its write
to a marker, in every session. It is not the owner's by construction. A
call of the command wrapped in `sh -c` or a script, or a marker written
that way, passes this fence as a wrapped push does, and no check inside
the command could close that, since a marker is a file the agent's shell
can write. An agent that goes that far could wrap the push itself, so
the wrapped grant opens nothing a wrapped push does not; both wait for
the wide fence of phase 4, and until then the rule text's "never switch
noask yourself" is what holds. Two limits keep the exception as
small as the word: every command of the shell call is judged, so a call
that also holds anything else the fence names is refused whole (`git
push && noask global off` does not pass, nor does a push whose output
is redirected into a marker); and only a plain push passes, defined by
what it may hold: `git push` with nothing between `git` and `push` but
`-C <path>`, then at most `-u` or `--set-upstream`, a remote and one
branch. A redirection is no part of it, so `git push origin b 2>&1`
is plain (revision 19). Any other option, a ref that starts with `+`
or holds a `:`, and a `-c` setting before `push` make it no plain
push. What the repository's own configuration makes of a plain push (a
mirror remote, a push default) the fence does not see, and the README
says so. A subagent's push is refused as before:
the driver publishes, never a controller. A command wrapped in
`sh -c`, a script or an alias passes this fence; a here-document's body
is data and is not read; and so does a shell write into the
configuration directory, which is why `run-archive`'s copy into it keeps
working; everything the fence does not name is the rule's job until
phase 4, and the README says so. The fence
acts in a session under noask, with one part that acts in every session:
the guard on the switch. Whatever the marker reads, an agent's shell
command that runs `noask` in any form but the two reading ones, or sets
one of its test variables, its write to a file under the state
directory and its edit of one are refused, with the text "the noask
switch is the owner's: it is typed as /noask in a session or as noask
global in a terminal; do not switch it or write its files; `noask` and
`noask status` read it", and
counted only while noask is on. While noask is on the refusal carries
the fence's text for switching noask instead, which tells the session
how to go on (revision 18), unless the fence's option is off: the
guard then keeps its own text and counts nothing, since the count and
the fence's text are the fence's (revision 19). A script that runs the
command passes,
as every wrapped call does, which is also how the plugin's own tests
run in an agent's session. The guard is the first thing of noask
to be built and released: the command has been on `main` since the
build that stopped, and until the guard lands nothing but the rule
text, which a session reads only while noask is on, keeps an agent from
typing `noask global on` (owner, 2026-11-16: no push of `main` before
it). Through revision 13 a session that was
not under noask met nothing of this plugin's there, and could have
written another session's marker at `handsoff`, or its own. The fence
has its own `userConfig` boolean, on by default, and the same `.catch`
handler.

**The apply skill under noask, and `handsoff`.** Two nested levels, not
two modes that interact (owner, 2026-11-13). Under noask nobody is asked
and nothing leaves the machine. `handsoff` is the word the owner gives
an apply run at its launch (spelled `hands-off` through phase 1 and
renamed to sit beside `noask`, a hard rename): it is noask for
that run plus the owner's word that the run's finished work may be
published, which means the push and the pull or merge request of the
run's ending and nothing else. noask neither gives that word nor takes
it back. The same word is the second level of a session's own switch,
`/noask on handsoff`, and that is the form the fence can see. So:

- a run without the word, in a session that is not under noask, asks the
  owner and pushes nothing, as today;
- a run without the word, in a session under plain noask, rules for
  itself and pushes nothing;
- a run with the word rules for itself and publishes at its end. The
  word is given at the launch or by the session's switch. While noask is
  on, the push passes the fence only in a session whose own switch is at
  `handsoff`; in any other the run reports its push as pending.

Through revision 11 noask took a push back: a run that had met noask at
any point did not publish. That one rule needed a test on the ledger's
history at the run's end, a pointer that kept the reference alive after
noask had ended, a ledger line for a word that was only implied, and a
stated limit. The rule is gone and those went with it.

`SKILL.md` cannot grow, so it gains the shortest possible pointer, "At
launch, before acting on every controller return and before a push run
`noask status`; unless it reads `off` or `expired`, `references/noask.md`
applies" (the
command is in the plugin's `bin/`, on the PATH of a session's shell as
`sdd-checkpoint` is, and the reference's path is relative to the skill's
base directory, which a compaction re-attaches; the sentence with both
paths substituted did not fit under the size guard), and the resume
filter in its item 1 gains `Noask` in its alternation so a resumed driver
sees the lines below. The pointer is worded by what switches the
reference off, so an unreadable status and a command that fails count as
on for the driver as they do for the hooks: a driver that asked would
only be refused. The status the driver reads is its own session's: `on`
when the session's own switch or the global one is. Everything else
lives in `skills/apply/references/noask.md`; with the rename, these are
the only edits of phase 2 to the moved skill:

- Every turn the driver ends to wait (a dispatch made, a `waiting` or
  `paused` return, a relayed hand-back, a child not yet reported, a pause
  in force) ends on `noask: waiting: <the ledger line it just wrote>` as the
  last line of the message. A Stop-hook continuation received while a unit
  is live is answered by printing that line again and ending the turn;
  never by a dispatch, a resume, a stop of a child or an edit (the 2026-10-13
  orphaned-implementer incident is the reason). A continuation that says
  nothing of the driver's is running is answered by looking for the
  unit's return first, since its notification may be on the way, and
  then by the skill's own rule for an incomplete attempt; never by a
  second dispatch beside an attempt that may be live.
- At launch and before acting on every controller return, the driver
  runs the status command. The first reading in a run that is neither
  `off` nor `expired` ledgers `Noask: seen on at <time>`, or `Noask:
  status unreadable (<error>)`, lines that are never removed and that
  tell a reader why a run launched without `handsoff` ruled for itself.
  While noask is on, a dispatch carries `Mode: handsoff`, the mode a
  controller already knows, whether or not the owner gave the word; a
  `needs-ruling` return from a controller dispatched without the mode is
  resumed once with "Mode: handsoff: rule and continue" (the existing
  defect path); and `step`'s continue-or-stop prompt is skipped and
  ledgered `Noask: step prompt skipped`. A controller already dispatched
  with the mode keeps ruling for its unit after noask goes off; the next
  dispatch reads the status again.
- `/sdd:apply` with no argument, or with several candidate sources, while
  noask is on is `noask: blocked: no source named`; choosing what to implement is
  never a ruling.
- The exceptions the skill makes for the owner become parked units, never
  rulings and never a whole-run stop: the drift question after a resume
  ("the tree changed while paused; continue or stop?") and the
  `needs-ruling` a controller returns on a resume (which the skill asks of
  the owner even under `handsoff`) ledger `Section N: parked (noask:
  <question>)`, the driver prints `blocked: <question>` and takes the next
  unit that does not depend on it. A `paused` return whose point is a
  denied tool, and a second `failed` return, are parked the same way. With
  no independent unit left the driver ends on `noask: blocked: <why>`. An
  owner's `pause` in force is honoured as today, the driver ending on the
  waiting line. A `handsoff` run while noask is off keeps asking those two
  questions, as today: both arise on a resume, which the owner has just
  typed.
- Publication is the owner's word and nothing else: the `handsoff`
  ending's push and request run when the owner gave the word, at the
  launch or by the session's switch (a status line whose last word is
  `handsoff` at the run's end; a reason that merely contains the word
  is not it), and never otherwise. The driver reads the status once
  more before a push. When the push is refused, which happens under
  noask in a session whose own switch is not at `handsoff` (Intervention
  4), the driver ledgers `Handsoff: not pushed (refused under noask)`,
  the final message names the branch and says the push is pending, and
  nothing is retried in another spelling.
- The run commits on the branch it was launched on, as the skill says, a
  default branch included: the owner launched it there, and the rule's
  `blocked: commit on <branch>` is for a session doing its own work.
- The run's own writes outside the worktree stay: `run-archive` copies the
  workspace to the config directory's `docs/tmp/apply-runs/` and parks
  `Handed to` lines through `later`; `<ws>` is deleted only after the
  archive printed its path, as today. Parking a note is not acting on one.
- The final message's `offer:` lines (add items to a plan section) are
  printed as report lines only, never asked and never written into the
  plan file.
- The driver's final message ends on `noask: done`, or `noask: blocked:
  <final status>` when the final phase ended with anything but `complete`.

**Worked example, one session by day.** 15:00, the owner at the desk with
two sessions. Session A is an apply driver the owner launched there with
`/sdd:apply docs/plan.md handsoff`; session B is where the owner works.
The owner types `/noask on handsoff 3h` in A,
which prints `noask: handsoff for this session since 15:00 until 18:00` and,
A being idle on its unit, submits the wake-up turn; A answers it with
its waiting line and nothing else. A's
next status read ledgers `Noask: seen on at 15:01`; at 15:40 the driver
meets the drift question of a resumed unit, which `handsoff` alone would
have put to the owner, and parks the unit instead. At 15:50 session B
ends a turn on
"I recommend splitting the migration; shall I?" and waits for the owner
as on any other day, because B's reading is off: the global marker does
not exist and neither does B's own. At 17:10 A's run ends: the fence lets
its push through, because A's own switch is at `handsoff`, and the run
opens its request with the rulings as the description, ledgers
`Handsoff: pushed <sha7>, <request URL>` and ends on `noask: done`. Had
the owner typed a plain `/noask on 3h`, the same run would have ruled
the same way and reported its push as pending. At 18:00 A's switch
expires, and a question A asks at 18:05 reaches the owner.

**Worked example, every session by night.** 23:00, three sessions in
three worktrees of one project, each with a branch the owner created.
At 22:55 the owner types `/noask on handsoff` in session A, whose run
may publish; it prints `noask: handsoff for this session since 22:55
until 06:55 (8 hours by default; /noask on <expiry> sets another)`.
`noask global on until 07:30` in a terminal prints the marker path; each
session picks the marker up at its
next hook event. Session A is an apply driver launched by day with
`handsoff`, mid-unit: its first status read after 23:00 ledgers `Noask:
seen on at 23:04`; each wait turn ends on `noask: waiting: Section 3:
handed to controller`, which the Stop hook allows; at 01:20 its
controller, which carries `Mode: handsoff` since the launch, meets "the
spec and the code disagree on the sort key", rules, and parks or
completes as the loop says; at 04:00 the run
ends, pushes its branch and opens the request (`Handsoff: pushed <sha7>,
<request URL>`), prints "Rulings I made" and `noask: done`. Session B is
a plain session reviewing a plan: at 00:40 it ends a
turn with "I recommend splitting task 4; shall I?"; the Stop hook blocks
with the rule; it prints `Ruling: split task 4 into 4a and 4b. Cost if
wrong: one commit to fold them back`, edits the plan, commits on its
branch, continues; at 02:10 it runs `git push`; the fence denies the call
and it prints `blocked: push of sc-1230`, continues; at 02:30 it ends with
"Rulings I made" and `noask: done`. Session C was brainstorming a feature
and has just written a spec: its next step is the owner's review, so it
ends on `noask: blocked: spec awaits review`. Session D had asked "which of
the two schemas?" at 22:50 and was idle when the terminal switch ran; it
stays idle until the owner types `/noask on` in it at 23:05, which
switches D's own noask on beside the global one, prints `noask: on for
this session since 23:05 until 07:05 (8 hours by default; /noask on
<expiry> sets another); also on for every session since 23:00 until
07:30` and submits the wake-up turn; it answers its own
question, rules, and continues. 07:30, the global marker expires (D's
own ended at 07:05) and every hook goes inert at its next event; at 09:00
the owner's first `noask` prints `noask: off (expired 07:30)`. Session
A's request is open with its rulings as the description, because the
owner switched that session to `handsoff`; sessions B and D pushed
nothing, because no word of the owner's covered a push of theirs. The
owner reads three
"Rulings I made" lists, one spec and one request, `git log
dev..<branch>` in the worktrees that did not publish, and pushes those.

**What stays as it is.** `SubagentStop` is not registered, so controllers,
implementers and reviewers return exactly as today. The classifier's own
pause (3 consecutive or 20 total denials) is not touched; the rule's "never
re-ask, never retry" and the blocked list keep sessions away from it.

**Build order, since revision 16.** The build that stopped on 2026-11-15
left on `main` the command, the rule text and the apply skill's rules
under noask, with no hook beside them. What remains is built in two
steps, each releasable. First the parts that stand on what the probes
of 2026-11-15 saw run: the command's count entry and the record, the
module with its reader, `/noask`, the question refusal, the fence and
the guard on the switch. That step lifts the hold on pushing `main`,
and what it ships is a noask that refuses and fences but does not yet
continue a stop or answer a prompt, and whose budgets bound a whole
activation until the second step's Stop entry resets them (revision
18), which its README says. Then the
parts that waited on the probes of 2026-11-16 (item 1 below): the
session-start line, the three hook entries, and the acceptance
afternoon and night. The machine's move to the plugin follows that
second step (owner, 2026-11-16), since the private copy it removes is
what runs the builds until then.

Acceptance for phase 2:

1. The throwaway tests pass before the hooks ship. Those of 2026-11-15
   are recorded in `docs/decisions.md`, entry 4, and settled the name,
   the `tool.call` refusals, the module's reach, the session's id and
   the session-start hook's input. The probes of 2026-11-16, run before
   the plans were written and recorded in entry 6, on the owner's
   account and with a throwaway plugin whose `hooks.json` holds command
   hooks, pinned this list but for two things no probe reached, which
   the second step's tests carry (a configured option's value in a
   hook's process, and the transcript calls just after a compaction,
   before any prompt): that a plugin's command hook runs at Stop, at
   PermissionRequest and at Elicitation under the security default, and
   for each the input it receives, kept verbatim for the command's
   tests; that its Stop block continues the session; what
   `background_tasks` and `session_crons` hold beside a live subagent, a
   finished one and a one-shot wakeup; whether a subagent's stop reaches
   the hook and what its input carries; that its PermissionRequest
   denial is read by the agent with no dialog, in a subagent too, with
   the `agent_id` it carries beside the module's `agentId`; whether
   three such denials in a row trip auto mode's pause; the answer that
   declines an MCP server's question and what the server receives; how
   the host combines the plugin's answer with another hook's on the same
   event; that the plugin's option variables reach a hook's process;
   what the module's transcript calls read at a start, after a clear, a
   compaction, a resume and a fork; and that a line the module appends
   at a resume and at a fork shows on the screen. The original list of this item, kept for
   the record: the `status` strings of
   a running and a finished subagent in `background_tasks`; whether
   SessionStart shows `systemMessage`; whether three PermissionRequest
   denials in a row trip auto mode's pause; what an MCP server receives
   from a blocked elicitation; that a module `classic.Stop` block
   continues the session as a `hooks.json` block does; and the session
   id: the variable that carries it in a session's shell, that a
   subagent's hook input and shell carry the main session's, and what a
   compaction, a resume, a clear and a fork do to it. And four that the
   reviews of the plan added: whether a module hook on the session's
   start fires with its source; whether a subagent's stop reaches the
   Stop hook; whether a goal proposal's dialog is preceded by a
   permission request; the text a command hook receives on its
   standard input, kept verbatim for the command's tests.
2. The tests cover, per hook, in the module's tests for the hooks at the
   tool call and in the command's for its entries, each entry fed the
   inputs item 1 kept: inert without the marker and on an
   expired one; inert under another session's marker; the global marker
   read before the session's own; unreadable treated as on with the
   error in the text; a session's marker without an expiry unreadable to
   both readers; each
   Stop allow condition; the last-line token match with Markdown stripped;
   the generation reset and the renewal that keeps it; the counter reset
   on an allowed stop and not on an exhausted one; the `exhausted` flag
   ending the next stop; a hook that fails after `on` answering the noask
   side, an entry killed mid-run and an entry without `jq` included; the
   fence's cases and one wrapped push that passes; the guard passing the
   two reading forms and refusing every other form of the command, a
   test variable set, and a write to a record; a count from the module
   and one from an entry landing on one record, two together both
   counted, and a count that cannot take the lock answering the noask
   side; a record swept with its generation; `/noask on`
   submitting on an idle session with a history, and not on a busy
   or a new one; the module's line at a resume and a fork, and none at a
   new start; a failed switch shown in the session; the waiting line
   checked once; the fence on the marker files; the markers
   written by the command read by the module; and one test that holds
   the texts the hooks print (the three end-of-turn lines and "nothing
   of yours is running") equal to those the apply skill's noask
   reference tells the driver to write and expect. The command's tests cover
   both scopes: a session's switch and the global one each on, off,
   renewed and expired; `/noask off` under the global switch saying which
   switch still holds the session; the 8 hours a session's switch gets
   without an expiry, printed with the words that mark it as the
   default; `noask on` without `global` changing nothing; an
   expired session marker removed; a command that finds the lock held
   failing without a write; the state directory made for the owner
   alone under a loose umask; a session's `on` naming a global marker
   that is unreadable; and no unreadable reason ending in the word
   `handsoff`.
3. One afternoon and one night on this machine, the owner's standing
   rules in place and the precedence agreement added. By day, the owner
   working in one session: a session switched with `/noask on` rules and
   continues while the session beside it asks as usual. By night, under
   `noask global on`: a plain session that ends on a
   recommendation continues and rules; a session that reaches a push
   prints `blocked:` and goes on; an apply run in a session the owner
   switched with `/noask on handsoff`, in a scratch repository with a
   scratch remote, pushes its branch and ends on `noask: done`, and one
   in a session under plain noask rules for itself and ends unpushed; a
   session in plan mode ends on `noask: blocked: plan awaits review`; in the
   morning `noask` prints `off (expired <time>)` and no session is waiting
   on a dialog.

### Phase 3: the apply scripts and the terminal command portable

Linux, macOS (its system bash 3.2, nothing from Homebrew, as laterbox's
README promises) and Windows (Git for Windows' bash, which installing
plugins already requires, with the terminal command unavailable on native
Windows as laterbox's `later` is). Until this phase noask is switched on
Linux only: the command is the markers' one writer since revision 9, it
is bash 5 with GNU tools (`flock`, GNU `date`), and the module switches
by running it, so on macOS and Windows no marker can be written and
every noask hook stays inert, the module's included, however portable
their own code is. Revisions 9 to 15 called the hooks portable from
phase 2, which was true of the code and of nothing a person could use.
Revision 16 therefore takes no working platform away. What it adds is
work here: beside the command, its three hook entries and their reading
of the hook's input have to run on the three platforms. That means
either entries that are bash-3.2 clean with a reader of their own or
with `jq` as a stated prerequisite (whether macOS and Git for Windows
bring one is checked then, not assumed now), or the entries moved back
into the module, should a later build let a person's module see the
classic events again. Until one of those ships, noask off Linux is
refused at the switch with a line that says so, never half armed. What
changes: the apply skill's seven
scripts lose their bash 5 and GNU dependencies (`inherit_errexit`, `chmod
--reference`, `realpath -ms`, nanosecond `date`) or move into the module
behind `bin/` wrappers; the terminal command becomes bash-3.2 clean or a
`bin/` command backed by the module; the marker path is computed from HOME
or USERPROFILE in both writers; CI runs the tests on the three platforms
like laterbox's. Its own spec and plan, written when phase 2 has run one
night.

### Phase 4: the wide fence

A fence that refuses a merge, a deploy, a database write and a push in any
spelling while noask is on by inspecting the call itself, and refuses a command
it cannot read, so that noask comes as close to a guarantee as a hook can;
phase 2's fence names a few calls exactly and nothing else. Named here so
that nothing in phases 1 to 3 is designed against it; otherwise
undesigned.

### Decisions made in this design (the owner may overrule)

1. The markers live in `~/.local/state/sdd/`, at fixed paths (the global
   one, and one per session named by the session's id), because the
   command has no plugin variables outside a session and the paths are a
   shared contract; each holds four `key=value` lines, the activation
   generation (nanosecond time plus a random suffix), the start time,
   the expiry and the level.
2. Plain noask gives no right to publish. A session publishes on the
   owner's word for it and nothing else: an apply launch with `handsoff`
   while noask is off, or the session's own switch at the level
   `handsoff` (owner, 2026-11-13, replacing "noask never publishes").
   No machine-wide switch lets sessions publish, which is what the
   earlier `away_push` knob was.
3. Three end-of-turn tokens, `noask: waiting:`, `noask: done`,
   `noask: blocked:`, always the last line; the Stop hook matches the last
   line only, Markdown stripped, and no ledger phrase.
4. Budgets: 6 question refusals, 10 permission denials (the fence's
   included), 20 consecutive Stop continuations, each a `userConfig`
   number, with the ending instruction in the reason from the sixth
   continuation on; every allowed stop resets all three and nothing else
   does; a spent budget is recorded by its name and ends the next stop;
   subagents are counted on records of their own and never end the main
   session.
5. The rule text is one file read by the module and by the command, for
   its hook entries and its `on`; it carries the four stops verbatim and the
   questioning skills, names no tool, and tells the agent to read the
   status before a ruling or a commit; when it cannot be read, a
   built-in text that rules nothing stands in for it.
6. laterbox is a recommendation, not a declared dependency.
7. The dispatch contract does not change: `sdd-checkpoint` lives in the
   plugin's `bin/` and is run by its bare name from the driver and the
   controller alike.
8. The interventions at a tool call are module hooks, the question
   refusal and the minimal fence with its guard on the switch; the
   permission ask, the MCP question and the continuation are command
   hooks in `hooks.json` at PermissionRequest, Elicitation and Stop,
   each an entry of the command, beside the SessionStart one; the
   permission ask and the fence each have a `userConfig` switch and ship
   on; every module registration carries a `.catch` handler and every
   entry a failure path that answer the noask side. Through revision 15
   all four were module hooks and the record lived in `$.state`; the
   owner's account passes over a person's module at the classic events
   (decision 35). The wide fence is phase 4.
9. An unreadable status counts as on, for the hooks and for the driver
   alike, with the error shown: a driver that asked would only be
   refused.
10. The noask rules for the driver live in `references/noask.md`, because
    `SKILL.md` has no room under its compaction-safe limit (it is over
    the guard today and the move trims it), and the SessionStart hook
    re-emits them, and the reference's path, after a compaction.
11. The in-session command is `/noask` (module names take no prefix); the
    name is checked against `/help` and PATH before it is taken, the
    switch never fails silently, in a session as in a terminal, and
    `/noask on` wakes an idle session, one with no turn in flight and a
    history, a resumed or forked one included, with a conditional turn.
12. The agent-link fallback writes prefixed copies with the frontmatter
    `name` rewritten to match, refreshes only its own marked copies at
    every session start, and documents its removal.
13. Phase 1 ships before phase 2, each with its own plan, and phase 1 is
    complete only after a real run on a scratch project with the private
    copy already removed.
14. `on` takes an optional expiry (`/noask on 3h`, `noask global on until
    07:30`), stored as an absolute time beside the generation; a reader
    that finds the marker expired treats it as off, so a forgotten night
    ends itself; `on` with an expiry while on renews the expiry and keeps
    the generation. Without an expiry the global marker holds until
    `noask global off`, and a session's holds for 8 hours, which the
    line printed at `on` states (owner, 2026-11-13).
15. The apply scripts and the terminal command are Linux first, and with
    the command its three hook entries (revision 16); the module's hooks
    are portable code from phase 2, but noask is switched by the
    command and so works on Linux only until phase 3, which makes the
    scripts, the command and its entries portable; the wide fence is
    phase 4.
16. The marketplace is a dedicated `akalongman/claude-plugins` repository
    listing laterbox and sdd by GitHub source; the plugin repositories
    carry no marketplace file.
17. The record repository's tests, tools and parked notes are absorbed;
    its documents and `upstream/` stay in it, kept private as the history,
    because this repository is public (owner, 2026-11-09).
18. Two scopes: a session's own switch, the default, typed in that
    session, and a global one for every session on the machine, typed
    anywhere with the word `global`; a session is under noask when either
    is on (owner, 2026-11-13, reversing the ruling of 2026-11-08). Three
    limits are this design's: no exemption of one session from the global
    switch, no scope between the two, and no switching of one session
    from outside it.
19. The `ak` plugin's stale copies were removed on 2026-11-08; its
    future is a parked note, not this design's concern.
20. The permission ask is decided at PermissionRequest and Elicitation,
    the events that fire when a prompt is about to reach a person, not at
    `tool.check`, whose `ask` verdict the classifier may still settle.
21. While noask is on, no commit on a default branch: the rule prints
    `blocked: commit on <branch>` and keeps the tree dirty, so the owner's
    Stop on `main`/`master` holds at night as by day. An apply run the
    owner launched there is the exception: the launch is the owner's
    word, and the run commits where it was launched (owner, 2026-11-13).
22. A minimal fence ships in phase 2: a push, a pull or merge request
    creation, a plan approval, a switch of noask (its command and its
    marker files) and an edit under the owner's configuration
    directories are refused at the tool call; everything else waits for
    phase 4.
23. The minimum Claude Code version is the build the phase 2 probes ran
    on, written into the README, the CI pin and the prerequisites above
    when phase 2 ships, because a floor nobody ran the probes on is a
    guess. Phase 1 shipped with 2.1.318, and the module API types were
    read from 2.1.322. The probes of 2026-11-15 ran on 2.1.325; the
    floor is the build revision 16's first task runs on, that one or a
    later one.
24. The acceptance for phase 2 is the list above: throwaway tests first,
    module tests per hook, then one afternoon and one night on this
    machine.
25. The command is the markers' only writer and the only place a time is
    computed or printed; the module reads the markers and runs the command
    for `/noask` (owner, 2026-11-12). Switching commands are serialised
    on one lock. Since revision 16 the command is also the only writer
    of the sessions' records, each count under the record's own lock.
26. The command lives in the plugin's `bin/`, on the PATH of a session's
    shell, and the skill's pointer names it bare (owner, 2026-11-12).
27. The end-of-turn line is the last line of the message and stands in
    for the owner's line on the session's state; the proposed working
    agreement says so, and the Stop hook's reason says it to a session
    that adds a line after the token (owner, 2026-11-12).
28. The Stop hook believes a waiting line once without evidence: with
    nothing running or scheduled it continues the turn one time. A
    scheduled wakeup alone does not allow a stop, a subagent's stop is
    not this hook's, and a hook that fails continues a stop once
    (owner, 2026-11-13).
29. The wake-up turn is conditional, since an idle session may be
    waiting on its own work, and a resumed or forked session counts as
    idle (owner, 2026-11-13); since revision 16 the module knows such a
    session by its history, not by how it started.
30. Withdrawn in revision 12 with the rule it limited, noask taking a
    push back.
31. With no home directory both readers read off; a session with no id
    reads unreadable only while some session's own marker is on or
    unreadable, or while the directory of session markers cannot be
    listed (the unreadable marker since revision 18; both written
    here in revision 19).
32. `handsoff` is noask plus the owner's word to publish. The word has
    two homes, both typed by the owner: an apply run's launch, as since
    phase 1, and the second level of a session's own switch, `/noask on
    handsoff`, which is what the fence reads while noask is on (owner,
    2026-11-13). Revision 12 inferred the word from a typed launch and
    kept it in the process; a focused check found that unsound.
34. The switch is guarded in every session, under noask or not, since a
    marker can carry the owner's word to publish: no agent works the
    switch or writes a marker file by a plain call. It is the one hook
    that acts in a session that is not under noask. A wrapped call
    passes it, as a wrapped push passes the fence: a stated limit until
    phase 4, with no caller check in the command (owner, 2026-11-13).
33. The run-level word is `handsoff`, renamed from `hands-off` to sit
    beside `noask`. The rename is a hard one: the old spelling is no
    longer read at a launch, and only dated records keep it (owner,
    2026-11-13).
35. The permission ask, the MCP question and the continued stop are
    command hooks, because on an account under the security default a
    person's module is passed over at every classic event. One design
    serves every account: the command hooks run with or without that
    default, so nothing branches on the account's plan. They were
    seen to run at all three events on the owner's account
    (2026-11-16), and the plugin never writes settings.
36. One record per session, a file under the state directory, written
    by the command alone; the module and the hook entries count by
    calling it. The record of revision 15 lived in the module, which
    two of the three counters no longer reach.
37. The guard on the switch says what may pass, the command's two
    reading forms, and refuses every other form, the test variables
    included; it is built and released before anything else of noask,
    and `main` is not pushed before it (owner, 2026-11-16).
38. A resumed or forked session gets the owner's line from the module,
    once for a session, and no context for the agent; the rule reaches
    it with its first intervention.
41. A continued stop is delivered as the hook's additional context, so
    the session and the screen read it as feedback and not as a hook's
    error; the block form is the failure path's.
42. At a permission prompt the first hook to answer decides. noask's
    entry answers before it counts; a hook of the owner's that allows
    sooner overrules it, which the README states.
43. `/noask on` wakes every idle session whose transcript holds a
    message, a cleared one included.
39. The state directory is the owner's alone; a session's marker
    without an expiry is unreadable; a session's `on` names a global
    marker that is broken; publication is keyed on the status line's
    last word; a controller under `handsoff` parks a unit that needs a
    step outside the worktree. All five come from the review of the
    build that stopped.
40. The machine's move to the plugin waits until noask has shipped
    whole, the second step of the build order (owner, 2026-11-16).

### Left to the builder

- The exact shell for the terminal command (bash, shellcheck-clean, tested
  like `later.sh`) and the module's TypeScript (strict config per the
  owner's JavaScript rules); the marker format and the record's are
  what they share, and the module's `$.state` contract (whether a
  main-loop turn is in flight, and that the start line was said) is declared in `types/index.d.ts`. The
  record's format, the count entry's arguments and output, and how an
  entry answers before it can fail are the builder's, within the
  budgets rule and the failure rule above.
- The byte budget for `SKILL.md` across both phases and which prose pays
  for it, within the ported size test measured on the substituted text.
- The test harness layout, following laterbox's (`hooks/*.test.ts` beside
  the module files, `tests/*.test.sh` for the shell), carrying the phase 2
  acceptance list.
- README structure, following laterbox's: what you type, settings,
  prerequisites, uninstall, what the fence does and does not catch, what
  it sends (nothing: the plugin makes no network call).

## Settled with the owner, 2026-11-08

The eight open questions of revision 5, with the owner's answers; the
design above already reflects them.

1. The precedence paragraph: accepted as written (not raised).
2. Marketplace: one `akalongman` marketplace for both plugins, as a
   dedicated repository (approaches, "Marketplace", option 3).
3. Noask never publishes, no knob: "agree for now".
4. Budgets: raised to 6, 10 and 20, strict counts, configurable, after the
   owner asked "why not more" and the reasoning in "Budgets".
5. The dispatch-contract line: withdrawn; `bin/sdd-checkpoint` replaces it
   after a check of the plugin documentation's practice.
6. The permission intervention: as recommended, a `tool.check` hook that
   denies only person-bound asks, on by default with a switch.
7. The record repository: absorbed, archived on GitHub, removed locally
   (revised 2026-11-09: its documents stay there, private, as the history).
8. The per-session override: not needed (reversed 2026-11-13: the session
   is the default scope, revision 9).

Two further decisions came out of the same review: everything is Linux
first with portability as phase 3 (the owner: "make everything linux first
and make whole plugin portable in the second phase", which the numbering
here places after noask), and the `ak` plugin was shrunk at once.

## Reviewed by Codex and Antigravity, 2026-11-09

Revision 6 went to Codex (gpt-6-astra) and Antigravity (Gemini 4 Argon)
for a read-only review; both found it not ready for a plan. Every claim was
checked against the module API types, the Claude Code docs, the owner's
settings and the record repository before it changed anything here. What
changed, and the owner's decisions of 2026-11-09 ("all as recommended"):

1. Both reviews ranked the shared per-session state file blocking: `fs`
   has no atomic write and no rename, the module has no data directory,
   and the text said in one place that the module holds no state and in
   another that it writes counters. The types show `classic.Stop` may
   block, which the constraints had denied, so every intervention moved
   into the module with the record in `$.state`; the bash Stop hook,
   `away.sh` and `jq` are gone, and phase 3 shrank to the apply scripts and
   the terminal command.
2. Both found the expiry hole: a `hands-off` run suppressed at night would
   push once the marker expired at 07:30. A run that ever read `on`
   ledgers `Noask: seen on` and never publishes; the marker format,
   `until` parsing and the renewal of an expiry are now specified.
3. Antigravity showed that `tool.check` cannot tell a prompt-bound ask from
   one the classifier settles, and that a prompt raised after the
   classifier or by an MCP server never passes it; the permission ask
   moved to PermissionRequest and Elicitation.
4. Antigravity found `ExitPlanMode`, a plan-approval dialog a session in
   plan mode would wait on; it is denied with `blocked: plan awaits
   review`.
5. Antigravity's reading of the owner's settings (`Edit(~/.claude*/**)`
   allowed, no push guard beyond the dotfiles remote) led to the minimal
   fence in phase 2, and its finding that the rule text ("commit on the
   current branch") contradicted the owner's Stop on `main`/`master` led to
   decision 21.
6. Codex: hooks fail open without `.catch` handlers (added everywhere); a
   spent budget only changed the denial text (the `exhausted` flag);
   `noask off` reaches a session already ruling only at its next event (the
   rule now says to read the status before a ruling or a commit); the
   link fallback kept the generic frontmatter names (copies with the name
   rewritten); subagents were not counted (records of their own); the
   budgets prose contradicted the strict counts (reworded); the zero-match
   search contradicted the history and the dual-name tools (scoped); the
   record repository gate omitted `upstream/` and the unpushed commits
   (both added); phase 2 had no acceptance list (added); the minimum
   Claude Code version was unpinned (2.1.318); the Stop hook ran beside
   the owner's hooks with no order (the module's `next(e)` now keeps their
   answer); the phase 4 word "guarantee" was too strong (reworded).
7. Antigravity: `/noask on` on a busy session would queue a spurious turn
   (the module now submits only when idle, tracked from the turn events,
   and `/noask on` takes the expiry too); the SessionStart context should
   carry the noask reference's path (added); the token match should strip
   Markdown and condition 3 must not reset the counters (both done); the
   size guard should measure the substituted text (done).
8. Rejected after checking: Antigravity's claims that a moved script still
   carried the old path in a usage comment (no moved script contains the
   old name), that the settings, another skill and a client project's
   skill referenced the old name (none do, and the path it cited does not
   exist), and that parked notes had been migrated to a store with two
   left open (the record's queue holds four open notes and no such store
   exists); Codex's claim that the design never establishes `run-archive`
   copes without `later` (it prints the parking command; an acceptance
   case for the absent-`later` run was added anyway).

Nothing is open for the owner before the phase 1 plan.
