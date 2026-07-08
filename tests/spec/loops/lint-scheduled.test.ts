/**
 * Spec-level tests — loops.lint-scheduled driven through the real CLI entry
 * (`run` in src/cli/cli.ts): `cortex loop-specflow-lint` over a conformant
 * fixture copy and over a broken one — exit 0 both ways, the dated report is
 * the product. Sandboxed tmp projects; cwd restored.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { run } from '../../../src/cli/cli.js';

const TEST_TIMEOUT = 30_000;
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const VALID_FIXTURE = path.join(PKG_ROOT, 'tests', 'fixtures', 'valid');

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`lint-loop-spec-${label}`);
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

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

describe('loops.lint-scheduled integrated slice (through cortex CLI run())', () => {
  it('clean fixture: exit 0 and a fresh dated "structurally sound" report with the §4.5 header', async () => {
    const root = tmp('clean');
    copyDir(VALID_FIXTURE, root);
    process.chdir(root);
    expect(await run(['loop-specflow-lint'])).toBe(0);
    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'lint-report.md'), 'utf-8');
    expect(report).toContain('kind: pulse-lint-report');
    expect(report).toMatch(/generated: \d{4}-/);
    expect(report).toContain('Spec tree structurally sound.');
  }, TEST_TIMEOUT);

  it('dirty fixture: still exit 0 (the report is the product, not a CI gate), violations grouped by check', async () => {
    const root = tmp('dirty');
    copyDir(VALID_FIXTURE, root);
    fs.rmSync(path.join(root, '.specflow', 'specs', 'schema', '_overview.md'));
    process.chdir(root);
    expect(await run(['loop-specflow-lint'])).toBe(0);
    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'lint-report.md'), 'utf-8');
    expect(report).toContain('## check.overview-present');
    expect(report).toMatch(/error\(s\), \d+ warning\(s\) across the spec trees\./);
  }, TEST_TIMEOUT);
});
