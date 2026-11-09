# sdd

sdd is a Claude Code plugin that implements a superpowers plan or an OpenSpec
change through subagents. Its `/sdd:apply` skill drives one unit controller
per unit of the source, with implementers and reviewers one layer down, and
archives the run.

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

- Claude Code 2.1.318 or newer.
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
  Linux, bash 5 and GNU coreutils. WSL counts as Linux; macOS and native
  Windows are not supported until then.
- git.
- `jq`, which `skills/apply/scripts/sub-skill-check` runs at every launch.
- For an OpenSpec source only, the `openspec` CLI, through which the skill
  loads the change.
- `~/.claude/rules/git.md`, the plugin author's own git rule file, read from
  your home directory; the plugin ships no copy. The implementer overrides
  (`skills/apply/prompts/implementer-overrides.md`) and the skill's branch
  step cite it for the commit rule. Without that file, the rule both places
  spell out still applies (path-limited commits on the current branch with
  `git add <paths> && git commit -m "<title>" -- <paths>`), and only what
  the file would add is missing.
- Model aliases as your account offers them. The skill dispatches on `opus`
  and `fable`, and on `sonnet` only for a unit you name. A role that hits a
  rate limit runs one tier down for the rest of the run, and the run's
  ledger records the switch.
- Recommended, not required: the laterbox plugin, whose `later` command
  parks the items a run hands to later work. When `later` is not on PATH
  (laterbox links it as `~/.local/bin/later`, so that directory must be on
  PATH), each such item shows in the run's final report as a `not parked`
  line with the command that parks it from any terminal, never as an error.

## Using it

```text
/sdd:apply <source> [step|hands-off] [isolated] [tier=<alias>]
```

`<source>` is an OpenSpec change name, a plan file path, or a PRD or spec
path. An OpenSpec change (its `openspec/changes/<name>/tasks.md` exists)
runs one unit per `## N.` section of `tasks.md`; a superpowers plan (a
`Task N` heading) runs one unit per task; a PRD, spec or issue goes through
superpowers' writing-plans skill first and then runs as a plan. With no
source, the skill infers it from the conversation and asks when there are
several candidates.

`step` stops after each unit that completes or parks, shows that unit's
result and asks whether to continue; stopping ends the run there, with the
stop recorded in the ledger.

`hands-off` means nothing stops after the launch. Unit controllers rule on
their own reading and record each ruling with its cost if wrong, and
mismatches are parked instead of asked. After a final phase that completes,
the skill pushes the branch to its remote, else `origin`. Off the default
branch it opens a merge request with `glab` on a GitLab host or a pull
request with `gh` on github.com, with the run summary and the run's
rulings, handed-on, parked and open-before-merge lines as its description;
on any other host it stops and says the branch is pushed. On the default
branch it pushes and opens nothing. A final phase with any other status
pushes nothing.

Without `isolated`, the run commits on the current branch, the default
branch included, with path-limited commits, and never creates or switches a
branch; it stops on uncommitted changes in the units' files. With
`isolated`, the skill looks for the project's worktree bootstrap, the first
that exists of `composer worktree:setup`, `npm run worktree:setup` and
`make worktree:setup`, and stops before creating anything when there is
none. It then runs `git worktree add .worktrees/<name> -b <name>` from HEAD,
runs the bootstrap and works from that worktree, which stays until you run
the project's teardown.

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

The run keeps its state in `.superpowers/sdd/<name>/` in the repository,
`<name>` being the change name or the plan file's name without `.md`: the
ledger `progress.md`, `decisions.md`, and each unit's brief, report and
review. Launching again with the same source resumes from the ledger and
dispatches nothing already complete or parked.

At the end, `skills/apply/scripts/run-archive` copies the workspace and the
run's facts to
`~/.claude/docs/tmp/apply-runs/<project slug>/<YYYY-MM-DD-HHMM>-<name>/`
(with `$CLAUDE_CONFIG_DIR` in place of `~/.claude` when it is set), the
project slug being the working directory with every `/` replaced by `-`. It
also parks each item the run handed to later work as a laterbox note, and
the final message ends with the archive path.

## Develop

Load the checkout in place for one session, and run `/reload-plugins` in it
after an edit:

```bash
claude --plugin-dir .
```

Validate the plugin, run the tests and check the shell scripts:

```bash
claude plugin validate . --strict
bash tests/run.sh
shellcheck bin/sdd-checkpoint skills/apply/scripts/openspec-section-brief skills/apply/scripts/openspec-section-tick skills/apply/scripts/run-archive skills/apply/scripts/sub-skill-check skills/apply/scripts/task-brief tests/*.sh
```

`tests/run.sh` ends with `<n> ok, <n> skipped, <n> failed`. It skips
`test-run-archive` when `later` is not on PATH, and `test-sub-skill-check`
when no superpowers copy is installed; with one installed,
`test-sub-skill-check` fails unless it is the copy that
`skills/apply/scripts/sub-skill-check` pins. CI
(`.github/workflows/test.yml`) provides both, fails on any skip, and runs
shellcheck 0.11.0, which does not report the two SC2015 notes that 0.9.0
reports.

Installed copies move only when `version` in `.claude-plugin/plugin.json`
changes, so a release is a version bump, which
`claude plugin update sdd@akalongman` then brings to an installed copy.
Never release while an apply run is live: a run keeps working across an
update only while the paths it handed to its controllers still exist.

## Uninstall

```bash
claude plugin uninstall sdd@akalongman
```

Or inside a session: `/plugin uninstall sdd@akalongman`.

## History

The design history is kept in the record repository
(`akalongman/claude-subagent-apply`, private).

## License

MIT, see [LICENSE](LICENSE).
