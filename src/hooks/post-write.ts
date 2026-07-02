/**
 * PostWrite hook — PostToolUse on Write|Edit (spec hooks.post-write).
 *
 * The fast tier of mark-dirty-fast / refresh-deep (design §11.4): refresh the
 * written file's `anatomy/files.md` row (tokens, sha256, last_seen) and flag
 * `needs_purpose_refresh: true` when the hash changed. No tree-sitter, no
 * purpose re-derivation, no graph.json updates. Always exit 0, always empty
 * stdout (Rule 2) — Claude never hears from this hook.
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import {
  sanitizeCell,
  computeSha256,
  computeTokens,
  splitDataRowCells,
  emitFilesMdRow,
  PLACEHOLDER_PURPOSE,
} from '../anatomy/files-md.js';
import { hasExcludedSegment, buildIgnoreFilter } from '../anatomy/exclude.js';
import { appendHookError } from './errors.js';
import type { HookRunResult, HookRunOptions } from './session-start.js';

const HOOK_NAME = 'post-write';

const SILENT: HookRunResult = { exitCode: 0, stdout: '' };

interface ParsedTable {
  /** Raw lines of the whole file (frontmatter included) — splice-in-place. */
  lines: string[];
  /** Index of the last table line (header, separator, or row). */
  lastTableIdx: number;
  /** Data-row line index per path cell. */
  rowIdxByPath: Map<string, number>;
}

/**
 * Line-level parse of files.md. Returns null when the artefact is corrupt
 * (bad frontmatter, missing table, or malformed rows) — in that case the hook
 * must never write (Rule 7: corruption is a log, never a destroy).
 */
function parseFilesMd(raw: string): ParsedTable | null {
  let data: Record<string, unknown>;
  try {
    data = matter(raw).data as Record<string, unknown>;
  } catch {
    return null;
  }
  if (data['kind'] !== 'anatomy-files') return null;

  const lines = raw.split('\n');
  const rowIdxByPath = new Map<string, number>();
  let sawHeader = false;
  let lastTableIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line.trim().startsWith('|')) continue;
    if (line.includes('---')) {
      // frontmatter fences don't start with '|'; this is the table separator
      lastTableIdx = i;
      continue;
    }
    const cells = splitDataRowCells(line);
    if (cells === null) {
      // a '|' line that isn't a separator and isn't a data row → header
      sawHeader = true;
      lastTableIdx = i;
      continue;
    }
    if (cells.length !== 7 || !cells[0]) return null; // truncated/malformed row
    rowIdxByPath.set(cells[0], i);
    lastTableIdx = i;
  }

  if (!sawHeader || lastTableIdx < 0) return null; // no recognisable table
  return { lines, lastTableIdx, rowIdxByPath };
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

    const toolInput = (stdin['tool_input'] ?? {}) as Record<string, unknown>;
    const filePath = toolInput['file_path'];
    if (typeof filePath !== 'string' || filePath.length === 0) return SILENT;

    // Rule 7: no .cortex/ or no anatomy/files.md → the project isn't scanned →
    // silent no-op, no pulse entry.
    const filesMdPath = path.join(root, '.cortex', 'anatomy', 'files.md');
    if (!fs.existsSync(filesMdPath)) return SILENT;

    // Rule 6: outside the project root → no-op.
    const relPath = path.relative(root, path.resolve(root, filePath)).replace(/\\/g, '/');
    if (relPath.startsWith('..') || path.isAbsolute(relPath) || relPath.length === 0) return SILENT;

    // Rule 6: hard-excluded segments, .gitignore, and anatomy.exclude → no-op.
    if (hasExcludedSegment(relPath)) return SILENT;
    if (buildIgnoreFilter(root).ignores(relPath)) return SILENT;

    // Post-write state on disk. Vanished file → nothing to index; no-op.
    let content: string;
    try {
      content = fs.readFileSync(path.join(root, relPath), 'utf-8');
    } catch {
      return SILENT;
    }

    const raw = fs.readFileSync(filesMdPath, 'utf-8');
    const table = parseFilesMd(raw);
    if (table === null) {
      // Rule 7: corrupt artefact → never write, log, exit 0.
      appendHookError(
        root,
        { hook: HOOK_NAME, file: '.cortex/anatomy/files.md', failure: 'existing files.md could not be parsed as an anatomy-files table; row not updated' },
        now,
      );
      return SILENT;
    }

    const sha256 = computeSha256(content);
    const tokens = computeTokens(content);
    const lastSeen = now.toISOString();

    const rowIdx = table.rowIdxByPath.get(sanitizeCell(relPath));
    let nextLines: string[];

    if (rowIdx !== undefined) {
      const cells = splitDataRowCells(table.lines[rowIdx] ?? '');
      if (cells === null || cells.length !== 7) return SILENT; // defensive; parse guaranteed 7
      // Rule 4: unchanged hash → the row stays byte-identical (flag + last_seen included).
      if (cells[3] === sha256) return SILENT;
      // Rule 3: fast tier — recompute cheap fields, keep purpose + spec_links,
      // flag the purpose stale. No re-derivation here.
      nextLines = [...table.lines];
      nextLines[rowIdx] = emitFilesMdRow({
        path: cells[0] ?? '',
        purpose: cells[1] ?? '',
        tokens,
        sha256,
        lastSeen: sanitizeCell(lastSeen),
        specLinksCell: cells[5] || '-',
        needsPurposeRefresh: true,
      });
    } else {
      // Rule 5: new file → append with placeholder purpose, scanner conventions.
      const newRow = emitFilesMdRow({
        path: sanitizeCell(relPath),
        purpose: PLACEHOLDER_PURPOSE,
        tokens,
        sha256,
        lastSeen: sanitizeCell(lastSeen),
        specLinksCell: '-',
        needsPurposeRefresh: true,
      });
      nextLines = [...table.lines];
      nextLines.splice(table.lastTableIdx + 1, 0, newRow);
    }

    try {
      fs.writeFileSync(filesMdPath, nextLines.join('\n'), 'utf-8');
    } catch (err) {
      appendHookError(
        root,
        { hook: HOOK_NAME, file: '.cortex/anatomy/files.md', failure: `write failed: ${(err as Error).message}` },
        now,
      );
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
