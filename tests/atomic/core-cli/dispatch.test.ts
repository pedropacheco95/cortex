/**
 * Atomic tests — core-cli.init Rule 18, the invocation gate (B-018). One
 * `describe` per criterion, each calling the real dispatcher `run([...])`
 * inside a fresh temp cwd with `HOME` redirected (the withHomeEnv pattern from
 * sync.test.ts), asserting the exit code and that NOTHING was created in the
 * cwd or under `$HOME/.claude/`. Before the fix, `--help`, `nonsense` and a
 * bare `cortex` scaffolded the cwd and `insihgt file src/x.ts` scaffolded
 * `./file/`; `cortex init --timeout-ms 5 --profile specflow` initialised a
 * directory named `init`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { run, USAGE_VERBS } from '../../../src/cli/cli.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_SOURCE = path.resolve(HERE, '../../../src/cli/cli.ts');
const INIT_TIMEOUT = 60_000;

const dirs: string[] = [];
const originalCwd = process.cwd();
let cwd = '';
let home = '';
let logs: string[] = [];
let errors: string[] = [];

function tmp(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cortex-dispatch-${label}-`));
  dirs.push(dir);
  return dir;
}

async function withHomeEnv<T>(homeDir: string, fn: () => Promise<T>): Promise<T> {
  const original = process.env['HOME'];
  process.env['HOME'] = homeDir;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env['HOME'];
    else process.env['HOME'] = original;
  }
}

/** `cortex <argv…>` from inside the empty temp cwd with the temp home. */
function cortex(argv: string[]): Promise<number> {
  return withHomeEnv(home, () => run(argv));
}

function stdout(): string {
  return logs.join('\n');
}

function expectNothingWritten(): void {
  expect(fs.readdirSync(cwd)).toEqual([]);
  expect(fs.existsSync(path.join(home, '.claude'))).toBe(false);
}

beforeEach(() => {
  cwd = tmp('cwd');
  home = tmp('home');
  process.chdir(cwd);
  logs = [];
  errors = [];
  vi.spyOn(console, 'log').mockImplementation((msg: unknown) => {
    logs.push(String(msg));
  });
  vi.spyOn(console, 'error').mockImplementation((msg: unknown) => {
    errors.push(String(msg));
  });
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  while (dirs.length > 0) fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
});

const REQUIRED_VERBS = ['init', 'sync', 'validate', 'scan', 'insight', 'usage', 'thread', 'why', 'recall', 'hook'];

describe('core-cli.init Rule 18: `--help` prints usage and writes nothing', () => {
  it('cortex --help exits 2 with the verb list on stdout and creates nothing', async () => {
    const exitCode = await cortex(['--help']);
    expect(exitCode).toBe(2);
    for (const verb of REQUIRED_VERBS) expect(stdout()).toMatch(new RegExp(`\\b${verb}\\b`));
    expectNothingWritten();
  });

  it('cortex -h behaves identically', async () => {
    const exitCode = await cortex(['-h']);
    expect(exitCode).toBe(2);
    for (const verb of REQUIRED_VERBS) expect(stdout()).toMatch(new RegExp(`\\b${verb}\\b`));
    expectNothingWritten();
  });
});

describe('core-cli.init Rule 18: a mistyped verb in a directory without .cortex/ is refused, not initialised', () => {
  it('cortex nonsense exits 2, names the verb on the first line, writes nothing', async () => {
    const exitCode = await cortex(['nonsense']);
    expect(exitCode).toBe(2);
    expect(stdout().split('\n')[0]).toContain('nonsense');
    expect(fs.existsSync(path.join(cwd, '.cortex'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.claude', 'scheduled-tasks'))).toBe(false);
    expectNothingWritten();
  });

  it('cortex insihgt file src/x.ts exits 2, names insihgt, and never creates ./file/', async () => {
    const exitCode = await cortex(['insihgt', 'file', 'src/x.ts']);
    expect(exitCode).toBe(2);
    expect(stdout().split('\n')[0]).toContain('insihgt');
    expect(fs.existsSync(path.join(cwd, 'file'))).toBe(false);
    expect(fs.existsSync(path.join(cwd, '.cortex'))).toBe(false);
    expectNothingWritten();
  });

  it('--version and -v are unrecognised until a version verb is specified', async () => {
    expect(await cortex(['--version'])).toBe(2);
    expect(stdout().split('\n')[0]).toContain('--version');
    expectNothingWritten();
  });
});

describe('core-cli.init Rule 18: bare `cortex` prints usage and writes nothing', () => {
  it('no arguments → exit 2, usage on stdout, nothing on disk', async () => {
    const exitCode = await cortex([]);
    expect(exitCode).toBe(2);
    for (const verb of REQUIRED_VERBS) expect(stdout()).toMatch(new RegExp(`\\b${verb}\\b`));
    expect(stdout().split('\n')[0]).not.toMatch(/unrecognised/);
    expectNothingWritten();
  });
});

describe('core-cli.init Rule 18: the explicit verb still initialises, with the verb stripped', () => {
  it(
    'cortex init --no-llm initialises the cwd, never a directory named init',
    async () => {
      const exitCode = await cortex(['init', '--no-llm']);
      expect(exitCode).toBe(0);
      expect(fs.existsSync(path.join(cwd, '.cortex', 'cortex.config.json'))).toBe(true);
      expect(fs.existsSync(path.join(cwd, 'init'))).toBe(false);
    },
    INIT_TIMEOUT,
  );

  it(
    'cortex init --timeout-ms 5 --profile specflow --no-llm initialises the cwd, not ./init/',
    async () => {
      const exitCode = await cortex(['init', '--timeout-ms', '5', '--profile', 'specflow', '--no-llm']);
      expect(exitCode).toBe(0);
      expect(fs.existsSync(path.join(cwd, '.cortex', 'cortex.config.json'))).toBe(true);
      expect(fs.existsSync(path.join(cwd, 'init'))).toBe(false);
    },
    INIT_TIMEOUT,
  );
});

describe('core-cli.init Rule 18: the usage text and the file-header docblock share one verb list', () => {
  it('USAGE_VERBS names every verb the criteria require and the docblock lists exactly the same set', () => {
    for (const verb of REQUIRED_VERBS) expect(USAGE_VERBS).toContain(verb);
    const source = fs.readFileSync(CLI_SOURCE, 'utf-8');
    const docblock = source.slice(0, source.indexOf('*/'));
    const verbsLine = /\*\s+Verbs:\s*(.+)/.exec(docblock);
    expect(verbsLine?.[1]).toBeDefined();
    const listed = (verbsLine?.[1] ?? '').split(',').map((v) => v.trim()).filter((v) => v.length > 0);
    expect(listed).toEqual([...USAGE_VERBS]);
  });
});
