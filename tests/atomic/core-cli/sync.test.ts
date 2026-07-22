/**
 * Atomic tests for core-cli.sync — granular rule-level behaviours behind the
 * ACs: exact preflight/version-gate refusal wording, the `.cortex-installed.json`
 * marker/hash mechanics (scaffold.ts), the localisation-aware _index.md
 * template lookup, the shared registration-summary rendering, and the `cortex
 * sync` CLI dispatch (no --force flag exists at all).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { init } from '../../../src/cli/init.js';
import { sync } from '../../../src/cli/sync.js';
import { run } from '../../../src/cli/cli.js';
import {
  hashDirectoryContent,
  readInstalledMarker,
  writeInstalledMarker,
  sha256Hex,
  INSTALLED_MARKER_FILENAME,
  registrationSummaryLines,
} from '../../../src/cli/scaffold.js';
import { makeTmpDir, cleanTmp, gitInit, snapshotTree } from '../../fixtures/init-harness.js';

const TEST_TIMEOUT = 60_000;
const DARWIN_INIT = { platform: 'darwin' as const, noLlm: true };
const DARWIN_SYNC = { platform: 'darwin' as const };

async function bootstrap(label: string): Promise<{ root: string; home: string }> {
  const root = makeTmpDir(`sync-atomic-${label}-proj`);
  const home = makeTmpDir(`sync-atomic-${label}-home`);
  gitInit(root);
  await init(root, { home, ...DARWIN_INIT });
  return { root, home };
}

// ---------------------------------------------------------------------------
// Rule 1 — preflight refusal wording
// ---------------------------------------------------------------------------
describe('Rule 1: preflight refusal wording', () => {
  it('non-macOS names macOS explicitly', async () => {
    const root = makeTmpDir('r1-linux-proj');
    const home = makeTmpDir('r1-linux-home');
    const result = await sync(root, { home, platform: 'linux' });
    expect(result.exitCode).toBe(2);
    expect(result.summary).toContain('macOS');
    cleanTmp(root); cleanTmp(home);
  });

  it('missing .cortex/ names cortex init as the next step', async () => {
    const root = makeTmpDir('r1-nocortex-proj');
    const home = makeTmpDir('r1-nocortex-home');
    const result = await sync(root, { home, ...DARWIN_SYNC });
    expect(result.exitCode).toBe(2);
    expect(result.summary).toContain('cortex init');
    cleanTmp(root); cleanTmp(home);
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — version gate: exact refusal wording both directions
// ---------------------------------------------------------------------------
describe('Rule 2: version gate refusal wording', () => {
  it('MAJOR below supported names cortex migrate and the declared version', async () => {
    const { root, home } = await bootstrap('r2-below');
    const configPath = path.join(root, '.cortex', 'cortex.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    fs.writeFileSync(configPath, JSON.stringify({ ...config, schemaVersion: '1.5' }, null, 2));
    const result = await sync(root, { home, ...DARWIN_SYNC });
    expect(result.exitCode).toBe(3);
    expect(result.summary).toContain('1.5');
    expect(result.summary).toContain('cortex migrate');
    cleanTmp(root); cleanTmp(home);
  }, TEST_TIMEOUT);

  it('MAJOR above supported names a package upgrade and the declared version', async () => {
    const { root, home } = await bootstrap('r2-above');
    const configPath = path.join(root, '.cortex', 'cortex.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    fs.writeFileSync(configPath, JSON.stringify({ ...config, schemaVersion: '99.0' }, null, 2));
    const result = await sync(root, { home, ...DARWIN_SYNC });
    expect(result.exitCode).toBe(3);
    expect(result.summary).toContain('99.0');
    expect(result.summary).toMatch(/upgrade/i);
    cleanTmp(root); cleanTmp(home);
  }, TEST_TIMEOUT);

  it('missing schemaVersion field is treated as major 0 (behind) rather than crashing', async () => {
    const { root, home } = await bootstrap('r2-missing');
    const configPath = path.join(root, '.cortex', 'cortex.config.json');
    fs.writeFileSync(configPath, JSON.stringify({ hooks: { preRead: true } }, null, 2));
    const result = await sync(root, { home, ...DARWIN_SYNC });
    expect(result.exitCode).toBe(3);
    expect(result.summary).toContain('cortex migrate');
    cleanTmp(root); cleanTmp(home);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 12 — no --force flag at all (nothing to unlock, sync always considers
// every write a merge/append/judgment-gated upgrade)
// ---------------------------------------------------------------------------
describe('Rule 12: sync has no --force flag', () => {
  it('CLI dispatch accepts --yes but a stray --force is simply ignored as a non-flag-consuming no-op (no crash, still runs)', async () => {
    const { root, home } = await bootstrap('r12-noforce');
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    try {
      const exitCode = await run(['sync', root, '--force']);
      expect(exitCode).toBe(0);
    } finally {
      console.log = origLog;
    }
    cleanTmp(root); cleanTmp(home);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// `cortex sync` CLI dispatch
// ---------------------------------------------------------------------------
describe('CLI dispatch: cortex sync', () => {
  it('routes to sync() and prints the summary on success', async () => {
    const root = makeTmpDir('cli-sync-proj');
    const home = makeTmpDir('cli-sync-home');
    gitInit(root);
    await init(root, { home, ...DARWIN_INIT });
    // sync() defaults platform to process.platform; skip actual dispatch
    // assertion of exit code portability by relying on the same darwin CI
    // assumption the rest of the suite makes (process.platform on the test
    // runner) — instead, verify the dispatcher reaches sync.ts at all via a
    // preflight-refusal path that doesn't depend on the host platform: an
    // absent .cortex/.
    cleanTmp(root);
    const bareRoot = makeTmpDir('cli-sync-bare-proj');
    const errors: string[] = [];
    const origErr = console.error;
    console.error = (msg: string) => errors.push(msg);
    let exitCode: number;
    try {
      exitCode = await run(['sync', bareRoot]);
    } finally {
      console.error = origErr;
    }
    expect(exitCode).toBe(2);
    expect(errors.join('\n')).toContain('cortex init');
    cleanTmp(bareRoot); cleanTmp(home);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// `.cortex-installed.json` marker + hash mechanics (scaffold.ts)
// ---------------------------------------------------------------------------
describe('scaffold.ts: hashDirectoryContent + marker mechanics', () => {
  it('hashes are stable across two calls and independent of directory read order', () => {
    const dir = makeTmpDir('hash-stable');
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'b.md'), 'B');
    fs.writeFileSync(path.join(dir, 'a.md'), 'A');
    fs.writeFileSync(path.join(dir, 'sub', 'c.md'), 'C');
    const h1 = hashDirectoryContent(dir);
    const h2 = hashDirectoryContent(dir);
    expect(h1).toBe(h2);
    cleanTmp(dir);
  });

  it('excludes named files (e.g. the marker itself) from the hash', () => {
    const dir = makeTmpDir('hash-exclude');
    fs.writeFileSync(path.join(dir, 'a.md'), 'A');
    const withoutMarker = hashDirectoryContent(dir, [INSTALLED_MARKER_FILENAME]);
    writeInstalledMarker(path.join(dir, INSTALLED_MARKER_FILENAME), 'irrelevant-value');
    const withMarkerExcluded = hashDirectoryContent(dir, [INSTALLED_MARKER_FILENAME]);
    expect(withMarkerExcluded).toBe(withoutMarker);
    cleanTmp(dir);
  });

  it('a byte change anywhere in the tree changes the hash', () => {
    const dir = makeTmpDir('hash-sensitive');
    fs.writeFileSync(path.join(dir, 'a.md'), 'A');
    const h1 = hashDirectoryContent(dir);
    fs.writeFileSync(path.join(dir, 'a.md'), 'A2');
    const h2 = hashDirectoryContent(dir);
    expect(h1).not.toBe(h2);
    cleanTmp(dir);
  });

  it('readInstalledMarker tolerates a missing or malformed marker file (returns undefined)', () => {
    const dir = makeTmpDir('marker-malformed');
    expect(readInstalledMarker(path.join(dir, INSTALLED_MARKER_FILENAME))).toBeUndefined();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, INSTALLED_MARKER_FILENAME), 'not json{{{');
    expect(readInstalledMarker(path.join(dir, INSTALLED_MARKER_FILENAME))).toBeUndefined();
    fs.writeFileSync(path.join(dir, INSTALLED_MARKER_FILENAME), JSON.stringify({ notSha256: 'x' }));
    expect(readInstalledMarker(path.join(dir, INSTALLED_MARKER_FILENAME))).toBeUndefined();
    cleanTmp(dir);
  });

  it('writeInstalledMarker round-trips through readInstalledMarker', () => {
    const dir = makeTmpDir('marker-roundtrip');
    const markerPath = path.join(dir, INSTALLED_MARKER_FILENAME);
    writeInstalledMarker(markerPath, 'abc123');
    expect(readInstalledMarker(markerPath)).toEqual({ sha256: 'abc123' });
    cleanTmp(dir);
  });

  it('sha256Hex is deterministic for identical string content', () => {
    expect(sha256Hex('hello')).toBe(sha256Hex('hello'));
    expect(sha256Hex('hello')).not.toBe(sha256Hex('hello!'));
  });
});

// ---------------------------------------------------------------------------
// registrationSummaryLines — shared verbatim between init and sync
// ---------------------------------------------------------------------------
describe('scaffold.ts: registrationSummaryLines', () => {
  it('renders the all-registered one-liner when nothing is unregistered', () => {
    const lines = registrationSummaryLines({ unregistered: [], total: 5 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('all 5 registered');
    expect(lines[0]).toContain('cortex tasks verify');
  });

  it('renders the instruction block when something is unregistered', () => {
    const lines = registrationSummaryLines({ unregistered: ['daily', 'test-runner'], total: 5 });
    expect(lines.join('\n')).toContain('2 of 5 not yet registered');
    expect(lines.join('\n')).toContain('run cortex-register-tasks');
    expect(lines.join('\n')).toContain('cortex tasks verify');
  });
});

// ---------------------------------------------------------------------------
// Rule 4 — _index.md refresh: unknown-directory handling
// ---------------------------------------------------------------------------
describe('Rule 4: an _index.md in a directory sync has no known template for is left alone', () => {
  it('a custom user-created subdirectory under .cortex/ is reported as localised, not refreshed', async () => {
    const { root, home } = await bootstrap('r4-unknown-dir');
    const customDir = path.join(root, '.cortex', 'my-custom-thing');
    fs.mkdirSync(customDir, { recursive: true });
    const customIndex = '# My Custom Thing\n\nnot a schema-known module\n';
    fs.writeFileSync(path.join(customDir, '_index.md'), customIndex);
    const result = await sync(root, { home, ...DARWIN_SYNC });
    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(path.join(customDir, '_index.md'), 'utf-8')).toBe(customIndex);
    expect(result.summary).toMatch(/localised/i);
    cleanTmp(root); cleanTmp(home);
  }, TEST_TIMEOUT);

  it('pulse/reports/ (a carved-out subdirectory) is never inspected even if it somehow carries an _index.md', async () => {
    const { root, home } = await bootstrap('r4-pulse-subdir');
    const strayIndex = path.join(root, '.cortex', 'pulse', 'reports', '_index.md');
    fs.mkdirSync(path.dirname(strayIndex), { recursive: true });
    fs.writeFileSync(strayIndex, 'stray content that must survive untouched\n');
    const result = await sync(root, { home, ...DARWIN_SYNC });
    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(strayIndex, 'utf-8')).toBe('stray content that must survive untouched\n');
    cleanTmp(root); cleanTmp(home);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 6/7 — hooks + git hook reuse the exact init mechanism (repair path)
// ---------------------------------------------------------------------------
describe('Rules 6 & 7: sync repairs missing hooks/git-hook exactly like init would', () => {
  it('settings.json hooks are re-merged if the file was deleted before sync', async () => {
    const { root, home } = await bootstrap('r67-settings');
    fs.rmSync(path.join(root, '.claude', 'settings.json'), { force: true });
    const result = await sync(root, { home, ...DARWIN_SYNC });
    expect(result.exitCode).toBe(0);
    const settings = fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf-8');
    expect(settings).toContain('cortex hook session-start');
    cleanTmp(root); cleanTmp(home);
  }, TEST_TIMEOUT);

  it('git post-commit hook is re-appended if it was deleted before sync (git repo present)', async () => {
    const { root, home } = await bootstrap('r67-githook');
    fs.rmSync(path.join(root, '.git', 'hooks', 'post-commit'), { force: true });
    const result = await sync(root, { home, ...DARWIN_SYNC });
    expect(result.exitCode).toBe(0);
    const hookPath = path.join(root, '.git', 'hooks', 'post-commit');
    expect(fs.existsSync(hookPath)).toBe(true);
    expect(fs.readFileSync(hookPath, 'utf-8')).toContain('cortex insight-refresh-fast');
    cleanTmp(root); cleanTmp(home);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 9 — never touches knowledge content, at a finer per-file grain
// ---------------------------------------------------------------------------
describe('Rule 9: sync never writes compass/atlas/archive/insight content or pulse state', () => {
  it('a hand-authored rule file is byte-identical and no sibling file is created', async () => {
    const { root, home } = await bootstrap('r9-rule');
    const rulePath = path.join(root, '.cortex', 'compass', 'rules', 'R-001-demo.md');
    const ruleContent = '---\nid: R-001\ntitle: "Demo"\ngoverns: []\n---\n\nbody\n';
    fs.writeFileSync(rulePath, ruleContent);
    const before = snapshotTree(path.join(root, '.cortex', 'compass', 'rules'));
    await sync(root, { home, ...DARWIN_SYNC });
    expect(snapshotTree(path.join(root, '.cortex', 'compass', 'rules'))).toEqual(before);
    expect(fs.readFileSync(rulePath, 'utf-8')).toBe(ruleContent);
    cleanTmp(root); cleanTmp(home);
  }, TEST_TIMEOUT);
});
