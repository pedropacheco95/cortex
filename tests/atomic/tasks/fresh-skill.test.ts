/** Atomic tests for the `cortex-fresh` bundle text (loops.fresh-task Rules 1, 3 to 10). */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { STORE_V4_BUNDLES } from '../../../src/cli/scaffold.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const text = fs.readFileSync(path.join(ROOT, 'skills', 'cortex-fresh', 'SKILL.md'), 'utf-8');
const guard = await import(path.join(ROOT, 'scripts', 'measure-skill-descriptions.mjs'));

describe('The bundle is mirrored and Tier D', () => {
  it('[LOOPS-FRESH-TASK-8] is byte-identical, tier D and 4.0-only', () => {
    expect(fs.readFileSync(path.join(ROOT, '.claude', 'skills', 'cortex-fresh', 'SKILL.md'), 'utf-8')).toBe(text);
    expect(guard.TIERS['cortex-fresh']).toBe('D');
    expect(guard.REQUIRED_TRIGGERS['cortex-fresh']).toEqual([]);
    expect(STORE_V4_BUNDLES).toContain('cortex-fresh');
  });
});

describe('The skill carries its steps in order', () => {
  it('[LOOPS-FRESH-TASK-9] names them in order', () => {
    const steps = text.slice(text.indexOf('## Steps, in order'), text.indexOf('## Changing a store file'));
    const at = ['write gate', 'cortex store expire --apply', 'cortex tasks collect fresh --json', 'history/changes/<today>-fresh.md', 'cortex store validate', 'cortex tasks heartbeat fresh'].map((s) => steps.indexOf(s));
    expect(at.every((i) => i >= 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});

describe('The skill fixes the store by the filing rules', () => {
  it('[LOOPS-FRESH-TASK-10] states the evidence, origin, retire, merge and history rules', () => {
    expect(text).toContain('only after reading the evidence');
    expect(text).toContain('`session:<id>` to the file\'s `origin`');
    expect(text).toMatch(/\*\*Retiring\*\* a file removes it and repoints or removes links/);
    expect(text).toMatch(/\*\*Merging\*\*[^\n]*`aliases`[^\n]*`origin` lists, repoints links/);
    expect(text).toContain('Never edit a file under `history/`');
  });
});

describe('The skill leaves what it cannot confirm', () => {
  it('[LOOPS-FRESH-TASK-11] leaves it alone, counts it unconfirmed and proposes', () => {
    expect(text).toMatch(/nothing you can read confirms it, leave the file alone, count it as `unconfirmed`, and write one proposal/);
  });
});

describe('The skill closes a pitfall only on evidence', () => {
  it('[LOOPS-FRESH-TASK-12] needs evidence the fix landed, and sends the rest to a proposal', () => {
    expect(text).toContain('only on observed evidence that the fix landed');
    expect(text).toContain('A missing file or symbol is not evidence');
    expect(text).toContain('Without that evidence, write one proposal asking a person');
    expect(text).not.toContain('a pitfall the code no longer has');
  });
});

describe('Specs stay proposals', () => {
  it('[LOOPS-FRESH-TASK-13] forbids a spec, names the id, appends only, skips what is proposed', () => {
    expect(text).toContain('Never write a spec');
    expect(text).toContain('P-<today>-fresh-<slug');
    expect(text).toContain('`now/proposals.md` is only ever appended to');
    expect(text).toContain('`already proposed`');
  });
});

describe('The skill specifies the record', () => {
  it('[LOOPS-FRESH-TASK-14] names the twelve lines and the quiet line', () => {
    const record = text.slice(text.indexOf('## The record'));
    for (const l of ['expired', 're-verified', 'corrected', 'retired', 'merged', 'not a duplicate', 'unconfirmed', 'scaffolding', 'open pitfalls', 'open pitfalls aged', 'proposed', 'already proposed']) {
      expect(record, l).toContain(`\`${l}\``);
    }
    expect(record).toContain('Nothing went stale this cycle.');
  });
});

describe('Bounded commands', () => {
  it('[LOOPS-FRESH-TASK-19] names the limit and forbids a nested claude', () => {
    expect(text).toContain('runs in the background and is polled with a 10-minute limit');
    expect(text).toContain('Never spawn a nested `claude` process');
  });
});

describe('Tasks neither stage nor commit', () => {
  it('[LOOPS-FRESH-TASK-13] says so', () => {
    expect(text).toContain('do not stage or commit: no `git rm`, no `git add`');
  });
});
