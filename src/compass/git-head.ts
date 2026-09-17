/**
 * The head-commit helper (`compass.bug-currency` Rule 4; schema §4.2, 3.4
 * fifth revision). Core writers of a bug file stamp `found_at_commit` from
 * the checkout they run in, and Core spawns no `git` (R-001, RULES.md rule
 * 3): this reads the same files `git rev-parse HEAD` would — `.git/HEAD`,
 * the ref file it names, `packed-refs` — across the three layouts a checkout
 * can have (a `.git` directory, a detached head, a linked worktree whose
 * `.git` is a `gitdir:` file with a `commondir`). At most four small reads,
 * every one wrapped: the helper returns `null` on anything it cannot read or
 * does not understand, and never throws.
 */
import * as fs from 'fs';
import * as path from 'path';

const FULL_SHA_RE = /^[0-9a-fA-F]{40}$/;
const SHORT_SHA_CHARS = 7;

/** Read a UTF-8 file, or `null` when it is absent, unreadable or a directory. */
function readText(abs: string): string | null {
  try {
    return fs.readFileSync(abs, 'utf-8');
  } catch {
    return null;
  }
}

function isDirectory(abs: string): boolean {
  try {
    return fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The git directory of `root`: `<root>/.git` when it is a directory, or the
 * `gitdir: <path>` target when `.git` is a linked-worktree file (one hop —
 * a pointer to another pointer is not followed). `null` when neither.
 */
function gitDirOf(root: string): string | null {
  const dotGit = path.join(root, '.git');
  if (isDirectory(dotGit)) return dotGit;
  const text = readText(dotGit);
  if (text === null) return null;
  const m = /^gitdir:\s*(.+?)\s*$/m.exec(text);
  if (m === null || m[1] === undefined) return null;
  const target = path.resolve(root, m[1]);
  return isDirectory(target) ? target : null;
}

/**
 * The common directory for refs: `<gitdir>/commondir` names it (relative to
 * `<gitdir>`) in a linked worktree; otherwise the git dir itself. One hop.
 */
function commonDirOf(gitDir: string): string {
  const text = readText(path.join(gitDir, 'commondir'));
  if (text === null) return gitDir;
  const rel = text.trim();
  if (rel === '') return gitDir;
  const common = path.resolve(gitDir, rel);
  return isDirectory(common) ? common : gitDir;
}

/** The sha for `refPath` from the loose ref file, else from `packed-refs`. */
function resolveRef(commonDir: string, refPath: string): string | null {
  const loose = readText(path.join(commonDir, ...refPath.split('/')));
  if (loose !== null) {
    const sha = loose.trim();
    return FULL_SHA_RE.test(sha) ? sha : null;
  }
  const packed = readText(path.join(commonDir, 'packed-refs'));
  if (packed === null) return null;
  for (const line of packed.split('\n')) {
    if (line === '' || line.startsWith('#') || line.startsWith('^')) continue;
    const sp = line.indexOf(' ');
    if (sp === -1) continue;
    const sha = line.slice(0, sp).trim();
    const name = line.slice(sp + 1).trim();
    if (name === refPath && FULL_SHA_RE.test(sha)) return sha;
  }
  return null;
}

/**
 * `readHeadCommit(root)` — the first 7 characters of HEAD's 40-hex sha,
 * lowercase (`git rev-parse --short HEAD`'s default width), or `null` when
 * `root` is not a checkout this reader understands. Pure file I/O; never
 * throws; never spawns `git`.
 */
export function readHeadCommit(root: string): string | null {
  try {
    const gitDir = gitDirOf(root);
    if (gitDir === null) return null;
    const head = readText(path.join(gitDir, 'HEAD'));
    if (head === null) return null;
    const content = head.trim();
    let sha: string | null = null;
    const ref = /^ref:\s*(\S+)$/.exec(content);
    if (ref !== null && ref[1] !== undefined) {
      sha = resolveRef(commonDirOf(gitDir), ref[1]);
    } else if (FULL_SHA_RE.test(content)) {
      sha = content;
    }
    return sha === null ? null : sha.slice(0, SHORT_SHA_CHARS).toLowerCase();
  } catch {
    return null;
  }
}
