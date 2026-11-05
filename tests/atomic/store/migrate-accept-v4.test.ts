/**
 * Atomic tests — `store.migrate` Rules 8, 9 and 18 at 4.0, one per acceptance
 * criterion: the final set, the retired list, the project-skill scan, and the
 * bare store-init config. Each uses a test package root.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { migrateCli } from '../../../src/store/migrate/cli.js';
import { FINAL_BUNDLES, RETIRED_SKILL_NAMES, SHIPPED_3X_HASHES, isRetiredName } from '../../../src/store/migrate/system.js';
import { hashDirectoryContent, INSTALLED_MARKER_FILENAME, writeInstalledMarker } from '../../../src/cli/scaffold.js';
import { storeInit } from '../../../src/store/init.js';
import { SPECS_SECTION_STAGE2 } from '../../../src/store/managed-block.js';
import { migrationAccepted, loadStore } from '../../../src/store/layout.js';
import { tmpRepo, cleanRepos, gitInit, commitAll } from '../../fixtures/store.js';
import { writeLegacyStore } from '../../fixtures/legacy-store.js';
import { specsRoot } from '../../../src/paths.js';

afterEach(cleanRepos);

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TODAY = '2026-11-20';

/** A package root holding `names` under `skills/`. */
function pkg(names: readonly string[] = FINAL_BUNDLES): string {
  const dir = tmpRepo('pkg');
  for (const n of names) {
    fs.mkdirSync(path.join(dir, 'skills', n), { recursive: true });
    fs.writeFileSync(path.join(dir, 'skills', n, 'SKILL.md'), `---\nname: ${n}\ndescription: 'x'\n---\n\n# ${n}\n`);
  }
  return dir;
}

function project(label: string, accepted: string | null = null): string {
  const root = tmpRepo(label);
  gitInit(root);
  fs.mkdirSync(path.join(root, 'cortex'), { recursive: true });
  fs.writeFileSync(path.join(root, 'cortex/cortex.json'), JSON.stringify({ schemaVersion: '4.0', visibility: { repo: 'private', allow: [] }, migration: { from: '3.4', accepted } }));
  return root;
}

function bundle(root: string, name: string, files: Record<string, string>): string {
  const dir = path.join(root, '.claude/skills', name);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

async function accept(root: string, packageDir: string, today = TODAY): Promise<{ code: number; text: string }> {
  const lines: string[] = [];
  const code = await migrateCli(['--accept', '--today', today], root, { stdout: (l) => lines.push(l), stderr: (l) => lines.push(l), home: tmpRepo('home'), packageDir });
  return { code, text: lines.join('\n') };
}

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.name === '.git') continue;
      if (e.isDirectory()) walk(p);
      else if (!e.isSymbolicLink()) out[path.relative(dir, p)] = fs.readFileSync(p, 'latin1');
    }
  };
  walk(dir);
  return out;
}

const section = (text: string): string => text.slice(text.indexOf('project skills to adjust:'));

describe('store.migrate at 4.0: exports', () => {
  it('the final set is the nine of Rule 18 step 2, without cortex-migrate', () => {
    expect([...FINAL_BUNDLES].sort()).toEqual(['cortex-fresh', 'cortex-learn', 'cortex-quality', 'cortex-register-tasks', 'cortex-remember', 'specflow-onboard', 'specflow-review', 'specflow-spec', 'verification-before-completion']);
  });

  it('the retired list holds the spec names and no final bundle', () => {
    const spec = fs.readFileSync(path.join(specsRoot(REPO), 'store/migrate.spec.md'), 'utf8');
    const line = spec.split('\n').find((l) => l.includes('**The retired list**'))!;
    const names = [...line.slice(line.indexOf('):')).matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    expect([...RETIRED_SKILL_NAMES].sort()).toEqual([...names].sort());
    for (const n of FINAL_BUNDLES) expect(isRetiredName(n), n).toBe(false);
    expect(isRetiredName('cortex-migrate')).toBe(false);
    expect(isRetiredName('cortex-loop-hygiene')).toBe(true);
    expect(isRetiredName('cortex-pulse-distil')).toBe(true);
    expect(isRetiredName('my-cortex-loop')).toBe(false);
  });
});

describe('core-cli.sync Rule 27: the shipped list', () => {
  it('The shipped list covers the history', () => {
    const git = (...args: string[]): string => execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 });
    for (const [name, versions] of [['cortex-register-tasks', 4], ['verification-before-completion', 3]] as const) {
      expect(SHIPPED_3X_HASHES[name], name).toHaveLength(versions);
      for (const commit of git('log', '--format=%H', '--full-history', '88895ca', '--', `skills/${name}`).split('\n').filter(Boolean)) {
        const dir = tmpRepo('version');
        for (const f of git('ls-tree', '-r', '--name-only', commit, '--', `skills/${name}/`).split('\n').filter(Boolean)) {
          const dst = path.join(dir, f.slice(`skills/${name}/`.length));
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          fs.writeFileSync(dst, execFileSync('git', ['show', `${commit}:${f}`], { cwd: REPO, maxBuffer: 1 << 26 }));
        }
        expect(SHIPPED_3X_HASHES[name], `${name} at ${commit}`).toContain(hashDirectoryContent(dir, [INSTALLED_MARKER_FILENAME]));
      }
    }
  });

  it('every retired name with a shipped copy is on the list, and no other name is', () => {
    for (const n of Object.keys(SHIPPED_3X_HASHES)) {
      expect(isRetiredName(n) || n === 'cortex-register-tasks' || n === 'verification-before-completion', n).toBe(true);
    }
    expect(SHIPPED_3X_HASHES['specflow-change-router']?.length).toBeGreaterThan(0);
  });
});

describe('store.migrate Rules 8 and 9', () => {
  it('Apply takes over a bare store-init config', async () => {
    const make = (label: string): string => {
      const root = tmpRepo(label);
      gitInit(root);
      writeLegacyStore(root);
      commitAll(root, '3.x');
      storeInit(root);
      return root;
    };
    const run = async (root: string): Promise<{ code: number; text: string }> => {
      const lines: string[] = [];
      const code = await migrateCli(['--apply', '--today', TODAY], root, { stdout: (l) => lines.push(l), stderr: (l) => lines.push(l) });
      return { code, text: lines.join('\n') };
    };
    const bare = make('bare');
    const first = await run(bare);
    expect(first.code, first.text).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(bare, 'cortex/cortex.json'), 'utf8')).migration).toBeDefined();

    const keyed = make('keyed');
    const p = path.join(keyed, 'cortex/cortex.json');
    fs.writeFileSync(p, JSON.stringify({ ...JSON.parse(fs.readFileSync(p, 'utf8')), specflow: { since: 'abc' } }));
    const before = fs.readFileSync(p, 'utf8');
    const second = await run(keyed);
    expect(second.code).toBe(1);
    expect(second.text).toContain('cortex.json');
    expect(fs.readFileSync(p, 'utf8')).toBe(before);
  });

  it('Accept replaces an accepted value that is not a date', async () => {
    const root = project('notdate', 'soon');
    const first = await accept(root, pkg());
    expect(first.code, first.text).toBe(0);
    const read = () => JSON.parse(fs.readFileSync(path.join(root, 'cortex/cortex.json'), 'utf8')).migration.accepted;
    expect(read()).toBe(TODAY);
    await accept(root, pkg(), '2026-12-01');
    expect(read()).toBe(TODAY);
  });

  it('a store is accepted only by a date', () => {
    const root = project('dates', 'soon');
    expect(migrationAccepted(loadStore(root))).toBe(false);
    const dated = project('dated', '2026-11-01');
    expect(migrationAccepted(loadStore(dated))).toBe(true);
  });

  it('A re-run of accept changes nothing it should keep', async () => {
    const root = project('rerun', '2026-10-19');
    const p = pkg();
    expect((await accept(root, p)).code).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'cortex/cortex.json'), 'utf8')).migration.accepted).toBe('2026-10-19');
    const once = snapshot(root);
    expect((await accept(root, p)).code).toBe(0);
    expect(snapshot(root)).toEqual(once);
  });
});

describe('store.migrate Rule 18: bundles', () => {
  it('Accept installs the day-to-day bundles', async () => {
    const root = project('install');
    const { code, text } = await accept(root, pkg([...FINAL_BUNDLES, 'cortex-migrate']));
    expect(code, text).toBe(0);
    for (const n of FINAL_BUNDLES) {
      expect(fs.existsSync(path.join(root, '.claude/skills', n, 'SKILL.md')), n).toBe(true);
      expect(fs.existsSync(path.join(root, '.claude/skills', n, INSTALLED_MARKER_FILENAME)), n).toBe(true);
    }
    expect(fs.existsSync(path.join(root, '.claude/skills/cortex-migrate'))).toBe(false);
    expect(fs.readdirSync(path.join(root, '.claude/skills')).filter((n) => n.startsWith('.cortex-tmp-'))).toEqual([]);
  });

  it('Accept ends at the right block stage', async () => {
    const root = project('stage');
    fs.mkdirSync(path.join(root, 'specflow'));
    const { code, text } = await accept(root, pkg());
    expect(code, text).toBe(0);
    expect(fs.existsSync(path.join(root, '.claude/skills/specflow-spec/SKILL.md'))).toBe(true);
    const block = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
    for (const line of SPECS_SECTION_STAGE2) expect(block).toContain(line);
  });

  it("A re-run never overwrites a project's edit", async () => {
    const root = project('edit');
    const dir = bundle(root, 'specflow-review', { 'SKILL.md': 'ours\n' });
    const { text } = await accept(root, pkg());
    expect(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')).toBe('ours\n');
    expect(text).toContain('skills: .claude/skills/specflow-review exists with different content; left alone');
  });

  it('A bundle the package lacks is skipped', async () => {
    const root = project('lacks');
    const { code, text } = await accept(root, pkg(FINAL_BUNDLES.filter((n) => n !== 'specflow-spec')));
    expect(code).toBe(0);
    expect(text).toContain('skills: specflow-spec is missing from the package; not installed');
  });

  it('The retired specflow bundles are listed, not deleted', async () => {
    const root = project('retired');
    const dev = bundle(root, 'specflow-develop', { 'SKILL.md': 'dev\n' });
    writeInstalledMarker(path.join(dev, INSTALLED_MARKER_FILENAME), hashDirectoryContent(dev, [INSTALLED_MARKER_FILENAME]));
    const plan = bundle(root, 'specflow-plan', { 'SKILL.md': 'plan\n' });
    const { text } = await accept(root, pkg());
    expect(text).toContain('- specflow-develop: unmodified');
    expect(text).toContain('- specflow-plan: modified or unmarked: check before removing');
    const cmd = text.split('\n').find((l) => l.startsWith('Removal command'))!;
    expect(cmd).toContain('.claude/skills/specflow-develop');
    expect(cmd).toContain('.claude/skills/specflow-plan');
    expect(fs.existsSync(dev)).toBe(true);
    expect(fs.existsSync(plan)).toBe(true);
  });
});

describe('store.migrate Rule 18 step 5: the project-skill scan', () => {
  it('A retired name is found, and only as a whole token', async () => {
    const root = project('token');
    bundle(root, 'release', { 'SKILL.md': 'run specflow-develop\n' });
    bundle(root, 'docs', { 'SKILL.md': 'run specflow-spec and specflow-onboard\n' });
    const s = section((await accept(root, pkg())).text);
    expect(s).toContain('project skills to adjust: 1');
    expect(s).toContain('- release/SKILL.md: specflow-develop');
    expect(s).not.toContain('docs');
  });

  it('Patterned names are found', async () => {
    const root = project('pattern');
    bundle(root, 'notes', { 'SKILL.md': 'x\n', 'references/notes.md': 'see cortex-pulse-distil and cortex-loop-hygiene\n' });
    const s = section((await accept(root, pkg())).text);
    const line = s.split('\n').find((l) => l.startsWith('- notes/references/notes.md:'))!;
    expect(line).toContain('cortex-loop-hygiene');
    expect(line).toContain('cortex-pulse-distil');
  });

  it('Both path terms are found, in any text file', async () => {
    const root = project('paths');
    bundle(root, 'p', { 'SKILL.md': 'read .cortex/compass\n', 'scripts/run.sh': 'cat .specflow/specs-business/x\n' });
    const s = section((await accept(root, pkg())).text);
    expect(s).toContain('- p/SKILL.md: .cortex/');
    expect(s).toContain('- p/scripts/run.sh: .specflow/');
  });

  it('The new paths do not match', async () => {
    const root = project('newpaths');
    bundle(root, 'p', { 'SKILL.md': 'specflow/impl/ and .cortex-migrate/\n' });
    const s = section((await accept(root, pkg())).text);
    expect(s).toContain('project skills to adjust: 0');
    expect(s).not.toContain('- p/');
  });

  it('The port does not change what is listed', async () => {
    const a = project('before');
    bundle(a, 'p', { 'SKILL.md': 'see .specflow/specs/a.spec.md\n' });
    fs.mkdirSync(path.join(a, '.specflow'));
    const b = project('after');
    bundle(b, 'p', { 'SKILL.md': 'see .specflow/specs/a.spec.md\n' });
    fs.mkdirSync(path.join(b, 'specflow'));
    const line = (t: string) => section(t).split('\n').find((l) => l.startsWith('- p/'));
    expect(line((await accept(a, pkg())).text)).toBe(line((await accept(b, pkg())).text));
    expect(line((await accept(b, pkg())).text)).toBe('- p/SKILL.md: .specflow/');
  });

  it('Packaged bundles are left out unless changed', async () => {
    const root = project('packaged');
    const p = pkg();
    fs.writeFileSync(path.join(p, 'skills/cortex-remember/SKILL.md'), 'read .cortex/\n');
    bundle(root, 'cortex-remember', { 'SKILL.md': 'read .cortex/\n' });
    bundle(root, 'verification-before-completion', { 'SKILL.md': 'run specflow-plan\n' });
    const s = section((await accept(root, p)).text);
    expect(s).not.toContain('cortex-remember');
    expect(s).toContain('- verification-before-completion/SKILL.md: specflow-plan');
  });

  it('A binary file and a symlink do not break the scan', async () => {
    const root = project('binary');
    bundle(root, 'p', { 'SKILL.md': 'x\n' });
    fs.writeFileSync(path.join(root, '.claude/skills/p/logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x2e, 0x63, 0x6f, 0x72, 0x74, 0x65, 0x78, 0x2f]));
    fs.symlinkSync(path.join(root, '.claude/skills/p'), path.join(root, '.claude/skills/linked'));
    const { code, text } = await accept(root, pkg());
    expect(code, text).toBe(0);
    expect(section(text)).toContain('- linked: symlink, not read');
    expect(section(text)).not.toContain('logo.png');
  });

  it('Core edits no project skill', async () => {
    const root = project('noedit');
    const dir = bundle(root, 'release', { 'SKILL.md': 'run specflow-develop\n' });
    const before = snapshot(dir);
    const p = pkg();
    const { text } = await accept(root, p);
    expect(snapshot(dir)).toEqual(before);
    const lines = section(text).trimEnd().split('\n');
    expect(lines.at(-1)).toBe(`Adjust them with the skill-adjust step of ${path.join(p, 'skills/cortex-migrate/SKILL.md')}`);
  });

  it('Retired bundles and cortex-migrate are left out of the scan', async () => {
    const root = project('leftout');
    bundle(root, 'specflow-develop', { 'SKILL.md': 'read .cortex/\n' });
    bundle(root, 'cortex-migrate', { 'SKILL.md': 'read .cortex/\n' });
    const dir = bundle(root, 'mine', { 'SKILL.md': 'nothing\n' });
    fs.writeFileSync(path.join(dir, INSTALLED_MARKER_FILENAME), '{"note":".cortex/"}\n');
    const s = section((await accept(root, pkg())).text);
    expect(s).toContain('project skills to adjust: 0');
    expect(s).not.toContain('Adjust them');
  });

  it('A step 2 bundle the package lacks is scanned', async () => {
    const root = project('lackscan');
    bundle(root, 'specflow-review', { 'SKILL.md': 'run specflow-plan\n' });
    const s = section((await accept(root, pkg(FINAL_BUNDLES.filter((n) => n !== 'specflow-review')))).text);
    expect(s).toContain('- specflow-review/SKILL.md: specflow-plan');
  });

  it('Lines and terms are ordered', async () => {
    const root = project('order');
    bundle(root, 'b', { 'SKILL.md': 'specflow-plan\n' });
    bundle(root, 'a', { 'SKILL.md': '.specflow/x .cortex/y specflow-plan\n' });
    const lines = section((await accept(root, pkg())).text).split('\n').filter((l) => l.startsWith('- '));
    expect(lines[0]).toBe('- a/SKILL.md: specflow-plan, .cortex/, .specflow/');
    expect(lines[1]).toBe('- b/SKILL.md: specflow-plan');
  });

  it('A symlink inside a bundle is listed, not counted', async () => {
    const root = project('innerlink');
    const dir = bundle(root, 'p', { 'SKILL.md': 'x\n' });
    fs.symlinkSync(root, path.join(dir, 'refs'));
    const s = section((await accept(root, pkg())).text);
    expect(s).toContain('project skills to adjust: 0');
    expect(s).toContain('- p/refs: symlink, not read');
  });

  it('An unedited older copy of a final bundle is not listed', async () => {
    const first = execFileSync('git', ['log', '--format=%h', '--reverse', '88895ca', '--', 'skills/verification-before-completion'], { cwd: REPO, encoding: 'utf8' }).split('\n')[0]!;
    const old = execFileSync('git', ['show', `${first}:skills/verification-before-completion/SKILL.md`], { cwd: REPO, encoding: 'utf8' });
    const root = project('older');
    bundle(root, 'verification-before-completion', { 'SKILL.md': old + '' });
    const s = section((await accept(root, pkg())).text);
    expect(s).not.toContain('verification-before-completion');
  });
});
