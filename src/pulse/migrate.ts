/**
 * Idempotent migration of the flat `.cortex/pulse/` layout to the subdivided
 * one (design: pulse reorg). Loop reports move under `reports/`; machine
 * working state moves under `state/` (leading dots dropped); the per-session
 * read ledgers `.reads-<id>` become one file each under `state/reads/<id>`;
 * the Skill-layer extraction artefacts move under `extraction/`. Files written
 * only by retired loops are DELETED, not moved (no live reader/writer remains).
 * `suggestions.md`, `dismissed.md`, and `_index.md` stay at the pulse root.
 *
 * Deterministic Core (R-001): fs/path only, no LLM, no network. Every step is
 * best-effort — a migration failure must never fail the loop that triggered it.
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * The static old→new map, each side project-relative to `.cortex/pulse/`.
 * Renamed reports (basename changes), every moved state dotfile, and the
 * extraction artefacts (Skill-layer owned — no src/ writer — but this helper is
 * the one-shot migrator for the whole layout) are here; the `.reads-*` ledgers
 * are enumerated separately (there can be N of them). `insight-fragments/` is a
 * directory — `fs.renameSync` moves it whole.
 */
const STATIC_MOVES: ReadonlyArray<readonly [string, string]> = [
  // reports: root → reports/ (three of them also rename their basename)
  ['hygiene-report.md', 'reports/hygiene.md'],
  ['lint-report.md', 'reports/lint.md'],
  ['verification-report.md', 'reports/verification.md'],
  ['bug-triage.md', 'reports/bug-triage.md'],
  ['spec-drift.md', 'reports/spec-drift.md'],
  ['insight-refresh.md', 'reports/insight-refresh.md'],
  ['session-observe.md', 'reports/session-observe.md'],
  ['rule-candidates.md', 'reports/rule-candidates.md'],
  ['atlas-review.md', 'reports/atlas-review.md'],
  ['scaffolding-review.md', 'reports/scaffolding-review.md'],
  ['test-failures.md', 'reports/test-failures.md'],
  ['hook-errors.md', 'reports/hook-errors.md'],
  // state: root → state/ (dots dropped)
  ['.suggestion-counter', 'state/suggestion-counter'],
  ['.distil-last-run', 'state/distil-last-run'],
  ['.session-corpus.json', 'state/session-corpus.json'],
  ['.insight-refresh-worklist.json', 'state/insight-refresh-worklist.json'],
  ['.insight-daily-worklist.json', 'state/insight-daily-worklist.json'],
  ['.insight-full-worklist.json', 'state/insight-full-worklist.json'],
  ['.triage-worklist.json', 'state/triage-worklist.json'],
  ['.test-runner-worklist.json', 'state/test-runner-worklist.json'],
  ['.session-observe-worklist.json', 'state/session-observe-worklist.json'],
  ['.session-observe-state.json', 'state/session-observe-state.json'],
  ['.readback-applied', 'state/readback-applied'],
  // extraction artefacts: root → extraction/ (Skill-layer owned; renamed)
  ['insight-extraction-plan.md', 'extraction/plan.md'],
  ['insight-extraction-progress.md', 'extraction/progress.md'],
  ['insight-l1.json', 'extraction/l1.json'],
  ['insight-fragments', 'extraction/fragments'],
];

/**
 * Pulse-root files written ONLY by retired loops — deleted, never migrated (no
 * live reader/writer remains, confirmed by a src/ scan). Existence-gated: a name
 * that isn't present is a no-op, so a retired name we never see harms nothing.
 */
const KNOWN_ORPHANS: readonly string[] = [
  '.purpose-worklist.json', // retired anatomy-refresh-deep loop
  'purpose-worklist.json', //  dotless variant of the same orphan
  'insight-gaps.md', //         retired v2 loop-insight-gaps report
  '.insight-refresh-last-full', // retired v2 refresh state
  'skill-suggestions.md', //    retired standalone skill-suggest loop (folded into distil)
];

/**
 * Outcome of a single legacy self-heal:
 * - `renamed`: the old file existed and the new slot was empty, so it moved.
 * - `superseded`: BOTH existed — the new location is authoritative, so the
 *   stale old file was deleted (never leave a duplicate behind).
 * - `noop`: the old file was absent (already migrated, or never existed).
 */
export type LegacyOutcome = 'renamed' | 'superseded' | 'noop';

/**
 * Cheap O(1) self-heal for a single known file. If the old path still exists:
 * move it to the new location when that slot is empty, otherwise DELETE it
 * because the new file is authoritative (a rename-only guard would otherwise
 * leave a stale duplicate at the old path forever). Never throws — hooks call
 * this inline on their latency-critical paths, so it stays O(1) stat + op.
 */
export function renameIfLegacy(oldAbs: string, newAbs: string): LegacyOutcome {
  try {
    if (!fs.existsSync(oldAbs)) return 'noop';
    if (fs.existsSync(newAbs)) {
      // Both present: new wins, drop the stale old copy.
      fs.rmSync(oldAbs, { recursive: true, force: true });
      return 'superseded';
    }
    fs.mkdirSync(path.dirname(newAbs), { recursive: true });
    fs.renameSync(oldAbs, newAbs);
    return 'renamed';
  } catch {
    /* best-effort — the caller degrades to writing fresh */
  }
  return 'noop';
}

export interface MigrateResult {
  /** `old -> new`, project-relative-to-pulse, for every file actually moved. */
  migrated: string[];
  /** Pulse-relative name of every retired-loop orphan actually deleted. */
  deleted: string[];
  /**
   * `old -> new`, for every stale old file deleted because its new location
   * already held the authoritative copy (collision resolved, no duplicate left).
   */
  superseded: string[];
}

/**
 * Migrate the whole pulse tree in place, idempotently. Retired-loop orphans are
 * deleted; each known old flat path that still exists while its new path does
 * not is renamed (creating the destination parent); the `.reads-*` ledgers are
 * enumerated from disk and each moved to `state/reads/<id>`. A missing pulse
 * root is a no-op (empty result).
 */
export function migratePulseLayout(root: string): MigrateResult {
  const pulseDir = path.join(root, '.cortex', 'pulse');
  const migrated: string[] = [];
  const deleted: string[] = [];
  const superseded: string[] = [];
  if (!fs.existsSync(pulseDir)) return { migrated, deleted, superseded };

  // Retired-loop orphans: delete outright (existence-gated, best-effort).
  for (const name of KNOWN_ORPHANS) {
    const abs = path.join(pulseDir, name);
    try {
      if (fs.existsSync(abs)) {
        fs.rmSync(abs, { recursive: true, force: true });
        deleted.push(name);
      }
    } catch {
      /* best-effort — an unremovable orphan never blocks the loop */
    }
  }

  const record = (oldRel: string, newRel: string, outcome: LegacyOutcome): void => {
    if (outcome === 'renamed') migrated.push(`${oldRel} -> ${newRel}`);
    else if (outcome === 'superseded') superseded.push(`${oldRel} -> ${newRel}`);
  };

  for (const [oldRel, newRel] of STATIC_MOVES) {
    record(
      oldRel,
      newRel,
      renameIfLegacy(path.join(pulseDir, oldRel), path.join(pulseDir, newRel)),
    );
  }

  // Per-session read ledgers: `.reads-<id>` (flat) → `state/reads/<id>`.
  let names: string[];
  try {
    names = fs.readdirSync(pulseDir);
  } catch {
    return { migrated, deleted, superseded };
  }
  for (const name of names) {
    if (!name.startsWith('.reads-')) continue;
    const id = name.slice('.reads-'.length);
    if (id === '') continue;
    const newRel = path.join('state', 'reads', id);
    record(name, newRel, renameIfLegacy(path.join(pulseDir, name), path.join(pulseDir, newRel)));
  }

  return { migrated, deleted, superseded };
}
