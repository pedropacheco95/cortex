/**
 * Atomic tests — `store.managed-block` (schema Part II S8.3), one per
 * acceptance criterion.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { storeInit } from '../../../src/store/init.js';
import { loadStore } from '../../../src/store/layout.js';
import { checkMapFresh, SPECS_SECTION_STAGE1, SPECS_SECTION_STAGE2 } from '../../../src/store/managed-block.js';
import { storeCli } from '../../../src/store/cli.js';
import { tmpRepo, cleanRepos } from '../../fixtures/store.js';
import { specsRoot } from '../../../src/paths.js';

afterEach(cleanRepos);

async function map(root: string, args: string[] = []): Promise<string[]> {
  const out: string[] = [];
  await storeCli(['map', ...args], root, { stdout: (l) => out.push(l) });
  return out;
}

function setMigration(root: string, accepted: string | null): void {
  const p = path.join(root, 'cortex/cortex.json');
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  cfg.migration = { from: '3.4', accepted };
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
}

const read = (root: string, f: string) => fs.readFileSync(path.join(root, f), 'utf8');

describe('store.managed-block', () => {
  it('[STORE-MANAGED-BLOCK-1] CLAUDE.md gets the include block', async () => {
    const root = tmpRepo('claude');
    storeInit(root);
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Project\n');
    await map(root);
    const text = read(root, 'CLAUDE.md');
    expect(text.startsWith('# Project\n')).toBe(true);
    expect(text.trimEnd().endsWith('<!-- cortex:end -->')).toBe(true);
    expect(text).toContain('<!-- cortex:start v4.0 -->');
    expect(text).toContain('@cortex/MAP.md');
  });

  it('[STORE-MANAGED-BLOCK-2] AGENTS.md gets a copy of MAP', async () => {
    const root = tmpRepo('agents');
    storeInit(root);
    await map(root);
    const text = read(root, 'AGENTS.md');
    expect(text.startsWith('<!-- cortex:start v4.0 -->')).toBe(true);
    expect(text.trimEnd().endsWith('<!-- cortex:end -->')).toBe(true);
    expect(text).toContain('## Filing a new fact');
  });

  it('[STORE-MANAGED-BLOCK-3] leaves content outside the block untouched', async () => {
    const root = tmpRepo('outside');
    storeInit(root);
    const before = '# Title\n\nIntro text.\n\n';
    const after = '\n\n## Later section\nKept.\n';
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), `${before}<!-- cortex:start v4.0 -->\nold body\n<!-- cortex:end -->${after}`);
    await map(root);
    const text = read(root, 'CLAUDE.md');
    expect(text.startsWith(before)).toBe(true);
    expect(text.endsWith(after)).toBe(true);
    expect(text).not.toContain('old body');
  });

  it('[STORE-MANAGED-BLOCK-4] leaves a 3.x block alone until acceptance', async () => {
    const root = tmpRepo('v3');
    storeInit(root);
    setMigration(root, null);
    const original = '# P\n\n<!-- cortex:start v3.4 -->\n3.x block\n<!-- cortex:end -->\n';
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), original);
    const out = await map(root);
    expect(read(root, 'CLAUDE.md')).toBe(original);
    expect(fs.existsSync(path.join(root, 'cortex/MAP.md'))).toBe(true);
    expect(out.join('\n')).toContain('left at v3.x');
  });

  it('[STORE-MANAGED-BLOCK-5] --no-agents skips AGENTS.md', async () => {
    const root = tmpRepo('noagents');
    storeInit(root);
    await map(root, ['--no-agents']);
    expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
  });
});

/** The fenced text of a numbered rule in the spec: Rules 10 and 11 are compared byte for byte. */
function ruleFence(n: number): string {
  const spec = fs.readFileSync(path.join(specsRoot(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')), 'store/managed-block.spec.md'), 'utf8');
  const rule = spec.slice(spec.indexOf(`\n${n}. **`));
  const open = rule.indexOf('    ```\n') + '    ```\n'.length;
  return rule.slice(open, rule.indexOf('\n    ```', open)).split('\n').map((l) => l.replace(/^ {4}/, '')).join('\n');
}

const body = (text: string): string => text.slice(text.indexOf('-->\n') + 4, text.indexOf('\n<!-- cortex:end -->'));
const RULE_2 = '## Cortex\nThis project keeps its knowledge in `cortex/` (plain files, one subject each). Start from the map:\n@cortex/MAP.md';

function withSpecs(label: string, skill = false): string {
  const root = tmpRepo(label);
  storeInit(root);
  fs.mkdirSync(path.join(root, 'specflow'));
  if (skill) addSkill(root);
  return root;
}

function addSkill(root: string): void {
  fs.mkdirSync(path.join(root, '.claude/skills/specflow-spec'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude/skills/specflow-spec/SKILL.md'), 'x\n');
}

const stale = (root: string): boolean => checkMapFresh(loadStore(root)).some((f) => f.message.includes('managed block is out of date'));

describe('store.managed-block: the Specs section', () => {
  it('[STORE-MANAGED-BLOCK-6] No specs, no section', async () => {
    const root = tmpRepo('nospecs');
    storeInit(root);
    await map(root);
    expect(body(read(root, 'CLAUDE.md'))).toBe(RULE_2);
    expect(read(root, 'CLAUDE.md')).not.toContain('## Specs');
    expect(read(root, 'AGENTS.md')).not.toContain('## Specs');
  });

  it('[STORE-MANAGED-BLOCK-7] A project with specs gets stage 1', async () => {
    const root = withSpecs('stage1');
    await map(root);
    expect(body(read(root, 'CLAUDE.md'))).toBe(`${RULE_2}\n\n${ruleFence(10)}`);
    expect(read(root, 'CLAUDE.md')).not.toContain('run specflow-spec first');
  });

  it('[STORE-MANAGED-BLOCK-8] A project with the skill gets stage 2', async () => {
    const root = withSpecs('stage2', true);
    await map(root);
    const text = read(root, 'CLAUDE.md');
    expect(body(text)).toBe(`${RULE_2}\n\n${ruleFence(10)}\n\n${ruleFence(11)}`);
    expect(text.trimEnd().endsWith('<!-- cortex:end -->')).toBe(true);
  });

  it('[STORE-MANAGED-BLOCK-9] AGENTS.md carries the same section', async () => {
    const root = withSpecs('agents', true);
    await map(root);
    const section = body(read(root, 'CLAUDE.md')).slice(RULE_2.length + 2);
    const agents = body(read(root, 'AGENTS.md'));
    expect(agents.endsWith(`\n\n${section}`)).toBe(true);
    expect(agents).toContain(read(root, 'cortex/MAP.md').replace(/\n$/, ''));
  });

  it('[STORE-MANAGED-BLOCK-10] Content outside the block stays untouched with the section', async () => {
    const root = tmpRepo('outside');
    storeInit(root);
    await map(root);
    const text = `before\n\n${read(root, 'CLAUDE.md').trimEnd()}\n\nafter\n`;
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), text);
    fs.mkdirSync(path.join(root, 'specflow'));
    await map(root);
    const next = read(root, 'CLAUDE.md');
    expect(next).toContain('## Specs');
    expect(next.startsWith('before\n\n<!-- cortex:start v4.0 -->')).toBe(true);
    expect(next.endsWith('<!-- cortex:end -->\n\nafter\n')).toBe(true);
  });

  it("[STORE-MANAGED-BLOCK-11] The owner's lines are the plan's lines", () => {
    const paragraphs = ruleFence(10).split('\n\n');
    const last = SPECS_SECTION_STAGE1.split('\n').filter((l) => l !== '').slice(-3);
    expect(last).toEqual(paragraphs.slice(-3));
    expect([...SPECS_SECTION_STAGE2]).toEqual(ruleFence(11).split('\n\n'));
  });

  it('[STORE-MANAGED-BLOCK-15] The hook sentence is true where no hook is installed', () => {
    const lines = SPECS_SECTION_STAGE1.split('\n');
    expect(lines).toContain('If `core.hooksPath` is `.githooks`, a git hook checks every commit. It runs no tests. It refuses:');
    expect(lines.filter((l) => l.startsWith('A git hook'))).toEqual([]);
  });

  it('[STORE-MANAGED-BLOCK-12] A new folder or skill makes the block stale', async () => {
    const root = withSpecs('staleskill');
    await map(root);
    expect(stale(root)).toBe(false);
    addSkill(root);
    expect(stale(root)).toBe(true);
    await map(root);
    expect(stale(root)).toBe(false);
  });

  it('[STORE-MANAGED-BLOCK-13] A new `specflow/` folder makes the block stale', async () => {
    const root = tmpRepo('stalefolder');
    storeInit(root);
    await map(root);
    expect(stale(root)).toBe(false);
    fs.mkdirSync(path.join(root, 'specflow'));
    expect(stale(root)).toBe(true);
  });

  it('[STORE-MANAGED-BLOCK-14] A 3.x block is still left alone', async () => {
    const root = withSpecs('still3x');
    setMigration(root, null);
    const text = '<!-- cortex:start v3.4 -->\nold\n<!-- cortex:end -->\n';
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), text);
    await map(root);
    expect(read(root, 'CLAUDE.md')).toBe(text);
  });
});
