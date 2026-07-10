/**
 * Atomic tests — `confidenceStyle` (constellation.insight-preset-v3 Rule 5).
 * Pure function coverage: every confidence tier gets a distinct opacity/width
 * (strongest `structural` to faintest `ambiguous`), the mapping is total (an
 * unrecognized tier falls back to the faintest style rather than throwing),
 * and every insight edge — regardless of tier — carries a non-empty dash
 * pattern (the non-negotiable "ALL insight edges render dashed" rule).
 */
import { describe, it, expect } from 'vitest';
import { confidenceStyle } from '../../../src/constellation/insight-style.js';

const TIERS = ['structural', 'stated', 'inferred', 'ambiguous'] as const;

describe('confidenceStyle', () => {
  it('every tier carries a non-empty dash pattern (edges are ALWAYS dashed)', () => {
    for (const tier of TIERS) {
      const style = confidenceStyle(tier);
      expect(style.dash.length).toBe(2);
      expect(style.dash[0]).toBeGreaterThan(0);
      expect(style.dash[1]).toBeGreaterThan(0);
    }
  });

  it('opacity strictly decreases from structural to ambiguous (strongest evidence reads strongest)', () => {
    const opacities = TIERS.map((t) => confidenceStyle(t).opacity);
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]).toBeLessThan(opacities[i - 1] as number);
    }
  });

  it('width also decreases from structural to ambiguous', () => {
    const widths = TIERS.map((t) => confidenceStyle(t).width);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeLessThanOrEqual(widths[i - 1] as number);
    }
  });

  it('every opacity is within (0, 1]', () => {
    for (const tier of TIERS) {
      const { opacity } = confidenceStyle(tier);
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThanOrEqual(1);
    }
  });

  it('an unrecognized tier falls back to the faintest (ambiguous) style — total, never throws', () => {
    const unknown = confidenceStyle('not-a-real-tier');
    const ambiguous = confidenceStyle('ambiguous');
    expect(unknown).toEqual(ambiguous);
  });

  it('is deterministic: same tier in, byte-identical style out', () => {
    for (const tier of TIERS) {
      expect(confidenceStyle(tier)).toEqual(confidenceStyle(tier));
    }
  });
});
