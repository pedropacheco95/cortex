---
path: src/constellation/insight-style.ts
extracted_at: 2026-07-11T01:23:31Z
extraction_level: 2
size_lines: 49
size_tokens: 531
centrality: low
built_at_commit: "fd7b55b"
source_sha256: "d3aa7856a17273dc8ccf2e7915038da87533f46abc2eb6aeb2abdf6552393987"
---
# src/constellation/insight-style.ts

## Purpose
A pure confidence-tier → edge-rendering-style mapping for the constellation `insight` preset: `confidenceStyle(tier)` returns the stroke opacity, width, and dash pattern for one of the four discrete confidence tiers (`structural`/`stated`/`inferred`/`ambiguous`), fading from the strongest (an AST-derived fact) to the faintest (a weak or conflicting signal). All insight edges render dashed regardless of tier — that part is non-negotiable; only opacity/width/dash-density vary. An unrecognized tier fails quiet, falling back to the faintest `ambiguous` style rather than throwing. Kept as a zero-dependency, plain-TS leaf (no imports, no TS-only runtime constructs) so it embeds byte-identically into the browser via the same `.toString()`-embedding convention as `lod.ts`.

## Connections
Uses:
- (none src-internal — a zero-dependency leaf module, deliberately plain so it embeds cleanly in the browser)

Used by:
- src/constellation/spa.ts: imports `confidenceStyle` and interpolates its `.toString()` into the inline client-side script, driving dash/opacity/width for every rendered edge when the `insight` preset is active.

Semantically related (not imports): src/constellation/lod.ts — the sibling pure-math module embedded the same way into `spa.ts`'s client script, for zoom/layout math rather than edge styling.
