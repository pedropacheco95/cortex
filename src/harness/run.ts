/**
 * Writer/verifier sub-agent harness (spec loops.writer-verifier, 9 rules).
 *
 * Deterministic Core orchestrator (R-001: NO LLM calls from this process —
 * the two headless Claude CLI subprocesses are the only agentic touch).
 * Runs a writer role and an INDEPENDENT verifier role against an isolated
 * workspace; neither role ever sees the other's reasoning (Rules 3 & 4 —
 * the independence is the load-bearing property).
 *
 * The harness mutates ONLY the isolated workspace (git worktree when `root`
 * is a git repo, a temp copy otherwise) and always cleans it up. Consumers
 * receive a verdict + changeset (`HarnessResult`) and decide what to apply.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile, execFileSync } from 'child_process';
import { AUTH_FAILURE_PATTERN } from '../cli/claude-auth.js';

// ---------------------------------------------------------------------------
// public contract
// ---------------------------------------------------------------------------

export interface HarnessOptions {
  /** The project root the workspace is seeded from. Never mutated. */
  root: string;
  /** The requirement: spec excerpts + failing context. Consumer-supplied. */
  brief: string;
  /** The consumer's check, run via shell INSIDE the workspace (Rule 1). */
  testCommand: string;
  /** Iteration ceiling override (Rule 6 precedence: param → config → 3). */
  maxIterations?: number;
  /** Testability seam: the Claude CLI binary (default 'claude' on PATH). */
  claudeBin?: string;
  /** Per-role subprocess / check timeout (default 300000ms). */
  timeoutMs?: number;
  /** Testability seam: HOME for the spawned subprocesses (default inherited). */
  home?: string;
}

export interface HarnessVerdict {
  verdict: 'pass' | 'fail';
  /** The verifier's free-text reasoning — or, for iterations that never
   *  reached the verifier (checks gate, subprocess timeout/crash), a
   *  deterministic note saying why the verifier was not consulted (Rule 9:
   *  the audit trail never drops an iteration). */
  reasoning: string;
}

export interface HarnessResult {
  outcome: 'pass' | 'fail' | 'unavailable';
  /** Number of writer attempts that ran (Rule 6: the hard ceiling counts these). */
  iterations: number;
  /** The final change as a diff (empty when no change / unavailable). */
  diff: string;
  /** One entry per writer attempt, in order — full audit trail (Rule 9). */
  verdicts: HarnessVerdict[];
  /** For `unavailable`: names the condition (missing binary / authentication). */
  detail?: string;
  /** Audit extras: where the (now removed) workspace lived and which isolation
   *  strategy was used ('worktree' → `git -C <ws> diff`; 'copy' → recursive
   *  file comparison). */
  workspacePath?: string;
  isolation?: 'worktree' | 'copy';
}

const DEFAULT_MAX_ITERATIONS = 3;
const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_BUFFER = 16 * 1024 * 1024;

/** The bare retry flag — the ONLY verifier-derived signal a writer ever sees (Rule 3). */
export const RETRY_FLAG = 'Note: a previous attempt failed independent verification.';

/** Strict machine-parseable verdict marker the verifier is instructed to emit (Rule 4). */
const VERDICT_RE = /^\s*VERDICT:\s*(pass|fail)\b\s*$/im;

// ---------------------------------------------------------------------------
// prompts (deterministic assembly — Rule 8)
// ---------------------------------------------------------------------------

/** Writer prompt: brief + current check output (+ bare retry flag). NEVER verifier reasoning. */
export function buildWriterPrompt(brief: string, checkOutput: string, retry: boolean): string {
  return [
    'You are the writer role in an automated harness. Edit the files in the current working directory so the project satisfies the brief and its checks pass. Make the change directly on disk; do not ask questions.',
    ...(retry ? [RETRY_FLAG] : []),
    '## Brief',
    brief,
    '## Current check output',
    checkOutput,
  ].join('\n\n');
}

/** Verifier prompt: brief + diff + check results. NEVER writer stdout/reasoning/prompt. */
export function buildVerifierPrompt(brief: string, diff: string, checkOutput: string): string {
  return [
    'You are an independent reviewer in an automated harness. Judge ONLY whether the change below satisfies the brief. Your response MUST start with a single line reading exactly "VERDICT: pass" or "VERDICT: fail" (uppercase VERDICT, lowercase verdict), followed by your reasoning.',
    '## Brief',
    brief,
    '## Change (diff)',
    diff,
    '## Check results',
    checkOutput,
  ].join('\n\n');
}

/** Rule 4: unparseable → conservative fail with the raw response preserved as reasoning. */
export function parseVerdict(raw: string): HarnessVerdict {
  const m = VERDICT_RE.exec(raw);
  if (!m) return { verdict: 'fail', reasoning: raw };
  const verdict = (m[1] as string).toLowerCase() as 'pass' | 'fail';
  const reasoning = raw.slice((m.index ?? 0) + m[0].length).trim() || raw.trim();
  return { verdict, reasoning };
}

// ---------------------------------------------------------------------------
// iteration limit (Rule 6: param → cortex.config.json harness.maxIterations → 3)
// ---------------------------------------------------------------------------

export function resolveMaxIterations(root: string, override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override)) return Math.floor(override);
  try {
    const config = JSON.parse(
      fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const harness = config['harness'] as Record<string, unknown> | undefined;
    const fromConfig = harness?.['maxIterations'];
    if (typeof fromConfig === 'number' && Number.isFinite(fromConfig) && fromConfig >= 1) {
      return Math.floor(fromConfig);
    }
  } catch {
    /* missing/unparseable config → default */
  }
  return DEFAULT_MAX_ITERATIONS;
}

// ---------------------------------------------------------------------------
// subprocesses
// ---------------------------------------------------------------------------

interface SpawnOutcome {
  kind: 'ok' | 'no-binary' | 'timeout' | 'auth' | 'error';
  stdout: string;
  detail: string;
}

function subprocessEnv(home?: string): NodeJS.ProcessEnv {
  return home ? { ...process.env, HOME: home } : process.env;
}

/** Spawn the Claude CLI headless (core-cli.init Rule 6 boundary). */
function runClaude(bin: string, prompt: string, cwd: string, timeoutMs: number, home?: string): Promise<SpawnOutcome> {
  return new Promise((resolve) => {
    execFile(
      bin,
      ['-p', prompt],
      { cwd, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: MAX_BUFFER, env: subprocessEnv(home) },
      (error, stdout, stderr) => {
        const out = stdout ?? '';
        const combined = `${out}\n${stderr ?? ''}`;
        if (AUTH_FAILURE_PATTERN.test(combined)) {
          resolve({ kind: 'auth', stdout: out, detail: 'the Claude CLI reported it is not authenticated' });
          return;
        }
        if (!error) {
          resolve({ kind: 'ok', stdout: out, detail: '' });
          return;
        }
        const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string; code?: unknown };
        if (err.code === 'ENOENT') {
          resolve({ kind: 'no-binary', stdout: out, detail: `claude binary not found (${bin})` });
        } else if (err.killed || err.signal === 'SIGKILL' || err.signal === 'SIGTERM') {
          resolve({ kind: 'timeout', stdout: out, detail: `subprocess timed out after ${timeoutMs}ms` });
        } else {
          resolve({ kind: 'error', stdout: out, detail: `subprocess exited with code ${String(err.code ?? 'unknown')}` });
        }
      },
    );
  });
}

interface CheckResult {
  ok: boolean;
  output: string;
}

/** Run the consumer's check via shell inside the workspace, bounded (Rule 1). */
function runCheck(testCommand: string, cwd: string, timeoutMs: number): Promise<CheckResult> {
  return new Promise((resolve) => {
    execFile(
      '/bin/sh',
      ['-c', testCommand],
      { cwd, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: MAX_BUFFER },
      (error, stdout, stderr) => {
        let output = `${stdout ?? ''}${stderr ?? ''}`.trim();
        if (error) {
          const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
          if (err.killed || err.signal === 'SIGKILL') {
            output = `${output}\n(check command timed out after ${timeoutMs}ms)`.trim();
          }
        }
        resolve({ ok: !error, output });
      },
    );
  });
}

// ---------------------------------------------------------------------------
// isolated workspace (Rule 2)
// ---------------------------------------------------------------------------

interface Workspace {
  /** The directory the writer edits. */
  dir: string;
  /** The temp parent that owns it (removed on cleanup). */
  tmpParent: string;
  isolation: 'worktree' | 'copy';
}

function git(args: string[], allowExit1 = false): string {
  try {
    return execFileSync('git', args, { encoding: 'utf-8', maxBuffer: MAX_BUFFER, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    // `git diff` family exits 1 when differences exist — that is data, not failure.
    if (allowExit1 && err.status === 1 && typeof err.stdout === 'string') return err.stdout;
    throw e;
  }
}

function isGitRepo(root: string): boolean {
  return fs.existsSync(path.join(root, '.git'));
}

function createWorkspace(root: string): Workspace {
  const tmpParent = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-harness-'));
  const dir = path.join(tmpParent, 'workspace');

  if (isGitRepo(root)) {
    try {
      // Detached worktree at HEAD: writer edits never touch the main tree.
      git(['-C', root, 'worktree', 'add', '--detach', dir]);
      return { dir, tmpParent, isolation: 'worktree' };
    } catch {
      /* e.g. repo without commits — fall through to the copy strategy */
    }
  }

  fs.cpSync(root, dir, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      return base !== 'node_modules' && base !== '.git';
    },
  });
  return { dir, tmpParent, isolation: 'copy' };
}

/** ALWAYS runs (finally): no litter, pass or fail (Rules 2 & 7). */
function cleanupWorkspace(root: string, ws: Workspace): void {
  if (ws.isolation === 'worktree') {
    try {
      git(['-C', root, 'worktree', 'remove', '--force', ws.dir]);
    } catch {
      /* fall through to rm + prune */
    }
    try {
      git(['-C', root, 'worktree', 'prune']);
    } catch {
      /* best effort */
    }
  }
  fs.rmSync(ws.tmpParent, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// diff (Rule 2: the result carries the changeset; applying it is the consumer's call)
// ---------------------------------------------------------------------------

/** Worktree diff: `git -C <ws> diff` for tracked changes + `--no-index` for
 *  untracked files. Deliberately avoids `git add` so the shared object DB
 *  under root/.git stays byte-identical (Rule 2). */
function worktreeDiff(ws: string): string {
  const parts: string[] = [];
  const tracked = git(['-C', ws, 'diff'], true);
  if (tracked.trim()) parts.push(tracked);
  const status = git(['-C', ws, 'status', '--porcelain', '-uall'], true);
  for (const line of status.split('\n')) {
    if (!line.startsWith('?? ')) continue;
    const rel = line.slice(3).trim();
    if (!rel) continue;
    const added = git(['-C', ws, 'diff', '--no-index', '--', '/dev/null', rel], true);
    if (added.trim()) parts.push(added);
  }
  return parts.join('');
}

const COPY_EXCLUDES = new Set(['node_modules', '.git']);

function walkFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (COPY_EXCLUDES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full));
  }
  return out;
}

function readLines(file: string): string[] {
  const content = fs.readFileSync(file, 'utf-8');
  return content === '' ? [] : content.replace(/\n$/, '').split('\n');
}

/** Copy-mode diff: recursive file comparison root vs workspace, rendered as a
 *  unified-style full-file diff per changed path (added/removed/modified). */
function copyDiff(root: string, ws: string): string {
  const before = new Set(walkFiles(root));
  const after = new Set(walkFiles(ws));
  const all = [...new Set([...before, ...after])].sort();
  const parts: string[] = [];
  for (const rel of all) {
    const inBefore = before.has(rel);
    const inAfter = after.has(rel);
    const oldLines = inBefore ? readLines(path.join(root, rel)) : [];
    const newLines = inAfter ? readLines(path.join(ws, rel)) : [];
    if (inBefore && inAfter && oldLines.join('\n') === newLines.join('\n')) continue;
    parts.push(`--- ${inBefore ? `a/${rel}` : '/dev/null'}`);
    parts.push(`+++ ${inAfter ? `b/${rel}` : '/dev/null'}`);
    parts.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);
    for (const l of oldLines) parts.push(`-${l}`);
    for (const l of newLines) parts.push(`+${l}`);
  }
  return parts.length > 0 ? parts.join('\n') + '\n' : '';
}

function computeDiff(root: string, ws: Workspace): string {
  try {
    return ws.isolation === 'worktree' ? worktreeDiff(ws.dir) : copyDiff(root, ws.dir);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// the loop (Rules 5–7)
// ---------------------------------------------------------------------------

export async function runWriterVerifier(opts: HarnessOptions): Promise<HarnessResult> {
  const root = path.resolve(opts.root);
  const claudeBin = opts.claudeBin ?? 'claude';
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxIterations = resolveMaxIterations(root, opts.maxIterations);

  const ws = createWorkspace(root);
  const verdicts: HarnessVerdict[] = [];
  let iterations = 0;
  let diff = '';

  const unavailable = (detail: string): HarnessResult => ({
    outcome: 'unavailable',
    iterations,
    diff,
    verdicts,
    detail,
    workspacePath: ws.dir,
    isolation: ws.isolation,
  });

  try {
    // The writer's first "current check output" is the state of the checks as seeded.
    let check = await runCheck(opts.testCommand, ws.dir, timeoutMs);
    let retry = false;

    while (iterations < maxIterations) {
      // --- writer (Rule 3: brief + fresh check output + at most the bare retry flag) ---
      const writer = await runClaude(
        claudeBin,
        buildWriterPrompt(opts.brief, check.output, retry),
        ws.dir,
        timeoutMs,
        opts.home,
      );
      if (writer.kind === 'no-binary') return unavailable(writer.detail);
      if (writer.kind === 'auth') return unavailable(`authentication failure — ${writer.detail}`);

      iterations++; // a writer attempt happened (Rule 6 ceiling counts these)
      retry = true;

      if (writer.kind === 'timeout' || writer.kind === 'error') {
        // Rule 7: a crashed/hung role is a failed attempt; the loop continues.
        verdicts.push({
          verdict: 'fail',
          reasoning: `writer subprocess did not complete: ${writer.detail} (verifier not consulted)`,
        });
        check = await runCheck(opts.testCommand, ws.dir, timeoutMs);
        continue;
      }

      // --- checks gate first, cheaply (Rule 5) ---
      check = await runCheck(opts.testCommand, ws.dir, timeoutMs);
      if (!check.ok) {
        verdicts.push({
          verdict: 'fail',
          reasoning: `checks failed after the writer's change (verifier not consulted):\n${check.output}`,
        });
        continue;
      }

      // --- verifier (Rule 4: brief + diff + check results; never writer output) ---
      diff = computeDiff(root, ws);
      const verifier = await runClaude(
        claudeBin,
        buildVerifierPrompt(opts.brief, diff, check.output),
        ws.dir,
        timeoutMs,
        opts.home,
      );
      if (verifier.kind === 'no-binary') return unavailable(verifier.detail);
      if (verifier.kind === 'auth') return unavailable(`authentication failure — ${verifier.detail}`);
      if (verifier.kind === 'timeout' || verifier.kind === 'error') {
        verdicts.push({
          verdict: 'fail',
          reasoning: `verifier subprocess did not complete: ${verifier.detail}`,
        });
        continue;
      }

      const verdict = parseVerdict(verifier.stdout);
      verdicts.push(verdict);
      if (verdict.verdict === 'pass') {
        return {
          outcome: 'pass',
          iterations,
          diff,
          verdicts,
          workspacePath: ws.dir,
          isolation: ws.isolation,
        };
      }
      // Verifier fail → next iteration; `check.output` is already this iteration's
      // fresh (passing) check output for the writer's retry prompt.
    }

    // Ceiling reached (Rule 6): outcome fail with every verdict preserved (Rule 9).
    diff = computeDiff(root, ws);
    return {
      outcome: 'fail',
      iterations,
      diff,
      verdicts,
      workspacePath: ws.dir,
      isolation: ws.isolation,
    };
  } finally {
    cleanupWorkspace(root, ws);
  }
}
