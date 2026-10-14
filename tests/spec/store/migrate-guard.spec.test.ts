/**
 * Spec-level test — `store.migrate` Rule 11: once a project's 4.0 store
 * owns the managed block, the 3.x `cortex sync` and `cortex init` leave
 * CLAUDE.md and AGENTS.md byte-identical and say so. A real 3.x init on a
 * temp project, then an accepted migration, then both 3.x commands.
 */
import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { init } from '../../../src/cli/init.js';
import { sync } from '../../../src/cli/sync.js';
import { migrateCli } from '../../../src/store/migrate/cli.js';
import { makeTmpDir, cleanTmp, gitInit } from '../../fixtures/init-harness.js';
import { commitAll } from '../../fixtures/store.js';

const dirs: string[] = [];
afterAll(() => dirs.forEach(cleanTmp));

describe('store.migrate Rule 11: 3.x sync and init leave the 4.0 block alone', () => {
  it('keeps both blocks byte-identical and prints the ownership line', async () => {
    const root = makeTmpDir('migrate-guard-proj');
    const home = makeTmpDir('migrate-guard-home');
    dirs.push(root, home);
    gitInit(root);
    await init(root, { home, platform: 'darwin', noLlm: true });
    commitAll(root, '3.x init');
    const quiet = { stdout: () => {}, stderr: () => {} };
    expect(await migrateCli(['--apply', '--today', '2026-10-14'], root, quiet)).toBe(0);
    expect(await migrateCli(['--accept', '--today', '2026-10-14'], root, quiet)).toBe(0);
    const claude = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    expect(claude).toContain('<!-- cortex:start v4.0 -->');

    const s = await sync(root, { home, platform: 'darwin' });
    expect(s.summary).toContain('managed block owned by the 4.0 store (cortex/); left untouched');
    const i = await init(root, { home, platform: 'darwin', noLlm: true });
    expect(i.summary).toContain('managed block owned by the 4.0 store (cortex/); left untouched');

    expect(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')).toBe(claude);
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe(agents);
  }, 120_000);
});
