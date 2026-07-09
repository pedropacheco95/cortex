/**
 * Spec-level test — pulse.review-cli driven through the real CLI entry
 * (`run` in src/cli/cli.ts), which dispatches to pulseCli. Because pulseCli
 * defaults its root to '.', the test process.chdir()s into a tmp project for
 * the duration of each run and restores cwd afterward. Exercises the whole
 * gate as one slice: list → accept → list → reject → list, with a full-tree
 * snapshot proving accept touched only the target file and suggestions.md.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import { run } from '../../../src/cli/cli.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`pulse-spec-${label}`);
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
const stdout = (): string => out.join('\n');

function clearCapture(): void {
  out = [];
  err = [];
}

const SUGGESTIONS = `---
kind: pulse-suggestions
generated: 2026-07-01T00:00:00Z
loop: cortex-pulse-distil
---

# Suggestions

## S-001: Chrome profile

**Target:** .cortex/compass/environment.md

**Proposed addition:**

\`\`\`
Chrome profile: profile-X
\`\`\`

## S-002: Second suggestion

**Target:** .cortex/compass/preferences.md

**Proposed addition:**

\`\`\`
Prefer pnpm over npm.
\`\`\`
`;

function makeProject(label: string): string {
  const root = tmp(label);
  const pulseDir = path.join(root, '.cortex', 'pulse');
  fs.mkdirSync(pulseDir, { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'compass'), { recursive: true });
  fs.writeFileSync(path.join(pulseDir, 'suggestions.md'), SUGGESTIONS, 'utf-8');
  fs.writeFileSync(
    path.join(root, '.cortex', 'cortex.config.json'),
    JSON.stringify({ schemaVersion: '1.0', pulse: { dismissedWindowDays: 90 } }, null, 2),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(root, '.cortex', 'compass', 'environment.md'),
    '# Environment\n\nOperational pointers only.\n',
    'utf-8',
  );
  return root;
}

describe('pulse.review-cli integrated slice (through cortex CLI run())', () => {
  it('lists, accepts one (touching only its target + suggestions.md), then rejects the other', async () => {
    const root = makeProject('flow');
    process.chdir(root);

    // 1. list — both pending.
    expect(await run(['pulse-list'])).toBe(0);
    expect(stdout()).toContain('S-001');
    expect(stdout()).toContain('S-002');

    // 2. accept S-001 — verbatim append, only two files may change.
    clearCapture();
    const before = snapshotTree(root);
    expect(await run(['pulse-accept', 'S-001'])).toBe(0);

    const env = fs.readFileSync(
      path.join(root, '.cortex', 'compass', 'environment.md'),
      'utf-8',
    );
    expect(env.endsWith('Chrome profile: profile-X')).toBe(true);
    expect(env).toContain('Operational pointers only.\n\nChrome profile: profile-X');

    const after = snapshotTree(root);
    const allowed = new Set([
      path.join('.cortex', 'compass', 'environment.md'),
      path.join('.cortex', 'pulse', 'suggestions.md'),
    ]);
    const keys = new Set([...before.keys(), ...after.keys()]);
    for (const key of keys) {
      if (allowed.has(key)) continue;
      expect(after.get(key)).toBe(before.get(key));
    }

    // 3. list — S-001 now hidden (accepted), S-002 still pending.
    clearCapture();
    expect(await run(['pulse-list'])).toBe(0);
    expect(stdout()).not.toContain('S-001');
    expect(stdout()).toContain('S-002');

    // 4. reject S-002 — records the dismissal window.
    clearCapture();
    expect(await run(['pulse-reject', 'S-002'])).toBe(0);
    const dismissed = fs.readFileSync(
      path.join(root, '.cortex', 'pulse', 'dismissed.md'),
      'utf-8',
    );
    expect(dismissed).toContain('## S-002');
    expect(dismissed).toContain('**Expires:**');

    // 5. list — both decided now → nothing pending.
    clearCapture();
    expect(await run(['pulse-list'])).toBe(0);
    expect(stdout()).not.toContain('S-001');
    expect(stdout()).not.toContain('S-002');
    expect(stdout().toLowerCase()).toContain('nothing pending');
  });

  it('B-003 regression, distil skill-proposal lens: a fenced draft survives propose → accept byte-exact into a NEW skill', async () => {
    const root = makeProject('skill-lens-accept');
    process.chdir(root);

    // Distil's propose half writes the skill-proposal section (the folded-in
    // workflow-mining lens) — the draft carries inner triple-backtick fences.
    const { proposeFromCandidates } = await import('../../../src/pulse/distil.js');
    const draft = '---\nname: release-notes\ndescription: assemble the weekly notes\n---\n\nSteps:\n\n```bash\npnpm build\npnpm test\n```\n';
    fs.rmSync(path.join(root, '.cortex', 'pulse', 'suggestions.md')); // replace the fixture file
    proposeFromCandidates(root, [
      {
        type: 'skill-proposal',
        pattern: 'weekly release-notes assembly workflow',
        occurrences: 3,
        sessionIds: ['s1', 's2'],
        proposedTarget: '.claude/skills/release-notes/SKILL.md',
        proposedText: draft,
        confidence: 'high',
      },
    ]);
    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'suggestions.md'), 'utf-8');
    expect(report).toContain('````'); // longer outer fence chosen by the writer

    // The gate lists it and accept CREATES the new skill, draft byte-exact.
    clearCapture();
    expect(await run(['pulse-list'])).toBe(0);
    expect(stdout()).toContain('S-001');
    clearCapture();
    expect(await run(['pulse-accept', 'S-001'])).toBe(0);
    const created = path.join(root, '.claude', 'skills', 'release-notes', 'SKILL.md');
    expect(fs.existsSync(created)).toBe(true);
    expect(fs.readFileSync(created, 'utf-8')).toBe(draft);
  });
});
