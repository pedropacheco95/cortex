/**
 * Atomic tests for core-cli.task-scoping — slug edge cases, hash stability,
 * canonical-map completeness pinned against SCHEDULED_TASKS, legacyTaskNames
 * coverage, plain-name/hash-fallback resolution with the ownership marker,
 * isOwnScopedTask negatives, rename + hash-dir migration mechanics, and the
 * `cortex tasks` CLI dispatch guards.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import {
  CANONICAL_TASK_NAMES,
  RETIRED_CANONICAL_TASK_NAMES,
  legacyTaskNames,
  projectTaskSlug,
  projectTaskHash,
  scopedTaskName,
  hashScopedTaskName,
  resolveScopedTaskName,
  taskDirProjectRoot,
  migrateHashScopedTaskDirs,
  isOwnScopedTask,
  tasksRename,
} from '../../../src/cli/task-scoping.js';
import { SCHEDULED_TASKS } from '../../../src/cli/templates.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

/** The five registered canonical bundle names, pinned verbatim (v3.0
 *  consolidation: the fourteen standalone loop registrations collapse into
 *  five bundles — schema §9.1; skill-suggest retired outright, its lens
 *  folded into pulse-distil). */
const CANONICALS = [
  'daily',
  'weekly-curation',
  'weekly-quality',
  'test-runner',
  'monthly-review',
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
// scopedTaskName / hashScopedTaskName — assembly
// ---------------------------------------------------------------------------
describe('scopedTaskName: <slug>-<canonical> (plain default form)', () => {
  it('assembles slug and canonical name, no hash', () => {
    expect(scopedTaskName('/tmp/My Project', 'daily')).toBe('my-project-daily');
    expect(scopedTaskName('/tmp/cortex', 'daily')).toBe('cortex-daily');
  });
});

describe('hashScopedTaskName: <slug>-<hash6>-<canonical> (collision fallback / legacy grammar)', () => {
  it('assembles slug, hash, and canonical name in order', () => {
    const root = '/tmp/My Project';
    expect(hashScopedTaskName(root, 'daily')).toBe(
      `my-project-${projectTaskHash(root)}-daily`,
    );
  });
});

// ---------------------------------------------------------------------------
// resolveScopedTaskName + taskDirProjectRoot — ownership-marker resolution
// ---------------------------------------------------------------------------
describe('resolveScopedTaskName: plain unless the plain dir is marker-owned by another project', () => {
  const marker = (root: string): string => `<!-- cortex-project-root: ${root} -->`;
  const payload = (name: string, root?: string): string =>
    `---\nname: ${name}\ndescription: "x"\n---\n${root ? `\n${marker(root)}\n` : ''}\nbody\n`;

  it('plain dir absent → plain name', () => {
    const base = makeTmpDir('ts-res-absent');
    try {
      expect(resolveScopedTaskName(base, '/tmp/work/api', 'daily')).toBe(
        'api-daily',
      );
    } finally {
      cleanTmp(base);
    }
  });

  it('plain dir marker-owned by this project → plain name', () => {
    const base = makeTmpDir('ts-res-ours');
    try {
      const dir = path.join(base, 'api-daily');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), payload('api-daily', '/tmp/work/api'), 'utf-8');
      expect(taskDirProjectRoot(dir)).toBe('/tmp/work/api');
      expect(resolveScopedTaskName(base, '/tmp/work/api', 'daily')).toBe(
        'api-daily',
      );
    } finally {
      cleanTmp(base);
    }
  });

  it('plain dir marker-owned by a DIFFERENT project → hash fallback', () => {
    const base = makeTmpDir('ts-res-foreign');
    try {
      const dir = path.join(base, 'api-daily');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), payload('api-daily', '/tmp/personal/api'), 'utf-8');
      expect(resolveScopedTaskName(base, '/tmp/work/api', 'daily')).toBe(
        hashScopedTaskName('/tmp/work/api', 'daily'),
      );
    } finally {
      cleanTmp(base);
    }
  });

  it('plain dir without a marker (or without a SKILL.md) is claimed as ours — no positive mismatch, no fallback', () => {
    const base = makeTmpDir('ts-res-unmarked');
    try {
      const dir = path.join(base, 'api-daily');
      fs.mkdirSync(dir, { recursive: true });
      expect(taskDirProjectRoot(dir)).toBeUndefined();
      expect(resolveScopedTaskName(base, '/tmp/work/api', 'daily')).toBe(
        'api-daily',
      );
      fs.writeFileSync(path.join(dir, 'SKILL.md'), payload('api-daily'), 'utf-8');
      expect(resolveScopedTaskName(base, '/tmp/work/api', 'daily')).toBe(
        'api-daily',
      );
    } finally {
      cleanTmp(base);
    }
  });
});

// ---------------------------------------------------------------------------
// Canonical map — completeness pinned against SCHEDULED_TASKS
// ---------------------------------------------------------------------------
describe('CANONICAL_TASK_NAMES: internal-id→canonical map (schema §9.1)', () => {
  it('its keys are exactly the SCHEDULED_TASKS internal ids', () => {
    expect(Object.keys(CANONICAL_TASK_NAMES).sort()).toEqual(SCHEDULED_TASKS.map((t) => t.name).sort());
  });

  it('its values are exactly the five §9.1 canonical bundle names', () => {
    expect(Object.values(CANONICAL_TASK_NAMES).sort()).toEqual([...CANONICALS].sort());
  });

  it('pins each id→canonical row verbatim (bundle ids ARE their canonical names)', () => {
    expect(CANONICAL_TASK_NAMES).toEqual({
      'daily': 'daily',
      'weekly-curation': 'weekly-curation',
      'weekly-quality': 'weekly-quality',
      'test-runner': 'test-runner',
      'monthly-review': 'monthly-review',
    });
  });
});

// ---------------------------------------------------------------------------
// legacyTaskNames — both unscoped families
// ---------------------------------------------------------------------------
describe('legacyTaskNames: the internal short ids AND the unscoped canonical names', () => {
  it('contains every internal id and every canonical name, deduped (5 total — ids and canonicals coincide)', () => {
    for (const id of Object.keys(CANONICAL_TASK_NAMES)) {
      expect(legacyTaskNames, id).toContain(id);
    }
    for (const canonical of CANONICALS) {
      expect(legacyTaskNames, canonical).toContain(canonical);
    }
    // 5 ids + 5 canonicals, all shared (the bundle grammar has no separate short id).
    expect(new Set(legacyTaskNames).size).toBe(legacyTaskNames.length);
    expect(legacyTaskNames).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// RETIRED_CANONICAL_TASK_NAMES — both retirement generations, pinned verbatim
// ---------------------------------------------------------------------------
describe('RETIRED_CANONICAL_TASK_NAMES: pre-v3 deregistrations + the fourteen superseded standalones', () => {
  it('pins the pre-v3 trio and ALL fourteen pre-consolidation loop canonicals', () => {
    expect([...RETIRED_CANONICAL_TASK_NAMES].sort()).toEqual(
      [
        // (a) pre-v3 deregistrations.
        'cortex-loop-insight-refresh',
        'cortex-loop-insight-gaps',
        'cortex-loop-anatomy-refresh-deep',
        // (b) the fourteen standalone loop canonicals, superseded by the five bundles.
        'cortex-pulse-hygiene',
        'cortex-pulse-distil',
        'cortex-loop-skill-suggest',
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
      ].sort(),
    );
  });

  it('never overlaps the live canonical set', () => {
    for (const retired of RETIRED_CANONICAL_TASK_NAMES) {
      expect(Object.values(CANONICAL_TASK_NAMES), retired).not.toContain(retired);
    }
  });
});

// ---------------------------------------------------------------------------
// isOwnScopedTask — negatives included
// ---------------------------------------------------------------------------
describe('isOwnScopedTask: recognition matches only this project (spec Rule 3)', () => {
  const root = '/tmp/work/api';
  const other = '/tmp/personal/api';
  const prefix = `${projectTaskSlug(root)}-${projectTaskHash(root)}-`;

  it('accepts all fourteen of its own plain scoped names and hash-fallback names', () => {
    for (const canonical of CANONICALS) {
      expect(isOwnScopedTask(root, scopedTaskName(root, canonical)), canonical).toBe(true);
      expect(isOwnScopedTask(root, hashScopedTaskName(root, canonical)), canonical).toBe(true);
    }
  });

  it("rejects another project's hash-fallback names (same slug, different hash)", () => {
    for (const canonical of CANONICALS) {
      expect(
        isOwnScopedTask(root, `${projectTaskSlug(other)}-${projectTaskHash(other)}-${canonical}`),
        canonical,
      ).toBe(false);
    }
  });

  it("with a tasksDir, rejects a same-slug plain name whose marker names another project's root", () => {
    const base = makeTmpDir('ts-own-marker');
    try {
      const dir = path.join(base, 'api-daily');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'SKILL.md'),
        `---\nname: api-daily\n---\n\n<!-- cortex-project-root: ${other} -->\n\nbody\n`,
        'utf-8',
      );
      expect(isOwnScopedTask(root, 'api-daily', base)).toBe(false);
      expect(isOwnScopedTask(other, 'api-daily', base)).toBe(true);
      // Unmarked plain dirs stay claimable (no positive mismatch).
      fs.rmSync(path.join(dir, 'SKILL.md'));
      expect(isOwnScopedTask(root, 'api-daily', base)).toBe(true);
    } finally {
      cleanTmp(base);
    }
  });

  it('rejects prefix-colliding user tasks whose suffix is not a canonical name', () => {
    expect(isOwnScopedTask(root, `${prefix}daily-report`)).toBe(false);
    expect(isOwnScopedTask(root, `${prefix}daily-mine`)).toBe(false);
    expect(isOwnScopedTask(root, `${prefix}weekly`)).toBe(false); // partial canonical is not a canonical suffix
    expect(isOwnScopedTask(root, prefix)).toBe(false); // empty suffix
    expect(isOwnScopedTask(root, 'api-daily-report')).toBe(false); // plain prefix, unknown suffix
    expect(isOwnScopedTask(root, 'api-weekly')).toBe(false); // partial canonical is not a canonical suffix
  });

  it('rejects unscoped legacy names and non-Cortex entries', () => {
    expect(isOwnScopedTask(root, 'hygiene')).toBe(false);
    expect(isOwnScopedTask(root, 'daily')).toBe(false);
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

  it('renames a canonical-named legacy dir, rewriting the frontmatter name and stamping the ownership marker; the rest is byte-identical', () => {
    const home = makeTmpDir('ts-tr-canon-home');
    const root = makeTmpDir('ts-tr-canon-root');
    try {
      const base = path.join(home, '.claude', 'scheduled-tasks');
      const src = path.join(base, 'test-runner');
      fs.mkdirSync(src, { recursive: true });
      const tail = '\ndescription: "Run the cascade."\n---\n\n# test-runner\n\nInvoke the `cortex-loop-test-runner` skill.\n';
      fs.writeFileSync(path.join(src, 'SKILL.md'), `---\nname: test-runner${tail}`, 'utf-8');

      const r = tasksRename(home, root);
      const scoped = scopedTaskName(root, 'test-runner');
      expect(r.exitCode).toBe(0);
      expect(fs.existsSync(src)).toBe(false);
      // Only the name: line changed and the marker was inserted after the
      // frontmatter; description and body bytes are otherwise identical.
      const [head, body] = tail.split('---\n');
      expect(fs.readFileSync(path.join(base, scoped, 'SKILL.md'), 'utf-8')).toBe(
        `---\nname: ${scoped}${head}---\n\n<!-- cortex-project-root: ${path.resolve(root)} -->\n${body}`,
      );
      expect(r.output).toContain(`Renamed "test-runner" -> "${scoped}".`);
    } finally {
      cleanTmp(home); cleanTmp(root);
    }
  });

  it('migrateHashScopedTaskDirs: moves this project\'s <slug>-<hash6>-<canonical> dirs to plain names, stamping ownership', () => {
    const home = makeTmpDir('ts-mig-home');
    const root = makeTmpDir('ts-mig-root');
    try {
      const base = path.join(home, '.claude', 'scheduled-tasks');
      const legacy = hashScopedTaskName(root, 'daily');
      fs.mkdirSync(path.join(base, legacy), { recursive: true });
      const tail = '\ndescription: "Nightly."\n---\n\n# hygiene\n\nInvoke the `cortex-pulse-hygiene` skill.\n';
      fs.writeFileSync(path.join(base, legacy, 'SKILL.md'), `---\nname: ${legacy}${tail}`, 'utf-8');
      // A foreign project's hash-scoped dir must never move.
      const foreign = hashScopedTaskName('/some/other/project', 'daily');
      fs.mkdirSync(path.join(base, foreign), { recursive: true });

      const lines = migrateHashScopedTaskDirs(home, root);
      const plain = scopedTaskName(root, 'daily');
      expect(lines).toContain(`Renamed "${legacy}" -> "${plain}".`);
      expect(fs.existsSync(path.join(base, legacy))).toBe(false);
      expect(fs.existsSync(path.join(base, foreign))).toBe(true);
      const raw = fs.readFileSync(path.join(base, plain, 'SKILL.md'), 'utf-8');
      expect(raw).toContain(`name: ${plain}\n`);
      expect(taskDirProjectRoot(path.join(base, plain))).toBe(path.resolve(root));
      // Idempotent: second run does nothing.
      expect(migrateHashScopedTaskDirs(home, root)).toEqual([]);
    } finally {
      cleanTmp(home); cleanTmp(root);
    }
  });

  it('migrateHashScopedTaskDirs: when the plain name is marker-owned by another project, the hash dir stays put (it IS the resolved name)', () => {
    const home = makeTmpDir('ts-mig-coll-home');
    const parent = makeTmpDir('ts-mig-coll');
    try {
      const rootA = path.join(parent, 'work', 'api');
      const rootB = path.join(parent, 'personal', 'api');
      fs.mkdirSync(rootA, { recursive: true });
      fs.mkdirSync(rootB, { recursive: true });
      const base = path.join(home, '.claude', 'scheduled-tasks');
      // Project A owns the plain name.
      const plain = scopedTaskName(rootA, 'daily');
      fs.mkdirSync(path.join(base, plain), { recursive: true });
      fs.writeFileSync(
        path.join(base, plain, 'SKILL.md'),
        `---\nname: ${plain}\n---\n\n<!-- cortex-project-root: ${rootA} -->\n\nbody\n`,
        'utf-8',
      );
      // Project B (same slug) has a legacy hash dir.
      const legacyB = hashScopedTaskName(rootB, 'daily');
      fs.mkdirSync(path.join(base, legacyB), { recursive: true });
      fs.writeFileSync(path.join(base, legacyB, 'SKILL.md'), `---\nname: ${legacyB}\n---\n\nbody\n`, 'utf-8');

      expect(migrateHashScopedTaskDirs(home, rootB)).toEqual([]);
      expect(fs.existsSync(path.join(base, legacyB))).toBe(true);
      expect(fs.readFileSync(path.join(base, plain, 'SKILL.md'), 'utf-8')).toContain(rootA);
    } finally {
      cleanTmp(home); cleanTmp(parent);
    }
  });

  it('a legacy dir without a SKILL.md is still moved without error', () => {
    const home = makeTmpDir('ts-tr-bare-home');
    const root = makeTmpDir('ts-tr-bare-root');
    try {
      const base = path.join(home, '.claude', 'scheduled-tasks');
      fs.mkdirSync(path.join(base, 'weekly-curation'), { recursive: true });
      const r = tasksRename(home, root);
      expect(r.exitCode).toBe(0);
      expect(fs.existsSync(path.join(base, 'weekly-curation'))).toBe(false);
      expect(fs.existsSync(path.join(base, scopedTaskName(root, 'weekly-curation')))).toBe(true);
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
        'dailyish', // near-miss of "daily"
        'daily-extra', // canonical prefix, unknown name
        'cortex-pulse-hygiene-mine', // retired-canonical prefix, unknown name
        scopedTaskName('/some/other/project', 'daily'), // already scoped (foreign)
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
      fs.writeFileSync(path.join(base, 'daily'), 'not a task dir\n', 'utf-8');
      const r = tasksRename(home, root);
      expect(r.exitCode).toBe(0);
      expect(r.output).toBe('Nothing to rename.');
      expect(fs.readFileSync(path.join(base, 'daily'), 'utf-8')).toBe('not a task dir\n');
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
