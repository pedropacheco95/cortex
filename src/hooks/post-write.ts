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
import {
  sanitizeCell,
  computeSha256,
  computeTokens,
  splitDataRowCells,
  emitFilesMdRow,
  parseFilesMdTable,
  isDataRowShape,
  purposeSourceCell,
  PLACEHOLDER_PURPOSE,
  NO_PURPOSE_SOURCE,
} from '../anatomy/files-md.js';
import { hasExcludedSegment, buildIgnoreFilter } from '../anatomy/exclude.js';
import { appendHookError } from './errors.js';
import type { HookRunResult, HookRunOptions } from './session-start.js';

const HOOK_NAME = 'post-write';

const SILENT: HookRunResult = { exitCode: 0, stdout: '' };

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
    const table = parseFilesMdTable(raw);
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
      if (cells === null || !isDataRowShape(cells)) return SILENT; // defensive; parse guaranteed shape
      // Rule 4: unchanged hash → the row stays byte-identical (flag + last_seen included).
      if (cells[3] === sha256) return SILENT;
      // Rule 3: fast tier — recompute cheap fields, keep purpose + spec_links
      // + purpose_source (provenance follows the purpose), flag the purpose
      // stale. No re-derivation here.
      nextLines = [...table.lines];
      nextLines[rowIdx] = emitFilesMdRow({
        path: cells[0] ?? '',
        purpose: cells[1] ?? '',
        tokens,
        sha256,
        lastSeen: sanitizeCell(lastSeen),
        specLinksCell: cells[5] || '-',
        needsPurposeRefresh: true,
        purposeSource: purposeSourceCell(cells),
      });
    } else {
      // Rule 5: new file → append with placeholder purpose, scanner conventions
      // (purpose_source `-` while the purpose is a placeholder, §4.1).
      const newRow = emitFilesMdRow({
        path: sanitizeCell(relPath),
        purpose: PLACEHOLDER_PURPOSE,
        tokens,
        sha256,
        lastSeen: sanitizeCell(lastSeen),
        specLinksCell: '-',
        needsPurposeRefresh: true,
        purposeSource: NO_PURPOSE_SOURCE,
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
