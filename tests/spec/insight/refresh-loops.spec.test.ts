/**
 * Spec-level tests — insight.refresh-loops (schema §4.10, §9.1; design §5.9,
 * §9). The three-tier round-trip over a real git fixture: fast flags (no LLM,
 * ledger untouched) → daily collect/apply reconciles and neighbourhood-updates
 * → full collect/report blesses ground truth. Plus the CLI dispatch, the
 * scheduled-task registration AC, and the loop-write invariant (every write
 * under .cortex/insight/ + the pulse artefacts; nothing gated, no proposal).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  makeTmpDir,
  cleanTmp,
  gitInit,
  gitCommitAll,
  headShort,
  writeConfig,
  writeEntry,
  writeLedgerFor,
  writeGraphFor,
  writeReverseIndexFor,
  makeEdge,
} from '../../fixtures/insight-refresh-harness.js';
import { run } from '../../../src/cli/cli.js';
import { readLedger, readWorklist, INSIGHT_WORKLIST_FILE } from '../../../src/insight/refresh-fast.js';
import { readDailyWorklist, DAILY_WORKLIST_FILE, INSIGHT_REFRESH_REPORT_FILE } from '../../../src/insight/refresh-daily.js';
import { readFullWorklist, FULL_WORKLIST_FILE } from '../../../src/insight/refresh-full.js';
import { SCHEDULED_TASKS } from '../../../src/cli/templates.js';
import { CANONICAL_TASK_NAMES, RETIRED_CANONICAL_TASK_NAMES } from '../../../src/cli/task-scoping.js';
import type { LedgerFile } from '../../../src/insight/storage.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`insight-loops-${label}`);
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
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void err.push(a.join(' ')));
});
afterEach(() => {
  process.chdir(originalCwd);
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

/** One-scope-free (flat) extracted project on a real git repo. */
function makeProject(label: string): { root: string; baseline: string } {
  const root = tmp(label);
  gitInit(root);
  writeConfig(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export function a() {\n  return 1;\n}\n', 'utf-8');
  gitCommitAll(root, 'baseline');
  const baseline = headShort(root);
  writeLedgerFor(root, [{ path: 'src/a.ts', level: 3 }], baseline);
  writeGraphFor(
    root,
    [
      { id: 'file:src/a.ts', kind: 'file', label: 'a.ts' },
      { id: 'concept:alpha', kind: 'concept', label: 'Alpha' },
    ],
    [makeEdge('file:src/a.ts', 'concept:alpha', 'implements-concept', 'stated', baseline)],
    baseline,
  );
  writeReverseIndexFor(root, {
    'file:src/a.ts': ['concept:alpha', 'edge:implements-concept:file:src/a.ts->concept:alpha'],
  }, baseline);
  writeEntry(root, 'src/a.ts', 3, baseline);
  return { root, baseline };
}

/** Snapshot of every file path under a directory (for write-set assertions). */
function walk(dir: string, out2: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out2;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out2);
    else out2.push(p);
  }
  return out2;
}

describe('AC: three-tier round-trip — fast flags, daily reconciles, full blesses', () => {
  it('runs the full cycle through the CLI verbs against a real git fixture', async () => {
    const { root, baseline } = makeProject('roundtrip');
    process.chdir(root);

    // 1. A significant commit.
    fs.writeFileSync(
      path.join(root, 'src', 'a.ts'),
      'export function a() {\n  return 1;\n}\nexport function extra() {\n  return 7;\n}\n',
      'utf-8',
    );
    gitCommitAll(root, 'new export');

    // 2. Fast tier via the exact hook string's CLI branch: flags, no ledger touch.
    const ledgerBefore = fs.readFileSync(path.join(root, '.cortex', 'insight', 'ledger.json'), 'utf-8');
    expect(await run(['insight-refresh-fast'])).toBe(0);
    expect(readWorklist(root).map((f) => f.path)).toEqual(['src/a.ts']);
    expect(fs.readFileSync(path.join(root, '.cortex', 'insight', 'ledger.json'), 'utf-8')).toBe(ledgerBefore);

    // 3. Daily collect: the significant change is L3-due.
    expect(await run(['loop-insight-refresh', '--daily', '--collect'])).toBe(0);
    const daily = readDailyWorklist(root);
    expect(daily?.l3.map((e) => e.path)).toEqual(['src/a.ts']);

    // 4. The skill's re-extraction (simulated), then daily apply.
    writeEntry(root, 'src/a.ts', 3, headShort(root));
    expect(await run(['loop-insight-refresh', '--daily', '--apply'])).toBe(0);
    const ledger = readLedger(root) as LedgerFile;
    expect(ledger.entries['src/a.ts']?.built_at_commit).toBe(headShort(root));
    expect(readWorklist(root)).toEqual([]);
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', INSIGHT_REFRESH_REPORT_FILE))).toBe(true);
    // Reverse-dependency invalidation reached the referencing concept + edge.
    expect(ledger.stale).toContain('concept:alpha');

    // 5. Full collect → (regen simulated as already-valid store) → report blesses.
    expect(await run(['loop-insight-refresh', '--full', '--collect'])).toBe(0);
    const full = readFullWorklist(root);
    expect(full?.files.map((f) => f.path)).toEqual(['src/a.ts']);
    expect(await run(['loop-insight-refresh', '--full', '--report'])).toBe(0);
    const blessed = readLedger(root) as LedgerFile;
    expect(blessed.built_at_commit).toBe(headShort(root));
    expect(blessed.stale).toEqual([]); // ground truth clears the stale set
    expect(headShort(root)).not.toBe(baseline);

    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', INSIGHT_REFRESH_REPORT_FILE), 'utf-8');
    expect(report).toContain('kind: insight-refresh');
    expect(report).toContain('loop: cortex-loop-insight-refresh-full');
  });
});

describe('AC: loop-write invariant — every write under .cortex/insight/ + pulse artefacts (RULES 7)', () => {
  it('a full daily cycle writes nothing gated and emits no proposal', async () => {
    const { root } = makeProject('invariant');
    process.chdir(root);
    // Gated fixtures to watch.
    fs.mkdirSync(path.join(root, '.cortex', 'compass', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'compass', 'rules', 'R-001-fixture.md'), 'rule\n', 'utf-8');
    fs.mkdirSync(path.join(root, '.cortex', 'atlas'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'atlas', 'note.md'), 'atlas\n', 'utf-8');
    fs.writeFileSync(path.join(root, 'RULES.md'), 'rules\n', 'utf-8');
    const before = new Map(
      walk(path.join(root, '.cortex', 'compass'))
        .concat(walk(path.join(root, '.cortex', 'atlas')))
        .concat([path.join(root, 'RULES.md')])
        .map((p) => [p, fs.readFileSync(p, 'utf-8')]),
    );

    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export function a() {\n  return 2;\n}\n', 'utf-8');
    gitCommitAll(root, 'change');
    await run(['insight-refresh-fast']);
    await run(['loop-insight-refresh', '--daily', '--collect']);
    writeEntry(root, 'src/a.ts', 3, headShort(root));
    await run(['loop-insight-refresh', '--daily', '--apply']);

    for (const [p, content] of before) {
      expect(fs.readFileSync(p, 'utf-8'), p).toBe(content);
    }
    // Pulse artefacts are the worklists + the report only — no proposal file.
    const pulseFiles = fs.readdirSync(path.join(root, '.cortex', 'pulse')).sort();
    expect(pulseFiles).toEqual([INSIGHT_WORKLIST_FILE, DAILY_WORKLIST_FILE, INSIGHT_REFRESH_REPORT_FILE].sort());
    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', INSIGHT_REFRESH_REPORT_FILE), 'utf-8');
    expect(report).not.toContain('**Target:**'); // no proposal sections
  });
});

describe('AC: CLI dispatch — tiers required, v2 verbs retired', () => {
  it('tierless loop-insight-refresh is refused with the retirement pointer', async () => {
    expect(await run(['loop-insight-refresh', '--collect'])).toBe(1);
    expect(err.join('\n')).toContain('exactly one of --fast, --daily, or --full');
  });

  it('loop-insight-gaps is retired with a pointer to cortex-loop-session-observe', async () => {
    expect(await run(['loop-insight-gaps', '--collect'])).toBe(1);
    expect(err.join('\n')).toContain('cortex-loop-session-observe');
  });

  it('--fast dispatches identically to insight-refresh-fast (exit 0, hook-safe, even on a bare dir)', async () => {
    const root = tmp('bare');
    process.chdir(root);
    expect(await run(['loop-insight-refresh', '--fast'])).toBe(0);
  });

  it('daily collect without an extraction fails loudly (never bootstraps)', async () => {
    const root = tmp('noledger');
    gitInit(root);
    writeConfig(root);
    process.chdir(root);
    expect(await run(['loop-insight-refresh', '--daily', '--collect'])).toBe(1);
    expect(err.join('\n')).toContain('ledger');
  });

  it('full report without a prior collect fails loudly', async () => {
    const { root } = makeProject('no-collect');
    process.chdir(root);
    expect(await run(['loop-insight-refresh', '--full', '--report'])).toBe(1);
    expect(err.join('\n')).toContain(FULL_WORKLIST_FILE);
  });
});

describe('AC: scheduled-task registration matches the fast/daily/full split (spec AC 10)', () => {
  it('daily + full register as scheduled tasks; fast does not; the v2 pair is deregistered', () => {
    const names = SCHEDULED_TASKS.map((t) => t.name);
    expect(names).toContain('insight-refresh-daily');
    expect(names).toContain('insight-refresh-full');
    expect(names).not.toContain('insight-refresh');
    expect(names).not.toContain('insight-gaps');
    expect(names).not.toContain('insight-refresh-fast'); // the git hook, not a task
    expect(SCHEDULED_TASKS).toHaveLength(15); // +1 vs v2: session-observe registered at step 6 (anatomy-refresh-deep deregisters at step 7)

    const canonicals = Object.values(CANONICAL_TASK_NAMES);
    expect(canonicals).toContain('cortex-loop-insight-refresh-daily');
    expect(canonicals).toContain('cortex-loop-insight-refresh-full');
    expect(canonicals).not.toContain('cortex-loop-insight-refresh');
    expect(canonicals).not.toContain('cortex-loop-insight-gaps');
    expect(canonicals).not.toContain('cortex-loop-insight-refresh-fast');
    expect(RETIRED_CANONICAL_TASK_NAMES).toEqual(['cortex-loop-insight-refresh', 'cortex-loop-insight-gaps']);
  });

  it('the daily and full task prompts invoke their skills and cortex-extract-insight by name', () => {
    for (const name of ['insight-refresh-daily', 'insight-refresh-full']) {
      const task = SCHEDULED_TASKS.find((t) => t.name === name);
      expect(task).toBeDefined();
      for (const skill of task?.requiredSkills ?? []) {
        expect(task?.body, `${name} body names ${skill}`).toContain(skill);
      }
      expect(task?.requiredSkills).toContain('cortex-extract-insight');
    }
  });
});
