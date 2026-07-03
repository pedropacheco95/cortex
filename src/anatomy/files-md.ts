/**
 * Shared `anatomy/files.md` row conventions (schema §4.1).
 *
 * Single home for the cell sanitiser, the cheap-field computations
 * (tokens = chars/4, sha256), the row parse/emit format, and the line-level
 * table parse — used by the scanner (anatomy.scanner), the PostWrite hook
 * (hooks.post-write), and the two refresh tiers (anatomy.refresh-fast /
 * anatomy.refresh-deep) so the four can never drift apart.
 */
import * as crypto from 'crypto';
import matter from 'gray-matter';

export const FILES_MD_TABLE_HEADER =
  '| path | purpose | tokens | sha256 | last_seen | spec_links | needs_purpose_refresh |';
export const FILES_MD_TABLE_SEP =
  '|------|---------|--------|--------|-----------|------------|-----------------------|';

/** Placeholder purpose the scanner uses for rows awaiting the deep pass. */
export const PLACEHOLDER_PURPOSE = '(needs purpose)';

/** Cell sanitiser: no pipes, no newlines, no `---` runs (would read as a separator). */
export function sanitizeCell(s: string): string {
  return s
    .replace(/\|/g, '/')
    .replace(/[\r\n]+/g, ' ')
    .replace(/-{3,}/g, '—')
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeSha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Token estimate per schema §5 / design §6.3: chars/4, rounded up. */
export function computeTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Split a files.md line into its 7 (or however many) trimmed cells.
 * Returns null for non-table lines, the separator row, and the header row.
 */
export function splitDataRowCells(line: string): string[] | null {
  if (!line.trim().startsWith('|')) return null;
  if (line.includes('---')) return null; // separator (sanitizeCell keeps `---` out of cells)
  const cols = line
    .split('|')
    .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
    .map((c) => c.trim());
  if (cols[0] === 'path') return null; // header row
  return cols;
}

export interface FilesMdRowFields {
  /** Already-sanitised path cell. */
  path: string;
  /** Already-sanitised purpose cell. */
  purpose: string;
  tokens: number;
  sha256: string;
  /** Already-sanitised iso-datetime cell. */
  lastSeen: string;
  /** Already-sanitised spec_links cell (space-separated IDs, or `-`). */
  specLinksCell: string;
  needsPurposeRefresh: boolean;
}

/** Emit one table row in the exact scanner format (schema §4.1 column order). */
export function emitFilesMdRow(f: FilesMdRowFields): string {
  return `| ${f.path} | ${f.purpose} | ${f.tokens} | ${f.sha256} | ${f.lastSeen} | ${f.specLinksCell} | ${String(f.needsPurposeRefresh)} |`;
}

export interface ParsedFilesMdTable {
  /** Raw lines of the whole file (frontmatter included) — splice-in-place. */
  lines: string[];
  /** Index of the last table line (header, separator, or row). */
  lastTableIdx: number;
  /** Data-row line index per path cell. */
  rowIdxByPath: Map<string, number>;
}

/**
 * Line-level parse of files.md (moved verbatim from hooks.post-write so the
 * refresh tiers share the ONE corruption contract). Returns null when the
 * artefact is corrupt (bad frontmatter, missing table, or malformed rows) —
 * in that case the caller must never write (corruption is a log, never a
 * destroy).
 */
export function parseFilesMdTable(raw: string): ParsedFilesMdTable | null {
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
