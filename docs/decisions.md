# Decision log

Decisions about the sdd plugin, each dated and with the evidence it rests
on. Commands and their outputs are quoted verbatim, so a later Claude Code
version can be checked against them. Newest last.

Quoted paths are the one departure from verbatim: they write the author's
home directory as `~` (as `-home-<user>` inside a transcript directory
name, which Claude Code derives from the absolute path), and
`<second config dir>` for a second Claude Code configuration directory in
that home, through which the plugin registry records the superpowers
install path.

## 1. Keep the scoped agent names, the preload and the bare checkpoint (2026-11-09)

On 2026-11-09, on Claude Code 2.1.319, probes in sessions that load this
directory as a plugin showed that the plugin-scoped agent name dispatches,
the cross-plugin skill preload loads, the plugin's `bin/` is on the PATH
of a subagent's Bash tool, and the controller writes its prompt cache with
the 1h TTL its `experimental` block asks for. `sdd:unit-controller` and
`sdd:implementer` were dispatched; `sdd:reviewer` loaded (the debug line
`Loaded 3 agents from plugin sdd`) but was not dispatched. The skill and
its prompts therefore keep dispatching `sdd:implementer`, `sdd:reviewer`
and `sdd:unit-controller`; `agents/unit-controller.md` keeps its `skills`
list (`superpowers:subagent-driven-development`) and its
`experimental.cacheTtl` (`1h`); and a controller runs the checkpoint by
its bare name, `sdd-checkpoint`. None of the phase 1 plan's three
fallbacks was written: no prefixed agent copies from a SessionStart hook,
no agent body that invokes the loop itself, no checkpoint path in the
agent body.

This entry also records a deviation from the spec's layout: the test
scripts keep the names they had in the record (the repository
`akalongman/claude-subagent-apply`, private), `check-*.sh` and `test-*.sh`,
under `tests/`, not the layout line `tests/*.test.sh`. The five scripts
came from the record's `tools/` directory, and its decision log, specs and
plans cite them by those names; renamed, every such citation would point
at no file.

The probes ran headless. The phase 1 acceptance runs `/sdd:apply` in
interactive sessions on both loading legs: one started with
`--plugin-dir` and one with the plugin installed.

### Setup

The two blocks below are parts of one command run before the probes,
which also printed the head of the record's decision log, listed
`~/projects/scratch/` and showed that `sdd-probe` did not exist yet. Each
block quotes its part with that part's own output; the version part's
`echo "exit $?"`, which printed `exit 0`, is left out.

```
$ claude --version
2.1.319 (Claude Code)
```

Before the probes, the checkpoint command was not on the PATH of the shell
that started them, so the bin probe cannot pass on that shell's PATH:

```
$ command -v sdd-checkpoint; echo "command -v exit $?"
command -v exit 1
```

The probe directory is a new git repository with one committed
`README.md`, so `sdd-checkpoint README.md` has a commit to name:

```
$ set -e; mkdir -p ~/projects/scratch/sdd-probe && cd ~/projects/scratch/sdd-probe && git init -q -b main && printf '# sdd-probe\n\nThrowaway repository for the sdd plugin probes of 2026-11-09.\n' > README.md && git add README.md && git commit -q -m "Add the probe README" -- README.md && git log --format='%h %G? %s' && git status --short
fd25fec G Add the probe README
```

Each probe is one headless session (`claude -p`) started from that
directory, with `--plugin-dir` naming this repository. The flags:

- `--permission-mode default`, so the default mode in the user's settings
  does not apply; `--permission-prompts none`, so anything that would
  prompt is denied; `--allowedTools`, naming the only tools the probe
  needs. The 2.1.319 help lists the modes as `acceptEdits`, `auto`,
  `bypassPermissions`, `manual`, `dontAsk` and `plan`; it accepted
  `default`, and every probe transcript records `permissionMode` as
  `default`.
- `--session-id`, which fixes the transcript's file name.
- `env -u` removes the variables that tie a session to the session that
  started it (its id, bridge, messaging socket, entry point and effort), so
  the probe runs as a top-level session.

The transcripts are
`~/.claude/projects/-home-<user>-projects-scratch-sdd-probe/<session id>.jsonl`,
with each subagent's under `<session id>/subagents/`; the debug logs are
`~/.claude/debug/<session id>.txt`. The sessions load the user's own
settings and plugins, including superpowers 7.0.1 from its install path in
the user's plugin registry, and the user's own agents, so each result below
is checked against the subagent type the transcript records.

### Agent name

```
$ cd ~/projects/scratch/sdd-probe && timeout 580 env -u CLAUDECODE -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_CODE_SESSION_ID -u CLAUDE_PID -u CLAUDE_EFFORT claude -p --plugin-dir ~/projects/akalongman/claude-sdd --permission-mode default --permission-prompts none --allowedTools Agent --session-id d3c4eb19-7bed-4d51-9529-aae13684c173 'Dispatch one subagent whose subagent type is exactly `sdd:unit-controller`, with the task "reply with the word ready and nothing else". Use no other subagent type. If the dispatch errors, reply with the error text verbatim and nothing else; otherwise reply with the subagent'"'"'s reply verbatim and nothing else.'; echo "exit $?"
ready
exit 0
```

The transcript: the dispatch's input, the subagent's metadata, the
subagent's reply.

```
$ cd ~/projects/scratch/sdd-probe && t=~/.claude/projects/-home-<user>-projects-scratch-sdd-probe/d3c4eb19-7bed-4d51-9529-aae13684c173 && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .input' $t.jsonl && jq -c '{agentType, isBuiltIn}' $t/subagents/*.meta.json && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' $t/subagents/*.jsonl
{"description":"Probe unit-controller dispatch","subagent_type":"sdd:unit-controller","prompt":"reply with the word ready and nothing else","run_in_background":false}
{"agentType":"sdd:unit-controller","isBuiltIn":false}
"ready"
```

Result: pass. The scoped form `sdd:unit-controller` dispatched on the first
try and ran as the plugin's agent, so the unscoped retry `unit-controller`
was not needed.

### Cross-plugin preload

```
$ cd ~/projects/scratch/sdd-probe && timeout 580 env -u CLAUDECODE -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_CODE_SESSION_ID -u CLAUDE_PID -u CLAUDE_EFFORT claude -p --plugin-dir ~/projects/akalongman/claude-sdd --permission-mode default --permission-prompts none --allowedTools Agent --session-id e6540d2e-c138-4a3d-877f-ab103969d646 'Dispatch one subagent whose subagent type is exactly `sdd:unit-controller`, with the task "name the first heading of the subagent-driven-development skill you have preloaded; if you have none, say none". Use no other subagent type. If the dispatch errors, reply with the error text verbatim and nothing else; otherwise reply with the subagent'"'"'s reply verbatim and nothing else.'; echo "exit $?"
The first heading is "Subagent-Driven Development" (from ~/<second config dir>/plugins/cache/superpowers-marketplace/superpowers/7.0.1/skills/subagent-driven-development/SKILL.md).

This message didn't name a brief, report, ledger, decisions file or overrides file, so I have no unit to run and no return block to fill in. I dispatched nothing and changed no files.

Nothing in flight, safe to close the session.
exit 0
```

The transcript: the dispatched type, the subagent's metadata, the kind of
every user and assistant message of the subagent, in order (no `tool_use`
among them), and the head of the second message, which carries the skill.

```
$ cd ~/projects/scratch/sdd-probe && t=~/.claude/projects/-home-<user>-projects-scratch-sdd-probe/e6540d2e-c138-4a3d-877f-ab103969d646 && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .input.subagent_type' $t.jsonl && jq -c '{agentType, isBuiltIn}' $t/subagents/*.meta.json && jq -c 'select(.type=="user" or .type=="assistant") | [.type, (.message.content | if type=="array" then map(.type) else "text" end)]' $t/subagents/*.jsonl && jq -r 'select(.type=="user") | .message.content | arrays | .[].text' $t/subagents/*.jsonl | head -6
"sdd:unit-controller"
{"agentType":"sdd:unit-controller","isBuiltIn":false}
["user","text"]
["user",["text","text"]]
["assistant",["thinking"]]
["assistant",["text"]]
<command-message>superpowers:subagent-driven-development</command-message>
<command-name>superpowers:subagent-driven-development</command-name>
<skill-format>true</skill-format>
Base directory for this skill: ~/<second config dir>/plugins/cache/superpowers-marketplace/superpowers/7.0.1/skills/subagent-driven-development

# Subagent-Driven Development
```

The installed skill's first heading:

```
$ /bin/grep -m1 '^# ' ~/<second config dir>/plugins/cache/superpowers-marketplace/superpowers/7.0.1/skills/subagent-driven-development/SKILL.md
# Subagent-Driven Development
```

Result: pass. The subagent made no tool call: the heading came from the
skill text injected before its first reply, and the path it cites is that
message's `Base directory` line. The bin probe's debug log, quoted under
`experimental` below, names the preload outright:
`[Agent: sdd:unit-controller] Preloaded skill 'superpowers:subagent-driven-development'`.

### bin on the subagent's PATH

```
$ cd ~/projects/scratch/sdd-probe && timeout 580 env -u CLAUDECODE -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_CODE_SESSION_ID -u CLAUDE_PID -u CLAUDE_EFFORT claude -p --debug --plugin-dir ~/projects/akalongman/claude-sdd --permission-mode default --permission-prompts none --allowedTools Agent 'Bash(sdd-checkpoint:*)' --session-id 4493f49c-94aa-45f6-a2ae-d66b4b207ab3 'Dispatch one subagent whose subagent type is exactly `sdd:unit-controller`, with the task "run `sdd-checkpoint README.md` in your shell and reply with its one output line". Use no other subagent type. If the dispatch errors, reply with the error text verbatim and nothing else; otherwise reply with the subagent'"'"'s reply verbatim and nothing else.'; echo "exit $?"
heads sdd-probe fd25fec; tree 5db26f80ee6e8244

The permission system blocked one check I ran first: `command -v sdd-checkpoint`, which would have shown where the command lives. Running `sdd-checkpoint README.md` itself was allowed, and the line above is its full output. Nothing in flight, safe to close the session.
exit 0
```

The transcript: the subagent's metadata, its two shell commands, their
results (the error flag, and for the denial only the text after `What
required approval: `), and the probe repository's last commit of
`README.md`.

```
$ cd ~/projects/scratch/sdd-probe && t=~/.claude/projects/-home-<user>-projects-scratch-sdd-probe/4493f49c-94aa-45f6-a2ae-d66b4b207ab3 && jq -c '{agentType, isBuiltIn}' $t/subagents/*.meta.json && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .input.command' $t/subagents/*.jsonl && jq -c 'select(.type=="user") | .message.content[]? | select(type=="object" and .type=="tool_result") | [.is_error, (.content | tostring | sub("^.*What required approval: "; ""))]' $t/subagents/*.jsonl && git log --format=%h -- README.md
{"agentType":"sdd:unit-controller","isBuiltIn":false}
"command -v sdd-checkpoint; type sdd-checkpoint"
"sdd-checkpoint README.md"
[true,"This Bash command contains multiple operations. The following part requires approval: command -v sdd-checkpoint"]
[false,"heads sdd-probe fd25fec; tree 5db26f80ee6e8244"]
fd25fec
```

Result: pass. The subagent's lookup lay outside the allowlist and was
denied; the bare `sdd-checkpoint README.md` ran and printed the expected
line, and `fd25fec` is the commit of `README.md` in the probe repository.
The probe covers the Bash tool with sandboxing off (checked on 2026-11-09:
no `sandbox` key in `~/.claude/settings.json` or
`~/.claude/settings.local.json`, no managed settings directory
`/etc/claude-code/`, no sandbox line in the debug log), so a sandboxed
command and the PowerShell tool are untested; and no other installed
plugin ships an `sdd-checkpoint` (none in a plugin cache under
`~/.claude*`, no `sdd` entry in an installed-plugins registry), so the
bare name resolved to this plugin's `bin/`.

### experimental

The bin probe ran with `--debug`, and so did the two controls below. None
of the three logs has a line that names `cacheTtl`, `experimental` or a
cache TTL (`grep -c` prints 0 for each and exits 1). The lines that name
the plugin's agents and the control agent:

```
$ cd ~/.claude/debug && /bin/grep -c -i -E 'cache.?ttl|experimental|ephemeral|\b(5m|1h)\b' 4493f49c-94aa-45f6-a2ae-d66b4b207ab3.txt 7267eefd-00e7-4522-ad96-c8d6ef6864af.txt 7c6bf985-d34d-4633-900a-4a7ab9b1e546.txt; /bin/grep -h -E 'Loaded 3 agents from plugin sdd|\[Agent: |source=agent:custom' 4493f49c-94aa-45f6-a2ae-d66b4b207ab3.txt 7267eefd-00e7-4522-ad96-c8d6ef6864af.txt 7c6bf985-d34d-4633-900a-4a7ab9b1e546.txt
4493f49c-94aa-45f6-a2ae-d66b4b207ab3.txt:0
7267eefd-00e7-4522-ad96-c8d6ef6864af.txt:0
7c6bf985-d34d-4633-900a-4a7ab9b1e546.txt:0
2026-11-09T14:32:09.687Z [DEBUG] Loaded 3 agents from plugin sdd default directory
2026-11-09T14:32:20.044Z [DEBUG] [Agent: sdd:unit-controller] Preloaded skill 'superpowers:subagent-driven-development'
2026-11-09T14:32:20.088Z [DEBUG] [API REQUEST] /v1/messages x-client-request-id=c5b0d76b-bcb6-4a03-bee2-8fef16662f24 source=agent:custom:sdd:unit-controller
2026-11-09T14:32:24.937Z [DEBUG] [API REQUEST] /v1/messages x-client-request-id=434cf2d3-d441-476c-b4ce-3d4a307d8a80 source=agent:custom:sdd:unit-controller
2026-11-09T14:32:31.386Z [DEBUG] [API REQUEST] /v1/messages x-client-request-id=51560633-5886-42cc-9712-8f704152f1aa source=agent:custom:sdd:unit-controller
2026-11-09T14:33:27.267Z [DEBUG] Loaded 3 agents from plugin sdd default directory
2026-11-09T14:33:36.411Z [DEBUG] [API REQUEST] /v1/messages x-client-request-id=4f53c4d1-be91-49d4-b40c-c579bf167ae1 source=agent:custom:sdd:implementer
2026-11-09T14:35:30.268Z [DEBUG] Loaded 3 agents from plugin sdd default directory
2026-11-09T14:35:35.665Z [DEBUG] [Agent: preload-control] Preloaded skill 'superpowers:subagent-driven-development'
2026-11-09T14:35:35.686Z [DEBUG] [API REQUEST] /v1/messages x-client-request-id=24449cfd-aaad-4923-b251-1f85279460f9 source=agent:custom:preload-control
```

The TTL shows in the transcripts instead: the usage of every response
splits the tokens written to the prompt cache into
`ephemeral_1h_input_tokens` and `ephemeral_5m_input_tokens`. The main
session writes 1h entries in every probe, whatever it dispatches, so two
controls ran beside the controller: `sdd:implementer`, a plugin agent with
neither `skills:` nor `experimental`, and `preload-control`, a session
agent defined with `--agents` that carries the controller's `skills:`
preload and no `experimental`.

```
$ cd ~/projects/scratch/sdd-probe && timeout 580 env -u CLAUDECODE -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_CODE_SESSION_ID -u CLAUDE_PID -u CLAUDE_EFFORT claude -p --debug --plugin-dir ~/projects/akalongman/claude-sdd --permission-mode default --permission-prompts none --allowedTools Agent --session-id 7267eefd-00e7-4522-ad96-c8d6ef6864af 'Dispatch one subagent whose subagent type is exactly `sdd:implementer`, with the task "reply with the word ready and nothing else". Use no other subagent type. If the dispatch errors, reply with the error text verbatim and nothing else; otherwise reply with the subagent'"'"'s reply verbatim and nothing else.'; echo "exit $?"
ready
exit 0
$ cd ~/projects/scratch/sdd-probe && timeout 580 env -u CLAUDECODE -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_CODE_SESSION_ID -u CLAUDE_PID -u CLAUDE_EFFORT claude -p --debug --plugin-dir ~/projects/akalongman/claude-sdd --permission-mode default --permission-prompts none --allowedTools Agent --session-id 7c6bf985-d34d-4633-900a-4a7ab9b1e546 --agents '{"preload-control": {"description": "Probe control: the loop preloaded, no experimental block", "prompt": "You answer the task you are given in one line.", "model": "opus", "skills": ["superpowers:subagent-driven-development"]}}' 'Dispatch one subagent whose subagent type is exactly `preload-control`, with the task "reply with the word ready and nothing else". Use no other subagent type. If the dispatch errors, reply with the error text verbatim and nothing else; otherwise reply with the subagent'"'"'s reply verbatim and nothing else.'; echo "exit $?"
ready
exit 0
```

The cache writes of every response, per session, for the main session and
for its one subagent:

```
$ cd ~/.claude/projects/-home-<user>-projects-scratch-sdd-probe && for s in d3c4eb19-7bed-4d51-9529-aae13684c173 e6540d2e-c138-4a3d-877f-ab103969d646 4493f49c-94aa-45f6-a2ae-d66b4b207ab3 7267eefd-00e7-4522-ad96-c8d6ef6864af 7c6bf985-d34d-4633-900a-4a7ab9b1e546; do echo "${s:0:8} main: $(jq -c 'select(.type=="assistant") | [.message.id, .message.usage.cache_creation]' $s.jsonl | sort -u | jq -sc 'map(.[1])')"; echo "${s:0:8} $(jq -r .agentType $s/subagents/*.meta.json): $(jq -c 'select(.type=="assistant") | [.message.id, .message.usage.cache_creation]' $s/subagents/*.jsonl | sort -u | jq -sc 'map(.[1])')"; done
d3c4eb19 main: [{"ephemeral_1h_input_tokens":47513,"ephemeral_5m_input_tokens":0},{"ephemeral_1h_input_tokens":677,"ephemeral_5m_input_tokens":0}]
d3c4eb19 sdd:unit-controller: [{"ephemeral_1h_input_tokens":44050,"ephemeral_5m_input_tokens":0}]
e6540d2e main: [{"ephemeral_1h_input_tokens":47531,"ephemeral_5m_input_tokens":0},{"ephemeral_1h_input_tokens":724,"ephemeral_5m_input_tokens":0}]
e6540d2e sdd:unit-controller: [{"ephemeral_1h_input_tokens":44068,"ephemeral_5m_input_tokens":0}]
4493f49c main: [{"ephemeral_1h_input_tokens":33903,"ephemeral_5m_input_tokens":0},{"ephemeral_1h_input_tokens":778,"ephemeral_5m_input_tokens":0}]
4493f49c sdd:unit-controller: [{"ephemeral_1h_input_tokens":36022,"ephemeral_5m_input_tokens":0},{"ephemeral_1h_input_tokens":3433,"ephemeral_5m_input_tokens":0},{"ephemeral_1h_input_tokens":343,"ephemeral_5m_input_tokens":0}]
7267eefd main: [{"ephemeral_1h_input_tokens":33886,"ephemeral_5m_input_tokens":0},{"ephemeral_1h_input_tokens":635,"ephemeral_5m_input_tokens":0}]
7267eefd sdd:implementer: [{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":29614}]
7c6bf985 main: [{"ephemeral_1h_input_tokens":33917,"ephemeral_5m_input_tokens":0},{"ephemeral_1h_input_tokens":411,"ephemeral_5m_input_tokens":0}]
7c6bf985 preload-control: [{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":36384}]
```

Result: the controller writes 1h entries, as its `experimental` block
asks. Every response of `sdd:unit-controller`, in all three probes, wrote
1h entries only; both controls wrote 5m entries only, the one with the same
preload included, so neither the main session's 1h default nor the preload
alone explains the controller's 1h writes. No plugin agent with the preload
and without `experimental` was run, so the probes do not tell the block
apart from that combination. The debug log says nothing about it; the
transcript usage is where it shows.

## 2. Move the sub-skill pin to superpowers 7.0.2 (2026-11-11)

On 2026-11-11 the pin of `skills/apply/scripts/sub-skill-check`, its two
constants at lines 31 and 32, moved from superpowers 7.0.1 (loop hash
`49e0f5325d56`) to 7.0.2 (loop hash `c95cdd95b49a`), together with the
private copy of that script,
`~/.claude/skills/app-subagent-apply/scripts/sub-skill-check`, and the
release CI installs in `.github/workflows/test.yml`; the machine's
superpowers install moved to 7.0.2 in the same sitting. The procedure is
section 6 of the pin spec in the record repository
(`akalongman/claude-subagent-apply`, private),
`docs/superpowers/specs/2026-10-23-sub-skill-upgrade-content-pin-design.md`,
run a second time; the record's decision 24 is its first run, for 7.0.1.
The plan is `docs/superpowers/plans/2026-11-11-sdd-sub-skill-7-0-2-pin.md`
(`8cbe21e`; plans are no longer tracked, so it is read at that commit).
A candidate copy was compared with the verified one and put through the
controller scenarios before anything on the machine changed; on their
pass the machine upgraded and both pins moved.

### The candidate

`obra/superpowers` tag `v7.0.2`, which peels to commit
`22f0b463e7a5e579904dd6211a520321035526f7`: plugin version `7.0.2`, loop
hash `c95cdd95b49a`, cloned at `~/projects/scratch/superpowers-7.0.2`. The
verified copy before this entry: `7.0.1`, loop `49e0f5325d56`, commit
`2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`.

### The comparison

`b1ec5bc` records it in `tools/green/README.md`, section "Superpowers
7.0.2 (2026-11-11)". Against 7.0.1, eight of the loop's files changed and
one is new, `scripts/sdd-repo`; `code-reviewer.md` is identical. Every
script call in the prose gains "by its absolute path, from the working
tree you're executing in", and the scripts take `-C DIR`, with git
running in the repository `sdd-repo` names. Five probes called the
scripts of both versions by absolute path, from a scratch repository's
root and its detached worktree, and once from outside it.
`sdd-workspace` and `review-package` behaved alike in the root and the
worktree under both versions, and the two versions' review packages were
identical (`cmp`). Run from the installed 7.0.1 copy's skill
directory, which git resolves to the home dotfiles repository, both
versions exited 3 and wrote nothing: they act on that repository and
fail only for want of the probe's commits (the plan's Review Focus 4; no
change was expected and none was made). 7.0.2's `task-brief` no longer
merges a `Task 2b` into `Task 2`'s brief, but a task still ends only at
the next Task heading, so a trailing section stays in the last task's
brief, and the plugin's own `skills/apply/scripts/task-brief` stays.

### The scenario run

`00ba513` and `6da552b` record it, in the same README section and in
`tools/green/2026-11-11-results-7.0.2.json`. Three controller scenarios
ran, one rep each, with `args.sdd` at the candidate, and with this
repository's harness, unit-controller agent and overrides as of
`b1ec5bc`: `S1-fix-small-ctx` and `S16-note-round-reviewed-clean`, which the
candidate's `SKILL.md` sends to `references/fix-loop.md`, and
`S17-final-note-after-fix-wave`, which it sends to
`references/final-review.md`; 7.0.2 changed both files. No check of the
three asserts the rule 7.0.2 changed, the call of each script by its
absolute path: the checks score the controller's resumes, dispatches,
ledger lines and ticks, so that rule rests on the comparison's probes
alone.

The run was emulated, because the workflow tool was switched off in the
session that drove it. The harness,
`tools/green/2026-09-25-unit-controller-workflow.js`, ran under a
recording stand-in for its agent call; each recorded prompt went to its
own fresh subagent on opus, told to answer with one JSON object matching
the recorded schema; and `tools/green/rescore.mjs` scored the answers
with the harness's own checks. This differs from a workflow run in two
ways: the output is not schema-enforced, so a malformed answer fails
rather than being retried, and no effort is set, where the harness asks
for medium. The results file's `logs` entry names this method "decision
R10 of the 7.0.2 pin run"; R10 is a ruling in that run's working files,
which are not committed, and this entry stands for it in this
repository.

```
$ cd ~/projects/akalongman/claude-sdd && jq -c '{agentCount, totalTokens, totalToolCalls, summary: .result.summary}' tools/green/2026-11-11-results-7.0.2.json
{"agentCount":3,"totalTokens":290664,"totalToolCalls":49,"summary":{"S1-fix-small-ctx":{"runs":1,"all_pass":1},"S16-note-round-reviewed-clean":{"runs":1,"all_pass":1},"S17-final-note-after-fix-wave":{"runs":1,"all_pass":1}}}
```

Result: pass. Every check of every scenario passed, `S1-fix-small-ctx` 7
of 7, `S16-note-round-reviewed-clean` 5 of 5,
`S17-final-note-after-fix-wave` 5 of 5, which meets the owner's criterion
of 2026-10-23, one rep with every check passing. The counters are the
three scenario subagents' own figures and nothing of the driving
session's: `totalTokens` 290,664 is 81,003 (S1) + 102,169 (S16) + 107,492
(S17), `totalToolCalls` 49 is 10 + 18 + 21, and `agentCount` is 3. The
split comes from the completion notice the driving session received for
each subagent, which reports its tokens and tool uses; the results file
keeps only the totals. The token figure is not like for like with the
2026-10-23 rate of about 68,000 per scenario (477,785 tokens over seven
scenarios in `tools/green/2026-10-23-results-7.0.1.json`): those agents
ran at the medium effort the harness sets, these at the default.

### The wait

The unit controller's agent definition preloads the sub-skill by name,
so an upgrade under a running apply gives that run's later controllers
the new copy while its ledger names the old one. The update therefore
waited for the apply runs in flight, counting a run as ended by the rule
of the record repository's decision 24 (its newest archive holds the
live ledger, trailing
`Hands-off:` lines aside), with trailing `Driver:` lines set aside too.
The first check found 15 apply ledgers changed in the last seven days,
this run's own among them, and 2 other runs active; ledgers idle for 37
to 134 hours that had grown past their newest archive by post-run
bookkeeping only were counted as ended, on the owner's word. While the 2
finished, 1 new run started and 1 of the 2 reopened after its archive
for a minors fix wave; the update waited for both. At the final check
one more new run was live, and the owner let the update go ahead on the
condition that live sessions do not break.

Before the update, a probe in a throwaway `CLAUDE_CONFIG_DIR`, with a
two-version test plugin installed from a git url source, showed that
`claude plugin update --scope user` keeps the replaced version's folder
byte-unchanged, marks it with an `.orphaned_at` file and prints "Restart
to apply changes". The probe and the update both ran on Claude Code
2.1.322. The installed 7.0.1 copy held `.in_use` files for 17 running
sessions. Sessions open at the update keep 7.0.1 until restarted. The
driving session stayed open across the update (the user-scope entry's
`lastUpdated` is 12:55:32 UTC), and the two agents it started afterwards
that preload the sub-skill, the Task 3 unit controller a minute later
and the final phase's controller 22 minutes later, each loaded it from
the 7.0.1 folder: their transcripts give the skill's base directory as
`.../superpowers/7.0.1/skills/subagent-driven-development`. A session
started after the update reads the registry, which now names 7.0.2.
Until a restart, a
pre-flight that passes a 7.0.1 base directory gets the line marked
unverified, with the warning:

```
$ cd ~/projects/akalongman/claude-sdd && bash skills/apply/scripts/sub-skill-check ~/.claude/plugins/cache/superpowers-marketplace/superpowers/7.0.1/skills/subagent-driven-development; echo "exit $?"
Sub-skill: 7.0.1 loop 49e0f5325d56 unverified (verified: 7.0.2 c95cdd95b49a)
Warning: the loop's files differ from the copy verified with superpowers 7.0.2; this run uses an unverified sub-skill.
exit 0
```

### The update and the installed copy

The plan's compare gate,
`gh api repos/obra/superpowers/compare/v7.0.2...main --jq '[.files[]?.filename | select(startswith("skills/subagent-driven-development/") or . == "skills/requesting-code-review/code-reviewer.md")] | length'`,
found 0 loop files changed, with the comparison's status `identical`, so
the default branch, which the marketplace entry installs because it
names no ref, carried the candidate's loop. Then
`claude plugin marketplace update superpowers-marketplace` moved the
marketplace clone to `5c90728` ("Update superpowers to v7.0.2"), and
`claude plugin update superpowers@superpowers-marketplace`, run with
`--scope user` and, from `~`, with `--scope project`, moved both registry
entries from 7.0.1 to 7.0.2. The 7.0.1 folder stays in the cache, marked
orphaned. Read again before this entry's commit, as one command:

```
$ jq -c '.plugins["superpowers@superpowers-marketplace"][] | {scope, version, gitCommitSha}' ~/.claude/plugins/installed_plugins.json && git -C ~/.claude/plugins/marketplaces/superpowers-marketplace log --format='%h %s' -1
{"scope":"user","version":"7.0.2","gitCommitSha":"22f0b463e7a5e579904dd6211a520321035526f7"}
{"scope":"project","version":"7.0.2","gitCommitSha":"22f0b463e7a5e579904dd6211a520321035526f7"}
5c90728 Update superpowers to v7.0.2
```

`diff -r` of the installed sub-skill directory against the candidate's,
and `diff` of `code-reviewer.md`, printed nothing, and each of the four
Claude Code configuration directories in the home resolved loop
`c95cdd95b49a`. The diff, run again before this entry's commit:

```
$ cd ~/projects/akalongman/claude-sdd && diff -r "$(bash skills/apply/scripts/sub-skill-check --dir)" ~/projects/scratch/superpowers-7.0.2/skills/subagent-driven-development; echo "diff exit $?"; diff "$(bash skills/apply/scripts/sub-skill-check --dir)/../requesting-code-review/code-reviewer.md" ~/projects/scratch/superpowers-7.0.2/skills/requesting-code-review/code-reviewer.md; echo "diff exit $?"
diff exit 0
diff exit 0
```

The registry's install paths ran through `~/<second config dir>` before
the update and now run through the configuration directory the update
ran from; all four configuration directories link one plugins directory,
so the copy is the same whichever path names it.

### The pins

Both copies of `sub-skill-check` now set, at lines 31 and 32:

```
verified_version=7.0.2
verified_loop=c95cdd95b49a
```

Nothing else in either file changed. The private copy is committed in
the dotfiles at `154f038` ("Pin superpowers 7.0.2 in the apply skill's
sub-skill check"), the plugin's copy in this entry's commit. The two are
byte-identical:

```
$ cd ~/projects/akalongman/claude-sdd && cmp skills/apply/scripts/sub-skill-check ~/.claude/skills/app-subagent-apply/scripts/sub-skill-check; echo "cmp exit $?"
cmp exit 0
```

CI's step "Install superpowers at the verified release" moves in the
same commit to `version=7.0.2` and
`commit=22f0b463e7a5e579904dd6211a520321035526f7`, the commit the tag
peels to, fetched by hash because a tag can move; CI's
`test-sub-skill-check` case 7 fails if the fetched copy's hash is not the
pin's.

### Checks

After the edits, on this machine. The plugin's check on the installed
copy, with no warning line:

```
$ cd ~/projects/akalongman/claude-sdd && bash skills/apply/scripts/sub-skill-check; echo "exit $?"
Sub-skill: 7.0.2 loop c95cdd95b49a verified
exit 0
```

The suite; its 63 lines before the totals, every one an `ok` line (one
per check or case, then `ok <name>` per script), are left out:

```
$ cd ~/projects/akalongman/claude-sdd && bash tests/run.sh; echo "exit $?"
9 ok, 0 skipped, 0 failed
exit 0
```

The test of `sub-skill-check`, on the private copy:

```
$ cd ~/projects/akalongman/claude-sdd && bash tests/test-sub-skill-check.sh ~/.claude/skills/app-subagent-apply/scripts/sub-skill-check; echo "exit $?"
ok 1
ok 2
ok 3
ok 4
ok 5
ok 6
ok 7
exit 0
```

shellcheck, which printed nothing:

```
$ cd ~/projects/akalongman/claude-sdd && shellcheck skills/apply/scripts/sub-skill-check; echo "exit $?"
exit 0
```

The client-name check over the repository and the dash check over this
commit's three paths, in the working tree before the commit; `git grep`
exits 1 when nothing matches:

```
$ cd ~/projects/akalongman/claude-sdd && git grep -nIiE -f .superpowers/sdd/2026-11-09-sdd-phase-1-move-the-skill/client-names.pattern -- .; echo "exit $?"
exit 1
$ cd ~/projects/akalongman/claude-sdd && git grep -nP '[\x{2014}\x{2013}]' -- skills/apply/scripts/sub-skill-check .github/workflows/test.yml docs/decisions.md; echo "exit $?"
exit 1
```

Result: pass. The pin, the private copy and the installed copy agree on
7.0.2 and `c95cdd95b49a`.

After the commit, `b6c5ff2` was pushed to `main`, and CI's run on it,
43027577820, ended `success`, its linux job `9 ok, 0 skipped, 0 failed`
on the copy it fetched by commit. The dotfiles commit `154f038` was
pushed on the owner's word.

### Two questions the pin left (2026-11-12)

The run's final review left two questions to the owner, who ruled on
both on 2026-11-12.

**The plugin's version.** `.claude-plugin/plugin.json` keeps
`"version": "0.1.0"` although the pin changed what the plugin does,
because no copy of sdd is installed from a catalog yet. From the first
install from the `akalongman` catalog on, every change meant to reach
installed copies, a pin change included, bumps the version in the same
commit. Claude Code keeps an installed plugin in a directory named by
its version, as the registry shows for superpowers:

```
$ jq -r '.plugins["superpowers@superpowers-marketplace"][] | select(.scope == "user") | .installPath' "<second config dir>/plugins/installed_plugins.json"
<second config dir>/plugins/cache/superpowers-marketplace/superpowers/7.0.2
```

and its update of an npm-sourced plugin (read in Claude Code 2.1.322)
reports the plugin up to date when the fetched version equals the
installed one. The check for a git-sourced plugin was not read; the
bump is safe whichever it is.

**The first real run on 7.0.2.** The record's pin spec audits the first
real apply run on 7.0.1
(`2026-10-23-sub-skill-upgrade-content-pin-design.md` line 296); this
pin's plan has no such step, so the scenario run above is the only
behavioural evidence for 7.0.2. The first archived apply run whose
`Sub-skill:` line reads 7.0.2 is audited the same way, from its archive
and transcript. The watched run that the record's unit-controller plan
waits for (its Task 6) is expected to be that run, so the audit joins
it; none had been archived when this was written:

```
$ grep -l -s -F 'Sub-skill: 7.0.2' ~/.claude*/docs/tmp/apply-runs/*/*/run-facts.md; echo "exit $?"
exit 1
```
