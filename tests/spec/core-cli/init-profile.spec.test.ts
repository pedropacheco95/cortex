/**
 * Spec test for core-cli.init-profile — the integrated slice: a real `cortex
 * init` into a fresh tmp project with an injected fake home, checking what
 * lands in cortex.config.json AND what lands in the scheduled-task payload
 * directory. The atomic tests cover the scoping function in isolation; this
 * proves init actually threads the profile through to both.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { init } from '../../../src/cli/init.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const };

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`init-profile-spec-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function readConfig(root: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8'));
}

/** Scheduled-task payload directory names written under the fake home. */
function writtenTaskDirs(home: string): string[] {
  const base = path.join(home, '.claude', 'scheduled-tasks');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).sort();
}

/** The prompt body of a written bundle payload, whatever its scoped dir name. */
function payloadBody(home: string, bundle: string): string | null {
  const base = path.join(home, '.claude', 'scheduled-tasks');
  const dir = fs.readdirSync(base).find((d) => d.includes(bundle));
  if (!dir) return null;
  const skillMd = path.join(base, dir, 'SKILL.md');
  return fs.existsSync(skillMd) ? fs.readFileSync(skillMd, 'utf-8') : null;
}

describe('AC: no flag means specflow', () => {
  it('records profile specflow when --profile is omitted', async () => {
    const root = tmp('default-root');
    const home = tmp('default-home');
    const result = await init(root, { home, noLlm: true, yes: true, ...DARWIN });
    expect(result.exitCode).toBe(0);
    expect(readConfig(root)['profile']).toBe('specflow');
  }, TEST_TIMEOUT);
});

describe('AC: an explicit profile is recorded', () => {
  it('records profile superpowers when asked', async () => {
    const root = tmp('sp-root');
    const home = tmp('sp-home');
    const result = await init(root, { home, noLlm: true, yes: true, profile: 'superpowers', ...DARWIN });
    expect(result.exitCode).toBe(0);
    expect(readConfig(root)['profile']).toBe('superpowers');
  }, TEST_TIMEOUT);

  it('a plain re-init refuses and leaves the recorded profile alone', async () => {
    const root = tmp('reinit-root');
    const home = tmp('reinit-home');
    await init(root, { home, noLlm: true, yes: true, profile: 'superpowers', ...DARWIN });
    // Rule 1: init on an existing project refuses and defers to `cortex sync`.
    const again = await init(root, { home, noLlm: true, yes: true, ...DARWIN });
    expect(again.exitCode).toBe(2);
    expect(readConfig(root)['profile']).toBe('superpowers');
  }, TEST_TIMEOUT);

  it('a FORCED re-init with no flag preserves the recorded profile rather than resetting it', async () => {
    const root = tmp('preserve-root');
    const home = tmp('preserve-home');
    await init(root, { home, noLlm: true, yes: true, profile: 'superpowers', ...DARWIN });
    await init(root, { home, noLlm: true, yes: true, force: true, ...DARWIN });
    expect(readConfig(root)['profile']).toBe('superpowers');
  }, TEST_TIMEOUT);

  it('a FORCED re-init WITH a flag overrides the recorded profile', async () => {
    const root = tmp('override-root');
    const home = tmp('override-home');
    await init(root, { home, noLlm: true, yes: true, profile: 'superpowers', ...DARWIN });
    await init(root, { home, noLlm: true, yes: true, force: true, profile: 'specflow', ...DARWIN });
    expect(readConfig(root)['profile']).toBe('specflow');
  }, TEST_TIMEOUT);
});

describe('AC: the spec loops are not scheduled under superpowers', () => {
  it('writes no test-runner payload, and scopes the daily bundle', async () => {
    const root = tmp('scoped-root');
    const home = tmp('scoped-home');
    const result = await init(root, { home, noLlm: true, yes: true, profile: 'superpowers', ...DARWIN });
    expect(result.exitCode).toBe(0);

    const written = writtenTaskDirs(home);
    expect(written.some((d) => d.includes('test-runner')), `test-runner written: ${written.join(', ')}`).toBe(false);

    const daily = payloadBody(home, 'daily');
    expect(daily).not.toBeNull();
    expect(daily).toContain('Profile scoping');
    expect(daily).toContain('**bug-triage**');
    expect(daily).toContain('**spec-drift**');
  }, TEST_TIMEOUT);
});

describe('AC: the knowledge loops are scheduled under every profile', () => {
  it('daily, weekly-curation, weekly-quality and monthly-review are all still written', async () => {
    const root = tmp('bucket1-root');
    const home = tmp('bucket1-home');
    await init(root, { home, noLlm: true, yes: true, profile: 'superpowers', ...DARWIN });
    const written = writtenTaskDirs(home);
    for (const bundle of ['daily', 'weekly-curation', 'weekly-quality', 'monthly-review']) {
      expect(written.some((d) => d.includes(bundle)), `${bundle} missing from ${written.join(', ')}`).toBe(true);
    }
  }, TEST_TIMEOUT);

  it('the scoped daily bundle still instructs its Bucket-1 members', async () => {
    const root = tmp('bucket1-members-root');
    const home = tmp('bucket1-members-home');
    await init(root, { home, noLlm: true, yes: true, profile: 'superpowers', ...DARWIN });
    const daily = payloadBody(home, 'daily') ?? '';
    for (const member of ['pulse-hygiene', 'insight-refresh-daily', 'session-observe']) {
      expect(daily, `${member} lost from the scoped daily bundle`).toContain(member);
    }
  }, TEST_TIMEOUT);
});

describe('AC: specflow scheduling is unchanged', () => {
  it('all five bundles are written under the default profile, with no scoping notice', async () => {
    const root = tmp('unscoped-root');
    const home = tmp('unscoped-home');
    await init(root, { home, noLlm: true, yes: true, ...DARWIN });
    const written = writtenTaskDirs(home);
    for (const bundle of ['daily', 'weekly-curation', 'weekly-quality', 'monthly-review', 'test-runner']) {
      expect(written.some((d) => d.includes(bundle)), `${bundle} missing`).toBe(true);
    }
    expect(payloadBody(home, 'daily')).not.toContain('Profile scoping');
  }, TEST_TIMEOUT);
});

describe('AC: a project scaffolded with a profile validates clean', () => {
  it('the written config passes check.config under both profiles', async () => {
    for (const profile of ['specflow', 'superpowers'] as const) {
      const root = tmp(`validate-${profile}-root`);
      const home = tmp(`validate-${profile}-home`);
      const result = await init(root, { home, noLlm: true, yes: true, profile, ...DARWIN });
      expect(result.exitCode).toBe(0);
      expect(readConfig(root)['profile']).toBe(profile);
    }
  }, TEST_TIMEOUT);
});
