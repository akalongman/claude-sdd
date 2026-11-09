# Decision log

Decisions about the sdd plugin, each dated and with the evidence it rests
on. Commands and their outputs are quoted verbatim, so a later Claude Code
version can be checked against them. Newest last.

## 1. Keep the scoped agent names, the preload and the bare checkpoint (2026-11-09)

On 2026-11-09, on Claude Code 2.1.319, probes in sessions that load this
directory as a plugin showed that the plugin-scoped agent name dispatches,
the cross-plugin skill preload loads, the plugin's `bin/` is on a
subagent's PATH, and the agent's `experimental` block is honoured. The
skill and its prompts therefore keep dispatching `sdd:implementer`,
`sdd:reviewer` and `sdd:unit-controller`; `agents/unit-controller.md` keeps
`skills: [superpowers:subagent-driven-development]` and
`experimental: cacheTtl: 1h`; and a controller runs the checkpoint by its
bare name, `sdd-checkpoint`. None of the phase 1 plan's three fallbacks was
written: no prefixed agent copies from a SessionStart hook, no agent body
that invokes the loop itself, no checkpoint path in the agent body.

This entry also records a deviation from the spec's layout: the test
scripts keep the record's names (`check-*.sh`, `test-*.sh`) under `tests/`,
not the layout line `tests/*.test.sh`. The five scripts came from the
record's `tools/` directory, and the record's decision log, specs and plans
cite them by those names; renamed, every such citation would point at no
file.

The probes ran headless. Interactive sessions are exercised by the phase 1
acceptance, which runs after the phase 1 run's archive.

### Setup

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
$ set -e; mkdir -p /home/longman/projects/scratch/sdd-probe && cd /home/longman/projects/scratch/sdd-probe && git init -q -b main && printf '# sdd-probe\n\nThrowaway repository for the sdd plugin probes of 2026-11-09.\n' > README.md && git add README.md && git commit -q -m "Add the probe README" -- README.md && git log --format='%h %G? %s' && git status --short
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
`~/.claude/projects/-home-longman-projects-scratch-sdd-probe/<session id>.jsonl`,
with each subagent's under `<session id>/subagents/`; the debug logs are
`~/.claude/debug/<session id>.txt`. The sessions load the user's own
settings and plugins, including superpowers 7.0.1 from its install path in
the user's plugin registry, and the user's own agents, so each result below
is checked against the subagent type the transcript records.

### Agent name

```
$ cd /home/longman/projects/scratch/sdd-probe && timeout 580 env -u CLAUDECODE -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_CODE_SESSION_ID -u CLAUDE_PID -u CLAUDE_EFFORT claude -p --plugin-dir ~/projects/akalongman/claude-sdd --permission-mode default --permission-prompts none --allowedTools Agent --session-id d3c4eb19-7bed-4d51-9529-aae13684c173 'Dispatch one subagent whose subagent type is exactly `sdd:unit-controller`, with the task "reply with the word ready and nothing else". Use no other subagent type. If the dispatch errors, reply with the error text verbatim and nothing else; otherwise reply with the subagent'"'"'s reply verbatim and nothing else.'; echo "exit $?"
ready
exit 0
```

The transcript: the dispatch's input, the subagent's metadata, the
subagent's reply.

```
$ cd ~/projects/scratch/sdd-probe && t=~/.claude/projects/-home-longman-projects-scratch-sdd-probe/d3c4eb19-7bed-4d51-9529-aae13684c173 && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .input' $t.jsonl && jq -c '{agentType, isBuiltIn}' $t/subagents/*.meta.json && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' $t/subagents/*.jsonl
{"description":"Probe unit-controller dispatch","subagent_type":"sdd:unit-controller","prompt":"reply with the word ready and nothing else","run_in_background":false}
{"agentType":"sdd:unit-controller","isBuiltIn":false}
"ready"
```

Result: pass. The scoped form `sdd:unit-controller` dispatched on the first
try and ran as the plugin's agent, so the unscoped retry `unit-controller`
was not needed.

### Cross-plugin preload

```
$ cd /home/longman/projects/scratch/sdd-probe && timeout 580 env -u CLAUDECODE -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_CODE_SESSION_ID -u CLAUDE_PID -u CLAUDE_EFFORT claude -p --plugin-dir ~/projects/akalongman/claude-sdd --permission-mode default --permission-prompts none --allowedTools Agent --session-id e6540d2e-c138-4a3d-877f-ab103969d646 'Dispatch one subagent whose subagent type is exactly `sdd:unit-controller`, with the task "name the first heading of the subagent-driven-development skill you have preloaded; if you have none, say none". Use no other subagent type. If the dispatch errors, reply with the error text verbatim and nothing else; otherwise reply with the subagent'"'"'s reply verbatim and nothing else.'; echo "exit $?"
The first heading is "Subagent-Driven Development" (from /home/longman/.claude2/plugins/cache/superpowers-marketplace/superpowers/7.0.1/skills/subagent-driven-development/SKILL.md).

This message didn't name a brief, report, ledger, decisions file or overrides file, so I have no unit to run and no return block to fill in. I dispatched nothing and changed no files.

Nothing in flight, safe to close the session.
exit 0
```

The transcript: the dispatched type, the subagent's metadata, the kind of
every message the subagent saw or wrote, in order (no `tool_use` among
them), and the head of the second message, which carries the skill.

```
$ cd ~/projects/scratch/sdd-probe && t=~/.claude/projects/-home-longman-projects-scratch-sdd-probe/e6540d2e-c138-4a3d-877f-ab103969d646 && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .input.subagent_type' $t.jsonl && jq -c '{agentType, isBuiltIn}' $t/subagents/*.meta.json && jq -c 'select(.type=="user" or .type=="assistant") | [.type, (.message.content | if type=="array" then map(.type) else "text" end)]' $t/subagents/*.jsonl && jq -r 'select(.type=="user") | .message.content | arrays | .[].text' $t/subagents/*.jsonl | head -6
"sdd:unit-controller"
{"agentType":"sdd:unit-controller","isBuiltIn":false}
["user","text"]
["user",["text","text"]]
["assistant",["thinking"]]
["assistant",["text"]]
<command-message>superpowers:subagent-driven-development</command-message>
<command-name>superpowers:subagent-driven-development</command-name>
<skill-format>true</skill-format>
Base directory for this skill: /home/longman/.claude2/plugins/cache/superpowers-marketplace/superpowers/7.0.1/skills/subagent-driven-development

# Subagent-Driven Development
```

The installed skill's first heading:

```
$ /bin/grep -m1 '^# ' /home/longman/.claude2/plugins/cache/superpowers-marketplace/superpowers/7.0.1/skills/subagent-driven-development/SKILL.md
# Subagent-Driven Development
```

Result: pass. The subagent made no tool call: the heading came from the
skill text injected before its first reply, and the path it cites is that
message's `Base directory` line. The bin probe's debug log, quoted under
`experimental` below, names the preload outright:
`[Agent: sdd:unit-controller] Preloaded skill 'superpowers:subagent-driven-development'`.

### bin on the subagent's PATH

```
$ cd /home/longman/projects/scratch/sdd-probe && timeout 580 env -u CLAUDECODE -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_CODE_SESSION_ID -u CLAUDE_PID -u CLAUDE_EFFORT claude -p --debug --plugin-dir ~/projects/akalongman/claude-sdd --permission-mode default --permission-prompts none --allowedTools Agent 'Bash(sdd-checkpoint:*)' --session-id 4493f49c-94aa-45f6-a2ae-d66b4b207ab3 'Dispatch one subagent whose subagent type is exactly `sdd:unit-controller`, with the task "run `sdd-checkpoint README.md` in your shell and reply with its one output line". Use no other subagent type. If the dispatch errors, reply with the error text verbatim and nothing else; otherwise reply with the subagent'"'"'s reply verbatim and nothing else.'; echo "exit $?"
heads sdd-probe fd25fec; tree 5db26f80ee6e8244

The permission system blocked one check I ran first: `command -v sdd-checkpoint`, which would have shown where the command lives. Running `sdd-checkpoint README.md` itself was allowed, and the line above is its full output. Nothing in flight, safe to close the session.
exit 0
```

The transcript: the subagent's metadata, its two shell commands, their
results (the error flag, and for the denial only the text after `What
required approval: `), and the probe repository's last commit of
`README.md`.

```
$ cd ~/projects/scratch/sdd-probe && t=~/.claude/projects/-home-longman-projects-scratch-sdd-probe/4493f49c-94aa-45f6-a2ae-d66b4b207ab3 && jq -c '{agentType, isBuiltIn}' $t/subagents/*.meta.json && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .input.command' $t/subagents/*.jsonl && jq -c 'select(.type=="user") | .message.content[]? | select(type=="object" and .type=="tool_result") | [.is_error, (.content | tostring | sub("^.*What required approval: "; ""))]' $t/subagents/*.jsonl && git log --format=%h -- README.md
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
$ cd /home/longman/projects/scratch/sdd-probe && timeout 580 env -u CLAUDECODE -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_CODE_SESSION_ID -u CLAUDE_PID -u CLAUDE_EFFORT claude -p --debug --plugin-dir ~/projects/akalongman/claude-sdd --permission-mode default --permission-prompts none --allowedTools Agent --session-id 7267eefd-00e7-4522-ad96-c8d6ef6864af 'Dispatch one subagent whose subagent type is exactly `sdd:implementer`, with the task "reply with the word ready and nothing else". Use no other subagent type. If the dispatch errors, reply with the error text verbatim and nothing else; otherwise reply with the subagent'"'"'s reply verbatim and nothing else.'; echo "exit $?"
ready
exit 0
$ cd /home/longman/projects/scratch/sdd-probe && timeout 580 env -u CLAUDECODE -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_CODE_SESSION_ID -u CLAUDE_PID -u CLAUDE_EFFORT claude -p --debug --plugin-dir ~/projects/akalongman/claude-sdd --permission-mode default --permission-prompts none --allowedTools Agent --session-id 7c6bf985-d34d-4633-900a-4a7ab9b1e546 --agents '{"preload-control": {"description": "Probe control: the loop preloaded, no experimental block", "prompt": "You answer the task you are given in one line.", "model": "opus", "skills": ["superpowers:subagent-driven-development"]}}' 'Dispatch one subagent whose subagent type is exactly `preload-control`, with the task "reply with the word ready and nothing else". Use no other subagent type. If the dispatch errors, reply with the error text verbatim and nothing else; otherwise reply with the subagent'"'"'s reply verbatim and nothing else.'; echo "exit $?"
ready
exit 0
```

The cache writes of every response, per session, for the main session and
for its one subagent:

```
$ cd ~/.claude/projects/-home-longman-projects-scratch-sdd-probe && for s in d3c4eb19-7bed-4d51-9529-aae13684c173 e6540d2e-c138-4a3d-877f-ab103969d646 4493f49c-94aa-45f6-a2ae-d66b4b207ab3 7267eefd-00e7-4522-ad96-c8d6ef6864af 7c6bf985-d34d-4633-900a-4a7ab9b1e546; do echo "${s:0:8} main: $(jq -c 'select(.type=="assistant") | [.message.id, .message.usage.cache_creation]' $s.jsonl | sort -u | jq -sc 'map(.[1])')"; echo "${s:0:8} $(jq -r .agentType $s/subagents/*.meta.json): $(jq -c 'select(.type=="assistant") | [.message.id, .message.usage.cache_creation]' $s/subagents/*.jsonl | sort -u | jq -sc 'map(.[1])')"; done
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

Result: honoured. Every response of `sdd:unit-controller`, in all three
probes, wrote 1h entries only; both controls wrote 5m entries only, the one
with the same preload included, so the 1h TTL follows the `experimental`
block and not the preload. The debug log says nothing about it; the
transcript usage is where it shows.
