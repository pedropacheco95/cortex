/**
 * The files a model is built from: the working tree, the git index, or a
 * commit. One interface, so the index and the check read all three alike.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import fg from 'fast-glob';

export interface Tree {
  /** Every file, repo-relative with `/` separators. */
  list(): string[];
  /** A file's text, or null when it is not in this tree. */
  read(file: string): string | null;
  /** Load these files at once, where one read per file would be slow. */
  prefetch?(files: string[]): void;
}

const ALWAYS_OUT = ['**/node_modules/**', '**/.git/**', '**/.venv/**', '**/dist/**'];
const MAX_BUFFER = 1024 * 1024 * 1024;

export function workTree(root: string): Tree {
  return {
    list: () => fg.sync('**/*', { cwd: root, dot: true, ignore: ALWAYS_OUT }).sort(),
    read: (file) => {
      try {
        return fs.readFileSync(path.join(root, file), 'utf-8');
      } catch {
        return null;
      }
    },
  };
}

/** `ref` is a commit-ish; the empty string means the git index. */
export function gitTree(root: string, ref: string): Tree {
  const cache = new Map<string, string | null>();
  const object = (file: string): string => `${ref}:${file}`;
  const prefetch = (files: string[]): void => {
    const wanted = files.filter((f) => !cache.has(f));
    if (wanted.length === 0) return;
    const r = spawnSync('git', ['cat-file', '--batch'], {
      cwd: root,
      input: wanted.map(object).join('\n') + '\n',
      maxBuffer: MAX_BUFFER,
    });
    const out = r.stdout;
    let at = 0;
    for (const file of wanted) {
      const eol = out.indexOf(10, at);
      const header = out.subarray(at, eol).toString('utf-8');
      const size = /^\S+ blob (\d+)$/.exec(header);
      if (!size) {
        cache.set(file, null);
        at = eol + 1;
        continue;
      }
      const n = Number(size[1]);
      cache.set(file, out.subarray(eol + 1, eol + 1 + n).toString('utf-8'));
      at = eol + 1 + n + 1;
    }
  };
  return {
    list: () => {
      const args = ref === '' ? ['ls-files', '-z'] : ['ls-tree', '-r', '-z', '--name-only', ref];
      const out = execFileSync('git', args, { cwd: root, encoding: 'utf-8', maxBuffer: MAX_BUFFER });
      return out.split('\0').filter(Boolean).sort();
    },
    read: (file) => {
      prefetch([file]);
      return cache.get(file) ?? null;
    },
    prefetch,
  };
}
