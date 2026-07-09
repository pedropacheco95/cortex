/**
 * Spec-layer test for core-cli.tasks-register — the integrated slice: payload
 * roster refresh + registry upsert + verify, then the B-009 loss scenario
 * (an app update wipes the registry; verify detects it; re-register heals it).
 *
 * FIXTURES ONLY — injected home/appSupport tmp dirs; the real machine is
 * never touched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { registerTasks, verifyTasks, TASK_CADENCE } from '../../../src/cli/tasks-register.js';
import { CANONICAL_TASK_NAMES, RETIRED_CANONICAL_TASK_NAMES, scopedTaskName } from '../../../src/cli/task-scoping.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

describe('core-cli.tasks-register: register → verify → wipe → detect → heal', () => {
  let root: string;
  let home: string;
  let appSupport: string;
  let registryFile: string;
  const opts = () => ({ projectRoot: root, home, appSupportDir: appSupport });

  beforeAll(() => {
    root = makeTmpDir('tr-slice-root');
    home = makeTmpDir('tr-slice-home');
    appSupport = makeTmpDir('tr-slice-appsupport');
    registryFile = path.join(appSupport, 'claude-code-sessions', 'u1', 'u2', 'scheduled-tasks.json');
    fs.mkdirSync(path.dirname(registryFile), { recursive: true });
    fs.writeFileSync(
      registryFile,
      JSON.stringify(
        {
          scheduledTasks: [
            { id: 'someone-elses-task', cronExpression: '0 8 * * *', enabled: true, filePath: '/nope', appExtra: 1 },
            // A stale entry from before the v3 roster: this project's retired deep-refresh.
            { id: scopedTaskName(root, 'cortex-loop-anatomy-refresh-deep'), cronExpression: '0 1 * * *', enabled: true },
          ],
          recordedSkips: {},
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
    // A stale retired payload dir the roster refresh must retire.
    const retiredDir = path.join(home, '.claude', 'scheduled-tasks', scopedTaskName(root, 'cortex-loop-anatomy-refresh-deep'));
    fs.mkdirSync(retiredDir, { recursive: true });
    fs.writeFileSync(path.join(retiredDir, 'SKILL.md'), '---\nname: stale\n---\n', 'utf-8');
  });

  afterAll(() => {
    cleanTmp(root);
    cleanTmp(home);
    cleanTmp(appSupport);
  });

  it('register writes the full slice: payloads on disk, registry entries pointing at them, retired gone everywhere', () => {
    const r = registerTasks(opts());
    expect(r.exitCode).toBe(0);

    // Payloads: 5 scoped bundle dirs, retired dir removed.
    const base = path.join(home, '.claude', 'scheduled-tasks');
    const expectedDirs = Object.values(CANONICAL_TASK_NAMES).map((c) => scopedTaskName(root, c)).sort();
    expect(fs.readdirSync(base).sort()).toEqual(expectedDirs);
    for (const retired of RETIRED_CANONICAL_TASK_NAMES) {
      expect(fs.existsSync(path.join(base, scopedTaskName(root, retired)))).toBe(false);
    }

    // Registry: foreign preserved, retired entry gone, each own entry backed by a real payload with the table cadence.
    const reg = JSON.parse(fs.readFileSync(registryFile, 'utf-8'));
    const entries: Record<string, unknown>[] = reg.scheduledTasks;
    expect(entries.find((e) => e['id'] === 'someone-elses-task')).toEqual({
      id: 'someone-elses-task',
      cronExpression: '0 8 * * *',
      enabled: true,
      filePath: '/nope',
      appExtra: 1,
    });
    expect(entries.some((e) => e['id'] === scopedTaskName(root, 'cortex-loop-anatomy-refresh-deep'))).toBe(false);
    for (const canonical of Object.values(CANONICAL_TASK_NAMES)) {
      const entry = entries.find((e) => e['id'] === scopedTaskName(root, canonical))!;
      expect(fs.existsSync(entry['filePath'] as string), canonical).toBe(true);
      expect(entry['cronExpression']).toBe(TASK_CADENCE[canonical]);
    }
  });

  it('verify passes on the registered slice', () => {
    const v = verifyTasks(opts());
    expect(v.exitCode).toBe(0);
    expect(v.output).toContain('All 5 Cortex bundles registered');
  });

  it('an app-update wipe (#49276) is detected by verify and healed by re-register', () => {
    // Simulate the wipe: the app rewrites its registry without Cortex entries.
    fs.writeFileSync(registryFile, JSON.stringify({ scheduledTasks: [], recordedSkips: {} }, null, 2) + '\n', 'utf-8');

    const v1 = verifyTasks(opts());
    expect(v1.exitCode).toBe(1);
    expect(v1.output).toContain('5 of 5');

    const r = registerTasks(opts());
    expect(r.exitCode).toBe(0);
    const v2 = verifyTasks(opts());
    expect(v2.exitCode).toBe(0);
  });
});
