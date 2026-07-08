/**
 * `cortex loop-insight-refresh --full` — the weekly ground-truth tier of the
 * insight refresh loops (spec insight.refresh-loops Rules 1, 4, 8; design
 * §5.9, §9). Deterministic Core bookends around the agentic middle run by the
 * shipped `skills/cortex-loop-insight-refresh-full/` bundle (Phase-4 L4
 * unification via cortex-extract-insight over all scopes):
 *
 *  - `--collect` emits the full L4 regeneration worklist
 *    (`.cortex/pulse/.insight-full-worklist.json`): every ledger path, every
 *    scope, plus the current graph/tags/clusters counts as the baseline the
 *    report compares against, the carried stale references, and the
 *    confidence-aged edges (the full pass also performs the aging check —
 *    spec Rule 4 allows daily or full).
 *  - `--report` validates the regenerated store against the §4.10 checks;
 *    when clean it blesses the pass as ground truth: `ledger.json`'s
 *    module-wide `built_at_commit` advances to HEAD, the stale set clears
 *    (everything was just re-derived), the refresh-cycle history advances,
 *    `reverse-index.json` is rebuilt from the new graph, and the pulse report
 *    `.cortex/pulse/insight-refresh.md` records the counts (including a
 *    shrink note when the regen legitimately shrank — full regen is the
 *    sanctioned ground-truth pass; the writer-side shrink guard remains the
 *    extraction skill's confirmation discipline, schema §4.10.6).
 *
 * Loop-write invariant (RULES 7): writes land only under `.cortex/insight/`
 * + the transient pulse worklist/report. Nothing gated, no proposal.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  parseTagsV3,
  parseClustersV3,
  serializeLedger,
  serializeReverseIndex,
  type TagsFileV3,
  type ClustersFileV3,
} from './storage.js';
import { readLedger } from './refresh-fast.js';
import {
  agedEdges,
  headCommit,
  readConfidenceAgingCycles,
  readGraph,
  readScopeRegistry,
  rebuildReverseIndex,
  INSIGHT_REFRESH_REPORT_FILE,
  INSIGHT_REFRESH_REPORT_KIND,
  type AgedEdge,
} from './refresh-daily.js';
import { checkInsightGraph, checkInsightLedger, checkInsightEntry } from '../schema/checks/insight.js';
import { writePulseReport } from '../loops/report.js';

export const FULL_WORKLIST_FILE = '.insight-full-worklist.json';
export const FULL_LOOP_NAME = 'cortex-loop-insight-refresh-full';

function insightDir(root: string): string {
  return path.join(root, '.cortex', 'insight');
}
function pulseDir(root: string): string {
  return path.join(root, '.cortex', 'pulse');
}

export interface StoreBaseline {
  nodes: number;
  edges: number;
  vocabulary: number;
  assignments: number;
  clusters: number;
}

export interface FullWorklist {
  kind: 'insight-full-worklist';
  generated: string;
  head_commit: string;
  /** Every extracted file, with its current level — the regen ground set. */
  files: Array<{ path: string; extraction_level: 2 | 3 }>;
  /** Every declared scope id ([] for flat layouts) — all scopes regenerate. */
  scopes: string[];
  baseline: StoreBaseline;
  stale_references: string[];
  aged_edges: AgedEdge[];
  aging_window: number;
}

export function fullWorklistPath(root: string): string {
  return path.join(pulseDir(root), FULL_WORKLIST_FILE);
}

export function readFullWorklist(root: string): FullWorklist | null {
  const p = fullWorklistPath(root);
  if (!fs.existsSync(p)) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf-8')) as FullWorklist;
    return doc.kind === 'insight-full-worklist' ? doc : null;
  } catch {
    return null;
  }
}

function readTags(root: string): TagsFileV3 | null {
  const p = path.join(insightDir(root), 'tags.json');
  if (!fs.existsSync(p)) return null;
  const parsed = parseTagsV3(fs.readFileSync(p, 'utf-8'));
  return parsed.ok && parsed.value ? parsed.value : null;
}

function readClusters(root: string): ClustersFileV3 | null {
  const p = path.join(insightDir(root), 'clusters.json');
  if (!fs.existsSync(p)) return null;
  const parsed = parseClustersV3(fs.readFileSync(p, 'utf-8'));
  return parsed.ok && parsed.value ? parsed.value : null;
}

export function storeBaseline(root: string): StoreBaseline {
  const graph = readGraph(root);
  const tags = readTags(root);
  const clusters = readClusters(root);
  return {
    nodes: graph?.nodes.length ?? 0,
    edges: graph?.edges.length ?? 0,
    vocabulary: tags?.vocabulary.length ?? 0,
    assignments: tags === null ? 0 : Object.keys(tags.assignments).length,
    clusters: clusters?.clusters.length ?? 0,
  };
}

export interface CollectFullResult {
  worklistPath: string;
  files: number;
  scopes: number;
  agedEdges: number;
}

/** `--collect`: the full-regeneration worklist — all files, all scopes. */
export function collectFull(root: string, now: Date = new Date()): CollectFullResult {
  const absRoot = path.resolve(root);
  const ledger = readLedger(absRoot);
  if (ledger === null) {
    throw new Error('no .cortex/insight/ledger.json — run the initial extraction (cortex-extract-insight) first');
  }
  const registry = readScopeRegistry(absRoot);
  const graph = readGraph(absRoot);
  const window = readConfidenceAgingCycles(absRoot);

  const files = Object.keys(ledger.entries)
    .sort()
    .map((p) => ({ path: p, extraction_level: (ledger.entries[p] as { extraction_level: 2 | 3 }).extraction_level }));
  const scopes = registry === null ? [] : Object.keys(registry.scopes).sort();

  const worklist: FullWorklist = {
    kind: 'insight-full-worklist',
    generated: now.toISOString(),
    head_commit: headCommit(absRoot),
    files,
    scopes,
    baseline: storeBaseline(absRoot),
    stale_references: [...(ledger.stale ?? [])].sort(),
    aged_edges: agedEdges(graph, ledger, window),
    aging_window: window,
  };
  fs.mkdirSync(pulseDir(absRoot), { recursive: true });
  const p = fullWorklistPath(absRoot);
  fs.writeFileSync(p, JSON.stringify(worklist, null, 2) + '\n', 'utf-8');
  return { worklistPath: p, files: files.length, scopes: scopes.length, agedEdges: worklist.aged_edges.length };
}

export interface ReportFullResult {
  ok: boolean;
  errors: number;
  warnings: number;
  shrunk: string[];
  reportPath: string;
}

/**
 * `--report`: validate the regenerated store; when clean, bless it as ground
 * truth (advance the module-wide `built_at_commit`, clear the stale set,
 * advance the cycle history, rebuild the reverse index). Validation errors →
 * report written, nothing blessed, exit 1 from the runner.
 */
export function reportFull(root: string, now: Date = new Date()): ReportFullResult {
  const absRoot = path.resolve(root);
  const worklist = readFullWorklist(absRoot);
  if (worklist === null) {
    throw new Error(`no .cortex/pulse/${FULL_WORKLIST_FILE} — run \`cortex loop-insight-refresh --full --collect\` first`);
  }
  const ledger = readLedger(absRoot);
  if (ledger === null) {
    throw new Error('no .cortex/insight/ledger.json — the regeneration must not remove the ledger');
  }
  const head = headCommit(absRoot);
  const window = readConfidenceAgingCycles(absRoot);

  const violations = [
    ...checkInsightGraph(absRoot),
    ...checkInsightLedger(absRoot),
    ...checkInsightEntry(absRoot),
  ];
  const errors = violations.filter((v) => v.severity === 'error');
  const warnings = violations.filter((v) => v.severity === 'warning');

  const after = storeBaseline(absRoot);
  const before = worklist.baseline;
  const shrunk = (Object.keys(before) as Array<keyof StoreBaseline>)
    .filter((dim) => after[dim] < before[dim])
    .map((dim) => `${dim} ${before[dim]} -> ${after[dim]}`);

  const clean = errors.length === 0;
  if (clean) {
    // Ground truth blessed: module-wide commit, cleared stale set (everything
    // was just re-derived), cycle history, rebuilt reverse index.
    ledger.built_at_commit = head;
    ledger.stale = [];
    ledger.cycle_commits = [head, ...(ledger.cycle_commits ?? []).filter((c) => c !== head)].slice(0, window);
    fs.writeFileSync(path.join(insightDir(absRoot), 'ledger.json'), serializeLedger(ledger), 'utf-8');
    const rebuilt = rebuildReverseIndex(readGraph(absRoot), ledger.schemaVersion, head);
    fs.writeFileSync(path.join(insightDir(absRoot), 'reverse-index.json'), serializeReverseIndex(rebuilt), 'utf-8');
  }

  const bodyLines = [
    '# Insight refresh — full (ground-truth L4 regeneration)',
    '',
    `- Validation: ${errors.length} error(s), ${warnings.length} warning(s)`,
    `- Store: ${after.nodes} node(s), ${after.edges} edge(s), ${after.vocabulary} tag(s), ${after.clusters} cluster(s)`,
    `- Files in the regen set: ${worklist.files.length}; scopes: ${worklist.scopes.length > 0 ? worklist.scopes.join(', ') : '(flat)'}`,
    `- Aged edges surfaced: ${worklist.aged_edges.length} (window ${worklist.aging_window} cycles)`,
    clean
      ? `- Ground truth blessed at ${head}: stale set cleared, reverse index rebuilt`
      : '- NOT blessed: validation errors — the previous ledger/reverse-index state is untouched',
  ];
  if (shrunk.length > 0) {
    bodyLines.push(
      `- Shrink note (sanctioned for the full pass): ${shrunk.join(', ')}`,
    );
  }
  if (errors.length > 0) {
    bodyLines.push('', '## Validation errors');
    for (const v of errors) bodyLines.push(`- ${v.location.path}: ${v.message}`);
  }
  const reportPath = writePulseReport(
    absRoot,
    INSIGHT_REFRESH_REPORT_FILE,
    INSIGHT_REFRESH_REPORT_KIND,
    FULL_LOOP_NAME,
    now.toISOString(),
    bodyLines.join('\n'),
  );

  return { ok: clean, errors: errors.length, warnings: warnings.length, shrunk, reportPath };
}

// ---------------------------------------------------------------------------
// entry — the modes
// ---------------------------------------------------------------------------

export interface RefreshFullOptions {
  collect?: boolean;
  report?: boolean;
  now?: Date;
}

export async function runRefreshFull(root = '.', opts: RefreshFullOptions = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();

  if (opts.collect && opts.report) {
    console.error('cortex loop-insight-refresh: --collect and --report are mutually exclusive.');
    return 1;
  }

  try {
    if (opts.collect) {
      const r = collectFull(absRoot, now);
      console.log(
        `cortex loop-insight-refresh --full: regeneration worklist written to .cortex/pulse/${FULL_WORKLIST_FILE} — ` +
          `${r.files} file(s), ${r.scopes} scope(s), ${r.agedEdges} aged edge(s).`,
      );
      return 0;
    }
    if (opts.report) {
      const r = reportFull(absRoot, now);
      console.log(
        `cortex loop-insight-refresh --full: ${r.ok ? 'ground truth blessed' : 'NOT blessed (validation errors)'} — ` +
          `${r.errors} error(s), ${r.warnings} warning(s)${r.shrunk.length > 0 ? `; shrink: ${r.shrunk.join(', ')}` : ''} — ` +
          `report at .cortex/pulse/${INSIGHT_REFRESH_REPORT_FILE}.`,
      );
      return r.ok ? 0 : 1;
    }
    // Bare: the regeneration middle is the shipped skill's job (R-001).
    const r = collectFull(absRoot, now);
    console.log(
      `cortex loop-insight-refresh --full: worklist collected (${r.files} file(s)); ` +
        `the L4 regeneration runs in the cortex-loop-insight-refresh-full skill — ` +
        `worklist retained at .cortex/pulse/${FULL_WORKLIST_FILE}.`,
    );
    return 0;
  } catch (err) {
    console.error(`cortex loop-insight-refresh: ${(err as Error).message}`);
    return 1;
  }
}
