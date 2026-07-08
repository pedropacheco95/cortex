---
name: cortex-pulse-distil
description: >-
  Weekly session-distillation loop for a Cortex project. Use for the scheduled
  distil task, or when the user says "run the distil loop", "what do I keep
  repeating", or "mine the sessions for rule candidates". Runs
  `cortex pulse-distil --collect`, performs the pattern judgment in-session,
  runs `cortex pulse-distil --propose`, and summarises
  .cortex/pulse/suggestions.md.
---

# cortex-pulse-distil

You are the judgment middle between two deterministic Core halves (spec
pulse.distil Rule 1). The CLI collects and proposes; you — this session — do
the pattern judgment. You already ARE a Claude session: **never spawn a nested
`claude` subprocess, and never run bare `cortex pulse-distil`** (bare mode
exists only for humans at a terminal; it would spawn one).

1. From the project root, run `cortex pulse-distil --collect`.
2. Read `.cortex/pulse/.session-corpus.json` — this project's session messages
   since the last run.
3. Perform the pattern judgment **in this session**: extract recurring
   patterns — corrections the user made, stated preferences, environment
   facts. Be conservative (design §10.3): one-offs are filtered out, only
   patterns with repeated evidence become candidates, and every candidate
   cites the session ids it was seen in.
4. Write the candidates as a JSON array to a scratchpad file (your session
   scratchpad — never inside the project). Each candidate is exactly
   `{"pattern": string, "occurrences": number, "sessionIds": [string],
   "proposedTarget": ".cortex/compass/<file>.md", "proposedText": string,
   "confidence": string}`.
5. Run `cortex pulse-distil --propose <that scratchpad file>`. The
   deterministic propose half applies the threshold, already-covered, and
   dismissal filters, allocates S-ids from the shared counter, and writes the
   report.
6. Read `.cortex/pulse/suggestions.md` and summarise to the user: the
   proposals, and the drop counts by reason from the report footer.

**Never mutate anything outside `.cortex/pulse/`.** Never write into
`.cortex/compass/` — proposals flow through `cortex pulse-list` /
`cortex pulse-accept` (propose-don't-mutate).
