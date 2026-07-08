/**
 * L1 pre-triage for insight.l1-structural (build-order-v3 step 5a).
 *
 * Deterministic skip-lists, sensitive-file patterns, binary/oversized
 * detection, and mechanical-hub classification — adopted from the Graphify
 * extraction study's Axis-4 TAKE verdicts (skip `node_modules`/build
 * dirs/lockfiles; sensitive patterns; "exclude mechanical hubs from
 * centrality" because raw degree over-ranks index.ts/CLAUDE.md-style glue).
 * Pure functions + constant tables; no LLM, no I/O (RULES 3: Core is
 * deterministic).
 */

/** Directory names never traversed (study `_SKIP_DIRS`, near-verbatim). */
export const L1_SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.cortex', // never index our own output
  '__pycache__',
  'dist',
  'build',
  'target',
  'out',
  'site-packages',
  '.next',
  '.nuxt',
  '.turbo',
  '.angular',
  '.cache',
  '.parcel-cache',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.tox',
  '.venv',
  'venv',
  '.idea',
  '.vs',
  'coverage',
  '.nyc_output',
  '__snapshots__',
  'storybook-static',
  '.gradle',
  '.terraform',
  'vendor',
  'bower_components',
  '.yarn',
  '.pnpm-store',
  '.svn',
  '.hg',
]);

/** Sensitive directory names — pruned with reason `sensitive`. */
export const L1_SENSITIVE_DIRS: ReadonlySet<string> = new Set([
  '.ssh',
  '.aws',
  '.gnupg',
]);

/** Exact file names on the skip-list (lockfiles — study `_SKIP_FILES`). */
export const L1_SKIP_FILES: ReadonlySet<string> = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'Cargo.lock',
  'go.sum',
  'go.work.sum',
  'poetry.lock',
  'Pipfile.lock',
  'uv.lock',
  'composer.lock',
  'Gemfile.lock',
  'mix.lock',
  'packages.lock.json',
  'gradle.lockfile',
  'flake.lock',
  'pubspec.lock',
  '.DS_Store',
]);

/** Suffixes on the skip-list (minified bundles, source maps). */
export const L1_SKIP_FILE_SUFFIXES: readonly string[] = [
  '.min.js',
  '.min.css',
  '.min.mjs',
  '.map',
];

/** True when a file basename is on the deterministic skip-list. */
export function isSkipListedFile(basename: string): boolean {
  if (L1_SKIP_FILES.has(basename)) return true;
  return L1_SKIP_FILE_SUFFIXES.some((s) => basename.endsWith(s));
}

const SENSITIVE_EXACT = new Set([
  '.netrc',
  '.npmrc',
  '.pgpass',
  '.htpasswd',
  'aws_credentials',
]);

const SENSITIVE_SUFFIXES = [
  '.pem',
  '.key',
  '.p12',
  '.pfx',
  '.jks',
  '.keystore',
];

const SENSITIVE_SUBSTRINGS = [
  'credential',
  'secret',
  'apikey',
  'api_key',
  'api-key',
  'service-account',
];

/**
 * True when a file basename matches a sensitive pattern (study
 * `_SENSITIVE_PATTERNS`, slightly narrowed: the study's `*token*` glob is
 * dropped because it over-matches legitimate source such as `tokenizer.ts`).
 */
export function isSensitiveFile(basename: string): boolean {
  const lower = basename.toLowerCase();
  if (lower === '.env' || lower.startsWith('.env.')) return true;
  if (SENSITIVE_EXACT.has(lower)) return true;
  if (lower.startsWith('id_rsa') || lower.startsWith('id_dsa')) return true;
  if (lower.startsWith('id_ecdsa') || lower.startsWith('id_ed25519')) return true;
  if (SENSITIVE_SUFFIXES.some((s) => lower.endsWith(s))) return true;
  return SENSITIVE_SUBSTRINGS.some((s) => lower.includes(s));
}

/** Extensions treated as binary without reading content. */
export const L1_BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff', '.heic',
  '.pdf', '.zip', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar',
  '.jar', '.war', '.class', '.exe', '.dll', '.so', '.dylib', '.a', '.o',
  '.wasm', '.node', '.pyc',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flac', '.ogg', '.wav',
  '.sqlite', '.db', '.bin', '.dat',
]);

/** True when the first 8 KiB contain a NUL byte (content-level binary check). */
export function looksBinary(buf: Buffer): boolean {
  const limit = Math.min(buf.length, 8192);
  for (let i = 0; i < limit; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/** Default oversized threshold: 1 MB. Overridable via `L1Options.maxFileBytes`. */
export const L1_DEFAULT_MAX_FILE_BYTES = 1_000_000;

/** Why a path was excluded from the L1 file list. */
export type L1SkipReason =
  | 'skip-list'
  | 'sensitive'
  | 'ignored' // .gitignore or cortex.config.json anatomy.exclude
  | 'binary'
  | 'oversized';

const EXT_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'css',
  '.less': 'css',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.sql': 'sql',
  '.txt': 'text',
};

/** Stable language label for an extension (lowercased, with leading dot). */
export function languageForExt(ext: string): string {
  return EXT_LANGUAGE[ext.toLowerCase()] ?? 'other';
}

const HUB_INDEX_RE = /^index\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const HUB_MODULE_FILES = new Set(['__init__.py', 'mod.rs']);
const HUB_DOC_FILES = new Set([
  'claude.md',
  'agents.md',
  'contributing.md',
  'changelog.md',
  'code_of_conduct.md',
  'license',
  'license.md',
  'license.txt',
]);

/**
 * True when a file is a mechanical hub *by name* — index/barrel modules and
 * README/CLAUDE.md-style docs that accumulate edges mechanically (study:
 * "raw degree over-ranks index.ts and CLAUDE.md"; excluded from centrality).
 */
export function isMechanicalHubName(relPath: string): boolean {
  const basename = relPath.split('/').pop() ?? relPath;
  const lower = basename.toLowerCase();
  if (HUB_INDEX_RE.test(lower)) return true;
  if (HUB_MODULE_FILES.has(lower)) return true;
  if (HUB_DOC_FILES.has(lower)) return true;
  return lower.startsWith('readme');
}

const REEXPORT_RE =
  /(?:^|\n)\s*export\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[\s\S]*?\})\s*from\s*['"]/g;

/**
 * Majority-re-export barrel heuristic for JS/TS: the file is a barrel when
 * re-export statements account for at least half of its code lines (so a
 * non-`index`-named barrel is still excluded from centrality).
 */
export function isBarrelFile(content: string, language: string): boolean {
  if (language !== 'typescript' && language !== 'javascript') return false;
  const reexports = content.match(REEXPORT_RE)?.length ?? 0;
  if (reexports === 0) return false;
  const codeLines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !l.startsWith('//') &&
        !l.startsWith('/*') &&
        !l.startsWith('*'),
    );
  return reexports * 2 >= codeLines.length;
}
