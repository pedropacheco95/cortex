/**
 * Spec tests — `atlas.evidence` as one integrated slice, through `validate()`
 * over a tmp copy of the valid fixture: the new check is wired into the run
 * and interacts with `check.atlas`, `check.bears-on` and `check.layout`; the
 * `evidence-candidate` type flows through `check.pulse` and `pulse-accept`;
 * and the three producers together write nothing under `.cortex/atlas/`
 * except `atlas/evidence/`. Not a criteria replay: each block accumulates
 * state across several verbs and checks the cumulative filesystem.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { validate } from '../../../src/schema/validate.js';
import { pulseCli } from '../../../src/pulse/review.js';
import { runUsage } from '../../../src/pulse/usage.js';
import { threadCli } from '../../../src/pulse/thread-cli.js';
import { evidenceFilePayload } from '../../../src/atlas/evidence.js';
import { snapshotTree } from '../../fixtures/init-harness.js';
import { makeThread, threadCitation } from '../../fixtures/threads.js';
import { seedThreads } from '../../fixtures/thread-cli.js';
import { writeSessionTranscript, toolTurn, bash, grep } from '../../fixtures/sessions.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VALID_FIXTURE = path.resolve(HERE, '../../fixtures/valid');
const NOW = new Date('2026-09-15T15:58:00.000Z');

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function write(root: string, rel: string, body: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf-8');
  return abs;
}

/**
 * A tmp copy of the valid fixture with a numbered schema document (so
 * `schema:§5` resolves) and a `pulse.usage` dev spec (so the usage evidence's
 * `bears_on` resolves through the project index).
 */
function project(label: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `cortex-evidence-spec-${label}-`)));
  dirs.push(root);
  copyDir(VALID_FIXTURE, root);
  write(root, 'cortex-schema.md', '## 5. Hooks\n\n## 6. Cross-reference conventions\n\n### 6.2 Addressable schema clauses\n');
  write(
    root,
    '.specflow/specs/pulse/usage.spec.md',
    '---\nid: pulse.usage\nstatus: draft\nimplements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md\n---\n\n# Usage\n\nThe usage report.\n',
  );
  write(root, '.specflow/specs/pulse/_overview.md', '## What this is\n\nPulse specs.\n\n## What it covers\n\nUsage.\n\n## Why it\'s grouped this way\n\nPulse.\n');
  const biz = path.join(root, '.specflow/specs-business/schema/contributor-trusts-project-knowledge.business.md');
  fs.writeFileSync(biz, fs.readFileSync(biz, 'utf-8').replace('  - ../../specs/schema/validator.spec.md\n', '  - ../../specs/schema/validator.spec.md\n  - ../../specs/pulse/usage.spec.md\n'), 'utf-8');
  return root;
}

function errors(report: Awaited<ReturnType<typeof validate>>): string[] {
  return report.violations.filter((v) => v.severity === 'error').map((v) => `${v.check}@${v.location.key ?? ''}: ${v.message}`);
}

function evidenceViolations(report: Awaited<ReturnType<typeof validate>>, file: string): string[] {
  return report.violations
    .filter((v) => v.location.path === file && ['check.evidence', 'check.atlas', 'check.bears-on'].includes(v.check))
    .map((v) => `${v.check}@${v.location.key ?? ''}: ${v.message}`);
}

const VALID_EVIDENCE = [
  '---',
  'id: evidence.2026-09-15-usage',
  'title: "Cortex usage over 41 sessions"',
  'date: 2026-09-15T15:58:00Z',
  'kind: measurement',
  'instrument: pulse.usage',
  'window:',
  '  from: 2026-07-01',
  '  to: 2026-09-15',
  '  sessions: 41',
  'findings:',
  '  - metric: searches.knowledge',
  '    value: 54',
  'bears_on:',
  '  - "schema:§5"',
  '  - pulse.usage',
  '---',
  '',
  '# usage',
  '',
].join('\n');

// ---------------------------------------------------------------------------
// Rules 1, 2 — the check inside a full validate() run
// ---------------------------------------------------------------------------

describe('check.evidence is wired into validate() and composes with check.atlas, check.bears-on and check.layout', () => {
  it('a valid evidence file is clean across all three checks; the project stays conformant', async () => {
    const root = project('valid');
    const baseline = await validate(root);
    expect(errors(baseline)).toEqual([]);

    write(root, '.cortex/atlas/evidence/_index.md', '# Evidence — index\n\n**Read this when:** you need a number.\n\n**What\'s here:** dated measurements.\n\n**How to navigate:** follow bears_on.\n');
    const file = write(root, '.cortex/atlas/evidence/2026-09-15-usage.md', VALID_EVIDENCE);

    const report = await validate(root);
    expect(evidenceViolations(report, file)).toEqual([]);
    expect(errors(report)).toEqual([]);
    expect(report.conformant).toBe(true);
  });

  it('five missing/invalid fields are five check.evidence errors and conformant is false; id/filename disagreement and a decision in supersedes are two more', async () => {
    const root = project('errors');
    write(root, '.cortex/atlas/evidence/_index.md', '# Evidence — index\n\n**Read this when:** x.\n\n**What\'s here:** y.\n');
    const five = write(
      root,
      '.cortex/atlas/evidence/2026-09-15-five.md',
      '---\nid: evidence.2026-09-15-five\ntitle: x\ndate: 2026-09-15T15:58:00Z\nkind: guess\nwindow:\n  from: yesterday\nfindings: []\nbears_on: []\n---\n',
    );
    const mismatch = write(
      root,
      '.cortex/atlas/evidence/2026-09-15-usage.md',
      VALID_EVIDENCE.replace('id: evidence.2026-09-15-usage', 'id: evidence.2026-09-14-usage').replace('---\n\n# usage', 'supersedes:\n  - ../decisions/2026-07-01-sample-decision.md\n---\n\n# usage'),
    );

    const report = await validate(root);
    const fiveKeys = report.violations.filter((v) => v.location.path === five && v.check === 'check.evidence').map((v) => v.location.key).sort();
    expect(fiveKeys).toEqual(['bears_on', 'findings', 'instrument', 'kind', 'window']);
    const mismatchKeys = report.violations.filter((v) => v.location.path === mismatch && v.check === 'check.evidence').map((v) => v.location.key).sort();
    expect(mismatchKeys).toEqual(['id', 'supersedes']);
    // check.atlas resolves the decision path fine — the "not evidence" finding is check.evidence's alone.
    expect(report.violations.filter((v) => v.location.path === mismatch && v.check === 'check.atlas')).toEqual([]);
    expect(report.conformant).toBe(false);
  });

  it('an absent atlas/evidence/ is nothing; a present one without _index.md is one check.layout error', async () => {
    const root = project('layout');
    const absent = await validate(root);
    expect(absent.violations.filter((v) => /evidence/.test(v.message) || /evidence/.test(path.relative(root, v.location.path)))).toEqual([]);

    fs.mkdirSync(path.join(root, '.cortex', 'atlas', 'evidence'), { recursive: true });
    const present = await validate(root);
    const layout = present.violations.filter((v) => v.check === 'check.layout' && /evidence/.test(v.location.path));
    expect(layout).toHaveLength(1);
    expect(layout[0]?.message).toContain('.cortex/atlas/evidence/');
  });
});

// ---------------------------------------------------------------------------
// Rule 7 — evidence-candidate through the gate and accept
// ---------------------------------------------------------------------------

const REPORT_HEADER = '---\nkind: pulse-audit\ngenerated: 2026-09-15T00:00:00Z\nloop: cortex-loop-audit\n---\n\n# Audit\n\n';

function candidate(target: string, label: string, payload: string): string {
  return `## S-031: Validator audit count\n\n**Type:** evidence-candidate\n**Target:** ${target}\n\n**${label}:**\n\n\`\`\`\n${payload}\`\`\`\n`;
}

describe('An evidence-candidate is gated like a decision-candidate', () => {
  it('validate admits the section; accept creates the file byte-exact plus _index.md; validate is then clean', async () => {
    const root = project('accept');
    const { payload } = evidenceFilePayload(
      {
        slug: 'audit',
        title: 'Validator audit',
        kind: 'audit',
        instrument: 'cortex validate',
        window: { from: '2026-09-15', to: '2026-09-15' },
        findings: [{ metric: 'violations', value: 0, unit: 'count' }],
        bearsOn: ['schema:§5', 'schema.validator'],
        body: 'Zero violations on 2026-09-15.',
      },
      NOW,
    );
    const target = '.cortex/atlas/evidence/2026-09-15-audit.md';
    write(root, '.cortex/pulse/reports/x.md', REPORT_HEADER + candidate(target, 'Proposed file', payload));

    const before = await validate(root);
    expect(before.violations.filter((v) => v.check === 'check.pulse' && v.location.key === 'S-031')).toEqual([]);
    expect(fs.existsSync(path.join(root, '.cortex', 'atlas', 'evidence'))).toBe(false);

    expect(await pulseCli('pulse-accept', ['S-031'], root)).toBe(0);
    // byte-exact to the fenced block — the lines between the fences, no trailing newline (the B-003 precedent)
    expect(fs.readFileSync(path.join(root, target), 'utf-8')).toBe(payload.replace(/\n$/, ''));
    expect(fs.existsSync(path.join(root, '.cortex', 'atlas', 'evidence', '_index.md'))).toBe(true);
    expect(fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'x.md'), 'utf-8')).toContain('**Status:** accepted');

    const after = await validate(root);
    expect(errors(after)).toEqual([]);
  });

  it('a decisions target or an addition payload is a check.pulse error for the section, and accept refuses it', async () => {
    const root = project('gate');
    write(root, '.cortex/pulse/reports/x.md', REPORT_HEADER + candidate('.cortex/atlas/decisions/y.md', 'Proposed file', '---\nid: evidence.y\n---\n'));
    write(root, '.cortex/pulse/reports/y.md', REPORT_HEADER.replace('S-031', 'S-032') + candidate('.cortex/atlas/evidence/2026-09-15-audit.md', 'Proposed addition', 'text\n').replace('S-031', 'S-032'));

    const report = await validate(root);
    const gate = report.violations.filter((v) => v.check === 'check.pulse' && v.severity === 'error');
    expect(gate.map((v) => v.location.key).sort()).toEqual(['S-031', 'S-032']);

    const before = snapshotTree(root);
    expect(await pulseCli('pulse-accept', ['S-031'], root)).toBe(1);
    expect(snapshotTree(root)).toEqual(before);
    expect(fs.existsSync(path.join(root, '.cortex', 'atlas', 'decisions', 'y.md'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rules 4–7 — the three producers write only atlas/evidence
// ---------------------------------------------------------------------------

describe('Only atlas/evidence is written by the producers', () => {
  it('usage --record, thread promote --to atlas/evidence and pulse-accept together create nothing under .cortex/atlas/ outside evidence/', async () => {
    const root = project('producers');
    const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-evidence-home-')));
    dirs.push(home);
    writeSessionTranscript(home, root, 's1', [toolTurn(bash('cortex insight file src/a.ts'), grep('hooks', '.cortex/compass/'))], new Date('2026-09-01T00:00:00Z'));

    const s1 = threadCitation('s1', 'fixture-user');
    seedThreads(root, [
      makeThread({ id: 'T-007', kind: 'finding', session: s1, sessions: [s1], bears_on: ['schema.validator'], body: '2 insight invocations over 55 sessions\n**Kind:** measurement\n**Source:** tag' }),
    ]);

    const { payload } = evidenceFilePayload(
      {
        slug: 'audit',
        title: 'Validator audit',
        kind: 'audit',
        instrument: 'cortex validate',
        window: { from: '2026-09-15', to: '2026-09-15' },
        findings: [{ metric: 'violations', value: 0 }],
        bearsOn: ['schema.validator'],
        body: 'Zero.',
      },
      NOW,
    );
    write(root, '.cortex/pulse/reports/x.md', REPORT_HEADER + candidate('.cortex/atlas/evidence/2026-09-15-audit.md', 'Proposed file', payload));

    const before = snapshotTree(root);

    expect(await runUsage(root, { home, now: NOW, record: true })).toBe(0);
    expect(await threadCli(['promote', 'T-007', '--to', 'atlas/evidence', '--finding', 'insight.invocations=2', '--finding', 'sessions=55'], root, { now: NOW, user: 'fixture-user' })).toBe(0);
    expect(await pulseCli('pulse-accept', ['S-031'], root)).toBe(0);

    const after = snapshotTree(root);
    const changed = [...after.entries()].filter(([rel, content]) => before.get(rel) !== content).map(([rel]) => rel.split(path.sep).join('/')).sort();
    const removed = [...before.keys()].filter((rel) => !after.has(rel));
    expect(removed).toEqual([]);

    const atlasWrites = changed.filter((rel) => rel.startsWith('.cortex/atlas/'));
    expect(atlasWrites.every((rel) => rel.startsWith('.cortex/atlas/evidence/'))).toBe(true);
    expect(atlasWrites).toEqual([
      '.cortex/atlas/evidence/2026-09-15-2-insight-invocations-over-55-sessions.md',
      '.cortex/atlas/evidence/2026-09-15-audit.md',
      '.cortex/atlas/evidence/2026-09-15-usage.md',
      '.cortex/atlas/evidence/_index.md',
    ]);
    const otherWrites = changed.filter((rel) => !rel.startsWith('.cortex/atlas/'));
    expect(otherWrites).toEqual(['.cortex/pulse/reports/usage.md', '.cortex/pulse/reports/x.md', '.cortex/pulse/threads/T-007-2-insight-invocations-over-55-sessions.md']);
    expect(changed.some((rel) => rel.startsWith('.cortex/compass/') || rel.startsWith('.cortex/insight/') || rel.startsWith('.specflow/'))).toBe(false);

    // The three files are all schema-valid together and the usage one supersedes nothing.
    const report = await validate(root);
    expect(errors(report)).toEqual([]);
    const usage = matter(fs.readFileSync(path.join(root, '.cortex/atlas/evidence/2026-09-15-usage.md'), 'utf-8')).data as Record<string, unknown>;
    expect('supersedes' in usage).toBe(false);
    expect(usage['bears_on']).toEqual(['schema:§5', 'pulse.usage']);
  });
});
