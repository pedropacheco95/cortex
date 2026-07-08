/**
 * Atomic tests for insight.l1-structural (build-order-v3 step 5a):
 * import graph, centrality with mechanical-hub exclusion, skip/sensitive
 * triage, gitignore/config exclusion, determinism, and a smoke run on this
 * repo. Fixtures are built in os.tmpdir (not tests/fixtures/valid).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { runL1, serializeL1 } from '../../../src/insight/l1.js';

const TEST_TIMEOUT = 60_000;

let seq = 0;
function makeTmp(label: string): string {
  const dir = path.join(os.tmpdir(), `cortex-l1-${label}-${process.pid}-${seq++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanTmp(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function write(root: string, rel: string, content: string | Buffer): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

// ---------------------------------------------------------------------------
// Import graph on a small fixture
// ---------------------------------------------------------------------------
describe('L1 import graph', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmp('graph');
    write(root, 'src/a.ts', "import { b } from './b';\nimport { c } from './c';\nexport const a = 1;\n");
    write(root, 'src/b.ts', "import { c } from './c';\nexport const b = 2;\n");
    write(root, 'src/c.ts', 'export const c = 3;\n');
    write(root, 'src/index.ts', "export { a } from './a';\nexport { b } from './b';\n");
  });
  afterAll(() => cleanTmp(root));

  it('produces importer->imported edges resolved to repo-relative paths', async () => {
    const out = await runL1(root);
    expect(out.graph.edges).toEqual([
      { from: 'src/a.ts', to: 'src/b.ts' },
      { from: 'src/a.ts', to: 'src/c.ts' },
      { from: 'src/b.ts', to: 'src/c.ts' },
      { from: 'src/index.ts', to: 'src/a.ts' },
      { from: 'src/index.ts', to: 'src/b.ts' },
    ]);
  }, TEST_TIMEOUT);

  it('records per-file exports, resolved imports, sizes, and module structure', async () => {
    const out = await runL1(root);
    const a = out.files.find((f) => f.path === 'src/a.ts');
    expect(a).toBeDefined();
    expect(a?.exports).toEqual(['a']);
    expect(a?.resolvedImports).toEqual(['src/b.ts', 'src/c.ts']);
    expect(a?.language).toBe('typescript');
    expect(a?.bytes).toBeGreaterThan(0);
    expect(a?.lines).toBeGreaterThan(1);

    const srcModule = out.modules.find((m) => m.dir === 'src');
    expect(srcModule?.fileCount).toBe(4);
    expect(srcModule?.files).toContain('src/c.ts');
  }, TEST_TIMEOUT);

  it('resolves NodeNext ./x.js specs to ./x.ts sources', async () => {
    const nn = makeTmp('nodenext');
    try {
      write(nn, 'src/user.ts', "import { db } from './db.js';\nexport const user = db;\n");
      write(nn, 'src/db.ts', 'export const db = 1;\n');
      const out = await runL1(nn);
      expect(out.graph.edges).toEqual([{ from: 'src/user.ts', to: 'src/db.ts' }]);
    } finally {
      cleanTmp(nn);
    }
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Centrality + mechanical-hub exclusion
// ---------------------------------------------------------------------------
describe('L1 centrality', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmp('centrality');
    write(root, 'src/core.ts', 'export const core = 1;\n');
    write(root, 'src/a.ts', "import { core } from './core';\nexport const a = core;\n");
    write(root, 'src/b.ts', "import { core } from './core';\nexport const b = core;\n");
    write(root, 'src/c.ts', "import { core } from './core';\nexport const c = core;\n");
    // Barrel index — imports everything, mechanically hub-shaped.
    write(root, 'src/index.ts', "export { a } from './a';\nexport { b } from './b';\nexport { c } from './c';\nexport { core } from './core';\n");
    // Non-index-named majority-re-export barrel.
    write(root, 'src/api.ts', "export { a } from './a';\nexport { b } from './b';\n");
    write(root, 'README.md', '# fixture\n');
  });
  afterAll(() => cleanTmp(root));

  it('ranks the imported-by-many file top', async () => {
    const out = await runL1(root);
    // in-degree 4: imported by a, b, c and re-exported by the index barrel
    // (hub files are excluded from the ranking, but their edges still count).
    expect(out.centrality[0]?.path).toBe('src/core.ts');
    expect(out.centrality[0]?.inDegree).toBe(4);
  }, TEST_TIMEOUT);

  it('excludes mechanical hubs (index barrel, named barrel, README) from centrality but keeps them in the file list', async () => {
    const out = await runL1(root);
    const centralityPaths = out.centrality.map((c) => c.path);
    expect(centralityPaths).not.toContain('src/index.ts');
    expect(centralityPaths).not.toContain('src/api.ts');
    expect(centralityPaths).not.toContain('README.md');

    const filePaths = out.files.map((f) => f.path);
    expect(filePaths).toContain('src/index.ts');
    expect(filePaths).toContain('src/api.ts');
    expect(filePaths).toContain('README.md');
    expect(out.files.find((f) => f.path === 'src/index.ts')?.mechanicalHub).toBe(true);
    expect(out.files.find((f) => f.path === 'src/api.ts')?.mechanicalHub).toBe(true);
    expect(out.files.find((f) => f.path === 'src/core.ts')?.mechanicalHub).toBe(false);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Skip / sensitive / binary / oversized / ignored triage
// ---------------------------------------------------------------------------
describe('L1 triage', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmp('triage');
    write(root, 'src/a.ts', 'export const a = 1;\n');
    write(root, 'node_modules/pkg/index.js', 'module.exports = 1;\n');
    write(root, 'pnpm-lock.yaml', 'lockfileVersion: 9\n');
    write(root, '.env', 'SECRET=1\n');
    write(root, 'assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]));
    write(root, 'data/blob.dat2', Buffer.from([0x00, 0x01, 0x02])); // NUL content, unknown ext
    write(root, 'big/huge.txt', 'x'.repeat(500));
    write(root, '.gitignore', 'generated/\n');
    write(root, 'generated/gen.ts', 'export const gen = 1;\n');
    // config exclude via anatomy.exclude (reused ignore machinery)
    write(
      root,
      '.cortex/cortex.config.json',
      JSON.stringify({ schemaVersion: '3.0', anatomy: { exclude: ['**/*.gen.ts'] } }),
    );
    write(root, 'src/types.gen.ts', 'export type G = 1;\n');
  });
  afterAll(() => cleanTmp(root));

  it('excludes skip-list, sensitive, binary, oversized, and ignored paths from the file list with reasons', async () => {
    const out = await runL1(root, { maxFileBytes: 400 });
    const filePaths = out.files.map((f) => f.path);
    expect(filePaths).toEqual(['.gitignore', 'src/a.ts']);

    const byPath = new Map(out.skipped.map((s) => [s.path, s.reason]));
    expect(byPath.get('node_modules/')).toBe('skip-list');
    expect(byPath.get('pnpm-lock.yaml')).toBe('skip-list');
    expect(byPath.get('.env')).toBe('sensitive');
    expect(byPath.get('assets/logo.png')).toBe('binary'); // by extension
    expect(byPath.get('data/blob.dat2')).toBe('binary'); // by NUL-byte content
    expect(byPath.get('big/huge.txt')).toBe('oversized');
    expect(byPath.get('generated/')).toBe('ignored'); // .gitignore
    expect(byPath.get('src/types.gen.ts')).toBe('ignored'); // config anatomy.exclude
    // .cortex is never indexed (own output)
    expect(byPath.get('.cortex/')).toBe('skip-list');
  }, TEST_TIMEOUT);

  it('lists skipped paths in sorted total order', async () => {
    const out = await runL1(root, { maxFileBytes: 400 });
    const paths = out.skipped.map((s) => s.path);
    expect(paths).toEqual([...paths].sort());
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------
describe('L1 entry points', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmp('entry');
    write(root, 'package.json', JSON.stringify({ name: 'fx', bin: { fx: 'dist/cli/run.js' }, main: 'src/lib.ts' }));
    write(root, 'src/cli/run.ts', 'export const run = 1;\n');
    write(root, 'src/lib.ts', 'export const lib = 1;\n');
    write(root, 'src/main.ts', 'export const m = 1;\n');
    write(root, 'src/other.ts', 'export const o = 1;\n');
  });
  afterAll(() => cleanTmp(root));

  it('flags package.json bin/main (dist->src mapped) and well-known names', async () => {
    const out = await runL1(root);
    const flag = (p: string) => out.files.find((f) => f.path === p)?.entryPoint;
    expect(flag('src/cli/run.ts')).toBe(true); // bin dist/cli/run.js -> src/cli/run.ts
    expect(flag('src/lib.ts')).toBe(true); // main
    expect(flag('src/main.ts')).toBe(true); // name heuristic
    expect(flag('src/other.ts')).toBe(false);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------
describe('L1 determinism', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmp('determinism');
    write(root, 'src/a.ts', "import { b } from './b';\nexport const a = 1;\n");
    write(root, 'src/b.ts', 'export const b = 2;\n');
    write(root, 'src/index.ts', "export * from './a';\n");
    write(root, 'README.md', '# d\n');
    write(root, 'notes.py', '"""Doc."""\nimport os\n');
  });
  afterAll(() => cleanTmp(root));

  it('two runs on unchanged input serialize byte-identically, with no timestamps', async () => {
    const first = serializeL1(await runL1(root));
    const second = serializeL1(await runL1(root));
    expect(second).toBe(first);
    // No ISO timestamps anywhere in the output.
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    // The absolute root must not leak into the serialized form.
    expect(first).not.toContain(root);
  }, TEST_TIMEOUT);

  it('serialized arrays are path-sorted', async () => {
    const out = await runL1(root);
    const filePaths = out.files.map((f) => f.path);
    expect(filePaths).toEqual([...filePaths].sort());
    const edgeKeys = out.graph.edges.map((e) => `${e.from} ${e.to}`);
    expect(edgeKeys).toEqual([...edgeKeys].sort());
    const moduleDirs = out.modules.map((m) => m.dir);
    expect(moduleDirs).toEqual([...moduleDirs].sort());
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Smoke: run L1 against this repo
// ---------------------------------------------------------------------------
describe('L1 smoke on this repo', () => {
  const repoRoot = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));

  it(
    'completes, produces >0 files and >0 edges, sorted output, no skip-listed paths included',
    async () => {
      const out = await runL1(repoRoot);
      expect(out.files.length).toBeGreaterThan(0);
      // NodeNext repo: the import graph and centrality ranking must be non-empty.
      expect(out.graph.edges.length).toBeGreaterThan(0);
      expect(out.centrality.length).toBeGreaterThan(0);

      const filePaths = out.files.map((f) => f.path);
      expect(filePaths).toEqual([...filePaths].sort());
      expect(filePaths.some((p) => p.startsWith('node_modules/'))).toBe(false);
      expect(filePaths.some((p) => p.split('/').includes('.git'))).toBe(false);
      expect(filePaths).toContain('src/insight/l1.ts');

      // Every edge endpoint is an included file.
      const set = new Set(filePaths);
      for (const e of out.graph.edges) {
        expect(set.has(e.from)).toBe(true);
        expect(set.has(e.to)).toBe(true);
      }

      // Mechanical hubs never appear in the centrality ranking.
      const hubs = new Set(out.files.filter((f) => f.mechanicalHub).map((f) => f.path));
      expect(out.centrality.some((c) => hubs.has(c.path))).toBe(false);

      // Serialization is stable JSON.
      const serialized = serializeL1(out);
      expect(JSON.parse(serialized).fileCount).toBe(out.files.length);
    },
    120_000,
  );
});
