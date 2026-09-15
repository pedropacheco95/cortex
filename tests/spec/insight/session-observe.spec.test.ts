/**
 * Spec-level tests — insight.session-observe (.specflow/specs/insight/
 * session-observe.spec.md; design §9, §8.2). Each AC is a
 * labelled describe over a real git fixture: route-by-type (ungated → entry
 * enrichment with claude-sessions provenance; convention → rule-candidate
 * compass proposal; decision → decision-candidate atlas proposal),
 * extraction-owned sections untouched, dismissal suppression, the
 * distil/session-observe no-double-propose boundary, and the loop-write
 * invariant (never a direct gated write under any classification).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { makeTmpDir, cleanTmp, gitInit, gitCommitAll } from '../../fixtures/insight-refresh-harness.js';
import { run } from '../../../src/cli/cli.js';
import {
  applyObserve,
  collectObserve,
  SESSION_OBSERVE_REPORT_FILE,
  SESSION_OBSERVE_WORKLIST_FILE,
} from '../../../src/insight/session-observe.js';
import { CORPUS_FILE, DISTIL_LAST_RUN_FILE, proposeFromCandidates, SUGGESTIONS_FILE } from '../../../src/pulse/distil.js';
import { readObserveState, readObserveWorklist } from '../../../src/insight/session-observe.js';
import { writeSessionTranscript, textTurn, scheduledTaskUserTurn, skillBaseDirUserTurn } from '../../fixtures/sessions.js';
import { pulseCli } from '../../../src/pulse/review.js';
import { checkPulse } from '../../../src/schema/checks/pulse.js';
import { checkRules } from '../../../src/schema/checks/compass.js';
import { checkProvenance } from '../../../src/schema/checks/provenance.js';
import { buildIndex } from '../../../src/schema/index-build.js';

const NOW = new Date('2026-07-08T12:00:00Z');

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`session-observe-spec-${label}`);
  dirs.push(d);
  return d;
}

let out: string[] = [];
let err: string[] = [];
let originalCwd: string;
beforeEach(() => {
  originalCwd = process.cwd();
  out = [];
  err = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void err.push(a.join(' ')));
});
afterEach(() => {
  process.chdir(originalCwd);
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

const RETRY_ENTRY_REL = '.cortex/insight/anatomy/src/billing/retry.ts.md';
const RETRY_ENTRY = `---
path: src/billing/retry.ts
extracted_at: 2026-07-01T00:00:00Z
extraction_level: 3
size_lines: 40
size_tokens: 300
centrality: high
built_at_commit: "abc1234"
source_sha256: "${'b'.repeat(64)}"
---

## Purpose

Retries billing calls with exponential backoff.

## Main players

- \`retryWithBackoff\` (lines 3-30) — the wrapper.

## Insights

- Callers assume idempotency.

## Connections

Uses: src/billing/backoff.ts

## Query pointers

- For the schedule maths, read src/billing/backoff.ts.
`;

/** The spec fixture: a git project with a committed L3 entry and gated dirs. */
function makeProject(label: string): string {
  const root = tmp(label);
  gitInit(root);
  fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'compass'), { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'atlas', 'decisions'), { recursive: true });
  fs.writeFileSync(path.join(root, '.cortex', 'compass', 'preferences.md'), '# Preferences\n', 'utf-8');
  fs.writeFileSync(
    path.join(root, '.cortex', 'cortex.config.json'),
    JSON.stringify({ schemaVersion: '3.0' }, null, 2) + '\n',
    'utf-8',
  );
  fs.mkdirSync(path.dirname(path.join(root, RETRY_ENTRY_REL)), { recursive: true });
  fs.writeFileSync(path.join(root, RETRY_ENTRY_REL), RETRY_ENTRY, 'utf-8');
  gitCommitAll(root, 'baseline');
  return root;
}

function writeCorpus(root: string, sessionIds: string[]): void {
  fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'state'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.cortex', 'pulse', 'state', CORPUS_FILE),
    JSON.stringify({
      kind: 'session-corpus',
      generated: NOW.toISOString(),
      since: '2026-07-01T00:00:00Z',
      sessions: sessionIds.map((id) => ({ id, mtime: NOW.toISOString(), messages: [{ role: 'user', text: `msg ${id}` }] })),
    }),
    'utf-8',
  );
}

function collected(label: string, sessions: string[] = ['sess-1']): string {
  const root = makeProject(label);
  writeCorpus(root, sessions);
  collectObserve(root, { now: NOW, home: tmp(`${label}-home`) });
  return root;
}

function report(root: string): string {
  return fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', SESSION_OBSERVE_REPORT_FILE), 'utf-8');
}

function gatedClean(root: string): boolean {
  const status = execFileSync('git', ['status', '--porcelain', '--', '.cortex/compass', '.cortex/atlas', 'RULES.md'], {
    cwd: root,
    encoding: 'utf-8',
  });
  return status.trim() === '';
}

// ---------------------------------------------------------------------------
describe('AC: an ungated codebase observation enriches the right file with provenance', () => {
  it('lands in ## Insights with a claude-sessions trailer; no pulse proposal; compass/atlas untouched', () => {
    const root = collected('ungated');
    const abs = path.join(root, RETRY_ENTRY_REL);
    fs.writeFileSync(
      abs,
      fs.readFileSync(abs, 'utf-8').replace(
        '- Callers assume idempotency.',
        '- Callers assume idempotency.\n- Silently swallows ECONNRESET — retries mask that error class (claude-sessions/pedro/sess-1)',
      ),
      'utf-8',
    );
    const result = applyObserve(root, { now: NOW });
    expect(result.violations).toBe(0);
    expect(result.entriesValidated).toBe(1);
    expect(result.counts.proposed).toBe(0);
    expect(report(root)).toContain('No gated proposals this cycle.');
    expect(gatedClean(root)).toBe(true);
    expect(fs.readFileSync(abs, 'utf-8')).toContain('(claude-sessions/pedro/sess-1)');
  });
});

describe('AC: an ungated observation lands in Query pointers when it is navigation guidance', () => {
  it('a ## Query pointers append with the same session provenance passes the audit', () => {
    const root = collected('query-pointers');
    const abs = path.join(root, RETRY_ENTRY_REL);
    fs.appendFileSync(
      abs,
      '- When touching retry logic, also check src/billing/backoff.ts first (claude-sessions/pedro/sess-1)\n',
      'utf-8',
    );
    const result = applyObserve(root, { now: NOW });
    expect(result.violations).toBe(0);
    const written = fs.readFileSync(abs, 'utf-8');
    const queryPointers = written.slice(written.indexOf('## Query pointers'));
    expect(queryPointers).toContain('also check src/billing/backoff.ts first (claude-sessions/pedro/sess-1)');
  });
});

describe('AC: extraction-owned sections are never touched by this loop', () => {
  it.each(['Purpose', 'Main players', 'Connections'] as const)(
    'a changed ## %s fails the apply audit',
    (section) => {
      const root = collected(`owned-${section.toLowerCase().replace(/\s+/g, '-')}`);
      const abs = path.join(root, RETRY_ENTRY_REL);
      const replacements: Record<string, [string, string]> = {
        'Purpose': ['Retries billing calls with exponential backoff.', 'Changed purpose.'],
        'Main players': ['the wrapper.', 'the changed wrapper.'],
        'Connections': ['Uses: src/billing/backoff.ts', 'Uses: src/billing/other.ts'],
      };
      const [from, to] = replacements[section] as [string, string];
      fs.writeFileSync(abs, fs.readFileSync(abs, 'utf-8').replace(from, to), 'utf-8');
      const result = applyObserve(root, { now: NOW });
      expect(result.violations).toBeGreaterThan(0);
      expect(report(root)).toContain(`## ${section}`);
    },
  );

  it('a clean Insights/Query-pointers-only write leaves the other sections byte-identical', () => {
    const root = collected('owned-clean');
    const abs = path.join(root, RETRY_ENTRY_REL);
    const before = fs.readFileSync(abs, 'utf-8');
    fs.writeFileSync(
      abs,
      before.replace('- Callers assume idempotency.', '- Callers assume idempotency.\n- New quirk (claude-sessions/pedro/sess-1)'),
      'utf-8',
    );
    expect(applyObserve(root, { now: NOW }).violations).toBe(0);
    const after = fs.readFileSync(abs, 'utf-8');
    for (const section of ['## Purpose', '## Main players', '## Connections']) {
      const sliceOf = (s: string): string => {
        const start = s.indexOf(section);
        const next = s.indexOf('\n## ', start + 1);
        return s.slice(start, next < 0 ? undefined : next);
      };
      expect(sliceOf(after)).toBe(sliceOf(before));
    }
  });
});

describe('AC: a gated convention becomes a compass-targeted proposal, never a direct write', () => {
  it('emits an S-NNN rule-candidate section targeting a Core-computed .cortex/compass/rules/R-NNN file; compass itself is unchanged', async () => {
    const root = collected('rule');
    const proposals = path.join(root, 'proposals.json');
    fs.writeFileSync(
      proposals,
      JSON.stringify([
        {
          type: 'rule-candidate',
          pattern: 'all new API routes must validate input with the shared schema validator',
          title: 'API routes must validate input with the shared schema validator',
          governedGlobs: ['src/api/**/*.ts'],
          proposedText: 'All new API routes must validate input with the shared schema validator.',
          sessionIds: ['sess-1'],
        },
      ]),
      'utf-8',
    );
    const result = applyObserve(root, { now: NOW, proposalsFile: proposals, user: 'pedro' });
    expect(result.counts.proposed).toBe(1);
    const rep = report(root);
    expect(rep).toMatch(/## S-\d{3}:/);
    expect(rep).toContain('**Type:** rule-candidate');
    expect(rep).toMatch(/\*\*Target:\*\* \.cortex\/compass\/rules\/R-001-/);
    expect(rep).toContain('**Proposed file:**');
    expect(rep).not.toContain('**Proposed addition:**');
    expect(rep).toContain('id: R-001');
    expect(rep).toContain('governs:');
    expect(rep).toContain('src/api/**/*.ts');
    expect(rep).toContain('derives_from: claude-sessions/pedro/sess-1');
    expect(gatedClean(root)).toBe(true); // the gate applies it, not this loop
    expect(fs.readFileSync(path.join(root, '.cortex', 'compass', 'preferences.md'), 'utf-8')).toBe('# Preferences\n');
    // the section is schema-clean under check.pulse
    const violations = await checkPulse(root);
    expect(violations.filter((v) => v.severity === 'error')).toEqual([]);
  });

  it('round-trips through pulse-accept: creates a schema-valid R-NNN rule file against an empty rules/ dir', async () => {
    const root = collected('rule-accept');
    const proposals = path.join(root, 'proposals.json');
    fs.writeFileSync(
      proposals,
      JSON.stringify([
        {
          type: 'rule-candidate',
          pattern: 'all new API routes must validate input with the shared schema validator',
          proposedText: 'All new API routes must validate input with the shared schema validator.',
          sessionIds: ['sess-1'],
        },
      ]),
      'utf-8',
    );
    expect(fs.existsSync(path.join(root, '.cortex', 'compass', 'rules'))).toBe(false);
    applyObserve(root, { now: NOW, proposalsFile: proposals, user: 'pedro' });
    expect(await pulseCli('pulse-accept', ['S-001'], root)).toBe(0);
    const ruleFiles = fs.readdirSync(path.join(root, '.cortex', 'compass', 'rules'));
    expect(ruleFiles).toHaveLength(1);
    expect(ruleFiles[0]).toMatch(/^R-001-/);
    const written = fs.readFileSync(path.join(root, '.cortex', 'compass', 'rules', ruleFiles[0] as string), 'utf-8');
    expect(written).toContain('id: R-001');
    expect(written).toContain('governs:');
    expect(written).toContain('derives_from: claude-sessions/pedro/sess-1');
    const index = await buildIndex(root);
    const violations = [...(await checkRules(root, index)), ...(await checkProvenance(root))];
    expect(violations.filter((v) => v.severity === 'error')).toEqual([]);
  });

  it('two rule-candidates in one apply batch get distinct, non-colliding R-NNN ids', async () => {
    const root = collected('rule-two');
    const proposals = path.join(root, 'proposals.json');
    fs.writeFileSync(
      proposals,
      JSON.stringify([
        {
          type: 'rule-candidate',
          pattern: 'convention one',
          proposedText: 'Convention one text.',
          sessionIds: ['sess-1'],
        },
        {
          type: 'rule-candidate',
          pattern: 'convention two',
          proposedText: 'Convention two text.',
          sessionIds: ['sess-1'],
        },
      ]),
      'utf-8',
    );
    applyObserve(root, { now: NOW, proposalsFile: proposals, user: 'pedro' });
    expect(await pulseCli('pulse-accept', ['S-001'], root)).toBe(0);
    expect(await pulseCli('pulse-accept', ['S-002'], root)).toBe(0);
    const ruleFiles = fs.readdirSync(path.join(root, '.cortex', 'compass', 'rules')).sort();
    expect(ruleFiles).toHaveLength(2);
    expect(ruleFiles[0]).toMatch(/^R-001-/);
    expect(ruleFiles[1]).toMatch(/^R-002-/);
  });
});

describe('AC: a decision becomes an atlas-targeted proposal, never a direct write', () => {
  it('emits an S-NNN decision-candidate section targeting .cortex/atlas/decisions/ with reasoning + session provenance', async () => {
    const root = collected('decision');
    const proposals = path.join(root, 'proposals.json');
    fs.writeFileSync(
      proposals,
      JSON.stringify([
        {
          type: 'decision-candidate',
          title: 'Polling over webhooks for the billing integration',
          reasoning: 'We chose polling because the integration environment has no public ingress for webhooks.',
          sessionIds: ['sess-1'],
        },
      ]),
      'utf-8',
    );
    const result = applyObserve(root, { now: NOW, proposalsFile: proposals, user: 'pedro' });
    expect(result.counts.proposed).toBe(1);
    const rep = report(root);
    expect(rep).toContain('**Type:** decision-candidate');
    expect(rep).toMatch(/\*\*Target:\*\* \.cortex\/atlas\/decisions\/2026-07-08-polling-over-webhooks/);
    expect(rep).toContain('derives_from: claude-sessions/pedro/sess-1');
    expect(rep).toContain('no public ingress');
    // no file under .cortex/atlas/ is modified directly
    expect(gatedClean(root)).toBe(true);
    expect(fs.readdirSync(path.join(root, '.cortex', 'atlas', 'decisions'))).toEqual([]);
    const violations = await checkPulse(root);
    expect(violations.filter((v) => v.severity === 'error')).toEqual([]);
  });
});

describe('AC: a dismissed candidate is not re-proposed', () => {
  it('an unexpired dismissed.md entry matching the candidate suppresses it', () => {
    const root = collected('dismissed');
    const expires = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(
      path.join(root, '.cortex', 'pulse', 'dismissed.md'),
      `---\nkind: pulse-dismissed\ngenerated: ${NOW.toISOString()}\nloop: cortex-init\n---\n\n` +
        `## S-042: all new API routes must validate input with the shared schema validator\n\n` +
        `**Dismissed:** ${NOW.toISOString()}\n**Expires:** ${expires}\n`,
      'utf-8',
    );
    const proposals = path.join(root, 'proposals.json');
    fs.writeFileSync(
      proposals,
      JSON.stringify([
        {
          type: 'rule-candidate',
          pattern: 'all new API routes must validate input with the shared schema validator',
          proposedText: 'All new API routes must validate input.',
          sessionIds: ['sess-1'],
        },
      ]),
      'utf-8',
    );
    const result = applyObserve(root, { now: NOW, proposalsFile: proposals });
    expect(result.counts.dismissed).toBe(1);
    expect(result.counts.proposed).toBe(0);
    expect(report(root)).not.toMatch(/## S-\d{3}:/);
  });
});

describe('AC: distil and session-observe do not double-propose the same pattern', () => {
  it("a pattern already enriched into a v3 entry graduates via distil's promotion path, not a fresh rule-candidate", () => {
    const root = collected('boundary');
    // Session-observe already enriched the retry entry with this observation.
    const enriched = 'billing retries silently swallow ECONNRESET';
    const abs = path.join(root, RETRY_ENTRY_REL);
    fs.writeFileSync(
      abs,
      fs.readFileSync(abs, 'utf-8').replace(
        '- Callers assume idempotency.',
        `- Callers assume idempotency.\n- ${enriched} (claude-sessions/pedro/sess-1)`,
      ),
      'utf-8',
    );
    // Distil later sees the same pattern recurring across its wider window.
    const counts = proposeFromCandidates(root, [
      {
        pattern: enriched,
        occurrences: 3,
        sessionIds: ['sess-1', 'sess-2', 'sess-3'],
        proposedTarget: '.cortex/compass/preferences.md',
        proposedText: enriched,
        confidence: 'high',
      },
    ], { now: NOW });
    expect(counts.proposed).toBe(1);
    const suggestions = fs.readFileSync(path.join(root, '.cortex', 'pulse', SUGGESTIONS_FILE), 'utf-8');
    // A promotion referencing the existing insight entry — not an independent rule-candidate.
    expect(suggestions).toContain('**Type:** promotion');
    expect(suggestions).toContain(RETRY_ENTRY_REL);
    expect(suggestions).not.toContain('**Type:** rule-candidate');
  });
});

describe('AC: the loop never writes gated content directly under any classification', () => {
  it('a run with all three routes: direct writes only under insight/ + pulse/; gated changes exist only as pending proposals', async () => {
    const root = collected('all-routes', ['sess-1', 'sess-2']);
    // Route 1 — ungated enrichment, written directly.
    const abs = path.join(root, RETRY_ENTRY_REL);
    fs.writeFileSync(
      abs,
      fs.readFileSync(abs, 'utf-8').replace(
        '- Callers assume idempotency.',
        '- Callers assume idempotency.\n- Route-1 observation (claude-sessions/pedro/sess-1)',
      ),
      'utf-8',
    );
    // Routes 2 & 3 — gated candidates via the proposals JSON.
    const proposals = path.join(root, 'proposals.json');
    fs.writeFileSync(
      proposals,
      JSON.stringify([
        {
          type: 'rule-candidate',
          pattern: 'route-2 convention',
          proposedText: 'Route-2 convention text.',
          sessionIds: ['sess-1'],
        },
        {
          type: 'decision-candidate',
          title: 'Route-3 decision',
          reasoning: 'Route-3 reasoning.',
          sessionIds: ['sess-2'],
        },
      ]),
      'utf-8',
    );
    const result = applyObserve(root, { now: NOW, proposalsFile: proposals, user: 'pedro' });
    expect(result.violations).toBe(0);
    expect(result.counts.proposed).toBe(2);

    // Write-set inspection: nothing gated changed in the working tree …
    expect(gatedClean(root)).toBe(true);
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean)
      .map((l) => l.slice(3));
    for (const rel of dirty.filter((r) => r.startsWith('.cortex/'))) {
      expect(rel.startsWith('.cortex/insight/') || rel.startsWith('.cortex/pulse/'), rel).toBe(true);
    }
    // … and both gated changes are pending, unaccepted proposal sections.
    expect(await pulseCli('pulse-list', [], root)).toBe(0);
    const listed = out.join('\n');
    expect(listed).toContain('rule-candidate');
    expect(listed).toContain('decision-candidate');
  });
});

// ---------------------------------------------------------------------------
// Rules 11-13: corpus freshness, kind tagging, claimed observation
// ---------------------------------------------------------------------------
const CORPUS_T = new Date('2026-07-08T00:00:00Z');
const OLDER = new Date('2026-07-07T00:00:00Z');
const NEWER = new Date('2026-07-08T06:00:00Z');

function writeCorpusAt(root: string, generated: Date, sessions: { id: string; kind?: string }[]): void {
  fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'state'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.cortex', 'pulse', 'state', CORPUS_FILE),
    JSON.stringify({
      kind: 'session-corpus',
      generated: generated.toISOString(),
      since: '2026-07-01T00:00:00Z',
      sessions: sessions.map((s) => ({ ...s, mtime: generated.toISOString(), messages: [{ role: 'user', text: `msg ${s.id}` }] })),
    }),
    'utf-8',
  );
}

function corpusOnDisk(root: string): { generated: string; since: string; sessions: { id: string; kind?: string; messages: unknown[] }[] } {
  return JSON.parse(fs.readFileSync(path.join(root, '.cortex', 'pulse', 'state', CORPUS_FILE), 'utf-8'));
}

function proposals(root: string, doc: unknown): string {
  const p = path.join(root, 'proposals.json');
  fs.writeFileSync(p, JSON.stringify(doc), 'utf-8');
  return p;
}

describe('AC: collect refreshes a stale corpus with sessions newer than its generated stamp', () => {
  it('old-1 stays, new-1 is appended, generated advances, since + distil-last-run untouched, worklist lists new-1', async () => {
    const root = makeProject('refresh');
    const home = tmp('refresh-home');
    writeCorpusAt(root, CORPUS_T, [{ id: 'old-1' }]);
    const lastRun = path.join(root, '.cortex', 'pulse', 'state', DISTIL_LAST_RUN_FILE);
    fs.writeFileSync(lastRun, '2026-07-01T00:00:00Z\n', 'utf-8');
    writeSessionTranscript(home, root, 'old-1', [textTurn('user', 'stale')], OLDER);
    writeSessionTranscript(home, root, 'new-1', [textTurn('user', 'fresh')], NEWER);

    const r = collectObserve(root, { now: NOW, home });
    const corpus = corpusOnDisk(root);
    expect(corpus.sessions.map((s) => s.id).sort()).toEqual(['new-1', 'old-1']);
    expect(Date.parse(corpus.generated)).toBeGreaterThan(CORPUS_T.getTime());
    expect(corpus.since).toBe('2026-07-01T00:00:00Z');
    expect(fs.readFileSync(lastRun, 'utf-8')).toBe('2026-07-01T00:00:00Z\n');
    expect(r.corpusReused).toBe(true);
    expect(r.corpusAppended).toBe(1);
    const worklist = readObserveWorklist(root);
    expect(worklist?.sessions.map((s) => s.id)).toContain('new-1');
    expect(worklist?.corpus_reused).toBe(true);
    expect(worklist?.corpus_appended).toBe(1);
  });

  it('an old-1 transcript rewritten after generated is replaced in place, never duplicated', () => {
    const root = makeProject('refresh-upsert');
    const home = tmp('refresh-upsert-home');
    writeCorpusAt(root, CORPUS_T, [{ id: 'old-1' }]);
    writeSessionTranscript(home, root, 'old-1', [textTurn('user', 'stale'), textTurn('user', 'and more')], NEWER);
    collectObserve(root, { now: NOW, home });
    const entries = corpusOnDisk(root).sessions.filter((s) => s.id === 'old-1');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.messages).toHaveLength(2);
  });
});

describe('AC: every corpus session carries a deterministic kind, and older corpora still load', () => {
  it('skill preamble and <scheduled-task> sessions are scheduled; prose is interactive — in corpus and worklist', () => {
    const root = makeProject('kind');
    const home = tmp('kind-home');
    writeSessionTranscript(home, root, 'skill-run', [skillBaseDirUserTurn()], OLDER);
    writeSessionTranscript(home, root, 'task-run', [scheduledTaskUserTurn('cortex-daily')], OLDER);
    writeSessionTranscript(home, root, 'human', [textTurn('user', 'ordinary prose question')], OLDER);
    collectObserve(root, { now: NOW, home });
    const expected = { 'skill-run': 'scheduled', 'task-run': 'scheduled', human: 'interactive' };
    expect(Object.fromEntries(corpusOnDisk(root).sessions.map((s) => [s.id, s.kind]))).toEqual(expected);
    expect(Object.fromEntries((readObserveWorklist(root)?.sessions ?? []).map((s) => [s.id, s.kind]))).toEqual(expected);
  });

  it('a pre-existing corpus without kind loads with every session treated as interactive', () => {
    const root = makeProject('kind-legacy');
    writeCorpusAt(root, CORPUS_T, [{ id: 'sess-a' }, { id: 'sess-b' }]);
    const r = collectObserve(root, { now: NOW, home: tmp('kind-legacy-home') });
    expect(r.corpusReused).toBe(true);
    expect(readObserveWorklist(root)?.sessions.map((s) => s.kind)).toEqual(['interactive', 'interactive']);
  });
});

describe('AC: the worklist lists interactive sessions before scheduled ones', () => {
  it('human-1, human-2, sched-1, sched-2 — interactive first, corpus order preserved within each kind', () => {
    const root = makeProject('order');
    writeCorpusAt(root, CORPUS_T, [
      { id: 'sched-1', kind: 'scheduled' },
      { id: 'human-1', kind: 'interactive' },
      { id: 'sched-2', kind: 'scheduled' },
      { id: 'human-2', kind: 'interactive' },
    ]);
    collectObserve(root, { now: NOW, home: tmp('order-home') });
    expect(readObserveWorklist(root)?.sessions.map((s) => s.id)).toEqual(['human-1', 'human-2', 'sched-1', 'sched-2']);
  });
});

describe('AC: apply advances observed-state only for claimed sessions', () => {
  it('{observed: [sess-1]} marks sess-1 observed, sess-2 gets attempts 1, report says so, next collect lists sess-2', async () => {
    const root = collected('claim', ['sess-1', 'sess-2']);
    process.chdir(root);
    const code = await run(['loop-session-observe', '--apply', '--proposals', proposals(root, { observed: ['sess-1'], candidates: [] })]);
    expect(code).toBe(0);
    const state = readObserveState(root);
    expect(state.observed).toEqual(['sess-1']);
    expect(state.attempts).toEqual({ 'sess-2': 1 });
    const rep = report(root);
    expect(rep).toContain('Sessions observed this run: 1 (sess-1)');
    expect(rep).toContain('Sessions left unobserved: 1 (sess-2');
    expect(out.join('\n')).toMatch(/1 session\(s\) marked observed/);
    collectObserve(root, { now: NOW, home: tmp('claim-home-2') });
    expect(readObserveWorklist(root)?.sessions.map((s) => s.id)).toEqual(['sess-2']);
  });

  it('the legacy bare array, and plain --apply with no file, claim every worklist session', async () => {
    const arrayRoot = collected('claim-array', ['sess-1', 'sess-2']);
    applyObserve(arrayRoot, { now: NOW, proposalsFile: proposals(arrayRoot, []) });
    expect(readObserveState(arrayRoot).observed).toEqual(['sess-1', 'sess-2']);

    const plainRoot = collected('claim-plain', ['sess-1', 'sess-2']);
    applyObserve(plainRoot, { now: NOW });
    expect(readObserveState(plainRoot).observed).toEqual(['sess-1', 'sess-2']);
    expect(readObserveState(plainRoot).attempts).toEqual({});
  });
});

describe('AC: an unclaimed session expires after three unclaimed applies', () => {
  it('after two applies: attempts 2, still in the worklist; after the third: observed, attempts dropped, report note', () => {
    const root = makeProject('expire');
    const cycle = () => {
      writeCorpus(root, ['sess-stuck']);
      collectObserve(root, { now: NOW, home: tmp('expire-home') });
      return applyObserve(root, { now: NOW, proposalsFile: proposals(root, { observed: [] }) });
    };
    cycle();
    const two = cycle();
    expect(two.expired).toBe(0);
    expect(readObserveState(root).attempts).toEqual({ 'sess-stuck': 2 });
    expect(readObserveState(root).observed).toEqual([]);
    collectObserve(root, { now: NOW, home: tmp('expire-home-3') });
    expect(readObserveWorklist(root)?.sessions.map((s) => s.id)).toEqual(['sess-stuck']);

    const three = cycle();
    expect(three.expired).toBe(1);
    expect(readObserveState(root).observed).toEqual(['sess-stuck']);
    expect(readObserveState(root).attempts).toEqual({});
    expect(report(root)).toMatch(/expired unobserved.*sess-stuck/);
  });
});

describe('CLI dispatch (spec Rule 1 / core surface)', () => {
  it('cortex loop-session-observe --collect writes the worklist; bare mode defers the judgment to the skill', async () => {
    const root = makeProject('cli');
    writeCorpus(root, ['sess-1']);
    process.chdir(root);
    expect(await run(['loop-session-observe', '--collect'])).toBe(0);
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', 'state', SESSION_OBSERVE_WORKLIST_FILE))).toBe(true);
    expect(await run(['loop-session-observe'])).toBe(0);
    expect(out.join('\n')).toContain('cortex-loop-session-observe skill');
    expect(await run(['loop-session-observe', '--collect', '--apply'])).toBe(1);
    expect(await run(['loop-session-observe', '--apply', '--proposals'])).toBe(1);
  });
});
