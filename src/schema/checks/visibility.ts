/**
 * check.visibility (schema §10.1, Appendix A; spec schema.visibility;
 * RULES.md rule 20). A public repository's knowledge layer carries no
 * operational map: when `cortex.config.json` `visibility.repo` is `public`,
 * every tracked `.md`/`.yaml` under `.cortex/compass/` and `.cortex/atlas/`
 * is read line by line for the five pinned shapes operational specifics
 * take — an IPv4 address, a hostname in an infrastructure context, host:port,
 * `ssh user@host`, an account identifier — and each matching line is ONE
 * warning naming the family. Never an error, never a fix (Rule 6).
 *
 * "Tracked" means not excluded by the root `.gitignore` or `.cortex/.gitignore`
 * (Rule 2) — Core spawns no `git` (R-001), so the `ignore` package evaluates
 * the same patterns git would. Files matched by a `visibility.allow` glob are
 * skipped whole and reported in the validation report's `notes` (Rule 5).
 * At most VISIBILITY_MAX_LINES_PER_FILE line warnings per file, then one
 * `… and N more lines` warning. Output is deterministic: sorted paths,
 * ascending lines, identical across runs (Rule 6). No LLM, no network, no
 * subprocess (Rule 7).
 */
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import picomatch from 'picomatch';
import type { Violation } from '../types.js';

// `ignore` is a CJS module with no "exports" field; load it the way
// src/insight/exclude.ts does.
const _cjsRequire = createRequire(import.meta.url);
interface IgnoreInstance {
  add(patterns: string | string[]): void;
  ignores(pathname: string): boolean;
}
const _ignoreFactory = _cjsRequire('ignore') as () => IgnoreInstance;

export type VisibilityFamily = 'ipv4' | 'host' | 'port' | 'ssh' | 'account';

/**
 * The five shapes, pinned by schema.visibility Rule 4 (tests pin the sources).
 * The `ipv4` exclusions and the `host` context/safe-host conditions are
 * applied in code around the regex, below.
 */
export const VISIBILITY_PATTERNS: { name: VisibilityFamily; regex: RegExp }[] = [
  { name: 'ipv4', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
  { name: 'host', regex: /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+\.(?:com|net|org|io|dev|cloud|app|run|internal|local|corp|lan)\b/i },
  { name: 'port', regex: /\b(?:(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9.-]+\.[a-z]{2,}):\d{2,5}\b/i },
  { name: 'ssh', regex: /\bssh\s+(?:-\S+\s+)*[A-Za-z0-9._-]+@[A-Za-z0-9.-]+/ },
  {
    name: 'account',
    regex:
      /\b\d{12}\b|\barn:aws:\S+|\b[a-z][a-z0-9-]{4,28}@[a-z0-9-]+\.iam\.gserviceaccount\.com\b|--project(?:=|\s+)[a-z][a-z0-9-]{4,28}\b|\bprojects\/[a-z][a-z0-9-]{4,28}\b/,
  },
];

/** A hostname counts only on a line that also carries one of these words (whole-word, case-insensitive). */
export const VISIBILITY_CONTEXT_WORDS: string[] = [
  'ssh', 'host', 'hostname', 'server', 'vm', 'instance', 'cluster', 'endpoint', 'url', 'database', 'db', 'port', 'ip', 'address',
];

/** A remote name is a pointer, not a target: these (and their subdomains) never match as hosts. */
export const VISIBILITY_SAFE_HOSTS: string[] = [
  'github.com', 'gitlab.com', 'npmjs.com', 'example.com', 'example.org', 'localhost', 'anthropic.com', 'claude.ai',
];

/**
 * Rule 4, `port`: a match whose host label ends in one of these is a code
 * reference (`file.ts:74` — the bug ledger's evidence lines), not a port.
 */
export const VISIBILITY_CODE_REFERENCE_EXTENSIONS: string[] = [
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.yaml', '.yml', '.py', '.sh',
];

/** Rule 5: line warnings per file before the `… and N more lines` tail. */
export const VISIBILITY_MAX_LINES_PER_FILE = 20;

/**
 * When one line matches several families it yields ONE warning (Rule 5),
 * naming the most specific shape: an `ssh user@host` line is an ssh target
 * before it is a host, a `host:port` before a bare address.
 */
export const VISIBILITY_REPORT_ORDER: VisibilityFamily[] = ['ssh', 'account', 'port', 'ipv4', 'host'];

const IPV4_EXACT_EXCLUSIONS = new Set(['0.0.0.0', '127.0.0.1']);
const IPV4_VERSION_PREFIX_RE = /(?:v|version\s*[:=]?\s*)$/i;
const MATCHED_TEXT_MAX = 40;
const SCANNED_DIRS = ['compass', 'atlas'];
const SCANNED_EXTENSIONS = new Set(['.md', '.yaml']);

const globalOf = (re: RegExp): RegExp => new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
const CONTEXT_WORD_RE = new RegExp(`\\b(?:${VISIBILITY_CONTEXT_WORDS.join('|')})\\b`, 'i');

function isSafeHost(host: string): boolean {
  const h = host.toLowerCase();
  return VISIBILITY_SAFE_HOSTS.some((safe) => h === safe || h.endsWith('.' + safe));
}

/** The matched text for `family` on `line`, or null when the family does not fire. */
export function matchFamily(family: VisibilityFamily, line: string): string | null {
  const regex = globalOf(VISIBILITY_PATTERNS.find((p) => p.name === family)!.regex);
  for (const m of line.matchAll(regex)) {
    const text = m[0];
    const start = m.index ?? 0;
    const end = start + text.length;
    switch (family) {
      case 'ipv4': {
        if (IPV4_EXACT_EXCLUSIONS.has(text)) continue;
        // Version strings (Rule 4): `v1.2.3.4`, `Version 3.4.0.1` (the AC's
        // pinned safe line — "preceded by v" read as the version marker, not
        // only the bare letter), and `1.2.3.4-rc1`.
        if (IPV4_VERSION_PREFIX_RE.test(line.slice(0, start))) continue;
        if (line[end] === '-') continue;
        return text;
      }
      case 'host': {
        if (isSafeHost(text)) continue;
        const before = line.slice(0, start);
        const inContext = CONTEXT_WORD_RE.test(line) || before.endsWith('@') || before.endsWith('://');
        if (!inContext) continue;
        return text;
      }
      case 'port': {
        const host = text.slice(0, text.lastIndexOf(':')).toLowerCase();
        if (VISIBILITY_CODE_REFERENCE_EXTENSIONS.some((ext) => host.endsWith(ext))) continue;
        return text;
      }
      default:
        return text;
    }
  }
  return null;
}

/** The first family (in VISIBILITY_REPORT_ORDER) that fires on `line`, with its matched text. */
export function classifyLine(line: string): { family: VisibilityFamily; text: string } | null {
  for (const family of VISIBILITY_REPORT_ORDER) {
    const text = matchFamily(family, line);
    if (text !== null) return { family, text };
  }
  return null;
}

function readIgnore(file: string): IgnoreInstance | null {
  if (!fs.existsSync(file)) return null;
  try {
    const ig = _ignoreFactory();
    ig.add(fs.readFileSync(file, 'utf-8'));
    return ig;
  } catch {
    return null;
  }
}

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && SCANNED_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
}

function readVisibility(root: string): { repo: string; allow: string[] } {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8')) as Record<string, unknown>;
    const block = config['visibility'];
    if (typeof block !== 'object' || block === null || Array.isArray(block)) return { repo: 'unknown', allow: [] };
    const vis = block as Record<string, unknown>;
    const repo = typeof vis['repo'] === 'string' ? vis['repo'] : 'unknown';
    const allow = Array.isArray(vis['allow']) ? (vis['allow'] as unknown[]).filter((g): g is string => typeof g === 'string') : [];
    return { repo, allow };
  } catch {
    return { repo: 'unknown', allow: [] };
  }
}

/**
 * Warn, line by line, on operational specifics in tracked compass and atlas
 * files — only when `visibility.repo` is `public`. `notes`, when supplied,
 * receives one `allowed by visibility.allow: <path>` line per skipped file
 * for the validation report.
 */
export function checkVisibility(root: string, notes?: string[]): Violation[] {
  const { repo, allow } = readVisibility(root);
  if (repo !== 'public') return [];

  const cortexDir = path.join(root, '.cortex');
  const rootIgnore = readIgnore(path.join(root, '.gitignore'));
  const cortexIgnore = readIgnore(path.join(cortexDir, '.gitignore'));
  const allowMatchers = allow.map((glob) => picomatch(glob));

  const files: string[] = [];
  for (const dir of SCANNED_DIRS) walk(path.join(cortexDir, dir), files);
  files.sort();

  const violations: Violation[] = [];
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    const relToCortex = path.relative(cortexDir, file).split(path.sep).join('/');
    if (rootIgnore?.ignores(rel) || cortexIgnore?.ignores(relToCortex)) continue;
    if (allowMatchers.some((isMatch) => isMatch(rel))) {
      notes?.push(`allowed by visibility.allow: ${rel}`);
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    let reported = 0;
    let overflow = 0;
    for (let i = 0; i < lines.length; i++) {
      const hit = classifyLine(lines[i]!.replace(/\r$/, ''));
      if (hit === null) continue;
      if (reported >= VISIBILITY_MAX_LINES_PER_FILE) {
        overflow++;
        continue;
      }
      reported++;
      const lineNo = i + 1;
      violations.push({
        severity: 'warning',
        check: 'check.visibility',
        clause: '§10.1',
        location: { path: file, line: lineNo },
        message: `visibility: repo is public and ${rel}:${lineNo} carries a ${hit.family} (${hit.text.slice(0, MATCHED_TEXT_MAX)}) — move it to an untracked note or add the file to visibility.allow`,
      });
    }
    if (overflow > 0) {
      violations.push({
        severity: 'warning',
        check: 'check.visibility',
        clause: '§10.1',
        location: { path: file },
        message: `… and ${overflow} more lines`,
      });
    }
  }
  return violations;
}
