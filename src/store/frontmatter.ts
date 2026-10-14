/**
 * Field parsers of the 4.0 store (schema Part II S3, S6; spec store.layout
 * Rules 2–4). Pure functions: a malformed value is reported, never coerced.
 */
import matter from 'gray-matter';

export type VerifiedMethod = 'observed' | 'told' | 'inferred';
export type Verified = { date: string; method: VerifiedMethod } | { error: string };

export type OriginForm = 'session' | 'source' | 'commit' | 'report' | 'migrated' | 'expired' | 'person' | 'external';
export interface OriginRef { form: OriginForm; ref: string }
export type Origin = { values: OriginRef[] } | { error: string };

/** S3 origin forms: the shape each value's ref must have after `<form>:`. */
export const ORIGIN_FORMS: Record<OriginForm, RegExp> = {
  session: /^[A-Za-z0-9][A-Za-z0-9._-]{3,}$/,
  source: /^history\/sources\/[^\s]+\.md$/,
  commit: /^[0-9a-f]{7,40}$/,
  report: /^(?!\/)(?!.*:\/\/)[^\s]+$/,
  migrated: /^[^\s@]+@[0-9a-f]{7,40}$/,
  expired: /^now\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/,
  person: /^[^\s@]+@\d{4}-\d{2}-\d{2}$/,
  external: /^(?!.*:\/\/).{1,120}$/,
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** YAML timestamps come back from gray-matter as Dates; the store keeps dates as strings. */
function undate(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.map(undate);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, undate(x)]));
  }
  return v;
}

export interface ParsedFile { frontmatter: Record<string, unknown> | null; body: string; error?: string }

/** Split a store file. No frontmatter → `frontmatter: null`; bad YAML → null plus `error`. Never throws. */
export function parseFile(raw: string): ParsedFile {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) return { frontmatter: null, body: raw };
  try {
    // A fresh options object keeps gray-matter's content cache out of the way.
    const m = matter(raw, {});
    const data = undate(m.data) as Record<string, unknown>;
    return { frontmatter: data, body: m.content.replace(/^\r?\n/, '') };
  } catch (e) {
    return { frontmatter: null, body: raw, error: `frontmatter does not parse: ${(e as Error).message.split('\n')[0]}` };
  }
}

export function parseVerified(v: unknown): Verified {
  if (typeof v !== 'string') return { error: 'verified must be "YYYY-MM-DD (observed|told|inferred)"' };
  const m = /^(\d{4}-\d{2}-\d{2}) \((observed|told|inferred)\)$/.exec(v.trim());
  if (!m || !isRealDate(m[1]!)) return { error: `malformed verified "${v}": expected "YYYY-MM-DD (observed|told|inferred)"` };
  return { date: m[1]!, method: m[2] as VerifiedMethod };
}

export function parseOriginValue(v: unknown): OriginRef | { error: string } {
  if (typeof v !== 'string') return { error: 'an origin value must be a string' };
  const m = /^([a-z]+):(.+)$/.exec(v.trim());
  if (!m || !(m[1]! in ORIGIN_FORMS)) return { error: `malformed origin "${v}": no known form (session:, source:, commit:, report:, migrated:, expired:, person:, external:)` };
  const form = m[1] as OriginForm;
  const ref = m[2]!.trim();
  if (!ORIGIN_FORMS[form].test(ref)) return { error: `malformed origin "${v}": bad ${form}: value` };
  if (form === 'person' && !isRealDate(ref.slice(ref.lastIndexOf('@') + 1))) return { error: `malformed origin "${v}": bad date` };
  return { form, ref };
}

/** `origin` is one value or a non-empty list of them (S3). */
export function parseOrigin(v: unknown): Origin {
  if (v === undefined || v === null) return { error: 'origin is missing' };
  const list = Array.isArray(v) ? v : [v];
  if (list.length === 0) return { error: 'origin is an empty list' };
  const values: OriginRef[] = [];
  for (const x of list) {
    const r = parseOriginValue(x);
    if ('error' in r) return r;
    values.push(r);
  }
  return { values };
}

export function formatOrigin(o: OriginRef): string {
  return `${o.form}:${o.ref}`;
}

export interface NowItem {
  kind: 'list' | 'heading';
  /** First line of the item, without the list marker or heading hashes. */
  title: string;
  /** 0-based line range [start, end) in the body. */
  start: number;
  end: number;
  text: string;
  until: string | null;
}

const UNTIL = /\buntil:\s*(\d{4}-\d{2}-\d{2})\b/;

/**
 * Split a `now/` body into items (S6; store.layout Rule 4): a top-level list
 * item with its indented continuation lines, or a `##`/`###` heading with
 * every line under it up to the next heading of level ≤ 3. Lines outside any
 * item (a `#` title, loose paragraphs) are not items.
 */
export function parseNowItems(body: string): NowItem[] {
  const lines = body.split('\n');
  const items: NowItem[] = [];
  let i = 0;
  const headingAt = (l: string): boolean => /^#{1,3}\s/.test(l);
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^#{2,3}\s/.test(line)) {
      let j = i + 1;
      while (j < lines.length && !headingAt(lines[j]!)) j++;
      items.push(makeItem('heading', line.replace(/^#{2,3}\s+/, ''), lines, i, j));
      i = j;
    } else if (/^[-*]\s/.test(line)) {
      let j = i + 1;
      while (j < lines.length && /^\s+\S/.test(lines[j]!)) j++;
      items.push(makeItem('list', line.replace(/^[-*]\s+/, ''), lines, i, j));
      i = j;
    } else i++;
  }
  return items;
}

function makeItem(kind: NowItem['kind'], title: string, lines: string[], start: number, end: number): NowItem {
  let e = end;
  while (e > start + 1 && lines[e - 1]!.trim() === '') e--;
  const text = lines.slice(start, e).join('\n');
  const m = UNTIL.exec(text);
  return { kind, title, start, end: e, text, until: m && isRealDate(m[1]!) ? m[1]! : null };
}
