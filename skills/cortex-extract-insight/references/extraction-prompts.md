# Extraction prompts — L2 / L3 / L4

The three prompt bodies are Cortex-original (the Graphify study confirms
there is no L2/L3/L4 analogue to copy); the **primitives they share are
lifted from the study's TAKE verdicts** and appear in every extraction
agent's instructions. Model for all three: **Sonnet-class** (design §5.9 —
quality is load-bearing; wrong insight is prejudicial).

## Shared primitives — include in EVERY extraction agent prompt

1. **Provenance thinking → the confidence tier.** Every claim you record has
   an epistemic basis, and the basis picks the tier (schema §4.10.6 — a
   discrete 4-tier enum tied to evidence *kind*, NEVER a float or a
   percentage; the study's production lesson is that continuous ranges
   collapse to a bimodal mess):

   | `confidence` | evidence kind | use when |
   |---|---|---|
   | `structural` | AST relation (L1, tree-sitter) | the edge is a deterministic parse fact — an import, an in-language call |
   | `stated` | EXTRACTED text | explicit content you read asserts it (code, comment, docstring, doc) |
   | `inferred` | INFERRED reasoning | cross-file semantic judgment with no direct textual assertion |
   | `ambiguous` | AMBIGUOUS signal | weak or conflicting evidence — record it flagged, do not omit it, never silently trust it |

2. **Every edge carries a non-empty `evidence` string** — one clause naming
   *why* the relation holds ("both implement the retry/backoff pattern over
   HTTP clients", "session.ts docstring says tokens are minted here"). If
   you cannot state the reason in a clause, do not assert the edge. An empty
   `evidence` is a validation `error`.

3. **Deterministic, path-derived ids** (schema §4.10.6 grammar) — the same
   entity MUST produce the same id regardless of which agent or run touches
   it. Never derive ids from scope names, wave numbers, or agent ids:

   - `file:<project-relpath>` (e.g. `file:src/auth/session.ts`)
   - `element:<project-relpath>#<name>` (e.g. `element:src/auth/session.ts#mintToken`)
   - `concept:<slug>` — slug is `[a-z0-9-]+` (e.g. `concept:token-rotation`)
   - cluster ids: `cluster:<label-slug>`
   - edge ids are derived, exactly: `edge:<edge_type>:<source>-><target>`
     (Core's `deriveEdgeId`, `src/insight/storage.ts`)

4. **Don't re-extract what L1 already has** (study P7). Imports, exports,
   and the import graph are L1 facts: `imports` edges are transcribed from
   L1's `graph.edges` with `confidence: structural`, never re-derived by
   you. Spend your budget entirely on what the AST cannot see — purpose,
   semantics, conventions, cross-file meaning.

5. **Call-edge discipline** (study P5): on a `calls` edge, `source` is the
   CALLER and `target` the CALLEE — never reversed — and `calls` edges stay
   within one language; cross-language call edges are phantom artifacts,
   never emit them.

6. **The closed enums** (schema §4.10.6): `edge_type` ∈ `imports | calls |
   semantically-similar-to | implements-concept | co-clustered`; node `kind`
   ∈ `file | element | concept`; nothing else, ever.

## The per-file entry skeleton (L2 and L3)

Every entry (schema §4.10.2, validated by `check.insight-entry`) is written
to `anatomy/<source-path>.md` (or `scopes/<scope>/anatomy/<source-path>.md`)
with EXACTLY this frontmatter — all eight fields required:

```yaml
---
path: src/auth/session.ts          # project-relative source path
extracted_at: 2026-07-08T14:00:00Z # ISO datetime, now
extraction_level: 2                # 2 or 3
size_lines: 620                    # integer, line count of the source
size_tokens: 5400                  # integer, estimate (~bytes/4 is fine)
centrality: high                   # high | medium | low — from the SCOPE-LOCAL ranking
built_at_commit: "<sha>"           # the ONE value the orchestrator captured at run
                                   #   start — QUOTE it (a sha like 9989e80 would
                                   #   otherwise YAML-coerce to a number)
source_sha256: "<64 lowercase hex>" # sha256 of the SOURCE FILE BODY (shasum -a 256),
---                                #   never of the entry itself — quoted
```

Map centrality from the scope-local degree ranking: top tier → `high`
(these get L3), middle → `medium`, tail/degree-0 → `low`.

## The L2 prompt (every file in the scope)

Inputs handed to the agent per file: the file's content; its L1 record
(`exports`, `imports`, `resolvedImports`); its in/out neighbours from
`graph.edges`; the scope's file list.

> Write the per-file insight entry for `<path>` at `extraction_level: 2`.
> Body sections, exactly these two (`check.insight-entry` requires both):
>
> `## Purpose` — ONE paragraph: what the file does and its role in this
> codebase (not a restatement of its name; grounded in the content you
> read and the L1 context you were given).
>
> `## Connections` — three labelled lists:
> - `Uses:` — `<file>: <what it uses it for>`, grounded in L1's
>   `resolvedImports` (do not re-derive imports; annotate them).
> - `Used by:` — `<file>: <what it provides them>`, from L1's in-edges.
> - `Semantically related (not imports):` — only relations you can justify
>   in a clause; omit the list rather than pad it.

## The L3 prompt (scope-locally central files only)

Same inputs, plus the scope-local centrality ranking. `extraction_level: 3`.
Sections in canonical order (`entry.ts` `ENTRY_SECTIONS`); the validator
minimum is Purpose + Main players + Connections, but a proper L3 entry
carries all that apply:

> `## Purpose` — as L2.
>
> `## Main players` — the named atomic elements the file exposes or
> contains: classes, functions, key constants — each with its **line
> range**, a short description, and an importance marker (critical to
> understand vs. supporting). These become the `element:` nodes and are
> what `cortex insight element` answers from — name them exactly as the
> code does.
>
> `## Insights` — observations that are NOT obvious from reading the file:
> conventions it exemplifies or violates, design decisions embedded in the
> code, performance characteristics or gotchas, non-obvious coupling,
> historical quirks worth knowing before modifying. Restating what the
> code plainly does is not an insight — omit filler.
>
> `## File map` — ONLY for files above ~500 lines: `Lines N–M: <section
> description>` (nested where needed), so a reader can jump without
> reading the whole file. Absent below the threshold is correct, not an
> error.
>
> `## Connections` — as L2.
>
> `## Query pointers` — intent-scoped guidance, 2–5 lines:
> "If you need to <do X>, also read: <files>" / "If you need to <do Y>,
> read first: <files>, then: <files>". Write for the modification patterns
> this file actually participates in, not generic advice.

## The L4 prompt (Phase-4 unification agent)

Inputs: every scope's `anatomy/` entries, scope-local `graph.json` and
`concepts/`, the scope registry, and the L1 module/edge data.

> Produce the global semantic layer:
>
> 1. **Concepts** — codebase-spanning concerns (auth, session, retry,
>    billing-proration, …), one `concepts/<slug>.md` each, node id
>    `concept:<slug>`. A concept is a NAMED ENTITY: reject sentence-like
>    labels (≥8 words or ≥80 chars — that is rationale prose; keep it as
>    edge `evidence` or entry text, never a node) and low-information
>    labels ("utils", "misc", "data").
> 2. **Cross-file/cross-scope edges** in the top-level `graph.json`
>    (§4.10.6 shape; `schemaVersion "3.0"`, `generated`, `built_at_commit`,
>    total-ordered `nodes`/`edges`; every edge with `id`, `source`,
>    `target`, `edge_type`, `confidence`, non-empty `evidence`,
>    `confirmed_at_commit` = this run's commit):
>    - `implements-concept` — file/element node → concept node.
>    - `semantically-similar-to` — the ONLY sanctioned similarity edge,
>      and only for genuinely **non-obvious and cross-cutting** relations
>      (`confidence: inferred`, evidence mandatory). Two modules sharing a
>      name is not evidence; two modules independently implementing the
>      same non-obvious mechanism is.
>    - `co-clustered` — cluster co-membership, derived from `clusters.json`,
>      at CONCEPT granularity: a handful of concept-level co-membership
>      edges, NEVER pairwise file combinatorics across clusters (do not emit
>      an edge per file pair).
> 3. **`tags.json`** — a typed `vocabulary` (`tag`, `kind` ∈ `concern |
>    technology | pattern | layer | domain-term`, optional `aliases`) and
>    `assignments` from node ids to vocabulary tags only. Tags are the
>    embeddings replacement: explainable, stable, traversable — keep the
>    vocabulary small and reused rather than long and bespoke.
> 4. **`clusters.json`** — inferred domain groupings: `cluster:<label-slug>`
>    ids, `label`, `members` (node ids), non-empty one-line `rationale`,
>    `scope` = owning scope id or `"global"`.
>
> Guardrails: same label ≠ same entity — never merge same-named symbols or
> concepts across scopes on string similarity alone (two `UserService`
> elements in different files stay two nodes). Do not re-derive `imports`
> or `calls` facts L1/L3 already established — reference them. When two
> scopes' concepts are genuinely the same concept, unify to one
> `concept:<slug>` node and cite both scopes' files as evidence; when they
> are merely similar, keep both and connect with `semantically-similar-to`.
