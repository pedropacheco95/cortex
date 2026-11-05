/**
 * `check.near-duplicate` (spec store.validate Rule 3): two files whose
 * `about` lines share ≥ 0.8 token Jaccard, or two files with the same name in
 * different folders. Tokens are lower-cased, stripped of punctuation and
 * stop-words, and reduced by a light suffix strip (-ing, -ed, -s), so
 * "adds" and "added" count as one token; without it the spec's own example
 * pair scores 0.6.
 */
import { fileStem, type Store, type StoreFile } from '../layout.js';
import { finding, type Finding } from '../types.js';
import { STOPWORDS } from './stopwords.js';

export const NEAR_DUPLICATE_THRESHOLD = 0.8;

function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function aboutTokens(about: string): Set<string> {
  return new Set(
    about.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/[\s-]+/).filter((w) => w && !STOPWORDS.has(w)).map(stem),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface NearDuplicatePair { a: string; b: string; why: string }

export function nearDuplicatePairs(store: Store): NearDuplicatePair[] {
  const out: NearDuplicatePair[] = [];
  const files = store.files.filter((f) => f.module !== null && f.module !== 'history');
  const about = (f: StoreFile): string | null => (typeof f.frontmatter?.['about'] === 'string' ? (f.frontmatter['about'] as string) : null);
  const tokens = new Map(files.map((f) => [f.path, aboutTokens(about(f) ?? '')]));
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const a = files[i]!;
      const b = files[j]!;
      const sameName = fileStem(a.path) === fileStem(b.path) && a.folder !== b.folder;
      const score = about(a) && about(b) ? jaccard(tokens.get(a.path)!, tokens.get(b.path)!) : 0;
      if (sameName || score >= NEAR_DUPLICATE_THRESHOLD) {
        out.push({ a: a.path, b: b.path, why: sameName ? 'same name in two folders' : `about lines share ${score.toFixed(2)} of their words` });
      }
    }
  }
  return out;
}

export function checkNearDuplicate(store: Store): Finding[] {
  return nearDuplicatePairs(store).map((p) =>
    finding('warning', 'check.near-duplicate', p.a, `near-duplicate of ${p.b} (${p.why}); one fact lives in one file`),
  );
}
