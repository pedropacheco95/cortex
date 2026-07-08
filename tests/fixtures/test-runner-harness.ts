/**
 * Shared fixtures for the loops.test-runner tests (modelled on
 * tests/fixtures/harness-stubs.ts — record-invocation stubs, sandboxed tmp
 * dirs and fake homes; the real repo, the real ~/.claude, and the network are
 * NEVER touched).
 *
 * One combined stub `claude` binary serves all THREE agentic touches the
 * loop can spawn in bare mode: the verifier prompt (and only it) contains
 * the literal `VERDICT:` marker; the classifier prompt (and only it)
 * contains `Classify the failing tests`; everything else is the writer.
 * A separate capturing `gh` stub records every argv — tests assert the PR
 * body without any network.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { writeExecutable } from './init-harness.js';

export interface RecordedCall {
  role: 'writer' | 'verifier' | 'classifier';
  prompt: string;
}

/**
 * Combined claude stub. Behaviour files the test drops into `recDir`:
 *  - `writer.sh`        — run (cwd = harness workspace) on writer turns.
 *  - `verifier-N.out`   — stdout for the Nth verifier turn (1-based), else
 *  - `verifier.out`     — stdout for every verifier turn, else default pass.
 *  - `classifier.out`   — stdout for classifier turns (default `[]`).
 */
export function combinedClaudeStub(binDir: string, recDir: string): string {
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
  *"Classify the failing tests"*)
    printf 'classifier' > "$REC/inv-$i.role"
    if [ -e "$REC/classifier.out" ]; then cat "$REC/classifier.out"; else printf '[]\\n'; fi
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

/** Read back the recorded claude invocations, in order. */
export function readCalls(recDir: string): RecordedCall[] {
  const out: RecordedCall[] = [];
  for (let i = 1; fs.existsSync(path.join(recDir, `inv-${i}.prompt`)); i++) {
    out.push({
      role: fs.readFileSync(path.join(recDir, `inv-${i}.role`), 'utf-8').trim() as RecordedCall['role'],
      prompt: fs.readFileSync(path.join(recDir, `inv-${i}.prompt`), 'utf-8'),
    });
  }
  return out;
}

const ARG_SEP = '\n<<<ARG>>>\n';
const CALL_SEP = '<<<CALL>>>\n';

/** Capturing gh stub: records every argv verbatim, prints a fake PR URL. */
export function ghStub(binDir: string, recFile: string): string {
  fs.mkdirSync(path.dirname(recFile), { recursive: true });
  return writeExecutable(
    path.join(binDir, 'gh'),
    `#!/bin/sh
REC="${recFile}"
for a in "$@"; do
  printf '%s' "$a" >> "$REC"
  printf '\\n<<<ARG>>>\\n' >> "$REC"
done
printf '<<<CALL>>>\\n' >> "$REC"
echo "https://example.invalid/pr/1"
exit 0
`,
  );
}

/** Read back the captured gh calls (argv arrays, in order). */
export function readGhCalls(recFile: string): string[][] {
  if (!fs.existsSync(recFile)) return [];
  return fs
    .readFileSync(recFile, 'utf-8')
    .split(CALL_SEP)
    .filter((chunk) => chunk.trim() !== '')
    .map((chunk) => {
      const args = chunk.split(ARG_SEP);
      // The final separator leaves a trailing empty element.
      if (args[args.length - 1] === '') args.pop();
      return args;
    });
}

export const SAMPLE_TEST_PATH = 'tests/atomic/demo/sample.test.ts';
export const SAMPLE_TEST_NAME = 'demo capability > asserts the sample rule holds';
export const SAMPLE_SPEC_ID = 'demo.sample';
export const SAMPLE_CRITERION = 'Sample rule holds';
export const TIER_STUB_COMMAND = 'sh tier-atomic.sh';

/** Writer behaviour: fixes the tier check and emits reasoning on stdout. */
export const REASONING_FIXING_WRITER_SH =
  'echo "WRITER-REASONING-DELTA: tightened the rule per the criterion."\nprintf "FIXED\\n" > target.txt\n';

/**
 * A minimal test-runner-able project: a synthetic failing vitest file, the
 * dev spec it traces to (§3 path convention: tests/atomic/demo/sample.test.ts
 * → .specflow/specs/demo/sample.spec.md), a `.cortex` skeleton, `target.txt`, and a
 * tier stub script `tier-atomic.sh` that emits vitest-shaped output — failing
 * until target.txt contains FIXED. Pass `fixed: true` for green tiers.
 */
export function makeTestRunnerProject(root: string, opts: { fixed?: boolean } = {}): void {
  fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'cerebrum', 'bugs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.cortex', 'cortex.config.json'),
    JSON.stringify({ schemaVersion: '1.0' }, null, 2) + '\n',
    'utf-8',
  );

  const testDir = path.join(root, 'tests', 'atomic', 'demo');
  fs.mkdirSync(testDir, { recursive: true });
  fs.writeFileSync(
    path.join(testDir, 'sample.test.ts'),
    [
      "import { describe, it, expect } from 'vitest';",
      '',
      "describe('demo capability', () => {",
      "  it('asserts the sample rule holds', () => {",
      '    expect(false).toBe(true); // synthetic failure',
      '  });',
      '});',
      '',
    ].join('\n'),
    'utf-8',
  );

  const specDir = path.join(root, '.specflow', 'specs', 'demo');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, 'sample.spec.md'),
    [
      '---',
      `id: ${SAMPLE_SPEC_ID}`,
      'status: draft',
      'governs:',
      '  - "tests/atomic/demo/**"',
      '---',
      '',
      '# Sample spec',
      '',
      '## Intent',
      '',
      'The sample capability keeps target.txt fixed.',
      '',
      '## Rules',
      '',
      '1. target.txt MUST contain FIXED.',
      '',
      '## Acceptance Criteria',
      '',
      `### ${SAMPLE_CRITERION}`,
      '',
      '- **Given** the project',
      '- **When** the check runs',
      '- **Then** target.txt contains FIXED',
      '',
      '### Unrelated criterion',
      '',
      '- **Given** something else entirely',
      '',
    ].join('\n'),
    'utf-8',
  );

  fs.writeFileSync(path.join(root, 'target.txt'), opts.fixed ? 'FIXED\n' : 'original content\n', 'utf-8');
  fs.writeFileSync(
    path.join(root, 'tier-atomic.sh'),
    `#!/bin/sh
if grep -q FIXED target.txt 2>/dev/null; then
  echo " Test Files  1 passed (1)"
  echo "      Tests  2 passed (2)"
  exit 0
else
  echo "FAIL-BANNER Failed Tests 1"
  echo " FAIL  ${SAMPLE_TEST_PATH} > ${SAMPLE_TEST_NAME}"
  echo "AssertionError: expected false to be true"
  echo " Test Files  1 failed (1)"
  echo "      Tests  1 failed | 1 passed (2)"
  exit 1
fi
`,
    'utf-8',
  );
}

const SNAPSHOT_EXCLUDES = new Set(['.git', '.cortex', 'node_modules']);

/** sha256 snapshot of the checked-out WORKING tree — excludes `.git` (branch
 *  refs are sanctioned) and `.cortex` (pulse/ledger are sanctioned writes). */
export function snapshotWorkingTree(dir: string): Map<string, string> {
  const snap = new Map<string, string>();
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (SNAPSHOT_EXCLUDES.has(entry.name)) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        snap.set(path.relative(dir, full), createHash('sha256').update(fs.readFileSync(full)).digest('hex'));
      }
    }
  };
  walk(dir);
  return snap;
}
