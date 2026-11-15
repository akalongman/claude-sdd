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
read as the plan expects (P1, P7, P8, P9, P10, P11), P9 with one part
unobserved.

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
excerpt, without blank lines and without the status line, which names the
account. Waits were bounded loops on the logs and transcripts. The
transcripts are
`~/<second config dir>/projects/-home-<user>-projects-scratch-sdd-probe-2/<session id>.jsonl`,
written in UTC. After each probe its logs moved to
`~/projects/scratch/sdd-probe-2/logs/<probe>.<log>`, where the commands
below read them, and its `tmux` session was killed.

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

The status plugin's `classic.Notification`, `classic.Elicitation` and
`classic.ElicitationResult` hooks were passed over the same way. The
module's own logs hold no line for a classic event in any probe:

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

The machine has no managed settings (`ls /etc/claude-code` reports no
such directory), so the seat comes from the organization; every
session's header reads "Claude Team". No probe ran on an account of
another plan, so whether a module's classic hooks run there is not
observed here. Hooks that are not a module's ran: the probe plugin's
SessionStart command hook wrote `start.log` on every source, and settings
hooks ran (the owner's, and probe E's control below).

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
control carry `background_tasks` and `session_crons`, empty.

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
one settings hook, the owner's sound, and the module's Stop hook was
passed over at each, so there are no Stop lines to record. The subagent
never slept: this build refuses a standalone foreground `sleep` in a
subagent's shell as well, and the screen reported
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
| P6 | dialog shown; the server received the cancel typed at the dialog | stop for the owner: the spec provides no downgrade for an MCP server's question; Task 7 waits |
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
- P6 elicitation: dialog shown; server received `{"result":{"action":"cancel"},"jsonrpc":"2.0","id":"probe-elicit"}` (the cancel of an Escape typed at the dialog)
- P7 tool.call deny: question text read, no dialog, plan approval text read, no dialog, agentId in a subagent present
- P8 module reach: exists, read and list outside the working directory ok, process.run under the plugin root with stdin ok
- P9 session id: variable CLAUDE_CODE_SESSION_ID; shell, hook input and module agree yes; a subagent's shell, hook input and module carry the main session's (shell and module; hook input not observed); after compact same, after clear new, after continue same, after fork new
- P10 hook stdin: `{"session_id":"s-1","transcript_path":"/home/u/<second config dir>/projects/-home-u-projects-scratch-sdd-probe-2/s-1.jsonl","cwd":"/home/u/projects/scratch/sdd-probe-2","scratchpad_dir":"/tmp/claude-1000/-home-u-projects-scratch-sdd-probe-2/s-1/scratchpad","hook_event_name":"SessionStart","source":"startup","model":"claude-opus-5-5"}`
- P11 goal proposal: tool absent

## 5. Give every unit a file list, and run isolated with or without a bootstrap (2026-11-16)

On 2026-11-16 the plugin moved to version 0.2.0 with the build of the
design `docs/superpowers/specs/2026-11-13-sdd-acceptance-fixes-design.md`,
cited at `f964095` and unchanged since. The build followed the plan
`docs/superpowers/plans/2026-11-14-sdd-acceptance-fixes.md`, a local
working document that is not committed, in eight commits on the base
`47e9f77`, `4c96a62` to `43ad2f7`, and this entry's commit. It answers
the two findings of entry 3's acceptance: an OpenSpec brief carried no
file list, so a pausing controller had no paths to checkpoint, and
`isolated` stopped in every project without a worktree bootstrap, where
entry 3 ruled that it should go on in a bare worktree.

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
  its `--undo` puts the worktree back as HEAD holds those paths.
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
- This entry's commit names the three new scripts on README's and CI's
  shellcheck lines, raises the version to 0.2.0, and describes the four
  new tests in `tools/README.md`, where `test-sdd-checkpoint.sh` now has
  thirteen cases.

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

### Not covered

`isolated.md` is prose a driver follows, so no script test runs it. The
spec leaves it to the next acceptance run, which this build did not
include: a first launch with an uncommitted OpenSpec change, a first
launch without a bootstrap, a relaunch from the main checkout without
the word `isolated`, a plan from an ignored plans folder, and an
untracked custom plan outside it.

### Gates

At the repository root, in the working tree before this entry's
commit and with this entry's text in place, the plan's gate chain for
the release. Its last command, the dash `grep` over `README.md` and this
file, finds nothing and so exits 1, which makes 1 the chain's exit
status when every gate passes. The output is whole; only the home
directory is written as `~`:

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
chain, run again on this entry's final text, printed the same output
and exited 1 again.

Result: pass. Nothing was pushed.
