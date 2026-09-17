/**
 * Spec tests — `recall.index-blocks` as a whole: the writer runs inside an
 * initialised project after the real compiler, the block is committed atlas
 * content that only `scan`/`init` touch (the post-commit fast tier rebuilds
 * the index and leaves the block alone), `cortex sync` sees a template-plus-
 * block index as current, `cortex init` on a fresh project writes no block,
 * and the result validates clean. Every project is a tmp root with an
 * injected fake home; the real `.cortex/` and `~/.claude` are never touched.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { init } from '../../../src/cli/init.js';
import { sync } from '../../../src/cli/sync.js';
import { validate } from '../../../src/schema/validate.js';
import { writeRecallIndex } from '../../../src/recall/index.js';
import { RECALL_BLOCK_START, RECALL_BLOCK_END, writeRecallIndexBlocks } from '../../../src/recall/index-blocks.js';
import { runInsightRefreshFast } from '../../../src/insight/refresh-fast.js';
import { CORTEX_INDEXES, SCHEMA_VERSION } from '../../../src/cli/templates.js';
import { makeTmpDir, cleanTmp, gitInit } from '../../fixtures/init-harness.js';
import { registerId } from '../../../src/compass/registry.js';

const TEST_TIMEOUT = 60_000;
const DARWIN_INIT = { platform: 'darwin' as const, noLlm: true };
const DECISIONS_REL = '.cortex/atlas/decisions/_index.md';
const EVIDENCE_REL = '.cortex/atlas/evidence/_index.md';
const START = RECALL_BLOCK_START(SCHEMA_VERSION);

function write(root: string, rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf-8');
}
const read = (root: string, rel: string): string => fs.readFileSync(path.join(root, rel), 'utf-8');

/** A resolving rule so `R-001` reaches the index's subjects (an unresolved ref is dropped, never a subject); its `source` is the first decision the scan case writes. */
function rule(root: string): void {
  write(root, '.cortex/compass/rules/R-001-sample-rule.md', [
    '---',
    'id: R-001',
    'title: Spec files carry schema-checked frontmatter',
    'source:',
    '  - ../../atlas/decisions/2026-09-01-a.md',
    'governs:',
    '  - ".specflow/specs/**/*.spec.md"',
    'confidence: STATED',
    '---',
    '',
    '# R-001 — Spec files carry schema-checked frontmatter',
    '',
  ].join('\n'));
  // schema.id-registry Rule 5: a hand-planted rule file must be registered, or sync's self-validation errors.
  registerId(root, 'R-001', 'sample-rule');
}

function decision(root: string, stem: string, title: string, bearsOn: string): void {
  write(root, `.cortex/atlas/decisions/${stem}.md`, [
    '---',
    `id: decision.${stem}`,
    `title: ${title}`,
    `date: ${stem.slice(0, 10)}T00:00:00Z`,
    `bears_on: [${bearsOn}]`,
    '---',
    '',
    `# ${title}`,
    '',
  ].join('\n'));
}

function evidence(root: string, stem: string, title: string, bearsOn: string): void {
  write(root, `.cortex/atlas/evidence/${stem}.md`, [
    '---',
    `id: evidence.${stem}`,
    `title: ${title}`,
    `date: ${stem.slice(0, 10)}T00:00:00Z`,
    'kind: measurement',
    'instrument: pulse.usage',
    'window:',
    "  from: '2026-09-01T00:00:00Z'",
    "  to: '2026-09-15T00:00:00Z'",
    'findings:',
    '  - metric: reads',
    '    value: 0',
    `bears_on: [${bearsOn}]`,
    '---',
    '',
    `# ${title}`,
    '',
  ].join('\n'));
}

describe('recall.index-blocks — the writer inside an initialised project', () => {
  let root: string;
  let home: string;
  let afterScanDecisions: string;
  let afterScanEvidence: string;

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    root = makeTmpDir('recall-blocks-spec-proj');
    home = makeTmpDir('recall-blocks-spec-home');
    gitInit(root);
    const result = await init(root, { home, ...DARWIN_INIT });
    expect(result.exitCode).toBe(0);
    rule(root);
  }, TEST_TIMEOUT);

  afterAll(() => {
    vi.restoreAllMocks();
    cleanTmp(root);
    cleanTmp(home);
  });

  it('cortex init on a fresh project writes no block: both atlas indexes are byte-identical to their templates', () => {
    expect(read(root, DECISIONS_REL)).toBe(CORTEX_INDEXES['atlas/decisions']);
    expect(read(root, EVIDENCE_REL)).toBe(CORTEX_INDEXES['atlas/evidence']);
  });

  it('the scan code path (compile + writeRecallIndex + writeRecallIndexBlocks) writes a block naming every entry in both files', async () => {
    decision(root, '2026-09-01-a', 'First decision', 'R-001');
    decision(root, '2026-09-10-b', 'Second decision', 'R-001, ".cortex/atlas/evidence/2026-09-15-usage.md"');
    evidence(root, '2026-09-15-usage', 'Usage over 41 sessions', 'R-001');
    const index = await writeRecallIndex(root);
    const blocks = writeRecallIndexBlocks(root, index);
    expect(blocks.written.sort()).toEqual(['atlas/decisions', 'atlas/evidence']);

    afterScanDecisions = read(root, DECISIONS_REL);
    afterScanEvidence = read(root, EVIDENCE_REL);
    // Outside the markers the template survives byte-for-byte (Rule 1).
    expect(afterScanDecisions.startsWith(CORTEX_INDEXES['atlas/decisions'] + '\n' + START + '\n')).toBe(true);
    expect(afterScanEvidence.startsWith(CORTEX_INDEXES['atlas/evidence'] + '\n' + START + '\n')).toBe(true);
    // Newest first, subjects from the compiled index's inversion (Rule 2).
    const dLines = afterScanDecisions.slice(afterScanDecisions.indexOf(START)).split('\n');
    expect(dLines[2]).toBe('- 2026-09-10 decision.2026-09-10-b — Second decision · bears on: .cortex/atlas/evidence/2026-09-15-usage.md, R-001');
    expect(dLines[3]).toBe('- 2026-09-01 decision.2026-09-01-a — First decision · bears on: R-001');
    expect(dLines[4]).toBe(RECALL_BLOCK_END);
    const eLines = afterScanEvidence.slice(afterScanEvidence.indexOf(START)).split('\n');
    expect(eLines[2]).toBe('- 2026-09-15 evidence.2026-09-15-usage — Usage over 41 sessions · bears on: R-001');
    expect(eLines[3]).toBe(RECALL_BLOCK_END);
  }, TEST_TIMEOUT);

  it('the post-commit fast tier rebuilds recall-index.json for a new decision but leaves both blocks unchanged (Rule 6)', async () => {
    decision(root, '2026-09-14-c', 'Third decision', 'R-001');
    expect(await runInsightRefreshFast(root)).toBe(0);
    const raw = read(root, '.cortex/recall-index.json');
    expect(raw).toContain('decision.2026-09-14-c');
    expect(read(root, DECISIONS_REL)).toBe(afterScanDecisions);
    expect(read(root, EVIDENCE_REL)).toBe(afterScanEvidence);
    expect(read(root, DECISIONS_REL)).not.toContain('decision.2026-09-14-c');
  }, TEST_TIMEOUT);

  it('cortex sync counts a template-plus-block index as current and leaves the block intact (Rule 7)', async () => {
    const result = await sync(root, { home, platform: 'darwin' });
    expect(result.exitCode).toBe(0);
    const currentLine = result.summary.split('\n').find((l) => l.trim().startsWith('Current:')) ?? '';
    expect(currentLine).toContain('atlas/decisions');
    expect(currentLine).toContain('atlas/evidence');
    const localisedLine = result.summary.split('\n').find((l) => l.trim().startsWith('Localised')) ?? '';
    expect(localisedLine).not.toContain('atlas/decisions');
    expect(localisedLine).not.toContain('atlas/evidence');
    expect(read(root, DECISIONS_REL)).toBe(afterScanDecisions);
    expect(read(root, EVIDENCE_REL)).toBe(afterScanEvidence);
  }, TEST_TIMEOUT);

  it('a rerun of the writer after the fast tier picks up the new decision and validates without a check.index-shape warning', async () => {
    const index = await writeRecallIndex(root);
    const blocks = writeRecallIndexBlocks(root, index);
    expect(blocks.written).toEqual(['atlas/decisions']);
    expect(blocks.unchanged).toEqual(['atlas/evidence']);
    expect(read(root, DECISIONS_REL)).toContain('- 2026-09-14 decision.2026-09-14-c — Third decision · bears on: R-001');
    const again = writeRecallIndexBlocks(root, index);
    expect(again.written).toEqual([]);
    const report = await validate(root, { root });
    const shape = report.violations.filter(
      (v) => v.check === 'check.index-shape' && (v.location?.path?.includes('atlas/decisions') || v.location?.path?.includes('atlas/evidence')),
    );
    expect(shape).toEqual([]);
  }, TEST_TIMEOUT);
});
