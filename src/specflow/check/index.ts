/**
 * `cortex check` (specflow.check): judges the staged commit, or each commit of
 * a range. Runs no tests, calls no LLM, uses no network. The only Cortex check
 * that may refuse (RULES.md rule 6).
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { type SpecflowConfig, readConfig } from '../model/model.js';
import { type Tree, gitTree, workTree } from '../model/tree.js';
import { classifier } from './classify.js';
import { itemChanges } from './items.js';
import { Log } from './log.js';
import { type Refusal, amendTrailers, judge, trailerFor } from './rules.js';

const USAGE = 'usage: cortex check --commit-msg <file> | --range <base>..<head> | --pre-push';
const NO_COMMIT = /^0+$/;
const MAX_BUFFER = 1024 * 1024 * 1024;

export interface CheckIO {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  /** Git's pre-push lines; read from stdin when absent. */
  stdin?: string;
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf-8', maxBuffer: MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
}

function has(root: string, rev: string): boolean {
  return spawnSync('git', ['rev-parse', '--verify', '-q', rev], { cwd: root }).status === 0;
}

function zList(out: string): string[] {
  return out.split('\0').filter(Boolean);
}

function emptyTree(root: string): string {
  return execFileSync('git', ['hash-object', '-t', 'tree', '--stdin'], { cwd: root, input: '', encoding: 'utf-8' }).trim();
}

function subjectOf(message: string): string {
  return message.split('\n').find((l) => l.trim() !== '' && !l.startsWith('#')) ?? '';
}

/** The automatic merge of `heads`, in turn, onto `first`: its tree and the conflicted files. */
function automaticMerge(root: string, first: string, heads: string[]): { tree: string; conflicted: Set<string> } {
  let ours = first;
  let tree = '';
  const conflicted = new Set<string>();
  heads.forEach((head, i) => {
    const r = spawnSync('git', ['merge-tree', '--write-tree', '--name-only', '-z', ours, head], {
      cwd: root,
      encoding: 'utf-8',
      maxBuffer: MAX_BUFFER,
    });
    if (r.status !== 0 && r.status !== 1) throw new Error(`git merge-tree failed: ${r.stderr.trim()}`);
    const [oid = '', ...rest] = r.stdout.split('\0');
    tree = oid;
    if (r.status === 1) {
      for (const f of rest) {
        if (f === '') break;
        conflicted.add(f);
      }
    }
    if (i < heads.length - 1) {
      ours = execFileSync('git', ['commit-tree', tree, '-p', ours, '-p', head, '-m', 'automatic merge'], { cwd: root, encoding: 'utf-8' }).trim();
    }
  });
  return { tree, conflicted };
}

interface Judged {
  refusals: Refusal[];
  amended: { spec: string; file: string; item: string; change: string; trailer: string }[];
}

function judgeChange(paths: string[], base: Tree, head: Tree, config: SpecflowConfig, message: string): Judged {
  const classOf = classifier(config.tests ?? []);
  const items = itemChanges(paths, base, head);
  const trailers = amendTrailers(message);
  return {
    refusals: judge(paths, classOf, items, message),
    amended: items
      .filter((i) => i.change !== 'added')
      .map((i) => ({ spec: i.spec, file: i.file, item: i.item, change: i.change, trailer: trailerFor(i, trailers) ?? '' })),
  };
}

function amendBase(root: string): string | null {
  const marker = git(root, 'rev-parse', '--git-path', 'specflow-amend').trim();
  const file = path.resolve(root, marker);
  if (!fs.existsSync(file)) return null;
  const hash = fs.readFileSync(file, 'utf-8').trim();
  fs.rmSync(file, { force: true });
  if (hash !== git(root, 'rev-parse', 'HEAD').trim()) return null;
  return has(root, 'HEAD^') ? 'HEAD^' : emptyTree(root);
}

function mergeHeads(root: string): string[] {
  const file = path.resolve(root, git(root, 'rev-parse', '--git-path', 'MERGE_HEAD').trim());
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8').split('\n').map((s) => s.trim()).filter(Boolean);
}

function commitMode(root: string, messageFile: string, config: SpecflowConfig, log: Log, err: (l: string) => void): number {
  const message = fs.readFileSync(messageFile, 'utf-8');
  const subject = subjectOf(message);
  if (!has(root, 'HEAD')) {
    log.event({ subject, kind: 'commit', outcome: 'allowed', rules: [], warned: [], reasons: [] });
    return 0;
  }
  const heads = mergeHeads(root);
  const kind = heads.length > 0 ? 'merge' : 'commit';
  let base = 'HEAD';
  let skip = new Set<string>();
  if (heads.length > 0) {
    const merged = automaticMerge(root, 'HEAD', heads);
    base = merged.tree;
    skip = merged.conflicted;
  } else {
    base = amendBase(root) ?? 'HEAD';
  }
  const paths = zList(git(root, 'diff', '--cached', '--name-only', '--no-renames', '-z', base)).filter((p) => !skip.has(p));
  const { refusals, amended } = judgeChange(paths, gitTree(root, base), gitTree(root, ''), config, message);
  if (refusals.length > 0) {
    err(`specflow: REFUSED (${kind === 'merge' ? 'merge commit' : 'commit'})`);
    for (const r of refusals) err(r.line);
    log.event({ subject, kind, outcome: 'refused', rules: refusals.map((r) => r.letter), warned: [], reasons: refusals.map((r) => r.line) });
    return 1;
  }
  log.event({ subject, kind, outcome: 'allowed', rules: [], warned: [], reasons: [] });
  for (const a of amended) log.amendment({ subject, ...a });
  return 0;
}

function judgeCommit(root: string, sha: string, config: SpecflowConfig): Refusal[] {
  const parents = git(root, 'rev-list', '--parents', '-n', '1', sha).trim().split(' ').slice(1);
  const message = git(root, 'log', '-1', '--format=%B', sha);
  let base = parents[0] ?? emptyTree(root);
  let skip = new Set<string>();
  if (parents.length > 1) {
    const merged = automaticMerge(root, parents[0] as string, parents.slice(1));
    base = merged.tree;
    skip = merged.conflicted;
  }
  const paths = zList(git(root, 'diff', '--name-only', '--no-renames', '-z', base, sha)).filter((p) => !skip.has(p));
  return judgeChange(paths, gitTree(root, base), gitTree(root, sha), config, message).refusals;
}

function rangeMode(root: string, range: string, config: SpecflowConfig, log: Log, err: (l: string) => void): number {
  const args = ['rev-list', '--reverse', range];
  if (config.since) args.push(`^${config.since}`);
  const commits = git(root, ...args).split('\n').filter(Boolean);
  if (commits.length === 0) {
    err('specflow: 0 commits in range');
    return 0;
  }
  let refused = false;
  for (const sha of commits) {
    const short = git(root, 'rev-parse', '--short', sha).trim();
    const subject = git(root, 'log', '-1', '--format=%s', sha).trim();
    err(`${short} ${subject}`);
    const refusals = judgeCommit(root, sha, config);
    if (refusals.length > 0) {
      refused = true;
      err(`specflow: REFUSED (${short})`);
      for (const r of refusals) err(r.line);
    } else {
      err(`specflow: allowed (${short})`);
    }
    log.event({
      subject: `${short} ${subject}`,
      kind: 'range',
      outcome: refusals.length > 0 ? 'refused' : 'allowed',
      rules: refusals.map((r) => r.letter),
      warned: [],
      reasons: refusals.map((r) => r.line),
    });
  }
  return refused ? 1 : 0;
}

/** Rule 1 and `specflow.git-hooks` Rule 6: range mode for each pushed ref. */
function prePushMode(root: string, input: string, config: SpecflowConfig, log: Log, err: (l: string) => void): number {
  let code = 0;
  for (const line of input.split('\n').filter((l) => l.trim() !== '')) {
    const [, local = '', remoteRef = '', remote = ''] = line.trim().split(/\s+/);
    if (NO_COMMIT.test(local)) continue;
    let base = remote;
    if (NO_COMMIT.test(remote) || !has(root, `${remote}^{commit}`)) {
      const merged = has(root, 'origin/HEAD')
        ? spawnSync('git', ['merge-base', local, 'origin/HEAD'], { cwd: root, encoding: 'utf-8' })
        : null;
      // A first push to an empty remote has no merge base; where judging starts is the base.
      base = merged?.status === 0 ? merged.stdout.trim() : (config.since ?? '');
      if (base === '') {
        err(`specflow: no base to compare for ${remoteRef}; nothing was checked`);
        continue;
      }
    }
    code = Math.max(code, rangeMode(root, `${base}..${local}`, config, log, err));
  }
  return code;
}

export function check(args: string[], root = '.', io: CheckIO = {}): number {
  const out = io.stdout ?? ((l: string) => console.log(l));
  const err = io.stderr ?? ((l: string) => console.error(l));
  const [mode, value, extra] = args;
  const validRange = mode === '--range' && value !== undefined && /^[^.]+(\.[^.]+)*\.\.[^.].*$/.test(value);
  const prePush = mode === '--pre-push' && value === undefined;
  if (extra !== undefined || !(validRange || prePush || (mode === '--commit-msg' && value !== undefined))) {
    out(USAGE);
    return 2;
  }
  if (!fs.existsSync(path.join(root, 'specflow'))) {
    err('specflow: no specflow/ folder here; nothing was checked');
    return 0;
  }
  let log: Log | null = null;
  try {
    const common = path.resolve(root, git(root, 'rev-parse', '--git-common-dir').trim());
    log = new Log(path.join(common, 'specflow'), err);
    const config = readConfig(workTree(root));
    if (prePush) return prePushMode(root, io.stdin ?? fs.readFileSync(0, 'utf-8'), config, log, err);
    return validRange
      ? rangeMode(root, value as string, config, log, err)
      : commitMode(root, value as string, config, log, err);
  } catch (e) {
    const message = (e as Error).message;
    const line = `specflow: internal error in the check (not a verdict on your change): ${message}`;
    err(line);
    log?.event({ subject: '', kind: 'commit', outcome: 'error', rules: [], warned: [], reasons: [line] });
    return 2;
  }
}
