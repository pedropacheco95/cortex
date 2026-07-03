/**
 * Atomic tests — hooks.pre-read internals: payload composition (specs/rules
 * empty states, retired rules), the invitation gate per provenance value, the
 * per-session read-memory file, budget trimming, config-flag defaults, and
 * degradation paths.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { run, readsMemoryPath } from '../../../src/hooks/pre-read.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeFilesMd,
  writeRule,
  parseEnvelope,
  hookErrorsPath,
} from '../../fixtures/hooks-harness.js';

const SHA = 'a'.repeat(64);
const SEEN = '2026-06-30T14:00:00.000Z';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`pre-read-atomic-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

const ON_CONFIG = { schemaVersion: '1.0', hooks: { preRead: true }, loop: { enabled: false } };

function makeProject(label: string, rows: string[], config: Record<string, unknown> = ON_CONFIG): string {
  const root = tmp(label);
  makeCortexProject(root, { config });
  writeFilesMd(root, rows);
  return root;
}

function stdinFor(root: string, filePath: string, sessionId = 's1'): Record<string, unknown> {
  return { session_id: sessionId, cwd: root, tool_name: 'Read', tool_input: { file_path: filePath } };
}

describe('payload composition: empty states and rule matching', () => {
  it('no spec links and no rules → "Specs: -." and "Rules: -."', async () => {
    const root = makeProject('empty', [`| src/a.ts | Does A. | 120 | ${SHA} | ${SEEN} | - | false | scanner-llm |`]);
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, 'src/a.ts')))).stdout).additionalContext;
    expect(ctx).toContain('Specs: -.');
    expect(ctx).toContain('Rules: -.');
  });

  it('governs-matching rules listed by id; non-matching and retired rules omitted', async () => {
    const root = makeProject('rules', [`| src/a.ts | Does A. | 120 | ${SHA} | ${SEEN} | - | false | scanner-llm |`]);
    writeRule(root, 'R-001-match.md', `id: R-001\ntitle: Match\nsource:\n  - ../bugs/B-001.md\ngoverns:\n  - "src/**/*.ts"`);
    writeRule(root, 'R-002-nomatch.md', `id: R-002\ntitle: No match\nsource:\n  - ../bugs/B-001.md\ngoverns:\n  - "docs/**"`);
    writeRule(root, 'R-003-retired.md', `id: R-003\ntitle: Retired\nstatus: retired\nsource:\n  - ../bugs/B-001.md\ngoverns:\n  - "src/**"`);
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, 'src/a.ts')))).stdout).additionalContext;
    expect(ctx).toContain('Rules: R-001.');
    expect(ctx).not.toContain('R-002');
    expect(ctx).not.toContain('R-003');
  });

  it('a relative stdin file_path resolves against the project root', async () => {
    const root = makeProject('relpath', [`| src/a.ts | Does A. | 120 | ${SHA} | ${SEEN} | - | false | scanner-llm |`]);
    const ctx = parseEnvelope((await run(stdinFor(root, 'src/a.ts'))).stdout).additionalContext;
    expect(ctx).toContain('src/a.ts: Does A.');
  });
});

describe('config flag: absent means ON (§10.1 default true)', () => {
  it('config without a hooks key still emits the summary', async () => {
    const root = makeProject('default-on', [`| src/a.ts | Does A. | 120 | ${SHA} | ${SEEN} | - | false | scanner-llm |`], {
      schemaVersion: '1.0',
      loop: { enabled: false },
    });
    const result = await run(stdinFor(root, path.join(root, 'src/a.ts')));
    expect(parseEnvelope(result.stdout).additionalContext).toContain('src/a.ts: Does A.');
  });
});

describe('per-session read-memory (the duplicate-read engineering call)', () => {
  it('records the path under pulse/.reads-<session_id>', async () => {
    const root = makeProject('memfile', [`| src/a.ts | Does A. | 120 | ${SHA} | ${SEEN} | - | false | scanner-llm |`]);
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
    const root = makeProject('nosession', [`| src/a.ts | Does A. | 120 | ${SHA} | ${SEEN} | - | false | scanner-llm |`]);
    const stdin = { cwd: root, tool_input: { file_path: path.join(root, 'src/a.ts') } };
    await run(stdin);
    const second = await run(stdin);
    expect(parseEnvelope(second.stdout).additionalContext).not.toContain('already read');
    expect(fs.readdirSync(path.join(root, '.cortex', 'pulse')).filter((f) => f.startsWith('.reads-'))).toEqual([]);
  });
});

describe('budget enforcement: the purpose is trimmed, never the tag', () => {
  it('an over-budget purpose is trimmed so the payload fits <75 tokens and the tag stays intact', async () => {
    const longPurpose = 'Extremely detailed purpose. '.repeat(10).trim(); // ~280 chars
    const root = makeProject('budget', [
      `| src/a.ts | ${longPurpose} | 120 | ${SHA} | ${SEEN} | - | false | scanner-llm |`,
    ]);
    const ctx = parseEnvelope((await run(stdinFor(root, path.join(root, 'src/a.ts')))).stdout).additionalContext;
    expect(Math.ceil(ctx.length / 4)).toBeLessThanOrEqual(75);
    expect(ctx).toContain('</cortex:purpose>'); // the invitation tag is never cut
    expect(ctx).toContain('…'); // the purpose was trimmed, visibly
  });
});

describe('silence and degradation', () => {
  it('no tool_input.file_path → silent', async () => {
    const root = makeProject('nofile', [`| src/a.ts | Does A. | 120 | ${SHA} | ${SEEN} | - | false | scanner-llm |`]);
    expect(await run({ cwd: root, tool_input: {} })).toEqual({ exitCode: 0, stdout: '' });
  });

  it('missing files.md (unscanned project) → silent, no pulse entry', async () => {
    const root = tmp('nofilesmd');
    makeCortexProject(root, { config: ON_CONFIG });
    expect(await run(stdinFor(root, path.join(root, 'src/a.ts')))).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('a path outside the project root → silent', async () => {
    const root = makeProject('outside', [`| src/a.ts | Does A. | 120 | ${SHA} | ${SEEN} | - | false | scanner-llm |`]);
    expect(await run(stdinFor(root, '/etc/hosts'))).toEqual({ exitCode: 0, stdout: '' });
  });

  it('malformed stdin → silent', async () => {
    expect(await run(42, { cwd: tmp('badstdin') })).toEqual({ exitCode: 0, stdout: '' });
  });
});
