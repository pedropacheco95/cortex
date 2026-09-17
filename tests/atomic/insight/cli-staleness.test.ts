/**
 * Atomic tests — insight.cli Rule 9, the staleness stamp on `cortex insight
 * file` (parallel-wave brief §3.1, ask A-05; plan 2026-09-17-wave-a Tasks 2.1
 * and 2.2). `entryStaleness(root, result)` compares the entry's own
 * `source_sha256` with the sha256 of the source body at `<root>/<path>` —
 * in-process, never git, never the ledger — and the `file` rendering carries
 * the result as its second line; `--json` carries three top-level fields.
 * Deterministic Core (RULES 3, R-001): no subprocess, no network.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import { insightCli } from '../../../src/insight/cli.js';
import { entryStaleness, fileQuery } from '../../../src/insight/query.js';
import { sha256Of } from '../../../src/insight/refresh-fast.js';

// Rule 9: "no git process is spawned" — every process-spawning verb is a
// call-counting spy over the real implementation.
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFileSync: vi.fn(actual.execFileSync),
    execSync: vi.fn(actual.execSync),
    spawnSync: vi.fn(actual.spawnSync),
    spawn: vi.fn(actual.spawn),
    execFile: vi.fn(actual.execFile),
    exec: vi.fn(actual.exec),
  };
});

const SOURCE = 'src/auth/session.ts';
const BODY = 'export function issue(): string {\n  return "token";\n}\n';
const BUILT = '9f2c1ab';
const EXTRACTED = '2026-07-07T14:00:00Z';

let counter = 0;
const tmpRoots: string[] = [];
function makeTmpRoot(label: string): string {
  const dir = path.join(os.tmpdir(), `cortex-insight-stale-${label}-${Date.now()}-${counter++}`);
  fs.mkdirSync(dir, { recursive: true });
  tmpRoots.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tmpRoots) fs.rmSync(dir, { recursive: true, force: true });
});

/** A flat-layout module with one L3 entry for SOURCE whose hash is `sha`. */
function writeEntry(root: string, sha: string, rel = SOURCE): void {
  const p = path.join(root, '.cortex', 'insight', 'anatomy', `${rel}.md`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    [
      '---',
      `path: ${rel}`,
      `extracted_at: '${EXTRACTED}'`,
      'extraction_level: 3',
      'size_lines: 3',
      'size_tokens: 20',
      'centrality: high',
      `built_at_commit: '${BUILT}'`,
      `source_sha256: ${sha}`,
      '---',
      '',
      '## Purpose',
      '',
      'Issues session tokens.',
      '',
      '## Main players',
      '',
      '- `issue` — mints a token.',
      '',
      '## Connections',
      '',
      '- none observed.',
      '',
    ].join('\n'),
  );
}

function writeSource(root: string, body: string, rel = SOURCE): void {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

/** The AC's "fresh" fixture: the entry hashes the body on disk. */
function freshRoot(label: string): string {
  const root = makeTmpRoot(label);
  writeSource(root, BODY);
  writeEntry(root, sha256Of(BODY));
  return root;
}

/** The AC's "changed" fixture: the same entry, the body with one appended line. */
function changedRoot(label: string): string {
  const root = freshRoot(label);
  fs.appendFileSync(path.join(root, SOURCE), 'export const extra = 1;\n');
  return root;
}

/** The AC's "missing" fixture: the same entry, no file at the path. */
function missingRoot(label: string): string {
  const root = freshRoot(label);
  fs.rmSync(path.join(root, SOURCE));
  return root;
}

async function capture(fn: () => Promise<number>): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a: unknown[]): void => {
    out += a.map((x) => String(x)).join(' ') + '\n';
  };
  console.error = (...a: unknown[]): void => {
    err += a.map((x) => String(x)).join(' ') + '\n';
  };
  try {
    const code = await fn();
    return { code, out, err };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

function spawnCalls(): number {
  return [
    childProcess.execFileSync,
    childProcess.execSync,
    childProcess.spawnSync,
    childProcess.spawn,
    childProcess.execFile,
    childProcess.exec,
  ].reduce((n, f) => n + (vi.isMockFunction(f) ? f.mock.calls.length : 0), 0);
}

// ---------------------------------------------------------------------------
// entryStaleness — the comparison the CLI header and the PreRead marker share.
// ---------------------------------------------------------------------------
describe('entryStaleness: the entry is authoritative for itself', () => {
  it('a body that hashes to source_sha256 is fresh', () => {
    const root = freshRoot('unit-fresh');
    const s = entryStaleness(root, fileQuery(root, SOURCE));
    expect(s).toEqual({ built_at_commit: BUILT, extracted_at: EXTRACTED, stale: false, reason: 'fresh' });
  });

  it('a body that differs is stale for the reason "changed"', () => {
    const root = changedRoot('unit-changed');
    const s = entryStaleness(root, fileQuery(root, SOURCE));
    expect(s).toEqual({ built_at_commit: BUILT, extracted_at: EXTRACTED, stale: true, reason: 'changed' });
  });

  it('no file at the path is stale for the reason "missing", never a throw', () => {
    const root = missingRoot('unit-missing');
    expect(entryStaleness(root, fileQuery(root, SOURCE))).toEqual({
      built_at_commit: BUILT,
      extracted_at: EXTRACTED,
      stale: true,
      reason: 'missing',
    });
  });

  it('a directory in place of the source is "missing" too (unreadable, not a crash)', () => {
    const root = missingRoot('unit-dir');
    fs.mkdirSync(path.join(root, SOURCE));
    expect(entryStaleness(root, fileQuery(root, SOURCE))?.reason).toBe('missing');
  });

  it('a miss (no entry) and an absent module carry no staleness at all (null)', () => {
    const root = makeTmpRoot('unit-null');
    writeSource(root, BODY);
    expect(entryStaleness(root, fileQuery(root, SOURCE))).toBeNull();
    const bare = makeTmpRoot('unit-null-bare');
    expect(entryStaleness(bare, fileQuery(bare, SOURCE))).toBeNull();
  });

  it('a scoped entry answers exactly as a flat one does (the entry, not the ledger, is compared)', () => {
    const root = makeTmpRoot('unit-scoped');
    writeSource(root, BODY);
    const insightDir = path.join(root, '.cortex', 'insight');
    fs.mkdirSync(insightDir, { recursive: true });
    fs.writeFileSync(
      path.join(insightDir, 'scope-registry.yaml'),
      'schemaVersion: "3.0"\nbuilt_at_commit: 9f2c1ab\nscopes:\n  auth:\n    path: src/auth\n    depends_on: []\n',
    );
    const p = path.join(insightDir, 'scopes', 'auth', 'anatomy', `${SOURCE}.md`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const flat = makeTmpRoot('unit-scoped-flat');
    writeEntry(flat, sha256Of(BODY));
    fs.copyFileSync(path.join(flat, '.cortex', 'insight', 'anatomy', `${SOURCE}.md`), p);
    const r = fileQuery(root, SOURCE);
    expect(r.scope).toBe('auth');
    expect(entryStaleness(root, r)?.reason).toBe('fresh');
  });
});

// ---------------------------------------------------------------------------
// AC: `file` prints a fresh stamp when the source matches its entry
// ---------------------------------------------------------------------------
describe('AC: file prints a fresh stamp when the source matches its entry', () => {
  it('the second output line is exactly `built at 9f2c1ab · 2026-07-07 · fresh`', async () => {
    const root = freshRoot('ac-fresh');
    const { code, out } = await capture(() => insightCli('file', [SOURCE], root));
    expect(code).toBe(0);
    const lines = out.split('\n');
    expect(lines[0]).toBe(`${SOURCE} — L3 entry (centrality high, 3 lines)`);
    expect(lines[1]).toBe('built at 9f2c1ab · 2026-07-07 · fresh');
    expect(lines[2]).toBe(`entry: anatomy/${SOURCE}.md`);
  });
});

// ---------------------------------------------------------------------------
// AC: `file` prints a STALE stamp when the source body changed
// ---------------------------------------------------------------------------
describe('AC: file prints a STALE stamp when the source body changed', () => {
  it('the second line is exactly `built at 9f2c1ab · 2026-07-07 · STALE: source changed since`, sections render, exit 0', async () => {
    const root = changedRoot('ac-changed');
    const { code, out } = await capture(() => insightCli('file', [SOURCE], root));
    expect(code).toBe(0);
    expect(out.split('\n')[1]).toBe('built at 9f2c1ab · 2026-07-07 · STALE: source changed since');
    expect(out).toContain('## Purpose');
    expect(out).toContain('Issues session tokens.');
    expect(out).toContain('## Main players');
  });
});

// ---------------------------------------------------------------------------
// AC: A missing source is stale, not a crash
// ---------------------------------------------------------------------------
describe('AC: a missing source is stale, not a crash', () => {
  it('the second line ends `STALE: source missing`, exit 0, and no git process is spawned', async () => {
    const root = missingRoot('ac-missing');
    const before = spawnCalls();
    const { code, out, err } = await capture(() => insightCli('file', [SOURCE], root));
    expect(code).toBe(0);
    expect(err).toBe('');
    expect(out.split('\n')[1]?.endsWith('STALE: source missing')).toBe(true);
    expect(out.split('\n')[1]).toBe('built at 9f2c1ab · 2026-07-07 · STALE: source missing');
    expect(spawnCalls()).toBe(before);
  });

  it('the fresh and changed renderings spawn nothing either (the comparison is in-process)', async () => {
    const before = spawnCalls();
    await capture(() => insightCli('file', [SOURCE], freshRoot('spawn-fresh')));
    await capture(() => insightCli('file', [SOURCE], changedRoot('spawn-changed')));
    expect(spawnCalls()).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// AC: `--json` carries the stamp fields (Task 2.2)
// ---------------------------------------------------------------------------
describe('AC: --json carries the stamp fields', () => {
  interface FilePayload {
    command: string;
    found: boolean;
    path: string;
    entry_file: string;
    scope: string | null;
    built_at_commit: string;
    extracted_at: string;
    stale: boolean;
    frontmatter: { source_sha256: string; built_at_commit: string; extracted_at: string };
    sections: Record<string, string>;
  }

  it('the fresh fixture → built_at_commit "9f2c1ab", extracted_at "2026-07-07T14:00:00Z", stale false; frontmatter.source_sha256 unchanged', async () => {
    const root = freshRoot('json-fresh');
    const { code, out } = await capture(() => insightCli('file', [SOURCE, '--json'], root));
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as FilePayload;
    expect(parsed.built_at_commit).toBe('9f2c1ab');
    expect(parsed.extracted_at).toBe('2026-07-07T14:00:00Z');
    expect(parsed.stale).toBe(false);
    expect(parsed.frontmatter.source_sha256).toBe(sha256Of(BODY));
    expect(parsed.frontmatter.built_at_commit).toBe('9f2c1ab');
    expect(parsed.frontmatter.extracted_at).toBe('2026-07-07T14:00:00Z');
  });

  it('the changed fixture → the same stamp strings, stale true, frontmatter.source_sha256 still the entry\'s own hash', async () => {
    const root = changedRoot('json-changed');
    const { code, out } = await capture(() => insightCli('file', [SOURCE, '--json'], root));
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as FilePayload;
    expect(parsed.built_at_commit).toBe('9f2c1ab');
    expect(parsed.extracted_at).toBe('2026-07-07T14:00:00Z');
    expect(parsed.stale).toBe(true);
    expect(parsed.frontmatter.source_sha256).toBe(sha256Of(BODY)); // not re-hashed from the changed body
  });

  it('the three fields sit after `scope` and before `frontmatter` (stable field order, §4.10.8)', async () => {
    const root = missingRoot('json-order');
    const { out } = await capture(() => insightCli('file', [SOURCE, '--json'], root));
    const parsed = JSON.parse(out) as FilePayload;
    expect(Object.keys(parsed)).toEqual([
      'command',
      'found',
      'path',
      'entry_file',
      'scope',
      'built_at_commit',
      'extracted_at',
      'stale',
      'frontmatter',
      'sections',
    ]);
    expect(parsed.stale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC: An absent entry carries no stamp
// ---------------------------------------------------------------------------
describe('AC: an absent entry carries no stamp', () => {
  it('a miss renders as before: no `built at` line, no `stale` field, with and without --json', async () => {
    const root = freshRoot('miss');
    const plain = await capture(() => insightCli('file', ['src/utils/orphan.ts'], root));
    expect(plain.code).toBe(1);
    expect(plain.out).toBe('');
    expect(plain.out).not.toContain('built at');
    expect(plain.err).toContain('no insight entry for src/utils/orphan.ts');

    const json = await capture(() => insightCli('file', ['src/utils/orphan.ts', '--json'], root));
    expect(json.code).toBe(1);
    const parsed = JSON.parse(json.out) as Record<string, unknown>;
    expect(parsed['found']).toBe(false);
    expect('stale' in parsed).toBe(false);
    expect('built_at_commit' in parsed).toBe(false);
    expect(json.out).not.toContain('built at');
  });

  it('an absent module (Rule 8) is unchanged too', async () => {
    const root = makeTmpRoot('miss-module');
    const { code, err, out } = await capture(() => insightCli('file', [SOURCE], root));
    expect(code).toBe(1);
    expect(err).toContain('no insight data');
    expect(out).not.toContain('built at');
  });

  it('concept and element carry no stamp', async () => {
    const root = freshRoot('miss-verbs');
    const insightDir = path.join(root, '.cortex', 'insight');
    fs.writeFileSync(
      path.join(insightDir, 'graph.json'),
      JSON.stringify({
        schemaVersion: '3.0',
        generated: '2026-07-07T14:05:00Z',
        built_at_commit: BUILT,
        nodes: [
          { id: `file:${SOURCE}`, kind: 'file', label: SOURCE },
          { id: 'concept:auth', kind: 'concept', label: 'auth' },
          { id: `element:${SOURCE}#issue`, kind: 'element', label: 'issue' },
        ],
        edges: [
          {
            id: `edge:implements-concept:file:${SOURCE}->concept:auth`,
            source: `file:${SOURCE}`,
            target: 'concept:auth',
            edge_type: 'implements-concept',
            confidence: 'structural',
            evidence: 'issue mints tokens',
            confirmed_at_commit: BUILT,
          },
        ],
      }),
    );
    const concept = await capture(() => insightCli('concept', ['auth'], root));
    const element = await capture(() => insightCli('element', ['issue'], root));
    expect(concept.code).toBe(0);
    expect(element.code).toBe(0);
    for (const r of [concept, element]) {
      expect(r.out).not.toContain('built at');
      expect(r.out).not.toContain('STALE');
    }
  });
});
