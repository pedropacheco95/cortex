/**
 * `cortex migrate` (schema Part II S9.3; spec store.migrate Rules 6–10, 12,
 * 13): the coverage report, `--apply` (writes `cortex/` only) and `--accept`
 * (switches the managed blocks). Never writes under `.cortex/`; deletes
 * nothing.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { STORE_CONFIG, STORE_FOLDERS, MAP_FILE, loadStore, storeDir } from '../layout.js';
import { ensureGitignore } from '../init.js';
import { writeMapAndBlocks } from '../managed-block.js';
import { validateLoaded, formatFinding } from '../validate.js';
import { privateClaims, visibilityHits } from '../checks/visibility.js';
import { applyRedactions, readRedactFile, type RedactStat } from './redact.js';
import { LEGACY_DIR, readLegacyStore, type LegacyStore } from './entries.js';
import { buildTree, planMigration, provenanceRefs, readPlanFile, CONFIG_TARGET, type Planned, type PlanFile, type ProvenanceRef } from './plan.js';

const RETIRED_CONFIG_KEYS = ['hooks', 'pulse', 'harness', 'loop', 'profile'];

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/**
 * The commit `migrated:` origins pin to: the last commit that touched
 * `.cortex/` (so unrelated commits don't change the tree), else HEAD.
 */
export function pinnedSha(root: string): string | null {
  const touched = git(root, ['log', '-1', '--format=%H', '--', LEGACY_DIR]);
  const sha = touched || git(root, ['rev-parse', 'HEAD']);
  return sha ? sha.slice(0, 7) : null;
}

function fileDateFn(root: string): (rel: string) => string | null {
  return (rel) => git(root, ['log', '-1', '--format=%cs', '--', `${LEGACY_DIR}/${rel}`]) || null;
}

export interface Report {
  version: string;
  total: number;
  covered: number;
  coverage: number;
  totals: Record<string, number>;
  planned: Planned[];
  provenance: { resolved: number; total: number; unresolved: ProvenanceRef[] };
  dropped: { group: string; files: number }[];
  retiredConfigKeys: string[];
  visibility: { repo: string; findings: string[] };
  removeDroppedCommand: string;
  removeStoreCommand: string;
  redactions: RedactStat[];
  threads: string[];
}

const DISPOSITION_LABEL: Record<string, string> = { migrated: 'migrated', retired: 'retired', dropped: 'dropped by decision', pending: 'pending decision', unmapped: 'unmapped' };

export function buildReport(root: string, legacy: LegacyStore, planned: Planned[], redactions: RedactStat[] = []): Report {
  const totals: Record<string, number> = { migrated: 0, retired: 0, dropped: 0, pending: 0, unmapped: 0 };
  for (const p of planned) totals[p.disposition.kind]!++;
  const total = planned.length;
  const covered = total - totals['unmapped']!;
  const byFile = new Map<string, Planned>();
  for (const p of planned) for (const f of p.entry.files) byFile.set(f, p);
  const refs = planned.filter((p) => p.disposition.kind === 'migrated' || p.disposition.kind === 'pending').flatMap((p) => provenanceRefs(p, byFile, 'sha'));
  const groups = new Map<string, number>();
  for (const p of planned) if (p.disposition.kind === 'dropped') groups.set(p.disposition.group, (groups.get(p.disposition.group) ?? 0) + 1);
  const droppedPaths: string[] = [];
  if (groups.has('anatomy')) droppedPaths.push(`${LEGACY_DIR}/insight/anatomy`);
  if (groups.has('concepts')) droppedPaths.push(`${LEGACY_DIR}/insight/concepts`);
  for (const p of planned) if (p.disposition.kind === 'dropped' && p.disposition.group === 'graph') droppedPaths.push(`${LEGACY_DIR}/${p.entry.ref}`);
  const vis = (legacy.config?.['visibility'] ?? {}) as Record<string, unknown>;
  const repo = typeof vis['repo'] === 'string' ? (vis['repo'] as string) : 'unknown';
  const findings: string[] = [];
  for (const p of planned) {
    if (p.disposition.kind !== 'migrated') continue;
    const t = p.disposition.targets[0]!;
    if (!t.startsWith('world/') && !t.startsWith('code/')) continue;
    for (const h of visibilityHits(p.entry.body)) findings.push(`${p.entry.ref} → ${t}: ${h.family} (${h.text})`);
    if (repo === 'public') for (const n of privateClaims(p.entry.body)) findings.push(`${p.entry.ref} → ${t}: line ${n} says "(private)"`);
  }
  return {
    version: legacy.version,
    total,
    covered,
    coverage: total ? covered / total : 1,
    totals,
    planned,
    provenance: { resolved: refs.filter((r) => r.resolved).length, total: refs.length, unresolved: refs.filter((r) => !r.resolved) },
    dropped: [...groups].map(([group, files]) => ({ group, files })),
    retiredConfigKeys: Object.keys(legacy.config ?? {}).filter((k) => RETIRED_CONFIG_KEYS.includes(k) || !['schemaVersion', 'visibility'].includes(k)),
    visibility: { repo, findings },
    removeDroppedCommand: droppedPaths.length ? `git rm -r -q ${droppedPaths.join(' ')}` : '',
    removeStoreCommand: `git rm -r -q ${LEGACY_DIR} && rm -rf ${LEGACY_DIR}`,
    redactions,
    threads: planned.filter((p) => p.disposition.kind === 'retired' && /^pulse\/threads\//.test(p.entry.ref)).map((p) => `${String(p.entry.fm['id'] ?? p.entry.stem)} (${String(p.entry.fm['status'] ?? 'unknown')})`),
  };
}

function pct(x: number): string {
  return `${(Math.floor(x * 1000) / 10).toFixed(1)}%`;
}

export function renderReport(r: Report, mode: string): string {
  const L: string[] = [];
  L.push(`# cortex migrate: coverage report (${r.version} → 4.0)`, '', `Mode: ${mode}`, '');
  L.push(`Entries: ${r.total}. With a disposition: ${r.covered}. Coverage: ${pct(r.coverage)}.`, '');
  L.push('| Disposition | Entries |', '|---|---|');
  for (const k of ['migrated', 'retired', 'dropped', 'pending', 'unmapped']) L.push(`| ${DISPOSITION_LABEL[k]} | ${r.totals[k]} |`);
  L.push('', `provenance refs: ${r.provenance.resolved}/${r.provenance.total}`, '');
  L.push('## Entries', '', '| Ref | Disposition | Target | Flags |', '|---|---|---|---|');
  for (const p of r.planned) {
    if (p.disposition.kind === 'dropped') continue;
    const d = p.disposition;
    const target = d.kind === 'migrated' ? d.targets.join(', ') : d.kind === 'pending' ? d.target : d.kind === 'retired' ? d.reason : '';
    const flags = [p.review ? 'review' : '', p.fromPlan ? 'plan' : ''].filter(Boolean).join(', ');
    L.push(`| ${p.entry.ref} | ${DISPOSITION_LABEL[d.kind]} | ${target} | ${flags} |`);
  }
  const review = r.planned.filter((p) => p.review);
  L.push('', `## Review (${review.length})`, '');
  for (const p of review) L.push(`- ${p.entry.ref} → ${(p.disposition as { targets: string[] }).targets[0]}: ${p.review}`);
  const pending = r.planned.filter((p) => p.disposition.kind === 'pending');
  L.push('', `## Pending decision (${pending.length})`, '');
  for (const p of pending) L.push(`- ${p.entry.ref}: ${p.entry.title} → now/proposals.md`);
  L.push('', `## Dropped by decision (${r.totals['dropped']} files)`, '', 'The 3.x inferred code summaries are not migrated (schema S9.3, 2026-10-14). They stay on disk; nothing here deletes them.', '');
  if (r.dropped.length) {
    L.push('| Group | Files |', '|---|---|');
    for (const d of r.dropped) L.push(`| ${d.group} | ${d.files} |`);
    L.push('', `Removal command (not run): \`${r.removeDroppedCommand}\``);
  }
  L.push('', `## Redactions (${r.redactions.length} entries)`, '');
  for (const x of r.redactions) L.push(`- ${x.ref}: ${x.replaced} replacement(s)${x.labels.length ? ` (${x.labels.join(', ')})` : ''}${x.edited ? `, ${x.edited} edit(s)` : ''}`);
  L.push('', `## Retired threads (${r.threads.length})`, '', r.threads.length ? `Not carried into 4.0: ${r.threads.join(', ')}` : 'none');
  L.push('', `## Unresolved provenance (${r.provenance.unresolved.length})`, '');
  for (const u of r.provenance.unresolved) L.push(`- ${u.entry} → ${u.target}`);
  const unmapped = r.planned.filter((p) => p.disposition.kind === 'unmapped');
  L.push('', `## Unmapped (${unmapped.length})`, '');
  for (const p of unmapped) L.push(`- ${p.entry.ref}`);
  L.push('', '## Retired 3.x config keys', '', r.retiredConfigKeys.length ? r.retiredConfigKeys.map((k) => `- ${k}`).join('\n') : 'none');
  L.push('', `## Visibility findings on migrated text (repo: ${r.visibility.repo})`, '');
  L.push(...(r.visibility.findings.length ? r.visibility.findings.map((f) => `- ${f}`) : ['none']));
  L.push('', '## After acceptance', '', `The 3.x store stays until you remove it: \`${r.removeStoreCommand}\``);
  return L.join('\n') + '\n';
}

export function reportJson(r: Report): unknown {
  return {
    version: r.version, total: r.total, covered: r.covered, coverage: r.coverage, totals: r.totals,
    provenance: r.provenance, dropped: r.dropped, retiredConfigKeys: r.retiredConfigKeys, visibility: r.visibility,
    removeDroppedCommand: r.removeDroppedCommand, removeStoreCommand: r.removeStoreCommand, redactions: r.redactions, threads: r.threads,
    entries: r.planned.map((p) => ({ ref: p.entry.ref, disposition: p.disposition, review: p.review, fromPlan: p.fromPlan, files: p.entry.files })),
  };
}

export interface MigrateOptions {
  plan?: string;
  redact?: string;
  report?: string;
  json?: boolean;
  apply?: boolean;
  accept?: boolean;
  today: string;
}

export interface MigrateResult { exitCode: number; out: string[] }

function existingTree(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else out.set(path.relative(dir, abs).split(path.sep).join('/'), fs.readFileSync(abs, 'utf8'));
    }
  };
  walk(dir);
  return out;
}

export function migrate(root: string, opts: MigrateOptions): MigrateResult {
  const out: string[] = [];
  if (opts.accept) return accept(root, opts.today);
  const original = readLegacyStore(root);
  if (!original) return { exitCode: 1, out: [`no 3.x store (${LEGACY_DIR}/ not found)`] };
  let legacy = original;
  let redactions: RedactStat[] = [];
  if (opts.redact) {
    const rf = readRedactFile(opts.redact);
    if (rf.error) return { exitCode: 1, out: [rf.error] };
    const r = applyRedactions(original, rf.redact!);
    if (r.errors.length) return { exitCode: 1, out: r.errors };
    legacy = r.legacy;
    redactions = r.stats;
  }
  let plan: PlanFile | null = null;
  if (opts.plan) {
    const r = readPlanFile(opts.plan);
    if (r.error) return { exitCode: 1, out: [r.error] };
    plan = r.plan;
  }
  const { planned, errors } = planMigration(legacy, plan);
  if (errors.length) return { exitCode: 1, out: errors };
  const report = buildReport(root, legacy, planned, redactions);
  const text = opts.json ? JSON.stringify(reportJson(report), null, 2) + '\n' : renderReport(report, opts.apply ? 'apply' : 'dry run (nothing written)');
  if (opts.report) fs.writeFileSync(opts.report, text);
  else out.push(text.replace(/\n$/, ''));
  if (!opts.apply) return { exitCode: 0, out };

  if (report.totals['unmapped']! > 0) return { exitCode: 1, out: [...out, `refusing --apply: ${report.totals['unmapped']} unmapped entr${report.totals['unmapped'] === 1 ? 'y' : 'ies'}; map or retire them in a plan file`] };
  const sha = pinnedSha(root);
  if (!sha) return { exitCode: 1, out: [...out, 'refusing --apply: not a git repository with a commit; migrated origins pin a commit (schema S3)'] };
  const tree = buildTree(legacy, planned, { sha, today: opts.today, fileDate: fileDateFn(root) });
  const dir = storeDir(root);
  const existing = existingTree(dir);
  const strangers = [...existing].filter(([rel, content]) => rel !== MAP_FILE && tree.files.get(rel) !== content).map(([rel]) => rel);
  if (strangers.length) {
    return { exitCode: 1, out: [...out, `refusing --apply: cortex/ holds files a previous apply of these inputs did not write: ${strangers.slice(0, 10).join(', ')}${strangers.length > 10 ? ', …' : ''}`] };
  }
  for (const f of STORE_FOLDERS) fs.mkdirSync(path.join(dir, f), { recursive: true });
  for (const [rel, content] of [...tree.files].sort(([a], [b]) => a.localeCompare(b))) {
    const p = path.join(dir, rel === CONFIG_TARGET ? STORE_CONFIG : rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  ensureGitignore(root);
  const map = writeMapAndBlocks(root, { mapOnly: true });
  out.push(...map.lines);
  const findings = validateLoaded(loadStore(root), opts.today);
  const errs = findings.filter((f) => f.level === 'error');
  out.push(`applied: ${tree.files.size} files written under cortex/ (origins pinned to ${sha}); .cortex/ untouched`);
  out.push(`cortex store validate: ${errs.length} error(s), ${findings.length - errs.length} warning(s)`);
  for (const f of errs) out.push(formatFinding(f));
  return { exitCode: 0, out };
}

function accept(root: string, today: string): MigrateResult {
  const p = path.join(storeDir(root), STORE_CONFIG);
  let cfg: Record<string, unknown> | null = null;
  try {
    cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    cfg = null;
  }
  const mig = cfg?.['migration'] as Record<string, unknown> | undefined;
  if (!cfg || !mig || typeof mig !== 'object') return { exitCode: 1, out: ['refusing --accept: no applied migration (run cortex migrate --apply first)'] };
  cfg['migration'] = { from: mig['from'], accepted: typeof mig['accepted'] === 'string' ? mig['accepted'] : today };
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
  const r = writeMapAndBlocks(root, { force: true });
  return { exitCode: 0, out: [...r.lines, `migration accepted on ${(cfg['migration'] as Record<string, unknown>)['accepted']}; .cortex/ is left in place (remove it yourself: git rm -r -q ${LEGACY_DIR} && rm -rf ${LEGACY_DIR})`] };
}
