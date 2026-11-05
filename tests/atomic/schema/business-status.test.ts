/**
 * Atomic tests — check.business-status (§4.7 Status Policy A, warning):
 * a business spec whose `implemented_by:` dev specs are ALL implemented but
 * whose own status lags fires a warning; synced and partially-implemented
 * states stay silent. Runs on sandboxed copies of the valid fixture.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as os from 'os';
import { checkBusinessStatus } from '../../../src/schema/checks/bizspec.js';
import { validate } from '../../../src/schema/validate.js';

const VALID_FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'valid');
const BIZ_REL = path.join('.specflow', 'specs-business', 'schema', 'contributor-trusts-project-knowledge.business.md');
const DEV_REL = path.join('.specflow', 'specs', 'schema', 'validator.spec.md');

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
    const secondDev = path.join(root, '.specflow', 'specs', 'schema', 'reporter.spec.md');
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

describe('schema.validator Rule 16: retired', () => {
  it('a retired dev spec and business spec are valid: no status finding from either check', async () => {
    const root = makeFixtureCopy('retired-valid');
    setStatus(root, DEV_REL, 'draft', 'retired');
    setStatus(root, BIZ_REL, 'draft', 'retired');
    expect(fs.readFileSync(path.join(root, DEV_REL), 'utf-8')).toContain('status: retired');
    expect(fs.readFileSync(path.join(root, BIZ_REL), 'utf-8')).toContain('status: retired');
    const { violations } = await validate(root);
    const statusFindings = violations.filter(
      (v) => (v.check === 'check.dev-spec' || v.check === 'check.business-spec') && v.location.key === 'status',
    );
    expect(statusFindings).toEqual([]);
  });

  it('a status outside the enum is still an error', async () => {
    const root = makeFixtureCopy('bad-status');
    setStatus(root, DEV_REL, 'draft', 'withdrawn');
    const { violations } = await validate(root);
    expect(violations.some((v) => v.check === 'check.dev-spec' && v.location.key === 'status')).toBe(true);
  });

  it('a retired implementer is ignored: one implemented and one retired still lags', async () => {
    const root = makeFixtureCopy('retired-mixed');
    const second = path.join('.specflow', 'specs', 'schema', 'old.spec.md');
    fs.writeFileSync(path.join(root, second), fs.readFileSync(path.join(root, DEV_REL), 'utf-8').replace('status: draft', 'status: retired'));
    setStatus(root, DEV_REL, 'draft', 'implemented');
    setStatus(root, BIZ_REL, 'draft', 'implementing');
    const biz = path.join(root, BIZ_REL);
    fs.writeFileSync(biz, fs.readFileSync(biz, 'utf-8').replace(/^implemented_by:\n/m, 'implemented_by:\n  - ../../specs/schema/old.spec.md\n'));
    const found = await checkBusinessStatus(root);
    expect(found).toHaveLength(1);
    expect(found[0].location.path).toBe(biz);
  });

  it('a business spec with only retired implementers is not flagged', async () => {
    const root = makeFixtureCopy('retired-all');
    setStatus(root, DEV_REL, 'draft', 'retired');
    setStatus(root, BIZ_REL, 'draft', 'implementing');
    expect(await checkBusinessStatus(root)).toEqual([]);
  });

  it('a retired business spec does not lag its implemented implementers', async () => {
    const root = makeFixtureCopy('retired-biz');
    setStatus(root, DEV_REL, 'draft', 'implemented');
    setStatus(root, BIZ_REL, 'draft', 'retired');
    expect(await checkBusinessStatus(root)).toEqual([]);
  });

  it("a retired spec's dead link is still an error without specflow/", async () => {
    const root = makeFixtureCopy('retired-dead-link');
    setStatus(root, DEV_REL, 'draft', 'retired');
    const dev = path.join(root, DEV_REL);
    fs.writeFileSync(dev, fs.readFileSync(dev, 'utf-8').replace(/^implements: .*$/m, 'implements: ../../specs-business/schema/gone.business.md'));
    const { violations } = await validate(root);
    expect(violations.some((v) => v.check === 'check.dev-spec' && v.message.includes('does not resolve'))).toBe(true);
  });
});
