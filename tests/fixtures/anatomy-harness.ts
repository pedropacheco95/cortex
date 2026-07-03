/**
 * Shared fixtures for the anatomy.refresh-fast / anatomy.refresh-deep tests:
 * sandboxed tmp git repos with real commits, scanned via the real scanner.
 * The real repo and the real ~/.claude are NEVER touched.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';

let counter = 0;

export function makeTmpDir(label: string): string {
  const dir = path.join(os.tmpdir(), `cortex-anatomy-${label}-${Date.now()}-${counter++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function cleanTmp(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

export function gitInit(cwd: string): void {
  git(cwd, 'init', '--quiet');
  git(cwd, 'config', 'user.email', 'fixture@example.com');
  git(cwd, 'config', 'user.name', 'Fixture');
  git(cwd, 'config', 'commit.gpgsign', 'false');
}

export function gitCommitAll(cwd: string, message: string): void {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '--quiet', '-m', message);
}

/** Minimal `.cortex/` skeleton (config only — enough for scan + refresh). */
export function makeCortexSkeleton(root: string): void {
  const cortexDir = path.join(root, '.cortex');
  fs.mkdirSync(cortexDir, { recursive: true });
  fs.writeFileSync(
    path.join(cortexDir, 'cortex.config.json'),
    JSON.stringify({ schemaVersion: '1.0', anatomy: { exclude: [], enhancement: 'none' }, hooks: { preRead: false } }, null, 2) + '\n',
    'utf-8',
  );
}

export interface FilesMdRow {
  path: string;
  purpose: string;
  tokens: number;
  sha256: string;
  lastSeen: string;
  specLinks: string;
  flagged: boolean;
  /** The full raw row line — for atomic-row-write before/after comparison. */
  raw: string;
}

/** Parse files.md data rows for assertions (raw line kept per row). */
export function readRows(root: string): FilesMdRow[] {
  const p = path.join(root, '.cortex', 'anatomy', 'files.md');
  if (!fs.existsSync(p)) return [];
  const rows: FilesMdRow[] = [];
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    if (!line.trim().startsWith('|') || line.includes('---')) continue;
    const cells = line
      .split('|')
      .filter((_, i, arr) => i > 0 && i < arr.length - 1)
      .map((c) => c.trim());
    if (cells.length !== 7 || cells[0] === 'path' || !cells[0]) continue;
    rows.push({
      path: cells[0] ?? '',
      purpose: cells[1] ?? '',
      tokens: Number(cells[2]),
      sha256: cells[3] ?? '',
      lastSeen: cells[4] ?? '',
      specLinks: cells[5] ?? '',
      flagged: cells[6] === 'true',
      raw: line,
    });
  }
  return rows;
}

export function row(root: string, relPath: string): FilesMdRow | undefined {
  return readRows(root).find((r) => r.path === relPath);
}

export function filesMdPath(root: string): string {
  return path.join(root, '.cortex', 'anatomy', 'files.md');
}

export function graphPath(root: string): string {
  return path.join(root, '.cortex', 'anatomy', 'graph.json');
}

export function readGraph(root: string): { nodes: string[]; edges: { from: string; to: string; kind: string }[] } {
  return JSON.parse(fs.readFileSync(graphPath(root), 'utf-8')) as {
    nodes: string[];
    edges: { from: string; to: string; kind: string }[];
  };
}

export function worklistPath(root: string): string {
  return path.join(root, '.cortex', 'pulse', '.purpose-worklist.json');
}

export function writeExecutable(filePath: string, script: string): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, script, 'utf-8');
  fs.chmodSync(filePath, 0o755);
  return filePath;
}
