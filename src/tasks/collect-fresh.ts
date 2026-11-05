/**
 * `cortex tasks collect fresh` (spec loops.fresh-task Rule 2): the findings
 * the skill acts on. Read-only, and it exits 0 whatever it finds; the
 * judgement on each finding is the skill's.
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { loadStore, type Store, type StoreFile } from '../store/layout.js';
import { expiredItems, staleFacts, type StaleHit } from '../store/freshness.js';
import { isGitRepo } from '../store/git.js';
import { validateLoaded } from '../store/validate.js';
import { nearDuplicatePairs, type NearDuplicatePair } from '../store/checks/near-duplicate.js';
import { storeLinkTargets } from '../store/checks/structure.js';
import { checkMapFresh, blockVersion } from '../store/managed-block.js';
import { checkMapSize } from '../store/map.js';
import { loadRules } from '../store/rules.js';

export const WORLD_REVERIFY_DAYS = 90;
export const DECISION_REVERIFY_DAYS = 180;
export const PITFALL_AGE_DAYS = 30;

const REVERIFY_FOLDERS: Readonly<Record<string, number>> = {
  'world/people': WORLD_REVERIFY_DAYS,
  'world/orgs': WORLD_REVERIFY_DAYS,
  'world/systems': WORLD_REVERIFY_DAYS,
  'world/agreements': WORLD_REVERIFY_DAYS,
  'world/decisions': DECISION_REVERIFY_DAYS,
};

interface Reported { check: string; path: string; message: string }

export interface CollectFreshResult {
  expired: { file: string; until: string; item: string }[];
  stale: StaleHit[];
  validate: { errors: Reported[]; warnings: Reported[] };
  nearDuplicates: NearDuplicatePair[];
  aged: { file: string; verified: string; citedBy: string[] }[];
  deadRules: { file: string; paths: string[] }[];
  scaffolding: Reported[];
  openPitfalls: { count: number; aged: string[] };
}

function daysBefore(date: string, today: string): number {
  return (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000;
}

const verifiedDate = (f: StoreFile): string | null => (f.verified && 'date' in f.verified ? f.verified.date : null);

function aged(store: Store, today: string): CollectFreshResult['aged'] {
  const out: CollectFreshResult['aged'] = [];
  for (const f of store.files) {
    const limit = f.folder === null ? undefined : REVERIFY_FOLDERS[f.folder];
    const date = verifiedDate(f);
    if (limit === undefined || date === null || daysBefore(date, today) <= limit) continue;
    const citedBy = store.files.filter((o) => o.path !== f.path && storeLinkTargets(o.body).includes(f.path)).map((o) => o.path);
    out.push({ file: f.path, verified: date, citedBy });
  }
  return out;
}

function deadRules(store: Store): CollectFreshResult['deadRules'] {
  const out: CollectFreshResult['deadRules'] = [];
  for (const rule of loadRules(store)) {
    if (rule.match.paths.length === 0) continue;
    const hits = fg.sync(rule.match.paths, { cwd: store.root, dot: true, ignore: ['**/node_modules/**', '.git/**'], suppressErrors: true });
    if (hits.length === 0) out.push({ file: rule.path, paths: rule.match.paths });
  }
  return out;
}

function scaffolding(store: Store): Reported[] {
  const out: Reported[] = [...checkMapFresh(store), ...checkMapSize(store)].map(({ check, path: p, message }) => ({ check, path: p, message }));
  const schema = store.config?.['schemaVersion'];
  const claude = path.join(store.root, 'CLAUDE.md');
  const version = fs.existsSync(claude) ? blockVersion(fs.readFileSync(claude, 'utf-8')) : undefined;
  if (version === undefined) {
    out.push({ check: 'managed-block', path: '../CLAUDE.md', message: 'the CLAUDE.md managed block is missing; run cortex store map' });
  } else if (version !== schema) {
    out.push({ check: 'managed-block', path: '../CLAUDE.md', message: `the CLAUDE.md managed block is v${version}, the store is ${String(schema)}` });
  }
  return out;
}

function openPitfalls(store: Store, today: string): CollectFreshResult['openPitfalls'] {
  const open = store.files.filter((f) => f.module === 'code' && f.frontmatter?.['status'] === 'open');
  const old = open.filter((f) => {
    const date = verifiedDate(f);
    return date !== null && daysBefore(date, today) > PITFALL_AGE_DAYS;
  });
  return { count: open.length, aged: old.map((f) => f.path) };
}

export function collectFresh(root: string, today: string): CollectFreshResult {
  const store = loadStore(root);
  const findings = validateLoaded(store, today).map(({ level, check, path: p, message }) => ({ level, check, path: p, message }));
  const reported = (level: string): Reported[] =>
    findings.filter((f) => f.level === level).map(({ check, path: p, message }) => ({ check, path: p, message }));
  return {
    expired: expiredItems(store, today).map((e) => ({ file: e.file, until: e.item.until as string, item: e.item.title })),
    stale: isGitRepo(root) ? staleFacts(store) : [],
    validate: { errors: reported('error'), warnings: reported('warning') },
    nearDuplicates: nearDuplicatePairs(store),
    aged: aged(store, today),
    deadRules: deadRules(store),
    scaffolding: scaffolding(store),
    openPitfalls: openPitfalls(store, today),
  };
}
