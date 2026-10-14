/**
 * The git reads the 4.0 checks make (append-only, stale, trailers; migrate's
 * pinned sha). Read-only `git` subprocesses; every function degrades to
 * "not a repository" instead of throwing.
 */
import { execFileSync } from 'child_process';

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
}

export function isGitRepo(root: string): boolean {
  return git(root, ['rev-parse', '--is-inside-work-tree'])?.trim() === 'true';
}

export function headShortSha(root: string): string | null {
  return git(root, ['rev-parse', '--short=7', 'HEAD'])?.trim() || null;
}

/** The content a path had in the commit that first added it, or null when it was never committed. */
export function firstCommittedContent(root: string, repoRel: string): string | null {
  const shas = git(root, ['log', '--diff-filter=A', '--format=%H', '--', repoRel]);
  if (!shas) return null;
  const first = shas.trim().split('\n').filter(Boolean).pop();
  if (!first) return null;
  return git(root, ['show', `${first}:${repoRel}`]);
}

export interface CommitRef { sha: string; date: string }

/** The newest commit touching `pathspec` after the end of `date` (`git log --since=<date+1 day>`). */
export function newestCommitAfter(root: string, pathspec: string, date: string): CommitRef | null {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + 1);
  const p = (n: number): string => String(n).padStart(2, '0');
  const since = `${next.getFullYear()}-${p(next.getMonth() + 1)}-${p(next.getDate())}T00:00:00`;
  const out = git(root, ['log', '-1', `--since=${since}`, '--format=%h %cs', '--', pathspec]);
  if (!out || !out.trim()) return null;
  const [sha, d] = out.trim().split(' ');
  return { sha: sha!, date: d! };
}

export interface CommitMessage { sha: string; body: string }

export function recentCommits(root: string, n: number): CommitMessage[] {
  const out = git(root, ['log', `-${n}`, '--format=%h%x00%B%x1e']);
  if (!out) return [];
  return out.split('\x1e').map((r) => r.replace(/^\n/, '')).filter((r) => r.includes('\0')).map((r) => {
    const [sha, body] = r.split('\0');
    return { sha: sha!, body: body ?? '' };
  });
}
