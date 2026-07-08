/**
 * Atomic tests for core-cli.task-scoping — slug edge cases, hash stability,
 * canonical-map completeness pinned against SCHEDULED_TASKS, legacyTaskNames
 * coverage, isOwnScopedTask negatives, rename mechanics, and the
 * `cortex tasks` CLI dispatch guards.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import {
  CANONICAL_TASK_NAMES,
  legacyTaskNames,
  projectTaskSlug,
  projectTaskHash,
  scopedTaskName,
  isOwnScopedTask,
  tasksRename,
} from '../../../src/cli/task-scoping.js';
import { SCHEDULED_TASKS } from '../../../src/cli/templates.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

/** The fifteen registered canonical task names, pinned verbatim (v3: the v2
 *  insight pair is deregistered; the daily/full insight-refresh tiers and
 *  session-observe (build-order-v3 step 6) register; the fast tier is the
 *  git hook, never a scheduled task; anatomy-refresh-deep deregisters at
 *  step 7, bringing the roster to the schema §9.1 fourteen). */
const CANONICALS = [
  'cortex-pulse-hygiene',
  'cortex-pulse-distil',
  'cortex-loop-skill-suggest',
  'cortex-loop-anatomy-refresh-deep',
  'cortex-loop-rule-decay',
  'cortex-loop-atlas-staleness',
  'cortex-loop-onboarding-drift',
  'cortex-loop-spec-drift',
  'specflow-lint',
  'specflow-verify',
  'cortex-loop-test-runner',
  'cortex-loop-bug-triage',
  'cortex-loop-insight-refresh-daily',
  'cortex-loop-insight-refresh-full',
  'cortex-loop-session-observe',
];

// ---------------------------------------------------------------------------
// projectTaskSlug — §9.1 slug transformation edge cases
// ---------------------------------------------------------------------------
describe('projectTaskSlug: §9.1 slug transformation', () => {
  it('lowercases and replaces spaces and underscores with dashes', () => {
    expect(projectTaskSlug('/tmp/My API_v2')).toBe('my-api-v2');
    expect(projectTaskSlug('/tmp/foo_bar.baz')).toBe('foo-bar-baz');
  });

  it('collapses consecutive dashes and trims leading/trailing dashes', () => {
    expect(projectTaskSlug('/tmp/--Weird__  Name--')).toBe('weird-name');
    expect(projectTaskSlug('/tmp/a---b')).toBe('a-b');
  });

  it('replaces unicode characters outside [a-z0-9-]', () => {
    expect(projectTaskSlug('/tmp/café-app')).toBe('caf-app');
    expect(projectTaskSlug('/tmp/über_Straße')).toBe('ber-stra-e');
  });

  it("all-symbols and all-unicode folder names fall back to 'project'", () => {
    expect(projectTaskSlug('/tmp/!!!***')).toBe('project');
    expect(projectTaskSlug('/tmp/日本語')).toBe('project');
  });

  it('already-clean names pass through unchanged', () => {
    expect(projectTaskSlug('/tmp/api')).toBe('api');
    expect(projectTaskSlug('/tmp/my-app-2')).toBe('my-app-2');
  });
});

// ---------------------------------------------------------------------------
// projectTaskHash — SHA256 of the resolved absolute path, first 6 hex
// ---------------------------------------------------------------------------
describe('projectTaskHash: SHA256-of-absolute-path first 6 hex', () => {
  it('matches an independent SHA256 computation of the absolute path', () => {
    const p = '/Users/me/dev/api';
    expect(projectTaskHash(p)).toBe(createHash('sha256').update(p).digest('hex').slice(0, 6));
  });

  it('is stable across calls and trailing-slash spellings', () => {
    expect(projectTaskHash('/tmp/x')).toBe(projectTaskHash('/tmp/x'));
    expect(projectTaskHash('/tmp/x/')).toBe(projectTaskHash('/tmp/x'));
  });

  it('is 6 lowercase hex chars and differs for same-named folders in different parents', () => {
    const a = projectTaskHash('/work/api');
    const b = projectTaskHash('/personal/api');
    expect(a).toMatch(/^[0-9a-f]{6}$/);
    expect(b).toMatch(/^[0-9a-f]{6}$/);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// scopedTaskName — assembly
// ---------------------------------------------------------------------------
describe('scopedTaskName: <slug>-<hash>-<canonical>', () => {
  it('assembles slug, hash, and canonical name in order', () => {
    const root = '/tmp/My Project';
    expect(scopedTaskName(root, 'cortex-pulse-hygiene')).toBe(
      `my-project-${projectTaskHash(root)}-cortex-pulse-hygiene`,
    );
  });
});

// ---------------------------------------------------------------------------
// Canonical map — completeness pinned against SCHEDULED_TASKS
// ---------------------------------------------------------------------------
describe('CANONICAL_TASK_NAMES: internal-id→canonical map (schema §9.1)', () => {
  it('its keys are exactly the SCHEDULED_TASKS internal ids', () => {
    expect(Object.keys(CANONICAL_TASK_NAMES).sort()).toEqual(SCHEDULED_TASKS.map((t) => t.name).sort());
  });

  it('its values are exactly the fourteen §9.1 canonical names', () => {
    expect(Object.values(CANONICAL_TASK_NAMES).sort()).toEqual([...CANONICALS].sort());
  });

  it('pins each id→canonical row verbatim', () => {
    expect(CANONICAL_TASK_NAMES).toEqual({
      'hygiene': 'cortex-pulse-hygiene',
      'distil': 'cortex-pulse-distil',
      'skill-suggest': 'cortex-loop-skill-suggest',
      'anatomy-refresh-deep': 'cortex-loop-anatomy-refresh-deep',
      'rule-decay': 'cortex-loop-rule-decay',
      'atlas-staleness': 'cortex-loop-atlas-staleness',
      'onboarding-drift': 'cortex-loop-onboarding-drift',
      'spec-drift': 'cortex-loop-spec-drift',
      'specflow-lint': 'specflow-lint',
      'specflow-verify': 'specflow-verify',
      'test-runner': 'cortex-loop-test-runner',
      'bug-triage': 'cortex-loop-bug-triage',
      'insight-refresh-daily': 'cortex-loop-insight-refresh-daily',
      'insight-refresh-full': 'cortex-loop-insight-refresh-full',
      'session-observe': 'cortex-loop-session-observe',
    });
  });
});

// ---------------------------------------------------------------------------
// legacyTaskNames — both unscoped families
// ---------------------------------------------------------------------------
describe('legacyTaskNames: the internal short ids AND the unscoped canonical names', () => {
  it('contains every internal id and every canonical name, deduped (28 total)', () => {
    for (const id of Object.keys(CANONICAL_TASK_NAMES)) {
      expect(legacyTaskNames, id).toContain(id);
    }
    for (const canonical of CANONICALS) {
      expect(legacyTaskNames, canonical).toContain(canonical);
    }
    // 15 ids + 15 canonicals − 2 shared (specflow-lint, specflow-verify).
    expect(new Set(legacyTaskNames).size).toBe(legacyTaskNames.length);
    expect(legacyTaskNames).toHaveLength(28);
  });
});

// ---------------------------------------------------------------------------
// isOwnScopedTask — negatives included
// ---------------------------------------------------------------------------
describe('isOwnScopedTask: recognition matches only this project (spec Rule 3)', () => {
  const root = '/tmp/work/api';
  const other = '/tmp/personal/api';
  const prefix = `${projectTaskSlug(root)}-${projectTaskHash(root)}-`;

  it('accepts all twelve of its own scoped names', () => {
    for (const canonical of CANONICALS) {
      expect(isOwnScopedTask(root, scopedTaskName(root, canonical)), canonical).toBe(true);
    }
  });

  it("rejects another project's scoped names (same slug, different hash)", () => {
    for (const canonical of CANONICALS) {
      expect(isOwnScopedTask(root, scopedTaskName(other, canonical)), canonical).toBe(false);
    }
  });

  it('rejects prefix-colliding user tasks whose suffix is not a canonical name', () => {
    expect(isOwnScopedTask(root, `${prefix}daily-report`)).toBe(false);
    expect(isOwnScopedTask(root, `${prefix}cortex-pulse-hygiene-mine`)).toBe(false);
    expect(isOwnScopedTask(root, `${prefix}hygiene`)).toBe(false); // internal id is not a canonical suffix
    expect(isOwnScopedTask(root, prefix)).toBe(false); // empty suffix
  });

  it('rejects unscoped legacy names and non-Cortex entries', () => {
    expect(isOwnScopedTask(root, 'hygiene')).toBe(false);
    expect(isOwnScopedTask(root, 'cortex-pulse-hygiene')).toBe(false);
    expect(isOwnScopedTask(root, 'daily-report')).toBe(false);
    expect(isOwnScopedTask(root, '')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// tasksRename — mechanics beyond the AC walkthrough
// ---------------------------------------------------------------------------
describe('tasksRename: mechanics', () => {
  it('missing tasks dir → "Nothing to rename.", exit 0', () => {
    const home = makeTmpDir('ts-tr-none-home');
    try {
      const r = tasksRename(home, '/tmp/work/api');
      expect(r.exitCode).toBe(0);
      expect(r.output).toBe('Nothing to rename.');
    } finally {
      cleanTmp(home);
    }
  });

  it('renames a canonical-named legacy dir, rewriting only the frontmatter name line', () => {
    const home = makeTmpDir('ts-tr-canon-home');
    const root = makeTmpDir('ts-tr-canon-root');
    try {
      const base = path.join(home, '.claude', 'scheduled-tasks');
      const src = path.join(base, 'cortex-loop-test-runner');
      fs.mkdirSync(src, { recursive: true });
      const tail = '\ndescription: "Run the cascade."\n---\n\n# test-runner\n\nInvoke the `cortex-loop-test-runner` skill.\n';
      fs.writeFileSync(path.join(src, 'SKILL.md'), `---\nname: cortex-loop-test-runner${tail}`, 'utf-8');

      const r = tasksRename(home, root);
      const scoped = scopedTaskName(root, 'cortex-loop-test-runner');
      expect(r.exitCode).toBe(0);
      expect(fs.existsSync(src)).toBe(false);
      // Only the name: line changed; description and body byte-identical.
      expect(fs.readFileSync(path.join(base, scoped, 'SKILL.md'), 'utf-8')).toBe(`---\nname: ${scoped}${tail}`);
      expect(r.output).toContain(`Renamed "cortex-loop-test-runner" -> "${scoped}".`);
    } finally {
      cleanTmp(home); cleanTmp(root);
    }
  });

  it('a legacy dir without a SKILL.md is still moved without error', () => {
    const home = makeTmpDir('ts-tr-bare-home');
    const root = makeTmpDir('ts-tr-bare-root');
    try {
      const base = path.join(home, '.claude', 'scheduled-tasks');
      fs.mkdirSync(path.join(base, 'distil'), { recursive: true });
      const r = tasksRename(home, root);
      expect(r.exitCode).toBe(0);
      expect(fs.existsSync(path.join(base, 'distil'))).toBe(false);
      expect(fs.existsSync(path.join(base, scopedTaskName(root, 'cortex-pulse-distil')))).toBe(true);
    } finally {
      cleanTmp(home); cleanTmp(root);
    }
  });

  it('names outside the known legacy set are never touched — including Cortex-ish near-misses and scoped names', () => {
    const home = makeTmpDir('ts-tr-unknown-home');
    const root = makeTmpDir('ts-tr-unknown-root');
    try {
      const base = path.join(home, '.claude', 'scheduled-tasks');
      const strangers = [
        'daily-report',
        'hygienic', // near-miss of "hygiene"
        'cortex-pulse-hygiene-extra', // canonical prefix, unknown name
        scopedTaskName('/some/other/project', 'cortex-pulse-hygiene'), // already scoped (foreign)
      ];
      for (const name of strangers) {
        fs.mkdirSync(path.join(base, name), { recursive: true });
        fs.writeFileSync(path.join(base, name, 'SKILL.md'), `---\nname: ${name}\n---\n\nbody\n`, 'utf-8');
      }
      const r = tasksRename(home, root);
      expect(r.exitCode).toBe(0);
      expect(r.output).toBe('Nothing to rename.');
      expect(fs.readdirSync(base).sort()).toEqual([...strangers].sort());
      for (const name of strangers) {
        expect(fs.readFileSync(path.join(base, name, 'SKILL.md'), 'utf-8')).toBe(`---\nname: ${name}\n---\n\nbody\n`);
      }
    } finally {
      cleanTmp(home); cleanTmp(root);
    }
  });

  it('a plain file (not a directory) with a legacy name is left alone', () => {
    const home = makeTmpDir('ts-tr-file-home');
    const root = makeTmpDir('ts-tr-file-root');
    try {
      const base = path.join(home, '.claude', 'scheduled-tasks');
      fs.mkdirSync(base, { recursive: true });
      fs.writeFileSync(path.join(base, 'hygiene'), 'not a task dir\n', 'utf-8');
      const r = tasksRename(home, root);
      expect(r.exitCode).toBe(0);
      expect(r.output).toBe('Nothing to rename.');
      expect(fs.readFileSync(path.join(base, 'hygiene'), 'utf-8')).toBe('not a task dir\n');
    } finally {
      cleanTmp(home); cleanTmp(root);
    }
  });
});

// ---------------------------------------------------------------------------
// `cortex tasks` CLI dispatch — argument guards (no fs writes)
// ---------------------------------------------------------------------------
describe('cortex tasks: CLI dispatch guards', () => {
  it('unknown subcommand → error, exit 1', async () => {
    const { run } = await import('../../../src/cli/cli.js');
    expect(await run(['tasks', 'wat'])).toBe(1);
    expect(await run(['tasks'])).toBe(1);
  });
});
