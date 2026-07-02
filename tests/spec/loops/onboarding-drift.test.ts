/**
 * Spec-level tests — loops.onboarding-drift, one describe per acceptance
 * criterion. The clean-run AC uses a REAL `cortex init` (noLlm, fake home —
 * the real ~/.claude is never touched); the drift ACs use targeted fixtures.
 * The report is `.cortex/pulse/scaffolding-review.md` and nothing else.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as path from 'path';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import { writeAt, makeCortexProject, parsePulseReport } from '../../fixtures/loops-harness.js';
import { runOnboardingDrift } from '../../../src/loops/onboarding-drift.js';
import { init } from '../../../src/cli/init.js';
import { CORTEX_INDEXES } from '../../../src/cli/templates.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`onboarding-spec-${label}`);
  dirs.push(d);
  return d;
}
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

const REPORT_REL = path.join('.cortex', 'pulse', 'scaffolding-review.md');

describe('AC: Version-lagging CLAUDE.md block flagged', () => {
  it('names the v0.9 vs 1.0 mismatch and proposes refreshing the managed block', async () => {
    const root = tmp('version');
    makeCortexProject(root, '1.0');
    writeAt(root, 'CLAUDE.md', '<!-- cortex:start v0.9 -->\n## Cortex\n<!-- cortex:end -->\n');
    expect(await runOnboardingDrift(root)).toBe(0);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('v0.9');
    expect(body).toContain('1.0');
    expect(body).toContain('cortex init --force');
  });
});

describe('AC: Malformed index flagged via shared logic', () => {
  it('an _index.md missing "Read this when:" is flagged, consistent with check.index-shape', async () => {
    const root = tmp('heading');
    makeCortexProject(root);
    writeAt(root, 'CLAUDE.md', '<!-- cortex:start v1.0 -->\nx\n<!-- cortex:end -->\n');
    writeAt(root, '.cortex/anatomy/_index.md', "# Anatomy\n\n**What's here:** files.\n");
    await runOnboardingDrift(root);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('.cortex/anatomy/_index.md');
    expect(body).toContain('Read this when:');
    expect(body).toContain('check.index-shape');
  });
});

describe('AC: Over-budget index flagged', () => {
  it('a ~2000-character index is flagged with the ~500-token estimate against the 300 budget', async () => {
    const root = tmp('budget');
    makeCortexProject(root);
    writeAt(root, 'CLAUDE.md', '<!-- cortex:start v1.0 -->\nx\n<!-- cortex:end -->\n');
    const filler = 'word '.repeat(392); // ≈2000 chars total
    writeAt(root, '.cortex/pulse/_index.md', `**Read this when:** always.\n\n**What's here:** ${filler}\n`);
    await runOnboardingDrift(root);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    const m = /estimated (\d+) tokens/.exec(body);
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(450);
    expect(Number(m?.[1])).toBeLessThanOrEqual(550);
    expect(body).toContain('300-token budget');
  });
});

describe('AC: Current scaffolding is a stated clean run', () => {
  it('a freshly initialised project reads "Scaffolding is current.", exit 0', async () => {
    const root = tmp('fresh');
    const home = tmp('fresh-home');
    writeAt(root, 'README.md', '# fixture\n');
    writeAt(root, 'src/app.ts', 'export {};\n');
    const initResult = await init(root, { noLlm: true, yes: true, home, platform: 'darwin' });
    expect(initResult.exitCode).toBe(0);

    const code = await runOnboardingDrift(root, { now: new Date('2026-07-01T12:00:00.000Z') });
    expect(code).toBe(0);
    const report = parsePulseReport(path.join(root, REPORT_REL));
    expect(report.kind).toBe('pulse-scaffolding-review');
    expect(report.loop).toBe('cortex-loop-onboarding-drift');
    expect(report.generated).toBe('2026-07-01T12:00:00.000Z');
    expect(report.body).toContain('Scaffolding is current.');
  });

  it('every run overwrites with a fresh generated (schema §4.5 always-write)', async () => {
    const root = tmp('rewrite');
    makeCortexProject(root);
    writeAt(root, 'CLAUDE.md', '<!-- cortex:start v1.0 -->\nx\n<!-- cortex:end -->\n');
    await runOnboardingDrift(root, { now: new Date('2026-07-01T12:00:00.000Z') });
    await runOnboardingDrift(root, { now: new Date('2026-07-02T12:00:00.000Z') });
    const report = parsePulseReport(path.join(root, REPORT_REL));
    expect(report.generated).toBe('2026-07-02T12:00:00.000Z');
  });
});

describe('AC: Only the report is written', () => {
  it('a full-tree snapshot differs only by pulse/scaffolding-review.md', async () => {
    const root = tmp('only-report');
    makeCortexProject(root, '1.0');
    writeAt(root, 'CLAUDE.md', '<!-- cortex:start v0.9 -->\nx\n<!-- cortex:end -->\n');
    writeAt(root, '.cortex/atlas/decisions/_index.md', CORTEX_INDEXES['atlas/decisions'] as string);
    writeAt(root, '.cortex/atlas/decisions/2026-06-01-x.md', '---\nid: decision.2026-06-01-x\ntitle: x\ndate: 2026-06-01T00:00:00Z\n---\n');
    const before = snapshotTree(root);
    await runOnboardingDrift(root);
    const after = snapshotTree(root);

    const changed: string[] = [];
    for (const [rel, content] of after) {
      if (!before.has(rel) || before.get(rel) !== content) changed.push(rel);
    }
    for (const rel of before.keys()) {
      if (!after.has(rel)) changed.push(`(deleted) ${rel}`);
    }
    expect(changed).toEqual([REPORT_REL]);
  });

  it('the heuristic hint is labelled as such in the report (Notes: never an error)', async () => {
    const root = tmp('heuristic-label');
    makeCortexProject(root);
    writeAt(root, 'CLAUDE.md', '<!-- cortex:start v1.0 -->\nx\n<!-- cortex:end -->\n');
    writeAt(root, '.cortex/atlas/decisions/_index.md', CORTEX_INDEXES['atlas/decisions'] as string);
    writeAt(root, '.cortex/atlas/decisions/2026-06-01-x.md', '---\nid: decision.2026-06-01-x\ntitle: x\ndate: 2026-06-01T00:00:00Z\n---\n');
    await runOnboardingDrift(root);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('(heuristic hint)');
  });
});
