/**
 * Spec-level tests — loops.atlas-staleness, one describe per acceptance
 * criterion, over realistic tmp fixtures. The report is
 * `.cortex/pulse/atlas-review.md` and nothing else (tree-snapshot AC).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as path from 'path';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import {
  daysAgoIso,
  writeAt,
  ruleMd,
  decisionMd,
  setMtimeDaysAgo,
  makeCortexProject,
  parsePulseReport,
} from '../../fixtures/loops-harness.js';
import { runAtlasStaleness } from '../../../src/loops/atlas-staleness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`atlas-spec-${label}`);
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

const REPORT_REL = path.join('.cortex', 'pulse', 'atlas-review.md');

function makeProject(label: string): string {
  const root = tmp(label);
  makeCortexProject(root);
  writeAt(root, 'src/app.ts', 'export {};\n');
  return root;
}

describe('AC: Old cited decision → re-verify with the citer named', () => {
  it('flags the 200-day decision and names the citing rule', async () => {
    const root = makeProject('reverify');
    writeAt(root, '.cortex/atlas/decisions/2025-12-01-choose-x.md', decisionMd('2025-12-01-choose-x', daysAgoIso(200)));
    writeAt(
      root,
      '.cortex/cerebrum/rules/R-301-citer.md',
      ruleMd('R-301', { source: ['../../atlas/decisions/2025-12-01-choose-x.md'], governs: ['src/**/*.ts'] }),
    );
    expect(await runAtlasStaleness(root)).toBe(0);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('decision.2025-12-01-choose-x');
    expect(body).toContain('rule R-301');
    expect(body).toContain('is it still true?');
  });
});

describe('AC: Old orphan source → archive candidate', () => {
  it('lists the 200-day source referenced by nothing', async () => {
    const root = makeProject('archive');
    const src = writeAt(root, '.cortex/atlas/sources/legacy-brief.pdf', 'raw\n');
    setMtimeDaysAgo(src, 200);
    await runAtlasStaleness(root);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('legacy-brief.pdf');
    expect(body).toContain('archival');
  });
});

describe('AC: Fresh entries stay silent', () => {
  it('a 10-day decision does not appear even when cited', async () => {
    const root = makeProject('fresh');
    writeAt(root, '.cortex/atlas/decisions/2026-06-20-recent.md', decisionMd('2026-06-20-recent', daysAgoIso(10)));
    writeAt(
      root,
      '.cortex/cerebrum/rules/R-302-citer.md',
      ruleMd('R-302', { source: ['../../atlas/decisions/2026-06-20-recent.md'], governs: ['src/**/*.ts'] }),
    );
    await runAtlasStaleness(root);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).not.toContain('2026-06-20-recent');
    expect(body).toContain('No candidates this cycle.');
  });
});

describe('AC: Dead atlas cross-ref caught', () => {
  it('names both ends when a decision sources: a deleted file', async () => {
    const root = makeProject('dead-link');
    writeAt(
      root,
      '.cortex/atlas/decisions/2026-06-01-dead.md',
      decisionMd('2026-06-01-dead', daysAgoIso(5), ['sources:', '  - ../sources/vanished.txt']),
    );
    await runAtlasStaleness(root);
    const { body } = parsePulseReport(path.join(root, REPORT_REL));
    expect(body).toContain('decision.2026-06-01-dead');
    expect(body).toContain('../sources/vanished.txt');
    expect(body).toContain('does not resolve');
  });
});

describe('AC: Empty atlas is a stated clean run', () => {
  it('only _index.md files → the report says the atlas is empty, exit 0', async () => {
    const root = makeProject('empty');
    writeAt(root, '.cortex/atlas/_index.md', '# Atlas — index\n');
    writeAt(root, '.cortex/atlas/decisions/_index.md', '# Decisions — index\n');
    const code = await runAtlasStaleness(root, { now: new Date('2026-07-01T09:00:00.000Z') });
    expect(code).toBe(0);
    const report = parsePulseReport(path.join(root, REPORT_REL));
    expect(report.kind).toBe('pulse-atlas-review');
    expect(report.loop).toBe('cortex-loop-atlas-staleness');
    expect(report.generated).toBe('2026-07-01T09:00:00.000Z');
    expect(report.body).toContain('The atlas is empty — no candidates this cycle.');
  });

  it('every run overwrites with a fresh generated (schema §4.5), footer states the threshold', async () => {
    const root = makeProject('rewrite');
    await runAtlasStaleness(root, { now: new Date('2026-07-01T09:00:00.000Z') });
    await runAtlasStaleness(root, { now: new Date('2026-07-02T09:00:00.000Z') });
    const report = parsePulseReport(path.join(root, REPORT_REL));
    expect(report.generated).toBe('2026-07-02T09:00:00.000Z');
    expect(report.body).toContain('180 days');
  });
});

describe('AC: Only the report is written', () => {
  it('a full-tree snapshot differs only by pulse/atlas-review.md', async () => {
    const root = makeProject('only-report');
    writeAt(root, '.cortex/atlas/decisions/2025-12-01-old.md', decisionMd('2025-12-01-old', daysAgoIso(200)));
    const src = writeAt(root, '.cortex/atlas/sources/old.txt', 'raw\n');
    setMtimeDaysAgo(src, 200);
    const before = snapshotTree(root);
    await runAtlasStaleness(root);
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
