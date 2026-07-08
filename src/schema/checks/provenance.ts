/**
 * check.provenance (schema §6, addendum A6; Appendix A; build-order-v3 step 4;
 * spec provenance.frontmatter-check): validates every `provenance:` entry on
 * the four provenance-bearing artefact kinds — compass rules, dev specs,
 * business specs, atlas decisions.
 *
 * Contract (A6.1–A6.3):
 * - `provenance:` is an optional list; each entry has exactly one key,
 *   `derives_from`. Absence means "authored directly" — never a finding.
 * - Three source-type forms, `.cortex/`-relative:
 *   archive paths (`archive/documents/<slug>/...`) and atlas decisions
 *   (`atlas/decisions/<slug>.md`) MUST resolve to an existing file (error);
 *   `claude-sessions/<user>/<id>` is cited-not-resolved (shape-check only).
 * - A malformed entry (wrong key, extra key, non-string ref, or a ref
 *   matching none of the three forms) is an error.
 *
 * Own file rather than folded into xref.ts: xref owns spec-tree symmetry /
 * uniqueness / acyclicity; provenance has its own reference grammar and the
 * backward index (../provenance-index.ts), which this check shares its scan
 * with. Same reference-resolves discipline as the rest of §6.
 */
import type { Violation } from '../types.js';
import {
  scanProvenanceCarriers,
  provenanceRefResolves,
  ARCHIVE_REF_PATTERN,
  ATLAS_DECISION_REF_PATTERN,
  CLAUDE_SESSION_REF_PATTERN,
} from '../provenance-index.js';

const CLAUSE = '§6 / A6';

export async function checkProvenance(root: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const carriers = await scanProvenanceCarriers(root);

  for (const carrier of carriers) {
    const loc = { path: carrier.path, key: 'provenance' };

    if (!Array.isArray(carrier.provenance)) {
      violations.push({
        severity: 'error',
        check: 'check.provenance',
        clause: CLAUSE,
        location: loc,
        message: `"provenance" must be a list of { derives_from: <ref> } entries`,
      });
      continue;
    }

    for (const entry of carrier.provenance as unknown[]) {
      // Shape: exactly one key, `derives_from`, string value (A6.1)
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        violations.push({
          severity: 'error',
          check: 'check.provenance',
          clause: CLAUSE,
          location: loc,
          message: `provenance entry ${JSON.stringify(entry)} is not a { derives_from: <ref> } mapping`,
        });
        continue;
      }
      const keys = Object.keys(entry as Record<string, unknown>);
      if (keys.length !== 1 || keys[0] !== 'derives_from') {
        violations.push({
          severity: 'error',
          check: 'check.provenance',
          clause: CLAUSE,
          location: loc,
          message: `provenance entry must have exactly one key "derives_from" (got: ${keys.join(', ') || 'none'}) — v3 has no other relationship type`,
        });
        continue;
      }
      const ref = (entry as Record<string, unknown>)['derives_from'];
      if (typeof ref !== 'string' || !ref) {
        violations.push({
          severity: 'error',
          check: 'check.provenance',
          clause: CLAUSE,
          location: loc,
          message: `derives_from must be a non-empty string reference`,
        });
        continue;
      }

      // The three source-type forms + resolution semantics (A6.2)
      if (ARCHIVE_REF_PATTERN.test(ref)) {
        if (!provenanceRefResolves(root, ref)) {
          violations.push({
            severity: 'error',
            check: 'check.provenance',
            clause: CLAUSE,
            location: loc,
            message: `derives_from archive reference "${ref}" does not resolve to a file under .cortex/`,
          });
        }
      } else if (ATLAS_DECISION_REF_PATTERN.test(ref)) {
        if (!provenanceRefResolves(root, ref)) {
          violations.push({
            severity: 'error',
            check: 'check.provenance',
            clause: CLAUSE,
            location: loc,
            message: `derives_from atlas decision "${ref}" does not resolve to a file under .cortex/`,
          });
        }
      } else if (CLAUDE_SESSION_REF_PATTERN.test(ref)) {
        // Cited, not resolved: shape already matched; never checked on disk (A6.2).
      } else if (ref.startsWith('claude-sessions/')) {
        violations.push({
          severity: 'error',
          check: 'check.provenance',
          clause: CLAUSE,
          location: loc,
          message: `derives_from "${ref}" is not a well-formed claude-sessions reference (expected claude-sessions/<user>/<session-id>)`,
        });
      } else {
        violations.push({
          severity: 'error',
          check: 'check.provenance',
          clause: CLAUSE,
          location: loc,
          message: `derives_from "${ref}" matches none of the three source-type forms (archive/documents/<slug>/..., atlas/decisions/<slug>.md, claude-sessions/<user>/<session-id>)`,
        });
      }
    }
  }

  return violations;
}
