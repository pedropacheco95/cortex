/**
 * `cortex pulse-hygiene` — the daily deterministic sweep (spec pulse.hygiene,
 * design §10.2). Surveys the project for unfinished or broken state and
 * writes `.cortex/pulse/hygiene-report.md` — nothing else, ever (Rule 6 /
 * design §11.3 property 2). Deterministic Core (R-001): no LLM; git and gh
 * are queried read-only via execFile.
 *
 * Checks (Rule 2): (a) orphan local branches, (b) stale open PRs via gh,
 * (c) insight drift (staleness-ledger entries whose source files vanished —
 * re-pointed from the v1/v2 anatomy drift check at build-order-v3 step 7;
 * on-disk-but-unextracted files are the refresh loops' business, not noise
 * here), (d) compass dead references (reusing the validator's resolution
 * logic), (e) spec orphans, (f) aged TODO/FIXME comments. Mid-conversation
 * drop-off detection is deferred to the agentic layer (Rule 5) and named as
 * such in the footer.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { buildIndex, resolveId, resolveRelativePath } from '../schema/index-build.js';
import { globMatchesNothing } from '../schema/checks/compass.js';
import { parseLedger } from '../insight/storage.js';
import { hasExcludedSegment, buildIgnoreFilter } from '../insight/exclude.js';
import { gitExec, isGitRepo, gitLastCommitEpoch } from '../loops/git-info.js';
import { writePulseReport } from '../loops/report.js';
import { specsRoot, SPECS_GLOB } from '../paths.js';

// Engineering-call constants (Rule 2) — stated in the report footer.
export const ORPHAN_BRANCH_DAYS = 30;
export const STALE_PR_DAYS = 14;
export const AGED_TODO_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TODO_FILE_BYTES = 512 * 1024;

export interface HygieneSection {
  title: string;
  /** Concrete findings ("thing, problem, suggested next step"); empty → clean. */
  findings: string[];
  /** When set, the section body is this skipped-with-reason line instead. */
  skipped?: string;
}

export interface HygieneOptions {
  /** Testability seam: the gh binary (default 'gh' on PATH). */
  ghBin?: string;
  /** Testability seam: the clock. */
  now?: Date;
}

// ---------------------------------------------------------------------------
// shared listing (same scope as the insight L1 walk: dot:false, hard excludes,
// .gitignore + config excludes — via the shared insight exclude module)
// ---------------------------------------------------------------------------

async function listProjectFiles(root: string): Promise<string[]> {
  const all = await fg(['**/*'], { cwd: root, dot: false, onlyFiles: true });
  const ig = buildIgnoreFilter(root);
  return all.filter((p) => !hasExcludedSegment(p) && !ig.ignores(p)).sort();
}

// ---------------------------------------------------------------------------
// (a) orphan local branches — unmerged, no commits in ORPHAN_BRANCH_DAYS
// ---------------------------------------------------------------------------

export async function checkOrphanBranches(root: string, nowMs = Date.now()): Promise<HygieneSection> {
  const title = 'Orphan local branches';
  if (!isGitRepo(root)) {
    return { title, findings: [], skipped: 'skipped — not a git repository' };
  }
  const refs = await gitExec(root, [
    'for-each-ref',
    'refs/heads',
    '--format=%(refname:short)%09%(committerdate:unix)',
  ]);
  if (!refs.ok) {
    return { title, findings: [], skipped: `skipped — git error: ${refs.stderr.trim() || 'unknown'}` };
  }
  const head = await gitExec(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const current = head.ok ? head.stdout.trim() : '';
  const merged = await gitExec(root, ['branch', '--merged', 'HEAD', '--format=%(refname:short)']);
  const mergedSet = new Set(
    merged.ok ? merged.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : [],
  );

  const findings: string[] = [];
  for (const line of refs.stdout.split('\n')) {
    const [name, epochStr] = line.split('\t');
    if (!name || !epochStr) continue;
    if (name === current || mergedSet.has(name)) continue;
    const ageDays = Math.floor((nowMs / 1000 - Number(epochStr)) / (DAY_MS / 1000));
    if (Number.isFinite(ageDays) && ageDays >= ORPHAN_BRANCH_DAYS) {
      findings.push(
        `\`${name}\` — unmerged, last commit ${ageDays} days ago. Suggested next step: merge, rebase, or delete it.`,
      );
    }
  }
  return { title, findings };
}

// ---------------------------------------------------------------------------
// (b) stale open PRs via gh (skipped-with-notice when gh is unavailable)
// ---------------------------------------------------------------------------

function runBin(bin: string, args: string[], cwd: string): Promise<{ ok: boolean; stdout: string; stderr: string; missing: boolean }> {
  return new Promise((resolve) => {
    execFile(bin, args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ ok: true, stdout: stdout ?? '', stderr: stderr ?? '', missing: false });
        return;
      }
      const err = error as NodeJS.ErrnoException;
      resolve({ ok: false, stdout: stdout ?? '', stderr: stderr ?? '', missing: err.code === 'ENOENT' });
    });
  });
}

export async function checkStalePrs(root: string, ghBin = 'gh', nowMs = Date.now()): Promise<HygieneSection> {
  const title = 'Stale open PRs';
  const res = await runBin(ghBin, ['pr', 'list', '--state', 'open', '--json', 'number,title,updatedAt'], root);
  if (res.missing) return { title, findings: [], skipped: 'skipped — gh unavailable' };
  if (!res.ok) {
    const reason = res.stderr.trim().split('\n')[0] || 'gh exited non-zero';
    return { title, findings: [], skipped: `skipped — gh failed: ${reason}` };
  }
  let prs: Array<{ number?: number; title?: string; updatedAt?: string }>;
  try {
    prs = JSON.parse(res.stdout) as Array<{ number?: number; title?: string; updatedAt?: string }>;
  } catch {
    return { title, findings: [], skipped: 'skipped — gh output was not parseable JSON' };
  }
  const findings: string[] = [];
  for (const pr of prs) {
    const updated = Date.parse(pr.updatedAt ?? '');
    if (Number.isNaN(updated)) continue;
    const ageDays = Math.floor((nowMs - updated) / DAY_MS);
    if (ageDays >= STALE_PR_DAYS) {
      findings.push(
        `PR #${pr.number} "${pr.title}" — no update in ${ageDays} days. Suggested next step: review, merge, or close it.`,
      );
    }
  }
  return { title, findings };
}

// ---------------------------------------------------------------------------
// (c) insight drift — staleness-ledger entries whose source file vanished
//     (re-pointed from anatomy drift at build-order-v3 step 7; the forward
//     direction — changed/unextracted files — is owned by the insight
//     refresh loops, so it is deliberately not duplicated here)
// ---------------------------------------------------------------------------

export async function checkInsightDrift(root: string): Promise<HygieneSection> {
  const title = 'Insight drift';
  const ledgerPath = path.join(root, '.cortex', 'insight', 'ledger.json');
  if (!fs.existsSync(ledgerPath)) {
    return { title, findings: [], skipped: 'skipped — no insight staleness ledger (.cortex/insight/ledger.json missing; run cortex-extract-insight)' };
  }
  let raw: string;
  try {
    raw = fs.readFileSync(ledgerPath, 'utf-8');
  } catch {
    return { title, findings: [], skipped: 'skipped — insight ledger unreadable' };
  }
  const parsed = parseLedger(raw);
  if (!parsed.ok || !parsed.value) {
    return { title, findings: [], skipped: 'skipped — insight ledger is not schema-valid (check.insight-ledger owns reporting the shape)' };
  }

  const findings: string[] = [];
  for (const rel of Object.keys(parsed.value.entries).sort()) {
    if (!fs.existsSync(path.join(root, rel))) {
      findings.push(
        `\`${rel}\` — has an insight ledger entry but is missing on disk. Suggested next step: let the insight refresh loops prune it (or re-run the extraction).`,
      );
    }
  }
  return { title, findings };
}

// ---------------------------------------------------------------------------
// (d) compass dead references — rule source:/governs: that no longer resolve
//     (reuses the validator's resolution logic: index-build + globMatchesNothing)
// ---------------------------------------------------------------------------

export async function checkCompassDeadRefs(root: string): Promise<HygieneSection> {
  const title = 'Compass dead references';
  const rulesDir = path.join(root, '.cortex', 'compass', 'rules');
  if (!fs.existsSync(rulesDir)) return { title, findings: [] };

  const index = await buildIndex(root);
  const findings: string[] = [];
  const ruleFiles = fs
    .readdirSync(rulesDir)
    .filter((f) => /^R-\d{3,}(-[A-Za-z0-9-]+)?\.md$/.test(f))
    .sort();

  for (const filename of ruleFiles) {
    const filePath = path.join(rulesDir, filename);
    let data: Record<string, unknown> = {};
    try {
      data = matter(fs.readFileSync(filePath, 'utf-8')).data as Record<string, unknown>;
    } catch {
      continue;
    }
    const ruleId = typeof data['id'] === 'string' ? (data['id'] as string) : filename.replace(/\.md$/, '');

    const sources = Array.isArray(data['source']) ? (data['source'] as unknown[]) : [];
    for (const src of sources) {
      if (typeof src !== 'string') continue;
      if (!resolveRelativePath(filePath, src) && !resolveId(index, src)) {
        findings.push(
          `${ruleId} — source \`${src}\` does not resolve. Suggested next step: fix the path or retire the rule.`,
        );
      }
    }
    const governs = Array.isArray(data['governs']) ? (data['governs'] as unknown[]) : [];
    for (const glob of governs) {
      if (typeof glob !== 'string') continue;
      if (globMatchesNothing(root, glob)) {
        findings.push(
          `${ruleId} — governs glob \`${glob}\` matches no files on disk. Suggested next step: update the glob or retire the rule.`,
        );
      }
    }
  }
  return { title, findings };
}

// ---------------------------------------------------------------------------
// (e) spec orphans — dev specs whose governs matches nothing
// ---------------------------------------------------------------------------

export async function checkSpecOrphans(root: string): Promise<HygieneSection> {
  const title = 'Spec orphans';
  const specsDir = specsRoot(root);
  if (!fs.existsSync(specsDir)) return { title, findings: [] };

  const findings: string[] = [];
  const specFiles = (await fg(SPECS_GLOB, { cwd: root, absolute: false })).sort();
  for (const rel of specFiles) {
    let data: Record<string, unknown> = {};
    try {
      data = matter(fs.readFileSync(path.join(root, rel), 'utf-8')).data as Record<string, unknown>;
    } catch {
      continue;
    }
    const governsRaw = data['governs'];
    const governs = Array.isArray(governsRaw)
      ? governsRaw.filter((g): g is string => typeof g === 'string')
      : typeof governsRaw === 'string'
        ? [governsRaw]
        : [];
    if (governs.length === 0) continue; // nothing declared — not an orphan by this check
    const allDead = governs.every((g) => globMatchesNothing(root, g));
    if (allDead) {
      const id = typeof data['id'] === 'string' ? (data['id'] as string) : rel;
      findings.push(
        `${id} (\`${rel}\`) — governs ${governs.map((g) => `\`${g}\``).join(', ')} matches no files on disk. Suggested next step: update the spec's governs or remove the spec.`,
      );
    }
  }
  return { title, findings };
}

// ---------------------------------------------------------------------------
// (f) aged TODO/FIXME comments — count + locations, aged by last-commit date
// ---------------------------------------------------------------------------

const TODO_RE = /\b(TODO|FIXME)\b/;

export async function checkAgedTodos(root: string, nowMs = Date.now()): Promise<HygieneSection> {
  const title = 'Aged TODO/FIXME comments';
  const files = await listProjectFiles(root);
  const perFile = new Map<string, number[]>();

  for (const rel of files) {
    const abs = path.join(root, rel);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (stat.size > MAX_TODO_FILE_BYTES) continue;
    let content: string;
    try {
      content = fs.readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    if (content.includes('\0')) continue; // binary
    const lines: number[] = [];
    content.split('\n').forEach((line, i) => {
      if (TODO_RE.test(line)) lines.push(i + 1);
    });
    if (lines.length > 0) perFile.set(rel, lines);
  }

  const findings: string[] = [];
  const inRepo = isGitRepo(root);
  for (const [rel, lines] of perFile) {
    if (!inRepo) continue; // age unknown → not "aged" (footer states this)
    const epoch = await gitLastCommitEpoch(root, rel);
    if (epoch === null) continue; // untracked → age unknown → not aged
    const ageDays = Math.floor((nowMs / 1000 - epoch) / (DAY_MS / 1000));
    if (ageDays >= AGED_TODO_DAYS) {
      findings.push(
        `\`${rel}\` — ${lines.length} TODO/FIXME marker(s) (line${lines.length === 1 ? '' : 's'} ${lines.join(', ')}), file last committed ${ageDays} days ago. Suggested next step: resolve them or file tickets.`,
      );
    }
  }
  return { title, findings };
}

// ---------------------------------------------------------------------------
// the sweep + report (always-write, schema §4.5)
// ---------------------------------------------------------------------------

function renderSection(section: HygieneSection): string {
  const lines = [`## ${section.title}`, ''];
  if (section.skipped) {
    lines.push(section.skipped);
  } else if (section.findings.length === 0) {
    lines.push('No findings this cycle.');
  } else {
    for (const f of section.findings) lines.push(`- ${f}`);
  }
  lines.push('');
  return lines.join('\n');
}

export async function runHygiene(root = '.', opts: HygieneOptions = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();

  const sections: HygieneSection[] = [
    await checkOrphanBranches(absRoot, nowMs),
    await checkStalePrs(absRoot, opts.ghBin ?? 'gh', nowMs),
    await checkInsightDrift(absRoot),
    await checkCompassDeadRefs(absRoot),
    await checkSpecOrphans(absRoot),
    await checkAgedTodos(absRoot, nowMs),
  ];

  const skipped = sections.filter((s) => s.skipped);
  const findingsTotal = sections.reduce((n, s) => n + s.findings.length, 0);

  const body = [
    '# Hygiene report',
    '',
    ...sections.map(renderSection),
    '---',
    '',
    `Thresholds: orphan branches ≥ ${ORPHAN_BRANCH_DAYS} days unmerged; stale PRs ≥ ${STALE_PR_DAYS} days without update; aged TODO/FIXME ≥ ${AGED_TODO_DAYS} days since the file's last commit (untracked files and non-git projects are never "aged").`,
    '',
    `Skipped checks: ${skipped.length > 0 ? skipped.map((s) => `${s.title} (${s.skipped})`).join('; ') : 'none'}. Mid-conversation drop-off detection was not run — deferred to the agentic layer (design §10.2).`,
  ].join('\n');

  writePulseReport(
    absRoot,
    'hygiene-report.md',
    'pulse-hygiene-report',
    'cortex-pulse-hygiene',
    now.toISOString(),
    body,
  );
  console.log(
    `cortex pulse-hygiene: wrote .cortex/pulse/hygiene-report.md (${findingsTotal} finding(s), ${skipped.length} check(s) skipped).`,
  );
  return 0;
}
