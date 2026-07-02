/**
 * `cortex loop-specflow-verify` — the daily scheduled test-coverage
 * verification loop (spec loops.verify-scheduled, design §11.4 item 9).
 * Checks that every spec has the tests it is owed by the schema §3 path
 * conventions — existence and coverage only; running tests is the
 * test-runner's job:
 *
 * (a) every dev LEAF spec has an atomic-layer and a spec-layer test file at
 *     its conventional path (capability level optional per §2.1 — both
 *     `tests/<layer>/<domain>/<leaf>.test.ts` and
 *     `tests/<layer>/<domain>/<capability>/<leaf>.test.ts` are accepted);
 * (b) every business spec has a journey-layer test;
 * (c) every business spec appears in ≥1 scenario's `covers:` — the §8.2
 *     completeness constraint, deliberately owned here, not by the validator
 *     (schema Decision 4).
 *
 * Deferrals are distinguished: a journey gap whose spec Notes declare the
 * journey-deferral convention lands under "Deferred by decision", separate
 * from genuine gaps. Always-writes `pulse/verification-report.md`; read-only
 * otherwise (R-001); exit 0 regardless — the report is the product.
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { writePulseReport } from './report.js';

export const VERIFICATION_REPORT_FILE = 'verification-report.md';

/**
 * The journey-deferral convention (spec Rule 3), matched against a spec's
 * Notes section. Both observed shapes are honoured and the report footer
 * states them: the hooks specs write "Journey-layer tests deferred to v1.1";
 * others write "... journey tier, deferred to v1.1 ...".
 */
export const DEFERRAL_PATTERNS: RegExp[] = [/journey[- ]layer tests deferred/i, /deferred to v1\.1/i];

/** The `## Notes` section body of a spec's markdown content ('' when absent). */
export function notesSection(body: string): string {
  const m = /^##\s+Notes\s*$/m.exec(body);
  if (!m) return '';
  const start = (m.index ?? 0) + m[0].length;
  const rest = body.slice(start);
  const next = /^##\s+/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** True when the spec's Notes declare the journey-deferral convention. */
export function hasDeclaredDeferral(body: string): boolean {
  const notes = notesSection(body);
  return DEFERRAL_PATTERNS.some((re) => re.test(notes));
}

/**
 * Schema §3 conventional test paths for a spec at `segments` (its directory
 * path under the spec tree) + `name`. Capability level optional (§2.1): the
 * fully mirrored path and the domain-level path are BOTH accepted leaf shapes.
 */
export function testCandidatePaths(layer: string, segments: string[], name: string): string[] {
  const candidates: string[] = [];
  if (segments.length > 0) {
    candidates.push(['tests', layer, ...segments, `${name}.test.ts`].join('/'));
    const domain = segments[0] as string;
    const domainLevel = ['tests', layer, domain, `${name}.test.ts`].join('/');
    if (!candidates.includes(domainLevel)) candidates.push(domainLevel);
  } else {
    candidates.push(['tests', layer, `${name}.test.ts`].join('/'));
  }
  return candidates;
}

function existsAny(root: string, rels: string[]): boolean {
  return rels.some((rel) => fs.existsSync(path.join(root, rel)));
}

function walkMd(dir: string, suffix: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const found: string[] = [];
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(suffix)) found.push(full);
    }
  };
  walk(dir);
  return found;
}

interface DevLeaf {
  id: string;
  /** Project-relative spec path. */
  file: string;
  /** Directory segments under specs/. */
  segments: string[];
  /** Leaf name (filename minus .spec.md). */
  name: string;
  /** Absolute path the `implements:` business spec resolves to (null if none). */
  implementsAbs: string | null;
  deferral: boolean;
}

interface BusinessSpec {
  id: string;
  file: string;
  abs: string;
  segments: string[];
  name: string;
  deferral: boolean;
}

function implementsValue(data: Record<string, unknown>): string | null {
  const raw = data['implements'];
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim();
  if (Array.isArray(raw) && raw.length === 1 && typeof raw[0] === 'string') return (raw[0] as string).trim();
  return null;
}

/** Dev LEAF specs (§2.1: a leaf is the implementable spec — it carries `implements:`). */
export function scanDevLeaves(root: string): DevLeaf[] {
  const specsDir = path.join(root, 'specs');
  const leaves: DevLeaf[] = [];
  for (const abs of walkMd(specsDir, '.spec.md')) {
    let parsed: { data: Record<string, unknown>; content: string };
    try {
      const file = matter(fs.readFileSync(abs, 'utf-8'));
      parsed = { data: file.data as Record<string, unknown>, content: file.content };
    } catch {
      continue;
    }
    const impl = implementsValue(parsed.data);
    if (impl === null) continue; // domain/capability spec — owes no leaf tests
    const rel = path.relative(specsDir, abs);
    const segments = path.dirname(rel) === '.' ? [] : path.dirname(rel).split(path.sep);
    const name = path.basename(rel).replace(/\.spec\.md$/, '');
    const id = typeof parsed.data['id'] === 'string' ? (parsed.data['id'] as string) : name;
    const resolved = path.resolve(path.dirname(abs), impl);
    leaves.push({
      id,
      file: path.relative(root, abs).split(path.sep).join('/'),
      segments,
      name,
      implementsAbs: fs.existsSync(resolved) ? resolved : null,
      deferral: hasDeclaredDeferral(parsed.content),
    });
  }
  return leaves;
}

export function scanBusinessSpecs(root: string): BusinessSpec[] {
  const bizDir = path.join(root, 'specs-business');
  const specs: BusinessSpec[] = [];
  for (const abs of walkMd(bizDir, '.business.md')) {
    let parsed: { data: Record<string, unknown>; content: string };
    try {
      const file = matter(fs.readFileSync(abs, 'utf-8'));
      parsed = { data: file.data as Record<string, unknown>, content: file.content };
    } catch {
      continue;
    }
    const rel = path.relative(bizDir, abs);
    const segments = path.dirname(rel) === '.' ? [] : path.dirname(rel).split(path.sep);
    const name = path.basename(rel).replace(/\.business\.md$/, '');
    const id = typeof parsed.data['id'] === 'string' ? (parsed.data['id'] as string) : name;
    specs.push({
      id,
      file: path.relative(root, abs).split(path.sep).join('/'),
      abs,
      segments,
      name,
      deferral: hasDeclaredDeferral(parsed.content),
    });
  }
  return specs;
}

/** Business-spec IDs named by ≥1 scenario spec's `covers:` (§4.8 / §8.2). */
export function scanScenarioCovers(root: string): Set<string> {
  const covered = new Set<string>();
  const dir = path.join(root, 'tests', 'scenario', 'specs');
  if (!fs.existsSync(dir)) return covered;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
    try {
      const data = matter(fs.readFileSync(path.join(dir, name), 'utf-8')).data as Record<string, unknown>;
      const covers = data['covers'];
      if (Array.isArray(covers)) {
        for (const id of covers) if (typeof id === 'string') covered.add(id);
      }
    } catch {
      /* malformed scenario spec covers nothing */
    }
  }
  return covered;
}

export interface VerifyRunOptions {
  now?: Date;
}

export async function runVerifyScheduled(root = '.', opts: VerifyRunOptions = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();

  const leaves = scanDevLeaves(absRoot);
  const business = scanBusinessSpecs(absRoot);
  const covers = scanScenarioCovers(absRoot);

  // (a) dev leaf gaps — atomic + spec layers.
  const devGaps: { leaf: DevLeaf; missing: string[] }[] = [];
  for (const leaf of leaves) {
    const missing: string[] = [];
    for (const layer of ['atomic', 'spec']) {
      const candidates = testCandidatePaths(layer, leaf.segments, leaf.name);
      if (!existsAny(absRoot, candidates)) missing.push(candidates[0] as string);
    }
    if (missing.length > 0) devGaps.push({ leaf, missing });
  }

  // Journey deferral propagates from implementing dev specs to their business
  // spec (the convention lives in dev-spec Notes — e.g. the hooks round).
  const deferredBusinessAbs = new Set<string>();
  for (const leaf of leaves) {
    if (leaf.deferral && leaf.implementsAbs !== null) deferredBusinessAbs.add(leaf.implementsAbs);
  }

  // (b) + (c) business gaps — journey layer + scenario covers.
  const bizGaps: { spec: BusinessSpec; missing: string[] }[] = [];
  const deferred: { spec: BusinessSpec; journeyPath: string }[] = [];
  for (const spec of business) {
    const journeyCandidates = testCandidatePaths('journey', spec.segments, spec.name);
    const missing: string[] = [];
    if (!existsAny(absRoot, journeyCandidates)) {
      if (spec.deferral || deferredBusinessAbs.has(spec.abs)) {
        deferred.push({ spec, journeyPath: journeyCandidates[0] as string });
      } else {
        missing.push(`missing journey test \`${journeyCandidates[0]}\``);
      }
    }
    if (!covers.has(spec.id)) {
      missing.push('absent from every scenario `covers:` (§8.2 completeness)');
    }
    if (missing.length > 0) bizGaps.push({ spec, missing });
  }

  const lines: string[] = ['# Test-coverage verification', ''];
  const clean = devGaps.length === 0 && bizGaps.length === 0 && deferred.length === 0;
  if (clean) {
    lines.push('All specs carry their owed tests.', '');
  }

  lines.push('## Dev spec gaps (atomic + spec layers)', '');
  if (devGaps.length === 0) {
    lines.push('Every dev leaf spec carries its atomic and spec tests.', '');
  } else {
    for (const g of devGaps) {
      lines.push(`- \`${g.leaf.id}\` (\`${g.leaf.file}\`): missing ${g.missing.map((m) => `\`${m}\``).join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## Business spec gaps (journey + scenario coverage)', '');
  if (bizGaps.length === 0) {
    lines.push('Every business spec carries its journey test and scenario coverage.', '');
  } else {
    for (const g of bizGaps) {
      lines.push(`- \`${g.spec.id}\` (\`${g.spec.file}\`): ${g.missing.join('; ')}`);
    }
    lines.push('');
  }

  lines.push('## Deferred by decision', '');
  if (deferred.length === 0) {
    lines.push('No declared deferrals.', '');
  } else {
    for (const d of deferred) {
      lines.push(
        `- \`${d.spec.id}\` (\`${d.spec.file}\`): journey test \`${d.journeyPath}\` deferred — spec Notes declare the journey-deferral convention`,
      );
    }
    lines.push('');
  }

  lines.push(
    '---',
    '',
    `Checked ${leaves.length} dev leaf spec(s) and ${business.length} business spec(s): ${devGaps.length} dev gap(s), ` +
      `${bizGaps.length} business gap(s), ${deferred.length} deferred. Conventions: schema §3 paths, capability level ` +
      'optional (§2.1) — both `tests/<layer>/<domain>/<leaf>.test.ts` and `tests/<layer>/<domain>/<capability>/<leaf>.test.ts` ' +
      'accepted. Deferral convention matched in spec Notes: /journey[- ]layer tests deferred/i or /deferred to v1\\.1/i. ' +
      '§8.2 covers-completeness is owned here, not by the validator (schema Decision 4). Existence and coverage only — ' +
      'running tests is the test-runner\'s job. Exit 0 regardless; the report is the product.',
  );

  writePulseReport(
    absRoot,
    VERIFICATION_REPORT_FILE,
    'pulse-verification-report',
    'cortex-loop-specflow-verify',
    now.toISOString(),
    lines.join('\n'),
  );
  console.log(
    `cortex loop-specflow-verify: wrote .cortex/pulse/${VERIFICATION_REPORT_FILE} ` +
      `(${devGaps.length} dev gap(s), ${bizGaps.length} business gap(s), ${deferred.length} deferred).`,
  );
  return 0;
}
