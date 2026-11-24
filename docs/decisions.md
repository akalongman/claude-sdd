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

### The first run on 7.0.2, audited (2026-11-13)

The audit the section above asks for, made on 2026-11-13 with the four
checks of the record's pin spec (line 296). The run is the earliest
archive whose `Sub-skill:` line reads 7.0.2: an apply run of the private
skill on an eight-task superpowers plan in a private repository, run on
2026-11-12 from 20:23 to 23:37 UTC, before the acceptance of entry 3.
Times below are UTC, from the transcripts. The driver's transcript and
the eight unit controllers' transcripts were searched for reads of the
reference files in shell commands as well as in file reads, and every
call was listed for the windows where a read was missing: the driver
read `preflight.md` with `cat`, and one controller read its prompt
templates with `cat` from inside the sub-skill's directory, so a search
for file reads alone would have missed both. The record's own audit of the first
7.0.1 run was never written up (its decision 24 still lists it as open),
so this is the first audit of its kind on file.

1. **The `Sub-skill:` line.** Ledger line 2 and the archive's
   `run-facts.md` both read `Sub-skill: 7.0.2 loop c95cdd95b49a verified`;
   the driver ran `sub-skill-check` on the installed
   `skills/subagent-driven-development`, the sub-skill's own directory.
   Met.
2. **The pre-flight.** The driver loaded the sub-skill at 20:23:24,
   printed `references/preflight.md` at 20:23:40 (all 1,353 bytes of the
   file appear verbatim in that call's output) and dispatched Task 1's
   controller at 20:27:07. The record's check looks for the scan's rows
   in `<workspace>/decisions.md`; 7.0.2's `preflight.md` says "Write the
   table to the ledger", and the run did: the ledger's
   `## Pre-flight scan` table has 22 rows, 14 for pairs of tasks and one
   for each of the eight tasks, 11 of them naming a gap or a ruling. The
   twelve pre-flight rulings are ledgered and written in full in
   `decisions.md`, beside one `depends on` line per task. Met.
3. **`fix-loop.md` before each fix round.** Four fix rounds ran inside
   units. Before three of them (Task 1 round 1, Task 3 round 1, Task 6
   round 1) the controller read `references/fix-loop.md` 30, 48 and 55
   seconds before resuming its implementer. Before Task 1's round 2 it
   did not read it again, which the sub-skill's `SKILL.md` line 303 asks
   for ("Read it again before every round, even if you read it earlier
   in this session"). Round 1's re-review left one Important finding open
   like for like, the controller returned `needs-ruling`, and 20 seconds
   after the driver's ruling woke it, it resumed the implementer for
   round 2. Its context had not been compacted (the transcript holds no
   compaction marker), so the text read at 20:42:47 for round 1 was still
   in it, and round 2's ledger lines take `fix-loop.md`'s forms
   (`Task 1: fix round 2/5 (2 addressed, 0 open: NEW1 and M2; commits 239ec05..d2e724d)`).
   Met in purpose, missed in letter: the re-read guards against a loop
   remembered across a compaction, and none happened.
4. **`final-review.md` in the final phase.** The final phase's
   controller read `references/final-review.md` at 23:01:13, 12 seconds
   after it started and right after the overrides, the brief and the
   ledger, before the whole-branch review's dispatch (23:02:58, on `fable`)
   and the fix wave (23:18:22), which that file governs. Met.

The audit closes this section's second question. 7.0.2's loop ran as the
scenario run above predicted, and the pin stands. The one lapse, a
controller woken in the middle of its fix loop dispatching the next
round without reading the loop again, costs nothing while its context is
whole; it would matter only for a controller compacted while it waited
for a ruling, and no run has shown that yet.

## 3. Accept the plugin in throwaway configuration directories, before phase 2 (2026-11-13)

On 2026-11-13 the plugin passed its acceptance on Claude Code 2.1.323,
before phase 2 was built. That order is the owner's ruling of the same
day: the acceptance runs first, in throwaway configuration directories,
with nothing removed from the owner's setup; removing the private copy,
changing the owner's routing to `/sdd:apply` and installing the plugin
on the machine wait until phase 2's own run has archived. For the
acceptance this replaces the owner's ruling of 2026-11-12, which put
phase 2 first. The procedure is the closing section of the phase 1 plan
(`docs/superpowers/plans/2026-11-09-sdd-phase-1-move-the-skill.md`, read
at `4661dab^`), corrected after two independent reviews of the draft
design; each of their claims was checked against the files before it
changed a step. The evidence (archives, transcripts, debug logs) stays
local, in `~/projects/scratch/sdd-acceptance-evidence`.

### The setup

**Fixture.** `~/projects/scratch/sdd-acceptance`, a git repository
holding a bash command `bin/greet`, its tests and one OpenSpec change,
`add-greet-options` (stock `spec-driven` schema), with two sections of
executable work: `## 1. Greet a name` and `## 2. Shout`. A text-only
fixture would test nothing, because the skill keeps prose-only edits in
the driver and dispatches no controller for them (`skills/apply/SKILL.md`
line 23). Every item names its files, because a pausing controller runs
`sdd-checkpoint` on the brief's file list and an OpenSpec brief carries
none (parked as a finding). The base commit is tagged `acceptance-base`
(`bd7590e`).

**Configuration.** `CLAUDE_CONFIG_DIR` pointed at
`~/projects/scratch/sdd-acceptance-config`, whose settings began as
`{"permissions": {"defaultMode": "auto"}, "skipAutoPermissionPrompt": true}`
alone, with superpowers installed into it. Its marketplace entry has no git
ref, so an install takes `main` as it is; that day `main` was
`22f0b463e7a5e579904dd6211a520321035526f7`, the commit tag `v7.0.2`
peels to, and the pin check read it as the verified release:

```
$ CLAUDE_CONFIG_DIR=~/projects/scratch/sdd-acceptance-config bash skills/apply/scripts/sub-skill-check
Sub-skill: 7.0.2 loop c95cdd95b49a verified
```

**Leg 1** loaded the plugin with `--plugin-dir` from an export of
`origin/main` at `9fc7a0b`, not from the checkout, which another session
was editing at the time. **Leg 2** installed it from the public catalog:
`claude plugin marketplace add akalongman/claude-plugins`, then
`claude plugin install sdd@akalongman`, which recorded
`"gitCommitSha":"9fc7a0bdfbeb40e7988a2979af6b56e7e097af6d"`; its
`.claude-plugin`, `agents`, `bin` and `skills` are identical to leg 1's
export (`diff -rq`, no output).

### What a throwaway configuration directory hides

It hides the owner's skills, agents and plugins, and not the owner's
instruction files: Claude Code reads `~/.claude/CLAUDE.md` and
`~/.claude/rules/*.md` as the project instructions of `~`, an ancestor
of the fixture, whatever `CLAUDE_CONFIG_DIR` says. The session's own
init record, for leg 2:

```
$ cd ~/projects/scratch/sdd-acceptance && CLAUDE_CONFIG_DIR=~/projects/scratch/sdd-acceptance-config claude -p --output-format stream-json --verbose "Reply with the single word ok." > leg2-init.ndjson
$ jq -c 'select(.type=="system" and .subtype=="init") | {claude_code_version, permissionMode, plugins: [.plugins[] | select(.path != "builtin")], agents: [.agents[] | select(test("sdd|app-"))], skills: [.skills[] | select(test("sdd|app-"))]}' leg2-init.ndjson
{"claude_code_version":"2.1.323","permissionMode":"auto","plugins":[{"name":"superpowers","path":"~/projects/scratch/sdd-acceptance-config/plugins/cache/superpowers-marketplace/superpowers/7.0.2","source":"superpowers@superpowers-marketplace","version":"7.0.2"},{"name":"sdd","path":"~/projects/scratch/sdd-acceptance-config/plugins/cache/akalongman/sdd/0.1.0","source":"sdd@akalongman","version":"0.1.0"}],"agents":["sdd:implementer","sdd:reviewer","sdd:unit-controller"],"skills":["sdd:apply"]}
```

No transcript of either leg, sessions and subagents alike, names
`app-subagent-apply`, an `app-sdd-` agent or a path under the private
skill's directory. The only paths under `~/.claude` in them are the
instruction files above. Those files still route apply work to the
private skill, so both legs were launched with `/sdd:apply` by name.

### Leg 1: a pause, a lost session and a relaunch

The owner typed `pause` while Section 2's implementer ran, quit the
session once both pause lines were written, and relaunched
`/sdd:apply add-greet-options` in a new session. The ledger, in order:

```
Section 2: handed to controller
Section 2: pause requested
Section 2: paused (before review dispatch; heads sdd-acceptance 8d5e69e; tree 5db26f80ee6e8244)
Section 2: controller returned paused (before review dispatch; implementer done at 8d5e69e)
Section 2: pause released
Section 2: handed to controller
Section 2: resumed (checkpoint unchanged: heads sdd-acceptance 8d5e69e; tree 5db26f80ee6e8244)
```

The relaunch counted as the owner's `continue`, and the second dispatch
carried the prior-attempt framing ("A prior controller attempted this
unit"). The final review (on `claude-fable-5-2`) returned one Important
finding as `needs-ruling`; the owner kept the behaviour and had it
pinned by a test, and a fix wave and a re-review ended in
`Final phase: complete 594fab9`.

### Leg 2: `step`, then a pause and a continue in the same session

The run was launched as `/sdd:apply add-greet-options step`; after
Section 1 it waited for the owner's answer before dispatching Section 2.
The owner typed `pause`, then `continue` in the same session:

```
Section 2: pause requested
Section 2: paused (after implementer report, before task review dispatch; heads sdd-acceptance 02895c8; tree 5db26f80ee6e8244)
Section 2: controller returned paused (after implementer report 02895c8 DONE_WITH_CONCERNS, before task review dispatch)
Section 2: pause released
Section 2: resumed
```

Here the driver resumed the same controller by message, with no second
dispatch: the driver's transcript holds three unit-controller dispatches
(Section 1, Section 2, the final phase) and one message, "Resume from
your paused point." The final review found nothing Critical or
Important, and the run ended in `Final phase: complete 02895c8`. Before
it, `/sdd:apply add-greet-options hands-off tier=sonnet isolated` was
announced with all three options and stopped before any worktree,
branch or dispatch, the fixture having no worktree bootstrap.

The `tree` part of a checkpoint hashes only uncommitted changes on the
listed files (`git diff HEAD`, `git status` and the untracked files);
both legs paused on a clean tree, hence the same hash over different
heads.

### Both legs

Every dispatch named its agent and model: `sdd:unit-controller`,
`sdd:implementer` and `sdd:reviewer` on `opus`, and the final review on
`fable`, which resolved to `claude-fable-5-2`. The controllers preloaded
the loop from the throwaway directory's
`plugins/cache/superpowers-marketplace/superpowers/7.0.2`. The first
dispatch of leg 1 carried paths only:

```
Run one unit of the OpenSpec change add-greet-options in ~/projects/scratch/sdd-acceptance (commit on main, path-limited).

Unit: Section 1
Brief: ~/projects/scratch/sdd-acceptance/.superpowers/sdd/add-greet-options/section-1-brief.md
Report: ~/projects/scratch/sdd-acceptance/.superpowers/sdd/add-greet-options/section-1-report.md
Review: ~/projects/scratch/sdd-acceptance/.superpowers/sdd/add-greet-options/section-1-review.md
Ledger: ~/projects/scratch/sdd-acceptance/.superpowers/sdd/add-greet-options/progress.md
Decisions: ~/projects/scratch/sdd-acceptance/.superpowers/sdd/add-greet-options/decisions.md
Overrides: ~/projects/scratch/sdd-plugin-9fc7a0b/skills/apply/prompts/unit-controller-overrides.md
Tick command: ~/projects/scratch/sdd-plugin-9fc7a0b/skills/apply/scripts/openspec-section-tick add-greet-options 1 '<ledger line>' [ids]
```

Each archive's `run-facts.md` hashes the skill that ran, and the hashes
are those of the loaded copy, not of the private one:

```
Skill: SKILL.md 6cab9ac5d1f4, unit-controller-overrides.md 92597bb89358
Sub-skill: 7.0.2 loop c95cdd95b49a verified
```

`run-archive` parked leg 1's one handed item into the fixture's own
queue (`Parked: line 60: owner (a later OpenSpec change): ...`). A copy
of that workspace with one more `Handed to later:` line, archived with
`later` taken off `PATH`, printed (shortened here)
`not parked (later not on PATH): (cd '~/projects/scratch/sdd-acceptance' && later -- 'Later: probe item ...')`,
exited 0 and printed its archive path last.

A probe settled a doubt the transcripts raised: some controllers called
`sdd-checkpoint` by its full path, yet the command is on the `PATH` of
the main session and of a subagent with the installed plugin, and of a
subagent with `--plugin-dir`, as entry 1 found on 2.1.319.

### What this entry rules

**Removal before the run.** Spec decision 13 and the spec's phase 1
acceptance item 2 ask for the private copy "already removed" during the
acceptance, so that a leftover copy cannot mask a broken name or path.
Proven isolation meets that purpose without breaking the apply runs
other sessions had in flight on the private copy; the spec's wording is
amended to it in a later revision.

**The version rule of entry 2.** The installs of a throwaway
configuration directory are not "the first install from the
`akalongman` catalog"; the rule starts at the machine's own install.

**The machine's install.** When the switch comes, the machine installs
the plugin as `sdd@personal`, an entry of the owner's `personal`
marketplace with the source `{"source": "github", "repo":
"akalongman/claude-sdd"}`, because the local name `akalongman` stays
with laterbox's checkout until laterbox moves to the public catalog,
whose timing is open. That later move to `sdd@akalongman` is a
migration, not a rename: the plugin's data folder, its settings keys and
any terminal link through that folder change with it, so it is
rehearsed in a throwaway configuration directory first. The personal
marketplace's cross-marketplace allowlist gains `superpowers-marketplace`
before that install.

**`isolated` without a bootstrap.** Today the skill stops when the
project has no worktree bootstrap script. The ruling: without one, the
driver creates the worktree bare and runs the project's gates in it
once, before the first dispatch; when they pass, or the project defines
none, the run goes on and the ledger says the worktree is bare; when
they fail, the driver removes that worktree and its branch and stops,
naming the missing bootstrap. `hands-off` follows the same rule. A
project with a bootstrap is unchanged. Not built yet.

**The first-run audit of entry 2.** An apply run of the private skill
archived on 2026-11-13, before the acceptance, already reads
`Sub-skill: 7.0.2 loop c95cdd95b49a verified`, so that audit belongs to
it, not to the acceptance.

### Not covered

`step`'s stop answer; `hands-off` past its announcement (the fixture
has no remote, so its push and request were never reached); `tier=`
past parsing; the launch with no argument; and a comparison of the
dispatch payload with one recorded before the move, which the payload
above was checked against the skill's text instead.

## 4. Settle the noask hooks' unknowns (2026-11-15)

```
$ claude --version
2.1.325 (Claude Code)
```

Every probe below ran on that build; every record of the probes'
transcripts that names a version names that one:

```
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && jq -r '.version // empty' *.jsonl */subagents/*.jsonl | sort | uniq -c
    892 2.1.325
```

On 2026-11-15 the probes of Task 1 of the phase 2 plan (a local working
document) ran in interactive sessions on a throwaway probe plugin,
`noaskprobe`, to settle the eleven values that its Tasks 2 to 8 and 10
read. The main finding is one the plan has no branch for. On the account
the probes ran on, which belongs to a Team organization, Claude Code's
built-in security default plugin, `cc-plugin-sec-default`, is seated
outermost and passes over every `classic.*` hook of a hooks module a
person installs, a `--plugin-dir` module included. The probe module's
`classic.Stop`, `classic.PermissionRequest`, `classic.Elicitation`,
`classic.SessionStart` and `classic.PostToolUse` hooks never ran in any
probe; its `tool.call` and `session.start` hooks ran every time. Three
values therefore take the plan's branch that stops for the owner (P2, P4,
P6), two have no reading in the form the plan states (P3, P5), and six
read as the plan expects (P1, P7, P8, P9, P10, P11), P9 and P10 each with
a subagent case unobserved.

The words used for the outcomes below:

- **Passed over**: the engine ran what lies beneath a module's hook
  without running the hook, and said so in a transcript notice,
  `<plugin>: its <event> hook was skipped. "cc-plugin-sec-default" runs first and sent the event on past it.`
- **Expected**: the value reads as the "Expected" column of the plan's
  Step 11 table.
- **Stop for the owner**: the table's branch in which the tasks that read
  the value wait until the owner amends the spec or the plan. For such a
  value nothing was changed and no fix was chosen.
- **Not measured**: the probe ran as written, but what it measures never
  happened, so the value has no reading in the form the plan gives it.

### Setup

The probe repository, a new git repository with one committed
`README.md`; the empty `run/` beside it is the module's, below:

```
$ set -e; mkdir -p ~/projects/scratch/sdd-probe-2 && cd ~/projects/scratch/sdd-probe-2 && git init -q -b main && printf '# sdd-probe-2\n\nThrowaway repository for the noask probes of the sdd plugin, 2026-11-15.\n' > README.md && git add README.md && git commit -q -m "Add the probe README" -- README.md && mkdir run && git log --format='%h %G? %s' && git status --short --untracked-files=all
f7ab02c G Add the probe README
```

The probe plugin, `~/projects/scratch/sdd-probe-plugin`, is never
committed and stays for the owner. `.claude-plugin/plugin.json` names it
`noaskprobe`. `hooks/hooks.json` holds a SessionStart command hook
(matcher `startup|resume|clear|compact|fork`) that runs
`scripts/session-start.sh`, and the module `./register.ts`. The script
appends its stdin as one line to `start.log` in its working directory and
prints
`{"systemMessage":"noaskprobe: visible on <source>","hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"noaskprobe context line 7391"}}`.
`mcp/ask-server.mjs` is probe D's stdio MCP server, plain Node with no
dependency, loaded only through `mcp.json` with `--mcp-config`. The module
logs one JSON line per event to `probe.log` in the session's working
directory, with the fields of the plan's table plus `at` (the time) and
`ev` (the event; `tool.call:Bash` and `tool.call:question` name the two
matched `tool.call` hooks), and reads its mode from the file `probe-mode`
there. Two choices are the module's own: `$.fs` has no append, so the
module rewrites `probe.log` whole, one write after another; and its
`session.start` runs `scripts/session-start.sh` by its path, with the line
`{"hook_event_name":"probe","source":"process.run"}` on standard input and
`run/` as its working directory, so that line lands in `run/start.log`
and `start.log` holds the hook's lines alone.

Step 1's check. The 23 lines between `env reads: HOME` and the result,
the plugin-directory checks (a missing README, LICENSE and icon, which
only a catalog submission needs), are left out:

```
$ claude plugin validate ~/projects/scratch/sdd-probe-plugin; echo "exit $?"
Validating plugin manifest: ~/projects/scratch/sdd-probe-plugin/.claude-plugin/plugin.json

⚠ Found 1 warning:

  ❯ author: No author information provided. Consider adding author details for plugin attribution

Validating hooks: ~/projects/scratch/sdd-probe-plugin/hooks/hooks.json

  ❯ ./register.ts hooks: tool.call, tool.call{tool=AskUserQuestion|ExitPlanMode}, tool.call{tool=Bash}, classic.Stop, classic.PermissionRequest, classic.Elicitation, classic.SessionStart, classic.PostToolUse{tool_name=Bash}, session.start
  ❯ ./register.ts gating hook without .catch: tool.call
  ❯ ./register.ts gating hook without .catch: tool.call{tool=AskUserQuestion|ExitPlanMode}
  ❯ ./register.ts gating hook without .catch: tool.call{tool=Bash}
  ❯ ./register.ts gating hook without .catch: classic.Stop
  ❯ ./register.ts gating hook without .catch: classic.PermissionRequest
  ❯ ./register.ts gating hook without .catch: classic.Elicitation
  ❯ ./register.ts gating hook without .catch: classic.SessionStart
  ❯ ./register.ts gating hook without .catch: classic.PostToolUse{tool_name=Bash}
  ❯ ./register.ts calls: $.command.list, $.env.get, $.fs.exists, $.fs.list, $.fs.read, $.fs.write (via log), $.process.run, $.session.id
  ❯ ./register.ts env writes: nothing
  ❯ ./register.ts env reads: HOME
✔ Validation passed with warnings
exit 0
```

**Sessions.** Each probe is one interactive session in `tmux`, started
from `~/projects/scratch/sdd-probe-2` after `printf '<mode>\n' > probe-mode`
with this command, `<extra flags>` and the session's name being the only
parts that change:

```
tmux new-session -d -s noaskprobe -x 200 -y 50 -e CLAUDE_CONFIG_DIR="$CLAUDE_CONFIG_DIR" -c ~/projects/scratch/sdd-probe-2 'env -u CLAUDECODE -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_CODE_SESSION_ID -u CLAUDE_PID -u CLAUDE_EFFORT claude --plugin-dir ~/projects/scratch/sdd-probe-plugin --permission-mode auto <extra flags>' && tmux set-option -t noaskprobe remain-on-exit on
```

It departs from the plan's command in one flag, `-e`. A new `tmux`
session takes its environment from the `tmux` server's global
environment, not from the shell that runs `tmux`, and that environment
held no Claude variable:

```
$ tmux show-environment -g CLAUDE_CONFIG_DIR
unknown variable: CLAUDE_CONFIG_DIR
$ tmux show-environment -g | cut -d= -f1 | /bin/grep -c -i claude
0
```

Without `-e`, `claude` in the pane would have found `CLAUDE_CONFIG_DIR`
unset and taken the default configuration directory (not tried); with it
the probes ran in the one the driving shell uses, `~/<second config dir>`
in this log's convention. The `env -u` prefix of
entry 1 stays as the plan has it; here it unset nothing that was set.
`remain-on-exit` keeps the screen of a session that ends.

| Probe | Session | Mode | `<extra flags>` |
|---|---|---|---|
| F (P1) | `noaskprobe` | `log` | none |
| E (P2) | `noaskprobe` | `stop-block` | none |
| E, control | `noaskprobe` | `log` | `--settings ~/projects/scratch/sdd-probe-2/settings/stop-control.json` |
| A (P3) | `noaskprobe` | `log` | none |
| B (P4) | `noaskprobe`, then `noaskprobe-continue`, then `noaskprobe-fork` | `log` | none, then `--continue`, then `--resume 2418e7f6-bf12-481f-b821-56c353b42e57 --fork-session` |
| C (P5) | `noaskprobe` | `deny-permission` | `--settings '{"permissions":{"ask":["Bash(touch:*)"]}}'` |
| D (P6) | `noaskprobe` | `block-elicitation` | `--mcp-config ~/projects/scratch/sdd-probe-plugin/mcp.json --allowedTools mcp__probe__ask` |
| G (P7, P8): question | `noaskprobe` | `deny-question` | none |
| G: plan approval | `noaskprobe` | `deny-question` | none, and `--permission-mode plan` in place of `--permission-mode auto` |
| G: subagent | `noaskprobe` | `log` | none |
| H (P9, P10) | `noaskprobe`, then `noaskprobe-continue`, then `noaskprobe-fork` | `log` | none, then `--continue`, then `--resume 5df42bc3-5545-4560-8103-adc8c5c5f89b --fork-session` |
| I (P11) | `noaskprobe` | `log` | none |

Each prompt was typed with `tmux send-keys -t <session> '<prompt>'`, and
Enter sent as its own key once the text showed. Twice an Enter was lost,
once sent in the same call as a long prompt and once just after a fork's
start, and was sent again. Screens were read with
`tmux capture-pane -p -t <session> -S -300`; a quoted screen is an
excerpt that keeps its blank lines and leaves out the drawn rule lines and
the status line, which names the account. Waits were bounded loops on the
logs and transcripts. The transcripts are
`~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2/<session id>.jsonl`,
written in UTC. After each probe its logs moved to
`~/projects/scratch/sdd-probe-2/logs/<step>.<log>`, named by the plan step
that ran the probe (`step2` for F, `step3` for E and `step3c` for its
control, `step4` to `step7` for A to D, `step8a` to `step8c` for G's three
sessions, `step9` for H and `step10` for I), where the commands below read
them, and its `tmux` session was killed.

The first start in the new folder asked whether to trust it, and "Yes, I
trust this folder" was chosen, which records that folder's trust in the
configuration directory's state file. Nothing else outside this
repository and `~/projects/scratch/` changed: in probe G, plan mode's
write of a plan file into the configuration directory's `plans/` was
declined, and `~/.local/state/sdd/` stayed absent.

**The owner's hooks and plugins.** The sessions load the user's settings
and plugins beside the probe plugin, and the user settings' default mode
is auto. They were read before the Stop, permission and tool-call probes.
The settings' Stop hook and their Notification hook (matcher
`permission_prompt`) each play a sound and are `async`, so neither can
block, approve or alter anything. Their PreToolUse hook on `Bash|Monitor`
refuses only a push of the public dotfiles with hooks bypassed and a
`core.hooksPath` write, and otherwise exits 0 with no output, so it
neither approved nor refused a probe's command, none of which holds a push
or a hooks path. Their WorktreeCreate and WorktreeRemove hooks never
fired. Of the enabled plugins, superpowers adds SessionStart context;
laterbox adds a SessionStart command hook and a module that hooks only its
own command and tool; a PHP inspection plugin hooks PostToolUse on edits
and SessionStart; a PHP language-server plugin has no hooks; and a status
plugin's module mirrors the session's state into a `tmux` pane option,
hooking `tool.call`, `tool.check` and classic events and always passing
on. None of them could block, approve or alter what a probe observes; the
status plugin's classic hooks were passed over as the probe's were. No
permission rule of the user's names a command the prompts asked for.

### What passes over the module's classic hooks

Every session's start showed the SessionStart notice on its screen.
Across the run's sixteen transcripts, the probe plugin's notices (a
fork's transcript repeats the records it copied, so the counts include
copies):

```
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && jq -r 'select(.type=="system" and .subtype=="informational") | .content' *.jsonl | /bin/grep -F 'noaskprobe:' | sort | uniq -c
      1 noaskprobe: its classic.Elicitation hook was skipped. "cc-plugin-sec-default" runs first and sent the event on past it.
      2 noaskprobe: its classic.PermissionRequest hook was skipped. "cc-plugin-sec-default" runs first and sent the event on past it.
     11 noaskprobe: its classic.PostToolUse hook was skipped. "cc-plugin-sec-default" runs first and sent the event on past it.
     21 noaskprobe: its classic.SessionStart hook was skipped. "cc-plugin-sec-default" runs first and sent the event on past it.
     19 noaskprobe: its classic.Stop hook was skipped. "cc-plugin-sec-default" runs first and sent the event on past it.
```

The status plugin, installed rather than loaded with `--plugin-dir`, had
its `classic.Notification`, `classic.Elicitation` and
`classic.ElicitationResult` hooks passed over the same way (its name
written `<status plugin>` by the command):

```
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && jq -r 'select(.type=="system" and .subtype=="informational") | .content' *.jsonl | /bin/grep -F 'hook was skipped' | /bin/grep -v -F 'noaskprobe:' | sed 's/^[^:]*: /<status plugin>: /' | sort | uniq -c
      1 <status plugin>: its classic.Elicitation hook was skipped. "cc-plugin-sec-default" runs first and sent the event on past it.
      1 <status plugin>: its classic.ElicitationResult hook was skipped. "cc-plugin-sec-default" runs first and sent the event on past it.
      5 <status plugin>: its classic.Notification hook was skipped. "cc-plugin-sec-default" runs first and sent the event on past it.
```

The module's own logs hold no line for a classic event in any probe:

```
$ cd ~/projects/scratch/sdd-probe-2/logs && ls *.probe.log | wc -l && cat *.probe.log | jq -r .ev | sort | uniq -c
12
     16 session.start
     28 tool.call
     12 tool.call:Bash
      2 tool.call:question
```

What the built-in plugin does is stated in the executable of build
2.1.325, read there and paraphrased here. Its description says that
`cc-plugin-sec-default` is seated outermost on a machine with managed
settings and for Team and Enterprise organizations, unless the managed
setting `prependPlugins` is set, in which case the organization lists the
plugin there or leaves it out. It keeps the organization's classic hooks,
prompt content, settings and tool policy out of reach of the plugins a
person installs, and adds no policy of its own. The same build holds the
rule that picks the hook patterns it passes over: a pattern is picked
when it matches at least one event and every event it matches is a
`classic.*` event or one of eight prompt and settings events,
`prompt.section`, `prompt.context`, `prompt.attachment`,
`prompt.compose`, `skill.prompt`, `attribution.text`, `session.compact`
and `settings.read`. A pattern that matches any other event is not picked
by that rule. Every hook the transcripts name as passed over is a
`classic.*` one; `tool.call` and `session.start` are neither kind, and
those hooks ran.

The machine has no managed settings: `/etc/claude-code`, the directory of
file-based managed settings, is absent, and the configuration directory's
signed cache of the remote settings delivered for the account,
`remote-settings.json`, holds an empty object (read on 2026-11-16, the day
after the probes):

```
$ ls /etc/claude-code; cat ~/<second config dir>/remote-settings.json; echo
ls: cannot access '/etc/claude-code': No such file or directory
{}
```

So the seat comes from the organization; every session's header reads
"Claude Team". No probe ran on an account of another plan, so whether a
module's classic hooks run there is not observed here. Hooks that are not
a module's ran: the probe plugin's SessionStart command hook wrote
`start.log` on every source, and settings hooks ran (the owner's, and
probe E's control below).

### Probe F, the name (P1)

Before any session:

```
$ type -a noask; compgen -c | /bin/grep -x noask; echo "exit $?"
/bin/bash: line 1: type: noask: not found
exit 1
```

The session's `session.start` line, whole; `noaskCommands` is the entries
of `$.command.list()` named `noask`:

```
$ cd ~/projects/scratch/sdd-probe-2/logs && jq -c 'del(.at)' step2.probe.log
{"ev":"session.start","sessionId":{"ok":true,"value":"e5736e01-3258-46b0-8601-5103be7a22bf"},"noaskCommands":{"ok":true,"value":[]},"reach":{"existsState":{"ok":true,"value":true},"existsMarker":{"ok":true,"value":false},"listState":{"ok":true,"value":"11 entries"},"readStateFile":{"ok":true,"value":"read 70 characters"},"readMarker":{"ok":false,"error":"HooksError: noaskprobe: $.fs.read(~/.local/state/sdd/noask) failed: ENOENT"}},"run":{"ok":true,"value":{"exitCode":0,"stdout":"{\"systemMessage\":\"noaskprobe: visible on process.run\",\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"additionalContext\":\"noaskprobe context line 7391\"}}\n","stderr":"","isStdoutTruncated":false,"isStderrTruncated":false}}}
```

`/noask` typed in the session: the typeahead read
`No commands match "/noask"`, and Enter gave the transcript's record:

```
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && jq -c 'select(.type=="system") | .content' e5736e01-3258-46b0-8601-5103be7a22bf.jsonl
"noaskprobe: its classic.SessionStart hook was skipped. \"cc-plugin-sec-default\" runs first and sent the event on past it."
"Unknown command: /noask"
```

Result: the name is free. Expected.

### Probe E, a module Stop block (P2)

Mode `stop-block`; prompt `Reply with the single word apple.` The
transcript's messages and the probe plugin's notices, in order:

```
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && jq -c 'select(.type=="user" or .type=="assistant" or (.type=="system" and .subtype!="turn_duration" and (.subtype!="informational" or (.content | startswith("noaskprobe:"))))) | [.type, (if .type=="system" then .subtype + " " + (.content // "" | .[0:44]) else (.message.content | if type=="string" then . else map(.text // .type) | join(" ") end) end)]' 3b13895d-69ed-411e-9b04-0b86a17d9c67.jsonl
["system","informational noaskprobe: its classic.SessionStart hook wa"]
["user","Reply with the single word apple."]
["assistant","thinking"]
["assistant","apple"]
["system","informational noaskprobe: its classic.Stop hook was skippe"]
["system","stop_hook_summary "]
```

One assistant message, no block, and no Stop line in `probe.log`, which
holds the `session.start` line alone.

The control, mode `log`, with `--settings` naming a file that holds one
`Stop` command hook. The hook appends its stdin to `stop-control.log`, so
that the second Stop's input can be read, since the module writes no Stop
line here, and blocks the first stop only:

```
$ cat ~/projects/scratch/sdd-probe-2/settings/stop-control.json ~/projects/scratch/sdd-probe-2/settings/stop-control.sh
{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"\"$CLAUDE_PROJECT_DIR/settings/stop-control.sh\""}]}]}}
#!/usr/bin/env bash
# The control of probe E: a settings Stop hook that appends its stdin to
# stop-control.log and blocks the first stop only.
input=$(cat)
printf '%s\n' "$input" >> stop-control.log
if [ ! -e stop-control.blocked ]; then
    : > stop-control.blocked
    printf '%s\n' '{"decision":"block","reason":"probe: reply with the single word pineapple, then stop"}'
fi
```

The same prompt, the same listing:

```
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && jq -c 'select(.type=="user" or .type=="assistant" or (.type=="system" and .subtype!="turn_duration" and (.subtype!="informational" or (.content | startswith("noaskprobe:"))))) | [.type, (if .type=="system" then .subtype + " " + (.content // "" | .[0:44]) else (.message.content | if type=="string" then . else map(.text // .type) | join(" ") end) end)]' 28ae4af5-312b-49a7-b422-9f516269d34f.jsonl
["system","informational noaskprobe: its classic.SessionStart hook wa"]
["user","Reply with the single word apple."]
["assistant","thinking"]
["assistant","apple"]
["system","informational noaskprobe: its classic.Stop hook was skippe"]
["user","Stop hook feedback:\nprobe: reply with the single word pineapple, then stop"]
["system","stop_hook_summary "]
["assistant","thinking"]
["assistant","pineapple"]
["system","stop_hook_summary "]
$ cd ~/projects/scratch/sdd-probe-2/logs && jq -c '{stop_hook_active, last_assistant_message, background_tasks, session_crons, agent_id}' step3c.stop-control.log
{"stop_hook_active":false,"last_assistant_message":"apple","background_tasks":[],"session_crons":[],"agent_id":null}
{"stop_hook_active":true,"last_assistant_message":"pineapple","background_tasks":[],"session_crons":[],"agent_id":null}
```

Result: the module's block does not continue the session, because the
module's Stop hook never runs; the settings hook blocks, the session
answers `pineapple`, and the second Stop's input reads
`stop_hook_active: true`. The difference between the two transcripts is
exactly that: the control's has the block's feedback message and a second
assistant message, the probe's has neither. Both Stop inputs of the
control carry `background_tasks` and `session_crons`, empty. Neither
carries an `agent_id` key: the `null` above is how jq prints a missing
key (`jq -c 'has("agent_id")' step3c.stop-control.log` prints `false`
twice).

### Probe A, background work in the Stop input (P3)

Mode `log`. Prompt 1:
`Start one background subagent whose task is: run "sleep 45" in your shell, then reply finished. Do not wait for it; reply started and end your turn.`
Prompt 2, after the subagent's notification and the turn after it:
`Schedule a one-shot wakeup five minutes from now with the prompt "probe wakeup", reply scheduled and end your turn.`
The main session's tool calls, the subagent's shell result, and the
system records:

```
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | [.name, (.input.command // .input.cron // .input.subagent_type // .input.query)]' bfdce764-856b-465d-9d0f-6f354a30281b.jsonl
["Agent","general-purpose"]
["ToolSearch","select:CronCreate"]
["Bash","date '+%Y-%m-%d %H:%M:%S %Z'; date -d '+5 minutes' '+%M %H %d %m'"]
["CronCreate","33 2 15 11 *"]
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && jq -c 'select(.type=="user") | .message.content[]? | select(type=="object" and .type=="tool_result") | [.is_error, .content]' bfdce764-856b-465d-9d0f-6f354a30281b/subagents/*.jsonl | head -1
[true,"<tool_use_error>Blocked: standalone sleep 45. To wait for a condition, use Monitor with an until-loop (e.g. `until <check>; do sleep 2; done`). To wait for a command you started, use run_in_background: true. Do not chain shorter sleeps to work around this block.</tool_use_error>"]
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && jq -c 'select(.type=="system") | [.timestamp[11:19], .subtype, .hookCount]' bfdce764-856b-465d-9d0f-6f354a30281b.jsonl
["22:23:55","informational",null]
["22:27:14","informational",null]
["22:27:17","informational",null]
["22:27:17","stop_hook_summary",1]
["22:27:17","turn_duration",null]
["22:27:33","stop_hook_summary",1]
["22:27:33","turn_duration",null]
["22:28:02","stop_hook_summary",1]
["22:28:02","turn_duration",null]
```

The three informational records are the probe plugin's SessionStart,
PostToolUse and Stop notices. Three stops ran (the turn of prompt 1, the
turn after the subagent's notification, the turn of prompt 2), each with
one settings hook, the owner's sound. The module's Stop hook ran at none
of them: its skip notice shows at the first stop only, and the module's
log (`step4.probe.log`) holds no Stop line, so there are no Stop lines to
record. The subagent never slept: this build refuses a standalone
foreground `sleep` in a subagent's shell as well, and the screen reported
`Agent "Sleep 45 then report" finished · 8s`. The wakeup was set for
02:33 local time (22:33 UTC); the session was killed at 22:28:10 UTC,
before it could fire.

Result: not measured. The module receives no Stop input, so the type,
status and cron fields it would read are not observed, and no subagent's
stop reached the module's Stop hook. The control of probe E shows the
arrays present, and empty, in a settings hook's Stop input.

### Probe B, SessionStart's message and the module's event (P4)

Mode `log`, prompt `Quote the noaskprobe context line you were given, or say none.`
after each of the start, `/clear`, `/compact`, `claude --continue` in a
new `tmux` session, and `claude --resume <that session's id> --fork-session`
in another. The hook's input at each moment, and the module's
`session.start` lines:

```
$ cd ~/projects/scratch/sdd-probe-2/logs && jq -c '[.source, .session_id[0:8]]' step5.start.log && jq -c '[.ev, .sessionId.value[0:8]]' step5.probe.log
["startup","2b9e7af9"]
["clear","2418e7f6"]
["compact","2418e7f6"]
["resume","2418e7f6"]
["fork","e1cba57b"]
["session.start","2b9e7af9"]
["session.start","2418e7f6"]
["session.start","e1cba57b"]
```

What reached the session, from the transcripts' records of the hook's
system message and context (the fork's transcript repeats the
compaction's two records with their original times):

```
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && for s in 2b9e7af9-de9a-43e9-9b41-3be1894f6663 2418e7f6-bf12-481f-b821-56c353b42e57 e1cba57b-81e2-4f48-9f2e-65e10d32337d; do echo "${s:0:8}"; jq -c 'select(.type=="attachment" and (.attachment.type=="hook_system_message" or .attachment.type=="hook_additional_context")) | [.timestamp[11:19], .attachment.type, .attachment.hookName, (.attachment.content | if type=="array" then map(select(test("noaskprobe"))) | join("") else . end)]' $s.jsonl; done
2b9e7af9
["22:28:28","hook_system_message","SessionStart:startup","noaskprobe: visible on startup"]
["22:28:29","hook_additional_context","SessionStart","noaskprobe context line 7391"]
2418e7f6
["22:28:56","hook_system_message","SessionStart:clear","noaskprobe: visible on clear"]
["22:28:57","hook_additional_context","SessionStart","noaskprobe context line 7391"]
["22:29:48","hook_system_message","SessionStart:compact","noaskprobe: visible on compact"]
["22:29:49","hook_additional_context","SessionStart","noaskprobe context line 7391"]
e1cba57b
["22:29:48","hook_system_message","SessionStart:compact","noaskprobe: visible on compact"]
["22:29:49","hook_additional_context","SessionStart","noaskprobe context line 7391"]
```

The screens agree: `⎿  SessionStart:startup says: noaskprobe: visible on startup`,
`⎿  SessionStart:clear says: noaskprobe: visible on clear` and
`⎿  SessionStart:compact says: noaskprobe: visible on compact` showed
after their moments, and no line naming `resume` or `fork` showed on the
screens of the continue and the fork, before or after their prompt. After
the start, the clear and the compaction the reply quoted
`noaskprobe context line 7391` from a record of that moment. After the
continue it quoted the line too, but the transcript gained no record at
the resume, so the line was the compaction's copy, still in the resumed
conversation. After the fork the reply said the line was in the context
"at the top of the conversation" and that "no new noaskprobe line came
with" the fork.

| Moment | Hook input `source` | Message shown | Context record | Module `classic.SessionStart` | Module `session.start` |
|---|---|---|---|---|---|
| start | `startup` | yes | yes | passed over | fired |
| `/clear` | `clear` | yes | yes | passed over | did not fire |
| `/compact` | `compact` | yes | yes | passed over | did not fire |
| `--continue` | `resume` | no | no | passed over | fired |
| `--resume ... --fork-session` | `fork` | no | no | passed over | fired |

Result: the message shows on startup, clear and compact, and not on
resume or fork; the context is read on those three and not on resume or
fork; the module's `classic.SessionStart` fires on no source, so its
`source` is not observed. The module's own `session.start` fired at each
process start (startup, continue, fork), not on clear or compact, and its
`$.session.id()` matched the hook's `session_id` of the same moment each
time, compared whole:

```
$ cd ~/projects/scratch/sdd-probe-2/logs && diff <(jq -r '.sessionId.value' step5.probe.log) <(jq -r 'select(.source=="startup" or .source=="resume" or .source=="fork") | .session_id' step5.start.log); echo "diff exit $?"
diff exit 0
```

### Probe C, three denials against auto mode's pause (P5)

Mode `deny-permission`, the session started with
`--settings '{"permissions":{"ask":["Bash(touch:*)"]}}'`. Prompt:
`Run these four commands one at a time, each as its own shell call, and go on to the next when one is denied: touch a1; touch a2; touch a3; touch a4. Then reply done.`
The first `touch` opened the permission dialog:

```
 Bash command
 Create empty file a1
 touch a1
 Ask rule Bash(touch:*) overrides auto mode for this command.
 /permissions to let auto mode decide

 Do you want to proceed?
 ❯ 1. Yes
   2. No

 Esc to cancel · Tab to amend
```

It was dismissed with Escape, which refused the call and ended the turn
(`Interrupted · What should Claude do instead?`). The transcript and the
module's lines:

```
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && t=08051279-cc26-4f3e-aac0-18dbae2c49cf.jsonl && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | [.name, .input.command]' $t && jq -c 'select(.type=="user") | .message.content[]? | select(type=="object" and .type=="tool_result") | [.is_error, (.content | .[0:72])]' $t && jq -c 'select(.type=="system" and (.subtype!="informational" or (.content | startswith("noaskprobe:")))) | [.subtype, (.content // "" | .[0:62])]' $t
["Bash","touch a1"]
[true,"The user doesn't want to proceed with this tool use. The tool use was re"]
["informational","noaskprobe: its classic.SessionStart hook was skipped. \"cc-plu"]
["informational","noaskprobe: its classic.PermissionRequest hook was skipped. \"c"]
["turn_duration",""]
$ cd ~/projects/scratch/sdd-probe-2/logs && jq -c 'select(.ev!="session.start") | del(.at)' step6.probe.log
{"ev":"tool.call","tool":"Bash"}
{"ev":"tool.call:Bash","agentId":null,"sessionId":"08051279-cc26-4f3e-aac0-18dbae2c49cf"}
```

Result: not measured. The module's `classic.PermissionRequest` hook was
passed over, so it denied nothing and logged no line, and the first
`touch` waited on the dialog. None of `a1` to `a4` was created.

### Probe D, a blocked elicitation (P6)

Mode `block-elicitation`, the session started with
`--mcp-config ~/projects/scratch/sdd-probe-plugin/mcp.json --allowedTools mcp__probe__ask`.
Prompt: `Call the tool mcp__probe__ask once and reply with its result text verbatim.`
The server's question opened a dialog:

```
  MCP server “probe” requests your input

  probe question

  ❯ * answer: Type something…

    Accept    Decline

  Esc to cancel · ↑/↓ to navigate · Backspace to unset
```

It was dismissed with Escape. What the server received, the tool's
result, the probe plugin's notices and the module's lines:

```
$ cd ~/projects/scratch/sdd-probe-2/logs && cat step7.elicit.log && jq -c 'select(.ev!="session.start") | del(.at)' step7.probe.log
{"result":{"action":"cancel"},"jsonrpc":"2.0","id":"probe-elicit"}
{"ev":"tool.call","tool":"ToolSearch"}
{"ev":"tool.call","tool":"mcp__probe__ask"}
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && t=8abe21cf-658b-4010-8a50-1b3f365deca9.jsonl && jq -c 'select(.type=="user") | .message.content[]? | select(type=="object" and .type=="tool_result") | .content' $t && jq -c 'select(.type=="system" and (.subtype!="informational" or (.content | startswith("noaskprobe:")))) | [.subtype, (.content // "" | .[0:62])]' $t
[{"type":"tool_reference","tool_name":"mcp__probe__ask"}]
[{"type":"text","text":"elicitation answered: cancel"}]
["informational","noaskprobe: its classic.SessionStart hook was skipped. \"cc-plu"]
["informational","noaskprobe: its classic.PostToolUse hook was skipped. \"cc-plug"]
["informational","noaskprobe: its classic.Elicitation hook was skipped. \"cc-plug"]
["informational","noaskprobe: its classic.Stop hook was skipped. \"cc-plugin-sec-"]
["stop_hook_summary",""]
["turn_duration",""]
```

Result: the dialog showed, because the module's `classic.Elicitation`
hook was passed over and blocked nothing. The server received a cancel,
and that cancel was the Escape typed at the dialog, not the module's
block.

### Probe G, the tool-call refusals and the module's reach (P7, P8)

Mode `deny-question`. Prompt:
`Ask me one multiple-choice question with your question tool about which fruit I prefer; if the tool is refused, reply with the refusal text verbatim.`

```
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && t=280f5869-223a-48c8-a75f-caecdeb67446.jsonl && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .name' $t && jq -c 'select(.type=="user") | .message.content[]? | select(type=="object" and .type=="tool_result") | [.is_error, .content]' $t && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' $t
"AskUserQuestion"
[true,"<tool_use_error>probe: answer it yourself</tool_use_error>"]
"The question tool refused the call. This is the refusal text, word for word:\n\nprobe: answer it yourself\n\nNothing is in flight, so it's safe to close the session."
```

No dialog showed. Then a session with `--permission-mode plan` and the
prompt
`Plan how to rename README.md and present the plan for approval; if the approval is refused, reply with the refusal text verbatim.`
Plan mode first asked, in a permission dialog, to create a plan file under
the configuration directory's `plans/`; "2. No" was chosen, to keep that
directory unchanged, and the refusal ended the turn. A second prompt
reached the approval without a file:
`Do not write a plan file. Present the plan for approval now; if the approval is refused, reply with the refusal text verbatim.`

```
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && t=5435751c-acf8-4109-aa79-44786a6d8961.jsonl && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .name' $t && jq -c 'select(.type=="user") | .message.content[]? | select(type=="object" and .type=="tool_result" and .is_error == true) | .content | .[0:96]' $t && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' $t | tail -1
"Bash"
"Read"
"Bash"
"Write"
"ToolSearch"
"ExitPlanMode"
"The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a "
"<tool_use_error>probe: answer it yourself</tool_use_error>"
"probe: answer it yourself"
```

The first refusal is the declined `Write` of the plan file; the second is
the module's, on the plan-approval tool. No approval dialog showed. Then,
mode `log`:
`Dispatch one general-purpose subagent with the task: run "true" in your shell and reply ok.`

```
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2/1e515da9-3a10-4d76-9ae5-7668d28ae798/subagents && ls && jq -c '{agentType}' *.meta.json && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use" and .name=="Bash") | .input.command' *.jsonl
agent-a080e1c5397cd9cd5.jsonl
agent-a080e1c5397cd9cd5.meta.json
{"agentType":"general-purpose"}
"true"
$ cd ~/projects/scratch/sdd-probe-2/logs && jq -c 'select(.ev=="tool.call:Bash") | {agentId, sessionId}' step8c.probe.log
{"agentId":"a080e1c5397cd9cd5","sessionId":"1e515da9-3a10-4d76-9ae5-7668d28ae798"}
```

The module's `tool.call` line in the subagent carries the subagent's id,
the one its transcript is named after. The module's reach (P8), from all
sixteen `session.start` lines of the run (probe F's is quoted whole
above):

```
$ cd ~/projects/scratch/sdd-probe-2/logs && cat *.probe.log | jq -c 'select(.ev=="session.start") | [.noaskCommands.value, .reach.existsState.ok, .reach.existsMarker.value, .reach.listState.value, .reach.readStateFile.value, .reach.readMarker.ok, .run.ok, .run.value.exitCode]' | sort | uniq -c
     16 [[],true,false,"11 entries","read 70 characters",false,true,0]
```

`$.fs.exists` answered for `~/.local/state` and for the absent
`~/.local/state/sdd/noask`, `$.fs.list` listed `~/.local/state`,
`$.fs.read` read a file there and answered the absent marker with an
`ENOENT` error, and `$.process.run` ran `scripts/session-start.sh` under
`$.plugin.root` with its standard-input line, exit 0 (its output is in
probe F's line above).

Result: the question tool and the plan-approval tool were each refused
with the module's text, which the session read, and no dialog showed;
`agentId` is present in a subagent. Every call of the module's reach
answered.

### Probe H, the session's id and the hook's stdin (P9, P10)

Mode `log`. Prompt 1:
`Run "printenv CLAUDE_CODE_SESSION_ID; env | cut -d= -f1 | grep -i session" in your shell and reply with the output verbatim.`
Prompt 2:
`Dispatch one general-purpose subagent with the task: run "printenv CLAUDE_CODE_SESSION_ID" in your shell and reply with its output verbatim.`
Then `/compact` and prompt 1; `/clear` and prompt 1; `claude --continue`
in a new `tmux` session and prompt 1; and
`claude --resume 5df42bc3-5545-4560-8103-adc8c5c5f89b --fork-session` in
another and prompt 1. The first answer to prompt 1, its id line and the
names that begin with `CLAUDE` (the filter cuts ten other names, of the
desktop session and of shell tools):

```
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && jq -r 'select(.type=="user") | .message.content | arrays | .[] | select(.type=="tool_result") | .content | strings' 2499fc52-759d-45bf-b333-fc601c164a06.jsonl | head -15 | /bin/grep -E '^[0-9a-f]{8}-|^CLAUDE'
2499fc52-759d-45bf-b333-fc601c164a06
CLAUDE_CODE_CHILD_SESSION
CLAUDE_CODE_SESSION_ID
CLAUDE_CODE_BRIDGE_SESSION_ID
CLAUDE_CODE_SESSION_ATTENDED
```

At each stage, the shell's value (the first line of prompt 1's result in
the stage's transcript; the fork's transcript repeats the results it
copied, so its last is the fork's own), the hook input's `session_id`
(`start.log`, one line per stage) and the module's `$.session.id()` (the
main session's `tool.call:Bash` lines), compared whole and printed by
their first 8 characters; then the subagent's shell value, its count of
`classic.PostToolUse` lines, and its module line's `agentId` and session:

```
$ cd ~/projects/scratch/sdd-probe-2/logs && t=~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && shell() { jq -r 'select(.type=="user") | .message.content | arrays | .[] | select(.type=="tool_result") | .content | strings | select(test("^[0-9a-f]{8}-")) | split("\n")[0]' "$@"; } && paste -d' ' <(printf '%s\n' start compact clear continue fork) <(shell $t/2499fc52-759d-45bf-b333-fc601c164a06.jsonl; shell $t/5df42bc3-5545-4560-8103-adc8c5c5f89b.jsonl; shell $t/3710476d-8a9a-4d9a-bd3b-6732d31f8ce1.jsonl | tail -1) <(jq -r .session_id step9.start.log) <(jq -r 'select(.ev=="tool.call:Bash" and .agentId==null) | .sessionId' step9.probe.log) | awk '{print $1, substr($2,1,8), substr($3,1,8), substr($4,1,8), ($2==$3 && $3==$4 ? "same" : "differ")}'; echo "subagent $(shell $t/2499fc52-759d-45bf-b333-fc601c164a06/subagents/*.jsonl | cut -c1-8) $(jq -r 'select(.ev=="classic.PostToolUse") | .session_id' step9.probe.log | wc -l) $(jq -r 'select(.ev=="tool.call:Bash" and .agentId!=null) | [.agentId, .sessionId[0:8]] | join(" ")' step9.probe.log)"
start 2499fc52 2499fc52 2499fc52 same
compact 2499fc52 2499fc52 2499fc52 same
clear 5df42bc3 5df42bc3 5df42bc3 same
continue 5df42bc3 5df42bc3 5df42bc3 same
fork 3710476d 3710476d 3710476d same
subagent 2499fc52 0 a61c32ccfc02ebae8 2499fc52
```

The hook's input by source, its keys in order:

```
$ cd ~/projects/scratch/sdd-probe-2/logs && jq -c '[.source, keys_unsorted]' step9.start.log
["startup",["session_id","transcript_path","cwd","scratchpad_dir","hook_event_name","source","model"]]
["compact",["session_id","transcript_path","cwd","scratchpad_dir","prompt_id","hook_event_name","source","model"]]
["clear",["session_id","transcript_path","cwd","scratchpad_dir","hook_event_name","source"]]
["resume",["session_id","transcript_path","cwd","scratchpad_dir","hook_event_name","source","seconds_since_last_response","context_tokens","prompt_cache_likely_expired","estimated_cache_write_usd"]]
["fork",["session_id","transcript_path","cwd","scratchpad_dir","hook_event_name","source","seconds_since_last_response","context_tokens","prompt_cache_likely_expired","estimated_cache_write_usd"]]
```

P10 quotes the startup line (`head -1 step9.start.log`), one line of
compact JSON, with the session id written `s-1`, the home directory
`/home/u` (also inside the two directory names derived from it), and the
configuration directory `<second config dir>`; it still parses as JSON.
The SessionStart command hook does not run in a subagent, so `start.log`
has no subagent line and the plan's `agent_id` case is not observed.

Result: the variable is `CLAUDE_CODE_SESSION_ID`; the shell, the hook's
input and the module agree at every stage; a compaction and a continue
keep the id, a clear and a fork give a new one. The subagent's shell and
its module line carry the main session's id; its hook input is not
observed, because the module's `classic.PostToolUse` hook was passed over.

### Probe I, a goal proposal's dialog (P11)

Mode `log`. Prompt:
`If you have a tool named ProposeGoal, call it once with the goal "probe goal" and with ask_user set to true, and reply with its result verbatim; otherwise reply none.`
The reply was `none`, with no tool call. Because the reply alone does not
show the tool absent, a second prompt asked:
`Use your tool search to look for a tool named ProposeGoal and reply with what it found, verbatim.`
The prompts, the calls, the start of each result and reply, and the
session's listings of deferred tools (the result goes on to name the
user's MCP servers that failed to connect, cut here):

```
$ cd ~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2 && t=42bb31df-8a6a-45a0-bfb6-8cdf6f316f3d.jsonl && jq -c 'select(.type=="user") | .message.content | strings' $t && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | [.name, .input]' $t && jq -c 'select(.type=="user") | .message.content[]? | select(type=="object" and .type=="tool_result") | .content | .[0:39]' $t && jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text | .[0:60]' $t && jq -c 'select(.type=="attachment" and .attachment.type=="deferred_tools_delta") | {names: (.attachment.addedNames | length), proposeGoal: (.attachment.addedNames | index("ProposeGoal"))}' $t
"If you have a tool named ProposeGoal, call it once with the goal \"probe goal\" and with ask_user set to true, and reply with its result verbatim; otherwise reply none."
"Use your tool search to look for a tool named ProposeGoal and reply with what it found, verbatim."
["ToolSearch",{"query":"select:ProposeGoal","max_results":5}]
"No matching deferred tools found. Note:"
"none"
"Here is the search result, word for word:\n\n```\nNo matching d"
{"names":169,"proposeGoal":null}
{"names":0,"proposeGoal":null}
```

No `ProposeGoal` call reached the module (its only line besides
`session.start` is the tool search), and no dialog showed. Since no call
was made, the plan's repetition for a call without `ask_user: true` did
not arise.

Result: the tool is absent from these sessions.

### What each value changes

| Value | Observed | Branch taken |
|---|---|---|
| P1 | free | expected |
| P2 | the module's Stop hook never runs (passed over); the settings hook's block continues | stop for the owner: the spec's choice of the module for the continuation falls; Task 8 is not started |
| P3 | not measured: no Stop input reaches the module, so the type, the live status, the finished form and `recurring` were not observed; the arrays do appear, empty, in a settings Stop hook's input (probe E's control) | no branch taken: not measured. The table's other branches need the observed strings, and its "the arrays never appear" branch does not fit, since the control shows them; the value is left for the owner, and a new measurement, if the owner wants one, follows the ruling on P2. Task 8, which reads it, waits on P2's stop |
| P4 | message on startup, clear and compact, not on resume or fork; context not read on resume or fork; the module's `classic.SessionStart` fires on no source | stop for the owner, by the table's last clause: the module's event does not fire and two sources are silent, so nothing then shows the morning line. Short of that clause, `SILENT_SOURCES` would take resume and fork, and `CONTEXT_SOURCES` all five. Tasks 3, 4 and 5 read P4 |
| P5 | not measured: the module's PermissionRequest hook is passed over and denies nothing; the first `touch` opened the dialog | neither of the table's readings (no, yes); no branch taken; Task 7, which reads it, waits on P6's stop |
| P6 | dialog shown, because the module's `classic.Elicitation` hook is passed over and blocked nothing; the server received the cancel typed at the dialog | stop for the owner: the spec provides no downgrade for an MCP server's question; Task 7 waits |
| P7 | both refusals read, no dialog; `agentId` present | expected |
| P8 | every call answered | expected |
| P9 | `CLAUDE_CODE_SESSION_ID`; the three agree; same id after compact and continue, new after clear and fork; a subagent's shell and module carry the main session's id, its hook input not observed | expected for every observed part; whether a subagent's hook input carries the main session's id is open, because the module's `classic.PostToolUse` is passed over |
| P10 | one line of JSON holding `session_id` and `source`; no subagent line, since the hook does not run in a subagent | expected, the subagent's `agent_id` case not observed |
| P11 | the tool is absent | expected |

### Leftovers

Each probe's `tmux` session was killed when its probe ended, and the
Step 4 wakeup with it. None of `a1` to `a4` was created, so none needed
deleting. Before this entry's commit:

```
$ tmux ls 2>&1 | /bin/grep -E '^noaskprobe'; echo "grep exit $?"
grep exit 1
$ ls ~/projects/scratch/sdd-probe-2/a1 ~/projects/scratch/sdd-probe-2/a2 ~/projects/scratch/sdd-probe-2/a3 ~/projects/scratch/sdd-probe-2/a4 ~/.local/state/sdd 2>&1 | /bin/grep -c 'No such file or directory'
5
```

The scratch directories stay for the owner: the probe repository with
its `logs/` and `settings/`, and the probe plugin.

### Pinned values

- P1 name free: yes
- P2 module stop block continues: no (the module's `classic.Stop` hook is passed over by `cc-plugin-sec-default` and never runs; a settings Stop hook's block continues, its second Stop input reading `stop_hook_active: true`)
- P3 background tasks: not measured (the module's `classic.Stop` hook is passed over and received no Stop input at any of the three stops, so the type, the live status, the finished form and the one-shot cron's `recurring` were not observed; the arrays do appear, empty, in a settings Stop hook's input, probe E's control); stop in a subagent: not observable (the module receives no Stop input); no branch of the plan's table taken, the value is left for the owner
- P4 systemMessage shown: startup yes, clear yes, compact yes, resume no, fork no; context read: no, on resume, fork; module SessionStart: fires on no source (passed over), source not observed
- P5 denials trip the pause: not measured (the module's `classic.PermissionRequest` hook is passed over and denies nothing; the first `touch` opened the permission dialog, screen quoted)
- P6 elicitation: dialog shown (the module's `classic.Elicitation` hook is passed over and blocked nothing); server received `{"result":{"action":"cancel"},"jsonrpc":"2.0","id":"probe-elicit"}` (the cancel of an Escape typed at the dialog)
- P7 tool.call deny: question text read, no dialog, plan approval text read, no dialog, agentId in a subagent present
- P8 module reach: exists, read and list outside the working directory ok, process.run under the plugin root with stdin ok
- P9 session id: variable CLAUDE_CODE_SESSION_ID; shell, hook input and module agree yes; a subagent's shell and module carry the main session's (its hook input not observed); after compact same, after clear new, after continue same, after fork new
- P10 hook stdin: `{"session_id":"s-1","transcript_path":"/home/u/<second config dir>/projects/-home-u-projects-scratch-sdd-probe-2/s-1.jsonl","cwd":"/home/u/projects/scratch/sdd-probe-2","scratchpad_dir":"/tmp/claude-1000/-home-u-projects-scratch-sdd-probe-2/s-1/scratchpad","hook_event_name":"SessionStart","source":"startup","model":"claude-opus-5-5"}`
- P11 goal proposal: tool absent

## 5. Give every unit a file list, and run isolated with or without a bootstrap (2026-11-16)

On 2026-11-16 the plugin moved to version 0.2.0 with the build of the
design `docs/superpowers/specs/2026-11-13-sdd-acceptance-fixes-design.md`,
cited at `f964095` and unchanged since. The build followed the plan
`docs/superpowers/plans/2026-11-14-sdd-acceptance-fixes.md`, a local
working document that is not committed, in eight commits on the base
`47e9f77`, `4c96a62` to `43ad2f7` and this entry's first commit,
`4e0bc45`, then two from the final review's fix wave: `c984d92` (the
undo refuses a TO that is not a linked worktree's top level, exit 2,
nothing written) and `34b25d8` (the Known limits paragraph on a run
begun before 0.2.0). It answers the two findings of entry 3's
acceptance: an OpenSpec brief carried no file list, so a pausing
controller had no paths to checkpoint, and `isolated` stopped in every
project without a worktree bootstrap, where entry 3 ruled that it should
go on in a bare worktree.

### What was built

- `4c96a62`: `sdd-checkpoint --list FILE` reads a unit's list file, one
  path per line (a trailing CR dropped, a blank line skipped, a leading
  `~/` read as the home folder), beside PATH arguments. A path given
  twice counts once, an empty set is a valid checkpoint
  (`heads none; tree e3b0c44298fc1c14`), and a missing list file
  exits 2. The output for the same distinct paths is unchanged, so a
  `paused` line ledgered before this release still compares on a resume
  after it.
- `5b50e7c`: `skills/apply/scripts/named-paths` prints the paths a
  Markdown text names: the backtick spans outside code fences that have
  the shape of a path and, relative to the repository root, are a file
  or a new file in a folder that exists. A folder is never a named path.
- `c67b3c6` and `8a5484b`: `openspec-section-brief` and `task-brief`
  write a list file beside each brief, `section-<N>-files.txt` or
  `task-<N>-files.txt`, seeded with the section's named paths or the
  plan task's `**Files:**` block, and the OpenSpec brief gains a
  `**Files:**` block of those paths. `bin/sdd-files-add` creates a list
  file or adds lines to it, and never rewrites or reorders it.
  `8a5484b` ends its options at `--`, so a plan's span `--list` is added
  as a path, not read as the option.
- `ed61edd`: `skills/apply/scripts/source-copy` copies the source's
  files from the launch checkout into the worktree as they stand, and
  its `--undo` puts the worktree back as HEAD holds those paths. Since
  `c984d92` the undo runs only when TO is the top level of a linked
  worktree and exits 2 with nothing written for any other TO (a main
  checkout, a folder inside a worktree, a folder in no repository),
  because in the launch checkout the same removal would delete the
  source's uncommitted files.
- `e5e7a7e`: `skills/apply/references/isolated.md` holds the `isolated`
  rules, and `skills/apply/SKILL.md` keeps one pointer to it. A launch
  whose `.worktrees/<name>` holds the run's ledger goes on there and
  makes, copies or runs nothing again. A first launch copies the source
  into the worktree and commits none of it. With a bootstrap the
  worktree is made and bootstrapped as before; without one, git must
  ignore `.worktrees/`, the worktree is made bare and the project's
  gates run once in it, and a failed gate run undoes the copy and
  removes the worktree and its branch with the unforced commands. At the
  end the run's archive keeps the source's final state in
  `<archive>/source`.
- `6cf37e3`: every file rule of the prompts names the unit's list file.
  An implementer's report ends with `Files: <path>, <path>` or
  `Files: none`, and the controller adds those paths to the list with
  `sdd-files-add`.
- `43ad2f7`: `tests/run.sh` runs the four new tests.
- `4e0bc45`, this entry's first commit, names the three new scripts on
  README's and CI's shellcheck lines, raises the version to 0.2.0, and
  describes the four new tests in `tools/README.md`, where
  `test-sdd-checkpoint.sh` then had thirteen cases (fourteen since the
  follow-up below).

### The owner's rulings

- 2026-11-13, in entry 3: without a bootstrap, `isolated` makes the
  worktree bare and runs the project's gates once in it, instead of
  stopping.
- 2026-11-14: a review of the design found two more defects in
  `isolated`, in projects with a bootstrap too. The worktree is made
  from HEAD, so a source launched uncommitted was missing from it, or
  read as an older committed copy; and a relaunch ran
  `git worktree add` again, which refuses once the branch and the folder
  exist, so an `isolated` run could not be resumed. The owner ruled that
  both fixes apply to every `isolated` run, with a bootstrap or without:
  a relaunch goes on in the ledgered worktree, for a bootstrap worktree
  and a bare one (the spec's decision 7).
- 2026-11-14: an `isolated` run copies its source into the worktree as
  it stands and commits none of it, on the launch branch or on the
  run's, for every kind of source, an OpenSpec change, a superpowers
  plan or a custom plan alike (the spec's decision 8). This replaced the
  approved draft's rule that an OpenSpec change be committed before the
  launch.
- 2026-11-15: version numbers and entries go in landing order. This
  build lands ahead of phase 2's held tasks, so it ships 0.2.0, the next
  minor version after 0.1.0 since `isolated` now goes on where it used
  to stop, and writes entry 5; phase 2's own release takes the numbers
  after it (the spec's "Release and record").

### The plan's decisions

Where the spec leaves the shape to the builder, the plan decided:

1. `bin/sdd-files-add` exists so that no prompt carries a shell recipe
   for the add-only rule; `bin/sdd-checkpoint`'s header records how a
   prose recipe failed once. It lives in `bin/` because a controller
   calls it by bare name; the brief scripts call it as
   `"$here/../../../bin/sdd-files-add"`.
2. A plan's `**Files:**` block contributes every backtick span holding
   none of `* ? [ ] { } < > $ | " '`, so a glob (`tests/*.sh`), a
   variable or a quoted JSON fragment is not taken as a path. The
   OpenSpec shape and disk tests do not apply there: the block is a file
   list by intent, and names `Makefile`, paths under the home folder and
   files in folders not made yet.
3. `named-paths` treats a line whose first non-blank characters are
   ```` ``` ```` or `~~~` as a fence line, indented or not.
4. `sdd-checkpoint --list` and `sdd-files-add --list` drop a trailing CR
   from each line.
5. `source-copy` mirrors each path by removing it in the worktree and
   copying it with `cp -a`, so modes, symlinks and deletions carry over;
   its undo removes the path and restores HEAD's version with
   `git -C TO checkout HEAD -- PATH`. It checks every path before it
   writes anything, so a bad call leaves the worktree as
   `git worktree add` made it.
6. The bare worktree's gate outputs go to a folder made with
   `mktemp -d`, outside the worktree, so they cannot block the unforced
   removal; the stop message names that folder.

### Rulings during the run

R1 to R7 are the run's own rulings, numbered as in the run's
`decisions.md`, a workspace file that is not committed; each says what
it would cost if it were wrong.

- R1. The usage sentence of `bin/sdd-checkpoint` that Task 1 quotes
  wraps across two comment lines, and was matched across the wrap. Cost
  if wrong: none beyond a search.
- R2. `task-brief`'s header said the copy exists to fix the task
  boundary and should be dropped once upstream fixes it. Since the copy
  now also seeds the unit's list file, that clause says the copy stays
  for the list file. Cost if wrong: one header sentence.
- R3. The shellcheck lines gain this run's three scripts only.
  `bin/noask`, a phase 2 script that predates this run, stays off both
  until phase 2's held Task 10 edits README and CI, which the owner
  ruled runs after this build. Cost if wrong: CI does not check that
  script until then.
- R4. This entry's commit raises the version locally, and the run
  pushes nothing. What a push of `main` then releases is a question put
  to the owner at the launch, and this release adds no README text on
  it. Cost if wrong: none for the build.
- R5. The totals the runner's own test expects were checked at the
  launch, and the plan's figures (each four higher, with fifteen verdict
  lines) stood. Cost if wrong: none.
- R6. The spec does not say what happens when the source's copy itself
  fails. `source-copy` checks every path before it writes anything and
  exits 2 when one is absent from the launch checkout, for example a
  plan's spec deleted there and not committed. `isolated.md` treats that
  as a stop before any dispatch, with a bootstrap or without: the
  unforced `git worktree remove` and `git branch -d` run with no undo,
  since nothing was copied, and the stop names the refused path. Going
  on would read HEAD's older copy, the defect the copy exists to remove.
  The undo of a failed gate run is passed the worktree's root, never the
  launch checkout's. Cost if wrong: the owner meets a stop where they
  wanted the deletion mirrored, and relaunches after restoring or
  committing the file.
- R7. `tools/README.md` joins this release: its paragraph on the tests
  `tests/run.sh` runs gains a sentence for each of the four new test
  scripts, and `test-sdd-checkpoint.sh` thirteen cases. The paragraph's
  two missing phase 2 tests stay phase 2's, as R3 rules for its script.
  Cost if wrong: one paragraph reverted.

One ruling of a unit controller settled what was built, in Task 1: a
relative line of a list file resolves as a relative PATH argument does,
against the working directory, and no repository-root rule was added,
since neither the brief nor the spec's Part 1, item 6 names one. Cost if
wrong: a caller running `sdd-checkpoint` outside the repository root
gets missing-path entries for relative lines.

### Known limits

From the spec's Part 1, item 7:

- An implementer the owner stops by hand returns no report, so a file
  it created and never reported is not on the list until its
  replacement reports it; the pause's checkpoint does not cover it.
- A brief written again during a pause (a source amended after a
  `needs-ruling`) can add paths, and the resume may then report drift
  that is only the longer list; the owner answers the drift question.

The build adds one limit of its own, found by the final review. A run
begun before 0.2.0 has no list files, since its briefs were written
without them, and a relaunch on 0.2.0 meets three rules that read one.
The final phase's
`sdd-files-add final-files.txt --list <a unit's list file>` exits 2
for a unit with no list file and writes nothing. A pause's
`sdd-checkpoint --list` on a missing list exits 2, which is ledgered as
`checkpoint failed (exit 2)` and read on the resume as drift. And the
launch check's exception for an incomplete attempt, the paths its
`*-files.txt` lists, names none, so the attempt's own edits stop the
launch.

The way through, once the plugin is at 0.2.0 and before the relaunch:
from the run's checkout (the worktree under `isolated`), run the
source's brief script in `skills/apply/scripts/` again for every unit
with a `handed to controller` line, at the brief's own path
(`openspec-section-brief <name> <N> <workspace>/section-<N>-brief.md`
or `task-brief <plan> <N> <workspace>/task-<N>-brief.md`). The script
overwrites the brief with the source as it stands now and creates the
list file beside it, seeded with the section's named paths or the
task's `**Files:**` block. The seeded list lacks the paths that only an
implementer's report named, since those reports had no `Files:` line;
add them from the reports with
`sdd-files-add <the list file> -- <path>...`, or `final-files.txt` and
the launch check's exception do not cover them. A unit paused before
0.2.0 may still meet the drift question on its resume, as in the second
limit above: its checkpoint covered the paths its controller took from
the brief (an OpenSpec brief carried none), and the seeded list need not
hold the same distinct paths.

### Not covered

`isolated.md` is prose a driver follows, so no script test runs it. The
spec leaves it to the next acceptance run, which this build did not
include: a first launch with an uncommitted OpenSpec change, a first
launch without a bootstrap, a relaunch from the main checkout without
the word `isolated`, a plan from an ignored plans folder, and an
untracked custom plan outside it.

### Gates

At the repository root, in the working tree before this entry's first
commit, `4e0bc45`, and with this entry's text in place, the plan's gate
chain for the release. Its last command, the dash `grep` over
`README.md` and this file, finds nothing and so exits 1, which makes 1
the chain's exit status when every gate passes. The output is whole;
only the home directory is written as `~`:

```
$ bash tests/run.sh && bash tests/check-skill-size.sh && claude plugin validate . --strict && /bin/grep -nP '[\x{2014}\x{2013}]' README.md docs/decisions.md
ok 19336/19500 (substituted)
ok check-skill-size
ok check-pause-text
ok check-pause-text
ok check-noask-reference
ok check-isolated-reference
ok 1
ok 2
ok 3
ok 4
ok 5
ok 6
ok 7
ok 8
ok 9
ok 10
ok 11
ok 12
ok 13
ok 14
ok 15
ok 16
ok 17
ok 18
ok 19
ok test-run-archive
ok 1
ok 2
ok 3
ok 4
ok 5
ok 6
ok 7
ok 8
ok 9
ok 10
ok 11
ok 12
ok 13
ok test-sdd-checkpoint
ok kept-file
ok kept-new
ok kept-range
ok kept-line
ok kept-dot
ok folder
ok no-folder
ok no-root-file
ok new-no-folder
ok space
ok trailing-slash
ok glob
ok method
ok url
ok flag
ok variable
ok tilde
ok absolute
ok scoped
ok setting
ok bare-name
ok order
ok fence
ok indented-fence
ok stdin
ok subfolder
ok errors
ok test-named-paths
ok 1
ok 2
ok 3
ok 4
ok 5
ok 6
ok 7
ok test-briefs
ok 1
ok 2
ok 3
ok 4
ok 5
ok 6
ok test-source-copy
ok 1
ok 2
ok 3
ok 4
ok 5
ok 6
ok 7
ok 8
ok 9
ok 10
ok 11
ok 12
ok 13
ok 14
ok 15
ok 16
ok 17
ok 18
ok 19
ok 20
ok 21
ok 22
ok 23
ok 24
ok 25
ok 26
ok 27
ok 28
ok 29
ok 30
ok test-noask
ok 1
ok 2
ok 3
ok 4
ok 5
ok 6
ok 7
ok 8
ok test-sub-skill-check
ok 1
ok 2
ok 3
ok 4
ok 5
ok 6
ok 7
ok 8
ok 9
ok 10
ok 11
ok 12
ok 13
ok 14
ok 15
ok test-tools
ok 1
ok 2
ok 3
ok 4
ok 5
ok test-check-skill-size
ok 1
ok 2
ok 3
ok 4
ok 5
ok test-run
15 ok, 0 skipped, 0 failed
ok 19336/19500 (substituted)
Validating plugin manifest: ~/projects/akalongman/claude-sdd/.claude-plugin/plugin.json

Plugin directory checks for ~/projects/akalongman/claude-sdd. The plugin directory is the catalog that plugins are submitted to; this is a subset of what it runs.

⚠ Found 1 plugin directory warning:

  ❯ .claude-plugin/plugin.json icon: No icon (ICON_MISSING). No icon found in the plugin. The validator looked for `icon` in plugin.json and for a file at .claude-plugin/icon.png or .svg, assets/icon.png or .svg, or a similar path.
    Fix: Add a square PNG to the plugin folder at .claude-plugin/icon.png, or set `icon` in plugin.json to the path of a square PNG or JPEG in the plugin: 512 to 2048 px on each side, under 2 MB. SVG and WebP are not accepted. That file may become the listing icon only once: the first time the plugin is saved or submitted in the developer portal. Adding or changing it later does not change the icon.

These plugin directory checks do not change the result below.

The directory also runs a safety scan and a policy review that this command does not.

✔ Validation passed
```

The suite's totals line reads `15 ok, 0 skipped, 0 failed`, the size
check `ok 19336/19500 (substituted)`, and the validation passed. Its
one warning, the missing icon, is not this release's: a validation of
`43ad2f7`, exported with `git archive`, gives the same warning. The same
chain, run again on the entry's text as `4e0bc45` commits it, printed
the same output and exited 1 again.

Result: pass. Nothing was pushed.

### Follow-up (2026-11-16)

On 2026-11-16 the owner answered the questions the run left open. The
push of `main` is held until phase 2's guard on the noask switch lands,
which answers R4: 0.2.0 at `4e0bc45` and every commit after it stay
local until then. The named-path rule keeps a span with a `..` segment,
as the spec's Part 1, item 3 words it. A run begun before 0.2.0 stays a
stated limit (Known limits above), with no code change for it. The
owner also approved eight small fixes from the final review, made in
four commits, with `skills/apply/SKILL.md` unchanged:

- `1f68e41`, in `skills/apply/references/isolated.md` (the final
  review's I2, M6 and M3, and the way back after a failed bootstrap).
  A relaunch names its ledger,
  `.worktrees/<name>/.superpowers/sdd/<name>/progress.md`, and its
  check tests for that file and runs no script, since `sdd-workspace`
  creates the folder it prints. A source loaded before the reference
  came from the launch checkout, so the driver loads it again from
  inside the worktree (`openspec instructions apply`, or the worktree's
  plan file) and uses only that answer, and a finished run reaches the
  `all_done` path the run's end relies on. A bootstrap that fails still
  leaves the worktree and the branch, and its stop now names the
  failing command and its exit status and gives the way back:
  `source-copy --undo` with the source's paths, then the unforced
  `git worktree remove` and `git branch -d`, which the driver names and
  does not run. The paths the source's copy brought never stop the
  launch check.
- `7bbad05`, in `skills/apply/prompts/unit-controller-overrides.md`
  (the final review's M4, and the Ledger grep): the gates run over the
  unit's files that exist, since the list also holds deleted paths and
  files not made yet; and the Ledger bullet's grep matches
  `handed to controller`, the lines by which the final phase orders its
  `--list` options.
- `25003b5`: `bin/sdd-checkpoint` ends `sha256sum`'s options at `--`,
  so an untracked file at a repository's top level whose name starts
  with `-` is hashed instead of failing the run. The line for every
  other name is unchanged. `tests/test-sdd-checkpoint.sh` gains case 14
  for it, which fails on the old script, and `tools/README.md` counts
  fourteen cases.
- `c1711b9`, in `tools/green/README.md` (the final review's M7): since
  0.2.0, scenario D8b and the file-list wording of S9, S10, S11 and S9f
  in `2026-09-25-unit-controller-workflow.js` describe the earlier
  rules. The scenario file is unchanged.

After them `tests/run.sh` reads `15 ok, 0 skipped, 0 failed` and the
size check `ok 19336/19500 (substituted)`. Nothing was pushed.

## 6. Settle the command hooks' unknowns (2026-11-16)

```
$ claude --version
2.1.325 (Claude Code)
```

Entry 4 found that on an account of a Team organization the built-in
security default passes over a person's module at every classic event,
and revision 16 of the design moved the three hooks that stood there
(the continued stop, the denied permission prompt, the declined MCP
question) into command hooks of the plugin's `hooks.json`. Whether such
hooks run on that account was not observed in entry 4. These probes ran
on 2026-11-16, before any plan was written on the answer, on the same
build and the same account, in the scratch repository of entry 4, with
a second throwaway plugin, `noaskprobe2`. Every transcript of these
sessions names build 2.1.325, and none holds a notice that a hook of
the probe plugin was passed over.

The main finding: a plugin's command hook runs at Stop, SubagentStop,
PermissionRequest and Elicitation under the security default, and each
answer it gave was applied.

### Setup

`~/projects/scratch/sdd-probe-plugin-2`, never committed. Its
`hooks/hooks.json` registers one script, `scripts/hook.sh <event>`, as a
command hook at SessionStart (all five sources), Stop, SubagentStop,
PermissionRequest and Elicitation, and the module `./register.ts`. The
script appends its standard input as one line to `r16/<event>.log`
under the project directory, appends to `r16/env.log` the names of its
exported variables that start with `CLAUDE_PLUGIN` and the value of the
plugin's one option (`budget`, default `7`), and answers by the word in
the file `probe-mode`: `stop-block` (`{"decision":"block"}` on a first
stop), `stop-context` (`hookSpecificOutput.additionalContext` on a first
stop), `deny-permission` (a decision object with `behavior: "deny"`),
`decline-elicitation` (`action: "decline"`), `log` (no answer). At
SessionStart it always prints a `systemMessage` naming the source. The
module logs to `r16/module.log` what `$.session.turns()` and
`$.session.messages()` read at `session.start` and at each main-loop
`turn.start`, and each tool call's `agentId`; at a `session.start` that
finds a history it appends one line to the transcript with `$.ui.log`.

Each session was started in `tmux` as in entry 4, with
`--plugin-dir ~/projects/scratch/sdd-probe-plugin-2 --permission-mode auto`
and the flags below, and its logs were moved to `r16/<session>/` when it
ended. The MCP server and its configuration are entry 4's.

| Session | Mode | Extra flags |
|---|---|---|
| s1 | `stop-block`, then `stop-context`, then `log` | none |
| s3 | `deny-permission` | `--settings '{"permissions":{"ask":["Bash(touch:*)"]}}'` |
| s4 | `decline-elicitation` | `--mcp-config <entry 4's mcp.json> --allowedTools mcp__probe__ask` |
| s6 | `deny-permission` | `--settings <a file with the same ask rule and a PermissionRequest command hook that allows every prompt>` |
| s5a, s5b, s5c | `log` | none; then `--continue`; then `--resume <s5a's second id> --fork-session` |

### The Stop hook (s1)

Prompts, in order: `Reply with the single word apple.` under
`stop-block`; `Reply with the single word cherry.` under `stop-context`;
then under `log` a background subagent that runs
`timeout 40 tail -f /dev/null; echo finished`, and a one-shot wakeup ten
minutes ahead. The screen after the first two:

```
❯ Reply with the single word apple.
● apple
● Ran 2 stop hooks
  ⎿  Stop hook error: probe: reply with the single word pineapple, then stop
● pineapple
❯ Reply with the single word cherry.
● cherry
● Ran 2 stop hooks
  ⎿  Stop hook feedback: probe: reply with the single word pineapple, then stop
● pineapple
```

The second hook of the two is a sound hook of the user's settings. Every
Stop input of the session:

```
$ cd ~/projects/scratch/sdd-probe-2/r16 && jq -c '{stop_hook_active, last: (.last_assistant_message | .[0:24]), background_tasks, session_crons}' s1/Stop.log
{"stop_hook_active":false,"last":"apple","background_tasks":[],"session_crons":[]}
{"stop_hook_active":true,"last":"pineapple","background_tasks":[],"session_crons":[]}
{"stop_hook_active":false,"last":"cherry","background_tasks":[],"session_crons":[]}
{"stop_hook_active":true,"last":"pineapple","background_tasks":[],"session_crons":[]}
{"stop_hook_active":false,"last":"started","background_tasks":[{"id":"afb3d29d6abd3644d","type":"subagent","status":"running","description":"Run timed tail command","agent_type":"general-purpose"}],"session_crons":[]}
{"stop_hook_active":false,"last":"The background subagent ","background_tasks":[],"session_crons":[]}
{"stop_hook_active":false,"last":"scheduled","background_tasks":[],"session_crons":[{"id":"b6b4ff86","schedule":"15 20 * * *","recurring":false,"prompt":"probe wakeup"}]}
```

No Stop input carries an agent id. The subagent's own stop went to
SubagentStop, with `agent_type` `general-purpose` and an `agent_id`
equal to the task's `id` above; five more SubagentStop inputs carry an
empty `agent_type` and are the host's own helpers.

### The permission prompt (s3, s6)

s3, prompt: `Run these four commands one at a time, each as its own shell call, and go on to the next when one is denied: touch a1; touch a2; touch a3; touch a4. Then reply done.`
Then: a subagent that runs `touch b1` once. The screen showed
`4 actions not run · permission denied` and
`Denied by PermissionRequest hook`, no dialog opened, no pause of auto
mode followed the four denials, and every call's result read
`probe: denied, go on to the next command` as a tool error, the
subagent's too. No file was created.

```
$ cd ~/projects/scratch/sdd-probe-2/r16 && jq -c '[.tool_input.command, (.agent_id // null), (.agent_type // null)]' s3/PermissionRequest.log && jq -c 'select(.ev=="tool.call") | [.tool, .agentId]' s3/module.log
["touch a1",null,null]
["touch a2",null,null]
["touch a3",null,null]
["touch a4",null,null]
["touch b1","aa4a2a3b9bc6cf8e1","general-purpose"]
["Bash",null]
["Bash",null]
["Bash",null]
["Bash",null]
["Agent",null]
["Bash","aa4a2a3b9bc6cf8e1"]
```

All five hook inputs carry one `session_id`, the main session's, the
one the module's `$.session.id()` read (compared whole).

s6 put a settings hook that allows beside the plugin's hook that
denies. `touch c1` and `touch c2` ran, each marked
`Allowed by PermissionRequest hook`, although the plugin's hook had
received both and answered deny. With `sleep 2` added to the allowing
hook, `touch c3` and `touch c4` were refused,
`Denied by PermissionRequest hook`. Two calls each way: the first hook
to answer decided.

### The MCP server's question (s4)

Prompt: `Call the tool mcp__probe__ask once and reply with its result text verbatim.`
No dialog opened; the reply was `elicitation answered: decline`.

```
$ cd ~/projects/scratch/sdd-probe-2/r16 && cat s4/elicit.log && jq -c '[.mcp_server_name, .mode, .message]' s4/Elicitation.log
{"result":{"action":"decline"},"jsonrpc":"2.0","id":"probe-elicit"}
["probe","form","probe question"]
```

### The session's history and the module's line (s5a, s5b, s5c)

s5a: two prompts, `/clear`, a prompt, `/compact`, a prompt. s5b:
`--continue`. s5c: the fork, then `/clear` and a prompt. The hook's
sources, then the module's lines as event, session (first four
characters), `turns()`, `messages()` count and, from s5b on, the last
messages as role and text length:

```
$ cd ~/projects/scratch/sdd-probe-2/r16 && for s in s5a s5b s5c; do jq -c '[.source, .session_id[0:4]]' $s/SessionStart.log; jq -c 'select(.ev!="tool.call") | [.ev, .sessionId.value[0:4], .turns.value, .messages.value, (.roles.value // null)]' $s/module.log; done
["startup","d58b"]
["clear","e855"]
["compact","e855"]
["session.start","d58b",0,0,null]
["turn.start","d58b",1,1,null]
["turn.start","d58b",2,4,null]
["turn.start","e855",2,2,null]
["turn.start","e855",6,8,null]
["session.start","e855",6,9,"u130 u33 a0 a5 u3823 u134 u92 u32 a4"]
["resume","e855"]
["session.start","e855",4,5,"u3823 u134 u92 u32 a4"]
["fork","b529"]
["clear","26ff"]
["session.start","b529",4,5,"u3823 u134 u92 u32 a4"]
["turn.start","26ff",2,2,"u130 u32"]
```

The third `session.start` of s5a is not a process start: the module's
file was edited while that session was open, the host reloaded the
plugin and ran `session.start` again. At the resume and at the fork the
screen showed the module's line, headed by the plugin's name, and no
line from the SessionStart command hook, as in entry 4. After a clear
the first turn finds two messages, the clear's own record and the
prompt.

### The hook's process

```
$ cd ~/projects/scratch/sdd-probe-2/r16 && cat s*/env.log | jq -r '[.event, .names, .budget] | join(" | ")' | sort | uniq -c
      1 Elicitation | CLAUDE_PLUGIN_DATA CLAUDE_PLUGIN_ROOT  | unset
      9 PermissionRequest | CLAUDE_PLUGIN_DATA CLAUDE_PLUGIN_ROOT  | unset
     10 SessionStart | CLAUDE_PLUGIN_DATA CLAUDE_PLUGIN_ROOT  | unset
     17 Stop | CLAUDE_PLUGIN_DATA CLAUDE_PLUGIN_ROOT  | unset
     13 SubagentStop | CLAUDE_PLUGIN_DATA CLAUDE_PLUGIN_ROOT  | unset
```

The option was never configured, only declared with a default, and no
`CLAUDE_PLUGIN_OPTION_BUDGET` reached any hook.

### Not covered

- A configured option's value in a hook's process.
- What the transcript calls read just after a compaction, before any
  prompt.
- An account of another plan, and a machine with managed settings.
- More than four denials in a row, and auto mode's total of twenty.

### Leftovers

Every `tmux` session of the probes was killed when its probe ended, and
the wakeup with it. No file `a1` to `a4`, `b1`, or `c1` to `c4` is left.
The probe plugin, the scratch repository's `r16/` and its two new files
under `settings/` stay for the owner, with the folder's trust flag of
entry 4.

### Pinned values

- A plugin's command hook under the security default: runs at Stop, SubagentStop, PermissionRequest, Elicitation and SessionStart
- Stop, `decision: "block"`: continues, shown as `Stop hook error`, next input `stop_hook_active: true`
- Stop, `hookSpecificOutput.additionalContext`: continues, shown as `Stop hook feedback`, next input `stop_hook_active: true`
- `background_tasks` beside a live subagent: one entry, `type` `subagent`, `status` `running`, `agent_type` set; after it reported: empty
- `session_crons` beside a one-shot wakeup: one entry, `recurring: false`, `schedule` with minute and hour and no day
- A subagent's stop: SubagentStop with its `agent_id`, never Stop
- PermissionRequest deny: no dialog; the message is the tool's error; four in a row, no pause of auto mode
- In a subagent: the hook input's `session_id` is the main session's, and its `agent_id` equals the module's `agentId`
- Two PermissionRequest hooks with different answers: the first to answer decides
- Elicitation `action: "decline"`: no dialog; the server received `{"result":{"action":"decline"},"jsonrpc":"2.0","id":"probe-elicit"}`
- Transcript calls: new start 0 messages; after a clear 2 at the first turn's start, the clear's record and the prompt (so 1 before it, inferred); at a resume and a fork the kept history, last message the assistant's
- `$.ui.log` at a resume and at a fork: shown, headed by the plugin's name; `session.start` runs again at a plugin reload
- A plugin option at its default: no `CLAUDE_PLUGIN_OPTION_<KEY>` in a hook's process

## 7. Ship noask's guard, fence and question refusal (2026-11-20)

On 2026-11-20 the plugin moved to version 0.3.0 with the first step of
noask, the switch under which a session rules for itself instead of
asking the owner, as the design
`docs/superpowers/specs/2026-10-30-sdd-plugin-design.md` describes it at
revision 20 (`c7163e4`), which this build did not edit. The build
followed the plan of noask's first step, a local working document, in
seven tasks: sixteen commits on the base `c7163e4`, `2b4fa2d` to
`2f0e8a4`, and this entry's commit. The command `bin/noask` and its rule
text `scripts/noask-rule.md` predate the build; this step adds the count
entry to the command, the hooks module that reads the markers, `/noask`
in a session with its wake-up turn, the refusal of a question and of a
plan approval under noask, the fence on the calls that need the owner,
and the guard on the switch in every session.

### What was built

- Task 1, `2b4fa2d`: five of the six review leftovers below, and the
  platform test. With a bash older than 5, without `flock`, or with a
  `date` that does not read `-d @0`, as off Linux, `status` prints `off`,
  the bare command `noask: off`, and every other form exits 1 with
  `noask: this command needs Linux with bash 5, GNU coreutils and flock; noask is not available here`.
  A session's `on` beside an unreadable global marker says that marker
  holds every session. A marker's offset is `[+-]HH:MM` from `00:00` to
  `14:00`, and a marker longer than 4096 bytes is unreadable.
- Task 2, `da23cb5` and `a24152e`: the count entry,
  `noask --session <id> [--agent <agent id>] count question|denial|continuation <budget>`,
  `count reset` and `count read`, which charges the session's record
  `budgets.d/<id>`, or a subagent's `budgets.d/<id>.<agent id>`, under
  the records' lock, and the switching commands' sweep of the records.
  A record that does not parse is started again, with a line on standard
  error. `a24152e`, from the task's review: a record that is there and
  cannot be read makes the count fail (exit 1) and stays as it is, since
  starting it again would clear a spent budget inside its generation.
- Task 3, `14971ee`: the rule text keys the word to publish on the last
  word of the `noask` command's status line, and the unit controller's
  overrides make a step outside the worktree (a push, a message to a
  person, a deploy, a write to a database the run does not own) no
  ruling: without `Mode: handsoff` the controller returns `needs-ruling`,
  with it the unit is parked.
- Task 4, `a8fcf16`: the module's reader of the markers,
  `hooks/marker.ts`, which refuses the texts the command refuses; the
  caller of the count entry, `hooks/count.ts`; the manifest's three
  options and `hooks/hooks.json`; the main loop's turn state,
  `sdd.mainTurn`; and `inTime`, which bounds every file call a hook waits
  on to 2 seconds.
- Task 5, `ab9b82d`, `6ea10f3` and `9e1f185`: `/noask`, registered at
  every session start. It runs the command by its argument vector with
  the session's id, shows its lines, ends every accepted `on` on the line
  that says what this release does not do yet, and submits the wake-up
  turn to an idle session that holds a message. `6ea10f3` takes the
  wake-up's looks (the transcript, the rule text, the turn) in the hook,
  each bounded, before it answers, and submits once it has answered;
  `6ea10f3` and `9e1f185` carry the origin rule (R9 and R10 below).
- Task 6, `8067b62` to `2f0e8a4`: the fence's scan of a shell command,
  `hooks/fence.ts`, held to the table `tests/fence-rows.txt`, which
  `tests/gen-fence-rows.sh` prints as `hooks/fence.rows.ts` and
  `tests/check-fence-rows.sh` runs under bash; and, in `51e9a5d`, six
  tool-call registrations in `hooks/register.tsx`, each with a `.catch`
  handler that denies in the hook's place: the question tool and the plan
  approval, refused under noask; the shell and the three file tools,
  fenced under noask and guarded in every session. The later commits came
  from the task's review rounds: `3cd3213` reads arithmetic as the shell
  does, where a shift opens no here-document; `c9e9113` keeps both
  readings of a double parenthesis (R13); `599f4bd` bounds the scan's
  work and orders the bodies of the here-documents (R14); `3861ecd`
  refuses a here-document that a substitution leaves open (R15) and
  charges the judging of a command's arguments to the work; `a63b29f`
  watches the substitutions inside a backtick substitution's text;
  `2f0e8a4` states the limit inside a double parenthesis read as
  commands (R17) and pins it with two records.
- Task 7, this entry's commit: the README's Noask section and its lines in
  Requirements, Develop and Uninstall; the sentences on the three noask
  tests in `tools/README.md`; CI's pin of Claude Code 2.1.325, its steps
  `claude plugin test .` and `bash tests/check-fence-rows.sh`, and
  `bin/noask` on its shellcheck line; the description in
  `hooks/hooks.json`; and version 0.3.0.

### What waits for the next release

The next step has a plan of its own. A permission prompt and an MCP
server's question still wait for the owner; the next release denies them
by command hooks in `hooks/hooks.json`, which entry 6 saw run. A turn that
ends without an end-of-turn line still ends; the next release continues
it at Stop, where it also resets the counters (the `count reset` of this
step has no caller yet) and charges the continuation budget, whose option
is the next step's. A session's start prints no line, and the command is
not linked into `~/.local/bin`. Until then every `on` the command accepts
in a session ends on
`noask: this release refuses questions and fences outward calls only; a turn that ends on a question in plain text, a permission prompt and a tool server's question still wait for you`,
and the README asks the owner not to leave sessions to noask overnight.

### The plan's decisions

Where the spec leaves the shape to the builder, the plan decided:

1. The count entry's words, its one line and its exits. The words are
   above. The module hands over the budget from its options, so the
   command reads no settings. A count prints one line on standard output,
   `off` when the session is not under noask, else
   `counted <spent> <refusals> <denials> <continuations>`, the record as
   it then stands, which the module reads with one pattern; any other
   line, and any exit but 0, is a failed count, and the refused call is
   refused all the same, the failure named in its text. The exits are 0
   for both lines, 1 for a failure (the records' directory, its lock, or
   the record's read, write or read-back), and 2 for a wrong argument.
2. The records' one lock, `budgets.d/.lock`: every count that finds the
   session under noask waits up to 2 seconds for it, never for the
   switch's lock, and a switching command's sweep of the records takes it
   after its own lock, without waiting, and leaves the records alone when
   it is busy. One lock for all the records serialises a sweep's look at
   a record and its removal against a count's read, write and rename, and
   the order is always the switch's lock, then the records'.
3. The record's five lines, `generation=`, `refusals=`, `denials=`,
   `continuations=` and `spent=`, the third counter and the spent value
   `continuation` already there for the next step. A count under an
   unreadable marker, which has no generation to match, keeps the record
   and its generation, an empty one for a new record; such a record
   matches no reading, so the sweep removes no record while a marker is
   unreadable, which would start a spent budget again.
4. The reserved words: a session id is none of the command's own words
   (`status`, `on`, `off`, `global`, `handsoff`, `until`, `count`,
   `reset`, `read`, `question`, `denial`, `continuation`), so
   `--session on` is a wrong argument whatever follows, and the module
   reads such an id as no usable id.
5. The repeated hour: `until HH:MM` in an hour that a clock change
   repeats takes the earlier of its two passes still ahead, so the switch
   ends the first time the clock shows that time.
6. The narrowing line: a switching command narrows to the owner, under
   its lock, each of the state directory, `noask.d` and `budgets.d` that
   grants its group or others any bit (`chmod go-rwx`; a mode with no such
   bit, 500 included, is left as it is), and says so after its own lines,
   `noask: narrowed <path> to the owner (it was <octal mode>)`, so that
   a directory a wide umask made is put right where the owner sees it.
7. The guard's reading of a shell command, rules 9 and 11 of the plan's
   twelve. Rule 9: after `noask`, any argument but one `status` alone is a
   switch, and so is `noask` or `noask status` after a `NAME=value` word
   of its simple command. Rule 11: a simple command that sets a variable
   whose name starts with `SDD_NOASK_` is a switch, by a leading
   `NAME=value` word, alone or before any command, or by `export`,
   `declare`, `typeset`, `readonly` or `local`; a word that only reads one
   is none. The two reading forms pass because a session reads the status
   with them before a ruling, and the apply skill before it publishes.
   The settings are refused because the command's test seams move its
   clock (`SDD_NOASK_NOW`) and its lock wait (`SDD_NOASK_LOCK_WAIT`):
   `SDD_NOASK_NOW=<a time after the expiry> noask status` would read a
   switch that is on as expired.
8. The wake-up turn for every session with a message: an `on` that
   exited 0, in a session whose main loop is idle and whose transcript
   holds a message, submits one turn as the owner's words, which tells
   the session to answer its own last question under the rule or to end
   its turn; a new session's empty transcript has nothing to answer.
   Entry 6 found that a cleared session's transcript is not empty, and a
   resumed, forked or compacted one may end on a question, so the history
   decides, not how the session started.

### What the reviews of the plan added

Each review was written into the design as a revision, 18 to 20.

The review of 2026-11-16 added:

- The budgets of this step, per activation: with no Stop entry to reset
  them, a budget counts every refusal since the switch went on, and only
  a new generation starts the counts again.
- The guard's two texts: under noask with the fence on, the fence's text,
  counted as a denial; otherwise `SWITCH_TEXT`, counted nowhere.
- The records' lock around the sweep, and no sweep of the records under
  an unreadable marker.
- A count after an `off` and an `on`, charged to the new generation: a
  record of another generation is started again under the reading's.
- The offset's grammar and the times that must read back: an offset past
  14 hours or with 60 minutes, a time that is no calendar time (30
  February, 24:00) and a marker without its final newline are unreadable
  to both readers.
- `BAD_MARKERS`: `hooks/marker.fixtures.ts` holds the command's own
  reading of each text that is not as the command writes it, printed by
  `tests/gen-marker-fixtures.sh` and held to its output by case 45 of
  `tests/test-noask.sh`, and the module's tests read every one the same.
- The option values of `env` and `exec`: an option that takes the next
  word as its value no longer hid the command behind it. The next day's
  run of the rules as commands replaced this reading (below).
- The ancestors in the removal rule: `rm` or `rmdir` of the home,
  `~/.local` or `~/.local/state`, and a move of one of them away, are
  refused as the removal of a marker is.
- The listing that fails: while the home cannot be listed, a path whose
  first part below the home starts with `.claude` counts as one under a
  configuration directory.
- A session without an id beside an unreadable session marker: a
  session with no usable id reads the global marker, unless a marker in
  `noask.d` reads on or unreadable, or `noask.d` cannot be listed; then
  its reading is unreadable, which holds it under noask.

The second check of 2026-11-17 added:

- A redirection read once, for the cut into simple commands, for the
  plain push and for the guard: its target is no word of the command, and
  `&>>`, `>& file` and `<>` write as `>` does.
- `mv`'s sources and not its destination: a move is judged by what it
  moves, so a file moved into the home is no switch.
- One offset form, to `14:00`, in a generation as in a time.
- The sweep's moment: it reads the markers as they stand after its own
  command's switch; and no sweep of the records under a `noask.d` that
  cannot be listed.
- `budgets.d` made by a count alone: a switching command never makes it,
  and with none it has nothing to sweep and takes no second lock.
- What a failed listing of the home leaves open is a stated limit: a
  configuration directory that is a link, other than `~/.claude` and the
  one `CLAUDE_CONFIG_DIR` names, is guarded by its name and not by where
  it points. Every edit is not denied then, since one listing that hangs
  would spend a night's denial budget.

Running the rewritten rules as commands added, the same day:

- No option of a prefix command read for a value: after `env`,
  `command`, `exec`, `nohup` or `sudo` (R20 below adds `doas`, `eval`
  and seven runners), every later word that names a command the fence
  reads (`git`, `gh`, `glab`, `noask` and the thirteen file programs) is
  read as that command, since two `env` programs disagree on which
  options take a value and a list of them was wrong twice. What that
  refuses beyond need, a line where such a name is another command's
  argument (`sudo grep -rn noask docs`), the README states.
- `time -p`: `time` and its options are leading words.
- A pattern in a path matched part by part, so `rm -rf ~/.local/state/*`
  is the removal it is; a brace list is not read, a stated limit.
- `<home>/.claude` and the directory `CLAUDE_CONFIG_DIR` names resolved
  without the listing, by calls started beside it, so the limit above is
  of the other entries.

The third check added:

- A substitution no cut of the command that holds it:
  `git -C "$(pwd)" push` is a push, one other than a plain one.
- A word's literal value by quote removal, wherever its quotes and
  backslashes stand, for a command's name, a path and a here-document's
  delimiter.
- No descriptor before `&>`.
- A plain push of literal words and a remote's name: a pattern, a
  variable, a substitution, or a remote given as a URL makes a push other
  than a plain one.
- `mv`'s destination option in its short spellings (`-t`, alone or as the
  last of a word's short options) as in its long ones, down to `--t`, and
  `--exchange`, down to `--e`, which moves both paths.
- The pattern match a little wider than the shell's: a set stands for any
  one character, and a leading dot is matched like any other.
- A `noask.d` that cannot be searched holds the sweep of the records back
  as one that cannot be listed.
- Two limits, named in the README: a copy that brings a folder named
  `sdd` into the folder above the state directory, and a spelling built
  to hide a command from the scan, which passes as a wrapped one does.
- The table run under bash with stubs: `tests/check-fence-rows.sh` runs
  every record of the table under bash, with logging stubs in place of
  the programs the fence names, and holds what ran against the record's
  hits. With that the owner ended the review rounds on spellings
  (2026-11-17).

### The six review leftovers

The minor findings that the reviews of the build of `bin/noask`
(2026-11-15) left to this step, and where each landed:

1. The command took its own words as session ids: Task 1, `2b4fa2d`
   (the reserved words, decision 4).
2. `until HH:MM` in the repeated hour of a fall-back day: Task 1,
   `2b4fa2d` (decision 5).
3. The state directory took the umask's mode: Task 1, `2b4fa2d` (made at
   700, and the narrowing line, decision 6).
4. Misleading parser reasons: Task 1, `2b4fa2d`.
5. Unpinned test behaviours (the reason given for a FIFO, an empty
   `HOME`, the silent skip as root): Task 1, `2b4fa2d`.
6. `bin/noask` missing from the shellcheck lines, and `tools/README.md`
   without the two noask tests: Task 7, this entry's commit.

### Rulings during the run

The run's own rulings that changed what was built beyond the plan's
text, by the run's numbers, each with what it would cost if it were
wrong. The sentences that R9 and R10, R14, R15, R17, R20 and R21 add to
the spec, and the texts `OWNER_ONLY_LINE`, `TOO_COMPLEX_TEXT` and
`LEFT_OPEN_TEXT` in `hooks/text.ts`, wait for the spec's revision 21,
where the owner confirms them.

- R2. The plan tested for GNU `date` by `date --version`, which here
  names uutils coreutils, where the command works; the platform test is
  what the command needs from `date`, that `date -d @0 +%s` prints `0`
  (BSD's fails there). Cost if wrong: a `date` that passes the probe and
  differs from both GNU's and uutils' elsewhere is let in.
- R3. The two `date` programs answer a wall time that occurs twice with
  different passes (uutils' the first, GNU's the second), so the command
  looks at the hour before and after its answer and takes the earliest
  pass after now. Cost if wrong: none seen; case 32's three expected
  values pin it under both programs.
- R9 and R10 (the owner, 2026-11-18, and the driver's correction to the
  owner's answer the same day). Only the bare `/noask` and
  `/noask status` run for every origin; every other form runs only when
  the owner typed it, at the prompt (`composer`) or through the Remote
  Control bridge (`bridge`). From any other origin nothing is run,
  submitted or toasted, and the text is
  `noask: /noask switches only when the owner types it; nothing changed`.
  Cost if wrong: an owner's route that is neither (`claude -p`, a
  scheduled prompt of the owner's own) cannot switch noask or run a count
  form through `/noask`, and uses the terminal instead.
- R13 (the owner, 2026-11-18). Wherever the scan chooses between an
  arithmetic reading and a command reading of one text (`$((...))`, and
  a `((...))` where a command stands), it keeps the hits of both
  readings; `$[...]` and an arithmetic `for` have no command reading.
  Cost if wrong: a text bash runs as arithmetic that reads as a command
  the fence names is refused (`((git push))`); the table's records whose
  hits changed say why bash and the scan differ.
- R14 (the owner, 2026-11-18). Each nested text is read once for each
  reading, and the scan counts its work; once its limit is spent the
  command is 'a command too complex to read', which the guard denies in
  every session with `TOO_COMPLEX_TEXT`, uncounted, and the fence under
  noask with its text, counted. A command the scan cannot read to its end
  is refused, never passed. The limit is set so that a hook's scan and
  its `.catch` handler's second scan of the same command end well inside
  the handler's 1 second. Cost if wrong: a long or deeply nested command
  that bash would run harmlessly is refused in every session; the README
  states the room the limit leaves.
- R15 (the owner, 2026-11-18). A command in which a substitution closes
  while a here-document opened inside it is still open is 'a
  here-document left open by a substitution', denied as R14's kind is,
  with `LEFT_OPEN_TEXT` outside noask; not inside the text of a double
  parenthesis read as commands (or every shift, `$((1<<2))`, would be
  refused), and not for a here-document opened outside the substitution.
  The same round charged the judging of a command's arguments to the
  scan's work, and the `.catch` handler names both refusals without
  reading `HOME`. Cost if wrong: a command that bash runs with a warning
  (`x=$(cat <<B)`, its body on the lines after) is refused in every
  session.
- R17 (the owner, 2026-11-20). Inside the text of a double parenthesis
  read as commands, a here-document that a substitution leaves open is a
  stated limit of the fence and the guard: the scan may read the lines
  after it in an order that is not bash's, and miss a push or a switch
  there, or refuse a line that bash reads as a body. No further review
  round; the table's last two records pin it. Cost if wrong: the
  guard misses these layouts in every session; a later fix is one
  commit.
- R20 (the owner, 2026-11-20, on the three Important findings of the
  final review). The watch tool, which runs a shell command and takes
  each line it prints as an event, gets a seventh tool-call registration
  with the same `.catch`: its command is guarded and fenced as the shell
  tool's is, and a watch of a socket, which holds none, goes on.
  `timeout`, `nice`, `ionice`, `setsid`, `stdbuf`, `xargs`, `flock`,
  `doas` and `eval` are prefix commands, read as `sudo` and `nohup` are;
  `eval`'s words are not joined and read again, so a quoted
  `eval "git push"` passes. An edit below the `plans/` folder of a
  configuration directory, where a session in plan mode saves its plan,
  passes the fence (never the guard), as spelled and by where it lands,
  and only when its path is resolved in time: while it cannot be, the
  path is judged by its spelling with no exception, so a plan's write is
  refused then. The folder itself and a `plans` folder deeper in the
  directory are no exception, and a memory note under
  `projects/<project>/memory/` stays refused and counted. The gate
  outputs quoted below are Task 7's, from before this change. Cost if
  wrong: a push behind a runner is refused where a plain push is
  allowed, a name the fence reads that stands as another command's
  argument behind a runner brings a refusal not earned
  (`timeout 5 grep -rn noask docs`), and an edit of a plan under noask is
  no longer refused; one commit to revert per part.
- R21 (the owner, 2026-11-21, on the run's Minor findings). A pass after
  the final review, its code first and its prose after. The plans
  exception holds only while the home is listed and every configuration
  directory's resolution answered, one that is not there counting as
  answered; otherwise a path under any of them is refused as before the
  exception. A `CLAUDE_CONFIG_DIR` spelled with `~` is also a directory by
  where its expanded spelling resolves. A remote given as a path (the
  first word after `push` other than its option, when it holds a `/`, is
  `.` or `..`, or starts with `~`) makes a push other than a plain one; a
  branch may hold a `/`. A subagent's refused plan approval gets the
  role's text, still counted nowhere. A form of `/noask` that switches
  nothing and could not run says
  `noask: the command could not run: <message>` with no toast,
  while a switch keeps `noask: the switch could not run: <message>` and
  its toast; the line for a form the owner did not type is now
  `noask: /noask acts only when the owner types it; nothing changed`.
  `count read` says of a record that does not parse that it was read as
  an empty one and left as it is. The fence takes the timed-out reason
  from the marker reader, the `.catch` handlers share one wiring, each
  timed test holds the fastest of three runs to the same 250 ms, the
  tests use a neutral home, and the fence option's description has a
  subject. The README states the scan's room as measured at this pass's
  head, as the work limit's comment does too: the size of plain script
  always read (plain being lines that each hold one simple command of
  words made only of ASCII letters and digits, `.`, `_`, `-` and `/`,
  separated by spaces or tabs, whose first word is no path, reserved
  word, prefix command or file program; each feature the class admits
  was measured alone at its densest) and what costs more and can be
  refused far sooner, such as a word at a command's start or a line of
  here-documents. It also names `rm -rf ~/*` and four more refusals
  beyond need; says that `global off` leaves a session's own switch on,
  that the shell tool and the watch tool are the only tools hooked for a
  command, and that a write through a link the guard cannot follow in
  time, or to a file not there yet, passes it as it passes the fence;
  and lists among what passes the spellings, the declaration behind a
  prefix command, the two quoted substitutions and the here-document
  layouts that the scan does not read as bash does. The Gates below say
  which gates ran before the last wording edits; their outputs stay
  Task 7's. Cost if wrong: one commit to revert per item.

### Not covered

- No session ran with the plugin loaded during the build: the module is
  proven by `claude plugin test .`, the command under a temporary home.
  So the wake-up turn's submission after the hook has answered, which the
  test kit refuses while the hook is in flight, is unchecked on the live
  engine; a refused submission raises a toast.
- The gates ran on the local Claude Code, 2.1.329. Whether CI's pinned
  2.1.325 accepts the module is unchecked until the first push.

### Gates

At the repository root, in the working tree before this entry's commit,
the gates of this task, run one after another. `claude plugin test .`,
the type check, `bash tests/run.sh`, shellcheck and the fence's table
ran before the last wording edits of the README, this entry and the CI
workflow's comment, none of which they read; the three `grep` commands,
`jq` and the validation ran again on the final text and printed the same.
The output is whole but for one cut: of `claude plugin test .`
the command line and its closing lines are quoted, and the 636 lines
`(pass) <test> [<time>]` under the names of its five test files are left
out. Only the home directory is written as `~`:

```
$ /bin/grep -nP '[\x{2014}\x{2013}]' README.md tools/README.md
$ /bin/grep -c 'AskUserQuestion\|ExitPlanMode\|TodoWrite\|ProposeGoal\|subagent_type' README.md
0
$ /bin/grep -nP '[\x{2014}\x{2013}]' docs/decisions.md .github/workflows/test.yml .claude-plugin/plugin.json hooks/hooks.json
$ jq . .claude-plugin/plugin.json hooks/hooks.json > /dev/null
$ claude --version
2.1.329 (Claude Code)
$ claude plugin validate . --strict
Validating plugin manifest: ~/projects/akalongman/claude-sdd/.claude-plugin/plugin.json

  ❯ types ./types/index.d.ts declares on $: nothing (no EngineInterface member)
  ❯ types ./types/index.d.ts declares state: sdd.mainTurn

Validating hooks: ~/projects/akalongman/claude-sdd/hooks/hooks.json

  ❯ ./register.tsx hooks: tool.call{tool=AskUserQuestion}, tool.call{tool=ExitPlanMode}, tool.call{tool=Bash}, tool.call{tool=Edit}, tool.call{tool=Write}, tool.call{tool=NotebookEdit}, session.start, turn.start, turn.complete, command.run{command=noask}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=AskUserQuestion}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=ExitPlanMode}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=Bash}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=Edit}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=Write}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=NotebookEdit}
  ❯ ./register.tsx gating hook without .catch: command.run{command=noask}
  ❯ ./register.tsx calls: $.clock.after (via inTime), $.clock.now (via mayPublish, readNoask), $.clock.sleep (via submitWakeUp), $.command.register, $.env.get (via configRoots, homeOf, stateDirectoryOf), $.fs.exists (via lookAt, readingWithoutId), $.fs.list (via listingOf, readingWithoutId), $.fs.read (via lookAt, readRule), $.fs.stat (via statOf), $.process.run (via countOn, runCommand), $.prompt.submit (via submitWakeUp), $.session.cwd (via directoryFor), $.session.id (via sessionIdOf), $.session.messages (via transcriptOf), $.state.get (via mainTurnOf), $.state.set, $.ui.toast (via toast)
  ❯ ./register.tsx env writes: nothing
  ❯ ./register.tsx env reads: CLAUDE_CONFIG_DIR, HOME
  ❯ ./register.tsx state writes: sdd.mainTurn
  ❯ ./register.tsx state reads: sdd.mainTurn
  ❯ ./register.tsx types: not checked (the mod names dependencies, whose contracts are laid as links out of the mod's folder; validate reads nothing outside it)

Provides:

  ❯ modules: hooks/register.tsx
  ❯ skills: sdd:apply
  ❯ agents: sdd:implementer
  ❯ agents: sdd:reviewer
  ❯ agents: sdd:unit-controller
  ❯ bin: noask
  ❯ bin: sdd-checkpoint
  ❯ bin: sdd-files-add

Hosts not read for: modules (1), skills (1), bin (3)
Hosts not declared: list what these parts reach under "network.hosts" in plugin.json

Plugin directory checks for ~/projects/akalongman/claude-sdd. The plugin directory is the catalog that plugins are submitted to; this is a subset of what it runs.

⚠ Found 1 plugin directory warning:

  ❯ .claude-plugin/plugin.json icon: No icon (ICON_MISSING). No icon found in the plugin. The validator looked for `icon` in plugin.json and for a file at .claude-plugin/icon.png or .svg, assets/icon.png or .svg, or a similar path.
    Fix: Add a square PNG to the plugin folder at .claude-plugin/icon.png, or set `icon` in plugin.json to the path of a square PNG or JPEG in the plugin: 512 to 2048 px on each side, under 2 MB. SVG and WebP are not accepted. That file may become the listing icon only once: the first time the plugin is saved or submitted in the developer portal. Adding or changing it later does not change the icon.

About these checks:

  ❯ hooks/hooks.json names a hooks module (a code file listed under `modules`). The plugin directory has rules of its own for such code, and these checks apply none of them, so passing here does not mean the directory accepts the plugin. The developer portal's own validation applies those rules.

These plugin directory checks do not change the result below.

The directory also runs a safety scan and a policy review that this command does not.

✔ Validation passed
$ claude plugin test .
 636 pass
 0 fail
Ran 636 tests across 5 files. [6.64s]
$ npx -y -p typescript@5.9.3 tsc -p . --noEmit
$ bash tests/run.sh
ok 19336/19500 (substituted)
ok check-skill-size
ok check-pause-text
ok check-pause-text
ok check-noask-reference
ok check-isolated-reference
ok 1
ok 2
ok 3
ok 4
ok 5
ok 6
ok 7
ok 8
ok 9
ok 10
ok 11
ok 12
ok 13
ok 14
ok 15
ok 16
ok 17
ok 18
ok 19
ok test-run-archive
ok 1
ok 2
ok 3
ok 4
ok 5
ok 6
ok 7
ok 8
ok 9
ok 10
ok 11
ok 12
ok 13
ok 14
ok test-sdd-checkpoint
ok kept-file
ok kept-new
ok kept-range
ok kept-line
ok kept-dot
ok folder
ok no-folder
ok no-root-file
ok new-no-folder
ok space
ok trailing-slash
ok glob
ok method
ok url
ok flag
ok variable
ok tilde
ok absolute
ok scoped
ok setting
ok bare-name
ok order
ok fence
ok indented-fence
ok stdin
ok subfolder
ok errors
ok test-named-paths
ok 1
ok 2
ok 3
ok 4
ok 5
ok 6
ok 7
ok test-briefs
ok 1
ok 2
ok 3
ok 4
ok 5
ok 6
ok test-source-copy
ok 1
ok 2
ok 3
ok 4
ok 5
ok 6
ok 7
ok 8
ok 9
ok 10
ok 11
ok 12
ok 13
ok 14
ok 15
ok 16
ok 17
ok 18
ok 19
ok 20
ok 21
ok 22
ok 23
ok 24
ok 25
ok 26
ok 27
ok 28
ok 29
ok 30
ok 31
ok 32
ok 33
ok 34
ok 35
ok 36
ok 37
ok 38
ok 39
ok 40
ok 41
ok 42
ok 43
ok 44
ok 45
ok test-noask
ok 1
ok 2
ok 3
ok 4
ok 5
ok 6
ok 7
ok 8
ok test-sub-skill-check
ok 1
ok 2
ok 3
ok 4
ok 5
ok 6
ok 7
ok 8
ok 9
ok 10
ok 11
ok 12
ok 13
ok 14
ok 15
ok 16
ok test-tools
ok 1
ok 2
ok 3
ok 4
ok 5
ok test-check-skill-size
ok 1
ok 2
ok 3
ok 4
ok 5
ok test-run
15 ok, 0 skipped, 0 failed
$ shellcheck bin/noask bin/sdd-checkpoint bin/sdd-files-add skills/apply/scripts/named-paths skills/apply/scripts/openspec-section-brief skills/apply/scripts/openspec-section-tick skills/apply/scripts/run-archive skills/apply/scripts/source-copy skills/apply/scripts/sub-skill-check skills/apply/scripts/task-brief tests/*.sh
$ bash tests/check-fence-rows.sh
ok 275 rows, 10 not run
```

Every command exited 0 but the three `grep` commands, which find nothing
and so exit 1, the pass here. The fence's table was then run again with
GNU coreutils first on PATH, by a helper of the run that links each
`/usr/bin/gnu*` program under its plain name, since this machine's plain
names are uutils coreutils and the CI runner has GNU's. It printed the
same line and exited 0:

```
ok 275 rows, 10 not run
```

The suite's totals line reads `15 ok, 0 skipped, 0 failed`, the module's
tests `636 pass` and `0 fail`, the table `ok 275 rows, 10 not run` under
both tool sets, and the validation passed with the warning of entry 5,
the missing icon, which is not this release's. The type check and
shellcheck printed nothing. The three `grep` commands, run again on this
entry's text with these outputs in place, printed the same and exited 1
again.

Result: pass. Nothing was pushed.

## 8. Ship noask's command hooks, its start line and its terminal command (2026-11-24)

On 2026-11-24 the plugin moved to version 0.4.0 with the second step of
noask: under noask a permission prompt is denied and a tool server's
question declined in the owner's place, a turn that ends without an
end-of-turn line is continued, every stop allowed on such a line or
beside a running subagent sets the counts back, a session's start shows
a line, and the command is linked into a terminal's PATH. The design is
`docs/superpowers/specs/2026-10-30-sdd-plugin-design.md` at revision 21
(`745074b`), which this build did not edit; the owner's seven rulings
below bound the build where they differ from it, and the spec's revision
22 is to take them in. The build followed the plan of noask's second
step, a local working document, in six tasks: five commits on the base
`745074b`, `ea0cf38` to `38f7957`, and this entry's commit. Before the
launch one probe settled four facts the plan leans on; it comes first.

### The probe of 2026-11-23

```
$ claude --version
2.1.330 (Claude Code)
```

The plan rests on four facts that no earlier probe reached: the name and
value under which a configured plugin option reaches a command hook and
what the transcript calls read just after a compaction (both under Not
covered in entry 6), the moment at which the host takes a command hook's
answer, and what the host does with a hook that runs past its timeout.
The probe ran on 2026-11-23, before the plan was revised on its answers,
in the scratch repository of entries 4 and 6
(`~/projects/scratch/sdd-probe-2`), with a third throwaway plugin,
`noaskprobe3`. No session had this plugin loaded. Its full record is part
of the plan's local material; this section is written from it.

The main findings:

- A configured option reaches every command hook of the plugin as
  `CLAUDE_PLUGIN_OPTION_<KEY>`, the key upper-cased, the value as a
  string, also when the configured value equals the default.
- The host takes a command hook's answer when the hook's process exits,
  not when its output is printed, redirected or closed. Until then the
  permission dialog is on the screen, the request is with the owner's
  other devices when Remote Control is on, and whoever answers first
  decides.
- A hook past its `timeout` is sent `TERM`, then killed half a second
  later, and everything it printed is thrown away, an answer printed
  long before the timeout included. The event then goes on as if the
  hook had not answered: a stop is allowed, a permission prompt waits for
  a person.

Three things went otherwise than planned. The account of entries 4 and
6, an account of a Team organization, was out of usage: its one session
started and showed its start line, and its first prompt met the account's
usage limit, so a session start is all that account saw. Every other
session ran on another account of the same machine, of another plan, so
the security default of a Team organization was not in play but for that
one start. That account's first start asked whether to trust the scratch
folder; it was answered "No, exit" once and then "Yes, I trust this
folder", as entry 4 did on its own account, which records the folder's
trust in that account's configuration directory: the one change outside
the scratch folder and the driving session's scratchpad. And the owner's
user settings start Remote Control in every session, so in the first
sessions each permission request also went to the owner's other devices,
and several were allowed from there (P3); from session p3d on, the
session's own settings file carries `"remoteControlAtStartup": false`,
and no later debug log holds a line of the remote bridge. No file of the
owner's configuration was edited for it.

#### Setup

`~/projects/scratch/sdd-probe-plugin-3`, a copy of entry 6's plugin,
never committed. Its manifest declares the four options this release
has, with the same keys and types: `denialBudget` (number, default 10),
`continuationBudget` (number, default 20), `permissionHook` (boolean,
default true) and `terminal` (string, `"options": ["link", "off"]`,
default `link`). `claude plugin validate` passes with one warning (no
author); it accepts the `options` list.

Its `hooks/hooks.json` is written by `scripts/set-timeout.sh <seconds>`
and registers one script at three events in the form this release uses:

```
{"type":"command","shell":"bash","command":"PROBE_SEAM= bash \"${CLAUDE_PLUGIN_ROOT}/scripts/hook.sh\" Stop","timeout":30}
```

SessionStart has the matcher `startup|resume|clear|compact|fork` and a
timeout of 30; Stop and PermissionRequest have 30, and 5 in session p4.
The script appends its standard input to `r22/<event>.log`, one line on
its own process to `r22/env.log` (the value of each of the four option
variables, the names of every other variable that starts with
`CLAUDE_PLUGIN`, never their values, and whether `PROBE_SEAM` reached
it), and timed lines to `r22/timing.log` (bash's `EPOCHREALTIME`, the
event, the mode, its process id). It answers by the word in the file
`probe-mode`:

| Mode | Event | What the script does |
|---|---|---|
| `log` | any | no answer (SessionStart always prints a `systemMessage`) |
| `deny-permission` | PermissionRequest | prints the deny object and exits |
| `deny-open` | PermissionRequest | prints deny, leaves its output open, sleeps 8 s |
| `deny-null` | PermissionRequest | prints deny, `exec >/dev/null`, sleeps 8 s |
| `deny-null-err` | PermissionRequest | prints deny, `exec >/dev/null 2>/dev/null`, sleeps 8 s |
| `deny-close` | PermissionRequest | prints deny, `exec >&-`, sleeps 8 s |
| `deny-close-all` | PermissionRequest | prints deny, `exec >&- 2>&-`, sleeps 8 s |
| `deny-bg` | PermissionRequest | prints deny, starts a background child with all three descriptors at `/dev/null` that sleeps 8 s, exits at once |
| `deny-bg-open` | PermissionRequest | the same, the child keeping the hook's output and error |
| `stop-overrun`, `perm-overrun` | Stop (a first stop), PermissionRequest | no answer; sleeps 20 s under traps that log `TERM`, `INT` and `HUP`, then sleeps 10 s more |
| `stop-answer-overrun`, `perm-answer-overrun` | the same | prints a block decision, or deny, at once, then as above |
| `stop-term-answer`, `perm-term-answer` | the same | sleeps 20 s; a trap on `TERM` prints the block decision, or deny, and exits 0 |

The module `hooks/register.ts` logs to `r22/module.log` what
`$.session.id()`, `$.session.turns()` and `$.session.messages()` read at
`session.start`, at each main-loop `turn.start`, before and after
`session.compact`, and when the command `/probeq` is typed (registered
with `$.command.register` and `immediate: true`, as this plugin's module
registers `/noask`); the time from each `tool.call` to its result
(`tool.done`, `ms`); and whether a value kept with `$.state` at an
earlier `session.start` is still there (`kept`).

Sessions were started in `tmux` as in entry 4, with
`--plugin-dir ~/projects/scratch/sdd-probe-plugin-3 --permission-mode auto`,
the account's configuration directory in `CLAUDE_CONFIG_DIR` and the
flags below. Options were set only through the session's `--settings`
file. After each session its logs moved to `r22/<session>/`.

| Session | Account | Extra flags | Modes, in order |
|---|---|---|---|
| p1-team | entry 6's | `--settings settings/r22-p1.json` | `deny-permission` (the start only) |
| p1 | the other | `--settings settings/r22-p1.json` | `deny-permission`, then `log` |
| p1-resume | the other | `--continue` | `log` |
| p3a | the other | `--settings settings/r22-ask.json` | the five `deny-*` sleep variants, `log` |
| p3a2 | the other | the same, `--debug-file` | `deny-close`, `deny-close-all`, `deny-null` |
| p3a3 | the other | the same | the five sleep variants |
| p3d | the other | `r22-ask.json` with Remote Control off, `--debug-file` | the five sleep variants, `deny-open` |
| p3e | the other | `--settings settings/r22-ask-allow3.json`, `--debug-file` | `deny-open`, `deny-null`, `deny-close-all`, `deny-permission`, `deny-bg`, `deny-bg-open` |
| p4 | the other | as p3d, hooks at `"timeout": 5` | the six overrun modes, `stop-overrun` twice |

`settings/r22-p1.json`:

```
{
  "permissions": { "ask": ["Bash(touch:*)"] },
  "pluginConfigs": {
    "noaskprobe3@inline": {
      "options": { "denialBudget": 3, "continuationBudget": 20, "permissionHook": false, "terminal": "off" }
    }
  }
}
```

`settings/r22-ask.json` holds the same ask rule alone, and from p3d on
`"remoteControlAtStartup": false`. `settings/r22-ask-allow3.json` adds a
PermissionRequest command hook of the settings, `settings/r22-allow3.sh`,
which sleeps 3 seconds and then prints an allow decision (entry 6's s6
with a longer sleep). Each debug log was written into the driving
session's scratchpad, its hook lines were copied to
`r22/<session>/debug-hooks.txt` with the home directory's name replaced,
and the full log was deleted.

Prompts were `Run the shell command \`touch <name>\` once, then reply
with the single word done.` for a permission prompt and
`Reply with the single word <fruit>.` for a stop.

#### P1: a configured option in a hook's process

Observed, on both accounts at SessionStart and on the other account at
all three events.

```
$ cd ~/projects/scratch/sdd-probe-2 && jq -c 'del(.others)' r22/p1/env.log | sort | uniq -c
      1 {"event":"PermissionRequest","optnames":"CLAUDE_PLUGIN_OPTION_CONTINUATIONBUDGET CLAUDE_PLUGIN_OPTION_DENIALBUDGET CLAUDE_PLUGIN_OPTION_PERMISSIONHOOK CLAUDE_PLUGIN_OPTION_TERMINAL ","DENIALBUDGET":"3","CONTINUATIONBUDGET":"20","PERMISSIONHOOK":"false","TERMINAL":"off","seam":""}
      2 {"event":"SessionStart","optnames":"CLAUDE_PLUGIN_OPTION_CONTINUATIONBUDGET CLAUDE_PLUGIN_OPTION_DENIALBUDGET CLAUDE_PLUGIN_OPTION_PERMISSIONHOOK CLAUDE_PLUGIN_OPTION_TERMINAL ","DENIALBUDGET":"3","CONTINUATIONBUDGET":"20","PERMISSIONHOOK":"false","TERMINAL":"off","seam":""}
      2 {"event":"Stop","optnames":"CLAUDE_PLUGIN_OPTION_CONTINUATIONBUDGET CLAUDE_PLUGIN_OPTION_DENIALBUDGET CLAUDE_PLUGIN_OPTION_PERMISSIONHOOK CLAUDE_PLUGIN_OPTION_TERMINAL ","DENIALBUDGET":"3","CONTINUATIONBUDGET":"20","PERMISSIONHOOK":"false","TERMINAL":"off","seam":""}
```

`r22/p1-team/env.log` holds the same SessionStart line (entry 6's
account, `startup`). The second SessionStart line of p1 is the `compact`
source.

| Option, as set | Variable | Value |
|---|---|---|
| `denialBudget: 3` (a JSON number) | `CLAUDE_PLUGIN_OPTION_DENIALBUDGET` | `3` |
| `continuationBudget: 20` (the default's value) | `CLAUDE_PLUGIN_OPTION_CONTINUATIONBUDGET` | `20`, present |
| `permissionHook: false` (a JSON boolean) | `CLAUDE_PLUGIN_OPTION_PERMISSIONHOOK` | `false` |
| `terminal: "off"` | `CLAUDE_PLUGIN_OPTION_TERMINAL` | `off` |

So an option configured to its default's value is present, where an
option never configured is absent. With nothing set, in a session resumed
without the settings file and in every later session
(`r22/p1-resume/env.log`, `r22/p3a/env.log`: 1 SessionStart, 6
PermissionRequest and 6 Stop lines), `optnames` is empty and all four
read `unset`, as entry 6 found.

The id under which the settings name a plugin loaded with `--plugin-dir`
is `<name>@inline`. `seam` is the empty string at every event of every
session: an assignment written before `bash` in the command string of a
hook with `"shell": "bash"` reaches the script.

#### P2: the transcript after a compaction

Observed in p1: a prompt (denied `touch`), `/probeq`, `/compact`,
`/probeq` before any prompt, a prompt, `/probeq`. Roles are the last
twelve messages as the role's first letter and the text's length, `t`
for a message with a tool use.

```
$ jq -c 'select(.ev|test("tool|register")|not) | [.ev, .sessionId.value[0:4], .turns.value, .messages.value, .roles.value, .kept.value]' r22/p1/module.log
["session.start","ca38",0,0,"",null]
["turn.start","ca38",1,1,"u77",null]
["command.run","ca38",1,6,"u77 a0 a0t u0 a0 a239",null]
["session.compact:before","ca38",2,7,"u77 a0 a0t u0 a0 a239 u8",null]
["session.compact:after","ca38",2,7,"u77 a0 a0t u0 a0 a239 u8",null]
["command.run","ca38",4,9,"u77 a0 a0t u0 u3414 a0 a239 u134 u92",null]
["turn.start","ca38",5,10,"u77 a0 a0t u0 u3414 a0 a239 u134 u92 u33",null]
["command.run","ca38",5,12,"u77 a0 a0t u0 u3414 a0 a239 u134 u92 u33 a0 a5",null]
["session.start","ca38",5,12,"u77 a0 a0t u0 u3414 a0 a239 u134 u92 u33 a0 a5","started"]
$ jq -c '[.source, .session_id[0:4], (keys|join(","))]' r22/p1/SessionStart.log
["startup","ca38","cwd,hook_event_name,model,scratchpad_dir,session_id,source,transcript_path"]
["compact","ca38","cwd,hook_event_name,model,prompt_id,scratchpad_dir,session_id,source,transcript_path"]
```

- Just after a compaction and before any prompt, the command's handler
  reads 9 messages: the messages from before the compaction are still
  read, a user message of 3,414 characters (the summary) and two more
  user records (134 and 92 characters, the lengths entry 6 saw) are
  added, and the last message is a user's. `turns()` went from 2 to 4. A
  module that asks "is there at least one message" gets yes.
- `session.start` did not run at the compaction, and no `turn.start`
  fired for it. `session.compact` ran; inside it, before and after
  `next(e)`, the calls read the transcript as it was before.
- The session's id is the same after the compaction. The SessionStart
  command hook ran with the source `compact`, its message showed on the
  screen (`SessionStart:compact says: ...`), and its input carries one
  key more than at `startup`, `prompt_id`.
- The last line above is a reload, not a process start: the module's
  file was edited while the session was open, the screen showed
  `noaskprobe3: reloaded (5 hooks: ...)`, `session.start` ran again and
  the value kept with `$.state` at the first one was still there
  (`started`).

At a resume of that session in a new process (`--continue`,
`r22/p1-resume/module.log`):

```
["session.start","ca38",4,8,"u3414 a0 a239 u134 u92 u33 a0 a5",null]
```

The kept value is gone, the transcript starts at the summary (8
messages), and the SessionStart hook's source is `resume`.

#### P3: when the host takes a hook's answer

Observed. The answer is taken at the exit of the hook's process.

Alone (p3d, Remote Control off). The script printed the deny object
about 11 ms after it started and exited 8 seconds later; the module's
`tool.done` came 8.1 to 8.2 seconds after its `tool.call` in every
variant, and no file was created.

| Variant | Hook printed after | Hook exited after | `tool.done` after | Result |
|---|---|---|---|---|
| `deny-open` | 12 ms | 8.014 s | 8,190 ms | denied |
| `deny-null` | 12 ms | 8.016 s | 8,166 ms | denied |
| `deny-null-err` | 12 ms | 8.016 s | 8,146 ms | denied |
| `deny-close` | 12 ms | 8.016 s | 8,158 ms | denied |
| `deny-close-all` | 11 ms | 8.014 s | 8,150 ms | denied |

The debug log shows the host reading the first line at once, to see
whether the hook declares itself asynchronous, and acting on it only when
the process has finished (`r22/p3d/debug-hooks.txt`, `deny-open`):

```
2026-11-23T00:21:39.219Z [DEBUG] executePermissionRequestHooks called for tool: Bash
2026-11-23T00:21:39.263Z [DEBUG] Hooks: Checking first line for async: {"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"probe: denied, go on"}}}
2026-11-23T00:21:39.263Z [DEBUG] Hooks: Parsed initial response: {"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"probe: denied, go on"}}}
2026-11-23T00:21:45.302Z [DEBUG] Notification:permission_prompt [~/.claude/hooks/hooks.sh notification] completed with status 0
2026-11-23T00:21:47.266Z [DEBUG] Hooks: PermissionRequest:Bash [PROBE_SEAM= bash "~/projects/scratch/sdd-probe-plugin-3/scripts/hook.sh" PermissionRequest] (plugin noaskprobe3@inline) finished with status 0 (8043ms)
2026-11-23T00:21:47.270Z [INFO] Slow permission decision: 8070ms for Bash (mode=auto, behavior=deny)
```

While the hook ran, the permission dialog was on the screen: a capture
0.93 seconds after the hook printed already shows
`Do you want to proceed?  ❯ 1. Yes  2. No`, and after 6 seconds the host
ran the owner's `permission_prompt` notification hook. The dialog closed
by itself when the hook exited with its deny. With an instant hook (entry
6, and `deny-permission` here) no dialog is seen.

Beside a hook that allows after 3 seconds (p3e):

```
$ jq -c 'select(.ev=="tool.done") | .ms' r22/p3e/module.log | tr '\n' ' '
3311 3136 3111 79 67 570
```

| Variant | The plugin's deny printed | The plugin's hook exited | The allow printed | Result |
|---|---|---|---|---|
| `deny-open` | 0.012 s | 8.0 s | 3.0 s | allowed, file created, `Allowed by PermissionRequest hook` |
| `deny-null` | 0.011 s | 8.0 s | 3.0 s | allowed |
| `deny-close-all` | 0.011 s | 8.0 s | 3.0 s | allowed |
| `deny-permission` | 0.011 s | 0.011 s | 3.0 s | denied, `Denied by PermissionRequest hook` |
| `deny-bg` | 0.010 s | 0.011 s | 3.0 s | denied after 67 ms |
| `deny-bg-open` | 0.011 s | 0.011 s | 3.0 s | denied after 570 ms |

A deny printed three seconds before the other hook's allow lost to it
whenever its process was still running, whatever it had done with its
output. In `deny-bg` the host reported the hook finished after 30 ms and
applied the deny; the background child lived its 8 seconds out
(`bg-child-done` is in `timing.log` 8.0 s later), so the host did not
kill it. In `deny-bg-open`, where that child kept the hook's output pipe,
the host reported the hook finished after 533 ms: it waits about half a
second for the pipe after the exit, not for the child.

Remote Control (p3a, p3a3). With Remote Control on, the host sends the
permission request to the remote bridge in the same millisecond in which
it starts the PermissionRequest hooks, and an allow from there decides
if it arrives before the hook's exit (`r22/p3a3/debug-hooks.txt`):

```
00:19:57.784Z [DEBUG] executePermissionRequestHooks called for tool: Bash
00:19:57.784Z [DEBUG] [remote-bridge] Sent control_request request_id=f6bf883e-...
00:19:57.820Z [DEBUG] Hooks: Parsed initial response: {"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny",...}}}
00:20:00.196Z [DEBUG] [bridge:repl] Ingress message type=control_response
00:20:00.198Z [INFO] Slow permission decision: 2423ms for Bash (mode=auto, behavior=allow)
00:20:05.824Z [DEBUG] Hooks: PermissionRequest:Bash [...] (plugin noaskprobe3@inline) finished with status 0 (8038ms)
00:20:05.825Z [DEBUG] Hook PermissionRequest (command hook) returned permissionDecision: deny
```

In p3a3 three of the five requests were allowed that way (after 7.6, 2.4
and 3.1 seconds; `deny-null`, `deny-close` and `deny-close-all`), and
their files were created. In p3a, which kept no debug log, the
`deny-close` and `deny-close-all` requests ran after 5.9 and 8.2 seconds
with no label on the screen; by p3a3's evidence those were remote allows
too, which is an inference. In p3a2 no answer came from the bridge and
all three requests were denied at the hook's exit. So which variant was
allowed followed who answered, not what the hook did with its output.

One dialog of p3a (mode `log`, no answer from the hook) was meant to be
answered "No" with the Down key and Enter and ended as "Yes"; the file
was created and removed. That session kept no debug log, so whether the
key was lost or a remote allow came first is not established. In p4 the
screen was read after the Down key and before Enter each time.

#### P4: a hook past its timeout

Observed in p4, hooks at `"timeout": 5`.

Stop:

```
$ /bin/grep 'Stop stop-' r22/p4/timing.log
1795393595.981793 Stop stop-overrun pid=4030400 start
1795393595.993236 Stop stop-overrun pid=4030400 sleep-start
1795393600.977135 Stop stop-overrun pid=4030400 signal TERM
1795393600.977214 Stop stop-overrun pid=4030400 wait returned 143, sleep alive
1795393600.977691 Stop stop-overrun pid=4030400 wait returned 143, sleep gone
1795393600.977877 Stop stop-overrun pid=4030400 sleep-end
1795393600.977912 Stop stop-overrun pid=4030400 exit
1795393644.732501 Stop stop-answer-overrun pid=4044128 start
1795393644.743977 Stop stop-answer-overrun pid=4044128 printed
1795393644.744054 Stop stop-answer-overrun pid=4044128 sleep-start
1795393649.734330 Stop stop-answer-overrun pid=4044128 signal TERM
1795393649.734431 Stop stop-answer-overrun pid=4044128 wait returned 143, sleep alive
1795393649.734704 Stop stop-answer-overrun pid=4044128 wait returned 143, sleep gone
1795393649.734970 Stop stop-answer-overrun pid=4044128 sleep-end
1795393681.973294 Stop stop-term-answer pid=4061239 start
1795393681.985157 Stop stop-term-answer pid=4061239 sleep-start
1795393686.979415 Stop stop-term-answer pid=4061239 signal TERM, answering
1795393686.979503 Stop stop-term-answer pid=4061239 exit-after-term
1795393719.625709 Stop stop-overrun pid=4077851 start
1795393719.637247 Stop stop-overrun pid=4077851 sleep-start
1795393724.631390 Stop stop-overrun pid=4077851 signal TERM
1795393724.631481 Stop stop-overrun pid=4077851 wait returned 143, sleep alive
1795393724.631791 Stop stop-overrun pid=4077851 wait returned 143, sleep gone
1795393724.632024 Stop stop-overrun pid=4077851 sleep-end
$ cat r22/p4/debug-hooks.txt   (the Stop lines, the command shortened)
00:26:40.978Z Hooks: Stop [...] (plugin noaskprobe3@inline) timed out after 5000ms (5020ms)
00:26:40.978Z Hook Stop (Stop) cancelled:
00:27:30.234Z Hooks: Stop [...] timed out after 5000ms (5520ms)
00:27:30.234Z "Hook Stop (Stop) cancelled:\nstdout:\n{\"decision\":\"block\",\"reason\":\"probe: reply with the single word pineapple, then stop\"}"
00:28:06.980Z Hooks: Stop [...] timed out after 5000ms (5019ms)
00:28:06.980Z "Hook Stop (Stop) cancelled:\nstdout:\n{\"decision\":\"block\",\"reason\":\"probe: reply with the single word pineapple, then stop\"}"
00:28:45.131Z Hooks: Stop [...] timed out after 5000ms (5517ms)
00:28:45.131Z Hook Stop (Stop) cancelled:
```

- `TERM` arrives 4.99 to 5.01 seconds after the script's start, and the
  script's `sleep` child dies of it in the same instant (status 143), so
  the signal goes to the hook's process group. No `INT` or `HUP` was
  seen.
- A script that goes on after `TERM` is killed about half a second later:
  the first `stop-overrun` ran before the script's second sleep was added
  and exited by itself (the host's figure is 5,020 ms); the later runs
  went into the second sleep, logged nothing more, not even the line a
  trapped signal would have left, and the host's figure is 5,517 to
  5,520 ms.
- Every stop was allowed: the screen shows the one word and the turn's
  end, with no error and no feedback line, in all four runs.
- The block decision printed 11 ms after the start
  (`stop-answer-overrun`) was thrown away with the rest, and so was the
  one printed in answer to `TERM` by a script that then exited 0 at once
  (`stop-term-answer`): the debug log holds each as the `stdout` of a
  cancelled hook, and neither turn was continued.

PermissionRequest:

```
00:29:36.921Z Hooks: PermissionRequest:Bash [...] (plugin noaskprobe3@inline) timed out after 5000ms (5517ms)
00:29:36.921Z Hook PermissionRequest:Bash (PermissionRequest) cancelled:
00:29:50.882Z [INFO] Slow permission decision: 19499ms for Bash (mode=auto, behavior=ask)
00:30:11.881Z Hooks: PermissionRequest:Bash [...] timed out after 5000ms (5524ms)
00:30:11.881Z "Hook PermissionRequest:Bash (PermissionRequest) cancelled:\nstdout:\n{\"hookSpecificOutput\":{\"hookEventName\":\"PermissionRequest\",\"decision\":{\"behavior\":\"deny\",\"message\":\"probe: denied, go on\"}}}"
00:30:16.476Z [INFO] Slow permission decision: 10135ms for Bash (mode=auto, behavior=ask)
00:30:38.690Z Hooks: PermissionRequest:Bash [...] timed out after 5000ms (5025ms)
00:30:38.691Z "Hook PermissionRequest:Bash (PermissionRequest) cancelled:\nstdout:\n{...\"behavior\":\"deny\"...}"
00:30:44.121Z [INFO] Slow permission decision: 10478ms for Bash (mode=auto, behavior=ask)
```

The same signals at the same times (`timing.log`). In all three modes
the dialog, on the screen since the hook started, stayed open after the
timeout and waited: 9 seconds after the hook's start the screen still
read `Do you want to proceed?`. Each was answered "No" by the driver with
the Down key and Enter (the screen read `❯ 2. No` before Enter), which
the session showed as `Interrupted · What should Claude do instead?`. The
deny printed before the overrun and the deny printed at `TERM` were both
thrown away. No file was created.

#### Not covered

- Entry 6's account beyond one session start: P2, P3 and P4 were seen on
  another account, without a Team organization's security default.
- A timeout at SessionStart and at Elicitation, and the answer's moment
  at Stop, SessionStart and Elicitation (only PermissionRequest was
  timed, the event where another party can answer first).
- An option set through `/config` or stored in the user settings file:
  the options here came from a `--settings` file, the other of the two
  sources the build reads them from. An option of the `sensitive` kind.
- Whether a background child outlives the session's end, or a hook's
  process group when the hook is cancelled at its timeout. The child of
  `deny-bg` lived 8 seconds past a hook that exited in time.
- What `$.session.messages()` reads at a `session.start` that the
  compaction itself would cause: none ran.
- Build 2.1.325, which CI pins.

#### Leftovers

Every `tmux` session of the probe was killed when it ended. No `touch`
target is left in the scratch repository (the files that allowed calls
created were removed). `probe-mode` reads `log` again and the plugin's
`hooks.json` is back at a timeout of 30. For the owner, in
`~/projects/scratch/`: the plugin `sdd-probe-plugin-3`; in
`sdd-probe-2`, the folder `r22/` with nine session folders and four new
files under `settings/` (`r22-p1.json`, `r22-ask.json`,
`r22-ask-allow3.json`, `r22-allow3.sh`). In the other account's
configuration directory: the scratch folder's trust flag and the probe
sessions' transcripts, as every session leaves them. Entry 6's plugin and
`r16/` were not touched.

#### Pinned values

- A configured option in a command hook's process: `CLAUDE_PLUGIN_OPTION_<KEY>`, the key upper-cased, at SessionStart, Stop and PermissionRequest
- Its value: the string form (`3`, `20`, `false`, `off`); present also when the configured value equals the default; absent when never configured
- The settings id of a `--plugin-dir` plugin: `<name>@inline`; `pluginConfigs.<id>.options` in a `--settings` file reaches the hook
- A manifest option with `"options": [...]`: accepted by `claude plugin validate`
- `"shell": "bash"` with `VAR= bash "${CLAUDE_PLUGIN_ROOT}/..." <event>`: runs, and the assignment reaches the script
- After a compaction, before any prompt: `messages()` reads the earlier messages and the summary (9 where 7 stood), `turns()` 4 where 2 stood, the same session id; `session.start` and `turn.start` do not fire; the SessionStart command hook runs with source `compact` and is shown
- `$.state` across a reload of the plugin: kept; across a resume in a new process: gone
- A command hook's answer: taken at the process's exit; printing, redirecting or closing the output earlier changes nothing
- While a PermissionRequest hook runs: the dialog is on the screen within a second, a remote device has the request at once, and the first answer decides
- A hook that exits while a background child lives on: finished at the exit (about 0.5 s later if the child holds its output); the child is not killed
- A hook past its timeout: `TERM` to its process group at the timeout, killed about 0.5 s later, its whole output discarded (`cancelled`), an answer printed before the timeout or at `TERM` included
- After such a timeout: a stop is allowed with nothing shown; a permission dialog stays open and waits

### What was built

- Task 1, `ea0cf38`: the command's two new forms,
  `noask hook session-start|permission|elicitation|stop` and
  `noask [--session <id>] start-line`, told apart before the platform
  test, so that off the platform, without `HOME` and without a clock they
  print nothing and exit 0 where the other forms fail. An entry reads its
  input once (to 4 MiB, within 4 seconds, NUL bytes made `\001`), takes
  the session's id and an agent's from it only as JSON strings of the
  id's form, tested inside `jq` on the whole string, and without a usable
  id takes the reading of a session with no id by the module's rule. It
  answers once, each answer through one `printf` format and the command's
  own escaper, never built by `jq`, and from its guard on a trap answers
  the noask side when it would end unanswered. The session-start entry
  answers with the start line as its message and, as its context, the
  rule text and where the apply skill's noask reference is. Eleven hook
  inputs of entry 6's probe, the home rewritten, are the tests'
  fixtures (`tests/fixtures/hook-inputs/`); case 16 now holds that the
  switches, the status and the counts answer the same without `jq`, and
  `start-line` the same line with the `jq` note after it; cases 47 to 51.
- Task 2, `8af4f17`: the permission and the elicitation entries, which
  count first and then answer (ruling 4). A prompt is denied with
  Intervention 2's text, a subagent's with the role's text, either with
  the ending text once the denial budget is spent, and after it the
  count's failure or note and an unreadable reading's reason; a server's
  question is declined whatever the count gave. Without a usable session
  id, or with an agent id of another form, nothing is counted. Both are
  inert while `permissionHook` is exactly `false`. Cases 52 to 58.
- Task 3, `5b4e7a7`: the stop entry. It is inert for a stop that names an
  agent; it allows a stop whose record's budget is spent; it sets the
  counts back and allows a stop beside a subagent in flight or on an
  end-of-turn line, but continues a waiting line once on a first stop
  with nothing running or scheduled; and it continues any other with the
  rule text, counted, the sentence for a token on an earlier line and,
  from the sixth continuation on, the sentence that asks the session to
  end. Its work on the message is bounded (ruling 7), and its failure
  path blocks only a first stop (ruling 1). Cases 59 to 67.
- Task 4, `3ea4798`: the session-start entry's link step, at a start
  whose source is `startup` and whatever the reading:
  `~/.local/bin/noask` a link to `<plugin data>/bin/noask`, itself a link
  to the plugin's `bin/noask`; `terminal` at `off` removes the plugin's
  link and adds none; an entry the plugin did not make is never touched;
  the refused and the PATH notices are said when their condition starts,
  by the last conditions kept in `terminal-state`, which is written by a
  rename (ruling 6); every command is bounded, and the step ends at the
  first that fails and after 4 seconds (ruling 7). Cases 68 to 71.
- Task 5, `38f7957`: the four command hooks in `hooks/hooks.json`
  (SessionStart with the matcher `startup|clear|compact`,
  PermissionRequest, Elicitation and Stop, each `"shell": "bash"`, the
  command `SDD_NOASK_NOW= SDD_NOASK_LOCK_WAIT= bash "${CLAUDE_PLUGIN_ROOT}/bin/noask" hook <event>`
  and a timeout of 30); the three options `continuationBudget`,
  `permissionHook` and `terminal`, and "in a row" in the two budgets'
  descriptions; the entries' texts in `hooks/text.ts`, which loses the
  line that said the release was partial; `hooks/entry.fixtures.ts`, 35
  texts that `tests/gen-entry-texts.sh` prints from the entries and that
  the module's tests hold `hooks/text.ts` to; the module's start line at
  a resume and a fork, once a session (`sdd.startLine`), its run of
  `start-line` limited to 7 seconds (ruling 6); five records of the
  fence's table for the new forms, and the module's count of its rows
  (D1); case 72.
- Task 6, this entry's commit: the README's Noask section (the denied
  prompt, the declined question and the race at a prompt, the continued
  stop, the three budgets in a row, the start line, the terminal command
  and its four notices, the stated limits, the spelling through an
  interpreter that the guard does not catch, six settings) and its lines
  in Requirements, Uninstall and History; the sentences on
  `test-noask.sh` in `tools/README.md`; CI's step that logs
  `jq --version`; and version 0.4.0.

Where the build departs from the plan's words, or reads them one way
where they leave room, it does as follows:

- An `ln` that fails with nothing in the way ends the link step silently
  (a ruling during the run, below).
- Under a reading of on or unreadable the link step runs after the start
  line is built, not right after the rule is read, so a signal during it
  answers with the whole start line and the hook's failure rather than
  with `noask is ON`; no case pins it.
- A sentence a start line gains (this session's own switch under the
  global one, the `jq` note, the rule note) follows the line after a
  full stop that ends it and one space:
  `... noask global off to end it. This session's own switch is on too until <time>; /noask off ends that one.`
  A line with nothing after it ends as the spec fixes it, without a
  final stop, and call 8 leaves the sentences to the builder. The plan
  put one space there and no full stop, as the build first did; the full
  stop is a ruling during the run (below), for the spec's revision 22.
  Case 48, the fixture and `hooks/text.ts` hold the wording.
- The stripping's limit: a line holds no token when the eighth pass still
  changed it, so seven surrounding `**` pairs keep the token and eight
  continue the turn (case 67); the other reading of ruling 7 would let
  eight through.
- A failed count's words: an entry drops the `noask: ` head from a
  count's error and note and says `no session id` alone, where the
  module's caller, unchanged since 0.3.0, keeps the head and says
  `no session id: <why>`. So one failed count reads
  ` (noask count failed: noask: cannot ...)` at a fence denial and
  ` (noask count failed: cannot ...)` at a denied prompt. The entries'
  form is the one the plan prescribes.
- The link step's bound is the shell's `SECONDS`, which counts whole
  seconds: `in_time` holds while `SECONDS - link_started` is under 4, so
  the step's own bound fires between 3 and 4 seconds of real time. With
  its last command's own 2 seconds its worst case stays under 6 seconds,
  and a session's start under 16, as the plan's Time constraint states,
  both inside the hooks' 30. Bash 5.3.9 bears it out: in five runs a
  difference of 4 came 3.3 to 3.6 seconds after a reading.
- The terminal command's link is made with `ln -sT`, not with laterbox
  0.4.0's `ln -s` (a ruling during the run, below).
- The module's start: a session id that does not answer within 2 seconds
  counts as no usable id, and `start-line` then runs without `--session`;
  and the line shown is the run's standard output alone.
- Two files are read to a limit: a rule file longer than 64 KiB reads as
  unreadable (the built-in text, and the rule note on the start line),
  and `terminal-state` is read to 4096 bytes, of which its first two
  lines count.
- When the link step ends at its bound or on a signal between making a
  temporary link or file in the plugin's data folder and renaming it,
  the temporary one stays there; nothing sweeps them.

### The owner's rulings

The plan's rulings by the owner, 1 to 5 of 2026-11-23, 6 of the same day
on the plan's third review and 7 of 2026-11-24 on its fourth. Where one
differs from the spec's text or adds to it, it bound this build; the
spec takes them in as revision 22, as revision 21 took in the first
step's.

1. A stop whose input cannot be read. The failure path blocks only what
   is recognisably a first stop: the input shows `stop_hook_active`
   false, as its own top-level boolean where `jq` can read it, and in the
   raw text only on a machine without `jq`. An input that does not show
   it is allowed, with nothing printed. The spec's "never a loop" is
   kept; the cost is that on a host that sends an unreadable input the
   session stops as it would without the plugin.
2. `bash <path>/noask global off` is not read by the fence as switching
   noask (probed at `745074b`; it was so in 0.3.0 already). This step
   leaves `hooks/fence.ts` alone, and the README names the spelling
   among what the guard does not catch. The wider fence waits for later
   work.
3. The two facts entry 6 did not reach, a configured option's value in a
   hook's process and the transcript calls just after a compaction, were
   probed before the launch with a throwaway plugin, never with this
   plugin loaded, together with two facts the plan leans on: when the
   host takes a hook's answer, and what it does with a hook past its
   timeout. That is the probe above.
4. The permission and the elicitation entries count first, then answer.
   The spec has them answer before they count, so that their own lock
   never costs them the race with an owner's hook that allows; the probe
   showed that the host acts on a PermissionRequest hook's answer only
   when the hook's process exits (P3), so that order buys nothing in one
   process, and counting first makes the text exact. The denial or the
   decline is as late as the count: a few milliseconds as a rule, and up
   to the lock's 2 seconds when another process holds the records'
   lock. Meanwhile an allow from elsewhere can win a prompt, and a
   person can answer a prompt's or a question's dialog. Not taken:
   handing the count to a background child (applied after 67 ms in the
   probe, but the count then lands after the answer, and each denial
   leaves a process behind).
5. The run is plain, launched without the apply skill's `handsoff`: it
   pushes nothing.
6. On the third review. The module's run of `start-line` gets a limit of
   its own, 7 seconds, in place of the module's usual 2 seconds for a
   file call: the command's own read of one hanging marker takes those
   2 seconds, so the line under a hanging marker could never show. The
   link step writes `terminal-state` through a temporary file and a
   rename, and ends without its two notices or a write when the file is
   there and cannot be read. The look through `noask.d` for a session
   with no id keeps no total bound, and the plan says so. Not taken: a
   total bound in that loop, with a reason text and a test of its own for
   a state that needs hundreds of markers.
7. On the fourth review. The stop's work on the message is bounded: it
   looks at the message's last 200 lines, a line longer than 1024 bytes
   holds no token, and the stripping stops after 8 passes. The link step
   ends silently once it has run 4 seconds in all, which replaces ruling
   6's "no total bound" for that step; the look through `noask.d` stays
   as ruling 6 left it. The rule file is read right after the guard in
   every stop. An entry ends with status 0 and nothing printed on a
   signal before its guard. The session start's failure text leaves the
   generated fixture. The no-id start line stays the plan's and is
   recorded as a departure (call 15). Calls 10, 12 and 13, which one
   reviewer would reopen, stand, and the README names call 12's case.

### The plan's decisions

Where the spec leaves the shape to the builder, the plan decided, each
with what it would cost if it were wrong:

1. The form's name, `noask hook <event>`, and `start-line` for the
   module's question; the spec names neither. Cost if wrong: a rename
   touches `bin/noask`, `hooks/hooks.json`, the module's run, the
   generator and the fence's records; nothing outside the plugin calls
   either form.
2. Withdrawn, and replaced by ruling 4: the first two drafts had the
   permission entry answer from a look at the record and count after,
   the spec's order.
3. The `permissionHook` option switches off the declined MCP question
   too, since the spec states the option under Intervention 2, which
   holds both. Cost if wrong: an owner cannot keep prompts waiting while
   servers' questions are declined, or the reverse; a second option
   would split them.
4. In the waiting check, any entry of `background_tasks` or
   `session_crons` counts as something running or scheduled. Cost if
   wrong: a waiting line beside unrelated work is believed, a limit the
   README names.
5. A stop whose input names an agent is left alone even when the id is
   unusable. On a machine without `jq` the entry cannot see an agent id
   at all, so a stop that carried one would be blocked once there like
   any other, where the spec leaves it alone; entry 6 saw a subagent's
   stop only as SubagentStop, never as Stop. Not taken: a match on the
   raw text for `"agent_id"`, which a key of that name nested in another
   object would satisfy as well. Cost if wrong: on a machine without
   `jq`, a subagent's stop that reached Stop would be blocked once.
6. The fixtures are the probes' inputs with the home rewritten in both
   its spellings and the configuration folder's number dropped; the
   session ids stay, and a case sets the id its marker carries. Cost if
   wrong: an input whose shape differs from build 2.1.325's is not
   tested; the acceptance after the run meets live ones.
7. Withdrawn as a call, since the build has it so: the link step runs at
   a start whose source is `startup` only, as laterbox's does, so a
   clear in a session of an older install does not point the link back
   at that install. Cost if wrong: a change of the `terminal` setting
   takes effect at the next new session, not at a clear.
8. The builder's wording, where the spec fixes only that something is
   said: the two start notes, the start line under an unreadable marker,
   the `<why>` words of a no-id reason, the two sentences for a
   session's own switch under the global one, the global line's optional
   `until`, `noask is ON` in the session start's failure answer, the
   session's sentence after an unreadable global marker's line, the
   reason `noask.d cannot be listed or searched`, and the two fixed
   failure messages, `ended by a signal` and `ended without an answer`.
   Cost if wrong: wording only; the fixture holds the module's copies to
   the command's, and revision 22 takes them or rewrites them.
9. The stop entry looks at the record without the lock and counts after,
   as two steps. The look reads a file that is only ever replaced by a
   rename, and the reason follows the cause the count prints. Not taken:
   one locked transaction for the stop's decision. Cost if wrong: a race
   costs one continuation that carries the ending text.
10. The module's state key takes `started` also when the command printed
    no line (noask off at a resume), so a reload after a later `on`
    shows no late line. Reopened by one reviewer of the fourth round and
    kept by ruling 7, since a session that is not reloaded shows none
    either. Cost if wrong: that reload shows no line.
11. A denied prompt carries the short text of Intervention 2 and no rule
    text. The spec's start item says a resumed session meets the rule at
    its first refused question, denied prompt or continued stop, "each of
    which carries it", while Intervention 2 fixes the denial's message
    word for word; the plan follows the intervention, and revision 22
    corrects the other sentence. Cost if wrong: a resumed or forked
    session meets the rule only at its first refused question or
    continued stop.
12. An input the entry cannot use goes the no-id way, a valid object over
    4 MiB included, and its read is bounded at 4 seconds, twice a file's,
    since it comes from the host's pipe. Reopened by one reviewer of the
    fourth round, with the case of a prompt over 4 MiB in a session that
    has noask off; kept by ruling 7, and the README names the case. Not
    taken: reading the id from the part that was read with
    `jq --stream`, a second parse path whose agent id may lie past the
    cut. Cost if wrong: while another session's own switch is on, such a
    prompt is denied in a session whose own switch is off.
13. A clock that cannot be read ends an entry with nothing printed, under
    an active marker too: without the time no expiry can be judged, and
    the other forms stop there. Reopened by one reviewer of the fourth
    round, since every other unreadable state fails closed; kept by
    ruling 7. Cost if wrong: that one event is not answered.
14. The look through `noask.d` for a session with no id stops at the
    first marker that is on or unreadable, where the module looks on for
    one that is on. Cost if wrong: the reading is the same and only the
    reason's tail can differ from the module's.
15. The no-id start line is `noask treats this session as ON: <reason>`,
    where the spec fixes the sentence
    `sdd: this session's id could not be read while a session's own noask switch is on; the session is treated as under noask`.
    The plan's line says which of its reasons holds (the id's, an
    unreadable marker, `noask.d` itself), which the spec's one sentence
    cannot; revision 22 takes it in. Cost if wrong: wording only.

### What stays read and not observed

No session ran with this plugin loaded during the build: the command is
proven under a temporary home by `tests/test-noask.sh`, the module by
`claude plugin test .`. What the build takes from Claude Code itself
stands on one of three kinds of evidence, named by the word before each
fact below:

- fixture: the host's input that shows the fact was recorded by entry 6's
  probe and is a file of `tests/fixtures/hook-inputs/`, which the tests
  feed to the entries; so the entries' reading of it is tested, and the
  host's side was seen in that probe only.
- probe: seen on the host by a probe with a throwaway plugin, never this
  one: the probe above (P1 to P4, on build 2.1.330), or entry 4's or 6's
  (on build 2.1.325), as the fact says.
- neither: read from the design, the host's types or laterbox's code,
  and seen by no probe.

The facts:

- fixture: the inputs carry what the entries read: `session_id` at all
  four events; `agent_id` at a subagent's permission prompt; `source` at
  a session's start; and at a stop `stop_hook_active`,
  `last_assistant_message`, `background_tasks` (one entry of `type`
  `subagent` beside a live subagent) and `session_crons` (one entry
  beside a one-shot wakeup).
- probe: the answers' forms are applied: a deny object with no dialog
  seen when it is instant, a decline that the server receives, a stop's
  additional context read as the hook's feedback and a block read as its
  error, each followed by an input with `stop_hook_active` true (entry
  6); the session start's message on the screen and its context to the
  agent at `startup`, `clear` and `compact` (entry 4).
- probe: an option set in a `--settings` file reaches the SessionStart,
  Stop and PermissionRequest hooks as `CLAUDE_PLUGIN_OPTION_<KEY>` with
  its string value, also when it is set to its default's value, and one
  never configured is absent (P1).
- neither: an option at an Elicitation hook; an option set through
  `/config` or in the user settings; and that `/config` names the option
  `sdd.terminal`, as the added notice tells the owner.
- probe: the registration's form, `"shell": "bash"` with an assignment
  before `bash`, runs at SessionStart, Stop and PermissionRequest and the
  assignment reaches the script (P1).
- neither: that form at Elicitation, where entry 6 ran its script
  directly.
- probe: the host takes a PermissionRequest hook's answer when its
  process exits; meanwhile the dialog is on the screen within a second,
  Remote Control has the request at once, and the first answer decides
  (P3).
- neither: the moment the host takes the answer at Stop, SessionStart
  and Elicitation, and the time this entry takes to deny with the lock
  free, measured against the dialog.
- neither: that a permission prompt raised by the classifier declining
  to decide, or one raised by another hook, reaches the PermissionRequest
  hook as one raised by an `ask` rule does. The entry answers every
  prompt it is sent, but every prompt the probes raised came from an
  `ask` rule.
- probe: a hook past its timeout is sent `TERM` to its process group,
  killed about half a second later and its output thrown away; then a
  stop is allowed and a prompt waits (P4, at Stop and PermissionRequest,
  with a timeout of 5).
- neither: the same at SessionStart and Elicitation, and at this
  release's timeout of 30.
- probe: `$.state` is kept across a reload of the plugin and gone at a
  resume in a new process, which `sdd.startLine` rests on; `session.start`
  does not run at a compaction, while the command hook does with the
  source `compact` (P2).
- probe: at a resume and a fork the command hook's answer reaches neither
  the screen nor the agent, and a line of the module's `$.ui.log` shows,
  headed by the plugin's name; the transcript is empty at a new start and
  holds the kept history at a resume and a fork (entry 6).
- probe: a subagent's stop goes to SubagentStop, never to Stop, so the
  Stop entry's inert return on an agent id guards against an input no
  probe saw (entry 6).
- probe: `CLAUDE_PLUGIN_DATA` and `CLAUDE_PLUGIN_ROOT` are in every
  hook's process (entry 6).
- neither: that the plugin's data folder keeps its path across an update
  of the plugin, which the link chain counts on, as laterbox's does.
- neither: the module's run of `start-line` and its line through
  `$.ui.log` at a resume on the live engine, which the test kit alone
  ran.
- neither: whether a goal proposal's dialog waits under noask.
- neither: every fact of P1 to P4 on build 2.1.325, which CI pins.

The spec's acceptance item 3, an afternoon and a night with the plugin
loaded, is to see before the push the pass conditions that the plan of
noask's second step, a local working document, lists for it: each of
the four options set in `/config` to a value that is not its default,
and its effect seen, and one option set to its default's value; a
permission prompt raised while the records' lock is held from a
terminal, where the denial comes after the lock's wait, with the count's
failure in its text, and the dialog is seen meanwhile; a hook past its
timeout on the owner's own account (or the owner takes P4 as enough);
`/noask on` in a session just compacted, before any prompt; the
wake-up's submission of entry 7, and a session marker that is a link to
nothing, read by both readers; and step one's open acceptance notes, as
the parked notes list them (the wake-up look, the origin rule, the watch
tool, a plan's write, the memory tool, a missing configuration root).

### Rulings during the run

The run's own rulings, one question withdrawn, and the owner's rulings
on the minor findings after the final review, each with what it would
cost if it were wrong.

- D1 (the driver, before Task 1). Task 5's five new records of the
  fence's table make the module's assertion of the table's row count in
  `hooks/fence.test.ts` (306) fail, and that file was in no task's list.
  Task 5 may change that one assertion to the count the regenerated
  `hooks/fence.rows.ts` holds, and nothing else in the file, which joins
  its commit. Cost if wrong: one more file in that commit, visible in its
  stat.
- D2 (the driver, before Task 1). The gates' GNU run uses a helper of the
  run that links every `/usr/bin/gnu<name>` program under its plain name
  in a temporary folder and runs its arguments with that folder first on
  PATH; under it `date`, `env`, `head` and `timeout` report GNU coreutils
  9.7, where the plain names here are uutils'. Cost if wrong: a GNU run
  that misses some tool CI has from GNU; the probe covered the four the
  command calls most.
- D3 (the driver, before Task 1). The gate commands of every task, run
  one after another, the suite never twice at once: the list under Gates
  below. Cost if wrong: none beyond the plan's list, which these commands
  spell out.
- The failed `ln` of the link step (Task 4's controller). An `ln` that
  fails while nothing is at `~/.local/bin/noask` ends the step silently,
  accepted as built: the plan's "any failed command ends the step
  silently" covers it, and refused means an entry in the way, by the
  refused notice's own words ("exists and was not made by this plugin")
  and the spec's "a foreign `noask` in the way"; the plan's "not made:
  read again, own or refused" is read as the `ln` that lost to an entry
  put there meanwhile. Cost if wrong: a `~/.local/bin` the session cannot
  write to is never reported, and every start tries again silently; the
  fix is a few lines of the step and one case.
- Withdrawn (the driver, at `3ea4798`): the question whether cases 69 and
  71 depend on `find` being bfs, as it is where the build ran. The
  helper's format `%P %y %m %s %l %T@` printed the same fields under GNU
  findutils 4.10.0 (in a `debian:trixie` container, offline, the checkout
  mounted read only) as under bfs 4.1.1, for a file, a folder, a FIFO, a
  link and a link to nothing, so they do not.
- The History line (Task 6's controller). The README's History section
  gains one line for 0.4.0 after its paragraph, naming the release, its
  date and this entry; nothing is written for 0.2.0 or 0.3.0, since
  neither release wrote a line there. Cost if wrong: a History section
  with one release line; adding the others, or removing it, is a few
  lines of the README.
- The minor fixes (the owner, 2026-11-24). Of the thirty minor findings
  the reviews deferred, the owner approved twelve after the final
  review, "all as recommended", and one pass after the release commit
  made them: comments and README sentences corrected to what the code
  does, this entry's timings and acceptance list, and the three below;
  the other eighteen stay deferred. Cost if wrong: none beyond those
  edits, each visible in that pass's commit.
- The start line's full stop (the owner, within that approval). Where a
  sentence or a note follows a start line, a full stop ends the line
  before the space that precedes it, in every form of the line; a line
  with nothing after it is left as the spec fixes it. This departs from
  the plan's Task 1, which put one space there, and the spec's revision
  22 takes it in. Cost if wrong: six texts of the fixture and the cases
  that hold them, to set back together.
- `ln -sT` for the terminal command (the owner, within that approval).
  The link step makes `~/.local/bin/noask` with `ln -sT` where laterbox
  0.4.0's `terminal_link`, which the plan's Task 4 follows, uses
  `ln -s`: a folder that appears at that path between the step's look
  and its `ln` makes the `ln` fail, and the step reads the path again
  and finds it refused, where `ln -s` would put the link inside the
  folder and say the added notice. Probed under GNU coreutils 9.7 and
  uutils 0.10.0: with nothing at the path the link is made; with a
  folder or a file there the `ln` fails and makes nothing. No case holds
  the race. Cost if wrong: on an `ln` without `-T` no link is ever made
  and every first start ends the step silently; the fix is one flag.
- Exactly one ending of twenty stops (the owner, within that approval).
  Case 66 asserts that exactly one of twenty stops at once carries the
  ending text, where the plan asks for at least one: each stop looks at
  the record before the twentieth count, so each counts, and only the
  count that reaches 20 prints the spent cause, which the reason follows
  (call 9). Cost if wrong: a case that fails on a path that gives two
  endings, which would need a twenty-first count.

### Gates

At the repository root, in the working tree before this entry's commit,
the gates of D3, run one after another, the suite never twice at once.
They ran with the manifest, the workflow and `tools/README.md` in their
final state, the README before two wording edits that left its
shellcheck line as it was, and this entry before its last edits; none of
them reads this file or the README's prose. The validation ran again on
the final text and printed the same. Three cuts, the home directory written as `~` and
the run's GNU-tools helper of D2 named by its role, not its path, are the
only departures from verbatim: of `claude plugin test .` the
closing lines are quoted and the 764 lines `(pass) <test> [<time>]` under
the names of its five test files are left out; of `bash tests/run.sh`
its 152 lines `ok <n>` are left out (19 of `test-run-archive`, 14 of
`test-sdd-checkpoint`, 7 of `test-briefs`, 6 of `test-source-copy`, 72 of
`test-noask`, 8 of `test-sub-skill-check`, 16 of `test-tools`, 5 of
`test-check-skill-size` and 5 of `test-run`), while every other line it
printed stands; and of the two runs of `tests/test-noask.sh` the lines
`ok 1` to `ok 72` are written as one line, each run having printed those
72 lines and nothing else.

```
$ claude --version
2.1.331 (Claude Code)
$ claude plugin validate . --strict
Validating plugin manifest: ~/projects/akalongman/claude-sdd/.claude-plugin/plugin.json

  ❯ types ./types/index.d.ts declares on $: nothing (no EngineInterface member)
  ❯ types ./types/index.d.ts declares state: sdd.mainTurn, sdd.startLine

Validating hooks: ~/projects/akalongman/claude-sdd/hooks/hooks.json

  ❯ ./register.tsx hooks: tool.call{tool=AskUserQuestion}, tool.call{tool=ExitPlanMode}, tool.call{tool=Bash}, tool.call{tool=Monitor}, tool.call{tool=Edit}, tool.call{tool=Write}, tool.call{tool=NotebookEdit}, session.start, turn.start, turn.complete, command.run{command=noask}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=AskUserQuestion}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=ExitPlanMode}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=Bash}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=Monitor}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=Edit}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=Write}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=NotebookEdit}
  ❯ ./register.tsx gating hook without .catch: command.run{command=noask}
  ❯ ./register.tsx calls: $.clock.after (via inTime, startLineRun), $.clock.now (via mayPublish, readNoask), $.clock.sleep (via submitWakeUp), $.command.register, $.env.get (via configRoots, homeOf, stateDirectoryOf), $.fs.exists (via lookAt, readingWithoutId), $.fs.list (via listingOf, readingWithoutId), $.fs.read (via lookAt, readRule), $.fs.stat (via statOf), $.process.run (via countOn, runCommand, startLineRun), $.prompt.submit (via submitWakeUp), $.session.cwd (via directoryFor), $.session.id (via sessionIdOf), $.session.messages (via transcriptOf), $.state.get (via mainTurnOf, startLineOf), $.state.set, $.ui.log (via logged), $.ui.toast (via toast)
  ❯ ./register.tsx env writes: nothing
  ❯ ./register.tsx env reads: CLAUDE_CONFIG_DIR, HOME
  ❯ ./register.tsx state writes: sdd.mainTurn, sdd.startLine
  ❯ ./register.tsx state reads: sdd.mainTurn, sdd.startLine
  ❯ ./register.tsx types: not checked (the mod names dependencies, whose contracts are laid as links out of the mod's folder; validate reads nothing outside it)

Provides:

  ❯ modules: hooks/register.tsx
  ❯ hooks: SessionStart startup|clear|compact command "SDD_NOASK_NOW= SDD_NOASK_LOCK_WAIT= bash \"${CLAUDE_PLUGIN_ROOT}/bin/noask\" hook session-start"
  ❯ hooks: PermissionRequest command "SDD_NOASK_NOW= SDD_NOASK_LOCK_WAIT= bash \"${CLAUDE_PLUGIN_ROOT}/bin/noask\" hook permission"
  ❯ hooks: Elicitation command "SDD_NOASK_NOW= SDD_NOASK_LOCK_WAIT= bash \"${CLAUDE_PLUGIN_ROOT}/bin/noask\" hook elicitation"
  ❯ hooks: Stop command "SDD_NOASK_NOW= SDD_NOASK_LOCK_WAIT= bash \"${CLAUDE_PLUGIN_ROOT}/bin/noask\" hook stop"
  ❯ skills: sdd:apply
  ❯ agents: sdd:implementer
  ❯ agents: sdd:reviewer
  ❯ agents: sdd:unit-controller
  ❯ bin: noask
  ❯ bin: sdd-checkpoint
  ❯ bin: sdd-files-add

Hosts not read for: modules (1), hooks (4), skills (1), bin (3)
Hosts not declared: list what these parts reach under "network.hosts" in plugin.json

Plugin directory checks for ~/projects/akalongman/claude-sdd. The plugin directory is the catalog that plugins are submitted to; this is a subset of what it runs.

⚠ Found 1 plugin directory warning:

  ❯ .claude-plugin/plugin.json icon: No icon (ICON_MISSING). No icon found in the plugin. The validator looked for `icon` in plugin.json and for a file at .claude-plugin/icon.png or .svg, assets/icon.png or .svg, or a similar path.
    Fix: Add a square PNG to the plugin folder at .claude-plugin/icon.png, or set `icon` in plugin.json to the path of a square PNG or JPEG in the plugin: 512 to 2048 px on each side, under 2 MB. SVG and WebP are not accepted. That file may become the listing icon only once: the first time the plugin is saved or submitted in the developer portal. Adding or changing it later does not change the icon.

About these checks:

  ❯ hooks/hooks.json names a hooks module (a code file listed under `modules`). The plugin directory has rules of its own for such code, and these checks apply none of them, so passing here does not mean the directory accepts the plugin. The developer portal's own validation applies those rules.

These plugin directory checks do not change the result below.

The directory also runs a safety scan and a policy review that this command does not.

✔ Validation passed
$ claude plugin test .
 764 pass
 0 fail
Ran 764 tests across 5 files. [7.55s]
$ npx -y -p typescript@5.9.3 tsc -p . --noEmit
npm notice run npx
npm notice run 'tsc' -p . --noEmit
$ bash tests/run.sh
ok 19336/19500 (substituted)
ok check-skill-size
ok check-pause-text
ok check-pause-text
ok check-noask-reference
ok check-isolated-reference
ok test-run-archive
ok test-sdd-checkpoint
ok kept-file
ok kept-new
ok kept-range
ok kept-line
ok kept-dot
ok folder
ok no-folder
ok no-root-file
ok new-no-folder
ok space
ok trailing-slash
ok glob
ok method
ok url
ok flag
ok variable
ok tilde
ok absolute
ok scoped
ok setting
ok bare-name
ok order
ok fence
ok indented-fence
ok stdin
ok subfolder
ok errors
ok test-named-paths
ok test-briefs
ok test-source-copy
ok test-noask
ok test-sub-skill-check
ok test-tools
ok test-check-skill-size
ok test-run
15 ok, 0 skipped, 0 failed
$ bash tests/test-noask.sh
ok 1 ... ok 72
$ bash <the run's GNU-tools helper> bash tests/test-noask.sh
ok 1 ... ok 72
$ bash tests/check-fence-rows.sh
ok 311 rows, 13 not run
$ bash <the run's GNU-tools helper> bash tests/check-fence-rows.sh
ok 311 rows, 13 not run
$ bash tests/gen-marker-fixtures.sh | cmp - hooks/marker.fixtures.ts
$ bash tests/gen-entry-texts.sh | cmp - hooks/entry.fixtures.ts
$ shellcheck bin/noask bin/sdd-checkpoint bin/sdd-files-add skills/apply/scripts/named-paths skills/apply/scripts/openspec-section-brief skills/apply/scripts/openspec-section-tick skills/apply/scripts/run-archive skills/apply/scripts/source-copy skills/apply/scripts/sub-skill-check skills/apply/scripts/task-brief tests/*.sh
$ bash tests/check-skill-size.sh
ok 19336/19500 (substituted)
```

Every command exited 0. The two `cmp` lines ran under `pipefail`, so a
generator that failed would have failed them. The shellcheck line is the
README's as it stands after this release's edit.

Then, with the five files of this commit staged, the publication checks
over the lines it adds, each first run on a file of known-bad lines,
where each counted its line. Each prints the number of added lines that
match, `$added` being those lines saved to a file in the session's
scratchpad:

```
$ git diff --cached -- README.md tools/README.md .claude-plugin/plugin.json docs/decisions.md .github/workflows/test.yml | /bin/grep -E '^\+' | /bin/grep -v -E '^\+\+\+ ' > "$added"
$ /bin/grep -c -P '[\x{2013}\x{2014}]' "$added"
0
$ /bin/grep -c -w -F -- "$(id -un)" "$added"
0
$ /bin/grep -c -F -- "$(hostname)" "$added"
0
$ /bin/grep -E '/home/' "$added" | /bin/grep -c -v -E '/home/someone'
0
$ /bin/grep -c -E '\.claude[0-9]' "$added"
0
$ jq . .claude-plugin/plugin.json > /dev/null
```

Each `grep` found nothing and so exited 1, the pass here; `jq` exited 0.
Five more counts of the same kind, whose patterns are left out here since
they would spell what they look for, found no added line that names the
plan's folder or file, the plan's review folder or one of its files, the
run's workspace, a line number of the run's ledger, or an agent's id.
The gates ran on the local Claude Code, 2.1.331; whether CI's pinned
2.1.325 accepts the module's new start is seen at the first push.

Result: pass. Nothing was pushed.
