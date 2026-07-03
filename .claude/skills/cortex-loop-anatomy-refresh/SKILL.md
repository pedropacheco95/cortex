---
name: cortex-loop-anatomy-refresh
description: >-
  Daily anatomy deep-refresh (purpose-filler) loop for a Cortex project. Use
  for the scheduled anatomy-refresh-deep task, or when the user says "run the
  anatomy refresh", "fill the missing purposes", or "clear the
  needs_purpose_refresh flags". Runs `cortex loop-anatomy-refresh --deep
  --collect`, writes one-line purposes for each worklist entry in-session,
  runs `cortex loop-anatomy-refresh --deep --apply`, and summarises the
  applied/skipped/deferred counts.
---

# cortex-loop-anatomy-refresh

You are the judgment middle between two deterministic Core halves (spec
anatomy.refresh-deep Rule 1). You already ARE a Claude session: **never spawn
a nested `claude` subprocess, and never run bare
`cortex loop-anatomy-refresh --deep`** (bare mode exists only for humans at a
terminal; it would spawn one).

1. From the project root, run `cortex loop-anatomy-refresh --deep --collect`.
2. Read `.cortex/pulse/.purpose-worklist.json` — batches (≤25 entries each) of
   rows flagged `needs_purpose_refresh: true`, each entry carrying `path`,
   `tokens`, and a head `excerpt`. An empty worklist means nothing is flagged:
   report the clean state and stop.
3. For EVERY worklist entry, write a precise one-line purpose **in this
   session**: what the file is for, not what it contains. Derive it from the
   excerpt; open the file itself only when the excerpt is not enough. Max 120
   characters, single line, no `|` pipes.
4. Write the results as a JSON array to a scratchpad file (your session
   scratchpad — never inside the project). Each result is exactly
   `{"path": "<the entry's path>", "purpose": "<one line>"}`.
5. Run `cortex loop-anatomy-refresh --deep --apply <that scratchpad file>`.
   The deterministic apply half validates every purpose, writes only rows
   still flagged whose content hash still matches collect time (a file
   changed mid-flight keeps its flag for the next cycle), and clears
   `needs_purpose_refresh` with a fresh `last_seen` atomically per row.
6. Summarise to the user: purposes applied, results skipped, rows deferred
   (changed mid-flight), and whatever remains flagged for the next cadence.

**Never edit `.cortex/anatomy/files.md` directly** — the `--apply` half owns
that write (table format per cortex-schema.md §4.1). Never mutate anything
else outside `.cortex/pulse/`.
