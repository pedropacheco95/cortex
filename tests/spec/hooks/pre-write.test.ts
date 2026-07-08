/**
 * Spec-level tests — hooks.pre-write (split from the combined
 * tests/spec/hooks/hooks.test.ts per the schema §3 one-file-per-leaf
 * convention; describe blocks moved verbatim, zero behavioural change).
 *
 * End-to-end over tmp fixture projects: handcrafted init-like `.cortex/`
 * skeletons with real compass rule files, driven through the `cortex hook
 * <name>` dispatch (runHook) with raw stdin JSON. One describe per spec AC —
 * 8 in total.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runHook } from '../../../src/hooks/cli.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeRule,
  hookErrorsPath,
  parseEnvelope,
} from '../../fixtures/hooks-harness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`spec-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function stdinJson(fields: Record<string, unknown>): string {
  return JSON.stringify({ session_id: 'spec-session', ...fields });
}

const R014 = `id: R-014
title: No camelCase database columns
source:
  - ../../atlas/decisions/2026-04-12-db-naming.md
governs:
  - "src/db/**/*.ts"`;

describe('AC pre-write.1: path-matching rule warns with ID, title, and source', () => {
  it('Write to src/db/schema.ts under R-014 → allow + warning with all three', async () => {
    const root = tmp('pw1');
    makeCortexProject(root);
    writeRule(root, 'R-014-db-naming.md', R014, 'Columns MUST be snake_case.\n');
    const { exitCode, stdout } = await runHook(
      'pre-write',
      stdinJson({
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: path.join(root, 'src/db/schema.ts'), content: 'export const t = {};' },
        cwd: root,
      }),
    );
    expect(exitCode).toBe(0);
    const env = parseEnvelope(stdout);
    expect(env.permissionDecision).toBe('allow');
    expect(env.additionalContext).toContain('R-014');
    expect(env.additionalContext).toContain('No camelCase database columns');
    expect(env.additionalContext).toContain('../../atlas/decisions/2026-04-12-db-naming.md');
  });
});

describe('AC pre-write.2: content-predicate rule warns on proposed content', () => {
  it('Edit whose new_string contains console.log → warning naming R-020', async () => {
    const root = tmp('pw2');
    makeCortexProject(root);
    writeRule(
      root,
      'R-020-no-console.md',
      `id: R-020
title: No console.log in src
source:
  - ../bugs/B-001-logging.md
governs:
  - "src/**"
check:
  kind: regex
  pattern: "console\\\\.log"
  expect: absent`,
    );
    const { stdout } = await runHook(
      'pre-write',
      stdinJson({
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: path.join(root, 'src/a.ts'),
          old_string: 'x',
          new_string: 'console.log("x")',
        },
        cwd: root,
      }),
    );
    expect(parseEnvelope(stdout).additionalContext).toContain('R-020');
  });
});

describe('AC pre-write.3: no matching rule → empty stdout', () => {
  it('globs match only src/db/** and the Write targets docs/readme.md', async () => {
    const root = tmp('pw3');
    makeCortexProject(root);
    writeRule(root, 'R-014-db-naming.md', R014);
    const result = await runHook(
      'pre-write',
      stdinJson({
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: path.join(root, 'docs/readme.md'), content: '# hi' },
        cwd: root,
      }),
    );
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });
});

describe('AC pre-write.4: never blocks, by envelope', () => {
  it('five simultaneous matches → exit 0, no "deny", no "ask", no updatedInput', async () => {
    const root = tmp('pw4');
    makeCortexProject(root);
    for (let i = 1; i <= 5; i++) {
      writeRule(root, `R-10${i}-r${i}.md`, `id: R-10${i}\ntitle: Rule ${i}\nsource: []\ngoverns:\n  - "src/**"`);
    }
    const { exitCode, stdout } = await runHook(
      'pre-write',
      stdinJson({
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: path.join(root, 'src/hot.ts'), content: 'x' },
        cwd: root,
      }),
    );
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('"deny"');
    expect(stdout).not.toContain('"ask"');
    expect(stdout).not.toContain('updatedInput');
    expect(parseEnvelope(stdout).permissionDecision).toBe('allow');
  });
});

describe('AC pre-write.5: malformed rule file degrades without losing the others', () => {
  it('broken R-001 + valid matching R-002 → R-002 warning, hook-errors names R-001-broken.md', async () => {
    const root = tmp('pw5');
    makeCortexProject(root);
    writeRule(root, 'R-001-broken.md', 'id: {unclosed\nnope');
    writeRule(root, 'R-002-good.md', `id: R-002\ntitle: Good rule\nsource: []\ngoverns:\n  - "src/**"`);
    const { exitCode, stdout } = await runHook(
      'pre-write',
      stdinJson({
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: path.join(root, 'src/a.ts'), content: 'x' },
        cwd: root,
      }),
    );
    expect(exitCode).toBe(0);
    expect(parseEnvelope(stdout).additionalContext).toContain('R-002');
    expect(fs.readFileSync(hookErrorsPath(root), 'utf-8')).toContain('R-001-broken.md');
  });
});

describe('AC pre-write.7: predicate passes on a governed path → silent (B-001 regression)', () => {
  it('R-001 with an expect:absent regex, Write to a governed path with conforming content → exit 0, empty stdout', async () => {
    const root = tmp('pw7');
    makeCortexProject(root);
    writeRule(
      root,
      'R-001-no-llm-sdk.md',
      `id: R-001
title: Core makes no LLM calls
source: []
governs:
  - "src/schema/**"
check:
  kind: regex
  pattern: "@anthropic-ai/"
  expect: absent`,
    );
    const result = await runHook(
      'pre-write',
      stdinJson({
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(root, 'src/schema/clean.ts'),
          content: 'export const pure = true; // no LLM SDK import here',
        },
        cwd: root,
      }),
    );
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });
});

describe('AC pre-write.8: predicateless rule still warns on path match', () => {
  it('R-030 with governs and no check: field → Write to src/db/schema.ts warns naming R-030', async () => {
    const root = tmp('pw8');
    makeCortexProject(root);
    writeRule(
      root,
      'R-030-db-rule.md',
      `id: R-030
title: Database files follow the DB conventions
source: []
governs:
  - "src/db/**"`,
    );
    const { exitCode, stdout } = await runHook(
      'pre-write',
      stdinJson({
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: path.join(root, 'src/db/schema.ts'), content: 'any content at all' },
        cwd: root,
      }),
    );
    expect(exitCode).toBe(0);
    expect(parseEnvelope(stdout).additionalContext).toContain('R-030');
  });
});

describe('AC pre-write.6: retired rules are silent', () => {
  it('path-matching rule with status: retired → empty stdout', async () => {
    const root = tmp('pw6');
    makeCortexProject(root);
    writeRule(
      root,
      'R-060-retired.md',
      `id: R-060\ntitle: Retired rule\nsource: []\nstatus: retired\ngoverns:\n  - "src/**"`,
    );
    const result = await runHook(
      'pre-write',
      stdinJson({
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: path.join(root, 'src/a.ts'), content: 'x' },
        cwd: root,
      }),
    );
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });
});
