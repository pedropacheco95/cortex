/**
 * Spec tests — hooks.post-read: every Acceptance Criterion as a labeled
 * describe, end-to-end through run(stdinJson) over tmp fixture projects with
 * synthetic JSONL transcripts (never the real ~/.claude).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { run, READBACK_APPLIED_FILE } from '../../../src/hooks/post-read.js';
import { runHook } from '../../../src/hooks/cli.js';
import { collectPurposeWorklist, applyPurposeResults } from '../../../src/anatomy/refresh-deep.js';
import { computeSha256, computeTokens } from '../../../src/anatomy/files-md.js';
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
  const d = makeTmpDir(`post-read-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** Synthetic transcript: one JSONL line per message, Claude Code entry shape. */
function writeTranscript(dir: string, messages: { role: 'user' | 'assistant'; text: string }[]): string {
  const p = path.join(dir, 'transcript.jsonl');
  const lines = messages.map((m) =>
    JSON.stringify({
      type: m.role,
      message: { role: m.role, content: [{ type: 'text', text: m.text }] },
      timestamp: SEEN,
    }),
  );
  fs.writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

function stdinFor(root: string, transcriptPath: string): Record<string, unknown> {
  return {
    session_id: 'sess-pr',
    cwd: root,
    hook_event_name: 'PostToolUse',
    tool_name: 'Read',
    transcript_path: transcriptPath,
    tool_input: { file_path: path.join(root, 'src/a.ts') },
  };
}

function filesMd(root: string): string {
  return fs.readFileSync(path.join(root, '.cortex', 'anatomy', 'files.md'), 'utf-8');
}

// ---------------------------------------------------------------------------
// AC: Tag captured and applied with provenance
// ---------------------------------------------------------------------------
describe('AC: tag captured and applied with provenance', () => {
  it('purpose applied as read-time, flag cleared, last_seen fresh — one atomic row write; silent envelope', async () => {
    const root = tmp('ac1');
    makeCortexProject(root);
    writeFilesMd(root, [
      `| src/a.ts | (needs purpose) | 12 | ${SHA} | ${SEEN} | - | true | - |`,
      `| src/b.ts | Sibling. | 9 | ${'b'.repeat(64)} | ${SEEN} | - | false | docstring |`,
    ]);
    const siblingBefore = readFilesMdRows(root).find((r) => r.path === 'src/b.ts')!.raw;
    const transcript = writeTranscript(root, [
      { role: 'user', text: 'read that file please' },
      { role: 'assistant', text: 'Looking… <cortex:purpose file="src/a.ts">Parses anatomy rows.</cortex:purpose> done.' },
    ]);

    const result = await run(stdinFor(root, transcript), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' }); // always silent

    const a = readFilesMdRows(root).find((r) => r.path === 'src/a.ts')!;
    expect(a.purpose).toBe('Parses anatomy rows.');
    expect(a.purposeSource).toBe('read-time');
    expect(a.flagged).toBe(false);
    expect(a.lastSeen).toBe(NOW.toISOString());
    expect(a.sha256).toBe(SHA); // untouched fields ride along in the ONE re-emitted row
    expect(a.tokens).toBe(12);
    // Sibling row byte-identical (atomic row write).
    expect(readFilesMdRows(root).find((r) => r.path === 'src/b.ts')!.raw).toBe(siblingBefore);
  });
});

// ---------------------------------------------------------------------------
// AC: Same tag not applied twice in a session
// ---------------------------------------------------------------------------
describe('AC: same tag not applied twice in a session', () => {
  it('after the tag is applied and recorded, a later fire leaves files.md byte-identical', async () => {
    const root = tmp('ac2');
    makeCortexProject(root);
    writeFilesMd(root, [`| src/a.ts | (needs purpose) | 12 | ${SHA} | ${SEEN} | - | true | - |`]);
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="src/a.ts">Parses anatomy rows.</cortex:purpose>' },
    ]);
    await run(stdinFor(root, transcript), { now: NOW });
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', READBACK_APPLIED_FILE))).toBe(true);
    const snapshot = filesMd(root);

    const later = await run(stdinFor(root, transcript), { now: new Date(NOW.getTime() + 60_000) });
    expect(later).toEqual({ exitCode: 0, stdout: '' });
    expect(filesMd(root)).toBe(snapshot); // byte-identical
  });
});

// ---------------------------------------------------------------------------
// AC: Invalid tags rejected without noise
// ---------------------------------------------------------------------------
describe('AC: invalid tags rejected without noise', () => {
  it('unknown file, multi-line payload, and 300-char payload: no row changes, one hook-errors entry each, never retried', async () => {
    const root = tmp('ac3');
    makeCortexProject(root);
    writeFilesMd(root, [`| src/a.ts | Does A. | 12 | ${SHA} | ${SEEN} | - | false | docstring |`]);
    const snapshot = filesMd(root);
    const transcript = writeTranscript(root, [
      {
        role: 'assistant',
        text:
          '<cortex:purpose file="src/unknown.ts">No such row.</cortex:purpose> ' +
          '<cortex:purpose file="src/a.ts">line one\nline two</cortex:purpose> ' +
          `<cortex:purpose file="src/a.ts">${'x'.repeat(300)}</cortex:purpose>`,
      },
    ]);

    await run(stdinFor(root, transcript), { now: NOW });
    expect(filesMd(root)).toBe(snapshot); // no row changed
    const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    expect(log.split('hook: post-read').length - 1).toBe(3); // one entry per invalid tag
    expect(log).toContain('no anatomy row');
    expect(log).toContain('invalid');

    // Never retried: a later fire adds no new entries and changes nothing.
    const logSnapshot = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    await run(stdinFor(root, transcript), { now: new Date(NOW.getTime() + 60_000) });
    expect(filesMd(root)).toBe(snapshot);
    expect(fs.readFileSync(hookErrorsPath(root), 'utf-8')).toBe(logSnapshot);
  });
});

// ---------------------------------------------------------------------------
// AC: Deep tier respects the trust ordering (cross-tier regression)
// ---------------------------------------------------------------------------
describe('AC: deep tier respects the trust ordering (cross-tier regression)', () => {
  it('a read-time row with needs_purpose_refresh:false is untouched by refresh-deep apply', async () => {
    const root = tmp('ac4');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const content = 'export const a = 1;\n';
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), content);
    writeFilesMd(root, [
      `| src/a.ts | (needs purpose) | ${computeTokens(content)} | ${computeSha256(content)} | ${SEEN} | - | true | - |`,
    ]);
    // The capture half writes the witnessed purpose…
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="src/a.ts">Witnessed while reading.</cortex:purpose>' },
    ]);
    await run(stdinFor(root, transcript), { now: NOW });
    const row = readFilesMdRows(root).find((r) => r.path === 'src/a.ts')!;
    expect(row.purposeSource).toBe('read-time');
    expect(row.flagged).toBe(false);

    // …then the deep tier runs with a (stale) worklist naming that path:
    // the lower-trust writer must defer, byte-identically.
    const pulseDir = path.join(root, '.cortex', 'pulse');
    fs.writeFileSync(
      path.join(pulseDir, '.purpose-worklist.json'),
      JSON.stringify({
        kind: 'purpose-worklist',
        generated: SEEN,
        batches: [[{ path: 'src/a.ts', tokens: computeTokens(content), excerpt: content, sha256: computeSha256(content) }]],
      }),
    );
    const before = filesMd(root);
    const app = applyPurposeResults(root, [{ path: 'src/a.ts', purpose: 'Scanner-derived overwrite.' }]);
    expect(app.applied).toBe(0);
    expect(app.deferred).toBe(1);
    expect(filesMd(root)).toBe(before);
  });

  it('a fresh collect does not even worklist the read-time row (flag is false)', async () => {
    const root = tmp('ac4b');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const content = 'export const a = 1;\n';
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), content);
    writeFilesMd(root, [
      `| src/a.ts | Witnessed while reading. | ${computeTokens(content)} | ${computeSha256(content)} | ${SEEN} | - | false | read-time |`,
    ]);
    const result = collectPurposeWorklist(root, NOW);
    expect(result.flagged).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC: No tags → no writes
// ---------------------------------------------------------------------------
describe('AC: no tags → no writes', () => {
  it('a tagless transcript writes nothing anywhere', async () => {
    const root = tmp('ac5');
    makeCortexProject(root);
    writeFilesMd(root, [`| src/a.ts | Does A. | 12 | ${SHA} | ${SEEN} | - | false | docstring |`]);
    const snapshot = filesMd(root);
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: 'Nothing to correct here — the purpose looked right.' },
    ]);
    const result = await run(stdinFor(root, transcript), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(filesMd(root)).toBe(snapshot);
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', READBACK_APPLIED_FILE))).toBe(false);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC: Transcript unavailable degrades silently
// ---------------------------------------------------------------------------
describe('AC: transcript unavailable degrades silently', () => {
  it('missing transcript_path → exit 0, empty stdout, one hook-errors entry', async () => {
    const root = tmp('ac6');
    makeCortexProject(root);
    writeFilesMd(root, [`| src/a.ts | Does A. | 12 | ${SHA} | ${SEEN} | - | false | docstring |`]);
    const stdin = stdinFor(root, '');
    delete stdin['transcript_path'];
    const result = await run(stdin, { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    expect(log.split('hook: post-read').length - 1).toBe(1);
    expect(log).toContain('transcript_path');
  });

  it('a transcript_path that does not exist on disk → same degradation', async () => {
    const root = tmp('ac6b');
    makeCortexProject(root);
    writeFilesMd(root, [`| src/a.ts | Does A. | 12 | ${SHA} | ${SEEN} | - | false | docstring |`]);
    const result = await run(stdinFor(root, path.join(root, 'nope.jsonl')), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.readFileSync(hookErrorsPath(root), 'utf-8')).toContain('transcript unreadable');
  });
});

// ---------------------------------------------------------------------------
// Rule 1: dispatch
// ---------------------------------------------------------------------------
describe('Rule 1: cortex hook post-read dispatches through the hook CLI', () => {
  it('runHook("post-read", …) applies the tag and stays silent', async () => {
    const root = tmp('dispatch');
    makeCortexProject(root);
    writeFilesMd(root, [`| src/a.ts | (needs purpose) | 12 | ${SHA} | ${SEEN} | - | true | - |`]);
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="src/a.ts">Dispatched purpose.</cortex:purpose>' },
    ]);
    const result = await runHook('post-read', JSON.stringify(stdinFor(root, transcript)));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    const row = readFilesMdRows(root).find((r) => r.path === 'src/a.ts')!;
    expect(row.purpose).toBe('Dispatched purpose.');
    expect(row.purposeSource).toBe('read-time');
  });
});
