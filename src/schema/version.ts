/**
 * The schema version the validator implements (schema §10.3, spec
 * `schema.version-3`). Single source of both halves of the version gate and of
 * the report's declared version — every version-gate branch reads these.
 *
 * Bumped to MAJOR 3 / MINOR 0 for schema 3.0 (the `cerebrum`→`compass` rename
 * and decisions single-home, coupled per build-order-v3 step 2 / flag F1 —
 * mirroring how the 1→2 bump was coupled to the `.specflow/` reorg). Pure
 * constants; no I/O.
 */

/** The MAJOR version this validator supports (schema §10.3). */
export const SUPPORTED_MAJOR = 3;

/** The MINOR version this validator supports (schema §10.3). */
export const SUPPORTED_MINOR = 0;

/** `MAJOR.MINOR` string form of the supported version, e.g. `"2.0"`. */
export const SUPPORTED_VERSION = `${SUPPORTED_MAJOR}.${SUPPORTED_MINOR}`;
