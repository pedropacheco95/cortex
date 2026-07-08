/**
 * Scheduled-task project scoping (spec core-cli.task-scoping; schema §9.1).
 *
 * `~/.claude/scheduled-tasks/` is one global namespace per user, so every
 * Cortex-managed task name is project-scoped:
 * `<project-slug>-<short-hash>-<canonical-task-name>`. The task name is
 * registration identity only — the SKILL.md prompt body invokes the
 * underlying skill by its real name (§9.1).
 *
 * Deterministic Core (R-001): pure string/hash helpers plus plain file I/O
 * for `cortex tasks rename`; no LLM calls.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

/**
 * Internal short id → canonical task name (schema §9.1, the fourteen
 * Cortex-managed tasks). Keys are the `SCHEDULED_TASKS` internal ids
 * (templates.ts); values are the full §9.1 canonical identities.
 */
export const CANONICAL_TASK_NAMES: Readonly<Record<string, string>> = {
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
  'insight-refresh': 'cortex-loop-insight-refresh',
  'insight-gaps': 'cortex-loop-insight-gaps',
};

/** The fourteen §9.1 canonical task names (suffix set for recognition). */
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
 * §9.1 short hash: first 6 hex chars of SHA256 of the project root's
 * absolute path (resolved, no trailing slash — `path.resolve` guarantees both).
 */
export function projectTaskHash(root: string): string {
  return createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 6);
}

/** `<project-slug>-<short-hash>-<canonical-task-name>` (§9.1). */
export function scopedTaskName(root: string, canonical: string): string {
  return `${projectTaskSlug(root)}-${projectTaskHash(root)}-${canonical}`;
}

/**
 * Recognition (§9.1, spec Rule 3): a directory name is one of THIS project's
 * tasks iff it carries this project's `<slug>-<hash>-` prefix AND the
 * remainder is one of the twelve canonical task names. Other projects'
 * tasks, prefix-colliding user tasks, and non-Cortex entries are all false.
 */
export function isOwnScopedTask(root: string, dirName: string): boolean {
  const prefix = `${projectTaskSlug(root)}-${projectTaskHash(root)}-`;
  return dirName.startsWith(prefix) && CANONICAL_SET.has(dirName.slice(prefix.length));
}

// ---------------------------------------------------------------------------
// `cortex tasks rename` — one-time legacy migration (spec Rule 4)
// ---------------------------------------------------------------------------

export interface TasksRenameResult {
  exitCode: number;
  output: string;
}

/**
 * Rewrite ONLY the frontmatter `name:` line of a moved task's SKILL.md; the
 * body (everything after the closing `---`) stays byte-identical.
 */
function rewriteFrontmatterName(skillPath: string, scopedName: string): void {
  if (!fs.existsSync(skillPath)) return;
  const raw = fs.readFileSync(skillPath, 'utf-8');
  const m = /^---\r?\n[\s\S]*?\r?\n---/.exec(raw);
  if (!m) return;
  const block = m[0];
  const nextBlock = block.replace(/^name:[^\n]*$/m, `name: ${scopedName}`);
  if (nextBlock === block) return;
  fs.writeFileSync(skillPath, nextBlock + raw.slice(block.length), 'utf-8');
}

/**
 * Enumerate legacy-named task dirs in `<home>/.claude/scheduled-tasks/`, move
 * each to this project's scoped name, rewrite the frontmatter `name:` only,
 * and report each move. Legacy names carry no project identity — this command
 * claims them for the current project (the one-time migration reality).
 *
 * Idempotent: nothing legacy → "Nothing to rename.", exit 0. Target already
 * exists → skip that entry with a notice, exit 0. Names outside the known
 * legacy set are never touched.
 */
export function tasksRename(home: string, root: string): TasksRenameResult {
  const baseDir = path.join(home, '.claude', 'scheduled-tasks');
  const lines: string[] = [];
  let moved = 0;

  if (fs.existsSync(baseDir)) {
    const entries = fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const name of entries) {
      const canonical = legacyToCanonical(name);
      if (canonical === undefined) continue; // unknown names are never touched
      const target = scopedTaskName(root, canonical);
      const targetPath = path.join(baseDir, target);
      if (fs.existsSync(targetPath)) {
        lines.push(`Skipped "${name}": target "${target}" already exists — legacy entry left in place.`);
        continue;
      }
      fs.renameSync(path.join(baseDir, name), targetPath);
      rewriteFrontmatterName(path.join(targetPath, 'SKILL.md'), target);
      lines.push(`Renamed "${name}" -> "${target}".`);
      moved++;
    }
  }

  if (moved === 0) lines.push('Nothing to rename.');
  return { exitCode: 0, output: lines.join('\n') };
}
