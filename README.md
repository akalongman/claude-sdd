# sdd

sdd is a Claude Code plugin that implements a superpowers plan or an OpenSpec
change through subagents. Its `/sdd:apply` skill drives one unit controller
per unit of the source, with implementers and reviewers one layer down, and
archives the run. Its noask switch lets a session, or every session on the
machine, rule for itself instead of asking you.

## Install

In your shell, the first line adds the marketplace that lists superpowers,
which sdd depends on:

```bash
claude plugin marketplace add obra/superpowers-marketplace
claude plugin marketplace add akalongman/claude-plugins
claude plugin install sdd@akalongman
```

Or inside a Claude Code session:

```text
/plugin marketplace add obra/superpowers-marketplace
/plugin marketplace add akalongman/claude-plugins
/plugin install sdd@akalongman
```

In a session, `/plugin install` opens the plugin's details, where you review
what it adds and choose a scope before it installs. A shell install loads in
the next session, or after `/reload-plugins` in a session already open.

## Requirements

- Claude Code 2.1.325 or newer: the plugin's hooks module loads in every
  session.
- The superpowers plugin (`superpowers@superpowers-marketplace`), whose
  subagent-driven-development loop the skill runs. sdd declares it as a
  dependency, so Claude Code installs it with sdd when the
  `superpowers-marketplace` marketplace is added; without that marketplace,
  sdd installs but does not load.

  The skill was verified against one superpowers release, pinned in
  `skills/apply/scripts/sub-skill-check`. With any other copy, each launch
  prints a warning that the run uses an unverified sub-skill, and the run
  goes on.
- Until phase 3 of the plugin's design, which makes the scripts portable:
  Linux, bash 5, GNU coreutils and `flock` (util-linux). WSL counts as
  Linux; macOS and native Windows are not supported until then.
- git.
- `jq`, which `skills/apply/scripts/sub-skill-check` runs at every launch
  and noask's command hooks run to read the input Claude Code hands them.
  Without it those hooks cannot read a session's id, so while the global
  switch or any session's own is on: a permission prompt is denied and a
  tool server's question declined in every session, neither counted; and
  each turn's first stop is continued once, with a line that asks the
  session to end on `noask: blocked: stop hook unreadable`, and the stop
  after it is allowed whatever its last line says, so no stop sets the
  budgets' counts back. Whatever the switches, the terminal command is
  then neither linked nor removed. A session's start line under noask
  says that `jq` is not on PATH.
- For an OpenSpec source only, the `openspec` CLI, through which the skill
  loads the change.
- Not required: `~/.claude/rules/git.md`. The implementer overrides
  (`skills/apply/prompts/implementer-overrides.md`) and the skill's branch
  step cite it, but it is the plugin author's own git rule file, which
  plugin users do not have and the plugin does not ship. The commit rule
  holds without it: the branch step asks for path-limited commits on the
  current branch, and the overrides spell out the command,
  `git add <paths> && git commit -m "<title>" -- <paths>`. Only what the
  author's file adds beyond that is missing.
- Model aliases as your account offers them. The skill dispatches on `opus`
  and `fable`, and on `sonnet` for a unit you name, under `tier=sonnet`, and
  as the fallback of an `opus` role: a role that hits a rate limit runs one
  tier down for the rest of the run, and the run's ledger records the
  switch.
- Recommended, not required: the laterbox plugin, whose `later` command
  parks the items a run hands to later work. It installs from the same
  marketplace as sdd, with `claude plugin install laterbox@akalongman`.
  When `later` is not on PATH (laterbox links it as `~/.local/bin/later`, so
  that directory must be on PATH), each such item shows in the run's final
  report as a `not parked` line with the command that parks it from any
  terminal, never as an error.

## Using it

```text
/sdd:apply <source> [step|handsoff] [isolated] [tier=<alias>]
```

`<source>` is an OpenSpec change name, a plan file path, or a PRD or spec
path, and `<name>` below is the change name or the plan file's name
without `.md`. An OpenSpec change (its `openspec/changes/<name>/tasks.md`
exists) runs one unit per `## N.` section of `tasks.md`; a superpowers plan
(a `Task N` heading) runs one unit per task; a PRD, spec or issue goes
through superpowers' writing-plans skill first and then runs as a plan.
With no source, the skill infers it from the conversation and asks when
there are several candidates.

`step` stops after each unit that completes or parks, shows that unit's
result and asks whether to continue; stopping ends the run there, with the
stop recorded in the ledger.

`handsoff` means nothing stops after the launch. Unit controllers rule on
their own reading and record each ruling with its cost if wrong, and
mismatches are parked instead of asked. After a final phase that completes,
the skill pushes the branch to its remote, else `origin`. Off the default
branch it opens a merge request with `glab` on a GitLab host or a pull
request with `gh` on github.com, with the run summary and the run's
rulings, handed-on, parked and open-before-merge lines as its description;
on any other host it stops and says the branch is pushed. On the default
branch it pushes and opens nothing. A final phase with any other status
pushes nothing. The word was spelled `hands-off` before version 0.2.0, and
that earlier spelling is no longer read.

Without `isolated`, the run commits on the current branch, the default
branch included, with path-limited commits, and never creates or switches a
branch; it stops on uncommitted changes in the units' files. With
`isolated`, the run works in `.worktrees/<name>` on a branch `<name>`, the
OpenSpec change's name or the plan's file name without `.md`. A launch
whose `.worktrees/<name>` already holds the run's ledger goes on there,
with `isolated` or without it. A first launch copies the source (an
OpenSpec change's folder, or a plan and the spec it names, from any path)
into the worktree as it stands, commits none of it, and reads only that
copy from then on; at the end the skill keeps the copy's final state in the
run's archive and says how to keep the run's version (an OpenSpec change
goes through `/opsx:archive` inside the worktree and is committed on the
run's branch). When the project has a worktree bootstrap, the first that
exists of `composer worktree:setup`, `npm run worktree:setup` and
`make worktree:setup`, the skill runs
`git worktree add .worktrees/<name> -b <name>` from HEAD and the bootstrap,
and the worktree stays until you run the project's teardown. Without one,
git must ignore `.worktrees/`; the skill makes the worktree bare and runs
the project's gates once in it. When they pass, the run goes on there and
the worktree stays until you remove it; when one fails, the worktree and
its branch are removed and the run stops, naming the failing command.

`tier=<alias>` sets the model of the unit controllers, implementers and
reviewers, `opus` by default; the aliases are `sonnet`, `opus` and `fable`.
The final review and fix rounds 4 and 5 run on `fable`.

The session you launch the skill in is the driver. For each unit it
dispatches one `sdd:unit-controller`, which runs the superpowers loop for
that unit: it dispatches `sdd:implementer` to do the work and `sdd:reviewer`
to review it, runs the project's gates and marks the unit complete. After
the last unit, one more `sdd:unit-controller` runs the final phase, the
final review and the gates over the whole run. The three agents serve these
dispatches only. While a run is live, `pause` in the session holds the run
once the current implementer or reviewer reports, `continue` resumes it,
and `abort` stops the unit's agents and waits for `continue`.

The run keeps its state in `.superpowers/sdd/<name>/` in the repository:
the ledger `progress.md`, `decisions.md`, and each unit's brief, file list,
report and review. Launching again with the same source resumes from the
ledger and dispatches nothing already complete or parked.

At the end, `skills/apply/scripts/run-archive` copies the workspace and the
run's facts to
`~/.claude/docs/tmp/apply-runs/<project slug>/<YYYY-MM-DD-HHMM>-<name>/`
(with `$CLAUDE_CONFIG_DIR` in place of `~/.claude` when it is set), the
project slug being the working directory with every `/` replaced by `-`. It
also parks each item the run handed to later work as a laterbox note, and
the final message ends with the archive path.

## Noask

noask is a switch under which a session does not ask you: where it would
ask, it takes its own recommendation, prints the ruling with what it would
cost if wrong and goes on, and what only you may decide (a choice that
nothing undoes, a step outside the worktree) it leaves blocked for you. You
switch it for one session or for every session on the machine, and the
plugin's hooks hold sessions to it at their tool calls, their permission
prompts, their tool servers' questions and their stops.

### What you type

In a session:

```text
/noask on [<expiry>]                  noask for this session
/noask on handsoff [<expiry>]         the same, and this session may publish
/noask off                            this session's switch off
/noask                                the status
/noask global on [9h | until 07:30]   noask for every session
/noask global off                     the global switch off
```

`<expiry>` is `<n>h`, `<n>m` or `until HH:MM`, the next such local time.
A session's switch typed with no expiry ends after 8 hours; the global
switch typed with none stays on until it is switched off. `global off`
turns off the global switch only: a session's own switch stays on until
`/noask off` is typed in that session or its expiry comes, and
`global off` says so of the session it is typed in. What each line prints
first, typed one after another at 23:00 on 11 November in a session where
no switch was on:

| You type | The first line printed |
|---|---|
| `/noask on` | `noask: on for this session since 23:00 until 2026-11-12 07:00 (8 hours by default; /noask on <expiry> sets another)` |
| `/noask` | `noask: on for this session since 23:00 until 2026-11-12 07:00` |
| `/noask off` | `noask: off for this session` |
| `/noask global on until 07:30` | `noask: on for every session since 23:00 until 2026-11-12 07:30` |
| `/noask global off` | `noask: off for every session` |
| `/noask on handsoff 2h` | `noask: handsoff for this session since 23:00 until 2026-11-12 01:00` |

A new `on` also prints the marker's path and the rule text the session
follows. An `on` typed in an idle session that already holds a message
submits a wake-up turn: the session answers its own last question under
the rule, or ends its turn when it was waiting or done.

The bare `/noask` and `/noask status` run whoever sends them. Every other
form, each switch among them, runs only when you type it at the session's
prompt or send it from your phone or the web through Remote Control; sent
from anywhere else (a schedule or a loop, another session, a channel,
another plugin, the SDK, an automatic continuation), it runs nothing and
shows `noask: /noask acts only when the owner types it; nothing changed`.

In a terminal the command is `noask`. At each new session's start (not at
a resume, a fork, a clear or a compaction), whether noask is on or off,
the plugin keeps `~/.local/bin/noask` a link to its own command, through a
link in its data folder, as laterbox keeps `later`; the `terminal`
setting turns that off (Settings, below). There
`noask global on [<expiry>]` and `noask global off` work, and a bare
`noask` shows the global switch and every session's switch that is on; a
session's own switch is typed in that session.

The link step says what it did in the start's message, a line for each
notice:

- `noask: added the terminal command ~/.local/bin/noask; set sdd.terminal to off in /config to remove it.`
  when it made the link;
- `noask: removed the terminal command ~/.local/bin/noask.` when
  `terminal` is `off` and it removed the link it had made;
- `noask: ~/.local/bin/noask exists and was not made by this plugin, so the terminal command was not added; remove it and start a new session to get it.`
  when anything else stands there (a file, a folder, a link to another
  target or to nothing), which it leaves as it is;
- `noask: ~/.local/bin is not on PATH in this session, so a terminal may not find noask; add it to PATH in your shell's startup file.`
  when the link is the plugin's and `~/.local/bin` is not on PATH.

The last two are said when their condition starts, and again only after
it has ended and come back. A step that cannot finish (a command that
fails, or takes more than 2 seconds, or about 4 seconds in all) ends
there, with no notice for what it did not do, and runs again at the next
start; so a `~/.local/bin` the session cannot write to is never reported,
and no link is made. Without `jq`, and off Linux, the step does not run.

### What a session does while noask is on

- A question is refused with the rule text, and the session rules for
  itself. A plan approval is refused with a line of its own, which asks the
  main session to end its turn on `noask: blocked: plan awaits review`; a
  subagent's is refused with the line that asks it to follow its role's
  rule for a denied tool.
- A push, a pull or merge request (`gh pr create`, `glab mr create`), an
  edit through a file tool under a configuration directory (each entry of
  the home whose name starts with `.claude`, and the directory
  `CLAUDE_CONFIG_DIR` names, each also by where it resolves) and a switch
  of noask are refused, each with a line that asks the session to print
  `blocked: <what>` and go on with the next independent item, and a
  subagent to follow its role's rule for a denied tool. This is the fence,
  on as the plugin ships; with it off, the guard below still refuses the
  switch, and the rest is left to the rule text.
- The fence lets one folder of a configuration directory through:
  `plans/`, where a session in plan mode saves its plan before it asks for
  the plan approval, so the plan is written and the approval is refused.
  An edit below it passes unless it lands elsewhere in a configuration
  directory (a `plans` that is a link to `rules`); the folder itself and a
  `plans` folder deeper in the directory (`projects/<project>/plans/`) are
  no exception, and the guard has none. A memory note, under
  `projects/<project>/memory/`, is refused and counted as a denial like
  every other edit there. While the home directory cannot be listed, a
  path that starts like a configuration directory is refused by its
  spelling, a plan's too. So is a plan's write while its path cannot be
  resolved in time: the path is then judged by its spelling alone, with
  no exception for `plans/`. Nor is there the exception while the home
  cannot be listed, or while a configuration directory itself cannot be
  resolved (its look refused, or not answered in time), since a `plans`
  folder that is a link may lead into it: an edit under any of them is
  then refused, a plan's too.
- A permission prompt about to be shown to you is denied in your place
  with
  ``noask is on: this action needs the owner; print `blocked: <the action>` and continue with the next independent item``,
  and a subagent's with the line that asks it to follow its role's rule
  for a denied tool. The hook answers every permission prompt Claude Code
  sends it, whatever raised the prompt; of the sources (an `ask` rule,
  the classifier declining to decide, another hook), only a prompt raised
  by an `ask` rule has been observed. A tool server's question (an MCP
  elicitation) is declined in your place: the server receives a decline,
  and the agent reads whatever the server makes of one. Each counts as a
  denial. With the `permissionHook` setting off, both wait for you.
- Of the hooks that answer one permission prompt, Claude Code acts on the
  first that ends with a decision, and it takes the plugin's answer only
  when the plugin's hook process ends, after its count. So a hook of
  yours that allows and ends sooner overrules the denial, which is
  counted all the same. A slow denial (while another noask command holds
  the lock on the budgets' records, the count waits up to 2 seconds for
  it, and the reads around it add more) leaves the dialog on the screen
  meanwhile, and
  with Remote Control on the request is on your other devices for as
  long, where the first answer decides. The same holds for a tool
  server's question: while its decline waits on the count, a person can
  answer the dialog.
- A turn that ends without an end-of-turn line is continued: the Stop
  hook hands the session the rule text, which it reads as the hook's
  feedback, and counts a continuation. The end-of-turn line is the last
  line of the message that is not blank, among its last 200, read
  without regard to case once the Markdown around it is stripped (a list
  marker, backticks, bold or italics, a closing period; a line that needs
  more than seven rounds of that holds none, and so does a line longer
  than 1024 bytes): `noask: done`, `noask: blocked: <why>` or
  `noask: waiting: <what>`. A stop is allowed on such a line, while a
  subagent of the session's runs in the background, and once a budget is
  spent. A waiting line at a turn's first stop, while the stop's input
  shows nothing of the session's running or scheduled, is continued once
  with the rule text and a line that says `waiting` is for the session's
  own work; printed again, it is believed. When an end-of-turn line
  stands earlier in the message with text after it, the continuation
  opens with
  `Your end-of-turn line must be the last line of the message; nothing follows it.`,
  and from the sixth continuation in a row it ends with a line that asks
  the session to end now if no tool work is left. A subagent's stop is
  left alone.
- At a session's start under noask you see a line that names the switch
  and the way out, such as
  `sdd: noask is ON for this session since 23:00 until 2026-11-12 07:00; it rules on its own recommendations and never waits; /noask off to end it`
  for a session's own switch, or
  `sdd: noask is ON for every session since 23:00 until 2026-11-12 07:30; sessions rule on their own recommendations and never wait; noask global off to end it`
  for the global one, and the agent is handed the rule text and where the
  apply skill's noask reference is. The plugin's command hook gives both
  at a new session, after `/clear` and after a compaction. At a resume
  and a fork, where that hook's answer reaches neither the screen nor the
  agent, the plugin's module shows the same line once, to you only,
  headed by the plugin's name, and the agent meets the rule at its first
  refused question or continued stop. A clear and a fork give the session
  a new id, though, which a session's own switch typed before them does
  not follow: it neither holds the session nor gives it a line there
  (What still waits, below). A sentence follows the line, after a full
  stop that ends it and one space, when this session's own switch is on
  too under the global one, when `jq` is not on PATH, and when the rule
  file cannot be read. A session whose id the hook cannot read while
  another session's own switch is on is treated as under noask, and its
  line says why: `sdd: noask treats this session as ON: <reason>`.
- Three budgets bound the interventions in a row: 6 refused questions, 10
  denials (the fence's, the guard's, a denied permission prompt and a
  declined server question included) and 20 continued stops. Once one is
  spent, a refusal, a denial or a continuation asks the main session to
  end its turn with the list of its rulings and the line
  `noask: blocked: <question, permission or continuation> budget exhausted`,
  and the session's next stop is allowed whatever its last line says; a
  subagent is asked to return, and counts its refusals and denials
  against budgets of its own. The plan approval's refusal counts nothing.
- Every stop the Stop hook allows on an end-of-turn line or beside a
  running subagent sets the three counts back to 0, and nothing else
  does, tool calls between the interventions included. For example, a
  session that ends three turns in a row on a question in plain text is
  continued three times; when it then ends a turn on `noask: done`, that
  stop is allowed and the next stretch has its 20 continuations again. A
  spent budget stays spent, and its ending stop sets nothing back, until
  noask is switched off and on again.
- Typing an `on` with an expiry while that switch is on (`/noask on 2h`)
  renews the expiry from that moment and keeps the counts, and
  `/noask on handsoff` raises the level and keeps them too; a bare
  `/noask on` while it is on changes nothing and says so.

### What still waits, and other limits

- Auto mode's own pause, once its classifier has denied 3 actions in a
  row or 20 in all, waits for you.
- A turn that ends in an API error waits for you: Claude Code runs no
  Stop hook for it, and nothing wakes the session.
- A session that is idle, or has a question's dialog or a permission
  prompt open, when the global switch goes on in a terminal or in
  another session is not woken: nothing runs in it to meet the switch,
  and it waits. Typing `/noask global on` in an idle one wakes it, as any
  `on` does, and changes nothing while that switch is on (`/noask on`
  wakes it too, and switches its own on). Answer an open dialog, and
  noask holds the session from its next question, prompt or stop.
- A session's own switch stays with the session's id, and a `/clear` or
  a fork gives the session a new one (a resume and a compaction keep
  it). So the switch typed before a clear or a fork does not hold the
  session after it, and no line says so: type `/noask on` in it again,
  or use the global switch. The old switch stays on under the old id,
  and a bare `noask` in a terminal still lists it, until it expires or
  `/noask off` is typed in a session that still holds that id:
  `noask global off` leaves it on, and a switch's sweep removes its
  marker only once it has expired.
- A dialog that no hook precedes still waits for you, such as the browser
  setup offer, and a goal proposal's may: whether its dialog waits under
  noask is unchecked.
- A `noask: waiting:` line printed while anything of the session's is
  running or scheduled, however unrelated, is believed: the Stop hook
  cannot tell it from a real wait.
- On a machine without `jq` the command hooks act as Requirements says.
- When the Stop hook fails (it cannot read its input, its count fails, or
  it is ended by a signal), it continues only a stop whose input shows
  that it is a turn's first, and allows every other, so a hook that fails
  costs one turn and never a loop. A stop whose input it cannot read at
  all (not JSON, empty, longer than 4 MiB, or not read within 4 seconds)
  is therefore allowed, and the session stops as it would without the
  plugin.
- A permission prompt or a tool server's question whose input the hook
  cannot use (longer than 4 MiB, or not read within 4 seconds) is denied,
  or declined, in a session whose own switch is off while another
  session's own switch is on: without the session's id the hook cannot
  tell the two sessions apart.
- A session whose folder of switches, `~/.local/state/sdd/noask.d/`, can
  no longer be searched (its permissions changed) reads its own switch as
  off.
- A hook that Claude Code cancels at its timeout of 30 seconds answers
  nothing, since Claude Code throws away what it printed: a stop then
  ends, and a prompt waits for you. The hooks bound their own waits so as
  to end before it.

### The guard on the switch

In every session, under noask or not, the plugin refuses an agent's own:

- call of the command in any form but a bare `noask` and `noask status`,
  and also either of those two after a `NAME=value` setting;
- command that sets a variable whose name starts with `SDD_NOASK_`, the
  command's test seams (a `NAME=value` setting, alone or before a
  command, or `export`, `declare`, `typeset`, `readonly` or `local` of
  one);
- edit of a file under `~/.local/state/sdd/` through a file tool, judged as
  spelled and by where it lands;
- shell command that names a path there with `rm`, `rmdir`, `unlink`,
  `shred`, `mv`, `cp`, `ln`, `install`, `truncate`, `tee`, `dd`, `touch`
  or `chmod`, or with a redirection that can write (`>`, `>>`, `>|`, `&>`,
  `&>>`, `>&` before a file, `<>`). Each of these is refused when it names
  a path there, whether it would write it or only read it, so
  `cp ~/.local/state/sdd/noask /tmp/x` is refused too;
- removal of the home, `~/.local` or `~/.local/state` (`rm`, `rmdir`), or
  a move of one of them away (`mv`, read by what it moves). Moving a file
  into the home, as in `mv /tmp/report ~`, is not refused.

A `*`, `?` or `[...]` in such a path is matched part by part, a little
wider than the shell matches it (a set stands for any one character, and a
leading dot is matched like any other), so `rm -rf ~/.local/state/*` is
refused as the removal it is. `rm -rf ~/*` is refused too, though the
shell's `*` does not match `.local`: a refusal beyond need (below). Under
noask with the fence on, the guard's refusal carries the fence's line and
counts as a denial; otherwise it carries a line of its own and counts
nothing. A call wrapped in `sh -c`, a quoted `eval`, a script or an alias
passes the guard, as it passes the fence: the word to publish is yours
against a plain call and no further, a stated limit until the wide fence
of phase 4 of the plugin's design.

Two more kinds of shell command are refused in every session, noask on or
off, since the guard cannot tell what they would run:

- A command the guard cannot read to its end, because it is too long or
  nested too deep: the scan has a fixed amount of work for one command,
  and what a command costs depends on its shape. That work reads to its
  end at least some 139 KB of plain script: lines that each hold one
  simple command of words made only of ASCII letters and digits, `.`,
  `_`, `-` and `/`, separated by spaces or tabs, whose first word is not
  a path, a reserved word (such as `if`, `do` or `time`), a prefix
  command (named below) or a file program (named above); so no quote,
  `$`, pattern, comment, redirection, here-document, assignment,
  substitution or operator but the line end. Each feature the class
  admits was measured alone at its densest, and the densest, one command
  of one-letter words, is read to 139.5 KB. A script of any other shape
  can cost more and be refused far sooner. One-letter words in a group
  (`{ a b c ...; }`) or after `!`, `if` or `do` are read to some 108 KB,
  and in a backtick substitution, or as terms of arithmetic written with
  spaces (`(( a + b + c ))`), to some 88 KB. Lines of `a[1]=x`, whose
  subscript the scan reads as arithmetic, are read to some 121 KB; lines
  of `sudo apt-get install -y build-essential` to some 116 KB, and of
  `sudo ./install --prefix /usr/local` to some 106 KB, since behind a
  prefix command the scan reads `install`, and a path by its last part,
  as the file program; and one line of 16 here-documents, the most bash
  5.3 takes on a line, with `$(a)` words after them, to some 55 KB, and
  less with empty or nested substitutions, some 49 KB with `$()` words
  and some 39 KB with words of `$(` nested 50 deep, since each
  substitution counts every here-document still waiting. Each word at a
  command's start (a `NAME=value` word, `time` and its options, or one
  of `!`, `{`, `if`, `then`, `elif`, `else`, `while`, `until` and `do`)
  is looked at again for every later word of the command, so one command
  of 1,000 `NAME=value` words, under 4 KB, is refused, and so is one
  with 705 `!` before its name, 1.4 KB. A file program, or a redirection
  that writes a file, costs more for each path it judges, and can cost
  more for a path spelled from `~`, under `~/.local`, or with a `=`, a
  pattern or a leading `-`. With a home of 13 characters, and paths
  that do not start with `-` and hold, after any leading `~`, only ASCII
  letters and digits, `.`, `_`, `-` and `/`, `rm -f` is read to its end
  with some 1,750 to 2,000 paths of 33 characters written out under the
  home, 1,550 to 1,700 spelled from `~` under `~/.local/state/`, 4,850
  relative ones of 20 characters or 1,050 to 1,200 of 59 characters
  written out under the home, and `cp` with some 2,400 to 3,400, 2,150
  to 2,400, 6,750 or 1,450 to 1,950 of the same; a script of
  `echo a >~/a` lines is read to some 110 KB and one of
  `rm -f ~/projects/app/build/out.o` lines to some 1,800 lines (58 KB).
  An ordinary tool call comes nowhere near these shapes and sizes.
- A command in which a substitution (`$(...)`, `<(...)`, `>(...)`,
  `${ ...; }`) closes while a here-document opened inside it is still
  open, such as `x=$(cat <<EOF)` with the body on the lines after it,
  which bash runs with a warning. Inside the text of a double parenthesis
  the scan does not refuse this; see the limits below.

Under noask with the fence on, each is a denial of the fence; otherwise
it is refused with a line that says how to write the command instead.

The fence and the guard read a shell command that an agent hands to the
shell tool or to the watch tool, which runs a command and takes each line
it prints as an event; a watch of a socket holds no command and passes.
These two are the only tools hooked for a command: a tool of an MCP
server that runs a shell command is hooked by nothing, and its command
passes both.

### What the fence and the guard do not catch

- The command run through an interpreter, as in
  `bash ~/.local/bin/noask global off`: the scan reads `bash` as the
  command, so neither the guard nor the fence reads it as a switch of
  noask.
- A command wrapped in `sh -c`, a quoted `eval` (`eval "git push"`, whose
  words the scan does not join and read again), a script, an alias or a
  here-document passes, and so does a spelling built to hide a command
  from the scan, as a wrapped one does: the fence and the guard stand
  against a plain call, not against a session that sets out to get round
  them.
- A command run by a word the scan does not read as a prefix command
  (`builtin`, `coproc`, `chronic` or the `watch` program, as in
  `coproc git push`), a command that follows a `function` on its line
  with only words between the two, as in the body of a function declared
  with the word `function` and no parentheses
  (`function f { git push; }; f`), a command word made by a brace list
  (`{git,push}`) or joined by `${IFS}` (`noask${IFS}global${IFS}off`), a
  git alias for `push`, and a declaration behind a prefix command
  (`command export SDD_NOASK_NOW=1`, while a plain `export` of the name is
  refused) pass.
- A relative path into the state directory
  (`cd ~/.local/state/sdd && rm noask`), a path spelled with a brace list
  (`~/.local/{state,share}`) or from the home as `~user` or `${HOME:-x}`,
  a copy that brings a folder named `sdd` into the folder above the state
  directory (`cp -R /tmp/sdd ~/.local/state`), the removal of a folder
  above the home (`rm -rf /home`), and a write by a command the guard does
  not list (`sed -i`, `find -delete`, an interpreter's one-line program)
  pass.
- A substitution in single quotes inside arithmetic
  (`x=$(( '$(noask global off)' ))`) or inside a parameter's default in
  double quotes (`echo "${x:-'$(git push)'}"`) is not read, while bash
  runs it.
- Inside the text of a double parenthesis, which the scan reads both as
  arithmetic and as commands (`$((...))`, and `((...))` where a command
  stands), a here-document that a substitution leaves open is read in an
  order that is not always bash's. There a push or a switch on a line
  that bash runs can pass the scan, and a line that bash reads as a
  here-document's body can be refused.
- In a few more layouts the scan takes for a here-document's body lines
  that bash runs, so a push or a switch on them passes: after a compound
  assignment's subscript that holds `<<` (`arr=( [1<<2]=y )`, a shift to
  bash); after a `<<` with a word after it inside a `((` that follows a
  `function` or a `coproc` on its line with only words between the two
  (`function f { (( x = 1<<10 )); }`, `coproc (( x = 1<<10 ))`), a shift
  to bash, which the scan takes for a here-document's opener since it
  reads that `((` as two parentheses, unless the `<<` stands inside a
  `<(` or `>(` or the `((` inside a substitution; and in a `$(`, alone or
  inside another, that runs across a line end after a here-document
  opened earlier on its line (`: <<EOF; echo $(true` and the lines
  after), whose body bash reads only after the line the substitution
  closes on.
- One more, in a failure only: while the home directory cannot be listed,
  a configuration directory other than `~/.claude` and the one
  `CLAUDE_CONFIG_DIR` names that is a link is guarded by its name and not
  by where the link points, so an edit that names the link's target
  passes; and so is any of them while a path cannot be resolved in time.
- The guard, like the fence, judges a path that cannot be resolved in time
  by its spelling alone, and a link to a file that is not there yet by the
  link's own path, so a write through either link into the state
  directory or a configuration directory passes.

After a prefix command (`env`, `command`, `exec`, `nohup`, `sudo`,
`doas`, `eval`, and the runners `timeout`, `nice`, `ionice`, `setsid`,
`stdbuf`, `xargs` and `flock`) the scan reads every later word that names
`git`, `gh`, `glab`, `noask` or one of the file programs above as that
command, so `timeout 60 git push` is a push, one other than a plain one.
That refuses a little beyond need: the scan does not read which words are
an option's value, so a line where such a name stands as another
command's argument can be refused (`sudo grep -rn noask docs`), while the
same line without the prefix passes. The scan refuses beyond need in a few
more places, each failing closed: `rm -rf ~/*`, whose `*` it matches to
`.local` (above); a double parenthesis, which it reads both as arithmetic
and as commands, so `((git push))`, arithmetic to bash that runs nothing,
is a push; the lines after the one a `$(` closes on in the last of the
here-document layouts above, which bash reads as that here-document's
body and the scan as commands (`: <<B; y=$(true`, then the lines `B`,
`)`, `git push` and `B`, is a push); and two kinds of command it takes
for a here-document left open by a substitution: an unclosed `$[` before
a comment that holds a `$(...)` or `${ ...; }` leaving a here-document
open (`echo $[ 1 # $(: <<B)`, past which bash runs nothing), and a `<<`
with a word after it inside a `((` that follows a `function` or a
`coproc` on its line with only words between the two, which bash reads
as arithmetic, when the `<<` stands inside a `<(` or `>(`
(`function f { (( n<(1<<10) )); }`), plain or inside backticks, or when
that `((` stands inside `$(...)`, `<(...)`, `>(...)` or `${ ...; }`
(`z=$(function f { (( x = 1<<10 )); }; f)`).

### noask and handsoff

Under noask nobody is asked and nothing is to leave the machine: the rule
text blocks every side effect outside the worktree, and the fence refuses
the calls it names. `handsoff` is noask plus your word to publish. You
give it to an apply run at its launch (`/sdd:apply <source> handsoff`), or
to a session with `/noask on handsoff`; while noask is on, the fence reads
the word from the session's own switch alone, so an apply run under noask
publishes only in a session switched with `/noask on handsoff`. There the
session itself, never a subagent, may open a pull or merge request, and
push only with a plain push: `git push` with no setting or prefix command
(`timeout` among them, as named above) before `git`, nothing between
`git` and `push` but `-C <path>`, and after it at most one `-u` or
`--set-upstream`, a remote by its name and one branch, all written with
literal words. The remote is the first word after `push` other than its
option, the only one when there is one; one that holds a `/`, is `.` or
`..`, or starts with `~` is a path and not a name, while a branch may
hold a `/` (`git push origin feature/x`). A pattern, a variable or a
substitution in it, or a remote given as a URL or as a path
(`git push /srv/git/x.git main`), makes it no plain push, and it is
refused; so is a call that also holds anything else the fence names.
What the repository's own configuration makes of a plain push (a mirror
remote, a push default) the fence does not see. The global switch has no
such level.

### Settings, what it sends, where it runs

Six options, which `/config` names `sdd.questionBudget`,
`sdd.denialBudget`, `sdd.continuationBudget`, `sdd.fence`,
`sdd.permissionHook` and `sdd.terminal`: the question budget (6 by
default), the denial budget (10), the continuation budget (20), the fence
(on), the permission hook (on) and the terminal command (`link`, or
`off`). A budget takes a whole number from 1 to 99999; any other value
counts as the default. With the fence off, a push, a request and an edit
under a configuration directory are left to the rule text, while the
question's and the plan approval's refusals and the guard stay. With the
permission hook off, a permission prompt and a tool server's question
wait for you, as without noask; any value but `false` leaves it on. With
the terminal command at `off`, each new session's start removes the link
the plugin made and adds none; any value but `off` links.

noask sends nothing: its module and its command make no network call. Its
switches and the sessions' records stay in `~/.local/state/sdd/`.

noask works on Linux only, with bash 5, GNU coreutils and `flock`, and
its command hooks also need `jq` (Requirements); elsewhere the command
reads every switch as off and refuses to switch, with a line that says
so, and its hooks answer nothing.

## Develop

Load the checkout in place for one session, and run `/reload-plugins` in it
after an edit:

```bash
claude --plugin-dir .
```

Validate the plugin, test the hooks module, run the tests, hold the
fence's table against bash and check the shell scripts:

```bash
claude plugin validate . --strict
claude plugin test .
bash tests/run.sh
bash tests/check-fence-rows.sh
shellcheck bin/noask bin/sdd-checkpoint bin/sdd-files-add skills/apply/scripts/named-paths skills/apply/scripts/openspec-section-brief skills/apply/scripts/openspec-section-tick skills/apply/scripts/run-archive skills/apply/scripts/source-copy skills/apply/scripts/sub-skill-check skills/apply/scripts/task-brief tests/*.sh
```

The module's type check runs locally only: `tsconfig.json` extends the
engine's declarations, which Claude Code writes into
`.claude-plugin/types/` beside a loaded plugin and which the repository
does not hold.

```bash
npx -y -p typescript@5.9.3 tsc -p . --noEmit
```

A session with this plugin loaded refuses an agent's plain call of a
switching `noask` command, so the command is tested through
`bash tests/test-noask.sh`, which `tests/run.sh` runs and which runs every
command under a temporary home.

`tests/run.sh` ends with `<n> ok, <n> skipped, <n> failed`. It skips
`test-run-archive` when `later` is not on PATH, and `test-sub-skill-check`
when no superpowers copy is installed; with one installed,
`test-sub-skill-check` fails unless it is the copy that
`skills/apply/scripts/sub-skill-check` pins. CI
(`.github/workflows/test.yml`) provides both, fails on any skip, tests the
module and holds the fence's table against bash, and runs shellcheck
0.11.0, which does not report the two SC2015 notes that 0.9.0 reports.

Installed copies move only when `version` in `.claude-plugin/plugin.json`
changes, so a release is a version bump, which
`claude plugin update sdd@akalongman` then brings to an installed copy.
Never release while an apply run is live: a run keeps working across an
update only while the paths it handed to its controllers still exist.

## Uninstall

First switch noask off: type `/noask global off` in a session, or run
`noask global off` in a terminal, for the global switch, and type
`/noask off` in each session whose own switch is on (a bare `noask` in a
terminal lists them). Then remove the terminal command: set
`sdd.terminal` to `off` in `/config` and start one new session, which
removes `~/.local/bin/noask` and says so (the link step runs only when a
new session starts, not at a resume, a fork, a clear or a compaction); or
remove `~/.local/bin/noask` by hand and start no session before the
uninstall, since a new one would link it again. Then:

```bash
claude plugin uninstall sdd@akalongman
```

Or inside a session: `/plugin uninstall sdd@akalongman`. Last, remove
`~/.local/state/sdd/`, which holds the switches and the sessions' records,
by hand.

## History

The design history is kept in the record repository
(`akalongman/claude-subagent-apply`, private).

- 0.4.0, 2026-11-24: noask whole; its record is entry 8 of `docs/decisions.md`.

## License

MIT, see [LICENSE](LICENSE).
