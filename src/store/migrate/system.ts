/**
 * `cortex migrate --accept`: retiring the 3.x system around the store (spec
 * store.migrate Rule 18, amendment 2026-10-19). It edits the hook settings
 * (removal only), installs the 4.0 final set, and lists, never deletes, the
 * superseded 3.x bundles, the project's scheduled-task payloads and the project
 * skills that name what is gone. `retireLegacySystem` deletes no file. The
 * whole-bundle helpers are shared with `cortex sync` (core-cli.sync Rule 19).
 */
import * as fs from 'fs';
import * as path from 'path';
import { hashDirectoryContent, INSTALLED_MARKER_FILENAME, packageRoot, readInstalledMarker, writeInstalledMarker } from '../../cli/scaffold.js';
import { SHIPPED_3X_HASHES } from './shipped-hashes.js';

export { SHIPPED_3X_HASHES };

/** The 3.x hook ownership marker (schema Part I §5; `check.hook-config`). */
const HOOK_MARKER = 'cortex hook ';
/** The bundles a 4.0 project keeps (Rule 18 step 2). `cortex-migrate` is read from the package (Rule 3). */
export const FINAL_BUNDLES: readonly string[] = [
  'cortex-remember',
  'cortex-learn',
  'cortex-fresh',
  'cortex-quality',
  'cortex-register-tasks',
  'verification-before-completion',
  'specflow-spec',
  'specflow-review',
  'specflow-onboard',
];
/** The names 4.0 retires (Rule 18 step 5). The two `*` entries are patterns. */
export const RETIRED_SKILL_NAMES: readonly string[] = [
  '_conventions',
  'cortex-archive-ingest',
  'cortex-extract-insight',
  'cortex-ingest',
  'cortex-loop',
  'cortex-loop-*',
  'cortex-pulse-*',
  'specflow-brainstorm',
  'specflow-bugs',
  'specflow-change-router',
  'specflow-deep-onboard',
  'specflow-develop',
  'specflow-entry',
  'specflow-ingest',
  'specflow-intent-reconcile',
  'specflow-lint',
  'specflow-new-project',
  'specflow-onboard-codebase',
  'specflow-plan',
  'specflow-receive-review',
  'specflow-request-review',
  'specflow-spec-editor',
  'specflow-tests',
  'specflow-viewer',
];
/** A bundle being built or removed; a leftover one is cleared by the next sync. */
export const TMP_BUNDLE_PREFIX = '.cortex-tmp-';
const OWNER_MARKER_RE = /<!--\s*cortex-project-root:\s*(.+?)\s*-->/;

type HookEntry = { command?: unknown };
type HookGroup = { matcher?: unknown; hooks?: HookEntry[] };

/** Remove every `cortex hook …` entry; drop matcher groups and events left empty. Returns the new object and the count removed. */
export function withoutCortexHooks(settings: Record<string, unknown>): { settings: Record<string, unknown>; removed: number } {
  const hooks = settings['hooks'];
  if (hooks === null || typeof hooks !== 'object' || Array.isArray(hooks)) return { settings, removed: 0 };
  let removed = 0;
  const next: Record<string, unknown> = {};
  for (const [event, groups] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(groups)) {
      next[event] = groups;
      continue;
    }
    const kept: HookGroup[] = [];
    for (const g of groups as HookGroup[]) {
      if (!g || !Array.isArray(g.hooks)) {
        kept.push(g);
        continue;
      }
      const left = g.hooks.filter((h) => !(typeof h?.command === 'string' && h.command.startsWith(HOOK_MARKER)));
      removed += g.hooks.length - left.length;
      if (left.length) kept.push({ ...g, hooks: left });
    }
    if (kept.length) next[event] = kept;
  }
  const out = { ...settings };
  if (Object.keys(next).length) out['hooks'] = next;
  else delete out['hooks'];
  return { settings: out, removed };
}

export interface SystemReport { lines: string[] }

function unregisterHooks(root: string, lines: string[]): void {
  for (const name of ['settings.json', 'settings.local.json']) {
    const p = path.join(root, '.claude', name);
    if (!fs.existsSync(p)) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      lines.push(`hooks: .claude/${name} does not parse; left untouched (remove its "cortex hook" entries by hand)`);
      continue;
    }
    const { settings, removed } = withoutCortexHooks(parsed);
    if (!removed) continue;
    fs.writeFileSync(p, JSON.stringify(settings, null, 2) + '\n');
    lines.push(`hooks: removed ${removed} "cortex hook" entr${removed === 1 ? 'y' : 'ies'} from .claude/${name} (rewritten as 2-space JSON; its formatting may have changed)`);
  }
}

export function isRetiredName(name: string): boolean {
  return RETIRED_SKILL_NAMES.some((r) => (r.endsWith('*') ? name.startsWith(r.slice(0, -1)) && name.length >= r.length : name === r));
}

/** True when `dir` is a symbolic link or holds one anywhere under it. */
export function holdsSymlink(dir: string): boolean {
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink()) return true;
  if (!stat.isDirectory()) return false;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) return true;
    if (e.isDirectory() && holdsSymlink(path.join(dir, e.name))) return true;
  }
  return false;
}

/** core-cli.sync Rule 27: the bundle is byte for byte a version Cortex shipped. */
export function isShippedCopy(name: string, dir: string): boolean {
  return SHIPPED_3X_HASHES[name]?.includes(hashDirectoryContent(dir, [INSTALLED_MARKER_FILENAME])) ?? false;
}

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * Put a whole bundle in place: built beside the target with its marker, then
 * renamed, so an interrupted run leaves the old bundle or the new one
 * (core-cli.sync Rule 19).
 */
export function installWhole(skillsDir: string, name: string, src: string): void {
  const tmp = path.join(skillsDir, `${TMP_BUNDLE_PREFIX}${name}`);
  const dst = path.join(skillsDir, name);
  fs.rmSync(tmp, { recursive: true, force: true });
  copyDir(src, tmp);
  writeInstalledMarker(path.join(tmp, INSTALLED_MARKER_FILENAME), hashDirectoryContent(src, [INSTALLED_MARKER_FILENAME]));
  const old = path.join(skillsDir, `${TMP_BUNDLE_PREFIX}old-${name}`);
  if (fs.existsSync(dst)) fs.renameSync(dst, old);
  fs.renameSync(tmp, dst);
  fs.rmSync(old, { recursive: true, force: true });
}

function installBundles(root: string, pkg: string, lines: string[]): void {
  const skillsDir = path.join(root, '.claude', 'skills');
  for (const name of FINAL_BUNDLES) {
    const src = path.join(pkg, 'skills', name);
    if (!fs.existsSync(path.join(src, 'SKILL.md'))) {
      lines.push(`skills: ${name} is missing from the package; not installed`);
      continue;
    }
    const dst = path.join(skillsDir, name);
    const want = hashDirectoryContent(src, [INSTALLED_MARKER_FILENAME]);
    if (present(dst)) {
      if (holdsSymlink(dst) || hashDirectoryContent(dst, [INSTALLED_MARKER_FILENAME]) !== want) {
        lines.push(`skills: .claude/skills/${name} exists with different content; left alone`);
        continue;
      }
      writeInstalledMarker(path.join(dst, INSTALLED_MARKER_FILENAME), want);
    } else {
      fs.mkdirSync(skillsDir, { recursive: true });
      installWhole(skillsDir, name, src);
    }
    lines.push(`skills: installed ${name} into .claude/skills/`);
  }
}

/** Present on disk, a dangling symbolic link included. */
function present(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

function listSuperseded(root: string, lines: string[]): void {
  const dir = path.join(root, '.claude', 'skills');
  if (!fs.existsSync(dir)) return;
  const names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && isRetiredName(e.name)).map((e) => e.name).sort();
  if (!names.length) return;
  lines.push('', `Superseded 3.x skill bundles (${names.length}, not deleted):`);
  for (const n of names) {
    const b = path.join(dir, n);
    const marker = readInstalledMarker(path.join(b, INSTALLED_MARKER_FILENAME));
    const unmodified = marker !== undefined && !holdsSymlink(b) && marker.sha256 === hashDirectoryContent(b, [INSTALLED_MARKER_FILENAME]);
    lines.push(`- ${n}: ${unmodified ? 'unmodified' : 'modified or unmarked: check before removing'}`);
  }
  const paths = names.map((n) => `.claude/skills/${n}`).join(' ');
  lines.push(`Removal command (not run): \`git rm -r -q --ignore-unmatch ${paths} && rm -rf ${paths}\``);
}

const NAME_CHAR = 'A-Za-z0-9_-';
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SCAN_TERMS: readonly { entry: string; re: RegExp }[] = RETIRED_SKILL_NAMES.map((entry) => ({
  entry,
  re: new RegExp(`(?<![${NAME_CHAR}])${escapeRe(entry.replace(/\*$/, ''))}${entry.endsWith('*') ? `[${NAME_CHAR}]+` : `(?![${NAME_CHAR}])`}`, 'g'),
}));

/** The terms a text names, in the order of the retired list, then the two store paths. */
function termsIn(text: string): string[] {
  const found: string[] = [];
  for (const { re } of SCAN_TERMS) found.push(...[...new Set(text.match(re) ?? [])].sort());
  for (const p of ['.cortex/', '.specflow/']) if (text.includes(p)) found.push(p);
  return found;
}

/** Is this bundle left out of the scan? (Rule 18 step 5) */
function leftOutOfScan(name: string, dir: string, pkg: string): boolean {
  if (isRetiredName(name) || name === 'cortex-migrate' || name.startsWith(TMP_BUNDLE_PREFIX)) return true;
  if (!FINAL_BUNDLES.includes(name) || holdsSymlink(dir)) return false;
  const shipped = path.join(pkg, 'skills', name);
  const identical = fs.existsSync(shipped) && hashDirectoryContent(shipped, [INSTALLED_MARKER_FILENAME]) === hashDirectoryContent(dir, [INSTALLED_MARKER_FILENAME]);
  return identical || isShippedCopy(name, dir);
}

function scanFile(abs: string, rel: string, out: { line: string; counted: boolean }[]): void {
  const bytes = fs.readFileSync(abs);
  if (bytes.subarray(0, 8000).includes(0)) return;
  const terms = termsIn(bytes.toString('utf8'));
  if (terms.length) out.push({ line: `- ${rel}: ${terms.join(', ')}`, counted: true });
}

function scanBundle(dir: string, rel: string, out: { line: string; counted: boolean }[]): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const r = `${rel}/${e.name}`;
    if (e.isSymbolicLink()) out.push({ line: `- ${r}: symlink, not read`, counted: false });
    else if (e.isDirectory()) scanBundle(abs, r, out);
    else if (e.name !== INSTALLED_MARKER_FILENAME) scanFile(abs, r, out);
  }
}

/** The `project skills to adjust` section (Rule 18 step 5), also printed by `cortex sync`. */
export function projectSkillLines(root: string, pkg: string): string[] {
  const dir = path.join(root, '.claude', 'skills');
  const found: { line: string; counted: boolean }[] = [];
  if (fs.existsSync(dir)) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) found.push({ line: `- ${e.name}: symlink, not read`, counted: false });
      else if (e.isDirectory() && !leftOutOfScan(e.name, path.join(dir, e.name), pkg)) scanBundle(path.join(dir, e.name), e.name, found);
    }
  }
  const n = found.filter((f) => f.counted).length;
  const lines = [`project skills to adjust: ${n}`, ...found.map((f) => f.line).sort()];
  if (n > 0) lines.push(`Adjust them with the skill-adjust step of ${path.join(pkg, 'skills', 'cortex-migrate', 'SKILL.md')}`);
  return lines;
}

function listTasks(root: string, home: string, lines: string[]): void {
  const dir = path.join(home, '.claude', 'scheduled-tasks');
  const mine: string[] = [];
  if (fs.existsSync(dir)) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const skill = path.join(dir, e.name, 'SKILL.md');
      if (!fs.existsSync(skill)) continue;
      const m = OWNER_MARKER_RE.exec(fs.readFileSync(skill, 'utf8'));
      if (m && path.resolve(m[1]!) === path.resolve(root)) mine.push(e.name);
    }
  }
  lines.push('', `Scheduled tasks for this project (${mine.length}, not touched):`);
  for (const n of mine) lines.push(`- ${n} (${path.join(dir, n)})`);
  if (mine.length) lines.push('Disable each in the Claude Code Desktop app before deleting its folder: removing the folder alone may not unregister the task.');
}

/** Rule 18, steps 1–5. */
export function retireLegacySystem(root: string, home: string, pkg: string = packageRoot()): SystemReport {
  const lines: string[] = [];
  unregisterHooks(root, lines);
  installBundles(root, pkg, lines);
  listSuperseded(root, lines);
  listTasks(root, home, lines);
  lines.push('', ...projectSkillLines(root, pkg));
  return { lines };
}
