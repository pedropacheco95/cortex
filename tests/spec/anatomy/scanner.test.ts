import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scan } from '../../../src/anatomy/scan.js';
import { validate } from '../../../src/schema/validate.js';
import type { ScanResult } from '../../../src/anatomy/types.js';

const TEST_TIMEOUT = 30_000;

let tmpRoot: string;
let scanResult: ScanResult;

beforeAll(async () => {
  tmpRoot = path.join(os.tmpdir(), `cortex-spec-anat-${Date.now()}`);
  fs.mkdirSync(tmpRoot, { recursive: true });

  // -------------------------------------------------------------------------
  // .cortex/cortex.config.json
  // -------------------------------------------------------------------------
  const cortexDir = path.join(tmpRoot, '.cortex');
  fs.mkdirSync(cortexDir, { recursive: true });
  fs.writeFileSync(
    path.join(cortexDir, 'cortex.config.json'),
    JSON.stringify({
      schemaVersion: '1.0',
      hooks: { preRead: false },
      loop: { enabled: false },
      anatomy: { exclude: [] },
    }),
  );

  // .cortex/_index.md (checked by checkIndexPresent / checkIndexShape)
  fs.writeFileSync(
    path.join(cortexDir, '_index.md'),
    [
      '# Cortex — index',
      '',
      '**Read this when:** navigating.',
      '',
      "**What's here:**",
      '- `anatomy/` — file inventory',
      '',
      '**How to navigate:** start with anatomy.',
      '',
    ].join('\n'),
  );

  // -------------------------------------------------------------------------
  // .gitignore
  // -------------------------------------------------------------------------
  fs.writeFileSync(path.join(tmpRoot, '.gitignore'), 'dist/\n');

  // -------------------------------------------------------------------------
  // specs/_index.md  (needed for spec cross-link resolution in scan)
  // -------------------------------------------------------------------------
  const specsDir = path.join(tmpRoot, 'specs');
  fs.mkdirSync(specsDir, { recursive: true });
  fs.writeFileSync(
    path.join(specsDir, '_index.md'),
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

  // specs/app/_overview.md
  const specsAppDir = path.join(specsDir, 'app');
  fs.mkdirSync(specsAppDir, { recursive: true });
  fs.writeFileSync(
    path.join(specsAppDir, '_overview.md'),
    "## What this is\nApp domain.\n## What it covers\nApp specs.\n## Why it's grouped this way\nGrouped for clarity.\n",
  );

  // -------------------------------------------------------------------------
  // specs-business/app/
  // -------------------------------------------------------------------------
  const bizDir = path.join(tmpRoot, 'specs-business', 'app');
  fs.mkdirSync(bizDir, { recursive: true });
  fs.writeFileSync(
    path.join(bizDir, '_overview.md'),
    "## What this is\nApp business domain.\n## What it covers\nBusiness specs.\n## Why it's grouped this way\nGrouped for business.\n",
  );
  fs.writeFileSync(
    path.join(bizDir, 'thing.business.md'),
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

  // specs/app/a.spec.md — dev spec with governs
  fs.writeFileSync(
    path.join(specsAppDir, 'a.spec.md'),
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

  // -------------------------------------------------------------------------
  // Source files
  // -------------------------------------------------------------------------
  const srcDir = path.join(tmpRoot, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, 'a.ts'),
    '/** Does A. */\nexport function doA(): void {}\n',
  );
  fs.writeFileSync(
    path.join(srcDir, 'b.ts'),
    'export const CONFIG = { version: 1 };\n',
  );
  // a.ts imports b.ts
  fs.writeFileSync(
    path.join(srcDir, 'a.ts'),
    '/** Does A. */\nimport { CONFIG } from "./b";\nexport function doA(): void { console.log(CONFIG); }\n',
  );

  // -------------------------------------------------------------------------
  // Run scan
  // -------------------------------------------------------------------------
  scanResult = await scan(tmpRoot, { full: true });
}, TEST_TIMEOUT);

afterAll(() => {
  if (tmpRoot) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

describe('Spec-level: anatomy scanner end-to-end', () => {
  it('scan completes and returns a ScanResult', () => {
    expect(scanResult).toBeDefined();
    expect(typeof scanResult.root).toBe('string');
    expect(Array.isArray(scanResult.files)).toBe(true);
    expect(Array.isArray(scanResult.graph.nodes)).toBe(true);
    expect(Array.isArray(scanResult.graph.edges)).toBe(true);
  });

  it('source files appear in the scanned file list', () => {
    const paths = scanResult.files.map(f => f.path);
    expect(paths).toContain('src/a.ts');
    expect(paths).toContain('src/b.ts');
  });

  it('anatomy files are emitted to .cortex/anatomy/', () => {
    const anatomyDir = path.join(tmpRoot, '.cortex', 'anatomy');
    expect(fs.existsSync(path.join(anatomyDir, 'files.md'))).toBe(true);
    expect(fs.existsSync(path.join(anatomyDir, 'graph.json'))).toBe(true);
    expect(fs.existsSync(path.join(anatomyDir, 'layers.md'))).toBe(true);
  });

  it('graph.json is valid JSON with nodes and edges arrays', () => {
    const graphPath = path.join(tmpRoot, '.cortex', 'anatomy', 'graph.json');
    const graphRaw = fs.readFileSync(graphPath, 'utf-8');
    const graph = JSON.parse(graphRaw) as { nodes: unknown; edges: unknown };
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
  });

  it('validate() reports zero check.anatomy* error violations after scan', async () => {
    const report = await validate(tmpRoot, { root: tmpRoot });
    const anatomyErrors = report.violations.filter(
      v => v.severity === 'error' && v.check.startsWith('check.anatomy'),
    );
    expect(anatomyErrors).toHaveLength(0);
  }, TEST_TIMEOUT);

  it('spec cross-link: src/a.ts has specLinks containing app.a', () => {
    const file = scanResult.files.find(f => f.path === 'src/a.ts');
    expect(file).toBeDefined();
    expect(file!.specLinks).toContain('app.a');
  });

  it('graph contains edge from src/a.ts to src/b.ts', () => {
    const edge = scanResult.graph.edges.find(
      e => e.from === 'src/a.ts' && e.to === 'src/b.ts',
    );
    expect(edge).toBeDefined();
    expect(edge!.kind).toBe('import');
  });

  it('src/a.ts has purpose extracted from JSDoc', () => {
    const file = scanResult.files.find(f => f.path === 'src/a.ts');
    expect(file).toBeDefined();
    expect(file!.purpose).toBe('Does A.');
    expect(file!.needsPurposeRefresh).toBe(false);
  });
});
