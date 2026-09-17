/**
 * Spec-level tests — `archive.ingest-skill` "An emitted promotion is
 * acceptable by the gate it targets (B-020)". The producer is a skill (no
 * Core code); what Core owns is the gate. This slice writes the skill's step
 * 4 section verbatim into `.cortex/pulse/reports/archive-ingestion.md` of an
 * initialised project and drives the CLI entry: `cortex pulse-list`,
 * `cortex pulse-accept`, then `cortex validate --json` on the landed
 * artefact — the producer's output is acceptable end to end
 * (`insight.promotion-mechanism` Rule 5 as corrected 2026-09-17).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import { run } from '../../../src/cli/cli.js';
import type { ValidationReport, Violation } from '../../../src/schema/types.js';

const INIT_TIMEOUT = 90_000;
const dirs: string[] = [];
const originalCwd = process.cwd();
let home = '';
let logs: string[] = [];
let errors: string[] = [];

function tmp(label: string): string {
  const d = makeTmpDir(`ingest-skill-spec-${label}`);
  dirs.push(d);
  return d;
}

async function withHomeEnv<T>(homeDir: string, fn: () => Promise<T>): Promise<T> {
  const original = process.env['HOME'];
  process.env['HOME'] = homeDir;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env['HOME'];
    else process.env['HOME'] = original;
  }
}

async function cortex(root: string, argv: string[]): Promise<number> {
  process.chdir(root);
  try {
    return await withHomeEnv(home, () => run(argv));
  } finally {
    process.chdir(originalCwd);
  }
}

function clearCapture(): void {
  logs = [];
  errors = [];
}

async function validateJson(root: string): Promise<Violation[]> {
  clearCapture();
  await cortex(root, ['validate', '--json']);
  return (JSON.parse(logs.join('\n')) as ValidationReport).violations;
}

beforeEach(() => {
  home = tmp('home');
  clearCapture();
  vi.spyOn(console, 'log').mockImplementation((msg: unknown) => {
    logs.push(String(msg));
  });
  vi.spyOn(console, 'error').mockImplementation((msg: unknown) => {
    errors.push(String(msg));
  });
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function write(root: string, rel: string, content: string): void {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

const SLUG = 'client-brief-2026-09';
const EXTRACTED = `archive/documents/${SLUG}/extracted/asks.md`;

const REPORT_HEADER = `---
kind: pulse-archive-ingestion
generated: 2026-09-17T10:00:00Z
loop: cortex-archive-ingest
---

# Archive ingestion

`;

/** The skill's step 4 template, verbatim shape: a promotion creating a compass rule. */
const RULE_SECTION = `## S-001: Coordinators read compass before dispatching

**Type:** promotion
**Source:** cortex-archive-ingest — ${EXTRACTED}
**Target:** .cortex/compass/rules/R-004-coordinators-read-compass.md
**Proposed file:**

\`\`\`\`
---
id: R-004
title: Coordinators read compass before dispatching
source:
  - ../../${EXTRACTED}
governs:
  - "src/**"
confidence: EXTRACTED
provenance:
  - derives_from: ${EXTRACTED}
---

# R-004 — Coordinators read compass before dispatching

A session that dispatches work reads \`compass/\` first.
\`\`\`\`
`;

/** A second section of the same template into atlas (a create). */
const STAKEHOLDER_SECTION = `## S-002: Record the wave coordinator as a stakeholder

**Type:** promotion
**Source:** cortex-archive-ingest — ${EXTRACTED}
**Target:** .cortex/atlas/stakeholders/wave-coordinator.md
**Proposed file:**

\`\`\`
---
id: stakeholder.wave-coordinator
name: Wave coordinator
role: Author of the brief
provenance:
  - derives_from: ${EXTRACTED}
---

# Wave coordinator

Author of the brief.
\`\`\`
`;

describe('An emitted promotion is acceptable by the gate it targets (B-020)', () => {
  it(
    'the step 4 template lists as pending, accepts with exit 0, lands with source: and provenance: resolving, registers the rule id, and touches nothing under insight/',
    async () => {
      const root = tmp('accept');
      expect(await cortex(root, ['init', '--no-llm', '--yes'])).toBe(0);
      write(root, `.cortex/${EXTRACTED}`, '# Asks\n\n- A-08: coordinators read compass first.\n');
      write(root, '.cortex/pulse/state/suggestion-counter', '2\n');
      write(root, '.cortex/pulse/reports/archive-ingestion.md', REPORT_HEADER + RULE_SECTION + '\n' + STAKEHOLDER_SECTION);
      const before = snapshotTree(root);

      clearCapture();
      expect(await cortex(root, ['pulse-list'])).toBe(0);
      expect(logs.join('\n')).toContain('S-001');
      expect(logs.join('\n')).toContain('S-002');
      expect(logs.join('\n')).toContain('Type: promotion');

      clearCapture();
      expect(await cortex(root, ['pulse-accept', 'S-001']), errors.join('\n')).toBe(0);
      expect(logs.join('\n')).toContain('promoted to .cortex/compass/rules/R-004-coordinators-read-compass.md');
      expect(logs.join('\n')).not.toContain('marked the insight original');

      clearCapture();
      expect(await cortex(root, ['pulse-accept', 'S-002']), errors.join('\n')).toBe(0);

      // The landed rule parses, keeps its provenance, and its source: back-reference is the same path.
      const ruleAbs = path.join(root, '.cortex', 'compass', 'rules', 'R-004-coordinators-read-compass.md');
      const rule = matter(fs.readFileSync(ruleAbs, 'utf-8'));
      expect(rule.data['id']).toBe('R-004');
      expect(rule.data['provenance']).toEqual([{ derives_from: EXTRACTED }]);
      expect(rule.content).toContain('# R-004 — Coordinators read compass before dispatching');

      const stakeAbs = path.join(root, '.cortex', 'atlas', 'stakeholders', 'wave-coordinator.md');
      const stake = matter(fs.readFileSync(stakeAbs, 'utf-8'));
      expect(stake.data['source']).toBe(EXTRACTED);
      expect(stake.data['provenance']).toEqual([{ derives_from: EXTRACTED }]);

      // Nothing under .cortex/insight/ or .cortex/archive/ changed; the sections read accepted.
      const after = snapshotTree(root);
      const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k));
      expect(changed.filter((k) => k.startsWith(path.join('.cortex', 'insight')) || k.startsWith(path.join('.cortex', 'archive')))).toEqual([]);
      const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'archive-ingestion.md'), 'utf-8');
      expect(report.match(/\*\*Status:\*\* accepted/g)).toHaveLength(2);

      // The gate's own checks on the landed artefacts: provenance resolves, the rule is registered, the rule and stakeholder validate.
      const violations = await validateJson(root);
      const onLanded = violations.filter((v) => v.location.path.endsWith('R-004-coordinators-read-compass.md') || v.location.path.endsWith('wave-coordinator.md'));
      expect(onLanded.filter((v) => v.severity === 'error')).toEqual([]);
      expect(violations.filter((v) => v.check === 'check.provenance' || v.check === 'check.id-registry')).toEqual([]);
      expect(fs.readFileSync(path.join(root, '.cortex', 'compass', 'registry.md'), 'utf-8')).toContain('\nR-004 coordinators-read-compass\n');
    },
    INIT_TIMEOUT,
  );
});
