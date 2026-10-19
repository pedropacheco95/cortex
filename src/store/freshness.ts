/**
 * Freshness (schema Part II S6, S3 `depends_on`; spec store.freshness):
 * `now/` items expire on their `until:` date and move to history; facts with
 * `depends_on` are reported stale when git shows a later change. Core only
 * reports and moves; re-verifying is judgement.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseNowItems, type NowItem } from './frontmatter.js';
import { isGitRepo, newestCommitAfter, type CommitRef } from './git.js';
import { stringList, type Store } from './layout.js';
import { finding, type Finding } from './types.js';
import { frontmatterText } from './yaml.js';

export const PROPOSALS_FILE = 'now/proposals.md';
export const UNREVIEWED_MARKER = 'pending decision, expired unreviewed';

export function checkNowUntil(store: Store, today: string): Finding[] {
  const out: Finding[] = [];
  for (const f of store.files.filter((x) => x.module === 'now')) {
    for (const item of parseNowItems(f.body)) {
      if (item.until === null) out.push(finding('error', 'check.now-until', f.path, `item "${item.title}" has no until: date (schema S6)`));
      else if (item.until <= today) out.push(finding('warning', 'check.now-until', f.path, `item "${item.title}" expired (until ${item.until})`));
    }
  }
  return out;
}

export interface ExpiredItem { file: string; item: NowItem; proposalId: string | null }

export function expiredItems(store: Store, today: string): ExpiredItem[] {
  const out: ExpiredItem[] = [];
  for (const f of store.files.filter((x) => x.module === 'now').sort((a, b) => a.path.localeCompare(b.path))) {
    for (const item of parseNowItems(f.body)) {
      if (item.until === null || item.until > today) continue;
      const id = f.path === PROPOSALS_FILE && item.kind === 'heading' ? (/^([SG]-\d+)\b/.exec(item.title)?.[1] ?? null) : null;
      out.push({ file: f.path, item, proposalId: id });
    }
  }
  return out;
}

/** The first free `history/changes/<today>-now-expired[-n].md` (Rule 6). */
export function expiryRecordPath(store: Store, today: string): string {
  for (let n = 1; ; n++) {
    const rel = `history/changes/${today}-now-expired${n === 1 ? '' : `-${n}`}.md`;
    if (!fs.existsSync(path.join(store.dir, rel))) return rel;
  }
}

export function renderExpiryRecord(items: ExpiredItem[], today: string): string {
  const files = [...new Set(items.map((i) => i.file))];
  const fm = frontmatterText({
    about: `Items that expired from now/ on ${today}`,
    permanence: 'stable',
    verified: `${today} (observed)`,
    origin: files.map((f) => `expired:${f}`),
    kind: 'other',
    status: 'expired',
  });
  const parts: string[] = [`# Expired from now/ on ${today}`];
  for (const i of items) {
    parts.push(`From ${i.file}:${i.proposalId ? `\n${UNREVIEWED_MARKER}` : ''}\n\n${i.item.text}`);
  }
  return fm + '\n' + parts.join('\n\n') + '\n';
}

function removeItems(body: string, items: NowItem[]): string {
  const lines = body.split('\n');
  const drop = new Set<number>();
  for (const it of items) {
    for (let i = it.start; i < it.end; i++) drop.add(i);
    let j = it.end;
    while (j < lines.length && lines[j]!.trim() === '' && !drop.has(j)) { drop.add(j); j++; }
  }
  return lines.filter((_, i) => !drop.has(i)).join('\n');
}

export interface ExpireResult {
  expired: ExpiredItem[];
  proposalIds: string[];
  /** The history record written (store-relative), with --apply and at least one item. */
  record: string | null;
  lines: string[];
}

export function expire(store: Store, today: string, apply: boolean): ExpireResult {
  const expired = expiredItems(store, today);
  const proposalIds = expired.flatMap((e) => (e.proposalId ? [e.proposalId] : []));
  const lines = expired.map((e) => `expired ${e.file}: ${e.item.title} (until ${e.item.until})`);
  if (expired.length === 0) lines.push('no expired items');
  if (proposalIds.length > 0) lines.push(`${proposalIds.length} proposal(s) expired unreviewed: ${proposalIds.join(', ')}`);
  let record: string | null = null;
  if (apply && expired.length > 0) {
    record = expiryRecordPath(store, today);
    fs.mkdirSync(path.dirname(path.join(store.dir, record)), { recursive: true });
    fs.writeFileSync(path.join(store.dir, record), renderExpiryRecord(expired, today));
    for (const file of [...new Set(expired.map((e) => e.file))]) {
      const f = store.files.find((x) => x.path === file)!;
      const head = f.raw.slice(0, f.raw.length - f.body.length);
      fs.writeFileSync(path.join(store.dir, file), head + removeItems(f.body, expired.filter((e) => e.file === file).map((e) => e.item)));
    }
    lines.push(`moved ${expired.length} item(s) to ${record}`);
  }
  return { expired, proposalIds, record, lines };
}

export interface StaleHit { file: string; dependency: string; commit: CommitRef }

export function staleFacts(store: Store): StaleHit[] {
  const out: StaleHit[] = [];
  for (const f of store.files) {
    const deps = stringList(f.frontmatter?.['depends_on']);
    if (!deps.length || !f.verified || 'error' in f.verified) continue;
    for (const dep of deps) {
      const spec = /[*?[]/.test(dep) ? `:(glob)${dep}` : dep;
      const c = newestCommitAfter(store.root, spec, f.verified.date);
      if (c) out.push({ file: f.path, dependency: dep, commit: c });
    }
  }
  return out;
}

export function checkStale(store: Store): Finding[] {
  if (!isGitRepo(store.root)) return [];
  return staleFacts(store).map((h) => finding('warning', 'check.stale', h.file, `${h.dependency} changed after verified (${h.commit.sha} ${h.commit.date}); re-verify`));
}
