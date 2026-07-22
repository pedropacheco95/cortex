/**
 * Spec-level tests — hooks.session-start (one file per leaf per the schema §3
 * convention; the cross-hook dispatch-alignment suite lives in hooks.test.ts).
 *
 * End-to-end over tmp fixture projects driven through the `cortex hook
 * <name>` dispatch (runHook) with raw stdin JSON, exactly as Claude Code
 * invokes them. One describe per spec AC. The v3 module roster is
 * compass/atlas/archive/insight/pulse — anatomy is deprecated and never
 * listed (build-order-v3 step 7).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runHook } from '../../../src/hooks/cli.js';
import { run as runSessionStart } from '../../../src/hooks/session-start.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeHygieneReport,
  writeObservationEntry,
  hookErrorsPath,
  parseEnvelope,
  isoHoursAgo,
} from '../../fixtures/hooks-harness.js';

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

describe('AC session-start.1: fresh hygiene report → pointer plus one-line summary', () => {
  it('generated 3 hours ago → pointer, v3 modules, and a hygiene line naming the report', async () => {
    const root = tmp('ss1');
    makeCortexProject(root);
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
    expect(env.additionalContext).toContain('Modules: compass, atlas, insight, pulse.');
    expect(env.additionalContext).not.toContain('anatomy');
    expect(env.additionalContext).toContain('Hygiene: 3 stale purposes flagged.');
    expect(env.additionalContext).toContain('.cortex/pulse/reports/hygiene.md');
  });
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
    fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'reports'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.cortex', 'pulse', 'reports', 'hygiene.md'),
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
    expect(log).toContain('file: .cortex/pulse/reports/hygiene.md');
    expect(log).toMatch(/failure: \S/);
  });
});

describe('AC session-start.5: payload respects the token budget', () => {
  it('additionalContext is under 100 tokens (chars/4), per schema §5, on every source', async () => {
    const root = tmp('ss5');
    makeCortexProject(root, { modules: ['compass', 'atlas', 'archive', 'insight', 'pulse'] });
    writeHygieneReport(root, isoHoursAgo(1, new Date()), 'summary '.repeat(200));
    for (const source of ['startup', 'resume', 'clear', 'compact']) {
      const { stdout } = await runHook(
        'session-start',
        stdinJson({ hook_event_name: 'SessionStart', source, cwd: root }),
      );
      const ctx = parseEnvelope(stdout).additionalContext;
      expect(ctx.length / 4).toBeLessThan(100);
    }
  });
});

describe('AC session-start.6: qualifying observations render as a compact digest', () => {
  it('deployment (salient) + working-style (sessions>=3) digest; audience (non-qualifying) covered by the pointer', async () => {
    const root = tmp('ss6');
    makeCortexProject(root);
    writeObservationEntry(root, 'deployment', {
      salient: true,
      sessionsCount: 1,
      body: 'Target environment is a single macOS binary. Extra detail follows.',
    });
    writeObservationEntry(root, 'working-style', {
      salient: false,
      sessionsCount: 3,
      body: 'Pedro likes tests written before implementation. Extra detail follows.',
    });
    writeObservationEntry(root, 'audience', { salient: false, sessionsCount: 1 });
    const { exitCode, stdout } = await runHook(
      'session-start',
      stdinJson({ hook_event_name: 'SessionStart', source: 'startup', cwd: root }),
    );
    expect(exitCode).toBe(0);
    const ctx = parseEnvelope(stdout).additionalContext;
    expect(ctx).toContain('deployment: Target environment is a single macOS binary.');
    expect(ctx).toContain('working-style: Pedro likes tests written before implementation.');
    expect(ctx).not.toContain('audience:');
    expect(ctx).toContain('(more: .cortex/insight/observations/)');
    const obsLine = ctx.split('\n').find((l) => l.startsWith('Observations:')) ?? '';
    expect(obsLine.length / 4).toBeLessThanOrEqual(150);
  });
});

describe('AC session-start.7: no qualifying observations omits the digest entirely', () => {
  it('every entry salient:false and sessions<3 → no Observations line, hygiene/pointer unaffected', async () => {
    const root = tmp('ss7');
    makeCortexProject(root);
    writeHygieneReport(root, isoHoursAgo(1, new Date()), 'fresh and fine.');
    writeObservationEntry(root, 'audience', { salient: false, sessionsCount: 1 });
    writeObservationEntry(root, 'scale', { salient: false, sessionsCount: 2 });
    const { stdout } = await runHook(
      'session-start',
      stdinJson({ hook_event_name: 'SessionStart', source: 'startup', cwd: root }),
    );
    const ctx = parseEnvelope(stdout).additionalContext;
    expect(ctx).toContain('Hygiene: fresh and fine.');
    expect(ctx).not.toContain('Observations:');
  });
});

describe('AC session-start.8: absent observations directory is silent, not an error', () => {
  it('no insight/observations/ at all → digest omitted, no hook-errors entry, exit 0', async () => {
    const root = tmp('ss8');
    makeCortexProject(root);
    const { exitCode, stdout } = await runHook(
      'session-start',
      stdinJson({ hook_event_name: 'SessionStart', source: 'startup', cwd: root }),
    );
    expect(exitCode).toBe(0);
    expect(parseEnvelope(stdout).additionalContext).not.toContain('Observations:');
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });
});

describe('the v3 module roster (anatomy deprecation)', () => {
  it('all five v3 modules present → listed in roster order; a stray anatomy/ dir is ignored', async () => {
    const root = tmp('roster');
    makeCortexProject(root, { modules: ['anatomy', 'compass', 'atlas', 'archive', 'insight', 'pulse'] });
    const { stdout } = await runHook(
      'session-start',
      stdinJson({ hook_event_name: 'SessionStart', source: 'startup', cwd: root }),
    );
    const ctx = parseEnvelope(stdout).additionalContext;
    expect(ctx).toContain('Modules: compass, atlas, archive, insight, pulse.');
    expect(ctx).not.toContain('anatomy');
  });
});

describe('runSessionStart export shape', () => {
  it('pure run(stdinJson, opts) seam works with an injected now', async () => {
    const root = tmp('seam');
    makeCortexProject(root);
    const now = new Date('2026-07-02T00:00:00.000Z');
    writeHygieneReport(root, isoHoursAgo(47, now), 'inside the window by the seam.');
    const { stdout } = await runSessionStart({ cwd: root, hook_event_name: 'SessionStart', source: 'startup' }, { cwd: root, now });
    expect(parseEnvelope(stdout).additionalContext).toContain('inside the window by the seam.');
  });
});
