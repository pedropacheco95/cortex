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
  hookContext,
  glob,
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

describe('pulse.usage — Rule 8: a search is a segment that searches a path', () => {
  it('does not count a pipe filter as a search', () => {
    const root = project('r8-pipe');
    const home = tmp('r8-pipe-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(bash('cat .cortex/compass/_index.md | grep rules')),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.searchesByTarget).toEqual({ knowledge: 0, machinery: 0, document: 0, other: 0 });
    expect(counts.cortexGreps).toBe(0);
  });

  it('counts a compound command once, under knowledge, ignoring its pipe filter', () => {
    const root = project('r8-compound');
    const home = tmp('r8-compound-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(bash('grep -rn "hooks" .cortex/compass/ && cat notes.md | grep hooks')),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.searchesByTarget).toEqual({ knowledge: 1, machinery: 0, document: 0, other: 0 });
    expect(counts.cortexGreps).toBe(1);
  });

  it('counts a find into pulse under machinery', () => {
    const root = project('r8-find');
    const home = tmp('r8-find-home');
    writeSessionTranscript(home, root, 's1', [toolTurn(bash('find .cortex/pulse -name "*.md"'))]);

    const counts = collectUsage(root, { home });

    expect(counts.searchesByTarget.machinery).toBe(1);
    expect(counts.searchesByTarget.knowledge).toBe(0);
  });

  it('counts greps into the schema and .specflow/ under document, outside the .cortex/ figure', () => {
    const root = project('r8-document');
    const home = tmp('r8-document-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(bash('grep -n "kind:" cortex-schema.md'), bash('rg pulse-usage .specflow/specs/')),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.searchesByTarget.document).toBe(2);
    expect(counts.cortexGreps).toBe(0);
  });

  it('buckets Grep tool calls by their path', () => {
    const root = project('r8-greptool');
    const home = tmp('r8-greptool-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(grep('scanner', '.cortex/atlas/decisions/'), grep('scanner', 'src/')),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.searchesByTarget.knowledge).toBe(1);
    expect(counts.searchesByTarget.other).toBe(1);
  });

  it('keeps the .cortex/ figure as knowledge plus machinery', () => {
    const root = project('r8-sum');
    const home = tmp('r8-sum-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(
        grep('x', '.cortex/'),
        bash('grep -rn foo .cortex/insight/'),
        bash('grep -c kind .cortex/pulse/reports/usage.md'),
        bash('grep -rn foo RULES.md'),
        bash('grep -rn foo src/'),
      ),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.searchesByTarget).toEqual({ knowledge: 2, machinery: 1, document: 1, other: 1 });
    expect(counts.cortexGreps).toBe(counts.searchesByTarget.knowledge + counts.searchesByTarget.machinery);
  });

  it('counts the find, not the xargs grep, in a find | xargs grep pipeline', () => {
    const root = project('r8-xargs');
    const home = tmp('r8-xargs-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(bash("find .cortex/atlas -name '*.md' | xargs grep -l foo")),
    ]);

    expect(collectUsage(root, { home }).searchesByTarget).toEqual({ knowledge: 1, machinery: 0, document: 0, other: 0 });
  });

  it('strips quoted spans before segmenting, so a quoted path is not a target', () => {
    const root = project('r8-quoted');
    const home = tmp('r8-quoted-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(bash('grep -rn ".cortex/compass/" docs/'), bash('echo "grep foo .cortex/compass/"')),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.searchesByTarget).toEqual({ knowledge: 0, machinery: 0, document: 0, other: 1 });
  });

  it('renders the Searches by target table', () => {
    const root = project('r8-render');
    const home = tmp('r8-render-home');
    writeSessionTranscript(home, root, 's1', [toolTurn(bash('grep -rn foo .cortex/compass/'))]);

    const body = renderUsageBody(collectUsage(root, { home }));

    expect(body).toMatch(/## Searches by target/);
    expect(body).toMatch(/\| knowledge[^|]*\| 1 \|/);
    expect(body).toMatch(/\| machinery[^|]*\| 0 \|/);
    expect(body).toMatch(/\| document[^|]*\| 0 \|/);
    expect(body).toMatch(/\| other[^|]*\| 0 \|/);
  });
});

describe('pulse.usage — Rule 9: recall and why are counted under their own figure', () => {
  it('counts cortex recall and cortex why per command word, leaving insight verbs alone', () => {
    const root = project('r9');
    const home = tmp('r9-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(bash('cortex recall foo'), bash('cortex why bar'), bash('cortex insight file src/a.ts')),
      textTurn('assistant', 'You could run cortex recall foo again.'),
    ]);

    const counts = collectUsage(root, { home });
    const body = renderUsageBody(counts);

    expect(counts.recallVerbs).toEqual({ recall: 1, why: 1 });
    expect(counts.insightVerbs).toEqual({ file: 1 });
    expect(body).toMatch(/`cortex recall`: 1/);
    expect(body).toMatch(/`cortex why`: 1/);
  });

  it('reports recall and why at zero rather than omitting them', () => {
    const root = project('r9-zero');
    const home = tmp('r9-zero-home');
    writeSessionTranscript(home, root, 's1', [toolTurn(bash('ls'))]);

    const counts = collectUsage(root, { home });

    expect(counts.recallVerbs).toEqual({ recall: 0, why: 0 });
    expect(renderUsageBody(counts)).toMatch(/`cortex recall`: 0/);
  });
});

describe('pulse.usage — Rule 10: tracked subdirectories', () => {
  it('reports atlas/decisions reads and pulse/threads at zero', () => {
    const root = project('r10');
    const home = tmp('r10-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(read('.cortex/atlas/decisions/D-001-x.md'), read('.cortex/atlas/domain/insight.md')),
    ]);

    const counts = collectUsage(root, { home });
    const body = renderUsageBody(counts);

    expect(counts.readsBySubdir).toEqual({ 'atlas/decisions': 1, 'pulse/threads': 0 });
    expect(body).toMatch(/`atlas\/decisions\/`: 1/);
    expect(body).toMatch(/`pulse\/threads\/`: 0/);
  });

  it('counts a pulse/threads read as orientation and under its subdirectory', () => {
    const root = project('r10-threads');
    const home = tmp('r10-threads-home');
    writeSessionTranscript(home, root, 's1', [toolTurn(read('.cortex/pulse/threads/T-001.md'))]);

    const counts = collectUsage(root, { home });

    expect(counts.readsBySubdir['pulse/threads']).toBe(1);
    expect(counts.orientationReads).toBe(1);
    expect(counts.machineryReads).toBe(0);
  });
});

describe('pulse.usage — Rule 11: pointer follow-through', () => {
  const pointed = '.cortex/atlas/decisions/D-004-scanner.md';

  it('counts a Recall: line followed by a Read within ten tool calls as followed', () => {
    const root = project('r11-followed');
    const home = tmp('r11-followed-home');
    writeSessionTranscript(home, root, 's1', [
      hookContext('Cortex is active (schema 3.3).', `Recall: ${pointed} — why the scanner is native`),
      toolTurn(glob('src/**'), bash('ls'), glob('tests/**')),
      toolTurn(read(`/abs/project/${pointed}`)),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.pointersFired).toBe(1);
    expect(counts.pointersFollowed).toBe(1);
    expect(renderUsageBody(counts)).toMatch(/fired 1, followed 1/);
  });

  it('counts a Decided: line whose Read comes after the tenth tool call as fired but not followed', () => {
    const root = project('r11-late');
    const home = tmp('r11-late-home');
    const filler = Array.from({ length: 10 }, (_, i) => glob(`src/${i}/**`));
    writeSessionTranscript(home, root, 's1', [
      textTurn('user', `Decided: ${pointed} (2026-08-01)`),
      toolTurn(...filler),
      toolTurn(read(pointed)),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.pointersFired).toBe(1);
    expect(counts.pointersFollowed).toBe(0);
  });

  it('counts a search of a directory above the pointed path as followed', () => {
    const root = project('r11-search');
    const home = tmp('r11-search-home');
    writeSessionTranscript(home, root, 's1', [
      hookContext(`Recall: ${pointed}`),
      toolTurn(grep('scanner', '.cortex/atlas/decisions/')),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.pointersFollowed).toBe(1);
  });

  it('does not treat a pointer as followed by a tool call in a later session', () => {
    const root = project('r11-session');
    const home = tmp('r11-session-home');
    writeSessionTranscript(home, root, 's1', [hookContext(`Recall: ${pointed}`)]);
    writeSessionTranscript(home, root, 's2', [toolTurn(read(pointed))]);

    const counts = collectUsage(root, { home });

    expect(counts.pointersFired).toBe(1);
    expect(counts.pointersFollowed).toBe(0);
  });

  it('reports 0 fired, 0 followed when no pointer line exists', () => {
    const root = project('r11-none');
    const home = tmp('r11-none-home');
    writeSessionTranscript(home, root, 's1', [toolTurn(read('.cortex/_index.md'))]);

    expect(renderUsageBody(collectUsage(root, { home }))).toMatch(/fired 0, followed 0/);
  });
});
