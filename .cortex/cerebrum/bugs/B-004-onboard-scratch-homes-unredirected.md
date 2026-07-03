---
id: B-004
title: Single-pass onboarding still writes root proposed-notes.md and corrections.md
type: incomplete-rule
severity: low
status: open
affects:
  - specflow.cortex-awareness
  - skills/specflow-onboard-codebase/SKILL.md
proposed_fix: Extend specflow.cortex-awareness Rule 1's onboard row with the two §8.5 output homes (proposed-notes.md and corrections.md -> .cortex/pulse/), redirect the four body references in the onboard bundle (lines naming the root homes), sync package and local copies, and add the matching prohibition-style regression assertions to tests/atomic/specflow/awareness.test.ts.
opened: 2026-07-03T15:18:26Z
---

# B-004 — Single-pass onboarding scratch homes unredirected

## Evidence

Reconciliation pass, item (4): grep of the shipped `specflow-onboard-codebase` bundle shows `proposed-notes.md` and `corrections.md` still named at their legacy root homes (SKILL.md lines ~34/248/275/343), while deep-onboard's awareness section carries the §8.5 substitution instruction. The awareness spec's Rule 1 row for onboard covered anatomy-first input, §4.2 rule drafting, and the bug-ledger deliverable — but not these two outputs.

## Diagnosis (seven-type classification)

The awareness contract exists but does not cover the observed case — the §8.5 delta amendment enumerated tests/develop/onboard-bugs/deep-onboard homes and missed onboard's own scratch pair. **type: incomplete-rule.** Severity low: the files are transient working outputs; the deep path (the confidence-matters path) is already correct.
