/**
 * Spec-level tests — cross-hook dispatch alignment. The per-leaf AC suites
 * live in their own files (session-start.test.ts, pre-write.test.ts,
 * post-write.test.ts, pre-read.test.ts, post-read.test.ts per the schema §3
 * one-file-per-leaf convention); this file keeps only the shared contract:
 * `cortex hook <name>` handles exactly the command names init registers, and
 * unknown names never fail the user's session.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { runHook } from '../../../src/hooks/cli.js';
import { readHookErrorEntries } from '../../../src/hooks/errors.js';
import { makeTmpDir, cleanTmp, makeCortexProject } from '../../fixtures/hooks-harness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`spec-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function stdinJson(fields: Record<string, unknown>): string {
  return JSON.stringify({ session_id: 'spec-session', ...fields });
}

describe('cortex hook dispatch matches the init-registered command names', () => {
  it('all seven registered names are handled with exit 0; unknown names stay silent', async () => {
    const root = tmp('dispatch');
    makeCortexProject(root);
    // Registered command suffixes per core-cli.init Rule 11 / hooks.* Rule 1:
    const registered = ['session-start', 'pre-write', 'post-write'];
    for (const name of registered) {
      const result = await runHook(name, stdinJson({ cwd: root, tool_input: {} }));
      expect(result.exitCode).toBe(0);
    }
    // pre-read is implemented but self-gates on hooks.preRead (false in this
    // fixture's config) → silent; post-read fires but the fixture has no
    // transcript_path, so it degrades to silence (insight module present):
    expect(await runHook('pre-read', stdinJson({ cwd: root }))).toEqual({ exitCode: 0, stdout: '' });
    expect(await runHook('post-read', stdinJson({ cwd: root }))).toEqual({ exitCode: 0, stdout: '' });
    // session-end and stop (hooks.session-end Rule 1): both dispatch and stay
    // silent — stop has no last_assistant_message here, session-end no
    // transcript_path (it logs one degradation entry and writes no record).
    expect(await runHook('stop', stdinJson({ cwd: root }))).toEqual({ exitCode: 0, stdout: '' });
    expect(await runHook('session-end', stdinJson({ cwd: root }))).toEqual({ exitCode: 0, stdout: '' });
    expect(readHookErrorEntries(root).some((e) => e.startsWith('- hook: session-end |'))).toBe(true);
    expect(await runHook('nonsense', 'not even json')).toEqual({ exitCode: 0, stdout: '' });
  });
});
