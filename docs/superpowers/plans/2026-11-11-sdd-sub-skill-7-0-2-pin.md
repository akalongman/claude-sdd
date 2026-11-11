# Superpowers 7.0.2 under the sdd plugin: verify the loop, then move the pin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify superpowers 7.0.2's subagent-driven-development loop against the plugin's text, then upgrade the machine to it and move the verified pin in both copies of `sub-skill-check` and in CI, so a fresh install of the plugin launches without the unverified sub-skill warning.

**Architecture:** The procedure is section 6 of the pin spec, run a second time (the first, for 7.0.1, is decision 24 of the record repository). A candidate copy is compared with the verified one and put through the controller scenarios before anything on the machine changes; only on a pass does the machine upgrade and the pin move, in one sitting, so the installed copy and the pin never disagree for longer than that sitting.

**Tech Stack:** bash, jq, git, GitHub Actions, the multi-agent scenario harness in `tools/green/`.

**Spec:** the record repository (`akalongman/claude-subagent-apply`, private, cloned at `~/projects/personal/claude-subagent-apply`), `docs/superpowers/specs/2026-10-23-sub-skill-upgrade-content-pin-design.md`, sections 2 and 6; its decision 24 (`docs/decisions.md`) is the worked precedent for 7.0.1.

## Global Constraints

- Candidate: `obra/superpowers` tag `v7.0.2`, peeled commit `22f0b463e7a5e579904dd6211a520321035526f7`, plugin version `7.0.2`, loop hash `c95cdd95b49a`. The verified copy today: `7.0.1`, `49e0f5325d56`, commit `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`.
- The pin is the two constants at `skills/apply/scripts/sub-skill-check` lines 31 and 32, written as `verified_version=7.0.2` and `verified_loop=c95cdd95b49a`, only after Task 2 passes.
- The plugin's `sub-skill-check` and the private copy (`~/.claude/skills/app-subagent-apply/scripts/sub-skill-check`, tracked by yadm) are byte-identical today and after this plan.
- CI (`.github/workflows/test.yml`, step "Install superpowers at the verified release") moves `version=` and `commit=` with the plugin's pin, in the same commit.
- A failed check means not upgrading, never a rollback (spec section 6).
- Nothing else changes: the skill's text, its prompts, the agents, and the plugin's own `skills/apply/scripts/task-brief` copy stay as they are.
- Owner steps, each needing the owner's word at the time: the scenario run (a multi-agent workflow run), the machine-wide plugin update, the yadm commit (a skill edit), and every push.
- Commits: signed, path-limited, gated on `main` (`[ "$(git branch --show-current)" = main ] && git add <paths> && git commit -m "<title>" -- <paths>`), no trailers. No em or en dashes. No client name in any committed line (check with `git grep -nIiE -f .superpowers/sdd/2026-11-09-sdd-phase-1-move-the-skill/client-names.pattern -- .`, no match). New committed text writes home paths as `~/...`.

## Review Focus

1. Another session has an apply run in flight at the upgrade: the unit controller preloads the sub-skill by name, so that run's later controllers load 7.0.2 while its ledger names 7.0.1. Task 3 Step 1 waits for in-flight runs to end, as decision 24 did.
2. The marketplace entry names no ref, so `claude plugin update` installs `obra/superpowers`'s default branch as it is at that moment, not the tag. An update after `main` moves past `v7.0.2` installs an unverified copy. Task 3 Step 2 compares `v7.0.2...main` on the loop files before the update, and Step 3 diffs the installed copy against the candidate after it.
3. The pin and the installed copy out of step: a pin ahead of the copy turns `test-sub-skill-check` case 7 red on this machine, and a copy ahead of the pin prints the warning at every launch in every session. Task 3 moves both in one sitting, and Step 6 checks both.
4. A sub-skill script run from a directory outside the project checkout but under the home directory resolves to the home dotfiles repository (`~/.git` links to the yadm repository) under both versions, instead of failing. Task 1's probe records what each version does there; no change is expected or made.
5. CI checking a different copy than the pin names: CI fetches by commit, because a tag can move. Task 3 Step 5 writes the peeled commit above, and CI's `test-sub-skill-check` case 7 fails if the fetched copy's hash is not the pin's.

---

### Task 1: Compare the 7.0.2 candidate with the verified 7.0.1 copy

**Files:**
- Modify: `tools/green/README.md` (a new last section, "Superpowers 7.0.2 (2026-11-11)")

**Interfaces:**
- Produces: the candidate directory `~/projects/scratch/superpowers-7.0.2/skills/subagent-driven-development`, which Task 2 passes as `args.sdd` and Task 3 diffs against.

- [ ] **Step 1: Fetch the candidate and confirm what the script prints for it**

The candidate may already exist from planning; reuse it when its HEAD and version match, else clone it:
Run: `git clone --depth 1 --branch v7.0.2 https://github.com/obra/superpowers.git ~/projects/scratch/superpowers-7.0.2`, then `git -C ~/projects/scratch/superpowers-7.0.2 rev-parse HEAD` and `jq -r .version ~/projects/scratch/superpowers-7.0.2/.claude-plugin/plugin.json`
Expected: `22f0b463e7a5e579904dd6211a520321035526f7` and `7.0.2`.
Run: `bash skills/apply/scripts/sub-skill-check ~/projects/scratch/superpowers-7.0.2/skills/subagent-driven-development`, then `bash skills/apply/scripts/sub-skill-check`
Expected: `Sub-skill: 7.0.2 loop c95cdd95b49a unverified (verified: 7.0.1 49e0f5325d56)` plus the warning line, then `Sub-skill: 7.0.1 loop 49e0f5325d56 verified`.

- [ ] **Step 2: Diff the loop files**

Run: `diff -rq "$(bash skills/apply/scripts/sub-skill-check --dir)" ~/projects/scratch/superpowers-7.0.2/skills/subagent-driven-development` and the same for `../requesting-code-review/code-reviewer.md` of each copy.
Expected: eight changed files (`SKILL.md`, `references/final-review.md`, `references/fix-loop.md`, `re-review-prompt.md`, `task-reviewer-prompt.md`, `scripts/review-package`, `scripts/sdd-workspace`, `scripts/task-brief`), one new file (`scripts/sdd-repo`), `code-reviewer.md` identical. Any other difference stops the task with NEEDS_CONTEXT. The prose changes say to run each script "by its absolute path, from the working tree you're executing in"; the scripts gain `-C DIR`, the repository comes from the new `sdd-repo`, and `task-brief` matches task ids as whole strings.

- [ ] **Step 3: Probe the scripts the way the apply skill calls them**

In a scratch repository `~/projects/scratch/sdd-7.0.2-probe` (two commits; a plan file with `### Task 1`, `### Task 2`, `### Task 2b` and a trailing `## Self-review` section; one linked worktree under `.worktrees/`), run each script of both copies and record exit status and output:

| Probe | Call | Expected |
|---|---|---|
| a | `sdd-workspace PLAN` from the repository root, and from the worktree | the same printed path from both versions in each place |
| b | `review-package PLAN BASE HEAD OUTFILE` from the root | the two packages identical (`cmp`) |
| c | the same from the worktree | identical |
| d | `review-package PLAN BASE HEAD OUTFILE` from the candidate's skill directory (outside the checkout, under home) | record each version's exit and message; both fail on the probe's BASE, which the home dotfiles repository does not hold (Review Focus 4); do not run `sdd-workspace` there, which would create `~/.superpowers/sdd/` |
| e | the sub-skill's `task-brief PLAN 2` and `task-brief PLAN 2b` (7.0.2), and the plugin's `skills/apply/scripts/task-brief PLAN 2` | 7.0.2 keeps Task 2b out of Task 2's brief; record whether 7.0.2's brief of the last task still carries `## Self-review`; the plugin's copy carries neither |

The plugin's `task-brief` copy stays whatever probe e shows (Global Constraints); the section records whether upstream now fixes both halves its header names, for the phase that may drop it.

- [ ] **Step 4: Write the README section**

The new section names the candidate (tag, commit, hash), lists the Step 2 file differences in one line each, gives the Step 3 table with the observed results, and says what probe e means for the plugin's `task-brief` copy. At most 40 lines; wrapped like the rest of the file.

- [ ] **Step 5: Gates and commit**

Run: `bash tests/run.sh` (Expected: `9 ok, 0 skipped, 0 failed`), the client-name `git grep` (no match), `git grep -nP '[\x{2014}\x{2013}]' -- tools/green/README.md` (no match).
Commit: `[ "$(git branch --show-current)" = main ] && git add tools/green/README.md && git commit -m "Compare the superpowers 7.0.2 loop with the verified copy" -- tools/green/README.md`

### Task 2: Run the controller scenarios on the candidate (owner step)

**Files:**
- Create: `tools/green/2026-11-11-results-7.0.2.json`
- Modify: `tools/green/README.md` (Task 1's section)

**Interfaces:**
- Consumes: Task 1's candidate directory.
- Produces: the pass that Task 3 requires.

A multi-agent workflow run cannot start inside a subagent; the session that drives this plan runs it, once the owner has opted in to it in their own words.

- [ ] **Step 1: Get the owner's opt-in to the workflow run**

About 205,000 tokens (three scenarios at the 2026-10-23 rate of about 68,000 each).

- [ ] **Step 2: Run the three scenarios whose reference files 7.0.2 changed**

Run: the workflow script `tools/green/2026-09-25-unit-controller-workflow.js` with arguments `{"sdd": "<absolute path of ~/projects/scratch/superpowers-7.0.2/skills/subagent-driven-development>", "only": ["S1-fix-small-ctx", "S16-note-round-reviewed-clean", "S17-final-note-after-fix-wave"], "reps": 1}`.
Expected: every check of every scenario passes; the result's `summary` shows `"runs": 1, "all_pass": 1` for each key (the owner's criterion of 2026-10-23). S1 reads `references/fix-loop.md` (the scoped re-review package), S16 a note round and its re-review, S17 `references/final-review.md` (the final package and the fix wave), so each changed reference file is read by at least one scenario.

- [ ] **Step 3: On a failing check, tell a 7.0.2 effect from an existing one**

No upgrade and no pin. Rerun the failing scenario once with `args.sdd` at the installed 7.0.1 copy (`bash skills/apply/scripts/sub-skill-check --dir`), record both runs in the README section, commit the results, and stop the plan for the owner.

- [ ] **Step 4: Record the run and commit**

Save the workflow's result object as `tools/green/2026-11-11-results-7.0.2.json`, with the same top-level keys as `tools/green/2026-10-23-results-7.0.1.json`. Add to Task 1's section the workflow run id, the three scenarios, each one's result and the total tokens.
Run: `jq -e '.summary' tools/green/2026-11-11-results-7.0.2.json` (exit 0), `node tools/green/rescore.mjs tools/green/2026-09-25-unit-controller-workflow.js tools/green/2026-11-11-results-7.0.2.json` (exit 0, every printed check true).
Commit: `[ "$(git branch --show-current)" = main ] && git add tools/green/2026-11-11-results-7.0.2.json tools/green/README.md && git commit -m "Record the superpowers 7.0.2 scenario run" -- tools/green/2026-11-11-results-7.0.2.json tools/green/README.md`

### Task 3: Upgrade superpowers and move both pins (owner steps)

**Files:**
- Modify: `skills/apply/scripts/sub-skill-check:31-32`
- Modify: `.github/workflows/test.yml` (the `version=` and `commit=` lines of "Install superpowers at the verified release")
- Modify: `docs/decisions.md` (a new entry, the next free number: 2 if Task 10's marketplace move has not landed, whose parked note names entry 2; whichever lands second takes the next number)
- Modify, outside this repository: `~/.claude/skills/app-subagent-apply/scripts/sub-skill-check:31-32` (yadm)

**Interfaces:**
- Consumes: Task 2's pass; Task 1's candidate directory.

- [ ] **Step 1: Wait for in-flight apply runs to end**

List every apply ledger changed in the last seven days (`progress.md` under `~/projects/*/*/.superpowers/sdd/`, `~/projects/oss/*/*/.superpowers/sdd/` and their `.worktrees/*/`), and for each say whether its newest archive under `~/.claude/docs/tmp/apply-runs/` holds the live ledger (decision 24's rule: a run counts as ended once it does, trailing `Hands-off:` lines aside). Expected: none open apart from this plan's own run; otherwise the owner chooses to wait or to go on.

- [ ] **Step 2: Gate the update on the default branch, then update (owner step)**

Run: `gh api repos/obra/superpowers/compare/v7.0.2...main --jq '[.files[]?.filename | select(startswith("skills/subagent-driven-development/") or . == "skills/requesting-code-review/code-reviewer.md")] | length'`
Expected: `0`. Anything else stops the task: the update would install an unverified copy.
Then: `claude plugin marketplace update superpowers-marketplace` (its clone moves to `5c90728`, "Update superpowers to v7.0.2"), `claude plugin update superpowers@superpowers-marketplace --scope user`, and from `~`, `claude plugin update superpowers@superpowers-marketplace --scope project`.
Expected: each update reports 7.0.1 to 7.0.2, and both entries of `~/.claude/plugins/installed_plugins.json` read version `7.0.2`. The four account folders share that `plugins` directory, so one update covers all of them; sessions already open keep the copy they loaded until restarted.

- [ ] **Step 3: Confirm the installed copy is the candidate**

Run: `diff -r "$(bash skills/apply/scripts/sub-skill-check --dir)" ~/projects/scratch/superpowers-7.0.2/skills/subagent-driven-development` and the same for `code-reviewer.md`.
Expected: no output. A difference means an unverified copy is installed: stop and report it to the owner before any pin moves.

- [ ] **Step 4: Move the private copy's pin (owner step)**

Edit lines 31 and 32 of `~/.claude/skills/app-subagent-apply/scripts/sub-skill-check` to the Global Constraints values; nothing else in the file changes. Check yadm's signing setup first (`yadm gitconfig --get commit.gpgsign` and `yadm log --format='%h %G?' -3`; `yadm config` reads yadm's own settings, not git's) and let it run.
Commit: `yadm add ~/.claude/skills/app-subagent-apply/scripts/sub-skill-check && yadm commit -m "Pin superpowers 7.0.2 in the apply skill's sub-skill check" -- ~/.claude/skills/app-subagent-apply/scripts/sub-skill-check`

- [ ] **Step 5: Move the plugin's pin and CI's copy, and record the decision**

Edit `skills/apply/scripts/sub-skill-check` lines 31 and 32 to the same values; then `cmp skills/apply/scripts/sub-skill-check ~/.claude/skills/app-subagent-apply/scripts/sub-skill-check` (exit 0). In `.github/workflows/test.yml` set `version=7.0.2` and `commit=22f0b463e7a5e579904dd6211a520321035526f7`. Write the decision entry: the candidate, Task 1's comparison, Task 2's run, the wait, the update and Step 3's diff, both pins, and Step 6's results, in the style of entry 1.

- [ ] **Step 6: Verify and commit**

Run: `bash skills/apply/scripts/sub-skill-check` (Expected: `Sub-skill: 7.0.2 loop c95cdd95b49a verified`, no warning line), `bash tests/run.sh` (Expected: `9 ok, 0 skipped, 0 failed`), `bash tests/test-sub-skill-check.sh ~/.claude/skills/app-subagent-apply/scripts/sub-skill-check` (seven `ok` lines), `shellcheck skills/apply/scripts/sub-skill-check` (no output), the client-name and dash `git grep` checks (no match).
Commit: `[ "$(git branch --show-current)" = main ] && git add skills/apply/scripts/sub-skill-check .github/workflows/test.yml docs/decisions.md && git commit -m "Pin superpowers 7.0.2 in the sub-skill check" -- skills/apply/scripts/sub-skill-check .github/workflows/test.yml docs/decisions.md`

- [ ] **Step 7: Push and watch CI (owner step)**

Inspect `git log origin/main..HEAD` and push `main`; watch the run for the pushed commit to its end. Expected: `conclusion=success`, the linux job's totals `9 ok, 0 skipped, 0 failed`. The yadm commit is pushed as the owner usually pushes the dotfiles, on their word. Then parked note 11 is closed.
