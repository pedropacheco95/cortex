---
name: cortex-loop-insight-gaps
description: >-
  Daily session-observation capturer for a Cortex project. Use for the scheduled
  insight-gaps task, or when the user says "run the insight-gaps loop", "capture
  what we learned today", or "what did the sessions teach the project". Runs
  `cortex loop-insight-gaps --collect`, classifies the day's transcripts against
  the five gap signals in-session, runs `cortex loop-insight-gaps --propose`, and
  summarises the prose writes plus .cortex/pulse/insight-gaps.md.
---

# cortex-loop-insight-gaps

You are the judgment middle between two deterministic Core halves (spec
insight.gaps-loop Rule 1). The CLI collects and proposes; you — this session —
do the five-signal classification. You already ARE a Claude session: **never
spawn a nested `claude` subprocess, and never run bare `cortex
loop-insight-gaps`** (bare mode exists only for humans at a terminal; it would
spawn one).

1. From the project root, run `cortex loop-insight-gaps --collect`.
2. Read `.cortex/pulse/.gaps-corpus.json` — this project's session messages for
   the daily window.
3. Before classifying, read the existing `.cortex/insight/map/*.md` list and
   `.cortex/insight/_index.md` so you can prefer **appending to an existing
   prose file** over creating a near-duplicate (`setup.md` vs
   `environment-setup.md`) — the file-creation discipline (spec Rule 5).
4. Classify the evidence against **exactly five gap signals** (schema §4.10, v2
   design §5). Evidence matching none of the five is omitted (it becomes an
   "unmatched, reported" line — no write):
   - **Signal 1 — investigation load:** Claude spent significant tokens on
     something project context should have made obvious. → prose append.
   - **Signal 2 — misjudgment:** Claude proposed X, the user corrected to Y, and
     Y wasn't in any persistent layer. → prose append.
   - **Signal 3 — user explanation:** the user explained setup/conventions/
     context not currently captured. → prose append.
   - **Signal 4 — correction to existing knowledge:** the user contradicted
     content Claude referenced. **Split by where the content lives:** if it
     lives in `insight/map/` set `"location": "insight"` and give the exact
     `was`/`now`/`why` (the loop rewrites in place + logs a correction); if it
     lives in compass/atlas/`RULES.md` set `"location": "gated"` with the
     `target` file and the byte-exact `current`/`replacement` (the loop writes a
     `gated-layer-update` proposal — **never** a direct gated write).
   - **Signal 5 — memory-commit request:** the user explicitly said "remember
     this" / "commit to memory". → a `user-directed-capture` proposal carrying
     the user's own words as `text` and your best-guess landing layer as
     `target` (human-editable before accept).
5. Write the classification as a JSON array to a scratchpad file (your session
   scratchpad — never inside the project). Each observation is
   `{"signal": 1-5, "sessionIds": [string], "topic"?: string, "text"?: string,
   "location"?: "insight"|"gated", "was"?: string, "now"?: string, "why"?:
   string, "target"?: string, "current"?: string, "replacement"?: string}`.
6. Run `cortex loop-insight-gaps --propose <that scratchpad file>`. The
   deterministic close appends prose (signals 1–3), rewrites-in-place with a
   `## Corrections` log (signal 4-in-insight), routes gated material into
   `.cortex/pulse/insight-gaps.md` proposal sections with S-ids from the shared
   counter (signals 4-gated, 5), and maintains the `insight/_index.md` file list
   on new-file creation. It writes only `.md` in `map/` — a `.json` target is
   refused (§4.10.3).
7. Read the prose files you touched and `.cortex/pulse/insight-gaps.md`, then
   summarise to the user: the prose appends/rewrites (autonomous, ungated), and
   the gated proposals awaiting review.

**Never write gated content directly.** Compass, atlas, and `RULES.md` change
only through `cortex pulse-accept`. Insight prose (`map/*.md`) is the loop's own
ungated layer — direct writes there, always with a provenance trailer, are the
design.
