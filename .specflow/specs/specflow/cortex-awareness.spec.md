---
id: specflow.cortex-awareness
status: implemented
depends_on:
  - core-cli.init
  - schema.validator
governs:
  - "skills/specflow-*/**"
implements: ../../specs-business/specflow/developer-gets-spec-work-grounded-in-project-memory.business.md
governed_by: []
---

# Cortex-Awareness Pass over the SpecFlow Skills

## Intent

Design §16.2's final step: the eleven `specflow-*` skills become Cortex-aware — each reads the knowledge layer before producing output, at a depth calibrated to what it produces — and all eleven ship in the package so `cortex init` installs the aware versions everywhere (completing design §13 step 4's "all 22 skills"). Awareness is added to the existing skill bodies, never rewriting what already works: minimal diffs per tier.

## Entities

- **READS:** the current skill bodies (`.claude/skills/specflow-*/`, including `references/` subdirectories).
- **WRITES:** the package `skills/specflow-*/` bundles (source of truth after this round) and the project-local `.claude/skills/specflow-*/` copies (synced, as init would).
- **CREATES:** nothing else. This spec's deliverable is prompt content plus packaging.

## Rules

1. **Three depth tiers (Pedro's calibration), per-skill contracts:**

   | Skill | Tier | Required awareness (mechanically assertable in the body) |
   |---|---|---|
   | `specflow-develop` | Deep | Before planning/coding: read `.cortex/_index.md`; pull anatomy rows for task-relevant files (via `spec_links`/`governs`) and use purpose lines to avoid whole-file reads; collect applicable cerebrum rules (both `governs`-matched and `check:`-predicated) and honour them; consult atlas decisions relevant to the touched domain; run `cortex validate` before finishing; gap documentation lands at `.cortex/pulse/gaps.md`, never a root `gaps.md` (§8.5). |
   | `specflow-tests` | Deep | Before generating: read applicable cerebrum rules and **incorporate `check:` predicates into generated atomic/spec tests** (design §8.4 bridge 1); read anatomy for the governed files of the spec under test; note the four-tier/`covers:` conventions per schema §3/§4.8; verification output lands at `.cortex/pulse/reports/verification.md`, never `tests/verification-report.md` (§8.5). |
   | `specflow-change-router` | Deep | Route by checking **which Cortex module the request touches** (bridge 6): grep anatomy/cerebrum/atlas indexes as part of classification; route bug-shaped reports toward the §4.3 ledger flow. |
   | `specflow-onboard-codebase` | Moderate | Build from the scanned anatomy when `.cortex/anatomy/` exists (bridge 5) instead of re-walking the tree; draft rules referencing schema §4.2 format; bug findings land in the §4.3 ledger, never a root `bugs.md` deliverable (§8.5). |
   | `specflow-deep-onboard` | Moderate | Same anatomy-first input as onboard; pass outputs through `.cortex/pulse/` conventions where the design names them (§8.5) — including the pass-merge instructions, which reference the ledger, not per-pass `bugs.md` files. |
   | `specflow-ingest` | Moderate | Requirement-shaped sources → specs; memory-shaped remainder → hand off to `cortex-ingest` (the sibling boundary, both directions); business specs written alongside atlas cross-references (bridge 2). |
   | `specflow-new-project` | Moderate | Read `cerebrum/preferences.md` (when present) for stack/convention defaults before proposing them; scaffold per the schema's tree conventions. |
   | `specflow-spec-editor` | Moderate | Check `governed_by:`/rule references when editing specs; run `cortex validate` after modifications (replacing its hand-rolled coherence walk with the mechanical backbone plus its judgment layer). |
   | `specflow-viewer` | Light | May read anatomy purpose lines to enrich rendering; no required reads — one awareness note only. |
   | `specflow-lint` | Light | Name `cortex validate` as the mechanical backbone it layers judgment on; no duplicate reimplementation of validator checks. |
   | `specflow-bugs` | Light | **Correctness fix:** file bugs as `.cortex/cerebrum/bugs/B-NNN-<slug>.md` per schema §4.3 (seven-type frontmatter) — never the legacy root `bugs.md` — so the daily triage loop finds them. |

2. **Additive, minimal diffs.** Each body gains a clearly-delimited Cortex-awareness section (or targeted line edits where the tier demands, e.g. specflow-bugs' write target); existing workflow content is not restructured. Light tier = smallest possible touch.
3. **Package + local in lockstep.** The eleven bundles (whole directories, `references/` included) land in the package `skills/` dir — the source of truth — and the project-local `.claude/skills/` copies are synced identically. Init's Rule-4 machinery now ships all of them; count pins update accordingly.
4. **No behavioural code changes.** This round touches prompts and packaging only; Core is untouched except test count-pins.

## Acceptance Criteria

### Every skill carries its tier's contract

- **Given** the eleven updated bodies
- **When** each is checked against the Rule 1 table
- **Then** every Deep skill's body contains its required-read instructions (index-first, anatomy, cerebrum incl. predicates where specified, atlas, `cortex validate` where specified); every Moderate skill contains its targeted reads; every Light skill contains exactly its minimal touch

### specflow-bugs writes to the ledger

- **Given** the updated `specflow-bugs` body
- **Then** it instructs filing at `.cortex/cerebrum/bugs/B-NNN-<slug>.md` with §4.3 seven-type frontmatter and contains no instruction to write a root `bugs.md`

### specflow-tests incorporates check predicates

- **Given** the updated `specflow-tests` body
- **Then** it instructs reading rules' `check:` predicates and generating tests that enforce them (bridge 1, by name or by section)

### All eleven ship and install

- **Given** a fresh project init with a fake home
- **Then** `.claude/skills/` contains all eleven `specflow-*` bundles (with their `references/` files) alongside the cortex bundles, and the summary's installed count reflects the full set

### Package and local copies are identical

- **Given** the round's final state
- **Then** every `skills/specflow-*/` file is byte-identical to its `.claude/skills/specflow-*/` counterpart

## Notes

- Verification is atomic + spec tier only (prompt-structure assertions + contract conformance): behavioural verification of awareness in live sessions is journey-tier, deferred post-v1 per the standing convention. "Tests pass" is a weaker signal than usual here — acknowledged; the rule-19 enumeration of every skill's diff is the compensating control.
- Journey-layer tests deferred to v1.1 pending real-session verification infrastructure (project-wide convention).
