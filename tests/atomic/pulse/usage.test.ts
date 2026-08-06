/**
 * Atomic tests for `pulse.usage` — `cortex usage`, the read-side adoption
 * report. Every test runs in a sandboxed tmp project with a FAKE injected home,
 * so the real `~/.claude` is never read.
 *
 * One test per acceptance criterion in `.specflow/specs/pulse/usage.spec.md`.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collectUsage, renderUsageBody, runUsage } from '../../../src/pulse/usage.js';
import {
  writeSessionTranscript,
  toolTurn,
  textTurn,
  bash,
  read,
  grep,
  askUser,
} from '../../fixtures/sessions.js';

function tmp(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cortex-usage-${label}-`));
  return fs.realpathSync(dir);
}

function project(label: string): string {
  const root = tmp(label);
  fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'reports'), { recursive: true });
  return root;
}

describe('pulse.usage — Rule 2: invocations counted from command fields, not prose', () => {
  it('counts a Bash invocation and ignores three prose mentions', () => {
    const root = project('verbs');
    const home = tmp('verbs-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(bash('cortex insight file src/a.ts')),
      textTurn(
        'assistant',
        'You could run cortex insight concept here. Or cortex insight concept there. ' +
          'Really, cortex insight concept is the verb.',
      ),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.insightVerbs['file']).toBe(1);
    expect(counts.insightVerbs['concept'] ?? 0).toBe(0);
  });

  it('does not count a verb quoted inside an echo or a grep pattern', () => {
    const root = project('verbs-quoted');
    const home = tmp('verbs-quoted-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(
        bash('echo "--- cortex insight invocations by verb ---"'),
        bash("grep -oh 'cortex insight [a-z]*' *.jsonl"),
        bash('cortex insight concept hook-safety'),
      ),
    ]);

    const counts = collectUsage(root, { home });

    // Only the real invocation counts; the quoted prose invents no verbs.
    expect(counts.insightVerbs).toEqual({ concept: 1 });
  });

  it('does not count a grep whose only .cortex mention is inside quotes', () => {
    const root = project('greps-quoted');
    const home = tmp('greps-quoted-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(
        bash(`grep -rn "reads under .cortex/" notes.md`),
        bash('grep -rn "chrome" .cortex/compass/'),
      ),
    ]);

    expect(collectUsage(root, { home }).cortexGreps).toBe(1);
  });

  it('does not count invocations mentioned in a Write tool payload', () => {
    const root = project('verbs-write');
    const home = tmp('verbs-write-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn({
        name: 'Write',
        input: { file_path: 'doc.md', content: 'run cortex insight element foo' },
      }),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.insightVerbs['element'] ?? 0).toBe(0);
  });
});

describe('pulse.usage — Rule 3: loop machinery separated from orientation', () => {
  it('reports 4 machinery and 2 orientation reads, never a combined 6', () => {
    const root = project('machinery');
    const home = tmp('machinery-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(
        read('.cortex/pulse/state/triage-worklist.json'),
        read('.cortex/pulse/state/triage-worklist.json'),
        read('.cortex/pulse/state/triage-worklist.json'),
        read('.cortex/pulse/state/triage-worklist.json'),
        read('.cortex/compass/rules/R-001-core-no-llm-calls.md'),
        read('.cortex/compass/rules/R-001-core-no-llm-calls.md'),
      ),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.machineryReads).toBe(4);
    expect(counts.orientationReads).toBe(2);
    expect(renderUsageBody(counts)).not.toMatch(/\b6\b\s*(total|reads)/i);
  });

  it('treats pulse/reports as machinery too', () => {
    const root = project('machinery-reports');
    const home = tmp('machinery-reports-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(read('.cortex/pulse/reports/hygiene.md'), read('.cortex/atlas/domain/insight.md')),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.machineryReads).toBe(1);
    expect(counts.orientationReads).toBe(1);
  });
});

describe('pulse.usage — Rule 4: index reads split root versus module', () => {
  it('reports 11 root and 1 module-level index read', () => {
    const root = project('indexes');
    const home = tmp('indexes-home');
    const rootReads = Array.from({ length: 11 }, () => read('.cortex/_index.md'));
    writeSessionTranscript(home, root, 's1', [
      toolTurn(...rootReads, read('.cortex/compass/_index.md')),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.rootIndexReads).toBe(11);
    expect(counts.moduleIndexReads).toBe(1);
  });
});

describe('pulse.usage — Rule 4: greps targeting .cortex/', () => {
  it('counts both a Grep tool call and a bash grep, ignoring greps elsewhere', () => {
    const root = project('greps');
    const home = tmp('greps-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(
        grep('chrome', '.cortex/'),
        grep('chrome', 'src/'),
        bash('grep -rn "chrome" .cortex/compass/'),
        bash('grep -rn "chrome" src/'),
      ),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.cortexGreps).toBe(2);
  });
});

describe('pulse.usage — Rule 4: questions carry their denominator', () => {
  it('reports 1 of 3 sessions and counts only AskUserQuestion', () => {
    const root = project('questions');
    const home = tmp('questions-home');
    // s1: asks with no prior .cortex/ read -> qualifies.
    writeSessionTranscript(home, root, 's1', [toolTurn(askUser())]);
    // s2: consults first, then asks -> does not qualify.
    writeSessionTranscript(home, root, 's2', [
      toolTurn(read('.cortex/compass/environment.md')),
      toolTurn(askUser()),
    ]);
    // s3: prose ending in "?" is NOT a question signal -> does not qualify.
    writeSessionTranscript(home, root, 's3', [textTurn('assistant', 'Shall we proceed?')]);

    const counts = collectUsage(root, { home });

    expect(counts.questionSessionsWithoutConsult).toBe(1);
    expect(counts.sessions).toBe(3);
    expect(renderUsageBody(counts)).toMatch(/1 of 3 sessions/);
  });

  it('labels the question figure as a floor', () => {
    const root = project('questions-floor');
    const home = tmp('questions-floor-home');
    writeSessionTranscript(home, root, 's1', [toolTurn(askUser())]);

    expect(renderUsageBody(collectUsage(root, { home }))).toMatch(/floor/i);
  });
});

describe('pulse.usage — Rule 6: missing transcripts degrade honestly', () => {
  it('exits 0, names the absence, and does not present zeroes as observations', async () => {
    const root = project('empty');
    const home = tmp('empty-home');

    const code = await runUsage(root, { home });
    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'usage.md'), 'utf-8');

    expect(code).toBe(0);
    expect(report).toMatch(/no sessions were readable/i);
    expect(report).toMatch(/not measurable/i);
    expect(report).not.toMatch(/^- .*: 0 invocations/m);
  });
});

describe('pulse.usage — Rule 5: no interpretation', () => {
  it('emits no recommendation or good/bad classification', () => {
    const root = project('neutral');
    const home = tmp('neutral-home');
    writeSessionTranscript(home, root, 's1', [toolTurn(bash('cortex insight file src/a.ts'))]);

    const body = renderUsageBody(collectUsage(root, { home }));

    expect(body).not.toMatch(/should|recommend|consider|healthy|unhealthy|poor|good sign|worrying/i);
  });
});

describe('pulse.usage — Rule 7: the window is reported', () => {
  it('names the session count it was computed over', () => {
    const root = project('window');
    const home = tmp('window-home');
    writeSessionTranscript(home, root, 's1', [toolTurn(bash('cortex insight file src/a.ts'))]);
    writeSessionTranscript(home, root, 's2', [toolTurn(bash('cortex insight concept auth'))]);

    const counts = collectUsage(root, { home });
    const body = renderUsageBody(counts);

    expect(counts.sessions).toBe(2);
    expect(body).toMatch(/2 sessions/);
  });
});
