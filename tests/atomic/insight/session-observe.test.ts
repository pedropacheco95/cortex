/**
 * Atomic tests — insight.session-observe Core bookends (build-order-v3 step
 * 6): collect worklist correctness + observed-state tracking (shared-corpus
 * reuse), apply's section-boundary enforcement (Purpose edit → error;
 * Insights append with provenance → ok; missing trailer → error), the
 * decision-candidate accept path writing a schema-valid atlas decision
 * (validated with the real checks), check.pulse accepting the new type, and
 * the §9.1 task-registration counts. Sandboxed tmp git repos + fake homes —
 * the real repo and ~/.claude are never touched.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { makeTmpDir, cleanTmp, gitInit, gitCommitAll } from '../../fixtures/insight-refresh-harness.js';
import { projectSlug } from '../../../src/sessions/read.js';
import {
  collectObserve,
  applyObserve,
  runSessionObserve,
  readObserveState,
  readObserveWorklist,
  validateObserveCandidate,
  decisionSlug,
  decisionFilePayload,
  ruleFilePayload,
  splitEntrySections,
  PROVENANCE_TRAILER_RE,
  SESSION_OBSERVE_STATE_FILE,
  SESSION_OBSERVE_REPORT_FILE,
} from '../../../src/insight/session-observe.js';
import { CORPUS_FILE } from '../../../src/pulse/distil.js';
import { pulseCli } from '../../../src/pulse/review.js';
import { SUGGESTION_TYPES, isTargetPermitted, permittedRoots } from '../../../src/pulse/types.js';
import { checkPulse } from '../../../src/schema/checks/pulse.js';
import { checkAtlas } from '../../../src/schema/checks/atlas.js';
import { checkRules } from '../../../src/schema/checks/compass.js';
import { checkProvenance } from '../../../src/schema/checks/provenance.js';
import { buildIndex } from '../../../src/schema/index-build.js';
import { CANONICAL_TASK_NAMES } from '../../../src/cli/task-scoping.js';
import { SCHEDULED_TASKS } from '../../../src/cli/templates.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`session-observe-${label}`);
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

const NOW = new Date('2026-07-08T12:00:00Z');

function pulsePath(root: string, name: string): string {
  return path.join(root, '.cortex', 'pulse', name);
}

function statePath(root: string, name: string): string {
  return path.join(root, '.cortex', 'pulse', 'state', name);
}

function reportPath(root: string, name: string): string {
  return path.join(root, '.cortex', 'pulse', 'reports', name);
}

/** A prebuilt shared corpus (as distil's --collect writes it). */
function writeCorpus(root: string, sessionIds: string[]): void {
  fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'state'), { recursive: true });
  fs.writeFileSync(
    statePath(root, CORPUS_FILE),
    JSON.stringify(
      {
        kind: 'session-corpus',
        generated: '2026-07-08T00:00:00Z',
        since: '2026-07-01T00:00:00Z',
        sessions: sessionIds.map((id) => ({
          id,
          mtime: '2026-07-07T00:00:00Z',
          messages: [{ role: 'user', text: `message in ${id}` }],
        })),
      },
      null,
      2,
    ),
    'utf-8',
  );
}

function writeTranscript(home: string, root: string, id: string): void {
  const dir = path.join(home, '.claude', 'projects', projectSlug(root));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${id}.jsonl`),
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' }, timestamp: '2026-07-07T00:00:00Z' }) + '\n',
    'utf-8',
  );
}

const ENTRY_REL = '.cortex/insight/anatomy/src/billing/retry.ts.md';
const ENTRY_BODY = `---
path: src/billing/retry.ts
extracted_at: 2026-07-01T00:00:00Z
extraction_level: 3
size_lines: 10
size_tokens: 42
centrality: high
built_at_commit: "abc1234"
source_sha256: "${'a'.repeat(64)}"
---

## Purpose

Retries billing calls.

## Main players

- \`retry\` (lines 1-5) — the retry wrapper.

## Insights

- Existing insight line.

## Connections

Uses: (none)

## Query pointers

- If you need backoff maths, read src/billing/backoff.ts.
`;

/** A git project with a committed valid entry + gated dirs. */
function makeGitProject(label: string): string {
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
  fs.mkdirSync(path.dirname(path.join(root, ENTRY_REL)), { recursive: true });
  fs.writeFileSync(path.join(root, ENTRY_REL), ENTRY_BODY, 'utf-8');
  // .cortex/pulse is transient but must not be gitignored here — commit the tree.
  gitCommitAll(root, 'baseline');
  return root;
}

function collectFor(root: string, sessions: string[] = ['sess-1']): void {
  writeCorpus(root, sessions);
  collectObserve(root, { now: NOW });
}

// ---------------------------------------------------------------------------
// collect — worklist correctness + observed-state tracking
// ---------------------------------------------------------------------------
describe('collect: shared-corpus reuse and unobserved-session worklist', () => {
  it('reuses an existing corpus and lists only sessions not yet observed', () => {
    const root = tmp('collect-reuse');
    writeCorpus(root, ['sess-a', 'sess-b', 'sess-c']);
    fs.writeFileSync(
      statePath(root, SESSION_OBSERVE_STATE_FILE),
      JSON.stringify({ kind: 'session-observe-state', updated: '2026-07-01T00:00:00Z', observed: ['sess-a'] }),
      'utf-8',
    );
    const result = collectObserve(root, { now: NOW });
    expect(result.corpusReused).toBe(true);
    expect(result.sessions).toBe(2);
    expect(result.alreadyObserved).toBe(1);
    const worklist = readObserveWorklist(root);
    expect(worklist?.sessions.map((s) => s.id)).toEqual(['sess-b', 'sess-c']);
    expect(worklist?.corpus_reused).toBe(true);
  });

  it('builds the corpus via the shared distil machinery when absent (fake home)', () => {
    const root = tmp('collect-build');
    const home = tmp('collect-build-home');
    fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
    writeTranscript(home, root, 'sess-x');
    const result = collectObserve(root, { now: NOW, home });
    expect(result.corpusReused).toBe(false);
    expect(fs.existsSync(statePath(root, CORPUS_FILE))).toBe(true);
    expect(readObserveWorklist(root)?.sessions.map((s) => s.id)).toEqual(['sess-x']);
  });

  it('apply marks the worklist sessions observed; a re-collect excludes them', () => {
    const root = makeGitProject('observe-state');
    collectFor(root, ['sess-1', 'sess-2']);
    applyObserve(root, { now: NOW });
    expect(readObserveState(root).observed).toEqual(['sess-1', 'sess-2']);
    collectObserve(root, { now: NOW });
    expect(readObserveWorklist(root)?.sessions).toEqual([]);
  });

  it('apply without a prior collect fails loudly', async () => {
    const root = tmp('no-collect');
    fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
    expect(await runSessionObserve(root, { apply: true, now: NOW })).toBe(1);
  });

  it('--collect and --apply are mutually exclusive', async () => {
    expect(await runSessionObserve(tmp('mutex'), { collect: true, apply: true })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// apply — section-boundary enforcement (spec Rule 2)
// ---------------------------------------------------------------------------
describe('apply: section-boundary + provenance enforcement on enriched entries', () => {
  it('an Insights append carrying the claude-sessions trailer passes (exit 0)', async () => {
    const root = makeGitProject('append-ok');
    collectFor(root);
    const abs = path.join(root, ENTRY_REL);
    fs.writeFileSync(
      abs,
      fs.readFileSync(abs, 'utf-8').replace(
        '- Existing insight line.',
        '- Existing insight line.\n- Silently swallows ECONNRESET (claude-sessions/pedro/sess-1)',
      ),
      'utf-8',
    );
    const result = applyObserve(root, { now: NOW });
    expect(result.violations).toBe(0);
    expect(result.entriesValidated).toBe(1);
    expect(await runSessionObserve(root, { apply: true, now: NOW })).toBe(0);
  });

  it('a Query pointers append with the trailer passes; without it → violation', () => {
    const root = makeGitProject('qp');
    collectFor(root);
    const abs = path.join(root, ENTRY_REL);
    const raw = fs.readFileSync(abs, 'utf-8');
    fs.writeFileSync(
      raw ? abs : abs,
      raw + '- When touching retry logic, also check src/billing/backoff.ts first (claude-sessions/pedro/sess-1)\n',
      'utf-8',
    );
    expect(applyObserve(root, { now: NOW }).violations).toBe(0);

    // Now an append WITHOUT the trailer.
    fs.appendFileSync(abs, '- Naked guidance without provenance\n', 'utf-8');
    const result = applyObserve(root, { now: NOW });
    expect(result.violations).toBe(1);
    const report = fs.readFileSync(reportPath(root, SESSION_OBSERVE_REPORT_FILE), 'utf-8');
    expect(report).toContain('provenance trailer');
  });

  it('a Purpose edit → violation and exit 1 (extraction-owned section)', async () => {
    const root = makeGitProject('purpose');
    collectFor(root);
    const abs = path.join(root, ENTRY_REL);
    fs.writeFileSync(abs, fs.readFileSync(abs, 'utf-8').replace('Retries billing calls.', 'Rewritten purpose.'), 'utf-8');
    expect(await runSessionObserve(root, { apply: true, now: NOW })).toBe(1);
    const report = fs.readFileSync(reportPath(root, SESSION_OBSERVE_REPORT_FILE), 'utf-8');
    expect(report).toContain('## Purpose');
    expect(report).toContain('extraction-owned');
  });

  it('an entry broken by the write (no longer §4.10.2-valid) → violation', () => {
    const root = makeGitProject('broken');
    collectFor(root);
    const abs = path.join(root, ENTRY_REL);
    fs.writeFileSync(abs, fs.readFileSync(abs, 'utf-8').replace('extraction_level: 3', 'extraction_level: 9'), 'utf-8');
    expect(applyObserve(root, { now: NOW }).violations).toBeGreaterThan(0);
  });

  it('a direct compass write → loop-write-invariant violation (RULES 7)', () => {
    const root = makeGitProject('gated');
    collectFor(root);
    fs.appendFileSync(path.join(root, '.cortex', 'compass', 'preferences.md'), '\n- sneaky direct rule\n', 'utf-8');
    const result = applyObserve(root, { now: NOW });
    expect(result.violations).toBe(1);
    expect(fs.readFileSync(reportPath(root, SESSION_OBSERVE_REPORT_FILE), 'utf-8')).toContain('gated path modified directly');
  });

  it('splitEntrySections is byte-preserving per section and the trailer regex anchors at line end', () => {
    const split = splitEntrySections(ENTRY_BODY);
    expect([...split.sections.keys()]).toEqual(['Purpose', 'Main players', 'Insights', 'Connections', 'Query pointers']);
    expect(split.frontmatter.startsWith('---')).toBe(true);
    expect(PROVENANCE_TRAILER_RE.test('- quirk (claude-sessions/pedro/abc-123)')).toBe(true);
    expect(PROVENANCE_TRAILER_RE.test('- quirk (claude-sessions/pedro/abc-123) and more')).toBe(false);
    expect(PROVENANCE_TRAILER_RE.test('- quirk claude-sessions/pedro/abc-123')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// candidates — validation + the decision payload
// ---------------------------------------------------------------------------
describe('candidate validation and decision drafting', () => {
  it('accepts the two shapes and rejects everything else', () => {
    expect(
      validateObserveCandidate({
        type: 'rule-candidate',
        pattern: 'validate input with the shared schema validator',
        title: 'API routes must validate input',
        governedGlobs: ['src/api/**/*.ts'],
        proposedText: 'All new API routes must validate input with the shared schema validator.',
        sessionIds: ['sess-1'],
      }),
    ).not.toBeNull();
    expect(
      validateObserveCandidate({
        type: 'decision-candidate',
        title: 'Polling over webhooks',
        reasoning: 'Webhooks need public ingress we do not have.',
        sessionIds: ['sess-1'],
      }),
    ).not.toBeNull();
    // malformed shapes
    expect(validateObserveCandidate(null)).toBeNull();
    expect(validateObserveCandidate({ type: 'promotion' })).toBeNull();
    expect(
      validateObserveCandidate({ type: 'rule-candidate', proposedText: 'y', sessionIds: ['s'] }), // missing pattern
    ).toBeNull();
    expect(
      validateObserveCandidate({ type: 'rule-candidate', pattern: 'x', sessionIds: ['s'] }), // missing proposedText
    ).toBeNull();
    expect(
      validateObserveCandidate({ type: 'rule-candidate', pattern: 'x', proposedText: 'y', sessionIds: [] }), // empty sessionIds
    ).toBeNull();
    expect(
      validateObserveCandidate({ type: 'decision-candidate', title: 'x', reasoning: 'y', sessionIds: [] }),
    ).toBeNull();
    expect(
      validateObserveCandidate({ type: 'decision-candidate', title: 'x', reasoning: 'y', sessionIds: ['s'], slug: 'a/b' }),
    ).toBeNull();
  });

  it('title/governedGlobs are TOLERANT: absent or malformed falls back instead of rejecting the candidate', () => {
    // no title, no governedGlobs at all — still valid (Core derives/falls back)
    const bare = validateObserveCandidate({
      type: 'rule-candidate',
      pattern: 'x',
      proposedText: 'y',
      sessionIds: ['s'],
    });
    expect(bare).not.toBeNull();
    expect((bare as { title?: string }).title).toBeUndefined();
    expect((bare as { governedGlobs?: string[] }).governedGlobs).toBeUndefined();

    // malformed governedGlobs (not an array of strings) and an empty-string title
    // are dropped, not treated as a hard failure (old/malformed proposals JSON).
    const malformed = validateObserveCandidate({
      type: 'rule-candidate',
      pattern: 'x',
      title: '   ',
      governedGlobs: 'not-an-array',
      proposedText: 'y',
      sessionIds: ['s'],
    });
    expect(malformed).not.toBeNull();
    expect((malformed as { title?: string }).title).toBeUndefined();
    expect((malformed as { governedGlobs?: string[] }).governedGlobs).toBeUndefined();
  });

  it('decisionSlug lowercases, hyphenates, and never returns empty', () => {
    expect(decisionSlug({ title: 'Polling over Webhooks!' })).toBe('polling-over-webhooks');
    expect(decisionSlug({ title: '???' })).toBe('decision');
    expect(decisionSlug({ title: 'ignored', slug: 'explicit-slug' })).toBe('explicit-slug');
  });

  it('decisionFilePayload drafts §4.3-conformant frontmatter with claude-sessions provenance', () => {
    const { targetRel, payload } = decisionFilePayload(
      { type: 'decision-candidate', title: 'Polling over webhooks', reasoning: 'Because ingress.', sessionIds: ['sess-1', 'sess-2'] },
      NOW,
      'pedro',
    );
    expect(targetRel).toBe('.cortex/atlas/decisions/2026-07-08-polling-over-webhooks.md');
    expect(payload).toContain('id: decision.2026-07-08-polling-over-webhooks');
    expect(payload).toContain('title: "Polling over webhooks"');
    expect(payload).toContain('- derives_from: claude-sessions/pedro/sess-1');
    expect(payload).toContain('- derives_from: claude-sessions/pedro/sess-2');
    expect(payload).toContain('Because ingress.');
  });

  it('ruleFilePayload drafts §4.2-conformant frontmatter (B-010: the rule-candidate equivalent of decisionFilePayload)', () => {
    const root = tmp('rule-payload');
    const allocated = new Set<string>();
    const { targetRel, payload } = ruleFilePayload(
      {
        type: 'rule-candidate',
        pattern: 'validate input with the shared schema validator',
        title: 'API routes must validate input',
        governedGlobs: ['src/api/**/*.ts'],
        proposedText: 'All new API routes must validate input with the shared schema validator.',
        sessionIds: ['sess-1', 'sess-2'],
      },
      root,
      'pedro',
      allocated,
    );
    expect(targetRel).toBe('.cortex/compass/rules/R-001-api-routes-must-validate-input.md');
    expect(payload).toContain('id: R-001');
    expect(payload).toContain('title: "API routes must validate input"');
    expect(payload).toContain('source:');
    expect(payload).toContain('../../pulse/reports/session-observe.md');
    expect(payload).toContain('governs:');
    expect(payload).toContain('"src/api/**/*.ts"');
    expect(payload).toContain('- derives_from: claude-sessions/pedro/sess-1');
    expect(payload).toContain('- derives_from: claude-sessions/pedro/sess-2');
    expect(payload).toContain('All new API routes must validate input with the shared schema validator.');
    expect(allocated.has('R-001')).toBe(true);
  });

  it('ruleFilePayload falls back to governs: ["**/*"] when governedGlobs is absent', () => {
    const root = tmp('rule-payload-fallback');
    const { payload } = ruleFilePayload(
      { type: 'rule-candidate', pattern: 'x', proposedText: 'y', sessionIds: ['s'] },
      root,
      'pedro',
      new Set<string>(),
    );
    expect(payload).toContain('governs:');
    expect(payload).toContain('"**/*"');
  });

  it('ruleFilePayload allocates the next R-NNN from existing on-disk rule files, and never collides within one batch', () => {
    const root = tmp('rule-payload-scan');
    fs.mkdirSync(path.join(root, '.cortex', 'compass', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'compass', 'rules', 'R-001-existing.md'), '# existing\n', 'utf-8');
    fs.writeFileSync(path.join(root, '.cortex', 'compass', 'rules', 'R-004-gap.md'), '# gap\n', 'utf-8');
    const allocated = new Set<string>();
    const first = ruleFilePayload(
      { type: 'rule-candidate', pattern: 'first', proposedText: 'a', sessionIds: ['s'] },
      root,
      'pedro',
      allocated,
    );
    const second = ruleFilePayload(
      { type: 'rule-candidate', pattern: 'second', proposedText: 'b', sessionIds: ['s'] },
      root,
      'pedro',
      allocated,
    );
    expect(first.targetRel).toBe('.cortex/compass/rules/R-005-first.md');
    expect(second.targetRel).toBe('.cortex/compass/rules/R-006-second.md');
  });
});

// ---------------------------------------------------------------------------
// decision-candidate — type table, check.pulse, and the accept path
// ---------------------------------------------------------------------------
describe('decision-candidate in the typed pulse gate', () => {
  it('is in the §4.5.1 enum with atlas/decisions/ as its only permitted root', () => {
    expect(SUGGESTION_TYPES).toContain('decision-candidate');
    expect(isTargetPermitted('decision-candidate', '.cortex/atlas/decisions/2026-07-08-x.md')).toBe(true);
    expect(isTargetPermitted('decision-candidate', '.cortex/atlas/stakeholders/x.md')).toBe(false);
    expect(isTargetPermitted('decision-candidate', '.cortex/compass/preferences.md')).toBe(false);
    expect(permittedRoots('decision-candidate')).toEqual([{ kind: 'dir', prefix: '.cortex/atlas/decisions/' }]);
  });

  it('check.pulse accepts a decision-candidate section and errors on a wrong root', async () => {
    const root = tmp('check-pulse');
    fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'reports'), { recursive: true });
    fs.writeFileSync(
      reportPath(root, 'session-observe.md'),
      `---\nkind: pulse-session-observe\ngenerated: 2026-07-08T12:00:00Z\nloop: cortex-loop-session-observe\n---\n\n` +
        `## S-001: A decision\n\n**Type:** decision-candidate\n**Source:** session-observe (sessions: s)\n` +
        `**Target:** .cortex/atlas/decisions/2026-07-08-a-decision.md\n\n**Proposed file:**\n\n\`\`\`\nbody\n\`\`\`\n\n` +
        `## S-002: Wrong root\n\n**Type:** decision-candidate\n**Source:** session-observe (sessions: s)\n` +
        `**Target:** .cortex/compass/preferences.md\n\n**Proposed addition:**\n\n\`\`\`\nbody\n\`\`\`\n`,
      'utf-8',
    );
    const violations = await checkPulse(root);
    const s1 = violations.filter((v) => v.location.key === 'S-001');
    const s2 = violations.filter((v) => v.location.key === 'S-002');
    expect(s1).toEqual([]);
    expect(s2.some((v) => v.severity === 'error' && v.message.includes('outside the permitted root'))).toBe(true);
  });

  it('accept creates a schema-valid atlas decision (validated with the real checks)', async () => {
    const root = makeGitProject('accept');
    collectFor(root);
    const proposals = path.join(root, 'proposals.json');
    fs.writeFileSync(
      proposals,
      JSON.stringify([
        {
          type: 'decision-candidate',
          title: 'Polling over webhooks',
          reasoning: 'On 2026-07-08 we chose polling because the integration has no public ingress.',
          sessionIds: ['sess-1'],
        },
      ]),
      'utf-8',
    );
    applyObserve(root, { now: NOW, proposalsFile: proposals, user: 'pedro' });

    const decisionRel = '.cortex/atlas/decisions/2026-07-08-polling-over-webhooks.md';
    expect(fs.existsSync(path.join(root, decisionRel))).toBe(false); // proposal only
    expect(await pulseCli('pulse-accept', ['S-001'], root)).toBe(0);
    expect(fs.existsSync(path.join(root, decisionRel))).toBe(true);

    const index = await buildIndex(root);
    expect(await checkAtlas(root, index)).toEqual([]);
    // provenance is well-formed (claude-sessions refs are shape-checked only)
    expect(await checkProvenance(root)).toEqual([]);
    const written = fs.readFileSync(path.join(root, decisionRel), 'utf-8');
    expect(written).toContain('id: decision.2026-07-08-polling-over-webhooks');
    expect(written).toContain('derives_from: claude-sessions/pedro/sess-1');
  });

  it('accept refuses a decision-candidate targeting outside atlas/decisions/', async () => {
    const root = makeGitProject('accept-refuse');
    fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'reports'), { recursive: true });
    fs.writeFileSync(
      reportPath(root, 'session-observe.md'),
      `---\nkind: pulse-session-observe\ngenerated: 2026-07-08T12:00:00Z\nloop: cortex-loop-session-observe\n---\n\n` +
        `## S-009: Escapee\n\n**Type:** decision-candidate\n**Source:** session-observe (sessions: s)\n` +
        `**Target:** .cortex/atlas/decisions/../../../evil.md\n\n**Proposed file:**\n\n\`\`\`\nbody\n\`\`\`\n`,
      'utf-8',
    );
    expect(await pulseCli('pulse-accept', ['S-009'], root)).toBe(1);
    expect(fs.existsSync(path.join(root, 'evil.md'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B-010: rule-candidate — the same round-trip decision-candidate already had,
// which the bug lacked. A `rule-candidate` proposal must be `cortex
// pulse-accept`-able against an EMPTY .cortex/compass/rules/, and the landed
// file must pass check.rules (id/title/source/governs) + check.provenance.
// ---------------------------------------------------------------------------
describe('rule-candidate in the typed pulse gate (B-010 fix)', () => {
  it('renders a **Proposed file:** section targeting a Core-computed .cortex/compass/rules/R-NNN path', () => {
    const root = makeGitProject('rule-render');
    collectFor(root);
    const proposals = path.join(root, 'proposals.json');
    fs.writeFileSync(
      proposals,
      JSON.stringify([
        {
          type: 'rule-candidate',
          pattern: 'validate input with the shared schema validator',
          title: 'API routes must validate input',
          governedGlobs: ['src/api/**/*.ts'],
          proposedText: 'All new API routes must validate input with the shared schema validator.',
          sessionIds: ['sess-1'],
        },
      ]),
      'utf-8',
    );
    applyObserve(root, { now: NOW, proposalsFile: proposals, user: 'pedro' });
    const rep = fs.readFileSync(reportPath(root, SESSION_OBSERVE_REPORT_FILE), 'utf-8');
    expect(rep).toContain('**Type:** rule-candidate');
    expect(rep).toMatch(/\*\*Target:\*\* \.cortex\/compass\/rules\/R-001-/);
    expect(rep).toContain('**Proposed file:**');
    expect(rep).not.toContain('**Proposed addition:**');
  });

  it('accept creates a schema-valid rule file against an EMPTY .cortex/compass/rules/ (the bug: this used to fail "Target file does not exist")', async () => {
    const root = makeGitProject('rule-accept-empty');
    expect(fs.existsSync(path.join(root, '.cortex', 'compass', 'rules'))).toBe(false);
    collectFor(root);
    const proposals = path.join(root, 'proposals.json');
    fs.writeFileSync(
      proposals,
      JSON.stringify([
        {
          type: 'rule-candidate',
          pattern: 'validate input with the shared schema validator',
          title: 'API routes must validate input',
          governedGlobs: ['src/api/**/*.ts'],
          proposedText: 'All new API routes must validate input with the shared schema validator.',
          sessionIds: ['sess-1'],
        },
      ]),
      'utf-8',
    );
    applyObserve(root, { now: NOW, proposalsFile: proposals, user: 'pedro' });
    expect(await pulseCli('pulse-accept', ['S-001'], root)).toBe(0);

    const ruleFiles = fs.readdirSync(path.join(root, '.cortex', 'compass', 'rules'));
    expect(ruleFiles).toHaveLength(1);
    expect(ruleFiles[0]).toBe('R-001-api-routes-must-validate-input.md');
    const written = fs.readFileSync(path.join(root, '.cortex', 'compass', 'rules', ruleFiles[0] as string), 'utf-8');
    expect(written).toContain('id: R-001');
    expect(written).toContain('title: "API routes must validate input"');
    expect(written).toContain('governs:');
    expect(written).toContain('derives_from: claude-sessions/pedro/sess-1');

    const index = await buildIndex(root);
    const ruleViolations = await checkRules(root, index);
    expect(ruleViolations.filter((v) => v.severity === 'error')).toEqual([]);
    expect(await checkProvenance(root)).toEqual([]);
  });

  it('two rule-candidates accepted from the same apply batch get distinct, non-colliding R-NNN ids', async () => {
    const root = makeGitProject('rule-two-batch');
    collectFor(root);
    const proposals = path.join(root, 'proposals.json');
    fs.writeFileSync(
      proposals,
      JSON.stringify([
        { type: 'rule-candidate', pattern: 'convention one', proposedText: 'Convention one.', sessionIds: ['sess-1'] },
        { type: 'rule-candidate', pattern: 'convention two', proposedText: 'Convention two.', sessionIds: ['sess-1'] },
      ]),
      'utf-8',
    );
    applyObserve(root, { now: NOW, proposalsFile: proposals, user: 'pedro' });
    expect(await pulseCli('pulse-accept', ['S-001'], root)).toBe(0);
    expect(await pulseCli('pulse-accept', ['S-002'], root)).toBe(0);
    const ruleFiles = fs.readdirSync(path.join(root, '.cortex', 'compass', 'rules')).sort();
    expect(ruleFiles).toEqual(['R-001-convention-one.md', 'R-002-convention-two.md']);

    const index = await buildIndex(root);
    expect((await checkRules(root, index)).filter((v) => v.severity === 'error')).toEqual([]);
  });

  it('accept refuses a rule-candidate targeting outside compass/ (defence in depth; Core never emits this)', async () => {
    const root = makeGitProject('rule-accept-refuse');
    fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'reports'), { recursive: true });
    fs.writeFileSync(
      reportPath(root, 'session-observe.md'),
      `---\nkind: pulse-session-observe\ngenerated: 2026-07-08T12:00:00Z\nloop: cortex-loop-session-observe\n---\n\n` +
        `## S-009: Escapee\n\n**Type:** rule-candidate\n**Source:** session-observe (sessions: s)\n` +
        `**Target:** .cortex/compass/../../../evil.md\n\n**Proposed file:**\n\n\`\`\`\nbody\n\`\`\`\n`,
      'utf-8',
    );
    expect(await pulseCli('pulse-accept', ['S-009'], root)).toBe(1);
    expect(fs.existsSync(path.join(root, 'evil.md'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// task registration (schema §9.1; v3.0 consolidation: session-observe rides
// the daily bundle as its fifth member — no standalone registration)
// ---------------------------------------------------------------------------
describe('session-observe scheduled-task registration (daily bundle member)', () => {
  it('the daily bundle carries session-observe with its collect/apply bookends (count 5)', () => {
    expect(SCHEDULED_TASKS).toHaveLength(5);
    const task = SCHEDULED_TASKS.find((t) => t.name === 'daily');
    expect(task).toBeDefined();
    expect(task?.requiredSkills).toContain('cortex-loop-session-observe');
    expect(task?.body).toContain('cortex-loop-session-observe');
    expect(task?.body).toContain('cortex loop-session-observe --collect');
    expect(task?.body).toContain('--apply');
    // No standalone session-observe canonical remains.
    expect(CANONICAL_TASK_NAMES['session-observe']).toBeUndefined();
    expect(Object.keys(CANONICAL_TASK_NAMES)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// the shipped skill bundle
// ---------------------------------------------------------------------------
describe('the cortex-loop-session-observe skill bundle', () => {
  const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const pkg = path.join(PKG_ROOT, 'skills', 'cortex-loop-session-observe', 'SKILL.md');
  const mirror = path.join(PKG_ROOT, '.claude', 'skills', 'cortex-loop-session-observe', 'SKILL.md');

  it('ships in skills/ with a byte-identical .claude/skills mirror', () => {
    expect(fs.existsSync(pkg)).toBe(true);
    expect(fs.existsSync(mirror)).toBe(true);
    expect(fs.readFileSync(pkg, 'utf-8')).toBe(fs.readFileSync(mirror, 'utf-8'));
  });

  it('teaches the type routing, the write boundaries, and the distil boundary', () => {
    const skill = fs.readFileSync(pkg, 'utf-8');
    expect(skill).toContain('name: cortex-loop-session-observe');
    expect(skill).toContain('cortex loop-session-observe --collect');
    expect(skill).toContain('--apply --proposals');
    expect(skill).toContain('rule-candidate');
    expect(skill).toContain('decision-candidate');
    expect(skill).toContain('claude-sessions/');
    expect(skill).toContain('## Query pointers');
    expect(skill).toMatch(/never create entries/i);
    expect(skill).toMatch(/never spawn a nested/i);
    expect(skill).toContain('cortex-pulse-distil');
  });
});
