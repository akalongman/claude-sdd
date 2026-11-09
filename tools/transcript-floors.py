#!/usr/bin/env python3
"""Context floors around /clear and /compact, and the first-turn context of
subagents.

Usage: transcript-floors.py [--since ISO] SESSION_JSONL [...]

For each session it lists every /clear and /compact command with the context
of the last real controller turn before it and of the first real turn after
it (a real turn carries more than 20,000 tokens of context: input plus cache
creation plus cache read; the helper calls the harness makes right after a
clear are smaller and are skipped). It then prints, over all sessions given,
the distribution of the after values per command, and the first-turn context
of every subagent file found under <session-id>/subagents/. Context here is
per response, keyed on message.id as in transcript-window.py.

Standard library only; nothing is written.
"""
import glob
import json
import os
import sys

REAL = 20000


def iter_msgs(path):
    with open(path, errors='replace') as fh:
        for line in fh:
            try:
                yield json.loads(line)
            except Exception:
                continue


def turns(path, since=None):
    """Yield ('cmd', name) for clear/compact commands and ('turn', ctx) per response."""
    seen = set()
    for m in iter_msgs(path):
        ts = m.get('timestamp') or ''
        if since and ts < since:
            continue
        msg = m.get('message') or {}
        if m.get('type') == 'user':
            c = msg.get('content')
            text = c if isinstance(c, str) else (json.dumps(c) if c else '')
            for name in ('clear', 'compact'):
                if f'<command-name>/{name}</command-name>' in text:
                    yield 'cmd', name
            continue
        if m.get('type') != 'assistant':
            continue
        mid = msg.get('id')
        if mid in seen:
            continue
        seen.add(mid)
        u = msg.get('usage') or {}
        ctx = (u.get('input_tokens') or 0) + (u.get('cache_creation_input_tokens') or 0) + (u.get('cache_read_input_tokens') or 0)
        yield 'turn', ctx


def stats(vals):
    if not vals:
        return 'none'
    v = sorted(vals)
    n = len(v)
    return (f"n={n} min={v[0]} p25={v[n // 4]} median={v[(n - 1) // 2]} "
            f"mean={sum(v) // n} max={v[-1]}")


def main(argv):
    since = None
    paths = []
    it = iter(argv)
    for a in it:
        if a == '--since':
            since = next(it)
        else:
            paths.append(a)
    if not paths:
        sys.exit(__doc__)
    after = {'clear': [], 'compact': []}
    before = {'clear': [], 'compact': []}
    sub_first = []
    for sess in paths:
        sid = os.path.basename(sess)[:-6]
        print(f"=== SESSION {sess}")
        last = None
        pending = None
        for kind, val in turns(sess, since):
            if kind == 'turn':
                if val <= REAL:
                    continue
                if pending:
                    name, prev = pending
                    print(f"  /{name:7s} before={prev if prev is not None else 'NA':>8} after={val:>8}")
                    after[name].append(val)
                    if prev is not None:
                        before[name].append(prev)
                    pending = None
                last = val
            else:
                pending = (val, last)
        subdir = os.path.join(os.path.dirname(sess), sid, 'subagents')
        for s in sorted(glob.glob(os.path.join(subdir, 'agent-*.jsonl'))):
            for kind, val in turns(s, since):
                if kind == 'turn':
                    sub_first.append(val)
                    break
    print("=== after the command, first real turn")
    for name in ('clear', 'compact'):
        print(f"  /{name:7s} after:  {stats(after[name])}")
        print(f"  /{name:7s} before: {stats(before[name])}")
    print(f"=== subagent first-turn context: {stats(sub_first)}")


if __name__ == '__main__':
    main(sys.argv[1:])
