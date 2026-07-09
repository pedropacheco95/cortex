/**
 * Spec tests for core-cli.task-scoping — one describe per Acceptance
 * Criterion (5 ACs). Every test uses fake home directories; the real
 * ~/.claude is never touched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import matter from 'gray-matter';
import { init } from '../../../src/cli/init.js';
import { SCHEDULED_TASKS } from '../../../src/cli/templates.js';
import {
  CANONICAL_TASK_NAMES,
  projectTaskSlug,
  projectTaskHash,
  scopedTaskName,
  isOwnScopedTask,
  tasksRename,
} from '../../../src/cli/task-scoping.js';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';

const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const };

// ---------------------------------------------------------------------------
// AC1: Scoped name construction
// ---------------------------------------------------------------------------
describe('AC1: scoped name construction', () => {
  it('project "My API_v2" → my-api-v2-<h6>-cortex-pulse-hygiene, h6 = first 6 hex of SHA256(abs path)', () => {
    const parent = makeTmpDir('ts-ac1');
    try {
      const root = path.join(parent, 'My API_v2');
      fs.mkdirSync(root);
      const h6 = createHash('sha256').update(root).digest('hex').slice(0, 6);
      expect(scopedTaskName(root, 'cortex-pulse-hygiene')).toBe(`my-api-v2-${h6}-cortex-pulse-hygiene`);
      expect(h6).toMatch(/^[0-9a-f]{6}$/);
    } finally {
      cleanTmp(parent);
    }
  });
});

// ---------------------------------------------------------------------------
// AC2: Two same-named projects don't collide
// ---------------------------------------------------------------------------
describe("AC2: two same-named projects don't collide", () => {
  let tmp: string;
  let home: string;
  let rootA: string;
  let rootB: string;
  let resultA: { exitCode: number; summary: string };
  let resultB: { exitCode: number; summary: string };

  beforeAll(async () => {
    tmp = makeTmpDir('ts-ac2');
    home = makeTmpDir('ts-ac2-home');
    rootA = path.join(tmp, 'work', 'api');
    rootB = path.join(tmp, 'personal', 'api');
    fs.mkdirSync(rootA, { recursive: true });
    fs.mkdirSync(rootB, { recursive: true });
    resultA = await init(rootA, { noLlm: true, home, ...DARWIN });
    resultB = await init(rootB, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT * 2);
  afterAll(() => { cleanTmp(tmp); cleanTmp(home); });

  it('the home holds two disjoint task sets, each attributable by prefix', () => {
    expect(resultA.exitCode).toBe(0);
    expect(resultB.exitCode).toBe(0);
    const base = path.join(home, '.claude', 'scheduled-tasks');
    const dirs = fs.readdirSync(base);
    expect(dirs).toHaveLength(28); // 2 × the fourteen §9.1 canonical tasks
    const ofA = dirs.filter((d) => isOwnScopedTask(rootA, d));
    const ofB = dirs.filter((d) => isOwnScopedTask(rootB, d));
    expect(ofA).toHaveLength(14);
    expect(ofB).toHaveLength(14);
    expect(ofA.filter((d) => ofB.includes(d))).toHaveLength(0);
    // Same slug (the Desktop-scannable part), disambiguated by the path hash.
    expect(projectTaskSlug(rootA)).toBe('api');
    expect(projectTaskSlug(rootB)).toBe('api');
    expect(projectTaskHash(rootA)).not.toBe(projectTaskHash(rootB));
  });

  it('zero overwrites: the second init wrote all fresh (nothing preserved) and every frontmatter name matches its dir', () => {
    expect(resultB.summary).toMatch(/Scheduled tasks: 14 written/);
    expect(resultB.summary).not.toMatch(/preserved/);
    const base = path.join(home, '.claude', 'scheduled-tasks');
    for (const dir of fs.readdirSync(base)) {
      const data = matter(fs.readFileSync(path.join(base, dir, 'SKILL.md'), 'utf-8')).data;
      expect(data['name'], dir).toBe(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// AC3: Registration identity vs execution identity
// ---------------------------------------------------------------------------
describe('AC3: registration identity vs execution identity', () => {
  let root: string;
  let home: string;

  beforeAll(async () => {
    root = makeTmpDir('ts-ac3-proj');
    home = makeTmpDir('ts-ac3-home');
    await init(root, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it("every scoped task's frontmatter name: is the scoped name and its body invokes the underlying skill's real name", () => {
    const base = path.join(home, '.claude', 'scheduled-tasks');
    for (const task of SCHEDULED_TASKS) {
      const scoped = scopedTaskName(root, CANONICAL_TASK_NAMES[task.name]!);
      const raw = fs.readFileSync(path.join(base, scoped, 'SKILL.md'), 'utf-8');
      const parsed = matter(raw);
      // Registration identity: the scoped name, in frontmatter only.
      expect(parsed.data['name'], task.name).toBe(scoped);
      // Execution identity: the body invokes the underlying skill by its
      // real name and never the scoped name.
      for (const skill of task.requiredSkills) {
        expect(parsed.content, `${task.name} body does not invoke ${skill}`).toContain(skill);
      }
      expect(parsed.content, `${task.name} body leaks the scoped name`).not.toContain(scoped);
    }
  });
});

// ---------------------------------------------------------------------------
// AC4: --partial recognises only its own project
// ---------------------------------------------------------------------------
describe('AC4: --partial recognises only its own project', () => {
  let root: string;
  let otherRoot: string;
  let home: string;
  let base: string;
  let result: { exitCode: number; summary: string };

  const foreignRaw = (name: string): string =>
    `---\nname: ${name}\ndescription: "foreign project's task"\n---\n\nforeign body — must stay byte-identical\n`;
  const unrelatedRaw = '---\nname: daily-report\ndescription: "user task"\n---\n\nWrite my daily report.\n';
  let ownEdit: string;
  let foreignDirs: string[];

  beforeAll(async () => {
    root = makeTmpDir('ts-ac4-proj');
    otherRoot = makeTmpDir('ts-ac4-other');
    home = makeTmpDir('ts-ac4-home');
    base = path.join(home, '.claude', 'scheduled-tasks');

    // Another project's scoped tasks.
    foreignDirs = ['cortex-pulse-hygiene', 'specflow-lint'].map((c) => scopedTaskName(otherRoot, c));
    for (const dir of foreignDirs) {
      fs.mkdirSync(path.join(base, dir), { recursive: true });
      fs.writeFileSync(path.join(base, dir, 'SKILL.md'), foreignRaw(dir), 'utf-8');
    }
    // A user's unrelated (non-Cortex) task.
    fs.mkdirSync(path.join(base, 'daily-report'), { recursive: true });
    fs.writeFileSync(path.join(base, 'daily-report', 'SKILL.md'), unrelatedRaw, 'utf-8');
    // One of THIS project's tasks pre-exists, user-modified → preserved + counted.
    const ownScoped = scopedTaskName(root, 'cortex-pulse-hygiene');
    ownEdit = `---\nname: ${ownScoped}\ndescription: "user tuned"\n---\n\nmy tuned hygiene prompt\n`;
    fs.mkdirSync(path.join(base, ownScoped), { recursive: true });
    fs.writeFileSync(path.join(base, ownScoped, 'SKILL.md'), ownEdit, 'utf-8');

    result = await init(root, { partial: true, noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(otherRoot); cleanTmp(home); });

  it("registered/preserved counts reflect only this project's tasks (13 written + 1 preserved = 14 packaged loops)", () => {
    // Since specflow.cortex-awareness Rule 3 the packaged skills cover every
    // task, so --partial registers the full set.
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain('Scheduled tasks (--partial): 13 written');
    expect(result.summary).toContain('1 existing preserved');
    expect(result.summary).toContain('14 loop payloads on disk');
  });

  it('the foreign entries and the unrelated user task are byte-untouched', () => {
    for (const dir of foreignDirs) {
      expect(fs.readFileSync(path.join(base, dir, 'SKILL.md'), 'utf-8')).toBe(foreignRaw(dir));
    }
    expect(fs.readFileSync(path.join(base, 'daily-report', 'SKILL.md'), 'utf-8')).toBe(unrelatedRaw);
    expect(fs.readFileSync(path.join(base, scopedTaskName(root, 'cortex-pulse-hygiene'), 'SKILL.md'), 'utf-8')).toBe(ownEdit);
  });

  it('the summary never names foreign or unrelated entries', () => {
    expect(result.summary).not.toContain('daily-report');
    for (const dir of foreignDirs) {
      expect(result.summary).not.toContain(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// AC5: Rename migrates legacy tasks, idempotently
// ---------------------------------------------------------------------------
describe('AC5: rename migrates legacy tasks, idempotently', () => {
  let root: string;
  let home: string;
  let base: string;

  const hygieneBody = '\n# hygiene (Cortex scheduled task)\n\nInvoke the `cortex-pulse-hygiene` skill nightly.\n';
  const hygieneRaw = `---\nname: hygiene\ndescription: "Nightly hygiene scan."\n---${hygieneBody}`;
  const lintRaw = '---\nname: specflow-lint\ndescription: "Lint the spec trees."\n---\n\nRun the `specflow-lint` skill.\n';
  const unrelatedRaw = '---\nname: daily-report\ndescription: "user task"\n---\n\nWrite my daily report.\n';
  let scopedLintRaw: string;

  beforeAll(() => {
    root = makeTmpDir('ts-ac5-proj');
    home = makeTmpDir('ts-ac5-home');
    base = path.join(home, '.claude', 'scheduled-tasks');
    // Legacy Cortex entries (internal short id + canonical-equal name).
    fs.mkdirSync(path.join(base, 'hygiene'), { recursive: true });
    fs.writeFileSync(path.join(base, 'hygiene', 'SKILL.md'), hygieneRaw, 'utf-8');
    fs.mkdirSync(path.join(base, 'specflow-lint'), { recursive: true });
    fs.writeFileSync(path.join(base, 'specflow-lint', 'SKILL.md'), lintRaw, 'utf-8');
    // An unrelated user task.
    fs.mkdirSync(path.join(base, 'daily-report'), { recursive: true });
    fs.writeFileSync(path.join(base, 'daily-report', 'SKILL.md'), unrelatedRaw, 'utf-8');
    // A pre-existing scoped target for one legacy entry → collision.
    const scopedLint = scopedTaskName(root, 'specflow-lint');
    scopedLintRaw = `---\nname: ${scopedLint}\ndescription: "already migrated"\n---\n\nalready-scoped body\n`;
    fs.mkdirSync(path.join(base, scopedLint), { recursive: true });
    fs.writeFileSync(path.join(base, scopedLint, 'SKILL.md'), scopedLintRaw, 'utf-8');
  });
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('first run: moves legacy entries to scoped names (frontmatter rewritten, body byte-identical), skips the collision with a notice, leaves daily-report untouched, reports each move, exit 0', () => {
    const r = tasksRename(home, root);
    expect(r.exitCode).toBe(0);

    // hygiene moved: dir gone, scoped dir present, name: rewritten, body byte-identical.
    const scopedHygiene = scopedTaskName(root, 'cortex-pulse-hygiene');
    expect(fs.existsSync(path.join(base, 'hygiene'))).toBe(false);
    const moved = fs.readFileSync(path.join(base, scopedHygiene, 'SKILL.md'), 'utf-8');
    expect(moved).toBe(`---\nname: ${scopedHygiene}\ndescription: "Nightly hygiene scan."\n---${hygieneBody}`);
    expect(r.output).toContain(`Renamed "hygiene" -> "${scopedHygiene}".`);

    // Collision skipped with a notice; both sides byte-untouched.
    const scopedLint = scopedTaskName(root, 'specflow-lint');
    expect(fs.readFileSync(path.join(base, 'specflow-lint', 'SKILL.md'), 'utf-8')).toBe(lintRaw);
    expect(fs.readFileSync(path.join(base, scopedLint, 'SKILL.md'), 'utf-8')).toBe(scopedLintRaw);
    expect(r.output).toContain(`Skipped "specflow-lint": target "${scopedLint}" already exists`);

    // Unrelated user task untouched and never mentioned.
    expect(fs.readFileSync(path.join(base, 'daily-report', 'SKILL.md'), 'utf-8')).toBe(unrelatedRaw);
    expect(r.output).not.toContain('daily-report');
  });

  it('second run: reports nothing to rename, exit 0, and moves nothing', () => {
    const before = snapshotTree(base);
    const r = tasksRename(home, root);
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain('Nothing to rename.');
    expect(snapshotTree(base)).toEqual(before);
  });
});
