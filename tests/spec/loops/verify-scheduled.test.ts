/**
 * Spec-level tests — loops.verify-scheduled driven through the real CLI entry
 * (`run` in src/cli/cli.ts): `cortex loop-specflow-verify` over a fully
 * covered fixture and over one with gaps + a declared deferral — exit 0 both
 * ways, the report is the product. Sandboxed tmp projects; cwd restored.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { run } from '../../../src/cli/cli.js';

const TEST_TIMEOUT = 30_000;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`verify-loop-spec-${label}`);
  dirs.push(d);
  return d;
}

let originalCwd: string;
beforeEach(() => {
  originalCwd = process.cwd();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.chdir(originalCwd);
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

function writeAt(root: string, rel: string, content: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

function makeProject(label: string): string {
  const root = tmp(label);
  fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
  writeAt(root, '.cortex/cortex.config.json', JSON.stringify({ schemaVersion: '1.0' }, null, 2) + '\n');
  return root;
}

const BIZ = ['---', 'id: a.out', 'status: draft', 'implemented_by: []', '---', '', '# a.out', ''].join('\n');
const DEV = (notes: string[]) =>
  ['---', 'id: a.b', 'status: draft', 'implements: ../../specs-business/a/out.business.md', '---', '', '# a.b', ...notes, ''].join('\n');

describe('loops.verify-scheduled integrated slice (through cortex CLI run())', () => {
  it('fully covered project: exit 0 and "All specs carry their owed tests." with the §4.5 header', async () => {
    const root = makeProject('clean');
    writeAt(root, '.specflow/specs-business/a/out.business.md', BIZ);
    writeAt(root, '.specflow/specs/a/b.spec.md', DEV([]));
    writeAt(root, 'tests/atomic/a/b.test.ts', '// t');
    writeAt(root, 'tests/spec/a/b.test.ts', '// t');
    writeAt(root, 'tests/journey/a/out.test.ts', '// t');
    writeAt(root, 'tests/scenario/specs/s.md', ['---', 'name: s', 'covers:', '  - a.out', '---', ''].join('\n'));
    process.chdir(root);
    expect(await run(['loop-specflow-verify'])).toBe(0);
    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'verification.md'), 'utf-8');
    expect(report).toContain('kind: pulse-verification-report');
    expect(report).toContain('loop: cortex-loop-specflow-verify');
    expect(report).toContain('All specs carry their owed tests.');
  }, TEST_TIMEOUT);

  it('gaps + declared deferral: exit 0, gaps named, deferral under "Deferred by decision"', async () => {
    const root = makeProject('gaps');
    writeAt(root, '.specflow/specs-business/a/out.business.md', BIZ);
    writeAt(root, '.specflow/specs/a/b.spec.md', DEV(['', '## Notes', '', '- Journey-layer tests deferred to v1.1.']));
    // No tests at all; a.out covered by no scenario, journey deferred by the dev spec's Notes.
    process.chdir(root);
    expect(await run(['loop-specflow-verify'])).toBe(0);
    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'verification.md'), 'utf-8');
    expect(report).toContain('`a.b` (`.specflow/specs/a/b.spec.md`): missing `tests/atomic/a/b.test.ts`, `tests/spec/a/b.test.ts`');
    expect(report).toContain('absent from every scenario `covers:`');
    expect(report.split('## Deferred by decision')[1]).toContain('tests/journey/a/out.test.ts');
  }, TEST_TIMEOUT);
});
