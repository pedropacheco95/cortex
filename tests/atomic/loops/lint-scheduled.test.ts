/**
 * Atomic tests — loops.lint-scheduled (spec Acceptance Criteria as labelled
 * describes, plus the spec-tree path partition). The loop consumes the real
 * `validate()` over copies of the conformant fixture project; sandboxed tmp
 * dirs only.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import {
  runLintScheduled,
  isSpecTreeViolation,
  violationRelPath,
  LINT_REPORT_FILE,
} from '../../../src/loops/lint-scheduled.js';
import type { Violation } from '../../../src/schema/types.js';

const TEST_TIMEOUT = 30_000;
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const VALID_FIXTURE = path.join(PKG_ROOT, 'tests', 'fixtures', 'valid');

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`lint-loop-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function makeFixtureCopy(label: string): string {
  const root = tmp(label);
  copyDir(VALID_FIXTURE, root);
  return root;
}

function report(root: string): string {
  return fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', LINT_REPORT_FILE), 'utf-8');
}

function violation(p: string): Violation {
  return { severity: 'error', check: 'check.x', clause: '§4.6', location: { path: p }, message: 'm' };
}

// ===========================================================================
// Rule 2 — the spec-tree path partition (atomic)
// ===========================================================================
describe('Spec-tree relevance partition (Rule 2)', () => {
  const root = '/proj';
  it('paths under .specflow/specs/, .specflow/specs-business/, and tests/scenario/specs/ are spec-tree-relevant', () => {
    expect(isSpecTreeViolation(root, violation('/proj/.specflow/specs/a/b.spec.md'))).toBe(true);
    expect(isSpecTreeViolation(root, violation('/proj/.specflow/specs-business/a/b.business.md'))).toBe(true);
    expect(isSpecTreeViolation(root, violation('/proj/tests/scenario/specs/s.md'))).toBe(true);
    expect(isSpecTreeViolation(root, violation('.specflow/specs/_index.md'))).toBe(true);
  });
  it('everything else is not (including tests/atomic and .cortex)', () => {
    expect(isSpecTreeViolation(root, violation('/proj/.cortex/anatomy/files.md'))).toBe(false);
    expect(isSpecTreeViolation(root, violation('/proj/tests/atomic/a/b.test.ts'))).toBe(false);
    expect(isSpecTreeViolation(root, violation('/proj/specs-extra/x.md'))).toBe(false);
    expect(isSpecTreeViolation(root, violation('/proj/CLAUDE.md'))).toBe(false);
  });
  it('violationRelPath keeps relative paths and relativises absolute ones', () => {
    expect(violationRelPath('/proj', '/proj/.specflow/specs/a.spec.md')).toBe('.specflow/specs/a.spec.md');
    expect(violationRelPath('/proj', '.specflow/specs/a.spec.md')).toBe('.specflow/specs/a.spec.md');
  });
});

// ===========================================================================
// AC — Clean tree is a stated clean run
// ===========================================================================
describe('Clean tree is a stated clean run', () => {
  it('a conformant fixture yields "Spec tree structurally sound." with zero-counts, exit 0', async () => {
    const root = makeFixtureCopy('clean');
    expect(await runLintScheduled(root)).toBe(0);
    const body = report(root);
    expect(body).toContain('kind: pulse-lint-report');
    expect(body).toContain('loop: cortex-loop-specflow-lint');
    expect(body).toContain('Spec tree structurally sound.');
    expect(body).toContain('0 error(s), 0 warning(s)');
  }, TEST_TIMEOUT);
});

// ===========================================================================
// AC — Violations grouped with location and clause
// ===========================================================================
describe('Violations grouped with location and clause', () => {
  it('a broken implements: and a missing _overview.md are grouped under their checks, each with file and clause, exit 0', async () => {
    const root = makeFixtureCopy('dirty');
    // Break the implements: link.
    const specPath = path.join(root, '.specflow', 'specs', 'schema', 'validator.spec.md');
    fs.writeFileSync(
      specPath,
      fs.readFileSync(specPath, 'utf-8').replace(
        'implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md',
        'implements: ../../specs-business/schema/nonexistent.business.md',
      ),
      'utf-8',
    );
    // Remove an overview.
    fs.rmSync(path.join(root, '.specflow', 'specs', 'schema', '_overview.md'));

    expect(await runLintScheduled(root)).toBe(0);
    const body = report(root);
    expect(body).toContain('## check.dev-spec');
    expect(body).toContain('## check.overview-present');
    expect(body).toContain('`.specflow/specs/schema/validator.spec.md`');
    expect(body).toMatch(/does not resolve/);
    expect(body).toContain('§4.6');
    expect(body).toMatch(/missing _overview\.md/);
    expect(body).not.toContain('Spec tree structurally sound.');
  }, TEST_TIMEOUT);
});

// ===========================================================================
// AC — Only the report is written
// ===========================================================================
describe('Only the report is written', () => {
  it('a run touches only pulse/reports/lint.md', async () => {
    const root = makeFixtureCopy('blast');
    const before = snapshotTree(root);
    expect(await runLintScheduled(root)).toBe(0);
    const after = snapshotTree(root);
    const allowed = path.join('.cortex', 'pulse', 'reports', LINT_REPORT_FILE);
    const keys = new Set([...before.keys(), ...after.keys()]);
    for (const key of keys) {
      if (key === allowed) continue;
      expect(after.get(key), `unexpected change to ${key}`).toBe(before.get(key));
    }
    expect(after.has(allowed)).toBe(true);
  }, TEST_TIMEOUT);
});

// ===========================================================================
// Rule 2 — pointer to non-spec violations
// ===========================================================================
describe('Non-spec violations get a one-line pointer, not a listing', () => {
  it('a violation outside the spec trees is counted in the pointer line only', async () => {
    const root = makeFixtureCopy('pointer');
    // Break something outside the spec trees: an invalid pulse artefact header.
    fs.writeFileSync(path.join(root, '.cortex', 'pulse', 'rogue.md'), 'no frontmatter here\n', 'utf-8');
    expect(await runLintScheduled(root)).toBe(0);
    const body = report(root);
    expect(body).toContain('Spec tree structurally sound.');
    expect(body).toMatch(/violation\(s\) elsewhere in the project .* run `cortex validate` for the full report/);
  }, TEST_TIMEOUT);
});
