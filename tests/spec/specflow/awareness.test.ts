/**
 * Spec tests for specflow.cortex-awareness — the packaging ACs:
 *   - "Every bundle ships and installs": a fresh `cortex init` with a fake home
 *     installs every specflow bundle (references/ and every other
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
import { INSTALLED_MARKER_FILENAME, listSkillBundles } from '../../../src/cli/scaffold.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const };

// tests/spec/specflow/ → package root is three levels up.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PKG_SKILLS = path.join(PKG_ROOT, 'skills');
const LOCAL_SKILLS = path.join(PKG_ROOT, '.claude', 'skills');

/**
 * Every `specflow-*` bundle the package ships (spec Rule 3). Count-free name:
 * the 2026-08 superpowers-absorption round added the spine skills, and the
 * constant should not need renaming again next time it grows.
 */
const SPECFLOW_BUNDLES = [
  'specflow-brainstorm',
  'specflow-bugs',
  'specflow-deep-onboard',
  'specflow-develop',
  'specflow-entry',
  'specflow-ingest',
  'specflow-intent-reconcile',
  'specflow-lint',
  'specflow-new-project',
  'specflow-onboard-codebase',
  'specflow-plan',
  'specflow-receive-review',
  'specflow-request-review',
  'specflow-spec-editor',
  'specflow-tests',
  'specflow-viewer',
];

/** Bundles whose contract includes a references/ subdirectory. */
const WITH_REFERENCES = [
  'specflow-entry',
  'specflow-develop',
  'specflow-new-project',
  'specflow-onboard-codebase',
  'specflow-plan',
  'specflow-tests',
  'specflow-viewer',
];

/**
 * All file paths under dir, relative to dir, sorted.
 *
 * `.cortex-installed.json` is excluded: it is sync's provenance bookkeeping,
 * written into an installed copy and never present in the package bundle, and
 * `hashDirectoryContent` already excludes it from content comparison for the
 * same reason. Counting it here would make `cortex sync` — the supported way
 * to refresh this repo's own `.claude/skills/` mirror — break the very tests
 * that police the mirror.
 */
function walk(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else if (entry.name !== INSTALLED_MARKER_FILENAME) out.push(rel);
  }
  return out.sort();
}

// ---------------------------------------------------------------------------
// AC: Every specflow bundle ships and installs
// ---------------------------------------------------------------------------
describe('AC: every specflow bundle ships and installs on fresh init', () => {
  let root: string;
  let home: string;
  let result: { exitCode: number; summary: string };

  beforeAll(async () => {
    root = makeTmpDir('awareness-install-proj');
    home = makeTmpDir('awareness-install-home');
    result = await init(root, { home, noLlm: true, yes: true, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('the package ships every specflow bundle', () => {
    const shipped = fs.readdirSync(PKG_SKILLS).filter((d) => d.startsWith('specflow-')).sort();
    expect(shipped).toEqual(SPECFLOW_BUNDLES);
  });

  it('.claude/skills/ contains every specflow bundle alongside the cortex bundles', () => {
    const installedDirs = fs
      .readdirSync(path.join(root, '.claude', 'skills'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const name of SPECFLOW_BUNDLES) {
      expect(installedDirs, `missing bundle ${name}`).toContain(name);
      expect(fs.existsSync(path.join(root, '.claude', 'skills', name, 'SKILL.md')), `${name}/SKILL.md`).toBe(true);
    }
    // The cortex bundles are still there too: build-order-v3
    // step 3b added cortex-archive-ingest (and step 9 retired cortex-ingest —
    // the redirect stub it left behind was deleted on 2026-08-05 and ships as a
    // SKILL_MIGRATIONS entry, so synced projects shed it too),
    // step 5d added cortex-extract-insight, step 7 deleted
    // cortex-loop-anatomy-refresh with the anatomy deprecation, the B-009
    // final mechanism added cortex-register-tasks, and the v3.0 consolidation
    // deleted cortex-loop-skill-suggest — its lens folded into pulse-distil).
    expect(installedDirs).toContain('cortex-archive-ingest');
    expect(installedDirs).toContain('cortex-loop');
    expect(installedDirs).not.toContain('cortex-loop-skill-suggest'); // retired at v3.0
    // The eleven per-loop bundles merged into `cortex-loop` and ship as a
    // SKILL_MIGRATIONS entry, so synced projects shed them (loops.cortex-loop-bundle).
    expect(installedDirs).not.toContain('cortex-pulse-hygiene');
    // The merge must not have cost the loops their instructions: the parent
    // bundle installs with all eleven reference files intact.
    const refs = fs.readdirSync(path.join(root, '.claude', 'skills', 'cortex-loop', 'references')).sort();
    expect(refs).toHaveLength(11);
    // `_conventions/` ships in the package but carries no SKILL.md, so it is
    // not a bundle and is not installed (discipline.hardening-convention Rule 6).
    expect(installedDirs).toEqual(listSkillBundles(PKG_SKILLS));
  });

  it('every installed bundle is complete — references/ and all other bundle files intact, byte-identical to the package', () => {
    for (const name of SPECFLOW_BUNDLES) {
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

  it('every references-carrying bundle installs its references/ files', () => {
    for (const name of WITH_REFERENCES) {
      const refs = fs.readdirSync(path.join(root, '.claude', 'skills', name, 'references'));
      expect(refs.length, `${name}/references/ empty`).toBeGreaterThan(0);
    }
  });

  it('the summary installed count reflects the full packaged set (4 cortex + 16 specflow + 1 discipline = 21)', () => {
    expect(result.exitCode).toBe(0);
    const bundleCount = listSkillBundles(PKG_SKILLS).length;
    // The 2026-08 superpowers-absorption round added the Bucket-2 bundle
    // `verification-before-completion` (deliberately not `specflow-`prefixed —
    // it belongs to neither process profile). `skills/_conventions/` ships in
    // the package but is NOT a bundle (no SKILL.md) and so is not counted or
    // installed — see tests/spec/discipline/packaging.test.ts.
    expect(bundleCount).toBe(21);
    const m = /Skills installed: (\d+)/.exec(result.summary);
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBe(21);
  });
});

// ---------------------------------------------------------------------------
// AC: Package and local copies are identical
// ---------------------------------------------------------------------------
describe('AC: package and project-local specflow bundles are byte-identical', () => {
  it('every skills/specflow-*/ file matches its .claude/skills/ counterpart, with no strays on either side', () => {
    for (const name of SPECFLOW_BUNDLES) {
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
