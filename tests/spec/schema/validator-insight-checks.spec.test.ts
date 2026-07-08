/**
 * Spec-level tests — schema.validator-insight-checks (schema §4.10.1/.2/.3,
 * §4.5.1/.2, §7.4). The four new insight checks + the extended check.pulse,
 * exercised through the registered validator (validate()) over tmp fixture
 * .cortex trees. Deterministic Core (R-001); read-only over the tree.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validate } from '../../../src/schema/validate.js';
import { makeTmpDir, cleanTmp, makeCortexProject } from '../../fixtures/hooks-harness.js';
import type { Violation } from '../../../src/schema/types.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`insight-checks-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** A minimal 2.0 project with an insight/ module directory + compliant index. */
function makeInsightProject(root: string): void {
  makeCortexProject(root, {
    config: { schemaVersion: '2.0' },
    modules: ['anatomy', 'cerebrum', 'atlas', 'pulse', 'insight'],
  });
  writeInsightIndex(
    root,
    `# Insight — index

**Read this when:** you need conceptual orientation. Insight is **ungated**:
useful immediately, **not human-reviewed** — treat claims as unreviewed.

**What's here:**
- \`map/*.md\` — observed project knowledge.

**How to navigate:** \`cortex insight query <topic>\` first.
`,
  );
}

function writeInsightIndex(root: string, body: string): void {
  const p = path.join(root, '.cortex', 'insight', '_index.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body, 'utf-8');
}

function writeMapFile(root: string, name: string, content: string): void {
  const p = path.join(root, '.cortex', 'insight', 'map', name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
}

function writePulse(root: string, name: string, content: string): void {
  const p = path.join(root, '.cortex', 'pulse', name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
}

async function violationsFor(root: string, check: string): Promise<Violation[]> {
  const report = await validate(root, { root });
  return report.violations.filter((v) => v.check === check);
}

// ---------------------------------------------------------------------------
// check.insight-prose (§4.10.1, §4.10.4)
// ---------------------------------------------------------------------------

describe('check.insight-prose', () => {
  it('flags a malformed corrections log (item missing _now:_) with a warning', async () => {
    const root = tmp('prose-bad-corrections');
    makeInsightProject(root);
    writeMapFile(
      root,
      'testing.md',
      `---
kind: insight-prose
updated: 2026-07-05T10:00:00Z
---

# Testing

The suite runs via vitest.

## Corrections

- **2026-07-04** — _was:_ "tests use jest" · _why:_ user corrected · sessions: s1
`,
    );
    const v = await violationsFor(root, 'check.insight-prose');
    const warnings = v.filter((x) => x.severity === 'warning' && x.location.path.endsWith('testing.md'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.clause).toBe('§4.10.1');
  });

  it('a well-formed corrections sibling produces no violation', async () => {
    const root = tmp('prose-clean-corrections');
    makeInsightProject(root);
    writeMapFile(
      root,
      'setup.md',
      `---
kind: insight-prose
updated: 2026-07-05T10:00:00Z
---

# Setup

Run pnpm install.

## Corrections

- **2026-07-04** — _was:_ "uses npm" · _now:_ "uses pnpm" · _why:_ user corrected · sessions: s1
`,
    );
    expect(await violationsFor(root, 'check.insight-prose')).toEqual([]);
  });

  it('errors, naming the field, when frontmatter omits kind: insight-prose', async () => {
    const root = tmp('prose-missing-kind');
    makeInsightProject(root);
    writeMapFile(
      root,
      'deploy.md',
      `---
updated: 2026-07-05T10:00:00Z
---

# Deploy

Deploy via the release script.
`,
    );
    const errors = (await violationsFor(root, 'check.insight-prose')).filter((v) => v.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message.toLowerCase()).toContain('kind');
  });
});

// ---------------------------------------------------------------------------
// check.insight-graph (§4.10.2)
// ---------------------------------------------------------------------------

describe('check.insight-graph', () => {
  it('errors on a bad node id and an empty rationale', async () => {
    const root = tmp('graph-bad');
    makeInsightProject(root);
    writeMapFile(
      root,
      'graph.json',
      JSON.stringify({
        schemaVersion: '2.0',
        generated: '2026-07-05T10:00:00Z',
        rebuild: 'full',
        nodes: [{ id: 'not-a-valid-id', module: 'anatomy', label: 'x' }],
        edges: [
          { from: 'not-a-valid-id', to: 'not-a-valid-id', kind: 'mentions-same-entity', confidence: 'medium', rationale: '' },
        ],
      }),
    );
    const errors = (await violationsFor(root, 'check.insight-graph')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.message.includes('node id'))).toBe(true);
    expect(errors.some((e) => e.message.toLowerCase().includes('rationale'))).toBe(true);
  });

  it('a well-formed graph passes clean', async () => {
    const root = tmp('graph-clean');
    makeInsightProject(root);
    writeMapFile(
      root,
      'graph.json',
      JSON.stringify({
        schemaVersion: '2.0',
        generated: '2026-07-05T10:00:00Z',
        rebuild: 'full',
        nodes: [
          { id: 'anatomy:src/pulse/review.ts', module: 'anatomy', label: 'review.ts' },
          { id: 'spec:insight.cli', module: 'spec', label: 'insight.cli' },
        ],
        edges: [
          {
            from: 'anatomy:src/pulse/review.ts',
            to: 'spec:insight.cli',
            kind: 'mentions-same-entity',
            confidence: 'medium',
            rationale: 'both concern the review flow',
          },
        ],
      }),
    );
    expect(await violationsFor(root, 'check.insight-graph')).toEqual([]);
  });

  it('warns (not errors) on a dangling edge endpoint', async () => {
    const root = tmp('graph-dangling');
    makeInsightProject(root);
    writeMapFile(
      root,
      'graph.json',
      JSON.stringify({
        schemaVersion: '2.0',
        generated: '2026-07-05T10:00:00Z',
        rebuild: 'full',
        nodes: [{ id: 'spec:insight.cli', module: 'spec', label: 'insight.cli' }],
        edges: [
          {
            from: 'spec:insight.cli',
            to: 'spec:insight.gaps-loop',
            kind: 'semantically-related',
            confidence: 'low',
            rationale: 'both about insight loops',
          },
        ],
      }),
    );
    const v = await violationsFor(root, 'check.insight-graph');
    expect(v.every((x) => x.severity !== 'error')).toBe(true);
    const warnings = v.filter((x) => x.severity === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('spec:insight.gaps-loop');
  });
});

// ---------------------------------------------------------------------------
// check.insight-ownership (§4.10.3)
// ---------------------------------------------------------------------------

describe('check.insight-ownership', () => {
  it('errors on an out-of-lane extension and an unexpected .json basename', async () => {
    const root = tmp('ownership-bad');
    makeInsightProject(root);
    writeMapFile(root, 'notes.txt', 'loose notes');
    writeMapFile(root, 'extra.json', '{}');
    const errors = (await violationsFor(root, 'check.insight-ownership')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.message.includes('notes.txt'))).toBe(true);
    expect(errors.some((e) => e.message.includes('extra.json'))).toBe(true);
  });

  it('a clean map/ (setup.md + the three json) passes', async () => {
    const root = tmp('ownership-clean');
    makeInsightProject(root);
    writeMapFile(root, 'setup.md', `---\nkind: insight-prose\nupdated: 2026-07-05T10:00:00Z\n---\n\n# Setup\n`);
    writeMapFile(root, 'graph.json', JSON.stringify({ schemaVersion: '2.0', generated: '2026-07-05T10:00:00Z', rebuild: 'full', nodes: [], edges: [] }));
    writeMapFile(root, 'tags.json', JSON.stringify({ schemaVersion: '2.0', generated: '2026-07-05T10:00:00Z', tags: {} }));
    writeMapFile(root, 'clusters.json', JSON.stringify({ schemaVersion: '2.0', generated: '2026-07-05T10:00:00Z', clusters: [] }));
    expect(await violationsFor(root, 'check.insight-ownership')).toEqual([]);
  });

  it('errors on a map/_index.md', async () => {
    const root = tmp('ownership-index');
    makeInsightProject(root);
    writeMapFile(root, '_index.md', '# nope\n');
    const errors = (await violationsFor(root, 'check.insight-ownership')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.message.includes('_index.md'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// check.pulse — typed suggestions (§4.5.1, §4.5.2)
// ---------------------------------------------------------------------------

describe('check.pulse (extended)', () => {
  it('errors on a gated-layer-update targeting insight/map/, and on a multi-payload section', async () => {
    const root = tmp('pulse-bad');
    makeInsightProject(root);
    writePulse(
      root,
      'suggestions.md',
      `---
kind: pulse-suggestions
generated: 2026-07-05T10:00:00Z
loop: insight-gaps
---

# Suggestions

## S-042: correct the setup note

**Type:** gated-layer-update
**Source:** insight-gaps; sessions s1
**Target:** .cortex/insight/map/setup.md
**Proposed edit:**

current:
\`\`\`
old
\`\`\`
replacement:
\`\`\`
new
\`\`\`

## S-044: two payloads

**Type:** rule-candidate
**Source:** distil; sessions s2
**Target:** .cortex/cerebrum/rules/R-999-x.md
**Proposed addition:**
\`\`\`
a rule
\`\`\`
**Proposed edit:**
\`\`\`
also an edit
\`\`\`
`,
    );
    const errors = (await violationsFor(root, 'check.pulse')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.location.key === 'S-042' && e.clause === '§4.5.1')).toBe(true);
    expect(errors.some((e) => e.location.key === 'S-044' && e.clause === '§4.5.2')).toBe(true);
  });

  it('exempts dismissed.md `## S-NNN` records from the typed-suggestion checks', async () => {
    const root = tmp('pulse-dismissed');
    makeInsightProject(root);
    writePulse(
      root,
      'dismissed.md',
      `---
kind: pulse-dismissed
generated: 2026-07-05T10:00:00Z
loop: cortex-init
---

# Dismissed suggestions

## S-001: pnpm only, never npm

**Dismissed:** 2026-07-02T20:32:41.780Z
**Expires:** 2026-09-30T20:32:41.780Z
`,
    );
    // No Type / Target / payload — but dismissed.md is loose (§4.5), so no section-level violations.
    const v = (await violationsFor(root, 'check.pulse')).filter((x) => x.location.key === 'S-001');
    expect(v).toEqual([]);
  });

  it('tolerates an absent Type as rule-candidate with only a warning', async () => {
    const root = tmp('pulse-untyped');
    makeInsightProject(root);
    writePulse(
      root,
      'suggestions.md',
      `---
kind: pulse-suggestions
generated: 2026-07-05T10:00:00Z
loop: distil
---

# Suggestions

## S-043: a rule candidate

**Source:** distil; sessions s3
**Target:** .cortex/cerebrum/rules/R-500-y.md
**Proposed addition:**
\`\`\`
a candidate rule
\`\`\`
`,
    );
    const v = (await violationsFor(root, 'check.pulse')).filter((x) => x.location.key === 'S-043');
    expect(v).toHaveLength(1);
    expect(v[0]?.severity).toBe('warning');
    expect(v[0]?.clause).toBe('§4.5.1');
  });
});

// ---------------------------------------------------------------------------
// check.insight-index (§7.4)
// ---------------------------------------------------------------------------

describe('check.insight-index', () => {
  it('warns when the trust-model line is absent', async () => {
    const root = tmp('index-no-trust');
    makeInsightProject(root);
    // Overwrite with an index that has the shape but no ungated/unreviewed line.
    writeInsightIndex(
      root,
      `# Insight — index

**Read this when:** you need conceptual orientation about the project.

**What's here:**
- \`map/*.md\` — observed project knowledge.
`,
    );
    const v = (await violationsFor(root, 'check.insight-index')).filter((x) => x.severity === 'warning');
    expect(v).toHaveLength(1);
    expect(v[0]?.clause).toBe('§7.4');
  });

  it('a compliant index produces no violation', async () => {
    const root = tmp('index-ok');
    makeInsightProject(root); // makeInsightProject writes a compliant index
    expect(await violationsFor(root, 'check.insight-index')).toEqual([]);
  });
});
