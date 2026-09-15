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
  insightLedgerContent,
  ruleMd,
  specMd,
  setMtimeDaysAgo,
  parsePulseReport,
} from '../../fixtures/loops-harness.js';
import {
  checkOrphanBranches,
  checkStalePrs,
  checkInsightDrift,
  checkCompassDeadRefs,
  checkSpecOrphans,
  checkAgedTodos,
  cleanStaleReadLedgers,
  expireThreads,
  cleanStaleSessionRecords,
  runHygiene,
  ORPHAN_BRANCH_DAYS,
  STALE_PR_DAYS,
  AGED_TODO_DAYS,
  READS_RETENTION_DAYS,
  SESSION_RECORD_RETENTION_DAYS,
} from '../../../src/pulse/hygiene.js';
import { threadRawFixture, readThreadRaw } from '../../fixtures/threads.js';

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
describe('check (c): insight drift — ledger entries whose source vanished', () => {
  it('names ledger entries missing on disk; on-disk-but-unextracted files are NOT findings', async () => {
    const root = tmp('insight-drift');
    writeAt(root, 'src/kept.ts', 'export {};\n');
    writeAt(root, 'src/new.ts', 'export {};\n'); // unextracted — the refresh loops' business, not noise here
    writeAt(root, '.cortex/insight/ledger.json', insightLedgerContent(['src/kept.ts', 'src/gone.ts']));
    const section = await checkInsightDrift(root);
    expect(section.title).toBe('Insight drift');
    expect(section.skipped).toBeUndefined();
    expect(section.findings).toHaveLength(1);
    const joined = section.findings.join('\n');
    expect(joined).toContain('src/gone.ts');
    expect(joined).toContain('has an insight ledger entry but is missing on disk');
    expect(joined).not.toContain('src/new.ts');
    expect(joined).not.toContain('src/kept.ts');
  });

  it('is skipped-with-notice when ledger.json does not exist', async () => {
    const root = tmp('insight-none');
    writeAt(root, 'src/a.ts', 'export {};\n');
    const section = await checkInsightDrift(root);
    expect(section.skipped).toBe(
      'skipped — no insight staleness ledger (.cortex/insight/ledger.json missing; run cortex-extract-insight)',
    );
    expect(section.findings).toEqual([]);
  });

  it('a schema-invalid ledger is skipped-with-reason, not a crash (check.insight-ledger owns the shape)', async () => {
    const root = tmp('insight-invalid');
    writeAt(root, '.cortex/insight/ledger.json', '{"entries": "not-an-object"}');
    const section = await checkInsightDrift(root);
    expect(section.skipped).toContain('not schema-valid');
    expect(section.findings).toEqual([]);
  });

  it('a ledger that matches the disk exactly is clean', async () => {
    const root = tmp('insight-clean');
    writeAt(root, 'src/only.ts', 'export {};\n');
    writeAt(root, '.cortex/insight/ledger.json', insightLedgerContent(['src/only.ts']));
    const section = await checkInsightDrift(root);
    expect(section.findings).toEqual([]);
  });
});

// ===========================================================================
describe('check (d): compass dead references (validator resolution logic)', () => {
  it('names a rule whose source points at a deleted file, with the dead path', async () => {
    const root = tmp('compass-source');
    writeAt(root, 'src/app.ts', 'export {};\n');
    writeAt(
      root,
      '.cortex/compass/rules/R-101-dead-source.md',
      ruleMd('R-101', { source: ['../../../deleted-doc.md'], governs: ['src/**/*.ts'] }),
    );
    const section = await checkCompassDeadRefs(root);
    expect(section.findings).toHaveLength(1);
    expect(section.findings[0]).toContain('R-101');
    expect(section.findings[0]).toContain('deleted-doc.md');
  });

  it('names a rule whose governs glob matches nothing on disk', async () => {
    const root = tmp('compass-governs');
    writeAt(root, 'README.md', '# t\n');
    writeAt(
      root,
      '.cortex/compass/rules/R-102-dead-governs.md',
      ruleMd('R-102', { source: ['../../../README.md'], governs: ['src/vanished/**/*.ts'] }),
    );
    const section = await checkCompassDeadRefs(root);
    expect(section.findings).toHaveLength(1);
    expect(section.findings[0]).toContain('R-102');
    expect(section.findings[0]).toContain('src/vanished/**/*.ts');
  });

  it('a healthy rule (resolving source, matching governs) is silent', async () => {
    const root = tmp('compass-healthy');
    writeAt(root, 'README.md', '# t\n');
    writeAt(root, 'src/app.ts', 'export {};\n');
    writeAt(
      root,
      '.cortex/compass/rules/R-103-healthy.md',
      ruleMd('R-103', { source: ['../../../README.md'], governs: ['src/**/*.ts'] }),
    );
    const section = await checkCompassDeadRefs(root);
    expect(section.findings).toEqual([]);
  });
});

// ===========================================================================
describe('check (e): spec orphans', () => {
  it('flags a dev spec whose governs matches nothing; governed and governs-less specs are silent', async () => {
    const root = tmp('spec-orphans');
    writeAt(root, 'src/app.ts', 'export {};\n');
    writeAt(root, '.specflow/specs/a/orphan.spec.md', specMd('a.orphan', ['src/nothing/**/*.ts']));
    writeAt(root, '.specflow/specs/a/governed.spec.md', specMd('a.governed', ['src/**/*.ts']));
    writeAt(root, '.specflow/specs/a/nogoverns.spec.md', specMd('a.nogoverns'));
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

// ===========================================================================
// retention: per-session read ledgers under pulse/state/reads/ (pulse reorg)
// ===========================================================================
describe('retention: cleanStaleReadLedgers prunes aged pulse/state/reads/ ledgers', () => {
  /** Write a read ledger under pulse/state/reads/<id> and backdate its mtime. */
  function writeReadLedger(root: string, id: string, agedDays: number): string {
    const abs = writeAt(root, path.join('.cortex', 'pulse', 'state', 'reads', id), 'read\n');
    setMtimeDaysAgo(abs, agedDays);
    return abs;
  }

  it(`deletes ledgers older than ${READS_RETENTION_DAYS} days and keeps fresh ones, returning the count`, () => {
    const root = tmp('reads-unit');
    const stale = writeReadLedger(root, 'stale-session', READS_RETENTION_DAYS + 6);
    const fresh = writeReadLedger(root, 'fresh-session', 2);

    const deleted = cleanStaleReadLedgers(root);
    expect(deleted).toBe(1);
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('tolerates an absent reads directory (nothing extracted yet) with a zero count', () => {
    const root = tmp('reads-absent');
    expect(cleanStaleReadLedgers(root)).toBe(0);
  });

  it('the full sweep prunes the stale ledger and the report body names the cleaned count', async () => {
    const root = tmp('reads-sweep');
    writeAt(root, '.cortex/cortex.config.json', JSON.stringify({ schemaVersion: '1.0' }) + '\n');
    const stale = writeReadLedger(root, 'aged-abc', READS_RETENTION_DAYS + 6);
    const fresh = writeReadLedger(root, 'recent-def', 2);

    // gh is forced absent (a path that does not exist) — no network, no real gh.
    const code = await runHygiene(root, { ghBin: path.join(root, 'no-such-gh') });
    expect(code).toBe(0);
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);

    const { body } = parsePulseReport(path.join(root, '.cortex', 'pulse', 'reports', 'hygiene.md'));
    expect(body).toContain('Stale session-read ledgers cleaned: 1');
    expect(body).toContain('pulse/state/reads/');
  });
});

// ===========================================================================
// Rule 8 (a): thread expiry in place — pulse.threads Rule 10, schema §4.5.3
// ===========================================================================
describe('Rule 8a: expireThreads flips open threads past their expiry to expired, in place', () => {
  const NOW = Date.parse('2026-09-15T12:00:00.000Z');

  it('expires the open thread past its expiry with every other line byte-identical; future and non-open threads untouched', () => {
    const root = tmp('threads-expire');
    const t1 = threadRawFixture({ id: 'T-001', status: 'open', expires: '2026-08-01T00:00:00Z' });
    const t2 = threadRawFixture({ id: 'T-002', status: 'open', expires: '2026-09-16T12:00:00.000Z' });
    const t3 = threadRawFixture({ id: 'T-003', status: 'answered', expires: '2026-08-01T00:00:00Z', answered: '2026-08-02T00:00:00.000Z', resolved_by: 'claude-sessions/u/s2' });
    writeAt(root, '.cortex/pulse/threads/T-001-x.md', t1);
    writeAt(root, '.cortex/pulse/threads/T-002-y.md', t2);
    writeAt(root, '.cortex/pulse/threads/T-003-z.md', t3);

    expect(expireThreads(root, NOW)).toEqual({ expired: 1, skipped: 0 });

    const after1 = readThreadRaw(root, 'T-001') as string;
    expect(after1).toContain('\nstatus: expired\n');
    expect(after1.replace('status: expired', 'status: open')).toBe(t1);
    expect(readThreadRaw(root, 'T-002')).toBe(t2);
    expect(readThreadRaw(root, 'T-003')).toBe(t3);
    expect(fs.readdirSync(path.join(root, '.cortex', 'pulse', 'threads')).sort()).toEqual([
      'T-001-x.md',
      'T-002-y.md',
      'T-003-z.md',
    ]);
  });

  it('a thread whose frontmatter does not parse is skipped and counted, never deleted or rewritten', () => {
    const root = tmp('threads-skip');
    const bad = '---\nid: T-004\nstatus: open\nexpires: 2026-08-01T00:00:00Z\n---\n\nno kind, no session\n';
    writeAt(root, '.cortex/pulse/threads/T-004-bad.md', bad);
    writeAt(root, '.cortex/pulse/threads/T-005-worse.md', 'not even frontmatter\n');
    expect(expireThreads(root, NOW)).toEqual({ expired: 0, skipped: 2 });
    expect(readThreadRaw(root, 'T-004')).toBe(bad);
    expect(readThreadRaw(root, 'T-005')).toBe('not even frontmatter\n');
  });

  it('tolerates an absent threads directory', () => {
    const root = tmp('threads-absent');
    expect(expireThreads(root, NOW)).toEqual({ expired: 0, skipped: 0 });
  });
});

// ===========================================================================
// Rule 8 (b)+(c): session-record, scratch and Stop-companion retention
// ===========================================================================
describe('Rule 8b/c: cleanStaleSessionRecords deletes aged records, their scratch copies and orphan companions', () => {
  const STALE = SESSION_RECORD_RETENTION_DAYS + 1;

  function writeRecord(root: string, id: string, agedDays: number): string {
    const abs = writeAt(root, path.join('.cortex', 'pulse', 'sessions', `${id}.json`), '{}\n');
    setMtimeDaysAgo(abs, agedDays);
    return abs;
  }
  function writeScratch(root: string, id: string, agedDays: number): string {
    const file = writeAt(root, path.join('.cortex', 'pulse', 'scratch', id, 'notes.md'), '# n\n');
    setMtimeDaysAgo(file, agedDays);
    const dir = path.dirname(file);
    setMtimeDaysAgo(dir, agedDays);
    return dir;
  }
  function writeCompanion(root: string, id: string, agedDays: number): string {
    const abs = writeAt(root, path.join('.cortex', 'pulse', 'state', 'sessions', `${id}.last.json`), '{}\n');
    setMtimeDaysAgo(abs, agedDays);
    return abs;
  }

  it('deletes old.json with scratch/old/ and gone.last.json; keeps the fresh trio; returns the three counts', () => {
    const root = tmp('records-mixed');
    const oldRecord = writeRecord(root, 'old', STALE);
    const oldScratch = writeScratch(root, 'old', STALE);
    const goneCompanion = writeCompanion(root, 'gone', STALE);
    const newRecord = writeRecord(root, 'new', 1);
    const newScratch = writeScratch(root, 'new', 1);
    const newCompanion = writeCompanion(root, 'new', 1);

    expect(cleanStaleSessionRecords(root)).toEqual({ records: 1, scratchDirs: 1, companions: 1 });
    expect(fs.existsSync(oldRecord)).toBe(false);
    expect(fs.existsSync(oldScratch)).toBe(false);
    expect(fs.existsSync(goneCompanion)).toBe(false);
    expect(fs.existsSync(newRecord)).toBe(true);
    expect(fs.existsSync(path.join(newScratch, 'notes.md'))).toBe(true);
    expect(fs.existsSync(newCompanion)).toBe(true);
  });

  it('a scratch directory matching a deleted record goes even when its own mtime is fresh', () => {
    const root = tmp('records-scratch-by-name');
    writeRecord(root, 'old', STALE);
    const scratch = writeScratch(root, 'old', 0);
    expect(cleanStaleSessionRecords(root)).toEqual({ records: 1, scratchDirs: 1, companions: 0 });
    expect(fs.existsSync(scratch)).toBe(false);
  });

  it('a scratch directory past the window is deleted on its own mtime without any record', () => {
    const root = tmp('records-scratch-orphan');
    const stale = writeScratch(root, 'lonely', STALE);
    const fresh = writeScratch(root, 'recent', 1);
    expect(cleanStaleSessionRecords(root)).toEqual({ records: 0, scratchDirs: 1, companions: 0 });
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('never touches other pulse/state/ files and tolerates absent directories', () => {
    const root = tmp('records-absent');
    expect(cleanStaleSessionRecords(root)).toEqual({ records: 0, scratchDirs: 0, companions: 0 });
    const counter = writeAt(root, '.cortex/pulse/state/thread-counter', '3\n');
    setMtimeDaysAgo(counter, STALE);
    const other = writeAt(root, '.cortex/pulse/state/sessions/keep.json', '{}\n');
    setMtimeDaysAgo(other, STALE);
    expect(cleanStaleSessionRecords(root)).toEqual({ records: 0, scratchDirs: 0, companions: 0 });
    expect(fs.existsSync(counter)).toBe(true);
    expect(fs.existsSync(other)).toBe(true);
  });
});
