/**
 * Spec-level tests — loops.spec-drift, one describe per acceptance
 * criterion, over realistic git fixtures with backdated commits. The report
 * is `.cortex/pulse/spec-drift.md` and nothing else (tree-snapshot AC).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as path from 'path';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import {
  daysAgoIso,
  writeAt,
  gitInitRepo,
  gitCommitPathsAt,
  makeCortexProject,
  parsePulseReport,
  specMd,
} from '../../fixtures/loops-harness.js';
import { runSpecDrift } from '../../../src/loops/spec-drift.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`spec-drift-spec-${label}`);
  dirs.push(d);
  return d;
}
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

const REPORT_REL = path.join('.cortex', 'pulse', 'spec-drift.md');

function makeDriftProject(label: string): string {
  const root = tmp(label);
  makeCortexProject(root);
  gitInitRepo(root);
  writeAt(root, 'specs/a/drifted.spec.md', specMd('a.drifted', ['src/drifted.ts']));
  writeAt(root, 'src/drifted.ts', 'export {};\n');
  gitCommitPathsAt(root, ['specs/a/drifted.spec.md', 'src/drifted.ts', '.cortex/cortex.config.json'], daysAgoIso(30));
  writeAt(root, 'src/drifted.ts', 'export const changed = true;\n');
  gitCommitPathsAt(root, ['src/drifted.ts'], daysAgoIso(10)); // 20 days after the spec
  return root;
}

describe('AC: Newer governed file makes the spec suspect', () => {
  it('names the spec, the file, both dates, and the three readings', async () => {
    const root = makeDriftProject('suspect');
    expect(await runSpecDrift(root)).toBe(0);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('## a.drifted');
    expect(body).toContain('`src/drifted.ts`');
    expect(body).toContain(daysAgoIso(30).slice(0, 10)); // spec date
    expect(body).toContain(daysAgoIso(10).slice(0, 10)); // file date
    expect(body).toContain('20 days after the spec');
    expect(body).toContain('spec is wrong or stale');
    expect(body).toContain('implementation regressed');
    expect(body).toContain('new acceptance criteria');
  });
});

describe('AC: Fresh spec is not suspect', () => {
  it('a spec committed after all governed file changes does not appear', async () => {
    const root = tmp('fresh');
    makeCortexProject(root);
    gitInitRepo(root);
    writeAt(root, 'src/settled.ts', 'export {};\n');
    gitCommitPathsAt(root, ['src/settled.ts'], daysAgoIso(60));
    writeAt(root, 'specs/a/fresh.spec.md', specMd('a.fresh', ['src/settled.ts']));
    gitCommitPathsAt(root, ['specs/a/fresh.spec.md'], daysAgoIso(5));

    await runSpecDrift(root);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).not.toContain('a.fresh');
    expect(body).toContain('No drift suspects this cycle.');
  });
});

describe('AC: Grace window respected', () => {
  it('a governed file changed 5 days after its spec does not appear (14-day grace)', async () => {
    const root = tmp('grace');
    makeCortexProject(root);
    gitInitRepo(root);
    writeAt(root, 'specs/a/graceful.spec.md', specMd('a.graceful', ['src/g.ts']));
    writeAt(root, 'src/g.ts', 'export {};\n');
    gitCommitPathsAt(root, ['specs/a/graceful.spec.md', 'src/g.ts'], daysAgoIso(30));
    writeAt(root, 'src/g.ts', 'export const g = 1;\n');
    gitCommitPathsAt(root, ['src/g.ts'], daysAgoIso(25));

    await runSpecDrift(root);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).not.toContain('a.graceful');
    expect(body).toContain('No drift suspects this cycle.');
    expect(body).toContain('Grace window: 14 days');
  });
});

describe('AC: Ungoverned spec skipped, untracked spec noted', () => {
  it('the governs-less spec is absent; the uncommitted one appears under "not in git history"', async () => {
    const root = tmp('skip-note');
    makeCortexProject(root);
    gitInitRepo(root);
    writeAt(root, 'specs/a/floaty.spec.md', specMd('a.floaty'));
    writeAt(root, 'src/x.ts', 'export {};\n');
    gitCommitPathsAt(root, ['specs/a/floaty.spec.md', 'src/x.ts'], daysAgoIso(30));
    writeAt(root, 'specs/a/uncommitted.spec.md', specMd('a.uncommitted', ['src/x.ts']));

    await runSpecDrift(root);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).not.toContain('a.floaty');
    expect(body).toContain('## Not in git history');
    expect(body).toContain('a.uncommitted');
    expect(body).toContain('noted, not judged');
  });
});

describe('Always-write (schema §4.5) and non-repo handling', () => {
  it('a clean run carries kind/loop and a fresh generated on every run', async () => {
    const root = tmp('clean');
    makeCortexProject(root);
    gitInitRepo(root);
    writeAt(root, 'specs/a/only.spec.md', specMd('a.only'));
    gitCommitPathsAt(root, ['specs/a/only.spec.md'], daysAgoIso(2));

    await runSpecDrift(root, { now: new Date('2026-07-01T07:00:00.000Z') });
    let report = parsePulseReport(path.join(root, REPORT_REL));
    expect(report.kind).toBe('pulse-spec-drift');
    expect(report.loop).toBe('cortex-loop-spec-drift');
    expect(report.generated).toBe('2026-07-01T07:00:00.000Z');
    expect(report.body).toContain('No drift suspects this cycle.');

    await runSpecDrift(root, { now: new Date('2026-07-02T07:00:00.000Z') });
    report = parsePulseReport(path.join(root, REPORT_REL));
    expect(report.generated).toBe('2026-07-02T07:00:00.000Z');
  });

  it('a non-git project still writes the report with the no-history notice, exit 0 (Rule 3)', async () => {
    const root = tmp('norepo');
    makeCortexProject(root);
    writeAt(root, 'specs/a/thing.spec.md', specMd('a.thing', ['src/a.ts']));
    const code = await runSpecDrift(root);
    expect(code).toBe(0);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('Not a git repository');
    expect(body).toContain('No drift suspects this cycle.');
  });
});

describe('AC: Only the report is written', () => {
  it('a full-tree snapshot differs only by pulse/spec-drift.md', async () => {
    const root = makeDriftProject('only-report');
    const before = snapshotTree(root);
    await runSpecDrift(root);
    const after = snapshotTree(root);

    const changed: string[] = [];
    for (const [rel, content] of after) {
      if (!before.has(rel) || before.get(rel) !== content) changed.push(rel);
    }
    for (const rel of before.keys()) {
      if (!after.has(rel)) changed.push(`(deleted) ${rel}`);
    }
    expect(changed).toEqual([REPORT_REL]);
  });
});
