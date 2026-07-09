/**
 * Atomic tests for core-cli.init — granular behaviours behind the ACs:
 * exit codes (3 retired with the purpose pass, step 7), settings deep-merge
 * details, the exact five bundle names, gitignore exactness, config
 * defaults, index shapes, preferences, the git-hook v2 migration
 * (stripRetiredGitHookLines), idempotency and no-silent-destruction (Rule 16).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import {
  init,
  stripRetiredGitHookLines,
  GIT_HOOK_INVOCATION,
  INSIGHT_GIT_HOOK_INVOCATION,
  RETIRED_GIT_HOOK_INVOCATION,
} from '../../../src/cli/init.js';
import { validate } from '../../../src/schema/validate.js';
import { SCHEDULED_TASKS } from '../../../src/cli/templates.js';
import { CANONICAL_TASK_NAMES, scopedTaskName, hashScopedTaskName, isOwnScopedTask } from '../../../src/cli/task-scoping.js';
import {
  makeTmpDir,
  cleanTmp,
  gitInit,
  recordingStub,
  writeUndocumentedFiles,
} from '../../fixtures/init-harness.js';

const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const };

// ---------------------------------------------------------------------------
// Rule 1 — preflight
// ---------------------------------------------------------------------------
describe('Rule 1: preflight', () => {
  let root: string;
  let home: string;
  beforeAll(() => {
    root = makeTmpDir('pre-proj');
    home = makeTmpDir('pre-home');
    fs.mkdirSync(path.join(root, '.cortex'), { recursive: true });
  });
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('existing .cortex/ with --force proceeds (exit 0)', async () => {
    const result = await init(root, { noLlm: true, force: true, home, ...DARWIN });
    expect(result.exitCode).toBe(0);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Exit codes: validation failure → 1; exit 3 retired with the purpose pass
// ---------------------------------------------------------------------------
describe('exit codes: validation failure → 1 (exit 3 retired with the purpose pass, step 7)', () => {
  let root: string;
  let home: string;
  beforeAll(() => {
    root = makeTmpDir('prec-proj');
    home = makeTmpDir('prec-home');
    // A pre-existing .specflow/specs/ tree that init must not touch (Rule 8) and that
    // fails check.specs-index → self-validation error.
    fs.mkdirSync(path.join(root, '.specflow', 'specs'), { recursive: true });
    fs.writeFileSync(path.join(root, '.specflow', 'specs', '_index.md'), 'broken index with no required sections\n');
    writeUndocumentedFiles(root, 1);
  });
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('validation errors → exit 1 even with the retired claudeBin/timeoutMs options passed (no-ops)', async () => {
    const result = await init(root, { home, ...DARWIN, claudeBin: '/nonexistent/claude', timeoutMs: 20_000 });
    expect(result.exitCode).toBe(1);
    expect(result.summary).toContain('Self-validation: FAILED');
    expect(result.summary).toContain('check.specs-index');
    // The v1/v2 auth-failure surface (exit 3, "authentication" notice) is gone.
    expect(result.summary).not.toMatch(/authentication/i);
    expect(result.summary).not.toMatch(/Purpose pass:/);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 2 — gitignore exactness
// ---------------------------------------------------------------------------
describe('Rule 2: gitignore', () => {
  it('creates .gitignore with exactly the four paths (no .cortex/anatomy/, step 7) and never a bare .cortex/', async () => {
    const root = makeTmpDir('gi-proj');
    const home = makeTmpDir('gi-home');
    try {
      await init(root, { noLlm: true, home, ...DARWIN });
      const lines = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8').split('\n').filter((l) => l.trim() !== '');
      expect(lines.sort()).toEqual(
        [
          '.cortex/atlas/sources/',
          '.cortex/pulse/',
          '.cortex/constellation.json',
          // v3.0 archive mixed-policy: only the raw per-document source is
          // gitignored — _index.md/register.md/metadata.yaml/extracted/types
          // are all committed (schema §4.4, Decision 1 v3.0 amendment).
          '.cortex/archive/documents/*/source.*',
        ].sort(),
      );
      expect(lines).not.toContain('.cortex/');
      expect(lines).not.toContain('.cortex/anatomy/'); // retired with the anatomy module
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);

  it('re-running with --force does not duplicate lines', async () => {
    const root = makeTmpDir('gi2-proj');
    const home = makeTmpDir('gi2-home');
    try {
      await init(root, { noLlm: true, home, ...DARWIN });
      await init(root, { noLlm: true, force: true, home, ...DARWIN });
      const lines = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8').split('\n').map((l) => l.trim());
      for (const wanted of [
        '.cortex/atlas/sources/',
        '.cortex/pulse/',
        '.cortex/constellation.json',
        '.cortex/archive/documents/*/source.*',
      ]) {
        expect(lines.filter((l) => l === wanted)).toHaveLength(1);
      }
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 3 — skeleton: config defaults and index shapes
// ---------------------------------------------------------------------------
describe('Rule 3: skeleton', () => {
  let root: string;
  let home: string;
  beforeAll(async () => {
    root = makeTmpDir('skel-proj');
    home = makeTmpDir('skel-home');
    await init(root, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('cortex.config.json carries the exact §10.1 defaults (no anatomy or insight blocks, v3.0 A10.0)', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8'));
    expect(config).toEqual({
      schemaVersion: '3.0',
      // preRead defaults TRUE and is written explicitly (§10.1: the Read pair
      // is on by default; the config self-documents).
      hooks: { preRead: true },
      pulse: { distilThresholdN: 3, dismissedWindowDays: 90, hygieneFreshnessHours: 48 },
      harness: { maxIterations: 3 },
      loop: { enabled: false },
    });
  });

  it('every .cortex/ _index.md follows the §7.1 active-prompt shape', () => {
    const walk = (dir: string): string[] => {
      const found: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) found.push(...walk(full));
        else if (entry.name === '_index.md') found.push(full);
      }
      return found;
    };
    const indexes = walk(path.join(root, '.cortex'));
    expect(indexes.length).toBe(12); // root + compass(+bugs,rules) + atlas(+3 subdirs,sources) + pulse + insight (anatomy/, concepts/ carry none, §4.10.1 v3) + archive (documents/, types/ carry none, §4.4) — no module-level anatomy/ since step 7
    const insightIndex = path.join(root, '.cortex', 'insight', '_index.md');
    for (const idx of indexes) {
      const content = fs.readFileSync(idx, 'utf-8');
      if (idx === insightIndex) {
        // §7.4 v3: insight/_index.md is LOCKED template text (design §5.13)
        // without the §7.1 headings — its shape is asserted by the
        // storage-format/module-contract tests + check.insight-index.
        expect(content, idx).toContain('(ungated)');
        expect(content, idx).toContain('cortex insight file <path>');
      } else {
        expect(content, idx).toContain('Read this when:');
        expect(content, idx).toContain("What's here:");
        expect(content, idx).toContain('How to navigate:');
      }
      // soft <300-token budget (≈ chars/4)
      expect(content.length / 4, `${idx} over token budget`).toBeLessThan(300);
    }
  });

  it('pulse/dismissed.md exists with a schema-valid pulse header', () => {
    const data = matter(fs.readFileSync(path.join(root, '.cortex', 'pulse', 'dismissed.md'), 'utf-8')).data;
    expect(data['kind']).toBe('pulse-dismissed');
    expect(data['generated']).toBeTruthy();
    expect(data['loop']).toBeTruthy();
  });

  it('scaffolded .specflow/specs/_index.md has the §7.2 sections', () => {
    const content = fs.readFileSync(path.join(root, '.specflow', 'specs', '_index.md'), 'utf-8');
    for (const section of ['Read this when:', '## Domains', '## Dependency Graph', '## Build Order']) {
      expect(content).toContain(section);
    }
  });

  it('scaffolded _overview.md files have the §7.3 headings', () => {
    for (const p of [path.join(root, '.specflow', 'specs', '_overview.md'), path.join(root, '.specflow', 'specs-business', '_overview.md')]) {
      const content = fs.readFileSync(p, 'utf-8');
      expect(content).toContain('## What this is');
      expect(content).toContain('## What it covers');
      expect(content).toContain("## Why it's grouped this way");
    }
  });

  it('CLAUDE.md was created with the v-versioned managed block', () => {
    const content = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('<!-- cortex:start v3.0 -->');
    expect(content).toContain('<!-- cortex:end -->');
    expect(content).toContain('Modules present: compass, atlas, archive, insight, pulse. Schema: 3.0.');
  });

  it('no module-level .cortex/anatomy/ is scaffolded (retired at step 7)', () => {
    expect(fs.existsSync(path.join(root, '.cortex', 'anatomy'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 3 — archive module scaffolding (schema §4.4, new at v3.0)
// ---------------------------------------------------------------------------
describe('Rule 3: archive module scaffolding', () => {
  let root: string;
  let home: string;
  beforeAll(async () => {
    root = makeTmpDir('archive-proj');
    home = makeTmpDir('archive-home');
    await init(root, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('creates archive/_index.md, register.md, and empty documents/ + types/', () => {
    const archiveDir = path.join(root, '.cortex', 'archive');
    expect(fs.existsSync(path.join(archiveDir, '_index.md'))).toBe(true);
    expect(fs.existsSync(path.join(archiveDir, 'register.md'))).toBe(true);
    expect(fs.statSync(path.join(archiveDir, 'documents')).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(archiveDir, 'types')).isDirectory()).toBe(true);
    expect(fs.readdirSync(path.join(archiveDir, 'documents'))).toEqual([]);
    expect(fs.readdirSync(path.join(archiveDir, 'types'))).toEqual([]);
  });

  it('archive/_index.md follows the §7.1 active-prompt shape', () => {
    const content = fs.readFileSync(path.join(root, '.cortex', 'archive', '_index.md'), 'utf-8');
    expect(content).toContain('Read this when:');
    expect(content).toContain("What's here:");
    expect(content).toContain('How to navigate:');
  });

  it('the project self-validates clean with the freshly-scaffolded (empty) archive module', async () => {
    const report = await validate(root, { root });
    const archiveViolations = report.violations.filter((v) => v.check.startsWith('check.archive'));
    expect(archiveViolations).toEqual([]);
  });

  it('an existing register.md is never overwritten, even with --force (Rule 16)', async () => {
    const registerPath = path.join(root, '.cortex', 'archive', 'register.md');
    const curated = '# Archive register\n\n- curated-entry — hand-edited\n';
    fs.writeFileSync(registerPath, curated);
    await init(root, { noLlm: true, force: true, home, ...DARWIN });
    expect(fs.readFileSync(registerPath, 'utf-8')).toBe(curated);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rules 5-6 RETIRED (step 7) — init never spawns a claude subprocess
// ---------------------------------------------------------------------------
describe('Rules 5-6 retired: init never spawns a claude subprocess', () => {
  it('the claude stub is never invoked, even with source files present and claudeBin set', async () => {
    const root = makeTmpDir('nospawn-proj');
    const home = makeTmpDir('nospawn-home');
    const binDir = makeTmpDir('nospawn-bin');
    try {
      const recordFile = path.join(binDir, 'record.txt');
      const stub = recordingStub(binDir, recordFile);
      writeUndocumentedFiles(root, 3); // v1/v2 would have flagged + purpose-passed these
      const result = await init(root, { home, ...DARWIN, claudeBin: stub, timeoutMs: 20_000 });
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(recordFile)).toBe(false);
      // The summary points at the extraction skill instead of any scan/pass lines.
      expect(result.summary).toContain(
        'Insight: module scaffolded empty — run the cortex-extract-insight skill to build the understanding layer (init never runs it automatically).',
      );
      expect(result.summary).not.toMatch(/Files indexed:/);
      expect(result.summary).not.toMatch(/Purpose pass:/);
    } finally {
      cleanTmp(root); cleanTmp(home); cleanTmp(binDir);
    }
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 7 — preferences draft
// ---------------------------------------------------------------------------
describe('Rule 7: preferences draft', () => {
  it('extracts stack facts deterministically and marks them a draft', async () => {
    const root = makeTmpDir('prefs-proj');
    const home = makeTmpDir('prefs-home');
    try {
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name: 'demo-app',
          type: 'module',
          packageManager: 'pnpm@9.0.0',
          scripts: { test: 'vitest run', build: 'tsc' },
          devDependencies: { typescript: '^5.0.0', vitest: '^2.0.0' },
        }),
      );
      fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, module: 'NodeNext' } }));
      await init(root, { noLlm: true, home, ...DARWIN });
      const content = fs.readFileSync(path.join(root, '.cortex', 'compass', 'preferences.md'), 'utf-8');
      expect(content).toContain('DRAFT');
      expect(content).toContain('not accepted rules');
      expect(content).toContain('pnpm@9.0.0');
      expect(content).toContain('TypeScript strict mode: enabled');
      expect(content).toContain('Test runner: vitest');
      expect(matter(content).data['confidence']).toBe('EXTRACTED');
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);

  it('absent inputs are skipped silently (empty project still gets a draft)', async () => {
    const root = makeTmpDir('prefs2-proj');
    const home = makeTmpDir('prefs2-home');
    try {
      const result = await init(root, { noLlm: true, home, ...DARWIN });
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(path.join(root, '.cortex', 'compass', 'preferences.md'))).toBe(true);
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);

  it('an existing preferences.md is never overwritten, even with --force (Rule 16)', async () => {
    const root = makeTmpDir('prefs3-proj');
    const home = makeTmpDir('prefs3-home');
    try {
      await init(root, { noLlm: true, home, ...DARWIN });
      const prefsPath = path.join(root, '.cortex', 'compass', 'preferences.md');
      const curated = '# Reviewed preferences\n\n- humans approved this\n';
      fs.writeFileSync(prefsPath, curated);
      await init(root, { noLlm: true, force: true, home, ...DARWIN });
      expect(fs.readFileSync(prefsPath, 'utf-8')).toBe(curated);
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 11 — settings.json deep-merge
// ---------------------------------------------------------------------------
describe('Rule 11: settings.json deep-merge', () => {
  it('preserves deeply nested unrelated keys and existing hook arrays', async () => {
    const root = makeTmpDir('merge-proj');
    const home = makeTmpDir('merge-home');
    try {
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      const existing = {
        model: 'opus',
        permissions: { allow: ['Bash(ls:*)'], deny: [] },
        env: { FOO: 'bar' },
        hooks: {
          Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'say done' }] }],
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-guard' }] }],
        },
      };
      fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify(existing));
      await init(root, { noLlm: true, home, ...DARWIN });
      const merged = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf-8'));
      expect(merged.model).toBe('opus');
      expect(merged.permissions).toEqual(existing.permissions);
      expect(merged.env).toEqual(existing.env);
      expect(merged.hooks.Stop).toEqual(existing.hooks.Stop);
      // pre-existing PreToolUse entry preserved, cortex entry appended
      expect(JSON.stringify(merged.hooks.PreToolUse)).toContain('my-guard');
      expect(JSON.stringify(merged.hooks.PreToolUse)).toContain('cortex hook pre-write');
      // preRead is TRUE by default → the Read pair is registered together
      expect(JSON.stringify(merged.hooks.PreToolUse)).toContain('cortex hook pre-read');
      expect(JSON.stringify(merged.hooks.PostToolUse)).toContain('cortex hook post-read');
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);

  it('re-running with --force does not duplicate cortex hook entries', async () => {
    const root = makeTmpDir('merge2-proj');
    const home = makeTmpDir('merge2-home');
    try {
      await init(root, { noLlm: true, home, ...DARWIN });
      await init(root, { noLlm: true, force: true, home, ...DARWIN });
      const raw = fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf-8');
      expect(raw.split('cortex hook session-start').length - 1).toBe(1);
      expect(raw.split('cortex hook pre-write').length - 1).toBe(1);
      expect(raw.split('cortex hook post-write').length - 1).toBe(1);
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);

  it('writes the PreRead hook entry iff cortex.config.json hooks.preRead is true', async () => {
    const root = makeTmpDir('merge3-proj');
    const home = makeTmpDir('merge3-home');
    try {
      // Pre-seed a config with preRead: true; init merges rather than clobbers it.
      fs.mkdirSync(path.join(root, '.cortex'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.cortex', 'cortex.config.json'),
        JSON.stringify({ schemaVersion: '1.0', hooks: { preRead: true } }),
      );
      const result = await init(root, { noLlm: true, force: true, home, ...DARWIN });
      const merged = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf-8'));
      expect(JSON.stringify(merged.hooks.PreToolUse)).toContain('cortex hook pre-read');
      expect(result.exitCode).toBe(0); // check.hook-config passes with the PreToolUse(Read) entry
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 12 — git hook skip notice
// ---------------------------------------------------------------------------
describe('Rule 12: git hook skipped with a notice when not a git repo', () => {
  it('summary carries the skip notice and no hook file is created', async () => {
    const root = makeTmpDir('nogit-proj');
    const home = makeTmpDir('nogit-home');
    try {
      const result = await init(root, { noLlm: true, home, ...DARWIN });
      expect(result.exitCode).toBe(0);
      expect(result.summary).toMatch(/Git hook: skipped — not a git repository/);
      expect(fs.existsSync(path.join(root, '.git'))).toBe(false);
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 12 — the consolidated insight-only hook + step-7 migration
// ---------------------------------------------------------------------------
describe('Rule 12: hook invocation constants and stripRetiredGitHookLines', () => {
  it('GIT_HOOK_INVOCATION is the insight fast tier; INSIGHT_GIT_HOOK_INVOCATION aliases it', () => {
    expect(GIT_HOOK_INVOCATION).toBe('cortex insight-refresh-fast');
    expect(INSIGHT_GIT_HOOK_INVOCATION).toBe(GIT_HOOK_INVOCATION);
    expect(RETIRED_GIT_HOOK_INVOCATION).toBe('cortex anatomy-refresh-fast');
  });

  it('strips the retired invocation line plus its immediately preceding # Cortex: comment', () => {
    const content = [
      '#!/bin/sh',
      'echo user-content',
      '',
      '# Cortex: fast deterministic anatomy re-scan after each commit (no LLM)',
      'cortex anatomy-refresh-fast >/dev/null 2>&1 || true',
      '',
      '# Cortex: fast deterministic insight change-flagging after each commit (no LLM, no extraction)',
      'cortex insight-refresh-fast >/dev/null 2>&1 || true',
      '',
    ].join('\n');
    const stripped = stripRetiredGitHookLines(content);
    expect(stripped).not.toContain('anatomy-refresh-fast');
    expect(stripped).toContain('echo user-content');
    expect(stripped).toContain('cortex insight-refresh-fast >/dev/null 2>&1 || true');
    // Only the anatomy pair's # Cortex: comment goes; the insight one stays.
    expect(stripped).toContain('# Cortex: fast deterministic insight change-flagging');
    expect(stripped).not.toContain('anatomy re-scan');
  });

  it('a non-Cortex comment above the retired line is preserved; content without the line is untouched', () => {
    const withUserComment = '#!/bin/sh\n# my own note\ncortex anatomy-refresh-fast || true\necho after\n';
    const stripped = stripRetiredGitHookLines(withUserComment);
    expect(stripped).toContain('# my own note');
    expect(stripped).not.toContain('anatomy-refresh-fast');
    expect(stripped).toContain('echo after');

    const clean = '#!/bin/sh\necho only-user-content\n';
    expect(stripRetiredGitHookLines(clean)).toBe(clean);
  });

  it('is idempotent: stripping twice equals stripping once', () => {
    const content = '#!/bin/sh\n# Cortex: anatomy tier\ncortex anatomy-refresh-fast >/dev/null 2>&1 || true\n';
    const once = stripRetiredGitHookLines(content);
    expect(stripRetiredGitHookLines(once)).toBe(once);
  });
});

describe('Rule 12: existing v2 dual-line hook is migrated to insight-only', () => {
  it('anatomy line dropped, user content preserved, summary says already-installed, re-run idempotent', async () => {
    const root = makeTmpDir('hookmig-proj');
    const home = makeTmpDir('hookmig-home');
    try {
      gitInit(root);
      const hookPath = path.join(root, '.git', 'hooks', 'post-commit');
      fs.mkdirSync(path.dirname(hookPath), { recursive: true });
      fs.writeFileSync(
        hookPath,
        [
          '#!/bin/sh',
          'echo user-line',
          '',
          '# Cortex: fast deterministic anatomy re-scan after each commit (no LLM)',
          'cortex anatomy-refresh-fast >/dev/null 2>&1 || true',
          '',
          '# Cortex: fast deterministic insight change-flagging after each commit (no LLM, no extraction)',
          'cortex insight-refresh-fast >/dev/null 2>&1 || true',
          '',
        ].join('\n'),
      );
      const result = await init(root, { noLlm: true, home, ...DARWIN });
      expect(result.exitCode).toBe(0);
      const migrated = fs.readFileSync(hookPath, 'utf-8');
      expect(migrated).toContain('echo user-line');
      expect(migrated).not.toContain('anatomy-refresh-fast');
      expect(migrated).toContain('cortex insight-refresh-fast');
      // Insight invocation already present → the "already contains" summary line.
      expect(result.summary).toContain(
        'Git hook: .git/hooks/post-commit already contains the insight-refresh-fast invocation.',
      );
      expect(fs.statSync(hookPath).mode & 0o111).toBeGreaterThan(0);

      // Idempotent: a second run (--force to pass preflight) changes nothing.
      const second = await init(root, { noLlm: true, force: true, home, ...DARWIN });
      expect(second.exitCode).toBe(0);
      expect(fs.readFileSync(hookPath, 'utf-8')).toBe(migrated);
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);

  it('a v2 hook with only the anatomy line gets it stripped and the insight snippet appended', async () => {
    const root = makeTmpDir('hookmig2-proj');
    const home = makeTmpDir('hookmig2-home');
    try {
      gitInit(root);
      const hookPath = path.join(root, '.git', 'hooks', 'post-commit');
      fs.mkdirSync(path.dirname(hookPath), { recursive: true });
      fs.writeFileSync(
        hookPath,
        '#!/bin/sh\necho existing\n\n# Cortex: fast deterministic anatomy re-scan after each commit (no LLM)\ncortex anatomy-refresh-fast >/dev/null 2>&1 || true\n',
      );
      const result = await init(root, { noLlm: true, home, ...DARWIN });
      expect(result.exitCode).toBe(0);
      const content = fs.readFileSync(hookPath, 'utf-8');
      expect(content).toContain('echo existing');
      expect(content).not.toContain('anatomy-refresh-fast');
      expect(content).toContain('cortex insight-refresh-fast >/dev/null 2>&1 || true');
      expect(result.summary).toContain(
        'Git hook: insight-refresh-fast appended in .git/hooks/post-commit (executable).',
      );
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);

  it('a fresh repo without a hook gets the insight-only hook created', async () => {
    const root = makeTmpDir('hookmig3-proj');
    const home = makeTmpDir('hookmig3-home');
    try {
      gitInit(root);
      const result = await init(root, { noLlm: true, home, ...DARWIN });
      expect(result.exitCode).toBe(0);
      const content = fs.readFileSync(path.join(root, '.git', 'hooks', 'post-commit'), 'utf-8');
      expect(content).toContain('cortex insight-refresh-fast >/dev/null 2>&1 || true');
      expect(content).not.toContain('anatomy-refresh-fast');
      expect(result.summary).toContain(
        'Git hook: insight-refresh-fast created in .git/hooks/post-commit (executable).',
      );
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 13 — the five bundle names, exactly
// ---------------------------------------------------------------------------
describe('Rule 13: the five scheduled task bundles are exactly the design set, project-scoped (§9.1)', () => {
  it("writes exactly the five scoped bundle names; --force overwrites only THIS project's entries", async () => {
    const root = makeTmpDir('tasks-proj');
    const root2 = makeTmpDir('tasks-proj2');
    const home = makeTmpDir('tasks-home');
    try {
      await init(root, { noLlm: true, home, ...DARWIN });
      const base = path.join(home, '.claude', 'scheduled-tasks');
      // The five canonical bundle names, each under this project's plain <slug>- prefix.
      const expected = SCHEDULED_TASKS
        .map((t) => scopedTaskName(root, CANONICAL_TASK_NAMES[t.name]!))
        .sort();
      expect(fs.readdirSync(base).sort()).toEqual(expected);
      for (const dir of fs.readdirSync(base)) {
        expect(isOwnScopedTask(root, dir), dir).toBe(true);
      }

      // Another project's --force init never touches this project's task
      // (task-scoping Rule 3: recognition is project-scoped)…
      const scopedDistil = scopedTaskName(root, CANONICAL_TASK_NAMES['weekly-curation']!);
      const target = path.join(base, scopedDistil, 'SKILL.md');
      fs.writeFileSync(target, `---\nname: ${scopedDistil}\ndescription: EDITED\n---\n`);
      await init(root2, { noLlm: true, force: true, home, ...DARWIN });
      expect(fs.readFileSync(target, 'utf-8')).toContain('EDITED');

      // …while this project's own re-init overwrites it only with --force.
      await init(root, { noLlm: true, force: true, home, ...DARWIN });
      expect(fs.readFileSync(target, 'utf-8')).not.toContain('EDITED');
    } finally {
      cleanTmp(root); cleanTmp(root2); cleanTmp(home);
    }
  }, TEST_TIMEOUT);

  it('retired-dir cleanup removes this project\'s retired canonicals in BOTH grammars (plain and hash6), never a foreign dir', async () => {
    const root = makeTmpDir('tasks-retired-proj');
    const home = makeTmpDir('tasks-retired-home');
    try {
      const base = path.join(home, '.claude', 'scheduled-tasks');
      // A retired standalone loop canonical in the old hash6 grammar…
      const hashDir = hashScopedTaskName(root, 'cortex-pulse-hygiene');
      // …and one in the plain grammar (unmarked → claimable as ours).
      const plainDir = scopedTaskName(root, 'cortex-loop-skill-suggest');
      // A same-slug plain retired dir marker-owned by ANOTHER project must survive.
      const foreignPlain = scopedTaskName(root, 'cortex-pulse-distil');
      for (const name of [hashDir, plainDir, foreignPlain]) {
        fs.mkdirSync(path.join(base, name), { recursive: true });
      }
      fs.writeFileSync(
        path.join(base, foreignPlain, 'SKILL.md'),
        `---\nname: ${foreignPlain}\n---\n\n<!-- cortex-project-root: /some/other/project -->\n\nbody\n`,
        'utf-8',
      );

      const result = await init(root, { noLlm: true, home, ...DARWIN });
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(path.join(base, hashDir))).toBe(false);
      expect(fs.existsSync(path.join(base, plainDir))).toBe(false);
      expect(fs.existsSync(path.join(base, foreignPlain))).toBe(true);
      expect(result.summary).toContain('Scheduled tasks retired');
      expect(result.summary).toContain('cortex-pulse-hygiene');
      expect(result.summary).toContain('cortex-loop-skill-suggest');
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 17 — the task→skill mapping table, pinned
// ---------------------------------------------------------------------------
describe('Rule 17: task→skill mapping owned by the task definitions', () => {
  /** The shipped mapping — one row per bundle: the union of every member
   *  loop's skills (plus cortex-extract-insight where a member extracts). */
  const EXPECTED_MAPPING: Record<string, string[]> = {
    'daily': [
      'cortex-pulse-hygiene',
      'cortex-loop-bug-triage',
      'specflow-bugs',
      'cortex-loop-spec-drift',
      'cortex-loop-insight-refresh-daily',
      'cortex-extract-insight',
      'cortex-loop-session-observe',
    ],
    'weekly-curation': ['cortex-pulse-distil', 'cortex-loop-rule-decay'],
    'weekly-quality': ['specflow-lint', 'specflow-tests', 'cortex-loop-insight-refresh-full', 'cortex-extract-insight'],
    'test-runner': ['cortex-loop-test-runner'],
    'monthly-review': ['cortex-loop-atlas-staleness', 'cortex-loop-onboarding-drift'],
  };

  /** Member loops per bundle, in the order the payload must run them. */
  const MEMBER_ORDER: Record<string, string[]> = {
    'daily': ['pulse-hygiene', 'bug-triage', 'spec-drift', 'insight-refresh-daily', 'session-observe'],
    'weekly-curation': ['pulse-distil', 'rule-decay'],
    'weekly-quality': ['specflow-lint', 'specflow-verify', 'insight-refresh-full'],
    'test-runner': ['test-runner'],
    'monthly-review': ['atlas-staleness', 'onboarding-drift'],
  };

  it('all bundles declare ≥1 required skill matching the design skill names', () => {
    expect(SCHEDULED_TASKS).toHaveLength(5); // v3.0 consolidation: fourteen standalones → five bundles
    expect(SCHEDULED_TASKS.map((t) => t.name).sort()).toEqual(Object.keys(EXPECTED_MAPPING).sort());
    for (const task of SCHEDULED_TASKS) {
      expect(task.requiredSkills.length, `${task.name} declares no required skill`).toBeGreaterThanOrEqual(1);
      expect(task.requiredSkills, task.name).toEqual(EXPECTED_MAPPING[task.name]);
    }
  });

  it('every bundle prompt body names each skill it declares (prompt/mapping consistency)', () => {
    for (const task of SCHEDULED_TASKS) {
      for (const skill of task.requiredSkills) {
        expect(task.body, `${task.name} body does not name ${skill}`).toContain(skill);
      }
    }
  });

  it('every bundle body invokes its member loops in the listed order, failure-isolates, and ends with one digest', () => {
    for (const task of SCHEDULED_TASKS) {
      const members = MEMBER_ORDER[task.name]!;
      // Members appear as numbered "**<member>**" steps, in order.
      let last = -1;
      members.forEach((member, i) => {
        const idx = task.body.indexOf(`${i + 1}. **${member}**`);
        expect(idx, `${task.name} body missing member step "${i + 1}. **${member}**"`).toBeGreaterThan(-1);
        expect(idx, `${task.name}: member ${member} out of order`).toBeGreaterThan(last);
        last = idx;
      });
      // Failure isolation: a failed member is reported, the run continues.
      expect(task.body, `${task.name} lacks failure isolation`).toContain('Failure isolation');
      expect(task.body, task.name).toMatch(/record the failure/i);
      // One digest, after the members.
      const digest = task.body.indexOf('**Digest (final step):**');
      expect(digest, `${task.name} lacks the digest step`).toBeGreaterThan(last);
      expect(task.body, task.name).toContain('ONE summary');
    }
  });

  it('every bundle pins its model: opus for weekly-curation, sonnet elsewhere', () => {
    for (const task of SCHEDULED_TASKS) {
      expect(task.model, task.name).toBe(task.name === 'weekly-curation' ? 'claude-opus-4-8' : 'claude-sonnet-5');
    }
  });
});

// ---------------------------------------------------------------------------
// Rule 15 — summary completeness
// ---------------------------------------------------------------------------
describe('Rule 15: summary names every change and the Desktop reminder', () => {
  it('summary covers insight pointer, skills, preferences, hooks, git hook, tasks, CLAUDE.md, migration, spec trees, reminder', async () => {
    const root = makeTmpDir('sum-proj');
    const home = makeTmpDir('sum-home');
    try {
      writeUndocumentedFiles(root, 2);
      const result = await init(root, { noLlm: true, home, ...DARWIN });
      const s = result.summary;
      // The v1/v2 anatomy scan + purpose pass lines are retired (step 7) —
      // one Insight pointer line replaces them.
      expect(s).not.toMatch(/Files indexed:/);
      expect(s).not.toMatch(/Purpose pass:/);
      expect(s).not.toMatch(/needs_purpose_refresh/);
      expect(s).toContain(
        'Insight: module scaffolded empty — run the cortex-extract-insight skill to build the understanding layer (init never runs it automatically).',
      );
      expect(s).toMatch(/Skills installed: \d+/);
      expect(s).toMatch(/Preferences drafted/);
      expect(s).toMatch(/Hooks registered/);
      expect(s).toMatch(/Git hook:/);
      expect(s).toMatch(/Scheduled tasks: 5 written/);
      expect(s).toMatch(/CLAUDE\.md: managed cortex block/);
      expect(s).toMatch(/Migration:/);
      expect(s).toMatch(/Spec trees:/);
      expect(s).toMatch(/Desktop app.*cadence/i);
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rules 13/15 — registration instruction block (B-009 final mechanism)
// ---------------------------------------------------------------------------
describe('Rules 13/15: register-in-Desktop instruction block vs all-registered one-liner', () => {
  it('registry missing (app never ran) → instruction block: 5 of 5, run cortex-register-tasks, verify', async () => {
    const root = makeTmpDir('regblock-proj');
    const home = makeTmpDir('regblock-home');
    const appSupportDir = makeTmpDir('regblock-appsupport'); // empty: no registry anywhere
    try {
      const result = await init(root, { noLlm: true, home, appSupportDir, ...DARWIN });
      expect(result.exitCode).toBe(0);
      const s = result.summary;
      expect(s).toContain('5 of 5 not yet registered with the Claude Desktop app');
      expect(s).toContain('open this folder in Claude Desktop (new session) and say:');
      expect(s).toContain('run cortex-register-tasks');
      expect(s).toContain('Then confirm with: cortex tasks verify');
      expect(s).not.toContain('all 5 registered');
      // The retired direct-write pointer is gone from the summary.
      expect(s).not.toContain('run `cortex tasks register`');
    } finally {
      cleanTmp(root); cleanTmp(home); cleanTmp(appSupportDir);
    }
  }, TEST_TIMEOUT);

  it('all five registered in the fixture registry → all-registered one-liner, no instruction block', async () => {
    const root = makeTmpDir('regok-proj');
    const home = makeTmpDir('regok-home');
    const appSupportDir = makeTmpDir('regok-appsupport');
    try {
      // Seed an app-created registry, then fully register via the fallback writer.
      const registryFile = path.join(appSupportDir, 'claude-code-sessions', 'u1', 'u2', 'scheduled-tasks.json');
      fs.mkdirSync(path.dirname(registryFile), { recursive: true });
      fs.writeFileSync(registryFile, JSON.stringify({ scheduledTasks: [], recordedSkips: {} }, null, 2) + '\n', 'utf-8');
      const { registerTasks } = await import('../../../src/cli/tasks-register.js');
      expect(registerTasks({ projectRoot: root, home, appSupportDir }).exitCode).toBe(0);

      const result = await init(root, { noLlm: true, home, appSupportDir, ...DARWIN });
      expect(result.exitCode).toBe(0);
      const s = result.summary;
      expect(s).toContain('Scheduled tasks: all 5 registered with the Claude Desktop app');
      expect(s).toContain('cortex tasks verify');
      expect(s).not.toContain('not yet registered');
      expect(s).not.toContain('run cortex-register-tasks');
    } finally {
      cleanTmp(root); cleanTmp(home); cleanTmp(appSupportDir);
    }
  }, TEST_TIMEOUT);
});
