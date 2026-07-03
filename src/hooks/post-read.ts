/**
 * PostRead hook — PostToolUse on Read (spec hooks.post-read).
 *
 * The capture half of refine-during-use (design §5, schema §5): after a Read,
 * silently sweep the session transcript's recent assistant messages for
 * `<cortex:purpose file="...">...</cortex:purpose>` tags emitted in response
 * to PreRead's invitation, validate them, and apply them to the anatomy row
 * as `purpose_source: read-time` — the top of the §4.1 trust ordering.
 *
 * Always silent (exit 0, empty stdout — the PostWrite envelope discipline).
 * Deterministic Core (R-001): the hook never calls an LLM; it captures what
 * the session already said.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  parseFilesMdTable,
  splitDataRowCells,
  isDataRowShape,
  emitFilesMdRow,
  sanitizeCell,
  computeSha256,
  PURPOSE_SOURCE_READ_TIME,
} from '../anatomy/files-md.js';
import { parseSessionJsonl, extractMessages } from '../sessions/read.js';
import { appendHookError } from './errors.js';
import type { HookRunResult, HookRunOptions } from './session-start.js';

const HOOK_NAME = 'post-read';

/**
 * Bounded transcript tail (spec Rule 3 — the engineering-call constant):
 * only the last 256 KiB of the JSONL transcript are swept. Recent assistant
 * messages — the only place a fresh tag can live — sit at the end of the
 * file, and the applied-tag memory makes missing an *old* tag harmless.
 */
export const TRANSCRIPT_TAIL_BYTES = 256 * 1024;

/** Writeback-specific purpose ceiling (spec Rule 4; NOT an anatomy-wide limit). */
export const WRITEBACK_MAX_CHARS = 120;

/** Applied-tag memory (schema §5): transient, per-session semantics — one
 *  sha256 line per processed tag; prevents redundant re-application only. */
export const READBACK_APPLIED_FILE = '.readback-applied';

const SILENT: HookRunResult = { exitCode: 0, stdout: '' };

export interface PurposeTag {
  /** The raw `file` attribute value. */
  file: string;
  /** The raw inner payload (unvalidated). */
  payload: string;
  /** Dedupe hash over file + payload. */
  hash: string;
}

const TAG_RE = /<cortex:purpose\s+file="([^"]*)"\s*>([\s\S]*?)<\/cortex:purpose>/g;

/** Extract every well-formed tag, in order. Malformed tags simply don't match. */
export function extractPurposeTags(text: string): PurposeTag[] {
  const tags: PurposeTag[] = [];
  for (const m of text.matchAll(TAG_RE)) {
    const file = m[1] ?? '';
    const payload = m[2] ?? '';
    tags.push({ file, payload, hash: computeSha256(`${file}\u0000${payload}`) });
  }
  return tags;
}

/** Read the last {@link TRANSCRIPT_TAIL_BYTES} of a file, dropping a leading partial line. */
export function readTranscriptTail(filePath: string, tailBytes = TRANSCRIPT_TAIL_BYTES): string {
  const stat = fs.statSync(filePath);
  const start = Math.max(0, stat.size - tailBytes);
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    let raw = buf.toString('utf-8');
    if (start > 0) {
      const nl = raw.indexOf('\n');
      raw = nl >= 0 ? raw.slice(nl + 1) : '';
    }
    return raw;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Rule 4 validation of a tag payload: non-empty, single-line (multi-line is
 * INVALID, not flattened — deep-tier convention), sanitized to the row
 * grammar, ≤120 chars (over the ceiling is INVALID, not truncated: the tag
 * asked for something the row can't hold verbatim). Returns the sanitised
 * purpose, or null when invalid.
 */
export function validateWritebackPurpose(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (/[\r\n]/.test(trimmed)) return null;
  const sanitized = sanitizeCell(trimmed);
  if (sanitized === '' || sanitized.length > WRITEBACK_MAX_CHARS) return null;
  return sanitized;
}

export async function run(stdinJson: unknown, opts?: HookRunOptions): Promise<HookRunResult> {
  try {
    const stdin = (typeof stdinJson === 'object' && stdinJson !== null ? stdinJson : {}) as Record<
      string,
      unknown
    >;
    const root = path.resolve(
      typeof stdin['cwd'] === 'string' && stdin['cwd'] ? stdin['cwd'] : (opts?.cwd ?? process.cwd()),
    );
    const now = opts?.now ?? new Date();

    // Unscanned project → nothing a tag could apply to → silent no-op
    // (post-write Rule 7 convention; no pulse entry).
    const filesMdPath = path.join(root, '.cortex', 'anatomy', 'files.md');
    if (!fs.existsSync(filesMdPath)) return SILENT;

    // Rule 7 / AC "transcript unavailable": missing or unreadable transcript
    // degrades silently with ONE hook-errors entry.
    const transcriptPath = stdin['transcript_path'];
    if (typeof transcriptPath !== 'string' || transcriptPath.length === 0) {
      appendHookError(root, { hook: HOOK_NAME, file: '(transcript)', failure: 'stdin carried no transcript_path; sweep skipped' }, now);
      return SILENT;
    }
    let tailRaw: string;
    try {
      tailRaw = readTranscriptTail(transcriptPath);
    } catch (err) {
      appendHookError(root, { hook: HOOK_NAME, file: transcriptPath, failure: `transcript unreadable: ${(err as Error).message}` }, now);
      return SILENT;
    }

    // Rule 3: sweep the bounded tail's assistant messages for tags.
    const { entries } = parseSessionJsonl(tailRaw);
    const assistantText = extractMessages(entries)
      .filter((m) => m.role === 'assistant')
      .map((m) => m.text)
      .join('\n');
    const tags = extractPurposeTags(assistantText);
    if (tags.length === 0) return SILENT; // no tags → no writes, nothing at all

    // Applied-tag memory (Rule 6): hashes of every tag already processed —
    // applied OR invalid (invalid tags are remembered, never retried).
    const appliedPath = path.join(root, '.cortex', 'pulse', READBACK_APPLIED_FILE);
    const applied = new Set<string>();
    try {
      if (fs.existsSync(appliedPath)) {
        for (const line of fs.readFileSync(appliedPath, 'utf-8').split('\n')) {
          if (line.trim()) applied.add(line.trim());
        }
      }
    } catch {
      /* unreadable memory → treat as empty; re-application is idempotent */
    }

    const fresh = tags.filter((t) => !applied.has(t.hash));
    if (fresh.length === 0) return SILENT;

    // Rule 7: corrupt anatomy → no write, one entry, exit 0 — and the tags
    // stay unprocessed (nothing is remembered off a failed parse).
    const table = parseFilesMdTable(fs.readFileSync(filesMdPath, 'utf-8'));
    if (table === null) {
      appendHookError(root, { hook: HOOK_NAME, file: '.cortex/anatomy/files.md', failure: 'existing files.md could not be parsed as an anatomy-files table; writeback skipped' }, now);
      return SILENT;
    }

    const lines = [...table.lines];
    const nowIso = sanitizeCell(now.toISOString());
    const processedHashes: string[] = [];
    let appliedCount = 0;

    for (const tag of fresh) {
      if (processedHashes.includes(tag.hash)) continue; // identical tag twice in one sweep

      // Rule 4 validation: the file attribute must resolve to a row.
      const relPath = tag.file.replace(/^\.\//, '').replace(/\\/g, '/');
      const rowIdx = table.rowIdxByPath.get(sanitizeCell(relPath));
      const purpose = validateWritebackPurpose(tag.payload);

      if (rowIdx === undefined || purpose === null) {
        const reason = rowIdx === undefined
          ? `tag file "${tag.file}" has no anatomy row`
          : `tag payload for "${tag.file}" is invalid (empty, multi-line, or over ${WRITEBACK_MAX_CHARS} chars)`;
        appendHookError(root, { hook: HOOK_NAME, file: relPath || '(tag)', failure: `writeback rejected: ${reason}` }, now);
        processedHashes.push(tag.hash); // remembered — never retried (Rule 4)
        continue;
      }

      const cells = splitDataRowCells(lines[rowIdx] ?? '');
      if (cells === null || !isDataRowShape(cells)) {
        processedHashes.push(tag.hash);
        continue; // defensive; parse guaranteed shape
      }

      // Rule 5 — apply: purpose + purpose_source: read-time + last_seen in ONE
      // re-emitted row; needs_purpose_refresh cleared. read-time tops the §4.1
      // trust ordering, so the write is always permitted.
      lines[rowIdx] = emitFilesMdRow({
        path: cells[0] ?? '',
        purpose,
        tokens: Number(cells[2] ?? 0),
        sha256: cells[3] ?? '',
        lastSeen: nowIso,
        specLinksCell: cells[5] || '-',
        needsPurposeRefresh: false,
        purposeSource: PURPOSE_SOURCE_READ_TIME,
      });
      processedHashes.push(tag.hash);
      appliedCount++;
    }

    if (appliedCount > 0) {
      try {
        fs.writeFileSync(filesMdPath, lines.join('\n'), 'utf-8');
      } catch (err) {
        appendHookError(root, { hook: HOOK_NAME, file: '.cortex/anatomy/files.md', failure: `write failed: ${(err as Error).message}` }, now);
        return SILENT; // failed write → nothing remembered; next fire retries
      }
    }

    if (processedHashes.length > 0) {
      try {
        fs.mkdirSync(path.dirname(appliedPath), { recursive: true });
        fs.appendFileSync(appliedPath, processedHashes.map((h) => h + '\n').join(''), 'utf-8');
      } catch {
        /* memory write failure is harmless — re-application is idempotent */
      }
    }

    return SILENT;
  } catch (err) {
    // Rule 2: always silent, always exit 0 — even on an internal crash.
    try {
      appendHookError(path.resolve(opts?.cwd ?? process.cwd()), {
        hook: HOOK_NAME,
        file: '(unknown)',
        failure: (err as Error).message,
      });
    } catch {
      /* swallowed */
    }
    return SILENT;
  }
}
