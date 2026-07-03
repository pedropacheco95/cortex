/**
 * Spec-level tests — anatomy.refresh-deep: the collect/judge/apply loop
 * driven through the real CLI entry (`run` in src/cli/cli.ts) for the skill's
 * --collect/--apply path, plus bare-mode subprocess semantics (core-cli.init
 * Rule 6: stub claude, no-binary/auth degradation) via the claudeBin seam.
 * One describe per spec AC, plus the shipped-SKILL.md and task-definition
 * pins. Sandboxed tmp projects; cwd restored.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { run } from '../../../src/cli/cli.js';
import { runRefreshDeep, PURPOSE_WORKLIST_FILE } from '../../../src/anatomy/refresh-deep.js';
import type { PurposeWorklist } from '../../../src/anatomy/refresh-deep.js';
import { computeSha256, computeTokens } from '../../../src/anatomy/files-md.js';
import { validate } from '../../../src/schema/validate.js';
import { SCHEDULED_TASKS } from '../../../src/cli/templates.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexSkeleton,
  readRows,
  row,
  filesMdPath,
  worklistPath,
  writeExecutable,
} from '../../fixtures/anatomy-harness.js';

const TEST_TIMEOUT = 30_000;
const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`deep-spec-${label}`);
  dirs.push(d);
  return d;
}

let out: string[] = [];
let err: string[] = [];
let originalCwd: string;
beforeEach(() => {
  originalCwd = process.cwd();
  out = [];
  err = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    out.push(a.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    err.push(a.join(' '));
  });
});
afterEach(() => {
  process.chdir(originalCwd);
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

const HEADER = '| path | purpose | tokens | sha256 | last_seen | spec_links | needs_purpose_refresh |';
const SEP = '|------|---------|--------|--------|-----------|------------|-----------------------|';

function makeFlaggedProject(label: string, files: { rel: string; content: string; flagged: boolean }[]): string {
  const root = tmp(label);
  makeCortexSkeleton(root);
  const rows: string[] = [];
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(root, f.rel)), { recursive: true });
    fs.writeFileSync(path.join(root, f.rel), f.content);
    rows.push(
      `| ${f.rel} | ${f.flagged ? '(needs purpose)' : 'Existing purpose.'} | ${computeTokens(f.content)} | ${computeSha256(f.content)} | 2026-06-30T14:00:00.000Z | - | ${f.flagged} |`,
    );
  }
  const anatomyDir = path.join(root, '.cortex', 'anatomy');
  fs.mkdirSync(anatomyDir, { recursive: true });
  fs.writeFileSync(
    path.join(anatomyDir, 'files.md'),
    `---\nkind: anatomy-files\nlast_full_scan: 2026-06-30T14:00:00.000Z\nfile_count: ${rows.length}\n---\n\n${[HEADER, SEP, ...rows].join('\n')}\n`,
  );
  return root;
}

function readWorklist(root: string): PurposeWorklist {
  return JSON.parse(fs.readFileSync(worklistPath(root), 'utf-8')) as PurposeWorklist;
}

describe('AC: collect batches flagged rows with excerpts', () => {
  it(
    '60 flagged rows → 3 batches of ≤25, each entry carrying path and a head excerpt',
    async () => {
      const root = makeFlaggedProject(
        'batches',
        Array.from({ length: 60 }, (_, i) => ({
          rel: `src/file${String(i).padStart(2, '0')}.ts`,
          content: `export const value${i} = ${i};\n`,
          flagged: true,
        })),
      );
      process.chdir(root);
      expect(await run(['loop-anatomy-refresh', '--deep', '--collect'])).toBe(0);
      const wl = readWorklist(root);
      expect(wl.batches.map((b) => b.length)).toEqual([25, 25, 10]);
      for (const batch of wl.batches) {
        for (const entry of batch) {
          expect(entry.path).toMatch(/^src\/file\d\d\.ts$/);
          expect(entry.excerpt).toContain('export const value');
          expect(typeof entry.tokens).toBe('number');
        }
      }
      expect(out.join('\n')).toContain(`60 flagged row(s) in 3 batch(es)`);
    },
    TEST_TIMEOUT,
  );
});

describe('AC: apply fills, clears, and stamps atomically', () => {
  it(
    'flagged row + valid result → purpose, flag false, fresh last_seen, unchanged sha256 in one coherent row; files.md still passes check.anatomy-files',
    async () => {
      const root = makeFlaggedProject('apply', [
        { rel: 'src/a.ts', content: 'export const a = 1;\n', flagged: true },
      ]);
      process.chdir(root);
      expect(await run(['loop-anatomy-refresh', '--deep', '--collect'])).toBe(0);
      const before = row(root, 'src/a.ts');

      const scratch = path.join(tmp('scratch'), 'results.json');
      fs.writeFileSync(scratch, JSON.stringify([{ path: 'src/a.ts', purpose: 'Owns the A concern.' }]));
      expect(await run(['loop-anatomy-refresh', '--deep', '--apply', scratch])).toBe(0);

      const after = row(root, 'src/a.ts');
      expect(after?.purpose).toBe('Owns the A concern.');
      expect(after?.flagged).toBe(false);
      expect(after?.lastSeen).not.toBe(before?.lastSeen);
      expect(after?.sha256).toBe(before?.sha256);
      expect(out.join('\n')).toContain('1 purpose(s) applied');

      const report = await validate(root, { root });
      expect(
        report.violations.filter((v) => v.check === 'check.anatomy-files' && v.severity === 'error'),
      ).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

describe('AC: mid-flight change keeps the flag', () => {
  it(
    'content (and row sha) changed after collect → row untouched, still flagged, counted as deferred',
    async () => {
      const root = makeFlaggedProject('midflight', [
        { rel: 'src/a.ts', content: 'export const a = 1;\n', flagged: true },
      ]);
      process.chdir(root);
      expect(await run(['loop-anatomy-refresh', '--deep', '--collect'])).toBe(0);

      // The file changes mid-flight and the fast tier re-stamps its row sha.
      const raw = fs.readFileSync(filesMdPath(root), 'utf-8');
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 999;\n');
      fs.writeFileSync(
        filesMdPath(root),
        raw.replace(computeSha256('export const a = 1;\n'), computeSha256('export const a = 999;\n')),
      );
      const snapshot = fs.readFileSync(filesMdPath(root), 'utf-8');

      const scratch = path.join(tmp('scratch-mf'), 'results.json');
      fs.writeFileSync(scratch, JSON.stringify([{ path: 'src/a.ts', purpose: 'Stale judgment.' }]));
      expect(await run(['loop-anatomy-refresh', '--deep', '--apply', scratch])).toBe(0);

      expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toBe(snapshot);
      expect(row(root, 'src/a.ts')?.flagged).toBe(true);
      expect(out.join('\n')).toContain('1 deferred');
    },
    TEST_TIMEOUT,
  );
});

describe('AC: invalid results skipped', () => {
  it(
    'empty purpose, multi-line purpose, and unknown path are all skipped and counted; the valid sibling is applied',
    async () => {
      const root = makeFlaggedProject('invalid', [
        { rel: 'src/a.ts', content: 'export const a = 1;\n', flagged: true },
        { rel: 'src/b.ts', content: 'export const b = 2;\n', flagged: true },
      ]);
      process.chdir(root);
      expect(await run(['loop-anatomy-refresh', '--deep', '--collect'])).toBe(0);

      const scratch = path.join(tmp('scratch-inv'), 'results.json');
      fs.writeFileSync(
        scratch,
        JSON.stringify([
          { path: 'src/a.ts', purpose: '' },
          { path: 'src/a.ts', purpose: 'line one\nline two' },
          { path: 'src/nowhere.ts', purpose: 'No such row.' },
          { path: 'src/b.ts', purpose: 'Valid sibling purpose.' },
        ]),
      );
      expect(await run(['loop-anatomy-refresh', '--deep', '--apply', scratch])).toBe(0);

      expect(out.join('\n')).toContain('3 skipped');
      expect(out.join('\n')).toContain('1 purpose(s) applied');
      expect(row(root, 'src/a.ts')?.flagged).toBe(true); // both invalid results for a.ts skipped
      expect(row(root, 'src/a.ts')?.purpose).toBe('(needs purpose)');
      expect(row(root, 'src/b.ts')?.purpose).toBe('Valid sibling purpose.');
      expect(row(root, 'src/b.ts')?.flagged).toBe(false);
    },
    TEST_TIMEOUT,
  );
});

describe('AC: nothing flagged → no subprocess', () => {
  it(
    'bare mode with zero flagged rows → exit 0, claude never invoked, a stated empty worklist',
    async () => {
      const root = makeFlaggedProject('clean', [
        { rel: 'src/a.ts', content: 'export const a = 1;\n', flagged: false },
      ]);
      const record = path.join(tmp('clean-record'), 'invocations.txt');
      const stub = writeExecutable(
        path.join(tmp('clean-bin'), 'claude'),
        `#!/bin/sh\necho "INVOKED" >> "${record}"\necho "[]"\n`,
      );
      const code = await runRefreshDeep(root, { claudeBin: stub });
      expect(code).toBe(0);
      expect(fs.existsSync(record)).toBe(false); // no subprocess spawned
      expect(readWorklist(root).batches).toEqual([]);
      expect(out.join('\n')).toContain('nothing flagged');
    },
    TEST_TIMEOUT,
  );
});

describe('AC: degradation preserves flags', () => {
  it(
    'no claude binary → exit 0 with notice; every flag intact for the scheduled skill run',
    async () => {
      const root = makeFlaggedProject('nobin', [
        { rel: 'src/a.ts', content: 'export const a = 1;\n', flagged: true },
        { rel: 'src/b.ts', content: 'export const b = 2;\n', flagged: true },
      ]);
      const code = await runRefreshDeep(root, { claudeBin: path.join(tmp('nobin-bin'), 'claude') });
      expect(code).toBe(0);
      expect(out.join('\n')).toContain('judgment pass skipped');
      expect(readRows(root).filter((r) => r.flagged)).toHaveLength(2);
      expect(fs.existsSync(worklistPath(root))).toBe(true); // retained for the skill run
    },
    TEST_TIMEOUT,
  );

  it(
    '--no-llm → exit 0, flags intact, worklist retained',
    async () => {
      const root = makeFlaggedProject('nollm', [
        { rel: 'src/a.ts', content: 'export const a = 1;\n', flagged: true },
      ]);
      process.chdir(root);
      expect(await run(['loop-anatomy-refresh', '--deep', '--no-llm'])).toBe(0);
      expect(out.join('\n')).toContain('--no-llm');
      expect(row(root, 'src/a.ts')?.flagged).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'auth failure → exit 3 named (core-cli.init Rule 6 semantics), flags intact',
    async () => {
      const root = makeFlaggedProject('auth', [
        { rel: 'src/a.ts', content: 'export const a = 1;\n', flagged: true },
      ]);
      const stub = writeExecutable(
        path.join(tmp('auth-bin'), 'claude'),
        `#!/bin/sh\necho "Error: not logged in. Please run /login to authenticate." >&2\nexit 1\n`,
      );
      const code = await runRefreshDeep(root, { claudeBin: stub });
      expect(code).toBe(3);
      expect(err.join('\n')).toContain('/login');
      expect(row(root, 'src/a.ts')?.flagged).toBe(true);
    },
    TEST_TIMEOUT,
  );
});

describe('bare mode happy path: collect → stub judgment → apply', () => {
  it(
    'stub claude emitting a results JSON array on stdout gets applied deterministically',
    async () => {
      const root = makeFlaggedProject('bare-ok', [
        { rel: 'src/a.ts', content: 'export const a = 1;\n', flagged: true },
      ]);
      const stub = writeExecutable(
        path.join(tmp('ok-bin'), 'claude'),
        `#!/bin/sh\necho '[{"path": "src/a.ts", "purpose": "Filled by the stub judgment."}]'\n`,
      );
      const code = await runRefreshDeep(root, { claudeBin: stub });
      expect(code).toBe(0);
      const after = row(root, 'src/a.ts');
      expect(after?.purpose).toBe('Filled by the stub judgment.');
      expect(after?.flagged).toBe(false);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
// shipped bundle + task definition pins (spec Rule 1 / governs skills/**)
// ===========================================================================

describe('shipped SKILL.md pins the collect → in-session judgment → apply shape', () => {
  const skillPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '..', '..', '..', 'skills', 'cortex-loop-anatomy-refresh', 'SKILL.md',
  );

  it('bundle exists and its body names both deterministic bookends and the results shape', () => {
    const body = fs.readFileSync(skillPath, 'utf-8');
    expect(body).toContain('name: cortex-loop-anatomy-refresh');
    expect(body).toContain('cortex loop-anatomy-refresh --deep --collect');
    expect(body).toContain('cortex loop-anatomy-refresh --deep --apply');
    expect(body).toContain(`.cortex/pulse/${PURPOSE_WORKLIST_FILE}`);
    expect(body).toContain('{"path": "<the entry\'s path>", "purpose": "<one line>"}');
    expect(body).toContain('in this');
    expect(body).toContain('never spawn');
    expect(body).toContain('needs_purpose_refresh');
  });

  it("the anatomy-refresh-deep task's requiredSkills names the shipped bundle", () => {
    const task = SCHEDULED_TASKS.find((t) => t.name === 'anatomy-refresh-deep');
    expect(task?.requiredSkills).toEqual(['cortex-loop-anatomy-refresh']);
    expect(task?.body).toContain('cortex-loop-anatomy-refresh');
  });
});
