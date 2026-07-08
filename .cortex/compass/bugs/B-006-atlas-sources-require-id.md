---
id: B-006
title: check.atlas requires "id" on raw atlas/sources/ material, which has none by design
type: missing-criterion
severity: low
status: open
affects:
  - schema.validator
  - src/schema/checks/atlas.ts
  - .cortex/atlas/sources/cortex-v3-reframe.md
proposed_fix: Exempt `.cortex/atlas/sources/**` from check.atlas's blanket "id" requirement (schema §4.4 describes sources/ as raw captured material, not a schema-id-bearing artefact — contrast decisions/stakeholders/domain, which are). Either skip files under `atlas/sources/` entirely in checkAtlas's glob, or special-case them to check only the sibling `.meta.md` (if present) rather than the raw file. Add a regression AC (a frontmatter-less file under atlas/sources/ validates clean; a `.meta.md` sidecar, if required, is still checked).
opened: 2026-07-08T00:00:00Z
---

# B-006 — check.atlas wrongly demands an "id" on raw source material

## Evidence

Found during the compass-rename / decisions-single-home / version-gate dogfood run (build-order-v3 step 2): `cortex validate` on this repo reports one residual error, `check.atlas` flagging `.cortex/atlas/sources/cortex-v3-reframe.md` for missing required field "id". Pre-existing — unrelated to the rename; the file was not touched by this round (confirmed via `git diff`, no changes) and the same error would have fired before this round started.

## Diagnosis (seven-type classification)

`checkAtlas` globs every `.md` under `.cortex/atlas/` (excluding `_index.md`/`_overview.md`) and requires `id` on all of them uniformly. But schema §4.4 describes `atlas/sources/<slug>.<ext>` as raw captured material — verbatim ingested content, explicitly not expected to carry a schema id (contrast `decisions/`, `stakeholders/`, `domain/`, which are id-bearing kinds). The check exists but doesn't cover this legitimate case → **type: missing-criterion**.

## Intended semantics

`atlas/sources/**` should be exempt from the blanket id requirement (or validated against a different, sources-specific shape — e.g. requiring only its optional `.meta.md` sidecar to carry structured fields, per the sources template). This is a design-surface question (which of the two shapes) rather than a pure mechanical fix, so it is filed rather than ridden into this round per the standing-authorities design-surface carve-out.

Severity low: cosmetic validator noise on a file that is otherwise inert (gitignored, non-enforcing); does not block any check or block conformance of anything else.
