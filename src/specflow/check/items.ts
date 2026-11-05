/** Rule items of a spec and how they changed (specflow.check Rule 5). */
import { fencedLines, frontmatter, headings, parseCriteria } from '../model/spec.js';
import type { Tree } from '../model/tree.js';

export type Change = 'added' | 'changed' | 'removed';

export interface ItemChange {
  spec: string;
  file: string;
  /** `rule-<n>` or a criterion id. */
  item: string;
  change: Change;
  /** The commit changed the spec's status to or from `retired`. */
  retiring: boolean;
}

interface NumberedRule {
  n: number;
  text: string;
}

function normal(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

/** The numbered items under a heading titled exactly `Rules`. */
export function parseRules(text: string): NumberedRule[] {
  const lines = text.split('\n');
  const all = headings(lines);
  const at = all.findIndex((h) => h.title === 'Rules');
  const start = all[at];
  if (!start) return [];
  const close = all.slice(at + 1).find((h) => h.level <= start.level);
  const end = close ? close.line : lines.length;
  const rules: NumberedRule[] = [];
  const fenced = fencedLines(lines);
  let open: { n: number; body: string[] } | null = null;
  for (let at = start.line + 1; at < end; at += 1) {
    const line = (lines[at] as string).replace(/\r$/, '');
    const m = fenced.has(at) ? null : /^ {0,3}(\d+)[.)]\s+(.*)$/.exec(line);
    if (m) {
      if (open) rules.push({ n: open.n, text: normal(open.body.join('\n')) });
      open = { n: Number(m[1]), body: [m[2] as string] };
    } else if (open) {
      open.body.push(line);
    }
  }
  if (open) rules.push({ n: open.n, text: normal(open.body.join('\n')) });
  return rules;
}

function criteriaById(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of parseCriteria(text)) {
    // A repeated id keeps every text, so an edit to either is still seen.
    if (c.id) map.set(c.id, [map.get(c.id), normal(c.text)].filter(Boolean).join('\0'));
  }
  return map;
}

function specId(text: string, file: string): string {
  const id = frontmatter(text)['id'];
  return typeof id === 'string' && id !== '' ? id : file;
}

function compare(spec: string, file: string, base: string, staged: string, retiring: boolean): ItemChange[] {
  const found: ItemChange[] = [];
  const add = (item: string, change: Change): void => {
    found.push({ spec, file, item, change, retiring });
  };
  const oldRules = parseRules(base);
  const newRules = parseRules(staged);
  const oldTexts = new Set(oldRules.map((r) => r.text));
  const newTexts = new Set(newRules.map((r) => r.text));
  const newNumbers = new Set(newRules.map((r) => r.n));
  for (const r of oldRules) {
    if (!newTexts.has(r.text)) add(`rule-${r.n}`, newNumbers.has(r.n) ? 'changed' : 'removed');
  }
  for (const r of newRules) if (!oldTexts.has(r.text)) add(`rule-${r.n}`, 'added');
  const oldCriteria = criteriaById(base);
  const newCriteria = criteriaById(staged);
  for (const [id, text] of oldCriteria) {
    const now = newCriteria.get(id);
    if (now === undefined) add(id, 'removed');
    else if (now !== text) add(id, 'changed');
  }
  for (const id of newCriteria.keys()) if (!oldCriteria.has(id)) add(id, 'added');
  return found;
}

/** Files of a change set, a deleted one and an added one with the same id being one moved spec. */
function pairFiles(paths: string[], base: Tree, staged: Tree): { file: string; before: string | null; after: string | null }[] {
  const pairs = paths
    .filter((file) => file.startsWith('specflow/impl/') && file.endsWith('.spec.md'))
    .map((file) => ({ file, before: base.read(file), after: staged.read(file) }));
  const moved = new Set<unknown>();
  for (const gone of pairs.filter((p) => p.after === null)) {
    const id = specId(gone.before ?? '', gone.file);
    const landed = pairs.find((p) => p.before === null && !moved.has(p) && specId(p.after ?? '', p.file) === id);
    if (!landed) continue;
    moved.add(landed);
    landed.before = gone.before;
    moved.add(gone);
  }
  return pairs.filter((p) => !moved.has(p) || p.before !== null && p.after !== null);
}

/**
 * The items a change set adds, changes or removes. A moved spec is compared with
 * itself, so a move changes no item. A spec retired on both sides has no items;
 * retiring one removes them all and un-retiring adds them.
 */
export function itemChanges(paths: string[], base: Tree, staged: Tree): ItemChange[] {
  const found: ItemChange[] = [];
  for (const { file, before, after } of pairFiles(paths, base, staged)) {
    const id = specId(after ?? before ?? '', file);
    const wasRetired = before !== null && frontmatter(before)['status'] === 'retired';
    const isRetired = after !== null && frontmatter(after)['status'] === 'retired';
    if (wasRetired && (isRetired || after === null)) continue;
    if (isRetired) found.push(...compare(id, file, before ?? '', '', true));
    else if (wasRetired) found.push(...compare(id, file, '', after ?? '', true));
    else found.push(...compare(id, file, before ?? '', after ?? '', false));
  }
  return found;
}
