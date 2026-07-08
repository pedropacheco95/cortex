import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { validate } from '../../../src/schema/validate.js';
import { SUPPORTED_MAJOR, SUPPORTED_MINOR, SUPPORTED_VERSION } from '../../../src/schema/version.js';

// tests/spec/schema/ → repo root is three levels up.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const VALID_FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'valid');

const tmpDirs: string[] = [];

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** A copy of the (already 2.0) valid fixture with its config schemaVersion set to `version`. */
function fixtureAtVersion(version: string): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-v2-'));
  tmpDirs.push(tmp);
  copyDir(VALID_FIXTURE, tmp);
  const cfgPath = path.join(tmp, '.cortex', 'cortex.config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  cfg.schemaVersion = version;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  return tmp;
}

afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('schema.version-2 — the config and validator both read 2.0', () => {
  it('version.ts declares supportedMajor 2 / supportedMinor 0', () => {
    expect(SUPPORTED_MAJOR).toBe(2);
    expect(SUPPORTED_MINOR).toBe(0);
    expect(SUPPORTED_VERSION).toBe('2.0');
  });

  it('the migrated valid fixture config reads "2.0"', () => {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(VALID_FIXTURE, '.cortex', 'cortex.config.json'), 'utf-8'),
    );
    expect(cfg.schemaVersion).toBe('2.0');
  });
});

describe('schema.version-2 — the re-rooted validator passes green at 2.0 against the moved trees', () => {
  it('validate over the .specflow/-rooted fixture reports zero errors and declares 2.0', async () => {
    const report = await validate(VALID_FIXTURE);
    expect(report.schemaVersion).toBe('2.0');
    expect(report.counts.error).toBe(0);
    expect(report.conformant).toBe(true);
  });
});

describe('schema.version-2 — version-gate behaviour (schema §10.3)', () => {
  it('a higher MAJOR (3.0) short-circuits to exactly one check.config error', async () => {
    const report = await validate(fixtureAtVersion('3.0'));
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]!.check).toBe('check.config');
    expect(report.violations[0]!.severity).toBe('error');
  });

  it('a lower MAJOR (1.0) short-circuits with one error recommending cortex migrate', async () => {
    const report = await validate(fixtureAtVersion('1.0'));
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]!.check).toBe('check.config');
    expect(report.violations[0]!.severity).toBe('error');
    expect(report.violations[0]!.message).toMatch(/migrate/i);
  });

  it('a higher MINOR (2.7) yields one warning then proceeds (forward tolerance)', async () => {
    const report = await validate(fixtureAtVersion('2.7'));
    const configWarnings = report.violations.filter(
      (v) => v.check === 'check.config' && v.severity === 'warning',
    );
    expect(configWarnings).toHaveLength(1);
    expect(configWarnings[0]!.message).toMatch(/minor/i);
    // It did not short-circuit: the rest of the tree still validated cleanly.
    expect(report.counts.error).toBe(0);
    expect(report.conformant).toBe(true);
  });
});
