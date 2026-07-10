---
name: cortex-loop-session-observe
description: >-
  Session-observation loop for a Cortex project — the v3 successor to v2's
  insight-gaps. Use for the scheduled session-observe task, or when the user
  says "run the session-observe loop", "what did we learn this session", or
  "capture session observations". Runs `cortex loop-session-observe
  --collect`, reads the unobserved sessions from the shared corpus, infers
  durable knowledge (user corrections, gotchas hit, non-obvious behaviour,
  patterns established), routes it by type — ungated observations enrich
  insight per-file entries directly with claude-sessions provenance;
  conventions/rules become rule-candidate and decisions become
  decision-candidate pulse proposals — then runs `cortex loop-session-observe
  --apply --proposals <file>` and summarises .cortex/pulse/reports/session-observe.md.
---

# cortex-loop-session-observe

You are the judgment middle between two deterministic Core bookends (spec
insight.session-observe Rule 8). The CLI collects the worklist and audits the
result; you — this session — do the observation and routing judgment. You
already ARE a Claude session: **never spawn a nested `claude` subprocess.**

**The loop-write invariant (RULES 7, spec Rule 5):** your only direct writes
are the `## Insights` / `## Query pointers` sections of existing insight
per-file entries (machine-owned, ungated) and the proposals JSON scratch
file. Everything gated — compass, atlas, RULES.md — goes through the pulse
gate as a typed proposal, with no exception.

1. From the project root, run `cortex loop-session-observe --collect`. Read
   `.cortex/pulse/state/session-observe-worklist.json` — the sessions not yet
   observed. If the worklist is empty, run
   `cortex loop-session-observe --apply` anyway (it records the run in the
   report) and tell the user there was nothing new to observe.
2. Read each worklist session's messages from
   `.cortex/pulse/state/session-corpus.json` (the shared corpus — the same file
   `cortex-pulse-distil` reads; never rebuild it yourself). Infer **durable**
   knowledge from how each session actually went:
   - corrections the user made;
   - gotchas hit (things that cost investigation time);
   - non-obvious behaviour discovered in the codebase;
   - patterns or conventions established.
   Be conservative: session noise is not knowledge. Skip anything an
   unexpired entry in `.cortex/pulse/dismissed.md` already covers.
3. Route every observation into **exactly one** of three types (spec Rule 1):
   - **Ungated codebase observation** (a fact about a specific file — a
     quirk, a convention it exemplifies, navigation guidance): append it
     DIRECTLY to that file's insight entry
     (`.cortex/insight/anatomy/<path>.md` or
     `.cortex/insight/scopes/<scope>/anatomy/<path>.md`):
     - non-obvious observations and quirks → `## Insights`;
     - "if you need to X, also read Y" navigation guidance → `## Query
       pointers`;
     - every appended line MUST end with a provenance trailer naming the
       session it came from: `... (claude-sessions/<user>/<session-id>)`
       (`<user>` = your OS username);
     - NEVER touch `## Purpose`, `## Main players`, `## File map`,
       `## Connections`, or the frontmatter — those are extraction-owned
       (spec Rule 2), and the apply bookend will fail the run if they change;
     - do not duplicate an item the entry already carries;
     - **if the file has no insight entry, skip it with a note in your
       summary — never create entries; creation is extraction's job**
       (`cortex-extract-insight`).
   - **Gated convention or rule** (something that should bind future work,
     not just describe one file): a `rule-candidate` object in your proposals
     JSON — never a direct compass write.
   - **Decision** (the reasoning behind a choice worth preserving): a
     `decision-candidate` object in your proposals JSON — never a direct
     atlas write.
4. **The distil boundary (spec Rule 6):** distil mines *cross-session
   repetition* over a wider window; you capture *in-context, per-session*
   observations. If an observation is repetition-shaped — the same
   correction/preference stated across several sessions — leave it to
   `cortex-pulse-distil`; do not propose it here. (Distil's already-covered
   filter treats patterns you enriched into insight entries as promotion
   material, so enriching once here is enough.)
5. Write the gated candidates to a scratchpad JSON array (empty array when
   none), each object one of:
   ```json
   {"type": "rule-candidate", "pattern": "<the observed convention>",
    "proposedTarget": ".cortex/compass/<file>.md",
    "proposedText": "<the rule text to append>",
    "sessionIds": ["<session-id>"]}
   ```
   ```json
   {"type": "decision-candidate", "title": "<the decision>",
    "reasoning": "<the narrative: on DATE we chose X because Y>",
    "sessionIds": ["<session-id>"]}
   ```
   (A `decision-candidate` needs no target or frontmatter — Core drafts the
   schema-valid `atlas/decisions/YYYY-MM-DD-<slug>.md` proposal file from it,
   carrying the claude-sessions provenance.)
6. Run `cortex loop-session-observe --apply --proposals <file>` (plain
   `--apply` when there were no gated candidates). The deterministic close
   audits your entry writes (section boundaries + provenance trailers),
   verifies compass/atlas are untouched, allocates S-ids from the shared
   counter, writes the typed proposal sections into
   `.cortex/pulse/reports/session-observe.md`, and advances the observed-session
   state. A non-zero exit means you violated a write boundary — fix the
   entries (revert the offending sections) and re-run apply.
7. Read `.cortex/pulse/reports/session-observe.md` and summarise to the user:
   sessions observed, entries enriched, proposals written (their S-ids and
   types), any files skipped for lack of an entry, and any violations.

Gated proposals are reviewed with `cortex pulse-list` / `pulse-accept` /
`pulse-reject` — never apply them yourself.
