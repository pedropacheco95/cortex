/**
 * Atomic tests for the three archive-module validator checks (build-order-v3
 * step 3a; cortex-schema.md §4.4, §4.4.1, §4.4.2): check.archive-layout,
 * check.archive-metadata, check.archive-type. Exercised through the registered
 * validator (validate()) over handcrafted tmp .cortex/ trees, following the
 * same pattern as tests/spec/schema/validator-insight-checks.spec.test.ts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validate } from '../../../src/schema/validate.js';
import { makeTmpDir, cleanTmp, makeCortexProject } from '../../fixtures/hooks-harness.js';
import type { Violation } from '../../../src/schema/types.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`archive-checks-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** A minimal 3.0 project with an archive/ module directory + compliant index. */
function makeArchiveProject(root: string): void {
  makeCortexProject(root, {
    config: { schemaVersion: '3.0' },
    modules: ['anatomy', 'compass', 'atlas', 'pulse', 'archive'],
  });
  writeArchiveIndex(root);
  writeRegister(root, '(no documents ingested yet)\n');
}

function writeArchiveIndex(root: string): void {
  const p = path.join(root, '.cortex', 'archive', '_index.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    '# Archive — index\n\n**Read this when:** you need an ingested document.\n\n**What\'s here:**\n- register.md\n\n**How to navigate:** start at register.md.\n',
  );
}

function writeRegister(root: string, body: string): void {
  const p = path.join(root, '.cortex', 'archive', 'register.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `# Archive register\n\n${body}`);
}

function writeTypesDir(root: string): void {
  fs.mkdirSync(path.join(root, '.cortex', 'archive', 'types'), { recursive: true });
}

function writeType(root: string, filename: string, content: string): string {
  const p = path.join(root, '.cortex', 'archive', 'types', filename);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

function writeDocument(
  root: string,
  slug: string,
  opts: { source?: boolean; metadata?: string; extracted?: boolean } = {},
): void {
  const docDir = path.join(root, '.cortex', 'archive', 'documents', slug);
  fs.mkdirSync(docDir, { recursive: true });
  if (opts.source !== false) fs.writeFileSync(path.join(docDir, 'source.md'), 'verbatim source\n');
  if (opts.metadata !== undefined) fs.writeFileSync(path.join(docDir, 'metadata.yaml'), opts.metadata);
  if (opts.extracted !== false) {
    fs.mkdirSync(path.join(docDir, 'extracted'), { recursive: true });
    fs.writeFileSync(path.join(docDir, 'extracted', 'summary.md'), '# Summary\n');
  }
}

async function violationsFor(root: string, check: string): Promise<Violation[]> {
  const report = await validate(root, { root });
  return report.violations.filter((v) => v.check === check);
}

const VALID_METADATA = `id: archive.sample-doc
kind: client-spec
ingested_at: 2026-01-08T00:00:00Z
version: "1.0"
status: active
`;

const VALID_TYPE = `id: client-spec
label: Client specification
classification:
  hints:
    - "requirement"
extraction:
  strategy: generic
  outputs:
    - kind: summary
      path: extracted/summary.md
`;

// ---------------------------------------------------------------------------
// Absent module — tolerated (the "spine" principle every new-module check follows)
// ---------------------------------------------------------------------------

describe('archive checks tolerate an entirely absent module', () => {
  it('no .cortex/archive/ at all → no archive violations, project still validates clean', async () => {
    const root = tmp('absent');
    makeCortexProject(root, { config: { schemaVersion: '3.0' }, modules: ['anatomy', 'compass', 'atlas', 'pulse'] });
    fs.writeFileSync(path.join(root, '.cortex', 'anatomy', '_index.md'), '# Anatomy\n\nRead this when: always.\nWhat\'s here: files.\nHow to navigate: top-down.\n');
    fs.writeFileSync(path.join(root, '.cortex', 'compass', '_index.md'), '# Compass\n\nRead this when: always.\nWhat\'s here: rules.\nHow to navigate: top-down.\n');
    fs.writeFileSync(path.join(root, '.cortex', 'atlas', '_index.md'), '# Atlas\n\nRead this when: always.\nWhat\'s here: decisions.\nHow to navigate: top-down.\n');
    fs.writeFileSync(path.join(root, '.cortex', 'pulse', '_index.md'), '# Pulse\n\nRead this when: always.\nWhat\'s here: reports.\nHow to navigate: top-down.\n');
    const report = await validate(root, { root });
    const archiveViolations = report.violations.filter((v) => v.check.startsWith('check.archive'));
    expect(archiveViolations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// check.archive-layout (§4.4)
// ---------------------------------------------------------------------------

describe('check.archive-layout', () => {
  it('flags a malformed documents/<slug>/ dir (missing source.*, metadata.yaml, extracted/)', async () => {
    const root = tmp('layout-bad');
    makeArchiveProject(root);
    writeTypesDir(root);
    const docDir = path.join(root, '.cortex', 'archive', 'documents', 'broken-doc');
    fs.mkdirSync(docDir, { recursive: true });
    // No source.*, no metadata.yaml, no extracted/ — everything missing.
    const errors = await violationsFor(root, 'check.archive-layout');
    expect(errors.some((v) => v.message.includes('source.<ext>'))).toBe(true);
    expect(errors.some((v) => v.message.includes('metadata.yaml'))).toBe(true);
    expect(errors.some((v) => v.message.includes('extracted/'))).toBe(true);
  });

  it('flags archive/ missing register.md or types/', async () => {
    const root = tmp('layout-missing-register');
    makeCortexProject(root, { config: { schemaVersion: '3.0' }, modules: ['anatomy', 'compass', 'atlas', 'pulse', 'archive'] });
    writeArchiveIndex(root);
    // No register.md, no types/.
    const errors = await violationsFor(root, 'check.archive-layout');
    expect(errors.some((v) => v.message.includes('register.md'))).toBe(true);
    expect(errors.some((v) => v.message.includes('types/'))).toBe(true);
  });

  it('a well-formed documents/<slug>/ (source.*, metadata.yaml, extracted/) passes', async () => {
    const root = tmp('layout-good');
    makeArchiveProject(root);
    writeTypesDir(root);
    writeType(root, 'client-spec.yaml', VALID_TYPE);
    writeDocument(root, 'sample-doc', { metadata: VALID_METADATA });
    expect(await violationsFor(root, 'check.archive-layout')).toEqual([]);
  });

  it('tolerates an empty documents/ (nothing ingested yet)', async () => {
    const root = tmp('layout-empty-documents');
    makeArchiveProject(root);
    writeTypesDir(root);
    fs.mkdirSync(path.join(root, '.cortex', 'archive', 'documents'), { recursive: true });
    expect(await violationsFor(root, 'check.archive-layout')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// check.archive-metadata (§4.4.1)
// ---------------------------------------------------------------------------

describe('check.archive-metadata', () => {
  it('flags a metadata.yaml missing required fields', async () => {
    const root = tmp('metadata-missing-fields');
    makeArchiveProject(root);
    writeTypesDir(root);
    writeDocument(root, 'sample-doc', { metadata: 'id: archive.sample-doc\n' }); // missing kind/ingested_at/version/status
    const errors = await violationsFor(root, 'check.archive-metadata');
    expect(errors.some((v) => v.message.includes('kind'))).toBe(true);
    expect(errors.some((v) => v.message.includes('ingested_at'))).toBe(true);
    expect(errors.some((v) => v.message.includes('version'))).toBe(true);
    expect(errors.some((v) => v.message.includes('status'))).toBe(true);
  });

  it('flags a malformed ingested_at and an invalid status enum value', async () => {
    const root = tmp('metadata-malformed');
    makeArchiveProject(root);
    writeTypesDir(root);
    writeType(root, 'client-spec.yaml', VALID_TYPE);
    writeDocument(root, 'sample-doc', {
      metadata: `id: archive.sample-doc\nkind: client-spec\ningested_at: "not-a-date"\nversion: "1.0"\nstatus: deleted\n`,
    });
    const errors = await violationsFor(root, 'check.archive-metadata');
    expect(errors.some((v) => v.message.toLowerCase().includes('ingested_at'))).toBe(true);
    expect(errors.some((v) => v.message.toLowerCase().includes('status'))).toBe(true);
  });

  it('flags an id that does not match the directory name', async () => {
    const root = tmp('metadata-id-mismatch');
    makeArchiveProject(root);
    writeTypesDir(root);
    writeType(root, 'client-spec.yaml', VALID_TYPE);
    writeDocument(root, 'sample-doc', {
      metadata: `id: archive.wrong-slug\nkind: client-spec\ningested_at: 2026-01-08T00:00:00Z\nversion: "1.0"\nstatus: active\n`,
    });
    const errors = await violationsFor(root, 'check.archive-metadata');
    expect(errors.some((v) => v.location.key === 'id' && v.message.includes('archive.sample-doc'))).toBe(true);
  });

  it('flags a kind that does not resolve to a types/<kind>.yaml file (unknown type)', async () => {
    const root = tmp('metadata-unknown-kind');
    makeArchiveProject(root);
    writeTypesDir(root); // empty — no client-spec.yaml declared
    writeDocument(root, 'sample-doc', { metadata: VALID_METADATA });
    const errors = await violationsFor(root, 'check.archive-metadata');
    expect(errors.some((v) => v.location.key === 'kind' && v.message.includes('client-spec'))).toBe(true);
  });

  it('a well-formed metadata.yaml with a resolving kind passes', async () => {
    const root = tmp('metadata-good');
    makeArchiveProject(root);
    writeTypesDir(root);
    writeType(root, 'client-spec.yaml', VALID_TYPE);
    writeDocument(root, 'sample-doc', { metadata: VALID_METADATA });
    expect(await violationsFor(root, 'check.archive-metadata')).toEqual([]);
  });

  it('flags an unresolvable supersedes path', async () => {
    const root = tmp('metadata-bad-supersedes');
    makeArchiveProject(root);
    writeTypesDir(root);
    writeType(root, 'client-spec.yaml', VALID_TYPE);
    writeDocument(root, 'sample-doc-v2', {
      metadata: `id: archive.sample-doc-v2\nkind: client-spec\ningested_at: 2026-02-01T00:00:00Z\nversion: "2.0"\nstatus: active\nsupersedes:\n  - documents/sample-doc-v1/\n`,
    });
    const errors = await violationsFor(root, 'check.archive-metadata');
    expect(errors.some((v) => v.location.key === 'supersedes')).toBe(true);
  });

  it('tolerates an absent documents/ (nothing ingested yet)', async () => {
    const root = tmp('metadata-no-documents');
    makeArchiveProject(root);
    writeTypesDir(root);
    expect(await violationsFor(root, 'check.archive-metadata')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// check.archive-type (§4.4.2)
// ---------------------------------------------------------------------------

describe('check.archive-type', () => {
  it('flags a type file missing label/classification/extraction.strategy/non-empty outputs', async () => {
    const root = tmp('type-bad');
    makeArchiveProject(root);
    writeTypesDir(root);
    writeType(root, 'broken.yaml', `id: broken\n`);
    const errors = await violationsFor(root, 'check.archive-type');
    expect(errors.some((v) => v.message.includes('label'))).toBe(true);
    expect(errors.some((v) => v.message.includes('classification'))).toBe(true);
    expect(errors.some((v) => v.message.includes('extraction'))).toBe(true);
  });

  it('flags an id that does not match the filename stem', async () => {
    const root = tmp('type-id-mismatch');
    makeArchiveProject(root);
    writeTypesDir(root);
    writeType(root, 'client-spec.yaml', VALID_TYPE.replace('id: client-spec', 'id: something-else'));
    const errors = await violationsFor(root, 'check.archive-type');
    expect(errors.some((v) => v.location.key === 'id' && v.message.includes('client-spec'))).toBe(true);
  });

  it('flags classification with none of extensions/hints/explicit', async () => {
    const root = tmp('type-empty-classification');
    makeArchiveProject(root);
    writeTypesDir(root);
    writeType(
      root,
      'empty-classification.yaml',
      `id: empty-classification\nlabel: Empty\nclassification: {}\nextraction:\n  strategy: generic\n  outputs:\n    - kind: summary\n      path: extracted/summary.md\n`,
    );
    const errors = await violationsFor(root, 'check.archive-type');
    expect(errors.some((v) => v.message.includes('at least one of'))).toBe(true);
  });

  it('a well-formed type file (id==stem, label, classification, extraction) passes', async () => {
    const root = tmp('type-good');
    makeArchiveProject(root);
    writeTypesDir(root);
    writeType(root, 'client-spec.yaml', VALID_TYPE);
    expect(await violationsFor(root, 'check.archive-type')).toEqual([]);
  });

  it('tolerates an empty types/ dir (nothing declared yet)', async () => {
    const root = tmp('type-empty-dir');
    makeArchiveProject(root);
    writeTypesDir(root);
    expect(await violationsFor(root, 'check.archive-type')).toEqual([]);
  });
});
