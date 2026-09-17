import * as fs from 'fs';
import * as path from 'path';
import type { Violation } from '../types.js';

/**
 * check.index-completeness — validator Rule 14 (wave follow-up A, 2026-09-17;
 * schema Appendix A, §7.1). `compass/rules/_index.md` should reference every
 * `R-NNN` file in `compass/rules/`, and `compass/bugs/_index.md` every `B-NNN`
 * file in `compass/bugs/`. An id counts as referenced when its literal token
 * appears anywhere in the index, or when it lies inside a same-prefix range
 * (`R-001–R-003`; en dash, em dash or hyphen). An index that collapsed to fit
 * its budget — a `… and N more` line or a generated `<!-- cortex:recall:start`
 * block — counts as complete without a scan. Absence of the directory or the
 * index is check.index-present's finding, not this check's.
 */

const ID_TOKEN = /\b([RB])-(\d{3,})\b/g;
// `B-001–B-003`, also tolerated with a backtick on either side of the dash
// (this repo's own bug index writes `B-001`–`B-020`)
const ID_RANGE = /\b([RB])-(\d{3,})`?\s*[–—-]\s*`?\1-(\d{3,})\b/g;
const COLLAPSED_TAIL = /…\s*and\s+\d+\s+more/;
const GENERATED_BLOCK = '<!-- cortex:recall:start';

export function referencedIds(indexBody: string, prefix: 'R' | 'B'): Set<string> {
  const ids = new Set<string>();
  for (const m of indexBody.matchAll(ID_TOKEN)) {
    if (m[1] === prefix) ids.add(`${prefix}-${m[2]}`);
  }
  for (const m of indexBody.matchAll(ID_RANGE)) {
    if (m[1] !== prefix) continue;
    const from = m[2]!;
    const to = m[3]!;
    const width = Math.max(from.length, to.length);
    const lo = Number(from);
    const hi = Number(to);
    for (let n = Math.min(lo, hi); n <= Math.max(lo, hi); n++) {
      ids.add(`${prefix}-${String(n).padStart(width, '0')}`);
    }
  }
  return ids;
}

export function isCollapsed(indexBody: string): boolean {
  return COLLAPSED_TAIL.test(indexBody) || indexBody.includes(GENERATED_BLOCK);
}

export function checkIndexCompleteness(root: string): Violation[] {
  const violations: Violation[] = [];
  const targets: Array<{ dir: string; prefix: 'R' | 'B'; filePattern: RegExp; kind: string }> = [
    { dir: path.join(root, '.cortex', 'compass', 'rules'), prefix: 'R', filePattern: /^R-\d{3,}(-[A-Za-z0-9-]+)?\.md$/, kind: 'rules' },
    { dir: path.join(root, '.cortex', 'compass', 'bugs'), prefix: 'B', filePattern: /^B-\d{3,}(-[A-Za-z0-9-]+)?\.md$/, kind: 'bugs' },
  ];

  for (const { dir, prefix, filePattern, kind } of targets) {
    const indexPath = path.join(dir, '_index.md');
    if (!fs.existsSync(dir) || !fs.existsSync(indexPath)) continue;

    let body: string;
    let filenames: string[];
    try {
      body = fs.readFileSync(indexPath, 'utf-8');
      filenames = fs.readdirSync(dir);
    } catch {
      continue;
    }
    if (isCollapsed(body)) continue;

    const onDisk = new Set<string>();
    for (const f of filenames) {
      if (filePattern.test(f)) onDisk.add(new RegExp(`^${prefix}-\\d{3,}`).exec(f)![0]);
    }
    if (onDisk.size === 0) continue;

    const referenced = referencedIds(body, prefix);
    const missing = [...onDisk].filter((id) => !referenced.has(id)).sort();
    if (missing.length === 0) continue;

    const total = onDisk.size;
    violations.push({
      severity: 'warning',
      check: 'check.index-completeness',
      clause: '§7.1',
      location: { path: indexPath },
      message: `index lists ${total - missing.length} of ${total} ${kind} (missing: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''})`,
    });
  }

  return violations;
}
