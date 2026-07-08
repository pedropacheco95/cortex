/**
 * Spec-level tests — loops.rule-decay, one describe per acceptance criterion,
 * over realistic tmp fixtures. The report is `.cortex/pulse/rule-candidates.md`
 * and nothing else (tree-snapshot AC).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as path from 'path';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import {
  writeAt,
  ruleMd,
  parsePulseReport,
  makeCortexProject,
} from '../../fixtures/loops-harness.js';
import { runRuleDecay } from '../../../src/loops/rule-decay.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`rule-decay-spec-${label}`);
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

const REPORT_REL = path.join('.cortex', 'pulse', 'rule-candidates.md');

function makeProject(label: string): string {
  const root = tmp(label);
  makeCortexProject(root);
  writeAt(root, 'README.md', '# fixture\n');
  writeAt(root, 'src/app.ts', 'export {};\n');
  return root;
}

describe('AC: Dead-governs rule proposed with evidence', () => {
  it('names the rule, quotes the glob, and states the zero-match signal', async () => {
    const root = makeProject('dead-governs');
    writeAt(root, '.cortex/compass/rules/R-110-dead.md', ruleMd('R-110', { governs: ['src/legacy/**/*.ts'] }));
    expect(await runRuleDecay(root)).toBe(0);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('R-110');
    expect(body).toContain('`src/legacy/**/*.ts`');
    expect(body).toContain('zero on-disk files');
  });
});

describe('AC: Dead-source rule proposed', () => {
  it('names the rule and the unresolvable path', async () => {
    const root = makeProject('dead-source');
    writeAt(
      root,
      '.cortex/compass/rules/R-111-src.md',
      ruleMd('R-111', { source: ['../../../docs/gone.md'], governs: ['src/**/*.ts'] }),
    );
    await runRuleDecay(root);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('R-111');
    expect(body).toContain('docs/gone.md');
  });
});

describe('AC: Healthy rule stays silent', () => {
  it('a rule with matching globs and resolving sources does not appear among candidates', async () => {
    const root = makeProject('healthy');
    writeAt(root, '.cortex/compass/rules/R-112-ok.md', ruleMd('R-112'));
    writeAt(root, '.cortex/compass/rules/R-113-dead.md', ruleMd('R-113', { governs: ['lib/gone/**'] }));
    await runRuleDecay(root);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).not.toContain('R-112');
    expect(body).toContain('R-113');
  });
});

describe('AC: Retired rules skipped', () => {
  it('a retired rule with dead globs does not appear', async () => {
    const root = makeProject('retired');
    writeAt(
      root,
      '.cortex/compass/rules/R-114-retired.md',
      ruleMd('R-114', { governs: ['lib/gone/**'], status: 'retired' }),
    );
    await runRuleDecay(root);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).not.toContain('R-114');
    expect(body).toContain('No retirement candidates this cycle.');
  });
});

describe('AC: Always-writes when clean', () => {
  it('healthy-only rules yield the explicit no-candidates line with a fresh generated', async () => {
    const root = makeProject('clean');
    writeAt(root, '.cortex/compass/rules/R-115-ok.md', ruleMd('R-115'));
    await runRuleDecay(root, { now: new Date('2026-07-01T08:00:00.000Z') });
    let report = parsePulseReport(path.join(root, REPORT_REL));
    expect(report.kind).toBe('pulse-rule-candidates');
    expect(report.loop).toBe('cortex-loop-rule-decay');
    expect(report.generated).toBe('2026-07-01T08:00:00.000Z');
    expect(report.body).toContain('No retirement candidates this cycle.');

    await runRuleDecay(root, { now: new Date('2026-07-02T08:00:00.000Z') });
    report = parsePulseReport(path.join(root, REPORT_REL));
    expect(report.generated).toBe('2026-07-02T08:00:00.000Z');
  });

  it('the footer states the thresholds and signals used', async () => {
    const root = makeProject('footer');
    await runRuleDecay(root);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('180 days');
    expect(body).toContain('governs');
    expect(body).toContain('source');
  });
});

describe('AC: Only the report is written', () => {
  it('a full-tree snapshot differs only by pulse/rule-candidates.md', async () => {
    const root = makeProject('only-report');
    writeAt(root, '.cortex/compass/rules/R-116-dead.md', ruleMd('R-116', { governs: ['lib/gone/**'] }));
    const before = snapshotTree(root);
    await runRuleDecay(root);
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
});
