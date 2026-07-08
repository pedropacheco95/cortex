/**
 * Spec-level tests — constellation.compiler (§4.9 v3.0). One describe per
 * spec AC, JSON-property assertions over tmp fixture projects. v3 note
 * (build-order-v3 step 7): the anatomy surface is gone — `cortex scan` is now
 * the compiler itself, so the ACs drive `compile()` directly; the anatomy
 * node/size/layer ACs are replaced by their negative (anatomy inputs are
 * ignored even when present on disk).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { compile } from '../../../src/constellation/compile.js';
import { validate } from '../../../src/schema/validate.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeRule,
  writeDevSpec,
  writeBizSpec,
  writeBug,
  writeAtlas,
  writeScenarioSpec,
  constellationPath,
  readConstellation,
  withoutGeneratedLine,
} from '../../fixtures/constellation-harness.js';

const TEST_TIMEOUT = 30_000;
const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`spec-constellation-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** Initialised project across the three surfaces: a rule, a bug, an atlas decision, specs. */
function knowledgeFixture(root: string): void {
  makeCortexProject(root);
  writeRule(
    root,
    'R-001-pure-core.md',
    `id: R-001\ntitle: Pure core\nsource:\n  - ../bugs/B-001-fixture.md\ngoverns:\n  - "src/schema/**"`,
  );
  writeBug(
    root,
    'B-001-fixture.md',
    `id: B-001\ntitle: Fixture bug\ntype: test-defect\nseverity: low\nstatus: open\naffects:\n  - R-001`,
  );
  writeAtlas(root, 'decisions/D-001.md', `id: D-001\ntitle: Fixture decision\ncompass_rules:\n  - R-001`);
  writeDevSpec(
    root,
    'schema/validator.spec.md',
    `id: schema.validator\nstatus: draft\nimplements: ../../specs-business/schema/trust.business.md\ngoverned_by:\n  - R-001`,
  );
  writeBizSpec(
    root,
    'schema/trust.business.md',
    `id: schema.trust\nstatus: draft\nimplemented_by:\n  - ../../specs/schema/validator.spec.md`,
  );
}

// ===========================================================================
// AC 1: Emitted artefact passes the schema check
// ===========================================================================

describe('AC compiler.1: emitted artefact passes the schema check', () => {
  it(
    'project with specs, a rule, and a bug → constellation.json exists and check.constellation reports zero errors',
    async () => {
      const root = tmp('ac1');
      knowledgeFixture(root);
      await compile(root); // `cortex scan` delegates here (v3: the scan verb IS the compiler)
      expect(fs.existsSync(constellationPath(root))).toBe(true);
      const report = await validate(root, { root });
      expect(report.violations.filter((v) => v.check === 'check.constellation')).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
// AC 2: Three top groups with natural children (v3.0: anatomy removed)
// ===========================================================================

describe('AC compiler.2: three top groups with natural children', () => {
  it(
    'one rule, one atlas decision, dev-spec domain schema → the three group ids in array order with the named children',
    async () => {
      const root = tmp('ac2');
      knowledgeFixture(root);
      await compile(root);
      const c = readConstellation(root);
      expect(c.groups.map((g) => g.id)).toEqual(['atlas', 'compass', 'specs']);
      expect(c.groups).toHaveLength(3);
      expect(c.groups.find((g) => g.id === 'atlas')?.children).toContainEqual({
        id: 'atlas:decisions',
        label: 'decisions',
      });
      expect(c.groups.find((g) => g.id === 'compass')?.children).toContainEqual({
        id: 'compass:rules',
        label: 'rules',
      });
      expect(c.groups.find((g) => g.id === 'specs')?.children).toContainEqual({
        id: 'specs:schema',
        label: 'schema',
      });
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
// AC 3 (v3): anatomy inputs are ignored — no nodes, no group, no counter
// ===========================================================================

describe('AC compiler.3 (v3): anatomy inputs are ignored even when present on disk', () => {
  it('a leftover .cortex/anatomy/files.md produces no anatomy nodes, no anatomy group, and no anatomy counter key', async () => {
    const root = tmp('ac3');
    knowledgeFixture(root);
    // Legacy leftover from a v2 project — the v3 compiler must not read it.
    const anatomyDir = path.join(root, '.cortex', 'anatomy');
    fs.mkdirSync(anatomyDir, { recursive: true });
    fs.writeFileSync(
      path.join(anatomyDir, 'files.md'),
      `---\nkind: anatomy-files\nlast_full_scan: 2026-06-30T14:00:00.000Z\nfile_count: 1\n---\n\n` +
        `| path | purpose | tokens | sha256 | last_seen | spec_links | needs_purpose_refresh | purpose_source |\n` +
        `|------|---------|--------|--------|-----------|------------|-----------------------|----------------|\n` +
        `| src/a.ts | Legacy row. | 120 | ${'a'.repeat(64)} | 2026-06-30T14:00:00.000Z | schema.validator | false | scanner-llm |\n`,
    );
    fs.writeFileSync(path.join(anatomyDir, 'layers.md'), `## src\n\n- src/a.ts\n`);
    const c = await compile(root);
    expect(c.nodes.filter((n) => n.id.startsWith('anatomy:'))).toEqual([]);
    expect(c.groups.find((g) => g.id === 'anatomy')).toBeUndefined();
    expect(Object.keys(c.counters)).toEqual(['compass', 'atlas', 'specs', 'edges', 'droppedRefs']);
  });
});

// ===========================================================================
// AC 4: implements dedupes to a single edge
// ===========================================================================

describe('AC compiler.4: implements dedupes to a single edge', () => {
  it('symmetric implements/implemented_by pair → exactly one dev→business implements edge', async () => {
    const root = tmp('ac4');
    makeCortexProject(root);
    writeDevSpec(
      root,
      'schema/validator.spec.md',
      `id: schema.validator\nstatus: draft\nimplements: ../../specs-business/schema/trust.business.md`,
    );
    writeBizSpec(
      root,
      'schema/trust.business.md',
      `id: schema.trust\nstatus: draft\nimplemented_by:\n  - ../../specs/schema/validator.spec.md`,
    );
    const c = await compile(root);
    const between = c.edges.filter(
      (e) =>
        (e.from === 'spec:schema.validator' && e.to === 'business:schema.trust') ||
        (e.from === 'business:schema.trust' && e.to === 'spec:schema.validator'),
    );
    expect(between).toEqual([
      { from: 'spec:schema.validator', to: 'business:schema.trust', kind: 'implements' },
    ]);
  });
});

// ===========================================================================
// AC 5 (v3): governs globs produce no edges and no droppedRefs
// ===========================================================================

describe('AC compiler.5 (v3): governs globs produce no edges and no droppedRefs', () => {
  it('R-001 governs src/schema/**/*.ts → zero governs edges, zero droppedRefs (globs reference files, not nodes)', async () => {
    const root = tmp('ac5');
    makeCortexProject(root);
    writeRule(root, 'R-001-scope.md', `id: R-001\ntitle: Scoped\nsource: []\ngoverns:\n  - "src/schema/**/*.ts"`);
    const c = await compile(root);
    expect(c.edges.filter((e) => e.kind === 'governs')).toEqual([]);
    expect(c.counters.droppedRefs).toBe(0);
  });
});

// ===========================================================================
// AC 6 (v3): scenario covers produce no edges and no droppedRefs
// ===========================================================================

describe('AC compiler.6 (v3): scenario covers produce no edges and no droppedRefs', () => {
  it('a scenario spec covering an existing business spec → zero covers edges, zero droppedRefs', async () => {
    const root = tmp('ac6');
    makeCortexProject(root);
    writeBizSpec(root, 'schema/trust.business.md', `id: schema.trust\nstatus: draft\nimplemented_by: []`);
    writeScenarioSpec(root, 'first-run', ['schema.trust']);
    const c = await compile(root);
    expect(c.edges.filter((e) => e.kind === 'covers' || e.kind === 'spec_links')).toEqual([]);
    expect(c.counters.droppedRefs).toBe(0);
  });
});

// ===========================================================================
// AC 7: Dangling refs dropped and counted, never emitted
// ===========================================================================

describe('AC compiler.7: dangling refs dropped and counted, never emitted', () => {
  it('a rule whose source names a deleted file → no unresolvable endpoint, droppedRefs >= 1', async () => {
    const root = tmp('ac7');
    makeCortexProject(root);
    writeRule(
      root,
      'R-001-dead-source.md',
      `id: R-001\ntitle: Dead source\nsource:\n  - ../../atlas/decisions/deleted-forever.md\ngoverns:\n  - "src/**"`,
    );
    const c = await compile(root);
    const nodeIds = new Set(c.nodes.map((n) => n.id));
    for (const e of c.edges) {
      expect(nodeIds.has(e.from)).toBe(true);
      expect(nodeIds.has(e.to)).toBe(true);
    }
    expect(c.counters.droppedRefs).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// AC 8: Import edges are excluded
// ===========================================================================

describe('AC compiler.8: import edges are excluded', () => {
  it('an insight graph.json with three import edges → no constellation edge has kind import or export', async () => {
    const root = tmp('ac8');
    makeCortexProject(root);
    knowledgeFixture(root);
    fs.mkdirSync(path.join(root, '.cortex', 'insight'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.cortex', 'insight', 'graph.json'),
      JSON.stringify({
        nodes: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
        edges: [
          { from: 'src/a.ts', to: 'src/b.ts', kind: 'import' },
          { from: 'src/a.ts', to: 'src/c.ts', kind: 'import' },
          { from: 'src/b.ts', to: 'src/c.ts', kind: 'import' },
        ],
      }),
    );
    const c = await compile(root);
    expect(c.edges.filter((e) => e.kind === 'import' || e.kind === 'export')).toEqual([]);
  });
});

// ===========================================================================
// AC 9: Deterministic modulo timestamp
// ===========================================================================

describe('AC compiler.9: deterministic modulo timestamp', () => {
  it(
    'two runs without input changes → byte-identical after removing the generated line',
    async () => {
      const root = tmp('ac9');
      knowledgeFixture(root);
      await compile(root);
      const first = fs.readFileSync(constellationPath(root), 'utf-8');
      await new Promise((r) => setTimeout(r, 5));
      await compile(root);
      const second = fs.readFileSync(constellationPath(root), 'utf-8');
      expect(withoutGeneratedLine(second)).toBe(withoutGeneratedLine(first));
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
// AC 10: Empty surfaces compile, orphans survive
// ===========================================================================

describe('AC compiler.10: empty surfaces compile, orphans survive', () => {
  it('compass only — no atlas, no spec trees → success; atlas/specs groups empty; orphan nodes emitted', async () => {
    const root = tmp('ac10');
    makeCortexProject(root);
    writeRule(root, 'R-001-lonely.md', `id: R-001\ntitle: Lonely rule\nsource: []`);
    const c = await compile(root);
    expect(c.groups.map((g) => g.id)).toEqual(['atlas', 'compass', 'specs']);
    expect(c.groups.find((g) => g.id === 'atlas')?.children).toEqual([]);
    expect(c.groups.find((g) => g.id === 'specs')?.children).toEqual([]);
    expect(c.nodes.filter((n) => n.module === 'atlas')).toEqual([]);
    expect(c.nodes.filter((n) => n.module === 'spec-dev' || n.module === 'spec-business')).toEqual([]);
    // the orphan rule node (zero edges) is still emitted — gaps are information
    expect(c.nodes.find((n) => n.id === 'rule:R-001')).toBeDefined();
    expect(c.edges).toEqual([]);
  });
});
