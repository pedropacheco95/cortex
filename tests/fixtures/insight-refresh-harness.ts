/**
 * Shared fixtures for the insight.refresh-loops tests (build-order-v3 step
 * 5e): sandboxed tmp git repos with real commits, a v3 `.cortex/insight/`
 * module (ledger/reverse-index/graph/entries) derived from the real file
 * hashes and the real HEAD commit. The real repo is NEVER touched.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { makeTmpDir, cleanTmp, gitInit, gitCommitAll, git } from './anatomy-harness.js';
import { sha256Of } from '../../src/insight/refresh-fast.js';
import {
  serializeLedger,
  serializeReverseIndex,
  serializeGraphV3,
  deriveEdgeId,
  type LedgerFile,
  type ReverseIndexFile,
  type InsightGraphV3,
  type GraphEdgeV3,
} from '../../src/insight/storage.js';

export { makeTmpDir, cleanTmp, gitInit, gitCommitAll, git };

export function headShort(root: string): string {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf-8' }).trim();
}

export function insightDir(root: string): string {
  return path.join(root, '.cortex', 'insight');
}

export function writeConfig(root: string, extraInsight: Record<string, unknown> = {}): void {
  fs.mkdirSync(path.join(root, '.cortex'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.cortex', 'cortex.config.json'),
    JSON.stringify({ schemaVersion: '3.0', hooks: { preRead: false }, insight: extraInsight }, null, 2) + '\n',
    'utf-8',
  );
}

/** A schema-valid per-file entry whose hashes match the file on disk. */
export function writeEntry(
  root: string,
  rel: string,
  level: 2 | 3,
  builtAtCommit: string,
  opts: { scope?: string } = {},
): void {
  const content = fs.readFileSync(path.join(root, rel), 'utf-8');
  const base = opts.scope !== undefined
    ? path.join(insightDir(root), 'scopes', opts.scope, 'anatomy')
    : path.join(insightDir(root), 'anatomy');
  const entryPath = path.join(base, `${rel}.md`);
  fs.mkdirSync(path.dirname(entryPath), { recursive: true });
  const sections =
    level === 3
      ? '## Purpose\n\nA fixture purpose.\n\n## Main players\n\n- `thing` (lines 1-3) — the thing.\n\n## Connections\n\nUses: (none)\n'
      : '## Purpose\n\nA fixture purpose.\n\n## Connections\n\nUses: (none)\n';
  // Quote the sha fields: a short sha like `9989e80` is valid YAML scientific
  // notation and would otherwise coerce to a float (5e flake regression).
  fs.writeFileSync(
    entryPath,
    `---\npath: ${rel}\nextracted_at: 2026-07-01T00:00:00Z\nextraction_level: ${level}\nsize_lines: ${content.split('\n').length}\nsize_tokens: 42\ncentrality: medium\nbuilt_at_commit: "${builtAtCommit}"\nsource_sha256: "${sha256Of(content)}"\n---\n\n${sections}`,
    'utf-8',
  );
}

export function writeLedgerFor(
  root: string,
  files: Array<{ path: string; level: 2 | 3 }>,
  builtAtCommit: string,
  opts: { stale?: string[]; cycleCommits?: string[] } = {},
): void {
  const entries: LedgerFile['entries'] = {};
  for (const f of files) {
    const content = fs.readFileSync(path.join(root, f.path), 'utf-8');
    entries[f.path] = { source_sha256: sha256Of(content), built_at_commit: builtAtCommit, extraction_level: f.level };
  }
  const ledger: LedgerFile = {
    schemaVersion: '3.0',
    built_at_commit: builtAtCommit,
    entries,
    ...(opts.stale !== undefined ? { stale: opts.stale } : {}),
    ...(opts.cycleCommits !== undefined ? { cycle_commits: opts.cycleCommits } : {}),
  };
  fs.mkdirSync(insightDir(root), { recursive: true });
  fs.writeFileSync(path.join(insightDir(root), 'ledger.json'), serializeLedger(ledger), 'utf-8');
}

export function makeEdge(
  source: string,
  target: string,
  edgeType: GraphEdgeV3['edge_type'],
  confidence: GraphEdgeV3['confidence'],
  confirmedAt: string,
): GraphEdgeV3 {
  return {
    id: deriveEdgeId(source, target, edgeType),
    source,
    target,
    edge_type: edgeType,
    confidence,
    evidence: 'fixture rationale',
    confirmed_at_commit: confirmedAt,
  };
}

export function writeGraphFor(root: string, nodes: InsightGraphV3['nodes'], edges: GraphEdgeV3[], builtAtCommit: string): void {
  const graph: InsightGraphV3 = {
    schemaVersion: '3.0',
    generated: '2026-07-01T00:00:00Z',
    built_at_commit: builtAtCommit,
    nodes,
    edges,
  };
  fs.mkdirSync(insightDir(root), { recursive: true });
  fs.writeFileSync(path.join(insightDir(root), 'graph.json'), serializeGraphV3(graph), 'utf-8');
}

export function writeReverseIndexFor(root: string, referencedBy: Record<string, string[]>, builtAtCommit: string): void {
  const index: ReverseIndexFile = { schemaVersion: '3.0', built_at_commit: builtAtCommit, referenced_by: referencedBy };
  fs.mkdirSync(insightDir(root), { recursive: true });
  fs.writeFileSync(path.join(insightDir(root), 'reverse-index.json'), serializeReverseIndex(index), 'utf-8');
}

export function writeScopeRegistryFor(root: string, scopes: Record<string, { path: string; depends_on: string[] }>, builtAtCommit: string): void {
  // Quote the commit: an all-decimal short sha would otherwise YAML-parse as
  // a number (the parser now tolerates that too, but the writer should quote).
  const lines = [`schemaVersion: "3.0"`, `built_at_commit: "${builtAtCommit}"`, 'scopes:'];
  for (const [id, scope] of Object.entries(scopes)) {
    lines.push(`  ${id}:`);
    lines.push(`    path: ${scope.path}`);
    lines.push(`    depends_on: [${scope.depends_on.join(', ')}]`);
  }
  fs.mkdirSync(insightDir(root), { recursive: true });
  fs.writeFileSync(path.join(insightDir(root), 'scope-registry.yaml'), lines.join('\n') + '\n', 'utf-8');
}
