/**
 * `cortex sync` — repair-and-upgrade for an EXISTING Cortex project (spec
 * core-cli.sync). Day-1 `cortex init` refuses to re-run on an existing
 * `.cortex/` without `--force` (core-cli.init Rule 1); sync is the safe,
 * repeatable path for putting back a missing CLAUDE.md block, picking up
 * newly shipped skills/task rosters, or refreshing scaffolding after a
 * package upgrade — without redoing setup and without a `--force` flag at
 * all (Rule 12: every write here is a merge, an append, or a judgment-gated
 * upgrade, never an unconditional overwrite).
 *
 * Factoring (spec Notes): Rules 3/6/7 reuse the EXACT mechanism
 * `cortex init` Rules 10/11/12 call, factored into `./scaffold.js`. Rules
 * 4/5/8 are sync's OWN judgment on top of that mechanism — the
 * `.cortex-installed.json` marker (this spec's own bookkeeping, not a
 * schema-committed artefact) tells "upgraded since install, unmodified" apart
 * from "developer edited this." Sync never writes that marker on init's
 * behalf and init never writes it either (see scaffold.ts's doc comment) — a
 * bundle/payload with no marker is simply "unknown provenance," which Rule
 * 5/8 already treat as an explicit, safe state (prompt rather than assume).
 *
 * Deterministic Core (RULES 3): pure file I/O, no LLM, no network.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { validate } from '../schema/validate.js';
import { SUPPORTED_MAJOR } from '../schema/version.js';
import {
  SCHEMA_VERSION,
  CORTEX_INDEXES,
  ARCHIVE_INDEX_TEMPLATE,
  INSIGHT_INDEX_TEMPLATE,
  SCHEDULED_TASKS,
  scheduledTaskSkillMd,
} from './templates.js';
import {
  CANONICAL_TASK_NAMES,
  RETIRED_CANONICAL_TASK_NAMES,
  scopedTaskName,
  hashScopedTaskName,
  resolveScopedTaskName,
  taskDirProjectRoot,
} from './task-scoping.js';
import type { Interface as ReadlineInterface } from 'readline/promises';
import {
  packageRoot,
  promptYesNo,
  createPromptInterface,
  upsertClaudeMd,
  mergeSettings,
  installGitHook,
  registrationSummaryLines,
  hashDirectoryContent,
  readInstalledMarker,
  writeInstalledMarker,
  sha256Hex,
  INSTALLED_MARKER_FILENAME,
  listSkillBundles,
} from './scaffold.js';

export interface SyncOptions {
  /** Accept all skill-bundle/task-payload upgrades in this run without prompting. */
  yes?: boolean;
  /** Testability seam: the user's home directory (default os.homedir()). */
  home?: string;
  /** Testability seam: the platform (default process.platform). */
  platform?: string;
  /** Testability seam: the Desktop app-support root (see core-cli.init InitOptions). */
  appSupportDir?: string;
  /**
   * Optional progress sink (spec Rule 13). Called once as each rule boundary
   * begins, so a caller can surface "still working" feedback during the slow
   * steps (skill-bundle sync, scheduled-task payload refresh, self-validation)
   * instead of the whole run appearing to hang. Absent by default: behaviour
   * (including the returned `summary`) is byte-identical whether or not this
   * is supplied. Never called from inside a `promptYesNo` loop — see the
   * B-012 comment below for why prompt/progress ordering matters here.
   */
  onProgress?: (message: string) => void;
}

export interface SyncResult {
  exitCode: number;
  summary: string;
}

function parseSchemaMajor(version: unknown): number {
  if (typeof version !== 'string') return 0;
  const major = parseInt(version.split('.')[0] ?? '0', 10);
  return Number.isFinite(major) ? major : 0;
}

// ---------------------------------------------------------------------------
// Rule 4 — _index.md template refresh (localisation-aware)
// ---------------------------------------------------------------------------

export interface IndexRefreshResult {
  /** Relative dir path ('' = .cortex/ root) whose _index.md matches the
   *  current shipped template — refreshed (a no-op write when already
   *  current; a real overwrite once template content itself changes across a
   *  future schema MINOR — see the judgment-call note below). */
  current: string[];
  /** Relative dir path whose _index.md differs from the known template (or
   *  whose directory carries no known template at all) — left alone,
   *  reported as localised. */
  localised: string[];
}

/**
 * The known shipped template for a `.cortex/`-relative directory, or
 * undefined when sync has no template to compare against (a directory
 * outside the schema §7.1/§7.4 module set — e.g. a user-created subdirectory
 * — is always treated as localised: sync only ever refreshes what it can
 * name a template for).
 */
function knownIndexTemplate(relDir: string): string | undefined {
  if (relDir in CORTEX_INDEXES) return CORTEX_INDEXES[relDir];
  if (relDir === 'archive') return ARCHIVE_INDEX_TEMPLATE;
  if (relDir === 'insight') return INSIGHT_INDEX_TEMPLATE;
  return undefined;
}

/** Every `_index.md` under `.cortex/`, outside the §7.1 pulse-subdirectory
 *  carve-out (pulse/ itself is in scope; nothing nested below it is). */
function collectIndexFiles(cortexDir: string): string[] {
  const pulseRoot = path.join(cortexDir, 'pulse');
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full === pulseRoot || !full.startsWith(pulseRoot + path.sep)) walk(full);
      } else if (entry.name === '_index.md') {
        out.push(full);
      }
    }
  };
  walk(cortexDir);
  return out;
}

/**
 * Rule 4. JUDGMENT CALL: the spec's byte-match predicate is "matches the
 * shipped template for the schemaVersion recorded BEFORE this run" — a
 * genuinely versioned comparison. This codebase has shipped exactly one
 * template generation (3.0) with no historical per-version template store,
 * so "the prior version's template" and "the current template" are the same
 * text today; comparing against the single template we have IS the correct,
 * only-decidable reading given available data, and is forward-honest: once a
 * future MINOR changes template content, a project whose `_index.md` still
 * carries the OLD (matching, unedited) bytes will differ from the NEW
 * template and — under this same comparison — be (mis)classified as
 * "localised" rather than refreshed. Fixing that requires a version-keyed
 * template history this schema does not yet define; flagged here rather than
 * silently assumed away (mirrors the schema document's own convention of
 * flagging unresolved version-history gaps instead of inventing one).
 */
function refreshIndexes(root: string): IndexRefreshResult {
  const cortexDir = path.join(root, '.cortex');
  const current: string[] = [];
  const localised: string[] = [];
  for (const indexPath of collectIndexFiles(cortexDir)) {
    const relDirRaw = path.relative(cortexDir, path.dirname(indexPath)).split(path.sep).join('/');
    const key = relDirRaw; // '' for the .cortex/ root itself
    const template = knownIndexTemplate(key);
    const bytes = fs.readFileSync(indexPath, 'utf-8');
    if (template !== undefined && bytes === template) {
      current.push(key === '' ? '.' : key);
    } else {
      localised.push(key === '' ? '.' : key);
    }
  }
  return { current, localised };
}

// ---------------------------------------------------------------------------
// Rule 5 — skill-bundle upgrade (marker-judged)
// ---------------------------------------------------------------------------

export interface SkillSyncResult {
  installed: string[];
  upgraded: string[];
  alreadyCurrent: string[];
  skippedUserModified: string[];
}

async function syncSkillBundles(root: string, yes: boolean, rl?: ReadlineInterface): Promise<SkillSyncResult> {
  const result: SkillSyncResult = { installed: [], upgraded: [], alreadyCurrent: [], skippedUserModified: [] };
  const targetDir = path.join(root, '.claude', 'skills');
  fs.mkdirSync(targetDir, { recursive: true });

  const srcDir = path.join(packageRoot(), 'skills');
  if (!fs.existsSync(srcDir)) return result;

  const bundles = listSkillBundles(srcDir);
  for (const bundle of bundles) {
    const source = path.join(srcDir, bundle);
    const target = path.join(targetDir, bundle);
    const markerPath = path.join(target, INSTALLED_MARKER_FILENAME);
    const shippedHash = hashDirectoryContent(source);

    if (!fs.existsSync(target)) {
      fs.cpSync(source, target, { recursive: true });
      writeInstalledMarker(markerPath, shippedHash);
      result.installed.push(bundle);
      continue;
    }

    const onDiskHash = hashDirectoryContent(target, [INSTALLED_MARKER_FILENAME]);
    if (onDiskHash === shippedHash) {
      result.alreadyCurrent.push(bundle);
      continue;
    }

    const marker = readInstalledMarker(markerPath);
    const unmodifiedSinceInstall = marker !== undefined && marker.sha256 === onDiskHash;

    const doUpgrade = (): void => {
      fs.rmSync(target, { recursive: true, force: true });
      fs.cpSync(source, target, { recursive: true });
      writeInstalledMarker(markerPath, shippedHash);
      result.upgraded.push(bundle);
    };

    if (unmodifiedSinceInstall) {
      doUpgrade();
      continue;
    }

    // Modified since install, or no marker at all (unknown provenance —
    // treated the same as modified, never assumed safe).
    if (yes) {
      doUpgrade();
    } else {
      const overwrite = await promptYesNo(
        `Skill bundle "${bundle}" was modified since install (or has unknown provenance). Overwrite with the upgraded shipped version? [y/N] `,
        rl,
      );
      if (overwrite) doUpgrade();
      else result.skippedUserModified.push(bundle);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Rule 8 — scheduled-task payload refresh (marker-judged) + registration status
// ---------------------------------------------------------------------------

export interface TaskPayloadSyncResult {
  written: string[];
  refreshed: string[];
  alreadyCurrent: string[];
  localised: string[];
  retired: string[];
}

async function syncScheduledTaskPayloads(
  home: string,
  root: string,
  yes: boolean,
  rl?: ReadlineInterface,
): Promise<TaskPayloadSyncResult> {
  const baseDir = path.join(home, '.claude', 'scheduled-tasks');
  const result: TaskPayloadSyncResult = { written: [], refreshed: [], alreadyCurrent: [], localised: [], retired: [] };

  // Retired canonical removal — same scoping/ownership rules as init Rule 13
  // (core-cli.task-scoping), so an existing project also sheds superseded
  // task generations on sync.
  for (const canonical of RETIRED_CANONICAL_TASK_NAMES) {
    for (const name of [scopedTaskName(root, canonical), hashScopedTaskName(root, canonical)]) {
      const retiredDir = path.join(baseDir, name);
      if (!fs.existsSync(retiredDir)) continue;
      const owner = taskDirProjectRoot(retiredDir);
      if (owner !== undefined && owner !== path.resolve(root)) continue;
      fs.rmSync(retiredDir, { recursive: true, force: true });
      if (!result.retired.includes(canonical)) result.retired.push(canonical);
    }
  }

  for (const task of SCHEDULED_TASKS) {
    const canonical = CANONICAL_TASK_NAMES[task.name] ?? task.name;
    const scoped = resolveScopedTaskName(baseDir, root, canonical);
    const dir = path.join(baseDir, scoped);
    const skillPath = path.join(dir, 'SKILL.md');
    const markerPath = path.join(dir, INSTALLED_MARKER_FILENAME);
    const shippedContent = scheduledTaskSkillMd(task, scoped, root);
    const shippedHash = sha256Hex(shippedContent);

    if (!fs.existsSync(skillPath)) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(skillPath, shippedContent, 'utf-8');
      writeInstalledMarker(markerPath, shippedHash);
      result.written.push(canonical);
      continue;
    }

    const onDisk = fs.readFileSync(skillPath, 'utf-8');
    if (onDisk === shippedContent) {
      result.alreadyCurrent.push(canonical);
      // Keep the marker consistent even if it was missing/stale — harmless
      // upkeep, never a behavioural write to the payload itself.
      if (readInstalledMarker(markerPath)?.sha256 !== shippedHash) writeInstalledMarker(markerPath, shippedHash);
      continue;
    }

    const onDiskHash = sha256Hex(onDisk);
    const marker = readInstalledMarker(markerPath);
    const unmodifiedSinceInstall = marker !== undefined && marker.sha256 === onDiskHash;

    const doRefresh = (): void => {
      fs.writeFileSync(skillPath, shippedContent, 'utf-8');
      writeInstalledMarker(markerPath, shippedHash);
      result.refreshed.push(canonical);
    };

    if (unmodifiedSinceInstall) {
      doRefresh();
      continue;
    }

    if (yes) {
      doRefresh();
    } else {
      const overwrite = await promptYesNo(
        `Scheduled task payload "${scoped}" was modified since install (or has unknown provenance). Overwrite with the upgraded shipped version? [y/N] `,
        rl,
      );
      if (overwrite) doRefresh();
      else result.localised.push(canonical);
    }
  }

  // B-012 defensive invariant: every payload this run actually wrote or
  // refreshed MUST end this function with a marker whose hash matches its
  // on-disk content. Every branch above already writes both together in the
  // same synchronous block, so this is normally a no-op — it exists as a
  // structural guarantee against exactly the symptom B-012 reported (a
  // payload's SKILL.md updated with no matching marker), regardless of root
  // cause, rather than trusting per-branch bookkeeping alone.
  for (const canonical of [...result.written, ...result.refreshed]) {
    const scoped = resolveScopedTaskName(baseDir, root, canonical);
    const dir = path.join(baseDir, scoped);
    const skillPath = path.join(dir, 'SKILL.md');
    const markerPath = path.join(dir, INSTALLED_MARKER_FILENAME);
    if (!fs.existsSync(skillPath)) continue;
    const hash = sha256Hex(fs.readFileSync(skillPath, 'utf-8'));
    if (readInstalledMarker(markerPath)?.sha256 !== hash) writeInstalledMarker(markerPath, hash);
  }

  return result;
}

// ---------------------------------------------------------------------------
// sync — the 12 rules in order
// ---------------------------------------------------------------------------

export async function sync(root: string, opts: SyncOptions = {}): Promise<SyncResult> {
  const absRoot = path.resolve(root);
  const platform = opts.platform ?? process.platform;
  const home = opts.home ?? os.homedir();
  const yes = opts.yes ?? false;

  // Rule 1 — preflight: refuse before anything is written.
  if (platform !== 'darwin') {
    return {
      exitCode: 2,
      summary: `cortex sync: refused — Cortex v1 requires macOS (darwin); this platform reports "${platform}". Nothing was written.`,
    };
  }
  const configPath = path.join(absRoot, '.cortex', 'cortex.config.json');
  if (!fs.existsSync(configPath)) {
    return {
      exitCode: 2,
      summary: `cortex sync: refused — no .cortex/ found at ${absRoot} (looked for ${configPath}). This is the existing-project command; a project with no Cortex footprint at all should run \`cortex init\` first. Nothing was written.`,
    };
  }

  // Rule 2 — version gate (schema §10.3/§10.4). MAJOR mismatch (either
  // direction) refuses outright, before any other step, with nothing written.
  let rawConfig: string;
  let config: Record<string, unknown>;
  try {
    rawConfig = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(rawConfig) as Record<string, unknown>;
  } catch {
    rawConfig = '{}';
    config = {};
  }
  const declaredVersion = typeof config['schemaVersion'] === 'string' ? (config['schemaVersion'] as string) : '0.0';
  const declaredMajor = parseSchemaMajor(declaredVersion);
  if (declaredMajor < SUPPORTED_MAJOR) {
    return {
      exitCode: 3,
      summary:
        `cortex sync: refused — this project's schemaVersion (${declaredVersion}) is behind the installed package's ` +
        `schema (major ${SUPPORTED_MAJOR}). Run \`cortex migrate\` first, then re-run \`cortex sync\`. Nothing was written.`,
    };
  }
  if (declaredMajor > SUPPORTED_MAJOR) {
    return {
      exitCode: 3,
      summary:
        `cortex sync: refused — this project's schemaVersion (${declaredVersion}) is AHEAD of the installed package's ` +
        `schema (major ${SUPPORTED_MAJOR}). Upgrade the installed \`cortex\` package, then re-run \`cortex sync\`. Nothing was written.`,
    };
  }

  // hooks.preRead defaults TRUE (§10.1) — only an explicit false opts out.
  const preRead = ((config['hooks'] as Record<string, unknown> | undefined)?.['preRead']) !== false;

  // MAJOR equal, any MINOR: proceed. Sync IS the MINOR upgrade path — rewrite
  // schemaVersion to the installed package's version; no other key changes.
  let schemaVersionState = 'already current';
  if (config['schemaVersion'] !== SCHEMA_VERSION) {
    const next = JSON.stringify({ ...config, schemaVersion: SCHEMA_VERSION }, null, 2) + '\n';
    fs.writeFileSync(configPath, next, 'utf-8');
    schemaVersionState = `${declaredVersion} -> ${SCHEMA_VERSION}`;
  }

  // Rule 3 — CLAUDE.md managed block (same mechanism as init Rule 10).
  opts.onProgress?.('Refreshing the CLAUDE.md managed block…');
  const claudeMdState = upsertClaudeMd(absRoot);

  // Rule 4 — _index.md template refresh (localisation-aware).
  opts.onProgress?.('Refreshing _index.md templates…');
  const indexResult = refreshIndexes(absRoot);

  // Cheap bundle count for the Rule 5 progress message below — a directory
  // listing, not the hashing syncSkillBundles itself does.
  const skillsSrcDir = path.join(packageRoot(), 'skills');
  const skillBundleCount = listSkillBundles(skillsSrcDir).length;

  // B-012: ONE shared readline interface for every "modified since install"
  // prompt this whole run may ask — Rule 5 (skill bundles) AND Rule 8 (task
  // payloads) share it, rather than each differing item creating and closing
  // its own interface on the same stdin (the create/close-per-question
  // pattern that can drop or misattribute a buffered answer between rapid
  // sequential prompts).
  const rl = yes ? undefined : createPromptInterface();
  let skillResult: SkillSyncResult;
  let taskResult: TaskPayloadSyncResult;
  try {
    // Rule 5 — skill-bundle upgrade (marker-judged). Progress fires BEFORE
    // the call — syncSkillBundles may prompt via `rl`, and a progress line
    // must never land between a prompt being issued and it being answered
    // (see Rule 13/B-012 above).
    opts.onProgress?.(`Syncing skill bundles (${skillBundleCount} to check)…`);
    skillResult = await syncSkillBundles(absRoot, yes, rl);

    // Rule 6 — hooks merge (same mechanism as init Rule 11).
    opts.onProgress?.('Merging hooks into .claude/settings.json…');
    var registeredHooks = mergeSettings(absRoot, preRead); // eslint-disable-line no-var

    // Rule 7 — git post-commit hook (same mechanism as init Rule 12).
    opts.onProgress?.('Installing the git post-commit hook…');
    var gitHookState = installGitHook(absRoot); // eslint-disable-line no-var

    // Rule 8 — scheduled-task payload refresh (marker-judged) + registration
    // status. Same ordering constraint as Rule 5: fires BEFORE the call,
    // never from inside syncScheduledTaskPayloads' own prompt loop.
    opts.onProgress?.('Refreshing scheduled-task payloads…');
    taskResult = await syncScheduledTaskPayloads(home, absRoot, yes, rl);
  } finally {
    rl?.close();
  }

  // Rule 9 — never touches compass/atlas/archive/insight content or pulse
  // state: trivially true — nothing above reads or writes those trees.

  // Rule 10 — self-validation.
  opts.onProgress?.('Running self-validation…');
  const report = await validate(absRoot, { root: absRoot });
  const errors = report.violations.filter((v) => v.severity === 'error');
  const warnings = report.violations.filter((v) => v.severity === 'warning');

  // Rule 11 — summary.
  const lines: string[] = [];
  lines.push('cortex sync — summary');
  lines.push(`Project: ${absRoot} (schema ${SCHEMA_VERSION})`);
  lines.push(`Schema version: ${schemaVersionState}.`);
  lines.push(`CLAUDE.md: managed cortex block ${claudeMdState}.`);
  lines.push(`_index.md: ${indexResult.current.length} current, ${indexResult.localised.length} left as localised.`);
  if (indexResult.current.length > 0) lines.push(`  Current: ${indexResult.current.join(', ')}.`);
  if (indexResult.localised.length > 0) lines.push(`  Localised (left alone): ${indexResult.localised.join(', ')}.`);
  lines.push(
    `Skill bundles: ${skillResult.installed.length} installed, ${skillResult.upgraded.length} upgraded, ` +
      `${skillResult.alreadyCurrent.length} already current, ${skillResult.skippedUserModified.length} skipped (user-modified).`,
  );
  if (skillResult.installed.length > 0) lines.push(`  Installed: ${skillResult.installed.join(', ')}.`);
  if (skillResult.upgraded.length > 0) lines.push(`  Upgraded: ${skillResult.upgraded.join(', ')}.`);
  if (skillResult.skippedUserModified.length > 0) {
    lines.push(`  Skipped (user-modified, preserved): ${skillResult.skippedUserModified.join(', ')}.`);
  }
  lines.push(
    `Hooks registered in .claude/settings.json: ${registeredHooks.join(', ')}${preRead ? '' : ' (Read pair off per cortex.config.json hooks.preRead)'}`,
  );
  switch (gitHookState) {
    case 'skipped-no-git':
      lines.push('Git hook: skipped — not a git repository.');
      break;
    case 'already-installed':
      lines.push('Git hook: .git/hooks/post-commit already contains the insight-refresh-fast invocation.');
      break;
    default:
      lines.push(`Git hook: insight-refresh-fast ${gitHookState} in .git/hooks/post-commit (executable).`);
      break;
  }
  lines.push(
    `Scheduled task payloads: ${taskResult.written.length} written, ${taskResult.refreshed.length} refreshed, ` +
      `${taskResult.alreadyCurrent.length} already current, ${taskResult.localised.length} left as localised.`,
  );
  if (taskResult.written.length > 0) lines.push(`  Written: ${taskResult.written.join(', ')}.`);
  if (taskResult.refreshed.length > 0) lines.push(`  Refreshed: ${taskResult.refreshed.join(', ')}.`);
  if (taskResult.localised.length > 0) lines.push(`  Left as localised (user-modified): ${taskResult.localised.join(', ')}.`);
  if (taskResult.retired.length > 0) {
    lines.push(`Scheduled tasks retired (schema §9.1 deregistration): ${taskResult.retired.join(', ')}.`);
  }

  const { registrationStatus } = await import('./tasks-register.js');
  const appSupportDir = opts.appSupportDir ?? path.join(home, 'Library', 'Application Support', 'Claude');
  const regStatus = registrationStatus({ projectRoot: absRoot, home, appSupportDir });
  lines.push(...registrationSummaryLines(regStatus));

  if (errors.length > 0) {
    lines.push(`Self-validation: FAILED — ${errors.length} violation(s):`);
    for (const v of errors) {
      lines.push(`  [${v.check}] ${path.relative(absRoot, v.location.path) || v.location.path}: ${v.message}`);
    }
  } else {
    lines.push(`Self-validation: conformant${warnings.length > 0 ? ` (${warnings.length} warning(s))` : ''}.`);
  }

  // Exit codes (Rule 11): 0 success, 1 self-validation failure, 2 preflight
  // refusal, 3 version-gate refusal (already returned above).
  const exitCode = errors.length > 0 ? 1 : 0;
  return { exitCode, summary: lines.join('\n') };
}
