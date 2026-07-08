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
  it('records the path under pulse/.reads-<session_id>', async () => {
    const root = makeProject('memfile');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    await run(stdinFor(root, path.join(root, 'src/a.ts'), 'sess-42'));
    const mem = readsMemoryPath(root, 'sess-42');
    expect(fs.existsSync(mem)).toBe(true);
    expect(fs.readFileSync(mem, 'utf-8')).toBe('src/a.ts\n');
  });

  it('session ids are sanitised into safe filenames', () => {
    const p = readsMemoryPath('/proj', '../../etc/passwd');
    expect(path.basename(p)).toBe('.reads-.._.._etc_passwd');
    expect(p).toContain(path.join('.cortex', 'pulse'));
  });

  it('no session_id → no note, no memory file', async () => {
    const root = makeProject('nosession');
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    const stdin = { cwd: root, tool_input: { file_path: path.join(root, 'src/a.ts') } };
    await run(stdin);
    const second = await run(stdin);
    expect(parseEnvelope(second.stdout).additionalContext).not.toContain('already read');
    expect(fs.readdirSync(path.join(root, '.cortex', 'pulse')).filter((f) => f.startsWith('.reads-'))).toEqual([]);
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
