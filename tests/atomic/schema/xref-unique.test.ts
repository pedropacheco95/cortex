/**
 * schema.validator Rule 12 — global id uniqueness over every kind the index
 * scans (schema §6 global rule 1; B-019). Atomic layer: one case per
 * Given/When/Then, over a temp copy of tests/fixtures/valid.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validate } from '../../../src/schema/validate.js';
import { buildIndex, resolveId } from '../../../src/schema/index-build.js';
import { makeTmpFixture, cleanup, writeRule, writeBug, rulesDir } from '../../fixtures/validator-tmp.js';

describe('buildIndex keeps duplicates', () => {
  let dupRoot: string;
  let singleRoot: string;
  beforeAll(() => {
    dupRoot = makeTmpFixture('index-dup');
    writeRule(dupRoot, 'R-026-first.md', 'R-026');
    writeRule(dupRoot, 'R-026-second.md', 'R-026');
    singleRoot = makeTmpFixture('index-single');
  });
  afterAll(() => {
    cleanup(dupRoot);
    cleanup(singleRoot);
  });

  it('two R-026 files → idToFiles holds both paths and resolveId finds nothing', async () => {
    const index = await buildIndex(dupRoot);
    const files = index.idToFiles?.get('R-026');
    expect(files).toBeDefined();
    expect(files).toHaveLength(2);
    expect(files!.map((f) => path.basename(f)).sort()).toEqual(['R-026-first.md', 'R-026-second.md']);
    expect(files!.every((f) => path.isAbsolute(f))).toBe(true);
    expect(resolveId(index, 'R-026')).toBeUndefined();
  });

  it('one rule → idToFiles has one path and resolveId returns it', async () => {
    const index = await buildIndex(singleRoot);
    const expected = path.join(rulesDir(singleRoot), 'R-001-sample-rule.md');
    expect(index.idToFiles?.get('R-001')).toEqual([expected]);
    expect(resolveId(index, 'R-001')).toBe(expected);
  });
});

describe('check.xref-unique reads the index over every kind', () => {
  describe('Two compass rules with one id are rejected', () => {
    let root: string;
    beforeAll(() => {
      root = makeTmpFixture('xref-unique-rules');
      writeRule(root, 'R-026-first.md', 'R-026');
      writeRule(root, 'R-026-second.md', 'R-026');
    });
    afterAll(() => cleanup(root));

    it('exactly one §6 error at one of the R-026 files naming both; non-conformant', async () => {
      const report = await validate(root);
      const found = report.violations.filter((v) => v.check === 'check.xref-unique');
      expect(found).toHaveLength(1);
      const v = found[0]!;
      expect(v.severity).toBe('error');
      expect(v.clause).toBe('§6');
      expect(path.basename(v.location.path)).toMatch(/^R-026-(first|second)\.md$/);
      expect(v.message).toContain('.cortex/compass/rules/R-026-first.md');
      expect(v.message).toContain('.cortex/compass/rules/R-026-second.md');
      expect(v.message).toContain('"R-026"');
      expect(report.conformant).toBe(false);
      // each file is individually valid under check.rule
      expect(report.violations.filter((x) => x.check === 'check.rule')).toHaveLength(0);
    });
  });

  describe('Two bugs with one id are rejected', () => {
    let root: string;
    beforeAll(() => {
      root = makeTmpFixture('xref-unique-bugs');
      writeBug(root, 'B-001-first.md', 'B-001');
      writeBug(root, 'B-001-second.md', 'B-001');
    });
    afterAll(() => cleanup(root));

    it('exactly one check.xref-unique error naming both bug files', async () => {
      const report = await validate(root);
      const found = report.violations.filter((v) => v.check === 'check.xref-unique');
      expect(found).toHaveLength(1);
      expect(found[0]!.severity).toBe('error');
      expect(found[0]!.message).toContain('.cortex/compass/bugs/B-001-first.md');
      expect(found[0]!.message).toContain('.cortex/compass/bugs/B-001-second.md');
      expect(report.violations.filter((x) => x.check === 'check.bug')).toHaveLength(0);
      expect(report.conformant).toBe(false);
    });
  });

  describe('A duplicated id never resolves to an arbitrary file', () => {
    let root: string;
    beforeAll(() => {
      root = makeTmpFixture('xref-unique-governed-by');
      writeRule(root, 'R-026-first.md', 'R-026');
      writeRule(root, 'R-026-second.md', 'R-026');
      const specPath = path.join(root, '.specflow', 'specs', 'schema', 'validator.spec.md');
      const content = fs.readFileSync(specPath, 'utf-8');
      fs.writeFileSync(specPath, content.replace('status: draft\n', 'status: draft\ngoverned_by:\n  - R-026\n'));
    });
    afterAll(() => cleanup(root));

    it('the uniqueness error AND an unresolved governed_by error at the dev spec', async () => {
      const report = await validate(root);
      expect(report.violations.filter((v) => v.check === 'check.xref-unique')).toHaveLength(1);
      const unresolved = report.violations.filter(
        (v) => v.severity === 'error' && v.location.key === 'governed_by' && v.location.path.endsWith(path.join('schema', 'validator.spec.md')),
      );
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0]!.message).toContain('R-026');
      expect(report.conformant).toBe(false);
    });
  });

  describe('Two atlas artefacts with one id are rejected (Rule 12 names atlas)', () => {
    let root: string;
    beforeAll(() => {
      root = makeTmpFixture('xref-unique-atlas');
      const decisionsDir = path.join(root, '.cortex', 'atlas', 'decisions');
      const original = fs.readFileSync(path.join(decisionsDir, '2026-07-01-sample-decision.md'), 'utf-8');
      fs.writeFileSync(path.join(decisionsDir, '2026-07-02-twin-decision.md'), original);
    });
    afterAll(() => cleanup(root));

    it('one check.xref-unique error naming both decision files', async () => {
      const report = await validate(root);
      const found = report.violations.filter((v) => v.check === 'check.xref-unique');
      expect(found).toHaveLength(1);
      expect(found[0]!.message).toContain('decisions/2026-07-01-sample-decision.md');
      expect(found[0]!.message).toContain('decisions/2026-07-02-twin-decision.md');
    });
  });
});
