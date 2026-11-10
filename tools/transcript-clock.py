#!/usr/bin/env python3
"""Wall-clock accounting for apply runs: where the minutes went.

Usage:
    python3 tools/transcript-clock.py [--gap MINUTES] [--skill NAME] [--tsv]
        [--runs] [--gaps] <project-dir>/<session-id>.jsonl [...]

--skill adds a skill whose invocations start a run to the two that always
do, app-subagent-apply and sdd:apply; with no subagents in the run, the run
ends at the session's last assistant record or the next invocation, so
compare only active minutes.

For every session it finds each apply run: a run starts at an invocation of
the skill `app-subagent-apply` or `sdd:apply` (or, when the session invokes
neither, at the human prompt that precedes the first dispatch of an agent
named `app-sdd-*`, `sdd:*` or `sdd-*`) and ends at the end of the
controller turn in which the run's last such subagent finished (the next
`turn_duration` system record at or after that subagent's last timestamp;
the controller's last assistant record when there is none). A session can
hold several runs; a run ends early when one of those skills is invoked
again.

Inside each run every record of the controller and of every subagent
under <session-id>/subagents/ is an event, and the gap between two
consecutive events goes to one of four buckets. "prompt": a human prompt
ends it (a user record whose content is a plain string, not meta, not a
harness echo starting with `<` except `<bash-input>`), directly or within
60 seconds (the harness writes attachment and queue records just before a
prompt). "ruling": the result of an AskUserQuestion ends it. "idle": a
controller turn end (turn_duration or away_summary) precedes it and the
next record is the controller's, so nothing was running until a message
from another session or a background task woke it. "agent": everything
else, which is agents working or a tool call outstanding. Gaps longer than
--gap minutes (default 10) are reported apart as waits (prompt, ruling,
idle) or stalls (agent) and excluded from the active figure, so a run that
waited overnight for an answer is not charged the night.

Per run it prints: the session, the target (skill argument or the change
or plan named in the first dispatch prompt), start and end in UTC, elapsed
minutes, active minutes (elapsed minus every long gap), the agent share of
active split into the union of subagent busy time and the remainder (the
controller alone), the user share (short prompt and ruling gaps),
the number of units (unit-controller subagents, or implementer subagents
when the run has no unit controllers, by the role rule below), dispatches,
subagent files, human prompts, compactions and the sum of the harness's
own turn_duration records. --tsv prints one tab-separated line per run
with a header; --runs adds a block that merges runs with the same project
and target across sessions (continuations after a context reset); --gaps
lists every gap over the threshold with the event on each side.

A subagent's role comes from the agent type in its meta file when that
type carries an app-sdd-, sdd: or sdd- prefix, and only a prefixed type
gives unit-controller. The first prefixed type dates from 2026-09-23, so
an earlier subagent's type is unprefixed. A bare unit-controller,
implementer or reviewer is "other". Any other type, general-purpose
included, and a subagent without a meta file take implementer or
reviewer from the opening words of the dispatch prompt, or "other" when
neither matches: a general-purpose subagent opening "You run one unit"
is no unit controller, so a run of it and two general-purpose
implementers counts two units.

Timestamps are the records' ISO UTC `timestamp` fields. The script reads
in place and writes nothing. Written 2026-10-08 for the slowdown question.
"""
import glob
import json
import os
import re
import sys
from datetime import datetime, timezone

SKILLS = {"app-subagent-apply", "sdd:apply"}  # --skill adds to the set
HUMAN_ECHO = ("<command-name>", "<command-message>", "<local-command",
              "<task-notification", "<system-reminder>", "<bash-stdout>",
              "<bash-stderr>")


def parse_args(argv):
    gap, tsv, runs, gaps, paths = 10.0, False, False, False, []
    it = iter(argv)
    for a in it:
        if a == "--gap":
            gap = float(next(it))
        elif a == "--skill":
            SKILLS.add(next(it))
        elif a == "--tsv":
            tsv = True
        elif a == "--runs":
            runs = True
        elif a == "--gaps":
            gaps = True
        else:
            paths.append(a)
    return gap, tsv, runs, gaps, paths


def ts(r):
    t = r.get("timestamp")
    if not t:
        return None
    try:
        return datetime.fromisoformat(t.replace("Z", "+00:00"))
    except ValueError:
        return None


def records(path):
    for line in open(path, encoding="utf-8", errors="replace"):
        try:
            yield json.loads(line)
        except ValueError:
            continue


def is_human(r):
    if r.get("type") != "user" or r.get("isMeta"):
        return False
    c = (r.get("message") or {}).get("content")
    if not isinstance(c, str):
        return False
    if c.startswith(HUMAN_ECHO):
        return False
    return True


def target_from_prompt(p):
    m = re.search(r"OpenSpec change `([^`]+)`", p)
    if m:
        return m.group(1)
    m = re.search(r"change `?([a-z0-9][a-z0-9-]+)`?", p)
    if m and "-" in m.group(1):
        return m.group(1)
    m = re.search(r"(\S+/docs/superpowers/plans/\S+?\.md)", p)
    if m:
        return os.path.basename(m.group(1))
    m = re.search(r"(\S+\.md)", p)
    if m:
        return os.path.basename(m.group(1))
    return ""


def load_controller(path):
    """Events plus the markers the run boundaries need."""
    ev, skills, disps, turns, humans, compactions, last_assist = [], [], [], [], [], 0, None
    asks, questions = set(), []
    for n, r in enumerate(records(path), 1):
        t = ts(r)
        if t is None:
            continue
        kind = "human" if is_human(r) else "agent"
        what = r.get("type") or "?"
        if r.get("type") == "system":
            what = "system:" + str(r.get("subtype"))
            if r.get("subtype") in ("turn_duration", "away_summary"):
                kind = "turn_end"
        elif r.get("type") == "user" and not is_human(r):
            c = (r.get("message") or {}).get("content")
            what = "user:" + (c[:20] if isinstance(c, str) else (c[0].get("type", "?") if isinstance(c, list) and c else "?"))
            if isinstance(c, list) and any(isinstance(b, dict) and b.get("type") == "tool_result"
                                           and b.get("tool_use_id") in asks for b in c):
                kind = "ruling"
                what = "user:ruling answered"
        elif r.get("type") == "assistant":
            for b in (r.get("message") or {}).get("content") or []:
                if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == "AskUserQuestion":
                    asks.add(b.get("id"))
                    questions.append(t)
        ev.append((t, kind, "controller", f"{what} line {n}"))
        if kind == "human":
            c = r["message"]["content"]
            humans.append((t, c[:80].replace("\n", " ")))
            if c.startswith("<command-name>/compact") or "/compact" in c[:40]:
                compactions += 1
        if r.get("type") == "system" and r.get("subtype") == "turn_duration":
            turns.append((t, (r.get("durationMs") or 0) / 60000.0))
        if r.get("type") == "assistant":
            last_assist = t
            for b in (r.get("message") or {}).get("content") or []:
                if not isinstance(b, dict) or b.get("type") != "tool_use":
                    continue
                inp = b.get("input") or {}
                if b.get("name") == "Skill" and str(inp.get("skill")) in SKILLS:
                    skills.append((t, str(inp.get("args") or "")))
                st = str(inp.get("subagent_type") or "")
                if strip_prefix(st) != st:
                    disps.append((t, st, target_from_prompt(str(inp.get("prompt") or ""))))
    return ev, skills, disps, turns, humans, compactions, last_assist, questions


def load_subagents(session_path):
    d = os.path.join(session_path[:-6], "subagents")
    out = []
    for f in sorted(glob.glob(os.path.join(d, "agent-*.jsonl"))):
        meta = {}
        mf = f[:-6] + ".meta.json"
        if os.path.exists(mf):
            try:
                meta = json.load(open(mf))
            except ValueError:
                meta = {}
        first = last = None
        evs, head = [], ""
        for r in records(f):
            t = ts(r)
            if t is None:
                continue
            evs.append(t)
            first = first or t
            last = t
            if not head and r.get("type") == "user":
                c = (r.get("message") or {}).get("content")
                if isinstance(c, str):
                    head = c[:80]
        if first is None:
            continue
        out.append({"file": os.path.basename(f), "type": meta.get("agentType", ""),
                    "role": role_of(meta.get("agentType", ""), head),
                    "depth": meta.get("spawnDepth"), "first": first, "last": last, "events": evs})
    return out


def strip_prefix(agent_type):
    """The agent name after its prefix: app-sdd- (the private skill's agents),
    sdd: (the plugin's) or sdd- (the plugin's name fallback); any other name
    unchanged."""
    for p in ('app-sdd-', 'sdd:', 'sdd-'):
        if agent_type.startswith(p):
            return agent_type[len(p):]
    return agent_type


def role_of(agent_type, head):
    """Role from a prefixed meta type (the first dates from 2026-09-23),
    the only source of unit-controller; other for a bare unit-controller,
    implementer or reviewer (a project's own agent); for any other type,
    general-purpose included, implementer or reviewer from the dispatch
    template's opening words, else other."""
    if strip_prefix(agent_type) != agent_type:
        return strip_prefix(agent_type)
    if agent_type in ("unit-controller", "implementer", "reviewer"):
        return "other"
    h = head.lower()
    if h.startswith("you are implementing") or h.startswith("implement "):
        return "implementer"
    if "review" in h[:60]:
        return "reviewer"
    return "other"


def busy_minutes(subs, start, end, gap_min):
    """Union of the time at least one subagent was emitting records, with long internal gaps removed."""
    iv = []
    for s in subs:
        evs = [t for t in s["events"] if start <= t <= end]
        for a, b in zip(evs, evs[1:]):
            if (b - a).total_seconds() / 60 <= gap_min:
                iv.append((a, b))
    return union_minutes(iv)


def union_minutes(intervals):
    total, cur = 0.0, None
    for a, b in sorted(intervals):
        if cur is None or a > cur[1]:
            if cur:
                total += (cur[1] - cur[0]).total_seconds() / 60
            cur = [a, b]
        elif b > cur[1]:
            cur[1] = b
    if cur:
        total += (cur[1] - cur[0]).total_seconds() / 60
    return total


def measure(path, gap_min):
    ev, skills, disps, turns, humans, compactions, last_assist, questions = load_controller(path)
    subs = load_subagents(path)
    sid = os.path.basename(path)[:-6]
    proj = os.path.basename(os.path.dirname(path))
    # run starts
    starts = []
    if skills:
        starts = [(t, a or (disps[0][2] if disps else "")) for t, a in skills]
    elif disps:
        t0 = disps[0][0]
        prev = [h for h in humans if h[0] <= t0]
        starts = [((prev[-1][0] if prev else t0), disps[0][2])]
    else:
        return []
    all_ev = sorted(ev + [(t, "agent", s["file"][6:14] + ":" + strip_prefix(s["type"]), "")
                          for s in subs for t in s["events"]])
    session_end = max(e[0] for e in all_ev)
    out = []
    for i, (start, target) in enumerate(starts):
        bound = starts[i + 1][0] if i + 1 < len(starts) else session_end
        run_disps = [d for d in disps if start <= d[0] < bound]
        if not target and run_disps:
            target = run_disps[0][2]
        run_subs = [s for s in subs if start <= s["first"] < bound]
        if run_subs:
            last_sub = max(s["last"] for s in run_subs)
            after = [t for t, _ in turns if t >= last_sub and t <= bound]
            end = after[0] if after else min(bound, last_assist or bound)
        else:
            end = min(bound, last_assist or bound)
        if end < start:
            end = start
        win = [e for e in all_ev if start <= e[0] <= end]
        # Every gap between consecutive events is charged to one bucket by what
        # ends it and what precedes it: "prompt" when a human prompt ends it
        # (directly, or within 60 seconds, since the harness writes attachment
        # and queue records just before a prompt); "ruling" when the result of
        # an AskUserQuestion ends it; "idle" when a controller turn end precedes
        # it and no agent record ended it sooner (nothing was running; a message
        # from another session or a background task woke the controller later);
        # "agent" otherwise. Gaps over the threshold are reported apart as long.
        next_human = [None] * len(win)
        nh = None
        for j in range(len(win) - 1, -1, -1):
            if win[j][1] == "human":
                nh = win[j][0]
            next_human[j] = nh
        short = {"agent": 0.0, "prompt": 0.0, "ruling": 0.0, "idle": 0.0}
        long = {"agent": 0.0, "prompt": 0.0, "ruling": 0.0, "idle": 0.0}
        n_long = {"agent": 0, "prompt": 0, "ruling": 0, "idle": 0}
        long_gaps = []
        for j, ((t0, k0, s0, w0), (t1, k1, s1, w1)) in enumerate(zip(win, win[1:]), 1):
            g = (t1 - t0).total_seconds() / 60
            if k1 == "human" or (next_human[j] is not None and (next_human[j] - t1).total_seconds() <= 60):
                b = "prompt"
            elif k1 == "ruling":
                b = "ruling"
            elif k0 == "turn_end" and s1 == "controller":
                b = "idle"
            else:
                b = "agent"
            if g > gap_min:
                long[b] += g
                n_long[b] += 1
                long_gaps.append((t0, t1, g, b, f"{s0} {w0}", f"{s1} {w1}"))
            else:
                short[b] += g
        elapsed = (end - start).total_seconds() / 60
        long_total = sum(long.values())
        busy = busy_minutes(run_subs, start, end, gap_min)
        ucs = [s for s in run_subs if s["role"] == "unit-controller"]
        impls = [s for s in run_subs if s["role"] == "implementer"]
        units = len(ucs) if ucs else len(impls)
        n_h = sum(1 for h in humans if start < h[0] <= end)
        n_q = sum(1 for q in questions if start <= q <= end)
        turn_sum = sum(m for t, m in turns if start <= t <= end)
        out.append({
            "project": proj, "session": sid[:8], "target": target, "start": start, "end": end,
            "elapsed": elapsed, "active": elapsed - long_total,
            "agent": short["agent"], "controller": max(0.0, short["agent"] - busy), "busy": busy,
            "user": short["prompt"] + short["ruling"], "idle_short": short["idle"],
            "wait_prompt": long["prompt"], "n_prompt": n_long["prompt"],
            "wait_ruling": long["ruling"], "n_ruling": n_long["ruling"],
            "wait_idle": long["idle"], "n_idle": n_long["idle"],
            "stall": long["agent"], "n_stall": n_long["agent"],
            "units": units, "dispatches": len(run_disps), "subfiles": len(run_subs),
            "prompts": n_h, "questions": n_q, "compactions": compactions, "turn_sum": turn_sum,
            "long_gaps": long_gaps,
        })
    return out


COLS = ["project", "session", "target", "start", "end", "elapsed", "active", "agent", "busy",
        "controller", "user", "idle_short", "wait_prompt", "n_prompt", "wait_ruling", "n_ruling",
        "wait_idle", "n_idle", "stall", "n_stall", "units", "dispatches", "subfiles", "prompts",
        "questions", "compactions", "turn_sum"]


GROUP_KEYS = ["elapsed", "active", "agent", "busy", "controller", "user", "wait_prompt", "n_prompt",
              "wait_ruling", "n_ruling", "wait_idle", "n_idle", "stall", "n_stall", "units",
              "dispatches", "prompts", "questions"]


def fmt(v):
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%dT%H:%MZ")
    if isinstance(v, float):
        return f"{v:.1f}"
    return str(v)


def main(argv):
    if not argv or "--help" in argv or "-h" in argv:
        print(__doc__)
        return
    gap, tsv, want_runs, want_gaps, paths = parse_args(argv)
    rows = []
    for p in paths:
        rows.extend(measure(p, gap))
    if tsv:
        print("\t".join(COLS))
        for r in rows:
            print("\t".join(fmt(r[c]) for c in COLS))
    else:
        for r in rows:
            print(f"{r['project']} {r['session']} {r['target'] or '?'}: "
                  f"{fmt(r['start'])} to {fmt(r['end'])}, elapsed {r['elapsed']:.0f} min, "
                  f"active {r['active']:.0f} (agents {r['agent']:.0f}: subagents {r['busy']:.0f}, "
                  f"controller {r['controller']:.0f}; user {r['user']:.0f}), "
                  f"waits over {gap:.0f} min: prompt {r['wait_prompt']:.0f}/{r['n_prompt']}, "
                  f"ruling {r['wait_ruling']:.0f}/{r['n_ruling']}, idle {r['wait_idle']:.0f}/{r['n_idle']}, "
                  f"stall {r['stall']:.0f}/{r['n_stall']}; units {r['units']}, dispatches {r['dispatches']}, "
                  f"prompts {r['prompts']}, questions {r['questions']}")
    if want_gaps:
        for r in rows:
            for t0, t1, g, kind, a, b in r["long_gaps"]:
                print(f"GAP {r['session']} {r['target'] or '?'}: {fmt(t0)} to {fmt(t1)} {g:.0f} min {kind}, "
                      f"before: {a.strip()}, after: {b.strip()}")
    if want_runs:
        groups = {}
        for r in rows:
            key = (r["project"].split("--worktrees-")[0], r["target"])
            g = groups.setdefault(key, {"sessions": [], "start": r["start"], "end": r["end"]})
            g["sessions"].append(r["session"])
            for k in GROUP_KEYS:
                g[k] = g.get(k, 0) + r[k]
            g["start"] = min(g["start"], r["start"])
            g["end"] = max(g["end"], r["end"])
        print("\nproject\ttarget\tsessions\tfirst_start\tlast_end\t" + "\t".join(GROUP_KEYS))
        for (proj, target), g in sorted(groups.items(), key=lambda kv: kv[1]["start"]):
            print("\t".join([proj, target or "?", ",".join(g["sessions"]), fmt(g["start"]), fmt(g["end"])]
                            + [fmt(g[k]) for k in GROUP_KEYS]))
        tot = {k: sum(g[k] for g in groups.values()) for k in GROUP_KEYS}
        print(f"\nTOTAL runs {len(groups)}: " + ", ".join(f"{k} {fmt(tot[k])}" for k in GROUP_KEYS))


if __name__ == "__main__":
    main(sys.argv[1:])
