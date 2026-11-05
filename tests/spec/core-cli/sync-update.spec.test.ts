/**
 * Spec-level tests — `core-cli.sync` Rules 16–27, the 4.0 update route, one per
 * acceptance criterion. Every case runs on a real project tree under a test
 * package root, so a removal or an overwrite shows up as bytes on disk.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { updateRoute, type UpdateOptions } from '../../../src/cli/update.js';
import { run as cortex } from '../../../src/cli/cli.js';
import { registerTasks } from '../../../src/cli/tasks-register.js';
import { handWrittenHooks, installHooks } from '../../../src/specflow/hooks-install.js';
import { hashDirectoryContent, INSTALLED_MARKER_FILENAME, writeInstalledMarker } from '../../../src/cli/scaffold.js';
import { FINAL_BUNDLES, TMP_BUNDLE_PREFIX, installWhole } from '../../../src/store/migrate/system.js';
import { SPECS_SECTION_STAGE2 } from '../../../src/store/managed-block.js';
import { STORE_V4_TASKS } from '../../../src/cli/templates.js';
import { storeInit } from '../../../src/store/init.js';
import { scopedTaskName, hashScopedTaskName } from '../../../src/cli/task-scoping.js';
import { tmpRepo, cleanRepos, gitInit } from '../../fixtures/store.js';

vi.mock('../../../src/cli/tasks-register.js', async (original) => ({ ...(await original<object>()), registerTasks: vi.fn() }));

afterEach(cleanRepos);

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DESKTOP_LINE = 'type /cortex-register-tasks (plain words will not run it)';

function pkg(names: readonly string[] = FINAL_BUNDLES): string {
  const dir = tmpRepo('pkg');
  for (const n of [...names, 'cortex-migrate']) {
    fs.mkdirSync(path.join(dir, 'skills', n), { recursive: true });
    fs.writeFileSync(path.join(dir, 'skills', n, 'SKILL.md'), `---\nname: ${n}\ndescription: 'x'\n---\n\n# ${n}\n`);
  }
  return dir;
}

function accepted(label: string): string {
  const root = tmpRepo(label);
  storeInit(root);
  const p = path.join(root, 'cortex/cortex.json');
  fs.writeFileSync(p, JSON.stringify({ ...JSON.parse(fs.readFileSync(p, 'utf8')), migration: { from: '3.4', accepted: '2026-11-01' } }, null, 2) + '\n');
  return root;
}

function bundle(root: string, name: string, text: string, marked = false): string {
  const dir = path.join(root, '.claude/skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), text);
  if (marked) writeInstalledMarker(path.join(dir, INSTALLED_MARKER_FILENAME), hashDirectoryContent(dir, [INSTALLED_MARKER_FILENAME]));
  return dir;
}

/** A bundle as `skills/<name>` stood at the oldest commit touching it: an unedited copy Cortex shipped. */
function shippedCopy(root: string, name: string): string {
  const first = execFileSync('git', ['log', '--format=%h', '--reverse', '--full-history', '88895ca', '--', `skills/${name}`], { cwd: REPO, encoding: 'utf8' }).split('\n')[0]!;
  const dir = path.join(root, '.claude/skills', name);
  for (const f of execFileSync('git', ['ls-tree', '-r', '--name-only', first, '--', `skills/${name}/`], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean)) {
    const dst = path.join(dir, f.slice(`skills/${name}/`.length));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, execFileSync('git', ['show', `${first}:${f}`], { cwd: REPO }));
  }
  return dir;
}

function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.name === '.git') continue;
      if (e.isSymbolicLink()) out[path.relative(dir, p)] = `link:${fs.readlinkSync(p)}`;
      else if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p, 'latin1');
    }
  };
  walk(dir);
  return out;
}

async function run(root: string, opts: Partial<UpdateOptions> & { pkgDir?: string } = {}): Promise<{ code: number; text: string; home: string }> {
  const home = opts.home ?? tmpRepo('home');
  const r = await updateRoute(root, { platform: 'darwin', home, appSupportDir: path.join(home, 'app'), packageDir: opts.pkgDir ?? pkg(), today: '2026-11-20', ...opts });
  return { code: r.exitCode, text: r.out.join('\n'), home };
}

/** A registry the Desktop app would hold, naming `names` enabled. */
function registry(home: string, names: readonly string[]): string {
  const dir = path.join(home, 'app', 'claude-code-sessions', 'a', 'b');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'scheduled-tasks.json');
  fs.writeFileSync(p, JSON.stringify({ scheduledTasks: names.map((id) => ({ id, enabled: true })), recordedSkips: {} }));
  return p;
}

const canonical = STORE_V4_TASKS.map((t) => t.name);

describe('the package', () => {
  it('This repository ships every bundle of the final set', () => {
    for (const n of [...FINAL_BUNDLES, 'cortex-migrate']) expect(fs.existsSync(path.join(REPO, 'skills', n, 'SKILL.md')), n).toBe(true);
  });
});

describe('core-cli.sync Rule 16: which project gets what', () => {
  it('refuses off darwin before anything else', async () => {
    const root = accepted('linux');
    const before = tree(root);
    const r = await run(root, { platform: 'linux' });
    expect(r.code).toBe(2);
    expect(r.text).toContain('requires macOS');
    expect(tree(root)).toEqual(before);
  });

  it('A 3.x project is told to migrate', async () => {
    const root = tmpRepo('3x');
    fs.mkdirSync(path.join(root, '.cortex'));
    fs.writeFileSync(path.join(root, '.cortex/cortex.config.json'), '{"schemaVersion":"3.4"}');
    const before = tree(root);
    const r = await run(root);
    expect(r.code).toBe(3);
    expect(r.text).toBe('cortex sync: refused — this project is on the 3.x store; migrate it first with cortex migrate. Nothing was written.');
    expect(tree(root)).toEqual(before);
  });

  it('A 3.x project with a bare cortex.json is told to migrate', async () => {
    const root = tmpRepo('3xbare');
    fs.mkdirSync(path.join(root, '.cortex'));
    fs.writeFileSync(path.join(root, '.cortex/cortex.config.json'), '{"schemaVersion":"3.4"}');
    storeInit(root);
    bundle(root, 'specflow-develop', 'dev\n', true);
    const before = tree(root);
    const r = await run(root);
    expect(r.code).toBe(3);
    expect(r.text).toContain('migrate it first with cortex migrate');
    expect(tree(root)).toEqual(before);
  });

  it('A .cortex folder with no config is told to migrate', async () => {
    const root = tmpRepo('3xnoconfig');
    fs.mkdirSync(path.join(root, '.cortex/compass'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex/compass/r.md'), 'rule\n');
    bundle(root, 'specflow-develop', 'dev\n', true);
    storeInit(root);
    const before = tree(root);
    const r = await run(root);
    expect(r.code).toBe(3);
    expect(r.text).toContain('migrate it first with cortex migrate');
    expect(tree(root)).toEqual(before);
  });

  it('An unaccepted migration is told to finish', async () => {
    const root = accepted('unaccepted');
    const p = path.join(root, 'cortex/cortex.json');
    fs.writeFileSync(p, JSON.stringify({ schemaVersion: '4.0', migration: { from: '3.4', accepted: null } }));
    fs.mkdirSync(path.join(root, '.cortex'));
    const before = tree(root);
    const r = await run(root);
    expect(r.code).toBe(3);
    expect(r.text).toContain('finish it with cortex migrate --accept');
    expect(tree(root)).toEqual(before);
  });

  it('A migration with no accepted date is unaccepted', async () => {
    for (const migration of [{ from: '3.4' }, { from: '3.4', accepted: 'soon' }]) {
      const root = accepted('nodate');
      fs.writeFileSync(path.join(root, 'cortex/cortex.json'), JSON.stringify({ schemaVersion: '4.0', migration }));
      const r = await run(root);
      expect(r.code).toBe(3);
      expect(r.text).toContain('cortex migrate --accept');
    }
  });

  it('No store is refused', async () => {
    const root = tmpRepo('none');
    const r = await run(root);
    expect(r.code).toBe(2);
    expect(r.text).toContain('set one up with cortex init');
  });

  it('A store of another major version is refused', async () => {
    const root = accepted('major');
    fs.writeFileSync(path.join(root, 'cortex/cortex.json'), '{"schemaVersion":"5.0"}');
    const before = tree(root);
    const r = await run(root);
    expect(r.code).toBe(3);
    expect(tree(root)).toEqual(before);
  });

  it('A broken cortex.json is refused', async () => {
    for (const text of ['{not json', '{"visibility":{}}']) {
      const root = accepted('broken');
      fs.writeFileSync(path.join(root, 'cortex/cortex.json'), text);
      bundle(root, 'specflow-develop', 'dev\n', true);
      const before = tree(root);
      const r = await run(root);
      expect(r.code).toBe(3);
      expect(r.text).toContain('cortex/cortex.json is not valid');
      expect(tree(root)).toEqual(before);
    }
  });

  it('A fresh 4.0 store takes the route', async () => {
    const root = tmpRepo('fresh');
    storeInit(root);
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    for (const n of FINAL_BUNDLES) expect(fs.existsSync(path.join(root, '.claude/skills', n, 'SKILL.md')), n).toBe(true);
  });
});

describe('core-cli.sync Rules 17–19: skills', () => {
  it('An unedited retired skill is removed', async () => {
    const root = accepted('remove');
    bundle(root, 'specflow-develop', 'dev\n', true);
    bundle(root, 'cortex-loop-hygiene', 'h\n', true);
    const r = await run(root);
    expect(fs.existsSync(path.join(root, '.claude/skills/specflow-develop'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.claude/skills/cortex-loop-hygiene'))).toBe(false);
    expect(r.text).toContain('skills: removed specflow-develop');
    expect(r.text).toContain('skills: removed cortex-loop-hygiene');
  });

  it('An edited retired skill is left for the migrate step', async () => {
    const root = accepted('edited');
    const plan = bundle(root, 'specflow-plan', 'plan\n', true);
    fs.appendFileSync(path.join(plan, 'SKILL.md'), 'our own rule\n');
    const bugs = bundle(root, 'specflow-bugs', 'ours\n');
    const before = { plan: tree(plan), bugs: tree(bugs) };
    const p = pkg();
    const r = await run(root, { pkgDir: p });
    expect({ plan: tree(plan), bugs: tree(bugs) }).toEqual(before);
    const skill = path.join(p, 'skills/cortex-migrate/SKILL.md');
    expect(r.text).toContain(`skills: specflow-plan is retired but has local edits; left for the skill-adjust step of ${skill}`);
    expect(r.text).toContain(`skills: specflow-bugs is retired but has local edits; left for the skill-adjust step of ${skill}`);
  });

  it("A project's own skill is never removed", async () => {
    const root = accepted('own');
    const a = bundle(root, 'release', 'r\n');
    const b = bundle(root, 'specflow-custom', 'c\n');
    const before = [tree(a), tree(b)];
    await run(root);
    expect([tree(a), tree(b)]).toEqual(before);
  });

  it('The final set arrives', async () => {
    const root = accepted('final');
    const r = await run(root);
    for (const n of FINAL_BUNDLES) {
      expect(fs.existsSync(path.join(root, '.claude/skills', n, INSTALLED_MARKER_FILENAME)), n).toBe(true);
      expect(r.text).toContain(`skills: installed ${n}`);
    }
    expect(fs.existsSync(path.join(root, '.claude/skills/cortex-migrate'))).toBe(false);
  });

  it('An unedited skill is updated', async () => {
    const root = accepted('update');
    const dir = bundle(root, 'specflow-review', 'old\n', true);
    const oldMarker = fs.readFileSync(path.join(dir, INSTALLED_MARKER_FILENAME), 'utf8');
    const p = pkg();
    const r = await run(root, { pkgDir: p });
    expect(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')).toBe(fs.readFileSync(path.join(p, 'skills/specflow-review/SKILL.md'), 'utf8'));
    expect(fs.readFileSync(path.join(dir, INSTALLED_MARKER_FILENAME), 'utf8')).not.toBe(oldMarker);
    expect(r.text).toContain('skills: updated specflow-review');
  });

  it('An edited skill is left alone', async () => {
    const root = accepted('keep');
    const dir = bundle(root, 'specflow-review', 'old\n', true);
    fs.appendFileSync(path.join(dir, 'SKILL.md'), 'ours\n');
    const before = tree(dir);
    const r = await run(root);
    expect(tree(dir)).toEqual(before);
    expect(r.text).toContain('skills: .claude/skills/specflow-review exists with different content; left alone');
  });

  it('A package lacking part of the final set removes nothing', async () => {
    const root = accepted('lacks');
    bundle(root, 'specflow-develop', 'dev\n', true);
    const before = tree(root);
    const p = pkg(FINAL_BUNDLES.filter((n) => n !== 'cortex-quality'));
    for (const dryRun of [false, true]) {
      const r = await run(root, { pkgDir: p, dryRun });
      expect(r.code).toBe(1);
      expect(r.text).toBe('cortex sync: refused — this package lacks cortex-quality. Nothing was written.');
      expect(tree(root)).toEqual(before);
    }
  });

  it('A symlinked bundle is left alone', async () => {
    const root = accepted('links');
    const target = tmpRepo('target');
    fs.writeFileSync(path.join(target, 'SKILL.md'), 'mine\n');
    fs.mkdirSync(path.join(root, '.claude/skills'), { recursive: true });
    fs.symlinkSync(target, path.join(root, '.claude/skills/specflow-plan'));
    fs.symlinkSync(target, path.join(root, '.claude/skills/cortex-remember'));
    const inner = bundle(root, 'specflow-bugs', 'b\n', true);
    fs.symlinkSync(target, path.join(inner, 'refs'));
    const before = { skills: tree(path.join(root, '.claude/skills/specflow-bugs')), target: tree(target) };
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    for (const n of ['specflow-plan', 'cortex-remember', 'specflow-bugs']) expect(r.text).toContain(`skills: ${n} is a symlink; left alone`);
    expect(fs.lstatSync(path.join(root, '.claude/skills/specflow-plan')).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(root, '.claude/skills/cortex-remember')).isSymbolicLink()).toBe(true);
    expect({ skills: tree(path.join(root, '.claude/skills/specflow-bugs')), target: tree(target) }).toEqual(before);
  });

  it('a plain file with a bundle name is left alone', async () => {
    const root = accepted('plainfile');
    fs.mkdirSync(path.join(root, '.claude/skills'), { recursive: true });
    fs.writeFileSync(path.join(root, '.claude/skills/specflow-plan'), 'a note\n');
    fs.writeFileSync(path.join(root, '.claude/skills/cortex-remember'), 'a note\n');
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(fs.readFileSync(path.join(root, '.claude/skills/specflow-plan'), 'utf8')).toBe('a note\n');
    expect(fs.readFileSync(path.join(root, '.claude/skills/cortex-remember'), 'utf8')).toBe('a note\n');
    expect(r.text).toContain('skills: .claude/skills/cortex-remember exists with different content; left alone');
  });

  it('An interrupted install leaves a whole bundle', async () => {
    const root = accepted('interrupted');
    const dir = bundle(root, 'cortex-remember', 'old\n', true);
    const before = tree(dir);
    const p = pkg();
    const skills = path.join(root, '.claude/skills');
    const failing: UpdateOptions['install'] = (dirArg, name) => {
      fs.mkdirSync(path.join(dirArg, `${TMP_BUNDLE_PREFIX}${name}`), { recursive: true });
      fs.writeFileSync(path.join(dirArg, `${TMP_BUNDLE_PREFIX}${name}`, 'SKILL.md'), 'par');
      throw new Error('disk full');
    };
    const first = await run(root, { pkgDir: p, install: failing });
    expect(first.code).toBe(1);
    expect(first.text).toContain('cortex sync: stopped at skills: disk full');
    expect(tree(dir)).toEqual(before);
    const second = await run(root, { pkgDir: p });
    expect(second.code, second.text).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')).toBe(fs.readFileSync(path.join(p, 'skills/cortex-remember/SKILL.md'), 'utf8'));
    expect(fs.readdirSync(skills).filter((n) => n.startsWith(TMP_BUNDLE_PREFIX))).toEqual([]);
  });

  it('a failed copy leaves the old bundle and a partial temp folder the next run clears', async () => {
    const root = accepted('realfail');
    const dir = bundle(root, 'cortex-remember', 'old\n', true);
    const before = tree(dir);
    const src = tmpRepo('src');
    fs.writeFileSync(path.join(src, 'a.md'), 'a\n');
    fs.writeFileSync(path.join(src, 'SKILL.md'), 'new\n');
    fs.chmodSync(path.join(src, 'SKILL.md'), 0o000);
    const skills = path.join(root, '.claude/skills');
    expect(() => installWhole(skills, 'cortex-remember', src)).toThrow();
    fs.chmodSync(path.join(src, 'SKILL.md'), 0o644);
    expect(tree(dir)).toEqual(before);
    expect(fs.existsSync(path.join(skills, `${TMP_BUNDLE_PREFIX}cortex-remember`))).toBe(true);
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(fs.readdirSync(skills).filter((n) => n.startsWith(TMP_BUNDLE_PREFIX))).toEqual([]);
  });

  it('A failed removal leaves the bundle whole', async () => {
    const root = accepted('nomove');
    const dir = bundle(root, 'specflow-develop', 'dev\n', true);
    const before = tree(dir);
    const skills = path.join(root, '.claude/skills');
    fs.chmodSync(skills, 0o555);
    const r = await run(root);
    fs.chmodSync(skills, 0o755);
    expect(r.code).toBe(1);
    expect(r.text).toContain('cortex sync: stopped at skills:');
    expect(tree(dir)).toEqual(before);
  });

  it('A read-only subfolder does not wedge the next runs', async () => {
    const root = accepted('readonly');
    const dir = bundle(root, 'cortex-remember', 'old\n');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub/x.md'), 'x\n');
    writeInstalledMarker(path.join(dir, INSTALLED_MARKER_FILENAME), hashDirectoryContent(dir, [INSTALLED_MARKER_FILENAME]));
    fs.chmodSync(path.join(dir, 'sub'), 0o555);
    const first = await run(root);
    expect(first.code, first.text).toBe(0);
    expect(first.text).toContain('skills: updated cortex-remember');
    const leftovers = fs.readdirSync(path.join(root, '.claude/skills')).filter((n) => n.startsWith(TMP_BUNDLE_PREFIX));
    expect(leftovers).toEqual([]);
  });

  it('Something in the way of a temp name is named', async () => {
    const root = accepted('blocked');
    bundle(root, 'specflow-plan', 'p\n', true);
    fs.writeFileSync(path.join(root, `.claude/skills/${TMP_BUNDLE_PREFIX}specflow-plan`), 'a note\n');
    const p = pkg();
    for (const dryRun of [true, false]) {
      const r = await run(root, { pkgDir: p, dryRun });
      expect(r.code).toBe(1);
      expect(r.text).toContain(`${TMP_BUNDLE_PREFIX}specflow-plan is in the way; move it and run this again`);
    }
    expect(fs.readFileSync(path.join(root, `.claude/skills/${TMP_BUNDLE_PREFIX}specflow-plan`), 'utf8')).toBe('a note\n');
    expect(fs.existsSync(path.join(root, '.claude/skills/specflow-plan/SKILL.md'))).toBe(true);
  });

  it("a person's file at an unused temp name blocks nothing", async () => {
    const root = accepted('oldretired');
    const dir = bundle(root, 'cortex-loop', 'l\n', true);
    const note = path.join(root, `.claude/skills/${TMP_BUNDLE_PREFIX}old-cortex-loop`);
    fs.writeFileSync(note, 'a note\n');
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(fs.existsSync(dir)).toBe(false);
    expect(fs.readFileSync(note, 'utf8')).toBe('a note\n');
  });

  it("A person's temp-looking folder stays, and a generated leftover is named", async () => {
    const root = accepted('leftovers');
    const skills = path.join(root, '.claude/skills');
    fs.mkdirSync(path.join(skills, `${TMP_BUNDLE_PREFIX}notes`), { recursive: true });
    fs.writeFileSync(path.join(skills, `${TMP_BUNDLE_PREFIX}notes/mine.md`), 'mine\n');
    fs.mkdirSync(path.join(skills, `${TMP_BUNDLE_PREFIX}old-cortex-remember`));
    fs.mkdirSync(path.join(skills, `${TMP_BUNDLE_PREFIX}specflow-plan`));
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(fs.readFileSync(path.join(skills, `${TMP_BUNDLE_PREFIX}notes/mine.md`), 'utf8')).toBe('mine\n');
    fs.writeFileSync(path.join(skills, `${TMP_BUNDLE_PREFIX}notes/SKILL.md`), 'run specflow-entry\n');
    expect((await run(root)).text).toContain(`- ${TMP_BUNDLE_PREFIX}notes/SKILL.md: specflow-entry`);
    expect(r.text).toContain(`skills: cleared leftover ${TMP_BUNDLE_PREFIX}old-cortex-remember`);
    expect(r.text).toContain(`skills: cleared leftover ${TMP_BUNDLE_PREFIX}specflow-plan`);
    expect(fs.existsSync(path.join(skills, `${TMP_BUNDLE_PREFIX}specflow-plan`))).toBe(false);
  });

  it('An empty folder at a bundle name counts as absent', async () => {
    const root = accepted('empty');
    const skills = path.join(root, '.claude/skills');
    fs.mkdirSync(path.join(skills, 'cortex-remember'), { recursive: true });
    fs.mkdirSync(path.join(skills, 'specflow-plan'));
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(fs.existsSync(path.join(skills, 'cortex-remember/SKILL.md'))).toBe(true);
    expect(r.text).not.toContain('specflow-plan is retired');
  });

  it('A .DS_Store is not a local edit', async () => {
    const root = accepted('dsstore');
    const dir = bundle(root, 'cortex-remember', 'old\n', true);
    fs.writeFileSync(path.join(dir, '.DS_Store'), 'finder');
    const gone = bundle(root, 'specflow-develop', 'dev\n', true);
    fs.writeFileSync(path.join(gone, '.DS_Store'), 'finder');
    const r = await run(root);
    expect(r.text).toContain('skills: updated cortex-remember');
    expect(r.text).toContain('skills: removed specflow-develop');
  });

  it('a folder at the marker path does not stop sync', async () => {
    const root = accepted('markerdir');
    const p = pkg();
    const dir = bundle(root, 'specflow-spec', fs.readFileSync(path.join(p, 'skills/specflow-spec/SKILL.md'), 'utf8'));
    fs.mkdirSync(path.join(dir, INSTALLED_MARKER_FILENAME));
    const r = await run(root, { pkgDir: p });
    expect(r.code, r.text).toBe(0);
    expect(r.text).toContain('skills: specflow-spec: marker not written; left alone');
    const dry = await run(root, { pkgDir: p, dryRun: true });
    expect(dry.text).toContain('would: skills: specflow-spec: marker not written; left alone');
  });

  it('A missing or stale marker on an identical copy is written', async () => {
    const root = accepted('backfill');
    const p = pkg();
    const text = fs.readFileSync(path.join(p, 'skills/specflow-spec/SKILL.md'), 'utf8');
    const text2 = fs.readFileSync(path.join(p, 'skills/specflow-review/SKILL.md'), 'utf8');
    const a = bundle(root, 'specflow-spec', text);
    const b = bundle(root, 'specflow-review', text2);
    writeInstalledMarker(path.join(b, INSTALLED_MARKER_FILENAME), 'wrong');
    const r = await run(root, { pkgDir: p });
    for (const [dir, want] of [[a, text], [b, text2]] as const) {
      expect(JSON.parse(fs.readFileSync(path.join(dir, INSTALLED_MARKER_FILENAME), 'utf8')).sha256).toBe(hashDirectoryContent(dir, [INSTALLED_MARKER_FILENAME]));
      expect(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')).toBe(want);
    }
    expect(r.text).not.toContain('skills: updated');
  });

  it('An unedited 3.x copy with no marker is updated', async () => {
    const root = accepted('shipped');
    const dir = shippedCopy(root, 'cortex-register-tasks');
    const p = pkg();
    const r = await run(root, { pkgDir: p });
    expect(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')).toBe(fs.readFileSync(path.join(p, 'skills/cortex-register-tasks/SKILL.md'), 'utf8'));
    expect(fs.existsSync(path.join(dir, INSTALLED_MARKER_FILENAME))).toBe(true);
    expect(r.text).toContain('skills: updated cortex-register-tasks');
  });

  it('A marker-less copy with an edit is left alone', async () => {
    const root = accepted('shipped-edit');
    const dir = shippedCopy(root, 'cortex-register-tasks');
    fs.appendFileSync(path.join(dir, 'SKILL.md'), 'x');
    const before = tree(dir);
    const r = await run(root);
    expect(tree(dir)).toEqual(before);
    expect(r.text).toContain('skills: .claude/skills/cortex-register-tasks exists with different content; left alone');
  });

  it('An unedited retired copy with no marker is removed', async () => {
    const root = accepted('shipped-retired');
    const dir = shippedCopy(root, 'specflow-plan');
    const r = await run(root);
    expect(fs.existsSync(dir)).toBe(false);
    expect(r.text).toContain('skills: removed specflow-plan');
  });

  it('The renamed router leaves too', async () => {
    const root = accepted('router');
    const dir = shippedCopy(root, 'specflow-change-router');
    const r = await run(root);
    expect(fs.existsSync(dir)).toBe(false);
    expect(r.text).toContain('skills: removed specflow-change-router');
  });
});

describe('core-cli.sync Rules 17, 20: blocks and failure', () => {
  it('The block reaches stage 2 in one run', async () => {
    const root = accepted('stage2');
    fs.mkdirSync(path.join(root, 'specflow'));
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    const text = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
    for (const line of SPECS_SECTION_STAGE2) expect(text).toContain(line);
  });

  it('A failed step stops the route', async () => {
    const root = accepted('fail');
    const p = pkg();
    const home = tmpRepo('home');
    const first = await run(root, { pkgDir: p, home, writeBlocks: () => { throw new Error('boom'); } });
    expect(first.code).toBe(1);
    expect(first.text).toContain('cortex sync: stopped at blocks: boom');
    expect(first.text).not.toMatch(/^(hooks|tasks):/m);
    expect(fs.existsSync(path.join(root, '.claude/skills/cortex-remember/SKILL.md'))).toBe(true);
    const second = await run(root, { pkgDir: p, home });
    expect(second.code, second.text).toBe(0);
    expect(fs.existsSync(path.join(root, 'CLAUDE.md'))).toBe(true);
  });
});

describe('core-cli.sync Rule 21: hooks', () => {
  const hooksPath = (root: string): string => {
    try {
      return execFileSync('git', ['config', 'core.hooksPath'], { cwd: root, encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  };

  it('Hooks are not switched on by sync', async () => {
    const root = accepted('hooks-off');
    gitInit(root);
    fs.mkdirSync(path.join(root, 'specflow'));
    const r = await run(root);
    expect(hooksPath(root)).toBe('');
    expect(fs.existsSync(path.join(root, '.githooks'))).toBe(false);
    expect(r.text).toContain('hooks: not installed; run cortex hooks install');
  });

  it('A hand-set hooks path gets nothing written', async () => {
    const root = accepted('hooks-hand');
    gitInit(root);
    fs.mkdirSync(path.join(root, 'specflow'));
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root });
    const before = tree(root);
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(fs.existsSync(path.join(root, '.githooks'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'cortex/cortex.json'), 'utf8')).specflow).toBeUndefined();
    expect(r.text).toContain('hooks: not installed; run cortex hooks install');
    expect(tree(root)['cortex/cortex.json']).toBe(before['cortex/cortex.json']);
  });

  it('A hooks path elsewhere gets no install advice', async () => {
    const root = accepted('hooks-husky');
    gitInit(root);
    fs.mkdirSync(path.join(root, 'specflow'));
    execFileSync('git', ['config', 'core.hooksPath', '.husky'], { cwd: root });
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(r.text).toContain('hooks: core.hooksPath is .husky; add the hooks there by hand');
    expect(r.text).not.toContain('run cortex hooks install');
  });

  it('No specflow folder skips the hooks', async () => {
    const root = accepted('hooks-nospec');
    gitInit(root);
    const r = await run(root);
    expect(r.text).toContain('hooks: no specflow/ folder; skipped');
  });

  it('Outside git, hooks are skipped', async () => {
    const root = accepted('hooks-nogit');
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(r.text).toContain('hooks: not a git repository; skipped');
  });

  const installed = (label: string): string => {
    const root = accepted(label);
    gitInit(root);
    expect(installHooks(root, { writeSince: false }, { stdout: () => {}, stderr: () => {} })).toBe(0);
    return root;
  };
  const refusal = 'specflow: .githooks/pre-commit is not a Cortex hook; nothing was changed. Move it to .git/hooks/pre-commit, where it keeps running, and run this again.';

  it('A hand-written hook does not fail sync', async () => {
    const root = installed('hooks-refused');
    fs.writeFileSync(path.join(root, '.githooks/pre-commit'), '#!/bin/sh\necho ours\n');
    const before = tree(path.join(root, '.githooks'));
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(r.text).toContain(`hooks: ${refusal}`);
    expect(r.text).not.toContain('refreshed');
    expect(tree(path.join(root, '.githooks'))).toEqual(before);
  });

  it('Installed hooks are refreshed', async () => {
    const root = installed('hooks-refresh');
    const want = fs.readFileSync(path.join(root, '.githooks/commit-msg'), 'utf8');
    fs.appendFileSync(path.join(root, '.githooks/commit-msg'), '# out of date\n');
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(fs.readFileSync(path.join(root, '.githooks/commit-msg'), 'utf8')).toBe(want);
    expect(r.text).toContain('hooks: refreshed .githooks');
    expect(JSON.parse(fs.readFileSync(path.join(root, 'cortex/cortex.json'), 'utf8')).specflow).toBeUndefined();
  });

  it('A dry run reports the hook case a real run would take', async () => {
    const root = accepted('hooks-dry');
    gitInit(root);
    fs.mkdirSync(path.join(root, 'specflow'));
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root });
    const empty = await run(root, { dryRun: true });
    expect(empty.text).toContain('would: hooks: not installed; run cortex hooks install');
    const done = installed('hooks-dry-2');
    fs.writeFileSync(path.join(done, '.githooks/pre-commit'), '#!/bin/sh\necho ours\n');
    expect(handWrittenHooks(done)).toEqual(['pre-commit']);
    const before = tree(done);
    const refused = await run(done, { dryRun: true });
    expect(refused.text).toContain(refusal);
    expect(refused.text).not.toContain('refreshed');
    expect(tree(done)).toEqual(before);
  });

  it('A symlinked skills folder is left alone', async () => {
    const root = accepted('skillslink');
    const shared = tmpRepo('shared');
    bundle(shared, 'specflow-develop', 'dev\n', true);
    const before = tree(shared);
    fs.mkdirSync(path.join(root, '.claude'));
    fs.symlinkSync(path.join(shared, '.claude/skills'), path.join(root, '.claude/skills'));
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(r.text).toContain('skills: .claude/skills is a symlink; left alone');
    expect(tree(shared)).toEqual(before);
  });

  it('a commit-msg that is a folder is not an install', async () => {
    const root = accepted('hooks-dir');
    gitInit(root);
    fs.mkdirSync(path.join(root, 'specflow'));
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root });
    fs.mkdirSync(path.join(root, '.githooks/commit-msg'), { recursive: true });
    const r = await run(root);
    expect(r.code, r.text).toBe(0);
    expect(r.text).toContain('hooks: not installed; run cortex hooks install');
  });
});

describe('core-cli.sync Rule 22: tasks', () => {
  it('Unregistered tasks print the command to type', async () => {
    const root = accepted('tasks-some');
    const home = tmpRepo('home');
    const p = registry(home, [scopedTaskName(root, canonical[0]!)]);
    const before = fs.readFileSync(p, 'utf8');
    const r = await run(root, { home });
    expect(r.text).toContain(`tasks: 2 of 3 not registered; in a Claude Desktop session for this project, ${DESKTOP_LINE}`);
    expect(fs.readFileSync(p, 'utf8')).toBe(before);
    expect(r.code).toBe(0);
  });

  it('No registry counts as unregistered', async () => {
    const root = accepted('tasks-none');
    const home = tmpRepo('home');
    const r = await run(root, { home });
    expect(r.code, r.text).toBe(0);
    expect(r.text).toContain(`tasks: 3 of 3 not registered; in a Claude Desktop session for this project, ${DESKTOP_LINE}`);
    expect(fs.existsSync(path.join(home, 'app'))).toBe(false);
  });

  it('Registered tasks are reported in one line', async () => {
    const root = accepted('tasks-all');
    const home = tmpRepo('home');
    registry(home, canonical.map((c) => scopedTaskName(root, c)));
    const r = await run(root, { home });
    expect(r.text).toContain('tasks: all 3 registered');
    expect(r.text).not.toContain('/cortex-register-tasks');
  });

  it('B-011: with no home passed, payloads land under os.homedir(), which a test can redirect', async () => {
    const root = accepted('b011');
    const home = tmpRepo('home');
    const saved = process.env['HOME'];
    process.env['HOME'] = home;
    try {
      const r = await updateRoute(root, { platform: 'darwin', appSupportDir: path.join(home, 'app'), packageDir: pkg() });
      expect(r.exitCode, r.out.join('\n')).toBe(0);
    } finally {
      process.env['HOME'] = saved;
    }
    expect(fs.readdirSync(path.join(home, '.claude/scheduled-tasks'))).toHaveLength(3);
  });

  it('Sync never registers', async () => {
    const root = accepted('tasks-never');
    const home = tmpRepo('home');
    const p = registry(home, []);
    const before = fs.readFileSync(p, 'utf8');
    await run(root, { home });
    expect(fs.readFileSync(p, 'utf8')).toBe(before);
    expect(registerTasks).not.toHaveBeenCalled();
  });

  it('The task payloads arrive', async () => {
    const root = accepted('payloads');
    const home = tmpRepo('home');
    const p = pkg();
    const first = await run(root, { home, pkgDir: p });
    for (const c of canonical) {
      const name = scopedTaskName(root, c);
      expect(fs.existsSync(path.join(home, '.claude/scheduled-tasks', name, 'SKILL.md')), name).toBe(true);
      expect(fs.existsSync(path.join(home, '.claude/scheduled-tasks', name, INSTALLED_MARKER_FILENAME)), name).toBe(true);
      expect(first.text).toContain(`tasks: installed payload ${name}`);
    }
    const before = tree(path.join(home, '.claude'));
    const second = await run(root, { home, pkgDir: p });
    expect(tree(path.join(home, '.claude'))).toEqual(before);
    expect(second.text).not.toContain('tasks: installed payload');
  });

  it('An unedited payload is refreshed and an edited one is kept', async () => {
    const root = accepted('payload-edit');
    const home = tmpRepo('home');
    const p = pkg();
    await run(root, { home, pkgDir: p });
    const dir = (c: string): string => path.join(home, '.claude/scheduled-tasks', scopedTaskName(root, c));
    const [a, b] = [canonical[0]!, canonical[1]!];
    const current = fs.readFileSync(path.join(dir(a), 'SKILL.md'), 'utf8');
    fs.writeFileSync(path.join(dir(a), 'SKILL.md'), 'older prompt\n');
    writeInstalledMarker(path.join(dir(a), INSTALLED_MARKER_FILENAME), (await import('crypto')).createHash('sha256').update('older prompt\n').digest('hex'));
    fs.appendFileSync(path.join(dir(b), 'SKILL.md'), 'ours\n');
    const kept = fs.readFileSync(path.join(dir(b), 'SKILL.md'), 'utf8');
    const r = await run(root, { home, pkgDir: p });
    expect(fs.readFileSync(path.join(dir(a), 'SKILL.md'), 'utf8')).toBe(current);
    expect(r.text).toContain(`tasks: updated payload ${scopedTaskName(root, a)}`);
    expect(fs.readFileSync(path.join(dir(b), 'SKILL.md'), 'utf8')).toBe(kept);
    expect(r.text).toContain(`tasks: ${scopedTaskName(root, b)} has local edits; left alone`);
  });

  it('Payloads of other projects and 3.x payloads stay', async () => {
    const root = accepted('payload-other');
    const home = tmpRepo('home');
    const base = path.join(home, '.claude/scheduled-tasks');
    const c = canonical[0]!;
    const plain = path.join(base, scopedTaskName(root, c));
    fs.mkdirSync(plain, { recursive: true });
    fs.writeFileSync(path.join(plain, 'SKILL.md'), '---\nname: x\n---\n<!-- cortex-project-root: /elsewhere -->\n');
    const legacy = path.join(base, scopedTaskName(root, 'cortex-daily'));
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, 'SKILL.md'), `---\nname: y\n---\n<!-- cortex-project-root: ${root} -->\n`);
    const before = [tree(plain), tree(legacy)];
    await run(root, { home });
    expect([tree(plain), tree(legacy)]).toEqual(before);
    expect(fs.existsSync(path.join(base, hashScopedTaskName(root, c), 'SKILL.md'))).toBe(true);
  });
});

describe('core-cli.sync Rules 23–26', () => {
  it('Project skills are listed', async () => {
    const root = accepted('listed');
    const dir = bundle(root, 'release', 'run specflow-develop\n');
    const before = tree(dir);
    const r = await run(root);
    expect(r.text).toContain('project skills to adjust: 1');
    expect(r.text).toContain('- release/SKILL.md: specflow-develop');
    expect(tree(dir)).toEqual(before);
  });

  it('A validation error fails sync', async () => {
    const root = accepted('invalid');
    fs.writeFileSync(path.join(root, 'cortex/world/terms/bad.md'), 'no frontmatter\n');
    const r = await run(root);
    expect(r.code).toBe(1);
    expect(r.text).toMatch(/error/);
    expect(r.text).toContain('terms/bad.md');
  });

  it('A dry run writes nothing', async () => {
    const root = accepted('dry');
    bundle(root, 'specflow-develop', 'dev\n', true);
    const home = tmpRepo('home');
    const reg = registry(home, []);
    const before = tree(root);
    const regBefore = fs.readFileSync(reg, 'utf8');
    const r = await run(root, { home, dryRun: true });
    expect(r.code, r.text).toBe(0);
    expect(tree(root)).toEqual(before);
    expect(fs.readFileSync(reg, 'utf8')).toBe(regBefore);
    expect(r.text).toContain('would: skills: removed specflow-develop');
    expect(r.text).toContain('would: skills: installed cortex-remember');
    expect(r.text).toContain('would: blocks: refresh MAP.md and the managed blocks');
    expect(r.text).toContain(`would: tasks: installed payload ${scopedTaskName(root, canonical[0]!)}`);
    expect(fs.existsSync(path.join(home, '.claude/scheduled-tasks'))).toBe(false);
    expect(r.text).toMatch(/^project skills to adjust: /m);
  });

  it('An unreadable project file keeps the report', async () => {
    const root = accepted('unreadable');
    const dir = bundle(root, 'release', 'run specflow-develop\n');
    fs.chmodSync(path.join(dir, 'SKILL.md'), 0o000);
    const r = await run(root);
    fs.chmodSync(path.join(dir, 'SKILL.md'), 0o644);
    expect(r.code, r.text).toBe(0);
    expect(r.text).toContain('skills: installed cortex-remember');
    expect(r.text).toContain('- release/SKILL.md: not read');
    expect(r.text).toContain('project skills to adjust: 0');
  });

  it('A marked older final bundle is not listed by a dry run', async () => {
    const root = accepted('marked-older');
    bundle(root, 'cortex-remember', 'run specflow-develop\n', true);
    const dry = await run(root, { dryRun: true });
    expect(dry.text).toContain('project skills to adjust: 0');
  });

  it('A dry run prints what a real run then does', async () => {
    const root = accepted('parity');
    bundle(root, 'specflow-develop', 'dev\n', true);
    bundle(root, 'specflow-plan', 'edited\n');
    bundle(root, 'cortex-remember', 'old\n', true);
    bundle(root, 'specflow-review', 'ours\n');
    bundle(root, 'release', 'run specflow-develop\n');
    const p = pkg();
    const home = tmpRepo('home');
    const dry = await run(root, { pkgDir: p, home, dryRun: true });
    const real = await run(root, { pkgDir: p, home });
    const skillLines = (t: string): string[] => t.split('\n').map((l) => l.replace(/^would: /, '')).filter((l) => /^(skills|tasks|hooks|project skills|- )/.test(l));
    expect(skillLines(dry.text)).toEqual(skillLines(real.text));
  });

  it('The verb refuses a flag it does not know', async () => {
    const root = accepted('flags');
    bundle(root, 'specflow-develop', 'dev\n', true);
    const before = tree(root);
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((m: string) => void errors.push(m));
    try {
      for (const flag of ['--help', '-h', '--dryrun', '--dry-rnu', '-n', '--dry-run=true', '--force']) {
        expect(await cortex(['sync', root, flag]), flag).toBe(2);
        expect(errors.at(-1)).toBe(`cortex sync: unknown flag ${flag}. Nothing was written.`);
      }
      for (const stray of ['dry-run', '–dry-run']) {
        expect(await cortex(['sync', root, stray]), stray).toBe(2);
        expect(errors.at(-1)).toBe(`cortex sync: unexpected argument ${stray}. Nothing was written.`);
      }
    } finally {
      spy.mockRestore();
    }
    expect(tree(root)).toEqual(before);
  });

  it('A second run changes nothing', async () => {
    const root = accepted('second');
    bundle(root, 'specflow-develop', 'dev\n', true);
    const home = tmpRepo('home');
    const p = pkg();
    await run(root, { home, pkgDir: p });
    const before = { root: tree(root), home: tree(home) };
    const r = await run(root, { home, pkgDir: p });
    expect({ root: tree(root), home: tree(home) }).toEqual(before);
    expect(r.text).not.toMatch(/removed|installed|updated/);
  });

  it('Knowledge and settings stay out of it', async () => {
    const root = accepted('settings');
    fs.writeFileSync(path.join(root, 'cortex/world/terms/fare.md'), '---\nabout: x\npermanence: stable\nverified: 2026-11-01 (told)\norigin: person:user@2026-11-01\n---\nText.\n');
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(root, '.claude/settings.json'), '{"a": 1}');
    fs.mkdirSync(path.join(root, '.cortex'));
    fs.writeFileSync(path.join(root, '.cortex/x'), 'y');
    fs.mkdirSync(path.join(root, 'specflow/impl/a'), { recursive: true });
    fs.writeFileSync(path.join(root, 'specflow/impl/a/b.spec.md'), 'x\n');
    const pick = (t: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(t).filter(([k]) => (k.startsWith('cortex/') && k !== 'cortex/MAP.md') || k.startsWith('.cortex/') || k.startsWith('specflow/') || k.startsWith('.claude/settings')));
    const before = pick(tree(root));
    await run(root);
    expect(pick(tree(root))).toEqual(before);
  });
});
