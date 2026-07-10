/**
 * Atomic tests — the constellation renderer's level-of-detail / layout math
 * (src/constellation/lod.ts, spec constellation.renderer Rule 8). These pure
 * functions are the single source of truth for the group-dissolve threshold
 * and are embedded verbatim into the served client, so pinning them here pins
 * the shipped behaviour. Coverage: clamp bounds, the dissolve alpha curves
 * (complementary node/star behaviour across the zoom band), the focus-level
 * boundaries, the scale clamp, star radius growth, and the deterministic
 * golden-spiral placement.
 */
import { describe, it, expect } from 'vitest';
import {
  clamp,
  computeLOD,
  focusLevel,
  clampScale,
  goldenSpiralPoint,
  starRadius,
  hexWithAlpha,
} from '../../../src/constellation/lod.js';

describe('clamp', () => {
  it('passes values already inside the range through unchanged', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
  it('clamps to the low and high bounds', () => {
    expect(clamp(-3, 0, 1)).toBe(0);
    expect(clamp(9, 0, 1)).toBe(1);
  });
});

describe('computeLOD', () => {
  it('returns all five alpha channels in [0,1]', () => {
    for (const r of [0, 1, 2.3, 4.6, 5.6, 9, 17]) {
      const lod = computeLOD(r);
      for (const v of Object.values(lod)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('zoomed all the way out: group stars read high, artefact dots are gone', () => {
    const lod = computeLOD(1);
    expect(lod.groupStarAlpha).toBeGreaterThan(0.9);
    expect(lod.topGroupLabelAlpha).toBeGreaterThan(0.9);
    expect(lod.nodeAlpha).toBeLessThan(0.05);
    expect(lod.nodeLabelAlpha).toBeLessThan(0.05);
  });

  it('zoomed deep in: artefact dots and their labels read high, the group star is gone', () => {
    const lod = computeLOD(9);
    expect(lod.nodeAlpha).toBeGreaterThan(0.9);
    expect(lod.nodeLabelAlpha).toBeGreaterThan(0.9);
    expect(lod.groupStarAlpha).toBeLessThan(0.05);
  });

  it('the dissolve is complementary: node alpha rises monotonically as star alpha falls across the band', () => {
    const ratios = [4.6, 5.2, 5.8, 6.4, 7.0];
    const nodeAlphas = ratios.map((r) => computeLOD(r).nodeAlpha);
    const starAlphas = ratios.map((r) => computeLOD(r).groupStarAlpha);
    for (let i = 1; i < ratios.length; i++) {
      expect(nodeAlphas[i]!).toBeGreaterThanOrEqual(nodeAlphas[i - 1]!);
      expect(starAlphas[i]!).toBeLessThanOrEqual(starAlphas[i - 1]!);
    }
  });
});

describe('focusLevel', () => {
  it('maps the three zoom bands to all / domain / group', () => {
    expect(focusLevel(1)).toBe('all');
    expect(focusLevel(2.2)).toBe('all');
    expect(focusLevel(2.3)).toBe('domain');
    expect(focusLevel(5.5)).toBe('domain');
    expect(focusLevel(5.6)).toBe('group');
    expect(focusLevel(12)).toBe('group');
  });
});

describe('clampScale', () => {
  it('bounds the scale to [fit*0.55, fit*17] by default', () => {
    const fit = 0.4;
    expect(clampScale(fit * 0.1, fit)).toBeCloseTo(fit * 0.55);
    expect(clampScale(fit * 100, fit)).toBeCloseTo(fit * 17);
    expect(clampScale(fit * 3, fit)).toBeCloseTo(fit * 3);
  });
  it('honours custom multipliers', () => {
    expect(clampScale(0, 1, 0.2, 4)).toBe(0.2);
    expect(clampScale(99, 1, 0.2, 4)).toBe(4);
  });
});

describe('starRadius', () => {
  it('is base 13 for an empty group and grows with member count', () => {
    expect(starRadius(0)).toBe(13);
    expect(starRadius(4)).toBeGreaterThan(starRadius(0));
    expect(starRadius(25)).toBeGreaterThan(starRadius(4));
  });
});

describe('goldenSpiralPoint', () => {
  it('is deterministic: the same k yields the same point', () => {
    expect(goldenSpiralPoint(7)).toEqual(goldenSpiralPoint(7));
  });
  it('places k=0 at the centre', () => {
    expect(goldenSpiralPoint(0)).toEqual({ x: 0, y: 0 });
  });
  it('radius is non-decreasing in k', () => {
    let prev = -1;
    for (let k = 0; k < 40; k++) {
      const p = goldenSpiralPoint(k);
      const rad = Math.hypot(p.x, p.y);
      expect(rad).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = rad;
    }
  });
  it('honours a custom step', () => {
    const a = goldenSpiralPoint(9, 25);
    const b = goldenSpiralPoint(9, 50);
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(2 * Math.hypot(a.x, a.y));
  });
});

describe('hexWithAlpha', () => {
  it('expands 6-digit hex to rgba with the given alpha', () => {
    expect(hexWithAlpha('#6ea8f5', 0.5)).toBe('rgba(110,168,245,0.5)');
  });
  it('expands 3-digit shorthand hex', () => {
    expect(hexWithAlpha('#fff', 1)).toBe('rgba(255,255,255,1)');
  });
  it('tolerates a missing leading #', () => {
    expect(hexWithAlpha('05060b', 0.2)).toBe('rgba(5,6,11,0.2)');
  });
});
