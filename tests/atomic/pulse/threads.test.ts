/**
 * Atomic tests — the threads ledger primitives (`pulse.threads` Rules 1, 2, 5, 7;
 * schema §4.5.3). Covers the file contract (parse/serialise round trip, field
 * order, filename slug), the `T-` id allocator and its separate namespace, the
 * normalised dedupe key, and the mkdir-p / atomic / body-preserving writer.
 * Opening threads from a record, dedupe itself and answered detection are
 * batch-1 spec-layer tests, not here.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { makeThread, threadCitation, threadsDirOf, readThreadRaw } from '../../fixtures/threads.js';
import { SUGGESTION_COUNTER_FILE } from '../../../src/pulse/suggestion-ids.js';
import {
  THREAD_KINDS,
  THREAD_STATUSES,
  THREAD_TTL_DAYS,
  THREADS_DIR,
  THREAD_COUNTER_FILE,
  parseThreadFile,
  serialiseThread,
  threadSlug,
  threadFilename,
  threadExpires,
  listThreads,
  threadPath,
  readThreadCounter,
  allocateThreadIds,
  keyText,
  threadKey,
  approvalBody,
  findingBody,
  artefactBody,
  writeThread,
  updateThreadStatus,
} from '../../../src/pulse/threads.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`threads-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function statePath(root: string, file: string): string {
  return path.join(root, '.cortex', 'pulse', 'state', file);
}

// ---------------------------------------------------------------------------
// Rule 1 — the artefact (criterion: "A thread file has the contract frontmatter and body")
// ---------------------------------------------------------------------------

describe('Rule 1 — thread file contract (§4.5.3)', () => {
  it('exports the fixed enums, TTL and layout constants', () => {
    expect(THREAD_KINDS).toEqual(['question', 'offer', 'approval', 'finding', 'artefact']);
    expect(THREAD_STATUSES).toEqual(['open', 'answered', 'dropped', 'expired']);
    expect(THREAD_TTL_DAYS).toBe(30);
    expect(THREADS_DIR).toBe('pulse/threads');
    expect(THREAD_COUNTER_FILE).toBe('thread-counter');
  });

  it('serialises the frontmatter in the §4.5.3 field order with the body verbatim and a trailing newline', () => {
    const t = makeThread({
      bears_on: [
        '.cortex/compass/rules/R-001-core-no-llm-calls.md',
        '.specflow/specs/pulse/hygiene.spec.md',
      ],
    });
    expect(serialiseThread(t)).toBe(
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
        'Do you want the counter in state/ or at the pulse root?',
        '',
      ].join('\n'),
    );
  });

  it('writes an empty bears_on as an empty list and omits answered/resolved_by while open', () => {
    const raw = serialiseThread(makeThread());
    expect(raw).toContain('\nbears_on: []\n');
    expect(raw).not.toContain('answered:');
    expect(raw).not.toContain('resolved_by:');
  });

  it('places answered and resolved_by after expires on an answered thread', () => {
    const raw = serialiseThread(
      makeThread({
        status: 'answered',
        answered: '2026-09-16T08:00:00.000Z',
        resolved_by: threadCitation('s2'),
      }),
    );
    const lines = raw.split('\n');
    const at = (key: string): number => lines.findIndex((l) => l.startsWith(`${key}:`));
    expect(at('expires')).toBeGreaterThan(at('bears_on'));
    expect(at('answered')).toBe(at('expires') + 1);
    expect(at('resolved_by')).toBe(at('answered') + 1);
    expect(lines[at('resolved_by')]).toBe(`resolved_by: ${threadCitation('s2')}`);
  });

  it('round-trips serialise → parse as identity for every kind and a multi-line body', () => {
    const cases = [
      makeThread(),
      makeThread({ id: 'T-002', kind: 'offer', body: 'I can move it for you.\n\nSay the word.' }),
      makeThread({
        id: 'T-003',
        kind: 'approval',
        body: approvalBody('Put the counter in state/.', 'yes, do that'),
        bears_on: ['pulse.usage'],
      }),
      makeThread({
        id: 'T-004',
        kind: 'finding',
        body: findingBody('2 insight invocations over 55 sessions', 'measurement', 'tag'),
        sessions: [threadCitation('s1'), threadCitation('s2')],
      }),
      makeThread({
        id: 'T-005',
        kind: 'artefact',
        status: 'answered',
        answered: '2026-09-16T08:00:00.000Z',
        resolved_by: '.cortex/atlas/decisions/2026-09-16-x.md',
        body: artefactBody('/tmp/scratchpad/notes.md', 'Notes: a heading', '.cortex/pulse/scratch/s1/notes.md'),
      }),
    ];
    for (const t of cases) {
      expect(parseThreadFile(serialiseThread(t))).toEqual(t);
    }
  });

  it('parses the schema example verbatim and coerces the timestamps to iso strings', () => {
    const raw = [
      '---',
      'id: T-004',
      'kind: question',
      'status: open',
      'opened: 2026-09-15T10:12:04.000Z',
      'session: claude-sessions/pedropacheco1/9a121da9-c7a7-403c-bb80-1cb82cb1cf6f',
      'sessions:',
      '  - claude-sessions/pedropacheco1/9a121da9-c7a7-403c-bb80-1cb82cb1cf6f',
      'bears_on:',
      '  - .cortex/compass/rules/R-001-core-no-llm-calls.md',
      '  - .specflow/specs/pulse/hygiene.spec.md',
      'expires: 2026-10-15T10:12:04.000Z',
      '---',
      '',
      'Do you want the counter in state/ or at the pulse root?',
      '',
    ].join('\n');
    const t = parseThreadFile(raw);
    expect(t).not.toBeNull();
    expect(t?.id).toBe('T-004');
    expect(typeof t?.opened).toBe('string');
    expect(t?.opened).toBe('2026-09-15T10:12:04.000Z');
    expect(t?.expires).toBe('2026-10-15T10:12:04.000Z');
    expect(t?.bears_on).toEqual([
      '.cortex/compass/rules/R-001-core-no-llm-calls.md',
      '.specflow/specs/pulse/hygiene.spec.md',
    ]);
    expect(t?.body).toBe('Do you want the counter in state/ or at the pulse root?');
    expect(serialiseThread(t as NonNullable<typeof t>)).toBe(raw);
  });

  it('returns null, never throws, on every shape failure', () => {
    const good = serialiseThread(makeThread());
    expect(parseThreadFile('no frontmatter at all\n')).toBeNull();
    expect(parseThreadFile('---\nid: [\n---\nbody\n')).toBeNull(); // YAML parse error
    expect(parseThreadFile(good.replace('kind: question', 'kind: rumour'))).toBeNull();
    expect(parseThreadFile(good.replace('status: open', 'status: maybe'))).toBeNull();
    expect(parseThreadFile(good.replace('id: T-001', 'id: S-001'))).toBeNull();
    expect(parseThreadFile(good.replace('expires: 2026-10-15T10:00:00.000Z\n', ''))).toBeNull();
    expect(parseThreadFile(good.replace('opened: 2026-09-15T10:00:00.000Z', 'opened: yesterday'))).toBeNull();
    expect(parseThreadFile(good.replace('bears_on: []', 'bears_on: pulse.usage'))).toBeNull();
    expect(parseThreadFile(good.replace('sessions:\n  - claude', 'sessions:\n  - 7\n  - claude'))).toBeNull();
  });

  it('accepts ids past three digits', () => {
    const t = parseThreadFile(serialiseThread(makeThread({ id: 'T-1000' })));
    expect(t?.id).toBe('T-1000');
  });
});

// ---------------------------------------------------------------------------
// Rule 5 — the slug and filename
// ---------------------------------------------------------------------------

describe('Rule 5 — slug mirrors decisionSlug with fallback `thread`', () => {
  it('lowercases, collapses non-alphanumerics to `-`, trims, caps at 60', () => {
    expect(threadSlug('Do you want the counter in state/ or at the pulse root?')).toBe(
      'do-you-want-the-counter-in-state-or-at-the-pulse-root',
    );
    expect(threadSlug('  --Ship   the CLI!!  ')).toBe('ship-the-cli');
    const long = threadSlug('a'.repeat(70));
    expect(long).toHaveLength(60);
    expect(threadSlug(`${'b'.repeat(59)}-${'c'.repeat(10)}`)).toBe('b'.repeat(59));
  });

  it('falls back to `thread` when nothing survives', () => {
    expect(threadSlug('')).toBe('thread');
    expect(threadSlug('!!! ???')).toBe('thread');
  });

  it('names the file `<id>-<slug>.md` from the key text', () => {
    expect(threadFilename(makeThread())).toBe(
      'T-001-do-you-want-the-counter-in-state-or-at-the-pulse-root.md',
    );
    expect(threadFilename(makeThread({ id: 'T-009', body: '???' }))).toBe('T-009-thread.md');
  });

  it('computes expires as opened + THREAD_TTL_DAYS', () => {
    expect(threadExpires('2026-09-15T10:00:00.000Z')).toBe('2026-10-15T10:00:00.000Z');
    expect(threadExpires(new Date('2026-12-20T00:00:00Z'))).toBe('2027-01-19T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — the T-id allocator (criterion: "Ids come from their own counter and never collide with S-ids")
// ---------------------------------------------------------------------------

describe('Rule 2 — T-ids come from their own counter', () => {
  it('allocates T-001..T-003 next to an untouched suggestion-counter of 41', () => {
    const root = tmp('namespace');
    fs.mkdirSync(statePath(root, ''), { recursive: true });
    fs.writeFileSync(statePath(root, SUGGESTION_COUNTER_FILE), '41\n', 'utf-8');
    expect(fs.existsSync(statePath(root, THREAD_COUNTER_FILE))).toBe(false);

    expect(allocateThreadIds(root, 3)).toEqual(['T-001', 'T-002', 'T-003']);

    expect(fs.readFileSync(statePath(root, THREAD_COUNTER_FILE), 'utf-8').trim()).toBe('3');
    expect(fs.readFileSync(statePath(root, SUGGESTION_COUNTER_FILE), 'utf-8').trim()).toBe('41');
    expect(readThreadCounter(root)).toBe(3);
  });

  it('a missing counter reads 0; malformed degrades to 0; n <= 0 writes nothing', () => {
    const root = tmp('degrade');
    expect(readThreadCounter(root)).toBe(0);
    expect(allocateThreadIds(root, 0)).toEqual([]);
    expect(allocateThreadIds(root, -2)).toEqual([]);
    expect(fs.existsSync(statePath(root, THREAD_COUNTER_FILE))).toBe(false);
    fs.mkdirSync(statePath(root, ''), { recursive: true });
    fs.writeFileSync(statePath(root, THREAD_COUNTER_FILE), 'nope', 'utf-8');
    expect(readThreadCounter(root)).toBe(0);
    expect(allocateThreadIds(root, 1)).toEqual(['T-001']);
  });

  it('is monotonic across allocations and grows past 999 unpadded', () => {
    const root = tmp('monotonic');
    expect(allocateThreadIds(root, 2)).toEqual(['T-001', 'T-002']);
    expect(allocateThreadIds(root, 1)).toEqual(['T-003']);
    fs.writeFileSync(statePath(root, THREAD_COUNTER_FILE), '999', 'utf-8');
    expect(allocateThreadIds(root, 2)).toEqual(['T-1000', 'T-1001']);
    expect(readThreadCounter(root)).toBe(1001);
  });
});

// ---------------------------------------------------------------------------
// Rule 7 — the normalised key (the key half of "Same question twice opens one thread")
// ---------------------------------------------------------------------------

describe('Rule 7 — the dedupe key is normaliseText of the kind-specific text', () => {
  it('question/offer: the paragraph, lowercased with whitespace collapsed', () => {
    const a = makeThread({ body: 'Do you want the counter in state/ or at the pulse root?' });
    const b = makeThread({
      id: 'T-002',
      kind: 'offer',
      body: '  DO you   want the counter\nin state/ or at the pulse root?  ',
    });
    expect(threadKey(a)).toBe('do you want the counter in state/ or at the pulse root?');
    expect(threadKey(b)).toBe(threadKey(a));
    expect(keyText(a)).toBe(a.body);
  });

  it('approval: the *approved* text, not the approval line', () => {
    const t = makeThread({ kind: 'approval', body: approvalBody('Move the Counter to state/', 'Yes go ahead') });
    expect(keyText(t)).toBe('Move the Counter to state/');
    expect(threadKey(t)).toBe('move the counter to state/');
  });

  it('finding: the finding text without its Kind/Source lines', () => {
    const t = makeThread({
      kind: 'finding',
      body: findingBody('2 insight invocations  over 55 sessions', 'measurement', 'lexicon'),
    });
    expect(keyText(t)).toBe('2 insight invocations  over 55 sessions');
    expect(threadKey(t)).toBe('2 insight invocations over 55 sessions');
  });

  it('artefact: the original path', () => {
    const t = makeThread({
      kind: 'artefact',
      body: artefactBody('/tmp/Scratchpad/Plan.md', null, '.cortex/pulse/scratch/s1/Plan.md'),
    });
    expect(keyText(t)).toBe('/tmp/Scratchpad/Plan.md');
    expect(threadKey(t)).toBe('/tmp/scratchpad/plan.md');
    expect(t.body).toBe(
      '**Path:** /tmp/Scratchpad/Plan.md\n**Heading:** -\n**Copy:** .cortex/pulse/scratch/s1/Plan.md',
    );
  });
});

// ---------------------------------------------------------------------------
// The writer, the lister, and the frontmatter-only update
// ---------------------------------------------------------------------------

describe('writeThread / listThreads / updateThreadStatus', () => {
  it('writeThread creates pulse/threads on demand, writes atomically and returns the path', () => {
    const root = tmp('write');
    expect(fs.existsSync(threadsDirOf(root))).toBe(false);
    const t = makeThread();
    const abs = writeThread(root, t);
    expect(abs).toBe(path.join(threadsDirOf(root), threadFilename(t)));
    expect(fs.readdirSync(threadsDirOf(root))).toEqual([threadFilename(t)]); // no tmp file left behind
    expect(fs.readFileSync(abs, 'utf-8')).toBe(serialiseThread(t));
    expect(threadPath(root, 'T-001')).toBe(abs);
    expect(threadPath(root, 'T-002')).toBeNull();
  });

  it('writeThread rewrites an existing thread in place, keeping its filename', () => {
    const root = tmp('rewrite');
    writeThread(root, makeThread());
    const changed = makeThread({ body: 'A different question that would slug differently?' });
    const abs = writeThread(root, changed);
    expect(path.basename(abs)).toBe(threadFilename(makeThread()));
    expect(fs.readdirSync(threadsDirOf(root))).toHaveLength(1);
    expect(parseThreadFile(fs.readFileSync(abs, 'utf-8'))?.body).toBe(changed.body);
  });

  it('listThreads sorts numerically by id, skips and counts unparseable files, tolerates no directory', () => {
    const root = tmp('list');
    expect(listThreads(root)).toEqual({ threads: [], skipped: 0 });
    writeThread(root, makeThread({ id: 'T-010', body: 'ten' }));
    writeThread(root, makeThread({ id: 'T-002', body: 'two' }));
    writeThread(root, makeThread({ id: 'T-001', body: 'one' }));
    fs.writeFileSync(path.join(threadsDirOf(root), 'T-003-bad.md'), '---\nid: T-003\nkind: rumour\n---\nx\n');
    fs.writeFileSync(path.join(threadsDirOf(root), 'notes.txt'), 'not a thread');
    const { threads, skipped } = listThreads(root);
    expect(threads.map((t) => t.id)).toEqual(['T-001', 'T-002', 'T-010']);
    expect(skipped).toBe(1);
  });

  it('updateThreadStatus rewrites only frontmatter and leaves the body byte-identical', () => {
    const root = tmp('update');
    const body = 'Line one: with a colon\n\n  indented **bold** line\n---\nnot frontmatter';
    const t = makeThread({ body });
    writeThread(root, t);
    const before = readThreadRaw(root, 'T-001') as string;

    const updated = updateThreadStatus(root, 'T-001', {
      status: 'answered',
      answered: '2026-09-16T08:00:00.000Z',
      resolved_by: threadCitation('s2'),
      sessions: [threadCitation('s1'), threadCitation('s2')],
    });

    expect(updated).toEqual({
      ...t,
      status: 'answered',
      answered: '2026-09-16T08:00:00.000Z',
      resolved_by: threadCitation('s2'),
      sessions: [threadCitation('s1'), threadCitation('s2')],
    });
    const after = readThreadRaw(root, 'T-001') as string;
    const bodyOf = (raw: string): string => raw.slice(raw.indexOf('\n---\n') + '\n---\n'.length);
    expect(bodyOf(after)).toBe(bodyOf(before));
    expect(after).toContain('\nstatus: answered\n');
    expect(after).toContain(`\nresolved_by: ${threadCitation('s2')}\n`);
    expect(fs.readdirSync(threadsDirOf(root))).toHaveLength(1);
  });

  it('updateThreadStatus returns null and writes nothing for an unknown id', () => {
    const root = tmp('unknown');
    writeThread(root, makeThread());
    const before = readThreadRaw(root, 'T-001');
    expect(updateThreadStatus(root, 'T-999', { status: 'dropped' })).toBeNull();
    expect(readThreadRaw(root, 'T-001')).toBe(before);
  });
});
