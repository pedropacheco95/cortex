/**
 * The data the page embeds (specflow.viewer Rules 4, 5, 7, 8). Two trees,
 * `business` for the promises and `dev` for the implementation specs: the
 * template keeps the names it always had and shows them as Promises and
 * Implementation. Everything is sorted and carries no build date, so the same
 * tree gives the same bytes.
 */
import * as path from 'path';
import { type Model, type ModelTest, counts, naturalCompare } from '../model/model.js';
import { type Criterion, parseCriteria } from '../model/spec.js';
import type { Tree } from '../model/tree.js';
import {
  type Entity,
  type Step,
  firstSentence,
  folderLabel,
  hasKnownSections,
  listOf,
  parseEntities,
  parseFile,
  parseNotes,
  parseRules,
  parseSteps,
  splitSections,
  titleFromId,
} from './parse.js';

type TreeName = 'business' | 'dev';

const ROOTS: Record<TreeName, string> = { business: 'specflow/promises', dev: 'specflow/impl' };
const STATUSES = ['draft', 'approved', 'implemented', 'deprecated', 'retired'];

export interface ViewCriterion {
  /** Empty when the heading carries no id. */
  id: string;
  title: string;
  steps: Step[];
  raw: string;
  unverified: boolean;
  tests: ModelTest[];
}

export interface ViewSpec {
  id: string;
  domain: string;
  capability: string;
  kind: 'leaf';
  tree: TreeName;
  path: string;
  title: string;
  status: string;
  depends_on: string[];
  implements: string[];
  implemented_by: string[];
  intent: string;
  entities: Entity[];
  entities_raw: string;
  rules: string[];
  rules_raw: string;
  acceptance_criteria: ViewCriterion[];
  notes: string[];
  open_questions: string[];
  /** The whole body, only for a file with none of the sections above. */
  body: string;
  broken: boolean;
  warnings: string[];
}

interface Entry {
  tree: TreeName;
  file: string;
  id: string;
  /** What the model read as the status; empty when unset or unreadable. */
  status: string;
  retired: boolean;
  /** Set for a live implementation spec: its criteria as the model has them. */
  model?: Model['specs'][number];
  promiseFile: string;
}

function plain(criteria: Criterion[]): ViewCriterion[] {
  return criteria.map((c) => ({
    id: c.id ?? '',
    title: c.title,
    steps: parseSteps(c.text),
    raw: c.text.split('\n').slice(1).join('\n').trim(),
    unverified: false,
    tests: [],
  }));
}

function entries(model: Model): Entry[] {
  const out: Entry[] = [];
  for (const s of model.specs) {
    out.push({ tree: 'dev', file: s.file, id: s.id, status: s.status, retired: false, model: s, promiseFile: s.promise });
  }
  for (const p of model.promises) {
    out.push({ tree: 'business', file: p.file, id: p.id, status: '', retired: false, promiseFile: '' });
  }
  for (const r of model.retired) {
    const tree: TreeName = r.file.startsWith(`${ROOTS.business}/`) ? 'business' : 'dev';
    out.push({ tree, file: r.file, id: r.id, status: 'retired', retired: true, promiseFile: '' });
  }
  return out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

export interface Payload {
  project: { title: string };
  trees: Record<TreeName, unknown>;
  default_tree: TreeName;
  business_present: boolean;
  tests_configured: boolean;
  counts: Record<string, number>;
  constants: Model['constants'];
  untagged: { file: string; name: string; line: number }[];
  warnings: { spec_id: string; tree: TreeName; message: string }[];
}

export function buildPayload(tree: Tree, model: Model, title: string, warn: (line: string) => void): Payload {
  const list = entries(model);
  const files = tree.list();

  // One id per page: a clash falls back to the file path, which is unique.
  const used = new Set<string>();
  const unique = (id: string, file: string): string => {
    const taken = used.has(id);
    const chosen = taken ? file : id;
    used.add(chosen);
    return chosen;
  };
  const idOf = new Map<string, string>();
  for (const e of list) idOf.set(e.file, unique(e.id, e.file));
  const devIds = new Set(list.filter((e) => e.tree === 'dev').map((e) => idOf.get(e.file) as string));

  const specs: ViewSpec[] = [];
  const pageWarnings: Payload['warnings'] = [];
  const parseWarned = new Set<string>();
  const parsed = (file: string): ReturnType<typeof parseFile> => {
    const p = parseFile(tree.read(file) ?? '');
    if (p.error !== null && !parseWarned.has(file)) {
      parseWarned.add(file);
      warn(`specflow: warning: ${file}: frontmatter does not parse (${p.error})`);
    }
    return p;
  };

  const promiseIdOf = new Map<string, string>();
  for (const e of list) if (e.tree === 'business' && !e.retired) promiseIdOf.set(e.file, idOf.get(e.file) as string);

  for (const e of list) {
    const text = tree.read(e.file) ?? '';
    const p = parsed(e.file);
    const sections = splitSections(p.body);
    const id = idOf.get(e.file) as string;
    const warnings: string[] = [];
    if (p.error !== null) warnings.push(`frontmatter does not parse: ${p.error}`);

    const rawStatus = e.model || e.retired ? e.status : typeof p.fm['status'] === 'string' ? p.fm['status'] : '';
    let status = rawStatus.trim().toLowerCase();
    if (status === '') status = 'draft';
    if (!STATUSES.includes(status)) {
      warnings.push(`unknown status '${status}': shown as 'draft'`);
      status = 'draft';
    }

    const root = ROOTS[e.tree];
    const rel = e.file.slice(root.length + 1);
    const dir = path.posix.dirname(rel);
    const stem = path.posix.basename(rel).replace(/\.(spec|business)\.md$|\.md$/, '');

    let criteria: ViewCriterion[];
    if (e.model) {
      criteria = e.model.criteria.map((c) => ({
        id: c.id,
        title: c.title,
        steps: parseSteps(c.text),
        raw: c.text.split('\n').slice(1).join('\n').trim(),
        unverified: c.unverified,
        tests: c.tests,
      }));
      if (e.model.missingIds) {
        const bare = plain(parseCriteria(text).filter((c) => !c.id));
        for (const c of bare) warnings.push(`criterion without an id: ${c.title}`);
        criteria.push(...bare);
      }
    } else {
      criteria = plain(parseCriteria(text));
    }

    const dependsOn = listOf(p.fm['depends_on']);
    for (const d of dependsOn) if (e.tree === 'dev' && !devIds.has(d)) warnings.push(`depends_on references unknown spec '${d}'`);

    const implementsIds = e.tree === 'dev' && !e.retired && promiseIdOf.has(e.promiseFile) ? [promiseIdOf.get(e.promiseFile) as string] : [];
    if (e.tree === 'dev' && !e.retired) {
      if (sections.intent === '') warnings.push('missing Intent section');
      if (criteria.length === 0) warnings.push('no acceptance criteria found');
      for (const c of criteria) {
        if (!/\bthen\b/i.test(c.raw)) warnings.push(`acceptance criterion '${c.title}' has no Then step`);
      }
    }

    const notes = parseNotes(sections.notes);
    specs.push({
      id,
      domain: dir === '.' ? '' : dir,
      capability: stem,
      kind: 'leaf',
      tree: e.tree,
      path: e.file,
      title: sections.title || titleFromId(id),
      status,
      depends_on: dependsOn,
      implements: implementsIds,
      implemented_by: [],
      intent: sections.intent,
      entities: sections.entities ? parseEntities(sections.entities) : [],
      entities_raw: sections.entities,
      rules: sections.rules ? parseRules(sections.rules) : [],
      rules_raw: sections.rules,
      acceptance_criteria: criteria,
      notes: notes.notes,
      open_questions: notes.open,
      body: hasKnownSections(sections) ? '' : sections.rest,
      broken: p.error !== null,
      warnings,
    });
  }

  // The promise lists the specs that serve it, from the model's links.
  const byId = new Map(specs.map((s) => [s.id, s]));
  for (const s of specs) {
    for (const target of s.implements) byId.get(target)?.implemented_by.push(s.id);
  }
  for (const s of specs) s.implemented_by.sort(naturalCompare);

  const promisesPresent = specs.some((s) => s.tree === 'business');
  for (const s of specs) {
    if (s.tree === 'dev' && s.status !== 'retired' && promisesPresent && s.implements.length === 0) {
      s.warnings.push('unmapped: no promise serves it');
    }
  }

  const treeData = (name: TreeName): unknown => {
    const mine = specs.filter((s) => s.tree === name);
    const statusCounts: Record<string, number> = Object.fromEntries(STATUSES.map((k) => [k, 0]));
    for (const s of mine) statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1;

    const root = ROOTS[name];
    const dirs = new Set<string>(['']);
    for (const f of files) {
      if (!f.startsWith(`${root}/`)) continue;
      let d = path.posix.dirname(f.slice(root.length + 1));
      while (d !== '.' && d !== '') {
        dirs.add(d);
        d = path.posix.dirname(d);
      }
    }
    const leavesOf = new Map<string, string[]>();
    for (const s of mine) {
      leavesOf.set(s.domain, [...(leavesOf.get(s.domain) ?? []), s.id]);
    }
    // a folder that only holds folders still gets a row
    for (const domain of [...leavesOf.keys()]) {
      for (let d = path.posix.dirname(domain); d !== '.' && d !== ''; d = path.posix.dirname(d)) {
        if (!leavesOf.has(d)) leavesOf.set(d, []);
      }
    }
    const domains = [...leavesOf]
      .map(([domain, leaves]) => ({ domain, leaves: leaves.sort(naturalCompare) }))
      .sort((a, b) => (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0));

    const overviews: Record<string, unknown> = {};
    for (const d of [...dirs].sort()) {
      const file = d === '' ? `${root}/_overview.md` : `${root}/${d}/_overview.md`;
      const present = files.includes(file);
      const read = present ? parsed(file) : null;
      const sections = read ? splitSections(read.body) : null;
      overviews[d] = {
        tree: name,
        folder_path: d,
        file: present ? '_overview.md' : '',
        title: sections?.title || folderLabel(d, name),
        body: sections ? sections.rest : '',
        summary: read ? firstSentence(read.body.trim()) : '',
      };
    }
    return { status_counts: statusCounts, domains, specs: mine, overviews };
  };

  for (const s of specs) for (const w of s.warnings) pageWarnings.push({ spec_id: s.id, tree: s.tree, message: w });

  return {
    project: { title },
    trees: { business: treeData('business'), dev: treeData('dev') },
    default_tree: promisesPresent ? 'business' : 'dev',
    business_present: promisesPresent,
    tests_configured: model.testsConfigured,
    counts: counts(model),
    constants: model.constants,
    untagged: model.untagged
      .map(({ file, name, line }) => ({ file, name, line }))
      .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line)),
    warnings: pageWarnings,
  };
}
