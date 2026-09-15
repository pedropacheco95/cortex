/**
 * Shared fixtures for the SessionEnd / Stop hook tests (`hooks.session-end`)
 * and the record-side threads tests (`pulse.threads` Rules 3, 4, 8, 9).
 * Builds Claude Code-shaped JSONL transcripts with explicit timestamps, the
 * hook's stdin payloads, session records, companion files and read ledgers —
 * all inside a sandboxed tmp project. Never the real repo or `~/.claude`.
 *
 * Additive file: new helpers append below; nothing here is renamed or reordered.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { SessionRecord } from '../../src/pulse/threads.js';

/** A user or assistant text turn stamped with an explicit iso timestamp. */
export function turnAt(role: 'user' | 'assistant', text: string, timestamp: string): Record<string, unknown> {
  return {
    type: role,
    message: { role, content: [{ type: 'text', text }] },
    timestamp,
  };
}

/** An assistant turn carrying one `Write` or `Edit` tool use, stamped with a timestamp. */
export function fileToolTurnAt(
  tool: 'Write' | 'Edit',
  filePath: string,
  timestamp: string,
  extraInput: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu_0', name: tool, input: { file_path: filePath, ...extraInput } }],
    },
    timestamp,
  };
}

/** Write entries as one JSON object per line to `<dir>/<name>`; returns the path. */
export function writeTranscriptFile(dir: string, entries: Record<string, unknown>[], name = 'transcript.jsonl'): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
  return p;
}

/** The hook's stdin payload in Claude Code's observed shape (`hooks.session-end` Notes). */
export function sessionEndStdin(
  root: string,
  transcriptPath: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    hook_event_name: 'SessionEnd',
    session_id: 'sess-end',
    transcript_path: transcriptPath,
    cwd: root,
    reason: 'other',
    ...extra,
  };
}

/** Absolute path of a session record in a fixture root. */
export function sessionRecordPath(root: string, sessionId: string): string {
  return path.join(root, '.cortex', 'pulse', 'sessions', `${sessionId}.json`);
}

/** Parse a written session record, or null when absent. */
export function readSessionRecord(root: string, sessionId: string): SessionRecord | null {
  const p = sessionRecordPath(root, sessionId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as SessionRecord;
}

/** Write a session record verbatim (for the Rule 9c "newest prior record" fixtures). */
export function writeSessionRecordFixture(root: string, record: SessionRecord): string {
  const p = sessionRecordPath(root, record.session_id);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(record, null, 2) + '\n', 'utf-8');
  return p;
}

/** Absolute path of the Stop companion file for a session id. */
export function companionPathOf(root: string, sessionId: string): string {
  return path.join(root, '.cortex', 'pulse', 'state', 'sessions', `${sessionId}.last.json`);
}

/** Write a Stop companion file `{ text, at }`. */
export function writeCompanion(root: string, sessionId: string, text: string, at: string): string {
  const p = companionPathOf(root, sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ text, at }), 'utf-8');
  return p;
}

/** Write a read ledger `pulse/state/reads/<session-id>`, one path per line. */
export function writeReadLedger(root: string, sessionId: string, lines: string[]): string {
  const p = path.join(root, '.cortex', 'pulse', 'state', 'reads', sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, lines.join('\n') + '\n', 'utf-8');
  return p;
}

/** Absolute path of the scratch copy directory for a session. */
export function scratchDirOf(root: string, sessionId: string): string {
  return path.join(root, '.cortex', 'pulse', 'scratch', sessionId);
}

/** A complete, empty-by-default session record; every field overridable. */
export function makeSessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const sessionId = overrides.session_id ?? 's1';
  return {
    kind: 'pulse-session-record',
    session_id: sessionId,
    session: overrides.session ?? `claude-sessions/fixture-user/${sessionId}`,
    title: null,
    session_kind: 'interactive',
    ended: '2026-09-15T10:00:00.000Z',
    reason: 'other',
    partial: false,
    open_question: null,
    approvals: [],
    findings: [],
    artefacts: [],
    reads: null,
    threads_opened: [],
    threads_answered: [],
    ...overrides,
  };
}

/**
 * Write a transcript whose head, filler and tail are laid out to a target
 * size: `head` entries first, then `{"type":"progress"}` filler lines of
 * roughly `fillerLineBytes` each until `targetBytes` is reached, then `tail`
 * entries. Returns the path and the final byte size.
 */
export function writeLargeTranscript(
  dir: string,
  opts: {
    head: Record<string, unknown>[];
    tail: Record<string, unknown>[];
    targetBytes: number;
    fillerLineBytes?: number;
    name?: string;
  },
): { path: string; size: number } {
  const p = path.join(dir, opts.name ?? 'large.jsonl');
  const fillerLineBytes = opts.fillerLineBytes ?? 4096;
  const fd = fs.openSync(p, 'w');
  let written = 0;
  const writeLine = (line: string): void => {
    written += fs.writeSync(fd, line + '\n');
  };
  for (const e of opts.head) writeLine(JSON.stringify(e));
  const tailText = opts.tail.map((e) => JSON.stringify(e)).join('\n') + '\n';
  const filler = JSON.stringify({ type: 'progress', data: 'x'.repeat(fillerLineBytes) });
  while (written + Buffer.byteLength(filler) + 1 + Buffer.byteLength(tailText) < opts.targetBytes) {
    writeLine(filler);
  }
  written += fs.writeSync(fd, tailText);
  fs.closeSync(fd);
  return { path: p, size: written };
}

/**
 * Write a sparse transcript of `totalBytes`: `head` entries at offset 0, the
 * `tail` entries ending exactly at `totalBytes`, and unwritten (zero) bytes
 * between. The tail is preceded by a newline so the bounded-tail reader's
 * partial-line drop lands on it. Sparse on APFS, so it costs no disk.
 */
export function writeSparseTranscript(
  dir: string,
  opts: { head: Record<string, unknown>[]; tail: Record<string, unknown>[]; totalBytes: number; name?: string },
): string {
  const p = path.join(dir, opts.name ?? 'sparse.jsonl');
  const headText = opts.head.map((e) => JSON.stringify(e)).join('\n') + '\n';
  const tailText = '\n' + opts.tail.map((e) => JSON.stringify(e)).join('\n') + '\n';
  const fd = fs.openSync(p, 'w');
  fs.writeSync(fd, headText, 0);
  const tailBuf = Buffer.from(tailText, 'utf-8');
  fs.writeSync(fd, tailBuf, 0, tailBuf.length, opts.totalBytes - tailBuf.length);
  fs.closeSync(fd);
  return p;
}
