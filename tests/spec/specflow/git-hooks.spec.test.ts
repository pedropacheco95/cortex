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
const FIVE = ['commit-msg', 'pre-commit', 'pre-merge-commit', 'prepare-commit-msg', 'pre-push'];

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
    for (const name of FIVE) {
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

  it('No store means no since', () => {
    const root = tmpRepo('nostore');
    git(root, ['init', '-q', '-b', 'main']);
    write(root, 'a.md', 'x');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'a']);
    expect(install(root).code).toBe(0);
    expect(fs.existsSync(path.join(root, '.githooks/commit-msg'))).toBe(true);
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

  it('A commit reusing another message is not an amend', () => {
    const root = installed();
    const sha = head(root);
    write(root, 'src/a.ts', 'x');
    git(root, ['add', '-A']);
    const r = git(root, ['commit', '-C', sha]);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('src/a.ts');
    expect(fs.existsSync(path.join(root, '.git/specflow-amend'))).toBe(false);
  });

  it('A hook with no specflow folder stays quiet', () => {
    const root = tmpRepo('quiet');
    git(root, ['init', '-q', '-b', 'main']);
    git(root, ['config', 'user.email', 't@example.com']);
    git(root, ['config', 'user.name', 'T']);
    install(root);
    write(root, 'a.md', 'x');
    git(root, ['add', '-A']);
    const r = git(root, ['commit', '-m', 'a']);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toContain('INDEX');
  });

  it('An amend with -m is judged whole', () => {
    const root = installed();
    write(root, 'src/a.ts', 'x');
    write(root, 'tests/a.test.ts', 'y');
    git(root, ['add', '-A']);
    expect(git(root, ['commit', '-q', '-m', 'one']).code).toBe(0);
    const spec = 'specflow/impl/billing/refunds.spec.md';
    fs.appendFileSync(path.join(root, spec), '\n### BILLING-REFUNDS-2: B\n\n- **Then** ok\n');
    git(root, ['add', '-A']);
    const r = git(root, ['commit', '--amend', '-m', 'one and a spec']);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('rule (d)');
  });

  it('Commit -C HEAD is not an amend', () => {
    const root = installed();
    write(root, 'src/a.ts', 'x');
    write(root, 'tests/a.test.ts', 'y');
    git(root, ['add', '-A']);
    expect(git(root, ['commit', '-q', '-m', 'one']).code).toBe(0);
    write(root, 'src/d.ts', 'x');
    git(root, ['add', '-A']);
    const r = git(root, ['commit', '-C', 'HEAD']);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('rule (a)');
  });

  it('A failed amend leaves nothing for the next commit', () => {
    const root = installed();
    write(root, 'src/a.ts', 'x');
    write(root, 'tests/a.test.ts', 'y');
    git(root, ['add', '-A']);
    expect(git(root, ['commit', '-q', '-m', 'one']).code).toBe(0);
    const failed = spawnSync('git', ['commit', '--amend'], { cwd: root, encoding: 'utf-8', env: { ...env(), GIT_EDITOR: 'false' } });
    expect(failed.status).not.toBe(0);
    write(root, 'src/d.ts', 'x');
    git(root, ['add', '-A']);
    expect(git(root, ['commit', '-m', 'code only']).code).not.toBe(0);
  });

  it('An amend of a clean merge is judged as a merge', () => {
    const root = installed();
    git(root, ['checkout', '-q', '-b', 'side']);
    write(root, 'src/side.ts', 'x');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '--no-verify', '-m', 'side']);
    git(root, ['checkout', '-q', 'main']);
    write(root, 'README.md', 'x');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'main']);
    expect(git(root, ['merge', '-q', '--no-ff', '--no-edit', 'side']).code).toBe(0);
    expect(git(root, ['commit', '-q', '--amend', '--no-edit']).code).toBe(0);
  });

  it('An amend of the first commit is not judged', () => {
    const root = tmpRepo('first');
    git(root, ['init', '-q', '-b', 'main']);
    git(root, ['config', 'user.email', 't@example.com']);
    git(root, ['config', 'user.name', 'T']);
    write(root, 'specflow/impl/billing/refunds.spec.md', '---\nid: billing.refunds\nstatus: draft\n---\n\n## Rules\n\n1. One.\n');
    write(root, 'src/a.ts', 'x');
    install(root);
    git(root, ['add', '-A']);
    expect(git(root, ['commit', '-q', '-m', 'first']).code).toBe(0);
    expect(git(root, ['commit', '-q', '--amend', '--no-edit']).code).toBe(0);
  });

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

  it('A cortex too old for the hooks says what to do', () => {
    const root = installed();
    const old = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-old-'));
    write(old, 'cortex', '#!/bin/sh\necho "Usage: cortex <verb> [options]"\nexit 2\n', 0o755);
    write(root, 'README.md', 'x');
    git(root, ['add', '-A']);
    const before = head(root);
    const r = spawnSync('git', ['commit', '-m', 'x'], { cwd: root, encoding: 'utf-8', env: { ...env(false), PATH: `${old}:${env(false)['PATH']}` } });
    fs.rmSync(old, { recursive: true, force: true });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('specflow: the check could not run (exit 2).');
    expect(head(root)).toBe(before);
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

describe('specflow.git-hooks: push', () => {
  /** A repository with hooks installed and committed, pushed to a bare origin. */
  function pushed(): string {
    const root = repo();
    install(root);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '--no-verify', '-m', 'hooks']);
    const bare = path.join(tmpRepo('bare'), 'o.git');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
    git(root, ['remote', 'add', 'origin', bare]);
    git(root, ['push', '-q', '--no-verify', '-u', 'origin', 'main']);
    git(root, ['remote', 'set-head', 'origin', 'main']);
    return root;
  }
  function commitCodeOnly(root: string): void {
    write(root, 'src/a.ts', 'x');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '--no-verify', '-m', 'code only']);
  }
  function commitValid(root: string): void {
    write(root, 'src/b.ts', 'x');
    write(root, 'tests/b.test.ts', 'y');
    git(root, ['add', '-A']);
    expect(git(root, ['commit', '-q', '-m', 'valid']).code).toBe(0);
  }

  it('A push of a bad range is refused', () => {
    const root = pushed();
    commitCodeOnly(root);
    const r = git(root, ['push', '-q', 'origin', 'main']);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('rule (a)');
  });

  it('A branch deletion is not judged', () => {
    const root = pushed();
    git(root, ['checkout', '-q', '-b', 'old']);
    commitCodeOnly(root);
    git(root, ['push', '-q', '--no-verify', 'origin', 'old']);
    git(root, ['checkout', '-q', 'main']);
    const r = git(root, ['push', '-q', 'origin', '--delete', 'old']);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toContain('rule (a)');
  });

  it('A new branch is compared with its merge base', () => {
    const root = pushed();
    git(root, ['checkout', '-q', '-b', 'new']);
    commitValid(root);
    const r = git(root, ['push', '-u', 'origin', 'new']);
    expect(r.code).toBe(0);
    expect(r.stderr.match(/specflow: allowed/g)).toHaveLength(1);
  });

  it('A first push does not judge old commits', () => {
    const root = repo();
    for (let i = 0; i < 30; i += 1) {
      write(root, 'src/a.ts', `${i}`);
      git(root, ['add', '-A']);
      git(root, ['commit', '-q', '--no-verify', '-m', 'old, no tests']);
    }
    install(root);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '--no-verify', '-m', 'hooks']);
    commitValid(root);
    const bare = path.join(tmpRepo('bare'), 'o.git');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
    git(root, ['remote', 'add', 'origin', bare]);
    const r = git(root, ['push', 'origin', 'main']);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toContain('old, no tests');
    expect(r.stderr).toContain(' valid\n');
  });

  it('A new branch with no base says so', () => {
    const root = pushed();
    git(root, ['remote', 'set-head', 'origin', '--delete']);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'cortex/cortex.json'), 'utf-8'));
    delete config.specflow.since;
    git(root, ['checkout', '-q', '-b', 'new']);
    write(root, 'cortex/cortex.json', JSON.stringify(config));
    commitValid(root);
    const r = git(root, ['push', 'origin', 'new']);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('specflow: no base to compare for refs/heads/new; nothing was checked');
  });

  it('an existing pre-push gets the same stdin', () => {
    const root = repo();
    write(root, '.git/hooks/pre-push', '#!/bin/sh\ncat > seen\n', 0o755);
    install(root);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '--no-verify', '-m', 'hooks']);
    const bare = path.join(tmpRepo('bare'), 'o.git');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
    git(root, ['remote', 'add', 'origin', bare]);
    git(root, ['push', '-q', 'origin', 'main']);
    expect(fs.readFileSync(path.join(root, 'seen'), 'utf-8')).toContain('refs/heads/main');
  });
});

describe('specflow.check Rule 19: the commit order table', () => {
  const SPEC = 'specflow/impl/billing/refunds.spec.md';
  const body = (crit: string, extra = ''): string =>
    `---\nid: billing.refunds\nstatus: draft\n---\n\n## Intent\n\nWhy.${extra}\n\n## Rules\n\n1. One.\n\n## Acceptance Criteria\n\n${crit}`;
  const A = '### BILLING-REFUNDS-1: A\n\n- **Then** ok\n';
  const A2 = '### BILLING-REFUNDS-1: A changed\n\n- **Then** ok\n';
  const B = '\n### BILLING-REFUNDS-2: B\n\n- **Then** ok\n';
  const NEW = '\n### BILLING-REFUNDS-3: C\n\n- **Then** ok\n';
  const AMEND = 'amend\n\nSpecflow-Amends: billing.refunds#BILLING-REFUNDS-1 — why\n';
  const T1 = (n: number): string => `it('[BILLING-REFUNDS-1] t', () => { v(${n}); });\n`;
  const T2 = (n: number): string => `it('[BILLING-REFUNDS-2] u', () => { v(${n}); });\n`;

  function table(): string {
    const root = repo();
    write(root, 'cortex/cortex.json', JSON.stringify({ schemaVersion: '4.0', specflow: { rules: { b: 'refuse', c: 'refuse' }, tests: [{ runner: 'vitest', include: ['tests/**/*.test.ts'] }] } }));
    write(root, SPEC, body(A + B));
    write(root, 'tests/a.test.ts', T1(0));
    write(root, 'tests/b.test.ts', T2(0));
    write(root, 'src/a.ts', '0');
    install(root);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '--no-verify', '-m', 'base']);
    git(root, ['commit', '-q', '--no-verify', '--allow-empty', '-m', 'so HEAD changed no test']);
    git(root, ['checkout', '-q', '-b', 'work']);
    return root;
  }
  function attempt(root: string, files: Record<string, string>, message = 'c'): { code: number | null; stderr: string } {
    for (const [f, t] of Object.entries(files)) write(root, f, t);
    git(root, ['add', '-A']);
    return git(root, ['commit', '-m', message]);
  }
  const check = (root: string): { status: number | null; stderr: string } =>
    spawnSync(path.join(bin, 'cortex'), ['check', '--range', 'main..HEAD'], { cwd: root, encoding: 'utf-8', env: env() });

  it('The commit order table holds in real commits', () => {
    const commit = (name: string, run: (root: string) => void): void => {
      const root = table();
      try {
        run(root);
      } catch (e) {
        (e as Error).message = `${name}: ${(e as Error).message}`;
        throw e;
      }
    };
    commit('new behaviour', (r) => {
      expect(attempt(r, { [SPEC]: body(A + B + NEW) }).code).toBe(0);
      expect(attempt(r, { 'src/a.ts': '1', 'tests/c.test.ts': "it('[BILLING-REFUNDS-3] w', f);\n" }).code).toBe(0);
      expect(check(r).status).toBe(0);
    });
    commit('test first', (r) => {
      expect(attempt(r, { [SPEC]: body(A2 + B), 'tests/a.test.ts': T1(1) }, AMEND).code).toBe(0);
      expect(attempt(r, { 'src/a.ts': '1', 'tests/a.test.ts': T1(2) }).code).toBe(0);
    });
    commit('test first, one test only', (r) => {
      expect(attempt(r, { [SPEC]: body(A2 + B), 'tests/a.test.ts': T1(1) }, AMEND).code).toBe(0);
      const second = attempt(r, { 'src/a.ts': '1' });
      expect(second.code).not.toBe(0);
      expect(second.stderr).toContain('rule (a)');
    });
    commit('code first', (r) => {
      expect(attempt(r, { 'src/a.ts': '1', 'tests/a.test.ts': T1(1) }).code).toBe(0);
      const spec = attempt(r, { [SPEC]: body(A2 + B) }, AMEND);
      expect(spec.code).toBe(0);
      expect(spec.stderr).not.toContain('criterion text changed');
    });
    commit('spec first', (r) => {
      const spec = attempt(r, { [SPEC]: body(A2 + B) }, AMEND);
      expect(spec.code).toBe(0);
      expect(spec.stderr).toContain('criterion text changed with no tagged test changed yet');
      expect(attempt(r, { 'src/a.ts': '1', 'tests/a.test.ts': T1(1) }).code).toBe(0);
      expect(check(r).status).toBe(0);
    });
    commit('tagged test never changed', (r) => {
      expect(attempt(r, { [SPEC]: body(A2 + B) }, AMEND).stderr).toContain('no tagged test changed yet');
      expect(attempt(r, { 'src/a.ts': '1', 'tests/b.test.ts': T2(1) }).code).toBe(0);
      const range = check(r);
      expect(range.status).toBe(1);
      expect(range.stderr).toContain('rule (c)');
    });
    commit('everything at once', (r) => {
      const all = attempt(r, { [SPEC]: body(A2 + B), 'src/a.ts': '1', 'tests/a.test.ts': T1(1) }, AMEND);
      expect(all.code).not.toBe(0);
      expect(all.stderr).toContain('rule (d)');
    });
    commit('code only', (r) => {
      const only = attempt(r, { 'src/a.ts': '1' });
      expect(only.code).not.toBe(0);
      expect(only.stderr).toContain('rule (a)');
    });
    commit('install or turn a rule on', (r) => {
      const config = JSON.parse(fs.readFileSync(path.join(r, 'cortex/cortex.json'), 'utf-8'));
      config.specflow.rules.b = 'warn';
      expect(attempt(r, { 'cortex/cortex.json': JSON.stringify(config) }).code).toBe(0);
    });
    commit('amendment without a trailer', (r) => {
      const none = attempt(r, { [SPEC]: body(A2 + B) });
      expect(none.code).not.toBe(0);
      expect(none.stderr).toContain('rule (e)');
    });
    commit('reword Intent with code', (r) => {
      expect(attempt(r, { [SPEC]: body(A + B, ' More.'), 'src/a.ts': '1', 'tests/a.test.ts': T1(1) }).code).toBe(0);
    });
  }, 60_000);
});
