/**
 * Atomic tests — schema.id-registry Rule 3, `cortex id next rule|bug
 * [--slug <slug>]` through the real dispatcher (`run` in src/cli/cli.ts).
 * The verb allocates through `allocateId` and prints the id alone on stdout;
 * bad grammar is exit 2 with a usage line on stderr and nothing written; no
 * `.cortex/` is exit 1 naming `cortex init`. Each test chdirs into a temp
 * project carrying only a config and a registry.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import { run, USAGE_VERBS, usageText } from '../../../src/cli/cli.js';
import { REGISTRY_FILE, REGISTRY_HEADER } from '../../../src/compass/registry.js';

const dirs: string[] = [];
const originalCwd = process.cwd();
let cwd = '';
let logs: string[] = [];
let errors: string[] = [];

function tmp(label: string): string {
  const d = makeTmpDir(`id-next-${label}`);
  dirs.push(d);
  return d;
}

beforeEach(() => {
  cwd = tmp('cwd');
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
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** A project with a config and a registry listing R-001–R-003 and B-001–B-019. */
function initialisedProject(): string {
  fs.mkdirSync(path.join(cwd, '.cortex', 'compass'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.cortex', 'cortex.config.json'), JSON.stringify({ schemaVersion: '3.4' }), 'utf-8');
  const entries: string[] = [];
  for (let i = 1; i <= 3; i++) entries.push(`R-${String(i).padStart(3, '0')} rule-${i}`);
  for (let i = 1; i <= 19; i++) entries.push(`B-${String(i).padStart(3, '0')} bug-${i}`);
  const text = `${REGISTRY_HEADER}\n${entries.join('\n')}\n`;
  fs.writeFileSync(path.join(cwd, REGISTRY_FILE), text, 'utf-8');
  return text;
}

describe('AC: `cortex id next` prints the id and reserves it', () => {
  it('rule then bug --slug flaky-tier: stdout R-004 then B-020, exit 0 each, lines `R-004 reserved` and `B-020 flaky-tier`', async () => {
    initialisedProject();
    expect(await run(['id', 'next', 'rule'])).toBe(0);
    expect(logs).toEqual(['R-004']);
    logs = [];
    expect(await run(['id', 'next', 'bug', '--slug', 'flaky-tier'])).toBe(0);
    expect(logs).toEqual(['B-020']);
    expect(errors).toEqual([]);
    const text = fs.readFileSync(path.join(cwd, REGISTRY_FILE), 'utf-8');
    expect(text).toContain('\nR-004 reserved\nB-001 bug-1\n');
    expect(text.endsWith('B-019 bug-19\nB-020 flaky-tier\n')).toBe(true);
  });

  it('the id is the only thing on stdout, so a shell can capture it', async () => {
    initialisedProject();
    await run(['id', 'next', 'bug']);
    expect(logs.join('\n')).toBe('B-020');
  });
});

describe('AC: bad grammar is exit 2 and writes nothing', () => {
  it('`cortex id next`, `cortex id next thread` and `cortex id next rule --force` each exit 2 with a usage line on stderr; the registry is byte-identical', async () => {
    const before = initialisedProject();
    const snapshot = snapshotTree(cwd);
    for (const argv of [['id', 'next'], ['id', 'next', 'thread'], ['id', 'next', 'rule', '--force'], ['id'], ['id', 'prev', 'rule']]) {
      errors = [];
      logs = [];
      expect(await run(argv), argv.join(' ')).toBe(2);
      expect(errors.join('\n'), argv.join(' ')).toContain('cortex id next rule|bug [--slug <slug>]');
      expect(logs, argv.join(' ')).toEqual([]);
    }
    expect(fs.readFileSync(path.join(cwd, REGISTRY_FILE), 'utf-8')).toBe(before);
    expect(snapshotTree(cwd)).toEqual(snapshot);
  });

  it('`--slug` without a value is exit 2, nothing written', async () => {
    const before = initialisedProject();
    expect(await run(['id', 'next', 'bug', '--slug'])).toBe(2);
    expect(fs.readFileSync(path.join(cwd, REGISTRY_FILE), 'utf-8')).toBe(before);
  });
});

describe('Rule 3: no .cortex/ is exit 1 naming cortex init', () => {
  it('exits 1, names `cortex init` on stderr, and creates nothing in the cwd', async () => {
    expect(await run(['id', 'next', 'rule'])).toBe(1);
    expect(errors.join('\n')).toContain('cortex init');
    expect(fs.readdirSync(cwd)).toEqual([]);
  });
});

describe('Rule 3: the verb joins USAGE_TABLE', () => {
  it('USAGE_VERBS lists `id` right after `thread` and the usage text carries its synopsis', () => {
    expect(USAGE_VERBS[USAGE_VERBS.indexOf('thread') + 1]).toBe('id');
    expect(usageText()).toContain('cortex id next rule|bug [--slug <slug>]');
  });
});
