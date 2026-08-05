/**
 * Shared scaffolding mechanism behind `cortex init` (spec core-cli.init Rules
 * 4, 10, 11, 12, 13) and `cortex sync` (spec core-cli.sync, which exposes
 * this factoring per its own Notes section: init and sync call the SAME
 * mechanism here; sync additionally layers its own upgrade judgment on top
 * via the `.cortex-installed.json` marker helpers below — sync.ts owns that
 * judgment, this module owns only the mechanism, unchanged from init's
 * pre-factoring behaviour).
 *
 * Moved verbatim out of `src/cli/init.ts` (build-order-v3 sync round) — no
 * behavioural change to init from this move: every function here is
 * byte-for-byte the same logic init previously had inline, so init's existing
 * ACs/tests keep passing unmodified. `installSkills` and `writeScheduledTasks`
 * deliberately do NOT write a `.cortex-installed.json` marker themselves —
 * doing so would add a stray file to every fresh install and break the
 * existing specflow-awareness byte-identity ACs (tests/spec/specflow/awareness.test.ts),
 * which compare an `init`-installed bundle directory's file SET against the
 * shipped package bundle's file set exactly. Sync is the sole writer of that
 * marker (spec core-cli.sync Notes: "this spec's own bookkeeping file, not a
 * schema-committed artefact") — a bundle/payload with no marker is simply
 * "unknown provenance" to sync's judgment, which is itself a safe, spec-
 * sanctioned state (Rule 5/Rule 8: prompts rather than assumes safety).
 *
 * Deterministic Core (RULES 3): pure file I/O, no LLM, no network.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline/promises';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { claudeMdBlock, scheduledTaskSkillMd, type ScheduledTask, SCHEDULED_TASKS, scopeTaskToProfile } from './templates.js';
import { readProfile } from './profile.js';
import {
  CANONICAL_TASK_NAMES,
  RETIRED_CANONICAL_TASK_NAMES,
  scopedTaskName,
  hashScopedTaskName,
  resolveScopedTaskName,
  taskDirProjectRoot,
} from './task-scoping.js';

// ---------------------------------------------------------------------------
// package/bundle helpers
// ---------------------------------------------------------------------------

/** src/cli/scaffold.ts → package root is two levels up (same for dist/cli/scaffold.js). */
export function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/**
 * B-012 fix: creating and closing a brand-new `readline.Interface` on
 * `process.stdin`/`process.stdout` for EVERY question in a run that asks
 * several in a row (one per differing skill bundle, then one per differing
 * task payload) is a known Node.js footgun — rapid sequential
 * create-question-close cycles on the SAME stdin can drop or misattribute
 * buffered input between interfaces, so an answer the user typed can be lost
 * on one question while adjacent ones behave normally. Callers that ask more
 * than one question in a single command invocation (`cortex sync`, `cortex
 * init`'s skill install loop) MUST create ONE interface up front via this
 * helper and pass it to every `promptYesNo` call in that run, closing it once
 * at the end — never one-per-question.
 */
export function createPromptInterface(): readline.Interface | undefined {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return undefined;
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

/**
 * Generic non-interactive-safe y/N prompt: no TTY on either stream → false
 * ("preserve the user's copy" is always the non-interactive default).
 * Pass a `rl` from `createPromptInterface()` when asking more than one
 * question in the same run (B-012) — omit it only for a genuine single-shot
 * caller, which falls back to the old create-one-throwaway-interface shape.
 */
export async function promptYesNo(promptText: string, rl?: readline.Interface): Promise<boolean> {
  if (rl !== undefined) {
    const answer = await rl.question(promptText);
    return /^y(es)?$/i.test(answer.trim());
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const owned = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await owned.question(promptText);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    owned.close();
  }
}

/**
 * `cortex init` Rule 4 mechanism — install every shipped skill bundle absent
 * locally; prompt (or `--yes`) before overwriting one that already exists.
 * Unchanged behaviour (moved verbatim from init.ts) aside from the B-012
 * shared-interface fix below; writes no marker.
 */

/**
 * The skill bundles the package ships, as directory names.
 *
 * A bundle is a directory **containing a `SKILL.md`** — that is what makes it
 * a skill Claude Code can register. `skills/` also holds shipped reference
 * directories with no `SKILL.md` (`_conventions/`, the authoring recipe
 * hardened skills cite); those are repo-side authoring material, not skills,
 * and installing them into a project's `.claude/skills/` would put a
 * non-skill directory in a skills directory and inflate the "Skills
 * installed: N" count.
 *
 * Single source of truth for all three enumerations (install, sync, and
 * sync's progress count) so they cannot drift apart — the extraction the
 * standing authorities prefer over parallel implementations.
 */
export function listSkillBundles(srcDir: string): string[] {
  if (!fs.existsSync(srcDir)) return [];
  return fs
    .readdirSync(srcDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(srcDir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

export async function installSkills(root: string, yes: boolean): Promise<{ installed: number; preserved: number }> {
  const targetDir = path.join(root, '.claude', 'skills');
  fs.mkdirSync(targetDir, { recursive: true });

  const srcDir = path.join(packageRoot(), 'skills');
  if (!fs.existsSync(srcDir)) return { installed: 0, preserved: 0 };

  let installed = 0;
  let preserved = 0;
  const bundles = listSkillBundles(srcDir);
  // B-012: ONE shared interface for every "already exists" prompt this call
  // may ask, not one create/close cycle per bundle.
  const rl = yes ? undefined : createPromptInterface();
  try {
    for (const bundle of bundles) {
      const target = path.join(targetDir, bundle);
      if (fs.existsSync(target) && !yes) {
        const overwrite = await promptYesNo(`Skill bundle "${bundle}" already exists in .claude/skills/. Overwrite? [y/N] `, rl);
        if (!overwrite) {
          preserved++;
          continue;
        }
      }
      fs.cpSync(path.join(srcDir, bundle), target, { recursive: true });
      installed++;
    }
  } finally {
    rl?.close();
  }
  return { installed, preserved };
}

// ---------------------------------------------------------------------------
// CLAUDE.md managed block (init Rule 10 / sync Rule 3)
// ---------------------------------------------------------------------------

export function upsertClaudeMd(root: string): 'created' | 'inserted' | 'updated' | 'unchanged' {
  const claudeMdPath = path.join(root, 'CLAUDE.md');
  let projectName = path.basename(root);
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')) as Record<string, unknown>;
    if (typeof pkg['name'] === 'string' && pkg['name']) {
      // Strip a leading npm scope (@scope/name -> name) — the scope is
      // package-registry bookkeeping, not part of the human-facing label.
      const scoped = /^@[^/]+\/(.+)$/.exec(pkg['name']);
      projectName = scoped?.[1] ?? pkg['name'];
    }
  } catch {
    /* fall back to directory name */
  }
  const block = claudeMdBlock(projectName);

  if (!fs.existsSync(claudeMdPath)) {
    fs.writeFileSync(claudeMdPath, block + '\n', 'utf-8');
    return 'created';
  }

  const content = fs.readFileSync(claudeMdPath, 'utf-8');
  const blockRe = /<!-- cortex:start[^\n]*?-->[\s\S]*?<!-- cortex:end -->/;
  if (blockRe.test(content)) {
    const nextContent = content.replace(blockRe, block);
    if (nextContent === content) return 'unchanged';
    fs.writeFileSync(claudeMdPath, nextContent, 'utf-8');
    return 'updated';
  }

  const sep = content.endsWith('\n') ? '\n' : '\n\n';
  fs.writeFileSync(claudeMdPath, content + sep + block + '\n', 'utf-8');
  return 'inserted';
}

// ---------------------------------------------------------------------------
// Hooks registration (init Rule 11 / sync Rule 6)
// ---------------------------------------------------------------------------

interface HookEntry {
  event: string;
  matcher?: string;
  command: string;
}

function cortexHookEntries(preRead: boolean): HookEntry[] {
  const entries: HookEntry[] = [
    { event: 'SessionStart', command: 'cortex hook session-start' },
    { event: 'PreToolUse', matcher: 'Write|Edit', command: 'cortex hook pre-write' },
    { event: 'PostToolUse', matcher: 'Write|Edit', command: 'cortex hook post-write' },
  ];
  // The Read pair registers and unregisters together under the one
  // hooks.preRead flag (schema §5, §10.1 — default true).
  if (preRead) {
    entries.push({ event: 'PreToolUse', matcher: 'Read', command: 'cortex hook pre-read' });
    entries.push({ event: 'PostToolUse', matcher: 'Read', command: 'cortex hook post-read' });
  }
  return entries;
}

export function mergeSettings(root: string, preRead: boolean): string[] {
  const settingsPath = path.join(root, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      // Rule 16 (init) / Rule 12 (sync): never destroy an unparseable settings file.
      throw new Error(`.claude/settings.json exists but is not valid JSON; fix it and re-run`);
    }
  }

  const hooks = { ...((settings['hooks'] as Record<string, unknown> | undefined) ?? {}) };
  const registered: string[] = [];

  for (const entry of cortexHookEntries(preRead)) {
    const existingRaw = hooks[entry.event];
    const eventArr: unknown[] = Array.isArray(existingRaw) ? [...existingRaw] : [];
    const already = eventArr.some((e) => JSON.stringify(e).includes(entry.command));
    if (!already) {
      const hookObj: Record<string, unknown> = {
        ...(entry.matcher !== undefined ? { matcher: entry.matcher } : {}),
        hooks: [{ type: 'command', command: entry.command }],
      };
      eventArr.push(hookObj);
    }
    hooks[entry.event] = eventArr;
    registered.push(entry.matcher ? `${entry.event}(${entry.matcher})` : entry.event);
  }

  const merged = { ...settings, hooks };
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  return registered;
}

// ---------------------------------------------------------------------------
// Git post-commit hook (init Rule 12 / sync Rule 7)
// ---------------------------------------------------------------------------

/** The exact command the installed post-commit hook calls (schema §9.1:
 *  `cortex-loop-insight-refresh-fast` is the git hook, not a scheduled task).
 *  SOLE invocation since build-order-v3 step 7 consolidated the hook. */
export const GIT_HOOK_INVOCATION = 'cortex insight-refresh-fast';
/** Retained alias (some callers/tests referenced the insight-specific name
 *  while the dual-line hook existed). */
export const INSIGHT_GIT_HOOK_INVOCATION = GIT_HOOK_INVOCATION;
/** The retired v1/v2 anatomy invocation — init/sync strip this line (and its
 *  comment) from an existing post-commit hook (step-7 migration). */
export const RETIRED_GIT_HOOK_INVOCATION = 'cortex anatomy-refresh-fast';

const GIT_HOOK_SNIPPETS: ReadonlyArray<{ invocation: string; comment: string }> = [
  {
    invocation: GIT_HOOK_INVOCATION,
    comment: '# Cortex: fast deterministic insight change-flagging after each commit (no LLM, no extraction)',
  },
];

function gitHookSnippet(entry: { invocation: string; comment: string }): string {
  return `\n${entry.comment}\n${entry.invocation} >/dev/null 2>&1 || true\n`;
}

/**
 * Idempotently remove the retired anatomy invocation from an existing hook:
 * every line whose command is `cortex anatomy-refresh-fast` is dropped, along
 * with an immediately preceding `# Cortex:` comment line (the shape init
 * itself wrote). User content is otherwise untouched. Line-based on purpose —
 * exact-string matching would miss redirection suffixes.
 */
export function stripRetiredGitHookLines(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (line.trimStart().startsWith(RETIRED_GIT_HOOK_INVOCATION)) {
      // Drop the retired invocation; also drop the Cortex comment above it.
      const prev = out[out.length - 1] ?? '';
      if (prev.trimStart().startsWith('# Cortex:')) out.pop();
      // Collapse the blank separator the snippet carried, if doubled.
      if ((out[out.length - 1] ?? '') === '' && (out[out.length - 2] ?? '') === '') out.pop();
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

export function installGitHook(root: string): 'created' | 'appended' | 'already-installed' | 'skipped-no-git' {
  const gitDir = path.join(root, '.git');
  if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) return 'skipped-no-git';

  const hooksDir = path.join(gitDir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, 'post-commit');

  if (fs.existsSync(hookPath)) {
    const original = fs.readFileSync(hookPath, 'utf-8');
    // Step-7 migration: strip the retired anatomy line before reconciling.
    let content = stripRetiredGitHookLines(original);
    let appended = false;
    for (const entry of GIT_HOOK_SNIPPETS) {
      if (content.includes(entry.invocation)) continue;
      const sep = content.endsWith('\n') ? '' : '\n';
      content = content + sep + gitHookSnippet(entry);
      appended = true;
    }
    if (content !== original) fs.writeFileSync(hookPath, content, 'utf-8');
    fs.chmodSync(hookPath, 0o755);
    return appended ? 'appended' : 'already-installed';
  }

  fs.writeFileSync(hookPath, `#!/bin/sh${GIT_HOOK_SNIPPETS.map(gitHookSnippet).join('')}`, 'utf-8');
  fs.chmodSync(hookPath, 0o755);
  return 'created';
}

// ---------------------------------------------------------------------------
// Desktop scheduled-task payloads (init Rules 13 & 17)
// ---------------------------------------------------------------------------

export interface TaskSkillGap {
  task: string;
  missingSkills: string[];
}

export interface ScheduledTasksResult {
  written: number;
  preserved: number;
  /** Rule 17 (--partial): tasks not registered because a required skill is absent. */
  skipped: TaskSkillGap[];
  /** Default mode: tasks registered anyway whose required skill is currently absent. */
  lacking: TaskSkillGap[];
  /** Retired canonical tasks (schema §9.1 deregistration) removed for THIS project. */
  retired: string[];
}

/** A required skill is "present" iff it exists as a directory in <root>/.claude/skills/. */
function missingRequiredSkills(root: string, requiredSkills: string[]): string[] {
  return requiredSkills.filter((skill) => {
    const dir = path.join(root, '.claude', 'skills', skill);
    return !(fs.existsSync(dir) && fs.statSync(dir).isDirectory());
  });
}

/**
 * Write the SKILL.md prompt PAYLOADS under `~/.claude/scheduled-tasks/` (and
 * remove this project's retired scoped dirs). Payloads are NOT registration
 * (B-009): the Desktop app never scans this directory — `cortex tasks
 * register` (tasks-register.ts, which reuses this writer) upserts the app's
 * own `scheduled-tasks.json` registry. Unchanged behaviour (moved verbatim
 * from init.ts); writes no marker — sync's own payload-refresh function
 * (sync.ts) owns the `.cortex-installed.json` bookkeeping.
 */
export function writeScheduledTasks(home: string, force: boolean, root: string, partial: boolean): ScheduledTasksResult {
  const baseDir = path.join(home, '.claude', 'scheduled-tasks');
  let written = 0;
  let preserved = 0;
  const skipped: TaskSkillGap[] = [];
  const lacking: TaskSkillGap[] = [];
  const retired: string[] = [];
  // §9.1 deregistration: retired canonical tasks are removed under THIS
  // project's scoped names only — both the plain form and the hash-fallback
  // form dirs from before the naming revision (other projects' entries are
  // never touched: the hash form embeds this project's path hash, and the
  // plain form is removed only here, for this root's slug).
  for (const canonical of RETIRED_CANONICAL_TASK_NAMES) {
    for (const name of [scopedTaskName(root, canonical), hashScopedTaskName(root, canonical)]) {
      const retiredDir = path.join(baseDir, name);
      if (!fs.existsSync(retiredDir)) continue;
      // Plain-form guard: never remove a same-slug dir another project owns.
      const owner = taskDirProjectRoot(retiredDir);
      if (owner !== undefined && owner !== path.resolve(root)) continue;
      fs.rmSync(retiredDir, { recursive: true, force: true });
      if (!retired.includes(canonical)) retired.push(canonical);
    }
  }
  // Profile scoping (core-cli.init-profile Rule 4): Bucket-3 spec-loop
  // members are dropped when the project does not run the spec-first process.
  // Under `specflow` — the default — every task passes through untouched.
  const profile = readProfile(root);
  const scopedTasks = SCHEDULED_TASKS.map((t) => scopeTaskToProfile(t, profile)).filter(
    (t): t is ScheduledTask => t !== null,
  );
  for (const task of scopedTasks) {
    const missingSkills = missingRequiredSkills(root, task.requiredSkills);
    if (missingSkills.length > 0) {
      if (partial) {
        // Rule 17: skip the task entirely — its prompt's skill(s) are not installed.
        skipped.push({ task: task.name, missingSkills });
        continue;
      }
      // Default mode: register regardless, but the summary warns about the gap.
      lacking.push({ task: task.name, missingSkills });
    }
    // §9.1 project-scoped registration identity (core-cli.task-scoping Rules
    // 2-3): exists/preserve/overwrite keys on THIS project's resolved scoped
    // path only (plain `<slug>-<canonical>`, hash6 fallback when the plain
    // name is owned by another project), so other projects' tasks and
    // non-Cortex entries are never counted, listed, overwritten, or
    // skipped-with-notice.
    const scoped = resolveScopedTaskName(baseDir, root, CANONICAL_TASK_NAMES[task.name] ?? task.name);
    const skillPath = path.join(baseDir, scoped, 'SKILL.md');
    if (fs.existsSync(skillPath) && !force) {
      preserved++;
      continue;
    }
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, scheduledTaskSkillMd(task, scoped, root), 'utf-8');
    written++;
  }
  return { written, preserved, skipped, lacking, retired };
}

// ---------------------------------------------------------------------------
// Registration-status summary lines (init tail / sync Rule 8 tail) — shared
// verbatim so both commands render the identical instruction block.
// ---------------------------------------------------------------------------

export function registrationSummaryLines(regStatus: { unregistered: string[]; total: number }): string[] {
  const lines: string[] = [];
  if (regStatus.unregistered.length === 0) {
    lines.push(
      `Scheduled tasks: all ${regStatus.total} registered with the Claude Desktop app (cadences from the canonical table) — confirm anytime with \`cortex tasks verify\`.`,
    );
  } else {
    lines.push(
      `Scheduled tasks: payloads ready — ${regStatus.unregistered.length} of ${regStatus.total} not yet registered with the Claude Desktop app (cadences apply once registered).`,
    );
    lines.push('To activate them: open this folder in Claude Desktop (new session) and say:');
    lines.push('    run cortex-register-tasks');
    lines.push(
      `Note: the app asks you to approve each task registration (${regStatus.total} prompts) — "always allow" is not offered for task creation, so stay at the keyboard.`,
    );
    lines.push('Then confirm with: cortex tasks verify');
  }
  return lines;
}

// ---------------------------------------------------------------------------
// `.cortex-installed.json` marker (spec core-cli.sync Notes — sync's own
// bookkeeping, not a schema-committed artefact). Generic hash/marker helpers
// live here so sync.ts's judgment logic stays focused on the decision tree;
// nothing in this file writes the marker — only sync.ts does.
// ---------------------------------------------------------------------------

export const INSTALLED_MARKER_FILENAME = '.cortex-installed.json';

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Deterministic content hash of every file under `dir` (path-sorted), so two
 * directory trees with identical file sets and byte content hash equal
 * regardless of mtime/order. `excludeNames` skips bookkeeping files (e.g. the
 * marker itself) that are never part of "the bundle content" being compared.
 * Returns the hash of an empty input if `dir` does not exist.
 */
export function hashDirectoryContent(dir: string, excludeNames: string[] = []): string {
  const files: string[] = [];
  if (fs.existsSync(dir)) {
    const walk = (d: string, rel: string): void => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        if (excludeNames.includes(entry.name)) continue;
        const full = path.join(d, entry.name);
        const relPath = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(full, relPath);
        else files.push(relPath);
      }
    };
    walk(dir, '');
  }
  files.sort();
  const hash = createHash('sha256');
  for (const f of files) {
    hash.update(f);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(dir, f)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export interface InstalledMarker {
  sha256: string;
}

export function readInstalledMarker(markerPath: string): InstalledMarker | undefined {
  if (!fs.existsSync(markerPath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf-8')) as Record<string, unknown>;
    return typeof parsed['sha256'] === 'string' ? { sha256: parsed['sha256'] as string } : undefined;
  } catch {
    return undefined;
  }
}

export function writeInstalledMarker(markerPath: string, sha256: string): void {
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify({ sha256 }, null, 2) + '\n', 'utf-8');
}

// Re-exported so sync.ts can build shipped-payload content without importing
// templates.ts types twice under two different names.
export type { ScheduledTask };
