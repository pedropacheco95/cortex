# Cortex Schema — The Contract Between Core and Skills

**Schema version:** `1.0`
**Status:** Draft for review by Pedro.
**Depends on:** `cortex-design.md` (the design doc). Where the two disagree, this document wins on file formats, frontmatter, cross-references, and versioning — that is its job. Where the design doc is silent or vague, this document **makes the decision** (see §0) rather than deferring.

This is the load-bearing artefact named in design §3.2. **Cortex Core implements it; Skills consume it; both reference it by version** (recorded in `.cortex/cortex.config.json`, §10). It is precise enough that the schema validator (`specs/schema/validator.spec.md`) can be implemented mechanically from it.

Conventions used in this document:

- **MUST / SHOULD / MAY** carry their usual normative force. A `MUST` violation is an `error`; a `SHOULD` violation is a `warning`.
- "Frontmatter" means a YAML block delimited by `---` at the very top of a markdown file.
- "Validated by" names the validator check that enforces a rule. The validator is the single mechanical enforcer; loops (`specflow-lint`, `specflow-verify`) layer additional non-schema checks on top.

---

## 0. Decisions made where the design doc was vague

These were underspecified or contradictory in `cortex-design.md`. Each is now **locked** for schema v1.0. Override any of them and the dependent sections change.

1. **Git policy: §14 wins over §13.2.** Design §13 step 2 says "append `.cortex/` to `.gitignore`"; §14 says cerebrum and atlas (minus sources) are committable. These contradict. **Decision:** `cortex init` gitignores the specific regenerable/sensitive/transient paths only — `.cortex/anatomy/`, `.cortex/atlas/sources/`, `.cortex/pulse/`, and `.cortex/constellation.json` (compiled, regenerable — §4.9) — never the whole `.cortex/`. `.cortex/cortex.config.json`, `.cortex/cerebrum/`, and `.cortex/atlas/` (minus `sources/`) are committed. (§1, §10)

2. **One global spec-ID namespace; no tree prefix.** Design §8.2 shows `covers: [business.auth.secure-account-access]` (a `business.` prefix) while the business-spec template uses bare `id: auth.secure-account-access`. **Decision:** all spec IDs — dev and business — live in **one global namespace, are bare (no `business.`/`dev.` prefix), and MUST be globally unique.** `depends_on:` and `covers:` reference bare IDs. The `business.` prefix from §8.2 is dropped. (§4.6, §4.7, §6)

3. **Schema version is project-level, not per-artefact.** Design implies artefacts might each declare a version. **Decision:** the version is declared **once**, in `.cortex/cortex.config.json` (`schemaVersion`). Individual artefacts do **not** carry a version field; they inherit the project version. The validator reads `cortex.config.json` to know which contract to enforce. (§10)

4. **`covers:` completeness is NOT a schema-validator concern.** The validator checks that every `covers:` entry *resolves*. The constraint "every business spec appears in ≥1 scenario's `covers:`" (§8.2) is a **verification-pass** check owned by `specflow-verify` (design §11.4), because it is a project-completeness assertion, not a per-file conformance rule. (§3, §6, and reflected back into `validator.spec.md`)

5. **`anatomy/files.md` is markdown frontmatter + a table.** Design never fixes the format. **Decision:** a YAML frontmatter header (anatomy-level metadata) followed by one markdown table row per file. List-valued cells (`spec_links`) are space-separated bare IDs. (§4.1)

6. **`loop.md` lives at the project root and is optional.** Design §11 names it for `/loop` integration but never specifies it. **Decision:** `cortex init` MAY write a root `loop.md` (off unless `cortex.config.json` `loop.enabled` is true). Format in §9. (§9)

7. **Confidence enum is `STATED | EXTRACTED | INFERRED`.** Design §9.2 shows `confidence: EXTRACTED` with no enum. **Decision:** those three values; optional on cerebrum and atlas artefacts; absent means `STATED`. (§4.2, §4.4)

8. **ID prefixes and padding:** rules `R-NNN`, bugs `B-NNN`, pulse suggestions `S-NNN` — `-` plus a zero-padded integer, **minimum 3 digits**, monotonic per project, never reused. Atlas decisions are dated slugs (`YYYY-MM-DD-slug`), not `D-NNN`. (§4.2, §4.4)

9. **Timestamps are ISO-8601 UTC** with a trailing `Z` (e.g. `2026-06-30T14:00:00Z`). (everywhere)

10. **Two index kinds, named distinctly.** `_index.md` = an **active prompt** (every `.cortex/` directory, plus `specs/_index.md` which is the dependency/build index). `_overview.md` = a **folder overview** (every directory in `specs/` and `specs-business/`). A directory never needs both except the `specs/` root, which has `_index.md` (engineering index) and its domains have `_overview.md`. (§2, §7)

11. **Every `*.spec.md` is treated as a leaf for the single-`implements:` rule.** The leaf-vs-aggregate distinction is not encoded in the path, so `check.dev-spec`/`check.xref-*` apply the "exactly one `implements:`" requirement to every dev spec file. Domain/capability aggregate specs that legitimately omit `implements:` are permitted per §4.6, but if `implements:` is present it MUST be single-valued. (surfaced from the validator build; enforced at §4.6, §6, Appendix A `check.dev-spec`)

12. **A MAJOR schema-version mismatch short-circuits all other checks.** When `cortex.config.json` declares a MAJOR above (or below) the validator's supported MAJOR, the validator emits the single `check.config` error (§10.3) and runs no further checks — it does not validate against the wrong contract. (surfaced from the validator build; enforced at §10.3, Appendix A `check.config`)

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
└── pulse/                      [gitignored]  transient loop outputs (§4.5)
    ├── _index.md
    ├── dismissed.md                          rejection memory (persists)
    └── *.md                                  reports, overwritten each run
```

The two spec trees and the test tree live at the **project root**, not under `.cortex/` (design §3.3, Layer 0): `specs/`, `specs-business/`, `tests/`. They are covered in §2 and §3.

**Validated by** `check.layout`: every directory listed above (when its module is present) exists and carries the required `_index.md`; `pulse/` and `anatomy/` contents beyond the fixed names are tolerated (transient/generated).

---

## 2. `specs/` and `specs-business/` conventions

From design §8.1. Both trees are three conceptual levels: **domain → capability → leaf**. Only **leaf** specs are implementable.

### 2.1 Layout

```
specs/                              # developer specs (implementation contract)
├── _index.md                       # ACTIVE PROMPT + dependency graph & build order (§7.4)
├── _overview.md                    # folder overview of the whole dev tree
└── <domain>/
    ├── _overview.md
    ├── <capability>/
    │   ├── _overview.md
    │   └── <leaf>.spec.md
    └── <leaf>.spec.md              # a leaf MAY sit directly under a domain (e.g. schema.validator)

specs-business/                     # business specs (user-outcome layer)
├── _overview.md
└── <domain>/
    ├── _overview.md
    └── <persona-journey>.business.md
```

### 2.2 Rules

- Every directory in **both** trees MUST contain an `_overview.md` (design §6; folder-overview format in §7.3). **Validated by** `check.overview-present`.
- `specs/` root additionally MUST contain `_index.md` (§7.4). **Validated by** `check.index-present`.
- Domain dirs: lowercase, hyphenated. Capability dirs: lowercase, hyphenated.
- Dev leaf files: `<leaf>.spec.md`. Business files: `<persona-journey>.business.md`, the name starting with the persona doing the action (business-spec template).
- **IDs follow the path.** `specs/auth/registration/email-signup.spec.md` → `auth.registration.email-signup`. A leaf directly under a domain → `<domain>.<leaf>` (e.g. `schema.validator`). **Validated by** `check.id-matches-path`.
- Capability folders with leaves are RECOMMENDED; a leaf directly under a domain is permitted when the domain has a single cohesive unit. No per-leaf subfolders.

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

---

## 4. Frontmatter contracts per file type

All artefacts that carry frontmatter use a leading `---`-delimited YAML block. Unknown fields are a `warning` (forward-compat tolerance), missing required fields an `error`. Field types: `string`, `enum`, `list<T>`, `path` (relative path string), `id` (bare dot/dash ID), `glob`, `int`, `iso-datetime`, `sha256` (64 hex chars).

### 4.1 `anatomy/files.md`

A frontmatter header plus one table row per indexed file. `files.md` is regenerable (gitignored).

**Header frontmatter — required:** `kind: anatomy-files` (string const), `last_full_scan` (iso-datetime). **Optional:** `file_count` (int).

**Per-file row columns (in order):** `path` (project-relative), `purpose` (one line), `tokens` (int estimate), `sha256` (content hash, change detection), `last_seen` (iso-datetime), `spec_links` (space-separated dev-spec IDs, or `-`), `needs_purpose_refresh` (`true`/`false`).

```markdown
---
kind: anatomy-files
last_full_scan: 2026-06-30T14:00:00Z
file_count: 3
---

| path | purpose | tokens | sha256 | last_seen | spec_links | needs_purpose_refresh |
|------|---------|--------|--------|-----------|------------|-----------------------|
| src/cli/init.ts | Bootstraps a project: scan, hooks, scaffolding. | 1820 | 9f2c… | 2026-06-30T14:00:00Z | core-cli.init | false |
| src/schema/validate.ts | Validates an artefact tree against the schema. | 2440 | a1b3… | 2026-06-30T14:00:00Z | schema.validator | false |
```

**Validated by** `check.anatomy-files`: header present; every row has all 7 columns; `tokens` int; `sha256` 64-hex; timestamps ISO; each `spec_links` ID resolves (§6).

`graph.json`: `{ "nodes": ["path", …], "edges": [{ "from": "path", "to": "path", "kind": "import"|"export" }] }`. **Validated by** `check.anatomy-graph` (valid JSON; node paths exist on disk → missing = `warning`). `layers.md`: free markdown with an H2 per layer listing member paths; advisory, `warning`-only checks.

### 4.2 `cerebrum/rules/R-NNN-<slug>.md`

**Required:** `id` (`R-NNN`), `title` (string), `source` (list<path> — atlas decisions and/or bug files justifying the rule), `governs` (list<glob> — anatomy/file paths the rule applies to). **Optional:** `related_specs` (list<id>), `confidence` (enum `STATED|EXTRACTED|INFERRED`, default `STATED`), `check` (the machine-checkable predicate, below), `status` (enum `active|retired`, default `active`).

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

Transient; gitignored. Each loop output is markdown with a minimal header. **Required:** `kind` (string const, e.g. `pulse-hygiene-report`, `pulse-suggestions`, `pulse-rule-candidates`, …), `generated` (iso-datetime), `loop` (string — the skill that wrote it). Suggestion entries inside `suggestions.md` use `S-NNN` IDs.

`dismissed.md` **persists** (rejection memory, design §10.3): one entry per dismissed `S-NNN`, with `dismissed` (iso-datetime) and `expires` (iso-datetime, default +90 days). **Validated by** `check.pulse` (header present; loose otherwise — transient data is not held to artefact-grade rigor).

`hook-errors.md` (`kind: pulse-hook-errors`) is the hooks' degradation log (§5): hooks **append** one structured entry per internal error (hook name, file involved, failure, iso-datetime), capped at the most recent 100 entries. Unlike loop reports it is append-not-overwrite; like everything in `pulse/` it is transient and surfaced by hygiene.

### 4.6 Developer specs — `specs/**/*.spec.md`

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

### 4.7 Business specs — `specs-business/**/*.business.md`

**Required:** `id` (`<domain>.<outcome-slug>`, bare, globally unique), `status` (enum `draft|implementing|implemented`), `implemented_by` (list<path> to dev specs). **Optional:** `depends_on` (list<id> — business-spec IDs).

```yaml
---
id: schema.knowledge-stays-consistent
status: draft
implemented_by:
  - ../../specs/schema/validator.spec.md
---
```

Body sections: Outcome, Who This Is For, User Journey, Business Rules, Success Metrics, Out of Scope, Notes. **No schemas, APIs, or Given/When/Then** (business-spec template). **Validated by** `check.business-spec`: `id` matches path and is globally unique; `implemented_by` paths resolve and are symmetric (§6); body contains no fenced code / HTTP-verb / `Given`-`When`-`Then` markers → `warning` (drift into dev territory).

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
  "schemaVersion": "1.0",
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

**Validated by** `check.constellation` (only when the file exists): valid JSON; all required top-level keys; node ids unique; every node `group` resolves to a declared group/child id; every edge endpoint resolves to an emitted node id; `module` in enum.

---

## 5. Hook payload contracts

From design §5, §6.3, §9.3. All hooks are pure Node file I/O, **warn-never-block** — they inject text into Claude's context and never abort the tool call. Budgets are hard targets the validator does not enforce at runtime but that the hook implementations MUST respect (design §6.3).

| Hook | Trigger | Injects | Budget |
|---|---|---|---|
| `SessionStart` | new session | Pointer block (below) | <100 tok |
| `PreToolUse` (Write/Edit) | before a write | One warning per matching rule (below) | ~0 avg |
| `PostToolUse` (Write/Edit) | after a write | **Nothing to context.** Side effect only: update the file's `anatomy/files.md` row (`tokens`, `sha256`, `last_seen`) and set `needs_purpose_refresh: true`. | n/a |
| `PreToolUse` (Read) | before a read | Summary block (below). Opt-in via `cortex.config.json`. | <50 tok |

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
{{#if already-read-this-session}}(already read this session){{/if}}
```

**Envelope (pinned to the Claude Code hooks API, verified 2026-07-02).** All Cortex hooks communicate via **exit 0 + stdout JSON**: SessionStart emits `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": …}}`; the PreWrite warning emits `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow", "additionalContext": …}}`; PostWrite emits nothing (empty stdout). No Cortex hook ever exits 2, exits non-zero, or emits `deny`/`ask` — warn-never-block is enforced by the envelope itself. Hook-internal errors degrade (operation proceeds) and append to `pulse/hook-errors.md` (§4.5). Registration entries use the command signature `cortex hook <name>` — that prefix is the **ownership marker** (the JSON transposition of §8's CLAUDE.md marker idiom); tooling manages only entries carrying it.

**Validated by** `check.hook-config`: the hook entries `cortex init` writes to `.claude/settings.json` match the registered hooks; the PreRead entry is present iff `cortex.config.json` `hooks.preRead` is true. The payload *text* is the hooks' contract with Claude, asserted by the hook specs' tests, not by the validator.

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
| `source` | rule | atlas decisions / bugs | list<path> | each resolves |
| `governs` | rule | files | list<glob> | well-formed; 0 on-disk matches → `warning` |
| `governs` | dev spec | files | list<glob> | identical to rule `governs` (intentional, §4.6); 0 on-disk matches → `warning` |
| `related_specs` | rule / atlas | dev or business specs | list<id> | each resolves |
| `spec_links` | anatomy row | dev specs | list<id> | each resolves |
| `affects` | bug | rule / file / spec | mixed list | resolve by shape: `R-*`→rule, path-like→file, else→spec ID |
| `cerebrum_rules` | atlas decision | rules | list<id> | each resolves |
| `supersedes` | atlas decision | atlas decisions | list<path> | each resolves |
| `sources` | atlas leaf | atlas sources | list<path> | each resolves |

**Global validation rules:**

1. **ID uniqueness** — every `id` across `specs/`, `specs-business/`, `cerebrum/rules/`, `cerebrum/bugs/`, and atlas is unique within its kind, and spec IDs (dev+business) are unique across **both** trees combined. Duplicate → `error`.
2. **`implements` is single-valued** — zero or >1 on a leaf → `error` (design §8.1: many-to-one is a decomposition smell).
3. **Bidirectional symmetry** — `implements`↔`implemented_by` MUST agree in both directions. Asymmetry → `error` naming both files.
4. **Resolution** — every path resolves to an existing file (relative to the referrer); every ID resolves in the global index. Unresolved → `error`.
5. **Acyclicity** — `depends_on` graphs (dev and business, separately) MUST be acyclic. Cycle → `error` listing the cycle.

### 6.1 `ValidationReport` (the validator's output contract)

The validator produces a `ValidationReport` — the structured result `validator.spec.md` references. Schema:

```json
{
  "schemaVersion": "1.0",
  "target": "specs/",
  "conformant": false,
  "violations": [
    {
      "severity": "error",
      "check": "check.dev-spec",
      "clause": "§4.6",
      "location": { "path": "specs/schema/validator.spec.md", "key": "implements" },
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

### 7.2 `specs/_index.md` — the engineering index

The dev-tree root `_index.md` is BOTH an active prompt AND the dependency/build index. Required sections: a short `Read this when:` prompt, `## Domains` (list with one line each), `## Dependency Graph` (textual edges or a note), `## Build Order` (topological phases; see design §16.2). **Validated by** `check.specs-index`: present; has the three section headings.

### 7.3 `_overview.md` — folder overview (every dir in both spec trees)

Format from the folder-overview template: `## What this is`, `## What it covers`, `## Why it's grouped this way`, optional `## Related groups`. Dev-tree tone may use IDs/paths; business-tree prose MUST NOT contain file paths or IDs except under `## Related groups`. **Validated by** `check.overview-shape`: the three required headings present; business-tree body path/ID scan → `warning`.

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

**Protocol:** before working a task, read the relevant `_index.md` first — they are
prompts that tell you what to read and when. For "why" questions, grep `cerebrum/` and
`atlas/`. For unfamiliar terms, check `atlas/domain/`. Follow frontmatter
cross-references (the citation graph) to trace any claim to its source.

Specs are the source of truth: `specs-business/` (outcomes) and `specs/` (implementation),
linked by `implements:`/`implemented_by:`. Don't let the trees drift.

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

**Propose, don't mutate.** Write proposals to `.cortex/pulse/` only. Never edit
`cerebrum/`, `anatomy/`, `atlas/`, or the spec trees directly. The user applies changes
via `cortex pulse-accept <id>`. (The sole exception is the test-runner's writer/verifier
flow, which is governed by its own spec.)

**Conform to the schema.** Every artefact you write carries schema-valid frontmatter
(schema {{SCHEMA_VERSION}}). Run the validator on anything you produce.

**Stop condition:** {{GOAL}}.
```

**Validated by** `check.loop-md` (only if present): contains the propose-don't-mutate clause and a `Stop condition:` line.

---

## 10. Schema versioning policy

### 10.1 Where the version lives

`.cortex/cortex.config.json` (committed). Minimum shape:

```json
{
  "schemaVersion": "1.0",
  "anatomy": { "exclude": ["dist/**", "node_modules/**"], "enhancement": "none" },
  "hooks": { "preRead": false },
  "pulse": { "distilThresholdN": 3, "dismissedWindowDays": 90, "hygieneFreshnessHours": 48 },
  "loop": { "enabled": false }
}
```

**Required:** `schemaVersion` (string `MAJOR.MINOR`). All other keys optional with the defaults shown. **Validated by** `check.config`: valid JSON; `schemaVersion` present and parseable; unknown keys → `warning`.

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

---

## Appendix A — Validator check catalogue

The mechanical check set (one row ⇒ one implementable check). Grouped by the design §3.2 facet.

| Check | Enforces | Clause | Severity on fail |
|---|---|---|---|
| `check.layout` | `.cortex/` directory layout | §1 | error |
| `check.index-present` / `check.index-shape` | every `.cortex/` dir has a well-formed `_index.md` | §7.1 | error / warning |
| `check.specs-index` | `specs/_index.md` shape | §7.2 | error |
| `check.overview-present` / `check.overview-shape` | every spec-tree dir has a well-formed `_overview.md` | §2.2, §7.3 | error / warning |
| `check.id-matches-path` | spec ID equals its path | §2.2 | error |
| `check.anatomy-files` / `check.anatomy-graph` | anatomy artefact shapes | §4.1 | error / warning |
| `check.rule` | rule frontmatter + `check` predicate | §4.2 | error |
| `check.bug` | bug frontmatter + taxonomy | §4.3 | error |
| `check.atlas` | atlas artefact frontmatter | §4.4 | error |
| `check.pulse` | pulse header presence | §4.5 | warning |
| `check.dev-spec` | dev-spec frontmatter + links | §4.6 | error |
| `check.rule-governs-resolves` | every glob in a rule's `governs` matches ≥1 real file | §4.2, §6 | warning |
| `check.dev-spec-governs-resolves` | every glob in a dev spec's `governs` matches ≥1 real file | §4.6, §6 | warning |
| `check.business-spec` | business-spec frontmatter + no-dev-content | §4.7 | error (frontmatter) / warning (content) |
| `check.covers-resolves` | scenario `covers:` resolves | §4.8 | error |
| `check.xref-resolve` | all paths/IDs resolve | §6 | error |
| `check.xref-symmetry` | `implements`↔`implemented_by` | §6 | error |
| `check.xref-unique` | global ID uniqueness | §6 | error |
| `check.xref-acyclic` | `depends_on` acyclicity | §6 | error |
| `check.hook-config` | registered hooks match config | §5 | error |
| `check.claude-md` | managed CLAUDE.md block | §8 | error |
| `check.loop-md` | `loop.md` clauses (if present) | §9 | warning |
| `check.config` | `cortex.config.json` + version | §10 | error |
| `check.constellation` | constellation.json shape, id uniqueness, group/edge resolution | §4.9 | error |

---

**End of schema v1.0 draft.** Next: reconcile `specs/schema/validator.spec.md` against this contract (replace its OPEN notes with concrete clause references), then proceed to implementation under `/goal`.
