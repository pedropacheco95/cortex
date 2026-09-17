/**
 * Spec-level slice — schema.id-registry driven end to end through the real
 * CLI entry (`run` in src/cli/cli.ts): `cortex init --no-llm --yes` scaffolds
 * the header-only registry, `cortex id next` allocates and reserves, planted
 * files and hand-edited registries surface through `cortex validate --json`,
 * and `cortex sync` creates the registry once from disk and never rewrites
 * it. "Promote allocates through the registry" is batch 2's (thread promote)
 * and is not driven here. Temp projects only; HOME is redirected so the
 * scheduled-task steps of init/sync never touch the real ~/.claude.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { makeTmpFixture, cleanup, writeRule, writeBug, rulesDir, bugsDir } from '../../fixtures/validator-tmp.js';
import { run } from '../../../src/cli/cli.js';
import { REGISTRY_FILE, REGISTRY_HEADER } from '../../../src/compass/registry.js';
import type { ValidationReport, Violation } from '../../../src/schema/types.js';

const INIT_TIMEOUT = 90_000;
const dirs: string[] = [];
const fixtures: string[] = [];
const originalCwd = process.cwd();
let home = '';
let logs: string[] = [];
let errors: string[] = [];

function tmp(label: string): string {
  const d = makeTmpDir(`id-registry-spec-${label}`);
  dirs.push(d);
  return d;
}

function fixture(label: string): string {
  const d = makeTmpFixture(`id-registry-${label}`);
  fixtures.push(d);
  return d;
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

/** `cortex <argv…>` from inside `root` with the temp home. */
async function cortex(root: string, argv: string[]): Promise<number> {
  process.chdir(root);
  try {
    return await withHomeEnv(home, () => run(argv));
  } finally {
    process.chdir(originalCwd);
  }
}

function clearCapture(): void {
  logs = [];
  errors = [];
}

async function validateJson(root: string): Promise<Violation[]> {
  clearCapture();
  await cortex(root, ['validate', '--json']);
  const report = JSON.parse(logs.join('\n')) as ValidationReport;
  return report.violations.filter((v) => v.check === 'check.id-registry');
}

beforeEach(() => {
  home = tmp('home');
  clearCapture();
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
  while (fixtures.length > 0) cleanup(fixtures.pop() as string);
});

function registryAbs(root: string): string {
  return path.join(root, REGISTRY_FILE);
}

function writeRegistry(root: string, entries: string[]): void {
  fs.mkdirSync(path.dirname(registryAbs(root)), { recursive: true });
  fs.writeFileSync(registryAbs(root), `${REGISTRY_HEADER}\n${entries.join('\n')}\n`, 'utf-8');
}

function pad(n: number): string {
  return String(n).padStart(3, '0');
}

/**
 * Three rules and nineteen bugs that are individually valid under check.rule
 * and check.bug in an initialised project: the rules cite one atlas decision
 * planted here; the bugs affect a source file planted here.
 */
function plantThreeRulesNineteenBugs(root: string): void {
  const decisionsDir = path.join(root, '.cortex', 'atlas', 'decisions');
  fs.mkdirSync(decisionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(decisionsDir, '2026-09-01-registry.md'),
    '---\nid: decision.2026-09-01-registry\ntitle: Ids come from the registry\ndate: 2026-09-01T00:00:00Z\n---\n\n# Ids come from the registry\n\nOn 2026-09-01 we chose the registry.\n',
    'utf-8',
  );
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n', 'utf-8');
  fs.mkdirSync(rulesDir(root), { recursive: true });
  fs.mkdirSync(bugsDir(root), { recursive: true });
  for (let i = 1; i <= 3; i++) {
    const id = `R-${pad(i)}`;
    fs.writeFileSync(
      path.join(rulesDir(root), `${id}-rule-${i}.md`),
      `---\nid: ${id}\ntitle: Rule ${i}\nsource:\n  - ../../atlas/decisions/2026-09-01-registry.md\ngoverns:\n  - "src/**/*.ts"\n---\n\n# ${id} — Rule ${i}\n\nBody.\n`,
      'utf-8',
    );
  }
  for (let i = 1; i <= 19; i++) {
    const id = `B-${pad(i)}`;
    fs.writeFileSync(
      path.join(bugsDir(root), `${id}-bug-${i}.md`),
      `---\nid: ${id}\ntitle: Bug ${i}\ntype: incomplete-rule\nseverity: low\nstatus: open\naffects:\n  - src/a.ts\n---\n\n# ${id} — Bug ${i}\n\nBody.\n`,
      'utf-8',
    );
  }
}

function expectedLines(): string[] {
  const lines: string[] = [];
  for (let i = 1; i <= 3; i++) lines.push(`R-${pad(i)} rule-${i}`);
  for (let i = 1; i <= 19; i++) lines.push(`B-${pad(i)} bug-${i}`);
  return lines;
}

describe('schema.id-registry slice: init scaffolds, id next allocates, sync migrates once', () => {
  it(
    'cortex init writes the header-only registry; cortex id next rule then bug --slug flaky-tier print R-004 and B-020 and reserve them',
    async () => {
      const root = tmp('proj');
      expect(await cortex(root, ['init', '--no-llm', '--yes'])).toBe(0);
      expect(fs.readFileSync(registryAbs(root), 'utf-8')).toBe(`${REGISTRY_HEADER}\n`);

      // "An initialised project" with the ids this repo carries today.
      writeRegistry(root, expectedLines());
      clearCapture();
      expect(await cortex(root, ['id', 'next', 'rule'])).toBe(0);
      expect(logs).toEqual(['R-004']);
      clearCapture();
      expect(await cortex(root, ['id', 'next', 'bug', '--slug', 'flaky-tier'])).toBe(0);
      expect(logs).toEqual(['B-020']);
      const text = fs.readFileSync(registryAbs(root), 'utf-8');
      expect(text).toContain('\nR-003 rule-3\nR-004 reserved\nB-001 bug-1\n');
      expect(text.endsWith('\nB-020 flaky-tier\n')).toBe(true);

      // Bad grammar: exit 2, usage on stderr, registry byte-identical.
      for (const argv of [['id', 'next'], ['id', 'next', 'thread'], ['id', 'next', 'rule', '--force']]) {
        clearCapture();
        expect(await cortex(root, argv), argv.join(' ')).toBe(2);
        expect(errors.join('\n')).toContain('cortex id next rule|bug');
      }
      expect(fs.readFileSync(registryAbs(root), 'utf-8')).toBe(text);
    },
    INIT_TIMEOUT,
  );

  it(
    'cortex sync on a project with three rules, nineteen bugs and no registry creates it once (summary names it); a second sync leaves it byte-identical and reports it present',
    async () => {
      const root = tmp('sync');
      expect(await cortex(root, ['init', '--no-llm', '--yes'])).toBe(0);
      plantThreeRulesNineteenBugs(root);
      fs.rmSync(registryAbs(root));

      clearCapture();
      const first = await cortex(root, ['sync', '--yes']);
      const firstOut = logs.join('\n');
      expect(firstOut).toContain('registry created (3 rules, 19 bugs)');
      const created = fs.readFileSync(registryAbs(root), 'utf-8');
      expect(created).toBe(`${REGISTRY_HEADER}\n${expectedLines().join('\n')}\n`);
      // The planted files validate clean once registered — sync's self-validation passes.
      expect(first, firstOut).toBe(0);
      expect(await validateJson(root)).toEqual([]);

      clearCapture();
      expect(await cortex(root, ['sync', '--yes'])).toBe(0);
      expect(logs.join('\n')).toContain('registry present');
      expect(fs.readFileSync(registryAbs(root), 'utf-8')).toBe(created);
    },
    INIT_TIMEOUT,
  );
});

describe('schema.id-registry slice: cortex validate surfaces the registry findings', () => {
  it('a file missing from the registry is one error naming the file and cortex id next bug', async () => {
    const root = fixture('missing');
    writeRegistry(root, ['R-001 sample-rule']);
    writeBug(root, 'B-019-x.md', 'B-019', { register: false });
    const out = await validateJson(root);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe('error');
    // The CLI resolves `.` through process.cwd(), which on macOS is the realpath (/private/var/…).
    expect(out[0]!.location.path.endsWith(path.join('.cortex', 'compass', 'bugs', 'B-019-x.md'))).toBe(true);
    expect(out[0]!.message).toContain('cortex id next bug');
  });

  it('a registered id without a file is one warning naming R-009 and zero errors from the check', async () => {
    const root = fixture('reserved');
    writeRegistry(root, ['R-001 sample-rule', 'R-009 reserved']);
    const out = await validateJson(root);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe('warning');
    expect(out[0]!.message).toContain('R-009');
  });

  it('duplicate and malformed lines are two errors: one naming both line numbers of B-004, one naming the malformed line', async () => {
    const root = fixture('dup');
    writeRegistry(root, ['R-05 short', 'R-001 sample-rule', 'B-004 a', 'B-004 a']);
    writeBug(root, 'B-004-a.md', 'B-004');
    const out = await validateJson(root);
    const errs = out.filter((v) => v.severity === 'error');
    expect(errs).toHaveLength(2);
    const base = REGISTRY_HEADER.split('\n').length;
    const dup = errs.find((v) => v.message.includes('B-004'))!;
    expect(dup.message).toContain(String(base + 3));
    expect(dup.message).toContain(String(base + 4));
    const malformed = errs.find((v) => v.message.includes('R-05 short'))!;
    expect(malformed.location.line).toBe(base + 1);
  });

  it('an absent registry warns naming cortex sync when rule files exist, and is silent on a project with no rules, no bugs and no registry', async () => {
    const withRules = fixture('absent-rules');
    fs.rmSync(registryAbs(withRules), { force: true });
    writeRule(withRules, 'R-002-second.md', 'R-002', { register: false });
    const out = await validateJson(withRules);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe('warning');
    expect(out[0]!.message).toContain('cortex sync');

    const fresh = tmp('fresh');
    expect(await cortex(fresh, ['init', '--no-llm', '--yes'])).toBe(0);
    fs.rmSync(registryAbs(fresh));
    expect(await validateJson(fresh)).toEqual([]);
  }, INIT_TIMEOUT);
});
