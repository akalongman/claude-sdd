# sdd: the subagent-apply plugin, with an away mode

Design, 2026-10-30. Status: draft for review (revision 6, 2026-11-08,
after the owner's review of revision 5 settled every open question; the
settled list is at the end). Revision 5 followed the builder check and the
Codex, agy, DeepSeek and Qwen reviews.

## Intent

Two things, in one plugin called `sdd`, because the second is the first
one's rule widened to the whole session.

1. **Move `app-subagent-apply` into a plugin.** Today the skill, its five
   override prompts, its seven scripts and its three agent definitions
   (`app-sdd-implementer`, `app-sdd-reviewer`, `app-sdd-unit-controller`)
   live under `~/.claude` (the other two profiles symlink to it, so there is
   one copy). A plugin gives them a version, a home for the hooks and the
   command module that `away` needs (a skill cannot register hooks), one
   place for tests, and an install path on the owner's other machines that
   carry the same dotfiles. The skill's measurement record, the private
   repository `akalongman/claude-subagent-apply` checked out at
   `~/projects/personal/claude-subagent-apply` (decisions, measurements,
   reviews, five test scripts and transcript tools under `tools/`), hands
   all of that to this repository and is then archived on GitHub and
   removed from the machine (owner, 2026-11-08: "if we move everything,
   why do I need that folder").
2. **Add `away`,** a machine-wide mode in which no session waits for the
   owner. The owner's observation that drove it: when a session stops to ask
   ("found an edge case, I recommend X, should I?", "commit now?", "fix the
   leftovers or not?"), the answer is "as recommended" nearly every time.
   So an absent owner costs the night and buys nothing. The skill already
   has the rule for this inside an apply run (`hands-off`: rule on your own
   reading, ledger `Ruling: <decision>. Cost if wrong: <what>`, keep going,
   stop only for the four stops). `away` applies the same rule to the main
   agent of every session on the machine, through three interventions: a
   refused question, a refused permission ask, and a continued stop.

The mode is about the owner's presence, not the clock, hence `away`, not
"night". Names considered and dropped: `night` (wrong axis), `hands-off`
(already the run-level term; reusing it for the machine scope confuses the
two), `non-interactive` (means print mode in Claude Code), `no-hitl` and
`hitl off` (a negated switch, or an acronym).

## Goals

- One installable plugin, `sdd`, replacing the private skill and agents
  with no change in the apply loop's behaviour (phase 1).
- `away on` makes every session on the machine rule on its own
  recommendation instead of asking, and continue instead of ending a turn on
  a question, from its next hook event until `away off` (phase 2).
- Every ruling made while away is visible in the morning in the chat and in
  the session's final "Rulings I made" list, each with its cost if wrong
  and the recovery that undoes it, so the owner can revert one decision
  without rereading a night.
- A session that reaches an outward or unrecoverable step while away
  records it as `blocked:` and moves on. In this phase that is the rule's
  instruction to the agent, with the apply skill's own push suppressed and
  permission prompts turned into refusals; a tool-level fence is phase 4.
- The whole plugin, the apply skill included, runs on Linux, macOS and
  Windows (phase 3). Phases 1 and 2 are Linux first (owner, 2026-11-08),
  and nothing in them is designed so that phase 3 has to undo it.
- Apply runs launched by day and still running when `away` turns on keep
  going under the same rule, an owner's `pause` is honoured, and no hook
  ever makes a driver act while its unit is live.
- The hooks are inert while `away` is off; daytime behaviour does not change.

## Non-goals

- Replacing the superpowers loop (`subagent-driven-development`), which the
  skill requires and the plugin declares as a dependency.
- A tool-level fence that refuses pushes, merges and database writes by
  inspecting commands (phase 4). Until then away is a rule the agent
  follows, not a guarantee: a push already planned when the marker appears
  is not intercepted, and auto mode's classifier allows pushes and merge
  request creation by default.
- Publication while away, under any setting. The `hands-off` ending's push
  and merge request creation need the owner's word and the owner present;
  there is no knob that lets away publish.
- A persistent ledger file for the main session. Rulings live in the chat
  and in the final list; apply runs keep their own `progress.md` and
  `decisions.md` as today.
- Phone alerts. The plugin prints; routing a blocked session to a phone is
  the owner's hook, not the plugin's.
- Waking a session that was already idle on a question when `away on` was
  typed from a terminal: hooks fire on events, so the marker reaches that
  session at its next event. `/away on` typed in that session wakes it
  (below).
- Running sessions headless or in the cloud.
- Before phase 3, platforms other than Linux: the phase 1 and 2 scripts are
  bash 5 with GNU coreutils, and the README says so until phase 3 ships.
- A per-session override (`/away off` in one session while the machine is
  away, or `/away on` in one session while it is not). Owner, 2026-11-08:
  not needed. `/away` in a session and `away` in a terminal are two doors
  to the one machine-wide switch.

## Anti-goals

- A session that "rules" by doing the irreversible thing it should have
  asked about. A wrong but revertible ruling is the accepted cost; an
  unrevertible one is the failure.
- A session that approves its own spec, plan or source and implements it
  while away. The owner's review of a design, and the choice of what to
  implement, are not questions with a recommendation; they are stops.
- A session that loops on the Stop hook or on a refused tool, burning the
  night on a question it cannot settle, or that an obedient reading of the
  owner's standing rules keeps ending. Every hook is budgeted, every budget
  ends in a visible `blocked:` line, and the precedence below is written
  where every session reads it.
- A hook that fires by day. Everything is gated on one marker file.
- A hook that silently does nothing when the owner thinks it is armed. The
  switch reads its marker back and prints the path; a name collision fails
  loudly.
- A second ruling vocabulary. `Ruling:`, `Cost if wrong:`,
  `Open before merge:`, `blocked`, `parked` and the four stops are the
  skill's words. The plugin adds exactly three end-of-turn tokens, all
  prefixed `away:`.

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
  module API types on 2026-11-08: `tool.call` (a tool call, answered with
  `{ deny: <text> }` so the model reads the text as the tool's error; fires
  in subagent loops too, with `agentId`), `tool.check` (fires when the
  engine decides whether a call may run, after PreToolUse and before the
  mode settles an ask; `next(e)` resolves to the engine's verdict `allow`,
  `ask` or `deny` with the `rule`, `setting`, `hook` or `plugin` that
  decided it, and the hook may return another verdict), `turn.complete`
  (the final message of a turn, observe-only: it cannot block a stop),
  `prompt.submit` (a user turn of the plugin's own, run once the session is
  idle), `store` (a plugin JSON file under the config directory, kept
  across sessions), `fs`, `state` and `session.start`. The classic
  `hooks.json` events remain the only way to block a stop from a plugin.
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
  throwaway test. Returning `{"decision": "block", "reason": "..."}` makes
  the agent continue with the reason as guidance; the harness caps
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
  too. In auto mode the classifier is the mode that settles an `ask`
  verdict, so most unmatched calls reach `tool.check` as `ask` and are then
  allowed by the classifier; a hook that denied every `ask` would cripple
  the session. Whether a hook's denial counts toward the pause threshold is
  undocumented; the build tests it (three denials in a row in a throwaway
  session) and what an unmatched call's verdict carries under auto mode.
  The machine's three profiles all default to auto mode; a session in the
  manual mode stops at its first unapproved call.
- The question auto-continue timeout (`askUserQuestionTimeout`) never starts
  in a session attached to Remote Control, so it is no substitute for the
  hooks on this machine.
- Plugin agents are named `<plugin>:<name>`; whether the Agent tool's
  `subagent_type` accepts the scoped name is undocumented (tested first; the
  fallback is in the design). Whether a plugin agent's `skills:` preload may
  name another plugin's skill is undocumented (tested first; the fallback is
  in the design and is itself tested). superpowers ships no `agents/`
  directory, so no plugin agent name collides with it.
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
  `systemMessage`, which laterbox uses.
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
  configuration is the only switch, which is why the marker file gates the
  scripts themselves.
- After a context compaction the harness re-attaches an invoked skill cut
  at 20,000 characters (measured in the record repository's decision 23,
  with session ids); supporting files are not re-attached. `SKILL.md` was
  19,392 characters on 2026-10-30 and is 19,749 on 2026-11-08 (a commit of
  2026-11-06 grew it), over the 19,500 guard of the record's
  `check-skill-size.sh` and 251 under the cut. The move trims it back
  under the guard, and both phases' additions are paid for by prose
  tightened in the same file, under the same test.
- A command module registers `/<name>` with letters, digits, `_` and `-`
  only (laterbox registers `/later`), so the in-session switch is `/away`,
  not `/sdd:away`; the skill namespace applies to skills, which run as a
  model turn. `$.prompt.submit` runs a turn of its own once the session is
  idle; no module call can dismiss an open question dialog or permission
  prompt. laterbox's module handles a taken name with a toast and its
  terminal link refuses a foreign file silently; this plugin may not fail
  silently (anti-goal).
- The record repository's five test scripts (`tools/`) default to the
  dotfiles path of the skill, and its transcript tools classify roles by
  the names `app-subagent-apply` and `app-sdd-*`. The repository has
  `docs/` (specs and plans), `reviews/`, `tools/` with a `green/` fixture
  set, `upstream/` and a parking lot with four open notes.
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
  outside the worktree that every run makes today.

**Assumption.** Sessions that run while away use auto mode, the machine's
default in every profile. The design does not handle a manual-mode session.

**Residual waits.** With the three interventions in place a session can
still stop for the owner in these cases, listed so nobody expects
otherwise: the classifier's own pause after repeated denials (and, should
the build's test show the permission intervention's denials count toward
it, that intervention is narrowed and the owner's `ask` rules join this
list); an MCP tool that requires interaction, if `tool.check` does not see
its ask; a turn ending in an API error (`StopFailure`, which nothing
re-wakes); a session already idle, or holding an open question dialog or
permission prompt, when the marker appeared; and the budgets below running
out, which end in a visible `blocked:` line.

## Approaches considered

### Packaging

1. **Private hooks and a skill under `~/.claude`**, like the existing
   `push-guard.sh`: smallest build, but no in-session command, no version,
   nothing reusable.
2. **A standalone `away` plugin** beside the private skill: clean, but the
   skill's `hands-off` integration would cross a package boundary through a
   marker path two codebases happen to agree on.
3. **One plugin carrying the skill, its agents and `away`** (chosen): the
   rule, the ledger line and the four stops have one owner, and the marker
   is an internal contract.

### Where the hooks run

1. **Three shell hooks in `hooks.json`** (revision 5): PreToolUse on the
   question tool, PermissionRequest, Stop. Bash 5 with `jq`, Linux only,
   and the permission hook can only answer a prompt that has already been
   raised.
2. **The module for what it can do, shell for the rest** (chosen): the
   question refusal is a `tool.call` deny and the permission ask is a
   `tool.check` verdict, both a few lines of TypeScript that run in Claude
   Code's own runtime on every platform and see the verdict before any
   prompt or classifier; the Stop hook stays a shell hook, because no
   module hook can block a stop. Phase 3 may move the continuation to
   `turn.complete` plus `prompt.submit` and the terminal command off bash.

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
   per session (typed each time), cannot be gated by the marker, and stops
   a session after a few turns without tool use.
2. **A command Stop hook of the plugin's own** (chosen): gated by the
   marker, machine-wide, deterministic; it needs no question detection
   because while away the only legitimate stops are the three end-of-turn
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
   reviews converged on it): `away: waiting: <the ledger line>`. Costs one
   rule in the away reference, makes the hook a one-line match, and lets
   the budget suspend itself during a wait.

## Design

### Repository and layout

`akalongman/claude-sdd`, checked out at `~/projects/akalongman/claude-sdd`,
laid out like `claude-laterbox` (with its root files: `types/`, `LICENSE`,
`.github/`, `.gitignore`, `.gitattributes`):

```
.claude-plugin/plugin.json        name sdd, dependencies, userConfig (terminal, budgets, permission hook)
.claude-plugin/types/             the module API types, as in laterbox
tsconfig.json                     strict config for the module
types/index.d.ts                  the plugin's own types (marker, budget state)
bin/sdd-checkpoint                the checkpoint script, on the Bash tool's PATH
skills/apply/SKILL.md             the moved skill, invoked as /sdd:apply
skills/apply/prompts/*.md         the five override prompts (headings renamed, one edited)
skills/apply/scripts/*            the other six scripts, unchanged
skills/apply/references/away.md   the driver's rules while away (phase 2)
agents/implementer.md             sdd:implementer
agents/reviewer.md                sdd:reviewer
agents/unit-controller.md         sdd:unit-controller
hooks/hooks.json                  Stop (phase 2) and SessionStart
hooks/register.tsx                the module: /away, the question refusal, the permission ask (phase 2)
scripts/away.sh                   the marker, the budgets and the Stop decision
scripts/away                      the terminal command, linked like `later`
scripts/away-rule.md              the rule text, one copy
tests/*.test.sh                   shell tests: away.sh, and the record's five ported
tools/                            the record's transcript tools, ported
docs/superpowers/specs/           this document
docs/history/                     the record's decisions, measurements, specs, plans and reviews
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

**Prerequisites, stated in the README:** until phase 3, Linux, bash 5,
GNU coreutils, `jq`, git; Claude Code with plugins, hooks and the Agent tool; the
superpowers plugin; the owner's rule file `~/.claude/rules/git.md` for the
implementer's commit rules (the plugin does not ship a copy); model aliases
as the account offers them, with the skill's own fallback ledger line when
one is unavailable.

### Phase 1: move the skill (behaviour unchanged)

What moves, and the only edits made to it:

- `skills/apply/SKILL.md`: the private `SKILL.md`. Its `name` becomes
  `apply` (the invocation is `/sdd:apply`). Every `app-sdd-unit-controller`
  dispatch becomes the plugin agent's name; the sentence "definition in
  `~/.claude/agents/`" goes. The dispatch payload does not change: the one
  path a controller needs, the checkpoint script, is the bare command
  `sdd-checkpoint` from the plugin's `bin/`. `scripts/...` and
  `prompts/...` paths stay relative to the skill directory as today, and
  the driver's own call of the checkpoint script becomes the bare name too.
  No rule, step or ledger line changes. The file returns under 19,500
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
  prefix, `description` and body reading "for the sdd plugin's apply
  skill" where they read "for app-subagent-apply", every other frontmatter
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
name. If neither dispatches, the plugin's SessionStart hook links the three
agent files into `~/.claude/agents/` as `sdd-implementer.md`,
`sdd-reviewer.md` and `sdd-unit-controller.md` (prefixed, so a generic name
never shadows another agent), re-pointing an own link on every session
start so a version bump never leaves a dangling link, never overwriting a
foreign file (a notice instead), and the skill and the prompts dispatch
those names. Removal is a documented README step, since a disabled plugin
runs no hook to clean up after itself.

What changes outside the repository, all proposed to the owner before being
made:

- The private skill directory and the three agent files are removed from
  `~/.claude` (the public dotfiles) once the plugin is enabled and one real
  run has passed. One copy, one removal; the other profiles follow through
  their symlinks. Afterwards a search for `app-subagent-apply` and
  `app-sdd-` across the plugin and `~/.claude` (memory notes excepted)
  returns nothing.
- The owner's global `CLAUDE.md` working agreement that names
  `app-subagent-apply` is reworded to name `/sdd:apply`; it is the one
  reference outside the skill itself (searched 2026-10-30 across `~/.claude`
  and the tsmulms project's `.claude`).
- The record repository (`~/projects/personal/claude-subagent-apply`) is
  absorbed and retired: its five test scripts (`check-skill-size.sh`,
  `check-pause-text.sh`, `test-run-archive.sh`, `test-sdd-checkpoint.sh`,
  `test-sub-skill-check.sh`) are ported into the plugin's `tests/` with the
  plugin paths as their defaults; its transcript tools
  (`transcript-roles.py`, `transcript-clock.py`, `transcript-tokens.py`)
  and the `green/` fixtures move to `tools/` and accept both the old names
  and `sdd:apply`, `sdd:unit-controller`, `sdd:implementer`,
  `sdd:reviewer`, so runs before and after the move are measured alike;
  its decision log, measurements, specs, plans and reviews move to
  `docs/history/` with a closing decision-log entry that records the move;
  its four open parked notes are read with the owner and re-parked here or
  closed. Then the GitHub repository is archived (not deleted, so old links
  resolve) and the local checkout is removed. Nothing is removed before
  `git status` there is clean and every file above exists here.
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
   script, from a controller and from the driver), a resumed driver's
   re-dispatch, the final phase and `run-archive` exactly as the private
   skill did, with the same ledger lines and the same dispatch payload,
   and with `Handed to` lines parked when `later` is on PATH.
3. `/sdd:apply` without arguments still infers the source from the
   conversation, and `step`, `hands-off`, `isolated` and `tier=` still parse.

### Phase 2: away

**The switch.** One marker file, `~/.local/state/sdd/away`, holding the
activation generation: the ISO-8601 time with nanoseconds plus a random
suffix, so two toggles within one second never share one. It is a fixed
path rather than `CLAUDE_PLUGIN_DATA` because the terminal command runs
outside any session, where no plugin variable exists, and because the path
is the contract the skill and the hooks share. `away.sh` is the only writer
and reader; everything else calls it. `away.sh status` prints `on <generation>`
or `off` and exits 0; any other exit means "unreadable", and every caller
treats unreadable as the safe side of its own decision (below), never as
on or off.

- Terminal: `away on`, `away off`, `away` (prints `away: on since <time>` or
  `away: off`). `away on` writes the marker, reads it back and prints its
  path, so a failure cannot be quiet; while on, or `off` while off, it says
  so and changes nothing. The command is linked into `~/.local/bin` at
  session start the way laterbox links `later`, with the same `terminal`
  setting (`link` or `off`), but a refused link (a foreign `away` in the
  way) and a `~/.local/bin` off PATH are reported in the session, not only
  logged. The plan's first task checks `/help` and PATH for an existing
  `away` before the name is taken. The marker written from a terminal
  reaches each session at its next hook event.
- In a session: `/away on|off` and bare `/away`, registered by the module in
  `hooks/register.tsx` so it runs the moment it is typed, also mid-turn (the
  owner leaves while sessions are working); a module command cannot carry
  the plugin prefix. The module calls `away.sh` for the marker only and
  prints its line; it holds no state and needs no data directory. `/away
  on` typed in a session that is idle on a prose question also submits one
  user turn, "away is on: answer your last question yourself under the away
  rule and continue", which runs once the session is idle and never while a
  turn is in flight (a busy session gets the marker at its next hook
  event, and no extra turn). A session whose question dialog or permission
  prompt is open takes no typed command until the owner presses Esc, which
  returns to the agent without an answer; then `/away on`.
- Session start, resume and compaction: when the marker exists, the
  SessionStart hook (matcher `startup|resume|clear|compact|fork`, the
  documented set; `compact` because a compaction re-attaches `SKILL.md` but
  not the away reference) returns a `systemMessage`, `sdd: away is ON
  since <time>; sessions rule on their own recommendations and never wait;
  away off to end it`, so a morning session cannot miss it (whether
  SessionStart shows `systemMessage` is checked in the build, laterbox
  being the precedent), and as `additionalContext` for the agent the rule
  text plus, for an apply driver, "re-read the away reference".

**The rule text.** One file in the plugin, `scripts/away-rule.md`, read by
the Stop hook, by the module for its two refusals, by the SessionStart
hook and by `away on`, so there is exactly one copy. It names no tool, so
any agent reading it gets the same instruction. Its content, in the second
person to the agent:

> away is on: nobody answers until it is off. When you would ask, take your
> own recommendation (the option you would mark recommended, else the
> first), print `Ruling: <decision>. Cost if wrong: <what>` beside it, the
> cost naming what undoes it (a commit, a worktree database refresh, a
> file restored), and continue. A choice with no such recovery is not a
> ruling: print `blocked: <what>` instead. Commit path-limited on the
> current branch at each checkpoint; never create or switch a branch. In a
> session that does its own work, fix a leftover that one commit can
> revert and list the rest as `Open before merge:` lines; an apply driver
> keeps its own rule and edits nothing. These are blocked, never ruled: an
> irreversible or destructive operation (a database reset, a deletion of
> data no commit holds), a security-sensitive action, a side effect outside
> this worktree (a push, a merge or merge request, a message to a person, a
> deploy, a write to a database this session does not own, a secret; a
> run's own archive under the config directory and its parking of
> `Handed to` lines are not side effects), an edit to the owner's
> instruction files, rules or skills, the owner's review of a spec or plan
> you wrote, the choice of what to implement when nothing names it, and a
> plan so broken that every path forward is a guess. A conversation whose
> method is the owner's answers (brainstorming, grilling, a review the
> owner must read) is blocked at its next question, not ruled, because a
> design direction is not undone by a commit. Print `blocked: <what>`, skip
> the item and the items that depend on it, continue with the next
> independent one; never implement a spec, plan or source the owner has
> not named or reviewed. Every turn you end ends on one line, the last
> line of the message: `away: waiting: <what you wait for>` when work of
> yours will wake you (a subagent, a scheduled wakeup), `away: done` with
> the list "Rulings I made" above it when the work is done, or
> `away: blocked: <why>` when nothing independent is left. A continuation
> you receive while you wait is answered by printing the same waiting line
> again, never by acting. Never re-ask in prose a question that was
> refused, never ask it again by any means, and never retry a refused
> command in another spelling.

The four stops of the superpowers loop are in that list word for word
(destructive, security-sensitive, outside the worktree, every path a guess),
so the main session and a unit controller stop for the same reasons.

**Precedence over the owner's standing rules.** The owner's global
instruction file loads in every session and tells the agent to ask before
committing, to list minor review findings as a question, to lead with a
recommendation and wait, and to go through brainstorming, spec, plan and the
owner's review before implementing. Left as they are, an obedient session
keeps ending its turn and the Stop hook bounces it until the budget runs
out. So the precedence is written where every session reads it, as one
working agreement in that file, proposed to the owner with phase 2:

> While the sdd plugin's `away` marker exists, its rule overrides the
> agreements to commit only when asked, to ask before fixing minor review
> findings, and to end a turn on a question whose answer I would give as
> "as recommended"; it overrides nothing else. The Stops hold; a spec or
> plan written while away waits for my review; and brainstorming,
> grilling and a review conversation stop at their next question instead
> of ruling.

So away overrides exactly three things (the commit question, the minors
question, the recommendation-then-wait habit) and turns the design path's
review, the Stops, the OpenSpec cycle's review points, the questioning
skills and the outward actions into `blocked:` entries. Nothing in the away
rule lets a session edit `CLAUDE.md`, a rule file or a skill, act on a
parked note, pick its own source, or create a branch.

**Budgets.** Each session keeps one small state file,
`${CLAUDE_PLUGIN_DATA}/away/<session_id>`, holding the activation
generation it was last seen under and three counters: question refusals,
permission denials and Stop continuations. A hook that finds the marker's
generation differs from the file's resets all three and records the new
generation, so `away off` then `away on` starts every session afresh
without the terminal command knowing any data directory. Every allowed stop
resets all three, so each budget bounds consecutive interventions, not a
night: a driver that waits on twenty units, or a session that rules on
twenty separate questions with work between them, is never capped. Hooks
that fire with `agent_id` (or the module's `agentId`) present, inside a
subagent, count nothing. The module writes its two counters into the same
file through `fs`, so the Stop hook and the module read one state. Writes
are atomic (write to a temporary file, rename); the SessionStart hook
sweeps state files older than seven days. The budgets, each a `userConfig`
number with this default: 6 question refusals, 10 permission denials and
20 Stop continuations. The counts are strict (nothing but an allowed stop
resets them) on purpose: a reset on every tool call, the harness's own
rule, would leave a session that reads one file and re-asks the same
question unbounded all night. The numbers differ because the
interventions differ: a refusal is the same question asked again after
reading the rule, six in a row is stuck; a denial is a distinct outward
action, and one stretch of work can meet several; a continuation is a
turn ended without a token, which a working session may do many times
while it still makes progress, so its budget is the widest. Each budget
exists to bound this plugin's interventions, not the session's activity;
an agent can still spend tool calls between them.

**Denials inside a subagent.** The module's `tool.call` and `tool.check`
fire in subagent loops too, where the input carries `agentId`. There the
reason must not tell the agent to
"continue with the next independent item": a unit controller and an
implementer have their own protocol for a denied tool (the controller's
return block carries `Denied:` lines and the unit pauses or parks). With
`agentId` present the reason is role-neutral: "away is on: this action
needs the owner and is denied; follow your role's rule for a denied tool",
and nothing is counted.

**Intervention 1, the question refusal** (module, `tool.call` on the
tool that puts a question to the person). Inert without the marker. With
it, the call is answered with a deny whose text is the rule, prefixed
`sdd away:`, and the refusal counter is incremented. At the budget the
text says instead: "the question budget is spent: end this turn with the
list Rulings I made and the line `away: blocked: question budget
exhausted`".

**Intervention 2, the permission ask** (module, `tool.check`). Inert
without the marker. With it, the hook first takes the engine's verdict
(`next(e)`) and changes nothing unless that verdict is `ask` and would
reach a person: an explicit permission rule (`rule` set; today the owner's
`sdp` task writes, `cf` and `cfx` destructive flags and `secrets`, all
outward actions the rule blocks anyway), the read-outside-working-directory
setting (`setting` set), an ask a hook or plugin raised (`hook` or
`plugin` set), or a tool that requires interaction. Such an ask becomes a
deny with the reason "away is on: this action needs the owner; print
`blocked: <the action>` and continue with the next independent item", and
the denial counter is incremented, with the same budget ending as
intervention 1. Every other verdict passes through untouched, in
particular the `ask` that auto mode's classifier settles for an unmatched
call. It ships on while away, with a `userConfig` boolean to turn it off.
Two things the throwaway test pins before it ships: what an unmatched
call's verdict carries under auto mode, so the filter above is proven
rather than guessed, and whether three hook denials in a row count toward
auto mode's pause (they should not, since the classifier never ran). If
the filter cannot be made precise, the hook is narrowed to explicit rules
and hook-made asks, and the rest join the residual waits.

**Intervention 3, the Stop hook** (`hooks.json`, bash). Inert without the
marker. With it, the script reads the hook input and allows the stop when
any of these holds:

1. The last non-empty line of `last_assistant_message` is one of the three
   tokens: `away: waiting: ...`, `away: done`, `away: blocked: ...`
   (matched without regard to case, on the last line only, so a quoted
   rule text never ends a session).
2. `background_tasks` is present and contains a task of type `subagent`
   whose `status` is one of the running or pending values the throwaway
   test observed, or `session_crons` is present and holds a one-shot entry
   (`recurring: false`): the session's own work will wake it. A `shell`,
   `monitor`, `workflow` or `teammate` task, a finished task, a recurring
   cron (a `/loop` that would otherwise exempt the whole session) and an
   absent array (registry unreachable) are not reasons; the token covers
   the driver in every one of those cases.
3. The continuation budget is spent.

Otherwise it increments the counter and returns
`{"decision": "block", "reason": "<the rule text>"}`. From the sixth
continuation on, the reason adds "if no tool work is left, end now with
the list Rulings I made and the line `away: blocked: continuation budget
exhausted`; otherwise continue", so a session looping in pure prose prints
its ending before the harness's own cap of 8 consecutive continuations
without a tool call pre-empts it, while a session with work left keeps
going up to the budget of 20. At the budget the reason is the ending
alone. `stop_hook_active` is read but does not change the decision: a
session continuing because of this hook is the intended state, and the
budget bounds it.

**The apply skill under away.** `SKILL.md` cannot grow, so it gains the
shortest possible pointer, "At launch and before acting on every controller
return run `${CLAUDE_PLUGIN_ROOT}/scripts/away.sh status`; on `on`,
`${CLAUDE_SKILL_DIR}/references/away.md` applies" (both paths substituted
at load, since the driver's shell has no plugin variables and a supporting
file gets no substitution of its own), and the resume filter in its item
1 gains `Away` in its alternation so a resumed driver sees the lines
below. Everything else lives in `skills/apply/references/away.md`, the
only behavioural edit of phase 2 to the moved skill. It keeps the owner's
requested mode apart from the effective one:

- Every turn the driver ends to wait (a dispatch made, a `waiting` or
  `paused` return, a relayed hand-back, a child not yet reported, a pause
  in force) ends on `away: waiting: <the ledger line it just wrote>` as the
  last line of the message. A Stop-hook continuation received while a unit
  is live is answered by printing that line again and ending the turn;
  never by a dispatch, a resume, a stop of a child or an edit (the 2026-10-13
  orphaned-implementer incident is the reason).
- The launch ledgers the requested mode as today (`hands-off` given or
  not). At launch and before acting on every controller return, the driver
  runs the status command. An unreadable status is ledgered `Away: status
  unreadable (<error>)` and counts as off for rulings (the driver asks as
  usual) and as on for publication (no push), the safe side of each. While
  on, the run is effectively hands-off: a dispatch carries `Mode: hands-off
  (away)` when the owner did not give the word, a `needs-ruling` return
  from a controller dispatched without any mode is resumed once with
  "Mode: hands-off (away): rule and continue" (the existing defect path),
  and `step`'s continue-or-stop prompt is skipped and ledgered
  `Away: step prompt skipped`. The first such decision in a run ledgers
  `Away: hands-off implied since <time>`. A controller already dispatched
  with `(away)` keeps ruling for its unit after `away off`; the next
  dispatch reads the status again.
- `/sdd:apply` with no argument, or with several candidate sources, while
  away is `away: blocked: no source named`; choosing what to implement is
  never a ruling.
- The exceptions the skill makes for the owner become parked units, never
  rulings and never a whole-run stop: the drift question after a resume
  ("the tree changed while paused; continue or stop?") and the
  `needs-ruling` a controller returns on a resume (which the skill asks of
  the owner even under hands-off) ledger `Section N: parked (away:
  <question>)`, the driver prints `blocked: <question>` and takes the next
  unit that does not depend on it. A `paused` return whose point is a
  denied tool, and a second `failed` return, are parked the same way. With
  no independent unit left the driver ends on `away: blocked: <why>`. An
  owner's `pause` in force is honoured as today, the driver ending on the
  waiting line.
- Publication authority is the owner's word, never away's: the `hands-off`
  ending's push and merge request creation run only when the owner gave
  `hands-off` at launch and the status reads `off` at that moment.
  Otherwise the driver ledgers `Hands-off: not pushed (away)` and the final
  message says the push is pending.
- The run's own writes outside the worktree stay: `run-archive` copies the
  workspace to the config directory's `docs/tmp/apply-runs/` and parks
  `Handed to` lines through `later`; `<ws>` is deleted only after the
  archive printed its path, as today. Parking a note is not acting on one.
- The final message's `offer:` lines (add items to a plan section) are
  printed as report lines only, never asked and never written into the
  plan file.
- The driver's final message ends on `away: done`, or `away: blocked:
  <final status>` when the final phase ended with anything but `complete`.

**Worked example.** 23:00, three sessions in three worktrees of one
project, each with a branch the owner created. `away on` in a terminal
prints the marker path; each session picks the marker up at its next hook
event. Session A is an apply driver mid-unit: each wait turn ends on
`away: waiting: Section 3: handed to controller`, which the Stop hook
allows; at 01:20 the controller returns `needs-ruling` ("the spec and the
code disagree on the sort key"); the driver reads the status, resumes the
controller with "Mode: hands-off (away): rule and continue", ledgers
`Away: hands-off implied since 23:00`, and the controller rules and parks
or completes as the loop says; at 04:00 the run ends with `Hands-off: not
pushed (away)`, "Rulings I made" and `away: done`. Session B is a plain
session reviewing a plan: at 00:40 it ends a turn with "I recommend
splitting task 4; shall I?"; the Stop hook blocks with the rule; it prints
`Ruling: split task 4 into 4a and 4b. Cost if wrong: one commit to fold
them back`, edits the plan, continues; at 02:10 it wants `git push`; it
prints `blocked: push of sc-1230`, continues; at 02:30 it ends with
"Rulings I made" and `away: done`. Session C was brainstorming a feature
and has just written a spec: its next step is the owner's review, so it
ends on `away: blocked: spec awaits review`. Session D had asked "which of
the two schemas?" at 22:50 and was idle when the terminal switch ran; it
stays idle until the owner types `/away on` in it, which submits the
wake-up turn; it answers its own question, rules, and continues. 07:30,
`away off`; the owner reads three "Rulings I made" lists, one spec,
`git log dev..<branch>` per worktree, and pushes.

**What stays as it is.** `SubagentStop` is not registered, so controllers,
implementers and reviewers return exactly as today. The classifier's own
pause (3 consecutive or 20 total denials) is not touched; the rule's "never
re-ask, never retry" and the blocked list keep sessions away from it.

### Phase 3: the whole plugin portable

Linux, macOS (its system bash 3.2, nothing from Homebrew, as laterbox's
README promises) and Windows (Git for Windows' bash, which installing
plugins already requires, with the terminal command unavailable on native
Windows as laterbox's `later` is). What changes: the apply skill's seven
scripts lose their bash 5 and GNU dependencies (`inherit_errexit`, `chmod
--reference`, `realpath -ms`, nanosecond `date`) or move into the module
behind `bin/` wrappers; the Stop hook either becomes bash-3.2 clean
without `jq` or moves to the module as `turn.complete` plus
`prompt.submit` (the continuation then a user turn of the plugin's own,
the budget wholly the plugin's, and the harness cap no longer in play);
`away.sh` follows the same choice; the marker path is computed from HOME
or USERPROFILE; CI runs the tests on the three platforms like laterbox's.
Its own spec and plan, written when phase 2 has run one night.

### Phase 4: the tool-level fence

A `tool.check` or PreToolUse fence that refuses a push, a merge request,
a deploy and a database write while away by inspecting the call itself,
so that away becomes a guarantee rather than a rule. Named here so that
nothing in phases 1 to 3 is designed against it; otherwise undesigned.

### Decisions made in this design (the owner may overrule)

1. The marker lives in `~/.local/state/sdd/`, a fixed path, because the
   terminal command has no plugin variables and the path is a shared
   contract; its content is the activation generation (nanosecond time
   plus a random suffix).
2. Away never publishes: the `hands-off` push and merge request creation
   need the owner's word and a status of `off`; the earlier `away_push`
   knob is gone.
3. Three end-of-turn tokens, `away: waiting:`, `away: done`,
   `away: blocked:`, always the last line; the Stop hook matches the last
   line only and no ledger phrase.
4. Budgets: 6 question refusals, 10 permission denials, 20 consecutive
   Stop continuations, each a `userConfig` number, with the ending
   instruction in the reason from the sixth continuation on; every allowed
   stop resets all three and nothing else does; subagents are never
   counted.
5. The rule text is one file read by the Stop hook, the module, the
   SessionStart hook and the switch; it carries the four stops verbatim
   and the questioning skills, and names no tool.
6. laterbox is a recommendation, not a declared dependency.
7. The dispatch contract does not change: `sdd-checkpoint` lives in the
   plugin's `bin/` and is run by its bare name from the driver and the
   controller alike.
8. The question refusal and the permission ask are module hooks
   (`tool.call`, `tool.check`); the permission ask denies only an `ask`
   verdict that would reach a person, ships on while away with a
   `userConfig` switch, and its filter is pinned by the throwaway test.
   The Stop hook stays a shell hook. The command fence is phase 4.
9. An unreadable status is the safe side of each decision: off for
   rulings, on for publication.
10. The away rules for the driver live in `references/away.md`, because
    `SKILL.md` has no room under its compaction-safe limit (it is over
    the guard today and the move trims it), and the SessionStart hook
    re-emits them after a compaction.
11. The in-session command is `/away` (module names take no prefix); the
    name is checked against `/help` and PATH before it is taken, and the
    switch never fails silently.
12. The agent-link fallback uses prefixed names (`sdd-*`), re-points its
    links at every session start, and documents its removal.
13. Phase 1 ships before phase 2, each with its own plan, and phase 1 is
    complete only after a real run on a scratch project with the private
    copy already removed.
14. `away on` takes an optional expiry (`away on 9h`, `away on until
    07:30`), stored in the marker beside the generation; a hook or a status
    read that finds the marker expired treats it as off, so a forgotten
    night ends itself. Without an expiry the marker holds until `away off`.
15. Phases 1 and 2 are Linux first; phase 3 makes the whole plugin
    portable, the apply scripts included; the fence is phase 4.
16. The marketplace is a dedicated `akalongman/claude-plugins` repository
    listing laterbox and sdd by GitHub source; the plugin repositories
    carry no marketplace file.
17. The record repository is absorbed (tests, tools, documents, parked
    notes) and then archived on GitHub and removed locally.
18. One machine-wide switch with two doors; no per-session level.
19. The `ak` plugin's stale copies were removed on 2026-11-08; its
    future is a parked note, not this design's concern.

### Left to the builder

- The exact shell for `away.sh` (bash, shellcheck-clean, tested like
  `later.sh`), the module's TypeScript (strict config per the owner's
  JavaScript rules), and how the module and the shell hooks share the
  marker and the per-session state file (one format, written by both).
- The byte budget for `SKILL.md` across both phases and which prose pays
  for it, within the ported size test.
- The test harness layout, following laterbox's `tests/`, including a test
  for each Stop allow condition, the last-line match, the generation
  reset, the counter reset on an allowed stop, and the off-then-on toggle
  within one tick.
- README structure, following laterbox's: what you type, settings,
  prerequisites, uninstall, what it sends (nothing: the plugin makes no
  network call).

## Settled with the owner, 2026-11-08

The eight open questions of revision 5, with the owner's answers; the
design above already reflects them.

1. The precedence paragraph: accepted as written (not raised).
2. Marketplace: one `akalongman` marketplace for both plugins, as a
   dedicated repository (approaches, "Marketplace", option 3).
3. Away never publishes, no knob: "agree for now".
4. Budgets: raised to 6, 10 and 20, strict counts, configurable, after the
   owner asked "why not more" and the reasoning in "Budgets".
5. The dispatch-contract line: withdrawn; `bin/sdd-checkpoint` replaces it
   after a check of the plugin documentation's practice.
6. The permission intervention: as recommended, a `tool.check` hook that
   denies only person-bound asks, on by default with a switch.
7. The record repository: absorbed, archived on GitHub, removed locally.
8. The per-session override: not needed.

Two further decisions came out of the same review: everything is Linux
first with portability as phase 3 (the owner: "make everything linux first
and make whole plugin portable in the second phase", which the numbering
here places after away), and the `ak` plugin was shrunk at once.

Nothing is open for the owner before the phase 1 plan.
