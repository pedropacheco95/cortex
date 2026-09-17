/**
 * Atomic tests — schema.id-registry Rules 1, 2 and 6's inline migration
 * (`src/compass/registry.ts`): the header constant, the line grammar
 * (`parseRegistry`), allocation as an append in the kind's block, the disk
 * floor, and create-from-disk when the registry is absent. Every test builds
 * a temp `.cortex/compass/` by hand and reads the file back byte-exact.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import {
  REGISTRY_FILE,
  REGISTRY_HEADER,
  parseRegistry,
  idsOnDisk,
  buildRegistryFromDisk,
  allocateId,
  ensureRegistry,
  findRegistered,
  registerId,
  readRegistry,
} from '../../../src/compass/registry.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`registry-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function registryAbs(root: string): string {
  return path.join(root, REGISTRY_FILE);
}

function writeRegistry(root: string, entries: string[]): string {
  const text = `${REGISTRY_HEADER}\n${entries.join('\n')}\n`;
  fs.mkdirSync(path.dirname(registryAbs(root)), { recursive: true });
  fs.writeFileSync(registryAbs(root), text, 'utf-8');
  return text;
}

function plantFile(root: string, kind: 'rules' | 'bugs', name: string): void {
  const dir = path.join(root, '.cortex', 'compass', kind);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), `# ${name}\n`, 'utf-8');
}

function pad(n: number): string {
  return String(n).padStart(3, '0');
}

/** `R-001`–`R-003` and `B-001`–`B-019`, as registry lines. */
function threeRulesNineteenBugs(): string[] {
  const lines: string[] = [];
  for (let i = 1; i <= 3; i++) lines.push(`R-${pad(i)} rule-${i}`);
  for (let i = 1; i <= 19; i++) lines.push(`B-${pad(i)} bug-${i}`);
  return lines;
}

describe('Rule 1: the file — header and line grammar', () => {
  it('REGISTRY_HEADER is the pinned three-sentence header under the H1, ending in a newline', () => {
    expect(REGISTRY_HEADER.startsWith('# Id registry — append-only\n\n')).toBe(true);
    expect(REGISTRY_HEADER).toContain('One line per issued rule or bug id: `<id> <slug>`.');
    expect(REGISTRY_HEADER).toContain('never renumber, reorder or delete a line.');
    expect(REGISTRY_HEADER).toContain('A merge conflict\nin this file is the point — two branches issued the same id.');
    expect(REGISTRY_HEADER.endsWith('\n')).toBe(true);
    expect(REGISTRY_FILE).toBe('.cortex/compass/registry.md');
  });

  it('parseRegistry reads `<id> <slug>` lines with 1-based line numbers and ignores blanks, comments and the header', () => {
    const text = `${REGISTRY_HEADER}\nR-001 core-no-llm-calls\n\n# a comment\nB-001 prewrite-path-match-noise\nB-002 reserved\n`;
    const parsed = parseRegistry(text);
    expect(parsed.malformed).toEqual([]);
    expect(parsed.duplicates).toEqual([]);
    expect(parsed.lines.map((l) => [l.id, l.slug])).toEqual([
      ['R-001', 'core-no-llm-calls'],
      ['B-001', 'prewrite-path-match-noise'],
      ['B-002', 'reserved'],
    ]);
    const headerLineCount = REGISTRY_HEADER.split('\n').length; // header lines + the blank after it
    expect(parsed.lines[0]!.line).toBe(headerLineCount + 1);
    expect(parsed.lines[1]!.line).toBe(headerLineCount + 4);
  });

  it('parseRegistry reports a malformed line (short number, uppercase slug, missing slug) with its line number and text', () => {
    const text = `${REGISTRY_HEADER}\nR-05 short\nR-006 Upper\nR-007\nB-001 ok\n`;
    const parsed = parseRegistry(text);
    const base = REGISTRY_HEADER.split('\n').length;
    expect(parsed.malformed).toEqual([
      { line: base + 1, text: 'R-05 short' },
      { line: base + 2, text: 'R-006 Upper' },
      { line: base + 3, text: 'R-007' },
    ]);
    expect(parsed.lines.map((l) => l.id)).toEqual(['B-001']);
  });

  it('parseRegistry reports the same id on two lines as a duplicate naming both line numbers', () => {
    const text = `${REGISTRY_HEADER}\nB-004 a\nB-005 b\nB-004 a\n`;
    const parsed = parseRegistry(text);
    const base = REGISTRY_HEADER.split('\n').length;
    expect(parsed.duplicates).toEqual([{ id: 'B-004', lines: [base + 1, base + 3] }]);
  });

  it('parseRegistry tolerates CRLF line endings', () => {
    const text = `${REGISTRY_HEADER}\nR-001 a\nB-001 b\n`.replace(/\n/g, '\r\n');
    const parsed = parseRegistry(text);
    expect(parsed.malformed).toEqual([]);
    expect(parsed.lines.map((l) => l.id)).toEqual(['R-001', 'B-001']);
  });
});

describe('AC: allocation appends the next id in its kind\'s block', () => {
  it('R-004 lands after R-003 and before B-001; B-020 lands last; every pre-existing line is byte-identical', () => {
    const root = tmp('append');
    const before = writeRegistry(root, threeRulesNineteenBugs());

    expect(allocateId(root, 'rule', 'no-secrets-in-compass')).toBe('R-004');
    expect(allocateId(root, 'bug')).toBe('B-020');

    const after = fs.readFileSync(registryAbs(root), 'utf-8');
    const lines = after.split('\n');
    const ruleIdx = lines.indexOf('R-004 no-secrets-in-compass');
    expect(ruleIdx).toBeGreaterThan(0);
    expect(lines[ruleIdx - 1]).toBe('R-003 rule-3');
    expect(lines[ruleIdx + 1]).toBe('B-001 bug-1');
    expect(after.endsWith('B-020 reserved\n')).toBe(true);
    // Every pre-existing line survives in order — the file is the old one plus two insertions.
    const beforeLines = before.split('\n');
    const afterMinusNew = lines.filter((l) => l !== 'R-004 no-secrets-in-compass' && l !== 'B-020 reserved');
    expect(afterMinusNew).toEqual(beforeLines);
    expect(after.startsWith(REGISTRY_HEADER)).toBe(true);
  });

  it('a rule allocated into a registry with no rule lines yet lands before the first bug line', () => {
    const root = tmp('no-rules');
    writeRegistry(root, ['B-001 a', 'B-002 b']);
    expect(allocateId(root, 'rule', 'first')).toBe('R-001');
    const lines = fs.readFileSync(registryAbs(root), 'utf-8').split('\n');
    expect(lines.indexOf('R-001 first')).toBe(lines.indexOf('B-001 a') - 1);
  });

  it('a header-only registry gains its first line after one blank line and keeps the trailing newline', () => {
    const root = tmp('header-only');
    fs.mkdirSync(path.dirname(registryAbs(root)), { recursive: true });
    fs.writeFileSync(registryAbs(root), `${REGISTRY_HEADER}\n`, 'utf-8');
    expect(allocateId(root, 'bug', 'first')).toBe('B-001');
    expect(fs.readFileSync(registryAbs(root), 'utf-8')).toBe(`${REGISTRY_HEADER}\nB-001 first\n`);
  });

  it('a slug is normalised to the line grammar; an empty one becomes `reserved`', () => {
    const root = tmp('slug');
    writeRegistry(root, []);
    expect(allocateId(root, 'bug', 'Flaky Tier!')).toBe('B-001');
    expect(allocateId(root, 'bug', '')).toBe('B-002');
    const text = fs.readFileSync(registryAbs(root), 'utf-8');
    expect(text).toContain('B-001 flaky-tier\n');
    expect(text).toContain('B-002 reserved\n');
  });

  it('ids are never reused: a deleted file does not free its registry line', () => {
    const root = tmp('never-reuse');
    writeRegistry(root, ['B-001 a', 'B-002 gone']);
    plantFile(root, 'bugs', 'B-001-a.md');
    expect(allocateId(root, 'bug', 'c')).toBe('B-003');
  });
});

describe('AC: a file that predates the registry still raises the floor', () => {
  it('B-021-orphan.md on disk, unlisted, makes the next bug B-022', () => {
    const root = tmp('floor');
    writeRegistry(root, threeRulesNineteenBugs());
    plantFile(root, 'bugs', 'B-021-orphan.md');
    expect(allocateId(root, 'bug', 'x')).toBe('B-022');
    expect(fs.readFileSync(registryAbs(root), 'utf-8').endsWith('B-022 x\n')).toBe(true);
  });

  it('idsOnDisk reads numbers from R-NNN-slug.md and bare R-NNN.md filenames only', () => {
    const root = tmp('disk');
    plantFile(root, 'rules', 'R-001-a.md');
    plantFile(root, 'rules', 'R-004.md');
    plantFile(root, 'rules', '_index.md');
    plantFile(root, 'rules', 'notes.md');
    plantFile(root, 'rules', 'B-009-wrong-kind.md');
    expect(idsOnDisk(root, 'rule')).toEqual([1, 4]);
    expect(idsOnDisk(root, 'bug')).toEqual([]);
  });
});

describe('AC: an absent registry is created on first allocation', () => {
  it('three rules and nineteen bugs on disk, no registry → header, rules, bugs by filename slug, then B-020 new', () => {
    const root = tmp('create');
    for (let i = 1; i <= 3; i++) plantFile(root, 'rules', `R-${pad(i)}-rule-${i}.md`);
    for (let i = 1; i <= 19; i++) plantFile(root, 'bugs', `B-${pad(i)}-bug-${i}.md`);
    expect(fs.existsSync(registryAbs(root))).toBe(false);

    expect(allocateId(root, 'bug', 'new')).toBe('B-020');

    const text = fs.readFileSync(registryAbs(root), 'utf-8');
    expect(text.startsWith(REGISTRY_HEADER)).toBe(true);
    expect(text).toBe(`${REGISTRY_HEADER}\n${[...threeRulesNineteenBugs(), 'B-020 new'].join('\n')}\n`);
  });

  it('buildRegistryFromDisk orders rules ascending then bugs ascending, a bare filename is `reserved`, no files is header-only', () => {
    const root = tmp('build');
    plantFile(root, 'bugs', 'B-010-late.md');
    plantFile(root, 'bugs', 'B-002.md');
    plantFile(root, 'rules', 'R-003-c.md');
    plantFile(root, 'rules', 'R-001-a.md');
    expect(buildRegistryFromDisk(root)).toBe(`${REGISTRY_HEADER}\nR-001 a\nR-003 c\nB-002 reserved\nB-010 late\n`);
    const empty = tmp('build-empty');
    expect(buildRegistryFromDisk(empty)).toBe(`${REGISTRY_HEADER}\n`);
  });

  it('allocateId with no compass directory at all creates it and returns R-001', () => {
    const root = tmp('no-compass');
    expect(allocateId(root, 'rule', 'first')).toBe('R-001');
    expect(fs.readFileSync(registryAbs(root), 'utf-8')).toBe(`${REGISTRY_HEADER}\nR-001 first\n`);
  });
});

describe('Rule 6 helper: ensureRegistry creates once and never rewrites', () => {
  it('creates from disk with counts, then reports present without touching the file', () => {
    const root = tmp('ensure');
    plantFile(root, 'rules', 'R-001-a.md');
    plantFile(root, 'bugs', 'B-001-b.md');
    plantFile(root, 'bugs', 'B-002-c.md');
    expect(ensureRegistry(root)).toEqual({ created: true, rules: 1, bugs: 2 });
    const text = fs.readFileSync(registryAbs(root), 'utf-8');
    // Hand-edit, then ensure again: byte-identical afterwards.
    fs.writeFileSync(registryAbs(root), `${text}# a note\n`, 'utf-8');
    expect(ensureRegistry(root)).toEqual({ created: false, rules: 0, bugs: 0 });
    expect(fs.readFileSync(registryAbs(root), 'utf-8')).toBe(`${text}# a note\n`);
  });
});

describe('Rule 4 helpers: findRegistered and registerId (the accept path)', () => {
  it('findRegistered reads the registry, or builds from disk without writing when it is absent', () => {
    const root = tmp('find');
    plantFile(root, 'rules', 'R-002-on-disk.md');
    expect(findRegistered(root, 'R-002')).toMatchObject({ id: 'R-002', slug: 'on-disk' });
    expect(findRegistered(root, 'R-003')).toBeUndefined();
    expect(fs.existsSync(registryAbs(root))).toBe(false);
    expect(readRegistry(root)).toBeNull();
  });

  it('registerId appends a new line in the kind\'s block, is idempotent for the same slug, and reports a conflict for a different one', () => {
    const root = tmp('register');
    writeRegistry(root, ['R-001 a', 'B-001 b']);
    expect(registerId(root, 'R-002', 'x')).toEqual({ status: 'appended' });
    expect(fs.readFileSync(registryAbs(root), 'utf-8')).toBe(`${REGISTRY_HEADER}\nR-001 a\nR-002 x\nB-001 b\n`);
    expect(registerId(root, 'R-002', 'x')).toEqual({ status: 'already-registered' });
    expect(registerId(root, 'R-002', 'other')).toMatchObject({ status: 'conflict', line: { id: 'R-002', slug: 'x' } });
    expect(fs.readFileSync(registryAbs(root), 'utf-8')).toBe(`${REGISTRY_HEADER}\nR-001 a\nR-002 x\nB-001 b\n`);
  });

  it('a `reserved` line is claimable by any slug: registerId reports it already registered and appends nothing', () => {
    const root = tmp('reserved');
    writeRegistry(root, ['R-001 reserved']);
    expect(registerId(root, 'R-001', 'named-later')).toEqual({ status: 'already-registered' });
    expect(fs.readFileSync(registryAbs(root), 'utf-8')).toBe(`${REGISTRY_HEADER}\nR-001 reserved\n`);
  });
});
