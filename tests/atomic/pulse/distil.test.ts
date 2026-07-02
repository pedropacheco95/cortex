/**
 * Atomic tests — pulse.distil (spec Acceptance Criteria as labelled describes,
 * plus Rule 2 malformed-candidate handling and the shipped SKILL.md pinning).
 * Every test runs in a sandboxed tmp project with a FAKE injected home — the
 * real ~/.claude is never touched; subprocess modes use stub claude
 * executables (never a real LLM).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { makeTmpDir, cleanTmp, snapshotTree, writeExecutable, authFailStub } from '../../fixtures/init-harness.js';
import {
  collectCorpus,
  proposeFromCandidates,
  runDistil,
  validateDistilCandidate,
  CORPUS_FILE,
  DISTIL_LAST_RUN_FILE,
} from '../../../src/pulse/distil.js';
import { projectSlug } from '../../../src/sessions/read.js';

const TEST_TIMEOUT = 30_000;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`distil-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

let out: string[] = [];
beforeEach(() => {
  out = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    out.push(a.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    out.push(a.join(' '));
  });
});

/** Minimal .cortex project skeleton. */
function makeProject(label: string, config: Record<string, unknown> = {}): string {
  const root = tmp(label);
  fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'cerebrum'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.cortex', 'cortex.config.json'),
    JSON.stringify({ schemaVersion: '1.0', ...config }, null, 2),
    'utf-8',
  );
  return root;
}

function pulsePath(root: string, name: string): string {
  return path.join(root, '.cortex', 'pulse', name);
}

function writeTranscript(home: string, root: string, id: string, texts: string[], mtime?: Date): string {
  const dir = path.join(home, '.claude', 'projects', projectSlug(root));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  const lines = texts.map((t) =>
    JSON.stringify({ type: 'user', message: { role: 'user', content: t }, timestamp: '2026-07-01T00:00:00Z' }),
  );
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf-8');
  if (mtime) fs.utimesSync(file, mtime, mtime);
  return file;
}

interface CandidateShape {
  pattern: string;
  occurrences: number;
  sessionIds: string[];
  proposedTarget: string;
  proposedText: string;
  confidence: string | number;
}
function cand(over: Partial<CandidateShape> & Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pattern: 'use pnpm not npm',
    occurrences: 3,
    sessionIds: ['sess-a', 'sess-b'],
    proposedTarget: '.cortex/cerebrum/preferences.md',
    proposedText: 'Always use pnpm, never npm.',
    confidence: 'high',
    ...over,
  };
}

// ===========================================================================
describe('Collect is project-scoped and windowed', () => {
  it('the corpus holds only the newer session of THIS project (sibling and pre-last-run excluded)', () => {
    const root = makeProject('collect');
    const home = tmp('collect-home');
    const lastRun = new Date('2026-06-20T00:00:00Z');
    fs.writeFileSync(pulsePath(root, DISTIL_LAST_RUN_FILE), lastRun.toISOString(), 'utf-8');

    writeTranscript(home, root, 'new-session', ['please use pnpm'], new Date('2026-06-25T00:00:00Z'));
    writeTranscript(home, root, 'old-session', ['ancient message'], new Date('2026-06-10T00:00:00Z'));
    // A sibling project's transcript must never leak in (session-reading Rule 2).
    const sibling = tmp('collect-sibling');
    writeTranscript(home, sibling, 'sibling-session', ['other project'], new Date('2026-06-25T00:00:00Z'));

    const result = collectCorpus(root, { home, now: new Date('2026-06-28T00:00:00Z') });
    const corpus = JSON.parse(fs.readFileSync(result.corpusPath, 'utf-8'));
    expect(corpus.sessions.map((s: { id: string }) => s.id)).toEqual(['new-session']);
    expect(corpus.sessions[0].messages[0].text).toBe('please use pnpm');
    expect(corpus.since).toBe(lastRun.toISOString());
    expect(result.firstRun).toBe(false);
  });

  it('a first run (no .distil-last-run) bounds itself to the last 30 days', () => {
    const root = makeProject('collect-first');
    const home = tmp('collect-first-home');
    const now = new Date('2026-06-28T00:00:00Z');
    writeTranscript(home, root, 'recent', ['hello'], new Date('2026-06-27T00:00:00Z'));
    writeTranscript(home, root, 'ancient', ['old'], new Date('2026-04-01T00:00:00Z'));

    const result = collectCorpus(root, { home, now });
    expect(result.firstRun).toBe(true);
    expect(result.sinceIso).toBe(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString());
    const corpus = JSON.parse(fs.readFileSync(result.corpusPath, 'utf-8'));
    expect(corpus.sessions.map((s: { id: string }) => s.id)).toEqual(['recent']);
  });
});

// ===========================================================================
describe('Threshold filter honours config', () => {
  it('with distilThresholdN: 3, only the occurrences-3 candidate proposes; one counted below-threshold', () => {
    const root = makeProject('threshold', { pulse: { distilThresholdN: 3 } });
    const counts = proposeFromCandidates(root, [
      cand({ pattern: 'twice only', occurrences: 2 }),
      cand({ pattern: 'three times', occurrences: 3, proposedText: 'A different addition.' }),
    ]);
    expect(counts.proposed).toBe(1);
    expect(counts.belowThreshold).toBe(1);
    const report = fs.readFileSync(pulsePath(root, 'suggestions.md'), 'utf-8');
    expect(report).toContain('three times');
    expect(report).not.toContain('twice only');
    expect(report).toContain('1 below-threshold');
  });
});

// ===========================================================================
describe('Covered and dismissed candidates dropped', () => {
  it('a candidate already in environment.md and one matching an unexpired dismissal are counted by reason', () => {
    const root = makeProject('covered-dismissed');
    fs.writeFileSync(
      path.join(root, '.cortex', 'cerebrum', 'environment.md'),
      '# Environment\n\nChrome profile: profile-X\n',
      'utf-8',
    );
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(
      pulsePath(root, 'dismissed.md'),
      `---
kind: pulse-dismissed
generated: 2026-07-01T00:00:00Z
loop: cortex-init
---

## S-002: never suggest emoji commit style

**Dismissed:** 2026-07-01T00:00:00Z
**Expires:** ${future}
`,
      'utf-8',
    );

    const counts = proposeFromCandidates(root, [
      cand({ pattern: 'chrome profile', proposedText: 'Chrome profile: profile-X' }),
      cand({ pattern: 'never suggest emoji commit style', proposedText: 'Use emoji in commits.' }),
      cand({ pattern: 'fresh pattern', proposedText: 'Entirely new knowledge.' }),
    ]);
    expect(counts.covered).toBe(1);
    expect(counts.dismissed).toBe(1);
    expect(counts.proposed).toBe(1);
    const report = fs.readFileSync(pulsePath(root, 'suggestions.md'), 'utf-8');
    expect(report).toContain('1 covered by cerebrum');
    expect(report).toContain('1 dismissed (unexpired)');
    expect(report).toContain('fresh pattern');
  });

  it('an EXPIRED dismissal no longer suppresses (snooze, not ban)', () => {
    const root = makeProject('expired-dismissal');
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(
      pulsePath(root, 'dismissed.md'),
      `---
kind: pulse-dismissed
generated: 2026-07-01T00:00:00Z
loop: cortex-init
---

## S-002: resurfacing pattern

**Dismissed:** 2026-01-01T00:00:00Z
**Expires:** ${past}
`,
      'utf-8',
    );
    const counts = proposeFromCandidates(root, [cand({ pattern: 'resurfacing pattern' })]);
    expect(counts.dismissed).toBe(0);
    expect(counts.proposed).toBe(1);
  });
});

// ===========================================================================
describe('Ids allocated from the shared counter, provenance attached', () => {
  it('counter at 7 + two passing candidates → S-008 and S-009 with distil provenance; counter reads 9', () => {
    const root = makeProject('ids');
    fs.writeFileSync(pulsePath(root, '.suggestion-counter'), '7', 'utf-8');
    proposeFromCandidates(root, [
      cand({ pattern: 'first pattern', sessionIds: ['sess-a', 'sess-b'] }),
      cand({ pattern: 'second pattern', proposedText: 'Other text.', sessionIds: ['sess-c'] }),
    ]);
    const report = fs.readFileSync(pulsePath(root, 'suggestions.md'), 'utf-8');
    expect(report).toContain('## S-008: first pattern');
    expect(report).toContain('## S-009: second pattern');
    expect(report).toContain('**Source:** distil (sessions: sess-a, sess-b)');
    expect(report).toContain('**Source:** distil (sessions: sess-c)');
    expect(fs.readFileSync(pulsePath(root, '.suggestion-counter'), 'utf-8').trim()).toBe('9');
  });
});

// ===========================================================================
describe('Pending proposals keep their ids', () => {
  const PRIOR = `---
kind: pulse-suggestions
generated: 2026-06-21T00:00:00Z
loop: cortex-pulse-distil
---

# Distil suggestions

## S-008: recurring pattern

**Source:** distil (sessions: sess-old)
**Target:** .cortex/cerebrum/preferences.md
**Pattern:** recurring pattern
**Occurrences:** 3
**Confidence:** high

**Proposed addition:**

\`\`\`
Old proposed text.
\`\`\`
`;

  it('a still-pending S-008 whose pattern recurs is carried forward with its id and Source', () => {
    const root = makeProject('carry');
    fs.writeFileSync(pulsePath(root, 'suggestions.md'), PRIOR, 'utf-8');
    fs.writeFileSync(pulsePath(root, '.suggestion-counter'), '8', 'utf-8');

    const counts = proposeFromCandidates(root, [
      cand({ pattern: 'recurring pattern', sessionIds: ['sess-new'], proposedText: 'Refreshed text.' }),
      cand({ pattern: 'brand new pattern', proposedText: 'New knowledge.' }),
    ]);
    expect(counts.carried).toBe(1);
    const report = fs.readFileSync(pulsePath(root, 'suggestions.md'), 'utf-8');
    expect(report).toContain('## S-008: recurring pattern');
    // Carried sections keep their original Source (no provenance churn).
    expect(report).toContain('**Source:** distil (sessions: sess-old)');
    expect(report).toContain('## S-009: brand new pattern');
    expect(fs.readFileSync(pulsePath(root, '.suggestion-counter'), 'utf-8').trim()).toBe('9');
  });

  it('an already-decided prior section is NOT carried forward (only the still-pending carry)', () => {
    const root = makeProject('carry-decided');
    fs.writeFileSync(
      pulsePath(root, 'suggestions.md'),
      PRIOR.replace('**Pattern:** recurring pattern', '**Status:** accepted\n**Pattern:** recurring pattern'),
      'utf-8',
    );
    fs.writeFileSync(pulsePath(root, '.suggestion-counter'), '8', 'utf-8');
    const counts = proposeFromCandidates(root, [cand({ pattern: 'recurring pattern' })]);
    expect(counts.carried).toBe(0);
    const report = fs.readFileSync(pulsePath(root, 'suggestions.md'), 'utf-8');
    expect(report).toContain('## S-009: recurring pattern'); // fresh id, not the decided S-008
  });
});

// ===========================================================================
describe('Subprocess degradation', () => {
  it('no claude binary and no --no-llm → exit 0, report states the skip, collect output retained', async () => {
    const root = makeProject('degrade');
    const home = tmp('degrade-home');
    writeTranscript(home, root, 'sess-1', ['use pnpm please']);

    const code = await runDistil(root, { home, claudeBin: path.join(tmp('degrade-bin'), 'claude') });
    expect(code).toBe(0);
    const report = fs.readFileSync(pulsePath(root, 'suggestions.md'), 'utf-8');
    expect(report).toMatch(/judgment pass skipped/i);
    expect(report).toContain('.session-corpus.json');
    // Collect output is retained for the scheduled skill run.
    expect(fs.existsSync(pulsePath(root, CORPUS_FILE))).toBe(true);
    // The window stays open: .distil-last-run is NOT advanced by a degraded run.
    expect(fs.existsSync(pulsePath(root, DISTIL_LAST_RUN_FILE))).toBe(false);
  }, TEST_TIMEOUT);

  it('--no-llm degrades identically and preserves still-pending proposals verbatim', async () => {
    const root = makeProject('degrade-nollm');
    const home = tmp('degrade-nollm-home');
    fs.writeFileSync(
      pulsePath(root, 'suggestions.md'),
      `---
kind: pulse-suggestions
generated: 2026-06-21T00:00:00Z
loop: cortex-pulse-distil
---

# Distil suggestions

## S-004: pending survivor

**Source:** distil (sessions: sess-z)
**Target:** .cortex/cerebrum/preferences.md
**Pattern:** pending survivor

**Proposed addition:**

\`\`\`
Keep me.
\`\`\`
`,
      'utf-8',
    );
    const code = await runDistil(root, { home, noLlm: true });
    expect(code).toBe(0);
    const report = fs.readFileSync(pulsePath(root, 'suggestions.md'), 'utf-8');
    expect(report).toContain('## S-004: pending survivor');
    expect(report).toContain('Keep me.');
    expect(report).toContain('--no-llm');
  }, TEST_TIMEOUT);

  it('an auth failure is NAMED (exit 3, message says authenticate)', async () => {
    const root = makeProject('degrade-auth');
    const home = tmp('degrade-auth-home');
    const bin = tmp('degrade-auth-bin');
    authFailStub(bin);
    const code = await runDistil(root, { home, claudeBin: path.join(bin, 'claude') });
    expect(code).toBe(3);
    const report = fs.readFileSync(pulsePath(root, 'suggestions.md'), 'utf-8');
    expect(report).toMatch(/not authenticated/i);
    expect(report).toMatch(/\/login/);
  }, TEST_TIMEOUT);
});

// ===========================================================================
describe('Only pulse files written', () => {
  it('a full bare run touches only suggestions.md, .session-corpus.json, .distil-last-run, .suggestion-counter', async () => {
    const root = makeProject('blast');
    const home = tmp('blast-home');
    fs.writeFileSync(path.join(root, '.cortex', 'cerebrum', 'environment.md'), '# Environment\n', 'utf-8');
    fs.writeFileSync(path.join(root, 'app.ts'), 'export const a = 1;\n', 'utf-8');
    writeTranscript(home, root, 'sess-1', ['always use pnpm']);
    const bin = tmp('blast-bin');
    const stub = writeExecutable(
      path.join(bin, 'claude'),
      `#!/bin/sh
cat <<'JSON'
[{"pattern":"use pnpm","occurrences":4,"sessionIds":["sess-1"],"proposedTarget":".cortex/cerebrum/preferences.md","proposedText":"Always use pnpm.","confidence":"high"}]
JSON
`,
    );

    const before = snapshotTree(root);
    const code = await runDistil(root, { home, claudeBin: stub });
    expect(code).toBe(0);
    const after = snapshotTree(root);

    const allowed = new Set(
      ['suggestions.md', CORPUS_FILE, DISTIL_LAST_RUN_FILE, '.suggestion-counter'].map((f) =>
        path.join('.cortex', 'pulse', f),
      ),
    );
    const keys = new Set([...before.keys(), ...after.keys()]);
    for (const key of keys) {
      if (allowed.has(key)) continue;
      expect(after.get(key), `unexpected change to ${key}`).toBe(before.get(key));
    }
    // And the run actually proposed + recorded its moment.
    expect(after.get(path.join('.cortex', 'pulse', 'suggestions.md'))).toContain('S-001');
    expect(after.has(path.join('.cortex', 'pulse', DISTIL_LAST_RUN_FILE))).toBe(true);
  }, TEST_TIMEOUT);
});

// ===========================================================================
describe('Malformed candidates are skipped and counted (Rule 2)', () => {
  it('drops non-conformant shapes, counts them, and still proposes the valid one', () => {
    const root = makeProject('malformed');
    const counts = proposeFromCandidates(root, [
      'not an object',
      cand({ pattern: '' }), // empty pattern
      cand({ occurrences: 'three' as unknown as number }), // wrong type
      cand({ sessionIds: 'sess-a' as unknown as string[] }), // not a list
      { pattern: 'no target', occurrences: 3, sessionIds: [], proposedText: 'x', confidence: 1 },
      // Rule 5: a target the review gate would refuse is malformed judgment output.
      cand({ pattern: 'bad target', proposedTarget: 'src/schema/validate.ts' }),
      cand({ pattern: 'escape target', proposedTarget: '.cortex/cerebrum/../../etc/evil.md' }),
      cand({ pattern: 'the good one' }),
    ]);
    expect(counts.malformed).toBe(7);
    expect(counts.proposed).toBe(1);
    const report = fs.readFileSync(pulsePath(root, 'suggestions.md'), 'utf-8');
    expect(report).toContain('7 malformed');
    expect(report).toContain('the good one');
  });

  it('validateDistilCandidate accepts the exact Rule 2 shape', () => {
    expect(validateDistilCandidate(cand())).not.toBeNull();
    expect(validateDistilCandidate(cand({ confidence: 0.9 }))).not.toBeNull();
    expect(validateDistilCandidate(cand({ confidence: undefined as unknown as string }))).toBeNull();
  });

  it('an unreadable/non-array candidates file exits 1 via --propose', async () => {
    const root = makeProject('bad-file');
    expect(await runDistil(root, { proposeFile: path.join(root, 'missing.json') })).toBe(1);
    const notArray = path.join(root, 'not-array.json');
    fs.writeFileSync(notArray, '{"pattern":"x"}', 'utf-8');
    expect(await runDistil(root, { proposeFile: notArray })).toBe(1);
  });
});

// ===========================================================================
describe('Always-write: a quiet week still writes the report', () => {
  it('zero candidates → fresh header + "No new patterns this cycle."', () => {
    const root = makeProject('quiet');
    proposeFromCandidates(root, []);
    const report = fs.readFileSync(pulsePath(root, 'suggestions.md'), 'utf-8');
    const parsed = matter(report);
    expect(parsed.data['kind']).toBe('pulse-suggestions');
    expect(parsed.data['loop']).toBe('cortex-pulse-distil');
    expect(report).toContain('No new patterns this cycle.');
    // Rule 7: the successful proposing run records its moment.
    expect(fs.existsSync(pulsePath(root, DISTIL_LAST_RUN_FILE))).toBe(true);
  });
});

// ===========================================================================
// The shipped SKILL.md bundle — prompt content pinned by string assertions
// (spec Notes; same convention as atlas.ingest-skill).
// ===========================================================================
describe('Shipped skills/cortex-pulse-distil/SKILL.md is pinned', () => {
  const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const SKILL_PATH = path.join(PKG_ROOT, 'skills', 'cortex-pulse-distil', 'SKILL.md');
  const raw = fs.readFileSync(SKILL_PATH, 'utf-8');
  const parsed = matter(raw);
  const body = parsed.content;

  it('ships at the package root with name: cortex-pulse-distil', () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
    expect(parsed.data['name']).toBe('cortex-pulse-distil');
    expect(String(parsed.data['description'] ?? '')).toMatch(/distil/i);
  });

  it('instructs: run --collect, judge IN-SESSION (never a nested claude, never bare), scratchpad JSON, run --propose', () => {
    expect(body).toContain('cortex pulse-distil --collect');
    expect(body).toContain('.cortex/pulse/.session-corpus.json');
    expect(body).toMatch(/in this session/i);
    expect(body).toMatch(/never spawn a nested\s+`claude` subprocess/i);
    expect(body).toMatch(/never run bare `cortex pulse-distil`/i);
    expect(body).toContain('scratchpad');
    expect(body).toContain('cortex pulse-distil --propose');
  });

  it('pins the candidate JSON contract and conservative extraction', () => {
    for (const field of ['"pattern"', '"occurrences"', '"sessionIds"', '"proposedTarget"', '"proposedText"', '"confidence"']) {
      expect(body).toContain(field);
    }
    expect(body).toMatch(/conservative/i);
    expect(body).toMatch(/one-offs are filtered/i);
    expect(body).toMatch(/cites? the session ids/i);
  });

  it('pins the propose-don\'t-mutate boundary', () => {
    expect(body).toMatch(/never mutate anything outside `\.cortex\/pulse\/`/i);
    expect(body).toMatch(/never write into\s*`\.cortex\/cerebrum\/`/i);
    expect(body).toContain('cortex pulse-list');
    expect(body).toContain('cortex pulse-accept');
  });
});

// ===========================================================================
// §4.5 fence grammar (B-003) — distil's writer picks a longer outer fence
// ===========================================================================
describe('Proposals whose text contains fences get a longer outer fence (B-003)', () => {
  it('a proposedText carrying a triple-backtick example is wrapped in four backticks and survives byte-exact', () => {
    const root = makeProject('b003-writer');
    const text = 'Always run:\n\n```bash\npnpm test\n```';
    proposeFromCandidates(root, [
      { pattern: 'fenced pattern', occurrences: 4, sessionIds: ['s1'], proposedTarget: '.cortex/cerebrum/preferences.md', proposedText: text, confidence: 'high' },
    ]);
    const report = fs.readFileSync(pulsePath(root, 'suggestions.md'), 'utf-8');
    expect(report).toContain('**Proposed addition:**\n\n````\n' + text + '\n````');
  });
});
