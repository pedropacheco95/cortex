# Cortex Schema — The Contract Between Core and Skills

**Schema version:** `2.0`
**Status:** v2.0 draft for review by Pedro. This file is the **living contract** and is revised in place at each version — the v1.0 text is preserved in git history. (Unlike the design documents, which are frozen records.)
**Depends on:** `cortex-design.md` (the v1 design doc, frozen) and `cortex-v2-design.md` (the v2 design doc). Where design and schema disagree, this document wins on file formats, frontmatter, cross-references, and versioning — that is its job. Where the design docs are silent or vague, this document **makes the decision** (see §0) rather than deferring.

**2.0 is a MAJOR bump** (§10.2): directories moved (`specs/`/`specs-business/` → `.specflow/`, §2.3) and the layout gained a new committed module (`insight/`, §1, §4.10). The §10.4 migration requirement is explicitly waived for the 1.0→2.0 transition (Decision 19).

This is the load-bearing artefact named in design §3.2. **Cortex Core implements it; Skills consume it; both reference it by version** (recorded in `.cortex/cortex.config.json`, §10). It is precise enough that the schema validator (`.specflow/specs/schema/validator.spec.md`) can be implemented mechanically from it.

Conventions used in this document:

- **MUST / SHOULD / MAY** carry their usual normative force. A `MUST` violation is an `error`; a `SHOULD` violation is a `warning`.
- "Frontmatter" means a YAML block delimited by `---` at the very top of a markdown file.
- "Validated by" names the validator check that enforces a rule. The validator is the single mechanical enforcer; loops (`specflow-lint`, `specflow-verify`) layer additional non-schema checks on top.

---

## 0. Decisions made where the design doc was vague

These were underspecified or contradictory in `cortex-design.md`. Each was **locked** at schema v1.0 and carries forward unchanged into 2.0 (the v2.0 additions are in §0.1). Override any of them and the dependent sections change.

1. **Git policy: §14 wins over §13.2.** Design §13 step 2 says "append `.cortex/` to `.gitignore`"; §14 says cerebrum and atlas (minus sources) are committable. These contradict. **Decision:** `cortex init` gitignores the specific regenerable/sensitive/transient paths only — `.cortex/anatomy/`, `.cortex/atlas/sources/`, `.cortex/pulse/`, and `.cortex/constellation.json` (compiled, regenerable — §4.9) — never the whole `.cortex/`. `.cortex/cortex.config.json`, `.cortex/cerebrum/`, and `.cortex/atlas/` (minus `sources/`) are committed. (§1, §10) **v2.0 amendment:** `.cortex/insight/` is committed in full — including the machine-regenerated `map/*.json` — adding the fourth git-policy quadrant: machine-owned *and* committed (v2 design §3.3; diff-noise mitigations in §4.10.2). The gitignored set is unchanged.

2. **One global spec-ID namespace; no tree prefix.** Design §8.2 shows `covers: [business.auth.secure-account-access]` (a `business.` prefix) while the business-spec template uses bare `id: auth.secure-account-access`. **Decision:** all spec IDs — dev and business — live in **one global namespace, are bare (no `business.`/`dev.` prefix), and MUST be globally unique.** `depends_on:` and `covers:` reference bare IDs. The `business.` prefix from §8.2 is dropped. (§4.6, §4.7, §6)

3. **Schema version is project-level, not per-artefact.** Design implies artefacts might each declare a version. **Decision:** the version is declared **once**, in `.cortex/cortex.config.json` (`schemaVersion`). Individual artefacts do **not** carry a version field; they inherit the project version. The validator reads `cortex.config.json` to know which contract to enforce. (§10)

4. **`covers:` completeness is NOT a schema-validator concern.** The validator checks that every `covers:` entry *resolves*. The constraint "every business spec appears in ≥1 scenario's `covers:`" (§8.2) is a **verification-pass** check owned by `specflow-verify` (design §11.4), because it is a project-completeness assertion, not a per-file conformance rule. (§3, §6, and reflected back into `validator.spec.md`)

5. **`anatomy/files.md` is markdown frontmatter + a table.** Design never fixes the format. **Decision:** a YAML frontmatter header (anatomy-level metadata) followed by one markdown table row per file. List-valued cells (`spec_links`) are space-separated bare IDs. (§4.1)

6. **`loop.md` lives at the project root and is optional.** Design §11 names it for `/loop` integration but never specifies it. **Decision:** `cortex init` MAY write a root `loop.md` (off unless `cortex.config.json` `loop.enabled` is true). Format in §9. (§9)

7. **Confidence enum is `STATED | EXTRACTED | INFERRED`.** Design §9.2 shows `confidence: EXTRACTED` with no enum. **Decision:** those three values; optional on cerebrum and atlas artefacts; absent means `STATED`. (§4.2, §4.4)

8. **ID prefixes and padding:** rules `R-NNN`, bugs `B-NNN`, pulse suggestions `S-NNN` — `-` plus a zero-padded integer, **minimum 3 digits**, monotonic per project, never reused. Atlas decisions are dated slugs (`YYYY-MM-DD-slug`), not `D-NNN`. (§4.2, §4.4)

9. **Timestamps are ISO-8601 UTC** with a trailing `Z` (e.g. `2026-06-30T14:00:00Z`). (everywhere)

10. **Two index kinds, named distinctly.** `_index.md` = an **active prompt** (every `.cortex/` directory, plus `.specflow/specs/_index.md` which is the dependency/build index). `_overview.md` = a **folder overview** (every directory in `specs/` and `specs-business/`). A directory never needs both except the `specs/` root, which has `_index.md` (engineering index) and its domains have `_overview.md`. (§2, §7)

11. **Every `*.spec.md` is treated as a leaf for the single-`implements:` rule.** The leaf-vs-aggregate distinction is not encoded in the path, so `check.dev-spec`/`check.xref-*` apply the "exactly one `implements:`" requirement to every dev spec file. Domain/capability aggregate specs that legitimately omit `implements:` are permitted per §4.6, but if `implements:` is present it MUST be single-valued. (surfaced from the validator build; enforced at §4.6, §6, Appendix A `check.dev-spec`)

12. **A MAJOR schema-version mismatch short-circuits all other checks.** When `cortex.config.json` declares a MAJOR above (or below) the validator's supported MAJOR, the validator emits the single `check.config` error (§10.3) and runs no further checks — it does not validate against the wrong contract. (surfaced from the validator build; enforced at §10.3, Appendix A `check.config`)

### 0.1 Decisions locked at v2.0

Where `cortex-v2-design.md` left an open question that this contract must commit on, the recommended disposition (approved with the design doc) is adopted and **marked** here.

13. **The loop-write invariant is restated: a loop never mutates gated content.** Cerebrum, atlas, `RULES.md`, and both spec trees change only through the human gate (`pulse-accept`) or under direct human review; machine-owned ungated state (anatomy, `insight/map/*.json`) is maintained directly by its designated owner loop; ungated observational content (`insight/map/*.md`, plus the one file-list line in `insight/_index.md`) is written directly by its designated producer, with provenance. This supersedes v1's "writes only to `.cortex/pulse/`" phrasing and retires its growing exception list (test-runner and bug-triage keep their narrow, reported exceptions per their specs). (v2 design §4.4, flags F1/F6; §4.10.3, §9)

14. **Cluster ids are label-slugs with carry-over matching (OQ1 disposition).** `cluster:<label-slug>`; a full rebuild reuses an existing cluster's id and label when member-set Jaccard ≥ `insight.clusterCarryOverJaccard` (default 0.5; highest match wins, ties broken by id order). (§4.10.2)

15. **"Stabilized" — promotion eligibility — is mechanical (OQ3 disposition):** ≥ `insight.promotionMinAgeDays` (default 14) in insight AND ≥ `insight.promotionMinObservations` (default 2) independent session observations — or one distil repetition detection (v2 design §6) — AND no correction since the last observation. (§4.10.4, §10.1)

16. **Correction tracking is a bottom `## Corrections` log, and corrections rewrite prose in place (OQ6 + OQ7 dispositions).** The correcting writer rewrites the contradicted text in place and appends the log entry in the same write; frontmatter stays lean. (§4.10.1)

17. **Inferred-edge confidence enum is `high | medium | low`** — deliberately not Decision 7's provenance enum: every inferred edge is INFERRED by definition; what varies is inference strength. (§4.10.2)

18. **Suggestion sections are typed, and the pulse gate gains edit semantics.** `**Type:**` is required (absent → `rule-candidate` with a warning, v1-era tolerance); an **edit** payload shape (current content + replacement, match-byte-exact-or-refuse) joins append and create; `Target:` roots extend beyond cerebrum and new-skill paths to `.cortex/atlas/`, `.cortex/insight/map/`, and `RULES.md`, constrained per type. (§4.5; resolves v2 design flag F3)

19. **The §10.4 migration is waived for 1.0→2.0 only.** No external users; the Cortex repo itself moves as part of the v2 build. The policy stands in full for every future MAJOR. (§10.4; v2 design flag F5)

20. **Left open, with landing sites:** rationale-sidecar vs committed rationale text (OQ4 — revisit at insight-refresh spec time if diff noise proves real despite §4.10.2's carry-over rule); gaps-loop window semantics, watermark vs wall-clock (OQ5 — locked in the insight-gaps dev spec; this contract constrains only the outputs, not the window); root SpecFlow artefacts moving under `.specflow/` (OQ8 — a later MINOR/MAJOR; they stay at the project root in 2.0, §2.3).

---

## 1. The `.cortex/` directory layout

`cortex init` creates this skeleton. Every directory MUST contain an `_index.md` active prompt (§7). `[committed]` / `[gitignored]` marks the default git policy (Decision 1).

```
.cortex/
├── cortex.config.json          [committed]   project config + schemaVersion (§10)
├── constellation.json          [gitignored]  compiled citation graph for the renderer (§4.9)
├── _index.md                   [committed]   root active prompt — names the modules
├── anatomy/                    [gitignored]  regenerable code-structure index (§4.1)
│   ├── _index.md
│   ├── files.md                              per-file index (frontmatter + table)
│   ├── graph.json                            imports/exports edges only
│   └── layers.md                             architectural-layer assignments
├── cerebrum/                   [committed]   rules, decisions, conventions, bug ledger (§4.2)
│   ├── _index.md
│   ├── preferences.md                        project conventions (stack, formatting)
│   ├── environment.md                        operational pointers — never secrets
│   ├── do-not-repeat.md                      index of recurring-mistake rules
│   ├── standing-authorities.md               default decisions Claude holds without asking
│   ├── decisions.md                          ADRs (cross-link to atlas/decisions/)
│   ├── bugs/                                  the unified bug ledger
│   │   ├── _index.md
│   │   └── B-001-<slug>.md
│   └── rules/                                one file per rule
│       ├── _index.md
│       └── R-001-<slug>.md
├── atlas/                      [committed]   project knowledge base (§4.4)
│   ├── _index.md
│   ├── stakeholders/
│   │   ├── _index.md
│   │   └── <slug>.md
│   ├── decisions/
│   │   ├── _index.md
│   │   └── YYYY-MM-DD-<slug>.md
│   ├── domain/
│   │   ├── _index.md
│   │   └── <term>.md
│   └── sources/                [gitignored]  raw materials (may be sensitive)
│       ├── _index.md
│       └── <slug>.<ext>
├── insight/                    [committed]   ungated inferred/observed knowledge (§4.10)
│   ├── _index.md                             active prompt (§7.4)
│   └── map/                                  flat; carries NO _index.md of its own (§4.10.3)
│       ├── <topic>.md                        prose observations — gaps loop + humans
│       ├── graph.json                        inferred concept edges — refresh loop only
│       ├── tags.json                         per-node tag sets — refresh loop only
│       └── clusters.json                     cluster memberships — refresh loop only
└── pulse/                      [gitignored]  transient loop outputs (§4.5)
    ├── _index.md
    ├── dismissed.md                          rejection memory (persists)
    └── *.md                                  reports, overwritten each run
```

The two spec trees live under **`.specflow/`** at the project root (v2 design §9); the test tree stays directly at the project root. Neither lives under `.cortex/` (design §3.3, Layer 0): `.specflow/specs/`, `.specflow/specs-business/`, `tests/`. They are covered in §2 and §3.

**Validated by** `check.layout`: every directory listed above (when its module is present) exists and carries the required `_index.md` — with one deliberate exception: `insight/map/` carries **no** `_index.md` (the module index one level up fully describes it, and a second index would give the gaps loop two lists to keep in sync, §4.10.3); `pulse/` and `anatomy/` contents beyond the fixed names are tolerated (transient/generated); `insight/map/` contents are additionally constrained by `check.insight-ownership` (§4.10.3).

---

## 2. `.specflow/specs/` and `.specflow/specs-business/` conventions

From design §8.1; re-rooted under `.specflow/` at v2.0 (v2 design §9, §2.3 below). Both trees are three conceptual levels: **domain → capability → leaf**. Only **leaf** specs are implementable. `.specflow/` contains exactly the two trees — no wrapper docs of its own.

### 2.1 Layout

```
.specflow/specs/                    # developer specs (implementation contract)
├── _index.md                       # ACTIVE PROMPT + dependency graph & build order (§7.2)
├── _overview.md                    # folder overview of the whole dev tree
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

**Invariant under the move:** spec IDs (path-derived within the tree, §2.2); every ID-form cross-reference (`depends_on`, `covers`, `governed_by`, `related_specs`, `spec_links`); the `implements:`/`implemented_by:` relative paths (both trees moved together, so the relative geometry between them is identical); and `governs:` globs (project-root-relative pointers at *source* files).

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
- `verification-report.md` is written to `.cortex/pulse/`, **not** `tests/` (design §8.5).
- `tests/` remains at the **project root** at v2.0 — deliberately not moved under `.specflow/` (§2.3).

---

## 4. Frontmatter contracts per file type

All artefacts that carry frontmatter use a leading `---`-delimited YAML block. Unknown fields are a `warning` (forward-compat tolerance), missing required fields an `error`. Field types: `string`, `enum`, `list<T>`, `path` (relative path string), `id` (bare dot/dash ID), `glob`, `int`, `iso-datetime`, `sha256` (64 hex chars).

### 4.1 `anatomy/files.md`

A frontmatter header plus one table row per indexed file. `files.md` is regenerable (gitignored).

**Header frontmatter — required:** `kind: anatomy-files` (string const), `last_full_scan` (iso-datetime). **Optional:** `file_count` (int).

**Per-file row columns (in order):** `path` (project-relative), `purpose` (one line), `tokens` (int estimate), `sha256` (content hash, change detection), `last_seen` (iso-datetime), `spec_links` (space-separated dev-spec IDs, or `-`), `needs_purpose_refresh` (`true`/`false`), `purpose_source` (`docstring | scanner-llm | read-time`, or `-` while the purpose is a placeholder). `purpose_source` is required whenever `purpose` is populated. **Trust ordering: `read-time` > `docstring` > `scanner-llm`** — an automated writer MUST NOT replace a purpose with one from a lower-trust source unless the file's content changed (`needs_purpose_refresh: true` resets the contest).

**Migration:** rows carrying a real purpose but no `purpose_source` are backfilled `scanner-llm` on the next scan — the accurate default for anything produced before provenance tracking.

```markdown
---
kind: anatomy-files
last_full_scan: 2026-06-30T14:00:00Z
file_count: 3
---

| path | purpose | tokens | sha256 | last_seen | spec_links | needs_purpose_refresh | purpose_source |
|------|---------|--------|--------|-----------|------------|---------------------------------------|
| src/cli/init.ts | Bootstraps a project: scan, hooks, scaffolding. | 1820 | 9f2c… | 2026-06-30T14:00:00Z | core-cli.init | false | docstring |
| src/schema/validate.ts | Validates an artefact tree against the schema. | 2440 | a1b3… | 2026-06-30T14:00:00Z | schema.validator | false | scanner-llm |
```

**Validated by** `check.anatomy-files`: header present; every row has all 8 columns; `tokens` int; `sha256` 64-hex; timestamps ISO; each `spec_links` ID resolves (§6).

`graph.json`: `{ "nodes": ["path", …], "edges": [{ "from": "path", "to": "path", "kind": "import"|"export" }] }`. **Validated by** `check.anatomy-graph` (valid JSON; node paths exist on disk → missing = `warning`). `layers.md`: free markdown with an H2 per layer listing member paths; advisory, `warning`-only checks.

### 4.2 `cerebrum/rules/R-NNN-<slug>.md`

**Required:** `id` (`R-NNN`), `title` (string), `source` (list<path> — atlas decisions, bug files, and/or insight prose files justifying the rule; the insight form is the promotion lineage, §4.5 `promotion`), `governs` (list<glob> — anatomy/file paths the rule applies to). **Optional:** `related_specs` (list<id>), `confidence` (enum `STATED|EXTRACTED|INFERRED`, default `STATED`), `check` (the machine-checkable predicate, below), `status` (enum `active|retired`, default `active`).

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

**PreWrite consumption note.** The PreWrite hook (§5) consumes rules in two modes: a rule with an evaluable `check:` predicate (`regex`/`grep`) warns **only when the predicate fires** on the proposed content; a rule without one (`check` absent, or `kind: none`/`ast`) warns **on `governs` path match**. Authors: give a rule an evaluable predicate whenever the constraint is mechanically checkable — it eliminates path-match noise on conforming writes.

**Validated by** `check.rule`: `id` matches `R-NNN` and filename; `source` paths resolve (§6); `governs` globs well-formed; `related_specs` IDs resolve; if `check` present, `kind` in enum and (`pattern` required unless `kind: none`).

### 4.3 `cerebrum/bugs/B-NNN-<slug>.md`

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

### 4.4 Atlas artefacts

All atlas leaf files carry minimal frontmatter. **Common optional:** `confidence` (enum, §4.1 of decisions), `related_specs` (list<id>), `sources` (list<path> into `atlas/sources/`).

- **`atlas/decisions/YYYY-MM-DD-<slug>.md`** — **Required:** `id` (`decision.<YYYY-MM-DD>-<slug>`), `title`, `date` (iso-datetime). **Optional:** `supersedes` (list<path>), `cerebrum_rules` (list<id> — rules derived from this decision), plus the common optionals. Body: the narrative ("on DATE we chose X because Y — see source Z").
- **`atlas/stakeholders/<slug>.md`** — **Required:** `id` (`stakeholder.<slug>`), `name` (string), `role` (string). **Optional:** `org`, `contact_pointer` (a pointer, never a secret), common optionals.
- **`atlas/domain/<term>.md`** — **Required:** `id` (`domain.<term>`), `term` (string), `definition` (string). **Optional:** `aliases` (list<string>), `related_specs`.
- **`atlas/sources/<slug>.<ext>`** — raw material; **no frontmatter required** for non-markdown. A sibling `<slug>.meta.md` MAY carry `id` (`source.<slug>`), `kind` (enum `transcript|rfp|slack|pdf|design-doc|other`), `captured` (iso-datetime), `origin` (string).

**Validated by** `check.atlas`: `id` matches the per-kind pattern and the filename; `date`/`captured` ISO; `supersedes`/`sources` paths resolve; `cerebrum_rules`/`related_specs` IDs resolve.

### 4.5 `pulse/` artefacts

Transient; gitignored. Each loop output is markdown with a minimal header. **Always-write convention:** every loop writes its output file on **every** run, overwriting, with a fresh `generated` timestamp — when there is nothing to report, the body carries an explicit "No candidates this cycle." (or loop-appropriate phrasing) rather than an empty or untouched file. The pulse directory is thereby self-documenting: any `pulse/*.md` tells the reader when its loop last ran and what it found or didn't. **Required:** `kind` (string const, e.g. `pulse-hygiene-report`, `pulse-suggestions`, `pulse-rule-candidates`, …), `generated` (iso-datetime), `loop` (string — the skill that wrote it). Suggestion entries inside `suggestions.md` use `S-NNN` IDs.

`dismissed.md` **persists** (rejection memory, design §10.3): one entry per dismissed `S-NNN`, with `dismissed` (iso-datetime) and `expires` (iso-datetime, default +90 days). **Validated by** `check.pulse` (header present; loose otherwise — transient data is not held to artefact-grade rigor).

**Suggestion entries — single S-namespace across all pulse artefacts.** `S-NNN` ids form **one global namespace** shared by every proposal-writing loop, allocated monotonically via the counter file `pulse/.suggestion-counter` (a plain integer; persists like `dismissed.md`; ids are never reused). Proposal sections may appear in **any** `pulse/*.md` loop report — the review CLI discovers them by scanning all of them; the id is a handle, not metadata, so users never need to know which loop proposed what. Each section carries provenance in its own field lines. A duplicate `S-NNN` across files is a hard error at review time.

**Suggestion section shape:** one `## S-NNN: <title>` section per suggestion. Required field lines inside each section:

- `**Type:**` — one of `rule-candidate | skill-proposal | promotion | gated-layer-update | user-directed-capture` (§4.5.1). Absent → treated as `rule-candidate` with a `warning` (v1-era tolerance; v1 reports carried no type). **Validated by** `check.pulse`.
- `**Source:**` — provenance: the proposing loop plus its evidence pointer (session ids, or the report that motivated it). For `promotion`, MUST include the insight file being promoted.
- `**Target:**` — a project-relative path whose permitted root depends on `**Type:**` (§4.5.1 table). Across all types the union of permitted roots is `.cortex/cerebrum/`, `.cortex/atlas/`, `.cortex/insight/map/`, `RULES.md`, and — for `skill-proposal` only — a **new** `.claude/skills/<name>/SKILL.md` path. Existing skill files are never overwritable via accept.
- The **payload**, in one of three operation shapes (§4.5.2): `**Proposed addition:**` (append), `**Proposed edit:**` (replace an exact byte-range of the target), or `**Proposed file:**` (create a new file). Exactly one payload shape per section.

**Fence grammar (nested payloads — resolves B-003).** A payload containing code fences MUST be wrapped in an outer fence **strictly longer** than any fence it contains (CommonMark longer-fence rule: four-plus backticks around a payload with triple-backtick fences). Writers inspect the payload and choose the outer length automatically; the parser honours the opening fence's length and closes only on a fence of at least that length. Accept round-trips the payload **byte-exact**, fences included.

**Counter authority.** `pulse/.suggestion-counter` is the single authoritative id allocator: every loop that emits proposal sections MUST acquire ids from it (via the shared allocator) — never allocate locally, never reuse. Optional: `**Status:** pending | accepted | rejected` (absent = `pending`); free evidence lines (pattern, occurrences, source sessions, confidence) are unconstrained. The review CLI parses exactly these fields; accept applies the payload per its operation shape (§4.5.2).

#### 4.5.1 Suggestion types (v2.0)

The five types, their permitted `**Target:**` roots, their producers, and their accept semantics. A `**Target:**` outside the permitted root for its type is a `check.pulse` `error`.

| `**Type:**` | Producer(s) | Permitted target root | Payload shape | On accept |
|---|---|---|---|---|
| `rule-candidate` | distil, rule-decay (v1) | `.cortex/cerebrum/` | append | append the block to the target (v1 behaviour, unchanged) |
| `skill-proposal` | skill-suggest (v1) | new `.claude/skills/<name>/SKILL.md` | create | write the new skill file (never overwrite an existing one) |
| `promotion` | insight-gaps | `.cortex/cerebrum/`, `.cortex/atlas/`, `RULES.md` | append **or** create | apply the payload to the gated target, inject a `source:` back to the insight file, then **mark the insight original promoted** (§4.10.4) — never delete it |
| `gated-layer-update` | insight-gaps (signal 4-gated) | `.cortex/cerebrum/`, `.cortex/atlas/`, `RULES.md` | **edit** | replace the named byte-range in the target (§4.5.2); a correction to existing gated content is an edit, not an append |
| `user-directed-capture` | insight-gaps (signal 5) | `.cortex/cerebrum/`, `.cortex/atlas/`, `.cortex/insight/map/`, `RULES.md` | append or create | apply to the target the user confirmed; the proposed `**Target:**` is the loop's best guess and is **human-editable before accept** (v2 design §5) |

Notes: `promotion` and `gated-layer-update` never target `.cortex/insight/map/` (insight is ungated — its corrections are direct writes by the gaps loop, §4.10.4, not proposals). `user-directed-capture` is the only type that MAY target insight, because an explicit "remember this" deserves explicit confirmation of *where* it landed even when the landing is ungated.

#### 4.5.2 Payload operation shapes (v2.0)

Every suggestion carries exactly one of three payload shapes. All fenced blocks obey the longer-fence grammar above (byte-exact round-trip).

- **`**Proposed addition:**`** (append) — a fenced block appended to the target verbatim. The target file MUST already exist. This is the v1 shape; unchanged.
- **`**Proposed file:**`** (create) — a fenced block written as the full contents of a **new** file at `**Target:**`. Accept refuses if the target already exists (no clobber).
- **`**Proposed edit:**`** (edit — new at v2.0) — resolves flag F3's append-only limitation. The section carries two fenced blocks, labelled by their opening line:
  - a `current:` block — the exact text to be replaced, which accept locates in the target and which MUST match **byte-exact** (accept **refuses** and reports if it does not — the target drifted since the proposal was written);
  - a `replacement:` block — the text to substitute for it.
  Accept replaces the single located occurrence. A `current:` block that resolves to zero or >1 occurrences is a hard refusal (ambiguous or stale). The edit operation is what makes `gated-layer-update` (a correction to an existing rule/decision) expressible.

Accept is **transactional per suggestion**: a refusal (byte-mismatch, clobber, ambiguous edit) applies nothing and leaves the suggestion `pending`.

**`dismissed.md`** (`kind: pulse-dismissed`) holds one `## S-NNN` section per rejection with `**Dismissed:**` (iso-datetime) and `**Expires:**` (iso-datetime; default now + `pulse.dismissedWindowDays`, 90). `pulse-list` hides unexpired dismissed ids; expired ones may resurface.

`hook-errors.md` (`kind: pulse-hook-errors`) is the hooks' degradation log (§5): hooks **append** one structured entry per internal error (hook name, file involved, failure, iso-datetime), capped at the most recent 100 entries. Unlike loop reports it is append-not-overwrite; like everything in `pulse/` it is transient and surfaced by hygiene.

### 4.6 Developer specs — `.specflow/specs/**/*.spec.md`

From the dev-spec template. **Required (leaf):** `id` (matches path), `status` (enum `draft|implementing|implemented`), `implements` (exactly one `path` to a business spec). **Required (all):** `id`, `status`. **Optional:** `depends_on` (list<id> — dev-spec IDs), `governed_by` (list<id> — cerebrum rule IDs, design §8.4), `governs` (list<glob> — project files this spec governs; feeds anatomy `spec_links`, design §7.2 step 5. **Semantics are deliberately identical to the cerebrum-rule `governs` field (§4.2)** — same glob syntax, project-root-relative resolution, 0 on-disk matches → `warning`. The only divergence is optionality: required on rules because a rule without governed files is meaningless, optional on dev specs because a draft spec may legitimately precede the files it governs). **Domain/capability specs:** `implements` is optional; `depends_on` allowed on capability specs.

```yaml
---
id: schema.validator
status: draft
depends_on: []
implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md
governed_by: []
---
```

Body sections (design §8.1): Intent, Entities (READS/WRITES/CREATES — references only, never schema definitions), Rules (numbered), Acceptance Criteria (Given/When/Then, concrete values), Notes (OPEN: items). **Validated by** `check.dev-spec`: `id` matches path; `status` in enum; on leaves, `implements` present, single-valued, resolves, and is symmetric (§6); `depends_on` IDs resolve and form no cycle; `governed_by` IDs resolve; `governs` globs well-formed (on-disk resolution: `check.dev-spec-governs-resolves`, warning).

### 4.7 Business specs — `.specflow/specs-business/**/*.business.md`

**Required:** `id` (`<domain>.<outcome-slug>`, bare, globally unique), `status` (enum `draft|implementing|implemented`), `implemented_by` (list<path> to dev specs). **Optional:** `depends_on` (list<id> — business-spec IDs).

```yaml
---
id: schema.knowledge-stays-consistent
status: draft
implemented_by:
  - ../../specs/schema/validator.spec.md
---
```

Body sections: Outcome, Who This Is For, User Journey, Business Rules, Success Metrics, Out of Scope, Notes. **No schemas, APIs, or Given/When/Then** (business-spec template). **Status policy (Policy A, mechanical).** A business spec's `status` is `implemented` when **every** dev spec in its `implemented_by:` list has `status: implemented`; until then it stays `draft`/`implementing`. A business spec whose implementers are all implemented but whose own status lags is flagged by `check.business-status` (warning). *Policy B — "implemented when a passing journey test exists" — is the v1.1 target once the test-runner loop ships; Policy A is deliberately the weaker, mechanically-available stand-in until then.*

**Validated by** `check.business-spec`: `id` matches path and is globally unique; `implemented_by` paths resolve and are symmetric (§6); body contains no fenced code / HTTP-verb / `Given`-`When`-`Then` markers → `warning` (drift into dev territory).

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

The compiled citation graph the constellation renderer serves (design §12.8). Emitted by the constellation compiler (invoked by `cortex scan` after anatomy emission). Regenerable; gitignored (Decision 1). Read-only for every consumer.

**Top-level shape (all fields required):**

```json
{
  "schemaVersion": "2.0",
  "generated": "2026-07-02T14:00:00Z",
  "groups": [
    { "id": "anatomy", "label": "Anatomy",
      "children": [{ "id": "anatomy:layer:src/schema", "label": "src/schema" }] }
  ],
  "nodes": [
    { "id": "anatomy:src/cli/init.ts", "module": "anatomy", "label": "init.ts",
      "group": "anatomy:layer:src/cli", "ref": "src/cli/init.ts", "size": 1820 }
  ],
  "edges": [
    { "from": "spec:schema.validator",
      "to": "business:schema.contributor-trusts-project-knowledge",
      "kind": "implements" }
  ],
  "counters": { "anatomy": 96, "cerebrum": 5, "atlas": 0, "specs": 10,
                "edges": 42, "droppedRefs": 0 }
}
```

**Groups** are the Level-1 constellations (design §12.3): exactly four top groups (`anatomy`, `cerebrum`, `atlas`, `specs`), each with children by natural grouping — anatomy by architectural layer (`layers.md`), cerebrum by category (`rules`, `bugs`, core files), atlas by subfolder, specs by domain folder (dev and business nodes share the domain child; `module` distinguishes them).

**Nodes:** `id` is module-prefixed and globally unique — `anatomy:<relpath>`, `rule:R-NNN`, `bug:B-NNN`, `cerebrum:<file>`, `atlas:<artefact-id>`, `spec:<dev-id>`, `business:<business-id>`. `module` is one of `anatomy | rule | bug | cerebrum | atlas | spec-dev | spec-business`. `group` names a declared group/child id. `ref` is the underlying path (anatomy) or artefact id (everything else). When a node's source artefact has no schema-defined ID, its `ref` is the artefact's path relative to the project root — this applies to the cerebrum core files (`preferences.md`, `environment.md`, `do-not-repeat.md`, `decisions.md`) and to any other artefact class that lacks IDs by design. `size` (optional) carries the token estimate on anatomy nodes.

**Edges** come from the §6 citation graph only — never from `graph.json` imports (design §12.7: the constellation is the citation graph, not raw code structure). `kind` names the frontmatter field that produced the edge (`implements`, `depends_on`, `governs`, `governed_by`, `source`, `related_specs`, `spec_links`, `covers`, `cerebrum_rules`, `supersedes`, `sources`). The symmetric `implements`/`implemented_by` pair dedupes to a single `implements` edge. A reference that does not resolve to an emitted node is **dropped and counted** in `counters.droppedRefs` — the compiler is tolerant; complaining about broken refs is the validator's job.

**Determinism:** groups, nodes, and edges are sorted (stable order); two compilations of identical input are byte-identical except `generated`.

**Insight preset (v2.0).** The renderer's view-preset set (design §12.5, five server-side lenses) gains a sixth, **`insight`**, specified here since the schema owns the constellation contract:

- `constellation.json` stays **curated-only** — its shape and byte-determinism contract are unchanged, and it never contains inferred edges or clusters.
- The `insight` preset composes the overlay at **serve time**: the `cortex constellation` server reads `insight/map/graph.json` and `clusters.json` directly, and only when the preset is requested. Nothing from insight is ever compiled into `constellation.json` (no second compilation to drift; the overlay is always as fresh as the last refresh run).
- **Rendering rules:** inferred edges render **dashed** (visually subordinate to solid curated edges; edge weight/opacity MAY additionally encode `high|medium|low` confidence — a renderer detail, not a contract). Tag **clusters render as background colour regions** behind their member nodes (Cytoscape compound/parent styling — same library). The node set is unchanged: insight adds edges and groupings over the *same* nodes, which is why the shared node-id grammar (§4.10.2) makes this a join, not a merge.
- **Default stays curated.** The insight preset is **opt-in per session, never the default** — preserving design §12.1's "proof of comprehension" framing (every edge in the default view is a human-gated claim; inferred edges are visibly second-class hypotheses).

**Validated by** `check.constellation` (only when the file exists): valid JSON; all required top-level keys; node ids unique; every node `group` resolves to a declared group/child id; every edge endpoint resolves to an emitted node id; `module` in enum.

### 4.10 The `insight/` module (v2.0)

The ungated, queryable project-knowledge layer (v2 design §3). Committed in full (Decision 1 amendment). Two content types live side by side in the flat `insight/map/` directory, distinguished by extension: **prose** (`.md`, §4.10.1) and **inferred graph** (`.json`, §4.10.2). The whole module carries a trust contract distinct from the gated layers: **content here is unreviewed** — useful immediately, never having passed the human gate. It never carries write-time enforcement authority (only cerebrum does, design §5.3); a hook never injects it (v2 design §7.4).

#### 4.10.1 Prose files — `insight/map/<topic>.md`

Human-authored or written/updated by `cortex-loop-insight-gaps` (v2 design §5, signals 1–3 and 4-in-insight). Extensible: the gaps loop MAY create a new prose file when a new category surfaces, subject to the ownership and index-maintenance rules of §4.10.3.

**Frontmatter — required:** `kind: insight-prose` (string const), `updated` (iso-datetime — the last write of any kind). **Optional:** `topic` (string; defaults to the filename stem), `related_specs` (list<id>). Frontmatter is deliberately lean (Decision 16): correction history lives in the body, not here.

**Body structure:**
- Free markdown organised under H2 headings by sub-topic.
- Each entry appended by the gaps loop ends with a one-line **provenance trailer**: `_(observed <iso-date>, signal <n>, sessions: <id>, <id>)_`. Human-authored entries need no trailer.
- A file MAY end with a single **`## Corrections`** log (§ below). It is the last H2 in the file when present.

**The `## Corrections` change-log (Decisions 16 + OQ7 rewrite-in-place).** When the gaps loop processes a signal-4 correction whose target content lives in this file, it **rewrites the contradicted text in place** (so the file is currently-right — insight's whole value) **and, in the same write, appends one entry** to the `## Corrections` log preserving the audit trail:

```markdown
## Corrections

- **<iso-date>** — _was:_ "<the original assertion, verbatim>" · _now:_ "<the correction>" ·
  _why:_ <the user's words / context> · sessions: <id>, <id>
```

Rewrite-in-place is the most autonomous write in the system; the log is the non-negotiable counterweight. The `_was:_` text is the exact prior assertion (byte-exact where it fits one line; truncated with `…` and a pointer otherwise). **Validated by** `check.insight-prose`: `kind` const and `updated` present/ISO; if a `## Corrections` heading exists, every list item under it carries the `**<iso-date>**`, `_was:_`, and `_now:_ ` markers; at most one `## Corrections` heading per file.

#### 4.10.2 Inferred graph files (refresh loop only)

Written **only** by `cortex-loop-insight-refresh` (§11.4); never hand-edited (a hand edit is overwritten on the next rebuild). Three files, each a JSON object. **Node ids reuse the constellation node-id grammar** (§4.9: `anatomy:<relpath>`, `rule:R-NNN`, `bug:B-NNN`, `cerebrum:<file>`, `atlas:<artefact-id>`, `spec:<dev-id>`, `business:<business-id>`) — the refresh loop assembles its node set via the constellation compiler's node-emission path, so identity is shared and the §4.9 insight-preset overlay is a join, not a mapping.

**`graph.json`** — inferred concept edges (distinct from `constellation.json`'s curated citation edges; the two never mix):
```jsonc
{
  "schemaVersion": "2.0",
  "generated": "<iso-datetime>",
  "rebuild": "full" | "incremental",
  "nodes": [ { "id": "<constellation-node-id>", "module": "<constellation module enum>", "label": "<string>" } ],
  "edges": [
    { "from": "<node-id>", "to": "<node-id>",
      "kind": "semantically-related" | "same-cluster" | "mentions-same-entity",
      "confidence": "high" | "medium" | "low",
      "rationale": "<one line explaining the inference>" }
  ]
}
```
The `kind` enum is **closed** at 2.0 (extending it is a MINOR bump). `confidence` is `high|medium|low` (Decision 17). Every edge MUST carry a non-empty `rationale` — explainability is a module invariant (v2 design §3.4, "NO embeddings").

**`tags.json`** — per-node structured concept labels:
```jsonc
{ "schemaVersion": "2.0", "generated": "<iso-datetime>",
  "tags": { "<node-id>": ["authentication", "JWT", "session-management"] } }
```
Tags are what make query deterministic (§4.10.5): LLM judgment is spent once, at write time, turning meaning into labels.

**`clusters.json`** — inferred domain clusters:
```jsonc
{ "schemaVersion": "2.0", "generated": "<iso-datetime>",
  "clusters": [ { "id": "cluster:<label-slug>", "label": "Authentication",
                  "members": ["<node-id>", "…"], "rationale": "<one line>" } ] }
```
**Cluster id stability (Decision 14 / OQ1):** `cluster:<label-slug>` where `<label-slug>` is the label lowercased and hyphenated. On a **full** rebuild, a newly-derived cluster reuses an existing cluster's id and label when the member-set **Jaccard similarity ≥ `insight.clusterCarryOverJaccard`** (default 0.5); highest match wins, ties broken by existing-id lexical order. This keeps cluster ids stable across rebuilds despite membership churn, so external references (a spec citing a cluster, a saved constellation view) survive.

**Determinism + carry-over (git-noise mitigation, §3.3 of v2 design).** The three files serialize deterministically: nodes, edges (by `from`,`to`,`kind`), tags (by node id, tags sorted), and clusters (by id, members sorted) are stably ordered, and the only per-run-varying field is `generated`. On a full rebuild, when an edge/tag/cluster whose identity matches an existing entry is re-derived, the existing `rationale`/`confidence` text is **preserved verbatim** rather than regenerated — so only genuinely new or changed inferences produce diff lines. (If this proves insufficient, the OQ4 rationale-sidecar option is revisited at insight-refresh spec time — Decision 20.)

**Validated by** `check.insight-graph`: each file is valid JSON with `schemaVersion` and `generated`; `graph.json` node ids unique and edge endpoints present in its own `nodes` (an endpoint absent from `nodes` → `warning`, tolerant like the constellation's dropped-ref handling); `kind` and `confidence` in their enums; every edge `rationale` non-empty; `tags.json` keys and `clusters.json` member ids are well-formed node ids; cluster ids match `cluster:<slug>` and are unique.

#### 4.10.3 The coordination rule — non-overlapping write targets (named check)

**The load-bearing coordination rule between the two insight loops: the refresh loop writes only `.json` in `insight/map/`; the gaps loop writes only `.md`.** The write-target sets are disjoint by file extension. Consequences: no lock file is needed between the two loops (v2 design §4.3); a human prose edit is safe (the gaps loop appends and reads-before-writing); a human JSON edit is not (the next refresh overwrites it).

`insight/map/` carries **no `_index.md`** — the module `insight/_index.md` (§7.4) fully describes it, and a nested index would be a second file-list for the gaps loop to keep in sync. The gaps loop's one permitted write outside `map/` is the single file-list line in `insight/_index.md` when it creates a new prose file (Decision 13).

**Validated by** `check.insight-ownership`: every file directly under `insight/map/` has extension `.md` or `.json`; the only permitted `.json` basenames are `graph.json`, `tags.json`, `clusters.json`; no `_index.md` exists under `map/`. (The rule is *also* enforced at write time inside each loop's `--apply`/`--propose` bookend, refusing out-of-lane paths — defence in depth, not schema-only.)

#### 4.10.4 Promotion and the promoted marker

When insight content stabilizes and is load-bearing, the gaps loop proposes its graduation into a gated layer via a `promotion` pulse suggestion (§4.5.1). **"Stabilized" is mechanical (Decision 15 / OQ3):** ≥ `insight.promotionMinAgeDays` (default 14) resident in insight, AND ≥ `insight.promotionMinObservations` (default 2) independent session observations — or one distil repetition detection (v2 design §6) — AND no correction logged since the last observation.

On accept of a `promotion`, after the gated write lands (with its `source:` back-reference), the insight original is **marked promoted, not deleted**: the promoted entry gains a trailer `_(promoted <iso-date> → <gated-target-path> via S-NNN)_`. Deletion of the now-redundant insight copy is the human's call. Marking keeps accept auditable (append-plus-annotate) rather than destructive. **Validated by** `check.insight-prose` (the promoted trailer, when present, names an S-id and a path — `warning` if malformed).

#### 4.10.5 Query surface (deterministic, no LLM at query time)

Both Claude and humans query insight through the CLI (v2 design §7.1); all commands are deterministic Core and support `--json`:

- `cortex insight query <topic>` — lexical search across prose files/sections, node tags, and cluster labels; grouped output.
- `cortex insight get <file>` — returns a `map/`-relative file (prose or JSON) verbatim.
- `cortex insight neighbors <node-id>` — graph traversal; `--kind <edge-kind>` filters, `--depth <n>` (default 1) bounds the walk; returns the subgraph with confidences and rationales.
- `cortex insight list` — enumerates all insight files and graph clusters.

Query is **not** a hook-injection mechanism (v2 design §7.4): insight is pull-only, invoked when the scaffolding (CLAUDE.md protocol, `insight/_index.md`, skill steps) says the question warrants it. The payload text of these commands is asserted by the insight dev specs' tests, not by the validator.

---

## 5. Hook payload contracts

From design §5, §6.3, §9.3. All hooks are pure Node file I/O, **warn-never-block** — they inject text into Claude's context and never abort the tool call. Budgets are hard targets the validator does not enforce at runtime but that the hook implementations MUST respect (design §6.3).

| Hook | Trigger | Injects | Budget |
|---|---|---|---|
| `SessionStart` | new session | Pointer block (below) | <100 tok |
| `PreToolUse` (Write/Edit) | before a write | One warning per matching rule (below) | ~0 avg |
| `PostToolUse` (Write/Edit) | after a write | **Nothing to context.** Side effect only: update the file's `anatomy/files.md` row (`tokens`, `sha256`, `last_seen`) and set `needs_purpose_refresh: true`. | n/a |
| `PreToolUse` (Read) | before a read | Summary block (below), incl. the writeback instruction. On by default; opt-out via `cortex.config.json`. | <75 tok |
| `PostToolUse` (Read) | after a read | **Nothing to context.** Sweeps the transcript for unapplied `<cortex:purpose>` tags and applies them to anatomy (`purpose_source: read-time`). Paired with PreRead under one flag. | n/a |

**SessionStart payload:**
```
Cortex is active (schema {{SCHEMA_VERSION}}). See .cortex/_index.md.
Modules: {{PRESENT_MODULES}}.
{{#if fresh hygiene-report}}Hygiene: {{ONE_LINE_SUMMARY}} (.cortex/pulse/hygiene-report.md).{{/if}}
```
The hygiene line is included only if `.cortex/pulse/hygiene-report.md` exists and its `generated` is within `cortex.config.json` `pulse.hygieneFreshnessHours` (default 48). The hook **reads** the report; it never re-runs hygiene (design §10.4).

**PreToolUse (Write/Edit) warning** — emitted once per cerebrum rule whose `governs` glob matches the target path OR whose `check.pattern` matches the proposed content:
```
⚠ Cortex {{RULE_ID}} may apply to {{PATH}}: {{RULE_TITLE}}.
  Source: {{SOURCE_PATHS}}. {{ONE_LINE_GUIDANCE}}
```
No matching rule → no output (the zero-overhead common case).

**PreToolUse (Read) summary** — emitted only if the target path has a row in `anatomy/files.md`:
```
{{PATH}}: {{PURPOSE}} (~{{TOKENS}} tok). Specs: {{SPEC_LINKS}}. Rules: {{APPLICABLE_RULE_IDS}}.
If this purpose is wrong or stale after reading, emit: <cortex:purpose file="{{PATH}}">corrected one-line purpose</cortex:purpose>
{{#if already-read-this-session}}(already read this session){{/if}}
```
The writeback instruction line is included only when the row's `purpose_source` is not already `read-time` (a witnessed correction shouldn't invite constant re-litigating). Budget <75 tokens with the instruction, <50 without.

**PostToolUse (Read) — the capture half.** Always silent (exit 0, empty stdout — the PostWrite envelope discipline). Reads `transcript_path` from stdin, sweeps recent assistant messages for `<cortex:purpose file="...">...</cortex:purpose>` tags not yet applied, validates (path has a row, single line, sanitized, ≤120 chars — a writeback-specific ceiling, not an anatomy-wide purpose limit), and updates the row: purpose + `purpose_source: read-time` + `last_seen`, atomically. Applied-tag memory `pulse/.readback-applied` (hash per applied tag) is **transient and per-session** — it only prevents redundant re-application within a session; re-application across sessions is idempotent and harmless, so the file needs no persistence guarantee. Registered and removed together with PreRead: one config flag governs the pair.

**Envelope (pinned to the Claude Code hooks API, verified 2026-07-02).** All Cortex hooks communicate via **exit 0 + stdout JSON**: SessionStart emits `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": …}}`; the PreWrite warning emits `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow", "additionalContext": …}}`; PostWrite and PostRead emit nothing (empty stdout). No Cortex hook ever exits 2, exits non-zero, or emits `deny`/`ask` — warn-never-block is enforced by the envelope itself. Hook-internal errors degrade (operation proceeds) and append to `pulse/hook-errors.md` (§4.5). Registration entries use the command signature `cortex hook <name>` — that prefix is the **ownership marker** (the JSON transposition of §8's CLAUDE.md marker idiom); tooling manages only entries carrying it.

**No insight hook (v2.0).** The insight module adds **no** hook and no field to any existing hook payload. Insight is pull-only via the CLI (§4.10.5); injecting unreviewed inferred content at SessionStart or PreRead would spend the trust budget on the layer with the weakest trust warrant, and the enforcement channel (PreWrite) reads cerebrum precisely because cerebrum is gated (v2 design §7.4). The hook table above is unchanged from v1.

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
| `source` | rule | atlas decisions / bugs / **insight prose** | list<path> | each resolves (insight form = promotion lineage, §4.5.1) |
| `source` | atlas decision / `RULES.md` entry (promoted) | insight prose | path | resolves; written by `promotion` accept (§4.10.4) |
| `governs` | rule | files | list<glob> | well-formed; 0 on-disk matches → `warning` |
| `governs` | dev spec | files | list<glob> | identical to rule `governs` (intentional, §4.6); 0 on-disk matches → `warning` |
| `related_specs` | rule / atlas | dev or business specs | list<id> | each resolves |
| `spec_links` | anatomy row | dev specs | list<id> | each resolves |
| `affects` | bug | rule / file / spec | mixed list | resolve by shape: `R-*`→rule, path-like→file, else→spec ID |
| `cerebrum_rules` | atlas decision | rules | list<id> | each resolves |
| `supersedes` | atlas decision | atlas decisions | list<path> | each resolves |
| `sources` | atlas leaf | atlas sources | list<path> | each resolves |

**Global validation rules:**

1. **ID uniqueness** — every `id` across `.specflow/specs/`, `.specflow/specs-business/`, `cerebrum/rules/`, `cerebrum/bugs/`, and atlas is unique within its kind, and spec IDs (dev+business) are unique across **both** trees combined. Duplicate → `error`. (Insight node ids are *not* in this namespace — they are borrowed constellation ids, §4.10.2, and carry no uniqueness obligation of their own beyond within `graph.json`.)
2. **`implements` is single-valued** — zero or >1 on a leaf → `error` (design §8.1: many-to-one is a decomposition smell).
3. **Bidirectional symmetry** — `implements`↔`implemented_by` MUST agree in both directions. Asymmetry → `error` naming both files.
4. **Resolution** — every path resolves to an existing file (relative to the referrer); every ID resolves in the global index. Unresolved → `error`.
5. **Acyclicity** — `depends_on` graphs (dev and business, separately) MUST be acyclic. Cycle → `error` listing the cycle.

### 6.1 `ValidationReport` (the validator's output contract)

The validator produces a `ValidationReport` — the structured result `validator.spec.md` references. Schema:

```json
{
  "schemaVersion": "2.0",
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

Filled example (`cerebrum/_index.md`):
```markdown
# Cerebrum — index

**Read this when:** the user asks "why" about a convention or decision, before you
propose a write that touches governed files, or when triaging a bug.

**What's here:**
- `rules/` — one file per rule (R-NNN). Match a write's path against each rule's `governs`.
- `bugs/` — the bug ledger (B-NNN), classified by the seven-type taxonomy.
- `preferences.md`, `environment.md` — project conventions and operational pointers.
- `decisions.md` — ADRs; each cross-links to `atlas/decisions/`.

**How to navigate:** from a rule, follow `source:` to the atlas decision or bug that
justifies it; follow `governs:` to the files it constrains; follow `related_specs:` to
the specs it touches.
```

**Validated by** `check.index-shape`: `_index.md` present in every `.cortex/` directory; contains the `Read this when:` and `What's here:` headings; soft token-budget check → `warning` over 300.

### 7.2 `.specflow/specs/_index.md` — the engineering index

The dev-tree root `_index.md` is BOTH an active prompt AND the dependency/build index. Required sections: a short `Read this when:` prompt, `## Domains` (list with one line each), `## Dependency Graph` (textual edges or a note), `## Build Order` (topological phases; see design §16.2). **Validated by** `check.specs-index`: present; has the three section headings.

### 7.3 `_overview.md` — folder overview (every dir in both spec trees)

Format from the folder-overview template: `## What this is`, `## What it covers`, `## Why it's grouped this way`, optional `## Related groups`. Dev-tree tone may use IDs/paths; business-tree prose MUST NOT contain file paths or IDs except under `## Related groups`. **Validated by** `check.overview-shape`: the three required headings present; business-tree body path/ID scan → `warning`.

### 7.4 `insight/_index.md` — the ungated-module active prompt (v2.0)

`insight/_index.md` follows the §7.1 active-prompt shape (validated the same way by `check.index-shape`) with one module-specific requirement: because insight is the sole **ungated** module, its index MUST state the trust model — a `Read this when:` or navigation line that names insight as unreviewed and points at the CLI as the query surface. This is where Claude learns *how much to trust* what it finds, not just the file list. `insight/map/` itself carries no `_index.md` (§4.10.3); this one index describes both the prose and the inferred files.

Filled template:
```markdown
# Insight — index

**Read this when:** you need conceptual orientation — how things relate, what a
domain cluster contains, or how setup/testing/deploy actually work here. Insight
is ungated: useful immediately, not human-reviewed. For enforced rules, cerebrum.

**What's here:**
- `map/*.md` — observed project knowledge (setup, testing, deploy, conventions, …).
- `map/graph.json`, `tags.json`, `clusters.json` — the inferred concept map. Query
  via CLI; never hand-edit.

**How to navigate:** `cortex insight query <topic>` first; `cortex insight
neighbors <node-id>` to walk relations; `cortex insight list` to see everything.
Treat claims here as unreviewed — trace load-bearing ones before relying on them.
```

**Validated by** `check.insight-index` (in addition to `check.index-shape`): the body names insight as ungated/unreviewed and references `cortex insight` — `warning` if the trust-model line is absent (the shape itself is the `check.index-shape` error).

---

## 8. CLAUDE.md Cortex section template

`cortex init` injects this block into the project's CLAUDE.md (design §6.1). Hard budget **<400 tokens**. Substitution points in `{{…}}`.

```markdown
<!-- cortex:start v{{SCHEMA_VERSION}} -->
## Cortex

Cortex is active on **{{PROJECT_NAME}}**. The knowledge layer lives in `.cortex/`:

- `anatomy/` — per-file map (purpose, tokens, governing specs). What each file is.
- `cerebrum/` — rules, decisions, preferences, and the bug ledger. The "why" and the "must".
- `atlas/` — stakeholders, decisions (narrative), domain terms, source materials.
- `insight/` — ungated inferred/observed knowledge: a concept map plus setup/testing/deploy notes. Query it via `cortex insight query <topic>`; treat it as unreviewed.

**Protocol:** before working a task, read the relevant `_index.md` first — they are
prompts that tell you what to read and when. For "why" questions, grep `cerebrum/` and
`atlas/`. For unfamiliar terms, check `atlas/domain/`. For "how does X hang together"
or "how do we do Y here", run `cortex insight query` before grepping the code. Follow
frontmatter cross-references (the citation graph) to trace any claim to its source.

Specs are the source of truth: `.specflow/specs-business/` (outcomes) and
`.specflow/specs/` (implementation), linked by `implements:`/`implemented_by:`. Don't
let the trees drift.

Modules present: {{PRESENT_MODULES}}. Schema: {{SCHEMA_VERSION}}.
<!-- cortex:end -->
```

The `<!-- cortex:start … -->`/`<!-- cortex:end -->` markers delimit the managed block so `cortex init` can update it idempotently without touching the rest of CLAUDE.md. **Validated by** `check.claude-md`: if CLAUDE.md exists, the managed block is well-formed and its `v…` matches `cortex.config.json`.

---

## 9. `loop.md` template (Decision 6)

Optional root file giving an autonomous `/loop` session its standing context (design §11). Written only when `cortex.config.json` `loop.enabled` is true.

```markdown
# Loop context

You are running as an autonomous loop on {{PROJECT_NAME}}. Cortex is your memory.

**Before acting:** read `.cortex/_index.md` and the `_index.md` of any module you'll
touch. You start cold every run — Cortex is how you recover what prior runs learned.

**Never mutate gated content.** Cerebrum, atlas, `RULES.md`, and both spec trees change
only through the human gate — write proposals to `.cortex/pulse/` and the user applies
them via `cortex pulse-accept <id>`. You MAY maintain machine-owned ungated state directly
only if you are its designated owner loop (anatomy, `insight/map/`). Everything else is a
proposal. (The narrow, spec-governed exceptions are the test-runner's writer/verifier code
path and bug-triage's fill-only classification.)

**Conform to the schema.** Every artefact you write carries schema-valid frontmatter
(schema {{SCHEMA_VERSION}}). Run the validator on anything you produce.

**Stop condition:** {{GOAL}}.
```

**Validated by** `check.loop-md` (only if present): contains the never-mutate-gated-content clause and a `Stop condition:` line.

### 9.1 Desktop scheduled-task naming (project scoping)

`~/.claude/scheduled-tasks/` is one global namespace per user, so every Cortex-managed task name MUST be project-scoped:

```
<project-slug>-<short-hash>-<canonical-task-name>
```

- **`project-slug`** — the project root's folder name, slugged: lowercased; every character outside `[a-z0-9-]` replaced with `-`; consecutive `-` collapsed; leading/trailing `-` trimmed; empty result → `project`.
- **`short-hash`** — the first 6 hex chars of SHA256 of the project root's absolute path (resolved, no trailing slash). The slug alone collides across same-named folders (`~/work/api` vs `~/personal/api`); the hash guarantees uniqueness; the slug preserves at-a-glance scannability in the Desktop UI.
- **`canonical-task-name`** — the task's full identity, applying to every Cortex-managed task regardless of lineage: `cortex-pulse-hygiene`, `cortex-pulse-distil`, `cortex-loop-skill-suggest`, `cortex-loop-anatomy-refresh-deep`, `cortex-loop-rule-decay`, `cortex-loop-atlas-staleness`, `cortex-loop-onboarding-drift`, `cortex-loop-spec-drift`, `specflow-lint`, `specflow-verify`, `cortex-loop-test-runner`, `cortex-loop-bug-triage`, and — new at v2.0 — `cortex-loop-insight-refresh`, `cortex-loop-insight-gaps`. Fourteen scheduled tasks total at 2.0 (the fifteenth loop, anatomy-refresh-fast, remains the git post-commit hook).

Example: a project at `/Users/me/dev/api` registers `api-a3f2b1-cortex-pulse-hygiene`, `api-a3f2b1-specflow-lint`, ….

**The task name is registration identity only** — the SKILL.md frontmatter `name:` carries the scoped name, but the prompt body invokes the *underlying skill* by its real name (`cortex-pulse-hygiene`, `specflow-lint`, …). Tooling recognises its own project's tasks by the `<slug>-<hash>-` prefix plus a canonical suffix, and ignores every other project's.

---

## 10. Schema versioning policy

### 10.1 Where the version lives

`.cortex/cortex.config.json` (committed). Minimum shape:

```json
{
  "schemaVersion": "2.0",
  "anatomy": { "exclude": ["dist/**", "node_modules/**"], "enhancement": "none" },
  "hooks": { "preRead": true },
  "pulse": { "distilThresholdN": 3, "dismissedWindowDays": 90, "hygieneFreshnessHours": 48 },
  "insight": { "clusterCarryOverJaccard": 0.5, "promotionMinAgeDays": 14, "promotionMinObservations": 2 },
  "harness": { "maxIterations": 3 },
  "loop": { "enabled": false }
}
```

**Required:** `schemaVersion` (string `MAJOR.MINOR`). All other keys optional with the defaults shown. `hooks.preRead` governs the **Read pair** (PreRead + PostRead) as one opt-out flag; `cortex init` writes it explicitly on fresh projects so the config self-documents. The `insight` block (new at 2.0) tunes cluster-id carry-over (§4.10.2) and promotion eligibility (§4.10.4); all three keys are optional with the defaults shown. **Validated by** `check.config`: valid JSON; `schemaVersion` present and parseable; unknown keys → `warning`.

### 10.2 Version semantics (semver-lite, MAJOR.MINOR)

- **MINOR bump** = backward-compatible: new optional fields, new artefact kinds, relaxed rules. A validator for `1.x` MUST accept any `1.y` project where `y ≤ x` cleanly, and SHOULD accept `y > x` treating unknown optional fields as `warning` (forward tolerance).
- **MAJOR bump** = breaking: a field removed/renamed, an optional field made required, a value's meaning changed, a directory moved.

### 10.3 Validator behaviour on mismatch (replaces the design's per-artefact idea, Decision 3)

The validator declares a `supportedMajor` and `supportedMinor`. Reading `cortex.config.json` `schemaVersion`:

- **MAJOR > supported** → single `error` (`check.config`, clause §10.3): refuse to validate further against the wrong contract; tell the user to upgrade Cortex.
- **MAJOR < supported** → single `error` recommending `cortex migrate` (below).
- **MAJOR ==, MINOR > supported** → one `warning`; proceed with forward tolerance.
- **Equal** → proceed normally.

### 10.4 Migration

A MAJOR bump ships a migration that `cortex migrate` (or `cortex init` on an existing project) applies. Moved/renamed paths leave a **deprecation marker** at the old location pointing at the new one (design §8.5), retained until the next MAJOR. Migrations are deterministic Core operations — no LLM.

**1.0→2.0 waiver (Decision 19 / v2 design flag F5).** This requirement is explicitly **waived for the 1.0→2.0 transition only**: there are no external users, and the Cortex repository itself moves `specs/`→`.specflow/specs/` (etc.) and gains `insight/` as part of the v2 build. No `cortex migrate` for 2.0 ships and no deprecation markers are left at the old `specs/` roots. The policy holds in full for every **future** MAJOR, once external users exist. (`cortex init` on a pre-2.0 project without the migration would treat the old trees as absent — acceptable because no such external project exists.)

---

## Appendix A — Validator check catalogue

The mechanical check set (one row ⇒ one implementable check). Grouped by the design §3.2 facet.

| Check | Enforces | Clause | Severity on fail |
|---|---|---|---|
| `check.layout` | `.cortex/` directory layout (incl. `insight/`; `.specflow/`-rooted trees) | §1, §2.3 | error |
| `check.index-present` / `check.index-shape` | every `.cortex/` dir (incl. `insight/`) has a well-formed `_index.md` | §7.1 | error / warning |
| `check.insight-index` | `insight/_index.md` states the ungated trust model + names the CLI | §7.4 | warning |
| `check.specs-index` | `.specflow/specs/_index.md` shape | §7.2 | error |
| `check.overview-present` / `check.overview-shape` | every spec-tree dir has a well-formed `_overview.md` | §2.2, §7.3 | error / warning |
| `check.id-matches-path` | spec ID equals its path (tree root stripped, §2.2) | §2.2 | error |
| `check.anatomy-files` / `check.anatomy-graph` | anatomy artefact shapes | §4.1 | error / warning |
| `check.anatomy-purpose-source` | rows with a populated purpose carry `purpose_source` (pre-provenance rows grandfathered until touched) | §4.1 | warning |
| `check.rule` | rule frontmatter + `check` predicate | §4.2 | error |
| `check.bug` | bug frontmatter + taxonomy | §4.3 | error |
| `check.atlas` | atlas artefact frontmatter | §4.4 | error |
| `check.pulse` | pulse header presence; suggestion `**Type:**` present + in enum; `**Target:**` root permitted for its type; exactly one payload shape | §4.5, §4.5.1, §4.5.2 | warning (header) / error (type/target/payload) |
| `check.insight-prose` | `insight/map/*.md` frontmatter (`kind`, `updated`); `## Corrections` log entry shape; promoted-trailer shape | §4.10.1, §4.10.4 | error (frontmatter) / warning (log & trailer) |
| `check.insight-graph` | `graph.json`/`tags.json`/`clusters.json` shapes: JSON valid, node-id grammar, `kind`/`confidence` enums, non-empty `rationale`, cluster-id form + uniqueness | §4.10.2 | error (edge endpoint absent from `nodes` → warning) |
| `check.insight-ownership` | `insight/map/` holds only `.md` + the three named `.json`; no `_index.md` under `map/` (the loop write-lane rule) | §4.10.3 | error |
| `check.dev-spec` | dev-spec frontmatter + links | §4.6 | error |
| `check.rule-governs-resolves` | every glob in a rule's `governs` matches ≥1 real file | §4.2, §6 | warning |
| `check.dev-spec-governs-resolves` | every glob in a dev spec's `governs` matches ≥1 real file | §4.6, §6 | warning |
| `check.business-spec` | business-spec frontmatter + no-dev-content | §4.7 | error (frontmatter) / warning (content) |
| `check.business-status` | business status lags its all-implemented `implemented_by` (Policy A) | §4.7 | warning |
| `check.covers-resolves` | scenario `covers:` resolves | §4.8 | error |
| `check.xref-resolve` | all paths/IDs resolve | §6 | error |
| `check.xref-symmetry` | `implements`↔`implemented_by` | §6 | error |
| `check.xref-unique` | global ID uniqueness | §6 | error |
| `check.xref-acyclic` | `depends_on` acyclicity | §6 | error |
| `check.hook-config` | registered hooks match config | §5 | error |
| `check.claude-md` | managed CLAUDE.md block | §8 | error |
| `check.loop-md` | `loop.md` clauses (if present) | §9 | warning |
| `check.config` | `cortex.config.json` + version | §10 | error |
| `check.constellation` | constellation.json shape, id uniqueness, group/edge resolution (stays curated-only; insight preset composes at serve time) | §4.9 | error |

Check count: 24 at v1.0 → **28 at v2.0** (added `check.insight-index`, `check.insight-prose`, `check.insight-graph`, `check.insight-ownership`; `check.pulse` gained error-severity clauses for typed/targeted suggestions; several existing checks re-rooted for `.specflow/` without changing their IDs).

---

**End of schema v2.0 draft.** Changes from 1.0: the `insight/` module (§4.10) and its four checks; the typed pulse gate with edit-and-create payloads (§4.5.1–4.5.2); the `.specflow/` re-rooting (§2.3); the restated loop-write invariant (Decision 13, §9); the insight constellation preset (§4.9); config `insight` block (§10.1); and the §10.4 migration waiver (Decision 19). Next: reconcile `.specflow/specs/schema/validator.spec.md` against this contract (the four new checks + the re-rooted paths), then proceed to implementation under the v2 build order (v2 design §13).
