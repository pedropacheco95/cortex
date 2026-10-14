/**
 * Fixtures for the 4.0 store specs (`store.*`): a temp repo with a `cortex/`
 * folder, a file writer that takes frontmatter as an object, and a git helper
 * with pinned dates for the git-reading checks (append-only, stale, trailers).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

const dirs: string[] = [];

export function tmpRepo(label: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `cortex-store-${label}-`));
  dirs.push(d);
  return d;
}

export function cleanRepos(): void {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
}

/** A well-formed set of the S3 required fields, overridable per test. */
export function baseFm(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    about: 'What this file answers',
    permanence: 'changing',
    verified: '2026-10-12 (told)',
    origin: 'session:3f2a9c1e-7b4d-4e8a-9f60-2c1d5e8b7a94',
    ...extra,
  };
}

function yamlValue(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => yamlValue(x)).join(', ')}]`;
  if (v !== null && typeof v === 'object') {
    return `{ ${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${yamlValue(x)}`).join(', ')} }`;
  }
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}

/** Frontmatter object → YAML block (JSON-quoted scalars, flow collections). */
export function fmText(fm: Record<string, unknown>): string {
  return `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${yamlValue(v)}`).join('\n')}\n---\n`;
}

/** Write `cortex/<rel>`; `fm` null writes the body alone. */
export function writeStoreFile(root: string, rel: string, fm: Record<string, unknown> | null, body = 'Body.\n'): string {
  const p = path.join(root, 'cortex', rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, (fm ? fmText(fm) : '') + body);
  return p;
}

export function writeConfig(root: string, cfg: Record<string, unknown> = { schemaVersion: '4.0', visibility: { repo: 'private', allow: [] } }): void {
  fs.mkdirSync(path.join(root, 'cortex'), { recursive: true });
  fs.writeFileSync(path.join(root, 'cortex', 'cortex.json'), JSON.stringify(cfg, null, 2) + '\n');
}

export function git(root: string, args: string[], date = '2026-10-01T12:00:00'): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid',
      GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid',
      GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
      GIT_CONFIG_NOSYSTEM: '1', HOME: root,
    },
  });
}

export function gitInit(root: string): void {
  git(root, ['init', '-q', '-b', 'main']);
}

export function commitAll(root: string, message: string, date?: string): void {
  git(root, ['add', '-A'], date);
  git(root, ['commit', '-q', '--allow-empty', '-m', message], date);
}

/** Every file under `dir` with its bytes, for byte-identity assertions. */
export function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(dir)) return out;
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '.git') walk(p); } else out[path.relative(dir, p)] = fs.readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}
