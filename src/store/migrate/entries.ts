/**
 * Reading a 3.x `.cortex/` store as migration entries (schema Part II S9.3
 * "Coverage unit: the entry"; spec store.migrate Rule 1). Read-only: nothing
 * under `.cortex/` is ever written.
 *
 * - A single-subject file is one entry, ref `<3.x path>`.
 * - A multi-entry compass file (preferences, standing-authorities,
 *   environment, do-not-repeat) contributes one entry per non-heading block
 *   (list item, paragraph, blockquote, fence), ref `<path>#<n>`, 1-based. The
 *   `#` title and `##` headings are structure, not entries; every other
 *   block counts, so template text is retired through the plan file rather
 *   than guessed away in Core.
 * - `registry.md` contributes one entry per id line, ref `<path>#<id>`.
 * - `intent-register.yaml` contributes one entry per `entries[]` item, ref
 *   `<path>#<id>`.
 * - `pulse/suggestions.md` and `pulse/gaps.md` contribute one entry per
 *   `## S-NNN` / `## G-NNN` block, ref `S-NNN` / `G-NNN`.
 * - An atlas source (`<stem>.<ext>` raw files of any extension, plus
 *   `<stem>.meta.md`; the stem ends at the first `.`) and an archive document
 *   directory are one entry each (amendment 2026-10-19).
 * - Junk (`.DS_Store`, `._*`, `Thumbs.db`) is retired `not a store file`;
 *   everything under `pulse/` off the regenerable list is `unpromoted work`,
 *   which a plan must decide (spec store.migrate Rule 2).
 */
import * as fs from 'fs';
import * as path from 'path';
import { fencedLines, parseFile } from '../frontmatter.js';

export const LEGACY_DIR = '.cortex';

export type RowId =
  | 'config' | 'rule' | 'bug-resolved' | 'bug-open'
  | 'environment' | 'preferences' | 'do-not-repeat' | 'standing-authorities' | 'registry'
  | 'decision' | 'stakeholder' | 'term' | 'evidence' | 'source' | 'document' | 'intent'
  | 'observation' | 'dropped' | 'proposal' | 'retired' | 'unpromoted' | 'unmapped';

/** Retired reasons (store.migrate Rule 2). */
export const REGENERABLE = 'machinery or regenerable';
export const UNPROMOTED = 'unpromoted work';
export const NOT_A_STORE_FILE = 'not a store file';
export const NOT_A_STORE_FOLDER = 'not a store folder';
/** Bugs that go to `history/incidents/` (store.migrate Rule 2); any other status is an open pitfall. */
export const RESOLVED_BUG_STATUSES = new Set(['resolved', 'fixed-verified']);

export interface Entry {
  ref: string;
  row: RowId;
  /** `.cortex`-relative files this entry accounts for. */
  files: string[];
  fm: Record<string, unknown>;
  /** The entry's own text, verbatim. */
  body: string;
  title: string;
  /** `YYYY-MM-DD` from the 3.x date fields, when there is one. */
  date: string | null;
  /** The field the date came from, so it is not carried twice. */
  dateField: string | null;
  id: string | null;
  /** Old filename stem (or document directory name). */
  stem: string;
  /** For a block of a multi-entry file: the `##` heading it sits under. */
  section: string | null;
  /** Dropped-by-decision group (`anatomy`, `concepts`, `graph`). */
  group?: string;
  /** Why a retired entry is retired. */
  reason?: string;
  /** Raw originals to copy to `history/sources/raw/` (`.cortex`-relative). */
  raw?: string[];
  /** For a source: its digest has no `.meta.md` to come from. */
  noMeta?: boolean;
}

const DATE_FIELDS = ['date', 'opened', 'updated', 'captured', 'ingested_at', 'discovered'];

export function isoDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

function dateOf(fm: Record<string, unknown>): { date: string | null; field: string | null } {
  for (const f of DATE_FIELDS) {
    const d = isoDate(fm[f]);
    if (d) return { date: d, field: f };
  }
  return { date: null, field: null };
}

function walk(dir: string, base: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, base, out);
    else if (e.isFile()) out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
}

function read(legacy: string, rel: string): string {
  return fs.readFileSync(path.join(legacy, rel), 'utf8');
}

function firstLine(text: string): string {
  const l = text.split('\n').map((x) => x.trim()).find((x) => x !== '' && !/^(---|```|~~~)/.test(x)) ?? '';
  return l.replace(/^#+\s*/, '').replace(/^[-*]\s+/, '').replace(/^>\s*/, '');
}

function base(rel: string, fm: Record<string, unknown>, body: string, row: RowId): Entry {
  const { date, field } = dateOf(fm);
  const title = String(fm['title'] ?? fm['term'] ?? fm['name'] ?? firstLine(body));
  return {
    ref: rel, row, files: [rel], fm, body, title, date, dateField: field,
    id: typeof fm['id'] === 'string' ? (fm['id'] as string) : null,
    stem: path.posix.basename(rel).replace(/\.(md|ya?ml|json|html)$/, '').replace(/\.meta$/, ''),
    section: null,
  };
}

export interface Block { text: string; section: string | null }

/** Non-heading blocks of a markdown body, with the `##` heading each sits under. */
export function splitBlocks(body: string): Block[] {
  const lines = body.split('\n');
  const fenced = fencedLines(lines);
  const blocks: Block[] = [];
  let section: string | null = null;
  let cur: string[] = [];
  let curIsList = false;
  const flush = (): void => {
    while (cur.length && cur[cur.length - 1]!.trim() === '') cur.pop();
    if (cur.length) blocks.push({ text: cur.join('\n'), section });
    cur = [];
    curIsList = false;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (fenced[i]) {
      if (!cur.length || !fenced[i - 1]) {
        if (!curIsList || !/^\s+/.test(l)) flush();
      }
      cur.push(l);
      continue;
    }
    if (/^#{1,6}\s/.test(l)) {
      flush();
      if (/^##\s/.test(l)) section = l.replace(/^##\s+/, '').trim();
      continue;
    }
    if (l.trim() === '') {
      // A blank line ends a paragraph; inside a list item it ends the item unless the next line is indented.
      const next = lines[i + 1] ?? '';
      if (curIsList && /^\s+\S/.test(next)) cur.push(l);
      else flush();
      continue;
    }
    if (/^(?:[-*]|\d+\.)\s/.test(l)) {
      flush();
      curIsList = true;
      cur.push(l);
      continue;
    }
    if (curIsList && !/^\s/.test(l)) flush();
    cur.push(l);
  }
  flush();
  return blocks;
}

const MULTI: Record<string, RowId> = {
  'compass/preferences.md': 'preferences',
  'compass/standing-authorities.md': 'standing-authorities',
  'compass/environment.md': 'environment',
  'compass/do-not-repeat.md': 'do-not-repeat',
};

const DROPPED_GRAPH = new Set(['graph.json', 'tags.json', 'clusters.json', 'reverse-index.json', 'ledger.json']);

export function isJunk(rel: string): boolean {
  const b = path.posix.basename(rel);
  return b === '.DS_Store' || b === 'Thumbs.db' || b.startsWith('._');
}

/** The dropped-by-decision group of an insight file, or null (Rule 12; scoped groups by first folder, ` <n>` stripped). */
export function droppedGroup(rel: string): string | null {
  if (rel.startsWith('insight/anatomy/')) return 'anatomy';
  if (rel.startsWith('insight/concepts/')) return 'concepts';
  if (rel.startsWith('insight/') && DROPPED_GRAPH.has(rel.slice('insight/'.length))) return 'graph';
  const m = /^insight\/scopes\/[^/]+\/([^/]+)/.exec(rel);
  if (!m) return null;
  const first = m[1]!.replace(/ \d+$/, '');
  if (first === 'anatomy') return 'anatomy';
  if (first === 'concepts') return 'concepts';
  if (first === 'graph.json' || first === 'graph') return 'graph';
  return 'other';
}

/** The regenerable part of `pulse/` (Rule 2); `dismissed.md` only when it holds no entries. */
function pulseRegenerable(legacy: string, rel: string): boolean {
  if (/^pulse\/(state|extraction|sessions|scratch)\//.test(rel)) return true;
  if (rel === 'pulse/dismissed.md') {
    const body = parseFile(read(legacy, rel)).body;
    const lines = body.split('\n');
    return !lines.some((l) => /^##\s/.test(l) || /^\s*(?:[-*]|\d+\.)\s/.test(l));
  }
  return false;
}

/** Split `## S-NNN` / `## G-NNN` blocks; anything before the first is the file's frame. */
function proposals(legacy: string, rel: string, idRe: RegExp): Entry[] {
  const { frontmatter, body } = parseFile(read(legacy, rel));
  void frontmatter;
  const lines = body.split('\n');
  const fenced = fencedLines(lines);
  const starts: number[] = [];
  lines.forEach((l, i) => { if (!fenced[i] && idRe.test(l)) starts.push(i); });
  return starts.map((s, k) => {
    const end = starts[k + 1] ?? lines.length;
    const head = lines[s]!;
    const id = /([SG]-\d+)/.exec(head)![1]!;
    const text = lines.slice(s + 1, end).join('\n').replace(/^\n+/, '').replace(/\s+$/, '');
    const title = head.replace(/^##\s+[SG]-\d+\s*(?::|—|-)\s*/, '').trim();
    return { ...base(rel, {}, text, 'proposal'), ref: id, id, title, files: [rel] };
  });
}

export interface LegacyStore {
  /** Absolute `.cortex/` path. */
  dir: string;
  version: string;
  entries: Entry[];
  config: Record<string, unknown> | null;
  /** Every `.cortex`-relative file, for the no-loss accounting (Rule 16). */
  files: string[];
}

export function readLegacyStore(root: string): LegacyStore | null {
  const legacy = path.join(root, LEGACY_DIR);
  if (!fs.existsSync(legacy)) return null;
  const files: string[] = [];
  walk(legacy, legacy, files);
  const entries: Entry[] = [];
  let config: Record<string, unknown> | null = null;
  const covered = new Set<string>();
  const add = (e: Entry): void => {
    entries.push(e);
    e.files.forEach((f) => covered.add(f));
  };

  // Junk first, so it is never paired as a source or counted as a document raw.
  for (const rel of files) if (isJunk(rel)) add({ ...base(rel, {}, '', 'retired'), reason: NOT_A_STORE_FILE });

  // Atlas sources: the raw files of a stem (any extension) with its `<stem>.meta.md`.
  const stemOf = (f: string): string => `atlas/sources/${path.posix.basename(f).split('.')[0]}`;
  const sourceFiles = files.filter((f) => /^atlas\/sources\/[^/]+$/.test(f) && !f.endsWith('/_index.md') && !covered.has(f));
  const sourceStems = new Set(sourceFiles.map(stemOf));
  for (const stemPath of [...sourceStems].sort()) {
    const meta = `${stemPath}.meta.md`;
    const hasMeta = files.includes(meta);
    const raws = sourceFiles.filter((f) => stemOf(f) === stemPath && f !== meta).sort();
    const parsed = hasMeta ? parseFile(read(legacy, meta)) : { frontmatter: {}, body: '' };
    const e = base(hasMeta ? meta : raws[0]!, parsed.frontmatter ?? {}, parsed.body, 'source');
    e.ref = raws[0] ?? meta;
    e.files = [...raws, ...(hasMeta ? [meta] : [])];
    e.raw = raws;
    e.stem = path.posix.basename(stemPath);
    if (!hasMeta) {
      e.noMeta = true;
      e.title = e.stem;
    }
    add(e);
  }

  // Archive documents: one entry per directory.
  const docDirs = new Set(files.filter((f) => /^archive\/documents\/[^/]+\//.test(f) && !covered.has(f)).map((f) => f.split('/').slice(0, 3).join('/')));
  for (const d of [...docDirs].sort()) {
    const inDoc = files.filter((f) => f.startsWith(`${d}/`) && !covered.has(f));
    let meta: Record<string, unknown> = {};
    const metaRel = inDoc.find((f) => /\/metadata\.ya?ml$/.test(f));
    if (metaRel) {
      try {
        meta = (parseFile(`---\n${read(legacy, metaRel)}\n---\n`).frontmatter ?? {});
      } catch {
        meta = {};
      }
    }
    const extracted = inDoc.filter((f) => f.startsWith(`${d}/extracted/`) && f.endsWith('.md'));
    const order = ['summary', 'claims', 'asks', 'evidence', 'contradictions'];
    extracted.sort((a, b) => {
      const ia = order.indexOf(path.posix.basename(a, '.md'));
      const ib = order.indexOf(path.posix.basename(b, '.md'));
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    const body = extracted.map((f) => {
      const p = parseFile(read(legacy, f));
      return `## ${path.posix.basename(f, '.md')}\n\n${p.body.trim()}`;
    }).join('\n\n');
    const e = base(d, meta, body, 'document');
    e.files = inDoc;
    e.stem = path.posix.basename(d);
    e.title = String(meta['title'] ?? e.stem);
    // Raw = every file but the metadata and the extracted markdown (Rule 1).
    e.raw = inDoc.filter((f) => f !== metaRel && !(f.startsWith(`${d}/extracted/`) && f.endsWith('.md')));
    add(e);
  }

  for (const rel of files) {
    if (covered.has(rel)) continue;
    const top = rel.split('/')[0]!;
    // Dropped by decision (S9.3, store.migrate Rule 12) — before the _index.md row.
    const group = droppedGroup(rel);
    if (group) {
      add({ ...base(rel, {}, '', 'dropped'), group });
      continue;
    }
    if (path.posix.basename(rel) === '_index.md' || rel === 'recall-index.json' || rel === 'constellation.json' || rel === 'archive/register.md' || rel.startsWith('archive/types/') || rel === 'insight/scope-registry.yaml') {
      add({ ...base(rel, {}, '', 'retired'), reason: REGENERABLE });
      continue;
    }
    if (/^archive\/[^/]+\//.test(rel) && !/^archive\/(documents|types)\//.test(rel)) {
      add({ ...base(rel, {}, '', 'unpromoted'), reason: NOT_A_STORE_FOLDER });
      continue;
    }
    if (rel === 'cortex.config.json') {
      try {
        config = JSON.parse(read(legacy, rel));
      } catch {
        config = null;
      }
      add({ ...base(rel, {}, '', 'config') });
      continue;
    }
    if (rel === 'pulse/suggestions.md') {
      proposals(legacy, rel, /^##\s+S-\d+\b/).forEach(add);
      covered.add(rel);
      continue;
    }
    if (rel === 'pulse/gaps.md') {
      proposals(legacy, rel, /^##\s+G-\d+\b/).forEach(add);
      covered.add(rel);
      continue;
    }
    if (/^pulse\/threads\/T-\d+[^/]*\.md$/.test(rel)) {
      const t = parseFile(read(legacy, rel)).frontmatter ?? {};
      add({ ...base(rel, t, '', 'unpromoted'), reason: `${UNPROMOTED} (thread ${String(t['id'] ?? '')}, ${String(t['status'] ?? 'unknown')})` });
      continue;
    }
    if (top === 'pulse') {
      if (pulseRegenerable(legacy, rel)) add({ ...base(rel, {}, '', 'retired'), reason: REGENERABLE });
      else add({ ...base(rel, {}, '', 'unpromoted'), reason: UNPROMOTED });
      continue;
    }
    if (MULTI[rel]) {
      const { frontmatter, body } = parseFile(read(legacy, rel));
      void frontmatter;
      splitBlocks(body).forEach((b, i) => {
        add({ ...base(rel, {}, b.text, MULTI[rel]!), ref: `${rel}#${i + 1}`, section: b.section, title: firstLine(b.text) });
      });
      covered.add(rel);
      continue;
    }
    if (rel === 'compass/registry.md') {
      for (const l of read(legacy, rel).split('\n')) {
        const m = /^([A-Z]{1,2}-\d+)\s+(\S+)/.exec(l.trim());
        if (m) add({ ...base(rel, {}, l.trim(), 'registry'), ref: `${rel}#${m[1]}`, id: m[1]!, reason: 'id registry; every id becomes an alias of its file' });
      }
      covered.add(rel);
      continue;
    }
    if (rel === 'archive/intent-register.yaml') {
      const data = parseFile(`---\n${read(legacy, rel)}\n---\n`).frontmatter ?? {};
      const list = Array.isArray(data['entries']) ? (data['entries'] as Record<string, unknown>[]) : [];
      for (const it of list) {
        const id = String(it['id'] ?? '');
        const e = base(rel, it, String(it['stated_intent'] ?? ''), 'intent');
        add({ ...e, ref: `${rel}#${id}`, id, title: String(it['stated_intent'] ?? id) });
      }
      covered.add(rel);
      continue;
    }
    const parsed = rel.endsWith('.md') ? parseFile(read(legacy, rel)) : { frontmatter: null, body: '' };
    const fm = parsed.frontmatter ?? {};
    let row: RowId = 'unmapped';
    if (/^compass\/rules\/R-\d+[^/]*\.md$/.test(rel)) row = 'rule';
    else if (/^compass\/bugs\/B-\d+[^/]*\.md$/.test(rel)) row = RESOLVED_BUG_STATUSES.has(String(fm['status'])) ? 'bug-resolved' : 'bug-open';
    else if (/^atlas\/decisions\/[^/]+\.md$/.test(rel)) row = 'decision';
    else if (/^atlas\/stakeholders\/[^/]+\.md$/.test(rel)) row = 'stakeholder';
    else if (/^atlas\/domain\/[^/]+\.md$/.test(rel)) row = 'term';
    else if (/^atlas\/evidence\/[^/]+\.md$/.test(rel)) row = 'evidence';
    else if (/^insight\/observations\/[^/]+\.md$/.test(rel)) row = 'observation';
    add(base(rel, fm, parsed.body, row));
  }
  const version = typeof config?.['schemaVersion'] === 'string' ? (config['schemaVersion'] as string) : '3.x';
  return { dir: legacy, version, entries: entries.sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true })), config, files };
}
