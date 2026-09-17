/**
 * Spec-level tests — `pulse.threads` Rules 11, 12, 13 as one integrated slice:
 * `cortex thread promote` drafting gated files through the session-observe
 * payload shape, checked by the real schema checks (`checkAtlas`, `checkBugs`,
 * `checkProvenance`), the terminal-state rule interacting with promote's
 * no-clobber gate, and the verb reached end to end through the CLI entry
 * (`run` in src/cli/cli.ts, which chdir-scoped tests drive like review-cli).
 * Not a criteria replay: each block accumulates state across several verbs
 * and asserts the cumulative filesystem.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import { makeThread, threadCitation, readThreadRaw } from '../../fixtures/threads.js';
import { seedThreads, readThread, seedBug, touchProjectFile, gatedFiles, seedSessionRecord, seedSpecFile } from '../../fixtures/thread-cli.js';
import { threadCli, DRAFT_LINE_PREFIX } from '../../../src/pulse/thread-cli.js';
import { buildIndex } from '../../../src/schema/index-build.js';
import { loadClauseIndex } from '../../../src/schema/clauses.js';
import { checkAtlas } from '../../../src/schema/checks/atlas.js';
import { checkBugs } from '../../../src/schema/checks/compass.js';
import { checkProvenance } from '../../../src/schema/checks/provenance.js';
import { checkBearsOn } from '../../../src/schema/checks/bears-on.js';
import { checkEvidence } from '../../../src/schema/checks/evidence.js';
import { checkIdRegistry } from '../../../src/schema/checks/registry.js';
import { REGISTRY_FILE, REGISTRY_HEADER } from '../../../src/compass/registry.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`thread-cli-spec-${label}`);
  dirs.push(d);
  return d;
}

let out: string[] = [];
let err: string[] = [];
let originalCwd: string;
beforeEach(() => {
  originalCwd = process.cwd();
  out = [];
  err = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    out.push(a.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    err.push(a.join(' '));
  });
});
afterEach(() => {
  process.chdir(originalCwd);
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});
const stdout = (): string => out.join('\n');
const stderr = (): string => err.join('\n');

const NOW = new Date('2026-09-15T12:00:00.000Z');
const USER = 'fixture-user';

function decisionsDir(root: string): string {
  return path.join(root, '.cortex', 'atlas', 'decisions');
}

async function gatedErrors(root: string): Promise<string[]> {
  const index = await buildIndex(root);
  const violations = [
    ...(await checkAtlas(root, index)),
    ...checkBugs(root, index),
    ...(await checkProvenance(root)),
    ...(await checkBearsOn(root, index, loadClauseIndex(root))),
    ...(await checkEvidence(root)),
  ];
  return violations.filter((v) => v.severity === 'error').map((v) => `${v.check}: ${v.message}`);
}

// ---------------------------------------------------------------------------
// Rule 12 — promote to a decision
// ---------------------------------------------------------------------------

describe('Promote to a decision drafts a schema-valid file', () => {
  it('writes the §4.3 decision with INFERRED confidence and the trail as provenance, then answers the thread', async () => {
    const root = tmp('decision');
    seedSpecFile(root, '.specflow/specs/pulse/usage.spec.md', 'pulse.usage'); // the thread's bears_on must resolve once the draft carries it (3.4)
    const s1 = threadCitation('s1', USER);
    const s2 = threadCitation('s2', USER);
    const body = '2 insight invocations over 55 sessions\n**Kind:** measurement\n**Source:** tag';
    seedThreads(root, [
      makeThread({ id: 'T-007', kind: 'finding', session: s1, sessions: [s1, s2], bears_on: ['pulse.usage'], body }),
    ]);

    expect(await threadCli(['promote', 'T-007', '--to', 'atlas/decisions'], root, { now: NOW })).toBe(0);

    const targetRel = '.cortex/atlas/decisions/2026-09-15-2-insight-invocations-over-55-sessions.md';
    const target = path.join(root, targetRel);
    expect(fs.existsSync(target)).toBe(true);
    expect(stdout()).toContain(targetRel);

    const raw = fs.readFileSync(target, 'utf-8');
    const parsed = matter(raw);
    expect(parsed.data['id']).toBe('decision.2026-09-15-2-insight-invocations-over-55-sessions');
    expect(parsed.data['title']).toBe('2 insight invocations over 55 sessions');
    expect(raw).toMatch(/\ntitle: "2 insight invocations over 55 sessions"\n/);
    expect(raw).toMatch(/\ndate: 2026-09-15T12:00:00\.000Z\nconfidence: INFERRED\n/);
    expect(parsed.data['confidence']).toBe('INFERRED');
    expect(parsed.data['provenance']).toEqual([{ derives_from: s1 }, { derives_from: s2 }]);

    const draftLine = `${DRAFT_LINE_PREFIX} T-007 by \`cortex thread promote\`; review before relying on it.`;
    expect(parsed.content.replace(/^\n/, '')).toBe(`${draftLine}\n\n${body}\n`);

    const t = readThread(root, 'T-007');
    expect(t?.status).toBe('answered');
    expect(t?.resolved_by).toBe(targetRel);
    expect(t?.answered).toBe('2026-09-15T12:00:00.000Z');
    expect(t?.body).toBe(body);

    expect(await gatedErrors(root)).toEqual([]);
  });

  it('a title over 80 characters is cut to 80 and JSON-quoted', async () => {
    const root = tmp('decision-long');
    const long = 'Decision: '.repeat(12).trim(); // 119 chars
    seedThreads(root, [makeThread({ id: 'T-001', body: long })]);
    expect(await threadCli(['promote', 'T-001', '--to', 'atlas/decisions'], root, { now: NOW })).toBe(0);
    const [file] = gatedFiles(root, 'atlas/decisions');
    const data = matter(fs.readFileSync(path.join(decisionsDir(root), file as string), 'utf-8')).data;
    expect(data['title']).toBe(long.slice(0, 80));
    expect(await gatedErrors(root)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 12 — promote to a bug
// ---------------------------------------------------------------------------

describe('Promote to a bug requires a type and resolvable `affects`', () => {
  function seed(root: string): void {
    seedBug(root, 'B-017', 'x');
    touchProjectFile(root, 'src/pulse/hygiene.ts');
    seedThreads(root, [
      makeThread({
        id: 'T-008',
        kind: 'finding',
        bears_on: ['src/pulse/hygiene.ts', 'pulse.usage', 'src/gone.ts'],
        body: 'Hygiene never expires threads it cannot parse\n**Kind:** conclusion\n**Source:** lexicon',
      }),
    ]);
  }

  it('refuses without --type (exit 2, nothing written), then drafts B-018 with the resolvable affects', async () => {
    const root = tmp('bug');
    seed(root);
    const before = snapshotTree(root);

    expect(await threadCli(['promote', 'T-008', '--to', 'compass/bugs'], root, { now: NOW })).toBe(2);
    expect(stderr()).toMatch(/--type/);
    expect(snapshotTree(root)).toEqual(before);
    err = [];

    expect(await threadCli(['promote', 'T-008', '--to', 'compass/bugs', '--type', 'missing-criterion'], root, { now: NOW })).toBe(0);

    const files = gatedFiles(root, 'compass/bugs');
    expect(files).toHaveLength(2);
    const created = files.find((f) => f.startsWith('B-018-')) as string;
    expect(created).toBeDefined();
    expect(created).toMatch(/^B-018-[a-z0-9-]+\.md$/);

    const raw = fs.readFileSync(path.join(root, '.cortex', 'compass', 'bugs', created), 'utf-8');
    const parsed = matter(raw);
    expect(parsed.data['id']).toBe('B-018');
    expect(parsed.data['title']).toBe('Hygiene never expires threads it cannot parse');
    expect(parsed.data['type']).toBe('missing-criterion');
    expect(parsed.data['severity']).toBe('medium');
    expect(parsed.data['status']).toBe('open');
    expect(parsed.data['affects']).toEqual(['src/pulse/hygiene.ts']);
    expect(String((parsed.data['opened'] as Date).toISOString?.() ?? parsed.data['opened'])).toBe('2026-09-15T12:00:00.000Z');
    expect(parsed.content.replace(/^\n/, '')).toBe(
      `${DRAFT_LINE_PREFIX} T-008 by \`cortex thread promote\`; review before relying on it.\n\n` +
        'Hygiene never expires threads it cannot parse\n**Kind:** conclusion\n**Source:** lexicon\n',
    );

    const t = readThread(root, 'T-008');
    expect(t?.status).toBe('answered');
    expect(t?.resolved_by).toBe(`.cortex/compass/bugs/${created}`);

    expect(await gatedErrors(root)).toEqual([]);
  });

  it('rejects a --type outside the seven-type enum (exit 2, nothing written)', async () => {
    const root = tmp('bug-bad-type');
    seed(root);
    const before = snapshotTree(root);
    expect(await threadCli(['promote', 'T-008', '--to', 'compass/bugs', '--type', 'typo'], root, { now: NOW })).toBe(2);
    expect(stderr()).toMatch(/--type/);
    expect(stderr()).toMatch(/missing-criterion/);
    expect(snapshotTree(root)).toEqual(before);
  });

  it('explicit --affects values are kept verbatim, ids included, and repeatable', async () => {
    const root = tmp('bug-affects');
    seed(root);
    expect(
      await threadCli(
        ['promote', 'T-008', '--to', 'compass/bugs', '--type', 'layer-drift', '--affects', 'pulse.usage', '--affects', 'src/pulse/hygiene.ts'],
        root,
        { now: NOW },
      ),
    ).toBe(0);
    const created = gatedFiles(root, 'compass/bugs').find((f) => f.startsWith('B-018-')) as string;
    const data = matter(fs.readFileSync(path.join(root, '.cortex', 'compass', 'bugs', created), 'utf-8')).data;
    expect(data['affects']).toEqual(['pulse.usage', 'src/pulse/hygiene.ts']);
    expect(data['type']).toBe('layer-drift');
  });

  it('refuses when no bears_on entry resolves and --affects is absent (exit 2, naming --affects)', async () => {
    const root = tmp('bug-no-affects');
    seedBug(root, 'B-017', 'x');
    seedThreads(root, [makeThread({ id: 'T-008', bears_on: ['pulse.usage', 'src/gone.ts'] })]);
    const before = snapshotTree(root);
    expect(await threadCli(['promote', 'T-008', '--to', 'compass/bugs', '--type', 'wrong-rule'], root, { now: NOW })).toBe(2);
    expect(stderr()).toMatch(/--affects/);
    expect(snapshotTree(root)).toEqual(before);
    expect(readThread(root, 'T-008')?.status).toBe('open');
  });

  it('the bug id is the next after the highest on disk, with a bare-id or unpadded filename tolerated', async () => {
    const root = tmp('bug-next-id');
    seedBug(root, 'B-003', 'a');
    seedBug(root, 'B-1002', 'b');
    touchProjectFile(root, 'src/a.ts');
    seedThreads(root, [makeThread({ id: 'T-001', bears_on: ['src/a.ts'] })]);
    expect(await threadCli(['promote', 'T-001', '--to', 'compass/bugs', '--type', 'test-defect'], root, { now: NOW })).toBe(0);
    expect(gatedFiles(root, 'compass/bugs').some((f) => f.startsWith('B-1003-'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rules 10 + 12 — refusals, reserved target, no clobber, terminal state
// ---------------------------------------------------------------------------

describe('Promote refuses unknown targets, and never clobbers', () => {
  it('compass/rules exits 2; atlas/evidence on a question thread exits 2 naming the kind; decisions succeeds once and then exits 1 on the existing target', async () => {
    const root = tmp('refusals');
    seedThreads(root, [makeThread({ id: 'T-009', body: 'Keep the counter under state/' })]);

    const before = snapshotTree(root);
    expect(await threadCli(['promote', 'T-009', '--to', 'compass/rules'], root, { now: NOW })).toBe(2);
    expect(stderr()).toMatch(/--to/);
    expect(snapshotTree(root)).toEqual(before);
    err = [];

    expect(await threadCli(['promote', 'T-009', '--to', 'atlas/evidence', '--finding', 'x=1'], root, { now: NOW })).toBe(2);
    expect(stderr()).toMatch(/question/);
    expect(stderr()).not.toMatch(/reserved/);
    expect(snapshotTree(root)).toEqual(before);
    expect(readThread(root, 'T-009')?.status).toBe('open');
    err = [];

    expect(await threadCli(['promote', 'T-009', '--to', 'compass/rules'], root, { now: NOW })).toBe(2);
    expect(stderr()).toMatch(/--to/);
    expect(snapshotTree(root)).toEqual(before);
    err = [];

    expect(await threadCli(['promote', 'T-009'], root, { now: NOW })).toBe(2);
    expect(stderr()).toMatch(/--to/);
    expect(snapshotTree(root)).toEqual(before);
    err = [];

    expect(await threadCli(['promote', 'T-009', '--to', 'atlas/decisions'], root, { now: NOW })).toBe(0);
    const [created] = gatedFiles(root, 'atlas/decisions');
    expect(created).toBe('2026-09-15-keep-the-counter-under-state.md');
    expect(readThread(root, 'T-009')?.status).toBe('answered');

    const afterPromote = snapshotTree(root);
    expect(await threadCli(['promote', 'T-009', '--to', 'atlas/decisions'], root, { now: NOW })).toBe(1);
    expect(stderr()).toMatch(/2026-09-15-keep-the-counter-under-state\.md/);
    expect(snapshotTree(root)).toEqual(afterPromote);
  });

  it('an open thread whose decision target already exists is refused and stays open', async () => {
    const root = tmp('clobber-open');
    seedThreads(root, [makeThread({ id: 'T-001', body: 'Keep the counter under state/' })]);
    fs.mkdirSync(decisionsDir(root), { recursive: true });
    const existing = path.join(decisionsDir(root), '2026-09-15-keep-the-counter-under-state.md');
    fs.writeFileSync(existing, '---\nid: decision.2026-09-15-keep-the-counter-under-state\ntitle: x\ndate: 2026-09-15T00:00:00Z\n---\n\nhuman-written\n', 'utf-8');
    const before = snapshotTree(root);
    expect(await threadCli(['promote', 'T-001', '--to', 'atlas/decisions'], root, { now: NOW })).toBe(1);
    expect(snapshotTree(root)).toEqual(before);
    expect(readThread(root, 'T-001')?.status).toBe('open');
  });

  it('promote on an unknown or non-open thread exits 1 and writes nothing', async () => {
    const root = tmp('promote-terminal');
    seedThreads(root, [makeThread({ id: 'T-002', status: 'expired' })]);
    const before = snapshotTree(root);
    expect(await threadCli(['promote', 'T-002', '--to', 'atlas/decisions'], root, { now: NOW })).toBe(1);
    expect(stderr()).toMatch(/expired/);
    expect(await threadCli(['promote', 'T-050', '--to', 'atlas/decisions'], root, { now: NOW })).toBe(1);
    expect(stderr()).toMatch(/T-050/);
    expect(snapshotTree(root)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Rule 13 — promote writes exactly one gated file plus the thread
// ---------------------------------------------------------------------------

describe('Rule 13 — promote writes one gated file and the thread, nothing else', () => {
  it('the diff after a decision promote is exactly the new decision and the rewritten thread file', async () => {
    const root = tmp('one-file');
    fs.mkdirSync(path.join(root, '.cortex', 'compass', 'bugs'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'compass', 'bugs', '_index.md'), '# bugs\n', 'utf-8');
    seedThreads(root, [makeThread({ id: 'T-001' }), makeThread({ id: 'T-002', kind: 'offer', body: 'Wire it?' })]);
    const before = snapshotTree(root);
    expect(await threadCli(['promote', 'T-002', '--to', 'atlas/decisions'], root, { now: NOW })).toBe(0);
    const after = snapshotTree(root);
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k)).sort();
    expect(changed).toEqual([
      path.join('.cortex', 'atlas', 'decisions', '2026-09-15-wire-it.md'),
      path.join('.cortex', 'pulse', 'threads', 'T-002-wire-it.md'),
    ]);
    expect(readThreadRaw(root, 'T-001')).toBe(before.get(path.join('.cortex', 'pulse', 'threads', 'T-001-do-you-want-the-counter-in-state-or-at-the-pulse-root.md')));
  });
});

// ---------------------------------------------------------------------------
// Rule 11 — wired as `cortex thread …` through the CLI entry
// ---------------------------------------------------------------------------

describe('Rule 11 — `cortex thread` is dispatched by the CLI entry under the pulse chokepoint', () => {
  it('run([thread, list]) exits 0 against the cwd project and migrates a legacy pulse layout first', async () => {
    const root = tmp('cli-wire');
    const pulseDir = path.join(root, '.cortex', 'pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(path.join(pulseDir, '.suggestion-counter'), '7\n', 'utf-8');
    seedThreads(root, [makeThread({ id: 'T-001' })]);
    process.chdir(root);

    const { run } = await import('../../../src/cli/cli.js');
    expect(await run(['thread', 'list'])).toBe(0);
    expect(stdout()).toMatch(/^T-001  question  2026-09-15  Do you want the counter/m);
    // the migration chokepoint ran: the legacy dotfile moved under state/
    expect(fs.existsSync(path.join(pulseDir, 'state', 'suggestion-counter'))).toBe(true);
    expect(fs.existsSync(path.join(pulseDir, '.suggestion-counter'))).toBe(false);
  });

  it('run([thread, close, …]) forwards the flags and exits with the verb’s code', async () => {
    const root = tmp('cli-close');
    seedThreads(root, [makeThread({ id: 'T-001' })]);
    process.chdir(root);
    const { run } = await import('../../../src/cli/cli.js');
    expect(await run(['thread', 'close', 'T-001'])).toBe(2);
    expect(await run(['thread', 'close', 'T-001', '--by', 'RULES.md'])).toBe(0);
    expect(readThread(root, 'T-001')?.resolved_by).toBe('RULES.md');
  });
});

// ---------------------------------------------------------------------------
// Rule 12 (3.4) — promote to evidence (atlas.evidence Rule 6)
// ---------------------------------------------------------------------------

describe('Promote to evidence drafts a schema-valid file from a measurement finding', () => {
  it('T-007 (finding, measurement, two cited sessions with records) → the §4.3 evidence file, the thread answered, every gated check clean', async () => {
    const root = tmp('evidence');
    seedSpecFile(root, '.specflow/specs/pulse/usage.spec.md', 'pulse.usage');
    const s1 = threadCitation('s1', USER);
    const s2 = threadCitation('s2', USER);
    seedSessionRecord(root, 's1', '2026-09-10T08:00:00.000Z', USER);
    seedSessionRecord(root, 's2', '2026-09-14T20:00:00.000Z', USER);
    const body = '2 insight invocations over 55 sessions\n**Kind:** measurement\n**Source:** tag';
    seedThreads(root, [
      makeThread({
        id: 'T-007',
        kind: 'finding',
        session: s1,
        sessions: [s1, s2],
        bears_on: ['pulse.usage', '.specflow/specs/pulse/usage.spec.md'],
        body,
      }),
    ]);

    expect(
      await threadCli(['promote', 'T-007', '--to', 'atlas/evidence', '--finding', 'insight.invocations=2', '--finding', 'sessions=55'], root, { now: NOW, user: USER }),
    ).toBe(0);

    const targetRel = '.cortex/atlas/evidence/2026-09-15-2-insight-invocations-over-55-sessions.md';
    const target = path.join(root, targetRel);
    expect(fs.existsSync(target)).toBe(true);
    expect(stdout()).toContain(targetRel);
    expect(fs.existsSync(path.join(root, '.cortex', 'atlas', 'evidence', '_index.md'))).toBe(true);

    const raw = fs.readFileSync(target, 'utf-8');
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    expect(data['id']).toBe('evidence.2026-09-15-2-insight-invocations-over-55-sessions');
    expect(data['title']).toBe('2 insight invocations over 55 sessions');
    expect(raw).toMatch(/\ntitle: "2 insight invocations over 55 sessions"\ndate: 2026-09-15T12:00:00\.000Z\nkind: measurement\ninstrument: session\nwindow:\n/);
    expect(data['kind']).toBe('measurement');
    expect(data['instrument']).toBe('session');
    expect(data['window']).toEqual({ from: new Date('2026-09-10T08:00:00.000Z'), to: new Date('2026-09-14T20:00:00.000Z'), sessions: 2 });
    expect(data['findings']).toEqual([
      { metric: 'insight.invocations', value: 2 },
      { metric: 'sessions', value: 55 },
    ]);
    expect(data['bears_on']).toEqual(['pulse.usage', '.specflow/specs/pulse/usage.spec.md']);
    expect(data['provenance']).toEqual([{ derives_from: s1 }, { derives_from: s2 }]);
    expect('supersedes' in data).toBe(false);

    const draftLine = `${DRAFT_LINE_PREFIX} T-007 by \`cortex thread promote\`; review before relying on it.`;
    expect(parsed.content.replace(/^\n/, '')).toBe(`${draftLine}\n\n${body}\n`);

    const t = readThread(root, 'T-007');
    expect(t?.status).toBe('answered');
    expect(t?.resolved_by).toBe(targetRel);
    expect(t?.answered).toBe('2026-09-15T12:00:00.000Z');
    expect(t?.body).toBe(body);

    expect(await gatedErrors(root)).toEqual([]);

    // No clobber on a second promote of a same-keyed thread the same day.
    seedThreads(root, [makeThread({ id: 'T-012', kind: 'finding', session: s1, sessions: [s1], bears_on: ['pulse.usage'], body })]);
    const after = snapshotTree(root);
    expect(await threadCli(['promote', 'T-012', '--to', 'atlas/evidence', '--finding', 'x=1'], root, { now: NOW, user: USER })).toBe(1);
    expect(stderr()).toMatch(/2026-09-15-2-insight-invocations-over-55-sessions\.md/);
    expect(snapshotTree(root)).toEqual(after);
    expect(readThread(root, 'T-012')?.status).toBe('open');
  });

  it('the four refusals of the AC leave threads and filesystem unchanged and name the kind, --finding, or --bears-on', async () => {
    const root = tmp('evidence-refusals');
    seedThreads(root, [
      makeThread({ id: 'T-008', kind: 'question', body: 'Should the counter live under state/?' }),
      makeThread({ id: 'T-009', kind: 'finding', body: 'Hygiene never expires unparseable threads\n**Kind:** conclusion\n**Source:** lexicon' }),
      makeThread({ id: 'T-010', kind: 'finding', body: 'Two invocations\n**Kind:** measurement\n**Source:** tag', bears_on: [] }),
    ]);
    const before = snapshotTree(root);
    const runs: [string[], RegExp][] = [
      [['T-008', '--to', 'atlas/evidence', '--finding', 'x=1'], /question/],
      [['T-009', '--to', 'atlas/evidence', '--finding', 'x=1'], /conclusion/],
      [['T-010', '--to', 'atlas/evidence'], /--finding/],
      [['T-010', '--to', 'atlas/evidence', '--finding', 'x=1'], /--bears-on/],
    ];
    for (const [argv, pattern] of runs) {
      err = [];
      expect(await threadCli(['promote', ...argv], root, { now: NOW, user: USER })).toBe(2);
      expect(stderr()).toMatch(pattern);
      expect(snapshotTree(root)).toEqual(before);
    }
    for (const id of ['T-008', 'T-009', 'T-010']) expect(readThread(root, id)?.status).toBe('open');
    expect(fs.existsSync(path.join(root, '.cortex', 'atlas'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 12 (3.4 fifth revision) — promote --to compass/bugs allocates through
// the id registry (`schema.id-registry` "Promote allocates through the
// registry") and stamps `found_at_commit` (`compass.bug-currency` "Promote
// stamps the draft"). Additive — wave follow-up B, batch 2.
// ---------------------------------------------------------------------------

const SHA_MAIN = '2b217dfa9c3e4f5061728394a5b6c7d8e9f01234';

/** A fake `.git` whose HEAD resolves to `sha` by file I/O (no git subprocess). */
function fakeGit(root: string, sha: string): void {
  fs.mkdirSync(path.join(root, '.git', 'refs', 'heads'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf-8');
  fs.writeFileSync(path.join(root, '.git', 'refs', 'heads', 'main'), `${sha}\n`, 'utf-8');
}

function registryText(root: string): string {
  return fs.readFileSync(path.join(root, REGISTRY_FILE), 'utf-8');
}

describe('Promote allocates through the registry', () => {
  it('a registry ending `B-019 x` and T-008 → B-020-<slug>.md, the registry\'s last line is `B-020 <slug>`, and check.id-registry is clean', async () => {
    const root = tmp('registry-alloc');
    seedBug(root, 'B-019', 'x'); // the registry's last line has its file (an initialised project)
    touchProjectFile(root, 'src/a.ts');
    seedThreads(root, [makeThread({ id: 'T-008', kind: 'finding', bears_on: ['src/a.ts'], body: 'Flaky tier ordering\n**Kind:** conclusion\n**Source:** a session' })]);
    fs.mkdirSync(path.join(root, '.cortex', 'compass'), { recursive: true });
    fs.writeFileSync(path.join(root, REGISTRY_FILE), `${REGISTRY_HEADER}\nB-019 x\n`, 'utf-8');

    expect(await threadCli(['promote', 'T-008', '--to', 'compass/bugs', '--type', 'test-defect', '--affects', 'src/a.ts'], root, { now: NOW })).toBe(0);

    const created = gatedFiles(root, 'compass/bugs').find((f) => f.startsWith('B-020-')) as string;
    expect(created).toBe('B-020-flaky-tier-ordering.md');
    const text = registryText(root);
    expect(text.endsWith('\nB-019 x\nB-020 flaky-tier-ordering\n')).toBe(true);
    expect(checkIdRegistry(root)).toEqual([]);
    expect(await gatedErrors(root)).toEqual([]);
  });

  it('the registry wins over the files on disk: B-003 and B-1002 on disk plus a registry line B-2000 → B-2001', async () => {
    const root = tmp('registry-max');
    seedBug(root, 'B-003', 'a');
    seedBug(root, 'B-1002', 'b');
    touchProjectFile(root, 'src/a.ts');
    seedThreads(root, [makeThread({ id: 'T-001', bears_on: ['src/a.ts'] })]);
    fs.writeFileSync(path.join(root, REGISTRY_FILE), `${REGISTRY_HEADER}\nB-003 a\nB-1002 b\nB-2000 reserved\n`, 'utf-8');
    expect(await threadCli(['promote', 'T-001', '--to', 'compass/bugs', '--type', 'test-defect'], root, { now: NOW })).toBe(0);
    expect(gatedFiles(root, 'compass/bugs').some((f) => f.startsWith('B-2001-'))).toBe(true);
    expect(registryText(root).endsWith('\nB-2000 reserved\nB-2001 do-you-want-the-counter-in-state-or-at-the-pulse-root\n')).toBe(true);
  });

  it('with no registry, promote creates it from the files on disk first and then appends (a pre-registry project never falls back to the old scheme)', async () => {
    const root = tmp('registry-absent');
    seedBug(root, 'B-017', 'x');
    touchProjectFile(root, 'src/a.ts');
    seedThreads(root, [makeThread({ id: 'T-001', bears_on: ['src/a.ts'] })]);
    expect(fs.existsSync(path.join(root, REGISTRY_FILE))).toBe(false);
    expect(await threadCli(['promote', 'T-001', '--to', 'compass/bugs', '--type', 'test-defect'], root, { now: NOW })).toBe(0);
    expect(registryText(root)).toBe(`${REGISTRY_HEADER}\nB-017 x\nB-018 do-you-want-the-counter-in-state-or-at-the-pulse-root\n`);
    expect(checkIdRegistry(root)).toEqual([]);
  });

  it('a bug promote writes exactly the bug file, the thread and the registry (Rule 13 plus the registry append)', async () => {
    const root = tmp('bug-diff');
    touchProjectFile(root, 'src/a.ts');
    seedThreads(root, [makeThread({ id: 'T-001', bears_on: ['src/a.ts'] }), makeThread({ id: 'T-002', kind: 'offer', body: 'Wire it?' })]);
    fs.mkdirSync(path.join(root, '.cortex', 'compass'), { recursive: true });
    fs.writeFileSync(path.join(root, REGISTRY_FILE), `${REGISTRY_HEADER}\n`, 'utf-8');
    const before = snapshotTree(root);
    expect(await threadCli(['promote', 'T-001', '--to', 'compass/bugs', '--type', 'test-defect'], root, { now: NOW })).toBe(0);
    const after = snapshotTree(root);
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k)).sort();
    expect(changed).toEqual([
      path.join('.cortex', 'compass', 'bugs', 'B-001-do-you-want-the-counter-in-state-or-at-the-pulse-root.md'),
      path.join('.cortex', 'compass', 'registry.md'),
      path.join('.cortex', 'pulse', 'threads', 'T-001-do-you-want-the-counter-in-state-or-at-the-pulse-root.md'),
    ]);
  });
});

describe('Promote stamps the draft', () => {
  it('in a repo whose head is 2b217df… the drafted frontmatter carries found_at_commit: 2b217df, and check.bug accepts it', async () => {
    const root = tmp('stamp');
    fakeGit(root, SHA_MAIN);
    touchProjectFile(root, 'src/a.ts');
    seedThreads(root, [makeThread({ id: 'T-010', kind: 'finding', bears_on: ['src/a.ts'], body: 'Layer drift in a\n**Kind:** conclusion\n**Source:** a session' })]);
    expect(await threadCli(['promote', 'T-010', '--to', 'compass/bugs', '--type', 'layer-drift', '--affects', 'src/a.ts'], root, { now: NOW })).toBe(0);
    const created = gatedFiles(root, 'compass/bugs').find((f) => f.startsWith('B-001-')) as string;
    const raw = fs.readFileSync(path.join(root, '.cortex', 'compass', 'bugs', created), 'utf-8');
    expect(raw).toContain('\nfound_at_commit: 2b217df\n');
    const data = matter(raw).data;
    expect(data['found_at_commit']).toBe('2b217df');
    expect(data['owner']).toBeUndefined();
    expect(data['fix_in_flight']).toBeUndefined();
    // Key order: after `opened`, before the closing fence (§4.2 optional field, drafted last).
    expect(raw.indexOf('\nopened: ')).toBeLessThan(raw.indexOf('\nfound_at_commit: '));
    expect(await gatedErrors(root)).toEqual([]);
  });

  it('in a non-git directory the draft has no found_at_commit key and still passes check.bug', async () => {
    const root = tmp('no-stamp');
    touchProjectFile(root, 'src/a.ts');
    seedThreads(root, [makeThread({ id: 'T-010', kind: 'finding', bears_on: ['src/a.ts'], body: 'Layer drift in a\n**Kind:** conclusion\n**Source:** a session' })]);
    expect(fs.existsSync(path.join(root, '.git'))).toBe(false);
    expect(await threadCli(['promote', 'T-010', '--to', 'compass/bugs', '--type', 'layer-drift', '--affects', 'src/a.ts'], root, { now: NOW })).toBe(0);
    const created = gatedFiles(root, 'compass/bugs').find((f) => f.startsWith('B-001-')) as string;
    const raw = fs.readFileSync(path.join(root, '.cortex', 'compass', 'bugs', created), 'utf-8');
    expect(raw).not.toContain('found_at_commit');
    expect(matter(raw).data['found_at_commit']).toBeUndefined();
    expect(await gatedErrors(root)).toEqual([]);
  });

  it('a decision promote is not stamped (the field is a bug-ledger field)', async () => {
    const root = tmp('stamp-decision');
    fakeGit(root, SHA_MAIN);
    seedThreads(root, [makeThread({ id: 'T-002', kind: 'offer', body: 'Wire it?' })]);
    expect(await threadCli(['promote', 'T-002', '--to', 'atlas/decisions'], root, { now: NOW })).toBe(0);
    const raw = fs.readFileSync(path.join(decisionsDir(root), '2026-09-15-wire-it.md'), 'utf-8');
    expect(raw).not.toContain('found_at_commit');
  });
});
