/**
 * Spec-level tests — hooks.session-start / hooks.pre-write / hooks.post-write.
 *
 * End-to-end over tmp fixture projects: handcrafted init-like `.cortex/`
 * skeletons, real compass rule files, and (for post-write) a real files.md
 * produced by the anatomy scanner. Hooks are driven through the `cortex hook
 * <name>` dispatch (runHook) with raw stdin JSON, exactly as Claude Code
 * invokes them. One describe per spec AC — 20 in total.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { runHook } from '../../../src/hooks/cli.js';
import { run as runSessionStart } from '../../../src/hooks/session-start.js';
import { scan } from '../../../src/anatomy/scan.js';
import { validate } from '../../../src/schema/validate.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeHygieneReport,
  writeRule,
  readFilesMdRows,
  hookErrorsPath,
  parseEnvelope,
  isoHoursAgo,
} from '../../fixtures/hooks-harness.js';

const TEST_TIMEOUT = 30_000;
const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`spec-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function sha(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function stdinJson(fields: Record<string, unknown>): string {
  return JSON.stringify({ session_id: 'spec-session', ...fields });
}

/** Scanned fixture: real src files + a real files.md written by the scanner. */
async function makeScannedProject(label: string): Promise<string> {
  const root = tmp(label);
  makeCortexProject(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'a.ts'),
    '/** Handles the A concern for the fixture project. */\nexport const a = 1;\n',
  );
  fs.writeFileSync(
    path.join(root, 'src', 'b.ts'),
    '/** Handles the B concern for the fixture project. */\nexport const b = 2;\n',
  );
  await scan(root);
  return root;
}

// ===========================================================================
// hooks.session-start — 5 ACs
// ===========================================================================

describe('AC session-start.1: fresh hygiene report → pointer plus one-line summary', () => {
  it(
    'generated 3 hours ago → pointer, modules, and a hygiene line naming the report',
    async () => {
      const root = await makeScannedProject('ss1');
      writeHygieneReport(root, isoHoursAgo(3, new Date()), '3 stale purposes flagged.');
      const { exitCode, stdout } = await runHook(
        'session-start',
        stdinJson({ hook_event_name: 'SessionStart', source: 'startup', cwd: root }),
      );
      expect(exitCode).toBe(0);
      const env = parseEnvelope(stdout);
      expect(env.hookEventName).toBe('SessionStart');
      expect(env.additionalContext).toContain('Cortex is active');
      expect(env.additionalContext).toContain('.cortex/_index.md');
      expect(env.additionalContext).toContain('Modules: anatomy, compass, atlas, pulse.');
      expect(env.additionalContext).toContain('Hygiene: 3 stale purposes flagged.');
      expect(env.additionalContext).toContain('.cortex/pulse/hygiene-report.md');
    },
    TEST_TIMEOUT,
  );
});

describe('AC session-start.2: stale report → pointer only', () => {
  it('generated 80 hours ago with a 48h window → no hygiene line', async () => {
    const root = tmp('ss2');
    makeCortexProject(root);
    writeHygieneReport(root, isoHoursAgo(80, new Date()), 'old news');
    const { stdout } = await runHook(
      'session-start',
      stdinJson({ hook_event_name: 'SessionStart', source: 'resume', cwd: root }),
    );
    const ctx = parseEnvelope(stdout).additionalContext;
    expect(ctx).toContain('Cortex is active');
    expect(ctx).not.toContain('Hygiene:');
  });
});

describe('AC session-start.3: uninitialised project → fully silent', () => {
  it('cwd without .cortex/ → exit 0, empty stdout', async () => {
    const root = tmp('ss3');
    const result = await runHook(
      'session-start',
      stdinJson({ hook_event_name: 'SessionStart', source: 'startup', cwd: root }),
    );
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(path.join(root, '.cortex'))).toBe(false);
  });
});

describe('AC session-start.4: malformed hygiene report degrades to pointer', () => {
  it('unparseable frontmatter → pointer injected, hook-errors entry names hook + file + failure', async () => {
    const root = tmp('ss4');
    makeCortexProject(root);
    fs.writeFileSync(
      path.join(root, '.cortex', 'pulse', 'hygiene-report.md'),
      '---\ngenerated: [broken yaml\n---\nreport body',
    );
    const { exitCode, stdout } = await runHook(
      'session-start',
      stdinJson({ hook_event_name: 'SessionStart', source: 'clear', cwd: root }),
    );
    expect(exitCode).toBe(0);
    expect(parseEnvelope(stdout).additionalContext).toContain('Cortex is active');
    const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    expect(log).toContain('kind: pulse-hook-errors');
    expect(log).toContain('hook: session-start');
    expect(log).toContain('file: .cortex/pulse/hygiene-report.md');
    expect(log).toMatch(/failure: \S/);
  });
});

describe('AC session-start.5: payload respects the token budget', () => {
  it(
    'additionalContext is under 100 tokens (chars/4), per schema §5',
    async () => {
      const root = await makeScannedProject('ss5');
      writeHygieneReport(root, isoHoursAgo(1, new Date()), 'summary '.repeat(200));
      for (const source of ['startup', 'resume', 'clear', 'compact']) {
        const { stdout } = await runHook(
          'session-start',
          stdinJson({ hook_event_name: 'SessionStart', source, cwd: root }),
        );
        const ctx = parseEnvelope(stdout).additionalContext;
        expect(ctx.length / 4).toBeLessThan(100);
      }
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
// hooks.pre-write — 8 ACs
// ===========================================================================

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

// ===========================================================================
// hooks.post-write — 7 ACs (over a real scanner-produced files.md)
// ===========================================================================

function postWriteStdin(root: string, filePath: string): string {
  return stdinJson({
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: filePath, content: '(hook reads disk, not this)' },
    cwd: root,
  });
}

describe('AC post-write.1: changed file’s row is refreshed and flagged', () => {
  it(
    'Write changes src/a.ts to 400 chars → tokens 100, new sha256, new last_seen, flag true',
    async () => {
      const root = await makeScannedProject('po1');
      const before = readFilesMdRows(root).find((r) => r.path === 'src/a.ts');
      expect(before?.flagged).toBe(false); // doc comment gave it a purpose
      const newContent = 'y'.repeat(400);
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), newContent);

      const result = await runHook('post-write', postWriteStdin(root, path.join(root, 'src/a.ts')));
      expect(result).toEqual({ exitCode: 0, stdout: '' });

      const after = readFilesMdRows(root).find((r) => r.path === 'src/a.ts');
      expect(after?.tokens).toBe(100);
      expect(after?.sha256).toBe(sha(newContent));
      expect(after?.lastSeen).not.toBe(before?.lastSeen);
      expect(Number.isNaN(Date.parse(after?.lastSeen ?? ''))).toBe(false);
      expect(after?.flagged).toBe(true);
    },
    TEST_TIMEOUT,
  );
});

describe('AC post-write.2: unchanged content leaves the row untouched', () => {
  it(
    'sha256 already matches disk → files.md byte-identical (flag and last_seen included)',
    async () => {
      const root = await makeScannedProject('po2');
      const filesMd = path.join(root, '.cortex', 'anatomy', 'files.md');
      const before = fs.readFileSync(filesMd, 'utf-8');
      await runHook('post-write', postWriteStdin(root, path.join(root, 'src/a.ts')));
      expect(fs.readFileSync(filesMd, 'utf-8')).toBe(before);
    },
    TEST_TIMEOUT,
  );
});

describe('AC post-write.3: new file appended with placeholder', () => {
  it(
    'Write creating src/new.ts → placeholder row, flag true, check.anatomy-files passes',
    async () => {
      const root = await makeScannedProject('po3');
      fs.writeFileSync(path.join(root, 'src', 'new.ts'), 'export const fresh = true;\n');
      await runHook('post-write', postWriteStdin(root, path.join(root, 'src/new.ts')));

      const added = readFilesMdRows(root).find((r) => r.path === 'src/new.ts');
      expect(added).toBeDefined();
      expect(added?.purpose).toBe('(needs purpose)');
      expect(added?.flagged).toBe(true);

      const report = await validate(root, { root });
      const anatomyErrors = report.violations.filter(
        (v) => v.check === 'check.anatomy-files' && v.severity === 'error',
      );
      expect(anatomyErrors).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

describe('AC post-write.4: excluded paths are a no-op', () => {
  it(
    '.gitignore lists dist/ → Write to dist/out.js leaves files.md byte-identical',
    async () => {
      const root = await makeScannedProject('po4');
      fs.writeFileSync(path.join(root, '.gitignore'), 'dist/\n');
      fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(root, 'dist', 'out.js'), 'compiled output');
      const filesMd = path.join(root, '.cortex', 'anatomy', 'files.md');
      const before = fs.readFileSync(filesMd, 'utf-8');
      await runHook('post-write', postWriteStdin(root, path.join(root, 'dist/out.js')));
      expect(fs.readFileSync(filesMd, 'utf-8')).toBe(before);
    },
    TEST_TIMEOUT,
  );
});

describe('AC post-write.5: unscanned project is fully silent', () => {
  it('.cortex/ without anatomy/files.md → exit 0, empty stdout, no file, no pulse entry', async () => {
    const root = tmp('po5');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'x');
    const result = await runHook('post-write', postWriteStdin(root, path.join(root, 'src/a.ts')));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(path.join(root, '.cortex', 'anatomy', 'files.md'))).toBe(false);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });
});

describe('AC post-write.6: corrupt files.md is never destroyed', () => {
  it(
    'truncated table → byte-identical, exit 0, hook-errors names the hook and the parse failure',
    async () => {
      const root = await makeScannedProject('po6');
      const filesMd = path.join(root, '.cortex', 'anatomy', 'files.md');
      // Truncate mid-row: the last row loses its trailing cells.
      const truncated = fs.readFileSync(filesMd, 'utf-8').slice(0, -80);
      fs.writeFileSync(filesMd, truncated);
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'changed content');

      const result = await runHook('post-write', postWriteStdin(root, path.join(root, 'src/a.ts')));
      expect(result).toEqual({ exitCode: 0, stdout: '' });
      expect(fs.readFileSync(filesMd, 'utf-8')).toBe(truncated);
      const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
      expect(log).toContain('hook: post-write');
      expect(log).toContain('files.md');
    },
    TEST_TIMEOUT,
  );
});

describe('AC post-write.7: no graph or purpose work in the fast tier', () => {
  it(
    'a Write adding an import → graph.json byte-identical, purpose text unchanged, only the flag flips',
    async () => {
      const root = await makeScannedProject('po7');
      const graphPath = path.join(root, '.cortex', 'anatomy', 'graph.json');
      const graphBefore = fs.readFileSync(graphPath, 'utf-8');
      const purposeBefore = readFilesMdRows(root).find((r) => r.path === 'src/a.ts')?.purpose;

      fs.writeFileSync(
        path.join(root, 'src', 'a.ts'),
        '/** Handles the A concern for the fixture project. */\nimport { b } from "./b.js";\nexport const a = b;\n',
      );
      await runHook('post-write', postWriteStdin(root, path.join(root, 'src/a.ts')));

      expect(fs.readFileSync(graphPath, 'utf-8')).toBe(graphBefore);
      const after = readFilesMdRows(root).find((r) => r.path === 'src/a.ts');
      expect(after?.purpose).toBe(purposeBefore);
      expect(after?.flagged).toBe(true);
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
// dispatch alignment: `cortex hook <name>` names match init's registrations
// ===========================================================================

describe('cortex hook dispatch matches the init-registered command names', () => {
  it('session-start / pre-write / post-write are handled; unknown names stay silent', async () => {
    const root = tmp('dispatch');
    makeCortexProject(root);
    // Registered command suffixes per core-cli.init Rule 11 / hooks.* Rule 1:
    const registered = ['session-start', 'pre-write', 'post-write'];
    for (const name of registered) {
      const result = await runHook(name, stdinJson({ cwd: root, tool_input: {} }));
      expect(result.exitCode).toBe(0);
    }
    // pre-read is registered only when hooks.preRead=true and is a v-next hook:
    expect(await runHook('pre-read', stdinJson({ cwd: root }))).toEqual({ exitCode: 0, stdout: '' });
    expect(await runHook('nonsense', 'not even json')).toEqual({ exitCode: 0, stdout: '' });
  });

  it('runSessionStart export shape: pure run(stdinJson, opts) seam works with now', async () => {
    const root = tmp('seam');
    makeCortexProject(root);
    const now = new Date('2026-07-02T00:00:00.000Z');
    writeHygieneReport(root, isoHoursAgo(47, now), 'inside the window by the seam.');
    const { stdout } = await runSessionStart({ cwd: root, hook_event_name: 'SessionStart', source: 'startup' }, { cwd: root, now });
    expect(parseEnvelope(stdout).additionalContext).toContain('inside the window by the seam.');
  });
});
