/** Atomic tests for the `cortex-quality` bundle text (loops.quality-task Rules 1, 6 to 12). */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { STORE_V4_BUNDLES } from '../../../src/cli/scaffold.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const text = fs.readFileSync(path.join(ROOT, 'skills', 'cortex-quality', 'SKILL.md'), 'utf-8');
const guard = await import(path.join(ROOT, 'scripts', 'measure-skill-descriptions.mjs'));

function inOrder(haystack: string, needles: string[]): void {
  const at = needles.map((n) => haystack.indexOf(n));
  expect(at.every((i) => i >= 0), JSON.stringify(at)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
}
const section = (from: string, to: string): string => text.slice(text.indexOf(from), text.indexOf(to));

describe('The bundle is mirrored and Tier D', () => {
  it('is byte-identical, tier D and 4.0-only', () => {
    expect(fs.readFileSync(path.join(ROOT, '.claude', 'skills', 'cortex-quality', 'SKILL.md'), 'utf-8')).toBe(text);
    expect(guard.TIERS['cortex-quality']).toBe('D');
    expect(guard.REQUIRED_TRIGGERS['cortex-quality']).toEqual([]);
    expect(STORE_V4_BUNDLES).toContain('cortex-quality');
  });
});

describe('The skill carries its steps in order', () => {
  it('names them in order', () => {
    inOrder(section('## Steps, in order', '## The suite'), [
      'write gate', 'cortex tasks collect quality --json', 'the suite', 'at-rest review', 'silent-spec job', 'measurement', 'cortex store validate', 'cortex tasks heartbeat quality',
    ]);
  });
});

describe('The skill handles the unported and unconfigured cases', () => {
  it('says both phrases, and a failed step does not stop the run', () => {
    expect(text).toContain('`not ported`');
    expect(text).toContain('`no test command configured`');
    expect(text).toContain('A step that fails is recorded in the measurement and the next step runs');
  });
});

describe('The skill fixes nothing', () => {
  it('forbids changing code or tests and names the failures file', () => {
    expect(text).toContain('Change no code and no test');
    expect(text).toContain('`now/quality-failures.md`');
    expect(text).toContain('`## <test file> › <test name>`');
    expect(text).toContain('`first seen');
    expect(text).toContain('Remove an item whose test now passes');
  });
});

describe("The skill's review is spec mode with a fresh agent", () => {
  it('gives the agent only the path and the root, and excludes forks', () => {
    expect(text).toContain('**spec mode** of `specflow-review`');
    expect(text).toContain('the spec path and the repository root and nothing else');
    expect(text).toContain('a fork does not count');
    expect(text).toContain('`now/quality-findings.md`');
    expect(text).toContain('P-<today>-quality-<slug>');
  });
});

describe('The silent-spec job runs its steps in order', () => {
  it('names them in order', () => {
    inOrder(section('## The silent-spec job', '## The measurement'), [
      'no code in view', 'git worktree add --detach', '`specflow/`, `.specflow/`, `cortex/`, `.claude/`, `CLAUDE.md` and `AGENTS.md`',
      '--flags', '`described` or `not described`', 'git worktree remove',
    ]);
  });
});

describe('The skill keeps every agent in the foreground', () => {
  it('says so', () => {
    expect(text).toContain('Every agent runs in the foreground, or is awaited before the next step');
  });
});

describe('The skill specifies the measurement', () => {
  it('names the file and the seven headings in order', () => {
    expect(text).toContain('history/measurements/<today>-quality.md');
    inOrder(section('## The measurement', '## Limits'), [
      '`## Specs`', '`## Tests`', '`## At-rest review`', '`## Reviewed specs`', '`## Silent-spec job`', '`## Store use`', '`## Store shape`',
    ]);
  });
});
