/**
 * Atomic tests — hooks.pre-write (two-stage Rule 4 matching revised per B-001:
 * predicate-bearing rules warn only when the predicate fires, predicateless
 * rules warn on governs path match; warning text, warn-never-block envelope,
 * every degradation path).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { run } from '../../../src/hooks/pre-write.js';
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
  const d = makeTmpDir(label);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function writeStdin(root: string, filePath: string, content: string): Record<string, unknown> {
  return {
    session_id: 's1',
    cwd: root,
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: filePath, content },
  };
}

function editStdin(root: string, filePath: string, newString: string): Record<string, unknown> {
  return {
    session_id: 's1',
    cwd: root,
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: filePath, old_string: 'old', new_string: newString },
  };
}

const DB_RULE = `id: R-014
title: No camelCase database columns
source:
  - ../../atlas/decisions/2026-04-12-db-naming.md
governs:
  - "src/db/**/*.ts"`;

describe('path matching via governs globs (Rule 4a)', () => {
  it('warns with rule ID, title, and source on a governs match', async () => {
    const root = tmp('path');
    makeCortexProject(root);
    writeRule(root, 'R-014-db-naming.md', DB_RULE, 'Columns MUST be snake_case.\n');
    const { exitCode, stdout } = await run(writeStdin(root, path.join(root, 'src/db/schema.ts'), 'x'));
    expect(exitCode).toBe(0);
    const env = parseEnvelope(stdout);
    expect(env.hookEventName).toBe('PreToolUse');
    expect(env.permissionDecision).toBe('allow');
    expect(env.additionalContext).toContain('R-014');
    expect(env.additionalContext).toContain('No camelCase database columns');
    expect(env.additionalContext).toContain('../../atlas/decisions/2026-04-12-db-naming.md');
    expect(env.additionalContext).toContain('Columns MUST be snake_case.');
  });

  it('relativises the absolute tool_input.file_path against the project root', async () => {
    const root = tmp('relativise');
    makeCortexProject(root);
    writeRule(root, 'R-014-db-naming.md', DB_RULE);
    const { stdout } = await run(writeStdin(root, path.join(root, 'src', 'db', 'x.ts'), ''));
    expect(parseEnvelope(stdout).additionalContext).toContain('may apply to src/db/x.ts');
  });

  it('non-matching path → exit 0, EMPTY stdout (Rule 3)', async () => {
    const root = tmp('nomatch');
    makeCortexProject(root);
    writeRule(root, 'R-014-db-naming.md', DB_RULE);
    const result = await run(writeStdin(root, path.join(root, 'docs/readme.md'), 'x'));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });
});

describe('content predicates (Rule 4b)', () => {
  const LOG_RULE = `id: R-020
title: No console.log in src
source:
  - ../bugs/B-001-logging.md
governs:
  - "src/**"
check:
  kind: regex
  pattern: "console\\\\.log"
  expect: absent`;

  it('warns when an Edit new_string matches an expect:absent regex', async () => {
    const root = tmp('editcontent');
    makeCortexProject(root);
    writeRule(root, 'R-020-no-console-log.md', LOG_RULE);
    const { stdout } = await run(editStdin(root, path.join(root, 'src/a.ts'), 'console.log("x")'));
    expect(parseEnvelope(stdout).additionalContext).toContain('R-020');
  });

  it('warns via applies_to even when governs does not match the path', async () => {
    const root = tmp('appliesto');
    makeCortexProject(root);
    writeRule(
      root,
      'R-021-no-console-anywhere.md',
      `id: R-021
title: No console.log in scripts either
source:
  - ../bugs/B-002.md
governs:
  - "src/db/**"
check:
  kind: regex
  applies_to: "scripts/**"
  pattern: "console\\\\.log"
  expect: absent`,
    );
    const { stdout } = await run(writeStdin(root, path.join(root, 'scripts/run.ts'), 'console.log(1)'));
    expect(parseEnvelope(stdout).additionalContext).toContain('R-021');
  });

  it('Write uses tool_input.content: clean content on a non-governed path stays silent', async () => {
    const root = tmp('cleancontent');
    makeCortexProject(root);
    writeRule(
      root,
      'R-021-no-console-anywhere.md',
      `id: R-021
title: No console.log
source: []
governs:
  - "src/db/**"
check:
  kind: regex
  applies_to: "scripts/**"
  pattern: "console\\\\.log"
  expect: absent`,
    );
    const result = await run(writeStdin(root, path.join(root, 'scripts/run.ts'), 'const x = 1;'));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });

  it('expect: present → warns when the required pattern is missing', async () => {
    const root = tmp('present');
    makeCortexProject(root);
    writeRule(
      root,
      'R-022-license-header.md',
      `id: R-022
title: License header required
source: []
governs:
  - "src/db/**"
check:
  kind: grep
  applies_to: "lib/**/*.ts"
  pattern: "SPDX-License-Identifier"
  expect: present`,
    );
    const missing = await run(writeStdin(root, path.join(root, 'lib/a.ts'), 'no header here'));
    expect(parseEnvelope(missing.stdout).additionalContext).toContain('R-022');
    const has = await run(writeStdin(root, path.join(root, 'lib/a.ts'), '// SPDX-License-Identifier: MIT'));
    expect(has).toEqual({ exitCode: 0, stdout: '' });
  });

  it('kind: ast is never content-evaluated — path match only (Rule 4)', async () => {
    const root = tmp('ast');
    makeCortexProject(root);
    writeRule(
      root,
      'R-030-ast-rule.md',
      `id: R-030
title: AST-checked rule
source: []
governs:
  - "src/db/**"
check:
  kind: ast
  applies_to: "**/*.ts"
  pattern: "(call_expression)"
  expect: absent`,
    );
    // applies_to matches and content would "match" anything — but ast is skipped:
    const offPath = await run(writeStdin(root, path.join(root, 'other/x.ts'), '(call_expression)'));
    expect(offPath).toEqual({ exitCode: 0, stdout: '' });
    // governs path match still warns:
    const onPath = await run(writeStdin(root, path.join(root, 'src/db/x.ts'), ''));
    expect(parseEnvelope(onPath.stdout).additionalContext).toContain('R-030');
  });
});

describe('two-stage split: predicate-bearing vs predicateless (Rule 4, revised per B-001)', () => {
  const SDK_RULE = `id: R-001
title: Core makes no LLM calls
source: []
governs:
  - "src/schema/**"
check:
  kind: regex
  pattern: "@anthropic-ai/"
  expect: absent`;

  it('predicate passes on a governed path → silent (B-001 regression)', async () => {
    const root = tmp('b001-silent');
    makeCortexProject(root);
    writeRule(root, 'R-001-no-llm-sdk.md', SDK_RULE);
    const result = await run(
      writeStdin(root, path.join(root, 'src/schema/clean.ts'), 'export const pure = 1;'),
    );
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });

  it('predicate fires on the same governed path → warns', async () => {
    const root = tmp('b001-fires');
    makeCortexProject(root);
    writeRule(root, 'R-001-no-llm-sdk.md', SDK_RULE);
    const { exitCode, stdout } = await run(
      writeStdin(root, path.join(root, 'src/schema/dirty.ts'), 'import Anthropic from "@anthropic-ai/sdk";'),
    );
    expect(exitCode).toBe(0);
    expect(parseEnvelope(stdout).additionalContext).toContain('R-001');
  });

  it('predicateless rule (check: absent) still warns on path match', async () => {
    const root = tmp('b001-predicateless');
    makeCortexProject(root);
    writeRule(root, 'R-030-db-rule.md', `id: R-030\ntitle: DB conventions\nsource: []\ngoverns:\n  - "src/db/**"`);
    const { stdout } = await run(writeStdin(root, path.join(root, 'src/db/schema.ts'), 'anything'));
    expect(parseEnvelope(stdout).additionalContext).toContain('R-030');
  });

  it('kind: none is predicateless — warns on path match regardless of content', async () => {
    const root = tmp('b001-none');
    makeCortexProject(root);
    writeRule(
      root,
      'R-031-none.md',
      `id: R-031
title: Unevaluable rule
source: []
governs:
  - "src/db/**"
check:
  kind: none`,
    );
    const { stdout } = await run(writeStdin(root, path.join(root, 'src/db/x.ts'), 'clean content'));
    expect(parseEnvelope(stdout).additionalContext).toContain('R-031');
  });

  it('kind: regex without a pattern is nothing the hook can evaluate — falls back to path-match warning', async () => {
    const root = tmp('b001-nopattern');
    makeCortexProject(root);
    writeRule(
      root,
      'R-032-no-pattern.md',
      `id: R-032
title: Broken check rule
source: []
governs:
  - "src/db/**"
check:
  kind: regex
  expect: absent`,
    );
    const { stdout } = await run(writeStdin(root, path.join(root, 'src/db/x.ts'), 'clean content'));
    expect(parseEnvelope(stdout).additionalContext).toContain('R-032');
  });
});

describe('never blocks, by envelope (Rule 2)', () => {
  it('five matching rules → one allow envelope, no deny/ask/updatedInput, exit 0', async () => {
    const root = tmp('five');
    makeCortexProject(root);
    for (let i = 1; i <= 5; i++) {
      writeRule(
        root,
        `R-00${i}-rule${i}.md`,
        `id: R-00${i}\ntitle: Rule ${i}\nsource: []\ngoverns:\n  - "src/**"`,
      );
    }
    const { exitCode, stdout } = await run(writeStdin(root, path.join(root, 'src/a.ts'), 'x'));
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('"deny"');
    expect(stdout).not.toContain('"ask"');
    expect(stdout).not.toContain('updatedInput');
    const ctx = parseEnvelope(stdout).additionalContext;
    for (let i = 1; i <= 5; i++) expect(ctx).toContain(`R-00${i}`);
    expect(parseEnvelope(stdout).permissionDecision).toBe('allow');
  });
});

describe('retired rules (Rule 4)', () => {
  it('status: retired → silent even on a governs match', async () => {
    const root = tmp('retired');
    makeCortexProject(root);
    writeRule(
      root,
      'R-050-retired.md',
      `id: R-050\ntitle: Old rule\nsource: []\nstatus: retired\ngoverns:\n  - "src/**"`,
    );
    const result = await run(writeStdin(root, path.join(root, 'src/a.ts'), 'x'));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });
});

describe('degradation (Rule 6)', () => {
  it('malformed rule file is skipped; valid rules still warn; hook-errors gains an entry; a degradation line rides along', async () => {
    const root = tmp('malformed');
    makeCortexProject(root);
    writeRule(root, 'R-001-broken.md', 'id: [unclosed\ntitle: broken');
    writeRule(root, 'R-002-good.md', `id: R-002\ntitle: Good rule\nsource: []\ngoverns:\n  - "src/**"`);
    const { exitCode, stdout } = await run(writeStdin(root, path.join(root, 'src/a.ts'), 'x'));
    expect(exitCode).toBe(0);
    const ctx = parseEnvelope(stdout).additionalContext;
    expect(ctx).toContain('R-002');
    expect(ctx).toContain('1 rule file(s) could not be parsed');
    const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    expect(log).toContain('R-001-broken.md');
    expect(log).toContain('hook: pre-write');
  });

  it('malformed rule with no other match → EMPTY stdout, but the error is still logged', async () => {
    const root = tmp('malformed-silent');
    makeCortexProject(root);
    writeRule(root, 'R-001-broken.md', 'id: [unclosed');
    const result = await run(writeStdin(root, path.join(root, 'src/a.ts'), 'x'));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.readFileSync(hookErrorsPath(root), 'utf-8')).toContain('R-001-broken.md');
  });

  it('missing .cortex/ → silent exit 0', async () => {
    const root = tmp('nocortex');
    const result = await run(writeStdin(root, path.join(root, 'src/a.ts'), 'x'));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });

  it('empty rules/ directory → silent exit 0', async () => {
    const root = tmp('norules');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, '.cortex', 'compass', 'rules'), { recursive: true });
    const result = await run(writeStdin(root, path.join(root, 'src/a.ts'), 'x'));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });

  it('stdin without tool_input.file_path → silent exit 0', async () => {
    const root = tmp('noinput');
    makeCortexProject(root);
    writeRule(root, 'R-002-good.md', `id: R-002\ntitle: G\nsource: []\ngoverns:\n  - "**"`);
    const result = await run({ cwd: root, tool_name: 'Write', tool_input: {} });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });
});
