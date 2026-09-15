/**
 * `check.evidence` (schema §4.3, Appendix A — new at 3.4; spec `atlas.evidence`
 * Rule 2). Every `.cortex/atlas/evidence/*.md` except `_index.md` carries the
 * evidence frontmatter, at `error` severity:
 *
 *   - `id`         shape `evidence.<YYYY-MM-DD>-<slug>` AND equal to `evidence.`
 *                  + the filename stem (a MISSING id is `check.atlas`'s — not repeated)
 *   - `title`      present
 *   - `date`       iso-datetime
 *   - `kind`       in `measurement | experiment | audit`
 *   - `instrument` non-empty string
 *   - `window`     map with iso `from` and `to` (date or datetime); `sessions`
 *                  a non-negative integer when present — ONE violation per file
 *   - `findings`   non-empty list; every entry a map with string `metric`,
 *                  number-or-string `value`, string `unit` when present
 *   - `bears_on`   non-empty list of non-empty strings (resolution is
 *                  `check.bears-on`'s)
 *   - `supersedes` each entry resolves, relative to the file, to a path under
 *                  `atlas/evidence/` (existence is `check.atlas`'s — not repeated)
 *
 * The directory being absent is tolerated (schema §1: present-tolerant, so a
 * 3.3 project validates clean). Read-only, deterministic (R-001).
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import fg from 'fast-glob';
import type { Violation } from '../types.js';
import { EVIDENCE_KINDS } from '../../atlas/evidence.js';
import { isIsoDatetime } from '../../insight/storage.js';

const CHECK = 'check.evidence';
const CLAUSE = '§4.3';
const ID_RE = /^evidence\.\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** An iso-date (`YYYY-MM-DD`), an iso-datetime, or the Date YAML already parsed one into. */
function isIsoDateOrDatetime(v: unknown): boolean {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  if (typeof v !== 'string') return false;
  return ISO_DATE_RE.test(v) ? !Number.isNaN(Date.parse(v)) : isIsoDatetime(v) && /^\d{4}-\d{2}-\d{2}T/.test(v);
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/** The problems with `window`, joined into one message (empty = fine). */
function windowProblems(window: unknown): string[] {
  if (!isRecord(window)) return ['expected a map with "from" and "to"'];
  const problems: string[] = [];
  for (const key of ['from', 'to'] as const) {
    if (!(key in window)) problems.push(`missing "${key}"`);
    else if (!isIsoDateOrDatetime(window[key])) problems.push(`"${key}" is not an iso-date or iso-datetime`);
  }
  if ('sessions' in window) {
    const s = window['sessions'];
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0) problems.push('"sessions" is not a non-negative integer');
  }
  return problems;
}

/** The problem with one findings entry, or undefined when well-formed. */
function findingProblem(entry: unknown): string | undefined {
  if (!isRecord(entry)) return 'is not a map';
  if (!nonEmptyString(entry['metric'])) return 'has no string "metric"';
  const value = entry['value'];
  if (!(typeof value === 'number' || typeof value === 'string')) return 'has no number-or-string "value"';
  if ('unit' in entry && typeof entry['unit'] !== 'string') return 'has a non-string "unit"';
  return undefined;
}

export async function checkEvidence(root: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const evidenceDir = path.join(root, '.cortex', 'atlas', 'evidence');
  if (!fs.existsSync(evidenceDir)) return violations;

  const files = (await fg('*.md', { cwd: evidenceDir, absolute: true, ignore: ['_index.md'] })).sort();

  for (const filePath of files) {
    let data: Record<string, unknown>;
    try {
      data = matter(fs.readFileSync(filePath, 'utf-8')).data as Record<string, unknown>;
    } catch {
      continue; // unparseable frontmatter is check.atlas's finding
    }
    const push = (key: string, message: string): void => {
      violations.push({ severity: 'error', check: CHECK, clause: CLAUSE, location: { path: filePath, key }, message });
    };
    const basename = path.basename(filePath);
    const stem = basename.replace(/\.md$/, '');

    // id — shape and filename agreement (presence is check.atlas's)
    const id = data['id'];
    if (typeof id === 'string' && id !== '') {
      if (!ID_RE.test(id)) push('id', `Evidence id "${id}" does not match "evidence.<YYYY-MM-DD>-<slug>"`);
      else if (id !== `evidence.${stem}`) push('id', `Evidence id "${id}" does not match filename ${basename} (expected "evidence.${stem}")`);
    }

    if (!nonEmptyString(data['title'])) push('title', 'Evidence artefact missing required field "title"');

    const date = data['date'];
    if (date === undefined || date === null) push('date', 'Evidence artefact missing required field "date"');
    else if (!isIsoDatetime(date)) push('date', 'Evidence "date" is not an iso-datetime');

    const kind = data['kind'];
    if (!nonEmptyString(kind)) push('kind', 'Evidence artefact missing required field "kind"');
    else if (!(EVIDENCE_KINDS as readonly string[]).includes(kind)) push('kind', `Evidence kind "${kind}" is not one of ${EVIDENCE_KINDS.join('|')}`);

    if (!nonEmptyString(data['instrument'])) push('instrument', 'Evidence artefact missing required field "instrument" (a non-empty string naming what produced the numbers)');

    if (!('window' in data)) push('window', 'Evidence artefact missing required field "window"');
    else {
      const problems = windowProblems(data['window']);
      if (problems.length > 0) push('window', `Evidence "window" is malformed: ${problems.join('; ')}`);
    }

    const findings = data['findings'];
    if (!Array.isArray(findings) || findings.length === 0) push('findings', 'Evidence "findings" must be a non-empty list of { metric, value, unit? }');
    else {
      findings.forEach((entry, i) => {
        const problem = findingProblem(entry);
        if (problem !== undefined) push('findings', `Evidence findings[${i}] ${problem}`);
      });
    }

    const bearsOn = data['bears_on'];
    if (!Array.isArray(bearsOn) || bearsOn.length === 0) push('bears_on', 'Evidence "bears_on" must be a non-empty list of refs (schema §6)');
    else if (!bearsOn.every(nonEmptyString)) push('bears_on', 'Evidence "bears_on" entries must be non-empty strings');

    // supersedes — must point under atlas/evidence/ (existence is check.atlas's)
    const supersedes = data['supersedes'];
    if (supersedes !== undefined && supersedes !== null) {
      if (!Array.isArray(supersedes)) push('supersedes', 'Evidence "supersedes" must be a list of relative paths to earlier evidence files');
      else {
        for (const ref of supersedes) {
          if (typeof ref !== 'string' || ref === '') {
            push('supersedes', `Evidence "supersedes" entry ${JSON.stringify(ref ?? null)} is not a path`);
            continue;
          }
          const resolved = path.resolve(path.dirname(filePath), ref);
          const rel = path.relative(evidenceDir, resolved);
          const underEvidence = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) && !rel.includes(path.sep);
          const isFile = fs.existsSync(resolved) ? fs.statSync(resolved).isFile() : true;
          if (!underEvidence || !isFile) push('supersedes', `Evidence "supersedes" reference "${ref}" does not point at a file under .cortex/atlas/evidence/`);
        }
      }
    }
  }

  return violations;
}
