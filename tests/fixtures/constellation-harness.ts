/**
 * Shared fixtures for the constellation.compiler tests. Builds handcrafted
 * knowledge surfaces (rules, bugs, atlas artefacts, the two spec trees,
 * scenario specs) inside sandboxed tmp projects and reads the compiled
 * `.cortex/constellation.json` back for JSON-property assertions.
 * (§4.9 v3.0: anatomy is gone — no files.md/layers.md scaffolding here.)
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Constellation } from '../../src/constellation/compile.js';

export { makeTmpDir, cleanTmp, makeCortexProject, writeRule } from './hooks-harness.js';

function writeArtefact(absPath: string, frontmatter: string, body: string): string {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, `---\n${frontmatter.trim()}\n---\n\n${body}`, 'utf-8');
  return absPath;
}

/** Dev spec at .specflow/specs/<relPath> with raw frontmatter YAML lines. */
export function writeDevSpec(root: string, relPath: string, frontmatter: string, body = '# Spec\n'): string {
  return writeArtefact(path.join(root, '.specflow', 'specs', relPath), frontmatter, body);
}

/** Business spec at .specflow/specs-business/<relPath> with raw frontmatter YAML lines. */
export function writeBizSpec(root: string, relPath: string, frontmatter: string, body = '# Outcome\n'): string {
  return writeArtefact(path.join(root, '.specflow', 'specs-business', relPath), frontmatter, body);
}

/** Bug ledger entry at .cortex/compass/bugs/<filename>. */
export function writeBug(root: string, filename: string, frontmatter: string, body = '# Bug\n'): string {
  return writeArtefact(path.join(root, '.cortex', 'compass', 'bugs', filename), frontmatter, body);
}

/** Atlas artefact at .cortex/atlas/<relPath>. */
export function writeAtlas(root: string, relPath: string, frontmatter: string, body = '# Artefact\n'): string {
  return writeArtefact(path.join(root, '.cortex', 'atlas', relPath), frontmatter, body);
}

/** Compass core file (preferences.md, environment.md, …). */
export function writeCompassCoreFile(root: string, filename: string): string {
  const p = path.join(root, '.cortex', 'compass', filename);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `# ${filename}\n\nFixture content.\n`, 'utf-8');
  return p;
}

/** Scenario test spec at tests/scenario/specs/<name>.md with a covers: list. */
export function writeScenarioSpec(root: string, name: string, covers: string[]): string {
  const fm = `name: ${name}\ncovers:\n${covers.map((c) => `  - ${c}`).join('\n')}`;
  return writeArtefact(path.join(root, 'tests', 'scenario', 'specs', `${name}.md`), fm, '# Scenario\n');
}

export function constellationPath(root: string): string {
  return path.join(root, '.cortex', 'constellation.json');
}

export function readConstellation(root: string): Constellation {
  return JSON.parse(fs.readFileSync(constellationPath(root), 'utf-8')) as Constellation;
}

/** The file bytes with the `generated` line removed (determinism assertions). */
export function withoutGeneratedLine(content: string): string {
  return content
    .split('\n')
    .filter((l) => !/^\s*"generated":/.test(l))
    .join('\n');
}

// ===========================================================================
// Insight fixtures (constellation.insight-preset-v3) — a fixture
// `.cortex/insight/` tree (unscoped layout: no scope-registry.yaml) for
// exercising `composeInsightPreset` without running the real extraction
// pipeline. Shapes follow insight.storage-format §4.10.6 / §4.10.2.
// ===========================================================================

const FIXTURE_COMMIT = 'fedcba9';
const FIXTURE_SHA256 = 'a'.repeat(64);

export interface FixtureGraphNode {
  id: string;
  kind: 'file' | 'element' | 'concept';
  label: string;
}

export interface FixtureGraphEdge {
  id: string;
  source: string;
  target: string;
  edge_type: string;
  confidence: 'structural' | 'stated' | 'inferred' | 'ambiguous';
  evidence: string;
  confirmed_at_commit?: string;
}

/** `.cortex/insight/graph.json` (top-level, unscoped). */
export function writeInsightGraph(
  root: string,
  nodes: FixtureGraphNode[],
  edges: FixtureGraphEdge[],
): string {
  const doc = {
    schemaVersion: '3.0',
    generated: '2026-07-08T21:00:00.000Z',
    built_at_commit: FIXTURE_COMMIT,
    nodes,
    edges: edges.map((e) => ({ confirmed_at_commit: FIXTURE_COMMIT, ...e })),
  };
  const p = path.join(root, '.cortex', 'insight', 'graph.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
  return p;
}

export interface FixtureCluster {
  id: string;
  label: string;
  members: string[];
  rationale?: string;
  scope?: string;
}

/** `.cortex/insight/clusters.json` (top-level — clusters are never scope-local). */
export function writeInsightClusters(root: string, clusters: FixtureCluster[]): string {
  const doc = {
    schemaVersion: '3.0',
    generated: '2026-07-08T21:00:00.000Z',
    built_at_commit: FIXTURE_COMMIT,
    clusters: clusters.map((c) => ({ rationale: 'fixture cluster', scope: 'global', ...c })),
  };
  const p = path.join(root, '.cortex', 'insight', 'clusters.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
  return p;
}

/** `.cortex/insight/anatomy/<sourcePath>.md` — a per-file understanding
 *  entry (§4.10.2). `mainPlayers` bullets should be pre-formatted markdown
 *  (e.g. `` - `run` (lines 10-40) — does the thing.``) when the fixture
 *  needs `element` range extraction to succeed. */
export function writeInsightFileEntry(
  root: string,
  sourcePath: string,
  opts: { purpose: string; mainPlayers?: string; extractionLevel?: 2 | 3 },
): string {
  const level = opts.extractionLevel ?? (opts.mainPlayers ? 3 : 2);
  const fm = [
    `path: ${sourcePath}`,
    'extracted_at: 2026-07-08T21:00:00Z',
    `extraction_level: ${level}`,
    'size_lines: 42',
    'size_tokens: 400',
    'centrality: medium',
    `built_at_commit: "${FIXTURE_COMMIT}"`,
    `source_sha256: "${FIXTURE_SHA256}"`,
  ].join('\n');
  let body = `# ${sourcePath}\n\n## Purpose\n${opts.purpose}\n`;
  if (level === 3) body += `\n## Main players\n${opts.mainPlayers ?? '- \`thing\` — does the thing.'}\n`;
  body += `\n## Connections\nUses:\n- (none)\n\nUsed by:\n- (none)\n`;
  const p = path.join(root, '.cortex', 'insight', 'anatomy', `${sourcePath}.md`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `---\n${fm}\n---\n\n${body}`, 'utf-8');
  return p;
}

/** `.cortex/insight/concepts/<slug>.md` — a concept doc (free markdown, no
 *  required frontmatter per §4.10.6's concept-doc convention). */
export function writeInsightConcept(root: string, slug: string, excerpt: string, filesSection = ''): string {
  const body = `# ${slug}\n\n${excerpt}\n${filesSection ? `\n## Files\n${filesSection}\n` : ''}`;
  const p = path.join(root, '.cortex', 'insight', 'concepts', `${slug}.md`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body, 'utf-8');
  return p;
}
