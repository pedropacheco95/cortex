import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  specsRoot,
  businessRoot,
  specsIndexPath,
  SPECS_REL,
  BUSINESS_REL,
} from '../../../src/paths.js';
import { checkIdMatchesPath } from '../../../src/schema/checks/specs.js';

// tests/spec/specflow/ → repo root is three levels up.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const SRC_DIR = path.join(REPO_ROOT, 'src');
const VALID_FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'valid');

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTs(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('specflow.reorg — Core discovery roots point at .specflow/ (src/paths.ts)', () => {
  it('specsRoot / businessRoot / specsIndexPath resolve under .specflow/', () => {
    expect(specsRoot('/proj')).toBe(path.join('/proj', '.specflow', 'specs'));
    expect(businessRoot('/proj')).toBe(path.join('/proj', '.specflow', 'specs-business'));
    expect(specsIndexPath('/proj')).toBe(path.join('/proj', '.specflow', 'specs', '_index.md'));
  });

  it('the relative-path constants are the hidden-namespace roots', () => {
    expect(SPECS_REL).toBe('.specflow/specs');
    expect(BUSINESS_REL).toBe('.specflow/specs-business');
  });
});

describe('specflow.reorg — the trees moved and kept their structure', () => {
  it('the migrated fixture files live under .specflow/', () => {
    expect(
      fs.existsSync(path.join(VALID_FIXTURE, '.specflow', 'specs', 'schema', 'validator.spec.md')),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          VALID_FIXTURE,
          '.specflow',
          'specs-business',
          'schema',
          'contributor-trusts-project-knowledge.business.md',
        ),
      ),
    ).toBe(true);
  });

  it('.specflow/ holds exactly the two trees and no wrapper docs', () => {
    const entries = fs.readdirSync(path.join(REPO_ROOT, '.specflow')).sort();
    expect(entries).toEqual(['specs', 'specs-business']);
  });

  it('tests/ and RULES.md remain at the project root', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'tests'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'RULES.md'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'specs'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, 'specs-business'))).toBe(false);
  });
});

describe('specflow.reorg — spec IDs are invariant under the move (Rule 2)', () => {
  it('the moved validator spec still derives id schema.validator (no id-mismatch)', () => {
    // check.id-matches-path derives the ID by stripping the tree root; a clean
    // result means .specflow/specs/schema/validator.spec.md still maps to
    // "schema.validator".
    const violations = checkIdMatchesPath(VALID_FIXTURE);
    expect(violations).toEqual([]);

    const specFile = path.join(
      VALID_FIXTURE,
      '.specflow',
      'specs',
      'schema',
      'validator.spec.md',
    );
    expect(fs.readFileSync(specFile, 'utf-8')).toContain('id: schema.validator');
  });
});

describe('specflow.reorg — the result is grep-clean (Rule 5)', () => {
  it('no Core module keeps a project-root-relative specs/ or specs-business/ constant', () => {
    // Mirrors the build-order verification grep: a quote/backtick immediately
    // followed by specs/ or specs-business/, or a path.join(<root>, 'specs') with
    // the tree name as the first segment. Excludes tests/scenario/specs (unmoved),
    // relative ../../specs* cross-references (moved with the trees), and the
    // constellation "specs:" group label (a logical id, not a path).
    const quoteAdjacent = /['"`](specs|specs-business)\//;
    const bareJoin = /join\([A-Za-z_][\w.]*,\s*['"](specs|specs-business)['"]/;

    const offenders: string[] = [];
    for (const file of walkTs(SRC_DIR)) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        // Mirror the build-order verification grep's exclusions: a line already
        // naming .specflow/ (the new root, incl. the old→new doc-comment mapping)
        // or tests/scenario/ (the unmoved test path) is not an offender.
        if (/\.specflow|tests\/scenario/.test(line)) return;
        if (quoteAdjacent.test(line) || bareJoin.test(line)) {
          offenders.push(`${path.relative(REPO_ROOT, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
