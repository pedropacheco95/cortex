/**
 * The single source of truth for the SpecFlow spec-tree roots (schema §2.3).
 *
 * At schema 2.0 both trees moved under one hidden, SpecFlow-owned namespace:
 * `specs/` → `.specflow/specs/` and `specs-business/` → `.specflow/specs-business/`
 * (spec `specflow.reorg`). Every Core module imports these helpers instead of
 * hardcoding the tree roots, so the re-rooting has one place to change.
 *
 * NOT covered here: `tests/scenario/specs/` — that is a distinct test path that
 * deliberately stays at the project root (§2.3), and relative `../../specs*`
 * cross-references inside spec frontmatter (they move with the trees, so their
 * geometry is unchanged — Rule 2). Pure path math; no I/O.
 */
import * as path from 'path';

/** The hidden SpecFlow namespace holding both spec trees (schema §2.3). */
export const SPECFLOW_DIR = '.specflow';

/** Project-root-relative POSIX path to the dev-spec tree — for glob cwd-relative
 *  patterns and human-facing message text. */
export const SPECS_REL = '.specflow/specs';

/** Project-root-relative POSIX path to the business-spec tree. */
export const BUSINESS_REL = '.specflow/specs-business';

/** fast-glob pattern (cwd = project root) for dev-spec leaf files. */
export const SPECS_GLOB = '.specflow/specs/**/*.spec.md';

/** fast-glob pattern (cwd = project root) for business-spec leaf files. */
export const BUSINESS_GLOB = '.specflow/specs-business/**/*.business.md';

/** Absolute path to the dev-spec tree root (`.specflow/specs`). */
export function specsRoot(root: string): string {
  return path.join(root, SPECFLOW_DIR, 'specs');
}

/** Absolute path to the business-spec tree root (`.specflow/specs-business`). */
export function businessRoot(root: string): string {
  return path.join(root, SPECFLOW_DIR, 'specs-business');
}

/** Absolute path to the dev-spec index `.specflow/specs/_index.md` (schema §7.2). */
export function specsIndexPath(root: string): string {
  return path.join(specsRoot(root), '_index.md');
}
