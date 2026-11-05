/**
 * Spec tests — core-cli.init Rule 19 (B-026). The bin must reach the dispatcher
 * through any chain of symlinks. Compiles the sources once into a cache folder
 * under node_modules, so the test does not depend on a stale dist/, then
 * executes the real files as child processes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = path.join(REPO, 'tests/fixtures/valid');
const BUILD_TIMEOUT = 120_000;

let out = '';
let tmp = '';

function exec(file: string, args: string[], input = ''): { code: number | null; stdout: string; stderr: string } {
  const r = spawnSync(file, args, { encoding: 'utf-8', input, cwd: tmp });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

beforeAll(() => {
  out = fs.mkdtempSync(path.join(REPO, 'node_modules', '.entry-test-'));
  execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json', '--outDir', out], { cwd: REPO });
  for (const f of ['cli/cli.js', 'hooks/cli.js', 'schema/cli.js']) fs.chmodSync(path.join(out, f), 0o755);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-entry-'));
  fs.symlinkSync(path.join(out, 'cli/cli.js'), path.join(tmp, 'cortex'));
}, BUILD_TIMEOUT);

afterAll(() => {
  fs.rmSync(out, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('core-cli.init Rule 19: the bin runs through symlinks', () => {
  it('[CORE-CLI-INIT-25] a symlinked bin runs a verb', () => {
    const r = exec(path.join(tmp, 'cortex'), ['validate', FIXTURE]);
    expect(r.stdout).toContain('Cortex Schema Validator');
    expect(r.code).toBe(0);
  });

  it('[CORE-CLI-INIT-26] a symlinked bare bin gets usage and exit 2', () => {
    const r = exec(path.join(tmp, 'cortex'), []);
    expect(r.stdout).toContain('Run `cortex init` to set up a project');
    expect(r.code).toBe(2);
  });

  it('[CORE-CLI-INIT-27] a chain of symlinks reaches the dispatcher', () => {
    fs.symlinkSync(path.join(tmp, 'cortex'), path.join(tmp, 'b'));
    fs.symlinkSync(path.join(tmp, 'b'), path.join(tmp, 'a'));
    const r = exec(path.join(tmp, 'a'), ['validate', FIXTURE]);
    expect(r.stdout).toContain('Cortex Schema Validator');
    expect(r.code).toBe(0);
  });

  it('[CORE-CLI-INIT-25] a path with a space reaches the dispatcher', () => {
    fs.mkdirSync(path.join(tmp, 'with space'));
    fs.symlinkSync(path.join(out, 'cli/cli.js'), path.join(tmp, 'with space', 'cortex'));
    expect(exec(path.join(tmp, 'with space', 'cortex'), ['validate', FIXTURE]).code).toBe(0);
  });

  it('[CORE-CLI-INIT-28] symlinked schema and hook entry points do their work', () => {
    fs.symlinkSync(path.join(out, 'schema/cli.js'), path.join(tmp, 'schema-cli'));
    fs.symlinkSync(path.join(out, 'hooks/cli.js'), path.join(tmp, 'hooks-cli'));
    // These two have no shebang: they are run as `node <file>`.
    const schema = exec(process.execPath, [path.join(tmp, 'schema-cli'), FIXTURE]);
    expect(schema.stdout).toContain('Cortex Schema Validator');
    const hook = exec(process.execPath, [path.join(tmp, 'hooks-cli'), 'session-start'], JSON.stringify({ cwd: FIXTURE }));
    expect(hook.code).toBe(0);
    expect(hook.stdout.length).toBeGreaterThan(0);
  });

  it('[CORE-CLI-INIT-30] a refusal survives a symlinked bin', () => {
    const repo = path.join(tmp, 'repo');
    fs.mkdirSync(path.join(repo, 'specflow'), { recursive: true });
    fs.mkdirSync(path.join(repo, 'src'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo });
    git('init', '-q', '-b', 'main');
    git('-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '-q', '--allow-empty', '-m', 'base');
    fs.writeFileSync(path.join(repo, 'src/a.ts'), 'x');
    git('add', '-A');
    const msg = path.join(tmp, 'msg');
    fs.writeFileSync(msg, 'm');
    const r = spawnSync(path.join(tmp, 'cortex'), ['check', '--commit-msg', msg], { encoding: 'utf-8', cwd: repo });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('rule (a)');
  });

  it('[CORE-CLI-INIT-54] output past a pipe buffer arrives whole', () => {
    const repo = path.join(tmp, 'big');
    fs.mkdirSync(path.join(repo, 'specflow/impl/a'), { recursive: true });
    const criteria = Array.from({ length: 3000 }, (_, i) => `### A-B-${i + 1}: A title long enough to fill a pipe\n\n- **Then** ok\n`).join('\n');
    fs.writeFileSync(path.join(repo, 'specflow/impl/a/b.spec.md'), `---\nid: a.b\nstatus: draft\n---\n\n## Acceptance Criteria\n\n${criteria}`);
    const r = spawnSync('sh', ['-c', `"${path.join(tmp, 'cortex')}" specs index --json | cat`], { encoding: 'utf-8', cwd: repo, maxBuffer: 64 * 1024 * 1024 });
    expect(r.stdout.length).toBeGreaterThan(200_000);
    expect(JSON.parse(r.stdout).counts.criteria).toBe(3000);
  });

  it('[CORE-CLI-INIT-29] importing the module does not run it', () => {
    const script = path.join(tmp, 'import.mjs');
    fs.writeFileSync(script, `await import(${JSON.stringify(path.join(out, 'cli/cli.js'))});\nconsole.log('imported');\n`);
    const r = spawnSync(process.execPath, [script], { encoding: 'utf-8', cwd: tmp });
    expect(r.stdout.trim()).toBe('imported');
    expect(r.status).toBe(0);
  });
});
