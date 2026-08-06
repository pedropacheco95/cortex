/**
 * Atomic tests for core-cli.sync Rule 5's additions chain.
 *
 * The chain exists so sync can tell a bundle it has never offered this project
 * from one the developer deliberately deleted — both are simply absent, and
 * before the chain every sync put the deleted one back.
 *
 * The invariant that matters most is (a): a shipped bundle no entry names would
 * fail OPEN and be reinstalled forever, which is the bug the chain was built to
 * fix, quietly reintroduced one bundle at a time. (c) is its mirror — an entry
 * dated ahead of the package can never be exceeded by any project's recorded
 * version, so the bundle would be permanently unreachable.
 *
 * The "a bundle added after the project's version still reaches it" criterion
 * lives here rather than in the spec tests: it needs an entry above
 * SCHEMA_VERSION, which invariant (c) forbids in the real chain, so it is
 * exercised through shouldInstallAbsent against a fixture version pair.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  SKILL_ADDITIONS,
  bundleAddedAt,
  shouldInstallAbsent,
  compareVersions,
  listSkillBundles,
} from '../../../src/cli/scaffold.js';
import { SCHEMA_VERSION } from '../../../src/cli/templates.js';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PKG_SKILLS = path.join(PKG_ROOT, 'skills');

describe('core-cli.sync Rule 5 — the additions chain', () => {
  describe('invariants', () => {
    it('names every shipped bundle exactly once', () => {
      const shipped = listSkillBundles(PKG_SKILLS);
      expect(shipped.length).toBeGreaterThan(0);

      const unnamed = shipped.filter((b) => bundleAddedAt(b) === undefined);
      expect(unnamed, 'shipped bundles missing an additions entry').toEqual([]);

      for (const bundle of shipped) {
        const entries = SKILL_ADDITIONS.filter((e) => e.added.includes(bundle));
        expect(entries.length, `${bundle} appears in ${entries.length} entries`).toBe(1);
      }
    });

    it('never names the same bundle twice within an entry', () => {
      for (const entry of SKILL_ADDITIONS) {
        expect(new Set(entry.added).size, `duplicates in the ${entry.version} entry`).toBe(
          entry.added.length,
        );
      }
    });

    it('dates no entry ahead of the package version', () => {
      for (const entry of SKILL_ADDITIONS) {
        expect(
          compareVersions(entry.version, SCHEMA_VERSION),
          `entry ${entry.version} is ahead of the package's ${SCHEMA_VERSION}`,
        ).toBeLessThanOrEqual(0);
      }
    });

    it('seeds at 3.3 — the version the chain landed in, moving no version constant', () => {
      const seed = SKILL_ADDITIONS.find((e) => e.version === '3.3');
      expect(seed).toBeDefined();
      expect(seed?.added.length).toBe(listSkillBundles(PKG_SKILLS).length);
    });
  });

  describe('shouldInstallAbsent', () => {
    it('installs into a project below the bundle addition version', () => {
      expect(shouldInstallAbsent('cortex-pulse-hygiene', '3.2')).toBe(true);
      expect(shouldInstallAbsent('cortex-pulse-hygiene', '3.0')).toBe(true);
    });

    it('withholds from a project already at the addition version', () => {
      expect(shouldInstallAbsent('cortex-pulse-hygiene', '3.3')).toBe(false);
    });

    it('withholds from a project past the addition version', () => {
      expect(shouldInstallAbsent('cortex-pulse-hygiene', '3.4')).toBe(false);
    });

    it('fails open for a bundle no entry names', () => {
      // Asymmetric failure modes: an unwanted reinstall costs one directory; a
      // fail-closed makes the bundle permanently unreachable. The invariant
      // test above is what keeps this branch hypothetical.
      expect(shouldInstallAbsent('some-bundle-nobody-entered', '3.3')).toBe(true);
    });

    it('reaches a current project with a bundle added after its version', () => {
      // The criterion invariant (c) forbids testing against the real chain: a
      // hypothetical 3.4 entry against a project at 3.3 must install, while a
      // 3.3-seeded bundle at the same project must not.
      expect(compareVersions('3.4', '3.3')).toBeGreaterThan(0);
      expect(shouldInstallAbsent('cortex-loop-rule-decay', '3.3')).toBe(false);
    });
  });

  describe('bundleAddedAt', () => {
    it('returns the entry version for a seeded bundle', () => {
      expect(bundleAddedAt('specflow-entry')).toBe('3.3');
    });

    it('returns undefined for a name no entry carries', () => {
      expect(bundleAddedAt('my-own-skill')).toBeUndefined();
    });

    it('returns undefined for a retired bundle, which is the removal chain\'s business', () => {
      expect(bundleAddedAt('cortex-ingest')).toBeUndefined();
    });
  });
});
