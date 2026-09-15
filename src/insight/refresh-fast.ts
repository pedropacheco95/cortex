/**
 * `cortex insight-refresh-fast` / `cortex loop-insight-refresh --fast` — the
 * post-commit tier of the three insight-refresh loops (spec
 * insight.refresh-loops Rule 1; design §5.9, §9; schema §9.1). Deterministic,
 * NO LLM anywhere in this path (R-001), NO extraction: it diffs the last
 * commit, applies the Core structural significance filter (formatting-only /
 * comment-only / whitespace / import-reordering changes are ruled out), and
 * flags the survivors into `.cortex/pulse/state/insight-refresh-worklist.json` for
 * the daily loop. `ledger.json` is NOT updated here — that happens only on a
 * successful re-extraction (daily apply). Since 3.4 it also rebuilds the
 * recall index (`.cortex/recall-index.json`, schema §4.11) before its ledger
 * gate, whenever `.cortex/` exists (spec Rule 9).
 *
 * Hook-safe: every failure degrades to exit 0 with a `pulse/hook-errors.md`
 * entry; an unextracted project (no ledger) and a non-repo are silent no-ops.
 * The SOLE post-commit invocation since build-order-v3 step 7 retired the
 * anatomy fast tier and consolidated the git hook.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { buildIgnoreFilter, hasExcludedSegment } from './exclude.js';
import {
  L1_SKIP_DIRS,
  L1_SENSITIVE_DIRS,
  L1_BINARY_EXTENSIONS,
  isSkipListedFile,
  isSensitiveFile,
  languageForExt,
} from './l1-triage.js';
import { classifyChange } from './significance.js';
import { parseLedger, type LedgerFile } from './storage.js';
import { appendHookError } from '../hooks/errors.js';

const HOOK_NAME = 'insight-refresh-fast';

export interface CommitScope {
  /** Modified or added paths. */
  changed: string[];
  /** Deleted paths. */
  deleted: string[];
}

/**
 * Parse `git diff-tree --no-commit-id --name-status -r HEAD` output.
 * Statuses: M/A → changed, D → deleted; renames (R<score>, two paths) are
 * treated as delete(old) + add(new); copies (C<score>) as add(new).
 * Unknown statuses and blank lines are ignored. (Relocated verbatim from
 * `src/anatomy/refresh-fast.ts` at build-order-v3 step 7.)
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

/** The v3 fast-tier worklist (replaces the v2 node-set worklist of the same
 *  filename — the v2 `cortex loop-insight-refresh` is retired, design §8.3). */
export const INSIGHT_WORKLIST_FILE = 'insight-refresh-worklist.json';

export type FlagReason = 'changed' | 'significant' | 'uncertain' | 'new' | 'deleted';

export interface FlaggedFile {
  path: string;
  reason: FlagReason;
  /** The structural filter's one-line explanation. */
  detail: string;
}

export interface InsightRefreshWorklist {
  kind: 'insight-refresh-worklist';
  generated: string;
  flagged: FlaggedFile[];
}

/** Machine working state under `pulse/state/` (pulse reorg). */
function stateDir(root: string): string {
  return path.join(root, '.cortex', 'pulse', 'state');
}

export function worklistPath(root: string): string {
  return path.join(stateDir(root), INSIGHT_WORKLIST_FILE);
}

/** Read the (v3-shaped) worklist; absent/garbled/v2-shaped → empty. */
export function readWorklist(root: string): FlaggedFile[] {
  const p = worklistPath(root);
  if (!fs.existsSync(p)) return [];
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf-8')) as Partial<InsightRefreshWorklist>;
    if (doc.kind !== 'insight-refresh-worklist' || !Array.isArray(doc.flagged)) return [];
    return doc.flagged.filter(
      (f): f is FlaggedFile =>
        typeof f === 'object' && f !== null &&
        typeof (f as FlaggedFile).path === 'string' &&
        typeof (f as FlaggedFile).reason === 'string',
    );
  } catch {
    return [];
  }
}

/** Write the worklist (sorted by path; deterministic but for `generated`). */
export function writeWorklist(root: string, flagged: FlaggedFile[], now: Date): string {
  fs.mkdirSync(stateDir(root), { recursive: true });
  const doc: InsightRefreshWorklist = {
    kind: 'insight-refresh-worklist',
    generated: now.toISOString(),
    flagged: [...flagged].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  };
  const p = worklistPath(root);
  fs.writeFileSync(p, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
  return p;
}

export function readLedger(root: string): LedgerFile | null {
  const p = path.join(root, '.cortex', 'insight', 'ledger.json');
  if (!fs.existsSync(p)) return null;
  const parsed = parseLedger(fs.readFileSync(p, 'utf-8'));
  return parsed.ok && parsed.value ? parsed.value : null;
}

export function sha256Of(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** The file at `rel` as of `commit`, via `git show`; null when unavailable. */
export function gitShow(absRoot: string, commit: string, rel: string): string | null {
  try {
    return execFileSync('git', ['show', `${commit}:${rel}`], {
      cwd: absRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/** In insight scope: not skip-listed / sensitive / binary / ignored (mirrors
 *  the L1 walk's exclusion semantics, spec insight.l1-structural). */
export function isInsightScope(rel: string, ig: { ignores(p: string): boolean }): boolean {
  const segments = rel.split('/');
  const basename = segments[segments.length - 1] ?? rel;
  if (segments.some((s) => L1_SKIP_DIRS.has(s) || L1_SENSITIVE_DIRS.has(s))) return false;
  if (hasExcludedSegment(rel)) return false;
  if (isSkipListedFile(basename) || isSensitiveFile(basename)) return false;
  if (L1_BINARY_EXTENSIONS.has(path.extname(basename).toLowerCase())) return false;
  if (ig.ignores(rel)) return false;
  return true;
}

function lastCommitScope(absRoot: string): { changed: string[]; deleted: string[] } | null {
  try {
    const out = execFileSync(
      'git',
      ['diff-tree', '--no-commit-id', '--name-status', '-r', 'HEAD'],
      { cwd: absRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return parseNameStatus(out);
  } catch {
    return null; // not a repo / no commit / no git → silent no-op
  }
}

export interface RefreshFastOptions {
  now?: Date;
}

/**
 * The fast tier. Exit 0 in every case (hook-safe). Flags survivors of the
 * structural filter; never updates the ledger; never calls an LLM.
 */
export async function runInsightRefreshFast(root = '.', opts: RefreshFastOptions = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();
  try {
    // 3.4 (spec Rule 9; recall.recall-index Rule 11): rebuild the recall
    // index BEFORE the ledger gate, so a project that has never run an
    // extraction still gets a fresh `.cortex/recall-index.json` on every
    // commit — only when `.cortex/` exists (a non-Cortex repo stays
    // untouched). Pure file I/O; a failure is one hook-errors entry and the
    // tier carries on to its own work.
    if (fs.existsSync(path.join(absRoot, '.cortex'))) {
      try {
        const { writeRecallIndex } = await import('../recall/index.js');
        await writeRecallIndex(absRoot);
      } catch (err) {
        appendHookError(absRoot, { hook: HOOK_NAME, file: '.cortex/recall-index.json', failure: (err as Error).message }, now);
      }
    }

    // Unextracted project (no ledger) → silent no-op: there is nothing to
    // keep fresh until cortex-extract-insight has run.
    const ledger = readLedger(absRoot);
    if (ledger === null) return 0;

    const scope = lastCommitScope(absRoot);
    if (scope === null) return 0;

    const ig = buildIgnoreFilter(absRoot);
    const changed = scope.changed.filter((p) => isInsightScope(p, ig));
    const deleted = scope.deleted.filter((p) => isInsightScope(p, ig));
    if (changed.length === 0 && deleted.length === 0) return 0;

    const flags = new Map<string, FlaggedFile>();
    for (const f of readWorklist(absRoot)) flags.set(f.path, f);

    for (const rel of deleted) {
      if (ledger.entries[rel] !== undefined) {
        flags.set(rel, { path: rel, reason: 'deleted', detail: 'file deleted in the last commit' });
      } else {
        flags.delete(rel); // flagged-then-deleted before extraction → moot
      }
    }

    for (const rel of changed) {
      let content: string;
      try {
        content = fs.readFileSync(path.join(absRoot, rel), 'utf-8');
      } catch {
        continue; // vanished since the commit → the next commit reconciles
      }
      const entry = ledger.entries[rel];
      if (entry === undefined) {
        flags.set(rel, { path: rel, reason: 'new', detail: 'no insight entry yet' });
        continue;
      }
      if (sha256Of(content) === entry.source_sha256) {
        flags.delete(rel); // back in sync with the extraction → nothing to do
        continue;
      }
      // Structural significance filter against the extracted baseline.
      const baseline = gitShow(absRoot, entry.built_at_commit, rel);
      if (baseline === null) {
        flags.set(rel, { path: rel, reason: 'changed', detail: 'sha mismatch (no baseline content available)' });
        continue;
      }
      const result = classifyChange(baseline, content, languageForExt(path.extname(rel).toLowerCase()));
      if (result.verdict === 'identical' || result.verdict === 'cosmetic') {
        // Ruled out deterministically — never reaches L2/L3 (spec Rule 2).
        flags.delete(rel);
        continue;
      }
      const reason: FlagReason =
        result.verdict === 'significant-candidate' ? 'significant' : result.verdict === 'uncertain' ? 'uncertain' : 'changed';
      flags.set(rel, { path: rel, reason, detail: result.reason });
    }

    const flagged = [...flags.values()];
    writeWorklist(absRoot, flagged, now);
    if (flagged.length > 0) {
      console.log(
        `cortex insight-refresh-fast: ${flagged.length} file(s) flagged for the daily loop ` +
          `(.cortex/pulse/state/${INSIGHT_WORKLIST_FILE}).`,
      );
    }
    return 0;
  } catch (err) {
    try {
      appendHookError(absRoot, { hook: HOOK_NAME, file: '(unknown)', failure: (err as Error).message }, opts.now ?? new Date());
    } catch {
      /* swallowed — the hook path never disturbs a commit */
    }
    return 0;
  }
}
