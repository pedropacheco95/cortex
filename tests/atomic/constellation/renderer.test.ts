/**
 * Atomic tests — `applyPreset` (constellation.renderer Rules 5-7) and the
 * confidence-tier -> style mapping the insight preset's client rendering
 * embeds (constellation.insight-preset-v3 Rule 5). Pure function coverage
 * over a handcrafted §4.9 v3.0 constellation: every curated preset predicate
 * (default | orphans | domain — the anatomy-defined lenses retired with the
 * anatomy node kind), the filter closure (edge both-endpoints, group pruning,
 * counter recompute), and the 400 error paths. `insight` (build-order-v3 step
 * 10) is a fourth, real, switcher-facing preset (`PRESET_NAMES`) — but its
 * composition is a wholly separate function (`composeInsightPreset`, covered
 * at the spec layer against real fixture files), never a curated
 * `applyPreset` filter, so calling `applyPreset` with `insight` directly is
 * itself an unknown-preset 400 (documented below, not a regression).
 */
import { describe, it, expect } from 'vitest';
import { applyPreset, PRESET_NAMES } from '../../../src/constellation/server.js';
import type { Constellation } from '../../../src/constellation/compile.js';

/**
 * Handcrafted map: a rule, a bug, a compass core file (orphan), two atlas
 * artefacts (one orphan), dev+business specs in domains `schema` and `hooks`.
 * Edges connect everything except the two orphans.
 */
function makeConstellation(): Constellation {
  return {
    schemaVersion: '1.0',
    generated: '2026-07-01T00:00:00.000Z',
    groups: [
      { id: 'atlas', label: 'Atlas', children: [{ id: 'atlas:decisions', label: 'decisions' }] },
      {
        id: 'compass',
        label: 'Compass',
        children: [
          { id: 'compass:bugs', label: 'bugs' },
          { id: 'compass:core-files', label: 'core files' },
          { id: 'compass:rules', label: 'rules' },
        ],
      },
      {
        id: 'specs',
        label: 'Specs',
        children: [
          { id: 'specs:hooks', label: 'hooks' },
          { id: 'specs:schema', label: 'schema' },
        ],
      },
    ],
    nodes: [
      { id: 'atlas:D-001', module: 'atlas', label: 'Big decision', group: 'atlas:decisions', ref: 'D-001' },
      { id: 'atlas:D-002', module: 'atlas', label: 'Lone decision', group: 'atlas:decisions', ref: 'D-002' },
      { id: 'bug:B-001', module: 'bug', label: 'Fixture bug', group: 'compass:bugs', ref: 'B-001' },
      { id: 'business:schema.trust', module: 'spec-business', label: 'schema.trust', group: 'specs:schema', ref: 'schema.trust' },
      { id: 'compass:preferences.md', module: 'compass', label: 'preferences.md', group: 'compass:core-files', ref: '.cortex/compass/preferences.md' },
      { id: 'rule:R-001', module: 'rule', label: 'Pure core', group: 'compass:rules', ref: 'R-001' },
      { id: 'spec:hooks.session-start', module: 'spec-dev', label: 'hooks.session-start', group: 'specs:hooks', ref: 'hooks.session-start' },
      { id: 'spec:schema.validator', module: 'spec-dev', label: 'schema.validator', group: 'specs:schema', ref: 'schema.validator' },
    ],
    edges: [
      { from: 'atlas:D-001', to: 'rule:R-001', kind: 'compass_rules' },
      { from: 'rule:R-001', to: 'bug:B-001', kind: 'source' },
      { from: 'spec:hooks.session-start', to: 'spec:schema.validator', kind: 'depends_on' },
      { from: 'spec:schema.validator', to: 'business:schema.trust', kind: 'implements' },
      { from: 'spec:schema.validator', to: 'rule:R-001', kind: 'governed_by' },
    ],
    counters: { compass: 3, atlas: 2, specs: 3, edges: 5, droppedRefs: 4 },
  };
}

function unwrap(result: ReturnType<typeof applyPreset>): Constellation {
  if (!result.ok) throw new Error(`expected ok, got 400: ${result.error}`);
  return result.constellation;
}

describe('applyPreset: default', () => {
  it('returns every node and edge unchanged, with the §4.9 top-level keys', () => {
    const input = makeConstellation();
    const out = unwrap(applyPreset(input, 'default'));
    expect(Object.keys(out).sort()).toEqual(['counters', 'edges', 'generated', 'groups', 'nodes', 'schemaVersion']);
    expect(out.nodes).toEqual(input.nodes);
    expect(out.edges).toEqual(input.edges);
    expect(out.groups).toEqual(input.groups);
    expect(out.schemaVersion).toBe('1.0');
    expect(out.generated).toBe('2026-07-01T00:00:00.000Z');
  });

  it('recomputes counters over the (full) sets — no anatomy key (v3.0)', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'default'));
    expect(out.counters).toEqual({ compass: 3, atlas: 2, specs: 3, edges: 5, droppedRefs: 4 });
  });

  it('does not mutate its input', () => {
    const input = makeConstellation();
    applyPreset(input, 'orphans');
    expect(input).toEqual(makeConstellation());
  });
});

describe('applyPreset: orphans', () => {
  it('keeps only nodes with zero connected edges in EITHER direction', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'orphans'));
    // D-002 and preferences.md touch no edge; everything else is an
    // endpoint somewhere (from OR to — the deliberate widening, spec Notes).
    expect(out.nodes.map((n) => n.id)).toEqual(['atlas:D-002', 'compass:preferences.md']);
  });

  it('excludes nodes with only outgoing edges (from-endpoint counts as connected)', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'orphans'));
    expect(out.nodes.map((n) => n.id)).not.toContain('atlas:D-001'); // only appears as `from`
  });

  it('excludes nodes with only incoming edges (to-endpoint counts as connected)', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'orphans'));
    expect(out.nodes.map((n) => n.id)).not.toContain('bug:B-001'); // only appears as `to`
    expect(out.nodes.map((n) => n.id)).not.toContain('business:schema.trust');
  });

  it('always returns an empty edge set', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'orphans'));
    expect(out.edges).toEqual([]);
    expect(out.counters.edges).toBe(0);
  });

  it('prunes to the groups and children still holding an orphan (closure)', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'orphans'));
    expect(out.groups.map((g) => g.id)).toEqual(['atlas', 'compass']);
    expect(out.groups.find((g) => g.id === 'compass')?.children).toEqual([
      { id: 'compass:core-files', label: 'core files' },
    ]);
    expect(out.groups.find((g) => g.id === 'atlas')?.children).toEqual([
      { id: 'atlas:decisions', label: 'decisions' },
    ]);
  });

  it('recomputes counters over the filtered sets, passing droppedRefs through', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'orphans'));
    expect(out.counters).toEqual({ compass: 1, atlas: 1, specs: 0, edges: 0, droppedRefs: 4 });
  });
});

describe('applyPreset: domain', () => {
  it('keeps only spec-dev/spec-business nodes whose id domain segment matches', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'domain', 'schema'));
    expect(out.nodes.map((n) => n.id)).toEqual(['business:schema.trust', 'spec:schema.validator']);
    expect(out.edges).toEqual([
      { from: 'spec:schema.validator', to: 'business:schema.trust', kind: 'implements' },
    ]);
    expect(out.groups).toEqual([
      { id: 'specs', label: 'Specs', children: [{ id: 'specs:schema', label: 'schema' }] },
    ]);
    expect(out.counters).toEqual({ compass: 0, atlas: 0, specs: 2, edges: 1, droppedRefs: 4 });
  });

  it('never admits non-spec modules even when the id segment matches', () => {
    const input = makeConstellation();
    // rule id segment would be "R-001" — ask for it explicitly.
    const out = unwrap(applyPreset(input, 'domain', 'R-001'));
    expect(out.nodes).toEqual([]);
  });

  it('a domain matching nothing is an honest empty lens: 200-shaped, empty sets, zeroed counters', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'domain', 'nonexistent'));
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
    expect(out.groups).toEqual([]);
    expect(out.counters).toEqual({ compass: 0, atlas: 0, specs: 0, edges: 0, droppedRefs: 4 });
  });

  it('missing domain parameter → 400 naming the requirement', () => {
    const result = applyPreset(makeConstellation(), 'domain');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.status).toBe(400);
    expect(result.error).toMatch(/domain/);
  });
});

describe('applyPreset: unknown preset', () => {
  it('rejects with 400 naming all four valid presets (the switcher-facing set, incl. insight)', () => {
    const result = applyPreset(makeConstellation(), 'pretty');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.status).toBe(400);
    for (const name of PRESET_NAMES) expect(result.error).toContain(name);
    expect(PRESET_NAMES).toEqual(['default', 'orphans', 'domain', 'insight']);
  });

  it('the retired v2 anatomy lenses are unknown presets now (v3.0)', () => {
    for (const retired of ['anatomy-only', 'knowledge-only']) {
      const result = applyPreset(makeConstellation(), retired);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.status).toBe(400);
      expect(result.error).toContain('default, orphans, domain, insight');
    }
  });

  it('insight is a real preset (PRESET_NAMES) but NOT a curated applyPreset filter — composeInsightPreset owns it separately', () => {
    const result = applyPreset(makeConstellation(), 'insight');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.status).toBe(400);
    // Still named as valid overall — the error lists the full switcher set,
    // it just isn't a curated-filter preset THIS function implements.
    expect(result.error).toContain('insight');
  });
});
