/**
 * Spec tests — loops.test-runner: ALL 7 acceptance criteria as labelled
 * describes, over real git fixture projects with synthetic failing tests.
 * Every agentic touch is a capturing stub (combined claude stub for
 * classifier/writer/verifier, argv-recording gh stub) — the real Claude CLI,
 * the real gh, the real ~/.claude, and the network are NEVER touched, and
 * the real repo's suite/tree is never mutated.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { gitCommitAll } from '../../fixtures/harness-stubs.js';
import {
  combinedClaudeStub,
  readCalls,
  ghStub,
  readGhCalls,
  makeTestRunnerProject,
  snapshotWorkingTree,
  REASONING_FIXING_WRITER_SH,
  SAMPLE_TEST_PATH,
  SAMPLE_TEST_NAME,
  SAMPLE_SPEC_ID,
  SAMPLE_CRITERION,
  TIER_STUB_COMMAND,
} from '../../fixtures/test-runner-harness.js';
import {
  runTestRunner,
  TEST_WORKLIST_FILE,
  TEST_FAILURES_REPORT_FILE,
  type TestRunnerOptions,
  type TestWorklist,
} from '../../../src/loops/test-runner.js';
import { parsePulseReport } from '../../fixtures/loops-harness.js';

const TEST_TIMEOUT = 60_000;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`trs-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

interface Sandbox {
  root: string;
  rec: string;
  ghRec: string;
  opts: TestRunnerOptions;
}

function makeSandbox(label: string, fixture: { fixed?: boolean } = {}, extra: Partial<TestRunnerOptions> = {}): Sandbox {
  const root = tmp(`${label}-root`);
  const aux = tmp(`${label}-aux`);
  makeTestRunnerProject(root, fixture);
  gitCommitAll(root);
  const rec = path.join(aux, 'rec');
  const binDir = path.join(aux, 'bin');
  const claudeBin = combinedClaudeStub(binDir, rec);
  const ghRec = path.join(aux, 'gh-calls.txt');
  const ghBin = ghStub(binDir, ghRec);
  return {
    root,
    rec,
    ghRec,
    opts: {
      tiers: ['atomic'],
      trigger: 'manual',
      claudeBin,
      ghBin,
      tierCommands: { atomic: TIER_STUB_COMMAND },
      maxIterations: 2,
      timeoutMs: 20_000,
      now: new Date('2026-07-03T10:00:00.000Z'),
      ...extra,
    },
  };
}

function writeClassifier(rec: string, results: unknown[]): void {
  fs.mkdirSync(rec, { recursive: true });
  fs.writeFileSync(path.join(rec, 'classifier.out'), JSON.stringify(results) + '\n', 'utf-8');
}

const WRONG_RULE_RESULT = {
  testPath: SAMPLE_TEST_PATH,
  testName: SAMPLE_TEST_NAME,
  type: 'wrong-rule',
  severity: 'high',
  reasoning: 'the governing rule is wrong as written',
};

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf-8' });
}

function fixBranches(root: string): string[] {
  return git(root, ['branch', '--list', 'cortex/test-fix-*'])
    .split('\n')
    .map((l) => l.replace(/^[* ]+/, '').trim())
    .filter((l) => l !== '');
}

function bugFiles(root: string): string[] {
  const dir = path.join(root, '.cortex', 'cerebrum', 'bugs');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
}

function readReport(root: string): { kind: string | null; loop: string | null; body: string } {
  return parsePulseReport(path.join(root, '.cortex', 'pulse', TEST_FAILURES_REPORT_FILE));
}

// ===========================================================================
describe('AC1: Green tiers → clean report, zero side effects', () => {
  it(
    'clean tiers stated; no branch, no ledger entry, no PR; the tree snapshot is byte-identical',
    async () => {
      const sb = makeSandbox('green', { fixed: true });
      const before = snapshotWorkingTree(sb.root);
      const branchesBefore = fixBranches(sb.root);
      const bugsBefore = bugFiles(sb.root);

      const exit = await runTestRunner(sb.root, sb.opts);

      expect(exit).toBe(0);
      const report = readReport(sb.root);
      expect(report.kind).toBe('pulse-test-failures');
      expect(report.loop).toBe('cortex-loop-test-runner');
      expect(report.body).toContain('## Tier: atomic');
      expect(report.body).toContain('2 passed');
      expect(report.body).toContain('No harness-verified fixes this run.');
      expect(report.body).toContain('No budget-exhaustion case files this run.');
      expect(report.body).toContain('No suppressed failures this run.');
      expect(report.body).toContain('No unclassifiable failures this run.');

      expect(fixBranches(sb.root)).toEqual(branchesBefore);
      expect(bugFiles(sb.root)).toEqual(bugsBefore);
      expect(readGhCalls(sb.ghRec)).toEqual([]);
      expect(readCalls(sb.rec)).toEqual([]); // nothing to classify, nothing agentic
      expect(snapshotWorkingTree(sb.root)).toEqual(before);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('AC2: Verified fix → branch plus five-field PR body', () => {
  it(
    'branch cortex/test-fix-* carries exactly the harness diff; the captured PR body carries all five fields; tree byte-identical',
    async () => {
      const sb = makeSandbox('fix');
      writeClassifier(sb.rec, [WRONG_RULE_RESULT]);
      fs.writeFileSync(path.join(sb.rec, 'writer.sh'), REASONING_FIXING_WRITER_SH, 'utf-8');
      fs.writeFileSync(
        path.join(sb.rec, 'verifier.out'),
        'VERDICT: pass\nVERIFIER-SAYS: the diff satisfies the criterion.\n',
        'utf-8',
      );
      const before = snapshotWorkingTree(sb.root);
      const head = git(sb.root, ['rev-parse', 'HEAD']).trim();

      const exit = await runTestRunner(sb.root, sb.opts);
      expect(exit).toBe(0);

      // Branch exists with exactly the harness diff committed.
      const branches = fixBranches(sb.root);
      expect(branches).toHaveLength(1);
      const branch = branches[0] as string;
      expect(branch).toMatch(/^cortex\/test-fix-/);
      const changed = git(sb.root, ['diff', '--name-only', `${head}..${branch}`])
        .split('\n')
        .filter((l) => l.trim() !== '');
      expect(changed).toEqual(['target.txt']);
      expect(git(sb.root, ['show', `${branch}:target.txt`])).toBe('FIXED\n');

      // The captured PR body: all five contract fields + automated origin.
      const calls = readGhCalls(sb.ghRec);
      expect(calls).toHaveLength(1);
      const argv = calls[0] as string[];
      expect(argv.slice(0, 2)).toEqual(['pr', 'create']);
      const body = argv[argv.indexOf('--body') + 1] as string;
      expect(body).toContain(`**Spec:** ${SAMPLE_SPEC_ID}`);
      expect(body).toContain(`**Criterion:** ${SAMPLE_CRITERION}`);
      expect(body).toContain('WRITER-REASONING-DELTA');
      expect(body).toContain('VERIFIER-SAYS: the diff satisfies the criterion.');
      expect(body).toContain('trigger: manual');
      expect(body.toLowerCase()).toContain('automated');

      // Working tree byte-identical; report carries the fixed entry.
      expect(snapshotWorkingTree(sb.root)).toEqual(before);
      const report = readReport(sb.root);
      expect(report.body).toContain(`\`${SAMPLE_TEST_PATH}\``);
      expect(report.body).toContain(`branch \`${branch}\``);
    },
    TEST_TIMEOUT,
  );

  it(
    'push happens iff a remote exists: with a bare remote the branch arrives there',
    async () => {
      const sb = makeSandbox('push');
      const remote = tmp('push-remote');
      execFileSync('git', ['init', '--bare', '--quiet', remote]);
      git(sb.root, ['remote', 'add', 'origin', remote]);
      writeClassifier(sb.rec, [WRONG_RULE_RESULT]);
      fs.writeFileSync(path.join(sb.rec, 'writer.sh'), REASONING_FIXING_WRITER_SH, 'utf-8');

      const exit = await runTestRunner(sb.root, sb.opts);
      expect(exit).toBe(0);
      const branch = fixBranches(sb.root)[0] as string;
      const remoteRef = execFileSync('git', ['-C', remote, 'rev-parse', `refs/heads/${branch}`], {
        encoding: 'utf-8',
      }).trim();
      expect(remoteRef).toBe(git(sb.root, ['rev-parse', branch]).trim());
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('AC3: Budget exhaustion → case file, suppression armed, no PR', () => {
  it(
    'no push, gh never invoked; the ledger entry carries type, last diff, full rejection history, trigger context, affects',
    async () => {
      const sb = makeSandbox('exhaust');
      writeClassifier(sb.rec, [WRONG_RULE_RESULT]);
      fs.writeFileSync(path.join(sb.rec, 'writer.sh'), REASONING_FIXING_WRITER_SH, 'utf-8');
      // Harness stubs that always fail across the budget (maxIterations 2).
      fs.writeFileSync(
        path.join(sb.rec, 'verifier.out'),
        'VERDICT: fail\nVERIFIER-REJECTION-GAMMA: the change does not address the rule.\n',
        'utf-8',
      );
      const before = snapshotWorkingTree(sb.root);

      const exit = await runTestRunner(sb.root, sb.opts);
      expect(exit).toBe(0);

      expect(readGhCalls(sb.ghRec)).toEqual([]); // the gh stub was never invoked
      expect(fixBranches(sb.root)).toEqual([]); // nothing pushed or branched

      const bugs = bugFiles(sb.root);
      expect(bugs).toHaveLength(1);
      const raw = fs.readFileSync(path.join(sb.root, '.cortex', 'cerebrum', 'bugs', bugs[0] as string), 'utf-8');
      expect(bugs[0]).toMatch(/^B-001-/);
      expect(raw).toContain('type: wrong-rule');
      expect(raw).toContain('status: open');
      expect(raw).toContain(`"${SAMPLE_TEST_PATH}"`); // affects: the test path (arms Rule 3)
      expect(raw).toContain(`"${SAMPLE_SPEC_ID}"`); // affects: the traced spec
      expect(raw).toContain('+FIXED'); // the writer's LAST diff
      expect(raw).toContain('1. **fail** — VERIFIER-REJECTION-GAMMA'); // FULL verdict history
      expect(raw).toContain('2. **fail** — VERIFIER-REJECTION-GAMMA');
      expect(raw).toContain('tier `atomic`');
      expect(raw).toContain('trigger `manual`');
      expect(raw).toContain('Filed-by: cortex-loop-test-runner');

      const report = readReport(sb.root);
      expect(report.body).toContain('B-001'); // the report lists the case file
      expect(report.body).toContain('budget exhausted');
      expect(snapshotWorkingTree(sb.root)).toEqual(before);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('AC4: Open case file suppresses retries; resolution re-arms', () => {
  it(
    'while open: skipped with a notice, classifier and harness never invoked; after resolution: attempted again',
    async () => {
      const sb = makeSandbox('suppress');
      // Run 1 arms suppression via a real budget-exhaustion case file.
      writeClassifier(sb.rec, [WRONG_RULE_RESULT]);
      fs.writeFileSync(path.join(sb.rec, 'writer.sh'), REASONING_FIXING_WRITER_SH, 'utf-8');
      fs.writeFileSync(path.join(sb.rec, 'verifier.out'), 'VERDICT: fail\nStill wrong.\n', 'utf-8');
      await runTestRunner(sb.root, sb.opts);
      const bug = bugFiles(sb.root)[0] as string;
      expect(bug).toBeDefined();

      // Run 2 — the entry is open: zero classifier/harness invocations.
      const aux2 = tmp('suppress-aux2');
      const rec2 = path.join(aux2, 'rec2');
      const claude2 = combinedClaudeStub(path.join(aux2, 'bin'), rec2);
      const exit2 = await runTestRunner(sb.root, { ...sb.opts, claudeBin: claude2 });
      expect(exit2).toBe(0);
      expect(readCalls(rec2)).toEqual([]); // no classifier, no writer, no verifier
      const report2 = readReport(sb.root);
      expect(report2.body).toContain('### Suppressed');
      expect(report2.body).toContain('B-001');
      expect(report2.body).toContain('skipped');

      // Edit the entry to status: resolved → the next run attempts it again.
      const bugPath = path.join(sb.root, '.cortex', 'cerebrum', 'bugs', bug);
      fs.writeFileSync(bugPath, fs.readFileSync(bugPath, 'utf-8').replace('status: open', 'status: resolved'), 'utf-8');
      const aux3 = tmp('suppress-aux3');
      const rec3 = path.join(aux3, 'rec3');
      const claude3 = combinedClaudeStub(path.join(aux3, 'bin'), rec3);
      writeClassifier(rec3, [
        { testPath: SAMPLE_TEST_PATH, type: 'not-one-of-the-seven', reasoning: 'attempted again after resolution' },
      ]);
      const exit3 = await runTestRunner(sb.root, { ...sb.opts, claudeBin: claude3 });
      expect(exit3).toBe(0);
      const calls3 = readCalls(rec3);
      expect(calls3.map((c) => c.role)).toEqual(['classifier']); // re-armed: classified again
      expect(readReport(sb.root).body).toContain('attempted again after resolution');
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('AC5: Unclassifiable → report only', () => {
  it(
    'the report carries the failure and the classifier reasoning; no ledger entry, no fix attempt, no branch',
    async () => {
      const sb = makeSandbox('unclass');
      writeClassifier(sb.rec, [
        { testPath: SAMPLE_TEST_PATH, testName: SAMPLE_TEST_NAME, type: 'not-one-of-the-seven', reasoning: 'flaky: passes on immediate rerun' },
      ]);
      const exit = await runTestRunner(sb.root, sb.opts);
      expect(exit).toBe(0);

      const report = readReport(sb.root);
      expect(report.body).toContain(`\`${SAMPLE_TEST_PATH}\``);
      expect(report.body).toContain('flaky: passes on immediate rerun');
      expect(bugFiles(sb.root)).toEqual([]); // no bug filed
      expect(fixBranches(sb.root)).toEqual([]); // no branch
      expect(readGhCalls(sb.ghRec)).toEqual([]);
      // The classifier ran; the harness roles never did (no fix attempted).
      expect(readCalls(sb.rec).map((c) => c.role)).toEqual(['classifier']);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('AC6: gh unavailable degrades to branch + notice', () => {
  it(
    'the branch exists, the report notes the missing PR path, exit 0',
    async () => {
      const sb = makeSandbox('nogh', {}, { ghBin: '/nonexistent/gh-not-on-path' });
      writeClassifier(sb.rec, [WRONG_RULE_RESULT]);
      fs.writeFileSync(path.join(sb.rec, 'writer.sh'), REASONING_FIXING_WRITER_SH, 'utf-8');

      const exit = await runTestRunner(sb.root, sb.opts);
      expect(exit).toBe(0);
      expect(fixBranches(sb.root)).toHaveLength(1);
      const report = readReport(sb.root);
      expect(report.body).toContain('no PR');
      expect(report.body).toContain('`gh` not on PATH');
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('AC7: Empty tier stated', () => {
  it(
    '--tier journey on a project with no journey tests → the journey section states there is nothing to run, exit 0',
    async () => {
      const sb = makeSandbox('empty');
      const exit = await runTestRunner(sb.root, { ...sb.opts, tiers: ['journey'] });
      expect(exit).toBe(0);
      const report = readReport(sb.root);
      expect(report.body).toContain('## Tier: journey');
      expect(report.body).toContain('No journey tests exist — nothing to run this cycle.');
      expect(readCalls(sb.rec)).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('Skill flow: --collect then --fix-stage (Rule 10)', () => {
  it(
    'collect writes the worklist (trigger context, traced spec + criterion) and an interim report; fix-stage delivers the fix',
    async () => {
      const sb = makeSandbox('skillflow');
      // Stage 1 — collect (deterministic; no agentic touch at all).
      const exitCollect = await runTestRunner(sb.root, { ...sb.opts, collect: true });
      expect(exitCollect).toBe(0);
      expect(readCalls(sb.rec)).toEqual([]);
      const worklist = JSON.parse(
        fs.readFileSync(path.join(sb.root, '.cortex', 'pulse', TEST_WORKLIST_FILE), 'utf-8'),
      ) as TestWorklist;
      expect(worklist.kind).toBe('test-runner-worklist');
      expect(worklist.pending).toHaveLength(1);
      const pending = worklist.pending[0]!;
      expect(pending.testPath).toBe(SAMPLE_TEST_PATH);
      expect(pending.testName).toBe(SAMPLE_TEST_NAME);
      expect(pending.tier).toBe('atomic');
      expect(pending.trigger).toBe('manual');
      expect(pending.specId).toBe(SAMPLE_SPEC_ID);
      expect(pending.criterion).toBe(SAMPLE_CRITERION);
      expect(readReport(sb.root).body).toContain('Pending classification');

      // Stage 2 — the in-session judgment lands in a results file (scratchpad).
      const resultsFile = path.join(tmp('skillflow-scratch'), 'results.json');
      fs.writeFileSync(resultsFile, JSON.stringify([WRONG_RULE_RESULT]) + '\n', 'utf-8');
      fs.writeFileSync(path.join(sb.rec, 'writer.sh'), REASONING_FIXING_WRITER_SH, 'utf-8');

      // Stage 3 — fix-stage: harness → branch + PR, final report.
      const exitFix = await runTestRunner(sb.root, { ...sb.opts, fixStageFile: resultsFile });
      expect(exitFix).toBe(0);
      expect(fixBranches(sb.root)).toHaveLength(1);
      expect(readGhCalls(sb.ghRec)).toHaveLength(1);
      // The fix-stage classifier never runs headless — only harness roles.
      const roles = readCalls(sb.rec).map((c) => c.role);
      expect(roles).not.toContain('classifier');
      expect(roles.filter((r) => r === 'writer')).toHaveLength(1);
      expect(readReport(sb.root).body).not.toContain('Pending classification');
    },
    TEST_TIMEOUT,
  );

  it(
    '--no-llm bare mode degrades: worklist retained, report notes the skipped classification, exit 0',
    async () => {
      const sb = makeSandbox('nollm');
      const exit = await runTestRunner(sb.root, { ...sb.opts, noLlm: true });
      expect(exit).toBe(0);
      expect(fs.existsSync(path.join(sb.root, '.cortex', 'pulse', TEST_WORKLIST_FILE))).toBe(true);
      expect(readReport(sb.root).body).toContain('classification skipped (--no-llm)');
      expect(readCalls(sb.rec)).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});
