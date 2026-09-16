/**
 * Atomic tests — hooks.pre-read internals over the v3 insight per-file entry
 * (anatomy deprecation, build-order-v3 step 7): payload composition (rule
 * matching, empty states), purposeFirstLine, the invitation gate on the
 * read-time marker, the per-session read-memory file, budget trimming,
 * config-flag defaults, and degradation paths.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { run, readsMemoryPath, purposeFirstLine } from '../../../src/hooks/pre-read.js';
import { READ_TIME_MARKER } from '../../../src/hooks/post-read.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeInsightEntry,
  insightEntryPath,
  writeRule,
  parseEnvelope,
  hookErrorsPath,
} from '../../fixtures/hooks-harness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`pre-read-atomic-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

const ON_CONFIG = { schemaVersion: '3.0', hooks: { preRead: true }, loop: { enabled: false } };

function makeProject(label: string, config: Record<string, unknown> = ON_CONFIG): string {
  const root = tmp(label);
  makeCortexProject(root, { config });
  return root;
}

function stdinFor(root: string, filePath: string, sessionId = 's1'): Record<string, unknown> {
  return { session_id: sessionId, cwd: root, tool_name: 'Read', tool_input: { file_path: filePath } };
}

describe('payload composition: the insight entry drives line 1', () => {
  it('no matching rules → "Rules: -." and the entry size_tokens appear', async () => {
    const root = makeProject('empty');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.', tokens: 120 });
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, 'src/a.ts')))).stdout).additionalContext;
    expect(ctx).toContain('src/a.ts: Does A. (~120 tok). Rules: -.');
  });

  it('governs-matching rules listed by id; non-matching and retired rules omitted', async () => {
    const root = makeProject('rules');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    writeRule(root, 'R-001-match.md', `id: R-001\ntitle: Match\nsource:\n  - ../bugs/B-001.md\ngoverns:\n  - "src/**/*.ts"`);
    writeRule(root, 'R-002-nomatch.md', `id: R-002\ntitle: No match\nsource:\n  - ../bugs/B-001.md\ngoverns:\n  - "docs/**"`);
    writeRule(root, 'R-003-retired.md', `id: R-003\ntitle: Retired\nstatus: retired\nsource:\n  - ../bugs/B-001.md\ngoverns:\n  - "src/**"`);
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, 'src/a.ts')))).stdout).additionalContext;
    expect(ctx).toContain('Rules: R-001.');
    expect(ctx).not.toContain('R-002');
    expect(ctx).not.toContain('R-003');
  });

  it('a relative stdin file_path resolves against the project root', async () => {
    const root = makeProject('relpath');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    const ctx = parseEnvelope((await run(stdinFor(root, 'src/a.ts'))).stdout).additionalContext;
    expect(ctx).toContain('src/a.ts: Does A.');
  });

  it('a multi-line Purpose section injects only its first non-empty line, whitespace-collapsed', async () => {
    const root = makeProject('firstline');
    writeInsightEntry(root, 'src/a.ts', {
      purpose: '\nParses   the\tentry.\n\nSecond paragraph never injected.',
    });
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, 'src/a.ts')))).stdout).additionalContext;
    expect(ctx).toContain('src/a.ts: Parses the entry. (~120 tok).');
    expect(ctx).not.toContain('Second paragraph');
  });
});

describe('purposeFirstLine helper', () => {
  it('returns the first non-empty line, whitespace-collapsed', () => {
    expect(purposeFirstLine('\n\n  a   b\tc  \nrest')).toBe('a b c');
  });

  it('returns the empty string for an all-blank section', () => {
    expect(purposeFirstLine('\n   \n\t\n')).toBe('');
  });
});

describe('invitation gate: the read-time marker suppresses the invite', () => {
  it('a Purpose already carrying the read-time marker → no invitation line', async () => {
    const root = makeProject('marker');
    writeInsightEntry(root, 'src/a.ts', {
      purpose: `Corrected earlier.\n\n${READ_TIME_MARKER}alice/sess-1)*`,
    });
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, 'src/a.ts')))).stdout).additionalContext;
    expect(ctx).toContain('src/a.ts: Corrected earlier.');
    expect(ctx).not.toContain('<cortex:purpose');
  });
});

describe('config flag: absent means ON (§10.1 default true)', () => {
  it('config without a hooks key still emits the summary', async () => {
    const root = makeProject('default-on', { schemaVersion: '3.0', loop: { enabled: false } });
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    const result = await run(stdinFor(root, path.join(root, 'src/a.ts')));
    expect(parseEnvelope(result.stdout).additionalContext).toContain('src/a.ts: Does A.');
  });
});

describe('per-session read-memory (the duplicate-read engineering call)', () => {
  it('records the path under pulse/state/reads/<session_id>', async () => {
    const root = makeProject('memfile');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    await run(stdinFor(root, path.join(root, 'src/a.ts'), 'sess-42'));
    const mem = readsMemoryPath(root, 'sess-42');
    expect(fs.existsSync(mem)).toBe(true);
    expect(fs.readFileSync(mem, 'utf-8')).toBe('src/a.ts\n');
  });

  it('session ids are sanitised into safe filenames', () => {
    const p = readsMemoryPath('/proj', '../../etc/passwd');
    expect(path.basename(p)).toBe('.._.._etc_passwd');
    expect(p).toContain(path.join('.cortex', 'pulse', 'state', 'reads'));
  });

  it('no session_id → no note, no memory file', async () => {
    const root = makeProject('nosession');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    const stdin = { cwd: root, tool_input: { file_path: path.join(root, 'src/a.ts') } };
    await run(stdin);
    const second = await run(stdin);
    expect(parseEnvelope(second.stdout).additionalContext).not.toContain('already read');
    const readsDir = path.join(root, '.cortex', 'pulse', 'state', 'reads');
    expect(fs.existsSync(readsDir) ? fs.readdirSync(readsDir) : []).toEqual([]);
  });
});

describe('budget enforcement: the purpose is trimmed, never the tag', () => {
  it('an over-budget purpose is trimmed so the payload fits <=75 tokens and the tag stays intact', async () => {
    const longPurpose = 'Extremely detailed purpose. '.repeat(10).trim(); // ~280 chars
    const root = makeProject('budget');
    writeInsightEntry(root, 'src/a.ts', { purpose: longPurpose });
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, 'src/a.ts')))).stdout).additionalContext;
    expect(Math.ceil(ctx.length / 4)).toBeLessThanOrEqual(75);
    expect(ctx).toContain('</cortex:purpose>'); // the invitation tag is never cut
    expect(ctx).toContain('…'); // the purpose was trimmed, visibly
  });

  it('without the invite (marker present), the payload fits the 50-token budget', async () => {
    const longPurpose = 'Painstakingly thorough purpose text. '.repeat(10).trim();
    const root = makeProject('budget50');
    writeInsightEntry(root, 'src/a.ts', {
      purpose: `${longPurpose}\n\n${READ_TIME_MARKER}bob/sess-9)*`,
    });
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, 'src/a.ts')))).stdout).additionalContext;
    expect(Math.ceil(ctx.length / 4)).toBeLessThanOrEqual(50);
    expect(ctx).not.toContain('<cortex:purpose');
  });
});

describe('silence and degradation', () => {
  it('no tool_input.file_path → silent', async () => {
    const root = makeProject('nofile');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    expect(await run({ cwd: root, tool_input: {} })).toEqual({ exitCode: 0, stdout: '' });
  });

  it('no .cortex/insight/ module (unextracted project) → silent, no pulse entry', async () => {
    const root = tmp('noinsight');
    makeCortexProject(root, { config: ON_CONFIG, modules: ['compass', 'atlas', 'pulse'] });
    expect(await run(stdinFor(root, path.join(root, 'src/a.ts')))).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('insight present but no entry for the path → silent, no pulse entry', async () => {
    const root = makeProject('noentry');
    writeInsightEntry(root, 'src/other.ts', { purpose: 'Someone else.' });
    expect(await run(stdinFor(root, path.join(root, 'src/a.ts')))).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('an entry whose Purpose section is empty → silent (nothing worth injecting)', async () => {
    const root = makeProject('emptypurpose');
    writeInsightEntry(root, 'src/a.ts', { purpose: '   ' });
    expect(await run(stdinFor(root, path.join(root, 'src/a.ts')))).toEqual({ exitCode: 0, stdout: '' });
  });

  it('a malformed insight entry → silent plus one hook-errors entry', async () => {
    const root = makeProject('malformed');
    const p = insightEntryPath(root, 'src/a.ts');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '---\npath: src/a.ts\n---\n\n## Purpose\n\nNo other frontmatter.\n');
    expect(await run(stdinFor(root, path.join(root, 'src/a.ts')))).toEqual({ exitCode: 0, stdout: '' });
    const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    expect(log).toContain('hook: pre-read');
    expect(log).toContain('insight entry unreadable');
  });

  it('a path outside the project root → silent', async () => {
    const root = makeProject('outside');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    expect(await run(stdinFor(root, '/etc/hosts'))).toEqual({ exitCode: 0, stdout: '' });
  });

  it('malformed stdin → silent', async () => {
    expect(await run(42, { cwd: tmp('badstdin') })).toEqual({ exitCode: 0, stdout: '' });
  });
});

// ---------------------------------------------------------------------------
// Rule 6: the recall marker (3.4 second revision; recall work, step 3)
// ---------------------------------------------------------------------------
import { isMarkedTarget } from '../../../src/hooks/pre-read.js';
import { clearRecallIndexCache } from '../../../src/recall/query.js';
import { recallEntry, recallIndexFixture, recallSubject, writeRecallIndexFixture } from '../../fixtures/recall-query.js';

describe('Rule 6: recall marker', () => {
  afterEach(() => clearRecallIndexCache());

  const USAGE_SPEC = '.specflow/specs/pulse/usage.spec.md';
  const EVIDENCE_USAGE = recallEntry('evidence', 'Cortex usage over 41 sessions', '.cortex/atlas/evidence/2026-09-15-usage.md', '2026-09-15');
  const T004 = recallEntry('thread', 'Counter location', '.cortex/pulse/threads/T-004-counter-location.md', '2026-09-14');

  it('isMarkedTarget: specs, business specs, compass rules, atlas decisions and evidence, and the schema document — nothing else', () => {
    for (const p of [
      '.specflow/specs/pulse/usage.spec.md',
      '.specflow/specs-business/pulse/team-sees-usage.business.md',
      '.cortex/compass/rules/R-003-x.md',
      '.cortex/atlas/decisions/2026-08-05-x.md',
      '.cortex/atlas/evidence/2026-09-15-usage.md',
      'cortex-schema.md',
    ]) expect(isMarkedTarget(p), p).toBe(true);
    for (const p of [
      'src/pulse/usage.ts',
      '.specflow/specs/pulse/_overview.md',
      '.cortex/atlas/decisions/_index.md',
      '.cortex/atlas/evidence/_index.md',
      '.cortex/compass/bugs/B-018-x.md',
      '.cortex/compass/rules/_index.md',
      'docs/cortex-schema.md',
      'CLAUDE.md',
    ]) expect(isMarkedTarget(p), p).toBe(false);
  });

  it('AC: a spec read with a recall subject gets the marker alone (no insight entry)', async () => {
    const root = makeProject('marker-spec');
    writeRecallIndexFixture(root, recallIndexFixture(
      { 'pulse.usage': recallSubject({ decided: [], evidence: ['evidence.2026-09-15-usage'], threads: ['T-004'] }) },
      { 'evidence.2026-09-15-usage': EVIDENCE_USAGE, 'T-004': T004 },
    ));
    const result = await run(stdinFor(root, path.join(root, USAGE_SPEC)));
    expect(result.exitCode).toBe(0);
    const env = parseEnvelope(result.stdout);
    expect(env.additionalContext).toBe('Evidence: evidence.2026-09-15-usage · Open: T-004');
    expect(env.permissionDecision).toBe('allow');
    expect(Math.ceil(env.additionalContext.length / 4)).toBeLessThanOrEqual(50);
  });

  it('AC: a rule read with three of everything is cut to 3/2/2, newest first, and pointed onward', async () => {
    const root = makeProject('marker-rule');
    const entries: Record<string, ReturnType<typeof recallEntry>> = {};
    for (let i = 1; i <= 4; i++) entries[`decision.2026-09-0${i}-d${i}`] = recallEntry('decision', `d${i}`, `.cortex/atlas/decisions/2026-09-0${i}-d${i}.md`, `2026-09-0${i}`);
    for (let i = 1; i <= 3; i++) entries[`evidence.2026-08-0${i}-e${i}`] = recallEntry('evidence', `e${i}`, `.cortex/atlas/evidence/2026-08-0${i}-e${i}.md`, `2026-08-0${i}`);
    for (let i = 1; i <= 3; i++) entries[`T-00${i}`] = recallEntry('thread', `t${i}`, `.cortex/pulse/threads/T-00${i}-t${i}.md`, `2026-07-0${i}`);
    writeRecallIndexFixture(root, recallIndexFixture(
      {
        'R-003': recallSubject({
          decided: ['decision.2026-09-01-d1', 'decision.2026-09-02-d2', 'decision.2026-09-03-d3', 'decision.2026-09-04-d4'],
          evidence: ['evidence.2026-08-01-e1', 'evidence.2026-08-02-e2', 'evidence.2026-08-03-e3'],
          threads: ['T-001', 'T-002', 'T-003'],
        }),
      },
      entries,
    ));
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, '.cortex/compass/rules/R-003-x.md')))).stdout).additionalContext;
    expect(ctx).toBe(
      'Decided: decision.2026-09-04-d4, decision.2026-09-03-d3, decision.2026-09-02-d2 · Evidence: evidence.2026-08-03-e3, evidence.2026-08-02-e2 · Open: T-003, T-002 · more: cortex why R-003',
    );
  });

  it('AC: the schema document aggregates its clause subjects', async () => {
    const root = makeProject('marker-schema');
    fs.writeFileSync(path.join(root, 'cortex-schema.md'), '## 4. Files\n\n### 4.11 recall-index.json\n\n## 5. Hook payload contracts\n');
    writeRecallIndexFixture(root, recallIndexFixture(
      {
        'schema:§5': recallSubject({ decided: ['decision.2026-08-05-x'] }),
        'schema:§4.11': recallSubject({ threads: ['T-010'] }),
      },
      {
        'decision.2026-08-05-x': recallEntry('decision', 'x', '.cortex/atlas/decisions/2026-08-05-x.md', '2026-08-05'),
        'T-010': recallEntry('thread', 'ten', '.cortex/pulse/threads/T-010-ten.md', '2026-09-10'),
      },
    ));
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, 'cortex-schema.md')))).stdout).additionalContext;
    expect(ctx).toBe('Decided: decision.2026-08-05-x · Open: T-010');
  });

  it('AC: a source file with an insight entry AND a path subject gets summary + invitation, no marker, under 75 tokens', async () => {
    const root = makeProject('marker-source');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.', tokens: 120 });
    writeRecallIndexFixture(root, recallIndexFixture(
      { 'src/a.ts': recallSubject({ decided: ['decision.2026-08-05-x'] }) },
      { 'decision.2026-08-05-x': recallEntry('decision', 'x', '.cortex/atlas/decisions/2026-08-05-x.md', '2026-08-05') },
    ));
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, 'src/a.ts')))).stdout).additionalContext;
    expect(ctx).toBe(
      'src/a.ts: Does A. (~120 tok). Rules: -.\nIf this purpose is wrong or stale after reading, emit: <cortex:purpose file="src/a.ts">corrected one-line purpose</cortex:purpose>',
    );
    expect(ctx).not.toContain('Decided:');
    expect(Math.ceil(ctx.length / 4)).toBeLessThanOrEqual(75);
  });

  it('AC: a spec file with both a (fixture) insight entry and a subject gets the summary then the Decided: line, under 100 tokens', async () => {
    const root = makeProject('marker-both');
    writeInsightEntry(root, USAGE_SPEC, {
      purpose: `Specifies usage.\n\n${READ_TIME_MARKER}alice/sess-1)*`,
      tokens: 900,
    });
    writeRecallIndexFixture(root, recallIndexFixture(
      { 'pulse.usage': recallSubject({ decided: ['decision.2026-08-05-x'] }) },
      { 'decision.2026-08-05-x': recallEntry('decision', 'x', '.cortex/atlas/decisions/2026-08-05-x.md', '2026-08-05') },
    ));
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, USAGE_SPEC)))).stdout).additionalContext;
    expect(ctx).toBe(`${USAGE_SPEC}: Specifies usage. (~900 tok). Rules: -.\nDecided: decision.2026-08-05-x`);
    expect(Math.ceil(ctx.length / 4)).toBeLessThanOrEqual(100);
  });

  it('the marker rides after the summary, the invitation and the duplicate-read note, within the 125-token ceiling', async () => {
    const root = makeProject('marker-order');
    writeInsightEntry(root, USAGE_SPEC, { purpose: 'Specifies usage.' });
    writeRecallIndexFixture(root, recallIndexFixture(
      { 'pulse.usage': recallSubject({ threads: ['T-004'] }) },
      { 'T-004': T004 },
    ));
    await run(stdinFor(root, path.join(root, USAGE_SPEC), 'sess-dup'));
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, USAGE_SPEC), 'sess-dup'))).stdout).additionalContext;
    expect(ctx.split('\n')).toEqual([
      `${USAGE_SPEC}: Specifies usage. (~120 tok). Rules: -.`,
      `If this purpose is wrong or stale after reading, emit: <cortex:purpose file="${USAGE_SPEC}">corrected one-line purpose</cortex:purpose>`,
      '(already read this session)',
      'Open: T-004',
    ]);
    expect(Math.ceil(ctx.length / 4)).toBeLessThanOrEqual(125);
  });

  it('with both, an over-long purpose is trimmed to the extended ceiling — the marker is never cut', async () => {
    const root = makeProject('marker-trim');
    writeInsightEntry(root, USAGE_SPEC, { purpose: 'Painstakingly thorough spec purpose. '.repeat(12).trim() });
    writeRecallIndexFixture(root, recallIndexFixture(
      { 'pulse.usage': recallSubject({ decided: ['decision.2026-08-05-x'], evidence: ['evidence.2026-09-15-usage'] }) },
      {
        'decision.2026-08-05-x': recallEntry('decision', 'x', '.cortex/atlas/decisions/2026-08-05-x.md', '2026-08-05'),
        'evidence.2026-09-15-usage': EVIDENCE_USAGE,
      },
    ));
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, USAGE_SPEC)))).stdout).additionalContext;
    expect(ctx.length).toBeLessThanOrEqual(125 * 4);
    expect(ctx).toContain('…');
    expect(ctx).toContain('</cortex:purpose>');
    expect(ctx.endsWith('\nDecided: decision.2026-08-05-x · Evidence: evidence.2026-09-15-usage')).toBe(true);
  });

  it('AC: no index → no marker, empty stdout (no insight entry either), and hook-errors.md is not created', async () => {
    const root = makeProject('marker-noindex');
    expect(await run(stdinFor(root, path.join(root, USAGE_SPEC)))).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('a malformed index → no marker, nothing logged', async () => {
    const root = makeProject('marker-badindex');
    writeRecallIndexFixture(root, '{not json');
    expect(await run(stdinFor(root, path.join(root, USAGE_SPEC)))).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('an index without a subject for the target → today\'s payload exactly (summary + invitation, no marker)', async () => {
    const root = makeProject('marker-nosubject');
    writeInsightEntry(root, USAGE_SPEC, { purpose: 'Specifies usage.' });
    writeRecallIndexFixture(root, recallIndexFixture(
      { 'pulse.hygiene': recallSubject({ threads: ['T-004'] }) },
      { 'T-004': T004 },
    ));
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, USAGE_SPEC)))).stdout).additionalContext;
    expect(ctx).toBe(
      `${USAGE_SPEC}: Specifies usage. (~120 tok). Rules: -.\nIf this purpose is wrong or stale after reading, emit: <cortex:purpose file="${USAGE_SPEC}">corrected one-line purpose</cortex:purpose>`,
    );
  });

  it('a subject on the parent directory alone does not mark a spec read (the search hook owns directory subjects)', async () => {
    const root = makeProject('marker-parent');
    writeRecallIndexFixture(root, recallIndexFixture(
      { '.specflow/specs/pulse': recallSubject({ threads: ['T-004'] }) },
      { 'T-004': T004 },
    ));
    expect(await run(stdinFor(root, path.join(root, USAGE_SPEC)))).toEqual({ exitCode: 0, stdout: '' });
  });

  it('a subject whose lists are all empty → no marker', async () => {
    const root = makeProject('marker-emptysubject');
    writeRecallIndexFixture(root, recallIndexFixture({ 'pulse.usage': recallSubject({ observations: ['working-style'] }) }, {}));
    expect(await run(stdinFor(root, path.join(root, USAGE_SPEC)))).toEqual({ exitCode: 0, stdout: '' });
  });

  it('a business spec is keyed by its spec id; an atlas decision by its path', async () => {
    const root = makeProject('marker-kinds');
    const dec = recallEntry('decision', 'x', '.cortex/atlas/decisions/2026-08-05-x.md', '2026-08-05');
    writeRecallIndexFixture(root, recallIndexFixture(
      {
        'pulse.team-sees-usage': recallSubject({ decided: ['decision.2026-08-05-x'] }),
        '.cortex/atlas/decisions/2026-08-05-x.md': recallSubject({ threads: ['T-004'] }),
      },
      { 'decision.2026-08-05-x': dec, 'T-004': T004 },
    ));
    const biz = await run(stdinFor(root, path.join(root, '.specflow/specs-business/pulse/team-sees-usage.business.md')));
    expect(parseEnvelope(biz.stdout).additionalContext).toBe('Decided: decision.2026-08-05-x');
    const decRead = await run(stdinFor(root, path.join(root, '.cortex/atlas/decisions/2026-08-05-x.md')));
    expect(parseEnvelope(decRead.stdout).additionalContext).toBe('Open: T-004');
  });

  it('marker budget: an over-long line first drops the more: tail', async () => {
    const root = makeProject('marker-budget-tail');
    const long = (n: number): string => `decision.2026-09-0${n}-` + 'x'.repeat(35);
    const entries: Record<string, ReturnType<typeof recallEntry>> = {};
    const decided: string[] = [];
    for (let n = 1; n <= 4; n++) {
      decided.push(long(n));
      entries[long(n)] = recallEntry('decision', `d${n}`, `.cortex/atlas/decisions/2026-09-0${n}-x.md`, `2026-09-0${n}`);
    }
    entries['T-004'] = T004;
    writeRecallIndexFixture(root, recallIndexFixture({ 'R-003': recallSubject({ decided, threads: ['T-004'] }) }, entries));
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, '.cortex/compass/rules/R-003-x.md')))).stdout).additionalContext;
    // 3 × 55-char ids + separators = 192 chars: fits only once the 24-char tail is dropped.
    expect(ctx).toBe(`Decided: ${long(4)}, ${long(3)}, ${long(2)} · Open: T-004`);
    expect(ctx.length).toBeLessThanOrEqual(200);
  });

  it('marker budget: then Open: is cut to one id, then Decided: to one — ids are never truncated', async () => {
    const root = makeProject('marker-budget-ids');
    const long = (kind: string, n: number): string => `${kind}.2026-09-0${n}-` + 'y'.repeat(30);
    const entries: Record<string, ReturnType<typeof recallEntry>> = {};
    const decided = [1, 2, 3].map((n) => long('decision', n));
    const evidence = [1, 2].map((n) => long('evidence', n));
    for (const id of decided) entries[id] = recallEntry('decision', id, `.cortex/atlas/decisions/${id}.md`, id.slice(9, 19));
    for (const id of evidence) entries[id] = recallEntry('evidence', id, `.cortex/atlas/evidence/${id}.md`, id.slice(9, 19));
    entries['T-004'] = T004;
    entries['T-005'] = recallEntry('thread', 'five', '.cortex/pulse/threads/T-005-five.md', '2026-09-15');
    writeRecallIndexFixture(root, recallIndexFixture({ 'R-003': recallSubject({ decided, evidence, threads: ['T-004', 'T-005'] }) }, entries));
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, '.cortex/compass/rules/R-003-x.md')))).stdout).additionalContext;
    expect(ctx).toBe(`Decided: ${long('decision', 3)} · Evidence: ${long('evidence', 2)}, ${long('evidence', 1)} · Open: T-005`);
    expect(ctx.length).toBeLessThanOrEqual(200);
  });

  it('a malformed insight entry with a marker → the marker alone, plus the one hook-errors entry', async () => {
    const root = makeProject('marker-malformed-entry');
    const p = insightEntryPath(root, USAGE_SPEC);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '---\npath: ' + USAGE_SPEC + '\n---\n\n## Purpose\n\nNo other frontmatter.\n');
    writeRecallIndexFixture(root, recallIndexFixture(
      { 'pulse.usage': recallSubject({ threads: ['T-004'] }) },
      { 'T-004': T004 },
    ));
    const result = await run(stdinFor(root, path.join(root, USAGE_SPEC)));
    expect(parseEnvelope(result.stdout).additionalContext).toBe('Open: T-004');
    expect(fs.readFileSync(hookErrorsPath(root), 'utf-8')).toContain('insight entry unreadable');
  });
});

// ---------------------------------------------------------------------------
// Rule 7: read deferral (3.4 third revision; recall work, step 4) — the ONE
// measured exception to warn-never-block (RULES.md rule 6). Every criterion
// below is a first Read under `hooks.readDefer: true` unless it says otherwise;
// every run with the flag absent or false must be byte-identical to today.
// ---------------------------------------------------------------------------
import {
  isDeferrableKind,
  readDeferPath,
  READ_DEFER_DIR,
  READ_DEFER_MIN_LINES,
  READ_DEFER_CIRCUIT_BREAKER,
  DEFER_REASON_MAX_CHARS,
} from '../../../src/hooks/pre-read.js';
import { writeTranscriptFile } from '../../fixtures/session-end-harness.js';
import { textTurn, skillBaseDirUserTurn, scheduledTaskUserTurn } from '../../fixtures/sessions.js';

const DEFER_ON = { schemaVersion: '3.4', hooks: { preRead: true, readDefer: true }, loop: { enabled: false } };
const DEFER_OFF = { schemaVersion: '3.4', hooks: { preRead: true, readDefer: false }, loop: { enabled: false } };

const A_PURPOSE = 'Counts Cortex usage from session transcripts.';
const A_CONNECTIONS = [
  'Uses:',
  '- src/sessions/read.ts: `listSessions`, `readSessionFile` — the read-only transcript layer',
  '- src/loops/report.ts: `writePulseReport` — the shared pulse-report writer',
  '',
  'Used by:',
  '- src/cli/cli.ts: dynamic import — `cortex usage` dispatches here',
  '',
  'Related:',
  '- src/pulse/hygiene.ts: `READS_RETENTION_DAYS` — not a Uses/Used-by bullet, never rendered',
].join('\n');
const A_INVITE = 'If this purpose is wrong or stale after reading, emit: <cortex:purpose file="src/a.ts">corrected one-line purpose</cortex:purpose>';
const RETRY_SENTENCE = 'Reading this path again proceeds without this notice.';

/** The eligible fixture entry the ACs name: 235 lines, 2532 tokens, a Purpose, Uses/Used-by bullets. */
function writeEligible(root: string, rel = 'src/a.ts', extra: Record<string, unknown> = {}): void {
  writeInsightEntry(root, rel, { purpose: A_PURPOSE, tokens: 2532, lines: 235, connections: A_CONNECTIONS, ...extra });
}

function interactiveTranscript(dir: string, name = 'interactive.jsonl'): string {
  return writeTranscriptFile(dir, [textTurn('user', 'please look at usage'), textTurn('assistant', 'ok')], name);
}

/** A deferral-eligible project: flag on, the entry, an R-001 rule over src/**, an interactive transcript. */
function makeDeferProject(label: string, config: Record<string, unknown> = DEFER_ON): { root: string; transcript: string } {
  const root = makeProject(label, config);
  writeEligible(root);
  writeRule(root, 'R-001-core.md', `id: R-001\ntitle: Core\nsource:\n  - ../bugs/B-001.md\ngoverns:\n  - "src/**/*.ts"`);
  return { root, transcript: interactiveTranscript(root) };
}

function deferStdin(root: string, filePath: string, transcript: string | undefined, sessionId = 's1'): Record<string, unknown> {
  return { ...stdinFor(root, filePath, sessionId), ...(transcript !== undefined ? { transcript_path: transcript } : {}) };
}

function ledgerPath(root: string, sessionId = 's1'): string {
  return path.join(root, '.cortex', READ_DEFER_DIR, sessionId);
}

const EXPECTED_ALLOW = `src/a.ts: ${A_PURPOSE} (~2532 tok). Rules: R-001.\n${A_INVITE}`;

/** Every stdout the criteria produce — "the deny never leaks" is asserted over all of them. */
const seenStdouts: string[] = [];
async function track(p: Promise<{ exitCode: number; stdout: string }>): Promise<{ exitCode: number; stdout: string }> {
  const r = await p;
  seenStdouts.push(r.stdout);
  expect(r.exitCode).toBe(0);
  return r;
}

describe('Rule 7: read deferral — constants and helpers', () => {
  it('the standing-authority constants are pinned', () => {
    expect(READ_DEFER_MIN_LINES).toBe(40);
    expect(READ_DEFER_CIRCUIT_BREAKER).toBe(25);
    expect(DEFER_REASON_MAX_CHARS).toBe(1000);
    expect(READ_DEFER_DIR).toBe('pulse/state/read-deferred');
  });

  it('readDeferPath sanitises the session id like the read-memory does', () => {
    const p = readDeferPath('/proj', '../../etc/passwd');
    expect(path.basename(p)).toBe('.._.._etc_passwd');
    expect(p).toBe(path.join('/proj', '.cortex', 'pulse', 'state', 'read-deferred', '.._.._etc_passwd'));
  });

  it('isDeferrableKind: source files yes; marked targets, .cortex/, .specflow/, RULES.md, CLAUDE.md, the schema doc, _index/_overview no', () => {
    for (const p of ['src/a.ts', 'src/pulse/usage.ts', 'docs/guide.md', 'package.json', 'src/hooks/index.ts']) {
      expect(isDeferrableKind(p), p).toBe(true);
    }
    for (const p of [
      '.specflow/specs/pulse/usage.spec.md',
      '.specflow/specs/pulse/_overview.md',
      '.specflow/specs-business/pulse/team-sees-usage.business.md',
      '.cortex/compass/rules/R-001-core-no-llm-calls.md',
      '.cortex/compass/bugs/B-018-x.md',
      '.cortex/atlas/decisions/2026-08-05-x.md',
      '.cortex/insight/anatomy/src/a.ts.md',
      'cortex-schema.md',
      'RULES.md',
      'CLAUDE.md',
      'src/hooks/_index.md',
      '_index.md',
      'docs/_overview.md',
    ]) expect(isDeferrableKind(p), p).toBe(false);
  });
});

describe('Rule 7: read deferral — the criteria', () => {
  it('AC: flag absent, false, or "yes" → never a deny; the Rule 2 allow payload, no read-deferred/ directory, under 75 tokens', async () => {
    const variants: Array<[string, Record<string, unknown>]> = [
      ['absent', { schemaVersion: '3.4', hooks: { preRead: true }, loop: { enabled: false } }],
      ['false', DEFER_OFF],
      ['yes', { schemaVersion: '3.4', hooks: { preRead: true, readDefer: 'yes' }, loop: { enabled: false } }],
    ];
    for (const [label, config] of variants) {
      const { root, transcript } = makeDeferProject(`flagoff-${label}`, config);
      const result = await track(run(deferStdin(root, path.join(root, 'src/a.ts'), transcript)));
      const env = parseEnvelope(result.stdout);
      expect(env.permissionDecision, label).toBe('allow');
      expect(env.additionalContext, label).toBe(EXPECTED_ALLOW);
      expect(Math.ceil(env.additionalContext.length / 4), label).toBeLessThanOrEqual(75);
      expect(fs.existsSync(path.join(root, '.cortex', READ_DEFER_DIR)), label).toBe(false);
      expect(result.stdout, label).not.toContain('deny');
    }
  });

  it('AC: flag on — the first read of a source file is deferred, with the summary in its place (the four pinned lines)', async () => {
    const { root, transcript } = makeDeferProject('deny');
    const result = await track(run(deferStdin(root, path.join(root, 'src/a.ts'), transcript)));
    const parsed = JSON.parse(result.stdout) as { hookSpecificOutput: Record<string, unknown> };
    expect(Object.keys(parsed)).toEqual(['hookSpecificOutput']);
    expect(Object.keys(parsed.hookSpecificOutput)).toEqual(['hookEventName', 'permissionDecision', 'permissionDecisionReason']);
    const env = parseEnvelope(result.stdout);
    expect(env.hookEventName).toBe('PreToolUse');
    expect(env.permissionDecision).toBe('deny');
    const reason = env.permissionDecisionReason as string;
    const lines = reason.split('\n');
    expect(lines).toEqual([
      `Deferred: src/a.ts (~2532 tok, 235 lines). ${A_PURPOSE}`,
      'Connections: src/sessions/read.ts: `listSessions`, `readSessionFile`; src/loops/report.ts: `writePulseReport`; src/cli/cli.ts: dynamic import',
      'Rules: R-001.',
      RETRY_SENTENCE,
    ]);
    expect(reason.length).toBeLessThanOrEqual(DEFER_REASON_MAX_CHARS);
    // Neither the writeback invitation nor a recall marker rides on a deny.
    expect(reason).not.toContain('<cortex:purpose');
    expect(reason).not.toMatch(/^(Decided|Evidence|Open):/m);
    // The ledger was written; the read-memory was NOT (nothing was read).
    expect(fs.readFileSync(ledgerPath(root), 'utf-8')).toBe('src/a.ts\n');
    expect(fs.existsSync(readsMemoryPath(root, 's1'))).toBe(false);
  });

  it('AC: the retry proceeds with the ordinary payload and no duplicate note; the third read is the duplicate', async () => {
    const { root, transcript } = makeDeferProject('retry');
    const stdin = deferStdin(root, path.join(root, 'src/a.ts'), transcript);
    const first = await track(run(stdin));
    expect(parseEnvelope(first.stdout).permissionDecision).toBe('deny');

    const second = await track(run(stdin));
    const secondEnv = parseEnvelope(second.stdout);
    expect(secondEnv.permissionDecision).toBe('allow');
    expect(secondEnv.additionalContext).toBe(EXPECTED_ALLOW);
    expect(secondEnv.additionalContext).not.toContain('(already read this session)');
    expect(fs.readFileSync(readsMemoryPath(root, 's1'), 'utf-8')).toBe('src/a.ts\n');
    // One deferral per session per file: the ledger did not grow.
    expect(fs.readFileSync(ledgerPath(root), 'utf-8')).toBe('src/a.ts\n');

    const third = await track(run(stdin));
    const thirdEnv = parseEnvelope(third.stdout);
    expect(thirdEnv.permissionDecision).toBe('allow');
    expect(thirdEnv.additionalContext).toBe(`${EXPECTED_ALLOW}\n(already read this session)`);
  });

  it('a path already in the Rule 4 read-memory (read before the flag was switched on) is never deferred', async () => {
    const { root, transcript } = makeDeferProject('memfirst');
    const mem = readsMemoryPath(root, 's1');
    fs.mkdirSync(path.dirname(mem), { recursive: true });
    fs.writeFileSync(mem, 'src/a.ts\n');
    const result = await track(run(deferStdin(root, path.join(root, 'src/a.ts'), transcript)));
    const env = parseEnvelope(result.stdout);
    expect(env.permissionDecision).toBe('allow');
    expect(env.additionalContext).toBe(`${EXPECTED_ALLOW}\n(already read this session)`);
    expect(fs.existsSync(ledgerPath(root))).toBe(false);
  });

  it('AC: gated and scaffolding kinds are never deferred — each payload is byte-identical to the flag-off run', async () => {
    const kinds = [
      '.specflow/specs/pulse/usage.spec.md',
      '.cortex/compass/rules/R-001-core-no-llm-calls.md',
      'cortex-schema.md',
      'RULES.md',
      'src/hooks/_index.md',
    ];
    for (const [i, rel] of kinds.entries()) {
      const on = makeProject(`gated-on-${i}`, DEFER_ON);
      const off = makeProject(`gated-off-${i}`, DEFER_OFF);
      for (const root of [on, off]) {
        writeInsightEntry(root, rel, { purpose: `Describes ${rel}.`, lines: 300, tokens: 900, connections: A_CONNECTIONS });
        fs.writeFileSync(path.join(root, 'cortex-schema.md'), '## 5. Hook payload contracts\n');
      }
      const onResult = await track(run(deferStdin(on, path.join(on, rel), interactiveTranscript(on))));
      const offResult = await track(run(deferStdin(off, path.join(off, rel), interactiveTranscript(off))));
      expect(onResult, rel).toEqual(offResult);
      expect(onResult.stdout, rel).not.toContain('deny');
      expect(parseEnvelope(onResult.stdout).permissionDecision, rel).toBe('allow');
      expect(fs.existsSync(path.join(on, '.cortex', READ_DEFER_DIR)), rel).toBe(false);
    }
  });

  it('AC: a tiny file (39 lines) or one without an entry is never deferred; an entry lacking size_lines is unreadable today (silent + logged), still never a deny', async () => {
    const root = makeProject('tiny', DEFER_ON);
    const transcript = interactiveTranscript(root);
    writeInsightEntry(root, 'src/tiny.ts', { purpose: 'Tiny.', lines: 39, tokens: 300, connections: A_CONNECTIONS });
    const tiny = await track(run(deferStdin(root, path.join(root, 'src/tiny.ts'), transcript)));
    expect(parseEnvelope(tiny.stdout).permissionDecision).toBe('allow');
    expect(parseEnvelope(tiny.stdout).additionalContext.startsWith('src/tiny.ts: Tiny. (~300 tok).')).toBe(true);

    // Exactly 40 lines is the boundary: READ_DEFER_MIN_LINES is inclusive.
    writeInsightEntry(root, 'src/forty.ts', { purpose: 'Forty.', lines: 40, tokens: 300, connections: A_CONNECTIONS });
    const forty = await track(run(deferStdin(root, path.join(root, 'src/forty.ts'), transcript)));
    expect(parseEnvelope(forty.stdout).permissionDecision).toBe('deny');

    // An entry lacking size_lines fails the insight parser (entry.ts) before
    // Rule 7 can see it: today's behaviour is silence plus one log entry, and
    // Rule 7 must not turn that into a deny. (Spec AC says "allow payload" —
    // reported as a spec discrepancy; the parser is not this batch's file.)
    const p = insightEntryPath(root, 'src/nolines.ts');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(
      p,
      `---\npath: src/nolines.ts\nextracted_at: '2026-06-30T14:00:00.000Z'\nextraction_level: 2\nsize_tokens: 900\ncentrality: medium\nbuilt_at_commit: 'abc1234'\nsource_sha256: ${'a'.repeat(64)}\n---\n\n## Purpose\n\nNo lines.\n\n## Connections\n\n- none observed.\n`,
    );
    const nolines = await track(run(deferStdin(root, path.join(root, 'src/nolines.ts'), transcript)));
    expect(nolines).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.readFileSync(hookErrorsPath(root), 'utf-8')).toContain('insight entry unreadable');

    const none = await track(run(deferStdin(root, path.join(root, 'src/none.ts'), transcript)));
    expect(none).toEqual({ exitCode: 0, stdout: '' });

    // Only the 40-line file was deferred; the others never touched the ledger.
    expect(fs.readFileSync(ledgerPath(root), 'utf-8')).toBe('src/forty.ts\n');
  });

  it('AC: the circuit breaker holds at 25 — a 26th eligible file gets the allow payload and the ledger keeps 25 lines', async () => {
    const { root, transcript } = makeDeferProject('breaker');
    const ledger = ledgerPath(root);
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    const held = Array.from({ length: READ_DEFER_CIRCUIT_BREAKER }, (_, i) => `src/held-${i}.ts`);
    fs.writeFileSync(ledger, held.join('\n') + '\n');
    const result = await track(run(deferStdin(root, path.join(root, 'src/a.ts'), transcript)));
    const env = parseEnvelope(result.stdout);
    expect(env.permissionDecision).toBe('allow');
    expect(env.additionalContext).toBe(EXPECTED_ALLOW);
    expect(fs.readFileSync(ledger, 'utf-8').split('\n').filter((l) => l.length > 0)).toHaveLength(25);
  });

  it('at 24 held paths the 25th deferral still happens (the breaker counts lines, strictly fewer than 25)', async () => {
    const { root, transcript } = makeDeferProject('breaker24');
    const ledger = ledgerPath(root);
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.writeFileSync(ledger, Array.from({ length: 24 }, (_, i) => `src/held-${i}.ts`).join('\n') + '\n');
    const result = await track(run(deferStdin(root, path.join(root, 'src/a.ts'), transcript)));
    expect(parseEnvelope(result.stdout).permissionDecision).toBe('deny');
    expect(fs.readFileSync(ledger, 'utf-8').split('\n').filter((l) => l.length > 0)).toHaveLength(25);
  });

  it('AC: scheduled and unknown sessions are never deferred — skill preamble, scheduled-task tag, a missing path, no transcript_path', async () => {
    const { root } = makeDeferProject('sessions');
    const preamble = writeTranscriptFile(root, [skillBaseDirUserTurn(), textTurn('assistant', 'ok')], 'preamble.jsonl');
    const tagged = writeTranscriptFile(root, [scheduledTaskUserTurn(), textTurn('assistant', 'ok')], 'tagged.jsonl');
    const variants: Array<[string, string | undefined]> = [
      ['preamble', preamble],
      ['tag', tagged],
      ['missing', path.join(root, 'nope.jsonl')],
      ['absent', undefined],
    ];
    for (const [label, transcript] of variants) {
      const result = await track(run(deferStdin(root, path.join(root, 'src/a.ts'), transcript, `sess-${label}`)));
      const env = parseEnvelope(result.stdout);
      expect(env.permissionDecision, label).toBe('allow');
      expect(env.additionalContext, label).toBe(EXPECTED_ALLOW);
    }
    expect(fs.existsSync(path.join(root, '.cortex', READ_DEFER_DIR))).toBe(false);
  });

  it('no session_id → no ledger possible → never a deny (the retry guarantee cannot be kept)', async () => {
    const { root, transcript } = makeDeferProject('nosession');
    const stdin = { cwd: root, tool_name: 'Read', tool_input: { file_path: path.join(root, 'src/a.ts') }, transcript_path: transcript };
    const result = await track(run(stdin));
    expect(parseEnvelope(result.stdout).permissionDecision).toBe('allow');
    expect(parseEnvelope(result.stdout).additionalContext).toBe(EXPECTED_ALLOW);
    expect(fs.existsSync(path.join(root, '.cortex', READ_DEFER_DIR))).toBe(false);
  });

  it('AC: an unwritable ledger (a directory in its place) means allow, once logged naming pre-read and the ledger path', async () => {
    const { root, transcript } = makeDeferProject('unwritable');
    fs.mkdirSync(ledgerPath(root), { recursive: true });
    const result = await track(run(deferStdin(root, path.join(root, 'src/a.ts'), transcript)));
    expect(result.exitCode).toBe(0);
    const env = parseEnvelope(result.stdout);
    expect(env.permissionDecision).toBe('allow');
    expect(env.additionalContext).toBe(EXPECTED_ALLOW);
    const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    const entries = log.split('\n').filter((l) => l.startsWith('- hook: '));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain('hook: pre-read');
    expect(entries[0]).toContain('.cortex/pulse/state/read-deferred/s1');
  });

  it('Connections: at most six items, Uses/Used-by bullets only, the " — " tail dropped; "-" when the section has none', async () => {
    const { root, transcript } = makeDeferProject('connections');
    const many = ['Uses:', ...Array.from({ length: 8 }, (_, i) => `- src/u${i}.ts: \`sym${i}\` — why it is used`)].join('\n');
    writeEligible(root, 'src/many.ts', { connections: many });
    const manyResult = await track(run(deferStdin(root, path.join(root, 'src/many.ts'), transcript)));
    const manyLines = (parseEnvelope(manyResult.stdout).permissionDecisionReason as string).split('\n');
    expect(manyLines[1]).toBe('Connections: ' + Array.from({ length: 6 }, (_, i) => `src/u${i}.ts: \`sym${i}\``).join('; '));

    writeEligible(root, 'src/bare.ts', { connections: '- none observed.' });
    const bareResult = await track(run(deferStdin(root, path.join(root, 'src/bare.ts'), transcript)));
    const bareLines = (parseEnvelope(bareResult.stdout).permissionDecisionReason as string).split('\n');
    expect(bareLines[1]).toBe('Connections: -');
    expect(bareLines[2]).toBe('Rules: R-001.');
  });

  it('no governing rule → "Rules: -." on line three', async () => {
    const root = makeProject('norules', DEFER_ON);
    writeEligible(root);
    const result = await track(run(deferStdin(root, path.join(root, 'src/a.ts'), interactiveTranscript(root))));
    const lines = (parseEnvelope(result.stdout).permissionDecisionReason as string).split('\n');
    expect(lines[2]).toBe('Rules: -.');
  });

  it('budget: Connections items are dropped from the end first, the purpose stays whole', async () => {
    const { root, transcript } = makeDeferProject('budget-conn');
    const purpose = 'P'.repeat(600);
    const items = Array.from({ length: 6 }, (_, i) => `- src/very/long/path/to/module-${i}.ts: \`${'s'.repeat(50)}\` — tail`);
    writeEligible(root, 'src/b.ts', { purpose, connections: ['Uses:', ...items].join('\n') });
    const result = await track(run(deferStdin(root, path.join(root, 'src/b.ts'), transcript)));
    const reason = parseEnvelope(result.stdout).permissionDecisionReason as string;
    const lines = reason.split('\n');
    expect(reason.length).toBeLessThanOrEqual(DEFER_REASON_MAX_CHARS);
    expect(lines[0]).toBe(`Deferred: src/b.ts (~2532 tok, 235 lines). ${purpose}`);
    expect(lines[1].startsWith('Connections: src/very/long/path/to/module-0.ts:')).toBe(true);
    expect(lines[1].split('; ').length).toBeLessThan(6);
    expect(lines[1].split('; ').length).toBeGreaterThan(0);
    expect(lines[3]).toBe(RETRY_SENTENCE);
  });

  it('budget: then the purpose is trimmed with …; the first line prefix and the closing sentence are never cut', async () => {
    const { root, transcript } = makeDeferProject('budget-purpose');
    const purpose = 'Q'.repeat(1200);
    writeEligible(root, 'src/c.ts', { purpose, connections: '- none observed.' });
    const result = await track(run(deferStdin(root, path.join(root, 'src/c.ts'), transcript)));
    const reason = parseEnvelope(result.stdout).permissionDecisionReason as string;
    const lines = reason.split('\n');
    expect(reason.length).toBeLessThanOrEqual(DEFER_REASON_MAX_CHARS);
    expect(lines).toHaveLength(4);
    expect(lines[0].startsWith('Deferred: src/c.ts (~2532 tok, 235 lines). QQQ')).toBe(true);
    expect(lines[0].endsWith('…')).toBe(true);
    expect(lines[1]).toBe('Connections: -');
    expect(lines[2]).toBe('Rules: R-001.');
    expect(lines[3]).toBe(RETRY_SENTENCE);
  });

  it('AC: the deny never leaks — across every run above the JSON never contains "ask" or updatedInput, and deny appeared only where named', () => {
    expect(seenStdouts.length).toBeGreaterThan(20);
    for (const out of seenStdouts) {
      expect(out).not.toContain('"ask"');
      expect(out).not.toContain('updatedInput');
    }
    // Denies: the first-read AC, the retry AC's first run, the 40-line boundary, the 24-held run, the two Connections runs, the norules run, the two budget runs = 9.
    expect(seenStdouts.filter((out) => out.includes('"permissionDecision":"deny"'))).toHaveLength(9);
  });
});
