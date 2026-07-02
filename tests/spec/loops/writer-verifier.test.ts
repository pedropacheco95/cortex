/**
 * Spec tests — loops.writer-verifier: ALL 10 acceptance criteria as labelled
 * describes. Every test runs against a sandboxed tmp project with a stub
 * `claude` binary (record-invocation, auth-fail, hanging) — the real Claude
 * CLI and the real ~/.claude are NEVER touched. The two independence ACs are
 * the load-bearing ones: they assert the recorded prompts LACK the other
 * role's reasoning markers.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp, authFailStub, hangingStub } from '../../fixtures/init-harness.js';
import {
  harnessStub,
  readInvocations,
  makeHarnessProject,
  gitCommitAll,
  writeHarnessConfig,
  sha256Tree,
  FIXING_WRITER_SH,
  NON_FIXING_WRITER_SH,
  MARKER_FIXING_WRITER_SH,
  HARNESS_TEST_COMMAND,
} from '../../fixtures/harness-stubs.js';
import { runWriterVerifier, RETRY_FLAG } from '../../../src/harness/run.js';

const TEST_TIMEOUT = 30_000;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`wv-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

interface Sandbox {
  root: string;
  rec: string;
  claudeBin: string;
}

function makeSandbox(label: string): Sandbox {
  const root = tmp(`${label}-root`);
  const aux = tmp(`${label}-aux`);
  makeHarnessProject(root);
  const rec = path.join(aux, 'rec');
  const claudeBin = harnessStub(path.join(aux, 'bin'), rec);
  return { root, rec, claudeBin };
}

// ===========================================================================
describe('AC: Independence — writer prompt carries no verifier reasoning', () => {
  it(
    'second writer prompt has brief + fresh check output, no VERDICT-REASONING-ALPHA, at most the bare flag',
    async () => {
      const { root, rec, claudeBin } = makeSandbox('indep-writer');
      fs.writeFileSync(path.join(rec, 'writer.sh'), FIXING_WRITER_SH);
      // Verifier fails iteration 1 with distinctive reasoning, passes iteration 2.
      fs.writeFileSync(path.join(rec, 'verifier-1.out'), 'VERDICT: fail\nVERDICT-REASONING-ALPHA: the change is cosmetic.\n');
      fs.writeFileSync(path.join(rec, 'verifier-2.out'), 'VERDICT: pass\nAccepted on retry.\n');

      const result = await runWriterVerifier({
        root,
        brief: 'BRIEF-TEXT: make target.txt contain FIXED',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
        maxIterations: 3,
      });

      expect(result.outcome).toBe('pass');
      expect(result.iterations).toBe(2);

      const writers = readInvocations(rec).filter((i) => i.role === 'writer');
      expect(writers.length).toBe(2);
      const second = writers[1]!.prompt;
      expect(second).toContain('BRIEF-TEXT');
      // Fresh check output: iteration 1's checks PASSED (verifier rejected it).
      expect(second).toContain('HARNESS-CHECKS-PASS');
      // The load-bearing assertion: no verifier reasoning ever reaches the writer.
      expect(second).not.toContain('VERDICT-REASONING-ALPHA');
      // At most the bare previous-attempt-failed-verification flag.
      expect(second).toContain(RETRY_FLAG);
      // And the first writer prompt carried no flag at all.
      expect(writers[0]!.prompt).not.toContain(RETRY_FLAG);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('AC: Independence — verifier prompt carries no writer reasoning', () => {
  it(
    'verifier prompt has brief, diff, check results — not WRITER-REASONING-BETA from writer stdout',
    async () => {
      const { root, rec, claudeBin } = makeSandbox('indep-verifier');
      fs.writeFileSync(path.join(rec, 'writer.sh'), MARKER_FIXING_WRITER_SH);
      fs.writeFileSync(path.join(rec, 'verifier.out'), 'VERDICT: pass\nFine.\n');

      const result = await runWriterVerifier({
        root,
        brief: 'BRIEF-TEXT: make target.txt contain FIXED',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
      });
      expect(result.outcome).toBe('pass');

      const verifiers = readInvocations(rec).filter((i) => i.role === 'verifier');
      expect(verifiers.length).toBe(1);
      const prompt = verifiers[0]!.prompt;
      expect(prompt).toContain('BRIEF-TEXT');
      expect(prompt).toContain('FIXED'); // the diff reflects the change
      expect(prompt).toContain('HARNESS-CHECKS-PASS'); // the check results
      // The load-bearing assertion: writer stdout/reasoning never reaches the verifier.
      expect(prompt).not.toContain('WRITER-REASONING-BETA');
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('AC: First-iteration pass', () => {
  it(
    'fixing writer + passing verifier → outcome pass, iterations 1, one call each, non-empty diff',
    async () => {
      const { root, rec, claudeBin } = makeSandbox('first-pass');
      fs.writeFileSync(path.join(rec, 'writer.sh'), FIXING_WRITER_SH);
      fs.writeFileSync(path.join(rec, 'verifier.out'), 'VERDICT: pass\nThe change satisfies the brief.\n');

      const result = await runWriterVerifier({
        root,
        brief: 'make target.txt contain FIXED',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
      });

      expect(result.outcome).toBe('pass');
      expect(result.iterations).toBe(1);
      expect(result.diff.length).toBeGreaterThan(0);
      expect(result.diff).toContain('FIXED');
      expect(result.verdicts).toEqual([{ verdict: 'pass', reasoning: 'The change satisfies the brief.' }]);

      const invocations = readInvocations(rec);
      expect(invocations.filter((i) => i.role === 'writer').length).toBe(1);
      expect(invocations.filter((i) => i.role === 'verifier').length).toBe(1);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('AC: Checks gate before the verifier', () => {
  it(
    'writer change that still fails testCommand → verifier NOT invoked, loop proceeds to next attempt',
    async () => {
      const { root, rec, claudeBin } = makeSandbox('gate');
      fs.writeFileSync(path.join(rec, 'writer.sh'), NON_FIXING_WRITER_SH);

      const result = await runWriterVerifier({
        root,
        brief: 'make target.txt contain FIXED',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
        maxIterations: 2,
      });

      expect(result.outcome).toBe('fail');
      expect(result.iterations).toBe(2); // the loop proceeded past iteration 1
      const invocations = readInvocations(rec);
      expect(invocations.filter((i) => i.role === 'writer').length).toBe(2);
      expect(invocations.filter((i) => i.role === 'verifier').length).toBe(0);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('AC: Iteration limit honored, config precedence respected', () => {
  it(
    'config harness.maxIterations: 2, no override → exactly 2 writer attempts, fail with 2 verdicts',
    async () => {
      const { root, rec, claudeBin } = makeSandbox('limit-config');
      writeHarnessConfig(root, 2);
      fs.writeFileSync(path.join(rec, 'writer.sh'), FIXING_WRITER_SH);
      fs.writeFileSync(path.join(rec, 'verifier.out'), 'VERDICT: fail\nNot convinced.\n');

      const result = await runWriterVerifier({
        root,
        brief: 'make target.txt contain FIXED',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
      });

      expect(result.outcome).toBe('fail');
      expect(result.iterations).toBe(2);
      expect(result.verdicts.length).toBe(2);
      expect(readInvocations(rec).filter((i) => i.role === 'writer').length).toBe(2);
    },
    TEST_TIMEOUT,
  );

  it(
    'per-invocation maxIterations: 1 override beats the same config → exactly 1 attempt',
    async () => {
      const { root, rec, claudeBin } = makeSandbox('limit-override');
      writeHarnessConfig(root, 2);
      fs.writeFileSync(path.join(rec, 'writer.sh'), FIXING_WRITER_SH);
      fs.writeFileSync(path.join(rec, 'verifier.out'), 'VERDICT: fail\nNot convinced.\n');

      const result = await runWriterVerifier({
        root,
        brief: 'make target.txt contain FIXED',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
        maxIterations: 1,
      });

      expect(result.outcome).toBe('fail');
      expect(result.iterations).toBe(1);
      expect(result.verdicts.length).toBe(1);
      expect(readInvocations(rec).filter((i) => i.role === 'writer').length).toBe(1);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('AC: Main tree is never mutated', () => {
  it(
    'passing run: every file under root is byte-identical (sha256 tree) and the workspace is gone',
    async () => {
      const { root, rec, claudeBin } = makeSandbox('immutable-pass');
      fs.writeFileSync(path.join(rec, 'writer.sh'), FIXING_WRITER_SH);
      fs.writeFileSync(path.join(rec, 'verifier.out'), 'VERDICT: pass\nGood.\n');

      const before = sha256Tree(root);
      const result = await runWriterVerifier({
        root,
        brief: 'make target.txt contain FIXED',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
      });
      const after = sha256Tree(root);

      expect(result.outcome).toBe('pass');
      expect(after).toEqual(before);
      expect(fs.readFileSync(path.join(root, 'target.txt'), 'utf-8')).toBe('original content\n');
      expect(result.workspacePath).toBeTruthy();
      expect(fs.existsSync(result.workspacePath as string)).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'failing run on a git repo: root (including .git/) is byte-identical and the worktree is gone',
    async () => {
      const { root, rec, claudeBin } = makeSandbox('immutable-fail');
      gitCommitAll(root);
      fs.writeFileSync(path.join(rec, 'writer.sh'), FIXING_WRITER_SH);
      fs.writeFileSync(path.join(rec, 'verifier.out'), 'VERDICT: fail\nNo.\n');

      const before = sha256Tree(root);
      const result = await runWriterVerifier({
        root,
        brief: 'make target.txt contain FIXED',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
        maxIterations: 1,
      });
      const after = sha256Tree(root);

      expect(result.outcome).toBe('fail');
      expect(after).toEqual(before);
      expect(fs.existsSync(result.workspacePath as string)).toBe(false);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('AC: Worktree isolation on a git repo', () => {
  it(
    'root is a git repo → workspace was a git worktree (removed afterwards), diff reflects the change',
    async () => {
      const { root, rec, claudeBin } = makeSandbox('worktree');
      gitCommitAll(root);
      fs.writeFileSync(path.join(rec, 'writer.sh'), FIXING_WRITER_SH);
      fs.writeFileSync(path.join(rec, 'verifier.out'), 'VERDICT: pass\nGood.\n');

      const result = await runWriterVerifier({
        root,
        brief: 'make target.txt contain FIXED',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
      });

      expect(result.outcome).toBe('pass');
      expect(result.isolation).toBe('worktree');
      // A real `git diff` of the writer's change to the tracked file.
      expect(result.diff).toContain('target.txt');
      expect(result.diff).toContain('+FIXED');
      expect(result.diff).toContain('-original content');
      // Removed afterwards: no worktree registered, no directory left.
      expect(fs.existsSync(result.workspacePath as string)).toBe(false);
      const worktreesDir = path.join(root, '.git', 'worktrees');
      if (fs.existsSync(worktreesDir)) {
        expect(fs.readdirSync(worktreesDir)).toEqual([]);
      }
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('AC: Unavailable is distinct from fail', () => {
  it(
    'no claudeBin → outcome unavailable, iterations 0, no verdicts, no workspace left behind',
    async () => {
      const root = tmp('unavail-root');
      makeHarnessProject(root);

      const result = await runWriterVerifier({
        root,
        brief: 'make target.txt contain FIXED',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin: path.join(root, 'definitely-not-a-real-claude-binary'),
      });

      expect(result.outcome).toBe('unavailable');
      expect(result.iterations).toBe(0);
      expect(result.verdicts).toEqual([]);
      expect(fs.existsSync(result.workspacePath as string)).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'auth-failing stub → outcome unavailable naming authentication',
    async () => {
      const root = tmp('unavail-auth-root');
      const aux = tmp('unavail-auth-aux');
      makeHarnessProject(root);
      const claudeBin = authFailStub(path.join(aux, 'bin'));

      const result = await runWriterVerifier({
        root,
        brief: 'make target.txt contain FIXED',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
      });

      expect(result.outcome).toBe('unavailable');
      expect(result.detail).toMatch(/auth/i);
      expect(fs.existsSync(result.workspacePath as string)).toBe(false);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('AC: Unparseable verdict is a conservative fail', () => {
  it(
    'verifier prose with no parseable verdict → fail, raw response preserved as reasoning',
    async () => {
      const { root, rec, claudeBin } = makeSandbox('unparseable');
      fs.writeFileSync(path.join(rec, 'writer.sh'), FIXING_WRITER_SH);
      const prose = 'I feel broadly positive about this change but decline to commit to a verdict.\n';
      fs.writeFileSync(path.join(rec, 'verifier.out'), prose);

      const result = await runWriterVerifier({
        root,
        brief: 'make target.txt contain FIXED',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
        maxIterations: 1,
      });

      expect(result.outcome).toBe('fail');
      expect(result.verdicts.length).toBe(1);
      expect(result.verdicts[0]!.verdict).toBe('fail');
      expect(result.verdicts[0]!.reasoning).toContain('decline to commit to a verdict');
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('AC: Full audit trail on failure', () => {
  it(
    'three failing iterations → outcome fail with three verdicts in order, each with its reasoning',
    async () => {
      const { root, rec, claudeBin } = makeSandbox('audit');
      fs.writeFileSync(path.join(rec, 'writer.sh'), FIXING_WRITER_SH);
      fs.writeFileSync(path.join(rec, 'verifier-1.out'), 'VERDICT: fail\nREASON-ONE\n');
      fs.writeFileSync(path.join(rec, 'verifier-2.out'), 'VERDICT: fail\nREASON-TWO\n');
      fs.writeFileSync(path.join(rec, 'verifier-3.out'), 'VERDICT: fail\nREASON-THREE\n');

      const result = await runWriterVerifier({
        root,
        brief: 'make target.txt contain FIXED',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
        maxIterations: 3,
      });

      expect(result.outcome).toBe('fail');
      expect(result.iterations).toBe(3);
      expect(result.verdicts).toEqual([
        { verdict: 'fail', reasoning: 'REASON-ONE' },
        { verdict: 'fail', reasoning: 'REASON-TWO' },
        { verdict: 'fail', reasoning: 'REASON-THREE' },
      ]);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('Rule 7: per-role timeout is a failed attempt, the loop continues', () => {
  it(
    'hanging writer stub with a tight timeoutMs → fail after the ceiling, main tree untouched',
    async () => {
      const root = tmp('hang-root');
      const aux = tmp('hang-aux');
      makeHarnessProject(root);
      const claudeBin = hangingStub(path.join(aux, 'bin'));

      const before = sha256Tree(root);
      const result = await runWriterVerifier({
        root,
        brief: 'make target.txt contain FIXED',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
        timeoutMs: 400,
        maxIterations: 2,
      });

      expect(result.outcome).toBe('fail');
      expect(result.iterations).toBe(2); // the loop continued past the first timeout
      expect(result.verdicts.length).toBe(2);
      expect(result.verdicts[0]!.reasoning).toMatch(/timed out/);
      expect(sha256Tree(root)).toEqual(before);
    },
    TEST_TIMEOUT,
  );
});
