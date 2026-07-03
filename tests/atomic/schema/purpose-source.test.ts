/**
 * Atomic tests — check.anatomy-files (8-column contract) and the NEW
 * check.anatomy-purpose-source (§4.1 provenance round): fires on populated
 * purposes without provenance, grandfathers pre-provenance rows as
 * warning-only, stays quiet on clean and placeholder rows.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { checkAnatomyFiles, checkAnatomyPurposeSource } from '../../../src/schema/checks/anatomy.js';
import { validate } from '../../../src/schema/validate.js';
import { makeTmpDir, cleanTmp, makeCortexProject } from '../../fixtures/hooks-harness.js';
import type { ProjectIndex } from '../../../src/schema/index-build.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(label);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

const HEADER8 = '| path | purpose | tokens | sha256 | last_seen | spec_links | needs_purpose_refresh | purpose_source |';
const SEP8 = '|------|---------|--------|--------|-----------|------------|-----------------------|----------------|';
const SHA = 'a'.repeat(64);

function writeRawFilesMd(root: string, tableLines: string[]): string {
  const p = path.join(root, '.cortex', 'anatomy', 'files.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    `---\nkind: anatomy-files\nlast_full_scan: 2026-06-30T14:00:00.000Z\n---\n\n${tableLines.join('\n')}\n`,
  );
  return p;
}

const emptyIndex = { ids: new Map(), paths: new Set() } as unknown as ProjectIndex;

describe('check.anatomy-files: 8-column contract', () => {
  it('a well-formed 8-column table passes', () => {
    const root = tmp('af-8col');
    writeRawFilesMd(root, [
      HEADER8,
      SEP8,
      `| src/a.ts | Does A. | 12 | ${SHA} | 2026-06-30T14:00:00.000Z | - | false | docstring |`,
    ]);
    expect(checkAnatomyFiles(root, emptyIndex)).toEqual([]);
  });

  it('a 6-column row errors with "expected 8"', () => {
    const root = tmp('af-6col');
    writeRawFilesMd(root, [
      HEADER8,
      SEP8,
      `| src/a.ts | Does A. | 12 | ${SHA} | 2026-06-30T14:00:00.000Z | - |`,
    ]);
    const violations = checkAnatomyFiles(root, emptyIndex);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.severity).toBe('error');
    expect(violations[0]!.message).toContain('expected 8');
  });

  it('a legacy 7-column (pre-provenance) row is grandfathered: NO error from check.anatomy-files', () => {
    const root = tmp('af-legacy');
    writeRawFilesMd(root, [
      HEADER8,
      SEP8,
      `| src/a.ts | Does A. | 12 | ${SHA} | 2026-06-30T14:00:00.000Z | - | false |`,
    ]);
    expect(checkAnatomyFiles(root, emptyIndex)).toEqual([]);
  });
});

describe('check.anatomy-purpose-source: fires on populated purpose without provenance', () => {
  it('8-column row with a real purpose and "-" purpose_source → one warning', () => {
    const root = tmp('ps-fires');
    writeRawFilesMd(root, [
      HEADER8,
      SEP8,
      `| src/a.ts | Does A. | 12 | ${SHA} | 2026-06-30T14:00:00.000Z | - | false | - |`,
    ]);
    const violations = checkAnatomyPurposeSource(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.severity).toBe('warning');
    expect(violations[0]!.check).toBe('check.anatomy-purpose-source');
    expect(violations[0]!.clause).toBe('§4.1');
    expect(violations[0]!.message).toContain('src/a.ts');
  });

  it('legacy 7-column row with a real purpose (absent purpose_source) → warning, never error', () => {
    const root = tmp('ps-grandfather');
    writeRawFilesMd(root, [
      HEADER8,
      SEP8,
      `| src/a.ts | Does A. | 12 | ${SHA} | 2026-06-30T14:00:00.000Z | - | false |`,
    ]);
    const violations = checkAnatomyPurposeSource(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.severity).toBe('warning');
    // The grandfather guarantee, end to end: files.md yields ZERO errors.
    expect(checkAnatomyFiles(root, emptyIndex).filter((v) => v.severity === 'error')).toEqual([]);
  });
});

describe('check.anatomy-purpose-source: grandfathered/clean cases stay silent', () => {
  it('placeholder purpose with "-" provenance is clean (empty-state pairing)', () => {
    const root = tmp('ps-placeholder');
    writeRawFilesMd(root, [
      HEADER8,
      SEP8,
      `| src/a.ts | (needs purpose) | 12 | ${SHA} | 2026-06-30T14:00:00.000Z | - | true | - |`,
    ]);
    expect(checkAnatomyPurposeSource(root)).toEqual([]);
  });

  it('populated purpose with each enum provenance is clean', () => {
    const root = tmp('ps-clean');
    writeRawFilesMd(root, [
      HEADER8,
      SEP8,
      `| src/a.ts | Does A. | 12 | ${SHA} | 2026-06-30T14:00:00.000Z | - | false | docstring |`,
      `| src/b.ts | Does B. | 12 | ${SHA} | 2026-06-30T14:00:00.000Z | - | false | scanner-llm |`,
      `| src/c.ts | Does C. | 12 | ${SHA} | 2026-06-30T14:00:00.000Z | - | false | read-time |`,
    ]);
    expect(checkAnatomyPurposeSource(root)).toEqual([]);
  });

  it('missing files.md → no violations', () => {
    const root = tmp('ps-missing');
    expect(checkAnatomyPurposeSource(root)).toEqual([]);
  });
});

describe('check.anatomy-purpose-source: registered in validate', () => {
  it('a full validate run surfaces the warning (and it never flips conformant)', async () => {
    const root = tmp('ps-validate');
    makeCortexProject(root);
    writeRawFilesMd(root, [
      HEADER8,
      SEP8,
      `| src/a.ts | Does A. | 12 | ${SHA} | 2026-06-30T14:00:00.000Z | - | false | - |`,
    ]);
    const report = await validate(root, { root });
    const hits = report.violations.filter((v) => v.check === 'check.anatomy-purpose-source');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe('warning');
  });
});
