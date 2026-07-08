/**
 * Spec-level tests — insight.gaps-loop (the session-observation capturer). Each
 * acceptance criterion becomes a labelled test driving the deterministic
 * `--propose` close (`proposeRoutes`) with a fixture classification.json, then
 * asserting the prose writes, the rewrite-in-place + `## Corrections` log, the
 * typed pulse proposals, the write-lane refusal, and the `insight/_index.md`
 * maintenance. Also confirms the written proposals pass `check.pulse` and the
 * prose passes `check.insight-prose`, and pins the two distil-coordination
 * amendments (v2 design §6 / spec Rule 7). Sandboxed tmp projects; a fixed
 * `now` so provenance trailers are byte-exact.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { proposeRoutes, runGaps } from '../../../src/insight/gaps.js';
import { proposeFromCandidates } from '../../../src/pulse/distil.js';
import { readSuggestionCounter } from '../../../src/pulse/suggestion-ids.js';
import { checkPulse } from '../../../src/schema/checks/pulse.js';
import { checkInsightProse } from '../../../src/schema/checks/insight.js';
import { INSIGHT_INDEX_TEMPLATE } from '../../../src/cli/templates.js';

const NOW = new Date('2026-07-06T00:00:00.000Z');
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** A .cortex tree with insight scaffolding, an empty pulse, and the S-counter at 59. */
function makeProject(label: string): string {
  const root = makeTmpDir(`gaps-${label}`);
  dirs.push(root);
  fs.mkdirSync(path.join(root, '.cortex', 'insight', 'map'), { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'compass', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.cortex', 'insight', '_index.md'), INSIGHT_INDEX_TEMPLATE, 'utf-8');
  fs.writeFileSync(
    path.join(root, '.cortex', 'cortex.config.json'),
    JSON.stringify({ schemaVersion: '2.0' }, null, 2),
    'utf-8',
  );
  // Seed the shared counter at 59 so the first allocated id is S-060 (AC ids).
  fs.writeFileSync(path.join(root, '.cortex', 'pulse', '.suggestion-counter'), '59\n', 'utf-8');
  return root;
}

const mapFile = (root: string, name: string): string => path.join(root, '.cortex', 'insight', 'map', name);
const gapsReport = (root: string): string => fs.readFileSync(path.join(root, '.cortex', 'pulse', 'insight-gaps.md'), 'utf-8');

const prose = (kind: string, topic: string, body: string): string =>
  `---\nkind: ${kind}\nupdated: 2026-07-01T00:00:00.000Z\ntopic: ${topic}\n---\n\n${body}\n`;

// ---------------------------------------------------------------------------
// Signals 1–3 append prose autonomously
// ---------------------------------------------------------------------------
describe('Signals 1–3 append prose autonomously', () => {
  it('signal 3 → appends the explanation to map/deploy.md with the provenance trailer, no pulse proposal', async () => {
    const root = makeProject('s3');
    fs.writeFileSync(mapFile(root, 'deploy.md'), prose('insight-prose', 'deploy', '# Deploy\n\nInitial notes.'), 'utf-8');

    const result = proposeRoutes(
      root,
      [{ signal: 3, sessionIds: ['sess-a1'], topic: 'deploy', text: 'We deploy from the release branch after CI is green.' }],
      { now: NOW },
    );
    expect(result.ok).toBe(true);

    const deploy = fs.readFileSync(mapFile(root, 'deploy.md'), 'utf-8');
    expect(deploy).toContain('We deploy from the release branch after CI is green.');
    expect(deploy).toContain('_(observed 2026-07-06, signal 3, sessions: sess-a1)_');

    // No pulse PROPOSAL for it (the report is always-write, but carries no `## S-`)
    // and the shared counter never advanced.
    expect(gapsReport(root)).not.toContain('## S-');
    expect(readSuggestionCounter(root)).toBe(59);

    // The prose passes check.insight-prose (no errors).
    expect(checkInsightProse(root).filter((v) => v.severity === 'error')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Signal 4-in-insight rewrites in place and logs
// ---------------------------------------------------------------------------
describe('Signal 4-in-insight rewrites in place and logs', () => {
  it('rewrites the asserting line and appends a ## Corrections entry, touching no gated file or pulse proposal', async () => {
    const root = makeProject('s4-insight');
    fs.writeFileSync(mapFile(root, 'testing.md'), prose('insight-prose', 'testing', '# Testing\n\nOur tests run with npm test in CI.'), 'utf-8');

    const result = proposeRoutes(
      root,
      [
        {
          signal: 4,
          location: 'insight',
          sessionIds: ['sess-b2'],
          topic: 'testing',
          was: 'tests run with npm test',
          now: 'tests run with pnpm test',
          why: 'we standardised on pnpm',
        },
      ],
      { now: NOW },
    );
    expect(result.ok).toBe(true);
    expect(result.counts.rewritten).toBe(1);

    const testing = fs.readFileSync(mapFile(root, 'testing.md'), 'utf-8');
    // Rewritten in place (currently-right).
    expect(testing).toContain('Our tests run with pnpm test in CI.');
    expect(testing).not.toContain('Our tests run with npm test in CI.');
    // ## Corrections log entry with the audit markers.
    expect(testing).toContain('## Corrections');
    expect(testing).toContain('**2026-07-06**');
    expect(testing).toContain('_was:_ "tests run with npm test"');
    expect(testing).toContain('_now:_ "tests run with pnpm test"');
    expect(testing).toContain('_why:_ we standardised on pnpm');
    expect(testing).toContain('sessions: sess-b2');

    // No gated write, no pulse proposal, no id burned.
    expect(gapsReport(root)).not.toContain('## S-');
    expect(readSuggestionCounter(root)).toBe(59);
    expect(checkInsightProse(root).filter((v) => v.severity === 'error')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Signal 4-in-gated + signal 5 become typed proposals, never direct writes
// ---------------------------------------------------------------------------
describe('Signals 4-gated and 5 route through the typed pulse gate', () => {
  const RULE_REL = '.cortex/compass/rules/R-014-no-camelcase-columns.md';
  const RULE_BODY = '---\nid: R-014\n---\n\n# R-014 — no camelCase columns\n\nColumns MUST be snake_case, never camelCase.\n';

  it('signal 4-in-gated → S-060 gated-layer-update edit proposal; the rule file is unchanged', async () => {
    const root = makeProject('s4-gated');
    fs.writeFileSync(path.join(root, RULE_REL), RULE_BODY, 'utf-8');

    const result = proposeRoutes(
      root,
      [
        {
          signal: 4,
          location: 'gated',
          sessionIds: ['sess-c3'],
          title: 'R-014 permits camelCase for view columns',
          target: RULE_REL,
          current: 'Columns MUST be snake_case, never camelCase.',
          replacement: 'Table columns MUST be snake_case; view columns MAY be camelCase.',
        },
      ],
      { now: NOW },
    );
    expect(result.ok).toBe(true);
    expect(result.counts.gated).toBe(1);

    const report = gapsReport(root);
    expect(report).toContain('## S-060:');
    expect(report).toContain('**Type:** gated-layer-update');
    expect(report).toContain(`**Target:** ${RULE_REL}`);
    expect(report).toContain('**Proposed edit:**');
    expect(report).toContain('current:');
    expect(report).toContain('replacement:');

    // The gate applies it, not this loop — the rule file is byte-unchanged.
    expect(fs.readFileSync(path.join(root, RULE_REL), 'utf-8')).toBe(RULE_BODY);
    expect(readSuggestionCounter(root)).toBe(60);

    // The written proposal passes check.pulse (no errors).
    expect((await checkPulse(root)).filter((v) => v.severity === 'error')).toHaveLength(0);
  });

  it('signal 5 → S-061 user-directed-capture carrying the user words and a best-guess Target', async () => {
    const root = makeProject('s5');
    fs.writeFileSync(path.join(root, RULE_REL), RULE_BODY, 'utf-8');

    // A gated correction then a memory-commit, so the AC ids fall out (S-060, S-061).
    const result = proposeRoutes(
      root,
      [
        {
          signal: 4,
          location: 'gated',
          sessionIds: ['sess-c3'],
          target: RULE_REL,
          current: 'Columns MUST be snake_case, never camelCase.',
          replacement: 'Columns MUST be snake_case.',
        },
        { signal: 5, sessionIds: ['sess-d4'], text: 'we always deploy on Fridays' },
      ],
      { now: NOW },
    );
    expect(result.ok).toBe(true);
    expect(result.counts.captured).toBe(1);

    const report = gapsReport(root);
    expect(report).toContain('## S-061:');
    expect(report).toContain('**Type:** user-directed-capture');
    expect(report).toContain('we always deploy on Fridays'); // the user's own words
    // A best-guess, human-editable landing layer is present.
    expect(report).toMatch(/## S-061:[\s\S]*\*\*Target:\*\* \S+/);
    expect((await checkPulse(root)).filter((v) => v.severity === 'error')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// --propose refuses a JSON path (write-lane enforcement)
// ---------------------------------------------------------------------------
describe('--propose refuses a JSON path (write-lane enforcement)', () => {
  it('refuses a map/graph.json prose target — the gaps loop writes only .md', async () => {
    const root = makeProject('json-refusal');
    const result = proposeRoutes(
      root,
      [{ signal: 3, sessionIds: ['sess-x'], file: 'map/graph.json', text: 'this should never land' }],
      { now: NOW },
    );
    expect(result.ok).toBe(false);
    expect(result.refusal).toMatch(/\.json|out-of-lane/i);
    // Nothing was written to the map lane and no report was produced by the refusal.
    expect(fs.existsSync(mapFile(root, 'graph.json'))).toBe(false);

    // The same refusal surfaces as exit 1 through the CLI entry.
    const scratch = path.join(root, 'classification.json');
    fs.writeFileSync(scratch, JSON.stringify([{ signal: 3, sessionIds: ['sess-x'], file: 'map/graph.json', text: 'x' }]), 'utf-8');
    expect(await runGaps(root, { proposeFile: scratch, now: NOW })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// New-file creation maintains the index
// ---------------------------------------------------------------------------
describe('New-file creation maintains the index', () => {
  it('creating map/observability.md adds one line to insight/_index.md What\'s here, touching nothing else outside map/', async () => {
    const root = makeProject('newfile');
    const result = proposeRoutes(
      root,
      [{ signal: 1, sessionIds: ['sess-o1'], topic: 'observability', text: 'Traces go to the otel collector on :4317.' }],
      { now: NOW },
    );
    expect(result.ok).toBe(true);
    expect(result.counts.created).toBe(1);

    // The new prose file exists and is well-formed.
    expect(fs.existsSync(mapFile(root, 'observability.md'))).toBe(true);
    expect(checkInsightProse(root).filter((v) => v.severity === 'error')).toHaveLength(0);

    // The index gained exactly one bullet for it, under What's here.
    const index = fs.readFileSync(path.join(root, '.cortex', 'insight', '_index.md'), 'utf-8');
    expect(index).toContain('map/observability.md');
    const bullets = index.split('\n').filter((l) => l.includes('map/observability.md'));
    expect(bullets).toHaveLength(1);
    // The trust-model line is intact (check.insight-index still satisfied).
    expect(index.toLowerCase()).toContain('ungated');
    expect(index.toLowerCase()).toContain('cortex insight');
  });
});

// ---------------------------------------------------------------------------
// Distil coordination (spec Rule 7 / v2 design §6)
// ---------------------------------------------------------------------------
describe('Distil does not double-propose covered insight content', () => {
  it('a pattern already in map/conventions.md → distil proposes a promotion of that file, not a fresh rule-candidate', () => {
    const root = makeProject('distil-coord');
    const covered = 'Always run pnpm, never npm, for every package operation.';
    fs.writeFileSync(mapFile(root, 'conventions.md'), prose('insight-prose', 'conventions', `# Conventions\n\n${covered}`), 'utf-8');

    const counts = proposeFromCandidates(
      root,
      [
        {
          pattern: 'user keeps correcting npm → pnpm',
          occurrences: 4,
          sessionIds: ['sess-1', 'sess-2'],
          proposedTarget: '.cortex/compass/preferences.md',
          proposedText: covered,
          confidence: 'high',
        },
      ],
      { now: NOW },
    );
    expect(counts.proposed).toBe(1);

    const suggestions = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'suggestions.md'), 'utf-8');
    expect(suggestions).toContain('**Type:** promotion');
    expect(suggestions).toContain('.cortex/insight/map/conventions.md'); // references the insight file
    expect(suggestions).not.toContain('rule-candidate');
  });

  it('the shipped distil skill is amended to skip explicit memory-commit utterances (signal-5 territory)', () => {
    const skill = fs.readFileSync(
      path.join(process.cwd(), 'skills', 'cortex-pulse-distil', 'SKILL.md'),
      'utf-8',
    );
    expect(skill).toContain('Skip explicit memory-commit utterances');
    expect(skill).toContain('cortex-loop-insight-gaps');
  });
});
