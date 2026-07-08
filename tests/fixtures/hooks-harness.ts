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
 * four module directories. Enough substrate for every hook.
 */
export function makeCortexProject(
  root: string,
  opts: { config?: Record<string, unknown>; modules?: string[] } = {},
): void {
  const cortexDir = path.join(root, '.cortex');
  fs.mkdirSync(cortexDir, { recursive: true });
  const config = opts.config ?? {
    schemaVersion: '1.0',
    anatomy: { exclude: ['dist/**', 'node_modules/**'], enhancement: 'none' },
    hooks: { preRead: false },
    pulse: { distilThresholdN: 3, dismissedWindowDays: 90, hygieneFreshnessHours: 48 },
    loop: { enabled: false },
  };
  fs.writeFileSync(path.join(cortexDir, 'cortex.config.json'), JSON.stringify(config, null, 2) + '\n');
  fs.writeFileSync(path.join(cortexDir, '_index.md'), '# Cortex — index\n\n**Read this when:** always.\n');
  for (const m of opts.modules ?? ['anatomy', 'compass', 'atlas', 'pulse']) {
    fs.mkdirSync(path.join(cortexDir, m), { recursive: true });
  }
}

export function writeHygieneReport(root: string, generatedIso: string, summary: string): string {
  const p = path.join(root, '.cortex', 'pulse', 'hygiene-report.md');
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

/** Minimal well-formed anatomy/files.md with the given data rows. */
export function writeFilesMd(root: string, rows: string[], lastFullScan = '2026-06-30T14:00:00.000Z'): string {
  const p = path.join(root, '.cortex', 'anatomy', 'files.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const header = '| path | purpose | tokens | sha256 | last_seen | spec_links | needs_purpose_refresh | purpose_source |';
  const sep = '|------|---------|--------|--------|-----------|------------|-----------------------|----------------|';
  fs.writeFileSync(
    p,
    `---\nkind: anatomy-files\nlast_full_scan: ${lastFullScan}\nfile_count: ${rows.length}\n---\n\n` +
      [header, sep, ...rows].join('\n') +
      '\n',
  );
  return p;
}

export interface FilesMdRow {
  path: string;
  purpose: string;
  tokens: number;
  sha256: string;
  lastSeen: string;
  specLinks: string;
  flagged: boolean;
  /** purpose_source cell (§4.1); '-' when the row is legacy 7-column. */
  purposeSource: string;
  raw: string;
}

/** Parse files.md data rows for assertions (8-column, legacy 7 tolerated). */
export function readFilesMdRows(root: string): FilesMdRow[] {
  const p = path.join(root, '.cortex', 'anatomy', 'files.md');
  if (!fs.existsSync(p)) return [];
  const rows: FilesMdRow[] = [];
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    if (!line.trim().startsWith('|') || line.includes('---')) continue;
    const cells = line
      .split('|')
      .filter((_, i, arr) => i > 0 && i < arr.length - 1)
      .map((c) => c.trim());
    if ((cells.length !== 8 && cells.length !== 7) || cells[0] === 'path' || !cells[0]) continue;
    rows.push({
      path: cells[0] ?? '',
      purpose: cells[1] ?? '',
      tokens: Number(cells[2]),
      sha256: cells[3] ?? '',
      lastSeen: cells[4] ?? '',
      specLinks: cells[5] ?? '',
      flagged: cells[6] === 'true',
      purposeSource: cells[7] || '-',
      raw: line,
    });
  }
  return rows;
}

export function readIfExists(p: string): string | null {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
}

export function hookErrorsPath(root: string): string {
  return path.join(root, '.cortex', 'pulse', 'hook-errors.md');
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
