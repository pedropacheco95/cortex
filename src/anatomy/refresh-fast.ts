/**
 * `cortex anatomy-refresh-fast` / `cortex loop-anatomy-refresh --fast` — the
 * post-commit tier of mark-dirty-fast / refresh-deep (spec anatomy.refresh-fast,
 * design §11.4 item 3). Commit-scoped: re-derives tokens/sha256 and the
 * tree-sitter edges for exactly the files the last commit touched, flags
 * changed files `needs_purpose_refresh: true`, removes deleted rows/edges.
 * Zero LLM calls (R-001); nothing written outside `.cortex/anatomy/`; every
 * error degrades to exit 0 with a `pulse/hook-errors.md` entry — the git hook
 * path must never disturb a commit.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { extract } from './parse.js';
import { resolveImport } from './scan.js';
import {
  sanitizeCell,
  computeSha256,
  computeTokens,
  splitDataRowCells,
  emitFilesMdRow,
  parseFilesMdTable,
  PLACEHOLDER_PURPOSE,
} from './files-md.js';
import { hasExcludedSegment, buildIgnoreFilter } from './exclude.js';
import { appendHookError } from '../hooks/errors.js';

const HOOK_NAME = 'anatomy-refresh-fast';

export interface CommitScope {
  /** Modified or added paths (row refresh + edge replacement). */
  changed: string[];
  /** Deleted paths (row + edge removal). */
  deleted: string[];
}

/**
 * Parse `git diff-tree --no-commit-id --name-status -r HEAD` output.
 * Statuses: M/A → changed, D → deleted; renames (R<score>, two paths) are
 * treated as delete(old) + add(new); copies (C<score>) as add(new).
 * Unknown statuses and blank lines are ignored.
 */
export function parseNameStatus(output: string): CommitScope {
  const changed: string[] = [];
  const deleted: string[] = [];
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = (parts[0] ?? '').trim();
    const p1 = parts[1];
    const p2 = parts[2];
    if (!status || !p1) continue;
    const kind = status[0] ?? '';
    if (kind === 'M' || kind === 'A') {
      changed.push(p1);
    } else if (kind === 'D') {
      deleted.push(p1);
    } else if (kind === 'R') {
      // rename → delete old + add new (fast tier keeps no identity across paths)
      deleted.push(p1);
      if (p2) changed.push(p2);
    } else if (kind === 'C') {
      if (p2) changed.push(p2);
    }
  }
  return { changed, deleted };
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: 'import' | 'export';
}

/**
 * Rule 5 edge replacement: keep every edge whose `from` is NOT a changed file
 * and whose endpoints touch no deleted file; add the freshly parsed edges for
 * the changed files. All other edges byte-untouched.
 */
export function replaceEdges(
  existing: GraphEdge[],
  changedFrom: Set<string>,
  deleted: Set<string>,
  fresh: GraphEdge[],
): GraphEdge[] {
  const kept = existing.filter(
    (e) => !changedFrom.has(e.from) && !deleted.has(e.from) && !deleted.has(e.to),
  );
  const next = [...kept, ...fresh.filter((e) => !deleted.has(e.to))];
  next.sort((a, b) => {
    if (a.from < b.from) return -1;
    if (a.from > b.from) return 1;
    if (a.to < b.to) return -1;
    if (a.to > b.to) return 1;
    return 0;
  });
  return next;
}

function lastCommitScope(absRoot: string): CommitScope | null {
  try {
    const out = execFileSync(
      'git',
      ['diff-tree', '--no-commit-id', '--name-status', '-r', 'HEAD'],
      { cwd: absRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return parseNameStatus(out);
  } catch {
    // not a git repo, no commit yet, or no git binary → silent no-op (Rule 2)
    return null;
  }
}

/** Parse graph.json; null when absent or corrupt. */
function readGraph(graphPath: string): { nodes: string[]; edges: GraphEdge[] } | null {
  if (!fs.existsSync(graphPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(graphPath, 'utf-8')) as Record<string, unknown>;
    const nodes = parsed['nodes'];
    const edges = parsed['edges'];
    if (!Array.isArray(nodes) || !Array.isArray(edges)) return null;
    return {
      nodes: nodes.filter((n): n is string => typeof n === 'string'),
      edges: edges.filter(
        (e): e is GraphEdge =>
          typeof e === 'object' && e !== null &&
          typeof (e as GraphEdge).from === 'string' && typeof (e as GraphEdge).to === 'string',
      ),
    };
  } catch {
    return null;
  }
}

export interface RefreshFastOptions {
  /** Testability seam: the clock. */
  now?: Date;
}

/**
 * The fast tier. Exit 0 in every case (hook-safe); non-repo and unscanned
 * projects are silent no-ops.
 */
export async function runRefreshFast(root = '.', opts: RefreshFastOptions = {}): Promise<number> {
  const absRoot = path.resolve(root);
  try {
    // Rule 7: unscanned project → silent no-op.
    const filesMdPath = path.join(absRoot, '.cortex', 'anatomy', 'files.md');
    if (!fs.existsSync(filesMdPath)) return 0;

    // Rule 2: scope = the last commit; not a repo / no commit → silent no-op.
    const scope = lastCommitScope(absRoot);
    if (scope === null) return 0;

    // Exclusion filtering (Rule 2): .gitignore + anatomy.exclude + hard
    // segments, plus dot-segment paths — the scanner lists with fg dot:false,
    // so dotfiles are never anatomy scope and must not be appended here.
    const ig = buildIgnoreFilter(absRoot);
    const inScope = (p: string): boolean =>
      !hasExcludedSegment(p) &&
      !p.split('/').some((s) => s.startsWith('.')) &&
      !ig.ignores(p);
    const changed = scope.changed.filter(inScope);
    const deleted = scope.deleted.filter(inScope);
    if (changed.length === 0 && deleted.length === 0) return 0;

    const raw = fs.readFileSync(filesMdPath, 'utf-8');
    const table = parseFilesMdTable(raw);
    if (table === null) {
      // Hook-safe degradation: corrupt files.md → no write, one pulse entry, exit 0.
      appendHookError(
        absRoot,
        {
          hook: HOOK_NAME,
          file: '.cortex/anatomy/files.md',
          failure: 'existing files.md could not be parsed as an anatomy-files table; commit-scoped refresh skipped',
        },
        opts.now ?? new Date(),
      );
      return 0;
    }

    const now = opts.now ?? new Date();
    const nowIso = now.toISOString();
    const lines = [...table.lines];
    const deletedRowIdx = new Set<number>();
    /** Files whose row refresh happened (their edges get replaced). */
    const parsedChanged: string[] = [];
    const freshEdges: GraphEdge[] = [];
    const addedPaths: string[] = [];
    let appended = 0;
    let refreshed = 0;

    // Deleted files: drop rows.
    for (const rel of deleted) {
      const idx = table.rowIdxByPath.get(sanitizeCell(rel));
      if (idx !== undefined) deletedRowIdx.add(idx);
    }

    // Modified/added files: row refresh + tree-sitter re-parse for edges.
    const appendRows: string[] = [];
    for (const rel of changed) {
      let content: string;
      try {
        content = fs.readFileSync(path.join(absRoot, rel), 'utf-8');
      } catch {
        continue; // vanished since the commit → nothing to index this pass
      }
      const sha256 = computeSha256(content);
      const tokens = computeTokens(content);
      const pathCell = sanitizeCell(rel);
      const idx = table.rowIdxByPath.get(pathCell);

      if (idx !== undefined && !deletedRowIdx.has(idx)) {
        const cells = splitDataRowCells(lines[idx] ?? '');
        if (cells === null || cells.length !== 7) continue; // defensive; parse guaranteed 7
        if (cells[3] !== sha256) {
          // Rule 3 + Rule 4 (atomic row write): tokens, sha256, flag, and
          // last_seen land in the ONE re-emitted row — never last_seen alone.
          lines[idx] = emitFilesMdRow({
            path: cells[0] ?? '',
            purpose: cells[1] ?? '',
            tokens,
            sha256,
            lastSeen: sanitizeCell(nowIso),
            specLinksCell: cells[5] || '-',
            needsPurposeRefresh: true,
          });
          refreshed++;
        }
      } else if (idx === undefined) {
        // Rule 3: new file appended with placeholder purpose (scanner/post-write
        // conventions: spec_links '-'; link re-derivation is the scanner's business).
        appendRows.push(
          emitFilesMdRow({
            path: pathCell,
            purpose: PLACEHOLDER_PURPOSE,
            tokens,
            sha256,
            lastSeen: sanitizeCell(nowIso),
            specLinksCell: '-',
            needsPurposeRefresh: true,
          }),
        );
        addedPaths.push(rel);
        appended++;
      }

      // Rule 5: re-parse for edges regardless of whether the hash moved — the
      // scope is "changed `from` files", and the parse is cheap and local.
      parsedChanged.push(rel);
      const extracted = await extract(path.extname(rel).toLowerCase(), content);
      const seen = new Set<string>();
      for (const imp of extracted.imports) {
        if (imp.startsWith('./') || imp.startsWith('../')) {
          const resolved = resolveImport(absRoot, rel, imp);
          if (resolved && !seen.has(resolved)) {
            seen.add(resolved);
            freshEdges.push({ from: rel, to: resolved, kind: 'import' });
          }
        }
      }
    }

    const rowsChanged = refreshed > 0 || appended > 0 || deletedRowIdx.size > 0;
    if (rowsChanged) {
      const nextLines = lines.filter((_, i) => !deletedRowIdx.has(i));
      // Append after the last table line (post-write convention). Deletions
      // above lastTableIdx only shift it down; recompute the splice point.
      const removedBefore = [...deletedRowIdx].filter((i) => i <= table.lastTableIdx).length;
      nextLines.splice(table.lastTableIdx + 1 - removedBefore, 0, ...appendRows);
      fs.writeFileSync(filesMdPath, nextLines.join('\n'), 'utf-8');
    }

    // Rule 5: graph — replace edges from changed files, drop deleted endpoints,
    // add/remove nodes. Corrupt graph.json degrades to a pulse entry (files.md
    // above is already refreshed; the graph is left for the next full scan).
    const graphPath = path.join(absRoot, '.cortex', 'anatomy', 'graph.json');
    if (fs.existsSync(graphPath)) {
      const graph = readGraph(graphPath);
      if (graph === null) {
        appendHookError(
          absRoot,
          { hook: HOOK_NAME, file: '.cortex/anatomy/graph.json', failure: 'graph.json could not be parsed; edge refresh skipped' },
          now,
        );
      } else {
        const deletedSet = new Set(deleted);
        const changedFrom = new Set(parsedChanged);
        const nextEdges = replaceEdges(graph.edges, changedFrom, deletedSet, freshEdges);
        const nodeSet = new Set(graph.nodes.filter((n) => !deletedSet.has(n)));
        for (const p of addedPaths) nodeSet.add(p);
        const nextNodes = [...nodeSet].sort();
        fs.writeFileSync(graphPath, JSON.stringify({ nodes: nextNodes, edges: nextEdges }, null, 2), 'utf-8');
      }
    }

    if (rowsChanged) {
      console.log(
        `cortex anatomy-refresh-fast: ${refreshed} row(s) refreshed, ${appended} appended, ${deletedRowIdx.size} removed.`,
      );
    }
    return 0;
  } catch (err) {
    // Rule 6: the hook path never disturbs a commit — degrade, log, exit 0.
    try {
      appendHookError(absRoot, { hook: HOOK_NAME, file: '(unknown)', failure: (err as Error).message }, opts.now ?? new Date());
    } catch {
      /* swallowed */
    }
    return 0;
  }
}
