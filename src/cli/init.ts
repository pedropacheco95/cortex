/**
 * `cortex init` — day-1 bootstrap (spec core-cli.init).
 *
 * Core makes NO LLM/API calls (RULES.md rule 3). v3 (build-order-v3 step 7):
 * the anatomy scan + inline purpose pass are retired with the anatomy module
 * (design §5.10) — codebase understanding is produced by the
 * `cortex-extract-insight` skill, which init only points at; the git
 * post-commit hook consolidates onto `cortex insight-refresh-fast` alone,
 * and init idempotently strips a stale anatomy line from an existing hook.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scaffoldInsight } from '../insight/scaffold.js';
import { scaffoldArchive } from '../archive/scaffold.js';
import { DEFAULT_PROFILE, type ProcessProfile } from './profile.js';
import { validate } from '../schema/validate.js';
import {
  SCHEMA_VERSION,
  CONFIG_DEFAULTS,
  GITIGNORE_LINES,
  CORTEX_INDEXES,
  SPECS_INDEX_TEMPLATE,
  SPECS_OVERVIEW_TEMPLATE,
  SPECS_BUSINESS_OVERVIEW_TEMPLATE,
  SCHEDULED_TASKS,
  COMPASS_ENVIRONMENT_TEMPLATE,
  COMPASS_DO_NOT_REPEAT_TEMPLATE,
  pulseDismissedTemplate,
} from './templates.js';
// Schema §2.3 re-rooted spec trees (specflow.reorg).
import { specsRoot, businessRoot, SPECS_REL, BUSINESS_REL } from '../paths.js';
// Rules 4, 10, 11, 12, 13 — the scaffolding mechanism shared with `cortex
// sync` (spec core-cli.sync Notes: "the same internal scaffolding module
// this spec exposes as cortex sync"). Re-exported below where external
// modules/tests still import these names from init.js.
import {
  installSkills,
  upsertClaudeMd,
  mergeSettings,
  installGitHook,
  writeScheduledTasks,
  registrationSummaryLines,
  stripRetiredGitHookLines,
  GIT_HOOK_INVOCATION,
} from './scaffold.js';
export {
  writeScheduledTasks,
  stripRetiredGitHookLines,
  GIT_HOOK_INVOCATION,
  INSIGHT_GIT_HOOK_INVOCATION,
  RETIRED_GIT_HOOK_INVOCATION,
} from './scaffold.js';
export type { TaskSkillGap, ScheduledTasksResult } from './scaffold.js';

export interface InitOptions {
  force?: boolean;
  yes?: boolean;
  /** Accepted for CLI compatibility; a no-op since the v1/v2 purpose pass retired (step 7). */
  noLlm?: boolean;
  /** Rule 17: register a scheduled task only if every skill its prompt invokes is present in .claude/skills/. */
  partial?: boolean;
  /** Testability seam: the user's home directory (default os.homedir()). */
  home?: string;
  /** Testability seam: the platform (default process.platform). */
  platform?: string;
  /**
   * Testability seam: the Desktop app-support root the Rule 15 read-only
   * registration check globs (default `<home>/Library/Application
   * Support/Claude`). Fixtures point this at a tmp dir.
   */
  appSupportDir?: string;
  /** Accepted for CLI compatibility; unused since the purpose pass retired (step 7). */
  claudeBin?: string;
  /** Accepted for CLI compatibility; unused since the purpose pass retired (step 7). */
  timeoutMs?: number;
  /**
   * The project's process profile (schema §10.1, spec `core-cli.init-profile`).
   * Omitted → `specflow`. Recorded in cortex.config.json; its only consumer is
   * scheduled-task scoping — Core stays process-agnostic.
   */
  profile?: ProcessProfile;
}

export interface InitResult {
  exitCode: number;
  summary: string;
}

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

/** A fresh config for a new project, carrying the chosen profile (§10.1).
 *  No flag → the default; there is nothing recorded yet to preserve. */
function freshConfig(profile: ProcessProfile | undefined): Record<string, unknown> {
  return { ...CONFIG_DEFAULTS, profile: profile ?? DEFAULT_PROFILE };
}

function writeSkeleton(root: string, force: boolean, nowIso: string, profile: ProcessProfile | undefined): void {
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
      // Rule 2 + Rule 16: an explicit --profile overrides what the existing
      // config says; with NO flag, an already-recorded profile is preserved
      // rather than being reset to the default. This path is only reachable
      // under --force (a plain re-init refuses and defers to `cortex sync`),
      // and a forced repair must not silently flip a superpowers project back
      // to specflow just because the flag was omitted.
      const merged: Record<string, unknown> = {
        ...CONFIG_DEFAULTS,
        ...existing,
        schemaVersion: SCHEMA_VERSION,
        ...(profile !== undefined ? { profile } : {}),
      };
      fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    } catch {
      // unparseable existing config: only --force may replace it
      if (force) fs.writeFileSync(configPath, JSON.stringify(freshConfig(profile), null, 2) + '\n', 'utf-8');
    }
  } else {
    fs.writeFileSync(configPath, JSON.stringify(freshConfig(profile), null, 2) + '\n', 'utf-8');
  }

  // Compass skeleton leaves (preserved if present — curated knowledge).
  // No decisions.md: decisions are single-homed to atlas/decisions/ (schema §4.2,
  // addendum §A2.1) — compass never scaffolds a decisions artefact.
  const compass = path.join(cortexDir, 'compass');
  writeIfAbsent(path.join(compass, 'environment.md'), COMPASS_ENVIRONMENT_TEMPLATE, false);
  writeIfAbsent(path.join(compass, 'do-not-repeat.md'), COMPASS_DO_NOT_REPEAT_TEMPLATE, false);

  // Pulse rejection memory (persists; preserved if present).
  writeIfAbsent(path.join(cortexDir, 'pulse', 'dismissed.md'), pulseDismissedTemplate(nowIso), false);

  // Pulse subdivided layout (pulse reorg): pre-create the organised directories
  // so a fresh project shows the correct structure day-1. reports/ holds loop
  // reports, state/ (+ state/reads/) the machine working state, extraction/ the
  // Skill-layer extraction artefacts. Writers mkdir -p anyway; pulse/ is
  // gitignored, so no .gitkeep is needed.
  const pulseDir = path.join(cortexDir, 'pulse');
  for (const sub of ['reports', 'state', path.join('state', 'reads'), 'extraction']) {
    fs.mkdirSync(path.join(pulseDir, sub), { recursive: true });
  }

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
// Rule 4 — skills install: mechanism moved to scaffold.ts (shared with sync).
// ---------------------------------------------------------------------------

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
// Rule 1 (nested-layer guard) — refuse when the target sits at or beneath an
// existing Cortex layer instead of at a project root (B-013).
// ---------------------------------------------------------------------------

/**
 * Walk `absRoot`'s ancestor chain (including itself). If any directory in
 * that chain is named `.cortex` AND carries its own `cortex.config.json` —
 * the definitive Cortex-layer marker — the target is at or beneath a real
 * Cortex layer. A directory merely named `.cortex` with no config (e.g. a
 * fresh empty dir) does not count: only a directory a `.cortex/` layer
 * genuinely owns triggers this.
 */
function findEnclosingCortexLayer(absRoot: string): { layerDir: string; projectRoot: string } | null {
  let dir = absRoot;
  for (;;) {
    if (path.basename(dir) === '.cortex' && fs.existsSync(path.join(dir, 'cortex.config.json'))) {
      return { layerDir: dir, projectRoot: path.dirname(dir) };
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null; // reached the filesystem root
    dir = parent;
  }
}

// ---------------------------------------------------------------------------
// Rules 10, 11, 12, 13 & 17 — CLAUDE.md, hooks, git hook, Desktop scheduled
// tasks: mechanism moved to scaffold.ts (shared with sync); --partial's
// skill-gating (Rule 17) stays inline in the writeScheduledTasks mechanism
// there, unchanged.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// init — the 17 rules in order
// ---------------------------------------------------------------------------

export async function init(root: string, opts: InitOptions = {}): Promise<InitResult> {
  const absRoot = path.resolve(root);
  const platform = opts.platform ?? process.platform;
  const home = opts.home ?? os.homedir();
  const force = opts.force ?? false;
  const yes = opts.yes ?? false;
  const partial = opts.partial ?? false;
  const profile = opts.profile;
  const nowIso = new Date().toISOString();

  // Rule 1 — preflight: refuse before anything is written.
  if (platform !== 'darwin') {
    return {
      exitCode: 2,
      summary: `cortex init: refused — Cortex v1 requires macOS (darwin); this platform reports "${platform}". Nothing was written.`,
    };
  }
  // Rule 1 (nested-layer guard, B-013) — refuse when the target itself is a
  // `.cortex` directory of an existing layer, or nested beneath one (e.g. a
  // subdirectory of `.cortex/`). Distinct from the existing-`.cortex`-child
  // gate just below: that one refuses "this dir already HAS a `.cortex`
  // child"; this one refuses "this dir IS/is BENEATH a `.cortex` layer". A
  // normal project root that merely contains a `.cortex/` child (the everyday
  // case) is untouched by this check — only a directory literally named
  // `.cortex` carrying the layer's own `cortex.config.json` marker matches.
  // Never bypassable by `--force`: initialising inside `.cortex/` is never
  // intentional.
  const enclosingLayer = findEnclosingCortexLayer(absRoot);
  if (enclosingLayer) {
    return {
      exitCode: 2,
      summary: `cortex init: refused — the target ${absRoot} is inside an existing Cortex layer (${enclosingLayer.layerDir}). Cortex manages a project from its ROOT, not from inside .cortex/. Run \`cortex init\` (or \`cortex sync\`) at ${enclosingLayer.projectRoot} instead. Nothing was written. (Not bypassable by --force.)`,
    };
  }

  const cortexDir = path.join(absRoot, '.cortex');
  if (fs.existsSync(cortexDir) && !force) {
    return {
      exitCode: 2,
      // Rule 1 (amended for core-cli.sync): the existing-project path is now
      // `cortex sync` — repair/upgrade an existing project without a forced
      // re-init. `--force` still re-runs init itself for the rare case a
      // from-scratch re-init is truly wanted.
      summary: `cortex init: refused — .cortex/ already exists at ${cortexDir}. Run \`cortex sync\` to repair or upgrade this existing project (or re-run \`cortex init --force\` to re-initialise from scratch — merges and appends only; overwrites remain --force-gated). Nothing was written.`,
    };
  }

  // Rule 2 — gitignore.
  const gitignoreAdded = updateGitignore(absRoot);

  // Rule 3 — skeleton.
  writeSkeleton(absRoot, force, nowIso, profile);
  const config = readConfig(absRoot);
  // hooks.preRead defaults TRUE (§10.1) — only an explicit false opts out.
  const preRead = ((config['hooks'] as Record<string, unknown> | undefined)?.['preRead']) !== false;

  // Rule 4 — skills install.
  const skills = await installSkills(absRoot, yes || force);

  // Rules 5-6 (v1/v2 anatomy scan + inline purpose pass) are RETIRED at
  // build-order-v3 step 7: codebase understanding is the cortex-extract-insight
  // skill's job (design §5.10); init only scaffolds the empty insight module
  // and points at the extraction. --no-llm is accepted for CLI compatibility
  // (init no longer spawns any subprocess either way).

  // Rule 7 — preferences draft.
  const prefs = draftPreferences(absRoot, nowIso);

  // Rule 8 — spec trees (scaffold only when absent; never auto-run onboarding).
  const specTrees = scaffoldSpecTrees(absRoot);

  // Rule 9 — legacy bugs.md migration.
  const migration = migrateBugs(absRoot, nowIso);

  // Citation-graph compile (schema §4.9): formerly a side effect of the
  // anatomy scan (retired at build-order-v3 step 7); init now compiles the
  // curated constellation directly so the renderer works day-1.
  const { compile } = await import('../constellation/compile.js');
  await compile(absRoot);
  // Recall index (schema §4.11, 3.4): compiled after the constellation so a
  // fresh project has both regenerable files on day one (core-cli.init Rule 2).
  const { writeRecallIndex } = await import('../recall/index.js');
  const recall = await writeRecallIndex(absRoot);
  // 3.4 second revision: the generated blocks in atlas/decisions and
  // atlas/evidence `_index.md`, immediately after the recall index
  // (recall.index-blocks Rule 6). On a fresh project both are empty, so no
  // block is written and the files stay byte-identical to their templates.
  const { writeRecallIndexBlocks } = await import('../recall/index-blocks.js');
  writeRecallIndexBlocks(absRoot, recall);

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
    'Insight: module scaffolded empty — run the cortex-extract-insight skill to build the understanding layer (init never runs it automatically).',
  );
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
      lines.push('Git hook: .git/hooks/post-commit already contains the insight-refresh-fast invocation.');
      break;
    default:
      lines.push(`Git hook: insight-refresh-fast ${gitHookState} in .git/hooks/post-commit (executable).`);
      break;
  }
  if (partial) {
    // Rule 17 summary: "N bundle payloads written", each skipped bundle named with its missing skill.
    const registered = SCHEDULED_TASKS.length - tasks.skipped.length;
    lines.push(
      `Scheduled tasks (--partial): ${tasks.written} written to ${path.join(home, '.claude', 'scheduled-tasks')}${tasks.preserved > 0 ? `, ${tasks.preserved} existing preserved` : ''} — ${registered} bundle payload${registered === 1 ? '' : 's'} on disk${registered === 0 ? ' (skills not present)' : ''}.`,
    );
    for (const gap of tasks.skipped) {
      lines.push(`  Skipped bundle "${gap.task}" — missing skill ${gap.missingSkills.map((s) => `"${s}"`).join(', ')} (not in .claude/skills/).`);
    }
  } else {
    lines.push(
      `Scheduled tasks: ${tasks.written} written to ${path.join(home, '.claude', 'scheduled-tasks')}${tasks.preserved > 0 ? `, ${tasks.preserved} existing preserved` : ''} (${SCHEDULED_TASKS.length} total).`,
    );
    if (tasks.lacking.length > 0) {
      // Rule 17 (default mode): warn which written tasks currently lack their skill.
      lines.push(
        `Warning: ${tasks.lacking.length} written task(s) currently lack their skill in .claude/skills/: ` +
          tasks.lacking.map((gap) => `${gap.task} (needs ${gap.missingSkills.join(', ')})`).join(', ') +
          '. They will degrade politely when they fire; run `cortex init --partial` to write only tasks whose skills are present.',
      );
    }
  }
  if (tasks.retired.length > 0) {
    lines.push(`Scheduled tasks retired (schema §9.1 deregistration): ${tasks.retired.join(', ')}.`);
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
  // B-009 (final mechanism): payloads on disk are NOT registration — the
  // Desktop app owns its registry in memory, so registration happens inside a
  // Desktop session via the cortex-register-tasks skill. Init runs the
  // read-only registry check (registry-not-found tolerated: the app may never
  // have run) and prints the instruction block when anything is unregistered.
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

  // Exit codes (Rule 15): validation failure → 1; otherwise 0. (Exit 3 — the
  // v1/v2 purpose-pass auth failure — retired with the purpose pass, step 7.)
  const exitCode = errors.length > 0 ? 1 : 0;
  return { exitCode, summary: lines.join('\n') };
}
