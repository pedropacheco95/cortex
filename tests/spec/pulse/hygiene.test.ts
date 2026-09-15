/**
 * Spec-level tests — pulse.hygiene, one describe per acceptance criterion,
 * driven over realistic tmp fixtures (git init where the AC needs history).
 * gh is always a stub or absent — the real gh (and any network) is never
 * touched. The CLI-driven AC uses a PATH restricted to a bin dir holding
 * only git, so `gh` is genuinely absent for the child processes.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { makeTmpDir, cleanTmp, snapshotTree, writeExecutable } from '../../fixtures/init-harness.js';
import {
  daysAgoIso,
  writeAt,
  gitInitRepo,
  gitCommitAllAt,
  gitRun,
  insightLedgerContent,
  ruleMd,
  parsePulseReport,
} from '../../fixtures/loops-harness.js';
import { runHygiene, SESSION_RECORD_RETENTION_DAYS } from '../../../src/pulse/hygiene.js';
import { run } from '../../../src/cli/cli.js';
import { threadRawFixture, readThreadRaw } from '../../fixtures/threads.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`hygiene-spec-${label}`);
  dirs.push(d);
  return d;
}

let originalCwd: string;
let originalPath: string | undefined;
beforeEach(() => {
  originalCwd = process.cwd();
  originalPath = process.env['PATH'];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.chdir(originalCwd);
  if (originalPath !== undefined) process.env['PATH'] = originalPath;
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

/** gh stub answering `pr list` with an empty JSON array (gh present, no PRs).
 *  Lives in its OWN tmp dir, outside the fixture project tree. */
function emptyGhStub(): string {
  return writeExecutable(path.join(tmp('gh-stub'), 'gh'), "#!/bin/sh\nprintf '[]'\n");
}

/**
 * A fully conformant clean fixture: git repo, one branch, no TODOs, and an
 * insight staleness ledger that matches the disk exactly (an entry for every
 * extracted file — anatomy files.md retired at build-order-v3 step 7).
 */
function makeCleanProject(label: string): string {
  const root = tmp(label);
  writeAt(root, 'README.md', '# clean\n');
  writeAt(root, 'src/app.ts', 'export const ok = true;\n');
  fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
  writeAt(root, '.cortex/cortex.config.json', JSON.stringify({ schemaVersion: '1.0' }) + '\n');
  writeAt(root, '.cortex/insight/ledger.json', insightLedgerContent(['README.md', 'src/app.ts']));
  gitInitRepo(root);
  gitCommitAllAt(root, daysAgoIso(1));
  return root;
}

const REPORT_REL = path.join('.cortex', 'pulse', 'reports', 'hygiene.md');

// ===========================================================================
describe('AC: Always-writes, even when clean', () => {
  it('a clean project yields kind/generated/loop and six "No findings this cycle." sections', async () => {
    const root = makeCleanProject('clean');
    const t1 = new Date('2026-07-01T10:00:00.000Z');
    const code = await runHygiene(root, { ghBin: emptyGhStub(), now: t1 });
    expect(code).toBe(0);

    const report = parsePulseReport(path.join(root, REPORT_REL));
    expect(report.kind).toBe('pulse-hygiene-report');
    expect(report.loop).toBe('cortex-pulse-hygiene');
    expect(report.generated).toBe(t1.toISOString());
    expect(report.body.match(/No findings this cycle\./g)).toHaveLength(6);
  });

  it('every run overwrites with a fresh generated (schema §4.5 always-write)', async () => {
    const root = makeCleanProject('rewrite');
    const gh = emptyGhStub();
    await runHygiene(root, { ghBin: gh, now: new Date('2026-07-01T10:00:00.000Z') });
    await runHygiene(root, { ghBin: gh, now: new Date('2026-07-02T10:00:00.000Z') });
    const report = parsePulseReport(path.join(root, REPORT_REL));
    expect(report.generated).toBe('2026-07-02T10:00:00.000Z');
  });

  it('the footer states the thresholds and that drop-off detection was not run (Rules 4-5)', async () => {
    const root = makeCleanProject('footer');
    await runHygiene(root, { ghBin: emptyGhStub() });
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('Thresholds:');
    expect(body).toContain('30 days');
    expect(body).toContain('14 days');
    expect(body).toContain('drop-off detection was not run');
  });
});

// ===========================================================================
describe('AC: Insight drift — vanished ledger entries flagged, unextracted files ignored', () => {
  it('names the deleted-but-extracted file; a created-but-unextracted file is NOT a finding', async () => {
    const root = makeCleanProject('drift');
    fs.rmSync(path.join(root, 'src/app.ts'));
    writeAt(root, 'src/brand-new.ts', 'export {};\n');
    await runHygiene(root, { ghBin: emptyGhStub() });
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('## Insight drift');
    expect(body).toContain('src/app.ts');
    expect(body).toContain('has an insight ledger entry but is missing on disk');
    // Forward direction is the refresh loops' business, not hygiene noise.
    expect(body).not.toContain('src/brand-new.ts');
  });

  it('a project without a ledger gets the skipped-with-reason notice', async () => {
    const root = makeCleanProject('drift-noledger');
    fs.rmSync(path.join(root, '.cortex', 'insight', 'ledger.json'));
    await runHygiene(root, { ghBin: emptyGhStub() });
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain(
      'skipped — no insight staleness ledger (.cortex/insight/ledger.json missing; run cortex-extract-insight)',
    );
  });
});

// ===========================================================================
describe('AC: Compass dead reference caught', () => {
  it('names the rule and the dead source path', async () => {
    const root = makeCleanProject('compass');
    writeAt(
      root,
      '.cortex/compass/rules/R-201-dead.md',
      ruleMd('R-201', { source: ['../../../docs/deleted.md'], governs: ['src/**/*.ts'] }),
    );
    await runHygiene(root, { ghBin: emptyGhStub() });
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('R-201');
    expect(body).toContain('docs/deleted.md');
  });
});

// ===========================================================================
describe('AC: Orphan branch flagged', () => {
  it('names the 40-day-old unmerged branch with its age', async () => {
    const root = makeCleanProject('branch');
    gitRun(root, ['checkout', '-b', 'stale-work', '--quiet']);
    writeAt(root, 'stale.txt', 's\n');
    gitCommitAllAt(root, daysAgoIso(40));
    gitRun(root, ['checkout', 'main', '--quiet']);
    writeAt(root, 'main.txt', 'm\n');
    // main.txt is on-disk-but-unextracted — never an insight-drift finding,
    // so the ledger needs no update to keep that section clean.
    gitCommitAllAt(root, daysAgoIso(0));

    await runHygiene(root, { ghBin: emptyGhStub() });
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('stale-work');
    expect(body).toContain('40 days');
  });
});

// ===========================================================================
describe('AC: gh absence degrades to a notice', () => {
  it('via the real CLI with gh genuinely absent from PATH: skipped-with-reason, exit 0', async () => {
    const root = makeCleanProject('gh-absent');
    // A PATH holding only git — gh is absent for every child process.
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf-8' }).trim();
    const binDir = path.join(root, 'restricted-bin');
    fs.mkdirSync(binDir, { recursive: true });
    fs.symlinkSync(realGit, path.join(binDir, 'git'));
    process.env['PATH'] = binDir;
    process.chdir(root);

    const code = await run(['pulse-hygiene']);
    expect(code).toBe(0);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('skipped — gh unavailable');
  });
});

// ===========================================================================
describe('AC: Only the report is written', () => {
  function diffTrees(before: Map<string, string>, after: Map<string, string>): string[] {
    const changed: string[] = [];
    for (const [rel, content] of after) {
      if (!before.has(rel) || before.get(rel) !== content) changed.push(rel);
    }
    for (const rel of before.keys()) {
      if (!after.has(rel)) changed.push(`(deleted) ${rel}`);
    }
    return changed.sort();
  }

  it('a full-tree snapshot differs only by pulse/reports/hygiene.md', async () => {
    const root = makeCleanProject('only-report');
    const before = snapshotTree(root);
    await runHygiene(root, { ghBin: emptyGhStub() });
    const after = snapshotTree(root);
    expect(diffTrees(before, after)).toEqual([REPORT_REL]);
  });

  it('with Rule 7/8 work to do, the diff is exactly the report, the expired thread, and the aged deletions', async () => {
    const root = makeCleanProject('only-report-rule8');
    const stale = new Date(Date.now() - (SESSION_RECORD_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
    const age = (abs: string): void => fs.utimesSync(abs, stale, stale);
    writeAt(root, '.cortex/pulse/threads/T-001-x.md', threadRawFixture({ id: 'T-001', expires: '2026-08-01T00:00:00Z' }));
    writeAt(root, '.cortex/pulse/threads/T-002-y.md', threadRawFixture({ id: 'T-002', expires: '2999-01-01T00:00:00Z' }));
    age(writeAt(root, '.cortex/pulse/sessions/old.json', '{}\n'));
    age(writeAt(root, '.cortex/pulse/scratch/old/notes.md', '# n\n'));
    age(path.join(root, '.cortex', 'pulse', 'scratch', 'old'));
    age(writeAt(root, '.cortex/pulse/state/sessions/gone.last.json', '{}\n'));
    writeAt(root, '.cortex/pulse/sessions/new.json', '{}\n');
    writeAt(root, '.cortex/pulse/suggestions.md', '---\nkind: pulse-suggestions\n---\n');

    const before = snapshotTree(root);
    await runHygiene(root, { ghBin: emptyGhStub(), now: new Date('2026-09-15T00:00:00.000Z') });
    const after = snapshotTree(root);
    expect(diffTrees(before, after)).toEqual(
      [
        REPORT_REL,
        path.join('.cortex', 'pulse', 'threads', 'T-001-x.md'),
        `(deleted) ${path.join('.cortex', 'pulse', 'sessions', 'old.json')}`,
        `(deleted) ${path.join('.cortex', 'pulse', 'scratch', 'old', 'notes.md')}`,
        `(deleted) ${path.join('.cortex', 'pulse', 'state', 'sessions', 'gone.last.json')}`,
      ].sort(),
    );
  });
});

// ===========================================================================
describe('AC: An open thread past its expiry is expired in place', () => {
  it('T-001 becomes expired with every other line byte-identical; T-002/T-003 untouched; all three remain; the section reports 1 expired', async () => {
    const root = makeCleanProject('thread-expiry');
    const t1 = threadRawFixture({ id: 'T-001', status: 'open', expires: '2026-08-01T00:00:00Z' });
    const t2 = threadRawFixture({ id: 'T-002', status: 'open', expires: '2026-09-16T00:00:00Z' });
    const t3 = threadRawFixture({
      id: 'T-003',
      status: 'answered',
      expires: '2026-08-01T00:00:00Z',
      answered: '2026-08-02T00:00:00.000Z',
      resolved_by: '.cortex/atlas/decisions/x.md',
    });
    writeAt(root, '.cortex/pulse/threads/T-001-x.md', t1);
    writeAt(root, '.cortex/pulse/threads/T-002-y.md', t2);
    writeAt(root, '.cortex/pulse/threads/T-003-z.md', t3);

    const code = await runHygiene(root, { ghBin: emptyGhStub(), now: new Date('2026-09-15T00:00:00.000Z') });
    expect(code).toBe(0);

    const after1 = readThreadRaw(root, 'T-001') as string;
    expect(after1).toMatch(/^status: expired$/m);
    expect(after1.replace('status: expired', 'status: open')).toBe(t1);
    expect(readThreadRaw(root, 'T-002')).toBe(t2);
    expect(readThreadRaw(root, 'T-003')).toBe(t3);
    expect(fs.readdirSync(path.join(root, '.cortex', 'pulse', 'threads'))).toHaveLength(3);

    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    const section = body.split('## Threads and session records')[1]?.split('\n## ')[0] ?? '';
    expect(section).toMatch(/Threads expired in place: 1\b/);
    expect(section).not.toContain('No threads past expiry');
  });
});

// ===========================================================================
describe('AC: Old session records and their scratch copies are deleted together', () => {
  it('old.json, scratch/old/ and gone.last.json go; the fresh trio stays; the section reports 1 record, 1 scratch directory, 1 companion', async () => {
    const root = makeCleanProject('record-retention');
    const stale = new Date(Date.now() - (SESSION_RECORD_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
    const age = (abs: string): string => {
      fs.utimesSync(abs, stale, stale);
      return abs;
    };
    const oldJson = age(writeAt(root, '.cortex/pulse/sessions/old.json', '{}\n'));
    const oldNotes = age(writeAt(root, '.cortex/pulse/scratch/old/notes.md', '# n\n'));
    age(path.dirname(oldNotes));
    const gone = age(writeAt(root, '.cortex/pulse/state/sessions/gone.last.json', '{}\n'));
    const newJson = writeAt(root, '.cortex/pulse/sessions/new.json', '{}\n');
    const newNotes = writeAt(root, '.cortex/pulse/scratch/new/notes.md', '# n\n');
    const newLast = writeAt(root, '.cortex/pulse/state/sessions/new.last.json', '{}\n');

    const code = await runHygiene(root, { ghBin: emptyGhStub() });
    expect(code).toBe(0);

    expect(fs.existsSync(oldJson)).toBe(false);
    expect(fs.existsSync(path.dirname(oldNotes))).toBe(false);
    expect(fs.existsSync(gone)).toBe(false);
    expect(fs.existsSync(newJson)).toBe(true);
    expect(fs.existsSync(newNotes)).toBe(true);
    expect(fs.existsSync(newLast)).toBe(true);

    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    const section = body.split('## Threads and session records')[1]?.split('\n## ')[0] ?? '';
    expect(section).toMatch(/Session records deleted: 1\b/);
    expect(section).toMatch(/Scratch directories deleted: 1\b/);
    expect(section).toMatch(/Stop-companion files deleted: 1\b/);
    expect(section).toMatch(/Threads expired in place: 0\b/);
  });
});

// ===========================================================================
describe('AC: Nothing to expire reports the empty line', () => {
  it('no threads/, sessions/ or scratch/ directory → the exact empty line, exit 0, and the footer names the window', async () => {
    const root = makeCleanProject('nothing-to-expire');
    for (const d of ['threads', 'sessions', 'scratch']) {
      expect(fs.existsSync(path.join(root, '.cortex', 'pulse', d))).toBe(false);
    }
    const code = await runHygiene(root, { ghBin: emptyGhStub() });
    expect(code).toBe(0);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('## Threads and session records');
    expect(body).toContain('No threads past expiry and no session records past retention this cycle.');
    expect(body).toContain(`${SESSION_RECORD_RETENTION_DAYS} days`);
    expect(body).toMatch(/pulse\/sessions\//);
  });
});

// ===========================================================================
describe('AC: Stale session-read ledgers pruned (retention)', () => {
  it('deletes a 15-day-old ledger, keeps a fresh one, and states the count in the report', async () => {
    const root = makeCleanProject('reads-retention');
    const readsDir = path.join(root, '.cortex', 'pulse', 'state', 'reads');
    fs.mkdirSync(readsDir, { recursive: true });
    const stalePath = path.join(readsDir, 'stale-session');
    const freshPath = path.join(readsDir, 'fresh-session');
    fs.writeFileSync(stalePath, '{}\n', 'utf-8');
    fs.writeFileSync(freshPath, '{}\n', 'utf-8');
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    fs.utimesSync(stalePath, fifteenDaysAgo, fifteenDaysAgo);

    const code = await runHygiene(root, { ghBin: emptyGhStub() });
    expect(code).toBe(0);

    expect(fs.existsSync(stalePath)).toBe(false);
    expect(fs.existsSync(freshPath)).toBe(true);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('Stale session-read ledgers cleaned: 1');
  });
});
