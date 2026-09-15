/**
 * `check.threads` (schema §4.5.3, Appendix A — new at 3.3 third revision;
 * `pulse.threads` Rule 1's "validated by" clause). Every
 * `.cortex/pulse/threads/*.md` ledger file, at **warning** severity like the
 * rest of pulse:
 *
 *  - `id` matches `T-\d{3,}` and the filename prefix; ids unique across the directory
 *  - `kind` and `status` in their enums
 *  - `opened` and `expires` iso-datetimes
 *  - `answered` and `resolved_by` present iff `status: answered`
 *  - `session` a well-formed `claude-sessions/<user>/<id>` citation (cited-not-resolved, §6)
 *  - `sessions` a non-empty list of the same
 *  - `bears_on` a list of strings (shape only — entries are never resolved here)
 *
 * The directory is created on demand by the SessionEnd hook, so its absence
 * is not a finding. Pure structural inspection — no LLM, no network (R-001),
 * read-only. `check.pulse` skips `threads/**` so no file is checked twice.
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type { Violation } from '../types.js';
import { CLAUDE_SESSION_REF_PATTERN } from '../provenance-index.js';
import { isIsoDatetime } from '../../insight/storage.js';
import { THREAD_KINDS, THREAD_STATUSES, THREADS_DIR } from '../../pulse/threads.js';

const THREAD_ID_RE = /^T-\d{3,}$/;

function isCitation(v: unknown): v is string {
  return typeof v === 'string' && CLAUDE_SESSION_REF_PATTERN.test(v);
}

export async function checkThreads(root: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const dir = path.join(root, '.cortex', ...THREADS_DIR.split('/'));

  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort();
  } catch {
    return violations; // no ledger yet — nothing to check
  }

  const seenIds = new Map<string, string>();

  for (const name of names) {
    const filePath = path.join(dir, name);
    const warn = (key: string, message: string): void => {
      violations.push({ severity: 'warning', check: 'check.threads', clause: '§4.5.3', location: { path: filePath, key }, message });
    };

    let data: Record<string, unknown>;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      if (!raw.startsWith('---')) {
        warn('frontmatter', 'Thread file has no YAML frontmatter block');
        continue;
      }
      data = matter(raw).data as Record<string, unknown>;
    } catch (err) {
      warn('frontmatter', `Thread frontmatter does not parse: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    // id — shape, filename agreement, uniqueness
    const id = data['id'];
    if (typeof id !== 'string' || !THREAD_ID_RE.test(id)) {
      warn('id', `"id" must match T-NNN (three or more digits); got ${JSON.stringify(id ?? null)}`);
    } else {
      if (!name.startsWith(`${id}-`)) {
        warn('id', `"id" ${id} does not match the filename prefix of ${name} (expected ${id}-<slug>.md)`);
      }
      const first = seenIds.get(id);
      if (first !== undefined) warn('id', `duplicate thread id ${id} — also carried by ${first}`);
      else seenIds.set(id, name);
    }

    // enums
    const kind = data['kind'];
    if (typeof kind !== 'string' || !(THREAD_KINDS as readonly string[]).includes(kind)) {
      warn('kind', `"kind" must be one of ${THREAD_KINDS.join(' | ')}; got ${JSON.stringify(kind ?? null)}`);
    }
    const status = data['status'];
    if (typeof status !== 'string' || !(THREAD_STATUSES as readonly string[]).includes(status)) {
      warn('status', `"status" must be one of ${THREAD_STATUSES.join(' | ')}; got ${JSON.stringify(status ?? null)}`);
    }

    // timestamps
    if (!isIsoDatetime(data['opened'])) warn('opened', '"opened" is missing or not an iso-datetime');
    if (!isIsoDatetime(data['expires'])) warn('expires', '"expires" is missing or not an iso-datetime');

    // answered / resolved_by present iff answered
    const hasAnswered = data['answered'] !== undefined;
    const hasResolvedBy = data['resolved_by'] !== undefined;
    if (status === 'answered') {
      if (!hasAnswered) warn('answered', '"status" is answered but "answered" is missing');
      else if (!isIsoDatetime(data['answered'])) warn('answered', '"answered" is not an iso-datetime');
      if (!hasResolvedBy) warn('resolved_by', '"status" is answered but "resolved_by" is missing');
      else if (typeof data['resolved_by'] !== 'string' || data['resolved_by'] === '') {
        warn('resolved_by', '"resolved_by" must be a project-relative path or a claude-sessions/… citation');
      }
    } else {
      if (hasAnswered) warn('answered', `"answered" is present but "status" is ${JSON.stringify(status ?? null)}, not answered`);
      if (hasResolvedBy) warn('resolved_by', `"resolved_by" is present but "status" is ${JSON.stringify(status ?? null)}, not answered`);
    }

    // citations
    if (!isCitation(data['session'])) {
      warn('session', '"session" must be a claude-sessions/<user>/<session-id> citation');
    }
    const sessions = data['sessions'];
    if (!Array.isArray(sessions) || sessions.length === 0) {
      warn('sessions', '"sessions" must be a non-empty list of claude-sessions/<user>/<session-id> citations');
    } else {
      const bad = sessions.filter((e) => !isCitation(e));
      if (bad.length > 0) warn('sessions', `"sessions" entries must be claude-sessions/<user>/<session-id> citations; bad: ${JSON.stringify(bad)}`);
    }

    // bears_on — shape only
    const bearsOn = data['bears_on'];
    if (!Array.isArray(bearsOn) || !bearsOn.every((e) => typeof e === 'string')) {
      warn('bears_on', '"bears_on" must be a list of strings (project-relative paths and bare ids; may be empty)');
    }
  }

  return violations;
}
