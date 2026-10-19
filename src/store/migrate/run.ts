/**
 * `cortex migrate` (schema Part II S9.3; spec store.migrate Rules 6–10,
 * 12, 13, 15–18): the coverage report with its no-loss lines, `--apply`
 * (writes `cortex/` only) and `--accept` (switches the managed blocks and
 * retires the 3.x system around the store). Never writes under `.cortex/`;
 * deletes nothing.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { STORE_CONFIG, STORE_FOLDERS, MAP_FILE, loadStore, storeDir } from '../layout.js';
import { ensureGitignore } from '../init.js';
import { writeMapAndBlocks } from '../managed-block.js';
import { validateLoaded, formatFinding } from '../validate.js';
import { privateClaims, visibilityHits } from '../checks/visibility.js';
import { parseFile } from '../frontmatter.js';
import { packageRoot } from '../../cli/scaffold.js';
import { applyRedactions, readRedactFile, replacer, type RedactFile, type RedactStat } from './redact.js';
import { hydrate, LEGACY_DIR, readLegacyStore, type LegacyStore } from './entries.js';
import { buildTree, planMigration, proposalItems, provenanceRefs, rawLayout, readPlanFile, sharedStemAliases, CONFIG_TARGET, type Planned, type PlanFile, type ProvenanceRef } from './plan.js';
import { retireLegacySystem } from './system.js';

const RETIRED_CONFIG_KEYS = ['hooks', 'pulse', 'harness', 'loop', 'profile'];

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 }).trim();
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

/** Last commit date per `.cortex`-relative file, read once (`git log --name-only`). */
function fileDateFn(root: string): (rel: string) => string | null {
  let dates: Map<string, string> | null = null;
  return (rel) => {
    if (!dates) {
      dates = new Map();
      const out = git(root, ['-c', 'core.quotePath=false', 'log', '--format=@%cs', '--name-only', '--', LEGACY_DIR]) ?? '';
      let cur = '';
      for (const l of out.split('\n')) {
        if (l.startsWith('@')) cur = l.slice(1);
        else if (l.startsWith(`${LEGACY_DIR}/`) && !dates.has(l.slice(LEGACY_DIR.length + 1))) dates.set(l.slice(LEGACY_DIR.length + 1), cur);
      }
    }
    return dates.get(rel) ?? null;
  };
}

function trackedFiles(root: string): Set<string> {
  const out = git(root, ['ls-files', '-z', '--', LEGACY_DIR]);
  return new Set((out ?? '').split('\0').filter(Boolean).map((f) => f.slice(LEGACY_DIR.length + 1)));
}

/** Rule 16 classes, weakest first. */
const CLASSES = ['undecided', 'regenerable', 'decided', 'landed'] as const;
type FileClass = (typeof CLASSES)[number];

export interface NoLossLine { landed: number; total: number; decided: number; regenerable: number; undecided: number }

function entryClass(p: Planned): FileClass {
  const d = p.disposition;
  if (d.kind === 'unmapped') return 'undecided';
  if (d.kind === 'migrated' || d.kind === 'pending') return p.digest ? 'decided' : 'landed';
  if (d.kind === 'dropped') return 'decided';
  if (p.fromPlan) return 'decided';
  return p.undecided ? 'undecided' : 'regenerable';
}

/** Files a migrated entry accounts for that its build writes (as body, frontmatter source or raw). */
function landedFiles(p: Planned): Set<string> {
  const e = p.entry;
  if (p.rawRescue || p.digest) return new Set(e.files);
  const raws = new Set(e.raw ?? []);
  if (e.row === 'document') return new Set(e.files.filter((f) => raws.has(f) || /\/metadata\.ya?ml$/.test(f) || (f.includes('/extracted/') && f.endsWith('.md'))));
  return new Set(e.files);
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
  scopes: number;
  retiredConfigKeys: string[];
  visibility: { repo: string; checkedAsPublic: boolean; findings: string[] };
  removeDroppedCommand: string;
  removeStoreCommand: string;
  redactions: RedactStat[];
  threads: string[];
  noLoss: { tracked: NoLossLine; untracked: NoLossLine };
  undecided: string[];
  files: { written: number; accounted: number; notWritten: string[] };
  gitignoredOnly: { from: string; to: string; tracked: boolean }[];
  digested: { ref: string; target: string; file: string }[];
  folderKeys: { key: string; decided: number }[];
  concepts: { ref: string; line: string }[];
  skillPath: string;
  droppedStemAliases: { alias: string; files: string[] }[];
}

const DISPOSITION_LABEL: Record<string, string> = { migrated: 'migrated', retired: 'retired', dropped: 'dropped by decision', pending: 'pending decision', unmapped: 'unmapped' };

const removal = (paths: string[]): string => `git rm -r -q --ignore-unmatch ${paths.join(' ')} && rm -rf ${paths.join(' ')}`;

function definitionLine(abs: string): string {
  try {
    const body = parseFile(fs.readFileSync(abs, 'utf8')).body;
    const l = body.split('\n').map((x) => x.trim()).find((x) => x !== '' && !x.startsWith('#') && !/^(---|```|~~~)/.test(x)) ?? '';
    return l.length > 200 ? `${l.slice(0, 199)}…` : l;
  } catch {
    return '';
  }
}

export interface ReportOptions { redactions?: RedactStat[]; folderKeys?: { key: string; decided: number }[]; visibility?: string; tracked?: Set<string> }

export function buildReport(root: string, legacy: LegacyStore, planned: Planned[], opts: ReportOptions = {}): Report {
  const totals: Record<string, number> = { migrated: 0, retired: 0, dropped: 0, pending: 0, unmapped: 0 };
  for (const p of planned) totals[p.disposition.kind]!++;
  const total = planned.length;
  const covered = total - totals['unmapped']!;
  const byFile = new Map<string, Planned>();
  for (const p of planned) for (const f of p.entry.files) byFile.set(f, p);
  const refs = planned.filter((p) => p.disposition.kind === 'migrated' || p.disposition.kind === 'pending').flatMap((p) => provenanceRefs(p, byFile, 'sha'));
  const groups = new Map<string, number>();
  for (const p of planned) if (p.disposition.kind === 'dropped') groups.set(p.disposition.group, (groups.get(p.disposition.group) ?? 0) + 1);
  const droppedRefs = planned.filter((p) => p.disposition.kind === 'dropped').map((p) => p.entry.ref);
  const droppedPaths: string[] = [];
  for (const dir of ['anatomy', 'concepts', 'scopes']) if (droppedRefs.some((r) => r.startsWith(`insight/${dir}/`))) droppedPaths.push(`${LEGACY_DIR}/insight/${dir}`);
  for (const r of droppedRefs) if (/^insight\/[^/]+\.json$/.test(r)) droppedPaths.push(`${LEGACY_DIR}/${r}`);
  const scopes = new Set(legacy.entries.map((e) => /^insight\/scopes\/([^/]+)\//.exec(e.ref)?.[1]).filter(Boolean)).size;

  const vis = (legacy.config?.['visibility'] ?? {}) as Record<string, unknown>;
  const repo = opts.visibility ?? (typeof vis['repo'] === 'string' ? (vis['repo'] as string) : 'unknown');
  const checkedAsPublic = repo !== 'public' && repo !== 'private';
  const findings: string[] = [];
  for (const p of planned) {
    if (p.disposition.kind !== 'migrated' || p.rawRescue) continue;
    const t = p.disposition.targets[0]!;
    if (!t.startsWith('world/') && !t.startsWith('code/')) continue;
    const text = p.digest?.body ?? p.entry.body;
    for (const h of visibilityHits(text)) findings.push(`${p.entry.ref} → ${t}: ${h.family} (${h.text})`);
    if (repo !== 'private') for (const n of privateClaims(text)) findings.push(`${p.entry.ref} → ${t}: line ${n} says "(private)"`);
  }

  // Rule 15: raw files, and what a migrated entry accounts for but would not write.
  const tracked = opts.tracked ?? trackedFiles(root);
  const gitignoredOnly: Report['gitignoredOnly'] = [];
  let accounted = 0;
  const notWritten: string[] = [];
  for (const p of planned) {
    if (p.disposition.kind !== 'migrated' && p.disposition.kind !== 'pending') continue;
    if (p.rawRescue && p.disposition.kind === 'migrated') gitignoredOnly.push({ from: p.entry.files[0]!, to: p.disposition.targets[0]!, tracked: tracked.has(p.entry.files[0]!) });
    else if (p.disposition.kind === 'migrated') for (const [from, to] of rawLayout(p.entry, p.disposition.targets[0]!).pairs) gitignoredOnly.push({ from, to, tracked: tracked.has(from) });
    const landed = landedFiles(p);
    accounted += p.entry.files.length;
    for (const f of p.entry.files) if (!landed.has(f)) notWritten.push(f);
  }

  // Rule 16: every file, by the weakest class among the entries that account for it.
  const notWrittenSet = new Set(notWritten);
  const perFile = new Map<string, FileClass>();
  for (const p of planned) {
    const c = entryClass(p);
    for (const f of p.entry.files) {
      const fc: FileClass = notWrittenSet.has(f) ? 'undecided' : c;
      const prev = perFile.get(f);
      if (!prev || CLASSES.indexOf(fc) < CLASSES.indexOf(prev)) perFile.set(f, fc);
    }
  }
  const line = (): NoLossLine => ({ landed: 0, total: 0, decided: 0, regenerable: 0, undecided: 0 });
  const noLoss = { tracked: line(), untracked: line() };
  const undecided: string[] = [];
  for (const f of legacy.files) {
    // A file no entry accounts for is a multi-entry file's empty frame (no item or section to carry).
    const c = perFile.get(f) ?? 'regenerable';
    const l = tracked.has(f) ? noLoss.tracked : noLoss.untracked;
    l.total++;
    l[c]++;
    if (c === 'undecided') undecided.push(f);
  }

  const concepts = planned.filter((p) => p.disposition.kind === 'dropped' && p.disposition.group === 'concepts' && p.entry.ref.endsWith('.md')).map((p) => ({ ref: p.entry.ref, line: definitionLine(path.join(legacy.dir, p.entry.ref)) }));

  return {
    version: legacy.version,
    total,
    covered,
    coverage: total ? covered / total : 1,
    totals,
    planned,
    provenance: { resolved: refs.filter((r) => r.resolved).length, total: refs.length, unresolved: refs.filter((r) => !r.resolved) },
    dropped: [...groups].map(([group, files]) => ({ group, files })),
    scopes,
    retiredConfigKeys: Object.keys(legacy.config ?? {}).filter((k) => RETIRED_CONFIG_KEYS.includes(k) || !['schemaVersion', 'visibility'].includes(k)),
    visibility: { repo, checkedAsPublic, findings },
    removeDroppedCommand: droppedPaths.length ? removal(droppedPaths) : '',
    removeStoreCommand: removal([LEGACY_DIR]),
    redactions: opts.redactions ?? [],
    threads: planned.filter((p) => p.disposition.kind === 'retired' && /^pulse\/threads\//.test(p.entry.ref)).map((p) => `${String(p.entry.fm['id'] ?? p.entry.stem)} (${String(p.entry.fm['status'] ?? 'unknown')})`),
    noLoss,
    undecided,
    files: { written: accounted - notWritten.length, accounted, notWritten },
    gitignoredOnly,
    digested: planned.filter((p) => p.digest).map((p) => ({ ref: p.entry.ref, target: p.disposition.kind === 'pending' ? p.disposition.target : (p.disposition as { targets: string[] }).targets[0]!, file: p.digest!.file })),
    folderKeys: opts.folderKeys ?? [],
    concepts,
    skillPath: path.join(packageRoot(), 'skills', 'cortex-migrate', 'SKILL.md'),
    droppedStemAliases: [...sharedStemAliases(planned)].map(([alias, files]) => ({ alias, files })),
  };
}

function pct(x: number): string {
  return `${(Math.floor(x * 1000) / 10).toFixed(1)}%`;
}

const noLossText = (label: string, l: NoLossLine): string => `${label}: ${l.landed}/${l.total} landed, decided: ${l.decided}, regenerable: ${l.regenerable}, undecided: ${l.undecided}`;

/** Undecided files grouped by folder, with counts (Rule 6). */
function undecidedLines(files: string[]): string[] {
  const byDir = new Map<string, string[]>();
  for (const f of files) {
    const d = `${path.posix.dirname(f)}/`;
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d)!.push(f);
  }
  const out: string[] = [];
  for (const [d, list] of [...byDir].sort(([a], [b]) => a.localeCompare(b))) {
    out.push(`- ${d}: ${list.length}`);
    for (const f of list.slice(0, 20)) out.push(`  - ${f}`);
    if (list.length > 20) out.push(`  - … and ${list.length - 20} more`);
  }
  return out;
}

export function renderReport(r: Report, mode: string): string {
  const L: string[] = [];
  L.push(`# cortex migrate: coverage report (${r.version} → 4.0)`, '', `Mode: ${mode}`, '');
  L.push(`Entries: ${r.total}. With a disposition: ${r.covered}. Coverage: ${pct(r.coverage)}.`, '');
  L.push(noLossText('tracked', r.noLoss.tracked), noLossText('untracked', r.noLoss.untracked), '');
  L.push(`Visibility: repo: ${r.visibility.repo}${r.visibility.checkedAsPublic ? ' (checked as public)' : ''}`, '');
  L.push('| Disposition | Entries |', '|---|---|');
  for (const k of ['migrated', 'retired', 'dropped', 'pending', 'unmapped']) L.push(`| ${DISPOSITION_LABEL[k]} | ${r.totals[k]} |`);
  L.push('', `provenance refs: ${r.provenance.resolved}/${r.provenance.total}`);
  L.push(`files: ${r.files.written}/${r.files.accounted}, not written: ${r.files.notWritten.length}`, '');
  L.push('## Entries', '', '| Ref | Disposition | Target | Flags |', '|---|---|---|---|');
  for (const p of r.planned) {
    if (p.disposition.kind === 'dropped' && !p.fromPlan) continue;
    const d = p.disposition;
    const target = d.kind === 'migrated' ? d.targets.join(', ') : d.kind === 'pending' ? d.target : d.kind === 'retired' ? d.reason : '';
    const flags = [p.review ? 'review' : '', p.fromPlan ? 'plan' : '', p.digest ? 'digest' : ''].filter(Boolean).join(', ');
    L.push(`| ${p.entry.ref} | ${DISPOSITION_LABEL[d.kind]} | ${target} | ${flags} |`);
  }
  const review = r.planned.filter((p) => p.review);
  L.push('', `## Review (${review.length})`, '');
  for (const p of review) {
    const d = p.disposition;
    L.push(`- ${p.entry.ref} → ${d.kind === 'migrated' ? d.targets[0] : d.kind === 'retired' ? d.reason : d.kind}: ${p.review}`);
  }
  const pending = r.planned.filter((p) => p.disposition.kind === 'pending');
  const pendingCount = pending.reduce((n, p) => n + (p.items?.length ?? 1), 0);
  L.push('', `## Pending decision (${pendingCount})`, '');
  for (const p of pending) {
    if (p.items) for (const it of p.items) L.push(`- ${it.id}: ${it.title} → now/proposals.md (from ${p.entry.ref})`);
    else L.push(`- ${p.entry.ref}: ${p.entry.title} → now/proposals.md`);
  }
  L.push('', `## Undecided (${r.undecided.length})`, '');
  L.push(...(r.undecided.length ? ['Retired as unpromoted work (or not a store folder) with no plan decision. `--apply` refuses until each is decided: rescue, digest, raw, or "retired".', '', ...undecidedLines(r.undecided)] : ['none']));
  L.push('', `## Digested (${r.digested.length})`, '');
  for (const d of r.digested) L.push(`- ${d.ref} → ${d.target} (from ${d.file})`);
  L.push('', `## Plan folder keys (${r.folderKeys.length})`, '');
  for (const f of r.folderKeys) L.push(`- \`${f.key}\` decided ${f.decided} entr${f.decided === 1 ? 'y' : 'ies'}`);
  L.push('', `## Gitignored only (${r.gitignoredOnly.length})`, '', 'Files whose content lands only under the gitignored history/sources/raw/. Tracked ones leave version control once .cortex/ is removed.', '');
  for (const g of r.gitignoredOnly) L.push(`- ${g.from} → ${g.to}${g.tracked ? ' (tracked in git)' : ''}`);
  if (r.files.notWritten.length) {
    L.push('', `## Not written (${r.files.notWritten.length})`, '');
    for (const f of r.files.notWritten) L.push(`- ${f}`);
  }
  L.push('', `## Dropped by decision (${r.totals['dropped']} files)`, '', 'The 3.x inferred code summaries are not migrated (schema S9.3, 2026-10-14). They stay on disk; nothing here deletes them.', '');
  if (r.dropped.length) {
    L.push('| Group | Files |', '|---|---|');
    for (const d of r.dropped) L.push(`| ${d.group} | ${d.files} |`);
    if (r.scopes) L.push('', `scopes: ${r.scopes}`);
    L.push('', `Removal command (not run): \`${r.removeDroppedCommand}\``);
  }
  L.push('', `## Concept definitions (${r.concepts.length})`, '', 'First definition line of each dropped concept file. A plan can rescue one into world/terms/.', '');
  for (const c of r.concepts) L.push(`- ${c.ref}: ${c.line}`);
  L.push('', `## Dropped stem aliases (${r.droppedStemAliases.length})`, '', 'Old filename stems more than one migrated file would carry; dropped for all of them (the migrated: origin keeps the old path).', '');
  for (const d of r.droppedStemAliases) L.push(`- ${d.alias}: ${d.files.join(', ')}`);
  L.push('', `## Redactions (${r.redactions.length} entries)`, '');
  for (const x of r.redactions) L.push(`- ${x.ref}: ${x.replaced} replacement(s)${x.labels.length ? ` (${x.labels.join(', ')})` : ''}${x.edited ? `, ${x.edited} edit(s)` : ''}`);
  L.push('', `## Retired threads (${r.threads.length})`, '', r.threads.length ? `Not carried into 4.0 unless the plan decides: ${r.threads.join(', ')}` : 'none');
  L.push('', `## Unresolved provenance (${r.provenance.unresolved.length})`, '');
  for (const u of r.provenance.unresolved) L.push(`- ${u.entry} → ${u.target}`);
  const unmapped = r.planned.filter((p) => p.disposition.kind === 'unmapped');
  L.push('', `## Unmapped (${unmapped.length})`, '');
  for (const p of unmapped) L.push(`- ${p.entry.ref}`);
  L.push('', '## Retired 3.x config keys', '', r.retiredConfigKeys.length ? r.retiredConfigKeys.map((k) => `- ${k}`).join('\n') : 'none');
  L.push('', `## Visibility findings on migrated text (repo: ${r.visibility.repo}${r.visibility.checkedAsPublic ? ', checked as public' : ''})`, '');
  L.push(...(r.visibility.findings.length ? r.visibility.findings.map((f) => `- ${f}`) : ['none']));
  L.push('', '## After acceptance', '', `The 3.x store stays until you remove it: \`${r.removeStoreCommand}\``);
  L.push('', '## Agentic step', '', `Agentic step: read ${r.skillPath} and follow it to write the plan (rescue, digest or retire each undecided, review and concept entry).`);
  return L.join('\n') + '\n';
}

export function reportJson(r: Report): unknown {
  return {
    version: r.version, total: r.total, covered: r.covered, coverage: r.coverage, totals: r.totals,
    noLoss: r.noLoss, undecided: r.undecided, files: r.files, gitignoredOnly: r.gitignoredOnly, digested: r.digested, folderKeys: r.folderKeys, concepts: r.concepts, scopes: r.scopes, skillPath: r.skillPath, droppedStemAliases: r.droppedStemAliases,
    provenance: r.provenance, dropped: r.dropped, retiredConfigKeys: r.retiredConfigKeys, visibility: r.visibility,
    removeDroppedCommand: r.removeDroppedCommand, removeStoreCommand: r.removeStoreCommand, redactions: r.redactions, threads: r.threads,
    entries: r.planned.map((p) => ({ ref: p.entry.ref, disposition: p.disposition, review: p.review, fromPlan: p.fromPlan, undecided: p.undecided ?? false, digest: p.digest?.file ?? null, folderKey: p.folderKey ?? null, files: p.entry.files })),
  };
}

export interface MigrateOptions {
  plan?: string;
  redact?: string;
  report?: string;
  json?: boolean;
  apply?: boolean;
  accept?: boolean;
  visibility?: string;
  /** Home directory holding `.claude/scheduled-tasks/` (tests pass their own). */
  home?: string;
  today: string;
}

export interface MigrateResult { exitCode: number; out: string[] }

function existingTree(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else out.set(path.relative(dir, abs).split(path.sep).join('/'), fs.readFileSync(abs));
    }
  };
  walk(dir);
  return out;
}

const asBuffer = (v: string | Buffer | undefined): Buffer | undefined => (v === undefined ? undefined : typeof v === 'string' ? Buffer.from(v, 'utf8') : v);

export function migrate(root: string, opts: MigrateOptions): MigrateResult {
  const out: string[] = [];
  if (opts.accept) return accept(root, opts.today, opts.home ?? os.homedir());
  const read = readLegacyStore(root);
  if (!read) return { exitCode: 1, out: [`no 3.x store (${LEGACY_DIR}/ not found)`] };
  let plan: PlanFile | null = null;
  if (opts.plan) {
    const r = readPlanFile(opts.plan);
    if (r.error) return { exitCode: 1, out: [r.error] };
    plan = r.plan;
  }
  let rf: RedactFile | null = null;
  if (opts.redact) {
    const r = readRedactFile(opts.redact);
    if (r.error) return { exitCode: 1, out: [r.error] };
    rf = r.redact;
  }
  // Entries a plan rescues or a redact edit names get their 3.x text before redaction, so both see it (Rules 3, 14).
  const rescued = Object.entries(plan ?? {}).filter(([k, v]) => !k.endsWith('/**') && v !== 'retired').map(([k]) => k);
  const named = new Set([...rescued, ...Object.keys(rf?.edits ?? {})]);
  const original = hydrate(read, (ref) => named.has(ref));
  let legacy = original;
  let redactions: RedactStat[] = [];
  if (rf) {
    const r = applyRedactions(original, rf);
    if (r.errors.length) return { exitCode: 1, out: r.errors };
    legacy = r.legacy;
    redactions = r.stats;
  }
  const fileDate = fileDateFn(root);
  const { planned, errors, folderKeys } = planMigration(legacy, plan, { root, fileDate, today: opts.today });
  if (errors.length) return { exitCode: 1, out: errors };
  if (rf) {
    // Digest bodies are migrated text too (Rule 14): the replace terms reach them.
    const sub = replacer(rf);
    for (const p of planned) {
      if (!p.digest) continue;
      const r = sub(p.digest.body);
      if (!r.replaced) continue;
      p.digest = { ...p.digest, body: r.text };
      if (p.items) p.items = proposalItems(r.text);
      const prev = redactions.find((x) => x.ref === p.entry.ref);
      if (prev) {
        prev.replaced += r.replaced;
        prev.labels = [...new Set([...prev.labels, ...r.labels])].sort();
      } else redactions.push({ ref: p.entry.ref, replaced: r.replaced, edited: 0, labels: r.labels });
    }
  }
  const report = buildReport(root, legacy, planned, { redactions, folderKeys, visibility: opts.visibility });
  const text = opts.json ? JSON.stringify(reportJson(report), null, 2) + '\n' : renderReport(report, opts.apply ? 'apply' : 'dry run (nothing written)');
  if (opts.report) fs.writeFileSync(opts.report, text);
  else out.push(text.replace(/\n$/, ''));
  if (!opts.apply) return { exitCode: 0, out };

  const refuse = (why: string): MigrateResult => ({ exitCode: 1, out: [...out, `refusing --apply: ${why}`] });
  if (report.totals['unmapped']! > 0) return refuse(`${report.totals['unmapped']} unmapped entr${report.totals['unmapped'] === 1 ? 'y' : 'ies'}; map or retire them in a plan file`);
  if (report.undecided.length) return refuse(`${report.undecided.length} undecided file(s) (tracked ${report.noLoss.tracked.undecided}, untracked ${report.noLoss.untracked.undecided}); decide each in a plan file (see the Undecided section)`);
  if (report.files.notWritten.length) return refuse(`${report.files.notWritten.length} file(s) a migrated entry accounts for would not be written (see Not written)`);
  const sha = pinnedSha(root);
  if (!sha) return refuse('not a git repository with a commit; migrated origins pin a commit (schema S3)');
  const tree = buildTree(legacy, planned, { sha, today: opts.today, fileDate, visibility: opts.visibility });
  const dir = storeDir(root);
  const existing = existingTree(dir);
  const strangers = [...existing].filter(([rel, content]) => rel !== MAP_FILE && !asBuffer(tree.files.get(rel))?.equals(content)).map(([rel]) => rel);
  if (strangers.length) {
    return refuse(`cortex/ holds files a previous apply of these inputs did not write: ${strangers.slice(0, 10).join(', ')}${strangers.length > 10 ? ', …' : ''}`);
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
  if (report.visibility.findings.length && report.visibility.repo !== 'private' && !opts.redact) {
    out.push(`${report.visibility.findings.length} visibility findings would be committed to a public (or unknown-visibility) repository; review them, or rerun with --redact <file>`);
  }
  return { exitCode: 0, out };
}

function accept(root: string, today: string, home: string): MigrateResult {
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
  const system = retireLegacySystem(root, home);
  return { exitCode: 0, out: [...r.lines, `migration accepted on ${(cfg['migration'] as Record<string, unknown>)['accepted']}; .cortex/ is left in place (remove it yourself: ${removal([LEGACY_DIR])})`, ...system.lines] };
}
