/**
 * `cortex store <init|validate|map|expire|stale>` (schema Part II S9.2;
 * specs store.layout, store.validate, store.map, store.managed-block,
 * store.freshness). The 3.x verbs keep working on `.cortex/` alongside.
 */
import { storeInit } from './init.js';
import { loadStore } from './layout.js';
import { NO_STORE_MESSAGE, formatFinding, validateStore } from './validate.js';
import { writeMapAndBlocks } from './managed-block.js';
import { expire, staleFacts } from './freshness.js';
import { isGitRepo } from './git.js';
import { localToday } from './types.js';

export interface StoreCliIO { stdout?: (line: string) => void; stderr?: (line: string) => void }

export const STORE_USAGE = 'cortex store init | validate [--json] [--today YYYY-MM-DD] | map [--no-agents] | expire [--apply] [--today YYYY-MM-DD] | stale [--json]';

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function todayFrom(args: string[], stderr: (l: string) => void): string | null {
  const t = flagValue(args, '--today');
  if (t === undefined) return localToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    stderr(`cortex store: --today needs YYYY-MM-DD, got "${t}"`);
    return null;
  }
  return t;
}

export async function storeCli(args: string[], root = '.', io: StoreCliIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((l: string) => console.log(l));
  const stderr = io.stderr ?? ((l: string) => console.error(l));
  const [verb, ...rest] = args;
  if (verb === 'init') {
    const r = storeInit(root);
    stdout(r.created.length ? `created: ${r.created.join(', ')}` : 'cortex/ already initialised; nothing changed');
    return 0;
  }
  if (verb === 'validate') {
    const today = todayFrom(rest, stderr);
    if (today === null) return 2;
    const r = validateStore(root, today);
    if (!r.exists) {
      stdout(NO_STORE_MESSAGE);
      return 1;
    }
    if (rest.includes('--json')) stdout(JSON.stringify({ findings: r.findings, exitCode: r.exitCode }, null, 2));
    else for (const f of r.findings) stdout(formatFinding(f));
    return r.exitCode;
  }
  const store = loadStore(root);
  if (!store.exists && ['map', 'expire', 'stale'].includes(verb ?? '')) {
    stdout(NO_STORE_MESSAGE);
    return 1;
  }
  if (verb === 'map') {
    const r = writeMapAndBlocks(root, { noAgents: rest.includes('--no-agents') });
    for (const l of r.lines) stdout(l);
    return 0;
  }
  if (verb === 'expire') {
    const today = todayFrom(rest, stderr);
    if (today === null) return 2;
    const r = expire(store, today, rest.includes('--apply'));
    for (const l of r.lines) stdout(l);
    return 0;
  }
  if (verb === 'stale') {
    if (!isGitRepo(root)) {
      stdout('not a git repository');
      return 0;
    }
    const hits = staleFacts(store);
    if (rest.includes('--json')) stdout(JSON.stringify(hits, null, 2));
    else if (!hits.length) stdout('no stale facts');
    else for (const h of hits) stdout(`${h.file} → ${h.dependency}: ${h.commit.sha} ${h.commit.date}`);
    return 0;
  }
  stderr(`cortex store: unknown verb "${verb ?? ''}". Usage: ${STORE_USAGE}`);
  return 2;
}
