import { describe, it, expect } from 'vitest';
import { SUPPORTED_VERSION } from '../../../src/schema/version.js';
import { validate } from '../../../src/schema/validate.js';
import * as path from 'path';

const VALID_FIXTURE = path.resolve('/Users/pedropacheco1/Documents/Projetos/cortex/tests/fixtures/valid');

describe('Spec-level: full validator over valid fixture', () => {
  it('valid fixture produces conformant report with 0 errors', async () => {
    const report = await validate(VALID_FIXTURE);
    expect(report.schemaVersion).toBe(SUPPORTED_VERSION);
    expect(report.conformant).toBe(true);
    expect(report.counts.error).toBe(0);
    expect(report.target).toBe(VALID_FIXTURE);
  });

  it('report has correct shape', async () => {
    const report = await validate(VALID_FIXTURE);
    expect(typeof report.schemaVersion).toBe('string');
    expect(typeof report.target).toBe('string');
    expect(typeof report.conformant).toBe('boolean');
    expect(Array.isArray(report.violations)).toBe(true);
    expect(typeof report.counts.error).toBe('number');
    expect(typeof report.counts.warning).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Wave follow-up A (2026-09-17): schema.validator Rules 12–14 end-to-end
// through validate() — the R-026 pair, the B-001 pair, a disagreeing H1 and a
// four-of-five bug index planted together; the exact set of the three new
// checks' findings is asserted, and the two new checks add nothing to a clean
// tree.
// ---------------------------------------------------------------------------
import * as fs from 'fs';
import { beforeAll, afterAll } from 'vitest';
import { makeTmpFixture, cleanup, writeRule, writeBug, writeCompassIndex, rulesDir, bugsDir } from '../../fixtures/validator-tmp.js';

describe('wave A: Rules 12–14', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmpFixture('spec-wave-a');
    writeRule(root, 'R-026-first.md', 'R-026', { h1: '# R-027 — Second rule' });
    writeRule(root, 'R-026-second.md', 'R-026');
    writeCompassIndex(rulesDir(root), '- R-001, R-026 — the rules');
    writeBug(root, 'B-001-first.md', 'B-001');
    writeBug(root, 'B-001-second.md', 'B-001');
    for (const id of ['B-002', 'B-003', 'B-004', 'B-005']) writeBug(root, `${id}-x.md`, id);
    writeCompassIndex(bugsDir(root), '- B-001–B-003 — early\n- B-005 — latest');
    const specPath = path.join(root, '.specflow', 'specs', 'schema', 'validator.spec.md');
    fs.writeFileSync(specPath, fs.readFileSync(specPath, 'utf-8').replace('status: draft\n', 'status: draft\ngoverned_by:\n  - R-026\n'));
  });
  afterAll(() => cleanup(root));

  it('the three checks report exactly the planted defects and nothing else', async () => {
    const report = await validate(root);
    const rel = (p: string) => path.relative(root, p);

    const unique = report.violations.filter((v) => v.check === 'check.xref-unique').map((v) => ({ severity: v.severity, clause: v.clause, message: v.message }));
    expect(unique).toHaveLength(2);
    const byId = Object.fromEntries(unique.map((u) => [/"([^"]+)"/.exec(u.message)![1], u]));
    expect(Object.keys(byId).sort()).toEqual(['B-001', 'R-026']);
    expect(byId['R-026']).toMatchObject({ severity: 'error', clause: '§6' });
    expect(byId['R-026']!.message).toContain('.cortex/compass/rules/R-026-first.md');
    expect(byId['R-026']!.message).toContain('.cortex/compass/rules/R-026-second.md');
    expect(byId['B-001']!.message).toContain('.cortex/compass/bugs/B-001-first.md');
    expect(byId['B-001']!.message).toContain('.cortex/compass/bugs/B-001-second.md');

    const headings = report.violations.filter((v) => v.check === 'check.compass-heading').map((v) => ({ severity: v.severity, clause: v.clause, path: rel(v.location.path), message: v.message }));
    expect(headings).toEqual([{ severity: 'warning', clause: '§4.1', path: '.cortex/compass/rules/R-026-first.md', message: 'H1 "R-027" disagrees with id "R-026"' }]);

    const completeness = report.violations.filter((v) => v.check === 'check.index-completeness').map((v) => ({ severity: v.severity, clause: v.clause, path: rel(v.location.path), message: v.message }));
    expect(completeness).toEqual([{ severity: 'warning', clause: '§7.1', path: '.cortex/compass/bugs/_index.md', message: 'index lists 4 of 5 bugs (missing: B-004)' }]);

    // Rule 12: the duplicated id resolves to nothing — the referrer reports it
    const governed = report.violations.filter((v) => v.severity === 'error' && v.location.key === 'governed_by');
    expect(governed).toHaveLength(1);
    expect(governed[0]!.message).toContain('R-026');

    // every planted file is individually valid under check.rule / check.bug
    expect(report.violations.filter((v) => v.check === 'check.rule' || v.check === 'check.bug')).toEqual([]);
    expect(report.conformant).toBe(false);
    expect(report.counts.error).toBe(3);
  });

  it('a conformant tree passes: the two new checks add nothing to the valid fixture', async () => {
    const report = await validate(VALID_FIXTURE);
    expect(report.conformant).toBe(true);
    expect(report.violations.filter((v) => v.check === 'check.compass-heading' || v.check === 'check.index-completeness' || v.check === 'check.xref-unique')).toEqual([]);
  });
});
