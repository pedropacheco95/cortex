/**
 * Atomic tests for core-cli.sync Rule 6 — skill-bundle migrations (B-015).
 *
 * Retirement is a migration chain: each release that drops a bundle appends an
 * entry, and sync applies the entries in the version window it is upgrading
 * across. These cover the lookup and its two safety invariants; the removal
 * behaviour with its marker judgment is exercised through a real sync in
 * tests/spec/core-cli/sync-retirement.spec.test.ts.
 *
 * The invariant that matters most is the negative one: a directory no
 * migration names is never a candidate, so a developer's own skill is not at
 * risk from this mechanism at all.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  SKILL_MIGRATIONS,
  compareVersions,
  listSkillBundles,
  applicableSkillMigrations,
  retiredBundles,
} from '../../../src/cli/scaffold.js';
import { SCHEMA_VERSION } from '../../../src/cli/templates.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PKG_SKILLS = path.join(PKG_ROOT, 'skills');

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`retired-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function installed(root: string, ...names: string[]): void {
  for (const name of names) {
    const dir = path.join(root, '.claude', 'skills', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\n---\n\n# ${name}\n`);
  }
}

// ---------------------------------------------------------------------------
// The chain itself
// ---------------------------------------------------------------------------

describe('the migration chain is well-formed', () => {
  it('every migration declares a MAJOR.MINOR version, a non-empty removal set, and a reason', () => {
    for (const m of SKILL_MIGRATIONS) {
      expect(m.version, 'migration version must be MAJOR.MINOR').toMatch(/^\d+\.\d+$/);
      expect(m.removed.length, `migration ${m.version} removes nothing`).toBeGreaterThan(0);
      expect(m.reason.length, `migration ${m.version} has no reason`).toBeGreaterThan(0);
    }
  });

  it('no migration retires a bundle the package still ships', () => {
    const shipped = listSkillBundles(PKG_SKILLS);
    for (const m of SKILL_MIGRATIONS) {
      for (const name of m.removed) {
        expect(
          shipped,
          `migration ${m.version} retires ${name}, which the package still ships — sync would fight itself`,
        ).not.toContain(name);
      }
    }
  });

  it('no migration is dated ahead of the version this package ships', () => {
    for (const m of SKILL_MIGRATIONS) {
      expect(
        compareVersions(m.version, SCHEMA_VERSION),
        `migration ${m.version} is ahead of the package version ${SCHEMA_VERSION} — it would never apply`,
      ).toBeLessThanOrEqual(0);
    }
  });

  it('versions are unique', () => {
    const versions = SKILL_MIGRATIONS.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
  });
});

describe('compareVersions', () => {
  it('orders by MAJOR then MINOR', () => {
    expect(compareVersions('3.0', '3.3')).toBeLessThan(0);
    expect(compareVersions('3.3', '3.0')).toBeGreaterThan(0);
    expect(compareVersions('3.3', '3.3')).toBe(0);
    expect(compareVersions('2.9', '3.0')).toBeLessThan(0);
    expect(compareVersions('10.0', '9.9')).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Migrations are declarative — in force at and after their version
// ---------------------------------------------------------------------------

describe('applicableSkillMigrations is state-based, not cursor-based', () => {
  it('includes a migration at the current version', () => {
    expect(applicableSkillMigrations('3.3').map((m) => m.version)).toContain('3.3');
  });

  it('STILL includes it once the project is already at that version', () => {
    // The cursor-based reading would exclude it here. That is the trap: a
    // developer who declines the prompt once would never be offered it again,
    // because the version is written whether or not the removal happened.
    expect(applicableSkillMigrations(SCHEMA_VERSION).map((m) => m.version)).toContain('3.3');
  });

  it('excludes a migration dated ahead of the running version', () => {
    expect(applicableSkillMigrations('3.2').map((m) => m.version)).not.toContain('3.3');
  });
});

// ---------------------------------------------------------------------------
// Invariant (a): a developer's own skill is never a candidate
// ---------------------------------------------------------------------------

describe("a developer's own skill is never a candidate", () => {
  it('a directory no migration names is not returned, even across the full window', () => {
    const root = tmp('own-skill');
    installed(root, 'my-own-skill');
    expect(retiredBundles(root, ['specflow-entry'], SCHEMA_VERSION)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Invariant (b): a shipped bundle is never removed
// ---------------------------------------------------------------------------

describe('a currently-shipped bundle is never removed', () => {
  it('the shipped filter wins over a migration naming it', () => {
    const root = tmp('shipped-wins');
    const retired = SKILL_MIGRATIONS[0]?.removed[0] as string;
    installed(root, retired);
    expect(retiredBundles(root, [retired], SCHEMA_VERSION)).not.toContain(retired);
  });
});

// ---------------------------------------------------------------------------
// Applying the chain
// ---------------------------------------------------------------------------

describe('retiredBundles applies the chain against what is on disk', () => {
  it('returns a retired bundle present on disk', () => {
    const root = tmp('present');
    installed(root, 'specflow-change-router', 'specflow-entry');
    expect(retiredBundles(root, ['specflow-entry'], '3.3')).toEqual(['specflow-change-router']);
  });

  it('still returns it when the project already claims the migration version', () => {
    // The declined-once case: the orphan must stay a candidate until it is
    // actually gone, not until the version number says it should be.
    const root = tmp('declined-once');
    installed(root, 'specflow-change-router');
    expect(retiredBundles(root, ['specflow-entry'], SCHEMA_VERSION)).toEqual(['specflow-change-router']);
  });

  it('returns nothing at a version that predates the migration', () => {
    const root = tmp('too-early');
    installed(root, 'specflow-change-router');
    expect(retiredBundles(root, ['specflow-entry'], '3.2')).toEqual([]);
  });

  it('does not return a retired name that is not present on disk', () => {
    const root = tmp('absent');
    installed(root, 'specflow-entry');
    expect(retiredBundles(root, ['specflow-entry'], '3.3')).toEqual([]);
  });

  it('tolerates a project with no .claude/skills/ at all', () => {
    expect(retiredBundles(tmp('no-dir'), ['specflow-entry'], '3.3')).toEqual([]);
  });
});
