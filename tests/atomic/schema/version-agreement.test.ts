/**
 * Regression test for B-014 (type: incomplete-rule).
 *
 * The schema version lives in three places that must agree:
 *
 *   1. `cortex-schema.md`'s header — the CONTRACT's own declaration;
 *   2. `src/schema/version.ts` — what the validator says it implements, and
 *      what `cortex validate` reports;
 *   3. `src/cli/templates.ts` `SCHEMA_VERSION` — what `cortex init` scaffolds
 *      new projects with, and what stamps the CLAUDE.md managed block.
 *
 * Nothing compared them, so they silently diverged: the document advanced
 * through 3.1, 3.2 and 3.3 while both constants stayed at 3.0. Three MINORs'
 * worth of checks were implemented and registered while the binary announced
 * an older contract and scaffolded projects against it.
 *
 * This test is the mechanism that makes the next MINOR bump fail loudly if
 * only one of the three is updated. Deliberately literal-free: it derives
 * every value, so it never needs editing on a legitimate bump — it only fires
 * when the three disagree.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { SUPPORTED_MAJOR, SUPPORTED_MINOR, SUPPORTED_VERSION } from '../../../src/schema/version.js';
import { SCHEMA_VERSION } from '../../../src/cli/templates.js';

// tests/atomic/schema/ → package root is three levels up.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCHEMA_DOC = path.join(PKG_ROOT, 'cortex-schema.md');

/** The version `cortex-schema.md` declares in its header (`**Schema version:** \`3.3\``). */
function declaredDocVersion(): string {
  const content = fs.readFileSync(SCHEMA_DOC, 'utf-8');
  const m = /^\*\*Schema version:\*\*\s*`([^`]+)`/m.exec(content);
  if (!m?.[1]) throw new Error('cortex-schema.md has no parseable "**Schema version:** `X.Y`" header line');
  return m[1];
}

describe('B-014: the three schema-version declarations agree', () => {
  it('the schema document declares a parseable MAJOR.MINOR', () => {
    expect(declaredDocVersion()).toMatch(/^\d+\.\d+$/);
  });

  it('the validator implements the version the contract declares', () => {
    expect(
      SUPPORTED_VERSION,
      'src/schema/version.ts is out of step with cortex-schema.md — bump SUPPORTED_MAJOR/SUPPORTED_MINOR when the contract gains a version',
    ).toBe(declaredDocVersion());
  });

  it('cortex init scaffolds new projects at the version the contract declares', () => {
    expect(
      SCHEMA_VERSION,
      'src/cli/templates.ts SCHEMA_VERSION is out of step with cortex-schema.md — new projects would be scaffolded against a stale contract',
    ).toBe(declaredDocVersion());
  });

  it('SUPPORTED_VERSION is the composition of its own parts', () => {
    expect(SUPPORTED_VERSION).toBe(`${SUPPORTED_MAJOR}.${SUPPORTED_MINOR}`);
  });

  it('every MINOR the document describes is at or below the supported MINOR', () => {
    // Each MINOR bump announces itself as "**3.N is a MINOR bump**". None may
    // describe a version the validator has not caught up with — that is the
    // exact shape of the B-014 lag.
    const content = fs.readFileSync(SCHEMA_DOC, 'utf-8');
    const described = [...content.matchAll(/\*\*(\d+)\.(\d+) is a MINOR bump\*\*/g)].map((m) => ({
      major: Number(m[1]),
      minor: Number(m[2]),
    }));
    expect(described.length, 'no MINOR-bump declarations found — has the header format changed?').toBeGreaterThan(0);
    for (const v of described) {
      expect(v.major, `the document describes ${v.major}.${v.minor}, a different MAJOR`).toBe(SUPPORTED_MAJOR);
      expect(
        v.minor,
        `cortex-schema.md describes ${v.major}.${v.minor} but the validator only supports ${SUPPORTED_VERSION}`,
      ).toBeLessThanOrEqual(SUPPORTED_MINOR);
    }
  });
});
