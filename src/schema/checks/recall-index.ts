/**
 * check.recall-index — `.cortex/recall-index.json` shape (schema §4.11,
 * Appendix A; new at 3.4; spec `recall.recall-index` Rule 13).
 *
 * Runs only when the file exists (it is compiled, regenerable, gitignored —
 * absence is never a finding, like `check.constellation`): valid JSON object;
 * the five top-level keys present; `schemaVersion` a `MAJOR.MINOR` string;
 * every subject carries the four lists, each an array of strings; every id in
 * `decided` / `evidence` / `threads` is a key of `entries` (observation themes
 * are checked against `observation.<theme>` keys); every entry's `kind` is in
 * the enum and its `path` a non-empty string. Severity: error. Read-only.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Violation } from '../types.js';

const CHECK = 'check.recall-index';
const CLAUSE = '§4.11';
const REQUIRED_KEYS = ['schemaVersion', 'generated', 'subjects', 'entries', 'counters'] as const;
const SUBJECT_LISTS = ['decided', 'evidence', 'threads', 'observations'] as const;
const KIND_ENUM = ['decision', 'evidence', 'thread', 'observation'];
const VERSION_RE = /^\d+\.\d+$/;
const OBSERVATION_ID_PREFIX = 'observation.';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function checkRecallIndex(root: string): Violation[] {
  const violations: Violation[] = [];
  const filePath = path.join(root, '.cortex', 'recall-index.json');

  // Only when the file exists (§4.11) — absence is not a violation.
  if (!fs.existsSync(filePath)) return violations;

  const fail = (message: string, key?: string): void => {
    violations.push({
      severity: 'error',
      check: CHECK,
      clause: CLAUSE,
      location: { path: filePath, ...(key !== undefined ? { key } : {}) },
      message,
    });
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    fail(`recall-index.json is not valid JSON: ${(err as Error).message}`);
    return violations;
  }
  if (!isRecord(parsed)) {
    fail('recall-index.json must be a JSON object');
    return violations;
  }
  const doc = parsed;

  for (const key of REQUIRED_KEYS) {
    if (!(key in doc)) fail(`missing required top-level key "${key}"`, key);
  }

  if ('schemaVersion' in doc && (typeof doc['schemaVersion'] !== 'string' || !VERSION_RE.test(doc['schemaVersion']))) {
    fail(`schemaVersion must be a MAJOR.MINOR string, got ${JSON.stringify(doc['schemaVersion'])}`, 'schemaVersion');
  }

  // Entries first: subject ids are checked against their keys.
  let entryIds: Set<string> | null = null;
  if ('entries' in doc) {
    if (!isRecord(doc['entries'])) {
      fail('entries must be an object keyed by artefact id', 'entries');
    } else {
      entryIds = new Set(Object.keys(doc['entries']));
      for (const [id, value] of Object.entries(doc['entries'])) {
        if (!isRecord(value)) {
          fail(`entry "${id}" must be an object`, 'entries');
          continue;
        }
        const kind = value['kind'];
        if (typeof kind !== 'string' || !KIND_ENUM.includes(kind)) {
          fail(`entry "${id}" kind ${JSON.stringify(kind)} is not in the §4.11 enum (${KIND_ENUM.join(' | ')})`, 'entries');
        }
        if (typeof value['path'] !== 'string' || value['path'] === '') {
          fail(`entry "${id}" path must be a non-empty string`, 'entries');
        }
      }
    }
  }

  if ('subjects' in doc) {
    if (!isRecord(doc['subjects'])) {
      fail('subjects must be an object keyed by subject ref', 'subjects');
    } else {
      for (const [subject, value] of Object.entries(doc['subjects'])) {
        if (!isRecord(value)) {
          fail(`subject "${subject}" must be an object with the four lists`, 'subjects');
          continue;
        }
        for (const list of SUBJECT_LISTS) {
          const items = value[list];
          if (!Array.isArray(items) || !items.every((i) => typeof i === 'string')) {
            fail(`subject "${subject}" ${list} must be an array of strings`, 'subjects');
            continue;
          }
          if (entryIds === null) continue; // entries unusable — reported above, not per id
          for (const item of items as string[]) {
            const id = list === 'observations' ? `${OBSERVATION_ID_PREFIX}${item}` : item;
            if (!entryIds.has(id)) fail(`subject "${subject}" ${list} names "${id}", which is not a key of entries`, 'subjects');
          }
        }
      }
    }
  }

  return violations;
}
