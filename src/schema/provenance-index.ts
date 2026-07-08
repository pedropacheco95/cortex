/**
 * Provenance scanner + backward-traversal index (schema §6, addendum A6;
 * build-order-v3 step 4; spec provenance.frontmatter-check).
 *
 * Scans the four provenance-bearing artefact kinds — compass rules, dev specs,
 * business specs, atlas decisions — for the optional `provenance:` frontmatter
 * field (a list of `- derives_from: <ref>` entries) and builds the reverse map
 * source → citing artefacts, so "what derives from this archive path / atlas
 * decision?" is answerable without a manual project-wide search.
 *
 * The index is COMPUTED ON DEMAND, never persisted: the schema constrains the
 * query contract (given a source, return every citing artefact) but mandates
 * no file shape (the spec leaves storage OPEN), and a recomputed index cannot
 * go stale. `check.provenance` (checks/provenance.ts) validates the same
 * scanned entries; this module owns the scan and the backward traversal.
 * Deterministic Core: file I/O only, no LLM calls (R-001).
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import fg from 'fast-glob';
import { SPECS_GLOB, BUSINESS_GLOB } from '../paths.js';

/** The four artefact kinds that may carry `provenance:` (schema §6, A6.1). */
export type ProvenanceKind = 'compass-rule' | 'dev-spec' | 'business-spec' | 'atlas-decision';

/** One scanned artefact carrying a `provenance:` field (well-formed or not). */
export interface ProvenanceCarrier {
  /** Absolute path of the citing artefact. */
  path: string;
  /** Frontmatter `id`, when present. */
  id?: string;
  kind: ProvenanceKind;
  /** The raw frontmatter `provenance` value — validated by check.provenance. */
  provenance: unknown;
}

/** Source ref (as written, `.cortex/`-relative form) → citing artefacts. */
export type ProvenanceIndex = Map<string, ProvenanceCarrier[]>;

const RULE_FILE_PATTERN = /^R-\d{3,}(-[A-Za-z0-9-]+)?\.md$/;

/**
 * The three source-type reference forms (schema §6, addendum A6.2).
 * Archive and atlas refs resolve on disk relative to `.cortex/`;
 * claude-sessions refs are cited-not-resolved (shape-checked only).
 */
export const ARCHIVE_REF_PATTERN = /^archive\/documents\/[^/]+\/.+$/;
export const ATLAS_DECISION_REF_PATTERN = /^atlas\/decisions\/[^/]+\.md$/;
export const CLAUDE_SESSION_REF_PATTERN = /^claude-sessions\/[^/]+\/[^/]+$/;

/** Resolve a `.cortex/`-relative archive/atlas provenance ref to an existing FILE. */
export function provenanceRefResolves(root: string, ref: string): boolean {
  const abs = path.join(root, '.cortex', ...ref.split('/'));
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * Scan the four artefact kinds for files whose frontmatter has a `provenance`
 * key. Absence of the field is not recorded — absence means "authored
 * directly" and is never a finding (A6.1).
 */
export async function scanProvenanceCarriers(root: string): Promise<ProvenanceCarrier[]> {
  const carriers: ProvenanceCarrier[] = [];

  const kinds: Array<{ kind: ProvenanceKind; files: string[] }> = [];

  // Compass rules: .cortex/compass/rules/R-NNN[-slug].md (same filter as check.rule)
  const rulesDir = path.join(root, '.cortex', 'compass', 'rules');
  const ruleFiles = fs.existsSync(rulesDir)
    ? fs.readdirSync(rulesDir).filter((f) => RULE_FILE_PATTERN.test(f)).map((f) => path.join(rulesDir, f))
    : [];
  kinds.push({ kind: 'compass-rule', files: ruleFiles });

  // Atlas decisions: .cortex/atlas/decisions/*.md (decisions are the one atlas
  // kind that carries provenance, schema §4.4)
  const decisionsDir = path.join(root, '.cortex', 'atlas', 'decisions');
  const decisionFiles = fs.existsSync(decisionsDir)
    ? await fg('*.md', { cwd: decisionsDir, absolute: true, ignore: ['_index.md', '_overview.md'] })
    : [];
  kinds.push({ kind: 'atlas-decision', files: decisionFiles });

  // Both spec trees (schema §4.6/§4.7)
  kinds.push({ kind: 'dev-spec', files: await fg(SPECS_GLOB, { cwd: root, absolute: true, dot: true }) });
  kinds.push({ kind: 'business-spec', files: await fg(BUSINESS_GLOB, { cwd: root, absolute: true, dot: true }) });

  for (const { kind, files } of kinds) {
    for (const filePath of files.sort()) {
      let data: Record<string, unknown>;
      try {
        data = matter(fs.readFileSync(filePath, 'utf-8')).data as Record<string, unknown>;
      } catch {
        continue; // unparseable frontmatter is another check's finding
      }
      if (!('provenance' in data)) continue;
      const carrier: ProvenanceCarrier = { path: filePath, kind, provenance: data['provenance'] };
      if (typeof data['id'] === 'string' && data['id']) carrier.id = data['id'];
      carriers.push(carrier);
    }
  }

  return carriers;
}

/** Extract the well-formed `derives_from` refs from a raw `provenance` value. */
export function wellFormedDerivesFrom(provenance: unknown): string[] {
  if (!Array.isArray(provenance)) return [];
  const refs: string[] = [];
  for (const entry of provenance) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const keys = Object.keys(entry as Record<string, unknown>);
    if (keys.length !== 1 || keys[0] !== 'derives_from') continue;
    const ref = (entry as Record<string, unknown>)['derives_from'];
    if (typeof ref === 'string' && ref) refs.push(ref);
  }
  return refs;
}

/**
 * Build the backward-traversal index: every `derives_from` target (keyed by
 * its as-written, `.cortex/`-relative canonical form) → the artefacts citing
 * it. All three source forms are indexed; resolution is check.provenance's
 * job, not the index's (the index answers "what depends on what").
 */
export async function buildProvenanceIndex(root: string): Promise<ProvenanceIndex> {
  const index: ProvenanceIndex = new Map();
  const carriers = await scanProvenanceCarriers(root);
  for (const carrier of carriers) {
    for (const ref of wellFormedDerivesFrom(carrier.provenance)) {
      const existing = index.get(ref);
      if (existing) {
        if (!existing.some((c) => c.path === carrier.path)) existing.push(carrier);
      } else {
        index.set(ref, [carrier]);
      }
    }
  }
  return index;
}

/**
 * The query contract (spec provenance.frontmatter-check, backward-traversal
 * ACs): given a source ref, return every artefact deriving from it. Empty
 * array when nothing cites the source.
 */
export function derivationsOf(index: ProvenanceIndex, sourceRef: string): ProvenanceCarrier[] {
  return index.get(sourceRef) ?? [];
}
