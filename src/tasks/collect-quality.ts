/**
 * `cortex tasks collect quality` (spec loops.quality-task Rules 2 to 4): what
 * the weekly task reads. Read-only, and it exits 0 whatever it finds.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { buildModel, counts, naturalCompare, readConfig, type Model, type ModelSpec } from '../specflow/model/model.js';
import { frontmatter } from '../specflow/model/spec.js';
import { workTree } from '../specflow/model/tree.js';
import { extractMessages, extractToolUses, listSessions, readSessionFile } from '../sessions/read.js';
import { loadStore, type Store } from '../store/layout.js';
import { isScheduled, projectPaths } from './collect-learn.js';

export const ROTATION_SIZE = 5;
const USAGE_WINDOW_DAYS = 7;
const READBACK = /^(?:Filing|Updated|Proposed):/;

export interface LintCounts { exit: number; errors: number; warnings: number }

export interface Usage {
  sessions: number;
  cortexReads: number;
  readbacks: number;
  sessionsWithReadback: number;
  digests: number;
  filed: number;
  alreadyThere: number;
  skipped: number;
}

export interface CollectQualityResult {
  ported: boolean;
  lint: LintCounts | null;
  coverage: { criteria: number; tagged: number; unverified: string[]; untaggedTests: number } | null;
  rotation: string[];
  area: string | null;
  testCommand: string | null;
  usage: Usage;
  store: { filesPerFolder: Record<string, number>; filesNeverRead: number; filesWithoutVerified: number };
}

/** `cortex specs lint --json`, from the same package. */
function runLint(root: string): LintCounts {
  const cli = fileURLToPath(new URL('../cli/cli.js', import.meta.url));
  const r = spawnSync(process.execPath, [cli, 'specs', 'lint', '--json'], { cwd: root, encoding: 'utf-8' });
  try {
    const parsed = JSON.parse(r.stdout) as { counts: { error: number; warning: number } };
    return { exit: r.status ?? 1, errors: parsed.counts.error, warnings: parsed.counts.warning };
  } catch {
    return { exit: r.status ?? 1, errors: 0, warnings: 0 };
  }
}

/** The newest date each spec has in a `## Reviewed specs` section (Rule 3). */
function lastReviews(root: string): Map<string, string> {
  const dir = path.join(root, 'cortex', 'history', 'measurements');
  const reviews = new Map<string, string>();
  if (!fs.existsSync(dir)) return reviews;
  for (const name of fs.readdirSync(dir).filter((n) => /-quality(-\d+)?\.md$/.test(n))) {
    const section = /^## Reviewed specs\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(fs.readFileSync(path.join(dir, name), 'utf-8'));
    if (!section) continue;
    for (const m of (section[1] as string).matchAll(/^- (\S+) (\d{4}-\d{2}-\d{2})$/gm)) {
      const [id, date] = [m[1] as string, m[2] as string];
      if ((reviews.get(id) ?? '') < date) reviews.set(id, date);
    }
  }
  return reviews;
}

function lastCommit(root: string, pathspecs: string[]): number {
  try {
    const out = execFileSync('git', ['-C', root, 'log', '-1', '--format=%ct', '--', ...pathspecs], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return Number(out.trim()) || 0;
  } catch {
    return 0;
  }
}

/** A `governs:` file committed after the spec's own last commit. */
function drifted(root: string, spec: ModelSpec): boolean {
  const governs = frontmatter(fs.readFileSync(path.join(root, spec.file), 'utf-8'))['governs'];
  if (!Array.isArray(governs) || governs.length === 0) return false;
  return lastCommit(root, governs.map((g) => `:(glob)${String(g)}`)) > lastCommit(root, [spec.file]);
}

export function rotation(root: string, model: Model): ModelSpec[] {
  const reviews = lastReviews(root);
  const drift = new Map<string, boolean>();
  const isDrifted = (s: ModelSpec): boolean => {
    if (!drift.has(s.id)) drift.set(s.id, drifted(root, s));
    return drift.get(s.id) as boolean;
  };
  return model.specs
    .filter((s) => s.status !== 'retired')
    .sort((a, b) => {
      const [ra, rb] = [reviews.get(a.id) ?? '', reviews.get(b.id) ?? ''];
      if (ra !== rb) return ra < rb ? -1 : 1;
      const [da, db] = [isDrifted(a), isDrifted(b)];
      if (da !== db) return da ? -1 : 1;
      return naturalCompare(a.id, b.id);
    })
    .slice(0, ROTATION_SIZE);
}

function day(today: string, offset: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
}

function listItems(text: string, heading: string): number {
  const section = new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(text);
  return section ? (section[1] as string).split('\n').filter((l) => l.startsWith('- ')).length : 0;
}

function usage(root: string, home: string, today: string): { usage: Usage; read: Set<string> } {
  const from = Date.parse(`${day(today, -USAGE_WINDOW_DAYS)}T00:00:00Z`);
  const to = Date.parse(`${day(today, 1)}T00:00:00Z`);
  const paths = projectPaths(root);
  const prefixes = paths.map((p) => path.join(p, 'cortex') + path.sep);
  const u: Usage = { sessions: 0, cortexReads: 0, readbacks: 0, sessionsWithReadback: 0, digests: 0, filed: 0, alreadyThere: 0, skipped: 0 };
  const read = new Set<string>();
  const seen = new Set<string>();
  for (const p of paths) {
    for (const s of listSessions(p, { home })) {
      const t = s.mtime.getTime();
      if (seen.has(s.id) || t < from || t >= to) continue;
      seen.add(s.id);
      if (isScheduled(s)) continue;
      u.sessions++;
      const { entries } = readSessionFile(s.path);
      for (const use of extractToolUses(entries)) {
        const hit = use.name === 'Read' ? prefixes.find((x) => use.filePath?.startsWith(x)) : undefined;
        if (hit === undefined) continue;
        u.cortexReads++;
        read.add((use.filePath as string).slice(hit.length).split(path.sep).join('/'));
      }
      const lines = extractMessages(entries).filter((m) => m.role === 'assistant').flatMap((m) => m.text.split('\n'));
      const readbacks = lines.filter((l) => READBACK.test(l)).length;
      u.readbacks += readbacks;
      if (readbacks > 0) u.sessionsWithReadback++;
    }
  }
  const sources = path.join(root, 'cortex', 'history', 'sources');
  if (fs.existsSync(sources)) {
    for (const name of fs.readdirSync(sources)) {
      const m = /^(\d{4}-\d{2}-\d{2})-session-.+\.md$/.exec(name);
      if (!m || (m[1] as string) < day(today, -USAGE_WINDOW_DAYS) || (m[1] as string) > today) continue;
      const text = fs.readFileSync(path.join(sources, name), 'utf-8');
      u.digests++;
      u.filed += listItems(text, 'Filed');
      u.alreadyThere += listItems(text, 'Already there');
      u.skipped += listItems(text, 'Skipped');
    }
  }
  return { usage: u, read };
}

function storeShape(store: Store, read: Set<string>): CollectQualityResult['store'] {
  const files = store.files.filter((f) => f.module !== null);
  const filesPerFolder: Record<string, number> = {};
  for (const f of files) {
    const key = f.module === 'code' ? 'code' : f.module === 'now' ? 'now' : (f.folder as string);
    filesPerFolder[key] = (filesPerFolder[key] ?? 0) + 1;
  }
  return {
    filesPerFolder,
    filesNeverRead: files.filter((f) => !read.has(f.path)).length,
    filesWithoutVerified: files.filter((f) => f.verified === null || !('date' in f.verified)).length,
  };
}

export function collectQuality(opts: { projectRoot: string; home: string; today: string; lint?: (root: string) => LintCounts }): CollectQualityResult {
  const root = path.resolve(opts.projectRoot);
  const tree = workTree(root);
  const ported = fs.existsSync(path.join(root, 'specflow', 'INDEX.md'));
  const model = ported ? buildModel(tree) : null;
  const specs = model === null ? [] : rotation(root, model);
  const first = specs[0];
  const c = model === null ? null : counts(model);
  const { usage: u, read } = usage(root, opts.home, opts.today);
  return {
    ported,
    lint: ported ? (opts.lint ?? runLint)(root) : null,
    coverage: model === null || c === null ? null : {
      criteria: c['criteria'] as number,
      tagged: c['tagged'] as number,
      unverified: model.specs.flatMap((s) => s.criteria).filter((x) => x.unverified).map((x) => x.id),
      untaggedTests: c['untagged'] as number,
    },
    rotation: specs.map((s) => s.id),
    area: first === undefined ? null : (first.file.split('/')[2] as string),
    testCommand: readConfig(tree).testCommand ?? null,
    usage: u,
    store: storeShape(loadStore(root), read),
  };
}
