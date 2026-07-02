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
  const rulesDir = path.join(root, '.cortex', 'cerebrum', 'rules');

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
  const bugsDir = path.join(root, '.cortex', 'cerebrum', 'bugs');

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
  }

  return violations;
}
