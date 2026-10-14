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

export function claudeBlock(): string {
  return `${BLOCK_START}\n${CLAUDE_BLOCK_BODY}\n${BLOCK_END}`;
}

export function agentsBlock(mapText: string): string {
  return `${BLOCK_START}\n## Cortex\n${mapText.replace(/\n$/, '')}\n${BLOCK_END}`;
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
  const accepted = migrationAccepted(store);
  writeBlockFile(root, 'CLAUDE.md', claudeBlock(), accepted, opts.force ?? false, res);
  if (!opts.noAgents) writeBlockFile(root, 'AGENTS.md', agentsBlock(map), accepted, opts.force ?? false, res);
  return res;
}

/** `check.map-fresh` (store.map Rule 6, managed-block Rule 7). */
export function checkMapFresh(store: Store): Finding[] {
  const out: Finding[] = [];
  const map = renderMap(store);
  // No MAP.md yet (a fresh `store init`) is not stale: there is nothing to differ.
  if (store.mapText !== null && store.mapText !== map) out.push(finding('warning', 'check.map-fresh', 'MAP.md', 'MAP.md is out of date; run cortex store map'));
  for (const [name, block] of [['CLAUDE.md', claudeBlock()], ['AGENTS.md', agentsBlock(map)]] as const) {
    const p = path.join(store.root, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    if (blockVersion(text)?.startsWith('4.') && ANY_BLOCK.exec(text)![0] !== block) {
      out.push(finding('warning', 'check.map-fresh', `../${name}`, `the ${name} managed block is out of date; run cortex store map`));
    }
  }
  return out;
}
