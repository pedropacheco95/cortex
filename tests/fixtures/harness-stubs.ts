/**
 * Shared fixtures for the loops.writer-verifier tests (modelled on
 * tests/fixtures/init-harness.ts — record-invocation stubs, sandboxed tmp
 * dirs, the real ~/.claude is NEVER touched).
 *
 * One stub `claude` binary serves BOTH roles: the harness's verifier prompt
 * (and only the verifier prompt) contains the literal marker `VERDICT:`, so
 * the stub routes on it. Every invocation's full prompt is recorded to
 * `<recDir>/inv-N.prompt` with its role in `<recDir>/inv-N.role`, letting
 * tests assert exactly what each role was shown (the independence ACs).
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { writeExecutable } from './init-harness.js';

export interface RecordedInvocation {
  role: 'writer' | 'verifier';
  prompt: string;
}

/**
 * Stub claude that records every invocation and behaves per files the test
 * drops into `recDir`:
 *  - `writer.sh`   — run (cwd = workspace) on writer invocations, if present.
 *  - `verifier-N.out` — stdout for the Nth verifier invocation (1-based), else
 *  - `verifier.out`   — stdout for every verifier invocation, else
 *  - default: `VERDICT: pass` plus a reasoning line.
 */
export function harnessStub(binDir: string, recDir: string): string {
  fs.mkdirSync(recDir, { recursive: true });
  return writeExecutable(
    path.join(binDir, 'claude'),
    `#!/bin/sh
REC="${recDir}"
PROMPT="$2"
i=1
while [ -e "$REC/inv-$i.prompt" ]; do i=$((i+1)); done
printf '%s' "$PROMPT" > "$REC/inv-$i.prompt"
case "$PROMPT" in
  *"VERDICT:"*)
    printf 'verifier' > "$REC/inv-$i.role"
    v=0
    for f in "$REC"/inv-*.role; do
      [ -e "$f" ] || continue
      [ "$(cat "$f")" = "verifier" ] && v=$((v+1))
    done
    if [ -e "$REC/verifier-$v.out" ]; then cat "$REC/verifier-$v.out"
    elif [ -e "$REC/verifier.out" ]; then cat "$REC/verifier.out"
    else printf 'VERDICT: pass\\nLooks correct per the brief.\\n'
    fi
    ;;
  *)
    printf 'writer' > "$REC/inv-$i.role"
    if [ -e "$REC/writer.sh" ]; then sh "$REC/writer.sh"; fi
    ;;
esac
exit 0
`,
  );
}

/** Read back the recorded invocations, in order. */
export function readInvocations(recDir: string): RecordedInvocation[] {
  const out: RecordedInvocation[] = [];
  for (let i = 1; fs.existsSync(path.join(recDir, `inv-${i}.prompt`)); i++) {
    out.push({
      role: fs.readFileSync(path.join(recDir, `inv-${i}.role`), 'utf-8').trim() as 'writer' | 'verifier',
      prompt: fs.readFileSync(path.join(recDir, `inv-${i}.prompt`), 'utf-8'),
    });
  }
  return out;
}

/** Writer behavior: fixes the failing check (writes FIXED into target.txt). */
export const FIXING_WRITER_SH = 'printf "FIXED\\n" > target.txt\n';

/** Writer behavior: changes the tree but does NOT fix the check. */
export const NON_FIXING_WRITER_SH = 'printf "still broken\\n" > target.txt\n';

/** Writer behavior: fixes the check AND leaks reasoning on stdout (independence AC). */
export const MARKER_FIXING_WRITER_SH =
  'echo "WRITER-REASONING-BETA: I chose this approach because..."\nprintf "FIXED\\n" > target.txt\n';

/**
 * Seed a minimal harness-testable project: `target.txt` (broken) and
 * `check.sh`, whose output is the check feed for both roles.
 * testCommand for it: `sh check.sh`.
 */
export function makeHarnessProject(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'target.txt'), 'original content\n', 'utf-8');
  fs.writeFileSync(
    path.join(dir, 'check.sh'),
    `#!/bin/sh
if grep -q FIXED target.txt 2>/dev/null; then
  echo "HARNESS-CHECKS-PASS"
  exit 0
else
  echo "HARNESS-CHECKS-FAIL: target.txt lacks FIXED"
  exit 1
fi
`,
    'utf-8',
  );
}

export const HARNESS_TEST_COMMAND = 'sh check.sh';

/** Turn a fixture project into a git repo with everything committed. */
export function gitCommitAll(dir: string): void {
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync(
    'git',
    ['-c', 'user.name=harness-test', '-c', 'user.email=harness@test.invalid', 'commit', '--quiet', '-m', 'seed'],
    { cwd: dir },
  );
}

/** Write a `.cortex/cortex.config.json` carrying `harness.maxIterations`. */
export function writeHarnessConfig(dir: string, maxIterations: number): void {
  const cortexDir = path.join(dir, '.cortex');
  fs.mkdirSync(cortexDir, { recursive: true });
  fs.writeFileSync(
    path.join(cortexDir, 'cortex.config.json'),
    JSON.stringify({ schemaVersion: '1.0', harness: { maxIterations } }, null, 2) + '\n',
    'utf-8',
  );
}

/** sha256 snapshot of every file under `dir` (byte-identity assertions). */
export function sha256Tree(dir: string): Map<string, string> {
  const snap = new Map<string, string>();
  if (!fs.existsSync(dir)) return snap;
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const hash = createHash('sha256').update(fs.readFileSync(full)).digest('hex');
        snap.set(path.relative(dir, full), hash);
      }
    }
  };
  walk(dir);
  return snap;
}
