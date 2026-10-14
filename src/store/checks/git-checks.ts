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

/** True when `now` is `original` plus only appended `## Correction <date>` sections. */
export function onlyCorrectionsAppended(original: string, now: string): boolean {
  if (now === original) return true;
  const base = original.replace(/\s+$/, '');
  if (!now.startsWith(base)) return false;
  const added = now.slice(base.length).replace(/^\s+/, '');
  return added === '' || CORRECTION.test(added);
}

export function checkAppendOnly(store: Store): Finding[] {
  if (!isGitRepo(store.root)) return [];
  const out: Finding[] = [];
  for (const f of store.files.filter((x) => x.module === 'history')) {
    const original = firstCommittedContent(store.root, `${STORE_DIR}/${f.path}`);
    if (original === null) continue;
    if (!onlyCorrectionsAppended(original, f.raw)) {
      out.push(finding('warning', 'check.append-only', f.path, 'a committed history file changed other than by an appended ## Correction <date> section'));
    }
  }
  return out;
}

export const TRAILER_WINDOW = 50;

function knownSpecIds(root: string): Set<string> {
  const ids = new Set<string>();
  for (const rel of fg.sync(['.specflow/specs/**/*.md', '.specflow/specs-business/**/*.md', 'specs/**/*.md', 'specs-business/**/*.md'], { cwd: root, dot: true })) {
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
