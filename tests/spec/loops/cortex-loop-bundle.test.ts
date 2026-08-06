/**
 * Spec tests for loops.cortex-loop-bundle — the eleven per-loop skill bundles
 * merged into one callable-only `cortex-loop` with a reference file per loop.
 *
 * The invariant worth defending is that this was a PACKAGING change: the loops
 * kept their CLI verbs, output paths, cadences, models, order, and failure
 * isolation, and only the directory housing their instructions moved.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { SCHEDULED_TASKS, scopeTaskToProfile, SCHEMA_VERSION } from '../../../src/cli/templates.js';
import { SKILL_MIGRATIONS, listSkillBundles } from '../../../src/cli/scaffold.js';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SKILLS = path.join(PKG_ROOT, 'skills');
const LOOP = path.join(SKILLS, 'cortex-loop');
const PARENT = fs.readFileSync(path.join(LOOP, 'SKILL.md'), 'utf-8');

/** short id → the CLI verb and output path the loop had as a standalone bundle. */
const LOOPS: Record<string, { verb: string; writes: string }> = {
  hygiene: { verb: 'cortex pulse-hygiene', writes: '.cortex/pulse/reports/hygiene.md' },
  'bug-triage': { verb: 'cortex loop-bug-triage', writes: '.cortex/pulse/reports/bug-triage.md' },
  'spec-drift': { verb: 'cortex loop-spec-drift', writes: '.cortex/pulse/reports/spec-drift.md' },
  'rule-decay': { verb: 'cortex loop-rule-decay', writes: '.cortex/pulse/reports/rule-candidates.md' },
  'onboarding-drift': { verb: 'cortex loop-onboarding-drift', writes: '.cortex/pulse/reports/scaffolding-review.md' },
  'atlas-staleness': { verb: 'cortex loop-atlas-staleness', writes: '.cortex/pulse/reports/atlas-review.md' },
  // distil's output is a pulse PROPOSAL surface, not a report.
  distil: { verb: 'cortex pulse-distil', writes: '.cortex/pulse/suggestions.md' },
  'session-observe': { verb: 'cortex loop-session-observe', writes: '.cortex/pulse/reports/session-observe.md' },
  'test-runner': { verb: 'cortex loop-test-runner', writes: '.cortex/pulse/reports/test-failures.md' },
  'insight-refresh-daily': { verb: 'cortex loop-insight-refresh', writes: '.cortex/pulse/reports/insight-refresh.md' },
  'insight-refresh-full': { verb: 'cortex loop-insight-refresh', writes: '.cortex/pulse/reports/insight-refresh.md' },
};
const IDS = Object.keys(LOOPS);

/** The eleven retired bundle directory names. */
const MERGED = [
  'cortex-loop-atlas-staleness', 'cortex-loop-bug-triage', 'cortex-loop-insight-refresh-daily',
  'cortex-loop-insight-refresh-full', 'cortex-loop-onboarding-drift', 'cortex-loop-rule-decay',
  'cortex-loop-session-observe', 'cortex-loop-spec-drift', 'cortex-loop-test-runner',
  'cortex-pulse-distil', 'cortex-pulse-hygiene',
];

describe('AC: every loop has a reference file carrying its discipline', () => {
  it('there is one reference file per short id, and no extras', () => {
    const files = fs.readdirSync(path.join(LOOP, 'references')).map((f) => f.replace(/\.md$/, '')).sort();
    expect(files).toEqual([...IDS].sort());
  });

  it.each(IDS)('%s carries its CLI verb and output path', (id) => {
    const raw = fs.readFileSync(path.join(LOOP, 'references', `${id}.md`), 'utf-8');
    expect(raw).toContain(LOOPS[id]!.verb);
    expect(raw).toContain(LOOPS[id]!.writes);
  });

  it.each(IDS)('%s is substantial — a move, not a summary (Rule 2)', (id) => {
    const raw = fs.readFileSync(path.join(LOOP, 'references', `${id}.md`), 'utf-8');
    expect(raw.length, `${id} looks summarised`).toBeGreaterThan(600);
  });
});

describe('AC: the dispatch table names every reference file', () => {
  it.each(IDS)('the parent points at references/%s.md', (id) => {
    expect(PARENT).toContain(`references/${id}.md`);
  });

  it('the parent names every loop id', () => {
    for (const id of IDS) expect(PARENT).toContain(`\`${id}\``);
  });
});

describe('AC: each payload invokes cortex-loop and names the reference file', () => {
  it('no bundle body INVOKES a retired bundle', () => {
    // Invocation form is `(\`<skill>\`` — a member instruction. A prose mention of
    // the LOOP is not an invocation and stays correct: the loops still exist, and
    // cortex-schema.md itself names `cortex-loop-session-observe` as the sole
    // writer of `insight/observations/`.
    for (const task of SCHEDULED_TASKS) {
      for (const merged of MERGED) {
        expect(task.body, `${task.name} still invokes ${merged}`).not.toContain(`(\`${merged}\``);
      }
    }
  });

  it('every bundle that declares cortex-loop names at least one reference file in its body', () => {
    for (const task of SCHEDULED_TASKS) {
      if (!task.requiredSkills.includes('cortex-loop')) continue;
      expect(task.body, `${task.name} declares cortex-loop but names no reference`).toMatch(/references\/[a-z-]+\.md/);
    }
  });

  it('non-merged skills are still named directly', () => {
    const daily = SCHEDULED_TASKS.find((t) => t.name === 'daily')!;
    expect(daily.body).toContain('specflow-bugs');
    expect(daily.body).toContain('cortex-extract-insight');
  });
});

describe('AC: cadence, model, order, and failure isolation are unchanged', () => {
  it('the five canonical bundles and their models are intact', () => {
    expect(SCHEDULED_TASKS.map((t) => t.name).sort()).toEqual(
      ['daily', 'monthly-review', 'test-runner', 'weekly-curation', 'weekly-quality'],
    );
    expect(SCHEDULED_TASKS.find((t) => t.name === 'weekly-curation')!.model).toBe('claude-opus-4-8');
    for (const t of SCHEDULED_TASKS.filter((t) => t.name !== 'weekly-curation')) {
      expect(t.model).toBe('claude-sonnet-5');
    }
  });

  it('every bundle still carries its failure-isolation instruction', () => {
    for (const task of SCHEDULED_TASKS) {
      expect(task.body, task.name).toMatch(/record the failure/i);
    }
  });

  it('the daily bundle still runs its five members in order', () => {
    const body = SCHEDULED_TASKS.find((t) => t.name === 'daily')!.body;
    const order = ['pulse-hygiene', 'bug-triage', 'spec-drift', 'insight-refresh-daily', 'session-observe'];
    let cursor = -1;
    for (const member of order) {
      const at = body.indexOf(`**${member}**`);
      expect(at, `${member} missing or out of order`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });
});

describe('AC: requiredSkills names only directories that exist', () => {
  const shipped = new Set(listSkillBundles(SKILLS));

  it.each(SCHEDULED_TASKS.map((t) => [t.name, t] as const))('%s declares only shipped skills', (_name, task) => {
    for (const skill of task.requiredSkills) expect(shipped.has(skill), skill).toBe(true);
  });

  it('cortex-loop appears at most once per bundle', () => {
    for (const task of SCHEDULED_TASKS) {
      expect(task.requiredSkills.filter((s) => s === 'cortex-loop').length, task.name).toBeLessThanOrEqual(1);
    }
  });
});

describe('AC: a non-specflow profile still skips the spec loops, by instruction', () => {
  const scoped = scopeTaskToProfile(SCHEDULED_TASKS.find((t) => t.name === 'daily')!, 'superpowers')!;

  it('the worded SKIP instruction is still the mechanism', () => {
    expect(scoped.body).toContain('SKIP');
    expect(scoped.body).toContain('**bug-triage**');
    expect(scoped.body).toContain('**spec-drift**');
  });

  it('cortex-loop survives — it houses this bundle\'s Bucket-1 members too', () => {
    expect(scoped.requiredSkills).toContain('cortex-loop');
  });

  it('specflow-bugs, which has its own bundle, is still dropped', () => {
    expect(scoped.requiredSkills).not.toContain('specflow-bugs');
  });
});

describe('AC: the migration entry names all eleven at the current version', () => {
  it('one entry covers all eleven at the shipped schema version', () => {
    const naming = SKILL_MIGRATIONS.filter((m) => MERGED.some((b) => m.removed.includes(b)));
    expect(naming).toHaveLength(1);
    for (const bundle of MERGED) expect(naming[0]!.removed).toContain(bundle);
    expect(naming[0]!.version).toBe(SCHEMA_VERSION);
    expect(naming[0]!.reason).toMatch(/cortex-loop/);
  });

  it('no migration names a bundle the package still ships', () => {
    const shipped = new Set(listSkillBundles(SKILLS));
    for (const m of SKILL_MIGRATIONS) {
      for (const bundle of m.removed) expect(shipped.has(bundle), `${bundle} still shipped`).toBe(false);
    }
  });

  it('no schema bump shipped with the merge', () => {
    expect(SCHEMA_VERSION).toBe('3.3');
  });
});

describe('AC: the eleven are gone from both trees', () => {
  it.each(MERGED)('%s is absent from skills/ and .claude/skills/', (bundle) => {
    expect(fs.existsSync(path.join(SKILLS, bundle))).toBe(false);
    expect(fs.existsSync(path.join(PKG_ROOT, '.claude', 'skills', bundle))).toBe(false);
  });

  it('cortex-loop is mirrored byte-identically, references included', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
      );
    const src = walk(LOOP).map((f) => path.relative(LOOP, f)).sort();
    const mirrorDir = path.join(PKG_ROOT, '.claude', 'skills', 'cortex-loop');
    expect(walk(mirrorDir).map((f) => path.relative(mirrorDir, f)).sort()).toEqual(src);
    for (const rel of src) {
      expect(fs.readFileSync(path.join(mirrorDir, rel)).equals(fs.readFileSync(path.join(LOOP, rel))), rel).toBe(true);
    }
  });
});
