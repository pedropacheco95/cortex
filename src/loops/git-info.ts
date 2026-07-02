/**
 * Shared read-only git queries for the deterministic loops (pulse.hygiene,
 * loops.spec-drift, loops.rule-decay). All git access goes through
 * `execFile('git', …)` — observing local history and refs is reading, never
 * egress (pulse.hygiene Rule 6). Deterministic Core (R-001): no LLM, no
 * mutation.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

const MAX_BUFFER = 16 * 1024 * 1024;

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** True when the binary itself was not found (ENOENT). */
  missing: boolean;
}

/** Cheap repo detection (same test the harness uses). */
export function isGitRepo(root: string): boolean {
  return fs.existsSync(path.join(root, '.git'));
}

/** Run a read-only git command against `root`; never throws. */
export function gitExec(root: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', root, ...args],
      { maxBuffer: MAX_BUFFER },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ ok: true, stdout: stdout ?? '', stderr: stderr ?? '', missing: false });
          return;
        }
        const err = error as NodeJS.ErrnoException;
        resolve({
          ok: false,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          missing: err.code === 'ENOENT',
        });
      },
    );
  });
}

/**
 * Last-commit time (unix seconds) of a project-relative path, or null when
 * the path has no git history (untracked file, or `root` is not a repo).
 */
export async function gitLastCommitEpoch(root: string, relPath: string): Promise<number | null> {
  const res = await gitExec(root, ['log', '-1', '--format=%ct', '--', relPath]);
  if (!res.ok) return null;
  const trimmed = res.stdout.trim();
  if (trimmed === '') return null;
  const epoch = Number(trimmed);
  return Number.isFinite(epoch) ? epoch : null;
}
