/**
 * SessionEnd hook — `cortex hook session-end` (spec hooks.session-end;
 * schema §4.5.3 "The session record"; §5).
 *
 * When Claude Code fires `SessionEnd`, read the transcript **once**,
 * deterministically, and write one session record at
 * `.cortex/pulse/sessions/<session-id>.json`: the header (title, session
 * kind, citation, reason), the hanging question or offer, the approvals with
 * what they approved, tagged and lexicon findings, and the scratchpad
 * artefacts copied under `pulse/scratch/<session-id>/`. The record is then
 * handed to `pulse.threads` — threads are opened for what it carries and
 * threads open before this run are marked answered by it — and the ids land
 * in the record. The Stop companion's file (`stop.ts`) supplies the last
 * assistant message when the transcript lagged, and is deleted afterwards.
 *
 * Bounded read (Rule 5): message-level extraction runs over the last 2 MiB
 * only; a cheap whole-file prefix scan parses just the lines carrying a
 * trigger substring (title, tool_use, finding tag, an open thread id) plus the
 * first user line, skipping lines over 256 KiB, and is skipped entirely past
 * 64 MiB. `partial` says when something may have been lost.
 *
 * Always silent, always exit 0, fail-open on every path (Rules 2, 3): at most
 * one `hook-errors.md` entry per degradation. Nothing is injected anywhere.
 * Pure Node file I/O — no network, no LLM, no subprocess (Rule 10; R-001).
 * Writes only under `.cortex/pulse/` (RULES.md rule 7).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { parseSessionJsonl, extractMessages, extractToolUses, sessionTitle } from '../sessions/read.js';
import type { ExtractedMessage, ExtractedToolUse, SessionEntry } from '../sessions/read.js';
import { sessionKind as detectSessionKind } from '../pulse/distil.js';
import type { SessionKind } from '../pulse/distil.js';
import { provenanceUser } from '../insight/session-observe.js';
import {
  listThreads,
  openThreadsFromRecord,
  detectAnswered,
  scratchCopyBasename,
} from '../pulse/threads.js';
import type {
  SessionRecord,
  SessionRecordOpenQuestion,
  SessionRecordApproval,
  SessionRecordFinding,
  SessionRecordArtefact,
} from '../pulse/threads.js';
import { readTranscriptTail } from './post-read.js';
import { readsMemoryPath } from './pre-read.js';
import { stopStatePath } from './stop.js';
import { appendHookError } from './errors.js';
import type { HookRunResult, HookRunOptions } from './session-start.js';

const HOOK_NAME = 'session-end';

// ---------------------------------------------------------------------------
// engineering-call constants (Rule 5, Rule 7 — quoted in the spec; pinned by tests)
// ---------------------------------------------------------------------------

/** A line longer than this is never JSON-parsed by the prefix pass. */
export const SESSION_END_LINE_BYTES = 256 * 1024;
/** The message pass parses only the last this-many bytes of the transcript. */
export const SESSION_END_TAIL_BYTES = 2 * 1024 * 1024;
/** Past this file size the prefix pass is skipped entirely (the tail still runs). */
export const SESSION_END_MAX_BYTES = 64 * 1024 * 1024;
/** Fixed substrings that make the prefix pass parse a line (plus open thread ids). */
export const PREFIX_TRIGGERS = ['"custom-title"', '"tool_use"', '<cortex:finding'];
/** The raw marker of the first user line (parsed once, for `session_kind`). */
const FIRST_USER_TRIGGER = '"type":"user"';

/** Rule 7a: an assistant paragraph that offers something. */
export const OFFER_RE = /\b(want me to|shall i|on request|if you want|i can\b[^.]{0,80}?\bif you|say the word)\b/i;
/** Rule 7b: a user message that approves. */
export const APPROVAL_RE = /\b(approved|go ahead|let'?s go with|yes,? do it|ship it|proceed)\b/i;
/** Rule 7c: an untagged sentence that states a measurement. */
export const MEASUREMENT_RE = /\bover \d+ sessions\b|\d+(\.\d+)?[x×] (cheaper|faster)|\bmedian\b|\bmeasured\b/i;
/** Rule 7c: the `<cortex:finding>` tag — single line, 1–300 characters. */
export const FINDING_TAG_RE =
  /<cortex:finding\s+kind="(measurement|conclusion)"(?:\s+bears_on="([^"]*)")?\s*>([^\n<]{1,300})<\/cortex:finding>/g;

/** Caps from §4.5.3. */
const TEXT_CAP = 600;
const FINDING_CAP = 300;
const LIST_CAP = 20;
const ARTEFACT_MAX_BYTES = 64 * 1024;
const ARTEFACT_SNIFF_BYTES = 8 * 1024;

const SILENT: HookRunResult = { exitCode: 0, stdout: '' };

// ---------------------------------------------------------------------------
// Rule 5 — the two-pass bounded read
// ---------------------------------------------------------------------------

export interface TranscriptRead {
  /** Entries parsed from the last SESSION_END_TAIL_BYTES (the message pass). */
  tailEntries: SessionEntry[];
  /** Entries parsed by the prefix pass — trigger lines only, whole file. */
  prefixEntries: SessionEntry[];
  /** The first `"type":"user"` line that carries a user text message, if any. */
  firstUserEntry: SessionEntry | null;
  /** True when the tail did not cover the file, the prefix pass was skipped, or a bulk line was. */
  partial: boolean;
}

function parseLine(line: string): SessionEntry | null {
  return parseSessionJsonl(line).entries[0] ?? null;
}

/**
 * (a) tail: `readTranscriptTail` → `parseSessionJsonl`; (b) prefix: stream
 * every line, parse only trigger lines (`PREFIX_TRIGGERS` and `openThreadIds`)
 * and the first user line, skip lines over SESSION_END_LINE_BYTES, skip the
 * whole pass past SESSION_END_MAX_BYTES. Throws only when the file cannot be
 * stat'ed or read at all (the caller logs and degrades).
 */
export async function readTranscript(filePath: string, openThreadIds: string[]): Promise<TranscriptRead> {
  const size = fs.statSync(filePath).size;
  const tailEntries = parseSessionJsonl(readTranscriptTail(filePath, SESSION_END_TAIL_BYTES)).entries;
  let partial = size > SESSION_END_TAIL_BYTES;
  const prefixEntries: SessionEntry[] = [];
  let firstUserEntry: SessionEntry | null = null;

  if (size > SESSION_END_MAX_BYTES) {
    return { tailEntries, prefixEntries, firstUserEntry, partial: true };
  }

  const triggers = [...PREFIX_TRIGGERS, ...openThreadIds];
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (line.length === 0) continue;
      if (Buffer.byteLength(line, 'utf-8') > SESSION_END_LINE_BYTES) {
        partial = true;
        continue;
      }
      let parsed: SessionEntry | null | undefined;
      if (firstUserEntry === null && line.includes(FIRST_USER_TRIGGER)) {
        parsed = parseLine(line);
        if (parsed !== null && extractMessages([parsed]).some((m) => m.role === 'user')) firstUserEntry = parsed;
      }
      if (triggers.some((t) => line.includes(t))) {
        if (parsed === undefined) parsed = parseLine(line);
        if (parsed !== null) prefixEntries.push(parsed);
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return { tailEntries, prefixEntries, firstUserEntry, partial };
}

// ---------------------------------------------------------------------------
// Rule 7 — text extractors (pure)
// ---------------------------------------------------------------------------

/** The final blank-line-separated block of a text, trimmed. */
export function lastParagraph(text: string): string {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  return blocks[blocks.length - 1] ?? '';
}

/** The first `n` characters. */
export function cap(text: string, n: number): string {
  return text.length > n ? text.slice(0, n) : text;
}

function isoMs(value: string | undefined | null): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Rule 7a: the companion is fresher when its `at` is later than every tail message timestamp. */
function companionFresher(at: string, tail: ExtractedMessage[]): boolean {
  const atMs = isoMs(at);
  if (atMs === null) return false;
  for (const m of tail) {
    const ms = isoMs(m.timestamp);
    if (ms !== null && ms >= atMs) return false;
  }
  return true;
}

/**
 * Rule 7a: the candidate is the companion's text when it is fresher than the
 * tail, else the last assistant text with no user message after it; its final
 * paragraph is recorded when it ends with `?` (question) or matches the offer
 * lexicon (offer). `null` otherwise.
 */
export function extractOpenQuestion(
  tailMessages: ExtractedMessage[],
  companion: { text: string; at: string } | null,
): SessionRecordOpenQuestion | null {
  let candidate: { text: string; timestamp: string | null; source: 'stop' | 'transcript' } | null = null;
  if (companion !== null && companionFresher(companion.at, tailMessages)) {
    candidate = { text: companion.text, timestamp: companion.at, source: 'stop' };
  } else {
    let lastAssistant = -1;
    for (let i = 0; i < tailMessages.length; i++) {
      if (tailMessages[i]?.role === 'assistant') lastAssistant = i;
    }
    if (lastAssistant >= 0 && !tailMessages.slice(lastAssistant + 1).some((m) => m.role === 'user')) {
      const m = tailMessages[lastAssistant] as ExtractedMessage;
      candidate = { text: m.text, timestamp: m.timestamp ?? null, source: 'transcript' };
    }
  }
  if (candidate === null) return null;
  const paragraph = lastParagraph(candidate.text);
  if (paragraph === '') return null;
  let kind: 'question' | 'offer';
  if (paragraph.endsWith('?')) kind = 'question';
  else if (OFFER_RE.test(paragraph)) kind = 'offer';
  else return null;
  return { kind, text: cap(paragraph, TEXT_CAP), timestamp: candidate.timestamp, source: candidate.source };
}

/**
 * Rule 7b: every user message matching the approval lexicon whose immediately
 * preceding message is an assistant text, paired with that text's final
 * paragraph. First LIST_CAP in order.
 */
export function extractApprovals(tailMessages: ExtractedMessage[]): SessionRecordApproval[] {
  const out: SessionRecordApproval[] = [];
  for (let i = 0; i < tailMessages.length && out.length < LIST_CAP; i++) {
    const m = tailMessages[i] as ExtractedMessage;
    if (m.role !== 'user' || !APPROVAL_RE.test(m.text)) continue;
    const prev = i > 0 ? tailMessages[i - 1] : undefined;
    if (prev === undefined || prev.role !== 'assistant') continue;
    out.push({
      approval: cap(m.text.trim(), TEXT_CAP),
      approved: cap(lastParagraph(prev.text), TEXT_CAP),
      timestamp: m.timestamp ?? null,
    });
  }
  return out;
}

/** Rule 7c sentence split: `. `, `! `, `? ` and newlines. */
function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?]) |\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Rule 7c: `<cortex:finding>` tags in assistant text of the prefix pass
 * (source `tag`), then — interactive sessions only — untagged measurement
 * sentences in the tail's assistant text (source `lexicon`). Combined cap LIST_CAP.
 */
export function extractFindings(
  prefixMessages: ExtractedMessage[],
  tailMessages: ExtractedMessage[],
  sessionKind: SessionKind,
): SessionRecordFinding[] {
  const out: SessionRecordFinding[] = [];
  for (const m of prefixMessages) {
    if (m.role !== 'assistant') continue;
    for (const hit of m.text.matchAll(FINDING_TAG_RE)) {
      const kind = hit[1] as 'measurement' | 'conclusion';
      const bearsOn = (hit[2] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      out.push({ kind, text: hit[3] ?? '', bears_on: bearsOn, timestamp: m.timestamp ?? null, source: 'tag' });
    }
  }
  if (sessionKind === 'interactive') {
    for (const m of tailMessages) {
      if (m.role !== 'assistant') continue;
      // "Untagged" measurements: a tagged sentence is never counted twice.
      for (const sentence of sentencesOf(m.text.replace(FINDING_TAG_RE, ''))) {
        if (!/\d/.test(sentence) || !MEASUREMENT_RE.test(sentence)) continue;
        out.push({ kind: 'measurement', text: cap(sentence, FINDING_CAP), timestamp: m.timestamp ?? null, source: 'lexicon' });
      }
    }
  }
  return out.slice(0, LIST_CAP);
}

// ---------------------------------------------------------------------------
// Rule 8 — scratchpad artefacts
// ---------------------------------------------------------------------------

function firstHeading(content: string): string | null {
  const m = content.match(/^#{1,6}\s+(.+)$/m);
  return m === null ? null : (m[1] ?? '').trim();
}

/**
 * Rule 8: the deduplicated Write/Edit targets under `scratchpadDir` (path-prefix
 * match) or — without it — containing a `/scratchpad/` segment, capped at
 * LIST_CAP; each existing text file of at most 64 KiB is copied to
 * `.cortex/pulse/scratch/<session-id>/<basename>` (`-2`, `-3` on a basename
 * clash) and records its first markdown heading. The copy directory is created
 * only when a copy succeeds.
 */
export function collectArtefacts(
  root: string,
  sessionId: string,
  toolUses: ExtractedToolUse[],
  scratchpadDir?: string,
): SessionRecordArtefact[] {
  const prefix = typeof scratchpadDir === 'string' && scratchpadDir !== '' ? path.resolve(scratchpadDir) + path.sep : null;
  const paths: string[] = [];
  for (const u of toolUses) {
    if ((u.name !== 'Write' && u.name !== 'Edit') || typeof u.filePath !== 'string' || u.filePath === '') continue;
    const keep = prefix !== null ? path.resolve(u.filePath).startsWith(prefix) : u.filePath.includes('/scratchpad/');
    if (!keep || paths.includes(u.filePath)) continue;
    paths.push(u.filePath);
    if (paths.length === LIST_CAP) break;
  }

  const copyDir = path.join(root, '.cortex', 'pulse', 'scratch', sessionId);
  const seen = new Map<string, number>();
  return paths.map((p) => {
    const base = path.basename(p);
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    try {
      const stat = fs.statSync(p);
      if (!stat.isFile() || stat.size > ARTEFACT_MAX_BYTES) return { path: p, copied: false, first_heading: null };
      const content = fs.readFileSync(p);
      if (content.subarray(0, ARTEFACT_SNIFF_BYTES).includes(0)) return { path: p, copied: false, first_heading: null };
      fs.mkdirSync(copyDir, { recursive: true });
      fs.writeFileSync(path.join(copyDir, scratchCopyBasename(base, occurrence)), content);
      return { path: p, copied: true, first_heading: firstHeading(content.toString('utf-8')) };
    } catch {
      return { path: p, copied: false, first_heading: null };
    }
  });
}

// ---------------------------------------------------------------------------
// Rules 3, 4, 6, 9, 11 — the hook
// ---------------------------------------------------------------------------

function safeSegment(sessionId: string): string {
  return sessionId.replace(/[/\\\s]+/g, '-') || 'unknown';
}

/** The Stop companion's `{ text, at }`, or null when absent or malformed. */
function readCompanion(file: string): { text: string; at: string } | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as { text?: unknown; at?: unknown };
    if (typeof parsed.text === 'string' && typeof parsed.at === 'string') return { text: parsed.text, at: parsed.at };
  } catch {
    /* absent or unreadable → no companion */
  }
  return null;
}

function optionalString(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

export async function run(stdinJson: unknown, opts?: HookRunOptions): Promise<HookRunResult> {
  const now = opts?.now ?? new Date();
  try {
    const stdin = (typeof stdinJson === 'object' && stdinJson !== null ? stdinJson : {}) as Record<string, unknown>;
    const root = path.resolve(optionalString(stdin['cwd']) ?? opts?.cwd ?? process.cwd());
    if (!fs.existsSync(path.join(root, '.cortex'))) return SILENT;

    // Rule 3: every stdin field is optional; the transcript is the one thing we cannot do without.
    const transcriptPath = optionalString(stdin['transcript_path']);
    if (transcriptPath === undefined) {
      appendHookError(root, { hook: HOOK_NAME, file: '(transcript)', failure: 'stdin carried no transcript_path; no record written' }, now);
      return SILENT;
    }
    const sessionId = safeSegment(optionalString(stdin['session_id']) ?? path.basename(transcriptPath, '.jsonl'));
    const reason = optionalString(stdin['reason']) ?? 'unknown';
    const scratchpadDir = optionalString(stdin['scratchpad_dir']);

    // Threads open before this run: their ids are prefix triggers (Rule 5b) and
    // the only candidates for answered detection (pulse.threads Rule 9).
    const openBefore = listThreads(root).threads.filter((t) => t.status === 'open');

    let read: TranscriptRead;
    try {
      read = await readTranscript(transcriptPath, openBefore.map((t) => t.id));
    } catch (err) {
      appendHookError(root, { hook: HOOK_NAME, file: transcriptPath, failure: `transcript unreadable: ${(err as Error).message}` }, now);
      return SILENT;
    }
    if (read.tailEntries.length === 0 && read.prefixEntries.length === 0) {
      appendHookError(root, { hook: HOOK_NAME, file: transcriptPath, failure: 'transcript parsed to zero entries; no record written' }, now);
      return SILENT;
    }

    // Rule 6 — header fields.
    const tailMessages = extractMessages(read.tailEntries);
    const prefixMessages = extractMessages(read.prefixEntries);
    const firstUserMessages = read.firstUserEntry === null ? [] : extractMessages([read.firstUserEntry]);
    const kindSource = firstUserMessages.some((m) => m.role === 'user') ? firstUserMessages : tailMessages;
    const sessionKind = detectSessionKind(kindSource);
    const firstUserText = kindSource.find((m) => m.role === 'user')?.text ?? null;
    const citation = `claude-sessions/${provenanceUser()}/${sessionId}`;
    const readsPath = readsMemoryPath(root, sessionId);
    const reads = fs.existsSync(readsPath) ? path.relative(root, readsPath).split(path.sep).join('/') : null;

    // Rules 7, 8 — the extractors.
    const companionFile = stopStatePath(root, sessionId);
    const record: SessionRecord = {
      kind: 'pulse-session-record',
      session_id: sessionId,
      session: citation,
      title: sessionTitle(read.prefixEntries) ?? null,
      session_kind: sessionKind,
      ended: now.toISOString(),
      reason,
      partial: read.partial,
      open_question: extractOpenQuestion(tailMessages, readCompanion(companionFile)),
      approvals: extractApprovals(tailMessages),
      findings: extractFindings(prefixMessages, tailMessages, sessionKind),
      artefacts: collectArtefacts(root, sessionId, extractToolUses(read.prefixEntries), scratchpadDir),
      reads,
      threads_opened: [],
      threads_answered: [],
    };

    // Rule 9 — the thread step never blocks the record.
    try {
      record.threads_opened = openThreadsFromRecord(root, record, now);
    } catch (err) {
      appendHookError(root, { hook: HOOK_NAME, file: '.cortex/pulse/threads', failure: `thread opening failed: ${(err as Error).message}` }, now);
      record.threads_opened = [];
    }
    try {
      record.threads_answered = detectAnswered(root, {
        sessionId,
        citation,
        sessionKind,
        messages: [...prefixMessages, ...tailMessages],
        firstUserText,
        ended: record.ended,
        openBefore,
      });
    } catch (err) {
      appendHookError(root, { hook: HOOK_NAME, file: '.cortex/pulse/threads', failure: `answered detection failed: ${(err as Error).message}` }, now);
      record.threads_answered = [];
    }

    // Rule 4 — one record, overwritten on a re-fire; Rule 7a — the companion is consumed.
    const recordPath = path.join(root, '.cortex', 'pulse', 'sessions', `${sessionId}.json`);
    fs.mkdirSync(path.dirname(recordPath), { recursive: true });
    const tmp = path.join(path.dirname(recordPath), `.${sessionId}.${process.pid}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmp, recordPath);
    fs.rmSync(companionFile, { force: true });
    return SILENT;
  } catch (err) {
    // Rule 2: always silent, always exit 0 — even on an internal crash.
    try {
      appendHookError(path.resolve(opts?.cwd ?? process.cwd()), { hook: HOOK_NAME, file: '(unknown)', failure: (err as Error).message }, now);
    } catch {
      /* swallowed */
    }
    return SILENT;
  }
}
