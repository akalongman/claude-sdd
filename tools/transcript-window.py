#!/usr/bin/env python3
"""Per-response token accounting for session transcripts, with a time window
and the controller's context per turn.

Usage: transcript-window.py [--since ISO] [--until ISO] SESSION_JSONL [...]

Like transcript-tokens.py this reads <session>.jsonl and the subagent files
under <session-id>/subagents/, sums message.usage per model, and lists the
dispatch calls. It differs in three ways:

- A turn is one API response, keyed by message.id, not one transcript line.
  A response with several content blocks is stored as several lines that
  repeat its usage, and the first line of a subagent response can carry a
  partial output count, so the largest value seen per field is kept.
- --since and --until (ISO 8601, compared as text against each record's
  timestamp) restrict the count to one phase of a long session.
- For the controller it prints the context per turn (input + cache creation
  + cache read) as min, mean and max, and the context of the first turn
  after each compaction command, which is the floor a checkpoint returns to.

Standard library only; nothing is written.
"""
import collections
import glob
import json
import os
import sys

FIELDS = ('input_tokens', 'cache_creation_input_tokens',
          'cache_read_input_tokens', 'output_tokens')


def iter_msgs(path):
    with open(path, errors='replace') as fh:
        for line in fh:
            try:
                yield json.loads(line)
            except Exception:
                continue


def in_window(ts, since, until):
    if not ts:
        return False
    if since and ts < since:
        return False
    if until and ts > until:
        return False
    return True


def collect(path, since, until):
    """Per-response usage, dispatch calls, compaction timestamps, line count."""
    responses = collections.OrderedDict()  # id -> [model, ts, in, cc, cr, out]
    dispatches = []
    compactions = []
    lines = 0
    for m in iter_msgs(path):
        ts = m.get('timestamp')
        if not in_window(ts, since, until):
            continue
        msg = m.get('message') or {}
        if m.get('type') == 'user':
            c = msg.get('content')
            text = c if isinstance(c, str) else (json.dumps(c) if c else '')
            if '<command-name>/compact</command-name>' in text:
                compactions.append(ts)
            continue
        if m.get('type') != 'assistant':
            continue
        lines += 1
        usage = msg.get('usage') or {}
        mid = msg.get('id') or f'noid-{lines}'
        row = responses.setdefault(mid, [msg.get('model') or '?', ts, 0, 0, 0, 0])
        for j, field in enumerate(FIELDS):
            row[2 + j] = max(row[2 + j], usage.get(field) or 0)
        for blk in msg.get('content') or []:
            if isinstance(blk, dict) and blk.get('type') == 'tool_use' and blk.get('name') == 'Agent':
                inp = blk.get('input') or {}
                dispatches.append((ts, inp.get('model') or '<omitted>',
                                   inp.get('subagent_type') or '<none>',
                                   inp.get('description') or ''))
    return responses, dispatches, compactions, lines


def totals(responses):
    tot = collections.defaultdict(lambda: [0, 0, 0, 0, 0])
    for model, _ts, i, cc, cr, o in responses.values():
        t = tot[model]
        t[0] += 1; t[1] += i; t[2] += cc; t[3] += cr; t[4] += o
    return tot


def add(into, tot):
    for k, v in tot.items():
        for j in range(5):
            into[k][j] += v[j]


def fmt(tot):
    return '\n'.join(
        f"    {model:24s} turns={t[0]:5d} in={t[1]:8d} cache_create={t[2]:10d} "
        f"cache_read={t[3]:12d} out={t[4]:9d}"
        for model, t in sorted(tot.items()))


def context_profile(responses, compactions):
    ctx = [(ts, i + cc + cr) for _m, ts, i, cc, cr, _o in responses.values()]
    if not ctx:
        return '    no turns'
    vals = [c for _t, c in ctx]
    out = [f"    turns={len(vals)} context min={min(vals)} "
           f"mean={sum(vals) // len(vals)} max={max(vals)}"]
    for cts in compactions:
        nxt = next(((ts, c) for ts, c in ctx if ts and ts > cts), None)
        if nxt:
            out.append(f"    after compaction at {cts}: first turn {nxt[0]} context={nxt[1]}")
    return '\n'.join(out)


def main(argv):
    since = until = None
    paths = []
    it = iter(argv)
    for a in it:
        if a == '--since':
            since = next(it)
        elif a == '--until':
            until = next(it)
        else:
            paths.append(a)
    if not paths:
        sys.exit(__doc__)
    for sess in paths:
        sid = os.path.basename(sess)[:-6]
        subdir = os.path.join(os.path.dirname(sess), sid, 'subagents')
        resp, disp, comp, lines = collect(sess, since, until)
        main_tot = totals(resp)
        print(f"=== SESSION {sess}\n  window since={since} until={until}  "
              f"controller lines={lines} responses={len(resp)}  dispatches={len(disp)}")
        print("  controller:\n" + (fmt(main_tot) or '    none'))
        print("  controller context per turn:\n" + context_profile(resp, comp))
        by_model = collections.Counter(d[1] for d in disp)
        print("  dispatches by requested model: "
              + ', '.join(f"{m}={n}" for m, n in sorted(by_model.items())))
        for ts, model, kind, desc in disp:
            print(f"    {ts} model={model} type={kind} {desc!r}")
        sub_tot = collections.defaultdict(lambda: [0, 0, 0, 0, 0])
        sub_lines = sub_resp = 0
        for s in sorted(glob.glob(os.path.join(subdir, 'agent-*.jsonl'))):
            r, _d, _c, n = collect(s, since, until)
            if not r:
                continue
            sub_lines += n
            sub_resp += len(r)
            add(sub_tot, totals(r))
        print(f"  subagents in window: lines={sub_lines} responses={sub_resp}\n"
              + (fmt(sub_tot) or '    none'))
        grand = collections.defaultdict(lambda: [0, 0, 0, 0, 0])
        add(grand, main_tot)
        add(grand, sub_tot)
        print("  GRAND TOTAL (controller+subagents):\n" + fmt(grand))


if __name__ == '__main__':
    main(sys.argv[1:])
