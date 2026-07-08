import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scan } from '../../../src/anatomy/scan.js';

const TEST_TIMEOUT = 30_000;

function makeTmp(label: string): string {
  const dir = path.join(os.tmpdir(), `cortex-anat-${label}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanTmp(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Minimal .cortex/cortex.config.json so validate() can find the project root */
function writeConfig(root: string, extra: Record<string, unknown> = {}): void {
  const cortexDir = path.join(root, '.cortex');
  fs.mkdirSync(cortexDir, { recursive: true });
  fs.writeFileSync(
    path.join(cortexDir, 'cortex.config.json'),
    JSON.stringify({ schemaVersion: '1.0', hooks: { preRead: false }, loop: { enabled: false }, ...extra }),
  );
}

// ---------------------------------------------------------------------------
// AC1: listing honours .gitignore and config exclude
// ---------------------------------------------------------------------------
describe('AC1: listing honours .gitignore and config exclude', () => {
  let tmpDir: string;
  beforeAll(async () => {
    tmpDir = makeTmp('ac1');
    writeConfig(tmpDir, { anatomy: { exclude: ['**/*.snap'] } });
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'dist/\n');
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'a.ts'), 'export const x = 1;\n');
    fs.writeFileSync(path.join(tmpDir, 'src', 'a.snap'), 'snapshot data');
    fs.writeFileSync(path.join(tmpDir, 'dist', 'a.js'), 'var x = 1;\n');
  }, TEST_TIMEOUT);
  afterAll(() => cleanTmp(tmpDir));

  it('dist/a.js excluded by .gitignore; src/a.snap excluded by config; src/a.ts included',
    async () => {
      const result = await scan(tmpDir);
      const paths = result.files.map(f => f.path);
      expect(paths).not.toContain('dist/a.js');
      expect(paths).not.toContain('src/a.snap');
      expect(paths).toContain('src/a.ts');
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// AC2: token math
// ---------------------------------------------------------------------------
describe('AC2: token math — 400 chars → 100 tokens', () => {
  let tmpDir: string;
  beforeAll(async () => {
    tmpDir = makeTmp('ac2');
    writeConfig(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    // Exactly 400 characters
    const content = 'x'.repeat(400);
    fs.writeFileSync(path.join(tmpDir, 'src', 'a.ts'), content);
  }, TEST_TIMEOUT);
  afterAll(() => cleanTmp(tmpDir));

  it('file of 400 chars → tokens === 100', async () => {
    const result = await scan(tmpDir);
    const file = result.files.find(f => f.path === 'src/a.ts');
    expect(file).toBeDefined();
    expect(file!.tokens).toBe(100);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC3: tree-sitter graph edge + definitions
// ---------------------------------------------------------------------------
describe('AC3: tree-sitter — graph edge and definitions', () => {
  let tmpDir: string;
  beforeAll(async () => {
    tmpDir = makeTmp('ac3');
    writeConfig(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'a.ts'),
      'import { x } from "./b";\nexport function foo() {}\n',
    );
    fs.writeFileSync(path.join(tmpDir, 'src', 'b.ts'), 'export const x = 1;\n');
  }, TEST_TIMEOUT);
  afterAll(() => cleanTmp(tmpDir));

  it('import "./b" resolves to src/b.ts edge with kind import', async () => {
    const result = await scan(tmpDir);
    const edge = result.graph.edges.find(
      e => e.from === 'src/a.ts' && e.to === 'src/b.ts',
    );
    expect(edge).toBeDefined();
    expect(edge!.kind).toBe('import');
  }, TEST_TIMEOUT);

  it('src/a.ts definitions includes "foo"', async () => {
    const result = await scan(tmpDir);
    const file = result.files.find(f => f.path === 'src/a.ts');
    expect(file).toBeDefined();
    expect(file!.definitions).toContain('foo');
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC4: SHA256 cache reuse
// ---------------------------------------------------------------------------
describe('AC4: SHA256 cache reuse', () => {
  let tmpDir: string;
  beforeAll(async () => {
    tmpDir = makeTmp('ac4');
    writeConfig(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    // File with a docstring so first scan gets needsPurposeRefresh=false
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'a.ts'),
      '/** Original purpose. */\nexport function doA() {}\n',
    );
  }, TEST_TIMEOUT);
  afterAll(() => cleanTmp(tmpDir));

  it('purpose retained from cache when file unchanged', async () => {
    // First scan
    await scan(tmpDir);

    // Modify the purpose cell in files.md to "Does A." (file itself unchanged)
    const filesPath = path.join(tmpDir, '.cortex', 'anatomy', 'files.md');
    const filesContent = fs.readFileSync(filesPath, 'utf-8');
    const lines = filesContent.split('\n');
    const modifiedLines = lines.map(line => {
      if (line.startsWith('| src/a.ts |')) {
        // Replace purpose cell (cols[1]) with "Does A."
        const cols = line.split(' | ');
        if (cols.length >= 7) {
          cols[1] = 'Does A.';
          return cols.join(' | ');
        }
      }
      return line;
    });
    fs.writeFileSync(filesPath, modifiedLines.join('\n'), 'utf-8');

    // Second scan WITHOUT full
    const result = await scan(tmpDir, { full: false });
    const file = result.files.find(f => f.path === 'src/a.ts');
    expect(file).toBeDefined();
    expect(file!.purpose).toBe('Does A.');
    expect(file!.needsPurposeRefresh).toBe(false);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC5: docstring extraction
// ---------------------------------------------------------------------------
describe('AC5: docstring extraction', () => {
  let tmpDir: string;
  beforeAll(async () => {
    tmpDir = makeTmp('ac5');
    writeConfig(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });

    // TS JSDoc block comment
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'ts-jsdoc.ts'),
      '/** Bootstraps the CLI. */\nexport function main() {}\n',
    );
    // TS plain line comment (should NOT count)
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'ts-plain.ts'),
      '// internal helper\nexport function helper() {}\n',
    );
    // Python module docstring
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'module.py'),
      '"""Processes data for the pipeline."""\n\ndef run():\n    pass\n',
    );
    // Rust //! module doc
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'lib.rs'),
      '//! Core library entry point.\n\npub fn init() {}\n',
    );
    // Go package comment
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'main.go'),
      '// Package main is the entry point.\npackage main\n\nfunc Run() {}\n',
    );
  }, TEST_TIMEOUT);
  afterAll(() => cleanTmp(tmpDir));

  it('TS JSDoc /** ... */ → purpose extracted, needsPurposeRefresh false', async () => {
    const result = await scan(tmpDir);
    const file = result.files.find(f => f.path === 'src/ts-jsdoc.ts');
    expect(file).toBeDefined();
    expect(file!.purpose).toBe('Bootstraps the CLI.');
    expect(file!.needsPurposeRefresh).toBe(false);
  }, TEST_TIMEOUT);

  it('TS plain // comment → placeholder, needsPurposeRefresh true', async () => {
    const result = await scan(tmpDir);
    const file = result.files.find(f => f.path === 'src/ts-plain.ts');
    expect(file).toBeDefined();
    expect(file!.purpose).toBe('(needs purpose)');
    expect(file!.needsPurposeRefresh).toBe(true);
  }, TEST_TIMEOUT);

  it('Python module docstring → purpose extracted, needsPurposeRefresh false', async () => {
    const result = await scan(tmpDir);
    const file = result.files.find(f => f.path === 'src/module.py');
    expect(file).toBeDefined();
    expect(file!.purpose).toBe('Processes data for the pipeline.');
    expect(file!.needsPurposeRefresh).toBe(false);
  }, TEST_TIMEOUT);

  it('Rust //! doc comment → purpose extracted, needsPurposeRefresh false', async () => {
    const result = await scan(tmpDir);
    const file = result.files.find(f => f.path === 'src/lib.rs');
    expect(file).toBeDefined();
    expect(file!.purpose).toBe('Core library entry point.');
    expect(file!.needsPurposeRefresh).toBe(false);
  }, TEST_TIMEOUT);

  it('Go package comment → purpose extracted, needsPurposeRefresh false', async () => {
    const result = await scan(tmpDir);
    const file = result.files.find(f => f.path === 'src/main.go');
    expect(file).toBeDefined();
    expect(file!.purpose).toBe('Package main is the entry point.');
    expect(file!.needsPurposeRefresh).toBe(false);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC6: spec cross-link
// ---------------------------------------------------------------------------
describe('AC6: spec cross-link present vs absent', () => {
  let tmpDir: string;
  beforeAll(async () => {
    tmpDir = makeTmp('ac6');
    writeConfig(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.specflow', 'specs', 'app'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.specflow', 'specs-business', 'app'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'a.ts'), 'export const x = 1;\n');

    // Valid business spec
    fs.writeFileSync(
      path.join(tmpDir, '.specflow', 'specs-business', 'app', 'thing.business.md'),
      [
        '---',
        'id: app.thing',
        'status: draft',
        'implemented_by:',
        '  - ../../specs/app/a.spec.md',
        '---',
        '',
        '# Thing',
        '',
        'Users get a thing.',
        '',
      ].join('\n'),
    );

    // Valid dev spec with governs
    fs.writeFileSync(
      path.join(tmpDir, '.specflow', 'specs', 'app', 'a.spec.md'),
      [
        '---',
        'id: app.a',
        'status: draft',
        'implements: ../../specs-business/app/thing.business.md',
        'governs:',
        '  - "src/a.ts"',
        '---',
        '',
        '# A',
        '',
      ].join('\n'),
    );

    // Overview files
    fs.writeFileSync(
      path.join(tmpDir, '.specflow', 'specs', 'app', '_overview.md'),
      '## What this is\nApp domain.\n## What it covers\nApp specs.\n## Why it\'s grouped this way\nGrouped for app.\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, '.specflow', 'specs-business', 'app', '_overview.md'),
      '## What this is\nApp business domain.\n## What it covers\nBusiness specs.\n## Why it\'s grouped this way\nGrouped for business.\n',
    );

    // .specflow/specs/_index.md (required for spec cross-linking)
    fs.writeFileSync(
      path.join(tmpDir, '.specflow', 'specs', '_index.md'),
      [
        '**Read this when:** implementing or reviewing a spec.',
        '',
        '## Domains',
        '',
        '- `app/` — app domain',
        '',
        '## Dependency Graph',
        '',
        'None.',
        '',
        '## Build Order',
        '',
        'Phase 1: app',
        '',
      ].join('\n'),
    );
  }, TEST_TIMEOUT);
  afterAll(() => cleanTmp(tmpDir));

  it('with .specflow/specs/_index.md + governs glob → specLinks contains the spec id', async () => {
    const result = await scan(tmpDir);
    const file = result.files.find(f => f.path === 'src/a.ts');
    expect(file).toBeDefined();
    expect(file!.specLinks).toContain('app.a');
  }, TEST_TIMEOUT);
});

describe('AC6b: spec cross-link absent', () => {
  let tmpDir: string;
  beforeAll(async () => {
    tmpDir = makeTmp('ac6b');
    writeConfig(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'a.ts'), 'export const x = 1;\n');
    // NO .specflow/specs/_index.md
  }, TEST_TIMEOUT);
  afterAll(() => cleanTmp(tmpDir));

  it('without .specflow/specs/_index.md → specLinks empty', async () => {
    const result = await scan(tmpDir);
    const file = result.files.find(f => f.path === 'src/a.ts');
    expect(file).toBeDefined();
    expect(file!.specLinks).toHaveLength(0);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC7: --full re-derives ignoring cache
// ---------------------------------------------------------------------------
describe('AC7: --full re-derives purpose ignoring cache', () => {
  let tmpDir: string;
  beforeAll(async () => {
    tmpDir = makeTmp('ac7');
    writeConfig(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'a.ts'),
      '/** Real purpose from docstring. */\nexport function foo() {}\n',
    );
  }, TEST_TIMEOUT);
  afterAll(() => cleanTmp(tmpDir));

  it('full scan re-derives purpose from docstring, ignores modified cache', async () => {
    // First scan
    await scan(tmpDir);

    // Corrupt the cached purpose
    const filesPath = path.join(tmpDir, '.cortex', 'anatomy', 'files.md');
    const filesContent = fs.readFileSync(filesPath, 'utf-8');
    const modified = filesContent.replace('Real purpose from docstring.', 'CORRUPTED PURPOSE');
    fs.writeFileSync(filesPath, modified);

    // Full scan should re-derive from docstring
    const result = await scan(tmpDir, { full: true });
    const file = result.files.find(f => f.path === 'src/a.ts');
    expect(file).toBeDefined();
    expect(file!.purpose).toBe('Real purpose from docstring.');
    expect(file!.needsPurposeRefresh).toBe(false);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC8: zero LLM/network
// ---------------------------------------------------------------------------
describe('AC8: zero LLM/network calls', () => {
  let tmpDir: string;
  beforeAll(async () => {
    tmpDir = makeTmp('ac8');
    writeConfig(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'a.ts'), 'export const x = 1;\n');
    fs.writeFileSync(path.join(tmpDir, 'src', 'b.py'), 'def run(): pass\n');
    fs.writeFileSync(path.join(tmpDir, 'src', 'c.rs'), 'fn main() {}\n');
    fs.writeFileSync(path.join(tmpDir, 'src', 'd.go'), 'package main\nfunc Run() {}\n');
  }, TEST_TIMEOUT);
  afterAll(() => cleanTmp(tmpDir));

  it('forbiddenLLMHook is never called during full scan', async () => {
    const spy = vi.fn();
    await scan(tmpDir, { full: true, forbiddenLLMHook: spy });
    expect(spy).not.toHaveBeenCalled();
  }, TEST_TIMEOUT);
});
