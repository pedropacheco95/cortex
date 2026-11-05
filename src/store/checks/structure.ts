/**
 * The structural 4.0 checks (schema Part II S11; spec store.validate Rule 2):
 * store-config, store-layout, frontmatter, naming, decision, change, aliases,
 * links. Pure functions over the loaded store.
 */
import * as fs from 'fs';
import * as path from 'path';
import { HISTORY_FOLDERS, MODULES, RAW_DIR, WORLD_FOLDERS, fileStem, stringList, type Store, type StoreFile } from '../layout.js';
import { finding, type Finding } from '../types.js';

const CONFIG_KEYS = new Set(['schemaVersion', 'visibility', 'migration', 'specflow']);

export function checkStoreConfig(store: Store): Finding[] {
  const out: Finding[] = [];
  const at = 'cortex.json';
  if (store.configError || !store.config) return [finding('error', 'check.store-config', at, store.configError ?? 'cortex.json is missing')];
  const cfg = store.config;
  const v = cfg['schemaVersion'];
  const m = typeof v === 'string' ? /^(\d+)\.(\d+)$/.exec(v) : null;
  if (!m) out.push(finding('error', 'check.store-config', at, `schemaVersion ${JSON.stringify(v)} does not parse as MAJOR.MINOR`));
  else if (m[1] !== '4') out.push(finding('error', 'check.store-config', at, `schemaVersion ${v} is not a 4.x store`));
  const mig = cfg['migration'];
  if (mig !== undefined) {
    const ok = mig !== null && typeof mig === 'object' && typeof (mig as Record<string, unknown>)['from'] === 'string'
      && ((mig as Record<string, unknown>)['accepted'] === null || /^\d{4}-\d{2}-\d{2}$/.test(String((mig as Record<string, unknown>)['accepted'])));
    if (!ok) out.push(finding('error', 'check.store-config', at, 'migration must be { "from": "<3.x version>", "accepted": "YYYY-MM-DD" | null }'));
  }
  for (const k of Object.keys(cfg)) if (!CONFIG_KEYS.has(k)) out.push(finding('warning', 'check.store-config', at, `unknown key "${k}"`));
  return out;
}

const WORLD = new Set<string>(WORLD_FOLDERS);
const HISTORY = new Set<string>([...HISTORY_FOLDERS, 'sources/raw']);

/** S1: only the fixed folders; no files directly under a module (or under `code/`). */
export function checkStoreLayout(store: Store): Finding[] {
  const out: Finding[] = [];
  const bad = new Set<string>();
  for (const d of store.dirs) {
    const parts = d.split('/');
    const top = parts[0]!;
    let ok = true;
    if (!(MODULES as readonly string[]).includes(top)) ok = false;
    else if (top === 'world' && parts.length >= 2) ok = parts.length === 2 && WORLD.has(parts[1]!);
    else if (top === 'history' && parts.length >= 2) ok = d.startsWith(`${RAW_DIR}/`) || HISTORY.has(parts.slice(1).join('/'));
    else if (top === 'code' && parts.length >= 3) ok = false;
    else if (top === 'now' && parts.length >= 2) ok = false;
    if (!ok && ![...bad].some((b) => d.startsWith(`${b}/`))) {
      bad.add(d);
      out.push(finding('error', 'check.store-layout', d, `folder ${d} is not part of the store layout (schema S1)`));
    }
  }
  const all = [...store.files.map((f) => f.path), ...store.others];
  for (const rel of all) {
    if ([...bad].some((b) => rel.startsWith(`${b}/`))) continue;
    if (rel.startsWith(`${RAW_DIR}/`)) continue;
    const parts = rel.split('/');
    const top = parts[0]!;
    if (parts.length === 1) out.push(finding('error', 'check.store-layout', rel, 'only cortex.json and MAP.md may sit directly under cortex/'));
    else if (top !== 'now' && parts.length === 2) out.push(finding('error', 'check.store-layout', rel, `no files directly under ${top}/`));
    else if (!rel.endsWith('.md')) out.push(finding('error', 'check.store-layout', rel, 'only markdown files belong in the store (raw originals go in history/sources/raw/)'));
  }
  return out;
}

const COMMON_FIELDS = ['about', 'permanence', 'verified', 'origin', 'depends_on', 'need', 'aliases', 'privacy'];
const RULE_FIELDS = ['applies_when', 'scope', 'match', 'source'];
const CHANGE_FIELDS = ['kind', 'status', 'decision', 'spec', 'source'];
const SOURCE_FIELDS = ['captured', 'raw'];

export function knownFields(f: StoreFile): Set<string> {
  const s = new Set(COMMON_FIELDS);
  if (f.folder === 'world/rules') RULE_FIELDS.forEach((x) => s.add(x));
  if (f.folder === 'history/changes') CHANGE_FIELDS.forEach((x) => s.add(x));
  if (f.folder === 'history/sources') SOURCE_FIELDS.forEach((x) => s.add(x));
  if (f.module === 'code') s.add('status');
  return s;
}

function isStringList(v: unknown): boolean {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** S3 required fields and shapes, `origin` included. */
export function checkFrontmatter(store: Store): Finding[] {
  const out: Finding[] = [];
  const err = (f: StoreFile, msg: string): void => { out.push(finding('error', 'check.frontmatter', f.path, msg)); };
  for (const f of store.files) {
    if (f.module === null) continue;
    const fm = f.frontmatter;
    if (!fm) {
      err(f, f.frontmatterError ?? 'no frontmatter (schema S3)');
      continue;
    }
    const about = fm['about'];
    if (about === undefined) err(f, 'missing required field about');
    else if (typeof about !== 'string' || about.trim() === '' || about.includes('\n') || about.length > 160) err(f, 'about must be one line of at most 160 characters');
    const perm = fm['permanence'];
    if (perm === undefined) err(f, 'missing required field permanence');
    else if (!['stable', 'changing', 'volatile'].includes(String(perm))) err(f, `permanence "${String(perm)}" is not stable, changing or volatile`);
    else if (f.module === 'now' && perm !== 'volatile') err(f, 'now/ files are always permanence: volatile');
    if (!('verified' in fm)) err(f, 'missing required field verified');
    else if (f.verified && 'error' in f.verified) err(f, f.verified.error);
    if (!('origin' in fm)) err(f, 'missing required field origin');
    else if (f.origin && 'error' in f.origin) err(f, f.origin.error);
    else if (f.origin && f.folder !== 'history/sources' && f.origin.values.some((o) => o.form === 'external')) {
      err(f, 'origin form external: is allowed only in history/sources/');
    }
    for (const k of ['depends_on', 'need', 'aliases']) if (k in fm && !isStringList(fm[k])) err(f, `${k} must be a list of strings`);
    if ('privacy' in fm && fm['privacy'] !== 'private') err(f, 'privacy, when present, is private');
    if (f.module === 'code' && 'status' in fm && fm['status'] !== 'open') {
      err(f, `status "${String(fm['status'])}" is not allowed in code/ (only open; a resolved incident belongs in history/incidents/)`);
    }
    const known = knownFields(f);
    for (const k of Object.keys(fm)) if (!known.has(k)) out.push(finding('warning', 'check.frontmatter', f.path, `unknown field ${k}`));
  }
  return out;
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATED = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}(?:-|$)/;
const LEGACY_ID = /^(?:r|b|s|g|t|ir)-\d{3,}(?:-|$)/i;

export function checkNaming(store: Store): Finding[] {
  const out: Finding[] = [];
  for (const f of store.files) {
    if (f.module === null) continue;
    const stem = fileStem(f.path);
    const name = path.posix.basename(f.path);
    if (LEGACY_ID.test(stem)) out.push(finding('error', 'check.naming', f.path, `${name} uses a 3.x id as its name; name the subject and put the id in aliases`));
    else if (f.module === 'history') {
      if (!DATED.test(stem)) out.push(finding('error', 'check.naming', f.path, `${name} must be <YYYY-MM-DD>-<slug>.md under history/`));
    } else if (DATE_PREFIX.test(stem)) out.push(finding('error', 'check.naming', f.path, `${name} carries a date; dates belong only under history/`));
    else if (!KEBAB.test(stem)) out.push(finding('error', 'check.naming', f.path, `${name} is not lower-case kebab-case`));
    if (f.module === 'code') {
      const area = f.path.split('/')[1]!;
      if (!KEBAB.test(area)) out.push(finding('error', 'check.naming', f.path, `code area ${area} is not lower-case kebab-case`));
    }
  }
  return out;
}

/** S5: `## Answer`, `## Why`, `## Rejected`, in that order. */
export function checkDecision(store: Store): Finding[] {
  const out: Finding[] = [];
  for (const f of store.files.filter((x) => x.folder === 'world/decisions')) {
    const heads = f.body.split('\n').filter((l) => /^##\s/.test(l)).map((l) => l.replace(/^##\s+/, '').trim().toLowerCase());
    const idx = ['answer', 'why', 'rejected'].map((h) => heads.indexOf(h));
    if (idx.some((i) => i < 0) || !(idx[0]! < idx[1]! && idx[1]! < idx[2]!)) {
      out.push(finding('warning', 'check.decision', f.path, 'a decision has the headings ## Answer, ## Why, ## Rejected, in this order'));
    }
  }
  return out;
}

const CHANGE_KINDS = new Set(['change-request', 'decision-change', 'other']);

export function checkChange(store: Store): Finding[] {
  const out: Finding[] = [];
  for (const f of store.files.filter((x) => x.folder === 'history/changes')) {
    const fm = f.frontmatter;
    if (!fm) continue;
    if (fm['kind'] === undefined) out.push(finding('error', 'check.change', f.path, 'missing required field kind'));
    else if (typeof fm['kind'] !== 'string') out.push(finding('error', 'check.change', f.path, 'kind must be a string'));
    else if (!CHANGE_KINDS.has(fm['kind'])) out.push(finding('warning', 'check.change', f.path, `unknown kind "${fm['kind']}" (open enum)`));
    if (fm['status'] === undefined) out.push(finding('error', 'check.change', f.path, 'missing required field status'));
    else if (typeof fm['status'] !== 'string') out.push(finding('error', 'check.change', f.path, 'status must be a string'));
  }
  return out;
}

export function checkAliases(store: Store): Finding[] {
  const owners = new Map<string, string[]>();
  for (const f of store.files) {
    for (const a of new Set(stringList(f.frontmatter?.['aliases']).map((x) => x.trim().toLowerCase()))) {
      if (!owners.has(a)) owners.set(a, []);
      owners.get(a)!.push(f.path);
    }
  }
  const out: Finding[] = [];
  for (const [a, ps] of [...owners].sort()) {
    if (ps.length > 1) out.push(finding('error', 'check.aliases', ps[0]!, `alias "${a}" names ${ps.length} files: ${ps.join(', ')}`));
  }
  return out;
}

const STORE_LINK = /\]\(((?:cortex\/)?(?:code|world|history|now)\/[^)\s#]+)(?:#[^)]*)?\)/g;

/** The store-relative targets of every store link in a body. */
export function storeLinkTargets(body: string): string[] {
  return [...body.matchAll(STORE_LINK)].map((m) => m[1]!.replace(/^cortex\//, ''));
}

/** Store-relative or repo-relative links, and `source:` origins, that do not resolve. */
export function checkLinks(store: Store): Finding[] {
  const out: Finding[] = [];
  const exists = (rel: string): boolean => fs.existsSync(path.join(store.dir, rel.replace(/^cortex\//, '')));
  for (const f of store.files) {
    for (const m of f.body.matchAll(STORE_LINK)) {
      if (!exists(m[1]!)) out.push(finding('warning', 'check.links', f.path, `link ${m[1]} does not resolve`));
    }
    if (f.origin && 'values' in f.origin) {
      for (const o of f.origin.values) if (o.form === 'source' && !exists(o.ref)) out.push(finding('warning', 'check.links', f.path, `origin source:${o.ref} does not resolve`));
    }
  }
  return out;
}
