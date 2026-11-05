/**
 * `cortex tasks collect <learn|fresh|quality>` (core-cli.tasks-register Rule
 * 16): the dispatch. Each task's spec owns its output.
 */
import * as path from 'path';
import * as os from 'os';
import { localToday } from '../store/types.js';
import { taskRoster } from '../cli/task-scoping.js';
import { HEARTBEAT_USAGE, NOT_ACCEPTED_MESSAGE } from '../cli/tasks-register.js';
import { collectLearn, isInside } from './collect-learn.js';
import { collectFresh } from './collect-fresh.js';
import { collectQuality, type LintCounts } from './collect-quality.js';
import { nameFlags } from './name-flags.js';

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export interface CollectIO {
  stdout?: (l: string) => void;
  stderr?: (l: string) => void;
  home?: string;
  tmpDir?: string;
  lint?: (root: string) => LintCounts;
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function learn(args: string[], root: string, io: Required<Pick<CollectIO, 'stdout' | 'stderr'>> & CollectIO): number {
  const nowArg = flag(args, '--now');
  const now = nowArg === undefined ? new Date() : new Date(nowArg);
  if (Number.isNaN(now.getTime())) {
    io.stderr(`cortex tasks collect: --now needs an ISO datetime, got "${nowArg}"`);
    return 2;
  }
  const today = flag(args, '--today') ?? (nowArg === undefined ? localToday() : localDate(now));
  const out = flag(args, '--out');
  if (out !== undefined && isInside(path.resolve(root), path.resolve(root, out))) {
    io.stderr('cortex tasks collect: --out must be outside the project');
    return 1;
  }
  const r = collectLearn({
    projectRoot: root,
    home: io.home ?? os.homedir(),
    now,
    today,
    all: args.includes('--all'),
    ...(out === undefined ? {} : { outDir: path.resolve(root, out) }),
    ...(io.tmpDir === undefined ? {} : { tmpDir: io.tmpDir }),
  });
  if (args.includes('--json')) io.stdout(JSON.stringify(r, null, 2));
  else {
    io.stdout(`learn: ${r.sessions.length} session(s) in ${r.outDir}, ${r.remaining} left for later runs`);
    for (const s of r.sessions) io.stdout(`  ${s.id} ${s.modified}`);
  }
  return 0;
}

function fresh(args: string[], root: string, stdout: (l: string) => void): number {
  const r = collectFresh(root, flag(args, '--today') ?? localToday());
  if (args.includes('--json')) stdout(JSON.stringify(r, null, 2));
  else {
    stdout(`fresh: ${r.expired.length} expired, ${r.stale.length} stale, ${r.aged.length} aged, ${r.deadRules.length} dead rules, ` +
      `${r.nearDuplicates.length} near-duplicates, ${r.scaffolding.length} scaffolding, ${r.openPitfalls.count} open pitfalls`);
  }
  return 0;
}

function quality(args: string[], root: string, io: Required<Pick<CollectIO, 'stdout' | 'stderr'>> & CollectIO): number {
  const dir = flag(args, '--flags');
  if (dir !== undefined) {
    const base = flag(args, '--base');
    if (base === undefined) {
      io.stderr('cortex tasks collect quality: --flags needs --base <sha>');
      return 2;
    }
    const r = nameFlags({ projectRoot: root, dir, base });
    if (args.includes('--json')) io.stdout(JSON.stringify(r, null, 2));
    else io.stdout(`flags: ${r.governed.length} governed, ${r.flagged.length} flagged`);
    return 0;
  }
  const r = collectQuality({
    projectRoot: root,
    home: io.home ?? os.homedir(),
    today: flag(args, '--today') ?? localToday(),
    ...(io.lint === undefined ? {} : { lint: io.lint }),
  });
  if (args.includes('--json')) io.stdout(JSON.stringify(r, null, 2));
  else io.stdout(r.ported ? `quality: rotation ${r.rotation.join(', ')}` : 'quality: not ported');
  return 0;
}

export function tasksCollect(args: string[], root: string, io: CollectIO = {}): number {
  const stdout = io.stdout ?? ((l: string) => console.log(l));
  const stderr = io.stderr ?? ((l: string) => console.error(l));
  const [task, ...rest] = args;
  if (task !== 'learn' && task !== 'fresh' && task !== 'quality') {
    stderr(HEARTBEAT_USAGE);
    return 2;
  }
  if (taskRoster(root) !== 'store-v4') {
    stderr(NOT_ACCEPTED_MESSAGE);
    return 1;
  }
  if (task === 'learn') return learn(rest, root, { ...io, stdout, stderr });
  if (task === 'fresh') return fresh(rest, root, stdout);
  return quality(rest, root, { ...io, stdout, stderr });
}
