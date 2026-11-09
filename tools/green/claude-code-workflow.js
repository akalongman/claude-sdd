export const meta = {
  name: 'green-test-and-upstream-draft',
  description: 'After-edit scenario check of the new app-subagent-apply skill against the old one, and a draft of the upstream superpowers pull request',
  phases: [
    { title: 'Green', detail: 'six controller scenarios, new versus old skill text, three reps each' },
    { title: 'Upstream', detail: 'draft the three template fixes against superpowers main in the fork working tree' },
  ],
}

const DUR = '/home/longman/.claude/reviews/2026-09-21-1305-app-subagent-apply'
const NEW_SKILL = '/home/longman/.claude/skills/app-subagent-apply/SKILL.md'
const OLD_SKILL = `${DUR}/old-SKILL.md`
const SDD = '/home/longman/.claude3/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/subagent-driven-development/SKILL.md'
const F = `${DUR}/green-fixtures`
const CLONE = '/home/longman/projects/repositories/obra/superpowers'
const REPS = 3

const preamble = (skill) => `You are a Claude Code session acting as the controller of an implementation run driven by the skill at ${skill} (read it in full first) and its required sub-skill at ${SDD} (read it in full). Fixture files live under ${F}/. Decide your very next actions exactly as you would in the real session and put the literal text you would send, print or run into the fields. Do not describe alternatives and do not hedge. Do not run anything except reading files. Return the structured object only.`

const SCEN = [
  { key: 'S1-fix-small-ctx', prompt: `Situation: OpenSpec change \`demo\`, workspace /repo/.superpowers/sdd/demo, on branch dev with commit mode "commit on dev". Section 2's implementer (agent id a62e23f4) returned DONE with commits 2b698a3..c1d2e3f. You packaged the diff and dispatched the task reviewer; its final message is the file ${F}/review-verdict-section-2.md (read it). The implementer's last task-notification reported <subagent_tokens>118000</subagent_tokens>. What do you do next?`,
    schema: { type: 'object', properties: { next_action: { type: 'string', enum: ['message_same_implementer', 'dispatch_fresh_implementer', 'fix_it_myself', 'mark_complete', 'other'] }, message_text: { type: 'string' }, ledger_lines: { type: 'array', items: { type: 'string' } }, tools_used: { type: 'array', items: { type: 'string' } } }, required: ['next_action', 'message_text', 'ledger_lines'] },
    check: r => ({
      resumes: r.next_action === 'message_same_implementer',
      names_review_file: /section-2-review\.md/.test(r.message_text),
      names_open_ids: /\bC1\b/.test(r.message_text) && /\bI1\b/.test(r.message_text),
      minors_kept_out: !/it_ prefix|Docblock/.test(r.message_text),
      minors_ledgered: (r.ledger_lines || []).some(l => /minor \(deferred\)/i.test(l)),
    }) },
  { key: 'S2-fix-large-ctx', prompt: `Situation: OpenSpec change \`demo\`, workspace /repo/.superpowers/sdd/demo, on branch dev with commit mode "commit on dev". Section 2's implementer (agent id a62e23f4) returned DONE with commits 2b698a3..c1d2e3f. You packaged the diff and dispatched the task reviewer; its final message is the file ${F}/review-verdict-section-2.md (read it). The implementer's last task-notification reported <subagent_tokens>346000</subagent_tokens>. What do you do next?`,
    schema: { type: 'object', properties: { next_action: { type: 'string', enum: ['message_same_implementer', 'dispatch_fresh_implementer', 'fix_it_myself', 'mark_complete', 'other'] }, message_text: { type: 'string' }, ledger_lines: { type: 'array', items: { type: 'string' } }, tools_used: { type: 'array', items: { type: 'string' } } }, required: ['next_action', 'message_text', 'ledger_lines'] },
    check: r => ({
      fresh: r.next_action === 'dispatch_fresh_implementer',
      handover_framing: /you own it now/i.test(r.message_text),
      names_review_file: /section-2-review\.md/.test(r.message_text),
      minors_kept_out: !/it_ prefix|Docblock/.test(r.message_text),
    }) },
  { key: 'S3-fable-limit', prompt: `Situation: OpenSpec change \`demo\`; every section is complete, the gates passed and are ledgered. You dispatched the final whole-branch review with model fable. The result is the file ${F}/fable-limit-notification.txt (read it). What do you do next, and would you use fable again for any role later in this session?`,
    schema: { type: 'object', properties: { next_action: { type: 'string', enum: ['redispatch_same_prompt_on_opus', 'retry_fable', 'ask_user', 'skip_final_review', 'other'] }, ledger_lines: { type: 'array', items: { type: 'string' } }, later_fable_use: { type: 'boolean' }, reasoning: { type: 'string' } }, required: ['next_action', 'ledger_lines', 'later_fable_use'] },
    check: r => ({
      steps_down: r.next_action === 'redispatch_same_prompt_on_opus',
      fallback_ledgered: (r.ledger_lines || []).some(l => /Model fallback:/.test(l)),
      no_reprobe: r.later_fable_use === false,
    }) },
  { key: 'S4-units-and-tick', prompt: `Situation: fresh run of OpenSpec change \`demo\`; its tasks.md is ${F}/tasks.md (read it); the apply JSON reports state ready, 5 tasks, 0 complete. (a) List, in order, the unit ids you will dispatch. (b) Later, section 1's task review returned "Spec: OK, Quality: Approved" with no findings and the implementer's commits are 1a554eb..2b698a3; give the exact command(s) or tool call(s) you run to mark that progress.`,
    schema: { type: 'object', properties: { units: { type: 'array', items: { type: 'string' } }, mark_commands: { type: 'array', items: { type: 'string' } }, edits_tasks_md_with_edit_tool: { type: 'boolean' } }, required: ['units', 'mark_commands', 'edits_tasks_md_with_edit_tool'] },
    check: r => ({
      units_exact: JSON.stringify((r.units || []).map(u => String(u).replace(/^section\s*/i, '').trim())) === JSON.stringify(['1', '2', '2b']),
      notes_excluded: !(r.units || []).some(u => /notes/i.test(String(u))),
      tick_script: (r.mark_commands || []).join('\n').includes('openspec-section-tick'),
      ledger_line_in_command: /Section 1: complete/.test((r.mark_commands || []).join('\n')),
      no_hand_edit: r.edits_tasks_md_with_edit_tool === false,
    }) },
  { key: 'S5-checkpoint-fires', prompt: `Situation: OpenSpec change \`demo\` with 6 sections. The ledger is ${F}/ledger-3-complete.md (read it); section 3's completion line was just appended and its items ticked. No implementer is live and no fix round is open. What do you do next?`,
    schema: { type: 'object', properties: { next_action: { type: 'string', enum: ['print_clear_and_stop', 'dispatch_next_section', 'ask_user', 'other'] }, printed_text: { type: 'string' }, ledger_lines: { type: 'array', items: { type: 'string' } } }, required: ['next_action', 'printed_text', 'ledger_lines'] },
    check: r => ({
      stops: r.next_action === 'print_clear_and_stop',
      clear_line: /^\s*\/clear\b/.test(r.printed_text || ''),
      reinvokes: /\/app-subagent-apply\b/.test(r.printed_text || ''),
      checkpoint_ledgered: (r.ledger_lines || []).some(l => /Checkpoint:/.test(l)),
    }) },
  { key: 'S6-checkpoint-holds', prompt: `Situation: OpenSpec change \`demo\` with 6 sections. The ledger is ${F}/ledger-2-complete.md (read it); section 2's completion line was just appended and its items ticked. No implementer is live and no fix round is open. What do you do next?`,
    schema: { type: 'object', properties: { next_action: { type: 'string', enum: ['print_clear_and_stop', 'dispatch_next_section', 'ask_user', 'other'] }, printed_text: { type: 'string' }, ledger_lines: { type: 'array', items: { type: 'string' } } }, required: ['next_action', 'printed_text', 'ledger_lines'] },
    check: r => ({
      continues: r.next_action === 'dispatch_next_section',
      no_clear: !/^\s*\/clear\b/.test(r.printed_text || ''),
    }) },
]

const ARMS = [{ key: 'new', skill: NEW_SKILL }, { key: 'old', skill: OLD_SKILL }]

const UPSTREAM = {
  type: 'object',
  properties: {
    already_fixed_upstream: { type: 'array', items: { type: 'string' } },
    changed_files: { type: 'array', items: { type: 'string' } },
    pr_title: { type: 'string' },
    pr_body_path: { type: 'string' },
    related_prs_or_issues: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['already_fixed_upstream', 'changed_files', 'pr_title', 'pr_body_path', 'notes'],
}

const upstreamPrompt = `You are preparing an upstream contribution to the superpowers plugin (github obra/superpowers). A fork is cloned at ${CLONE} with remotes origin (the fork) and upstream (obra), currently on main at v6.4.1. HARD RULES: do not create, switch or rename any branch; do not commit; do not push; do not run gh pr create. Edit only files in that clone's working tree and write your notes under ${DUR}/upstream/ (create it). Prose you write must not use em or en dashes, even though the repository's own files do.

Background: ${DUR}/scratchpad/data-brief.md and ${DUR}/scratchpad/confirmed-condensed.md hold measurements from five real runs of superpowers 6.3.0's subagent-driven-development skill. Three defects in the sub-skill were confirmed and are being upstreamed:
1. Both reviewer templates (task-reviewer-prompt.md, re-review-prompt.md) and requesting-code-review's code-reviewer.md make the whole report the agent's final message, so every review and re-review becomes permanent controller context (median 13k chars per task review), and the sub-skill then has the controller re-type the findings into the fix message. Fix: the reviewer writes the full report to a REVIEW_FILE the dispatch names, and its final message is a short verdict block (spec and quality verdicts, one line per Critical and Important finding with an id and file:line, one line per Minor and cannot-verify item, the report path); the fix loop sends the file path plus the open finding ids instead of the findings verbatim. Wording that already exists for this: ${DUR}/scripts-minimal/prompts/reviewer-overrides.md, re-review-overrides.md, final-review-overrides.md.
2. Fix rounds 1 to 3 resume the original implementer with no context threshold; a resumed agent re-reads its whole context every turn, so on 300k to 680k contexts a resumed round costs 1.5x to 3.3x a fresh implementer. Fix: resume only while the implementer's last task-notification shows under 300,000 subagent tokens; above that, dispatch a fresh implementer with the brief, report and review file paths and the hand-over framing the rounds 4 and 5 text already uses.
3. No compaction checkpoint between tasks: controllers ran to 650k to 781k tokens of context before anything compacted and were 38 to 40 percent of every run's input tokens. Fix: after every third task completion line since the last checkpoint (plans of four or more tasks) and before the final review, with no implementer live, append a Checkpoint line to the ledger, print a /compact line that keeps the plan path, workspace, ledger and progress and drops dispatch prompts and reports, and stop for the user to re-invoke; the Setup section's resume path then continues.
Also a script bug, separately: scripts/task-brief ends a task only at the next "Task <digits>" heading, so trailing sections (Self-review, Done when) leak into the last task's brief and a "Task 3b" heading is merged into Task 3. A fixed version is at ${DUR}/scripts-minimal/task-brief (its awk block); verified on real plans.

Do this, in order:
1. Read the clone's CONTRIBUTING.md if present, AGENTS.md, CLAUDE.md, and docs/ for contribution and style rules (tests under tests/, release notes conventions). Read skills/subagent-driven-development/SKILL.md and its three templates and scripts, and skills/requesting-code-review/code-reviewer.md, as they are on main now.
2. Run git diff b36e082..HEAD -- skills/subagent-driven-development skills/requesting-code-review (6.3.0 to main) and report which of the four items above main already fixes, partly or fully. Do not re-implement what main already has.
3. Search for overlapping work: gh pr list --repo obra/superpowers --state all --search "review file" and similar terms (verdict, compaction, checkpoint, resume implementer, task-brief), and gh issue list --repo obra/superpowers --search with the same terms. Note anything overlapping.
4. Apply the remaining fixes as minimal edits in the working tree, in the repository's own voice and structure (the SKILL.md prose, the three templates, the placeholder lists at the bottom of each template, the task-brief script). Keep each item self-contained so the maintainer can drop one. If the repository has tests for the scripts or skill text, add or update them the way existing tests do, and run the test suite the repository documents; report the result verbatim.
5. Write ${DUR}/upstream/pr-body.md: the pull request description in the repository's expected format, leading with the measured problem (numbers from the data brief, with the run shapes: an OpenSpec change with 4 sections, plans with 14 and 25 tasks), then each change and why, then what was verified. No "Test plan" section header, no mention of AI assistants or Claude Code, no em or en dashes. Also write ${DUR}/upstream/summary.md with the git diff --stat and the list of files changed.
Return the structured object with what main already fixed, the files you changed, the PR title (short, imperative), the body path, related PRs or issues, and notes including the test output summary.`

phase('Green')
const runs = []
for (const s of SCEN) for (const a of ARMS) for (let i = 0; i < REPS; i++) runs.push({ s, a, i })
log(`Green: ${runs.length} scenario runs (${SCEN.length} scenarios x ${ARMS.length} arms x ${REPS} reps)`)

const [green, upstream] = await parallel([
  () => parallel(runs.map(r => () =>
    agent(`${preamble(r.a.skill)}\n\n${r.s.prompt}`, { label: `green:${r.a.key}:${r.s.key}:${r.i + 1}`, phase: 'Green', schema: r.s.schema, model: 'opus', effort: 'medium' })
      .then(res => ({ scenario: r.s.key, arm: r.a.key, rep: r.i + 1, result: res, checks: res ? r.s.check(res) : null }))
  )),
  () => agent(upstreamPrompt, { label: 'upstream-draft', phase: 'Upstream', schema: UPSTREAM, model: 'opus', effort: 'high' }),
])

const rows = (green || []).filter(Boolean)
const table = {}
for (const s of SCEN) {
  table[s.key] = {}
  for (const a of ARMS) {
    const rs = rows.filter(r => r.scenario === s.key && r.arm === a.key)
    const done = rs.filter(r => r.checks)
    const allPass = done.filter(r => Object.values(r.checks).every(Boolean)).length
    const perCheck = {}
    for (const r of done) for (const [k, v] of Object.entries(r.checks)) perCheck[k] = (perCheck[k] || 0) + (v ? 1 : 0)
    table[s.key][a.key] = { reps: rs.length, answered: done.length, all_checks_pass: allPass, per_check: perCheck }
  }
}
log(`Green done: ${rows.length} rows`)
return { green: table, samples: rows.filter(r => r.arm === 'new').map(r => ({ scenario: r.scenario, rep: r.rep, checks: r.checks, next_action: r.result && r.result.next_action, snippet: r.result && (r.result.message_text || r.result.printed_text || (r.result.mark_commands || []).join(' | ') || '').slice(0, 240) })), upstream }