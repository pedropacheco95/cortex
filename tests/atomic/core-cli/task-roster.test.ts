/**
 * Atomic tests for core-cli.tasks-register Rules 8, 11, 12, 13, 15, 16, 19 and
 * core-cli.task-scoping's 4.0 rename: which roster a project is on and what
 * each verb does there.
 *
 * FIXTURES ONLY: every path is an injected tmp dir.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  HEARTBEAT_USAGE,
  NOT_ACCEPTED_MESSAGE,
  REGISTER_APP_RUNNING_MESSAGE,
  heartbeatTask,
  planTasks,
  registerTasks,
  registrationStatus,
  tasksPlan,
  verifyTasks,
} from '../../../src/cli/tasks-register.js';
import { scopedTaskName, taskRoster, tasksRename } from '../../../src/cli/task-scoping.js';
import { INSTALLED_MARKER_FILENAME, readInstalledMarker, sha256Hex } from '../../../src/cli/scaffold.js';
import { validateStore } from '../../../src/store/validate.js';
import { expiredItems } from '../../../src/store/freshness.js';
import { loadStore } from '../../../src/store/layout.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { acceptedProject, installRequiredSkills, unacceptedProject, writeStoreConfig } from '../../fixtures/task-store.js';

const dirs: string[] = [];
const BUNDLES = ['daily', 'monthly-review', 'test-runner', 'weekly-curation', 'weekly-quality'];

function fixture(setup: (root: string) => void = acceptedProject): {
  root: string; home: string; appSupport: string; registry: string;
  opts: { projectRoot: string; home: string; appSupportDir: string };
} {
  const root = makeTmpDir('roster-root');
  const home = makeTmpDir('roster-home');
  const appSupport = makeTmpDir('roster-app');
  dirs.push(root, home, appSupport);
  setup(root);
  const registry = path.join(appSupport, 'claude-code-sessions', 'a', 'b', 'scheduled-tasks.json');
  fs.mkdirSync(path.dirname(registry), { recursive: true });
  fs.writeFileSync(registry, '{"scheduledTasks":[]}\n', 'utf-8');
  return { root, home, appSupport, registry, opts: { projectRoot: root, home, appSupportDir: appSupport } };
}

const readEntries = (file: string): Record<string, unknown>[] =>
  JSON.parse(fs.readFileSync(file, 'utf-8')).scheduledTasks;

afterEach(() => {
  for (const d of dirs.splice(0)) cleanTmp(d);
});

describe('An unaccepted store stays on the 3.x roster', () => {
  it('plan and verify read the five bundles; register and heartbeat refuse and write nothing', () => {
    const fx = fixture(unacceptedProject);
    const plan = planTasks(fx.opts);
    expect(plan.taskCount).toBe(5);
    expect(plan.tasks.map((t) => t.canonical).sort()).toEqual(BUNDLES);
    const v = verifyTasks(fx.opts);
    for (const b of BUNDLES) expect(v.output).toContain(b);

    const before = fs.readFileSync(fx.registry, 'utf-8');
    const r = registerTasks(fx.opts);
    expect(r.exitCode).toBe(1);
    expect(r.output).toBe(NOT_ACCEPTED_MESSAGE);
    const h = heartbeatTask({ projectRoot: fx.root, task: 'learn', today: '2026-11-04' });
    expect(h.exitCode).toBe(1);
    expect(h.output).toBe(NOT_ACCEPTED_MESSAGE);
    expect(fs.readFileSync(fx.registry, 'utf-8')).toBe(before);
    expect(fs.existsSync(path.join(fx.home, '.claude'))).toBe(false);
    expect(fs.existsSync(path.join(fx.root, 'cortex', 'now'))).toBe(false);
  });

  it("a 3.x project's plan --json keeps the shape its own copy of the skill reads, and verify points at that skill", () => {
    const fx = fixture(unacceptedProject);
    const plan = JSON.parse(tasksPlan(fx.opts, true).output);
    expect(Object.keys(plan).sort()).toEqual(['planVersion', 'projectRoot', 'taskCount', 'tasks']);
    expect(Object.keys(plan.tasks[0]).sort()).toEqual(
      ['canonical', 'cronExpression', 'cwd', 'description', 'enabled', 'id', 'model', 'payloadPath', 'permissionMode', 'useWorktree'],
    );
    expect(plan.tasks.find((t: { canonical: string }) => t.canonical === 'weekly-curation')).toMatchObject({
      id: scopedTaskName(fx.root, 'weekly-curation'), cronExpression: '0 4 * * 6', model: 'claude-opus-4-8',
    });
    const last = verifyTasks(fx.opts).output.trim().split('\n').pop()!;
    expect(last).toContain('/cortex-register-tasks');
    expect(last).not.toContain('cortex tasks register');
  });

  it('the Rule 13 message is exact', () => {
    expect(NOT_ACCEPTED_MESSAGE).toBe('this project has no 4.0 tasks until its store is accepted (cortex migrate --accept)');
  });

  it('a fresh 4.0 store with no migration field gets the three tasks', () => {
    const fx = fixture((root) => writeStoreConfig(root));
    expect(taskRoster(fx.root)).toBe('store-v4');
    expect(planTasks(fx.opts).tasks.map((t) => t.canonical)).toEqual(['learn', 'fresh', 'quality']);
  });

  it('no migration field beside .cortex/cortex.config.json stays on the 3.x roster', () => {
    const fx = fixture((root) => {
      writeStoreConfig(root);
      fs.mkdirSync(path.join(root, '.cortex'), { recursive: true });
      fs.writeFileSync(path.join(root, '.cortex', 'cortex.config.json'), '{}\n', 'utf-8');
    });
    expect(taskRoster(fx.root)).toBe('3x');
    expect(planTasks(fx.opts).taskCount).toBe(5);
  });

  it('a project with no store, or an unreadable one, is on the 3.x roster', () => {
    expect(taskRoster(fixture(() => undefined).root)).toBe('3x');
    const fx = fixture((root) => {
      fs.mkdirSync(path.join(root, 'cortex'), { recursive: true });
      fs.writeFileSync(path.join(root, 'cortex', 'cortex.json'), 'not json', 'utf-8');
    });
    expect(taskRoster(fx.root)).toBe('3x');
  });

  it('an accepted store is on the 4.0 roster', () => {
    expect(taskRoster(fixture().root)).toBe('store-v4');
  });
});

describe('Plan output shape', () => {
  it('carries planVersion 3 and the three scoped entries', () => {
    const fx = fixture();
    const plan = planTasks(fx.opts);
    expect(plan.planVersion).toBe(3);
    expect(plan.projectRoot).toBe(path.resolve(fx.root));
    expect(plan.taskCount).toBe(3);
    const crons: Record<string, [string, string]> = {
      learn: ['0 2 * * *', 'claude-opus-5-5'],
      fresh: ['0 4 * * 6', 'claude-sonnet-5-5'],
      quality: ['0 4 * * 0', 'claude-sonnet-5-5'],
    };
    for (const t of plan.tasks) {
      expect(t.id).toBe(scopedTaskName(fx.root, t.canonical));
      expect([t.cronExpression, t.model]).toEqual(crons[t.canonical]);
      expect(t.cwd).toBe(path.resolve(fx.root));
      expect(t.enabled).toBe(true);
      expect(t.useWorktree).toBe(false);
      expect(t.payloadPath).toBe(path.join(fx.home, '.claude', 'scheduled-tasks', t.id, 'SKILL.md'));
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('the text form names every scoped id with cron, model and payload path, and writes nothing', () => {
    const fx = fixture();
    const out = tasksPlan(fx.opts, false).output;
    for (const t of planTasks(fx.opts).tasks) {
      for (const s of [t.id, t.cronExpression, t.model, t.payloadPath]) expect(out).toContain(s);
    }
    expect(fs.existsSync(path.join(fx.home, '.claude'))).toBe(false);
  });
});

describe('Messages give the typed command', () => {
  it('plan, verify with a task missing, and register with the app running name /cortex-register-tasks', () => {
    const fx = fixture();
    const outs = [
      tasksPlan(fx.opts, false).output,
      verifyTasks(fx.opts).output,
      registerTasks({ ...fx.opts, isDesktopAppRunning: () => true }).output,
    ];
    for (const o of outs) {
      expect(o).toContain('/cortex-register-tasks');
      expect(o).not.toContain('run cortex-register-tasks');
    }
  });
});

describe('Register guard: refused while the Desktop app runs', () => {
  it('prints the exact Rule 11 line and writes nothing', () => {
    const fx = fixture();
    const before = fs.readFileSync(fx.registry, 'utf-8');
    const r = registerTasks({ ...fx.opts, isDesktopAppRunning: () => true });
    expect(r.exitCode).toBe(1);
    expect(r.output).toBe(REGISTER_APP_RUNNING_MESSAGE);
    expect(REGISTER_APP_RUNNING_MESSAGE).toBe(
      'Scheduled tasks not registered: the Claude Desktop app is open and would overwrite or wipe the registry. Type /cortex-register-tasks in a Desktop session, or quit the app and run cortex tasks register.',
    );
    expect(fs.readFileSync(fx.registry, 'utf-8')).toBe(before);
    expect(fs.readdirSync(path.dirname(fx.registry))).toEqual(['scheduled-tasks.json']);
    expect(fs.existsSync(path.join(fx.home, '.claude'))).toBe(false);
  });
});

describe('A missing required skill stops register', () => {
  it('exits 1 naming specflow-review, before any write', () => {
    const fx = fixture((root) => {
      writeStoreConfig(root, { accepted: '2026-11-05' });
      installRequiredSkills(root, ['specflow-review']);
    });
    const before = fs.readFileSync(fx.registry, 'utf-8');
    const r = registerTasks(fx.opts);
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain('specflow-review');
    expect(fs.readFileSync(fx.registry, 'utf-8')).toBe(before);
    expect(fs.existsSync(path.join(fx.home, '.claude'))).toBe(false);
  });
});

describe('Register leaves no payload without a marker', () => {
  it('each payload dir holds a marker with the hash of its SKILL.md', () => {
    const fx = fixture();
    expect(registerTasks(fx.opts).exitCode).toBe(0);
    for (const t of planTasks(fx.opts).tasks) {
      const md = fs.readFileSync(t.payloadPath, 'utf-8');
      const marker = readInstalledMarker(path.join(path.dirname(t.payloadPath), INSTALLED_MARKER_FILENAME));
      expect(marker?.sha256).toBe(sha256Hex(md));
    }
  });
});

describe('Retired scoped entries are removed', () => {
  it('drops a 3.x bundle entry and its payload dir, this project only', () => {
    const fx = fixture();
    const own = scopedTaskName(fx.root, 'weekly-curation');
    const ownHash = `${own.replace('-weekly-curation', '')}-abc123-other`;
    const foreign = { id: own, cwd: '/some/other/project', enabled: true };
    const entries = [{ id: scopedTaskName(fx.root, 'daily'), cwd: path.resolve(fx.root), enabled: true }, foreign, { id: ownHash, enabled: true }];
    fs.writeFileSync(fx.registry, JSON.stringify({ scheduledTasks: entries }) + '\n', 'utf-8');
    const dir = path.join(fx.home, '.claude', 'scheduled-tasks', scopedTaskName(fx.root, 'daily'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `<!-- cortex-project-root: ${path.resolve(fx.root)} -->\n`, 'utf-8');

    expect(registerTasks(fx.opts).exitCode).toBe(0);

    const ids = readEntries(fx.registry).map((e) => e['id']);
    expect(ids).not.toContain(scopedTaskName(fx.root, 'daily'));
    expect(ids).toContain(own);
    expect(ids).toContain(ownHash);
    for (const t of ['learn', 'fresh', 'quality']) expect(ids).toContain(scopedTaskName(fx.root, t));
    expect(fs.existsSync(dir)).toBe(false);
  });
});

describe('Two same-named projects do not collide', () => {
  it('the second to register takes hash-scoped names with zero overwrites', () => {
    const base = makeTmpDir('roster-two');
    dirs.push(base);
    const home = makeTmpDir('roster-two-home');
    dirs.push(home);
    const a = fixture();
    const roots = ['work', 'personal'].map((n) => path.join(base, n, 'api'));
    for (const r of roots) {
      fs.mkdirSync(r, { recursive: true });
      acceptedProject(r);
    }
    const appSupportDir = a.appSupport;
    expect(registerTasks({ projectRoot: roots[0]!, home, appSupportDir }).exitCode).toBe(0);
    const first = planTasks({ projectRoot: roots[0]!, home }).tasks;
    const firstBytes = first.map((t) => fs.readFileSync(t.payloadPath, 'utf-8'));
    expect(registerTasks({ projectRoot: roots[1]!, home, appSupportDir }).exitCode).toBe(0);
    const second = planTasks({ projectRoot: roots[1]!, home }).tasks;
    expect(second.every((t) => first.every((f) => f.id !== t.id))).toBe(true);
    for (const t of second) expect(fs.existsSync(t.payloadPath), t.id).toBe(true);
    expect(first.map((t) => fs.readFileSync(t.payloadPath, 'utf-8'))).toEqual(firstBytes);
    expect(readEntries(a.registry)).toHaveLength(6);
  });
});

describe('Verify', () => {
  it('reports all three ok after register', () => {
    const fx = fixture();
    registerTasks(fx.opts);
    const v = verifyTasks(fx.opts);
    expect(v.exitCode).toBe(0);
    for (const t of ['learn', 'fresh', 'quality']) expect(v.output).toContain(`ok   ${t}`);
  });

  it('names each failure', () => {
    const fx = fixture();
    registerTasks(fx.opts);
    const e = readEntries(fx.registry);
    const learn = scopedTaskName(fx.root, 'learn');
    const fresh = scopedTaskName(fx.root, 'fresh');
    const kept = e.filter((x) => x['id'] !== learn).map((x) => (x['id'] === fresh ? { ...x, enabled: false } : { ...x, filePath: '/gone/SKILL.md' }));
    fs.writeFileSync(fx.registry, JSON.stringify({ scheduledTasks: kept }) + '\n', 'utf-8');
    const v = verifyTasks(fx.opts);
    expect(v.exitCode).not.toBe(0);
    expect(v.output).toContain('FAIL learn: not registered');
    expect(v.output).toContain('FAIL fresh: registered but disabled');
    expect(v.output).toContain('FAIL quality: registered but payload missing');
  });

  it('reports cron and model drift without failing', () => {
    const fx = fixture();
    registerTasks(fx.opts);
    const e = readEntries(fx.registry).map((x) => ({ ...x, cronExpression: '1 1 * * *', model: 'other-model' }));
    fs.writeFileSync(fx.registry, JSON.stringify({ scheduledTasks: e }) + '\n', 'utf-8');
    const v = verifyTasks(fx.opts);
    expect(v.exitCode).toBe(0);
    expect(v.output).toContain('[cron drifted: expected "0 2 * * *"]');
    expect(v.output).toContain('[model drifted: expected "claude-opus-5-5"]');
  });

  it('Verify failure points at quitting the app: the last line names both routes', () => {
    const fx = fixture();
    const last = verifyTasks(fx.opts).output.trim().split('\n').pop()!;
    expect(last).toContain('/cortex-register-tasks');
    expect(last).toContain('quit the Desktop app and run `cortex tasks register`');
  });
});

describe('Registration status follows the roster', () => {
  it('counts the three on the 4.0 roster', () => {
    const fx = fixture();
    registerTasks(fx.opts);
    const quality = scopedTaskName(fx.root, 'quality');
    const e = readEntries(fx.registry).filter((x) => x['id'] !== quality);
    fs.writeFileSync(fx.registry, JSON.stringify({ scheduledTasks: e }) + '\n', 'utf-8');
    const before = fs.readFileSync(fx.registry, 'utf-8');
    expect(registrationStatus(fx.opts)).toEqual({ registryFound: true, unregistered: ['quality'], total: 3 });
    expect(fs.readFileSync(fx.registry, 'utf-8')).toBe(before);
  });

  it('no registry counts all three as unregistered', () => {
    const fx = fixture();
    fs.rmSync(fx.registry);
    expect(registrationStatus(fx.opts)).toEqual({ registryFound: false, unregistered: ['learn', 'fresh', 'quality'], total: 3 });
  });

  it('a project on the 3.x roster reports five bundle names', () => {
    const fx = fixture(unacceptedProject);
    const s = registrationStatus(fx.opts);
    expect(s.total).toBe(5);
    expect([...s.unregistered].sort()).toEqual(BUNDLES);
  });
});

describe('Heartbeat creates, replaces, and leaves the others alone', () => {
  it('holds one item per task, with valid frontmatter', () => {
    const fx = fixture();
    const beat = (task: string, today: string): void => {
      expect(heartbeatTask({ projectRoot: fx.root, task, today }).exitCode).toBe(0);
    };
    beat('learn', '2026-11-04');
    beat('fresh', '2026-11-04');
    const file = path.join(fx.root, 'cortex', 'now', 'cortex-tasks.md');
    const freshBlock = /## fresh last ran[\s\S]*$/.exec(fs.readFileSync(file, 'utf-8'))![0];
    beat('learn', '2026-11-05');
    const text = fs.readFileSync(file, 'utf-8');
    expect(text.match(/## learn last ran/g)).toHaveLength(1);
    expect(text).toContain('## learn last ran 2026-11-05\nuntil: 2026-11-08\n');
    expect(text).toContain('## fresh last ran 2026-11-04\nuntil: 2026-11-12\n');
    expect(text).toContain(freshBlock);
    expect(text).toContain('about: When each scheduled task last ran');
    expect(text).toContain('permanence: volatile');
    expect(text).toContain('origin: person:cortex-tasks@2026-11-04');
    const errors = validateStore(fx.root, '2026-11-05').findings.filter((f) => f.path === 'now/cortex-tasks.md' && f.level === 'error');
    expect(errors).toEqual([]);
  });

  it('A missed run surfaces as an expired item', () => {
    const fx = fixture();
    heartbeatTask({ projectRoot: fx.root, task: 'learn', today: '2026-11-05' });
    const items = expiredItems(loadStore(fx.root), '2026-11-09');
    expect(items.map((i) => i.item.title)).toEqual(['learn last ran 2026-11-05']);
  });

  it('an unknown task exits 2 with the usage line', () => {
    const fx = fixture();
    const r = heartbeatTask({ projectRoot: fx.root, task: 'daily', today: '2026-11-05' });
    expect(r.exitCode).toBe(2);
    expect(r.output).toBe(HEARTBEAT_USAGE);
    expect(HEARTBEAT_USAGE).toBe('Usage: cortex tasks <collect|heartbeat> <learn|fresh|quality>');
  });
});

describe('Rename moves nothing on a 4.0 store', () => {
  it('prints the line, exits 0 and leaves the legacy dir', () => {
    const fx = fixture();
    const legacy = path.join(fx.home, '.claude', 'scheduled-tasks', 'hygiene');
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, 'SKILL.md'), '---\nname: hygiene\n---\n', 'utf-8');
    const r = tasksRename(fx.home, fx.root);
    expect(r.exitCode).toBe(0);
    expect(r.output).toBe('Nothing to rename: cortex tasks register removes retired tasks.');
    expect(fs.existsSync(legacy)).toBe(true);
  });
});
