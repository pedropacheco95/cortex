/**
 * Spec-level tests — loops.skill-suggest driven through the real CLI entry
 * (`run` in src/cli/cli.ts): the skill's --propose path producing a §4.5
 * proposal in skill-suggestions.md, then the full journey through the pulse
 * review gate — discovery across pulse files and new-skill-only creation
 * (pulse.review-cli Rules 2 & 4). Sandboxed tmp projects; cwd restored.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { run } from '../../../src/cli/cli.js';

const TEST_TIMEOUT = 30_000;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`skill-suggest-spec-${label}`);
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

function makeProject(label: string): string {
  const root = tmp(label);
  fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'compass'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.cortex', 'cortex.config.json'),
    JSON.stringify({ schemaVersion: '1.0', pulse: { distilThresholdN: 3 } }, null, 2),
    'utf-8',
  );
  return root;
}

const DRAFT = '---\nname: deploy-preview\ndescription: Deploys a preview environment.\n---\n\n# deploy-preview\n\n1. Build the preview.\n2. Deploy it.\n';

const CANDIDATES = [
  { workflowName: 'deploy-preview', occurrences: 4, sessionIds: ['sess-1', 'sess-2'], draftSkillMd: DRAFT },
];

describe('loops.skill-suggest integrated slice (through cortex CLI run())', () => {
  it('--propose writes skill-suggestions.md; the gate lists it (cross-file discovery) and accept CREATES the new skill', async () => {
    const root = makeProject('journey');
    process.chdir(root);

    const scratch = path.join(tmp('scratch'), 'candidates.json');
    fs.writeFileSync(scratch, JSON.stringify(CANDIDATES), 'utf-8');
    expect(await run(['loop-skill-suggest', '--propose', scratch])).toBe(0);

    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'skill-suggestions.md'), 'utf-8');
    expect(report).toContain('kind: pulse-skill-suggestions');
    expect(report).toContain('## S-001: deploy-preview');
    expect(report).toContain('**Target:** .claude/skills/deploy-preview/SKILL.md');

    // Review gate discovers the section in skill-suggestions.md (not suggestions.md).
    expect(await run(['pulse-list'])).toBe(0);
    expect(out.join('\n')).toContain('S-001');
    expect(out.join('\n')).toContain('.claude/skills/deploy-preview/SKILL.md');

    // Accept creates the NEW skill file with the draft verbatim.
    expect(await run(['pulse-accept', 'S-001'])).toBe(0);
    const skillPath = path.join(root, '.claude', 'skills', 'deploy-preview', 'SKILL.md');
    expect(fs.existsSync(skillPath)).toBe(true);
    expect(fs.readFileSync(skillPath, 'utf-8')).toBe(DRAFT.replace(/\n+$/, ''));

    // Re-proposing the same workflow next cycle is now dedup-covered (Rule 3b).
    const scratch2 = path.join(tmp('scratch2'), 'candidates.json');
    fs.writeFileSync(scratch2, JSON.stringify(CANDIDATES), 'utf-8');
    expect(await run(['loop-skill-suggest', '--propose', scratch2])).toBe(0);
    const report2 = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'skill-suggestions.md'), 'utf-8');
    expect(report2).toContain('1 covered');
    expect(report2).toContain('No new workflow patterns this cycle.');
  }, TEST_TIMEOUT);

  it('rejecting a skill proposal records the workflow name in dismissed.md and the loop then suppresses it', async () => {
    const root = makeProject('reject');
    process.chdir(root);
    const scratch = path.join(tmp('scratch'), 'candidates.json');
    fs.writeFileSync(scratch, JSON.stringify(CANDIDATES), 'utf-8');
    expect(await run(['loop-skill-suggest', '--propose', scratch])).toBe(0);
    expect(await run(['pulse-reject', 'S-001'])).toBe(0);
    const dismissed = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'dismissed.md'), 'utf-8');
    expect(dismissed).toContain('## S-001: deploy-preview');

    // Next cycle: the same workflow is suppressed (rejection memory).
    const scratch2 = path.join(tmp('scratch2'), 'candidates.json');
    fs.writeFileSync(scratch2, JSON.stringify(CANDIDATES), 'utf-8');
    expect(await run(['loop-skill-suggest', '--propose', scratch2])).toBe(0);
    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'skill-suggestions.md'), 'utf-8');
    expect(report).toContain('1 dismissed (unexpired)');
    expect(report).not.toContain('## S-002: deploy-preview');
  }, TEST_TIMEOUT);

  it('flag misuse through the CLI is refused: --collect with --propose, and --propose without a path', async () => {
    const root = makeProject('flags');
    process.chdir(root);
    expect(await run(['loop-skill-suggest', '--collect', '--propose', 'x.json'])).toBe(1);
    expect(await run(['loop-skill-suggest', '--propose'])).toBe(1);
    expect(err.join('\n')).toMatch(/--propose requires/);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// B-003 regression — the full round-trip: a fenced draft proposed by the loop
// is created byte-exact by pulse-accept (writer fence > inner fence; parser
// honours the opening fence length).
// ---------------------------------------------------------------------------
describe('B-003 regression: fenced draft survives propose → accept byte-exact', () => {
  const FENCED_DRAFT = [
    '---',
    'name: fenced-deploy',
    'description: Deploys with a fenced example.',
    '---',
    '',
    '# fenced-deploy',
    '',
    '```bash',
    'deploy --preview',
    '```',
    '',
    'Then verify.',
  ].join('\n');

  it('accept creates the new skill with the draft byte-exact, inner fences included', async () => {
    const root = makeProject('b003-roundtrip');
    process.chdir(root);
    const scratch = path.join(tmp('b003-scratch'), 'candidates.json');
    fs.writeFileSync(
      scratch,
      JSON.stringify([{ workflowName: 'fenced-deploy', occurrences: 4, sessionIds: ['s1'], draftSkillMd: FENCED_DRAFT }]),
      'utf-8',
    );
    expect(await run(['loop-skill-suggest', '--propose', scratch])).toBe(0);
    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'skill-suggestions.md'), 'utf-8');
    expect(report).toContain('````'); // longer outer fence chosen by the writer

    expect(await run(['pulse-accept', 'S-001'])).toBe(0);
    const created = fs.readFileSync(path.join(root, '.claude', 'skills', 'fenced-deploy', 'SKILL.md'), 'utf-8');
    expect(created).toBe(FENCED_DRAFT);
  }, TEST_TIMEOUT);
});
