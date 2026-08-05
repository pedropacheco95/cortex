/**
 * Spec tests for core-cli.sync Rule 6 (B-015) — retired bundles are removed on
 * sync, through the real `sync()` against a real project.
 *
 * The scenario each test builds is the one that produced the bug: a project
 * installed before a rename, carrying the retired bundle alongside the new
 * one, so that Claude Code would register two skills both claiming to be the
 * mandatory entry point.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { init } from '../../../src/cli/init.js';
import { sync } from '../../../src/cli/sync.js';
import {
  INSTALLED_MARKER_FILENAME,
  hashDirectoryContent,
  writeInstalledMarker,
} from '../../../src/cli/scaffold.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const };

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`sync-retire-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function skillDir(root: string, name: string): string {
  return path.join(root, '.claude', 'skills', name);
}

function makeBundle(root: string, name: string, body: string, withMarker: boolean): void {
  const dir = skillDir(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), body);
  if (withMarker) {
    writeInstalledMarker(
      path.join(dir, INSTALLED_MARKER_FILENAME),
      hashDirectoryContent(dir, [INSTALLED_MARKER_FILENAME]),
    );
  }
}

/**
 * A real initialised project, then doctored into a pre-rename install: the
 * retired bundle present, and `schemaVersion` rolled back so sync's migration
 * window actually spans the 3.3 entry.
 */
async function makePreRenameProject(label: string, opts: { marker: boolean; fromVersion?: string }) {
  const root = tmp(`${label}-root`);
  const home = tmp(`${label}-home`);
  await init(root, { home, noLlm: true, yes: true, ...DARWIN });

  // The retired bundle, as an older package would have left it.
  makeBundle(root, 'specflow-change-router', '---\nname: specflow-change-router\n---\n\n# Router\n', opts.marker);
  // A skill the developer wrote themselves — must survive untouched.
  makeBundle(root, 'my-own-skill', '---\nname: my-own-skill\n---\n\n# Mine\n', false);

  const configPath = path.join(root, '.cortex', 'cortex.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  config['schemaVersion'] = opts.fromVersion ?? '3.0';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  return { root, home };
}

describe('AC: a retired bundle is removed on sync (B-015)', () => {
  it('removes it silently when its marker matches, and reports it', async () => {
    const { root, home } = await makePreRenameProject('clean', { marker: true });
    expect(fs.existsSync(skillDir(root, 'specflow-change-router'))).toBe(true);

    const result = await sync(root, { yes: true, home, ...DARWIN });

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(skillDir(root, 'specflow-change-router'))).toBe(false);
    expect(result.summary).toContain('Removed (retired by Cortex)');
    expect(result.summary).toContain('specflow-change-router');
  }, TEST_TIMEOUT);

  it('leaves exactly one entry point installed afterwards', async () => {
    const { root, home } = await makePreRenameProject('one-gate', { marker: true });
    await sync(root, { yes: true, home, ...DARWIN });

    expect(fs.existsSync(path.join(skillDir(root, 'specflow-entry'), 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(skillDir(root, 'specflow-change-router'))).toBe(false);
  }, TEST_TIMEOUT);

  it('also clears _conventions, which was never a bundle', async () => {
    const { root, home } = await makePreRenameProject('conventions', { marker: false });
    makeBundle(root, '_conventions', '# stale copy\n', true);
    // `_conventions` has no SKILL.md in the package; the stale copy here is a
    // plain file, so re-hash after writing to make the marker match.
    const dir = skillDir(root, '_conventions');
    writeInstalledMarker(
      path.join(dir, INSTALLED_MARKER_FILENAME),
      hashDirectoryContent(dir, [INSTALLED_MARKER_FILENAME]),
    );

    await sync(root, { yes: true, home, ...DARWIN });
    expect(fs.existsSync(dir)).toBe(false);
  }, TEST_TIMEOUT);
});

describe('AC: a retired bundle the developer edited is preserved, not deleted', () => {
  it('non-interactively, an unmarked retired bundle survives and is reported as preserved', async () => {
    const { root, home } = await makePreRenameProject('edited', { marker: false });

    // No `yes`, no TTY: promptYesNo's default is No.
    const result = await sync(root, { home, ...DARWIN });

    expect(fs.existsSync(skillDir(root, 'specflow-change-router'))).toBe(true);
    expect(result.summary).toContain('Retired but preserved');
    expect(result.summary).toContain('specflow-change-router');
    expect(result.summary).not.toContain('Removed (retired by Cortex)');
  }, TEST_TIMEOUT);

  it('--yes then removes it, so the developer keeps a way through', async () => {
    const { root, home } = await makePreRenameProject('edited-then-yes', { marker: false });
    await sync(root, { home, ...DARWIN });
    expect(fs.existsSync(skillDir(root, 'specflow-change-router'))).toBe(true);

    const result = await sync(root, { yes: true, home, ...DARWIN });
    expect(fs.existsSync(skillDir(root, 'specflow-change-router'))).toBe(false);
    expect(result.summary).toContain('Removed (retired by Cortex)');
  }, TEST_TIMEOUT);
});

describe("AC: a developer's own skill is never touched", () => {
  it('survives byte-identical and appears in no removal report', async () => {
    const { root, home } = await makePreRenameProject('own', { marker: true });
    const own = path.join(skillDir(root, 'my-own-skill'), 'SKILL.md');
    const before = fs.readFileSync(own);

    const result = await sync(root, { yes: true, home, ...DARWIN });

    expect(fs.existsSync(own)).toBe(true);
    expect(fs.readFileSync(own).equals(before)).toBe(true);
    expect(result.summary).not.toContain('my-own-skill');
  }, TEST_TIMEOUT);
});

describe('AC: a currently-shipped bundle is never removed', () => {
  it('specflow-entry is present after a sync that removes its predecessor', async () => {
    const { root, home } = await makePreRenameProject('shipped-safe', { marker: true });
    await sync(root, { yes: true, home, ...DARWIN });
    expect(fs.existsSync(path.join(skillDir(root, 'specflow-entry'), 'SKILL.md'))).toBe(true);
  }, TEST_TIMEOUT);
});

describe('AC: a declined removal is re-offered, never silently dropped', () => {
  it('the orphan is still a candidate on the next sync, even though the version already advanced', async () => {
    // The cursor trap: sync writes schemaVersion 3.0 -> 3.3 on the FIRST run,
    // whether or not the removal happened. A window-based migration would
    // never revisit it, and a declined orphan would become permanent.
    const { root, home } = await makePreRenameProject('declined-then-reoffered', { marker: false });

    await sync(root, { home, ...DARWIN }); // declined non-interactively
    expect(fs.existsSync(skillDir(root, 'specflow-change-router'))).toBe(true);
    const config = JSON.parse(
      fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(config['schemaVersion']).toBe('3.3'); // cursor already moved

    const second = await sync(root, { home, ...DARWIN });
    expect(second.summary).toContain('Retired but preserved');
  }, TEST_TIMEOUT);

  it('a project already at the current version still sheds an orphan it carries', async () => {
    const { root, home } = await makePreRenameProject('already-current', { marker: true, fromVersion: '3.3' });
    await sync(root, { yes: true, home, ...DARWIN });
    expect(fs.existsSync(skillDir(root, 'specflow-change-router'))).toBe(false);
  }, TEST_TIMEOUT);
});

describe('idempotence', () => {
  it('a second sync removes nothing and still reports success — the window has closed', async () => {
    const { root, home } = await makePreRenameProject('idempotent', { marker: true });
    await sync(root, { yes: true, home, ...DARWIN });
    const second = await sync(root, { yes: true, home, ...DARWIN });

    expect(second.exitCode).toBe(0);
    expect(second.summary).not.toContain('Removed (retired by Cortex)');
  }, TEST_TIMEOUT);
});
