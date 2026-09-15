/**
 * The `bears_on` ref grammar and resolver (schema §6 — the forward edge, new
 * at 3.4; spec `schema.bears-on` Rules 1–3). Shared by every carrier:
 * `check.bears-on` (decisions and evidence), the recall compiler
 * (`recall.recall-index`) and the constellation compiler's edge classification
 * (`constellation.compiler` Rule 10).
 *
 * A ref is classified by SHAPE, in a fixed order, to exactly one kind; each
 * kind resolves through a different surface:
 *
 *   rule / bug / domain / id → the project-global index (`ProjectIndex`, §6 rule 4)
 *   concept                  → `.cortex/insight/concepts/<slug>.md` or any
 *                              `.cortex/insight/scopes/<scope>/concepts/<slug>.md`
 *   clause                   → the per-run clause index (`schema.schema-clauses`)
 *   path                     → a file OR directory relative to the project root;
 *                              absolute paths and `..` segments never resolve
 *
 * Severity is fixed here for every carrier (Rule 3): an unresolved gated kind
 * (rule, bug, domain, id) is an `error`; concept, clause and path miss at
 * `warning` — a concept may not be extracted yet, a file may have moved, a
 * clause may be stale (§6.2). Read-only, deterministic (R-001): file existence
 * and set lookup. No LLM, no network.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { ProjectIndex } from './index-build.js';
import { CLAUSE_REF_RE, clauseNumber, clauseResolves, type ClauseIndex } from './clauses.js';

export type RefKind = 'rule' | 'bug' | 'domain' | 'concept' | 'clause' | 'path' | 'id';

/** Rule 3's gated kinds — an unresolved ref of one of these is an error on a gated carrier. */
export const GATED_KINDS: ReadonlySet<RefKind> = new Set<RefKind>(['rule', 'bug', 'domain', 'id']);

export const RULE_RE = /^R-\d{3,}$/;
export const BUG_RE = /^B-\d{3,}$/;
export const DOMAIN_RE = /^domain\.[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const CONCEPT_RE = /^concept:[a-z0-9][a-z0-9-]*$/;

const CONCEPT_PREFIX = 'concept:';
const INSIGHT_DIR = ['.cortex', 'insight'] as const;

export interface RefResolution {
  kind: RefKind;
  resolved: boolean;
  /** The project-relative path (gated kinds, concept, path) or the clause number (clause) — present only when resolved. */
  target?: string;
}

/**
 * Rule 1 — total and ordered. Every non-empty string classifies; the order
 * only matters where shapes could overlap (`domain.x` before `id`; a path
 * containing `R-001` is a path). The empty string is the carrier's to reject
 * as malformed (Rule 5); it classifies as `id` here so the function stays total.
 */
export function classifyRef(ref: string): RefKind {
  if (RULE_RE.test(ref)) return 'rule';
  if (BUG_RE.test(ref)) return 'bug';
  if (DOMAIN_RE.test(ref)) return 'domain';
  if (CONCEPT_RE.test(ref)) return 'concept';
  if (CLAUSE_REF_RE.test(ref)) return 'clause';
  if (ref.includes('/') || ref.startsWith('.')) return 'path';
  return 'id';
}

/** Backslashes → `/`, leading `./` stripped (Rule 2's path form; the recall index's subject key). */
export function normalisePathRef(ref: string): string {
  let out = ref.replace(/\\/g, '/');
  while (out.startsWith('./')) out = out.slice(2);
  return out;
}

/** Rule 3 — one table, one place; a carrier never invents its own severity. */
export function refSeverity(kind: RefKind): 'error' | 'warning' {
  return GATED_KINDS.has(kind) ? 'error' : 'warning';
}

function toPosixRelative(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}

function resolveConcept(root: string, slug: string): string | undefined {
  const flat = path.join(root, ...INSIGHT_DIR, 'concepts', `${slug}.md`);
  if (fs.existsSync(flat)) return toPosixRelative(root, flat);

  const scopesDir = path.join(root, ...INSIGHT_DIR, 'scopes');
  let scopes: string[];
  try {
    scopes = fs.readdirSync(scopesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return undefined; // no scoped layout — not an error
  }
  for (const scope of scopes) {
    const scoped = path.join(scopesDir, scope, 'concepts', `${slug}.md`);
    if (fs.existsSync(scoped)) return toPosixRelative(root, scoped);
  }
  return undefined;
}

function resolvePath(root: string, ref: string): string | undefined {
  const normalised = normalisePathRef(ref);
  if (normalised === '' || path.isAbsolute(normalised) || path.posix.isAbsolute(normalised)) return undefined;
  if (normalised.split('/').some((segment) => segment === '..')) return undefined;
  const abs = path.join(root, ...normalised.split('/'));
  return fs.existsSync(abs) ? normalised : undefined; // file or directory
}

/** Rule 2 — resolution by kind. `target` is present only when resolved. */
export function resolveRef(root: string, index: ProjectIndex, clauses: ClauseIndex, ref: string): RefResolution {
  const kind = classifyRef(ref);
  let target: string | undefined;

  switch (kind) {
    case 'rule':
    case 'bug':
    case 'domain':
    case 'id': {
      const abs = index.idToPath.get(ref);
      target = abs === undefined ? undefined : toPosixRelative(root, abs);
      break;
    }
    case 'concept':
      target = resolveConcept(root, ref.slice(CONCEPT_PREFIX.length));
      break;
    case 'clause':
      target = clauseResolves(clauses, ref) ? clauseNumber(ref) : undefined;
      break;
    case 'path':
      target = resolvePath(root, ref);
      break;
  }

  return target === undefined ? { kind, resolved: false } : { kind, resolved: true, target };
}
