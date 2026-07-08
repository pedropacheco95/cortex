/**
 * Spec-level tests — loops.bug-triage driven through the real CLI entry
 * (`run` in src/cli/cli.ts): the skill's --collect/--report path (fill-only
 * apply + §4.5 always-write report), flag misuse, and convergence across
 * runs (Rule 4). Sandboxed tmp projects; cwd restored.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { run } from '../../../src/cli/cli.js';

const TEST_TIMEOUT = 30_000;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`bug-triage-spec-${label}`);
  dirs.push(d);
  return d;
}

let out: string[] = [];
let err: string[] = [];
let originalCwd: string;
beforeEach(() => {
  originalCwd = process.cwd();
  out = [];
  err = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    out.push(a.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    err.push(a.join(' '));
  });
});
afterEach(() => {
  process.chdir(originalCwd);
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

function makeProject(label: string): string {
  const root = tmp(label);
  fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'compass', 'bugs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.cortex', 'cortex.config.json'),
    JSON.stringify({ schemaVersion: '1.0' }, null, 2),
    'utf-8',
  );
  return root;
}

function writeBug(root: string, id: string, classified: boolean): string {
  const lines = [
    '---',
    `id: ${id}`,
    `title: ${id} spec-test bug`,
    ...(classified ? ['type: layer-drift', 'severity: high'] : []),
    'status: open',
    'affects:',
    '  - src/app.ts',
    ...(classified ? ['proposed_fix: Existing fix.'] : []),
    '---',
    '',
    `# ${id}`,
    '',
  ].join('\n');
  const file = path.join(root, '.cortex', 'compass', 'bugs', `${id}-spec-bug.md`);
  fs.writeFileSync(file, lines, 'utf-8');
  return file;
}

describe('loops.bug-triage integrated slice (through cortex CLI run())', () => {
  it('--collect writes the worklist; --report fills the unclassified bug and reports the classified divergence', async () => {
    const root = makeProject('journey');
    process.chdir(root);
    const unclassifiedFile = writeBug(root, 'B-001', false);
    const classifiedFile = writeBug(root, 'B-002', true);
    const classifiedBefore = fs.readFileSync(classifiedFile, 'utf-8');

    expect(await run(['loop-bug-triage', '--collect'])).toBe(0);
    const worklist = JSON.parse(
      fs.readFileSync(path.join(root, '.cortex', 'pulse', '.triage-worklist.json'), 'utf-8'),
    ) as { kind: string; unclassified: { id: string }[]; classified: { id: string }[] };
    expect(worklist.kind).toBe('triage-worklist');
    expect(worklist.unclassified.map((b) => b.id)).toEqual(['B-001']);
    expect(worklist.classified.map((b) => b.id)).toEqual(['B-002']);

    const scratch = path.join(tmp('scratch'), 'results.json');
    fs.writeFileSync(
      scratch,
      JSON.stringify([
        { bugId: 'B-001', type: 'test-defect', severity: 'low', proposedFix: 'Fix the test.', reasoning: 'Spec is right.' },
        { bugId: 'B-002', type: 'wrong-rule', severity: 'high', proposedFix: 'Existing fix.', reasoning: 'Rule wrong as written.' },
      ]),
      'utf-8',
    );
    expect(await run(['loop-bug-triage', '--report', scratch])).toBe(0);

    // Unclassified bug filled (all three fields were absent).
    const filled = matter(fs.readFileSync(unclassifiedFile, 'utf-8')).data as Record<string, unknown>;
    expect(filled['type']).toBe('test-defect');
    expect(filled['severity']).toBe('low');
    expect(filled['proposed_fix']).toBe('Fix the test.');

    // Classified bug byte-identical; divergence reported with both readings.
    expect(fs.readFileSync(classifiedFile, 'utf-8')).toBe(classifiedBefore);
    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'bug-triage.md'), 'utf-8');
    expect(report).toContain('kind: pulse-bug-triage');
    expect(report).toContain('loop: cortex-loop-bug-triage');
    expect(report).toContain('B-002 `type` — ledger: `layer-drift` / loop: `wrong-rule`');
    expect(report).toContain('reasoning: Rule wrong as written.');
  }, TEST_TIMEOUT);

  it('re-running the same results converges (Rule 4): second run is compare-only, agreement reported', async () => {
    const root = makeProject('converge');
    process.chdir(root);
    const file = writeBug(root, 'B-001', false);
    const scratch = path.join(tmp('scratch2'), 'results.json');
    fs.writeFileSync(
      scratch,
      JSON.stringify([{ bugId: 'B-001', type: 'incomplete-rule', severity: 'medium', proposedFix: 'Extend the rule.', reasoning: 'Case uncovered.' }]),
      'utf-8',
    );
    expect(await run(['loop-bug-triage', '--report', scratch])).toBe(0);
    const afterFirst = fs.readFileSync(file, 'utf-8');
    expect(await run(['loop-bug-triage', '--report', scratch])).toBe(0);
    expect(fs.readFileSync(file, 'utf-8')).toBe(afterFirst);
    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'bug-triage.md'), 'utf-8');
    expect(report).toContain('B-001: independent re-derivation agrees on `type`, `severity`, `proposed_fix`');
  }, TEST_TIMEOUT);

  it('flag misuse through the CLI is refused: --collect with --report, and --report without a path', async () => {
    const root = makeProject('flags');
    process.chdir(root);
    expect(await run(['loop-bug-triage', '--collect', '--report', 'x.json'])).toBe(1);
    expect(await run(['loop-bug-triage', '--report'])).toBe(1);
    expect(err.join('\n')).toMatch(/--report requires/);
  }, TEST_TIMEOUT);

  it('empty ledger through the CLI: stated clean run, exit 0', async () => {
    const root = makeProject('empty');
    process.chdir(root);
    expect(await run(['loop-bug-triage', '--no-llm'])).toBe(0);
    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'bug-triage.md'), 'utf-8');
    expect(report).toContain('No open bugs — the ledger is clean this run.');
  }, TEST_TIMEOUT);
});
