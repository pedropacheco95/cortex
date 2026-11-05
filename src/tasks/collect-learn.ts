/**
 * `cortex tasks collect learn` (spec loops.learn-task Rule 2): the sessions to
 * mine, condensed into a scratch directory outside the repository. Reads only
 * transcripts, git and `cortex/history/`; the judgement is the skill's.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { extractMessages, listSessions, readSessionFile, type SessionInfo } from '../sessions/read.js';
import { condenseSession } from '../sessions/condense.js';
import { isScheduledPromptText } from '../hooks/harness.js';

/** A session touched more recently than this may still be live. */
export const SESSION_QUIET_HOURS = 2;
/** How far back a run looks, so a first run does not mine a project's whole history. */
export const LEARN_HORIZON_DAYS = 14;
export const LEARN_MAX_SESSIONS = 10;

export interface CollectLearnOptions {
  projectRoot: string;
  home: string;
  now: Date;
  today: string;
  outDir?: string;
  all?: boolean;
  /** The os tmpdir, injected so tests stay in their fixtures. */
  tmpDir?: string;
}

export interface CollectedSession {
  id: string;
  modified: string;
  parts: string[];
  skippedLines: number;
  redactions: number;
}

export interface CollectLearnResult {
  today: string;
  outDir: string;
  remaining: number;
  sessions: CollectedSession[];
}

/** The project root and every path `git worktree list` prints for it (Rule 2). */
function projectPaths(root: string): string[] {
  const paths = [root];
  try {
    const out = execFileSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of out.split('\n')) {
      if (line.startsWith('worktree ')) paths.push(line.slice('worktree '.length));
    }
  } catch {
    // Not a git repository: the root alone.
  }
  return [...new Set(paths)];
}

function minedIds(root: string): Set<string> {
  const ids = new Set<string>();
  const dir = path.join(root, 'cortex', 'history', 'sources');
  if (!fs.existsSync(dir)) return ids;
  for (const name of fs.readdirSync(dir)) {
    const m = /-session-(.+)\.md$/.exec(name);
    if (m) ids.add(m[1] as string);
  }
  return ids;
}

function isScheduled(session: SessionInfo): boolean {
  const first = extractMessages(readSessionFile(session.path).entries).find((m) => m.role === 'user');
  return first !== undefined && isScheduledPromptText(first.text);
}

export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function collectLearn(opts: CollectLearnOptions): CollectLearnResult {
  const root = path.resolve(opts.projectRoot);
  const outDir = path.resolve(opts.outDir ?? path.join(opts.tmpDir ?? os.tmpdir(), 'cortex-learn', opts.today));
  const mined = minedIds(root);
  const quietBefore = opts.now.getTime() - SESSION_QUIET_HOURS * 3_600_000;
  const horizon = new Date(`${opts.today}T00:00:00Z`).getTime() - LEARN_HORIZON_DAYS * 86_400_000;

  const seen = new Set<string>();
  const qualifying: SessionInfo[] = [];
  for (const p of projectPaths(root)) {
    for (const s of listSessions(p, { home: opts.home })) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const t = s.mtime.getTime();
      if (mined.has(s.id) || t > quietBefore) continue;
      if (opts.all !== true && t < horizon) continue;
      if (!isScheduled(s)) qualifying.push(s);
    }
  }
  qualifying.sort((a, b) => a.mtime.getTime() - b.mtime.getTime() || a.id.localeCompare(b.id));

  const listed = qualifying.slice(0, LEARN_MAX_SESSIONS);
  const sessions: CollectedSession[] = [];
  for (const s of listed) {
    const read = readSessionFile(s.path);
    const condensed = condenseSession(read.entries);
    fs.mkdirSync(outDir, { recursive: true });
    const parts = condensed.parts.map((text, i) => {
      const name = condensed.parts.length === 1 ? `${s.id}.md` : `${s.id}-part${i + 1}.md`;
      const file = path.join(outDir, name);
      fs.writeFileSync(file, text + '\n', 'utf-8');
      return file;
    });
    sessions.push({
      id: s.id,
      modified: s.mtime.toISOString(),
      parts,
      skippedLines: read.skipped,
      redactions: condensed.redactions,
    });
  }
  return { today: opts.today, outDir, remaining: qualifying.length - listed.length, sessions };
}
