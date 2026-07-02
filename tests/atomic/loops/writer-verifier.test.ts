/**
 * Atomic tests — loops.writer-verifier (9 rules). Deterministic units first
 * (prompt assembly, verdict parsing, limit precedence — Rule 8: the harness's
 * own logic is deterministic Core code), then sandboxed integration checks of
 * the mechanics the spec file's ACs lean on (isolation strategy, gating,
 * unavailability). Stub `claude` binaries throughout; the real CLI and the
 * real ~/.claude are NEVER touched.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import {
  harnessStub,
  readInvocations,
  makeHarnessProject,
  gitCommitAll,
  writeHarnessConfig,
  sha256Tree,
  FIXING_WRITER_SH,
  HARNESS_TEST_COMMAND,
} from '../../fixtures/harness-stubs.js';
import {
  runWriterVerifier,
  buildWriterPrompt,
  buildVerifierPrompt,
  parseVerdict,
  resolveMaxIterations,
  sweepStaleWorkspaces,
  STALE_WORKSPACE_MS,
  RETRY_FLAG,
} from '../../../src/harness/run.js';
import { execFileSync } from 'child_process';

const TEST_TIMEOUT = 30_000;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`wv-atomic-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

// ===========================================================================
describe('Rule 3: writer prompt assembly (brief + check output + bare flag only)', () => {
  it('first iteration: brief and check output, no retry flag', () => {
    const p = buildWriterPrompt('THE-BRIEF', 'THE-CHECK-OUTPUT', false);
    expect(p).toContain('THE-BRIEF');
    expect(p).toContain('THE-CHECK-OUTPUT');
    expect(p).not.toContain(RETRY_FLAG);
  });

  it('retry: adds exactly the bare previous-attempt-failed-verification flag, once', () => {
    const p = buildWriterPrompt('THE-BRIEF', 'THE-CHECK-OUTPUT', true);
    expect(p.split(RETRY_FLAG).length - 1).toBe(1);
  });

  it('the writer prompt never contains the verifier verdict marker', () => {
    // The stub fixture routes roles on "VERDICT:" — this pins that contract.
    for (const retry of [false, true]) {
      expect(buildWriterPrompt('b', 'c', retry)).not.toContain('VERDICT:');
    }
  });
});

// ===========================================================================
describe('Rule 4: verifier prompt assembly (brief + diff + check results only)', () => {
  it('contains brief, diff, check results and the strict marker instruction', () => {
    const p = buildVerifierPrompt('THE-BRIEF', 'THE-DIFF', 'THE-CHECK-RESULTS');
    expect(p).toContain('THE-BRIEF');
    expect(p).toContain('THE-DIFF');
    expect(p).toContain('THE-CHECK-RESULTS');
    expect(p).toContain('VERDICT: pass');
    expect(p).toContain('VERDICT: fail');
  });
});

// ===========================================================================
describe('Rule 4: verdict parsing (strict marker; unparseable → conservative fail)', () => {
  it('parses VERDICT: pass with trailing reasoning', () => {
    expect(parseVerdict('VERDICT: pass\nBecause it satisfies the brief.')).toEqual({
      verdict: 'pass',
      reasoning: 'Because it satisfies the brief.',
    });
  });

  it('parses VERDICT: fail anywhere on its own line', () => {
    const v = parseVerdict('Preamble chatter.\nVERDICT: fail\nThe change is cosmetic.');
    expect(v.verdict).toBe('fail');
    expect(v.reasoning).toContain('cosmetic');
  });

  it('unparseable prose → fail with the raw response preserved', () => {
    const raw = 'It seems plausible that the change might be acceptable.';
    expect(parseVerdict(raw)).toEqual({ verdict: 'fail', reasoning: raw });
  });

  it('an inline mention (not on its own line) does not parse as a verdict', () => {
    const raw = 'I would not say VERDICT: pass is warranted here given the gaps.';
    expect(parseVerdict(raw).verdict).toBe('fail');
    expect(parseVerdict(raw).reasoning).toBe(raw);
  });
});

// ===========================================================================
describe('Rule 6: iteration limit precedence (param → config → 3)', () => {
  it('defaults to 3 with no config and no override', () => {
    const root = tmp('limit-default');
    expect(resolveMaxIterations(root)).toBe(3);
  });

  it('reads harness.maxIterations from cortex.config.json', () => {
    const root = tmp('limit-config');
    writeHarnessConfig(root, 5);
    expect(resolveMaxIterations(root)).toBe(5);
  });

  it('per-invocation override beats the config', () => {
    const root = tmp('limit-override');
    writeHarnessConfig(root, 5);
    expect(resolveMaxIterations(root, 1)).toBe(1);
  });

  it('unparseable config falls back to 3', () => {
    const root = tmp('limit-bad');
    fs.mkdirSync(path.join(root, '.cortex'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'cortex.config.json'), '{not json');
    expect(resolveMaxIterations(root)).toBe(3);
  });
});

// ===========================================================================
describe('Rule 2: isolation strategy selection and cleanup', () => {
  it(
    'non-git root → copy isolation; node_modules is not copied into the workspace',
    async () => {
      const root = tmp('copy-root');
      const aux = tmp('copy-aux');
      makeHarnessProject(root);
      // A node_modules poison pill: if it were copied, the writer stub would see it.
      fs.mkdirSync(path.join(root, 'node_modules', 'dep'), { recursive: true });
      fs.writeFileSync(path.join(root, 'node_modules', 'dep', 'big.js'), 'poison\n');
      const rec = path.join(aux, 'rec');
      const claudeBin = harnessStub(path.join(aux, 'bin'), rec);
      fs.writeFileSync(
        path.join(rec, 'writer.sh'),
        // Record whether node_modules made it into the workspace, then fix.
        'if [ -e node_modules/dep/big.js ]; then touch "' + path.join(aux, 'SAW-NODE-MODULES') + '"; fi\n' +
          FIXING_WRITER_SH,
      );
      fs.writeFileSync(path.join(rec, 'verifier.out'), 'VERDICT: pass\nOK.\n');

      const result = await runWriterVerifier({
        root,
        brief: 'fix it',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
      });

      expect(result.outcome).toBe('pass');
      expect(result.isolation).toBe('copy');
      expect(fs.existsSync(path.join(aux, 'SAW-NODE-MODULES'))).toBe(false);
      expect(fs.existsSync(result.workspacePath as string)).toBe(false);
      // The copy-mode diff (recursive file comparison) reflects the change.
      expect(result.diff).toContain('target.txt');
      expect(result.diff).toContain('+FIXED');
    },
    TEST_TIMEOUT,
  );

  it(
    'git root → worktree isolation; `git worktree list` shows no leftover entry',
    async () => {
      const root = tmp('wt-root');
      const aux = tmp('wt-aux');
      makeHarnessProject(root);
      gitCommitAll(root);
      const rec = path.join(aux, 'rec');
      const claudeBin = harnessStub(path.join(aux, 'bin'), rec);
      fs.writeFileSync(path.join(rec, 'writer.sh'), FIXING_WRITER_SH);
      fs.writeFileSync(path.join(rec, 'verifier.out'), 'VERDICT: pass\nOK.\n');

      const result = await runWriterVerifier({
        root,
        brief: 'fix it',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
      });

      expect(result.outcome).toBe('pass');
      expect(result.isolation).toBe('worktree');
      const { execFileSync } = await import('child_process');
      const list = execFileSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf-8' });
      expect(list).not.toContain(result.workspacePath as string);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('Rule 1: testCommand runs inside the workspace, not the root', () => {
  it(
    'check output feeding the writer comes from the workspace copy',
    async () => {
      const root = tmp('cwd-root');
      const aux = tmp('cwd-aux');
      makeHarnessProject(root);
      // A check that prints its own cwd — the writer prompt must carry the
      // WORKSPACE path, never the root path.
      fs.writeFileSync(path.join(root, 'check.sh'), '#!/bin/sh\necho "CWD-IS:$(pwd)"\nexit 1\n');
      const rec = path.join(aux, 'rec');
      const claudeBin = harnessStub(path.join(aux, 'bin'), rec);

      await runWriterVerifier({
        root,
        brief: 'fix it',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
        maxIterations: 1,
      });

      const writers = readInvocations(rec).filter((i) => i.role === 'writer');
      expect(writers.length).toBe(1);
      const m = /CWD-IS:(.*)/.exec(writers[0]!.prompt);
      expect(m).not.toBeNull();
      const checkCwd = m![1]!.trim();
      // The check ran in the (since-removed) temp workspace, not in root.
      expect(checkCwd).toContain('cortex-harness-');
      expect(checkCwd).not.toBe(fs.realpathSync(root));
      expect(checkCwd).not.toBe(root);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('Rule 5: gate order — checks fail → verifier never consulted', () => {
  it(
    'writer whose change fails checks → zero verifier invocations, synthesized fail reasoning names the gate',
    async () => {
      const root = tmp('gate-root');
      const aux = tmp('gate-aux');
      makeHarnessProject(root);
      const rec = path.join(aux, 'rec');
      const claudeBin = harnessStub(path.join(aux, 'bin'), rec);
      fs.writeFileSync(path.join(rec, 'writer.sh'), 'printf "nope\\n" > target.txt\n');

      const result = await runWriterVerifier({
        root,
        brief: 'fix it',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
        maxIterations: 1,
      });

      expect(result.outcome).toBe('fail');
      expect(readInvocations(rec).filter((i) => i.role === 'verifier').length).toBe(0);
      // Rule 9: even a gate-failed iteration leaves an audit entry.
      expect(result.verdicts.length).toBe(1);
      expect(result.verdicts[0]!.verdict).toBe('fail');
      expect(result.verdicts[0]!.reasoning).toContain('verifier not consulted');
      expect(result.verdicts[0]!.reasoning).toContain('HARNESS-CHECKS-FAIL');
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('Rule 7: unavailability is not failure', () => {
  it(
    'ENOENT claudeBin → unavailable, 0 iterations, no verdicts, no litter, main tree intact',
    async () => {
      const root = tmp('enoent-root');
      makeHarnessProject(root);
      const before = sha256Tree(root);

      const result = await runWriterVerifier({
        root,
        brief: 'fix it',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin: path.join(root, 'no-such-binary'),
      });

      expect(result.outcome).toBe('unavailable');
      expect(result.iterations).toBe(0);
      expect(result.verdicts).toEqual([]);
      expect(result.diff).toBe('');
      expect(result.detail).toMatch(/not found/);
      expect(fs.existsSync(result.workspacePath as string)).toBe(false);
      expect(sha256Tree(root)).toEqual(before);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
describe('Rule 9 (B-002): stale-workspace sweep', () => {
  function makeDirAgedMs(base: string, name: string, ageMs: number): string {
    const dir = path.join(base, name);
    fs.mkdirSync(path.join(dir, 'workspace'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'workspace', 'leftover.txt'), 'x\n');
    const t = new Date(Date.now() - ageMs);
    fs.utimesSync(dir, t, t);
    return dir;
  }

  it('removes cortex-harness-* dirs older than the threshold; keeps fresh and unrelated dirs', () => {
    const base = tmp('sweep-base');
    const root = tmp('sweep-root'); // non-git root: only the dir sweep applies
    const stale = makeDirAgedMs(base, 'cortex-harness-stale', STALE_WORKSPACE_MS + 60_000);
    const young = makeDirAgedMs(base, 'cortex-harness-young', 60_000);
    const unrelated = makeDirAgedMs(base, 'someone-elses-old-dir', STALE_WORKSPACE_MS + 60_000);

    sweepStaleWorkspaces(root, base);

    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(young)).toBe(true);
    expect(fs.existsSync(unrelated)).toBe(true);
  });

  it('prunes orphaned worktree registrations for root after removing the stale dir', () => {
    const root = tmp('sweep-git-root');
    const base = tmp('sweep-git-base');
    makeHarnessProject(root);
    gitCommitAll(root);
    const parent = path.join(base, 'cortex-harness-orphan');
    fs.mkdirSync(parent, { recursive: true });
    execFileSync('git', ['-C', root, 'worktree', 'add', '--detach', path.join(parent, 'workspace')], {
      stdio: 'ignore',
    });
    const t = new Date(Date.now() - STALE_WORKSPACE_MS - 60_000);
    fs.utimesSync(parent, t, t);

    sweepStaleWorkspaces(root, base);

    expect(fs.existsSync(parent)).toBe(false);
    const list = execFileSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf-8' });
    expect(list).not.toContain('cortex-harness-orphan');
  });

  it('is best-effort: a missing temp base and a non-git root never throw', () => {
    const root = tmp('sweep-safe-root');
    expect(() => sweepStaleWorkspaces(root, path.join(root, 'no-such-base'))).not.toThrow();
    expect(() => sweepStaleWorkspaces(root, tmp('sweep-safe-base'))).not.toThrow();
  });
});

// ===========================================================================
describe('Rule 10: the harness never discards a verdict', () => {
  it(
    'mixed run (gate fail, then verifier fail) → one audit entry per writer attempt, in order',
    async () => {
      const root = tmp('mixed-root');
      const aux = tmp('mixed-aux');
      makeHarnessProject(root);
      const rec = path.join(aux, 'rec');
      const claudeBin = harnessStub(path.join(aux, 'bin'), rec);
      // Writer fixes only on its second attempt (a first-attempt marker file
      // in the recording dir tells it which attempt this is).
      fs.writeFileSync(
        path.join(rec, 'writer.sh'),
        `if [ -e "${path.join(rec, 'attempted')}" ]; then printf "FIXED\\n" > target.txt; else touch "${path.join(rec, 'attempted')}"; printf "nope\\n" > target.txt; fi\n`,
      );
      fs.writeFileSync(path.join(rec, 'verifier.out'), 'VERDICT: fail\nVERIFIER-SAYS-NO\n');

      const result = await runWriterVerifier({
        root,
        brief: 'fix it',
        testCommand: HARNESS_TEST_COMMAND,
        claudeBin,
        maxIterations: 2,
      });

      expect(result.outcome).toBe('fail');
      expect(result.iterations).toBe(2);
      expect(result.verdicts.length).toBe(2);
      expect(result.verdicts[0]!.reasoning).toContain('verifier not consulted');
      expect(result.verdicts[1]!.reasoning).toBe('VERIFIER-SAYS-NO');
    },
    TEST_TIMEOUT,
  );
});
