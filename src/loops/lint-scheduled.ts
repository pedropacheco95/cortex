/**
 * `cortex loop-specflow-lint` — the daily scheduled spec-lint loop (spec
 * loops.lint-scheduled, design §11.4 item 8). The cadence-and-paper-trail
 * wrapper around structural spec checking: runs the schema validator's
 * existing `validate()` (consumed, never reimplemented), groups the
 * spec-tree-relevant violations by check, and always-writes
 * `pulse/lint-report.md`. Exit 0 clean or dirty — the report is the product;
 * `cortex validate` is the CI gate. Deterministic Core (R-001); WRITES only
 * the report.
 */
import * as path from 'path';
import { validate } from '../schema/validate.js';
import type { Violation } from '../schema/types.js';
import { writePulseReport } from './report.js';
import { SPECS_REL, BUSINESS_REL } from '../paths.js';

export const LINT_REPORT_FILE = 'lint-report.md';

/** Spec Rule 2: the spec tree = these three roots. `tests/scenario/specs/`
 *  stays at the project root (§2.3); the two moved trees live under `.specflow/`. */
const SPEC_TREE_PREFIXES = [SPECS_REL, BUSINESS_REL, path.join('tests', 'scenario', 'specs')];

/** Project-relative form of a violation's location path. */
export function violationRelPath(root: string, locationPath: string): string {
  const rel = path.isAbsolute(locationPath) ? path.relative(root, locationPath) : locationPath;
  return rel.split(path.sep).join('/');
}

/** True when a violation's location lies under specs/, specs-business/, or tests/scenario/specs/. */
export function isSpecTreeViolation(root: string, v: Violation): boolean {
  const rel = violationRelPath(root, v.location.path);
  return SPEC_TREE_PREFIXES.some((prefix) => {
    const p = prefix.split(path.sep).join('/');
    return rel === p || rel.startsWith(`${p}/`);
  });
}

export interface LintRunOptions {
  now?: Date;
}

export async function runLintScheduled(root = '.', opts: LintRunOptions = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();

  // Rule 2: substance = the validator, consumed as-is.
  const report = await validate(absRoot, { root: absRoot });

  const specViolations = report.violations.filter((v) => isSpecTreeViolation(absRoot, v));
  const otherCount = report.violations.length - specViolations.length;
  const errors = specViolations.filter((v) => v.severity === 'error').length;
  const warnings = specViolations.length - errors;

  const lines: string[] = ['# Spec-lint report', ''];

  if (specViolations.length === 0) {
    // Rule 3 — always-write: a conformant tree is a stated clean run.
    lines.push('Spec tree structurally sound.', '', '0 error(s), 0 warning(s) across `.specflow/specs/`, `.specflow/specs-business/`, and `tests/scenario/specs/`.', '');
  } else {
    // Rule 2: group by check, each with file, clause, and message.
    const byCheck = new Map<string, Violation[]>();
    for (const v of specViolations) {
      const group = byCheck.get(v.check);
      if (group) group.push(v);
      else byCheck.set(v.check, [v]);
    }
    for (const check of [...byCheck.keys()].sort()) {
      const group = byCheck.get(check) as Violation[];
      lines.push(`## ${check}`, '');
      for (const v of group) {
        const key = v.location.key !== undefined ? ` (\`${v.location.key}\`)` : '';
        lines.push(`- [${v.severity}] \`${violationRelPath(absRoot, v.location.path)}\`${key} — ${v.clause} — ${v.message}`);
      }
      lines.push('');
    }
    lines.push(`${errors} error(s), ${warnings} warning(s) across the spec trees.`, '');
  }

  if (otherCount > 0) {
    lines.push(
      `${otherCount} violation(s) elsewhere in the project (outside the spec trees) — run \`cortex validate\` for the full report.`,
      '',
    );
  }

  lines.push(
    '---',
    '',
    'Substance: the schema validator\'s spec-tree checks over `.specflow/specs/`, `.specflow/specs-business/`, and ' +
      '`tests/scenario/specs/`. Exit 0 clean or dirty — this report is the daily record; `cortex validate` is the ' +
      'CI gate. The interactive `specflow-lint` skill remains the deep path.',
  );

  writePulseReport(absRoot, LINT_REPORT_FILE, 'pulse-lint-report', 'cortex-loop-specflow-lint', now.toISOString(), lines.join('\n'));
  console.log(
    `cortex loop-specflow-lint: wrote .cortex/pulse/${LINT_REPORT_FILE} ` +
      `(${specViolations.length} spec-tree violation(s): ${errors} error(s), ${warnings} warning(s)).`,
  );
  return 0;
}
