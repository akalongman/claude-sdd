# sdd phase 1: move the apply skill into the plugin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `sdd` plugin with the private `app-subagent-apply` skill, its prompts, scripts and three agents moved in, behaving exactly as the private copy does, installed from a new `akalongman` marketplace repository, with the record repository absorbed.

**Architecture:** A Claude Code plugin laid out like `claude-laterbox`: `skills/apply/` holds the skill, `agents/` the three definitions under plugin-scoped names, `bin/sdd-checkpoint` the one script a controller runs by bare name, `tests/` the record's five test scripts with plugin defaults, `tools/` and `docs/history/` the record's measurement tools and documents. No module and no hooks ship in this phase unless the agent-name probe fails, in which case a SessionStart hook writes prefixed agent copies into the user's agents directory.

**Tech Stack:** bash 5 with GNU coreutils (the moved scripts), Python 3 (the transcript tools), JSON manifests, the `claude plugin` CLI, GitHub Actions. No TypeScript in this phase.

**Spec:** `docs/superpowers/specs/2026-10-30-sdd-plugin-design.md`, revision 7, sections "Repository and layout" and "Phase 1: move the skill". Constraints and decisions 6, 7, 12, 13, 16, 17, 23 bind here.

**Revision 3 (2026-11-09):** revision 2 followed two external reviews of revision 1; revision 3 moves the retirement of the private copy and the acceptance out of the run, into the section "After the run's archive". The changes are listed under "Self-review notes".

## Global Constraints

- Behaviour unchanged: no rule, step, ledger line or dispatch payload of the skill changes. The only edits are the renames this plan lists and prose tightened for size.
- `skills/apply/SKILL.md` stays under 19,500 characters, measured by `tests/check-skill-size.sh` with `${CLAUDE_PLUGIN_ROOT}` references expanded to a 120-character stand-in path (spec, constraints: the compaction cut falls on substituted text; this phase writes no such reference, so the expansion first bites in phase 2). The nine wording-only cuts of Task 5, measured on the private file on 2026-11-09, leave 19,476. Phase 2 pays for its own pointer with further cuts; this phase keeps no margin beyond the guard.
- The six scripts under `skills/apply/scripts/` and `bin/sdd-checkpoint` are byte-identical to the private copies (`cmp` proves it).
- The dispatch contract does not change: a controller runs `sdd-checkpoint` by its bare name from the plugin's `bin/` (decision 7). The skill's own text never names the checkpoint script; only `prompts/unit-controller-overrides.md` does.
- Plugin agent names: `sdd:implementer`, `sdd:reviewer`, `sdd:unit-controller`; frontmatter `name` without the plugin prefix (components reference: the scoped name is `<plugin>:<frontmatter name>`).
- Dependency: `superpowers@superpowers-marketplace`, unversioned. A version range resolves against `superpowers--v<version>` tags on a repository this plugin does not control, and `scripts/sub-skill-check` already pins the loop's content hash.
- Claude Code 2.1.318 or newer (decision 23); this machine runs 2.1.319.
- The run's branch is settled when `/sdd:apply` is launched (`isolated`, or the current branch ledgered as `Commit mode`), so no task below asks about branching; the commit commands commit on that branch.
- The test scripts keep the record's names (`check-*.sh`, `test-*.sh`) under `tests/`, a deviation from the spec's layout line `tests/*.test.sh`, recorded in `docs/decisions.md` entry 1 together with the probe results.
- Linux, bash 5, GNU coreutils, git; `jq` only where the private scripts already use it (`sub-skill-check`); no new dependency.
- Prose in this repository is agent-neutral except where it is the skill or an agent definition, which are Claude Code components by design. No em or en dashes anywhere. Commit titles imperative, under 72 characters, no trailers, path-limited commits gated on the run's branch.
- Nothing outside this repository is changed without the owner's word in the session: the user's `~/.claude` (the public dotfiles), `~/.claude/CLAUDE.md`, the laterbox repository, the record repository, GitHub, and the local marketplace registration. Each such step below is marked **owner step** and ends the unit as `parked` under hands-off.
- A GitHub `source` entry on the private `akalongman/claude-sdd` repository installs only where git can authenticate to it (SSH on this machine). The README says so.

## Review Focus

1. A `SKILL.md` that passes the size guard as raw bytes but crosses the 20,000-character compaction cut once `${CLAUDE_PLUGIN_ROOT}` is substituted. Test in Task 2 (the size script expands the reference) and Task 5 (the moved file passes with the expansion).
2. A subagent shell whose PATH lacks the plugin's `bin/` (a sandboxed command, a PowerShell tool) so a controller's bare `sdd-checkpoint` fails and the unit pauses with `checkpoint failed`. Test in Task 7 (the probe runs the bare name inside a subagent) with the fallback path written into the agent body if it fails.
3. The agent-name fallback writing a copy whose frontmatter still says `name: implementer`, so a generic `implementer` shadows another agent. Test in Task 7's fallback (the copy's `name:` line is asserted).
4. `claude plugin marketplace remove akalongman` uninstalling laterbox and dropping its enablement (`enabledPlugins` in `~/.claude/settings.json`; the file has no `pluginConfigs` key on this machine) or leaving `later` unlinked. Test in Task 10 (settings diffed before and after, `later` resolved on PATH after the reinstall).
5. `test-run-archive.sh` in CI failing hard for want of `later`, or `test-sub-skill-check.sh` for want of the superpowers copy its pin names (its case 7 asserts the script's own pin, 7.0.1, and `claude plugin install` cannot pin a version), so CI is red for reasons that are not the plugin's. Test in Task 2 (the runner prints `skip <name> (<reason>)` when a prerequisite is missing) and Task 11 (CI provides `later` and a superpowers 7.0.1 checkout, so nothing skips there).

---

### Task 1: Repository skeleton and manifest

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `LICENSE` (MIT, the laterbox text with the same holder)
- Modify: `.gitignore` (exists with one line, `docs/tmp/`, which stays)
- Create: `.gitattributes` (copied from `~/projects/akalongman/claude-laterbox`)
- Create: `README.md` (title, one paragraph, headings `Install`, `Requirements`, `Using it`, `Develop`, `Uninstall`, `History`, `License`, bodies filled in Task 12)

**Interfaces:**
- Produces: the plugin root every later task writes into; plugin name `sdd`, version `0.1.0`.

- [ ] **Step 1: Write the manifest**

```json
{
  "name": "sdd",
  "displayName": "sdd",
  "version": "0.1.0",
  "description": "Implement a superpowers plan or an OpenSpec change through subagents: /sdd:apply drives one unit controller per unit, with implementers and reviewers one layer down, and archives the run.",
  "author": { "name": "Avtandil Kikabidze", "url": "https://github.com/akalongman" },
  "repository": "https://github.com/akalongman/claude-sdd",
  "license": "MIT",
  "dependencies": ["superpowers@superpowers-marketplace"]
}
```

- [ ] **Step 2: Copy the root files**

`.gitignore` keeps its `docs/tmp/` line and gains `.claude-plugin/types/` with laterbox's comment; `.gitattributes` holds `* -text` with laterbox's comment; `LICENSE` is laterbox's MIT text.

- [ ] **Step 3: Validate**

Run: `claude plugin validate . --strict`
Expected: `Validation passed` (a warning fails the run under `--strict`; `CLAUDE.md` must not exist at the root).

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json LICENSE .gitignore .gitattributes README.md && git commit -m "Add the sdd plugin manifest and root files" -- .claude-plugin/plugin.json LICENSE .gitignore .gitattributes README.md
```

### Task 2: Port the record's test scripts with plugin defaults

**Files:**
- Create: `tests/check-skill-size.sh`, `tests/check-pause-text.sh`, `tests/test-run-archive.sh`, `tests/test-sdd-checkpoint.sh`, `tests/test-sub-skill-check.sh` (from `~/projects/personal/claude-subagent-apply/tools/`)
- Create: `tests/run.sh`

**Interfaces:**
- Produces: `bash tests/run.sh` runs the five, prints one `ok <name>`, `FAIL <name>` or `skip <name> (<reason>)` line each plus their own output, ends with `<n> ok, <n> skipped, <n> failed`, exits 1 when any failed. Default paths, resolved from the script's own directory (`$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)` as `$root`): `$root/skills/apply/SKILL.md`, `$root/skills/apply/scripts/run-archive`, `$root/bin/sdd-checkpoint`, `$root/skills/apply/scripts/sub-skill-check`. `check-pause-text.sh` keeps its required argument (`f=${1:?prompt file path}`); the runner passes `$root/skills/apply/SKILL.md` and `$root/skills/apply/prompts/unit-controller-overrides.md` in two calls.

- [ ] **Step 1: Copy the five scripts and change each default**

Each script keeps its positional argument (`FILE`, `SCRIPT`, the prompt file) and its header comment, with the header's "private dotfiles" sentence replaced by "of the sdd plugin" and the default line updated. Two further edits:

- `check-pause-text.sh` line 62, `need 'checkpoint script' 'scripts/sdd-checkpoint'`, becomes `need 'checkpoint script' 'sdd-checkpoint'`: the overrides file names the command by its bare name after Task 4 (decision 7), and the old assertion would fail Task 4 and every later run of the suite.
- `check-skill-size.sh` counts a substituted copy: before counting, replace every `${CLAUDE_PLUGIN_ROOT}` with a 120-character path (`/home/u/.claude/plugins/cache/akalongman/sdd/0.1.0` padded with `x` to 120) and every `${CLAUDE_SKILL_DIR}` with that path plus `/skills/apply`, in a temporary file; the one output line reads `ok <n>/<limit> (substituted)` or `FAIL <n>/<limit> (substituted)`, where `<n>` is the substituted count. The raw count is not printed.

- [ ] **Step 2: Write `tests/run.sh`**

Runs the five with no arguments (so the plugin defaults apply), `check-pause-text.sh` once per file as above, collects exit codes, prints the summary line per script and the totals line, exits 1 if any failed. Before `test-run-archive.sh` it checks `command -v later`, and before `test-sub-skill-check.sh` it checks `bash "$root/skills/apply/scripts/sub-skill-check" --dir` (exit 0 means an installed superpowers copy resolves); a failed check prints `skip <name> (later not on PATH)` or `skip <name> (<the --dir reason, from its stderr>)`, counts as skipped, and does not fail the run.

- [ ] **Step 3: Run to verify it fails**

Run: `bash tests/run.sh`
Expected: every script reports a missing file (`FAIL check-skill-size`, `FAIL test-sdd-checkpoint` and so on), totals `0 ok, 0 skipped, 6 failed`, exit 1.

- [ ] **Step 4: Verify the substitution branch on a fixture**

Run: `printf '%s\n' 'a ${CLAUDE_PLUGIN_ROOT}/x' > /tmp/sz.md && bash tests/check-skill-size.sh /tmp/sz.md 200`
Expected: `ok 125/200 (substituted)` (the reference is 21 characters and becomes 120, so the 26-character file, newline included, measures 125).

- [ ] **Step 5: Verify the skip branch**

Run: `env PATH="$(echo "$PATH" | tr ':' '\n' | /bin/grep -v -F "$(dirname "$(command -v later)")" | paste -sd:)" bash tests/run.sh | /bin/grep '^skip'`
Expected: `skip test-run-archive (later not on PATH)`.

- [ ] **Step 6: shellcheck and commit**

Run: `shellcheck tests/*.sh`
Expected: no output.

```bash
git add tests && git commit -m "Port the record's test scripts with plugin defaults" -- tests
```

### Task 3: Move the scripts and the checkpoint command

**Files:**
- Create: `skills/apply/scripts/openspec-section-brief`, `openspec-section-tick`, `run-archive`, `section-span.awk`, `sub-skill-check`, `task-brief` (byte-identical copies)
- Create: `bin/sdd-checkpoint` (byte-identical copy, executable)

**Interfaces:**
- Produces: `sdd-checkpoint` on the Bash tool's PATH while the plugin is enabled; `scripts/<name>` paths relative to the skill directory, as `SKILL.md` already names them.

- [ ] **Step 1: Copy with `cp -p`**

From `~/.claude/skills/app-subagent-apply/scripts/`; `sdd-checkpoint` goes to `bin/`, the other six to `skills/apply/scripts/`. `run-archive` resolves its skill directory as `scripts/..`, which is `skills/apply/` here, so its `Skill:` facts line keeps working once Task 4 and Task 5 land.

- [ ] **Step 2: Prove the copies identical**

Run: `for f in openspec-section-brief openspec-section-tick run-archive section-span.awk sub-skill-check task-brief; do cmp ~/.claude/skills/app-subagent-apply/scripts/$f skills/apply/scripts/$f || echo "DIFF $f"; done; cmp ~/.claude/skills/app-subagent-apply/scripts/sdd-checkpoint bin/sdd-checkpoint && test -x bin/sdd-checkpoint && echo identical`
Expected: `identical`, no `DIFF` line.

- [ ] **Step 3: Run the three script tests**

Run: `bash tests/test-sdd-checkpoint.sh && bash tests/test-sub-skill-check.sh && bash tests/test-run-archive.sh`
Expected: every case `ok N`, exit 0 for each. (`test-run-archive.sh` needs `later` on PATH; `test-sub-skill-check.sh` needs the installed superpowers plugin. Both hold on this machine.)

- [ ] **Step 4: Commit**

```bash
git add bin skills/apply/scripts && git commit -m "Move the apply scripts and the checkpoint command" -- bin skills/apply/scripts
```

### Task 4: Move the override prompts

**Files:**
- Create: `skills/apply/prompts/final-review-overrides.md`, `implementer-overrides.md`, `re-review-overrides.md`, `reviewer-overrides.md`, `unit-controller-overrides.md`

**Interfaces:**
- Produces: the controller dispatch names `sdd:implementer` and `sdd:reviewer`, and the bare command `sdd-checkpoint`, read by the unit controller from `prompts/unit-controller-overrides.md`.

- [ ] **Step 1: Copy and edit the headings**

Every `## Overrides from app-subagent-apply` becomes `## Overrides from the sdd apply skill` (the unit controller file's heading reads `## Overrides from the sdd apply skill for the unit controller`).

- [ ] **Step 2: The two further edits of `unit-controller-overrides.md`**

Line 26 to 27: `app-sdd-implementer` becomes `sdd:implementer`, `app-sdd-reviewer` becomes `sdd:reviewer`. Line 133: the path `~/.claude/skills/app-subagent-apply/scripts/sdd-checkpoint` becomes the bare `sdd-checkpoint` (the plugin's `bin/` is on the Bash tool's PATH; a subagent's shell has no plugin variables). `implementer-overrides.md` keeps its `~/.claude/rules/git.md` reference: that is the owner's rule file, not the skill's.

- [ ] **Step 3: Verify**

Run: `/bin/grep -rn 'app-subagent-apply\|app-sdd-\|claude/skills' skills/apply/prompts; bash tests/check-pause-text.sh skills/apply/prompts/unit-controller-overrides.md; echo "exit $?"`
Expected: no grep match; no `missing:` or `present:` line; `exit 0` (the guard asserts the bare `sdd-checkpoint` since Task 2).

- [ ] **Step 4: Commit**

```bash
git add skills/apply/prompts && git commit -m "Move the override prompts under the plugin's names" -- skills/apply/prompts
```

### Task 5: Move `SKILL.md` and bring it under the size guard

**Files:**
- Create: `skills/apply/SKILL.md`

**Interfaces:**
- Consumes: the dispatch name `sdd:unit-controller` (Task 6 defines the agent).
- Produces: the skill invoked as `/sdd:apply`, `name: apply` in the frontmatter, every other frontmatter field as today.

- [ ] **Step 1: Copy and make the three edits**

`name: app-subagent-apply` becomes `name: apply`. The three `app-sdd-unit-controller` (lines 9, 38, 42 of the private file) become `sdd:unit-controller`. In line 9, "(definition in `~/.claude/agents/`, the loop preloaded)" becomes "(the loop preloaded)". Nothing else changes in this step.

- [ ] **Step 2: Measure**

Run: `bash tests/check-skill-size.sh skills/apply/SKILL.md`
Expected: `FAIL 19689/19500 (substituted)` (the private file is 19,749 characters; the three edits return 60).

- [ ] **Step 3: Apply the nine wording-only cuts, in order, until the measure passes**

Each cut is a wording change that keeps every rule, ledger line, exit code, tool name and incident date. The savings were measured on the private file on 2026-11-09; the running count after each is in the last column.

| # | Where | From | To | Saves | Count |
|---|---|---|---|---|---|
| 1 | Sources, the `<ws>` paragraph | `` (every change's file is `tasks.md`, so never run `sdd-workspace`; give every sub-skill script this OUTFILE) `` | `` (never run `sdd-workspace`; pass every sub-skill script this OUTFILE) `` | 38 | 19,651 |
| 2 | This machine, item 1 | `` and so is the final phase once `<ws>/final-brief.md` exists and no `Final phase: complete` line is written, its paths being every unit's `` | `` and likewise the final phase once `<ws>/final-brief.md` exists with no `Final phase: complete` line, its paths every unit's `` | 13 | 19,638 |
| 3 | Driver loop, item 3 | `ledger it as this item says, then` | `ledger it, then` | 18 | 19,620 |
| 4 | Hands-off | `` `git push -u <remote> <branch>`, the remote being the branch's own or `origin` when it has none. `` | `` `git push -u <remote> <branch>` to the branch's remote, else `origin`. `` | 26 | 19,594 |
| 5 | Driver loop, item 3 | `(2026-10-13, an orphaned implementer ran beside the retry on the shared tree)` | `(2026-10-13, an orphan ran beside the retry)` | 33 | 19,561 |
| 6 | After the last unit | `(2026-11-05, a plan was reported done with three of its checkpoint notes open)` | `(2026-11-05, reported done with three notes open)` | 29 | 19,532 |
| 7 | OpenSpec, `all_done` | `without one the units are ticked but the final phase is owed (an interrupted run), so go to the final phase below` | `without one the final phase is owed (an interrupted run): go to the final phase below` | 28 | 19,504 |
| 8 | Driver loop, pre-flight | `say that the run will re-read it on every driver turn and that a fresh session avoids it, then continue` | `say that every driver turn re-reads it and a fresh session avoids it, then continue` | 20 | 19,484 |
| 9 | OpenSpec, the after-merge task | `the pre-flight scan flags it and it is amended with the user into a pre-merge task` | `the pre-flight scan flags it; amend it with the user into a pre-merge task` | 8 | 19,476 |

Cut 2 keeps the "no `Final phase: complete` line" condition: without it a completed final phase would be re-dispatched on resume. Stop when the measure prints `ok`; all nine are needed (cut 8 is the first to pass). A tenth cut is not invented in this task: a shortfall after the nine means a measurement differs from the table and is reported, not trimmed around.

- [ ] **Step 4: Run the guards**

Run: `bash tests/check-skill-size.sh skills/apply/SKILL.md && bash tests/check-pause-text.sh skills/apply/SKILL.md && /bin/grep -c 'app-sdd-\|app-subagent-apply\|~/.claude/agents' skills/apply/SKILL.md`
Expected: `ok 19476/19500 (substituted)`, no `missing:` line, grep count `0`.

- [ ] **Step 5: Review the diff for dropped rules**

Run: `diff <(tr -s ' ' '\n' < ~/.claude/skills/app-subagent-apply/SKILL.md) <(tr -s ' ' '\n' < skills/apply/SKILL.md) | /bin/grep '^<' | /bin/grep -v -e app-sdd -e app-subagent -e 'agents/'`
Expected: only words from the nine passages in the table (and nothing from a ledger line or a backticked command). The output is read whole, not capped.

- [ ] **Step 6: Full suite and commit**

Run: `bash tests/run.sh`
Expected: six `ok` lines (`check-pause-text` twice), `6 ok, 0 skipped, 0 failed`, exit 0.

```bash
git add skills/apply/SKILL.md && git commit -m "Move the apply skill as /sdd:apply under the size guard" -- skills/apply/SKILL.md
```

### Task 6: Add the three agents

**Files:**
- Create: `agents/implementer.md`, `agents/reviewer.md`, `agents/unit-controller.md`

**Interfaces:**
- Produces: `sdd:implementer`, `sdd:reviewer`, `sdd:unit-controller`, with `model: opus` on each, `skills: [superpowers:subagent-driven-development]` and `experimental: { cacheTtl: 1h }` on the controller, as the private files have.

- [ ] **Step 1: Copy the three private files and edit**

`name:` drops the `app-sdd-` prefix. `description:` reads "for the sdd plugin's apply skill dispatches only" where it reads "for app-subagent-apply dispatches only". The body's "run by app-subagent-apply" and "for app-subagent-apply" read "run by the sdd plugin's apply skill" and "for the sdd plugin's apply skill". Every other line is unchanged.

- [ ] **Step 2: Verify**

Run: `for a in implementer reviewer unit-controller; do /bin/grep -q "^name: $a$" agents/$a.md || echo "name $a"; done; /bin/grep -rn 'app-sdd\|app-subagent-apply' agents; /bin/grep -c 'cacheTtl: 1h\|superpowers:subagent-driven-development' agents/unit-controller.md; claude plugin validate . --strict`
Expected: no `name` line, no grep match, count `2`, `Validation passed`.

- [ ] **Step 3: Commit**

```bash
git add agents && git commit -m "Add the implementer, reviewer and unit-controller agents" -- agents
```

### Task 7: Settle the unknowns in a throwaway session, and apply the fallbacks

**Files:**
- Create: `docs/decisions.md` (the plugin's own log; entry 1 records this task's results with the date and the Claude Code version)
- Create, only if the name probe fails: `hooks/hooks.json`, `scripts/agents-link.sh`, `tests/test-agents-link.sh`
- Modify, only if the name probe fails: `skills/apply/SKILL.md`, `skills/apply/prompts/unit-controller-overrides.md` (the dispatch names)
- Modify, only if the preload probe fails: `agents/unit-controller.md`
- Modify, only if the bin probe fails: `agents/unit-controller.md`, `skills/apply/prompts/unit-controller-overrides.md`

**Interfaces:**
- Consumes: the agents of Task 6, `bin/sdd-checkpoint` of Task 3.
- Produces: the names the skill and the prompts dispatch (unchanged on a pass; `sdd-implementer`, `sdd-reviewer`, `sdd-unit-controller` on the fallback) and the checkpoint command the overrides name.

- [ ] **Step 1: Start the probe session**

Run, in a scratch directory with a git repository (name it `sdd-probe`): `claude --plugin-dir ~/projects/akalongman/claude-sdd`. The four probes are prompts typed into that session; each result is recorded verbatim in `docs/decisions.md`.

- [ ] **Step 2: Probe the agent name**

Prompt: dispatch a subagent of type `sdd:unit-controller` with the task "reply with the word ready and nothing else". Expected: a reply `ready`. If the dispatch errors on the scoped name, repeat with `unit-controller`. Record which form dispatched.

- [ ] **Step 3: Probe the cross-plugin preload**

Prompt: dispatch `sdd:unit-controller` with "name the first heading of the subagent-driven-development skill you have preloaded; if you have none, say none". Expected: the skill's first heading. `none` means the preload failed.

- [ ] **Step 4: Probe `experimental` and `bin/`**

Prompt: dispatch `sdd:unit-controller` with "run `sdd-checkpoint README.md` in your shell and reply with its one output line". Expected: a line starting `heads sdd-probe <sha7>; tree` (the script prints the repository directory's basename). A `command not found` means `bin/` is not on the subagent's PATH. For `experimental`, read the session's debug log (`claude --debug` on the same probe) for the controller's `cacheTtl`; record honoured, ignored, or not observable.

- [ ] **Step 5: Apply the fallbacks that the probes demand**

Name fallback (**owner step**: the hook writes into `~/.claude/agents`, the public dotfiles, so the owner says yes to shipping it and decides whether yadm ignores or commits the written files): `scripts/agents-link.sh` writes `~/.claude/agents/sdd-implementer.md`, `sdd-reviewer.md`, `sdd-unit-controller.md` from `agents/*.md`, rewriting the `name:` line to the file's prefixed name and putting `<!-- written by the sdd plugin; do not edit -->` as the first body line; it rewrites only a file that carries that comment, prints a notice to stderr for a foreign file, and takes the agents directory from `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agents`. `hooks/hooks.json` runs it at `SessionStart` with matcher `startup|resume|clear|compact|fork` (a resumed or cleared session must find the copies too), `"command": "bash \"${CLAUDE_PLUGIN_ROOT}/scripts/agents-link.sh\""`, timeout 10. `SKILL.md` and `unit-controller-overrides.md` then dispatch the prefixed names (`sdd-unit-controller` is three characters longer than `sdd:unit-controller`, so `SKILL.md` measures 19,485, still under the guard). `tests/test-agents-link.sh` runs the script against a temporary `CLAUDE_CONFIG_DIR`, asserts the three files exist with `name: sdd-implementer` (and the other two) on line 2 and the marker comment, then plants a foreign `sdd-reviewer.md` and asserts it is untouched and a notice is printed.

Preload fallback: `agents/unit-controller.md` drops `skills:` and its body opens with "Invoke the superpowers subagent-driven-development skill before anything else." Its test, as the spec requires, is a controller run without the preload that produces the loop's ledger lines: in the probe session, one unit of the scratch change of the section "After the run's archive" dispatched through `/sdd:apply <change> step`, stopped at the first continue-or-stop prompt, with `<ws>/progress.md` holding the unit's `handed to controller` line, the controller's review and gate lines and its `complete` line. The Step 3 probe repeated (the controller names the heading) is the quick check before it.

`bin/` fallback: `agents/unit-controller.md` gains the line "The checkpoint command is `${CLAUDE_PLUGIN_ROOT}/bin/sdd-checkpoint`." (substituted in agent bodies) and `unit-controller-overrides.md` says "the checkpoint command the agent definition names" in place of the bare name.

- [ ] **Step 6: Record and commit**

Run: `bash tests/run.sh && claude plugin validate . --strict` (and `bash tests/test-agents-link.sh` when it exists).
Expected: all `ok`, `Validation passed`.

```bash
git add docs/decisions.md && git commit -m "Record the plugin probes of the agent names, preload and bin" -- docs/decisions.md
```

(A second commit for the fallback files when any were written, titled after the fallback.)

### Task 8: Port the record's tools and the green harness

**Files:**
- Create: `tools/README.md`, `tools/transcript-agents.py`, `transcript-clock.py`, `transcript-floors.py`, `transcript-roles.py`, `transcript-tokens.py`, `transcript-window.py`, `tools/green/` (whole directory)
- Create: `tests/test-tools.sh`

**Interfaces:**
- Produces: tools that classify `app-sdd-<role>`, `sdd:<role>` and `sdd-<role>` alike, and a skill name match on `app-subagent-apply` or `sdd:apply`.

- [ ] **Step 1: Write the failing test**

`tests/test-tools.sh` builds a temporary transcript directory in the layout `tools/README.md` describes: `<dir>/<session>.jsonl` with one assistant line whose `message.usage` fields are all 1, and under `<dir>/<session>/subagents/` three pairs `agent-<id>.jsonl` plus `agent-<id>.meta.json`, the sidecar carrying `{"agentType": "<type>", "description": "unit"}` with the types `app-sdd-unit-controller`, `sdd:unit-controller` and `sdd-unit-controller`, each transcript holding one user line whose text is `You run one unit`. It runs `python3 -I tools/transcript-roles.py <dir>/<session>.jsonl` and asserts the output names `unit-controller` three times and never `other` (the tools' fallback role); then `python3 -I tools/transcript-clock.py --skill sdd:apply <dir>/<session>.jsonl` exits 0.

- [ ] **Step 2: Run to verify it fails**

Run: `bash tests/test-tools.sh`
Expected: `FAIL` (the tools are not there yet).

- [ ] **Step 3: Copy the tools and widen the names**

Copy `tools/` from the record, `tools/green/` whole. Then:

- `transcript-roles.py`: `role_of(head)` (line 12) and `role_of_meta(path, head)` (line 24) already exist; add `strip_prefix(agent_type)` returning the name after whichever of `app-sdd-`, `sdd:` or `sdd-` it starts with (else the name unchanged), and make `role_of_meta`'s three `t ==` tests compare `strip_prefix(t)` with `unit-controller`, `implementer` and `reviewer`. The head test in `role_of` gains `or 'sdd:unit-controller' in h or 'sdd-unit-controller' in h`.
- `transcript-clock.py`: line 62 becomes `SKILLS = {"app-subagent-apply", "sdd:apply"}`, `--skill` adds its value to the set, line 173 tests membership; `role_of(agent_type, head)` (line 213) and the `st.startswith("app-sdd-")` test (line 176) and the `.replace("app-sdd-", "")` on line 265 use the same `strip_prefix` logic, copied into this file (the tools are standalone scripts and import nothing from each other).
- `transcript-tokens.py` line 42: `if 'app-subagent-apply' in s or 'sdd:apply' in s:`.
- `tools/green/2026-09-25-unit-controller-workflow.js`, the live harness: lines 6, 8 and 9 default to `~/projects/akalongman/claude-sdd/skills/apply/SKILL.md`, `.../skills/apply/prompts/unit-controller-overrides.md` and `.../agents/unit-controller.md` (absolute paths under `/home/longman`, as today), line 13 to `~/projects/akalongman/claude-sdd/tools/green/fixtures`, line 96's `app-sdd-unit-controller` to `sdd:unit-controller`. The file keeps its style (two-space indentation, no semicolons): a defaults-only edit does not reformat a historical file.
- `tools/green/claude-code-workflow.js` moves unchanged. It is the 2026-09-21 harness; its paths (a review directory under `~/.claude/reviews`, a superpowers 6.3.0 copy, a fork clone) no longer exist, and `tools/green/README.md` gains one sentence saying it is kept as a record and is not runnable.
- `tools/green/tick-script-check.sh` lines 9 and 12 default to `$HOME/projects/akalongman/claude-sdd/skills/apply/scripts`.
- `tools/README.md` names both the old and the new agent names in one sentence where it explains the roles (line 100 onwards), and `sdd:apply` beside `app-subagent-apply` where it names the skill (lines 48 and 242).

- [ ] **Step 4: Run to verify it passes**

Run: `bash tests/test-tools.sh && bash tools/green/tick-script-check.sh`
Expected: `ok` lines, exit 0 for both.

- [ ] **Step 5: Add the test to the runner and commit**

`tests/run.sh` gains `test-tools.sh` (no prerequisite check).

```bash
git add tools tests/test-tools.sh tests/run.sh && git commit -m "Port the transcript tools to accept both agent name forms" -- tools tests/test-tools.sh tests/run.sh
```

### Task 9: Absorb the record's documents

**Files:**
- Create: `docs/history/README.md` (the record's `README.md`), `docs/history/CLAUDE.md` (the record's instruction file, kept as history), `docs/history/decisions.md`, `findings.md`, `lessons.md`, `measurements.md`, `skill.md`, `upstream.md`, `docs/history/specs/*` and `docs/history/plans/*` (from the record's `docs/superpowers/`), `docs/history/reviews/*` (every file under the record's `reviews/`, the five untracked ones included), `docs/history/upstream/*` only by the owner's word. The record's `.superpowers/sdd/` is a run workspace, not history, and does not move.
- Create: `docs/history/INDEX.md` (one line per file: what it is, its date)

**Interfaces:**
- Produces: the history in one place, with a closing entry in `docs/history/decisions.md`.

- [ ] **Step 1: owner step: the record's unpushed state**

The record has six commits ahead of `origin/main` and six dirty entries. Ask the owner whether to commit the five untracked review files there and push, or to carry them over uncommitted; and whether `upstream/` (a working-tree patch and two pull-request bodies) moves to `docs/history/upstream/` or is dropped. Then the parked notes: the record's `LATER.local.md` holds four open notes (the unit-controller measurement on a client project, the two upstream pull requests, the S17 green check, the `run-archive` exit under a missing config directory), and the file is gitignored (`*.local.md`), so no clean-tree gate in the section "After the run's archive" sees it. Read the four with the owner; each is re-parked in this repository (`later -- '<note text verbatim>'` from `~/projects/akalongman/claude-sdd`) or closed by the owner's word, and the outcome per note goes into the closing entry of Step 2. Under hands-off this unit returns `parked (owner: record repository state)`.

- [ ] **Step 2: Copy with `cp -rp`, then write the closing entry**

The closing entry in `docs/history/decisions.md`, numbered after the last, dated, reads: the skill moved into the `sdd` plugin at `akalongman/claude-sdd` on this date; the tools, tests and documents moved with it; this log is closed and the plugin's own log is `docs/decisions.md`.

- [ ] **Step 3: Verify completeness**

Run: `cd ~/projects/personal/claude-subagent-apply && for f in $(git ls-files docs reviews README.md CLAUDE.md; git ls-files --others --exclude-standard reviews); do b=$(basename "$f"); [ -n "$(find ~/projects/akalongman/claude-sdd/docs/history -name "$b" -print -quit)" ] || echo "missing $f"; done`
Expected: no `missing` line (two record files share no basename, so a name found is the file moved; the command is recorded in `docs/history/INDEX.md`).

- [ ] **Step 4: Commit**

```bash
git add docs/history && git commit -m "Absorb the record repository's documents as history" -- docs/history
```

### Task 10: The `akalongman` marketplace repository

**Files:**
- Create, in a new repository `~/projects/akalongman/claude-plugins`: `.claude-plugin/marketplace.json`, `README.md`, `LICENSE`
- Modify, in `~/projects/akalongman/claude-laterbox`: delete `.claude-plugin/marketplace.json`, edit `README.md` (`Install` section's `marketplace add` line)

**Interfaces:**
- Produces: `laterbox@akalongman` and `sdd@akalongman` installable from GitHub sources; the local `akalongman` registration pointing at the new repository.

- [ ] **Step 1: owner step: the repository**

The GitHub name `akalongman/claude-plugins` currently redirects to `claude-laterbox` from a past rename; creating it retakes the name. Ask the owner for the go-ahead, then `gh repo create akalongman/claude-plugins --public --description "Marketplace of Avtandil Kikabidze's Claude Code plugins"` and protect `main` before the first push (rules/git.md). Under hands-off: `parked (owner: GitHub repository)`.

- [ ] **Step 2: Write the marketplace file**

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "akalongman",
  "description": "Project-agnostic Claude Code plugins maintained by Avtandil Kikabidze.",
  "owner": { "name": "Avtandil Kikabidze", "url": "https://github.com/akalongman" },
  "allowCrossMarketplaceDependenciesOn": ["superpowers-marketplace"],
  "plugins": [
    { "name": "laterbox", "source": { "source": "github", "repo": "akalongman/claude-laterbox" }, "description": "<laterbox's current description>", "category": "productivity" },
    { "name": "sdd", "source": { "source": "github", "repo": "akalongman/claude-sdd" }, "description": "<the sdd manifest's description>", "category": "development" }
  ]
}
```

Run: `claude plugin validate ~/projects/akalongman/claude-plugins --strict` (a marketplace directory validates too).
Expected: `Validation passed`.

- [ ] **Step 3: owner step: push both repositories first**

`claude plugin marketplace add` clones the marketplace repository from GitHub, and a `github` source installs by cloning the plugin's repository, so neither works before the pushes. Commit the marketplace repository:

```bash
cd ~/projects/akalongman/claude-plugins && git add .claude-plugin/marketplace.json README.md LICENSE && git commit -m "List laterbox and sdd by GitHub source" -- .claude-plugin/marketplace.json README.md LICENSE
```

Then, by the owner's word, push it, and push this repository's `main` (several commits ahead of `origin/main`; `git log origin/main..main` is shown first, since a push publishes them all). Under hands-off: `parked (owner: push)`.

- [ ] **Step 4: owner step: the laterbox repository**

Delete its `.claude-plugin/marketplace.json`, change both `claude plugin marketplace add akalongman/claude-laterbox` lines of its README (the shell form at line 120 and the in-session `/plugin marketplace add` form at line 127) to `akalongman/claude-plugins`, commit on its `main` by the owner's word, path-limited, and leave the push to the owner. The old registration keeps working until the push, since it points at the local directory.

- [ ] **Step 5: owner step: move the local registration**

Before: `cp ~/.claude/settings.json /tmp/settings.before.json; claude plugin list > /tmp/plugins.before.txt`. Then, with the owner's word: `claude plugin marketplace remove akalongman && claude plugin marketplace add akalongman/claude-plugins && claude plugin install laterbox@akalongman && claude plugin install sdd@akalongman` (removing the marketplace uninstalls laterbox, hence the reinstall). After: `diff <(jq -S .enabledPlugins /tmp/settings.before.json) <(jq -S .enabledPlugins ~/.claude/settings.json)` prints one added line, `"sdd@akalongman": true`, and nothing else; `claude plugin list` shows both plugins with a commit-pinned version; a new session's start line shows laterbox's count and `command -v later` resolves. If the `sdd` install fails on authentication (the repository is private), the marketplace entry's source becomes `{ "source": "git", "url": "git@github.com:akalongman/claude-sdd.git" }`, pushed and re-added. Record the before and after, and the source form that worked, in `docs/decisions.md` entry 2.

### Task 11: CI

**Files:**
- Create: `.github/workflows/test.yml`

**Interfaces:**
- Produces: a Linux job on push and pull request to `main`.

- [ ] **Step 1: Write the workflow**

Modelled on laterbox's: `actions/checkout@v5`, `actions/setup-node@v4` with Node 24, `npm install -g @anthropic-ai/claude-code@2.1.319`, `claude --version`, `claude plugin validate . --strict`, then the two prerequisites the suite needs:

- `later`: `git clone --depth 1 https://github.com/akalongman/claude-laterbox "$RUNNER_TEMP/laterbox"` and `echo "$RUNNER_TEMP/laterbox/scripts" >> "$GITHUB_PATH"`.
- superpowers at the verified release, not the current one: `test-sub-skill-check.sh` case 7 asserts that the installed copy's loop hashes to the script's pin (7.0.1, `49e0f5325d56`), and `claude plugin install` has no version flag (checked 2026-11-09: `--marketplace`, `--config`, `--json` only), so the job builds the layout the script reads instead: `git clone --depth 1 --branch v7.0.1 https://github.com/obra/superpowers "$HOME/.claude/plugins/cache/superpowers-marketplace/superpowers/7.0.1"` (tag `v7.0.1` is commit `2ce8aa15`, the `gitCommitSha` of the installed copy on this machine) and a `$HOME/.claude/plugins/installed_plugins.json` written with `jq -n` as `{"version": 2, "plugins": {"superpowers@superpowers-marketplace": [{"scope": "user", "installPath": "<that path>", "version": "7.0.1"}]}}`. When the pin moves, this line moves with it, in the same commit.

Then `bash tests/run.sh` and `shellcheck bin/sdd-checkpoint skills/apply/scripts/openspec-section-brief skills/apply/scripts/openspec-section-tick skills/apply/scripts/run-archive skills/apply/scripts/sub-skill-check skills/apply/scripts/task-brief tests/*.sh` (the six bash scripts by name; `section-span.awk` is not shell). Timeout 15 minutes.

- [ ] **Step 2: Run the same steps locally in a clean PATH**

Run: `env -i HOME="$HOME" PATH=/usr/bin:/bin:"$HOME/.local/bin" bash tests/run.sh`
Expected: all `ok`.

- [ ] **Step 3: Commit, and push by the owner's word; watch the run**

```bash
git add .github/workflows/test.yml && git commit -m "Run the plugin's tests on push and pull request" -- .github/workflows/test.yml
```

After the owner's push: `gh run watch` on the run for `git rev-parse HEAD` (the full SHA; a short one matches nothing). The job's totals line must read `0 skipped`: a `skip` in CI means a prerequisite step broke and is fixed there, never by removing or skipping a test.

### Task 12: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Fill the sections**

`Install`: the two commands `claude plugin marketplace add akalongman/claude-plugins` and `claude plugin install sdd@akalongman`, the in-session forms, and the note that `claude-sdd` is private so the install needs git access to it. `Requirements`: Claude Code 2.1.318 or newer; the superpowers plugin (installed as a dependency); Linux, bash 5, GNU coreutils, git until phase 3; the owner's `~/.claude/rules/git.md` cited by the implementer overrides; model aliases as the account offers them; laterbox recommended, and a `later` missing from PATH shows as `not parked` lines in the run report, never as an error. `Using it`: `/sdd:apply <source> [step|hands-off] [isolated] [tier=<alias>]`, one paragraph per option, the workspace and archive paths, the three agents by name. `Develop`: `claude --plugin-dir .`, `claude plugin validate . --strict`, `bash tests/run.sh`, `shellcheck ...`, the release rule (a version bump reaches installed copies, never during a live run). `Uninstall`: `claude plugin uninstall sdd@akalongman`, and the fallback copies under `~/.claude/agents/sdd-*.md` to delete by hand when Task 7's fallback shipped. `History`: one line pointing at `docs/history/INDEX.md`. `License`: MIT, one line.

- [ ] **Step 2: Verify and commit**

Run: `/bin/grep -nP '[\x{2014}\x{2013}]' README.md; /bin/grep -c 'AskUserQuestion\|TodoWrite\|subagent_type' README.md`
Expected: no dash match, count `0`.

```bash
git add README.md && git commit -m "Write the README" -- README.md
```

---

## After the run's archive: retire the private copy and run the acceptance

This section is not a task of the run. The run is driven by the private `app-subagent-apply` skill: its final-phase dispatch reads `prompts/unit-controller-overrides.md` and `~/.claude/agents/app-sdd-unit-controller.md` by path, and `scripts/run-archive` runs from the private directory afterwards, so removing them before the archive would break the run that is building their replacement. The steps below are done after the archive path is printed, in a session that loads the plugin (installed in Task 10) and no longer the private skill. They are owner steps throughout, with me executing on the owner's word.


**Files:**
- Modify (owner, public dotfiles): remove `~/.claude/skills/app-subagent-apply/` and `~/.claude/agents/app-sdd-*.md`; edit `~/.claude/CLAUDE.md` line 22
- Modify: `docs/decisions.md` (entry 3: the acceptance run)

- [ ] **Step 1: owner step: remove the private copy**

With the plugin installed from the marketplace (Task 10) and the owner's word: `yadm rm -r ~/.claude/skills/app-subagent-apply ~/.claude/agents/app-sdd-implementer.md ~/.claude/agents/app-sdd-reviewer.md ~/.claude/agents/app-sdd-unit-controller.md`, then the untracked `2026-09-19-2211-app-subagent-apply-findings.local.md` is kept or dropped by the owner's word (the spec says it does not move; the directory it sits in goes). One yadm commit, by the owner's word. The other profiles follow through their symlinks.

- [ ] **Step 2: owner step: the working agreement**

Propose the edit of `~/.claude/CLAUDE.md` line 22: "goes through `app-subagent-apply`" becomes "goes through `/sdd:apply`". Apply only on the owner's yes.

- [ ] **Step 3: Verify the old names are gone**

Run: `/bin/grep -rln 'app-subagent-apply\|app-sdd-' ~/.claude --include='*.md' --include='*.json' --include='*.sh' --exclude-dir=plugins --exclude-dir=memory --exclude-dir=projects --exclude-dir=tmp 2>/dev/null; cd ~/projects/akalongman/claude-sdd && /bin/grep -rln 'app-subagent-apply\|app-sdd-' . --exclude-dir=.git --exclude-dir=history --exclude-dir=tools`
The `plugins` exclusion matters: the installed plugin's own `docs/history` and `tools` under `~/.claude/plugins/cache/akalongman/sdd/` carry the old names by design.
Expected: no path from either command.

- [ ] **Step 4: The acceptance run**

Create `~/projects/scratch/sdd-acceptance` (a git repository with one commit and a `composer.json`-free, test-free layout: three text files), `openspec init` there and one change with two `## N.` sections of one item each that edit those files. The spec's acceptance 2 names two loading legs, so the run below happens twice, first in a session started with `claude --plugin-dir ~/projects/akalongman/claude-sdd` and then in a plain session with the installed plugin, on a fresh copy of the change each time (`git checkout -- . && git clean -fd` between them, and `<ws>` removed). Start the session and run `/sdd:apply <change>`; after the first unit's `complete`, type `pause`, let the second unit's controller return `paused`, then `continue`; let the final phase and `run-archive` run. Then, in a second session, `/sdd:apply <change> step` on a change whose first section is ticked, to exercise the resume filter's re-dispatch. Then `/sdd:apply` with no argument in a session that has discussed the change, and `/sdd:apply <change> hands-off tier=sonnet isolated` parsed and announced (stopped before dispatch is fine). Last, the `later`-off-PATH archive: copy the run's `<ws>` to a scratch path, strip `later`'s directory from PATH as Task 2 Step 5 does, run `bash ~/projects/akalongman/claude-sdd/skills/apply/scripts/run-archive <copy>`, and expect one `not parked` line per `Handed to` item, exit 0 and the archive path last.

Expected, checked in `<ws>/progress.md` and the archive, on both legs alike: `Run base:`, `Commit mode:`, `Model policy:`, `Section 1: handed to controller`, `Section 1: complete`, `Section 2: controller returned paused (<point>; heads sdd-acceptance <sha7>; tree <...>)` (the checkpoint line from the controller's bare `sdd-checkpoint`), `Section 2: pause released`, `Final phase: complete <sha7>`, the `Handed to` lines parked (`later` on PATH), the archive's `Skill:` facts line with two 12-hex hashes, and the archive path printed last. The dispatch payload (paths only, the overrides path, the tick command, no inline design) is read from the transcript's first Agent dispatch and compared with one from a run before the move (`docs/history/measurements.md` quotes one).

- [ ] **Step 5: Record, and the record repository**

`docs/decisions.md` entry 3: the acceptance's session ids, what passed, anything that differed. Then, by the owner's word: `gh repo archive akalongman/claude-subagent-apply -y` and `rm -rf ~/projects/personal/claude-subagent-apply`, only after `git -C ~/projects/personal/claude-subagent-apply status --short` is empty, `git log origin/main..main` there is empty, and Task 9 Step 1 has settled the four parked notes (the gitignored `LATER.local.md` is invisible to both gates).

```bash
git add docs/decisions.md && git commit -m "Record the phase 1 acceptance run" -- docs/decisions.md
```

---

## Self-review notes

Spec coverage: layout (Tasks 1, 3 to 6, 8, 9), the edits list (4, 5, 6), the fallback (7), outside-repository changes (10, the section after the run), the record repository (9, that section), acceptance 1 (7), 2 and 3 (that section), marketplace (10), dev loop and prerequisites (12), decisions 6, 7, 12, 13, 16, 17, 23 (1, 3, 7, the section after the run, 10, 9 and that section, 1). The spec's phase 1 bullet says the driver's own checkpoint call becomes the bare name and acceptance 2 says "from a controller and from the driver"; the skill text never names the script, only the controller's overrides do, and the spec is corrected to say so with this plan.

Not in this plan, on purpose: `hooks/register.tsx`, `scripts/away`, `userConfig`, the `types` key and the `.claude-plugin/types/` directory, all phase 2.

Revision 2 (2026-11-09), after reviews of revision 1 by DeepSeek V4 Pro and Qwen 3.8 Max through OpenCode, every claim checked against the files: the ported `check-pause-text.sh` asserted `scripts/sdd-checkpoint`, which Task 4's bare name would fail (Task 2); the size budget was short (the four candidates left 19,595 and the second dropped the `Final phase: complete` condition), so Task 5 carries nine measured cuts ending at 19,476 and the 19,300 target is gone; the runner has skip logic and `check-pause-text.sh` keeps its required argument (Task 2); Task 7 names the two prompt files the name fallback edits, the wider SessionStart matcher, the owner step the fallback is, and the preload fallback's ledger-line test; Task 8's fixture uses the `agent-*.meta.json` sidecar and the `other` fallback, extends the two existing `role_of` functions, widens the skill match, fixes line 13's fixtures path and keeps the 2026-09-21 harness as a record; Task 9 migrates the four parked notes and the record's `CLAUDE.md`; Task 10 pushes before it installs and diffs `enabledPlugins`; Task 11 clones superpowers at `v7.0.1` for case 7's pin and names the six shell scripts to shellcheck; the retirement steps exclude the plugin cache from the old-name grep, runs the acceptance on both loading legs, adds the `later`-off-PATH archive and the `Skill:` hash check; `.gitignore` is modified, not replaced, and the README headings agree between Tasks 1 and 12. Two review points were not taken: the dependency string form is documented, and the branch is settled at launch (now a Global Constraint).

Revision 3 (2026-11-09): the former Task 13 is the section "After the run's archive", outside the run, because the run itself depends on the private copy it would have removed (the final-phase dispatch and `run-archive` read it by path). Its steps are unchanged.
