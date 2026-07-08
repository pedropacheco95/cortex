/**
 * Spec tests for insight.cli — the four `cortex insight` query commands
 * (query / get / neighbors / list). One describe per Acceptance Criterion in
 * .specflow/specs/insight/cli.spec.md (§4.10.5). Runs against a hand-authored
 * `map/` fixture in a fresh tmp dir, never the live repo. Deterministic Core
 * (R-001): the CLI reads only `insight/map/` and writes nothing. Every test
 * executes under `pnpm test`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { insightCli } from '../../../src/insight/cli.js';

let counter = 0;
function makeTmpRoot(label: string): string {
  const dir = path.join(os.tmpdir(), `cortex-insight-cli-${label}-${Date.now()}-${counter++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// --- The hand-authored map/ fixture (§4.10.5 ACs) ---------------------------

const SETUP_MD = `---
kind: insight-prose
updated: 2026-07-05T10:00:00Z
topic: setup
---

## Authentication

The service authenticates callers with a signed session token issued at login.

## Deployment

Ship with \`pnpm build\` then upload the bundle.
`;

const TESTING_MD = `---
kind: insight-prose
updated: 2026-07-05T10:00:00Z
topic: testing
---

## Coverage

Every acceptance criterion becomes a test case.
`;

const GRAPH = {
  schemaVersion: '2.0',
  generated: '2026-07-05T10:00:00Z',
  rebuild: 'full',
  nodes: [
    { id: 'anatomy:src/insight/query.ts', module: 'anatomy', label: 'insight query engine' },
    { id: 'spec:insight.cli', module: 'spec', label: 'insight cli' },
    { id: 'spec:insight.module-contract', module: 'spec', label: 'insight module contract' },
  ],
  edges: [
    {
      from: 'spec:insight.cli',
      to: 'anatomy:src/insight/query.ts',
      kind: 'semantically-related',
      confidence: 'high',
      rationale: 'the cli spec governs the query engine it dispatches to',
    },
    {
      from: 'anatomy:src/insight/query.ts',
      to: 'spec:insight.module-contract',
      kind: 'mentions-same-entity',
      confidence: 'medium',
      rationale: 'both reference the insight/map format guards',
    },
  ],
};

const TAGS = {
  schemaVersion: '2.0',
  generated: '2026-07-05T10:00:00Z',
  tags: { 'spec:insight.cli': ['authentication'] },
};

const CLUSTERS = {
  schemaVersion: '2.0',
  generated: '2026-07-05T10:00:00Z',
  clusters: [
    {
      id: 'cluster:authentication',
      label: 'Authentication',
      members: ['spec:insight.cli'],
      rationale: 'nodes about identity and sessions',
    },
    {
      id: 'cluster:pulse-gate',
      label: 'Pulse gate',
      members: ['spec:insight.cli'],
      rationale: 'nodes about the human review gate',
    },
  ],
};

const GRAPH_JSON = JSON.stringify(GRAPH, null, 2);

function buildFixture(label: string): string {
  const root = makeTmpRoot(label);
  const mapDir = path.join(root, '.cortex', 'insight', 'map');
  fs.mkdirSync(mapDir, { recursive: true });
  fs.writeFileSync(path.join(mapDir, 'setup.md'), SETUP_MD, 'utf-8');
  fs.writeFileSync(path.join(mapDir, 'testing.md'), TESTING_MD, 'utf-8');
  fs.writeFileSync(path.join(mapDir, 'graph.json'), GRAPH_JSON, 'utf-8');
  fs.writeFileSync(path.join(mapDir, 'tags.json'), JSON.stringify(TAGS, null, 2), 'utf-8');
  fs.writeFileSync(path.join(mapDir, 'clusters.json'), JSON.stringify(CLUSTERS, null, 2), 'utf-8');
  return root;
}

// --- stdout/stderr/exit capture --------------------------------------------

async function capture(fn: () => Promise<number>): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const origLog = console.log;
  const origErr = console.error;
  const origWrite = process.stdout.write.bind(process.stdout);
  console.log = (...a: unknown[]): void => {
    out += a.map((x) => String(x)).join(' ') + '\n';
  };
  console.error = (...a: unknown[]): void => {
    err += a.map((x) => String(x)).join(' ') + '\n';
  };
  // Verbatim `get` writes via process.stdout.write.
  (process.stdout as unknown as { write: (s: unknown) => boolean }).write = (s: unknown): boolean => {
    out += typeof s === 'string' ? s : String(s);
    return true;
  };
  try {
    const code = await fn();
    return { code, out, err };
  } finally {
    console.log = origLog;
    console.error = origErr;
    (process.stdout as unknown as { write: typeof origWrite }).write = origWrite;
  }
}

// ---------------------------------------------------------------------------

describe('AC: query returns grouped hits across both content types', () => {
  let root: string;
  beforeAll(() => {
    root = buildFixture('query-hit');
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('query authentication surfaces the setup.md ## Authentication section', async () => {
    const { code, out } = await capture(() => insightCli('query', ['authentication'], root));
    expect(code).toBe(0);
    expect(out).toContain('setup.md');
    expect(out).toContain('## Authentication');
  });

  it('query authentication surfaces spec:insight.cli by tag', async () => {
    const { out } = await capture(() => insightCli('query', ['authentication'], root));
    expect(out).toContain('spec:insight.cli');
  });

  it('query authentication surfaces cluster:authentication', async () => {
    const { out } = await capture(() => insightCli('query', ['authentication'], root));
    expect(out).toContain('cluster:authentication');
  });

  it('is case-insensitive (AUTHENTICATION matches)', async () => {
    const { code, out } = await capture(() => insightCli('query', ['AUTHENTICATION'], root));
    expect(code).toBe(0);
    expect(out).toContain('## Authentication');
  });
});

describe('AC: query miss is honest and exits 0', () => {
  let root: string;
  beforeAll(() => {
    root = buildFixture('query-miss');
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('query nonexistent-concept → empty grouped result, exit 0', async () => {
    const { code, out } = await capture(() => insightCli('query', ['nonexistent-concept'], root));
    expect(code).toBe(0);
    expect(out).not.toContain('setup.md');
    expect(out).not.toContain('spec:insight.cli');
    expect(out).not.toContain('cluster:authentication');
  });

  it('--json miss is a well-formed empty grouped object, exit 0', async () => {
    const { code, out } = await capture(() => insightCli('query', ['nonexistent-concept', '--json'], root));
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as { sections: unknown[]; nodes: unknown[]; clusters: unknown[] };
    expect(parsed.sections).toEqual([]);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.clusters).toEqual([]);
  });
});

describe('AC: get returns a file verbatim', () => {
  let root: string;
  beforeAll(() => {
    root = buildFixture('get');
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('get graph.json → stdout is the file bytes verbatim', async () => {
    const { code, out } = await capture(() => insightCli('get', ['graph.json'], root));
    expect(code).toBe(0);
    expect(out).toBe(GRAPH_JSON);
  });

  it('get missing.md → exit 1 naming the file', async () => {
    const { code, err } = await capture(() => insightCli('get', ['missing.md'], root));
    expect(code).toBe(1);
    expect(err).toContain('missing.md');
  });

  it('get ../escape → exit 1 (never escapes map/)', async () => {
    const { code, err } = await capture(() => insightCli('get', ['../_index.md'], root));
    expect(code).toBe(1);
    expect(err.length).toBeGreaterThan(0);
  });
});

describe('AC: neighbors walks by kind to a bounded depth', () => {
  let root: string;
  beforeAll(() => {
    root = buildFixture('neighbors');
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('--kind semantically-related --depth 1 reaches query.ts with confidence + rationale, not module-contract', async () => {
    const { code, out } = await capture(() =>
      insightCli('neighbors', ['spec:insight.cli', '--kind', 'semantically-related', '--depth', '1'], root),
    );
    expect(code).toBe(0);
    expect(out).toContain('anatomy:src/insight/query.ts');
    expect(out).toContain('high'); // confidence
    expect(out).toContain('the cli spec governs the query engine it dispatches to'); // rationale
    expect(out).not.toContain('spec:insight.module-contract');
  });

  it('--depth 2 without --kind reaches spec:insight.module-contract', async () => {
    const { code, out } = await capture(() =>
      insightCli('neighbors', ['spec:insight.cli', '--depth', '2'], root),
    );
    expect(code).toBe(0);
    expect(out).toContain('anatomy:src/insight/query.ts');
    expect(out).toContain('spec:insight.module-contract');
  });

  it('a node with no matching edges returns the node alone, exit 0', async () => {
    const { code, out } = await capture(() =>
      insightCli('neighbors', ['spec:insight.cli', '--kind', 'same-cluster'], root),
    );
    expect(code).toBe(0);
    expect(out).not.toContain('anatomy:src/insight/query.ts');
  });
});

describe('AC: neighbors on an unknown node errors', () => {
  let root: string;
  beforeAll(() => {
    root = buildFixture('neighbors-unknown');
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('neighbors spec:does-not-exist → exit 1 naming the node, no subgraph', async () => {
    const { code, err, out } = await capture(() => insightCli('neighbors', ['spec:does-not-exist'], root));
    expect(code).toBe(1);
    expect(err).toContain('spec:does-not-exist');
    expect(out).not.toContain('anatomy:src/insight/query.ts');
  });
});

describe('AC: list enumerates prose files and clusters', () => {
  let root: string;
  beforeAll(() => {
    root = buildFixture('list');
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('names setup.md, testing.md, cluster:authentication, cluster:pulse-gate', async () => {
    const { code, out } = await capture(() => insightCli('list', [], root));
    expect(code).toBe(0);
    expect(out).toContain('setup.md');
    expect(out).toContain('testing.md');
    expect(out).toContain('cluster:authentication');
    expect(out).toContain('cluster:pulse-gate');
  });
});

describe('AC: --json is deterministic', () => {
  let root: string;
  beforeAll(() => {
    root = buildFixture('json-stable');
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('query authentication --json twice → byte-identical', async () => {
    const a = await capture(() => insightCli('query', ['authentication', '--json'], root));
    const b = await capture(() => insightCli('query', ['authentication', '--json'], root));
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    expect(a.out).toBe(b.out);
  });

  it('neighbors --json twice → byte-identical', async () => {
    const a = await capture(() =>
      insightCli('neighbors', ['spec:insight.cli', '--depth', '2', '--json'], root),
    );
    const b = await capture(() =>
      insightCli('neighbors', ['spec:insight.cli', '--depth', '2', '--json'], root),
    );
    expect(a.out).toBe(b.out);
  });

  it('list --json twice → byte-identical', async () => {
    const a = await capture(() => insightCli('list', ['--json'], root));
    const b = await capture(() => insightCli('list', ['--json'], root));
    expect(a.out).toBe(b.out);
  });
});

describe('AC: malformed map/ artefact is exit 1', () => {
  let root: string;
  beforeAll(() => {
    root = buildFixture('malformed');
    // Corrupt graph.json into invalid JSON.
    fs.writeFileSync(path.join(root, '.cortex', 'insight', 'map', 'graph.json'), '{ not json', 'utf-8');
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('neighbors over a malformed graph.json → exit 1', async () => {
    const { code, err } = await capture(() => insightCli('neighbors', ['spec:insight.cli'], root));
    expect(code).toBe(1);
    expect(err.length).toBeGreaterThan(0);
  });
});

describe('AC: an empty map/ is an honest empty result (live-repo shape)', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmpRoot('empty-map');
    fs.mkdirSync(path.join(root, '.cortex', 'insight', 'map'), { recursive: true });
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('list over an empty map/ → exit 0, no crash', async () => {
    const { code } = await capture(() => insightCli('list', [], root));
    expect(code).toBe(0);
  });

  it('query over an empty map/ → exit 0, empty', async () => {
    const { code, out } = await capture(() => insightCli('query', ['anything', '--json'], root));
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as { sections: unknown[]; nodes: unknown[]; clusters: unknown[] };
    expect(parsed.sections).toEqual([]);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.clusters).toEqual([]);
  });
});
