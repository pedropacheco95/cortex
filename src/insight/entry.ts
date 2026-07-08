/**
 * Insight v3 per-file understanding entry — frontmatter + section contract
 * (spec insight.storage-format Rule 2; cortex-schema.md §4.10.2; design §5.5).
 *
 * One entry per source file, path-mirrored under `insight/anatomy/` (or
 * `insight/scopes/<scope>/anatomy/`). An L3 entry is rich (Purpose / Main
 * players / Insights / optional File map / Connections / Query pointers); an
 * L2 entry is light (Purpose + Connections only).
 *
 * Pure module: NO fs, NO LLM (R-001). Callers read files; these helpers only
 * inspect already-in-memory content.
 */
import matter from 'gray-matter';
import { isIsoDatetime, isSha256, type ParseResult } from './storage.js';

// ---------------------------------------------------------------------------
// Enums + section vocabulary (§4.10.2).
// ---------------------------------------------------------------------------

export const CENTRALITY_LEVELS = ['high', 'medium', 'low'] as const;
export type Centrality = (typeof CENTRALITY_LEVELS)[number];

export const EXTRACTION_LEVELS = [2, 3] as const;
export type ExtractionLevel = (typeof EXTRACTION_LEVELS)[number];

/** The full section vocabulary, in canonical order. */
export const ENTRY_SECTIONS = [
  'Purpose',
  'Main players',
  'Insights',
  'File map',
  'Connections',
  'Query pointers',
] as const;

/** L3 minimum (§4.10.2): Purpose + Main players + Connections. `## File map`
 *  absent below the ~500-line threshold is not an error. */
export const L3_REQUIRED_SECTIONS = ['Purpose', 'Main players', 'Connections'] as const;

/** L2 (lighter) entry: Purpose + Connections only. */
export const L2_REQUIRED_SECTIONS = ['Purpose', 'Connections'] as const;

export function isCentrality(v: unknown): v is Centrality {
  return typeof v === 'string' && (CENTRALITY_LEVELS as readonly string[]).includes(v);
}

export function isExtractionLevel(v: unknown): v is ExtractionLevel {
  return v === 2 || v === 3;
}

// ---------------------------------------------------------------------------
// Interfaces.
// ---------------------------------------------------------------------------

export interface InsightEntryFrontmatter {
  /** Project-relative source path. */
  path: string;
  extracted_at: string;
  extraction_level: ExtractionLevel;
  size_lines: number;
  size_tokens: number;
  centrality: Centrality;
  /** The commit at extraction — the per-entry half of the staleness ledger. */
  built_at_commit: string;
  /** sha256 of the SOURCE FILE BODY, never the entry frontmatter (§4.10.4). */
  source_sha256: string;
}

export interface InsightEntry {
  frontmatter: InsightEntryFrontmatter;
  /** `## `-heading titles present in the body, in document order. */
  sections: string[];
  /** The markdown body (without frontmatter). */
  body: string;
}

// ---------------------------------------------------------------------------
// parseEntry — deterministic, pure.
// ---------------------------------------------------------------------------

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** Extract `## `-level section titles from a markdown body. */
export function entrySections(body: string): string[] {
  const sections: string[] = [];
  for (const line of body.split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m?.[1]) sections.push(m[1]);
  }
  return sections;
}

/**
 * Parse + shape-validate a per-file understanding entry (§4.10.2): required
 * frontmatter present and typed; `extraction_level` in {2,3}; `centrality` in
 * enum; `source_sha256` 64-hex; the level's minimum sections present.
 */
export function parseEntry(raw: string): ParseResult<InsightEntry> {
  let data: Record<string, unknown>;
  let body: string;
  try {
    const parsed = matter(raw);
    data = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch (e) {
    return { ok: false, errors: [`unparseable frontmatter: ${(e as Error).message}`] };
  }

  const errors: string[] = [];

  if (typeof data['path'] !== 'string' || data['path'].trim() === '') {
    errors.push('frontmatter "path" must be a non-empty project-relative source path');
  }
  if (!isIsoDatetime(data['extracted_at'])) {
    errors.push('frontmatter "extracted_at" must be a non-empty ISO datetime');
  }
  if (!isExtractionLevel(data['extraction_level'])) {
    errors.push('frontmatter "extraction_level" must be 2 or 3');
  }
  if (!isInt(data['size_lines'])) errors.push('frontmatter "size_lines" must be an integer');
  if (!isInt(data['size_tokens'])) errors.push('frontmatter "size_tokens" must be an integer');
  if (!isCentrality(data['centrality'])) {
    errors.push(`frontmatter "centrality" must be one of ${CENTRALITY_LEVELS.join(' | ')}`);
  }
  if (typeof data['built_at_commit'] !== 'string' || data['built_at_commit'].trim() === '') {
    errors.push('frontmatter "built_at_commit" must be a non-empty string');
  }
  if (!isSha256(data['source_sha256'])) {
    errors.push('frontmatter "source_sha256" must be exactly 64 lowercase hex characters (hash of the source file body)');
  }

  const sections = entrySections(body);
  const level = data['extraction_level'];
  if (isExtractionLevel(level)) {
    const required = level === 3 ? L3_REQUIRED_SECTIONS : L2_REQUIRED_SECTIONS;
    for (const section of required) {
      if (!sections.includes(section)) {
        errors.push(`missing required section "## ${section}" for an L${level} entry`);
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const extractedAt = data['extracted_at'];
  const frontmatter: InsightEntryFrontmatter = {
    path: data['path'] as string,
    extracted_at: extractedAt instanceof Date ? extractedAt.toISOString() : (extractedAt as string),
    extraction_level: level as ExtractionLevel,
    size_lines: data['size_lines'] as number,
    size_tokens: data['size_tokens'] as number,
    centrality: data['centrality'] as Centrality,
    built_at_commit: data['built_at_commit'] as string,
    source_sha256: data['source_sha256'] as string,
  };
  return { ok: true, value: { frontmatter, sections, body } };
}
