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
      expect(config.hooks).toEqual({ preRead: true }); // self-documenting explicit default
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
