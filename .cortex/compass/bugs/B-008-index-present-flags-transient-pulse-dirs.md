---
id: B-008
title: check.index-present makes the extraction skill's transient pulse working dir non-conformant mid-run
type: incomplete-rule
severity: low
status: open
affects:
  - schema.validator
  - src/schema/checks/layout.ts
  - skills/cortex-extract-insight
proposed_fix: Exempt subdirectories below `.cortex/pulse/` from checkIndexPresent's walk in src/schema/checks/layout.ts (pulse/ root keeps its _index.md requirement), aligning check.index-present with schema §1's existing tolerance clause ("pulse/ contents beyond the fixed names are tolerated (transient/generated)"); amend §7.1 to record the carve-out; regression test with an _index-less `pulse/insight-fragments/` fixture validating clean.
opened: 2026-07-09T00:00:00Z
---

# B-008 — check.index-present fights the extraction skill's own transient dir

## Evidence

Found during the v3 dogfood extraction run: `cortex-extract-insight` writes its completion manifests to `.cortex/pulse/insight-fragments/<scope-id>.json` during Phase 3 (the disk-file-is-success contract, `references/orchestration.md`). `checkIndexPresent` (`src/schema/checks/layout.ts:60`) walks every non-dot directory under `.cortex/` and errors on any without `_index.md`; its exemption list covers insight data trees and archive documents/types but nothing under `pulse/`. So the moment the first manifest lands, the project reports `error` (`check.index-present`, §7.1) until the run's final cleanup removes the directory. The skill's own contract says "validate before checkpoint" after every scope — a run following its contract can therefore never see 0 errors mid-run, and the project reads Conformant: NO for the entire Phase 3/4 window.

## Diagnosis (seven-type classification)

Diagnostic-tree walk:

1. **Dev spec governing this behaviour?** YES — `schema.validator` (`.specflow/specs/schema/validator.spec.md`) governs `src/schema/**/*.ts`.
2. **Does the spec have a rule covering this case?** Rule 9 covers `_index.md` presence, but only by deference: "a directory that the schema requires to carry an `_index.md` … but does not is a violation." The clause it defers to — schema §7.1, "`_index.md` present in every `.cortex/` directory" — is underspecified: it makes no carve-out for transient working directories that skills legitimately create under `pulse/` mid-run, even though schema §1's check.layout clause already tolerates "`pulse/` … contents beyond the fixed names … (transient/generated)". The rule set exists but fails to specify the transient-pulse case, leaving §7.1 in tension with §1 and with the extraction skill's documented lifecycle (write fragments in Phase 3 → validate before checkpoint → remove at run end).

First NO at step 2 (no rule covers "a documented-transient pulse working dir needs no `_index.md`") → **type: incomplete-rule**.

Severity low: mid-run validator noise that self-heals at cleanup; the skill's checkpoint gate filters to `check.insight-*` violations so no checkpoint is actually blocked — but the mid-run Conformant: NO is misleading and makes "reach 0 errors" unattainable while extraction runs.

## Intended semantics

`_index.md` is an active navigational prompt for module directories (§7.1's own framing); a machine-only manifest directory that exists for minutes and is deleted at run end is not a navigable module. Subdirectories under `pulse/` are transient by definition (§4.5); only `pulse/` itself is a module root needing an index.

### Change Plan

Chosen fix: exempt subdirectories below `pulse/` in `checkIndexPresent` (`src/schema/checks/layout.ts`), following the check's existing precedent (insight `anatomy/`/`concepts/`/`scopes/`, archive `documents/`/`types/` are already exempted as data trees, not navigable indexes) and aligning with §1's tolerance clause. Amend schema §7.1 accordingly (schema change — user approval required). Regression test: an `_index`-less `.cortex/pulse/insight-fragments/` fixture validates clean; `pulse/` itself missing `_index.md` still errors.

Rejected alternatives, and why:
- **Skill writes a throwaway `_index.md`** — appeases the check by putting a nonsense "active prompt" in a machine-only dir agents should never navigate, violating §7.1's intent and leaving a stale artefact if a run crashes before cleanup.
- **Dot-prefix the dir (`.insight-fragments/`)** — works mechanically (the walker already skips dot-dirs, layout.ts:105) but changes a documented skill path in two trees to route around a validator gap instead of fixing the gap.
