/**
 * Dispositions and the planned 4.0 tree (schema Part II S9.3 mapping table;
 * spec store.migrate Rules 2–5, 10, 12, 13). Deterministic: judgement rows
 * take a default flagged `review`, and a plan file overrides any default.
 */
import * as fs from 'fs';
import * as path from 'path';
import { classify, HISTORY_FOLDERS, WORLD_FOLDERS } from '../layout.js';
import { frontmatterText, yamlScalar } from '../yaml.js';
import { fencedLines } from '../frontmatter.js';
import { parseFile } from '../frontmatter.js';
import { isoDate, NOT_A_STORE_FOLDER, type Entry, type LegacyStore } from './entries.js';

export type Disposition =
  | { kind: 'migrated'; targets: string[] }
  | { kind: 'retired'; reason: string }
  | { kind: 'dropped'; group: string }
  | { kind: 'pending'; target: string }
  | { kind: 'unmapped' };

/** One `now/proposals.md` item rendered from a proposals digest (Rule 3). */
export interface ProposalItem { id: string; title: string; body: string }

export interface Planned {
  entry: Entry;
  disposition: Disposition;
  review: string | null;
  fromPlan: boolean;
  /** The plan's folder key that decided this entry, when one did. */
  folderKey?: string;
  /** Digest: the plan's file, and its body. */
  digest?: { file: string; body: string };
  /** A raw rescue: the target is under `history/sources/raw/`. */
  rawRescue?: boolean;
  /** Retired `unpromoted work` (or `not a store folder`) with no plan decision (Rule 16). */
  undecided?: boolean;
  /** Proposal items from a digest targeted at `now/proposals.md`. */
  items?: ProposalItem[];
}

export const PROPOSALS_TARGET = 'now/proposals.md';
export const CONFIG_TARGET = 'cortex.json';
const PREFERENCES_TARGET = 'world/agreements/working-preferences.md';
export const RAW_PREFIX = 'history/sources/raw/';
const BUG_STATUSES = new Set(['open', 'triaged', 'resolved']);
const AUTHORITY_TARGET = 'world/rules/agent-authority.md';

export function kebab(text: string, maxWords = 6): string {
  const words = text
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords);
  return words.join('-') || 'entry';
}

/** Old filename stem → 4.0 slug: no 3.x id, no date prefix, kebab-case. */
export function stemSlug(stem: string): string {
  return kebab(stem.replace(/^[A-Za-z]{1,2}-\d+-/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''), 12);
}

/** A block's lead for naming: its bold lead, else the text before a colon, else its first words. */
export function blockLead(text: string): string {
  const t = text.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').replace(/^>\s*/, '').trim();
  const bold = /^\*\*(.+?)\*\*/.exec(t);
  if (bold) return bold[1]!.replace(/[.:]$/, '');
  const colon = /^([^:\n]{3,60}):/.exec(t);
  if (colon && colon[1]!.split(/\s+/).length <= 6) return colon[1]!;
  return t.split('\n')[0]!;
}

function bugArea(e: Entry): string {
  const list = (k: string): string[] => (Array.isArray(e.fm[k]) ? (e.fm[k] as unknown[]).map(String) : []);
  const first = list('affects')[0] ?? list('specs')[0] ?? list('related_specs')[0];
  if (!first) return 'repo';
  if (!first.includes('/')) return kebab(first.split('.')[0]!, 4);
  const parts = first.split('/');
  return kebab((parts[0] === 'src' && parts.length > 2 ? parts[1] : parts[0])!, 4);
}

/** Rule 4 date chain: the 3.x date fields, then the newest git date of the entry's files, then the apply date. */
export type FileDate = (legacyRel: string) => string | null;

export function dateChain(e: Entry, fileDate: FileDate, today: string): string {
  if (e.date) return e.date;
  const dates = e.files.map((f) => fileDate(f)).filter((d): d is string => !!d).sort();
  return dates[dates.length - 1] ?? today;
}

function bugReview(e: Entry): string | null {
  const st = String(e.fm['status'] ?? '');
  return BUG_STATUSES.has(st) ? null : `3.x status ${st}`;
}

function defaultDisposition(e: Entry, all: Entry[], date: string): { d: Disposition; review: string | null } {
  const m = (targets: string[], review: string | null = null) => ({ d: { kind: 'migrated', targets } as Disposition, review });
  switch (e.row) {
    case 'config': return m([CONFIG_TARGET]);
    case 'rule': return m([`world/rules/${stemSlug(e.stem)}.md`], 'applies_when drafted from the title; source and verified date taken from git');
    case 'bug-resolved': return m([`history/incidents/${date}-${stemSlug(e.stem)}.md`], bugReview(e));
    case 'bug-open': return m([`code/${bugArea(e)}/${stemSlug(e.stem)}.md`], bugReview(e));
    case 'environment': return m([`world/systems/${kebab(blockLead(e.body), 5)}.md`], 'environment entry: check it is a pointer, not a host map (check.visibility runs)');
    case 'preferences': return m([PREFERENCES_TARGET], 'a code convention belongs in code/');
    case 'do-not-repeat': return m([`code/repo/${kebab(blockLead(e.body), 6)}.md`], 'may belong in a narrower code area');
    case 'standing-authorities': return m([AUTHORITY_TARGET], 'applies_when drafted');
    case 'registry': return { d: { kind: 'retired', reason: e.reason ?? 'id registry' }, review: null };
    case 'decision': {
      const slug = stemSlug(e.stem);
      const supersedes = Array.isArray(e.fm['supersedes']) && (e.fm['supersedes'] as unknown[]).length > 0;
      const supersededBy = all.some((o) => o.row === 'decision' && Array.isArray(o.fm['supersedes']) && (o.fm['supersedes'] as unknown[]).some((s) => String(s).includes(e.stem)));
      return m([`world/decisions/${slug}.md`, `history/changes/${date}-${slug}.md`], supersedes || supersededBy ? 'two decisions bear on one question (supersedes)' : null);
    }
    case 'stakeholder': return m([`world/${e.fm['name'] ? 'people' : 'orgs'}/${stemSlug(e.stem)}.md`]);
    case 'term': return m([`world/terms/${kebab(String(e.fm['term'] ?? e.stem), 8)}.md`]);
    case 'evidence': return m([`history/measurements/${date}-${stemSlug(e.stem)}.md`]);
    case 'source': return m([`history/sources/${date}-${stemSlug(e.stem)}.md`], e.noMeta ? 'no .meta.md: the digest is a stub naming the raw file' : null);
    case 'document': return m([`history/sources/${date}-${stemSlug(e.stem)}.md`]);
    case 'intent': return m([`history/changes/${date}-${kebab(String(e.fm['stated_intent'] ?? e.id ?? 'intent'), 6)}.md`]);
    case 'observation': return m([`code/repo/${stemSlug(e.stem)}.md`], 'may belong in world/ or now/');
    case 'proposal': return { d: { kind: 'pending', target: PROPOSALS_TARGET }, review: null };
    case 'dropped': return { d: { kind: 'dropped', group: e.group ?? 'insight' }, review: null };
    case 'retired': return { d: { kind: 'retired', reason: e.reason ?? 'machinery' }, review: null };
    case 'unpromoted': return { d: { kind: 'retired', reason: e.reason ?? 'unpromoted work' }, review: e.reason === NOT_A_STORE_FOLDER ? 'not a schema folder: move it out of .cortex/ before removing .cortex/ (or decide it in the plan)' : null };
    default: return { d: { kind: 'unmapped' }, review: null };
  }
}

const WORLD = new Set<string>(WORLD_FOLDERS);
const HISTORY = new Set<string>(HISTORY_FOLDERS);

/** Why `rel` cannot be a 4.0 target (layout S1, naming S2), or null. */
export function targetProblem(rel: string): string | null {
  if (rel.startsWith(RAW_PREFIX)) return /(^|\/)\.\.?(\/|$)/.test(rel) || rel.endsWith('/') ? 'not a raw file path' : null;
  if (!rel.endsWith('.md')) return 'a target must be a .md file';
  const parts = rel.split('/');
  const { module, folder } = classify(rel);
  if (!module || !folder) return 'not a folder of the 4.0 layout';
  if (module === 'world' && !WORLD.has(parts[1]!)) return `world/${parts[1]} is not a world folder`;
  if (module === 'history' && !HISTORY.has(parts[1]!)) return `history/${parts[1]} is not a history folder`;
  const stem = path.posix.basename(rel, '.md');
  if (module === 'history') return /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stem) ? null : 'history files are <YYYY-MM-DD>-<slug>.md';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stem) || /^\d{4}-\d{2}-\d{2}-/.test(stem)) return 'not a kebab-case name without a date';
  if (module === 'code' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[1]!)) return 'code area is not kebab-case';
  return null;
}

export type PlanValue = string | { target: string; file: string };
export type PlanFile = Record<string, PlanValue>;

export interface PlanResult { planned: Planned[]; errors: string[]; folderKeys: { key: string; decided: number }[] }

export function readPlanFile(file: string): { plan: PlanFile | null; error: string | null } {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return { plan: null, error: `plan ${file} is not a JSON object` };
    for (const [k, v] of Object.entries(data)) {
      const digest = v !== null && typeof v === 'object' && !Array.isArray(v) && typeof (v as Record<string, unknown>)['target'] === 'string' && typeof (v as Record<string, unknown>)['file'] === 'string';
      if (typeof v !== 'string' && !digest) return { plan: null, error: `plan entry ${k} must map to a target path, "retired", or { "target", "file" }` };
    }
    return { plan: data as PlanFile, error: null };
  } catch (e) {
    return { plan: null, error: `plan ${file} does not parse: ${(e as Error).message}` };
  }
}

export interface PlanOptions {
  /** Project root: digest files must sit inside it (relative paths resolve against it). */
  root: string;
  fileDate: FileDate;
  today: string;
}

/** Proposal items of a digest: one per `## <id>: <title>` heading outside fences. */
export function proposalItems(body: string): ProposalItem[] {
  const lines = body.split('\n');
  const fenced = fencedLines(lines);
  const starts: number[] = [];
  lines.forEach((l, i) => { if (!fenced[i] && /^##\s+[A-Z][A-Za-z0-9]*-[A-Za-z0-9-]+\s*:/.test(l)) starts.push(i); });
  return starts.map((st, k) => {
    const m = /^##\s+([A-Z][A-Za-z0-9]*-[A-Za-z0-9-]+)\s*:\s*(.*)$/.exec(lines[st]!)!;
    return { id: m[1]!, title: m[2]!.trim(), body: lines.slice(st + 1, starts[k + 1] ?? lines.length).join('\n').replace(/^\n+/, '').replace(/\s+$/, '') };
  });
}

/** Fill in the 3.x text of an entry read without it (retired, unpromoted, dropped), so a plan can rescue it. */
function withText(e: Entry, legacyDir: string): Entry {
  if (e.body !== '' || e.files.length !== 1 || !e.files[0]!.endsWith('.md')) return e;
  const parsed = parseFile(fs.readFileSync(path.join(legacyDir, e.files[0]!), 'utf8'));
  const body = parsed.body;
  const lead = body.split('\n').map((x) => x.trim()).find((x) => x !== '') ?? e.stem;
  return { ...e, fm: { ...(parsed.frontmatter ?? {}), ...e.fm }, body, title: String(parsed.frontmatter?.['title'] ?? lead.replace(/^#+\s*/, '')) };
}

export function planMigration(legacy: LegacyStore, plan: PlanFile | null, opts: PlanOptions): PlanResult {
  const errors: string[] = [];
  const byRef = new Map(legacy.entries.map((e) => [e.ref, e]));
  const exact = new Map<string, PlanValue>();
  const folders: { key: string; prefix: string; value: PlanValue; decided: number }[] = [];
  const digests = new Map<string, { file: string; body: string }>();
  for (const [key, value] of Object.entries(plan ?? {})) {
    if (key.endsWith('/**')) {
      const prefix = key.slice(0, -2);
      if (value !== 'retired' && !(typeof value === 'string' && value.startsWith(RAW_PREFIX) && value.endsWith('/'))) errors.push(`plan folder key ${key}: its value must be "retired" or a ${RAW_PREFIX}<folder>/ path`);
      else if (!legacy.entries.some((e) => e.ref.startsWith(prefix))) errors.push(`plan folder key ${key} matches no entry`);
      else folders.push({ key, prefix, value, decided: 0 });
      continue;
    }
    const e = byRef.get(key);
    if (!e) {
      errors.push(`plan ref ${key} matches no entry`);
      continue;
    }
    exact.set(key, value);
    const target = typeof value === 'string' ? value : value.target;
    if (target === 'retired') continue;
    const p = targetProblem(target);
    if (p) errors.push(`plan target ${target} (for ${key}): ${p}`);
    if (target.startsWith(RAW_PREFIX) && e.files.length !== 1) errors.push(`plan target ${target} (for ${key}): a raw rescue takes a single-file entry`);
    const nonMd = e.files.length === 1 && !e.files[0]!.endsWith('.md');
    if (typeof value === 'string' && nonMd && !target.startsWith(RAW_PREFIX)) errors.push(`plan target ${target} (for ${key}): ${e.files[0]} is not markdown, so it is rescued only as raw or as a digest`);
    if (typeof value !== 'string') {
      const abs = path.resolve(opts.root, value.file);
      const rel = path.relative(path.resolve(opts.root), abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) errors.push(`plan digest file ${value.file} (for ${key}) is outside the project`);
      else if (!fs.existsSync(abs)) errors.push(`plan digest file ${value.file} (for ${key}) does not exist`);
      else {
        const body = fs.readFileSync(abs, 'utf8');
        if (/^---\r?\n/.test(body)) errors.push(`plan digest file ${value.file} (for ${key}) carries frontmatter; migrate writes all of it`);
        else digests.set(key, { file: value.file, body });
      }
    }
  }
  const planned = legacy.entries.map((orig): Planned => {
    const date = dateChain(orig, opts.fileDate, opts.today);
    const def = defaultDisposition(orig, legacy.entries, date);
    const undecided = orig.row === 'unpromoted';
    const base: Planned = { entry: orig, disposition: def.d, review: def.review, fromPlan: false, ...(undecided ? { undecided: true } : {}) };
    if (errors.length) return base;
    let over: PlanValue | undefined = exact.get(orig.ref);
    let folderKey: string | undefined;
    if (over === undefined) {
      const f = folders.filter((x) => orig.ref.startsWith(x.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
      if (f) {
        f.decided++;
        folderKey = f.key;
        over = f.value === 'retired' ? 'retired' : `${f.value as string}${orig.ref.slice(f.prefix.length)}`;
      }
    }
    if (over === undefined) return base;
    if (over === 'retired') return { entry: orig, disposition: { kind: 'retired', reason: 'retired by the plan file' }, review: null, fromPlan: true, ...(folderKey ? { folderKey } : {}) };
    const e = withText(orig, legacy.dir);
    const target = typeof over === 'string' ? over : over.target;
    const targets = [target];
    // A decision keeps its change event when it stays a decision.
    if (e.row === 'decision' && target.startsWith('world/decisions/') && def.d.kind === 'migrated') targets.push(def.d.targets[1]!);
    const out: Planned = { entry: e, disposition: { kind: 'migrated', targets }, review: target.startsWith(RAW_PREFIX) ? 'raw rescue: kept only in the gitignored raw folder' : null, fromPlan: true, ...(folderKey ? { folderKey } : {}) };
    if (target.startsWith(RAW_PREFIX)) out.rawRescue = true;
    const dg = digests.get(orig.ref);
    if (dg) {
      out.digest = dg;
      if (target === PROPOSALS_TARGET) {
        out.items = proposalItems(dg.body);
        if (!out.items.length) errors.push(`plan digest file ${dg.file} (for ${orig.ref}) targets ${PROPOSALS_TARGET} but has no "## <id>: <title>" heading`);
        out.disposition = { kind: 'pending', target: PROPOSALS_TARGET };
      }
    }
    return out;
  });
  // Proposal ids are unique across now/proposals.md (S-NNN entries and digest items).
  const ids = new Map<string, string>();
  for (const p of planned) {
    const own = p.entry.row === 'proposal' && p.disposition.kind === 'pending' && !p.fromPlan ? [p.entry.ref] : [];
    for (const id of [...own, ...(p.items ?? []).map((i) => i.id)]) {
      if (ids.has(id)) errors.push(`proposal id ${id} is used twice in ${PROPOSALS_TARGET} (${ids.get(id)} and ${p.entry.ref})`);
      else ids.set(id, p.entry.ref);
    }
  }
  return { planned, errors, folderKeys: folders.map((f) => ({ key: f.key, decided: f.decided })) };
}

// ---------------------------------------------------------------- building

export interface BuildContext {
  /** Short sha the `migrated:` origins are pinned to. */
  sha: string;
  /** Apply date, `YYYY-MM-DD`. */
  today: string;
  /** `YYYY-MM-DD` of the last commit touching a 3.x file, for entries with no date field. */
  fileDate: (legacyRel: string) => string | null;
  /** `--visibility`: overrides the 3.x `visibility.repo` in the written `cortex.json`. */
  visibility?: string;
}

export interface ProvenanceRef { entry: string; target: string; resolved: string | null }

const MAPPED_FIELDS = new Set(['id', 'title', 'term', 'name', 'aliases', 'provenance', 'derives_from', 'sessions', 'session', 'sources', 'definition', 'governs', 'stated_intent', 'landing']);

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Block-style YAML for the carried 3.x fields (any nesting). */
export function dumpYaml(v: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return v.map((x) => {
      if (x !== null && typeof x === 'object') {
        const inner = dumpYaml(x, indent + 2).split('\n');
        return `${pad}- ${inner[0]!.trimStart()}${inner.length > 1 ? '\n' + inner.slice(1).join('\n') : ''}`;
      }
      return `${pad}- ${scalar(x)}`;
    }).join('\n');
  }
  if (v !== null && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>);
    if (!entries.length) return '{}';
    return entries.map(([k, x]) => {
      if (x !== null && typeof x === 'object' && (Array.isArray(x) ? x.length : Object.keys(x).length)) return `${pad}${k}:\n${dumpYaml(x, indent + 2)}`;
      return `${pad}${k}: ${x !== null && typeof x === 'object' ? (Array.isArray(x) ? '[]' : '{}') : scalar(x)}`;
    }).join('\n');
  }
  return pad + scalar(v);
}

function scalar(x: unknown): string {
  if (x instanceof Date) return x.toISOString();
  if (typeof x === 'string' && x.includes('\n')) return JSON.stringify(x);
  return yamlScalar(x);
}

function carried(e: Entry): string {
  const rest = Object.fromEntries(Object.entries(e.fm).filter(([k]) => !MAPPED_FIELDS.has(k) && k !== e.dateField));
  if (!Object.keys(rest).length) return '';
  return `\n\n<!-- 3.x fields of ${e.ref}, carried verbatim by cortex migrate -->\n\`\`\`yaml\n${dumpYaml(rest)}\n\`\`\``;
}

function aboutOf(text: string): string {
  const one = text.replace(/\s+/g, ' ').replace(/\*\*/g, '').trim();
  if (one.length <= 160) return one;
  const cut = one.slice(0, 159);
  return cut.slice(0, cut.lastIndexOf(' ') > 80 ? cut.lastIndexOf(' ') : 159) + '…';
}

const METHOD: Partial<Record<Entry['row'], 'told' | 'observed' | 'inferred'>> = {
  'bug-resolved': 'observed', 'bug-open': 'observed', evidence: 'observed', observation: 'observed', source: 'observed', document: 'observed',
  dropped: 'inferred', unpromoted: 'observed', retired: 'observed',
};

function permanenceOf(target: string): string {
  const m = target.split('/')[0];
  return m === 'history' ? 'stable' : m === 'now' ? 'volatile' : 'changing';
}

interface Contribution { p: Planned; target: string; role: 'main' | 'change-event' }

function entryDate(e: Entry, ctx: BuildContext): string {
  return dateChain(e, ctx.fileDate, ctx.today);
}

/** Rule 13: each provenance reference of an entry, resolved to an origin value or left dangling. */
export function provenanceRefs(p: Planned, byFile: Map<string, Planned>, sha: string): ProvenanceRef[] {
  const raw: string[] = [];
  const prov = p.entry.fm['provenance'];
  if (Array.isArray(prov)) for (const x of prov) if (x && typeof x === 'object' && 'derives_from' in x) raw.push(String((x as Record<string, unknown>)['derives_from']));
  if (typeof p.entry.fm['derives_from'] === 'string') raw.push(p.entry.fm['derives_from'] as string);
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : []);
  raw.push(...list(p.entry.fm['sessions']), ...list(p.entry.fm['session']));
  // Atlas `sources:` are paths relative to the file (`../sources/x.md`), or session refs.
  const fileDir = path.posix.dirname(p.entry.files[0]!);
  for (const s of list(p.entry.fm['sources'])) raw.push(/^claude-sessions\//.test(s) || !s.startsWith('.') ? s : path.posix.normalize(path.posix.join(fileDir, s)));
  return [...new Set(raw)].map((t) => {
    const s = /^claude-sessions\/[^/]+\/([A-Za-z0-9._-]+)$/.exec(t);
    if (s) return { entry: p.entry.ref, target: t, resolved: `session:${s[1]}` };
    const rel = t.replace(/^\.?\/?\.cortex\//, '').replace(/^\.\//, '');
    const hit = byFile.get(rel);
    if (!hit || hit.disposition.kind !== 'migrated') return { entry: p.entry.ref, target: t, resolved: null };
    const primary = hit.disposition.targets[0]!;
    return { entry: p.entry.ref, target: t, resolved: primary.startsWith('history/sources/') ? `source:${primary}` : `migrated:${hit.entry.ref}@${sha}` };
  });
}

export interface BuiltTree {
  /** cortex-relative path → content; raw copies are bytes. */
  files: Map<string, string | Buffer>;
  provenance: ProvenanceRef[];
  /** `.cortex`-relative file → the raw path it was copied to (Rule 15). */
  rawCopies: Map<string, string>;
}

/**
 * Rule 15: where each raw file of a source goes. One raw keeps
 * `raw/<digest-stem><ext>`; several go under `raw/<digest-stem>/` at their
 * paths inside the 3.x folder. Returns [3.x file, raw path] pairs and the
 * digest's `raw:` value.
 */
export function rawLayout(e: Entry, target: string): { pairs: [string, string][]; field: string | null } {
  const raws = e.raw ?? [];
  if (!raws.length) return { pairs: [], field: null };
  const digestStem = path.posix.basename(target, '.md');
  if (raws.length === 1) {
    const r = raws[0]!;
    const name = path.posix.basename(r);
    let ext: string | null = null;
    if (e.row === 'document') ext = /^source(\..+)$/.exec(name)?.[1] ?? null;
    else if (e.row === 'source') ext = name.slice(name.split('.')[0]!.length) || null;
    if (ext) {
      const rel = `${RAW_PREFIX}${digestStem}${ext}`;
      return { pairs: [[r, rel]], field: rel };
    }
  }
  const baseDir = e.row === 'document' ? `${e.ref}/` : 'atlas/sources/';
  const folder = `${RAW_PREFIX}${digestStem}/`;
  return { pairs: raws.map((r) => [r, `${folder}${r.startsWith(baseDir) ? r.slice(baseDir.length) : path.posix.basename(r)}`]), field: folder };
}

function draftAppliesWhen(title: string): string {
  const t = title.replace(/\.$/, '');
  return `When the agent does work this rule governs: ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
}

export function buildTree(legacy: LegacyStore, planned: Planned[], ctx: BuildContext): BuiltTree {
  const files = new Map<string, string | Buffer>();
  const byFile = new Map<string, Planned>();
  for (const p of planned) for (const f of p.entry.files) byFile.set(f, p);
  const contributions = new Map<string, Contribution[]>();
  const push = (target: string, c: Contribution): void => {
    if (!contributions.has(target)) contributions.set(target, []);
    contributions.get(target)!.push(c);
  };
  const provenance: ProvenanceRef[] = [];
  const originsOf = new Map<string, string[]>();
  const rawCopies = new Map<string, string>();
  for (const p of planned) {
    if (p.disposition.kind !== 'migrated' && p.disposition.kind !== 'pending') continue;
    const refs = provenanceRefs(p, byFile, ctx.sha);
    provenance.push(...refs);
    const origin = [`migrated:${p.entry.ref}@${ctx.sha}`, ...refs.flatMap((r) => (r.resolved ? [r.resolved] : []))];
    originsOf.set(p.entry.ref, origin);
    if (p.rawRescue && p.disposition.kind === 'migrated') {
      const t = p.disposition.targets[0]!;
      files.set(t, fs.readFileSync(path.join(legacy.dir, p.entry.files[0]!)));
      rawCopies.set(p.entry.files[0]!, t);
      continue;
    }
    if (p.items) {
      // A proposals digest: one Rule 10 item per heading, each carrying the report's origin.
      for (const it of p.items) {
        const item: Planned = { ...p, entry: { ...p.entry, ref: it.id, id: it.id, title: it.title, body: it.body, row: 'proposal' } };
        originsOf.set(it.id, origin);
        push(PROPOSALS_TARGET, { p: item, target: PROPOSALS_TARGET, role: 'main' });
      }
      continue;
    }
    if (p.disposition.kind === 'pending') push(p.disposition.target, { p, target: p.disposition.target, role: 'main' });
    else p.disposition.targets.forEach((t, i) => push(t, { p, target: t, role: i === 0 ? 'main' : 'change-event' }));
  }

  for (const [target, cs] of [...contributions].sort(([a], [b]) => a.localeCompare(b))) {
    if (target === CONFIG_TARGET) {
      const legacyVis = (legacy.config?.['visibility'] ?? { repo: 'unknown', allow: [] }) as Record<string, unknown>;
      const vis = ctx.visibility ? { ...legacyVis, repo: ctx.visibility, allow: Array.isArray(legacyVis['allow']) ? legacyVis['allow'] : [] } : legacyVis;
      files.set(CONFIG_TARGET, JSON.stringify({ schemaVersion: '4.0', visibility: vis, migration: { from: legacy.version, accepted: null } }, null, 2) + '\n');
      continue;
    }
    if (target === PROPOSALS_TARGET && cs.every((c) => c.p.entry.row === 'proposal')) {
      files.set(target, buildProposals(cs, ctx, originsOf));
      continue;
    }
    files.set(target, buildFile(target, cs, ctx, originsOf));
    for (const c of cs) {
      if (c.role !== 'main') continue;
      for (const [r, rel] of rawLayout(c.p.entry, target).pairs) {
        files.set(rel, fs.readFileSync(path.join(legacy.dir, r)));
        rawCopies.set(r, rel);
      }
    }
  }
  return { files, provenance, rawCopies };
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

function buildProposals(cs: Contribution[], ctx: BuildContext, originsOf: Map<string, string[]>): string {
  const until = addDays(ctx.today, 30);
  const fm = frontmatterText({
    about: 'Proposals carried over from the 3.x store, waiting for a decision',
    permanence: 'volatile',
    verified: `${ctx.today} (observed)`,
    origin: dedupe(cs.flatMap((c) => originsOf.get(c.p.entry.ref) ?? [])),
    aliases: cs.map((c) => c.p.entry.ref),
  });
  // A proposal's own `##`/`###` headings (outside fences) would split its now/ item, so they move down two levels.
  const nest = (text: string): string => {
    const lines = text.split('\n');
    const fenced = fencedLines(lines);
    return lines.map((l, i) => (!fenced[i] && /^#{2,4}\s/.test(l) ? `##${l}` : l)).join('\n');
  };
  const items = cs.map((c) => `## ${c.p.entry.ref}: ${c.p.entry.title}\nuntil: ${until}\nstatus: pending decision\n\n${nest(c.p.entry.body.trim())}`);
  return `${fm}\n# Proposals waiting for a decision\n\n${items.join('\n\n')}\n`;
}

function buildFile(target: string, cs: Contribution[], ctx: BuildContext, originsOf: Map<string, string[]>): string {
  const main = cs[0]!;
  const e = main.p.entry;
  const multi = cs.length > 1;
  const folder = target.split('/').slice(0, 2).join('/');
  const module = target.split('/')[0];
  const dates = cs.map((c) => entryDate(c.p.entry, ctx)).sort();
  const latest = dates[dates.length - 1]!;
  const method = main.p.digest ? 'inferred' : (METHOD[e.row] ?? 'told');

  let about: string;
  if (target === PREFERENCES_TARGET && multi) about = 'How the user wants work done here: working preferences and conventions';
  else if (target === AUTHORITY_TARGET) about = 'What the agent may decide on its own, and what it must bring to the user';
  else if (main.role === 'change-event') about = aboutOf(`Decision recorded: ${e.title}`);
  else about = aboutOf(multi ? `${e.title} (and ${cs.length - 1} more)` : e.title);

  const fm: Record<string, unknown> = { about, permanence: permanenceOf(target), verified: `${latest} (${method})` };
  fm['origin'] = dedupe(cs.flatMap((c) => originsOf.get(c.p.entry.ref) ?? []));
  const need = dedupe(cs.flatMap((c) => (Array.isArray(c.p.entry.fm['affects']) ? (c.p.entry.fm['affects'] as unknown[]).map(String).filter((a) => a.includes('/')) : [])));
  if (need.length) fm['need'] = need;
  const aliases = dedupe(cs.filter((c) => c.role === 'main').flatMap((c) => {
    const x = c.p.entry;
    const out: string[] = [];
    if (x.id) out.push(x.id);
    if (x.files.length === 1 && !x.ref.includes('#') && x.row !== 'intent' && path.posix.basename(target, '.md') !== x.stem) out.push(x.stem);
    if (x.row === 'term' && Array.isArray(x.fm['aliases'])) out.push(...(x.fm['aliases'] as unknown[]).map(String));
    return out;
  }));
  if (aliases.length) fm['aliases'] = aliases;

  if (folder === 'world/rules') {
    if (target === AUTHORITY_TARGET) {
      fm['applies_when'] = 'The agent is about to decide whether to act on its own or bring a question to the user first';
      fm['scope'] = ['action', 'agent-answer'];
    } else {
      fm['applies_when'] = draftAppliesWhen(e.title);
      fm['scope'] = ['action'];
    }
    const governs = Array.isArray(e.fm['governs']) ? (e.fm['governs'] as unknown[]).map(String) : [];
    fm['match'] = { commands: [], paths: governs };
    fm['source'] = `user@${latest}`;
  }
  if (folder === 'history/changes') {
    if (main.role === 'change-event') {
      fm['kind'] = 'decision-change';
      fm['status'] = 'recorded';
      fm['decision'] = (main.p.disposition as { targets: string[] }).targets[0];
    } else if (e.row === 'intent') {
      fm['kind'] = 'change-request';
      fm['status'] = String(e.fm['status'] ?? 'open');
      if (typeof e.fm['landing'] === 'string') fm['spec'] = (e.fm['landing'] as string).split('#')[0];
      if (typeof e.fm['stated_intent'] === 'string') fm['source'] = e.fm['stated_intent'];
    } else {
      fm['kind'] = 'other';
      fm['status'] = 'migrated';
    }
  }
  if (folder === 'history/sources') {
    fm['captured'] = latest;
    const raw = rawLayout(e, target).field;
    if (raw) fm['raw'] = raw;
    const ext = typeof e.fm['origin'] === 'string' ? (e.fm['origin'] as string).replace(/\s+/g, ' ').trim() : '';
    if (ext) (fm['origin'] as string[]).push(`external:${ext.length > 120 ? ext.slice(0, 119) + '…' : ext}`);
  }
  if (module === 'code' && e.row === 'bug-open' && cs.every((c) => c.p.entry.row === 'bug-open')) fm['status'] = 'open';

  const bodyOf = (c: Contribution): string => {
    const x = c.p.entry;
    if (c.role === 'change-event') {
      const dec = (c.p.disposition as { targets: string[] }).targets[0]!;
      return `Decision recorded on ${entryDate(x, ctx)}: ${x.title}.\n\nThe current answer is in [${dec}](${dec}).`;
    }
    if (c.p.digest) return c.p.digest.body.trim();
    let text = x.body.trim();
    if (x.row === 'source' && x.noMeta && !text) text = `The original is kept as a raw file (\`raw:\` above): ${x.files.join(', ')}.`;
    if (x.row === 'term' && typeof x.fm['definition'] === 'string') text = `${String(x.fm['definition']).trim()}${text ? `\n\n${text}` : ''}`;
    if (x.row === 'intent') text = `> ${String(x.fm['stated_intent'] ?? '')}`;
    if (folder === 'world/decisions' && !multi) {
      return `## Answer\n\n${text}\n\n## Why\n\nThe reasons are part of the answer above: a 3.x narrative decision, migrated verbatim.\n\n## Rejected\n\nnone recorded${carried(x)}`;
    }
    return `${text}${carried(x)}`;
  };
  let body: string;
  if (!multi) body = bodyOf(main);
  else {
    // Rule 5: merged entries keep source order, each under the `##` section it sat under in 3.x, so a
    // block's meaning ("Ask first" vs "Apply directly") survives. A whole-file entry gets its own section.
    const parts: string[] = [];
    let last: string | null | undefined;
    for (const c of cs) {
      const x = c.p.entry;
      const heading = x.ref.includes('#') ? x.section : aboutOf(x.title).slice(0, 100);
      if (heading !== last && heading) parts.push(`## ${heading}`);
      last = heading;
      parts.push(bodyOf(c));
    }
    body = parts.join('\n\n');
  }
  if (folder === 'world/rules' && body.trim() === '') body = e.title;
  return `${frontmatterText(fm)}\n${body.replace(/\s+$/, '')}\n`;
}

export { isoDate };
