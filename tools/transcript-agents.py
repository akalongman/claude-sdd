#!/usr/bin/env python3
"""Per-subagent tally: turns, peak context, cache read, resumes.

Usage:
    python3 tools/transcript-agents.py [--since ISO] [--split N] [--top K]
        <project-dir>/<session-id>.jsonl [...]

For every subagent file under <session-id>/subagents/ whose first response
falls at or after --since (default: no limit) it prints one line: responses
(turns), peak context, first-turn context, total cache read, the cache read
accumulated by the first --split responses (default 150), the number of
messages the controller sent after the dispatch (resumes), the models seen,
the file name and the head of the dispatch prompt. Sorted by turns, longest
first, then the share of the longest --top agents (default 5).

Responses are keyed on message.id and the largest value per usage field is
kept, as in transcript-window.py. Context is input plus cache creation plus
cache read. A resume is a user record whose content is a plain string or
text blocks only, after the first response; tool results are not resumes.
Written 2026-09-22 for the turn-cap question, decision 14 of
docs/decisions.md in the record repository
(akalongman/claude-subagent-apply, private).
"""
import glob
import json
import os
import sys


def parse_args(argv):
    since, split, top, paths = "", 150, 5, []
    it = iter(argv)
    for a in it:
        if a == "--since":
            since = next(it)
        elif a == "--split":
            split = int(next(it))
        elif a == "--top":
            top = int(next(it))
        else:
            paths.append(a)
    return since, split, top, paths


def is_text_only(content):
    if isinstance(content, str):
        return True
    return isinstance(content, list) and content and all(
        isinstance(b, dict) and b.get("type") == "text" for b in content)


def tally(path, since, split):
    per, order, resumes, prompt, first_ts = {}, [], 0, "", None
    for line in open(path, encoding="utf-8", errors="replace"):
        try:
            r = json.loads(line)
        except ValueError:
            continue
        m = r.get("message") or {}
        if r.get("type") == "user":
            c = m.get("content")
            if is_text_only(c):
                if not prompt:
                    prompt = c if isinstance(c, str) else c[0].get("text", "")
                elif order:
                    resumes += 1
            continue
        if r.get("type") != "assistant":
            continue
        if first_ts is None:
            first_ts = r.get("timestamp", "")
        u = m.get("usage") or {}
        mid = m.get("id") or r.get("uuid")
        if mid not in per:
            per[mid] = {"cr": 0, "cw": 0, "in": 0, "model": m.get("model", "")}
            order.append(mid)
        p = per[mid]
        p["cr"] = max(p["cr"], u.get("cache_read_input_tokens") or 0)
        p["cw"] = max(p["cw"], u.get("cache_creation_input_tokens") or 0)
        p["in"] = max(p["in"], u.get("input_tokens") or 0)
    if not order or (first_ts or "") < since:
        return None
    ctx = [per[k]["cr"] + per[k]["cw"] + per[k]["in"] for k in order]
    return {
        "turns": len(order),
        "peak": max(ctx),
        "first": ctx[0],
        "cr": sum(per[k]["cr"] for k in order),
        "cr_split": sum(per[k]["cr"] for k in order[:split]),
        "resumes": resumes,
        "models": ",".join(sorted({per[k]["model"] for k in order})),
        "file": os.path.basename(path).split(".")[0][:22],
        "prompt": prompt[:70].replace("\n", " "),
    }


def main(argv):
    since, split, top, paths = parse_args(argv)
    if not paths:
        print(__doc__)
        return 2
    for sess in paths:
        sid = os.path.basename(sess)[:-6]
        subdir = os.path.join(os.path.dirname(sess), sid, "subagents")
        rows = [t for f in sorted(glob.glob(os.path.join(subdir, "agent-*.jsonl")))
                for t in [tally(f, since, split)] if t]
        rows.sort(key=lambda t: (t["turns"], t["cr"]), reverse=True)
        total = sum(t["cr"] for t in rows)
        print(f"== {sid}  since={since or 'start'}  agents={len(rows)}  "
              f"subagent cache read={total/1e6:.1f}M")
        print(f"turns  peak   first  cache_rd cum@{split:<4d} resumes models  file  prompt")
        for t in rows:
            print(f"{t['turns']:5d} {t['peak']//1000:5d}k {t['first']//1000:5d}k "
                  f"{t['cr']/1e6:7.1f}M {t['cr_split']/1e6:7.1f}M {t['resumes']:7d} "
                  f"{t['models']:<24s} {t['file']} {t['prompt']}")
        if rows and total:
            share = sum(t["cr"] for t in rows[:top]) / total
            print(f"longest {top}: {100*share:.0f}% of subagent cache read; "
                  f"longest 1: {100*rows[0]['cr']/total:.0f}%")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
