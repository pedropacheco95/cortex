/**
 * Pure confidence-tier → edge rendering style mapping for the constellation
 * insight preset (spec constellation.insight-preset-v3 Rule 5; schema
 * §4.10.6). ALL insight edges render dashed — that part is non-negotiable,
 * regardless of tier; only opacity/width/dash-density vary, strongest
 * (`structural`, an AST fact) fading to faintest (`ambiguous`, a weak or
 * conflicting signal never silently trusted).
 *
 * Pure, DOM-free, canvas-free — the same `lod.ts` convention (design §12.6):
 * unit-tested directly (tests/atomic/constellation/insight-style.test.ts) AND
 * embedded verbatim into the served client script by `spa.ts` interpolating
 * `.toString()`, so shipped and tested logic cannot drift. Kept plain (no
 * TS-only runtime constructs survive compilation) so it reads cleanly inline.
 */

/** The four discrete confidence tiers (storage.ts `ConfidenceTier`, duplicated
 *  here as a plain string union — not imported — so this module stays a
 *  zero-dependency leaf that embeds byte-identically in the browser). */
export type ConfidenceTier = 'structural' | 'stated' | 'inferred' | 'ambiguous';

export interface EdgeStyle {
  /** Stroke alpha, 0–1. */
  opacity: number;
  /** Stroke width in canvas px at 1x zoom. */
  width: number;
  /** `ctx.setLineDash` pattern — denser dashes read as "more certain". */
  dash: [number, number];
}

/**
 * Opacity/width/dash pattern for a confidence tier. An unrecognized tier
 * falls back to the faintest (`ambiguous`) style — fail-quiet on a rendering
 * detail, never fail-loud (Rule 5 Notes: engineering call, exact numbers
 * unpinned by the spec itself).
 */
export function confidenceStyle(tier: string): EdgeStyle {
  switch (tier) {
    case 'structural':
      return { opacity: 0.85, width: 1.6, dash: [6, 3] };
    case 'stated':
      return { opacity: 0.62, width: 1.3, dash: [5, 4] };
    case 'inferred':
      return { opacity: 0.4, width: 1.0, dash: [4, 5] };
    case 'ambiguous':
      return { opacity: 0.22, width: 0.8, dash: [3, 6] };
    default:
      return { opacity: 0.22, width: 0.8, dash: [3, 6] };
  }
}
