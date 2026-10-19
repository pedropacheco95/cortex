/**
 * Redactions and per-entry edits for `cortex migrate --redact <file>` (spec
 * store.migrate Rule 14). They change only what `cortex/` receives: entries
 * are copied, never written back to `.cortex/`. The report shows refs,
 * counts and labels, never the original text.
 */
import * as fs from 'fs';
import type { Entry, LegacyStore } from './entries.js';

export interface RedactFile {
  replace: Record<string, string>;
  edits: Record<string, [string, string][]>;
}

export interface RedactStat { ref: string; replaced: number; edited: number; labels: string[] }

export function readRedactFile(file: string): { redact: RedactFile | null; error: string | null } {
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    const replace = d?.replace ?? {};
    const edits = d?.edits ?? {};
    const okReplace = typeof replace === 'object' && Object.values(replace).every((v) => typeof v === 'string');
    const okEdits = typeof edits === 'object' && Object.values(edits).every((l) => Array.isArray(l) && l.every((p) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'string')));
    if (!okReplace || !okEdits) return { redact: null, error: `redact file ${file}: expected { "replace": { text: label }, "edits": { ref: [[from, to], …] } }` };
    return { redact: { replace, edits }, error: null };
  } catch (e) {
    return { redact: null, error: `redact file ${file} does not parse: ${(e as Error).message}` };
  }
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function deepMap(v: unknown, f: (s: string) => string): unknown {
  if (typeof v === 'string') return f(v);
  if (Array.isArray(v)) return v.map((x) => deepMap(x, f));
  if (v instanceof Date) return v;
  if (v !== null && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, deepMap(x, f)]));
  return v;
}

/** Body and fields are counted; title and section are derived text, mapped with `quiet` so a substitution is counted once. */
function mapEntry(e: Entry, f: (s: string) => string, quiet: (s: string) => string): Entry {
  return { ...e, body: f(e.body), title: quiet(e.title), section: e.section === null ? null : quiet(e.section), fm: deepMap(e.fm, f) as Record<string, unknown> };
}

/** The `replace` substitution alone, for text that is not an entry (a digest body); counts each replacement. */
export function replacer(redact: RedactFile): (text: string) => { text: string; replaced: number; labels: string[] } {
  const terms = Object.entries(redact.replace).map(([text, label]) => ({ re: new RegExp(`(?<![A-Za-z0-9_])${esc(text)}(?![A-Za-z0-9_])`, 'g'), label }));
  return (text) => {
    let replaced = 0;
    const labels = new Set<string>();
    let t = text;
    for (const { re, label } of terms) t = t.replace(re, () => { replaced++; labels.add(label); return label; });
    return { text: t, replaced, labels: [...labels].sort() };
  };
}

/** Apply `redact` to a copy of the store's entries; errors name an edit whose text is absent or a ref that matches nothing. */
export function applyRedactions(legacy: LegacyStore, redact: RedactFile): { legacy: LegacyStore; stats: RedactStat[]; errors: string[] } {
  const errors: string[] = [];
  const stats: RedactStat[] = [];
  const terms = Object.entries(redact.replace).map(([text, label]) => ({ re: new RegExp(`(?<![A-Za-z0-9_])${esc(text)}(?![A-Za-z0-9_])`, 'g'), label }));
  const refs = new Set(legacy.entries.map((e) => e.ref));
  for (const ref of Object.keys(redact.edits)) if (!refs.has(ref)) errors.push(`redact edit ref ${ref} matches no entry`);
  const entries = legacy.entries.map((e) => {
    let replaced = 0;
    let edited = 0;
    const labels = new Set<string>();
    const sub = (count: boolean) => (s: string): string => {
      let t = s;
      for (const { re, label } of terms) {
        t = t.replace(re, () => {
          if (count) replaced++;
          labels.add(label);
          return label;
        });
      }
      return t;
    };
    let out = mapEntry(e, sub(true), sub(false));
    for (const [from, to] of redact.edits[e.ref] ?? []) {
      let hit = 0;
      out = mapEntry(out, (s) => {
        const n = s.split(from).length - 1;
        hit += n;
        return n ? s.split(from).join(to) : s;
      }, (s) => s.split(from).join(to));
      if (!hit) errors.push(`redact edit for ${e.ref}: its "from" text is not in the entry`);
      edited += hit;
    }
    if (replaced || edited) stats.push({ ref: e.ref, replaced, edited, labels: [...labels].sort() });
    return out;
  });
  return { legacy: { ...legacy, entries }, stats, errors };
}
