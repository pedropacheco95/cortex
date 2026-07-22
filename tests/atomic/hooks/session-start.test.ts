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
  writeObservationEntry,
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
    expect(env.additionalContext).toContain('Cortex is active (schema 3.0). See .cortex/_index.md.');
    expect(env.additionalContext).toContain('Modules: compass, atlas, insight, pulse.');
  });

  it('lists only the module directories actually present (v3 roster order)', async () => {
    const root = tmp('modules');
    makeCortexProject(root, { modules: ['insight', 'pulse'] });
    const { stdout } = await run(stdinFor(root), { now: NOW });
    expect(parseEnvelope(stdout).additionalContext).toContain('Modules: insight, pulse.');
  });

  it('archive is part of the roster; a stray anatomy/ dir NEVER appears (deprecated module)', async () => {
    const root = tmp('roster');
    makeCortexProject(root, { modules: ['anatomy', 'compass', 'archive', 'pulse'] });
    const ctx = parseEnvelope((await run(stdinFor(root), { now: NOW })).stdout).additionalContext;
    expect(ctx).toContain('Modules: compass, archive, pulse.');
    expect(ctx).not.toContain('anatomy');
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
    expect(ctx).toContain('(.cortex/pulse/reports/hygiene.md)');
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
    fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'reports'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.cortex', 'pulse', 'reports', 'hygiene.md'),
      '---\nkind: [unclosed\n---\nbroken',
    );
    const { exitCode, stdout } = await run(stdinFor(root), { now: NOW });
    expect(exitCode).toBe(0);
    expect(parseEnvelope(stdout).additionalContext).toContain('Cortex is active');
    const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    expect(log).toContain('kind: pulse-hook-errors');
    expect(log).toContain('hook: session-start');
    expect(log).toContain('reports/hygiene.md');
  });

  it('report missing `generated` → treated as malformed, pointer still injected', async () => {
    const root = tmp('nogen');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'reports'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.cortex', 'pulse', 'reports', 'hygiene.md'),
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

describe('observations digest (Rule 4, schema §4.10.11)', () => {
  it('qualifying entries (salient or sessions>=3) render as compact one-liners plus the pointer', async () => {
    const root = tmp('obs-qualify');
    makeCortexProject(root);
    writeObservationEntry(root, 'deployment', {
      salient: true,
      sessionsCount: 1,
      body: 'Target environment is macOS-only for v1. More detail here.',
    });
    writeObservationEntry(root, 'working-style', {
      salient: false,
      sessionsCount: 3,
      body: 'Pedro prefers delegating actual work to subagents. Extra prose.',
    });
    writeObservationEntry(root, 'audience', { salient: false, sessionsCount: 1 });
    const { stdout } = await run(stdinFor(root), { now: NOW });
    const ctx = parseEnvelope(stdout).additionalContext;
    expect(ctx).toContain('Observations:');
    expect(ctx).toContain('deployment: Target environment is macOS-only for v1.');
    expect(ctx).toContain('working-style: Pedro prefers delegating actual work to subagents.');
    expect(ctx).not.toContain('audience:');
    expect(ctx).toContain('(more: .cortex/insight/observations/)');
  });

  it('no qualifying entries → digest omitted entirely', async () => {
    const root = tmp('obs-none');
    makeCortexProject(root);
    writeObservationEntry(root, 'audience', { salient: false, sessionsCount: 1 });
    writeObservationEntry(root, 'scale', { salient: false, sessionsCount: 2 });
    const { stdout } = await run(stdinFor(root), { now: NOW });
    const ctx = parseEnvelope(stdout).additionalContext;
    expect(ctx).toContain('Cortex is active');
    expect(ctx).not.toContain('Observations:');
  });

  it('absent observations/ directory → silent, no digest, no hook-errors entry', async () => {
    const root = tmp('obs-absent');
    makeCortexProject(root);
    const { stdout } = await run(stdinFor(root), { now: NOW });
    expect(parseEnvelope(stdout).additionalContext).not.toContain('Observations:');
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('_index.md in observations/ is never treated as an entry', async () => {
    const root = tmp('obs-index');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, '.cortex', 'insight', 'observations'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.cortex', 'insight', 'observations', '_index.md'),
      '# Observations — index\n\n**Read this when:** always.\n',
    );
    writeObservationEntry(root, 'deployment', { salient: true });
    const { stdout } = await run(stdinFor(root), { now: NOW });
    const ctx = parseEnvelope(stdout).additionalContext;
    const obsLine = ctx.split('\n').find((l) => l.startsWith('Observations:')) ?? '';
    expect(obsLine).toContain('deployment:');
    expect(obsLine).not.toContain('_index:');
  });

  it('malformed entry frontmatter degrades: other entries still digest, hook-errors gains an entry', async () => {
    const root = tmp('obs-badentry');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, '.cortex', 'insight', 'observations'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.cortex', 'insight', 'observations', 'broken.md'),
      '---\nsalient: [unclosed\n---\nbroken body',
    );
    writeObservationEntry(root, 'deployment', { salient: true });
    const { exitCode, stdout } = await run(stdinFor(root), { now: NOW });
    expect(exitCode).toBe(0);
    const ctx = parseEnvelope(stdout).additionalContext;
    expect(ctx).toContain('Observations:');
    expect(ctx).toContain('deployment:');
    const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    expect(log).toContain('hook: session-start');
    expect(log).toContain('observations/broken.md');
  });

  it('truncates lowest-priority entries first to respect the 150-token digest budget', async () => {
    const root = tmp('obs-budget');
    makeCortexProject(root);
    // Many qualifying entries with long bodies — the digest must still fit
    // its own 150-token (592-char) budget, keeping the highest-priority ones.
    for (let i = 0; i < 20; i++) {
      writeObservationEntry(root, `theme-${i}`, {
        salient: i === 0,
        sessionsCount: i === 0 ? 1 : 3,
        body: `Observation number ${i} with a fair amount of descriptive prose padding it out. `.repeat(3),
      });
    }
    const { stdout } = await run(stdinFor(root), { now: NOW });
    const ctx = parseEnvelope(stdout).additionalContext;
    const obsLine = ctx.split('\n').find((l) => l.startsWith('Observations:')) ?? '';
    expect(obsLine.length / 4).toBeLessThanOrEqual(150);
    // theme-0 is the sole salient entry — highest priority, must survive truncation.
    expect(obsLine).toContain('theme-0:');
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
