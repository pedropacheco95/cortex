/**
 * Constellation compiler (spec constellation.compiler, 9 rules; schema §4.9).
 *
 * Reads the four knowledge surfaces (anatomy, compass, atlas, the two spec
 * trees) plus scenario specs, builds the citation graph per schema §6, groups
 * nodes into the four Level-1 constellations, and writes
 * `.cortex/constellation.json` deterministically. Pure Core: offline,
 * read-only over every input, tolerant of missing surfaces (Rule 9), and
 * never fails on a broken reference — dangling refs are dropped and counted
 * (Rule 6; complaining is `check.constellation` / `schema.validator`'s job).
 *
 * Import/export edges from `graph.json` are deliberately excluded (Rule 5,
 * design §12.7): the constellation is the citation graph, not code structure.
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import picomatch from 'picomatch';
import { splitDataRowCells } from '../anatomy/files-md.js';
import { specsRoot, businessRoot, SPECS_GLOB, BUSINESS_GLOB } from '../paths.js';

export interface ConstellationGroupChild {
  id: string;
  label: string;
}

export interface ConstellationGroup {
  id: string;
  label: string;
  children: ConstellationGroupChild[];
}

export interface ConstellationNode {
  id: string;
  module: ConstellationModule;
  label: string;
  group: string;
  ref: string;
  /** Token estimate — anatomy nodes only (§4.9). */
  size?: number;
}

export interface ConstellationEdge {
  from: string;
  to: string;
  kind: string;
}

/** §4.9 module enum. */
export type ConstellationModule =
  | 'anatomy'
  | 'rule'
  | 'bug'
  | 'compass'
  | 'atlas'
  | 'spec-dev'
  | 'spec-business';

export interface Constellation {
  schemaVersion: string;
  generated: string;
  groups: ConstellationGroup[];
  nodes: ConstellationNode[];
  edges: ConstellationEdge[];
  counters: {
    anatomy: number;
    compass: number;
    atlas: number;
    specs: number;
    edges: number;
    droppedRefs: number;
  };
}

/** The four compass core files (§1; `decisions.md` excluded — decisions live
 *  solely in `atlas/decisions/`, addendum §A2.1) — `compass:<file>` nodes when present. */
const COMPASS_CORE_FILES = ['do-not-repeat.md', 'environment.md', 'preferences.md', 'standing-authorities.md'];

const UNASSIGNED_LAYER = '(unassigned)';

/** Scaffolding files never become nodes (compiler Rule 3). */
function isScaffolding(relPath: string): boolean {
  const base = path.posix.basename(relPath);
  return base === '_index.md' || base === '_overview.md';
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}

function readFrontmatter(absPath: string): Record<string, unknown> | undefined {
  try {
    return matter(fs.readFileSync(absPath, 'utf-8')).data as Record<string, unknown>;
  } catch {
    return undefined; // tolerant: a malformed artefact simply produces no node
  }
}

interface AnatomyRow {
  relPath: string;
  tokens: number | undefined;
  specLinks: string[];
}

/** Parse `.cortex/anatomy/files.md` rows (shared row format, schema §4.1). */
function readAnatomyRows(root: string): AnatomyRow[] {
  const filesPath = path.join(root, '.cortex', 'anatomy', 'files.md');
  if (!fs.existsSync(filesPath)) return [];
  let content: string;
  try {
    content = matter(fs.readFileSync(filesPath, 'utf-8')).content;
  } catch {
    return [];
  }
  const rows: AnatomyRow[] = [];
  for (const line of content.split('\n')) {
    const cols = splitDataRowCells(line);
    if (cols === null || cols.length < 7 || !cols[0]) continue;
    const tokensRaw = Number(cols[2]);
    const specLinksCell = cols[5] ?? '';
    rows.push({
      relPath: cols[0],
      tokens: Number.isFinite(tokensRaw) ? tokensRaw : undefined,
      specLinks: specLinksCell === '-' || specLinksCell === '' ? [] : specLinksCell.split(/\s+/).filter(Boolean),
    });
  }
  return rows;
}

/** Parse `layers.md` (H2 per layer, `- path` bullets) → path→layer + heading order. */
function readLayers(root: string): { pathToLayer: Map<string, string>; layerNames: string[] } {
  const pathToLayer = new Map<string, string>();
  const layerNames: string[] = [];
  const layersPath = path.join(root, '.cortex', 'anatomy', 'layers.md');
  if (!fs.existsSync(layersPath)) return { pathToLayer, layerNames };
  let content: string;
  try {
    content = fs.readFileSync(layersPath, 'utf-8');
  } catch {
    return { pathToLayer, layerNames };
  }
  let current: string | undefined;
  for (const line of content.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading?.[1]) {
      current = heading[1];
      if (!layerNames.includes(current)) layerNames.push(current);
      continue;
    }
    const bullet = /^-\s+(.+?)\s*$/.exec(line);
    if (bullet?.[1] && current) pathToLayer.set(bullet[1], current);
  }
  return { pathToLayer, layerNames };
}

function compareEdges(a: ConstellationEdge, b: ConstellationEdge): number {
  if (a.from !== b.from) return a.from < b.from ? -1 : 1;
  if (a.to !== b.to) return a.to < b.to ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  return 0;
}

/**
 * Assemble the constellation for `root` in memory — the pure node/edge/group
 * emission path, WITHOUT writing `.cortex/constellation.json`. Shared with the
 * insight refresh loop (spec insight.refresh-loop), which reuses this to borrow
 * the exact §4.9 node set (same ids) for its inferred graph — node identity is
 * a join with the constellation, not a re-derivation (§4.10.2). Deterministic
 * modulo the `generated` line (Rule 7); missing surfaces tolerated (Rule 9).
 */
export async function assembleConstellation(root: string): Promise<Constellation> {
  const absRoot = path.resolve(root);

  // schemaVersion from cortex.config.json (Rule 2); tolerant fallback.
  let schemaVersion = '1.0';
  try {
    const config = JSON.parse(
      fs.readFileSync(path.join(absRoot, '.cortex', 'cortex.config.json'), 'utf-8'),
    ) as Record<string, unknown>;
    if (typeof config['schemaVersion'] === 'string' && config['schemaVersion']) {
      schemaVersion = config['schemaVersion'];
    }
  } catch {
    /* missing/unreadable config tolerated */
  }

  const nodes: ConstellationNode[] = [];
  const nodeIds = new Set<string>();
  /** absolute file path → node id, for resolving path-form citations (§6). */
  const pathToNodeId = new Map<string, string>();

  function addNode(node: ConstellationNode, absPath?: string): boolean {
    if (nodeIds.has(node.id)) return false; // ids are globally unique; first wins
    nodeIds.add(node.id);
    nodes.push(node);
    if (absPath) pathToNodeId.set(path.resolve(absPath), node.id);
    return true;
  }

  // -------------------------------------------------------------------------
  // Nodes — anatomy (files.md rows; size = tokens; layer grouping via layers.md)
  // -------------------------------------------------------------------------
  const anatomyRows = readAnatomyRows(absRoot).filter((r) => !isScaffolding(r.relPath));
  const { pathToLayer, layerNames } = readLayers(absRoot);

  let hasUnassigned = false;
  for (const row of anatomyRows) {
    const layer = pathToLayer.get(row.relPath);
    if (!layer) hasUnassigned = true;
    addNode(
      {
        id: `anatomy:${row.relPath}`,
        module: 'anatomy',
        label: path.posix.basename(row.relPath),
        group: `anatomy:layer:${layer ?? UNASSIGNED_LAYER}`,
        ref: row.relPath,
        ...(row.tokens !== undefined ? { size: row.tokens } : {}),
      },
      path.join(absRoot, row.relPath),
    );
  }

  const anatomyChildNames = [...layerNames].sort();
  if (hasUnassigned && !anatomyChildNames.includes(UNASSIGNED_LAYER)) {
    anatomyChildNames.push(UNASSIGNED_LAYER);
    anatomyChildNames.sort();
  }

  // -------------------------------------------------------------------------
  // Nodes — compass (rules, bugs, the five core files)
  // -------------------------------------------------------------------------
  interface RuleArtefact {
    nodeId: string;
    absPath: string;
    data: Record<string, unknown>;
  }
  const ruleArtefacts: RuleArtefact[] = [];
  const rulesDir = path.join(absRoot, '.cortex', 'compass', 'rules');
  const ruleFiles = await fg('R-*.md', { cwd: rulesDir, absolute: true, dot: true });
  for (const file of ruleFiles.sort()) {
    const data = readFrontmatter(file);
    const id = data?.['id'];
    if (!data || typeof id !== 'string' || !id) continue;
    const nodeId = `rule:${id}`;
    const title = typeof data['title'] === 'string' && data['title'] ? data['title'] : id;
    if (addNode({ id: nodeId, module: 'rule', label: title, group: 'compass:rules', ref: id }, file)) {
      ruleArtefacts.push({ nodeId, absPath: file, data });
    }
  }

  const bugsDir = path.join(absRoot, '.cortex', 'compass', 'bugs');
  const bugFiles = await fg('B-*.md', { cwd: bugsDir, absolute: true, dot: true });
  let bugCount = 0;
  for (const file of bugFiles.sort()) {
    const data = readFrontmatter(file);
    const id = data?.['id'];
    if (!data || typeof id !== 'string' || !id) continue;
    const title = typeof data['title'] === 'string' && data['title'] ? data['title'] : id;
    if (addNode({ id: `bug:${id}`, module: 'bug', label: title, group: 'compass:bugs', ref: id }, file)) {
      bugCount++;
    }
  }

  let coreFileCount = 0;
  for (const file of COMPASS_CORE_FILES) {
    const abs = path.join(absRoot, '.cortex', 'compass', file);
    if (!fs.existsSync(abs)) continue; // only those that exist (Rule 3)
    if (
      addNode(
        {
          id: `compass:${file}`,
          module: 'compass',
          label: file,
          group: 'compass:core-files',
          ref: `.cortex/compass/${file}`,
        },
        abs,
      )
    ) {
      coreFileCount++;
    }
  }

  const compassChildren: ConstellationGroupChild[] = [];
  if (bugCount > 0) compassChildren.push({ id: 'compass:bugs', label: 'bugs' });
  if (coreFileCount > 0) compassChildren.push({ id: 'compass:core-files', label: 'core files' });
  if (ruleArtefacts.length > 0) compassChildren.push({ id: 'compass:rules', label: 'rules' });

  // -------------------------------------------------------------------------
  // Nodes — atlas (leaf artefacts with an id; grouped by subfolder)
  // -------------------------------------------------------------------------
  interface AtlasArtefact {
    nodeId: string;
    absPath: string;
    data: Record<string, unknown>;
  }
  const atlasArtefacts: AtlasArtefact[] = [];
  const atlasDir = path.join(absRoot, '.cortex', 'atlas');
  const atlasFiles = await fg('**/*.md', {
    cwd: atlasDir,
    absolute: true,
    dot: true,
    ignore: ['**/_index.md', '**/_overview.md'],
  });
  const atlasSubfolders = new Set<string>();
  for (const file of atlasFiles.sort()) {
    const data = readFrontmatter(file);
    const id = data?.['id'];
    if (!data || typeof id !== 'string' || !id) continue;
    const rel = path.relative(atlasDir, file).replace(/\\/g, '/');
    const subfolder = rel.includes('/') ? (rel.split('/')[0] as string) : '(root)';
    const label =
      (['title', 'name', 'term'] as const)
        .map((k) => data[k])
        .find((v): v is string => typeof v === 'string' && v.length > 0) ?? id;
    const nodeId = `atlas:${id}`;
    if (addNode({ id: nodeId, module: 'atlas', label, group: `atlas:${subfolder}`, ref: id }, file)) {
      atlasArtefacts.push({ nodeId, absPath: file, data });
      atlasSubfolders.add(subfolder);
    }
  }

  // -------------------------------------------------------------------------
  // Nodes — specs (dev + business share the domain child; module distinguishes)
  // -------------------------------------------------------------------------
  interface SpecArtefact {
    nodeId: string;
    absPath: string;
    data: Record<string, unknown>;
  }
  const devSpecs: SpecArtefact[] = [];
  const bizSpecs: SpecArtefact[] = [];
  const specDomains = new Set<string>();

  const devFiles = await fg(SPECS_GLOB, { cwd: absRoot, absolute: true });
  for (const file of devFiles.sort()) {
    const data = readFrontmatter(file);
    const id = data?.['id'];
    if (!data || typeof id !== 'string' || !id) continue;
    const rel = path.relative(specsRoot(absRoot), file).replace(/\\/g, '/');
    const domain = rel.includes('/') ? (rel.split('/')[0] as string) : '(root)';
    const nodeId = `spec:${id}`;
    if (addNode({ id: nodeId, module: 'spec-dev', label: id, group: `specs:${domain}`, ref: id }, file)) {
      devSpecs.push({ nodeId, absPath: file, data });
      specDomains.add(domain);
    }
  }

  const bizFiles = await fg(BUSINESS_GLOB, { cwd: absRoot, absolute: true });
  for (const file of bizFiles.sort()) {
    const data = readFrontmatter(file);
    const id = data?.['id'];
    if (!data || typeof id !== 'string' || !id) continue;
    const rel = path.relative(businessRoot(absRoot), file).replace(/\\/g, '/');
    const domain = rel.includes('/') ? (rel.split('/')[0] as string) : '(root)';
    const nodeId = `business:${id}`;
    if (addNode({ id: nodeId, module: 'spec-business', label: id, group: `specs:${domain}`, ref: id }, file)) {
      bizSpecs.push({ nodeId, absPath: file, data });
      specDomains.add(domain);
    }
  }

  // -------------------------------------------------------------------------
  // Edges — the §6 citation graph only (Rule 5). Dangling refs are dropped
  // and counted (Rule 6); resolved duplicates dedupe silently.
  // -------------------------------------------------------------------------
  const edges: ConstellationEdge[] = [];
  const edgeKeys = new Set<string>();
  let droppedRefs = 0;

  function addEdge(from: string | undefined, to: string | undefined, kind: string): void {
    if (!from || !to || !nodeIds.has(from) || !nodeIds.has(to)) {
      droppedRefs++;
      return;
    }
    const key = `${from} ${to} ${kind}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to, kind });
  }

  /** Resolve a §6 path-form reference (relative to the referring file) to a node id. */
  function resolvePathRef(fromFile: string, ref: string): string | undefined {
    return pathToNodeId.get(path.resolve(path.dirname(fromFile), ref));
  }

  /** A `related_specs` ID targets a dev or a business spec (§6). */
  function specIdToNode(id: string): string | undefined {
    if (nodeIds.has(`spec:${id}`)) return `spec:${id}`;
    if (nodeIds.has(`business:${id}`)) return `business:${id}`;
    return undefined;
  }

  const anatomyRelPaths = anatomyRows.map((r) => r.relPath);

  /** `governs` globs expand to one edge per matched anatomy node (Rule 5); a
   *  0-match glob produces no edge and no droppedRef — it references no target. */
  function addGovernsEdges(fromNode: string, globs: string[]): void {
    for (const glob of globs) {
      let matcher: (p: string) => boolean;
      try {
        matcher = picomatch(glob);
      } catch {
        continue; // malformed glob: check.rule/check.dev-spec owns flagging it
      }
      for (const relPath of anatomyRelPaths) {
        if (matcher(relPath)) addEdge(fromNode, `anatomy:${relPath}`, 'governs');
      }
    }
  }

  // anatomy rows: spec_links cells → file → dev-spec edges.
  for (const row of anatomyRows) {
    for (const id of row.specLinks) {
      addEdge(`anatomy:${row.relPath}`, `spec:${id}`, 'spec_links');
    }
  }

  // dev specs: implements (path), depends_on (ids), governed_by (ids), governs (globs).
  for (const spec of devSpecs) {
    for (const ref of toStringList(spec.data['implements'])) {
      addEdge(spec.nodeId, resolvePathRef(spec.absPath, ref), 'implements');
    }
    for (const id of toStringList(spec.data['depends_on'])) {
      addEdge(spec.nodeId, `spec:${id}`, 'depends_on');
    }
    for (const id of toStringList(spec.data['governed_by'])) {
      addEdge(spec.nodeId, `rule:${id}`, 'governed_by');
    }
    addGovernsEdges(spec.nodeId, toStringList(spec.data['governs']));
  }

  // business specs: implemented_by dedupes into the symmetric dev→business
  // `implements` edge (Rule 5); depends_on (ids).
  for (const spec of bizSpecs) {
    for (const ref of toStringList(spec.data['implemented_by'])) {
      addEdge(resolvePathRef(spec.absPath, ref), spec.nodeId, 'implements');
    }
    for (const id of toStringList(spec.data['depends_on'])) {
      addEdge(spec.nodeId, `business:${id}`, 'depends_on');
    }
  }

  // rules: source (paths → atlas decisions / bugs), governs (globs), related_specs (ids).
  for (const rule of ruleArtefacts) {
    for (const ref of toStringList(rule.data['source'])) {
      addEdge(rule.nodeId, resolvePathRef(rule.absPath, ref), 'source');
    }
    addGovernsEdges(rule.nodeId, toStringList(rule.data['governs']));
    for (const id of toStringList(rule.data['related_specs'])) {
      addEdge(rule.nodeId, specIdToNode(id), 'related_specs');
    }
  }

  // atlas artefacts: compass_rules (ids), supersedes (paths), sources (paths),
  // related_specs (ids).
  for (const artefact of atlasArtefacts) {
    for (const id of toStringList(artefact.data['compass_rules'])) {
      addEdge(artefact.nodeId, `rule:${id}`, 'compass_rules');
    }
    for (const ref of toStringList(artefact.data['supersedes'])) {
      addEdge(artefact.nodeId, resolvePathRef(artefact.absPath, ref), 'supersedes');
    }
    for (const ref of toStringList(artefact.data['sources'])) {
      addEdge(artefact.nodeId, resolvePathRef(artefact.absPath, ref), 'sources');
    }
    for (const id of toStringList(artefact.data['related_specs'])) {
      addEdge(artefact.nodeId, specIdToNode(id), 'related_specs');
    }
  }

  // scenario specs: covers (ids → business specs); the `from` endpoint is the
  // scenario file's own anatomy node (scenario specs are not a node kind, §4.9).
  const scenarioFiles = await fg('tests/scenario/specs/*.md', { cwd: absRoot, absolute: true });
  for (const file of scenarioFiles.sort()) {
    const data = readFrontmatter(file);
    if (!data) continue;
    const rel = path.relative(absRoot, file).replace(/\\/g, '/');
    for (const id of toStringList(data['covers'])) {
      addEdge(`anatomy:${rel}`, `business:${id}`, 'covers');
    }
  }

  // -------------------------------------------------------------------------
  // Assemble deterministically (Rule 7): four top groups, sorted children,
  // sorted nodes, sorted edges.
  // -------------------------------------------------------------------------
  const groups: ConstellationGroup[] = [
    {
      id: 'anatomy',
      label: 'Anatomy',
      children: anatomyChildNames.map((l) => ({ id: `anatomy:layer:${l}`, label: l })),
    },
    {
      id: 'atlas',
      label: 'Atlas',
      children: [...atlasSubfolders].sort().map((s) => ({ id: `atlas:${s}`, label: s })),
    },
    {
      id: 'compass',
      label: 'Compass',
      children: compassChildren.sort((a, b) => (a.id < b.id ? -1 : 1)),
    },
    {
      id: 'specs',
      label: 'Specs',
      children: [...specDomains].sort().map((d) => ({ id: `specs:${d}`, label: d })),
    },
  ];

  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  edges.sort(compareEdges);

  const counters = {
    anatomy: nodes.filter((n) => n.module === 'anatomy').length,
    compass: nodes.filter((n) => n.module === 'rule' || n.module === 'bug' || n.module === 'compass').length,
    atlas: nodes.filter((n) => n.module === 'atlas').length,
    specs: nodes.filter((n) => n.module === 'spec-dev' || n.module === 'spec-business').length,
    edges: edges.length,
    droppedRefs,
  };

  const constellation: Constellation = {
    schemaVersion,
    generated: new Date().toISOString(),
    groups,
    nodes,
    edges,
    counters,
  };

  return constellation;
}

/**
 * Compile the constellation for `root` and write `.cortex/constellation.json`.
 * The public entry (invoked by `cortex scan` after anatomy emission); the
 * assembly is delegated to `assembleConstellation` so consumers that only need
 * the node set (insight refresh) can borrow it without the side-effect write.
 */
export async function compile(root: string): Promise<Constellation> {
  const absRoot = path.resolve(root);
  const constellation = await assembleConstellation(absRoot);

  // WRITES `.cortex/constellation.json` — nothing else, ever.
  const cortexDir = path.join(absRoot, '.cortex');
  fs.mkdirSync(cortexDir, { recursive: true });
  fs.writeFileSync(
    path.join(cortexDir, 'constellation.json'),
    JSON.stringify(constellation, null, 2) + '\n',
    'utf-8',
  );

  return constellation;
}
