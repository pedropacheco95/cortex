/**
 * `cortex migrate --accept`: retiring the 3.x system around the store (spec
 * store.migrate Rule 18, amendment 2026-10-19). It edits the hook settings
 * (removal only), installs the 4.0 day-to-day bundle, and lists, never
 * deletes, the superseded 3.x bundles and the project's scheduled-task
 * payloads. Nothing here deletes a file.
 */
import * as fs from 'fs';
import * as path from 'path';
import { hashDirectoryContent, INSTALLED_MARKER_FILENAME, packageRoot, readInstalledMarker, writeInstalledMarker } from '../../cli/scaffold.js';

/** The 3.x hook ownership marker (schema Part I §5; `check.hook-config`). */
const HOOK_MARKER = 'cortex hook ';
/** 4.0 bundles accept installs into a migrated project. `cortex-migrate` is read from the package (Rule 3). */
const INSTALL_BUNDLES = ['cortex-remember'];
const SUPERSEDED = new Set(['cortex-archive-ingest', 'cortex-extract-insight', 'cortex-loop', 'cortex-register-tasks']);
const SKIP_NAMING_CHECK = new Set(['cortex-remember', 'cortex-migrate']);
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

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function installBundles(root: string, lines: string[]): void {
  for (const name of INSTALL_BUNDLES) {
    const src = path.join(packageRoot(), 'skills', name);
    if (!fs.existsSync(path.join(src, 'SKILL.md'))) {
      lines.push(`skills: ${name} is missing from the package; not installed`);
      continue;
    }
    const dst = path.join(root, '.claude', 'skills', name);
    const want = hashDirectoryContent(src, [INSTALLED_MARKER_FILENAME]);
    if (fs.existsSync(dst)) {
      const have = hashDirectoryContent(dst, [INSTALLED_MARKER_FILENAME]);
      if (have !== want) {
        lines.push(`skills: .claude/skills/${name} exists with different content; left alone`);
        continue;
      }
    } else copyDir(src, dst);
    writeInstalledMarker(path.join(dst, INSTALLED_MARKER_FILENAME), want);
    lines.push(`skills: installed ${name} into .claude/skills/`);
  }
}

/** True when the bundle's SKILL.md or any markdown/text file under it names `.cortex/` (Rule 18 step 5). */
function bundleNamesLegacyStore(bundle: string): boolean {
  const stack = [bundle];
  while (stack.length) {
    const d = stack.pop()!;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (/\.(md|txt|ya?ml|json)$/.test(e.name) && e.name !== INSTALLED_MARKER_FILENAME && fs.readFileSync(p, 'utf8').includes('.cortex/')) return true;
    }
  }
  return false;
}

function listSuperseded(root: string, lines: string[]): void {
  const dir = path.join(root, '.claude', 'skills');
  if (!fs.existsSync(dir)) return;
  const names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && (SUPERSEDED.has(e.name) || e.name.startsWith('cortex-loop-'))).map((e) => e.name).sort();
  const naming: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    if (SUPERSEDED.has(e.name) || e.name.startsWith('cortex-loop-') || SKIP_NAMING_CHECK.has(e.name)) continue;
    if (bundleNamesLegacyStore(path.join(dir, e.name))) naming.push(e.name);
  }
  if (names.length) {
    lines.push('', `Superseded 3.x skill bundles (${names.length}, not deleted):`);
    for (const n of names) {
      const b = path.join(dir, n);
      const marker = readInstalledMarker(path.join(b, INSTALLED_MARKER_FILENAME));
      const unmodified = marker !== undefined && marker.sha256 === hashDirectoryContent(b, [INSTALLED_MARKER_FILENAME]);
      lines.push(`- ${n}: ${unmodified ? 'unmodified' : 'modified or unmarked: check before removing'}`);
    }
    const paths = names.map((n) => `.claude/skills/${n}`).join(' ');
    lines.push(`Removal command (not run): \`git rm -r -q --ignore-unmatch ${paths} && rm -rf ${paths}\``);
  }
  lines.push(`installed skills that still name .cortex/: ${naming.length}${naming.length ? ` (${naming.join(', ')})` : ''}`);
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
export function retireLegacySystem(root: string, home: string): SystemReport {
  const lines: string[] = [];
  unregisterHooks(root, lines);
  installBundles(root, lines);
  listSuperseded(root, lines);
  listTasks(root, home, lines);
  return { lines };
}
