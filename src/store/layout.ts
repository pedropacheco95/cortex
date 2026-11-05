/**
 * The 4.0 store as code (schema Part II S1–S3; spec store.layout Rule 1):
 * the folder set and `loadStore`, which every other `store.*` module reads
 * the store through. Deterministic file I/O only (RULES.md rule 3).
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseFile, parseOrigin, parseVerified, type Origin, type Verified } from './frontmatter.js';

export const STORE_DIR = 'cortex';
export const STORE_CONFIG = 'cortex.json';
export const MAP_FILE = 'MAP.md';
export const RAW_DIR = 'history/sources/raw';
export const GITIGNORE_LINE = 'cortex/history/sources/raw/';
export const SCHEMA_VERSION_4 = '4.0';

export type Module = 'code' | 'world' | 'history' | 'now';
export const MODULES: readonly Module[] = ['code', 'world', 'history', 'now'];
export const WORLD_FOLDERS = ['people', 'orgs', 'terms', 'systems', 'agreements', 'decisions', 'rules'] as const;
export const HISTORY_FOLDERS = ['sources', 'changes', 'incidents', 'measurements'] as const;

/** Every folder `cortex store init` creates (S1). `code/<area>/` areas are free and created on demand. */
export const STORE_FOLDERS: readonly string[] = [
  'code',
  ...WORLD_FOLDERS.map((f) => `world/${f}`),
  ...HISTORY_FOLDERS.map((f) => `history/${f}`),
  'now',
];

export interface StoreFile {
  /** Store-relative path, `/`-separated (`world/terms/fare.md`). */
  path: string;
  module: Module | null;
  /** `world/terms`, `code/hooks`, `history/incidents`, `now`; null outside the layout. */
  folder: string | null;
  frontmatter: Record<string, unknown> | null;
  frontmatterError?: string;
  body: string;
  raw: string;
  verified: Verified | null;
  origin: Origin | null;
}

export interface Store {
  /** Repository root. */
  root: string;
  /** Absolute path of `cortex/`. */
  dir: string;
  exists: boolean;
  config: Record<string, unknown> | null;
  configError?: string;
  /** Knowledge files: every `.md` under `cortex/` except `MAP.md` and `history/sources/raw/**`. */
  files: StoreFile[];
  /** Every other file path (store-relative), for the layout check. */
  others: string[];
  /** Every directory path (store-relative). */
  dirs: string[];
  mapText: string | null;
}

export function classify(rel: string): { module: Module | null; folder: string | null } {
  const parts = rel.split('/');
  const top = parts[0] as Module;
  if (!MODULES.includes(top)) return { module: null, folder: null };
  if (top === 'now') return { module: 'now', folder: parts.length === 2 ? 'now' : null };
  if (parts.length !== 3) return { module: top, folder: null };
  return { module: top, folder: `${parts[0]}/${parts[1]}` };
}

function walk(dir: string, base: string, files: string[], dirs: string[]): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(base, abs).split(path.sep).join('/');
    if (e.isDirectory()) {
      dirs.push(rel);
      walk(abs, base, files, dirs);
    } else if (e.isFile()) files.push(rel);
  }
}

export function storeDir(root: string): string {
  return path.join(root, STORE_DIR);
}

export function loadStore(root: string): Store {
  const dir = storeDir(root);
  const store: Store = { root, dir, exists: false, config: null, files: [], others: [], dirs: [], mapText: null };
  const cfgPath = path.join(dir, STORE_CONFIG);
  if (!fs.existsSync(cfgPath)) return store;
  store.exists = true;
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) store.configError = 'cortex.json is not a JSON object';
    else store.config = cfg as Record<string, unknown>;
  } catch (e) {
    store.configError = `cortex.json does not parse: ${(e as Error).message}`;
  }
  const all: string[] = [];
  walk(dir, dir, all, store.dirs);
  for (const rel of all) {
    if (rel === STORE_CONFIG) continue;
    if (rel === MAP_FILE) {
      store.mapText = fs.readFileSync(path.join(dir, rel), 'utf8');
      continue;
    }
    if (rel.startsWith(`${RAW_DIR}/`) || !rel.endsWith('.md')) {
      store.others.push(rel);
      continue;
    }
    const raw = fs.readFileSync(path.join(dir, rel), 'utf8');
    const parsed = parseFile(raw);
    const fm = parsed.frontmatter;
    store.files.push({
      path: rel,
      ...classify(rel),
      frontmatter: fm,
      ...(parsed.error ? { frontmatterError: parsed.error } : {}),
      body: parsed.body,
      raw,
      verified: fm && 'verified' in fm ? parseVerified(fm['verified']) : null,
      origin: fm && 'origin' in fm ? parseOrigin(fm['origin']) : null,
    });
  }
  return store;
}

/** A `migration.accepted` value that counts: a `YYYY-MM-DD` date. */
export function isAcceptedDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** The S9.1 acceptance rule: no `migration` field, or one whose `accepted` is a date. */
export function migrationAccepted(store: Store): boolean {
  const m = store.config?.['migration'];
  if (m === undefined) return true;
  return typeof m === 'object' && m !== null && isAcceptedDate((m as Record<string, unknown>)['accepted']);
}

export function fileStem(rel: string): string {
  return path.posix.basename(rel, '.md');
}

export function stringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') return [v];
  return [];
}
