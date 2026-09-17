/**
 * Atomic tests — schema.id-registry Rule 5, `check.id-registry`
 * (`src/schema/checks/registry.ts`): the absent-registry warning (only when
 * there is something to register), malformed and duplicate lines as errors, a
 * file with no line as an error naming `cortex id next <kind>`, a line with
 * no file as a warning, and out-of-order lines as warnings. Read-only: every
 * test snapshots the tree and asserts the check wrote nothing.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import { REGISTRY_FILE, REGISTRY_HEADER } from '../../../src/compass/registry.js';
import { checkIdRegistry } from '../../../src/schema/checks/registry.js';
import type { Violation } from '../../../src/schema/types.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`registry-check-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function plantFile(root: string, kind: 'rules' | 'bugs', name: string): string {
  const dir = path.join(root, '.cortex', 'compass', kind);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, `# ${name}\n`, 'utf-8');
  return file;
}

function writeRegistry(root: string, entries: string[]): string {
  const abs = path.join(root, REGISTRY_FILE);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${REGISTRY_HEADER}\n${entries.join('\n')}\n`, 'utf-8');
  return abs;
}

/** Runs the check and proves it wrote nothing. */
function runCheck(root: string): Violation[] {
  const before = snapshotTree(root);
  const out = checkIdRegistry(root);
  expect(snapshotTree(root)).toEqual(before);
  for (const v of out) expect(v.check).toBe('check.id-registry');
  return out;
}

const HEADER_LINES = REGISTRY_HEADER.split('\n').length; // entries start at HEADER_LINES + 1

describe('AC: an absent registry warns only when there is something to register', () => {
  it('rule files and no registry → one warning naming cortex sync, clause §10.4, no errors', () => {
    const root = tmp('absent-with-rules');
    plantFile(root, 'rules', 'R-001-a.md');
    const out = runCheck(root);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severity: 'warning', clause: '§10.4' });
    expect(out[0]!.message).toContain('cortex sync');
    expect(out[0]!.location.path).toBe(path.join(root, REGISTRY_FILE));
  });

  it('bug files and no registry → the same single warning', () => {
    const root = tmp('absent-with-bugs');
    plantFile(root, 'bugs', 'B-001-a.md');
    const out = runCheck(root);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe('warning');
    expect(out[0]!.message).toContain('cortex sync');
  });

  it('no rules, no bugs, no registry → silent (a fresh project); an _index.md alone is not a file to register', () => {
    const root = tmp('absent-empty');
    fs.mkdirSync(path.join(root, '.cortex', 'compass', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'compass', 'rules', '_index.md'), '# index\n', 'utf-8');
    expect(runCheck(root)).toEqual([]);
  });

  it('a header-only registry with no files is silent', () => {
    const root = tmp('header-only');
    writeRegistry(root, []);
    expect(runCheck(root)).toEqual([]);
  });
});

describe('AC: a file missing from the registry is an error naming the remedy', () => {
  it('B-019-x.md on disk, no B-019 line → one error naming the file and `cortex id next bug`, clause §4.2', () => {
    const root = tmp('missing-bug');
    writeRegistry(root, ['B-018 y']);
    plantFile(root, 'bugs', 'B-018-y.md');
    const file = plantFile(root, 'bugs', 'B-019-x.md');
    const out = runCheck(root);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severity: 'error', clause: '§4.2', location: { path: file } });
    expect(out[0]!.message).toContain('B-019');
    expect(out[0]!.message).toContain('cortex id next bug');
  });

  it('a rule file with no line names `cortex id next rule`, clause §4.1', () => {
    const root = tmp('missing-rule');
    writeRegistry(root, []);
    const file = plantFile(root, 'rules', 'R-007-z.md');
    const out = runCheck(root);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severity: 'error', clause: '§4.1', location: { path: file } });
    expect(out[0]!.message).toContain('cortex id next rule');
  });

  it('a registered file whose registry slug differs from the filename is NOT a finding (slug is informational)', () => {
    const root = tmp('slug-differs');
    writeRegistry(root, ['R-001 old-name']);
    plantFile(root, 'rules', 'R-001-renamed.md');
    expect(runCheck(root)).toEqual([]);
  });
});

describe('AC: a registered id without a file is a warning, not an error', () => {
  it('R-009 reserved and no R-009 file → one warning naming R-009 with its line number; zero errors', () => {
    const root = tmp('reserved');
    const abs = writeRegistry(root, ['R-001 a', 'R-009 reserved']);
    plantFile(root, 'rules', 'R-001-a.md');
    const out = runCheck(root);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severity: 'warning', clause: '§4.1', location: { path: abs, line: HEADER_LINES + 2 } });
    expect(out[0]!.message).toContain('R-009');
    expect(out.filter((v) => v.severity === 'error')).toHaveLength(0);
  });
});

describe('AC: duplicate and malformed lines are errors', () => {
  it('B-004 a twice and R-05 short → exactly two errors: one naming both line numbers, one naming the malformed line', () => {
    const root = tmp('dup-malformed');
    const abs = writeRegistry(root, ['R-05 short', 'B-004 a', 'B-004 a']);
    plantFile(root, 'bugs', 'B-004-a.md');
    const out = runCheck(root);
    const errors = out.filter((v) => v.severity === 'error');
    expect(errors).toHaveLength(2);
    const malformed = errors.find((v) => v.message.includes('R-05 short'));
    expect(malformed).toMatchObject({ location: { path: abs, line: HEADER_LINES + 1 } });
    const dup = errors.find((v) => v.message.includes('B-004') && !v.message.includes('R-05'));
    expect(dup).toBeDefined();
    expect(dup!.clause).toBe('§4.2');
    expect(dup!.message).toContain(String(HEADER_LINES + 2));
    expect(dup!.message).toContain(String(HEADER_LINES + 3));
    expect(dup!.location.path).toBe(abs);
  });

  it('a blank line and a `#` comment between entries are not malformed', () => {
    const root = tmp('comments');
    const abs = path.join(root, REGISTRY_FILE);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${REGISTRY_HEADER}\nR-001 a\n\n# bugs below\nB-001 b\n`, 'utf-8');
    plantFile(root, 'rules', 'R-001-a.md');
    plantFile(root, 'bugs', 'B-001-b.md');
    expect(runCheck(root)).toEqual([]);
  });
});

describe('Rule 5: out-of-order lines are warnings', () => {
  it('a rule line below a bug line, and a descending number within a kind, each warn without erroring', () => {
    const root = tmp('order');
    const abs = writeRegistry(root, ['R-002 b', 'R-001 a', 'B-001 x', 'R-003 c']);
    for (const n of ['R-001-a.md', 'R-002-b.md', 'R-003-c.md']) plantFile(root, 'rules', n);
    plantFile(root, 'bugs', 'B-001-x.md');
    const out = runCheck(root);
    expect(out.filter((v) => v.severity === 'error')).toHaveLength(0);
    const warnings = out.filter((v) => v.severity === 'warning');
    expect(warnings).toHaveLength(2);
    expect(warnings.map((v) => v.location.line).sort((a, b) => a! - b!)).toEqual([HEADER_LINES + 2, HEADER_LINES + 4]);
    expect(warnings.every((v) => v.location.path === abs)).toBe(true);
    expect(warnings.find((v) => v.location.line === HEADER_LINES + 2)!.message).toContain('R-001');
    expect(warnings.find((v) => v.location.line === HEADER_LINES + 4)!.message).toContain('R-003');
  });

  it('a clean registry that matches the files exactly is silent', () => {
    const root = tmp('clean');
    writeRegistry(root, ['R-001 a', 'R-002 b', 'B-001 x', 'B-002 y']);
    plantFile(root, 'rules', 'R-001-a.md');
    plantFile(root, 'rules', 'R-002-b.md');
    plantFile(root, 'bugs', 'B-001-x.md');
    plantFile(root, 'bugs', 'B-002-y.md');
    expect(runCheck(root)).toEqual([]);
  });
});
