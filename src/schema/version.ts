/**
 * The schema version the validator implements (schema §10.3, spec
 * `schema.version-2`). Single source of both halves of the version gate and of
 * the report's declared version — every version-gate branch reads these.
 *
 * Bumped to MAJOR 2 / MINOR 0 for schema 2.0 (the `.specflow/` re-rooting plus
 * the committed `insight/` module). Pure constants; no I/O.
 */

/** The MAJOR version this validator supports (schema §10.3). */
export const SUPPORTED_MAJOR = 2;

/** The MINOR version this validator supports (schema §10.3). */
export const SUPPORTED_MINOR = 0;

/** `MAJOR.MINOR` string form of the supported version, e.g. `"2.0"`. */
export const SUPPORTED_VERSION = `${SUPPORTED_MAJOR}.${SUPPORTED_MINOR}`;
