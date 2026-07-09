/**
 * `cortex tasks plan` / `cortex tasks register` / `cortex tasks verify`
 * (spec core-cli.tasks-register; B-009 resolution — final mechanism).
 *
 * Writing `~/.claude/scheduled-tasks/<name>/SKILL.md` produces a prompt
 * PAYLOAD only — the Claude Desktop app never scans that directory. Its real
 * registry is a `scheduled-tasks.json` under
 * `<app-support>/claude-code-sessions/<uuid>/<uuid>/`, loaded into memory
 * ONCE per app launch and rewritten wholesale from memory on every task
 * event. That in-memory model makes direct registry writes unsafe while the
 * app runs (externally-appended entries are clobbered on the next flush; one
 * malformed field makes the app treat the whole file as empty and wipe every
 * task), so the PRIMARY registration path is the `cortex-register-tasks`
 * skill, run inside a Claude Desktop session where the app's own internal
 * `mcp__scheduled-tasks__*` MCP tools exist. This module supplies:
 *
 * - `tasksPlan` — the authoritative, read-only registration plan the skill
 *   consumes (`cortex tasks plan --json`); Core stays the single source of
 *   truth for ids, cadences, and payload paths.
 * - `registerTasks` — the direct-write FALLBACK, guarded: it refuses to run
 *   while the Desktop app is running (injected process check; macOS-only
 *   `pgrep` at the CLI entry).
 * - `verifyTasks` — the read-only silent-loss detector app updates make
 *   necessary (registry wipes observed, #49276); never restricted.
 * - `registrationStatus` — the read-only check `cortex init` uses to print
 *   its register-in-Desktop instruction block.
 *
 * Deterministic Core (RULES 3): pure file I/O, no LLM, no network. All paths
 * are injected (`home`, `appSupportDir`) so tests never touch the real
 * machine; the CLI entry supplies the real defaults.
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import fg from 'fast-glob';
import { SCHEDULED_TASKS } from './templates.js';
import {
  CANONICAL_TASK_NAMES,
  RETIRED_CANONICAL_TASK_NAMES,
  scopedTaskName,
} from './task-scoping.js';
import { writeScheduledTasks } from './init.js';

/**
 * The `permissionMode` Cortex stamps on every entry it owns. Matches the
 * observed shape of app-created entries on the reference machine (B-009
 * evidence). Single constant so a field-parity correction is a one-line
 * change — the owner must eyeball one real app-created entry before the
 * first live run.
 */
export const TASK_PERMISSION_MODE = 'bypassPermissions';

/**
 * Canonical bundle name → cron expression (the cadence table, data not code).
 * v3.0 consolidation: one cadence per bundle (each bundle runs its member
 * loops sequentially in a single fire), staggered so no two Cortex bundles of
 * one project ever fire in the same slot:
 * - `daily` nightly at 02:00;
 * - `weekly-curation` Saturday 04:00, `weekly-quality` Sunday 04:00,
 *   `test-runner` Sunday 06:00;
 * - `monthly-review` on the 1st at 06:00.
 */
export const TASK_CADENCE: Readonly<Record<string, string>> = {
  'daily': '0 2 * * *',
  'weekly-curation': '0 4 * * 6',
  'weekly-quality': '0 4 * * 0',
  'test-runner': '0 6 * * 0',
  'monthly-review': '0 6 1 * *',
};

export interface TasksRegistryOptions {
  /** Project root (becomes each entry's `cwd`; slug+hash inputs). */
  projectRoot: string;
  /** Home dir holding `.claude/scheduled-tasks/` payloads (injected; tests use fixtures). */
  home: string;
  /** The app-support root to glob for the registry (real default: `~/Library/Application Support/Claude`). */
  appSupportDir: string;
  /** Clock injection for `createdAt` and the backup stamp. */
  now?: () => Date;
  /**
   * Injected Desktop-app process check for the `register` guard (tests inject
   * a fake; omitted = guard off, so fixture runs are unaffected). The CLI
   * entry alone supplies the real `desktopAppRunning` (macOS `pgrep`).
   */
  isDesktopAppRunning?: () => boolean;
}

export interface TasksCommandResult {
  exitCode: number;
  output: string;
}

/** A registry entry as parsed — unknown JSON; Cortex sets only the fields it owns. */
type RegistryEntry = Record<string, unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Locate every `scheduled-tasks.json` under
 * `<appSupportDir>/claude-code-sessions/`, sorted most-recently-modified
 * first.
 */
export function discoverRegistryFiles(appSupportDir: string): string[] {
  const files = fg.sync('claude-code-sessions/**/scheduled-tasks.json', {
    cwd: appSupportDir,
    absolute: true,
    dot: true,
    suppressErrors: true,
  });
  return files
    .map((f) => ({ f, mtime: fs.statSync(f).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((x) => x.f);
}

interface LoadedRegistry {
  file: string;
  raw: string;
  registry: Record<string, unknown>;
  entries: RegistryEntry[] | unknown[];
  warnings: string[];
}

/** Discover + parse the registry, or explain why not (shared by register/verify). */
function loadRegistry(appSupportDir: string): LoadedRegistry | TasksCommandResult {
  const files = discoverRegistryFiles(appSupportDir);
  if (files.length === 0) {
    return {
      exitCode: 1,
      output:
        `No scheduled-tasks.json found under ${path.join(appSupportDir, 'claude-code-sessions')}. ` +
        'The registry is created by the Claude Desktop app itself — open the app once ' +
        '(and create any scheduled task there if the file still does not exist), then re-run. ' +
        'Cortex never creates the registry file.',
    };
  }
  const warnings: string[] = [];
  const file = files[0] as string;
  if (files.length > 1) {
    warnings.push(
      `Warning: ${files.length} registry files found; using the most recently modified (${file}). ` +
        `Ignored: ${files.slice(1).join(', ')}.`,
    );
  }
  const raw = fs.readFileSync(file, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      exitCode: 1,
      output: `Registry ${file} is not valid JSON (${(err as Error).message}) — refusing to touch it.`,
    };
  }
  if (!isRecord(parsed)) {
    return { exitCode: 1, output: `Registry ${file} is not a JSON object — refusing to touch it.` };
  }
  const entries = Array.isArray(parsed['scheduledTasks']) ? (parsed['scheduledTasks'] as unknown[]) : [];
  return { file, raw, registry: parsed, entries, warnings };
}

function isCommandResult(v: LoadedRegistry | TasksCommandResult): v is TasksCommandResult {
  return 'exitCode' in v;
}

/** This project's 5 (canonical, scopedId, cron, model, payload filePath, description) rows. */
function ownRows(
  root: string,
  home: string,
): { canonical: string; id: string; cron: string; model: string; filePath: string; description: string }[] {
  return SCHEDULED_TASKS.map((task) => {
    const canonical = CANONICAL_TASK_NAMES[task.name] ?? task.name;
    const id = scopedTaskName(root, canonical);
    return {
      canonical,
      id,
      cron: TASK_CADENCE[canonical] ?? '0 2 * * *',
      model: task.model,
      filePath: path.join(home, '.claude', 'scheduled-tasks', id, 'SKILL.md'),
      description: task.description,
    };
  });
}

// ---------------------------------------------------------------------------
// `cortex tasks plan` — the authoritative registration plan (read-only)
// ---------------------------------------------------------------------------

/** Bumped on any change to the `--json` shape (the cortex-register-tasks skill
 *  consumes it). v2: added the per-bundle `model` field (v3.0 consolidation). */
export const TASK_PLAN_VERSION = 2;

/** One row of the registration plan, as emitted by `cortex tasks plan --json`. */
export interface TaskPlanEntry {
  /** Registry id AND payload dir name (the app recomputes filePath from id — they must match). */
  id: string;
  /** The §9.1 canonical task name behind the scoped id. */
  canonical: string;
  cronExpression: string;
  /** The Claude model this bundle runs under (Desktop create-task `model` arg). */
  model: string;
  /** Each entry's working directory: the resolved project root. */
  cwd: string;
  enabled: true;
  useWorktree: false;
  permissionMode: string;
  /** Absolute path of the payload SKILL.md the entry must point at. */
  payloadPath: string;
  /** One-line human description (from SCHEDULED_TASKS). */
  description: string;
}

export interface TasksPlan {
  planVersion: number;
  projectRoot: string;
  taskCount: number;
  tasks: TaskPlanEntry[];
}

/** Compute the desired registration plan — pure, reads nothing but its inputs. */
export function planTasks(opts: Pick<TasksRegistryOptions, 'projectRoot' | 'home'>): TasksPlan {
  const root = path.resolve(opts.projectRoot);
  const tasks: TaskPlanEntry[] = ownRows(root, opts.home).map((row) => ({
    id: row.id,
    canonical: row.canonical,
    cronExpression: row.cron,
    model: row.model,
    cwd: root,
    enabled: true,
    useWorktree: false,
    permissionMode: TASK_PERMISSION_MODE,
    payloadPath: row.filePath,
    description: row.description,
  }));
  return { planVersion: TASK_PLAN_VERSION, projectRoot: root, taskCount: tasks.length, tasks };
}

/**
 * `cortex tasks plan [--json]` — print the desired registration plan. `--json`
 * emits the stable machine shape the `cortex-register-tasks` skill consumes;
 * without it, a human-readable table. Read-only, always exit 0.
 */
export function tasksPlan(opts: Pick<TasksRegistryOptions, 'projectRoot' | 'home'>, json: boolean): TasksCommandResult {
  const plan = planTasks(opts);
  if (json) {
    return { exitCode: 0, output: JSON.stringify(plan, null, 2) };
  }
  const lines: string[] = [
    `Registration plan — ${plan.taskCount} Cortex scheduled-task bundles for ${plan.projectRoot}`,
    `(permissionMode ${TASK_PERMISSION_MODE}, cwd = project root, useWorktree false for all)`,
    '',
  ];
  for (const t of plan.tasks) {
    lines.push(`${t.id}`);
    lines.push(`  cron: ${t.cronExpression}`);
    lines.push(`  model: ${t.model}`);
    lines.push(`  payload: ${t.payloadPath}`);
    lines.push(`  ${t.description}`);
  }
  lines.push('');
  lines.push(
    'To register: open this folder in a Claude Desktop session and say "run cortex-register-tasks" ' +
      '(the app\'s own scheduled-tasks tools exist only there). Confirm with `cortex tasks verify`.',
  );
  return { exitCode: 0, output: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// Desktop-app process guard (macOS-only, like Cortex v1 itself)
// ---------------------------------------------------------------------------

/**
 * True when the Claude Desktop app is running. Deterministic process-listing
 * check via `pgrep -f` against the app bundle's main-binary path (macOS-only;
 * on a platform without `pgrep` this returns false — but Cortex v1 refuses
 * non-darwin at init anyway). Injected into `registerTasks` ONLY at the real
 * CLI entry; tests inject fakes.
 */
export function desktopAppRunning(): boolean {
  const r = spawnSync('pgrep', ['-f', 'Claude.app/Contents/MacOS/Claude'], { stdio: 'ignore' });
  return r.status === 0;
}

// ---------------------------------------------------------------------------
// `cortex init` read-only registration status
// ---------------------------------------------------------------------------

export interface RegistrationStatus {
  /** False when no registry exists yet (app never ran) or it is unreadable. */
  registryFound: boolean;
  /** Canonical names of this project's tasks not registered-and-enabled. */
  unregistered: string[];
  /** Total tasks in the roster (5 bundles). */
  total: number;
}

/**
 * Read-only registration check for `cortex init`'s summary: which of the
 * five bundles are present AND enabled in the app registry. Registry-not-found
 * (the app never ran) is tolerated — every bundle reports unregistered.
 */
export function registrationStatus(opts: Pick<TasksRegistryOptions, 'projectRoot' | 'home' | 'appSupportDir'>): RegistrationStatus {
  const root = path.resolve(opts.projectRoot);
  const rows = ownRows(root, opts.home);
  const loaded = loadRegistry(opts.appSupportDir);
  if (isCommandResult(loaded)) {
    return { registryFound: false, unregistered: rows.map((r) => r.canonical), total: rows.length };
  }
  const byId = new Set<string>();
  for (const e of loaded.entries as unknown[]) {
    if (isRecord(e) && typeof e['id'] === 'string' && e['enabled'] === true) byId.add(e['id'] as string);
  }
  return {
    registryFound: true,
    unregistered: rows.filter((r) => !byId.has(r.id)).map((r) => r.canonical),
    total: rows.length,
  };
}

/**
 * Direct-write FALLBACK (app closed only): refresh the payload roster, then
 * upsert this project's five bundle entries into the Desktop app's registry:
 * backup, preserve every foreign entry (and any unknown fields on our own
 * entries) structurally intact, atomic write, idempotent. Refuses while the
 * Desktop app runs (injected check) — the app holds the registry in memory
 * and would clobber the write; the sanctioned path is the
 * `cortex-register-tasks` skill in a Desktop session.
 */
export function registerTasks(opts: TasksRegistryOptions): TasksCommandResult {
  // Guard (no escape hatch by design): the app loads scheduled-tasks.json
  // into memory once at launch and rewrites the whole file from memory on
  // every task event — a direct write now would be clobbered, and a malformed
  // merge can make the app wipe ALL tasks on its next flush.
  if (opts.isDesktopAppRunning?.() === true) {
    return {
      exitCode: 1,
      output:
        'cortex tasks register: refused — the Claude Desktop app is running.\n' +
        'The app loads scheduled-tasks.json into memory once at launch and rewrites the whole file ' +
        'from memory on every task event: anything written here now would be silently clobbered, and a ' +
        'write the app cannot parse makes it treat the registry as empty and wipe ALL scheduled tasks.\n' +
        'Use the sanctioned flow instead: open this folder in a Claude Desktop session and say ' +
        '"run cortex-register-tasks" (it registers via the app\'s own scheduled-tasks tools), then ' +
        'confirm with `cortex tasks verify`. Direct writing remains available only while the app is fully quit.',
    };
  }

  const root = path.resolve(opts.projectRoot);
  const now = opts.now ?? ((): Date => new Date());
  const lines: string[] = [];

  // 1. Payload roster refresh (missing payloads written, user-edited ones
  //    preserved, this project's retired scoped dirs removed).
  const roster = writeScheduledTasks(opts.home, false, root, false);
  lines.push(
    `Payloads: ${roster.written} written, ${roster.preserved} preserved` +
      `${roster.retired.length > 0 ? `; retired ${roster.retired.join(', ')}` : ''}.`,
  );

  // 2. Registry discovery + parse.
  const loaded = loadRegistry(opts.appSupportDir);
  if (isCommandResult(loaded)) {
    return { exitCode: loaded.exitCode, output: [...lines, loaded.output].join('\n') };
  }
  lines.push(...loaded.warnings);

  // 3. Upsert. Foreign entries (and recordedSkips / unknown top-level keys)
  //    pass through untouched; retired Cortex entries of THIS project are
  //    dropped; owned fields are set, unknown fields on existing own entries
  //    survive; createdAt is stamped only on newly created entries.
  const retiredIds = new Set(RETIRED_CANONICAL_TASK_NAMES.map((c) => scopedTaskName(root, c)));
  const entries: unknown[] = (loaded.entries as unknown[]).filter(
    (e) => !(isRecord(e) && typeof e['id'] === 'string' && retiredIds.has(e['id'] as string)),
  );
  const removedRetired = (loaded.entries as unknown[]).length - entries.length;
  let added = 0;
  let updated = 0;
  for (const row of ownRows(root, opts.home)) {
    const owned = {
      id: row.id,
      cronExpression: row.cron,
      model: row.model,
      enabled: true,
      filePath: row.filePath,
      cwd: root,
      useWorktree: false,
      permissionMode: TASK_PERMISSION_MODE,
    };
    const idx = entries.findIndex((e) => isRecord(e) && e['id'] === row.id);
    if (idx >= 0) {
      entries[idx] = { ...(entries[idx] as RegistryEntry), ...owned };
      updated++;
    } else {
      entries.push({ ...owned, createdAt: now().getTime() });
      added++;
    }
  }

  const next = JSON.stringify({ ...loaded.registry, scheduledTasks: entries }, null, 2) + '\n';
  if (next === loaded.raw) {
    lines.push(`Registry ${loaded.file}: already up to date (${ownRows(root, opts.home).length} bundle(s) registered) — nothing written.`);
    return { exitCode: 0, output: lines.join('\n') };
  }

  // 4. Backup, then atomic temp+rename write.
  const stamp = now().toISOString().replace(/[:.]/g, '-');
  const backup = `${loaded.file}.cortex-backup-${stamp}`;
  fs.copyFileSync(loaded.file, backup);
  const tmp = `${loaded.file}.cortex-tmp-${process.pid}`;
  fs.writeFileSync(tmp, next, 'utf-8');
  fs.renameSync(tmp, loaded.file);

  lines.push(
    `Registry ${loaded.file}: ${added} added, ${updated} updated` +
      `${removedRetired > 0 ? `, ${removedRetired} retired entr${removedRetired === 1 ? 'y' : 'ies'} removed` : ''} ` +
      `(backup: ${path.basename(backup)}).`,
  );
  lines.push(
    'Note: the registry is polled by the Claude Desktop app while it runs; app updates have been observed to wipe it (#49276) — re-run `cortex tasks verify` after updates.',
  );
  return { exitCode: 0, output: lines.join('\n') };
}

/**
 * Per-bundle report against the app registry: registered / enabled / cron /
 * payload SKILL.md exists. Exit 1 if any of the five is missing, disabled,
 * or points at a dangling payload; cron drift from the cadence table is
 * reported but does not fail.
 */
export function verifyTasks(opts: TasksRegistryOptions): TasksCommandResult {
  const root = path.resolve(opts.projectRoot);
  const loaded = loadRegistry(opts.appSupportDir);
  if (isCommandResult(loaded)) return loaded;

  const lines: string[] = [...loaded.warnings];
  lines.push(`Registry: ${loaded.file}`);
  const byId = new Map<string, RegistryEntry>();
  for (const e of loaded.entries as unknown[]) {
    if (isRecord(e) && typeof e['id'] === 'string') byId.set(e['id'] as string, e);
  }

  let failures = 0;
  for (const row of ownRows(root, opts.home)) {
    const entry = byId.get(row.id);
    if (entry === undefined) {
      lines.push(`FAIL ${row.canonical}: not registered (expected id "${row.id}").`);
      failures++;
      continue;
    }
    if (entry['enabled'] !== true) {
      lines.push(`FAIL ${row.canonical}: registered but disabled.`);
      failures++;
      continue;
    }
    const filePath = entry['filePath'];
    if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
      lines.push(`FAIL ${row.canonical}: registered but payload missing on disk (${String(filePath)}).`);
      failures++;
      continue;
    }
    const cron = entry['cronExpression'];
    const drift = cron === row.cron ? '' : ` [cron drifted: expected "${row.cron}"]`;
    lines.push(`ok   ${row.canonical}: enabled, cron "${String(cron)}", payload present${drift}`);
  }
  const total = ownRows(root, opts.home).length;
  lines.push(
    failures === 0
      ? `All ${total} Cortex bundles registered, enabled, and backed by payloads.`
      : `${failures} of ${total} Cortex bundle(s) missing, disabled, or dangling — open this folder in a Claude Desktop session and say "run cortex-register-tasks" (or, with the app fully quit, run \`cortex tasks register\`).`,
  );
  return { exitCode: failures === 0 ? 0 : 1, output: lines.join('\n') };
}
