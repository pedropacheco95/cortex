/**
 * The spec and test model (specflow.index): specs, promises, constants and
 * test cases, parsed once by text. The check, lint and viewer all read it.
 */
import * as path from 'path';
import picomatch from 'picomatch';
import type { Tree } from './tree.js';
import { type Criterion, frontmatter, parseCriteria } from './spec.js';
import { type TestCase, scanJsCases, scanPytestCases } from './tests.js';

export interface TestEntry {
  runner: string;
  include: string[];
  exclude?: string[];
}

export interface SpecflowConfig {
  tests?: TestEntry[];
  rules?: Record<string, string>;
  since?: string;
  literals?: { ignore?: string[] };
  testCommand?: string;
}

export interface ModelTest {
  file: string;
  name: string;
  line: number;
  skipped: boolean;
}

export interface ModelCriterion {
  id: string;
  title: string;
  text: string;
  unverified: boolean;
  tests: ModelTest[];
}

export interface ModelSpec {
  id: string;
  file: string;
  status: string;
  serves: string;
  /** The promise or business spec it belongs to; '' when none. */
  promise: string;
  criteria: ModelCriterion[];
  missingIds: boolean;
}

export interface ModelPromise {
  id: string;
  title: string;
  file: string;
  business: boolean;
}

export interface ModelRetired {
  id: string;
  file: string;
  criterionIds: string[];
}

export interface Model {
  promises: ModelPromise[];
  specs: ModelSpec[];
  constants: { name: string; value: string; file: string }[];
  untagged: ModelTest[];
  orphanTags: (ModelTest & { id: string })[];
  retired: ModelRetired[];
  testsConfigured: boolean;
}

const ALWAYS_OUT = ['**/node_modules/**', '**/.venv/**', '**/dist/**'];

/** Natural order: digit runs compare as numbers, so `-2` comes before `-10`. */
export function naturalCompare(a: string, b: string): number {
  const split = (s: string): string[] => s.match(/\d+|\D+/g) ?? [];
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    const p = x[i] as string;
    const q = y[i] as string;
    const bothNumbers = /^\d/.test(p) && /^\d/.test(q);
    const d = bothNumbers ? Number(p) - Number(q) : p < q ? -1 : p > q ? 1 : 0;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/** The `specflow` key of `cortex/cortex.json`. Throws when the file does not parse. */
export function readConfig(tree: Tree): SpecflowConfig {
  const raw = tree.read('cortex/cortex.json');
  if (raw === null) return {};
  const parsed = JSON.parse(raw) as { specflow?: SpecflowConfig };
  return parsed.specflow ?? {};
}

/** The files `specflow.tests` selects, each with its runner. */
export function selectTestFiles(files: string[], entries: TestEntry[]): Map<string, string> {
  const runnerOf = new Map<string, string>();
  for (const entry of entries) {
    const included = picomatch(entry.include, { dot: true });
    const excluded = picomatch([...(entry.exclude ?? []), ...ALWAYS_OUT], { dot: true });
    for (const f of files) {
      if (included(f) && !excluded(f) && !runnerOf.has(f)) runnerOf.set(f, entry.runner);
    }
  }
  return runnerOf;
}

function h1(text: string): string {
  return /^#\s+(.*?)\s*$/m.exec(text)?.[1] ?? '';
}

function firstOf(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}

export function testCases(tree: Tree, config: SpecflowConfig): TestCase[] {
  const runners = selectTestFiles(tree.list(), config.tests ?? []);
  const files = [...runners.keys()].sort();
  tree.prefetch?.(files);
  const cases: TestCase[] = [];
  for (const file of files) {
    const src = tree.read(file);
    if (src === null) continue;
    cases.push(...(runners.get(file) === 'pytest' ? scanPytestCases(file, src) : scanJsCases(file, src)));
  }
  return cases;
}

export function buildModel(tree: Tree, config: SpecflowConfig = readConfig(tree)): Model {
  const files = tree.list();
  const specFiles = files.filter((f) => f.startsWith('specflow/impl/') && f.endsWith('.spec.md'));
  const promiseFiles = files.filter(
    (f) => f.startsWith('specflow/promises/') && f.endsWith('.md') && path.posix.basename(f) !== '_overview.md',
  );
  const constantFiles = files.filter((f) => f.startsWith('specflow/') && path.posix.basename(f) === 'constants.md');
  tree.prefetch?.([...specFiles, ...promiseFiles, ...constantFiles]);

  const retired: ModelRetired[] = [];
  const promises: ModelPromise[] = [];
  for (const file of promiseFiles) {
    const text = tree.read(file) ?? '';
    const fm = frontmatter(text);
    const id = firstOf(fm['id']) || file;
    if (fm['status'] === 'retired') {
      retired.push({ id, file, criterionIds: [] });
      continue;
    }
    const business = file.endsWith('.business.md');
    promises.push({ id, title: firstOf(fm['title']) || h1(text), file, business });
  }
  const promiseById = new Map(promises.map((p) => [p.id, p]));
  const promiseByFile = new Map(promises.map((p) => [p.file, p]));

  const cases = testCases(tree, config);
  const byId = new Map<string, ModelTest[]>();
  for (const c of cases) {
    const t: ModelTest = { file: c.file, name: c.name, line: c.line, skipped: c.skipped };
    for (const id of c.tags) byId.set(id, [...(byId.get(id) ?? []), t]);
  }

  const specs: ModelSpec[] = [];
  const known = new Set<string>();
  for (const file of specFiles) {
    const text = tree.read(file) ?? '';
    const fm = frontmatter(text);
    const id = firstOf(fm['id']) || file;
    const parsed: Criterion[] = parseCriteria(text);
    if (fm['status'] === 'retired') {
      retired.push({ id, file, criterionIds: parsed.flatMap((c) => (c.id ? [c.id] : [])) });
      continue;
    }
    const serves = firstOf(fm['serves']);
    const implemented = firstOf(fm['implements']);
    const target = implemented ? path.posix.normalize(path.posix.join(path.posix.dirname(file), implemented)) : '';
    const home = serves ? promiseById.get(serves) : promiseByFile.get(target);
    const criteria: ModelCriterion[] = [];
    for (const c of parsed) {
      if (!c.id) continue;
      known.add(c.id);
      const tests = byId.get(c.id) ?? [];
      criteria.push({ id: c.id, title: c.title, text: c.text, tests, unverified: !tests.some((t) => !t.skipped) });
    }
    criteria.sort((a, b) => naturalCompare(a.id, b.id));
    specs.push({
      id,
      file,
      status: firstOf(fm['status']),
      serves,
      promise: home?.file ?? '',
      criteria,
      missingIds: parsed.some((c) => !c.id),
    });
  }

  const constants: Model['constants'] = [];
  for (const file of constantFiles) {
    const declared = frontmatter(tree.read(file) ?? '')['constants'];
    if (declared === null || typeof declared !== 'object') continue;
    for (const [name, value] of Object.entries(declared)) constants.push({ name, value: String(value), file });
  }

  const untagged: ModelTest[] = [];
  const orphanTags: Model['orphanTags'] = [];
  for (const c of cases) {
    const t: ModelTest = { file: c.file, name: c.name, line: c.line, skipped: c.skipped };
    if (c.tags.length === 0) untagged.push(t);
    for (const id of c.tags) if (!known.has(id)) orphanTags.push({ ...t, id });
  }

  const byFirstId = (a: { id: string }, b: { id: string }): number => naturalCompare(a.id, b.id);
  return {
    promises: promises.sort(byFirstId),
    specs: specs.sort(byFirstId),
    constants: constants.sort((a, b) => naturalCompare(`${a.name} ${a.file}`, `${b.name} ${b.file}`)),
    untagged,
    orphanTags: orphanTags.sort(byFirstId),
    retired: retired.sort(byFirstId),
    testsConfigured: (config.tests ?? []).length > 0,
  };
}

/** Where a spec sees `const:NAME`: its own folder and its ancestors, nearest first (Rule 10). */
export function resolveConstant(model: Model, name: string, specFile: string): Model['constants'][number] | null {
  let dir = path.posix.dirname(specFile);
  for (;;) {
    const hit = model.constants.find((c) => c.name === name && path.posix.dirname(c.file) === dir);
    if (hit) return hit;
    if (dir === 'specflow' || dir === '.') return null;
    dir = path.posix.dirname(dir);
  }
}

export function counts(model: Model): Record<string, number> {
  const criteria = model.specs.flatMap((s) => s.criteria);
  const unverified = criteria.filter((c) => c.unverified).length;
  return {
    promises: model.promises.length,
    specs: model.specs.length,
    criteria: criteria.length,
    tagged: criteria.length - unverified,
    unverified,
    untagged: model.untagged.length,
  };
}
