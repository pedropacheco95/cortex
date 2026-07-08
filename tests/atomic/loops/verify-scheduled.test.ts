/**
 * Atomic tests — loops.verify-scheduled (spec Acceptance Criteria as labelled
 * describes, plus path-convention matching for both §3 leaf shapes and the
 * deferral-detection atomics). Sandboxed tmp fixture projects; the loop is
 * read-only beyond its report.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import {
  runVerifyScheduled,
  testCandidatePaths,
  notesSection,
  hasDeclaredDeferral,
  scanScenarioCovers,
  VERIFICATION_REPORT_FILE,
  DEFERRAL_PATTERNS,
} from '../../../src/loops/verify-scheduled.js';

const TEST_TIMEOUT = 30_000;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`verify-loop-${label}`);
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

function writeAt(root: string, rel: string, content: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

function makeProject(label: string): string {
  const root = tmp(label);
  fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
  writeAt(root, '.cortex/cortex.config.json', JSON.stringify({ schemaVersion: '1.0' }, null, 2) + '\n');
  return root;
}

function devSpec(id: string, implementsPath: string, notes?: string): string {
  return [
    '---',
    `id: ${id}`,
    'status: draft',
    `implements: ${implementsPath}`,
    '---',
    '',
    `# ${id}`,
    '',
    '## Rules',
    '',
    '1. Rule one.',
    ...(notes !== undefined ? ['', '## Notes', '', notes] : []),
    '',
  ].join('\n');
}

function bizSpec(id: string, notes?: string): string {
  return [
    '---',
    `id: ${id}`,
    'status: draft',
    'implemented_by: []',
    '---',
    '',
    `# ${id}`,
    '',
    '## Outcome',
    '',
    'The outcome.',
    ...(notes !== undefined ? ['', '## Notes', '', notes] : []),
    '',
  ].join('\n');
}

function scenarioSpec(name: string, covers: string[]): string {
  return ['---', `name: ${name}`, 'covers:', ...covers.map((c) => `  - ${c}`), '---', '', `# ${name}`, ''].join('\n');
}

function report(root: string): string {
  return fs.readFileSync(path.join(root, '.cortex', 'pulse', VERIFICATION_REPORT_FILE), 'utf-8');
}

// ===========================================================================
// §3 path conventions — both leaf shapes (atomic)
// ===========================================================================
describe('Path-convention matching (schema §3, capability level optional §2.1)', () => {
  it('a domain-level leaf yields one candidate per layer', () => {
    expect(testCandidatePaths('atomic', ['loops'], 'bug-triage')).toEqual(['tests/atomic/loops/bug-triage.test.ts']);
  });

  it('a capability-level leaf yields both shapes: mirrored and domain-level', () => {
    expect(testCandidatePaths('spec', ['core', 'auth'], 'login')).toEqual([
      'tests/spec/core/auth/login.test.ts',
      'tests/spec/core/login.test.ts',
    ]);
  });

  it('a capability-level leaf is covered by EITHER shape on disk', async () => {
    const rootA = makeProject('shape-mirrored');
    writeAt(rootA, '.specflow/specs-business/d/o.business.md', bizSpec('d.o'));
    writeAt(rootA, '.specflow/specs/d/c/l.spec.md', devSpec('d.c.l', '../../../specs-business/d/o.business.md'));
    writeAt(rootA, 'tests/atomic/d/c/l.test.ts', '// t');
    writeAt(rootA, 'tests/spec/d/c/l.test.ts', '// t');
    writeAt(rootA, 'tests/journey/d/o.test.ts', '// t');
    writeAt(rootA, 'tests/scenario/specs/s.md', scenarioSpec('s', ['d.o']));
    await runVerifyScheduled(rootA);
    expect(report(rootA)).toContain('All specs carry their owed tests.');

    const rootB = makeProject('shape-domain');
    writeAt(rootB, '.specflow/specs-business/d/o.business.md', bizSpec('d.o'));
    writeAt(rootB, '.specflow/specs/d/c/l.spec.md', devSpec('d.c.l', '../../../specs-business/d/o.business.md'));
    writeAt(rootB, 'tests/atomic/d/l.test.ts', '// t');
    writeAt(rootB, 'tests/spec/d/l.test.ts', '// t');
    writeAt(rootB, 'tests/journey/d/o.test.ts', '// t');
    writeAt(rootB, 'tests/scenario/specs/s.md', scenarioSpec('s', ['d.o']));
    await runVerifyScheduled(rootB);
    expect(report(rootB)).toContain('All specs carry their owed tests.');
  }, TEST_TIMEOUT);
});

// ===========================================================================
// AC — Covered spec is silent, uncovered is named
// ===========================================================================
describe('Covered spec is silent, uncovered is named', () => {
  it('names c.d\'s two missing paths and not a.b', async () => {
    const root = makeProject('covered-uncovered');
    writeAt(root, '.specflow/specs-business/a/out.business.md', bizSpec('a.out'));
    writeAt(root, '.specflow/specs/a/b.spec.md', devSpec('a.b', '../../specs-business/a/out.business.md'));
    writeAt(root, '.specflow/specs/c/d.spec.md', devSpec('c.d', '../../specs-business/a/out.business.md'));
    writeAt(root, 'tests/atomic/a/b.test.ts', '// t');
    writeAt(root, 'tests/spec/a/b.test.ts', '// t');
    writeAt(root, 'tests/journey/a/out.test.ts', '// t');
    writeAt(root, 'tests/scenario/specs/s.md', scenarioSpec('s', ['a.out']));

    await runVerifyScheduled(root);
    const body = report(root);
    expect(body).toContain('`c.d` (`.specflow/specs/c/d.spec.md`): missing `tests/atomic/c/d.test.ts`, `tests/spec/c/d.test.ts`');
    expect(body).not.toMatch(/`a\.b` \(/);
  }, TEST_TIMEOUT);
});

// ===========================================================================
// AC — Journey and scenario coverage checked per business spec
// ===========================================================================
describe('Journey and scenario coverage checked per business spec', () => {
  it('a business spec with no journey test and absent from every covers: gets both gaps reported', async () => {
    const root = makeProject('biz-gaps');
    writeAt(root, '.specflow/specs-business/x/y.business.md', bizSpec('x.y'));
    await runVerifyScheduled(root);
    const body = report(root);
    expect(body).toContain('`x.y` (`.specflow/specs-business/x/y.business.md`)');
    expect(body).toContain('missing journey test `tests/journey/x/y.test.ts`');
    expect(body).toContain('absent from every scenario `covers:` (§8.2 completeness)');
  }, TEST_TIMEOUT);

  it('scanScenarioCovers reads covers: lists from tests/scenario/specs/*.md', () => {
    const root = makeProject('covers');
    writeAt(root, 'tests/scenario/specs/one.md', scenarioSpec('one', ['a.b', 'c.d']));
    writeAt(root, 'tests/scenario/specs/two.md', scenarioSpec('two', ['e.f']));
    expect([...scanScenarioCovers(root)].sort()).toEqual(['a.b', 'c.d', 'e.f']);
  });
});

// ===========================================================================
// Deferral detection (Rule 3) — atomics
// ===========================================================================
describe('Deferral detection (journey-deferral convention in Notes)', () => {
  it('both documented shapes match: "Journey-layer tests deferred to v1.1" and "deferred to v1.1"', () => {
    expect(hasDeclaredDeferral('## Notes\n\n- Journey-layer tests deferred to v1.1 (see elsewhere).\n')).toBe(true);
    expect(hasDeclaredDeferral('## Notes\n\n- Visual behaviour: journey tier, deferred to v1.1 pending the runner.\n')).toBe(true);
    expect(DEFERRAL_PATTERNS.some((re) => re.test('journey layer tests deferred'))).toBe(true);
  });

  it('the convention only counts inside the Notes section', () => {
    expect(hasDeclaredDeferral('## Intent\n\ndeferred to v1.1\n')).toBe(false);
    expect(hasDeclaredDeferral('no notes heading, deferred to v1.1')).toBe(false);
    expect(notesSection('## Notes\n\nnote body\n\n## Later\n\nx')).toContain('note body');
    expect(notesSection('## Notes\n\nnote body\n\n## Later\n\nx')).not.toContain('x');
  });
});

// ===========================================================================
// AC — Declared deferrals separated
// ===========================================================================
describe('Declared deferrals separated', () => {
  it('a dev spec whose Notes carry the journey-deferral convention puts its journey gap under "Deferred by decision"', async () => {
    const root = makeProject('deferred');
    writeAt(root, '.specflow/specs-business/h/safe.business.md', bizSpec('h.safe'));
    writeAt(
      root,
      '.specflow/specs/h/hook.spec.md',
      devSpec('h.hook', '../../specs-business/h/safe.business.md', '- Journey-layer tests deferred to v1.1 (see hooks.session-start Notes).'),
    );
    writeAt(root, 'tests/atomic/h/hook.test.ts', '// t');
    writeAt(root, 'tests/spec/h/hook.test.ts', '// t');
    writeAt(root, 'tests/scenario/specs/s.md', scenarioSpec('s', ['h.safe']));
    // No journey test on purpose.

    await runVerifyScheduled(root);
    const body = report(root);
    const deferredSection = body.split('## Deferred by decision')[1] as string;
    expect(deferredSection).toContain('`h.safe`');
    expect(deferredSection).toContain('tests/journey/h/safe.test.ts');
    // NOT under the genuine business gaps.
    const gapsSection = (body.split('## Business spec gaps')[1] as string).split('## Deferred by decision')[0] as string;
    expect(gapsSection).not.toContain('missing journey test');
    expect(gapsSection).toContain('Every business spec carries its journey test and scenario coverage.');
  }, TEST_TIMEOUT);

  it('a business spec\'s own Notes can declare the deferral too', async () => {
    const root = makeProject('deferred-biz');
    writeAt(root, '.specflow/specs-business/h/safe.business.md', bizSpec('h.safe', 'Journey-layer tests deferred to v1.1.'));
    writeAt(root, 'tests/scenario/specs/s.md', scenarioSpec('s', ['h.safe']));
    await runVerifyScheduled(root);
    const body = report(root);
    expect((body.split('## Deferred by decision')[1] as string)).toContain('`h.safe`');
  }, TEST_TIMEOUT);
});

// ===========================================================================
// AC — Clean fixture is a stated clean run
// ===========================================================================
describe('Clean fixture is a stated clean run', () => {
  it('full coverage yields "All specs carry their owed tests.", exit 0', async () => {
    const root = makeProject('clean');
    writeAt(root, '.specflow/specs-business/a/out.business.md', bizSpec('a.out'));
    writeAt(root, '.specflow/specs/a/b.spec.md', devSpec('a.b', '../../specs-business/a/out.business.md'));
    writeAt(root, 'tests/atomic/a/b.test.ts', '// t');
    writeAt(root, 'tests/spec/a/b.test.ts', '// t');
    writeAt(root, 'tests/journey/a/out.test.ts', '// t');
    writeAt(root, 'tests/scenario/specs/s.md', scenarioSpec('s', ['a.out']));
    expect(await runVerifyScheduled(root)).toBe(0);
    const body = report(root);
    expect(body).toContain('kind: pulse-verification-report');
    expect(body).toContain('All specs carry their owed tests.');
    expect(body).toContain('No declared deferrals.');
  }, TEST_TIMEOUT);
});

// ===========================================================================
// AC — Only the report is written
// ===========================================================================
describe('Only the report is written', () => {
  it('a run touches only pulse/verification-report.md', async () => {
    const root = makeProject('blast');
    writeAt(root, '.specflow/specs-business/x/y.business.md', bizSpec('x.y'));
    writeAt(root, '.specflow/specs/c/d.spec.md', devSpec('c.d', '../../specs-business/x/y.business.md'));
    const before = snapshotTree(root);
    expect(await runVerifyScheduled(root)).toBe(0);
    const after = snapshotTree(root);
    const allowed = path.join('.cortex', 'pulse', VERIFICATION_REPORT_FILE);
    const keys = new Set([...before.keys(), ...after.keys()]);
    for (const key of keys) {
      if (key === allowed) continue;
      expect(after.get(key), `unexpected change to ${key}`).toBe(before.get(key));
    }
    expect(after.has(allowed)).toBe(true);
  }, TEST_TIMEOUT);
});
