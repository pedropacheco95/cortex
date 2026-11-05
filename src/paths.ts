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
 * geometry is unchanged — Rule 2).
 *
 * At 4.0 a ported project keeps both trees in the visible `specflow/` folder
 * (schema S12.1, `specflow.port`): `specflow/impl` and `specflow/promises`. The
 * root-taking helpers below answer for either layout; the constants name the
 * 3.x layout only.
 */
import * as fs from 'fs';
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

/** True when the spec trees live in `specflow/` (specflow.lint Rule 2); a stray empty folder is not a port. */
export function isPorted(root: string): boolean {
  return fs.existsSync(path.join(root, 'specflow', 'INDEX.md')) || fs.existsSync(path.join(root, 'specflow', 'impl'));
}

/** Absolute path to the dev-spec tree root. */
export function specsRoot(root: string): string {
  return isPorted(root) ? path.join(root, 'specflow', 'impl') : path.join(root, SPECFLOW_DIR, 'specs');
}

/** Absolute path to the business-spec tree root. */
export function businessRoot(root: string): string {
  return isPorted(root) ? path.join(root, 'specflow', 'promises') : path.join(root, SPECFLOW_DIR, 'specs-business');
}

/** fast-glob pattern (cwd = project root) for this project's dev-spec leaf files. */
export function specsGlob(root: string): string {
  return isPorted(root) ? 'specflow/impl/**/*.spec.md' : SPECS_GLOB;
}

/** fast-glob pattern (cwd = project root) for this project's business-spec leaf files. */
export function businessGlob(root: string): string {
  return isPorted(root) ? 'specflow/promises/**/*.business.md' : BUSINESS_GLOB;
}

/** Absolute path to the dev-spec index `_index.md` (schema §7.2). */
export function specsIndexPath(root: string): string {
  return path.join(specsRoot(root), '_index.md');
}

export interface PortLayout {
  name: 'A' | 'B';
  dev: string;
  business: string;
  /** What empties and goes after the move. */
  top: string;
  /** A generated index the move deletes. */
  staleIndex?: string;
}

/** The bench's visible spec folder, a port source only. */
const BENCH_ROOT = 'specs';

/** The source layouts `cortex specs port` accepts (specflow.port Rule 2). */
export const PORT_LAYOUTS: readonly PortLayout[] = [
  { name: 'A', dev: SPECS_REL, business: BUSINESS_REL, top: SPECFLOW_DIR },
  { name: 'B', dev: `${BENCH_ROOT}/impl`, business: `${BENCH_ROOT}/promises`, top: BENCH_ROOT, staleIndex: `${BENCH_ROOT}/INDEX.md` },
];
