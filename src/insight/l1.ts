/**
 * insight.l1-structural — the deterministic Level-1 structural pass
 * (build-order-v3 step 5a; design §5.2 Level 1, §5.11 Failure-modes TAKEs).
 *
 * Walks the repo (skip-lists + sensitive patterns + .gitignore/config
 * excludes), tree-sitter-parses source files (RULES 18 — the l1-parse
 * module), and produces the import/export graph, file sizes, entry points,
 * module structure, and a degree-centrality ranking with mechanical hubs
 * excluded. No LLM (RULES 3), no timestamps/randomness — output is
 * byte-identical across runs on unchanged input. Persistence is NOT done
 * here: storage belongs to insight.storage-format (5b); callers get the
 * in-memory structure plus `serializeL1` for a stable JSON string.
 */
import * as fs from 'fs';
import * as path from 'path';
import { extract, resolveImport } from './l1-parse.js';
import { hasExcludedSegment, buildIgnoreFilter } from './exclude.js';
import {
  L1_SKIP_DIRS,
  L1_SENSITIVE_DIRS,
  L1_DEFAULT_MAX_FILE_BYTES,
  L1_BINARY_EXTENSIONS,
  isSkipListedFile,
  isSensitiveFile,
  looksBinary,
  languageForExt,
  isMechanicalHubName,
  isBarrelFile,
  type L1SkipReason,
} from './l1-triage.js';

export const L1_VERSION = 1;

export interface L1Options {
  /** Oversized threshold in bytes (default {@link L1_DEFAULT_MAX_FILE_BYTES}). */
  maxFileBytes?: number;
}

export interface L1File {
  /** Repo-relative path, forward slashes. */
  path: string;
  language: string;
  bytes: number;
  lines: number;
  entryPoint: boolean;
  /** Excluded from the centrality ranking (index/barrel/doc hubs). */
  mechanicalHub: boolean;
  /** Exported / top-level definitions (tree-sitter), sorted unique. */
  exports: string[];
  /** Raw import specs / statements (tree-sitter), sorted unique. */
  imports: string[];
  /** Relative imports resolved to repo-relative paths of included files, sorted unique. */
  resolvedImports: string[];
}

export interface L1Edge {
  /** Importer (repo-relative path). */
  from: string;
  /** Imported (repo-relative path). */
  to: string;
}

export interface L1Module {
  /** Repo-relative directory ('.' for the root). */
  dir: string;
  fileCount: number;
  totalBytes: number;
  files: string[];
}

export interface L1CentralityEntry {
  path: string;
  inDegree: number;
  outDegree: number;
  degree: number;
}

export interface L1Skipped {
  /** Repo-relative path; pruned directories carry a trailing '/'. */
  path: string;
  reason: L1SkipReason;
}

export interface L1Output {
  /** Absolute project root (in-memory only — omitted from serialization). */
  root: string;
  files: L1File[];
  graph: { edges: L1Edge[] };
  modules: L1Module[];
  /** Degree ranking over included non-hub files with degree > 0. */
  centrality: L1CentralityEntry[];
  skipped: L1Skipped[];
}

/** Codepoint (locale-independent) comparator — the determinism total order. */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort(cmp);
}

interface WalkResult {
  included: string[]; // repo-relative file paths, sorted
  skipped: L1Skipped[];
}

interface IgnoreLike {
  ignores(p: string): boolean;
}

function walk(absRoot: string, ig: IgnoreLike, maxFileBytes: number): WalkResult {
  const included: string[] = [];
  const skipped: L1Skipped[] = [];

  const visit = (dirAbs: string, relPrefix: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => cmp(a.name, b.name));

    for (const entry of entries) {
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue; // never followed — determinism + cycle safety

      if (entry.isDirectory()) {
        if (L1_SKIP_DIRS.has(entry.name)) {
          skipped.push({ path: `${rel}/`, reason: 'skip-list' });
        } else if (L1_SENSITIVE_DIRS.has(entry.name)) {
          skipped.push({ path: `${rel}/`, reason: 'sensitive' });
        } else if (ig.ignores(`${rel}/`)) {
          skipped.push({ path: `${rel}/`, reason: 'ignored' });
        } else {
          visit(path.join(dirAbs, entry.name), rel);
        }
        continue;
      }
      if (!entry.isFile()) continue;

      if (hasExcludedSegment(rel) || isSkipListedFile(entry.name)) {
        skipped.push({ path: rel, reason: 'skip-list' });
      } else if (isSensitiveFile(entry.name)) {
        skipped.push({ path: rel, reason: 'sensitive' });
      } else if (ig.ignores(rel)) {
        skipped.push({ path: rel, reason: 'ignored' });
      } else if (L1_BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        skipped.push({ path: rel, reason: 'binary' });
      } else {
        let size: number;
        try {
          size = fs.statSync(path.join(dirAbs, entry.name)).size;
        } catch {
          continue;
        }
        if (size > maxFileBytes) {
          skipped.push({ path: rel, reason: 'oversized' });
        } else {
          included.push(rel);
        }
      }
    }
  };

  visit(absRoot, '');
  included.sort(cmp);
  skipped.sort((a, b) => cmp(a.path, b.path));
  return { included, skipped };
}

const ENTRY_PATH_RE = /^(?:src\/)?(?:index|main|cli|app|server)\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const ENTRY_BASENAMES = new Set(['main.py', '__main__.py', 'manage.py', 'main.go', 'main.rs']);

/**
 * Entry-point candidates from package.json `main`/`module`/`bin`, with
 * dist→src and .js→.ts variants so compiled entry values map back to source.
 */
function packageEntryCandidates(absRoot: string): Set<string> {
  const candidates = new Set<string>();
  const pkgPath = path.join(absRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return candidates;

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return candidates;
  }

  const values: string[] = [];
  for (const field of ['main', 'module']) {
    const v = pkg[field];
    if (typeof v === 'string') values.push(v);
  }
  const bin = pkg['bin'];
  if (typeof bin === 'string') {
    values.push(bin);
  } else if (bin && typeof bin === 'object') {
    for (const v of Object.values(bin as Record<string, unknown>)) {
      if (typeof v === 'string') values.push(v);
    }
  }

  const extVariants: Array<[RegExp, string]> = [
    [/\.js$/, '.ts'],
    [/\.mjs$/, '.mts'],
    [/\.cjs$/, '.cts'],
    [/\.jsx$/, '.tsx'],
  ];
  for (const raw of values) {
    const norm = raw.replace(/^\.\//, '').replace(/\\/g, '/');
    const bases = [norm];
    if (norm.startsWith('dist/')) bases.push('src/' + norm.slice('dist/'.length));
    for (const base of bases) {
      candidates.add(base);
      for (const [re, repl] of extVariants) {
        if (re.test(base)) candidates.add(base.replace(re, repl));
      }
    }
  }
  return candidates;
}

const REEXPORT_SPEC_RE =
  /(?:^|\n)\s*export\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[\s\S]*?\})\s*from\s*['"]([^'"]+)['"]/g;

/**
 * Re-export source specs (`export ... from 'x'`) — dependencies the anatomy
 * extractor does not surface (it only reads `import_statement`s), needed so
 * barrels have out-edges in the import/export graph.
 */
function reexportSpecs(content: string, language: string): string[] {
  if (language !== 'typescript' && language !== 'javascript') return [];
  const specs: string[] = [];
  for (const match of content.matchAll(REEXPORT_SPEC_RE)) {
    const spec = match[1];
    if (spec) specs.push(spec);
  }
  return specs;
}

const EXPORT_NAME_RE =
  /(?:^|\n)\s*export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|type|interface|enum|namespace)\s+([\w$]+)/g;

/**
 * Exported names the anatomy extractor misses (`export const x = …` — its
 * tree-sitter walk reads a `name` field that lexical declarations don't
 * have). Deterministic regex supplement for JS/TS only.
 */
function exportedNames(content: string, language: string): string[] {
  if (language !== 'typescript' && language !== 'javascript') return [];
  const names: string[] = [];
  for (const match of content.matchAll(EXPORT_NAME_RE)) {
    const name = match[1];
    if (name) names.push(name);
  }
  return names;
}

const NODENEXT_VARIANTS: Array<[RegExp, string]> = [
  [/\.js$/, '.ts'],
  [/\.mjs$/, '.mts'],
  [/\.cjs$/, '.cts'],
  [/\.jsx$/, '.tsx'],
];

/**
 * Resolve a relative import spec, delegating to anatomy's `resolveImport`
 * (the ONE resolution contract) and adding the NodeNext case it misses:
 * `./x.js` written in TS source that actually lives at `./x.ts` (anatomy's
 * resolver returns null there — its graph has zero edges on NodeNext repos).
 */
function resolveImportSpec(
  absRoot: string,
  fromRel: string,
  spec: string,
): string | null {
  const direct = resolveImport(absRoot, fromRel, spec);
  if (direct) return direct;
  for (const [re, repl] of NODENEXT_VARIANTS) {
    if (re.test(spec)) {
      const variant = resolveImport(absRoot, fromRel, spec.replace(re, repl));
      if (variant) return variant;
    }
  }
  return null;
}

function isEntryPoint(relPath: string, pkgEntries: Set<string>): boolean {
  if (pkgEntries.has(relPath)) return true;
  if (ENTRY_PATH_RE.test(relPath)) return true;
  const basename = relPath.split('/').pop() ?? relPath;
  return ENTRY_BASENAMES.has(basename);
}

/**
 * Run the deterministic L1 structural pass over a project root.
 *
 * Exclusion scope reuses the anatomy machinery (`buildIgnoreFilter`:
 * .gitignore + cortex.config.json `anatomy.exclude`) plus the study
 * skip-lists/sensitive patterns from l1-triage. Does not write anything —
 * storage is the 5b contract.
 */
export async function runL1(projectRoot: string, opts?: L1Options): Promise<L1Output> {
  const absRoot = path.resolve(projectRoot);
  const maxFileBytes = opts?.maxFileBytes ?? L1_DEFAULT_MAX_FILE_BYTES;

  const ig = buildIgnoreFilter(absRoot);
  const { included, skipped } = walk(absRoot, ig, maxFileBytes);
  const pkgEntries = packageEntryCandidates(absRoot);

  // Per-file parse (tree-sitter via anatomy's extract; binary NUL check here
  // because the walker only sees names/sizes, not content).
  const files: L1File[] = [];
  const rawImportsByFile = new Map<string, string[]>();

  for (const rel of included) {
    let buf: Buffer;
    try {
      buf = fs.readFileSync(path.join(absRoot, rel));
    } catch {
      continue;
    }
    if (looksBinary(buf)) {
      skipped.push({ path: rel, reason: 'binary' });
      continue;
    }
    const content = buf.toString('utf-8');
    const ext = path.extname(rel).toLowerCase();
    const language = languageForExt(ext);
    const extracted = await extract(ext, content);
    const allImports = [...extracted.imports, ...reexportSpecs(content, language)];

    rawImportsByFile.set(rel, allImports);
    files.push({
      path: rel,
      language,
      bytes: buf.length,
      lines: content.split('\n').length,
      entryPoint: isEntryPoint(rel, pkgEntries),
      mechanicalHub: isMechanicalHubName(rel) || isBarrelFile(content, language),
      exports: sortedUnique([
        ...extracted.definitions,
        ...exportedNames(content, language),
      ]),
      imports: sortedUnique(allImports),
      resolvedImports: [], // filled after the included set is final
    });
  }

  skipped.sort((a, b) => cmp(a.path, b.path));
  const includedSet = new Set(files.map((f) => f.path));

  // Import/export graph: relative specs resolved via anatomy's ONE resolution
  // contract; edges kept only between included files.
  const edgeKeys = new Set<string>();
  const edges: L1Edge[] = [];
  for (const file of files) {
    const resolved: string[] = [];
    for (const spec of rawImportsByFile.get(file.path) ?? []) {
      if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
      const target = resolveImportSpec(absRoot, file.path, spec);
      if (!target || !includedSet.has(target) || target === file.path) continue;
      resolved.push(target);
      const key = `${file.path} ${target}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({ from: file.path, to: target });
      }
    }
    file.resolvedImports = sortedUnique(resolved);
  }
  edges.sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to));

  // Module structure: directory-level grouping.
  const moduleMap = new Map<string, { files: string[]; totalBytes: number }>();
  for (const file of files) {
    const dir = file.path.includes('/')
      ? file.path.slice(0, file.path.lastIndexOf('/'))
      : '.';
    const mod = moduleMap.get(dir) ?? { files: [], totalBytes: 0 };
    mod.files.push(file.path);
    mod.totalBytes += file.bytes;
    moduleMap.set(dir, mod);
  }
  const modules: L1Module[] = [...moduleMap.entries()]
    .sort((a, b) => cmp(a[0], b[0]))
    .map(([dir, m]) => ({
      dir,
      fileCount: m.files.length,
      totalBytes: m.totalBytes,
      files: m.files.sort(cmp),
    }));

  // Degree centrality — mechanical hubs excluded from the *ranking* (study:
  // raw degree over-ranks index.ts/CLAUDE.md-style hubs) but hub edges still
  // count toward their neighbours' degrees, and hubs stay in `files`.
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const edge of edges) {
    outDeg.set(edge.from, (outDeg.get(edge.from) ?? 0) + 1);
    inDeg.set(edge.to, (inDeg.get(edge.to) ?? 0) + 1);
  }
  const centrality: L1CentralityEntry[] = files
    .filter((f) => !f.mechanicalHub)
    .map((f) => ({
      path: f.path,
      inDegree: inDeg.get(f.path) ?? 0,
      outDegree: outDeg.get(f.path) ?? 0,
      degree: (inDeg.get(f.path) ?? 0) + (outDeg.get(f.path) ?? 0),
    }))
    .filter((c) => c.degree > 0)
    .sort(
      (a, b) =>
        b.degree - a.degree || b.inDegree - a.inDegree || cmp(a.path, b.path),
    );

  return { root: absRoot, files, graph: { edges }, modules, centrality, skipped };
}

/**
 * Serialize an L1Output to a stable JSON string: fixed key order, all arrays
 * total-ordered by `runL1`, no timestamps, trailing newline. The absolute
 * `root` is deliberately omitted so the serialized form is machine-portable.
 */
export function serializeL1(output: L1Output): string {
  const doc = {
    l1Version: L1_VERSION,
    fileCount: output.files.length,
    edgeCount: output.graph.edges.length,
    files: output.files.map((f) => ({
      path: f.path,
      language: f.language,
      bytes: f.bytes,
      lines: f.lines,
      entryPoint: f.entryPoint,
      mechanicalHub: f.mechanicalHub,
      exports: f.exports,
      imports: f.imports,
      resolvedImports: f.resolvedImports,
    })),
    graph: {
      edges: output.graph.edges.map((e) => ({ from: e.from, to: e.to })),
    },
    modules: output.modules.map((m) => ({
      dir: m.dir,
      fileCount: m.fileCount,
      totalBytes: m.totalBytes,
      files: m.files,
    })),
    centrality: output.centrality.map((c) => ({
      path: c.path,
      inDegree: c.inDegree,
      outDegree: c.outDegree,
      degree: c.degree,
    })),
    skipped: output.skipped.map((s) => ({ path: s.path, reason: s.reason })),
  };
  return JSON.stringify(doc, null, 2) + '\n';
}
