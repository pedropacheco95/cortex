/**
 * `cortex store amendments` (spec loops.learn-task Rule 5): record
 * `Specflow-Amends:` commit trailers in `history/changes/`. A new file each
 * time, so `check.append-only` stays quiet.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { frontmatterText } from './yaml.js';

const CHANGES_DIR = path.join('cortex', 'history', 'changes');
const RECORD_NAME = /-spec-amendments.*\.md$/;

export interface Amendment {
  sha: string;
  shortSha: string;
  date: string;
  spec: string;
  item: string;
  reason: string;
}

export interface MalformedTrailer { shortSha: string; value: string }

export interface AmendmentsResult {
  unrecorded: Amendment[];
  malformed: MalformedTrailer[];
  /** The store-relative path written, when `apply` wrote one. */
  written: string | null;
}

/** Schema S10: `<spec-id>#<item> — <reason>`, the target split at its last `#`. */
export function parseAmendsValue(value: string): { spec: string; item: string; reason: string } | null {
  const m = /^(\S+)\s+(?:—|--|-)\s+(.+)$/.exec(value.trim());
  if (!m) return null;
  const target = m[1] as string;
  const at = target.lastIndexOf('#');
  if (at <= 0 || at === target.length - 1) return null;
  return { spec: target.slice(0, at), item: target.slice(at + 1), reason: (m[2] as string).trim() };
}

function trailerCommits(root: string): { sha: string; date: string; values: string[] }[] {
  const format = '%H%x00%ad%x00%(trailers:key=Specflow-Amends,valueonly,unfold)%x00%x01';
  const out = execFileSync('git', ['-C', root, 'log', '--reverse', '--date=short', `--format=${format}`, 'HEAD'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 256 * 1024 * 1024,
  });
  const commits: { sha: string; date: string; values: string[] }[] = [];
  for (const record of out.split('\x01')) {
    const [sha, date, trailers] = record.replace(/^\n/, '').split('\0');
    if (!sha || !date || !trailers) continue;
    const values = trailers.split('\n').map((v) => v.trim()).filter((v) => v.length > 0);
    if (values.length > 0) commits.push({ sha, date, values });
  }
  return commits;
}

/** The commits after `specflow.since`, or null when it is unset or git cannot resolve it. */
function commitsSince(root: string): Set<string> | null {
  let since: unknown;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'cortex', 'cortex.json'), 'utf-8')) as { specflow?: { since?: unknown } };
    since = cfg.specflow?.since;
  } catch {
    return null;
  }
  if (typeof since !== 'string' || since.length === 0) return null;
  try {
    const out = execFileSync('git', ['-C', root, 'log', '--format=%H', 'HEAD', `^${since}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 256 * 1024 * 1024,
    });
    return new Set(out.split('\n').filter((l) => l.length > 0));
  } catch {
    return null;
  }
}

function recordedShas(root: string): Set<string> {
  const dir = path.join(root, CHANGES_DIR);
  const shas = new Set<string>();
  if (!fs.existsSync(dir)) return shas;
  for (const name of fs.readdirSync(dir).filter((n) => RECORD_NAME.test(n))) {
    for (const m of fs.readFileSync(path.join(dir, name), 'utf-8').matchAll(/^- ([0-9a-f]{7}) /gm)) {
      shas.add(m[1] as string);
    }
  }
  return shas;
}

/** The first free `<today>-spec-amendments[-n].md` (`store.freshness` Rule 6). */
function recordName(root: string, today: string): string {
  for (let n = 1; ; n++) {
    const name = `${today}-spec-amendments${n === 1 ? '' : `-${n}`}.md`;
    if (!fs.existsSync(path.join(root, CHANGES_DIR, name))) return name;
  }
}

function renderRecord(items: Amendment[], today: string): string {
  const fm = frontmatterText({
    about: `Spec amendments recorded on ${today}`,
    permanence: 'stable',
    verified: `${today} (observed)`,
    origin: [...new Set(items.map((a) => `commit:${a.sha}`))],
    kind: 'spec-amendment',
    status: 'recorded',
  });
  const lines = items.map((a) => `- ${a.shortSha} ${a.date} ${a.spec}#${a.item} — ${a.reason}`);
  return `${fm}\n# Spec amendments recorded on ${today}\n\n${lines.join('\n')}\n`;
}

export function storeAmendments(root: string, today: string, apply: boolean): AmendmentsResult {
  const recorded = recordedShas(root);
  const after = commitsSince(root);
  const unrecorded: Amendment[] = [];
  const malformed: MalformedTrailer[] = [];
  for (const commit of trailerCommits(root)) {
    const shortSha = commit.sha.slice(0, 7);
    for (const value of commit.values) {
      const parsed = parseAmendsValue(value);
      if (parsed === null) {
        if (after === null || after.has(commit.sha)) malformed.push({ shortSha, value });
      } else if (!recorded.has(shortSha)) {
        unrecorded.push({ sha: commit.sha, shortSha, date: commit.date, ...parsed });
      }
    }
  }
  let written: string | null = null;
  if (apply && unrecorded.length > 0) {
    const name = recordName(root, today);
    fs.mkdirSync(path.join(root, CHANGES_DIR), { recursive: true });
    fs.writeFileSync(path.join(root, CHANGES_DIR, name), renderRecord(unrecorded, today), 'utf-8');
    written = `history/changes/${name}`;
  }
  return { unrecorded, malformed, written };
}

export function amendmentLines(r: AmendmentsResult): string[] {
  return [
    ...r.unrecorded.map((a) => `unrecorded: ${a.shortSha} ${a.date} ${a.spec}#${a.item} — ${a.reason}`),
    ...r.malformed.map((m) => `malformed: ${m.shortSha} ${m.value}`),
    ...(r.written === null ? [] : [`wrote ${r.written}`]),
  ];
}
