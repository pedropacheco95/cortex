# Defensive orchestration — the fan-out, fragment, and checkpoint contract

The mechanics here are adopted **verbatim** from the Graphify extraction
study's TAKE verdicts (Axis 1; design §5.3/§5.11) — battle-tested defensive
orchestration — plus Cortex's own recursion and checkpoint rules. The
orchestrator is YOU, the top-level session running the skill.

## Dispatch

- Order waves by `scope-registry.yaml` `depends_on`: **shared scopes are
  extracted once**, in a wave before — or in parallel with — the parents
  that reference them (parents reference the shared scope's output; they
  never re-extract it or copy it).
- **All sub-agents of a wave are dispatched in ONE message** (one block of
  parallel Agent calls) so they run concurrently.
- Agent type: `general-purpose` (or the platform equivalent that can WRITE
  files). Never a read-only/Explore agent — the study's hard-won warning is
  that a read-only sub-agent silently drops its results.
- Model: **Sonnet-class** for every extraction agent (design §5.9).
- Each scope agent's prompt carries: the scope id and `path`; its file list
  and the scope-restricted L1 slice (files, edges, exports/imports); the
  scope-local centrality ranking and which files get L3; the shared
  `built_at_commit` value; the entry/graph contracts (point it at
  `references/extraction-prompts.md` content); its output directory; and
  its fragment-manifest path (below).

## F7 — recursion re-plans from the top

A scope sub-agent NEVER spawns sub-agents. If an agent finds its scope too
large to finish (context exhaustion, file count beyond what it can treat
per-file), it must STOP, write NO fragment manifest, and report "oversized"
with a suggested split. The **orchestrator** then re-plans: break the scope
into sub-scopes (same cohesion judgment as Phase 2), update
`scope-registry.yaml` and the plan artefact, and dispatch the sub-scopes as
their own wave. The fan-out stays exactly one level deep at all times.

## The fragment convention — disk-file-is-success

Durable outputs are written **in place** (they ARE the output; there is no
copy-merge step for markdown entries):

- per-file entries → `scopes/<scope>/anatomy/<source-path>.md`
  (unscoped runs: `anatomy/<source-path>.md`)
- scope-local graph → `scopes/<scope>/graph.json`
- scope-local concepts → `scopes/<scope>/concepts/<slug>.md`

The scope agent's **LAST act** is writing its completion manifest:

```
.cortex/pulse/extraction/fragments/<scope-id>.json
```

```jsonc
{
  "scope": "<scope-id>",
  "entries_written": 42,
  "l2": 34,
  "l3": 8,
  "skipped": [],            // files it could not process, with reasons
  "warnings": [],
  "completed_at": "<iso-datetime>"
}
```

Beyond the bookkeeping fields above, a scope agent MAY (sanctioned,
optional) include richer fields that Phase 4 assembles from — carrying them
in the manifest makes unification and resume cheap because the orchestrator
never re-reads every scope's outputs to rebuild the cross-scope picture:

- `proposed_concepts` — candidate codebase-spanning concepts the scope saw;
  Phase 4 unifies/dedupes these into `concepts/` and `concept:` nodes.
- `semantic_edges` — cross-scope edge candidates (with evidence); Phase 4
  filters them into the top-level `graph.json`.
- `main_players` — the scope's key elements; Phase 4 uses them for
  `element:` nodes and cross-scope edge endpoints.
- `suggested_tags` — vocabulary candidates; Phase 4 merges them into
  `tags.json`'s typed vocabulary.
- `tag_assignments` — node-id → tag mappings; Phase 4 folds them into
  `tags.json` `assignments` after vocabulary merge.

Because the manifest is written only after every entry and the scope graph
have landed, its existence certifies the scope's outputs are on disk. It is
transient (pulse is gitignored) — the durable record is the ledger merge
below.

## Completion checks — warn / abort

After a wave's agents return, check the manifests **on disk**:

- **The manifest file existing is the ONLY success signal.** An agent's
  textual claim of success without its manifest is a failure; a manifest
  without the agent having "reported" is a success.
- **A missing manifest → WARN**, naming the scope, in the progress artefact
  and to the user — never a silent skip. The scope stays incomplete for a
  retry wave.
- **More than half of the wave's manifests missing → ABORT the run.** Record
  the abort and the missing scopes in the progress artefact; do not proceed
  to further waves or Phase 4 on a majority-incomplete result.

## Validation before checkpoint

For each scope with a manifest, validate BEFORE checkpointing:

```bash
cortex validate . --json
```

Act on every `check.insight-entry` / `check.insight-scope-registry` /
`check.insight-graph` / `check.insight-ledger` violation touching the
scope's outputs (schema §4.10). Fix nonconforming files (yourself, or via a
short retry dispatch to the same scope) and re-validate. A scope that still
fails after a bounded retry (2 attempts) is marked `failed` with the
validation errors recorded in the progress artefact — never checkpointed,
never silently accepted.

## Checkpointing and resume

- **Durable checkpoint = the ledger merge.** When a scope validates clean,
  merge one row per extracted file into `insight/ledger.json` (§4.10.4):
  `entries[<source-path>] = { source_sha256, built_at_commit,
  extraction_level }`. Keep the file's other entries untouched; set the
  top-level `built_at_commit` only when the whole run completes.
- Mark the scope `complete` in the progress artefact in the same step.
- **Resume rule** (a crashed or killed run, re-invoked): a scope is complete
  — and MUST NOT be re-extracted — iff every file in the scope has a ledger
  entry whose `source_sha256` matches the current source body hash. Scopes
  failing that test are re-dispatched. Within a re-dispatched scope, the
  agent MAY skip an individual file whose existing entry parses valid
  (`check.insight-entry`) and whose `source_sha256` matches the current
  body — scope-level resumability is the contract; per-file reuse inside a
  re-run scope is a safe optimization, never an obligation.
- Stale fragment manifests from a previous run prove nothing across runs
  (pulse is transient); trust only the ledger + on-disk entries for resume
  decisions. Clear `.cortex/pulse/extraction/fragments/` at run start.

## The progress artefact

Maintain `.cortex/pulse/extraction/progress.md` throughout Phases
3–4 (schema §4.10.10; header per §4.5):

```markdown
---
kind: insight-extraction-progress
generated: <iso-datetime>          # refresh on every rewrite
loop: cortex-extract-insight
---

# Insight extraction progress

| Scope | Status | Files | Checkpoint | Warnings |
|---|---|---|---|---|
| notifications (shared) | complete | 12/12 (L3: 3) | ledger @ <sha> | — |
| auth | running | 31/48 | — | — |
| billing | failed | — | — | fragment missing after wave 2 |

Phase 4 (unification): pending — starts only when no scope is pending/running.
```

Rewrite (not append) at every wave boundary, scope completion, warning, and
abort — the file must always reflect current truth, with a fresh
`generated`.

## Phase-4 gate and final writes

- Phase 4 starts ONLY when every scope in the registry is `complete` (never
  while any is `pending`/`running`; `failed` scopes block Phase 4 until
  resolved or the user explicitly accepts a partial extraction — record
  that acceptance in the progress artefact).
- Final JSON writes (`graph.json`, `tags.json`, `clusters.json`) honour
  total ordering and the **shrink guard**: if a same-kind file already
  exists and the replacement is smaller on any count dimension (graph:
  nodes/edges; tags: vocabulary/assignments; clusters: clusters), do not
  overwrite — surface the shrink to the user and proceed only on their
  explicit confirmation (Core's `writeInsightJson` refuses without `force`;
  apply the identical rule when writing directly).
- Finish by updating `ledger.json`'s top-level `built_at_commit`, writing
  `reverse-index.json`, running a final `cortex validate . --json`, and
  removing `.cortex/pulse/extraction/fragments/`.
