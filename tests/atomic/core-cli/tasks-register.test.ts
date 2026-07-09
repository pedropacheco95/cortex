/**
 * Atomic tests for core-cli.tasks-register — cadence-table shape, registry
 * discovery, upsert mechanics (foreign preservation, unknown-field survival,
 * createdAt, retirement), backup + idempotency, and verify exit codes.
 *
 * FIXTURES ONLY: every path (home, appSupportDir, project root) is an
 * injected tmp dir — the real ~/Library and ~/.claude are never touched.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  TASK_CADENCE,
  TASK_PERMISSION_MODE,
  TASK_PLAN_VERSION,
  discoverRegistryFiles,
  planTasks,
  tasksPlan,
  registerTasks,
  registrationStatus,
  verifyTasks,
} from '../../../src/cli/tasks-register.js';
import { CANONICAL_TASK_NAMES, scopedTaskName } from '../../../src/cli/task-scoping.js';
import { SCHEDULED_TASKS } from '../../../src/cli/templates.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

const CANONICALS = Object.values(CANONICAL_TASK_NAMES);

/** The five daily canonicals (cron day fields are all `*`). */
const DAILIES = Object.entries(TASK_CADENCE)
  .filter(([, cron]) => cron.split(' ').slice(2).join(' ') === '* * *')
  .map(([name]) => name);

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Two foreign registry entries with EXTRA unknown fields (one is another project's Cortex task). */
function foreignEntries(): Record<string, unknown>[] {
  return [
    {
      id: 'user-morning-brief',
      cronExpression: '0 9 * * *',
      enabled: true,
      filePath: '/Users/someone/.claude/scheduled-tasks/user-morning-brief/SKILL.md',
      createdAt: 1751000000000,
      cwd: '/Users/someone/proj',
      useWorktree: true,
      permissionMode: 'default',
      lastRunAt: 1751400000000, // unknown to Cortex
      runHistory: [{ at: 1751400000000, ok: true }], // unknown to Cortex
    },
    {
      id: scopedTaskName('/some/other/project', 'cortex-pulse-hygiene'),
      cronExpression: '15 2 * * *',
      enabled: false,
      filePath: '/some/other/.claude/scheduled-tasks/x/SKILL.md',
      mysteryField: 'keep-me', // unknown to Cortex
    },
  ];
}

interface Fixture {
  root: string;
  home: string;
  appSupport: string;
  registryFile: string;
}

function makeFixture(label: string, registry?: unknown): Fixture {
  const root = makeTmpDir(`tr-${label}-root`);
  const home = makeTmpDir(`tr-${label}-home`);
  const appSupport = makeTmpDir(`tr-${label}-appsupport`);
  const registryFile = path.join(appSupport, 'claude-code-sessions', 'uuid-aaaa', 'uuid-bbbb', 'scheduled-tasks.json');
  if (registry !== undefined) {
    fs.mkdirSync(path.dirname(registryFile), { recursive: true });
    fs.writeFileSync(
      registryFile,
      typeof registry === 'string' ? registry : JSON.stringify(registry, null, 2) + '\n',
      'utf-8',
    );
  }
  return { root, home, appSupport, registryFile };
}

function cleanFixture(fx: Fixture): void {
  cleanTmp(fx.root);
  cleanTmp(fx.home);
  cleanTmp(fx.appSupport);
}

function defaultRegistry(): Record<string, unknown> {
  return {
    schemaVersion: 1, // unknown top-level key — must survive
    scheduledTasks: foreignEntries(),
    recordedSkips: { 'user-morning-brief': [1751300000000] },
  };
}

function readRegistry(file: string): { scheduledTasks: Record<string, unknown>[] } & Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function backups(file: string): string[] {
  return fs.readdirSync(path.dirname(file)).filter((f) => f.includes('.cortex-backup-'));
}

const opts = (fx: Fixture) => ({ projectRoot: fx.root, home: fx.home, appSupportDir: fx.appSupport });

// ---------------------------------------------------------------------------
// TASK_CADENCE — the cadence table as data
// ---------------------------------------------------------------------------
describe('TASK_CADENCE: fourteen entries, collision-free', () => {
  it('has exactly the fourteen §9.1 canonical names as keys', () => {
    expect(Object.keys(TASK_CADENCE).sort()).toEqual([...CANONICALS].sort());
  });

  it('every value is a five-field cron expression', () => {
    for (const [name, cron] of Object.entries(TASK_CADENCE)) {
      expect(cron.split(' '), name).toHaveLength(5);
    }
  });

  it('finds five dailies with no duplicate minute-of-day among them', () => {
    expect(DAILIES.sort()).toEqual(
      [
        'cortex-pulse-hygiene',
        'cortex-loop-bug-triage',
        'cortex-loop-spec-drift',
        'cortex-loop-insight-refresh-daily',
        'cortex-loop-session-observe',
      ].sort(),
    );
    const minutes = DAILIES.map((d) => TASK_CADENCE[d]!.split(' ').slice(0, 2).join(':'));
    expect(new Set(minutes).size).toBe(DAILIES.length);
  });

  it('no two tasks share an identical cron expression at all', () => {
    const crons = Object.values(TASK_CADENCE);
    expect(new Set(crons).size).toBe(crons.length);
  });
});

// ---------------------------------------------------------------------------
// discoverRegistryFiles
// ---------------------------------------------------------------------------
describe('discoverRegistryFiles: glob under claude-code-sessions/', () => {
  it('finds nested registry files and sorts newest-modified first', () => {
    const fx = makeFixture('disc', defaultRegistry());
    try {
      const older = path.join(fx.appSupport, 'claude-code-sessions', 'uuid-old', 'uuid-old2', 'scheduled-tasks.json');
      fs.mkdirSync(path.dirname(older), { recursive: true });
      fs.writeFileSync(older, '{"scheduledTasks":[]}', 'utf-8');
      fs.utimesSync(older, new Date('2020-01-01'), new Date('2020-01-01'));
      const found = discoverRegistryFiles(fx.appSupport);
      expect(found).toEqual([fx.registryFile, older]);
    } finally {
      cleanFixture(fx);
    }
  });

  it('returns [] when nothing exists (missing dir included)', () => {
    const fx = makeFixture('disc-none');
    try {
      expect(discoverRegistryFiles(fx.appSupport)).toEqual([]);
    } finally {
      cleanFixture(fx);
    }
  });
});

// ---------------------------------------------------------------------------
// registerTasks — upsert mechanics
// ---------------------------------------------------------------------------
describe('registerTasks: upsert into the app registry', () => {
  it('adds the fourteen owned entries with every owned field set', () => {
    const fx = makeFixture('add', defaultRegistry());
    try {
      const r = registerTasks(opts(fx));
      expect(r.exitCode).toBe(0);
      const reg = readRegistry(fx.registryFile);
      expect(reg.scheduledTasks).toHaveLength(2 + 14);
      for (const canonical of CANONICALS) {
        const id = scopedTaskName(fx.root, canonical);
        const entry = reg.scheduledTasks.find((e) => e['id'] === id);
        expect(entry, canonical).toBeDefined();
        expect(entry!['cronExpression']).toBe(TASK_CADENCE[canonical]);
        expect(entry!['enabled']).toBe(true);
        expect(entry!['filePath']).toBe(path.join(fx.home, '.claude', 'scheduled-tasks', id, 'SKILL.md'));
        expect(fs.existsSync(entry!['filePath'] as string), `payload for ${canonical}`).toBe(true);
        expect(entry!['cwd']).toBe(path.resolve(fx.root));
        expect(entry!['useWorktree']).toBe(false);
        expect(entry!['permissionMode']).toBe(TASK_PERMISSION_MODE);
        expect(typeof entry!['createdAt']).toBe('number');
      }
      expect(r.output).toMatch(/14 added, 0 updated/);
    } finally {
      cleanFixture(fx);
    }
  });

  it('preserves both foreign entries (unknown fields included), recordedSkips, and unknown top-level keys structurally byte-identically', () => {
    const fx = makeFixture('foreign', defaultRegistry());
    try {
      registerTasks(opts(fx));
      const reg = readRegistry(fx.registryFile);
      const expected = foreignEntries();
      for (const orig of expected) {
        const kept = reg.scheduledTasks.find((e) => e['id'] === orig['id']);
        // Structural byte-identity: same fields, same values, same key order.
        expect(JSON.stringify(kept)).toBe(JSON.stringify(orig));
      }
      expect(reg['recordedSkips']).toEqual({ 'user-morning-brief': [1751300000000] });
      expect(reg['schemaVersion']).toBe(1);
    } finally {
      cleanFixture(fx);
    }
  });

  it('creates a backup holding the pre-write bytes, and writes the payload roster first', () => {
    const fx = makeFixture('backup', defaultRegistry());
    try {
      const before = fs.readFileSync(fx.registryFile, 'utf-8');
      registerTasks(opts(fx));
      const b = backups(fx.registryFile);
      expect(b).toHaveLength(1);
      expect(b[0]).toMatch(/^scheduled-tasks\.json\.cortex-backup-/);
      expect(fs.readFileSync(path.join(path.dirname(fx.registryFile), b[0]!), 'utf-8')).toBe(before);
      // Payload roster: all 14 scoped dirs exist in the fake home.
      const base = path.join(fx.home, '.claude', 'scheduled-tasks');
      expect(fs.readdirSync(base).sort()).toEqual(CANONICALS.map((c) => scopedTaskName(fx.root, c)).sort());
    } finally {
      cleanFixture(fx);
    }
  });

  it('is idempotent: a second run changes nothing, adds no backup, and says so', () => {
    const fx = makeFixture('idem', defaultRegistry());
    try {
      registerTasks(opts(fx));
      const after1 = fs.readFileSync(fx.registryFile, 'utf-8');
      const r2 = registerTasks(opts(fx));
      expect(r2.exitCode).toBe(0);
      expect(fs.readFileSync(fx.registryFile, 'utf-8')).toBe(after1);
      expect(backups(fx.registryFile)).toHaveLength(1);
      expect(r2.output).toContain('already up to date');
    } finally {
      cleanFixture(fx);
    }
  });

  it('updates an existing own entry in place: owned fields corrected, createdAt and unknown fields preserved, no duplicate', () => {
    const fx = makeFixture('update');
    const id = scopedTaskName(fx.root, 'cortex-pulse-hygiene');
    const registry = defaultRegistry();
    (registry['scheduledTasks'] as unknown[]).push({
      id,
      cronExpression: '59 23 * * *', // stale
      enabled: false, // wrong
      filePath: '/stale/path/SKILL.md',
      createdAt: 111, // must survive
      appOnlyField: 'must-survive', // unknown to Cortex
    });
    fs.mkdirSync(path.dirname(fx.registryFile), { recursive: true });
    fs.writeFileSync(fx.registryFile, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
    try {
      const r = registerTasks(opts(fx));
      const reg = readRegistry(fx.registryFile);
      const matches = reg.scheduledTasks.filter((e) => e['id'] === id);
      expect(matches).toHaveLength(1);
      const entry = matches[0]!;
      expect(entry['cronExpression']).toBe(TASK_CADENCE['cortex-pulse-hygiene']);
      expect(entry['enabled']).toBe(true);
      expect(entry['createdAt']).toBe(111);
      expect(entry['appOnlyField']).toBe('must-survive');
      expect(r.output).toMatch(/13 added, 1 updated/);
    } finally {
      cleanFixture(fx);
    }
  });

  it("removes this project's retired scoped entries but never another project's", () => {
    const fx = makeFixture('retired');
    const ownRetired = scopedTaskName(fx.root, 'cortex-loop-anatomy-refresh-deep');
    const foreignRetired = scopedTaskName('/some/other/project', 'cortex-loop-anatomy-refresh-deep');
    const registry = defaultRegistry();
    (registry['scheduledTasks'] as unknown[]).push(
      { id: ownRetired, cronExpression: '0 1 * * *', enabled: true },
      { id: foreignRetired, cronExpression: '0 1 * * *', enabled: true },
    );
    fs.mkdirSync(path.dirname(fx.registryFile), { recursive: true });
    fs.writeFileSync(fx.registryFile, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
    try {
      registerTasks(opts(fx));
      const reg = readRegistry(fx.registryFile);
      expect(reg.scheduledTasks.some((e) => e['id'] === ownRetired)).toBe(false);
      expect(reg.scheduledTasks.some((e) => e['id'] === foreignRetired)).toBe(true);
      expect(reg.scheduledTasks).toHaveLength(2 + 1 + 14); // 2 foreign + foreign retired + own 14
    } finally {
      cleanFixture(fx);
    }
  });

  it('zero registry files → exit 1 naming the app as the registry creator; nothing created', () => {
    const fx = makeFixture('zero');
    try {
      const r = registerTasks(opts(fx));
      expect(r.exitCode).toBe(1);
      expect(r.output).toContain('created by the Claude Desktop app');
      expect(r.output).toContain('Cortex never creates the registry file');
      expect(discoverRegistryFiles(fx.appSupport)).toEqual([]);
    } finally {
      cleanFixture(fx);
    }
  });

  it('multiple registries → most-recently-modified wins, warning names the ignored one', () => {
    const fx = makeFixture('multi', defaultRegistry());
    try {
      const older = path.join(fx.appSupport, 'claude-code-sessions', 'uuid-old', 'uuid-old2', 'scheduled-tasks.json');
      fs.mkdirSync(path.dirname(older), { recursive: true });
      const olderBytes = '{\n  "scheduledTasks": []\n}\n';
      fs.writeFileSync(older, olderBytes, 'utf-8');
      fs.utimesSync(older, new Date('2020-01-01'), new Date('2020-01-01'));

      const r = registerTasks(opts(fx));
      expect(r.exitCode).toBe(0);
      expect(r.output).toContain('Warning: 2 registry files found');
      expect(r.output).toContain(older);
      expect(fs.readFileSync(older, 'utf-8')).toBe(olderBytes); // ignored file untouched
      expect(readRegistry(fx.registryFile).scheduledTasks).toHaveLength(16); // newest written
    } finally {
      cleanFixture(fx);
    }
  });

  it('malformed registry JSON → exit 1, file untouched, no backup', () => {
    const fx = makeFixture('bad', 'not json at all\n');
    try {
      const r = registerTasks(opts(fx));
      expect(r.exitCode).toBe(1);
      expect(r.output).toContain('not valid JSON');
      expect(fs.readFileSync(fx.registryFile, 'utf-8')).toBe('not json at all\n');
      expect(backups(fx.registryFile)).toHaveLength(0);
    } finally {
      cleanFixture(fx);
    }
  });
});

// ---------------------------------------------------------------------------
// verifyTasks — per-task report + exit codes
// ---------------------------------------------------------------------------
describe('verifyTasks: report and exit codes', () => {
  it('after register: all fourteen ok, exit 0', () => {
    const fx = makeFixture('vok', defaultRegistry());
    try {
      registerTasks(opts(fx));
      const v = verifyTasks(opts(fx));
      expect(v.exitCode).toBe(0);
      expect(v.output.split('\n').filter((l) => l.startsWith('ok   '))).toHaveLength(14);
      expect(v.output).toContain('All 14 Cortex tasks registered');
    } finally {
      cleanFixture(fx);
    }
  });

  it('missing, disabled, and dangling entries each fail with a named reason, exit 1', () => {
    const fx = makeFixture('vfail', defaultRegistry());
    try {
      registerTasks(opts(fx));
      const reg = readRegistry(fx.registryFile);
      const idMissing = scopedTaskName(fx.root, 'cortex-pulse-hygiene');
      const idDisabled = scopedTaskName(fx.root, 'cortex-pulse-distil');
      const idDangling = scopedTaskName(fx.root, 'cortex-loop-test-runner');
      reg.scheduledTasks = reg.scheduledTasks.filter((e) => e['id'] !== idMissing);
      for (const e of reg.scheduledTasks) {
        if (e['id'] === idDisabled) e['enabled'] = false;
        if (e['id'] === idDangling) e['filePath'] = path.join(fx.home, 'nope', 'SKILL.md');
      }
      fs.writeFileSync(fx.registryFile, JSON.stringify(reg, null, 2) + '\n', 'utf-8');

      const v = verifyTasks(opts(fx));
      expect(v.exitCode).toBe(1);
      expect(v.output).toContain('FAIL cortex-pulse-hygiene: not registered');
      expect(v.output).toContain('FAIL cortex-pulse-distil: registered but disabled');
      expect(v.output).toContain('FAIL cortex-loop-test-runner: registered but payload missing');
      expect(v.output).toContain('3 of 14');
    } finally {
      cleanFixture(fx);
    }
  });

  it('cron drift is reported but does not fail', () => {
    const fx = makeFixture('vdrift', defaultRegistry());
    try {
      registerTasks(opts(fx));
      const reg = readRegistry(fx.registryFile);
      const id = scopedTaskName(fx.root, 'cortex-loop-spec-drift');
      for (const e of reg.scheduledTasks) if (e['id'] === id) e['cronExpression'] = '7 7 * * *';
      fs.writeFileSync(fx.registryFile, JSON.stringify(reg, null, 2) + '\n', 'utf-8');

      const v = verifyTasks(opts(fx));
      expect(v.exitCode).toBe(0);
      expect(v.output).toContain(`[cron drifted: expected "${TASK_CADENCE['cortex-loop-spec-drift']}"]`);
    } finally {
      cleanFixture(fx);
    }
  });

  it('zero registries → exit 1 with the app-creates-it message', () => {
    const fx = makeFixture('vzero');
    try {
      const v = verifyTasks(opts(fx));
      expect(v.exitCode).toBe(1);
      expect(v.output).toContain('created by the Claude Desktop app');
    } finally {
      cleanFixture(fx);
    }
  });
});

// ---------------------------------------------------------------------------
// tasksPlan — the authoritative, read-only registration plan (Rule 10)
// ---------------------------------------------------------------------------
describe('tasksPlan: 14 entries, stable JSON shape, writes nothing', () => {
  it('planTasks emits all fourteen with every plan field populated', () => {
    const fx = makeFixture('plan');
    try {
      const plan = planTasks({ projectRoot: fx.root, home: fx.home });
      expect(plan.planVersion).toBe(TASK_PLAN_VERSION);
      expect(plan.projectRoot).toBe(path.resolve(fx.root));
      expect(plan.taskCount).toBe(14);
      expect(plan.tasks).toHaveLength(14);
      const byCanonical = new Map(plan.tasks.map((t) => [t.canonical, t]));
      for (const canonical of CANONICALS) {
        const t = byCanonical.get(canonical)!;
        expect(t, canonical).toBeDefined();
        expect(t.id).toBe(scopedTaskName(fx.root, canonical));
        expect(t.cronExpression).toBe(TASK_CADENCE[canonical]);
        expect(t.cwd).toBe(path.resolve(fx.root));
        expect(t.enabled).toBe(true);
        expect(t.useWorktree).toBe(false);
        expect(t.permissionMode).toBe(TASK_PERMISSION_MODE);
        expect(t.payloadPath).toBe(path.join(fx.home, '.claude', 'scheduled-tasks', t.id, 'SKILL.md'));
        expect(t.description.length).toBeGreaterThan(0);
      }
    } finally {
      cleanFixture(fx);
    }
  });

  it('--json output round-trips to the same stable machine shape', () => {
    const fx = makeFixture('plan-json');
    try {
      const r = tasksPlan({ projectRoot: fx.root, home: fx.home }, true);
      expect(r.exitCode).toBe(0);
      const parsed = JSON.parse(r.output);
      expect(parsed).toEqual(JSON.parse(JSON.stringify(planTasks({ projectRoot: fx.root, home: fx.home }))));
      expect(Object.keys(parsed).sort()).toEqual(['planVersion', 'projectRoot', 'taskCount', 'tasks']);
      expect(Object.keys(parsed.tasks[0]).sort()).toEqual(
        ['canonical', 'cronExpression', 'cwd', 'description', 'enabled', 'id', 'payloadPath', 'permissionMode', 'useWorktree'],
      );
    } finally {
      cleanFixture(fx);
    }
  });

  it('human output names every scoped id and points at the Desktop-session skill flow; nothing is written', () => {
    const fx = makeFixture('plan-human');
    try {
      const r = tasksPlan({ projectRoot: fx.root, home: fx.home }, false);
      expect(r.exitCode).toBe(0);
      for (const canonical of CANONICALS) {
        expect(r.output).toContain(scopedTaskName(fx.root, canonical));
      }
      expect(r.output).toContain('run cortex-register-tasks');
      expect(r.output).toContain('cortex tasks verify');
      // Read-only: no payload dirs, no registry, nothing under home.
      expect(fs.existsSync(path.join(fx.home, '.claude'))).toBe(false);
      expect(discoverRegistryFiles(fx.appSupport)).toEqual([]);
    } finally {
      cleanFixture(fx);
    }
  });
});

// ---------------------------------------------------------------------------
// register guard — refuses while the Desktop app runs (Rule 11)
// ---------------------------------------------------------------------------
describe('registerTasks guard: injected Desktop-app process check', () => {
  it('checker=true → exit 1 before any write: registry untouched, no backup, no payloads', () => {
    const fx = makeFixture('guard-on', defaultRegistry());
    try {
      const before = fs.readFileSync(fx.registryFile, 'utf-8');
      const r = registerTasks({ ...opts(fx), isDesktopAppRunning: () => true });
      expect(r.exitCode).toBe(1);
      expect(r.output).toContain('refused — the Claude Desktop app is running');
      expect(r.output).toContain('clobbered');
      expect(r.output).toContain('run cortex-register-tasks');
      expect(fs.readFileSync(fx.registryFile, 'utf-8')).toBe(before);
      expect(backups(fx.registryFile)).toHaveLength(0);
      expect(fs.existsSync(path.join(fx.home, '.claude', 'scheduled-tasks'))).toBe(false);
    } finally {
      cleanFixture(fx);
    }
  });

  it('checker=false → proceeds and registers normally', () => {
    const fx = makeFixture('guard-off', defaultRegistry());
    try {
      const r = registerTasks({ ...opts(fx), isDesktopAppRunning: () => false });
      expect(r.exitCode).toBe(0);
      expect(readRegistry(fx.registryFile).scheduledTasks).toHaveLength(2 + 14);
    } finally {
      cleanFixture(fx);
    }
  });
});

// ---------------------------------------------------------------------------
// registrationStatus — init's read-only summary check (Rule 12)
// ---------------------------------------------------------------------------
describe('registrationStatus: read-only registered-and-enabled check', () => {
  it('no registry (app never ran) → registryFound false, all fourteen unregistered', () => {
    const fx = makeFixture('rs-none');
    try {
      const s = registrationStatus(opts(fx));
      expect(s.registryFound).toBe(false);
      expect(s.total).toBe(14);
      expect(s.unregistered.sort()).toEqual([...CANONICALS].sort());
    } finally {
      cleanFixture(fx);
    }
  });

  it('after register → none unregistered; a disabled entry counts as unregistered', () => {
    const fx = makeFixture('rs-full', defaultRegistry());
    try {
      registerTasks(opts(fx));
      expect(registrationStatus(opts(fx)).unregistered).toEqual([]);
      const reg = readRegistry(fx.registryFile);
      const id = scopedTaskName(fx.root, 'cortex-pulse-hygiene');
      for (const e of reg.scheduledTasks) if (e['id'] === id) e['enabled'] = false;
      fs.writeFileSync(fx.registryFile, JSON.stringify(reg, null, 2) + '\n', 'utf-8');
      expect(registrationStatus(opts(fx)).unregistered).toEqual(['cortex-pulse-hygiene']);
    } finally {
      cleanFixture(fx);
    }
  });
});

// ---------------------------------------------------------------------------
// cortex-register-tasks skill — ships in both trees, drives the plan (Rule 12)
// ---------------------------------------------------------------------------
describe('cortex-register-tasks skill bundle', () => {
  const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const pkgSkill = path.join(REPO_ROOT, 'skills', 'cortex-register-tasks', 'SKILL.md');
  const localSkill = path.join(REPO_ROOT, '.claude', 'skills', 'cortex-register-tasks', 'SKILL.md');

  it('exists in both trees, byte-identical', () => {
    expect(fs.existsSync(pkgSkill)).toBe(true);
    expect(fs.existsSync(localSkill)).toBe(true);
    expect(fs.readFileSync(pkgSkill).equals(fs.readFileSync(localSkill))).toBe(true);
  });

  it('preflights the Desktop-only MCP tools, consumes the plan, and ends with verify', () => {
    const raw = fs.readFileSync(pkgSkill, 'utf-8');
    expect(raw).toContain('name: cortex-register-tasks');
    expect(raw).toContain('mcp__scheduled-tasks__create_scheduled_task');
    expect(raw).toContain('mcp__scheduled-tasks__update_scheduled_task');
    expect(raw).toContain('mcp__scheduled-tasks__list_scheduled_tasks');
    expect(raw).toContain('cortex tasks plan --json');
    expect(raw).toContain('cortex tasks verify');
    // Never invents prompt content; never edits the registry file itself.
    expect(raw).toContain('Do NOT invent instructions/prompt content');
    expect(raw).toMatch(/never write the app's `scheduled-tasks\.json`/i);
  });
});

// ---------------------------------------------------------------------------
// Roster sanity — the cadence table and SCHEDULED_TASKS stay in lock-step
// ---------------------------------------------------------------------------
describe('cadence table ↔ SCHEDULED_TASKS lock-step', () => {
  it('every SCHEDULED_TASKS entry maps to a cadence row via its canonical name', () => {
    for (const task of SCHEDULED_TASKS) {
      const canonical = CANONICAL_TASK_NAMES[task.name]!;
      expect(TASK_CADENCE[canonical], task.name).toBeDefined();
    }
    expect(SCHEDULED_TASKS).toHaveLength(14);
  });
});
