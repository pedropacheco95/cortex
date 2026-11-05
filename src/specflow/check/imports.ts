/** Rule (f): the criteria whose tagged test files statically reach a code path (specflow.check Rule 11). */
import * as path from 'path';
import type { Model } from '../model/model.js';
import type { Tree } from '../model/tree.js';

const JS_IMPORT = /(?:^|\n)\s*(?:import|export)\s[^'"\n;]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
const PY_IMPORT = /^\s*(?:from\s+(\.*[\w.]*)\s+import|import\s+([\w.]+))/gm;
const JS_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function jsTargets(from: string, spec: string, files: Set<string>): string[] {
  if (!spec.startsWith('.')) return [];
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  const stem = base.replace(/\.(js|mjs|cjs|jsx)$/, '');
  const tries = [...JS_EXTENSIONS.map((e) => `${base}${e}`), ...JS_EXTENSIONS.map((e) => `${stem}${e}`), ...JS_EXTENSIONS.slice(1).map((e) => `${base}/index${e}`)];
  const hit = tries.find((t) => files.has(t));
  return hit ? [hit] : [];
}

function pyTargets(from: string, spec: string, files: Set<string>): string[] {
  const dots = /^\.*/.exec(spec)?.[0].length ?? 0;
  const rest = spec.slice(dots).split('.').filter(Boolean).join('/');
  const roots = dots > 0
    ? [path.posix.normalize(path.posix.join(path.posix.dirname(from), '../'.repeat(dots - 1)))]
    : [path.posix.dirname(from), '.'];
  const out: string[] = [];
  for (const root of roots) {
    const at = path.posix.normalize(path.posix.join(root, rest));
    for (const t of [`${at}.py`, `${at}/__init__.py`]) if (files.has(t)) out.push(t);
  }
  return out;
}

function importsOf(file: string, text: string, files: Set<string>): string[] {
  const out: string[] = [];
  if (file.endsWith('.py')) {
    for (const m of text.matchAll(PY_IMPORT)) out.push(...pyTargets(file, (m[1] ?? m[2]) as string, files));
  } else {
    for (const m of text.matchAll(JS_IMPORT)) out.push(...jsTargets(file, (m[1] ?? m[2] ?? m[3]) as string, files));
  }
  return out;
}

/** Every file a test file reaches, itself included. */
function reach(start: string, tree: Tree, files: Set<string>, seen: Map<string, string[]>): Set<string> {
  const reached = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    const next = seen.get(file) ?? importsOf(file, tree.read(file) ?? '', files);
    seen.set(file, next);
    for (const n of next) {
      if (!reached.has(n)) {
        reached.add(n);
        queue.push(n);
      }
    }
  }
  return reached;
}

export function touchedCriteria(codePaths: string[], model: Model, tree: Tree): string[] {
  const byFile = new Map<string, string[]>();
  for (const c of model.specs.flatMap((s) => s.criteria)) {
    for (const t of c.tests) byFile.set(t.file, [...(byFile.get(t.file) ?? []), c.id]);
  }
  if (byFile.size === 0) return [];
  const files = new Set(tree.list());
  const seen = new Map<string, string[]>();
  const touched = new Set<string>();
  for (const [file, ids] of byFile) {
    const reached = reach(file, tree, files, seen);
    if (codePaths.some((p) => reached.has(p))) for (const id of ids) touched.add(id);
  }
  return [...touched];
}
