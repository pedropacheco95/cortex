/**
 * Init-time scaffolding for the `archive/` module (build-order-v3 step 3a;
 * cortex-schema.md §4.4, §7.1, Appendix A `check.archive-layout`). Deterministic
 * Core (R-001): pure file I/O, no LLM, no network.
 *
 * Creates the committed module skeleton — `archive/_index.md` (the §7.1 active
 * prompt), `archive/register.md` (the human-readable document index), and the
 * empty `documents/` and `types/` directories. Seeds no document (those arrive
 * via `cortex-archive-ingest`, build-order-v3 step 3b — a separate, later
 * change) and no starter type file: whether `cortex init` should ship one or
 * two common `types/*.yaml` templates (e.g. `client-spec`, `meeting-transcript`)
 * is left unspecified by both the design doc and the schema addendum, so this
 * is a judgment call — starting empty, mirroring how `insight/map/` ships with
 * no seeded prose or JSON (src/insight/scaffold.ts) rather than prescribing
 * document types a given project may never ingest. Idempotent — an existing
 * `_index.md`/`register.md` is never clobbered.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ARCHIVE_INDEX_TEMPLATE, ARCHIVE_REGISTER_TEMPLATE } from '../cli/templates.js';

export interface ScaffoldArchiveResult {
  /** True when `archive/_index.md` was written (false when it already existed). */
  indexWritten: boolean;
  /** True when `archive/register.md` was written (false when it already existed). */
  registerWritten: boolean;
  /** True when `archive/documents/` was created (false when it already existed). */
  documentsCreated: boolean;
  /** True when `archive/types/` was created (false when it already existed). */
  typesCreated: boolean;
}

/**
 * Scaffold `<cortexRoot>/archive/`. `cortexRoot` is the `.cortex/` directory.
 * Safe to re-run: existing `_index.md`/`register.md` are preserved.
 */
export function scaffoldArchive(cortexRoot: string): ScaffoldArchiveResult {
  const archiveDir = path.join(cortexRoot, 'archive');
  const documentsDir = path.join(archiveDir, 'documents');
  const typesDir = path.join(archiveDir, 'types');
  const indexPath = path.join(archiveDir, '_index.md');
  const registerPath = path.join(archiveDir, 'register.md');

  fs.mkdirSync(archiveDir, { recursive: true });

  const documentsExisted = fs.existsSync(documentsDir);
  // documents/<slug>/ carries no _index.md (mirrors insight/map/, §4.10.3) —
  // check.index-present exempts this subtree (schema §1, layout.ts).
  fs.mkdirSync(documentsDir, { recursive: true });

  const typesExisted = fs.existsSync(typesDir);
  // types/*.yaml are data, not a navigable index-bearing directory — same
  // exemption as documents/ above.
  fs.mkdirSync(typesDir, { recursive: true });

  let indexWritten = false;
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, ARCHIVE_INDEX_TEMPLATE, 'utf-8');
    indexWritten = true;
  }

  let registerWritten = false;
  if (!fs.existsSync(registerPath)) {
    fs.writeFileSync(registerPath, ARCHIVE_REGISTER_TEMPLATE, 'utf-8');
    registerWritten = true;
  }

  return {
    indexWritten,
    registerWritten,
    documentsCreated: !documentsExisted,
    typesCreated: !typesExisted,
  };
}
