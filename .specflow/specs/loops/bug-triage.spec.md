---
id: loops.bug-triage
status: implemented
depends_on:
  - core-cli.init
  - schema.validator
  - pulse.review-cli
governs:
  - "src/loops/bug-triage.ts"
  - "skills/cortex-loop-bug-triage/**"
implements: ../../specs-business/compass/developer-gets-bugs-triaged-without-asking.business.md
governed_by:
  - R-001
---

# Bug-Triage Loop

## Intent

`cortex loop-bug-triage` (daily, design §11.4 item 13) keeps the bug ledger active: open bugs lacking classification get classified against the seven-type taxonomy (via `specflow-bugs` judgment); already-classified bugs get an independent re-derivation whose divergences are **reported, never applied**. Same deterministic-bookends shape as distil.

## Entities

- **READS:** `.cortex/cerebrum/bugs/B-*.md` (`status: open`); `pulse/.triage-worklist.json` (collect output); triage results JSON.
- **WRITES:** `pulse/bug-triage.md` (always-write report); `pulse/.triage-worklist.json`; and — the **narrow sanctioned cerebrum write** — absent `type:`/`severity:`/`proposed_fix:` frontmatter fields on open bugs. Nothing else, ever.
- **CREATES:** the report per §4.5 (`kind: pulse-bug-triage`).

## Rules

1. **Bookends + bundle.** `--collect` partitions open bugs into *unclassified* (any of `type`/`severity`/`proposed_fix` absent) and *classified*, writing the worklist. `--report <results.json>` applies results deterministically. Bare CLI = collect → headless-claude judgment (init Rule 6 semantics) → report. Shipped `skills/cortex-loop-bug-triage/SKILL.md` does judgment in-session using the installed `specflow-bugs` skill's taxonomy discipline; the scheduled task's `requiredSkills` covers both.
2. **Result shape:** `{bugId, type, severity, proposedFix, reasoning}` per bug; `type` must be one of the seven (§4.3) — invalid results are skipped and counted.
3. **Fill-only mutation (resolves the §11.3-vs-§11.4 design tension, reported this round).** For *unclassified* bugs: absent fields are filled from the result; **present fields are never overwritten**. For *classified* bugs: results are compared field-by-field; divergences go to the report with both readings and the loop's reasoning — the entry is untouched.
4. **Re-triage safety over idempotence (Pedro's note (a)).** `specflow-bugs` judgment is LLM work and not inherently idempotent; the partition makes repeated runs converge instead: a bug is filled at most once, then compare-only forever. No re-triage flag needed.
5. **Always-write (§4.5):** report sections — filled, agreements, divergences, aged (open > 30 days) — with explicit empty states; an empty ledger is a stated clean run.
6. **Read-only beyond Rule 3's narrow write**; Core halves deterministic (R-001).

## Acceptance Criteria

### Unclassified bug gets filled, fill-only

- **Given** an open bug missing `severity:` and `proposed_fix:` but carrying a human-set `type: layer-drift`, and a result proposing all three fields with `type: wrong-rule`
- **When** `--report` runs
- **Then** `severity` and `proposed_fix` are filled from the result, `type` remains `layer-drift`
- **And** the type divergence appears in the report

### Classified bug is compare-only

- **Given** a fully classified open bug and a result diverging on `type`
- **When** `--report` runs
- **Then** the bug file is byte-identical and the report carries both readings with reasoning

### Agreement is reported as agreement

- **Given** a classified bug and a matching result
- **Then** the report lists it under agreements

### Invalid taxonomy value skipped

- **Given** a result with `type: logic`
- **Then** it is skipped, counted, and the bug untouched

### Resolved bugs never enter the worklist

- **Given** a `status: resolved` bug
- **When** `--collect` runs
- **Then** it is absent from the worklist

### Empty ledger is a stated clean run

- **Given** no open bugs
- **Then** the report says so, exit 0

### Blast radius

- **Then** any run touches only `pulse/bug-triage.md`, the worklist, and (fill-only) open bug files

## Notes

- Rule 3's fill-only write is the second sanctioned exception to write-only-to-pulse (after test-runner) — narrow by construction: absent classification fields on open bugs, nothing else. Design §11.4 item 13 mandates the frontmatter update; §11.3 property 2 forbids cerebrum writes; fill-only-never-overwrite is the mechanical reconciliation, flagged to Pedro this round.
- Divergence on already-classified bugs (e.g. B-003, this loop's first real customer) is calibration signal both ways — reported explicitly per Pedro's note (b).
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
