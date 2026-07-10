/**
 * Spec tests — hooks.post-read, re-pointed to the insight per-file entry
 * (anatomy deprecation, build-order-v3 step 7): every Acceptance Criterion as
 * a labeled describe, end-to-end through run(stdinJson) over tmp fixture
 * projects with synthetic JSONL transcripts (never the real ~/.claude).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { run, READBACK_APPLIED_FILE, READ_TIME_MARKER } from '../../../src/hooks/post-read.js';
import { run as runPreRead } from '../../../src/hooks/pre-read.js';
import { runHook } from '../../../src/hooks/cli.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeInsightEntry,
  insightEntryPath,
  readInsightEntry,
  parseEnvelope,
  hookErrorsPath,
} from '../../fixtures/hooks-harness.js';

const NOW = new Date('2026-07-03T10:00:00.000Z');
const SEEN = '2026-06-30T14:00:00.000Z';

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

/** The §6 provenance ref the hook writes for session 'sess-pr'. */
function expectedProvenance(): string {
  let user = 'unknown';
  try {
    user = os.userInfo().username || 'unknown';
  } catch {
    /* keep 'unknown' */
  }
  return `claude-sessions/${user.replace(/[/\s)]+/g, '-') || 'unknown'}/sess-pr`;
}

// ---------------------------------------------------------------------------
// AC: Tag captured and applied to the entry with read-time provenance
// ---------------------------------------------------------------------------
describe('AC: tag captured and applied to the insight entry with provenance', () => {
  it('Purpose section replaced with the corrected line + read-time trailer; frontmatter and other sections byte-identical; silent envelope', async () => {
    const root = tmp('ac1');
    makeCortexProject(root);
    writeInsightEntry(root, 'src/a.ts', {
      purpose: 'Stale extraction purpose.',
      connections: '- imports src/b.ts (import, high)',
    });
    writeInsightEntry(root, 'src/b.ts', { purpose: 'Sibling.' });
    const before = readInsightEntry(root, 'src/a.ts')!;
    const siblingBefore = readInsightEntry(root, 'src/b.ts')!;
    const transcript = writeTranscript(root, [
      { role: 'user', text: 'read that file please' },
      { role: 'assistant', text: 'Looking… <cortex:purpose file="src/a.ts">Parses insight entries.</cortex:purpose> done.' },
    ]);

    const result = await run(stdinFor(root, transcript), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' }); // always silent

    const after = readInsightEntry(root, 'src/a.ts')!;
    // The Purpose section is exactly: blank, purpose, blank, trailer, blank.
    expect(after).toContain(
      `## Purpose\n\nParses insight entries.\n\n*(read-time, ${expectedProvenance()})*\n`,
    );
    expect(after).not.toContain('Stale extraction purpose.');
    // Frontmatter (extraction metadata) untouched, byte for byte:
    expect(after.slice(0, after.indexOf('## Purpose'))).toBe(before.slice(0, before.indexOf('## Purpose')));
    // Every other section untouched, byte for byte:
    expect(after.slice(after.indexOf('## Connections'))).toBe(before.slice(before.indexOf('## Connections')));
    // Sibling entry byte-identical:
    expect(readInsightEntry(root, 'src/b.ts')).toBe(siblingBefore);
  });

  it('the applied marker then suppresses PreRead’s invitation (the refine-during-use loop closes)', async () => {
    const root = tmp('ac1b');
    makeCortexProject(root, {
      config: { schemaVersion: '3.0', hooks: { preRead: true }, loop: { enabled: false } },
    });
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Old purpose.' });
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="src/a.ts">Corrected purpose.</cortex:purpose>' },
    ]);
    await run(stdinFor(root, transcript), { now: NOW });
    expect(readInsightEntry(root, 'src/a.ts')).toContain(READ_TIME_MARKER);

    const preRead = await runPreRead({
      session_id: 'sess-later',
      cwd: root,
      tool_name: 'Read',
      tool_input: { file_path: path.join(root, 'src/a.ts') },
    });
    const ctx = parseEnvelope(preRead.stdout).additionalContext;
    expect(ctx).toContain('src/a.ts: Corrected purpose.');
    expect(ctx).not.toContain('<cortex:purpose');
  });
});

// ---------------------------------------------------------------------------
// AC: Same tag not applied twice in a session
// ---------------------------------------------------------------------------
describe('AC: same tag not applied twice in a session', () => {
  it('after the tag is applied and recorded, a later fire leaves the entry byte-identical', async () => {
    const root = tmp('ac2');
    makeCortexProject(root);
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Original.' });
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="src/a.ts">Parses insight entries.</cortex:purpose>' },
    ]);
    await run(stdinFor(root, transcript), { now: NOW });
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', 'state', READBACK_APPLIED_FILE))).toBe(true);
    const snapshot = readInsightEntry(root, 'src/a.ts');

    const later = await run(stdinFor(root, transcript), { now: new Date(NOW.getTime() + 60_000) });
    expect(later).toEqual({ exitCode: 0, stdout: '' });
    expect(readInsightEntry(root, 'src/a.ts')).toBe(snapshot); // byte-identical
  });
});

// ---------------------------------------------------------------------------
// AC: Invalid tags rejected without noise
// ---------------------------------------------------------------------------
describe('AC: invalid tags rejected without noise', () => {
  it('entry-less file, multi-line payload, and 300-char payload: no entry changes, one hook-errors entry each, never retried', async () => {
    const root = tmp('ac3');
    makeCortexProject(root);
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    const snapshot = readInsightEntry(root, 'src/a.ts');
    const transcript = writeTranscript(root, [
      {
        role: 'assistant',
        text:
          '<cortex:purpose file="src/unknown.ts">No such entry.</cortex:purpose> ' +
          '<cortex:purpose file="src/a.ts">line one\nline two</cortex:purpose> ' +
          `<cortex:purpose file="src/a.ts">${'x'.repeat(300)}</cortex:purpose>`,
      },
    ]);

    await run(stdinFor(root, transcript), { now: NOW });
    expect(readInsightEntry(root, 'src/a.ts')).toBe(snapshot); // no entry changed
    // Rejection never fabricates an entry — extraction owns creation:
    expect(fs.existsSync(insightEntryPath(root, 'src/unknown.ts'))).toBe(false);
    const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    expect(log.split('hook: post-read').length - 1).toBe(3); // one entry per invalid tag
    expect(log).toContain('no insight entry (extraction owns entry creation)');
    expect(log).toContain('invalid');

    // Never retried: a later fire adds no new entries and changes nothing.
    const logSnapshot = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    await run(stdinFor(root, transcript), { now: new Date(NOW.getTime() + 60_000) });
    expect(readInsightEntry(root, 'src/a.ts')).toBe(snapshot);
    expect(fs.readFileSync(hookErrorsPath(root), 'utf-8')).toBe(logSnapshot);
  });
});

// ---------------------------------------------------------------------------
// AC: Unextracted project is a silent no-op
// ---------------------------------------------------------------------------
describe('AC: unextracted project is a silent no-op', () => {
  it('no .cortex/insight/ → exit 0, empty stdout, nothing written, no pulse entry', async () => {
    const root = tmp('ac4');
    makeCortexProject(root, { modules: ['compass', 'atlas', 'pulse'] });
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="src/a.ts">Landed nowhere.</cortex:purpose>' },
    ]);
    const result = await run(stdinFor(root, transcript), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(insightEntryPath(root, 'src/a.ts'))).toBe(false);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', 'state', READBACK_APPLIED_FILE))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC: No tags → no writes
// ---------------------------------------------------------------------------
describe('AC: no tags → no writes', () => {
  it('a tagless transcript writes nothing anywhere', async () => {
    const root = tmp('ac5');
    makeCortexProject(root);
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    const snapshot = readInsightEntry(root, 'src/a.ts');
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: 'Nothing to correct here — the purpose looked right.' },
    ]);
    const result = await run(stdinFor(root, transcript), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(readInsightEntry(root, 'src/a.ts')).toBe(snapshot);
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', 'state', READBACK_APPLIED_FILE))).toBe(false);
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
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
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
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
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
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Predecessor.' });
    const transcript = writeTranscript(root, [
      { role: 'assistant', text: '<cortex:purpose file="src/a.ts">Dispatched purpose.</cortex:purpose>' },
    ]);
    const result = await runHook('post-read', JSON.stringify(stdinFor(root, transcript)));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    const entry = readInsightEntry(root, 'src/a.ts')!;
    expect(entry).toContain('Dispatched purpose.');
    expect(entry).toContain(READ_TIME_MARKER);
  });
});
