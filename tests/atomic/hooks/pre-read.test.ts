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
