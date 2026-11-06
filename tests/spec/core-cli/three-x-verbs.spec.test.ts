/**
 * Spec-level tests — `core-cli.init` Rule 22: a 3.x verb on a 4.0 project
 * refuses before it can create `.cortex/`, which would make `cortex sync`
 * refuse the project as a 3.x one.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { run as cortex } from '../../../src/cli/cli.js';
import { updateRoute } from '../../../src/cli/update.js';
import { storeInit } from '../../../src/store/init.js';
import { FINAL_BUNDLES } from '../../../src/store/migrate/system.js';
import { tmpRepo, cleanRepos, gitInit } from '../../fixtures/store.js';

const REFUSED: readonly (readonly string[])[] = [
  ['scan'], ['insight', 'file', 'x'], ['why', 'x'], ['recall', 'x'], ['usage'], ['thread', 'list'],
  ['id', 'next', 'rule'], ['constellation'], ['pulse-list'], ['pulse-accept', '1'], ['pulse-reject', '1'],
  ['pulse-hygiene'], ['pulse-distil'], ['loop-rule-decay'], ['loop-atlas-staleness'], ['loop-onboarding-drift'],
  ['loop-bug-triage'], ['loop-specflow-lint'], ['loop-specflow-verify'], ['loop-spec-drift'], ['loop-test-runner'],
  ['test-run'], ['loop-session-observe'], ['loop-insight-refresh', '--daily'],
];

const home = process.cwd();

afterEach(() => {
  process.chdir(home);
  vi.restoreAllMocks();
  cleanRepos();
});

function fourOhProject(): string {
  const root = tmpRepo('four-oh');
  gitInit(root);
  storeInit(root);
  process.chdir(root);
  return root;
}

function pkg(): string {
  const dir = tmpRepo('pkg');
  for (const n of [...FINAL_BUNDLES, 'cortex-migrate']) {
    fs.mkdirSync(path.join(dir, 'skills', n), { recursive: true });
    fs.writeFileSync(path.join(dir, 'skills', n, 'SKILL.md'), `---\nname: ${n}\ndescription: 'x'\n---\n\n# ${n}\n`);
  }
  return dir;
}

describe('core-cli.init Rule 22: 3.x verbs refuse on a 4.0 project', () => {
  it('[CORE-CLI-INIT-56] a 3.x verb on a 4.0 project refuses and creates no .cortex/', async () => {
    const root = fourOhProject();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const argv of REFUSED) {
      errors.mockClear();
      expect(await cortex([...argv]), argv.join(' ')).toBe(2);
      expect(errors).toHaveBeenCalledWith(
        `cortex ${argv[0]}: refused — this verb serves 3.x projects and this project is on the 4.0 store. Nothing ran.`,
      );
      expect(fs.existsSync(path.join(root, '.cortex')), argv.join(' ')).toBe(false);
    }
    const userHome = tmpRepo('home');
    const sync = await updateRoute(root, { platform: 'darwin', home: userHome, appSupportDir: path.join(userHome, 'app'), packageDir: pkg() });
    expect(sync.exitCode).toBe(0);
  });

  it('[CORE-CLI-INIT-57] a 3.x project keeps its verbs', async () => {
    const root = fourOhProject();
    fs.mkdirSync(path.join(root, '.cortex'));
    fs.writeFileSync(path.join(root, '.cortex/cortex.config.json'), '{"schemaVersion":"3.4"}');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await cortex(['pulse-list']);
    expect(errors.mock.calls.flat().join('\n')).not.toContain('refused');
  });
});
