/**
 * `cortex check` (specflow.check): judges the staged commit, or each commit of
 * a range. Runs no tests, calls no LLM, uses no network. The only Cortex check
 * that may refuse (RULES.md rule 6).
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { type SpecflowConfig, buildModel, readConfig, testCases } from '../model/model.js';
import type { TestCase } from '../model/tests.js';
import { type Tree, gitTree, workTree } from '../model/tree.js';
import { classifier } from './classify.js';
import { staleLiterals } from './constants.js';
import { touchedCriteria } from './imports.js';
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
    const r = spawnSync('git', ['merge-tree', '--write-tree', '--name-only', '--allow-unrelated-histories', '-z', ours, head], {
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

interface Warning {
  letter: string;
  text: string;
}

interface Judged {
  refusals: Refusal[];
  warnings: Warning[];
  amended: { spec: string; file: string; item: string; change: string; trailer: string }[];
  /** Criteria whose text changed, and the ids of tests added or changed: rule (c)'s two sides. */
  changedCriteria: string[];
  testedIds: Set<string>;
}

const MAX_TOUCHED = 20;
const MAX_NAMED = 8;
const level = (config: SpecflowConfig, letter: string): string => config.rules?.[letter] ?? 'off';

function named(list: string[]): string {
  const shown = list.slice(0, MAX_NAMED).join(', ');
  return list.length > MAX_NAMED ? `${shown} …` : shown;
}

/** Cases added or changed between two trees, over the changed test files. */
function changedCases(paths: string[], base: Tree, head: Tree, config: SpecflowConfig): TestCase[] {
  const only = new Set(paths);
  // Keyed by occurrence too: two cases may share a name in one file.
  const keyed = (cases: TestCase[]): [string, TestCase][] => {
    const seen = new Map<string, number>();
    return cases.map((c) => {
      const name = `${c.file}\0${c.name}`;
      const n = seen.get(name) ?? 0;
      seen.set(name, n + 1);
      return [`${name}\0${n}`, c];
    });
  };
  const before = new Map(keyed(testCases(base, config, only)));
  return keyed(testCases(head, config, only))
    .filter(([key, c]) => {
      const old = before.get(key);
      return !old || old.body !== c.body || old.tags.join() !== c.tags.join();
    })
    .map(([, c]) => c);
}

function judgeChange(root: string, paths: string[], base: Tree, head: Tree, at: string, config: SpecflowConfig, message: string): Judged {
  const classOf = classifier(config.tests ?? []);
  const items = itemChanges(paths, base, head);
  const trailers = amendTrailers(message);
  const managed = (text: string | null): boolean => text?.includes('# cortex-managed') ?? false;
  const refusals = judge(paths, classOf, items, message, (p) => managed(base.read(p)) && !managed(head.read(p)));
  const warnings: Warning[] = [];
  const hooks = paths.filter((p) => classOf(p) === 'hook');
  if (hooks.length > 0) warnings.push({ letter: 'h', text: `changes a git hook: ${named(hooks)}` });
  const cases = changedCases(paths, base, head, config);
  const code = paths.filter((p) => classOf(p) === 'code');
  const b = level(config, 'b');
  const model = b !== 'off' || code.length > 0 ? buildModel(head, config) : null;

  if (b !== 'off' && model) {
    const known = new Set(model.specs.flatMap((s) => s.criteria.map((c) => c.id)));
    const bad = cases.filter((c) => !c.tags.some((t) => known.has(t))).map((c) => `${c.file}${c.dynamic ? `:${c.line}` : ''} › ${c.name}`);
    const typos = cases.flatMap((c) => {
      const stray = c.tags.filter((t) => !known.has(t));
      return stray.length > 0 && stray.length < c.tags.length ? stray.map((t) => `[${t}] on ${c.file} › ${c.name}`) : [];
    });
    if (typos.length > 0) warnings.push({ letter: 'b', text: `tag naming no criterion: ${named(typos)}` });
    if (bad.length > 0 && b === 'refuse') {
      refusals.push({ letter: 'b', line: `- rule (b) test-needs-tag: test case without a resolving criterion tag: ${named(bad)}. Start its name with [CRIT-ID]; see specflow/INDEX.md.` });
    } else if (bad.length > 0) {
      warnings.push({ letter: 'b', text: `test case without a resolving criterion tag: ${named(bad)}` });
    }
  }
  if (model && code.length > 0) {
    const touched = touchedCriteria(code, model, head);
    if (touched.length > 0) {
      const shown = touched.slice(0, MAX_TOUCHED).join(', ');
      const more = touched.length > MAX_TOUCHED ? ` … and ${touched.length - MAX_TOUCHED} more` : '';
      warnings.push({ letter: 'f', text: `this change touches criteria: ${shown}${more}` });
    }
  }
  for (const text of staleLiterals(root, paths, base, head, at)) warnings.push({ letter: 'g', text });
  return {
    refusals,
    warnings,
    amended: items
      .filter((i) => i.change !== 'added')
      .map((i) => ({ spec: i.spec, file: i.file, item: i.item, change: i.change, trailer: trailerFor(i, trailers) ?? '' })),
    changedCriteria: items.filter((i) => i.change === 'changed' && !i.item.startsWith('rule-')).map((i) => i.item),
    testedIds: new Set(cases.flatMap((c) => c.tags)),
  };
}

/** The tagged tests `HEAD` itself changed: rule (c) in commit mode looks one commit back. */
function testedInHead(root: string, config: SpecflowConfig): Set<string> {
  const parent = has(root, 'HEAD^') ? 'HEAD^' : emptyTree(root);
  const paths = zList(git(root, 'diff', '--name-only', '--no-renames', '-z', parent, 'HEAD'));
  return new Set(changedCases(paths, gitTree(root, parent), gitTree(root, 'HEAD'), config).flatMap((c) => c.tags));
}

/** True when this commit is the amend the hook marked (Rule 4). The marker goes either way. */
function isAmend(root: string): boolean {
  const file = path.resolve(root, git(root, 'rev-parse', '--git-path', 'specflow-amend').trim());
  if (!fs.existsSync(file)) return false;
  const hash = fs.readFileSync(file, 'utf-8').trim();
  fs.rmSync(file, { force: true });
  return hash === git(root, 'rev-parse', 'HEAD').trim();
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
  // An amend replaces HEAD, so it is judged from HEAD's parents: none is a first
  // commit, which is not judged, and several is a merge.
  const parents = isAmend(root) ? git(root, 'rev-list', '--parents', '-n', '1', 'HEAD').trim().split(' ').slice(1) : ['HEAD'];
  if (parents.length === 0) {
    log.event({ subject, kind: 'commit', outcome: 'allowed', rules: [], warned: [], reasons: [] });
    return 0;
  }
  const heads = parents.length > 1 ? parents.slice(1) : mergeHeads(root);
  const first = parents[0] as string;
  const kind = heads.length > 0 ? 'merge' : 'commit';
  let base = first;
  let skip = new Set<string>();
  if (heads.length > 0) {
    const merged = automaticMerge(root, first, heads);
    base = merged.tree;
    skip = merged.conflicted;
  }
  const paths = zList(git(root, 'diff', '--cached', '--name-only', '--no-renames', '-z', base)).filter((p) => !skip.has(p));
  const { refusals, warnings, amended, changedCriteria, testedIds } = judgeChange(root, paths, gitTree(root, base), gitTree(root, ''), '', config, message);
  if (level(config, 'c') !== 'off' && changedCriteria.length > 0) {
    const inHead = testedInHead(root, config);
    const open = changedCriteria.filter((id) => !testedIds.has(id) && !inHead.has(id));
    if (open.length > 0) {
      warnings.push({ letter: 'c', text: `criterion text changed with no tagged test changed yet: ${named(open)}. The range check refuses this if the change ends without one.` });
    }
  }
  for (const w of warnings) err(`specflow: warning: ${w.text}`);
  const warned = warnings.map((w) => w.letter);
  if (refusals.length > 0) {
    err(`specflow: REFUSED (${kind === 'merge' ? 'merge commit' : 'commit'})`);
    for (const r of refusals) err(r.line);
    log.event({ subject, kind, outcome: 'refused', rules: refusals.map((r) => r.letter), warned, reasons: refusals.map((r) => r.line) });
    return 1;
  }
  log.event({ subject, kind, outcome: 'allowed', rules: [], warned, reasons: warnings.map((w) => w.text) });
  for (const a of amended) log.amendment({ subject, ...a });
  return 0;
}

function judgeCommit(root: string, sha: string, config: SpecflowConfig): Judged {
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
  return judgeChange(root, paths, gitTree(root, base), gitTree(root, sha), sha, config, message);
}

function rangeMode(root: string, range: string, config: SpecflowConfig, log: Log, err: (l: string) => void): number {
  const args = ['rev-list', '--reverse', range];
  if (config.since && has(root, `${config.since}^{commit}`)) args.push(`^${config.since}`);
  else if (config.since) err(`specflow: warning: specflow.since ${config.since} is not in this clone; judging the whole range`);
  const commits = git(root, ...args).split('\n').filter(Boolean);
  if (commits.length === 0) {
    err('specflow: 0 commits in range');
    return 0;
  }
  let refused = false;
  const changed = new Set<string>();
  const tested = new Set<string>();
  for (const sha of commits) {
    const short = git(root, 'rev-parse', '--short', sha).trim();
    const subject = git(root, 'log', '-1', '--format=%s', sha).trim();
    err(`${short} ${subject}`);
    const { refusals, warnings, changedCriteria, testedIds } = judgeCommit(root, sha, config);
    for (const id of changedCriteria) changed.add(id);
    for (const id of testedIds) tested.add(id);
    for (const w of warnings) err(`specflow: warning: ${w.text}`);
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
      warned: warnings.map((w) => w.letter),
      reasons: refusals.map((r) => r.line),
    });
  }
  const c = level(config, 'c');
  const open = [...changed].filter((id) => !tested.has(id));
  if (c !== 'off' && open.length > 0) {
    const text = `criterion text changed with no tagged test changed: ${named(open)}. Change the test that proves it.`;
    if (c === 'refuse') {
      refused = true;
      err('specflow: REFUSED (range)');
      err(`- rule (c) criterion-needs-test: ${text}`);
      log.event({ subject: range, kind: 'range', outcome: 'refused', rules: ['c'], warned: [], reasons: [text] });
    } else {
      err(`specflow: warning: ${text}`);
    }
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
      const since = config.since && has(root, `${config.since}^{commit}`) ? config.since : '';
      base = merged?.status === 0 ? merged.stdout.trim() : since;
      if (base === '') {
        err(`specflow: no base to compare for ${remoteRef}; nothing was checked`);
        continue;
      }
    }
    code = Math.max(code, rangeMode(root, `${base}..${local}`, config, log, err));
  }
  return code;
}

/** A bad value stops the check: a typo must not quietly mean a weaker rule (Rule 16). */
function validConfig(config: SpecflowConfig): SpecflowConfig {
  if (config.since !== undefined && !/^[0-9a-f]{7,40}$/.test(config.since)) {
    throw new Error(`specflow.since is not a commit id: ${String(config.since)}`);
  }
  for (const letter of ['b', 'c']) {
    const value = config.rules?.[letter];
    if (value !== undefined && !['off', 'warn', 'refuse'].includes(value)) {
      throw new Error(`specflow.rules.${letter} is not off, warn or refuse: ${String(value)}`);
    }
  }
  return config;
}

export function check(args: string[], start = '.', io: CheckIO = {}): number {
  const out = io.stdout ?? ((l: string) => console.log(l));
  const err = io.stderr ?? ((l: string) => console.error(l));
  const [mode, value, extra] = args;
  const validRange = mode === '--range' && value !== undefined && /^[^.]+(\.[^.]+)*\.\.[^.].*$/.test(value);
  const prePush = mode === '--pre-push' && value === undefined;
  const byHand = prePush && io.stdin === undefined && process.stdin.isTTY === true;
  if (byHand || extra !== undefined || !(validRange || prePush || (mode === '--commit-msg' && value !== undefined))) {
    out(USAGE);
    return 2;
  }
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: start, encoding: 'utf-8' }).stdout?.trim() || start;
  const removedInThisCommit = spawnSync('git', ['cat-file', '-e', 'HEAD:specflow'], { cwd: top }).status === 0;
  if (!fs.existsSync(path.join(top, 'specflow')) && !removedInThisCommit) {
    err('specflow: no specflow/ folder here; nothing was checked');
    return 0;
  }
  const root = top;
  let log: Log | null = null;
  try {
    const common = path.resolve(root, git(root, 'rev-parse', '--git-common-dir').trim());
    log = new Log(path.join(common, 'specflow'), err);
    const config = validConfig(readConfig(validRange || prePush ? gitTree(root, 'HEAD') : workTree(root)));
    if (prePush) return prePushMode(root, io.stdin ?? fs.readFileSync(0, 'utf-8'), config, log, err);
    return validRange
      ? rangeMode(root, value as string, config, log, err)
      : commitMode(root, path.resolve(start, value as string), config, log, err);
  } catch (e) {
    const message = (e as Error).message;
    const line = `specflow: internal error in the check (not a verdict on your change): ${message}`;
    err(line);
    log?.event({ subject: '', kind: 'commit', outcome: 'error', rules: [], warned: [], reasons: [line] });
    return 2;
  }
}
