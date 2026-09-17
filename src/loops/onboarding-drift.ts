/**
 * `cortex loop-onboarding-drift` — monthly scaffolding-drift review (spec
 * loops.onboarding-drift, design §11.4 item 7). Checks the CLAUDE.md managed
 * block and every `_index.md` under `.cortex/` against the current schema's
 * templates and budgets, and writes refresh proposals to
 * `.cortex/pulse/reports/scaffolding-review.md` — nothing else. Propose-don't-mutate:
 * refreshing is the human running `cortex sync` (spec core-cli.sync).
 *
 * Reuse (Rule 2): heading checks come from the validator's
 * `check.index-shape` (src/schema/checks/layout.ts); the managed-block parse
 * is the shared §8 helper (src/schema/checks/claude-md.ts); templates come
 * from src/cli/templates.ts. The token budget here is the spec's own chars/4
 * estimate (schema §5), deliberately not check.index-shape's word-count
 * heuristic — the spec pins chars/4.
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { checkIndexShape } from '../schema/checks/layout.js';
import { readManagedBlockVersion } from '../schema/checks/claude-md.js';
import { computeTokens } from '../insight/measure.js';
import { CORTEX_INDEXES } from '../cli/templates.js';
import { writePulseReport } from './report.js';

/** Schema §7.1 active-prompt budget — stated in the report footer. */
export const INDEX_TOKEN_BUDGET = 300;

export interface DriftFinding {
  finding: string;
  /** The concrete refresh action proposed (Rule 2: each finding proposes one). */
  action: string;
  /** Signal (d) is a labelled heuristic hint, never an error (Notes). */
  heuristic?: boolean;
}

function readConfigSchemaVersion(root: string): string | null {
  try {
    const config = JSON.parse(
      fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8'),
    ) as Record<string, unknown>;
    return typeof config['schemaVersion'] === 'string' ? (config['schemaVersion'] as string) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// (a) CLAUDE.md managed block: marker version vs schemaVersion, or missing
// ---------------------------------------------------------------------------

export function checkClaudeMdVersion(root: string): DriftFinding[] {
  const claudeMdPath = path.join(root, 'CLAUDE.md');
  const schemaVersion = readConfigSchemaVersion(root);
  const refresh = 'run `cortex sync` to refresh the managed block';

  if (!fs.existsSync(claudeMdPath)) {
    return [{ finding: 'CLAUDE.md is missing (no managed block directs Claude into Cortex)', action: refresh }];
  }
  const block = readManagedBlockVersion(fs.readFileSync(claudeMdPath, 'utf-8'));
  if (!block.present) {
    return [{ finding: 'CLAUDE.md has no cortex managed block', action: refresh }];
  }
  if (schemaVersion === null) {
    return [
      {
        finding: 'cortex.config.json has no readable schemaVersion — the managed block version cannot be compared',
        action: 'restore .cortex/cortex.config.json (e.g. via `cortex init --force`)',
      },
    ];
  }
  if (block.version === null) {
    return [{ finding: 'the CLAUDE.md managed block declares no version', action: refresh }];
  }
  if (block.version !== schemaVersion) {
    return [
      {
        finding: `the CLAUDE.md managed block is v${block.version} while cortex.config.json schemaVersion is ${schemaVersion}`,
        action: refresh,
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// (b) _index.md missing a §7.1 required heading — via check.index-shape
// ---------------------------------------------------------------------------

export function checkIndexHeadings(root: string): DriftFinding[] {
  return checkIndexShape(root)
    .filter((v) => v.check === 'check.index-shape' && v.message.includes('missing'))
    .map((v) => ({
      finding: `\`${path.relative(root, v.location.path)}\` — ${v.message} (consistent with check.index-shape)`,
      action: 'restore the §7.1 shape (`cortex sync` rewrites the template), then re-localise the prompt',
    }));
}

// ---------------------------------------------------------------------------
// (c) _index.md over the 300-token budget (chars/4, schema §5)
// ---------------------------------------------------------------------------

export async function checkIndexBudgets(root: string): Promise<DriftFinding[]> {
  const cortexDir = path.join(root, '.cortex');
  if (!fs.existsSync(cortexDir)) return [];
  const indexFiles = (await fg('**/_index.md', { cwd: cortexDir, absolute: true })).sort();
  const findings: DriftFinding[] = [];
  for (const file of indexFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const tokens = computeTokens(content);
    if (tokens > INDEX_TOKEN_BUDGET) {
      findings.push({
        finding: `\`${path.relative(root, file)}\` — estimated ${tokens} tokens (chars/4) against the ${INDEX_TOKEN_BUDGET}-token budget`,
        action: 'tighten the prompt back under budget (indexes are prompts, not documentation)',
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// (d) heuristic: template-identical _index.md in a directory that has since
//     gained artefacts — the prompt was likely never localised
// ---------------------------------------------------------------------------

/** Directories where localisation matters (curated knowledge); machine-written
 *  (insight) and transient (pulse) trees are excluded, as is the root. */
const HEURISTIC_DIRS = [
  'compass',
  'compass/rules',
  'compass/bugs',
  'atlas',
  'atlas/stakeholders',
  'atlas/decisions',
  'atlas/domain',
];

/** Files `cortex init` itself creates — their presence is not "gained artefacts". */
const INIT_SKELETON_FILES: Record<string, Set<string>> = {
  compass: new Set(['preferences.md', 'environment.md', 'do-not-repeat.md', 'standing-authorities.md', 'registry.md']), // registry.md: schema.id-registry (3.4 fifth revision), created by init and sync
};

export function checkTemplateIdentical(root: string): DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const rel of HEURISTIC_DIRS) {
    const template = CORTEX_INDEXES[rel];
    if (template === undefined) continue;
    const dir = path.join(root, '.cortex', rel);
    const indexPath = path.join(dir, '_index.md');
    if (!fs.existsSync(indexPath)) continue;
    let content: string;
    try {
      content = fs.readFileSync(indexPath, 'utf-8');
    } catch {
      continue;
    }
    if (content !== template) continue; // localised — fine
    const skeleton = INIT_SKELETON_FILES[rel] ?? new Set<string>();
    let artefacts: string[];
    try {
      artefacts = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name !== '_index.md' && e.name !== '_overview.md' && !skeleton.has(e.name))
        .map((e) => e.name);
    } catch {
      continue;
    }
    if (artefacts.length > 0) {
      findings.push({
        heuristic: true,
        finding: `\`.cortex/${rel}/_index.md\` is byte-identical to the shipped template while the directory has gained ${artefacts.length} artefact(s) — the prompt may never have been localised`,
        action: 'review and localise the index prompt to describe what actually lives there',
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// the loop + report (always-write, schema §4.5)
// ---------------------------------------------------------------------------

export async function runOnboardingDrift(root = '.', opts: { now?: Date } = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();

  const findings: DriftFinding[] = [
    ...checkClaudeMdVersion(absRoot),
    ...checkIndexHeadings(absRoot),
    ...(await checkIndexBudgets(absRoot)),
    ...checkTemplateIdentical(absRoot),
  ];

  const lines: string[] = ['# Scaffolding review', ''];
  if (findings.length === 0) {
    lines.push('Scaffolding is current.', '');
  } else {
    for (const f of findings) {
      lines.push(`- ${f.heuristic ? '(heuristic hint) ' : ''}${f.finding}. Proposed refresh: ${f.action}.`);
    }
    lines.push('');
  }
  lines.push(
    '---',
    '',
    `Checks: CLAUDE.md managed-block version vs schemaVersion; _index.md §7.1 headings (via check.index-shape); _index.md ${INDEX_TOKEN_BUDGET}-token budget (chars/4); template-identical indexes in grown directories (heuristic hint, never an error). Propose-don't-mutate: refreshes are \`cortex sync\`-style human actions.`,
  );

  writePulseReport(
    absRoot,
    'scaffolding-review.md',
    'pulse-scaffolding-review',
    'cortex-loop-onboarding-drift',
    now.toISOString(),
    lines.join('\n'),
  );
  console.log(
    `cortex loop-onboarding-drift: wrote .cortex/pulse/reports/scaffolding-review.md (${findings.length} finding(s)).`,
  );
  return 0;
}
