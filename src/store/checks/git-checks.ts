/**
 * The git-reading 4.0 checks: `check.append-only` (spec store.validate
 * Rule 4, schema S7) and `check.trailers` (schema S10). Outside git, both
 * are skipped.
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { firstCommittedContent, isGitRepo, recentCommits } from '../git.js';
import { STORE_DIR, type Store } from '../layout.js';
import { finding, type Finding } from '../types.js';

const CORRECTION = /^## Correction \d{4}-\d{2}-\d{2}\b/;
/** A status transition line in a `history/changes/` file (schema S5, amendment 2026-10-19). */
const TRANSITION = /^- \d{4}-\d{2}-\d{2}: \S.* → \S.*, \S/;

/** True when `now` is `original` plus only appended `## Correction <date>` sections. */
export function onlyCorrectionsAppended(original: string, now: string): boolean {
  if (now === original) return true;
  const base = original.replace(/\s+$/, '');
  if (!now.startsWith(base)) return false;
  const added = now.slice(base.length).replace(/^\s+/, '');
  return added === '' || CORRECTION.test(added);
}

/** The frontmatter `status:` line, masked; the rest of the text untouched. */
function maskStatus(text: string): { masked: string; status: string | null } {
  const m = /^---\n([\s\S]*?)\n---(\n|$)/.exec(text);
  if (!m) return { masked: text, status: null };
  let status: string | null = null;
  const fm = m[1]!.split('\n').map((l) => {
    if (!/^status:/.test(l)) return l;
    status = l.slice('status:'.length).trim();
    return 'status: <masked>';
  }).join('\n');
  return { masked: `---\n${fm}\n---${m[2]}${text.slice(m[0].length)}`, status };
}

/**
 * `history/changes/` only: `status` may change in place when the body ends
 * with one appended transition line per change; the appended text holds only
 * transition lines and `## Correction` sections (store.validate Rule 4).
 */
export function onlyTransitionsAppended(original: string, now: string): boolean {
  const a = maskStatus(original);
  const b = maskStatus(now);
  const base = a.masked.replace(/\s+$/, '');
  if (!b.masked.startsWith(base)) return false;
  const added = b.masked.slice(base.length).split('\n');
  let inCorrection = false;
  let transitions = 0;
  for (const l of added) {
    if (CORRECTION.test(l)) inCorrection = true;
    else if (TRANSITION.test(l)) {
      inCorrection = false;
      transitions++;
    } else if (l.trim() !== '' && !inCorrection) return false;
  }
  return a.status === b.status || transitions > 0;
}

export function checkAppendOnly(store: Store): Finding[] {
  if (!isGitRepo(store.root)) return [];
  const out: Finding[] = [];
  for (const f of store.files.filter((x) => x.module === 'history')) {
    const original = firstCommittedContent(store.root, `${STORE_DIR}/${f.path}`);
    if (original === null) continue;
    const ok = f.folder === 'history/changes' ? onlyTransitionsAppended(original, f.raw) : onlyCorrectionsAppended(original, f.raw);
    if (!ok) {
      out.push(finding('warning', 'check.append-only', f.path, f.folder === 'history/changes'
        ? 'a committed change file changed other than by a status transition (with its appended line) or an appended ## Correction <date> section'
        : 'a committed history file changed other than by an appended ## Correction <date> section'));
    }
  }
  return out;
}

export const TRAILER_WINDOW = 50;

function knownSpecIds(root: string): Set<string> {
  const ids = new Set<string>();
  for (const rel of fg.sync(['specflow/impl/**/*.md', 'specflow/promises/**/*.md', '.specflow/specs/**/*.md', '.specflow/specs-business/**/*.md', 'specs/**/*.md', 'specs-business/**/*.md'], { cwd: root, dot: true })) {
    ids.add(rel);
    try {
      const id = matter(fs.readFileSync(path.join(root, rel), 'utf8'), {}).data['id'];
      if (typeof id === 'string') ids.add(id);
    } catch {
      // an unparsable spec simply contributes no id
    }
  }
  return ids;
}

/** S10: a `Spec:` or `Source:` trailer that names nothing, over the last 50 commits. */
export function checkTrailers(store: Store): Finding[] {
  if (!isGitRepo(store.root)) return [];
  const commits = recentCommits(store.root, TRAILER_WINDOW);
  const out: Finding[] = [];
  let specs: Set<string> | null = null;
  for (const c of commits) {
    for (const line of c.body.split('\n')) {
      const m = /^(Spec|Source):\s*(\S.*)$/.exec(line.trim());
      if (!m) continue;
      const value = m[2]!.trim();
      if (m[1] === 'Spec') {
        specs ??= knownSpecIds(store.root);
        if (!specs.has(value) && !fs.existsSync(path.join(store.root, value))) out.push(finding('warning', 'check.trailers', `commit ${c.sha}`, `Spec: ${value} names no spec`));
      } else {
        const rel = value.replace(/^cortex\//, '');
        if (!/^history\/(sources|changes)\//.test(rel) || !fs.existsSync(path.join(store.dir, rel))) {
          out.push(finding('warning', 'check.trailers', `commit ${c.sha}`, `Source: ${value} is not an existing history/sources/ or history/changes/ path`));
        }
      }
    }
  }
  return out;
}
