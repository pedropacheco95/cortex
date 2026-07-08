/**
 * `cortex init` — day-1 bootstrap (spec core-cli.init, 17 rules).
 *
 * Core makes NO LLM/API calls (RULES.md rule 3): the inline purpose pass is
 * delegated to the Claude Code CLI as an opaque subprocess (Rule 6).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import * as readline from 'readline/promises';
import { scan } from '../anatomy/scan.js';
import { scaffoldInsight } from '../insight/scaffold.js';
import { scaffoldArchive } from '../archive/scaffold.js';
import { splitDataRowCells } from '../anatomy/files-md.js';
import { validate } from '../schema/validate.js';
// Rule 6 auth-failure detection, shared with the writer/verifier harness.
import { AUTH_FAILURE_PATTERN } from './claude-auth.js';
import {
  SCHEMA_VERSION,
  CONFIG_DEFAULTS,
  GITIGNORE_LINES,
  CORTEX_INDEXES,
  SPECS_INDEX_TEMPLATE,
  SPECS_OVERVIEW_TEMPLATE,
  SPECS_BUSINESS_OVERVIEW_TEMPLATE,
  SCHEDULED_TASKS,
  claudeMdBlock,
  scheduledTaskSkillMd,
  COMPASS_ENVIRONMENT_TEMPLATE,
  COMPASS_DO_NOT_REPEAT_TEMPLATE,
  pulseDismissedTemplate,
} from './templates.js';
// Schema §9.1 project scoping for the Rule 13 task writer (core-cli.task-scoping).
import { CANONICAL_TASK_NAMES, scopedTaskName } from './task-scoping.js';
// Schema §2.3 re-rooted spec trees (specflow.reorg).
import { specsRoot, businessRoot, SPECS_REL, BUSINESS_REL } from '../paths.js';

export interface InitOptions {
  force?: boolean;
  yes?: boolean;
  noLlm?: boolean;
  /** Rule 17: register a scheduled task only if every skill its prompt invokes is present in .claude/skills/. */
  partial?: boolean;
  /** Testability seam: the user's home directory (default os.homedir()). */
  home?: string;
  /** Testability seam: the platform (default process.platform). */
  platform?: string;
  /** Testability seam: the Claude Code CLI binary (default 'claude' on PATH). */
  claudeBin?: string;
  /** Testability seam: purpose-pass subprocess timeout (default 300000ms). */
  timeoutMs?: number;
}

export interface InitResult {
  exitCode: number;
  summary: string;
}

const DEFAULT_TIMEOUT_MS = 300_000;

// ---------------------------------------------------------------------------
// small fs helpers
// ---------------------------------------------------------------------------

function writeIfAbsent(filePath: string, content: string, force: boolean): boolean {
  if (fs.existsSync(filePath) && !force) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
}

function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return s || 'entry';
}

// ---------------------------------------------------------------------------
// Rule 2 — gitignore
// ---------------------------------------------------------------------------

function updateGitignore(root: string): string[] {
  const gitignorePath = path.join(root, '.gitignore');
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
  const presentLines = new Set(existing.split('\n').map((l) => l.trim()));
  const missing = GITIGNORE_LINES.filter((l) => !presentLines.has(l));
  if (missing.length === 0 && fs.existsSync(gitignorePath)) return [];

  let next = existing;
  if (next.length > 0 && !next.endsWith('\n')) next += '\n';
  next += missing.map((l) => `${l}\n`).join('');
  fs.writeFileSync(gitignorePath, next, 'utf-8');
  return missing;
}

// ---------------------------------------------------------------------------
// Rule 3 — skeleton
// ---------------------------------------------------------------------------

function writeSkeleton(root: string, force: boolean, nowIso: string): void {
  const cortexDir = path.join(root, '.cortex');

  // Every §1 directory with its §7.1 active-prompt _index.md.
  for (const [rel, content] of Object.entries(CORTEX_INDEXES)) {
    const dir = rel === '' ? cortexDir : path.join(cortexDir, rel);
    fs.mkdirSync(dir, { recursive: true });
    writeIfAbsent(path.join(dir, '_index.md'), content, force);
  }

  // cortex.config.json (§10.1). Rule 16: an existing config is merged, not clobbered.
  const configPath = path.join(cortexDir, 'cortex.config.json');
  if (fs.existsSync(configPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...CONFIG_DEFAULTS, ...existing, schemaVersion: SCHEMA_VERSION };
      fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    } catch {
      // unparseable existing config: only --force may replace it
      if (force) fs.writeFileSync(configPath, JSON.stringify(CONFIG_DEFAULTS, null, 2) + '\n', 'utf-8');
    }
  } else {
    fs.writeFileSync(configPath, JSON.stringify(CONFIG_DEFAULTS, null, 2) + '\n', 'utf-8');
  }

  // Compass skeleton leaves (preserved if present — curated knowledge).
  // No decisions.md: decisions are single-homed to atlas/decisions/ (schema §4.2,
  // addendum §A2.1) — compass never scaffolds a decisions artefact.
  const compass = path.join(cortexDir, 'compass');
  writeIfAbsent(path.join(compass, 'environment.md'), COMPASS_ENVIRONMENT_TEMPLATE, false);
  writeIfAbsent(path.join(compass, 'do-not-repeat.md'), COMPASS_DO_NOT_REPEAT_TEMPLATE, false);

  // Pulse rejection memory (persists; preserved if present).
  writeIfAbsent(path.join(cortexDir, 'pulse', 'dismissed.md'), pulseDismissedTemplate(nowIso), false);

  // Insight module (§4.10.1, §7.4 — v3) — committed, NOT gitignored. Creates
  // insight/_index.md (the §5.13 active prompt) + the empty flat-layout
  // anatomy/ and concepts/; seeds no entries or JSON. Scoped layout
  // (scopes/ + scope-registry.yaml) is the extract skill's to add.
  scaffoldInsight(cortexDir);

  // Archive module (§4.4, new at v3.0) — mixed git policy per-artefact within
  // the module (Decision 1 v3.0 amendment; GITIGNORE_LINES carries the one
  // gitignored sub-glob). Creates archive/_index.md + register.md + the empty
  // documents/ and types/; seeds no document or type file (scaffoldArchive's
  // own doc comment records this as a judgment call).
  scaffoldArchive(cortexDir);
}

function readConfig(root: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Rule 4 — skills install
// ---------------------------------------------------------------------------

function packageRoot(): string {
  // src/cli/init.ts → package root is two levels up (same for dist/cli/init.js).
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

async function confirmOverwrite(name: string): Promise<boolean> {
  // Non-interactive (no TTY) means "preserve the user's copy".
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Skill bundle "${name}" already exists in .claude/skills/. Overwrite? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function installSkills(root: string, yes: boolean): Promise<{ installed: number; preserved: number }> {
  const targetDir = path.join(root, '.claude', 'skills');
  fs.mkdirSync(targetDir, { recursive: true });

  const srcDir = path.join(packageRoot(), 'skills');
  if (!fs.existsSync(srcDir)) return { installed: 0, preserved: 0 };

  let installed = 0;
  let preserved = 0;
  const bundles = fs.readdirSync(srcDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  for (const bundle of bundles) {
    const target = path.join(targetDir, bundle.name);
    if (fs.existsSync(target) && !yes) {
      const overwrite = await confirmOverwrite(bundle.name);
      if (!overwrite) {
        preserved++;
        continue;
      }
    }
    fs.cpSync(path.join(srcDir, bundle.name), target, { recursive: true });
    installed++;
  }
  return { installed, preserved };
}

// ---------------------------------------------------------------------------
// Rule 6 — inline purpose pass (subprocess only; Core makes no LLM calls)
// ---------------------------------------------------------------------------

interface SubprocessResult {
  kind: 'ok' | 'no-binary' | 'timeout' | 'cancelled' | 'error' | 'auth';
  detail: string;
}

function runClaudeSubprocess(bin: string, prompt: string, cwd: string, timeoutMs: number): Promise<SubprocessResult> {
  return new Promise((resolve) => {
    execFile(
      bin,
      ['-p', prompt],
      { cwd, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const output = `${stdout ?? ''}\n${stderr ?? ''}`;
        if (AUTH_FAILURE_PATTERN.test(output)) {
          resolve({ kind: 'auth', detail: 'the Claude CLI reported it is not authenticated' });
          return;
        }
        if (!error) {
          resolve({ kind: 'ok', detail: '' });
          return;
        }
        const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string; code?: unknown };
        if (err.code === 'ENOENT') {
          resolve({ kind: 'no-binary', detail: `claude binary not found (${bin})` });
        } else if (err.killed || err.signal === 'SIGKILL' || err.signal === 'SIGTERM') {
          resolve({ kind: 'timeout', detail: `subprocess timed out after ${timeoutMs}ms` });
        } else if (err.signal === 'SIGINT') {
          resolve({ kind: 'cancelled', detail: 'subprocess was cancelled (SIGINT)' });
        } else {
          resolve({ kind: 'error', detail: `subprocess exited with code ${String(err.code ?? 'unknown')}` });
        }
      },
    );
  });
}

/** Count data rows / flagged rows in .cortex/anatomy/files.md. */
function countFlagged(root: string): { total: number; flagged: number } {
  const filesPath = path.join(root, '.cortex', 'anatomy', 'files.md');
  let total = 0;
  let flagged = 0;
  if (!fs.existsSync(filesPath)) return { total, flagged };
  for (const line of fs.readFileSync(filesPath, 'utf-8').split('\n')) {
    const cells = splitDataRowCells(line);
    if (cells === null || cells.length < 7) continue;
    // Column 7 is needs_purpose_refresh (§4.1) — the last cell is now
    // purpose_source, so the flag is addressed positionally.
    const flag = cells[6];
    if (flag !== 'true' && flag !== 'false') continue; // header / separator rows
    total++;
    if (flag === 'true') flagged++;
  }
  return { total, flagged };
}

// ---------------------------------------------------------------------------
// Rule 7 — preferences draft (deterministic extraction)
// ---------------------------------------------------------------------------

function draftPreferences(root: string, nowIso: string): { facts: string[] } {
  const facts: string[] = [];

  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      if (typeof pkg['name'] === 'string') facts.push(`Package name: \`${pkg['name']}\``);
      if (typeof pkg['packageManager'] === 'string') facts.push(`Package manager: \`${pkg['packageManager']}\``);
      if (pkg['type'] === 'module') facts.push('Module system: ESM (`"type": "module"`)');
      const deps = Object.keys((pkg['dependencies'] as Record<string, unknown> | undefined) ?? {});
      const devDeps = Object.keys((pkg['devDependencies'] as Record<string, unknown> | undefined) ?? {});
      if (deps.length > 0) facts.push(`Dependencies: ${deps.map((d) => `\`${d}\``).join(', ')}`);
      if (devDeps.includes('typescript') || deps.includes('typescript')) facts.push('Language: TypeScript');
      if (devDeps.includes('vitest')) facts.push('Test runner: vitest');
      if (devDeps.includes('jest')) facts.push('Test runner: jest');
      const scripts = (pkg['scripts'] as Record<string, unknown> | undefined) ?? {};
      for (const key of ['build', 'test', 'lint']) {
        if (typeof scripts[key] === 'string') facts.push(`Script \`${key}\`: \`${scripts[key] as string}\``);
      }
    } catch {
      /* skip unreadable inputs silently */
    }
  }

  const tsconfigPath = path.join(root, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    try {
      const ts = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8')) as Record<string, unknown>;
      const co = (ts['compilerOptions'] as Record<string, unknown> | undefined) ?? {};
      if (co['strict'] === true) facts.push('TypeScript strict mode: enabled');
      if (typeof co['module'] === 'string') facts.push(`TS module: \`${co['module'] as string}\``);
      if (typeof co['target'] === 'string') facts.push(`TS target: \`${co['target'] as string}\``);
    } catch {
      /* skip silently */
    }
  }

  try {
    const eslintFiles = fs.readdirSync(root).filter((f) => /^\.eslintrc(\..+)?$/.test(f));
    for (const f of eslintFiles) facts.push(`Linting: ESLint configured via \`${f}\``);
  } catch {
    /* skip silently */
  }

  const pyprojectPath = path.join(root, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      facts.push('Python project: `pyproject.toml` present');
      const tools = [...content.matchAll(/^\[tool\.([A-Za-z0-9_-]+)/gm)].map((m) => m[1]).filter((t): t is string => !!t);
      if (tools.length > 0) facts.push(`Python tooling: ${[...new Set(tools)].map((t) => `\`${t}\``).join(', ')}`);
    } catch {
      /* skip silently */
    }
  }

  const readmePath = path.join(root, 'README.md');
  if (fs.existsSync(readmePath)) {
    try {
      const first = fs.readFileSync(readmePath, 'utf-8').split('\n').find((l) => l.startsWith('# '));
      if (first) facts.push(`README title: ${first.replace(/^#\s*/, '').trim()}`);
    } catch {
      /* skip silently */
    }
  }

  const content = `---
kind: compass-preferences
generated: ${nowIso}
confidence: EXTRACTED
status: draft
---

# Preferences — DRAFT for human review

> Drafted deterministically by \`cortex init\` from project metadata
> (package.json, tsconfig.json, eslint config, pyproject.toml, README.md).
> These are **not accepted rules** until a human reviews and edits this file.

${facts.length > 0 ? facts.map((f) => `- ${f}`).join('\n') : '- (no stack facts could be extracted)'}
`;

  const prefsPath = path.join(root, '.cortex', 'compass', 'preferences.md');
  writeIfAbsent(prefsPath, content, false); // curated once reviewed — never overwritten
  return { facts };
}

// ---------------------------------------------------------------------------
// Rule 8 — spec trees
// ---------------------------------------------------------------------------

function scaffoldSpecTrees(root: string): { specsScaffolded: boolean; businessScaffolded: boolean } {
  const specsDir = specsRoot(root);
  const businessDir = businessRoot(root);
  let specsScaffolded = false;
  let businessScaffolded = false;

  if (!fs.existsSync(specsDir)) {
    fs.mkdirSync(specsDir, { recursive: true });
    fs.writeFileSync(path.join(specsDir, '_index.md'), SPECS_INDEX_TEMPLATE, 'utf-8');
    fs.writeFileSync(path.join(specsDir, '_overview.md'), SPECS_OVERVIEW_TEMPLATE, 'utf-8');
    specsScaffolded = true;
  }
  if (!fs.existsSync(businessDir)) {
    fs.mkdirSync(businessDir, { recursive: true });
    fs.writeFileSync(path.join(businessDir, '_overview.md'), SPECS_BUSINESS_OVERVIEW_TEMPLATE, 'utf-8');
    businessScaffolded = true;
  }
  return { specsScaffolded, businessScaffolded };
}

// ---------------------------------------------------------------------------
// Rule 9 — legacy bugs.md migration
// ---------------------------------------------------------------------------

const BUG_TYPE_ENUM = ['missing-criterion', 'incomplete-rule', 'wrong-rule', 'missing-dev-spec', 'missing-business-spec', 'layer-drift', 'test-defect'];
const BUG_SEVERITY_ENUM = ['critical', 'high', 'medium', 'low'];
const BUG_STATUS_ENUM = ['open', 'triaged', 'resolved'];

function extractField(body: string, field: string, allowed: string[]): string | undefined {
  const re = new RegExp(`^[-*\\s]*(?:\\*\\*)?${field}(?:\\*\\*)?\\s*:\\s*([a-z-]+)`, 'im');
  const m = re.exec(body);
  const value = m?.[1]?.toLowerCase();
  return value && allowed.includes(value) ? value : undefined;
}

function migrateBugs(root: string, nowIso: string): { migrated: string[] } {
  const legacyPath = path.join(root, 'bugs.md');
  if (!fs.existsSync(legacyPath)) return { migrated: [] };

  const raw = fs.readFileSync(legacyPath, 'utf-8');
  if (raw.includes('cortex init') && raw.includes('.cortex/compass/bugs/')) {
    return { migrated: [] }; // already migrated (deprecation marker in place)
  }

  const parts = raw.split(/\n(?=##\s)/).map((p) => p.trim());
  const entries = parts.filter((p) => p.startsWith('## '));
  if (entries.length === 0) return { migrated: [] };

  const bugsDir = path.join(root, '.cortex', 'compass', 'bugs');
  fs.mkdirSync(bugsDir, { recursive: true });

  // Monotonic numbering: continue after the highest existing B-NNN.
  let next = 1;
  for (const f of fs.readdirSync(bugsDir)) {
    const m = /^B-(\d{3,})/.exec(f);
    if (m?.[1]) next = Math.max(next, parseInt(m[1], 10) + 1);
  }

  const migrated: string[] = [];
  for (const entry of entries) {
    const lines = entry.split('\n');
    const title = (lines[0] ?? '').replace(/^##\s*/, '').trim() || 'untitled bug';
    const body = lines.slice(1).join('\n').trim();

    // Sensible defaults when the legacy entry doesn't say (spec Rule 9 guidance).
    const type = extractField(body, 'type', BUG_TYPE_ENUM) ?? 'missing-dev-spec';
    const severity = extractField(body, 'severity', BUG_SEVERITY_ENUM) ?? 'medium';
    const status = extractField(body, 'status', BUG_STATUS_ENUM) ?? 'open';

    // affects: backticked project paths that exist on disk, else the legacy ledger itself.
    const affects: string[] = [];
    for (const m of body.matchAll(/`([^`\n]+)`/g)) {
      const candidate = m[1];
      if (candidate && !candidate.includes(' ') && fs.existsSync(path.join(root, candidate))) {
        if (!affects.includes(candidate)) affects.push(candidate);
      }
    }
    if (affects.length === 0) affects.push('bugs.md');

    const id = `B-${String(next).padStart(3, '0')}`;
    next++;
    const filename = `${id}-${slugify(title)}.md`;
    const content = `---
id: ${id}
title: ${JSON.stringify(title)}
type: ${type}
severity: ${severity}
status: ${status}
affects:
${affects.map((a) => `  - ${a}`).join('\n')}
opened: ${nowIso}
---

# ${id} — ${title}

${body ? body + '\n\n' : ''}> Migrated from the legacy root \`bugs.md\` by \`cortex init\`.
`;
    fs.writeFileSync(path.join(bugsDir, filename), content, 'utf-8');
    migrated.push(filename);
  }

  // Deprecation marker (design §8.5): the original now only points at the new location.
  fs.writeFileSync(
    legacyPath,
    `# bugs.md — DEPRECATED

This legacy bug ledger was migrated by \`cortex init\` on ${nowIso}.

The bug ledger now lives at \`.cortex/compass/bugs/\` — one file per bug
(\`B-NNN-<slug>.md\`, cortex-schema.md §4.3). Do not add entries here.
`,
    'utf-8',
  );

  return { migrated };
}

// ---------------------------------------------------------------------------
// Rule 10 — CLAUDE.md managed block
// ---------------------------------------------------------------------------

function upsertClaudeMd(root: string): 'created' | 'inserted' | 'updated' | 'unchanged' {
  const claudeMdPath = path.join(root, 'CLAUDE.md');
  let projectName = path.basename(root);
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')) as Record<string, unknown>;
    if (typeof pkg['name'] === 'string' && pkg['name']) projectName = pkg['name'];
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
// Rule 11 — hooks registration (.claude/settings.json deep-merge)
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

function mergeSettings(root: string, preRead: boolean): string[] {
  const settingsPath = path.join(root, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      // Rule 16: never destroy an unparseable settings file.
      throw new Error(`.claude/settings.json exists but is not valid JSON; fix it and re-run cortex init`);
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
// Rule 12 — git post-commit hook
// ---------------------------------------------------------------------------

/** The exact command the installed post-commit hook calls (Rule 12) — the
 *  CLI's `anatomy-refresh-fast` branch must dispatch this exact string. */
export const GIT_HOOK_INVOCATION = 'cortex anatomy-refresh-fast';
const GIT_HOOK_SNIPPET = `\n# Cortex: fast deterministic anatomy refresh after each commit (never triggers the LLM subprocess)\n${GIT_HOOK_INVOCATION} >/dev/null 2>&1 || true\n`;

function installGitHook(root: string): 'created' | 'appended' | 'already-installed' | 'skipped-no-git' {
  const gitDir = path.join(root, '.git');
  if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) return 'skipped-no-git';

  const hooksDir = path.join(gitDir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, 'post-commit');

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf-8');
    if (existing.includes(GIT_HOOK_INVOCATION)) {
      fs.chmodSync(hookPath, 0o755);
      return 'already-installed';
    }
    const sep = existing.endsWith('\n') ? '' : '\n';
    fs.writeFileSync(hookPath, existing + sep + GIT_HOOK_SNIPPET, 'utf-8');
    fs.chmodSync(hookPath, 0o755);
    return 'appended';
  }

  fs.writeFileSync(hookPath, `#!/bin/sh${GIT_HOOK_SNIPPET}`, 'utf-8');
  fs.chmodSync(hookPath, 0o755);
  return 'created';
}

// ---------------------------------------------------------------------------
// Rules 13 & 17 — Desktop scheduled tasks (Rule 17: --partial skill gating)
// ---------------------------------------------------------------------------

interface TaskSkillGap {
  task: string;
  missingSkills: string[];
}

interface ScheduledTasksResult {
  written: number;
  preserved: number;
  /** Rule 17 (--partial): tasks not registered because a required skill is absent. */
  skipped: TaskSkillGap[];
  /** Default mode: tasks registered anyway whose required skill is currently absent. */
  lacking: TaskSkillGap[];
}

/** A required skill is "present" iff it exists as a directory in <root>/.claude/skills/. */
function missingRequiredSkills(root: string, requiredSkills: string[]): string[] {
  return requiredSkills.filter((skill) => {
    const dir = path.join(root, '.claude', 'skills', skill);
    return !(fs.existsSync(dir) && fs.statSync(dir).isDirectory());
  });
}

function writeScheduledTasks(home: string, force: boolean, root: string, partial: boolean): ScheduledTasksResult {
  const baseDir = path.join(home, '.claude', 'scheduled-tasks');
  let written = 0;
  let preserved = 0;
  const skipped: TaskSkillGap[] = [];
  const lacking: TaskSkillGap[] = [];
  for (const task of SCHEDULED_TASKS) {
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
    // 2-3): exists/preserve/overwrite keys on THIS project's scoped path only,
    // so other projects' tasks and non-Cortex entries are never counted,
    // listed, overwritten, or skipped-with-notice.
    const scoped = scopedTaskName(root, CANONICAL_TASK_NAMES[task.name] ?? task.name);
    const skillPath = path.join(baseDir, scoped, 'SKILL.md');
    if (fs.existsSync(skillPath) && !force) {
      preserved++;
      continue;
    }
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, scheduledTaskSkillMd(task, scoped), 'utf-8');
    written++;
  }
  return { written, preserved, skipped, lacking };
}

// ---------------------------------------------------------------------------
// init — the 17 rules in order
// ---------------------------------------------------------------------------

export async function init(root: string, opts: InitOptions = {}): Promise<InitResult> {
  const absRoot = path.resolve(root);
  const platform = opts.platform ?? process.platform;
  const home = opts.home ?? os.homedir();
  const force = opts.force ?? false;
  const yes = opts.yes ?? false;
  const noLlm = opts.noLlm ?? false;
  const partial = opts.partial ?? false;
  const claudeBin = opts.claudeBin ?? 'claude';
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const nowIso = new Date().toISOString();

  // Rule 1 — preflight: refuse before anything is written.
  if (platform !== 'darwin') {
    return {
      exitCode: 2,
      summary: `cortex init: refused — Cortex v1 requires macOS (darwin); this platform reports "${platform}". Nothing was written.`,
    };
  }
  const cortexDir = path.join(absRoot, '.cortex');
  if (fs.existsSync(cortexDir) && !force) {
    return {
      exitCode: 2,
      summary: `cortex init: refused — .cortex/ already exists at ${cortexDir}. Re-run with --force to re-initialise (merges and appends only; overwrites remain --force-gated). Nothing was written.`,
    };
  }

  // Rule 2 — gitignore.
  const gitignoreAdded = updateGitignore(absRoot);

  // Rule 3 — skeleton.
  writeSkeleton(absRoot, force, nowIso);
  const config = readConfig(absRoot);
  // hooks.preRead defaults TRUE (§10.1) — only an explicit false opts out.
  const preRead = ((config['hooks'] as Record<string, unknown> | undefined)?.['preRead']) !== false;

  // Rule 4 — skills install.
  const skills = await installSkills(absRoot, yes || force);

  // Rule 5 — anatomy scan (deterministic, per anatomy.scanner).
  const scanResult = await scan(absRoot);
  const flaggedAfterScan = scanResult.files.filter((f) => f.needsPurposeRefresh).length;

  // Rule 6 — inline purpose pass via the Claude Code CLI subprocess.
  let purposeLine: string;
  let authFailure = false;
  let filledInline = 0;
  let remainingFlagged = flaggedAfterScan;

  if (noLlm) {
    // Deliberate skip: a success state, never an error.
    purposeLine = `Purpose pass: skipped (--no-llm). ${flaggedAfterScan} file(s) flagged needs_purpose_refresh; the scheduled anatomy deep-refresh (or a re-run after authentication) will fill them.`;
  } else if (flaggedAfterScan === 0) {
    purposeLine = 'Purpose pass: nothing to do — no files flagged needs_purpose_refresh.';
  } else {
    const prompt =
      `Run the anatomy deep-refresh Skill (cortex-loop-anatomy-refresh, deep tier) on this project: ` +
      `for every row in .cortex/anatomy/files.md with needs_purpose_refresh: true, read the file, ` +
      `write a one-line purpose into the row, and set the flag to false. ` +
      `Keep the table format per cortex-schema.md section 4.1.`;
    const result = await runClaudeSubprocess(claudeBin, prompt, absRoot, timeoutMs);
    remainingFlagged = countFlagged(absRoot).flagged;
    filledInline = Math.max(0, flaggedAfterScan - remainingFlagged);

    switch (result.kind) {
      case 'ok':
        purposeLine = `Purpose pass: completed inline — ${filledInline} purpose(s) filled, ${remainingFlagged} left flagged needs_purpose_refresh.`;
        break;
      case 'auth':
        authFailure = true;
        purposeLine =
          `Purpose pass: authentication failure — ${result.detail}. ` +
          `Authenticate the Claude CLI (run \`claude\` and log in via /login), then re-run the purpose pass ` +
          `(cortex init --force) or wait for the scheduled anatomy deep-refresh. ` +
          `${remainingFlagged} file(s) remain flagged needs_purpose_refresh. All other artefacts are complete.`;
        break;
      case 'no-binary':
        purposeLine =
          `Purpose pass: skipped — ${result.detail}. ${remainingFlagged} file(s) remain flagged ` +
          `needs_purpose_refresh; the scheduled anatomy deep-refresh will handle them.`;
        break;
      default:
        // timeout / cancellation / mid-batch error: degrade gracefully, still exit 0.
        purposeLine =
          `Purpose pass: did not complete (${result.detail}). ${filledInline} purpose(s) were filled before it stopped; ` +
          `${remainingFlagged} file(s) remain flagged needs_purpose_refresh and the scheduled anatomy deep-refresh will finish them.`;
        break;
    }
  }

  // Rule 7 — preferences draft.
  const prefs = draftPreferences(absRoot, nowIso);

  // Rule 8 — spec trees (scaffold only when absent; never auto-run onboarding).
  const specTrees = scaffoldSpecTrees(absRoot);

  // Rule 9 — legacy bugs.md migration.
  const migration = migrateBugs(absRoot, nowIso);

  // Rule 10 — CLAUDE.md managed block.
  const claudeMdState = upsertClaudeMd(absRoot);

  // Rule 11 — hooks registration.
  const registeredHooks = mergeSettings(absRoot, preRead);

  // Rule 12 — git post-commit hook.
  const gitHookState = installGitHook(absRoot);

  // Rules 13 & 17 — Desktop scheduled tasks (--partial gates on skill presence).
  const tasks = writeScheduledTasks(home, force, absRoot, partial);

  // Rule 14 — self-validation.
  const report = await validate(absRoot, { root: absRoot });
  const errors = report.violations.filter((v) => v.severity === 'error');
  const warnings = report.violations.filter((v) => v.severity === 'warning');

  // Rule 15 — summary (Rule 6 notices included above).
  const lines: string[] = [];
  lines.push('cortex init — summary');
  lines.push(`Project: ${absRoot} (schema ${SCHEMA_VERSION})`);
  lines.push(
    `Files indexed: ${scanResult.files.length} (${filledInline} purpose(s) filled inline, ${remainingFlagged} flagged needs_purpose_refresh)`,
  );
  lines.push(purposeLine);
  lines.push(
    gitignoreAdded.length > 0
      ? `Gitignore: added ${gitignoreAdded.join(', ')}`
      : 'Gitignore: all Cortex subpaths already present',
  );
  lines.push(
    `Skills installed: ${skills.installed}${skills.preserved > 0 ? ` (${skills.preserved} existing bundle(s) preserved)` : ''}`,
  );
  lines.push(`Preferences drafted: .cortex/compass/preferences.md (${prefs.facts.length} fact(s); draft — review before accepting)`);
  lines.push(`Hooks registered in .claude/settings.json: ${registeredHooks.join(', ')}${preRead ? '' : ' (Read pair off per cortex.config.json hooks.preRead)'}`);
  switch (gitHookState) {
    case 'skipped-no-git':
      lines.push('Git hook: skipped — not a git repository.');
      break;
    case 'already-installed':
      lines.push('Git hook: .git/hooks/post-commit already contains the anatomy-refresh-fast invocation.');
      break;
    default:
      lines.push(`Git hook: anatomy-refresh-fast ${gitHookState} in .git/hooks/post-commit (executable).`);
      break;
  }
  if (partial) {
    // Rule 17 summary: "N loops registered", each skipped task named with its missing skill.
    const registered = SCHEDULED_TASKS.length - tasks.skipped.length;
    lines.push(
      `Scheduled tasks (--partial): ${tasks.written} written to ${path.join(home, '.claude', 'scheduled-tasks')}${tasks.preserved > 0 ? `, ${tasks.preserved} existing preserved` : ''} — ${registered} loop${registered === 1 ? '' : 's'} registered${registered === 0 ? ' (skills not present)' : ''}.`,
    );
    for (const gap of tasks.skipped) {
      lines.push(`  Skipped task "${gap.task}" — missing skill ${gap.missingSkills.map((s) => `"${s}"`).join(', ')} (not in .claude/skills/).`);
    }
  } else {
    lines.push(
      `Scheduled tasks: ${tasks.written} written to ${path.join(home, '.claude', 'scheduled-tasks')}${tasks.preserved > 0 ? `, ${tasks.preserved} existing preserved` : ''} (${SCHEDULED_TASKS.length} total).`,
    );
    if (tasks.lacking.length > 0) {
      // Rule 17 (default mode): warn which registered tasks currently lack their skill.
      lines.push(
        `Warning: ${tasks.lacking.length} registered task(s) currently lack their skill in .claude/skills/: ` +
          tasks.lacking.map((gap) => `${gap.task} (needs ${gap.missingSkills.join(', ')})`).join(', ') +
          '. They will degrade politely when they fire; run `cortex init --partial` to register only tasks whose skills are present.',
      );
    }
  }
  lines.push(`CLAUDE.md: managed cortex block ${claudeMdState}.`);
  lines.push(
    migration.migrated.length > 0
      ? `Migration: bugs.md → .cortex/compass/bugs/ (${migration.migrated.length} bug(s): ${migration.migrated.join(', ')}); deprecation marker left at bugs.md.`
      : 'Migration: none needed.',
  );
  if (specTrees.specsScaffolded || specTrees.businessScaffolded) {
    lines.push(
      `Spec trees: scaffolded ${[specTrees.specsScaffolded ? `${SPECS_REL}/` : null, specTrees.businessScaffolded ? `${BUSINESS_REL}/` : null].filter(Boolean).join(' and ')} — recommended next step: run specflow-onboard-codebase to populate them (init never runs it automatically).`,
    );
  } else {
    lines.push(`Spec trees: existing ${SPECS_REL}/ and ${BUSINESS_REL}/ left untouched.`);
  }
  lines.push('Reminder: open the Claude Desktop app to confirm the scheduled task cadences.');

  if (errors.length > 0) {
    lines.push(`Self-validation: FAILED — ${errors.length} violation(s):`);
    for (const v of errors) {
      lines.push(`  [${v.check}] ${path.relative(absRoot, v.location.path) || v.location.path}: ${v.message}`);
    }
  } else {
    lines.push(`Self-validation: conformant${warnings.length > 0 ? ` (${warnings.length} warning(s))` : ''}.`);
  }

  // Exit codes (Rule 15): validation failure (1) wins over auth (3); otherwise 0.
  const exitCode = errors.length > 0 ? 1 : authFailure ? 3 : 0;
  return { exitCode, summary: lines.join('\n') };
}
