/**
 * Atomic tests — `schema.validator` Rule 15 (2026-10-19, schema S11):
 * `cortex validate` on a 4.0 project runs the store checks plus the
 * spec-tree checks; with both stores present, the 3.x path is unchanged.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { validate } from '../../../src/schema/validate.js';
import { run as validateRun } from '../../../src/schema/cli.js';
import { storeInit } from '../../../src/store/init.js';
import { writeStoreFile, baseFm } from '../../fixtures/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const VALID = path.join(ROOT, 'tests/fixtures/valid');
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const DEV = '.specflow/specs/schema/validator.spec.md';
const BIZ = '.specflow/specs-business/schema/contributor-trusts-project-knowledge.business.md';
const RULE = baseFm({ about: 'Keep the validator read-only', applies_when: 'The agent is about to change how the validator touches the tree it inspects', scope: ['action'], source: 'user@2026-10-19', permanence: 'stable', aliases: ['R-001'] });

function project(label: string, keepLegacy: boolean): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `cortex-v4-validate-${label}-`));
  dirs.push(d);
  fs.cpSync(VALID, d, { recursive: true });
  if (!keepLegacy) fs.rmSync(path.join(d, '.cortex'), { recursive: true, force: true });
  storeInit(d);
  writeStoreFile(d, 'world/rules/validator-read-only.md', RULE, 'Never let the validator write to the tree it inspects.\n');
  const dev = path.join(d, DEV);
  fs.writeFileSync(dev, fs.readFileSync(dev, 'utf8').replace(/\nimplements:/, '\ngoverned_by:\n  - R-001\nimplements:'));
  return d;
}

async function exitOf(root: string): Promise<number> {
  const log = console.log;
  console.log = () => {};
  try { return await validateRun([root]); } finally { console.log = log; }
}

describe('schema.validator Rule 15: a 4.0 project', () => {
  it('[SCHEMA-VALIDATOR-16] runs the store and spec-tree checks; a governed_by alias resolves', async () => {
    const root = project('ok', false);
    const report = await validate(root);
    expect(report.violations.filter((v) => v.severity === 'error'), JSON.stringify(report.violations, null, 1)).toEqual([]);
    expect(report.violations.some((v) => v.location.key === 'governed_by')).toBe(false);
    expect(await exitOf(root)).toBe(0);
  });

  it('[SCHEMA-VALIDATOR-33] a governed_by id that is no alias in cortex/ stays an error', async () => {
    const root = project('noalias', false);
    fs.rmSync(path.join(root, 'cortex/world/rules/validator-read-only.md'));
    const report = await validate(root);
    expect(report.violations.some((v) => v.location.key === 'governed_by' && v.severity === 'error')).toBe(true);
  });

  it('[SCHEMA-VALIDATOR-16] an implemented_by asymmetry is a check.xref-symmetry error, exit 1', async () => {
    const root = project('asym', false);
    const biz = path.join(root, BIZ);
    fs.writeFileSync(biz, fs.readFileSync(biz, 'utf8').replace(/implemented_by:\n(\s+- [^\n]+\n)+/, 'implemented_by: []\n'));
    const report = await validate(root);
    expect(report.violations.some((v) => v.check === 'check.xref-symmetry' && v.severity === 'error')).toBe(true);
    expect(await exitOf(root)).toBe(1);
  });

  it('[SCHEMA-VALIDATOR-16] a store file without about is a check.frontmatter error with clause S11', async () => {
    const root = project('fm', false);
    writeStoreFile(root, 'code/schema/no-about.md', { permanence: 'changing', verified: '2026-10-19 (told)', origin: 'person:user@2026-10-19' });
    const report = await validate(root);
    const hit = report.violations.find((v) => v.check === 'check.frontmatter');
    expect(hit?.severity).toBe('error');
    expect(hit?.clause).toBe('S11');
    expect(await exitOf(root)).toBe(1);
  });

  it('[SCHEMA-VALIDATOR-17] with both stores present, the 3.x path runs and no S11 violation appears', async () => {
    const root = project('both', true);
    writeStoreFile(root, 'code/schema/no-about.md', { permanence: 'changing', verified: '2026-10-19 (told)', origin: 'person:user@2026-10-19' });
    const report = await validate(root);
    expect(report.violations.some((v) => v.clause === 'S11')).toBe(false);
  });
});
