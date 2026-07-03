/**
 * Shared fixtures for the deterministic loop tests (pulse.hygiene,
 * loops.rule-decay, loops.atlas-staleness, loops.onboarding-drift,
 * loops.spec-drift). Sandboxed tmp projects only — the real repo and the
 * real ~/.claude are NEVER touched. Git fixtures use backdated commits via
 * GIT_AUTHOR_DATE / GIT_COMMITTER_DATE so age thresholds are deterministic.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysAgoIso(days: number, from: number = Date.now()): string {
  return new Date(from - days * DAY_MS).toISOString();
}

/** mkdir -p + write, project-relative. Returns the absolute path. */
export function writeAt(root: string, rel: string, content: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
  return abs;
}

/** Minimal `.cortex` skeleton: pulse/ dir + a §10.1-shaped config. */
export function makeCortexProject(root: string, schemaVersion = '1.0'): void {
  fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
  writeAt(root, '.cortex/cortex.config.json', JSON.stringify({ schemaVersion }, null, 2) + '\n');
}

const GIT_ID = ['-c', 'user.name=loops-test', '-c', 'user.email=loops@test.invalid'];

export function gitInitRepo(root: string): void {
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: root });
}

/** `git add <paths> && git commit` with author+committer dates pinned to `iso`. */
export function gitCommitPathsAt(root: string, paths: string[], iso: string, msg = 'commit'): void {
  execFileSync('git', ['add', '--', ...paths], { cwd: root });
  execFileSync('git', [...GIT_ID, 'commit', '--quiet', '-m', msg, '--', ...paths], {
    cwd: root,
    env: { ...process.env, GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso },
  });
}

/** `git add -A && git commit` with dates pinned to `iso`. */
export function gitCommitAllAt(root: string, iso: string, msg = 'commit'): void {
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', [...GIT_ID, 'commit', '--quiet', '-m', msg], {
    cwd: root,
    env: { ...process.env, GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso },
  });
}

export function gitRun(root: string, args: string[], iso?: string): string {
  return execFileSync('git', [...GIT_ID, ...args], {
    cwd: root,
    encoding: 'utf-8',
    env: iso ? { ...process.env, GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso } : process.env,
  });
}

/** Backdate a file's mtime (for non-git age fallbacks). */
export function setMtimeDaysAgo(absPath: string, days: number): void {
  const t = new Date(Date.now() - days * DAY_MS);
  fs.utimesSync(absPath, t, t);
}

/** Parse a §4.5 pulse report: frontmatter fields + body. */
export function parsePulseReport(absPath: string): {
  kind: string | null;
  generated: string | null;
  loop: string | null;
  body: string;
} {
  const raw = fs.readFileSync(absPath, 'utf-8');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) return { kind: null, generated: null, loop: null, body: raw };
  const fm = m[1] as string;
  const get = (key: string): string | null => {
    const km = new RegExp(`^${key}: (.*)$`, 'm').exec(fm);
    return km ? (km[1] as string).trim() : null;
  };
  return { kind: get('kind'), generated: get('generated'), loop: get('loop'), body: m[2] as string };
}

/** A minimal valid rule file body (schema §4.2 shape). */
export function ruleMd(
  id: string,
  opts: { source?: string[]; governs?: string[]; status?: string; title?: string } = {},
): string {
  const source = opts.source ?? ['../../../README.md'];
  const governs = opts.governs ?? ['src/**/*.ts'];
  return [
    '---',
    `id: ${id}`,
    `title: ${opts.title ?? `${id} test rule`}`,
    ...(opts.status ? [`status: ${opts.status}`] : []),
    'source:',
    ...source.map((s) => `  - ${s}`),
    'governs:',
    ...governs.map((g) => `  - "${g}"`),
    '---',
    '',
    `# ${id}`,
    '',
    'Body.',
    '',
  ].join('\n');
}

/** A minimal dev spec body with optional governs. */
export function specMd(id: string, governs?: string[]): string {
  return [
    '---',
    `id: ${id}`,
    'status: draft',
    ...(governs && governs.length > 0 ? ['governs:', ...governs.map((g) => `  - "${g}"`)] : []),
    '---',
    '',
    `# ${id}`,
    '',
  ].join('\n');
}

/** A minimal atlas decision body. */
export function decisionMd(slug: string, dateIso: string, extra: string[] = []): string {
  return [
    '---',
    `id: decision.${slug}`,
    `title: Decision ${slug}`,
    `date: ${dateIso}`,
    ...extra,
    '---',
    '',
    `# Decision ${slug}`,
    '',
  ].join('\n');
}

/** anatomy files.md content from (path, spec_links) pairs. */
export function filesMdContent(rows: Array<{ path: string; specLinks?: string }>): string {
  const lines = [
    '---',
    'kind: anatomy-files',
    `generated: ${new Date().toISOString()}`,
    '---',
    '',
    '# Files',
    '',
    '| path | purpose | tokens | sha256 | last_seen | spec_links | needs_purpose_refresh | purpose_source |',
    '|------|---------|--------|--------|-----------|------------|-----------------------|----------------|',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.path} | test purpose | 10 | abc123 | 2026-01-01T00:00:00Z | ${r.specLinks ?? '-'} | false | scanner-llm |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
