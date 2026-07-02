/**
 * Shared `anatomy/files.md` row conventions (schema §4.1).
 *
 * Single home for the cell sanitiser, the cheap-field computations
 * (tokens = chars/4, sha256), and the row parse/emit format — used by the
 * scanner (anatomy.scanner) and the PostWrite hook (hooks.post-write) so the
 * two can never drift apart.
 */
import * as crypto from 'crypto';

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
