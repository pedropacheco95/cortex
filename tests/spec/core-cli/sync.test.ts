/**
 * Spec tests for core-cli.sync — one describe per Acceptance Criterion.
 * Every test bootstraps a fresh tmp project via `cortex init` first (sync's
 * precondition is an EXISTING `.cortex/`), then manipulates specific pieces
 * before invoking `sync` — the real ~/.claude is never touched (injected
 * fake home throughout).
 *
 * Two ACs need a stand-in for "the installed package now ships a changed
 * version" (skill bundles / task payloads / a template version bump) since
 * this repo has shipped exactly one schema/template generation so far: each
 * test fabricates a plausible "as installed" prior state (content + marker)
 * distinct from what's actually shipped today, so sync's real marker-judged
 * upgrade path runs against real shipped content. See the inline comments at
 * each site.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { init } from '../../../src/cli/init.js';
import { sync } from '../../../src/cli/sync.js';
import { validate } from '../../../src/schema/validate.js';
import { hashDirectoryContent, writeInstalledMarker, sha256Hex, INSTALLED_MARKER_FILENAME } from '../../../src/cli/scaffold.js';
import { SCHEDULED_TASKS, scheduledTaskSkillMd, SCHEMA_VERSION } from '../../../src/cli/templates.js';
import { CANONICAL_TASK_NAMES, scopedTaskName } from '../../../src/cli/task-scoping.js';
import { makeTmpDir, cleanTmp, gitInit, snapshotTree } from '../../fixtures/init-harness.js';

const TEST_TIMEOUT = 60_000;
const DARWIN_INIT = { platform: 'darwin' as const, noLlm: true };
const DARWIN_SYNC = { platform: 'darwin' as const };

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Bootstrap a fresh project already under Cortex management (sync's precondition). */
async function bootstrap(label: string): Promise<{ root: string; home: string }> {
  const root = makeTmpDir(`sync-${label}-proj`);
  const home = makeTmpDir(`sync-${label}-home`);
  gitInit(root);
  await init(root, { home, ...DARWIN_INIT });
  return { root, home };
}

function configPath(root: string): string {
  return path.join(root, '.cortex', 'cortex.config.json');
}

function readConfig(root: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(configPath(root), 'utf-8'));
}

function writeConfig(root: string, config: Record<string, unknown>): void {
  fs.writeFileSync(configPath(root), JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/** Snapshot the five knowledge-content trees only (schema §4-owned, AC8). */
function knowledgeSnapshot(root: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const dir of ['compass', 'atlas', 'archive', 'insight', 'pulse']) {
    const full = path.join(root, '.cortex', dir);
    for (const [rel, content] of snapshotTree(full)) out.set(path.join(dir, rel), content);
  }
  return out;
}

// ---------------------------------------------------------------------------
// AC1: Missing CLAUDE.md block is repaired, rest of the file untouched
// ---------------------------------------------------------------------------
describe('AC1: missing CLAUDE.md block is repaired, rest of the file untouched', () => {
  let root: string;
  let home: string;
  const preamble = '# My Project\n\nSome intro text.\n\n## Commands\n\n- pnpm test\n- pnpm build\n';
  let result: { exitCode: number; summary: string };

  beforeAll(async () => {
    ({ root, home } = await bootstrap('ac1'));
    // Simulate a CLAUDE.md whose managed block was stripped (or never present)
    // after init already ran — sync's repair scenario.
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), preamble);
    result = await sync(root, { home, ...DARWIN_SYNC });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('gains exactly one well-formed managed block matching the current template and schemaVersion', () => {
    expect(result.exitCode).toBe(0);
    const content = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
    expect(content.split('<!-- cortex:start').length - 1).toBe(1);
    expect(content.split('<!-- cortex:end -->').length - 1).toBe(1);
    expect(content).toContain(`<!-- cortex:start v${SCHEMA_VERSION} -->`);
  });

  it('# My Project and ## Commands are byte-identical to before', () => {
    const content = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
    expect(content.startsWith(preamble)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC2: No --force needed on an existing project; a non-Cortex project refuses cleanly
// ---------------------------------------------------------------------------
describe('AC2: no --force needed on an existing project', () => {
  let root: string;
  let home: string;
  let result: { exitCode: number; summary: string };

  beforeAll(async () => {
    ({ root, home } = await bootstrap('ac2a'));
    result = await sync(root, { home, ...DARWIN_SYNC });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('completes without requiring any force-style flag', () => {
    expect(result.exitCode).toBe(0);
  });
});

describe('AC2: a project with no .cortex/ at all refuses cleanly (exit 2, nothing written)', () => {
  let root: string;
  let home: string;
  beforeAll(() => {
    root = makeTmpDir('ac2b-proj');
    home = makeTmpDir('ac2b-home');
    fs.writeFileSync(path.join(root, 'app.ts'), 'export const a = 1;\n');
  });
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('exits 2 and nothing is created or modified in the project or ~/.claude/', async () => {
    const projectBefore = snapshotTree(root);
    const homeBefore = snapshotTree(home);
    const result = await sync(root, { home, ...DARWIN_SYNC });
    expect(result.exitCode).toBe(2);
    expect(result.summary).toContain('cortex init');
    expect(snapshotTree(root)).toEqual(projectBefore);
    expect(snapshotTree(home)).toEqual(homeBefore);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC3: Non-macOS platform refused
// ---------------------------------------------------------------------------
describe('AC3: non-macOS platform refused', () => {
  let root: string;
  let home: string;
  beforeAll(async () => {
    ({ root, home } = await bootstrap('ac3'));
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('exits 2 with a message naming macOS, and nothing is written', async () => {
    const before = snapshotTree(root);
    const result = await sync(root, { home, platform: 'linux' });
    expect(result.exitCode).toBe(2);
    expect(result.summary).toMatch(/macOS/);
    expect(snapshotTree(root)).toEqual(before);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC4: Unmodified skill bundle is upgraded silently
// ---------------------------------------------------------------------------
describe('AC4: unmodified skill bundle is upgraded silently', () => {
  let root: string;
  let home: string;
  let result: { exitCode: number; summary: string };
  const bundle = 'cortex-loop';
  const stubContent = '---\nname: cortex-loop\ndescription: stub as-installed content\n---\n\nold body\n';

  beforeAll(async () => {
    ({ root, home } = await bootstrap('ac4'));
    // Simulate "installed at an older shipped version, never touched since":
    // overwrite the bundle with distinguishable stub content and a marker
    // whose hash matches THAT stub content exactly.
    const bundleDir = path.join(root, '.claude', 'skills', bundle);
    fs.rmSync(bundleDir, { recursive: true, force: true });
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.writeFileSync(path.join(bundleDir, 'SKILL.md'), stubContent);
    writeInstalledMarker(path.join(bundleDir, INSTALLED_MARKER_FILENAME), hashDirectoryContent(bundleDir));
    result = await sync(root, { home, ...DARWIN_SYNC });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('the bundle on disk matches the newly shipped content, marker rewritten, summary names it upgraded', () => {
    expect(result.exitCode).toBe(0);
    const installedSkill = path.join(root, '.claude', 'skills', bundle, 'SKILL.md');
    const shippedSkill = path.join(PKG_ROOT, 'skills', bundle, 'SKILL.md');
    expect(fs.readFileSync(installedSkill, 'utf-8')).toBe(fs.readFileSync(shippedSkill, 'utf-8'));
    const marker = JSON.parse(
      fs.readFileSync(path.join(root, '.claude', 'skills', bundle, INSTALLED_MARKER_FILENAME), 'utf-8'),
    );
    expect(marker.sha256).toBe(hashDirectoryContent(path.join(PKG_ROOT, 'skills', bundle)));
    expect(result.summary).toMatch(/upgraded/i);
    expect(result.summary).toContain(bundle);
  });
});

// ---------------------------------------------------------------------------
// AC5: User-modified skill bundle is preserved and reported
// ---------------------------------------------------------------------------
describe('AC5: user-modified skill bundle is preserved and reported', () => {
  let root: string;
  let home: string;
  const bundle = 'cortex-loop';
  const installedAt = '---\nname: cortex-loop\ndescription: as installed\n---\n\ninstalled body\n';
  const userEdited = '---\nname: cortex-loop\ndescription: user edited this\n---\n\nEDITED BY DEVELOPER\n';

  function seed(bundleDir: string): void {
    fs.rmSync(bundleDir, { recursive: true, force: true });
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.writeFileSync(path.join(bundleDir, 'SKILL.md'), installedAt);
    // Marker records the hash of the ORIGINAL installed content...
    writeInstalledMarker(path.join(bundleDir, INSTALLED_MARKER_FILENAME), hashDirectoryContent(bundleDir));
    // ...then the developer edits the file, so on-disk no longer matches the marker.
    fs.writeFileSync(path.join(bundleDir, 'SKILL.md'), userEdited);
  }

  it('without --yes: bundle unchanged, summary names it skipped as user-modified', async () => {
    const { root: r, home: h } = await bootstrap('ac5a');
    root = r; home = h;
    const bundleDir = path.join(root, '.claude', 'skills', bundle);
    seed(bundleDir);
    const result = await sync(root, { home, ...DARWIN_SYNC });
    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(path.join(bundleDir, 'SKILL.md'), 'utf-8')).toBe(userEdited);
    expect(result.summary).toMatch(/skipped.*user-modified|user-modified.*skipped/i);
    expect(result.summary).toContain(bundle);
    cleanTmp(root); cleanTmp(home);
  }, TEST_TIMEOUT);

  it('with --yes: bundle overwritten with the shipped version, summary names it upgraded', async () => {
    const { root: r, home: h } = await bootstrap('ac5b');
    root = r; home = h;
    const bundleDir = path.join(root, '.claude', 'skills', bundle);
    seed(bundleDir);
    const result = await sync(root, { home, yes: true, ...DARWIN_SYNC });
    expect(result.exitCode).toBe(0);
    const shippedSkill = path.join(PKG_ROOT, 'skills', bundle, 'SKILL.md');
    expect(fs.readFileSync(path.join(bundleDir, 'SKILL.md'), 'utf-8')).toBe(fs.readFileSync(shippedSkill, 'utf-8'));
    expect(result.summary).toMatch(/upgraded/i);
    cleanTmp(root); cleanTmp(home);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC6: Task payloads refresh and the instruction block appears when unregistered
// ---------------------------------------------------------------------------
describe('AC6: task payloads refresh and the instruction block appears when unregistered', () => {
  let root: string;
  let home: string;
  let result: { exitCode: number; summary: string };
  const canonical = 'daily';

  beforeAll(async () => {
    ({ root, home } = await bootstrap('ac6'));
    // Simulate "written by an older package version": distinguishable stub
    // payload + a marker matching that stub exactly (unmodified since install).
    const scoped = scopedTaskName(root, canonical);
    const dir = path.join(home, '.claude', 'scheduled-tasks', scoped);
    const stub = `---\nname: ${scoped}\ndescription: "old roster"\nmodel: claude-sonnet-5\n---\n\nold body\n`;
    fs.writeFileSync(path.join(dir, 'SKILL.md'), stub);
    writeInstalledMarker(path.join(dir, INSTALLED_MARKER_FILENAME), sha256Hex(stub));
    result = await sync(root, { home, ...DARWIN_SYNC });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('the affected payload SKILL.md is refreshed to the current roster', () => {
    expect(result.exitCode).toBe(0);
    const scoped = scopedTaskName(root, canonical);
    const skillPath = path.join(home, '.claude', 'scheduled-tasks', scoped, 'SKILL.md');
    const task = SCHEDULED_TASKS.find((t) => t.name === canonical)!;
    expect(fs.readFileSync(skillPath, 'utf-8')).toBe(scheduledTaskSkillMd(task, scoped, root));
    expect(result.summary).toMatch(/refreshed/i);
  });

  it('prints the open-Desktop-and-run instruction block (no registry → all five unregistered)', () => {
    expect(result.summary).toContain('run cortex-register-tasks');
    expect(result.summary).toMatch(/not yet registered/);
  });

  it('with a fixture registry where all five are registered and enabled, prints the all-registered one-liner instead', async () => {
    const { root: r2, home: h2 } = await bootstrap('ac6b');
    const appSupportDir = makeTmpDir('ac6b-appsupport');
    const registryFile = path.join(appSupportDir, 'claude-code-sessions', 'uuid-a', 'uuid-b', 'scheduled-tasks.json');
    fs.mkdirSync(path.dirname(registryFile), { recursive: true });
    const entries = SCHEDULED_TASKS.map((t) => ({
      id: scopedTaskName(r2, CANONICAL_TASK_NAMES[t.name] ?? t.name),
      cronExpression: '0 2 * * *',
      enabled: true,
      filePath: path.join(h2, '.claude', 'scheduled-tasks', scopedTaskName(r2, CANONICAL_TASK_NAMES[t.name] ?? t.name), 'SKILL.md'),
      createdAt: Date.now(),
      cwd: r2,
      useWorktree: false,
      permissionMode: 'bypassPermissions',
    }));
    fs.writeFileSync(registryFile, JSON.stringify({ scheduledTasks: entries }, null, 2) + '\n', 'utf-8');
    const r = await sync(r2, { home: h2, appSupportDir, ...DARWIN_SYNC });
    expect(r.exitCode).toBe(0);
    expect(r.summary).toMatch(/all 5 registered/);
    expect(r.summary).not.toContain('run cortex-register-tasks');
    cleanTmp(r2); cleanTmp(h2); cleanTmp(appSupportDir);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC7: Localised _index.md is preserved and reported, not refreshed
// ---------------------------------------------------------------------------
describe('AC7: localised _index.md is preserved and reported, not refreshed', () => {
  let root: string;
  let home: string;
  let result: { exitCode: number; summary: string };
  const localisedContent = '# Compass — LOCALISED\n\n**Read this when:** whatever the human decided.\n\n**What\'s here:** custom.\n\n**How to navigate:** custom.\n';

  beforeAll(async () => {
    ({ root, home } = await bootstrap('ac7'));
    fs.writeFileSync(path.join(root, '.cortex', 'compass', '_index.md'), localisedContent);
    // atlas/_index.md is left exactly as init wrote it (still matches the template).
    result = await sync(root, { home, ...DARWIN_SYNC });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('compass/_index.md is byte-identical after the run and named as localised', () => {
    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(path.join(root, '.cortex', 'compass', '_index.md'), 'utf-8')).toBe(localisedContent);
    expect(result.summary).toContain('compass');
    expect(result.summary).toMatch(/localised/i);
  });

  it('a sibling _index.md that still matches its template is refreshed (current)', () => {
    // atlas/_index.md was untouched since init wrote the current template —
    // it is categorised as current, not localised.
    const atlasLines = result.summary.split('\n').filter((l) => l.includes('atlas'));
    expect(atlasLines.some((l) => !/localised/i.test(l))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC8: Knowledge content is byte-identical after sync
// ---------------------------------------------------------------------------
describe('AC8: knowledge content is byte-identical after sync', () => {
  let root: string;
  let home: string;

  beforeAll(async () => {
    ({ root, home } = await bootstrap('ac8'));
    // Populate the five knowledge trees with some hand-authored content
    // (plain notes, not frontmatter-validated artefacts — the point of this
    // AC is byte-identity across sync, not spec-conformant content).
    fs.writeFileSync(path.join(root, '.cortex', 'compass', 'team-notes.md'), '# Team notes\n\nsome hand-authored content\n');
    // atlas/sources/ raw material is exempt from the id/frontmatter contract
    // (only .meta.md sidecars are validated) — a safe place for a plain file.
    fs.mkdirSync(path.join(root, '.cortex', 'atlas', 'sources'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'atlas', 'sources', 'raw-material.txt'), 'raw captured material\n');
    fs.writeFileSync(path.join(root, '.cortex', 'archive', 'register.md'), '# custom register content\n');
    fs.writeFileSync(path.join(root, '.cortex', 'insight', 'concepts', 'demo.md'), '# demo concept\n');
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('every file under compass/atlas/archive/insight/pulse is byte-identical, none created or deleted', async () => {
    const before = knowledgeSnapshot(root);
    const result = await sync(root, { home, ...DARWIN_SYNC });
    expect(result.exitCode).toBe(0);
    const after = knowledgeSnapshot(root);
    expect(after).toEqual(before);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC9: MAJOR schema lag defers to migrate, nothing written
// ---------------------------------------------------------------------------
describe('AC9: MAJOR schema lag defers to migrate, nothing written', () => {
  it('MAJOR below supported → exit 3, names cortex migrate, nothing written', async () => {
    const { root, home } = await bootstrap('ac9a');
    const config = readConfig(root);
    writeConfig(root, { ...config, schemaVersion: '2.0' });
    const before = snapshotTree(root);
    const result = await sync(root, { home, ...DARWIN_SYNC });
    expect(result.exitCode).toBe(3);
    expect(result.summary).toContain('cortex migrate');
    expect(snapshotTree(root)).toEqual(before);
    cleanTmp(root); cleanTmp(home);
  }, TEST_TIMEOUT);

  it('MAJOR above supported → exit 3, names a cortex package upgrade, nothing written', async () => {
    const { root, home } = await bootstrap('ac9b');
    const config = readConfig(root);
    writeConfig(root, { ...config, schemaVersion: '4.0' });
    const before = snapshotTree(root);
    const result = await sync(root, { home, ...DARWIN_SYNC });
    expect(result.exitCode).toBe(3);
    expect(result.summary).toMatch(/upgrade the installed `?cortex`? package/i);
    expect(snapshotTree(root)).toEqual(before);
    cleanTmp(root); cleanTmp(home);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC10: MINOR upgrade rewrites schemaVersion and nothing else in the config
// ---------------------------------------------------------------------------
describe('AC10: schemaVersion is rewritten to the installed package version, no other key modified', () => {
  let root: string;
  let home: string;
  let originalConfig: Record<string, unknown>;

  beforeAll(async () => {
    ({ root, home } = await bootstrap('ac10'));
    const config = readConfig(root);
    // This repo has shipped exactly one template generation so far (3.0), so
    // there is no distinct "3.1" to genuinely upgrade to — stand in with a
    // distinguishable same-MAJOR version string so the rewrite path runs for
    // real, and assert every OTHER key is untouched.
    originalConfig = { ...config, schemaVersion: '3.0-priorfixture' };
    writeConfig(root, originalConfig);
    await sync(root, { home, ...DARWIN_SYNC });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it(`cortex.config.json's schemaVersion reads ${SCHEMA_VERSION}`, () => {
    expect(readConfig(root)['schemaVersion']).toBe(SCHEMA_VERSION);
  });

  it('no other key in the config file is modified', () => {
    const after = readConfig(root);
    for (const key of Object.keys(originalConfig)) {
      if (key === 'schemaVersion') continue;
      expect(after[key]).toEqual(originalConfig[key]);
    }
    expect(Object.keys(after).sort()).toEqual(Object.keys(originalConfig).sort());
  });
});

// ---------------------------------------------------------------------------
// AC11: Idempotent double-run
// ---------------------------------------------------------------------------
describe('AC11: idempotent double-run', () => {
  let root: string;
  let home: string;

  beforeAll(async () => {
    ({ root, home } = await bootstrap('ac11'));
    const first = await sync(root, { home, ...DARWIN_SYNC });
    expect(first.exitCode).toBe(0);
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('no file bytes change, no new skill/task upgrades occur, summary reports everything already current', async () => {
    const before = snapshotTree(root);
    const second = await sync(root, { home, ...DARWIN_SYNC });
    expect(second.exitCode).toBe(0);
    expect(snapshotTree(root)).toEqual(before);
    expect(second.summary).toMatch(/already current/);
    expect(second.summary).not.toMatch(/upgraded:/i);
    expect(second.summary).not.toMatch(/refreshed:/i);
  }, TEST_TIMEOUT);

  it('self-validation is conformant', async () => {
    const report = await validate(root, { root });
    expect(report.conformant).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: sync's frontmatter round-trips through the schema validator
// ---------------------------------------------------------------------------
describe('Cross-cutting: a synced project stays schema-valid', () => {
  it('scheduled task payload frontmatter parses cleanly after sync', async () => {
    const { root, home } = await bootstrap('cross-cutting');
    await sync(root, { home, ...DARWIN_SYNC });
    const scoped = scopedTaskName(root, 'daily');
    const skillPath = path.join(home, '.claude', 'scheduled-tasks', scoped, 'SKILL.md');
    const data = matter(fs.readFileSync(skillPath, 'utf-8')).data;
    expect(data['name']).toBe(scoped);
    cleanTmp(root); cleanTmp(home);
  }, TEST_TIMEOUT);
});
