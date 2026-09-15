/**
 * Atomic tests — the `cortex thread list|drop|close` verbs (`pulse.threads`
 * Rules 10, 11, 13; plan Tasks 2.1 and 2.2). Each acceptance criterion is a
 * labelled describe whose title matches the spec heading. Every test runs in
 * a sandboxed tmp project and drives `threadCli` directly with an injected
 * `root` and clock (the testability seam, like `pulseCli`). console.log/error
 * are spied so exit codes come from the returned number and output from the
 * captured calls. `promote` is the spec-layer slice (thread-cli.spec.test.ts).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import { makeThread, threadCitation, readThreadRaw } from '../../fixtures/threads.js';
import { seedThreads, readThread } from '../../fixtures/thread-cli.js';
import { threadCli } from '../../../src/pulse/thread-cli.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`thread-cli-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

let out: string[] = [];
let err: string[] = [];
beforeEach(() => {
  out = [];
  err = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    out.push(a.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    err.push(a.join(' '));
  });
});
const stdout = (): string => out.join('\n');
const stderr = (): string => err.join('\n');
const lines = (): string[] => stdout().split('\n').filter((l) => l !== '');

const NOW = new Date('2026-09-16T09:30:00.000Z');

/** The R-001 predicate (compass rule check, regex/absent) over the governed module. */
describe('R-001 — Core makes no LLM calls', () => {
  it('thread-cli.ts imports no LLM SDK', () => {
    const src = fs.readFileSync(path.resolve('src/pulse/thread-cli.ts'), 'utf-8');
    expect(src).not.toMatch(/@anthropic-ai\/|['"]openai['"]|['"]@google\/genai['"]|['"]cohere-ai['"]/);
    expect(src).not.toMatch(/child_process|node:child_process/);
  });
});

// ---------------------------------------------------------------------------
// Rule 11 — `thread list`
// ---------------------------------------------------------------------------

describe('`thread list` filters by status and by `bears_on` prefix', () => {
  function seed(root: string): void {
    seedThreads(root, [
      makeThread({
        id: 'T-001',
        opened: '2026-09-10T10:00:00.000Z',
        bears_on: ['.cortex/compass/rules/R-001-core-no-llm-calls.md'],
        body: 'Do you want the counter in state/ or at the pulse root?',
      }),
      makeThread({
        id: 'T-002',
        kind: 'offer',
        status: 'dropped',
        opened: '2026-09-11T10:00:00.000Z',
        body: 'Want me to wire the verb now?',
      }),
      makeThread({
        id: 'T-003',
        kind: 'finding',
        opened: '2026-09-12T10:00:00.000Z',
        bears_on: ['pulse.usage'],
        body: '2 insight invocations over 55 sessions\n**Kind:** measurement\n**Source:** tag',
      }),
    ]);
  }

  it('defaults to open threads, oldest first, one line each with id, kind, date and key text', async () => {
    const root = tmp('list-default');
    seed(root);
    const code = await threadCli(['list'], root, { now: NOW });
    expect(code).toBe(0);
    expect(lines()).toEqual([
      'T-001  question  2026-09-10  Do you want the counter in state/ or at the pulse root?',
      'T-003  finding  2026-09-12  2 insight invocations over 55 sessions',
    ]);
  });

  it('--status dropped lists exactly the dropped thread', async () => {
    const root = tmp('list-status');
    seed(root);
    expect(await threadCli(['list', '--status', 'dropped'], root, { now: NOW })).toBe(0);
    expect(lines()).toEqual(['T-002  offer  2026-09-11  Want me to wire the verb now?']);
  });

  it('--touching keeps threads with a bears_on entry starting with the argument', async () => {
    const root = tmp('list-touching');
    seed(root);
    expect(await threadCli(['list', '--touching', '.cortex/compass'], root, { now: NOW })).toBe(0);
    expect(lines().map((l) => l.slice(0, 5))).toEqual(['T-001']);
    out = [];
    expect(await threadCli(['list', '--touching', 'pulse.usage'], root, { now: NOW })).toBe(0);
    expect(lines().map((l) => l.slice(0, 5))).toEqual(['T-003']);
  });

  it('truncates the key text to 80 characters', async () => {
    const root = tmp('list-truncate');
    const long = 'x'.repeat(120);
    seedThreads(root, [makeThread({ id: 'T-001', body: long })]);
    expect(await threadCli(['list'], root, { now: NOW })).toBe(0);
    expect(lines()[0]).toBe(`T-001  question  2026-09-15  ${'x'.repeat(80)}`);
  });

  it('prints `No threads.` and exits 0 when nothing matches or the ledger is absent', async () => {
    const root = tmp('list-empty');
    expect(await threadCli(['list'], root, { now: NOW })).toBe(0);
    expect(stdout()).toBe('No threads.');
    out = [];
    seed(root);
    expect(await threadCli(['list', '--status', 'expired'], root, { now: NOW })).toBe(0);
    expect(stdout()).toBe('No threads.');
  });

  it('rejects a --status outside the enum with a usage error (exit 2)', async () => {
    const root = tmp('list-bad-status');
    seed(root);
    expect(await threadCli(['list', '--status', 'maybe'], root, { now: NOW })).toBe(2);
    expect(stderr()).toMatch(/--status/);
    expect(stderr()).toMatch(/open|answered|dropped|expired/);
    expect(stdout()).toBe('');
  });

  it('rejects --touching without a value (exit 2)', async () => {
    const root = tmp('list-bad-touching');
    seed(root);
    expect(await threadCli(['list', '--touching'], root, { now: NOW })).toBe(2);
    expect(stderr()).toMatch(/--touching/);
  });
});

// ---------------------------------------------------------------------------
// Rules 10, 11 — `thread drop` and `thread close`
// ---------------------------------------------------------------------------

describe('`drop` and `close` change status once', () => {
  it('drop moves open → dropped; a later close prints the current status, exits 1 and leaves the file unchanged', async () => {
    const root = tmp('drop-then-close');
    seedThreads(root, [makeThread({ id: 'T-001' })]);

    expect(await threadCli(['drop', 'T-001'], root, { now: NOW })).toBe(0);
    const afterDrop = readThread(root, 'T-001');
    expect(afterDrop?.status).toBe('dropped');
    expect(afterDrop?.answered).toBeUndefined();
    expect(afterDrop?.resolved_by).toBeUndefined();
    expect(afterDrop?.body).toBe('Do you want the counter in state/ or at the pulse root?');

    const rawBefore = readThreadRaw(root, 'T-001');
    const before = snapshotTree(root);
    expect(await threadCli(['close', 'T-001', '--by', '.cortex/atlas/decisions/x.md'], root, { now: NOW })).toBe(1);
    expect(stderr()).toMatch(/T-001/);
    expect(stderr()).toMatch(/dropped/);
    expect(readThreadRaw(root, 'T-001')).toBe(rawBefore);
    expect(snapshotTree(root)).toEqual(before);
  });

  it('drop on a non-open thread prints the current status and exits 1 without writing', async () => {
    const root = tmp('drop-answered');
    seedThreads(root, [
      makeThread({
        id: 'T-004',
        status: 'answered',
        answered: '2026-09-15T11:00:00.000Z',
        resolved_by: threadCitation('s2'),
      }),
    ]);
    const before = snapshotTree(root);
    expect(await threadCli(['drop', 'T-004'], root, { now: NOW })).toBe(1);
    expect(stderr()).toMatch(/answered/);
    expect(snapshotTree(root)).toEqual(before);
  });

  it('an unknown id exits 1 and writes nothing', async () => {
    const root = tmp('drop-unknown');
    seedThreads(root, [makeThread({ id: 'T-001' })]);
    const before = snapshotTree(root);
    expect(await threadCli(['drop', 'T-099'], root, { now: NOW })).toBe(1);
    expect(stderr()).toMatch(/T-099/);
    expect(snapshotTree(root)).toEqual(before);
  });

  it('drop and close require a thread id (exit 2)', async () => {
    const root = tmp('drop-no-id');
    seedThreads(root, [makeThread({ id: 'T-001' })]);
    const before = snapshotTree(root);
    expect(await threadCli(['drop'], root, { now: NOW })).toBe(2);
    expect(await threadCli(['close', '--by', 'x.md'], root, { now: NOW })).toBe(2);
    expect(snapshotTree(root)).toEqual(before);
  });
});

describe('`close` requires `--by` and records it verbatim', () => {
  it('without --by exits 2 with a usage message and writes nothing', async () => {
    const root = tmp('close-no-by');
    seedThreads(root, [makeThread({ id: 'T-002' })]);
    const before = snapshotTree(root);
    expect(await threadCli(['close', 'T-002'], root, { now: NOW })).toBe(2);
    expect(stderr()).toMatch(/--by/);
    expect(snapshotTree(root)).toEqual(before);
    expect(readThread(root, 'T-002')?.status).toBe('open');
  });

  it('--by with a missing value is the same usage error', async () => {
    const root = tmp('close-empty-by');
    seedThreads(root, [makeThread({ id: 'T-002' })]);
    const before = snapshotTree(root);
    expect(await threadCli(['close', 'T-002', '--by'], root, { now: NOW })).toBe(2);
    expect(stderr()).toMatch(/--by/);
    expect(snapshotTree(root)).toEqual(before);
  });

  it('with --by sets status answered, resolved_by as given and answered = now; the body is byte-identical', async () => {
    const root = tmp('close-by');
    seedThreads(root, [makeThread({ id: 'T-002', body: 'Ship the counter under state/?' })]);
    expect(await threadCli(['close', 'T-002', '--by', '.specflow/specs/pulse/threads.spec.md'], root, { now: NOW })).toBe(0);
    const t = readThread(root, 'T-002');
    expect(t?.status).toBe('answered');
    expect(t?.resolved_by).toBe('.specflow/specs/pulse/threads.spec.md');
    expect(t?.answered).toBe('2026-09-16T09:30:00.000Z');
    expect(t?.body).toBe('Ship the counter under state/?');
    expect(readThreadRaw(root, 'T-002')).toMatch(/\nresolved_by: \.specflow\/specs\/pulse\/threads\.spec\.md\n/);
  });
});

// ---------------------------------------------------------------------------
// Rule 11 — the verb grammar itself
// ---------------------------------------------------------------------------

describe('Rule 11 — verb grammar', () => {
  it('no verb or an unknown verb is a usage error (exit 2) that names the four verbs', async () => {
    const root = tmp('usage');
    expect(await threadCli([], root, { now: NOW })).toBe(2);
    expect(stderr()).toMatch(/list/);
    expect(stderr()).toMatch(/drop/);
    expect(stderr()).toMatch(/close/);
    expect(stderr()).toMatch(/promote/);
    err = [];
    expect(await threadCli(['frobnicate', 'T-001'], root, { now: NOW })).toBe(2);
    expect(stderr()).toMatch(/frobnicate/);
  });
});

// ---------------------------------------------------------------------------
// Rule 13 — pulse-confined outside promote
// ---------------------------------------------------------------------------

describe('Only pulse is written outside `promote`', () => {
  it('a list → drop → close sequence touches only files beneath .cortex/pulse/', async () => {
    const root = tmp('pulse-only');
    fs.mkdirSync(path.join(root, '.cortex', 'compass', 'bugs'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'compass', 'bugs', '_index.md'), '# bugs\n', 'utf-8');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export {};\n', 'utf-8');
    seedThreads(root, [makeThread({ id: 'T-001' }), makeThread({ id: 'T-002', kind: 'offer', body: 'Wire it?' })]);
    const before = snapshotTree(root);

    expect(await threadCli(['list'], root, { now: NOW })).toBe(0);
    expect(await threadCli(['drop', 'T-001'], root, { now: NOW })).toBe(0);
    expect(await threadCli(['close', 'T-002', '--by', 'src/a.ts'], root, { now: NOW })).toBe(0);

    const after = snapshotTree(root);
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k));
    expect(changed.length).toBeGreaterThan(0);
    for (const k of changed) expect(k.startsWith(path.join('.cortex', 'pulse') + path.sep)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// atlas.evidence Rule 6 — `thread promote --to atlas/evidence` (grammar and refusals)
// ---------------------------------------------------------------------------
import matter from 'gray-matter';
import { seedSessionRecord } from '../../fixtures/thread-cli.js';

const MEASUREMENT = '2 insight invocations over 55 sessions\n**Kind:** measurement\n**Source:** tag';

function seedEvidenceThreads(root: string): void {
  seedThreads(root, [
    makeThread({ id: 'T-008', kind: 'question', body: 'Should the counter live under state/?' }),
    makeThread({ id: 'T-009', kind: 'finding', body: 'Hygiene never expires unparseable threads\n**Kind:** conclusion\n**Source:** lexicon', bears_on: ['pulse.usage'] }),
    makeThread({ id: 'T-010', kind: 'finding', body: MEASUREMENT, bears_on: [] }),
    makeThread({ id: 'T-011', kind: 'finding', body: MEASUREMENT, bears_on: ['pulse.usage'], session: threadCitation('s1'), sessions: [threadCitation('s1'), threadCitation('s2')] }),
  ]);
}

async function refused(root: string, argv: string[], pattern: RegExp): Promise<void> {
  const before = snapshotTree(root);
  err = [];
  expect(await threadCli(['promote', ...argv], root, { now: NOW })).toBe(2);
  expect(stderr()).toMatch(pattern);
  expect(snapshotTree(root)).toEqual(before);
}

describe('Promote to evidence refuses the wrong kind and demands findings', () => {
  it('a question thread and a conclusion finding exit 2 naming the kind; nothing written, threads stay open', async () => {
    const root = tmp('evidence-kind');
    seedEvidenceThreads(root);
    await refused(root, ['T-008', '--to', 'atlas/evidence', '--finding', 'x=1'], /question/);
    await refused(root, ['T-009', '--to', 'atlas/evidence', '--finding', 'x=1'], /conclusion/);
    expect(readThread(root, 'T-008')?.status).toBe('open');
    expect(readThread(root, 'T-009')?.status).toBe('open');
  });

  it('no --finding exits 2 naming --finding; a malformed --finding (no `=`) too', async () => {
    const root = tmp('evidence-finding');
    seedEvidenceThreads(root);
    await refused(root, ['T-010', '--to', 'atlas/evidence'], /--finding/);
    await refused(root, ['T-011', '--to', 'atlas/evidence', '--finding', 'nope'], /--finding/);
    await refused(root, ['T-011', '--to', 'atlas/evidence', '--finding', '=1'], /--finding/);
    expect(readThread(root, 'T-011')?.status).toBe('open');
  });

  it('an empty resulting bears_on exits 2 naming --bears-on', async () => {
    const root = tmp('evidence-bears-on');
    seedEvidenceThreads(root);
    await refused(root, ['T-010', '--to', 'atlas/evidence', '--finding', 'x=1'], /--bears-on/);
    await refused(root, ['T-011', '--to', 'atlas/evidence', '--finding', 'x=1', '--bears-on'], /--bears-on/);
    expect(readThread(root, 'T-010')?.status).toBe('open');
  });

  it('--finding and --bears-on are usage errors with any other --to; --type and --affects are usage errors with atlas/evidence', async () => {
    const root = tmp('evidence-flags');
    seedEvidenceThreads(root);
    await refused(root, ['T-011', '--to', 'atlas/decisions', '--finding', 'x=1'], /--finding/);
    await refused(root, ['T-011', '--to', 'compass/bugs', '--type', 'test-defect', '--bears-on', 'pulse.usage'], /--bears-on/);
    await refused(root, ['T-011', '--to', 'atlas/evidence', '--finding', 'x=1', '--type', 'test-defect'], /--type/);
    await refused(root, ['T-011', '--to', 'atlas/evidence', '--finding', 'x=1', '--affects', 'src/x.ts'], /--affects/);
    await refused(root, ['T-011'], /atlas\/evidence/);
  });
});

describe('Promote to evidence drafts from the flags and the trail', () => {
  it('--bears-on replaces the thread list; a numeric value is stored as a number, others as strings; the window falls back to `opened` without session records', async () => {
    const root = tmp('evidence-draft');
    seedEvidenceThreads(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'x.ts'), '', 'utf-8');

    expect(
      await threadCli(
        ['promote', 'T-011', '--to', 'atlas/evidence', '--finding', 'rate=0.5', '--finding', 'label=abc', '--finding', 'n=12', '--bears-on', 'src/x.ts', '--bears-on', 'R-001'],
        root,
        { now: NOW },
      ),
    ).toBe(0);

    const target = path.join(root, '.cortex', 'atlas', 'evidence', '2026-09-16-2-insight-invocations-over-55-sessions.md');
    expect(fs.existsSync(target)).toBe(true);
    const data = matter(fs.readFileSync(target, 'utf-8')).data as Record<string, unknown>;
    expect(data['findings']).toEqual([
      { metric: 'rate', value: 0.5 },
      { metric: 'label', value: 'abc' },
      { metric: 'n', value: 12 },
    ]);
    expect(data['bears_on']).toEqual(['src/x.ts', 'R-001']);
    expect(data['window']).toEqual({ from: new Date('2026-09-15T10:00:00.000Z'), to: new Date('2026-09-15T10:00:00.000Z'), sessions: 2 });
    expect(data['instrument']).toBe('session');
    expect(data['kind']).toBe('measurement');
    expect(fs.existsSync(path.join(root, '.cortex', 'atlas', 'evidence', '_index.md'))).toBe(true);
    expect(readThread(root, 'T-011')?.resolved_by).toBe('.cortex/atlas/evidence/2026-09-16-2-insight-invocations-over-55-sessions.md');
  });

  it('the window spans the opener record\'s `ended` to the last record\'s `ended` when both exist; one missing record falls back to `opened` for that end', async () => {
    const root = tmp('evidence-window');
    seedEvidenceThreads(root);
    seedSessionRecord(root, 's1', '2026-09-10T08:00:00.000Z');
    seedSessionRecord(root, 's2', '2026-09-14T20:00:00.000Z');
    expect(await threadCli(['promote', 'T-011', '--to', 'atlas/evidence', '--finding', 'x=1'], root, { now: NOW })).toBe(0);
    const [file] = fs.readdirSync(path.join(root, '.cortex', 'atlas', 'evidence')).filter((f) => f !== '_index.md');
    const data = matter(fs.readFileSync(path.join(root, '.cortex', 'atlas', 'evidence', file as string), 'utf-8')).data as Record<string, unknown>;
    expect(data['window']).toEqual({ from: new Date('2026-09-10T08:00:00.000Z'), to: new Date('2026-09-14T20:00:00.000Z'), sessions: 2 });

    const root2 = tmp('evidence-window-partial');
    seedEvidenceThreads(root2);
    seedSessionRecord(root2, 's2', '2026-09-14T20:00:00.000Z');
    expect(await threadCli(['promote', 'T-011', '--to', 'atlas/evidence', '--finding', 'x=1'], root2, { now: NOW })).toBe(0);
    const [file2] = fs.readdirSync(path.join(root2, '.cortex', 'atlas', 'evidence')).filter((f) => f !== '_index.md');
    const data2 = matter(fs.readFileSync(path.join(root2, '.cortex', 'atlas', 'evidence', file2 as string), 'utf-8')).data as Record<string, unknown>;
    expect(data2['window']).toEqual({ from: new Date('2026-09-15T10:00:00.000Z'), to: new Date('2026-09-14T20:00:00.000Z'), sessions: 2 });
  });
});
