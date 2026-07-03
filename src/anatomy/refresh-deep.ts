/**
 * `cortex loop-anatomy-refresh --deep` — the purpose-filler tier (spec
 * anatomy.refresh-deep, design §11.4 item 4). Deterministic bookends around
 * an agentic middle, same shape as distil: `--collect` batches every row
 * flagged `needs_purpose_refresh: true` (≤25 per batch, head excerpts) into
 * `pulse/.purpose-worklist.json`; `--apply <results.json>` writes validated
 * one-line purposes back — flag cleared and `last_seen` stamped atomically
 * per row (refresh-fast Rule 4 coordination pin), guarded by the collect-time
 * sha256 (mid-flight change keeps the flag). Bare mode = collect → headless
 * Claude judgment (core-cli.init Rule 6 subprocess semantics) → apply. The
 * shipped `skills/cortex-loop-anatomy-refresh/SKILL.md` does the judgment
 * in-session instead. Core halves deterministic (R-001); writes confined to
 * `.cortex/anatomy/files.md` + the worklist.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import {
  sanitizeCell,
  splitDataRowCells,
  emitFilesMdRow,
  parseFilesMdTable,
  isDataRowShape,
  purposeSourceCell,
  PURPOSE_SOURCE_READ_TIME,
  PURPOSE_SOURCE_SCANNER_LLM,
} from './files-md.js';
import { AUTH_FAILURE_PATTERN } from '../cli/claude-auth.js';
import { parseCandidatesFromOutput } from '../pulse/distil.js';

export const PURPOSE_WORKLIST_FILE = '.purpose-worklist.json';

/** Batch size (spec Rule 1 / design §7.2): ~25 files per batch. */
export const PURPOSE_BATCH_SIZE = 25;

/** Excerpt budget (spec Entities): first ~60 lines, char-capped. */
export const EXCERPT_MAX_LINES = 60;
export const EXCERPT_MAX_CHARS = 4000;

/** Purpose cap (spec Rule 2 / scanner Rule 5 conventions). */
export const PURPOSE_MAX_CHARS = 120;

const DEFAULT_TIMEOUT_MS = 300_000;

// ---------------------------------------------------------------------------
// collect (deterministic first bookend)
// ---------------------------------------------------------------------------

export interface WorklistEntry {
  path: string;
  tokens: number;
  /** Head excerpt (≤60 lines, char-budgeted) for in-session judgment. */
  excerpt: string;
  /** Collect-time content hash — the --apply mid-flight guard (Rule 3). */
  sha256: string;
}

export interface PurposeWorklist {
  kind: 'purpose-worklist';
  generated: string;
  batches: WorklistEntry[][];
}

/** Head excerpt: first EXCERPT_MAX_LINES lines, capped at EXCERPT_MAX_CHARS. */
export function headExcerpt(content: string): string {
  const head = content.split('\n').slice(0, EXCERPT_MAX_LINES).join('\n');
  return head.length > EXCERPT_MAX_CHARS ? head.slice(0, EXCERPT_MAX_CHARS) : head;
}

/** Chunk entries into batches of ≤ PURPOSE_BATCH_SIZE (Rule 1). */
export function chunkBatches<T>(entries: T[], size = PURPOSE_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < entries.length; i += size) {
    batches.push(entries.slice(i, i + size));
  }
  return batches;
}

export interface CollectResult {
  worklistPath: string;
  flagged: number;
  batches: number;
}

/**
 * `--collect`: every currently flagged row (one pass takes everything, Rule 4)
 * → batched worklist entries. Zero flagged → a stated empty worklist (Rule 6).
 * Throws on a corrupt files.md — the deep tier is a foreground loop, not the
 * hook path, so corruption is loud.
 */
export function collectPurposeWorklist(root: string, now: Date = new Date()): CollectResult {
  const absRoot = path.resolve(root);
  const filesMdPath = path.join(absRoot, '.cortex', 'anatomy', 'files.md');

  const entries: WorklistEntry[] = [];
  if (fs.existsSync(filesMdPath)) {
    const table = parseFilesMdTable(fs.readFileSync(filesMdPath, 'utf-8'));
    if (table === null) {
      throw new Error('.cortex/anatomy/files.md could not be parsed as an anatomy-files table; re-run the scanner');
    }
    for (const [rowPath, idx] of table.rowIdxByPath) {
      const cells = splitDataRowCells(table.lines[idx] ?? '');
      if (cells === null || !isDataRowShape(cells)) continue;
      if (cells[6] !== 'true') continue; // only flagged rows enter the worklist
      let content: string;
      try {
        content = fs.readFileSync(path.join(absRoot, rowPath), 'utf-8');
      } catch {
        continue; // vanished since flagging → stays flagged; the fast tier/scanner reconciles
      }
      entries.push({
        path: rowPath,
        tokens: Number(cells[2] ?? 0),
        excerpt: headExcerpt(content),
        sha256: cells[3] ?? '',
      });
    }
  }

  const worklist: PurposeWorklist = {
    kind: 'purpose-worklist',
    generated: now.toISOString(),
    batches: chunkBatches(entries),
  };
  const pulseDir = path.join(absRoot, '.cortex', 'pulse');
  fs.mkdirSync(pulseDir, { recursive: true });
  const worklistPath = path.join(pulseDir, PURPOSE_WORKLIST_FILE);
  fs.writeFileSync(worklistPath, JSON.stringify(worklist, null, 2) + '\n', 'utf-8');
  return { worklistPath, flagged: entries.length, batches: worklist.batches.length };
}

// ---------------------------------------------------------------------------
// result validation + apply (deterministic last bookend)
// ---------------------------------------------------------------------------

export interface PurposeResult {
  path: string;
  purpose: string;
}

/**
 * Rule 2 validation: `{path, purpose}` — purpose non-empty, single line
 * (multi-line is INVALID, not flattened), sanitized to the row grammar,
 * capped at 120 chars. Invalid → null (skipped + counted by apply).
 */
export function validatePurposeResult(raw: unknown): PurposeResult | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const p = r['path'];
  const purposeRaw = r['purpose'];
  if (typeof p !== 'string' || p.trim() === '') return null;
  if (typeof purposeRaw !== 'string') return null;
  if (/[\r\n]/.test(purposeRaw.trim())) return null; // multi-line → invalid
  const sanitized = sanitizeCell(purposeRaw);
  if (sanitized === '') return null;
  return {
    path: p.trim(),
    purpose: sanitized.length > PURPOSE_MAX_CHARS ? sanitized.slice(0, PURPOSE_MAX_CHARS) : sanitized,
  };
}

export interface ApplyResult {
  received: number;
  applied: number;
  /** Invalid shape/purpose, or a path unknown to the worklist/table. */
  skipped: number;
  /** Row no longer flagged, or sha256 moved since collect (mid-flight guard). */
  deferred: number;
}

/**
 * `--apply`: write purposes back — ONLY rows still flagged AND whose sha256
 * still matches the collect-time hash (Rule 3). Written rows get purpose,
 * `needs_purpose_refresh: false`, and `last_seen` in the one re-emitted row
 * (the coordination pin). Everything else in files.md is byte-untouched.
 */
export function applyPurposeResults(root: string, rawResults: unknown[], now: Date = new Date()): ApplyResult {
  const absRoot = path.resolve(root);
  const filesMdPath = path.join(absRoot, '.cortex', 'anatomy', 'files.md');
  const out: ApplyResult = { received: rawResults.length, applied: 0, skipped: 0, deferred: 0 };

  const table = parseFilesMdTable(fs.existsSync(filesMdPath) ? fs.readFileSync(filesMdPath, 'utf-8') : '');
  if (table === null) {
    throw new Error('.cortex/anatomy/files.md could not be parsed as an anatomy-files table; nothing applied');
  }

  const worklistPath = path.join(absRoot, '.cortex', 'pulse', PURPOSE_WORKLIST_FILE);
  let collectSha = new Map<string, string>();
  try {
    const worklist = JSON.parse(fs.readFileSync(worklistPath, 'utf-8')) as PurposeWorklist;
    collectSha = new Map(worklist.batches.flat().map((e) => [e.path, e.sha256]));
  } catch {
    throw new Error(`cannot read .cortex/pulse/${PURPOSE_WORKLIST_FILE}; run --collect first`);
  }

  const lines = [...table.lines];
  const nowIso = sanitizeCell(now.toISOString());
  const written = new Set<string>();

  for (const raw of rawResults) {
    const result = validatePurposeResult(raw);
    if (result === null) {
      out.skipped++;
      continue;
    }
    const pathCell = sanitizeCell(result.path);
    const idx = table.rowIdxByPath.get(pathCell);
    const collectTime = collectSha.get(pathCell);
    if (idx === undefined || collectTime === undefined || written.has(pathCell)) {
      out.skipped++; // unknown path (not in table / not collected) or duplicate
      continue;
    }
    const cells = splitDataRowCells(lines[idx] ?? '');
    if (cells === null || !isDataRowShape(cells)) {
      out.skipped++;
      continue;
    }
    // Trust ordering (§4.1): `read-time` sits above this writer's
    // `scanner-llm`, so a witnessed purpose is NEVER overwritten by apply
    // unless the file's content changed (needs_purpose_refresh: true resets
    // the contest). Subsumed by the flag guard below, but pinned explicitly —
    // this is the cross-tier regression clause asserted by hooks.post-read.
    if (purposeSourceCell(cells) === PURPOSE_SOURCE_READ_TIME && cells[6] !== 'true') {
      out.deferred++;
      continue;
    }
    if (cells[6] !== 'true' || cells[3] !== collectTime) {
      out.deferred++; // changed mid-flight (or already filled) → flag state kept for the next cycle
      continue;
    }
    // Atomic row write: purpose + flag false + last_seen + provenance in ONE
    // emitted row. Applied purposes carry `purpose_source: scanner-llm`.
    lines[idx] = emitFilesMdRow({
      path: cells[0] ?? '',
      purpose: result.purpose,
      tokens: Number(cells[2] ?? 0),
      sha256: cells[3] ?? '',
      lastSeen: nowIso,
      specLinksCell: cells[5] || '-',
      needsPurposeRefresh: false,
      purposeSource: PURPOSE_SOURCE_SCANNER_LLM,
    });
    written.add(pathCell);
    out.applied++;
  }

  if (out.applied > 0) {
    fs.writeFileSync(filesMdPath, lines.join('\n'), 'utf-8');
  }
  return out;
}

// ---------------------------------------------------------------------------
// bare mode — the Rule 6 subprocess boundary (Core makes NO LLM calls)
// ---------------------------------------------------------------------------

interface SubprocessOutcome {
  kind: 'ok' | 'no-binary' | 'timeout' | 'auth' | 'error';
  stdout: string;
  detail: string;
}

function runClaudeJudgment(bin: string, prompt: string, cwd: string, timeoutMs: number): Promise<SubprocessOutcome> {
  return new Promise((resolve) => {
    execFile(
      bin,
      ['-p', prompt],
      { cwd, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const out = stdout ?? '';
        const combined = `${out}\n${stderr ?? ''}`;
        if (AUTH_FAILURE_PATTERN.test(combined)) {
          resolve({ kind: 'auth', stdout: out, detail: 'the Claude CLI reported it is not authenticated' });
          return;
        }
        if (!error) {
          resolve({ kind: 'ok', stdout: out, detail: '' });
          return;
        }
        const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string; code?: unknown };
        if (err.code === 'ENOENT') {
          resolve({ kind: 'no-binary', stdout: out, detail: `claude binary not found (${bin})` });
        } else if (err.killed || err.signal === 'SIGKILL' || err.signal === 'SIGTERM') {
          resolve({ kind: 'timeout', stdout: out, detail: `subprocess timed out after ${timeoutMs}ms` });
        } else {
          resolve({ kind: 'error', stdout: out, detail: `subprocess exited with code ${String(err.code ?? 'unknown')}` });
        }
      },
    );
  });
}

function judgmentPrompt(): string {
  return (
    `Read .cortex/pulse/${PURPOSE_WORKLIST_FILE} — batches of files flagged needs_purpose_refresh, each entry ` +
    `carrying {path, tokens, excerpt}. For EVERY entry, derive a precise one-line purpose (max ${PURPOSE_MAX_CHARS} chars, ` +
    `no pipes, no newlines) from its excerpt. Output ONLY a JSON array of results, each shaped ` +
    `{"path": "<the entry's path>", "purpose": "<one line>"}. Do not write any files.`
  );
}

// ---------------------------------------------------------------------------
// entry — the modes (spec Rule 1)
// ---------------------------------------------------------------------------

export interface RefreshDeepOptions {
  collect?: boolean;
  applyFile?: string;
  noLlm?: boolean;
  /** Testability seams (never LLM behaviour — the subprocess stays opaque). */
  claudeBin?: string;
  timeoutMs?: number;
  now?: Date;
}

export async function runRefreshDeep(root = '.', opts: RefreshDeepOptions = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();

  if (opts.collect && opts.applyFile !== undefined) {
    console.error('cortex loop-anatomy-refresh: --collect and --apply are mutually exclusive.');
    return 1;
  }

  // Mode 1 — collect only (the shipped skill's first step).
  if (opts.collect) {
    const result = collectPurposeWorklist(absRoot, now);
    console.log(
      `cortex loop-anatomy-refresh: worklist written to .cortex/pulse/${PURPOSE_WORKLIST_FILE} ` +
        `(${result.flagged} flagged row(s) in ${result.batches} batch(es)${result.flagged === 0 ? ' — nothing flagged' : ''}).`,
    );
    return 0;
  }

  // Mode 2 — apply only (the shipped skill's last step).
  if (opts.applyFile !== undefined) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(opts.applyFile, 'utf-8')) as unknown;
    } catch (err) {
      console.error(`cortex loop-anatomy-refresh: cannot read results file ${opts.applyFile}: ${(err as Error).message}`);
      return 1;
    }
    if (!Array.isArray(raw)) {
      console.error(`cortex loop-anatomy-refresh: results file ${opts.applyFile} must hold a JSON array.`);
      return 1;
    }
    const app = applyPurposeResults(absRoot, raw, now);
    console.log(
      `cortex loop-anatomy-refresh: ${app.applied} purpose(s) applied, ${app.skipped} skipped (invalid or unknown), ` +
        `${app.deferred} deferred (changed mid-flight — flag kept for the next cycle).`,
    );
    return 0;
  }

  // Mode 3 — bare: collect → headless judgment subprocess → apply.
  const collected = collectPurposeWorklist(absRoot, now);

  // Rule 6: zero flagged → stated no-op, no subprocess.
  if (collected.flagged === 0) {
    console.log(
      `cortex loop-anatomy-refresh: nothing flagged needs_purpose_refresh — empty worklist written to ` +
        `.cortex/pulse/${PURPOSE_WORKLIST_FILE}; no judgment pass needed.`,
    );
    return 0;
  }

  if (opts.noLlm) {
    console.log(
      `cortex loop-anatomy-refresh: judgment pass skipped (--no-llm); ${collected.flagged} flag(s) intact — ` +
        `worklist retained at .cortex/pulse/${PURPOSE_WORKLIST_FILE} for the scheduled skill run.`,
    );
    return 0;
  }

  const outcome = await runClaudeJudgment(
    opts.claudeBin ?? 'claude',
    judgmentPrompt(),
    absRoot,
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  switch (outcome.kind) {
    case 'auth':
      // Named failure (core-cli.init Rule 6 semantics: auth is exit 3, actionable).
      console.error(
        `cortex loop-anatomy-refresh: judgment pass failed: ${outcome.detail}. Authenticate the Claude CLI ` +
          `(run \`claude\` and log in via /login), then re-run — every flag intact, worklist retained at ` +
          `.cortex/pulse/${PURPOSE_WORKLIST_FILE}.`,
      );
      return 3;
    case 'no-binary':
    case 'timeout':
    case 'error':
      console.log(
        `cortex loop-anatomy-refresh: judgment pass skipped (${outcome.detail}); every flag intact — ` +
          `worklist retained at .cortex/pulse/${PURPOSE_WORKLIST_FILE} for the scheduled skill run.`,
      );
      return 0;
    case 'ok': {
      const results = parseCandidatesFromOutput(outcome.stdout);
      if (results === null) {
        console.log(
          `cortex loop-anatomy-refresh: judgment pass produced no usable results JSON; every flag intact — ` +
            `worklist retained at .cortex/pulse/${PURPOSE_WORKLIST_FILE} for the scheduled skill run.`,
        );
        return 0;
      }
      const app = applyPurposeResults(absRoot, results, now);
      console.log(
        `cortex loop-anatomy-refresh: ${app.applied} purpose(s) applied, ${app.skipped} skipped, ` +
          `${app.deferred} deferred (changed mid-flight).`,
      );
      return 0;
    }
  }
}
