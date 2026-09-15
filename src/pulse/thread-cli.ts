/**
 * `cortex thread list|drop|close|promote` — the human verbs over the threads
 * ledger (`pulse.threads` Rules 10–13; schema §4.5.3). Dispatched from
 * `src/cli/cli.ts` under the pulse migration chokepoint; builds only on the
 * batch-0 primitives in `./threads.ts`.
 *
 * Exit codes: 0 done; 1 the thread is unknown or not `open`, or promote's
 * target already exists (nothing written); 2 usage (bad verb or flag, missing
 * `--by`/`--to`/`--type`, no resolvable `affects`) — nothing written.
 *
 * `list`, `drop` and `close` write only under `.cortex/pulse/`. `promote` is
 * the one verb with the standing of `pulse-accept`: a human-invoked draft of a
 * gated file — `atlas/decisions/<date>-<slug>.md` (schema §4.3, via the
 * session-observe `decisionFilePayload` shape), `compass/bugs/B-NNN-<slug>.md`
 * (§4.2), or — 3.4 — `atlas/evidence/<date>-<slug>.md` (§4.3, `atlas.evidence`
 * Rule 6: a `finding` thread of kind measurement, `--finding <metric>=<value>`
 * required, `--bears-on` optional, via the shared evidence writer) — never
 * clobbering, then marking the thread answered with `resolved_by` = the new
 * file.
 *
 * Deterministic Core (R-001): fs/path only; no LLM, no network, no subprocess.
 */
import * as fs from 'fs';
import * as path from 'path';
import { decisionFilePayload, decisionSlug, provenanceUser } from '../insight/session-observe.js';
import { ensureEvidenceDir, evidenceFilePayload, type EvidenceFinding } from '../atlas/evidence.js';
import {
  THREAD_STATUSES,
  type Thread,
  type ThreadStatus,
  listThreads,
  threadPath,
  parseThreadFile,
  keyText,
  threadSlug,
  updateThreadStatus,
} from './threads.js';

/** The DRAFT line every promoted file opens with (Rule 12): `<prefix> T-NNN by …`. */
export const DRAFT_LINE_PREFIX = '> DRAFT — promoted from';

/** Schema §4.2's seven-type bug taxonomy (the `--type` enum). */
export const BUG_TYPES = [
  'missing-criterion',
  'incomplete-rule',
  'wrong-rule',
  'missing-dev-spec',
  'missing-business-spec',
  'layer-drift',
  'test-defect',
] as const;

/** The `--to` targets promote knows (Rule 12; `atlas/evidence` live at 3.4). */
const PROMOTE_TARGETS = ['atlas/decisions', 'compass/bugs', 'atlas/evidence'] as const;
/** `title` is the key text cut to this many characters (Rule 12; also the `list` column). */
const TITLE_CHARS = 80;
/** The body line that marks a finding thread as a measurement (`atlas.evidence` Rule 6). */
const MEASUREMENT_KIND_LINE = '**Kind:** measurement';
/** `--finding <metric>=<value>` — a non-empty metric, `=`, a non-empty value. */
const FINDING_RE = /^([^=]+)=(.+)$/;

const USAGE = [
  'usage: cortex thread list [--status open|answered|dropped|expired] [--touching <path-or-id>]',
  '       cortex thread drop T-NNN',
  '       cortex thread close T-NNN --by <path>',
  '       cortex thread promote T-NNN --to atlas/decisions',
  '       cortex thread promote T-NNN --to compass/bugs --type <bug type> [--affects <path-or-id>]...',
  '       cortex thread promote T-NNN --to atlas/evidence --finding <metric>=<value>... [--bears-on <ref>]...',
].join('\n');

export interface ThreadCliOptions {
  /** Clock for `answered`, `date`, `opened` and the decision filename date (default: wall clock). */
  now?: Date;
  /** Provenance `<user>` segment fallback when a citation carries none (default: the OS username). */
  user?: string;
}

// ---------------------------------------------------------------------------
// flag parsing
// ---------------------------------------------------------------------------

/**
 * Pull `--flag value` pairs out of `argv`. A flag without a value (end of argv,
 * or the next token starts with `-`) records `''`. Repeatable flags collect
 * every value; a single flag keeps the last. Everything else is positional.
 */
function parseFlags(argv: string[], repeatable: readonly string[] = []): { positional: string[]; flags: Map<string, string[]> } {
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith('--')) {
      positional.push(a);
      continue;
    }
    const next = argv[i + 1];
    const value = next !== undefined && !next.startsWith('-') ? next : '';
    if (value !== '') i++;
    const bucket = flags.get(a) ?? [];
    if (repeatable.includes(a)) bucket.push(value);
    else bucket.splice(0, bucket.length, value);
    flags.set(a, bucket);
  }
  return { positional, flags };
}

function usage(message: string): number {
  console.error(`cortex thread: ${message}\n${USAGE}`);
  return 2;
}

function isStatus(v: string): v is ThreadStatus {
  return (THREAD_STATUSES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// shared: resolve a thread that a status-changing verb may act on (Rule 10)
// ---------------------------------------------------------------------------

/** The parsed thread for `id`, or null when no parseable ledger file exists. */
function loadThread(root: string, id: string): Thread | null {
  const file = threadPath(root, id);
  if (file === null) return null;
  try {
    return parseThreadFile(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Rule 10: a verb applied to an unknown thread, or to one in a terminal
 * state, prints the current status and exits 1 without writing. Returns the
 * open thread, or the exit code to return.
 */
function requireOpen(root: string, id: string | undefined, verb: string): Thread | number {
  if (id === undefined || id === '') return usage(`${verb} requires a thread id (e.g. T-001).`);
  const t = loadThread(root, id);
  if (t === null) {
    console.error(`cortex thread ${verb}: unknown thread ${id}. Nothing done.`);
    return 1;
  }
  if (t.status !== 'open') {
    console.error(`cortex thread ${verb}: ${id} is ${t.status}${t.resolved_by !== undefined ? ` (resolved_by: ${t.resolved_by})` : ''}; only open threads change status. Nothing done.`);
    return 1;
  }
  return t;
}

// ---------------------------------------------------------------------------
// list (Rule 11)
// ---------------------------------------------------------------------------

function listVerb(argv: string[], root: string): number {
  const { positional, flags } = parseFlags(argv);
  if (positional.length > 0) return usage(`list takes no positional arguments (got "${positional.join(' ')}").`);
  for (const key of flags.keys()) {
    if (key !== '--status' && key !== '--touching') return usage(`unknown flag ${key}.`);
  }
  const status = flags.get('--status')?.[0] ?? 'open';
  if (!isStatus(status)) {
    return usage(`--status must be one of ${THREAD_STATUSES.join('|')} (got "${status}").`);
  }
  const touchingValues = flags.get('--touching');
  const touching = touchingValues?.[0];
  if (touchingValues !== undefined && (touching === undefined || touching === '')) {
    return usage('--touching requires a path or id prefix.');
  }

  const { threads } = listThreads(root);
  const rows = threads
    .filter((t) => t.status === status)
    .filter((t) => touching === undefined || t.bears_on.some((e) => e.startsWith(touching)))
    .sort((a, b) => Date.parse(a.opened) - Date.parse(b.opened) || a.id.localeCompare(b.id, 'en', { numeric: true }));
  if (rows.length === 0) {
    console.log('No threads.');
    return 0;
  }
  for (const t of rows) {
    console.log(`${t.id}  ${t.kind}  ${t.opened.slice(0, 10)}  ${keyText(t).slice(0, TITLE_CHARS)}`);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// drop, close (Rules 10, 11)
// ---------------------------------------------------------------------------

function dropVerb(argv: string[], root: string): number {
  const { positional, flags } = parseFlags(argv);
  if (flags.size > 0) return usage(`drop takes no flags (got ${[...flags.keys()].join(' ')}).`);
  const t = requireOpen(root, positional[0], 'drop');
  if (typeof t === 'number') return t;
  updateThreadStatus(root, t.id, { status: 'dropped' });
  console.log(`Dropped ${t.id}.`);
  return 0;
}

function closeVerb(argv: string[], root: string, now: Date): number {
  const { positional, flags } = parseFlags(argv);
  for (const key of flags.keys()) {
    if (key !== '--by') return usage(`unknown flag ${key}.`);
  }
  const t = requireOpen(root, positional[0], 'close');
  if (typeof t === 'number') return t;
  const by = flags.get('--by')?.[0];
  if (by === undefined || by === '') return usage('close requires --by <path> (the project-relative path that resolves the thread, stored as given).');
  const answered = now.toISOString();
  updateThreadStatus(root, t.id, { status: 'answered', answered, resolved_by: by });
  console.log(`Closed ${t.id}: answered ${answered}, resolved_by ${by}.`);
  return 0;
}

// ---------------------------------------------------------------------------
// promote (Rule 12)
// ---------------------------------------------------------------------------

/** `claude-sessions/<user>/<id>` → its two segments, or null when not that shape. */
function splitCitation(citation: string): { user: string; id: string } | null {
  const m = /^claude-sessions\/([^/\s]+)\/([^/\s]+)$/.exec(citation);
  return m === null ? null : { user: m[1] as string, id: m[2] as string };
}

/** The DRAFT line + blank line + the thread body verbatim (Rule 12). */
function draftBody(t: Thread): string {
  return `${DRAFT_LINE_PREFIX} ${t.id} by \`cortex thread promote\`; review before relying on it.\n\n${t.body}`;
}

/**
 * The §4.3 decision draft: `decisionFilePayload`'s target grammar and
 * frontmatter (id, JSON-quoted title, date, provenance from the trail), with
 * `confidence: INFERRED` inserted after `date:` — the one line the observe
 * payload does not carry. Provenance session ids come from the trail's
 * citations; the `<user>` segment is the opener's (fallback: `user`).
 */
function decisionDraft(t: Thread, now: Date, user: string): { targetRel: string; payload: string } {
  const split = t.sessions.map(splitCitation);
  const opener = split.find((s) => s !== null) ?? null;
  const sessionIds = split.filter((s): s is { user: string; id: string } => s !== null).map((s) => s.id);
  const { targetRel, payload } = decisionFilePayload(
    {
      type: 'decision-candidate',
      title: keyText(t).slice(0, TITLE_CHARS),
      reasoning: draftBody(t),
      sessionIds: sessionIds.length > 0 ? sessionIds : [t.id],
    },
    now,
    opener?.user ?? user,
    t.bears_on, // pulse.threads Rule 12 (3.4): the drafted decision carries the thread's subjects
  );
  return { targetRel, payload: payload.replace(/^(date: [^\n]*\n)/m, '$1confidence: INFERRED\n') };
}

/** Next unused `B-NNN` after the highest `B-\d+` filename on disk (mirrors `nextRuleId`). */
function nextBugId(root: string): string {
  const bugsDir = path.join(root, '.cortex', 'compass', 'bugs');
  let existing: string[] = [];
  try {
    existing = fs.readdirSync(bugsDir);
  } catch {
    existing = [];
  }
  let max = 0;
  for (const name of existing) {
    const m = /^B-(\d{3,})(?:-|\.md$)/.exec(name);
    if (m?.[1]) max = Math.max(max, parseInt(m[1], 10));
  }
  return `B-${String(max + 1).padStart(3, '0')}`;
}

/** A YAML scalar: plain when safe as such, else JSON-quoted (mirrors the ledger writer). */
function yamlScalar(v: string): string {
  const plainSafe = /^[A-Za-z0-9_.\/@+][A-Za-z0-9_.\/@:+-]*$/.test(v) && !/: |^-|\s$/.test(v);
  return plainSafe ? v : JSON.stringify(v);
}

/** True when `entry` is a project-relative path that exists under `root`. */
function resolvesOnDisk(root: string, entry: string): boolean {
  if (entry === '' || path.isAbsolute(entry) || entry.split(/[\\/]/).includes('..')) return false;
  try {
    return fs.existsSync(path.join(root, entry));
  } catch {
    return false;
  }
}

/** The §4.2 bug draft: next id, required type, medium/open, `affects`, DRAFT body. */
function bugDraft(root: string, t: Thread, now: Date, type: string, affects: string[]): { targetRel: string; payload: string } {
  const id = nextBugId(root);
  const title = keyText(t).slice(0, TITLE_CHARS);
  const targetRel = `.cortex/compass/bugs/${id}-${threadSlug(title)}.md`;
  const payload = [
    '---',
    `id: ${id}`,
    `title: ${JSON.stringify(title)}`,
    `type: ${type}`,
    'severity: medium',
    'status: open',
    'affects:',
    ...affects.map((a) => `  - ${yamlScalar(a)}`),
    `opened: ${now.toISOString()}`,
    '---',
    '',
    draftBody(t),
    '',
  ].join('\n');
  return { targetRel, payload };
}

/**
 * `--finding metric=value` → a typed finding: the value is a number when the
 * text parses as one, else the string as given (`atlas.evidence` Rule 6).
 * Null when the flag does not match the grammar.
 */
function parseFinding(raw: string): EvidenceFinding | null {
  const m = FINDING_RE.exec(raw);
  if (m === null) return null;
  const metric = (m[1] as string).trim();
  const text = (m[2] as string).trim();
  if (metric === '' || text === '') return null;
  const value = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(text) ? Number(text) : text;
  return { metric, value };
}

/** The `ended` of `pulse/sessions/<id>.json` for a trail citation, or undefined when absent/unreadable. */
function sessionEnded(root: string, citation: string): string | undefined {
  const split = splitCitation(citation);
  if (split === null) return undefined;
  try {
    const raw = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'sessions', `${split.id}.json`), 'utf-8');
    const ended = (JSON.parse(raw) as Record<string, unknown>)['ended'];
    return typeof ended === 'string' && ended !== '' ? ended : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The §4.3 evidence draft (`atlas.evidence` Rule 6): `kind: measurement`,
 * `instrument: session` (the measurement was made by hand in a session),
 * `window` from the trail's session records (`ended` of the opener and of the
 * last session; each falls back to the thread's `opened`), `sessions` = the
 * trail length, `findings` from the flags in the order given, `bears_on`,
 * `provenance` with one `derives_from` per trail citation, DRAFT body.
 */
function evidenceDraft(root: string, t: Thread, now: Date, findings: EvidenceFinding[], bearsOn: string[]): { targetRel: string; payload: string } {
  const title = keyText(t).slice(0, TITLE_CHARS);
  const first = t.sessions[0];
  const last = t.sessions[t.sessions.length - 1];
  return evidenceFilePayload(
    {
      slug: decisionSlug({ title }),
      title,
      kind: 'measurement',
      instrument: 'session',
      window: {
        from: (first === undefined ? undefined : sessionEnded(root, first)) ?? t.opened,
        to: (last === undefined ? undefined : sessionEnded(root, last)) ?? t.opened,
        sessions: t.sessions.length,
      },
      findings,
      bearsOn,
      provenance: t.sessions,
      body: draftBody(t),
    },
    now,
  );
}

function promoteVerb(argv: string[], root: string, now: Date, user: string): number {
  const { positional, flags } = parseFlags(argv, ['--affects', '--finding', '--bears-on']);
  for (const key of flags.keys()) {
    if (!['--to', '--type', '--affects', '--finding', '--bears-on'].includes(key)) return usage(`unknown flag ${key}.`);
  }
  // Grammar first (exit 2, nothing read or written), then the thread (exit 1).
  const to = flags.get('--to')?.[0];
  if (to === undefined || to === '') return usage(`promote requires --to ${PROMOTE_TARGETS.join('|')}.`);
  if (!(PROMOTE_TARGETS as readonly string[]).includes(to)) {
    return usage(`--to must be one of ${PROMOTE_TARGETS.join('|')} (got "${to}").`);
  }
  const findingValues = flags.get('--finding');
  const bearsOnValues = flags.get('--bears-on');
  if (to !== 'atlas/evidence') {
    if (findingValues !== undefined) return usage('--finding applies to --to atlas/evidence only.');
    if (bearsOnValues !== undefined) return usage('--bears-on applies to --to atlas/evidence only.');
  }
  const findings: EvidenceFinding[] = [];
  if (to === 'atlas/evidence') {
    if (findingValues === undefined || findingValues.length === 0) {
      return usage('promote --to atlas/evidence requires at least one --finding <metric>=<value> — the metric and value are a human reading of the finding text Core must not parse out of prose.');
    }
    for (const raw of findingValues) {
      const finding = parseFinding(raw);
      if (finding === null) return usage(`--finding must be <metric>=<value> (got "${raw}").`);
      findings.push(finding);
    }
    if (bearsOnValues !== undefined && bearsOnValues.some((v) => v === '')) return usage('--bears-on requires a ref.');
  }
  const typeValues = flags.get('--type');
  const type = typeValues?.[0];
  if (to === 'compass/bugs') {
    if (type === undefined || type === '') {
      return usage(`promote --to compass/bugs requires --type <${BUG_TYPES.join('|')}> — the classification is a human judgment Core must not guess.`);
    }
    if (!(BUG_TYPES as readonly string[]).includes(type)) {
      return usage(`--type must be one of ${BUG_TYPES.join('|')} (got "${type}").`);
    }
  } else if (typeValues !== undefined) {
    return usage('--type applies to --to compass/bugs only.');
  }
  const affectsValues = flags.get('--affects');
  if (affectsValues !== undefined) {
    if (to !== 'compass/bugs') return usage('--affects applies to --to compass/bugs only.');
    if (affectsValues.some((v) => v === '')) return usage('--affects requires a path or id.');
  }

  const t = requireOpen(root, positional[0], 'promote');
  if (typeof t === 'number') return t;

  let draft: { targetRel: string; payload: string };
  if (to === 'atlas/decisions') {
    draft = decisionDraft(t, now, user);
  } else if (to === 'atlas/evidence') {
    // Rule 6: only a finding thread of kind measurement becomes evidence.
    if (t.kind !== 'finding') {
      return usage(`${t.id} is a ${t.kind} thread; --to atlas/evidence needs a finding thread of kind measurement.`);
    }
    if (!t.body.split('\n').includes(MEASUREMENT_KIND_LINE)) {
      const kindLine = /^\*\*Kind:\*\*\s*(.*)$/m.exec(t.body);
      return usage(`${t.id} is a finding of kind ${kindLine?.[1]?.trim() || 'unknown'}; --to atlas/evidence needs a finding of kind measurement (body line "${MEASUREMENT_KIND_LINE}").`);
    }
    const bearsOn = bearsOnValues ?? t.bears_on;
    if (bearsOn.length === 0) {
      return usage(`${t.id} bears on nothing; pass --bears-on <ref> (repeatable) — check.evidence requires a non-empty bears_on.`);
    }
    draft = evidenceDraft(root, t, now, findings, bearsOn);
  } else {
    const affects = affectsValues ?? t.bears_on.filter((e) => resolvesOnDisk(root, e));
    if (affects.length === 0) {
      return usage(
        `none of ${t.id}'s bears_on entries resolves as a project-relative path (${t.bears_on.length === 0 ? 'the list is empty' : t.bears_on.join(', ')}); pass --affects <path-or-id> (repeatable) — check.bug requires resolvable entries.`,
      );
    }
    draft = bugDraft(root, t, now, type as string, affects);
  }

  const targetAbs = path.join(root, ...draft.targetRel.split('/'));
  if (fs.existsSync(targetAbs)) {
    console.error(`cortex thread promote: refusing to overwrite existing file ${draft.targetRel}. Nothing written.`);
    return 1;
  }
  if (to === 'atlas/evidence') ensureEvidenceDir(root); // the directory never exists without its _index.md (§4.3)
  fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
  fs.writeFileSync(targetAbs, draft.payload, 'utf-8');
  updateThreadStatus(root, t.id, { status: 'answered', answered: now.toISOString(), resolved_by: draft.targetRel });
  console.log(`Promoted ${t.id} → ${draft.targetRel} (draft — review before relying on it; the thread is answered).`);
  return 0;
}

// ---------------------------------------------------------------------------
// entry
// ---------------------------------------------------------------------------

/**
 * `cortex thread <verb> …`. `root` is the project root (default cwd — the
 * dispatcher passes nothing); `opts.now` / `opts.user` are testability seams.
 */
export async function threadCli(argv: string[], root = '.', opts: ThreadCliOptions = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const user = opts.user ?? provenanceUser();
  const [verb, ...rest] = argv;
  switch (verb) {
    case 'list':
      return listVerb(rest, root);
    case 'drop':
      return dropVerb(rest, root);
    case 'close':
      return closeVerb(rest, root, now);
    case 'promote':
      return promoteVerb(rest, root, now, user);
    case undefined:
      return usage('a verb is required.');
    default:
      return usage(`unknown verb "${verb}".`);
  }
}
