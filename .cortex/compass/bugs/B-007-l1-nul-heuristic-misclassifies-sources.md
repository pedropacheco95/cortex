---
id: B-007
title: L1 NUL-byte binary heuristic misclassifies real TypeScript sources, skipping them from extraction
type: incomplete-rule
severity: medium
status: open
affects:
  - insight.l1-structural
  - src/insight/l1.ts
  - src/insight/l1-triage.ts
  - src/hooks/post-read.ts
  - src/loops/test-runner.ts
proposed_fix: In runL1's content triage, the extension allowlist wins over the NUL heuristic — a file whose extension maps to a known language (EXT_LANGUAGE in l1-triage.ts) is never content-classified `binary`; `looksBinary` applies only to unknown/other extensions. Add a Rule to insight.l1-structural stating binary triage semantics (text source files containing embedded NULs are included) with a regression AC + atomic test using a NUL-containing .ts fixture; re-extract src/hooks/post-read.ts and src/loops/test-runner.ts.
opened: 2026-07-09T00:00:00Z
---

# B-007 — L1 binary misclassification skips real source files

## Evidence

Found during the v3 dogfood extraction run: L1's `skipped[]` reported `src/hooks/post-read.ts` and `src/loops/test-runner.ts` with `reason: binary`. Both are real TypeScript sources. Each embeds a literal NUL byte in a template literal as a collision-proof key separator — `post-read.ts:74` (`computeSha256(\`${file}\0${payload}\`)`) and `test-runner.ts:81` (`` const key = `${file}\0${name ?? ''}` ``) — intentionally, and both NULs fall inside the first 8 KiB. `looksBinary` (`src/insight/l1-triage.ts:149`, "first 8 KiB contain a NUL byte") is applied in `runL1` (`src/insight/l1.ts:327`) to every included file's content unconditionally, after the `L1_BINARY_EXTENSIONS` name check — so a `.ts` extension known to `EXT_LANGUAGE` does not protect the file. Consequence: both files get NO insight entries (skipped files are never rescued per the extraction skill's contract) and are invisible to extraction, the graph, and centrality.

## Diagnosis (seven-type classification)

Diagnostic-tree walk:

1. **Dev spec governing this behaviour?** YES — `insight.l1-structural` (`.specflow/specs/insight/l1-structural.spec.md`) governs `src/insight/l1.ts` and `src/insight/l1-triage.ts`.
2. **Does the spec have a rule covering this case?** NO. Its four Rules cover: deterministic Core/tree-sitter (1), skip-lists excluding mechanical and sensitive paths pre-triage (2), mechanical-hub exclusion from centrality (3), deterministic output (4). Binary/oversized content triage appears nowhere in the Rules or Acceptance Criteria — no rule states how binary detection works, and nothing says "a text source file containing a NUL byte must not be classified binary". The skip-list AC covers `node_modules`/`dist`/lockfiles/sensitive patterns only.

First NO at step 2 → **type: incomplete-rule** (a rule is missing/underspecified — the binary-triage rule was never written, so the heuristic shipped without a known-source carve-out). Not missing-criterion: there is no correct-but-uncriterioned rule here; the rule itself is absent.

Severity medium: two real source files silently receive no insight entries and are invisible to every downstream consumer (query layer, refresh loops, graph); impact is limited in count but is a silent correctness hole, not cosmetic.

## Intended semantics

Extension knowledge should dominate the content heuristic: `L1_BINARY_EXTENSIONS` (name-level) stays as-is; `looksBinary` (content-level) should only classify a file `binary` when its extension is OUTSIDE the known-source set (`EXT_LANGUAGE`). A `.ts`/`.py`/`.md` file with an embedded NUL is a text source with an unusual byte, not a binary.

### Change Plan

- Spec: add a Rule + AC to `insight.l1-structural` — binary triage is two-stage (extension denylist, then NUL-content check for unknown extensions only), and a known-source-extension file containing a NUL byte MUST be included.
- Code: gate the `looksBinary` call in `runL1` (`src/insight/l1.ts:327`) on `languageForExt(ext) === 'other'` (or equivalent allowlist check).
- Tests: atomic regression with a NUL-containing `.ts` fixture (included) and a NUL-containing extension-less/`.dat` fixture (skipped `binary`).
- Data: re-extract `src/hooks/post-read.ts` and `src/loops/test-runner.ts` (on-demand refresh mode) once fixed.
