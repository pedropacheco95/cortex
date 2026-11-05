/**
 * The 4.0 managed blocks (schema Part II S8.3; spec store.managed-block):
 * `CLAUDE.md` gets an `@cortex/MAP.md` include, `AGENTS.md` a copy of MAP
 * (Codex does not follow includes). Content outside the block is never
 * touched; a 3.x block is left alone until the migration is accepted.
 */
import * as fs from 'fs';
import * as path from 'path';
import { MAP_FILE, loadStore, migrationAccepted, type Store } from './layout.js';
import { renderMap } from './map.js';
import { finding, type Finding } from './types.js';

export const BLOCK_START = '<!-- cortex:start v4.0 -->';
export const BLOCK_END = '<!-- cortex:end -->';
const ANY_BLOCK = /<!-- cortex:start(?:\s+v(\S+))? -->[\s\S]*?<!-- cortex:end -->/;

export const CLAUDE_BLOCK_BODY = [
  '## Cortex',
  'This project keeps its knowledge in `cortex/` (plain files, one subject each). Start from the map:',
  '@cortex/MAP.md',
].join('\n');

/** The `## Specs` section, stage 1 (Rule 10). The owner's wording: tests compare it byte for byte. */
export const SPECS_SECTION_STAGE1 = [
  '## Specs',
  '',
  '`specflow/` holds the specs. `specflow/promises/<area>/` has short promises (`P-…` ids) on what the product guarantees.',
  '`specflow/impl/<area>/` has implementation specs: their rules are numbered under a Rules heading, and their acceptance',
  'criteria carry stable ids (`PAY-REFUND-3`). Spec text that points at `.specflow/specs/<a>/<b>.spec.md` or',
  '`.specflow/specs-business/…` means the same file under `specflow/impl/` or `specflow/promises/`. A value more than one',
  'spec uses is a constant in a `constants.md`; a spec sees its own folder\'s and its ancestors\' constants, no others.',
  'A test cites a criterion by its id: vitest `it(\'[PAY-REFUND-3] …\')`, pytest `@pytest.mark.criterion("PAY-REFUND-3")`.',
  '`specflow/INDEX.md` (criteria, their tests, `unverified` marks, constants) is generated; never edit it.',
  '',
  'A finished change updates or adds the criterion for every behaviour it changes or adds, and a test that cites it.',
  '',
  'If `core.hooksPath` is `.githooks`, a git hook checks every commit. It runs no tests. It refuses:',
  '',
  '- a commit that changes code or config (anything outside `specflow/`, `cortex/`, tests, `.githooks/` and `.md` files) without changing a test;',
  '- a commit that changes a spec\'s rules or criteria together with code or config. Commit the spec change on its own,',
  '  before or after the code;',
  '- a commit that changes the text of an existing rule or criterion without a trailer',
  '  `Specflow-Amends: <spec-id>#<rule-7 or criterion id> — <reason>`, one per item. A new rule or criterion needs none.',
  '',
  'Merge commits are checked the same way on what the merge itself changes.',
  '',
  'Specs say what should hold; code says what does. Before changing code, find what produces the behaviour today and what depends on it. If a criterion describes what you change, change the criterion in the same change.',
  '',
  'An unverified criterion is a claim about the code, not a fact; check the code.',
  '',
  'If the request contradicts a rule, a \'Not this spec\' line or a recorded decision the owner made, do not build it: write the spec with the conflict as an open question and stop.',
].join('\n');

/** The two paragraphs stage 2 adds (Rule 11). */
export const SPECS_SECTION_STAGE2: readonly [string, string] = [
  'If the request creates a behaviour no criterion covers, or touches more than one spec, do not write code: run specflow-spec first and stop for review.',
  'If you were told the user can\'t answer during this run, don\'t wait: decide, write the decision and its reason under Open questions in the spec, and continue. This never applies to a conflict with a recorded owner decision; that always stops.',
];

/** The section this project's blocks carry, or null with no `specflow/` (Rules 8 and 9). */
export function specsSection(root: string): string | null {
  if (!fs.statSync(path.join(root, 'specflow'), { throwIfNoEntry: false })?.isDirectory()) return null;
  if (!fs.existsSync(path.join(root, '.claude', 'skills', 'specflow-spec', 'SKILL.md'))) return SPECS_SECTION_STAGE1;
  return [SPECS_SECTION_STAGE1, ...SPECS_SECTION_STAGE2].join('\n\n');
}

const withSection = (body: string, section: string | null): string => (section === null ? body : `${body}\n\n${section}`);

export function claudeBlock(section: string | null = null): string {
  return `${BLOCK_START}\n${withSection(CLAUDE_BLOCK_BODY, section)}\n${BLOCK_END}`;
}

export function agentsBlock(mapText: string, section: string | null = null): string {
  return `${BLOCK_START}\n${withSection(`## Cortex\n${mapText.replace(/\n$/, '')}`, section)}\n${BLOCK_END}`;
}

/** The version of the file's existing block (`"3.4"`, `"4.0"`), `""` for an unversioned one, null when it has none. */
export function blockVersion(text: string): string | null {
  const m = ANY_BLOCK.exec(text);
  if (!m) return null;
  return m[1] ?? '';
}

/** Replace an existing block in place, or append after one blank line; a new file holds only the block. */
export function withBlock(text: string | null, block: string): string {
  if (text === null) return block + '\n';
  if (ANY_BLOCK.test(text)) return text.replace(ANY_BLOCK, () => block);
  const base = text.replace(/\n*$/, '');
  return (base === '' ? '' : base + '\n\n') + block + '\n';
}

const is3x = (v: string | null): boolean => v !== null && !v.startsWith('4.');

export interface MapWriteResult { lines: string[]; written: string[] }

export interface MapWriteOptions {
  noAgents?: boolean;
  /** Write 4.0 blocks even over a 3.x block (`migrate --accept`). */
  force?: boolean;
  /** Write MAP.md only, never CLAUDE.md or AGENTS.md (`migrate --apply`). */
  mapOnly?: boolean;
}

export function writeBlockFile(root: string, name: string, block: string, accepted: boolean, force: boolean, res: MapWriteResult): void {
  const p = path.join(root, name);
  const text = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  const v = text === null ? null : blockVersion(text);
  if (!force && !accepted && is3x(v)) {
    res.lines.push(`${name}: managed block left at v3.x until migration is accepted`);
    return;
  }
  const next = withBlock(text, block);
  if (next !== text) {
    fs.writeFileSync(p, next);
    res.written.push(name);
    res.lines.push(`${name}: managed block written (v4.0)`);
  } else res.lines.push(`${name}: managed block up to date`);
}

/** `cortex store map`: MAP.md, then both blocks (store.map Rule 6; managed-block Rules 4–6). */
export function writeMapAndBlocks(root: string, opts: MapWriteOptions = {}): MapWriteResult {
  const store = loadStore(root);
  const res: MapWriteResult = { lines: [], written: [] };
  const map = renderMap(store);
  const mapPath = path.join(store.dir, MAP_FILE);
  if (!fs.existsSync(mapPath) || fs.readFileSync(mapPath, 'utf8') !== map) {
    fs.writeFileSync(mapPath, map);
    res.written.push(`cortex/${MAP_FILE}`);
  }
  res.lines.push(`cortex/${MAP_FILE}: written (${map.replace(/\n$/, '').split('\n').length} lines)`);
  if (opts.mapOnly) return res;
  const accepted = migrationAccepted(store);
  const section = specsSection(root);
  writeBlockFile(root, 'CLAUDE.md', claudeBlock(section), accepted, opts.force ?? false, res);
  if (!opts.noAgents) writeBlockFile(root, 'AGENTS.md', agentsBlock(map, section), accepted, opts.force ?? false, res);
  return res;
}

/** `check.map-fresh` (store.map Rule 6, managed-block Rule 7). */
export function checkMapFresh(store: Store): Finding[] {
  const out: Finding[] = [];
  const map = renderMap(store);
  // No MAP.md yet (a fresh `store init`) is not stale: there is nothing to differ.
  if (store.mapText !== null && store.mapText !== map) out.push(finding('warning', 'check.map-fresh', 'MAP.md', 'MAP.md is out of date; run cortex store map'));
  const section = specsSection(store.root);
  for (const [name, block] of [['CLAUDE.md', claudeBlock(section)], ['AGENTS.md', agentsBlock(map, section)]] as const) {
    const p = path.join(store.root, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    if (blockVersion(text)?.startsWith('4.') && ANY_BLOCK.exec(text)![0] !== block) {
      out.push(finding('warning', 'check.map-fresh', `../${name}`, `the ${name} managed block is out of date; run cortex store map`));
    }
  }
  return out;
}
