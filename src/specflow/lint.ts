/**
 * `cortex specs lint` (specflow.lint): the machine-checkable tree checks and
 * the constants rules. What needed judgement stays with the quality task.
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import matter from 'gray-matter';
import picomatch from 'picomatch';
import { buildIndex, resolveRelativePath } from '../schema/index-build.js';
import { checkBizSpecs } from '../schema/checks/bizspec.js';
import { checkDevSpecs } from '../schema/checks/devspec.js';
import { checkIdMatchesPath, checkOverviewPresent, checkOverviewShape } from '../schema/checks/specs.js';
import { checkXrefAcyclic, checkXrefSymmetry, checkXrefUnique } from '../schema/checks/xref.js';
import type { Violation } from '../schema/types.js';
import { withoutStoreAliases } from '../schema/validate.js';
import { loadStore } from '../store/layout.js';
import type { SpecsIO } from './index.js';
import { type Model, type SpecflowConfig, buildModel, naturalCompare, readConfig, resolveConstant } from './model/model.js';
import { criteriaSection, criterionPrefix, frontmatter, headings, parseCriteria } from './model/spec.js';
import { workTree } from './model/tree.js';
import { parseRules } from './check/items.js';
import { stampIds } from './port.js';

export interface Finding {
  level: 'error' | 'warning';
  check: string;
  path: string;
  message: string;
}

const CARRIED = new Set([
  'check.overview-present', 'check.overview-shape', 'check.id-matches-path', 'check.dev-spec', 'check.business-spec',
  'check.xref-symmetry', 'check.xref-unique', 'check.xref-acyclic',
]);
/** Carried checks that still run on a retired record (Rule 8). */
const ON_RECORDS = new Set(['check.id-matches-path', 'check.dev-spec', 'check.business-spec']);
const RUNNERS = new Set(['vitest', 'jest', 'node', 'pytest']);
const PROMISE_MAX_LINES = 40;
const CONST_USE = /const:([A-Z][A-Z0-9_]*)/g;
const UNITS = 'ms|s|min|h|days?|tokens|lines|KB|MB';
const LITERAL = new RegExp(`"([^"\\n]{8,})"|(\\b\\d+(?:\\.\\d+)?\\s?(?:${UNITS})\\b|\\b\\d+(?:\\.\\d+)?%)`, 'g');

interface SpecFile {
  file: string;
  text: string;
  fm: Record<string, unknown>;
  id: string;
  retired: boolean;
}

function read(tree: ReturnType<typeof workTree>, file: string): SpecFile {
  const text = tree.read(file) ?? '';
  const fm = frontmatter(text);
  const id = typeof fm['id'] === 'string' ? fm['id'] : file;
  return { file, text, fm, id, retired: fm['status'] === 'retired' };
}

const first = (v: unknown): string => {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === 'string' ? x : '';
};

function sectionBody(lines: string[], title: string): string[] | null {
  const all = headings(lines);
  const at = all.findIndex((h) => h.title === title && (h.level === 2 || h.level === 3));
  const start = all[at];
  if (!start) return null;
  const close = all.slice(at + 1).find((h) => h.level <= start.level);
  return lines.slice(start.line + 1, close ? close.line : lines.length);
}

function bodyFindings(s: SpecFile, add: (f: Omit<Finding, 'path'>) => void): void {
  const lines = s.text.split('\n');
  for (const title of ['Intent', 'Entities', 'Rules', 'Acceptance Criteria']) {
    const body = sectionBody(lines, title);
    if (body === null) add({ level: 'warning', check: 'lint.body', message: `no ${title} section` });
    else if (body.every((l) => l.trim() === '')) add({ level: 'warning', check: 'lint.body', message: `empty ${title} section` });
  }
  if (sectionBody(lines, 'Rules') && parseRules(s.text).length === 0) {
    const empty = (sectionBody(lines, 'Rules') as string[]).every((l) => l.trim() === '');
    if (!empty) add({ level: 'warning', check: 'lint.body', message: 'the Rules section has no numbered item' });
  }
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.includes('Field') && cells.includes('Type')) {
      add({ level: 'warning', check: 'lint.entity-table', message: 'a Field and Type table: state entities in prose' });
      break;
    }
  }
}

function criteriaFindings(s: SpecFile, add: (f: Omit<Finding, 'path'>) => void): void {
  const criteria = parseCriteria(s.text);
  const ids = criteria.flatMap((c) => (c.id ? [c.id] : []));
  const missing = criteria.filter((c) => !c.id);
  if (criteria.length > 0 && ids.length === 0) {
    add({ level: 'warning', check: 'lint.criterion-id', message: 'no criterion has an id' });
  } else {
    for (const c of missing) add({ level: 'error', check: 'lint.criterion-id', message: `heading without an id: ${c.title}` });
  }
  const prefix = criterionPrefix(s.id);
  const own = (id: string): boolean => id.slice(0, id.lastIndexOf('-')) === prefix;
  if (ids.some(own)) {
    for (const id of ids.filter((x) => !own(x))) {
      add({ level: 'error', check: 'lint.criterion-id', message: `${id} does not carry the prefix ${prefix}` });
    }
  }
  for (const c of criteria) {
    if (!/\bthen\b/i.test(c.text.split('\n').slice(1).join('\n'))) {
      add({ level: 'warning', check: 'lint.criterion-then', message: `no Then clause: ${c.id ?? c.title}` });
    }
  }
}

function layoutFindings(file: string, specs: string[], add: (f: Finding) => void): void {
  const base = path.posix.basename(file);
  const message = (m: string): void => add({ level: 'error', check: 'lint.layout', path: file, message: m });
  if (base === 'spec.md') {
    message('a file named just spec.md');
    return;
  }
  const inArea = /^specflow\/(impl|promises)\/[^/]+\/.+/.test(file);
  if (!inArea) {
    message('a spec must sit under specflow/impl/<area>/ or specflow/promises/<area>/');
    return;
  }
  const dir = path.posix.dirname(file);
  const stem = base.replace(/\.(spec|business)?\.?md$/, '');
  const mates = specs.filter((f) => path.posix.dirname(f) === dir);
  if (mates.length === 1 && path.posix.basename(dir) === stem) message('a leaf spec in a folder of its own');
}

function literalsOf(text: string): string[] {
  const found: string[] = [];
  for (const c of parseCriteria(text)) {
    const lines = c.text.split('\n').slice(1);
    const from = lines.findIndex((l) => /\bthen\b/i.test(l));
    if (from < 0) continue;
    const clause = lines.slice(from).join('\n').replace(/`[^`\n]*`/g, '').replace(/const:\S+/g, '');
    for (const m of clause.matchAll(LITERAL)) found.push((m[1] ?? m[2]) as string);
  }
  return found;
}

function commonDir(dirs: string[]): string {
  const split = dirs.map((d) => d.split('/'));
  const out: string[] = [];
  for (let i = 0; i < (split[0]?.length ?? 0); i += 1) {
    const part = split[0]?.[i];
    if (split.every((s) => s[i] === part)) out.push(part as string);
    else break;
  }
  return out.join('/');
}

function usesOf(specs: SpecFile[]): Map<string, string[]> {
  const uses = new Map<string, string[]>();
  for (const s of specs) {
    // A code span mentions a constant; it does not use one (as with literals, Rule 6).
    for (const m of s.text.replace(/`[^`\n]*`/g, '').matchAll(CONST_USE)) {
      const name = m[1] as string;
      const files = uses.get(name) ?? [];
      if (!files.includes(s.file)) files.push(s.file);
      uses.set(name, files);
    }
  }
  return uses;
}

function constantFindings(model: Model, live: SpecFile[], add: (f: Finding) => void): void {
  const uses = usesOf(live);
  for (const [name, files] of uses) {
    for (const file of files) {
      if (resolveConstant(model, name, file)) continue;
      const elsewhere = model.constants.find((c) => c.name === name);
      add({
        level: 'error',
        check: 'lint.constant-unresolved',
        path: file,
        message: elsewhere ? `const:${name} is declared in ${elsewhere.file}, which this spec cannot see; move it up` : `const:${name} resolves to nothing`,
      });
    }
  }
  for (const c of model.constants) {
    const dir = path.posix.dirname(c.file);
    const shadowed = model.constants.find(
      (o) => o !== c && o.name === c.name && dir.startsWith(`${path.posix.dirname(o.file)}/`),
    );
    if (shadowed) {
      add({ level: 'error', check: 'lint.constant-shadow', path: c.file, message: `${c.name} is also declared in ${shadowed.file}` });
    }
    const users = uses.get(c.name) ?? [];
    if (users.length === 0) {
      add({ level: 'warning', check: 'lint.constant-unused', path: c.file, message: `no spec names ${c.name}` });
      continue;
    }
    const seen = users.filter((f) => resolveConstant(model, c.name, f)?.file === c.file);
    if (seen.length === users.length) {
      const common = commonDir(users.map((f) => path.posix.dirname(f)));
      if (common !== dir && common.startsWith(`${dir}/`)) {
        add({ level: 'warning', check: 'lint.constant-placement', path: c.file, message: `${c.name} is used only under ${common}/` });
      }
    }
  }
}

function literalFindings(live: SpecFile[], ignore: string[], add: (f: Finding) => void): void {
  const bySpec = new Map<string, string[]>();
  for (const s of live) {
    for (const value of new Set(literalsOf(s.text))) {
      if (!ignore.includes(value)) bySpec.set(value, [...(bySpec.get(value) ?? []), s.file]);
    }
  }
  for (const [value, files] of bySpec) {
    if (files.length < 2) continue;
    add({ level: 'warning', check: 'lint.literal', path: files[0] as string, message: `${value} is repeated in the Then clauses of ${files.join(', ')}; make it a constant` });
  }
}

function retiredLinks(live: SpecFile[], specs: SpecFile[], promises: SpecFile[], add: (f: Finding) => void): void {
  const dead = new Set([...specs, ...promises].filter((s) => s.retired).flatMap((s) => [s.id, s.file]));
  for (const s of live) {
    const implemented = first(s.fm['implements']);
    const links = [
      first(s.fm['serves']),
      implemented ? path.posix.normalize(path.posix.join(path.posix.dirname(s.file), implemented)) : '',
      ...(Array.isArray(s.fm['depends_on']) ? (s.fm['depends_on'] as unknown[]).map(String) : []),
    ];
    for (const link of links) {
      if (dead.has(link)) add({ level: 'warning', check: 'lint.retired-link', path: s.file, message: `links to retired ${link}` });
    }
  }
}

function configFindings(root: string, config: SpecflowConfig, model: Model, files: string[], add: (f: Finding) => void): void {
  const at = 'cortex/cortex.json';
  const tests = config.tests ?? [];
  if (tests.length === 0) add({ level: 'error', check: 'lint.tests-config', path: at, message: 'specflow.tests is missing' });
  for (const t of tests) {
    if (!RUNNERS.has(t.runner)) add({ level: 'error', check: 'lint.tests-config', path: at, message: `unknown runner ${t.runner}` });
    for (const glob of t.include) {
      const match = picomatch(glob, { dot: true });
      if (!files.some((f) => match(f))) {
        add({ level: 'warning', check: 'lint.tests-config', path: at, message: `include ${glob} matches no file` });
      }
    }
  }
  const on = ['b', 'c'].filter((k) => (config.rules?.[k] ?? 'off') !== 'off');
  if (on.length > 0 && model.untagged.length > 0) {
    add({ level: 'error', check: 'lint.rules-early', path: at, message: `rule ${on.join(', ')} is on with ${model.untagged.length} untagged tests` });
  }
  for (const t of model.orphanTags) {
    add({ level: 'error', check: 'lint.orphan-tag', path: t.file, message: `[${t.id}] names no criterion: ${t.name}` });
  }
  const hooksPath = spawnSync('git', ['config', 'core.hooksPath'], { cwd: root, encoding: 'utf-8' }).stdout?.trim();
  if (hooksPath !== '.githooks') {
    add({ level: 'warning', check: 'lint.hooks-installed', path: at, message: 'core.hooksPath is not .githooks; run cortex hooks install' });
  }
}

async function carried(root: string, retiredFiles: Set<string>): Promise<{ findings: Finding[]; raw: Violation[] }> {
  const index = await buildIndex(root);
  const raw = withoutStoreAliases([
    ...checkOverviewPresent(root),
    ...checkOverviewShape(root),
    ...checkIdMatchesPath(root),
    ...await checkDevSpecs(root, index),
    ...await checkBizSpecs(root, index),
    ...await checkXrefSymmetry(root, index),
    ...await checkXrefUnique(root, index),
    ...await checkXrefAcyclic(root, index),
  ], loadStore(root)).filter((v) => CARRIED.has(v.check));
  const findings: Finding[] = [];
  for (const v of raw) {
    const file = path.relative(root, v.location.path).split(path.sep).join('/');
    if (retiredFiles.has(file) && !ON_RECORDS.has(v.check)) continue;
    findings.push({ level: v.severity === 'error' ? 'error' : 'warning', check: v.check, path: file, message: v.message });
  }
  return { findings, raw };
}

export async function lintTree(root: string): Promise<Finding[]> {
  const tree = workTree(root);
  const config = readConfig(tree);
  const files = tree.list();
  const model = buildModel(tree, config);
  const specFiles = files.filter((f) => f.startsWith('specflow/') && (f.endsWith('.spec.md') || f.endsWith('.business.md') || path.posix.basename(f) === 'spec.md'));
  const promiseFiles = files.filter((f) => f.startsWith('specflow/promises/') && f.endsWith('.md') && path.posix.basename(f) !== '_overview.md' && path.posix.basename(f) !== 'constants.md');
  const specs = files.filter((f) => f.startsWith('specflow/impl/') && f.endsWith('.spec.md')).map((f) => read(tree, f));
  const promises = promiseFiles.map((f) => read(tree, f));
  const live = specs.filter((s) => !s.retired);

  const findings: Finding[] = [];
  const add = (f: Finding): void => {
    findings.push(f);
  };
  const retiredFiles = new Set([...specs, ...promises].filter((s) => s.retired).map((s) => s.file));
  findings.push(...(await carried(root, retiredFiles)).findings);

  for (const f of new Set([...specFiles, ...promiseFiles])) layoutFindings(f, [...specFiles, ...promiseFiles], add);
  for (const s of live) {
    const at = (f: Omit<Finding, 'path'>): void => add({ ...f, path: s.file });
    bodyFindings(s, at);
    criteriaFindings(s, at);
    if (!s.fm['implements'] && !s.fm['serves']) at({ level: 'warning', check: 'lint.orphan', message: 'no implements: and no serves:' });
  }
  const owners = new Map<string, string[]>();
  for (const s of specs) {
    for (const c of parseCriteria(s.text)) if (c.id) owners.set(c.id, [...(owners.get(c.id) ?? []), s.file]);
  }
  for (const [id, where] of owners) {
    if (new Set(where).size > 1) add({ level: 'error', check: 'lint.criterion-id', path: where[0] as string, message: `${id} is used in ${where.join(', ')}` });
  }
  const served = new Set(live.flatMap((s) => {
    const implemented = first(s.fm['implements']);
    return [first(s.fm['serves']), implemented ? path.posix.normalize(path.posix.join(path.posix.dirname(s.file), implemented)) : ''];
  }));
  for (const p of promises.filter((x) => !x.retired)) {
    if (!served.has(p.id) && !served.has(p.file)) add({ level: 'warning', check: 'lint.orphan', path: p.file, message: 'nothing serves this promise' });
    if (!p.file.endsWith('.business.md') && matter(p.text).content.trim().split('\n').length > PROMISE_MAX_LINES) {
      add({ level: 'warning', check: 'lint.promise-size', path: p.file, message: `the body is over ${PROMISE_MAX_LINES} lines` });
    }
  }
  constantFindings(model, live, add);
  literalFindings(live, config.literals?.ignore ?? [], add);
  retiredLinks(live, specs, promises, add);
  configFindings(root, config, model, files, add);
  return findings.sort((a, b) => naturalCompare(`${a.path} ${a.check} ${a.message}`, `${b.path} ${b.check} ${b.message}`));
}

/** Move a constant's line to `target`'s constants.md, creating it when absent. */
function moveConstant(root: string, name: string, from: string, targetDir: string): void {
  const source = path.join(root, from);
  const lines = fs.readFileSync(source, 'utf-8').split('\n');
  const at = lines.findIndex((l) => new RegExp(`^\\s+${name}:`).test(l));
  if (at < 0) return;
  const [line] = lines.splice(at, 1);
  fs.writeFileSync(source, lines.join('\n'));
  const target = path.join(root, targetDir, 'constants.md');
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, `---\nconstants:\n${line}\n---\n\n# Constants\n`);
    return;
  }
  fs.writeFileSync(target, fs.readFileSync(target, 'utf-8').replace(/^constants:.*\n/m, (m) => `${m.trimEnd()}\n${line}\n`));
}

function fixConstants(root: string, model: Model, live: SpecFile[]): void {
  const uses = usesOf(live);
  for (const c of model.constants) {
    const users = uses.get(c.name) ?? [];
    if (users.length === 0) continue;
    const dir = path.posix.dirname(c.file);
    const unseen = users.some((f) => resolveConstant(model, c.name, f) === null);
    const common = commonDir(users.map((f) => path.posix.dirname(f)));
    if (unseen) moveConstant(root, c.name, c.file, commonDir([dir, common]));
    else if (common !== dir && common.startsWith(`${dir}/`)) moveConstant(root, c.name, c.file, common);
  }
}

function fixFrontmatter(root: string, s: SpecFile): void {
  const full = path.join(root, s.file);
  const text = fs.readFileSync(full, 'utf-8');
  const one = /^implements:\s*\n\s+-\s+(\S+)[ \t]*$|^implements:\s*\[\s*([^,\]\s]+)\s*\]\s*$/m;
  const next = text.replace(one, (_, a?: string, b?: string) => `implements: ${a ?? b}`);
  if (next !== text) fs.writeFileSync(full, next);
}

function fixIds(root: string, s: SpecFile): void {
  const lines = s.text.split('\n');
  if (!criteriaSection(lines) || s.id === s.file) return;
  const edits: { line: number; from: string; to: string }[] = [];
  stampIds(lines, s.id, edits);
  if (edits.length > 0) fs.writeFileSync(path.join(root, s.file), lines.join('\n'));
}

function fixReverseLink(root: string, s: SpecFile): void {
  const link = first(s.fm['implements']);
  if (!link) return;
  const full = path.join(root, s.file);
  const target = resolveRelativePath(full, link);
  if (!target) return;
  const text = fs.readFileSync(target, 'utf-8');
  const by = matter(text).data['implemented_by'];
  const listed = Array.isArray(by) ? (by as string[]).map((r) => resolveRelativePath(target, r)) : [];
  if (listed.includes(full)) return;
  const relative = path.relative(path.dirname(target), full).split(path.sep).join('/');
  const next = text.replace(/^implemented_by:.*\n/m, (m) => `${m.replace(/\s*\[\s*\]\s*$/, '').trimEnd()}\n  - ${relative}\n`);
  if (next !== text) fs.writeFileSync(target, next);
}

async function applyFixes(root: string): Promise<void> {
  const tree = workTree(root);
  const specs = tree.list().filter((f) => f.startsWith('specflow/impl/') && f.endsWith('.spec.md')).map((f) => read(tree, f));
  const live = specs.filter((s) => !s.retired);
  for (const v of checkOverviewPresent(root)) {
    if (v.check !== 'check.overview-present') continue;
    const name = path.basename(v.location.path);
    const stub = `# ${name}\n\n## What this is\n\nTODO\n\n## What it covers\n\nTODO\n\n## Why it's grouped this way\n\nTODO\n`;
    fs.writeFileSync(path.join(v.location.path, '_overview.md'), stub);
  }
  for (const s of live) {
    fixIds(root, s);
    fixFrontmatter(root, s);
  }
  const reread = workTree(root);
  for (const s of live) fixReverseLink(root, read(reread, s.file));
  fixConstants(root, buildModel(reread), live);
}

export async function specsLint(args: string[], root = '.', io: SpecsIO = {}): Promise<number> {
  const out = io.stdout ?? ((l: string) => console.log(l));
  const err = io.stderr ?? ((l: string) => console.error(l));
  const unknown = args.find((a) => a !== '--json' && a !== '--fix');
  if (unknown !== undefined) {
    err(`specflow: unknown argument ${unknown}`);
    return 2;
  }
  if (!fs.existsSync(path.join(root, 'specflow'))) {
    err('specflow: no specflow/ folder here');
    return 1;
  }
  if (args.includes('--fix')) await applyFixes(root);
  const findings = await lintTree(root);
  const errors = findings.filter((f) => f.level === 'error').length;
  if (args.includes('--json')) {
    out(JSON.stringify({ findings, counts: { error: errors, warning: findings.length - errors } }, null, 2));
  } else {
    for (const f of findings) out(`${f.level} ${f.check} ${f.path}: ${f.message}`);
  }
  return errors > 0 ? 1 : 0;
}
