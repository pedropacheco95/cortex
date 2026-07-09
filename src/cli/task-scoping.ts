/**
 * Scheduled-task project scoping (spec core-cli.task-scoping; schema §9.1).
 *
 * `~/.claude/scheduled-tasks/` is one global namespace per user, so every
 * Cortex-managed task name is project-scoped: `<project-slug>-<canonical>`
 * (e.g. `cortex-cortex-pulse-hygiene` — the Desktop app prettifies the id
 * dash→space for display, so the plain form reads "Cortex cortex pulse
 * hygiene"). When the plain name is already owned by a DIFFERENT project
 * (two same-named folders), the name falls back to
 * `<project-slug>-<short-hash>-<canonical>`. Ownership is recorded by a
 * deterministic marker comment in the payload SKILL.md body
 * (`<!-- cortex-project-root: /abs/path -->`). The task name is
 * registration identity only — the SKILL.md prompt body invokes the
 * underlying skill by its real name (§9.1).
 *
 * Deterministic Core (R-001): pure string/hash helpers plus plain file I/O
 * for `cortex tasks rename` and the legacy-dir migration; no LLM calls.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

/**
 * Internal short id → canonical task name (schema §9.1 Cortex-managed tasks;
 * the FOURTEEN of schema 3.0 — `anatomy-refresh-deep` deregistered at
 * build-order-v3 step 7, `session-observe` registered at step 6). Keys are
 * the `SCHEDULED_TASKS` internal ids (templates.ts); values are the full
 * §9.1 canonical identities.
 */
export const CANONICAL_TASK_NAMES: Readonly<Record<string, string>> = {
  'hygiene': 'cortex-pulse-hygiene',
  'distil': 'cortex-pulse-distil',
  'skill-suggest': 'cortex-loop-skill-suggest',
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
};

/**
 * Canonical names deregistered at v3 (build-order-v3 steps 5e and 7, design
 * §8.3, §5.10): the v2 insight pair and the anatomy deep-refresh. `cortex
 * init` removes this project's scoped task dirs for these (plain AND
 * hash-fallback forms); `cortex-loop-insight-refresh-fast` never appears
 * here — it is the git post-commit hook, not a scheduled task (schema §9.1).
 */
export const RETIRED_CANONICAL_TASK_NAMES: readonly string[] = [
  'cortex-loop-insight-refresh',
  'cortex-loop-insight-gaps',
  'cortex-loop-anatomy-refresh-deep',
];

/** The fourteen registered canonical task names (suffix set for recognition). */
const CANONICAL_SET: ReadonlySet<string> = new Set(Object.values(CANONICAL_TASK_NAMES));

/**
 * Every unscoped name a Cortex task may exist under on disk from before
 * scoping landed: the internal short ids AND the canonical names (either may
 * exist — `cortex tasks rename` claims both for the current project).
 */
export const legacyTaskNames: readonly string[] = [
  ...new Set([...Object.keys(CANONICAL_TASK_NAMES), ...Object.values(CANONICAL_TASK_NAMES)]),
];

/** Legacy on-disk name → canonical task name (undefined = not a known Cortex task). */
function legacyToCanonical(name: string): string | undefined {
  return CANONICAL_TASK_NAMES[name] ?? (CANONICAL_SET.has(name) ? name : undefined);
}

/**
 * §9.1 project slug: the resolved root's folder name, lowercased; every
 * character outside `[a-z0-9-]` replaced with `-`; consecutive `-` collapsed;
 * leading/trailing `-` trimmed; empty result → `project`.
 */
export function projectTaskSlug(root: string): string {
  const slug = path
    .basename(path.resolve(root))
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'project';
}

/**
 * §9.1 short hash (collision-fallback component): first 6 hex chars of
 * SHA256 of the project root's absolute path (resolved, no trailing slash —
 * `path.resolve` guarantees both).
 */
export function projectTaskHash(root: string): string {
  return createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 6);
}

/**
 * `<project-slug>-<canonical-task-name>` (§9.1, the plain default form).
 * Pure — collision awareness lives in `resolveScopedTaskName`.
 */
export function scopedTaskName(root: string, canonical: string): string {
  return `${projectTaskSlug(root)}-${canonical}`;
}

/**
 * `<project-slug>-<short-hash>-<canonical-task-name>` (§9.1 collision
 * fallback; also the pre-revision legacy grammar every task dir carried).
 * Used when the plain name is owned by a different project, and by the
 * legacy-dir migration / registry legacy-id matching.
 */
export function hashScopedTaskName(root: string, canonical: string): string {
  return `${projectTaskSlug(root)}-${projectTaskHash(root)}-${canonical}`;
}

// ---------------------------------------------------------------------------
// Ownership marker (§9.1) — how a plain-named payload dir declares its project
// ---------------------------------------------------------------------------

/**
 * The deterministic ownership marker Cortex stamps into every payload
 * SKILL.md body it writes or migrates: an HTML comment carrying the resolved
 * project root. Chosen over a frontmatter key (the Desktop app parses the
 * frontmatter; an unknown key risks rejection) and over a sidecar file (the
 * SKILL.md is the only artefact the payload contract owns). Absence of the
 * marker means "owner unknown" — never proof of foreignness.
 */
const OWNER_MARKER_RE = /<!--\s*cortex-project-root:\s*(.+?)\s*-->/;

function ownerMarkerLine(root: string): string {
  return `<!-- cortex-project-root: ${path.resolve(root)} -->`;
}

/**
 * The project root recorded in a task dir's SKILL.md ownership marker, or
 * undefined when the dir/SKILL.md/marker is missing.
 */
export function taskDirProjectRoot(taskDir: string): string | undefined {
  const skillPath = path.join(taskDir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return undefined;
  const m = OWNER_MARKER_RE.exec(fs.readFileSync(skillPath, 'utf-8'));
  return m ? m[1] : undefined;
}

/**
 * §9.1 collision resolution: the plain `<slug>-<canonical>` name unless that
 * dir already exists in `tasksDir` carrying an ownership marker for a
 * DIFFERENT project root — then `<slug>-<hash6>-<canonical>`. A plain dir
 * without a marker is claimed as ours (a positive mismatch is required to
 * fall back): every dir Cortex places at a plain name is stamped, so an
 * unmarked one is either our own user-edited payload or a hand-made stranger
 * improbably matching the grammar.
 */
export function resolveScopedTaskName(tasksDir: string, root: string, canonical: string): string {
  const plain = scopedTaskName(root, canonical);
  const owner = taskDirProjectRoot(path.join(tasksDir, plain));
  if (owner !== undefined && owner !== path.resolve(root)) {
    return hashScopedTaskName(root, canonical);
  }
  return plain;
}

/**
 * Recognition (§9.1, spec Rule 3): a directory name is one of THIS project's
 * tasks iff it is this project's plain `<slug>-<canonical>` name or its
 * hash-fallback `<slug>-<hash6>-<canonical>` name. When `tasksDir` is given,
 * a plain-form match is additionally checked against the dir's ownership
 * marker — a marker naming a different project root rejects it (same-slug
 * projects share plain names by construction; the marker disambiguates).
 */
export function isOwnScopedTask(root: string, dirName: string, tasksDir?: string): boolean {
  const slug = projectTaskSlug(root);
  const hashPrefix = `${slug}-${projectTaskHash(root)}-`;
  if (dirName.startsWith(hashPrefix) && CANONICAL_SET.has(dirName.slice(hashPrefix.length))) {
    return true;
  }
  const plainPrefix = `${slug}-`;
  if (dirName.startsWith(plainPrefix) && CANONICAL_SET.has(dirName.slice(plainPrefix.length))) {
    if (tasksDir !== undefined) {
      const owner = taskDirProjectRoot(path.join(tasksDir, dirName));
      if (owner !== undefined && owner !== path.resolve(root)) return false;
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// `cortex tasks rename` + legacy-dir migration (spec Rule 4)
// ---------------------------------------------------------------------------

export interface TasksRenameResult {
  exitCode: number;
  output: string;
}

/**
 * Claim a moved/migrated task dir's SKILL.md for this project: rewrite ONLY
 * the frontmatter `name:` line and stamp/refresh the ownership marker
 * directly after the frontmatter block; every other body byte stays
 * identical. Missing SKILL.md or missing frontmatter → no-op.
 */
function claimSkillMd(skillPath: string, scopedName: string, root: string): void {
  if (!fs.existsSync(skillPath)) return;
  const raw = fs.readFileSync(skillPath, 'utf-8');
  const m = /^---\r?\n[\s\S]*?\r?\n---/.exec(raw);
  if (!m) return;
  const block = m[0];
  const nextBlock = block.replace(/^name:[^\n]*$/m, `name: ${scopedName}`);
  let body = raw.slice(block.length);
  if (OWNER_MARKER_RE.test(body)) {
    body = body.replace(OWNER_MARKER_RE, ownerMarkerLine(root));
  } else {
    body = `\n\n${ownerMarkerLine(root)}${body}`;
  }
  const next = nextBlock + body;
  if (next === raw) return;
  fs.writeFileSync(skillPath, next, 'utf-8');
}

/**
 * Migrate this project's pre-revision `<slug>-<hash6>-<canonical>` task dirs
 * to their resolved current names (plain, or hash-fallback when the plain
 * name is owned by another project — in which case source == target and
 * nothing moves). Rewrites the frontmatter `name:` and stamps the ownership
 * marker on each moved dir. Idempotent; returns one report line per action.
 * Runs on every `cortex init`, `cortex tasks plan|register|rename` (the
 * self-heal paths).
 */
export function migrateHashScopedTaskDirs(home: string, root: string): string[] {
  const baseDir = path.join(home, '.claude', 'scheduled-tasks');
  const lines: string[] = [];
  if (!fs.existsSync(baseDir)) return lines;
  for (const canonical of CANONICAL_SET) {
    const legacy = hashScopedTaskName(root, canonical);
    const legacyPath = path.join(baseDir, legacy);
    if (!fs.existsSync(legacyPath) || !fs.statSync(legacyPath).isDirectory()) continue;
    const target = resolveScopedTaskName(baseDir, root, canonical);
    if (target === legacy) continue; // plain name owned by another project — hash form IS current
    const targetPath = path.join(baseDir, target);
    if (fs.existsSync(targetPath)) {
      lines.push(`Skipped "${legacy}": target "${target}" already exists — legacy entry left in place.`);
      continue;
    }
    fs.renameSync(legacyPath, targetPath);
    claimSkillMd(path.join(targetPath, 'SKILL.md'), target, root);
    lines.push(`Renamed "${legacy}" -> "${target}".`);
  }
  return lines;
}

/**
 * `cortex tasks rename` — migrate every prior naming generation to the
 * current one: (a) this project's `<slug>-<hash6>-<canonical>` dirs move to
 * their resolved names; (b) unscoped legacy-named dirs (internal short ids
 * and bare canonical names — they carry no project identity, so this command
 * claims them for the current project: the one-time migration reality) move
 * to this project's resolved scoped names. Each move rewrites the
 * frontmatter `name:` and stamps the ownership marker; the rest of the body
 * stays byte-identical.
 *
 * Idempotent: nothing legacy → "Nothing to rename.", exit 0. Target already
 * exists → skip that entry with a notice, exit 0. Names outside the known
 * legacy set are never touched.
 */
export function tasksRename(home: string, root: string): TasksRenameResult {
  const baseDir = path.join(home, '.claude', 'scheduled-tasks');
  const lines: string[] = [];
  let moved = 0;

  // Phase 1: this project's pre-revision hash-scoped dirs.
  const migrated = migrateHashScopedTaskDirs(home, root);
  moved += migrated.filter((l) => l.startsWith('Renamed')).length;
  lines.push(...migrated);

  // Phase 2: unscoped legacy names (pre-scoping generations).
  if (fs.existsSync(baseDir)) {
    const entries = fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const name of entries) {
      const canonical = legacyToCanonical(name);
      if (canonical === undefined) continue; // unknown names are never touched
      const target = resolveScopedTaskName(baseDir, root, canonical);
      const targetPath = path.join(baseDir, target);
      if (fs.existsSync(targetPath)) {
        lines.push(`Skipped "${name}": target "${target}" already exists — legacy entry left in place.`);
        continue;
      }
      fs.renameSync(path.join(baseDir, name), targetPath);
      claimSkillMd(path.join(targetPath, 'SKILL.md'), target, root);
      lines.push(`Renamed "${name}" -> "${target}".`);
      moved++;
    }
  }

  if (moved === 0) lines.push('Nothing to rename.');
  return { exitCode: 0, output: lines.join('\n') };
}
