/**
 * Spec-level tests — hooks.session-start (split from the combined
 * tests/spec/hooks/hooks.test.ts per the schema §3 one-file-per-leaf
 * convention; describe blocks moved verbatim, zero behavioural change).
 *
 * End-to-end over tmp fixture projects driven through the `cortex hook
 * <name>` dispatch (runHook) with raw stdin JSON, exactly as Claude Code
 * invokes them. One describe per spec AC, plus the dispatch-alignment
 * describe shared across the three hooks.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runHook } from '../../../src/hooks/cli.js';
import { run as runSessionStart } from '../../../src/hooks/session-start.js';
import { scan } from '../../../src/anatomy/scan.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeHygieneReport,
  hookErrorsPath,
  parseEnvelope,
  isoHoursAgo,
} from '../../fixtures/hooks-harness.js';

const TEST_TIMEOUT = 30_000;
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

/** Scanned fixture: real src files + a real files.md written by the scanner. */
async function makeScannedProject(label: string): Promise<string> {
  const root = tmp(label);
  makeCortexProject(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'a.ts'),
    '/** Handles the A concern for the fixture project. */\nexport const a = 1;\n',
  );
  fs.writeFileSync(
    path.join(root, 'src', 'b.ts'),
    '/** Handles the B concern for the fixture project. */\nexport const b = 2;\n',
  );
  await scan(root);
  return root;
}

describe('AC session-start.1: fresh hygiene report → pointer plus one-line summary', () => {
  it(
    'generated 3 hours ago → pointer, modules, and a hygiene line naming the report',
    async () => {
      const root = await makeScannedProject('ss1');
      writeHygieneReport(root, isoHoursAgo(3, new Date()), '3 stale purposes flagged.');
      const { exitCode, stdout } = await runHook(
        'session-start',
        stdinJson({ hook_event_name: 'SessionStart', source: 'startup', cwd: root }),
      );
      expect(exitCode).toBe(0);
      const env = parseEnvelope(stdout);
      expect(env.hookEventName).toBe('SessionStart');
      expect(env.additionalContext).toContain('Cortex is active');
      expect(env.additionalContext).toContain('.cortex/_index.md');
      expect(env.additionalContext).toContain('Modules: anatomy, compass, atlas, pulse.');
      expect(env.additionalContext).toContain('Hygiene: 3 stale purposes flagged.');
      expect(env.additionalContext).toContain('.cortex/pulse/hygiene-report.md');
    },
    TEST_TIMEOUT,
  );
});

describe('AC session-start.2: stale report → pointer only', () => {
  it('generated 80 hours ago with a 48h window → no hygiene line', async () => {
    const root = tmp('ss2');
    makeCortexProject(root);
    writeHygieneReport(root, isoHoursAgo(80, new Date()), 'old news');
    const { stdout } = await runHook(
      'session-start',
      stdinJson({ hook_event_name: 'SessionStart', source: 'resume', cwd: root }),
    );
    const ctx = parseEnvelope(stdout).additionalContext;
    expect(ctx).toContain('Cortex is active');
    expect(ctx).not.toContain('Hygiene:');
  });
});

describe('AC session-start.3: uninitialised project → fully silent', () => {
  it('cwd without .cortex/ → exit 0, empty stdout', async () => {
    const root = tmp('ss3');
    const result = await runHook(
      'session-start',
      stdinJson({ hook_event_name: 'SessionStart', source: 'startup', cwd: root }),
    );
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(path.join(root, '.cortex'))).toBe(false);
  });
});

describe('AC session-start.4: malformed hygiene report degrades to pointer', () => {
  it('unparseable frontmatter → pointer injected, hook-errors entry names hook + file + failure', async () => {
    const root = tmp('ss4');
    makeCortexProject(root);
    fs.writeFileSync(
      path.join(root, '.cortex', 'pulse', 'hygiene-report.md'),
      '---\ngenerated: [broken yaml\n---\nreport body',
    );
    const { exitCode, stdout } = await runHook(
      'session-start',
      stdinJson({ hook_event_name: 'SessionStart', source: 'clear', cwd: root }),
    );
    expect(exitCode).toBe(0);
    expect(parseEnvelope(stdout).additionalContext).toContain('Cortex is active');
    const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    expect(log).toContain('kind: pulse-hook-errors');
    expect(log).toContain('hook: session-start');
    expect(log).toContain('file: .cortex/pulse/hygiene-report.md');
    expect(log).toMatch(/failure: \S/);
  });
});

describe('AC session-start.5: payload respects the token budget', () => {
  it(
    'additionalContext is under 100 tokens (chars/4), per schema §5',
    async () => {
      const root = await makeScannedProject('ss5');
      writeHygieneReport(root, isoHoursAgo(1, new Date()), 'summary '.repeat(200));
      for (const source of ['startup', 'resume', 'clear', 'compact']) {
        const { stdout } = await runHook(
          'session-start',
          stdinJson({ hook_event_name: 'SessionStart', source, cwd: root }),
        );
        const ctx = parseEnvelope(stdout).additionalContext;
        expect(ctx.length / 4).toBeLessThan(100);
      }
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
// dispatch alignment: `cortex hook <name>` names match init's registrations
// ===========================================================================

describe('cortex hook dispatch matches the init-registered command names', () => {
  it('session-start / pre-write / post-write are handled; unknown names stay silent', async () => {
    const root = tmp('dispatch');
    makeCortexProject(root);
    // Registered command suffixes per core-cli.init Rule 11 / hooks.* Rule 1:
    const registered = ['session-start', 'pre-write', 'post-write'];
    for (const name of registered) {
      const result = await runHook(name, stdinJson({ cwd: root, tool_input: {} }));
      expect(result.exitCode).toBe(0);
    }
    // pre-read is implemented but self-gates on hooks.preRead (false in this
    // fixture's config) → silent; post-read is silent without a files.md:
    expect(await runHook('pre-read', stdinJson({ cwd: root }))).toEqual({ exitCode: 0, stdout: '' });
    expect(await runHook('post-read', stdinJson({ cwd: root }))).toEqual({ exitCode: 0, stdout: '' });
    expect(await runHook('nonsense', 'not even json')).toEqual({ exitCode: 0, stdout: '' });
  });

  it('runSessionStart export shape: pure run(stdinJson, opts) seam works with now', async () => {
    const root = tmp('seam');
    makeCortexProject(root);
    const now = new Date('2026-07-02T00:00:00.000Z');
    writeHygieneReport(root, isoHoursAgo(47, now), 'inside the window by the seam.');
    const { stdout } = await runSessionStart({ cwd: root, hook_event_name: 'SessionStart', source: 'startup' }, { cwd: root, now });
    expect(parseEnvelope(stdout).additionalContext).toContain('inside the window by the seam.');
  });
});
