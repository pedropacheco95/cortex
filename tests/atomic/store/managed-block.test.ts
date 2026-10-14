/**
 * Atomic tests — `store.managed-block` (schema Part II S8.3), one per
 * acceptance criterion.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { storeInit } from '../../../src/store/init.js';
import { storeCli } from '../../../src/store/cli.js';
import { tmpRepo, cleanRepos } from '../../fixtures/store.js';

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
  it('CLAUDE.md gets the include block', async () => {
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

  it('AGENTS.md gets a copy of MAP', async () => {
    const root = tmpRepo('agents');
    storeInit(root);
    await map(root);
    const text = read(root, 'AGENTS.md');
    expect(text.startsWith('<!-- cortex:start v4.0 -->')).toBe(true);
    expect(text.trimEnd().endsWith('<!-- cortex:end -->')).toBe(true);
    expect(text).toContain('## Filing a new fact');
  });

  it('leaves content outside the block untouched', async () => {
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

  it('leaves a 3.x block alone until acceptance', async () => {
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

  it('--no-agents skips AGENTS.md', async () => {
    const root = tmpRepo('noagents');
    storeInit(root);
    await map(root, ['--no-agents']);
    expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
  });
});
