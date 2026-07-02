/**
 * Atomic tests for core-cli.init — granular behaviours behind the ACs:
 * exit-code precedence, settings deep-merge details, the exact twelve task
 * names, gitignore exactness, config defaults, index shapes, preferences,
 * idempotency and no-silent-destruction (Rule 16).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { init } from '../../../src/cli/init.js';
import { SCHEDULED_TASKS } from '../../../src/cli/templates.js';
import {
  makeTmpDir,
  cleanTmp,
  authFailStub,
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
// Exit-code precedence: self-validation failure (1) wins over auth failure (3)
// ---------------------------------------------------------------------------
describe('exit-code precedence: validation failure wins over auth failure', () => {
  let root: string;
  let home: string;
  let binDir: string;
  beforeAll(() => {
    root = makeTmpDir('prec-proj');
    home = makeTmpDir('prec-home');
    binDir = makeTmpDir('prec-bin');
    // A pre-existing specs/ tree that init must not touch (Rule 8) and that
    // fails check.specs-index → self-validation error.
    fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'specs', '_index.md'), 'broken index with no required sections\n');
    writeUndocumentedFiles(root, 1);
  });
  afterAll(() => { cleanTmp(root); cleanTmp(home); cleanTmp(binDir); });

  it('auth failure + validation errors → exit 1, violations printed, auth still named', async () => {
    const stub = authFailStub(binDir);
    const result = await init(root, { home, ...DARWIN, claudeBin: stub, timeoutMs: 20_000 });
    expect(result.exitCode).toBe(1); // validation failure wins over auth's 3
    expect(result.summary).toContain('Self-validation: FAILED');
    expect(result.summary).toContain('check.specs-index');
    expect(result.summary).toMatch(/authentication/i); // the auth notice still lands in the summary
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 2 — gitignore exactness
// ---------------------------------------------------------------------------
describe('Rule 2: gitignore', () => {
  it('creates .gitignore with exactly the four paths and never a bare .cortex/', async () => {
    const root = makeTmpDir('gi-proj');
    const home = makeTmpDir('gi-home');
    try {
      await init(root, { noLlm: true, home, ...DARWIN });
      const lines = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8').split('\n').filter((l) => l.trim() !== '');
      expect(lines.sort()).toEqual(
        ['.cortex/anatomy/', '.cortex/atlas/sources/', '.cortex/pulse/', '.cortex/constellation.json'].sort(),
      );
      expect(lines).not.toContain('.cortex/');
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
      for (const wanted of ['.cortex/anatomy/', '.cortex/atlas/sources/', '.cortex/pulse/', '.cortex/constellation.json']) {
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

  it('cortex.config.json carries the exact §10.1 defaults', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8'));
    expect(config).toEqual({
      schemaVersion: '1.0',
      anatomy: { exclude: ['dist/**', 'node_modules/**'], enhancement: 'none' },
      hooks: { preRead: false },
      pulse: { distilThresholdN: 3, dismissedWindowDays: 90, hygieneFreshnessHours: 48 },
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
    expect(indexes.length).toBe(11); // root + anatomy + cerebrum(+bugs,rules) + atlas(+3 subdirs,sources) + pulse
    for (const idx of indexes) {
      const content = fs.readFileSync(idx, 'utf-8');
      expect(content, idx).toContain('Read this when:');
      expect(content, idx).toContain("What's here:");
      expect(content, idx).toContain('How to navigate:');
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

  it('scaffolded specs/_index.md has the §7.2 sections', () => {
    const content = fs.readFileSync(path.join(root, 'specs', '_index.md'), 'utf-8');
    for (const section of ['Read this when:', '## Domains', '## Dependency Graph', '## Build Order']) {
      expect(content).toContain(section);
    }
  });

  it('scaffolded _overview.md files have the §7.3 headings', () => {
    for (const p of [path.join(root, 'specs', '_overview.md'), path.join(root, 'specs-business', '_overview.md')]) {
      const content = fs.readFileSync(p, 'utf-8');
      expect(content).toContain('## What this is');
      expect(content).toContain('## What it covers');
      expect(content).toContain("## Why it's grouped this way");
    }
  });

  it('CLAUDE.md was created with the v-versioned managed block', () => {
    const content = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('<!-- cortex:start v1.0 -->');
    expect(content).toContain('<!-- cortex:end -->');
    expect(content).toContain('Modules present: anatomy, cerebrum, atlas, pulse. Schema: 1.0.');
  });
});

// ---------------------------------------------------------------------------
// Rule 6 — purpose pass is skipped when nothing is flagged
// ---------------------------------------------------------------------------
describe('Rule 6: no subprocess when nothing is flagged', () => {
  it('the claude stub is never invoked on a project with zero flagged files', async () => {
    const root = makeTmpDir('noflag-proj');
    const home = makeTmpDir('noflag-home');
    const binDir = makeTmpDir('noflag-bin');
    try {
      const recordFile = path.join(binDir, 'record.txt');
      const stub = recordingStub(binDir, recordFile);
      // empty project → nothing scanned → nothing flagged
      const result = await init(root, { home, ...DARWIN, claudeBin: stub, timeoutMs: 20_000 });
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(recordFile)).toBe(false);
      expect(result.summary).toContain('nothing to do');
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
      const content = fs.readFileSync(path.join(root, '.cortex', 'cerebrum', 'preferences.md'), 'utf-8');
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
      expect(fs.existsSync(path.join(root, '.cortex', 'cerebrum', 'preferences.md'))).toBe(true);
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);

  it('an existing preferences.md is never overwritten, even with --force (Rule 16)', async () => {
    const root = makeTmpDir('prefs3-proj');
    const home = makeTmpDir('prefs3-home');
    try {
      await init(root, { noLlm: true, home, ...DARWIN });
      const prefsPath = path.join(root, '.cortex', 'cerebrum', 'preferences.md');
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
      // preRead is false by default → no pre-read hook entry
      expect(JSON.stringify(merged.hooks)).not.toContain('cortex hook pre-read');
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
// Rule 13 — the twelve task names, exactly
// ---------------------------------------------------------------------------
describe('Rule 13: the twelve scheduled task names are exactly the design set', () => {
  it('writes exactly the twelve named tasks and overwrites only with --force', async () => {
    const root = makeTmpDir('tasks-proj');
    const root2 = makeTmpDir('tasks-proj2');
    const home = makeTmpDir('tasks-home');
    try {
      await init(root, { noLlm: true, home, ...DARWIN });
      const base = path.join(home, '.claude', 'scheduled-tasks');
      const expected = [
        'anatomy-refresh-deep', 'atlas-staleness', 'bug-triage', 'distil', 'hygiene',
        'onboarding-drift', 'rule-decay', 'skill-suggest', 'spec-drift',
        'specflow-lint', 'specflow-verify', 'test-runner',
      ];
      expect(fs.readdirSync(base).sort()).toEqual(expected);

      // user-modified file is overwritten only with --force
      const target = path.join(base, 'distil', 'SKILL.md');
      fs.writeFileSync(target, '---\nname: distil\ndescription: EDITED\n---\n');
      await init(root2, { noLlm: true, force: true, home, ...DARWIN });
      expect(fs.readFileSync(target, 'utf-8')).not.toContain('EDITED');
    } finally {
      cleanTmp(root); cleanTmp(root2); cleanTmp(home);
    }
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 17 — the task→skill mapping table, pinned
// ---------------------------------------------------------------------------
describe('Rule 17: task→skill mapping owned by the task definitions', () => {
  /** The shipped mapping — design §11 loop skill names, one row per task. */
  const EXPECTED_MAPPING: Record<string, string[]> = {
    'hygiene': ['cortex-pulse-hygiene'],
    'distil': ['cortex-pulse-distil'],
    'skill-suggest': ['cortex-loop-skill-suggest'],
    'anatomy-refresh-deep': ['cortex-loop-anatomy-refresh'],
    'rule-decay': ['cortex-loop-rule-decay'],
    'atlas-staleness': ['cortex-loop-atlas-staleness'],
    'onboarding-drift': ['cortex-loop-onboarding-drift'],
    'spec-drift': ['cortex-loop-spec-drift'],
    'specflow-lint': ['specflow-lint'],
    'specflow-verify': ['specflow-tests'],
    'test-runner': ['cortex-loop-test-runner'],
    'bug-triage': ['specflow-bugs'],
  };

  it('all twelve tasks declare ≥1 required skill matching the design skill names', () => {
    expect(SCHEDULED_TASKS).toHaveLength(12);
    expect(SCHEDULED_TASKS.map((t) => t.name).sort()).toEqual(Object.keys(EXPECTED_MAPPING).sort());
    for (const task of SCHEDULED_TASKS) {
      expect(task.requiredSkills.length, `${task.name} declares no required skill`).toBeGreaterThanOrEqual(1);
      expect(task.requiredSkills, task.name).toEqual(EXPECTED_MAPPING[task.name]);
    }
  });

  it('every task prompt body names each skill it declares (prompt/mapping consistency)', () => {
    for (const task of SCHEDULED_TASKS) {
      for (const skill of task.requiredSkills) {
        expect(task.body, `${task.name} body does not name ${skill}`).toContain(skill);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Rule 15 — summary completeness
// ---------------------------------------------------------------------------
describe('Rule 15: summary names every change and the Desktop reminder', () => {
  it('summary covers indexing, skills, preferences, hooks, git hook, tasks, CLAUDE.md, migration, spec trees, reminder', async () => {
    const root = makeTmpDir('sum-proj');
    const home = makeTmpDir('sum-home');
    try {
      writeUndocumentedFiles(root, 2);
      const result = await init(root, { noLlm: true, home, ...DARWIN });
      const s = result.summary;
      expect(s).toMatch(/Files indexed: 2/);
      expect(s).toMatch(/flagged needs_purpose_refresh/);
      expect(s).toMatch(/Skills installed: \d+/);
      expect(s).toMatch(/Preferences drafted/);
      expect(s).toMatch(/Hooks registered/);
      expect(s).toMatch(/Git hook:/);
      expect(s).toMatch(/Scheduled tasks: 12 written/);
      expect(s).toMatch(/CLAUDE\.md: managed cortex block/);
      expect(s).toMatch(/Migration:/);
      expect(s).toMatch(/Spec trees:/);
      expect(s).toMatch(/Desktop app.*cadence/i);
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);
});
