/**
 * Spec tests — `hooks.session-end` end to end: `run(stdinJson)` over synthetic
 * Claude Code transcripts in tmp projects (never the real ~/.claude). Covers
 * the record's shape and determinism (Rules 3, 4, 6), the two-pass read as the
 * record sees it (Rule 5), the extractors and artefact copies as record fields
 * (Rules 7, 8), the thread hand-off in both directions (Rule 9), the companion
 * lifecycle (Rule 11), silence and pulse-only writes (Rules 2, 10), and the
 * `cortex hook` dispatch of both names (Rule 1's dispatch half).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { run } from '../../../src/hooks/session-end.js';
import { run as runStop } from '../../../src/hooks/stop.js';
import { runHook } from '../../../src/hooks/cli.js';
import { readHookErrorEntries } from '../../../src/hooks/errors.js';
import { provenanceUser } from '../../../src/insight/session-observe.js';
import { listThreads, parseThreadFile, writeThread } from '../../../src/pulse/threads.js';
import type { Thread } from '../../../src/pulse/threads.js';
import { makeTmpDir, cleanTmp, makeCortexProject, hookErrorsPath } from '../../fixtures/hooks-harness.js';
import { snapshotTree } from '../../fixtures/init-harness.js';
import { customTitleEntry, skillBaseDirUserTurn } from '../../fixtures/sessions.js';
import { makeThread, threadsDirOf, readThreadRaw } from '../../fixtures/threads.js';
import {
  turnAt,
  fileToolTurnAt,
  writeTranscriptFile,
  writeLargeTranscript,
  writeSparseTranscript,
  sessionEndStdin,
  sessionRecordPath,
  readSessionRecord,
  writeSessionRecordFixture,
  makeSessionRecord,
  companionPathOf,
  writeCompanion,
  writeReadLedger,
  scratchDirOf,
} from '../../fixtures/session-end-harness.js';

const NOW = new Date('2026-09-15T10:05:00.000Z');
const T0 = '2026-09-15T09:59:00.000Z';
const T1 = '2026-09-15T10:00:00.000Z';
const T2 = '2026-09-15T10:00:02.000Z';
const QUESTION = 'Two options remain. Do you want the counter in state/ or at the pulse root?';
const FINDING_TAG =
  '<cortex:finding kind="measurement" bears_on="src/pulse/usage.ts, pulse.usage">2 insight invocations over 55 sessions</cortex:finding>';
const USER = provenanceUser();

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`session-end-spec-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function project(label: string): string {
  const root = tmp(label);
  makeCortexProject(root);
  return root;
}

function threadById(root: string, id: string): Thread {
  const raw = readThreadRaw(root, id);
  expect(raw, `thread ${id} exists`).not.toBeNull();
  return parseThreadFile(raw as string) as Thread;
}

function pulseOnly(root: string, before: Map<string, string>): string[] {
  const after = snapshotTree(root);
  const touched = [...after.keys()].filter((k) => before.get(k) !== after.get(k));
  const removed = [...before.keys()].filter((k) => !after.has(k));
  const all = [...touched, ...removed];
  expect(all.every((k) => k.startsWith(path.join('.cortex', 'pulse') + path.sep)), `touched: ${all.join(', ')}`).toBe(true);
  return touched;
}

// ---------------------------------------------------------------------------
// Rules 3, 4, 6, 7a — the record
// ---------------------------------------------------------------------------

describe('AC — a question left hanging becomes the record\'s open question', () => {
  it('writes the full §4.5.3 record with the question from the transcript; stdout empty, exit 0', async () => {
    const root = project('hanging');
    const transcript = writeTranscriptFile(root, [
      customTitleEntry('Recall step 1'),
      turnAt('user', 'where should the counter live?', T0),
      turnAt('assistant', `Here is the trade-off.\n\n${QUESTION}`, T1),
    ]);
    writeReadLedger(root, 'sess-end', ['.cortex/compass/rules/R-001.md']);

    const result = await run(sessionEndStdin(root, transcript, { reason: 'prompt_input_exit' }), { now: NOW });

    expect(result).toEqual({ exitCode: 0, stdout: '' });
    const record = readSessionRecord(root, 'sess-end');
    expect(record).toEqual({
      kind: 'pulse-session-record',
      session_id: 'sess-end',
      session: `claude-sessions/${USER}/sess-end`,
      title: 'Recall step 1',
      session_kind: 'interactive',
      ended: NOW.toISOString(),
      reason: 'prompt_input_exit',
      partial: false,
      open_question: { kind: 'question', text: QUESTION, timestamp: T1, source: 'transcript' },
      approvals: [],
      findings: [],
      artefacts: [],
      reads: '.cortex/pulse/state/reads/sess-end',
      threads_opened: ['T-001'],
      threads_answered: [],
    });
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('Rule 3 fallbacks: session_id from the transcript stem, reason unknown, title and reads null', async () => {
    const root = project('fallbacks');
    const transcript = writeTranscriptFile(root, [turnAt('user', 'hi', T0), turnAt('assistant', 'Done.', T1)], 'stem-id.jsonl');
    await run({ transcript_path: transcript, cwd: root }, { now: NOW });
    const record = readSessionRecord(root, 'stem-id');
    expect(record?.session_id).toBe('stem-id');
    expect(record?.reason).toBe('unknown');
    expect(record?.title).toBeNull();
    expect(record?.reads).toBeNull();
    expect(record?.open_question).toBeNull();
    expect(record?.threads_opened).toEqual([]);
  });

  it('Rule 4 determinism: two runs over the same transcript, companion and pulse state are byte-identical apart from ended', async () => {
    const entries = [turnAt('user', 'go', T0), turnAt('assistant', `Ran it. ${FINDING_TAG}\n\n${QUESTION}`, T1)];
    const later = new Date(NOW.getTime() + 60_000);
    const records: string[] = [];
    for (const [label, at] of [['det-a', NOW], ['det-b', later]] as const) {
      const root = project(label);
      writeThread(root, makeThread({ id: 'T-001', body: 'An unrelated open thread from before?' }));
      fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'state'), { recursive: true });
      fs.writeFileSync(path.join(root, '.cortex', 'pulse', 'state', 'thread-counter'), '1\n');
      writeCompanion(root, 'sess-end', 'Anything else?', '2026-09-15T10:00:30.000Z');
      const transcript = writeTranscriptFile(root, entries);
      await run(sessionEndStdin(root, transcript), { now: at });
      records.push(fs.readFileSync(sessionRecordPath(root, 'sess-end'), 'utf-8').replace(at.toISOString(), 'ENDED'));
    }
    expect(records[0]).toBe(records[1]);
    expect(records[0]).toContain('"threads_opened": [\n    "T-002",\n    "T-003"\n  ]');
  });
});

describe('AC — a fresher companion file wins over a lagging transcript and is then deleted', () => {
  it('uses the companion\'s final paragraph with source stop and its `at`; the file is gone afterwards', async () => {
    const root = project('companion-fresh');
    const transcript = writeTranscriptFile(root, [
      turnAt('assistant', 'Two options.', T0),
      turnAt('user', 'ok, which one?', T1),
    ]);
    writeCompanion(root, 'sess-end', 'Either works.\n\nShall I keep the counter in state/?', '2026-09-15T10:00:04.000Z');

    await run(sessionEndStdin(root, transcript), { now: NOW });

    const record = readSessionRecord(root, 'sess-end');
    expect(record?.open_question).toEqual({
      kind: 'question',
      text: 'Shall I keep the counter in state/?',
      timestamp: '2026-09-15T10:00:04.000Z',
      source: 'stop',
    });
    expect(fs.existsSync(companionPathOf(root, 'sess-end'))).toBe(false);
  });

  it('the companion file written by `cortex hook stop` is the one SessionEnd consumes', async () => {
    const root = project('stop-then-end');
    const transcript = writeTranscriptFile(root, [turnAt('user', 'go', T0), turnAt('assistant', 'Working.', T1)]);
    await runStop({ session_id: 'sess-end', last_assistant_message: 'All set.\n\nWant me to open the PR?', cwd: root }, { now: new Date('2026-09-15T10:00:30.000Z') });
    await run(sessionEndStdin(root, transcript), { now: NOW });
    expect(readSessionRecord(root, 'sess-end')?.open_question).toEqual({
      kind: 'question',
      text: 'Want me to open the PR?',
      timestamp: '2026-09-15T10:00:30.000Z',
      source: 'stop',
    });
    expect(fs.existsSync(companionPathOf(root, 'sess-end'))).toBe(false);
  });
});

describe('AC — an older companion file is ignored and still deleted', () => {
  it('companion at 09:58 vs a transcript ending with a user message at 10:00 → open_question null, file deleted', async () => {
    const root = project('companion-old');
    const transcript = writeTranscriptFile(root, [
      turnAt('assistant', QUESTION, T1),
      turnAt('user', 'the pulse root', T2),
    ]);
    writeCompanion(root, 'sess-end', 'Stale question?', '2026-09-15T09:58:00.000Z');
    await run(sessionEndStdin(root, transcript), { now: NOW });
    expect(readSessionRecord(root, 'sess-end')?.open_question).toBeNull();
    expect(fs.existsSync(companionPathOf(root, 'sess-end'))).toBe(false);
  });
});

describe('AC — an offer is recorded as an offer, an answered question is not recorded', () => {
  it('offer with nothing after → kind offer; the same followed by a user reply → null', async () => {
    const root = project('offer');
    const offer = 'I can wire the sync path too if you want.';
    const t1 = writeTranscriptFile(root, [turnAt('user', 'ok', T0), turnAt('assistant', offer, T1)], 'one.jsonl');
    const t2 = writeTranscriptFile(root, [turnAt('user', 'ok', T0), turnAt('assistant', offer, T1), turnAt('user', 'no, leave it', T2)], 'two.jsonl');
    await run(sessionEndStdin(root, t1, { session_id: 'one' }), { now: NOW });
    await run(sessionEndStdin(root, t2, { session_id: 'two' }), { now: NOW });
    expect(readSessionRecord(root, 'one')?.open_question?.kind).toBe('offer');
    expect(readSessionRecord(root, 'two')?.open_question).toBeNull();
  });
});

describe('AC — approvals are paired with what was approved', () => {
  it('records one entry pairing the approval with the preceding assistant paragraph', async () => {
    const root = project('approvals');
    const transcript = writeTranscriptFile(root, [
      turnAt('assistant', 'Two ways to do it.\n\nProposal: allocate T-ids from a separate counter file.', T0),
      turnAt('user', 'approved, go ahead', T1),
      turnAt('assistant', 'Done.', T2),
      turnAt('user', 'proceed', T2),
    ]);
    await run(sessionEndStdin(root, transcript), { now: NOW });
    const record = readSessionRecord(root, 'sess-end');
    expect(record?.approvals).toEqual([
      { approval: 'approved, go ahead', approved: 'Proposal: allocate T-ids from a separate counter file.', timestamp: T1 },
      { approval: 'proceed', approved: 'Done.', timestamp: T2 },
    ]);
    expect(record?.threads_opened.length).toBe(2);
    expect(listThreads(root).threads.map((t) => t.kind)).toEqual(['approval', 'approval']);
  });

  it('a `proceed` with no assistant message before it in the transcript is skipped', async () => {
    const root = project('approvals-skip');
    const transcript = writeTranscriptFile(root, [
      turnAt('user', 'proceed', T0),
      turnAt('assistant', 'Proposal: allocate T-ids from a separate counter file.', T1),
      turnAt('user', 'approved, go ahead', T2),
    ]);
    await run(sessionEndStdin(root, transcript), { now: NOW });
    expect(readSessionRecord(root, 'sess-end')?.approvals).toEqual([
      { approval: 'approved, go ahead', approved: 'Proposal: allocate T-ids from a separate counter file.', timestamp: T2 },
    ]);
  });
});

describe('AC — harness-injected user entries are not approvals and do not answer questions', () => {
  it('teammate, system-reminder and tool_result-only user entries are ignored; the human\'s Approved. counts and replies', async () => {
    const root = project('injected');
    writeThread(root, makeThread({ id: 'T-003', body: 'Keep the counter in state/?' }));
    writeThread(root, makeThread({ id: 'T-004', body: 'Which root for the counter, pulse or state?' }));
    fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'state'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'pulse', 'state', 'thread-counter'), '4\n');
    writeSessionRecordFixture(root, makeSessionRecord({ session_id: 'prev', ended: T0, threads_opened: ['T-004'] }));
    const toolResultOnly = {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_0', content: [{ type: 'text', text: 'ship it' }] }] },
      timestamp: T1,
    };
    const transcript = writeTranscriptFile(root, [
      turnAt('assistant', 'Two ways.\n\nProposal: allocate T-ids from a separate counter file.', T0),
      turnAt('user', 'Another Claude session sent a message:\n<teammate-message teammate_id="b2" summary="x">approved, go ahead — T-003 is settled</teammate-message>', T1),
      turnAt('user', '<system-reminder>go ahead with the plan</system-reminder>', T1),
      toolResultOnly,
      turnAt('user', 'Approved.', T2),
      turnAt('assistant', 'Done.', T2),
    ]);

    await run(sessionEndStdin(root, transcript), { now: NOW });

    const record = readSessionRecord(root, 'sess-end');
    expect(record?.approvals).toEqual([
      { approval: 'Approved.', approved: 'Proposal: allocate T-ids from a separate counter file.', timestamp: T2 },
    ]);
    expect(record?.threads_answered).toEqual(['T-004']);
    expect(threadById(root, 'T-003').status).toBe('open');
    expect(threadById(root, 'T-004').status).toBe('answered');
    expect(record?.session_kind).toBe('interactive');
  });

  it('a question followed only by a <task-notification> user entry is still the open question', async () => {
    const root = project('injected-q');
    const transcript = writeTranscriptFile(root, [
      turnAt('user', 'go', T0),
      turnAt('assistant', QUESTION, T1),
      turnAt('user', '<task-notification>batch done</task-notification>', T2),
    ]);
    await run(sessionEndStdin(root, transcript), { now: NOW });
    expect(readSessionRecord(root, 'sess-end')?.open_question?.text).toBe(QUESTION);
  });

  it('a scheduled session is still detected from its <scheduled-task> first user message', async () => {
    const root = project('injected-sched');
    const transcript = writeTranscriptFile(root, [
      turnAt('user', '<scheduled-task name="cortex-daily">run the bundle</scheduled-task>', T0),
      turnAt('assistant', 'Running.', T1),
    ]);
    await run(sessionEndStdin(root, transcript), { now: NOW });
    expect(readSessionRecord(root, 'sess-end')?.session_kind).toBe('scheduled');
  });
});

describe('AC — tagged findings are captured, malformed tags are skipped', () => {
  it('one well-formed tag survives next to a multi-line and a 301-character one', async () => {
    const root = project('findings');
    const transcript = writeTranscriptFile(root, [
      turnAt('user', 'measure it', T0),
      turnAt('assistant', `Result: ${FINDING_TAG}`, T1),
      turnAt('assistant', '<cortex:finding kind="conclusion">first\nsecond</cortex:finding>', T1),
      turnAt('assistant', `<cortex:finding kind="conclusion">${'z'.repeat(301)}</cortex:finding>`, T2),
    ]);
    await run(sessionEndStdin(root, transcript), { now: NOW });
    expect(readSessionRecord(root, 'sess-end')?.findings).toEqual([
      { kind: 'measurement', text: '2 insight invocations over 55 sessions', bears_on: ['src/pulse/usage.ts', 'pulse.usage'], timestamp: T1, source: 'tag' },
    ]);
    expect(threadById(root, 'T-001').bears_on).toEqual(['src/pulse/usage.ts', 'pulse.usage']);
  });
});

describe('AC — table rows, code fences and tagged text never feed the lexicon fallback', () => {
  it('records exactly the tag and the prose sentence', async () => {
    const root = project('table-rows');
    const text = [
      'Results:',
      '| 2 | CLI surface | 131,659 | **52,246** | code 2.5× cheaper |',
      '',
      '```',
      'median 12 ms',
      '```',
      `Kept: ${FINDING_TAG}`,
      'The whole pass measured 3.1x faster.',
    ].join('\n');
    const transcript = writeTranscriptFile(root, [turnAt('user', 'measure', T0), turnAt('assistant', text, T1)]);
    await run(sessionEndStdin(root, transcript), { now: NOW });
    expect(readSessionRecord(root, 'sess-end')?.findings.map((f) => [f.source, f.text])).toEqual([
      ['tag', '2 insight invocations over 55 sessions'],
      ['lexicon', 'The whole pass measured 3.1x faster.'],
    ]);
  });
});

describe('AC — status-ladder lines never feed the lexicon fallback', () => {
  it('records exactly the prose sentence and nothing from the three ladder lines', async () => {
    const root = project('status-ladder');
    const text = [
      'Goal ladder:',
      '0% ░░░░░░░░░░  done when a grep into the schema returns a Decided/Open pointer, measured',
      'Rollout 40% — median 12 ms over 30 sessions',
      'Done when the proceed-rate is measured over 20 sessions.',
      '',
      'The whole pass measured 3.1x faster.',
    ].join('\n');
    const transcript = writeTranscriptFile(root, [turnAt('user', 'brief', T0), turnAt('assistant', text, T1)]);
    await run(sessionEndStdin(root, transcript), { now: NOW });
    expect(readSessionRecord(root, 'sess-end')?.findings).toEqual([
      { kind: 'measurement', text: 'The whole pass measured 3.1x faster.', timestamp: T1, source: 'lexicon' },
    ]);
  });
});

describe('AC — untagged measurements fall back to the lexicon in interactive sessions only', () => {
  const SENTENCE = 'The line-filtered pass measured 3.1x faster than a full parse.';

  it('interactive → one lexicon finding; scheduled → zero findings and session_kind scheduled', async () => {
    const root = project('lexicon');
    const inter = writeTranscriptFile(root, [turnAt('user', 'run it', T0), turnAt('assistant', `Ok. ${SENTENCE}`, T1)], 'i.jsonl');
    const sched = writeTranscriptFile(root, [skillBaseDirUserTurn(), turnAt('assistant', `Ok. ${SENTENCE}`, T1)], 's.jsonl');
    await run(sessionEndStdin(root, inter, { session_id: 'i' }), { now: NOW });
    await run(sessionEndStdin(root, sched, { session_id: 's' }), { now: NOW });
    const i = readSessionRecord(root, 'i');
    const s = readSessionRecord(root, 's');
    expect(i?.session_kind).toBe('interactive');
    expect(i?.findings).toEqual([{ kind: 'measurement', text: SENTENCE, timestamp: T1, source: 'lexicon' }]);
    expect(s?.session_kind).toBe('scheduled');
    expect(s?.findings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 8 — artefacts as record fields
// ---------------------------------------------------------------------------

function scratchFixture(root: string): { scratch: string; transcript: string; defects: string } {
  const scratch = path.join(tmp('scratch'), 'x', 'scratchpad');
  fs.mkdirSync(scratch, { recursive: true });
  const defects = path.join(scratch, 'defects.md');
  fs.writeFileSync(defects, '# Defects found\n\n' + 'd'.repeat(2000) + '\n');
  fs.writeFileSync(path.join(scratch, 'big.md'), '# Big\n' + 'b'.repeat(100 * 1024));
  const transcript = writeTranscriptFile(root, [
    turnAt('user', 'write it up', T0),
    fileToolTurnAt('Write', defects, T1),
    fileToolTurnAt('Edit', path.join(scratch, 'big.md'), T1),
    fileToolTurnAt('Write', '/elsewhere/scratchpad/notes.md', T1),
    fileToolTurnAt('Write', path.join(root, 'src/hooks/session-end.ts'), T2),
    turnAt('assistant', 'Written.', T2),
  ]);
  return { scratch, transcript, defects };
}

describe('AC — scratchpad artefacts are copied with their first heading, using scratchpad_dir when given', () => {
  it('two entries, defects.md copied byte-identically with its heading, big.md not copied; one artefact thread', async () => {
    const root = project('artefacts');
    const { scratch, transcript, defects } = scratchFixture(root);
    await run(sessionEndStdin(root, transcript, { scratchpad_dir: scratch }), { now: NOW });
    const record = readSessionRecord(root, 'sess-end');
    expect(record?.artefacts).toEqual([
      { path: defects, copied: true, first_heading: 'Defects found' },
      { path: path.join(scratch, 'big.md'), copied: false, first_heading: null },
    ]);
    expect(fs.readFileSync(path.join(scratchDirOf(root, 'sess-end'), 'defects.md'))).toEqual(fs.readFileSync(defects));
    expect(record?.threads_opened).toEqual(['T-001']);
    const t = threadById(root, 'T-001');
    expect(t.kind).toBe('artefact');
    expect(t.body).toBe(`**Path:** ${defects}\n**Heading:** Defects found\n**Copy:** .cortex/pulse/scratch/sess-end/defects.md`);
  });
});

describe('AC — without scratchpad_dir the path heuristic applies', () => {
  it('three entries, /elsewhere/scratchpad/notes.md among them', async () => {
    const root = project('heuristic');
    const { transcript } = scratchFixture(root);
    await run(sessionEndStdin(root, transcript), { now: NOW });
    const paths = readSessionRecord(root, 'sess-end')?.artefacts.map((a) => a.path);
    expect(paths?.length).toBe(3);
    expect(paths).toContain('/elsewhere/scratchpad/notes.md');
    expect(paths?.some((p) => p.endsWith('src/hooks/session-end.ts'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 9 — threads
// ---------------------------------------------------------------------------

describe('AC — threads opened and answered are named in the record', () => {
  it('a question and a tagged finding → two thread files, ids in creation order, counter 2, answered empty', async () => {
    const root = project('threads');
    const transcript = writeTranscriptFile(root, [
      turnAt('user', 'measure then ask', T0),
      turnAt('assistant', `Measured: ${FINDING_TAG}\n\n${QUESTION}`, T1),
    ]);
    await run(sessionEndStdin(root, transcript), { now: NOW });
    const record = readSessionRecord(root, 'sess-end');
    expect(fs.readdirSync(threadsDirOf(root)).length).toBe(2);
    expect(record?.threads_opened).toEqual(['T-001', 'T-002']);
    expect(record?.threads_answered).toEqual([]);
    expect(listThreads(root).threads.map((t) => t.kind)).toEqual(['question', 'finding']);
    expect(fs.readFileSync(path.join(root, '.cortex', 'pulse', 'state', 'thread-counter'), 'utf-8').trim()).toBe('2');
  });

  it('answered detection runs over the threads open before this run, and lands in threads_answered', async () => {
    const root = project('answered');
    writeThread(root, makeThread({ id: 'T-003', body: 'Keep the counter in state/?' }));
    writeSessionRecordFixture(root, makeSessionRecord({ session_id: 'prev', ended: T0, threads_opened: ['T-003'] }));
    const transcript = writeTranscriptFile(root, [
      turnAt('user', 'state/ please', T1),
      turnAt('assistant', `Done.\n\n${QUESTION}`, T2),
    ]);
    await run(sessionEndStdin(root, transcript), { now: NOW });
    const record = readSessionRecord(root, 'sess-end');
    expect(record?.threads_answered).toEqual(['T-003']);
    expect(record?.threads_opened).toEqual(['T-001']);
    const t = threadById(root, 'T-003');
    expect(t.status).toBe('answered');
    expect(t.resolved_by).toBe(`claude-sessions/${USER}/sess-end`);
    expect(t.answered).toBe(NOW.toISOString());
    expect(threadById(root, 'T-001').status).toBe('open');
  });

  it('an open thread id mentioned only in the head of a large transcript is still answered (prefix trigger)', async () => {
    const root = project('idhead');
    writeThread(root, makeThread({ id: 'T-007', body: 'Old question?' }));
    const { path: transcript } = writeLargeTranscript(root, {
      head: [turnAt('user', 'T-007 is settled', T0)],
      tail: [turnAt('assistant', 'Fine.', T2)],
      targetBytes: 3 * 1024 * 1024,
    });
    await run(sessionEndStdin(root, transcript), { now: NOW });
    expect(readSessionRecord(root, 'sess-end')?.threads_answered).toEqual(['T-007']);
  });
});

describe('AC — a scheduled session opens finding and artefact threads only', () => {
  it('the record keeps the question and approval; threads/ holds finding and artefact only', async () => {
    const root = project('scheduled');
    const scratch = path.join(tmp('scratch-s'), 'scratchpad');
    fs.mkdirSync(scratch, { recursive: true });
    const report = path.join(scratch, 'report.md');
    fs.writeFileSync(report, '# Report\nok\n');
    const transcript = writeTranscriptFile(root, [
      skillBaseDirUserTurn(),
      turnAt('assistant', 'Proposal: run the sweep nightly.', T0),
      turnAt('user', 'approved', T0),
      fileToolTurnAt('Write', report, T1),
      turnAt('assistant', `Measured: ${FINDING_TAG}\n\n${QUESTION}`, T2),
    ]);
    await run(sessionEndStdin(root, transcript, { scratchpad_dir: scratch }), { now: NOW });
    const record = readSessionRecord(root, 'sess-end');
    expect(record?.session_kind).toBe('scheduled');
    expect(record?.open_question?.text).toBe(QUESTION);
    expect(record?.approvals.length).toBe(1);
    expect(fs.readdirSync(threadsDirOf(root)).length).toBe(2);
    expect(listThreads(root).threads.map((t) => t.kind)).toEqual(['finding', 'artefact']);
    expect(record?.threads_opened).toEqual(['T-001', 'T-002']);
  });
});

// ---------------------------------------------------------------------------
// Rule 5 — the bounded read as the record sees it
// ---------------------------------------------------------------------------

describe('AC — message extraction is capped at the tail, prefix scans cover the whole file', () => {
  it('5 MiB: partial, scheduled, the finding, the artefact and the question are recorded; approvals are empty', async () => {
    const root = project('5mib');
    const scratch = path.join(tmp('scratch-5'), 'scratchpad');
    fs.mkdirSync(scratch, { recursive: true });
    const notes = path.join(scratch, 'notes.md');
    fs.writeFileSync(notes, '# Notes\n');
    const { path: transcript } = writeLargeTranscript(root, {
      head: [
        skillBaseDirUserTurn(),
        turnAt('assistant', `Measured: ${FINDING_TAG}`, T0),
        fileToolTurnAt('Write', notes, T0),
        turnAt('assistant', 'Proposal: X.', T0),
        turnAt('user', 'approved, go ahead', T0),
      ],
      tail: [turnAt('assistant', QUESTION, T2)],
      targetBytes: 5 * 1024 * 1024,
    });
    const started = Date.now();
    await run(sessionEndStdin(root, transcript, { scratchpad_dir: scratch }), { now: NOW });
    const elapsed = Date.now() - started;
    const record = readSessionRecord(root, 'sess-end');
    expect(record?.partial).toBe(true);
    expect(record?.session_kind).toBe('scheduled');
    expect(record?.findings.map((f) => f.text)).toEqual(['2 insight invocations over 55 sessions']);
    expect(record?.artefacts).toEqual([{ path: notes, copied: true, first_heading: 'Notes' }]);
    expect(record?.open_question?.text).toBe(QUESTION);
    expect(record?.approvals).toEqual([]);
    expect(elapsed).toBeLessThan(3000);
  });
});

describe('AC — a transcript over the hard cap still yields a tail record', () => {
  it('70 MiB (sparse): partial, the open question is recorded, the head\'s finding is not, the run completes', async () => {
    const root = project('70mib');
    const transcript = writeSparseTranscript(root, {
      head: [turnAt('assistant', `Head: ${FINDING_TAG}`, T0)],
      tail: [turnAt('user', 'so?', T1), turnAt('assistant', QUESTION, T2)],
      totalBytes: 70 * 1024 * 1024,
    });
    const result = await run(sessionEndStdin(root, transcript), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    const record = readSessionRecord(root, 'sess-end');
    expect(record?.partial).toBe(true);
    expect(record?.open_question?.text).toBe(QUESTION);
    expect(record?.findings).toEqual([]);
  });
});

describe('AC — bulk lines are skipped without loss of small ones', () => {
  it('a 300 KiB tool_use line next to a small scratchpad Write → exactly one artefact, no error logged', async () => {
    const root = project('bulk');
    const transcript = writeTranscriptFile(root, [
      turnAt('user', 'go', T0),
      fileToolTurnAt('Write', '/tmp/x/scratchpad/bulk.md', T1, { content: 'y'.repeat(300 * 1024) }),
      fileToolTurnAt('Write', '/tmp/x/scratchpad/small.md', T1),
    ]);
    await run(sessionEndStdin(root, transcript), { now: NOW });
    const record = readSessionRecord(root, 'sess-end');
    expect(record?.artefacts).toEqual([{ path: '/tmp/x/scratchpad/small.md', copied: false, first_heading: null }]);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rules 2, 3, 10 — silence, degradation, pulse-only
// ---------------------------------------------------------------------------

describe('AC — missing transcript degrades to nothing', () => {
  it('exit 0, empty stdout, no record/thread/scratch, exactly one hook-errors entry naming session-end', async () => {
    const root = project('missing');
    const result = await run({ session_id: 'abc', transcript_path: '/nope.jsonl', cwd: root }, { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    for (const d of ['sessions', 'threads', 'scratch']) {
      expect(fs.existsSync(path.join(root, '.cortex', 'pulse', d))).toBe(false);
    }
    const entries = readHookErrorEntries(root);
    expect(entries.length).toBe(1);
    expect(entries[0]).toMatch(/^- hook: session-end \|/);
  });

  it.each([
    ['no transcript_path', { session_id: 'abc' }],
    ['transcript with zero entries', { session_id: 'abc', transcript_path: 'EMPTY' }],
  ])('%s → no record and one error entry', async (_label, stdin) => {
    const root = project('degrade');
    const payload: Record<string, unknown> = { ...stdin, cwd: root };
    if (payload['transcript_path'] === 'EMPTY') {
      payload['transcript_path'] = path.join(root, 'empty.jsonl');
      fs.writeFileSync(payload['transcript_path'] as string, 'not json\n\n');
    }
    expect(await run(payload, { now: NOW })).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', 'sessions'))).toBe(false);
    expect(readHookErrorEntries(root).length).toBe(1);
  });

  it('malformed stdin and an absent .cortex/ are silent with nothing written and nothing logged', async () => {
    const root = tmp('nocortex');
    expect(await run({ session_id: 'abc', transcript_path: '/nope.jsonl', cwd: root }, { now: NOW })).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.readdirSync(root)).toEqual([]);
    const root2 = project('badstdin');
    expect(await run('garbage', { cwd: root2, now: NOW })).toEqual({ exitCode: 0, stdout: '' });
    expect(await run(null, { cwd: root2, now: NOW })).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(path.join(root2, '.cortex', 'pulse', 'sessions'))).toBe(false);
  });
});

describe('AC — only pulse is written', () => {
  it('a full run with threads, artefacts and a companion touches only .cortex/pulse/', async () => {
    const root = project('pulse-only');
    fs.mkdirSync(path.join(root, '.cortex', 'compass', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'compass', 'rules', 'R-001.md'), '---\nid: R-001\n---\n');
    fs.mkdirSync(path.join(root, '.specflow', 'specs'), { recursive: true });
    fs.writeFileSync(path.join(root, '.specflow', 'specs', 'x.spec.md'), '# x\n');
    fs.writeFileSync(path.join(root, 'RULES.md'), '# rules\n');
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# claude\n');
    const { scratch, transcript } = scratchFixture(root);
    writeThread(root, makeThread({ id: 'T-001', body: 'Keep the counter under pulse/state/ for now?' }));
    writeCompanion(root, 'sess-end', 'Anything else?', '2026-09-15T10:00:30.000Z');
    const before = snapshotTree(root);

    await run(sessionEndStdin(root, transcript, { scratchpad_dir: scratch }), { now: NOW });
    const touched = pulseOnly(root, before);
    expect(touched).toContain(path.join('.cortex', 'pulse', 'sessions', 'sess-end.json'));

    const before2 = snapshotTree(root);
    await runStop({ session_id: 'sess-end', last_assistant_message: 'ok?', cwd: root }, { now: NOW });
    pulseOnly(root, before2);
  });
});

describe('AC — re-firing for the same session replaces the record without doubling threads', () => {
  it('second fire rewrites sessions/abc.json, threads/ still holds one file, threads_opened is ["T-001"]', async () => {
    const root = project('refire');
    const transcript = writeTranscriptFile(root, [turnAt('user', 'go', T0), turnAt('assistant', QUESTION, T1)]);
    await run(sessionEndStdin(root, transcript, { session_id: 'abc', reason: 'resume' }), { now: NOW });
    expect(readSessionRecord(root, 'abc')?.threads_opened).toEqual(['T-001']);

    const later = new Date(NOW.getTime() + 120_000);
    await run(sessionEndStdin(root, transcript, { session_id: 'abc', reason: 'other' }), { now: later });

    const record = readSessionRecord(root, 'abc');
    expect(record?.ended).toBe(later.toISOString());
    expect(record?.reason).toBe('other');
    expect(record?.threads_opened).toEqual(['T-001']);
    expect(record?.threads_answered).toEqual([]);
    expect(fs.readdirSync(threadsDirOf(root)).length).toBe(1);
    const t = threadById(root, 'T-001');
    expect(t.status).toBe('open');
    expect(t.sessions).toEqual([`claude-sessions/${USER}/abc`]);
  });
});

// ---------------------------------------------------------------------------
// Rule 1 — dispatch
// ---------------------------------------------------------------------------

describe('AC — registered under SessionEnd and Stop (the `cortex hook` dispatch half)', () => {
  it('`cortex hook session-end` and `cortex hook stop` both dispatch: exit 0, empty stdout, files written', async () => {
    const root = project('dispatch');
    const transcript = writeTranscriptFile(root, [turnAt('user', 'go', T0), turnAt('assistant', QUESTION, T1)]);
    const stop = await runHook('stop', JSON.stringify({ session_id: 'd1', last_assistant_message: 'Ready?', cwd: root }));
    expect(stop).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(companionPathOf(root, 'd1'))).toBe(true);
    const end = await runHook('session-end', JSON.stringify(sessionEndStdin(root, transcript, { session_id: 'd1' })));
    expect(end).toEqual({ exitCode: 0, stdout: '' });
    expect(readSessionRecord(root, 'd1')?.kind).toBe('pulse-session-record');
    expect(fs.existsSync(companionPathOf(root, 'd1'))).toBe(false);
  });
});
