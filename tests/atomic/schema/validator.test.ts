import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validate } from '../../../src/schema/validate.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const VALID_FIXTURE = path.resolve('/Users/pedropacheco1/Documents/Projetos/cortex/tests/fixtures/valid');

function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function makeTmpFixture(testName: string): string {
  const tmpDir = path.join(os.tmpdir(), `cortex-test-${testName}-${Date.now()}`);
  copyDir(VALID_FIXTURE, tmpDir);
  return tmpDir;
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('AC1: valid fixture passes with 0 errors', () => {
  it('validate valid fixture → conformant', async () => {
    const report = await validate(VALID_FIXTURE);
    expect(report.conformant).toBe(true);
    expect(report.counts.error).toBe(0);
  });

  it('a .cortex without anatomy/ is valid — the module (and its checks) retired at v3.0 step 7', () => {
    expect(fs.existsSync(path.join(VALID_FIXTURE, '.cortex', 'anatomy'))).toBe(false);
  });
});

describe('AC2: leaf with two implements values → error at implements key', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('ac2'); });
  afterAll(() => cleanup(tmpDir));

  it('two implements values → exactly one error mentioning "exactly one"', async () => {
    const specPath = path.join(tmpDir, '.specflow', 'specs', 'schema', 'validator.spec.md');
    const content = fs.readFileSync(specPath, 'utf-8');
    const newContent = content.replace(
      'implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md',
      'implements:\n  - ../../specs-business/schema/contributor-trusts-project-knowledge.business.md\n  - ../../specs-business/schema/contributor-trusts-project-knowledge.business.md'
    );
    fs.writeFileSync(specPath, newContent);
    const report = await validate(tmpDir);
    const implViolations = report.violations.filter((v) => v.check === 'check.dev-spec' && v.location.key === 'implements');
    expect(implViolations.length).toBeGreaterThan(0);
    expect(implViolations[0]!.message).toMatch(/exactly one/i);
  });
});

describe('AC3: broken implements path → error naming missing target', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('ac3'); });
  afterAll(() => cleanup(tmpDir));

  it('nonexistent implements path → error', async () => {
    const specPath = path.join(tmpDir, '.specflow', 'specs', 'schema', 'validator.spec.md');
    const content = fs.readFileSync(specPath, 'utf-8');
    const newContent = content.replace(
      'implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md',
      'implements: ../../specs-business/schema/nonexistent.business.md'
    );
    fs.writeFileSync(specPath, newContent);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => (v.check === 'check.dev-spec' || v.check === 'check.xref-resolve') && v.location.key === 'implements');
    expect(v).toBeDefined();
    expect(v!.message).toMatch(/nonexistent/i);
  });
});

describe('AC4: asymmetric implements/implemented_by → error naming both files', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('ac4'); });
  afterAll(() => cleanup(tmpDir));

  it('business spec without matching implemented_by → xref-symmetry error', async () => {
    // Remove implemented_by from business spec
    const bizPath = path.join(tmpDir, '.specflow', 'specs-business', 'schema', 'contributor-trusts-project-knowledge.business.md');
    fs.writeFileSync(bizPath, `---
id: schema.contributor-trusts-project-knowledge
status: draft
implemented_by: []
---

# Contributor Trusts Project Knowledge

A contributor can trust that the project knowledge is consistent and validated.
`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.xref-symmetry');
    expect(v).toBeDefined();
    expect(v!.message).toMatch(/validator\.spec\.md/);
  });
});

describe('AC5: missing _overview.md → error check.overview-present', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('ac5'); });
  afterAll(() => cleanup(tmpDir));

  it('remove _overview.md from schema dir → error', async () => {
    fs.unlinkSync(path.join(tmpDir, '.specflow', 'specs', 'schema', '_overview.md'));
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.overview-present');
    expect(v).toBeDefined();
    expect(v!.severity).toBe('error');
  });
});

describe('AC6: dev spec missing status → error check.dev-spec', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('ac6'); });
  afterAll(() => cleanup(tmpDir));

  it('spec without status → error mentioning "status"', async () => {
    const specPath = path.join(tmpDir, '.specflow', 'specs', 'schema', 'validator.spec.md');
    fs.writeFileSync(specPath, `---
id: schema.validator
implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md
---

# Schema Validator
`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.dev-spec' && v.location.key === 'status');
    expect(v).toBeDefined();
    expect(v!.message).toMatch(/status/i);
  });
});

describe('AC7: schemaVersion 99.0 → exactly one check.config error, no other violations', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('ac7'); });
  afterAll(() => cleanup(tmpDir));

  it('major version mismatch short-circuits all other checks', async () => {
    const configPath = path.join(tmpDir, '.cortex', 'cortex.config.json');
    fs.writeFileSync(configPath, JSON.stringify({ schemaVersion: '99.0', hooks: { preRead: false }, loop: { enabled: false } }));
    const report = await validate(tmpDir);
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]!.check).toBe('check.config');
    expect(report.violations[0]!.severity).toBe('error');
  });
});

describe('AC8: single-file scope on valid spec → no false unresolved-xref errors', () => {
  it('file scope on validator.spec.md → no spurious xref errors', async () => {
    const specPath = path.join(VALID_FIXTURE, '.specflow', 'specs', 'schema', 'validator.spec.md');
    const report = await validate(specPath, { scope: 'file', root: VALID_FIXTURE });
    const xrefViolations = report.violations.filter((v) => v.check === 'check.xref-resolve');
    expect(xrefViolations).toHaveLength(0);
    expect(report.counts.error).toBe(0);
  });
});

// Smoke tests for remaining checks

describe('check.rule: rule missing title → fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('rule'); });
  afterAll(() => cleanup(tmpDir));

  it('rule without title fires check.rule', async () => {
    const rulesDir = path.join(tmpDir, '.cortex', 'compass', 'rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, 'R-001.md'), `---
id: R-001
source:
  - ../../specs/schema/validator.spec.md
governs:
  - "src/**"
---
`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.rule' && v.location.key === 'title');
    expect(v).toBeDefined();
  });
});

describe('check.bug: bug with invalid type → fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('bug'); });
  afterAll(() => cleanup(tmpDir));

  it('bug with invalid type fires check.bug', async () => {
    const bugsDir = path.join(tmpDir, '.cortex', 'compass', 'bugs');
    fs.mkdirSync(bugsDir, { recursive: true });
    fs.writeFileSync(path.join(bugsDir, 'B-001.md'), `---
id: B-001
title: Test bug
type: invalid-type
severity: high
status: open
affects:
  - src/foo.ts
---
`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.bug' && v.location.key === 'type');
    expect(v).toBeDefined();
  });
});

describe('check.atlas: atlas decision missing title → fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('atlas'); });
  afterAll(() => cleanup(tmpDir));

  it('decision without title fires check.atlas', async () => {
    const decisionsDir = path.join(tmpDir, '.cortex', 'atlas', 'decisions');
    fs.mkdirSync(decisionsDir, { recursive: true });
    fs.writeFileSync(path.join(decisionsDir, 'decision-2024-01-01-test.md'), `---
id: decision.2024-01-01-test
date: "2024-01-01"
---

# Test Decision
`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.atlas' && v.location.key === 'title');
    expect(v).toBeDefined();
  });
});

describe('check.atlas (3.4): the two decision warnings — bears on nothing; sources under pulse/', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('atlas-34'); });
  afterAll(() => cleanup(tmpDir));

  function writeDecision(name: string, frontmatter: string): string {
    const decisionsDir = path.join(tmpDir, '.cortex', 'atlas', 'decisions');
    fs.mkdirSync(decisionsDir, { recursive: true });
    const p = path.join(decisionsDir, `${name}.md`);
    fs.writeFileSync(p, `---\n${frontmatter}\n---\n\n# ${name}\n`);
    return p;
  }

  function atlasAt(report: Awaited<ReturnType<typeof validate>>, p: string) {
    return report.violations.filter((v) => v.check === 'check.atlas' && v.location.path === p);
  }

  it('a decision with no bears_on → exactly one check.atlas warning at key bears_on, clause §4.3; the tree stays conformant', async () => {
    const p = writeDecision('2026-09-15-seedless', 'id: decision.2026-09-15-seedless\ntitle: Seedless\ndate: 2026-09-15T00:00:00Z');
    const report = await validate(tmpDir);
    expect(atlasAt(report, p)).toEqual([
      { severity: 'warning', check: 'check.atlas', clause: '§4.3', location: { path: p, key: 'bears_on' }, message: 'decision bears on nothing; add bears_on' },
    ]);
    expect(report.conformant).toBe(true);
    fs.rmSync(p);
  });

  it('a decision whose sources: resolves under .cortex/pulse/ → one check.atlas warning at key sources containing "record it as evidence", and no error for that file', async () => {
    const reportsDir = path.join(tmpDir, '.cortex', 'pulse', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, 'usage.md'), '---\nkind: pulse-usage-report\ngenerated: 2026-09-15T00:00:00Z\nloop: cortex-usage\n---\n\n# Usage\n');
    const p = writeDecision(
      '2026-08-05-x',
      'id: decision.2026-08-05-x\ntitle: X\ndate: 2026-08-05T00:00:00Z\nsources:\n  - ../../pulse/reports/usage.md\nbears_on:\n  - "schema:§5"',
    );
    const report = await validate(tmpDir);
    const mine = atlasAt(report, p);
    expect(mine.filter((v) => v.severity === 'error')).toEqual([]);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ severity: 'warning', clause: '§4.3', location: { path: p, key: 'sources' } });
    expect(mine[0]!.message).toContain('record it as evidence');
    expect(mine[0]!.message).toContain('../../pulse/reports/usage.md');
    fs.rmSync(p);
  });

  it('a decision with a bears_on list and a durable sources: target carries neither warning; an empty list is still "nothing"', async () => {
    const ok = writeDecision(
      '2026-09-15-ok',
      'id: decision.2026-09-15-ok\ntitle: Ok\ndate: 2026-09-15T00:00:00Z\nsources:\n  - 2026-07-01-sample-decision.md\nbears_on:\n  - R-001',
    );
    const empty = writeDecision('2026-09-15-empty', 'id: decision.2026-09-15-empty\ntitle: Empty\ndate: 2026-09-15T00:00:00Z\nbears_on: []');
    const report = await validate(tmpDir);
    expect(atlasAt(report, ok)).toEqual([]);
    expect(atlasAt(report, empty).map((v) => `${v.severity} ${v.location.key}`)).toEqual(['warning bears_on']);
    fs.rmSync(ok);
    fs.rmSync(empty);
  });

  it('a sources: entry that does not resolve keeps the existing error and gets no pulse warning', async () => {
    const p = writeDecision(
      '2026-09-15-dangling',
      'id: decision.2026-09-15-dangling\ntitle: Dangling\ndate: 2026-09-15T00:00:00Z\nsources:\n  - ../../pulse/reports/gone.md\nbears_on:\n  - R-001',
    );
    const report = await validate(tmpDir);
    const mine = atlasAt(report, p);
    expect(mine.map((v) => `${v.severity} ${v.location.key}`)).toEqual(['error sources']);
    expect(mine[0]!.message).not.toContain('record it as evidence');
    fs.rmSync(p);
  });

  it('the two warnings are decision-only: a stakeholder without bears_on is not warned', async () => {
    const stakeholdersDir = path.join(tmpDir, '.cortex', 'atlas', 'stakeholders');
    fs.mkdirSync(stakeholdersDir, { recursive: true });
    const p = path.join(stakeholdersDir, 'fixture-person.md');
    fs.writeFileSync(p, '---\nid: stakeholder.fixture-person\nname: Fixture Person\nrole: reviewer\n---\n\n# Fixture Person\n');
    const report = await validate(tmpDir);
    expect(atlasAt(report, p)).toEqual([]);
    fs.rmSync(p);
  });
});

describe('check.atlas B-006: raw atlas/sources/ material is exempt from the id requirement; .meta.md sidecars are validated', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('atlas-sources'); });
  afterAll(() => cleanup(tmpDir));

  function sourcesDir(): string {
    const dir = path.join(tmpDir, '.cortex', 'atlas', 'sources');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  it('frontmatter-less raw file under atlas/sources/ validates clean', async () => {
    const rawPath = path.join(sourcesDir(), 'client-call.md');
    fs.writeFileSync(rawPath, '# Raw captured call notes\n\nVerbatim ingested content, no frontmatter by design.\n');
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.atlas' && v.location.path === rawPath);
    expect(v).toBeUndefined();
    fs.unlinkSync(rawPath);
  });

  it('sidecar missing kind and captured → errors on both keys', async () => {
    const metaPath = path.join(sourcesDir(), 'client-call.meta.md');
    fs.writeFileSync(metaPath, `---
id: source.client-call
---

Sidecar with only an id.
`);
    const report = await validate(tmpDir);
    const kindV = report.violations.find((v) => v.check === 'check.atlas' && v.location.path === metaPath && v.location.key === 'kind');
    const capturedV = report.violations.find((v) => v.check === 'check.atlas' && v.location.path === metaPath && v.location.key === 'captured');
    expect(kindV).toBeDefined();
    expect(kindV!.severity).toBe('error');
    expect(capturedV).toBeDefined();
    fs.unlinkSync(metaPath);
  });

  it('sidecar with valid id, kind, and captured passes clean', async () => {
    const metaPath = path.join(sourcesDir(), 'client-call.meta.md');
    fs.writeFileSync(metaPath, `---
id: source.client-call
kind: transcript
captured: 2026-07-08T00:00:00Z
origin: "weekly client sync"
---

Structured sidecar for the raw capture.
`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.atlas' && v.location.path === metaPath);
    expect(v).toBeUndefined();
    fs.unlinkSync(metaPath);
  });

  it('sidecar with a non-enum kind and a bad id shape → errors', async () => {
    const metaPath = path.join(sourcesDir(), 'client-call.meta.md');
    fs.writeFileSync(metaPath, `---
id: not-a-source-id
kind: carrier-pigeon
captured: 2026-07-08
---
`);
    const report = await validate(tmpDir);
    const idV = report.violations.find((v) => v.check === 'check.atlas' && v.location.path === metaPath && v.location.key === 'id');
    const kindV = report.violations.find((v) => v.check === 'check.atlas' && v.location.path === metaPath && v.location.key === 'kind');
    expect(idV).toBeDefined();
    expect(kindV).toBeDefined();
    fs.unlinkSync(metaPath);
  });
});

describe('check.pulse: pulse artefact missing kind → warning fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('pulse'); });
  afterAll(() => cleanup(tmpDir));

  it('pulse artefact without kind fires warning', async () => {
    const pulseDir = path.join(tmpDir, '.cortex', 'pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(path.join(pulseDir, 'report-2024.md'), `---
generated: "2024-01-01"
loop: "weekly"
---

# Pulse Report
`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.pulse' && v.location.key === 'kind');
    expect(v).toBeDefined();
    expect(v!.severity).toBe('warning');
  });
});

describe('B-008: pulse subdirectories are exempt from check.index-present (four-zone reorg)', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('pulse-zones'); });
  afterAll(() => cleanup(tmpDir));

  it('reports/ and extraction/fragments/ content with no _index.md of their own raises no violation under .cortex/pulse/, while the pulse root _index.md is still required', async () => {
    const pulseDir = path.join(tmpDir, '.cortex', 'pulse');
    // The fixture's pulse root _index.md is untouched — still required and present.
    expect(fs.existsSync(path.join(pulseDir, '_index.md'))).toBe(true);

    fs.mkdirSync(path.join(pulseDir, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(pulseDir, 'reports', 'hygiene.md'), '# Hygiene report\n');

    fs.mkdirSync(path.join(pulseDir, 'extraction', 'fragments'), { recursive: true });
    fs.writeFileSync(path.join(pulseDir, 'extraction', 'fragments', 'f1.json'), '{}');

    const report = await validate(tmpDir);
    const indexPresentViolations = report.violations.filter((v) => v.check === 'check.index-present');
    expect(indexPresentViolations.some((v) => v.location.path.includes(path.join('.cortex', 'pulse')))).toBe(false);
  });
});

// check.anatomy-files / check.anatomy-graph / check.anatomy-purpose-source
// were DELETED at v3.0 (schema Appendix A; build-order-v3 step 7) — the
// anatomy module no longer exists and the checks are unregistered.
describe('anatomy checks retired: leftover anatomy content never fires an anatomy check', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('anatomy-retired'); });
  afterAll(() => cleanup(tmpDir));

  it('a stray .cortex/anatomy/ with garbage artefacts yields no check.anatomy-* violations', async () => {
    const anatomyDir = path.join(tmpDir, '.cortex', 'anatomy');
    fs.mkdirSync(anatomyDir, { recursive: true });
    fs.writeFileSync(path.join(anatomyDir, 'files.md'), '| src/foo.ts | Does foo. | 200 | BADHASH |\n');
    fs.writeFileSync(path.join(anatomyDir, 'graph.json'), 'NOT JSON {{{');
    const report = await validate(tmpDir);
    expect(report.violations.filter((v) => v.check.startsWith('check.anatomy'))).toEqual([]);
  });
});

describe('check.business-spec: Given/When/Then → warning fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('biz-gwthen'); });
  afterAll(() => cleanup(tmpDir));

  it('business spec with **Given** marker in body fires warning', async () => {
    const bizPath = path.join(tmpDir, '.specflow', 'specs-business', 'schema', 'contributor-trusts-project-knowledge.business.md');
    fs.writeFileSync(bizPath, `---
id: schema.contributor-trusts-project-knowledge
status: draft
implemented_by:
  - ../../specs/schema/validator.spec.md
---

- **Given** a project with specs
- **When** the validator runs
- **Then** it should pass
`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.business-spec' && v.message.includes('Given/When/Then'));
    expect(v).toBeDefined();
    expect(v!.severity).toBe('warning');
  });

  it('prose "When this works, …" does NOT fire (template-recommended phrasing)', async () => {
    const bizPath = path.join(tmpDir, '.specflow', 'specs-business', 'schema', 'contributor-trusts-project-knowledge.business.md');
    fs.writeFileSync(bizPath, `---
id: schema.contributor-trusts-project-knowledge
status: draft
implemented_by:
  - ../../specs/schema/validator.spec.md
---

## Outcome

When this works, a developer can trust the knowledge. Then the team benefits, given time.
`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.business-spec' && v.message.includes('Given/When/Then'));
    expect(v).toBeUndefined();
  });
});

describe('check.covers-resolves: nonexistent covers ID → fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('scenario'); });
  afterAll(() => cleanup(tmpDir));

  it('scenario spec with nonexistent covers ID fires', async () => {
    const scenarioDir = path.join(tmpDir, 'tests', 'scenario', 'specs');
    fs.mkdirSync(scenarioDir, { recursive: true });
    fs.writeFileSync(path.join(scenarioDir, 'my-scenario.md'), `---
name: my-scenario
covers:
  - schema.nonexistent-business-spec
---
`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.covers-resolves');
    expect(v).toBeDefined();
  });
});

describe('check.xref-unique: two specs with same ID → fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('xref-unique'); });
  afterAll(() => cleanup(tmpDir));

  it('duplicate spec ID fires check.xref-unique', async () => {
    // Create a second spec dir with a spec that has the same ID
    const schemaDir2 = path.join(tmpDir, '.specflow', 'specs', 'schema2');
    fs.mkdirSync(schemaDir2, { recursive: true });
    fs.writeFileSync(path.join(schemaDir2, '_overview.md'), `## What this is\nDuplicate domain.\n## What it covers\nDuplication test.\n## Why it's grouped this way\nFor testing.`);
    fs.writeFileSync(path.join(schemaDir2, 'validator.spec.md'), `---
id: schema.validator
status: draft
implements: ../../../specs-business/schema/contributor-trusts-project-knowledge.business.md
---

# Duplicate validator spec
`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.xref-unique');
    expect(v).toBeDefined();
  });
});

describe('check.xref-acyclic: dep cycle → fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('xref-cycle'); });
  afterAll(() => cleanup(tmpDir));

  it('circular depends_on → fires check.xref-acyclic', async () => {
    const schemaDir = path.join(tmpDir, '.specflow', 'specs', 'schema');
    // Modify validator.spec.md to depend on schema.other
    const validatorPath = path.join(schemaDir, 'validator.spec.md');
    fs.writeFileSync(validatorPath, `---
id: schema.validator
status: draft
implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md
depends_on:
  - schema.other
---
`);
    // Create a second biz spec so other.spec.md's implements can resolve
    const bizDir = path.join(tmpDir, '.specflow', 'specs-business', 'schema');
    fs.writeFileSync(path.join(bizDir, 'other.business.md'), `---
id: schema.other-biz
status: draft
implemented_by:
  - ../../specs/schema/other.spec.md
---
`);
    // Create other.spec.md depending back on schema.validator
    fs.writeFileSync(path.join(schemaDir, 'other.spec.md'), `---
id: schema.other
status: draft
implements: ../../specs-business/schema/other.business.md
depends_on:
  - schema.validator
---
`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.xref-acyclic');
    expect(v).toBeDefined();
  });
});

describe('check.hook-config: settings.json missing PreRead → fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('hook-config'); });
  afterAll(() => cleanup(tmpDir));

  it('config has preRead:true but settings.json has no PreRead hook', async () => {
    // Update config to enable preRead
    const configPath = path.join(tmpDir, '.cortex', 'cortex.config.json');
    fs.writeFileSync(configPath, JSON.stringify({ schemaVersion: '3.0', hooks: { preRead: true }, loop: { enabled: false } }));
    // Create settings.json without PreRead hook
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({ hooks: {} }));
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.hook-config');
    expect(v).toBeDefined();
  });
});

describe('check.claude-md: CLAUDE.md with malformed cortex block → fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('claude-md'); });
  afterAll(() => cleanup(tmpDir));

  it('CLAUDE.md with cortex:start but no cortex:end fires error', async () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), `# Project\n\n<!-- cortex:start -->\nSome content without end marker\n`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.claude-md');
    expect(v).toBeDefined();
    expect(v!.severity).toBe('error');
  });
});

describe('check.loop-md: loop.md missing Stop condition → warning fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('loop-md'); });
  afterAll(() => cleanup(tmpDir));

  it('loop.md without "Stop condition:" fires warning', async () => {
    fs.writeFileSync(path.join(tmpDir, 'loop.md'), `# Loop\n\nPropose, don't mutate — always.\n\nNo stop condition here.\n`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.loop-md' && v.message.includes('Stop condition'));
    expect(v).toBeDefined();
    expect(v!.severity).toBe('warning');
  });
});

describe('check.index-shape: _index.md missing What\'s here: → fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('index-shape'); });
  afterAll(() => cleanup(tmpDir));

  it('_index.md missing "What\'s here:" fires warning', async () => {
    const indexPath = path.join(tmpDir, '.cortex', '_index.md');
    fs.writeFileSync(indexPath, `# Cortex — index\n\n**Read this when:** navigating.\n\n**How to navigate:** top-down.\n`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.index-shape' && v.message.includes("What's here:"));
    expect(v).toBeDefined();
  });
});

describe('check.specs-index: .specflow/specs/_index.md missing ## Domains → fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('specs-index'); });
  afterAll(() => cleanup(tmpDir));

  it('.specflow/specs/_index.md without ## Domains fires error', async () => {
    const indexPath = path.join(tmpDir, '.specflow', 'specs', '_index.md');
    fs.writeFileSync(indexPath, `# Specs — index\n\n**Read this when:** reading specs.\n\n## Dependency Graph\n\nNone.\n\n## Build Order\n\nPhase 1.\n`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.specs-index' && v.message.includes('## Domains'));
    expect(v).toBeDefined();
  });
});

describe('check.overview-shape: _overview.md missing heading → fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('overview-shape'); });
  afterAll(() => cleanup(tmpDir));

  it('_overview.md without ## What it covers fires warning', async () => {
    const overviewPath = path.join(tmpDir, '.specflow', 'specs', 'schema', '_overview.md');
    fs.writeFileSync(overviewPath, `## What this is\nSchema domain.\n\n## Why it's grouped this way\nGrouped for clarity.\n`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.overview-shape' && v.message.includes('## What it covers'));
    expect(v).toBeDefined();
  });
});

describe('check.id-matches-path: spec with wrong id → fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('id-path'); });
  afterAll(() => cleanup(tmpDir));

  it('spec with id not matching path fires error', async () => {
    const specPath = path.join(tmpDir, '.specflow', 'specs', 'schema', 'validator.spec.md');
    fs.writeFileSync(specPath, `---
id: schema.wrong-id
status: draft
implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md
---

# Schema Validator
`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.id-matches-path');
    expect(v).toBeDefined();
  });
});

describe('check.layout: .cortex/compass/ missing _index.md → fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('layout'); });
  afterAll(() => cleanup(tmpDir));

  it('missing _index.md in compass/ fires error', async () => {
    const indexPath = path.join(tmpDir, '.cortex', 'compass', '_index.md');
    fs.unlinkSync(indexPath);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => (v.check === 'check.layout' || v.check === 'check.index-present') && v.location.path.includes('compass'));
    expect(v).toBeDefined();
  });
});

describe('check.config: cortex.config.json not valid JSON → fires', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('config-invalid'); });
  afterAll(() => cleanup(tmpDir));

  it('invalid JSON in config fires check.config error', async () => {
    const configPath = path.join(tmpDir, '.cortex', 'cortex.config.json');
    fs.writeFileSync(configPath, 'NOT JSON {{{');
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.config');
    expect(v).toBeDefined();
    expect(v!.severity).toBe('error');
  });
});

describe('schema §4.3: seven-type bug taxonomy accepted (slugged filename)', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('bug-taxonomy'); });
  afterAll(() => cleanup(tmpDir));

  it('conformant bug with type layer-drift / status triaged → no check.bug violations', async () => {
    const bugsDir = path.join(tmpDir, '.cortex', 'compass', 'bugs');
    fs.writeFileSync(path.join(bugsDir, 'B-001-layer-drift-example.md'), `---
id: B-001
title: Example drift bug
type: layer-drift
severity: medium
status: triaged
affects:
  - schema.validator
---

# B-001 — Example drift bug
`);
    const report = await validate(tmpDir);
    const bugViolations = report.violations.filter((v) => v.check === 'check.bug');
    expect(bugViolations).toEqual([]);
  });

  it('legacy enum value (type: logic) → check.bug error', async () => {
    const bugsDir = path.join(tmpDir, '.cortex', 'compass', 'bugs');
    fs.writeFileSync(path.join(bugsDir, 'B-002-legacy-enum.md'), `---
id: B-002
title: Legacy enum value
type: logic
severity: low
status: open
affects:
  - schema.validator
---
`);
    const report = await validate(tmpDir);
    const v = report.violations.find(
      (v) => v.check === 'check.bug' && (v.location.path ?? '').includes('B-002'),
    );
    expect(v).toBeDefined();
  });
});

describe('check.rule-governs-resolves: rule glob with 0 matches → warning', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('rule-governs'); });
  afterAll(() => cleanup(tmpDir));

  it('slugged rule file with unmatched governs glob fires warning, not error', async () => {
    const rulesDir = path.join(tmpDir, '.cortex', 'compass', 'rules');
    fs.writeFileSync(path.join(rulesDir, 'R-001-no-such-files.md'), `---
id: R-001
title: Governs nothing yet
source:
  - ../../../.specflow/specs/schema/validator.spec.md
governs:
  - "src/nonexistent/**/*.ts"
---
`);
    const report = await validate(tmpDir);
    const v = report.violations.find((v) => v.check === 'check.rule-governs-resolves');
    expect(v).toBeDefined();
    expect(v!.severity).toBe('warning');
    expect(report.violations.filter((x) => x.check === 'check.rule' && (x.location.path ?? '').includes('R-001'))).toEqual([]);
  });
});

describe('check.dev-spec-governs-resolves: dev-spec governs glob', () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = makeTmpFixture('devspec-governs'); });
  afterAll(() => cleanup(tmpDir));

  it('unmatched glob → warning; matching glob → no warning; still conformant', async () => {
    const specPath = path.join(tmpDir, '.specflow', 'specs', 'schema', 'validator.spec.md');
    const raw = fs.readFileSync(specPath, 'utf-8');
    fs.writeFileSync(specPath, raw.replace(
      'implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md',
      `implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md
governs:
  - ".specflow/specs/**/*.spec.md"
  - "src/ghost/**/*.ts"`,
    ));
    const report = await validate(tmpDir);
    const warnings = report.violations.filter((v) => v.check === 'check.dev-spec-governs-resolves');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('warning');
    expect(warnings[0]!.message).toContain('src/ghost/**/*.ts');
    expect(report.conformant).toBe(true); // warnings never break conformance
  });
});
