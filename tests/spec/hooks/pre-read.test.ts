/**
 * Spec tests — hooks.pre-read-writeback, re-pointed to the insight per-file
 * entry (anatomy deprecation, build-order-v3 step 7): every Acceptance
 * Criterion as a labeled describe, end-to-end through run(stdinJson) over tmp
 * fixture projects (and through `cortex init` + validate for the registration
 * AC).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { run } from '../../../src/hooks/pre-read.js';
import { runHook } from '../../../src/hooks/cli.js';
import { READ_TIME_MARKER } from '../../../src/hooks/post-read.js';
import { init } from '../../../src/cli/init.js';
import { validate } from '../../../src/schema/validate.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeInsightEntry,
  insightEntryPath,
  writeRule,
  parseEnvelope,
} from '../../fixtures/hooks-harness.js';

const TEST_TIMEOUT = 30_000;
const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`pre-read-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** Project with hooks.preRead ON (the default) and an insight module. */
function makeReadProject(label: string): string {
  const root = tmp(label);
  makeCortexProject(root, {
    config: { schemaVersion: '3.0', hooks: { preRead: true }, loop: { enabled: false } },
  });
  return root;
}

function stdinFor(root: string, filePath: string, sessionId = 'sess-1'): Record<string, unknown> {
  return {
    session_id: sessionId,
    cwd: root,
    hook_event_name: 'PreToolUse',
    tool_name: 'Read',
    tool_input: { file_path: filePath },
  };
}

// ---------------------------------------------------------------------------
// AC: Summary plus invitation on a first read
// ---------------------------------------------------------------------------
describe('AC: summary plus invitation on a first read', () => {
  it('additionalContext carries path, entry purpose, size_tokens, rule id, and the instruction line, within 75 tokens', async () => {
    const root = makeReadProject('ac1');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.', tokens: 120 });
    writeRule(root, 'R-001-no-any.md', `id: R-001\ntitle: No any\nsource:\n  - ../bugs/B-001.md\ngoverns:\n  - "src/**/*.ts"`, 'Never use any.\n');
    const result = await run(stdinFor(root, path.join(root, 'src/a.ts')));
    expect(result.exitCode).toBe(0);
    const ctx = parseEnvelope(result.stdout).additionalContext;
    expect(ctx).toContain('src/a.ts: Does A. (~120 tok). Rules: R-001.');
    expect(ctx).toContain('If this purpose is wrong or stale after reading, emit: <cortex:purpose file="src/a.ts">corrected one-line purpose</cortex:purpose>');
    // Budget (spec Rule 2): within 75 tokens at the project-wide chars/4 estimate.
    expect(Math.ceil(ctx.length / 4)).toBeLessThanOrEqual(75);
    // Envelope pinned:
    const env = parseEnvelope(result.stdout);
    expect(env.hookEventName).toBe('PreToolUse');
    expect(env.permissionDecision).toBe('allow');
  });
});

// ---------------------------------------------------------------------------
// AC: read-time provenance suppresses the invitation
// ---------------------------------------------------------------------------
describe('AC: a read-time provenance marker in the Purpose suppresses the invitation', () => {
  it('summary injected without the writeback instruction, within 50 tokens', async () => {
    const root = makeReadProject('ac2');
    writeInsightEntry(root, 'src/a.ts', {
      purpose: `Does A.\n\n${READ_TIME_MARKER}alice/sess-0)*`,
      tokens: 120,
    });
    const result = await run(stdinFor(root, path.join(root, 'src/a.ts')));
    const ctx = parseEnvelope(result.stdout).additionalContext;
    expect(ctx).toContain('src/a.ts: Does A.');
    expect(ctx).not.toContain('<cortex:purpose');
    expect(Math.ceil(ctx.length / 4)).toBeLessThanOrEqual(50);
  });

  it('an extraction-written Purpose (no marker) still invites', async () => {
    const root = makeReadProject('ac2b');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Extraction wrote this.' });
    const result = await run(stdinFor(root, path.join(root, 'src/a.ts')));
    expect(parseEnvelope(result.stdout).additionalContext).toContain('<cortex:purpose file="src/a.ts">');
  });
});

// ---------------------------------------------------------------------------
// AC: file without an insight entry is silent
// ---------------------------------------------------------------------------
describe('AC: file without an insight entry is silent (extraction owns creation)', () => {
  it('a path with no entry → exit 0, empty stdout', async () => {
    const root = makeReadProject('ac3');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    const result = await run(stdinFor(root, path.join(root, 'src/other.ts')));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });

  it('no .cortex/insight/ module at all → silent', async () => {
    const root = tmp('ac3-noinsight');
    makeCortexProject(root, {
      config: { schemaVersion: '3.0', hooks: { preRead: true }, loop: { enabled: false } },
      modules: ['compass', 'atlas', 'pulse'],
    });
    const result = await run(stdinFor(root, path.join(root, 'src/a.ts')));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });

  it('no .cortex/ at all → silent (Rule 3)', async () => {
    const root = tmp('ac3-bare');
    const result = await run(stdinFor(root, path.join(root, 'src/a.ts')));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });

  it('flag off in config → silent even with an entry (Rule 3)', async () => {
    const root = tmp('ac3-off');
    makeCortexProject(root, {
      config: { schemaVersion: '3.0', hooks: { preRead: false }, loop: { enabled: false } },
    });
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    const result = await run(stdinFor(root, path.join(root, 'src/a.ts')));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });
});

// ---------------------------------------------------------------------------
// AC: Duplicate read is noted
// ---------------------------------------------------------------------------
describe('AC: duplicate read is noted', () => {
  it('a second Read of the same path in one session ends with the already-read note', async () => {
    const root = makeReadProject('ac4');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    const first = await run(stdinFor(root, path.join(root, 'src/a.ts'), 'sess-dup'));
    expect(parseEnvelope(first.stdout).additionalContext).not.toContain('(already read this session)');
    const second = await run(stdinFor(root, path.join(root, 'src/a.ts'), 'sess-dup'));
    const ctx = parseEnvelope(second.stdout).additionalContext;
    expect(ctx.endsWith('(already read this session)')).toBe(true);
  });

  it('a different session does NOT see the note (per-session memory)', async () => {
    const root = makeReadProject('ac4b');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    await run(stdinFor(root, path.join(root, 'src/a.ts'), 'sess-one'));
    const other = await run(stdinFor(root, path.join(root, 'src/a.ts'), 'sess-two'));
    expect(parseEnvelope(other.stdout).additionalContext).not.toContain('(already read this session)');
  });
});

// ---------------------------------------------------------------------------
// AC: Flag off → hook not registered
// ---------------------------------------------------------------------------
describe('AC: flag off → hook not registered', () => {
  it(
    'fresh init with hooks.preRead: false → settings.json carries neither pre-read nor post-read, and check.hook-config passes',
    async () => {
      const root = tmp('ac5-proj');
      const home = tmp('ac5-home');
      fs.mkdirSync(path.join(root, '.cortex'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.cortex', 'cortex.config.json'),
        JSON.stringify({ schemaVersion: '3.0', hooks: { preRead: false } }),
      );
      const result = await init(root, { noLlm: true, force: true, home, platform: 'darwin' });
      expect(result.exitCode).toBe(0);
      const settings = fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf-8');
      expect(settings).not.toContain('cortex hook pre-read');
      expect(settings).not.toContain('cortex hook post-read');
      const report = await validate(root, { root });
      expect(report.violations.filter((v) => v.check === 'check.hook-config')).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'fresh init (defaults) writes hooks.preRead: true EXPLICITLY and registers the pair together',
    async () => {
      const root = tmp('ac5b-proj');
      const home = tmp('ac5b-home');
      const result = await init(root, { noLlm: true, home, platform: 'darwin' });
      expect(result.exitCode).toBe(0);
      const config = JSON.parse(fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8'));
      expect(config.hooks).toEqual({ preRead: true, readDefer: false }); // self-documenting explicit defaults (Rule 7a, 3.4 third revision)
      const settings = fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf-8');
      expect(settings).toContain('cortex hook pre-read');
      expect(settings).toContain('cortex hook post-read');
      const report = await validate(root, { root });
      expect(report.violations.filter((v) => v.check === 'check.hook-config')).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// Rules 1 & 5: dispatch and warn-never-block
// ---------------------------------------------------------------------------
describe('Rule 1: cortex hook pre-read dispatches through the hook CLI', () => {
  it('runHook("pre-read", …) emits the same envelope as run()', async () => {
    const root = makeReadProject('dispatch');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    const result = await runHook('pre-read', JSON.stringify(stdinFor(root, path.join(root, 'src/a.ts'))));
    expect(result.exitCode).toBe(0);
    const env = parseEnvelope(result.stdout);
    expect(env.hookEventName).toBe('PreToolUse');
    expect(env.permissionDecision).toBe('allow');
    expect(env.additionalContext).toContain('src/a.ts: Does A.');
  });
});

describe('Rule 5: warn-never-block degradation', () => {
  it('malformed insight entry → exit 0, empty stdout, one hook-errors entry', async () => {
    const root = makeReadProject('degrade');
    const p = insightEntryPath(root, 'src/a.ts');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '---\npath: src/a.ts\nextraction_level: 9\n---\n\nno sections\n');
    const result = await run(stdinFor(root, path.join(root, 'src/a.ts')));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    const log = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'hook-errors.md'), 'utf-8');
    expect(log).toContain('hook: pre-read');
    expect(log).toContain('insight entry unreadable');
  });
});

// ---------------------------------------------------------------------------
// Rule 6: the recall marker over a COMPILED index (3.4 second revision) —
// the integrated slice: real carriers → writeRecallIndex → the hook CLI.
// ---------------------------------------------------------------------------
import { fileURLToPath } from 'url';
import { writeRecallIndex } from '../../../src/recall/index.js';
import { clearRecallIndexCache } from '../../../src/recall/query.js';
import { serialiseThread } from '../../../src/pulse/threads.js';
import { copyDir, writeFile } from '../../fixtures/evidence.js';
import { makeThread } from '../../fixtures/threads.js';
import { hookErrorsPath } from '../../fixtures/hooks-harness.js';

const VALID_FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/valid');

describe('Rule 6: the recall marker rides on reads of specs, rules and the schema document — never on source files', () => {
  afterEach(() => clearRecallIndexCache());

  it('a compiled index marks the spec, the rule and the schema document through `cortex hook pre-read`; the source read is unchanged; nothing is logged', async () => {
    const root = tmp('rule6-compiled');
    copyDir(VALID_FIXTURE, root);
    fs.writeFileSync(
      path.join(root, '.cortex', 'cortex.config.json'),
      JSON.stringify({ schemaVersion: '3.0', hooks: { preRead: true }, loop: { enabled: false } }),
    );
    writeFile(root, 'cortex-schema.md', '## 5. Hook payload contracts\n\n## 6. Cross-reference conventions\n');
    writeFile(root, '.cortex/atlas/evidence/2026-09-15-usage.md', [
      '---',
      'id: evidence.2026-09-15-usage',
      'title: Cortex usage over 41 sessions',
      'date: 2026-09-15T15:58:00Z',
      'kind: measurement',
      'instrument: pulse.usage',
      'bears_on: [schema.validator, "schema:§5"]',
      '---',
      '',
      '# usage',
      '',
    ].join('\n'));
    writeFile(root, '.cortex/atlas/decisions/2026-09-15-b.md', [
      '---',
      'id: decision.2026-09-15-b',
      'title: b',
      'date: 2026-09-15T00:00:00Z',
      'bears_on: [R-001, schema.validator, "schema:§6"]',
      '---',
      '',
      '# b',
      '',
    ].join('\n'));
    const t = makeThread({ id: 'T-001', status: 'open', bears_on: ['R-001'] });
    writeFile(root, '.cortex/pulse/threads/T-001-fixture.md', serialiseThread(t));
    await writeRecallIndex(root);

    const read = async (rel: string) => runHook('pre-read', JSON.stringify(stdinFor(root, path.join(root, rel), 'sess-r6')));

    // A spec read: no insight entry → the marker alone, through the CLI dispatch.
    const spec = await read('.specflow/specs/schema/validator.spec.md');
    expect(spec.exitCode).toBe(0);
    const specEnv = parseEnvelope(spec.stdout);
    expect(specEnv.hookEventName).toBe('PreToolUse');
    expect(specEnv.permissionDecision).toBe('allow');
    expect(specEnv.additionalContext).toBe('Decided: decision.2026-09-15-b · Evidence: evidence.2026-09-15-usage');

    // A compass rule read: the R-NNN key — the decision and the open thread (the evidence cites no decision, so nothing is inherited).
    const rule = await read('.cortex/compass/rules/R-001-sample-rule.md');
    expect(parseEnvelope(rule.stdout).additionalContext).toBe(
      'Decided: decision.2026-09-15-b · Open: T-001',
    );

    // The schema document: every clause subject aggregated (§5 evidence, §6 decision).
    const schema = await read('cortex-schema.md');
    expect(parseEnvelope(schema.stdout).additionalContext).toBe(
      'Decided: decision.2026-09-15-b · Evidence: evidence.2026-09-15-usage',
    );

    // A source file with an insight entry: today's payload, no marker (Rule 6 Notes).
    const source = await read('src/auth/session.ts');
    const sourceCtx = parseEnvelope(source.stdout).additionalContext;
    expect(sourceCtx.startsWith('src/auth/session.ts: ')).toBe(true);
    expect(sourceCtx).not.toMatch(/^(Decided|Evidence|Open):/m);

    // Marker-only reads write no ledger and nothing degrades.
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 7: the read-deferral mode (3.4 third revision; recall work, step 4) —
// the integrated slice through `cortex hook pre-read`: flag on, a real rule,
// an interactive transcript; deny → retry allow → duplicate note, a gated
// read alongside is never deferred, and the flag-off run is today's payload.
// ---------------------------------------------------------------------------
import { READ_DEFER_DIR, readsMemoryPath } from '../../../src/hooks/pre-read.js';
import { checkConfig } from '../../../src/schema/checks/config.js';
import { writeTranscriptFile } from '../../fixtures/session-end-harness.js';
import { textTurn } from '../../fixtures/sessions.js';

describe('Rule 7: one deny per file per session, the retry always proceeds, gated kinds and the flag-off project untouched', () => {
  const PURPOSE = 'Counts Cortex usage from session transcripts.';
  const CONNECTIONS = [
    'Uses:',
    '- src/sessions/read.ts: `listSessions`, `readSessionFile` — the read-only transcript layer',
    '',
    'Used by:',
    '- src/cli/cli.ts: dynamic import — `cortex usage` dispatches here',
  ].join('\n');

  function seed(root: string, readDefer: boolean): string {
    makeCortexProject(root, {
      config: { schemaVersion: '3.4', hooks: { preRead: true, readDefer }, loop: { enabled: false } },
    });
    writeInsightEntry(root, 'src/pulse/usage.ts', { purpose: PURPOSE, tokens: 3320, lines: 302, connections: CONNECTIONS });
    writeInsightEntry(root, '.specflow/specs/pulse/usage.spec.md', { purpose: 'Specifies usage.', tokens: 900, lines: 300 });
    writeRule(root, 'R-001-core.md', `id: R-001\ntitle: Core\nsource:\n  - ../bugs/B-001.md\ngoverns:\n  - "src/**/*.ts"`);
    return writeTranscriptFile(root, [textTurn('user', 'why is usage low?'), textTurn('assistant', 'let me look')]);
  }

  const readVia = (root: string, transcript: string, rel: string) =>
    runHook('pre-read', JSON.stringify({ ...stdinFor(root, path.join(root, rel), 'sess-r7'), transcript_path: transcript }));

  it('through the hook CLI: deny with the four-line reason, then allow without the note, then the note; the spec read is never deferred', async () => {
    const root = tmp('rule7-on');
    const transcript = seed(root, true);
    // check.config is quiet for a well-formed `true` beside `preRead: true`.
    expect(checkConfig(root).violations.filter((v) => String(v.location.key ?? '').includes('readDefer'))).toEqual([]);

    const first = await readVia(root, transcript, 'src/pulse/usage.ts');
    expect(first.exitCode).toBe(0);
    const firstEnv = parseEnvelope(first.stdout);
    expect(firstEnv.hookEventName).toBe('PreToolUse');
    expect(firstEnv.permissionDecision).toBe('deny');
    expect((firstEnv.permissionDecisionReason as string).split('\n')).toEqual([
      `Deferred: src/pulse/usage.ts (~3320 tok, 302 lines). ${PURPOSE}`,
      'Connections: src/sessions/read.ts: `listSessions`, `readSessionFile`; src/cli/cli.ts: dynamic import',
      'Rules: R-001.',
      'Reading this path again proceeds without this notice.',
    ]);
    expect((firstEnv.permissionDecisionReason as string).length).toBeLessThanOrEqual(1000);
    expect(fs.readFileSync(path.join(root, '.cortex', READ_DEFER_DIR, 'sess-r7'), 'utf-8')).toBe('src/pulse/usage.ts\n');
    expect(fs.existsSync(readsMemoryPath(root, 'sess-r7'))).toBe(false);

    const second = await readVia(root, transcript, 'src/pulse/usage.ts');
    const secondEnv = parseEnvelope(second.stdout);
    expect(secondEnv.permissionDecision).toBe('allow');
    expect(secondEnv.additionalContext).toBe(
      `src/pulse/usage.ts: ${PURPOSE} (~3320 tok). Rules: R-001.\nIf this purpose is wrong or stale after reading, emit: <cortex:purpose file="src/pulse/usage.ts">corrected one-line purpose</cortex:purpose>`,
    );
    expect(fs.readFileSync(readsMemoryPath(root, 'sess-r7'), 'utf-8')).toBe('src/pulse/usage.ts\n');

    const third = await readVia(root, transcript, 'src/pulse/usage.ts');
    expect(parseEnvelope(third.stdout).additionalContext.endsWith('\n(already read this session)')).toBe(true);

    // A gated kind in the same session, with an entry and 300 lines: the ordinary payload, ledger unchanged.
    const spec = await readVia(root, transcript, '.specflow/specs/pulse/usage.spec.md');
    const specEnv = parseEnvelope(spec.stdout);
    expect(specEnv.permissionDecision).toBe('allow');
    expect(specEnv.additionalContext.startsWith('.specflow/specs/pulse/usage.spec.md: Specifies usage. (~900 tok).')).toBe(true);
    expect(fs.readFileSync(path.join(root, '.cortex', READ_DEFER_DIR, 'sess-r7'), 'utf-8')).toBe('src/pulse/usage.ts\n');

    for (const r of [first, second, third, spec]) {
      expect(r.exitCode).toBe(0);
      expect(r.stdout).not.toContain('"ask"');
      expect(r.stdout).not.toContain('updatedInput');
    }
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  }, TEST_TIMEOUT);

  it('the same first read with readDefer: false is today\'s payload and creates no ledger', async () => {
    const root = tmp('rule7-off');
    const transcript = seed(root, false);
    const result = await readVia(root, transcript, 'src/pulse/usage.ts');
    const env = parseEnvelope(result.stdout);
    expect(env.permissionDecision).toBe('allow');
    expect(env.additionalContext).toBe(
      `src/pulse/usage.ts: ${PURPOSE} (~3320 tok). Rules: R-001.\nIf this purpose is wrong or stale after reading, emit: <cortex:purpose file="src/pulse/usage.ts">corrected one-line purpose</cortex:purpose>`,
    );
    expect(fs.existsSync(path.join(root, '.cortex', READ_DEFER_DIR))).toBe(false);
    expect(fs.readFileSync(readsMemoryPath(root, 'sess-r7'), 'utf-8')).toBe('src/pulse/usage.ts\n');
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 8: the stale marker (2026-09-17) — the integrated slice through
// `cortex hook pre-read`: the Rule 7 seed with the source on disk and an entry
// whose hash no longer matches it. Deny reason line one and the allow summary
// line both end with ` (stale: built at <7-char commit>)`; a fresh entry is
// byte-identical to the Rule 7 runs above.
// ---------------------------------------------------------------------------
import { sha256Of } from '../../../src/insight/refresh-fast.js';

describe('Rule 8: the stale marker rides on the deny reason and on the summary line, never on a fresh entry', () => {
  const PURPOSE = 'Counts Cortex usage from session transcripts.';
  const CONNECTIONS = [
    'Uses:',
    '- src/sessions/read.ts: `listSessions`, `readSessionFile` — the read-only transcript layer',
    '',
    'Used by:',
    '- src/cli/cli.ts: dynamic import — `cortex usage` dispatches here',
  ].join('\n');
  const BODY = 'export async function runUsage(): Promise<number> {\n  return 0;\n}\n';
  const INVITE = 'If this purpose is wrong or stale after reading, emit: <cortex:purpose file="src/pulse/usage.ts">corrected one-line purpose</cortex:purpose>';

  function seed(root: string, readDefer: boolean, sha256: string): string {
    makeCortexProject(root, {
      config: { schemaVersion: '3.4', hooks: { preRead: true, readDefer }, loop: { enabled: false } },
    });
    fs.mkdirSync(path.join(root, 'src', 'pulse'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'pulse', 'usage.ts'), BODY);
    writeInsightEntry(root, 'src/pulse/usage.ts', {
      purpose: PURPOSE,
      tokens: 3320,
      lines: 302,
      connections: CONNECTIONS,
      sha256,
      builtAtCommit: 'c2de5f6a1b2c3d4e',
    });
    writeRule(root, 'R-001-core.md', `id: R-001\ntitle: Core\nsource:\n  - ../bugs/B-001.md\ngoverns:\n  - "src/**/*.ts"`);
    return writeTranscriptFile(root, [textTurn('user', 'why is usage low?'), textTurn('assistant', 'let me look')]);
  }

  const readVia = (root: string, transcript: string, rel: string) =>
    runHook('pre-read', JSON.stringify({ ...stdinFor(root, path.join(root, rel), 'sess-r8'), transcript_path: transcript }));

  it('readDefer on, a stale entry: the deny reason\'s first line ends with the marker; the other three lines are unchanged; ≤1,000 chars; nothing logged', async () => {
    const root = tmp('rule8-deny');
    const transcript = seed(root, true, 'f'.repeat(64));
    const first = await readVia(root, transcript, 'src/pulse/usage.ts');
    expect(first.exitCode).toBe(0);
    const env = parseEnvelope(first.stdout);
    expect(env.permissionDecision).toBe('deny');
    const reason = env.permissionDecisionReason as string;
    expect(reason.split('\n')).toEqual([
      `Deferred: src/pulse/usage.ts (~3320 tok, 302 lines). ${PURPOSE} (stale: built at c2de5f6)`,
      'Connections: src/sessions/read.ts: `listSessions`, `readSessionFile`; src/cli/cli.ts: dynamic import',
      'Rules: R-001.',
      'Reading this path again proceeds without this notice.',
    ]);
    expect(reason.length).toBeLessThanOrEqual(1000);

    // The retry: the ordinary payload, its summary line marked the same way.
    const second = await readVia(root, transcript, 'src/pulse/usage.ts');
    const secondEnv = parseEnvelope(second.stdout);
    expect(secondEnv.permissionDecision).toBe('allow');
    expect(secondEnv.additionalContext).toBe(
      `src/pulse/usage.ts: ${PURPOSE} (~3320 tok). Rules: R-001. (stale: built at c2de5f6)\n${INVITE}`,
    );
    expect(Math.ceil(secondEnv.additionalContext.length / 4)).toBeLessThanOrEqual(75);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  }, TEST_TIMEOUT);

  it('readDefer off, a stale entry: the summary line ends with the marker, the invitation follows unchanged', async () => {
    const root = tmp('rule8-allow');
    const transcript = seed(root, false, 'f'.repeat(64));
    const result = await readVia(root, transcript, 'src/pulse/usage.ts');
    const env = parseEnvelope(result.stdout);
    expect(env.permissionDecision).toBe('allow');
    expect(env.additionalContext).toBe(
      `src/pulse/usage.ts: ${PURPOSE} (~3320 tok). Rules: R-001. (stale: built at c2de5f6)\n${INVITE}`,
    );
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  }, TEST_TIMEOUT);

  it('a fresh entry (source_sha256 hashes the body) is byte-identical to the Rule 7 payloads — no marker anywhere', async () => {
    const root = tmp('rule8-fresh');
    const transcript = seed(root, true, sha256Of(BODY));
    const first = parseEnvelope((await readVia(root, transcript, 'src/pulse/usage.ts')).stdout);
    expect(first.permissionDecision).toBe('deny');
    expect((first.permissionDecisionReason as string).split('\n')[0]).toBe(`Deferred: src/pulse/usage.ts (~3320 tok, 302 lines). ${PURPOSE}`);
    const second = parseEnvelope((await readVia(root, transcript, 'src/pulse/usage.ts')).stdout);
    expect(second.additionalContext).toBe(`src/pulse/usage.ts: ${PURPOSE} (~3320 tok). Rules: R-001.\n${INVITE}`);
    expect(first.permissionDecisionReason).not.toContain('stale');
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Rule 6, Bugs part (3.4 fifth revision): through the real compiler and the
// hook CLI — an open bug on the fixture's source file rides the marker alone.
// ---------------------------------------------------------------------------
import { writeRecallIndex as compileRecall } from '../../../src/recall/index.js';

describe('Rule 6 (fifth revision): an open bug on a source file rides the marker alone through `cortex hook pre-read`', () => {
  afterEach(() => clearRecallIndexCache());

  it('a compiled index with B-019 affecting src/auth/session.ts → summary, invitation, then `Bugs: B-019`; resolved → no marker', async () => {
    const root = tmp('rule6-bugs');
    copyDir(VALID_FIXTURE, root);
    fs.writeFileSync(
      path.join(root, '.cortex', 'cortex.config.json'),
      JSON.stringify({ schemaVersion: '3.4', hooks: { preRead: true }, loop: { enabled: false } }),
    );
    writeFile(root, 'src/auth/session.ts', 'export const session = 1;\n');
    const bugFile = '.cortex/compass/bugs/B-019-session-leak.md';
    const bug = (status: string): string =>
      ['---', 'id: B-019', 'title: Session leaks across requests', 'type: incomplete-rule', 'severity: high', `status: ${status}`, 'affects: [src/auth/session.ts, schema.validator]', 'opened: 2026-09-15T17:00:00Z', '---', '', '# B-019', ''].join('\n');
    writeFile(root, bugFile, bug('open'));
    await compileRecall(root);

    const read = async (rel: string, session: string) => runHook('pre-read', JSON.stringify(stdinFor(root, path.join(root, rel), session)));
    const source = await read('src/auth/session.ts', 'sess-bugs');
    expect(source.exitCode).toBe(0);
    const lines = parseEnvelope(source.stdout).additionalContext.split('\n');
    expect(lines[0]?.startsWith('src/auth/session.ts: ')).toBe(true);
    expect(lines[1]?.startsWith('If this purpose is wrong or stale after reading, emit: <cortex:purpose file="src/auth/session.ts">')).toBe(true);
    expect(lines[2]).toBe('Bugs: B-019');
    expect(lines).toHaveLength(3);
    expect(Math.ceil(lines.join('\n').length / 4)).toBeLessThanOrEqual(125);

    const spec = await read('.specflow/specs/schema/validator.spec.md', 'sess-bugs');
    expect(parseEnvelope(spec.stdout).additionalContext).toBe('Bugs: B-019');

    writeFile(root, bugFile, bug('resolved'));
    clearRecallIndexCache();
    await compileRecall(root);
    const again = await read('src/auth/session.ts', 'sess-bugs-2');
    expect(parseEnvelope(again.stdout).additionalContext.split('\n')).toHaveLength(2);
    expect(parseEnvelope(again.stdout).additionalContext).not.toContain('Bugs:');
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  }, TEST_TIMEOUT);
});
