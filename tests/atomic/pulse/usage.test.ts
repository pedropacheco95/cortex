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

// ---------------------------------------------------------------------------
// Rule 12 / atlas.evidence Rule 5 — `cortex usage --record`
// ---------------------------------------------------------------------------
import matter from 'gray-matter';
import { usageFindings, usageEvidenceFields, type UsageCounts } from '../../../src/pulse/usage.js';

function seededCounts(root: string, home: string): UsageCounts {
  writeSessionTranscript(home, root, 's1', [
    toolTurn(bash('cortex insight file src/a.ts'), bash('cortex insight concept auth'), bash('cortex insight file src/b.ts'), grep('x', '.cortex/compass/')),
  ]);
  return collectUsage(root, { home });
}

describe('usage --record: findings are the report figures in the Rule 5 fixed order', () => {
  it('searches, then one insight.<verb> per verb seen (sorted, unit invocations), then recall, reads, pointers, questions', () => {
    const root = project('findings');
    const home = tmp('findings-home');
    const counts = seededCounts(root, home);

    expect(usageFindings(counts)).toEqual([
      { metric: 'searches.knowledge', value: 1 },
      { metric: 'searches.machinery', value: 0 },
      { metric: 'searches.document', value: 0 },
      { metric: 'searches.other', value: 0 },
      { metric: 'insight.concept', value: 1, unit: 'invocations' },
      { metric: 'insight.file', value: 2, unit: 'invocations' },
      { metric: 'recall.recall', value: 0 },
      { metric: 'recall.why', value: 0 },
      { metric: 'reads.atlas-decisions', value: 0 },
      { metric: 'reads.pulse-threads', value: 0 },
      { metric: 'pointers.fired', value: 0 },
      { metric: 'pointers.followed', value: 0 },
      // 3.4 third revision (Rule 13; atlas.evidence Rule 5): the four deferral
      // counts sit between pointers.followed and questions.before-consult.
      { metric: 'deferrals.deferred', value: 0 },
      { metric: 'deferrals.proceeded', value: 0 },
      { metric: 'deferrals.later', value: 0 },
      { metric: 'deferrals.abandoned', value: 0 },
      { metric: 'questions.before-consult', value: 0 },
    ]);
  });

  it('usageEvidenceFields carries the slug, title, instrument, window denominator, bears_on and the report body; supersedes only when a previous file is named', () => {
    const root = project('fields');
    const home = tmp('fields-home');
    const counts = seededCounts(root, home);
    const now = new Date('2026-09-15T15:58:00.000Z');

    const fields = usageEvidenceFields(counts, now);
    expect(fields.slug).toBe('usage');
    expect(fields.kind).toBe('measurement');
    expect(fields.instrument).toBe('pulse.usage');
    expect(fields.title).toBe(`Cortex usage over 1 sessions (${counts.windowStart} to ${counts.windowEnd})`);
    expect(fields.window).toEqual({ from: counts.windowStart, to: counts.windowEnd, sessions: 1 });
    expect(fields.bearsOn).toEqual(['schema:§5', 'pulse.usage']);
    expect(fields.supersedes ?? []).toEqual([]);
    expect(fields.body).toBe(renderUsageBody(counts));

    expect(usageEvidenceFields(counts, now, '2026-09-01-usage.md').supersedes).toEqual(['2026-09-01-usage.md']);
  });
});

describe('Nothing measurable records nothing', () => {
  it('a home with no transcript directory: the report names the unreadable state, no atlas/evidence/, exit 1', async () => {
    const root = project('record-empty');
    const home = tmp('record-empty-home');
    const logs: string[] = [];
    const errs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')); });
    const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errs.push(a.join(' ')); });

    const code = await runUsage(root, { home, now: new Date('2026-09-15T15:58:00.000Z'), record: true });

    logSpy.mockRestore();
    errSpy.mockRestore();
    expect(code).toBe(1);
    const report = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'usage.md'), 'utf-8');
    expect(report).toMatch(/not measurable/);
    expect(fs.existsSync(path.join(root, '.cortex', 'atlas'))).toBe(false);
    expect([...logs, ...errs].join('\n')).toMatch(/nothing measurable — no evidence written/);
  });

  it('without --record nothing is written under atlas/ even when sessions are readable', async () => {
    const root = project('no-record');
    const home = tmp('no-record-home');
    seededCounts(root, home);
    expect(await runUsage(root, { home })).toBe(0);
    expect(fs.existsSync(path.join(root, '.cortex', 'atlas'))).toBe(false);
  });
});

describe('A second recording supersedes the first', () => {
  it('2026-09-01-usage.md present → the new file supersedes it; the same day again exits 1 naming the existing file, atlas/ unchanged', async () => {
    const root = project('record-supersedes');
    const home = tmp('record-supersedes-home');
    seededCounts(root, home);
    const evidenceDir = path.join(root, '.cortex', 'atlas', 'evidence');
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, '_index.md'), '# Evidence — index\n', 'utf-8');
    fs.writeFileSync(path.join(evidenceDir, '2026-09-01-usage.md'), '---\nid: evidence.2026-09-01-usage\n---\n', 'utf-8');
    const errs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errs.push(a.join(' ')); });

    expect(await runUsage(root, { home, now: new Date('2026-09-15T15:58:00.000Z'), record: true })).toBe(0);
    const target = path.join(evidenceDir, '2026-09-15-usage.md');
    const data = matter(fs.readFileSync(target, 'utf-8')).data as Record<string, unknown>;
    expect(data['id']).toBe('evidence.2026-09-15-usage');
    expect(data['supersedes']).toEqual(['2026-09-01-usage.md']);
    expect(fs.readFileSync(path.join(evidenceDir, '_index.md'), 'utf-8')).toBe('# Evidence — index\n');

    const atlasBefore = fs.readdirSync(evidenceDir).map((f) => [f, fs.readFileSync(path.join(evidenceDir, f), 'utf-8')]);
    expect(await runUsage(root, { home, now: new Date('2026-09-15T18:00:00.000Z'), record: true })).toBe(1);
    expect(errs.join('\n')).toMatch(/2026-09-15-usage\.md/);
    const atlasAfter = fs.readdirSync(evidenceDir).map((f) => [f, fs.readFileSync(path.join(evidenceDir, f), 'utf-8')]);
    expect(atlasAfter).toEqual(atlasBefore);
    vi.restoreAllMocks();
  });
});

import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Rule 11 (3.4 second revision) — id-shaped pointer targets and the
// `cortex why <ref>` follow (hooks.search-annotate Rule 7's grammar)
// ---------------------------------------------------------------------------
import { pointerPathsIn, pointerTargetsIn } from '../../../src/pulse/usage.js';

describe('pulse.usage — Rule 11: id-shaped pointers and the cortex why follow', () => {
  const decidedLine = 'Decided: decision.2026-08-05-x · Open: T-004 Do you want the counter… · more: cortex why R-003';

  it('AC: an id-shaped pointer is followed by a read of the file it stands for, or by cortex why <ref>', () => {
    const root = project('r11-id');
    const home = tmp('r11-id-home');
    writeSessionTranscript(home, root, 's1', [
      hookContext(decidedLine),
      toolTurn(glob('src/**'), read('/abs/project/.cortex/atlas/decisions/2026-08-05-x.md')),
    ]);
    writeSessionTranscript(home, root, 's2', [hookContext(decidedLine), toolTurn(glob('src/**'), bash('cortex why R-003'))]);

    const counts = collectUsage(root, { home });

    expect(counts.pointersFired).toBe(2);
    expect(counts.pointersFollowed).toBe(2);
    expect(renderUsageBody(counts)).toMatch(/fired 2, followed 2/);
  });

  it('pointerTargetsIn maps decision., evidence. and T-NNN ids to the paths they stand for and keeps the why ref', () => {
    expect(pointerTargetsIn(decidedLine)).toEqual([{ path: '.cortex/atlas/decisions/2026-08-05-x.md', whyRef: 'R-003', moreCommand: 'why' }]);
    expect(pointerTargetsIn('Recall: evidence 2026-09-15 usage · Evidence: evidence.2026-09-15-usage')).toEqual([
      { path: '.cortex/atlas/evidence/2026-09-15-usage.md' },
    ]);
    expect(pointerTargetsIn('Decided: T-004 first, then decision.x')).toEqual([{ path: '.cortex/pulse/threads/T-004-' }]);
  });

  it('a /-bearing token still wins over an id, and the more: tail never supplies the target', () => {
    expect(pointerTargetsIn('Recall: decision 2026-07-07 Five (.cortex/atlas/decisions/2026-07-07-five.md) · more: cortex why R-001')).toEqual([
      { path: '.cortex/atlas/decisions/2026-07-07-five.md', whyRef: 'R-001', moreCommand: 'why' },
    ]);
    expect(pointerTargetsIn('Decided: decision.x · more: cortex why .specflow/specs/pulse/hygiene.spec.md')).toEqual([
      { path: '.cortex/atlas/decisions/x.md', whyRef: '.specflow/specs/pulse/hygiene.spec.md', moreCommand: 'why' },
    ]);
  });

  it('a line with neither a path nor an id points nowhere and is not fired', () => {
    expect(pointerTargetsIn('Recall: nothing here')).toEqual([]);
    const root = project('r11-nowhere');
    const home = tmp('r11-nowhere-home');
    writeSessionTranscript(home, root, 's1', [hookContext('Recall: nothing here'), toolTurn(bash('cortex why R-003'))]);
    expect(collectUsage(root, { home }).pointersFired).toBe(0);
  });

  it('pointerPathsIn stays as the path-only alias', () => {
    expect(pointerPathsIn(decidedLine)).toEqual(['.cortex/atlas/decisions/2026-08-05-x.md']);
  });

  it('a T-NNN pointer is followed by a Read of any thread file whose basename starts T-NNN-', () => {
    const root = project('r11-thread');
    const home = tmp('r11-thread-home');
    writeSessionTranscript(home, root, 's1', [
      hookContext('Decided: T-004 some question'),
      toolTurn(read('/abs/project/.cortex/pulse/threads/T-004-do-you-want-the-counter.md')),
    ]);
    writeSessionTranscript(home, root, 's2', [
      hookContext('Decided: T-004 some question'),
      toolTurn(read('/abs/project/.cortex/pulse/threads/T-0041-other.md'), read('.cortex/pulse/threads/T-005-x.md')),
    ]);

    const counts = collectUsage(root, { home });

    expect(counts.pointersFired).toBe(2);
    expect(counts.pointersFollowed).toBe(1);
  });

  it('a cortex why with a different ref, or one past the window, does not follow', () => {
    const root = project('r11-why-miss');
    const home = tmp('r11-why-miss-home');
    const filler = Array.from({ length: 10 }, (_, i) => glob(`src/${i}/**`));
    writeSessionTranscript(home, root, 's1', [hookContext(decidedLine), toolTurn(bash('cortex why R-004'))]);
    writeSessionTranscript(home, root, 's2', [hookContext(decidedLine), toolTurn(...filler), toolTurn(bash('cortex why R-003'))]);
    writeSessionTranscript(home, root, 's3', [hookContext(decidedLine), toolTurn(bash('echo "cortex why R-003"'))]);

    const counts = collectUsage(root, { home });

    expect(counts.pointersFired).toBe(3);
    expect(counts.pointersFollowed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 11 (3.4 third revision) — the `Evidence:` / `Open:` prefixes, the
// `cortex thread list` tail, the thread-verb follow
// ---------------------------------------------------------------------------
import { pointerTargetsIn as targetsIn, DEFER_RETRY_WINDOW, deferredPathsIn } from '../../../src/pulse/usage.js';
import { toolResultTurn } from '../../fixtures/sessions.js';

describe('pulse.usage — Rule 11 (third revision): Open: pointers and the thread verbs', () => {
  const openLine =
    'Open: T-006 (2026-09-15) Do you want the counter in state/ or at the pulse root? (.cortex/pulse/threads/T-006-do-you-want-the-counter.md) · more: cortex thread list';

  it('AC: an Open pointer is fired and followed by a thread verb, by cortex thread list, or by a Read of the thread file', () => {
    const root = project('r11-open');
    const home = tmp('r11-open-home');
    writeSessionTranscript(home, root, 's1', [hookContext(openLine), toolTurn(glob('src/**'), bash('cortex thread close T-006 --by .cortex/atlas/decisions/x.md'))]);
    writeSessionTranscript(home, root, 's2', [hookContext(openLine), toolTurn(glob('src/**'), bash('cortex thread list'))]);
    writeSessionTranscript(home, root, 's3', [hookContext(openLine), toolTurn(read('.cortex/pulse/threads/T-006-do-you-want-the-counter.md'))]);

    const counts = collectUsage(root, { home });

    expect(counts.pointersFired).toBe(3);
    expect(counts.pointersFollowed).toBe(3);
    expect(renderUsageBody(counts)).toMatch(/fired 3, followed 3/);
  });

  it('AC: a marker beginning Evidence: or Open: is fired', () => {
    const root = project('r11-prefixes');
    const home = tmp('r11-prefixes-home');
    writeSessionTranscript(home, root, 's1', [hookContext('Evidence: evidence.2026-09-15-usage · Open: T-004'), toolTurn(glob('src/**'))]);
    writeSessionTranscript(home, root, 's2', [hookContext('Open: T-004'), toolTurn(glob('src/**'))]);

    const counts = collectUsage(root, { home });

    expect(counts.pointersFired).toBe(2);
    expect(counts.pointersFollowed).toBe(0);
  });

  it('pointerTargetsIn: the Open: line points at its parenthesised path, not at the state/ inside the key text, and carries the thread id and the tail command', () => {
    expect(targetsIn(openLine)).toEqual([
      { path: '.cortex/pulse/threads/T-006-do-you-want-the-counter.md', threadId: 'T-006', moreCommand: 'thread list' },
    ]);
    expect(targetsIn('Open: T-004')).toEqual([{ path: '.cortex/pulse/threads/T-004-', threadId: 'T-004' }]);
    expect(targetsIn('Evidence: evidence.2026-09-15-usage · Open: T-004')).toEqual([{ path: '.cortex/atlas/evidence/2026-09-15-usage.md' }]);
    // The thread-list tail never supplies a target; a lone tail line points nowhere.
    expect(targetsIn('Open: nothing · more: cortex thread list')).toEqual([]);
  });

  it('the thread verbs follow only with the line\'s own id; drop and promote count like close; a quoted or echoed verb does not', () => {
    const root = project('r11-verbs');
    const home = tmp('r11-verbs-home');
    writeSessionTranscript(home, root, 's1', [hookContext(openLine), toolTurn(bash('cortex thread close T-007'))]);
    writeSessionTranscript(home, root, 's2', [hookContext(openLine), toolTurn(bash('cd /x && cortex thread drop T-006'))]);
    writeSessionTranscript(home, root, 's3', [hookContext(openLine), toolTurn(bash('cortex thread promote T-006 --to decision'))]);
    writeSessionTranscript(home, root, 's4', [hookContext(openLine), toolTurn(bash('echo "cortex thread list"'))]);
    writeSessionTranscript(home, root, 's5', [hookContext(openLine), toolTurn(bash('cortex thread list --all | head'))]);

    const counts = collectUsage(root, { home });

    expect(counts.pointersFired).toBe(5);
    expect(counts.pointersFollowed).toBe(3);
  });

  it('cortex thread list follows only a pointer whose tail named it; a thread verb past the window does not follow', () => {
    const root = project('r11-list-scope');
    const home = tmp('r11-list-scope-home');
    const noTail = 'Open: T-006 (2026-09-15) the counter (.cortex/pulse/threads/T-006-do-you-want-the-counter.md)';
    const filler = Array.from({ length: 10 }, (_, i) => glob(`src/${i}/**`));
    writeSessionTranscript(home, root, 's1', [hookContext(noTail), toolTurn(bash('cortex thread list'))]);
    writeSessionTranscript(home, root, 's2', [hookContext(openLine), toolTurn(...filler), toolTurn(bash('cortex thread close T-006'))]);

    const counts = collectUsage(root, { home });

    expect(counts.pointersFired).toBe(2);
    expect(counts.pointersFollowed).toBe(0);
  });

  it('the report names the four prefixes', () => {
    const root = project('r11-report');
    const home = tmp('r11-report-home');
    writeSessionTranscript(home, root, 's1', [toolTurn(glob('src/**'))]);
    expect(renderUsageBody(collectUsage(root, { home }))).toMatch(/`Recall:` \/ `Decided:` \/ `Evidence:` \/ `Open:` lines/);
  });
});

// ---------------------------------------------------------------------------
// Rule 13 (3.4 third revision) — Read deferrals
// ---------------------------------------------------------------------------

describe('pulse.usage — Rule 13: read deferrals', () => {
  const deferred = (p: string, tok = 2532, lines = 235) =>
    `Deferred: ${p} (~${tok} tok, ${lines} lines). Implements the PreRead hook.\nConnections: -\nRules: R-001.\nReading this path again proceeds without this notice.`;

  it('DEFER_RETRY_WINDOW is 3 and deferredPathsIn extracts the normalised path of every Deferred: line', () => {
    expect(DEFER_RETRY_WINDOW).toBe(3);
    expect(deferredPathsIn(deferred('src/hooks/pre-read.ts'))).toEqual(['src/hooks/pre-read.ts']);
    expect(deferredPathsIn('Deferred: ./src/a.ts (~1 tok, 40 lines). x\nDeferred: src/b.ts (~2 tok, 41 lines). y')).toEqual(['src/a.ts', 'src/b.ts']);
    expect(deferredPathsIn('Rules: R-001.\nnot a deferral')).toEqual([]);
    expect(deferredPathsIn('')).toEqual([]);
  });

  it('AC "A deferral retried within three calls is proceeded": tool_result line, one unrelated call, then the Read', () => {
    const root = project('r13-proceeded');
    const home = tmp('r13-proceeded-home');
    writeSessionTranscript(home, root, 's1', [
      toolTurn(read('src/hooks/pre-read.ts')),
      toolResultTurn(deferred('src/hooks/pre-read.ts')),
      toolTurn(glob('src/**')),
      toolTurn(read('/abs/project/src/hooks/pre-read.ts')),
    ]);

    const counts = collectUsage(root, { home });
    const body = renderUsageBody(counts);

    expect(counts.deferralsDeferred).toBe(1);
    expect(counts.deferralsProceeded).toBe(1);
    expect(counts.deferralsLater).toBe(0);
    expect(counts.deferralsAbandoned).toBe(0);
    expect(body).toMatch(/## Read deferrals/);
    expect(body).toMatch(/deferred 1, proceeded 1, later 0, abandoned 0/);
    expect(body).toMatch(/proceed-rate: 1\.00/);
  });

  it('AC "A late retry is later, a missing one is abandoned": four unrelated calls then the Read; an attachment-carried line with no Read', () => {
    const root = project('r13-later');
    const home = tmp('r13-later-home');
    writeSessionTranscript(home, root, 's1', [
      toolResultTurn(deferred('src/a.ts'), { asBlocks: true }),
      toolTurn(glob('a/**'), glob('b/**'), glob('c/**'), glob('d/**')),
      toolTurn(read('src/a.ts')),
    ]);
    writeSessionTranscript(home, root, 's2', [hookContext(deferred('src/b.ts')), toolTurn(glob('x/**'), read('src/c.ts'))]);

    const counts = collectUsage(root, { home });

    expect(counts.deferralsDeferred).toBe(2);
    expect(counts.deferralsProceeded).toBe(0);
    expect(counts.deferralsLater).toBe(1);
    expect(counts.deferralsAbandoned).toBe(1);
    expect(renderUsageBody(counts)).toMatch(/deferred 2, proceeded 0, later 1, abandoned 1/);
    expect(renderUsageBody(counts)).toMatch(/proceed-rate: 0\.00/);
  });

  it('the third tool call is still inside the window; the window is per session and never crosses one', () => {
    const root = project('r13-edge');
    const home = tmp('r13-edge-home');
    writeSessionTranscript(home, root, 's1', [toolResultTurn(deferred('src/a.ts')), toolTurn(glob('a/**'), glob('b/**'), read('src/a.ts'))]);
    writeSessionTranscript(home, root, 's2', [toolResultTurn(deferred('src/b.ts'))]);
    writeSessionTranscript(home, root, 's3', [toolTurn(read('src/b.ts'))]);

    const counts = collectUsage(root, { home });

    expect(counts.deferralsProceeded).toBe(1);
    expect(counts.deferralsAbandoned).toBe(1);
    expect(counts.deferralsDeferred).toBe(2);
  });

  it('AC "Read deferrals are reported even at zero and recorded in order": zeros, proceed-rate -, findings after pointers.followed', () => {
    const root = project('r13-zero');
    const home = tmp('r13-zero-home');
    writeSessionTranscript(home, root, 's1', [toolTurn(read('src/a.ts'))]);

    const counts = collectUsage(root, { home });
    const body = renderUsageBody(counts);

    expect(body).toMatch(/## Read deferrals/);
    expect(body).toMatch(/deferred 0, proceeded 0, later 0, abandoned 0/);
    expect(body).toMatch(/proceed-rate: -/);
    const metrics = usageFindings(counts).map((f) => f.metric);
    const at = metrics.indexOf('pointers.followed');
    expect(metrics.slice(at, at + 6)).toEqual([
      'pointers.followed',
      'deferrals.deferred',
      'deferrals.proceeded',
      'deferrals.later',
      'deferrals.abandoned',
      'questions.before-consult',
    ]);
  });

  it('an unreadable transcript location renders the section as not measurable, not as zeros', () => {
    const root = project('r13-unreadable');
    const home = tmp('r13-unreadable-home');
    const body = renderUsageBody(collectUsage(root, { home }));
    expect(body).toMatch(/Read deferrals: not measurable/);
    expect(body).not.toMatch(/deferred 0/);
  });
});
