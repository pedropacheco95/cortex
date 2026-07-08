/**
 * Spec tests for insight.module-contract (v2) — updated at build-order-v3 step
 * 5b to the v3 storage contract where the v2 expectations were superseded:
 * init now scaffolds the v3 flat layout (anatomy/ + concepts/, no map/) and
 * the locked §7.4 v3 _index.md. The v2 prose/JSON format-guard describes are
 * retained: they exercise the LEGACY formats module (src/insight/formats.ts)
 * that the interim v2 consumers (refresh/gaps/cli — design §8.4) still build
 * against until steps 5c/5e retire them. Runs against fresh tmp dirs, never
 * the live repo. Every test executes under `pnpm test`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { init } from '../../../src/cli/init.js';
import { CONFIG_DEFAULTS, INSIGHT_INDEX_TEMPLATE } from '../../../src/cli/templates.js';
import { scaffoldInsight } from '../../../src/insight/scaffold.js';
import {
  parseGraph,
  parseTags,
  parseClusters,
  parseProseFrontmatter,
  isProseFrontmatter,
  isEdgeKind,
  isConfidence,
  isClusterId,
  isNodeId,
  EDGE_KINDS,
  CONFIDENCE_LEVELS,
  type InsightGraph,
  type TagsFile,
  type ClustersFile,
} from '../../../src/insight/formats.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const };

// ---------------------------------------------------------------------------
// AC: Init scaffolds the module committed
// ---------------------------------------------------------------------------

describe('AC: init scaffolds the insight module committed', () => {
  let root: string;
  let home: string;
  beforeAll(async () => {
    root = makeTmpDir('insight-scaffold-proj');
    home = makeTmpDir('insight-scaffold-home');
    await init(root, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => {
    cleanTmp(root);
    cleanTmp(home);
  });

  it('creates insight/_index.md and the empty flat anatomy/ + concepts/ dirs (v3 — no map/)', () => {
    const insightDir = path.join(root, '.cortex', 'insight');
    expect(fs.existsSync(path.join(insightDir, '_index.md'))).toBe(true);
    for (const dir of ['anatomy', 'concepts']) {
      const p = path.join(insightDir, dir);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.statSync(p).isDirectory()).toBe(true);
      // Empty — no seeded entries, concepts, or JSON (extraction owns first content).
      expect(fs.readdirSync(p)).toHaveLength(0);
    }
    // The v2 map/ is no longer scaffolded for new projects.
    expect(fs.existsSync(path.join(insightDir, 'map'))).toBe(false);
  });

  it('anatomy/ and concepts/ carry no _index.md of their own', () => {
    expect(fs.existsSync(path.join(root, '.cortex', 'insight', 'anatomy', '_index.md'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.cortex', 'insight', 'concepts', '_index.md'))).toBe(false);
  });

  it('.gitignore does NOT list .cortex/insight/ (committed, not gitignored)', () => {
    const gitignore = path.join(root, '.gitignore');
    const lines = fs.existsSync(gitignore)
      ? fs.readFileSync(gitignore, 'utf-8').split('\n').map((l) => l.trim())
      : [];
    expect(lines).not.toContain('.cortex/insight/');
    expect(lines.some((l) => l.startsWith('.cortex/insight'))).toBe(false);
  });

  it('scaffoldInsight is idempotent — re-run preserves the existing _index.md', () => {
    const indexPath = path.join(root, '.cortex', 'insight', '_index.md');
    const before = fs.readFileSync(indexPath, 'utf-8');
    const result = scaffoldInsight(path.join(root, '.cortex'));
    expect(result.indexWritten).toBe(false);
    expect(fs.readFileSync(indexPath, 'utf-8')).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// AC: The index states the ungated trust model
// ---------------------------------------------------------------------------

describe('AC: insight/_index.md states the ungated trust model (v3 locked template, §7.4)', () => {
  it('names insight as ungated and inferred-not-curated', () => {
    expect(INSIGHT_INDEX_TEMPLATE.toLowerCase()).toContain('ungated');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('Inferred, not');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('the gated layer wins');
  });

  it('references the v3 cortex insight verbs as the query surface', () => {
    expect(INSIGHT_INDEX_TEMPLATE).toContain('cortex insight file <path>');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('cortex insight concept <name>');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('cortex insight element <query>');
  });

  it('describes the v3 layout — anatomy/ entries, concepts/, the JSON trio, scope registry', () => {
    expect(INSIGHT_INDEX_TEMPLATE).toContain('anatomy/');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('concepts/');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('graph.json / tags.json / clusters.json');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('scope-registry.yaml');
  });
});

// ---------------------------------------------------------------------------
// AC: The config carries the insight block with defaults
// ---------------------------------------------------------------------------

describe('AC: the config template carries the insight block', () => {
  it('has clusterCarryOverJaccard 0.5, promotionMinAgeDays 14, promotionMinObservations 2', () => {
    expect(CONFIG_DEFAULTS['insight']).toEqual({
      clusterCarryOverJaccard: 0.5,
      promotionMinAgeDays: 14,
      promotionMinObservations: 2,
    });
  });

  it('the emitted cortex.config.json includes the insight block', async () => {
    const root = makeTmpDir('insight-config-proj');
    const home = makeTmpDir('insight-config-home');
    try {
      await init(root, { noLlm: true, home, ...DARWIN });
      const config = JSON.parse(
        fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8'),
      ) as Record<string, unknown>;
      expect(config['insight']).toEqual({
        clusterCarryOverJaccard: 0.5,
        promotionMinAgeDays: 14,
        promotionMinObservations: 2,
      });
    } finally {
      cleanTmp(root);
      cleanTmp(home);
    }
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC: A well-formed prose file matches the contract
// ---------------------------------------------------------------------------

const WELL_FORMED_PROSE = `---
kind: insight-prose
updated: 2026-07-05T10:00:00Z
topic: setup
---

## Local setup

Install with \`pnpm install\`; build with \`pnpm build\`.
_(observed 2026-07-05, signal 2, sessions: sess-a1, sess-b2)_

## Corrections

- **2026-07-05** — _was:_ "uses npm" · _now:_ "uses pnpm" ·
  _why:_ user corrected the package manager · sessions: sess-a1
`;

describe('AC: a well-formed prose file matches the §4.10.1 contract', () => {
  it('passes the prose frontmatter guard', () => {
    const result = parseProseFrontmatter(WELL_FORMED_PROSE);
    expect(result.ok).toBe(true);
    expect(result.value?.kind).toBe('insight-prose');
    expect(Date.parse(String(result.value?.updated))).toBe(Date.parse('2026-07-05T10:00:00Z'));
    expect(result.value?.topic).toBe('setup');
    expect(isProseFrontmatter(WELL_FORMED_PROSE)).toBe(true);
  });

  it('rejects a .md frontmatter missing kind', () => {
    const bad = `---
updated: 2026-07-05T10:00:00Z
---

## Section
`;
    const result = parseProseFrontmatter(bad);
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('kind');
  });

  it('rejects prose with a missing/blank updated', () => {
    const bad = `---
kind: insight-prose
---

## Section
`;
    expect(parseProseFrontmatter(bad).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC: A well-formed JSON trio matches the contract
// ---------------------------------------------------------------------------

const GRAPH: InsightGraph = {
  schemaVersion: '2.0',
  generated: '2026-07-05T10:00:00Z',
  rebuild: 'full',
  nodes: [{ id: 'spec:insight.cli', module: 'spec', label: 'insight cli' }],
  edges: [
    {
      from: 'spec:insight.cli',
      to: 'spec:insight.cli',
      kind: 'semantically-related',
      confidence: 'high',
      rationale: 'both define the insight query surface',
    },
  ],
};

const TAGS: TagsFile = {
  schemaVersion: '2.0',
  generated: '2026-07-05T10:00:00Z',
  tags: { 'spec:insight.cli': ['insight', 'cli', 'query'] },
};

const CLUSTERS: ClustersFile = {
  schemaVersion: '2.0',
  generated: '2026-07-05T10:00:00Z',
  clusters: [
    {
      id: 'cluster:insight-layer',
      label: 'Insight layer',
      members: ['spec:insight.cli'],
      rationale: 'the ungated knowledge module',
    },
  ],
};

describe('AC: a well-formed JSON trio matches the §4.10.2 contract', () => {
  it('parseGraph accepts a well-formed graph (object and string form)', () => {
    expect(parseGraph(GRAPH).ok).toBe(true);
    expect(parseGraph(JSON.stringify(GRAPH)).ok).toBe(true);
  });

  it('parseTags accepts a well-formed tags file', () => {
    expect(parseTags(TAGS).ok).toBe(true);
  });

  it('parseClusters accepts a well-formed clusters file', () => {
    const result = parseClusters(CLUSTERS);
    expect(result.ok).toBe(true);
    expect(result.value?.clusters[0]?.id).toBe('cluster:insight-layer');
  });
});

// ---------------------------------------------------------------------------
// AC: the guards reject malformed content
// ---------------------------------------------------------------------------

describe('AC: guards reject malformed content', () => {
  it('rejects a bad edge kind', () => {
    const bad = { ...GRAPH, edges: [{ ...GRAPH.edges[0], kind: 'related-somehow' }] };
    const result = parseGraph(bad);
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('kind');
  });

  it('rejects an empty rationale', () => {
    const bad = { ...GRAPH, edges: [{ ...GRAPH.edges[0], rationale: '   ' }] };
    const result = parseGraph(bad);
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('rationale');
  });

  it('rejects a bad cluster id', () => {
    const bad = { ...CLUSTERS, clusters: [{ ...CLUSTERS.clusters[0], id: 'insight-layer' }] };
    const result = parseClusters(bad);
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('id');
  });

  it('primitive guards agree with their enums/patterns', () => {
    for (const k of EDGE_KINDS) expect(isEdgeKind(k)).toBe(true);
    for (const c of CONFIDENCE_LEVELS) expect(isConfidence(c)).toBe(true);
    expect(isEdgeKind('nope')).toBe(false);
    expect(isConfidence('maybe')).toBe(false);
    expect(isClusterId('cluster:auth')).toBe(true);
    expect(isClusterId('cluster:Auth')).toBe(false);
    expect(isClusterId('auth')).toBe(false);
    expect(isNodeId('spec:insight.cli')).toBe(true);
    expect(isNodeId('anatomy:src/insight/formats.ts')).toBe(true);
    expect(isNodeId('unknown:x')).toBe(false);
  });
});
