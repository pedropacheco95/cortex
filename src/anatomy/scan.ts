import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import picomatch from 'picomatch';
import { extract } from './parse.js';
import { validate } from '../schema/validate.js';
import {
  sanitizeCell,
  computeSha256,
  computeTokens,
  splitDataRowCells,
  emitFilesMdRow,
  FILES_MD_TABLE_HEADER,
  FILES_MD_TABLE_SEP,
  PLACEHOLDER_PURPOSE,
  NO_PURPOSE_SOURCE,
  PURPOSE_SOURCE_DOCSTRING,
  PURPOSE_SOURCE_SCANNER_LLM,
  purposeSourceCell,
} from './files-md.js';
import { hasExcludedSegment, buildIgnoreFilter } from './exclude.js';
import { compile } from '../constellation/compile.js';
import type { ScannedFile, ScanResult, ScanOptions } from './types.js';

interface CachedEntry {
  purpose: string;
  lastSeen: string;
  sha256: string;
  needsPurposeRefresh: boolean;
  /** `purpose_source` cell; `-` for legacy 7-column (pre-provenance) rows. */
  purposeSource: string;
}

function computeLayer(relPath: string): string {
  const segments = relPath.split('/');
  if (segments[0] === 'src' && segments.length > 2) {
    return `src/${segments[1] ?? ''}`;
  } else if (segments.length > 1) {
    return segments[0] ?? '(root)';
  }
  return '(root)';
}

function parseCachedFiles(filesContent: string): Map<string, CachedEntry> {
  const cache = new Map<string, CachedEntry>();
  let parsedContent: string;
  try {
    const parsed = matter(filesContent);
    parsedContent = parsed.content;
  } catch {
    return cache;
  }

  const lines = parsedContent.split('\n');
  for (const line of lines) {
    const cols = splitDataRowCells(line);
    if (cols === null || cols.length < 7) continue;

    const pathCell = cols[0] ?? '';
    if (!pathCell) continue;

    const purpose = cols[1] ?? '';
    const sha256 = cols[3] ?? '';
    const lastSeen = cols[4] ?? '';
    const needsPurposeRefresh = (cols[6] ?? '') === 'true';
    const purposeSource = purposeSourceCell(cols);

    cache.set(pathCell, { purpose, lastSeen, sha256, needsPurposeRefresh, purposeSource });
  }

  return cache;
}

/**
 * Resolve a relative import spec to a project-relative file path (shared with
 * anatomy.refresh-fast's edge replacement — the ONE resolution contract).
 */
export function resolveImport(root: string, fromRel: string, importSpec: string): string | null {
  if (!importSpec.startsWith('./') && !importSpec.startsWith('../')) return null;

  const fromAbs = path.resolve(root, fromRel);
  const fromDir = path.dirname(fromAbs);
  const base = path.resolve(fromDir, importSpec);

  const suffixes = [
    '', '.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs', '.py', '.rs', '.go',
  ];

  for (const suffix of suffixes) {
    const candidate = base + suffix;
    try {
      if (fs.statSync(candidate).isFile()) {
        return path.relative(root, candidate).replace(/\\/g, '/');
      }
    } catch { /* not found */ }

    const indexCandidate = path.join(base, 'index' + suffix);
    try {
      if (fs.statSync(indexCandidate).isFile()) {
        return path.relative(root, indexCandidate).replace(/\\/g, '/');
      }
    } catch { /* not found */ }
  }

  return null;
}

async function computeAllSpecLinks(
  root: string,
  relPaths: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>(relPaths.map(p => [p, []]));

  const specsIndexPath = path.join(root, 'specs', '_index.md');
  if (!fs.existsSync(specsIndexPath)) return result;

  let specFiles: string[];
  try {
    specFiles = await fg(['specs/**/*.spec.md'], { cwd: root, dot: false });
  } catch {
    return result;
  }

  for (const specFile of specFiles) {
    const absSpecFile = path.join(root, specFile);
    let content: string;
    try {
      content = fs.readFileSync(absSpecFile, 'utf-8');
    } catch {
      continue;
    }

    let data: Record<string, unknown>;
    try {
      data = matter(content).data as Record<string, unknown>;
    } catch {
      continue;
    }

    const id = data['id'];
    if (typeof id !== 'string') continue;

    const governs = data['governs'];
    let governsArr: string[];
    if (Array.isArray(governs)) {
      governsArr = governs.filter((g): g is string => typeof g === 'string');
    } else if (typeof governs === 'string') {
      governsArr = [governs];
    } else {
      continue;
    }

    for (const glob of governsArr) {
      const matcher = picomatch(glob);
      for (const relPath of relPaths) {
        if (matcher(relPath)) {
          const current = result.get(relPath);
          if (current && !current.includes(id)) {
            current.push(id);
          }
        }
      }
    }
  }

  // Sort each entry
  for (const [key, val] of result.entries()) {
    result.set(key, [...val].sort());
  }

  return result;
}

export async function scan(root: string, opts?: ScanOptions): Promise<ScanResult> {
  const absRoot = path.resolve(root);
  const full = opts?.full ?? false;
  // NEVER call opts.forbiddenLLMHook — it is forbidden

  // 1. Listing: fg with dot:false, hard-exclude .cortex/.git/node_modules
  const allPaths = await fg(['**/*'], {
    cwd: absRoot,
    dot: false,
    onlyFiles: true,
  });

  const hardFiltered = allPaths.filter(p => !hasExcludedSegment(p));

  // Build ignore filter from .gitignore + config exclude (shared with hooks.post-write).
  const ig = buildIgnoreFilter(absRoot);

  const filteredPaths = hardFiltered.filter(p => !ig.ignores(p));
  const sortedPaths = [...filteredPaths].sort();

  // 2. Read cache if not full scan
  let cache = new Map<string, CachedEntry>();
  if (!full) {
    const filesPath = path.join(absRoot, '.cortex', 'anatomy', 'files.md');
    if (fs.existsSync(filesPath)) {
      try {
        const filesContent = fs.readFileSync(filesPath, 'utf-8');
        cache = parseCachedFiles(filesContent);
      } catch { /* ignore */ }
    }
  }

  const nowIso = new Date().toISOString();

  // 3. Compute spec cross-links
  const specLinksMap = await computeAllSpecLinks(absRoot, sortedPaths);

  // 4. Process each file
  const scannedFiles: ScannedFile[] = [];

  for (const relPath of sortedPaths) {
    const absPath = path.join(absRoot, relPath);
    let content: string;
    try {
      content = fs.readFileSync(absPath, 'utf-8');
    } catch {
      continue;
    }

    const sha256 = computeSha256(content);
    const tokens = computeTokens(content);
    const ext = path.extname(relPath).toLowerCase();
    const layer = computeLayer(relPath);
    const specLinks = specLinksMap.get(relPath) ?? [];

    // Extract (always needed for imports/definitions for graph)
    const extracted = await extract(ext, content);
    const definitions = extracted.definitions;
    const imports = extracted.imports;

    let purpose: string;
    let needsPurposeRefresh: boolean;
    let lastSeen: string;
    let purposeSource: string;

    const cached = cache.get(relPath);
    if (!full && cached && cached.sha256 === sha256) {
      // Cache hit: retain cached purpose/lastSeen/needsPurposeRefresh/purpose_source
      purpose = cached.purpose;
      needsPurposeRefresh = cached.needsPurposeRefresh;
      lastSeen = cached.lastSeen;
      purposeSource = cached.purposeSource;
      // §4.1 migration clause: a cached row carrying a real purpose but no
      // provenance (`-`/absent) is backfilled `scanner-llm` on scan — the
      // accurate default for anything produced before provenance tracking.
      if (purposeSource === NO_PURPOSE_SOURCE && purpose !== '' && purpose !== PLACEHOLDER_PURPOSE) {
        purposeSource = PURPOSE_SOURCE_SCANNER_LLM;
      }
    } else {
      // Cache miss or full scan: derive purpose from extraction
      lastSeen = nowIso;
      if (extracted.purpose !== null) {
        const raw = extracted.purpose.length > 120
          ? extracted.purpose.slice(0, 120)
          : extracted.purpose;
        purpose = sanitizeCell(raw);
        needsPurposeRefresh = false;
        purposeSource = PURPOSE_SOURCE_DOCSTRING;
      } else {
        purpose = PLACEHOLDER_PURPOSE;
        needsPurposeRefresh = true;
        purposeSource = NO_PURPOSE_SOURCE;
      }
    }

    scannedFiles.push({
      path: relPath,
      tokens,
      sha256,
      purpose,
      needsPurposeRefresh,
      specLinks,
      definitions,
      imports,
      layer,
      lastSeen,
      purposeSource,
    });
  }

  // 5. Build graph
  const nodes = sortedPaths;
  const edgeSet = new Set<string>();
  const edges: { from: string; to: string; kind: 'import' | 'export' }[] = [];

  for (const file of scannedFiles) {
    for (const imp of file.imports) {
      if (imp.startsWith('./') || imp.startsWith('../')) {
        const resolved = resolveImport(absRoot, file.path, imp);
        if (resolved) {
          const key = `${file.path}\u0000${resolved}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ from: file.path, to: resolved, kind: 'import' });
          }
        }
      }
    }
  }

  edges.sort((a, b) => {
    if (a.from < b.from) return -1;
    if (a.from > b.from) return 1;
    if (a.to < b.to) return -1;
    if (a.to > b.to) return 1;
    return 0;
  });

  // 6. Build layers
  const layersMap = new Map<string, string[]>();
  for (const file of scannedFiles) {
    const arr = layersMap.get(file.layer);
    if (arr) {
      arr.push(file.path);
    } else {
      layersMap.set(file.layer, [file.path]);
    }
  }
  const layers: Record<string, string[]> = {};
  const sortedLayerKeys = [...layersMap.keys()].sort();
  for (const key of sortedLayerKeys) {
    const val = layersMap.get(key);
    if (val) {
      layers[key] = val.sort();
    }
  }

  // 7. Emit to .cortex/anatomy/
  const anatomyDir = path.join(absRoot, '.cortex', 'anatomy');
  fs.mkdirSync(anatomyDir, { recursive: true });

  // Emit files.md
  const filesMdFrontmatter = `---\nkind: anatomy-files\nlast_full_scan: ${nowIso}\nfile_count: ${scannedFiles.length}\n---\n\n`;
  const rows = scannedFiles.map(f =>
    emitFilesMdRow({
      path: sanitizeCell(f.path),
      purpose: sanitizeCell(f.purpose),
      tokens: f.tokens,
      sha256: f.sha256,
      lastSeen: sanitizeCell(f.lastSeen),
      specLinksCell: f.specLinks.length > 0 ? sanitizeCell(f.specLinks.join(' ')) : '-',
      needsPurposeRefresh: f.needsPurposeRefresh,
      purposeSource: sanitizeCell(f.purposeSource) || NO_PURPOSE_SOURCE,
    }),
  );

  const filesMdContent =
    filesMdFrontmatter + [FILES_MD_TABLE_HEADER, FILES_MD_TABLE_SEP, ...rows].join('\n') + '\n';
  fs.writeFileSync(path.join(anatomyDir, 'files.md'), filesMdContent, 'utf-8');

  // Emit graph.json
  fs.writeFileSync(
    path.join(anatomyDir, 'graph.json'),
    JSON.stringify({ nodes, edges }, null, 2),
    'utf-8',
  );

  // Emit layers.md
  const layersSections = Object.entries(layers).map(([layer, layerFiles]) => {
    return `## ${layer}\n\n${layerFiles.map(f => `- ${f}`).join('\n')}`;
  });
  const layersMdContent = (layersSections.join('\n\n') || '(no files)') + '\n';
  fs.writeFileSync(path.join(anatomyDir, 'layers.md'), layersMdContent, 'utf-8');

  // 8. Constellation refresh (constellation.compiler Rule 9): compile the
  // citation graph after anatomy emission, so it refreshes whenever anatomy
  // does. Missing surfaces compile to empty groups, never errors.
  await compile(absRoot);

  // 9. Self-validate: check anatomy errors only
  const report = await validate(absRoot, { root: absRoot });
  const anatomyErrors = report.violations.filter(
    v => v.severity === 'error' && v.check.startsWith('check.anatomy'),
  );
  if (anatomyErrors.length > 0) {
    const msgs = anatomyErrors.map(v => `${v.check}: ${v.message}`).join('\n');
    throw new Error(`Anatomy self-validation failed:\n${msgs}`);
  }

  return {
    root: absRoot,
    files: scannedFiles,
    graph: { nodes, edges },
    layers,
    full,
  };
}
