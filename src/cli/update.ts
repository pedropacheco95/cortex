/**
 * `cortex sync` at 4.0: the update route (spec core-cli.sync Rules 16–27). It
 * removes retired skills, installs and updates the final set, refreshes the
 * map, the blocks and the git hooks, writes the task payloads, and reports. It
 * never registers a task and never touches a local edit. A project on the 3.x
 * store is refused here; `sync()` in sync.ts is the 3.x record.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { packageRoot } from './scaffold.js';
import { registrationStatus, writeTaskPayloads } from './tasks-register.js';
import { isAcceptedDate, STORE_CONFIG, storeDir } from '../store/layout.js';
import { writeMapAndBlocks } from '../store/managed-block.js';
import { FINAL_BUNDLES, TMP_BUNDLE_PREFIX, assertTempFree, backfillMarker, bundleHash, holdsSymlink, installWhole, isEmptyBundle, isLeftover, isRetiredName, isShippedCopy, markerMatches, projectSkillLines, removeTree, skillsFolderIsLink } from '../store/migrate/system.js';
import { handWrittenHooks, installHooks } from '../specflow/hooks-install.js';
import { formatFinding, validateStore } from '../store/validate.js';
import { localToday } from '../store/types.js';

const SUPPORTED_MAJOR = 4;
const MANAGED_HOOK_MARK = '# cortex-managed';

export interface UpdateOptions {
  platform?: string;
  home?: string;
  appSupportDir?: string;
  /** Package root holding `skills/` (tests pass their own). */
  packageDir?: string;
  dryRun?: boolean;
  today?: string;
  /** Rule 20's step. */
  writeBlocks?: (root: string) => { lines: string[] };
  /** Rule 19's install. */
  install?: (skillsDir: string, name: string, src: string) => void;
}

export interface UpdateResult { exitCode: number; out: string[] }

const refused = (exitCode: number, why: string): UpdateResult => ({ exitCode, out: [`cortex sync: refused — ${why} Nothing was written.`] });

/** Rule 16. Null means the project takes the update route. */
function gate(root: string, platform: string): UpdateResult | null {
  if (platform !== 'darwin') return refused(2, `Cortex v1 requires macOS (darwin); this platform reports "${platform}".`);
  const legacy = fs.existsSync(path.join(root, '.cortex', 'cortex.config.json'));
  const cfgPath = path.join(storeDir(root), STORE_CONFIG);
  if (fs.existsSync(cfgPath)) {
    let cfg: Record<string, unknown>;
    try {
      cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as Record<string, unknown>;
    } catch (err) {
      return refused(3, `cortex/cortex.json is not valid: ${(err as Error).message}.`);
    }
    const version = cfg?.['schemaVersion'];
    if (typeof version !== 'string') return refused(3, 'cortex/cortex.json is not valid: it has no schemaVersion.');
    if (parseInt(version, 10) !== SUPPORTED_MAJOR) return refused(3, `this store is schema ${version} and this package supports ${SUPPORTED_MAJOR}.x.`);
    if ('migration' in cfg) {
      const accepted = (cfg['migration'] as Record<string, unknown> | null)?.['accepted'];
      if (isAcceptedDate(accepted)) return null;
      return refused(3, "this project's migration is not accepted; finish it with cortex migrate --accept.");
    }
    if (!legacy) return null;
  }
  if (legacy) return refused(3, 'this project is on the 3.x store; migrate it first with cortex migrate.');
  return refused(2, `no Cortex store found at ${root}; set one up with cortex init.`);
}

const lstat = (p: string): fs.Stats | undefined => fs.lstatSync(p, { throwIfNoEntry: false });

/** Rule 18. A bundle is renamed away first, so an interrupted removal never leaves part of one under its name. */
function removeRetired(skillsDir: string, pkg: string, dry: boolean, say: (l: string) => void): void {
  if (!fs.existsSync(skillsDir)) return;
  const skillAdjust = path.join(pkg, 'skills', 'cortex-migrate', 'SKILL.md');
  for (const e of fs.readdirSync(skillsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!isRetiredName(e.name)) continue;
    const dir = path.join(skillsDir, e.name);
    if (holdsSymlink(dir)) {
      say(`skills: ${e.name} is a symlink; left alone`);
    } else if (e.isDirectory() && isEmptyBundle(dir)) {
      continue;
    } else if (e.isDirectory() && (markerMatches(dir) || isShippedCopy(e.name, dir))) {
      assertTempFree(skillsDir, e.name, true);
      if (!dry) {
        const gone = path.join(skillsDir, `${TMP_BUNDLE_PREFIX}${e.name}`);
        fs.renameSync(dir, gone);
        removeTree(gone);
      }
      say(`skills: removed ${e.name}`);
    } else if (e.isDirectory()) {
      say(`skills: ${e.name} is retired but has local edits; left for the skill-adjust step of ${skillAdjust}`);
    }
  }
}

/** Rule 19. */
function installFinal(skillsDir: string, pkg: string, dry: boolean, install: NonNullable<UpdateOptions['install']>, say: (l: string) => void): void {
  for (const name of FINAL_BUNDLES) {
    const src = path.join(pkg, 'skills', name);
    const dst = path.join(skillsDir, name);
    if (!lstat(dst) || isEmptyBundle(dst)) {
      assertTempFree(skillsDir, name);
      if (!dry) {
        fs.mkdirSync(skillsDir, { recursive: true });
        install(skillsDir, name, src);
      }
      say(`skills: installed ${name}`);
      continue;
    }
    if (holdsSymlink(dst)) {
      say(`skills: ${name} is a symlink; left alone`);
      continue;
    }
    if (!lstat(dst)!.isDirectory()) {
      say(`skills: .claude/skills/${name} exists with different content; left alone`);
      continue;
    }
    const want = bundleHash(src);
    if (bundleHash(dst) === want) {
      if (!backfillMarker(dst, want, dry)) say(`skills: ${name}: marker not written; left alone`);
    } else if (markerMatches(dst) || isShippedCopy(name, dst)) {
      assertTempFree(skillsDir, name);
      if (!dry) install(skillsDir, name, src);
      say(`skills: updated ${name}`);
    } else {
      say(`skills: .claude/skills/${name} exists with different content; left alone`);
    }
  }
}

/** Rule 19: only folders Cortex generated, each named. */
function clearLeftovers(skillsDir: string, dry: boolean, say: (l: string) => void): void {
  if (!fs.existsSync(skillsDir)) return;
  for (const e of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!e.isDirectory() || !isLeftover(e.name)) continue;
    if (!dry) removeTree(path.join(skillsDir, e.name));
    say(`skills: cleared leftover ${e.name}`);
  }
}

const git = (root: string, args: string[]): { ok: boolean; out: string } => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
};

/** Rule 21, the first case that holds. */
function hooks(root: string, dry: boolean, say: (l: string) => void): void {
  if (!git(root, ['rev-parse', '--git-dir']).ok) return say('hooks: not a git repository; skipped');
  const hooksPath = git(root, ['config', 'core.hooksPath']).out;
  const commitMsg = path.join(root, '.githooks', 'commit-msg');
  const isInstalled = hooksPath === '.githooks' && lstat(commitMsg)?.isFile() === true && fs.readFileSync(commitMsg, 'utf8').includes(MANAGED_HOOK_MARK);
  if (isInstalled) {
    if (dry) {
      const blockers = handWrittenHooks(root);
      for (const name of blockers) say(`hooks: specflow: .githooks/${name} is not a Cortex hook; nothing was changed. Move it to .git/hooks/${name}, where it keeps running, and run this again.`);
      if (!blockers.length) say('hooks: refreshed .githooks');
      return;
    }
    const refusals: string[] = [];
    const code = installHooks(root, { writeSince: false }, { stdout: () => {}, stderr: (l) => void refusals.push(l) });
    if (code === 0) say('hooks: refreshed .githooks');
    else for (const l of refusals) say(`hooks: ${l}`);
    return;
  }
  if (!fs.existsSync(path.join(root, 'specflow'))) return say('hooks: no specflow/ folder; skipped');
  if (hooksPath === '' || hooksPath === '.githooks') return say('hooks: not installed; run cortex hooks install');
  say(`hooks: core.hooksPath is ${hooksPath}; add the hooks there by hand`);
}

/** Rule 22. Never registers: only a Desktop session has the app's scheduling tools. */
function tasks(root: string, home: string, appSupportDir: string, dry: boolean, say: (l: string) => void, plain: (l: string) => void): void {
  const r = writeTaskPayloads({ projectRoot: root, home, dryRun: dry });
  for (const n of r.written) say(`tasks: installed payload ${n}`);
  for (const n of r.updated) say(`tasks: updated payload ${n}`);
  for (const n of r.kept) say(`tasks: ${n} has local edits; left alone`);
  const status = registrationStatus({ projectRoot: root, home, appSupportDir });
  if (status.unregistered.length === 0) plain(`tasks: all ${status.total} registered`);
  else plain(`tasks: ${status.unregistered.length} of ${status.total} not registered; in a Claude Desktop session for this project, type /cortex-register-tasks (plain words will not run it)`);
}

export async function updateRoute(target: string, opts: UpdateOptions = {}): Promise<UpdateResult> {
  const root = path.resolve(target);
  const blocked = gate(root, opts.platform ?? process.platform);
  if (blocked) return blocked;

  const pkg = opts.packageDir ?? packageRoot();
  const lacking = FINAL_BUNDLES.filter((n) => !fs.existsSync(path.join(pkg, 'skills', n, 'SKILL.md')));
  if (lacking.length) return refused(1, `this package lacks ${lacking.join(', ')}.`);

  const dry = opts.dryRun === true;
  const home = opts.home ?? os.homedir();
  const appSupportDir = opts.appSupportDir ?? path.join(home, 'Library', 'Application Support', 'Claude');
  const skillsDir = path.join(root, '.claude', 'skills');
  const out: string[] = [];
  const plain = (l: string): void => void out.push(l);
  const say = (l: string): void => void out.push(dry ? `would: ${l}` : l);
  const step = (name: string, work: () => void): boolean => {
    try {
      work();
      return true;
    } catch (err) {
      out.push(`cortex sync: stopped at ${name}: ${(err as Error).message}`);
      return false;
    }
  };

  const ran =
    step('skills', () => {
      if (skillsFolderIsLink(root)) return say('skills: .claude/skills is a symlink; left alone');
      clearLeftovers(skillsDir, dry, say);
      removeRetired(skillsDir, pkg, dry, say);
      installFinal(skillsDir, pkg, dry, opts.install ?? installWhole, say);
    }) &&
    step('blocks', () => {
      if (dry) return say('blocks: refresh MAP.md and the managed blocks');
      out.push(...(opts.writeBlocks ?? writeMapAndBlocks)(root).lines);
    }) &&
    step('hooks', () => hooks(root, dry, say)) &&
    step('tasks', () => tasks(root, home, appSupportDir, dry, say, plain));
  if (!ran) return { exitCode: 1, out };

  if (!step('skills', () => out.push(...projectSkillLines(root, pkg)))) return { exitCode: 1, out };
  if (dry) return { exitCode: 0, out };

  let failed = false;
  const validated = step('validate', () => {
    const errors = validateStore(root, opts.today ?? localToday()).findings.filter((f) => f.level === 'error');
    for (const f of errors) out.push(formatFinding(f));
    failed = errors.length > 0;
  });
  return { exitCode: validated && !failed ? 0 : 1, out };
}
