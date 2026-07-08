/**
 * Atomic tests — constellation.compiler (schema §4.9 contract mechanics):
 * node id prefixes and modules per surface, scaffolding exclusion, group
 * children per natural grouping, every §6 edge kind, implements dedup,
 * dangling-ref counting, counters, determinism, missing-surface tolerance.
 * JSON-property assertions over handcrafted tmp fixture projects.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { compile } from '../../../src/constellation/compile.js';
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
  writeAtlas,
  writeCompassCoreFile,
  writeScenarioSpec,
  constellationPath,
  readConstellation,
  withoutGeneratedLine,
} from '../../fixtures/constellation-harness.js';
import type { Constellation, ConstellationEdge } from '../../../src/constellation/compile.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`constellation-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** A project exercising all four surfaces and every §6 citation field. */
function fullFixture(root: string): void {
  makeCortexProject(root);
  writeFilesMd(root, [
    filesRow('src/schema/validate.ts', 120, 'schema.validator'),
    filesRow('src/schema/types.ts', 30),
    filesRow('src/cli/init.ts', 200),
    filesRow('.specflow/specs/_overview.md', 10), // scaffolding — never a node
    filesRow('docs/_index.md', 5), // scaffolding — never a node
    filesRow('tests/scenario/specs/first-run.md', 40),
  ]);
  writeLayersMd(root, { 'src/schema': ['src/schema/validate.ts', 'src/schema/types.ts'] });
  writeRule(
    root,
    'R-001-pure-core.md',
    `id: R-001
title: Pure core
source:
  - ../../atlas/decisions/2026-01-01-core.md
  - ../bugs/B-001-noise.md
governs:
  - "src/schema/**"
related_specs:
  - schema.validator`,
  );
  writeBug(
    root,
    'B-001-noise.md',
    `id: B-001\ntitle: Path-match noise\ntype: wrong-rule\nseverity: low\nstatus: resolved\naffects:\n  - R-001`,
  );
  writeCompassCoreFile(root, 'preferences.md');
  writeCompassCoreFile(root, 'environment.md');
  writeAtlas(
    root,
    'decisions/2026-01-01-core.md',
    `id: decision.2026-01-01-core
title: Core decision
date: 2026-01-01T00:00:00Z
compass_rules:
  - R-001
supersedes:
  - 2025-12-01-old.md
sources:
  - ../sources/brief.meta.md
related_specs:
  - schema.contributor-trusts`,
  );
  writeAtlas(
    root,
    'decisions/2025-12-01-old.md',
    `id: decision.2025-12-01-old\ntitle: Old decision\ndate: 2025-12-01T00:00:00Z`,
  );
  writeAtlas(root, 'sources/brief.meta.md', `id: source.brief\nkind: design-doc\ncaptured: 2026-01-01T00:00:00Z`);
  writeDevSpec(
    root,
    'schema/validator.spec.md',
    `id: schema.validator
status: draft
implements: ../../specs-business/schema/contributor-trusts.business.md
depends_on:
  - core-cli.init
governed_by:
  - R-001
governs:
  - "src/schema/**/*.ts"`,
  );
  writeDevSpec(
    root,
    'core-cli/init.spec.md',
    `id: core-cli.init\nstatus: draft\nimplements: ../../specs-business/core-cli/setup.business.md`,
  );
  writeBizSpec(
    root,
    'schema/contributor-trusts.business.md',
    `id: schema.contributor-trusts\nstatus: draft\nimplemented_by:\n  - ../../specs/schema/validator.spec.md`,
  );
  writeBizSpec(
    root,
    'core-cli/setup.business.md',
    `id: core-cli.setup
status: draft
implemented_by:
  - ../../specs/core-cli/init.spec.md
depends_on:
  - schema.contributor-trusts`,
  );
  writeScenarioSpec(root, 'first-run', ['schema.contributor-trusts']);
}

function node(c: Constellation, id: string) {
  return c.nodes.find((n) => n.id === id);
}

function edgesOf(c: Constellation, kind: string): ConstellationEdge[] {
  return c.edges.filter((e) => e.kind === kind);
}

describe('top-level shape (§4.9)', () => {
  it('emits all required keys, schemaVersion from cortex.config.json, ISO generated, and writes .cortex/constellation.json', async () => {
    const root = tmp('shape');
    fullFixture(root);
    const c = await compile(root);
    expect(Object.keys(c)).toEqual(['schemaVersion', 'generated', 'groups', 'nodes', 'edges', 'counters']);
    expect(c.schemaVersion).toBe('1.0');
    expect(Number.isNaN(Date.parse(c.generated))).toBe(false);
    expect(fs.existsSync(constellationPath(root))).toBe(true);
    expect(readConstellation(root)).toEqual(c);
  });

  it('exactly the four top groups, sorted', async () => {
    const root = tmp('groups');
    fullFixture(root);
    const c = await compile(root);
    expect(c.groups.map((g) => g.id)).toEqual(['anatomy', 'atlas', 'compass', 'specs']);
  });
});

describe('nodes: module-prefixed unique ids per surface (Rule 3)', () => {
  it('emits anatomy/rule/bug/compass/atlas/spec/business nodes with the §4.9 modules', async () => {
    const root = tmp('nodes');
    fullFixture(root);
    const c = await compile(root);
    expect(node(c, 'anatomy:src/schema/validate.ts')?.module).toBe('anatomy');
    expect(node(c, 'rule:R-001')?.module).toBe('rule');
    expect(node(c, 'bug:B-001')?.module).toBe('bug');
    expect(node(c, 'compass:preferences.md')?.module).toBe('compass');
    expect(node(c, 'atlas:decision.2026-01-01-core')?.module).toBe('atlas');
    expect(node(c, 'spec:schema.validator')?.module).toBe('spec-dev');
    expect(node(c, 'business:schema.contributor-trusts')?.module).toBe('spec-business');
    const ids = c.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('anatomy nodes carry ref = relpath and size = tokens; rule label = title', async () => {
    const root = tmp('refs');
    fullFixture(root);
    const c = await compile(root);
    const anatomy = node(c, 'anatomy:src/schema/validate.ts');
    expect(anatomy?.ref).toBe('src/schema/validate.ts');
    expect(anatomy?.size).toBe(120);
    expect(anatomy?.label).toBe('validate.ts');
    expect(node(c, 'rule:R-001')?.label).toBe('Pure core');
  });

  it('_index.md and _overview.md files never become nodes', async () => {
    const root = tmp('scaffolding');
    fullFixture(root);
    const c = await compile(root);
    expect(node(c, 'anatomy:.specflow/specs/_overview.md')).toBeUndefined();
    expect(node(c, 'anatomy:docs/_index.md')).toBeUndefined();
  });

  it('compass core-file nodes exist only for files that exist', async () => {
    const root = tmp('corefiles');
    fullFixture(root); // only preferences.md + environment.md written
    const c = await compile(root);
    expect(node(c, 'compass:preferences.md')).toBeDefined();
    expect(node(c, 'compass:environment.md')).toBeDefined();
    expect(node(c, 'compass:do-not-repeat.md')).toBeUndefined();
  });

  it('decisions.md never becomes a compass node, even when present on disk (decisions are single-homed to atlas/decisions/)', async () => {
    const root = tmp('corefiles-decisions-excluded');
    fullFixture(root);
    writeCompassCoreFile(root, 'decisions.md');
    const c = await compile(root);
    expect(node(c, 'compass:decisions.md')).toBeUndefined();
  });

  it('the standing-authorities.md core file becomes a compass node when present', async () => {
    const root = tmp('standing-authorities');
    fullFixture(root);
    writeCompassCoreFile(root, 'standing-authorities.md');
    const c = await compile(root);
    expect(node(c, 'compass:standing-authorities.md')?.module).toBe('compass');
  });
});

describe('groups: natural children (Rule 4)', () => {
  it('anatomy children come from layers.md; unlisted files fall into (unassigned)', async () => {
    const root = tmp('layers');
    fullFixture(root);
    const c = await compile(root);
    const anatomyGroup = c.groups.find((g) => g.id === 'anatomy');
    expect(anatomyGroup?.children).toEqual([
      { id: 'anatomy:layer:(unassigned)', label: '(unassigned)' },
      { id: 'anatomy:layer:src/schema', label: 'src/schema' },
    ]);
    expect(node(c, 'anatomy:src/schema/types.ts')?.group).toBe('anatomy:layer:src/schema');
    expect(node(c, 'anatomy:src/cli/init.ts')?.group).toBe('anatomy:layer:(unassigned)');
  });

  it('compass children by category; atlas by subfolder; specs by domain (dev+business shared)', async () => {
    const root = tmp('children');
    fullFixture(root);
    const c = await compile(root);
    expect(c.groups.find((g) => g.id === 'compass')?.children.map((ch) => ch.id)).toEqual([
      'compass:bugs',
      'compass:core-files',
      'compass:rules',
    ]);
    expect(c.groups.find((g) => g.id === 'atlas')?.children.map((ch) => ch.id)).toEqual([
      'atlas:decisions',
      'atlas:sources',
    ]);
    expect(c.groups.find((g) => g.id === 'specs')?.children.map((ch) => ch.id)).toEqual([
      'specs:core-cli',
      'specs:schema',
    ]);
    // dev and business nodes share the domain child; module distinguishes them.
    expect(node(c, 'spec:schema.validator')?.group).toBe('specs:schema');
    expect(node(c, 'business:schema.contributor-trusts')?.group).toBe('specs:schema');
  });

  it('every node group resolves to a declared child', async () => {
    const root = tmp('resolve');
    fullFixture(root);
    const c = await compile(root);
    const declared = new Set(c.groups.flatMap((g) => g.children.map((ch) => ch.id)));
    for (const n of c.nodes) expect(declared.has(n.group)).toBe(true);
  });
});

describe('edges: the §6 citation graph, one kind per producing field (Rule 5)', () => {
  it('emits every §6 edge kind from the full fixture', async () => {
    const root = tmp('edges');
    fullFixture(root);
    const c = await compile(root);
    expect(edgesOf(c, 'implements')).toContainEqual({
      from: 'spec:schema.validator',
      to: 'business:schema.contributor-trusts',
      kind: 'implements',
    });
    expect(edgesOf(c, 'depends_on')).toContainEqual({
      from: 'spec:schema.validator',
      to: 'spec:core-cli.init',
      kind: 'depends_on',
    });
    expect(edgesOf(c, 'depends_on')).toContainEqual({
      from: 'business:core-cli.setup',
      to: 'business:schema.contributor-trusts',
      kind: 'depends_on',
    });
    expect(edgesOf(c, 'governed_by')).toContainEqual({
      from: 'spec:schema.validator',
      to: 'rule:R-001',
      kind: 'governed_by',
    });
    expect(edgesOf(c, 'source')).toContainEqual({
      from: 'rule:R-001',
      to: 'atlas:decision.2026-01-01-core',
      kind: 'source',
    });
    expect(edgesOf(c, 'source')).toContainEqual({ from: 'rule:R-001', to: 'bug:B-001', kind: 'source' });
    expect(edgesOf(c, 'related_specs')).toContainEqual({
      from: 'rule:R-001',
      to: 'spec:schema.validator',
      kind: 'related_specs',
    });
    expect(edgesOf(c, 'related_specs')).toContainEqual({
      from: 'atlas:decision.2026-01-01-core',
      to: 'business:schema.contributor-trusts',
      kind: 'related_specs',
    });
    expect(edgesOf(c, 'spec_links')).toEqual([
      { from: 'anatomy:src/schema/validate.ts', to: 'spec:schema.validator', kind: 'spec_links' },
    ]);
    expect(edgesOf(c, 'covers')).toEqual([
      { from: 'anatomy:tests/scenario/specs/first-run.md', to: 'business:schema.contributor-trusts', kind: 'covers' },
    ]);
    expect(edgesOf(c, 'compass_rules')).toEqual([
      { from: 'atlas:decision.2026-01-01-core', to: 'rule:R-001', kind: 'compass_rules' },
    ]);
    expect(edgesOf(c, 'supersedes')).toEqual([
      { from: 'atlas:decision.2026-01-01-core', to: 'atlas:decision.2025-12-01-old', kind: 'supersedes' },
    ]);
    expect(edgesOf(c, 'sources')).toEqual([
      { from: 'atlas:decision.2026-01-01-core', to: 'atlas:source.brief', kind: 'sources' },
    ]);
  });

  it('the symmetric implements/implemented_by pair dedupes to ONE implements edge', async () => {
    const root = tmp('dedup');
    fullFixture(root);
    const c = await compile(root);
    const pair = c.edges.filter(
      (e) => e.from === 'spec:schema.validator' && e.to === 'business:schema.contributor-trusts',
    );
    expect(pair).toEqual([
      { from: 'spec:schema.validator', to: 'business:schema.contributor-trusts', kind: 'implements' },
    ]);
  });

  it('governs globs expand to one edge per matched anatomy node, for rules AND dev specs', async () => {
    const root = tmp('governs');
    fullFixture(root);
    const c = await compile(root);
    const ruleGoverns = edgesOf(c, 'governs').filter((e) => e.from === 'rule:R-001');
    expect(ruleGoverns.map((e) => e.to).sort()).toEqual([
      'anatomy:src/schema/types.ts',
      'anatomy:src/schema/validate.ts',
    ]);
    const specGoverns = edgesOf(c, 'governs').filter((e) => e.from === 'spec:schema.validator');
    expect(specGoverns.map((e) => e.to).sort()).toEqual([
      'anatomy:src/schema/types.ts',
      'anatomy:src/schema/validate.ts',
    ]);
  });

  it('never emits import/export edges (design §12.7)', async () => {
    const root = tmp('imports');
    fullFixture(root);
    fs.writeFileSync(
      path.join(root, '.cortex', 'anatomy', 'graph.json'),
      JSON.stringify({
        nodes: ['src/schema/validate.ts', 'src/schema/types.ts'],
        edges: [
          { from: 'src/schema/validate.ts', to: 'src/schema/types.ts', kind: 'import' },
          { from: 'src/cli/init.ts', to: 'src/schema/validate.ts', kind: 'import' },
          { from: 'src/schema/types.ts', to: 'src/cli/init.ts', kind: 'export' },
        ],
      }),
    );
    const c = await compile(root);
    expect(c.edges.filter((e) => e.kind === 'import' || e.kind === 'export')).toEqual([]);
  });
});

describe('dangling refs dropped and counted (Rule 6)', () => {
  it('unresolvable targets produce no edge and increment counters.droppedRefs per reference', async () => {
    const root = tmp('dangling');
    makeCortexProject(root);
    writeFilesMd(root, [filesRow('src/a.ts', 10, 'no.such-spec')]);
    writeRule(
      root,
      'R-001-r.md',
      `id: R-001\ntitle: R\nsource:\n  - ../../atlas/decisions/deleted.md\ngoverns:\n  - "src/**"`,
    );
    const c = await compile(root);
    expect(c.counters.droppedRefs).toBe(2); // dead source path + unresolvable spec_links id
    const nodeIds = new Set(c.nodes.map((n) => n.id));
    for (const e of c.edges) {
      expect(nodeIds.has(e.from)).toBe(true);
      expect(nodeIds.has(e.to)).toBe(true);
    }
    // the governs edge to the real anatomy node survives
    expect(c.edges).toContainEqual({ from: 'rule:R-001', to: 'anatomy:src/a.ts', kind: 'governs' });
  });

  it('a covers edge whose scenario file is not an anatomy node is dropped and counted', async () => {
    const root = tmp('covers-drop');
    makeCortexProject(root);
    writeFilesMd(root, [filesRow('src/a.ts', 10)]); // scenario file NOT scanned
    writeBizSpec(root, 'schema/outcome.business.md', `id: schema.outcome\nstatus: draft\nimplemented_by: []`);
    writeScenarioSpec(root, 'lonely', ['schema.outcome']);
    const c = await compile(root);
    expect(c.edges.filter((e) => e.kind === 'covers')).toEqual([]);
    expect(c.counters.droppedRefs).toBe(1);
  });
});

describe('counters (Rule 8)', () => {
  it('per-module node counts plus edges and droppedRefs', async () => {
    const root = tmp('counters');
    fullFixture(root);
    const c = await compile(root);
    expect(c.counters).toEqual({
      anatomy: 4, // 6 rows minus 2 scaffolding files
      compass: 4, // 1 rule + 1 bug + 2 core files
      atlas: 3,
      specs: 4, // 2 dev + 2 business
      edges: c.edges.length,
      droppedRefs: 0,
    });
    expect(c.nodes).toHaveLength(4 + 4 + 3 + 4);
  });
});

describe('determinism (Rule 7)', () => {
  it('two compilations of identical input are byte-identical after removing the generated line', async () => {
    const root = tmp('determinism');
    fullFixture(root);
    await compile(root);
    const first = fs.readFileSync(constellationPath(root), 'utf-8');
    await new Promise((r) => setTimeout(r, 5));
    await compile(root);
    const second = fs.readFileSync(constellationPath(root), 'utf-8');
    expect(withoutGeneratedLine(second)).toBe(withoutGeneratedLine(first));
  });

  it('nodes and edges are emitted in stable sorted order', async () => {
    const root = tmp('sorted');
    fullFixture(root);
    const c = await compile(root);
    const ids = c.nodes.map((n) => n.id);
    expect(ids).toEqual([...ids].sort());
    const keys = c.edges.map((e) => `${e.from} ${e.to} ${e.kind}`);
    expect(keys).toEqual([...keys].sort());
  });
});

describe('missing surfaces are tolerated (Rule 9)', () => {
  it('a bare directory with no .cortex/ compiles to four empty groups with schemaVersion fallback', async () => {
    const root = tmp('bare');
    const c = await compile(root);
    expect(c.schemaVersion).toBe('1.0');
    expect(c.groups.map((g) => g.id)).toEqual(['anatomy', 'atlas', 'compass', 'specs']);
    for (const g of c.groups) expect(g.children).toEqual([]);
    expect(c.nodes).toEqual([]);
    expect(c.edges).toEqual([]);
    expect(c.counters).toEqual({ anatomy: 0, compass: 0, atlas: 0, specs: 0, edges: 0, droppedRefs: 0 });
    expect(fs.existsSync(constellationPath(root))).toBe(true);
  });

  it('anatomy without layers.md groups every file under (unassigned)', async () => {
    const root = tmp('nolayers');
    makeCortexProject(root);
    writeFilesMd(root, [filesRow('src/a.ts', 10)]);
    const c = await compile(root);
    expect(c.groups.find((g) => g.id === 'anatomy')?.children).toEqual([
      { id: 'anatomy:layer:(unassigned)', label: '(unassigned)' },
    ]);
    expect(node(c, 'anatomy:src/a.ts')?.group).toBe('anatomy:layer:(unassigned)');
  });
});
