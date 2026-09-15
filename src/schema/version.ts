/**
 * The schema version the validator implements (schema §10.3, spec
 * `schema.version-3`). Single source of both halves of the version gate and of
 * the report's declared version — every version-gate branch reads these.
 *
 * Bumped to MAJOR 3 / MINOR 0 for schema 3.0 (the `cerebrum`→`compass` rename
 * and decisions single-home, coupled per build-order-v3 step 2 / flag F1 —
 * mirroring how the 1→2 bump was coupled to the `.specflow/` reorg).
 *
 * MINOR 0 → 3 (B-014): the schema document advanced through 3.1
 * (`insight/observations/`), 3.2 (`archive/intent-register.yaml`) and 3.3
 * (the `profile` config field + the SessionStart entry line) while these
 * constants stayed at 3.0 — so `cortex validate` announced a contract three
 * MINORs older than the one it actually implements, and `cortex init`
 * scaffolded new projects at a stale version. Every one of those checks is
 * implemented and registered; the declaration now matches. A project
 * declaring 3.0/3.1/3.2 still validates clean (MINOR below supported is the
 * §10.2 backward-compatibility guarantee, and no branch fires on it).
 *
 * MINOR 3 → 4: recall step 2 — `bears_on` (schema §6, the first forward
 * edge), addressable clauses `schema:§N[.M[.K]]` (§6.2), `atlas/evidence/`
 * (§4.3), the `evidence-candidate` suggestion type (§4.5.1) and the compiled
 * `recall-index.json` (§4.11); schema §0's 3.4 note. Additive: a 3.3 project
 * validates clean untouched, and `cortex sync` is the whole upgrade path
 * (§10.4 — no migration, no skill-bundle chain entry).
 *
 * These three values MUST stay in step and are pinned together by
 * tests/atomic/schema/version-agreement.test.ts: this file, the
 * `SCHEMA_VERSION` new projects are scaffolded with (src/cli/templates.ts),
 * and the version `cortex-schema.md` declares in its header.
 *
 * Pure constants; no I/O.
 */

/** The MAJOR version this validator supports (schema §10.3). */
export const SUPPORTED_MAJOR = 3;

/** The MINOR version this validator supports (schema §10.3). */
export const SUPPORTED_MINOR = 4;

/** `MAJOR.MINOR` string form of the supported version, e.g. `"2.0"`. */
export const SUPPORTED_VERSION = `${SUPPORTED_MAJOR}.${SUPPORTED_MINOR}`;
