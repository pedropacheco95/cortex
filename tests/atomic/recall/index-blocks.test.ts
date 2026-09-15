/**
 * Atomic tests — `recall.index-blocks` Rules 1–5 and 8: the generated block
 * in `atlas/decisions/_index.md` and `atlas/evidence/_index.md`, rendered
 * from a hand-built `RecallIndex` literal (never from frontmatter). Every
 * project is a tmp root carrying the shipped templates; the real `.cortex/`
 * is never touched.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  RECALL_BLOCK_START,
  RECALL_BLOCK_END,
  RECALL_BLOCK_HEADING,
  stripRecallBlock,
  renderRecallBlock,
  writeRecallIndexBlocks,
} from '../../../src/recall/index-blocks.js';
import { CORTEX_INDEXES, SCHEMA_VERSION } from '../../../src/cli/templates.js';
import { checkIndexShape } from '../../../src/schema/checks/layout.js';
import type { RecallIndex } from '../../../src/recall/index.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/hooks-harness.js';
import { recallEntry, recallIndexFixture, recallSubject } from '../../fixtures/recall-query.js';

const DECISIONS_TEMPLATE = CORTEX_INDEXES['atlas/decisions'] as string;
const EVIDENCE_TEMPLATE = CORTEX_INDEXES['atlas/evidence'] as string;
const START = RECALL_BLOCK_START(SCHEMA_VERSION);

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** A tmp root with both atlas indexes at their shipped template bytes. */
function project(label: string, opts: { decisions?: string | null; evidence?: string | null } = {}): string {
  const root = makeTmpDir(`recall-blocks-${label}`);
  dirs.push(root);
  const decisions = opts.decisions === undefined ? DECISIONS_TEMPLATE : opts.decisions;
  const evidence = opts.evidence === undefined ? EVIDENCE_TEMPLATE : opts.evidence;
  if (decisions !== null) write(root, '.cortex/atlas/decisions/_index.md', decisions);
  if (evidence !== null) write(root, '.cortex/atlas/evidence/_index.md', evidence);
  return root;
}

function write(root: string, rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf-8');
}

function read(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8');
}

const DECISIONS_REL = '.cortex/atlas/decisions/_index.md';
const EVIDENCE_REL = '.cortex/atlas/evidence/_index.md';

/** The AC's two decisions: `a` bears on R-001 and schema:§5; `b` on five subjects. */
function twoDecisions(): RecallIndex {
  return recallIndexFixture(
    {
      'R-001': recallSubject({ decided: ['decision.2026-07-07-a'] }),
      'R-003': recallSubject({ decided: ['decision.2026-08-05-b'] }),
      'schema:§5': recallSubject({ decided: ['decision.2026-07-07-a', 'decision.2026-08-05-b'] }),
      'pulse.usage': recallSubject({ decided: ['decision.2026-08-05-b'] }),
      'src/x.ts': recallSubject({ decided: ['decision.2026-08-05-b'] }),
      'src/y.ts': recallSubject({ decided: ['decision.2026-08-05-b'] }),
    },
    {
      'decision.2026-07-07-a': recallEntry('decision', 'Five-module architecture', '.cortex/atlas/decisions/2026-07-07-a.md', '2026-07-07'),
      'decision.2026-08-05-b': recallEntry('decision', 'Pull-only stance reversed', '.cortex/atlas/decisions/2026-08-05-b.md', '2026-08-05'),
    },
  );
}

/** `n` decisions with fifteen-word titles, one per day counting back from 2026-09-15. */
function manyDecisions(n: number): RecallIndex {
  const subjects: Record<string, ReturnType<typeof recallSubject>> = {};
  const entries: Record<string, ReturnType<typeof recallEntry>> = {};
  const title = Array.from({ length: 15 }, (_, i) => `word${i + 1}`).join(' ');
  for (let i = 0; i < n; i++) {
    const day = new Date(Date.UTC(2026, 8, 15) - i * 86_400_000).toISOString().slice(0, 10);
    const id = `decision.${day}-d${String(i).padStart(2, '0')}`;
    entries[id] = recallEntry('decision', title, `.cortex/atlas/decisions/${day}-d${i}.md`, day);
    subjects[`R-${String(i + 1).padStart(3, '0')}`] = recallSubject({ decided: [id] });
  }
  return recallIndexFixture(subjects, entries);
}

function blockOf(content: string): string {
  const start = content.indexOf(START);
  const end = content.indexOf(RECALL_BLOCK_END);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return content.slice(start, end + RECALL_BLOCK_END.length);
}

/** The validator's own estimator (`src/schema/checks/layout.ts`). */
function estimate(content: string): number {
  return content.split(/\s+/).length * 1.3;
}

// ---------------------------------------------------------------------------
// AC: The block lists entries newest first with their subjects (Rules 1, 2)
// ---------------------------------------------------------------------------
describe('AC: the block lists entries newest first with their subjects', () => {
  it('appends a block after the template with the newest entry first and at most four subjects', () => {
    const root = project('ac1');
    const result = writeRecallIndexBlocks(root, twoDecisions());
    expect(result.written).toEqual(['atlas/decisions']);
    const content = read(root, DECISIONS_REL);
    const start = content.indexOf(START);
    // Rule 1 — the text above the start marker is the template plus one blank line.
    expect(content.slice(0, start)).toBe(DECISIONS_TEMPLATE + '\n');
    const lines = blockOf(content).split('\n');
    expect(lines[0]).toBe(START);
    expect(lines[1]).toBe(RECALL_BLOCK_HEADING);
    expect(lines[2]).toBe(
      '- 2026-08-05 decision.2026-08-05-b — Pull-only stance reversed · bears on: R-003, pulse.usage, schema:§5, src/x.ts (+1)',
    );
    expect(lines[3]).toBe('- 2026-07-07 decision.2026-07-07-a — Five-module architecture · bears on: R-001, schema:§5');
    expect(lines[4]).toBe(RECALL_BLOCK_END);
    expect(lines).toHaveLength(5);
    expect(content.endsWith(RECALL_BLOCK_END + '\n')).toBe(true);
  });

  it('the evidence block is rendered from the subjects\' evidence lists and never lists a decision', () => {
    const root = project('ac1-evidence');
    const index = recallIndexFixture(
      {
        'pulse.usage': recallSubject({ evidence: ['evidence.2026-09-15-usage'], decided: ['decision.2026-08-05-b'] }),
        'schema:§5': recallSubject({ evidence: ['evidence.2026-09-15-usage'] }),
      },
      {
        'evidence.2026-09-15-usage': recallEntry('evidence', 'Cortex usage over 41 sessions', '.cortex/atlas/evidence/2026-09-15-usage.md', '2026-09-15T15:58:00Z'),
        'decision.2026-08-05-b': recallEntry('decision', 'Pull-only stance reversed', '.cortex/atlas/decisions/2026-08-05-b.md', '2026-08-05'),
      },
    );
    const result = writeRecallIndexBlocks(root, index);
    expect(result.written.sort()).toEqual(['atlas/decisions', 'atlas/evidence']);
    const lines = blockOf(read(root, EVIDENCE_REL)).split('\n');
    expect(lines[2]).toBe('- 2026-09-15 evidence.2026-09-15-usage — Cortex usage over 41 sessions · bears on: pulse.usage, schema:§5');
    expect(lines).toHaveLength(4);
    expect(read(root, EVIDENCE_REL)).not.toContain('decision.2026-08-05-b');
  });

  it('an entry in no subject list renders "bears on: —"; a date tie sorts by id ascending; titles are never cut', () => {
    const longTitle = Array.from({ length: 30 }, (_, i) => `token${i}`).join(' ');
    const index = recallIndexFixture(
      { 'R-001': recallSubject({ decided: ['decision.2026-07-07-b'] }) },
      {
        'decision.2026-07-07-b': recallEntry('decision', 'Second by id', '.cortex/atlas/decisions/2026-07-07-b.md', '2026-07-07'),
        'decision.2026-07-07-a': recallEntry('decision', longTitle, '.cortex/atlas/decisions/2026-07-07-a.md', '2026-07-07'),
      },
    );
    const block = renderRecallBlock('decision', index, DECISIONS_TEMPLATE);
    expect(block).not.toBeNull();
    const lines = (block as string).split('\n');
    expect(lines[2]).toBe(`- 2026-07-07 decision.2026-07-07-a — ${longTitle} · bears on: —`);
    expect(lines[3]).toBe('- 2026-07-07 decision.2026-07-07-b — Second by id · bears on: R-001');
  });
});

// ---------------------------------------------------------------------------
// AC: Hand-written text outside the markers survives (Rules 1, 5)
// ---------------------------------------------------------------------------
describe('AC: hand-written text outside the markers survives', () => {
  it('a hand-edited index with a block keeps every outside byte and gets the block replaced in place', () => {
    const edited = DECISIONS_TEMPLATE.replace('**Read this when:** you need', '**Read this when:** you (locally edited) need');
    expect(edited).not.toBe(DECISIONS_TEMPLATE);
    const root = project('survive', { decisions: edited });
    writeRecallIndexBlocks(root, twoDecisions());
    const first = read(root, DECISIONS_REL);
    expect(first.startsWith(edited + '\n' + START)).toBe(true);

    const changed = twoDecisions();
    changed.entries['decision.2026-09-01-c'] = recallEntry('decision', 'A third one', '.cortex/atlas/decisions/2026-09-01-c.md', '2026-09-01');
    changed.subjects['R-009'] = recallSubject({ decided: ['decision.2026-09-01-c'] });
    const result = writeRecallIndexBlocks(root, changed);
    expect(result.written).toEqual(['atlas/decisions']);
    const second = read(root, DECISIONS_REL);
    expect(stripRecallBlock(second)).toBe(edited);
    expect(second.split(START)).toHaveLength(2);
    expect(second.split(RECALL_BLOCK_END)).toHaveLength(2);
    const lines = blockOf(second).split('\n');
    expect(lines[2]).toBe('- 2026-09-01 decision.2026-09-01-c — A third one · bears on: R-009');
    expect(lines).toHaveLength(6);
  });

  it('an older marker version is rewritten to the package SCHEMA_VERSION (Rule 5)', () => {
    const stale = DECISIONS_TEMPLATE + '\n' + RECALL_BLOCK_START('3.3') + '\n' + RECALL_BLOCK_HEADING + '\n- 2026-01-01 decision.old — Old · bears on: —\n' + RECALL_BLOCK_END + '\n';
    const root = project('version', { decisions: stale });
    writeRecallIndexBlocks(root, twoDecisions());
    const content = read(root, DECISIONS_REL);
    expect(content).not.toContain('cortex:recall:start v3.3');
    expect(content).toContain(START);
    expect(content).not.toContain('decision.old');
  });

  it('stripRecallBlock removes the block and its preceding blank line, and is the identity without markers', () => {
    const block = renderRecallBlock('decision', twoDecisions(), DECISIONS_TEMPLATE) as string;
    expect(stripRecallBlock(DECISIONS_TEMPLATE + '\n' + block + '\n')).toBe(DECISIONS_TEMPLATE);
    expect(stripRecallBlock(DECISIONS_TEMPLATE)).toBe(DECISIONS_TEMPLATE);
    const custom = '# custom\n\nsome text\n';
    expect(stripRecallBlock(custom)).toBe(custom);
  });
});

// ---------------------------------------------------------------------------
// AC: Over budget collapses to a count line and validates clean (Rule 3)
// ---------------------------------------------------------------------------
describe('AC: over budget collapses to a count line and validates clean', () => {
  it('forty 15-word decisions keep the newest prefix, end with the collapse line, and raise no check.index-shape warning', () => {
    const root = project('budget');
    writeRecallIndexBlocks(root, manyDecisions(40));
    const content = read(root, DECISIONS_REL);
    const lines = blockOf(content).split('\n');
    const last = lines[lines.length - 2] as string;
    const m = /^- … and (\d+) more \(`cortex recall --kind decision`\)$/.exec(last);
    expect(m).not.toBeNull();
    const n = Number((m as RegExpExecArray)[1]);
    expect(n).toBeGreaterThan(0);
    const kept = lines.slice(2, -2);
    expect(kept.length + n).toBe(40);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept[0]).toMatch(/^- 2026-09-15 decision\.2026-09-15-d00 — /);
    for (let i = 1; i < kept.length; i++) {
      expect((kept[i - 1] as string).slice(2, 12) >= (kept[i] as string).slice(2, 12)).toBe(true);
    }
    expect(estimate(content)).toBeLessThanOrEqual(300);
    // Adding one more kept line would have gone over — the prefix is the longest that fits.
    const oneMore = content.replace(last, `- 2026-08-01 decision.2026-08-01-x — ${'w '.repeat(15).trim()} · bears on: R-099\n${last}`);
    expect(estimate(oneMore)).toBeGreaterThan(300);
    const shape = checkIndexShape(root).filter((v) => v.location?.path === path.join(root, DECISIONS_REL));
    expect(shape).toEqual([]);
  });

  it('when the hand-written text leaves no room for an entry line, the block is the heading and the collapse line', () => {
    const fat = DECISIONS_TEMPLATE + '\n' + Array.from({ length: 150 }, (_, i) => `filler${i}`).join(' ') + '\n';
    const root = project('fat', { decisions: fat });
    writeRecallIndexBlocks(root, manyDecisions(40));
    const lines = blockOf(read(root, DECISIONS_REL)).split('\n');
    expect(lines).toEqual([START, RECALL_BLOCK_HEADING, '- … and 40 more (`cortex recall --kind decision`)', RECALL_BLOCK_END]);
  });

  it('the evidence collapse line names --kind evidence', () => {
    const many = manyDecisions(40);
    for (const e of Object.values(many.entries)) e.kind = 'evidence';
    for (const s of Object.values(many.subjects)) {
      s.evidence = s.decided;
      s.decided = [];
    }
    const block = renderRecallBlock('evidence', many, EVIDENCE_TEMPLATE) as string;
    expect(block).toMatch(/\n- … and \d+ more \(`cortex recall --kind evidence`\)\n<!-- cortex:recall:end -->$/);
  });
});

// ---------------------------------------------------------------------------
// AC: No entries, no block (Rule 4)
// ---------------------------------------------------------------------------
describe('AC: no entries, no block', () => {
  it('an existing evidence block is removed when the index has no evidence entry; the file equals the template', () => {
    const root = project('empty');
    const withEvidence = recallIndexFixture(
      { 'pulse.usage': recallSubject({ evidence: ['evidence.2026-09-15-usage'] }) },
      { 'evidence.2026-09-15-usage': recallEntry('evidence', 'Usage', '.cortex/atlas/evidence/2026-09-15-usage.md', '2026-09-15') },
    );
    writeRecallIndexBlocks(root, withEvidence);
    expect(read(root, EVIDENCE_REL)).toContain(START);
    const result = writeRecallIndexBlocks(root, twoDecisions());
    expect(result.written).toContain('atlas/evidence');
    expect(read(root, EVIDENCE_REL)).toBe(EVIDENCE_TEMPLATE);
  });

  it('renderRecallBlock is null for a kind with no entries', () => {
    expect(renderRecallBlock('evidence', twoDecisions(), EVIDENCE_TEMPLATE)).toBeNull();
    expect(renderRecallBlock('decision', recallIndexFixture({}, {}), DECISIONS_TEMPLATE)).toBeNull();
  });

  it('a fresh project (empty index) leaves both templates byte-identical and reports them unchanged', () => {
    const root = project('fresh');
    const result = writeRecallIndexBlocks(root, recallIndexFixture({}, {}));
    expect(result.written).toEqual([]);
    expect(result.unchanged.sort()).toEqual(['atlas/decisions', 'atlas/evidence']);
    expect(read(root, DECISIONS_REL)).toBe(DECISIONS_TEMPLATE);
    expect(read(root, EVIDENCE_REL)).toBe(EVIDENCE_TEMPLATE);
  });

  it('a missing _index.md or a missing directory is skipped: nothing written, nothing created, no throw', () => {
    const root = project('missing', { decisions: null, evidence: null });
    fs.mkdirSync(path.join(root, '.cortex', 'atlas', 'decisions'), { recursive: true });
    const result = writeRecallIndexBlocks(root, twoDecisions());
    expect(result.skipped.sort()).toEqual(['atlas/decisions', 'atlas/evidence']);
    expect(result.written).toEqual([]);
    expect(fs.existsSync(path.join(root, DECISIONS_REL))).toBe(false);
    expect(fs.existsSync(path.join(root, '.cortex', 'atlas', 'evidence'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC: A rerun writes nothing (Rule 5)
// ---------------------------------------------------------------------------
describe('AC: a rerun writes nothing', () => {
  it('a second run over the same index leaves both mtimes untouched and reports both files unchanged', () => {
    const root = project('rerun');
    const index = recallIndexFixture(
      {
        'R-001': recallSubject({ decided: ['decision.2026-07-07-a'], evidence: ['evidence.2026-09-15-usage'] }),
      },
      {
        'decision.2026-07-07-a': recallEntry('decision', 'Five-module architecture', '.cortex/atlas/decisions/2026-07-07-a.md', '2026-07-07'),
        'evidence.2026-09-15-usage': recallEntry('evidence', 'Usage', '.cortex/atlas/evidence/2026-09-15-usage.md', '2026-09-15'),
      },
    );
    const first = writeRecallIndexBlocks(root, index);
    expect(first.written.sort()).toEqual(['atlas/decisions', 'atlas/evidence']);
    const past = new Date('2020-01-01T00:00:00Z');
    for (const rel of [DECISIONS_REL, EVIDENCE_REL]) fs.utimesSync(path.join(root, rel), past, past);
    const before = [DECISIONS_REL, EVIDENCE_REL].map((rel) => fs.statSync(path.join(root, rel)).mtimeMs);

    const second = writeRecallIndexBlocks(root, index);
    expect(second.written).toEqual([]);
    expect(second.unchanged.sort()).toEqual(['atlas/decisions', 'atlas/evidence']);
    const after = [DECISIONS_REL, EVIDENCE_REL].map((rel) => fs.statSync(path.join(root, rel)).mtimeMs);
    expect(after).toEqual(before);
  });

  it('two renders over identical input are byte-identical (Rule 8 determinism)', () => {
    const a = renderRecallBlock('decision', manyDecisions(40), DECISIONS_TEMPLATE);
    const b = renderRecallBlock('decision', manyDecisions(40), DECISIONS_TEMPLATE);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
});
