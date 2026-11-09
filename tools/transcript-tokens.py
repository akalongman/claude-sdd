#!/usr/bin/env python3
"""Per-session, per-agent token accounting for Claude Code transcripts.
Usage: tokens.py SESSION_JSONL [...]
For each session: main transcript + <session-id>/subagents/agent-*.jsonl.
Sums usage by model and by agent; labels subagents from the Agent tool_use
description in the parent transcript; prints a table and a JSON blob.
"""
import json, os, sys, glob, collections

def iter_msgs(path):
    with open(path, errors='replace') as fh:
        for line in fh:
            try:
                yield json.loads(line)
            except Exception:
                continue

def usage_of(m):
    msg = m.get('message') or {}
    u = msg.get('usage') or {}
    return (msg.get('model') or '?',
            u.get('input_tokens', 0), u.get('cache_creation_input_tokens', 0),
            u.get('cache_read_input_tokens', 0), u.get('output_tokens', 0))

def summarize(path):
    tot = collections.defaultdict(lambda: [0,0,0,0,0])  # model -> [turns,in,cc,cr,out]
    first_ts = last_ts = None
    skill_hits = 0
    agent_calls = []  # (tool_use_id, description, model, subagent_type)
    for m in iter_msgs(path):
        ts = m.get('timestamp')
        if ts:
            first_ts = first_ts or ts; last_ts = ts
        if m.get('type') == 'assistant':
            model, i, cc, cr, o = usage_of(m)
            t = tot[model]; t[0]+=1; t[1]+=i; t[2]+=cc; t[3]+=cr; t[4]+=o
            for blk in (m.get('message') or {}).get('content') or []:
                if isinstance(blk, dict) and blk.get('type') == 'tool_use' and blk.get('name') == 'Agent':
                    inp = blk.get('input') or {}
                    agent_calls.append((blk.get('id'), inp.get('description'), inp.get('model'), inp.get('subagent_type'), len(inp.get('prompt') or '')))
        s = json.dumps(m)
        if 'app-subagent-apply' in s or 'sdd:apply' in s:
            skill_hits += 1
    return tot, first_ts, last_ts, skill_hits, agent_calls

def fmt(tot):
    rows = []
    for model, (turns, i, cc, cr, o) in sorted(tot.items()):
        rows.append(f"    {model:34s} turns={turns:5d} in={i:9d} cache_create={cc:10d} cache_read={cr:12d} out={o:9d}")
    return "\n".join(rows)

out = {}
for sess in sys.argv[1:]:
    sid = os.path.basename(sess)[:-6]
    subdir = os.path.join(os.path.dirname(sess), sid, 'subagents')
    tot, f, l, hits, calls = summarize(sess)
    print(f"=== SESSION {sess}\n  span {f} .. {l}  skill-mentions={hits}  Agent calls={len(calls)}")
    print("  main:\n" + fmt(tot))
    for c in calls:
        print(f"    Agent: desc={c[1]!r} model={c[2]} type={c[3]} prompt_chars={c[4]}")
    subs = sorted(glob.glob(os.path.join(subdir, 'agent-*.jsonl')))
    grand = collections.defaultdict(lambda: [0,0,0,0,0])
    for k,v in tot.items():
        for j in range(5): grand[k][j]+=v[j]
    for s in subs:
        st, sf, sl, _, _ = summarize(s)
        # first user message = the dispatch prompt; grab first 90 chars
        head = ''
        for m in iter_msgs(s):
            if m.get('type') == 'user':
                c = (m.get('message') or {}).get('content')
                if isinstance(c, str): head = c[:90]
                elif isinstance(c, list):
                    for b in c:
                        if isinstance(b, dict) and b.get('type') == 'text': head = b['text'][:90]; break
                break
        print(f"  sub {os.path.basename(s)} size={os.path.getsize(s)//1024}K span {sf} .. {sl}\n     prompt: {head!r}\n" + fmt(st))
        for k,v in st.items():
            for j in range(5): grand[k][j]+=v[j]
    print("  GRAND TOTAL (main+subagents):\n" + fmt(grand))
    print()
