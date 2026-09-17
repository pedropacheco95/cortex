/**
 * Spec tests — hooks.search-annotate as an integrated slice: `cortex init`
 * registers the PreToolUse Grep|Bash row, the compiled recall index (not a
 * literal) feeds `cortex hook search-annotate` through the real dispatcher,
 * the once-per-session memory and the Bash classifier interact across fires,
 * and `check.hook-config` demands the row from any Cortex-managed settings
 * file. Every project is a tmp root with an injected fake home; the real repo
 * and the real ~/.claude are never touched.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { init } from '../../../src/cli/init.js';
import { validate } from '../../../src/schema/validate.js';
import { runHook } from '../../../src/hooks/cli.js';
import { writeRecallIndex } from '../../../src/recall/index.js';
import { clearRecallIndexCache } from '../../../src/recall/query.js';
import { RECALL_FIRED_DIR } from '../../../src/hooks/search-annotate.js';
import { makeTmpDir, cleanTmp, parseEnvelope, hookErrorsPath } from '../../fixtures/hooks-harness.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VALID_FIXTURE = path.resolve(HERE, '../../fixtures/valid');
const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const, noLlm: true };
const SEARCH_ROW = { matcher: 'Grep|Bash', hooks: [{ type: 'command', command: 'cortex hook search-annotate' }] };

function write(root: string, rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf-8');
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function stdin(root: string, fields: Record<string, unknown>, sessionId = 'spec-session'): string {
  return JSON.stringify({ session_id: sessionId, cwd: root, ...fields });
}

describe('hooks.search-annotate — a fresh project, end to end', () => {
  let root: string;
  let home: string;
  let initExit: number;

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    root = makeTmpDir('search-annotate-spec-proj');
    home = makeTmpDir('search-annotate-spec-home');
    initExit = (await init(root, { home, ...DARWIN })).exitCode;
    // One rule, one current decision bearing on it: the compiled index gains an
    // R-001 subject with that decision — no literal index anywhere in this file.
    write(root, '.cortex/compass/rules/R-001-sample-rule.md', fs.readFileSync(path.join(VALID_FIXTURE, '.cortex/compass/rules/R-001-sample-rule.md'), 'utf-8'));
    write(root, '.cortex/atlas/decisions/2026-07-01-sample-decision.md', [
      '---',
      'id: decision.2026-07-01-sample-decision',
      'title: Spec frontmatter is validator-checked',
      'date: 2026-07-01T00:00:00Z',
      'bears_on: [R-001]',
      '---',
      '',
      '# Spec frontmatter is validator-checked',
      '',
    ].join('\n'));
    clearRecallIndexCache();
    await writeRecallIndex(root);
  }, TEST_TIMEOUT);
  afterAll(() => {
    vi.restoreAllMocks();
    clearRecallIndexCache();
    cleanTmp(root);
    cleanTmp(home);
  });

  it('Rule 1: init registers the PreToolUse Grep|Bash row alongside the rest of the set, and the project validates clean', async () => {
    expect(initExit).toBe(0);
    const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.hooks.PreToolUse).toContainEqual(SEARCH_ROW);
    const report = await validate(root, { root });
    expect(report.violations.filter((v) => v.check === 'check.hook-config')).toEqual([]);
  });

  it('Rules 2–8: a Grep on the rule file, through the dispatcher, points at the compiled decision in the allow envelope', async () => {
    const result = await runHook(
      'search-annotate',
      stdin(root, { tool_name: 'Grep', tool_input: { pattern: 'frontmatter', path: '.cortex/compass/rules/R-001-sample-rule.md' } }),
    );
    expect(result.exitCode).toBe(0);
    const env = parseEnvelope(result.stdout);
    expect(env.hookEventName).toBe('PreToolUse');
    expect(env.permissionDecision).toBe('allow');
    expect(env.additionalContext).toBe(
      'Recall: decision 2026-07-01 Spec frontmatter is validator-checked (.cortex/atlas/decisions/2026-07-01-sample-decision.md)',
    );
  });

  it('Rules 3 + 9 interact: a Bash grep of the same subject in the same session is silent, the memory carries the key, and nothing was logged', async () => {
    const again = await runHook(
      'search-annotate',
      stdin(root, { tool_name: 'Bash', tool_input: { command: 'grep -rn "governs" .cortex/compass/rules/R-001-sample-rule.md' } }),
    );
    expect(again).toEqual({ exitCode: 0, stdout: '' });
    const memory = fs.readFileSync(path.join(root, '.cortex', RECALL_FIRED_DIR, 'spec-session'), 'utf-8');
    expect(memory.split('\n')).toContain('R-001');
    expect(memory.split('\n')).toContain('decision.2026-07-01-sample-decision');
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('Rule 9 is per session: a new session fires on the same subject again', async () => {
    const fresh = await runHook(
      'search-annotate',
      stdin(root, { tool_name: 'Bash', tool_input: { command: 'rg -n frontmatter .cortex/compass/rules/R-001-sample-rule.md' } }, 'another-session'),
    );
    expect(parseEnvelope(fresh.stdout).additionalContext).toMatch(/^Recall: decision 2026-07-01 /);
  });

  it('Rule 10: with the index deleted the hook is silent, unlogged, and the registration still validates', async () => {
    clearRecallIndexCache();
    fs.rmSync(path.join(root, '.cortex', 'recall-index.json'));
    const result = await runHook(
      'search-annotate',
      stdin(root, { tool_name: 'Grep', tool_input: { pattern: 'frontmatter', path: '.cortex/compass/rules/R-001-sample-rule.md' } }, 'third-session'),
    );
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
    const report = await validate(root, { root });
    expect(report.violations.filter((v) => v.check === 'check.hook-config')).toEqual([]);
  });
});

describe('hooks.search-annotate — check.hook-config demands the row from a Cortex-managed settings file', () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  });

  it('a settings file carrying `cortex hook session-start` but no search-annotate entry → one error naming the command and `cortex sync`', async () => {
    const root = makeTmpDir('search-annotate-spec-stale');
    dirs.push(root);
    copyDir(VALID_FIXTURE, root);
    write(root, '.claude/settings.json', JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'cortex hook session-start' }] }] },
    }, null, 2));
    const report = await validate(root, { root });
    const about = report.violations.filter((v) => v.check === 'check.hook-config' && v.message.includes('cortex hook search-annotate'));
    expect(about).toHaveLength(1);
    expect(about[0]!.severity).toBe('error');
    expect(about[0]!.location.key).toBe('hooks.PreToolUse');
    expect(about[0]!.message).toContain('cortex sync');
  });
});

// ---------------------------------------------------------------------------
// 3.4 fifth revision — the compass carriers through the real compiler and the
// real dispatcher: a rule governing src/db, an open bug on src/db/schema.ts,
// environment.md with a "Scheduled QA jobs" heading.
// ---------------------------------------------------------------------------
describe('hooks.search-annotate — compass carriers end to end (Rules 7–8, fifth revision)', () => {
  let root: string;
  let home: string;

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    root = makeTmpDir('search-annotate-spec-compass');
    home = makeTmpDir('search-annotate-spec-compass-home');
    expect((await init(root, { home, ...DARWIN })).exitCode).toBe(0);
    write(root, 'src/db/schema.ts', 'export {};\n');
    write(root, '.cortex/compass/rules/R-014-no-camelcase-database-columns.md', [
      '---',
      'id: R-014',
      'title: No camelCase database columns',
      'governs:',
      '  - "src/db/**/*.ts"',
      'confidence: STATED',
      '---',
      '',
      '# R-014 — No camelCase database columns',
      '',
    ].join('\n'));
    write(root, '.cortex/compass/bugs/B-031-camelcase-column.md', [
      '---',
      'id: B-031',
      'title: camelCase column slipped into migrations',
      'type: incomplete-rule',
      'severity: medium',
      'status: open',
      'affects: [src/db/schema.ts]',
      'opened: 2026-06-28T09:00:00Z',
      '---',
      '',
      '# B-031',
      '',
    ].join('\n'));
    write(root, '.cortex/compass/environment.md', '# Environment\n\n## Scheduled QA jobs\n\nthe nightly job runs against staging\n');
    clearRecallIndexCache();
    await writeRecallIndex(root);
  }, TEST_TIMEOUT);
  afterAll(() => {
    vi.restoreAllMocks();
    clearRecallIndexCache();
    cleanTmp(root);
    cleanTmp(home);
  });
  afterEach(() => clearRecallIndexCache());

  it('a Grep into src/db points at the rule (no date, id before title); a Grep on schema.ts leads with the bug and follows with the rule', async () => {
    const dir = await runHook('search-annotate', stdin(root, { tool_name: 'Grep', tool_input: { pattern: 'column', path: 'src/db' } }, 'compass-a'));
    expect(dir.exitCode).toBe(0);
    expect(parseEnvelope(dir.stdout).additionalContext).toBe(
      'Recall: rule R-014 No camelCase database columns (.cortex/compass/rules/R-014-no-camelcase-database-columns.md)',
    );
    const file = await runHook('search-annotate', stdin(root, { tool_name: 'Grep', tool_input: { pattern: 'column', path: 'src/db/schema.ts' } }, 'compass-b'));
    expect(parseEnvelope(file.stdout).additionalContext.split('\n')).toEqual([
      'Recall: bug 2026-06-28 B-031 camelCase column slipped into migrations (.cortex/compass/bugs/B-031-camelcase-column.md)',
      'Recall: rule R-014 No camelCase database columns (.cortex/compass/rules/R-014-no-camelcase-database-columns.md)',
    ]);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('a keyword search for "scheduled jobs" lands on environment.md by its heading tokens, never by its body', async () => {
    const hit = await runHook('search-annotate', stdin(root, { tool_name: 'Bash', tool_input: { command: 'grep -rn "scheduled jobs" src/' } }, 'compass-c'));
    expect(parseEnvelope(hit.stdout).additionalContext).toBe('Recall: compass-doc Environment (.cortex/compass/environment.md)');
    const miss = await runHook('search-annotate', stdin(root, { tool_name: 'Bash', tool_input: { command: 'grep -rn "nightly staging" src/' } }, 'compass-d'));
    expect(miss).toEqual({ exitCode: 0, stdout: '' });
  });
});
