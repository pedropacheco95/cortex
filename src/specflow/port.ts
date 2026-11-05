/**
 * `cortex specs port` (specflow.port): moves an existing spec tree into the
 * visible `specflow/` folder, gives each criterion a stable id and says what
 * the check cannot yet govern. Mechanical only: promise conversion and the
 * tagging pass run in the onboard skill.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import fg from 'fast-glob';
import picomatch from 'picomatch';
import { PORT_LAYOUTS, type PortLayout as Layout } from '../paths.js';
import { isAcceptedDate } from '../store/layout.js';
import { buildModel, readConfig, selectTestFiles, testCases, type SpecflowConfig, type TestEntry } from './model/model.js';
import { criteriaSections, criterionPrefix, frontmatter, nearCriteriaHeadings, parseCriteria, splitHeading } from './model/spec.js';
import { workTree } from './model/tree.js';
import { specsIndex, type SpecsIO } from './index.js';

const REPORT_DIR = '.cortex-port';
const DEFAULT_TESTS: TestEntry[] = [
  { runner: 'vitest', include: ['**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}'], exclude: ['**/e2e/**'] },
  { runner: 'pytest', include: ['**/test_*.py', '**/*_test.py'], exclude: [] },
];

export type SpecClass = 'retired' | 'no-ACs' | 'not-mappable' | 'needs-edit' | 'clean';

/** One line edit, reversible, so Rule 6 can be verified byte for byte. */
export interface LineEdit {
  line: number;
  from: string;
  to: string;
}

interface Planned {
  source: string;
  target: string;
  before: string;
  after: string;
  edits: LineEdit[];
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf-8', maxBuffer: 1024 * 1024 * 1024 });
}

/** Rule 6: reversing the edits gives the source text exactly. */
export function reversible(before: string, after: string, edits: LineEdit[]): boolean {
  const lines = after.split('\n');
  for (const e of edits) {
    if (lines[e.line] !== e.to) return false;
    lines[e.line] = e.from;
  }
  return lines.join('\n') === before;
}

/** Rule 4: `<ID>: ` before each criterion title with none, numbered past the file's highest. */
export function stampIds(lines: string[], specId: string, edits: LineEdit[]): void {
  const criteria = criteriaSections(lines).flatMap((s) => s.headings);
  const prefix = criterionPrefix(specId);
  let next = 1;
  for (const h of criteria) {
    const id = splitHeading(h.title).id;
    const n = id ? Number(id.slice(id.lastIndexOf('-') + 1)) : 0;
    if (n >= next) next = n + 1;
  }
  for (const h of criteria) {
    if (splitHeading(h.title).id) continue;
    const from = lines[h.line] as string;
    const to = from.replace(/^(#+\s+)/, `$1${prefix}-${next}: `);
    next += 1;
    lines[h.line] = to;
    edits.push({ line: h.line, from, to });
  }
}

/** Rule 5: relative `implements:` and `implemented_by:` values, to their new paths. */
function rewriteLinks(lines: string[], source: string, target: string, moves: Map<string, string>, edits: LineEdit[]): void {
  if (lines[0]?.trim() !== '---') return;
  let key = '';
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (line.trim() === '---') return;
    const keyed = /^(\w+):\s*(.*)$/.exec(line);
    if (keyed) key = keyed[1] as string;
    if (key !== 'implements' && key !== 'implemented_by') continue;
    const value = /^(?:implements:\s*|implemented_by:\s*|\s*-\s*)(["']?)([^"'\s]+\.md)\1\s*$/.exec(line);
    if (!value) continue;
    const link = value[2] as string;
    const moved = moves.get(path.posix.normalize(path.posix.join(path.posix.dirname(source), link)));
    if (!moved) continue;
    const relative = path.posix.relative(path.posix.dirname(target), moved);
    const to = line.replace(link, relative);
    if (to === line) continue;
    lines[i] = to;
    edits.push({ line: i, from: line, to });
  }
}

function plan(root: string, layout: Layout): { files: Planned[]; removed: string[] } {
  const tracked = git(root, 'ls-files', '-z', '--', layout.dev, layout.business).split('\0').filter(Boolean);
  const moves = new Map<string, string>();
  for (const f of tracked) {
    const tree = f.startsWith(`${layout.business}/`) ? layout.business : layout.dev;
    const base = tree === layout.dev ? 'specflow/impl' : 'specflow/promises';
    moves.set(f, `${base}/${f.slice(tree.length + 1)}`);
  }
  const files: Planned[] = [];
  for (const [source, target] of moves) {
    const before = fs.readFileSync(path.join(root, source), 'utf-8');
    const edits: LineEdit[] = [];
    let after = before;
    if (source.endsWith('.md')) {
      const lines = before.split('\n');
      const fm = frontmatter(before);
      const id = fm['id'];
      if (target.startsWith('specflow/impl/') && target.endsWith('.spec.md') && fm['status'] !== 'retired' && typeof id === 'string') {
        stampIds(lines, id, edits);
      }
      rewriteLinks(lines, source, target, moves, edits);
      after = lines.join('\n');
    }
    files.push({ source, target, before, after, edits });
  }
  const removed = layout.staleIndex && fs.existsSync(path.join(root, layout.staleIndex)) ? [layout.staleIndex] : [];
  return { files, removed };
}

function refusal(root: string): string | { layout: Layout } {
  const present = PORT_LAYOUTS.filter((l) => fs.existsSync(path.join(root, l.dev)));
  if (spawnSync('git', ['rev-parse', '--git-dir'], { cwd: root }).status !== 0) return 'not a git repository';
  if (present.length === 0) return `no spec tree found: neither ${PORT_LAYOUTS.map((l) => `${l.dev}/`).join(' nor ')}`;
  if (present.length > 1) return `two spec trees found: ${PORT_LAYOUTS.map((l) => `${l.dev}/`).join(' and ')}`;
  const layout = present[0] as Layout;
  for (const t of ['specflow/impl', 'specflow/promises']) {
    if (fs.existsSync(path.join(root, t))) return `${t}/ already exists`;
  }
  if (!fs.existsSync(path.join(root, 'cortex/cortex.json'))) return 'no cortex/cortex.json; run cortex store init first';
  let store: { migration?: { accepted?: unknown } };
  try {
    store = JSON.parse(fs.readFileSync(path.join(root, 'cortex/cortex.json'), 'utf-8')) as { migration?: { accepted?: unknown } };
  } catch {
    return 'cortex/cortex.json is not valid';
  }
  if (store.migration === undefined && fs.existsSync(path.join(root, '.cortex'))) {
    return 'this project is on the 3.x store; migrate it first with cortex migrate';
  }
  if (store.migration !== undefined && !isAcceptedDate(store.migration?.accepted)) {
    return 'the migration is not accepted; finish it with cortex migrate --accept first';
  }
  const dirty = git(root, 'status', '--porcelain', '--', layout.dev, layout.business, ...(layout.staleIndex ? [layout.staleIndex] : []));
  if (dirty.trim() !== '') return `uncommitted changes under the spec tree:\n${dirty.trimEnd()}`;
  return { layout };
}

/** Rule 7: one default entry per runner with a matching file. */
function defaultTests(files: string[]): TestEntry[] {
  const out = ['**/node_modules/**', '**/.venv/**', '**/dist/**'];
  return DEFAULT_TESTS.filter((entry) => {
    const included = picomatch(entry.include, { dot: true });
    const excluded = picomatch([...(entry.exclude ?? []), ...out], { dot: true });
    return files.some((f) => included(f) && !excluded(f));
  });
}

interface SpecRow {
  id: string;
  file: string;
  class: SpecClass;
  reason: string;
}

function classify(specs: Planned[], businessRetired: Set<string>, tests: string, ticket: RegExp | null): SpecRow[] {
  const ticketsOf = (text: string): string[] => (ticket ? [...new Set(text.match(ticket) ?? [])] : []);
  const citedBy = new Map<string, number>();
  for (const s of specs) for (const t of ticketsOf(s.after)) citedBy.set(t, (citedBy.get(t) ?? 0) + 1);
  const testTickets = new Set(ticketsOf(tests));

  return specs.map((s) => {
    const fm = frontmatter(s.after);
    const id = typeof fm['id'] === 'string' ? fm['id'] : s.target;
    const row = (c: SpecClass, reason = ''): SpecRow => ({ id, file: s.target, class: c, reason });
    if (fm['status'] === 'retired') return row('retired');
    const lines = s.after.split('\n');
    const sections = criteriaSections(lines);
    const criteria = sections.flatMap((x) => x.headings);
    if (criteria.length === 0) return row('no-ACs', 'no criterion heading');

    const cited = ticketsOf(s.after).filter((t) => testTickets.has(t));
    const direct = tests.includes(id) || tests.includes(s.target) || tests.includes(s.source);
    if (!direct && cited.length === 0) return row('not-mappable', 'no test cites its id, path or a ticket of it');

    const noThen = parseCriteria(s.after).filter((c) => !/\bthen\b/i.test(c.text.split('\n').slice(1).join('\n')));
    if (noThen.length > 0) return row('needs-edit', `no Then clause: ${noThen.map((c) => c.title).join(', ')}`);
    const stray = sections.some((x) => lines.slice(x.line + 1, x.headings[0]?.line ?? x.end).some((l) => l.trim() !== ''));
    if (stray) return row('needs-edit', 'text in the Acceptance Criteria section outside any criterion');
    const titles = criteria.map((h) => splitHeading(h.title).title);
    const repeated = titles.find((t, i) => titles.indexOf(t) !== i);
    if (repeated) return row('needs-edit', `repeated heading: ${repeated}`);
    if (!direct && cited.every((t) => (citedBy.get(t) ?? 0) > 1)) {
      return row('needs-edit', `linked to tests only through a shared ticket: ${cited.join(', ')}`);
    }
    const implemented = fm['implements'];
    const link = Array.isArray(implemented) ? implemented[0] : implemented;
    if (typeof link === 'string') {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(s.target), link));
      if (businessRetired.has(target)) return row('needs-edit', `implements a retired business spec: ${target}`);
    }
    return row('clean');
  });
}

interface Report {
  layout: string;
  head: string;
  counts: { specs: number; criteria: number; testFiles: number; testCases: number; dynamicNames: number };
  classes: Record<SpecClass, number>;
  specs: SpecRow[];
  /** Headings that read like a criteria section but are not counted. */
  nearHeadings: { file: string; line: number; title: string }[];
  untagged: { file: string; name: string; line: number }[];
}

function reportText(r: Report): string {
  const perFile = new Map<string, number>();
  for (const t of r.untagged) perFile.set(t.file, (perFile.get(t.file) ?? 0) + 1);
  const lines = [
    '# Port report',
    '',
    `Source layout: ${r.layout}`,
    `HEAD: ${r.head}`,
    `Specs: ${r.counts.specs} · criteria: ${r.counts.criteria} · test files: ${r.counts.testFiles} · test cases: ${r.counts.testCases} · names built at run time: ${r.counts.dynamicNames}`,
    '',
    '## Specs per class',
    '',
    ...Object.entries(r.classes).map(([c, n]) => `- ${c}: ${n}`),
    '',
    '## Specs the check cannot yet rely on',
    '',
    ...r.specs.filter((s) => s.class !== 'clean' && s.class !== 'retired').map((s) => `- \`${s.file}\`: ${s.class}: ${s.reason}`),
    '',
    '## Headings that look like criteria and are not counted',
    '',
    ...r.nearHeadings.map((h) => `- \`${h.file}\`:${h.line}: ${h.title}`),
    '',
    '## Untagged cases per test file',
    '',
    ...[...perFile].map(([f, n]) => `- \`${f}\`: ${n}`),
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}

function buildReport(root: string, layout: Layout, files: Planned[], config: SpecflowConfig, ticket: RegExp | null): Report {
  const tree = workTree(root);
  const scanned = testCases(tree, config);
  const cases = scanned.filter((c) => !c.dynamic);
  const testFiles = selectTestFiles(tree.list(), config.tests ?? []);
  const tests = [...testFiles.keys()].map((f) => tree.read(f) ?? '').join('\n');
  const specs = files.filter((f) => f.target.startsWith('specflow/impl/') && f.target.endsWith('.spec.md'));
  const retiredBusiness = new Set(
    files
      .filter((f) => f.target.startsWith('specflow/promises/') && frontmatter(f.after)['status'] === 'retired')
      .map((f) => f.target),
  );
  const rows = classify(specs, retiredBusiness, tests, ticket);
  const classes: Record<SpecClass, number> = { retired: 0, 'no-ACs': 0, 'not-mappable': 0, 'needs-edit': 0, clean: 0 };
  for (const r of rows) classes[r.class] += 1;
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf-8' }).stdout.trim();
  const live = specs.filter((s) => frontmatter(s.after)['status'] !== 'retired');
  return {
    layout: layout.name,
    head,
    counts: {
      specs: specs.length,
      criteria: live.reduce((n, s) => n + parseCriteria(s.after).length, 0),
      testFiles: testFiles.size,
      testCases: cases.length,
      dynamicNames: scanned.length - cases.length,
    },
    classes,
    specs: rows,
    nearHeadings: live.flatMap((s) => nearCriteriaHeadings(s.after.split('\n')).map((h) => ({ file: s.target, line: h.line + 1, title: h.title }))),
    untagged: cases.filter((c) => c.tags.length === 0).map(({ file, name, line }) => ({ file, name, line })),
  };
}

function removeEmptied(root: string, top: string): void {
  const dir = path.join(root, top);
  if (!fs.existsSync(dir)) return;
  const folders = fg.sync('**', { cwd: dir, dot: true, onlyDirectories: true }).sort((a, b) => b.length - a.length);
  for (const f of [...folders, '.']) {
    const full = path.join(dir, f);
    if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
  }
}

function excludeReports(root: string): void {
  const file = path.resolve(root, git(root, 'rev-parse', '--git-path', 'info/exclude').trim());
  const line = `${REPORT_DIR}/`;
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  if (current.split('\n').includes(line)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${current}${current === '' || current.endsWith('\n') ? '' : '\n'}${line}\n`);
}

/** Rule 13: every untagged case has a valid proposal. Writes nothing. */
export function verifyTagging(root: string, out: (l: string) => void): number {
  const tree = workTree(root);
  const model = buildModel(tree);
  const known = new Set(model.specs.flatMap((s) => s.criteria.map((c) => c.id)));
  const proposed = new Set<string>();
  let problems = 0;
  const problem = (line: string): void => {
    problems += 1;
    out(line);
  };
  for (const file of fg.sync(`${REPORT_DIR}/tagging/*.jsonl`, { cwd: root, dot: true }).sort()) {
    (tree.read(file) ?? '').split('\n').forEach((raw, i) => {
      if (raw.trim() === '') return;
      const where = `${file}:${i + 1}`;
      let p: Record<string, unknown>;
      try {
        p = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        problem(`malformed line: ${where}`);
        return;
      }
      const has = (...keys: string[]): boolean => keys.every((k) => typeof p[k] === 'string' && p[k] !== '');
      const action = p['action'];
      const shaped =
        has('file', 'name', 'reason') &&
        typeof p['line'] === 'number' &&
        ((action === 'tag' && has('criterion')) || (action === 'new-criterion' && has('spec', 'title')) || action === 'delete');
      if (!shaped) {
        problem(`malformed line: ${where}`);
        return;
      }
      proposed.add(`${String(p['file'])}\0${String(p['name'])}`);
      if (action === 'tag' && !known.has(p['criterion'] as string)) {
        problem(`tag proposal naming no criterion: ${where}: ${String(p['criterion'])}`);
      }
    });
  }
  for (const c of model.untagged) {
    if (!proposed.has(`${c.file}\0${c.name}`)) problem(`no proposal: ${c.file} › ${c.name}`);
  }
  return problems > 0 ? 1 : 0;
}

export function specsPort(args: string[], root = '.', io: SpecsIO = {}): number {
  const out = io.stdout ?? ((l: string) => console.log(l));
  const err = io.stderr ?? ((l: string) => console.error(l));
  const rest = [...args];
  const dryRun = rest.includes('--dry-run');
  const verify = rest.includes('--verify');
  let ticket: RegExp | null = null;
  const at = rest.indexOf('--ticket-pattern');
  if (at >= 0) {
    try {
      ticket = new RegExp(rest[at + 1] ?? '', 'g');
      if (rest[at + 1] === undefined) throw new Error('missing');
    } catch {
      err('specflow: --ticket-pattern needs a valid regular expression');
      return 2;
    }
    rest.splice(at, 2);
  }
  const unknown = rest.find((a) => a !== '--dry-run' && a !== '--verify');
  if (unknown !== undefined) {
    err(`specflow: unknown argument ${unknown}`);
    return 2;
  }
  if (verify) return verifyTagging(root, out);

  const ready = refusal(root);
  if (typeof ready === 'string') {
    err(`specflow: port refused: ${ready}. Nothing was changed.`);
    return 1;
  }
  const { layout } = ready;
  const { files, removed } = plan(root, layout);
  const broken = files.find((f) => !reversible(f.before, f.after, f.edits));
  if (broken) {
    err(`specflow: port refused: ${broken.source} would change beyond ids and links. Nothing was changed.`);
    return 1;
  }

  const raw = fs.readFileSync(path.join(root, 'cortex/cortex.json'), 'utf-8');
  const store = JSON.parse(raw) as { specflow?: SpecflowConfig };
  const existing = readConfig(workTree(root));
  let config = existing;
  let wroteDefaults = false;
  if (existing.tests === undefined) {
    const tests = defaultTests(workTree(root).list());
    config = { ...existing, tests, rules: { b: 'off', c: 'off' } };
    wroteDefaults = true;
  }
  const report = buildReport(root, layout, files, config, ticket);
  const text = reportText(report);
  if (dryRun) {
    out(text);
    return 0;
  }

  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(root, f.target)), { recursive: true });
    git(root, 'mv', f.source, f.target);
    if (f.after !== f.before) fs.writeFileSync(path.join(root, f.target), f.after);
  }
  for (const f of removed) git(root, 'rm', '-q', f);
  removeEmptied(root, layout.top);
  if (wroteDefaults) {
    store.specflow = config;
    fs.writeFileSync(path.join(root, 'cortex/cortex.json'), `${JSON.stringify(store, null, 2)}\n`);
    out('specflow.tests written; review it:');
    out(JSON.stringify({ tests: config.tests, rules: config.rules }, null, 2));
  }
  specsIndex([], root, { stdout: out, stderr: err });
  git(root, 'add', 'specflow', 'cortex/cortex.json');

  fs.mkdirSync(path.join(root, REPORT_DIR), { recursive: true });
  fs.writeFileSync(path.join(root, REPORT_DIR, 'report.md'), text);
  fs.writeFileSync(path.join(root, REPORT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  excludeReports(root);

  out(text);
  out('Next, in order:');
  out('1. Review the staged move and commit it.');
  out('2. cortex store map');
  out('3. cortex hooks install');
  out('4. In specflow-onboard, port mode: promise conversion, then the tagging pass.');
  return 0;
}
