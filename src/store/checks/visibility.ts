/**
 * `check.visibility` at 4.0 (schema Part II S9.1, S11; RULES.md rule 20 as
 * amended): Part I's line classifier, applied to `cortex/world/` and
 * `cortex/code/` when `cortex.json` says the repository is public.
 */
import picomatch from 'picomatch';
import { classifyLine, VISIBILITY_MAX_LINES_PER_FILE } from '../../schema/checks/visibility.js';
import { STORE_DIR, stringList, type Store } from '../layout.js';
import { finding, type Finding } from '../types.js';

export function storeVisibility(store: Store): { repo: string; allow: string[] } {
  const v = store.config?.['visibility'];
  if (!v || typeof v !== 'object') return { repo: 'unknown', allow: [] };
  const rec = v as Record<string, unknown>;
  return { repo: typeof rec['repo'] === 'string' ? rec['repo'] : 'unknown', allow: stringList(rec['allow']) };
}

/** Lines of `text` that carry an operational specific, as `<line>: <family> (<text>)`. */
export function visibilityHits(text: string): { line: number; family: string; text: string }[] {
  const hits: { line: number; family: string; text: string }[] = [];
  text.split('\n').forEach((l, i) => {
    const h = classifyLine(l.replace(/\r$/, ''));
    if (h) hits.push({ line: i + 1, family: h.family, text: h.text.slice(0, 60) });
  });
  return hits;
}

/** Lines of a public store that call something "(private)" (spec store.validate Rule 6). */
export function privateClaims(text: string): number[] {
  return text.split('\n').flatMap((l, i) => (l.includes('(private)') ? [i + 1] : []));
}

export function checkStoreVisibility(store: Store): Finding[] {
  const { repo, allow } = storeVisibility(store);
  if (repo !== 'public') return [];
  const allowed = allow.map((g) => picomatch(g));
  const out: Finding[] = [];
  for (const f of store.files.filter((x) => x.module === 'world' || x.module === 'code')) {
    const repoRel = `${STORE_DIR}/${f.path}`;
    if (allowed.some((m) => m(repoRel) || m(f.path))) continue;
    for (const n of privateClaims(f.raw)) out.push(finding('warning', 'check.visibility', `${f.path}:${n}`, 'repo is public but this line says "(private)"; correct the claim or move the pointer to an untracked note'));
    const hits = visibilityHits(f.raw);
    for (const h of hits.slice(0, VISIBILITY_MAX_LINES_PER_FILE)) {
      out.push(finding('warning', 'check.visibility', `${f.path}:${h.line}`, `repo is public and this line carries a ${h.family} (${h.text}); move it to an untracked note or add the file to visibility.allow`));
    }
    if (hits.length > VISIBILITY_MAX_LINES_PER_FILE) out.push(finding('warning', 'check.visibility', f.path, `… and ${hits.length - VISIBILITY_MAX_LINES_PER_FILE} more lines`));
  }
  return out;
}
