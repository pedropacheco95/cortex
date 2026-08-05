/**
 * Spec tests for the discipline bundles' packaging ACs:
 *   - discipline.verification-skill "Package and local copies are identical" —
 *     a fresh `cortex init` with a fake home installs the
 *     `verification-before-completion` bundle, and the package copy is
 *     byte-identical to the project-local `.claude/skills/` copy;
 *   - discipline.hardening-convention "It is not a skill, and is not
 *     installed" — `skills/_conventions/` carries no SKILL.md, so the shared
 *     `listSkillBundles` enumeration skips it and it never lands in a
 *     project's .claude/skills/.
 *
 * Init runs in a fresh tmp project with an injected fake home dir; the real
 * ~/.claude is never touched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { init } from '../../../src/cli/init.js';
import { listSkillBundles } from '../../../src/cli/scaffold.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const };

// tests/spec/discipline/ → package root is three levels up.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PKG_SKILLS = path.join(PKG_ROOT, 'skills');
const LOCAL_SKILLS = path.join(PKG_ROOT, '.claude', 'skills');

/** Bundles this domain ships that are deliberately NOT `specflow-*` prefixed. */
const DISCIPLINE_BUNDLES = ['verification-before-completion'];

/** Repo-side reference directories under skills/ that carry no SKILL.md and
 *  are therefore NOT bundles: never installed, never synced, never counted. */
const REFERENCE_DIRS = ['_conventions'];

/** All file paths under dir, relative to dir, sorted. */
function walk(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

function expectIdentical(a: string, b: string, label: string): void {
  const aFiles = walk(a);
  expect(walk(b), `${label} file set`).toEqual(aFiles);
  for (const rel of aFiles) {
    expect(
      fs.readFileSync(path.join(a, rel)).equals(fs.readFileSync(path.join(b, rel))),
      `${label}/${rel} differs`,
    ).toBe(true);
  }
}

describe('AC: the discipline bundles install from a fresh init', () => {
  let root: string;
  let home: string;

  beforeAll(async () => {
    root = makeTmpDir('discipline-install-root');
    home = makeTmpDir('discipline-install-home');
    await init(root, { home, noLlm: true, yes: true, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  for (const name of DISCIPLINE_BUNDLES) {
    it(`installs ${name} with its SKILL.md, byte-identical to the package`, () => {
      const installed = path.join(root, '.claude', 'skills', name);
      expect(fs.existsSync(path.join(installed, 'SKILL.md')), `${name}/SKILL.md`).toBe(true);
      expectIdentical(path.join(PKG_SKILLS, name), installed, name);
    });
  }

  for (const name of REFERENCE_DIRS) {
    it(`does NOT install ${name} — it carries no SKILL.md, so it is not a bundle`, () => {
      expect(fs.existsSync(path.join(PKG_SKILLS, name, 'SKILL.md')), `${name} must not be a skill`).toBe(false);
      expect(
        fs.existsSync(path.join(root, '.claude', 'skills', name)),
        `${name} must not land in a project's .claude/skills/`,
      ).toBe(false);
    });
  }

  it('every installed directory is a real bundle — each carries a SKILL.md', () => {
    for (const name of fs.readdirSync(path.join(root, '.claude', 'skills'))) {
      expect(
        fs.existsSync(path.join(root, '.claude', 'skills', name, 'SKILL.md')),
        `${name} was installed without a SKILL.md`,
      ).toBe(true);
    }
  });

  it('listSkillBundles is the shared enumeration, and it excludes SKILL.md-less dirs', () => {
    const bundles = listSkillBundles(PKG_SKILLS);
    for (const name of REFERENCE_DIRS) expect(bundles).not.toContain(name);
    for (const name of DISCIPLINE_BUNDLES) expect(bundles).toContain(name);
    expect(bundles).toEqual(fs.readdirSync(path.join(root, '.claude', 'skills')).sort());
  });
});

describe('AC: package and project-local discipline copies are byte-identical', () => {
  for (const name of DISCIPLINE_BUNDLES) {
    it(`skills/${name}/ matches .claude/skills/${name}/ with no strays on either side`, () => {
      const local = path.join(LOCAL_SKILLS, name);
      expect(fs.existsSync(local), `local ${name} missing — the mirror is test-enforced`).toBe(true);
      expectIdentical(path.join(PKG_SKILLS, name), local, name);
    });
  }
});
