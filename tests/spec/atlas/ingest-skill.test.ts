/**
 * Spec tests for atlas.ingest-skill — the integrated behaviours:
 *   - `cortex init` installs the shipped cortex-ingest bundle (Rule 1);
 *   - overwrite protection is now live (user copy preserved without --yes,
 *     replaced with --yes) — Rule 4 of core-cli.init made real;
 *   - `cortex validate` exists as a CLI command (Rule 4 rider): exit 0
 *     conformant / 1 not, naming the violation.
 *
 * Every test runs in a fresh tmp project with an injected fake home dir; the
 * real ~/.claude is never touched (modelled on tests/fixtures/init-harness.ts).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { init } from '../../../src/cli/init.js';
import { run } from '../../../src/cli/cli.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const };

const REPO_ROOT = path.resolve('/Users/pedropacheco1/Documents/Projetos/cortex');
const VALID_FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'valid');

// ---------------------------------------------------------------------------
// AC: Bundle ships and init installs it
// ---------------------------------------------------------------------------
describe('Bundle ships and init installs it', () => {
  let root: string;
  let home: string;
  let result: { exitCode: number; summary: string };

  beforeAll(async () => {
    root = makeTmpDir('ingest-install-proj');
    home = makeTmpDir('ingest-install-home');
    result = await init(root, { home, noLlm: true, partial: true, yes: true, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => { cleanTmp(root); cleanTmp(home); });

  it('installs .claude/skills/cortex-ingest/SKILL.md with frontmatter name: cortex-ingest', () => {
    const installed = path.join(root, '.claude', 'skills', 'cortex-ingest', 'SKILL.md');
    expect(fs.existsSync(installed)).toBe(true);
    const parsed = matter(fs.readFileSync(installed, 'utf-8'));
    expect(parsed.data['name']).toBe('cortex-ingest');
  });

  it('the summary reports at least 1 skill installed', () => {
    const m = /Skills installed: (\d+)/.exec(result.summary);
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// AC: Overwrite protection becomes live
// ---------------------------------------------------------------------------
describe('Overwrite protection becomes live', () => {
  const USER_CONTENT = '---\nname: cortex-ingest\n---\n\nMY USER-MODIFIED SKILL — do not clobber.\n';

  it('preserves a user-modified bundle byte-identical when run without --yes (no TTY)', async () => {
    const root = makeTmpDir('ingest-preserve-proj');
    const home = makeTmpDir('ingest-preserve-home');
    try {
      // Pre-seed a user-modified bundle before any init runs.
      const target = path.join(root, '.claude', 'skills', 'cortex-ingest', 'SKILL.md');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, USER_CONTENT, 'utf-8');

      // No --yes; the non-interactive test env has no TTY → preserve.
      const result = await init(root, { home, noLlm: true, partial: true, ...DARWIN });

      expect(fs.readFileSync(target, 'utf-8')).toBe(USER_CONTENT);
      expect(result.summary).toMatch(/existing bundle\(s\) preserved/);
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);

  it('replaces the user copy with the shipped bundle when run with --yes', async () => {
    const root = makeTmpDir('ingest-replace-proj');
    const home = makeTmpDir('ingest-replace-home');
    try {
      const target = path.join(root, '.claude', 'skills', 'cortex-ingest', 'SKILL.md');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, USER_CONTENT, 'utf-8');

      await init(root, { home, noLlm: true, partial: true, yes: true, ...DARWIN });

      const after = fs.readFileSync(target, 'utf-8');
      expect(after).not.toBe(USER_CONTENT);
      // The shipped bundle carries the workflow contract, not the user's stub.
      expect(after).toContain('cortex validate');
      expect(after).toContain('atlas/sources/<slug>.<ext>');
    } finally {
      cleanTmp(root); cleanTmp(home);
    }
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// AC: cortex validate command works
// ---------------------------------------------------------------------------
describe('cortex validate command works', () => {
  it('exits 0 on a conformant repo', async () => {
    const dir = makeTmpDir('validate-ok');
    try {
      fs.cpSync(VALID_FIXTURE, dir, { recursive: true });
      const code = await run(['validate', dir]);
      expect(code).toBe(0);
    } finally {
      cleanTmp(dir);
    }
  }, TEST_TIMEOUT);

  it('exits 1 and names the violation with a planted broken implements:', async () => {
    const dir = makeTmpDir('validate-broken');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      fs.cpSync(VALID_FIXTURE, dir, { recursive: true });
      const specPath = path.join(dir, 'specs', 'schema', 'validator.spec.md');
      const broken = fs
        .readFileSync(specPath, 'utf-8')
        .replace(
          'implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md',
          'implements: ../../specs-business/schema/does-not-exist.business.md',
        );
      fs.writeFileSync(specPath, broken, 'utf-8');

      const code = await run(['validate', dir]);
      expect(code).toBe(1);

      const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(output).toContain('does not resolve');
      expect(output).toContain('implements');
    } finally {
      logSpy.mockRestore();
      cleanTmp(dir);
    }
  }, TEST_TIMEOUT);
});
