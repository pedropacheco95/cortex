/**
 * Spec tests for insight.cli — the three v3 `cortex insight` query commands
 * (file / concept / element; schema §4.10.8, superseding v2's
 * query/get/neighbors/list). One describe per Acceptance Criterion in
 * support_documents/v3-spec-drafts/specs/insight/cli.spec.md. Runs against
 * the committed hand-authored fixtures — flat (tests/fixtures/valid) and
 * scoped (tests/fixtures/insight-scoped) — plus tmp dirs for the
 * absent-module and malformed cases. Deterministic Core (RULES 3): the CLI
 * reads only `.cortex/insight/` and writes nothing.
 */
import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { insightCli } from '../../../src/insight/cli.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FLAT_ROOT = path.resolve(HERE, '../../fixtures/valid');
const SCOPED_ROOT = path.resolve(HERE, '../../fixtures/insight-scoped');

let counter = 0;
const tmpRoots: string[] = [];
function makeTmpRoot(label: string): string {
  const dir = path.join(os.tmpdir(), `cortex-insight-cli-v3-${label}-${Date.now()}-${counter++}`);
  fs.mkdirSync(dir, { recursive: true });
  tmpRoots.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tmpRoots) fs.rmSync(dir, { recursive: true, force: true });
});

// --- stdout/stderr/exit capture --------------------------------------------

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

// ---------------------------------------------------------------------------

describe('AC: file returns the rich L3 entry for a known path (flat)', () => {
  it('file src/auth/session.ts → Purpose, Main players, Insights, Connections content', async () => {
    const { code, out } = await capture(() => insightCli('file', ['src/auth/session.ts'], FLAT_ROOT));
    expect(code).toBe(0);
    expect(out).toContain('Issues, validates, and refreshes session tokens');
    expect(out).toContain('Main players');
    expect(out).toContain('validateToken');
    expect(out).toContain('clock-skew tolerant'); // Insights
    expect(out).toContain('src/api/middleware.ts'); // Connections
  });
});

describe('AC: file returns the lighter L2 entry when that is all that exists', () => {
  it('file src/util/log.ts → Purpose + Connections, no fabricated Main players', async () => {
    const { code, out } = await capture(() => insightCli('file', ['src/util/log.ts'], FLAT_ROOT));
    expect(code).toBe(0);
    expect(out).toContain('structured-logging wrapper'); // Purpose
    expect(out).toContain('src/auth/session.ts'); // Connections (Used by)
    expect(out).not.toContain('Main players');
    expect(out).toContain('L2');
  });
});

describe('AC: file resolves transparently across scoped and flat layouts', () => {
  it('identical invocation returns identical entry content against both layouts', async () => {
    const flat = await capture(() => insightCli('file', ['src/auth/session.ts', '--json'], FLAT_ROOT));
    const scoped = await capture(() => insightCli('file', ['src/auth/session.ts', '--json'], SCOPED_ROOT));
    expect(flat.code).toBe(0);
    expect(scoped.code).toBe(0);
    const f = JSON.parse(flat.out) as { sections: unknown; frontmatter: unknown; scope: unknown };
    const s = JSON.parse(scoped.out) as { sections: unknown; frontmatter: unknown; scope: unknown };
    expect(s.sections).toEqual(f.sections);
    expect(s.frontmatter).toEqual(f.frontmatter);
    // The layer resolves the layout internally: flat is unscoped, scoped names its owner.
    expect(f.scope).toBeNull();
    expect(s.scope).toBe('auth');
  });

  it('the scoped L2 entry resolves too (shared util scope)', async () => {
    const { code, out } = await capture(() => insightCli('file', ['src/util/log.ts'], SCOPED_ROOT));
    expect(code).toBe(0);
    expect(out).toContain('structured-logging wrapper');
  });
});

describe('AC-adjacent: file miss is a clear message + exit 1 (v2 get convention)', () => {
  it('file src/does/not/exist.ts → exit 1 naming the path', async () => {
    const { code, err } = await capture(() => insightCli('file', ['src/does/not/exist.ts'], FLAT_ROOT));
    expect(code).toBe(1);
    expect(err).toContain('src/does/not/exist.ts');
  });

  it('--json miss is structured with found:false', async () => {
    const { code, out } = await capture(() => insightCli('file', ['src/does/not/exist.ts', '--json'], FLAT_ROOT));
    expect(code).toBe(1);
    const parsed = JSON.parse(out) as { found: boolean; error: string };
    expect(parsed.found).toBe(false);
    expect(parsed.error).toContain('src/does/not/exist.ts');
  });
});

describe('AC: concept returns touching files and related concepts', () => {
  it('concept authentication → names src/auth/session.ts and authorization', async () => {
    const { code, out } = await capture(() => insightCli('concept', ['authentication'], FLAT_ROOT));
    expect(code).toBe(0);
    expect(out).toContain('src/auth/session.ts');
    expect(out).toContain('authorization');
  });

  it('--json carries files[] and related[] structurally', async () => {
    const { out } = await capture(() => insightCli('concept', ['authentication', '--json'], FLAT_ROOT));
    const parsed = JSON.parse(out) as {
      found: boolean;
      files: Array<{ path: string; edge_type: string }>;
      related: Array<{ slug: string; edge_type: string }>;
    };
    expect(parsed.found).toBe(true);
    expect(parsed.files.map((f) => f.path)).toContain('src/auth/session.ts');
    expect(parsed.related.map((r) => r.slug)).toContain('authorization');
  });
});

describe('AC: concept falls back to a scope-local concept doc', () => {
  it('concept session-rotation (scoped fixture, no global doc) → found via scopes/auth/concepts/', async () => {
    const { code, out } = await capture(() => insightCli('concept', ['session-rotation'], SCOPED_ROOT));
    expect(code).toBe(0);
    expect(out).toContain('rotate-and-revoke');
    expect(out).toContain('src/auth/session.ts');
  });

  it('a global concept still resolves in the scoped layout (cross-scope graph merged)', async () => {
    const { code, out } = await capture(() => insightCli('concept', ['authentication'], SCOPED_ROOT));
    expect(code).toBe(0);
    expect(out).toContain('src/auth/session.ts');
    expect(out).toContain('authorization');
  });
});

describe('AC: concept reports an explicit miss for an unknown concept', () => {
  it('concept permissions → explicit not-found, exit 1, never an empty success', async () => {
    const { code, err, out } = await capture(() => insightCli('concept', ['permissions'], FLAT_ROOT));
    expect(code).toBe(1);
    expect(err).toContain('no such concept');
    expect(err).toContain('permissions');
    expect(out).toBe('');
  });
});

describe('AC: element returns a main player with its connections', () => {
  it('element validateToken → description, line range, connections, pointers', async () => {
    const { code, out } = await capture(() => insightCli('element', ['validateToken'], FLAT_ROOT));
    expect(code).toBe(0);
    expect(out).toContain('Verifies signature, expiry');
    expect(out).toContain('L40'); // line range from the Main players bullet
    expect(out).toContain('element:src/util/log.ts#log'); // calls connection
    expect(out).toContain('src/auth/keys.ts'); // query pointers
  });

  it('the path#name query form works', async () => {
    const { code, out } = await capture(() =>
      insightCli('element', ['src/auth/session.ts#validateToken'], FLAT_ROOT),
    );
    expect(code).toBe(0);
    expect(out).toContain('Verifies signature, expiry');
  });

  it('element resolves in the scoped layout too (scope-local graph merged)', async () => {
    const { code, out } = await capture(() => insightCli('element', ['validateToken'], SCOPED_ROOT));
    expect(code).toBe(0);
    expect(out).toContain('Verifies signature, expiry');
  });
});

describe('AC: element returns "no rich entry" for a non-main-player, pointing at its file', () => {
  it('element log → explicit no-rich-entry naming src/util/log.ts, exit 0', async () => {
    const { code, out } = await capture(() => insightCli('element', ['log'], FLAT_ROOT));
    expect(code).toBe(0);
    expect(out).toContain('no rich entry');
    expect(out).toContain('src/util/log.ts');
    expect(out).toContain('cortex insight file');
  });

  it('--json marks the match rich:false with the file named', async () => {
    const { out } = await capture(() => insightCli('element', ['log', '--json'], FLAT_ROOT));
    const parsed = JSON.parse(out) as { found: boolean; matches: Array<{ rich: boolean; file: string }> };
    expect(parsed.found).toBe(true);
    expect(parsed.matches[0]!.rich).toBe(false);
    expect(parsed.matches[0]!.file).toBe('src/util/log.ts');
  });
});

describe('AC-adjacent: element with no graph match at all is an explicit miss', () => {
  it('element doesNotExist → exit 1 naming the query', async () => {
    const { code, err } = await capture(() => insightCli('element', ['doesNotExist'], FLAT_ROOT));
    expect(code).toBe(1);
    expect(err).toContain('doesNotExist');
  });
});

describe('AC: --json emits structured output equivalent to the default rendering', () => {
  it('file --json is valid JSON with the section content as fields, not prose', async () => {
    const { code, out } = await capture(() => insightCli('file', ['src/auth/session.ts', '--json'], FLAT_ROOT));
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as {
      command: string;
      sections: Record<string, string>;
      frontmatter: { extraction_level: number };
    };
    expect(parsed.command).toBe('file');
    expect(parsed.frontmatter.extraction_level).toBe(3);
    expect(parsed.sections['Purpose']).toContain('Issues, validates, and refreshes session tokens');
    expect(parsed.sections['Main players']).toContain('validateToken');
    expect(parsed.sections['Insights']).toContain('clock-skew');
    expect(parsed.sections['Connections']).toContain('src/api/middleware.ts');
  });

  it('the same data appears in the human rendering without --json', async () => {
    const plain = await capture(() => insightCli('file', ['src/auth/session.ts'], FLAT_ROOT));
    const json = await capture(() => insightCli('file', ['src/auth/session.ts', '--json'], FLAT_ROOT));
    const parsed = JSON.parse(json.out) as { sections: Record<string, string> };
    for (const content of Object.values(parsed.sections)) {
      expect(plain.out).toContain(content.split('\n')[0]!);
    }
  });

  it('all three subcommands are byte-stable across runs under --json', async () => {
    for (const [verb, arg] of [
      ['file', 'src/auth/session.ts'],
      ['concept', 'authentication'],
      ['element', 'validateToken'],
    ] as const) {
      const a = await capture(() => insightCli(verb, [arg, '--json'], FLAT_ROOT));
      const b = await capture(() => insightCli(verb, [arg, '--json'], FLAT_ROOT));
      expect(a.code).toBe(0);
      expect(a.out).toBe(b.out);
    }
  });
});

describe('AC: v2 retired verbs are not exposed', () => {
  it.each(['query', 'get', 'neighbors', 'list'])('%s → rejected with a pointed migration message', async (verb) => {
    const { code, err, out } = await capture(() => insightCli(verb, ['anything'], FLAT_ROOT));
    expect(code).toBe(1);
    expect(out).toBe(''); // never silently maps to a v3 verb
    expect(err).toContain('retired in v3');
    expect(err).toContain('file | concept | element');
  });
});

describe('AC: cortex insight ask does not exist', () => {
  it('ask → rejected as an unknown subcommand', async () => {
    const { code, err, out } = await capture(() => insightCli('ask', ['how does auth work here?'], FLAT_ROOT));
    expect(code).toBe(1);
    expect(out).toBe('');
    expect(err).toContain('unknown subcommand');
    expect(err).not.toContain('retired');
  });
});

describe('AC: an absent insight module returns an explicit miss', () => {
  it('file over a project with no .cortex/insight/ → explicit no-insight-data, no throw', async () => {
    const root = makeTmpRoot('absent');
    const { code, err } = await capture(() => insightCli('file', ['src/auth/session.ts'], root));
    expect(code).toBe(1);
    expect(err).toContain('no insight data');
  });

  it('concept and element degrade identically', async () => {
    const root = makeTmpRoot('absent-ce');
    for (const [verb, arg] of [
      ['concept', 'authentication'],
      ['element', 'validateToken'],
    ] as const) {
      const { code, err } = await capture(() => insightCli(verb, [arg], root));
      expect(code).toBe(1);
      expect(err).toContain('no insight data');
    }
  });
});

describe('AC-adjacent: a malformed artefact is exit 1, not a crash (v2 convention kept)', () => {
  it('a corrupt graph.json fails a concept query with exit 1', async () => {
    const root = makeTmpRoot('malformed');
    const insightDir = path.join(root, '.cortex', 'insight');
    fs.mkdirSync(insightDir, { recursive: true });
    fs.writeFileSync(path.join(insightDir, 'graph.json'), '{ not json', 'utf-8');
    const { code, err } = await capture(() => insightCli('concept', ['anything'], root));
    expect(code).toBe(1);
    expect(err).toContain('graph.json');
  });

  it('a malformed per-file entry fails a file query with exit 1', async () => {
    const root = makeTmpRoot('malformed-entry');
    const anatomyDir = path.join(root, '.cortex', 'insight', 'anatomy', 'src');
    fs.mkdirSync(anatomyDir, { recursive: true });
    fs.writeFileSync(path.join(anatomyDir, 'x.ts.md'), '---\npath: src/x.ts\n---\n\nno required sections\n', 'utf-8');
    const { code, err } = await capture(() => insightCli('file', ['src/x.ts'], root));
    expect(code).toBe(1);
    expect(err.length).toBeGreaterThan(0);
  });
});
