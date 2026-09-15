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
  });
});
