/**
 * Shared S-id allocator (schema §4.5 — single S-namespace across all pulse
 * artefacts). Every proposal-writing loop allocates its `S-NNN` ids through
 * this ONE monotonic counter, `pulse/.suggestion-counter`: a plain integer
 * holding the last id ever allocated. Like `dismissed.md`, the counter
 * persists across runs; ids are never reused. A missing file starts at 0.
 * The review CLI only reads ids — it never allocates.
 *
 * Deterministic Core (R-001): fs/path only.
 */
import * as fs from 'fs';
import * as path from 'path';

export const SUGGESTION_COUNTER_FILE = '.suggestion-counter';

function counterPath(root: string): string {
  return path.join(root, '.cortex', 'pulse', SUGGESTION_COUNTER_FILE);
}

/** The last allocated suggestion number (0 when the file is missing or unreadable). */
export function readSuggestionCounter(root: string): number {
  try {
    const raw = fs.readFileSync(counterPath(root), 'utf-8').trim();
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  } catch {
    /* missing file → fresh namespace */
  }
  return 0;
}

/**
 * Allocate `n` fresh `S-NNN` ids and persist the advanced counter. The write
 * happens before the ids are handed out is irrelevant to callers — the counter
 * on disk always reflects the highest id ever returned, so two loops
 * allocating in sequence can never collide (schema §4.5: monotonic, never
 * reused).
 */
export function allocateSuggestionIds(root: string, n: number): string[] {
  if (!Number.isInteger(n) || n <= 0) return [];
  const current = readSuggestionCounter(root);
  const ids: string[] = [];
  for (let i = 1; i <= n; i++) {
    ids.push(`S-${String(current + i).padStart(3, '0')}`);
  }
  const file = counterPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${current + n}\n`, 'utf-8');
  return ids;
}
