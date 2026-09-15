/**
 * Threads ledger primitives (schema §4.5.3; `pulse.threads` Rules 1, 2, 5, 7).
 *
 * A thread is one thing a session left unresolved — a question, an offer, an
 * approval, a finding or a scratchpad artefact — kept as one markdown file at
 * `.cortex/pulse/threads/T-NNN-<slug>.md` with a lifecycle
 * `open → answered | dropped | expired`. This module owns the file contract
 * (parse / serialise, byte-stable round trip), the `T-` id allocator (its own
 * counter, never `suggestion-counter`), the normalised dedupe key, and the
 * writer. Opening threads from a session record, dedupe against open threads
 * and answered detection build on these in the same file (batch 1); the
 * `cortex thread` verbs live in `thread-cli.ts` (batch 2).
 *
 * Deterministic Core (R-001): fs/path/gray-matter only; writes stay under
 * `.cortex/pulse/`.
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { normaliseText } from './distil.js';
import { decisionSlug } from '../insight/session-observe.js';
import type { ExtractedMessage } from '../sessions/read.js';
import type { SessionKind } from './distil.js';

export const THREAD_KINDS = ['question', 'offer', 'approval', 'finding', 'artefact'] as const;
export const THREAD_STATUSES = ['open', 'answered', 'dropped', 'expired'] as const;
/** `expires` = `opened` + this many days (engineering call, spec Rule 1). */
export const THREAD_TTL_DAYS = 30;
/** Ledger directory, relative to `.cortex/`. */
export const THREADS_DIR = 'pulse/threads';
/** The `T-` allocator's counter file, under `pulse/state/` (its own namespace). */
export const THREAD_COUNTER_FILE = 'thread-counter';

export type ThreadKind = (typeof THREAD_KINDS)[number];
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

/** One ledger file, frontmatter fields in §4.5.3 order plus the verbatim body. */
export interface Thread {
  id: string;
  kind: ThreadKind;
  status: ThreadStatus;
  /** iso-datetime */
  opened: string;
  /** `claude-sessions/<user>/<session-id>` citation of the opening session (§6). */
  session: string;
  /** Every session that raised this thread, opener first. */
  sessions: string[];
  /** Project-relative paths and bare ids; may be empty. */
  bears_on: string[];
  /** iso-datetime, `opened` + THREAD_TTL_DAYS. */
  expires: string;
  /** iso-datetime; present iff `status: answered`. */
  answered?: string;
  /** Project-relative path or `claude-sessions/…` citation; present iff answered. */
  resolved_by?: string;
  /** The verbatim text (spec Rule 6), without the file's trailing newline. */
  body: string;
}

const THREAD_ID_RE = /^T-\d{3,}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// paths
// ---------------------------------------------------------------------------

function threadsDir(root: string): string {
  return path.join(root, '.cortex', ...THREADS_DIR.split('/'));
}

function counterPath(root: string): string {
  return path.join(root, '.cortex', 'pulse', 'state', THREAD_COUNTER_FILE);
}

/** Absolute path of the ledger file for `id` (`<id>-*.md`), or null when none exists. */
export function threadPath(root: string, id: string): string | null {
  const dir = threadsDir(root);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const name = names.filter((f) => f.startsWith(`${id}-`) && f.endsWith('.md')).sort()[0];
  return name === undefined ? null : path.join(dir, name);
}

// ---------------------------------------------------------------------------
// slug, filename, expiry (Rule 5)
// ---------------------------------------------------------------------------

/** Rule 5: `decisionSlug`'s derivation over the key text, with fallback `thread`. */
export function threadSlug(text: string): string {
  if (!/[a-z0-9]/i.test(text)) return 'thread';
  return decisionSlug({ title: text });
}

/** `<id>-<slug>.md`, the slug taken from the thread's key text. */
export function threadFilename(t: Thread): string {
  return `${t.id}-${threadSlug(keyText(t))}.md`;
}

/** `opened` + THREAD_TTL_DAYS as an iso-datetime. */
export function threadExpires(opened: string | Date): string {
  const ms = opened instanceof Date ? opened.getTime() : Date.parse(opened);
  return new Date(ms + THREAD_TTL_DAYS * DAY_MS).toISOString();
}

// ---------------------------------------------------------------------------
// body builders and the key (Rules 6, 7)
// ---------------------------------------------------------------------------

/** Rule 6 approval body: `**Approved:** <approved>` / `**By:** <approval>`. */
export function approvalBody(approved: string, approval: string): string {
  return `**Approved:** ${approved}\n**By:** ${approval}`;
}

/** Rule 6 finding body: the text, then `**Kind:**` and `**Source:**` on their own lines. */
export function findingBody(
  text: string,
  kind: 'measurement' | 'conclusion',
  source: 'tag' | 'lexicon',
): string {
  return `${text}\n**Kind:** ${kind}\n**Source:** ${source}`;
}

/** Rule 6 artefact body: `**Path:**`, `**Heading:**` (`-` when none), `**Copy:**`. */
export function artefactBody(originalPath: string, firstHeading: string | null, copyRel: string): string {
  return `**Path:** ${originalPath}\n**Heading:** ${firstHeading ?? '-'}\n**Copy:** ${copyRel}`;
}

function fieldLine(body: string, label: string): string | null {
  const m = body.match(new RegExp(`^\\*\\*${label}:\\*\\* ?(.*)$`, 'm'));
  return m === null ? null : (m[1] ?? '');
}

/**
 * The raw text the key is derived from (Rule 7): the paragraph for
 * question/offer, the *approved* text for an approval, the finding text (minus
 * its Kind/Source lines) for a finding, the original path for an artefact.
 * Also the text `thread list` shows.
 */
export function keyText(t: Thread): string {
  switch (t.kind) {
    case 'approval':
      return fieldLine(t.body, 'Approved') ?? t.body;
    case 'finding':
      return t.body.replace(/\n\*\*Kind:\*\*[^\n]*\n\*\*Source:\*\*[^\n]*$/, '');
    case 'artefact':
      return fieldLine(t.body, 'Path') ?? t.body;
    default:
      return t.body;
  }
}

/** Rule 7 / B-010: `normaliseText` of the key text — the dedupe and mention key. */
export function threadKey(t: Thread): string {
  return normaliseText(keyText(t));
}

// ---------------------------------------------------------------------------
// parse / serialise (Rule 1, §4.5.3)
// ---------------------------------------------------------------------------

/** iso-datetime out of a YAML scalar (js-yaml turns unquoted timestamps into Dates). */
function isoString(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'string' && Number.isFinite(Date.parse(v))) return v;
  return null;
}

function stringList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.every((e) => typeof e === 'string') ? (v as string[]) : null;
}

function isKind(v: unknown): v is ThreadKind {
  return typeof v === 'string' && (THREAD_KINDS as readonly string[]).includes(v);
}

function isStatus(v: unknown): v is ThreadStatus {
  return typeof v === 'string' && (THREAD_STATUSES as readonly string[]).includes(v);
}

/**
 * Parse one ledger file. `null` on any shape failure — no frontmatter, YAML
 * error, bad id/enum, missing or mistyped required field — never throws.
 * The body is the text after the frontmatter with the single blank separator
 * line and the trailing newline removed, so `parse(serialise(t))` is `t`.
 */
export function parseThreadFile(raw: string): Thread | null {
  let data: Record<string, unknown>;
  let content: string;
  try {
    const parsed = matter(raw);
    data = parsed.data as Record<string, unknown>;
    content = parsed.content;
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const id = data['id'];
  if (typeof id !== 'string' || !THREAD_ID_RE.test(id)) return null;
  const kind = data['kind'];
  if (!isKind(kind)) return null;
  const status = data['status'];
  if (!isStatus(status)) return null;
  const opened = isoString(data['opened']);
  const expires = isoString(data['expires']);
  if (opened === null || expires === null) return null;
  const session = data['session'];
  if (typeof session !== 'string' || session === '') return null;
  const sessions = stringList(data['sessions']);
  const bearsOn = stringList(data['bears_on']);
  if (sessions === null || bearsOn === null) return null;

  const thread: Thread = {
    id,
    kind,
    status,
    opened,
    session,
    sessions,
    bears_on: bearsOn,
    expires,
    body: content.replace(/^\n/, '').replace(/\n$/, ''),
  };
  if (data['answered'] !== undefined) {
    const answered = isoString(data['answered']);
    if (answered === null) return null;
    thread.answered = answered;
  }
  if (data['resolved_by'] !== undefined) {
    if (typeof data['resolved_by'] !== 'string') return null;
    thread.resolved_by = data['resolved_by'];
  }
  return thread;
}

/** A YAML scalar: plain when it is safe as such, else JSON-quoted (valid YAML double-quoted). */
function yamlScalar(v: string): string {
  const plainSafe = /^[A-Za-z0-9_.\/@+][A-Za-z0-9_.\/@:+-]*$/.test(v) && !/: |^-|\s$/.test(v);
  return plainSafe ? v : JSON.stringify(v);
}

function yamlList(key: string, items: string[]): string[] {
  if (items.length === 0) return [`${key}: []`];
  return [`${key}:`, ...items.map((i) => `  - ${yamlScalar(i)}`)];
}

/**
 * Serialise in the §4.5.3 field order: id, kind, status, opened, session,
 * sessions, bears_on, expires, then answered / resolved_by when set; one blank
 * line; the body verbatim; a trailing newline.
 */
export function serialiseThread(t: Thread): string {
  const lines = [
    '---',
    `id: ${t.id}`,
    `kind: ${t.kind}`,
    `status: ${t.status}`,
    `opened: ${t.opened}`,
    `session: ${yamlScalar(t.session)}`,
    ...yamlList('sessions', t.sessions),
    ...yamlList('bears_on', t.bears_on),
    `expires: ${t.expires}`,
  ];
  if (t.answered !== undefined) lines.push(`answered: ${t.answered}`);
  if (t.resolved_by !== undefined) lines.push(`resolved_by: ${yamlScalar(t.resolved_by)}`);
  lines.push('---', '', t.body, '');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// the ledger on disk
// ---------------------------------------------------------------------------

function idNumber(id: string): number {
  return parseInt(id.slice(2), 10);
}

/**
 * Every parseable `*.md` under `pulse/threads/`, sorted numerically by id;
 * `skipped` counts the markdown files `parseThreadFile` rejected. An absent
 * directory is an empty ledger.
 */
export function listThreads(root: string): { threads: Thread[]; skipped: number } {
  const dir = threadsDir(root);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return { threads: [], skipped: 0 };
  }
  const threads: Thread[] = [];
  let skipped = 0;
  for (const name of names) {
    if (!name.endsWith('.md')) continue;
    let parsed: Thread | null = null;
    try {
      parsed = parseThreadFile(fs.readFileSync(path.join(dir, name), 'utf-8'));
    } catch {
      parsed = null;
    }
    if (parsed === null) skipped++;
    else threads.push(parsed);
  }
  threads.sort((a, b) => idNumber(a.id) - idNumber(b.id));
  return { threads, skipped };
}

/**
 * Write a thread: `mkdir -p` the ledger, write to a sibling temp file and
 * rename over the target (atomic on one filesystem). An existing file for the
 * same id keeps its filename; a new thread is named by `threadFilename`.
 * Returns the absolute path written.
 */
export function writeThread(root: string, t: Thread): string {
  const dir = threadsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const target = threadPath(root, t.id) ?? path.join(dir, threadFilename(t));
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, serialiseThread(t), 'utf-8');
  fs.renameSync(tmp, target);
  return target;
}

/** Frontmatter fields a status change or trail append may touch (never `id` or `body`). */
export type ThreadPatch = Partial<Omit<Thread, 'id' | 'body'>>;

/**
 * Rewrite only frontmatter fields of the thread `id`; the body is carried over
 * byte-for-byte. A key set to `undefined` in the patch is removed (so a caller
 * can drop `answered` / `resolved_by`). Returns the updated thread, or `null`
 * when no parseable file exists for the id (nothing written).
 */
export function updateThreadStatus(root: string, id: string, patch: ThreadPatch): Thread | null {
  const file = threadPath(root, id);
  if (file === null) return null;
  let current: Thread | null = null;
  try {
    current = parseThreadFile(fs.readFileSync(file, 'utf-8'));
  } catch {
    current = null;
  }
  if (current === null) return null;
  const next: Thread = { ...current, ...patch, id: current.id, body: current.body };
  for (const key of Object.keys(next) as (keyof Thread)[]) {
    if (next[key] === undefined) delete next[key];
  }
  writeThread(root, next);
  return next;
}

// ---------------------------------------------------------------------------
// the T-id allocator (Rule 2 — mirrors suggestion-ids.ts, own counter)
// ---------------------------------------------------------------------------

/** The last allocated thread number (0 when the file is missing or unreadable). */
export function readThreadCounter(root: string): number {
  try {
    const raw = fs.readFileSync(counterPath(root), 'utf-8').trim();
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  } catch {
    /* missing file → fresh namespace */
  }
  return 0;
}

/**
 * Allocate `n` fresh `T-NNN` ids and persist the advanced counter before
 * handing them out: monotonic, never reused, zero-padded to three digits and
 * growing past 999 unpadded. Never reads or writes `suggestion-counter`.
 */
export function allocateThreadIds(root: string, n: number): string[] {
  if (!Number.isInteger(n) || n <= 0) return [];
  const current = readThreadCounter(root);
  const ids: string[] = [];
  for (let i = 1; i <= n; i++) {
    ids.push(`T-${String(current + i).padStart(3, '0')}`);
  }
  const file = counterPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${current + n}\n`, 'utf-8');
  return ids;
}

// ---------------------------------------------------------------------------
// the session record (schema §4.5.3) — assembled by hooks.session-end,
// consumed here by Rule 3 (open) and Rule 9 (answered)
// ---------------------------------------------------------------------------

/** Rule 7a of the hook spec: the last assistant paragraph when it asks or offers. */
export interface SessionRecordOpenQuestion {
  kind: 'question' | 'offer';
  /** ≤600 characters. */
  text: string;
  /** The companion's `at` or the message timestamp; null when the entry carried none. */
  timestamp: string | null;
  source: 'stop' | 'transcript';
}

/** Rule 7b: a user approval paired with the assistant paragraph it approved. */
export interface SessionRecordApproval {
  approval: string;
  approved: string;
  timestamp: string | null;
}

/** Rule 7c: a tagged or lexicon-matched finding. `bears_on` is present for tags. */
export interface SessionRecordFinding {
  kind: 'measurement' | 'conclusion';
  /** ≤300 characters. */
  text: string;
  bears_on?: string[];
  timestamp: string | null;
  source: 'tag' | 'lexicon';
}

/** Rule 8: one scratchpad Write/Edit target and whether its copy was taken. */
export interface SessionRecordArtefact {
  path: string;
  copied: boolean;
  first_heading: string | null;
}

/** `pulse/sessions/<session-id>.json` — every field present, `null` where absent. */
export interface SessionRecord {
  kind: 'pulse-session-record';
  session_id: string;
  /** `claude-sessions/<user>/<session-id>` (§6). */
  session: string;
  title: string | null;
  session_kind: SessionKind;
  /** iso-datetime, the hook's wall-clock. */
  ended: string;
  reason: string;
  partial: boolean;
  open_question: SessionRecordOpenQuestion | null;
  approvals: SessionRecordApproval[];
  findings: SessionRecordFinding[];
  artefacts: SessionRecordArtefact[];
  /** Project-relative path of the read ledger when it exists. */
  reads: string | null;
  threads_opened: string[];
  threads_answered: string[];
}

/** Rule 9b: keys shorter than this never count as a mention (engineering call). */
export const KEY_MIN_CHARS = 20;
/** Rule 4: the `bears_on` cap. */
export const BEARS_ON_CAP = 12;
/** Rule 9a: a thread id as a whole word. */
const ID_MENTION_RE = /\bT-\d{3,}\b/g;

/**
 * The scratch copy's basename for the `occurrence`-th (1-based) artefact
 * sharing a basename within one session: `notes.md`, `notes-2.md`, `notes-3.md`
 * (hook spec Rule 8). Shared by the copier and the artefact thread body so
 * the `**Copy:**` line names the file that was actually written.
 */
export function scratchCopyBasename(basename: string, occurrence: number): string {
  if (occurrence <= 1) return basename;
  const ext = path.extname(basename);
  return `${basename.slice(0, basename.length - ext.length)}-${occurrence}${ext}`;
}

/** Project-relative path of the scratch copy of the `index`-th record artefact. */
function scratchCopyRel(sessionId: string, artefacts: SessionRecordArtefact[], index: number): string {
  const base = path.basename(artefacts[index]?.path ?? '');
  let occurrence = 0;
  for (let i = 0; i <= index; i++) {
    if (path.basename(artefacts[i]?.path ?? '') === base) occurrence++;
  }
  return `.cortex/pulse/scratch/${sessionId}/${scratchCopyBasename(base, occurrence)}`;
}

/**
 * Rule 4b: the session's read-ledger lines under `.cortex/` or `.specflow/`,
 * in order — from the record's `reads` path when the hook recorded one, else
 * the conventional `pulse/state/reads/<session-id>`.
 */
function ledgerBearsOn(root: string, record: SessionRecord): string[] {
  const file =
    typeof record.reads === 'string' && record.reads !== ''
      ? path.join(root, ...record.reads.split('/'))
      : path.join(root, '.cortex', 'pulse', 'state', 'reads', record.session_id);
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch {
    return [];
  }
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('.cortex/') || l.startsWith('.specflow/'));
}

/** Rule 4: tag targets first, then ledger lines; deduplicated; capped. */
function seedBearsOn(tagTargets: string[], ledger: string[]): string[] {
  const out: string[] = [];
  for (const e of [...tagTargets, ...ledger]) {
    if (e !== '' && !out.includes(e)) out.push(e);
    if (out.length === BEARS_ON_CAP) break;
  }
  return out;
}

interface ThreadCandidate {
  kind: ThreadKind;
  body: string;
  tagTargets: string[];
}

/** Rule 3 / Rule 8: the record's thread candidates in creation order. */
function candidatesOf(record: SessionRecord): ThreadCandidate[] {
  const out: ThreadCandidate[] = [];
  const scheduled = record.session_kind === 'scheduled';
  if (!scheduled && record.open_question !== null) {
    out.push({ kind: record.open_question.kind, body: record.open_question.text, tagTargets: [] });
  }
  if (!scheduled) {
    for (const a of record.approvals) out.push({ kind: 'approval', body: approvalBody(a.approved, a.approval), tagTargets: [] });
  }
  for (const f of record.findings) {
    out.push({ kind: 'finding', body: findingBody(f.text, f.kind, f.source), tagTargets: f.bears_on ?? [] });
  }
  record.artefacts.forEach((a, i) => {
    if (!a.copied) return;
    out.push({
      kind: 'artefact',
      body: artefactBody(a.path, a.first_heading, scratchCopyRel(record.session_id, record.artefacts, i)),
      tagTargets: [],
    });
  });
  return out;
}

/**
 * Rules 3, 4, 7, 8: open one thread per record item — question/offer,
 * approvals, findings, copied artefacts, in that order (finding and artefact
 * only for a scheduled session) — deduped by normalised key against every
 * `open` thread: a match opens nothing, appends this session's citation to
 * the matched trail (once) and reports the matched id in the item's position.
 * Ids are allocated once for the new threads, consecutively. Returns the ids
 * in creation order — the record's `threads_opened`.
 */
export function openThreadsFromRecord(root: string, record: SessionRecord, now: Date): string[] {
  const candidates = candidatesOf(record);
  if (candidates.length === 0) return [];
  const opened = now.toISOString();
  const expires = threadExpires(now);
  const ledger = ledgerBearsOn(root, record);
  const citation = record.session;

  const openByKey = new Map<string, Thread>();
  for (const t of listThreads(root).threads) {
    if (t.status === 'open' && !openByKey.has(threadKey(t))) openByKey.set(threadKey(t), t);
  }

  // First pass: match against open threads (and within this run), decide what is new.
  const fresh: Thread[] = [];
  const slots: ({ matched: string } | { fresh: number })[] = [];
  const freshByKey = new Map<string, number>();
  for (const c of candidates) {
    const draft: Thread = {
      id: 'T-000',
      kind: c.kind,
      status: 'open',
      opened,
      session: citation,
      sessions: [citation],
      bears_on: seedBearsOn(c.tagTargets, ledger),
      expires,
      body: c.body,
    };
    const key = threadKey(draft);
    const existing = openByKey.get(key);
    if (existing !== undefined) {
      if (!existing.sessions.includes(citation)) {
        const updated = updateThreadStatus(root, existing.id, { sessions: [...existing.sessions, citation] });
        if (updated !== null) openByKey.set(key, updated);
      }
      slots.push({ matched: existing.id });
      continue;
    }
    const pending = freshByKey.get(key);
    if (pending !== undefined) {
      slots.push({ fresh: pending });
      continue;
    }
    freshByKey.set(key, fresh.length);
    slots.push({ fresh: fresh.length });
    fresh.push(draft);
  }

  const ids = allocateThreadIds(root, fresh.length);
  fresh.forEach((t, i) => {
    t.id = ids[i] ?? t.id;
    writeThread(root, t);
  });
  return slots.map((s) => ('matched' in s ? s.matched : (ids[s.fresh] ?? 'T-000')));
}

/** Inputs of {@link detectAnswered}: session `S` as the hook saw it. */
export interface DetectAnsweredOptions {
  sessionId: string;
  /** `claude-sessions/<user>/<session-id>` — becomes `resolved_by`. */
  citation: string;
  sessionKind: SessionKind;
  /** Every message the hook parsed (tail and prefix hits) — Rule 9a/9b. */
  messages: ExtractedMessage[];
  /** `S`'s first user message text, or null when none — Rule 9c. */
  firstUserText: string | null;
  /** The record's `ended` — becomes `answered`. */
  ended: string;
  /** The threads that were `open` before this run; nothing else is evaluated. */
  openBefore: Thread[];
}

/** Rule 9c: the newest record in `pulse/sessions/` other than `sessionId`, by greatest `ended`. */
function newestOtherRecord(root: string, sessionId: string): SessionRecord | null {
  const dir = path.join(root, '.cortex', 'pulse', 'sessions');
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  } catch {
    return null;
  }
  let best: SessionRecord | null = null;
  let bestMs = -Infinity;
  for (const name of names) {
    let rec: SessionRecord;
    try {
      rec = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8')) as SessionRecord;
    } catch {
      continue;
    }
    if (typeof rec !== 'object' || rec === null || rec.session_id === sessionId) continue;
    if (!Array.isArray(rec.threads_opened)) continue;
    const ms = Date.parse(typeof rec.ended === 'string' ? rec.ended : '');
    if (Number.isFinite(ms) && ms > bestMs) {
      best = rec;
      bestMs = ms;
    }
  }
  return best;
}

/**
 * Rule 9: over the threads open *before* this run, mark answered every thread
 * that session `S` (a) names by id as a whole word in any message, (b) restates
 * — `S`'s normalised concatenated text contains the thread key, keys under
 * {@link KEY_MIN_CHARS} excepted — or (c) replies to: `S` is interactive with a
 * non-empty first user message and the newest *other* record lists the thread
 * (a `question`/`offer`) in its `threads_opened`. Exactly these three tests;
 * a thread whose trail already carries `S` is skipped (re-fire safety).
 * Each answered thread gets `status: answered`, `answered: <ended>`,
 * `resolved_by: <citation>`, body untouched. Returns the ids, by id order.
 */
export function detectAnswered(root: string, opts: DetectAnsweredOptions): string[] {
  const open = opts.openBefore.filter((t) => t.status === 'open').sort((a, b) => idNumber(a.id) - idNumber(b.id));
  if (open.length === 0) return [];

  const idMentions = new Set<string>();
  for (const m of opts.messages) {
    for (const hit of m.text.matchAll(ID_MENTION_RE)) idMentions.add(hit[0]);
  }
  const concatenated = normaliseText(opts.messages.map((m) => m.text).join('\n'));

  let replyTargets: Set<string> | null = null;
  if (opts.sessionKind === 'interactive' && opts.firstUserText !== null && opts.firstUserText.trim() !== '') {
    const newest = newestOtherRecord(root, opts.sessionId);
    if (newest !== null) replyTargets = new Set(newest.threads_opened);
  }

  const answered: string[] = [];
  for (const t of open) {
    // A session never answers a thread it raised itself (a re-fired SessionEnd
    // sees its own earlier threads as "open before" — hook spec Rule 4).
    if (t.sessions.includes(opts.citation)) continue;
    const key = threadKey(t);
    const byId = idMentions.has(t.id);
    const byKey = key.length >= KEY_MIN_CHARS && concatenated.includes(key);
    const byReply = replyTargets !== null && (t.kind === 'question' || t.kind === 'offer') && replyTargets.has(t.id);
    if (!byId && !byKey && !byReply) continue;
    const updated = updateThreadStatus(root, t.id, { status: 'answered', answered: opts.ended, resolved_by: opts.citation });
    if (updated !== null) answered.push(t.id);
  }
  return answered;
}
