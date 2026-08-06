/**
 * Atomic tests for scaffolding.skill-listing-budget — the guard's decision logic,
 * exercised against synthetic rows rather than real bundles on disk.
 *
 * The negative paths are the point: a guard that has only ever been observed
 * passing is not known to fail. `evaluate()` is pure over the rows handed to it,
 * so each failure mode is provoked directly instead of by breaking a shipped
 * SKILL.md and putting it back.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';

// tests/atomic/scaffolding/ → package root is three levels up.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const guard = await import(path.join(PKG_ROOT, 'scripts', 'measure-skill-descriptions.mjs'));
const { evaluate, TIER_CEILING, TIERS, REQUIRED_TRIGGERS } = guard;

/** A conforming Tier A row, for tests that mutate one field at a time. */
const okRow = {
  bundle: 'fixture-a',
  after: 60,
  description: 'Does a thing. "run the thing".',
  tier: 'A',
};
const okTriggers = { 'fixture-a': ['run the thing'] };

describe('AC: an unclassified bundle fails the guard', () => {
  it('fails a bundle with no tier and names it', () => {
    const failures = evaluate([{ ...okRow, tier: undefined }], okTriggers);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('fixture-a');
    expect(failures[0]).toContain('no tier');
  });

  it('does not fall back to a default ceiling for it', () => {
    // A 5,000-char unclassified bundle must not pass because nothing checked it.
    const failures = evaluate([{ ...okRow, tier: undefined, after: 5000 }], okTriggers);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('no tier');
  });
});

describe('AC: an over-ceiling description fails the guard', () => {
  it('fails a Tier A row at 200 chars and reports size and ceiling', () => {
    const failures = evaluate([{ ...okRow, after: 200 }], okTriggers);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('200 chars');
    expect(failures[0]).toContain('120');
  });

  it('passes the same 200 chars under Tier B', () => {
    expect(evaluate([{ ...okRow, tier: 'B', after: 200 }], okTriggers)).toEqual([]);
  });

  it('passes at exactly the ceiling and fails one char over', () => {
    expect(evaluate([{ ...okRow, after: 120 }], okTriggers)).toEqual([]);
    expect(evaluate([{ ...okRow, after: 121 }], okTriggers)).toHaveLength(1);
  });
});

describe('AC: specflow-entry is exempt from any ceiling', () => {
  it('applies no ceiling to Tier C', () => {
    expect(TIER_CEILING.C).toBeNull();
    const row = { bundle: 'specflow-entry', after: 1130, description: 'add a feature', tier: 'C' };
    expect(evaluate([row], { 'specflow-entry': ['add a feature'] })).toEqual([]);
  });

  it('still checks Tier C for its pinned phrases', () => {
    const row = { bundle: 'specflow-entry', after: 1130, description: 'nothing pinned here', tier: 'C' };
    const failures = evaluate([row], { 'specflow-entry': ['add a feature'] });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('add a feature');
  });
});

describe('AC: a dropped trigger phrase fails the guard', () => {
  it('names the lost phrase', () => {
    const failures = evaluate([{ ...okRow, description: 'Does a thing.' }], okTriggers);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('lost trigger phrase');
    expect(failures[0]).toContain('run the thing');
  });

  it('matches phrases case-insensitively', () => {
    const row = { ...okRow, description: 'Does a thing. "RUN THE THING".' };
    expect(evaluate([row], okTriggers)).toEqual([]);
  });

  it('fails a bundle with no REQUIRED_TRIGGERS entry at all', () => {
    const failures = evaluate([okRow], {});
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('no REQUIRED_TRIGGERS entry');
  });
});

describe('AC: a Tier D bundle that declares trigger phrases fails the guard', () => {
  it('fails when a phrase is pinned', () => {
    const row = { bundle: 'fixture-d', after: 40, description: 'Generate the thing.', tier: 'D' };
    const failures = evaluate([row], { 'fixture-d': ['generate the thing'] });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('tier D declares no trigger phrases');
  });

  it('passes with an empty phrase list, and still enforces the 60-char ceiling', () => {
    const row = { bundle: 'fixture-d', after: 40, description: 'Generate the thing.', tier: 'D' };
    expect(evaluate([row], { 'fixture-d': [] })).toEqual([]);
    expect(evaluate([{ ...row, after: 61 }], { 'fixture-d': [] })).toHaveLength(1);
  });
});

describe('the tier table is internally consistent', () => {
  it('assigns every tier a known ceiling key', () => {
    for (const [bundle, tier] of Object.entries(TIERS)) {
      expect(Object.keys(TIER_CEILING), `${bundle} has unknown tier ${tier}`).toContain(tier);
    }
  });

  it('declares an empty phrase list for every Tier D bundle', () => {
    for (const [bundle, tier] of Object.entries(TIERS)) {
      if (tier === 'D') expect(REQUIRED_TRIGGERS[bundle]).toEqual([]);
    }
  });

  it('declares at least one phrase for every routed bundle', () => {
    for (const [bundle, tier] of Object.entries(TIERS)) {
      if (tier !== 'D') expect(REQUIRED_TRIGGERS[bundle]?.length, bundle).toBeGreaterThan(0);
    }
  });
});
