/**
 * Atomic tests for core-cli.init-profile (schema §10.1, plan §3 item 5.1).
 *
 * Two halves: the config field (recorded, defaulted, enum-validated) and the
 * scheduling consequence (Bucket-3 spec-loop members scoped out under a
 * non-specflow profile, Bucket-1 knowledge loops untouched under every one).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validate } from '../../../src/schema/validate.js';
import { SCHEDULED_TASKS, scopeTaskToProfile } from '../../../src/cli/templates.js';
import { DEFAULT_PROFILE, PROCESS_PROFILES, isProcessProfile, readProfile } from '../../../src/cli/profile.js';
import { makeTmpDir, cleanTmp, makeCortexProject } from '../../fixtures/hooks-harness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`init-profile-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function task(name: string) {
  const t = SCHEDULED_TASKS.find((x) => x.name === name);
  if (!t) throw new Error(`no such bundle: ${name}`);
  return t;
}

// ---------------------------------------------------------------------------
// The profile field itself
// ---------------------------------------------------------------------------

describe('the profile vocabulary', () => {
  it('is exactly specflow and superpowers, defaulting to specflow', () => {
    expect([...PROCESS_PROFILES]).toEqual(['specflow', 'superpowers']);
    expect(DEFAULT_PROFILE).toBe('specflow');
  });

  it('rejects anything outside the enum', () => {
    expect(isProcessProfile('specflow')).toBe(true);
    expect(isProcessProfile('superpowers')).toBe(true);
    expect(isProcessProfile('waterfall')).toBe(false);
    expect(isProcessProfile(undefined)).toBe(false);
    expect(isProcessProfile(3)).toBe(false);
  });
});

describe('AC: no flag means specflow', () => {
  it('readProfile defaults when the key is absent', () => {
    const root = tmp('absent-key');
    makeCortexProject(root, { config: { schemaVersion: '3.0' } });
    expect(readProfile(root)).toBe('specflow');
  });

  it('readProfile degrades to the default rather than throwing on a malformed config', () => {
    const root = tmp('malformed');
    makeCortexProject(root, { config: { schemaVersion: '3.0' } });
    fs.writeFileSync(path.join(root, '.cortex', 'cortex.config.json'), '{ not json', 'utf-8');
    expect(readProfile(root)).toBe('specflow');
  });

  it('readProfile ignores an out-of-enum value (check.config reports it instead)', () => {
    const root = tmp('bad-value');
    makeCortexProject(root, { config: { schemaVersion: '3.0', profile: 'waterfall' } });
    expect(readProfile(root)).toBe('specflow');
  });
});

describe('AC: an explicit profile is recorded and read back', () => {
  it('readProfile returns a recorded superpowers profile', () => {
    const root = tmp('recorded');
    makeCortexProject(root, { config: { schemaVersion: '3.0', profile: 'superpowers' } });
    expect(readProfile(root)).toBe('superpowers');
  });
});

// ---------------------------------------------------------------------------
// AC: The validator accepts the enum and rejects anything else
// ---------------------------------------------------------------------------

describe('AC: the validator accepts the enum and rejects anything else', () => {
  async function configViolations(root: string) {
    const report = await validate(root, { root });
    return report.violations.filter((v) => v.check === 'check.config');
  }

  for (const profile of PROCESS_PROFILES) {
    it(`accepts "${profile}"`, async () => {
      const root = tmp(`valid-${profile}`);
      makeCortexProject(root, { config: { schemaVersion: '3.0', profile } });
      expect(await configViolations(root)).toEqual([]);
    });
  }

  it('errors on a value outside the enum', async () => {
    const root = tmp('invalid-enum');
    makeCortexProject(root, { config: { schemaVersion: '3.0', profile: 'waterfall' } });
    const v = await configViolations(root);
    expect(v.length).toBe(1);
    expect(v[0]?.severity).toBe('error');
    expect(v[0]?.message).toContain('waterfall');
    expect(v[0]?.clause).toBe('§10.1');
  });

  it('errors on a non-string value', async () => {
    const root = tmp('non-string');
    makeCortexProject(root, { config: { schemaVersion: '3.0', profile: 3 } });
    const v = await configViolations(root);
    expect(v.length).toBe(1);
    expect(v[0]?.severity).toBe('error');
  });
});

describe('AC: an existing project keeps validating', () => {
  it('a config predating the field raises no violation, and profile is not an unknown key', async () => {
    const root = tmp('pre-field');
    makeCortexProject(root, { config: { schemaVersion: '3.0' } });
    const report = await validate(root, { root });
    const configViolations = report.violations.filter((v) => v.check === 'check.config');
    expect(configViolations).toEqual([]);

    // And when present, `profile` must not trip the unknown-key warning.
    const withField = tmp('with-field');
    makeCortexProject(withField, { config: { schemaVersion: '3.0', profile: 'specflow' } });
    const report2 = await validate(withField, { root: withField });
    expect(
      report2.violations.filter((v) => v.check === 'check.config' && v.message.includes('Unknown key')),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC: Specflow scheduling is unchanged
// ---------------------------------------------------------------------------

describe('AC: specflow scheduling is unchanged', () => {
  it('every bundle passes through untouched under the default profile', () => {
    for (const t of SCHEDULED_TASKS) {
      expect(scopeTaskToProfile(t, 'specflow')).toBe(t);
    }
  });
});

// ---------------------------------------------------------------------------
// AC: The spec loops are not scheduled under superpowers
// ---------------------------------------------------------------------------

describe('AC: the spec loops are not scheduled under superpowers', () => {
  it('the test-runner bundle — Bucket-3 entire — is dropped', () => {
    expect(scopeTaskToProfile(task('test-runner'), 'superpowers')).toBeNull();
  });

  it('the daily bundle drops its bug-triage and spec-drift skills', () => {
    const scoped = scopeTaskToProfile(task('daily'), 'superpowers');
    expect(scoped).not.toBeNull();
    expect(scoped?.requiredSkills).not.toContain('cortex-loop-bug-triage');
    expect(scoped?.requiredSkills).not.toContain('cortex-loop-spec-drift');
    expect(scoped?.requiredSkills).not.toContain('specflow-bugs');
  });

  it('the daily bundle instructs skipping those members explicitly', () => {
    const scoped = scopeTaskToProfile(task('daily'), 'superpowers');
    expect(scoped?.body).toContain('Profile scoping');
    expect(scoped?.body).toContain('**bug-triage**');
    expect(scoped?.body).toContain('**spec-drift**');
    expect(scoped?.body).toMatch(/Skipping them is not a failure/);
  });

  it('the weekly-quality bundle drops lint and verify but keeps insight-refresh-full', () => {
    const scoped = scopeTaskToProfile(task('weekly-quality'), 'superpowers');
    expect(scoped?.requiredSkills).not.toContain('specflow-lint');
    expect(scoped?.requiredSkills).not.toContain('specflow-tests');
    expect(scoped?.requiredSkills).toContain('cortex-loop-insight-refresh-full');
    expect(scoped?.requiredSkills).toContain('cortex-extract-insight');
  });
});

// ---------------------------------------------------------------------------
// AC: The knowledge loops are scheduled under every profile
// ---------------------------------------------------------------------------

describe('AC: the knowledge loops are scheduled under every profile', () => {
  it('four of the five bundles survive, and only test-runner disappears', () => {
    const surviving = SCHEDULED_TASKS.map((t) => scopeTaskToProfile(t, 'superpowers')).filter(
      (t): t is NonNullable<typeof t> => t !== null,
    );
    expect(surviving.map((t) => t.name).sort()).toEqual([
      'daily',
      'monthly-review',
      'weekly-curation',
      'weekly-quality',
    ]);
  });

  const BUCKET_1_SKILLS = [
    'cortex-pulse-hygiene',
    'cortex-loop-insight-refresh-daily',
    'cortex-loop-session-observe',
    'cortex-extract-insight',
    'cortex-pulse-distil',
    'cortex-loop-rule-decay',
    'cortex-loop-insight-refresh-full',
    'cortex-loop-atlas-staleness',
    'cortex-loop-onboarding-drift',
  ];

  it('every Bucket-1 skill is still required by some surviving bundle', () => {
    const required = new Set(
      SCHEDULED_TASKS.map((t) => scopeTaskToProfile(t, 'superpowers'))
        .filter((t): t is NonNullable<typeof t> => t !== null)
        .flatMap((t) => t.requiredSkills),
    );
    for (const skill of BUCKET_1_SKILLS) {
      expect(required.has(skill), `${skill} lost under superpowers`).toBe(true);
    }
  });

  it('bundles with no Bucket-3 members are returned untouched', () => {
    for (const name of ['weekly-curation', 'monthly-review']) {
      expect(scopeTaskToProfile(task(name), 'superpowers')).toBe(task(name));
    }
  });

  it('scoping preserves each surviving member’s discipline — the original body is retained whole', () => {
    const original = task('daily');
    const scoped = scopeTaskToProfile(original, 'superpowers');
    expect(scoped?.body.endsWith(original.body)).toBe(true);
  });
});
