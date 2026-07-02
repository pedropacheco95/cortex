/**
 * Atomic tests — hooks.session-start (pointer payload, hygiene freshness,
 * silence when uninitialised, every degradation path).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { run } from '../../../src/hooks/session-start.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeHygieneReport,
  hookErrorsPath,
  parseEnvelope,
  isoHoursAgo,
} from '../../fixtures/hooks-harness.js';

const NOW = new Date('2026-07-02T12:00:00.000Z');
const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(label);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function stdinFor(root: string, source = 'startup'): Record<string, unknown> {
  return { session_id: 's1', cwd: root, hook_event_name: 'SessionStart', source };
}

describe('pointer payload (Rule 2, schema §5)', () => {
  it('emits the pinned JSON envelope with the pointer block', async () => {
    const root = tmp('pointer');
    makeCortexProject(root);
    const { exitCode, stdout } = await run(stdinFor(root), { now: NOW });
    expect(exitCode).toBe(0);
    const env = parseEnvelope(stdout);
    expect(env.hookEventName).toBe('SessionStart');
    expect(env.additionalContext).toContain('Cortex is active (schema 1.0). See .cortex/_index.md.');
    expect(env.additionalContext).toContain('Modules: anatomy, cerebrum, atlas, pulse.');
  });

  it('lists only the module directories actually present', async () => {
    const root = tmp('modules');
    makeCortexProject(root, { modules: ['anatomy', 'pulse'] });
    const { stdout } = await run(stdinFor(root), { now: NOW });
    expect(parseEnvelope(stdout).additionalContext).toContain('Modules: anatomy, pulse.');
  });

  it('injects on every source: startup, resume, clear, compact (Rule 4)', async () => {
    const root = tmp('sources');
    makeCortexProject(root);
    for (const source of ['startup', 'resume', 'clear', 'compact']) {
      const { exitCode, stdout } = await run(stdinFor(root, source), { now: NOW });
      expect(exitCode).toBe(0);
      expect(parseEnvelope(stdout).additionalContext).toContain('Cortex is active');
    }
  });

  it('falls back to opts.cwd when stdin carries no cwd', async () => {
    const root = tmp('optscwd');
    makeCortexProject(root);
    const { stdout } = await run({ hook_event_name: 'SessionStart', source: 'startup' }, { cwd: root, now: NOW });
    expect(parseEnvelope(stdout).additionalContext).toContain('Cortex is active');
  });
});

describe('hygiene line freshness (Rule 3)', () => {
  it('fresh report (3h old, window 48) → hygiene line with the report path', async () => {
    const root = tmp('fresh');
    makeCortexProject(root);
    writeHygieneReport(root, isoHoursAgo(3, NOW), '2 stale purposes, 1 dangling spec link.');
    const { stdout } = await run(stdinFor(root), { now: NOW });
    const ctx = parseEnvelope(stdout).additionalContext;
    expect(ctx).toContain('Hygiene: 2 stale purposes, 1 dangling spec link.');
    expect(ctx).toContain('(.cortex/pulse/hygiene-report.md)');
  });

  it('stale report (80h old, window 48) → no hygiene line', async () => {
    const root = tmp('stale');
    makeCortexProject(root);
    writeHygieneReport(root, isoHoursAgo(80, NOW), 'anything');
    const { stdout } = await run(stdinFor(root), { now: NOW });
    const ctx = parseEnvelope(stdout).additionalContext;
    expect(ctx).toContain('Cortex is active');
    expect(ctx).not.toContain('Hygiene:');
  });

  it('honours a custom pulse.hygieneFreshnessHours window', async () => {
    const root = tmp('window');
    makeCortexProject(root, {
      config: { schemaVersion: '1.0', pulse: { hygieneFreshnessHours: 100 } },
    });
    writeHygieneReport(root, isoHoursAgo(80, NOW), 'still fresh under 100h.');
    const { stdout } = await run(stdinFor(root), { now: NOW });
    expect(parseEnvelope(stdout).additionalContext).toContain('Hygiene: still fresh under 100h.');
  });

  it('missing report → pointer only, no error logged', async () => {
    const root = tmp('noreport');
    makeCortexProject(root);
    const { stdout } = await run(stdinFor(root), { now: NOW });
    expect(parseEnvelope(stdout).additionalContext).not.toContain('Hygiene:');
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });
});

describe('silence when Cortex is absent (Rule 5)', () => {
  it('no .cortex/ at all → exit 0, empty stdout, nothing written', async () => {
    const root = tmp('absent');
    const result = await run(stdinFor(root), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(path.join(root, '.cortex'))).toBe(false);
  });

  it('.cortex/ without cortex.config.json → silent', async () => {
    const root = tmp('noconfig');
    fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
    const result = await run(stdinFor(root), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });
});

describe('degradation (Rule 6, warn-never-block)', () => {
  it('malformed hygiene report frontmatter → pointer still injected + hook-errors entry', async () => {
    const root = tmp('badreport');
    makeCortexProject(root);
    fs.writeFileSync(
      path.join(root, '.cortex', 'pulse', 'hygiene-report.md'),
      '---\nkind: [unclosed\n---\nbroken',
    );
    const { exitCode, stdout } = await run(stdinFor(root), { now: NOW });
    expect(exitCode).toBe(0);
    expect(parseEnvelope(stdout).additionalContext).toContain('Cortex is active');
    const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    expect(log).toContain('kind: pulse-hook-errors');
    expect(log).toContain('hook: session-start');
    expect(log).toContain('hygiene-report.md');
  });

  it('report missing `generated` → treated as malformed, pointer still injected', async () => {
    const root = tmp('nogen');
    makeCortexProject(root);
    fs.writeFileSync(
      path.join(root, '.cortex', 'pulse', 'hygiene-report.md'),
      '---\nkind: pulse-hygiene-report\nloop: hygiene\n---\n\nSummary.\n',
    );
    const { stdout } = await run(stdinFor(root), { now: NOW });
    expect(parseEnvelope(stdout).additionalContext).not.toContain('Hygiene:');
    expect(fs.readFileSync(hookErrorsPath(root), 'utf-8')).toContain('generated');
  });

  it('malformed cortex.config.json → pointer with fallback schema version + hook-errors entry', async () => {
    const root = tmp('badconfig');
    makeCortexProject(root);
    fs.writeFileSync(path.join(root, '.cortex', 'cortex.config.json'), '{not json');
    const { exitCode, stdout } = await run(stdinFor(root), { now: NOW });
    expect(exitCode).toBe(0);
    expect(parseEnvelope(stdout).additionalContext).toContain('Cortex is active');
    expect(fs.readFileSync(hookErrorsPath(root), 'utf-8')).toContain('cortex.config.json');
  });
});

describe('token budget (schema §5, RULES.md rule 11)', () => {
  it('payload stays under 100 tokens (chars/4) even with a huge hygiene summary', async () => {
    const root = tmp('budget');
    makeCortexProject(root);
    writeHygieneReport(root, isoHoursAgo(1, NOW), 'x'.repeat(2000));
    const { stdout } = await run(stdinFor(root), { now: NOW });
    const ctx = parseEnvelope(stdout).additionalContext;
    expect(ctx.length / 4).toBeLessThan(100);
    expect(ctx).toContain('Cortex is active');
  });
});
