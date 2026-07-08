/**
 * Spec tests for specflow.cortex-awareness — the packaging ACs:
 *   - "All eleven ship and install": a fresh `cortex init` with a fake home
 *     installs all eleven specflow bundles (references/ and every other
 *     bundle file intact) alongside the cortex bundles, and the summary's
 *     installed count reflects the full packaged set;
 *   - "Package and local copies are identical": every file in the package
 *     skills dir's specflow bundles is byte-identical to its counterpart
 *     under .claude/skills/.
 *
 * Every init runs in a fresh tmp project with an injected fake home dir; the
 * real ~/.claude is never touched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { init } from '../../../src/cli/init.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const };

// tests/spec/specflow/ → package root is three levels up.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PKG_SKILLS = path.join(PKG_ROOT, 'skills');
const LOCAL_SKILLS = path.join(PKG_ROOT, '.claude', 'skills');

/** The eleven specflow bundles this round ships (spec Rule 3). */
const ELEVEN = [
  'specflow-bugs',
  'specflow-change-router',
  'specflow-deep-onboard',
  'specflow-develop',
  'specflow-ingest',
  'specflow-lint',
  'specflow-new-project',
  'specflow-onboard-codebase',
  'specflow-spec-editor',
  'specflow-tests',
  'specflow-viewer',
];

/** Bundles whose contract includes a references/ subdirectory. */
const WITH_REFERENCES = [
  'specflow-change-router',
  'specflow-develop',
  'specflow-new-project',
  'specflow-onboard-codebase',
  'specflow-tests',
  'specflow-viewer',
];

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

// ---------------------------------------------------------------------------
// AC: All eleven ship and install
// ---------------------------------------------------------------------------
describe('AC: all eleven specflow bundles ship and install on fresh init', () => {
  let root: string;
  let home: string;
  let result: { exitCode: number; summary: string };

  beforeAll(async () => {
    root = makeTmpDir('awareness-install-proj');
    home = makeTmpDir('awareness-install-home');
    result = await init(root, { home, noLlm: true, yes: true, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('the package ships all eleven specflow bundles', () => {
    const shipped = fs.readdirSync(PKG_SKILLS).filter((d) => d.startsWith('specflow-')).sort();
    expect(shipped).toEqual(ELEVEN);
  });

  it('.claude/skills/ contains all eleven specflow bundles alongside the cortex bundles', () => {
    const installedDirs = fs.readdirSync(path.join(root, '.claude', 'skills')).sort();
    for (const name of ELEVEN) {
      expect(installedDirs, `missing bundle ${name}`).toContain(name);
      expect(fs.existsSync(path.join(root, '.claude', 'skills', name, 'SKILL.md')), `${name}/SKILL.md`).toBe(true);
    }
    // The cortex bundles are still there too (the full 26-skill set: build-order-v3
    // step 3b added cortex-archive-ingest (cortex-ingest retired to a redirect stub)
    // and step 5d added cortex-extract-insight).
    expect(installedDirs).toContain('cortex-ingest');
    expect(installedDirs).toContain('cortex-archive-ingest');
    expect(installedDirs).toContain('cortex-pulse-hygiene');
    expect(installedDirs).toEqual(fs.readdirSync(PKG_SKILLS).sort());
  });

  it('every installed bundle is complete — references/ and all other bundle files intact, byte-identical to the package', () => {
    for (const name of ELEVEN) {
      const pkgBundle = path.join(PKG_SKILLS, name);
      const installedBundle = path.join(root, '.claude', 'skills', name);
      const pkgFiles = walk(pkgBundle);
      expect(walk(installedBundle), `${name} file set`).toEqual(pkgFiles);
      for (const rel of pkgFiles) {
        expect(
          fs.readFileSync(path.join(installedBundle, rel)).equals(fs.readFileSync(path.join(pkgBundle, rel))),
          `${name}/${rel} differs from the package`,
        ).toBe(true);
      }
    }
  });

  it('the six references-carrying bundles install their references/ files', () => {
    for (const name of WITH_REFERENCES) {
      const refs = fs.readdirSync(path.join(root, '.claude', 'skills', name, 'references'));
      expect(refs.length, `${name}/references/ empty`).toBeGreaterThan(0);
    }
  });

  it('the summary installed count reflects the full packaged set (15 cortex + 11 specflow = 26)', () => {
    expect(result.exitCode).toBe(0);
    const bundleCount = fs.readdirSync(PKG_SKILLS, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
    expect(bundleCount).toBe(26);
    const m = /Skills installed: (\d+)/.exec(result.summary);
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBe(26);
  });
});

// ---------------------------------------------------------------------------
// AC: Package and local copies are identical
// ---------------------------------------------------------------------------
describe('AC: package and project-local specflow bundles are byte-identical', () => {
  it('every skills/specflow-*/ file matches its .claude/skills/ counterpart, with no strays on either side', () => {
    for (const name of ELEVEN) {
      const pkgBundle = path.join(PKG_SKILLS, name);
      const localBundle = path.join(LOCAL_SKILLS, name);
      expect(fs.existsSync(localBundle), `local ${name} missing`).toBe(true);
      const pkgFiles = walk(pkgBundle);
      expect(walk(localBundle), `${name} file sets diverge`).toEqual(pkgFiles);
      for (const rel of pkgFiles) {
        expect(
          fs.readFileSync(path.join(pkgBundle, rel)).equals(fs.readFileSync(path.join(localBundle, rel))),
          `${name}/${rel} not byte-identical`,
        ).toBe(true);
      }
    }
  });
});
