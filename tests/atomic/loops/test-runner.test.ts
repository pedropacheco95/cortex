/**
 * Atomic tests — loops.test-runner deterministic pieces: vitest failure
 * parsing, §3 tier command mapping, CLI flag parsing, suppression matching
 * (Rule 3), B-number allocation, §4.3 case-file shape (incl. the §4.5
 * fence-length safety around diffs), five-field PR body assembly (Rule 6),
 * branch naming/slugging, spec/criterion tracing, the classification gate
 * validators (Rule 4), and the shipped skill/templates pins (Rule 10).
 * Sandboxed tmp dirs throughout — the real repo is never mutated.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import {
  parseVitestFailures,
  parseTestRunnerFlags,
  tierHasTests,
  traceSpec,
  traceCriterion,
  findSuppressingBug,
  nextBugNumber,
  slugify,
  testFixBranch,
  buildCaseFileContent,
  fileCaseFile,
  buildPrBody,
  validateClassification,
  isSevenType,
  TIER_COMMANDS,
  TIER_DIRS,
  DEFAULT_TIERS,
  FILED_BY_MARKER,
  type WorklistFailure,
} from '../../../src/loops/test-runner.js';
import { BUG_TYPES } from '../../../src/loops/bug-triage.js';
import { SCHEDULED_TASKS } from '../../../src/cli/templates.js';
import { validate } from '../../../src/schema/validate.js';
import type { HarnessResult } from '../../../src/harness/run.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`tr-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// ---------------------------------------------------------------------------
// failure intake — vitest output parsing (Rule 2)
// ---------------------------------------------------------------------------

describe('parseVitestFailures', () => {
  it('parses a FAIL line into file + full "suite > test" name', () => {
    const out = [
      '⎯⎯ Failed Tests 1 ⎯⎯',
      ' FAIL  tests/atomic/demo/sample.test.ts > demo capability > asserts the rule',
      'AssertionError: expected false to be true',
      ' Test Files  1 failed (1)',
      '      Tests  1 failed | 3 passed (4)',
    ].join('\n');
    const parsed = parseVitestFailures(out);
    expect(parsed.failures).toEqual([
      { file: 'tests/atomic/demo/sample.test.ts', name: 'demo capability > asserts the rule' },
    ]);
    expect(parsed.failed).toBe(1);
    expect(parsed.passed).toBe(3);
  });

  it('collects multiple failures and dedupes repeated FAIL lines', () => {
    const out = [
      ' FAIL  tests/atomic/a.test.ts > s > one',
      ' FAIL  tests/atomic/b.test.ts > s > two',
      ' FAIL  tests/atomic/a.test.ts > s > one',
      '      Tests  2 failed | 1 passed (3)',
    ].join('\n');
    const parsed = parseVitestFailures(out);
    expect(parsed.failures).toHaveLength(2);
    expect(parsed.failed).toBe(2);
  });

  it('a FAIL line without a test name yields name: null', () => {
    const parsed = parseVitestFailures(' FAIL  tests/spec/x.test.ts\n      Tests  1 failed (1)\n');
    expect(parsed.failures).toEqual([{ file: 'tests/spec/x.test.ts', name: null }]);
    expect(parsed.passed).toBeNull();
  });

  it('all-green output parses zero failures with the passed count', () => {
    const parsed = parseVitestFailures(' Test Files  2 passed (2)\n      Tests  44 passed (44)\n');
    expect(parsed.failures).toEqual([]);
    expect(parsed.passed).toBe(44);
    expect(parsed.failed).toBeNull();
  });

  it('output with no summary line yields null counts', () => {
    const parsed = parseVitestFailures('some unrelated runner noise\n');
    expect(parsed.failures).toEqual([]);
    expect(parsed.passed).toBeNull();
    expect(parsed.failed).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// tier command mapping (Rule 1 — §3 tree paths, module-footer constants)
// ---------------------------------------------------------------------------

describe('tier command mapping (§3 paths)', () => {
  it('maps each of the four tiers onto its §3 tests/ subtree', () => {
    expect(TIER_COMMANDS.atomic).toContain('tests/atomic');
    expect(TIER_COMMANDS.spec).toContain('tests/spec');
    expect(TIER_COMMANDS.journey).toContain('tests/journey');
    expect(TIER_COMMANDS.scenario).toContain('tests/scenario');
    expect(TIER_DIRS).toEqual({
      atomic: 'tests/atomic',
      spec: 'tests/spec',
      journey: 'tests/journey',
      scenario: 'tests/scenario',
    });
  });

  it('the default cadence is the daily atomic+spec pair', () => {
    expect(DEFAULT_TIERS).toEqual(['atomic', 'spec']);
  });

  it('tierHasTests: a tier without *.test.ts files (or without the dir) is empty', () => {
    const root = tmp('tiers');
    expect(tierHasTests(root, 'journey')).toBe(false);
    fs.mkdirSync(path.join(root, 'tests', 'journey', 'deep'), { recursive: true });
    expect(tierHasTests(root, 'journey')).toBe(false);
    fs.writeFileSync(path.join(root, 'tests', 'journey', 'deep', 'j.test.ts'), 'x\n', 'utf-8');
    expect(tierHasTests(root, 'journey')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CLI flag parsing (Rule 1)
// ---------------------------------------------------------------------------

describe('parseTestRunnerFlags', () => {
  it('defaults: atomic+spec tiers, the given default trigger, no modes', () => {
    const flags = parseTestRunnerFlags('loop-test-runner', [], 'scheduled');
    expect(flags).toEqual({ tiers: ['atomic', 'spec'], trigger: 'scheduled', collect: false, noLlm: false });
  });

  it('the test-run alias default trigger is manual (design §15)', () => {
    const flags = parseTestRunnerFlags('test-run', [], 'manual');
    expect(flags?.trigger).toBe('manual');
  });

  it('--tier accepts a comma list and --trigger overrides the default', () => {
    const flags = parseTestRunnerFlags('loop-test-runner', ['--tier', 'journey,scenario', '--trigger', 'manual'], 'scheduled');
    expect(flags?.tiers).toEqual(['journey', 'scenario']);
    expect(flags?.trigger).toBe('manual');
  });

  it('an unknown tier is rejected', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseTestRunnerFlags('loop-test-runner', ['--tier', 'bogus'], 'scheduled')).toBeNull();
    expect(spy.mock.calls.join('\n')).toContain('bogus');
  });

  it('an invalid --trigger is rejected', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseTestRunnerFlags('loop-test-runner', ['--trigger', 'cron'], 'scheduled')).toBeNull();
  });

  it('--fix-stage requires a file argument', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseTestRunnerFlags('loop-test-runner', ['--fix-stage'], 'scheduled')).toBeNull();
    expect(parseTestRunnerFlags('loop-test-runner', ['--fix-stage', '--no-llm'], 'scheduled')).toBeNull();
  });

  it('--collect and --fix-stage are mutually exclusive; each parses alone', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseTestRunnerFlags('loop-test-runner', ['--collect', '--fix-stage', 'r.json'], 'scheduled')).toBeNull();
    expect(parseTestRunnerFlags('loop-test-runner', ['--collect'], 'scheduled')?.collect).toBe(true);
    expect(parseTestRunnerFlags('loop-test-runner', ['--fix-stage', 'r.json'], 'scheduled')?.fixStageFile).toBe('r.json');
  });
});

// ---------------------------------------------------------------------------
// branch naming / slugging (Rule 6)
// ---------------------------------------------------------------------------

describe('branch naming and slugging', () => {
  it('slugify lowercases, hyphenates non-alphanumerics, and trims edges', () => {
    expect(slugify('Demo Capability > asserts THE rule!')).toBe('demo-capability-asserts-the-rule');
    expect(slugify('___')).toBe('fix');
  });

  it('slugify truncates long inputs without a trailing hyphen', () => {
    const slug = slugify('a'.repeat(30) + ' ' + 'b'.repeat(30));
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('testFixBranch builds cortex/test-fix-<slug> from the test file + name', () => {
    const branch = testFixBranch({ testPath: 'tests/atomic/demo/sample.test.ts', testName: 'demo > asserts the rule' });
    expect(branch).toMatch(/^cortex\/test-fix-sample-demo-asserts-the-rule$/);
  });

  it('testFixBranch works without a test name', () => {
    expect(testFixBranch({ testPath: 'tests/spec/loops/x.test.ts', testName: null })).toBe('cortex/test-fix-x');
  });
});

// ---------------------------------------------------------------------------
// B-number allocation (Rule 7 / schema §4.3)
// ---------------------------------------------------------------------------

describe('B-number allocation', () => {
  it('a missing or empty ledger allocates B-001', () => {
    const root = tmp('bnum-empty');
    expect(nextBugNumber(root)).toBe(1);
    fs.mkdirSync(path.join(root, '.cortex', 'cerebrum', 'bugs'), { recursive: true });
    expect(nextBugNumber(root)).toBe(1);
  });

  it('allocates max existing + 1, ignoring non-B files', () => {
    const root = tmp('bnum');
    const bugs = path.join(root, '.cortex', 'cerebrum', 'bugs');
    fs.mkdirSync(bugs, { recursive: true });
    fs.writeFileSync(path.join(bugs, 'B-002-old.md'), 'x', 'utf-8');
    fs.writeFileSync(path.join(bugs, 'B-010-newer.md'), 'x', 'utf-8');
    fs.writeFileSync(path.join(bugs, 'notes.md'), 'x', 'utf-8');
    expect(nextBugNumber(root)).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// suppression matching (Rule 3 — the ledger IS the memory)
// ---------------------------------------------------------------------------

function seedBug(root: string, filename: string, opts: { status: string; affects: string[]; marker: boolean }): void {
  const bugs = path.join(root, '.cortex', 'cerebrum', 'bugs');
  fs.mkdirSync(bugs, { recursive: true });
  const id = (/^B-\d+/.exec(filename) ?? ['B-999'])[0];
  fs.writeFileSync(
    path.join(bugs, filename),
    [
      '---',
      `id: ${id}`,
      'title: seeded',
      'type: wrong-rule',
      'severity: medium',
      `status: ${opts.status}`,
      'affects:',
      ...opts.affects.map((a) => `  - ${JSON.stringify(a)}`),
      '---',
      '',
      `# ${id}`,
      '',
      ...(opts.marker ? [`${FILED_BY_MARKER} (automated case file).`, ''] : []),
    ].join('\n'),
    'utf-8',
  );
}

describe('suppression matching', () => {
  const TEST_PATH = 'tests/atomic/demo/sample.test.ts';

  it('an OPEN test-runner-filed bug whose affects names the test path suppresses it', () => {
    const root = tmp('sup-open');
    seedBug(root, 'B-004-sample.md', { status: 'open', affects: [TEST_PATH, 'demo.sample'], marker: true });
    expect(findSuppressingBug(root, TEST_PATH)).toEqual({
      id: 'B-004',
      file: path.join('.cortex', 'cerebrum', 'bugs', 'B-004-sample.md'),
    });
  });

  it('a resolved entry no longer suppresses — leaving `open` re-arms the test', () => {
    const root = tmp('sup-resolved');
    seedBug(root, 'B-004-sample.md', { status: 'resolved', affects: [TEST_PATH], marker: true });
    expect(findSuppressingBug(root, TEST_PATH)).toBeNull();
  });

  it('an open FOREIGN bug (no test-runner marker) never suppresses', () => {
    const root = tmp('sup-foreign');
    seedBug(root, 'B-004-sample.md', { status: 'open', affects: [TEST_PATH], marker: false });
    expect(findSuppressingBug(root, TEST_PATH)).toBeNull();
  });

  it('an open marker bug affecting a different test path never suppresses', () => {
    const root = tmp('sup-other');
    seedBug(root, 'B-004-sample.md', { status: 'open', affects: ['tests/atomic/other.test.ts'], marker: true });
    expect(findSuppressingBug(root, TEST_PATH)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// case-file shape (Rule 7 / schema §4.3 + §4.5 fence grammar)
// ---------------------------------------------------------------------------

const FAILURE: WorklistFailure = {
  tier: 'atomic',
  trigger: 'manual',
  timestamp: '2026-07-03T10:00:00.000Z',
  testPath: 'tests/atomic/demo/sample.test.ts',
  testName: 'demo > asserts the rule',
  output: 'FAIL tests/atomic/demo/sample.test.ts\nAssertionError: nope',
  specId: 'demo.sample',
  specFile: '.specflow/specs/demo/sample.spec.md',
  criterion: 'Sample rule holds',
};

function harnessFail(diff: string): HarnessResult {
  return {
    outcome: 'fail',
    iterations: 2,
    diff,
    verdicts: [
      { verdict: 'fail', reasoning: 'REJECTION-ONE: change too narrow' },
      { verdict: 'fail', reasoning: 'REJECTION-TWO: still too narrow' },
    ],
    writerOutputs: ['first attempt notes', 'second attempt notes'],
  };
}

describe('case-file shape (§4.3)', () => {
  it('carries the classification type, last diff, full verdict history, trigger context, affects, and the filer marker', () => {
    const content = buildCaseFileContent({
      bugId: 'B-007',
      failure: FAILURE,
      classification: { testPath: FAILURE.testPath, testName: null, type: 'wrong-rule', severity: 'high', reasoning: 'the rule is wrong' },
      harness: harnessFail('--- a/target.txt\n+++ b/target.txt\n@@ -1 +1 @@\n-original\n+FIXED\n'),
      nowIso: '2026-07-03T10:05:00.000Z',
    });
    expect(content).toContain('id: B-007');
    expect(content).toContain('type: wrong-rule');
    expect(content).toContain('severity: high');
    expect(content).toContain('status: open');
    expect(content).toContain(`  - "${FAILURE.testPath}"`);
    expect(content).toContain('  - "demo.sample"');
    expect(content).toContain(FILED_BY_MARKER);
    expect(content).toContain('+FIXED');
    expect(content).toContain('1. **fail** — REJECTION-ONE: change too narrow');
    expect(content).toContain('2. **fail** — REJECTION-TWO: still too narrow');
    expect(content).toContain('tier `atomic`');
    expect(content).toContain('trigger `manual`');
    expect(content).toContain('2026-07-03T10:00:00.000Z');
  });

  it('a diff containing triple-backtick runs gets a strictly longer outer fence (§4.5 grammar via fences.ts)', () => {
    const diff = '+++ b/doc.md\n+```ts\n+code\n+```\n';
    const content = buildCaseFileContent({
      bugId: 'B-008',
      failure: FAILURE,
      classification: { testPath: FAILURE.testPath, testName: null, type: 'test-defect', severity: null, reasoning: null },
      harness: harnessFail(diff),
      nowIso: '2026-07-03T10:05:00.000Z',
    });
    expect(content).toContain('````diff');
    expect(content).toContain('\n````\n');
  });

  it('missing severity defaults to medium (schema-valid enum) and an empty diff is stated', () => {
    const content = buildCaseFileContent({
      bugId: 'B-009',
      failure: FAILURE,
      classification: { testPath: FAILURE.testPath, testName: null, type: 'test-defect', severity: null, reasoning: null },
      harness: { ...harnessFail(''), diff: '' },
      nowIso: '2026-07-03T10:05:00.000Z',
    });
    expect(content).toContain('severity: medium');
    expect(content).toContain('(the writer produced no diff)');
  });

  it('fileCaseFile allocates the next B-number and the filed entry passes the schema validator (check.bug clean)', async () => {
    const root = tmp('casefile');
    fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.cortex', 'cortex.config.json'),
      JSON.stringify({ schemaVersion: '1.0' }, null, 2) + '\n',
      'utf-8',
    );
    seedBug(root, 'B-003-existing.md', { status: 'resolved', affects: ['x.ts'], marker: false });
    const filed = fileCaseFile(
      root,
      FAILURE,
      { testPath: FAILURE.testPath, testName: null, type: 'wrong-rule', severity: 'high', reasoning: 'r' },
      harnessFail('+x\n'),
      '2026-07-03T10:05:00.000Z',
    );
    expect(filed.bugId).toBe('B-004');
    expect(fs.existsSync(path.join(root, filed.file))).toBe(true);
    const report = await validate(root, { root });
    const bugViolations = report.violations.filter(
      (v) => v.check === 'check.bug' && v.location.path.includes('B-004'),
    );
    expect(bugViolations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PR body assembly (Rule 6 — the five contract fields, Pedro pin 2)
// ---------------------------------------------------------------------------

describe('PR body assembly (five fields)', () => {
  it('always carries spec id, criterion, writer reasoning, verifier verdict, and trigger context, and states its automated origin', () => {
    const body = buildPrBody({
      specId: 'demo.sample',
      criterion: 'Sample rule holds',
      writerReasoning: 'WRITER-SAYS: tightened the check',
      verifierVerdict: 'pass — VERIFIER-SAYS: satisfies the criterion',
      trigger: { tier: 'atomic', trigger: 'manual', timestamp: '2026-07-03T10:00:00.000Z' },
    });
    expect(body).toContain('**Spec:** demo.sample');
    expect(body).toContain('**Criterion:** Sample rule holds');
    expect(body).toContain('**Writer reasoning:** WRITER-SAYS: tightened the check');
    expect(body).toContain('**Verifier verdict:** pass — VERIFIER-SAYS: satisfies the criterion');
    expect(body).toContain('trigger: manual');
    expect(body).toContain('tier: atomic');
    expect(body.toLowerCase()).toContain('automated');
    expect(body).toContain('cortex-loop-test-runner');
  });

  it('untraceable spec/criterion degrade to explicit placeholders — the fields never vanish', () => {
    const body = buildPrBody({
      specId: null,
      criterion: null,
      writerReasoning: 'w',
      verifierVerdict: 'pass — ok',
      trigger: { tier: 'spec', trigger: 'scheduled', timestamp: 't' },
    });
    expect(body).toContain('**Spec:** (no spec traced for this test)');
    expect(body).toContain('**Criterion:** (no criterion traced)');
  });
});

// ---------------------------------------------------------------------------
// spec + criterion tracing (Rule 5)
// ---------------------------------------------------------------------------

describe('spec and criterion tracing', () => {
  it('traces via the §3 path convention: tests/<tier>/<rest>.test.ts → .specflow/specs/<rest>.spec.md', () => {
    const root = tmp('trace-path');
    fs.mkdirSync(path.join(root, '.specflow', 'specs', 'demo'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.specflow', 'specs', 'demo', 'sample.spec.md'),
      '---\nid: demo.sample\nstatus: draft\n---\n\n# S\n',
      'utf-8',
    );
    const traced = traceSpec(root, 'tests/atomic/demo/sample.test.ts');
    expect(traced?.id).toBe('demo.sample');
    expect(traced?.file).toBe(path.join('.specflow', 'specs', 'demo', 'sample.spec.md'));
  });

  it('falls back to a governs-glob scan when the conventional path misses', () => {
    const root = tmp('trace-governs');
    fs.mkdirSync(path.join(root, '.specflow', 'specs', 'other'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.specflow', 'specs', 'other', 'thing.spec.md'),
      '---\nid: other.thing\nstatus: draft\ngoverns:\n  - "tests/journey/**"\n---\n\n# S\n',
      'utf-8',
    );
    expect(traceSpec(root, 'tests/journey/flow/x.test.ts')?.id).toBe('other.thing');
  });

  it('returns null when neither convention nor governs hits', () => {
    const root = tmp('trace-none');
    fs.mkdirSync(path.join(root, '.specflow', 'specs'), { recursive: true });
    expect(traceSpec(root, 'tests/atomic/nowhere/y.test.ts')).toBeNull();
  });

  it('traceCriterion picks the AC heading with maximal word overlap with the test name', () => {
    const spec = [
      '## Acceptance Criteria',
      '',
      '### Unrelated criterion entirely',
      '',
      '### Sample rule holds',
      '',
      '## Notes',
    ].join('\n');
    expect(traceCriterion(spec, 'demo > asserts the sample rule holds')).toBe('Sample rule holds');
  });

  it('traceCriterion falls back to the first criterion, and to null without an AC section', () => {
    const spec = '## Acceptance Criteria\n\n### First criterion\n\n### Second criterion\n';
    expect(traceCriterion(spec, 'zzz qqq www')).toBe('First criterion');
    expect(traceCriterion('# no criteria here\n', 'anything')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classification gate validators (Rule 4, Pedro pin 3)
// ---------------------------------------------------------------------------

describe('classification gate', () => {
  it('validateClassification accepts the result shape and normalises severity', () => {
    expect(
      validateClassification({ testPath: 't.test.ts', testName: 'n', type: 'wrong-rule', severity: 'high', reasoning: 'r' }),
    ).toEqual({ testPath: 't.test.ts', testName: 'n', type: 'wrong-rule', severity: 'high', reasoning: 'r' });
    // A severity outside the schema enum is dropped, never written to the ledger.
    expect(validateClassification({ testPath: 't', type: 'wrong-rule', severity: 'apocalyptic' })?.severity).toBeNull();
  });

  it('rejects results missing testPath or type', () => {
    expect(validateClassification({ type: 'wrong-rule' })).toBeNull();
    expect(validateClassification({ testPath: 't' })).toBeNull();
    expect(validateClassification('nope')).toBeNull();
  });

  it('isSevenType admits exactly the seven §4.3 types — not-one-of-the-seven stays outside', () => {
    for (const t of BUG_TYPES) expect(isSevenType(t)).toBe(true);
    expect(isSevenType('not-one-of-the-seven')).toBe(false);
    expect(isSevenType('infrastructure-failure')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bundle pins (Rule 10 — SKILL.md + the scheduled-task mapping)
// ---------------------------------------------------------------------------

describe('shipped bundle (Rule 10)', () => {
  const skillPath = path.join(REPO_ROOT, 'skills', 'cortex-loop-test-runner', 'SKILL.md');

  it('skills/cortex-loop-test-runner/SKILL.md exists and drives the collect → classify-in-session → fix-stage flow', () => {
    const raw = fs.readFileSync(skillPath, 'utf-8');
    expect(raw).toContain('name: cortex-loop-test-runner');
    expect(raw).toContain('cortex loop-test-runner --collect');
    expect(raw).toContain('cortex loop-test-runner --fix-stage');
    expect(raw).toContain('specflow-bugs');
    expect(raw).toContain('never spawn a nested `claude` subprocess');
    expect(raw).toContain('not-one-of-the-seven');
    for (const t of BUG_TYPES) expect(raw).toContain(t);
  });

  it('the scheduled test-runner task requires exactly this skill and names it verbatim in its body', () => {
    const task = SCHEDULED_TASKS.find((t) => t.name === 'test-runner');
    expect(task).toBeDefined();
    expect(task!.requiredSkills).toEqual(['cortex-loop-test-runner']);
    expect(task!.body).toContain('cortex-loop-test-runner');
  });
});
