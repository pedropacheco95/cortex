/**
 * schema.validator Rule 13 — rule and bug self-agreement. The filename ↔ id
 * disagreement stays check.rule / check.bug's error; an H1 whose R-NNN / B-NNN
 * token disagrees with `id:` is a check.compass-heading warning (§4.1 / §4.2).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validate } from '../../../src/schema/validate.js';
import { checkCompassHeading } from '../../../src/schema/checks/compass.js';
import { makeTmpFixture, cleanup, writeRule, writeBug, rulesDir, bugsDir } from '../../fixtures/validator-tmp.js';

describe('An H1 that disagrees with the id is warned, a filename that disagrees stays an error', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmpFixture('compass-heading-ac');
    writeRule(root, 'R-026-first.md', 'R-026', { h1: '# R-027 — Second rule' });
    // filename says B-004, id says B-005, H1 agrees with the id → check.bug only
    writeBug(root, 'B-004-x.md', 'B-005', { h1: '# B-005 — x' });
  });
  afterAll(() => cleanup(root));

  it('one check.compass-heading warning at R-026-first.md naming R-027 and R-026', async () => {
    const report = await validate(root);
    const headings = report.violations.filter((v) => v.check === 'check.compass-heading');
    expect(headings).toHaveLength(1);
    const v = headings[0]!;
    expect(v.severity).toBe('warning');
    expect(v.clause).toBe('§4.1');
    expect(v.location.path).toBe(path.join(rulesDir(root), 'R-026-first.md'));
    expect(v.location.line).toBe(10); // 8 frontmatter lines, a blank, then the H1
    expect(v.message).toBe('H1 "R-027" disagrees with id "R-026"');
  });

  it('one check.bug error at the id key of B-004-x.md (the filename rule), no heading finding for it', async () => {
    const report = await validate(root);
    const bugErrors = report.violations.filter((v) => v.check === 'check.bug' && v.location.path.endsWith('B-004-x.md'));
    expect(bugErrors).toHaveLength(1);
    expect(bugErrors[0]!.severity).toBe('error');
    expect(bugErrors[0]!.location.key).toBe('id');
    expect(bugErrors[0]!.message).toContain('B-004');
    expect(report.violations.filter((v) => v.check === 'check.compass-heading' && v.location.path.endsWith('B-004-x.md'))).toHaveLength(0);
  });
});

describe('checkCompassHeading edge cases', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmpFixture('compass-heading-edges');
  });
  afterAll(() => cleanup(root));

  it('an H1 without an id token (# Core makes no LLM calls) → nothing', () => {
    writeRule(root, 'R-002-no-token.md', 'R-002', { h1: '# Core makes no LLM calls' });
    expect(checkCompassHeading(root).filter((v) => v.location.path.endsWith('R-002-no-token.md'))).toHaveLength(0);
  });

  it('no H1 at all → nothing', () => {
    writeRule(root, 'R-003-headless.md', 'R-003', { h1: null });
    expect(checkCompassHeading(root).filter((v) => v.location.path.endsWith('R-003-headless.md'))).toHaveLength(0);
  });

  it('a bug whose H1 disagrees with id: → warning citing §4.2', () => {
    writeBug(root, 'B-007-y.md', 'B-007', { h1: '# B-008 — y' });
    const found = checkCompassHeading(root).filter((v) => v.location.path.endsWith('B-007-y.md'));
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('warning');
    expect(found[0]!.check).toBe('check.compass-heading');
    expect(found[0]!.clause).toBe('§4.2');
    expect(found[0]!.message).toBe('H1 "B-008" disagrees with id "B-007"');
    expect(found[0]!.location.path).toBe(path.join(bugsDir(root), 'B-007-y.md'));
  });

  it('a non-string id → nothing (check.rule owns the shape)', () => {
    fs.writeFileSync(path.join(rulesDir(root), 'R-009-numeric.md'), '---\nid: 9\ntitle: t\nsource: []\ngoverns: []\n---\n\n# R-010 — whatever\n');
    expect(checkCompassHeading(root).filter((v) => v.location.path.endsWith('R-009-numeric.md'))).toHaveLength(0);
  });

  it('only the first H1 counts', () => {
    writeRule(root, 'R-011-two-h1.md', 'R-011', { h1: '# R-011 — agrees\n\n# R-012 — a later heading' });
    expect(checkCompassHeading(root).filter((v) => v.location.path.endsWith('R-011-two-h1.md'))).toHaveLength(0);
  });

  it('absent compass directories → nothing', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-compass-heading-empty-'));
    try {
      expect(checkCompassHeading(empty)).toEqual([]);
    } finally {
      cleanup(empty);
    }
  });
});
