/**
 * Init-time scaffolding for the `insight/` module (spec insight.module-contract;
 * cortex-schema.md §4.10, §7.4). Deterministic Core (R-001): pure file I/O, no
 * LLM, no network.
 *
 * Creates the committed module skeleton — `insight/_index.md` (the §7.4 active
 * prompt) plus the empty flat `insight/map/` directory. It seeds NO prose or
 * JSON files: those are written later by the producer loops (refresh writes the
 * three `.json`; gaps writes `.md`). Idempotent — an existing `_index.md` is
 * never clobbered.
 */
import * as fs from 'fs';
import * as path from 'path';
import { INSIGHT_INDEX_TEMPLATE } from '../cli/templates.js';

export interface ScaffoldInsightResult {
  /** True when `insight/_index.md` was written (false when it already existed). */
  indexWritten: boolean;
  /** True when `insight/map/` was created (false when it already existed). */
  mapCreated: boolean;
}

/**
 * Scaffold `<cortexRoot>/insight/`. `cortexRoot` is the `.cortex/` directory.
 * Safe to re-run: an existing `_index.md` is preserved.
 */
export function scaffoldInsight(cortexRoot: string): ScaffoldInsightResult {
  const insightDir = path.join(cortexRoot, 'insight');
  const mapDir = path.join(insightDir, 'map');
  const indexPath = path.join(insightDir, '_index.md');

  fs.mkdirSync(insightDir, { recursive: true });

  const mapExisted = fs.existsSync(mapDir);
  // Flat map/ carries no `_index.md` (§4.10.3); no `.gitkeep` — the committed
  // `insight/_index.md` one level up keeps the module in git even while `map/`
  // is empty.
  fs.mkdirSync(mapDir, { recursive: true });

  let indexWritten = false;
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, INSIGHT_INDEX_TEMPLATE, 'utf-8');
    indexWritten = true;
  }

  return { indexWritten, mapCreated: !mapExisted };
}
