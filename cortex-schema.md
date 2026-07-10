# Cortex Schema — The Contract Between Core and Skills

**Schema version:** `3.0`
**Status:** v3.0 draft for review by Pedro. This file is the **living contract** and is revised in place at each version — the v2.0 text is preserved in git history. (Unlike the design documents, which are frozen records.)
**Depends on:** `cortex-design.md` (the v1 design doc, frozen), `cortex-v2-design.md` (the v2 design doc, frozen), and `cortex-v3-design.md` (the v3 design doc). Where design and schema disagree, this document wins on file formats, frontmatter, cross-references, and versioning — that is its job. Where the design docs are silent or vague, this document **makes the decision** (see §0) rather than deferring.

**3.0 is a MAJOR bump** (§10.2): `cerebrum/` renames to `compass/` (rule/bug ids and their content-keyed constellation node prefixes are unchanged — the rename is path-only); `anatomy/` is removed, its content absorbed into `insight/`; `archive/` is added as a new module for ingested source documents (mixed git policy per-artefact); `insight/` is rebuilt wholesale — a leveled (L1–L4), scoped, per-file understanding of the codebase itself replaces the v2.0 concept-map-over-curated-artefacts layout; `provenance:`/`derives_from:` frontmatter is added to compass rules, both spec trees, and atlas decisions; decisions gain a single home (`atlas/decisions/` only — the `cerebrum/decisions.md`/`compass/decisions.md` artefact no longer exists); and the loop/scheduled-task roster changes (anatomy-refresh and the v2.0 insight-refresh/gaps pair retire; three insight-refresh tiers plus `cortex-loop-session-observe` take their place). Folded in from `cortex-schema-v3-addendum.md` at build-order-v3 step 1 (design §10.2) — see git history for the addendum's drafting record and the fold-in commit.

This is the load-bearing artefact named in design §3.2. **Cortex Core implements it; Skills consume it; both reference it by version** (recorded in `.cortex/cortex.config.json`, §10). It is precise enough that the schema validator (`.specflow/specs/schema/validator.spec.md`) can be implemented mechanically from it.

Conventions used in this document:

- **MUST / SHOULD / MAY** carry their usual normative force. A `MUST` violation is an `error`; a `SHOULD` violation is a `warning`.
- "Frontmatter" means a YAML block delimited by `---` at the very top of a markdown file.
- "Validated by" names the validator check that enforces a rule. The validator is the single mechanical enforcer; loops (`specflow-lint`, `specflow-verify`) layer additional non-schema checks on top.

---

## 0. Decisions made where the design doc was vague

These were underspecified or contradictory in `cortex-design.md`. Each was **locked** at schema v1.0 and carries forward unchanged into 2.0 and 3.0 (the v2.0 additions are in §0.1; the v3.0 additions are in §0.2). Override any of them and the dependent sections change.

1. **Git policy: §14 wins over §13.2.** Design §13 step 2 says "append `.cortex/` to `.gitignore`"; §14 says cerebrum and atlas (minus sources) are committable. These contradict. **Decision:** `cortex init` gitignores the specific regenerable/sensitive/transient paths only — `.cortex/anatomy/`, `.cortex/atlas/sources/`, `.cortex/pulse/`, and `.cortex/constellation.json` (compiled, regenerable — §4.9) — never the whole `.cortex/`. `.cortex/cortex.config.json`, `.cortex/cerebrum/`, and `.cortex/atlas/` (minus `sources/`) are committed. (§1, §10) **v2.0 amendment:** `.cortex/insight/` is committed in full — including the machine-regenerated `map/*.json` — adding the fourth git-policy quadrant: machine-owned *and* committed (v2 design §3.3; diff-noise mitigations in §4.10.2 (v2.0)). The gitignored set is unchanged. **v3.0 amendment:** `.cortex/anatomy/` no longer exists — the module is removed, its content absorbed into `insight/` (§4.10; the RULES.md gitignore note for it retires with anatomy deprecation, build-order-v3 step 7). `.cortex/cerebrum/` renames to `.cortex/compass/` — same committed git policy, path only (§4.1, §4.2). `.cortex/archive/` is added with a **fifth, mixed** git policy — committed and gitignored *within the same module*, per-artefact: `_index.md`, `register.md`, `documents/*/metadata.yaml`, `documents/*/extracted/`, and `types/` are committed; `documents/*/source.*` is gitignored (raw source may be sensitive — same treatment as `atlas/sources/`). (§4.4)

2. **One global spec-ID namespace; no tree prefix.** Design §8.2 shows `covers: [business.auth.secure-account-access]` (a `business.` prefix) while the business-spec template uses bare `id: auth.secure-account-access`. **Decision:** all spec IDs — dev and business — live in **one global namespace, are bare (no `business.`/`dev.` prefix), and MUST be globally unique.** `depends_on:` and `covers:` reference bare IDs. The `business.` prefix from §8.2 is dropped. (§4.6, §4.7, §6)

3. **Schema version is project-level, not per-artefact.** Design implies artefacts might each declare a version. **Decision:** the version is declared **once**, in `.cortex/cortex.config.json` (`schemaVersion`). Individual artefacts do **not** carry a version field; they inherit the project version. The validator reads `cortex.config.json` to know which contract to enforce. (§10)

4. **`covers:` completeness is NOT a schema-validator concern.** The validator checks that every `covers:` entry *resolves*. The constraint "every business spec appears in ≥1 scenario's `covers:`" (§8.2) is a **verification-pass** check owned by `specflow-verify` (design §11.4), because it is a project-completeness assertion, not a per-file conformance rule. (§3, §6, and reflected back into `validator.spec.md`)

5. **`anatomy/files.md` is markdown frontmatter + a table.** Design never fixes the format. **Decision:** a YAML frontmatter header (anatomy-level metadata) followed by one markdown table row per file. List-valued cells (`spec_links`) are space-separated bare IDs. (§4.1, v1.0) **Superseded at v3.0:** `anatomy/` is removed; the per-file understanding this decision shaped now lives in `insight/`'s per-file entries (§4.10.2), which are markdown frontmatter + prose sections rather than a table — a materially richer format, not a renamed table. This decision is preserved for historical continuity; it governs nothing at v3.0.

6. **`loop.md` lives at the project root and is optional.** Design §11 names it for `/loop` integration but never specifies it. **Decision:** `cortex init` MAY write a root `loop.md` (off unless `cortex.config.json` `loop.enabled` is true). Format in §9. (§9)

7. **Confidence enum is `STATED | EXTRACTED | INFERRED`.** Design §9.2 shows `confidence: EXTRACTED` with no enum. **Decision:** those three values; optional on compass and atlas artefacts; absent means `STATED`. (§4.1, §4.3)

8. **ID prefixes and padding:** rules `R-NNN`, bugs `B-NNN`, pulse suggestions `S-NNN` — `-` plus a zero-padded integer, **minimum 3 digits**, monotonic per project, never reused. Atlas decisions are dated slugs (`YYYY-MM-DD-slug`), not `D-NNN`. (§4.1, §4.3)

9. **Timestamps are ISO-8601 UTC** with a trailing `Z` (e.g. `2026-06-30T14:00:00Z`). (everywhere)

10. **Two index kinds, named distinctly.** `_index.md` = an **active prompt** (every `.cortex/` directory, plus `.specflow/specs/_index.md` which is the dependency/build index). `_overview.md` = a **folder overview** (every directory in `specs/` and `specs-business/`). A directory never needs both except the `specs/` root, which has `_index.md` (engineering index) and its domains have `_overview.md`. (§2, §7)

11. **Every `*.spec.md` is treated as a leaf for the single-`implements:` rule.** The leaf-vs-aggregate distinction is not encoded in the path, so `check.dev-spec`/`check.xref-*` apply the "exactly one `implements:`" requirement to every dev spec file. Domain/capability aggregate specs that legitimately omit `implements:` are permitted per §4.6, but if `implements:` is present it MUST be single-valued. (surfaced from the validator build; enforced at §4.6, §6, Appendix A `check.dev-spec`)

12. **A MAJOR schema-version mismatch short-circuits all other checks.** When `cortex.config.json` declares a MAJOR above (or below) the validator's supported MAJOR, the validator emits the single `check.config` error (§10.3) and runs no further checks — it does not validate against the wrong contract. (surfaced from the validator build; enforced at §10.3, Appendix A `check.config`)

### 0.1 Decisions locked at v2.0

Where `cortex-v2-design.md` left an open question that this contract must commit on, the recommended disposition (approved with the design doc) is adopted and **marked** here.

13. **The loop-write invariant is restated: a loop never mutates gated content.** Compass, atlas, `RULES.md`, and both spec trees change only through the human gate (`pulse-accept`) or under direct human review; machine-owned ungated state (v2.0: anatomy, `insight/map/*.json`) is maintained directly by its designated owner loop; ungated observational content (v2.0: `insight/map/*.md`, plus the one file-list line in `insight/_index.md`) is written directly by its designated producer, with provenance. This supersedes v1's "writes only to `.cortex/pulse/`" phrasing and retires its growing exception list (test-runner and bug-triage keep their narrow, reported exceptions per their specs). (v2 design §4.4, flags F1/F6; §9) **v3.0 amendment:** anatomy no longer exists; the machine-owned-ungated allowance re-points wholly to `insight/` (§4.10) — the three insight-refresh loops maintain it directly, and `cortex-loop-session-observe` writes ungated per-file enrichments directly while proposing any gated compass/atlas content through the pulse gate (never mutating gated content itself). (design §9; addendum A7.3)

14. **Cluster ids are label-slugs with carry-over matching (OQ1 disposition).** `cluster:<label-slug>`; a full rebuild reuses an existing cluster's id and label when member-set Jaccard ≥ `insight.clusterCarryOverJaccard` (default 0.5; highest match wins, ties broken by id order). (§4.10.2, v2.0) **v3.0 note:** the exact cluster-representation and carry-over nuances for the rebuilt v3.0 `clusters.json` (§4.10.6) are addendum-deferred to the insight storage-format spec (design §10.3, §11 Q1; addendum A4.6, A10.1) — this decision's Jaccard-carry-over *principle* is the starting point, not yet re-locked for the new shape.

15. **"Stabilized" — promotion eligibility — is mechanical (OQ3 disposition):** ≥ `insight.promotionMinAgeDays` (default 14) in insight AND ≥ `insight.promotionMinObservations` (default 2) independent session observations — or one distil repetition detection (v2 design §6) — AND no correction since the last observation. (§4.10.4, §10.1, v2.0) **v3.0 note:** the v2.0 `promotion` mechanism this decision tuned (insight prose "stabilizing" into a gated artefact, with a promoted-trailer marker) has no v3.0 equivalent — `insight/` is no longer human-promotable prose (§4.10 is rebuilt wholesale). The `promotion` pulse-suggestion type is retained per addendum A7.4 — not repurposed for insight, whose v3.0 producer is archive ingestion instead (design §8.2); see §4.5.1.

16. **Correction tracking is a bottom `## Corrections` log, and corrections rewrite prose in place (OQ6 + OQ7 dispositions).** The correcting writer rewrites the contradicted text in place and appends the log entry in the same write; frontmatter stays lean. (§4.10.1, v2.0) **v3.0 note:** v2.0's prose `insight/map/*.md` files (and their `## Corrections` log) no longer exist; `check.insight-prose` is removed (Appendix A). The v3.0 per-file entry (§4.10.2) has no equivalent correction log — a session-observed correction to an insight entry is simply a direct rewrite of the relevant section, with `claude-sessions/*` provenance (A6) on the entry, per `cortex-loop-session-observe` (§9; addendum A7.3).

17. **Inferred-edge confidence enum is `high | medium | low`** — deliberately not Decision 7's provenance enum: every inferred edge is INFERRED by definition; what varies is inference strength. (§4.10.2, v2.0) **Superseded at v3.0** by Decision 25 (§0.2): the rebuilt `graph.json` (§4.10.6) uses a 4-tier `structural | stated | inferred | ambiguous` enum tied to evidence *kind*, not inference *strength* (addendum A10-5). This decision is preserved for historical continuity; it governs nothing at v3.0.

18. **Suggestion sections are typed, and the pulse gate gains edit semantics.** `**Type:**` is required (absent → `rule-candidate` with a warning, v1-era tolerance); an **edit** payload shape (current content + replacement, match-byte-exact-or-refuse) joins append and create; `Target:` roots extend beyond compass and new-skill paths to `.cortex/atlas/`, `.cortex/insight/`, and `RULES.md`, constrained per type. (§4.5; resolves v2 design flag F3) **v3.0 amendment:** the typed enum gains `decision-candidate` (target root `.cortex/atlas/decisions/`, addendum A7.4) — see §4.5.1.

19. **The §10.4 migration is waived for 1.0→2.0 only.** No external users; the Cortex repo itself moves as part of the v2 build. The policy stands in full for every future MAJOR. (§10.4; v2 design flag F5) **v3.0 confirmation:** no waiver applies at 2.0→3.0 — the migration policy of §10.4 applies in full; mechanics are owned by the module-migration spec (build-order-v3 step 2), per addendum A10.0.

20. **Left open, with landing sites:** rationale-sidecar vs committed rationale text (OQ4 — v2.0 concern, moot at v3.0 now that `graph.json` edges carry `evidence`, not `rationale`, and are rebuilt wholesale, §4.10.6); gaps-loop window semantics, watermark vs wall-clock (OQ5 — v2.0's `insight-gaps` is retired at v3.0, replaced by `cortex-loop-session-observe`, §9; window semantics for the new loop are a spec-pass detail, addendum A7.1); root SpecFlow artefacts moving under `.specflow/` (OQ8 — a later MINOR/MAJOR; they stay at the project root at 3.0).

### 0.2 Decisions locked at v3.0

Where `cortex-v3-design.md` explicitly left a concrete shape open beyond what it directed the addendum to specify, the addendum's disposition is adopted and **marked** here (addendum §A10.1, flags A10-1 through A10-7).

21. **Archive document-type schema shape (A10-1).** `archive/types/*.yaml` declares `id` / `label` / `classification{extensions,hints,explicit}` / `extraction{strategy,outputs[{kind,path,item_pattern}]}` (§4.4.2) — design §6.1/§6.3 left this "sketched, not specified"; the addendum specifies it here.

22. **Insight staleness ledger storage shape (A10-2).** Stored as `insight/ledger.json`, complementing the per-entry `built_at_commit`/`source_sha256` frontmatter on each per-file entry (§4.10.2, §4.10.4) — design §5.8/§5.9 required a shape and deferred it to the addendum.

23. **Insight reverse-dependency index storage shape (A10-3).** Stored as `insight/reverse-index.json` — a `referenced_by` map from entity node id to every concept/edge citing it (§4.10.5) — design §5.9 required a shape and deferred it to the addendum.

24. **`edge_type` enumerated closed set (A10-4).** `imports | calls | semantically-similar-to | implements-concept | co-clustered` (§4.10.6) — design §5.11 named the primitives, not the enum; extending the set is a MINOR bump.

25. **`confidence` discrete 4-tier enum (A10-5).** `structural | stated | inferred | ambiguous`, each tied to a named evidence type (§4.10.6) — deliberately differs from v2.0's `high | medium | low` (Decision 17), which graded inference *strength* on edges that were all INFERRED by definition; v3.0's tiers grade *kind of evidence*.

26. **`tags.json` structured vocabulary (A10-6).** A typed vocabulary with `tag.kind` enum `concern | technology | pattern | layer | domain-term` (§4.10.6) — design §1.3/§5.11 named "structured tags as a first-class store"; the vocabulary schema is chosen here.

27. **Insight node-id grammar (A10-7).** `file:<relpath>` / `element:<relpath>#<name>` / `concept:<slug>` — path-derived, deliberately distinct from v2.0's constellation-borrowed grammar (§4.10.6) — design §5.11 required "deterministic path-derived IDs"; the exact prefixes are chosen here.

**Explicitly deferred (not decided at v3.0, per addendum A10.1):** cluster-representation carry-over/stability nuances for the rebuilt `clusters.json` → insight storage-format spec (design §10.3, §11 Q1); confidence-aging threshold N and significance-triage tuning → insight-refresh loop spec; 2.0→3.0 migration mechanics → module-migration spec (§10.4, build-order-v3 step 2); v3.0 `cortex.config.json` blocks for `insight`/`archive` → their respective specs (§10.1); whether a v3.0 insight constellation preset is added → open (design §11 Q2, §4.9).

---

## 1. The `.cortex/` directory layout

`cortex init` creates this skeleton. Every directory MUST contain an `_index.md` active prompt (§7). `[committed]` / `[gitignored]` marks the default git policy (Decision 1); `archive/` mixes both per-artefact within the module (Decision 1 v3.0 amendment, §4.4).

```
.cortex/
├── cortex.config.json          [committed]   project config + schemaVersion (§10)
├── constellation.json          [gitignored]  compiled citation graph for the renderer (§4.9)
├── _index.md                   [committed]   root active prompt — names the five modules
├── compass/                    [committed]   rules, conventions, bug ledger (§4.1–4.2) — the renamed cerebrum
│   ├── _index.md
│   ├── preferences.md                        project conventions (stack, formatting)
│   ├── environment.md                        operational pointers — never secrets
│   ├── do-not-repeat.md                      index of recurring-mistake rules
│   ├── standing-authorities.md               default decisions Claude holds without asking
│   ├── conventions/                          project conventions (design §3)
│   ├── bugs/                                  the unified bug ledger
│   │   ├── _index.md
│   │   └── B-001-<slug>.md
│   └── rules/                                one file per rule
│       ├── _index.md
│       └── R-001-<slug>.md
├── atlas/                      [committed]   project knowledge base (§4.3)
│   ├── _index.md
│   ├── stakeholders/
│   │   ├── _index.md
│   │   └── <slug>.md
│   ├── decisions/                             the SOLE home for decisions (no compass/decisions.md, §4.3)
│   │   ├── _index.md
│   │   └── YYYY-MM-DD-<slug>.md
│   ├── domain/
│   │   ├── _index.md
│   │   └── <term>.md
│   └── sources/                [gitignored]  raw materials (may be sensitive)
│       ├── _index.md
│       └── <slug>.<ext>
├── archive/                    [mixed]*      ingested source documents + extractions (§4.4)
│   ├── _index.md               [committed]   active prompt (§7.1 shape)
│   ├── register.md             [committed]   human-readable index of all documents
│   ├── documents/
│   │   └── <slug>/
│   │       ├── source.<ext>    [gitignored]  verbatim source (*the mixed-policy exception)
│   │       ├── metadata.yaml   [committed]   per-document metadata (§4.4.1)
│   │       └── extracted/      [committed]   everything extracted from the source
│   └── types/                  [committed]   document-type schemas (§4.4.2)
├── insight/                    [committed]   inferred understanding of the codebase itself (§4.10) — anatomy absorbed
│   ├── _index.md                             active prompt (§7.4)
│   ├── scope-registry.yaml                   scope tree (scoped extractions only, §4.10.3)
│   ├── ledger.json                           staleness ledger (§4.10.4)
│   ├── reverse-index.json                    reverse-dependency index (§4.10.5)
│   ├── scopes/                               present only for scoped extractions
│   │   └── <scope>/
│   │       ├── anatomy/                      per-file entries within the scope
│   │       ├── concepts/                     scope-local concepts
│   │       └── graph.json                    scope-local semantic graph
│   ├── anatomy/                               per-file entries (unscoped extractions, or not owned by any scope)
│   ├── concepts/                              concepts (global, or scope-local under scopes/<scope>/)
│   ├── graph.json                            cross-scope/cross-file semantic graph (§4.10.6)
│   ├── tags.json                              global structured tag vocabulary (§4.10.6)
│   └── clusters.json                          global cluster assignments (§4.10.6)
└── pulse/                      [gitignored]  transient loop outputs (§4.5) + insight extraction plan/progress (§4.10.10)
    ├── _index.md                             active prompt (the ONLY _index.md here; subdirs are exempt, §7.1)
    ├── suggestions.md                        the gate — S-NNN proposals (persists)
    ├── dismissed.md                          rejection memory (persists)
    ├── reports/                              one .md per loop, overwritten each run (§4.5)
    ├── state/                                machine working state — counter, worklists, reads/<session-id> ledgers (§4.5)
    └── extraction/                           insight-extraction plan/progress/l1/fragments (§4.10.10)
```

`.cortex/anatomy/` and `.cortex/cerebrum/` no longer exist at v3.0. The five modules are atlas, compass, archive, insight, pulse (design §3). The two spec trees live under **`.specflow/`** at the project root (v2 design §9); the test tree stays directly at the project root. Neither lives under `.cortex/`: `.specflow/specs/`, `.specflow/specs-business/`, `tests/`. They are covered in §2 and §3.

**Validated by** `check.layout`: every directory listed above (when its module is present) exists and carries the required `_index.md`; `pulse/` (including its `reports/`, `state/`, `state/reads/`, `extraction/`, and `extraction/fragments/` subdirectories — machine-managed, `_index.md`-exempt per §7.1, resolving B-008) and `archive/documents/*/extracted/` contents beyond the fixed names are tolerated (transient/generated); `insight/`'s two layouts — scoped (with `scope-registry.yaml` + `scopes/`) and unscoped (flat `anatomy/`) — are both valid (§4.10.1). Every new-module check (`check.archive-*`, `check.insight-*`) tolerates its module being entirely absent, so a project that has not yet run archive ingestion or insight extraction still validates clean at schema 3.0.

---

## 2. `.specflow/specs/` and `.specflow/specs-business/` conventions

From design §8.1; re-rooted under `.specflow/` at v2.0 (v2 design §9, §2.3 below). Both trees are three conceptual levels: **domain → capability → leaf**. Only **leaf** specs are implementable. `.specflow/` contains exactly the two trees — no wrapper docs of its own.

### 2.1 Layout

```
.specflow/specs/                    # developer specs (implementation contract)
├── _index.md                       # ACTIVE PROMPT + dependency graph & build order (§7.2)
├── _overview.md                     # folder overview of the whole dev tree
└── <domain>/
    ├── _overview.md
    ├── <capability>/
    │   ├── _overview.md
    │   └── <leaf>.spec.md
    └── <leaf>.spec.md              # a leaf MAY sit directly under a domain (e.g. schema.validator)

.specflow/specs-business/           # business specs (user-outcome layer)
├── _overview.md
└── <domain>/
    ├── _overview.md
    └── <persona-journey>.business.md
```

### 2.2 Rules

- Every directory in **both** trees MUST contain an `_overview.md` (design §6; folder-overview format in §7.3). **Validated by** `check.overview-present`.
- The `.specflow/specs/` root additionally MUST contain `_index.md` (§7.2). **Validated by** `check.index-present`.
- Domain dirs: lowercase, hyphenated. Capability dirs: lowercase, hyphenated.
- Dev leaf files: `<leaf>.spec.md`. Business files: `<persona-journey>.business.md`, the name starting with the persona doing the action (business-spec template).
- **IDs follow the path within the tree.** `.specflow/specs/auth/registration/email-signup.spec.md` → `auth.registration.email-signup` — the `.specflow/specs/` tree root is stripped before deriving the ID, so IDs are unchanged by the v2.0 re-rooting. A leaf directly under a domain → `<domain>.<leaf>` (e.g. `schema.validator`). **Validated by** `check.id-matches-path`.
- Capability folders with leaves are RECOMMENDED; a leaf directly under a domain is permitted when the domain has a single cohesive unit. No per-leaf subfolders.

### 2.3 The v2.0 re-rooting (what changed, what didn't)

Moved at 2.0: `specs/` → `.specflow/specs/`; `specs-business/` → `.specflow/specs-business/`. `tests/` deliberately stays at the project root — test runners, CI globs, and coverage tooling assume root-level test paths (v2 design §9.1). The root SpecFlow artefacts (`RULES.md`, `build-order.md`, `link-map.md`, `implicit-behaviors.md`, `dead-features.md`) also stay at the project root (Decision 20 / OQ8).

**Invariant under the move:** spec IDs (path-derived within the tree, §2.2); every ID-form cross-reference (`depends_on`, `covers`, `governed_by`, `related_specs`); the `implements:`/`implemented_by:` relative paths (both trees moved together, so the relative geometry between them is identical); and `governs:` globs (project-root-relative pointers at *source* files).

**Changed:** every project-root-relative reference *to* the trees — validator, compiler, and loop discovery roots; the CLAUDE.md template (§8); skill instruction text. The mechanical path-constants rewrite across the specflow skills ships **in the reorganization round** (v2 design §9.4, flag-F4 resolution); the insight-query skill enrichment remains a separate follow-up pass.

**Migration:** none ships for 1.0→2.0 (Decision 19; §10.4 waiver). For schema completeness: a re-rooting under the normal policy would ship a `cortex migrate` move plus deprecation markers at the old roots per §10.4.

---

## 3. `tests/` tree layout

From design §8.2. Four layers. Test files are TypeScript (`*.test.ts`, per the project stack).

```
tests/
├── _overview.md
├── setup/                          # harness, container/db setup, smoke tests
├── fixtures/                       # factories + seeds
├── atomic/<domain>/<capability>/<leaf>.test.ts      # 1 per Given/When/Then, mocked
├── spec/<domain>/<capability>/<leaf>.test.ts        # 1 per dev leaf spec, integrated slice
├── journey/<business-domain>/<outcome>.test.ts      # 1 per business spec, real infra
└── scenario/
    ├── specs/<name>.md             # scenario spec: frontmatter `covers:` (§4.8)
    └── <name>.test.ts              # full-sandbox cross-journey test
```

| Layer | Scope | Infra | Count | Verifies |
|---|---|---|---|---|
| Atomic | 1 criterion | Mocked | 1 per Given/When/Then | One behaviour in isolation |
| Spec | 1 dev spec | Integrated slice | 1 per dev leaf | Rule interactions, entity writes, completeness (not criteria replay) |
| Journey | 1 business spec | Real containers | 1 per business spec | End-to-end user journey |
| Scenario | Many business specs | Full sandbox | Enough to cover all | Cross-journey workflows |

- The **schema validator** checks: scenario specs carry a well-formed `covers:` whose entries resolve (§4.8). **Validated by** `check.covers-resolves`.
- The **coverage-completeness** constraint (every business spec appears in ≥1 scenario's `covers:`) is **out of schema scope** — owned by `specflow-verify` (Decision 4).
- `verification.md` is written to `.cortex/pulse/reports/`, **not** `tests/` (design §8.5).
- `tests/` remains at the **project root** — deliberately not moved under `.specflow/` (§2.3).

---

## 4. Frontmatter contracts per file type

All artefacts that carry frontmatter use a leading `---`-delimited YAML block. Unknown fields are a `warning` (forward-compat tolerance), missing required fields an `error`. Field types: `string`, `enum`, `list<T>`, `path` (relative path string), `id` (bare dot/dash ID), `glob`, `int`, `iso-datetime`, `sha256` (64 hex chars).

### 4.1 `compass/rules/R-NNN-<slug>.md`

**Required:** `id` (`R-NNN`), `title` (string), `source` (list<path> — atlas decisions, bug files, and/or [v2.0-legacy] insight prose files justifying the rule; the insight-prose form referenced the v2.0 `promotion` lineage, §4.5.1, which has no v3.0 insight equivalent — see §4.10 note), `governs` (list<glob> — project file paths the rule applies to). **Optional:** `related_specs` (list<id>), `confidence` (enum `STATED|EXTRACTED|INFERRED`, default `STATED`), `check` (the machine-checkable predicate, below), `status` (enum `active|retired`, default `active`), `provenance` (list<{derives_from: path}> — this rule's derivation from an archive document, an atlas decision, or a Claude Code session; optional, absence means "authored directly"; §6, addendum A6).

**`check` predicate** (optional; the testable subset of a rule):
```yaml
check:
  kind: regex | grep | ast | none      # default none
  applies_to: <glob>                    # files the check runs over (defaults to governs)
  pattern: <string>                     # regex / grep / tree-sitter query
  expect: absent | present              # whether pattern presence is a pass or a violation
```

```markdown
---
id: R-014
title: No camelCase database columns
source:
  - ../../atlas/decisions/2026-04-12-db-naming.md
  - ../bugs/B-031-camelcase-column.md
governs:
  - "src/db/**/*.ts"
related_specs:
  - core-cli.scan
confidence: EXTRACTED
check:
  kind: regex
  applies_to: "src/db/**/*.ts"
  pattern: "\\b[a-z]+[A-Z][a-zA-Z]*\\s*:\\s*(text|integer|boolean)"
  expect: absent
---

# R-014 — No camelCase database columns

Columns MUST be snake_case. … (body: rationale, examples, exceptions)
```

A rule MAY additionally carry `provenance:` (§6, addendum A6) when it derives from an archived source document or a Claude Code session — distinct from `source:` above, which cites the atlas decision/bug that motivates the rule's *content*. A rule deriving from a decision cites it via `provenance: - derives_from: atlas/decisions/<slug>.md` rather than restating it (§4.3).

**PreWrite consumption note.** The PreWrite hook (§5) consumes rules in two modes: a rule with an evaluable `check:` predicate (`regex`/`grep`) warns **only when the predicate fires** on the proposed content; a rule without one (`check` absent, or `kind: none`/`ast`) warns **on `governs` path match**. Authors: give a rule an evaluable predicate whenever the constraint is mechanically checkable — it eliminates path-match noise on conforming writes.

**Validated by** `check.rule`: `id` matches `R-NNN` and filename; `source` paths resolve (§6); `governs` globs well-formed; `related_specs` IDs resolve; if `check` present, `kind` in enum and (`pattern` required unless `kind: none`); if `provenance` present, each entry resolves per `check.provenance` (§6, addendum A6).

### 4.2 `compass/bugs/B-NNN-<slug>.md`

The one-file-per-bug ledger (design §4.2, §2 seven-type taxonomy).

**Required:** `id` (`B-NNN`), `title` (string), `type` (enum, below), `severity` (enum `critical|high|medium|low`), `status` (enum `open|triaged|resolved`), `affects` (list — spec IDs, file paths, or rule IDs; resolution by shape, §6). **Optional:** `proposed_fix` (string), `opened` (iso-datetime), `resolved` (iso-datetime), `related_specs` (list<id>).

**`type` enum (the seven types, design §2):**

| value | design type |
|---|---|
| `missing-criterion` | 1. dev spec exists but lacks an AC for this case |
| `incomplete-rule` | 2. a rule is stated but doesn't cover the behaviour |
| `wrong-rule` | 3. a rule is wrong as written |
| `missing-dev-spec` | 4. no dev spec covers this case |
| `missing-business-spec` | 5. no business spec captures the outcome |
| `layer-drift` | 6. dev/business specs contradict, or impl drifted from spec |
| `test-defect` | 7. spec is right; the test layer is the problem |

```markdown
---
id: B-031
title: camelCase column slipped into migrations
type: wrong-rule
severity: medium
status: triaged
affects:
  - R-014
  - src/db/schema.ts
proposed_fix: Tighten R-014 check to cover migration files.
opened: 2026-06-28T09:00:00Z
---

# B-031 — camelCase column slipped into migrations

(body: diagnostic evidence, reproduction, the chain that broke)
```

**Validated by** `check.bug`: `id` matches `B-NNN` and filename; `type`/`severity`/`status` in enum; every `affects` entry resolves by shape (R-ID → rule, path → file, else → spec ID).

### 4.3 Atlas artefacts

All atlas leaf files carry minimal frontmatter. **Common optional:** `confidence` (enum, §4.1 of decisions), `related_specs` (list<id>), `sources` (list<path> into `atlas/sources/`).

- **`atlas/decisions/YYYY-MM-DD-<slug>.md`** — **the sole home for decisions** (`compass/decisions.md` does not exist, addendum A2.1). **Required:** `id` (`decision.<YYYY-MM-DD>-<slug>`), `title`, `date` (iso-datetime). **Optional:** `supersedes` (list<path>), `compass_rules` (list<id> — rules derived from this decision; the forward half of the citation, the rule's `provenance` being the backward half, addendum A2.2), `provenance` (list<{derives_from: path}> — this decision's own derivation from an archive document or a Claude Code session; optional), plus the common optionals. Body: the narrative ("on DATE we chose X because Y — see source Z"). A compass rule deriving from a decision does **not** restate it — it cites it via the rule's own `provenance` field (§4.1).
- **`atlas/stakeholders/<slug>.md`** — **Required:** `id` (`stakeholder.<slug>`), `name` (string), `role` (string). **Optional:** `org`, `contact_pointer` (a pointer, never a secret), common optionals.
- **`atlas/domain/<term>.md`** — **Required:** `id` (`domain.<term>`), `term` (string), `definition` (string). **Optional:** `aliases` (list<string>), `related_specs`.
- **`atlas/sources/<slug>.<ext>`** — raw material; **no frontmatter required** for non-markdown. A sibling `<slug>.meta.md` MAY carry `id` (`source.<slug>`), `kind` (enum `transcript|rfp|slack|pdf|design-doc|other`), `captured` (iso-datetime), `origin` (string). (v3.0 note: new ingestion through `archive/` — §4.4 — is the preferred path going forward for anything with a declared document type; `atlas/sources/` remains valid for ad hoc captures, addendum A9 build-order step 9 re-homes the atlas-only `cortex-ingest` skill into `archive/` later.)

**Validated by** `check.atlas`: `id` matches the per-kind pattern and the filename; `date`/`captured` ISO; `supersedes`/`sources` paths resolve; `compass_rules`/`related_specs` IDs resolve; if `provenance` present, each entry resolves per `check.provenance` (§6, addendum A6).

### 4.4 The `archive/` module (new at v3.0)

Design §6. Ingested source documents and the structured content extracted from them. Git policy is **mixed within the module** (Decision 1 v3.0 amendment): `_index.md`, `register.md`, `documents/*/metadata.yaml`, `documents/*/extracted/`, and `types/` are `[committed]`; `documents/*/source.*` is `[gitignored]` (raw source may be sensitive — same treatment as `atlas/sources/`, design §6.6).

Layout (full tree in §1):

```
.cortex/archive/
├── _index.md                              [committed]  active prompt (§7.1 shape)
├── register.md                            [committed]  human-readable index of all documents
├── documents/
│   └── <slug>/
│       ├── source.<ext>                   [gitignored] verbatim source (pdf/md/docx/txt/…)
│       ├── metadata.yaml                  [committed]  machine-readable per-document metadata (§4.4.1)
│       └── extracted/                     [committed]  everything extracted from the source
│           ├── <output-kind>/…                          per the document type's extraction contract (§4.4.2)
│           └── summary.md
└── types/                                 [committed]  document-type schemas (§4.4.2)
    ├── client-spec.yaml
    ├── contract.yaml
    ├── meeting-transcript.yaml
    └── …
```

Superseded document versions are **preserved, not deleted** — kept as sibling `documents/<slug>/` directories with `metadata.yaml` `status: superseded` (design §6.2, §6.5). `<slug>` is lowercased-hyphenated, unique within `documents/`. `register.md` is free markdown (no frontmatter contract beyond §4.5's general pulse-adjacent header conventions do not apply here — it is a committed, human-maintained index, not a transient loop report). `archive/_index.md` follows the general §7.1 active-prompt shape; no dedicated filled example is given here (mirrors how `atlas/` has none) — **validated by** `check.index-shape`.

**Validated by** `check.archive-layout`: every `documents/<slug>/` carries a `source.*`, a `metadata.yaml`, and an `extracted/` directory; `_index.md` and `register.md` present; `types/` present.

#### 4.4.1 `archive/documents/<slug>/metadata.yaml`

A standalone YAML file (not markdown frontmatter — it is machine-readable metadata, per design §6.2).

```yaml
id: archive.<slug>                 # required — archive.<slug>, matches the directory
kind: <type-id>                    # required — an id declared in archive/types/ (§4.4.2)
ingested_at: <iso-datetime>        # required
version: <string>                  # required — the document's own version label (e.g. "v2.0", "2026-01-08")
status: active | superseded        # required
supersedes:                        # optional — path(s) to prior versions under documents/
  - documents/<prior-slug>/
source_filename: <string>          # optional — the original filename of source.<ext>
origin: <string>                   # optional — provenance of the source (who sent it, where from)
```

**Validated by** `check.archive-metadata`: `id` matches `archive.<slug>` and the directory; `kind` resolves to a `types/<kind>.yaml`; `ingested_at` ISO; `version` and `status` present; `status` in enum; `supersedes` paths resolve.

#### 4.4.2 `archive/types/*.yaml`

Design §6.1/§6.3 left this sketched, not specified. This schema specifies a concrete minimal shape (Decision 21 / addendum A10-1): a type file declares a **type id**, **classification hints** the ingestion skill routes on, and the **extraction-output contract** the type produces. Adding a document type means adding a `types/<id>.yaml`, never editing the `cortex-archive-ingest` skill (design §6.1, extensibility invariant).

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

### 4.5 `pulse/` artefacts

Transient; gitignored. `pulse/` is organised into three machine-managed subdirectories plus the two persistent gate files at its root:

```
pulse/
├── _index.md                    the only _index.md here — subdirs are exempt (§7.1, B-008)
├── suggestions.md               the gate — S-NNN proposals (persists across runs)
├── dismissed.md                 rejection memory (persists across runs)
├── reports/                     one .md per loop, overwritten each run
│   ├── hygiene.md  bug-triage.md  spec-drift.md  insight-refresh.md
│   ├── session-observe.md  rule-candidates.md  atlas-review.md
│   ├── scaffolding-review.md  lint.md  verification.md  test-failures.md
│   └── hook-errors.md           append-not-overwrite, capped at 100 (§4.5.2)
├── state/                       machine working state (dotfiles → dots dropped)
│   ├── suggestion-counter       the single authoritative S-NNN allocator
│   ├── distil-last-run  session-corpus.json  session-observe-state.json
│   ├── *-worklist.json          per-loop worklists (triage / session-observe / insight-refresh tiers)
│   ├── readback-applied
│   └── reads/<session-id>       per-session read ledgers (hygiene deletes those >14 days old)
└── extraction/                  insight-extraction (§4.10.10)
    ├── plan.md  progress.md  l1.json
    └── fragments/<scope-id>.json
```

`suggestions.md` and `dismissed.md` stay at the pulse root; every loop report lands under `reports/`; all machine working state lands under `state/`; the insight-extraction artefacts land under `extraction/`. The three subdirectories are machine-managed and do NOT carry their own `_index.md` (§7.1 carve-out, resolving B-008 — only `pulse/` itself has one). `cortex init` scaffolds `reports/`, `state/`, `state/reads/`, and `extraction/` empty on day one so the organised layout exists before any loop runs; upgrading an existing flat `pulse/` renames the live artefacts into these subdirectories and **deletes** known orphans from retired loops (e.g. `.purpose-worklist.json` from the retired anatomy-refresh-deep loop) rather than moving them.

Each loop output is markdown with a minimal header. **Always-write convention:** every loop writes its output file on **every** run, overwriting, with a fresh `generated` timestamp — when there is nothing to report, the body carries an explicit "No candidates this cycle." (or loop-appropriate phrasing) rather than an empty or untouched file. The pulse directory is thereby self-documenting: any `pulse/reports/*.md` tells the reader when its loop last ran and what it found or didn't. **Required:** `kind` (string const, e.g. `pulse-hygiene-report`, `pulse-suggestions`, `pulse-rule-candidates`, …), `generated` (iso-datetime), `loop` (string — the skill that wrote it). Suggestion entries inside `suggestions.md` use `S-NNN` IDs.

`dismissed.md` **persists** (rejection memory, design §10.3): one entry per dismissed `S-NNN`, with `dismissed` (iso-datetime) and `expires` (iso-datetime, default +90 days). **Validated by** `check.pulse` (header present; loose otherwise — transient data is not held to artefact-grade rigor).

**Retention (`state/reads/`).** The per-session read ledgers under `pulse/state/reads/<session-id>` accumulate one file per session; the hygiene loop deletes any whose mtime is older than a retention window (default **14 days**) and reports the count deleted. The 14-day window is currently in-code (`READS_RETENTION_DAYS` in `src/pulse/hygiene.ts`) and flagged as a future `cortex.config.json` key (`pulse.readsRetentionDays`, §10.1) — not yet a config option. No other `state/`, `reports/`, or `extraction/` file is subject to age-based deletion; those are overwritten in place by their owning loop.

**Suggestion entries — single S-namespace across all pulse artefacts.** `S-NNN` ids form **one global namespace** shared by every proposal-writing loop, allocated monotonically via the counter file `pulse/state/suggestion-counter` (a plain integer; persists like `dismissed.md`; ids are never reused). Proposal sections may appear in **any** `pulse/reports/*.md` loop report (and in `suggestions.md` at the pulse root) — the review CLI discovers them by scanning all of them; the id is a handle, not metadata, so users never need to know which loop proposed what. Each section carries provenance in its own field lines. A duplicate `S-NNN` across files is a hard error at review time.

**Suggestion section shape:** one `## S-NNN: <title>` section per suggestion. Required field lines inside each section:

- `**Type:**` — one of `rule-candidate | skill-proposal | promotion | gated-layer-update | user-directed-capture | decision-candidate` (§4.5.1). Absent → treated as `rule-candidate` with a `warning` (v1-era tolerance; v1 reports carried no type). **Validated by** `check.pulse`.
- `**Source:**` — provenance: the proposing loop plus its evidence pointer (session ids, or the report that motivated it). For `promotion`, MUST include the insight file being promoted.
- `**Target:**` — a project-relative path whose permitted root depends on `**Type:**` (§4.5.1 table). Across all types the union of permitted roots is `.cortex/compass/`, `.cortex/atlas/` (including `.cortex/atlas/decisions/` for `decision-candidate`), `.cortex/insight/`, `RULES.md`, and — for `skill-proposal` only — a **new** `.claude/skills/<name>/SKILL.md` path. Existing skill files are never overwritable via accept.
- The **payload**, in one of three operation shapes (§4.5.2): `**Proposed addition:**` (append), `**Proposed edit:**` (replace an exact byte-range of the target), or `**Proposed file:**` (create a new file). Exactly one payload shape per section.

**Fence grammar (nested payloads — resolves B-003).** A payload containing code fences MUST be wrapped in an outer fence **strictly longer** than any fence it contains (CommonMark longer-fence rule: four-plus backticks around a payload with triple-backtick fences). Writers inspect the payload and choose the outer length automatically; the parser honours the opening fence's length and closes only on a fence of at least that length. Accept round-trips the payload **byte-exact**, fences included.

**Counter authority.** `pulse/state/suggestion-counter` is the single authoritative id allocator: every loop that emits proposal sections MUST acquire ids from it (via the shared allocator) — never allocate locally, never reuse. Optional: `**Status:** pending | accepted | rejected` (absent = `pending`); free evidence lines (pattern, occurrences, source sessions, confidence) are unconstrained. The review CLI parses exactly these fields; accept applies the payload per its operation shape (§4.5.2).

#### 4.5.1 Suggestion types (v3.0)

The six types, their permitted `**Target:**` roots, their producers, and their accept semantics. A `**Target:**` outside the permitted root for its type is a `check.pulse` `error`.

| `**Type:**` | Producer(s) | Permitted target root | Payload shape | On accept |
|---|---|---|---|---|
| `rule-candidate` | distil, rule-decay | `.cortex/compass/` | append | append the block to the target (v1 behaviour, unchanged) |
| `skill-proposal` | skill-suggest | new `.claude/skills/<name>/SKILL.md` | create | write the new skill file (never overwrite an existing one) |
| `promotion` | v2.0: `insight-gaps` (retired); v3.0: **archive ingestion** — proposes new gated compass/atlas content drafted from an ingested document (design §8.2; the producer's exact trigger conditions are owned by the archive ingestion skill spec, design §10.3) | `.cortex/compass/`, `.cortex/atlas/`, `RULES.md` | append **or** create | apply the payload to the gated target, inject a `source:` back to the originating artefact; **the v2.0 "mark the insight original promoted" trailer (§4.10.4, v2.0) has no v3.0 equivalent** — a v3.0-derived promotion would cite its origin via `provenance:` (§6, A6) instead |
| `gated-layer-update` | v2.0: `insight-gaps` signal 4-gated (retired); v3.0: **archive ingestion** — edits an existing gated rule/decision when a superseded document's replacement changes it (design §8.2; producer's exact trigger conditions owned by the archive ingestion skill spec, design §10.3) | `.cortex/compass/`, `.cortex/atlas/`, `RULES.md` | **edit** | replace the named byte-range in the target (§4.5.2); a correction to existing gated content is an edit, not an append |
| `user-directed-capture` | any skill/loop capturing an explicit user directive (v2.0: `insight-gaps` signal 5) | `.cortex/compass/`, `.cortex/atlas/`, `.cortex/insight/`, `RULES.md` | append or create | apply to the target the user confirmed; the proposed `**Target:**` is the loop's best guess and is **human-editable before accept** (v2 design §5) |
| `decision-candidate` (new at v3.0) | `cortex-loop-session-observe` | `.cortex/atlas/decisions/` | append or create | parallel to `rule-candidate` in shape and fields (same typed pulse-gate payload, same `S-NNN` counter, same dismissed/suppression machinery); proposes a new decision drafted from an in-session observation (design §9; addendum A7.4) |

Notes: `promotion` and `gated-layer-update` are retained per addendum A7.4 — not repurposed for insight (insight enrichment is now a direct, ungated write by the insight-refresh loops and `cortex-loop-session-observe`, §4.10, §9; addendum A7.3, not a proposal) — but they are not orphaned: design §8.2 names **archive ingestion** as their v3.0 producer, reusing this same salvaged gate for downstream change plans (`promotion`-shaped append/create for brand-new gated content; `gated-layer-update`-shaped edit when a superseded document changes existing content). Which document conditions trigger which type is a spec-pass detail owned by the archive ingestion skill spec (design §10.3), not yet specified by this schema. `user-directed-capture` remains the only type that MAY target `.cortex/insight/`, because an explicit "remember this" deserves explicit confirmation of *where* it landed even when the landing is ungated. `decision-candidate`'s permitted root is `atlas/decisions/` specifically (not all of `atlas/`), since it targets exactly the sole-home decisions directory (§4.3).

#### 4.5.2 Payload operation shapes (v2.0/v3.0, unchanged)

Every suggestion carries exactly one of three payload shapes. All fenced blocks obey the longer-fence grammar above (byte-exact round-trip).

- **`**Proposed addition:**`** (append) — a fenced block appended to the target verbatim. The target file MUST already exist. This is the v1 shape; unchanged.
- **`**Proposed file:**`** (create) — a fenced block written as the full contents of a **new** file at `**Target:**`. Accept refuses if the target already exists (no clobber).
- **`**Proposed edit:**`** (edit — new at v2.0) — resolves flag F3's append-only limitation. The section carries two fenced blocks, labelled by their opening line:
  - a `current:` block — the exact text to be replaced, which accept locates in the target and which MUST match **byte-exact** (accept **refuses** and reports if it does not — the target drifted since the proposal was written);
  - a `replacement:` block — the text to substitute for it.
  Accept replaces the single located occurrence. A `current:` block that resolves to zero or >1 occurrences is a hard refusal (ambiguous or stale). The edit operation is what makes `gated-layer-update` (a correction to an existing rule/decision) expressible.

Accept is **transactional per suggestion**: a refusal (byte-mismatch, clobber, ambiguous edit) applies nothing and leaves the suggestion `pending`.

**`dismissed.md`** (`kind: pulse-dismissed`) holds one `## S-NNN` section per rejection with `**Dismissed:**` (iso-datetime) and `**Expires:**` (iso-datetime; default now + `pulse.dismissedWindowDays`, 90). `pulse-list` hides unexpired dismissed ids; expired ones may resurface.

`reports/hook-errors.md` (`kind: pulse-hook-errors`) is the hooks' degradation log (§5): hooks **append** one structured entry per internal error (hook name, file involved, failure, iso-datetime), capped at the most recent 100 entries. Unlike loop reports it is append-not-overwrite; like everything in `pulse/` it is transient and surfaced by hygiene.

### 4.6 Developer specs — `.specflow/specs/**/*.spec.md`

From the dev-spec template. **Required (leaf):** `id` (matches path), `status` (enum `draft|implementing|implemented`), `implements` (exactly one `path` to a business spec). **Required (all):** `id`, `status`. **Optional:** `depends_on` (list<id> — dev-spec IDs), `governed_by` (list<id> — compass rule IDs, design §8.4), `governs` (list<glob> — project files this spec governs; v2.0 fed anatomy's `spec_links` column; anatomy is removed at v3.0 and this role moves to insight's **Connections** section instead, design §5.10, addendum A1.6. **Semantics are deliberately identical to the compass-rule `governs` field (§4.1)** — same glob syntax, project-root-relative resolution, 0 on-disk matches → `warning`. The only divergence is optionality: required on rules because a rule without governed files is meaningless, optional on dev specs because a draft spec may legitimately precede the files it governs), `provenance` (list<{derives_from: path}> — this spec's derivation from an archive document or a Claude Code session; optional, absence means "authored directly"; §6, addendum A6). **Domain/capability specs:** `implements` is optional; `depends_on` allowed on capability specs.

```yaml
---
id: schema.validator
status: draft
depends_on: []
implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md
governed_by: []
---
```

Body sections (design §8.1): Intent, Entities (READS/WRITES/CREATES — references only, never schema definitions), Rules (numbered), Acceptance Criteria (Given/When/Then, concrete values), Notes (OPEN: items). **Validated by** `check.dev-spec`: `id` matches path; `status` in enum; on leaves, `implements` present, single-valued, resolves, and is symmetric (§6); `depends_on` IDs resolve and form no cycle; `governed_by` IDs resolve; `governs` globs well-formed (on-disk resolution: `check.dev-spec-governs-resolves`, warning); if `provenance` present, each entry resolves per `check.provenance` (§6, addendum A6).

### 4.7 Business specs — `.specflow/specs-business/**/*.business.md`

**Required:** `id` (`<domain>.<outcome-slug>`, bare, globally unique), `status` (enum `draft|implementing|implemented`), `implemented_by` (list<path> to dev specs). **Optional:** `depends_on` (list<id> — business-spec IDs), `provenance` (list<{derives_from: path}> — this spec's derivation from an archive document or a Claude Code session; optional, absence means "authored directly"; §6, addendum A6).

```yaml
---
id: schema.knowledge-stays-consistent
status: draft
implemented_by:
  - ../../specs/schema/validator.spec.md
---
```

Body sections: Outcome, Who This Is For, User Journey, Business Rules, Success Metrics, Out of Scope, Notes. **No schemas, APIs, or Given/When/Then** (business-spec template). **Status policy (Policy A, mechanical).** A business spec's `status` is `implemented` when **every** dev spec in its `implemented_by:` list has `status: implemented`; until then it stays `draft`/`implementing`. A business spec whose implementers are all implemented but whose own status lags is flagged by `check.business-status` (warning). *Policy B — "implemented when a passing journey test exists" — is the v1.1 target once the test-runner loop ships; Policy A is deliberately the weaker, mechanically-available stand-in until then.*

**Validated by** `check.business-spec`: `id` matches path and is globally unique; `implemented_by` paths resolve and are symmetric (§6); body contains no fenced code / HTTP-verb / `Given`-`When`-`Then` markers → `warning` (drift into dev territory); if `provenance` present, each entry resolves per `check.provenance` (§6, addendum A6).

### 4.8 Scenario test specs — `tests/scenario/specs/<name>.md`

**Required:** `name` (string, matches filename), `covers` (list<id> — business-spec IDs). **Optional:** `description`.

```yaml
---
name: new-player-first-booking
covers:
  - auth.secure-account-access
  - booking.reserve-and-pay
---
```

**Validated by** `check.covers-resolves`: `name` matches filename; every `covers` ID resolves to a business spec (§6). (Completeness is `specflow-verify`, Decision 4.)

### 4.9 `constellation.json` (compiler output)

The compiled citation graph the constellation renderer serves (design §12.8). Emitted by the constellation compiler (invoked by `cortex scan`). Regenerable; gitignored (Decision 1). Read-only for every consumer.

**Top-level shape (all fields required):**

```json
{
  "schemaVersion": "3.0",
  "generated": "2026-07-02T14:00:00Z",
  "groups": [
    { "id": "compass", "label": "Compass",
      "children": [{ "id": "compass:rules", "label": "rules" }, { "id": "compass:bugs", "label": "bugs" }] }
  ],
  "nodes": [
    { "id": "rule:R-014", "module": "rule", "label": "R-014",
      "group": "compass:rules", "ref": "R-014" }
  ],
  "edges": [
    { "from": "spec:schema.validator",
      "to": "business:schema.contributor-trusts-project-knowledge",
      "kind": "implements" }
  ],
  "counters": { "compass": 5, "atlas": 0, "specs": 10,
                "edges": 42, "droppedRefs": 0 }
}
```

**Groups** are the Level-1 constellations (design §12.3, re-rooted at v3.0): **`compass`, `atlas`, `specs`** — exactly three top groups (v2.0 had four, including `anatomy`; anatomy no longer emits nodes, having been removed and absorbed into `insight`, which stays out of `constellation.json` entirely per the curated/inferred split below), each with children by natural grouping — compass by category (`rules`, `bugs`, core files), atlas by subfolder, specs by domain folder (dev and business nodes share the domain child; `module` distinguishes them). *(v3.0 interpretive note: the addendum's explicit supersession of this section (A1.4, A4.6 note) covers the `cerebrum`→`compass` rename and the dropped insight preset; dropping `anatomy` as a group/node kind is this schema's own necessary consequence of `anatomy/`'s removal (addendum A7.3) — not a separately-numbered addendum clause. Flagged for review.)*

**Nodes:** `id` is module-prefixed and globally unique — `rule:R-NNN`, `bug:B-NNN`, `compass:<file>`, `atlas:<artefact-id>`, `spec:<dev-id>`, `business:<business-id>`. `module` is one of `rule | bug | compass | atlas | spec-dev | spec-business` (v2.0's `anatomy` module value is removed). `group` names a declared group/child id. `ref` is the underlying path or artefact id. When a node's source artefact has no schema-defined ID, its `ref` is the artefact's path relative to the project root — this applies to the compass core files (`preferences.md`, `environment.md`, `do-not-repeat.md`) and to any other artefact class that lacks IDs by design. `size` (optional) carries a token estimate on nodes where available (v2.0 used this only for anatomy nodes; v3.0 has none — reserved for future use, e.g. large spec files).

**Edges** come from the §6 citation graph only — never from `insight/graph.json`'s imports/semantic edges (design §12.7: the constellation is the *curated* citation graph, not raw code structure or inferred understanding). `kind` names the frontmatter field that produced the edge (`implements`, `depends_on`, `governs`, `governed_by`, `source`, `related_specs`, `covers`, `compass_rules`, `supersedes`, `sources`, `provenance`). The v2.0 `spec_links` (anatomy → dev specs) edge kind is removed with anatomy (§6). The symmetric `implements`/`implemented_by` pair dedupes to a single `implements` edge. A reference that does not resolve to an emitted node is **dropped and counted** in `counters.droppedRefs` — the compiler is tolerant; complaining about broken refs is the validator's job.

**Determinism:** groups, nodes, and edges are sorted (stable order); two compilations of identical input are byte-identical except `generated`.

**Insight preset (resolved at v3.0 build-order step 10; `constellation.insight-preset-v3`).** The v2.0 insight preset (a constellation overlay over `insight/map/graph.json`'s node/edge set) stays **dropped** — that node set no longer exists (`insight/` is rebuilt wholesale, §4.10, addendum A4.6 note). Design §11 Q2 ("whether v3 adds a new insight preset … or the constellation stays curated-only") is **resolved: yes** — a fourth preset, `?preset=insight`, composes the new code-understanding graph (`insight/graph.json`/`clusters.json`, §4.10.6) at **serve time only**, architecturally simpler than the dropped v2.0 design: it renders the insight graph as its own self-contained map rather than joining it onto the curated node set, and it never reads `constellation.json` at all (a missing curated map never blocks it, and vice versa). `constellation.json` stays **curated-only** regardless: its shape and byte-determinism contract are unchanged by this preset, and it never contains inferred edges or clusters. The minimal composition contract, at the schema layer: absent or empty insight data (no `.cortex/insight/`, or an empty `graph.json`) yields an empty result (200), never an error; every insight edge renders **dashed**, unconditionally, with `confidence` (§4.10.6's four-tier enum) driving only opacity/weight, never the dashed-vs-solid distinction itself; a node/edge may additionally surface anatomy `## Purpose` text (for `file` nodes) for the renderer's detail panel, read at request time from the same per-file entries §4.10.2 defines. The full contract (composition shape, per-kind detail fields, rendering rules) is specified by `constellation.insight-preset-v3`, not repeated here.

**Validated by** `check.constellation` (only when the file exists): valid JSON; all required top-level keys; node ids unique; every node `group` resolves to a declared group/child id; every edge endpoint resolves to an emitted node id; `module` in enum (`rule | bug | compass | atlas | spec-dev | spec-business`).

### 4.10 The `insight/` module (v3.0 — rebuilt wholesale)

Design §5, §5.8. **The entire v2.0 `insight/map/` contract (v2.0 §4.10 and its subsections) is superseded.** v3.0 insight is a leveled, scoped, per-file understanding of the *source code itself*, not a concept-map over the curated artefact set (design §8.3). It remains **ungated** (§4.10.0).

**The trust contract (carried forward, unchanged in substance).** Insight is inferred, not curated: **context, not authority.** Where insight conflicts with a compass rule or a spec, the gated layer wins. It never carries write-time enforcement authority (no PreWrite reads insight, §5) and no hook injects it (a CLAUDE.md directive, not a hook, §8). Committed in full (Decision 1's fourth git-policy quadrant: machine-owned **and** committed).

#### 4.10.1 Two layouts — scoped and unscoped

Chosen by whether the extraction scoped. The query layer (§4.10.8) hides the difference.

**Scoped extraction (large codebases):** the layout under `insight/` shown in §1 — `_index.md`, `scope-registry.yaml`, `ledger.json`, `reverse-index.json`, `scopes/<scope>/{anatomy/, concepts/, graph.json}`, and top-level `anatomy/`, `concepts/`, `graph.json`, `tags.json`, `clusters.json` for content not owned by any scope, plus cross-scope aggregates.

**Unscoped extraction (small codebases):** the same, minus `scope-registry.yaml` and `scopes/`; all per-file entries live under top-level `anatomy/` (path mirrors source, e.g. `anatomy/src/auth/session.ts.md`).

The `anatomy/` **sub-directory name** preserves continuity with what v1's `.cortex/anatomy/` held (the file-level structural artefact), now living *inside* insight (design §5.8, §5.10). **Validated by** `check.layout` (the old `map/` layout and its `check.insight-ownership` are removed — insight's write-lane discipline in v3.0 is enforced per-loop, not by a single shared-directory rule, addendum A7.3).

#### 4.10.2 The per-file understanding entry

L3 produces a rich entry per centrality-important file; smaller/peripheral files get a **lighter L2-only entry** (Purpose + Connections). One entry per *source file* (design §5.11 LEAVE: not one file per node). Path mirrors the source under `anatomy/` (or `scopes/<scope>/anatomy/`).

**Frontmatter — required:** `path` (project-relative source path), `extracted_at` (iso-datetime), `extraction_level` (int `2 | 3`), `size_lines` (int), `size_tokens` (int), `centrality` (enum `high | medium | low`), `built_at_commit` (string — the commit at extraction; the per-entry half of the staleness ledger, §4.10.4), `source_sha256` (sha256 — hash of the *source file body*, not the entry frontmatter; §4.10.4, design §5.11 "hash-the-body-not-the-frontmatter").

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

**Section contract (L3 entry):** `## Purpose`, `## Main players` (named atomic elements with line ranges and importance — the source the `element` query reads, §4.10.8; elements are a byproduct of L3, not a separate pass), `## Insights` (non-obvious observations, conventions, quirks), `## File map` (only above ~500 lines; line-range → section), `## Connections` (`Uses:` / `Used by:` / `Semantically related (not imports):`), `## Query pointers` (intent-scoped "if you need to X, also read Y"). An **L2 (lighter) entry** carries `## Purpose` and `## Connections` only, with `extraction_level: 2`.

`cortex-loop-session-observe` (§9) writes ungated observations directly into a per-file entry's `## Insights` and `## Query pointers` sections, carrying `claude-sessions/<user>/<id>` provenance (§6, addendum A6) — there is no separate corrections log at v3.0 (Decision 16 note): a correction is a direct in-place rewrite of the relevant section.

**Validated by** `check.insight-entry` (replaces v2.0's `check.insight-prose`): required frontmatter present and typed; `extraction_level` in `{2,3}`; `centrality` in enum; `source_sha256` 64-hex; an L3 entry (`extraction_level: 3`) carries `## Purpose`, `## Main players`, `## Connections` at minimum; an L2 entry carries `## Purpose` and `## Connections`. `## File map` absent below the size threshold is not an error.

#### 4.10.3 `scope-registry.yaml`

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

#### 4.10.4 The staleness ledger — `insight/ledger.json`

Design §5.8/§5.9 require a `built_at_commit` stamp + per-entry content hash and direct this schema to give the ledger a storage shape (Decision 22 / addendum A10-2): a module-level ledger complementing the per-entry `built_at_commit`/`source_sha256` frontmatter (§4.10.2).

```jsonc
{
  "schemaVersion": "3.0",
  "built_at_commit": "<sha>",                 // module-wide ground-truth commit of the last full pass
  "entries": {
    "<source-path>": {
      "source_sha256": "<64hex>",             // hash of the source body at extraction (mirrors §4.10.2)
      "built_at_commit": "<sha>",
      "extraction_level": 2                    // 2 | 3
    }
  }
}
```

The post-commit fast tier (§9) compares a changed file's current body hash against `entries[path].source_sha256` to flag drift **without** invoking an LLM (design §5.9, "code-only-skips-LLM"). **Validated by** `check.insight-ledger`: valid JSON; `built_at_commit` present; each `entries` value has `source_sha256` (64-hex), `built_at_commit`, `extraction_level ∈ {2,3}`.

#### 4.10.5 The reverse-dependency index — `insight/reverse-index.json`

Design §5.9 requires a reverse dependency index so a changed file invalidates not just its own entry but every concept/edge referencing an entity in it, and directs this schema to give it a storage shape (Decision 23 / addendum A10-3):

```jsonc
{
  "schemaVersion": "3.0",
  "built_at_commit": "<sha>",
  "referenced_by": {
    "<entity-node-id>": [ "<concept-id | edge-id>", … ]   // everything that cites this entity
  }
}
```

`<entity-node-id>` uses the §4.10.6 node-id grammar; each referencing id is a concept file id or an `edge-id` (§4.10.6). On a file change, the daily loop (§9) looks up every entity the file defines and re-verifies every referencing concept/edge. **Validated by** `check.insight-ledger` (the same check governs both index files): valid JSON; keys are well-formed node ids; list members are well-formed concept/edge ids.

#### 4.10.6 The JSON shapes — `graph.json`, `tags.json`, `clusters.json`

Node ids reuse a **path-derived grammar** (Decision 27 / addendum A10-7, design §5.11 "deterministic path-derived IDs"): `file:<project-relpath>`, `element:<project-relpath>#<name>`, `concept:<slug>`. (This deliberately **differs from v2.0's constellation-borrowed grammar** — v3.0's nodes are source-code entities, not curated artefacts, design §8.3.) Serialization is deterministic: nodes/edges/tags/clusters total-ordered; only `generated`/`built_at_commit` vary per run; the graph write **refuses to shrink an existing graph without `--force`** (design §5.8, crashed-refresh guard).

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

- **`edge_type` — enumerated closed set (Decision 24 / addendum A10-4):** `imports` (L1 structural module dependency); `calls` (caller→callee, within-language guard, design §5.11); `semantically-similar-to` (L4 — the **only** sanctioned similarity edge, tightened to non-obvious-and-cross-cutting, design §5.11); `implements-concept` (a file/element node → a `concept` node); `co-clustered` (cluster co-membership). Extending the set is a MINOR bump.
- **`confidence` — a discrete confidence-TIER enum, NOT a float (Decision 25 / addendum A10-5), each tier tied to a named evidence type (design §5.11 "discrete confidence rubric … each tied to a named evidence type"):**

  | tier | evidence type | meaning |
  |---|---|---|
  | `structural` | AST relation (L1, tree-sitter) | edge is a deterministic parse fact (import, export, in-language call) |
  | `stated` | EXTRACTED text (L2/L3) | edge asserted by explicit content the extractor read |
  | `inferred` | INFERRED reasoning (L4) | edge from cross-file semantic reasoning, no direct textual assertion |
  | `ambiguous` | AMBIGUOUS signal | weak/conflicting evidence; surfaced for re-verification, never silently trusted |

  This **deliberately differs from v2.0's inferred-edge enum** (`high | medium | low`, Decision 17), which graded *inference strength* on edges that were all INFERRED by definition. v3.0's tiers grade *kind of evidence*, mapping onto the EXTRACTED/INFERRED/AMBIGUOUS provenance vocabulary plus a `structural` tier below it (design §5.11).
- **Every edge MUST carry a non-empty `evidence` string** — explainability is a module invariant (design §1.3, "NO embeddings; each edge names its rationale"). An empty `evidence` is an `error`.
- **`confirmed_at_commit`** supports confidence-aging (design §5.9): an `inferred`/`ambiguous` edge not re-confirmed across N refreshes is surfaced to the loop for re-verification. N is a loop-config detail (this schema defers to the insight-refresh loop spec).

**`tags.json`** — a **structured tag vocabulary** (the embeddings replacement, design §1.3). v2.0 stored a bare label list; v3.0 adds a typed vocabulary (Decision 26 / addendum A10-6):

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

Cluster-id stability across rebuilds (v2.0's Jaccard carry-over, Decision 14) and the **exact cluster-representation nuances** are **deferred to the insight storage-format spec** (design §10.3, §11 Q1; Decision 14 v3.0 note) — this schema fixes only the field-level shape above (id form `cluster:<slug>`, `members`, non-empty `rationale`, `scope`).

**Validated by** `check.insight-graph` (redefined): each file valid JSON with `schemaVersion`, `generated`, `built_at_commit`; `graph.json` node ids unique, well-formed under this section's grammar; edge `source`/`target` present in the file's own `nodes` (absent → warning, tolerant); `edge_type` and `confidence` in their enums; every edge `evidence` non-empty; `tags.json` `assignments` reference only ids in `vocabulary`; `tag.kind` in enum; `clusters.json` cluster ids match `cluster:<slug>`, unique, `rationale` non-empty, `scope` a declared scope id or `global`.

#### 4.10.7 `insight/_index.md`

Follows the general §7.1 active-prompt shape with a module-specific requirement — the filled template and its rationale are given in §7.4 rather than repeated here (mirrors how v2.0 cross-referenced this same split). **Validated by** `check.insight-index` (redefined) + `check.index-shape`.

#### 4.10.8 Query surface — `cortex insight file/concept/element` (supersedes v2.0 §4.10.5's verbs)

All deterministic Core reading pre-extracted files — **no LLM at query time** (design §5.6; RULES 3). All support `--json`. **Supersedes** v2.0's `query | get | neighbors | list`:

| v3.0 command | Returns |
|---|---|
| `cortex insight file <path>` | the rich per-file entry (§4.10.2) for the source path |
| `cortex insight concept <name>` | which files touch the concept, how it's implemented, related concepts |
| `cortex insight element <query>` | an atomic element (function/class/constant) with description, connections, follow-up pointers; MAY return "no rich entry" for elements not identified as L3 main players — still discoverable via `file` |

There is **no `cortex insight ask`** in v3.0 (natural-language questions are answered by Claude in-session over these primitives; a subprocess `ask` is a named future addition, design §5.6, §11). The command payload *text* is asserted by the insight dev specs' tests, not the validator (carried from v2.0 §4.10.5).

#### 4.10.9 `cortex-extract-insight` skill I/O contract

A Claude Code **skill**, **no CLI wrapper** (design §5.3, §5.11; RULES 3 — extraction is agentic LLM work). Invoked from sessions and scheduled tasks. Contract:

- **Input:** a project with L1 available (or runs L1 in Core first — design §5.3 Phase 1).
- **Behaviour:** orchestrates L1 → planning → scoped parallel L2/L3 execution → cross-scope L4 unification (design §5.3); spawns one sub-agent per root scope (write-fragment-to-disk, disk-file-is-success-signal, missing-fragment-warns, >half-missing-aborts — design §5.3/§5.11); resumable/checkpointed per scope completion; validates outputs against this schema.
- **Outputs (durable):** the insight layout of §4.10.1 (`anatomy/` entries, `concepts/`, `graph.json`/`tags.json`/`clusters.json`, `scope-registry.yaml`, `ledger.json`, `reverse-index.json`).
- **Outputs (transient, pulse):** §4.10.10.

#### 4.10.10 Pulse artefact formats (insight extraction)

Both under `pulse/` (gitignored, transient; §4.5 header conventions apply — `kind`, `generated`, `loop`).

- **`.cortex/pulse/extraction/plan.md`** (`kind: insight-extraction-plan`) — the plan Claude drafts in Phase 2 for user review: root scopes (with size/depth and shared references), shared scopes, sub-scopes, estimated cost and peak parallelism (design §5.3 example). For codebases below the auto-run threshold the plan is written and executed without a wait; above it, execution waits for confirmation.
- **`.cortex/pulse/extraction/progress.md`** (`kind: insight-extraction-progress`) — progress reporting during Phase 3/4: per-scope status (pending / running / complete / failed), files done, checkpoints, warnings (missing fragments) (design §5.11). The per-scope L1 structural output (`extraction/l1.json`) and per-scope fragments (`extraction/fragments/<scope-id>.json`) share this directory.

**Validated by** `check.pulse` (header presence; loose otherwise — transient).

---

## 5. Hook payload contracts

From design §5, §6.3, §9.3. All hooks are pure Node file I/O, **warn-never-block** — they inject text into Claude's context and never abort the tool call. Budgets are hard targets the validator does not enforce at runtime but that the hook implementations MUST respect (design §6.3).

| Hook | Trigger | Injects | Budget |
|---|---|---|---|
| `SessionStart` | new session | Pointer block (below) | <100 tok |
| `PreToolUse` (Write/Edit) | before a write | One warning per matching rule (below), read from `compass/rules/` (re-rooted from `cerebrum/rules/`, addendum A1.5) | ~0 avg |
| `PostToolUse` (Write/Edit) | after a write | **Nothing (v3.0).** The v2.0 anatomy writeback (`tokens`/`sha256`/`last_seen`/`needs_purpose_refresh` on an `anatomy/files.md` row) is removed — `anatomy/` no longer exists (addendum A7.3). Schema 3.0 specifies **no replacement side-effect** (resolved at build-order-v3 step 7): intra-commit change tracking is owned by the post-commit fast tier (`cortex insight-refresh-fast`, §9); the hook stays registered and is a pure no-op. | n/a |
| `PreToolUse` (Read) | before a read | **Insight per-file entry summary (resolved at build-order-v3 step 7, design §5.10).** Data source: the target path's insight entry (§4.10.2), resolved scoped-or-flat by the query layer. (a) The payload's `{{PURPOSE}}` is the **first line of the entry's `## Purpose` section**; `{{TOKENS}}` is the entry's `size_tokens`; `{{APPLICABLE_RULE_IDS}}` stays compass-derived (`governs` glob match — unchanged); the legacy `{{SPEC_LINKS}}` field is **dropped** (its role lives in the entry's Connections section, read via `cortex insight file`, not injected — §5's no-insight-hook trust rationale caps this hook at the one-line purpose summary). (b) When the target path has **no insight entry**, the hook injects **nothing** — graceful absence, never fabrication: extraction owns entry creation. Template below. | summary <50 tok (RULES 11); <75 tok with the writeback invitation (the v2.0 two-budget precedent) |
| `PostToolUse` (Read) | after a read | **Nothing injected; read-time capture into insight (resolved at build-order-v3 step 7, design §5.10).** Sweeps the transcript tail for `<cortex:purpose>` tags (the v2.0 mechanic) and applies a valid tag to the target's **existing** insight entry: the `## Purpose` section's content is replaced with the corrected one-liner plus the read-time provenance trailer `*(read-time, claude-sessions/<user>/<id>)*` (§6 citation form) — frontmatter (extraction metadata) untouched. A tag whose file has **no entry is dropped-and-remembered** (extraction owns creation). PreRead suppresses its invitation while the marker is present. | n/a (empty stdout) |

**SessionStart payload:**
```
Cortex is active (schema {{SCHEMA_VERSION}}). See .cortex/_index.md.
Modules: {{PRESENT_MODULES}}.
{{#if fresh hygiene-report}}Hygiene: {{ONE_LINE_SUMMARY}} (.cortex/pulse/reports/hygiene.md).{{/if}}
```
The hygiene line is included only if `.cortex/pulse/reports/hygiene.md` exists and its `generated` is within `cortex.config.json` `pulse.hygieneFreshnessHours` (default 48). The hook **reads** the report; it never re-runs hygiene (design §10.4).

**PreToolUse (Write/Edit) warning** — emitted once per compass rule whose `governs` glob matches the target path OR whose `check.pattern` matches the proposed content:
```
⚠ Cortex {{RULE_ID}} may apply to {{PATH}}: {{RULE_TITLE}}.
  Source: {{SOURCE_PATHS}}. {{ONE_LINE_GUIDANCE}}
```
No matching rule → no output (the zero-overhead common case).

**PreToolUse (Read) payload (v3.0, resolved at build-order-v3 step 7 — supersedes the v2.0 anatomy-row template):**
```
{{PATH}}: {{PURPOSE}} (~{{TOKENS}} tok). Rules: {{APPLICABLE_RULE_IDS}}.
If this purpose is wrong or stale after reading, emit: <cortex:purpose file="{{PATH}}">corrected one-line purpose</cortex:purpose>
```
`{{PURPOSE}}` = first line of the insight entry's `## Purpose` (§4.10.2); `{{TOKENS}}` = the entry's `size_tokens`; empty rule list renders `-`. **No entry → no output** (the zero-overhead common case, like PreWrite's no-matching-rule case). The invitation line is suppressed when the Purpose section already carries the read-time provenance marker (a witnessed correction is not re-litigated) and never trimmed — budget enforcement trims the purpose text only. A third line `(already read this session)` MAY ride along on duplicate reads (implementation-carried from v2.0).

**PostToolUse (Read) capture (v3.0, resolved at build-order-v3 step 7).** The tag sweep is the v2.0 mechanic; the write target changes: a valid tag (non-empty, single-line, ≤120 chars) whose file has an existing insight entry rewrites ONLY that entry's `## Purpose` section to the corrected purpose + `*(read-time, claude-sessions/<user>/<id>)*`. Invalid tags and tags for entry-less files are logged to `pulse/reports/hook-errors.md` and remembered (never retried); nothing is ever created. This is read-time purpose capture integrated into insight, tagged `read-time` (design §5.10) — the entry's extraction frontmatter is never touched by the hook.

**Envelope (pinned to the Claude Code hooks API, verified 2026-07-02).** All Cortex hooks communicate via **exit 0 + stdout JSON**: SessionStart emits `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": …}}`; the PreWrite warning emits `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow", "additionalContext": …}}`; PostWrite and PostRead emit nothing (empty stdout). No Cortex hook ever exits 2, exits non-zero, or emits `deny`/`ask` — warn-never-block is enforced by the envelope itself. Hook-internal errors degrade (operation proceeds) and append to `pulse/reports/hook-errors.md` (§4.5). Registration entries use the command signature `cortex hook <name>` — that prefix is the **ownership marker** (the JSON transposition of §8's CLAUDE.md marker idiom); tooling manages only entries carrying it.

**No insight hook (unchanged from v2.0).** The insight module adds **no** hook and no field to any existing hook payload. Insight is pull-only via the CLI (§4.10.8). Injecting unreviewed inferred content at SessionStart or PreRead would spend the trust budget on the layer with the weakest trust warrant, and the enforcement channel (PreWrite) reads compass precisely because compass is gated (v2 design §7.4; addendum A1.5, A4.0). The hook table above is unchanged in this regard from v1/v2.0.

**Validated by** `check.hook-config`: the hook entries `cortex init` writes to `.claude/settings.json` match the registered hooks; the Read-pair entries (PreRead + PostRead, together) are present iff `cortex.config.json` `hooks.preRead` is true — which is the default. The payload *text* is the hooks' contract with Claude, asserted by the hook specs' tests, not by the validator.

---

## 6. Cross-reference conventions (the citation graph)

The frontmatter cross-references form the citation graph Claude walks (design §9.2). Two reference forms:

- **Paths** — relative to the **directory of the referring file**. Used to cross **trees** or point at non-spec artefacts.
- **IDs** — bare, resolved against a **project-global index** the validator builds in one pass. Used within a homogeneous set (dependency graph, coverage, rule/spec links).

| Field | On | Targets | Form | Validation |
|---|---|---|---|---|
| `implements` | dev leaf | one business spec | path | exactly 1; resolves; symmetric with target's `implemented_by` |
| `implemented_by` | business spec | dev specs | list<path> | each resolves; symmetric with each source's `implements` |
| `depends_on` | dev spec | dev specs | list<id> | each resolves; **no cycles** |
| `depends_on` | business spec | business specs | list<id> | each resolves; no cycles |
| `covers` | scenario spec | business specs | list<id> | each resolves |
| `governed_by` | dev spec | rules | list<id> | each resolves |
| `source` | rule | atlas decisions / bugs / [v2.0-legacy] insight prose | list<path> | each resolves; paths re-root into `compass/` (addendum A1.6) |
| `governs` | rule | files | list<glob> | well-formed; 0 on-disk matches → `warning` |
| `governs` | dev spec | files | list<glob> | identical to rule `governs` (intentional, §4.1); 0 on-disk matches → `warning` |
| `related_specs` | rule / atlas | dev or business specs | list<id> | each resolves |
| `affects` | bug | rule / file / spec | mixed list | resolve by shape: `R-*`→rule, path-like→file, else→spec ID |
| `compass_rules` | atlas decision | rules | list<id> | each resolves (renamed from `cerebrum_rules`, addendum A2.2) |
| `supersedes` | atlas decision | atlas decisions | list<path> | each resolves |
| `sources` | atlas leaf | atlas sources | list<path> | each resolves |
| `provenance.derives_from` | compass rule, dev spec, business spec, atlas decision | archive document / atlas decision / Claude session | path or `claude-sessions/<user>/<id>` | archive-path and `atlas/decisions/` references **MUST resolve**; `claude-sessions/<user>/<id>` references are **cited-not-resolved** (shape-checked only); the field's *presence* is optional — absence means "authored directly," not "unknown origin" (§6, addendum A6) |

**The v2.0 `spec_links` row (anatomy row → dev specs) is removed** — anatomy no longer exists; its role moves to insight's Connections section (§4.10.2, design §5.10, addendum A1.6).

**Global validation rules:**

1. **ID uniqueness** — every `id` across `.specflow/specs/`, `.specflow/specs-business/`, `compass/rules/`, `compass/bugs/`, and atlas is unique within its kind, and spec IDs (dev+business) are unique across **both** trees combined. Duplicate → `error`. (Insight node ids are *not* in this namespace — they use their own path-derived grammar, §4.10.6, and carry no uniqueness obligation of their own beyond within `graph.json`.)
2. **`implements` is single-valued** — zero or >1 on a leaf → `error` (design §8.1: many-to-one is a decomposition smell).
3. **Bidirectional symmetry** — `implements`↔`implemented_by` MUST agree in both directions. Asymmetry → `error` naming both files.
4. **Resolution** — every path resolves to an existing file (relative to the referrer); every ID resolves in the global index. Unresolved → `error`.
5. **Acyclicity** — `depends_on` graphs (dev and business, separately) MUST be acyclic. Cycle → `error` listing the cycle.

### 6.1 `ValidationReport` (the validator's output contract)

The validator produces a `ValidationReport` — the structured result `validator.spec.md` references. Schema:

```json
{
  "schemaVersion": "3.0",
  "target": ".specflow/specs/",
  "conformant": false,
  "violations": [
    {
      "severity": "error",
      "check": "check.dev-spec",
      "clause": "§4.6",
      "location": { "path": ".specflow/specs/schema/validator.spec.md", "key": "implements" },
      "message": "implements must name exactly one business spec; found 2."
    }
  ],
  "counts": { "error": 1, "warning": 0 }
}
```

- `severity`: `error | warning`. `conformant` is `true` iff `counts.error === 0`.
- `location.key` (frontmatter key) and `location.line` are optional.
- `clause` cites the section of this document the check enforces.
- CLI rendering: a human-readable table for terminals; `--json` emits this object verbatim. Non-conformant → CLI exit `1`.

---

## 7. `_index.md` and `_overview.md` formats

### 7.1 `_index.md` — the active-prompt format (every `.cortex/` directory)

An `_index.md` is **a prompt disguised as documentation** (design §6.2): it tells Claude *when* and *how* to read into the module, not what the module abstractly is. Hard budget **<300 tokens** (design §6.3).

Required shape:

```markdown
# <Module/Dir> — index

**Read this when:** <the trigger conditions, 1–2 lines>

**What's here:**
- `<file-or-subdir>` — <what it holds and when to open it>

**How to navigate:** <how to walk the citation graph from here — which frontmatter
fields to follow, what resolves to what>
```

Filled example (`compass/_index.md`, renamed from `cerebrum/_index.md`, addendum A1.7):
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

**Pulse subdirectory carve-out (resolves B-008).** Directories nested **below** `.cortex/pulse/` — `reports/`, `state/`, `state/reads/`, `extraction/`, `extraction/fragments/`, and any future machine-managed pulse subdirectory — are **exempt** from the `_index.md` requirement: they are machine-managed working directories, not human-navigable modules, and an `_index.md` in each would be transient noise the loops must maintain. `pulse/` itself still requires its `_index.md` (the active prompt that describes the whole subtree). `check.index-present`'s exemption for these paths is implemented in `src/schema/checks/layout.ts`; this section is the contract it enforces.

**Validated by** `check.index-shape`: `_index.md` present in every `.cortex/` directory (except the pulse subdirectories carved out above); contains the `Read this when:` and `What's here:` headings; soft token-budget check → `warning` over 300.

### 7.2 `.specflow/specs/_index.md` — the engineering index

The dev-tree root `_index.md` is BOTH an active prompt AND the dependency/build index. Required sections: a short `Read this when:` prompt, `## Domains` (list with one line each), `## Dependency Graph` (textual edges or a note), `## Build Order` (topological phases; see design §16.2). **Validated by** `check.specs-index`: present; has the three section headings.

### 7.3 `_overview.md` — folder overview (every dir in both spec trees)

Format from the folder-overview template: `## What this is`, `## What it covers`, `## Why it's grouped this way`, optional `## Related groups`. Dev-tree tone may use IDs/paths; business-tree prose MUST NOT contain file paths or IDs except under `## Related groups`. **Validated by** `check.overview-shape`: the three required headings present; business-tree body path/ID scan → `warning`.

### 7.4 `insight/_index.md` — the ungated-module active prompt (v3.0, supersedes the §7.4 v2.0 template)

`insight/_index.md` follows the §7.1 active-prompt shape (validated the same way by `check.index-shape`) with one module-specific requirement: because insight is the sole **ungated** module, its index MUST state the trust model — a `Read this when:` or navigation line that names insight as unreviewed and points at the CLI as the query surface. This is where Claude learns *how much to trust* what it finds, not just the file list. Locked as template text (design §5.13; RULES 11 `_index.md` budget <300 tokens):

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

---

## 8. CLAUDE.md Cortex section template

`cortex init` injects this block into the project's CLAUDE.md (design §6.1). Hard budget **<400 tokens** for the whole Cortex section (both H2 blocks below combined; RULES 11). Substitution points in `{{…}}`.

```markdown
<!-- cortex:start v{{SCHEMA_VERSION}} -->
## Cortex

Cortex is active on **{{PROJECT_NAME}}**. The knowledge layer lives in `.cortex/`:

- `compass/` — rules, conventions, and the bug ledger. The "why" and the "must".
- `atlas/` — stakeholders, decisions (narrative), domain terms, source materials.
- `archive/` — ingested source documents (client specs, transcripts, contracts) and their structured extractions.
- `insight/` — inferred understanding of the codebase itself. See "Cortex Insight" below.

**Protocol:** before working a task, read the relevant `_index.md` first — they are
prompts that tell you what to read and when. For "why" questions, grep `compass/` and
`atlas/`. For unfamiliar terms, check `atlas/domain/`. Follow frontmatter
cross-references (the citation graph) to trace any claim to its source.

Specs are the source of truth: `.specflow/specs-business/` (outcomes) and
`.specflow/specs/` (implementation), linked by `implements:`/`implemented_by:`. Don't
let the trees drift.

Modules present: {{PRESENT_MODULES}}. Schema: {{SCHEMA_VERSION}}.

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
<!-- cortex:end -->
```

The `<!-- cortex:start … -->`/`<!-- cortex:end -->` markers delimit the managed block so `cortex init` can update it idempotently without touching the rest of CLAUDE.md. *(v3.0 interpretive note: the addendum (A1.8, A4.8) specifies the `## Cortex` bullet re-root and the `## Cortex Insight` block verbatim; the one-line `archive/` bullet above is this schema's own necessary addition for a module the addendum introduces but didn't separately spec a CLAUDE.md bullet for. Reviewed at v3.0 fold-in cleanup: the wording (one-clause description plus a parenthetical example list) matches the voice and detail level of the `compass/`/`atlas/`/`insight/` bullets above it — no change needed.)* **Validated by** `check.claude-md`: if CLAUDE.md exists, the managed block is well-formed and its `v…` matches `cortex.config.json`.

---

## 9. `loop.md` template (Decision 6)

Optional root file giving an autonomous `/loop` session its standing context (design §11). Written only when `cortex.config.json` `loop.enabled` is true.

```markdown
# Loop context

You are running as an autonomous loop on {{PROJECT_NAME}}. Cortex is your memory.

**Before acting:** read `.cortex/_index.md` and the `_index.md` of any module you'll
touch. You start cold every run — Cortex is how you recover what prior runs learned.

**Never mutate gated content.** Compass, atlas, `RULES.md`, and both spec trees change
only through the human gate — write proposals to `.cortex/pulse/` and the user applies
them via `cortex pulse-accept <id>`. You MAY maintain machine-owned ungated state directly
only if you are its designated owner loop (insight, in full — the three insight-refresh
loops and `cortex-loop-session-observe`'s ungated per-file enrichments, §4.10; addendum
A7.3). Everything else is a proposal. (The narrow, spec-governed exceptions are the
test-runner's writer/verifier code path and bug-triage's fill-only classification.)

**Conform to the schema.** Every artefact you write carries schema-valid frontmatter
(schema {{SCHEMA_VERSION}}). Run the validator on anything you produce.

**Stop condition:** {{GOAL}}.
```

**Validated by** `check.loop-md` (only if present): contains the never-mutate-gated-content clause and a `Stop condition:` line.

### 9.1 Desktop scheduled-task naming (project scoping)

`~/.claude/scheduled-tasks/` is one global namespace per user, so every Cortex-managed task name MUST be project-scoped. The default form is plain:

```
<project-slug>-<canonical-task-name>
```

with a **hash6 collision fallback** applied only when the plain name is already owned by a *different* project:

```
<project-slug>-<short-hash>-<canonical-task-name>
```

- **`project-slug`** — the project root's folder name, slugged: lowercased; every character outside `[a-z0-9-]` replaced with `-`; consecutive `-` collapsed; leading/trailing `-` trimmed; empty result → `project`.
- **`canonical-task-name`** — the bundle's identity, applying to every Cortex-managed task. At v3.0, the former fourteen individual scheduled tasks are consolidated (owner-approved) into **five scheduled-task bundles**. Each bundle runs its **member loops sequentially, each member failure-isolated** — one member loop failing never aborts the others in the bundle:

  | Canonical | Cron | Model | Member loops (run sequentially, failure-isolated) |
  |---|---|---|---|
  | `daily` | `0 2 * * *` | `claude-sonnet-5` | pulse-hygiene, bug-triage, spec-drift, insight-refresh-daily, session-observe |
  | `weekly-curation` | `0 4 * * 6` | `claude-opus-4-8` | pulse-distil (now also carrying the retired skill-suggest's workflow-mining lens), rule-decay |
  | `weekly-quality` | `0 4 * * 0` | `claude-sonnet-5` | specflow-lint, specflow-verify, insight-refresh-full |
  | `test-runner` | `0 6 * * 0` | `claude-sonnet-5` | test-runner alone (the only code-writing loop, kept isolated by design) |
  | `monthly-review` | `0 6 1 * *` | `claude-sonnet-5` | atlas-staleness, onboarding-drift |

  The git-hook loop `cortex-loop-insight-refresh-fast` remains the **git post-commit hook** (replacing `anatomy-refresh-fast`), not a scheduled task. `skill-suggest` is **retired entirely** as a standalone task (owner decision): its one workflow-mining judgment folds into `pulse-distil` as an extra lens (see `pulse.distil`), not its own task or a distinct bundle member.
- **`short-hash`** — collision-fallback component only: the first 6 hex chars of SHA256 of the project root's absolute path (resolved, no trailing slash). Because the Desktop app derives the *displayed* task name from the id (dash→space, capitalize the first letter — e.g. `cortex-daily` displays as "Cortex daily"), the plain `<slug>-<canonical>` id doubles as the human-readable name; the hash is injected only on a proven collision so the common case stays scannable.
- **Ownership marker.** Every payload SKILL.md Cortex writes at a plain name carries a deterministic ownership marker — an HTML comment `<!-- cortex-project-root: <resolved-root> -->` stamped in the body (deliberately not a frontmatter key: the Desktop app parses the frontmatter, and an unknown key risks rejection). Collision resolution requires a **positive mismatch**: the plain dir must already exist *and* carry a marker naming a **different** project root before the hash fallback engages; an unmarked plain dir is claimed as ours. Recognition of "this project's own tasks" (for preserve / overwrite / clean-up) matches the plain or hash-fallback name plus, for a plain match, a marker that is absent or names this root.
- **Model pinning per bundle.** Each bundle's registry entry pins a `model` (the app's entry schema carries an optional `model` field): `claude-opus-4-8` for `weekly-curation` (the heavier curation/distillation judgment), `claude-sonnet-5` for the other four. Core owns the canonical→model assignment (the cadence/model table in `core-cli.tasks-register`); the skill never hardcodes it.

Example: a project at `/Users/me/dev/api` names its tasks `api-daily`, `api-weekly-curation`, `api-weekly-quality`, `api-test-runner`, `api-monthly-review`; a second, same-named project colliding on a plain name falls back to `api-a3f2b1-daily`, ….

**Payload vs. registration (B-009 correction; final mechanism).** A `~/.claude/scheduled-tasks/<scoped-name>/SKILL.md` directory is a prompt **payload** only — writing it registers nothing, because the Desktop app never scans that directory. **Registration** is an entry in the app's own registry, a `scheduled-tasks.json` under `~/Library/Application Support/Claude/claude-code-sessions/<uuid>/<uuid>/` (shape `{"scheduledTasks": [...], "recordedSkips": {...}}`; entries carry `id` = the scoped name, `cronExpression`, `enabled`, `filePath` = the absolute payload SKILL.md path, `createdAt` epoch ms, `cwd`, `useWorktree`, `permissionMode`) — a registry the app holds **in memory**, loaded once per launch and rewritten wholesale on every task event. The mechanism therefore has three parts: `cortex init` writes the payloads and prints the registration instructions; **registration itself happens in a Claude Desktop session via the `cortex-register-tasks` skill**, which reads `cortex tasks plan --json` (Core's authoritative plan) and drives the app's own internal `mcp__scheduled-tasks__*` MCP tools; `cortex tasks verify` detects silent loss. `cortex tasks register` — the direct registry write, upserting only the fields Cortex owns and preserving foreign entries and unknown fields verbatim — remains a **guarded fallback** that refuses to run while the Desktop app is running (in-memory clobber/wipe hazard; spec `core-cli.tasks-register`).

**The task name is registration identity only** — the SKILL.md frontmatter `name:` carries the scoped bundle name, but the prompt body invokes each *member loop's underlying skill* by its real name (`cortex-pulse-hygiene`, `specflow-lint`, …), one after another. Tooling recognises its own project's tasks by the plain `<slug>-<canonical>` name (disambiguated by the ownership marker) or the `<slug>-<hash>-` fallback prefix plus a canonical suffix, and ignores every other project's.

---

## 10. Schema versioning policy

### 10.1 Where the version lives

`.cortex/cortex.config.json` (committed). Minimum shape:

```json
{
  "schemaVersion": "3.0",
  "hooks": { "preRead": true },
  "pulse": { "distilThresholdN": 3, "dismissedWindowDays": 90, "hygieneFreshnessHours": 48 },
  "harness": { "maxIterations": 3 },
  "loop": { "enabled": false }
}
```

**Required:** `schemaVersion` (string `MAJOR.MINOR`). All other keys optional with the defaults shown. `hooks.preRead` governs the **Read pair** (PreRead + PostRead) as one opt-out flag; `cortex init` writes it explicitly on fresh projects so the config self-documents. **v3.0 change (addendum A10.0):** the v2.0 `anatomy` block (`exclude`, `enhancement`) is removed with the anatomy module. The v2.0 `insight` block (`clusterCarryOverJaccard`, `promotionMinAgeDays`, `promotionMinObservations`) is **superseded** — those keys tuned v2.0 mechanics (prose cluster carry-over, promotion eligibility) that no longer exist; v3.0's insight config keys (auto-run threshold, significance-triage tuning, confidence-aging N) are **deferred to the insight-refresh loop spec** (design §10.3) and are not yet part of this contract. The `pulse` block MAY gain a `readsRetentionDays` key (default **14**) in a future MINOR — the age threshold for deleting `pulse/state/reads/<session-id>` ledgers (§4.5); it is **not yet a config option** (currently hardcoded as `READS_RETENTION_DAYS` in `src/pulse/hygiene.ts`). Config MAY also gain an `archive` block in a future MINOR; its keys are deferred to the archive ingestion spec. This addendum fixes only `schemaVersion`. **Validated by** `check.config`: valid JSON; `schemaVersion` present and parseable; unknown keys → `warning`.

### 10.2 Version semantics (semver-lite, MAJOR.MINOR)

- **MINOR bump** = backward-compatible: new optional fields, new artefact kinds, relaxed rules. A validator for `1.x` MUST accept any `1.y` project where `y ≤ x` cleanly, and SHOULD accept `y > x` treating unknown optional fields as `warning` (forward tolerance).
- **MAJOR bump** = breaking: a field removed/renamed, an optional field made required, a value's meaning changed, a directory moved. 3.0 is a MAJOR bump per this definition: `cerebrum` renamed to `compass` (directory moved); `anatomy` removed (module removed); `archive` added (new committed module); new required per-file-entry frontmatter (`built_at_commit`, `source_sha256`, §4.10.2); and `cerebrum/decisions.md` removed outright (addendum A10.0).

### 10.3 Validator behaviour on mismatch (replaces the design's per-artefact idea, Decision 3)

The validator declares a `supportedMajor` and `supportedMinor`. Reading `cortex.config.json` `schemaVersion`:

- **MAJOR > supported** → single `error` (`check.config`, clause §10.3): refuse to validate further against the wrong contract; tell the user to upgrade Cortex.
- **MAJOR < supported** → single `error` recommending `cortex migrate` (below).
- **MAJOR ==, MINOR > supported** → one `warning`; proceed with forward tolerance.
- **Equal** → proceed normally.

*(v3.0 note: this schema document declaring `3.0` does not, by itself, change the validator's `supportedMajor`/`supportedMinor` constants in `src/schema/version.ts` — those remain at `2`/`0` as of this fold-in and are bumped in build-order-v3 step 2, coupled with the `cerebrum`→`compass` rename, per that build order's own sequencing rationale. Until step 2 lands, a project declaring `schemaVersion: "3.0"` will trip the `MAJOR > supported` branch above.)*

### 10.4 Migration

A MAJOR bump ships a migration that `cortex migrate` (or `cortex init` on an existing project) applies. Moved/renamed paths leave a **deprecation marker** at the old location pointing at the new one (design §8.5), retained until the next MAJOR. Migrations are deterministic Core operations — no LLM.

**1.0→2.0 waiver (Decision 19 / v2 design flag F5).** This requirement is explicitly **waived for the 1.0→2.0 transition only**: there are no external users, and the Cortex repository itself moves `specs/`→`.specflow/specs/` (etc.) and gains `insight/` as part of the v2 build. No `cortex migrate` for 2.0 ships and no deprecation markers are left at the old `specs/` roots. The policy holds in full for every **future** MAJOR, once external users exist. (`cortex init` on a pre-2.0 project without the migration would treat the old trees as absent — acceptable because no such external project exists.)

**2.0→3.0 migration (Decision 19 v3.0 confirmation; addendum A10.0).** No blanket waiver applies at 3.0 — the policy above applies in full. `cerebrum`→`compass` (a directory rename) and the deletion of the now-duplicate `cerebrum/decisions.md` are deterministic Core moves; the `anatomy`→`insight` content absorption is **more than a rename** — it is a fresh re-extraction, not a path rewrite, since `anatomy/files.md`'s flat per-file table has no structural equivalent to move, only content to re-derive at a richer level. Whether `cortex migrate` ships for 3.0 and its exact mechanics are owned by the **module-migration spec** (design §10.3), sequenced as build-order-v3 step 2 — this schema records only that the policy applies and why the two halves (rename vs. re-extraction) differ in mechanism; it does not specify the migration tool itself.

---

## Appendix A — Validator check catalogue

The mechanical check set (one row ⇒ one implementable check). Grouped by the design §3.2 facet. Merged at v3.0 per addendum §A8 (and its §A0.3 change ledger, which additionally lists `check.atlas` among the re-rooted checks even though the A8 delta table omits it — both are honoured here; see the note after the table).

| Check | Enforces | Clause | Severity on fail |
|---|---|---|---|
| `check.layout` | `.cortex/` directory layout: `compass/`, `atlas/`, `archive/`, rebuilt `insight/`; `cerebrum/` and `anatomy/` gone; `.specflow/`-rooted trees | §1 | error |
| `check.index-present` / `check.index-shape` | every `.cortex/` dir (incl. `archive/`, `insight/`) has a well-formed `_index.md` | §7.1 | error / warning |
| `check.insight-index` | `insight/_index.md` states the ungated trust model + names the CLI (redefined for v3.0 verbs) | §7.4 | warning |
| `check.specs-index` | `.specflow/specs/_index.md` shape | §7.2 | error |
| `check.overview-present` / `check.overview-shape` | every spec-tree dir has a well-formed `_overview.md` | §2.2, §7.3 | error / warning |
| `check.id-matches-path` | spec ID equals its path (tree root stripped, §2.2) | §2.2 | error |
| `check.rule` | compass rule frontmatter + `check` predicate; path re-rooted to `compass/rules/`; tolerates optional `provenance` | §4.1 | error |
| `check.bug` | compass bug frontmatter + taxonomy; path re-rooted to `compass/bugs/` | §4.2 | error |
| `check.atlas` | atlas artefact frontmatter; `cerebrum_rules`→`compass_rules`; tolerates optional `provenance` on decisions | §4.3 | error |
| `check.archive-layout` (new) | `archive/` layout: `documents/<slug>/` has `source.*` + `metadata.yaml` + `extracted/`; `_index.md`, `register.md`, `types/` present | §4.4 | error |
| `check.archive-metadata` (new) | `metadata.yaml` frontmatter (`id`, `kind`→resolves, `ingested_at`, `version`, `status`) | §4.4.1 | error |
| `check.archive-type` (new) | `types/*.yaml` shape (`id`==stem, `label`, `classification`, `extraction.strategy`, non-empty `outputs`) | §4.4.2 | error |
| `check.pulse` | pulse header presence; suggestion `**Type:**` present + in enum (incl. new `decision-candidate`); `**Target:**` root permitted for its type; exactly one payload shape | §4.5, §4.5.1, §4.5.2 | warning (header) / error (type/target/payload) |
| `check.provenance` (new) | `provenance` entries resolve (archive/atlas MUST; `claude-sessions` shape-only); maintains the backward-traversal index | §6, addendum A6 | error |
| `check.dev-spec` | dev-spec frontmatter + links; tolerates optional `provenance` | §4.6 | error |
| `check.rule-governs-resolves` | every glob in a compass rule's `governs` matches ≥1 real file | §4.1, §6 | warning |
| `check.dev-spec-governs-resolves` | every glob in a dev spec's `governs` matches ≥1 real file | §4.6, §6 | warning |
| `check.business-spec` | business-spec frontmatter + no-dev-content; tolerates optional `provenance` | §4.7 | error (frontmatter) / warning (content) |
| `check.business-status` | business status lags its all-implemented `implemented_by` (Policy A) | §4.7 | warning |
| `check.covers-resolves` | scenario `covers:` resolves | §4.8 | error |
| `check.insight-entry` (new; replaces `check.insight-prose`) | per-file entry frontmatter + section contract | §4.10.2 | error |
| `check.insight-scope-registry` (new) | `scope-registry.yaml` shape, path resolution, `depends_on` acyclicity | §4.10.3 | error |
| `check.insight-ledger` (new) | `ledger.json` + `reverse-index.json` shapes and node-id well-formedness | §4.10.4, §4.10.5 | error |
| `check.insight-graph` | `graph.json`/`tags.json`/`clusters.json` shapes (redefined: new node-id grammar, `edge_type`/`confidence` enums, non-empty `evidence`) | §4.10.6 | error (edge endpoint absent from `nodes` → warning) |
| `check.xref-resolve` | all paths/IDs resolve | §6 | error |
| `check.xref-symmetry` | `implements`↔`implemented_by` | §6 | error |
| `check.xref-unique` | global ID uniqueness | §6 | error |
| `check.xref-acyclic` | `depends_on` acyclicity | §6 | error |
| `check.hook-config` | registered hooks match config | §5 | error |
| `check.claude-md` | managed CLAUDE.md block (re-rooted: compass; anatomy bullet removed; insight block replaced) | §8 | error |
| `check.loop-md` | `loop.md` clauses (if present; re-pointed: compass, insight) | §9 | warning |
| `check.config` | `cortex.config.json` + version | §10 | error |
| `check.constellation` | `constellation.json` shape, id uniqueness, group/edge resolution (module enum `cerebrum`→`compass`; `anatomy` dropped; stays curated-only) | §4.9 | error |

**REMOVED at v3.0 (5):** `check.anatomy-files`, `check.anatomy-graph`, `check.anatomy-purpose-source` (anatomy module removed, addendum A7.3); `check.insight-prose` (replaced by `check.insight-entry`); `check.insight-ownership` (the `map/` write-lane rule is obsolete under the new layout, §4.10.1).

**Reconciliation note (RULES 19).** Design §10.1 directs "rename `check.cerebrum-*` → `check.compass-*`." No check was ever literally named `check.cerebrum-*` in v2.0 — the cerebrum-reading checks were `check.rule`, `check.bug`, `check.layout`, `check.index-shape`, `check.rule-governs-resolves`. Their **IDs stay stable** (content-role-keyed, exactly as rule/bug node prefixes are content-keyed and survive the directory rename); only the **paths they read** re-root to `compass/`. This fold-in applies the design's *intent* (re-root every cerebrum-reading check) and records that the literal rename has no target (addendum A0.3). Separately: the addendum's own §A8 delta table omits `check.atlas` from its "re-rooted/redefined" list, while its §A0.3 change ledger explicitly includes `check.atlas` among the 11 re-rooted checks (`cerebrum_rules`→`compass_rules`) — an internal inconsistency in the addendum. This schema resolves it by including `check.atlas`'s re-root here (per A0.3 and per A2.2, which explicitly names `check.atlas` as the enforcer of the `compass_rules` rename) — flagged for Pedro's awareness, not silently reconciled.

**Check count.** The addendum's own tally (A0.3, A8) states "28 at v2.0 → 32 at v3.0 (added 7, removed 5)" — that arithmetic does not reconcile (28 + 7 − 5 = 30, not 32), and it does not match a plain enumeration of the v2.0 Appendix A table's distinct check IDs either (33, not 28) — both are **pre-existing inconsistencies inherited from the source documents**, not introduced by this fold-in, and are flagged here rather than silently "corrected" with an invented number. The authoritative source of truth is the enumerated table above, not any running total. By the same enumeration method used for v2.0 (33 distinct IDs), applying addendum A0.3's stated delta (+7 added, −5 removed, IDs otherwise stable) yields **35** distinct check IDs at v3.0 — confirmed by direct enumeration of the table above (33 rows, two of which each name two check IDs joined by `/`: `check.index-present`/`check.index-shape` and `check.overview-present`/`check.overview-shape`, for 35 distinct IDs total).

---

**End of schema v3.0.** Folded in from `cortex-schema-v3-addendum.md` (build-order-v3 step 1; see git history for the addendum's drafting record and the fold-in commit). Changes from 2.0: `cerebrum/` renamed `compass/` (rule/bug ids unchanged); `anatomy/` removed, absorbed into `insight/`; `archive/` added (ingested documents + extractions, mixed git policy); `insight/` rebuilt wholesale (leveled L1–L4 per-file entries, scoped/unscoped layouts, new JSON shapes with a discrete confidence-tier enum and a path-derived node-id grammar, a staleness ledger, and a reverse-dependency index); the `cortex insight file/concept/element` query CLI (supersedes `query/get/neighbors/list`); the `cortex-extract-insight` skill I/O contract; `provenance:`/`derives_from:` frontmatter on compass rules, both spec trees, and atlas decisions, with a backward-traversal index; decisions single-homed to `atlas/decisions/` (`compass/decisions.md` does not exist); the pulse typed-suggestion enum gains `decision-candidate`; the scheduled-task/loop roster changes (anatomy-refresh and the v2.0 insight-refresh/gaps pair retire; three insight-refresh tiers plus `cortex-loop-session-observe` take their place); the CLAUDE.md template and `loop.md` re-rooted; and the version-gate wiring (`schemaVersion: "3.0"`; validator `supportedMajor`/`supportedMinor` activation is deferred to build-order-v3 step 2, coupled with the rename). Next: build-order-v3 step 2 (module migration + version-gate activation).
