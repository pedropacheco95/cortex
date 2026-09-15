/**
 * Spec tests — `pulse.threads`, the record side of the ledger: opening threads
 * from a session record (Rules 3, 4, 6, 8), dedupe against open threads
 * (Rule 7), answered detection (Rule 9) and the open-only transitions it
 * respects (Rule 10), with the pulse-only write invariant (Rule 13). The
 * primitives are covered atomically in tests/atomic/pulse/threads.test.ts;
 * the human verbs live in thread-cli.test.ts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp, makeCortexProject } from '../../fixtures/hooks-harness.js';
import { snapshotTree } from '../../fixtures/init-harness.js';
import { makeThread, threadCitation, threadsDirOf, readThreadRaw } from '../../fixtures/threads.js';
import { makeSessionRecord, writeReadLedger, writeSessionRecordFixture } from '../../fixtures/session-end-harness.js';
import {
  KEY_MIN_CHARS,
  openThreadsFromRecord,
  detectAnswered,
  listThreads,
  parseThreadFile,
  writeThread,
  readThreadCounter,
  keyText,
} from '../../../src/pulse/threads.js';
import type { Thread } from '../../../src/pulse/threads.js';
import type { ExtractedMessage } from '../../../src/sessions/read.js';

const NOW = new Date('2026-09-15T10:00:00.000Z');
const ENDED = NOW.toISOString();
const QUESTION = 'Do you want the counter in state/ or at the pulse root?';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`threads-spec-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function msg(role: 'user' | 'assistant', text: string): ExtractedMessage {
  return { role, text, timestamp: ENDED };
}

/** Seed `pulse/state/thread-counter` so hand-written T-NNN fixtures are not re-allocated. */
function seedCounter(root: string, n: number): void {
  const file = path.join(root, '.cortex', 'pulse', 'state', 'thread-counter');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${n}\n`);
}

function openThreads(root: string): Thread[] {
  return listThreads(root).threads.filter((t) => t.status === 'open');
}

function threadById(root: string, id: string): Thread {
  const raw = readThreadRaw(root, id);
  expect(raw, `thread ${id} exists`).not.toBeNull();
  const parsed = parseThreadFile(raw as string);
  expect(parsed, `thread ${id} parses`).not.toBeNull();
  return parsed as Thread;
}

function answeredOpts(
  overrides: Partial<Parameters<typeof detectAnswered>[1]> = {},
): Parameters<typeof detectAnswered>[1] {
  return {
    sessionId: 's9',
    citation: threadCitation('s9'),
    sessionKind: 'interactive',
    messages: [],
    firstUserText: 'hello',
    ended: ENDED,
    openBefore: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Rules 1, 3, 4, 6, 8 — opening threads from a record
// ---------------------------------------------------------------------------

describe('AC — a thread file has the contract frontmatter and body (from a record with a read ledger)', () => {
  it('writes T-001 with the §4.5.3 fields, the ledger\'s .cortex/.specflow lines as bears_on, and the question as body', () => {
    const root = tmp('contract');
    makeCortexProject(root);
    writeReadLedger(root, 's1', [
      'src/pulse/hygiene.ts',
      '.cortex/compass/rules/R-001-core-no-llm-calls.md',
      '.specflow/specs/pulse/hygiene.spec.md',
    ]);
    const record = makeSessionRecord({
      session_id: 's1',
      session: threadCitation('s1'),
      open_question: { kind: 'question', text: QUESTION, timestamp: ENDED, source: 'transcript' },
    });

    const ids = openThreadsFromRecord(root, record, NOW);

    expect(ids).toEqual(['T-001']);
    const file = path.join(threadsDirOf(root), 'T-001-do-you-want-the-counter-in-state-or-at-the-pulse-root.md');
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, 'utf-8')).toBe(
      [
        '---',
        'id: T-001',
        'kind: question',
        'status: open',
        'opened: 2026-09-15T10:00:00.000Z',
        `session: ${threadCitation('s1')}`,
        'sessions:',
        `  - ${threadCitation('s1')}`,
        'bears_on:',
        '  - .cortex/compass/rules/R-001-core-no-llm-calls.md',
        '  - .specflow/specs/pulse/hygiene.spec.md',
        'expires: 2026-10-15T10:00:00.000Z',
        '---',
        '',
        QUESTION,
        '',
      ].join('\n'),
    );
    expect(readThreadCounter(root)).toBe(1);
  });

  it('an absent read ledger leaves bears_on empty; an empty record opens nothing and allocates nothing', () => {
    const root = tmp('noledger');
    makeCortexProject(root);
    expect(openThreadsFromRecord(root, makeSessionRecord(), NOW)).toEqual([]);
    expect(fs.existsSync(threadsDirOf(root))).toBe(false);
    expect(readThreadCounter(root)).toBe(0);
    const ids = openThreadsFromRecord(
      root,
      makeSessionRecord({ open_question: { kind: 'offer', text: 'I can do it if you want.', timestamp: null, source: 'stop' } }),
      NOW,
    );
    expect(ids).toEqual(['T-001']);
    expect(threadById(root, 'T-001').bears_on).toEqual([]);
  });
});

describe('AC — one thread per record item, in creation order (Rules 3, 6, 8)', () => {
  it('offer, two approvals, one finding, one copied artefact → T-001..T-005 in that order; the uncopied artefact opens nothing', () => {
    const root = tmp('order');
    makeCortexProject(root);
    const record = makeSessionRecord({
      session_id: 's3',
      session: threadCitation('s3'),
      open_question: { kind: 'offer', text: 'I can wire the sync path too if you want.', timestamp: ENDED, source: 'transcript' },
      approvals: [
        { approval: 'approved, go ahead', approved: 'Proposal: allocate T-ids from a separate counter file.', timestamp: ENDED },
        { approval: 'ship it', approved: 'Second proposal.', timestamp: ENDED },
      ],
      findings: [{ kind: 'measurement', text: '2 insight invocations over 55 sessions', bears_on: [], timestamp: ENDED, source: 'tag' }],
      artefacts: [
        { path: '/tmp/x/scratchpad/defects.md', copied: true, first_heading: 'Defects found' },
        { path: '/tmp/x/scratchpad/big.md', copied: false, first_heading: null },
      ],
    });

    const ids = openThreadsFromRecord(root, record, NOW);

    expect(ids).toEqual(['T-001', 'T-002', 'T-003', 'T-004', 'T-005']);
    const threads = listThreads(root).threads;
    expect(threads.map((t) => [t.id, t.kind])).toEqual([
      ['T-001', 'offer'],
      ['T-002', 'approval'],
      ['T-003', 'approval'],
      ['T-004', 'finding'],
      ['T-005', 'artefact'],
    ]);
    expect(threads.every((t) => t.status === 'open' && t.session === threadCitation('s3') && t.sessions.length === 1)).toBe(true);
    // Rule 6 bodies per kind
    expect(threads[1]?.body).toBe('**Approved:** Proposal: allocate T-ids from a separate counter file.\n**By:** approved, go ahead');
    expect(threads[3]?.body).toBe('2 insight invocations over 55 sessions\n**Kind:** measurement\n**Source:** tag');
    expect(threads[4]?.body).toBe(
      '**Path:** /tmp/x/scratchpad/defects.md\n**Heading:** Defects found\n**Copy:** .cortex/pulse/scratch/s3/defects.md',
    );
    expect(threads.some((t) => t.body.includes('big.md'))).toBe(false);
    expect(readThreadCounter(root)).toBe(5);
  });

  it('an artefact without a heading writes `-`; a lexicon finding records its source', () => {
    const root = tmp('bodies');
    makeCortexProject(root);
    openThreadsFromRecord(
      root,
      makeSessionRecord({
        findings: [{ kind: 'conclusion', text: 'The pass measured 3.1x faster.', bears_on: [], timestamp: null, source: 'lexicon' }],
        artefacts: [{ path: '/tmp/x/scratchpad/raw.txt', copied: true, first_heading: null }],
      }),
      NOW,
    );
    expect(threadById(root, 'T-001').body).toBe('The pass measured 3.1x faster.\n**Kind:** conclusion\n**Source:** lexicon');
    expect(threadById(root, 'T-002').body).toBe('**Path:** /tmp/x/scratchpad/raw.txt\n**Heading:** -\n**Copy:** .cortex/pulse/scratch/s1/raw.txt');
  });
});

describe('AC — a scheduled record opens finding and artefact threads only', () => {
  it('skips the offer and the approval; opens the finding and the artefact; ids are consecutive', () => {
    const root = tmp('scheduled');
    makeCortexProject(root);
    const record = makeSessionRecord({
      session_kind: 'scheduled',
      open_question: { kind: 'offer', text: 'Shall I keep the counter in state/?', timestamp: ENDED, source: 'transcript' },
      approvals: [{ approval: 'proceed', approved: 'The plan.', timestamp: ENDED }],
      findings: [{ kind: 'measurement', text: 'over 55 sessions the hook fired 12 times', bears_on: [], timestamp: ENDED, source: 'tag' }],
      artefacts: [{ path: '/tmp/x/scratchpad/report.md', copied: true, first_heading: 'Report' }],
    });
    const ids = openThreadsFromRecord(root, record, NOW);
    expect(ids).toEqual(['T-001', 'T-002']);
    expect(listThreads(root).threads.map((t) => t.kind)).toEqual(['finding', 'artefact']);
    expect(fs.readdirSync(threadsDirOf(root)).length).toBe(2);
  });
});

describe('AC — a finding\'s tag targets lead its bears_on, capped at 12', () => {
  it('two tag targets first, then the first ten .cortex/ ledger paths; other threads get the first twelve ledger paths', () => {
    const root = tmp('bearson');
    makeCortexProject(root);
    const ledger = Array.from({ length: 15 }, (_, i) => `.cortex/insight/anatomy/src/f${i}.ts.md`);
    writeReadLedger(root, 's1', ledger);
    const record = makeSessionRecord({
      open_question: { kind: 'question', text: QUESTION, timestamp: ENDED, source: 'transcript' },
      findings: [{ kind: 'measurement', text: '2 insight invocations over 55 sessions', bears_on: ['pulse.usage', 'src/pulse/usage.ts'], timestamp: ENDED, source: 'tag' }],
    });
    openThreadsFromRecord(root, record, NOW);
    const finding = threadById(root, 'T-002');
    expect(finding.kind).toBe('finding');
    expect(finding.bears_on.length).toBe(12);
    expect(finding.bears_on.slice(0, 2)).toEqual(['pulse.usage', 'src/pulse/usage.ts']);
    expect(finding.bears_on.slice(2)).toEqual(ledger.slice(0, 10));
    expect(threadById(root, 'T-001').bears_on).toEqual(ledger.slice(0, 12));
  });

  it('bears_on is deduplicated across the tag targets and the ledger, keeping first occurrence order', () => {
    const root = tmp('dedupe-bears');
    makeCortexProject(root);
    writeReadLedger(root, 's1', ['.cortex/a.md', '.cortex/b.md', '.cortex/a.md', 'src/x.ts']);
    openThreadsFromRecord(
      root,
      makeSessionRecord({
        findings: [{ kind: 'conclusion', text: 'c', bears_on: ['.cortex/b.md', 'pulse.usage'], timestamp: null, source: 'tag' }],
      }),
      NOW,
    );
    expect(threadById(root, 'T-001').bears_on).toEqual(['.cortex/b.md', 'pulse.usage', '.cortex/a.md']);
  });
});

// ---------------------------------------------------------------------------
// Rule 7 — dedupe by key against open threads
// ---------------------------------------------------------------------------

describe('AC — same question twice opens one thread with a two-session trail', () => {
  it('a matching key against an open thread appends s2\'s citation, creates no file, and reports the matched id', () => {
    const root = tmp('dedupe');
    makeCortexProject(root);
    writeThread(root, makeThread({ body: 'do you want the counter in state/ or at the pulse root?' }));
    const record = makeSessionRecord({
      session_id: 's2',
      session: threadCitation('s2'),
      open_question: { kind: 'question', text: '  Do  you want the counter in state/\nor at the pulse root?', timestamp: ENDED, source: 'stop' },
    });

    const ids = openThreadsFromRecord(root, record, NOW);

    expect(ids).toEqual(['T-001']);
    expect(fs.readdirSync(threadsDirOf(root)).length).toBe(1);
    const t = threadById(root, 'T-001');
    expect(t.sessions).toEqual([threadCitation('s1'), threadCitation('s2')]);
    expect(t.session).toBe(threadCitation('s1'));
    expect(t.body).toBe('do you want the counter in state/ or at the pulse root?');
    expect(readThreadCounter(root)).toBe(0);
  });

  it('a deduped id keeps its Rule 8 position; the same session is not appended twice', () => {
    const root = tmp('position');
    makeCortexProject(root);
    writeThread(root, makeThread({ id: 'T-001', kind: 'finding', body: '2 insight invocations over 55 sessions\n**Kind:** measurement\n**Source:** tag' }));
    seedCounter(root, 1);
    const record = makeSessionRecord({
      session_id: 's1',
      session: threadCitation('s1'),
      open_question: { kind: 'question', text: QUESTION, timestamp: ENDED, source: 'transcript' },
      findings: [{ kind: 'measurement', text: '2 insight invocations over 55 sessions', bears_on: [], timestamp: ENDED, source: 'tag' }],
      artefacts: [{ path: '/tmp/x/scratchpad/a.md', copied: true, first_heading: null }],
    });
    expect(openThreadsFromRecord(root, record, NOW)).toEqual(['T-002', 'T-001', 'T-003']);
    expect(threadById(root, 'T-001').sessions).toEqual([threadCitation('s1')]);
  });
});

describe('AC — an answered thread does not block a new one', () => {
  it('T-001 answered with the same key → T-002 is opened and T-001 is untouched', () => {
    const root = tmp('answered');
    makeCortexProject(root);
    writeThread(root, makeThread({ status: 'answered', answered: ENDED, resolved_by: threadCitation('s1') }));
    seedCounter(root, 1);
    const before = readThreadRaw(root, 'T-001');
    const ids = openThreadsFromRecord(
      root,
      makeSessionRecord({ session_id: 's2', session: threadCitation('s2'), open_question: { kind: 'question', text: QUESTION, timestamp: ENDED, source: 'transcript' } }),
      NOW,
    );
    expect(ids).toEqual(['T-002']);
    expect(readThreadRaw(root, 'T-001')).toBe(before);
    expect(threadById(root, 'T-002').status).toBe('open');
  });
});

// ---------------------------------------------------------------------------
// Rule 9 — answered detection
// ---------------------------------------------------------------------------

describe('AC — mentioning a thread id answers it', () => {
  it('a user message naming T-003 marks it answered with the record\'s ended and the session citation; body byte-identical', () => {
    const root = tmp('idmention');
    makeCortexProject(root);
    writeThread(root, makeThread({ id: 'T-003', body: 'Keep the counter in state/?' }));
    const bodyBefore = (readThreadRaw(root, 'T-003') as string).split('---\n')[2];
    const openBefore = openThreads(root);

    const answered = detectAnswered(
      root,
      answeredOpts({ messages: [msg('user', 'T-003 is settled, we keep the counter in state/')], openBefore }),
    );

    expect(answered).toEqual(['T-003']);
    const t = threadById(root, 'T-003');
    expect(t.status).toBe('answered');
    expect(t.answered).toBe(ENDED);
    expect(t.resolved_by).toBe(threadCitation('s9'));
    expect((readThreadRaw(root, 'T-003') as string).split('---\n')[2]).toBe(bodyBefore);
  });

  it('only a whole-word id counts; assistant text counts too; a scheduled session still answers by id', () => {
    const root = tmp('idword');
    makeCortexProject(root);
    writeThread(root, makeThread({ id: 'T-003' }));
    writeThread(root, makeThread({ id: 'T-030', body: 'other' }));
    const openBefore = openThreads(root);
    expect(detectAnswered(root, answeredOpts({ messages: [msg('assistant', 'see T-0030 and XT-003')], openBefore }))).toEqual([]);
    expect(detectAnswered(root, answeredOpts({ sessionKind: 'scheduled', messages: [msg('assistant', 'closing T-030 now')], openBefore }))).toEqual(['T-030']);
    expect(threadById(root, 'T-003').status).toBe('open');
  });
});

describe('AC — restating a thread\'s text answers it, short keys excepted', () => {
  it('a 45-character key restated verbatim answers; a 12-character key does not', () => {
    const root = tmp('keymention');
    makeCortexProject(root);
    const longBody = 'Keep the thread counter under pulse/state/?';
    expect(longBody.length).toBe(43);
    writeThread(root, makeThread({ id: 'T-004', body: longBody }));
    writeThread(root, makeThread({ id: 'T-005', kind: 'offer', body: 'ship the cli' }));
    expect(KEY_MIN_CHARS).toBe(20);
    const openBefore = openThreads(root);

    const answered = detectAnswered(
      root,
      answeredOpts({ messages: [msg('assistant', `Yes — keep the thread counter under PULSE/state/? And ship the cli.`)], openBefore }),
    );

    expect(answered).toEqual(['T-004']);
    expect(threadById(root, 'T-004').status).toBe('answered');
    expect(threadById(root, 'T-005').status).toBe('open');
  });

  it('the key is matched over the normalised concatenation of every message, across a message boundary too', () => {
    const root = tmp('concat');
    makeCortexProject(root);
    writeThread(root, makeThread({ id: 'T-004', body: 'Keep the thread counter under pulse/state/?' }));
    const openBefore = openThreads(root);
    const answered = detectAnswered(
      root,
      answeredOpts({ messages: [msg('user', 'keep the thread counter'), msg('assistant', 'under pulse/state/?')], openBefore }),
    );
    expect(answered).toEqual(['T-004']);
  });
});

describe('AC — the next interactive session\'s first message answers a hanging question', () => {
  function hangingSetup(root: string, kind: Thread['kind'] = 'question'): Thread[] {
    makeCortexProject(root);
    writeThread(root, makeThread({ id: 'T-006', kind, body: kind === 'approval' ? '**Approved:** the plan\n**By:** go ahead' : QUESTION }));
    writeSessionRecordFixture(root, makeSessionRecord({ session_id: 's0', ended: '2026-09-14T10:00:00.000Z', threads_opened: [] }));
    writeSessionRecordFixture(root, makeSessionRecord({ session_id: 's1', ended: '2026-09-15T10:00:00.000Z', threads_opened: ['T-006'] }));
    return openThreads(root);
  }

  it('s2 interactive with a non-empty first user message mentioning neither id nor key → T-006 answered by s2', () => {
    const root = tmp('reply');
    const openBefore = hangingSetup(root);
    const answered = detectAnswered(
      root,
      answeredOpts({
        sessionId: 's2',
        citation: threadCitation('s2'),
        firstUserText: 'state/ please',
        messages: [msg('user', 'state/ please')],
        ended: '2026-09-15T11:00:00.000Z',
        openBefore,
      }),
    );
    expect(answered).toEqual(['T-006']);
    const t = threadById(root, 'T-006');
    expect(t.status).toBe('answered');
    expect(t.resolved_by).toBe(threadCitation('s2'));
    expect(t.answered).toBe('2026-09-15T11:00:00.000Z');
  });

  it('the newest record is picked by greatest ended, excluding the session itself; an empty first message does not reply', () => {
    const root = tmp('newest');
    const openBefore = hangingSetup(root);
    // A record for s2 itself (a re-fire) must not count as "the newest other record".
    writeSessionRecordFixture(root, makeSessionRecord({ session_id: 's2', ended: '2026-09-15T12:00:00.000Z', threads_opened: [] }));
    expect(
      detectAnswered(root, answeredOpts({ sessionId: 's2', citation: threadCitation('s2'), firstUserText: '', messages: [], openBefore })),
    ).toEqual([]);
    expect(
      detectAnswered(root, answeredOpts({ sessionId: 's2', citation: threadCitation('s2'), firstUserText: 'state/ please', messages: [], openBefore })),
    ).toEqual(['T-006']);
  });

  it('when a newer record lists a different thread, the older hanging question is not answered by reply', () => {
    const root = tmp('older');
    const openBefore = hangingSetup(root);
    writeSessionRecordFixture(root, makeSessionRecord({ session_id: 's1b', ended: '2026-09-15T10:30:00.000Z', threads_opened: ['T-099'] }));
    expect(detectAnswered(root, answeredOpts({ sessionId: 's2', firstUserText: 'state/ please', openBefore }))).toEqual([]);
    expect(threadById(root, 'T-006').status).toBe('open');
  });

  describe('AC — a scheduled session or an approval thread is not answered by reply', () => {
    it('(a) s2 scheduled → T-006 stays open', () => {
      const root = tmp('sched-reply');
      const openBefore = hangingSetup(root);
      expect(
        detectAnswered(root, answeredOpts({ sessionId: 's2', sessionKind: 'scheduled', firstUserText: 'state/ please', openBefore })),
      ).toEqual([]);
      expect(threadById(root, 'T-006').status).toBe('open');
    });

    it('(b) T-006 is an approval thread → stays open', () => {
      const root = tmp('approval-reply');
      const openBefore = hangingSetup(root, 'approval');
      expect(detectAnswered(root, answeredOpts({ sessionId: 's2', firstUserText: 'state/ please', openBefore }))).toEqual([]);
      expect(threadById(root, 'T-006').status).toBe('open');
    });
  });
});

describe('AC — threads opened this run are never answered by this run', () => {
  it('a question restated verbatim earlier in the same session stays open when openBefore was captured first', () => {
    const root = tmp('samerun');
    makeCortexProject(root);
    const openBefore = openThreads(root);
    const record = makeSessionRecord({ open_question: { kind: 'question', text: QUESTION, timestamp: ENDED, source: 'transcript' } });
    const opened = openThreadsFromRecord(root, record, NOW);
    expect(opened).toEqual(['T-001']);
    const answered = detectAnswered(
      root,
      answeredOpts({ sessionId: 's1', citation: threadCitation('s1'), messages: [msg('assistant', QUESTION), msg('user', 'hmm'), msg('assistant', QUESTION)], openBefore }),
    );
    expect(answered).toEqual([]);
    expect(threadById(root, 'T-001').status).toBe('open');
  });
});

describe('Rule 10 — only open threads are re-evaluated; terminal states never revert', () => {
  it('a dropped thread whose id is mentioned stays dropped, and detection reports it once at most', () => {
    const root = tmp('terminal');
    makeCortexProject(root);
    writeThread(root, makeThread({ id: 'T-002', status: 'dropped', body: 'x'.repeat(30) }));
    writeThread(root, makeThread({ id: 'T-003', body: 'Keep the counter in state/ then?' }));
    const openBefore = openThreads(root);
    expect(openBefore.map((t) => t.id)).toEqual(['T-003']);
    const answered = detectAnswered(
      root,
      answeredOpts({ messages: [msg('user', 'T-002 and T-003: keep the counter in state/ then?')], openBefore }),
    );
    expect(answered).toEqual(['T-003']);
    expect(threadById(root, 'T-002').status).toBe('dropped');
  });
});

describe('Rule 13 — only pulse is written', () => {
  it('opening and answering touch nothing outside .cortex/pulse/', () => {
    const root = tmp('pulse-only');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, '.cortex', 'compass', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'compass', 'rules', 'R-001.md'), '---\nid: R-001\n---\n');
    fs.writeFileSync(path.join(root, 'RULES.md'), '# rules\n');
    const before = snapshotTree(root);
    writeThread(root, makeThread({ id: 'T-001', body: 'Keep the counter under pulse/state/ for now?' }));
    seedCounter(root, 1);
    const openBefore = openThreads(root);
    openThreadsFromRecord(
      root,
      makeSessionRecord({ session_id: 's2', open_question: { kind: 'question', text: QUESTION, timestamp: ENDED, source: 'transcript' } }),
      NOW,
    );
    detectAnswered(root, answeredOpts({ messages: [msg('user', 'T-001 done')], openBefore }));
    const after = snapshotTree(root);
    const touched = [...after.keys()].filter((k) => before.get(k) !== after.get(k));
    expect(touched.length).toBeGreaterThan(0);
    expect(touched.every((k) => k.startsWith(path.join('.cortex', 'pulse') + path.sep))).toBe(true);
    expect(keyText(threadById(root, 'T-002'))).toBe(QUESTION);
  });
});
