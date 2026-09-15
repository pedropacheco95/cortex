/**
 * Spec-level tests — the v3 insight validator checks (schema §4.10.2–§4.10.6,
 * §7.4) plus the extended check.pulse (§4.5.1/.2), exercised through the
 * registered validator (validate()) over tmp fixture .cortex trees.
 * check.insight-entry / -scope-registry / -ledger / -graph replace v2's
 * check.insight-prose / check.insight-ownership (Appendix A, REMOVED).
 * Deterministic Core (R-001); read-only over the tree.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validate } from '../../../src/schema/validate.js';
import { makeTmpDir, cleanTmp, makeCortexProject } from '../../fixtures/hooks-harness.js';
import { INSIGHT_INDEX_TEMPLATE } from '../../../src/cli/templates.js';
import type { Violation } from '../../../src/schema/types.js';

const SHA = 'a1b3c5d7e9f102132435465768798a9bacbdcedfe0f1023344556677889900aa';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`insight-checks-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** A minimal 3.0 project with a v3 insight/ module + the locked index. */
function makeInsightProject(root: string): void {
  makeCortexProject(root, {
    config: { schemaVersion: '3.0' },
    modules: ['anatomy', 'compass', 'atlas', 'pulse', 'insight'],
  });
  writeInsight(root, '_index.md', INSIGHT_INDEX_TEMPLATE);
}

function writeInsight(root: string, rel: string, content: string): void {
  const p = path.join(root, '.cortex', 'insight', rel);
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
// check.insight-entry (§4.10.2)
// ---------------------------------------------------------------------------

const GOOD_L3 = `---
path: src/auth/session.ts
extracted_at: 2026-07-07T14:00:00Z
extraction_level: 3
size_lines: 620
size_tokens: 5400
centrality: high
built_at_commit: 9f2c1ab
source_sha256: ${SHA}
---

## Purpose

Session-token lifecycle.

## Main players

- \`validateToken\` (L40–L120) — critical.

## Connections

Uses:
- src/util/log.ts: logging
`;

describe('check.insight-entry', () => {
  it('a well-formed L3 entry under anatomy/ produces no violation', async () => {
    const root = tmp('entry-clean');
    makeInsightProject(root);
    writeInsight(root, 'anatomy/src/auth/session.ts.md', GOOD_L3);
    expect(await violationsFor(root, 'check.insight-entry')).toEqual([]);
  });

  it('errors, naming the field, on bad frontmatter (sha + centrality)', async () => {
    const root = tmp('entry-bad-fm');
    makeInsightProject(root);
    writeInsight(
      root,
      'anatomy/src/x.ts.md',
      GOOD_L3.replace(`source_sha256: ${SHA}`, 'source_sha256: nope').replace('centrality: high', 'centrality: extreme'),
    );
    const errors = (await violationsFor(root, 'check.insight-entry')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.message.includes('source_sha256'))).toBe(true);
    expect(errors.some((e) => e.message.includes('centrality'))).toBe(true);
    expect(errors[0]?.clause).toBe('§4.10.2');
  });

  it('errors on an L3 entry missing a required section', async () => {
    const root = tmp('entry-missing-section');
    makeInsightProject(root);
    writeInsight(root, 'anatomy/src/x.ts.md', GOOD_L3.replace('## Main players', '## Cast'));
    const errors = (await violationsFor(root, 'check.insight-entry')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.message.includes('Main players'))).toBe(true);
  });

  it('validates entries under scopes/<scope>/anatomy/ too', async () => {
    const root = tmp('entry-scoped');
    makeInsightProject(root);
    writeInsight(root, 'scopes/auth/anatomy/src/x.ts.md', GOOD_L3.replace(`source_sha256: ${SHA}`, 'source_sha256: bad'));
    const errors = (await violationsFor(root, 'check.insight-entry')).filter((v) => v.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.location.path).toContain(path.join('scopes', 'auth', 'anatomy'));
  });

  it('legacy insight/map/ presence is a single warning, never an error', async () => {
    const root = tmp('entry-legacy-map');
    makeInsightProject(root);
    writeInsight(root, 'map/setup.md', 'not validated against v3');
    const v = await violationsFor(root, 'check.insight-entry');
    expect(v.filter((x) => x.severity === 'error')).toEqual([]);
    const warnings = v.filter((x) => x.severity === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('interim dogfood');
  });

  it('tolerates an absent insight module', async () => {
    const root = tmp('entry-absent');
    makeCortexProject(root, { config: { schemaVersion: '3.0' }, modules: ['compass', 'atlas', 'pulse'] });
    expect(await violationsFor(root, 'check.insight-entry')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// check.insight-scope-registry (§4.10.3)
// ---------------------------------------------------------------------------

describe('check.insight-scope-registry', () => {
  it('a well-formed registry whose paths resolve produces no violation', async () => {
    const root = tmp('registry-clean');
    makeInsightProject(root);
    fs.mkdirSync(path.join(root, 'src/auth'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/shared/notifications'), { recursive: true });
    writeInsight(
      root,
      'scope-registry.yaml',
      `schemaVersion: "3.0"
built_at_commit: 9f2c1ab
scopes:
  auth:
    path: src/auth
    depends_on: [notifications]
  notifications:
    path: src/shared/notifications
    depends_on: []
    shared_by: [auth]
`,
    );
    expect(await violationsFor(root, 'check.insight-scope-registry')).toEqual([]);
  });

  it('errors on a depends_on cycle', async () => {
    const root = tmp('registry-cycle');
    makeInsightProject(root);
    fs.mkdirSync(path.join(root, 'src/a'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/b'), { recursive: true });
    writeInsight(
      root,
      'scope-registry.yaml',
      `schemaVersion: "3.0"
built_at_commit: 9f2c1ab
scopes:
  a:
    path: src/a
    depends_on: [b]
  b:
    path: src/b
    depends_on: [a]
`,
    );
    const errors = (await violationsFor(root, 'check.insight-scope-registry')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.message.includes('cycle'))).toBe(true);
  });

  it('errors on a scope path that does not resolve to a directory', async () => {
    const root = tmp('registry-badpath');
    makeInsightProject(root);
    writeInsight(
      root,
      'scope-registry.yaml',
      `schemaVersion: "3.0"
built_at_commit: 9f2c1ab
scopes:
  auth:
    path: src/ghost
    depends_on: []
`,
    );
    const errors = (await violationsFor(root, 'check.insight-scope-registry')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.message.includes('src/ghost'))).toBe(true);
  });

  it('shared_by/depends_on asymmetry is a warning, not an error', async () => {
    const root = tmp('registry-asym');
    makeInsightProject(root);
    fs.mkdirSync(path.join(root, 'src/auth'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/shared/notifications'), { recursive: true });
    writeInsight(
      root,
      'scope-registry.yaml',
      `schemaVersion: "3.0"
built_at_commit: 9f2c1ab
scopes:
  auth:
    path: src/auth
    depends_on: []
  notifications:
    path: src/shared/notifications
    depends_on: []
    shared_by: [auth]
`,
    );
    const v = await violationsFor(root, 'check.insight-scope-registry');
    expect(v.filter((x) => x.severity === 'error')).toEqual([]);
    expect(v.filter((x) => x.severity === 'warning')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// check.insight-ledger (§4.10.4, §4.10.5) — one check, both index files
// ---------------------------------------------------------------------------

describe('check.insight-ledger', () => {
  it('well-formed ledger.json + reverse-index.json produce no violation', async () => {
    const root = tmp('ledger-clean');
    makeInsightProject(root);
    writeInsight(
      root,
      'ledger.json',
      JSON.stringify({
        schemaVersion: '3.0',
        built_at_commit: '9f2c1ab',
        entries: { 'src/auth/session.ts': { source_sha256: SHA, built_at_commit: '9f2c1ab', extraction_level: 3 } },
      }),
    );
    writeInsight(
      root,
      'reverse-index.json',
      JSON.stringify({
        schemaVersion: '3.0',
        built_at_commit: '9f2c1ab',
        referenced_by: { 'element:src/auth/session.ts#validateToken': ['concept:authentication', 'edge:x-01'] },
      }),
    );
    expect(await violationsFor(root, 'check.insight-ledger')).toEqual([]);
  });

  it('errors on a bad ledger entry (hash + level), clause §4.10.4', async () => {
    const root = tmp('ledger-bad');
    makeInsightProject(root);
    writeInsight(
      root,
      'ledger.json',
      JSON.stringify({
        schemaVersion: '3.0',
        built_at_commit: '9f2c1ab',
        entries: { 'src/x.ts': { source_sha256: 'short', built_at_commit: '9f2c1ab', extraction_level: 5 } },
      }),
    );
    const errors = (await violationsFor(root, 'check.insight-ledger')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.message.includes('source_sha256') && e.clause === '§4.10.4')).toBe(true);
    expect(errors.some((e) => e.message.includes('extraction_level'))).toBe(true);
  });

  it('errors on malformed reverse-index ids, clause §4.10.5', async () => {
    const root = tmp('reverse-bad');
    makeInsightProject(root);
    writeInsight(
      root,
      'reverse-index.json',
      JSON.stringify({
        schemaVersion: '3.0',
        built_at_commit: '9f2c1ab',
        referenced_by: { 'not-a-node-id': ['file:src/x.ts'] },
      }),
    );
    const errors = (await violationsFor(root, 'check.insight-ledger')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.clause === '§4.10.5' && e.message.includes('node id'))).toBe(true);
    expect(errors.some((e) => e.clause === '§4.10.5' && e.message.includes('edge'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// check.insight-graph (§4.10.6) — redefined for the v3 shapes
// ---------------------------------------------------------------------------

function graphWith(edge: Record<string, unknown>): string {
  return JSON.stringify({
    schemaVersion: '3.0',
    generated: '2026-07-07T14:05:00Z',
    built_at_commit: '9f2c1ab',
    nodes: [
      { id: 'concept:authentication', kind: 'concept', label: 'authentication' },
      { id: 'file:src/auth/session.ts', kind: 'file', label: 'session.ts' },
    ],
    edges: [
      {
        id: 'edge:e1',
        source: 'file:src/auth/session.ts',
        target: 'concept:authentication',
        edge_type: 'implements-concept',
        confidence: 'stated',
        evidence: 'stated in the module header',
        confirmed_at_commit: '9f2c1ab',
        ...edge,
      },
    ],
  });
}

describe('check.insight-graph', () => {
  it('a well-formed v3 trio passes clean', async () => {
    const root = tmp('graph-clean');
    makeInsightProject(root);
    writeInsight(root, 'graph.json', graphWith({}));
    writeInsight(
      root,
      'tags.json',
      JSON.stringify({
        schemaVersion: '3.0',
        generated: '2026-07-07T14:05:00Z',
        built_at_commit: '9f2c1ab',
        vocabulary: [{ tag: 'authentication', kind: 'concern', aliases: ['auth'] }],
        assignments: { 'file:src/auth/session.ts': ['authentication'] },
      }),
    );
    writeInsight(
      root,
      'clusters.json',
      JSON.stringify({
        schemaVersion: '3.0',
        generated: '2026-07-07T14:05:00Z',
        built_at_commit: '9f2c1ab',
        clusters: [
          {
            id: 'cluster:auth-core',
            label: 'Auth core',
            members: ['file:src/auth/session.ts'],
            rationale: 'co-located auth primitives',
            scope: 'global',
          },
        ],
      }),
    );
    expect(await violationsFor(root, 'check.insight-graph')).toEqual([]);
  });

  it('errors on empty evidence, a non-enum edge_type, and a float confidence', async () => {
    const root = tmp('graph-bad-edge');
    makeInsightProject(root);
    writeInsight(root, 'graph.json', graphWith({ evidence: '', edge_type: 'related-to', confidence: 0.85 }));
    const errors = (await violationsFor(root, 'check.insight-graph')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.message.includes('evidence'))).toBe(true);
    expect(errors.some((e) => e.message.includes('edge_type'))).toBe(true);
    expect(errors.some((e) => e.message.includes('confidence'))).toBe(true);
    expect(errors[0]?.clause).toBe('§4.10.6');
  });

  it('errors on a v2-grammar node id (constellation-borrowed ids are gone)', async () => {
    const root = tmp('graph-v2-id');
    makeInsightProject(root);
    writeInsight(
      root,
      'graph.json',
      JSON.stringify({
        schemaVersion: '3.0',
        generated: '2026-07-07T14:05:00Z',
        built_at_commit: '9f2c1ab',
        nodes: [{ id: 'spec:insight.cli', kind: 'file', label: 'x' }],
        edges: [],
      }),
    );
    const errors = (await violationsFor(root, 'check.insight-graph')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.message.includes('node id'))).toBe(true);
  });

  it('warns (not errors) on a dangling edge endpoint', async () => {
    const root = tmp('graph-dangling');
    makeInsightProject(root);
    writeInsight(root, 'graph.json', graphWith({ target: 'concept:billing' }));
    const v = await violationsFor(root, 'check.insight-graph');
    expect(v.every((x) => x.severity !== 'error')).toBe(true);
    const warnings = v.filter((x) => x.severity === 'warning');
    expect(warnings.some((w) => w.message.includes('concept:billing') && w.message.includes('dangling'))).toBe(true);
  });

  it('flags non-total-ordered serialization as a warning', async () => {
    const root = tmp('graph-unordered');
    makeInsightProject(root);
    writeInsight(
      root,
      'graph.json',
      JSON.stringify({
        schemaVersion: '3.0',
        generated: '2026-07-07T14:05:00Z',
        built_at_commit: '9f2c1ab',
        nodes: [
          { id: 'file:src/z.ts', kind: 'file', label: 'z.ts' },
          { id: 'file:src/a.ts', kind: 'file', label: 'a.ts' },
        ],
        edges: [],
      }),
    );
    const v = await violationsFor(root, 'check.insight-graph');
    expect(v.filter((x) => x.severity === 'error')).toEqual([]);
    expect(v.some((x) => x.severity === 'warning' && x.message.includes('total-ordered'))).toBe(true);
  });

  it('errors on an assignment referencing a tag not in the vocabulary', async () => {
    const root = tmp('tags-unknown');
    makeInsightProject(root);
    writeInsight(
      root,
      'tags.json',
      JSON.stringify({
        schemaVersion: '3.0',
        generated: '2026-07-07T14:05:00Z',
        built_at_commit: '9f2c1ab',
        vocabulary: [{ tag: 'authentication', kind: 'concern' }],
        assignments: { 'file:src/auth/session.ts': ['jwt'] },
      }),
    );
    const errors = (await violationsFor(root, 'check.insight-graph')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.message.includes('"jwt"'))).toBe(true);
  });

  it('validates scope-local scopes/<scope>/graph.json too', async () => {
    const root = tmp('graph-scoped');
    makeInsightProject(root);
    writeInsight(root, 'scopes/auth/graph.json', graphWith({ evidence: '' }));
    const errors = (await violationsFor(root, 'check.insight-graph')).filter((v) => v.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.location.path).toContain(path.join('scopes', 'auth', 'graph.json'));
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
**Target:** .cortex/compass/rules/R-999-x.md
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
**Target:** .cortex/compass/rules/R-500-y.md
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
// check.insight-index (§7.4) — redefined for the v3 verbs
// ---------------------------------------------------------------------------

describe('check.insight-index', () => {
  it('warns when the trust-model line is absent', async () => {
    const root = tmp('index-no-trust');
    makeInsightProject(root);
    // Overwrite with an index that lacks the ungated/unreviewed + CLI lines.
    writeInsight(
      root,
      '_index.md',
      `# Insight

Per-file understanding of the codebase.
`,
    );
    const v = (await violationsFor(root, 'check.insight-index')).filter((x) => x.severity === 'warning');
    expect(v).toHaveLength(1);
    expect(v[0]?.clause).toBe('§7.4');
  });

  it('the locked v3 template produces no violation', async () => {
    const root = tmp('index-ok');
    makeInsightProject(root); // writes INSIGHT_INDEX_TEMPLATE
    expect(await violationsFor(root, 'check.insight-index')).toEqual([]);
  });

  it('the locked template is exempt from the §7.1 heading warnings (check.index-shape)', async () => {
    const root = tmp('index-shape-exempt');
    makeInsightProject(root);
    const v = (await violationsFor(root, 'check.index-shape')).filter((x) =>
      x.location.path.includes(path.join('insight', '_index.md')),
    );
    expect(v).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// check.insight-observations (§4.10.11, new at 3.1) — the session-learned
// project-context surface, `insight/observations/`.
// ---------------------------------------------------------------------------

const GOOD_OBSERVATION = `---
kind: insight-observation
updated: 2026-07-14T09:00:00Z
salient: false
sessions:
  - claude-sessions/pedro/9f2c1ab-scale-fixture
---

The project is meant for roughly 1000 concurrent users at launch — not
a hyperscale target.
`;

describe('check.insight-observations', () => {
  it('tolerates an entirely absent observations/ directory', async () => {
    const root = tmp('obs-absent');
    makeInsightProject(root);
    expect(await violationsFor(root, 'check.insight-observations')).toEqual([]);
  });

  it('a well-formed themed entry produces no violation', async () => {
    const root = tmp('obs-clean');
    makeInsightProject(root);
    writeInsight(root, 'observations/_index.md', '# Observations\n\n**Read this when:** …\n\n**What\'s here:** scale.md\n');
    writeInsight(root, 'observations/scale.md', GOOD_OBSERVATION);
    expect(await violationsFor(root, 'check.insight-observations')).toEqual([]);
  });

  it('errors on a wrong/missing "kind"', async () => {
    const root = tmp('obs-bad-kind');
    makeInsightProject(root);
    writeInsight(root, 'observations/scale.md', GOOD_OBSERVATION.replace('kind: insight-observation', 'kind: observation'));
    const errors = (await violationsFor(root, 'check.insight-observations')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.location.key === 'kind' && e.clause === '§4.10.11')).toBe(true);
  });

  it('errors on a missing/non-datetime "updated"', async () => {
    const root = tmp('obs-bad-updated');
    makeInsightProject(root);
    writeInsight(root, 'observations/scale.md', GOOD_OBSERVATION.replace('updated: 2026-07-14T09:00:00Z', 'updated: soon'));
    const errors = (await violationsFor(root, 'check.insight-observations')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.location.key === 'updated')).toBe(true);
  });

  it('errors on a non-boolean "salient"', async () => {
    const root = tmp('obs-bad-salient');
    makeInsightProject(root);
    writeInsight(root, 'observations/scale.md', GOOD_OBSERVATION.replace('salient: false', 'salient: maybe'));
    const errors = (await violationsFor(root, 'check.insight-observations')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.location.key === 'salient')).toBe(true);
  });

  it('errors on an empty "sessions" list', async () => {
    const root = tmp('obs-empty-sessions');
    makeInsightProject(root);
    writeInsight(
      root,
      'observations/scale.md',
      GOOD_OBSERVATION.replace('sessions:\n  - claude-sessions/pedro/9f2c1ab-scale-fixture', 'sessions: []'),
    );
    const errors = (await violationsFor(root, 'check.insight-observations')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.location.key === 'sessions')).toBe(true);
  });

  it('errors on a malformed claude-sessions reference (check.provenance\'s ref grammar, reused)', async () => {
    const root = tmp('obs-bad-session-ref');
    makeInsightProject(root);
    writeInsight(
      root,
      'observations/scale.md',
      GOOD_OBSERVATION.replace('claude-sessions/pedro/9f2c1ab-scale-fixture', 'pedro/9f2c1ab-scale-fixture'),
    );
    const errors = (await violationsFor(root, 'check.insight-observations')).filter((v) => v.severity === 'error');
    expect(errors.some((e) => e.location.key === 'sessions' && e.message.includes('not a well-formed'))).toBe(true);
  });

  it('bears_on (3.4) is shape-checked only: a list of non-empty strings passes even when nothing resolves', async () => {
    const root = tmp('obs-bears-on-ok');
    makeInsightProject(root);
    writeInsight(root, 'observations/_index.md', '# Observations\n\n**Read this when:** …\n\n**What\'s here:** scale.md\n');
    writeInsight(root, 'observations/scale.md', GOOD_OBSERVATION.replace('salient: false\n', 'salient: false\nbears_on:\n  - R-999\n  - src/gone.ts\n  - "schema:§99"\n'));
    const report = await validate(root, { root });
    expect(report.violations.filter((v) => v.check === 'check.insight-observations')).toEqual([]);
    expect(report.violations.filter((v) => v.check === 'check.bears-on')).toEqual([]);
  });

  it('bears_on (3.4): a scalar is one error at key bears_on, clause §4.10.11', async () => {
    const root = tmp('obs-bears-on-scalar');
    makeInsightProject(root);
    writeInsight(root, 'observations/_index.md', '# Observations\n\n**Read this when:** …\n\n**What\'s here:** scale.md\n');
    writeInsight(root, 'observations/scale.md', GOOD_OBSERVATION.replace('salient: false\n', 'salient: false\nbears_on: x\n'));
    const mine = await violationsFor(root, 'check.insight-observations');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ severity: 'error', clause: '§4.10.11', location: { key: 'bears_on' } });
  });

  it('bears_on (3.4): an empty-string or non-string entry is an error at key bears_on; an absent key is not', async () => {
    const root = tmp('obs-bears-on-entries');
    makeInsightProject(root);
    writeInsight(root, 'observations/_index.md', '# Observations\n\n**Read this when:** …\n\n**What\'s here:** scale.md, audience.md\n');
    writeInsight(root, 'observations/scale.md', GOOD_OBSERVATION.replace('salient: false\n', 'salient: false\nbears_on:\n  - ""\n  - 7\n'));
    writeInsight(root, 'observations/audience.md', GOOD_OBSERVATION);
    const mine = await violationsFor(root, 'check.insight-observations');
    expect(mine.length).toBeGreaterThanOrEqual(1);
    expect(mine.every((v) => v.severity === 'error' && v.location.key === 'bears_on' && v.location.path.endsWith('scale.md'))).toBe(true);
  });

  it('a present but empty observations/ directory (no entries yet) is clean', async () => {
    const root = tmp('obs-dir-no-entries');
    makeInsightProject(root);
    fs.mkdirSync(path.join(root, '.cortex', 'insight', 'observations'), { recursive: true });
    expect(await violationsFor(root, 'check.insight-observations')).toEqual([]);
  });

  it('an observations/ directory missing its own _index.md fires check.index-present, not check.insight-observations', async () => {
    const root = tmp('obs-missing-index');
    makeInsightProject(root);
    writeInsight(root, 'observations/scale.md', GOOD_OBSERVATION);
    const presentErrors = (await violationsFor(root, 'check.index-present')).filter(
      (v) => v.location.path.includes(path.join('insight', 'observations')),
    );
    expect(presentErrors).toHaveLength(1);
    expect(await violationsFor(root, 'check.insight-observations')).toEqual([]);
  });
});
