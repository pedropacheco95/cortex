/**
 * Spec-layer test for `pulse.usage` — the integrated slice: `runUsage` writes a
 * well-formed pulse report through the shared writer, carrying every Rule 4
 * figure with its denominator.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import matter from 'gray-matter';
import { runUsage } from '../../../src/pulse/usage.js';
import { writeSessionTranscript, toolTurn, bash, read, askUser } from '../../fixtures/sessions.js';

function project(label: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `cortex-usage-spec-${label}-`)));
  fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'reports'), { recursive: true });
  return root;
}

function tmpHome(label: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `cortex-usage-home-${label}-`)));
}

describe('pulse.usage — the report is a valid pulse report', () => {
  it('carries kind: pulse-usage and a parseable generated timestamp', async () => {
    const root = project('valid');
    const home = tmpHome('valid');
    writeSessionTranscript(home, root, 's1', [toolTurn(bash('cortex insight file src/a.ts'))]);

    const code = await runUsage(root, { home });
    const raw = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'usage.md'), 'utf-8');
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;

    expect(code).toBe(0);
    expect(data['kind']).toBe('pulse-usage');
    expect(Number.isNaN(new Date(String(data['generated'])).getTime())).toBe(false);
  });

  it('reports every Rule 4 figure with its session denominator', async () => {
    const root = project('figures');
    const home = tmpHome('figures');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(
        bash('cortex insight file src/a.ts'),
        read('.cortex/compass/rules/R-001-core-no-llm-calls.md'),
        read('.cortex/pulse/state/worklist.json'),
        read('.cortex/_index.md'),
      ),
    ]);
    writeSessionTranscript(home, root, 's2', [toolTurn(askUser())]);

    await runUsage(root, { home });
    const body = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'usage.md'), 'utf-8');

    expect(body).toMatch(/cortex insight file`?: 1/);
    expect(body).toMatch(/Orientation reads: 2 across 2 sessions/);
    expect(body).toMatch(/Loop machinery.*: 1/s);
    expect(body).toMatch(/root `_index\.md`: 1/);
    expect(body).toMatch(/1 of 2 sessions/);
    expect(body).toMatch(/2 sessions, \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/);
  });

  it('overwrites rather than appending on a second run', async () => {
    const root = project('overwrite');
    const home = tmpHome('overwrite');
    writeSessionTranscript(home, root, 's1', [toolTurn(bash('cortex insight file src/a.ts'))]);

    await runUsage(root, { home });
    await runUsage(root, { home });
    const body = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'usage.md'), 'utf-8');

    expect(body.match(/## Window/g)).toHaveLength(1);
  });
});

describe('pulse.usage — Rules 8–11 land in the written report', () => {
  it('renders the Searches by target table, the recall figure, tracked subdirectories, and pointers', async () => {
    const root = project('rules-8-11');
    const home = tmpHome('rules-8-11');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(
        bash('grep -rn "hooks" .cortex/compass/ && cat notes.md | grep hooks'),
        bash('find .cortex/pulse -name "*.md"'),
        bash('grep -n "kind:" cortex-schema.md'),
        bash('cortex recall scanner'),
        read('.cortex/atlas/decisions/D-004-scanner.md'),
      ),
    ]);

    await runUsage(root, { home });
    const body = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'usage.md'), 'utf-8');

    expect(body).toMatch(/## Searches by target/);
    expect(body).toMatch(/\| knowledge[^|]*\| 1 \|/);
    expect(body).toMatch(/\| machinery[^|]*\| 1 \|/);
    expect(body).toMatch(/\| document[^|]*\| 1 \|/);
    expect(body).toMatch(/2 across 1 sessions/);
    expect(body).toMatch(/`cortex recall`: 1/);
    expect(body).toMatch(/`atlas\/decisions\/`: 1/);
    expect(body).toMatch(/`pulse\/threads\/`: 0/);
    expect(body).toMatch(/fired 0, followed 0/);
  });

  it('marks the new figures not measurable when no session is readable', async () => {
    const root = project('rules-8-11-empty');
    const home = tmpHome('rules-8-11-empty');

    await runUsage(root, { home });
    const body = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'usage.md'), 'utf-8');

    expect(body).toMatch(/Searches by target: not measurable/);
    expect(body).toMatch(/Pointer follow-through: not measurable/);
    expect(body).toMatch(/Read deferrals: not measurable/);
  });
});

// ---------------------------------------------------------------------------
// Rule 12 — `--record` writes the evidence file from the same counts (atlas.evidence Rule 5)
// ---------------------------------------------------------------------------
import { validate } from '../../../src/schema/validate.js';
import { evidenceProject, evidenceHome } from '../../fixtures/evidence.js';
import { grep } from '../../fixtures/sessions.js';

describe('`usage --record` writes evidence from the same counts as the report', () => {
  it('41 sessions (2026-07-01 to 2026-09-15): the report as before, plus a check.evidence-valid file whose body equals the report body', async () => {
    const root = evidenceProject('record');
    const home = evidenceHome('record');
    const NOW = new Date('2026-09-15T15:58:00.000Z');
    const first = new Date('2026-07-01T12:00:00.000Z');
    const last = new Date('2026-09-15T12:00:00.000Z');
    const knowledgeSearches = Array.from({ length: 54 }, () => grep('hooks', '.cortex/compass/'));
    writeSessionTranscript(home, root, 's01', [toolTurn(bash('cortex insight file src/a.ts'), bash('cortex insight file src/b.ts'), ...knowledgeSearches)], first);
    for (let i = 2; i <= 40; i++) {
      const mtime = new Date(first.getTime() + ((last.getTime() - first.getTime()) * (i - 1)) / 40);
      writeSessionTranscript(home, root, `s${String(i).padStart(2, '0')}`, [toolTurn(read('src/a.ts'))], mtime);
    }
    writeSessionTranscript(home, root, 's41', [toolTurn(read('src/a.ts'))], last);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await runUsage(root, { home, now: NOW, record: true });
    vi.restoreAllMocks();
    expect(code).toBe(0);

    const reportRaw = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'usage.md'), 'utf-8');
    expect((matter(reportRaw).data as Record<string, unknown>)['kind']).toBe('pulse-usage');
    expect(reportRaw).toMatch(/41 sessions, 2026-07-01 to 2026-09-15/);

    const target = path.join(root, '.cortex', 'atlas', 'evidence', '2026-09-15-usage.md');
    expect(fs.existsSync(target)).toBe(true);
    const evidenceRaw = fs.readFileSync(target, 'utf-8');
    const parsed = matter(evidenceRaw);
    const data = parsed.data as Record<string, unknown>;
    expect(data['id']).toBe('evidence.2026-09-15-usage');
    expect(data['title']).toBe('Cortex usage over 41 sessions (2026-07-01 to 2026-09-15)');
    expect(data['kind']).toBe('measurement');
    expect(data['instrument']).toBe('pulse.usage');
    expect(data['window']).toEqual({ from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-09-15T00:00:00Z'), sessions: 41 });
    const findings = data['findings'] as { metric: string; value: unknown; unit?: string }[];
    expect(findings.map((f) => f.metric)).toEqual([
      'searches.knowledge', 'searches.machinery', 'searches.document', 'searches.other',
      'insight.file',
      'recall.recall', 'recall.why', 'reads.atlas-decisions', 'reads.pulse-threads',
      'pointers.fired', 'pointers.followed',
      'deferrals.deferred', 'deferrals.proceeded', 'deferrals.later', 'deferrals.abandoned',
      'questions.before-consult',
    ]);
    // Rule 13: the flag was off in every session, so the four zeros are the baseline, not "not measurable".
    for (const metric of ['deferrals.deferred', 'deferrals.proceeded', 'deferrals.later', 'deferrals.abandoned']) {
      expect(findings).toContainEqual({ metric, value: 0 });
    }
    expect(reportRaw).toMatch(/## Read deferrals/);
    expect(reportRaw).toMatch(/deferred 0, proceeded 0, later 0, abandoned 0/);
    expect(reportRaw).toMatch(/proceed-rate: -/);
    expect(findings).toContainEqual({ metric: 'searches.knowledge', value: 54 });
    expect(findings).toContainEqual({ metric: 'insight.file', value: 2, unit: 'invocations' });
    expect(findings).toContainEqual({ metric: 'reads.atlas-decisions', value: 0 });
    expect('supersedes' in data).toBe(false);
    expect(data['bears_on']).toEqual(['schema:§5', 'pulse.usage']);
    expect(parsed.content.trim()).toBe(matter(reportRaw).content.trim());
    expect(fs.existsSync(path.join(root, '.cortex', 'atlas', 'evidence', '_index.md'))).toBe(true);

    const report = await validate(root);
    expect(report.violations.filter((v) => v.severity === 'error').map((v) => `${v.check}: ${v.message}`)).toEqual([]);

    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
});

import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Rule 11 (3.4 second revision) — id-shaped pointers land in the written report
// ---------------------------------------------------------------------------
import { hookContext, glob } from '../../fixtures/sessions.js';

describe('pulse.usage — Rule 11 id-shaped pointers in the written report', () => {
  it('counts a Decided: id line followed by its decision read, and one followed by cortex why, as 2 fired / 2 followed', async () => {
    const root = project('rule-11-ids');
    const home = tmpHome('rule-11-ids');
    const line = 'Decided: decision.2026-08-05-x · Open: T-004 Do you want the counter… · more: cortex why R-003';
    writeSessionTranscript(home, root, 's1', [hookContext(line), toolTurn(glob('src/**'), read('.cortex/atlas/decisions/2026-08-05-x.md'))]);
    writeSessionTranscript(home, root, 's2', [hookContext(line), toolTurn(bash('cortex why R-003'))]);

    await runUsage(root, { home });
    const body = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'usage.md'), 'utf-8');

    expect(body).toMatch(/fired 2, followed 2/);
    expect(body).toMatch(/`cortex why`: 1/);
    expect(body).toMatch(/`atlas\/decisions\/`: 1/);
  });
});
