> **Folded into `cortex-schema.md` at build-order-v3 step 1 — see git history for the fold-in commit.** This file remains as the historical record of the v3.0 delta; it is not further modified.

# Cortex Schema — v3.0 Addendum (the §10.1 clauses, drafted as contract text)

**Addendum version:** `3.0` (the deltas). **Target contract:** `cortex-schema.md` v2.0.
**Status:** Draft for review by Pedro. Contract/design only — this is a specification document, not code, specs, or `.cortex/` content.

## Framing — how this document relates to the live contract

- **The live contract `cortex-schema.md` stays at v2.0.** The in-flight v2 foundation (schema 2.0, the `.specflow/` reorganization, the query-CLI substrate, the pulse-gate extensions) builds against 2.0 and MUST NOT be disturbed by this document. Until the v3 build begins, **2.0 is the contract in force.**
- **This addendum specifies the v3.0 deltas as a standalone document.** When the v3 build begins (build-order-v3 step 1, design §10.2), these clauses **fold into `cortex-schema.md`**, superseding the named 2.0 clauses in place, and the schema's version rises to `3.0`. Folding-in is a single MAJOR revision of the living contract; this addendum is the drafted content of that revision.
- **Grounding.** Every clause here is grounded in `cortex-v3-design.md` (the settled v3 design). Where that design explicitly left a shape open, this addendum says so and **defers to the named downstream spec** rather than inventing — except for the concrete minimal shapes design §10.1 directs this addendum to specify, which are specified here and flagged as addendum decisions in §A10.
- **Reference convention.** "schema §N" = `cortex-schema.md` v2.0. "design §N" = `cortex-v3-design.md`. "A-N" = a clause of this addendum.

---

## A0. Change ledger (RULES 19)

The load-bearing auditability surface. Every clause this addendum adds, every v2.0 clause it supersedes (by § number), and every check added / re-rooted / removed. Reviewers verify this ledger against the folded diff.

### A0.1 Clauses ADDED (no v2.0 predecessor)

| Addendum clause | Adds |
|---|---|
| A3.1 | `archive/` module layout |
| A3.2 | `archive/documents/<slug>/metadata.yaml` frontmatter contract |
| A3.3 | `archive/types/*.yaml` document-type schema format |
| A4.4 | Insight staleness ledger (`insight/ledger.json`) storage shape |
| A4.5 | Insight reverse-dependency index (`insight/reverse-index.json`) storage shape |
| A6 | `provenance:` / `derives_from:` frontmatter on compass rules, both spec trees, atlas decisions |
| A7.4 | Pulse typed-suggestion enum gains `decision-candidate` (additive to v2.0 §4.5.1) |

### A0.2 v2.0 clauses SUPERSEDED

| v2.0 clause | Superseded by | Nature |
|---|---|---|
| §1 (`.cortex/` layout) | A1.1, A2.1, A3.1, A4.1 | `cerebrum/`→`compass/`; `cerebrum/decisions.md` removed; `anatomy/` removed; `insight/` rebuilt; `archive/` added |
| §4.1 (`anatomy/files.md`) | A7.3 (removal) | anatomy module removed; content absorbed into insight L1/L2 (design §5.10) |
| §4.2 (`cerebrum/rules/`) | A1.2 | re-rooted to `compass/rules/`; gains `provenance:` (A6) |
| §4.3 (`cerebrum/bugs/`) | A1.3 | re-rooted to `compass/bugs/`; `type` taxonomy unchanged |
| §4.4 (atlas artefacts) | A2.2, A6 | `cerebrum_rules`→`compass_rules`; decisions single-home; decisions gain `provenance:` |
| §4.9 (constellation node-id grammar; insight preset) | A1.4, A4.6 | `cerebrum:`→`compass:` module-path spellings; v2 insight preset dropped (deferred, design §11 Q2) |
| §4.10 + §4.10.1–.5 (insight module) | A4, A5 | replaced wholesale (design §8) |
| §5 (hook payloads) | A1.5, A7.4 | PreWrite enforcement read re-roots to compass; PostWrite/PostRead anatomy writeback removed |
| §6 (cross-reference table) | A1.6, A6 | `source` rule-field spellings re-rooted; `provenance`/`derives_from` rows added; `spec_links` (anatomy) row removed |
| §7.1 (`_index.md` example) | A1.7 | filled example re-rooted cerebrum→compass |
| §7.4 (`insight/_index.md`) | A4.7 | replaced by the v3 insight active prompt |
| §8 (CLAUDE.md template) | A1.8, A4.8 | cerebrum→compass; anatomy line removed; insight block replaced |
| §9 (`loop.md` template) | A1.9 | machine-owned-ungated ownership re-pointed anatomy→insight; cerebrum→compass |
| §9.1 (canonical scheduled-task list) | A7.1 | anatomy-refresh pair + v2 insight pair deregistered; three refresh loops + session-observe registered |
| §10.1 (config shape) | A8.1 | `insight` config block replaced; `schemaVersion` → `3.0` |
| §10.2–§10.4 (version + migration) | A8.2 | MAJOR bump to 3.0; migration policy per A8.2 |
| Appendix A (check catalogue) | A8 | delta per A8 |

### A0.3 Checks ADDED / RE-ROOTED / REMOVED

**Added (7):** `check.archive-layout`, `check.archive-metadata`, `check.archive-type`, `check.provenance`, `check.insight-entry`, `check.insight-scope-registry`, `check.insight-ledger`.

**Re-rooted / redefined (IDs stable — 11):** `check.layout`, `check.rule`, `check.bug`, `check.index-shape`, `check.rule-governs-resolves` (paths `cerebrum/`→`compass/`); `check.atlas` (`cerebrum_rules`→`compass_rules`; tolerates optional `provenance`); `check.insight-index` (redefined for the v3 module); `check.insight-graph` (redefined for the v3 `graph.json`/`tags.json`/`clusters.json` shapes); `check.constellation` (module enum `cerebrum`→`compass`; insight preset clause dropped); `check.claude-md`, `check.loop-md` (managed-block text re-rooted).

**Removed (5):** `check.anatomy-files`, `check.anatomy-graph`, `check.anatomy-purpose-source`, `check.insight-prose`, `check.insight-ownership`.

> **Reconciliation note (RULES 19).** Design §10.1 directs "rename `check.cerebrum-*` → `check.compass-*`." **No check is literally named `check.cerebrum-*` in v2.0** — the cerebrum-reading checks are `check.rule`, `check.bug`, `check.layout`, `check.index-shape`, `check.rule-governs-resolves`. Their **IDs stay stable** (they are content-role-keyed, exactly as rule/bug node prefixes are content-keyed and survive the directory rename, A1.4); only the **paths they read** re-root to `compass/`. This addendum applies the design's *intent* (re-root every cerebrum-reading check) and records that the literal rename has no target. Any future `check.compass-*`-named check is minted fresh, not renamed.

**Check count:** 28 at v2.0 → **32 at v3.0** (added 7; removed 5; IDs otherwise stable).

---

## A1. Compass module (the renamed `cerebrum`)

Design §4.1. `cerebrum` → `compass`. Mechanical re-root with a ripple across every surface that names or addresses the module. **Rule and bug ids (`R-NNN`, `B-NNN`) and their content-keyed constellation node prefixes (`rule:`, `bug:`) are UNCHANGED** — they are content-keyed, not path-keyed, so they survive the directory rename.

### A1.1 Layout re-root (supersedes §1)

The `.cortex/` skeleton block of §1 changes: the `cerebrum/` subtree re-roots to `compass/`, `cerebrum/decisions.md` is removed (A2), `anatomy/` is removed (A7.3), `insight/` is rebuilt (A4.1), and `archive/` is added (A3.1). The consolidated v3 layout is A9.

```
.cortex/
├── compass/                    [committed]   rules, conventions, bug ledger (A1.2, A1.3)
│   ├── _index.md
│   ├── preferences.md
│   ├── environment.md
│   ├── do-not-repeat.md
│   ├── standing-authorities.md
│   ├── conventions/                          project conventions (design §3)
│   ├── bugs/                                 the seven-type bug ledger (unchanged taxonomy)
│   │   ├── _index.md
│   │   └── B-001-<slug>.md
│   └── rules/
│       ├── _index.md
│       └── R-001-<slug>.md
```

`compass/decisions.md` does **not** exist (A2.1). `compass/` git policy is `[committed]`, unchanged from cerebrum's.

### A1.2 `compass/rules/R-NNN-<slug>.md` (supersedes §4.2)

Identical to §4.2 with two changes: (a) the artefact path is `compass/rules/`; (b) the frontmatter gains the optional `provenance:` list (A6). The `id`/filename `R-NNN` pattern, `title`, `source` (list<path>), `governs` (list<glob>), `related_specs`, `confidence`, `check`, `status` fields are otherwise **unchanged**. **Validated by** `check.rule` (path re-rooted; ID stable).

### A1.3 `compass/bugs/B-NNN-<slug>.md` (supersedes §4.3)

Identical to §4.3 with the artefact path `compass/bugs/`. The seven-type `type` enum, `severity`, `status`, `affects` resolution-by-shape are **unchanged**. **Validated by** `check.bug` (path re-rooted; ID stable).

### A1.4 Node-id grammar re-root (supersedes §4.9)

The constellation node-id grammar (§4.9) spells one module path as `cerebrum:<file>`; it re-roots to **`compass:<file>`**. The `module` enum value `cerebrum` becomes `compass`. **Content-keyed prefixes `rule:R-NNN` and `bug:B-NNN` are UNCHANGED** — they key on rule/bug identity, not on the directory. Group id `cerebrum` (a Level-1 constellation, §4.9 Groups) becomes `compass`. **Validated by** `check.constellation` (module enum re-rooted).

### A1.5 PreWrite enforcement read re-root (supersedes §5)

The `PreToolUse (Write/Edit)` hook (§5) reads rules from `compass/rules/` instead of `cerebrum/rules/`. The payload text (`⚠ Cortex {{RULE_ID}} may apply …`) is unchanged; only the read root moves. Compass remains the **sole** module carrying write-time enforcement authority (design §12; insight never earns it, A4.0). **Validated by** `check.hook-config` (unchanged ID).

### A1.6 Cross-reference table re-root (supersedes §6)

In the §6 citation-graph table: the `source` (rule) field resolves paths into `compass/` (and atlas / insight, A6-lineage); the `cerebrum_rules` (atlas decision) field is renamed **`compass_rules`** (A2.2). The `spec_links` (anatomy row → dev specs) row is **removed** (anatomy removed, A7.3); its role moves to insight's Connections section (design §5.10). Rows added for provenance are in A6.

### A1.7 `compass/_index.md` active-prompt note (supersedes the §7.1 example)

Compass carries an `_index.md` active prompt under the §7.1 shape (`Read this when:` / `What's here:` / `How to navigate:`; hard budget <300 tokens; **validated by** `check.index-shape`). The v2.0 filled example (`cerebrum/_index.md`) is superseded by the compass example below; the `decisions.md` bullet is **removed** (A2), replaced by a navigation line to atlas decisions via provenance.

```markdown
# Compass — index

**Read this when:** the user asks "why" about a convention or decision, before you
propose a write that touches governed files, or when triaging a bug.

**What's here:**
- `rules/` — one file per rule (R-NNN). Match a write's path against each rule's `governs`.
- `bugs/` — the bug ledger (B-NNN), classified by the seven-type taxonomy.
- `conventions/`, `preferences.md`, `environment.md` — project conventions and operational pointers.

**How to navigate:** from a rule, follow `provenance: derives_from:` to the atlas decision
(or archive document) that justifies it — decisions live only in `atlas/decisions/`, cited
not copied. Follow `governs:` to the files it constrains; `related_specs:` to the specs it
touches.
```

### A1.8 CLAUDE.md managed block re-root (supersedes §8; see also A4.8)

The §8 CLAUDE.md template re-roots `cerebrum/`→`compass/`, **removes** the `anatomy/` bullet (A7.3), and replaces the `insight/` bullet with the A4.8 insight block. The "Modules present" line and the `<!-- cortex:start … -->` marker discipline are unchanged. **Validated by** `check.claude-md` (unchanged ID; block text re-rooted).

### A1.9 `loop.md` re-root (supersedes §9)

The §9 `loop.md` "Never mutate gated content" clause names the gated set as **`compass`, atlas, `RULES.md`, and both spec trees**; the machine-owned-ungated allowance re-points from `anatomy` to **`insight`** (design §9). **Validated by** `check.loop-md` (unchanged ID).

---

## A2. Decisions single-home

Design §4.2.

### A2.1 Remove the `cerebrum/decisions.md` artefact contract (supersedes §1)

The `cerebrum/decisions.md` line (§1 layout) and every reference to it are **removed**. `compass/` has no `decisions.md`. **`atlas/decisions/` is the sole decisions home.** The migration deletes the duplicate rather than renaming it into compass (design §4.2; A8.2 sequences the delete after the rename).

### A2.2 The compass-rule-cites-decision-via-provenance pattern (supersedes §4.4)

A compass rule that derives from a decision **does not restate it** — it cites it via provenance: `provenance: - derives_from: atlas/decisions/<slug>.md` (A6). The atlas-decision frontmatter field `cerebrum_rules` (§4.4) is renamed **`compass_rules`** (list<id> — rules derived from this decision; the forward half of the citation, the rule's `provenance` being the backward half). `atlas/decisions/` frontmatter also gains the optional `provenance:` field (A6) for decisions that themselves derive from an archive document or session. **Validated by** `check.atlas` (field renamed) + `check.provenance` (A6).

---

## A3. Archive module (new)

Design §6. Ingested source documents and the structured content extracted from them. `archive/` git policy: `_index.md`, `register.md`, `documents/*/metadata.yaml`, `documents/*/extracted/`, and `types/` are `[committed]`; `documents/*/source.*` is `[gitignored]` (raw source may be sensitive — same treatment as v2's `atlas/sources/`, design §6.6).

### A3.1 Layout (new)

```
.cortex/archive/
├── _index.md                              [committed]  active prompt (§7.1 shape)
├── register.md                            [committed]  human-readable index of all documents
├── documents/
│   └── <slug>/
│       ├── source.<ext>                   [gitignored] verbatim source (pdf/md/docx/txt/…)
│       ├── metadata.yaml                  [committed]  machine-readable per-document metadata (A3.2)
│       └── extracted/                     [committed]  everything extracted from the source
│           ├── <output-kind>/…                          per the document type's extraction contract (A3.3)
│           └── summary.md
└── types/                                 [committed]  document-type schemas (A3.3)
    ├── client-spec.yaml
    ├── contract.yaml
    ├── meeting-transcript.yaml
    └── …
```

Superseded document versions are **preserved, not deleted** — kept as sibling `documents/<slug>/` directories with `metadata.yaml` `status: superseded` (design §6.2, §6.5). `<slug>` is lowercased-hyphenated, unique within `documents/`. **Validated by** `check.archive-layout`: every `documents/<slug>/` carries a `source.*`, a `metadata.yaml`, and an `extracted/` directory; `_index.md` and `register.md` present; `types/` present.

### A3.2 `archive/documents/<slug>/metadata.yaml` frontmatter contract (new)

A standalone YAML file (not markdown frontmatter — it is machine-readable metadata, per design §6.2).

```yaml
id: archive.<slug>                 # required — archive.<slug>, matches the directory
kind: <type-id>                    # required — an id declared in archive/types/ (A3.3)
ingested_at: <iso-datetime>        # required
version: <string>                  # required — the document's own version label (e.g. "v2.0", "2026-01-08")
status: active | superseded        # required
supersedes:                        # optional — path(s) to prior versions under documents/
  - documents/<prior-slug>/
source_filename: <string>          # optional — the original filename of source.<ext>
origin: <string>                   # optional — provenance of the source (who sent it, where from)
```

**Validated by** `check.archive-metadata`: `id` matches `archive.<slug>` and the directory; `kind` resolves to a `types/<kind>.yaml`; `ingested_at` ISO; `version` and `status` present; `status` in enum; `supersedes` paths resolve.

### A3.3 `archive/types/*.yaml` document-type schema format (new)

Design §6.1/§6.3 left this **sketched, not specified**. This addendum specifies a concrete minimal shape (flagged A10-1): a type file declares a **type id**, **classification hints** the ingestion skill routes on, and the **extraction-output contract** the type produces. Adding a document type means adding a `types/<id>.yaml`, never editing the `cortex-archive-ingest` skill (design §6.1, extensibility invariant).

```yaml
id: client-spec                    # required — the type id; == filename stem; used as metadata.yaml `kind`
label: Client specification        # required — human label for register.md and prompts
classification:                    # required — how the skill routes to this type
  extensions: [.pdf, .docx, .md]   #   optional — candidate source extensions
  hints:                           #   optional — lexical/structural signals for content-inference
    - "requirement"
    - "the client shall"
  explicit: true                   #   optional — whether a user may declare this type by name (default true)
extraction:                        # required — the extraction-output contract this type declares
  strategy: <strategy-id>          #   required — the extraction routine the skill runs for this type
  outputs:                         #   required — one or more declared extraction outputs
    - kind: requirements           #     required — output kind (skill-defined vocabulary)
      path: extracted/requirements/  #   required — where under extracted/ it lands (dir or file)
      item_pattern: "GT-<SRC>-NNN-<slug>.md"  # optional — naming pattern for per-item extractions
    - kind: summary
      path: extracted/summary.md
```

**How the skill routes on it (design §6.3, §6.4 steps 2–4):** the ingestion skill reads all `types/*.yaml`; if the user declared a type, it selects that type's file directly; otherwise it infers the type by matching source content/extension against each type's `classification.hints`/`extensions`. The selected type's `extraction.strategy` chooses the extraction routine; the type's `extraction.outputs` are the **contract** for what lands under `documents/<slug>/extracted/` and where. The atlas-only extraction re-homed from `cortex-ingest` (design §6.6) is one such strategy (`strategy: atlas`, outputs: stakeholders / decisions / domain-terms), routed on the atlas-shaped types.

**Validated by** `check.archive-type`: valid YAML; `id` == filename stem; `label` present; `classification` present with at least one of `extensions`/`hints` (or `explicit: true`); `extraction.strategy` present; `extraction.outputs` non-empty; each output has `kind` and an `extracted/`-relative `path`.

### A3.4 `archive/_index.md`

Active prompt under the §7.1 shape. **Validated by** `check.index-shape`.

---

## A4. Insight — new layout (supersedes §4.10 and all of §4.10.1–§4.10.5)

Design §5, §5.8. **The entire v2.0 `insight/map/` contract (§4.10 and subsections) is superseded.** v3 insight is a leveled, scoped, per-file understanding of the *source code itself*, not a concept-map over the curated artefact set (design §8.3). It remains **ungated** (A4.0).

### A4.0 The trust contract (carried from §4.10 preamble)

Insight is inferred, not curated: **context, not authority.** Where insight conflicts with a compass rule or a spec, the gated layer wins. It never carries write-time enforcement authority (no PreWrite reads insight, A1.5) and no hook injects it (design §5.7 is a CLAUDE.md directive, not a hook). Committed in full (git policy carried from Decision 1's fourth quadrant: machine-owned **and** committed).

### A4.1 Two layouts (supersedes §1 insight block + §4.10)

Chosen by whether the extraction scoped. The query layer (A5.1) hides the difference.

**Scoped extraction (large codebases):**

```
.cortex/insight/                   [committed]
├── _index.md                                  active prompt (A4.7)
├── scope-registry.yaml                        scope tree, dependencies, shared refs (A4.3)
├── ledger.json                                staleness ledger (A4.4)
├── reverse-index.json                         reverse-dependency index (A4.5)
├── scopes/
│   └── <scope>/
│       ├── anatomy/                           per-file entries within the scope (A4.2)
│       ├── concepts/                          scope-local concepts
│       └── graph.json                         scope-local semantic graph (A4.6)
├── anatomy/                                   per-file entries not owned by any scope
├── concepts/                                  global concepts spanning scopes
├── graph.json                                 cross-scope semantic graph (A4.6)
├── tags.json                                  global structured tag vocabulary (A4.6)
└── clusters.json                              global cluster assignments (A4.6)
```

**Unscoped extraction (small codebases):** the same, minus `scope-registry.yaml` and `scopes/`; all per-file entries live under top-level `anatomy/` (path mirrors source, e.g. `anatomy/src/auth/session.ts.md`).

The `anatomy/` **sub-directory name** preserves continuity with what v1's `.cortex/anatomy/` held (the file-level structural artefact), now living *inside* insight (design §5.8, §5.10). **Validated by** `check.layout` (insight block re-rooted; the old `map/` and its `check.insight-ownership` are removed).

### A4.2 The per-file understanding entry (supersedes §4.10.1)

L3 produces a rich entry per centrality-important file; smaller/peripheral files get a **lighter L2-only entry** (Purpose + Connections). One entry per *source file* (design §5.11 LEAVE: not one file per node). Path mirrors the source under `anatomy/` (or `scopes/<scope>/anatomy/`).

**Frontmatter — required:** `path` (project-relative source path), `extracted_at` (iso-datetime), `extraction_level` (int `2 | 3`), `size_lines` (int), `size_tokens` (int), `centrality` (enum `high | medium | low`), `built_at_commit` (string — the commit at extraction; the per-entry half of the staleness ledger, A4.4), `source_sha256` (sha256 — hash of the *source file body*, not the entry frontmatter; A4.4, design §5.11 "hash-the-body-not-the-frontmatter").

```yaml
---
path: src/auth/session.ts
extracted_at: 2026-07-07T14:00:00Z
extraction_level: 3
size_lines: 620
size_tokens: 5400
centrality: high
built_at_commit: 9f2c1ab
source_sha256: a1b3…            # 64 hex, of the source file body
---
```

**Section contract (L3 entry):** `## Purpose`, `## Main players` (named atomic elements with line ranges and importance — the source the `element` query reads, A5.1; elements are a byproduct of L3, not a separate pass), `## Insights` (non-obvious observations, conventions, quirks), `## File map` (only above ~500 lines; line-range → section), `## Connections` (`Uses:` / `Used by:` / `Semantically related (not imports):`), `## Query pointers` (intent-scoped "if you need to X, also read Y"). An **L2 (lighter) entry** carries `## Purpose` and `## Connections` only, with `extraction_level: 2`.

**Validated by** `check.insight-entry` (replaces `check.insight-prose`): required frontmatter present and typed; `extraction_level` in `{2,3}`; `centrality` in enum; `source_sha256` 64-hex; an L3 entry (`extraction_level: 3`) carries `## Purpose`, `## Main players`, `## Connections` at minimum; an L2 entry carries `## Purpose` and `## Connections`. `## File map` absent below the size threshold is not an error.

### A4.3 `scope-registry.yaml` (new; part of the superseded-§4.10 replacement)

Present only for scoped extractions. The durable record of the scope tree (design §5.4).

```yaml
schemaVersion: "3.0"
built_at_commit: <string>
scopes:
  <scope-id>:
    path: <project-relative dir>          # required
    depends_on: [<scope-id>, …]           # required (may be empty) — shared scopes this one references
    shared_by: [<scope-id>, …]            # optional — parents that reference this shared scope
```

A scope with a non-empty `shared_by` is extracted **once** and referenced from each parent (dedup, design §5.4). **Validated by** `check.insight-scope-registry`: valid YAML; each `path` resolves to a directory; every `depends_on`/`shared_by` id is a declared scope; `depends_on` acyclic; `shared_by` is the inverse of `depends_on` (asymmetry → warning).

### A4.4 The staleness ledger — `insight/ledger.json` (new)

Design §5.8/§5.9 require a `built_at_commit` stamp + per-entry content hash and direct the addendum to give the ledger a storage shape. **Concrete shape (flagged A10-2):** a module-level ledger complementing the per-entry `built_at_commit`/`source_sha256` frontmatter (A4.2).

```jsonc
{
  "schemaVersion": "3.0",
  "built_at_commit": "<sha>",                 // module-wide ground-truth commit of the last full pass
  "entries": {
    "<source-path>": {
      "source_sha256": "<64hex>",             // hash of the source body at extraction (mirrors A4.2)
      "built_at_commit": "<sha>",
      "extraction_level": 2                    // 2 | 3
    }
  }
}
```

The post-commit fast tier (A7.1) compares a changed file's current body hash against `entries[path].source_sha256` to flag drift **without** invoking an LLM (design §5.9, "code-only-skips-LLM"). **Validated by** `check.insight-ledger`: valid JSON; `built_at_commit` present; each `entries` value has `source_sha256` (64-hex), `built_at_commit`, `extraction_level ∈ {2,3}`.

### A4.5 The reverse-dependency index — `insight/reverse-index.json` (new)

Design §5.9 requires a reverse dependency index so a changed file invalidates not just its own entry but every concept/edge referencing an entity in it, and directs the addendum to give it a storage shape. **Concrete shape (flagged A10-3):**

```jsonc
{
  "schemaVersion": "3.0",
  "built_at_commit": "<sha>",
  "referenced_by": {
    "<entity-node-id>": [ "<concept-id | edge-id>", … ]   // everything that cites this entity
  }
}
```

`<entity-node-id>` uses the A4.6 node-id grammar; each referencing id is a concept file id or an `edge-id` (A4.6). On a file change, the daily loop (A7.1) looks up every entity the file defines and re-verifies every referencing concept/edge. **Validated by** `check.insight-ledger` (same check governs both index files): valid JSON; keys are well-formed node ids; list members are well-formed concept/edge ids.

### A4.6 The JSON shapes — `graph.json`, `tags.json`, `clusters.json` (supersedes §4.10.2)

Node ids reuse a **path-derived grammar** (design §5.11 "deterministic path-derived IDs"): `file:<project-relpath>`, `element:<project-relpath>#<name>`, `concept:<slug>`. (This deliberately **differs from v2's constellation-borrowed grammar** — v3's nodes are source-code entities, not curated artefacts, design §8.3.) Serialization is deterministic: nodes/edges/tags/clusters total-ordered; only `generated`/`built_at_commit` vary per run; the graph write **refuses to shrink an existing graph without `--force`** (design §5.8, crashed-refresh guard).

**`graph.json`** — the cross-file semantic graph (scope-local copies live at `scopes/<scope>/graph.json`):

```jsonc
{
  "schemaVersion": "3.0",
  "generated": "<iso-datetime>",
  "built_at_commit": "<sha>",
  "nodes": [ { "id": "<node-id>", "kind": "file" | "element" | "concept", "label": "<string>" } ],
  "edges": [
    {
      "id": "<edge-id>",                          // stable, derived from (source,target,edge_type)
      "source": "<node-id>",
      "target": "<node-id>",
      "edge_type": "imports" | "calls" | "semantically-similar-to"
                 | "implements-concept" | "co-clustered",
      "confidence": "structural" | "stated" | "inferred" | "ambiguous",
      "evidence": "<non-empty rationale string>",
      "confirmed_at_commit": "<sha>"              // last refresh that re-confirmed the edge (confidence-aging, §5.9)
    }
  ]
}
```

- **`edge_type` — enumerated closed set (flagged A10-4):** `imports` (L1 structural module dependency); `calls` (caller→callee, within-language guard, design §5.11); `semantically-similar-to` (L4 — the **only** sanctioned similarity edge, tightened to non-obvious-and-cross-cutting, design §5.11); `implements-concept` (a file/element node → a `concept` node); `co-clustered` (cluster co-membership). Extending the set is a MINOR bump.
- **`confidence` — a discrete confidence-TIER enum, NOT a float (flagged A10-5), each tier tied to a named evidence type (design §5.11 "discrete confidence rubric … each tied to a named evidence type"):**

  | tier | evidence type | meaning |
  |---|---|---|
  | `structural` | AST relation (L1, tree-sitter) | edge is a deterministic parse fact (import, export, in-language call) |
  | `stated` | EXTRACTED text (L2/L3) | edge asserted by explicit content the extractor read |
  | `inferred` | INFERRED reasoning (L4) | edge from cross-file semantic reasoning, no direct textual assertion |
  | `ambiguous` | AMBIGUOUS signal | weak/conflicting evidence; surfaced for re-verification, never silently trusted |

  This **deliberately differs from v2's inferred-edge enum** (`high | medium | low`, schema §4.10.2 / Decision 17), which graded *inference strength* on edges that were all INFERRED by definition. v3's tiers grade *kind of evidence*, mapping onto the EXTRACTED/INFERRED/AMBIGUOUS provenance vocabulary plus a `structural` tier below it (design §5.11).
- **Every edge MUST carry a non-empty `evidence` string** — explainability is a module invariant (design §1.3, "NO embeddings; each edge names its rationale"). An empty `evidence` is an `error`.
- **`confirmed_at_commit`** supports confidence-aging (design §5.9): an `inferred`/`ambiguous` edge not re-confirmed across N refreshes is surfaced to the loop for re-verification. N is a loop-config detail (addendum defers to the insight-refresh loop spec).

**`tags.json`** — a **structured tag vocabulary** (the embeddings replacement, design §1.3). v2 stored a bare label list; v3 adds a typed vocabulary (flagged A10-6):

```jsonc
{
  "schemaVersion": "3.0",
  "generated": "<iso-datetime>",
  "built_at_commit": "<sha>",
  "vocabulary": [
    { "tag": "authentication", "kind": "concern" | "technology" | "pattern" | "layer" | "domain-term",
      "aliases": ["auth"] }                       // aliases optional
  ],
  "assignments": { "<node-id>": ["authentication", "jwt"] }   // every tag must appear in vocabulary
}
```

**`clusters.json`** — inferred domain clusters:

```jsonc
{
  "schemaVersion": "3.0",
  "generated": "<iso-datetime>",
  "built_at_commit": "<sha>",
  "clusters": [
    { "id": "cluster:<label-slug>", "label": "<string>", "members": ["<node-id>", …],
      "rationale": "<non-empty>", "scope": "<scope-id>" | "global" }
  ]
}
```

Cluster-id stability across rebuilds (v2's Jaccard carry-over, Decision 14) and the **exact cluster-representation nuances** are **addendum-deferred to the insight storage-format spec** (design §10.3, §11 Q1) — this addendum fixes only the field-level shape above (id form `cluster:<slug>`, `members`, non-empty `rationale`, `scope`).

**Validated by** `check.insight-graph` (redefined): each file valid JSON with `schemaVersion`, `generated`, `built_at_commit`; `graph.json` node ids unique, well-formed under the A4.6 grammar; edge `source`/`target` present in the file's own `nodes` (absent → warning, tolerant); `edge_type` and `confidence` in their enums; every edge `evidence` non-empty; `tags.json` `assignments` reference only ids in `vocabulary`; `tag.kind` in enum; `clusters.json` cluster ids match `cluster:<slug>`, unique, `rationale` non-empty, `scope` a declared scope id or `global`.

### A4.7 `insight/_index.md` — the ungated-module active prompt (supersedes §7.4)

Under the §7.1 shape, stating the trust model (ungated/unreviewed; gated-layer-wins) and naming the CLI. Locked as template text (design §5.13; RULES 11 `_index.md` budget <300 tokens):

```markdown
# Insight — inferred codebase understanding (ungated)

This module holds Cortex's inferred understanding of THIS codebase:
per-file entries (purpose, main players, insights, file map,
connections), concepts, and the semantic graph. Inferred, not
curated — context, not authority. Where insight conflicts with a
compass rule or a spec, the gated layer wins.

Query it; don't read these files directly:
- cortex insight file <path>     — the rich per-file entry
- cortex insight concept <name>  — how a concept lives in the code
- cortex insight element <query> — a function / class / constant

Before substantive work on a file, query its insight entry; before
cross-file or concept-touching changes, query the concept
(see the "Cortex Insight" block in CLAUDE.md).

Layout: per-file entries under anatomy/ (or scopes/<scope>/anatomy/
when scoped); concepts under concepts/; the semantic graph in
graph.json / tags.json / clusters.json; the scope tree in
scope-registry.yaml. Kept current by the insight-refresh loops
(fast / daily / full) and enriched by cortex-loop-session-observe.
```

**Validated by** `check.insight-index` (redefined) + `check.index-shape`: body names insight as ungated/unreviewed and references `cortex insight` (`warning` if the trust-model line is absent).

### A4.8 CLAUDE.md insight block (supersedes the §8 insight bullet)

The §8 managed block's `insight/` bullet is replaced by the directive block below (design §5.7; RULES 11 budget: whole Cortex section <400 tokens). Locked as template text:

```markdown
## Cortex Insight

This project has a Cortex insight layer at .cortex/insight/ that
contains rich per-file understanding, concept extraction, and
semantic connections across the codebase. It is queryable via
the `cortex insight` CLI.

Read the file itself when you're going to modify it, need exact
syntax, or the change requires knowing every line. Query insight
instead when you're trying to understand what a file does, whether
it's relevant, how it relates, or what its main pieces are — a
richer resume than reading 500 lines and remembering fragments.
Consult insight first; read the file when you need exactness.

Before substantive work on any file, query its insight entry.
Before changes touching multiple files or a concept, query the
concept. This is not optional.

- cortex insight file <path>      — rich per-file understanding
- cortex insight concept <name>   — how a concept lives in the code
- cortex insight element <query>  — atomic element (may return
  "no rich entry"; still discoverable via the file entry)

Insight is inferred, not curated. Where it conflicts with a compass
rule or a spec, the gated layer wins — context, not authority.
```

**Validated by** `check.claude-md` (unchanged ID).

---

## A5. Insight query CLI + extract-skill contract (supersedes §4.10.5)

### A5.1 `cortex insight` command contracts (supersedes the §4.10.5 verbs)

All deterministic Core reading pre-extracted files — **no LLM at query time** (design §5.6; RULES 3). All support `--json`. **Supersedes** v2's `query | get | neighbors | list`:

| v3 command | Returns |
|---|---|
| `cortex insight file <path>` | the rich per-file entry (A4.2) for the source path |
| `cortex insight concept <name>` | which files touch the concept, how it's implemented, related concepts |
| `cortex insight element <query>` | an atomic element (function/class/constant) with description, connections, follow-up pointers; MAY return "no rich entry" for elements not identified as L3 main players — still discoverable via `file` |

There is **no `cortex insight ask`** in v3 (natural-language questions are answered by Claude in-session over these primitives; a subprocess `ask` is a named future addition, design §5.6, §11). The command payload *text* is asserted by the insight dev specs' tests, not the validator (carried from §4.10.5).

### A5.2 `cortex-extract-insight` skill I/O contract (new; the extract half of the superseded module)

A Claude Code **skill**, **no CLI wrapper** (design §5.3, §5.11; RULES 3 — extraction is agentic LLM work). Invoked from sessions and scheduled tasks. Contract:

- **Input:** a project with L1 available (or runs L1 in Core first — design §5.3 Phase 1).
- **Behaviour:** orchestrates L1 → planning → scoped parallel L2/L3 execution → cross-scope L4 unification (design §5.3); spawns one sub-agent per root scope (write-fragment-to-disk, disk-file-is-success-signal, missing-fragment-warns, >half-missing-aborts — design §5.3/§5.11); resumable/checkpointed per scope completion; validates outputs against this schema.
- **Outputs (durable):** the insight layout of A4.1 (`anatomy/` entries, `concepts/`, `graph.json`/`tags.json`/`clusters.json`, `scope-registry.yaml`, `ledger.json`, `reverse-index.json`).
- **Outputs (transient, pulse):** A5.3.

### A5.3 Pulse artefact formats (new)

Both under `pulse/` (gitignored, transient; §4.5 header conventions apply — `kind`, `generated`, `loop`).

- **`.cortex/pulse/insight-extraction-plan.md`** (`kind: insight-extraction-plan`) — the plan Claude drafts in Phase 2 for user review: root scopes (with size/depth and shared references), shared scopes, sub-scopes, estimated cost and peak parallelism (design §5.3 example). For codebases below the auto-run threshold the plan is written and executed without a wait; above it, execution waits for confirmation.
- **`.cortex/pulse/insight-extraction-progress.md`** (`kind: insight-extraction-progress`) — progress reporting during Phase 3/4: per-scope status (pending / running / complete / failed), files done, checkpoints, warnings (missing fragments) (design §5.11).

**Validated by** `check.pulse` (header presence; loose otherwise — transient).

---

## A6. Provenance frontmatter (new)

Design §7. Every persistent artefact that can trace to an authorizing source carries provenance. **Applies to: compass rules (A1.2), both spec trees (§4.6 dev, §4.7 business), and atlas decisions (A2.2).** A natural extension of the §6 citation graph — same frontmatter-cross-reference mechanism, same resolve-checking machinery — adding one capability: *backward* traversal from a source to its derivations.

### A6.1 Format

```yaml
provenance:
  - derives_from: archive/documents/client-spec-v2.0/extracted/requirements/GT-CLIENT-001-session-expiry.md
  - derives_from: claude-sessions/pedro/abc123def
```

`provenance` is an optional list; each entry has exactly one key `derives_from` (v3 uses **exactly one** relationship type — a taxonomy is a future refinement, design §7.3). **Absence of the field means "authored directly," not "unknown origin"** (design §7.3).

### A6.2 The three source-type reference forms (design §7.2)

| Form | Example | Resolution |
|---|---|---|
| Archive path | `archive/documents/<slug>/extracted/…` or `…/source.<ext>` | **MUST resolve** to an existing file |
| Atlas decision | `atlas/decisions/<slug>.md` | **MUST resolve** (the §4.2 single-home mechanism: rule cites decision instead of copying) |
| Claude Code session | `claude-sessions/<user>/<session-id>` | **cited-not-resolved** — not stored in Cortex; establishes origin, retrieval requires Claude Code access or asking the user |

### A6.3 `check.provenance` (new)

**Validated by** `check.provenance`: each `provenance` entry has exactly the `derives_from` key; archive-path and `atlas/decisions/` references **resolve** (unresolved → `error`); `claude-sessions/<user>/<id>` references are shape-checked only (well-formed → pass; **not** resolved); the field's presence is optional (absence is not a violation). The check additionally maintains/validates the **backward-traversal index** (the source→derivations map that answers "what changes if we renegotiate X?", design §7.4) — every resolvable `derives_from` target is indexed to its citing artefact.

---

## A7. New loops + scheduled tasks (supersedes §9.1)

Design §9. The loop roster changes in exactly two areas — the anatomy transition and the insight supersession.

### A7.1 Register / deregister

**Deregister:** `cortex-loop-anatomy-refresh-deep` and the anatomy-refresh-fast post-commit hook (anatomy deprecates, A7.3); `cortex-loop-insight-refresh` and `cortex-loop-insight-gaps` (v2 insight superseded, design §8).

**Register:**
- `cortex-loop-insight-refresh-fast` — the **git post-commit hook** tier (replaces anatomy-refresh-fast as the post-commit deterministic tier): flags changed files for review by comparing body hashes against `ledger.json` (A4.4); **no LLM**.
- `cortex-loop-insight-refresh-daily` — significance triage (structural filter in Core + Haiku, design §5.9) then L2 on any real change, L3 on significant change, L4 neighbourhood updates around L3 re-extractions; consumes `reverse-index.json` (A4.5) for invalidation and ages `inferred`/`ambiguous` edges (A4.6).
- `cortex-loop-insight-refresh-full` — weekly (configurable) full L4 regeneration as the ground-truth pass.
- `cortex-loop-session-observe` — the v3 successor to v2's `insight-gaps` (§A7.2 write-ownership).

### A7.2 Canonical scheduled-task list (supersedes §9.1)

The §9.1 canonical-task-name list becomes:

`cortex-pulse-hygiene`, `cortex-pulse-distil`, `cortex-loop-skill-suggest`, `cortex-loop-rule-decay`, `cortex-loop-atlas-staleness`, `cortex-loop-onboarding-drift`, `cortex-loop-spec-drift`, `specflow-lint`, `specflow-verify`, `cortex-loop-test-runner`, `cortex-loop-bug-triage`, and — new at 3.0 — `cortex-loop-insight-refresh-daily`, `cortex-loop-insight-refresh-full`, `cortex-loop-session-observe`.

**Fourteen scheduled tasks** (was fourteen at 2.0: removed `cortex-loop-anatomy-refresh-deep`, `cortex-loop-insight-refresh`, `cortex-loop-insight-gaps`; added three). The fifteenth loop, `cortex-loop-insight-refresh-fast`, remains the **git post-commit hook** (replacing anatomy-refresh-fast), not a scheduled task. The `<slug>-<hash6>-<canonical>` project-scoping grammar (§9.1) is unchanged. Exact renumbering is migration/build-order detail (design §9, §10).

### A7.3 Loop-write ownership (supersedes the §9 machine-owned-ungated clause)

The loop-write invariant (a loop never mutates gated content; schema Decision 13) governs the new loops:
- The three insight-refresh loops maintain machine-owned ungated insight state **directly** (the same basis as v2's refresh loop).
- **`cortex-loop-session-observe`** writes **ungated insight observations directly** (the `## Insights` and `## Query pointers` sections of per-file entries, A4.2, carrying `claude-sessions/<user>/<id>` provenance, A6), and proposes **gated** conventions/rules to compass and decisions to atlas **through the pulse gate** (reusing the salvaged typed pulse-gate/promotion machinery, design §8.2). It never mutates gated content directly.

Anatomy is removed: **`anatomy/files.md` and the anatomy graph (§4.1) cease to exist**; their consumers (`specflow-develop`, `specflow-tests`, the hooks, `cortex-loop-spec-drift`) re-point to insight (design §5.10); the PostWrite/PostRead anatomy writeback (§5) is removed (read-time purpose capture migrates into insight as `read-time`-tagged extraction metadata, design §5.10).

### A7.4 Pulse typed-suggestion enum — new value `decision-candidate` (extends v2.0 §4.5.1)

`cortex-loop-session-observe` (A7.1, A7.3) routes gated conventions/rules to compass via the existing `rule-candidate` type, but no v2.0 `**Type:**` value (`rule-candidate | skill-proposal | promotion | gated-layer-update | user-directed-capture`, schema §4.5.1) targets a decision proposed to **atlas** from a session observation. This addendum extends the v2.0 enum, additively, with exactly one new value — the v2.0 enum itself is unchanged and this is not a repurposing of `rule-candidate`, `promotion`, or `gated-layer-update`:

- **`decision-candidate`** — parallel to `rule-candidate` in shape and fields (the same typed pulse-gate payload, the same `S-NNN` counter, the same dismissed/suppression machinery), but its permitted target root is `atlas/decisions/` instead of `compass/`. Proposes a new decision to record, drafted from an in-session observation (design §9, `insight.session-observe`).

The v2.0 `**Type:**` enum at schema §4.5.1 becomes, for v3.0: `rule-candidate | skill-proposal | promotion | gated-layer-update | user-directed-capture | decision-candidate`. The pulse-gate machinery that reads/validates `**Type:**` accepts the new value alongside the five existing ones.

---

## A8. Validator checks — consolidated catalogue delta (supersedes Appendix A)

The full delta versus v2.0 Appendix A. Grouped by disposition; see A0.3 for the reconciliation note on the absent `check.cerebrum-*`.

**ADDED (7):**

| Check | Enforces | Clause | Severity |
|---|---|---|---|
| `check.archive-layout` | `archive/` layout: `documents/<slug>/` has `source.*` + `metadata.yaml` + `extracted/`; `_index.md`, `register.md`, `types/` present | A3.1 | error |
| `check.archive-metadata` | `metadata.yaml` frontmatter (`id`, `kind`→resolves, `ingested_at`, `version`, `status`) | A3.2 | error |
| `check.archive-type` | `types/*.yaml` shape (`id`==stem, `label`, `classification`, `extraction.strategy`, non-empty `outputs`) | A3.3 | error |
| `check.provenance` | `provenance` entries resolve (archive/atlas MUST; `claude-sessions` shape-only); backward-traversal index | A6 | error |
| `check.insight-entry` | per-file entry frontmatter + section contract (replaces `check.insight-prose`) | A4.2 | error |
| `check.insight-scope-registry` | `scope-registry.yaml` shape, path resolution, `depends_on` acyclicity | A4.3 | error |
| `check.insight-ledger` | `ledger.json` + `reverse-index.json` shapes and node-id well-formedness | A4.4, A4.5 | error |

**RE-ROOTED / REDEFINED (IDs stable, 10):**

| Check | Change | Clause |
|---|---|---|
| `check.layout` | `.cortex/` layout: `compass/`, `archive/`, rebuilt `insight/`; `cerebrum/` and `anatomy/` gone | A1.1, A3.1, A4.1 |
| `check.rule` | reads `compass/rules/`; tolerates optional `provenance` | A1.2 |
| `check.bug` | reads `compass/bugs/` | A1.3 |
| `check.index-shape` | applies to `compass/`, `archive/`, `insight/` dirs | A1.7, A3.4, A4.7 |
| `check.rule-governs-resolves` | governs globs on `compass/` rules | A1.2 |
| `check.insight-index` | redefined for the v3 insight module trust-model prompt | A4.7 |
| `check.insight-graph` | redefined for v3 `graph.json`/`tags.json`/`clusters.json` (new grammar, `edge_type`/`confidence` enums, `evidence`) | A4.6 |
| `check.constellation` | `module` enum `cerebrum`→`compass`; v2 insight-preset clause dropped | A1.4, A4.6 note |
| `check.claude-md` | managed block re-rooted (compass; anatomy bullet removed; insight block A4.8) | A1.8, A4.8 |
| `check.loop-md` | machine-owned-ungated clause re-pointed anatomy→insight; compass | A1.9 |
| `check.atlas` | `cerebrum_rules`→`compass_rules`; tolerates optional `provenance` on decisions | A2.2, A6 |

**REMOVED (5):** `check.anatomy-files`, `check.anatomy-graph`, `check.anatomy-purpose-source` (anatomy module removed, A7.3); `check.insight-prose` (replaced by `check.insight-entry`); `check.insight-ownership` (the `map/` write-lane rule is obsolete under the new layout, A4.1).

**Check count:** 28 (v2.0) → **32 (v3.0)**.

---

## A9. Consolidated v3.0 `.cortex/` layout (supersedes the §1 skeleton)

```
.cortex/
├── cortex.config.json          [committed]   config + schemaVersion "3.0" (A8.1)
├── constellation.json          [gitignored]  compiled citation graph (curated-only; §4.9, module enum re-rooted A1.4)
├── _index.md                   [committed]   root active prompt — names the five modules
├── atlas/                      [committed]   stakeholders, decisions (SOLE home, A2), domain
├── compass/                    [committed]   rules, conventions, bug ledger (A1) — the renamed cerebrum
├── archive/                    [committed]*  ingested documents + extractions (A3) — *source.* gitignored
├── insight/                    [committed]   inferred codebase understanding (A4) — anatomy absorbed
└── pulse/                      [gitignored]  transient loop outputs (§4.5) + insight plan/progress (A5.3)
```

`.cortex/anatomy/` and `.cortex/cerebrum/` no longer exist. The five modules are atlas, compass, archive, insight, pulse (design §3).

---

## A10. Version wiring + concrete-shape decisions

### A10.0 Version wiring (supersedes §10.1–§10.4 as they pertain to version)

- `cortex.config.json` `schemaVersion: "3.0"`. The `insight` config block (§10.1: `clusterCarryOverJaccard`, `promotionMinAgeDays`, `promotionMinObservations`) is superseded — v3 insight config keys (auto-run threshold, significance-triage tuning, confidence-aging N) are **addendum-deferred to the insight-refresh loop spec** (design §10.3); this addendum fixes only `schemaVersion`. Config MAY gain an `archive` block; its keys are deferred to the archive ingestion spec.
- **3.0 is a MAJOR bump** (§10.2 semantics): a module renamed (`cerebrum`→`compass`), a module removed (`anatomy`), a module added (`archive`), new required frontmatter (per-file entry `built_at_commit`/`source_sha256`, A4.2), and moved/removed directories.
- **Migration policy (§10.4).** Whether 2.0→3.0 ships a `cortex migrate` is decided by the **module-migration spec** (design §10.3), not here: it is still single-user (the §9.2/Decision 19 waiver logic *may* carry), but the **anatomy→insight content move is more than a rename** — it is a re-extraction, not a path rewrite — so the migration spec owns the mechanics (rename `cerebrum`→`compass` and delete the duplicate decisions are deterministic Core moves; the anatomy→insight absorption requires a fresh insight extraction). **Addendum defers migration mechanics to the module-migration spec.**

### A10.1 Concrete shapes this addendum decided (design left them open — flagged)

Per the discipline: where the design explicitly left a shape open beyond the concrete minimal shapes it directed this addendum to specify, the addendum **defers to the named spec** (noted inline). The concrete decisions this addendum *did* make, each flagged:

| Flag | Decision | Design status |
|---|---|---|
| A10-1 | `archive/types/*.yaml` shape: `id` / `label` / `classification{extensions,hints,explicit}` / `extraction{strategy,outputs[{kind,path,item_pattern}]}` (A3.3) | design §6.1/§6.3 "sketched, not specified" — specified here |
| A10-2 | Staleness ledger stored as `insight/ledger.json` + per-entry `built_at_commit`/`source_sha256` frontmatter (A4.2, A4.4) | design §5.8/§5.9 required a shape, left it to the addendum |
| A10-3 | Reverse-dependency index stored as `insight/reverse-index.json` (`referenced_by` map) (A4.5) | design §5.9 required a shape, left it to the addendum |
| A10-4 | `edge_type` enumerated closed set: `imports` / `calls` / `semantically-similar-to` / `implements-concept` / `co-clustered` (A4.6) | design §5.11 named the primitives, not the enum |
| A10-5 | `confidence` discrete 4-tier enum `structural`/`stated`/`inferred`/`ambiguous`, each tied to a named evidence type; deliberately differs from v2's `high\|medium\|low` (A4.6) | design §5.8/§5.11 required "discrete tiers tied to named evidence"; exact tiers chosen here |
| A10-6 | `tags.json` structured vocabulary with `tag.kind` enum `concern`/`technology`/`pattern`/`layer`/`domain-term` (A4.6) | design §1.3/§5.11 named "structured tags as a first-class store"; the vocabulary schema chosen here |
| A10-7 | Insight node-id grammar `file:` / `element:` / `concept:` (path-derived), distinct from v2's constellation-borrowed grammar (A4.6) | design §5.11 required "deterministic path-derived IDs"; the exact prefixes chosen here |

**Explicitly deferred (not decided here):** cluster-representation carry-over/stability nuances → insight storage-format spec (design §10.3, §11 Q1); confidence-aging threshold N and significance-triage tuning → insight-refresh loop spec; migration mechanics → module-migration spec (A10.0); v3 config-block keys (insight, archive) → the respective specs; whether a v3 insight constellation preset is added → open (design §11 Q2).

---

**End of v3.0 addendum.** Folds into `cortex-schema.md` at build-order-v3 step 1 (design §10.2), superseding the v2.0 clauses named in A0.2 and raising the living contract to `3.0`.
