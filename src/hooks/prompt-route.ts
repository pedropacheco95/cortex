/**
 * Open-thread prompt routing — UserPromptSubmit (spec hooks.prompt-route;
 * schema §5 "UserPromptSubmit" row and the third shape of the "Recall pointer
 * lines" grammar; 3.4 third revision).
 *
 * The prompt is the first moment a session says anything. This hook matches
 * the human's prompt against OPEN THREADS ONLY — `pulse/threads/`, never the
 * recall index (which lacks a thread's kind and status) — and injects at most
 * two `Open:` pointer lines. Two deterministic modes:
 *
 *   - resumption (Rule 6): on the session's first prompt, the newest prior
 *     interactive session's still-open question or offer, regardless of the
 *     prompt's vocabulary — conversation continuity across sessions;
 *   - mention (Rule 7): a prompt that names an open thread's `T-NNN` id, or
 *     shares two or more distinct tokens with an open thread's key text.
 *
 * The line and its budget live in the shared query module (`openLine`,
 * `fitOpenLines`); the once-per-session memory is the one `hooks.search-annotate`
 * keeps, so a thread named by either hook is named by neither again (Rule 8).
 *
 * Warn-never-block (RULES.md rule 6): exit 0 always, NEVER exit 2 — for this
 * event that erases the human's prompt. Expected empty states — no stdin, no
 * prompt, no session id, no `.cortex/`, no ledger, a malformed thread or
 * record, a harness-shaped prompt, no match — are silent AND unlogged; only
 * an unexpected exception reaches `pulse/reports/hook-errors.md`. Pure file
 * I/O: one listing of `threads/`, one of `sessions/` on a first prompt, at
 * most 200 small frontmatter parses, no transcript, no index, no subprocess,
 * no network (Rule 10's 50 ms target; R-001).
 */
import * as fs from 'fs';
import * as path from 'path';
import { appendHookError } from './errors.js';
import { isHarnessPrompt } from './harness.js';
import { recallFiredPath } from './search-annotate.js';
import { stopStatePath } from './stop.js';
import { fitOpenLines, readFiredKeys, tokenise } from '../recall/query.js';
import type { OpenLineItem } from '../recall/query.js';
import { keyText, parseThreadFile, THREADS_DIR } from '../pulse/threads.js';
import type { Thread, ThreadKind } from '../pulse/threads.js';
import type { HookRunResult, HookRunOptions } from './session-start.js';

const HOOK_NAME = 'prompt-route';

/** Rule 6(b): the newest prior record must have ended within this many days of now. */
export const RESUME_WINDOW_DAYS = 7;
/** Rule 5: when the ledger holds more `.md` files than this, only the highest ids are parsed. */
export const PROMPT_ROUTE_MAX_THREADS = 200;
/** Rule 7: only this many leading characters of the prompt are tokenised. */
export const PROMPT_ROUTE_MAX_PROMPT_CHARS = 2000;
/** Rule 5: the kinds a prompt can route to — a finding or artefact is a record, not a question. */
export const ROUTABLE_KINDS: readonly ThreadKind[] = ['question', 'offer', 'approval'];
/** Rule 6(c): the kinds resumption surfaces — an approval is not addressed to the next session. */
const RESUMABLE_KINDS: readonly ThreadKind[] = ['question', 'offer'];
/** Rule 7(b): distinct shared tokens needed for a key-text match. */
const MIN_TOKEN_HITS = 2;
/** Rule 8: at most this many lines are emitted. */
const MAX_SHOWN = 2;

const DAY_MS = 24 * 60 * 60 * 1000;
const THREAD_FILE_RE = /^(T-\d{3,})-.*\.md$/;

const SILENT: HookRunResult = { exitCode: 0, stdout: '' };

/** The UserPromptSubmit envelope (schema §5): the SessionStart shape with the event name changed. */
function envelope(payload: string): HookRunResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: payload },
    }),
  };
}

/** One routable open thread with the project-relative POSIX path of its ledger file. */
interface Candidate {
  thread: Thread;
  relPath: string;
}

/**
 * Rule 5: one `readdirSync` of `pulse/threads/`, the file names capped to the
 * PROMPT_ROUTE_MAX_THREADS highest ids before any parse, each parsed with the
 * ledger's own parser (an unparseable file is skipped, not logged), kept when
 * `status: open` and the kind is routable. An absent directory is an empty set.
 */
function candidates(root: string): Candidate[] {
  const dir = path.join(root, '.cortex', ...THREADS_DIR.split('/'));
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const files: { name: string; n: number }[] = [];
  for (const name of names) {
    const m = THREAD_FILE_RE.exec(name);
    if (m === null) continue;
    files.push({ name, n: parseInt((m[1] as string).slice(2), 10) });
  }
  files.sort((a, b) => b.n - a.n);
  const out: Candidate[] = [];
  for (const { name } of files.slice(0, PROMPT_ROUTE_MAX_THREADS)) {
    let parsed: Thread | null = null;
    try {
      parsed = parseThreadFile(fs.readFileSync(path.join(dir, name), 'utf-8'));
    } catch {
      parsed = null;
    }
    if (parsed === null || parsed.status !== 'open' || !ROUTABLE_KINDS.includes(parsed.kind)) continue;
    out.push({ thread: parsed, relPath: `.cortex/${THREADS_DIR}/${name}` });
  }
  return out;
}

/** What Rule 6(b) reads off a `pulse/sessions/*.json` record; `null` when the file is not a usable record. */
interface PriorRecord {
  sessionId: string | null;
  sessionKind: string | null;
  endedMs: number;
  threadsOpened: string[];
}

function readRecord(file: string): PriorRecord | null {
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const rec = data as Record<string, unknown>;
  const endedMs = typeof rec['ended'] === 'string' ? Date.parse(rec['ended']) : NaN;
  if (Number.isNaN(endedMs)) return null;
  const opened = Array.isArray(rec['threads_opened']) ? rec['threads_opened'].filter((t): t is string => typeof t === 'string') : [];
  return {
    sessionId: typeof rec['session_id'] === 'string' ? rec['session_id'] : null,
    sessionKind: typeof rec['session_kind'] === 'string' ? rec['session_kind'] : null,
    endedMs,
    threadsOpened: opened,
  };
}

/**
 * Rule 6(b): the newest record under `pulse/sessions/` by `ended`, every
 * record parsed, a record that fails to parse or belongs to this session
 * skipped. One `readdirSync`; an absent directory is no record.
 */
function newestPriorRecord(root: string, sessionId: string): PriorRecord | null {
  const dir = path.join(root, '.cortex', 'pulse', 'sessions');
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  let newest: PriorRecord | null = null;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const rec = readRecord(path.join(dir, name));
    if (rec === null || rec.sessionId === sessionId) continue;
    if (newest === null || rec.endedMs > newest.endedMs) newest = rec;
  }
  return newest;
}

/** Newest `opened` first, then the higher id — the order both modes fall back to. */
function byNewest(a: Candidate, b: Candidate): number {
  const opened = Date.parse(b.thread.opened) - Date.parse(a.thread.opened);
  if (opened !== 0 && !Number.isNaN(opened)) return opened;
  return parseInt(b.thread.id.slice(2), 10) - parseInt(a.thread.id.slice(2), 10);
}

/**
 * Rule 6: the previous interactive session's still-open questions and offers,
 * when this is the session's first prompt and that session ended within the
 * window. Empty when any gate fails.
 */
function resumption(root: string, sessionId: string, pool: Candidate[], nowMs: number): Candidate[] {
  const firstPrompt = !fs.existsSync(recallFiredPath(root, sessionId)) && !fs.existsSync(stopStatePath(root, sessionId));
  if (!firstPrompt) return [];
  const record = newestPriorRecord(root, sessionId);
  if (record === null || record.sessionKind !== 'interactive') return [];
  if (nowMs - record.endedMs > RESUME_WINDOW_DAYS * DAY_MS) return [];
  const opened = new Set(record.threadsOpened);
  return pool.filter((c) => opened.has(c.thread.id) && RESUMABLE_KINDS.includes(c.thread.kind)).sort(byNewest);
}

/**
 * Rule 7: the candidates the prompt names — by verbatim id among the
 * ref-shaped spans, or by two or more distinct shared tokens with the key
 * text — ranked id hits first, then hits descending, then newest.
 */
function mention(prompt: string, pool: Candidate[]): Candidate[] {
  const { tokens, refs } = tokenise(prompt.slice(0, PROMPT_ROUTE_MAX_PROMPT_CHARS));
  const promptTokens = new Set(tokens);
  const scored: { c: Candidate; idHit: boolean; hits: number }[] = [];
  for (const c of pool) {
    const idHit = refs.includes(c.thread.id);
    let hits = 0;
    if (promptTokens.size >= MIN_TOKEN_HITS) {
      for (const t of tokenise(keyText(c.thread)).tokens) if (promptTokens.has(t)) hits += 1;
    }
    if (idHit || hits >= MIN_TOKEN_HITS) scored.push({ c, idHit, hits });
  }
  scored.sort((a, b) => {
    if (a.idHit !== b.idHit) return a.idHit ? -1 : 1;
    if (a.hits !== b.hits) return b.hits - a.hits;
    return byNewest(a.c, b.c);
  });
  return scored.map((s) => s.c);
}

export async function run(stdinJson: unknown, opts?: HookRunOptions): Promise<HookRunResult> {
  try {
    const stdin = (typeof stdinJson === 'object' && stdinJson !== null ? stdinJson : {}) as Record<string, unknown>;
    const root = path.resolve(
      typeof stdin['cwd'] === 'string' && stdin['cwd'] ? stdin['cwd'] : (opts?.cwd ?? process.cwd()),
    );
    const now = opts?.now ?? new Date();

    // Rule 3: every field is externally owned and optional; without a prompt
    // there is nothing to route, without a session id the Rule 8 memory
    // cannot be kept — and a pointer that repeats every turn is the one thing
    // this hook must not become.
    const prompt = stdin['prompt'];
    const sessionId = stdin['session_id'];
    if (typeof prompt !== 'string' || prompt.length === 0) return SILENT;
    if (typeof sessionId !== 'string' || sessionId.length === 0) return SILENT;

    // Rule 10: no `.cortex/` (uninitialised, or a cwd outside any project) → silent.
    if (!fs.existsSync(path.join(root, '.cortex', 'cortex.config.json'))) return SILENT;

    // Rule 4: what the harness wrote into the user slot is not a prompt.
    if (isHarnessPrompt(prompt)) return SILENT;

    // Rule 5: the open, routable threads — one listing, capped, parsed once.
    const pool = candidates(root);
    if (pool.length === 0) return SILENT;

    // Rules 6 + 7, merged in Rule 8's order: resumption first, then mentions
    // not already listed.
    const ordered: Candidate[] = [];
    const seen = new Set<string>();
    for (const c of [...resumption(root, sessionId, pool, now.getTime()), ...mention(prompt, pool)]) {
      if (seen.has(c.thread.id)) continue;
      seen.add(c.thread.id);
      ordered.push(c);
    }
    if (ordered.length === 0) return SILENT;

    // Rule 8: the shared per-session memory drops what either hook already named.
    const memPath = recallFiredPath(root, sessionId);
    const fired = readFiredKeys(memPath);
    const rest = ordered.filter((c) => !fired.has(c.thread.id));
    if (rest.length === 0) return SILENT;
    const shown = rest.slice(0, MAX_SHOWN);
    const more = rest.length > MAX_SHOWN;

    // Rule 9: the line grammar and its budget, in the shared module.
    const items: OpenLineItem[] = shown.map((c) => ({
      id: c.thread.id,
      opened: c.thread.opened,
      keyText: keyText(c.thread),
      relPath: c.relPath,
    }));
    const lines = fitOpenLines(items, more);
    if (lines.length === 0) return SILENT;

    // Rule 8: record after emission is decided; a failed write still emits.
    try {
      fs.mkdirSync(path.dirname(memPath), { recursive: true });
      fs.appendFileSync(memPath, shown.map((c) => c.thread.id + '\n').join(''), 'utf-8');
    } catch (err) {
      appendHookError(root, { hook: HOOK_NAME, file: path.relative(root, memPath), failure: (err as Error).message }, now);
    }

    return envelope(lines.join('\n'));
  } catch (err) {
    // Rule 10: an unexpected exception degrades to silence + one log entry.
    try {
      appendHookError(path.resolve(opts?.cwd ?? process.cwd()), {
        hook: HOOK_NAME,
        file: '(unknown)',
        failure: (err as Error).message,
      });
    } catch {
      /* swallowed — the degradation log never becomes a failure source */
    }
    return SILENT;
  }
}
