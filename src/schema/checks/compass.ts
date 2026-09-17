import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import fg from 'fast-glob';
import type { Violation } from '../types.js';
import type { ProjectIndex } from '../index-build.js';
import { resolveId, resolveRelativePath } from '../index-build.js';

/** Schema §6: a governs glob with 0 on-disk matches is a warning, not an error. */
export function globMatchesNothing(root: string, glob: string): boolean {
  try {
    return fg.sync(glob, { cwd: root, dot: false, onlyFiles: true }).length === 0;
  } catch {
    return false; // malformed globs are reported separately as well-formedness errors
  }
}

const RULE_ID_PATTERN = /^R-\d{3}$/;
const BUG_ID_PATTERN = /^B-\d{3}$/;

// Enums per cortex-schema.md §4.2 (check.kind) and §4.3 (seven-type bug taxonomy, design §2)
const CHECK_KIND_ENUM = ['regex', 'grep', 'ast', 'none'] as const;
const BUG_TYPE_ENUM = [
  'missing-criterion',
  'incomplete-rule',
  'wrong-rule',
  'missing-dev-spec',
  'missing-business-spec',
  'layer-drift',
  'test-defect',
] as const;
const BUG_SEVERITY_ENUM = ['critical', 'high', 'medium', 'low'] as const;
const BUG_STATUS_ENUM = ['open', 'triaged', 'resolved'] as const;

export function checkRules(root: string, index: ProjectIndex): Violation[] {
  const violations: Violation[] = [];
  const rulesDir = path.join(root, '.cortex', 'compass', 'rules');

  if (!fs.existsSync(rulesDir)) return violations;

  // Schema §4.2: files are R-NNN-<slug>.md (bare R-NNN.md tolerated); id is the R-NNN prefix
  const ruleFiles = fs.readdirSync(rulesDir).filter((f) => /^R-\d{3,}(-[A-Za-z0-9-]+)?\.md$/.test(f));

  for (const filename of ruleFiles) {
    const filePath = path.join(rulesDir, filename);
    let data: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      data = matter(raw).data as Record<string, unknown>;
    } catch {
      continue;
    }

    const expectedId = (/^R-\d{3,}/.exec(filename) ?? [filename.replace('.md', '')])[0];

    // id must match R-NNN pattern and filename
    if (!data['id']) {
      violations.push({ severity: 'error', check: 'check.rule', clause: '§4.2', location: { path: filePath, key: 'id' }, message: `Rule missing required field "id"` });
    } else if (typeof data['id'] !== 'string' || !RULE_ID_PATTERN.test(data['id'])) {
      violations.push({ severity: 'error', check: 'check.rule', clause: '§4.2', location: { path: filePath, key: 'id' }, message: `Rule id "${data['id']}" does not match R-NNN pattern` });
    } else if (data['id'] !== expectedId) {
      violations.push({ severity: 'error', check: 'check.rule', clause: '§4.2', location: { path: filePath, key: 'id' }, message: `Rule id "${data['id']}" does not match filename "${expectedId}"` });
    }

    if (!data['title']) {
      violations.push({ severity: 'error', check: 'check.rule', clause: '§4.2', location: { path: filePath, key: 'title' }, message: 'Rule missing required field "title"' });
    }

    if (!data['source'] || !Array.isArray(data['source'])) {
      violations.push({ severity: 'error', check: 'check.rule', clause: '§4.2', location: { path: filePath, key: 'source' }, message: 'Rule missing required field "source" (list)' });
    } else {
      for (const src of data['source'] as string[]) {
        if (!resolveRelativePath(filePath, src) && !resolveId(index, src)) {
          violations.push({ severity: 'error', check: 'check.rule', clause: '§4.2', location: { path: filePath, key: 'source' }, message: `Rule source "${src}" does not resolve` });
        }
      }
    }

    if (!data['governs'] || !Array.isArray(data['governs'])) {
      violations.push({ severity: 'error', check: 'check.rule', clause: '§4.2', location: { path: filePath, key: 'governs' }, message: 'Rule missing required field "governs" (list)' });
    } else {
      // Appendix A check.rule-governs-resolves: every glob matches ≥1 real file (warning)
      for (const glob of data['governs'] as unknown[]) {
        if (typeof glob === 'string' && globMatchesNothing(root, glob)) {
          violations.push({ severity: 'warning', check: 'check.rule-governs-resolves', clause: '§4.2', location: { path: filePath, key: 'governs' }, message: `governs glob "${glob}" matches no files on disk` });
        }
      }
    }

    if (data['related_specs'] && Array.isArray(data['related_specs'])) {
      for (const specId of data['related_specs'] as string[]) {
        if (!resolveId(index, specId)) {
          violations.push({ severity: 'error', check: 'check.rule', clause: '§4.2', location: { path: filePath, key: 'related_specs' }, message: `related_specs ID "${specId}" does not resolve` });
        }
      }
    }

    if (data['check']) {
      const checkData = data['check'] as Record<string, unknown>;
      if (!CHECK_KIND_ENUM.includes(checkData['kind'] as (typeof CHECK_KIND_ENUM)[number])) {
        violations.push({ severity: 'error', check: 'check.rule', clause: '§4.2', location: { path: filePath, key: 'check.kind' }, message: `Rule check.kind "${checkData['kind']}" not in enum [${CHECK_KIND_ENUM.join(', ')}]` });
      }
      if (checkData['kind'] !== 'none' && !checkData['pattern']) {
        violations.push({ severity: 'error', check: 'check.rule', clause: '§4.2', location: { path: filePath, key: 'check.pattern' }, message: `Rule check.pattern is required when kind is not "none"` });
      }
    }
  }

  return violations;
}

export function checkBugs(root: string, index: ProjectIndex): Violation[] {
  const violations: Violation[] = [];
  const bugsDir = path.join(root, '.cortex', 'compass', 'bugs');

  if (!fs.existsSync(bugsDir)) return violations;

  // Schema §4.3: files are B-NNN-<slug>.md (bare B-NNN.md tolerated); id is the B-NNN prefix
  const bugFiles = fs.readdirSync(bugsDir).filter((f) => /^B-\d{3,}(-[A-Za-z0-9-]+)?\.md$/.test(f));

  for (const filename of bugFiles) {
    const filePath = path.join(bugsDir, filename);
    let data: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      data = matter(raw).data as Record<string, unknown>;
    } catch {
      continue;
    }

    const expectedId = (/^B-\d{3,}/.exec(filename) ?? [filename.replace('.md', '')])[0];

    if (!data['id']) {
      violations.push({ severity: 'error', check: 'check.bug', clause: '§4.3', location: { path: filePath, key: 'id' }, message: 'Bug missing required field "id"' });
    } else if (typeof data['id'] !== 'string' || !BUG_ID_PATTERN.test(data['id'])) {
      violations.push({ severity: 'error', check: 'check.bug', clause: '§4.3', location: { path: filePath, key: 'id' }, message: `Bug id "${data['id']}" does not match B-NNN pattern` });
    } else if (data['id'] !== expectedId) {
      violations.push({ severity: 'error', check: 'check.bug', clause: '§4.3', location: { path: filePath, key: 'id' }, message: `Bug id "${data['id']}" does not match filename "${expectedId}"` });
    }

    if (!data['title']) violations.push({ severity: 'error', check: 'check.bug', clause: '§4.3', location: { path: filePath, key: 'title' }, message: 'Bug missing required field "title"' });

    if (!data['type']) {
      violations.push({ severity: 'error', check: 'check.bug', clause: '§4.3', location: { path: filePath, key: 'type' }, message: 'Bug missing required field "type"' });
    } else if (!BUG_TYPE_ENUM.includes(data['type'] as (typeof BUG_TYPE_ENUM)[number])) {
      violations.push({ severity: 'error', check: 'check.bug', clause: '§4.3', location: { path: filePath, key: 'type' }, message: `Bug type "${data['type']}" not in enum [${BUG_TYPE_ENUM.join(', ')}]` });
    }

    if (!data['severity']) {
      violations.push({ severity: 'error', check: 'check.bug', clause: '§4.3', location: { path: filePath, key: 'severity' }, message: 'Bug missing required field "severity"' });
    } else if (!BUG_SEVERITY_ENUM.includes(data['severity'] as (typeof BUG_SEVERITY_ENUM)[number])) {
      violations.push({ severity: 'error', check: 'check.bug', clause: '§4.3', location: { path: filePath, key: 'severity' }, message: `Bug severity "${data['severity']}" not in enum [${BUG_SEVERITY_ENUM.join(', ')}]` });
    }

    if (!data['status']) {
      violations.push({ severity: 'error', check: 'check.bug', clause: '§4.3', location: { path: filePath, key: 'status' }, message: 'Bug missing required field "status"' });
    } else if (!BUG_STATUS_ENUM.includes(data['status'] as (typeof BUG_STATUS_ENUM)[number])) {
      violations.push({ severity: 'error', check: 'check.bug', clause: '§4.3', location: { path: filePath, key: 'status' }, message: `Bug status "${data['status']}" not in enum [${BUG_STATUS_ENUM.join(', ')}]` });
    }

    if (!data['affects'] || !Array.isArray(data['affects'])) {
      violations.push({ severity: 'error', check: 'check.bug', clause: '§4.3', location: { path: filePath, key: 'affects' }, message: 'Bug missing required field "affects" (list)' });
    }

    // Schema §4.2 (3.4 fifth revision, compass.bug-currency Rule 3): the three
    // optional currency fields, shape only — absent means unknown, never a
    // finding; no cross-field rule (a bare `triaged` is the triage loop's line).
    if (data['owner'] !== undefined && typeof data['owner'] !== 'string') {
      violations.push({ severity: 'error', check: 'check.bug', clause: '§4.2', location: { path: filePath, key: 'owner' }, message: `Bug "owner" must be a string (got ${describeType(data['owner'])})` });
    }
    if (data['fix_in_flight'] !== undefined && typeof data['fix_in_flight'] !== 'string') {
      violations.push({ severity: 'error', check: 'check.bug', clause: '§4.2', location: { path: filePath, key: 'fix_in_flight' }, message: `Bug "fix_in_flight" must be a string (a branch, PR URL or commit; got ${describeType(data['fix_in_flight'])})` });
    }
    if (data['found_at_commit'] !== undefined && (typeof data['found_at_commit'] !== 'string' || !FOUND_AT_COMMIT_PATTERN.test(data['found_at_commit']))) {
      violations.push({ severity: 'error', check: 'check.bug', clause: '§4.2', location: { path: filePath, key: 'found_at_commit' }, message: `Bug "found_at_commit" must match ${FOUND_AT_COMMIT_PATTERN} (a 7–40 character lowercase hex sha; got ${JSON.stringify(data['found_at_commit'])})` });
    }
  }

  return violations;
}

/** Schema §4.2's `found_at_commit` shape (compass.bug-currency Rule 1). */
const FOUND_AT_COMMIT_PATTERN = /^[0-9a-f]{7,40}$/;

function describeType(v: unknown): string {
  return v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v;
}

const RULE_FILE_PATTERN = /^R-\d{3,}(-[A-Za-z0-9-]+)?\.md$/;
const BUG_FILE_PATTERN = /^B-\d{3,}(-[A-Za-z0-9-]+)?\.md$/;
const H1_PATTERN = /^#\s+(.+)$/;
const H1_ID_TOKEN = /^([RB]-\d{3,})\b/;

/**
 * Validator Rule 13 (wave follow-up A, 2026-09-17): the body's first H1, when
 * it begins with an `R-NNN` / `B-NNN` token, must agree with `id:`. The H1 is
 * prose the schema does not shape (§4.1 rules, §4.2 bugs), so disagreement is
 * a warning; no H1, an H1 without the token, a non-string id or an unreadable
 * file is not a finding. Filename ↔ id stays check.rule / check.bug's error.
 */
export function checkCompassHeading(root: string): Violation[] {
  const violations: Violation[] = [];
  const targets: Array<{ dir: string; filePattern: RegExp; clause: string }> = [
    { dir: path.join(root, '.cortex', 'compass', 'rules'), filePattern: RULE_FILE_PATTERN, clause: '§4.1' },
    { dir: path.join(root, '.cortex', 'compass', 'bugs'), filePattern: BUG_FILE_PATTERN, clause: '§4.2' },
  ];

  for (const { dir, filePattern, clause } of targets) {
    if (!fs.existsSync(dir)) continue;
    for (const filename of fs.readdirSync(dir).filter((f) => filePattern.test(f))) {
      const filePath = path.join(dir, filename);
      let raw: string;
      let id: unknown;
      try {
        raw = fs.readFileSync(filePath, 'utf-8');
        id = (matter(raw).data as Record<string, unknown>)['id'];
      } catch {
        continue;
      }
      if (typeof id !== 'string') continue;

      const h1 = firstH1(raw);
      if (!h1) continue;
      const token = H1_ID_TOKEN.exec(h1.text)?.[1];
      if (!token || token === id) continue;

      violations.push({
        severity: 'warning',
        check: 'check.compass-heading',
        clause,
        location: { path: filePath, line: h1.line },
        message: `H1 "${token}" disagrees with id "${id}"`,
      });
    }
  }

  return violations;
}

/** The first `# …` line of the body (after a leading `---` frontmatter block), with its 1-based line number. */
function firstH1(raw: string): { text: string; line: number } | undefined {
  const lines = raw.split(/\r?\n/);
  let start = 0;
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (close > 0) start = close + 1;
  }
  for (let i = start; i < lines.length; i++) {
    const m = H1_PATTERN.exec(lines[i]!);
    if (m) return { text: m[1]!.trim(), line: i + 1 };
  }
  return undefined;
}
