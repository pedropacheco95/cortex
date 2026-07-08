# Bug ledger — index

**Read this when:** triaging a reported problem, or checking whether a failure mode was seen before.

**What's here:** one file per bug (B-NNN), seven-type classified. B-001 (wrong-rule), B-002 (missing-criterion), B-003 (incomplete-rule) — all **resolved**, each caught by the system's own mechanisms and kept as design-refinement history. B-004 (incomplete-rule, open — onboard scratch homes) and B-005 (missing-criterion, open — --force clobbers localised indexes) were both found by the reconciliation pass. B-006 (missing-criterion, **resolved** — check.atlas wrongly required "id" on raw atlas/sources/ material; sources now sidecar-validated) was found dogfooding the compass-rename/version-gate round.

**How to navigate:** `affects:` names the spec IDs / files involved; `type:` routes the fix (types 1–6 → spec change, type 7 → test/skill fix); resolved entries carry a Resolution section. The daily bug-triage loop fills absent classifications and reports divergences.
