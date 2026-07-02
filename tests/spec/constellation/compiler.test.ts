/**
 * Spec-level tests — constellation.compiler. One describe per spec AC (10 in
 * total), JSON-property assertions over tmp fixture projects. The scan-based
 * ACs exercise the real `scan()` → `compile()` wiring (spec Rule 9: the
 * constellation refreshes whenever anatomy does).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { compile } from '../../../src/constellation/compile.js';
import { scan } from '../../../src/anatomy/scan.js';
import { validate } from '../../../src/schema/validate.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeRule,
  writeFilesMd,
  filesRow,
  writeLayersMd,
  writeDevSpec,
  writeBizSpec,
  writeBug,
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

/** Initialised-and-scannable project: real src files, specs, a rule, a bug. */
function scannableFixture(root: string): void {
  makeCortexProject(root);
  fs.mkdirSync(path.join(root, 'src', 'schema'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'cli'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'schema', 'validate.ts'),
    '/** Validates artefacts against the schema. */\nexport const v = 1;\n',
  );
  fs.writeFileSync(
    path.join(root, 'src', 'cli', 'init.ts'),
    '/** Bootstraps a project. */\nexport const i = 1;\n',
  );
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
    'scanned project with specs, a rule, and a bug → constellation.json exists and check.constellation reports zero errors',
    async () => {
      const root = tmp('ac1');
      scannableFixture(root);
      await scan(root); // Rule 9 wiring: scan invokes compile after anatomy emission
      expect(fs.existsSync(constellationPath(root))).toBe(true);
      const report = await validate(root, { root });
      expect(report.violations.filter((v) => v.check === 'check.constellation')).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
// AC 2: Four top groups with natural children
// ===========================================================================

describe('AC compiler.2: four top groups with natural children', () => {
  it(
    'layers src/schema + src/cli, one rule, dev-spec domain schema → the four group ids with the named children',
    async () => {
      const root = tmp('ac2');
      scannableFixture(root);
      await scan(root);
      const c = readConstellation(root);
      expect(c.groups.map((g) => g.id).sort()).toEqual(['anatomy', 'atlas', 'cerebrum', 'specs']);
      expect(c.groups).toHaveLength(4);
      const anatomyChildren = c.groups.find((g) => g.id === 'anatomy')?.children.map((ch) => ch.label);
      expect(anatomyChildren).toContain('src/schema');
      expect(anatomyChildren).toContain('src/cli');
      expect(c.groups.find((g) => g.id === 'cerebrum')?.children).toContainEqual({
        id: 'cerebrum:rules',
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
// AC 3: Anatomy nodes carry token sizes and layer groups
// ===========================================================================

describe('AC compiler.3: anatomy nodes carry token sizes and layer groups', () => {
  it('files.md row src/a.ts with tokens 120 in layer src → node with size 120 and the src layer child', async () => {
    const root = tmp('ac3');
    makeCortexProject(root);
    writeFilesMd(root, [filesRow('src/a.ts', 120)]);
    writeLayersMd(root, { src: ['src/a.ts'] });
    const c = await compile(root);
    const node = c.nodes.find((n) => n.id === 'anatomy:src/a.ts');
    expect(node?.size).toBe(120);
    expect(node?.group).toBe('anatomy:layer:src');
    expect(c.groups.find((g) => g.id === 'anatomy')?.children).toContainEqual({
      id: 'anatomy:layer:src',
      label: 'src',
    });
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
// AC 5: governs globs expand to per-file edges
// ===========================================================================

describe('AC compiler.5: governs globs expand to per-file edges', () => {
  it('R-001 governs src/schema/**/*.ts with two anatomy nodes under src/schema/ → two governs edges', async () => {
    const root = tmp('ac5');
    makeCortexProject(root);
    writeFilesMd(root, [
      filesRow('src/schema/a.ts', 10),
      filesRow('src/schema/b.ts', 20),
      filesRow('src/other/c.ts', 30),
    ]);
    writeRule(root, 'R-001-scope.md', `id: R-001\ntitle: Scoped\nsource: []\ngoverns:\n  - "src/schema/**/*.ts"`);
    const c = await compile(root);
    const governs = c.edges.filter((e) => e.kind === 'governs' && e.from === 'rule:R-001');
    expect(governs).toEqual([
      { from: 'rule:R-001', to: 'anatomy:src/schema/a.ts', kind: 'governs' },
      { from: 'rule:R-001', to: 'anatomy:src/schema/b.ts', kind: 'governs' },
    ]);
  });
});

// ===========================================================================
// AC 6: spec_links produce file→spec edges
// ===========================================================================

describe('AC compiler.6: spec_links produce file→spec edges', () => {
  it('files.md row for src/schema/validate.ts with spec_links schema.validator → the anatomy→spec edge', async () => {
    const root = tmp('ac6');
    makeCortexProject(root);
    writeFilesMd(root, [filesRow('src/schema/validate.ts', 50, 'schema.validator')]);
    writeDevSpec(
      root,
      'schema/validator.spec.md',
      `id: schema.validator\nstatus: draft\nimplements: ../../specs-business/schema/trust.business.md`,
    );
    writeBizSpec(root, 'schema/trust.business.md', `id: schema.trust\nstatus: draft\nimplemented_by: []`);
    const c = await compile(root);
    expect(c.edges).toContainEqual({
      from: 'anatomy:src/schema/validate.ts',
      to: 'spec:schema.validator',
      kind: 'spec_links',
    });
  });
});

// ===========================================================================
// AC 7: Dangling refs dropped and counted, never emitted
// ===========================================================================

describe('AC compiler.7: dangling refs dropped and counted, never emitted', () => {
  it('a rule whose source names a deleted file → no unresolvable endpoint, droppedRefs >= 1', async () => {
    const root = tmp('ac7');
    makeCortexProject(root);
    writeFilesMd(root, [filesRow('src/a.ts', 10)]);
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
  it('graph.json with three import edges → no constellation edge has kind import or export', async () => {
    const root = tmp('ac8');
    makeCortexProject(root);
    writeFilesMd(root, [filesRow('src/a.ts', 10), filesRow('src/b.ts', 10), filesRow('src/c.ts', 10)]);
    fs.writeFileSync(
      path.join(root, '.cortex', 'anatomy', 'graph.json'),
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
      scannableFixture(root);
      await scan(root);
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
  it('anatomy only — no atlas, no rules, no spec trees → success; atlas/specs groups empty; orphan nodes emitted', async () => {
    const root = tmp('ac10');
    makeCortexProject(root);
    writeFilesMd(root, [filesRow('src/lonely.ts', 42)]);
    const c = await compile(root);
    expect(c.groups.map((g) => g.id)).toEqual(['anatomy', 'atlas', 'cerebrum', 'specs']);
    expect(c.groups.find((g) => g.id === 'atlas')?.children).toEqual([]);
    expect(c.groups.find((g) => g.id === 'specs')?.children).toEqual([]);
    expect(c.nodes.filter((n) => n.module === 'atlas')).toEqual([]);
    expect(c.nodes.filter((n) => n.module === 'spec-dev' || n.module === 'spec-business')).toEqual([]);
    // the orphan anatomy node (zero edges) is still emitted — gaps are information
    expect(c.nodes.find((n) => n.id === 'anatomy:src/lonely.ts')).toBeDefined();
    expect(c.edges).toEqual([]);
  });
});
