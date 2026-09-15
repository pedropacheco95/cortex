/**
 * Atomic tests — the shared evidence writer (`atlas.evidence` Rule 4; schema
 * §4.3): `evidenceFilePayload` renders the contract frontmatter in the Rule 1
 * field order and round-trips through gray-matter, `ensureEvidenceDir` creates
 * the directory with its `_index.md` exactly once, and
 * `latestEvidenceMatching` finds the newest `*-<suffix>.md`. Pure tmp roots.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { makeTmpDir, cleanTmp } from '../../fixtures/hooks-harness.js';
import {
  EVIDENCE_KINDS,
  EVIDENCE_DIR,
  evidenceFilePayload,
  ensureEvidenceDir,
  latestEvidenceMatching,
  type EvidenceFields,
} from '../../../src/atlas/evidence.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`atlas-evidence-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

const NOW = new Date('2026-09-15T15:58:00.000Z');

function fields(overrides: Partial<EvidenceFields> = {}): EvidenceFields {
  return {
    slug: 'usage',
    title: 'Cortex usage over 41 sessions (2026-07-01 to 2026-09-15)',
    kind: 'measurement',
    instrument: 'pulse.usage',
    window: { from: '2026-07-01', to: '2026-09-15', sessions: 41 },
    findings: [
      { metric: 'searches.knowledge', value: 54 },
      { metric: 'insight.file', value: 2, unit: 'invocations' },
      { metric: 'note', value: '55' },
    ],
    bearsOn: ['schema:§5', 'pulse.usage'],
    body: '## Window\n\nComputed over 41 sessions.\n',
    ...overrides,
  };
}

describe('R-001 — Core makes no LLM calls', () => {
  it('evidence.ts imports no LLM SDK and spawns nothing', () => {
    const src = fs.readFileSync(path.resolve('src/atlas/evidence.ts'), 'utf-8');
    expect(src).not.toMatch(/@anthropic-ai\/|['"]openai['"]|['"]@google\/genai['"]|['"]cohere-ai['"]/);
    expect(src).not.toMatch(/child_process|node:child_process|node-fetch|['"]https?['"]/);
  });
});

describe('An evidence file has the contract frontmatter (the payload half)', () => {
  it('targets .cortex/atlas/evidence/<date>-<slug>.md and renders the Rule 1 field order', () => {
    const { targetRel, payload } = evidenceFilePayload(fields(), NOW);

    expect(targetRel).toBe('.cortex/atlas/evidence/2026-09-15-usage.md');
    expect(payload).toBe(
      [
        '---',
        'id: evidence.2026-09-15-usage',
        'title: "Cortex usage over 41 sessions (2026-07-01 to 2026-09-15)"',
        'date: 2026-09-15T15:58:00.000Z',
        'kind: measurement',
        'instrument: pulse.usage',
        'window:',
        '  from: 2026-07-01',
        '  to: 2026-09-15',
        '  sessions: 41',
        'findings:',
        '  - metric: searches.knowledge',
        '    value: 54',
        '  - metric: insight.file',
        '    value: 2',
        '    unit: invocations',
        '  - metric: note',
        '    value: "55"',
        'bears_on:',
        '  - "schema:§5"',
        '  - pulse.usage',
        '---',
        '',
        '## Window',
        '',
        'Computed over 41 sessions.',
        '',
      ].join('\n'),
    );
  });

  it('round-trips through gray-matter to the same fields; a numeric-looking string stays a string', () => {
    const { payload } = evidenceFilePayload(fields(), NOW);
    const parsed = matter(payload);
    const data = parsed.data as Record<string, unknown>;

    expect(data['id']).toBe('evidence.2026-09-15-usage');
    expect(data['title']).toBe('Cortex usage over 41 sessions (2026-07-01 to 2026-09-15)');
    expect(data['kind']).toBe('measurement');
    expect(data['instrument']).toBe('pulse.usage');
    expect((data['window'] as Record<string, unknown>)['sessions']).toBe(41);
    expect(data['findings']).toEqual([
      { metric: 'searches.knowledge', value: 54 },
      { metric: 'insight.file', value: 2, unit: 'invocations' },
      { metric: 'note', value: '55' },
    ]);
    expect(data['bears_on']).toEqual(['schema:§5', 'pulse.usage']);
    expect('supersedes' in data).toBe(false);
    expect('provenance' in data).toBe(false);
    expect(parsed.content.replace(/^\n/, '')).toBe('## Window\n\nComputed over 41 sessions.\n');
  });

  it('emits supersedes and provenance after bears_on only when non-empty, and omits window.sessions when absent', () => {
    const { payload } = evidenceFilePayload(
      fields({
        window: { from: '2026-09-01T10:00:00.000Z', to: '2026-09-14T10:00:00.000Z' },
        supersedes: ['2026-09-01-usage.md'],
        provenance: ['claude-sessions/u/s1', 'claude-sessions/u/s2'],
      }),
      NOW,
    );
    const data = matter(payload).data as Record<string, unknown>;

    expect(payload).toMatch(/\nbears_on:\n  - "schema:§5"\n  - pulse\.usage\nsupersedes:\n  - 2026-09-01-usage\.md\nprovenance:\n  - derives_from: claude-sessions\/u\/s1\n  - derives_from: claude-sessions\/u\/s2\n---\n/);
    expect(payload).not.toMatch(/sessions:/);
    expect(data['supersedes']).toEqual(['2026-09-01-usage.md']);
    expect(data['provenance']).toEqual([{ derives_from: 'claude-sessions/u/s1' }, { derives_from: 'claude-sessions/u/s2' }]);
  });

  it('empty supersedes/provenance lists emit no key; the body always ends with exactly one newline', () => {
    const { payload } = evidenceFilePayload(fields({ supersedes: [], provenance: [], body: 'no trailing newline' }), NOW);
    expect(payload).not.toMatch(/supersedes|provenance/);
    expect(payload.endsWith('\n\nno trailing newline\n')).toBe(true);
    expect(payload.endsWith('\n\n')).toBe(false);
  });

  it('exports the kind enum and the directory constant', () => {
    expect([...EVIDENCE_KINDS]).toEqual(['measurement', 'experiment', 'audit']);
    expect(EVIDENCE_DIR).toBe('atlas/evidence');
  });
});

describe('Only atlas/evidence is written by the producers (the ensureEvidenceDir half)', () => {
  it('creates .cortex/atlas/evidence/ with an _index.md in the §7.1 shape when absent', () => {
    const root = tmp('ensure');
    const dir = ensureEvidenceDir(root);

    expect(dir).toBe(path.join(root, '.cortex', 'atlas', 'evidence'));
    expect(fs.existsSync(dir)).toBe(true);
    const index = fs.readFileSync(path.join(dir, '_index.md'), 'utf-8');
    expect(index).toMatch(/^# Evidence — index\n/);
    expect(index).toContain('**Read this when:**');
    expect(index).toContain("**What's here:**");
    expect(index).toContain('**How to navigate:**');
    expect(index).toContain('bears_on');
    expect(index).toContain('supersedes');
  });

  it('never overwrites an existing _index.md and creates nothing else under .cortex/', () => {
    const root = tmp('ensure-idempotent');
    const dir = path.join(root, '.cortex', 'atlas', 'evidence');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '_index.md'), 'human-edited\n', 'utf-8');

    ensureEvidenceDir(root);
    ensureEvidenceDir(root);

    expect(fs.readFileSync(path.join(dir, '_index.md'), 'utf-8')).toBe('human-edited\n');
    expect(fs.readdirSync(path.join(root, '.cortex')).sort()).toEqual(['atlas']);
    expect(fs.readdirSync(path.join(root, '.cortex', 'atlas')).sort()).toEqual(['evidence']);
    expect(fs.readdirSync(dir)).toEqual(['_index.md']);
  });
});

describe('latestEvidenceMatching — the newest *-<suffix>.md', () => {
  it('returns undefined when the directory is absent or holds no match', () => {
    const root = tmp('latest-absent');
    expect(latestEvidenceMatching(root, 'usage')).toBeUndefined();
    ensureEvidenceDir(root);
    fs.writeFileSync(path.join(root, '.cortex', 'atlas', 'evidence', '2026-09-01-audit.md'), '', 'utf-8');
    expect(latestEvidenceMatching(root, 'usage')).toBeUndefined();
  });

  it('returns the lexicographically greatest basename ending in -<suffix>.md, ignoring other suffixes and _index.md', () => {
    const root = tmp('latest');
    const dir = ensureEvidenceDir(root);
    for (const name of ['2026-09-01-usage.md', '2026-09-10-usage.md', '2026-09-12-audit.md', '2026-09-03-usage.md', '2026-09-11-not-usage.txt']) {
      fs.writeFileSync(path.join(dir, name), '', 'utf-8');
    }
    expect(latestEvidenceMatching(root, 'usage')).toBe('2026-09-10-usage.md');
    expect(latestEvidenceMatching(root, 'audit')).toBe('2026-09-12-audit.md');
  });
});
