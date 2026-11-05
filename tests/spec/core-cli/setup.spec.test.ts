/**
 * Spec-level tests — `core-cli.init` Rule 20, one per acceptance criterion:
 * `cortex init` at 4.0, on real project trees under a test package root.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { parseInitArgs, setupProject, type SetupOptions } from '../../../src/cli/setup.js';
import { run as cortex } from '../../../src/cli/cli.js';
import { updateRoute } from '../../../src/cli/update.js';
import { FINAL_BUNDLES } from '../../../src/store/migrate/system.js';
import { storeInit } from '../../../src/store/init.js';
import { tmpRepo, cleanRepos, gitInit } from '../../fixtures/store.js';

afterEach(cleanRepos);

function pkg(names: readonly string[] = FINAL_BUNDLES): string {
  const dir = tmpRepo('pkg');
  for (const n of [...names, 'cortex-migrate']) {
    fs.mkdirSync(path.join(dir, 'skills', n), { recursive: true });
    fs.writeFileSync(path.join(dir, 'skills', n, 'SKILL.md'), `---\nname: ${n}\ndescription: 'x'\n---\n\n# ${n}\n`);
  }
  return dir;
}

function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p, 'latin1');
    }
  };
  walk(dir);
  return out;
}

async function run(target: string, opts: Partial<SetupOptions> = {}): Promise<{ code: number; text: string }> {
  const home = opts.home ?? tmpRepo('home');
  const r = await setupProject(target, { platform: 'darwin', home, appSupportDir: path.join(home, 'app'), packageDir: opts.packageDir ?? pkg(), today: '2026-11-20', ...opts });
  return { code: r.exitCode, text: r.out.join('\n') };
}

function store(root: string, cfg: unknown): void {
  fs.mkdirSync(path.join(root, 'cortex'), { recursive: true });
  fs.writeFileSync(path.join(root, 'cortex/cortex.json'), typeof cfg === 'string' ? cfg : JSON.stringify(cfg));
}

function legacy(root: string): void {
  fs.mkdirSync(path.join(root, '.cortex'), { recursive: true });
  fs.writeFileSync(path.join(root, '.cortex/cortex.config.json'), '{"schemaVersion":"3.4"}');
}

function retired(root: string): void {
  fs.mkdirSync(path.join(root, '.claude/skills/specflow-plan'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude/skills/specflow-plan/SKILL.md'), 'plan\n');
}

const installed = (root: string): boolean => FINAL_BUNDLES.every((n) => fs.existsSync(path.join(root, '.claude/skills', n, 'SKILL.md')));
const ACCEPTED = { schemaVersion: '4.0', visibility: { repo: 'private', allow: [] }, migration: { from: '3.4', accepted: '2026-11-01' } };

describe('core-cli.init Rule 20', () => {
  it('init sets up a new project in one command', async () => {
    const root = tmpRepo('new');
    gitInit(root);
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'cortex/cortex.json'), 'utf8')).migration).toBeUndefined();
    expect(fs.existsSync(path.join(root, 'cortex/MAP.md'))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')).toContain('<!-- cortex:start v4.0 -->');
    expect(installed(root)).toBe(true);
    expect(fs.existsSync(path.join(root, '.cortex'))).toBe(false);
    expect(r.text.split('\n')[0]).toMatch(/^created: /);
  });

  it('init reads a named target', async () => {
    const cwd = process.cwd();
    const here = tmpRepo('here');
    const p = tmpRepo('p');
    process.chdir(here);
    try {
      const r = await run(p);
      expect(r.code, r.text).toBe(0);
    } finally {
      process.chdir(cwd);
    }
    expect(fs.existsSync(path.join(p, 'cortex/cortex.json'))).toBe(true);
    expect(fs.readdirSync(here)).toEqual([]);
  });

  it('init run twice changes nothing the second time', async () => {
    const root = tmpRepo('twice');
    gitInit(root);
    const packageDir = pkg();
    const home = tmpRepo('home');
    await run(root, { packageDir, home });
    const before = { root: tree(root), home: tree(home) };
    const r = await run(root, { packageDir, home });
    expect(r.code, r.text).toBe(0);
    expect({ root: tree(root), home: tree(home) }).toEqual(before);
    expect(r.text).not.toMatch(/removed|installed|updated/);
  });

  it('init on a project with a store runs only the update route', async () => {
    const root = tmpRepo('store');
    store(root, ACCEPTED);
    const packageDir = pkg();
    await run(root, { packageDir });
    fs.rmSync(path.join(root, '.claude/skills/specflow-spec'), { recursive: true });
    const pick = (): Record<string, string> => Object.fromEntries(Object.entries(tree(path.join(root, 'cortex'))).filter(([k]) => k !== 'MAP.md'));
    const before = pick();
    const r = await run(root, { packageDir });
    expect(r.code, r.text).toBe(0);
    expect(installed(root)).toBe(true);
    expect(pick()).toEqual(before);
  });

  it('init on a store with no migration field runs only the update route', async () => {
    const root = tmpRepo('nofield');
    storeInit(root);
    const cfg = fs.readFileSync(path.join(root, 'cortex/cortex.json'), 'utf8');
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(installed(root)).toBe(true);
    expect(fs.readFileSync(path.join(root, 'cortex/cortex.json'), 'utf8')).toBe(cfg);
  });

  it('init on an unaccepted migration refuses', async () => {
    const root = tmpRepo('unaccepted');
    store(root, { schemaVersion: '4.0', migration: { from: '3.4', accepted: null } });
    legacy(root);
    const before = tree(root);
    const r = await run(root);
    expect(r.code).toBe(3);
    expect(r.text).toContain('cortex init: refused — this project\'s migration is not accepted; finish it with cortex migrate --accept. Nothing was written.');
    expect(tree(root)).toEqual(before);
  });

  it('init on a migration field with no date refuses', async () => {
    const root = tmpRepo('nodate');
    store(root, { schemaVersion: '4.0', migration: { from: '3.4' } });
    const before = tree(root);
    const r = await run(root);
    expect(r.code).toBe(3);
    expect(r.text).toContain('finish it with cortex migrate --accept');
    expect(tree(root)).toEqual(before);
  });

  it('init on an unreadable store file refuses', async () => {
    for (const cfg of ['{nope', '{"visibility":{}}']) {
      const root = tmpRepo('unreadable');
      store(root, cfg);
      const before = tree(root);
      const r = await run(root);
      expect(r.code).toBe(3);
      expect(r.text).toContain('cortex init: refused — cortex/cortex.json is not valid');
      expect(tree(root)).toEqual(before);
    }
  });

  it('init on a store of another major version refuses', async () => {
    const root = tmpRepo('major');
    store(root, { schemaVersion: '5.0' });
    const before = tree(root);
    const r = await run(root);
    expect(r.code).toBe(3);
    expect(r.text).toContain('this store is schema 5.0');
    expect(tree(root)).toEqual(before);
  });

  it('init on a 3.x project refuses and creates no store', async () => {
    const root = tmpRepo('3x');
    legacy(root);
    retired(root);
    const before = tree(root);
    const r = await run(root);
    expect(r.code).toBe(3);
    expect(r.text).toContain('migrate it first with cortex migrate');
    expect(fs.existsSync(path.join(root, 'cortex'))).toBe(false);
    expect(tree(root)).toEqual(before);
  });

  it('init on a 3.x project where store init already ran refuses', async () => {
    const root = tmpRepo('3xbare');
    legacy(root);
    retired(root);
    storeInit(root);
    const before = tree(root);
    const r = await run(root);
    expect(r.code).toBe(3);
    expect(r.text).toContain('migrate it first with cortex migrate');
    expect(tree(root)).toEqual(before);
  });

  it('init on a .cortex folder with no config refuses and creates no store', async () => {
    const root = tmpRepo('3xnoconfig');
    fs.mkdirSync(path.join(root, '.cortex/compass'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex/compass/r.md'), 'rule\n');
    retired(root);
    const before = tree(root);
    const r = await run(root);
    expect(r.code).toBe(3);
    expect(r.text).toContain('migrate it first with cortex migrate');
    expect(fs.existsSync(path.join(root, 'cortex'))).toBe(false);
    expect(tree(root)).toEqual(before);
  });

  it('init on an accepted project that keeps its old folder runs the update route', async () => {
    const root = tmpRepo('keeps');
    store(root, ACCEPTED);
    legacy(root);
    const before = tree(path.join(root, '.cortex'));
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(tree(path.join(root, '.cortex'))).toEqual(before);
  });

  it('init on another platform writes nothing', async () => {
    const root = tmpRepo('linux');
    const r = await run(root, { platform: 'linux' });
    expect(r.code).toBe(2);
    expect(r.text).toContain('requires macOS');
    expect(fs.existsSync(path.join(root, 'cortex'))).toBe(false);
  });

  it('init inside a store refuses and names the project', async () => {
    const p = tmpRepo('p');
    store(p, ACCEPTED);
    fs.mkdirSync(path.join(p, 'cortex/world'), { recursive: true });
    const q = tmpRepo('q');
    legacy(q);
    fs.mkdirSync(path.join(q, '.cortex/pulse'), { recursive: true });
    for (const [target, root] of [[path.join(p, 'cortex/world'), p], [path.join(q, '.cortex/pulse'), q]] as const) {
      const before = tree(root);
      const r = await run(target);
      expect(r.code).toBe(2);
      expect(r.text).toBe(`cortex init: refused — this is inside the Cortex store of ${root}; run cortex init there. Nothing was written.`);
      expect(tree(root)).toEqual(before);
    }
  });

  it('A project folder named cortex is not a store', async () => {
    const root = path.join(tmpRepo('parent'), 'cortex');
    fs.mkdirSync(root);
    gitInit(root);
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(fs.existsSync(path.join(root, 'cortex/cortex.json'))).toBe(true);
  });

  it('init leaves the commit check off', async () => {
    const root = tmpRepo('off');
    gitInit(root);
    fs.mkdirSync(path.join(root, 'specflow'));
    const r = await run(root);
    expect(() => execFileSync('git', ['config', 'core.hooksPath'], { cwd: root, stdio: 'pipe' })).toThrow();
    expect(fs.existsSync(path.join(root, '.githooks'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'cortex/cortex.json'), 'utf8')).specflow).toBeUndefined();
    expect(r.text).toContain('hooks: not installed; run cortex hooks install');
  });

  it('A failed update route keeps the store and a second run finishes', async () => {
    const root = tmpRepo('failroute');
    gitInit(root);
    const packageDir = pkg();
    const first = await run(root, { packageDir, update: async () => ({ exitCode: 1, out: ['cortex sync: stopped at skills: boom'] }) });
    expect(first.code).toBe(1);
    expect(fs.existsSync(path.join(root, 'cortex/cortex.json'))).toBe(true);
    const second = await run(root, { packageDir });
    expect(second.code, second.text).toBe(0);
    expect(installed(root)).toBe(true);
  });

  it('A failed store init stops before the update route', async () => {
    const root = tmpRepo('failstore');
    let started = false;
    const r = await run(root, {
      initStore: () => { throw new Error('read-only'); },
      update: async (t, o) => { started = true; return updateRoute(t, o); },
    });
    expect(r.code).toBe(1);
    expect(started).toBe(false);
  });

  it('a package lacking part of the final set writes nothing', async () => {
    const root = tmpRepo('lacks');
    const r = await run(root, { packageDir: pkg(FINAL_BUNDLES.filter((n) => n !== 'cortex-quality')) });
    expect(r.code).toBe(1);
    expect(r.text).toBe('cortex init: refused — this package lacks cortex-quality. Nothing was written.');
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('Old flags are ignored and named', () => {
    const a = parseInitArgs(['--no-llm', '--yes', '--timeout-ms', '5', '--profile', 'specflow']);
    expect(a).toEqual({ target: '.', ignored: ['--no-llm', '--yes', '--timeout-ms', '--profile'] });
    expect(parseInitArgs(['--force', 'proj', '-y', '--partial'])).toEqual({ target: 'proj', ignored: ['--force', '-y', '--partial'] });
  });

  it('An unknown flag writes nothing', () => {
    expect(parseInitArgs(['--nope'])).toEqual({ unknown: '--nope' });
  });

  it('The verb names ignored flags first, and refuses an unknown one with nothing written', async () => {
    const root = tmpRepo('flags');
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((m: string) => void errors.push(m));
    try {
      expect(await cortex(['init', root, '--nope'])).toBe(2);
      expect(errors).toEqual(['cortex init: unknown flag --nope. Nothing was written.']);
      expect(fs.readdirSync(root)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it('The usage text still points at init', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m: string) => void lines.push(m));
    try {
      await cortex(['--help']);
    } finally {
      spy.mockRestore();
    }
    const text = lines.join('\n');
    expect(text).toContain('Run `cortex init` to set up a project');
    expect(text).toMatch(/init \[target\]$/m);
  });
});
