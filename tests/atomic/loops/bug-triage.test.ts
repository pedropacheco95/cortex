/**
 * Atomic tests — loops.bug-triage (spec Acceptance Criteria as labelled
 * describes, plus Rule 1 partition, Rule 2 validation, Rule 3 fill-only merge,
 * and the shipped SKILL.md pinning). Sandboxed tmp projects; stub claude
 * executables for the bare-CLI mode — never a real LLM.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { makeTmpDir, cleanTmp, snapshotTree, writeExecutable, authFailStub } from '../../fixtures/init-harness.js';
import {
  scanOpenBugs,
  partitionWorklist,
  collectTriageWorklist,
  validateTriageResult,
  fillFrontmatterFields,
  applyTriageResults,
  writeBugTriageReport,
  runBugTriage,
  TRIAGE_WORKLIST_FILE,
  BUG_TRIAGE_REPORT_FILE,
  BUG_AGED_DAYS,
} from '../../../src/loops/bug-triage.js';

const TEST_TIMEOUT = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`bug-triage-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function makeProject(label: string): string {
  const root = tmp(label);
  fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'compass', 'bugs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.cortex', 'cortex.config.json'),
    JSON.stringify({ schemaVersion: '1.0' }, null, 2),
    'utf-8',
  );
  return root;
}

interface BugOpts {
  status?: string;
  type?: string;
  severity?: string;
  proposedFix?: string;
  openedIso?: string;
}

function bugMd(id: string, opts: BugOpts = {}): string {
  return [
    '---',
    `id: ${id}`,
    `title: ${id} test bug`,
    ...(opts.type !== undefined ? [`type: ${opts.type}`] : []),
    ...(opts.severity !== undefined ? [`severity: ${opts.severity}`] : []),
    `status: ${opts.status ?? 'open'}`,
    'affects:',
    '  - src/app.ts',
    ...(opts.proposedFix !== undefined ? [`proposed_fix: ${opts.proposedFix}`] : []),
    ...(opts.openedIso !== undefined ? [`opened: ${opts.openedIso}`] : []),
    '---',
    '',
    `# ${id} — test bug`,
    '',
    'Evidence body.',
    '',
  ].join('\n');
}

function writeBug(root: string, id: string, opts: BugOpts = {}): string {
  const file = path.join(root, '.cortex', 'compass', 'bugs', `${id}-test-bug.md`);
  fs.writeFileSync(file, bugMd(id, opts), 'utf-8');
  return file;
}

function reportText(root: string): string {
  return fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', BUG_TRIAGE_REPORT_FILE), 'utf-8');
}

function result(bugId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    bugId,
    type: 'wrong-rule',
    severity: 'high',
    proposedFix: 'Tighten the rule.',
    reasoning: 'The rule fired on the wrong layer.',
    ...over,
  };
}

// ===========================================================================
// Rule 1 — worklist partition
// ===========================================================================
describe('Rule 1: --collect partitions open bugs into unclassified and classified', () => {
  it('any absent classification field puts a bug in unclassified; all present → classified', () => {
    const bugs = [
      { id: 'B-001', file: 'x', title: null, type: null, severity: 'high', proposedFix: 'f', openedIso: null },
      { id: 'B-002', file: 'y', title: null, type: 'wrong-rule', severity: 'high', proposedFix: 'f', openedIso: null },
      { id: 'B-003', file: 'z', title: null, type: 'wrong-rule', severity: 'high', proposedFix: null, openedIso: null },
    ];
    const worklist = partitionWorklist(bugs, '2026-07-02T00:00:00Z');
    expect(worklist.kind).toBe('triage-worklist');
    expect(worklist.unclassified.map((b) => b.id)).toEqual(['B-001', 'B-003']);
    expect(worklist.classified.map((b) => b.id)).toEqual(['B-002']);
  });

  it('collect writes the worklist JSON under pulse/', () => {
    const root = makeProject('collect');
    writeBug(root, 'B-001'); // no classification at all
    writeBug(root, 'B-002', { type: 'layer-drift', severity: 'low', proposedFix: 'Fix it.' });
    const res = collectTriageWorklist(root);
    expect(res.unclassified).toBe(1);
    expect(res.classified).toBe(1);
    const parsed = JSON.parse(fs.readFileSync(path.join(root, '.cortex', 'pulse', 'state', TRIAGE_WORKLIST_FILE), 'utf-8')) as {
      unclassified: { id: string }[];
      classified: { id: string }[];
    };
    expect(parsed.unclassified[0]!.id).toBe('B-001');
    expect(parsed.classified[0]!.id).toBe('B-002');
  });
});

// ===========================================================================
// AC — Resolved bugs never enter the worklist
// ===========================================================================
describe('Resolved bugs never enter the worklist', () => {
  it('a status: resolved bug is absent from the worklist (and triaged is not open either)', () => {
    const root = makeProject('resolved');
    writeBug(root, 'B-001', { status: 'resolved', type: 'wrong-rule' });
    writeBug(root, 'B-002', { status: 'triaged' });
    writeBug(root, 'B-003');
    const bugs = scanOpenBugs(root);
    expect(bugs.map((b) => b.id)).toEqual(['B-003']);
    const res = collectTriageWorklist(root);
    expect(res.unclassified + res.classified).toBe(1);
  });
});

// ===========================================================================
// Rule 2 — result validation / AC — Invalid taxonomy value skipped
// ===========================================================================
describe('Invalid taxonomy value skipped', () => {
  it('type "logic" is not one of the seven → skipped, counted, bug untouched', () => {
    const root = makeProject('invalid-type');
    const file = writeBug(root, 'B-001');
    const before = fs.readFileSync(file, 'utf-8');
    const app = applyTriageResults(root, [result('B-001', { type: 'logic' })]);
    expect(app.invalid).toBe(1);
    expect(app.filled).toHaveLength(0);
    expect(fs.readFileSync(file, 'utf-8')).toBe(before);
    writeBugTriageReport(root, app, new Date());
    expect(reportText(root)).toContain('1 skipped (invalid shape or taxonomy value)');
  });

  it('validateTriageResult: seven types accepted, anything else rejected', () => {
    for (const type of ['missing-criterion', 'incomplete-rule', 'wrong-rule', 'missing-dev-spec', 'missing-business-spec', 'layer-drift', 'test-defect']) {
      expect(validateTriageResult(result('B-001', { type }))).not.toBeNull();
    }
    expect(validateTriageResult(result('B-001', { type: 'logic' }))).toBeNull();
    expect(validateTriageResult(result('B-001', { type: 'LAYER-DRIFT' }))).toBeNull();
  });

  it('a severity outside the schema enum is invalid too (never written into the ledger)', () => {
    expect(validateTriageResult(result('B-001', { severity: 'catastrophic' }))).toBeNull();
  });

  it('malformed shapes are rejected: missing bugId, non-object, bad id shape', () => {
    expect(validateTriageResult(null)).toBeNull();
    expect(validateTriageResult('B-001')).toBeNull();
    expect(validateTriageResult(result('bug-1'))).toBeNull();
    expect(validateTriageResult({ type: 'wrong-rule' })).toBeNull();
  });
});

// ===========================================================================
// Rule 3 — fill-only merge (atomic)
// ===========================================================================
describe('Rule 3: fill-only frontmatter merge', () => {
  it('fillFrontmatterFields inserts only the given keys, touching no other byte', () => {
    const content = bugMd('B-009', { type: 'layer-drift' });
    const next = fillFrontmatterFields(content, { severity: 'high', proposed_fix: 'Do the thing.' });
    expect(next).not.toBeNull();
    const parsed = matter(next as string);
    expect(parsed.data['severity']).toBe('high');
    expect(parsed.data['proposed_fix']).toBe('Do the thing.');
    expect(parsed.data['type']).toBe('layer-drift');
    // The body and every pre-existing frontmatter line survive verbatim.
    for (const line of content.split('\n')) {
      expect((next as string).split('\n')).toContain(line);
    }
  });

  it('a value with YAML-hostile characters is quoted', () => {
    const next = fillFrontmatterFields(bugMd('B-009'), { proposed_fix: 'Fix: use `x` — really' }) as string;
    expect(matter(next).data['proposed_fix']).toBe('Fix: use `x` — really');
  });

  it('content without frontmatter returns null (no write)', () => {
    expect(fillFrontmatterFields('# no frontmatter\n', { type: 'wrong-rule' })).toBeNull();
  });
});

// ===========================================================================
// AC — Unclassified bug gets filled, fill-only
// ===========================================================================
describe('Unclassified bug gets filled, fill-only', () => {
  it('absent severity+proposed_fix are filled; human-set type is kept and the type divergence reported', () => {
    const root = makeProject('fill-only');
    const file = writeBug(root, 'B-001', { type: 'layer-drift' }); // severity + proposed_fix absent
    const app = applyTriageResults(root, [
      result('B-001', { type: 'wrong-rule', severity: 'medium', proposedFix: 'Split the rule.' }),
    ]);

    const data = matter(fs.readFileSync(file, 'utf-8')).data as Record<string, unknown>;
    expect(data['severity']).toBe('medium');
    expect(data['proposed_fix']).toBe('Split the rule.');
    expect(data['type']).toBe('layer-drift'); // NEVER overwritten

    expect(app.filled).toEqual([
      { bugId: 'B-001', fields: [{ field: 'severity', value: 'medium' }, { field: 'proposed_fix', value: 'Split the rule.' }] },
    ]);
    expect(app.divergences).toEqual([
      { bugId: 'B-001', field: 'type', ledger: 'layer-drift', loop: 'wrong-rule', reasoning: 'The rule fired on the wrong layer.' },
    ]);

    writeBugTriageReport(root, app, new Date());
    const report = reportText(root);
    expect(report).toContain('B-001: filled `severity: medium`, `proposed_fix: Split the rule.`');
    expect(report).toContain('ledger: `layer-drift` / loop: `wrong-rule`');
  });

  it('repeated runs converge (Rule 4): a filled bug is compare-only on the second run', () => {
    const root = makeProject('converge');
    const file = writeBug(root, 'B-001');
    applyTriageResults(root, [result('B-001')]);
    const afterFirst = fs.readFileSync(file, 'utf-8');
    const app2 = applyTriageResults(root, [result('B-001')]);
    expect(fs.readFileSync(file, 'utf-8')).toBe(afterFirst); // byte-identical
    expect(app2.filled).toHaveLength(0);
    expect(app2.agreements).toEqual([{ bugId: 'B-001', fields: ['type', 'severity', 'proposed_fix'] }]);
  });
});

// ===========================================================================
// AC — Classified bug is compare-only
// ===========================================================================
describe('Classified bug is compare-only', () => {
  it('a diverging result leaves the bug file byte-identical and reports both readings with reasoning', () => {
    const root = makeProject('compare-only');
    const file = writeBug(root, 'B-001', { type: 'layer-drift', severity: 'high', proposedFix: 'Original fix.' });
    const before = fs.readFileSync(file, 'utf-8');
    const app = applyTriageResults(root, [
      result('B-001', { type: 'wrong-rule', severity: 'high', proposedFix: 'Original fix.', reasoning: 'Rule is wrong as written.' }),
    ]);
    expect(fs.readFileSync(file, 'utf-8')).toBe(before);
    expect(app.filled).toHaveLength(0);
    expect(app.divergences).toHaveLength(1);

    writeBugTriageReport(root, app, new Date());
    const report = reportText(root);
    expect(report).toContain('ledger: `layer-drift`');
    expect(report).toContain('loop: `wrong-rule`');
    expect(report).toContain('reasoning: Rule is wrong as written.');
  });
});

// ===========================================================================
// AC — Agreement is reported as agreement
// ===========================================================================
describe('Agreement is reported as agreement', () => {
  it('a classified bug with a matching result lands under Agreements', () => {
    const root = makeProject('agree');
    writeBug(root, 'B-001', { type: 'wrong-rule', severity: 'high', proposedFix: 'Tighten the rule.' });
    const app = applyTriageResults(root, [result('B-001')]);
    expect(app.agreements).toEqual([{ bugId: 'B-001', fields: ['type', 'severity', 'proposed_fix'] }]);
    expect(app.divergences).toHaveLength(0);

    writeBugTriageReport(root, app, new Date());
    const report = reportText(root);
    expect(report).toContain('## Agreements');
    expect(report).toContain('B-001: independent re-derivation agrees on `type`, `severity`, `proposed_fix`');
  });
});

// ===========================================================================
// AC — Empty ledger is a stated clean run
// ===========================================================================
describe('Empty ledger is a stated clean run', () => {
  it('no open bugs → the report says so with explicit empty-state sections, exit 0', async () => {
    const root = makeProject('empty');
    const code = await runBugTriage(root, { noLlm: true });
    expect(code).toBe(0);
    const report = reportText(root);
    expect(report).toContain('kind: pulse-bug-triage');
    expect(report).toContain('No open bugs — the ledger is clean this run.');
    expect(report).toContain('No classification fields filled this run.');
    expect(report).toContain('No agreements to report this run.');
    expect(report).toContain('No divergences this run.');
    expect(report).toContain(`No open bugs older than ${BUG_AGED_DAYS} days.`);
  }, TEST_TIMEOUT);
});

// ===========================================================================
// Rule 5 — aged section
// ===========================================================================
describe('Aged open bugs are reported (open > 30 days)', () => {
  it('a 45-day-old open bug is listed with its age; a fresh one is not', () => {
    const root = makeProject('aged');
    writeBug(root, 'B-001', { openedIso: new Date(Date.now() - 45 * DAY_MS).toISOString() });
    writeBug(root, 'B-002', { openedIso: new Date(Date.now() - 2 * DAY_MS).toISOString() });
    writeBugTriageReport(root, null, new Date());
    const report = reportText(root);
    expect(report).toMatch(/- B-001 — open 4[45] days/);
    expect(report).not.toMatch(/- B-002 — open/);
  });
});

// ===========================================================================
// AC — Blast radius
// ===========================================================================
describe('Blast radius', () => {
  it('a full bare run touches only the report, the worklist, and (fill-only) open bug files', async () => {
    const root = makeProject('blast');
    writeBug(root, 'B-001'); // will be filled
    fs.writeFileSync(path.join(root, '.cortex', 'compass', 'environment.md'), '# Environment\n', 'utf-8');
    fs.writeFileSync(path.join(root, 'app.ts'), 'export const a = 1;\n', 'utf-8');

    const bin = tmp('blast-bin');
    const stub = writeExecutable(
      path.join(bin, 'claude'),
      `#!/bin/sh
cat <<'JSON'
[{"bugId":"B-001","type":"wrong-rule","severity":"low","proposedFix":"Fix it.","reasoning":"Because."}]
JSON
`,
    );

    const before = snapshotTree(root);
    const code = await runBugTriage(root, { claudeBin: stub });
    expect(code).toBe(0);
    const after = snapshotTree(root);

    const allowed = new Set([
      path.join('.cortex', 'pulse', 'reports', BUG_TRIAGE_REPORT_FILE),
      path.join('.cortex', 'pulse', 'state', TRIAGE_WORKLIST_FILE),
      path.join('.cortex', 'compass', 'bugs', 'B-001-test-bug.md'),
    ]);
    const keys = new Set([...before.keys(), ...after.keys()]);
    for (const key of keys) {
      if (allowed.has(key)) continue;
      expect(after.get(key), `unexpected change to ${key}`).toBe(before.get(key));
    }
    // And the run actually filled the bug.
    expect(after.get(path.join('.cortex', 'compass', 'bugs', 'B-001-test-bug.md'))).toContain('type: wrong-rule');
  }, TEST_TIMEOUT);
});

// ===========================================================================
// Bare-mode degradation (init Rule 6 subprocess semantics)
// ===========================================================================
describe('Bare-mode subprocess degradation', () => {
  it('--no-llm with open bugs: report written with the skip notice, worklist retained, exit 0', async () => {
    const root = makeProject('nollm');
    writeBug(root, 'B-001');
    const code = await runBugTriage(root, { noLlm: true });
    expect(code).toBe(0);
    expect(reportText(root)).toMatch(/judgment pass skipped \(--no-llm\)/);
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', 'state', TRIAGE_WORKLIST_FILE))).toBe(true);
  }, TEST_TIMEOUT);

  it('missing claude binary degrades politely (exit 0, notice in the report)', async () => {
    const root = makeProject('nobin');
    writeBug(root, 'B-001');
    const code = await runBugTriage(root, { claudeBin: path.join(tmp('nobin-bin'), 'claude') });
    expect(code).toBe(0);
    expect(reportText(root)).toMatch(/judgment pass skipped/);
  }, TEST_TIMEOUT);

  it('auth failure is NAMED: exit 3, the report says authenticate', async () => {
    const root = makeProject('auth');
    writeBug(root, 'B-001');
    const bin = tmp('auth-bin');
    authFailStub(bin);
    const code = await runBugTriage(root, { claudeBin: path.join(bin, 'claude') });
    expect(code).toBe(3);
    expect(reportText(root)).toMatch(/not authenticated/i);
  }, TEST_TIMEOUT);
});

// ===========================================================================
// The shipped SKILL.md bundle — prompt content pinned by string assertions.
// ===========================================================================
describe('Shipped skills/cortex-loop-bug-triage/SKILL.md is pinned', () => {
  const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const SKILL_PATH = path.join(PKG_ROOT, 'skills', 'cortex-loop-bug-triage', 'SKILL.md');
  const raw = fs.readFileSync(SKILL_PATH, 'utf-8');
  const parsed = matter(raw);
  const body = parsed.content;

  it('ships at the package root with name: cortex-loop-bug-triage', () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
    expect(parsed.data['name']).toBe('cortex-loop-bug-triage');
    expect(String(parsed.data['description'] ?? '')).toMatch(/bug/i);
  });

  it('instructs: run --collect, classify in-session with the specflow-bugs discipline against the seven types, write results JSON, run --report', () => {
    expect(body).toContain('cortex loop-bug-triage --collect');
    expect(body).toContain('.cortex/pulse/state/triage-worklist.json');
    expect(body).toMatch(/in this session/i);
    expect(body).toContain('`specflow-bugs`');
    expect(body).toContain('missing-criterion, incomplete-rule, wrong-rule, missing-dev-spec');
    expect(body).toContain('missing-business-spec, layer-drift, test-defect');
    expect(body).toContain('scratchpad');
    expect(body).toContain('cortex loop-bug-triage --report');
    expect(body).toMatch(/never spawn a\s+nested `claude` subprocess/i);
    expect(body).toMatch(/never run bare `cortex loop-bug-triage`/i);
  });

  it('pins the results JSON contract and the fill-only boundary', () => {
    for (const field of ['"bugId"', '"type"', '"severity"', '"proposedFix"', '"reasoning"']) {
      expect(body).toContain(field);
    }
    expect(body).toMatch(/fill-only/i);
    expect(body).toMatch(/present fields are NEVER overwritten/i);
    expect(body).toMatch(/never overwrite an existing classification/i);
    expect(body).toContain('.cortex/pulse/reports/bug-triage.md');
  });
});
