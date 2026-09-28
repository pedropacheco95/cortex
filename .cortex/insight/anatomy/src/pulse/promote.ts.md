---
path: src/pulse/promote.ts
extracted_at: 2026-09-22T09:54:50Z
extraction_level: 3
size_lines: 180
size_tokens: 2098
centrality: low
built_at_commit: "a66041b"
source_sha256: "ceb7b3404085ce65602cf50371f70028780a78d58d774870d0ea50c0688aa612"
---
# src/pulse/promote.ts

## Purpose

Computes the side-effects of accepting a `promotion`-typed suggestion (schema §4.5 Source clause, §4.5.1 `promotion`, §4.10.4; `insight.promotion-mechanism` Rules 5–6 as corrected by B-020, 2026-09-17). A promotion's `**Source:**` field names the originating artefact, one of exactly two kinds: an **insight** per-file entry (`insight/anatomy/**`, `insight/scopes/<s>/anatomy/**` — the distil graduation path) or an **archive** extraction (`archive/documents/<id>/extracted/**` — the `cortex-archive-ingest` producer). `planPromotion` resolves the source, computes the landed content for the gated compass/atlas target (injecting a `source:` back-reference into frontmatter for a create, or appending a source-reference trailer for an append), and — for an insight source only — computes the updated insight-original content with a promoted trailer appended (the insight original is marked, never deleted; an archive source is never written to at all). This module only computes the plan (`PromotionPlan` or a `PromotionRefusal` when the source is missing/unnamed/nonexistent/out-of-root); `src/pulse/review.ts` owns actually writing the files as one atomic transaction (compute here, write there — Rule 6), so any refusal blocks the whole accept rather than causing a partial write.

## Main players

- `planPromotion` (lines 127–179) — critical. The single entry point: resolves `**Source:**` via `extractPromotionSource`, refuses if the source file doesn't exist or (archive kind) the target isn't under `ARCHIVE_PROMOTION_ROOTS`, computes `landedContent` per create/append shape, and — for an insight source only — computes the stamped `nextInsight` with a promoted trailer. Returns a `PromotionPlan` or a `PromotionRefusal`; never writes anything itself.
- `extractPromotionSource` (lines 65–79) — critical. Resolves a `**Source:**` string to a `PromotionSource` (`kind` + project-relative `rel`) via two regexes (`INSIGHT_SOURCE_RE`, `ARCHIVE_SOURCE_RE`); returns `null` when the text names neither shape — the B-020 fix point, since the 2.0 `insight/map/` prose layout is deliberately excluded from the insight alternation.
- `injectSourceFrontmatter` (lines 97–106) — supporting. Splices a `source: <path>` line into a CREATE payload's `---`-delimited frontmatter block (or prepends a minimal one if absent); if the payload already declares a top-level `source:` key (a compass rule's §4.1 `source` list, which `cortex-archive-ingest`'s template already fills with the same extracted file), the content is returned byte-identical — a second `source:` key would be a duplicate YAML mapping key and the landed file would fail to parse.
- `promotedTrailer` (lines 82–84) — supporting. Formats the §4.10.4 stamp `_(promoted <iso-date> → <target> via <suggestion-id>)_` appended to a promoted insight original.
- `underArchiveRoots` (lines 115–118) — supporting. Restricts an archive-sourced promotion's target to `.cortex/compass/` or `.cortex/atlas/` (Rule 5: Rule 2's gated roots minus `RULES.md`).
- `PROMOTION_SOURCE_REFUSAL` (lines 49–50) — supporting. The exact refusal text surfaced by `review.ts` when `**Source:**` names neither shape — a constant so the wording is asserted once, not duplicated in tests.
- `ARCHIVE_PROMOTION_ROOTS` (line 53) — supporting. The two-element allowlist backing `underArchiveRoots`.

## Insights

- **This file grew a second source kind (archive) after B-020, and the two kinds are asymmetric, not parallel**: an insight-sourced promotion gets its original file stamped with a promoted trailer (never deleted), while an archive-sourced promotion writes nothing back to the archive at all — `insightAbs`/`nextInsight` are `null` for the archive branch in `planPromotion`'s return. A reader assuming both kinds "mark their source" will be wrong for archive.
- **The `source:` back-reference path is computed differently per kind**: for an insight source it's `path.relative` from the *target's* directory to the insight file (a relative link that survives the target moving within its own tree); for an archive source it's the same `.cortex/`-relative path the archive-ingest payload's `provenance: derives_from` already carries, deliberately NOT re-rooted relative to the target — the two kinds don't share a path-computation convention, by design (per the header comment).
- **`injectSourceFrontmatter`'s duplicate-key guard is load-bearing for archive sources specifically**: `cortex-archive-ingest`'s own template already populates a compass rule's `source:` list, so without the `/^source:/m.test(...)` early-return, `planPromotion` would inject a second `source:` key and produce unparseable YAML on every archive-sourced rule promotion — this guard is what makes the create path idempotent-safe for that producer's payload shape.
- **`ARCHIVE_PROMOTION_ROOTS` is explicitly a subset of the general promotion target roots** (`compass/`, `atlas/`, `RULES.md` per `types.ts`'s `permittedRoots('promotion')`) — an archive source additionally excludes `RULES.md` as a target, a restriction this file enforces on top of (not instead of) `review.ts`'s type-level target check.
- **The append path's source stamp lives in the body, not frontmatter**: `planPromotion`'s append branch appends `_source: <relSource>_` as a body trailer via `appendBlock`, distinct from the create path's frontmatter injection — because an append target already exists and its frontmatter is "not ours to rewrite" (per the inline comment), the source reference has to land somewhere append-safe instead.

## Connections

Uses: (none src-internal — only Node `fs`/`path`)

Used by:
- src/pulse/review.ts — calls `planPromotion` as the compute step of its transactional promotion-accept flow (`pulseCli`'s `pulse-accept` handling of `type === 'promotion'`), then performs the actual atomic writes to both the gated target and (for an insight source) the insight original itself.

## Query pointers

- If you need to understand how a computed `PromotionPlan` is actually written to disk (the transactional part this file deliberately does not do), also read: `src/pulse/review.ts` (`pulseCli`'s `pulse-accept` branch, search for `planPromotion`).
- If you need to understand the archive-ingest producer whose payload shape `injectSourceFrontmatter`'s duplicate-key guard exists for, also read the `cortex-archive-ingest` skill and its extraction template (not in this scope group).
- If you need to change which target roots an archive-sourced promotion may land in, edit `ARCHIVE_PROMOTION_ROOTS` here and cross-check `src/pulse/types.ts`'s `permittedRoots('promotion')`, which governs the general (type-level) target check `review.ts` applies before this file's kind-specific one.
