/**
 * Atomic tests — check.threads (schema §4.5.3, Appendix A; pulse.threads Rule 1
 * "validated by" clause and the AC "Malformed thread files are warned, never
 * fatal") plus the check.pulse `threads/**` skip. Sandboxed tmp roots only.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkThreads } from '../../../src/schema/checks/threads.js';
import { checkPulse } from '../../../src/schema/checks/pulse.js';
import { validate } from '../../../src/schema/validate.js';
import { serialiseThread } from '../../../src/pulse/threads.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/hooks-harness.js';
import { makeThread, threadRawFixture, threadsDirOf } from '../../fixtures/threads.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`threads-check-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function writeLedgerFile(root: string, name: string, raw: string): string {
  const dir = threadsDirOf(root);
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, name);
  fs.writeFileSync(abs, raw, 'utf-8');
  return abs;
}

function keysOf(violations: { location: { key?: string } }[]): string[] {
  return violations.map((v) => v.location.key ?? '').sort();
}

describe('check.threads: the contract file passes', () => {
  it('a serialised well-formed thread yields no violation', async () => {
    const root = tmp('ok');
    writeLedgerFile(root, 'T-001-do-you-want.md', serialiseThread(makeThread()));
    expect(await checkThreads(root)).toEqual([]);
  });

  it('an answered thread with answered + resolved_by passes; bears_on may be empty', async () => {
    const root = tmp('ok-answered');
    writeLedgerFile(
      root,
      'T-002-x.md',
      serialiseThread(
        makeThread({ id: 'T-002', status: 'answered', answered: '2026-09-16T00:00:00.000Z', resolved_by: 'claude-sessions/u/s2' }),
      ),
    );
    expect(await checkThreads(root)).toEqual([]);
  });

  it('tolerates an absent threads directory', async () => {
    expect(await checkThreads(tmp('absent'))).toEqual([]);
  });
});

describe('check.threads: AC "Malformed thread files are warned, never fatal"', () => {
  it('status: maybe and no expires → exactly the enum warning and the missing-field warning, both warning severity', async () => {
    const root = tmp('malformed');
    const raw = threadRawFixture({ id: 'T-010' }).replace('status: open', 'status: maybe').replace(/^expires: .*\n/m, '');
    const abs = writeLedgerFile(root, 'T-010-x.md', raw);
    const violations = await checkThreads(root);
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.severity === 'warning' && v.check === 'check.threads' && v.clause === '§4.5.3' && v.location.path === abs)).toBe(true);
    expect(keysOf(violations)).toEqual(['expires', 'status']);
    expect(violations.find((v) => v.location.key === 'status')!.message).toContain('maybe');
  });

  it('through `validate`, the warnings appear and the report stays conformant (exit code unaffected)', async () => {
    const root = path.join(os.tmpdir(), `cortex-threads-validate-${Date.now()}`);
    fs.cpSync(path.resolve('tests/fixtures/valid'), root, { recursive: true });
    dirs.push(root);
    const raw = threadRawFixture({ id: 'T-010' }).replace('status: open', 'status: maybe').replace(/^expires: .*\n/m, '');
    writeLedgerFile(root, 'T-010-x.md', raw);
    const report = await validate(root, { root });
    const mine = report.violations.filter((v) => v.check === 'check.threads');
    expect(keysOf(mine)).toEqual(['expires', 'status']);
    expect(report.violations.filter((v) => v.check === 'check.pulse')).toEqual([]);
    expect(report.conformant).toBe(true);
    expect(report.counts.error).toBe(0);
  });
});

describe('check.threads: every Appendix A rule fires at warning severity', () => {
  it('id shape and filename agreement', async () => {
    const root = tmp('id');
    writeLedgerFile(root, 'T-001-a.md', threadRawFixture({ id: 'T-001' }).replace('id: T-001', 'id: T-1'));
    writeLedgerFile(root, 'T-002-b.md', threadRawFixture({ id: 'T-003' }));
    const violations = await checkThreads(root);
    expect(keysOf(violations)).toEqual(['id', 'id']);
    expect(violations.map((v) => v.message).join(' ')).toContain('T-002-b.md');
  });

  it('kind and status enums', async () => {
    const root = tmp('enums');
    writeLedgerFile(root, 'T-001-a.md', threadRawFixture().replace('kind: question', 'kind: rumour').replace('status: open', 'status: pending'));
    expect(keysOf(await checkThreads(root))).toEqual(['kind', 'status']);
  });

  it('opened and expires must be iso-datetimes; missing counts as well', async () => {
    const root = tmp('dates');
    writeLedgerFile(root, 'T-001-a.md', threadRawFixture().replace(/^opened: .*$/m, 'opened: yesterday').replace(/^expires: .*$/m, 'expires: soon'));
    writeLedgerFile(root, 'T-002-b.md', threadRawFixture({ id: 'T-002' }).replace(/^opened: .*\n/m, ''));
    expect(keysOf(await checkThreads(root))).toEqual(['expires', 'opened', 'opened']);
  });

  it('answered and resolved_by present iff status is answered', async () => {
    const root = tmp('answered-iff');
    writeLedgerFile(root, 'T-001-a.md', threadRawFixture({ id: 'T-001', status: 'answered' }));
    writeLedgerFile(root, 'T-002-b.md', threadRawFixture({ id: 'T-002', status: 'open', answered: '2026-09-16T00:00:00.000Z', resolved_by: 'x.md' }));
    writeLedgerFile(root, 'T-003-c.md', threadRawFixture({ id: 'T-003', status: 'answered', answered: 'never', resolved_by: 'x.md' }));
    const violations = await checkThreads(root);
    expect(keysOf(violations)).toEqual(['answered', 'answered', 'answered', 'resolved_by', 'resolved_by']);
  });

  it('session must be a claude-sessions/<user>/<id> citation; sessions a non-empty list of the same', async () => {
    const root = tmp('citations');
    writeLedgerFile(root, 'T-001-a.md', threadRawFixture().replace(/^session: .*$/m, 'session: s1'));
    writeLedgerFile(root, 'T-002-b.md', threadRawFixture({ id: 'T-002' }).replace(/^sessions:\n  - .*\n/m, 'sessions: []\n'));
    writeLedgerFile(root, 'T-003-c.md', threadRawFixture({ id: 'T-003' }).replace(/^sessions:\n  - .*\n/m, 'sessions:\n  - claude-sessions/u/s1\n  - bare-id\n'));
    writeLedgerFile(root, 'T-004-d.md', threadRawFixture({ id: 'T-004' }).replace(/^session: .*\n/m, ''));
    expect(keysOf(await checkThreads(root))).toEqual(['session', 'session', 'sessions', 'sessions']);
  });

  it('bears_on is shape-checked only: must be a list of strings, entries never resolved', async () => {
    const root = tmp('bears-on');
    writeLedgerFile(root, 'T-001-a.md', threadRawFixture({ bears_on: ['does/not/exist.md', 'nor.this.id'] }));
    writeLedgerFile(root, 'T-002-b.md', threadRawFixture({ id: 'T-002' }).replace('bears_on: []', 'bears_on: src/x.ts'));
    writeLedgerFile(root, 'T-003-c.md', threadRawFixture({ id: 'T-003' }).replace('bears_on: []', 'bears_on:\n  - 42'));
    writeLedgerFile(root, 'T-004-d.md', threadRawFixture({ id: 'T-004' }).replace('bears_on: []\n', ''));
    expect(keysOf(await checkThreads(root))).toEqual(['bears_on', 'bears_on', 'bears_on']);
  });

  it('ids must be unique across the directory', async () => {
    const root = tmp('unique');
    writeLedgerFile(root, 'T-001-a.md', threadRawFixture({ id: 'T-001' }));
    writeLedgerFile(root, 'T-001-b.md', threadRawFixture({ id: 'T-001' }));
    const violations = await checkThreads(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.location.key).toBe('id');
    expect(violations[0]!.message).toContain('T-001');
  });

  it('a file without frontmatter is one warning, never a throw', async () => {
    const root = tmp('nofm');
    writeLedgerFile(root, 'T-009-z.md', 'just prose\n');
    const violations = await checkThreads(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.severity).toBe('warning');
  });
});

describe('check.pulse skips threads/** (Appendix A, 3.3 third revision)', () => {
  it('a thread file lacks kind/generated/loop yet check.pulse is silent for it, while a header-less pulse root file still warns', async () => {
    const root = tmp('pulse-skip');
    writeLedgerFile(root, 'T-001-a.md', serialiseThread(makeThread()));
    const stray = path.join(root, '.cortex', 'pulse', 'stray.md');
    fs.writeFileSync(stray, '# no header\n', 'utf-8');
    const violations = await checkPulse(root);
    expect(violations.some((v) => v.location.path === stray)).toBe(true);
    expect(violations.some((v) => v.location.path.includes(`${path.sep}threads${path.sep}`))).toBe(false);
  });
});
