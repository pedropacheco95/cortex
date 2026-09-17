/**
 * Atomic tests — `hooks.session-end` internals: the two-pass bounded transcript
 * read (Rule 5), the pinned lexicons and the three text extractors (Rule 7),
 * and the scratchpad artefact copy (Rule 8). The hook's `run` end to end, the
 * record and the thread step are spec-layer tests (tests/spec/hooks/session-end.test.ts).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  SESSION_END_LINE_BYTES,
  SESSION_END_TAIL_BYTES,
  SESSION_END_MAX_BYTES,
  PREFIX_TRIGGERS,
  OFFER_RE,
  APPROVAL_RE,
  MEASUREMENT_RE,
  STATUS_LADDER_RE,
  FINDING_TAG_RE,
  readTranscript,
  lastParagraph,
  cap,
  extractOpenQuestion,
  extractApprovals,
  extractFindings,
  collectArtefacts,
  isHarnessInjected,
  humanMessages,
  HARNESS_MARKERS,
} from '../../../src/hooks/session-end.js';
import type { ExtractedMessage, ExtractedToolUse } from '../../../src/sessions/read.js';
import { extractMessages, extractToolUses } from '../../../src/sessions/read.js';
import { makeTmpDir, cleanTmp, makeCortexProject } from '../../fixtures/hooks-harness.js';
import { customTitleEntry, skillBaseDirUserTurn } from '../../fixtures/sessions.js';
import {
  turnAt,
  fileToolTurnAt,
  writeTranscriptFile,
  writeLargeTranscript,
  writeSparseTranscript,
  scratchDirOf,
} from '../../fixtures/session-end-harness.js';

const T0 = '2026-09-15T10:00:00.000Z';
const T1 = '2026-09-15T10:00:01.000Z';
const T2 = '2026-09-15T10:00:02.000Z';
const T3 = '2026-09-15T10:00:03.000Z';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`session-end-atomic-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function msg(role: 'user' | 'assistant', text: string, timestamp?: string): ExtractedMessage {
  return timestamp === undefined ? { role, text } : { role, text, timestamp };
}

const QUESTION = 'Two options remain. Do you want the counter in state/ or at the pulse root?';
const FINDING_TAG =
  '<cortex:finding kind="measurement" bears_on="src/pulse/usage.ts, pulse.usage">2 insight invocations over 55 sessions</cortex:finding>';

// ---------------------------------------------------------------------------
// Rule 5 — constants and the two-pass bounded read
// ---------------------------------------------------------------------------

describe('Rule 5 — engineering-call constants and prefix triggers', () => {
  it('pins the three byte caps and the trigger substrings', () => {
    expect(SESSION_END_LINE_BYTES).toBe(256 * 1024);
    expect(SESSION_END_TAIL_BYTES).toBe(2 * 1024 * 1024);
    expect(SESSION_END_MAX_BYTES).toBe(64 * 1024 * 1024);
    expect(PREFIX_TRIGGERS).toEqual(['"custom-title"', '"tool_use"', '<cortex:finding']);
  });
});

describe('AC — message extraction is capped at the tail, prefix scans cover the whole file', () => {
  it('a 5 MiB transcript: tail holds the question, prefix holds title/tool_use/finding/first user/open ids, partial is true', async () => {
    const dir = tmp('5mib');
    const { path: p, size } = writeLargeTranscript(dir, {
      head: [
        customTitleEntry('Recall step 1'),
        skillBaseDirUserTurn(),
        turnAt('assistant', `Measured it: ${FINDING_TAG}`, T0),
        fileToolTurnAt('Write', '/tmp/x/scratchpad/notes.md', T0),
        turnAt('assistant', 'Proposal: allocate T-ids from a separate counter file.', T1),
        turnAt('user', 'approved, go ahead', T1),
        turnAt('user', 'T-007 is settled, keep the counter in state/', T2),
      ],
      tail: [turnAt('assistant', QUESTION, T3)],
      targetBytes: 5 * 1024 * 1024,
    });
    expect(size).toBeGreaterThan(SESSION_END_TAIL_BYTES);

    const read = await readTranscript(p, ['T-007']);
    expect(read.partial).toBe(true);

    const tailMessages = extractMessages(read.tailEntries);
    expect(tailMessages).toEqual([msg('assistant', QUESTION, T3)]);
    expect(tailMessages.some((m) => APPROVAL_RE.test(m.text))).toBe(false);

    expect(read.firstUserEntry).not.toBeNull();
    expect(extractMessages([read.firstUserEntry!])[0]?.text).toMatch(/^Base directory for this skill:/);

    const prefixTypes = read.prefixEntries.map((e) => e.type);
    expect(prefixTypes).toContain('custom-title');
    expect(extractToolUses(read.prefixEntries).map((u) => u.filePath)).toEqual(['/tmp/x/scratchpad/notes.md']);
    const prefixMessages = extractMessages(read.prefixEntries);
    expect(prefixMessages.some((m) => m.text.includes(FINDING_TAG))).toBe(true);
    expect(prefixMessages.some((m) => m.text.startsWith('T-007 is settled'))).toBe(true);
    // Lines carrying no trigger are never parsed: the approval pair stays out of the prefix pass.
    expect(prefixMessages.some((m) => m.text === 'approved, go ahead')).toBe(false);
    expect(read.prefixEntries.some((e) => e.type === 'progress')).toBe(false);
  });

  it('a small transcript: partial is false and both passes see everything they are meant to', async () => {
    const dir = tmp('small');
    const p = writeTranscriptFile(dir, [
      customTitleEntry('Small'),
      turnAt('user', 'hello', T0),
      turnAt('assistant', QUESTION, T1),
    ]);
    const read = await readTranscript(p, []);
    expect(read.partial).toBe(false);
    expect(extractMessages(read.tailEntries)).toEqual([msg('user', 'hello', T0), msg('assistant', QUESTION, T1)]);
    expect(read.prefixEntries.map((e) => e.type)).toEqual(['custom-title']);
    expect(extractMessages([read.firstUserEntry!])[0]?.text).toBe('hello');
  });
});

describe('AC — a transcript over the hard cap still yields a tail record', () => {
  it('a 70 MiB (sparse) transcript: the tail is read, the prefix pass is skipped, partial is true', async () => {
    const dir = tmp('70mib');
    const p = writeSparseTranscript(dir, {
      head: [customTitleEntry('Huge'), turnAt('assistant', `Head: ${FINDING_TAG}`, T0)],
      tail: [turnAt('assistant', QUESTION, T3)],
      totalBytes: 70 * 1024 * 1024,
    });
    expect(fs.statSync(p).size).toBe(70 * 1024 * 1024);
    const started = Date.now();
    const read = await readTranscript(p, []);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(read.partial).toBe(true);
    expect(extractMessages(read.tailEntries)).toEqual([msg('assistant', QUESTION, T3)]);
    // No line outside the tail was parsed: the head's title and finding are not seen.
    expect(read.prefixEntries).toEqual([]);
    expect(read.firstUserEntry).toBeNull();
  });
});

describe('AC — bulk lines are skipped without loss of small ones', () => {
  it('a 300 KiB tool_use line is skipped by the prefix pass; the 200-byte Write line next to it is kept', async () => {
    const dir = tmp('bulk');
    const bulk = fileToolTurnAt('Write', '/tmp/x/scratchpad/bulk.md', T0, { content: 'y'.repeat(300 * 1024) });
    const small = fileToolTurnAt('Write', '/tmp/x/scratchpad/small.md', T1);
    const p = writeTranscriptFile(dir, [bulk, small]);
    expect(Buffer.byteLength(JSON.stringify(small))).toBeLessThan(400);
    const read = await readTranscript(p, []);
    expect(extractToolUses(read.prefixEntries).map((u) => u.filePath)).toEqual(['/tmp/x/scratchpad/small.md']);
    expect(read.partial).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 7 — lexicons and extractors
// ---------------------------------------------------------------------------

describe('Rule 7 — the lexicons are pinned exactly as the spec quotes them', () => {
  it('exports the five regexes with the quoted sources and flags', () => {
    expect(OFFER_RE.source).toBe('\\b(want me to|shall i|on request|if you want|i can\\b[^.]{0,80}?\\bif you|say the word)\\b');
    expect(OFFER_RE.flags).toBe('i');
    expect(APPROVAL_RE.source).toBe("\\b(approved|go ahead|let'?s go with|yes,? do it|ship it|proceed)\\b");
    expect(APPROVAL_RE.flags).toBe('i');
    expect(MEASUREMENT_RE.source).toBe('\\bover \\d+ sessions\\b|\\d+(\\.\\d+)?[x×] (cheaper|faster)|\\bmedian\\b|\\bmeasured\\b');
    expect(MEASUREMENT_RE.flags).toBe('i');
    expect(STATUS_LADDER_RE.source).toBe('[█░]|\\bdone when\\b|\\d{1,3}%');
    expect(STATUS_LADDER_RE.flags).toBe('i');
    expect(FINDING_TAG_RE.source).toBe(
      '<cortex:finding\\s+kind="(measurement|conclusion)"(?:\\s+bears_on="([^"]*)")?\\s*>([^\\n<]{1,300})<\\/cortex:finding>',
    );
    expect(FINDING_TAG_RE.flags).toBe('g');
  });

  it('lastParagraph takes the final blank-line-separated block, trimmed; cap truncates to n characters', () => {
    expect(lastParagraph('First.\n\nSecond one.\n\n  Third?  \n')).toBe('Third?');
    expect(lastParagraph('Only one')).toBe('Only one');
    expect(lastParagraph('')).toBe('');
    expect(cap('abcdef', 3)).toBe('abc');
    expect(cap('ab', 3)).toBe('ab');
  });
});

describe('AC — a question left hanging becomes the record\'s open question (extractOpenQuestion)', () => {
  it('the last assistant paragraph ending in ? with no user message after → question from the transcript', () => {
    const out = extractOpenQuestion(
      [msg('user', 'go on', T0), msg('assistant', `Here is the plan.\n\n${QUESTION}`, T1)],
      null,
    );
    expect(out).toEqual({ kind: 'question', text: QUESTION, timestamp: T1, source: 'transcript' });
  });

  it('a user message after the last assistant text → null; a plain statement → null', () => {
    expect(extractOpenQuestion([msg('assistant', QUESTION, T0), msg('user', 'no, leave it', T1)], null)).toBeNull();
    expect(extractOpenQuestion([msg('assistant', 'Done. All tests pass.', T0)], null)).toBeNull();
    expect(extractOpenQuestion([], null)).toBeNull();
  });

  it('the offer lexicon yields kind offer; text is capped at 600 characters', () => {
    const out = extractOpenQuestion([msg('assistant', 'I can wire the sync path too if you want.', T0)], null);
    expect(out?.kind).toBe('offer');
    expect(out?.text).toBe('I can wire the sync path too if you want.');
    const long = 'x'.repeat(700) + '?';
    expect(extractOpenQuestion([msg('assistant', long, T0)], null)?.text.length).toBe(600);
  });

  it('a message without a timestamp records timestamp null', () => {
    expect(extractOpenQuestion([msg('assistant', QUESTION)], null)).toEqual({
      kind: 'question',
      text: QUESTION,
      timestamp: null,
      source: 'transcript',
    });
  });
});

describe('AC — a fresher companion file wins over a lagging transcript; an older one is ignored', () => {
  it('companion `at` later than every tail timestamp → its final paragraph, source stop, timestamp at', () => {
    const tail = [msg('assistant', 'Two remain.', T0), msg('user', 'ok, which one?', T1)];
    const out = extractOpenQuestion(tail, { text: 'Both work.\n\nShall I keep the counter in state/?', at: T3 });
    // Ends with `?` → question, even though the offer lexicon also matches (Rule 7a's order).
    expect(out).toEqual({ kind: 'question', text: 'Shall I keep the counter in state/?', timestamp: T3, source: 'stop' });
  });

  it('companion `at` not later than the tail → ignored; the transcript rule decides', () => {
    const tail = [msg('assistant', QUESTION, T1), msg('user', 'state/', T2)];
    expect(extractOpenQuestion(tail, { text: 'Older question?', at: T0 })).toBeNull();
    const hanging = [msg('assistant', QUESTION, T2)];
    expect(extractOpenQuestion(hanging, { text: 'Older question?', at: T0 })?.source).toBe('transcript');
  });

  it('a fresher companion whose final paragraph neither asks nor offers → null', () => {
    expect(extractOpenQuestion([msg('user', 'go', T0)], { text: 'Done.', at: T1 })).toBeNull();
  });
});

describe('AC — approvals are paired with what was approved (extractApprovals)', () => {
  it('pairs a lexicon-matching user message with the preceding assistant paragraph; skips one with no assistant before', () => {
    const out = extractApprovals([
      msg('assistant', 'Two ways.\n\nProposal: allocate T-ids from a separate counter file.', T0),
      msg('user', 'approved, go ahead', T1),
      msg('user', 'proceed', T2),
    ]);
    expect(out).toEqual([
      { approval: 'approved, go ahead', approved: 'Proposal: allocate T-ids from a separate counter file.', timestamp: T1 },
    ]);
  });

  it('a match with no preceding assistant message at all is skipped; non-matching user text is ignored', () => {
    expect(extractApprovals([msg('user', 'proceed', T0), msg('assistant', 'ok', T1)])).toEqual([]);
    expect(extractApprovals([msg('assistant', 'Plan.', T0), msg('user', 'hmm, not sure', T1)])).toEqual([]);
  });

  it('caps both texts at 600 and the list at the first 20', () => {
    const many: ExtractedMessage[] = [];
    for (let i = 0; i < 25; i++) {
      many.push(msg('assistant', `Proposal ${i}: ` + 'p'.repeat(700), T0));
      many.push(msg('user', 'ship it ' + 'a'.repeat(700), T1));
    }
    const out = extractApprovals(many);
    expect(out.length).toBe(20);
    expect(out[0]?.approved.startsWith('Proposal 0:')).toBe(true);
    expect(out[19]?.approved.startsWith('Proposal 19:')).toBe(true);
    expect(out.every((a) => a.approval.length === 600 && a.approved.length === 600)).toBe(true);
  });
});

describe('AC — tagged findings are captured, malformed tags are skipped (extractFindings)', () => {
  it('a single-line ≤300 tag is captured with split bears_on; multi-line and 301-char bodies are skipped', () => {
    const multiline = '<cortex:finding kind="conclusion">first line\nsecond line</cortex:finding>';
    const tooLong = `<cortex:finding kind="conclusion">${'z'.repeat(301)}</cortex:finding>`;
    const out = extractFindings(
      [msg('assistant', `A ${FINDING_TAG} B ${multiline} C ${tooLong}`, T0)],
      [],
      'interactive',
    );
    expect(out).toEqual([
      {
        kind: 'measurement',
        text: '2 insight invocations over 55 sessions',
        bears_on: ['src/pulse/usage.ts', 'pulse.usage'],
        timestamp: T0,
        source: 'tag',
      },
    ]);
  });

  it('a tag without bears_on yields an empty list; a 300-char body is kept; user text is never scanned', () => {
    const exact = `<cortex:finding kind="conclusion">${'z'.repeat(300)}</cortex:finding>`;
    const out = extractFindings([msg('assistant', exact, T0), msg('user', FINDING_TAG, T1)], [], 'interactive');
    expect(out.length).toBe(1);
    expect(out[0]?.bears_on).toEqual([]);
    expect(out[0]?.text.length).toBe(300);
  });
});

describe('AC — untagged measurements fall back to the lexicon in interactive sessions only', () => {
  const SENTENCE = 'The line-filtered pass measured 3.1x faster than a full parse.';

  it('interactive: a tail assistant sentence with a digit and a lexicon hit becomes a lexicon finding', () => {
    const out = extractFindings([], [msg('assistant', `Ran it twice. ${SENTENCE} Good enough.`, T1)], 'interactive');
    expect(out).toEqual([{ kind: 'measurement', text: SENTENCE, timestamp: T1, source: 'lexicon' }]);
  });

  it('scheduled: the same tail yields no lexicon findings; tags still count', () => {
    expect(extractFindings([], [msg('assistant', SENTENCE, T1)], 'scheduled')).toEqual([]);
    expect(extractFindings([msg('assistant', FINDING_TAG, T0)], [msg('assistant', SENTENCE, T1)], 'scheduled').length).toBe(1);
  });

  it('table rows, fenced code and tagged text never feed the lexicon; prose still does', () => {
    const text = [
      '| 2 | CLI surface | 131,659 | **52,246** | code 2.5× cheaper |',
      '  | 3 | anatomy | 43,000 | 25,284 | code 1.7× cheaper |',
      '```',
      'median 12 ms over 55 sessions',
      '```',
      `Measured: ${FINDING_TAG}`,
      'The whole pass measured 3.1x faster.',
    ].join('\n');
    const out = extractFindings([msg('assistant', text, T0)], [msg('assistant', text, T1)], 'interactive');
    expect(out.map((f) => [f.source, f.text])).toEqual([
      ['tag', '2 insight invocations over 55 sessions'],
      ['lexicon', 'The whole pass measured 3.1x faster.'],
    ]);
  });

  it('status-ladder lines (bar glyph, "done when", a percentage) never feed the lexicon; prose still does', () => {
    const text = [
      'A  Cortex reliably reaches prior conclusions ........ 80% ████████░░  done when pointer follow-rate > 0 in `cortex usage`',
      '0% ░░░░░░░░░░  done when a grep into the schema returns a Decided/Open pointer, measured',
      'Rollout 40% — median 12 ms over 30 sessions',
      'Done when the proceed-rate is measured over 20 sessions.',
      'The whole pass measured 3.1x faster.',
    ].join('\n');
    const out = extractFindings([], [msg('assistant', text, T1)], 'interactive');
    expect(out).toEqual([{ kind: 'measurement', text: 'The whole pass measured 3.1x faster.', timestamp: T1, source: 'lexicon' }]);
  });

  it('a lexicon hit without a digit is ignored; tags come first and the combined list caps at 20', () => {
    expect(extractFindings([], [msg('assistant', 'We measured nothing useful.', T1)], 'interactive')).toEqual([]);
    const tags = Array.from({ length: 15 }, (_, i) => `<cortex:finding kind="conclusion">c${i}</cortex:finding>`).join(' ');
    const sentences = Array.from({ length: 10 }, (_, i) => `Median ${i} was fine.`).join(' ');
    const out = extractFindings([msg('assistant', tags, T0)], [msg('assistant', sentences, T1)], 'interactive');
    expect(out.length).toBe(20);
    expect(out.slice(0, 15).every((f) => f.source === 'tag')).toBe(true);
    expect(out.slice(15).every((f) => f.source === 'lexicon')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 8 — scratchpad artefacts
// ---------------------------------------------------------------------------

function toolUse(name: string, filePath: string): ExtractedToolUse {
  return { name, filePath, timestamp: T0 };
}

describe('AC — scratchpad artefacts are copied with their first heading, using scratchpad_dir when given', () => {
  it('keeps only paths under scratchpad_dir; copies text ≤64 KiB byte-identically; records the first heading', () => {
    const root = tmp('artefacts');
    makeCortexProject(root);
    const scratch = path.join(tmp('scratch'), 'x', 'scratchpad');
    fs.mkdirSync(scratch, { recursive: true });
    const defects = path.join(scratch, 'defects.md');
    const defectsBody = '# Defects found\n\n' + 'd'.repeat(2000) + '\n';
    fs.writeFileSync(defects, defectsBody);
    const big = path.join(scratch, 'big.md');
    fs.writeFileSync(big, '# Big\n' + 'b'.repeat(100 * 1024));
    const uses = [
      toolUse('Write', defects),
      toolUse('Edit', big),
      toolUse('Write', '/elsewhere/scratchpad/notes.md'),
      toolUse('Write', path.join(root, 'src/hooks/session-end.ts')),
      toolUse('Read', path.join(scratch, 'read-only.md')),
    ];
    const out = collectArtefacts(root, 'sess-a', uses, scratch);
    expect(out).toEqual([
      { path: defects, copied: true, first_heading: 'Defects found' },
      { path: big, copied: false, first_heading: null },
    ]);
    const copy = path.join(scratchDirOf(root, 'sess-a'), 'defects.md');
    expect(fs.readFileSync(copy)).toEqual(fs.readFileSync(defects));
    expect(fs.readdirSync(scratchDirOf(root, 'sess-a'))).toEqual(['defects.md']);
  });

  it('a gone file and a binary file record copied: false; no copy directory is created when nothing copies', () => {
    const root = tmp('nocopy');
    makeCortexProject(root);
    const scratch = path.join(tmp('scratch2'), 'scratchpad');
    fs.mkdirSync(scratch, { recursive: true });
    const bin = path.join(scratch, 'blob.md');
    fs.writeFileSync(bin, Buffer.concat([Buffer.from('# Heading\n'), Buffer.from([0, 1, 2, 3])]));
    const out = collectArtefacts(root, 'sess-b', [toolUse('Write', path.join(scratch, 'gone.md')), toolUse('Write', bin)], scratch);
    expect(out).toEqual([
      { path: path.join(scratch, 'gone.md'), copied: false, first_heading: null },
      { path: bin, copied: false, first_heading: null },
    ]);
    expect(fs.existsSync(scratchDirOf(root, 'sess-b'))).toBe(false);
  });

  it('dedupes by path, suffixes clashing basenames -2/-3 before the extension, caps at 20, heading null when none', () => {
    const root = tmp('clash');
    makeCortexProject(root);
    const scratch = path.join(tmp('scratch3'), 'scratchpad');
    const a = path.join(scratch, 'a', 'notes.md');
    const b = path.join(scratch, 'b', 'notes.md');
    const c = path.join(scratch, 'c', 'notes.md');
    for (const [p, body] of [[a, 'no heading here\n'], [b, '## Second\n'], [c, 'third\n']] as const) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, body);
    }
    const out = collectArtefacts(root, 'sess-c', [toolUse('Write', a), toolUse('Edit', a), toolUse('Write', b), toolUse('Write', c)], scratch);
    expect(out.map((e) => [e.path, e.copied, e.first_heading])).toEqual([
      [a, true, null],
      [b, true, 'Second'],
      [c, true, null],
    ]);
    expect(fs.readdirSync(scratchDirOf(root, 'sess-c')).sort()).toEqual(['notes-2.md', 'notes-3.md', 'notes.md']);
    expect(fs.readFileSync(path.join(scratchDirOf(root, 'sess-c'), 'notes-2.md'), 'utf-8')).toBe('## Second\n');

    const many: ExtractedToolUse[] = [];
    for (let i = 0; i < 25; i++) many.push(toolUse('Write', path.join(scratch, `f${i}.md`)));
    expect(collectArtefacts(root, 'sess-d', many, scratch).length).toBe(20);
  });
});

describe('AC — without scratchpad_dir the path heuristic applies', () => {
  it('keeps every Write/Edit whose path contains a /scratchpad/ segment', () => {
    const root = tmp('heuristic');
    makeCortexProject(root);
    const uses = [
      toolUse('Write', '/private/tmp/claude-502/x/scratchpad/defects.md'),
      toolUse('Edit', '/private/tmp/claude-502/x/scratchpad/big.md'),
      toolUse('Write', '/elsewhere/scratchpad/notes.md'),
      toolUse('Write', path.join(root, 'src/hooks/session-end.ts')),
    ];
    const out = collectArtefacts(root, 'sess-e', uses);
    expect(out.map((e) => e.path)).toEqual([
      '/private/tmp/claude-502/x/scratchpad/defects.md',
      '/private/tmp/claude-502/x/scratchpad/big.md',
      '/elsewhere/scratchpad/notes.md',
    ]);
    expect(out.every((e) => e.copied === false && e.first_heading === null)).toBe(true);
    expect(collectArtefacts(root, 'sess-f', uses, '')).toEqual(out);
  });
});

// ---------------------------------------------------------------------------
// Rule 7 preamble — harness-injected user entries
// ---------------------------------------------------------------------------

describe('Rule 7 — harness-injected user entries are not the human\'s messages', () => {
  it('a user message starting (after trimming) with < or [ is injected; assistant text never is', () => {
    expect(isHarnessInjected(msg('user', '<teammate-message teammate_id="x">approved</teammate-message>'))).toBe(true);
    expect(isHarnessInjected(msg('user', '  \n[SYSTEM NOTIFICATION] go ahead'))).toBe(true);
    expect(isHarnessInjected(msg('user', '<system-reminder>ship it</system-reminder>'))).toBe(true);
    // The observed two-line teammate shape: prose first, the tag on the next line.
    expect(
      isHarnessInjected(msg('user', 'Another Claude session sent a message:\n<teammate-message teammate_id="x">approved, go ahead</teammate-message>')),
    ).toBe(true);
    expect(isHarnessInjected(msg('user', 'Note from the harness\n[SYSTEM NOTIFICATION] proceed'))).toBe(true);
    expect(isHarnessInjected(msg('user', 'x'.repeat(301) + '\n<teammate-message>late marker</teammate-message>'))).toBe(false);
    expect(HARNESS_MARKERS).toEqual([
      '<teammate-message',
      '<system-reminder',
      '<task-notification',
      '[SYSTEM NOTIFICATION',
      '<bash-input>',
      '<bash-stdout>',
      '<command-name>',
      '<local-command',
    ]);
    expect(isHarnessInjected(msg('user', 'Approved.'))).toBe(false);
    expect(isHarnessInjected(msg('user', 'proceed with <the plan>'))).toBe(false);
    expect(isHarnessInjected(msg('assistant', '<cortex:finding kind="conclusion">x</cortex:finding>'))).toBe(false);
  });

  it('humanMessages keeps order and drops only the injected user entries', () => {
    const list = [
      msg('assistant', 'Proposal: X.', T0),
      msg('user', '<teammate-message>approved, go ahead</teammate-message>', T1),
      msg('user', 'Approved.', T2),
      msg('assistant', 'Done?', T3),
      msg('user', '[SYSTEM NOTIFICATION] done', T3),
    ];
    expect(humanMessages(list)).toEqual([list[0], list[2], list[3]]);
    expect(extractApprovals(humanMessages(list))).toEqual([{ approval: 'Approved.', approved: 'Proposal: X.', timestamp: T2 }]);
    expect(extractOpenQuestion(humanMessages(list), null)?.text).toBe('Done?');
  });
});
