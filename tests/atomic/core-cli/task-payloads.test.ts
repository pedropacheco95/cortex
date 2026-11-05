/**
 * Atomic tests for core-cli.tasks-register Rules 7, 14 and 18: the cadence
 * table, the three 4.0 payloads, and `writeTaskPayloads`.
 *
 * FIXTURES ONLY: every path is an injected tmp dir.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { TASK_CADENCE, writeTaskPayloads } from '../../../src/cli/tasks-register.js';
import { SCHEDULED_TASKS, STORE_V4_TASKS, storeV4TaskSkillMd } from '../../../src/cli/templates.js';
import { scopedTaskName } from '../../../src/cli/task-scoping.js';
import { INSTALLED_MARKER_FILENAME, readInstalledMarker, sha256Hex, writeInstalledMarker } from '../../../src/cli/scaffold.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

const UNATTENDED = "This is an unattended run: the user can't answer during this run.";
const dirs: string[] = [];

function fixture(): { root: string; home: string; names: string[]; dir: (n: string) => string } {
  const root = makeTmpDir('payload-root');
  const home = makeTmpDir('payload-home');
  dirs.push(root, home);
  const names = STORE_V4_TASKS.map((t) => scopedTaskName(root, t.name));
  return { root, home, names, dir: (n) => path.join(home, '.claude', 'scheduled-tasks', n) };
}

/** Every file under `dir`, with its bytes, for byte-level before/after checks. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out[full] = fs.readFileSync(full, 'utf-8');
    }
  };
  walk(dir);
  return out;
}

function seed(dir: string, content: string, markerHash?: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf-8');
  if (markerHash !== undefined) writeInstalledMarker(path.join(dir, INSTALLED_MARKER_FILENAME), markerHash);
}

afterEach(() => {
  for (const d of dirs.splice(0)) cleanTmp(d);
});

describe('Cadence table shape', () => {
  it('has exactly learn, fresh and quality with their cron, model and heartbeat', () => {
    expect(TASK_CADENCE).toEqual({
      learn: { cron: '0 2 * * *', model: 'claude-opus-5-5', heartbeatDays: 3 },
      fresh: { cron: '0 4 * * 6', model: 'claude-sonnet-5-5', heartbeatDays: 8 },
      quality: { cron: '0 4 * * 0', model: 'claude-sonnet-5-5', heartbeatDays: 8 },
    });
  });
});

describe('3.x payloads are unchanged', () => {
  it('SCHEDULED_TASKS holds the five bundles and no entry names cortex-learn', () => {
    expect(SCHEDULED_TASKS.map((t) => t.name).sort()).toEqual(
      ['daily', 'monthly-review', 'test-runner', 'weekly-curation', 'weekly-quality'],
    );
    for (const t of SCHEDULED_TASKS) expect(t.body).not.toContain('cortex-learn');
  });
});

describe('Payloads dispatch one skill and state the run is unattended', () => {
  const SKILLS: Record<string, string> = { learn: 'cortex-learn', fresh: 'cortex-fresh', quality: 'cortex-quality' };

  it('each body carries the unattended line and its skill, and names no other skill', () => {
    expect(STORE_V4_TASKS.map((t) => t.name)).toEqual(['learn', 'fresh', 'quality']);
    for (const t of STORE_V4_TASKS) {
      expect(t.body).toContain(UNATTENDED);
      expect(t.body).toContain(SKILLS[t.name]);
      for (const other of Object.values(SKILLS).filter((s) => s !== SKILLS[t.name])) {
        expect(t.body).not.toContain(other);
      }
      expect(t.body).not.toContain('specflow-');
    }
  });

  it('requiredSkills matches Rule 14', () => {
    expect(Object.fromEntries(STORE_V4_TASKS.map((t) => [t.name, t.requiredSkills]))).toEqual({
      learn: ['cortex-learn', 'cortex-remember'],
      fresh: ['cortex-fresh', 'cortex-remember'],
      quality: ['cortex-quality', 'cortex-remember', 'specflow-review'],
    });
  });

  it('a payload holds its scoped name, its model, the ownership marker and no other procedure', () => {
    const t = STORE_V4_TASKS[0]!;
    const md = storeV4TaskSkillMd(t, 'proj-learn', '/abs/proj');
    expect(md).toContain('name: proj-learn');
    expect(md).toContain('model: claude-opus-5-5');
    expect(md).toContain('<!-- cortex-project-root: /abs/proj -->');
    expect(md).toContain(t.body);
    expect(md).not.toContain('.cortex/');
    expect(md).not.toContain('Ground rules');
  });

  it('the model of each task is the cadence table model', () => {
    for (const t of STORE_V4_TASKS) expect(t.model).toBe(TASK_CADENCE[t.name]!.model);
  });
});

describe('Writing payloads leaves the registry and old tasks alone', () => {
  it('writes the three with markers, keeps a retired dir, and never reads the registry', () => {
    const fx = fixture();
    const retired = fx.dir(scopedTaskName(fx.root, 'daily'));
    seed(retired, 'old bundle\n');
    const appSupport = makeTmpDir('payload-app');
    dirs.push(appSupport);
    const registry = path.join(appSupport, 'scheduled-tasks.json');
    fs.writeFileSync(registry, '{"scheduledTasks":[]}\n', 'utf-8');

    const r = writeTaskPayloads({ projectRoot: fx.root, home: fx.home });

    expect(r).toEqual({ written: fx.names, updated: [], kept: [] });
    for (const n of fx.names) {
      const md = fs.readFileSync(path.join(fx.dir(n), 'SKILL.md'), 'utf-8');
      expect(readInstalledMarker(path.join(fx.dir(n), INSTALLED_MARKER_FILENAME))?.sha256).toBe(sha256Hex(md));
    }
    expect(fs.readFileSync(path.join(retired, 'SKILL.md'), 'utf-8')).toBe('old bundle\n');
    expect(fs.readFileSync(registry, 'utf-8')).toBe('{"scheduledTasks":[]}\n');
  });

  it('a second call returns three empty lists and changes no file', () => {
    const fx = fixture();
    writeTaskPayloads({ projectRoot: fx.root, home: fx.home });
    const before = snapshot(fx.home);
    expect(writeTaskPayloads({ projectRoot: fx.root, home: fx.home })).toEqual({ written: [], updated: [], kept: [] });
    expect(snapshot(fx.home)).toEqual(before);
  });

  it("never touches a same-slug directory another project owns", () => {
    const fx = fixture();
    const foreign = fx.dir(fx.names[0]!);
    const content = '---\nname: x\n---\n\n<!-- cortex-project-root: /some/other -->\n';
    seed(foreign, content);
    const r = writeTaskPayloads({ projectRoot: fx.root, home: fx.home });
    expect(fs.readFileSync(path.join(foreign, 'SKILL.md'), 'utf-8')).toBe(content);
    expect(r.written).toHaveLength(3);
    expect(r.written).not.toContain(fx.names[0]);
  });
});

describe('A dry run reports and writes nothing', () => {
  it('returns the lists a real call would, and no file changes', () => {
    const fx = fixture();
    const [absent, stale, edited] = fx.names as [string, string, string];
    const old = 'older package payload\n';
    seed(fx.dir(stale), old, sha256Hex(old));
    seed(fx.dir(edited), 'edited by hand\n', sha256Hex('what was shipped\n'));
    const before = snapshot(fx.home);

    const dry = writeTaskPayloads({ projectRoot: fx.root, home: fx.home, dryRun: true });

    expect(dry).toEqual({ written: [absent], updated: [stale], kept: [edited] });
    expect(snapshot(fx.home)).toEqual(before);
    expect(writeTaskPayloads({ projectRoot: fx.root, home: fx.home })).toEqual(dry);
  });

  it('does not write a missing marker', () => {
    const fx = fixture();
    writeTaskPayloads({ projectRoot: fx.root, home: fx.home });
    fs.rmSync(path.join(fx.dir(fx.names[0]!), INSTALLED_MARKER_FILENAME));
    const before = snapshot(fx.home);
    writeTaskPayloads({ projectRoot: fx.root, home: fx.home, dryRun: true });
    expect(snapshot(fx.home)).toEqual(before);
  });
});

describe('Unedited payloads are replaced, edited ones stay', () => {
  it('replaces the unedited, keeps the edited, marks the unmarked current one', () => {
    const fx = fixture();
    const [unedited, edited, unmarked] = fx.names as [string, string, string];
    const old = 'older package payload\n';
    seed(fx.dir(unedited), old, sha256Hex(old));
    seed(fx.dir(edited), 'edited by hand\n', sha256Hex('what was shipped\n'));
    const current = storeV4TaskSkillMd(STORE_V4_TASKS[2]!, unmarked, fx.root);
    seed(fx.dir(unmarked), current);

    const r = writeTaskPayloads({ projectRoot: fx.root, home: fx.home });

    expect(r).toEqual({ written: [], updated: [unedited], kept: [edited] });
    const replaced = fs.readFileSync(path.join(fx.dir(unedited), 'SKILL.md'), 'utf-8');
    expect(replaced).toBe(storeV4TaskSkillMd(STORE_V4_TASKS[0]!, unedited, fx.root));
    expect(readInstalledMarker(path.join(fx.dir(unedited), INSTALLED_MARKER_FILENAME))?.sha256).toBe(sha256Hex(replaced));
    expect(fs.readFileSync(path.join(fx.dir(edited), 'SKILL.md'), 'utf-8')).toBe('edited by hand\n');
    expect(fs.readFileSync(path.join(fx.dir(unmarked), 'SKILL.md'), 'utf-8')).toBe(current);
    expect(readInstalledMarker(path.join(fx.dir(unmarked), INSTALLED_MARKER_FILENAME))?.sha256).toBe(sha256Hex(current));
  });

  it('a stale marker on current content is rewritten, in none of the lists', () => {
    const fx = fixture();
    const name = fx.names[0]!;
    const current = storeV4TaskSkillMd(STORE_V4_TASKS[0]!, name, fx.root);
    seed(fx.dir(name), current, sha256Hex('something older\n'));
    const r = writeTaskPayloads({ projectRoot: fx.root, home: fx.home });
    expect(r.updated).toEqual([]);
    expect(r.kept).toEqual([]);
    expect(r.written).not.toContain(name);
    expect(fs.readFileSync(path.join(fx.dir(name), 'SKILL.md'), 'utf-8')).toBe(current);
    expect(readInstalledMarker(path.join(fx.dir(name), INSTALLED_MARKER_FILENAME))?.sha256).toBe(sha256Hex(current));
  });

  it('a payload with no marker and other content counts as a local edit', () => {
    const fx = fixture();
    const name = fx.names[0]!;
    seed(fx.dir(name), 'no marker, not current\n');
    const r = writeTaskPayloads({ projectRoot: fx.root, home: fx.home });
    expect(r.kept).toEqual([name]);
    expect(fs.readFileSync(path.join(fx.dir(name), 'SKILL.md'), 'utf-8')).toBe('no marker, not current\n');
  });
});
