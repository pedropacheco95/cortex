/**
 * Spec tests — recall.why as a whole, on a REAL initialised project: `cortex
 * init` scaffolds a temp root, one rule and one decision with `bears_on:
 * [R-001]` are written, the recall index is compiled by the real compiler,
 * and the verbs are driven both through `recallCli` and through the CLI
 * dispatcher `run([...])` (the wiring the spec's `pulse.usage` Rule 9 count
 * assumes). Then the index is deleted (Rule 2, exit 1), and a transcript
 * fixture proves the two verbs are counted the day they ship (Rule 9).
 */
import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { init } from '../../../src/cli/init.js';
import { run } from '../../../src/cli/cli.js';
import { recallCli } from '../../../src/recall/cli.js';
import { writeRecallIndex, recallIndexPath } from '../../../src/recall/index.js';
import { clearRecallIndexCache } from '../../../src/recall/query.js';
import { collectUsage, renderUsageBody } from '../../../src/pulse/usage.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { bash, toolTurn, writeSessionTranscript } from '../../fixtures/sessions.js';

const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const };
const originalCwd = process.cwd();

let root = '';
let home = '';

function write(rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf-8');
}

interface Ran {
  code: number;
  out: string;
  err: string;
}

async function viaModule(argv: string[]): Promise<Ran> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await recallCli(argv, root, { stdout: (l) => out.push(l), stderr: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

/** Through the dispatcher, from inside the project, with console captured as the terminal would see it. */
async function viaCli(argv: string[]): Promise<Ran & { raw: string[] }> {
  const raw: string[] = [];
  const err: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((msg: unknown) => raw.push(String(msg)));
  const error = vi.spyOn(console, 'error').mockImplementation((msg: unknown) => err.push(String(msg)));
  process.chdir(root);
  try {
    const code = await run(argv);
    return { code, out: raw.join('\n'), err: err.join('\n'), raw };
  } finally {
    process.chdir(originalCwd);
    log.mockRestore();
    error.mockRestore();
  }
}

beforeAll(async () => {
  root = makeTmpDir('why-spec-root');
  home = makeTmpDir('why-spec-home');
  const result = await init(root, { home, noLlm: true, yes: true, ...DARWIN });
  expect(result.exitCode).toBe(0);
  write(
    '.cortex/compass/rules/R-001-index-first.md',
    ['---', 'id: R-001', 'title: Read the index first', 'governs:', '  - "src/**/*.ts"', 'confidence: STATED', '---', '', '# R-001 — Read the index first', ''].join('\n'),
  );
  write(
    '.cortex/atlas/decisions/2026-09-15-recall-verbs.md',
    ['---', 'id: decision.2026-09-15-recall-verbs', 'title: Recall verbs are pull-only', 'date: 2026-09-15T12:00:00Z', 'bears_on: [R-001]', '---', '', '# Recall verbs are pull-only', ''].join('\n'),
  );
  await writeRecallIndex(root);
}, TEST_TIMEOUT);

afterEach(() => {
  process.chdir(originalCwd);
  clearRecallIndexCache();
});

afterAll(() => {
  cleanTmp(root);
  cleanTmp(home);
});

describe('recall.why — the listing over a compiled index (Rules 2–4, end-to-end)', () => {
  it('cortex why R-001 lists the decision the real compiler inverted', async () => {
    const { code, out, err } = await viaModule(['why', 'R-001']);
    expect(code).toBe(0);
    expect(err).toBe('');
    expect(out.split('\n')).toEqual([
      'R-001 (rule) — 1 decided · 0 evidence · 0 open · 0 observation themes',
      'Decided:',
      '  2026-09-15  decision.2026-09-15-recall-verbs — Recall verbs are pull-only  (.cortex/atlas/decisions/2026-09-15-recall-verbs.md)',
    ]);
  });

  it('the dispatcher routes why and recall to the module — and never into init', async () => {
    const why = await viaCli(['why', 'R-001']);
    expect(why.code).toBe(0);
    expect(why.raw[0]).toBe('R-001 (rule) — 1 decided · 0 evidence · 0 open · 0 observation themes');

    const recall = await viaCli(['recall', 'recall', 'verbs']);
    expect(recall.code).toBe(0);
    expect(recall.out).toBe(
      'decision 2026-09-15 decision.2026-09-15-recall-verbs — Recall verbs are pull-only (.cortex/atlas/decisions/2026-09-15-recall-verbs.md)',
    );
  });

  it('--json through the dispatcher is one console.log call — the terminal sees a trailing newline (Rule 5)', async () => {
    const { code, raw } = await viaCli(['why', 'R-001', '--json']);
    expect(code).toBe(0);
    expect(raw).toHaveLength(1);
    const parsed = JSON.parse(raw[0] as string) as { key: string; entries: Record<string, unknown> };
    expect(parsed.key).toBe('R-001');
    expect(Object.keys(parsed.entries)).toEqual(['decision.2026-09-15-recall-verbs']);
  });

  it('a path ref to the rule file resolves through its compass id', async () => {
    const { code, out } = await viaModule(['why', '.cortex/compass/rules/R-001-index-first.md']);
    expect(code).toBe(0);
    expect(out.split('\n')[0]).toBe('R-001 (rule, for .cortex/compass/rules/R-001-index-first.md) — 1 decided · 0 evidence · 0 open · 0 observation themes');
  });
});

describe('recall.why — a missing index is exit 1 with the scan hint (Rule 2)', () => {
  it('after deleting recall-index.json both verbs exit 1 naming the file and cortex scan; nothing is written back', async () => {
    const indexFile = recallIndexPath(root);
    const bytes = fs.readFileSync(indexFile);
    fs.rmSync(indexFile);
    try {
      for (const argv of [['why', 'R-001'], ['recall', 'usage']]) {
        const { code, out, err } = await viaCli(argv);
        expect(code).toBe(1);
        expect(out).toBe('');
        expect(err).toContain('.cortex/recall-index.json');
        expect(err).toContain('cortex scan');
      }
      expect(fs.existsSync(indexFile)).toBe(false);
    } finally {
      fs.writeFileSync(indexFile, bytes);
    }
  });
});

describe('recall.why — the verbs are counted the day they ship (pulse.usage Rule 9)', () => {
  it('a transcript with `cortex why R-001` and `cortex recall usage` reports why 1 and recall 1', () => {
    const usageHome = makeTmpDir('why-spec-usage-home');
    try {
      writeSessionTranscript(usageHome, root, 's1', [
        toolTurn(bash('cortex why R-001')),
        toolTurn(bash('cortex recall usage')),
      ]);
      const counts = collectUsage(root, { home: usageHome });
      expect(counts.recallVerbs).toEqual({ recall: 1, why: 1 });
      const body = renderUsageBody(counts);
      expect(body).toContain('- `cortex why`: 1');
      expect(body).toContain('- `cortex recall`: 1');
    } finally {
      cleanTmp(usageHome);
    }
  });
});
