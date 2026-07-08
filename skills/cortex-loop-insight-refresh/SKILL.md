---
name: cortex-loop-insight-refresh
description: >-
  Daily inferred-concept-map refresh loop for a Cortex project. Use for the
  scheduled insight-refresh task, or when the user says "run the insight refresh
  loop", "rebuild the concept map", or "refresh the insight graph". Runs
  `cortex loop-insight-refresh --collect`, derives tags, typed edges, and domain
  clusters over the node set in-session, runs
  `cortex loop-insight-refresh --apply`, and summarises the rebuild.
---

# cortex-loop-insight-refresh

You are the judgment middle between two deterministic Core halves (spec
insight.refresh-loop Rule 1). The CLI collects the node set and applies the
result; you — this session — derive the inferred concept map. You already ARE a
Claude session: **never spawn a nested `claude` subprocess, and never run bare
`cortex loop-insight-refresh`** (bare mode exists only for humans at a terminal;
it would spawn one).

This loop is the JSON producer. It writes **only** `insight/map/graph.json`,
`tags.json`, and `clusters.json` — never prose `.md`, never anything gated. The
`.md` lane belongs to `cortex-loop-insight-gaps`; the two loops never overlap
(schema §4.10.3).

1. From the project root, run `cortex loop-insight-refresh --collect`.
2. Read `.cortex/pulse/.insight-refresh-worklist.json` — it holds the node set
   (`nodes`, each `{id, module, label}`) and the `rebuild` kind (`full` or
   `incremental`). The node ids are the constellation grammar (`anatomy:…`,
   `spec:…`, `rule:R-NNN`, …) — use them verbatim; never invent ids.
3. Perform the inference **in this session**, over that node set:
   - **tags** — a short list of concept labels per node id.
   - **edges** — typed relations between nodes. `kind` is one of
     `semantically-related | same-cluster | mentions-same-entity`;
     `confidence` is one of `high | medium | low`.
   - **clusters** — domain groupings, each with a `label`, `members` (node ids),
     and a one-line `rationale`.
4. **Use explainable inference only. Every edge and every cluster MUST carry a
   non-empty, one-line `rationale` that names why the relation holds. NO
   embeddings, NO opaque vector similarity** — if you cannot state the reason in
   a sentence, do not assert the edge. Explainability is a module invariant
   (schema §4.10.2, v2 design §3.4).
5. Write the derivation as a single JSON **object** to a scratchpad file (your
   session scratchpad — never inside the project), shaped exactly:
   `{"tags": {"<node-id>": ["label", …]},
     "edges": [{"from": "<node-id>", "to": "<node-id>",
                "kind": "semantically-related|same-cluster|mentions-same-entity",
                "confidence": "high|medium|low", "rationale": "<one line>"}],
     "clusters": [{"label": "<name>", "members": ["<node-id>", …],
                   "rationale": "<one line>"}]}`.
   Do not assign cluster ids — the apply half mints and carries them over.
6. Run `cortex loop-insight-refresh --apply <that scratchpad file>`. The
   deterministic apply half validates the shape, carries over stable cluster ids
   (member-set Jaccard ≥ the configured threshold keeps an existing id+label),
   preserves re-derived rationale/confidence verbatim, sorts everything
   deterministically, and writes the three JSON files atomically.
7. Read the written files and summarise to the user: the rebuild kind, and the
   node / edge / cluster counts.

**Never mutate anything outside `insight/map/`'s three JSON files.** Never write
prose `.md` in `map/` (that is the gaps loop's lane), never touch cerebrum,
anatomy, atlas, or the spec trees. This loop maintains machine-owned ungated
state directly and proposes nothing (schema Decision 13).
