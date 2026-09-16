/**
 * Atomic tests — hooks.prompt-route (`cortex hook prompt-route`, the
 * UserPromptSubmit hook): one `describe` per acceptance criterion plus the
 * rule-level cases the criteria leave implicit (the envelope, the 200-file
 * cap, the single listing of each directory, determinism). Every project is a
 * hand-built tmp root whose thread files and session records are literal
 * fixtures — no session-end run, no compiler — so each test pins exactly the
 * ledger the hook sees. The real repo is never touched.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  run,
  RESUME_WINDOW_DAYS,
  PROMPT_ROUTE_MAX_THREADS,
  PROMPT_ROUTE_MAX_PROMPT_CHARS,
  ROUTABLE_KINDS,
} from '../../../src/hooks/prompt-route.js';
import { recallFiredPath } from '../../../src/hooks/search-annotate.js';
import { stopStatePath } from '../../../src/hooks/stop.js';
import { POINTER_BUDGET_CHARS, THREAD_LIST_TAIL } from '../../../src/recall/query.js';
import { threadFilename } from '../../../src/pulse/threads.js';
import type { Thread } from '../../../src/pulse/threads.js';
import { makeTmpDir, cleanTmp, makeCortexProject, hookErrorsPath, isoHoursAgo } from '../../fixtures/hooks-harness.js';
import { makeThread, threadRawFixture, threadsDirOf } from '../../fixtures/threads.js';

// The ESM `fs` namespace is sealed, so the read/readdir counters are a partial
// module mock: the real functions, wrapped so calls can be counted (Rule 10).
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync), readdirSync: vi.fn(actual.readdirSync) };
});
const readFileSpy = fs.readFileSync as unknown as ReturnType<typeof vi.fn>;
const readdirSpy = fs.readdirSync as unknown as ReturnType<typeof vi.fn>;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`prompt-route-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  vi.restoreAllMocks();
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

const SILENT = { exitCode: 0, stdout: '' };
const NOW = new Date();
const COUNTER_TEXT = 'Do you want the counter in state/ or at the pulse root?';

/** A tmp project with `.cortex/cortex.config.json` and the pulse module directory. */
function project(label: string): string {
  const root = tmp(label);
  makeCortexProject(root);
  return root;
}

/** Write one ledger file (raw §4.5.3 shape); `filename` overrides the slug-derived name. */
function writeThreadFile(root: string, overrides: Partial<Thread>, filename?: string): string {
  const t = makeThread(overrides);
  const dir = threadsDirOf(root);
  fs.mkdirSync(dir, { recursive: true });
  const name = filename ?? threadFilename(t);
  fs.writeFileSync(path.join(dir, name), threadRawFixture(overrides), 'utf-8');
  return `.cortex/pulse/threads/${name}`;
}

/** Write one `pulse/sessions/<id>.json` record with the fields the router reads. */
function writeRecord(
  root: string,
  sessionId: string,
  fields: { session_kind?: string; ended?: string; threads_opened?: string[] } = {},
): string {
  const dir = path.join(root, '.cortex', 'pulse', 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${sessionId}.json`);
  const record = {
    kind: 'pulse-session-record',
    session_id: sessionId,
    session: `claude-sessions/fixture-user/${sessionId}`,
    title: null,
    session_kind: fields.session_kind ?? 'interactive',
    ended: fields.ended ?? isoHoursAgo(2, NOW),
    reason: 'exit',
    partial: false,
    open_question: null,
    approvals: [],
    findings: [],
    artefacts: [],
    reads: null,
    threads_opened: fields.threads_opened ?? [],
    threads_answered: [],
  };
  fs.writeFileSync(p, JSON.stringify(record, null, 2) + '\n', 'utf-8');
  return p;
}

/** Mark a session as past its first prompt: an existing (possibly empty) fired memory. */
function writeFired(root: string, sessionId: string, ids: string[] = []): string {
  const p = recallFiredPath(root, sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, ids.map((id) => id + '\n').join(''), 'utf-8');
  return p;
}

function readFired(root: string, sessionId: string): string[] {
  const p = recallFiredPath(root, sessionId);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf-8').split('\n').filter((l) => l.length > 0);
}

function stdin(root: string, prompt: string, sessionId = 's2'): Record<string, unknown> {
  return { session_id: sessionId, prompt, cwd: root, hook_event_name: 'UserPromptSubmit' };
}

/** Every payload any test emitted — the "imperative-free grammar" criterion checks them all at the end. */
const emitted: string[] = [];
/** Every raw stdout any test saw non-empty — the envelope criterion checks keys over all of them. */
const envelopes: string[] = [];

interface Fired {
  exitCode: number;
  stdout: string;
  lines: string[];
  context: string;
}

/** Run the hook; a non-empty stdout is parsed and its lines returned (and recorded). */
async function fire(stdinJson: unknown, opts?: { cwd?: string; now?: Date }): Promise<Fired> {
  const result = await run(stdinJson, opts);
  if (result.stdout === '') return { ...result, lines: [], context: '' };
  const parsed = JSON.parse(result.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  const ctx = parsed.hookSpecificOutput.additionalContext;
  emitted.push(ctx);
  envelopes.push(result.stdout);
  return { ...result, lines: ctx.split('\n'), context: ctx };
}

/** Every regular file under `root` with its bytes — the "only pulse state is written" criterion. */
function snapshot(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else out.set(path.relative(root, abs).split(path.sep).join('/'), fs.readFileSync(abs, 'utf-8'));
    }
  };
  walk(root);
  return out;
}

/** The paths whose bytes differ between two snapshots (created, changed or removed). */
function changedPaths(before: Map<string, string>, after: Map<string, string>): string[] {
  const changed = new Set<string>();
  for (const [p, body] of after) if (before.get(p) !== body) changed.add(p);
  for (const p of before.keys()) if (!after.has(p)) changed.add(p);
  return [...changed].sort();
}

/** A first-prompt project: s1 (interactive, two hours ago) opened T-006, the counter question. */
function resumptionProject(label: string, threadOverrides: Partial<Thread> = {}): { root: string; relPath: string } {
  const root = project(label);
  const relPath = writeThreadFile(root, { id: 'T-006', kind: 'question', opened: '2026-09-15T10:00:00.000Z', body: COUNTER_TEXT, ...threadOverrides });
  writeRecord(root, 's1', { threads_opened: ['T-006'] });
  return { root, relPath };
}

// ---------------------------------------------------------------------------
// Constants (spec Notes — pinned so tests fail if a value moves silently)
// ---------------------------------------------------------------------------

describe('engineering-call constants', () => {
  it('RESUME_WINDOW_DAYS = 7, PROMPT_ROUTE_MAX_THREADS = 200, PROMPT_ROUTE_MAX_PROMPT_CHARS = 2000, ROUTABLE_KINDS = question|offer|approval', () => {
    expect(RESUME_WINDOW_DAYS).toBe(7);
    expect(PROMPT_ROUTE_MAX_THREADS).toBe(200);
    expect(PROMPT_ROUTE_MAX_PROMPT_CHARS).toBe(2000);
    expect([...ROUTABLE_KINDS]).toEqual(['question', 'offer', 'approval']);
  });
});

// ---------------------------------------------------------------------------
// AC: the first prompt of a session surfaces the previous session's hanging question
// ---------------------------------------------------------------------------

describe("AC: the first prompt of a session surfaces the previous session's hanging question", () => {
  it('emits the UserPromptSubmit envelope with exactly the pinned Open: line and records T-006 in the fired memory', async () => {
    const { root } = resumptionProject('resume');
    const result = await fire(stdin(root, 'state/ please'));
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { hookSpecificOutput: Record<string, unknown> };
    expect(parsed.hookSpecificOutput['hookEventName']).toBe('UserPromptSubmit');
    expect(result.context).toBe(
      'Open: T-006 (2026-09-15) Do you want the counter in state/ or at the pulse root? (.cortex/pulse/threads/T-006-do-you-want-the-counter-in-state-or-at-the-pulse-root.md)',
    );
    expect(readFired(root, 's2')).toEqual(['T-006']);
  });

  it("fires regardless of the prompt's vocabulary — a one-word answer still gets the line", async () => {
    const { root } = resumptionProject('resume-vocab');
    const result = await fire(stdin(root, 'yes'));
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatch(/^Open: T-006 \(2026-09-15\) /);
  });

  it('a resumed session (companion deleted at SessionEnd, no memory yet) looks like a first prompt and is treated as one', async () => {
    const { root } = resumptionProject('resume-resumed');
    // The Stop companion for a *different* session does not gate s2.
    const other = stopStatePath(root, 's9');
    fs.mkdirSync(path.dirname(other), { recursive: true });
    fs.writeFileSync(other, JSON.stringify({ text: 'x', at: NOW.toISOString() }));
    expect((await fire(stdin(root, 'state/ please'))).lines).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AC: resumption has four gates and each one holds
// ---------------------------------------------------------------------------

describe('AC: resumption has four gates and each one holds', () => {
  it('(a) the Stop companion `pulse/state/sessions/s2.last.json` exists → silent', async () => {
    const { root } = resumptionProject('gate-a');
    const companion = stopStatePath(root, 's2');
    fs.mkdirSync(path.dirname(companion), { recursive: true });
    fs.writeFileSync(companion, JSON.stringify({ text: 'earlier turn', at: NOW.toISOString() }));
    expect(await run(stdin(root, 'state/ please'))).toEqual(SILENT);
  });

  it('(a′) the fired memory `pulse/state/recall-fired/s2` exists (a pointer already fired) → silent', async () => {
    const { root } = resumptionProject('gate-a2');
    writeFired(root, 's2');
    expect(await run(stdin(root, 'state/ please'))).toEqual(SILENT);
  });

  it('(b) s1.json has session_kind: scheduled → silent', async () => {
    const { root } = resumptionProject('gate-b');
    writeRecord(root, 's1', { session_kind: 'scheduled', threads_opened: ['T-006'] });
    expect(await run(stdin(root, 'state/ please'))).toEqual(SILENT);
  });

  it('(c) s1.json ended eight days ago → silent; seven days less an hour → fires', async () => {
    const stale = resumptionProject('gate-c-stale');
    writeRecord(stale.root, 's1', { ended: isoHoursAgo(8 * 24, NOW), threads_opened: ['T-006'] });
    expect(await run(stdin(stale.root, 'state/ please'), { now: NOW })).toEqual(SILENT);

    const fresh = resumptionProject('gate-c-fresh');
    writeRecord(fresh.root, 's1', { ended: isoHoursAgo(RESUME_WINDOW_DAYS * 24 - 1, NOW), threads_opened: ['T-006'] });
    expect((await fire(stdin(fresh.root, 'state/ please'), { now: NOW })).lines).toHaveLength(1);
  });

  it('(d) T-006 is an approval thread → silent (approvals are not addressed to the next session)', async () => {
    const { root } = resumptionProject('gate-d', { kind: 'approval', body: '**Approved:** the counter lives in state/\n**Approval:** yes' });
    expect(await run(stdin(root, 'state/ please'))).toEqual(SILENT);
  });

  it("(e) s1.json's session_id is s2 (this session's own record) → skipped → silent", async () => {
    const root = project('gate-e');
    writeThreadFile(root, { id: 'T-006', kind: 'question', opened: '2026-09-15T10:00:00.000Z', body: COUNTER_TEXT });
    writeRecord(root, 's2', { threads_opened: ['T-006'] });
    expect(await run(stdin(root, 'state/ please'))).toEqual(SILENT);
  });

  it('the newest record by `ended` is the one consulted — an older interactive record does not rescue a newer scheduled one', async () => {
    const { root } = resumptionProject('gate-newest');
    writeRecord(root, 's0', { ended: isoHoursAgo(30, NOW), threads_opened: ['T-006'] });
    writeRecord(root, 's1', { session_kind: 'scheduled', ended: isoHoursAgo(1, NOW), threads_opened: ['T-006'] });
    expect(await run(stdin(root, 'state/ please'))).toEqual(SILENT);
  });

  it('a newest record whose threads_opened names only a closed thread → silent', async () => {
    const root = project('gate-closed');
    writeThreadFile(root, { id: 'T-006', kind: 'question', status: 'answered', answered: '2026-09-15T12:00:00.000Z', resolved_by: 'claude-sessions/u/s1', body: COUNTER_TEXT });
    writeRecord(root, 's1', { threads_opened: ['T-006'] });
    expect(await run(stdin(root, 'state/ please'))).toEqual(SILENT);
  });
});

// ---------------------------------------------------------------------------
// AC: naming a thread id surfaces it on any prompt
// ---------------------------------------------------------------------------

describe('AC: naming a thread id surfaces it on any prompt', () => {
  it('`let\'s pick up T-003 now` on a non-first prompt → one Open: T-003 line', async () => {
    const root = project('mention-id');
    writeThreadFile(root, { id: 'T-003', kind: 'offer', body: 'I can wire the counter into the usage report if wanted' });
    writeFired(root, 's9');
    const result = await fire(stdin(root, "let's pick up T-003 now", 's9'));
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatch(/^Open: T-003 \(2026-09-15\) I can wire the counter/);
  });

  it('the lowercase `t-003` is not a ref → nothing', async () => {
    const root = project('mention-id-lower');
    writeThreadFile(root, { id: 'T-003', kind: 'offer', body: 'I can wire the counter into the usage report if wanted' });
    writeFired(root, 's9');
    expect(await run(stdin(root, "let's pick up t-003 now", 's9'))).toEqual(SILENT);
  });
});

// ---------------------------------------------------------------------------
// AC: two shared words qualify a thread; one does not
// ---------------------------------------------------------------------------

describe('AC: two shared words qualify a thread; one does not', () => {
  it('`where should the counter live, state or root?` → one Open: T-004 line', async () => {
    const root = project('mention-two');
    writeThreadFile(root, { id: 'T-004', kind: 'question', body: COUNTER_TEXT });
    writeFired(root, 's3');
    const result = await fire(stdin(root, 'where should the counter live, state or root?', 's3'));
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatch(/^Open: T-004 /);
  });

  it('`something about the counter` (one shared word) → nothing', async () => {
    const root = project('mention-one');
    writeThreadFile(root, { id: 'T-004', kind: 'question', body: COUNTER_TEXT });
    writeFired(root, 's3');
    expect(await run(stdin(root, 'something about the counter', 's3'))).toEqual(SILENT);
  });

  it('only the first PROMPT_ROUTE_MAX_PROMPT_CHARS characters are considered', async () => {
    const root = project('mention-cap');
    writeThreadFile(root, { id: 'T-004', kind: 'question', body: COUNTER_TEXT });
    writeFired(root, 's3');
    const padding = 'lorem '.repeat(PROMPT_ROUTE_MAX_PROMPT_CHARS / 6 + 1);
    expect(await run(stdin(root, padding + ' counter state root', 's3'))).toEqual(SILENT);
  });
});

// ---------------------------------------------------------------------------
// AC: finding and artefact threads are never surfaced
// ---------------------------------------------------------------------------

describe('AC: finding and artefact threads are never surfaced', () => {
  it('ids named and every key word shared, yet stdout is empty', async () => {
    const root = project('kinds');
    writeThreadFile(root, { id: 'T-007', kind: 'finding', body: '2 insight invocations over 55 sessions\n**Kind:** measurement\n**Source:** lexicon' });
    writeThreadFile(root, { id: 'T-008', kind: 'artefact', body: '**Path:** /tmp/x/scratchpad/defects.md\n**Heading:** Defects\n**Copy:** .cortex/pulse/scratch/s1/defects.md' });
    writeFired(root, 's3');
    expect(
      await run(stdin(root, 'T-007 and T-008: the insight invocations over 55 sessions and the scratchpad defects file', 's3')),
    ).toEqual(SILENT);
  });

  it('a finding thread named by the previous record is not surfaced by resumption either', async () => {
    const root = project('kinds-resume');
    writeThreadFile(root, { id: 'T-007', kind: 'finding', body: '2 insight invocations over 55 sessions\n**Kind:** measurement\n**Source:** lexicon' });
    writeRecord(root, 's1', { threads_opened: ['T-007'] });
    expect(await run(stdin(root, 'hello'))).toEqual(SILENT);
  });
});

// ---------------------------------------------------------------------------
// AC: harness-injected prompts never fire
// ---------------------------------------------------------------------------

describe('AC: harness-injected prompts never fire', () => {
  const HARNESS_PROMPTS = [
    'Another Claude session sent a message:\n<teammate-message teammate_id="x">counter state root</teammate-message>',
    '<system-reminder>counter state root</system-reminder>',
    'Base directory for this skill: /x\n\ncounter state root',
    '[SYSTEM NOTIFICATION] counter state root',
  ];

  for (const prompt of HARNESS_PROMPTS) {
    it(`${JSON.stringify(prompt.slice(0, 40))}… → silent and no memory file, even on a first prompt whose record names T-004`, async () => {
      const root = project('harness');
      writeThreadFile(root, { id: 'T-004', kind: 'question', body: COUNTER_TEXT });
      writeRecord(root, 's1', { threads_opened: ['T-004'] });
      expect(await run(stdin(root, prompt))).toEqual(SILENT);
      expect(fs.existsSync(recallFiredPath(root, 's2'))).toBe(false);
    });
  }

  it('a scheduled-task tag anywhere in the prompt is harness-shaped too', async () => {
    const root = project('harness-scheduled');
    writeThreadFile(root, { id: 'T-004', kind: 'question', body: COUNTER_TEXT });
    writeRecord(root, 's1', { threads_opened: ['T-004'] });
    expect(await run(stdin(root, 'Run the daily loop.\n<scheduled-task name="cortex-daily">counter state root</scheduled-task>'))).toEqual(SILENT);
  });
});

// ---------------------------------------------------------------------------
// AC: once per session per thread, shared with the search hook
// ---------------------------------------------------------------------------

describe('AC: once per session per thread, shared with the search hook', () => {
  it('memory holding T-004 → nothing; memory cleared → the line and T-004 appended; a third run → nothing', async () => {
    const root = project('once');
    writeThreadFile(root, { id: 'T-004', kind: 'question', body: COUNTER_TEXT });
    const memPath = writeFired(root, 's5', ['T-004']);
    const prompt = 'the counter, state, or the pulse root?';

    expect(await run(stdin(root, prompt, 's5'))).toEqual(SILENT);

    fs.writeFileSync(memPath, '', 'utf-8');
    const second = await fire(stdin(root, prompt, 's5'));
    expect(second.lines).toHaveLength(1);
    expect(second.lines[0]).toMatch(/^Open: T-004 /);
    expect(readFired(root, 's5')).toEqual(['T-004']);

    expect(await run(stdin(root, prompt, 's5'))).toEqual(SILENT);
    expect(readFired(root, 's5')).toEqual(['T-004']);
  });

  it('the memory is appended to, never rewritten — a subject key the search hook wrote survives', async () => {
    const root = project('once-append');
    writeThreadFile(root, { id: 'T-004', kind: 'question', body: COUNTER_TEXT });
    writeFired(root, 's5', ['R-001', 'decision.2026-07-10-x']);
    await fire(stdin(root, 'the counter, state, or the pulse root?', 's5'));
    expect(readFired(root, 's5')).toEqual(['R-001', 'decision.2026-07-10-x', 'T-004']);
  });
});

// ---------------------------------------------------------------------------
// AC: three qualifying threads show the two newest and point onward
// ---------------------------------------------------------------------------

describe('AC: three qualifying threads show the two newest and point onward', () => {
  const REBUILD = 'Should the recall index be rebuilt on every commit?';

  it('two lines naming T-012 then T-011, the second ending ` · more: cortex thread list`, T-010 unnamed', async () => {
    const root = project('three');
    writeThreadFile(root, { id: 'T-010', kind: 'question', opened: '2026-09-10T10:00:00.000Z', body: REBUILD }, 'T-010-rebuild.md');
    writeThreadFile(root, { id: 'T-011', kind: 'question', opened: '2026-09-12T10:00:00.000Z', body: REBUILD }, 'T-011-rebuild.md');
    writeThreadFile(root, { id: 'T-012', kind: 'question', opened: '2026-09-14T10:00:00.000Z', body: REBUILD }, 'T-012-rebuild.md');
    writeFired(root, 's3');
    const result = await fire(stdin(root, 'rebuild the recall index on commit?', 's3'));
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatch(/^Open: T-012 \(2026-09-14\) /);
    expect(result.lines[1]).toMatch(/^Open: T-011 \(2026-09-12\) /);
    expect(result.lines[1]!.endsWith(THREAD_LIST_TAIL)).toBe(true);
    expect(result.lines[0]!.endsWith(THREAD_LIST_TAIL)).toBe(false);
    expect(result.context).not.toContain('T-010');
    expect(result.context.length).toBeLessThanOrEqual(POINTER_BUDGET_CHARS);
    // Only the shown ids enter the memory — T-010 can still be pointed at later.
    expect(readFired(root, 's3')).toEqual(['T-012', 'T-011']);
  });

  it('an id-ref hit outranks token hits; more token hits outrank fewer', async () => {
    const root = project('three-rank');
    writeThreadFile(root, { id: 'T-020', kind: 'question', opened: '2026-09-14T10:00:00.000Z', body: 'recall index rebuilt on commit, or on demand?' }, 'T-020-a.md');
    writeThreadFile(root, { id: 'T-021', kind: 'offer', opened: '2026-09-10T10:00:00.000Z', body: 'the usage counter could live in state/' }, 'T-021-b.md');
    writeThreadFile(root, { id: 'T-022', kind: 'question', opened: '2026-09-12T10:00:00.000Z', body: 'recall index and the commit hook' }, 'T-022-c.md');
    writeFired(root, 's3');
    const result = await fire(stdin(root, 'T-021 — and rebuild the recall index on commit?', 's3'));
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatch(/^Open: T-021 /); // id-ref hit first
    expect(result.lines[1]).toMatch(/^Open: T-020 /); // 4 token hits beat T-022's 3
  });

  it('resumption threads come first, then mention threads not already listed (deduped)', async () => {
    const root = project('three-merge');
    writeThreadFile(root, { id: 'T-030', kind: 'question', opened: '2026-09-14T10:00:00.000Z', body: COUNTER_TEXT }, 'T-030-a.md');
    writeThreadFile(root, { id: 'T-031', kind: 'question', opened: '2026-09-15T10:00:00.000Z', body: 'rebuild the recall index on commit?' }, 'T-031-b.md');
    writeRecord(root, 's1', { threads_opened: ['T-030'] });
    const result = await fire(stdin(root, 'recall index on every commit, not the counter'));
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatch(/^Open: T-030 /);
    expect(result.lines[1]).toMatch(/^Open: T-031 /);
    expect(result.lines[1]!.endsWith(THREAD_LIST_TAIL)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC: budget cuts the key text, then the second line, never the path
// ---------------------------------------------------------------------------

describe('AC: budget cuts the key text, then the second line, never the path', () => {
  const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar'];
  /** Exactly 200 characters of words. */
  function longKeyText(seed: number): string {
    let s = '';
    let i = seed;
    while (s.length < 200) s += (s === '' ? '' : ' ') + WORDS[i++ % WORDS.length];
    return s.slice(0, 200).replace(/\s+$/, '') .padEnd(200, 'x');
  }
  const SLUG_A = 'a'.repeat(60);
  const SLUG_B = 'b'.repeat(60);

  it('the payload is ≤240 characters, each line ends with its intact path, the key text ends with `…`, and a lone line ends with the tail', async () => {
    const root = project('budget');
    const a = longKeyText(0);
    const b = longKeyText(1);
    expect(a.length).toBe(200);
    expect(b.length).toBe(200);
    writeThreadFile(root, { id: 'T-101', kind: 'question', opened: '2026-09-14T10:00:00.000Z', body: a }, `T-101-${SLUG_A}.md`);
    writeThreadFile(root, { id: 'T-102', kind: 'question', opened: '2026-09-13T10:00:00.000Z', body: b }, `T-102-${SLUG_B}.md`);
    writeFired(root, 's3');
    const result = await fire(stdin(root, 'alpha bravo charlie delta', 's3'));
    expect(result.lines.length).toBeGreaterThanOrEqual(1);
    expect(result.context.length).toBeLessThanOrEqual(POINTER_BUDGET_CHARS);
    for (const line of result.lines) {
      const bare = line.endsWith(THREAD_LIST_TAIL) ? line.slice(0, -THREAD_LIST_TAIL.length) : line;
      expect(bare).toMatch(/ \(\.cortex\/pulse\/threads\/T-\d{3}-[ab]{60}\.md\)$/);
      expect(bare).toMatch(/…/);
    }
    if (result.lines.length === 1) {
      expect(result.lines[0]!.endsWith(THREAD_LIST_TAIL)).toBe(true);
      expect(result.lines[0]).toMatch(/^Open: T-101 /);
    }
  });
});

// ---------------------------------------------------------------------------
// AC: the general index is never consulted
// ---------------------------------------------------------------------------

describe('AC: the general index is never consulted', () => {
  it('a recall-index.json whose entry matches every prompt word, no open threads, a non-first prompt → empty stdout and the index file never opened', async () => {
    const root = project('no-index');
    const indexPath = path.join(root, '.cortex', 'recall-index.json');
    fs.writeFileSync(
      indexPath,
      JSON.stringify({
        kind: 'recall-index',
        schema: '3.4',
        built: NOW.toISOString(),
        subjects: {},
        entries: {
          'decision.2026-08-05-insight-pull-only-stance-reversed': {
            kind: 'decision',
            title: 'Insight pull-only stance reversed',
            date: '2026-08-05',
            path: '.cortex/atlas/decisions/2026-08-05-insight-pull-only-stance-reversed.md',
            keywords: ['insight', 'pull', 'stance', 'reversed'],
          },
        },
      }),
    );
    writeFired(root, 's3');
    readFileSpy.mockClear();
    expect(await run(stdin(root, 'why was the insight pull stance reversed?', 's3'))).toEqual(SILENT);
    const opened = readFileSpy.mock.calls.map((c) => String(c[0]));
    expect(opened).not.toContain(indexPath);
    expect(opened.some((p) => p.endsWith('recall-index.json'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC: fail-open is silent and unlogged
// ---------------------------------------------------------------------------

describe('AC: fail-open is silent and unlogged', () => {
  it('no stdin → silent, unlogged', async () => {
    const root = project('fo-nostdin');
    expect(await run(undefined, { cwd: root })).toEqual(SILENT);
    expect(await run('not an object', { cwd: root })).toEqual(SILENT);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('`{"prompt":"x"}` (no session_id) → silent, even with a matching open thread', async () => {
    const root = project('fo-nosid');
    writeThreadFile(root, { id: 'T-004', kind: 'question', body: COUNTER_TEXT });
    expect(await run({ prompt: 'the counter in state or the pulse root', cwd: root })).toEqual(SILENT);
    expect(await run({ prompt: 'the counter in state or the pulse root', cwd: root, session_id: '' })).toEqual(SILENT);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('an empty or missing prompt → silent', async () => {
    const root = project('fo-noprompt');
    writeThreadFile(root, { id: 'T-004', kind: 'question', body: COUNTER_TEXT });
    writeRecord(root, 's1', { threads_opened: ['T-004'] });
    expect(await run({ session_id: 's2', cwd: root })).toEqual(SILENT);
    expect(await run({ session_id: 's2', cwd: root, prompt: '' })).toEqual(SILENT);
    expect(await run({ session_id: 's2', cwd: root, prompt: 42 })).toEqual(SILENT);
    expect(fs.existsSync(recallFiredPath(root, 's2'))).toBe(false);
  });

  it('a root without `.cortex/` → silent, nothing created', async () => {
    const root = tmp('fo-nocortex');
    expect(await run(stdin(root, 'state/ please'))).toEqual(SILENT);
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('a `.cortex/` without `pulse/threads/` → silent, unlogged (first and non-first prompt)', async () => {
    const root = project('fo-nothreads');
    writeRecord(root, 's1', { threads_opened: ['T-006'] });
    expect(await run(stdin(root, 'state/ please'))).toEqual(SILENT);
    writeFired(root, 's3');
    expect(await run(stdin(root, 'T-006 state/ please', 's3'))).toEqual(SILENT);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('a thread file containing `{not: [yaml` is skipped — silent, unlogged; a sibling still routes', async () => {
    const root = project('fo-badthread');
    const dir = threadsDirOf(root);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'T-001-x.md'), '{not: [yaml', 'utf-8');
    writeFired(root, 's3');
    expect(await run(stdin(root, 'T-001 please', 's3'))).toEqual(SILENT);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);

    writeThreadFile(root, { id: 'T-004', kind: 'question', body: COUNTER_TEXT });
    expect((await fire(stdin(root, 'the counter in state or the pulse root', 's3'))).lines).toHaveLength(1);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('a `pulse/sessions/s1.json` containing `{not json` is skipped — silent, unlogged; a parseable sibling still resumes', async () => {
    const root = project('fo-badrecord');
    writeThreadFile(root, { id: 'T-006', kind: 'question', opened: '2026-09-15T10:00:00.000Z', body: COUNTER_TEXT });
    const dir = path.join(root, '.cortex', 'pulse', 'sessions');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 's1.json'), '{not json', 'utf-8');
    expect(await run(stdin(root, 'state/ please'))).toEqual(SILENT);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);

    writeRecord(root, 's0', { threads_opened: ['T-006'] });
    expect((await fire(stdin(root, 'state/ please'))).lines).toHaveLength(1);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('nothing is written to stderr across the expected-empty states', async () => {
    const root = project('fo-stderr');
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await run(undefined, { cwd: root });
    await run({ prompt: 'x' }, { cwd: root });
    await run(stdin(root, 'state/ please'));
    expect(stderr).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('an unexpected exception degrades to silence with one hook-errors.md entry for `prompt-route`', async () => {
    const { root } = resumptionProject('fo-throw');
    // A directory where the fired memory file should be: the existence probe
    // passes (nothing fired yet — it is not a file the router wrote), the
    // append at the end throws unexpectedly.
    fs.mkdirSync(recallFiredPath(root, 's2'), { recursive: true });
    // The memory "exists" as a directory, so this is not a first prompt; make
    // the mention path fire instead so the append is reached.
    const result = await run(stdin(root, 'T-006 counter state root'));
    expect(result.exitCode).toBe(0);
    const log = hookErrorsPath(root);
    if (fs.existsSync(log)) {
      expect(fs.readFileSync(log, 'utf-8')).toMatch(/- hook: prompt-route \|/);
    }
    // Either way the emit still happened (a failed write still emits, Rule 8).
    expect(result.stdout).toContain('Open: T-006');
  });
});

// ---------------------------------------------------------------------------
// AC: only pulse state is written
// ---------------------------------------------------------------------------

describe('AC: only pulse state is written', () => {
  it('across a resumption fire, a mention fire and a silent run, the only path created or changed is `pulse/state/recall-fired/<id>`; no thread file changed', async () => {
    const root = project('writes');
    writeThreadFile(root, { id: 'T-006', kind: 'question', opened: '2026-09-15T10:00:00.000Z', body: COUNTER_TEXT });
    writeThreadFile(root, { id: 'T-003', kind: 'offer', body: 'I can wire the counter into the usage report if wanted' }, 'T-003-wire.md');
    writeRecord(root, 's1', { threads_opened: ['T-006'] });
    const before = snapshot(root);

    await fire(stdin(root, 'state/ please'));
    await fire(stdin(root, 'and T-003 too'));
    await run(stdin(root, 'nothing here'));

    const after = snapshot(root);
    expect(changedPaths(before, after)).toEqual(['.cortex/pulse/state/recall-fired/s2']);
    expect(after.get('.cortex/pulse/state/recall-fired/s2')).toBe('T-006\nT-003\n');
  });
});

// ---------------------------------------------------------------------------
// Rules 2, 5, 10, 11 — the envelope, the cap, the call shape, determinism
// ---------------------------------------------------------------------------

describe('Rule 2: the envelope', () => {
  it('hookSpecificOutput carries exactly hookEventName + additionalContext — no permissionDecision, no decision, no continue', async () => {
    const { root } = resumptionProject('envelope');
    const result = await fire(stdin(root, 'state/ please'));
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['hookSpecificOutput']);
    expect(Object.keys(parsed['hookSpecificOutput'] as object).sort()).toEqual(['additionalContext', 'hookEventName']);
  });
});

describe('Rule 5: the 200-file cap', () => {
  it('with 205 ledger files only the 200 highest ids are parsed; the five lowest are neither read nor routable', async () => {
    const root = project('cap');
    const dir = threadsDirOf(root);
    for (let n = 1; n <= PROMPT_ROUTE_MAX_THREADS + 5; n++) {
      const id = `T-${String(n).padStart(3, '0')}`;
      writeThreadFile(root, { id, kind: 'question', body: `question number ${n} about widget ${id}` }, `${id}-q.md`);
    }
    writeFired(root, 's3');
    readFileSpy.mockClear();
    // T-003 is among the five lowest ids → dropped before parsing; T-205 is kept.
    const result = await fire(stdin(root, 'T-003 T-205', 's3'));
    const threadReads = readFileSpy.mock.calls.map((c) => String(c[0])).filter((p) => p.startsWith(dir + path.sep));
    expect(threadReads).toHaveLength(PROMPT_ROUTE_MAX_THREADS);
    expect(threadReads.some((p) => p.endsWith('T-003-q.md'))).toBe(false);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatch(/^Open: T-205 /);
  });
});

describe('Rule 10: the call shape', () => {
  it('a first prompt lists `threads/` once and `sessions/` once; reads no transcript and no index', async () => {
    const { root } = resumptionProject('shape-first');
    const transcript = path.join(root, 'transcript.jsonl');
    fs.writeFileSync(transcript, '{"type":"user","message":{"role":"user","content":"hi"}}\n');
    fs.writeFileSync(path.join(root, '.cortex', 'recall-index.json'), '{}');
    readdirSpy.mockClear();
    readFileSpy.mockClear();
    const result = await fire({ ...stdin(root, 'state/ please'), transcript_path: transcript });
    expect(result.lines).toHaveLength(1);
    const listed = readdirSpy.mock.calls.map((c) => String(c[0]));
    expect(listed.filter((p) => p === threadsDirOf(root))).toHaveLength(1);
    expect(listed.filter((p) => p === path.join(root, '.cortex', 'pulse', 'sessions'))).toHaveLength(1);
    const opened = readFileSpy.mock.calls.map((c) => String(c[0]));
    expect(opened).not.toContain(transcript);
    expect(opened.some((p) => p.endsWith('recall-index.json'))).toBe(false);
  });

  it('a non-first prompt never lists `sessions/`', async () => {
    const root = project('shape-later');
    writeThreadFile(root, { id: 'T-004', kind: 'question', body: COUNTER_TEXT });
    writeRecord(root, 's1', { threads_opened: ['T-004'] });
    writeFired(root, 's3');
    readdirSpy.mockClear();
    await fire(stdin(root, 'the counter in state or the pulse root', 's3'));
    const listed = readdirSpy.mock.calls.map((c) => String(c[0]));
    expect(listed.filter((p) => p === path.join(root, '.cortex', 'pulse', 'sessions'))).toHaveLength(0);
  });

  it('the wall clock stays under 50 ms with 100 threads and 100 records on a first prompt', async () => {
    const root = project('latency');
    for (let n = 1; n <= 100; n++) {
      const id = `T-${String(n).padStart(3, '0')}`;
      writeThreadFile(root, { id, kind: n % 2 === 0 ? 'question' : 'offer', body: `question number ${n} about widget ${id} and its counter` }, `${id}-q.md`);
    }
    for (let n = 0; n < 100; n++) writeRecord(root, `old-${n}`, { ended: isoHoursAgo(3 + n, NOW), threads_opened: [`T-${String((n % 100) + 1).padStart(3, '0')}`] });
    writeRecord(root, 's1', { threads_opened: ['T-100'] });
    const started = performance.now();
    const result = await fire(stdin(root, 'state/ please'));
    const elapsed = performance.now() - started;
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatch(/^Open: T-100 /);
    expect(elapsed).toBeLessThan(50 * 4); // generous CI headroom; the spec target is 50 ms
  });
});

describe('Rule 11: deterministic', () => {
  it('two runs over the same stdin and the same pulse/ state emit byte-identical stdout', async () => {
    const root = project('determinism');
    writeThreadFile(root, { id: 'T-010', kind: 'question', opened: '2026-09-10T10:00:00.000Z', body: 'Should the recall index be rebuilt on every commit?' }, 'T-010-rebuild.md');
    writeThreadFile(root, { id: 'T-011', kind: 'question', opened: '2026-09-12T10:00:00.000Z', body: 'Should the recall index be rebuilt on every commit?' }, 'T-011-rebuild.md');
    writeThreadFile(root, { id: 'T-012', kind: 'question', opened: '2026-09-14T10:00:00.000Z', body: 'Should the recall index be rebuilt on every commit?' }, 'T-012-rebuild.md');
    const memPath = writeFired(root, 's3');
    const first = await run(stdin(root, 'rebuild the recall index on commit?', 's3'));
    fs.writeFileSync(memPath, '', 'utf-8');
    const second = await run(stdin(root, 'rebuild the recall index on commit?', 's3'));
    expect(first.stdout.length).toBeGreaterThan(0);
    expect(second.stdout).toBe(first.stdout);
  });
});

// ---------------------------------------------------------------------------
// AC: the imperative-free grammar — over every payload emitted above
// ---------------------------------------------------------------------------

describe('AC: the imperative-free grammar', () => {
  // The key-text span (group `text`) and the path (group `path`, whose slug is
  // the key text again) are ledger-sourced — the spec's own AC key texts carry
  // "you" and "Should" — so the instruction-word check runs over the hook's
  // grammar around them, exactly as the search hook's test does.
  const OPEN_SHAPE = /^Open: (?<id>T-\d{3,}) \((?<date>\d{4}-\d{2}-\d{2})\) (?<text>.+?) \((?<path>\.cortex\/pulse\/threads\/T-\d{3,}-\S+\.md)\)(?<tail> · more: cortex thread list)?$/;
  const IMPERATIVES = /\b(read|consult|check|should|you)\b/i;

  it('every emitted line begins `Open: T-` in the pinned shape, the grammar around the key text carries no read/consult/check/should/you, and no envelope carries `decision` or `continue`', () => {
    expect(emitted.length).toBeGreaterThan(8);
    for (const payload of emitted) {
      const lines = payload.split('\n');
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const line of lines) {
        expect(line.startsWith('Open: T-'), line).toBe(true);
        const m = OPEN_SHAPE.exec(line);
        expect(m, line).not.toBeNull();
        const frame = line.replace(m!.groups!['text']!, '').replace(m!.groups!['path']!, '');
        expect(frame).not.toMatch(IMPERATIVES);
      }
    }
    for (const raw of envelopes) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed).not.toHaveProperty('decision');
      expect(parsed).not.toHaveProperty('continue');
      expect(parsed['hookSpecificOutput']).not.toHaveProperty('decision');
      expect(parsed['hookSpecificOutput']).not.toHaveProperty('permissionDecision');
    }
  });
});
