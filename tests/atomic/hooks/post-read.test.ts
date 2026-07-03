/**
 * Atomic tests — hooks.post-read internals: tag extraction (well-formed,
 * nested-ish, multiple, malformed), the 120-char writeback ceiling, the
 * bounded transcript tail, dedupe memory mechanics, assistant-only sweeping,
 * path normalisation, and silence/degradation paths.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  run,
  extractPurposeTags,
  validateWritebackPurpose,
  readTranscriptTail,
  TRANSCRIPT_TAIL_BYTES,
  WRITEBACK_MAX_CHARS,
  READBACK_APPLIED_FILE,
} from '../../../src/hooks/post-read.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeFilesMd,
  readFilesMdRows,
  hookErrorsPath,
} from '../../fixtures/hooks-harness.js';

const NOW = new Date('2026-07-03T10:00:00.000Z');
const SEEN = '2026-06-30T14:00:00.000Z';
const SHA = 'a'.repeat(64);

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
  return { cwd: root, transcript_path: transcriptPath, tool_input: { file_path: 'x' } };
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

describe('validateWritebackPurpose: the writeback-specific ceiling and row grammar', () => {
  it('accepts exactly 120 chars; rejects 121 (INVALID, not truncated)', () => {
    expect(validateWritebackPurpose('x'.repeat(WRITEBACK_MAX_CHARS))).toBe('x'.repeat(120));
    expect(validateWritebackPurpose('x'.repeat(WRITEBACK_MAX_CHARS + 1))).toBeNull();
  });

  it('rejects empty, whitespace-only, and multi-line payloads', () => {
    expect(validateWritebackPurpose('')).toBeNull();
    expect(validateWritebackPurpose('   ')).toBeNull();
    expect(validateWritebackPurpose('line one\nline two')).toBeNull();
  });

  it('sanitises to the row grammar: pipes and --- runs never reach the cell', () => {
    expect(validateWritebackPurpose('a | b')).toBe('a / b');
    expect(validateWritebackPurpose('dashes --- here')).toBe('dashes — here');
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
// sweep mechanics
// ---------------------------------------------------------------------------

describe('sweep: assistant messages only', () => {
  it('a tag inside a USER message is never applied', async () => {
    const root = tmp('user-msg');
    makeCortexProject(root);
    writeFilesMd(root, [`| src/a.ts | Does A. | 12 | ${SHA} | ${SEEN} | - | false | docstring |`]);
    const snapshot = fs.readFileSync(path.join(root, '.cortex', 'anatomy', 'files.md'), 'utf-8');
    const transcript = writeTranscript(root, [
      { role: 'user', text: '<cortex:purpose file="src/a.ts">User-injected purpose.</cortex:purpose>' },
    ]);
    await run(stdinFor(root, transcript), { now: NOW });
    expect(fs.readFileSync(path.join(root, '.cortex', 'anatomy', 'files.md'), 'utf-8')).toBe(snapshot);
  });
});

describe('sweep: path normalisation and preserved cells', () => {
  it('file="./src/a.ts" resolves to the src/a.ts row; tokens/sha/spec_links preserved', async () => {
    const root = tmp('norm');
    makeCortexProject(root);
    writeFilesMd(root, [`| src/a.ts | (needs purpose) | 34 | ${SHA} | ${SEEN} | core.a | true | - |`]);
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="./src/a.ts">Normalised fine.</cortex:purpose>' },
    ]);
    await run(stdinFor(root, transcript), { now: NOW });
    const row = readFilesMdRows(root).find((r) => r.path === 'src/a.ts')!;
    expect(row.purpose).toBe('Normalised fine.');
    expect(row.purposeSource).toBe('read-time');
    expect(row.tokens).toBe(34);
    expect(row.sha256).toBe(SHA);
    expect(row.specLinks).toBe('core.a');
  });

  it('two tags for the same path in one sweep: the later one wins (applied in order)', async () => {
    const root = tmp('order');
    makeCortexProject(root);
    writeFilesMd(root, [`| src/a.ts | (needs purpose) | 12 | ${SHA} | ${SEEN} | - | true | - |`]);
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="src/a.ts">First take.</cortex:purpose>' },
      { role: 'assistant', text: '<cortex:purpose file="src/a.ts">Second take.</cortex:purpose>' },
    ]);
    await run(stdinFor(root, transcript), { now: NOW });
    expect(readFilesMdRows(root).find((r) => r.path === 'src/a.ts')!.purpose).toBe('Second take.');
  });
});

// ---------------------------------------------------------------------------
// dedupe memory (Rule 6)
// ---------------------------------------------------------------------------

describe('applied-tag memory: pulse/.readback-applied', () => {
  it('applied AND invalid tags are both remembered as hash lines', async () => {
    const root = tmp('memory');
    makeCortexProject(root);
    writeFilesMd(root, [`| src/a.ts | (needs purpose) | 12 | ${SHA} | ${SEEN} | - | true | - |`]);
    const transcript = writeTranscript(root, [
      {
        role: 'assistant',
        text:
          '<cortex:purpose file="src/a.ts">Valid one.</cortex:purpose> ' +
          '<cortex:purpose file="src/ghost.ts">Invalid target.</cortex:purpose>',
      },
    ]);
    await run(stdinFor(root, transcript), { now: NOW });
    const memory = fs.readFileSync(path.join(root, '.cortex', 'pulse', READBACK_APPLIED_FILE), 'utf-8');
    const hashes = memory.split('\n').filter((l) => l.trim());
    expect(hashes).toHaveLength(2);
    expect(hashes.every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
  });

  it('a corrupt memory file degrades to re-application (idempotent, still silent)', async () => {
    const root = tmp('memory-corrupt');
    makeCortexProject(root);
    writeFilesMd(root, [`| src/a.ts | (needs purpose) | 12 | ${SHA} | ${SEEN} | - | true | - |`]);
    fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'pulse', READBACK_APPLIED_FILE), 'not-a-hash\n');
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="src/a.ts">Applied anyway.</cortex:purpose>' },
    ]);
    const result = await run(stdinFor(root, transcript), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(readFilesMdRows(root).find((r) => r.path === 'src/a.ts')!.purpose).toBe('Applied anyway.');
  });
});

// ---------------------------------------------------------------------------
// silence / degradation
// ---------------------------------------------------------------------------

describe('silence and degradation paths', () => {
  it('unscanned project (no files.md) → silent no-op, no pulse entry, even without a transcript', async () => {
    const root = tmp('unscanned');
    makeCortexProject(root);
    const result = await run({ cwd: root }, { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('corrupt files.md → no write, one entry, tags NOT remembered (retry allowed after repair)', async () => {
    const root = tmp('corrupt');
    makeCortexProject(root);
    const p = path.join(root, '.cortex', 'anatomy', 'files.md');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const corrupt = '---\nkind: anatomy-files\n---\n\n| src/a.ts | broken | 1\n';
    fs.writeFileSync(p, corrupt);
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="src/a.ts">Unapplied.</cortex:purpose>' },
    ]);
    const result = await run(stdinFor(root, transcript), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.readFileSync(p, 'utf-8')).toBe(corrupt);
    expect(fs.readFileSync(hookErrorsPath(root), 'utf-8')).toContain('could not be parsed');
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', READBACK_APPLIED_FILE))).toBe(false);
  });

  it('malformed stdin (no object) → silent', async () => {
    const result = await run('garbage', { cwd: tmp('garbage'), now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });
});
