/**
 * Archive module formats — shared types + parse helpers for `.cortex/archive/`
 * (cortex-schema.md §4.4, §4.4.1, §4.4.2; addendum Decision 21 / A10-1). This is
 * the single source of truth the schema checks (src/schema/checks/archive.ts)
 * and, later, the `cortex-archive-ingest` skill build against.
 *
 * Pure module: NO fs, NO LLM (R-001). Callers read files; these helpers only
 * inspect already-in-memory string content.
 *
 * `metadata.yaml` and `types/*.yaml` are standalone YAML documents, not
 * markdown frontmatter. There is no direct YAML-parsing dependency in this
 * project (`js-yaml` is only a transitive dependency of `gray-matter`, not
 * resolvable under pnpm's strict node_modules) — rather than add a new
 * top-level dependency for this, `parseYamlDocument` below reuses
 * gray-matter's own YAML engine by wrapping the raw content in
 * `---`-frontmatter delimiters and reading back `.data`. The one caveat: raw
 * content containing a bare `---` line on its own would terminate the wrapper
 * early; none of the fields this module declares plausibly need one.
 */
import matter from 'gray-matter';

export interface ParseResult<T> {
  ok: boolean;
  value?: T;
  errors?: string[];
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/**
 * Non-empty ISO-8601-ish datetime. Accepts a string a `Date` accepts, or a
 * `Date` — an unquoted ISO datetime in YAML is commonly coerced to a `Date` by
 * the parser.
 */
export function isIsoDatetime(v: unknown): v is string | Date {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  if (typeof v !== 'string' || v.trim() === '') return false;
  return !Number.isNaN(Date.parse(v));
}

/** Coerce a YAML scalar that should be a `string` (schema field type) but may
 *  have been parsed as a number (e.g. an unquoted `version: 2.0`). */
export function coerceString(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim() !== '') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

/** Parse a standalone YAML document (not frontmatter) via gray-matter's engine. */
export function parseYamlDocument(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = matter(`---\n${raw}\n---\n`);
    const data = parsed.data as unknown;
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: 'YAML document must be a mapping (object) at the top level' };
    }
    return { ok: true, value: data as Record<string, unknown> };
  } catch (e) {
    return { ok: false, error: `invalid YAML: ${(e as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// §4.4.1 `archive/documents/<slug>/metadata.yaml`
// ---------------------------------------------------------------------------

export const ARCHIVE_METADATA_STATUS_ENUM = ['active', 'superseded'] as const;
export type ArchiveMetadataStatus = (typeof ARCHIVE_METADATA_STATUS_ENUM)[number];

export interface ArchiveMetadata {
  id: string;
  kind: string;
  ingested_at: string | Date;
  version: string;
  status: ArchiveMetadataStatus;
  supersedes?: string[];
  source_filename?: string;
  origin?: string;
}

export function isArchiveMetadataStatus(v: unknown): v is ArchiveMetadataStatus {
  return typeof v === 'string' && (ARCHIVE_METADATA_STATUS_ENUM as readonly string[]).includes(v);
}

/** Parse + shape-validate a `metadata.yaml` document (schema §4.4.1). Pure —
 *  callers read the file and pass its raw text. */
export function parseArchiveMetadata(raw: string): ParseResult<ArchiveMetadata> {
  const parsed = parseYamlDocument(raw);
  if (!parsed.ok) return { ok: false, errors: [parsed.error] };
  const data = parsed.value;
  const errors: string[] = [];

  const id = coerceString(data['id']);
  if (!id) errors.push('missing required field "id"');

  const kind = coerceString(data['kind']);
  if (!kind) errors.push('missing required field "kind"');

  if (!isIsoDatetime(data['ingested_at'])) errors.push('missing or non-ISO "ingested_at"');

  const version = coerceString(data['version']);
  if (!version) errors.push('missing required field "version"');

  if (!isArchiveMetadataStatus(data['status'])) {
    errors.push(`"status" must be one of ${ARCHIVE_METADATA_STATUS_ENUM.join(' | ')}`);
  }

  if (data['supersedes'] !== undefined) {
    const s = data['supersedes'];
    if (!Array.isArray(s) || s.some((x) => typeof x !== 'string')) {
      errors.push('"supersedes" must be a list of paths when present');
    }
  }

  if (data['source_filename'] !== undefined && typeof data['source_filename'] !== 'string') {
    errors.push('"source_filename" must be a string when present');
  }
  if (data['origin'] !== undefined && typeof data['origin'] !== 'string') {
    errors.push('"origin" must be a string when present');
  }

  if (errors.length > 0) return { ok: false, errors };

  const ingestedAt = data['ingested_at'];
  return {
    ok: true,
    value: {
      id: id!,
      kind: kind!,
      ingested_at: ingestedAt instanceof Date ? ingestedAt.toISOString() : (ingestedAt as string),
      version: version!,
      status: data['status'] as ArchiveMetadataStatus,
      supersedes: data['supersedes'] as string[] | undefined,
      source_filename: data['source_filename'] as string | undefined,
      origin: data['origin'] as string | undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// §4.4.2 `archive/types/*.yaml` (Decision 21 / addendum A10-1 — concrete shape)
// ---------------------------------------------------------------------------

export interface ArchiveTypeClassification {
  extensions?: string[];
  hints?: string[];
  explicit?: boolean;
}

export interface ArchiveTypeOutput {
  kind: string;
  path: string;
  item_pattern?: string;
}

export interface ArchiveTypeExtraction {
  strategy: string;
  outputs: ArchiveTypeOutput[];
}

export interface ArchiveTypeDef {
  id: string;
  label: string;
  classification: ArchiveTypeClassification;
  extraction: ArchiveTypeExtraction;
}

/** Parse + shape-validate an `archive/types/<id>.yaml` document (schema §4.4.2). */
export function parseArchiveTypeDef(raw: string): ParseResult<ArchiveTypeDef> {
  const parsed = parseYamlDocument(raw);
  if (!parsed.ok) return { ok: false, errors: [parsed.error] };
  const data = parsed.value;
  const errors: string[] = [];

  const id = coerceString(data['id']);
  if (!id) errors.push('missing required field "id"');

  const label = coerceString(data['label']);
  if (!label) errors.push('missing required field "label"');

  const classification = data['classification'];
  let classificationValue: ArchiveTypeClassification | undefined;
  if (classification === undefined || classification === null || typeof classification !== 'object' || Array.isArray(classification)) {
    errors.push('missing required field "classification"');
  } else {
    const c = classification as Record<string, unknown>;
    const extensionsOk = c['extensions'] === undefined || (Array.isArray(c['extensions']) && c['extensions'].every((x) => typeof x === 'string'));
    const hintsOk = c['hints'] === undefined || (Array.isArray(c['hints']) && c['hints'].every((x) => typeof x === 'string'));
    if (!extensionsOk) errors.push('"classification.extensions" must be a list of strings when present');
    if (!hintsOk) errors.push('"classification.hints" must be a list of strings when present');
    if (c['explicit'] !== undefined && typeof c['explicit'] !== 'boolean') {
      errors.push('"classification.explicit" must be a boolean when present');
    }
    const hasExtensions = Array.isArray(c['extensions']) && c['extensions'].length > 0;
    const hasHints = Array.isArray(c['hints']) && c['hints'].length > 0;
    const explicitTrue = c['explicit'] === true;
    if (extensionsOk && hintsOk && !hasExtensions && !hasHints && !explicitTrue) {
      errors.push('"classification" must declare at least one of "extensions", "hints", or "explicit: true"');
    }
    classificationValue = {
      extensions: c['extensions'] as string[] | undefined,
      hints: c['hints'] as string[] | undefined,
      explicit: c['explicit'] as boolean | undefined,
    };
  }

  const extraction = data['extraction'];
  let extractionValue: ArchiveTypeExtraction | undefined;
  if (extraction === undefined || extraction === null || typeof extraction !== 'object' || Array.isArray(extraction)) {
    errors.push('missing required field "extraction"');
  } else {
    const e = extraction as Record<string, unknown>;
    const strategy = coerceString(e['strategy']);
    if (!strategy) errors.push('missing required field "extraction.strategy"');

    const outputsRaw = e['outputs'];
    const outputs: ArchiveTypeOutput[] = [];
    if (!Array.isArray(outputsRaw) || outputsRaw.length === 0) {
      errors.push('"extraction.outputs" must be a non-empty list');
    } else {
      outputsRaw.forEach((o, i) => {
        const out = o as Record<string, unknown>;
        if (!out || typeof out !== 'object' || Array.isArray(out)) {
          errors.push(`extraction.outputs[${i}]: not an object`);
          return;
        }
        const kind = coerceString(out['kind']);
        if (!kind) errors.push(`extraction.outputs[${i}].kind: missing`);
        const outPath = coerceString(out['path']);
        if (!outPath) {
          errors.push(`extraction.outputs[${i}].path: missing`);
        } else if (!outPath.startsWith('extracted/')) {
          errors.push(`extraction.outputs[${i}].path: "${outPath}" must be extracted/-relative (start with "extracted/")`);
        }
        if (out['item_pattern'] !== undefined && typeof out['item_pattern'] !== 'string') {
          errors.push(`extraction.outputs[${i}].item_pattern: must be a string when present`);
        }
        if (kind && outPath) {
          outputs.push({ kind, path: outPath, item_pattern: out['item_pattern'] as string | undefined });
        }
      });
    }

    if (strategy) {
      extractionValue = { strategy, outputs };
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      id: id!,
      label: label!,
      classification: classificationValue!,
      extraction: extractionValue!,
    },
  };
}

// ---------------------------------------------------------------------------
// archive/intent-register.yaml (schema §4.4.3, new at 3.2)
// ---------------------------------------------------------------------------

/** The three statuses of an intent-register entry (schema §4.4.3). */
export const INTENT_STATUSES = ['pending', 'reconciled', 'flagged'] as const;
export type IntentStatus = (typeof INTENT_STATUSES)[number];

export interface IntentRegisterEntry {
  id: string;
  stated_intent: string;
  date: string;
  status: IntentStatus;
  stakeholder?: string;
  anchor_test: string;
  landing?: string;
  covering_spec_test?: string;
  flagged_bug?: string;
}

export interface IntentRegister {
  entries: IntentRegisterEntry[];
}

/** `IR-NNN` — the entry id form (schema §4.4.3). */
const IR_ID_RE = /^IR-\d{3,}$/;
/** ISO calendar date, `YYYY-MM-DD`. Deliberately stricter than
 *  `isIsoDatetime`: the register records the *day* an intent was stated. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A YAML date scalar may arrive as a `Date` when unquoted — render it back to
 *  `YYYY-MM-DD` so the shape check sees what the author wrote. */
function coerceIsoDate(v: unknown): string | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return coerceString(v);
}

/**
 * Parse + shape-validate `archive/intent-register.yaml` (schema §4.4.3).
 *
 * Shape only: field presence, id form, status enum, and the per-status
 * evidence requirement (`reconciled` needs `covering_spec_test`, `flagged`
 * needs `flagged_bug`, both need `landing`). Whether the links actually
 * RESOLVE is the validator check's job — it needs the project index and the
 * working tree, which this pure parser deliberately does not touch.
 */
export function parseIntentRegister(raw: string): ParseResult<IntentRegister> {
  const parsed = parseYamlDocument(raw);
  if (!parsed.ok) return { ok: false, errors: [parsed.error] };
  const data = parsed.value;
  const errors: string[] = [];

  const rawEntries = data['entries'];
  if (rawEntries === undefined || rawEntries === null) {
    return { ok: false, errors: ['missing required field "entries" (list)'] };
  }
  if (!Array.isArray(rawEntries)) {
    return { ok: false, errors: ['"entries" must be a list'] };
  }

  const entries: IntentRegisterEntry[] = [];
  const seen = new Set<string>();

  rawEntries.forEach((rawEntry, i) => {
    const label = `entries[${i}]`;
    if (rawEntry === null || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      errors.push(`${label}: must be a mapping`);
      return;
    }
    const e = rawEntry as Record<string, unknown>;

    const id = coerceString(e['id']);
    const named = id ? `${label} (${id})` : label;
    if (!id) {
      errors.push(`${label}: missing required field "id"`);
    } else if (!IR_ID_RE.test(id)) {
      errors.push(`${named}: id "${id}" is not of the form IR-NNN`);
    } else if (seen.has(id)) {
      errors.push(`${named}: duplicate entry id "${id}"`);
    } else {
      seen.add(id);
    }

    const statedIntent = coerceString(e['stated_intent']);
    if (!statedIntent) errors.push(`${named}: missing required field "stated_intent"`);

    const date = coerceIsoDate(e['date']);
    if (!date) {
      errors.push(`${named}: missing required field "date"`);
    } else if (!ISO_DATE_RE.test(date)) {
      errors.push(`${named}: date "${date}" is not an ISO calendar date (YYYY-MM-DD)`);
    }

    const anchorTest = coerceString(e['anchor_test']);
    if (!anchorTest) errors.push(`${named}: missing required field "anchor_test"`);

    const status = coerceString(e['status']);
    if (!status) {
      errors.push(`${named}: missing required field "status"`);
    } else if (!(INTENT_STATUSES as readonly string[]).includes(status)) {
      errors.push(`${named}: status "${status}" not in enum [${INTENT_STATUSES.join(', ')}]`);
    }

    const landing = coerceString(e['landing']);
    const coveringSpecTest = coerceString(e['covering_spec_test']);
    const flaggedBug = coerceString(e['flagged_bug']);

    // Per-status evidence (schema §4.4.3 status machine). `pending` is the only
    // status that may omit `landing`; each terminal status owes its own field.
    if (status === 'reconciled' || status === 'flagged') {
      if (!landing) errors.push(`${named}: status "${status}" requires "landing"`);
    }
    if (status === 'reconciled' && !coveringSpecTest) {
      errors.push(`${named}: status "reconciled" requires "covering_spec_test"`);
    }
    if (status === 'flagged' && !flaggedBug) {
      errors.push(`${named}: status "flagged" requires "flagged_bug"`);
    }

    if (id && statedIntent && date && anchorTest && status && (INTENT_STATUSES as readonly string[]).includes(status)) {
      entries.push({
        id,
        stated_intent: statedIntent,
        date,
        status: status as IntentStatus,
        anchor_test: anchorTest,
        ...(coerceString(e['stakeholder']) ? { stakeholder: coerceString(e['stakeholder'])! } : {}),
        ...(landing ? { landing } : {}),
        ...(coveringSpecTest ? { covering_spec_test: coveringSpecTest } : {}),
        ...(flaggedBug ? { flagged_bug: flaggedBug } : {}),
      });
    }
  });

  if (errors.length > 0) return { ok: false, errors, value: { entries } };
  return { ok: true, value: { entries } };
}
