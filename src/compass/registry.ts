/**
 * The id registry — `.cortex/compass/registry.md` (schema §4.1, §4.2, §10.4;
 * spec schema.id-registry, 3.4 fifth revision). Every `R-NNN` and `B-NNN` is
 * issued by appending one line `<id> <slug>` to this committed, append-only
 * file, so two branches that allocate the same next number conflict in git
 * instead of passing `cortex validate` as two files with one id (B-019).
 *
 * Writers (Rule 4): `cortex id next`, `cortex thread promote --to
 * compass/bugs`, `cortex pulse-accept` landing a new rule file, and the
 * once-only creation by `cortex sync` / `cortex init` (Rule 6). Loops only
 * read it (RULES.md rule 7).
 *
 * Deterministic Core (R-001): fs/path, a numeric max, one append. No git —
 * the merge conflict is git's, not ours.
 */
import * as fs from 'fs';
import * as path from 'path';

export const REGISTRY_FILE = '.cortex/compass/registry.md';

/** Rule 1's header, verbatim — shared by the migration, the scaffold and the tests. */
export const REGISTRY_HEADER = `# Id registry — append-only

One line per issued rule or bug id: \`<id> <slug>\`. Allocate by appending the next number
at the end of its kind's block; never renumber, reorder or delete a line. A merge conflict
in this file is the point — two branches issued the same id.
`;

export type IdKind = 'rule' | 'bug';

const PREFIX: Record<IdKind, 'R' | 'B'> = { rule: 'R', bug: 'B' };
const DIR: Record<IdKind, string> = { rule: 'rules', bug: 'bugs' };

/** Rule 1's line grammar: `<id> <slug>`, `\d{3,}`, `[a-z0-9-]+`. */
export const REGISTRY_LINE_RE = /^([RB])-(\d{3,}) ([a-z0-9-]+)$/;
/** A line that starts like an id — used to tell a malformed id line from header prose. */
const ID_SHAPED_RE = /^[RB]-/;
/** A compass rule/bug filename: `R-NNN-<slug>.md` or bare `R-NNN.md`. */
const FILE_RE = /^([RB])-(\d{3,})(?:-(.+))?\.md$/;

export interface RegistryLine {
  id: string;
  slug: string;
  /** 1-based line number in the file. */
  line: number;
}

export interface ParsedRegistry {
  lines: RegistryLine[];
  malformed: { line: number; text: string }[];
  duplicates: { id: string; lines: number[] }[];
}

export interface DiskFile {
  id: string;
  number: number;
  slug: string;
  file: string;
}

export function registryPath(root: string): string {
  return path.join(root, REGISTRY_FILE);
}

export function formatId(kind: IdKind, n: number): string {
  return `${PREFIX[kind]}-${String(n).padStart(3, '0')}`;
}

export function kindOfId(id: string): IdKind | undefined {
  if (/^R-\d{3,}$/.test(id)) return 'rule';
  if (/^B-\d{3,}$/.test(id)) return 'bug';
  return undefined;
}

function numberOf(id: string): number {
  return parseInt(id.slice(2), 10);
}

/**
 * Normalise free text to the line grammar (`[a-z0-9-]+`); empty → `reserved`.
 * The slug is informational (the check never compares it to the filename).
 */
export function registrySlug(text: string | undefined): string {
  const slug = (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'reserved';
}

function normaliseNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/**
 * Parse the registry text. Blank lines and `#` lines are ignored; the header
 * prose is skipped (verbatim `REGISTRY_HEADER` when present, else every
 * non-id-shaped line before the first id-shaped one); everything else must
 * match Rule 1's grammar or is reported malformed with its line number.
 */
export function parseRegistry(text: string): ParsedRegistry {
  const normalised = normaliseNewlines(text);
  const rows = normalised.split('\n');
  const lines: RegistryLine[] = [];
  const malformed: { line: number; text: string }[] = [];
  const seen = new Map<string, number[]>();

  let headerEnd = 0;
  if (normalised.startsWith(REGISTRY_HEADER)) {
    headerEnd = REGISTRY_HEADER.split('\n').length - 1; // rows covered by the header
  }
  let inHeader = headerEnd === 0;

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]!;
    const lineNo = i + 1;
    if (i < headerEnd) continue;
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (inHeader && !ID_SHAPED_RE.test(trimmed)) continue; // unrecognised header prose
    inHeader = false;
    const m = REGISTRY_LINE_RE.exec(raw);
    if (!m) {
      malformed.push({ line: lineNo, text: raw });
      continue;
    }
    const id = `${m[1]}-${m[2]}`;
    lines.push({ id, slug: m[3]!, line: lineNo });
    const at = seen.get(id);
    if (at) at.push(lineNo);
    else seen.set(id, [lineNo]);
  }

  const duplicates: { id: string; lines: number[] }[] = [];
  for (const [id, at] of seen) if (at.length > 1) duplicates.push({ id, lines: at });
  return { lines, malformed, duplicates };
}

/** The rule or bug files on disk for a kind, ascending by number (then filename). */
export function filesOnDisk(root: string, kind: IdKind): DiskFile[] {
  const dir = path.join(root, '.cortex', 'compass', DIR[kind]);
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: DiskFile[] = [];
  for (const name of names) {
    const m = FILE_RE.exec(name);
    if (!m || m[1] !== PREFIX[kind]) continue;
    out.push({ id: `${m[1]}-${m[2]}`, number: parseInt(m[2]!, 10), slug: m[3] === undefined ? 'reserved' : registrySlug(m[3]), file: path.join(dir, name) });
  }
  out.sort((a, b) => a.number - b.number || a.file.localeCompare(b.file));
  return out;
}

/** The id numbers carried by filenames on disk for a kind, ascending. */
export function idsOnDisk(root: string, kind: IdKind): number[] {
  return filesOnDisk(root, kind).map((f) => f.number);
}

function diskEntries(root: string): { rules: string[]; bugs: string[] } {
  const dedupe = (files: DiskFile[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const f of files) {
      if (seen.has(f.id)) continue; // two files with one id: check.xref-unique's finding, one line here
      seen.add(f.id);
      out.push(`${f.id} ${f.slug}`);
    }
    return out;
  };
  return { rules: dedupe(filesOnDisk(root, 'rule')), bugs: dedupe(filesOnDisk(root, 'bug')) };
}

function renderRegistry(entries: string[]): string {
  return entries.length === 0 ? `${REGISTRY_HEADER}\n` : `${REGISTRY_HEADER}\n${entries.join('\n')}\n`;
}

/**
 * Rule 6's migration text: the header, then every `R-*.md` and `B-*.md` on
 * disk as `<id> <slug>` — rules ascending, then bugs ascending; the slug from
 * the filename after `<id>-`, or `reserved` for a bare `R-NNN.md`.
 */
export function buildRegistryFromDisk(root: string): string {
  const { rules, bugs } = diskEntries(root);
  return renderRegistry([...rules, ...bugs]);
}

/** The parsed registry, or null when the file is absent. Never writes. */
export function readRegistry(root: string): ParsedRegistry | null {
  let text: string;
  try {
    text = fs.readFileSync(registryPath(root), 'utf-8');
  } catch {
    return null;
  }
  return parseRegistry(text);
}

/** The parsed registry, built in memory from disk when absent. Never writes. */
export function readOrBuildRegistry(root: string): ParsedRegistry {
  return readRegistry(root) ?? parseRegistry(buildRegistryFromDisk(root));
}

/**
 * Create the registry from disk when absent (Rule 6; `core-cli.sync` Rule 15,
 * `core-cli.init` Rule 3). When present: an existence check only — no read,
 * no write, never regenerated or re-sorted. Counts are those written.
 */
export function ensureRegistry(root: string): { created: boolean; rules: number; bugs: number } {
  const file = registryPath(root);
  if (fs.existsSync(file)) return { created: false, rules: 0, bugs: 0 };
  const { rules, bugs } = diskEntries(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, renderRegistry([...rules, ...bugs]), 'utf-8');
  return { created: true, rules: rules.length, bugs: bugs.length };
}

/**
 * Insert `entry` into `text` at the end of its kind's block: a rule after the
 * last `R-` line (before the first `B-` line when there is none; at the end
 * when there is neither), a bug at the end. `\n` endings, one trailing newline.
 */
function insertLine(text: string, kind: IdKind, entry: string): string {
  const rows = normaliseNewlines(text).split('\n');
  if (rows.length > 0 && rows[rows.length - 1] === '') rows.pop(); // the trailing newline
  const isRule = (r: string): boolean => /^R-\d{3,} /.test(r);
  const isBug = (r: string): boolean => /^B-\d{3,} /.test(r);
  const hasIdLine = rows.some((r) => isRule(r) || isBug(r));
  if (hasIdLine) while (rows.length > 0 && rows[rows.length - 1]!.trim() === '') rows.pop();

  let at = rows.length;
  if (kind === 'rule') {
    let lastRule = -1;
    let firstBug = -1;
    rows.forEach((r, i) => {
      if (isRule(r)) lastRule = i;
      if (isBug(r) && firstBug < 0) firstBug = i;
    });
    if (lastRule >= 0) at = lastRule + 1;
    else if (firstBug >= 0) at = firstBug;
  }
  rows.splice(at, 0, entry);
  return `${rows.join('\n')}\n`;
}

function readText(root: string): string {
  return fs.readFileSync(registryPath(root), 'utf-8');
}

function writeText(root: string, text: string): void {
  const file = registryPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf-8');
}

/**
 * Rule 2 — allocate the next id of `kind`: the highest number across the
 * registry AND the files on disk, plus one, appended as `<id> <slug|reserved>`
 * at the end of the kind's block. Creates the registry from disk first when
 * absent, so a pre-registry project never falls back to the old scheme.
 * Numbers are zero-padded to three digits and never reused.
 */
export function allocateId(root: string, kind: IdKind, slug?: string): string {
  ensureRegistry(root);
  const text = readText(root);
  const parsed = parseRegistry(text);
  let max = 0;
  for (const l of parsed.lines) if (kindOfId(l.id) === kind) max = Math.max(max, numberOf(l.id));
  for (const n of idsOnDisk(root, kind)) max = Math.max(max, n);
  const id = formatId(kind, max + 1);
  writeText(root, insertLine(text, kind, `${id} ${registrySlug(slug)}`));
  return id;
}

/** The registry line carrying `id`, from the file or (absent) from disk in memory. Never writes. */
export function findRegistered(root: string, id: string): RegistryLine | undefined {
  return readOrBuildRegistry(root).lines.find((l) => l.id === id);
}

export type RegisterResult = { status: 'appended' } | { status: 'already-registered' } | { status: 'conflict'; line: RegistryLine };

/**
 * Rule 4 — register an id a writer already chose (a new rule file landing
 * through `pulse-accept`). Creates the registry from disk first when absent.
 * Same id and slug (or a `reserved` line, claimable by any slug) → nothing
 * appended; same id under a different slug → `conflict`, nothing written.
 */
export function registerId(root: string, id: string, slug: string): RegisterResult {
  const kind = kindOfId(id);
  if (kind === undefined) throw new Error(`not a rule or bug id: ${id}`);
  ensureRegistry(root);
  const text = readText(root);
  const existing = parseRegistry(text).lines.find((l) => l.id === id);
  const wanted = registrySlug(slug);
  if (existing) {
    if (existing.slug === wanted || existing.slug === 'reserved') return { status: 'already-registered' };
    return { status: 'conflict', line: existing };
  }
  writeText(root, insertLine(text, kind, `${id} ${wanted}`));
  return { status: 'appended' };
}
