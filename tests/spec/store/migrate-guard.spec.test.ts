/**
 * Spec-level test — `store.migrate` Rule 11. Before acceptance, the 3.x
 * `cortex sync` and `cortex init` leave CLAUDE.md and AGENTS.md
 * byte-identical and say so. After acceptance, or on a fresh 4.0 store, they
 * refuse and write nothing (amendment 2026-10-19), so a scheduled sync cannot
 * reinstall the 3.x hooks and skills that accept removed. Real 3.x inits on
 * temp projects.
 */
import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { init } from '../../../src/cli/init.js';
import { sync } from '../../../src/cli/sync.js';
import { migrateCli } from '../../../src/store/migrate/cli.js';
import { storeInit } from '../../../src/store/init.js';
import { makeTmpDir, cleanTmp, gitInit } from '../../fixtures/init-harness.js';
import { commitAll } from '../../fixtures/store.js';

const dirs: string[] = [];
afterAll(() => dirs.forEach(cleanTmp));

const FOUR_OH = 'this project uses the 4.0 store (cortex/); use cortex store init or cortex store map';

function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '.git') walk(p); } else out[path.relative(dir, p)] = fs.readFileSync(p).toString('base64');
    }
  };
  walk(dir);
  return out;
}

async function initProject(label: string): Promise<{ root: string; home: string }> {
  const root = makeTmpDir(`${label}-proj`);
  const home = makeTmpDir(`${label}-home`);
  dirs.push(root, home);
  gitInit(root);
  await init(root, { home, platform: 'darwin', noLlm: true });
  commitAll(root, '3.x init');
  return { root, home };
}

const quiet = { stdout: () => {}, stderr: () => {} };

describe('store.migrate Rule 11: the 3.x commands and a 4.0 store', () => {
  it('before acceptance: keeps both blocks byte-identical and prints the ownership line', async () => {
    const { root, home } = await initProject('guard-applied');
    expect(await migrateCli(['--apply', '--today', '2026-10-19'], root, quiet)).toBe(0);
    const block = '<!-- cortex:start v4.0 -->\nhand-written\n<!-- cortex:end -->\n';
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), block);
    const agentsPath = path.join(root, 'AGENTS.md');
    const agents = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : null;

    const s = await sync(root, { home, platform: 'darwin' });
    expect(s.summary).toContain('managed block owned by the 4.0 store (cortex/); left untouched');
    const i = await init(root, { home, platform: 'darwin', noLlm: true });
    expect(i.summary).toContain('managed block owned by the 4.0 store (cortex/); left untouched');

    expect(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')).toBe(block);
    expect(fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : null).toBe(agents);
  }, 120_000);

  it('after acceptance: sync and init refuse and write nothing', async () => {
    const { root, home } = await initProject('guard-accepted');
    expect(await migrateCli(['--apply', '--today', '2026-10-19'], root, quiet)).toBe(0);
    expect(await migrateCli(['--accept', '--today', '2026-10-19'], root, { ...quiet, home })).toBe(0);
    const before = tree(root);
    const s = await sync(root, { home, platform: 'darwin' });
    expect(s.exitCode).toBe(3);
    expect(s.summary).toContain(FOUR_OH);
    const i = await init(root, { home, platform: 'darwin', noLlm: true });
    expect(i.exitCode).toBe(2);
    expect(i.summary).toContain(FOUR_OH);
    expect(tree(root)).toEqual(before);
  }, 120_000);

  it('on a fresh 4.0 store with no .cortex/: sync and init refuse', async () => {
    const root = makeTmpDir('guard-fresh-proj');
    const home = makeTmpDir('guard-fresh-home');
    dirs.push(root, home);
    gitInit(root);
    storeInit(root);
    const before = tree(root);
    const s = await sync(root, { home, platform: 'darwin' });
    expect(s.exitCode).toBe(3);
    expect(s.summary).toContain(FOUR_OH);
    const i = await init(root, { home, platform: 'darwin', noLlm: true });
    expect(i.exitCode).toBe(2);
    expect(i.summary).toContain(FOUR_OH);
    expect(tree(root)).toEqual(before);
  }, 120_000);
});
