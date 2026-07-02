/**
 * Atomic tests — check.business-status (§4.7 Status Policy A, warning):
 * a business spec whose `implemented_by:` dev specs are ALL implemented but
 * whose own status lags fires a warning; synced and partially-implemented
 * states stay silent. Runs on sandboxed copies of the valid fixture.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { checkBusinessStatus } from '../../../src/schema/checks/bizspec.js';
import { validate } from '../../../src/schema/validate.js';

const VALID_FIXTURE = path.resolve('/Users/pedropacheco1/Documents/Projetos/cortex/tests/fixtures/valid');
const BIZ_REL = path.join('specs-business', 'schema', 'contributor-trusts-project-knowledge.business.md');
const DEV_REL = path.join('specs', 'schema', 'validator.spec.md');

let counter = 0;
const dirs: string[] = [];

function makeFixtureCopy(label: string): string {
  const dir = path.join(os.tmpdir(), `cortex-bizstatus-${label}-${Date.now()}-${counter++}`);
  fs.cpSync(VALID_FIXTURE, dir, { recursive: true });
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length > 0) fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
});

function setStatus(root: string, rel: string, from: string, to: string): void {
  const p = path.join(root, rel);
  const content = fs.readFileSync(p, 'utf-8');
  fs.writeFileSync(p, content.replace(`status: ${from}`, `status: ${to}`), 'utf-8');
}

describe('check.business-status: lagging status fires a warning', () => {
  it('all implemented_by implemented + business status draft → one §4.7 warning at status', async () => {
    const root = makeFixtureCopy('lagging');
    setStatus(root, DEV_REL, 'draft', 'implemented'); // dev spec done, biz spec lags

    const violations = await checkBusinessStatus(root);
    expect(violations.length).toBe(1);
    const v = violations[0]!;
    expect(v.check).toBe('check.business-status');
    expect(v.severity).toBe('warning');
    expect(v.clause).toBe('§4.7');
    expect(v.location.path).toBe(path.join(root, BIZ_REL));
    expect(v.location.key).toBe('status');
    expect(v.message).toMatch(/lags/i);
  });

  it('is registered in validate(): the warning surfaces in a full report', async () => {
    const root = makeFixtureCopy('registered');
    setStatus(root, DEV_REL, 'draft', 'implemented');

    const report = await validate(root);
    const hits = report.violations.filter((v) => v.check === 'check.business-status');
    expect(hits.length).toBe(1);
    expect(hits[0]!.severity).toBe('warning');
    // Policy A is a warning, never an error: the report stays conformant.
    expect(report.conformant).toBe(true);
  });
});

describe('check.business-status: synced status is silent', () => {
  it('all implemented_by implemented + business status implemented → no violation', async () => {
    const root = makeFixtureCopy('synced');
    setStatus(root, DEV_REL, 'draft', 'implemented');
    setStatus(root, BIZ_REL, 'draft', 'implemented');

    const violations = await checkBusinessStatus(root);
    expect(violations).toEqual([]);
  });
});

describe('check.business-status: partially-implemented implementers are silent', () => {
  it('one implemented + one draft dev spec → no violation', async () => {
    const root = makeFixtureCopy('partial');
    setStatus(root, DEV_REL, 'draft', 'implemented');
    // A second, still-draft implementer alongside the implemented one.
    const secondDev = path.join(root, 'specs', 'schema', 'reporter.spec.md');
    fs.writeFileSync(
      secondDev,
      `---
id: schema.reporter
status: draft
implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md
---

# Schema Reporter

Renders validation reports.
`,
      'utf-8',
    );
    const bizPath = path.join(root, BIZ_REL);
    fs.writeFileSync(
      bizPath,
      fs
        .readFileSync(bizPath, 'utf-8')
        .replace(
          '  - ../../specs/schema/validator.spec.md',
          '  - ../../specs/schema/validator.spec.md\n  - ../../specs/schema/reporter.spec.md',
        ),
      'utf-8',
    );

    const violations = await checkBusinessStatus(root);
    expect(violations).toEqual([]);
  });

  it('no dev spec implemented at all → no violation (baseline fixture)', async () => {
    const root = makeFixtureCopy('none');
    const violations = await checkBusinessStatus(root);
    expect(violations).toEqual([]);
  });

  it('unresolvable implemented_by entry → silent here (check.business-spec owns resolution errors)', async () => {
    const root = makeFixtureCopy('unresolved');
    setStatus(root, DEV_REL, 'draft', 'implemented');
    const bizPath = path.join(root, BIZ_REL);
    fs.writeFileSync(
      bizPath,
      fs
        .readFileSync(bizPath, 'utf-8')
        .replace(
          '  - ../../specs/schema/validator.spec.md',
          '  - ../../specs/schema/validator.spec.md\n  - ../../specs/schema/missing.spec.md',
        ),
      'utf-8',
    );

    const violations = await checkBusinessStatus(root);
    expect(violations).toEqual([]);
  });
});
