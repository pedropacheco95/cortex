/**
 * `cortex tasks register` / `cortex tasks verify` (spec core-cli.tasks-register;
 * B-009 resolution, option 1).
 *
 * Writing `~/.claude/scheduled-tasks/<name>/SKILL.md` produces a prompt
 * PAYLOAD only — the Claude Desktop app never scans that directory. Its real
 * registry is a `scheduled-tasks.json` under
 * `<app-support>/claude-code-sessions/<uuid>/<uuid>/`, polled every minute
 * while the app runs. This module writes that registry directly (unsupported
 * upstream: issue #41364 closed not-planned, #47797 open) and provides a
 * verify step because app updates have wiped the registry before (#49276).
 *
 * Deterministic Core (RULES 3): pure file I/O, no LLM, no network. All paths
 * are injected (`home`, `appSupportDir`) so tests never touch the real
 * machine; the CLI entry supplies the real defaults.
 */
import * as fs from 'fs';
import * as path from 'path';
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
 * Canonical task name → cron expression (the cadence table, data not code).
 * Cadences per the loop specs' stated rhythms; wall-clock slots are staggered
 * so no two Cortex tasks of one project ever fire in the same minute:
 * - dailies 02:00–03:20, one per 20 min;
 * - weeklies spread across Sat/Sun 04:00–05:30;
 * - monthlies on the 1st, 06:00–06:30.
 */
export const TASK_CADENCE: Readonly<Record<string, string>> = {
  // Dailies
  'cortex-pulse-hygiene': '0 2 * * *',
  'cortex-loop-bug-triage': '20 2 * * *',
  'cortex-loop-spec-drift': '40 2 * * *',
  'cortex-loop-insight-refresh-daily': '0 3 * * *',
  'cortex-loop-session-observe': '20 3 * * *',
  // Weeklies — Saturday
  'cortex-pulse-distil': '0 4 * * 6',
  'cortex-loop-rule-decay': '30 4 * * 6',
  'cortex-loop-skill-suggest': '0 5 * * 6',
  'specflow-lint': '30 5 * * 6',
  // Weeklies — Sunday
  'specflow-verify': '0 4 * * 0',
  'cortex-loop-test-runner': '30 4 * * 0',
  'cortex-loop-insight-refresh-full': '0 5 * * 0',
  // Monthlies — 1st of month
  'cortex-loop-atlas-staleness': '0 6 1 * *',
  'cortex-loop-onboarding-drift': '30 6 1 * *',
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

/** This project's 14 (canonical, scopedId, cron, payload filePath) rows. */
function ownRows(root: string, home: string): { canonical: string; id: string; cron: string; filePath: string }[] {
  return SCHEDULED_TASKS.map((task) => {
    const canonical = CANONICAL_TASK_NAMES[task.name] ?? task.name;
    const id = scopedTaskName(root, canonical);
    return {
      canonical,
      id,
      cron: TASK_CADENCE[canonical] ?? '0 2 * * *',
      filePath: path.join(home, '.claude', 'scheduled-tasks', id, 'SKILL.md'),
    };
  });
}

/**
 * Refresh the payload roster, then upsert this project's fourteen entries into
 * the Desktop app's registry: backup, preserve every foreign entry (and any
 * unknown fields on our own entries) structurally intact, atomic write,
 * idempotent.
 */
export function registerTasks(opts: TasksRegistryOptions): TasksCommandResult {
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
    lines.push(`Registry ${loaded.file}: already up to date (14 task(s) registered) — nothing written.`);
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
 * Per-task report against the app registry: registered / enabled / cron /
 * payload SKILL.md exists. Exit 1 if any of the fourteen is missing, disabled,
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
  lines.push(
    failures === 0
      ? 'All 14 Cortex tasks registered, enabled, and backed by payloads.'
      : `${failures} of 14 Cortex task(s) missing, disabled, or dangling — run \`cortex tasks register\`.`,
  );
  return { exitCode: failures === 0 ? 0 : 1, output: lines.join('\n') };
}
