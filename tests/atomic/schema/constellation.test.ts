/**
 * Atomic tests — check.constellation (schema §4.9 v3.0 "Validated by"): runs
 * only when .cortex/constellation.json exists; valid JSON, required top-level
 * keys, node id uniqueness, group resolution, edge-endpoint resolution,
 * module enum (v3.0: `anatomy` removed from the enum). Severity: error.
 * Exercised through the registered validator (validate()) over tmp fixture
 * projects.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validate } from '../../../src/schema/validate.js';
import { compile } from '../../../src/constellation/compile.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeRule,
  writeDevSpec,
  writeBizSpec,
  constellationPath,
} from '../../fixtures/constellation-harness.js';
import type { Violation } from '../../../src/schema/types.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`check-constellation-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

async function constellationViolations(root: string): Promise<Violation[]> {
  const report = await validate(root, { root });
  return report.violations.filter((v) => v.check === 'check.constellation');
}

/** A minimal valid v3.0 constellation document to mutate per violation class. */
function validDoc(): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    generated: '2026-07-02T14:00:00.000Z',
    groups: [
      { id: 'atlas', label: 'Atlas', children: [] },
      { id: 'compass', label: 'Compass', children: [{ id: 'compass:rules', label: 'rules' }] },
      { id: 'specs', label: 'Specs', children: [{ id: 'specs:schema', label: 'schema' }] },
    ],
    nodes: [
      { id: 'rule:R-001', module: 'rule', label: 'Rule', group: 'compass:rules', ref: 'R-001' },
      { id: 'spec:schema.validator', module: 'spec-dev', label: 'schema.validator', group: 'specs:schema', ref: 'schema.validator' },
    ],
    edges: [{ from: 'rule:R-001', to: 'spec:schema.validator', kind: 'related_specs' }],
    counters: { compass: 1, atlas: 0, specs: 1, edges: 1, droppedRefs: 0 },
  };
}

function writeConstellation(root: string, content: string): void {
  fs.mkdirSync(path.join(root, '.cortex'), { recursive: true });
  fs.writeFileSync(constellationPath(root), content, 'utf-8');
}

describe('check.constellation — absence and conformance', () => {
  it('file absent → no check.constellation violations', async () => {
    const root = tmp('absent');
    makeCortexProject(root, { config: { schemaVersion: '3.0' } });
    expect(fs.existsSync(constellationPath(root))).toBe(false);
    expect(await constellationViolations(root)).toEqual([]);
  });

  it('a real compiler output is conformant (zero violations)', async () => {
    const root = tmp('conformant');
    makeCortexProject(root, { config: { schemaVersion: '3.0' } });
    writeRule(root, 'R-001-r.md', `id: R-001\ntitle: R\nsource: []\nrelated_specs:\n  - schema.validator`);
    writeDevSpec(
      root,
      'schema/validator.spec.md',
      `id: schema.validator\nstatus: draft\nimplements: ../../specs-business/schema/trust.business.md`,
    );
    writeBizSpec(
      root,
      'schema/trust.business.md',
      `id: schema.trust\nstatus: draft\nimplemented_by:\n  - ../../specs/schema/validator.spec.md`,
    );
    await compile(root);
    expect(await constellationViolations(root)).toEqual([]);
  });

  it('a handcrafted valid document is conformant', async () => {
    const root = tmp('valid-doc');
    makeCortexProject(root, { config: { schemaVersion: '3.0' } });
    writeConstellation(root, JSON.stringify(validDoc(), null, 2));
    expect(await constellationViolations(root)).toEqual([]);
  });
});

describe('check.constellation — violation classes (all severity error, clause §4.9)', () => {
  it('invalid JSON → one error', async () => {
    const root = tmp('bad-json');
    makeCortexProject(root, { config: { schemaVersion: '3.0' } });
    writeConstellation(root, '{ not json at all');
    const violations = await constellationViolations(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe('error');
    expect(violations[0]?.clause).toBe('§4.9');
    expect(violations[0]?.message).toContain('not valid JSON');
  });

  it('missing required top-level key → error naming the key', async () => {
    const root = tmp('missing-key');
    makeCortexProject(root, { config: { schemaVersion: '3.0' } });
    const doc = validDoc();
    delete doc['counters'];
    writeConstellation(root, JSON.stringify(doc));
    const violations = await constellationViolations(root);
    expect(violations.some((v) => v.severity === 'error' && v.message.includes('"counters"'))).toBe(true);
  });

  it('duplicate node id → error', async () => {
    const root = tmp('dup-id');
    makeCortexProject(root, { config: { schemaVersion: '3.0' } });
    const doc = validDoc();
    (doc['nodes'] as unknown[]).push({
      id: 'rule:R-001',
      module: 'rule',
      label: 'Duplicate',
      group: 'compass:rules',
      ref: 'R-001',
    });
    writeConstellation(root, JSON.stringify(doc));
    const violations = await constellationViolations(root);
    expect(violations.some((v) => v.severity === 'error' && v.message.includes('duplicate node id "rule:R-001"'))).toBe(
      true,
    );
  });

  it('node group not resolving to a declared group/child id → error', async () => {
    const root = tmp('bad-group');
    makeCortexProject(root, { config: { schemaVersion: '3.0' } });
    const doc = validDoc();
    (doc['nodes'] as Record<string, unknown>[])[0]!['group'] = 'compass:nonexistent';
    writeConstellation(root, JSON.stringify(doc));
    const violations = await constellationViolations(root);
    expect(
      violations.some(
        (v) => v.severity === 'error' && v.message.includes('does not resolve to a declared group/child id'),
      ),
    ).toBe(true);
  });

  it('edge endpoint not resolving to an emitted node id → error per endpoint', async () => {
    const root = tmp('bad-edge');
    makeCortexProject(root, { config: { schemaVersion: '3.0' } });
    const doc = validDoc();
    (doc['edges'] as unknown[]).push({ from: 'rule:R-001', to: 'spec:ghost.spec', kind: 'related_specs' });
    writeConstellation(root, JSON.stringify(doc));
    const violations = await constellationViolations(root);
    expect(
      violations.some(
        (v) =>
          v.severity === 'error' &&
          v.message.includes('edge to "spec:ghost.spec" does not resolve to an emitted node id'),
      ),
    ).toBe(true);
  });

  it('module outside the §4.9 enum → error', async () => {
    const root = tmp('bad-module');
    makeCortexProject(root, { config: { schemaVersion: '3.0' } });
    const doc = validDoc();
    (doc['nodes'] as Record<string, unknown>[])[0]!['module'] = 'galaxy';
    writeConstellation(root, JSON.stringify(doc));
    const violations = await constellationViolations(root);
    expect(violations.some((v) => v.severity === 'error' && v.message.includes('module "galaxy"'))).toBe(true);
  });

  it('the retired anatomy module is outside the v3.0 enum → error', async () => {
    const root = tmp('anatomy-module');
    makeCortexProject(root, { config: { schemaVersion: '3.0' } });
    const doc = validDoc();
    (doc['nodes'] as Record<string, unknown>[])[0]!['module'] = 'anatomy';
    writeConstellation(root, JSON.stringify(doc));
    const violations = await constellationViolations(root);
    expect(violations.some((v) => v.severity === 'error' && v.message.includes('module "anatomy"'))).toBe(true);
  });
});
