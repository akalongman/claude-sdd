#!/usr/bin/env python3
"""Per-session role roll-up + controller tool profile.
Roles are classified from the first user message of each subagent transcript."""
import json, os, sys, glob, collections, re, datetime

def iter_msgs(p):
    with open(p, errors='replace') as fh:
        for line in fh:
            try: yield json.loads(line)
            except Exception: pass

def role_of(head):
    h = head.lower()
    if 'unit controller' in h or 'app-sdd-unit-controller' in h or 'sdd:unit-controller' in h or 'sdd-unit-controller' in h or h.startswith('you run one unit'): return 'unit-controller'
    if 're-review' in h or 'rereview' in h or 'scoped re-review' in h: return 'rereview'
    if h.startswith('you are reviewing') or 'reviewing one' in h: return 'task-review'
    if 'final whole-branch' in h or 'final review' in h or 'whole-branch' in h:
        return 'final-fix' if 'fixing the findings' in h else 'final-review'
    if 'you are implementing' in h or 'implement' in h[:60]: return 'implementer'
    if 'fixing the findings' in h: return 'final-fix'
    if 'skill tool' in h: return 'skill-dispatch'
    return 'other'

def strip_prefix(agent_type):
    """The agent name after its prefix: app-sdd- (the private skill's agents),
    sdd: (the plugin's) or sdd- (the plugin's name fallback); any other name
    unchanged."""
    for p in ('app-sdd-', 'sdd:', 'sdd-'):
        if agent_type.startswith(p):
            return agent_type[len(p):]
    return agent_type

def role_of_meta(path, head):
    """Role from the sidecar agent-*.meta.json (agentType, description) when the
    harness wrote one (2026-09-25 layout), the agentType read after any of the
    three prefixes strip_prefix names; the prompt head otherwise."""
    meta = path[:-6] + '.meta.json'
    try:
        with open(meta) as fh: m = json.load(fh)
    except (OSError, ValueError):
        return role_of(head)
    t = (m.get('agentType') or '').lower(); d = (m.get('description') or '').lower()
    if strip_prefix(t) == 'unit-controller': return 'unit-controller'
    if strip_prefix(t) == 'implementer': return 'final-fix' if 'final' in d and 'fix' in d else 'implementer'
    if strip_prefix(t) == 'reviewer':
        if 're-review' in d or 'rereview' in d: return 'rereview'
        if 'final' in d or 'whole-branch' in d: return 'final-review'
        return 'task-review'
    return role_of(head)

def dur(a,b):
    try:
        fa=datetime.datetime.fromisoformat(a.replace('Z','+00:00')); fb=datetime.datetime.fromisoformat(b.replace('Z','+00:00'))
        return (fb-fa).total_seconds()/60
    except Exception: return 0

for sess in sys.argv[1:]:
    sid=os.path.basename(sess)[:-6]
    subdir=os.path.join(os.path.dirname(sess), sid, 'subagents')
    # controller profile
    tools=collections.Counter(); reads=collections.Counter(); ledger_reads=0; edits_ledger=0
    turns=0; maxctx=0; out=0; cr=0; models=collections.Counter()
    for m in iter_msgs(sess):
        if m.get('type')!='assistant': continue
        msg=m.get('message') or {}; u=msg.get('usage') or {}
        turns+=1; models[msg.get('model')]+=1
        ctx=u.get('input_tokens',0)+u.get('cache_read_input_tokens',0)+u.get('cache_creation_input_tokens',0)
        maxctx=max(maxctx,ctx); out+=u.get('output_tokens',0); cr+=u.get('cache_read_input_tokens',0)
        for b in msg.get('content') or []:
            if isinstance(b,dict) and b.get('type')=='tool_use':
                n=b.get('name'); tools[n]+=1
                inp=b.get('input') or {}
                fp=inp.get('file_path') or ''
                if n=='Read':
                    if '.superpowers/sdd' in fp: reads['sdd-workspace-file']+=1
                    if fp.endswith('progress.md'): ledger_reads+=1
                    if 'openspec/changes' in fp: reads['openspec-artifact']+=1
                    if 'docs/superpowers/plans' in fp: reads['plan-file']+=1
                if n in ('Edit','Write') and fp.endswith('progress.md'): edits_ledger+=1
                if n=='Bash':
                    c=inp.get('command') or ''
                    if 'progress.md' in c: reads['bash-touching-ledger']+=1
                    if 'git diff' in c or 'git show' in c: reads['bash-git-diff/show']+=1
                    if 'review-package' in c: reads['bash-review-package']+=1
                    if 'task-brief' in c or 'section-brief' in c: reads['bash-brief-script']+=1
                    if 'git commit' in c: reads['bash-git-commit']+=1
    print(f"=== {sid}  ({os.path.basename(os.path.dirname(sess))})")
    print(f"  controller: turns={turns} models={dict(models)} max_context_tokens={maxctx} total_cache_read={cr} output={out}")
    print(f"  controller tools: {dict(tools.most_common(12))}")
    print(f"  controller reads: {dict(reads)} ledger_reads={ledger_reads} ledger_edits={edits_ledger}")
    roll=collections.defaultdict(lambda: [0,0,0,0,0.0,0])  # role -> [n, turns, cache_read, out, minutes, failed]
    for s in sorted(glob.glob(os.path.join(subdir,'agent-*.jsonl'))):
        head=''; f=l=None; t=0; c=0; o=0; failed=False; mdl=collections.Counter()
        for m in iter_msgs(s):
            ts=m.get('timestamp')
            if ts: f=f or ts; l=ts
            if not head and m.get('type')=='user':
                cc=(m.get('message') or {}).get('content')
                if isinstance(cc,str): head=cc[:200]
                elif isinstance(cc,list):
                    for b in cc:
                        if isinstance(b,dict) and b.get('type')=='text': head=b['text'][:200]; break
            if m.get('type')=='assistant':
                msg=m.get('message') or {}; u=msg.get('usage') or {}
                t+=1; c+=u.get('cache_read_input_tokens',0); o+=u.get('output_tokens',0); mdl[msg.get('model')]+=1
        if t<=1 and o==0: failed=True
        r=role_of_meta(s, head); x=roll[r]; x[0]+=1; x[1]+=t; x[2]+=c; x[3]+=o; x[4]+=dur(f,l); x[5]+=failed
        roll[r+'|'+','.join(k for k in mdl if k)][0]+=0  # noop
    print("  role                 n  turns   cache_read     out   minutes failed")
    for r,(n,t,c,o,mins,fl) in sorted(roll.items()):
        if '|' in r: continue
        print(f"  {r:18s} {n:3d} {t:6d} {c:12d} {o:7d} {mins:8.0f} {fl}")
    print()
