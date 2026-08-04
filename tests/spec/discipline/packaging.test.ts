/**
 * Spec tests for the discipline bundles' packaging ACs:
 *   - discipline.verification-skill "Package and local copies are identical" —
 *     a fresh `cortex init` with a fake home installs the
 *     `verification-before-completion` bundle, and the package copy is
 *     byte-identical to the project-local `.claude/skills/` copy;
 *   - discipline.hardening-convention "It is not registered as a skill" —
 *     `skills/_conventions/` ships and installs (so hardened bodies' path
 *     references resolve in installed projects) while carrying no SKILL.md.
 *
 * Init runs in a fresh tmp project with an injected fake home dir; the real
 * ~/.claude is never touched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { init } from '../../../src/cli/init.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const };

// tests/spec/discipline/ → package root is three levels up.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PKG_SKILLS = path.join(PKG_ROOT, 'skills');
const LOCAL_SKILLS = path.join(PKG_ROOT, '.claude', 'skills');

/** Bundles this domain ships that are deliberately NOT `specflow-*` prefixed. */
const DISCIPLINE_BUNDLES = ['verification-before-completion'];

/** Shipped reference directories under skills/ that carry no SKILL.md. */
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
    it(`installs the reference directory ${name}, which carries no SKILL.md`, () => {
      const installed = path.join(root, '.claude', 'skills', name);
      expect(fs.existsSync(installed), `${name} not installed`).toBe(true);
      expect(fs.existsSync(path.join(installed, 'SKILL.md')), `${name} must not be a skill`).toBe(false);
      expectIdentical(path.join(PKG_SKILLS, name), installed, name);
    });
  }

  it('the hardening convention resolves at the path hardened bodies reference', () => {
    expect(fs.existsSync(path.join(root, '.claude', 'skills', '_conventions', 'hardening.md'))).toBe(true);
  });
});

describe('AC: package and project-local discipline copies are byte-identical', () => {
  for (const name of [...DISCIPLINE_BUNDLES, ...REFERENCE_DIRS]) {
    it(`skills/${name}/ matches .claude/skills/${name}/ with no strays on either side`, () => {
      const local = path.join(LOCAL_SKILLS, name);
      expect(fs.existsSync(local), `local ${name} missing — the mirror is test-enforced`).toBe(true);
      expectIdentical(path.join(PKG_SKILLS, name), local, name);
    });
  }
});
