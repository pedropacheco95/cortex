/**
 * `cortex loop-atlas-staleness` — monthly project-memory review (spec
 * loops.atlas-staleness, design §11.4 item 6). Reviews `.cortex/atlas/**` for
 * age and orphanhood and writes `.cortex/pulse/reports/atlas-review.md` — nothing
 * else. Propose-don't-mutate. Deterministic Core (R-001); reference
 * resolution reused from the validator (index-build).
 *
 * v1 signals (Rule 2): (a) decisions older than the threshold still cited →
 * re-verify candidates; (b) sources older than the threshold referenced by
 * nothing → archive candidates; (c) atlas entries whose own cross-refs no
 * longer resolve → dead-link findings.
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { buildIndex, resolveId, resolveRelativePath } from '../schema/index-build.js';
import { writePulseReport } from './report.js';

/** Engineering-call constant (Rule 2 / Notes) — stated in the report footer. */
export const ATLAS_STALE_AGE_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReverifyCandidate {
  id: string;
  file: string;
  ageDays: number;
  /** Who still leans on it (rule IDs / atlas entry IDs). */
  citers: string[];
}

export interface ArchiveCandidate {
  /** Project-relative source path. */
  file: string;
  ageDays: number;
}

export interface DeadLink {
  /** The citing atlas entry (id, or relative path when id absent). */
  from: string;
  key: string;
  ref: string;
}

export interface AtlasScan {
  reverify: ReverifyCandidate[];
  archive: ArchiveCandidate[];
  deadLinks: DeadLink[];
  /** True when the atlas holds no entries and no sources (Rule 3: clean, not error). */
  empty: boolean;
}

interface AtlasEntry {
  file: string;
  id: string;
  data: Record<string, unknown>;
}

function readFrontmatter(file: string): Record<string, unknown> | null {
  try {
    return matter(fs.readFileSync(file, 'utf-8')).data as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export async function scanAtlasStaleness(root: string, nowMs = Date.now()): Promise<AtlasScan> {
  const scan: AtlasScan = { reverify: [], archive: [], deadLinks: [], empty: false };
  const atlasDir = path.join(root, '.cortex', 'atlas');
  if (!fs.existsSync(atlasDir)) {
    scan.empty = true;
    return scan;
  }

  const index = await buildIndex(root);

  // Atlas entries: decisions / stakeholders / domain (+ any other md leaves),
  // excluding indexes, overviews, and the raw sources/ tree (handled below).
  const entryFiles = (
    await fg('**/*.md', {
      cwd: atlasDir,
      absolute: true,
      ignore: ['**/_index.md', '**/_overview.md', 'sources/**'],
    })
  ).sort();
  const entries: AtlasEntry[] = [];
  for (const file of entryFiles) {
    const data = readFrontmatter(file);
    if (data === null) continue;
    const id = typeof data['id'] === 'string' ? (data['id'] as string) : path.relative(root, file);
    entries.push({ file, id, data });
  }

  // Raw sources (any extension), excluding indexes; *.meta.md is metadata of
  // its sibling source, not a source itself.
  const sourceFiles = (
    await fg('sources/**', {
      cwd: atlasDir,
      absolute: true,
      onlyFiles: true,
      ignore: ['**/_index.md', '**/_overview.md', '**/*.meta.md'],
    })
  ).sort();

  scan.empty = entries.length === 0 && sourceFiles.length === 0;
  if (scan.empty) return scan;

  // Citation map: resolved target (absolute path) → citer labels. Citers are
  // compass rules (source:) and other atlas entries (sources:/supersedes:).
  const citedBy = new Map<string, string[]>();
  const cite = (target: string | undefined, citer: string): void => {
    if (!target) return;
    const list = citedBy.get(target) ?? [];
    if (!list.includes(citer)) list.push(citer);
    citedBy.set(target, list);
  };

  const rulesDir = path.join(root, '.cortex', 'compass', 'rules');
  if (fs.existsSync(rulesDir)) {
    for (const filename of fs.readdirSync(rulesDir).filter((f) => /^R-\d{3,}.*\.md$/.test(f)).sort()) {
      const ruleFile = path.join(rulesDir, filename);
      const data = readFrontmatter(ruleFile);
      if (data === null) continue;
      const ruleId = typeof data['id'] === 'string' ? (data['id'] as string) : filename.replace(/\.md$/, '');
      for (const src of asStringList(data['source'])) {
        cite(resolveRelativePath(ruleFile, src) ?? resolveId(index, src), `rule ${ruleId}`);
      }
    }
  }
  for (const entry of entries) {
    for (const key of ['sources', 'supersedes'] as const) {
      for (const ref of asStringList(entry.data[key])) {
        cite(resolveRelativePath(entry.file, ref) ?? resolveId(index, ref), `atlas ${entry.id}`);
      }
    }
  }

  // (a) old decisions still cited → re-verify, naming the citers.
  for (const entry of entries) {
    if (!entry.id.startsWith('decision.')) continue;
    const dateMs = Date.parse(String(entry.data['date'] ?? ''));
    if (Number.isNaN(dateMs)) continue;
    const ageDays = Math.floor((nowMs - dateMs) / DAY_MS);
    if (ageDays <= ATLAS_STALE_AGE_DAYS) continue;
    const citers = citedBy.get(entry.file) ?? [];
    if (citers.length > 0) {
      scan.reverify.push({ id: entry.id, file: path.relative(root, entry.file), ageDays, citers });
    }
  }

  // (b) old sources referenced by nothing → archive candidates. Age from the
  // sibling meta's `captured` when present, else file mtime.
  for (const src of sourceFiles) {
    const metaFile = src.replace(/(\.[^./]+)?$/, '') + '.meta.md';
    let ageMs: number | null = null;
    if (fs.existsSync(metaFile)) {
      const meta = readFrontmatter(metaFile);
      const captured = Date.parse(String(meta?.['captured'] ?? ''));
      if (!Number.isNaN(captured)) ageMs = nowMs - captured;
    }
    if (ageMs === null) {
      try {
        ageMs = nowMs - fs.statSync(src).mtimeMs;
      } catch {
        continue;
      }
    }
    const ageDays = Math.floor(ageMs / DAY_MS);
    if (ageDays <= ATLAS_STALE_AGE_DAYS) continue;
    const referenced = (citedBy.get(src) ?? []).length > 0 || (citedBy.get(metaFile) ?? []).length > 0;
    if (!referenced) {
      scan.archive.push({ file: path.relative(root, src), ageDays });
    }
  }

  // (c) dead cross-refs — sources:/supersedes: (path or id) and compass_rules: (id).
  for (const entry of entries) {
    for (const key of ['sources', 'supersedes'] as const) {
      for (const ref of asStringList(entry.data[key])) {
        if (!resolveRelativePath(entry.file, ref) && !resolveId(index, ref)) {
          scan.deadLinks.push({ from: entry.id, key, ref });
        }
      }
    }
    for (const ref of asStringList(entry.data['compass_rules'])) {
      if (!resolveId(index, ref)) {
        scan.deadLinks.push({ from: entry.id, key: 'compass_rules', ref });
      }
    }
  }

  return scan;
}

export async function runAtlasStaleness(root = '.', opts: { now?: Date } = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();
  const scan = await scanAtlasStaleness(absRoot, now.getTime());

  const lines: string[] = ['# Atlas review', ''];
  if (scan.empty) {
    lines.push('The atlas is empty — no candidates this cycle.', '');
  } else {
    lines.push('## Re-verify candidates', '');
    if (scan.reverify.length === 0) lines.push('No candidates this cycle.', '');
    else {
      for (const c of scan.reverify) {
        lines.push(
          `- ${c.id} (\`${c.file}\`) — decided ${c.ageDays} days ago and still cited by ${c.citers.join(', ')}. The project still leans on this — is it still true?`,
        );
      }
      lines.push('');
    }
    lines.push('## Archive candidates', '');
    if (scan.archive.length === 0) lines.push('No candidates this cycle.', '');
    else {
      for (const c of scan.archive) {
        lines.push(`- \`${c.file}\` — ${c.ageDays} days old and referenced by nothing. Candidate for archival.`);
      }
      lines.push('');
    }
    lines.push('## Dead cross-references', '');
    if (scan.deadLinks.length === 0) lines.push('No findings this cycle.', '');
    else {
      for (const d of scan.deadLinks) {
        lines.push(`- ${d.from} — \`${d.key}\` reference \`${d.ref}\` does not resolve.`);
      }
      lines.push('');
    }
  }
  lines.push(
    '---',
    '',
    `Staleness threshold: ${ATLAS_STALE_AGE_DAYS} days (engineering call). Source age from the sibling meta's \`captured\` when present, else file mtime. Propose-don't-mutate: this loop never edits the atlas.`,
  );

  writePulseReport(
    absRoot,
    'atlas-review.md',
    'pulse-atlas-review',
    'cortex-loop-atlas-staleness',
    now.toISOString(),
    lines.join('\n'),
  );
  const total = scan.reverify.length + scan.archive.length + scan.deadLinks.length;
  console.log(
    `cortex loop-atlas-staleness: wrote .cortex/pulse/reports/atlas-review.md (${scan.empty ? 'atlas empty' : `${total} candidate(s)/finding(s)`}).`,
  );
  return 0;
}
