/**
 * Spec-level tests — `compass.bug-currency` as one integrated slice (plan
 * Task 2.4): an initialised project with a fake `.git` (file I/O only — Core
 * spawns no git, R-001), a thread promoted through the CLI entry
 * (`run(['thread', 'promote', …])`), the ledger validated through
 * `cortex validate --json`, and the currency surfaced by `cortex why` from a
 * recall index built over the ledger (`recall.recall-index` Rule 17,
 * `recall.why` Rule 4 — batch 1). Not a criteria replay: state accumulates
 * across the verbs and the cumulative filesystem is asserted.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { makeThread } from '../../fixtures/threads.js';
import { seedThreads, readThread } from '../../fixtures/thread-cli.js';
import { run } from '../../../src/cli/cli.js';
import { registerId, REGISTRY_FILE } from '../../../src/compass/registry.js';
import { readHeadCommit } from '../../../src/compass/git-head.js';
import { writeRecallIndex } from '../../../src/recall/index.js';
import { clearRecallIndexCache } from '../../../src/recall/query.js';
import type { ValidationReport, Violation } from '../../../src/schema/types.js';

const INIT_TIMEOUT = 90_000;
const SHA_MAIN = '2b217dfa9c3e4f5061728394a5b6c7d8e9f01234';
const dirs: string[] = [];
const originalCwd = process.cwd();
let home = '';
let logs: string[] = [];
let errors: string[] = [];

function tmp(label: string): string {
  const d = makeTmpDir(`bug-currency-spec-${label}`);
  dirs.push(d);
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
  return report.violations;
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
});

/** A fake `.git` whose HEAD resolves to `sha` through a symbolic ref. */
function fakeGit(root: string, sha: string): void {
  fs.mkdirSync(path.join(root, '.git', 'refs', 'heads'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf-8');
  fs.writeFileSync(path.join(root, '.git', 'refs', 'heads', 'main'), `${sha}\n`, 'utf-8');
}

function writeBugFile(root: string, id: string, slug: string, frontmatterLines: string[]): void {
  const dir = path.join(root, '.cortex', 'compass', 'bugs');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${id}-${slug}.md`),
    ['---', `id: ${id}`, `title: ${slug}`, 'type: wrong-rule', 'severity: high', ...frontmatterLines, 'affects:', '  - src/a.ts', '---', '', `# ${id} — ${slug}`, ''].join('\n'),
    'utf-8',
  );
  registerId(root, id, slug);
}

function bugFiles(root: string): string[] {
  return fs.readdirSync(path.join(root, '.cortex', 'compass', 'bugs')).filter((f) => /^B-\d{3,}-/.test(f)).sort();
}

describe('compass.bug-currency slice: promote stamps, validate checks shape, why surfaces the currency', () => {
  it(
    'a git checkout: the promoted draft carries found_at_commit, the registry issued its id; owner/fix_in_flight validate by shape; a malformed stamp is the only check.bug error; why lists the bug with its three fields',
    async () => {
      const root = tmp('git');
      expect(await cortex(root, ['init', '--no-llm', '--yes'])).toBe(0);
      fakeGit(root, SHA_MAIN);
      expect(readHeadCommit(root)).toBe('2b217df');
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n', 'utf-8');
      seedThreads(root, [makeThread({ id: 'T-010', kind: 'finding', bears_on: ['src/a.ts'], body: 'Layer drift in a\n**Kind:** conclusion\n**Source:** a session' })]);

      // Rule 5 — promote stamps the draft; Rule 12 (threads) — the id comes from the registry.
      clearCapture();
      expect(await cortex(root, ['thread', 'promote', 'T-010', '--to', 'compass/bugs', '--type', 'layer-drift', '--affects', 'src/a.ts'])).toBe(0);
      expect(bugFiles(root)).toEqual(['B-001-layer-drift-in-a.md']);
      const draftAbs = path.join(root, '.cortex', 'compass', 'bugs', 'B-001-layer-drift-in-a.md');
      const draft = matter(fs.readFileSync(draftAbs, 'utf-8'));
      expect(draft.data['found_at_commit']).toBe('2b217df');
      expect(draft.data['status']).toBe('open');
      expect(draft.data['owner']).toBeUndefined();
      expect(draft.data['fix_in_flight']).toBeUndefined();
      expect(fs.readFileSync(path.join(root, REGISTRY_FILE), 'utf-8').endsWith('\nB-001 layer-drift-in-a\n')).toBe(true);
      expect(readThread(root, 'T-010')?.resolved_by).toBe('.cortex/compass/bugs/B-001-layer-drift-in-a.md');

      // Rules 1–3 — a human triages it (owner + fix in flight); shape only is checked.
      const triaged = fs
        .readFileSync(draftAbs, 'utf-8')
        .replace('\nstatus: open\n', '\nstatus: triaged\nowner: pedro\nfix_in_flight: feature/registry\n');
      fs.writeFileSync(draftAbs, triaged, 'utf-8');
      writeBugFile(root, 'B-021', 'y', ['status: open', 'found_at_commit: 2b217dfz']);
      writeBugFile(root, 'B-022', 'z', ['status: triaged']);

      const violations = await validateJson(root);
      const bug = violations.filter((v) => v.check === 'check.bug');
      expect(bug).toHaveLength(1);
      expect(bug[0]?.severity).toBe('error');
      expect(bug[0]?.location.path.endsWith('B-021-y.md')).toBe(true);
      expect(bug[0]?.location.key).toBe('found_at_commit');
      expect(bug[0]?.message).toContain('found_at_commit');
      expect(violations.filter((v) => v.check === 'check.id-registry')).toEqual([]);

      // Rule 6 — the currency is read from the ledger by the recall index and printed by `cortex why`.
      await writeRecallIndex(root);
      clearRecallIndexCache();
      clearCapture();
      expect(await cortex(root, ['why', 'src/a.ts'])).toBe(0);
      const why = logs.join('\n');
      expect(why).toContain('Bugs:');
      expect(why).toMatch(/B-001\s+triaged/);
      expect(why).toContain('owner=pedro');
      expect(why).toContain('fix=feature/registry');
      expect(why).toContain('found_at=2b217df');
    },
    INIT_TIMEOUT,
  );

  it(
    'a non-git directory: the promoted draft has no found_at_commit key and validates clean',
    async () => {
      const root = tmp('no-git');
      expect(await cortex(root, ['init', '--no-llm', '--yes'])).toBe(0);
      expect(fs.existsSync(path.join(root, '.git'))).toBe(false);
      expect(readHeadCommit(root)).toBeNull();
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), '', 'utf-8');
      seedThreads(root, [makeThread({ id: 'T-010', kind: 'finding', bears_on: ['src/a.ts'], body: 'Layer drift in a\n**Kind:** conclusion\n**Source:** a session' })]);

      clearCapture();
      expect(await cortex(root, ['thread', 'promote', 'T-010', '--to', 'compass/bugs', '--type', 'layer-drift', '--affects', 'src/a.ts'])).toBe(0);
      const raw = fs.readFileSync(path.join(root, '.cortex', 'compass', 'bugs', 'B-001-layer-drift-in-a.md'), 'utf-8');
      expect(raw).not.toContain('found_at_commit');

      const violations = await validateJson(root);
      expect(violations.filter((v) => v.check === 'check.bug')).toEqual([]);
      expect(violations.filter((v) => v.check === 'check.id-registry')).toEqual([]);
    },
    INIT_TIMEOUT,
  );
});
