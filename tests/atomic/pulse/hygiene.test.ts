/**
 * Atomic tests — pulse.hygiene (Rule 2's six deterministic checks, each in
 * isolation). Sandboxed tmp fixtures; git fixtures use backdated commits;
 * gh is always a stub or an absent binary — never the real gh.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp, writeExecutable } from '../../fixtures/init-harness.js';
import {
  daysAgoIso,
  writeAt,
  gitInitRepo,
  gitCommitAllAt,
  gitCommitPathsAt,
  gitRun,
  filesMdContent,
  ruleMd,
  specMd,
} from '../../fixtures/loops-harness.js';
import {
  checkOrphanBranches,
  checkStalePrs,
  checkAnatomyDrift,
  checkCerebrumDeadRefs,
  checkSpecOrphans,
  checkAgedTodos,
  ORPHAN_BRANCH_DAYS,
  STALE_PR_DAYS,
  AGED_TODO_DAYS,
} from '../../../src/pulse/hygiene.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`hygiene-atomic-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

// ===========================================================================
describe('check (a): orphan local branches', () => {
  it('flags an unmerged branch whose last commit is 40 days old, with its age', async () => {
    const root = tmp('branch-orphan');
    writeAt(root, 'a.txt', 'a\n');
    gitInitRepo(root);
    gitCommitAllAt(root, daysAgoIso(50));
    gitRun(root, ['checkout', '-b', 'old-feature', '--quiet']);
    writeAt(root, 'b.txt', 'b\n');
    gitCommitAllAt(root, daysAgoIso(40));
    gitRun(root, ['checkout', 'main', '--quiet']);
    writeAt(root, 'c.txt', 'c\n');
    gitCommitAllAt(root, daysAgoIso(0));

    const section = await checkOrphanBranches(root);
    expect(section.skipped).toBeUndefined();
    expect(section.findings).toHaveLength(1);
    expect(section.findings[0]).toContain('old-feature');
    expect(section.findings[0]).toContain('40 days');
  });

  it('does not flag merged branches or fresh unmerged branches', async () => {
    const root = tmp('branch-clean');
    writeAt(root, 'a.txt', 'a\n');
    gitInitRepo(root);
    gitCommitAllAt(root, daysAgoIso(60));
    gitRun(root, ['branch', 'old-merged']); // ancestor of HEAD → merged
    gitRun(root, ['checkout', '-b', 'fresh-feature', '--quiet']);
    writeAt(root, 'b.txt', 'b\n');
    gitCommitAllAt(root, daysAgoIso(0));
    gitRun(root, ['checkout', 'main', '--quiet']);
    writeAt(root, 'c.txt', 'c\n');
    gitCommitAllAt(root, daysAgoIso(0));

    const section = await checkOrphanBranches(root);
    expect(section.findings).toEqual([]);
  });

  it('is skipped-with-notice when the project is not a git repository', async () => {
    const root = tmp('branch-norepo');
    const section = await checkOrphanBranches(root);
    expect(section.skipped).toBe('skipped — not a git repository');
    expect(section.findings).toEqual([]);
  });

  it(`uses the ${ORPHAN_BRANCH_DAYS}-day threshold (a 10-day-old unmerged branch is silent)`, async () => {
    const root = tmp('branch-young');
    writeAt(root, 'a.txt', 'a\n');
    gitInitRepo(root);
    gitCommitAllAt(root, daysAgoIso(50));
    gitRun(root, ['checkout', '-b', 'young', '--quiet']);
    writeAt(root, 'b.txt', 'b\n');
    gitCommitAllAt(root, daysAgoIso(10));
    gitRun(root, ['checkout', 'main', '--quiet']);
    writeAt(root, 'c.txt', 'c\n');
    gitCommitAllAt(root, daysAgoIso(0));

    const section = await checkOrphanBranches(root);
    expect(section.findings).toEqual([]);
  });
});

// ===========================================================================
describe('check (b): stale open PRs via gh', () => {
  it('degrades to "skipped — gh unavailable" when the binary is absent', async () => {
    const root = tmp('gh-absent');
    const section = await checkStalePrs(root, path.join(root, 'no-such-gh'));
    expect(section.skipped).toBe('skipped — gh unavailable');
    expect(section.findings).toEqual([]);
  });

  it('flags only PRs not updated within the threshold', async () => {
    const root = tmp('gh-stale');
    const json = JSON.stringify([
      { number: 7, title: 'Old PR', updatedAt: daysAgoIso(STALE_PR_DAYS + 6) },
      { number: 8, title: 'Fresh PR', updatedAt: daysAgoIso(1) },
    ]);
    const gh = writeExecutable(
      path.join(root, 'bin', 'gh'),
      `#!/bin/sh\nprintf '%s' '${json}'\n`,
    );
    const section = await checkStalePrs(root, gh);
    expect(section.skipped).toBeUndefined();
    expect(section.findings).toHaveLength(1);
    expect(section.findings[0]).toContain('#7');
    expect(section.findings[0]).toContain('Old PR');
    expect(section.findings[0]).not.toContain('Fresh PR');
  });

  it('a failing gh (e.g. no remote) is skipped-with-reason, not a crash', async () => {
    const root = tmp('gh-fail');
    const gh = writeExecutable(
      path.join(root, 'bin', 'gh'),
      '#!/bin/sh\necho "no git remotes found" >&2\nexit 1\n',
    );
    const section = await checkStalePrs(root, gh);
    expect(section.skipped).toContain('skipped — gh failed');
    expect(section.skipped).toContain('no git remotes found');
  });
});

// ===========================================================================
describe('check (c): anatomy drift, both directions', () => {
  it('names indexed-but-deleted files and on-disk-but-unscanned files', async () => {
    const root = tmp('anatomy-drift');
    writeAt(root, 'src/kept.ts', 'export {};\n');
    writeAt(root, 'src/new.ts', 'export {};\n');
    writeAt(
      root,
      '.cortex/anatomy/files.md',
      filesMdContent([{ path: 'src/kept.ts' }, { path: 'src/gone.ts' }]),
    );
    const section = await checkAnatomyDrift(root);
    const joined = section.findings.join('\n');
    expect(joined).toContain('src/gone.ts');
    expect(joined).toContain('missing on disk');
    expect(joined).toContain('src/new.ts');
    expect(joined).toContain('not in anatomy');
    expect(joined).not.toContain('src/kept.ts');
  });

  it('is skipped-with-notice when files.md does not exist', async () => {
    const root = tmp('anatomy-none');
    writeAt(root, 'src/a.ts', 'export {};\n');
    const section = await checkAnatomyDrift(root);
    expect(section.skipped).toContain('files.md missing');
  });

  it('a files.md that matches the disk exactly is clean', async () => {
    const root = tmp('anatomy-clean');
    writeAt(root, 'src/only.ts', 'export {};\n');
    writeAt(root, '.cortex/anatomy/files.md', filesMdContent([{ path: 'src/only.ts' }]));
    const section = await checkAnatomyDrift(root);
    expect(section.findings).toEqual([]);
  });
});

// ===========================================================================
describe('check (d): cerebrum dead references (validator resolution logic)', () => {
  it('names a rule whose source points at a deleted file, with the dead path', async () => {
    const root = tmp('cerebrum-source');
    writeAt(root, 'src/app.ts', 'export {};\n');
    writeAt(
      root,
      '.cortex/cerebrum/rules/R-101-dead-source.md',
      ruleMd('R-101', { source: ['../../../deleted-doc.md'], governs: ['src/**/*.ts'] }),
    );
    const section = await checkCerebrumDeadRefs(root);
    expect(section.findings).toHaveLength(1);
    expect(section.findings[0]).toContain('R-101');
    expect(section.findings[0]).toContain('deleted-doc.md');
  });

  it('names a rule whose governs glob matches nothing on disk', async () => {
    const root = tmp('cerebrum-governs');
    writeAt(root, 'README.md', '# t\n');
    writeAt(
      root,
      '.cortex/cerebrum/rules/R-102-dead-governs.md',
      ruleMd('R-102', { source: ['../../../README.md'], governs: ['src/vanished/**/*.ts'] }),
    );
    const section = await checkCerebrumDeadRefs(root);
    expect(section.findings).toHaveLength(1);
    expect(section.findings[0]).toContain('R-102');
    expect(section.findings[0]).toContain('src/vanished/**/*.ts');
  });

  it('a healthy rule (resolving source, matching governs) is silent', async () => {
    const root = tmp('cerebrum-healthy');
    writeAt(root, 'README.md', '# t\n');
    writeAt(root, 'src/app.ts', 'export {};\n');
    writeAt(
      root,
      '.cortex/cerebrum/rules/R-103-healthy.md',
      ruleMd('R-103', { source: ['../../../README.md'], governs: ['src/**/*.ts'] }),
    );
    const section = await checkCerebrumDeadRefs(root);
    expect(section.findings).toEqual([]);
  });
});

// ===========================================================================
describe('check (e): spec/anatomy orphans', () => {
  it('flags a dev spec whose governs matches nothing; governed and governs-less specs are silent', async () => {
    const root = tmp('spec-orphans');
    writeAt(root, 'src/app.ts', 'export {};\n');
    writeAt(root, 'specs/a/orphan.spec.md', specMd('a.orphan', ['src/nothing/**/*.ts']));
    writeAt(root, 'specs/a/governed.spec.md', specMd('a.governed', ['src/**/*.ts']));
    writeAt(root, 'specs/a/nogoverns.spec.md', specMd('a.nogoverns'));
    const section = await checkSpecOrphans(root);
    expect(section.findings).toHaveLength(1);
    expect(section.findings[0]).toContain('a.orphan');
    expect(section.findings[0]).toContain('src/nothing/**/*.ts');
  });
});

// ===========================================================================
describe('check (f): aged TODO/FIXME comments', () => {
  it(`flags TODOs in files last committed over ${AGED_TODO_DAYS} days ago, with count and locations`, async () => {
    const root = tmp('todo-aged');
    gitInitRepo(root);
    writeAt(root, 'src/old.ts', '// TODO: fix this\nconst x = 1;\n// FIXME: and this\n');
    gitCommitPathsAt(root, ['src/old.ts'], daysAgoIso(40));
    writeAt(root, 'src/new.ts', '// TODO: recent\n');
    gitCommitPathsAt(root, ['src/new.ts'], daysAgoIso(1));

    const section = await checkAgedTodos(root);
    expect(section.findings).toHaveLength(1);
    expect(section.findings[0]).toContain('src/old.ts');
    expect(section.findings[0]).toContain('2 TODO/FIXME marker(s)');
    expect(section.findings[0]).toContain('lines 1, 3');
    expect(section.findings[0]).toContain('40 days');
  });

  it('TODOs in untracked files or non-git projects have unknown age and are not flagged', async () => {
    const nonRepo = tmp('todo-norepo');
    writeAt(nonRepo, 'src/a.ts', '// TODO: whenever\n');
    expect((await checkAgedTodos(nonRepo)).findings).toEqual([]);

    const repo = tmp('todo-untracked');
    gitInitRepo(repo);
    writeAt(repo, 'seed.txt', 's\n');
    gitCommitAllAt(repo, daysAgoIso(40));
    writeAt(repo, 'src/uncommitted.ts', '// TODO: untracked\n');
    expect((await checkAgedTodos(repo)).findings).toEqual([]);
  });
});
