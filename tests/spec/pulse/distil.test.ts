/**
 * Spec-level tests — pulse.distil driven through the real CLI entry (`run` in
 * src/cli/cli.ts). Exercises the three entry modes as slices: the scheduled
 * skill's collect → (in-session judgment stand-in) → propose path, the bare
 * mode with a stub claude on PATH, and the degradation path with no binary —
 * ending with the proposal flowing through the pulse review gate. Sandboxed
 * tmp projects + fake homes; PATH is manipulated to control binary discovery
 * and always restored.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp, writeExecutable } from '../../fixtures/init-harness.js';
import { run } from '../../../src/cli/cli.js';

const TEST_TIMEOUT = 30_000;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`distil-spec-${label}`);
  dirs.push(d);
  return d;
}

let out: string[] = [];
let err: string[] = [];
let originalCwd: string;
let originalPath: string | undefined;
beforeEach(() => {
  originalCwd = process.cwd();
  originalPath = process.env['PATH'];
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
  if (originalPath !== undefined) process.env['PATH'] = originalPath;
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

function makeProject(label: string): string {
  const root = tmp(label);
  fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'compass'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.cortex', 'cortex.config.json'),
    JSON.stringify({ schemaVersion: '1.0', pulse: { distilThresholdN: 3 } }, null, 2),
    'utf-8',
  );
  fs.writeFileSync(path.join(root, '.cortex', 'compass', 'environment.md'), '# Environment\n', 'utf-8');
  return root;
}

const CANDIDATES = [
  {
    pattern: 'chrome profile is profile-X',
    occurrences: 4,
    sessionIds: ['sess-1'],
    proposedTarget: '.cortex/compass/environment.md',
    proposedText: 'Chrome profile: profile-X',
    confidence: 'high',
  },
];

describe('pulse.distil integrated slices (through cortex CLI run())', () => {
  it('skill path: --collect writes the corpus, --propose writes the §4.5 proposal, and the gate accepts it', async () => {
    const root = makeProject('skill-path');
    process.chdir(root);
    // Through the CLI, listSessions resolves ~/.claude/projects/<slug>/ for
    // this tmp root — nonexistent, so the corpus is empty (a read-only miss on
    // the real home; session-reading Rule 6). Windowed collection with an
    // injected home is covered by the atomic tests; the candidates below stand
    // in for the skill's in-session judgment.
    expect(await run(['pulse-distil', '--collect'])).toBe(0);
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', '.session-corpus.json'))).toBe(true);

    const scratch = path.join(tmp('scratch'), 'candidates.json');
    fs.writeFileSync(scratch, JSON.stringify(CANDIDATES), 'utf-8');
    expect(await run(['pulse-distil', '--propose', scratch])).toBe(0);

    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'suggestions.md'), 'utf-8');
    expect(report).toContain('kind: pulse-suggestions');
    expect(report).toContain('## S-001: chrome profile is profile-X');
    expect(report).toContain('**Source:** distil (sessions: sess-1)');
    expect(report).toContain('**Target:** .cortex/compass/environment.md');
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', '.distil-last-run'))).toBe(true);

    // End-to-end through the review gate: list shows it (id, title, source,
    // target, block — review-cli Rule 2), accept lands it.
    expect(await run(['pulse-list'])).toBe(0);
    expect(out.join('\n')).toContain('S-001');
    expect(out.join('\n')).toContain('Source: distil (sessions: sess-1)');
    expect(await run(['pulse-accept', 'S-001'])).toBe(0);
    const env = fs.readFileSync(path.join(root, '.cortex', 'compass', 'environment.md'), 'utf-8');
    expect(env.endsWith('Chrome profile: profile-X')).toBe(true);
  }, TEST_TIMEOUT);

  it('bare mode: collect → stub claude judgment on PATH → propose, exit 0', async () => {
    const root = makeProject('bare');
    process.chdir(root);
    const bin = tmp('bare-bin');
    writeExecutable(
      path.join(bin, 'claude'),
      `#!/bin/sh
cat <<'JSON'
${JSON.stringify(CANDIDATES)}
JSON
`,
    );
    process.env['PATH'] = `${bin}:${process.env['PATH'] ?? ''}`;
    expect(await run(['pulse-distil'])).toBe(0);
    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'suggestions.md'), 'utf-8');
    expect(report).toContain('## S-001: chrome profile is profile-X');
  }, TEST_TIMEOUT);

  it('bare mode with no claude on PATH degrades: exit 0, report states the skip, corpus retained', async () => {
    const root = makeProject('no-binary');
    process.chdir(root);
    process.env['PATH'] = tmp('empty-bin'); // no claude anywhere
    expect(await run(['pulse-distil'])).toBe(0);
    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'suggestions.md'), 'utf-8');
    expect(report).toMatch(/judgment pass skipped/i);
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', '.session-corpus.json'))).toBe(true);
  }, TEST_TIMEOUT);

  it('--collect with --propose is refused (exit 1); --propose without a path is refused', async () => {
    const root = makeProject('flags');
    process.chdir(root);
    expect(await run(['pulse-distil', '--collect', '--propose', 'x.json'])).toBe(1);
    expect(await run(['pulse-distil', '--propose'])).toBe(1);
    expect(err.join('\n')).toMatch(/--propose requires/);
  }, TEST_TIMEOUT);
});
