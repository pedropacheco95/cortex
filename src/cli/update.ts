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
import { hashDirectoryContent, INSTALLED_MARKER_FILENAME, packageRoot, readInstalledMarker, writeInstalledMarker } from './scaffold.js';
import { registrationStatus, writeTaskPayloads } from './tasks-register.js';
import { isAcceptedDate, STORE_CONFIG, storeDir } from '../store/layout.js';
import { writeMapAndBlocks } from '../store/managed-block.js';
import { FINAL_BUNDLES, TMP_BUNDLE_PREFIX, holdsSymlink, installWhole, isRetiredName, isShippedCopy, projectSkillLines } from '../store/migrate/system.js';
import { formatFinding, validateStore } from '../store/validate.js';
import { localToday } from '../store/types.js';

const SUPPORTED_MAJOR = 4;
const MANAGED_HOOK_LINE = '# cortex-managed';

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
  /** Rule 21's refresh: `cortex hooks install` without `specflow.since`. `refused` holds its Rule 12 lines. */
  refreshHooks?: (root: string) => { refused: string[] };
  /** Rule 21's read-only check of `specflow.git-hooks` Rule 12, for a dry run. */
  checkHooks?: (root: string) => string[];
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

function markerMatches(dir: string): boolean {
  const marker = readInstalledMarker(path.join(dir, INSTALLED_MARKER_FILENAME));
  return marker !== undefined && marker.sha256 === hashDirectoryContent(dir, [INSTALLED_MARKER_FILENAME]);
}

/** Rule 18. A bundle is renamed away first, so an interrupted removal never leaves part of one under its name. */
function removeRetired(skillsDir: string, pkg: string, dry: boolean, say: (l: string) => void): void {
  if (!fs.existsSync(skillsDir)) return;
  const skillAdjust = path.join(pkg, 'skills', 'cortex-migrate', 'SKILL.md');
  for (const e of fs.readdirSync(skillsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!isRetiredName(e.name)) continue;
    const dir = path.join(skillsDir, e.name);
    if (holdsSymlink(dir)) {
      say(`skills: ${e.name} is a symlink; left alone`);
    } else if (e.isDirectory() && (markerMatches(dir) || isShippedCopy(e.name, dir))) {
      if (!dry) {
        const gone = path.join(skillsDir, `${TMP_BUNDLE_PREFIX}${e.name}`);
        fs.renameSync(dir, gone);
        fs.rmSync(gone, { recursive: true, force: true });
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
    if (!lstat(dst)) {
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
    const want = hashDirectoryContent(src, [INSTALLED_MARKER_FILENAME]);
    if (hashDirectoryContent(dst, [INSTALLED_MARKER_FILENAME]) === want) {
      const markerPath = path.join(dst, INSTALLED_MARKER_FILENAME);
      if (!dry && readInstalledMarker(markerPath)?.sha256 !== want) writeInstalledMarker(markerPath, want);
    } else if (markerMatches(dst) || isShippedCopy(name, dst)) {
      if (!dry) install(skillsDir, name, src);
      say(`skills: updated ${name}`);
    } else {
      say(`skills: .claude/skills/${name} exists with different content; left alone`);
    }
  }
}

function clearLeftovers(skillsDir: string): void {
  if (!fs.existsSync(skillsDir)) return;
  for (const e of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (e.isDirectory() && e.name.startsWith(TMP_BUNDLE_PREFIX)) fs.rmSync(path.join(skillsDir, e.name), { recursive: true, force: true });
  }
}

const git = (root: string, args: string[]): { ok: boolean; out: string } => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
};

/** Rule 21, the first case that holds. */
function hooks(root: string, opts: UpdateOptions, dry: boolean, say: (l: string) => void): void {
  if (!git(root, ['rev-parse', '--git-dir']).ok) return say('hooks: not a git repository; skipped');
  const hooksPath = git(root, ['config', 'core.hooksPath']).out;
  const commitMsg = path.join(root, '.githooks', 'commit-msg');
  const installed = hooksPath === '.githooks' && fs.existsSync(commitMsg) && fs.readFileSync(commitMsg, 'utf8').includes(MANAGED_HOOK_LINE);
  if (installed) {
    if (!opts.refreshHooks && !opts.checkHooks) return say('hooks: refresh not available in this build; left alone');
    const blockers = dry ? (opts.checkHooks?.(root) ?? []) : (opts.refreshHooks?.(root).refused ?? []);
    if (blockers.length) for (const l of blockers) say(`hooks: ${l}`);
    else say('hooks: refreshed .githooks');
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
      if (!dry) clearLeftovers(skillsDir);
      removeRetired(skillsDir, pkg, dry, say);
      installFinal(skillsDir, pkg, dry, opts.install ?? installWhole, say);
    }) &&
    step('blocks', () => {
      if (dry) return say('blocks: refresh MAP.md and the managed blocks');
      out.push(...(opts.writeBlocks ?? writeMapAndBlocks)(root).lines);
    }) &&
    step('hooks', () => hooks(root, opts, dry, say)) &&
    step('tasks', () => tasks(root, home, appSupportDir, dry, say, plain));
  if (!ran) return { exitCode: 1, out };

  out.push(...projectSkillLines(root, pkg));
  if (dry) return { exitCode: 0, out };

  const validation = validateStore(root, opts.today ?? localToday());
  const errors = validation.findings.filter((f) => f.level === 'error');
  for (const f of errors) out.push(formatFinding(f));
  return { exitCode: errors.length ? 1 : 0, out };
}
