/**
 * Shared fixture builder for the recall-index CONSUMERS (`hooks.search-annotate`
 * Rule 12's query module and the four consumers built on it). Hand-built
 * `RecallIndex` literals, written verbatim to `<root>/.cortex/recall-index.json`
 * — no compiler run, no frontmatter, so every test pins exactly the index shape
 * the consumer sees. Sandboxed tmp roots only.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { RecallEntry, RecallEntryKind, RecallIndex, RecallSubject } from '../../src/recall/index.js';
import { recallIndexPath } from '../../src/recall/index.js';

/** A subject block with every list defaulted to empty. */
export function recallSubject(partial: Partial<RecallSubject> = {}): RecallSubject {
  return {
    decided: partial.decided ?? [],
    evidence: partial.evidence ?? [],
    threads: partial.threads ?? [],
    observations: partial.observations ?? [],
  };
}

/** One entry row; `date` may be a bare `YYYY-MM-DD` (midnight UTC is appended). */
export function recallEntry(
  kind: RecallEntryKind,
  title: string,
  entryPath: string,
  date: string,
  keywords: string[] = [],
): RecallEntry {
  return {
    kind,
    title,
    path: entryPath,
    date: date.length === 10 ? `${date}T00:00:00.000Z` : date,
    keywords: [...keywords].sort(),
  };
}

/** A full index literal with its counters derived from the two maps. */
export function recallIndexFixture(
  subjects: Record<string, RecallSubject>,
  entries: Record<string, RecallEntry>,
  opts: { schemaVersion?: string; generated?: string; droppedRefs?: number } = {},
): RecallIndex {
  return {
    schemaVersion: opts.schemaVersion ?? '3.4',
    generated: opts.generated ?? '2026-09-15T16:00:00.000Z',
    subjects,
    entries,
    counters: {
      subjects: Object.keys(subjects).length,
      entries: Object.keys(entries).length,
      droppedRefs: opts.droppedRefs ?? 0,
    },
  };
}

/** Write `<root>/.cortex/recall-index.json` (creating `.cortex/`) and return its absolute path. */
export function writeRecallIndexFixture(root: string, index: RecallIndex | string): string {
  const target = recallIndexPath(root);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof index === 'string' ? index : JSON.stringify(index, null, 2) + '\n', 'utf-8');
  return target;
}

/**
 * The index the query tests share — the schema §4.11 example plus the entries
 * the `hooks.search-annotate` ACs name. Five subjects, six entries.
 */
export function sampleRecallIndex(): RecallIndex {
  return recallIndexFixture(
    {
      '.specflow/specs/pulse/hygiene.spec.md': recallSubject({ decided: ['decision.2026-07-10-x'], threads: ['T-004'] }),
      'R-001': recallSubject({ decided: ['decision.2026-07-07-five-module-architecture'], observations: ['working-style'] }),
      'schema:§5': recallSubject({
        decided: ['decision.2026-08-05-insight-pull-only-stance-reversed'],
        evidence: ['evidence.2026-09-15-usage'],
      }),
      'pulse.usage': recallSubject({ evidence: ['evidence.2026-09-15-usage'] }),
      'src/pulse': recallSubject({ decided: ['decision.2026-08-05-insight-pull-only-stance-reversed'] }),
    },
    {
      'T-004': recallEntry(
        'thread',
        'Do you want the counter in state/ or at the pulse root?',
        '.cortex/pulse/threads/T-004-do-you-want-the-counter-in-state-or-at-the-pulse-root.md',
        '2026-09-15T10:12:04.000Z',
        ['counter', 'pulse', 'root', 'state', 'want', '.specflow/specs/pulse/hygiene.spec.md'],
      ),
      'decision.2026-07-07-five-module-architecture': recallEntry(
        'decision',
        'Five-module architecture',
        '.cortex/atlas/decisions/2026-07-07-five-module-architecture.md',
        '2026-07-07',
        ['architecture', 'five', 'module', 'R-001'],
      ),
      'decision.2026-07-10-x': recallEntry(
        'decision',
        'Retention counter lives under state',
        '.cortex/atlas/decisions/2026-07-10-x.md',
        '2026-07-10',
        ['counter', 'lives', 'retention', 'state', 'under', '.specflow/specs/pulse/hygiene.spec.md'],
      ),
      'decision.2026-08-05-insight-pull-only-stance-reversed': recallEntry(
        'decision',
        'Insight pull-only stance reversed',
        '.cortex/atlas/decisions/2026-08-05-insight-pull-only-stance-reversed.md',
        '2026-08-05',
        ['insight', 'only', 'pull', 'reversed', 'stance', 'schema:§5', 'src/pulse'],
      ),
      'evidence.2026-09-15-usage': recallEntry(
        'evidence',
        'Cortex usage over 41 sessions',
        '.cortex/atlas/evidence/2026-09-15-usage.md',
        '2026-09-15T15:58:00.000Z',
        ['cortex', 'sessions', 'usage', 'pulse.usage', 'schema:§5'],
      ),
      'observation.working-style': recallEntry(
        'observation',
        'working-style',
        '.cortex/insight/observations/working-style.md',
        '2026-09-01',
        ['working-style', 'R-001'],
      ),
    },
  );
}
