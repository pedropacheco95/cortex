/**
 * Atomic tests — loops.spec-drift signals in isolation (Rule 2's date
 * comparison, Rule 3's skip/note handling). Governed files come ONLY from
 * each spec's own `governs:` glob expansion — the v1/v2 anatomy `spec_links`
 * reverse map (readSpecLinksReverseMap) was deleted at build-order-v3 step 7.
 * Sandboxed git fixtures with backdated commits throughout.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import {
  daysAgoIso,
  writeAt,
  gitInitRepo,
  gitCommitPathsAt,
  specMd,
} from '../../fixtures/loops-harness.js';
import {
  scanSpecDrift,
  SPEC_DRIFT_GRACE_DAYS,
} from '../../../src/loops/spec-drift.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`spec-drift-atomic-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** spec committed 30 days ago governing src/a.ts. */
function seedSpecAndFile(root: string): void {
  gitInitRepo(root);
  writeAt(root, '.specflow/specs/a/thing.spec.md', specMd('a.thing', ['src/a.ts']));
  writeAt(root, 'src/a.ts', 'export {};\n');
  gitCommitPathsAt(root, ['.specflow/specs/a/thing.spec.md', 'src/a.ts'], daysAgoIso(30));
}

describe('drift signal: governed file newer than spec + grace', () => {
  it('a file committed 20 days after its spec makes the spec suspect, with both dates', async () => {
    const root = tmp('suspect');
    seedSpecAndFile(root);
    writeAt(root, 'src/a.ts', 'export const changed = true;\n');
    gitCommitPathsAt(root, ['src/a.ts'], daysAgoIso(10));

    const scan = await scanSpecDrift(root);
    expect(scan.suspects).toHaveLength(1);
    const s = scan.suspects[0];
    expect(s?.specId).toBe('a.thing');
    expect(s?.newerFiles).toHaveLength(1);
    expect(s?.newerFiles[0]?.path).toBe('src/a.ts');
    expect(s?.newerFiles[0]?.daysAfterSpec).toBe(20);
  });

  it(`a file changed within the ${SPEC_DRIFT_GRACE_DAYS}-day grace window is not drift`, async () => {
    const root = tmp('grace');
    seedSpecAndFile(root);
    writeAt(root, 'src/a.ts', 'export const tweaked = true;\n');
    gitCommitPathsAt(root, ['src/a.ts'], daysAgoIso(25)); // 5 days after the spec

    const scan = await scanSpecDrift(root);
    expect(scan.suspects).toEqual([]);
  });

  it('a spec committed after all its governed files is not suspect', async () => {
    const root = tmp('fresh-spec');
    gitInitRepo(root);
    writeAt(root, 'src/a.ts', 'export {};\n');
    gitCommitPathsAt(root, ['src/a.ts'], daysAgoIso(60));
    writeAt(root, '.specflow/specs/a/thing.spec.md', specMd('a.thing', ['src/a.ts']));
    gitCommitPathsAt(root, ['.specflow/specs/a/thing.spec.md'], daysAgoIso(5));

    const scan = await scanSpecDrift(root);
    expect(scan.suspects).toEqual([]);
  });
});

describe('Rule 3: skip and note handling', () => {
  it('an ungoverned spec (no governs) is skipped entirely', async () => {
    const root = tmp('ungoverned');
    gitInitRepo(root);
    writeAt(root, '.specflow/specs/a/floaty.spec.md', specMd('a.floaty'));
    gitCommitPathsAt(root, ['.specflow/specs/a/floaty.spec.md'], daysAgoIso(30));

    const scan = await scanSpecDrift(root);
    expect(scan.suspects).toEqual([]);
    expect(scan.untracked).toEqual([]);
    expect(scan.skippedUngoverned).toBe(1);
  });

  it('a governed spec outside git history is noted as untracked, not judged', async () => {
    const root = tmp('untracked');
    gitInitRepo(root);
    writeAt(root, 'src/a.ts', 'export {};\n');
    gitCommitPathsAt(root, ['src/a.ts'], daysAgoIso(60));
    writeAt(root, '.specflow/specs/a/new.spec.md', specMd('a.new', ['src/a.ts'])); // never committed

    const scan = await scanSpecDrift(root);
    expect(scan.suspects).toEqual([]);
    expect(scan.untracked).toEqual([{ specId: 'a.new', specFile: '.specflow/specs/a/new.spec.md' }]);
  });

  it('an untracked governed FILE has no date and is not compared', async () => {
    const root = tmp('untracked-file');
    gitInitRepo(root);
    writeAt(root, '.specflow/specs/a/thing.spec.md', specMd('a.thing', ['src/**/*.ts']));
    gitCommitPathsAt(root, ['.specflow/specs/a/thing.spec.md'], daysAgoIso(30));
    writeAt(root, 'src/never-committed.ts', 'export {};\n');

    const scan = await scanSpecDrift(root);
    expect(scan.suspects).toEqual([]);
  });

  it('a non-git project reports notARepo (Rule 3: no history to judge)', async () => {
    const root = tmp('norepo');
    writeAt(root, '.specflow/specs/a/thing.spec.md', specMd('a.thing', ['src/a.ts']));
    const scan = await scanSpecDrift(root);
    expect(scan.notARepo).toBe(true);
    expect(scan.suspects).toEqual([]);
  });
});

describe('governed files come only from the spec\'s own governs expansion (reverse map deleted at step 7)', () => {
  it('a governs-less spec is skipped even when a governed-looking file changed later — no second artefact links them', async () => {
    const root = tmp('no-reverse-map');
    gitInitRepo(root);
    writeAt(root, '.specflow/specs/a/linked.spec.md', specMd('a.linked'));
    writeAt(root, 'src/b.ts', 'export {};\n');
    gitCommitPathsAt(root, ['.specflow/specs/a/linked.spec.md', 'src/b.ts'], daysAgoIso(40));
    writeAt(root, 'src/b.ts', 'export const changed = true;\n');
    gitCommitPathsAt(root, ['src/b.ts'], daysAgoIso(10));

    const scan = await scanSpecDrift(root);
    expect(scan.suspects).toEqual([]);
    expect(scan.skippedUngoverned).toBe(1);
  });

  it("a spec whose glob matches only itself is treated as ungoverned (the spec file is excluded from its own expansion)", async () => {
    const root = tmp('self-match');
    gitInitRepo(root);
    writeAt(root, '.specflow/specs/a/selfy.spec.md', specMd('a.selfy', ['.specflow/specs/**/*.md']));
    gitCommitPathsAt(root, ['.specflow/specs/a/selfy.spec.md'], daysAgoIso(40));

    const scan = await scanSpecDrift(root);
    expect(scan.suspects).toEqual([]);
    expect(scan.untracked).toEqual([]);
    expect(scan.skippedUngoverned).toBe(1);
  });
});
