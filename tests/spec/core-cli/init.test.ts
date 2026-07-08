/**
 * Spec tests for core-cli.init — one describe per Acceptance Criterion (18 ACs).
 * Every test runs in a fresh tmp project with an injected fake home dir;
 * the real ~/.claude is never touched.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { init } from '../../../src/cli/init.js';
import { validate } from '../../../src/schema/validate.js';
import {
  makeTmpDir,
  cleanTmp,
  gitInit,
  snapshotTree,
  recordingStub,
  authFailStub,
  hangingStub,
  midBatchStub,
  readFilesMdRows,
  writeUndocumentedFiles,
  seedProjectSkills,
} from '../../fixtures/init-harness.js';
import { SCHEDULED_TASKS } from '../../../src/cli/templates.js';
import { CANONICAL_TASK_NAMES, scopedTaskName, isOwnScopedTask } from '../../../src/cli/task-scoping.js';

const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const };

/**
 * Skill bundles shipped in the package's skills/ dir that a scheduled task's
 * prompt invokes (pulse.hygiene Rule 1; loops.* Rule 1 each; pulse.distil
 * Rule 1; loops.skill-suggest Rule 1; loops.bug-triage Rule 1;
 * anatomy.refresh-deep Rule 1; loops.test-runner Rule 10;
 * specflow.cortex-awareness Rule 3 — the eleven specflow bundles now ship
 * too, of which specflow-lint, specflow-tests, and specflow-bugs are
 * task-invoked). Rule 4 installs them into every project, so ALL twelve
 * tasks are always registrable under --partial.
 */
const PACKAGED_LOOP_SKILLS = [
  'cortex-extract-insight',
  'cortex-loop-anatomy-refresh',
  'cortex-loop-atlas-staleness',
  'cortex-loop-bug-triage',
  'cortex-loop-insight-refresh-daily',
  'cortex-loop-insight-refresh-full',
  'cortex-loop-onboarding-drift',
  'cortex-loop-rule-decay',
  'cortex-loop-skill-suggest',
  'cortex-loop-spec-drift',
  'cortex-loop-test-runner',
  'cortex-pulse-distil',
  'cortex-pulse-hygiene',
  'specflow-bugs',
  'specflow-lint',
  'specflow-tests',
];
const PACKAGED_LOOP_TASKS = [
  'anatomy-refresh-deep', 'atlas-staleness', 'bug-triage', 'distil', 'hygiene', 'insight-refresh-daily', 'insight-refresh-full', 'onboarding-drift', 'rule-decay', 'skill-suggest', 'spec-drift', 'specflow-lint', 'specflow-verify', 'test-runner',
];

// ---------------------------------------------------------------------------
// AC1: Fresh init on an empty project succeeds end-to-end
// ---------------------------------------------------------------------------
describe('AC1: fresh init on an empty project succeeds end-to-end', () => {
  let root: string;
  let home: string;
  let result: { exitCode: number; summary: string };

  beforeAll(async () => {
    root = makeTmpDir('ac1-proj');
    home = makeTmpDir('ac1-home');
    gitInit(root);
    result = await init(root, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('.cortex/ matches the schema §1 layout with an _index.md in every directory', () => {
    const dirs = [
      '', 'anatomy', 'compass', 'compass/bugs', 'compass/rules',
      'atlas', 'atlas/stakeholders', 'atlas/decisions', 'atlas/domain', 'atlas/sources',
      'pulse',
    ];
    for (const d of dirs) {
      const indexPath = path.join(root, '.cortex', d, '_index.md');
      expect(fs.existsSync(indexPath), `missing ${indexPath}`).toBe(true);
    }
    // anatomy artefacts written by the scanner
    expect(fs.existsSync(path.join(root, '.cortex', 'anatomy', 'files.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.cortex', 'anatomy', 'graph.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.cortex', 'anatomy', 'layers.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', 'dismissed.md'))).toBe(true);
  });

  it('cortex.config.json declares the current schemaVersion', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8'));
    expect(config.schemaVersion).toBe('3.0');
  });

  it('self-validation reports conformant and exit code is 0', async () => {
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain('Self-validation: conformant');
    const report = await validate(root, { root });
    expect(report.conformant).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC2: Existing .cortex/ refused without --force
// ---------------------------------------------------------------------------
describe('AC2: existing .cortex/ refused without --force', () => {
  let root: string;
  let home: string;
  beforeAll(() => {
    root = makeTmpDir('ac2-proj');
    home = makeTmpDir('ac2-home');
    fs.mkdirSync(path.join(root, '.cortex'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'cortex.config.json'), '{"schemaVersion":"1.0"}');
    fs.writeFileSync(path.join(root, 'app.ts'), 'export const a = 1;\n');
  });
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('exits 2 and no file in the project or fake home is created or modified', async () => {
    const projectBefore = snapshotTree(root);
    const homeBefore = snapshotTree(home);
    const result = await init(root, { home, ...DARWIN });
    expect(result.exitCode).toBe(2);
    expect(snapshotTree(root)).toEqual(projectBefore);
    expect(snapshotTree(home)).toEqual(homeBefore);
    expect(fs.readdirSync(home)).toEqual([]);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC3: Non-macOS platform refused
// ---------------------------------------------------------------------------
describe('AC3: non-macOS platform refused', () => {
  let root: string;
  let home: string;
  beforeAll(() => {
    root = makeTmpDir('ac3-proj');
    home = makeTmpDir('ac3-home');
    fs.writeFileSync(path.join(root, 'app.ts'), 'export const a = 1;\n');
  });
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('exits 2 with a message naming macOS, and nothing is written', async () => {
    const before = snapshotTree(root);
    const result = await init(root, { home, platform: 'linux' });
    expect(result.exitCode).toBe(2);
    expect(result.summary).toMatch(/macOS/);
    expect(snapshotTree(root)).toEqual(before);
    expect(fs.existsSync(path.join(root, '.cortex'))).toBe(false);
    expect(fs.readdirSync(home)).toEqual([]);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC4: Gitignore additions are exact and idempotent
// ---------------------------------------------------------------------------
describe('AC4: gitignore additions are exact and idempotent', () => {
  let root: string;
  let home: string;
  beforeAll(async () => {
    root = makeTmpDir('ac4-proj');
    home = makeTmpDir('ac4-home');
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.cortex/pulse/\n');
    await init(root, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('contains the four paths exactly once each and no bare .cortex/ line', () => {
    const lines = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8').split('\n').map((l) => l.trim());
    for (const wanted of ['.cortex/anatomy/', '.cortex/atlas/sources/', '.cortex/pulse/', '.cortex/constellation.json']) {
      expect(lines.filter((l) => l === wanted)).toHaveLength(1);
    }
    expect(lines).not.toContain('.cortex/');
    expect(lines).toContain('node_modules/');
  });
});

// ---------------------------------------------------------------------------
// AC5: CLAUDE.md content outside the managed block is preserved
// ---------------------------------------------------------------------------
describe('AC5: CLAUDE.md content outside the managed block is preserved across two runs', () => {
  let root: string;
  let home: string;
  const original = '# My Project\n\nSome intro text.\n\n## Commands\n\n- pnpm test\n- pnpm build\n';

  beforeAll(async () => {
    root = makeTmpDir('ac5-proj');
    home = makeTmpDir('ac5-home');
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), original);
    await init(root, { noLlm: true, home, ...DARWIN });
    await init(root, { noLlm: true, home, force: true, ...DARWIN }); // second run
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('contains exactly one cortex:start…cortex:end block', () => {
    const content = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
    expect(content.split('<!-- cortex:start').length - 1).toBe(1);
    expect(content.split('<!-- cortex:end -->').length - 1).toBe(1);
  });

  it('# My Project and ## Commands are byte-identical to before', () => {
    const content = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
    expect(content.startsWith(original)).toBe(true);
    expect(content).toContain('# My Project');
    expect(content).toContain('## Commands\n\n- pnpm test\n- pnpm build\n');
  });
});

// ---------------------------------------------------------------------------
// AC6: settings.json merge preserves unrelated keys
// ---------------------------------------------------------------------------
describe('AC6: settings.json merge preserves unrelated keys', () => {
  let root: string;
  let home: string;
  let result: { exitCode: number; summary: string };
  beforeAll(async () => {
    root = makeTmpDir('ac6-proj');
    home = makeTmpDir('ac6-home');
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.claude', 'settings.json'),
      JSON.stringify({ model: 'opus', hooks: { Stop: [{ matcher: '*' }] } }),
    );
    result = await init(root, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('cortex hook entries present; model and Stop hook unchanged', () => {
    const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.model).toBe('opus');
    expect(settings.hooks.Stop).toEqual([{ matcher: '*' }]);
    expect(JSON.stringify(settings.hooks.SessionStart)).toContain('cortex hook session-start');
    expect(JSON.stringify(settings.hooks.PreToolUse)).toContain('cortex hook pre-write');
    expect(JSON.stringify(settings.hooks.PostToolUse)).toContain('cortex hook post-write');
  });

  it('check.hook-config passes', async () => {
    expect(result.exitCode).toBe(0);
    const report = await validate(root, { root });
    expect(report.violations.filter((v) => v.check === 'check.hook-config')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC7: Purpose pass skipped cleanly when claude is unavailable
// ---------------------------------------------------------------------------
describe('AC7: purpose pass skipped cleanly when claude is unavailable', () => {
  let root: string;
  let home: string;
  let result: { exitCode: number; summary: string };
  beforeAll(async () => {
    root = makeTmpDir('ac7-proj');
    home = makeTmpDir('ac7-home');
    writeUndocumentedFiles(root, 3);
    result = await init(root, {
      home,
      ...DARWIN,
      claudeBin: '/nonexistent/definitely-not-claude',
      timeoutMs: 5_000,
    });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('still exits 0', () => {
    expect(result.exitCode).toBe(0);
  });

  it('affected files.md rows keep needs_purpose_refresh: true', () => {
    const rows = readFilesMdRows(root);
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.flagged)).toBe(true);
  });

  it('summary states the pass was skipped and the scheduled refresh will handle it', () => {
    expect(result.summary).toMatch(/Purpose pass: skipped/);
    expect(result.summary).toMatch(/scheduled anatomy deep-refresh/);
  });
});

// ---------------------------------------------------------------------------
// AC8: Inline purpose pass invoked as a subprocess when available
// ---------------------------------------------------------------------------
describe('AC8: inline purpose pass invoked as a subprocess when available', () => {
  let root: string;
  let home: string;
  let binDir: string;
  let recordFile: string;
  let result: { exitCode: number; summary: string };
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    root = makeTmpDir('ac8-proj');
    home = makeTmpDir('ac8-home');
    binDir = makeTmpDir('ac8-bin');
    recordFile = path.join(binDir, 'record.txt');
    const stub = recordingStub(binDir, recordFile);
    fetchSpy = vi.spyOn(globalThis, 'fetch' as never);
    writeUndocumentedFiles(root, 2);
    result = await init(root, { home, ...DARWIN, claudeBin: stub, timeoutMs: 20_000 });
  }, TEST_TIMEOUT);
  afterAll(() => {
    fetchSpy.mockRestore();
    cleanTmp(root); cleanTmp(home); cleanTmp(binDir);
  });

  it('the stub was invoked exactly once with a prompt naming the anatomy deep-refresh Skill', () => {
    const record = fs.readFileSync(recordFile, 'utf-8');
    expect(record.split('\n').filter((l) => l === 'INVOKED')).toHaveLength(1);
    expect(record).toContain('ARG:-p');
    expect(record).toContain('cortex-loop-anatomy-refresh');
    expect(record).toMatch(/deep-refresh Skill/);
  });

  it('rewritten purposes are picked up and init exits 0', () => {
    expect(result.exitCode).toBe(0);
    const rows = readFilesMdRows(root);
    expect(rows.every((r) => !r.flagged)).toBe(true);
    expect(result.summary).toMatch(/2 purpose\(s\) filled/);
  });

  it("init's own process opened no network connections (fetch never called)", () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC9: Auth failure — named specifically, exit 3, everything else complete
// ---------------------------------------------------------------------------
describe('AC9: auth failure named specifically, exit 3, everything else complete', () => {
  let root: string;
  let home: string;
  let binDir: string;
  let result: { exitCode: number; summary: string };
  beforeAll(async () => {
    root = makeTmpDir('ac9-proj');
    home = makeTmpDir('ac9-home');
    binDir = makeTmpDir('ac9-bin');
    const stub = authFailStub(binDir);
    writeUndocumentedFiles(root, 2);
    result = await init(root, { home, ...DARWIN, claudeBin: stub, timeoutMs: 20_000 });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); cleanTmp(binDir); });

  it('does not hang, completes every remaining step, and exits 3', () => {
    expect(result.exitCode).toBe(3);
    // hooks
    expect(fs.existsSync(path.join(root, '.claude', 'settings.json'))).toBe(true);
    // scheduled tasks
    expect(fs.readdirSync(path.join(home, '.claude', 'scheduled-tasks'))).toHaveLength(14);
    // CLAUDE.md managed block
    expect(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8')).toContain('<!-- cortex:start');
    // self-validation ran and was conformant (otherwise exit would be 1)
    expect(result.summary).toContain('Self-validation: conformant');
  });

  it('summary names authentication specifically and tells the user how to recover', () => {
    expect(result.summary).toMatch(/authentication/i);
    expect(result.summary).toMatch(/log ?in/i);
    expect(result.summary).toMatch(/deep-refresh|re-run/i);
  });

  it("every undocumented file's row still has needs_purpose_refresh: true", () => {
    const rows = readFilesMdRows(root);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.flagged)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC10: Subprocess timeout or mid-batch error degrades gracefully
// ---------------------------------------------------------------------------
describe('AC10: subprocess timeout degrades gracefully', () => {
  let root: string;
  let home: string;
  let binDir: string;
  let result: { exitCode: number; summary: string };
  beforeAll(async () => {
    root = makeTmpDir('ac10a-proj');
    home = makeTmpDir('ac10a-home');
    binDir = makeTmpDir('ac10a-bin');
    const stub = hangingStub(binDir);
    writeUndocumentedFiles(root, 2);
    result = await init(root, { home, ...DARWIN, claudeBin: stub, timeoutMs: 500 });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); cleanTmp(binDir); });

  it('exits 0, keeps flags, and the summary carries the incomplete-pass notice', () => {
    expect(result.exitCode).toBe(0);
    const rows = readFilesMdRows(root);
    expect(rows.every((r) => r.flagged)).toBe(true);
    expect(result.summary).toMatch(/did not complete/);
    expect(result.summary).toMatch(/scheduled anatomy deep-refresh will finish/);
  });
});

describe('AC10: mid-batch error degrades gracefully, keeping rewritten rows', () => {
  let root: string;
  let home: string;
  let binDir: string;
  let result: { exitCode: number; summary: string };
  beforeAll(async () => {
    root = makeTmpDir('ac10b-proj');
    home = makeTmpDir('ac10b-home');
    binDir = makeTmpDir('ac10b-bin');
    const stub = midBatchStub(binDir, path.join(binDir, 'record.txt'));
    writeUndocumentedFiles(root, 3);
    result = await init(root, { home, ...DARWIN, claudeBin: stub, timeoutMs: 20_000 });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); cleanTmp(binDir); });

  it('exits 0; unconfirmed rows stay flagged; rewritten row keeps its new purpose', () => {
    expect(result.exitCode).toBe(0);
    const rows = readFilesMdRows(root);
    expect(rows).toHaveLength(3);
    const rewritten = rows.filter((r) => !r.flagged);
    const stillFlagged = rows.filter((r) => r.flagged);
    expect(rewritten).toHaveLength(1);
    expect(rewritten[0]!.purpose).toBe('Filled by stub.');
    expect(stillFlagged).toHaveLength(2);
    expect(result.summary).toMatch(/did not complete/);
    expect(result.summary).toMatch(/scheduled anatomy deep-refresh/);
  });
});

// ---------------------------------------------------------------------------
// AC11: --no-llm is a success state with a visible flagged count
// ---------------------------------------------------------------------------
describe('AC11: --no-llm is a success state with a visible flagged count', () => {
  let root: string;
  let home: string;
  let result: { exitCode: number; summary: string };
  beforeAll(async () => {
    root = makeTmpDir('ac11-proj');
    home = makeTmpDir('ac11-home');
    writeUndocumentedFiles(root, 5);
    result = await init(root, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('exits 0 with no error-styled output about the LLM', () => {
    expect(result.exitCode).toBe(0);
    expect(result.summary).not.toMatch(/error/i);
    expect(result.summary).not.toMatch(/fail/i);
  });

  it('summary states 5 files flagged and that the scheduled refresh or a re-run will fill them', () => {
    expect(result.summary).toMatch(/5 file\(s\) flagged needs_purpose_refresh/);
    expect(result.summary).toMatch(/scheduled anatomy deep-refresh/);
    expect(result.summary).toMatch(/re-run after authentication/);
  });
});

// ---------------------------------------------------------------------------
// AC12: Legacy bugs.md migrated with deprecation marker
// ---------------------------------------------------------------------------
describe('AC12: legacy bugs.md migrated with deprecation marker', () => {
  let root: string;
  let home: string;
  beforeAll(async () => {
    root = makeTmpDir('ac12-proj');
    home = makeTmpDir('ac12-home');
    fs.writeFileSync(
      path.join(root, 'bugs.md'),
      `# Bugs

## Login button crashes on Safari

severity: high

Clicking login on Safari 17 throws a TypeError.

## Wrong total in cart

The cart total is off by one cent when discounts stack.
`,
    );
    await init(root, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('creates B-001-*.md and B-002-*.md conforming to schema §4.3', () => {
    const bugsDir = path.join(root, '.cortex', 'compass', 'bugs');
    const files = fs.readdirSync(bugsDir).filter((f) => /^B-\d{3}-/.test(f)).sort();
    expect(files).toHaveLength(2);
    expect(files[0]).toMatch(/^B-001-login-button-crashes-on-safari\.md$/);
    expect(files[1]).toMatch(/^B-002-wrong-total-in-cart\.md$/);

    const first = matter(fs.readFileSync(path.join(bugsDir, files[0]!), 'utf-8')).data;
    expect(first['id']).toBe('B-001');
    expect(first['title']).toBe('Login button crashes on Safari');
    expect(first['severity']).toBe('high'); // stated in the legacy entry
    expect(first['status']).toBe('open');
    expect(Array.isArray(first['affects'])).toBe(true);

    const second = matter(fs.readFileSync(path.join(bugsDir, files[1]!), 'utf-8')).data;
    expect(second['id']).toBe('B-002');
    expect(second['type']).toBe('missing-dev-spec'); // sensible default
    expect(second['severity']).toBe('medium'); // sensible default
    expect(second['status']).toBe('open');
  });

  it('root bugs.md now contains only a deprecation marker pointing at the new location', () => {
    const content = fs.readFileSync(path.join(root, 'bugs.md'), 'utf-8');
    expect(content).toContain('DEPRECATED');
    expect(content).toContain('.cortex/compass/bugs/');
    expect(content).not.toContain('Login button crashes');
  });
});

// ---------------------------------------------------------------------------
// AC13: Spec trees scaffolded only when absent, onboarding recommended not run
// ---------------------------------------------------------------------------
describe('AC13: spec trees scaffolded only when absent', () => {
  let root: string;
  let home: string;
  let result: { exitCode: number; summary: string };
  beforeAll(async () => {
    root = makeTmpDir('ac13a-proj');
    home = makeTmpDir('ac13a-home');
    result = await init(root, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('.specflow/specs/_index.md, .specflow/specs/_overview.md, and .specflow/specs-business/_overview.md exist as skeletons', () => {
    expect(fs.existsSync(path.join(root, '.specflow', 'specs', '_index.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.specflow', 'specs', '_overview.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.specflow', 'specs-business', '_overview.md'))).toBe(true);
  });

  it('summary recommends specflow-onboard-codebase (and init did not run it)', () => {
    expect(result.summary).toContain('specflow-onboard-codebase');
    expect(result.exitCode).toBe(0);
  });
});

describe('AC13: existing .specflow/specs/ content is byte-identical after init', () => {
  let root: string;
  let home: string;
  const indexContent = `# My specs\n\nRead this when: always.\n\n## Domains\n\n- core\n\n## Dependency Graph\n\n(none)\n\n## Build Order\n\n(none)\n\ncustom trailing line\n`;
  const notesContent = '# Notes\n\nHand-written content that must survive.\n';
  beforeAll(async () => {
    root = makeTmpDir('ac13b-proj');
    home = makeTmpDir('ac13b-home');
    fs.mkdirSync(path.join(root, '.specflow', 'specs'), { recursive: true });
    fs.writeFileSync(path.join(root, '.specflow', 'specs', '_index.md'), indexContent);
    fs.writeFileSync(path.join(root, '.specflow', 'specs', 'notes.md'), notesContent);
    await init(root, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('existing .specflow/specs/ files are byte-identical and no skeleton was overlaid', () => {
    expect(fs.readFileSync(path.join(root, '.specflow', 'specs', '_index.md'), 'utf-8')).toBe(indexContent);
    expect(fs.readFileSync(path.join(root, '.specflow', 'specs', 'notes.md'), 'utf-8')).toBe(notesContent);
    expect(fs.existsSync(path.join(root, '.specflow', 'specs', '_overview.md'))).toBe(false); // tree untouched
  });
});

// ---------------------------------------------------------------------------
// AC14: Twelve scheduled task definitions written
// ---------------------------------------------------------------------------
describe('AC14: twelve scheduled task definitions written to the stubbed home', () => {
  let root: string;
  let home: string;
  beforeAll(async () => {
    root = makeTmpDir('ac14-proj');
    home = makeTmpDir('ac14-home');
    await init(root, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it("~/.claude/scheduled-tasks contains every dir under this project's scoped names (§9.1), each with scoped name + description frontmatter", () => {
    const base = path.join(home, '.claude', 'scheduled-tasks');
    const dirs = fs.readdirSync(base);
    expect(dirs).toHaveLength(14);
    const expected = SCHEDULED_TASKS
      .map((t) => scopedTaskName(root, CANONICAL_TASK_NAMES[t.name]!))
      .sort();
    expect(dirs.sort()).toEqual(expected);
    for (const dir of dirs) {
      expect(isOwnScopedTask(root, dir), dir).toBe(true);
      const skillPath = path.join(base, dir, 'SKILL.md');
      expect(fs.existsSync(skillPath), `missing ${skillPath}`).toBe(true);
      const data = matter(fs.readFileSync(skillPath, 'utf-8')).data;
      expect(data['name']).toBe(dir); // frontmatter name: = the scoped registration identity
      expect(typeof data['description']).toBe('string');
      expect((data['description'] as string).length).toBeGreaterThan(0);
    }
  });

  it('re-running without --force leaves user-modified task files untouched', async () => {
    const scopedHygiene = scopedTaskName(root, CANONICAL_TASK_NAMES['hygiene']!);
    const hygienePath = path.join(home, '.claude', 'scheduled-tasks', scopedHygiene, 'SKILL.md');
    const userEdit = `---\nname: ${scopedHygiene}\ndescription: USER EDITED\n---\n\nmy custom prompt\n`;
    fs.writeFileSync(hygienePath, userEdit);
    // Same project re-run (fresh .cortex/ so preflight admits it), same home, no --force:
    // the existing scoped task files are recognised as this project's and preserved.
    fs.rmSync(path.join(root, '.cortex'), { recursive: true, force: true });
    const result = await init(root, { noLlm: true, home, ...DARWIN });
    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(hygienePath, 'utf-8')).toBe(userEdit);
    expect(result.summary).toMatch(/12 existing preserved|preserved/);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC15: --partial with no extra loop skills → only the packaged loop tasks register
// (Rule 4 installs the shipped loop bundles, so their tasks are always
// registrable — pulse.hygiene Rule 1, loops.* Rule 1. Since
// specflow.cortex-awareness Rule 3 the packaged set covers ALL fourteen tasks,
// so nothing is ever skipped for a missing packaged skill.)
// ---------------------------------------------------------------------------
describe('AC15: --partial with no extra loop skills → only the packaged loop tasks register', () => {
  let root: string;
  let home: string;
  let result: { exitCode: number; summary: string };
  beforeAll(async () => {
    root = makeTmpDir('ac15p-proj');
    home = makeTmpDir('ac15p-home');
    // .claude/skills/ contains no task-invoked skill beyond what Rule 4 installs.
    seedProjectSkills(root, ['some-unrelated-skill']);
    result = await init(root, { partial: true, noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('~/.claude/scheduled-tasks gains exactly the fourteen packaged loop tasks (scoped names, §9.1) and exit code is 0', () => {
    expect(result.exitCode).toBe(0);
    const base = path.join(home, '.claude', 'scheduled-tasks');
    const expected = PACKAGED_LOOP_TASKS
      .map((t) => scopedTaskName(root, CANONICAL_TASK_NAMES[t]!))
      .sort();
    expect(fs.readdirSync(base).sort()).toEqual(expected);
  });

  it('.cortex/ skeleton, anatomy, hooks, and CLAUDE.md block are all complete', () => {
    expect(fs.existsSync(path.join(root, '.cortex', 'cortex.config.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.cortex', '_index.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.cortex', 'anatomy', 'files.md'))).toBe(true);
    const settings = fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf-8');
    expect(settings).toContain('cortex hook session-start');
    const claudeMd = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('<!-- cortex:start');
    expect(claudeMd).toContain('<!-- cortex:end -->');
  });

  it('summary states "14 loops registered" and skips nothing — the packaged skills cover every task', () => {
    expect(result.summary).toContain('14 loops registered');
    const skippedTasks = SCHEDULED_TASKS.filter(
      (t) => !t.requiredSkills.every((s) => PACKAGED_LOOP_SKILLS.includes(s)),
    );
    expect(skippedTasks).toHaveLength(0);
    expect(result.summary).not.toContain('Skipped task');
  });
});

// ---------------------------------------------------------------------------
// AC16: --partial with some skills pre-seeded → same full set, nothing skipped
// (Since specflow.cortex-awareness Rule 3 the packaged bundles cover every
// task-invoked skill, so pre-seeded user skills can no longer change which
// tasks register — the skip path is exercised only if a packaged bundle is
// removed after install, which init itself never does.)
// ---------------------------------------------------------------------------
describe('AC16: --partial with some skills pre-seeded → same full set, nothing skipped', () => {
  let root: string;
  let home: string;
  let result: { exitCode: number; summary: string };
  beforeAll(async () => {
    root = makeTmpDir('ac16-proj');
    home = makeTmpDir('ac16-home');
    // specflow-lint and specflow-tests pre-seeded; Rule 4 installs the rest anyway.
    seedProjectSkills(root, ['specflow-lint', 'specflow-tests']);
    result = await init(root, { partial: true, noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('all fourteen tasks are written under scoped names (seeded pair adds nothing beyond the packaged set)', () => {
    expect(result.exitCode).toBe(0);
    const base = path.join(home, '.claude', 'scheduled-tasks');
    const expected = PACKAGED_LOOP_TASKS
      .map((t) => scopedTaskName(root, CANONICAL_TASK_NAMES[t]!))
      .sort();
    expect(fs.readdirSync(base).sort()).toEqual(expected);
    expect(fs.existsSync(path.join(base, scopedTaskName(root, 'specflow-lint'), 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(base, scopedTaskName(root, 'specflow-verify'), 'SKILL.md'))).toBe(true);
    expect(result.summary).toContain('14 loops registered');
  });

  it('no task is skipped — every required skill is packaged', () => {
    const present = ['specflow-lint', 'specflow-tests', ...PACKAGED_LOOP_SKILLS];
    const skippedTasks = SCHEDULED_TASKS.filter(
      (t) => !t.requiredSkills.every((s) => present.includes(s)),
    );
    expect(skippedTasks).toHaveLength(0);
    expect(result.summary).not.toContain('Skipped task');
  });
});

// ---------------------------------------------------------------------------
// AC17: Default mode → all twelve written, no lacking-skill warning
// (The Rule 17 warning path survives in the code for the removed-bundle edge
// case, but a fresh init can no longer produce it: specflow.cortex-awareness
// Rule 3 packages every task-invoked skill.)
// ---------------------------------------------------------------------------
describe('AC17: default mode → all twelve written, no lacking-skill warning', () => {
  let root: string;
  let home: string;
  let result: { exitCode: number; summary: string };
  beforeAll(async () => {
    root = makeTmpDir('ac17-proj');
    home = makeTmpDir('ac17-home');
    // Same project shape as AC16, but without --partial.
    seedProjectSkills(root, ['specflow-lint', 'specflow-tests']);
    result = await init(root, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('all task directories are written', () => {
    expect(result.exitCode).toBe(0);
    const base = path.join(home, '.claude', 'scheduled-tasks');
    expect(fs.readdirSync(base)).toHaveLength(14);
    expect(result.summary).toMatch(/Scheduled tasks: 14 written/);
  });

  it('summary carries no lacking-skill warning — every registered task has its packaged skill', () => {
    const present = ['specflow-lint', 'specflow-tests', ...PACKAGED_LOOP_SKILLS];
    const lackingTasks = SCHEDULED_TASKS.filter(
      (t) => !t.requiredSkills.every((s) => present.includes(s)),
    );
    expect(lackingTasks).toHaveLength(0);
    const warning = result.summary.split('\n').find((l) => l.startsWith('Warning:'));
    expect(warning).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AC18: Git hook appended, not clobbered
// ---------------------------------------------------------------------------
describe('AC18: git hook appended, not clobbered', () => {
  let root: string;
  let home: string;
  beforeAll(async () => {
    root = makeTmpDir('ac18-proj');
    home = makeTmpDir('ac18-home');
    gitInit(root);
    fs.mkdirSync(path.join(root, '.git', 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(root, '.git', 'hooks', 'post-commit'), '#!/bin/sh\necho existing\n');
    await init(root, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('hook still contains echo existing, followed by anatomy-refresh-fast, and is executable', () => {
    const hookPath = path.join(root, '.git', 'hooks', 'post-commit');
    const content = fs.readFileSync(hookPath, 'utf-8');
    expect(content).toContain('echo existing');
    expect(content).toContain('cortex anatomy-refresh-fast');
    expect(content.indexOf('echo existing')).toBeLessThan(content.indexOf('cortex anatomy-refresh-fast'));
    expect(fs.statSync(hookPath).mode & 0o111).toBeGreaterThan(0);
  });
});
