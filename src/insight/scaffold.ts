/**
 * Init-time scaffolding for the v3 `insight/` module (spec
 * insight.storage-format WRITES clause; cortex-schema.md §4.10.1, §7.4).
 * Deterministic Core (R-001): pure file I/O, no LLM, no network.
 *
 * Creates the committed module skeleton for the UNSCOPED (flat) default
 * layout: `insight/_index.md` (the §7.4 active prompt, design §5.13) plus the
 * empty `anatomy/` and `concepts/` directories. It seeds NO entries, concepts,
 * or JSON files — those are written by the `cortex-extract-insight` skill
 * (build-order-v3 step 5d), which also adds `scopes/` + `scope-registry.yaml`
 * when it decides to scope. Idempotent — an existing `_index.md` is never
 * clobbered. A legacy v2 `insight/map/` directory, if present, is left
 * untouched (sanctioned interim dogfood, design §8.4).
 */
import * as fs from 'fs';
import * as path from 'path';
import { INSIGHT_INDEX_TEMPLATE } from '../cli/templates.js';

export interface ScaffoldInsightResult {
  /** True when `insight/_index.md` was written (false when it already existed). */
  indexWritten: boolean;
  /** True when `insight/anatomy/` was created (false when it already existed). */
  anatomyCreated: boolean;
  /** True when `insight/concepts/` was created (false when it already existed). */
  conceptsCreated: boolean;
}

/**
 * Scaffold `<cortexRoot>/insight/`. `cortexRoot` is the `.cortex/` directory.
 * Safe to re-run: an existing `_index.md` is preserved.
 */
export function scaffoldInsight(cortexRoot: string): ScaffoldInsightResult {
  const insightDir = path.join(cortexRoot, 'insight');
  const anatomyDir = path.join(insightDir, 'anatomy');
  const conceptsDir = path.join(insightDir, 'concepts');
  const indexPath = path.join(insightDir, '_index.md');

  fs.mkdirSync(insightDir, { recursive: true });

  // The two flat-layout content dirs carry no `_index.md` of their own (§1 —
  // only the module root does) and no `.gitkeep`: the committed
  // `insight/_index.md` keeps the module in git while they are empty.
  const anatomyExisted = fs.existsSync(anatomyDir);
  fs.mkdirSync(anatomyDir, { recursive: true });
  const conceptsExisted = fs.existsSync(conceptsDir);
  fs.mkdirSync(conceptsDir, { recursive: true });

  let indexWritten = false;
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, INSIGHT_INDEX_TEMPLATE, 'utf-8');
    indexWritten = true;
  }

  return { indexWritten, anatomyCreated: !anatomyExisted, conceptsCreated: !conceptsExisted };
}
