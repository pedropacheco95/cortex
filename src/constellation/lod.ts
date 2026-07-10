/**
 * Level-of-detail and deterministic-layout math for the constellation renderer
 * (spec constellation.renderer Rule 8). Pure, DOM-free, canvas-free functions:
 * the zoom-driven alpha curves that make a group "dissolve" into its member
 * artefacts, the scale clamp, the golden-angle phyllotaxis placement, the star
 * radius, and the hex→rgba helper.
 *
 * These are the SINGLE source of truth for the dissolve threshold logic. They
 * are unit-tested directly (tests/atomic/constellation/lod.test.ts) AND embedded
 * verbatim into the served client script: `spa.ts` interpolates each function's
 * `.toString()` into the inline `<script>` so the shipped page runs byte-identical
 * logic with zero drift and no extra network round-trip. Keep them plain (no
 * TS-only runtime constructs) so the compiled source reads cleanly in the browser.
 *
 * The ratio `r` is zoom normalised to the fit-all scale (`r = cam.s / fit`), so
 * the breakpoints are world-size independent — they hold for our ~89-node /
 * 3-domain map exactly as they held for the reference's larger synthetic one.
 */

export interface LODAlphas {
  /** Top-level group ("domain") label — fades OUT as you zoom in. */
  topGroupLabelAlpha: number;
  /** The glowing group star — fades OUT as you zoom in (the group dissolves). */
  groupStarAlpha: number;
  /** The individual artefact dots — fade IN as you zoom in (THE dissolve). */
  nodeAlpha: number;
  /** Child-group name label — a mid-zoom band. */
  groupLabelAlpha: number;
  /** Per-artefact text label — fades IN at the deepest zoom. */
  nodeLabelAlpha: number;
}

/** Clamp `v` into `[lo, hi]`. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** `#rgb`/`#rrggbb` (with or without leading `#`) → `rgba(r,g,b,alpha)`. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

/**
 * The five zoom-driven alpha curves (reference `draw()` formulas). `ratio` is
 * `cam.s / fit`. Group star and node alpha are complementary: as one rises the
 * other falls across the dissolve band, which is what reads as the group
 * "breaking apart" into its artefacts.
 */
export function computeLOD(ratio: number): LODAlphas {
  return {
    topGroupLabelAlpha: clamp((4.2 - ratio) / 2.2, 0, 1),
    groupStarAlpha: clamp((5.2 - ratio) / 2.2, 0, 1),
    nodeAlpha: clamp((ratio - 4.6) / 2.0, 0, 1),
    groupLabelAlpha: clamp(Math.min((ratio - 1.4) / 1.4, (9.5 - ratio) / 2.5), 0, 1),
    nodeLabelAlpha: clamp((ratio - 6.8) / 1.6, 0, 1),
  };
}

/**
 * Which tier the camera is focused on: `'all'` (whole map), `'domain'` (a
 * top-level group filling the view), `'group'` (inside a child group, artefacts
 * visible). Drives the breadcrumb depth and which legend is shown.
 */
export function focusLevel(ratio: number): 'all' | 'domain' | 'group' {
  return ratio < 2.3 ? 'all' : ratio < 5.6 ? 'domain' : 'group';
}

/** Bound a scale to `[fit*minMult, fit*maxMult]` (reference clampS). */
export function clampScale(s: number, fit: number, minMult = 0.55, maxMult = 17): number {
  return clamp(s, fit * minMult, fit * maxMult);
}

/**
 * Golden-angle phyllotaxis placement for the k-th member of a group, relative
 * to the group centre. Count-independent and deterministic: `k` alone fixes the
 * point, and the radius is non-decreasing in `k`.
 */
export function goldenSpiralPoint(k: number, step = 25): { x: number; y: number } {
  const angle = k * 2.399963;
  const radius = step * Math.sqrt(k);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/** Glowing-star radius from real member count (reference `starR`). */
export function starRadius(memberCount: number): number {
  return 13 + Math.sqrt(memberCount) * 5;
}
