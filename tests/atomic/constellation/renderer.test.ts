/**
 * Atomic tests — `applyPreset` (constellation.renderer Rules 5-7). Pure
 * function coverage over a handcrafted §4.9 constellation: every preset
 * predicate, the filter closure (edge both-endpoints, group pruning, counter
 * recompute), and the 400 error paths.
 */
import { describe, it, expect } from 'vitest';
import { applyPreset, PRESET_NAMES } from '../../../src/constellation/server.js';
import type { Constellation } from '../../../src/constellation/compile.js';

/**
 * Handcrafted map: two anatomy nodes (one fully disconnected), a rule, a bug,
 * a compass core file, an atlas artefact, dev+business specs in domains
 * `schema` and `hooks`. Edges connect everything except the orphans.
 */
function makeConstellation(): Constellation {
  return {
    schemaVersion: '1.0',
    generated: '2026-07-01T00:00:00.000Z',
    groups: [
      {
        id: 'anatomy',
        label: 'Anatomy',
        children: [
          { id: 'anatomy:layer:src/cli', label: 'src/cli' },
          { id: 'anatomy:layer:src/schema', label: 'src/schema' },
        ],
      },
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
      { id: 'anatomy:src/cli/lone.ts', module: 'anatomy', label: 'lone.ts', group: 'anatomy:layer:src/cli', ref: 'src/cli/lone.ts', size: 10 },
      { id: 'anatomy:src/schema/validate.ts', module: 'anatomy', label: 'validate.ts', group: 'anatomy:layer:src/schema', ref: 'src/schema/validate.ts', size: 90 },
      { id: 'atlas:D-001', module: 'atlas', label: 'Big decision', group: 'atlas:decisions', ref: 'D-001' },
      { id: 'bug:B-001', module: 'bug', label: 'Fixture bug', group: 'compass:bugs', ref: 'B-001' },
      { id: 'business:schema.trust', module: 'spec-business', label: 'schema.trust', group: 'specs:schema', ref: 'schema.trust' },
      { id: 'compass:preferences.md', module: 'compass', label: 'preferences.md', group: 'compass:core-files', ref: '.cortex/compass/preferences.md' },
      { id: 'rule:R-001', module: 'rule', label: 'Pure core', group: 'compass:rules', ref: 'R-001' },
      { id: 'spec:hooks.session-start', module: 'spec-dev', label: 'hooks.session-start', group: 'specs:hooks', ref: 'hooks.session-start' },
      { id: 'spec:schema.validator', module: 'spec-dev', label: 'schema.validator', group: 'specs:schema', ref: 'schema.validator' },
    ],
    edges: [
      { from: 'atlas:D-001', to: 'rule:R-001', kind: 'compass_rules' },
      { from: 'rule:R-001', to: 'anatomy:src/schema/validate.ts', kind: 'governs' },
      { from: 'rule:R-001', to: 'bug:B-001', kind: 'source' },
      { from: 'spec:hooks.session-start', to: 'spec:schema.validator', kind: 'depends_on' },
      { from: 'spec:schema.validator', to: 'business:schema.trust', kind: 'implements' },
      { from: 'spec:schema.validator', to: 'rule:R-001', kind: 'governed_by' },
    ],
    counters: { anatomy: 2, compass: 3, atlas: 1, specs: 3, edges: 6, droppedRefs: 4 },
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

  it('recomputes counters over the (full) sets', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'default'));
    expect(out.counters).toEqual({ anatomy: 2, compass: 3, atlas: 1, specs: 3, edges: 6, droppedRefs: 4 });
  });

  it('does not mutate its input', () => {
    const input = makeConstellation();
    applyPreset(input, 'anatomy-only');
    expect(input).toEqual(makeConstellation());
  });
});

describe('applyPreset: anatomy-only', () => {
  it('keeps exactly the module=="anatomy" nodes', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'anatomy-only'));
    expect(out.nodes.map((n) => n.module)).toEqual(['anatomy', 'anatomy']);
    expect(out.nodes.map((n) => n.id)).toEqual(['anatomy:src/cli/lone.ts', 'anatomy:src/schema/validate.ts']);
  });

  it('drops every edge with a filtered-out endpoint (closure)', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'anatomy-only'));
    // rule:R-001 → anatomy governs edge dies with the rule node; no edge survives.
    expect(out.edges).toEqual([]);
  });

  it('prunes groups and children with no remaining nodes', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'anatomy-only'));
    expect(out.groups.map((g) => g.id)).toEqual(['anatomy']);
    expect(out.groups[0]?.children.map((c) => c.id)).toEqual([
      'anatomy:layer:src/cli',
      'anatomy:layer:src/schema',
    ]);
  });

  it('recomputes counters over the filtered sets, passing droppedRefs through', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'anatomy-only'));
    expect(out.counters).toEqual({ anatomy: 2, compass: 0, atlas: 0, specs: 0, edges: 0, droppedRefs: 4 });
  });
});

describe('applyPreset: knowledge-only', () => {
  it('excludes anatomy and keeps rule/bug/compass/atlas/spec-dev/spec-business', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'knowledge-only'));
    expect(out.nodes.some((n) => n.module === 'anatomy')).toBe(false);
    expect(new Set(out.nodes.map((n) => n.module))).toEqual(
      new Set(['rule', 'bug', 'compass', 'atlas', 'spec-dev', 'spec-business']),
    );
  });

  it('drops only the edges touching anatomy nodes', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'knowledge-only'));
    expect(out.edges).toEqual(makeConstellation().edges.filter((e) => e.kind !== 'governs'));
    expect(out.counters.edges).toBe(5);
  });

  it('prunes the anatomy group entirely, keeps the other three', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'knowledge-only'));
    expect(out.groups.map((g) => g.id)).toEqual(['atlas', 'compass', 'specs']);
  });
});

describe('applyPreset: orphans', () => {
  it('keeps only nodes with zero connected edges in EITHER direction', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'orphans'));
    // lone.ts and preferences.md touch no edge; everything else is an
    // endpoint somewhere (from OR to — the deliberate widening, spec Notes).
    expect(out.nodes.map((n) => n.id)).toEqual(['anatomy:src/cli/lone.ts', 'compass:preferences.md']);
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

  it('prunes to the groups still holding an orphan', () => {
    const out = unwrap(applyPreset(makeConstellation(), 'orphans'));
    expect(out.groups.map((g) => g.id)).toEqual(['anatomy', 'compass']);
    expect(out.groups.find((g) => g.id === 'compass')?.children).toEqual([
      { id: 'compass:core-files', label: 'core files' },
    ]);
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
    expect(out.counters).toEqual({ anatomy: 0, compass: 0, atlas: 0, specs: 2, edges: 1, droppedRefs: 4 });
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
    expect(out.counters).toEqual({ anatomy: 0, compass: 0, atlas: 0, specs: 0, edges: 0, droppedRefs: 4 });
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
  it('rejects with 400 naming all five valid presets', () => {
    const result = applyPreset(makeConstellation(), 'pretty');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.status).toBe(400);
    for (const name of PRESET_NAMES) expect(result.error).toContain(name);
    expect(PRESET_NAMES).toEqual(['default', 'anatomy-only', 'knowledge-only', 'orphans', 'domain']);
  });
});
