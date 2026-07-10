/**
 * Shared fixtures for the hooks.* tests. Every test gets a fresh tmp project —
 * the real repo and the real ~/.claude are NEVER touched.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let counter = 0;

export function makeTmpDir(label: string): string {
  const dir = path.join(os.tmpdir(), `cortex-hooks-${label}-${Date.now()}-${counter++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function cleanTmp(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Handcrafted init-like `.cortex/` skeleton: config, root _index.md, and the
 * v3 module directories (anatomy is deprecated — never scaffolded by default).
 * Enough substrate for every hook.
 */
export function makeCortexProject(
  root: string,
  opts: { config?: Record<string, unknown>; modules?: string[] } = {},
): void {
  const cortexDir = path.join(root, '.cortex');
  fs.mkdirSync(cortexDir, { recursive: true });
  const config = opts.config ?? {
    schemaVersion: '3.0',
    hooks: { preRead: false },
    pulse: { distilThresholdN: 3, dismissedWindowDays: 90, hygieneFreshnessHours: 48 },
    loop: { enabled: false },
  };
  fs.writeFileSync(path.join(cortexDir, 'cortex.config.json'), JSON.stringify(config, null, 2) + '\n');
  fs.writeFileSync(path.join(cortexDir, '_index.md'), '# Cortex — index\n\n**Read this when:** always.\n');
  for (const m of opts.modules ?? ['compass', 'atlas', 'insight', 'pulse']) {
    fs.mkdirSync(path.join(cortexDir, m), { recursive: true });
  }
}

export function writeHygieneReport(root: string, generatedIso: string, summary: string): string {
  const p = path.join(root, '.cortex', 'pulse', 'reports', 'hygiene.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    `---\nkind: pulse-hygiene-report\ngenerated: ${generatedIso}\nloop: cortex-hygiene\n---\n\n# Hygiene report\n\n${summary}\n`,
  );
  return p;
}

/** Write a compass rule file with raw frontmatter YAML lines. */
export function writeRule(root: string, filename: string, frontmatter: string, body = ''): string {
  const p = path.join(root, '.cortex', 'compass', 'rules', filename);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `---\n${frontmatter.trim()}\n---\n\n${body}`);
  return p;
}

// ---------------------------------------------------------------------------
// Insight per-file entries (v3 — the hooks' data source after the anatomy
// deprecation). Entries live at .cortex/insight/anatomy/<relpath>.md and
// satisfy the src/insight/entry.ts frontmatter + section contract.
// ---------------------------------------------------------------------------

export interface InsightEntryOptions {
  /** Content of the `## Purpose` section (default a one-liner). */
  purpose?: string;
  /** 2 (Purpose + Connections) or 3 (adds Main players). Default 2. */
  level?: 2 | 3;
  tokens?: number;
  lines?: number;
  centrality?: 'high' | 'medium' | 'low';
  sha256?: string;
  extractedAt?: string;
  builtAtCommit?: string;
  /** Content of the `## Connections` section. */
  connections?: string;
  /** Content of the `## Main players` section (L3 only). */
  mainPlayers?: string;
}

/** Absolute path of the flat-layout insight entry for a source path. */
export function insightEntryPath(root: string, relPath: string): string {
  return path.join(root, '.cortex', 'insight', 'anatomy', `${relPath}.md`);
}

/** Write a schema-valid insight per-file entry (flat layout). */
export function writeInsightEntry(root: string, relPath: string, opts: InsightEntryOptions = {}): string {
  const p = insightEntryPath(root, relPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const level = opts.level ?? 2;
  const frontmatter = [
    '---',
    `path: ${relPath}`,
    `extracted_at: '${opts.extractedAt ?? '2026-06-30T14:00:00.000Z'}'`,
    `extraction_level: ${level}`,
    `size_lines: ${opts.lines ?? 10}`,
    `size_tokens: ${opts.tokens ?? 120}`,
    `centrality: ${opts.centrality ?? 'medium'}`,
    `built_at_commit: '${opts.builtAtCommit ?? 'abc1234'}'`,
    `source_sha256: ${opts.sha256 ?? 'a'.repeat(64)}`,
    '---',
  ].join('\n');
  const body: string[] = ['## Purpose', '', opts.purpose ?? 'Does A.', ''];
  if (level === 3) {
    body.push('## Main players', '', opts.mainPlayers ?? '- `main` — the main player (L1-L9).', '');
  }
  body.push('## Connections', '', opts.connections ?? '- none observed.', '');
  fs.writeFileSync(p, frontmatter + '\n\n' + body.join('\n'));
  return p;
}

/** The raw content of a source path's insight entry, or null when absent. */
export function readInsightEntry(root: string, relPath: string): string | null {
  return readIfExists(insightEntryPath(root, relPath));
}

export function readIfExists(p: string): string | null {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
}

export function hookErrorsPath(root: string): string {
  return path.join(root, '.cortex', 'pulse', 'reports', 'hook-errors.md');
}

/** Parse hook stdout as the pinned JSON envelope. */
export function parseEnvelope(stdout: string): {
  hookEventName: string;
  additionalContext: string;
  permissionDecision?: string;
} {
  const parsed = JSON.parse(stdout) as { hookSpecificOutput: Record<string, unknown> };
  return parsed.hookSpecificOutput as unknown as {
    hookEventName: string;
    additionalContext: string;
    permissionDecision?: string;
  };
}

export function isoHoursAgo(hours: number, now: Date): string {
  return new Date(now.getTime() - hours * 3_600_000).toISOString();
}
