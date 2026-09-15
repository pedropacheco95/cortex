/**
 * Spec tests for core-cli.sync Rule 5's additions chain, through the real
 * `sync()` against a real project.
 *
 * The scenario each test builds is the one that motivated the rule: a developer
 * culling skill bundles they do not use (the Claude Code skill listing is a
 * budgeted surface), and every subsequent sync putting them straight back.
 *
 * The fifth criterion — "a bundle added after the project's version still
 * reaches it" — is NOT here. It needs a chain entry above SCHEMA_VERSION, which
 * the chain's own invariant forbids, so it is exercised against a fixture
 * version pair in tests/atomic/core-cli/skill-additions.test.ts instead.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { init } from '../../../src/cli/init.js';
import { sync } from '../../../src/cli/sync.js';
import { listSkillBundles } from '../../../src/cli/scaffold.js';
import { SCHEMA_VERSION } from '../../../src/cli/templates.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const };
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PKG_SKILLS = path.join(PKG_ROOT, 'skills');

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`sync-add-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function skillDir(root: string, name: string): string {
  return path.join(root, '.claude', 'skills', name);
}

function setSchemaVersion(root: string, version: string): void {
  const configPath = path.join(root, '.cortex', 'cortex.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  config['schemaVersion'] = version;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

function readSchemaVersion(root: string): unknown {
  const configPath = path.join(root, '.cortex', 'cortex.config.json');
  return (JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>)['schemaVersion'];
}

/** A real initialised project at `atVersion`, with `deleted` bundles removed. */
async function makeProject(label: string, atVersion: string, deleted: string[] = []) {
  const root = tmp(`${label}-root`);
  const home = tmp(`${label}-home`);
  await init(root, { home, noLlm: true, yes: true, ...DARWIN });

  for (const name of deleted) {
    fs.rmSync(skillDir(root, name), { recursive: true, force: true });
  }
  setSchemaVersion(root, atVersion);
  return { root, home };
}

describe('AC: a bundle the developer deleted is not reinstalled', () => {
  it(
    'leaves it absent and names it in the summary',
    async () => {
      const { root, home } = await makeProject('deleted', '3.3', ['cortex-loop']);

      const result = await sync(root, { home, yes: true, ...DARWIN });

      expect(fs.existsSync(skillDir(root, 'cortex-loop'))).toBe(false);
      expect(result.summary).toMatch(/Skipped \(deleted by you, not reinstalled\):.*cortex-loop/);
      expect(result.exitCode).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'stays absent across a second sync — the skip is idempotent',
    async () => {
      const { root, home } = await makeProject('deleted-twice', '3.3', ['cortex-loop']);

      await sync(root, { home, yes: true, ...DARWIN });
      const second = await sync(root, { home, yes: true, ...DARWIN });

      expect(fs.existsSync(skillDir(root, 'cortex-loop'))).toBe(false);
      expect(second.exitCode).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "never touches a developer's own skill",
    async () => {
      const { root, home } = await makeProject('own-skill', '3.3', ['cortex-loop']);
      const mine = skillDir(root, 'my-own-skill');
      fs.mkdirSync(mine, { recursive: true });
      fs.writeFileSync(path.join(mine, 'SKILL.md'), '---\nname: my-own-skill\n---\n\n# Mine\n');

      const result = await sync(root, { home, yes: true, ...DARWIN });

      expect(fs.readFileSync(path.join(mine, 'SKILL.md'), 'utf-8')).toContain('# Mine');
      expect(result.summary).not.toContain('my-own-skill');
    },
    TEST_TIMEOUT,
  );
});

describe('AC: a project predating the chain gets the full roster once', () => {
  it(
    'installs every absent bundle when the project is below the seed version',
    async () => {
      const gone = ['cortex-loop', 'specflow-lint', 'specflow-viewer'];
      const { root, home } = await makeProject('predates', '3.2', gone);

      const result = await sync(root, { home, yes: true, ...DARWIN });

      for (const name of gone) {
        expect(fs.existsSync(skillDir(root, name)), `${name} should have been installed`).toBe(true);
      }
      expect(result.summary).toMatch(/Installed:/);
      for (const name of gone) expect(result.summary).toContain(name);
    },
    TEST_TIMEOUT,
  );
});

describe('AC: the additions comparison reads the version from before Rule 2\'s rewrite', () => {
  it(
    'installs using the pre-run version even though sync rewrites schemaVersion first',
    async () => {
      const gone = ['cortex-loop', 'specflow-viewer'];
      const { root, home } = await makeProject('ordering', '3.2', gone);
      expect(readSchemaVersion(root)).toBe('3.2');

      const result = await sync(root, { home, yes: true, ...DARWIN });

      // Rule 2 rewrote the config to the package version BEFORE the skill step
      // ran. Reading the post-rewrite value would make every bundle look
      // already-offered, so these two assertions only hold together if the
      // comparison used the 3.2 captured at the top of the run.
      expect(readSchemaVersion(root)).toBe(SCHEMA_VERSION);
      for (const name of gone) {
        expect(fs.existsSync(skillDir(root, name)), `${name} should have been installed`).toBe(true);
      }
      expect(result.exitCode).toBe(0);
    },
    TEST_TIMEOUT,
  );
});

describe('AC: a missing skills directory is repaired in full', () => {
  it(
    'installs every shipped bundle regardless of the chain',
    async () => {
      const { root, home } = await makeProject('wiped', '3.3');
      fs.rmSync(path.join(root, '.claude', 'skills'), { recursive: true, force: true });

      const result = await sync(root, { home, yes: true, ...DARWIN });

      for (const name of listSkillBundles(PKG_SKILLS)) {
        expect(fs.existsSync(skillDir(root, name)), `${name} should have been installed`).toBe(true);
      }
      expect(result.summary).not.toMatch(/Skipped \(deleted by you/);
      expect(result.exitCode).toBe(0);
    },
    TEST_TIMEOUT,
  );
});
