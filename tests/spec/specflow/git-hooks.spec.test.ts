/**
 * Spec tests — specflow.git-hooks: real commits through real hooks, with a
 * `cortex` compiled once into a cache folder and put on PATH.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { cleanRepos, tmpRepo } from '../../fixtures/store.js';
import { MANAGED_LINE, handWrittenHooks, installHooks } from '../../../src/specflow/hooks-install.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BUILD_TIMEOUT = 120_000;
const FIVE_TO_COME = ['commit-msg', 'pre-commit', 'pre-merge-commit', 'prepare-commit-msg'];

let out = '';
let bin = '';
afterEach(cleanRepos);

beforeAll(() => {
  out = fs.mkdtempSync(path.join(REPO, 'node_modules', '.hooks-test-'));
  execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json', '--outDir', out], { cwd: REPO });
  fs.chmodSync(path.join(out, 'cli/cli.js'), 0o755);
  bin = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-bin-'));
  fs.symlinkSync(path.join(out, 'cli/cli.js'), path.join(bin, 'cortex'));
}, BUILD_TIMEOUT);

afterAll(() => {
  fs.rmSync(out, { recursive: true, force: true });
  fs.rmSync(bin, { recursive: true, force: true });
});

function write(root: string, file: string, body: string, mode?: number): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), body);
  if (mode) fs.chmodSync(path.join(root, file), mode);
}
function env(withCortex = true): NodeJS.ProcessEnv {
  const base = (process.env['PATH'] ?? '').split(':').filter((p) => !fs.existsSync(path.join(p, 'cortex')));
  return { ...process.env, PATH: [...(withCortex ? [bin] : []), ...base].join(':') };
}
function git(root: string, args: string[], withCortex = true): { code: number | null; stdout: string; stderr: string } {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf-8', env: env(withCortex) });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}
function repo(): string {
  const root = tmpRepo('hooks');
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 't@example.com']);
  git(root, ['config', 'user.name', 'T']);
  write(root, 'cortex/cortex.json', JSON.stringify({ schemaVersion: '4.0', specflow: { tests: [{ runner: 'vitest', include: ['tests/**/*.test.ts'] }] } }));
  write(root, 'specflow/impl/billing/refunds.spec.md', '---\nid: billing.refunds\nstatus: draft\n---\n\n## Acceptance Criteria\n\n### BILLING-REFUNDS-1: A\n\n- **Then** ok\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'base']);
  return root;
}
function install(root: string, options = {}): { code: number; out: string[]; err: string[] } {
  const o: string[] = [];
  const e: string[] = [];
  const code = installHooks(root, options, { stdout: (l) => o.push(l), stderr: (l) => e.push(l) });
  return { code, out: o, err: e };
}
const since = (root: string): unknown => JSON.parse(fs.readFileSync(path.join(root, 'cortex/cortex.json'), 'utf-8')).specflow?.since;
const head = (root: string): string => git(root, ['rev-parse', 'HEAD']).stdout.trim();

describe('specflow.git-hooks: install', () => {
  it('Install points git at the hooks', () => {
    const root = repo();
    const r = install(root);
    expect(r.code).toBe(0);
    expect(git(root, ['config', 'core.hooksPath']).stdout.trim()).toBe('.githooks');
    for (const name of FIVE_TO_COME) {
      const file = path.join(root, '.githooks', name);
      expect(fs.statSync(file).mode & 0o111, name).not.toBe(0);
      expect(fs.readFileSync(file, 'utf-8').split('\n')[1]).toBe(MANAGED_LINE);
      expect(r.out).toContain(`wrote .githooks/${name}`);
    }
  });

  it('Install is idempotent', () => {
    const root = repo();
    install(root);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '--no-verify', '-m', 'hooks']);
    const r = install(root);
    expect(r.code).toBe(0);
    expect(r.out).toEqual([]);
    expect(git(root, ['status', '--porcelain']).stdout).toBe('');
  });

  it('Sample hooks are ignored', () => {
    const root = repo();
    write(root, '.git/hooks/pre-rebase.sample', '#!/bin/sh\n', 0o755);
    install(root);
    expect(fs.existsSync(path.join(root, '.githooks/pre-rebase'))).toBe(false);
  });

  it('A foreign hooks path is left alone', () => {
    const root = repo();
    git(root, ['config', 'core.hooksPath', '.husky']);
    const r = install(root);
    expect(r.code).toBe(1);
    expect(r.err[0]).toBe('specflow: core.hooksPath is already .husky; add these hooks there by hand');
    expect(r.err.join('\n')).toContain('cortex check --commit-msg');
    expect(fs.existsSync(path.join(root, '.githooks'))).toBe(false);
    expect(git(root, ['config', 'core.hooksPath']).stdout.trim()).toBe('.husky');
  });

  it('Outside git it refuses', () => {
    const root = tmpRepo('nogit');
    const r = install(root);
    expect(r.code).toBe(1);
    expect(r.err).toEqual(['specflow: not a git repository']);
  });

  it('A Cortex hook edited by hand is rewritten', () => {
    const root = repo();
    install(root);
    const file = path.join(root, '.githooks/pre-commit');
    const original = fs.readFileSync(file, 'utf-8');
    fs.writeFileSync(file, `${original}echo extra\n`);
    expect(install(root).code).toBe(0);
    expect(fs.readFileSync(file, 'utf-8')).toBe(original);
  });

  it('A fresh clone installs over its tracked hooks', () => {
    const root = repo();
    install(root);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '--no-verify', '-m', 'hooks']);
    const clone = path.join(tmpRepo('clone'), 'c');
    git(root, ['clone', '-q', root, clone]);
    expect(git(clone, ['config', 'core.hooksPath']).code).toBe(1);
    expect(install(clone).code).toBe(0);
    expect(git(clone, ['config', 'core.hooksPath']).stdout.trim()).toBe('.githooks');
    expect(git(clone, ['status', '--porcelain']).stdout).toBe('');
  });

  it('A hand-written hook stops the install', () => {
    const root = repo();
    git(root, ['config', 'core.hooksPath', '.githooks']);
    write(root, '.githooks/pre-commit', '#!/bin/sh\necho mine\n', 0o755);
    const r = install(root);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      'specflow: .githooks/pre-commit is not a Cortex hook; nothing was changed. Move it to .git/hooks/pre-commit, where it keeps running, and run this again.',
    ]);
    expect(fs.readdirSync(path.join(root, '.githooks'))).toEqual(['pre-commit']);
    expect(fs.readFileSync(path.join(root, '.githooks/pre-commit'), 'utf-8')).toContain('mine');
  });

  it('A hand-written hook stops the install with no hooks path set', () => {
    const root = repo();
    write(root, '.githooks/commit-msg', '#!/bin/sh\necho mine\n', 0o755);
    expect(install(root).code).toBe(1);
    expect(git(root, ['config', 'core.hooksPath']).code).toBe(1);
    expect(fs.readFileSync(path.join(root, '.githooks/commit-msg'), 'utf-8')).toContain('mine');
    expect(since(root)).toBeUndefined();
  });

  it('A passthrough does not overwrite a hand-written hook', () => {
    const root = repo();
    write(root, '.git/hooks/post-commit', '#!/bin/sh\n', 0o755);
    write(root, '.githooks/post-commit', '#!/bin/sh\necho mine\n', 0o755);
    const r = install(root);
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain('.githooks/post-commit');
    expect(fs.readFileSync(path.join(root, '.githooks/post-commit'), 'utf-8')).toContain('mine');
  });

  it('Moving the hand-written hook lets the install finish', () => {
    const root = repo();
    write(root, '.githooks/pre-commit', '#!/bin/sh\ntouch moved-hook-ran\n', 0o755);
    expect(install(root).code).toBe(1);
    fs.renameSync(path.join(root, '.githooks/pre-commit'), path.join(root, '.git/hooks/pre-commit'));
    expect(install(root).code).toBe(0);
    write(root, 'README.md', 'x');
    git(root, ['add', 'README.md']);
    expect(git(root, ['commit', '-q', '-m', 'x']).code).toBe(0);
    expect(fs.existsSync(path.join(root, 'moved-hook-ran'))).toBe(true);
  });

  it('A hook of another name is left alone', () => {
    const root = repo();
    write(root, '.githooks/pre-rebase', '#!/bin/sh\necho mine\n', 0o755);
    expect(install(root).code).toBe(0);
    expect(fs.readFileSync(path.join(root, '.githooks/pre-rebase'), 'utf-8')).toContain('mine');
  });

  it('the read-only check names hand-written hooks and writes nothing', () => {
    const root = repo();
    write(root, '.githooks/pre-commit', '#!/bin/sh\necho mine\n', 0o755);
    write(root, '.git/hooks/post-commit', '#!/bin/sh\n', 0o755);
    write(root, '.githooks/post-commit', '#!/bin/sh\necho mine\n', 0o755);
    const before = git(root, ['status', '--porcelain']).stdout;
    expect(handWrittenHooks(root).sort()).toEqual(['post-commit', 'pre-commit']);
    expect(git(root, ['status', '--porcelain']).stdout).toBe(before);
    expect(git(root, ['config', 'core.hooksPath']).code).toBe(1);
  });
});

describe('specflow.git-hooks: since', () => {
  it('Install records where judging starts, once', () => {
    const root = repo();
    const a = head(root);
    install(root);
    expect(since(root)).toBe(a);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '--no-verify', '-m', 'later']);
    install(root);
    expect(since(root)).toBe(a);
  });

  it('A sync refresh leaves since alone', () => {
    const root = repo();
    install(root, { writeSince: false });
    expect(since(root)).toBeUndefined();
  });

  it('a repository with no commit gets no since', () => {
    const root = tmpRepo('empty');
    git(root, ['init', '-q', '-b', 'main']);
    write(root, 'cortex/cortex.json', '{"schemaVersion":"4.0"}');
    expect(install(root).code).toBe(0);
    expect(since(root)).toBeUndefined();
  });
});

describe('specflow.git-hooks: real commits', () => {
  function installed(): string {
    const root = repo();
    install(root);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '--no-verify', '-m', 'hooks']);
    return root;
  }

  it('A real commit is refused through the hook', () => {
    const root = installed();
    const before = head(root);
    write(root, 'src/a.ts', 'x');
    git(root, ['add', '-A']);
    const r = git(root, ['commit', '-m', 'x']);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('rule (a)');
    expect(head(root)).toBe(before);
  });

  it('A missing binary refuses the commit', () => {
    const root = installed();
    write(root, 'README.md', 'x');
    git(root, ['add', '-A']);
    const r = git(root, ['commit', '-m', 'x'], false);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('specflow: cortex not found on PATH');
  });

  it('A failed INDEX refresh does not stop a commit', () => {
    const root = installed();
    const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-fake-'));
    write(fake, 'cortex', `#!/bin/sh\nif [ "$1" = "specs" ]; then exit 1; fi\nexec "${path.join(bin, 'cortex')}" "$@"\n`, 0o755);
    write(root, 'README.md', 'x');
    git(root, ['add', '-A']);
    const before = head(root);
    const r = spawnSync('git', ['commit', '-m', 'x'], { cwd: root, encoding: 'utf-8', env: { ...env(false), PATH: `${fake}:${env(false)['PATH']}` } });
    fs.rmSync(fake, { recursive: true, force: true });
    expect(r.status).toBe(0);
    expect(head(root)).not.toBe(before);
    expect(r.stderr).toContain('specflow: warning:');
  });

  it('The INDEX is refreshed in the commit', () => {
    const root = installed();
    const spec = 'specflow/impl/billing/refunds.spec.md';
    fs.appendFileSync(path.join(root, spec), '\n### BILLING-REFUNDS-2: B\n\n- **Then** ok\n');
    git(root, ['add', '-A']);
    expect(git(root, ['commit', '-q', '-m', 'x']).code).toBe(0);
    expect(git(root, ['show', 'HEAD:specflow/INDEX.md']).stdout).toContain('BILLING-REFUNDS-2');
  });

  it('An existing post-commit keeps running', () => {
    const root = repo();
    write(root, '.git/hooks/post-commit', '#!/bin/sh\ntouch marker\n', 0o755);
    install(root);
    write(root, 'README.md', 'x');
    git(root, ['add', '-A']);
    expect(git(root, ['commit', '-q', '-m', 'x']).code).toBe(0);
    expect(fs.existsSync(path.join(root, 'marker'))).toBe(true);
  });

  it('An existing hook of the same name runs first', () => {
    const root = repo();
    write(root, '.git/hooks/commit-msg', '#!/bin/sh\nexit 7\n', 0o755);
    install(root);
    write(root, 'README.md', 'x');
    git(root, ['add', '-A']);
    const before = head(root);
    expect(git(root, ['commit', '-q', '-m', 'x']).code).not.toBe(0);
    expect(head(root)).toBe(before);
  });

  it('an amend of a valid commit passes, and only a real amend sets the marker', () => {
    const root = installed();
    write(root, 'src/a.ts', 'x');
    write(root, 'tests/a.test.ts', 'y');
    git(root, ['add', '-A']);
    expect(git(root, ['commit', '-q', '-m', 'one']).code).toBe(0);
    expect(git(root, ['commit', '-q', '--amend', '-m', 'one, reworded']).code).toBe(0);
    expect(fs.existsSync(path.join(root, '.git/specflow-amend'))).toBe(false);
  });
});
