/**
 * `cortex loop-insight-refresh --daily` — the daily tier of the insight
 * refresh loops (spec insight.refresh-loops Rules 1–7; design §5.9, §9).
 * Deterministic Core bookends around the agentic middle run by the shipped
 * `skills/cortex-loop-insight-refresh-daily/` bundle (Haiku triage + Sonnet
 * L2/L3 re-extraction via cortex-extract-insight in dirty-only mode):
 *
 *  - `--collect` reads the fast tier's worklist + `ledger.json` and splits the
 *    flagged files deterministically: unchanged (sha back in sync) and
 *    obvious-cosmetic are dropped; obvious-real → L2 due; L3 heuristics (new
 *    exports, size delta, structure change) → significant-candidates; the rest
 *    → Haiku triage. It also surfaces the anti-silent-drift work (5e-ii):
 *    stale concept/edge references from the ledger, confidence-aged
 *    inferred/ambiguous edges, and the scope-scoped invalidation plan
 *    (touched scopes + the cross-scope edges touching them). Emits
 *    `.cortex/pulse/state/insight-daily-worklist.json`.
 *  - `--apply` validates the re-extracted entries against the §4.10.2
 *    contract, reconciles `ledger.json` (per-entry sha/commit/level for
 *    refreshed files; rows removed for deleted files; rows for untouched
 *    scopes byte-untouched), neighbourhood-updates L4 (edges touching an
 *    L3-re-extracted file's entities get `confirmed_at_commit` = HEAD), marks
 *    newly-invalidated references stale in the ledger via
 *    `reverse-index.json`, clears the stale set the skill just re-verified,
 *    rebuilds `reverse-index.json` from the new graph state, advances the
 *    refresh-cycle history (confidence-aging window), prunes the fast
 *    worklist, and writes the pulse report `.cortex/pulse/reports/insight-refresh.md`.
 *
 * Loop-write invariant (RULES 7 / schema Decision 13): writes land only under
 * `.cortex/insight/` + the transient pulse worklist/report. Nothing gated,
 * no pulse proposal. Core halves are deterministic — the judgment never runs
 * here (R-001).
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { parseEntry } from './entry.js';
import {
  parseGraphV3,
  parseReverseIndex,
  parseScopeRegistry,
  serializeGraphV3,
  serializeLedger,
  serializeReverseIndex,
  CONCEPT_NODE_ID_PATTERN,
  type GraphEdgeV3,
  type InsightGraphV3,
  type LedgerFile,
  type ReverseIndexFile,
  type ScopeRegistry,
} from './storage.js';
import { classifyChange } from './significance.js';
import { languageForExt } from './l1-triage.js';
import {
  readLedger,
  readWorklist,
  writeWorklist,
  gitShow,
  sha256Of,
  INSIGHT_WORKLIST_FILE,
  type FlaggedFile,
} from './refresh-fast.js';
import { writePulseReport } from '../loops/report.js';

export const DAILY_WORKLIST_FILE = 'insight-daily-worklist.json';
export const INSIGHT_REFRESH_REPORT_FILE = 'insight-refresh.md';
export const INSIGHT_REFRESH_REPORT_KIND = 'insight-refresh';
export const DAILY_LOOP_NAME = 'cortex-loop-insight-refresh-daily';

/** Confidence-aging window N: `insight.confidenceAgingCycles` in
 *  cortex.config.json, default 3 (spec insight.refresh-loops Rule 4 leaves the
 *  key + value to this implementation; schema §10.1 defers the v3 insight
 *  config keys here). */
export const DEFAULT_CONFIDENCE_AGING_CYCLES = 3;

export function readConfidenceAgingCycles(root: string): number {
  try {
    const config = JSON.parse(
      fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8'),
    ) as { insight?: { confidenceAgingCycles?: unknown } };
    const value = config.insight?.confidenceAgingCycles;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return value;
  } catch {
    /* missing/unparseable → default */
  }
  return DEFAULT_CONFIDENCE_AGING_CYCLES;
}

// ---------------------------------------------------------------------------
// shared insight-module readers
// ---------------------------------------------------------------------------

function insightDir(root: string): string {
  return path.join(root, '.cortex', 'insight');
}
/** Machine working state under `pulse/state/` (pulse reorg). */
function stateDir(root: string): string {
  return path.join(root, '.cortex', 'pulse', 'state');
}

export function readGraph(root: string): InsightGraphV3 | null {
  const p = path.join(insightDir(root), 'graph.json');
  if (!fs.existsSync(p)) return null;
  const parsed = parseGraphV3(fs.readFileSync(p, 'utf-8'));
  return parsed.ok && parsed.value ? parsed.value : null;
}

export function readReverseIndex(root: string): ReverseIndexFile | null {
  const p = path.join(insightDir(root), 'reverse-index.json');
  if (!fs.existsSync(p)) return null;
  const parsed = parseReverseIndex(fs.readFileSync(p, 'utf-8'));
  return parsed.ok && parsed.value ? parsed.value : null;
}

export function readScopeRegistry(root: string): ScopeRegistry | null {
  const p = path.join(insightDir(root), 'scope-registry.yaml');
  if (!fs.existsSync(p)) return null;
  const parsed = parseScopeRegistry(fs.readFileSync(p, 'utf-8'));
  return parsed.ok && parsed.value ? parsed.value : null;
}

export function headCommit(absRoot: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: absRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

/** Longest-prefix owning scope for a project-relative path (spec Rule 5);
 *  undefined for flat layouts / unowned paths. */
export function owningScope(registry: ScopeRegistry | null, rel: string): string | undefined {
  if (registry === null) return undefined;
  let best: string | undefined;
  let bestLen = -1;
  for (const [id, scope] of Object.entries(registry.scopes)) {
    const prefix = scope.path.replace(/\/+$/, '');
    if ((rel === prefix || rel.startsWith(prefix + '/')) && prefix.length > bestLen) {
      best = id;
      bestLen = prefix.length;
    }
  }
  return best;
}

/** Source path of a `file:`/`element:` node id; undefined for concept nodes. */
export function entityPath(nodeId: string): string | undefined {
  if (nodeId.startsWith('file:')) return nodeId.slice('file:'.length);
  if (nodeId.startsWith('element:')) {
    const rest = nodeId.slice('element:'.length);
    const hash = rest.indexOf('#');
    return hash >= 0 ? rest.slice(0, hash) : rest;
  }
  return undefined;
}

/** True when the edge touches an entity (file/element node) of `rel`. */
function edgeTouchesPath(edge: GraphEdgeV3, rel: string): boolean {
  return entityPath(edge.source) === rel || entityPath(edge.target) === rel;
}

// ---------------------------------------------------------------------------
// collect — deterministic first bookend
// ---------------------------------------------------------------------------

export interface DailyFileEntry {
  path: string;
  scope: string | null;
  reason: string;
  /** The ledger's extraction level for the file (2 when new). */
  current_level: 2 | 3;
}

export interface DailyTriageEntry extends DailyFileEntry {
  exports_added: string[];
  exports_removed: string[];
  size_delta_ratio: number;
  changed_line_ratio: number;
}

export interface AgedEdge {
  id: string;
  confidence: string;
  confirmed_at_commit: string;
  evidence: string;
}

export interface CrossScopeEdge {
  id: string;
  source: string;
  target: string;
  scopes: string[];
}

export interface DailyWorklist {
  kind: 'insight-daily-worklist';
  generated: string;
  head_commit: string;
  /** L2 re-extraction due — any real change (spec Rule 1). */
  l2: DailyFileEntry[];
  /** L3 re-extraction due — significant change (Core heuristics). */
  l3: DailyFileEntry[];
  /** Haiku triage — the structural filter could not decide (spec Rule 2). */
  triage: DailyTriageEntry[];
  /** Ruled out deterministically (cosmetic / back in sync). */
  dropped: Array<{ path: string; reason: string }>;
  /** Deleted files whose ledger rows (and entries) must go. */
  removals: Array<{ path: string }>;
  /** Scope-scoped invalidation plan (spec Rule 5). */
  touched_scopes: string[];
  cross_scope_edges: CrossScopeEdge[];
  /** Reverse-dependency invalidation: concept/edge ids to re-verify (Rule 3). */
  stale_references: string[];
  /** Confidence-aging (Rule 4): inferred/ambiguous edges past the N window. */
  aged_edges: AgedEdge[];
  aging_window: number;
}

export function dailyWorklistPath(root: string): string {
  return path.join(stateDir(root), DAILY_WORKLIST_FILE);
}

export function readDailyWorklist(root: string): DailyWorklist | null {
  const p = dailyWorklistPath(root);
  if (!fs.existsSync(p)) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf-8')) as DailyWorklist;
    return doc.kind === 'insight-daily-worklist' ? doc : null;
  } catch {
    return null;
  }
}

/** Aged inferred/ambiguous edges: `confirmed_at_commit` not among the last N
 *  refresh-cycle commits, once N cycles of history exist (spec Rule 4). */
export function agedEdges(graph: InsightGraphV3 | null, ledger: LedgerFile, window: number): AgedEdge[] {
  const cycles = ledger.cycle_commits ?? [];
  if (graph === null || cycles.length < window) return [];
  const recent = new Set(cycles.slice(0, window));
  return graph.edges
    .filter(
      (e) =>
        (e.confidence === 'inferred' || e.confidence === 'ambiguous') &&
        !recent.has(e.confirmed_at_commit),
    )
    .map((e) => ({ id: e.id, confidence: e.confidence, confirmed_at_commit: e.confirmed_at_commit, evidence: e.evidence }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface CollectDailyResult {
  worklistPath: string;
  l2: number;
  l3: number;
  triage: number;
  dropped: number;
  removals: number;
  staleReferences: number;
  agedEdges: number;
}

/**
 * `--collect`: split the flagged files by real-change + significance
 * heuristics, and surface the anti-silent-drift work. Throws when no
 * extraction exists (the daily loop refreshes; it never bootstraps).
 */
export function collectDaily(root: string, now: Date = new Date()): CollectDailyResult {
  const absRoot = path.resolve(root);
  const ledger = readLedger(absRoot);
  if (ledger === null) {
    throw new Error('no .cortex/insight/ledger.json — run the initial extraction (cortex-extract-insight) first');
  }
  const registry = readScopeRegistry(absRoot);
  const graph = readGraph(absRoot);
  const flagged = readWorklist(absRoot);
  const window = readConfidenceAgingCycles(absRoot);

  const l2: DailyFileEntry[] = [];
  const l3: DailyFileEntry[] = [];
  const triage: DailyTriageEntry[] = [];
  const dropped: Array<{ path: string; reason: string }> = [];
  const removals: Array<{ path: string }> = [];

  for (const flag of [...flagged].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const rel = flag.path;
    const entry = ledger.entries[rel];
    const scope = owningScope(registry, rel) ?? null;

    if (flag.reason === 'deleted') {
      if (entry !== undefined) removals.push({ path: rel });
      else dropped.push({ path: rel, reason: 'deleted before extraction' });
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(path.join(absRoot, rel), 'utf-8');
    } catch {
      if (entry !== undefined) removals.push({ path: rel });
      else dropped.push({ path: rel, reason: 'file vanished' });
      continue;
    }

    if (entry === undefined) {
      l2.push({ path: rel, scope, reason: 'new file — no insight entry yet', current_level: 2 });
      continue;
    }
    if (sha256Of(content) === entry.source_sha256) {
      dropped.push({ path: rel, reason: 'unchanged — sha back in sync with the ledger' });
      continue;
    }

    const baseline = gitShow(absRoot, entry.built_at_commit, rel);
    if (baseline === null) {
      triage.push({
        path: rel,
        scope,
        reason: 'sha mismatch, no baseline content — needs LLM triage',
        current_level: entry.extraction_level,
        exports_added: [],
        exports_removed: [],
        size_delta_ratio: 0,
        changed_line_ratio: 0,
      });
      continue;
    }
    const result = classifyChange(baseline, content, languageForExt(path.extname(rel).toLowerCase()));
    switch (result.verdict) {
      case 'identical':
      case 'cosmetic':
        dropped.push({ path: rel, reason: result.reason });
        break;
      case 'real':
        l2.push({ path: rel, scope, reason: result.reason, current_level: entry.extraction_level });
        break;
      case 'significant-candidate':
        l3.push({ path: rel, scope, reason: result.reason, current_level: entry.extraction_level });
        break;
      case 'uncertain':
        triage.push({
          path: rel,
          scope,
          reason: result.reason,
          current_level: entry.extraction_level,
          exports_added: result.exportsAdded,
          exports_removed: result.exportsRemoved,
          size_delta_ratio: result.sizeDeltaRatio,
          changed_line_ratio: result.changedLineRatio,
        });
        break;
    }
  }

  // Scope-scoped invalidation plan (spec Rule 5): the touched scopes + the
  // cross-scope edges touching them. Untouched scopes stay cached.
  const touchedScopes = [
    ...new Set(
      [...l2, ...l3, ...triage]
        .map((e) => e.scope)
        .filter((s): s is string => s !== null),
    ),
  ].sort();
  const crossScopeEdges: CrossScopeEdge[] = [];
  if (graph !== null && registry !== null && touchedScopes.length > 0) {
    const touched = new Set(touchedScopes);
    for (const edge of graph.edges) {
      const sourcePath = entityPath(edge.source);
      const targetPath = entityPath(edge.target);
      if (sourcePath === undefined || targetPath === undefined) continue;
      const sourceScope = owningScope(registry, sourcePath);
      const targetScope = owningScope(registry, targetPath);
      if (sourceScope === undefined || targetScope === undefined || sourceScope === targetScope) continue;
      if (touched.has(sourceScope) || touched.has(targetScope)) {
        crossScopeEdges.push({ id: edge.id, source: edge.source, target: edge.target, scopes: [sourceScope, targetScope].sort() });
      }
    }
    crossScopeEdges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  const worklist: DailyWorklist = {
    kind: 'insight-daily-worklist',
    generated: now.toISOString(),
    head_commit: headCommit(absRoot),
    l2,
    l3,
    triage,
    dropped,
    removals,
    touched_scopes: touchedScopes,
    cross_scope_edges: crossScopeEdges,
    stale_references: [...(ledger.stale ?? [])].sort(),
    aged_edges: agedEdges(graph, ledger, window),
    aging_window: window,
  };
  fs.mkdirSync(stateDir(absRoot), { recursive: true });
  const p = dailyWorklistPath(absRoot);
  fs.writeFileSync(p, JSON.stringify(worklist, null, 2) + '\n', 'utf-8');
  return {
    worklistPath: p,
    l2: l2.length,
    l3: l3.length,
    triage: triage.length,
    dropped: dropped.length,
    removals: removals.length,
    staleReferences: worklist.stale_references.length,
    agedEdges: worklist.aged_edges.length,
  };
}

// ---------------------------------------------------------------------------
// apply — deterministic last bookend
// ---------------------------------------------------------------------------

/** Locate the per-file entry markdown for a source path (scoped or flat). */
export function entryFileFor(root: string, rel: string, scope: string | null): string | undefined {
  const candidates: string[] = [];
  if (scope !== null) candidates.push(path.join(insightDir(root), 'scopes', scope, 'anatomy', `${rel}.md`));
  candidates.push(path.join(insightDir(root), 'anatomy', `${rel}.md`));
  return candidates.find((p) => fs.existsSync(p));
}

/** Rebuild `referenced_by` from the graph: every edge id touching an entity,
 *  plus the concept id when the edge links the entity to a concept (§4.10.5). */
export function rebuildReverseIndex(graph: InsightGraphV3 | null, schemaVersion: string, builtAtCommit: string): ReverseIndexFile {
  const referenced: Record<string, Set<string>> = {};
  const add = (entity: string, ref: string): void => {
    (referenced[entity] ??= new Set()).add(ref);
  };
  for (const edge of graph?.edges ?? []) {
    for (const [endpoint, other] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ] as const) {
      if (entityPath(endpoint) === undefined) continue; // concepts are not entities
      add(endpoint, edge.id);
      if (CONCEPT_NODE_ID_PATTERN.test(other)) add(endpoint, other);
    }
  }
  const referenced_by: Record<string, string[]> = {};
  for (const key of Object.keys(referenced).sort()) {
    referenced_by[key] = [...(referenced[key] as Set<string>)].sort();
  }
  return { schemaVersion, built_at_commit: builtAtCommit, referenced_by };
}

export interface ApplyDailyResult {
  refreshed: number;
  pending: number;
  invalid: number;
  removed: number;
  edgesConfirmed: number;
  staleMarked: number;
  staleCleared: number;
  reportPath: string;
}

/**
 * `--apply`: validate + reconcile after the skill's re-extraction. See the
 * module header for the full write set. Ledger rows for files outside the
 * worklist are byte-untouched (scope-scoped invalidation, spec Rule 5).
 */
export function applyDaily(root: string, now: Date = new Date()): ApplyDailyResult {
  const absRoot = path.resolve(root);
  const worklist = readDailyWorklist(absRoot);
  if (worklist === null) {
    throw new Error(`no .cortex/pulse/state/${DAILY_WORKLIST_FILE} — run \`cortex loop-insight-refresh --daily --collect\` first`);
  }
  const ledger = readLedger(absRoot);
  if (ledger === null) {
    throw new Error('no .cortex/insight/ledger.json — run the initial extraction first');
  }
  const head = headCommit(absRoot);
  const window = readConfidenceAgingCycles(absRoot);

  const candidates = [...worklist.l2, ...worklist.l3, ...worklist.triage];
  const refreshedPaths: string[] = [];
  const refreshedL3 = new Set<string>();
  const pendingPaths: string[] = [];
  const invalidEntries: Array<{ path: string; errors: string[] }> = [];

  for (const candidate of candidates) {
    const rel = candidate.path;
    const entryFile = entryFileFor(absRoot, rel, candidate.scope);
    if (entryFile === undefined) {
      pendingPaths.push(rel);
      continue;
    }
    const parsed = parseEntry(fs.readFileSync(entryFile, 'utf-8'));
    if (!parsed.ok || !parsed.value) {
      invalidEntries.push({ path: rel, errors: parsed.errors ?? ['unparseable entry'] });
      continue;
    }
    let currentSha: string | undefined;
    try {
      currentSha = sha256Of(fs.readFileSync(path.join(absRoot, rel), 'utf-8'));
    } catch {
      currentSha = undefined;
    }
    const fm = parsed.value.frontmatter;
    if (currentSha === undefined || fm.source_sha256 !== currentSha) {
      pendingPaths.push(rel); // entry not refreshed (or the file moved again mid-flight)
      continue;
    }
    // Refreshed: reconcile the ledger row from the entry frontmatter (the
    // single source of truth the checks validated).
    ledger.entries[rel] = {
      source_sha256: fm.source_sha256,
      built_at_commit: fm.built_at_commit,
      extraction_level: fm.extraction_level,
    };
    refreshedPaths.push(rel);
    if (fm.extraction_level === 3) refreshedL3.add(rel);
  }

  // Removals: deleted files lose their ledger rows.
  let removed = 0;
  for (const removal of worklist.removals) {
    if (ledger.entries[removal.path] !== undefined) {
      delete ledger.entries[removal.path];
      removed++;
    }
  }

  // Reverse-dependency invalidation (5e-ii): every concept/edge referencing an
  // entity of a re-extracted file goes stale for the next cycle's
  // re-verification; the set surfaced to the skill THIS cycle is cleared.
  const reverseIndex = readReverseIndex(absRoot);
  const newStale = new Set<string>();
  if (reverseIndex !== null) {
    const touched = new Set([...refreshedPaths, ...worklist.removals.map((r) => r.path)]);
    for (const [entity, refs] of Object.entries(reverseIndex.referenced_by)) {
      const rel = entityPath(entity);
      if (rel !== undefined && touched.has(rel)) {
        for (const ref of refs) newStale.add(ref);
      }
    }
  }
  const surfaced = new Set(worklist.stale_references);
  const carried = (ledger.stale ?? []).filter((id) => !surfaced.has(id));
  const staleNext = [...new Set([...carried, ...newStale])].sort();
  const staleCleared = (ledger.stale ?? []).length - carried.length;
  ledger.stale = staleNext;

  // L4 neighbourhood update: edges touching an L3-re-extracted file's entities
  // are re-confirmed at HEAD (spec Rule 1 "neighbourhood updates around L3").
  let edgesConfirmed = 0;
  const graphPath = path.join(insightDir(absRoot), 'graph.json');
  let graph = readGraph(absRoot);
  if (graph !== null && refreshedL3.size > 0) {
    const edges = graph.edges.map((e) => {
      for (const rel of refreshedL3) {
        if (edgeTouchesPath(e, rel)) {
          edgesConfirmed++;
          return { ...e, confirmed_at_commit: head };
        }
      }
      return e;
    });
    graph = { ...graph, edges };
    fs.writeFileSync(graphPath, serializeGraphV3(graph), 'utf-8');
  }

  // Refresh-cycle history for confidence-aging (5e-ii): most-recent-first,
  // capped at the window.
  const cycles = [head, ...(ledger.cycle_commits ?? []).filter((c) => c !== head)].slice(0, window);
  ledger.cycle_commits = cycles;

  fs.writeFileSync(path.join(insightDir(absRoot), 'ledger.json'), serializeLedger(ledger), 'utf-8');

  // Rebuild the reverse index from the new graph state (5e-ii).
  const rebuilt = rebuildReverseIndex(graph, ledger.schemaVersion, head);
  fs.writeFileSync(path.join(insightDir(absRoot), 'reverse-index.json'), serializeReverseIndex(rebuilt), 'utf-8');

  // Prune the fast worklist: processed paths leave; pending ones stay flagged.
  const processed = new Set([
    ...refreshedPaths,
    ...worklist.dropped.map((d) => d.path),
    ...worklist.removals.map((r) => r.path),
  ]);
  const remaining: FlaggedFile[] = readWorklist(absRoot).filter((f) => !processed.has(f.path));
  writeWorklist(absRoot, remaining, now);

  // The pulse report (report-only artefact — not a proposal, RULES 7).
  const bodyLines = [
    '# Insight refresh — daily',
    '',
    `- Refreshed: ${refreshedPaths.length} entr${refreshedPaths.length === 1 ? 'y' : 'ies'} (${refreshedL3.size} at L3)`,
    `- Pending (flag kept): ${pendingPaths.length}`,
    `- Invalid entries: ${invalidEntries.length}`,
    `- Ledger rows removed (deleted files): ${removed}`,
    `- L4 edges re-confirmed at ${head}: ${edgesConfirmed}`,
    `- Stale references marked for next cycle: ${newStale.size}; cleared this cycle: ${staleCleared}`,
    `- Aged edges surfaced this cycle: ${worklist.aged_edges.length} (window ${worklist.aging_window} cycles)`,
    `- Touched scopes: ${worklist.touched_scopes.length > 0 ? worklist.touched_scopes.join(', ') : '(none / flat layout)'}`,
  ];
  if (invalidEntries.length > 0) {
    bodyLines.push('', '## Invalid entries');
    for (const inv of invalidEntries) {
      bodyLines.push(`- ${inv.path}: ${inv.errors.join('; ')}`);
    }
  }
  if (refreshedPaths.length === 0 && removed === 0 && invalidEntries.length === 0) {
    bodyLines.push('', 'Nothing refreshed this cycle.');
  }
  const reportPath = writePulseReport(
    absRoot,
    INSIGHT_REFRESH_REPORT_FILE,
    INSIGHT_REFRESH_REPORT_KIND,
    DAILY_LOOP_NAME,
    now.toISOString(),
    bodyLines.join('\n'),
  );

  return {
    refreshed: refreshedPaths.length,
    pending: pendingPaths.length,
    invalid: invalidEntries.length,
    removed,
    edgesConfirmed,
    staleMarked: newStale.size,
    staleCleared,
    reportPath,
  };
}

// ---------------------------------------------------------------------------
// entry — the modes
// ---------------------------------------------------------------------------

export interface RefreshDailyOptions {
  collect?: boolean;
  apply?: boolean;
  now?: Date;
}

export async function runRefreshDaily(root = '.', opts: RefreshDailyOptions = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();

  if (opts.collect && opts.apply) {
    console.error('cortex loop-insight-refresh: --collect and --apply are mutually exclusive.');
    return 1;
  }

  try {
    if (opts.collect) {
      const r = collectDaily(absRoot, now);
      console.log(
        `cortex loop-insight-refresh --daily: worklist written to .cortex/pulse/state/${DAILY_WORKLIST_FILE} — ` +
          `${r.l2} L2, ${r.l3} L3, ${r.triage} for triage, ${r.dropped} dropped (cosmetic/unchanged), ` +
          `${r.removals} removal(s), ${r.staleReferences} stale reference(s), ${r.agedEdges} aged edge(s).`,
      );
      return 0;
    }
    if (opts.apply) {
      const r = applyDaily(absRoot, now);
      console.log(
        `cortex loop-insight-refresh --daily: ${r.refreshed} entr${r.refreshed === 1 ? 'y' : 'ies'} reconciled ` +
          `(${r.pending} pending, ${r.invalid} invalid), ${r.removed} ledger row(s) removed, ` +
          `${r.edgesConfirmed} edge(s) re-confirmed, ${r.staleMarked} reference(s) marked stale — ` +
          `report at .cortex/pulse/reports/${INSIGHT_REFRESH_REPORT_FILE}.`,
      );
      return 0;
    }
    // Bare: the judgment middle (Haiku triage + L2/L3 re-extraction) is the
    // shipped skill's job — Core never runs it (R-001). Collect and say so.
    const r = collectDaily(absRoot, now);
    console.log(
      `cortex loop-insight-refresh --daily: worklist collected (${r.l2 + r.l3 + r.triage} file(s) due); ` +
        `the triage/re-extraction middle runs in the cortex-loop-insight-refresh-daily skill — ` +
        `worklist retained at .cortex/pulse/state/${DAILY_WORKLIST_FILE}.`,
    );
    return 0;
  } catch (err) {
    console.error(`cortex loop-insight-refresh: ${(err as Error).message}`);
    return 1;
  }
}
