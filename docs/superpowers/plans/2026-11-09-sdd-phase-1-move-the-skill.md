# sdd phase 1: move the apply skill into the plugin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `sdd` plugin with the private `app-subagent-apply` skill, its prompts, scripts and three agents moved in, behaving exactly as the private copy does, installed from a new `akalongman` marketplace repository, with the record repository absorbed.

**Architecture:** A Claude Code plugin laid out like `claude-laterbox`: `skills/apply/` holds the skill, `agents/` the three definitions under plugin-scoped names, `bin/sdd-checkpoint` the one script a controller runs by bare name, `tests/` the record's five test scripts with plugin defaults, `tools/` and `docs/history/` the record's measurement tools and documents. No module and no hooks ship in this phase unless the agent-name probe fails, in which case a SessionStart hook writes prefixed agent copies into the user's agents directory.

**Tech Stack:** bash 5 with GNU coreutils (the moved scripts), Python 3 (the transcript tools), JSON manifests, the `claude plugin` CLI, GitHub Actions. No TypeScript in this phase.

**Spec:** `docs/superpowers/specs/2026-10-30-sdd-plugin-design.md`, revision 7, sections "Repository and layout" and "Phase 1: move the skill". Constraints and decisions 6, 7, 12, 13, 16, 17, 23 bind here.

## Global Constraints

- Behaviour unchanged: no rule, step, ledger line or dispatch payload of the skill changes. The only edits are the renames this plan lists and prose tightened for size.
- `skills/apply/SKILL.md` stays under 19,500 characters, measured by `tests/check-skill-size.sh` with `${CLAUDE_PLUGIN_ROOT}` references expanded to a 120-character stand-in path (spec, constraints: the compaction cut falls on substituted text). Target 19,300 so phase 2's pointer fits.
- The six scripts under `skills/apply/scripts/` and `bin/sdd-checkpoint` are byte-identical to the private copies (`cmp` proves it).
- The dispatch contract does not change: a controller runs `sdd-checkpoint` by its bare name from the plugin's `bin/` (decision 7). The skill's own text never names the checkpoint script; only `prompts/unit-controller-overrides.md` does.
- Plugin agent names: `sdd:implementer`, `sdd:reviewer`, `sdd:unit-controller`; frontmatter `name` without the plugin prefix (components reference: the scoped name is `<plugin>:<frontmatter name>`).
- Dependency: `superpowers@superpowers-marketplace`, unversioned. A version range resolves against `superpowers--v<version>` tags on a repository this plugin does not control, and `scripts/sub-skill-check` already pins the loop's content hash.
- Claude Code 2.1.318 or newer (decision 23); this machine runs 2.1.319.
- Linux, bash 5, GNU coreutils, git; `jq` only where the private scripts already use it (`sub-skill-check`); no new dependency.
- Prose in this repository is agent-neutral except where it is the skill or an agent definition, which are Claude Code components by design. No em or en dashes anywhere. Commit titles imperative, under 72 characters, no trailers, path-limited commits gated on the run's branch.
- Nothing outside this repository is changed without the owner's word in the session: the user's `~/.claude` (the public dotfiles), `~/.claude/CLAUDE.md`, the laterbox repository, the record repository, GitHub, and the local marketplace registration. Each such step below is marked **owner step** and ends the unit as `parked` under hands-off.
- A GitHub `source` entry on the private `akalongman/claude-sdd` repository installs only where git can authenticate to it (SSH on this machine). The README says so.

## Review Focus

1. A `SKILL.md` that passes the size guard as raw bytes but crosses the 20,000-character compaction cut once `${CLAUDE_PLUGIN_ROOT}` is substituted. Test in Task 2 (the size script expands the reference) and Task 5 (the moved file passes with the expansion).
2. A subagent shell whose PATH lacks the plugin's `bin/` (a sandboxed command, a PowerShell tool) so a controller's bare `sdd-checkpoint` fails and the unit pauses with `checkpoint failed`. Test in Task 7 (the probe runs the bare name inside a subagent) with the fallback path written into the agent body if it fails.
3. The agent-name fallback writing a copy whose frontmatter still says `name: implementer`, so a generic `implementer` shadows another agent. Test in Task 7's fallback (the copy's `name:` line is asserted).
4. `claude plugin marketplace remove akalongman` uninstalling laterbox and dropping its settings (`pluginConfigs`) or leaving `later` unlinked. Test in Task 10 (settings diffed before and after, `later` resolved on PATH after the reinstall).
5. `test-run-archive.sh` in CI failing hard for want of `later`, or `test-sub-skill-check.sh` for want of an installed superpowers, so CI is red for reasons that are not the plugin's. Test in Task 11 (CI installs both; a skipped case prints its reason and is counted).

---

### Task 1: Repository skeleton and manifest

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `LICENSE` (MIT, the laterbox text with the same holder)
- Create: `.gitignore`, `.gitattributes` (copied from `~/projects/akalongman/claude-laterbox`)
- Create: `README.md` (title, one paragraph, headings `Install`, `Requirements`, `Develop`, `Uninstall`, `License`, bodies filled in Task 12)

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

`.gitignore` holds `.claude-plugin/types/` with laterbox's comment; `.gitattributes` holds `* -text` with laterbox's comment; `LICENSE` is laterbox's MIT text.

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
- Produces: `bash tests/run.sh` runs the five, prints one `ok <name>` or `FAIL <name>` line each plus their own output, exits 1 on any failure. Default paths, resolved from the script's own directory (`$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)` as `$root`): `$root/skills/apply/SKILL.md`, `$root/skills/apply/prompts/unit-controller-overrides.md`, `$root/skills/apply/scripts/run-archive`, `$root/bin/sdd-checkpoint`, `$root/skills/apply/scripts/sub-skill-check`.

- [ ] **Step 1: Copy the five scripts and change each default**

Each script keeps its positional argument (`FILE`, `SCRIPT`, the prompt file) and its header comment, with the header's "private dotfiles" sentence replaced by "of the sdd plugin" and the default line updated. `check-skill-size.sh` gains a second measure: before counting, replace every `${CLAUDE_PLUGIN_ROOT}` with a 120-character path (`/home/u/.claude/plugins/cache/akalongman/sdd/0.1.0` padded with `x` to 120) and every `${CLAUDE_SKILL_DIR}` with that path plus `/skills/apply`; it prints `ok <n>/<limit> (substituted)`.

- [ ] **Step 2: Write `tests/run.sh`**

Runs the five with no arguments (so the plugin defaults apply), `check-pause-text.sh` once for `SKILL.md` and once for `prompts/unit-controller-overrides.md` (the record runs it on both), collects exit codes, prints the summary line per script, exits 1 if any failed.

- [ ] **Step 3: Run to verify it fails**

Run: `bash tests/run.sh`
Expected: every script reports a missing file (`FAIL check-skill-size`, `FAIL test-sdd-checkpoint` and so on), exit 1.

- [ ] **Step 4: Verify the substitution branch on a fixture**

Run: `printf '%s\n' 'a ${CLAUDE_PLUGIN_ROOT}/x' > /tmp/sz.md && bash tests/check-skill-size.sh /tmp/sz.md 200`
Expected: `ok 125/200 (substituted)` (the reference is 21 characters and becomes 120, so the 26-character file, newline included, measures 125).

- [ ] **Step 5: shellcheck and commit**

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
Expected: no grep match; no `missing:` or `present:` line; `exit 0`.

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

Run: `bash tests/check-skill-size.sh skills/apply/SKILL.md 19300`
Expected: `FAIL 196xx/19300 (substituted)`; the exact count is the budget line for the next step. (The private file is 19,749 characters; the renames return 62.)

- [ ] **Step 3: Tighten prose until the measure passes, dropping no rule**

Candidates, in this order, each a wording change only: the OpenSpec paragraph's parenthetical "(every change's file is `tasks.md`, so never run `sdd-workspace`; give every sub-skill script this OUTFILE)" shortened to "(never run `sdd-workspace`; pass every sub-skill script this OUTFILE)"; the "Resume" item's second sentence about the incomplete attempt, which states the same condition twice (for a unit and for the final phase) and can state it once with "and likewise the final phase once `<ws>/final-brief.md` exists"; the driver loop item 3's duplicated phrase "ledger it as this item says, then" which can read "ledger it, then"; the Hands-off paragraph's "the remote being the branch's own or `origin` when it has none" which can read "to the branch's remote, else `origin`". Incident dates, ledger lines, exit codes, tool names and every rule stay. Stop when the measure prints `ok`.

- [ ] **Step 4: Run the guards**

Run: `bash tests/check-skill-size.sh skills/apply/SKILL.md 19300 && bash tests/check-pause-text.sh skills/apply/SKILL.md && /bin/grep -c 'app-sdd-\|app-subagent-apply\|~/.claude/agents' skills/apply/SKILL.md`
Expected: `ok <n>/19300 (substituted)`, no `missing:` line, grep count `0`.

- [ ] **Step 5: Review the diff for dropped rules**

Run: `diff <(tr -s ' ' '\n' < ~/.claude/skills/app-subagent-apply/SKILL.md) <(tr -s ' ' '\n' < skills/apply/SKILL.md) | /bin/grep '^<' | /bin/grep -v -e app-sdd -e app-subagent -e 'agents/' | head -60`
Expected: only words from the four candidate passages above (and nothing from a ledger line or a backticked command).

- [ ] **Step 6: Full suite and commit**

Run: `bash tests/run.sh`
Expected: five `ok` lines, exit 0.

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
- Modify, only if the preload probe fails: `agents/unit-controller.md`
- Modify, only if the bin probe fails: `agents/unit-controller.md`, `skills/apply/prompts/unit-controller-overrides.md`

**Interfaces:**
- Consumes: the agents of Task 6, `bin/sdd-checkpoint` of Task 3.
- Produces: the names the skill and the prompts dispatch (unchanged on a pass; `sdd-implementer`, `sdd-reviewer`, `sdd-unit-controller` on the fallback) and the checkpoint command the overrides name.

- [ ] **Step 1: Start the probe session**

Run, in a scratch directory with a git repository: `claude --plugin-dir ~/projects/akalongman/claude-sdd`. The four probes are prompts typed into that session; each result is recorded verbatim in `docs/decisions.md`.

- [ ] **Step 2: Probe the agent name**

Prompt: dispatch a subagent of type `sdd:unit-controller` with the task "reply with the word ready and nothing else". Expected: a reply `ready`. If the dispatch errors on the scoped name, repeat with `unit-controller`. Record which form dispatched.

- [ ] **Step 3: Probe the cross-plugin preload**

Prompt: dispatch `sdd:unit-controller` with "name the first heading of the subagent-driven-development skill you have preloaded; if you have none, say none". Expected: the skill's first heading. `none` means the preload failed.

- [ ] **Step 4: Probe `experimental` and `bin/`**

Prompt: dispatch `sdd:unit-controller` with "run `sdd-checkpoint README.md` in your shell and reply with its one output line". Expected: a line starting `heads sdd <sha7>; tree`. A `command not found` means `bin/` is not on the subagent's PATH. For `experimental`, read the session's debug log (`claude --debug` on the same probe) for the controller's `cacheTtl`; record honoured, ignored, or not observable.

- [ ] **Step 5: Apply the fallbacks that the probes demand**

Name fallback: `scripts/agents-link.sh` writes `~/.claude/agents/sdd-implementer.md`, `sdd-reviewer.md`, `sdd-unit-controller.md` from `agents/*.md`, rewriting the `name:` line to the file's prefixed name and putting `<!-- written by the sdd plugin; do not edit -->` as the first body line; it rewrites only a file that carries that comment, prints a notice to stderr for a foreign file, and takes the agents directory from `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agents`. `hooks/hooks.json` runs it at `SessionStart` with matcher `startup`, `"command": "bash \"${CLAUDE_PLUGIN_ROOT}/scripts/agents-link.sh\""`, timeout 10. `SKILL.md` and `unit-controller-overrides.md` then dispatch the prefixed names. `tests/test-agents-link.sh` runs the script against a temporary `CLAUDE_CONFIG_DIR`, asserts the three files exist with `name: sdd-implementer` (and the other two) on line 2 and the marker comment, then plants a foreign `sdd-reviewer.md` and asserts it is untouched and a notice is printed.

Preload fallback: `agents/unit-controller.md` drops `skills:` and its body opens with "Invoke the superpowers subagent-driven-development skill before anything else." Its test is the probe of Step 3 repeated: the controller names the heading.

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

`tests/test-tools.sh` builds a temporary transcript directory in the layout the tools README describes: a session `.jsonl` with one assistant line whose `message.usage` fields are all 1, and under `<session>/subagents/` two agent files, one with `agent_type` (or the field the tools read; read `transcript-roles.py` line 33 for its name) `app-sdd-unit-controller` and one with `sdd:unit-controller`. It runs `python3 -I tools/transcript-roles.py <session.jsonl>` and asserts the output names `unit-controller` twice and never `unknown`; then the same for `transcript-clock.py --skill sdd:apply` exiting 0.

- [ ] **Step 2: Run to verify it fails**

Run: `bash tests/test-tools.sh`
Expected: `FAIL` (the tools are not there yet).

- [ ] **Step 3: Copy the tools and widen the names**

Copy `tools/` from the record. In `transcript-roles.py` lines 14 and 33 to 35, `transcript-clock.py` lines 176, 215 to 216 and 265, and `transcript-tokens.py` line 42, replace each literal test with a helper `role_of(agent_type)` that strips whichever of `app-sdd-`, `sdd:` or `sdd-` the name starts with, and a skill test that accepts `app-subagent-apply` or `sdd:apply`. `tools/green/2026-09-25-unit-controller-workflow.js` lines 6, 8, 9 and 96, `tools/green/claude-code-workflow.js` line 11 and `tools/green/tick-script-check.sh` lines 9 and 12 point their defaults at `~/projects/akalongman/claude-sdd/skills/apply/SKILL.md`, `.../skills/apply/prompts/unit-controller-overrides.md`, `.../agents/unit-controller.md`, `.../skills/apply/scripts` and name `sdd:unit-controller`. `tools/README.md` names both the old and the new agent names in one sentence.

- [ ] **Step 4: Run to verify it passes**

Run: `bash tests/test-tools.sh && bash tools/green/tick-script-check.sh`
Expected: `ok` lines, exit 0 for both.

- [ ] **Step 5: Add the test to the runner and commit**

`tests/run.sh` gains `test-tools.sh`.

```bash
git add tools tests/test-tools.sh tests/run.sh && git commit -m "Port the transcript tools to accept both agent name forms" -- tools tests/test-tools.sh tests/run.sh
```

### Task 9: Absorb the record's documents

**Files:**
- Create: `docs/history/README.md` (the record's `README.md`), `docs/history/decisions.md`, `findings.md`, `lessons.md`, `measurements.md`, `skill.md`, `upstream.md`, `docs/history/specs/*` and `docs/history/plans/*` (from the record's `docs/superpowers/`), `docs/history/reviews/*` (every file under the record's `reviews/`, the five untracked ones included), `docs/history/upstream/*` only by the owner's word
- Create: `docs/history/INDEX.md` (one line per file: what it is, its date)

**Interfaces:**
- Produces: the history in one place, with a closing entry in `docs/history/decisions.md`.

- [ ] **Step 1: owner step: the record's unpushed state**

The record has six commits ahead of `origin/main` and six dirty entries. Ask the owner whether to commit the five untracked review files there and push, or to carry them over uncommitted; and whether `upstream/` (a working-tree patch and two pull-request bodies) moves to `docs/history/upstream/` or is dropped. Under hands-off this unit returns `parked (owner: record repository state)`.

- [ ] **Step 2: Copy with `cp -rp`, then write the closing entry**

The closing entry in `docs/history/decisions.md`, numbered after the last, dated, reads: the skill moved into the `sdd` plugin at `akalongman/claude-sdd` on this date; the tools, tests and documents moved with it; this log is closed and the plugin's own log is `docs/decisions.md`.

- [ ] **Step 3: Verify completeness**

Run: `cd ~/projects/personal/claude-subagent-apply && for f in $(git ls-files docs reviews README.md; git ls-files --others --exclude-standard reviews); do b=$(basename "$f"); [ -n "$(find ~/projects/akalongman/claude-sdd/docs/history -name "$b" -print -quit)" ] || echo "missing $f"; done`
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

- [ ] **Step 3: owner step: move the local registration**

Before: `cp ~/.claude/settings.json /tmp/settings.before.json; claude plugin list > /tmp/plugins.before.txt`. Then, with the owner's word: `claude plugin marketplace remove akalongman && claude plugin marketplace add akalongman/claude-plugins && claude plugin install laterbox@akalongman && claude plugin install sdd@akalongman`. After: `diff <(jq -S .pluginConfigs /tmp/settings.before.json) <(jq -S .pluginConfigs ~/.claude/settings.json)` prints nothing; `claude plugin list` shows both plugins with a commit-pinned version; a new session's start line shows laterbox's count and `command -v later` resolves. Record the before and after in `docs/decisions.md` entry 2.

- [ ] **Step 4: owner step: the laterbox repository**

Delete its `.claude-plugin/marketplace.json`, change the README's `claude plugin marketplace add akalongman/claude-laterbox` lines to `akalongman/claude-plugins`, commit on its `main` by the owner's word, path-limited, and leave the push to the owner.

- [ ] **Step 5: Commit the marketplace repository and push by the owner's word**

```bash
cd ~/projects/akalongman/claude-plugins && git add .claude-plugin/marketplace.json README.md LICENSE && git commit -m "List laterbox and sdd by GitHub source" -- .claude-plugin/marketplace.json README.md LICENSE
```

### Task 11: CI

**Files:**
- Create: `.github/workflows/test.yml`

**Interfaces:**
- Produces: a Linux job on push and pull request to `main`.

- [ ] **Step 1: Write the workflow**

Modelled on laterbox's: `actions/checkout@v5`, `actions/setup-node@v4` with Node 24, `npm install -g @anthropic-ai/claude-code@2.1.319`, `claude --version`, `claude plugin validate . --strict`, then the dependencies the suite needs: `git clone --depth 1 https://github.com/akalongman/claude-laterbox "$RUNNER_TEMP/laterbox"` and `echo "$RUNNER_TEMP/laterbox/scripts" >> "$GITHUB_PATH"` (for `later`), `claude plugin marketplace add obra/superpowers-marketplace && claude plugin install superpowers@superpowers-marketplace` (for `sub-skill-check`'s default directory), then `bash tests/run.sh` and `shellcheck bin/sdd-checkpoint skills/apply/scripts/[a-z]* tests/*.sh` (the awk file excluded). Timeout 15 minutes.

- [ ] **Step 2: Run the same steps locally in a clean PATH**

Run: `env -i HOME="$HOME" PATH=/usr/bin:/bin:"$HOME/.local/bin" bash tests/run.sh`
Expected: all `ok`.

- [ ] **Step 3: Commit, and push by the owner's word; watch the run**

```bash
git add .github/workflows/test.yml && git commit -m "Run the plugin's tests on push and pull request" -- .github/workflows/test.yml
```

After the owner's push: `gh run watch` on the run for `git rev-parse HEAD`; a red run from the superpowers install (no login in CI) is fixed by skipping `test-sub-skill-check.sh` with a printed reason when `claude plugin install` fails, never by removing the test.

### Task 12: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Fill the sections**

`Install`: the two commands `claude plugin marketplace add akalongman/claude-plugins` and `claude plugin install sdd@akalongman`, the in-session forms, and the note that `claude-sdd` is private so the install needs git access to it. `Requirements`: Claude Code 2.1.318 or newer; the superpowers plugin (installed as a dependency); Linux, bash 5, GNU coreutils, git until phase 3; the owner's `~/.claude/rules/git.md` cited by the implementer overrides; model aliases as the account offers them; laterbox recommended, and a `later` missing from PATH shows as `not parked` lines in the run report, never as an error. `Using it`: `/sdd:apply <source> [step|hands-off] [isolated] [tier=<alias>]`, one paragraph per option, the workspace and archive paths, the three agents by name. `Develop`: `claude --plugin-dir .`, `claude plugin validate . --strict`, `bash tests/run.sh`, `shellcheck ...`, the release rule (a version bump reaches installed copies, never during a live run). `Uninstall`: `claude plugin uninstall sdd@akalongman`, and the fallback copies under `~/.claude/agents/sdd-*.md` to delete by hand when Task 7's fallback shipped. `History`: one line pointing at `docs/history/INDEX.md`.

- [ ] **Step 2: Verify and commit**

Run: `/bin/grep -nP '[\x{2014}\x{2013}]' README.md; /bin/grep -c 'AskUserQuestion\|TodoWrite\|subagent_type' README.md`
Expected: no dash match, count `0`.

```bash
git add README.md && git commit -m "Write the README" -- README.md
```

### Task 13: Retire the private copy and run the acceptance

**Files:**
- Modify (owner, public dotfiles): remove `~/.claude/skills/app-subagent-apply/` and `~/.claude/agents/app-sdd-*.md`; edit `~/.claude/CLAUDE.md` line 22
- Modify: `docs/decisions.md` (entry 3: the acceptance run)

- [ ] **Step 1: owner step: remove the private copy**

With the plugin installed from the marketplace (Task 10) and the owner's word: `yadm rm -r ~/.claude/skills/app-subagent-apply ~/.claude/agents/app-sdd-implementer.md ~/.claude/agents/app-sdd-reviewer.md ~/.claude/agents/app-sdd-unit-controller.md`, then the untracked `2026-09-19-2211-app-subagent-apply-findings.local.md` is kept or dropped by the owner's word (the spec says it does not move; the directory it sits in goes). One yadm commit, by the owner's word. The other profiles follow through their symlinks.

- [ ] **Step 2: owner step: the working agreement**

Propose the edit of `~/.claude/CLAUDE.md` line 22: "goes through `app-subagent-apply`" becomes "goes through `/sdd:apply`". Apply only on the owner's yes.

- [ ] **Step 3: Verify the old names are gone**

Run: `/bin/grep -rln 'app-subagent-apply\|app-sdd-' ~/.claude --include='*.md' --include='*.json' --include='*.sh' 2>/dev/null | /bin/grep -v '/memory/\|/projects/\|/docs/tmp/'; cd ~/projects/akalongman/claude-sdd && /bin/grep -rln 'app-subagent-apply\|app-sdd-' . --exclude-dir=.git --exclude-dir=history --exclude-dir=tools --exclude-dir=green`
Expected: no path from either command.

- [ ] **Step 4: The acceptance run**

Create `~/projects/scratch/sdd-acceptance` (a git repository with one commit and a `composer.json`-free, test-free layout: three text files), `openspec init` there and one change with two `## N.` sections of one item each that edit those files. Start a fresh session in it and run `/sdd:apply <change>`; after the first unit's `complete`, type `pause`, let the second unit's controller return `paused`, then `continue`; let the final phase and `run-archive` run. Then, in a second session, `/sdd:apply <change> step` on a change whose first section is ticked, to exercise the resume filter's re-dispatch. Then `/sdd:apply` with no argument in a session that has discussed the change, and `/sdd:apply <change> hands-off tier=sonnet isolated` parsed and announced (stopped before dispatch is fine).

Expected, checked in `<ws>/progress.md` and the archive: `Run base:`, `Commit mode:`, `Model policy:`, `Section 1: handed to controller`, `Section 1: complete`, `Section 2: controller returned paused (<point>; heads <...>; tree <...>)` (the checkpoint line from the controller's bare `sdd-checkpoint`), `Section 2: pause released`, `Final phase: complete <sha7>`, the `Handed to` lines parked (`later` on PATH) and the archive path printed last. The dispatch payload (paths only, the overrides path, the tick command, no inline design) is read from the transcript's first Agent dispatch and compared with one from a run before the move (`docs/history/measurements.md` quotes one).

- [ ] **Step 5: Record, and the record repository**

`docs/decisions.md` entry 3: the acceptance's session ids, what passed, anything that differed. Then, by the owner's word: `gh repo archive akalongman/claude-subagent-apply -y` and `rm -rf ~/projects/personal/claude-subagent-apply`, only after `git -C ~/projects/personal/claude-subagent-apply status --short` is empty and `git log origin/main..main` there is empty.

```bash
git add docs/decisions.md && git commit -m "Record the phase 1 acceptance run" -- docs/decisions.md
```

---

## Self-review notes

Spec coverage: layout (Tasks 1, 3 to 6, 8, 9), the edits list (4, 5, 6), the fallback (7), outside-repository changes (10, 13), the record repository (9, 13), acceptance 1 (7), 2 and 3 (13), marketplace (10), dev loop and prerequisites (12), decisions 6, 7, 12, 13, 16, 17, 23 (1, 3, 7, 13, 10, 9 and 13, 1). The spec's phase 1 bullet says the driver's own checkpoint call becomes the bare name and acceptance 2 says "from a controller and from the driver"; the skill text never names the script, only the controller's overrides do, and the spec is corrected to say so with this plan.

Not in this plan, on purpose: `hooks/register.tsx`, `scripts/away`, `userConfig`, the `types` key and the `.claude-plugin/types/` directory, all phase 2.
