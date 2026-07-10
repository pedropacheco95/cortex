/**
 * Atomic tests — hooks.post-read internals over the v3 insight per-file entry
 * (anatomy deprecation, build-order-v3 step 7): tag extraction (well-formed,
 * nested-ish, multiple, malformed), the 120-char writeback ceiling, the
 * bounded transcript tail, replacePurposeSection, dedupe memory mechanics,
 * assistant-only sweeping, path normalisation, and silence/degradation paths.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  run,
  extractPurposeTags,
  validateWritebackPurpose,
  readTranscriptTail,
  replacePurposeSection,
  TRANSCRIPT_TAIL_BYTES,
  WRITEBACK_MAX_CHARS,
  READBACK_APPLIED_FILE,
  READ_TIME_MARKER,
} from '../../../src/hooks/post-read.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeInsightEntry,
  insightEntryPath,
  readInsightEntry,
  hookErrorsPath,
} from '../../fixtures/hooks-harness.js';

const NOW = new Date('2026-07-03T10:00:00.000Z');

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`post-read-atomic-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function writeTranscript(dir: string, messages: { role: string; text: string }[]): string {
  const p = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(
    p,
    messages
      .map((m) => JSON.stringify({ type: m.role, message: { role: m.role, content: [{ type: 'text', text: m.text }] } }))
      .join('\n') + '\n',
  );
  return p;
}

function stdinFor(root: string, transcriptPath: string): Record<string, unknown> {
  return { session_id: 'sess-at', cwd: root, transcript_path: transcriptPath, tool_input: { file_path: 'x' } };
}

/** The `## Purpose` section content of an entry document (raw lines). */
function purposeSectionOf(doc: string): string {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => /^##\s+Purpose\s*$/.test(l));
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

// ---------------------------------------------------------------------------
// tag extraction
// ---------------------------------------------------------------------------

describe('extractPurposeTags: well-formed tags', () => {
  it('extracts file and payload from a single tag', () => {
    const tags = extractPurposeTags('before <cortex:purpose file="src/a.ts">Does A.</cortex:purpose> after');
    expect(tags).toHaveLength(1);
    expect(tags[0]!.file).toBe('src/a.ts');
    expect(tags[0]!.payload).toBe('Does A.');
    expect(tags[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('extracts multiple tags in order', () => {
    const tags = extractPurposeTags(
      '<cortex:purpose file="a.ts">One.</cortex:purpose> mid <cortex:purpose file="b.ts">Two.</cortex:purpose>',
    );
    expect(tags.map((t) => t.file)).toEqual(['a.ts', 'b.ts']);
    expect(tags.map((t) => t.payload)).toEqual(['One.', 'Two.']);
    expect(tags[0]!.hash).not.toBe(tags[1]!.hash);
  });

  it('survives nested-ish surrounding markup and angle brackets', () => {
    const tags = extractPurposeTags(
      'I read `<T>` generics in <b>bold</b>; emitting <cortex:purpose file="src/a.ts">Maps <T> to rows & cells.</cortex:purpose> now.',
    );
    expect(tags).toHaveLength(1);
    expect(tags[0]!.payload).toBe('Maps <T> to rows & cells.');
  });

  it('identical tags hash identically (the dedupe key)', () => {
    const [a] = extractPurposeTags('<cortex:purpose file="a.ts">Same.</cortex:purpose>');
    const [b] = extractPurposeTags('<cortex:purpose file="a.ts">Same.</cortex:purpose>');
    expect(a!.hash).toBe(b!.hash);
  });
});

describe('extractPurposeTags: malformed tags never match', () => {
  it.each([
    ['missing file attribute', '<cortex:purpose>Orphan.</cortex:purpose>'],
    ['unclosed tag', '<cortex:purpose file="a.ts">Never closed'],
    ['single-quoted attribute', "<cortex:purpose file='a.ts'>Wrong quotes.</cortex:purpose>"],
    ['wrong tag name', '<cortex:purposes file="a.ts">Plural.</cortex:purposes>'],
    ['no tags at all', 'plain prose about purposes and files'],
  ])('%s → zero tags', (_label, text) => {
    expect(extractPurposeTags(text)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validation (Rule 4 — the 120 writeback ceiling)
// ---------------------------------------------------------------------------

describe('validateWritebackPurpose: the writeback-specific ceiling and one-line discipline', () => {
  it('accepts exactly 120 chars; rejects 121 (INVALID, not truncated)', () => {
    expect(validateWritebackPurpose('x'.repeat(WRITEBACK_MAX_CHARS))).toBe('x'.repeat(120));
    expect(validateWritebackPurpose('x'.repeat(WRITEBACK_MAX_CHARS + 1))).toBeNull();
  });

  it('rejects empty, whitespace-only, and multi-line payloads', () => {
    expect(validateWritebackPurpose('')).toBeNull();
    expect(validateWritebackPurpose('   ')).toBeNull();
    expect(validateWritebackPurpose('line one\nline two')).toBeNull();
  });

  it('collapses internal whitespace runs to single spaces (no cell grammar any more)', () => {
    expect(validateWritebackPurpose('  a   b\t\tc  ')).toBe('a b c');
    expect(validateWritebackPurpose('a | b')).toBe('a | b'); // pipes pass through — no table cell to protect
  });
});

// ---------------------------------------------------------------------------
// bounded transcript tail (Rule 3 — engineering-call constant)
// ---------------------------------------------------------------------------

describe('readTranscriptTail: bounded sweep', () => {
  it('a file smaller than the bound is read whole', () => {
    const dir = tmp('tail-small');
    const p = path.join(dir, 't.jsonl');
    fs.writeFileSync(p, 'line1\nline2\n');
    expect(readTranscriptTail(p)).toBe('line1\nline2\n');
  });

  it('a file over the bound is cut to the tail with the leading partial line dropped', () => {
    const dir = tmp('tail-big');
    const p = path.join(dir, 't.jsonl');
    fs.writeFileSync(p, 'AAAA-old-line\nBBBB-mid-line\nCCCC-last-line\n');
    const tail = readTranscriptTail(p, 20); // cuts into "BBBB-mid-line"
    expect(tail).toBe('CCCC-last-line\n'); // partial line dropped, whole lines kept
  });

  it('the shipped constant is the documented 256 KiB', () => {
    expect(TRANSCRIPT_TAIL_BYTES).toBe(256 * 1024);
  });
});

// ---------------------------------------------------------------------------
// replacePurposeSection (Rule 5 — the surgical entry rewrite)
// ---------------------------------------------------------------------------

describe('replacePurposeSection: only the Purpose section changes', () => {
  const DOC = [
    '---',
    'path: src/a.ts',
    '---',
    '',
    '## Purpose',
    '',
    'Old purpose line.',
    'A second old line.',
    '',
    '## Connections',
    '',
    '- imports src/b.ts',
    '',
  ].join('\n');

  it('replaces the Purpose content with purpose + provenance trailer, all else byte-identical', () => {
    const next = replacePurposeSection(DOC, 'New purpose.', 'claude-sessions/alice/sess-1');
    expect(next).not.toBeNull();
    const lines = next!.split('\n');
    const start = lines.indexOf('## Purpose');
    expect(lines.slice(start, start + 6)).toEqual([
      '## Purpose',
      '',
      'New purpose.',
      '',
      '*(read-time, claude-sessions/alice/sess-1)*',
      '',
    ]);
    // Frontmatter before and the Connections section after are untouched.
    expect(next!.startsWith('---\npath: src/a.ts\n---\n')).toBe(true);
    expect(next!.slice(next!.indexOf('## Connections'))).toBe(DOC.slice(DOC.indexOf('## Connections')));
    expect(next).toContain(READ_TIME_MARKER);
  });

  it('a document with no ## Purpose heading → null (never patched)', () => {
    expect(replacePurposeSection('## Connections\n\n- x\n', 'P.', 'claude-sessions/a/b')).toBeNull();
  });

  it('a Purpose section that is the last section is replaced up to EOF', () => {
    const doc = '## Connections\n\n- x\n\n## Purpose\n\nTail purpose.\n';
    const next = replacePurposeSection(doc, 'Replaced tail.', 'claude-sessions/a/b')!;
    expect(next).toContain('## Purpose\n\nReplaced tail.\n\n*(read-time, claude-sessions/a/b)*');
    expect(next).not.toContain('Tail purpose.');
    expect(next.startsWith('## Connections\n\n- x\n')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sweep mechanics
// ---------------------------------------------------------------------------

describe('sweep: assistant messages only', () => {
  it('a tag inside a USER message is never applied', async () => {
    const root = tmp('user-msg');
    makeCortexProject(root);
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    const snapshot = readInsightEntry(root, 'src/a.ts');
    const transcript = writeTranscript(root, [
      { role: 'user', text: '<cortex:purpose file="src/a.ts">User-injected purpose.</cortex:purpose>' },
    ]);
    await run(stdinFor(root, transcript), { now: NOW });
    expect(readInsightEntry(root, 'src/a.ts')).toBe(snapshot);
  });
});

describe('sweep: path normalisation and untouched entry parts', () => {
  it('file="./src/a.ts" resolves to the src/a.ts entry; frontmatter and Connections byte-identical', async () => {
    const root = tmp('norm');
    makeCortexProject(root);
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Stale purpose.', connections: '- imports src/b.ts' });
    const before = readInsightEntry(root, 'src/a.ts')!;
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="./src/a.ts">Normalised fine.</cortex:purpose>' },
    ]);
    await run(stdinFor(root, transcript), { now: NOW });
    const after = readInsightEntry(root, 'src/a.ts')!;
    expect(purposeSectionOf(after)).toContain('Normalised fine.');
    expect(purposeSectionOf(after)).toContain(READ_TIME_MARKER);
    expect(purposeSectionOf(after)).not.toContain('Stale purpose.');
    // Everything outside the Purpose section stays byte-identical:
    expect(after.slice(0, after.indexOf('## Purpose'))).toBe(before.slice(0, before.indexOf('## Purpose')));
    expect(after.slice(after.indexOf('## Connections'))).toBe(before.slice(before.indexOf('## Connections')));
  });

  it('two tags for the same path in one sweep: the later one wins (applied in order)', async () => {
    const root = tmp('order');
    makeCortexProject(root);
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Original.' });
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="src/a.ts">First take.</cortex:purpose>' },
      { role: 'assistant', text: '<cortex:purpose file="src/a.ts">Second take.</cortex:purpose>' },
    ]);
    await run(stdinFor(root, transcript), { now: NOW });
    const purpose = purposeSectionOf(readInsightEntry(root, 'src/a.ts')!);
    expect(purpose).toContain('Second take.');
    expect(purpose).not.toContain('First take.');
  });
});

// ---------------------------------------------------------------------------
// dedupe memory (Rule 6)
// ---------------------------------------------------------------------------

describe('applied-tag memory: pulse/state/readback-applied', () => {
  it('applied AND rejected tags are both remembered as hash lines', async () => {
    const root = tmp('memory');
    makeCortexProject(root);
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    const transcript = writeTranscript(root, [
      {
        role: 'assistant',
        text:
          '<cortex:purpose file="src/a.ts">Valid one.</cortex:purpose> ' +
          '<cortex:purpose file="src/ghost.ts">No entry target.</cortex:purpose>',
      },
    ]);
    await run(stdinFor(root, transcript), { now: NOW });
    const memory = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'state', READBACK_APPLIED_FILE), 'utf-8');
    const hashes = memory.split('\n').filter((l) => l.trim());
    expect(hashes).toHaveLength(2);
    expect(hashes.every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
  });

  it('a corrupt memory file degrades to re-application (idempotent, still silent)', async () => {
    const root = tmp('memory-corrupt');
    makeCortexProject(root);
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Original.' });
    fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'state'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'pulse', 'state', READBACK_APPLIED_FILE), 'not-a-hash\n');
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="src/a.ts">Applied anyway.</cortex:purpose>' },
    ]);
    const result = await run(stdinFor(root, transcript), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(purposeSectionOf(readInsightEntry(root, 'src/a.ts')!)).toContain('Applied anyway.');
  });
});

// ---------------------------------------------------------------------------
// silence / degradation
// ---------------------------------------------------------------------------

describe('silence and degradation paths', () => {
  it('unextracted project (no .cortex/insight/) → silent no-op, no pulse entry, even without a transcript', async () => {
    const root = tmp('unextracted');
    makeCortexProject(root, { modules: ['compass', 'atlas', 'pulse'] });
    const result = await run({ cwd: root }, { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('a tag whose file has NO insight entry is rejected: logged, remembered, no file created', async () => {
    const root = tmp('noentry');
    makeCortexProject(root);
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="src/ghost.ts">Fabricated.</cortex:purpose>' },
    ]);
    const result = await run(stdinFor(root, transcript), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(insightEntryPath(root, 'src/ghost.ts'))).toBe(false);
    const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    expect(log).toContain('no insight entry (extraction owns entry creation)');
    // Remembered — a later fire adds no new log entries:
    await run(stdinFor(root, transcript), { now: new Date(NOW.getTime() + 60_000) });
    expect(fs.readFileSync(hookErrorsPath(root), 'utf-8')).toBe(log);
  });

  it('a tag targeting a MALFORMED entry → entry untouched, logged, remembered', async () => {
    const root = tmp('malformed-entry');
    makeCortexProject(root);
    const p = insightEntryPath(root, 'src/a.ts');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const broken = '---\npath: src/a.ts\n---\n\n## Purpose\n\nMissing every other frontmatter field.\n';
    fs.writeFileSync(p, broken);
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="src/a.ts">Never lands.</cortex:purpose>' },
    ]);
    const result = await run(stdinFor(root, transcript), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.readFileSync(p, 'utf-8')).toBe(broken);
    const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    expect(log).toContain('insight entry unreadable');
    const memory = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'state', READBACK_APPLIED_FILE), 'utf-8');
    expect(memory.split('\n').filter((l) => l.trim())).toHaveLength(1);
  });

  it('invalid payloads (multi-line, over-ceiling) → rejected, logged, remembered, nothing written', async () => {
    const root = tmp('invalid-payloads');
    makeCortexProject(root);
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    const snapshot = readInsightEntry(root, 'src/a.ts');
    const transcript = writeTranscript(root, [
      {
        role: 'assistant',
        text:
          '<cortex:purpose file="src/a.ts">line one\nline two</cortex:purpose> ' +
          `<cortex:purpose file="src/a.ts">${'x'.repeat(300)}</cortex:purpose>`,
      },
    ]);
    await run(stdinFor(root, transcript), { now: NOW });
    expect(readInsightEntry(root, 'src/a.ts')).toBe(snapshot);
    const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    expect(log.split('hook: post-read').length - 1).toBe(2);
    expect(log).toContain('invalid');
    const memory = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'state', READBACK_APPLIED_FILE), 'utf-8');
    expect(memory.split('\n').filter((l) => l.trim())).toHaveLength(2);
  });

  it('malformed stdin (no object) → silent', async () => {
    const result = await run('garbage', { cwd: tmp('garbage'), now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });
});
