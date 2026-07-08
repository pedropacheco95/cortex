/**
 * `cortex loop-rule-decay` — weekly rule-obsolescence review (spec
 * loops.rule-decay, design §11.4 item 5). Reviews every ACTIVE compass rule
 * for decay signals and writes retirement candidates to
 * `.cortex/pulse/rule-candidates.md` — nothing else. Propose-don't-mutate:
 * a human retires a rule by editing `status: retired`; this loop never does.
 * Deterministic Core (R-001); resolution logic reused from the validator
 * (index-build + globMatchesNothing), never reimplemented.
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { buildIndex, resolveId, resolveRelativePath } from '../schema/index-build.js';
import { globMatchesNothing } from '../schema/checks/compass.js';
import { gitLastCommitEpoch } from './git-info.js';
import { writePulseReport } from './report.js';

/** Engineering-call constant (Rule 2c) — stated in the report footer. */
export const RULE_DECAY_AGE_DAYS = 180;

const DAY_S = 24 * 60 * 60;

export interface RuleCandidate {
  id: string;
  /** Project-relative rule file path. */
  file: string;
  /** Which signals fired, each with its evidence (Rule 2). */
  signals: string[];
}

export interface RuleDecayScan {
  candidates: RuleCandidate[];
  /** Rules skipped because `status: retired` (Rule 3). */
  retiredSkipped: string[];
  /** Active rules reviewed in total. */
  reviewed: number;
}

export async function scanRuleDecay(root: string, nowMs = Date.now()): Promise<RuleDecayScan> {
  const rulesDir = path.join(root, '.cortex', 'compass', 'rules');
  const scan: RuleDecayScan = { candidates: [], retiredSkipped: [], reviewed: 0 };
  if (!fs.existsSync(rulesDir)) return scan;

  const index = await buildIndex(root);
  const ruleFiles = fs
    .readdirSync(rulesDir)
    .filter((f) => /^R-\d{3,}(-[A-Za-z0-9-]+)?\.md$/.test(f))
    .sort();

  for (const filename of ruleFiles) {
    const filePath = path.join(rulesDir, filename);
    let data: Record<string, unknown> = {};
    try {
      data = matter(fs.readFileSync(filePath, 'utf-8')).data as Record<string, unknown>;
    } catch {
      continue;
    }
    const id = typeof data['id'] === 'string' ? (data['id'] as string) : filename.replace(/\.md$/, '');

    // Rule 3: the loop reviews the living.
    if (data['status'] === 'retired') {
      scan.retiredSkipped.push(id);
      continue;
    }
    scan.reviewed++;

    const governs = Array.isArray(data['governs'])
      ? (data['governs'] as unknown[]).filter((g): g is string => typeof g === 'string')
      : [];
    const sources = Array.isArray(data['source'])
      ? (data['source'] as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];

    // Signal (a): every governs glob matches zero on-disk files.
    const deadGlobs = governs.filter((g) => globMatchesNothing(root, g));
    const allGovernsDead = governs.length > 0 && deadGlobs.length === governs.length;

    // Signal (b): any source no longer resolves (validator resolution logic).
    const deadSources = sources.filter(
      (s) => !resolveRelativePath(filePath, s) && !resolveId(index, s),
    );

    const signals: string[] = [];
    if (allGovernsDead) {
      signals.push(
        `every governs glob matches zero on-disk files: ${deadGlobs.map((g) => `\`${g}\``).join(', ')}`,
      );
    }
    if (deadSources.length > 0) {
      signals.push(
        `source no longer resolves: ${deadSources.map((s) => `\`${s}\``).join(', ')}`,
      );
    }
    // Signal (c): file older than RULE_DECAY_AGE_DAYS *and* (a) holds.
    if (allGovernsDead) {
      const rel = path.relative(root, filePath);
      const epoch = (await gitLastCommitEpoch(root, rel)) ?? Math.floor(fs.statSync(filePath).mtimeMs / 1000);
      const ageDays = Math.floor((nowMs / 1000 - epoch) / DAY_S);
      if (ageDays > RULE_DECAY_AGE_DAYS) {
        signals.push(`rule file is ${ageDays} days old (> ${RULE_DECAY_AGE_DAYS}) while its governs match nothing`);
      }
    }

    if (signals.length > 0) {
      scan.candidates.push({ id, file: path.relative(root, filePath), signals });
    }
  }
  return scan;
}

export async function runRuleDecay(root = '.', opts: { now?: Date } = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();
  const scan = await scanRuleDecay(absRoot, now.getTime());

  const lines: string[] = ['# Rule retirement candidates', ''];
  if (scan.candidates.length === 0) {
    lines.push('No retirement candidates this cycle.', '');
  } else {
    for (const c of scan.candidates) {
      lines.push(`## ${c.id}`, '', `File: \`${c.file}\``, '', 'Signals:', '');
      for (const s of c.signals) lines.push(`- ${s}`);
      lines.push('', 'Suggested next step: verify the evidence, then retire by editing `status: retired` (human action — this loop never edits rules).', '');
    }
  }
  lines.push(
    '---',
    '',
    `Reviewed ${scan.reviewed} active rule(s); skipped ${scan.retiredSkipped.length} retired rule(s). Signals: (a) all governs globs match nothing; (b) any source unresolvable; (c) rule file older than ${RULE_DECAY_AGE_DAYS} days while (a) holds. Rule age via git last-commit date, falling back to file mtime outside git history. The "violated recently without correction" signal is deferred until violation telemetry exists.`,
  );

  writePulseReport(
    absRoot,
    'rule-candidates.md',
    'pulse-rule-candidates',
    'cortex-loop-rule-decay',
    now.toISOString(),
    lines.join('\n'),
  );
  console.log(
    `cortex loop-rule-decay: wrote .cortex/pulse/rule-candidates.md (${scan.candidates.length} candidate(s) from ${scan.reviewed} active rule(s)).`,
  );
  return 0;
}
