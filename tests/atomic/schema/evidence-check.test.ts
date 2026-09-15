/**
 * Atomic tests — check.evidence (schema §4.3, Appendix A; spec `atlas.evidence`
 * Rule 2), the `atlas/evidence` layout tolerance (`check.layout`), and the
 * `evidence-candidate` gate in `check.pulse` (Rule 7). Every check is called
 * directly over a tmp root; the AC fixtures yield exactly the named errors.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { checkEvidence } from '../../../src/schema/checks/evidence.js';
import { checkLayout } from '../../../src/schema/checks/layout.js';
import { checkPulse } from '../../../src/schema/checks/pulse.js';
import type { Violation } from '../../../src/schema/types.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/hooks-harness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`evidence-check-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function write(root: string, rel: string, body: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf-8');
  return abs;
}

const VALID_FM = [
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
];

/** An evidence file at `<stem>.md` whose frontmatter lines are given verbatim. */
function evidence(root: string, stem: string, fm: string[]): string {
  return write(root, `.cortex/atlas/evidence/${stem}.md`, `---\n${fm.join('\n')}\n---\n\n# ${stem}\n`);
}

function mine(violations: Violation[]): Violation[] {
  return violations.filter((v) => v.check === 'check.evidence');
}

function keysOf(violations: Violation[]): string[] {
  return mine(violations).map((v) => v.location.key ?? '?').sort();
}

describe('An evidence file has the contract frontmatter (the validate half)', () => {
  it('the AC fixture yields no check.evidence violation', async () => {
    const root = tmp('valid');
    evidence(root, '2026-09-15-usage', VALID_FM);
    expect(mine(await checkEvidence(root))).toEqual([]);
  });

  it('_index.md is skipped; window datetimes and every kind in the enum are accepted', async () => {
    const root = tmp('valid-variants');
    write(root, '.cortex/atlas/evidence/_index.md', '# Evidence — index\n');
    evidence(root, '2026-09-15-audit', [
      'id: evidence.2026-09-15-audit',
      'title: x',
      'date: 2026-09-15T15:58:00Z',
      'kind: audit',
      'instrument: cortex validate',
      'window:',
      '  from: 2026-09-15T10:00:00Z',
      '  to: 2026-09-15T15:58:00Z',
      'findings:',
      '  - metric: violations',
      '    value: "none"',
      '    unit: count',
      'bears_on: [R-001]',
    ]);
    evidence(root, '2026-09-15-experiment', [
      'id: evidence.2026-09-15-experiment',
      'title: x',
      'date: 2026-09-15T15:58:00Z',
      'kind: experiment',
      'instrument: session',
      'window: { from: 2026-09-14, to: 2026-09-15, sessions: 0 }',
      'findings: [{ metric: a, value: 1 }]',
      'bears_on: [R-001]',
    ]);
    expect(mine(await checkEvidence(root))).toEqual([]);
  });
});

describe('Every required field is enforced, at error severity', () => {
  it('missing instrument, kind: guess, findings: [], window: { from: yesterday }, bears_on: [] → five errors at those keys', async () => {
    const root = tmp('five');
    const file = evidence(root, '2026-09-15-usage', [
      'id: evidence.2026-09-15-usage',
      'title: x',
      'date: 2026-09-15T15:58:00Z',
      'kind: guess',
      'window:',
      '  from: yesterday',
      'findings: []',
      'bears_on: []',
    ]);

    const violations = mine(await checkEvidence(root));
    expect(keysOf(violations)).toEqual(['bears_on', 'findings', 'instrument', 'kind', 'window']);
    for (const v of violations) {
      expect(v.severity).toBe('error');
      expect(v.clause).toBe('§4.3');
      expect(v.location.path).toBe(file);
    }
  });

  it('a missing date, an unparseable date, and a missing title are each one error at their key', async () => {
    const root = tmp('date-title');
    evidence(root, '2026-09-15-a', VALID_FM.filter((l) => !l.startsWith('date:') && !l.startsWith('title:')).map((l) => l.replace('2026-09-15-usage', '2026-09-15-a')));
    evidence(root, '2026-09-15-b', VALID_FM.map((l) => l.replace('2026-09-15-usage', '2026-09-15-b').replace(/^date:.*/, 'date: not-a-date')));
    const violations = mine(await checkEvidence(root));
    expect(keysOf(violations)).toEqual(['date', 'date', 'title']);
  });

  it('window.sessions must be a non-negative integer when present; window.to is required', async () => {
    const root = tmp('window');
    evidence(root, '2026-09-15-a', VALID_FM.map((l) => l.replace('2026-09-15-usage', '2026-09-15-a').replace('  sessions: 41', '  sessions: -1')));
    evidence(root, '2026-09-15-b', VALID_FM.map((l) => l.replace('2026-09-15-usage', '2026-09-15-b').replace('  sessions: 41', '  sessions: 1.5')));
    evidence(root, '2026-09-15-c', VALID_FM.filter((l) => l !== '  to: 2026-09-15').map((l) => l.replace('2026-09-15-usage', '2026-09-15-c')));
    evidence(root, '2026-09-15-d', VALID_FM.map((l) => l.replace('2026-09-15-usage', '2026-09-15-d').replace('  sessions: 41', '  sessions: 0')));
    const violations = mine(await checkEvidence(root));
    expect(keysOf(violations)).toEqual(['window', 'window', 'window']);
    expect(violations.map((v) => path.basename(v.location.path)).sort()).toEqual(['2026-09-15-a.md', '2026-09-15-b.md', '2026-09-15-c.md']);
  });

  it('findings entries need a string metric, a number-or-string value, and a string unit when present', async () => {
    const root = tmp('findings');
    evidence(root, '2026-09-15-a', VALID_FM.map((l) => l.replace('2026-09-15-usage', '2026-09-15-a').replace('  - metric: searches.knowledge', '  - name: searches.knowledge')));
    evidence(root, '2026-09-15-b', VALID_FM.map((l) => l.replace('2026-09-15-usage', '2026-09-15-b').replace('    value: 54', '    value: [54]')));
    evidence(root, '2026-09-15-c', [...VALID_FM.map((l) => l.replace('2026-09-15-usage', '2026-09-15-c').replace('    value: 54', '    value: 54\n    unit: 7'))]);
    evidence(root, '2026-09-15-d', VALID_FM.map((l) => l.replace('2026-09-15-usage', '2026-09-15-d').replace('findings:', 'findings: "54 searches"').replace(/^  - metric.*|^    value.*/, '')));
    const violations = mine(await checkEvidence(root));
    expect(keysOf(violations)).toEqual(['findings', 'findings', 'findings', 'findings']);
    expect(violations.map((v) => path.basename(v.location.path)).sort()).toEqual(['2026-09-15-a.md', '2026-09-15-b.md', '2026-09-15-c.md', '2026-09-15-d.md']);
  });

  it('bears_on must be a non-empty list of non-empty strings — resolution is check.bears-on\'s, not this check\'s', async () => {
    const root = tmp('bears-on');
    evidence(root, '2026-09-15-a', VALID_FM.map((l) => l.replace('2026-09-15-usage', '2026-09-15-a').replace('  - pulse.usage', '  - ""')));
    evidence(root, '2026-09-15-b', VALID_FM.map((l) => l.replace('2026-09-15-usage', '2026-09-15-b').replace('bears_on:', 'bears_on: pulse.usage').replace(/^  - "schema.*|^  - pulse.*/, '')));
    evidence(root, '2026-09-15-c', VALID_FM.map((l) => l.replace('2026-09-15-usage', '2026-09-15-c').replace('  - pulse.usage', '  - R-999')));
    const violations = mine(await checkEvidence(root));
    expect(keysOf(violations)).toEqual(['bears_on', 'bears_on']);
    expect(violations.map((v) => path.basename(v.location.path)).sort()).toEqual(['2026-09-15-a.md', '2026-09-15-b.md']);
  });
});

describe('Id and filename must agree; supersedes must point at evidence', () => {
  it('2026-09-15-usage.md with id evidence.2026-09-14-usage and a decision in supersedes → errors at id (naming the filename) and supersedes (naming the target)', async () => {
    const root = tmp('id-supersedes');
    write(root, '.cortex/atlas/decisions/2026-07-07-scoped-extraction.md', '---\nid: decision.2026-07-07-scoped-extraction\ntitle: x\ndate: 2026-07-07T00:00:00Z\n---\n');
    evidence(root, '2026-09-15-usage', [
      ...VALID_FM.map((l) => l.replace('id: evidence.2026-09-15-usage', 'id: evidence.2026-09-14-usage')),
      'supersedes:',
      '  - ../decisions/2026-07-07-scoped-extraction.md',
    ]);

    const violations = mine(await checkEvidence(root));
    expect(keysOf(violations)).toEqual(['id', 'supersedes']);
    const idV = violations.find((v) => v.location.key === 'id') as Violation;
    expect(idV.message).toContain('2026-09-15-usage.md');
    expect(idV.message).toContain('evidence.2026-09-14-usage');
    const supV = violations.find((v) => v.location.key === 'supersedes') as Violation;
    expect(supV.message).toContain('../decisions/2026-07-07-scoped-extraction.md');
    expect(supV.message).toMatch(/atlas\/evidence/);
  });

  it('an id of the wrong shape is an error; a supersedes entry that is an evidence sibling is not', async () => {
    const root = tmp('id-shape');
    evidence(root, '2026-09-01-usage', VALID_FM.map((l) => l.replace('2026-09-15-usage', '2026-09-01-usage')));
    evidence(root, '2026-09-15-usage', [...VALID_FM.map((l) => l.replace('id: evidence.2026-09-15-usage', 'id: decision.2026-09-15-usage')), 'supersedes: [2026-09-01-usage.md]']);
    const violations = mine(await checkEvidence(root));
    expect(keysOf(violations)).toEqual(['id']);
  });

  it('a supersedes entry escaping the evidence directory with `..` is an error even when it points back inside atlas', async () => {
    const root = tmp('supersedes-escape');
    evidence(root, '2026-09-15-usage', [...VALID_FM, 'supersedes: [../evidence/../../atlas/_index.md]']);
    write(root, '.cortex/atlas/_index.md', '# Atlas — index\n');
    expect(keysOf(await checkEvidence(root))).toEqual(['supersedes']);
  });

  it('a missing id is left to check.atlas — check.evidence reports nothing for that key', async () => {
    const root = tmp('id-missing');
    evidence(root, '2026-09-15-usage', VALID_FM.filter((l) => !l.startsWith('id:')));
    expect(keysOf(await checkEvidence(root))).toEqual([]);
  });
});

describe('An absent directory is not a finding', () => {
  it('no .cortex/atlas/evidence/ → no check.evidence and no check.layout violation mentioning evidence', async () => {
    const root = tmp('absent');
    write(root, '.cortex/atlas/_index.md', '# Atlas — index\n');
    write(root, '.cortex/atlas/decisions/_index.md', '# Decisions — index\n');
    expect(await checkEvidence(root)).toEqual([]);
    expect(checkLayout(root).filter((v) => /evidence/.test(v.message) || /evidence/.test(path.relative(root, v.location.path)))).toEqual([]);
  });

  it('check.layout: atlas/evidence/ without _index.md is one error; with one, none', () => {
    const root = tmp('layout');
    write(root, '.cortex/atlas/_index.md', '# Atlas — index\n');
    fs.mkdirSync(path.join(root, '.cortex', 'atlas', 'evidence'), { recursive: true });

    const without = checkLayout(root).filter((v) => v.check === 'check.layout' && v.location.path.endsWith(path.join('atlas', 'evidence')));
    expect(without).toHaveLength(1);
    expect(without[0]?.severity).toBe('error');
    expect(without[0]?.message).toContain('.cortex/atlas/evidence/');

    write(root, '.cortex/atlas/evidence/_index.md', '# Evidence — index\n');
    expect(checkLayout(root).filter((v) => v.location.path.endsWith(path.join('atlas', 'evidence')))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 7 — the evidence-candidate gate in check.pulse
// ---------------------------------------------------------------------------

const REPORT_HEADER = '---\nkind: pulse-audit\ngenerated: 2026-09-15T00:00:00Z\nloop: cortex-loop-audit\n---\n\n# Audit\n\n';

function section(target: string, payloadLabel: string): string {
  return `## S-031: Validator audit count\n\n**Type:** evidence-candidate\n**Target:** ${target}\n\n**${payloadLabel}:**\n\n\`\`\`\n---\nid: evidence.2026-09-15-audit\n---\n\`\`\`\n`;
}

function pulseErrors(violations: Violation[]): Violation[] {
  return violations.filter((v) => v.check === 'check.pulse' && v.severity === 'error');
}

describe('An evidence-candidate is gated like a decision-candidate (check.pulse)', () => {
  it('type in enum, target under .cortex/atlas/evidence/, Proposed file payload → no check.pulse violation', async () => {
    const root = tmp('gate-ok');
    write(root, '.cortex/pulse/reports/x.md', REPORT_HEADER + section('.cortex/atlas/evidence/2026-09-15-audit.md', 'Proposed file'));
    expect((await checkPulse(root)).filter((v) => v.check === 'check.pulse')).toEqual([]);
  });

  it('a target under atlas/decisions/ is an error for the section', async () => {
    const root = tmp('gate-root');
    write(root, '.cortex/pulse/reports/x.md', REPORT_HEADER + section('.cortex/atlas/decisions/y.md', 'Proposed file'));
    const errors = pulseErrors(await checkPulse(root));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.location.key).toBe('S-031');
    expect(errors[0]?.message).toContain('.cortex/atlas/evidence/');
  });

  it('a Proposed addition payload is an error for the section — evidence is create-only', async () => {
    const root = tmp('gate-payload');
    write(root, '.cortex/pulse/reports/x.md', REPORT_HEADER + section('.cortex/atlas/evidence/2026-09-15-audit.md', 'Proposed addition'));
    const errors = pulseErrors(await checkPulse(root));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.location.key).toBe('S-031');
    expect(errors[0]?.message).toMatch(/create|Proposed file/);
  });
});
