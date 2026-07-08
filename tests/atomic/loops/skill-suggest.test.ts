/**
 * Atomic tests — loops.skill-suggest (spec Acceptance Criteria as labelled
 * describes, plus Rule 2/3 filter coverage and the shipped SKILL.md pinning).
 * Sandboxed tmp projects with fake injected homes; stub claude executables for
 * the bare-CLI mode — never a real LLM, never the real ~/.claude.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { makeTmpDir, cleanTmp, snapshotTree, writeExecutable } from '../../fixtures/init-harness.js';
import {
  proposeSkillCandidates,
  runSkillSuggest,
  validateSkillCandidate,
  SKILL_SUGGESTIONS_FILE,
} from '../../../src/loops/skill-suggest.js';
import { proposeFromCandidates, CORPUS_FILE } from '../../../src/pulse/distil.js';
import type { CollectResult } from '../../../src/pulse/distil.js';
import { projectSlug } from '../../../src/sessions/read.js';

const TEST_TIMEOUT = 30_000;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`skill-suggest-${label}`);
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

function makeProject(label: string, config: Record<string, unknown> = {}): string {
  const root = tmp(label);
  fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'compass'), { recursive: true });
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

function writeCorpus(root: string): void {
  fs.writeFileSync(
    pulsePath(root, CORPUS_FILE),
    JSON.stringify({ kind: 'session-corpus', generated: new Date().toISOString(), since: '2026-06-01T00:00:00Z', sessions: [] }),
    'utf-8',
  );
}

function skillDraft(name: string): string {
  return `---\nname: ${name}\ndescription: Runs the ${name} workflow in one invocation.\n---\n\n# ${name}\n\n1. Step one.\n2. Step two.\n`;
}

function cand(over: Record<string, unknown> = {}): Record<string, unknown> {
  const name = (over['workflowName'] as string) ?? 'deploy-preview';
  return {
    workflowName: name,
    occurrences: 3,
    sessionIds: ['sess-a', 'sess-b'],
    draftSkillMd: skillDraft(name),
    ...over,
  };
}

const fakeCollectResult: CollectResult = {
  corpusPath: '',
  sessionCount: 0,
  messageCount: 0,
  sinceIso: '2026-06-01T00:00:00Z',
  firstRun: false,
};

// ===========================================================================
describe('Reuses the shared corpus', () => {
  it('a fresh .session-corpus.json → the shared collect is NOT invoked (session-reading untouched)', async () => {
    const root = makeProject('reuse');
    writeCorpus(root);
    const collectFn = vi.fn(() => fakeCollectResult);
    const code = await runSkillSuggest(root, { noLlm: true, collectFn });
    expect(code).toBe(0);
    expect(collectFn).not.toHaveBeenCalled();
    // The corpus was mined, not re-collected — the report was still written.
    expect(fs.existsSync(pulsePath(root, SKILL_SUGGESTIONS_FILE))).toBe(true);
  }, TEST_TIMEOUT);

  it('an absent corpus → the shared collect IS invoked first (spec Rule 1)', async () => {
    const root = makeProject('absent');
    const collectFn = vi.fn(() => {
      writeCorpus(root);
      return fakeCollectResult;
    });
    const code = await runSkillSuggest(root, { noLlm: true, collectFn });
    expect(code).toBe(0);
    expect(collectFn).toHaveBeenCalledTimes(1);
  }, TEST_TIMEOUT);

  it("the default collect is distil's (writes the shared corpus from this project's transcripts)", async () => {
    const root = makeProject('default-collect');
    const home = tmp('default-collect-home');
    const dir = path.join(home, '.claude', 'projects', projectSlug(root));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'sess-1.jsonl'),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'deploy it again' } }) + '\n',
      'utf-8',
    );
    const code = await runSkillSuggest(root, { noLlm: true, home });
    expect(code).toBe(0);
    const corpus = JSON.parse(fs.readFileSync(pulsePath(root, CORPUS_FILE), 'utf-8'));
    expect(corpus.kind).toBe('session-corpus');
    expect(corpus.sessions.map((s: { id: string }) => s.id)).toEqual(['sess-1']);
  }, TEST_TIMEOUT);
});

// ===========================================================================
describe('Valid skill draft proposed with new-file target', () => {
  it('deploy-preview proposes an S-section targeting .claude/skills/deploy-preview/SKILL.md with the complete draft fenced', () => {
    const root = makeProject('valid');
    const counts = proposeSkillCandidates(root, [cand()]);
    expect(counts.proposed).toBe(1);
    const report = fs.readFileSync(pulsePath(root, SKILL_SUGGESTIONS_FILE), 'utf-8');
    expect(report).toContain('## S-001: deploy-preview');
    expect(report).toContain('**Target:** .claude/skills/deploy-preview/SKILL.md');
    expect(report).toContain('**Source:** skill-suggest (sessions: sess-a, sess-b)');
    // The fenced block is the complete draft SKILL.md (frontmatter + body).
    expect(report).toContain('name: deploy-preview');
    expect(report).toContain('description: Runs the deploy-preview workflow in one invocation.');
    expect(report).toContain('1. Step one.');
    const parsed = matter(report);
    expect(parsed.data['kind']).toBe('pulse-skill-suggestions');
    expect(parsed.data['loop']).toBe('cortex-loop-skill-suggest');
  });
});

// ===========================================================================
describe('Existing skill name dropped as covered', () => {
  it('a candidate named cortex-ingest (ships in the package skills/) is dropped and counted as covered', () => {
    const root = makeProject('covered-pkg');
    const counts = proposeSkillCandidates(root, [cand({ workflowName: 'cortex-ingest', draftSkillMd: skillDraft('cortex-ingest') })]);
    expect(counts.covered).toBe(1);
    expect(counts.proposed).toBe(0);
    const report = fs.readFileSync(pulsePath(root, SKILL_SUGGESTIONS_FILE), 'utf-8');
    expect(report).toContain('1 covered');
    expect(report).toContain('No new workflow patterns this cycle.');
  });

  it('a project-local .claude/skills/<name>/ dir also dedups', () => {
    const root = makeProject('covered-local');
    fs.mkdirSync(path.join(root, '.claude', 'skills', 'my-local-flow'), { recursive: true });
    const counts = proposeSkillCandidates(root, [cand({ workflowName: 'my-local-flow', draftSkillMd: skillDraft('my-local-flow') })]);
    expect(counts.covered).toBe(1);
  });
});

// ===========================================================================
describe('Malformed draft rejected', () => {
  it('a draft lacking name:, a mismatching name, a bad slug, or an empty body is skipped and counted as malformed', () => {
    const root = makeProject('malformed');
    const counts = proposeSkillCandidates(root, [
      cand({ draftSkillMd: '---\ndescription: no name here\n---\n\nBody.\n' }),
      cand({ draftSkillMd: skillDraft('some-other-name') }), // name mismatches the slug
      cand({ workflowName: 'Not A Slug!' }),
      cand({ draftSkillMd: '---\nname: deploy-preview\ndescription: ok\n---\n' }), // empty body
      cand({ draftSkillMd: `---\nname: deploy-preview\ndescription: ''\n---\n\nBody.\n` }), // empty description
    ]);
    expect(counts.malformed).toBe(5);
    expect(counts.proposed).toBe(0);
    const report = fs.readFileSync(pulsePath(root, SKILL_SUGGESTIONS_FILE), 'utf-8');
    expect(report).toContain('5 malformed');
  });

  it('validateSkillCandidate accepts the exact Rule 2 shape', () => {
    expect(validateSkillCandidate(cand())).not.toBeNull();
    expect(validateSkillCandidate(cand({ occurrences: 'lots' }))).toBeNull();
    expect(validateSkillCandidate(cand({ sessionIds: [1, 2] }))).toBeNull();
    expect(validateSkillCandidate('nope')).toBeNull();
  });
});

// ===========================================================================
describe('Shared counter, no collisions with distil', () => {
  it('distil proposals ending at S-009 → skill-suggest proposes S-010 and S-011', () => {
    const root = makeProject('counter');
    fs.writeFileSync(pulsePath(root, '.suggestion-counter'), '7', 'utf-8');
    // Distil proposes two → S-008, S-009 (its own AC), counter at 9.
    proposeFromCandidates(root, [
      { pattern: 'p one', occurrences: 3, sessionIds: ['s1'], proposedTarget: '.cortex/compass/preferences.md', proposedText: 'One.', confidence: 'high' },
      { pattern: 'p two', occurrences: 3, sessionIds: ['s1'], proposedTarget: '.cortex/compass/preferences.md', proposedText: 'Two.', confidence: 'high' },
    ]);
    const counts = proposeSkillCandidates(root, [
      cand({ workflowName: 'flow-one', draftSkillMd: skillDraft('flow-one') }),
      cand({ workflowName: 'flow-two', draftSkillMd: skillDraft('flow-two') }),
    ]);
    expect(counts.proposed).toBe(2);
    const report = fs.readFileSync(pulsePath(root, SKILL_SUGGESTIONS_FILE), 'utf-8');
    expect(report).toContain('## S-010: flow-one');
    expect(report).toContain('## S-011: flow-two');
    expect(fs.readFileSync(pulsePath(root, '.suggestion-counter'), 'utf-8').trim()).toBe('11');
  });
});

// ===========================================================================
describe('Only its own pulse files written', () => {
  it('a bare run with a fresh corpus touches only skill-suggestions.md and .suggestion-counter', async () => {
    const root = makeProject('blast');
    writeCorpus(root);
    fs.writeFileSync(path.join(root, 'app.ts'), 'export const a = 1;\n', 'utf-8');
    const bin = tmp('blast-bin');
    const stub = writeExecutable(
      path.join(bin, 'claude'),
      `#!/bin/sh
cat <<'JSON'
[{"workflowName":"deploy-preview","occurrences":4,"sessionIds":["sess-1"],"draftSkillMd":"---\\nname: deploy-preview\\ndescription: Deploys a preview.\\n---\\n\\n# deploy-preview\\n\\n1. Build.\\n2. Deploy.\\n"}]
JSON
`,
    );

    const before = snapshotTree(root);
    const code = await runSkillSuggest(root, { claudeBin: stub });
    expect(code).toBe(0);
    const after = snapshotTree(root);

    const allowed = new Set([
      path.join('.cortex', 'pulse', SKILL_SUGGESTIONS_FILE),
      path.join('.cortex', 'pulse', '.suggestion-counter'),
    ]);
    const keys = new Set([...before.keys(), ...after.keys()]);
    for (const key of keys) {
      if (allowed.has(key)) continue;
      expect(after.get(key), `unexpected change to ${key}`).toBe(before.get(key));
    }
    expect(after.get(path.join('.cortex', 'pulse', SKILL_SUGGESTIONS_FILE))).toContain('S-001: deploy-preview');
  }, TEST_TIMEOUT);
});

// ===========================================================================
describe('Deterministic filters (Rule 3): threshold and dismissal', () => {
  it('occurrences below pulse.distilThresholdN are dropped and counted', () => {
    const root = makeProject('threshold', { pulse: { distilThresholdN: 3 } });
    const counts = proposeSkillCandidates(root, [
      cand({ workflowName: 'rare-flow', occurrences: 2, draftSkillMd: skillDraft('rare-flow') }),
      cand({ workflowName: 'common-flow', occurrences: 3, draftSkillMd: skillDraft('common-flow') }),
    ]);
    expect(counts.belowThreshold).toBe(1);
    expect(counts.proposed).toBe(1);
    const report = fs.readFileSync(pulsePath(root, SKILL_SUGGESTIONS_FILE), 'utf-8');
    expect(report).toContain('common-flow');
    expect(report).not.toContain('rare-flow');
  });

  it('an unexpired dismissal suppresses the workflow; an expired one does not', () => {
    const root = makeProject('dismissed');
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(
      pulsePath(root, 'dismissed.md'),
      `---
kind: pulse-dismissed
generated: 2026-07-01T00:00:00Z
loop: cortex-init
---

## S-003: snoozed-flow

**Dismissed:** 2026-07-01T00:00:00Z
**Expires:** ${future}

## S-004: expired-flow

**Dismissed:** 2026-01-01T00:00:00Z
**Expires:** ${past}
`,
      'utf-8',
    );
    const counts = proposeSkillCandidates(root, [
      cand({ workflowName: 'snoozed-flow', draftSkillMd: skillDraft('snoozed-flow') }),
      cand({ workflowName: 'expired-flow', draftSkillMd: skillDraft('expired-flow') }),
    ]);
    expect(counts.dismissed).toBe(1);
    expect(counts.proposed).toBe(1);
    const report = fs.readFileSync(pulsePath(root, SKILL_SUGGESTIONS_FILE), 'utf-8');
    expect(report).toContain('expired-flow');
    expect(report).not.toContain('## S-001: snoozed-flow');
  });
});

// ===========================================================================
describe('Pending ids carried forward (Rule 5 — identical to distil)', () => {
  it('a still-pending workflow that recurs keeps its id and Source', () => {
    const root = makeProject('carry');
    fs.writeFileSync(
      pulsePath(root, SKILL_SUGGESTIONS_FILE),
      `---
kind: pulse-skill-suggestions
generated: 2026-06-21T00:00:00Z
loop: cortex-loop-skill-suggest
---

# Skill suggestions

## S-012: deploy-preview

**Source:** skill-suggest (sessions: sess-old)
**Target:** .claude/skills/deploy-preview/SKILL.md
**Workflow:** deploy-preview
**Occurrences:** 3

**Proposed addition:**

\`\`\`
old draft
\`\`\`
`,
      'utf-8',
    );
    fs.writeFileSync(pulsePath(root, '.suggestion-counter'), '12', 'utf-8');
    const counts = proposeSkillCandidates(root, [
      cand(), // deploy-preview recurs
      cand({ workflowName: 'brand-new-flow', draftSkillMd: skillDraft('brand-new-flow') }),
    ]);
    expect(counts.carried).toBe(1);
    const report = fs.readFileSync(pulsePath(root, SKILL_SUGGESTIONS_FILE), 'utf-8');
    expect(report).toContain('## S-012: deploy-preview');
    expect(report).toContain('**Source:** skill-suggest (sessions: sess-old)');
    expect(report).toContain('## S-013: brand-new-flow');
  });
});

// ===========================================================================
// The shipped SKILL.md bundle — prompt content pinned by string assertions.
// ===========================================================================
describe('Shipped skills/cortex-loop-skill-suggest/SKILL.md is pinned', () => {
  const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const SKILL_PATH = path.join(PKG_ROOT, 'skills', 'cortex-loop-skill-suggest', 'SKILL.md');
  const raw = fs.readFileSync(SKILL_PATH, 'utf-8');
  const parsed = matter(raw);
  const body = parsed.content;

  it('ships at the package root with name: cortex-loop-skill-suggest', () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
    expect(parsed.data['name']).toBe('cortex-loop-skill-suggest');
    expect(String(parsed.data['description'] ?? '')).toMatch(/skill-suggest/i);
  });

  it('instructs: reuse the shared corpus, judge IN-SESSION (never nested claude, never bare), scratchpad JSON, run --propose', () => {
    expect(body).toContain('.cortex/pulse/.session-corpus.json');
    expect(body).toMatch(/reused, not re-collected/i);
    expect(body).toContain('cortex loop-skill-suggest --collect');
    expect(body).toMatch(/in this session/i);
    expect(body).toMatch(/never spawn a nested\s+`claude` subprocess/i);
    expect(body).toMatch(/never\s+run bare `cortex loop-skill-suggest`/i);
    expect(body).toContain('scratchpad');
    expect(body).toContain('cortex loop-skill-suggest --propose');
  });

  it('pins the candidate JSON contract and the new-skill-only boundary', () => {
    for (const field of ['"workflowName"', '"occurrences"', '"sessionIds"', '"draftSkillMd"']) {
      expect(body).toContain(field);
    }
    expect(body).toMatch(/never create a skill yourself/i);
    expect(body).toContain('cortex pulse-accept');
    expect(body).toContain('.claude/skills/<name>/SKILL.md');
    expect(body).toMatch(/never mutate anything outside `\.cortex\/pulse\/`/i);
  });
});

// ---------------------------------------------------------------------------
// AC — Drafts containing fences get a longer outer fence (B-003 regression)
// ---------------------------------------------------------------------------
describe('Drafts containing fences get a longer outer fence (B-003 regression)', () => {
  const FENCED_DRAFT = [
    '---',
    'name: fenced-flow',
    'description: A workflow whose body carries a fenced example.',
    '---',
    '',
    '# fenced-flow',
    '',
    '```bash',
    'pnpm test',
    '```',
    '',
  ].join('\n');

  it('the emitted section wraps the payload in a fence longer than three backticks, per §4.5', () => {
    const root = makeProject('b003-fence');
    proposeSkillCandidates(root, [cand({ workflowName: 'fenced-flow', draftSkillMd: FENCED_DRAFT })]);
    const report = fs.readFileSync(pulsePath(root, SKILL_SUGGESTIONS_FILE), 'utf-8');
    // Outer fence strictly longer than the inner triple-backtick run.
    expect(report).toContain('**Proposed addition:**\n\n````\n');
    expect(report).toContain('\n````\n');
    // The inner fence survives verbatim inside the section.
    expect(report).toContain('```bash\npnpm test\n```');
  });

  it('a fenceless draft keeps the minimum three-backtick fence', () => {
    const root = makeProject('b003-plain');
    proposeSkillCandidates(root, [cand({ workflowName: 'plain-flow' })]);
    const report = fs.readFileSync(pulsePath(root, SKILL_SUGGESTIONS_FILE), 'utf-8');
    expect(report).toContain('**Proposed addition:**\n\n```\n---\nname: plain-flow');
    expect(report).not.toContain('````');
  });
});
