/** Rule (g): tracked files still holding a changed constant's old value (specflow.check Rule 12). */
import * as path from 'path';
import { spawnSync } from 'child_process';
import { frontmatter } from '../model/spec.js';
import type { Tree } from '../model/tree.js';

const MIN_SEARCH = 2;
const MAX_FILES = 20;

function constantsIn(text: string | null): Record<string, unknown> {
  const c = frontmatter(text ?? '')['constants'];
  return c !== null && typeof c === 'object' ? (c as Record<string, unknown>) : {};
}

/** `at` is a commit, or '' for the git index. */
export function staleLiterals(root: string, paths: string[], base: Tree, head: Tree, at: string): string[] {
  const warnings: string[] = [];
  for (const file of paths) {
    if (!file.startsWith('specflow/') || path.posix.basename(file) !== 'constants.md') continue;
    const before = constantsIn(base.read(file));
    const after = constantsIn(head.read(file));
    for (const [name, value] of Object.entries(before)) {
      if (!(name in after) || after[name] === value) continue;
      const old = String(value);
      if (old.length < MIN_SEARCH) {
        warnings.push(`constant ${name} changed; the old value \`${old}\` is too short to search`);
        continue;
      }
      const where = at === '' ? ['--cached'] : [at];
      const r = spawnSync('git', ['grep', '-l', '-w', '-F', '-e', old, ...where, '--', '.', ':!specflow'], { cwd: root, encoding: 'utf-8' });
      const found = r.stdout.split('\n').filter(Boolean).map((l) => (at === '' ? l : l.slice(at.length + 1)));
      if (found.length === 0) continue;
      const shown = found.slice(0, MAX_FILES).join(', ');
      warnings.push(`constant ${name} changed from ${old} to ${String(after[name])}; these files still hold ${old}: ${shown}${found.length > MAX_FILES ? ' …' : ''}`);
    }
  }
  return warnings;
}
