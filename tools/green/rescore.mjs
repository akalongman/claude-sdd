// rescore.mjs: rerun a scenario harness's checks on the answers a results file recorded, with no agent call.
// Usage: node tools/green/rescore.mjs HARNESS RESULTS_JSON [KEY...]
//   HARNESS is a workflow script such as 2026-09-25-unit-controller-workflow.js, wrapped as its syntax check wraps it.
//   RESULTS_JSON is a run record; its .result.green holds the answers. With no KEY every scenario it records is rescored.
//   The stub agent returns the recorded answer for each green:<key>:<rep> label, and args.sdd is a fixed placeholder,
//   since the sub-skill directory only enters the prompt text. Prints one line per recorded answer, in the file's
//   order: <key> <checks as compact JSON>.
// Exit status: 0 when every selected answer was rescored; 1 when a KEY has no recorded answer or the harness has no
//   scenario for a recorded one (named on stderr); 2 on a usage error.
import { readFileSync } from 'node:fs'

const [harnessPath, resultsPath, ...keys] = process.argv.slice(2)
if (!resultsPath) {
  console.error('usage: node rescore.mjs HARNESS RESULTS_JSON [KEY...]')
  process.exit(2)
}
const source = readFileSync(harnessPath, 'utf8').replace(/^export /, '')
const recorded = JSON.parse(readFileSync(resultsPath, 'utf8')).result.green
const only = keys.length ? keys : [...new Set(recorded.map(g => g.scenario))]
const answers = recorded.filter(g => only.includes(g.scenario))
const label = (key, rep) => `green:${key}:${rep}`
const byLabel = new Map(answers.map(g => [label(g.scenario, g.rep), g.result]))

const body = new Function(`return async function body(args, agent, parallel, phase) {\n${source}\n}`)()
const agent = async (prompt, options) => byLabel.has(options.label) ? byLabel.get(options.label) : null
const parallel = thunks => Promise.all(thunks.map(thunk => thunk()))
const reps = Math.max(1, ...answers.map(g => g.rep))
const { green } = await body({ sdd: '/placeholder/sub-skill', only, reps }, agent, parallel, () => {})
const scored = new Map(green.map(g => [label(g.scenario, g.rep), g.checks]))

const problems = [
  ...only.filter(key => !answers.some(g => g.scenario === key)).map(key => `no recorded answer for ${key}`),
  ...answers.filter(g => !scored.has(label(g.scenario, g.rep))).map(g => `the harness has no scenario ${g.scenario}`),
]
for (const g of answers) {
  const id = label(g.scenario, g.rep)
  if (scored.has(id)) console.log(g.scenario, JSON.stringify(scored.get(id)))
}
for (const problem of problems) console.error(`rescore: ${problem}`)
process.exitCode = problems.length ? 1 : 0
