/**
 * Atomic tests — hooks.search-annotate (`cortex hook search-annotate`, the
 * PreToolUse hook on Grep and Bash): one `it` per acceptance criterion plus
 * the rule-level cases the criteria leave implicit (the Bash classifier, the
 * Rule 4 token sources, the envelope, the memory file, the single-read
 * latency guard). Every project is a hand-built tmp root with a literal
 * `.cortex/recall-index.json` — no compiler, no frontmatter — so each test pins
 * exactly the index the hook sees. The real repo is never touched.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { run, RECALL_FIRED_DIR, recallFiredPath } from '../../../src/hooks/search-annotate.js';
import { clearRecallIndexCache, POINTER_BUDGET_CHARS } from '../../../src/recall/query.js';
import { makeTmpDir, cleanTmp, makeCortexProject, parseEnvelope, hookErrorsPath } from '../../fixtures/hooks-harness.js';
import {
  recallEntry,
  recallIndexFixture,
  recallSubject,
  sampleRecallIndex,
  writeRecallIndexFixture,
} from '../../fixtures/recall-query.js';
import type { RecallIndex } from '../../../src/recall/index.js';

// The ESM `fs` namespace is sealed, so the read/readdir counters are a partial
// module mock: the real functions, wrapped so calls can be counted (Rule 11).
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync), readdirSync: vi.fn(actual.readdirSync) };
});
const readFileSpy = fs.readFileSync as unknown as ReturnType<typeof vi.fn>;
const readdirSpy = fs.readdirSync as unknown as ReturnType<typeof vi.fn>;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`search-annotate-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  clearRecallIndexCache();
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

const SILENT = { exitCode: 0, stdout: '' };

/** A tmp project with `.cortex/cortex.config.json` and the given index literal. */
function project(label: string, index: RecallIndex | string): string {
  const root = tmp(label);
  makeCortexProject(root);
  writeRecallIndexFixture(root, index);
  return root;
}

function grepStdin(root: string, pattern: string, targetPath?: string, sessionId = 's1'): Record<string, unknown> {
  return {
    session_id: sessionId,
    cwd: root,
    tool_name: 'Grep',
    tool_input: { pattern, ...(targetPath === undefined ? {} : { path: targetPath }) },
  };
}

function bashStdin(root: string, command: string, sessionId = 's1'): Record<string, unknown> {
  return { session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: { command } };
}

/** Every payload any test emitted — the "imperative-free grammar" criterion checks them all at the end. */
const emitted: string[] = [];

/** Run the hook; a non-empty stdout is parsed and its lines returned (and recorded). */
async function fire(stdin: unknown, opts?: { cwd?: string }): Promise<{ exitCode: number; stdout: string; lines: string[] }> {
  const result = await run(stdin, opts);
  if (result.stdout === '') return { ...result, lines: [] };
  const ctx = parseEnvelope(result.stdout).additionalContext;
  emitted.push(ctx);
  return { ...result, lines: ctx.split('\n') };
}

// ---------------------------------------------------------------------------
// Index literals per criterion
// ---------------------------------------------------------------------------

const FIVE_MODULE = recallEntry(
  'decision',
  'Five-module architecture',
  '.cortex/atlas/decisions/2026-07-07-five-module-architecture.md',
  '2026-07-07',
  ['architecture', 'five', 'module', 'R-001'],
);

/** AC1: `subjects[".cortex/compass"]` absent, `subjects["R-001"].decided` is the one decision. */
function ruleOnlyIndex(): RecallIndex {
  return recallIndexFixture(
    { 'R-001': recallSubject({ decided: ['decision.2026-07-07-five-module-architecture'] }) },
    { 'decision.2026-07-07-five-module-architecture': FIVE_MODULE },
  );
}

// ---------------------------------------------------------------------------
// Acceptance criteria
// ---------------------------------------------------------------------------

describe('AC: a grep into a subject directory points at the newest current decision', () => {
  it('Bash grep of the R-001 rule file → exactly one Recall: decision line, under 60 tokens', async () => {
    const root = project('ac-rule', ruleOnlyIndex());
    const { exitCode, lines, stdout } = await fire(
      bashStdin(root, 'grep -rn "hook" .cortex/compass/rules/R-001-core-no-llm-calls.md'),
    );
    expect(exitCode).toBe(0);
    expect(lines).toEqual([
      'Recall: decision 2026-07-07 Five-module architecture (.cortex/atlas/decisions/2026-07-07-five-module-architecture.md)',
    ]);
    expect(parseEnvelope(stdout).additionalContext.length / 4).toBeLessThan(60);
  });
});

describe('AC: a subject with a decision and an open thread gets the Decided line', () => {
  it('Grep on the hygiene spec → `Decided: decision.2026-07-10-x · Open: T-004 …` first', async () => {
    const root = project('ac-decided', sampleRecallIndex());
    const { lines } = await fire(grepStdin(root, 'retention', '.specflow/specs/pulse/hygiene.spec.md'));
    expect(lines[0]).toBe('Decided: decision.2026-07-10-x · Open: T-004 Do you want the counter in state/ or at…');
  });
});

describe('AC: a spec path matches by its id', () => {
  it('Grep on .specflow/specs/pulse/usage.spec.md → the pulse.usage evidence via a Recall: evidence line', async () => {
    const index = recallIndexFixture(
      { 'pulse.usage': recallSubject({ evidence: ['evidence.2026-09-15-usage'] }) },
      { 'evidence.2026-09-15-usage': sampleRecallIndex().entries['evidence.2026-09-15-usage']! },
    );
    const root = project('ac-spec-id', index);
    const { lines } = await fire(grepStdin(root, 'fired', '.specflow/specs/pulse/usage.spec.md'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Recall: evidence 2026-09-15 /);
    expect(lines[0]).toContain('2026-09-15-usage');
  });
});

describe('AC: a schema grep matches clause subjects by heading text', () => {
  function schemaIndex(): RecallIndex {
    return recallIndexFixture(
      { 'schema:§5': recallSubject({ evidence: ['evidence.2026-09-15-usage'] }) },
      { 'evidence.2026-09-15-usage': sampleRecallIndex().entries['evidence.2026-09-15-usage']! },
    );
  }
  const SCHEMA_DOC = '# Schema\n\n## 5. Hook payload contracts\n\nbody\n\n## 6. Cross-reference conventions\n';

  it('`grep -n "payload" cortex-schema.md` → one Recall: evidence line (heading text carries the token)', async () => {
    const root = project('ac-schema-hit', schemaIndex());
    fs.writeFileSync(path.join(root, 'cortex-schema.md'), SCHEMA_DOC);
    const { lines } = await fire(bashStdin(root, 'grep -n "payload" cortex-schema.md'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Recall: evidence 2026-09-15 /);
  });

  it('`grep -n "frontmatter" cortex-schema.md` → nothing', async () => {
    const root = project('ac-schema-miss', schemaIndex());
    fs.writeFileSync(path.join(root, 'cortex-schema.md'), SCHEMA_DOC);
    expect(await run(bashStdin(root, 'grep -n "frontmatter" cortex-schema.md'))).toEqual(SILENT);
  });
});

describe('AC: a pipe filter never fires', () => {
  it('`cat .cortex/compass/_index.md | grep rules` → empty stdout, exit 0, even with a `.cortex/compass` subject', async () => {
    const index = recallIndexFixture(
      { '.cortex/compass': recallSubject({ decided: ['decision.2026-07-07-five-module-architecture'] }) },
      { 'decision.2026-07-07-five-module-architecture': FIVE_MODULE },
    );
    const root = project('ac-pipe', index);
    expect(await run(bashStdin(root, 'cat .cortex/compass/_index.md | grep rules'))).toEqual(SILENT);
  });
});

describe('AC: two keyword hits qualify an entry; one plain hit does not', () => {
  it('Grep src/ for "insight.*stance" → the 2026-08-05 decision; "insight" alone → nothing', async () => {
    const root = project('ac-keywords', sampleRecallIndex());
    const { lines } = await fire(grepStdin(root, 'insight.*stance', 'src/'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Recall: decision 2026-08-05 /);
    expect(await run(grepStdin(root, 'insight', 'src/', 'other-session'))).toEqual(SILENT);
  });
});

describe('AC: a ref-shaped token qualifies on one hit', () => {
  it('Grep src/ for "schema:§5" → the evidence entry (keyword `schema:§5`), not T-004', async () => {
    const sample = sampleRecallIndex();
    // No `schema:§5` subject here — the criterion is the keyword path alone.
    const index = recallIndexFixture(
      { 'src/pulse': recallSubject() },
      { 'T-004': sample.entries['T-004']!, 'evidence.2026-09-15-usage': sample.entries['evidence.2026-09-15-usage']! },
    );
    const root = project('ac-ref', index);
    const { lines } = await fire(grepStdin(root, 'schema:§5', 'src/'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Recall: evidence 2026-09-15 /);
    expect(lines[0]).toContain('2026-09-15-usage');
    expect(lines.join('\n')).not.toContain('T-004');
  });
});

describe('AC: subject beats keyword, open thread beats older decision', () => {
  it('Grep src/pulse/usage.ts → the Decided line leads; the keyword-only decision never precedes it', async () => {
    const index = recallIndexFixture(
      { 'src/pulse/usage.ts': recallSubject({ decided: ['decision.2026-07-01-a'], threads: ['T-009'] }) },
      {
        'decision.2026-07-01-a': recallEntry('decision', 'Usage counts by verb', '.cortex/atlas/decisions/2026-07-01-a.md', '2026-07-01', ['counts', 'usage', 'verb']),
        'T-009': recallEntry('thread', 'Should pointers count repeats?', '.cortex/pulse/threads/T-009-should-pointers-count-repeats.md', '2026-09-10', ['count', 'pointers', 'repeats', 'should']),
        'decision.2026-09-01-b': recallEntry('decision', 'Alpha beta gamma', '.cortex/atlas/decisions/2026-09-01-b.md', '2026-09-01', ['alpha', 'beta', 'gamma']),
      },
    );
    const root = project('ac-strength', index);
    const { lines } = await fire(grepStdin(root, 'alpha beta', 'src/pulse/usage.ts'));
    expect(lines[0]).toMatch(/^Decided: decision\.2026-07-01-a · Open: T-009 /);
    const bAt = lines.findIndex((l) => l.includes('2026-09-01-b'));
    expect(bAt === -1 || bAt > 0).toBe(true);
  });
});

describe('AC: the more tail names the subject', () => {
  it('R-003 with three decisions and one evidence → the last line ends with ` · more: cortex why R-003`', async () => {
    const index = recallIndexFixture(
      { 'R-003': recallSubject({ decided: ['decision.2026-01-01-a', 'decision.2026-02-01-b', 'decision.2026-03-01-c'], evidence: ['evidence.2026-04-01-e'] }) },
      {
        'decision.2026-01-01-a': recallEntry('decision', 'First', '.cortex/atlas/decisions/2026-01-01-a.md', '2026-01-01'),
        'decision.2026-02-01-b': recallEntry('decision', 'Second', '.cortex/atlas/decisions/2026-02-01-b.md', '2026-02-01'),
        'decision.2026-03-01-c': recallEntry('decision', 'Third', '.cortex/atlas/decisions/2026-03-01-c.md', '2026-03-01'),
        'evidence.2026-04-01-e': recallEntry('evidence', 'Measured', '.cortex/atlas/evidence/2026-04-01-e.md', '2026-04-01'),
      },
    );
    const root = project('ac-more', index);
    const { lines } = await fire(grepStdin(root, 'anything', '.cortex/compass/rules/R-003-x.md'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Recall: decision 2026-03-01 Third (.cortex/atlas/decisions/2026-03-01-c.md)');
    expect(lines[1]).toMatch(/ · more: cortex why R-003$/);
  });
});

describe('AC: budget trims the title, then drops the second line', () => {
  it('two 200-char titles → ≤2 lines, ≤240 chars, line one ends its title with `…` and keeps its path', async () => {
    const long = (seed: string): string => Array.from({ length: 40 }, (_, i) => `${seed}${i}`).join(' ').slice(0, 200);
    const index = recallIndexFixture(
      { 'R-002': recallSubject({ decided: ['decision.2026-05-01-a', 'decision.2026-06-01-b'] }) },
      {
        'decision.2026-05-01-a': recallEntry('decision', long('alpha'), '.cortex/atlas/decisions/2026-05-01-a.md', '2026-05-01'),
        'decision.2026-06-01-b': recallEntry('decision', long('bravo'), '.cortex/atlas/decisions/2026-06-01-b.md', '2026-06-01'),
      },
    );
    const root = project('ac-budget', index);
    const { lines, stdout } = await fire(grepStdin(root, 'x', '.cortex/compass/rules/R-002-x.md'));
    const payload = parseEnvelope(stdout).additionalContext;
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(payload.length).toBeLessThanOrEqual(POINTER_BUDGET_CHARS);
    expect(payload.length).toBeLessThanOrEqual(240);
    const m = /^Recall: decision 2026-06-01 (.+) \((\S+)\)$/.exec(lines[0]!);
    expect(m).not.toBeNull();
    expect(m![1]!.endsWith('…')).toBe(true);
    expect(m![2]).toBe('.cortex/atlas/decisions/2026-06-01-b.md');
  });
});

describe('AC: once per session', () => {
  it('session `abc`, the same Grep twice → the first emits, the second is silent, and the memory lists the subject key', async () => {
    const root = project('ac-once', ruleOnlyIndex());
    const stdin = grepStdin(root, 'hook', '.cortex/compass/rules/R-001-x.md', 'abc');
    const first = await fire(stdin);
    expect(first.lines).toHaveLength(1);
    expect(await run(stdin)).toEqual(SILENT);
    const memory = path.join(root, '.cortex', RECALL_FIRED_DIR, 'abc');
    expect(recallFiredPath(root, 'abc')).toBe(memory);
    const recorded = fs.readFileSync(memory, 'utf-8').split('\n').filter((l) => l.length > 0);
    expect(recorded).toContain('R-001');
    expect(recorded).toContain('decision.2026-07-07-five-module-architecture');
  });
});

describe('AC: fail-open is silent and unlogged', () => {
  it('no stdin, no index file, `{not json`, and `subjects` a string → exit 0, empty stdout, no hook-errors.md', async () => {
    const noStdin = tmp('fo-nostdin');
    makeCortexProject(noStdin);
    writeRecallIndexFixture(noStdin, ruleOnlyIndex());
    expect(await run({}, { cwd: noStdin })).toEqual(SILENT);
    expect(await run(undefined, { cwd: noStdin })).toEqual(SILENT);
    expect(fs.existsSync(hookErrorsPath(noStdin))).toBe(false);

    const noIndex = tmp('fo-noindex');
    makeCortexProject(noIndex);
    expect(await run(grepStdin(noIndex, 'hook', '.cortex/compass/rules/R-001-x.md'))).toEqual(SILENT);
    expect(fs.existsSync(hookErrorsPath(noIndex))).toBe(false);

    const notJson = project('fo-notjson', '{not json');
    expect(await run(grepStdin(notJson, 'hook', '.cortex/compass/rules/R-001-x.md'))).toEqual(SILENT);
    expect(fs.existsSync(hookErrorsPath(notJson))).toBe(false);

    const badShape = project('fo-shape', JSON.stringify({ ...ruleOnlyIndex(), subjects: 'oops' }));
    expect(await run(grepStdin(badShape, 'hook', '.cortex/compass/rules/R-001-x.md'))).toEqual(SILENT);
    expect(fs.existsSync(hookErrorsPath(badShape))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule-level cases the criteria leave implicit
// ---------------------------------------------------------------------------

describe('Rule 2: the envelope', () => {
  it('a match is the PreToolUse allow envelope; the payload is the lines joined by newline', async () => {
    const root = project('r2-envelope', ruleOnlyIndex());
    const { stdout, exitCode } = await run(grepStdin(root, 'hook', '.cortex/compass/rules/R-001-x.md'));
    expect(exitCode).toBe(0);
    const env = parseEnvelope(stdout);
    expect(env.hookEventName).toBe('PreToolUse');
    expect(env.permissionDecision).toBe('allow');
    expect(env.additionalContext).toMatch(/^Recall: decision 2026-07-07 /);
    expect(JSON.parse(stdout)).toEqual({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', additionalContext: env.additionalContext },
    });
  });
});

describe('Rule 3: what counts as a search', () => {
  it('another tool_name (Read, Glob) is silent even with a matching target', async () => {
    const root = project('r3-tool', ruleOnlyIndex());
    const filePath = '.cortex/compass/rules/R-001-x.md';
    expect(await run({ session_id: 's', cwd: root, tool_name: 'Read', tool_input: { file_path: filePath } })).toEqual(SILENT);
    expect(await run({ session_id: 's', cwd: root, tool_name: 'Glob', tool_input: { pattern: '**/*.md', path: filePath } })).toEqual(SILENT);
    expect(await run({ session_id: 's', cwd: root, tool_input: { pattern: 'hook', path: filePath } })).toEqual(SILENT);
  });

  it('a non-search Bash command (cat, ls, cortex …) never fires', async () => {
    const root = project('r3-nonsearch', ruleOnlyIndex());
    for (const command of [
      'cat .cortex/compass/rules/R-001-x.md',
      'ls .cortex/compass/rules/',
      'cortex why R-001',
      'echo "grep R-001 .cortex/compass/rules/R-001-x.md"',
    ]) {
      expect(await run(bashStdin(root, command)), command).toEqual(SILENT);
    }
  });

  it('a Grep without `path` searches the root: no subject candidate, keyword match only', async () => {
    const root = project('r3-nopath', sampleRecallIndex());
    // `hook` is a keyword of nothing; without a path there is no subject either.
    expect(await run(grepStdin(root, 'hook'))).toEqual(SILENT);
    // Two keyword hits still fire from the root.
    const { lines } = await fire(grepStdin(root, 'insight stance', undefined, 's2'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Recall: decision 2026-08-05 /);
  });

  it('at most the first three search segments are considered', async () => {
    const root = project('r3-segments', ruleOnlyIndex());
    const three = 'grep alpha src/a.ts; grep bravo src/b.ts; grep charlie src/c.ts';
    const fourth = 'grep delta .cortex/compass/rules/R-001-x.md';
    expect(await run(bashStdin(root, `${three}; ${fourth}`))).toEqual(SILENT);
    const { lines } = await fire(bashStdin(root, `${fourth}; ${three}`, 's2'));
    expect(lines).toHaveLength(1);
  });
});

describe('Rule 4: the Bash pattern text', () => {
  it('the quoted spans of every segment count; a pipe filter’s unquoted word does not', async () => {
    const root = project('r4-quoted', sampleRecallIndex());
    // `stance` sits in a pipe filter → not a search segment → one hit → silent.
    expect(await run(bashStdin(root, 'grep -rn insight src/ | grep stance'))).toEqual(SILENT);
    // Both quoted spans → two hits → the decision fires.
    const quoted = await fire(bashStdin(root, 'grep -rn "insight" src/ && grep -rn "stance" src/', 's2'));
    expect(quoted.lines).toHaveLength(1);
    expect(quoted.lines[0]).toMatch(/^Recall: decision 2026-08-05 /);
  });

  it('per search segment, unquoted non-flag tokens other than the command word and the path operand count', async () => {
    const root = project('r4-unquoted', sampleRecallIndex());
    const { lines } = await fire(bashStdin(root, 'rg -n insight src/ && rg -n stance --type ts src/'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Recall: decision 2026-08-05 /);
    // The command word and the operand never become tokens: `grep`/`src` match nothing.
    expect(await run(bashStdin(root, 'grep -rn grep src/', 's2'))).toEqual(SILENT);
  });
});

describe('Rule 5: a ref-shaped span that is a subject key is a subject match', () => {
  it('`grep R-001 src/` with an R-001 subject → the subject’s decision, not a keyword ranking', async () => {
    const root = project('r5-ref-subject', ruleOnlyIndex());
    const { lines } = await fire(bashStdin(root, 'grep -rn R-001 src/'));
    expect(lines).toEqual([
      'Recall: decision 2026-07-07 Five-module architecture (.cortex/atlas/decisions/2026-07-07-five-module-architecture.md)',
    ]);
    const memory = fs.readFileSync(recallFiredPath(root, 's1'), 'utf-8');
    expect(memory).toContain('R-001\n');
  });
});

describe('Rule 9: the per-session memory', () => {
  it('without a session_id the memory is skipped: nothing written, and a repeat fires again', async () => {
    const root = project('r9-nosession', ruleOnlyIndex());
    const stdin = { cwd: root, tool_name: 'Grep', tool_input: { pattern: 'hook', path: '.cortex/compass/rules/R-001-x.md' } };
    expect((await fire(stdin)).lines).toHaveLength(1);
    expect((await fire(stdin)).lines).toHaveLength(1);
    expect(fs.existsSync(path.join(root, '.cortex', RECALL_FIRED_DIR))).toBe(false);
  });

  it('the session id is sanitised into the file name', async () => {
    const root = project('r9-sanitise', ruleOnlyIndex());
    await fire(grepStdin(root, 'hook', '.cortex/compass/rules/R-001-x.md', 'a/b c'));
    expect(fs.existsSync(path.join(root, '.cortex', RECALL_FIRED_DIR, 'a_b_c'))).toBe(true);
  });

  it('a failed memory write still emits', async () => {
    const root = project('r9-writefail', ruleOnlyIndex());
    // A FILE where the memory directory should be → mkdir fails.
    fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'state'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', RECALL_FIRED_DIR), 'not a directory');
    const { exitCode, lines } = await fire(grepStdin(root, 'hook', '.cortex/compass/rules/R-001-x.md'));
    expect(exitCode).toBe(0);
    expect(lines).toHaveLength(1);
  });
});

describe('Rule 10: expected empty states', () => {
  it('no `.cortex/cortex.config.json` → silent even with an index present', async () => {
    const root = tmp('r10-noconfig');
    writeRecallIndexFixture(root, ruleOnlyIndex());
    expect(await run(grepStdin(root, 'hook', '.cortex/compass/rules/R-001-x.md'))).toEqual(SILENT);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('a Grep without a pattern, or a Bash without a command, is silent', async () => {
    const root = project('r10-fields', ruleOnlyIndex());
    expect(await run({ session_id: 's', cwd: root, tool_name: 'Grep', tool_input: { path: '.cortex/compass/rules/R-001-x.md' } })).toEqual(SILENT);
    expect(await run({ session_id: 's', cwd: root, tool_name: 'Bash', tool_input: {} })).toEqual(SILENT);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('a target outside the project yields no subject candidates', async () => {
    const root = project('r10-outside', ruleOnlyIndex());
    expect(await run(grepStdin(root, 'hook', path.join(root, '..', 'elsewhere', '.cortex/compass/rules/R-001-x.md')))).toEqual(SILENT);
  });
});

describe('Rule 11: one index read per fire, no directory walk, no frontmatter', () => {
  it('a Grep into a rule file reads recall-index.json once and reads no .md file and no directory', async () => {
    const root = project('r11-reads', ruleOnlyIndex());
    clearRecallIndexCache();
    readFileSpy.mockClear();
    readdirSpy.mockClear();
    const { lines } = await fire(grepStdin(root, 'hook', '.cortex/compass/rules/R-001-x.md'));
    expect(lines).toHaveLength(1);
    const readPaths = readFileSpy.mock.calls.map((c) => String(c[0]));
    expect(readPaths.filter((p) => p.endsWith('recall-index.json'))).toHaveLength(1);
    expect(readPaths.filter((p) => p.endsWith('.md'))).toEqual([]);
    expect(readdirSpy).not.toHaveBeenCalled();
  });
});

describe('AC: the imperative-free grammar', () => {
  // The two Rule 7 shapes. The title spans (group `title`) are index-sourced
  // text — the spec's own Decided: example carries "you" inside a thread key —
  // so the instruction-word check runs over the hook's grammar around them.
  // Fifth revision: the date is optional (empty for a rule or a compass document) and rule/bug lines carry the id before the title.
  const RECALL_SHAPE = /^Recall: (?<kind>decision|evidence|thread|observation|rule|compass-doc|bug)(?<date> \d{4}-\d{2}-\d{2})?(?<id> (?:R|B)-\d{3,})? (?<title>.+?) \((?<path>\S+)\)(?<tail> · more: cortex why \S+)?$/;
  const DECIDED_SHAPE = /^Decided: (?<id>decision\.\S+) · Open: (?<thread>T-\d{3,}) (?<title>.+?)(?<tail> · more: cortex why \S+)?$/;
  const IMPERATIVES = /\b(read|consult|check|should|you)\b/i;

  it('every emitted line begins `Recall: ` or `Decided: ` in the pinned shape, and the grammar around the titles carries no read/consult/check/should/you', () => {
    expect(emitted.length).toBeGreaterThan(5);
    for (const payload of emitted) {
      for (const line of payload.split('\n')) {
        expect(line).toMatch(/^(Recall|Decided): /);
        const m = RECALL_SHAPE.exec(line) ?? DECIDED_SHAPE.exec(line);
        expect(m, line).not.toBeNull();
        const grammar = line.replace(m!.groups!['title']!, '');
        expect(grammar).not.toMatch(IMPERATIVES);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3.4 fifth revision — the compass kinds through the hook (Rules 7–8)
// ---------------------------------------------------------------------------
describe('AC (fifth revision): a keyword search lands on a compass document', () => {
  it('`grep -rn "scheduled jobs" src/` → `Recall: compass-doc Environment (.cortex/compass/environment.md)`, no date, under 60 tokens', async () => {
    const index = recallIndexFixture(
      {},
      { 'compass.environment': recallEntry('compass-doc', 'Environment', '.cortex/compass/environment.md', '', ['environment', 'jobs', 'scheduled']) },
    );
    const root = project('ac-compass-doc', index);
    const { lines, stdout } = await fire(bashStdin(root, 'grep -rn "scheduled jobs" src/'));
    expect(lines).toEqual(['Recall: compass-doc Environment (.cortex/compass/environment.md)']);
    expect(parseEnvelope(stdout).additionalContext.length / 4).toBeLessThan(60);
  });
});

describe('AC (fifth revision): a grep into a governed directory points at the rule, and an open bug outranks it', () => {
  const R014 = recallEntry('rule', 'No camelCase database columns', '.cortex/compass/rules/R-014-no-camelcase-database-columns.md', '', ['src/db']);
  const B031 = recallEntry('bug', 'camelCase column slipped into migrations', '.cortex/compass/bugs/B-031-camelcase-column.md', '2026-06-28', ['src/db']);

  it('Grep path src/db pattern column with rules [R-014] alone → the one rule line', async () => {
    const root = project('ac-rule-line', recallIndexFixture({ 'src/db': recallSubject({ rules: ['R-014'] }) }, { 'R-014': R014 }));
    const { lines } = await fire(grepStdin(root, 'column', 'src/db'));
    expect(lines).toEqual(['Recall: rule R-014 No camelCase database columns (.cortex/compass/rules/R-014-no-camelcase-database-columns.md)']);
  });

  it('with bugs [B-031] too → the bug line first, the rule line second', async () => {
    const root = project('ac-bug-first', recallIndexFixture({ 'src/db': recallSubject({ rules: ['R-014'], bugs: ['B-031'] }) }, { 'R-014': R014, 'B-031': B031 }));
    const { lines } = await fire(grepStdin(root, 'column', 'src/db'));
    expect(lines).toEqual([
      'Recall: bug 2026-06-28 B-031 camelCase column slipped into migrations (.cortex/compass/bugs/B-031-camelcase-column.md)',
      'Recall: rule R-014 No camelCase database columns (.cortex/compass/rules/R-014-no-camelcase-database-columns.md)',
    ]);
    const memory = fs.readFileSync(recallFiredPath(root, 's1'), 'utf-8');
    expect(memory).toContain('B-031\n');
    expect(memory).toContain('R-014\n');
  });
});
