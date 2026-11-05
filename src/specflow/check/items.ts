/** Rule items of a spec and how they changed (specflow.check Rule 5). */
import { frontmatter, headings, parseCriteria } from '../model/spec.js';
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
  let open: { n: number; body: string[] } | null = null;
  for (const line of lines.slice(start.line + 1, end)) {
    const m = /^(\d+)\.\s+(.*)$/.exec(line);
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
  for (const c of parseCriteria(text)) if (c.id) map.set(c.id, normal(c.text));
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

/**
 * The items a change set adds, changes or removes. Specs are paired by id, so
 * moving a spec file changes no item. A spec retired on both sides has no items;
 * retiring one removes them all and un-retiring adds them.
 */
export function itemChanges(paths: string[], base: Tree, staged: Tree): ItemChange[] {
  const pairs = new Map<string, { file: string; before: string | null; after: string | null }>();
  for (const file of paths) {
    if (!file.startsWith('specflow/impl/') || !file.endsWith('.spec.md')) continue;
    const before = base.read(file);
    const after = staged.read(file);
    const id = specId(after ?? before ?? '', file);
    const pair = pairs.get(id) ?? { file, before: null, after: null };
    pair.before = pair.before ?? before;
    pair.after = pair.after ?? after;
    if (after !== null) pair.file = file;
    pairs.set(id, pair);
  }
  const found: ItemChange[] = [];
  for (const [id, { file, before, after }] of pairs) {
    const wasRetired = before !== null && frontmatter(before)['status'] === 'retired';
    const isRetired = after !== null && frontmatter(after)['status'] === 'retired';
    if (wasRetired && (isRetired || after === null)) continue;
    if (isRetired) found.push(...compare(id, file, before ?? '', '', true));
    else if (wasRetired) found.push(...compare(id, file, '', after ?? '', true));
    else found.push(...compare(id, file, before ?? '', after ?? '', false));
  }
  return found;
}
