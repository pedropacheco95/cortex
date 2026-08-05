---
name: cortex-extract-insight
description: 'Build, extract or refresh the codebase insight layer. "extract insight", "map this codebase".'
---

# cortex-extract-insight

## When to use

Use when the user says "extract insight", "run the extraction", "build the
insight layer", "map this codebase", "run the initial extraction", "Cortex
doesn't understand this codebase yet", or "refresh insight for
<file/scope/concept>"; when a scheduled task invokes the extraction directly; or
when an insight refresh loop hands this skill a dirty-file worklist to
re-extract — `cortex-loop-insight-refresh-daily` (daily bundle) or
`cortex-loop-insight-refresh-full` (weekly-quality bundle).

Builds the per-file, per-concept understanding of a codebase stored under
`.cortex/insight/`, in four phases: a deterministic L1 structural pass (Core),
extraction planning with a scope registry, parallel per-scope L2/L3 execution,
and cross-scope L4 unification. There is **no `cortex extract-insight` CLI
command** — this skill IS the extraction.

## What you do

You produce the `.cortex/insight/` layer — an inferred, persistent, queryable
understanding of the codebase (design §5.1) — as **a plan, not a pipeline**
(design §5.3): you read the deterministic L1 output and *decide* how to
analyze the rest, in four phases. Everything you write MUST conform to
`cortex-schema.md` §4.10 (the storage contract) — field names, enums, and id
grammars come from there and from `src/insight/storage.ts`/`entry.ts`; never
invent fields.

Two non-negotiables up front:

- **No CLI wrapper (RULES 3, design §5.3).** There is no `cortex
  extract-insight` command and you must never reference one. You are invoked
  from a session or by a scheduled task; Core never triggers extraction.
- **Recursion re-plans from the top (build-order flag F7).** Your fan-out is
  exactly one level deep. If a scope turns out too large, YOU (the top-level
  orchestrator) break it into sub-scopes and re-dispatch in a later wave. A
  scope sub-agent NEVER spawns sub-agents of its own.

Insight is **ungated — context, not authority** (schema §4.10). You write it
directly; you never touch `compass/`, `atlas/`, `RULES.md`, or either spec
tree, and you emit no pulse proposals — only the two pulse artefacts named in
§4.10.10 plus your transient fragment manifests.

## Invocation modes

Determine the mode before doing anything (design §5.11):

1. **Initial extraction** — no usable `.cortex/insight/` layer exists (or the
   user asks for a rebuild). Run all four phases below.
2. **Scheduled dirty-only refresh** — invoked by the insight refresh loops
   (cortex-loop-insight-refresh-daily in the daily bundle, or
   cortex-loop-insight-refresh-full in the weekly-quality bundle). The invoking loop has already done the
   triage (hash compare, structural filter, Haiku significance pass) and
   hands you a **worklist**: file paths with target levels (L2 or L3) plus
   any concepts/edges invalidated via `reverse-index.json`. Execute exactly
   that worklist: group the files by owning scope (`scope-registry.yaml`),
   re-extract per file at the stated level, refresh only the touched
   scope-local and cross-scope graph neighbourhood, and update
   `ledger.json`. Do NOT re-triage, re-plan the scope tree, or extract
   anything outside the worklist — which files are dirty is the loops' job,
   never yours.
3. **On-demand refresh mid-session** — the user names a file, scope, or
   concept ("refresh insight for src/auth/"). Skip Phase 2 re-planning when
   `scope-registry.yaml` already covers the target; re-extract the named
   files (at their prior `extraction_level` unless asked otherwise), update
   `ledger.json`, and re-verify the edges/concepts that reference them.

A resumed run (a prior extraction crashed) is mode 1 entered through the
checkpoint-recovery rules in `references/orchestration.md` — never re-extract
a scope already checkpointed complete.

## Phase 1 — L1 structural pass (deterministic, Core)

L1 is Core library code, not a CLI verb: **as of now `cortex insight` exposes
only the v3 query surface (`file|concept|element`, `src/insight/cli.ts`;
the v2 `query|get|neighbors|list` verbs are retired) and there is no
`cortex insight l1` command.** A dedicated verb may be wired
later by the `insight.cli` spec — if one exists when you run, prefer it.
Until then, call the library directly (`runL1` + `serializeL1` from the
installed Cortex package's `dist/insight/l1.js`):

```bash
# Resolve the installed package root from the global binary
# (in the Cortex repo itself, CORTEX_DIST is just ./dist):
CORTEX_DIST="$(dirname "$(node -e 'console.log(require("fs").realpathSync(process.argv[1]))' "$(which cortex)")")/.."
node --input-type=module -e '
  const { runL1, serializeL1 } = await import(process.argv[1]);
  process.stdout.write(serializeL1(await runL1(process.cwd())));
' "$CORTEX_DIST/insight/l1.js" > .cortex/pulse/extraction/l1.json
```

The output (`.cortex/pulse/extraction/l1.json` — a transient working file;
`pulse/` tolerates extra generated files) is what Phase 2 plans from. Its
real fields (`src/insight/l1.ts`, `serializeL1`):

- `files[]` — `path`, `language`, `bytes`, `lines`, `entryPoint`,
  `mechanicalHub` (excluded from centrality ranking: index/barrel/doc hubs),
  `exports`, `imports` (raw specs), `resolvedImports` (repo-relative).
- `graph.edges[]` — `{from, to}` import edges between included files.
- `modules[]` — `{dir, fileCount, totalBytes, files}` directory grouping.
- `centrality[]` — `{path, inDegree, outDegree, degree}`, ranked, mechanical
  hubs excluded, degree-0 files omitted.
- `skipped[]` — `{path, reason}` with reason ∈ `skip-list | sensitive |
  ignored | binary | oversized`. Skipped files get NO insight entry; never
  "rescue" them. Cortex's own meta-directories — `.cortex/`, `.specflow/`,
  `.claude/` — are hard-excluded as `skip-list` (insight is about the code,
  not the knowledge layer, specs, or skill bundles); never plan a scope over
  them or hand a sub-agent a file inside them.

Also capture, once, the values every agent will stamp:
`BUILT_AT_COMMIT=$(git rev-parse HEAD)` — one value for the whole run.

## Phase 2 — Planning

Read the L1 output and draft the extraction plan. Scope identification is
**your judgment about cohesion and shared use, not a fixed file count**
(design §5.4): a coherent 40-file module is a valid scope; a 30-file module
imported by three parents deserves its own shared scope for deduplication; a
5–10-file directory with no cross-scope sharing folds into its parent. Use
`modules[]` + `graph.edges[]` to find directory-ish neighbourhoods whose
edges fall mostly *within* the scope (the study's directory-grouped-batching
intent, superseded by planning).

**Same-module vs. similar-module** — resolve by reading the code, not the
names (design §5.4):

- Same underlying files (imports, path resolution, symlinks all land on one
  directory) → ONE scope, `shared_by` both parents, extracted once.
- Independently-implemented similar functionality (two unrelated
  `notifications/` directories) → TWO scopes, never merged; Phase 4 connects
  them with a `semantically-similar-to` edge.

**Recursion (F7):** if a scope is too large for a single extraction agent,
break it into sub-scopes now, with this same planning process, registering
each sub-scope. Recursion terminates when every leaf scope fits one agent.
At runtime the same rule holds: an oversized scope discovered mid-execution
comes back to YOU for re-planning and re-dispatch — see
`references/orchestration.md`.

Write two durable/transient records:

1. **`.cortex/insight/scope-registry.yaml`** (schema §4.10.3) — exactly:

   ```yaml
   schemaVersion: "3.0"
   built_at_commit: "<BUILT_AT_COMMIT>"   # QUOTE it — an all-digit or 9989e80-style
                                          # sha would YAML-coerce to a number
   scopes:
     <scope-id>:
       path: <project-relative dir>       # required, must resolve
       depends_on: [<scope-id>, …]        # required, may be []; acyclic
       shared_by: [<scope-id>, …]         # optional; inverse of depends_on
   ```

   Skip the registry (and `scopes/`) entirely for a small codebase you plan
   unscoped — both layouts are valid (§4.10.1); the query layer hides the
   difference.

2. **`.cortex/pulse/extraction/plan.md`** (§4.10.10, `kind:
   insight-extraction-plan`; header fields `kind`, `generated`, `loop:
   cortex-extract-insight` per §4.5) — root scopes with file counts and
   analysis depth, shared-scope references, sub-scopes, estimated total
   cost/time, and estimated peak parallelism (design §5.3's example shape).
   Written on EVERY run, even auto-run ones, for the record.

**Auto-run vs. confirm gate (design §5.3).** Check `cortex.config.json` for
an `insight.extractionAutoRunThreshold` block — **it does not exist yet**
(the `insight` block's only current keys — `clusterCarryOverJaccard`,
`promotionMinAgeDays`, `promotionMinObservations` — are v2.0 mechanics
superseded at 3.0 and tolerated only for back-compat, addendum A10.0; no
v3.0 insight config keys have landed); config wiring is a
future Core change. Until it lands, apply this conservative in-skill
default — auto-run only when ALL hold:

- ≤ 200 included files in total, and
- ≤ 4 root scopes, with no recursion needed, and
- no unresolved same-vs-similar judgment and no ambiguous scope boundary.

Otherwise write the plan, present it, and **stop — dispatch nothing until
the user confirms or adjusts it**.

## Phase 3 — Scoped execution

Follow `references/orchestration.md` for the full defensive fan-out
contract. The shape:

- **One sub-agent per root scope, ALL dispatched in a single message**
  (`general-purpose` agents — never a read-only agent type, it cannot write
  files — on a **Sonnet-class model**; quality is load-bearing, wrong insight
  is prejudicial, design §5.9). Shared scopes are extracted **once**, in a
  wave before — or in parallel with — the parents that reference them; a
  shared scope's output is referenced, never duplicated.
- Within a scope: **every file gets L2** (Purpose + Connections);
  **scope-LOCAL centrality picks the L3 files** — recompute degree over the
  L1 edges restricted to the scope's files (a file central to `auth/` gets
  L3 even if peripheral globally, design §5.3). L3 adds Main players,
  Insights, File map (>~500 lines), Query pointers. Prompt templates:
  `references/extraction-prompts.md`.
- Entries are written **in place** — `scopes/<scope>/anatomy/<source-path>.md`
  (scoped) or `anatomy/<source-path>.md` (unscoped), path mirroring the
  source — plus the scope-local `scopes/<scope>/graph.json` and
  `scopes/<scope>/concepts/`. The scope agent's LAST write is its completion
  manifest `.cortex/pulse/extraction/fragments/<scope-id>.json`. **The manifest
  file existing on disk is the ONLY success signal** — an agent's textual
  "done" without it is a failure. One manifest missing after a wave → warn,
  name the scope, continue. **More than half of a wave's manifests missing →
  abort the run** (study Axis 1, adopted verbatim).
- **Checkpointing:** after a scope's outputs validate (below), merge its
  per-file rows into `insight/ledger.json` (§4.10.4) — the durable
  checkpoint — and mark it `complete` in the progress artefact. A killed run,
  re-invoked, skips checkpointed scopes and resumes the rest; a scope killed
  mid-flight is re-dispatched whole (its agent MAY keep any existing entry
  that parses valid and whose `source_sha256` still matches the source body).
- **Progress:** maintain `.cortex/pulse/extraction/progress.md`
  (`kind: insight-extraction-progress`, §4.10.10) — per-scope status
  `pending | running | complete | failed`, files done/total within each
  scope, checkpoints, and warnings (missing fragments, validation failures).
  Update it at every wave boundary and scope completion.

## Phase 4 — Cross-scope unification

Runs ONCE, only after every root and shared scope is checkpointed
`complete` (never while any scope is `pending`/`running`). Dispatch a single
Sonnet-class unification agent that reads the scope outputs (or do it
yourself if the codebase is small) and produces the global L4 layer:

- **`concepts/`** — one `<slug>.md` per codebase-spanning concept, slug
  matching its `concept:<slug>` node id. (No field-level schema contract
  exists for concept bodies at 3.0 — keep them short: definition, the files
  that implement the concept, related concepts.)
- **Top-level `graph.json`** — cross-scope nodes and edges (§4.10.6 shape;
  see `references/extraction-prompts.md` for id/edge/confidence discipline).
- **`tags.json`** — the typed vocabulary (`tag.kind` ∈ `concern | technology
  | pattern | layer | domain-term`, optional `aliases`) plus `assignments`
  mapping node ids to vocabulary tags only.
- **`clusters.json`** — `{id: "cluster:<label-slug>", label, members,
  rationale (non-empty), scope: <scope-id> | "global"}`. When the extraction
  is unscoped (no `scope-registry.yaml`), every cluster's `scope` MUST be
  `"global"` — the validator accepts nothing else without a registry; named
  dispatch groups from the plan are not cluster scopes.
- **`reverse-index.json`** (§4.10.5) — `referenced_by` mapping every entity
  node id to the concept/edge ids that cite it. Build it mechanically from
  the finished graph + concepts; the refresh loops depend on it.

**Dedup guardrails (study Axis 4, design §5.4):** same label ≠ same entity —
never merge same-named symbols or same-named scopes on string similarity
alone; two scopes' `UserService` are two `element:` nodes unless the code
shows they are the same file. Similar-but-independent modules get a
`semantically-similar-to` edge, not a merge — and that edge is sanctioned
ONLY for genuinely non-obvious, cross-cutting relations (never "both are
called notifications"). Concept nodes are named entities: a label of ≥8
words or sentence length is prose masquerading as an entity — keep it as
evidence text, not a node.

## Output validation — before any checkpoint

After each scope completes and again after Phase 4, run the deterministic
validator and fix nonconforming output **before** marking anything complete:

```bash
cortex validate . --json
```

and act on every `check.insight-entry`, `check.insight-scope-registry`,
`check.insight-graph`, and `check.insight-ledger` violation (schema §4.10; a
malformed fragment is a validation failure recorded in the progress
artefact, never a silent accept). Two disciplines the validator and Core
enforce that your writes must honour:

- **Total-ordered serialization** (§4.10.6): nodes/edges/vocabulary/
  assignments/clusters sorted by id/tag; only `generated`/`built_at_commit`
  vary between runs. Diffs must be meaningful, not permutation noise.
- **The shrink guard** (§4.10.6, `writeInsightJson` in
  `src/insight/storage.ts`): never overwrite an existing `graph.json`/
  `tags.json`/`clusters.json` with a smaller one (fewer nodes, edges,
  vocabulary entries, assignments, or clusters) unless the user has
  explicitly confirmed the shrink — a crashed refresh must never silently
  truncate the store.

## What this skill does NOT do

- **No CLI wrapper** — never invent or reference a `cortex extract-insight`
  command; you are invoked as a skill only.
- **No refresh triage** — deciding *which* files are dirty (hash compare,
  significance detection, Haiku triage) belongs to the insight-refresh-daily
  and insight-refresh-full loops; in
  dirty-only mode you receive the worklist, you never compute it.
- **No session observation** — capturing in-session corrections and
  enrichments into entries is `cortex-loop-session-observe`'s job.
- **No gated writes, no pulse proposals** — insight only, plus the plan and
  progress artefacts and fragment manifests under `pulse/`.
- **No embeddings, ever** — structured tags, typed edges, and named evidence
  are the retrieval substrate (design §1.3).

## Closing summary

Report to the user (or invoking loop): the mode; the plan (root/shared/
sub-scope counts and whether the auto-run gate passed or confirmation was
required); per-scope results (entries written at L2/L3, warnings, any
aborted wave); the Phase-4 outputs (concept/node/edge/tag/cluster counts);
validation status (clean, or what was fixed); and the checkpoint state (what
a re-invocation would resume).
