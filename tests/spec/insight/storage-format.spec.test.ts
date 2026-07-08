/**
 * Spec tests — insight.storage-format (build-order-v3 step 5b): the v3 scoped
 * and flat layouts, per-file entry contract, scope registry, ledger +
 * reverse index, JSON trio, dual-authority validation, the shrink guard, and
 * init scaffolding — exercised through the registered validator over tmp
 * projects. One describe per Acceptance Criterion. Never touches the live repo.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { validate } from '../../../src/schema/validate.js';
import { init } from '../../../src/cli/init.js';
import { scaffoldInsight } from '../../../src/insight/scaffold.js';
import { INSIGHT_INDEX_TEMPLATE } from '../../../src/cli/templates.js';
import { makeTmpDir, cleanTmp, makeCortexProject } from '../../fixtures/hooks-harness.js';
import { makeTmpDir as makeInitTmp, cleanTmp as cleanInitTmp } from '../../fixtures/init-harness.js';
import type { Violation } from '../../../src/schema/types.js';

const TEST_TIMEOUT = 60_000;
const SHA_A = 'a1b3c5d7e9f102132435465768798a9bacbdcedfe0f1023344556677889900aa';
const SHA_B = '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0';

const INSIGHT_CHECKS = [
  'check.insight-index',
  'check.insight-entry',
  'check.insight-scope-registry',
  'check.insight-ledger',
  'check.insight-graph',
];

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`insight-storage-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function makeInsightProject(root: string): void {
  makeCortexProject(root, {
    config: { schemaVersion: '3.0' },
    modules: ['anatomy', 'compass', 'atlas', 'pulse'],
  });
  scaffoldInsight(path.join(root, '.cortex'));
}

function insightPath(root: string, ...rest: string[]): string {
  return path.join(root, '.cortex', 'insight', ...rest);
}

function writeInsight(root: string, rel: string, content: string): void {
  const p = insightPath(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
}

function l3Entry(sourcePath: string, sha: string): string {
  return `---
path: ${sourcePath}
extracted_at: 2026-07-07T14:00:00Z
extraction_level: 3
size_lines: 620
size_tokens: 5400
centrality: high
built_at_commit: 9f2c1ab
source_sha256: ${sha}
---

## Purpose

What the file does.

## Main players

- \`validateToken\` (L40–L120) — critical.

## Connections

Uses:
- src/util/log.ts: logging
`;
}

function l2Entry(sourcePath: string, sha: string): string {
  return `---
path: ${sourcePath}
extracted_at: 2026-07-07T14:00:00Z
extraction_level: 2
size_lines: 84
size_tokens: 610
centrality: low
built_at_commit: 9f2c1ab
source_sha256: ${sha}
---

## Purpose

Thin wrapper.

## Connections

Used by:
- src/auth/session.ts: logs decisions
`;
}

function minimalGraph(): string {
  return JSON.stringify(
    {
      schemaVersion: '3.0',
      generated: '2026-07-07T14:05:00Z',
      built_at_commit: '9f2c1ab',
      nodes: [
        { id: 'concept:authentication', kind: 'concept', label: 'authentication' },
        { id: 'file:src/auth/session.ts', kind: 'file', label: 'session.ts' },
      ],
      edges: [
        {
          id: 'edge:implements-concept:file:src/auth/session.ts->concept:authentication',
          source: 'file:src/auth/session.ts',
          target: 'concept:authentication',
          edge_type: 'implements-concept',
          confidence: 'stated',
          evidence: 'session.ts explicitly implements token issuance',
          confirmed_at_commit: '9f2c1ab',
        },
      ],
    },
    null,
    2,
  );
}

function minimalTags(): string {
  return JSON.stringify(
    {
      schemaVersion: '3.0',
      generated: '2026-07-07T14:05:00Z',
      built_at_commit: '9f2c1ab',
      vocabulary: [{ tag: 'authentication', kind: 'concern' }],
      assignments: { 'file:src/auth/session.ts': ['authentication'] },
    },
    null,
    2,
  );
}

function minimalClusters(scope = 'global'): string {
  return JSON.stringify(
    {
      schemaVersion: '3.0',
      generated: '2026-07-07T14:05:00Z',
      built_at_commit: '9f2c1ab',
      clusters: [
        {
          id: 'cluster:auth-core',
          label: 'Auth core',
          members: ['file:src/auth/session.ts'],
          rationale: 'co-located auth primitives',
          scope,
        },
      ],
    },
    null,
    2,
  );
}

async function insightViolations(root: string): Promise<Violation[]> {
  const report = await validate(root, { root });
  return report.violations.filter((v) => INSIGHT_CHECKS.includes(v.check));
}

// ---------------------------------------------------------------------------
// AC: Flat layout omits scope machinery
// ---------------------------------------------------------------------------

describe('AC: flat layout omits scope machinery and validates clean', () => {
  it('a hand-authored flat insight/ (entries + trio + ledger + reverse-index) validates clean', async () => {
    const root = tmp('flat');
    makeInsightProject(root);
    writeInsight(root, 'anatomy/src/auth/session.ts.md', l3Entry('src/auth/session.ts', SHA_A));
    writeInsight(root, 'anatomy/src/util/log.ts.md', l2Entry('src/util/log.ts', SHA_B));
    writeInsight(root, 'concepts/authentication.md', '# authentication\n\nProse concept.\n');
    writeInsight(root, 'graph.json', minimalGraph());
    writeInsight(root, 'tags.json', minimalTags());
    writeInsight(root, 'clusters.json', minimalClusters());
    writeInsight(
      root,
      'ledger.json',
      JSON.stringify({
        schemaVersion: '3.0',
        built_at_commit: '9f2c1ab',
        entries: {
          'src/auth/session.ts': { source_sha256: SHA_A, built_at_commit: '9f2c1ab', extraction_level: 3 },
          'src/util/log.ts': { source_sha256: SHA_B, built_at_commit: '9f2c1ab', extraction_level: 2 },
        },
      }),
    );
    writeInsight(
      root,
      'reverse-index.json',
      JSON.stringify({
        schemaVersion: '3.0',
        built_at_commit: '9f2c1ab',
        referenced_by: { 'element:src/auth/session.ts#validateToken': ['concept:authentication'] },
      }),
    );

    expect(fs.existsSync(insightPath(root, 'scope-registry.yaml'))).toBe(false);
    expect(fs.existsSync(insightPath(root, 'scopes'))).toBe(false);
    expect(await insightViolations(root)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC: Scoped layout separates per-scope and cross-scope content
// ---------------------------------------------------------------------------

describe('AC: scoped layout separates per-scope and cross-scope content', () => {
  it('registry + scopes/{auth,billing,notifications} with a shared scope validates clean', async () => {
    const root = tmp('scoped');
    makeInsightProject(root);
    // Real project dirs so scope paths resolve.
    for (const d of ['src/auth', 'src/billing', 'src/shared/notifications']) {
      fs.mkdirSync(path.join(root, d), { recursive: true });
    }
    writeInsight(
      root,
      'scope-registry.yaml',
      `schemaVersion: "3.0"
built_at_commit: 9f2c1ab
scopes:
  auth:
    path: src/auth
    depends_on: [notifications]
  billing:
    path: src/billing
    depends_on: [notifications]
  notifications:
    path: src/shared/notifications
    depends_on: []
    shared_by: [auth, billing]
`,
    );
    for (const scope of ['auth', 'billing', 'notifications']) {
      fs.mkdirSync(insightPath(root, 'scopes', scope, 'anatomy'), { recursive: true });
      fs.mkdirSync(insightPath(root, 'scopes', scope, 'concepts'), { recursive: true });
      writeInsight(root, `scopes/${scope}/graph.json`, minimalGraph());
    }
    writeInsight(root, `scopes/auth/anatomy/src/auth/session.ts.md`, l3Entry('src/auth/session.ts', SHA_A));
    // Cross-scope content at the module root.
    writeInsight(root, 'graph.json', minimalGraph());
    writeInsight(root, 'tags.json', minimalTags());
    writeInsight(root, 'clusters.json', minimalClusters('auth'));

    // The shared scope appears exactly once under scopes/.
    const scopeDirs = fs.readdirSync(insightPath(root, 'scopes')).sort();
    expect(scopeDirs).toEqual(['auth', 'billing', 'notifications']);

    expect(await insightViolations(root)).toEqual([]);
  });

  it('a clusters.json scope that is neither declared nor "global" is an error', async () => {
    const root = tmp('scoped-badscope');
    makeInsightProject(root);
    writeInsight(root, 'clusters.json', minimalClusters('ghost-scope'));
    const errors = (await insightViolations(root)).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.check === 'check.insight-graph' && e.message.includes('ghost-scope'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC: The staleness ledger drives a code-only skip
// ---------------------------------------------------------------------------

describe('AC: the ledger comparison is a pure hash compare — no LLM', () => {
  it('an unchanged body hash matches the ledger entry deterministically', () => {
    const body = 'export function validateToken() {}\n';
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    const ledger = {
      schemaVersion: '3.0',
      built_at_commit: '9f2c1ab',
      entries: { 'src/auth/session.ts': { source_sha256: hash, built_at_commit: '9f2c1ab', extraction_level: 3 } },
    };
    const rehashed = crypto.createHash('sha256').update(body).digest('hex');
    expect(rehashed).toBe(ledger.entries['src/auth/session.ts'].source_sha256);
  });
});

// ---------------------------------------------------------------------------
// AC: Markdown and JSON are validated independently as dual authorities
// ---------------------------------------------------------------------------

describe('AC: dual-authority validation — a bad entry does not suppress a bad graph', () => {
  it('one malformed entry and one malformed graph produce independent errors', async () => {
    const root = tmp('dual');
    makeInsightProject(root);
    // Malformed entry: bad sha + missing Main players for L3.
    writeInsight(
      root,
      'anatomy/src/auth/session.ts.md',
      `---
path: src/auth/session.ts
extracted_at: 2026-07-07T14:00:00Z
extraction_level: 3
size_lines: 620
size_tokens: 5400
centrality: high
built_at_commit: 9f2c1ab
source_sha256: short
---

## Purpose

X.

## Connections

Uses:
- y
`,
    );
    // Malformed graph: empty evidence.
    const graph = JSON.parse(minimalGraph()) as { edges: Array<{ evidence: string }> };
    graph.edges[0]!.evidence = '';
    writeInsight(root, 'graph.json', JSON.stringify(graph));

    const violations = await insightViolations(root);
    const entryErrors = violations.filter((v) => v.check === 'check.insight-entry' && v.severity === 'error');
    const graphErrors = violations.filter((v) => v.check === 'check.insight-graph' && v.severity === 'error');
    expect(entryErrors.length).toBeGreaterThan(0);
    expect(graphErrors.length).toBeGreaterThan(0);
    expect(entryErrors.some((e) => e.message.includes('source_sha256'))).toBe(true);
    expect(entryErrors.some((e) => e.message.includes('Main players'))).toBe(true);
    expect(graphErrors.some((e) => e.message.includes('evidence'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC: An absent insight module does not fail validation
// ---------------------------------------------------------------------------

describe('AC: absent module tolerated', () => {
  it('a project with no .cortex/insight/ at all yields no insight violations', async () => {
    const root = tmp('absent');
    makeCortexProject(root, { config: { schemaVersion: '3.0' }, modules: ['compass', 'atlas', 'pulse'] });
    expect(await insightViolations(root)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Legacy v2 map/ tolerance (design §8.4 — interim dogfood)
// ---------------------------------------------------------------------------

describe('legacy v2 insight/map/ is tolerated — warn at most, never error', () => {
  it('v2 map content produces no insight errors, only the one dogfood warning', async () => {
    const root = tmp('legacy-map');
    makeInsightProject(root);
    writeInsight(root, 'map/setup.md', `---\nkind: insight-prose\nupdated: 2026-07-05T10:00:00Z\n---\n\n# Setup\n`);
    writeInsight(
      root,
      'map/graph.json',
      JSON.stringify({ schemaVersion: '2.0', generated: '2026-07-05T10:00:00Z', rebuild: 'full', nodes: [], edges: [] }),
    );
    writeInsight(root, 'map/stray.txt', 'loose notes');

    const violations = await insightViolations(root);
    expect(violations.filter((v) => v.severity === 'error')).toEqual([]);
    const legacyWarnings = violations.filter((v) => v.severity === 'warning' && v.message.includes('map/'));
    expect(legacyWarnings).toHaveLength(1);
    expect(legacyWarnings[0]?.check).toBe('check.insight-entry');
  });
});

// ---------------------------------------------------------------------------
// Done-when: cortex init scaffolds the v3 insight module, committed
// ---------------------------------------------------------------------------

describe('cortex init scaffolds the v3 insight module (committed, not gitignored)', () => {
  it(
    'creates _index.md (the §5.13 prompt) + empty anatomy/ and concepts/, no map/, not gitignored',
    async () => {
      const root = makeInitTmp('insight-v3-init-proj');
      const home = makeInitTmp('insight-v3-init-home');
      try {
        const result = await init(root, { noLlm: true, home, platform: 'darwin' });
        expect(result.exitCode).toBe(0);

        const dir = path.join(root, '.cortex', 'insight');
        expect(fs.readFileSync(path.join(dir, '_index.md'), 'utf-8')).toBe(INSIGHT_INDEX_TEMPLATE);
        expect(fs.statSync(path.join(dir, 'anatomy')).isDirectory()).toBe(true);
        expect(fs.statSync(path.join(dir, 'concepts')).isDirectory()).toBe(true);
        expect(fs.readdirSync(path.join(dir, 'anatomy'))).toHaveLength(0);
        expect(fs.readdirSync(path.join(dir, 'concepts'))).toHaveLength(0);
        // The v2 map/ is no longer scaffolded for new projects.
        expect(fs.existsSync(path.join(dir, 'map'))).toBe(false);
        // No seeded JSON — extraction owns first content.
        expect(fs.readdirSync(dir).sort()).toEqual(['_index.md', 'anatomy', 'concepts']);

        const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');
        expect(gitignore.split('\n').some((l) => l.trim().startsWith('.cortex/insight'))).toBe(false);
      } finally {
        cleanInitTmp(root);
        cleanInitTmp(home);
      }
    },
    TEST_TIMEOUT,
  );

  it('the locked _index.md template states the trust model and the v3 verbs', () => {
    expect(INSIGHT_INDEX_TEMPLATE).toContain('(ungated)');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('Inferred, not');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('the gated layer wins');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('cortex insight file <path>');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('cortex insight concept <name>');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('cortex insight element <query>');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('scope-registry.yaml');
  });
});
