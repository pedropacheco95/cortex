/**
 * Atomic tests for check.provenance and the backward-traversal index
 * (build-order-v3 step 4; cortex-schema.md §6 / addendum A6; spec
 * provenance.frontmatter-check). Exercised through the registered validator
 * (validate()) over handcrafted tmp .cortex/ trees, same pattern as
 * tests/atomic/schema/archive.test.ts; the index is exercised directly via
 * buildProvenanceIndex/derivationsOf (computed on demand, never persisted).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validate } from '../../../src/schema/validate.js';
import { buildProvenanceIndex, derivationsOf } from '../../../src/schema/provenance-index.js';
import { makeTmpDir, cleanTmp, makeCortexProject } from '../../fixtures/hooks-harness.js';
import type { Violation } from '../../../src/schema/types.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`provenance-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** A minimal 3.0 project with compass/atlas/archive module dirs. */
function makeProject(root: string): void {
  makeCortexProject(root, {
    config: { schemaVersion: '3.0' },
    modules: ['compass', 'atlas', 'pulse', 'archive'],
  });
}

function writeFileEnsuring(p: string, content: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
}

/** An archive document with one extracted file; returns the .cortex-relative extracted ref. */
function writeArchiveDoc(root: string, slug = 'client-spec-v2-0'): string {
  const docDir = path.join(root, '.cortex', 'archive', 'documents', slug);
  writeFileEnsuring(path.join(docDir, 'source.md'), 'verbatim\n');
  writeFileEnsuring(
    path.join(docDir, 'metadata.yaml'),
    `id: archive.${slug}\nkind: client-spec\ningested_at: 2026-07-01T10:00:00Z\nversion: "2.0"\nstatus: active\n`,
  );
  const rel = `archive/documents/${slug}/extracted/requirements/GT-CLIENT-001-session-expiry.md`;
  writeFileEnsuring(path.join(root, '.cortex', ...rel.split('/')), '# GT-CLIENT-001\nSessions expire after 30 minutes.\n');
  return rel;
}

/** An atlas decision; returns the .cortex-relative ref. */
function writeDecision(root: string, slug = '2026-07-01-db-naming'): string {
  writeFileEnsuring(
    path.join(root, '.cortex', 'atlas', 'decisions', `${slug}.md`),
    `---\nid: decision.${slug}\ntitle: Sample decision\ndate: 2026-07-01T12:00:00Z\n---\n\n# Decision\n`,
  );
  return `atlas/decisions/${slug}.md`;
}

/** A compass rule with an optional provenance YAML block (raw lines). */
function writeRule(root: string, provenanceYaml?: string): string {
  const p = path.join(root, '.cortex', 'compass', 'rules', 'R-042-session-expiry.md');
  writeFileEnsuring(
    p,
    `---\nid: R-042\ntitle: Sessions expire after 30 minutes\nsource:\n  - ./R-042-session-expiry.md\ngoverns:\n  - "**/*.md"\n${provenanceYaml ?? ''}---\n\n# R-042\n`,
  );
  return p;
}

/** A dev spec with an optional provenance YAML block. */
function writeDevSpec(root: string, provenanceYaml?: string): string {
  const p = path.join(root, '.specflow', 'specs', 'auth', 'session.spec.md');
  writeFileEnsuring(p, `---\nid: auth.session\nstatus: draft\n${provenanceYaml ?? ''}---\n\n# Spec\n`);
  return p;
}

/** A business spec with an optional provenance YAML block. */
function writeBizSpec(root: string, provenanceYaml?: string): string {
  const p = path.join(root, '.specflow', 'specs-business', 'auth', 'sessions-stay-safe.business.md');
  writeFileEnsuring(p, `---\nid: auth.sessions-stay-safe\nstatus: draft\nimplemented_by: []\n${provenanceYaml ?? ''}---\n\n# Outcome\n`);
  return p;
}

async function provenanceViolations(root: string): Promise<Violation[]> {
  const report = await validate(root, { root });
  return report.violations.filter((v) => v.check === 'check.provenance');
}

describe('check.provenance: the three source-type forms', () => {
  it('a resolvable archive reference on a compass rule passes', async () => {
    const root = tmp('archive-ok');
    makeProject(root);
    const ref = writeArchiveDoc(root);
    writeRule(root, `provenance:\n  - derives_from: ${ref}\n`);
    expect(await provenanceViolations(root)).toEqual([]);
  });

  it('an unresolvable archive reference errors, naming the reference', async () => {
    const root = tmp('archive-dangling');
    makeProject(root);
    const rulePath = writeRule(
      root,
      'provenance:\n  - derives_from: archive/documents/client-spec-v9-9/extracted/requirements/GT-CLIENT-999-nonexistent.md\n',
    );
    const violations = await provenanceViolations(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.severity).toBe('error');
    expect(violations[0]!.location.path).toBe(rulePath);
    expect(violations[0]!.message).toContain('GT-CLIENT-999-nonexistent.md');
    expect(violations[0]!.message).toContain('does not resolve');
  });

  it('a resolvable atlas-decision reference on a dev spec passes', async () => {
    const root = tmp('atlas-ok');
    makeProject(root);
    const ref = writeDecision(root);
    writeDevSpec(root, `provenance:\n  - derives_from: ${ref}\n`);
    expect(await provenanceViolations(root)).toEqual([]);
  });

  it('an unresolvable atlas-decision reference errors', async () => {
    const root = tmp('atlas-dangling');
    makeProject(root);
    writeDevSpec(root, 'provenance:\n  - derives_from: atlas/decisions/2026-01-01-never-recorded.md\n');
    const violations = await provenanceViolations(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.severity).toBe('error');
    expect(violations[0]!.message).toContain('2026-01-01-never-recorded.md');
  });

  it('a well-formed claude-sessions reference passes with no disk lookup (cited-not-resolved)', async () => {
    const root = tmp('session-ok');
    makeProject(root);
    // No claude-sessions/ content exists anywhere on disk — must still pass.
    writeBizSpec(root, 'provenance:\n  - derives_from: claude-sessions/pedro/abc123def\n');
    expect(await provenanceViolations(root)).toEqual([]);
  });

  it('a malformed claude-sessions reference (missing session id) errors', async () => {
    const root = tmp('session-malformed');
    makeProject(root);
    writeBizSpec(root, 'provenance:\n  - derives_from: claude-sessions/onlyuser\n');
    const violations = await provenanceViolations(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('claude-sessions/<user>/<session-id>');
  });
});

describe('check.provenance: entry shape', () => {
  it('a reference matching none of the three forms errors', async () => {
    const root = tmp('unknown-form');
    makeProject(root);
    writeDecision(root); // decisions dir exists
    writeFileEnsuring(
      path.join(root, '.cortex', 'atlas', 'decisions', '2026-07-02-odd.md'),
      '---\nid: decision.2026-07-02-odd\ntitle: Odd\ndate: 2026-07-02T12:00:00Z\nprovenance:\n  - derives_from: not-a-real-path-shape\n---\n\n# Odd\n',
    );
    const violations = await provenanceViolations(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('none of the three source-type forms');
  });

  it('a wrong key (informed_by) errors — v3 has exactly one relationship type', async () => {
    const root = tmp('wrong-key');
    makeProject(root);
    const ref = writeDecision(root);
    writeRule(root, `provenance:\n  - informed_by: ${ref}\n`);
    const violations = await provenanceViolations(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('derives_from');
  });

  it('a non-list provenance value errors', async () => {
    const root = tmp('non-list');
    makeProject(root);
    writeRule(root, 'provenance: archive/documents/x/source.md\n');
    const violations = await provenanceViolations(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('must be a list');
  });

  it('absence of provenance everywhere is conformant — authored directly, never a finding', async () => {
    const root = tmp('absent');
    makeProject(root);
    writeArchiveDoc(root);
    writeDecision(root);
    writeRule(root); // no provenance field on anything
    writeDevSpec(root);
    writeBizSpec(root);
    expect(await provenanceViolations(root)).toEqual([]);
  });
});

describe('backward-traversal index: source → derivations', () => {
  it('returns every artefact deriving from a given source, across kinds', async () => {
    const root = tmp('index-multi');
    makeProject(root);
    const archiveRef = writeArchiveDoc(root);
    const rulePath = writeRule(root, `provenance:\n  - derives_from: ${archiveRef}\n`);
    const specPath = writeDevSpec(root, `provenance:\n  - derives_from: ${archiveRef}\n`);
    const decisionPath = path.join(root, '.cortex', 'atlas', 'decisions', '2026-07-03-derived.md');
    writeFileEnsuring(
      decisionPath,
      `---\nid: decision.2026-07-03-derived\ntitle: Derived\ndate: 2026-07-03T12:00:00Z\nprovenance:\n  - derives_from: ${archiveRef}\n---\n\n# Derived\n`,
    );

    const index = await buildProvenanceIndex(root);
    const derivations = derivationsOf(index, archiveRef);
    expect(derivations.map((d) => d.path).sort()).toEqual([rulePath, specPath, decisionPath].sort());
    expect(derivations.map((d) => d.kind).sort()).toEqual(['atlas-decision', 'compass-rule', 'dev-spec']);
  });

  it('a source with no derivations returns empty', async () => {
    const root = tmp('index-empty');
    makeProject(root);
    const archiveRef = writeArchiveDoc(root);
    writeRule(root, `provenance:\n  - derives_from: ${archiveRef}\n`);

    const index = await buildProvenanceIndex(root);
    expect(derivationsOf(index, 'archive/documents/client-spec-v2-0/source.md')).toEqual([]);
  });

  it('indexes atlas-decision and claude-sessions targets too', async () => {
    const root = tmp('index-kinds');
    makeProject(root);
    const decisionRef = writeDecision(root);
    const rulePath = writeRule(
      root,
      `provenance:\n  - derives_from: ${decisionRef}\n  - derives_from: claude-sessions/pedro/abc123def\n`,
    );

    const index = await buildProvenanceIndex(root);
    expect(derivationsOf(index, decisionRef).map((d) => d.path)).toEqual([rulePath]);
    expect(derivationsOf(index, 'claude-sessions/pedro/abc123def').map((d) => d.path)).toEqual([rulePath]);
  });
});
