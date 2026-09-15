/**
 * `check.bears-on` (schema §6 / §6.2, Appendix A — new at 3.4; spec
 * `schema.bears-on` Rules 4–6). The forward edge on the two GATED carriers:
 * every `.cortex/atlas/decisions/*.md` and `.cortex/atlas/evidence/*.md`
 * (skipping `_index.md`) whose frontmatter carries `bears_on`.
 *
 *  - `bears_on` present but not a list → one `error` at key `bears_on`
 *  - an entry that is empty, not a string, or a `schema:`-prefixed string
 *    that fails the clause grammar → one `error` ("malformed bears_on entry")
 *  - every other entry is classified and resolved by shape (`refs.ts`); an
 *    unresolved entry is one violation at `refSeverity(kind)` — `error` for
 *    rule / bug / domain / id, `warning` for concept / clause / path — whose
 *    message names the ref, its kind and (by location) the carrier file.
 *    Clause misses cite §6.2; everything else cites §6.
 *
 * Threads (`check.threads`) and observations (`check.insight-observations`)
 * are ungated and stay shape-checked only — nothing here reads them. The
 * `check.atlas` decision warnings (no `bears_on` at all; a `sources:` under
 * `pulse/`) are `check.atlas`'s and are not duplicated. The clause index is
 * loaded once by `validate()` and passed in (Rule 6); the project index is
 * the one every check receives. Read-only, deterministic (R-001).
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import fg from 'fast-glob';
import type { Violation } from '../types.js';
import type { ProjectIndex } from '../index-build.js';
import { CLAUSE_REF_RE, type ClauseIndex } from '../clauses.js';
import { classifyRef, refSeverity, resolveRef } from '../refs.js';

const CHECK = 'check.bears-on';
const KEY = 'bears_on';
const CARRIER_GLOBS = ['.cortex/atlas/decisions/*.md', '.cortex/atlas/evidence/*.md'];
const SCHEMA_PREFIX = 'schema:';

/** Rule 5's malformed shapes: non-string, empty, or `schema:`-prefixed but failing the grammar. */
function malformedReason(entry: unknown): string | undefined {
  if (typeof entry !== 'string') return `expected a string, got ${JSON.stringify(entry ?? null)}`;
  if (entry === '') return 'an empty string';
  if (entry.startsWith(SCHEMA_PREFIX) && !CLAUSE_REF_RE.test(entry)) {
    return `${JSON.stringify(entry)} does not match the clause grammar schema:§N[.M[.K]] (§6.2)`;
  }
  return undefined;
}

export async function checkBearsOn(root: string, index: ProjectIndex, clauses: ClauseIndex): Promise<Violation[]> {
  const violations: Violation[] = [];

  const files = (await fg(CARRIER_GLOBS, { cwd: root, absolute: true, dot: true, ignore: ['**/_index.md'] })).sort();

  for (const filePath of files) {
    let data: Record<string, unknown>;
    try {
      data = matter(fs.readFileSync(filePath, 'utf-8')).data as Record<string, unknown>;
    } catch {
      continue; // unparseable frontmatter is check.atlas's finding, not this one's
    }
    if (!(KEY in data)) continue;

    const push = (severity: Violation['severity'], clause: string, message: string): void => {
      violations.push({ severity, check: CHECK, clause, location: { path: filePath, key: KEY }, message });
    };

    const bearsOn = data[KEY];
    if (!Array.isArray(bearsOn)) {
      push('error', '§6', `malformed bears_on: expected a list of refs, got ${JSON.stringify(bearsOn ?? null)}`);
      continue;
    }

    for (const entry of bearsOn) {
      const reason = malformedReason(entry);
      if (reason !== undefined) {
        push('error', '§6', `malformed bears_on entry: ${reason}`);
        continue;
      }
      const ref = entry as string;
      const kind = classifyRef(ref);
      const { resolved } = resolveRef(root, index, clauses, ref);
      if (resolved) continue;
      push(
        refSeverity(kind),
        kind === 'clause' ? '§6.2' : '§6',
        `bears_on ref ${JSON.stringify(ref)} (${kind}) does not resolve in ${path.basename(filePath)}`,
      );
    }
  }

  return violations;
}
