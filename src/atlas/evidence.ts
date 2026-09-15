/**
 * The shared evidence writer (schema §4.3 — `atlas/evidence/`, new at 3.4;
 * spec `atlas.evidence` Rule 4). Every producer of an evidence file goes
 * through here so the three of them cannot drift on the artefact shape:
 *
 *   - `cortex usage --record`               (src/pulse/usage.ts, human verb)
 *   - `cortex thread promote --to atlas/evidence` (src/pulse/thread-cli.ts, human verb)
 *   - `pulse-accept` of an `evidence-candidate`  (src/pulse/review.ts — the payload
 *     is the loop's, but the directory and its `_index.md` are created here)
 *
 * `evidenceFilePayload` renders the §4.3 frontmatter in the Rule 1 field order
 * (`id`, `title`, `date`, `kind`, `instrument`, `window`, `findings`,
 * `bears_on`, then the optional `supersedes` and `provenance`) followed by the
 * narrative body; `ensureEvidenceDir` creates `atlas/evidence/` with the
 * shipped `_index.md` when absent (RULES 9 — the directory never exists
 * without its index); `latestEvidenceMatching` finds the previous
 * `*-<suffix>.md` for the `supersedes` re-measurement chain.
 *
 * Deterministic Core (R-001): string rendering and fs only. No LLM, no
 * network, no subprocess.
 */
import * as fs from 'fs';
import * as path from 'path';
import { CORTEX_INDEXES } from '../cli/templates.js';

/** Schema §4.3's `kind` enum. */
export const EVIDENCE_KINDS = ['measurement', 'experiment', 'audit'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** The directory, `.cortex`-relative. */
export const EVIDENCE_DIR = 'atlas/evidence';

/** One typed finding (§4.3): a metric name, a number-or-string value, an optional unit. */
export interface EvidenceFinding {
  metric: string;
  value: number | string;
  unit?: string;
}

/** Everything a producer decides; the writer renders it. */
export interface EvidenceFields {
  /** The filename stem after the date: `<YYYY-MM-DD>-<slug>.md`. */
  slug: string;
  title: string;
  kind: EvidenceKind;
  /** What produced the numbers: `pulse.usage`, `session`, `cortex validate`, a script name. */
  instrument: string;
  /** Iso-dates or datetimes; `sessions` is the denominator. */
  window: { from: string; to: string; sessions?: number };
  findings: EvidenceFinding[];
  /** Non-empty (§6) — what the finding is about. */
  bearsOn: string[];
  /** Paths relative to the evidence file — the re-measurement chain. Omitted when empty. */
  supersedes?: string[];
  /** `derives_from` citations, one per entry. Omitted when empty. */
  provenance?: string[];
  /** The narrative; a trailing newline is normalised to exactly one. */
  body: string;
}

/**
 * The `atlas/evidence/_index.md` template, byte-identical to
 * `CORTEX_INDEXES['atlas/evidence']` (core-cli.init, plan Task 2.6). Kept here
 * as the fallback so this writer works before the templates entry lands;
 * `ensureEvidenceDir` prefers the shipped template when present.
 */
const EVIDENCE_INDEX_FALLBACK = `# Evidence — index

**Read this when:** you need the number behind a claim — a usage figure, an audit
count, a measured before/after — or before re-measuring something.

**What's here:**
- \`YYYY-MM-DD-<slug>.md\` — one dated measurement, experiment or audit: what was
  measured (\`findings\`), over what window and denominator, with what \`instrument\`,
  and what it \`bears_on\`.

**How to navigate:** follow \`bears_on:\` to the rule, spec or clause the number is
about; \`supersedes:\` walks the re-measurement chain (newest wins); decisions cite a
file here via \`sources:\`.
`;

/**
 * A YAML scalar: plain when it is unambiguously a string in plain style, else
 * JSON-quoted — so `schema:§5` (non-ASCII), `"55"` (would read as a number),
 * `true`/`null` and anything with `: ` or leading `-` round-trip as strings.
 */
function yamlScalar(v: string): string {
  const plainSafe = /^[A-Za-z0-9_.\/@+][A-Za-z0-9_.\/@:+-]*$/.test(v) && !/: |^-|\s$/.test(v);
  const readsAsOtherType = /^(?:[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|true|false|null|yes|no|on|off|~|\.inf|\.nan)$/i.test(v);
  return plainSafe && !readsAsOtherType ? v : JSON.stringify(v);
}

function yamlValue(v: number | string): string {
  return typeof v === 'number' ? String(v) : yamlScalar(v);
}

/**
 * The target path and file content for `fields` dated `now` (Rule 4). The
 * frontmatter follows schema §4.3's field order; `title` is always JSON-quoted
 * (it is free text); `supersedes` and `provenance` are omitted when empty.
 */
export function evidenceFilePayload(fields: EvidenceFields, now: Date): { targetRel: string; payload: string } {
  const date = now.toISOString().slice(0, 10);
  const stem = `${date}-${fields.slug}`;
  const targetRel = `.cortex/${EVIDENCE_DIR}/${stem}.md`;

  const lines: string[] = [
    '---',
    `id: evidence.${stem}`,
    `title: ${JSON.stringify(fields.title)}`,
    `date: ${now.toISOString()}`,
    `kind: ${fields.kind}`,
    `instrument: ${yamlScalar(fields.instrument)}`,
    'window:',
    `  from: ${yamlScalar(fields.window.from)}`,
    `  to: ${yamlScalar(fields.window.to)}`,
  ];
  if (fields.window.sessions !== undefined) lines.push(`  sessions: ${fields.window.sessions}`);

  lines.push('findings:');
  for (const f of fields.findings) {
    lines.push(`  - metric: ${yamlScalar(f.metric)}`, `    value: ${yamlValue(f.value)}`);
    if (f.unit !== undefined) lines.push(`    unit: ${yamlScalar(f.unit)}`);
  }

  lines.push('bears_on:', ...fields.bearsOn.map((ref) => `  - ${yamlScalar(ref)}`));

  const supersedes = fields.supersedes ?? [];
  if (supersedes.length > 0) lines.push('supersedes:', ...supersedes.map((p) => `  - ${yamlScalar(p)}`));

  const provenance = fields.provenance ?? [];
  if (provenance.length > 0) lines.push('provenance:', ...provenance.map((c) => `  - derives_from: ${yamlScalar(c)}`));

  lines.push('---', '', fields.body.replace(/\n+$/, ''), '');
  return { targetRel, payload: lines.join('\n') };
}

/**
 * `mkdir -p .cortex/atlas/evidence/` and write its `_index.md` from the
 * shipped template when absent (RULES 9, `check.index-present`). Never
 * overwrites an existing index; touches nothing else. Returns the absolute
 * directory path.
 */
export function ensureEvidenceDir(root: string): string {
  const dir = path.join(root, '.cortex', ...EVIDENCE_DIR.split('/'));
  fs.mkdirSync(dir, { recursive: true });
  const indexPath = path.join(dir, '_index.md');
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, CORTEX_INDEXES[EVIDENCE_DIR] ?? EVIDENCE_INDEX_FALLBACK, 'utf-8');
  }
  return dir;
}

/**
 * The lexicographically greatest basename `*-<suffix>.md` in
 * `atlas/evidence/`, or `undefined` when the directory is absent or holds no
 * match — the `supersedes` target of the next recording (relative to the
 * evidence file, which is the same directory, so the basename is the path).
 */
export function latestEvidenceMatching(root: string, suffix: string): string | undefined {
  const dir = path.join(root, '.cortex', ...EVIDENCE_DIR.split('/'));
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return undefined;
  }
  const matches = names.filter((n) => n.endsWith(`-${suffix}.md`)).sort();
  return matches.length === 0 ? undefined : matches[matches.length - 1];
}
