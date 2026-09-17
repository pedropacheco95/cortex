/**
 * Spec tests for schema.visibility — one describe per Acceptance Criterion,
 * driven end to end through validate() (and once through the `cortex
 * validate --json` renderer for the report's notes) over a copy of the valid
 * fixture with the config edited in place.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validate } from '../../../src/schema/validate.js';
import { run as validateCli } from '../../../src/schema/cli.js';
import { init } from '../../../src/cli/init.js';
import { sync } from '../../../src/cli/sync.js';
import { makeTmpFixture, cleanup } from '../../fixtures/validator-tmp.js';
import { makeTmpDir, cleanTmp, gitInit } from '../../fixtures/init-harness.js';

const TEST_TIMEOUT = 60_000;

function setConfig(root: string, patch: Record<string, unknown>): void {
  const p = path.join(root, '.cortex', 'cortex.config.json');
  const config = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete config[k];
    else config[k] = v;
  }
  fs.writeFileSync(p, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function write(root: string, rel: string, content: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

const ENVIRONMENT = [
  '# Environment', '', 'Where things run.', '',
  'VM: 10.20.30.40',
  'Host: app-prod.internal.acme.cloud (ssh)',
  'API at api.acme.com:8443',
  'ssh deploy@app-prod.internal.acme.cloud',
  'Account 123456789012',
].join('\n') + '\n';

const visibilityOf = (report: { violations: { check: string }[] }) => report.violations.filter((v) => v.check === 'check.visibility');

describe('AC1: silent unless the repo is declared public', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmpFixture('visibility-ac1');
    write(root, '.cortex/compass/environment.md', '# Env\n\nssh deploy@10.20.30.40\n');
  });
  afterAll(() => cleanup(root));

  it('visibility absent, { repo: "unknown" }, { repo: "private" } → no check.visibility violation in any run', async () => {
    for (const visibility of [undefined, { repo: 'unknown' }, { repo: 'private' }]) {
      setConfig(root, { visibility });
      const report = await validate(root);
      expect(visibilityOf(report), JSON.stringify(visibility)).toEqual([]);
      expect(report.conformant).toBe(true);
    }
  });
});

describe('AC2: a public repo warns with the line, per family', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmpFixture('visibility-ac2');
    setConfig(root, { visibility: { repo: 'public' } });
    write(root, '.cortex/compass/environment.md', ENVIRONMENT);
  });
  afterAll(() => cleanup(root));

  it('exactly five warnings, lines 5–9, families ipv4/host/port/ssh/account, each ending visibility.allow; conformant', async () => {
    const report = await validate(root);
    const out = visibilityOf(report) as { severity: string; location: { path: string; line?: number }; message: string }[];
    expect(out).toHaveLength(5);
    expect(out.map((v) => v.location.line)).toEqual([5, 6, 7, 8, 9]);
    expect(out.map((v) => /carries a (\w+) \(/.exec(v.message)?.[1])).toEqual(['ipv4', 'host', 'port', 'ssh', 'account']);
    for (const v of out) {
      expect(v.severity).toBe('warning');
      expect(v.message.endsWith('visibility.allow')).toBe(true);
      expect(path.relative(root, v.location.path)).toBe('.cortex/compass/environment.md');
    }
    expect(report.conformant).toBe(true);
    expect(report.counts.warning).toBeGreaterThanOrEqual(5);
  });
});

describe('AC3: safe hosts and dev ports never match', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmpFixture('visibility-ac3');
    setConfig(root, { visibility: { repo: 'public' } });
    write(root, '.cortex/compass/environment.md', [
      'GitHub remote: github.com/acme/app (private)',
      'Dev server: localhost:3000',
      'Version 3.4.0.1 shipped',
      'Bind 0.0.0.0',
    ].join('\n') + '\n');
  });
  afterAll(() => cleanup(root));

  it('no check.visibility warning is emitted', async () => {
    expect(visibilityOf(await validate(root))).toEqual([]);
  });
});

describe('AC3b: a code reference is not a port', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmpFixture('visibility-ac3b');
    setConfig(root, { visibility: { repo: 'public' } });
    write(root, '.cortex/compass/bugs/B-099-code-ref.md', [
      '# B-099', '',
      'Evidence: src/hooks/post-read.ts:74',
      'B-019 … the check at validate.ts:119',
      'Reach app-prod.internal.acme.cloud:8443',
    ].join('\n') + '\n');
  });
  afterAll(() => cleanup(root));

  it('exactly one warning, for the .cloud:8443 line, none for a .ts reference', async () => {
    const out = visibilityOf(await validate(root)) as { location: { line?: number }; message: string }[];
    expect(out).toHaveLength(1);
    expect(out[0]!.location.line).toBe(5);
    expect(out[0]!.message).toContain('carries a port (app-prod.internal.acme.cloud:8443)');
    expect(out.some((v) => v.message.includes('.ts:'))).toBe(false);
  });
});

describe('AC4: ignored files are out of scope, re-included ones are in', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmpFixture('visibility-ac4');
    setConfig(root, { visibility: { repo: 'public' } });
    write(root, '.cortex/atlas/sources/notes.md', 'ssh ops@db.acme.net\n');
    write(root, '.cortex/atlas/sources/reframe.md', 'ssh ops@db.acme.net\n');
    write(root, '.gitignore', '.cortex/atlas/sources/*\n!.cortex/atlas/sources/reframe.md\n');
  });
  afterAll(() => cleanup(root));

  it('exactly one warning, for reframe.md', async () => {
    const out = visibilityOf(await validate(root)) as { location: { path: string } }[];
    expect(out).toHaveLength(1);
    expect(path.relative(root, out[0]!.location.path)).toBe('.cortex/atlas/sources/reframe.md');
  });
});

describe('AC5: an allow glob silences a file and is reported', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmpFixture('visibility-ac5');
    setConfig(root, { visibility: { repo: 'public', allow: ['.cortex/compass/environment.md'] } });
    write(root, '.cortex/compass/environment.md', ENVIRONMENT);
  });
  afterAll(() => cleanup(root));

  it('no warning names the file and the report notes carry the allow line', async () => {
    const report = await validate(root);
    expect(visibilityOf(report).some((v) => (v as { location: { path: string } }).location.path.endsWith('environment.md'))).toBe(false);
    expect(report.notes).toEqual(['allowed by visibility.allow: .cortex/compass/environment.md']);
  });

  it('`cortex validate --json` carries the same notes in its JSON report', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const code = await validateCli([root, '--json']);
      expect(code).toBe(0);
      const printed = JSON.parse(String(log.mock.calls[0]?.[0])) as { notes?: string[]; conformant: boolean };
      expect(printed.conformant).toBe(true);
      expect(printed.notes).toEqual(['allowed by visibility.allow: .cortex/compass/environment.md']);
    } finally {
      log.mockRestore();
    }
  });

  it('a report with nothing allowed carries no notes key', async () => {
    const clean = makeTmpFixture('visibility-ac5-clean');
    try {
      const report = await validate(clean);
      expect('notes' in report).toBe(false);
    } finally {
      cleanup(clean);
    }
  });
});

describe('AC6: the per-file cap holds', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmpFixture('visibility-ac6');
    setConfig(root, { visibility: { repo: 'public' } });
    write(root, '.cortex/compass/inventory.md', Array.from({ length: 30 }, (_, i) => `vm 10.0.0.${i + 1}`).join('\n') + '\n');
  });
  afterAll(() => cleanup(root));

  it('20 line warnings plus one "… and 10 more lines" warning', async () => {
    const out = visibilityOf(await validate(root)) as { location: { line?: number }; message: string }[];
    expect(out).toHaveLength(21);
    expect(out.slice(0, 20).map((v) => v.location.line)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(out[20]!.message).toBe('… and 10 more lines');
  });
});

describe('AC7: the config shape is checked', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmpFixture('visibility-ac7');
  });
  afterAll(() => cleanup(root));

  it('{ repo: "open" } → one check.config error naming visibility.repo', async () => {
    setConfig(root, { visibility: { repo: 'open' } });
    const report = await validate(root);
    const errs = report.violations.filter((v) => v.check === 'check.config' && v.severity === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]!.location.key).toBe('visibility.repo');
    expect(report.conformant).toBe(false);
  });

  it('{ repo: "public", allow: "compass/*" } → one check.config error naming visibility.allow', async () => {
    setConfig(root, { visibility: { repo: 'public', allow: 'compass/*' } });
    const report = await validate(root);
    const errs = report.violations.filter((v) => v.check === 'check.config' && v.severity === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]!.location.key).toBe('visibility.allow');
  });
});

describe('AC8: init writes the key explicitly; sync leaves an old config alone', () => {
  let freshRoot: string;
  let oldRoot: string;
  let home: string;
  beforeAll(async () => {
    freshRoot = makeTmpDir('visibility-ac8-fresh');
    oldRoot = makeTmpDir('visibility-ac8-old');
    home = makeTmpDir('visibility-ac8-home');
    gitInit(freshRoot);
    gitInit(oldRoot);
    await init(freshRoot, { noLlm: true, home, platform: 'darwin' });
    await init(oldRoot, { noLlm: true, home, platform: 'darwin' });
    setConfig(oldRoot, { visibility: undefined });
    await sync(oldRoot, { home, platform: 'darwin' });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(freshRoot); cleanTmp(oldRoot); cleanTmp(home); });

  it('the fresh project carries "visibility": { "repo": "unknown", "allow": [] }', () => {
    const config = JSON.parse(fs.readFileSync(path.join(freshRoot, '.cortex', 'cortex.config.json'), 'utf-8'));
    expect(config.visibility).toEqual({ repo: 'unknown', allow: [] });
  });

  it('the old project still lacks the key after sync', () => {
    const config = JSON.parse(fs.readFileSync(path.join(oldRoot, '.cortex', 'cortex.config.json'), 'utf-8'));
    expect('visibility' in config).toBe(false);
  });
});
