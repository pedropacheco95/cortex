/**
 * Atomic tests — `store.migrate-skill`, one per acceptance criterion. The
 * skill is agentic; these pin its text (order, plan forms, knowledge rules,
 * Never list) and its 4.0-only bundling.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { listSkillBundles } from '../../../src/cli/scaffold.js';
import { specsRoot } from '../../../src/paths.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SKILL = path.join(ROOT, 'skills', 'cortex-migrate', 'SKILL.md');
const MIRROR = path.join(ROOT, '.claude', 'skills', 'cortex-migrate', 'SKILL.md');
const text = fs.existsSync(SKILL) ? fs.readFileSync(SKILL, 'utf8') : '';

describe('store.migrate-skill', () => {
  it('[STORE-MIGRATE-SKILL-1] exists, is mirrored byte for byte, and fits the budget', () => {
    expect(text).not.toBe('');
    expect(fs.readFileSync(MIRROR, 'utf8')).toBe(text);
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'measure-skill-descriptions.mjs')], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/^cortex-migrate\s+E\b/m);
    expect(out).toContain('OK    all');
  });

  it('[STORE-MIGRATE-SKILL-2] carries the steps in order', () => {
    const body = text.slice(text.indexOf('## Steps, in order'), text.indexOf('## Deciding'));
    const steps = ['--json', 'unpromoted work', 'one-line reason', '`plan.json`', '`decisions.md`', '--plan .cortex-migrate/plan.json', '`undecided: 0`'];
    const at = steps.map((s) => body.indexOf(s));
    expect(at.every((i) => i >= 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('[STORE-MIGRATE-SKILL-3] states the plan forms and the knowledge rules', () => {
    for (const f of ['"retired"', '"history/sources/raw/', '{ "target":', '"file":', '/**']) expect(text, f).toContain(f);
    expect(text).toMatch(/unanswered question[^\n]*never retired/i);
    expect(text).toMatch(/pending proposal/i);
    expect(text).toMatch(/tests[^\n]*only as raw[^\n]*or as a digest/i);
    expect(text).toMatch(/records both statements with their refs/);
  });

  it('[STORE-MIGRATE-SKILL-4] has a Never list naming apply, accept, both stores and commits', () => {
    const never = text.slice(text.indexOf('## Never'));
    for (const n of ['--apply', '--accept', '`.cortex/`', '`cortex/`', 'commit']) expect(never, n).toContain(n);
  });

  it('[STORE-MIGRATE-SKILL-5] is never installed by the 3.x init or sync', () => {
    const listed = listSkillBundles(path.join(ROOT, 'skills'));
    expect(listed).not.toContain('cortex-migrate');
    expect(listed).not.toContain('cortex-remember');
  });

  const adjust = text.slice(text.indexOf('## The skill-adjust step'), text.indexOf('## Never'));
  const lines = text.split('\n');

  it('[STORE-MIGRATE-SKILL-6] The step comes after acceptance and after the plan steps', () => {
    expect(text.indexOf('## Deciding')).toBeLessThan(text.indexOf('## The skill-adjust step'));
    expect(adjust).toContain('after a person has run `cortex migrate --accept`');
    expect(adjust).toContain('If `migration.accepted` is not set, stop and say so.');
  });

  it("[STORE-MIGRATE-SKILL-7] The step's order is stated", () => {
    const marks = ['`cortex sync --dry-run`', 'Read each listed file', 'Decide each mention', 'Make the edits', '`.cortex-migrate/skill-edits.md`', 'Show the person'];
    const at = marks.map((m) => adjust.indexOf(m));
    expect(at.every((i) => i >= 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('[STORE-MIGRATE-SKILL-8] The three decisions are stated', () => {
    for (const n of ['**edited**', '**left**', '**open**', 'A mention is never silently skipped', 'A skill is never deleted', 'dropping one is an `open`']) expect(adjust, n).toContain(n);
  });

  it('[STORE-MIGRATE-SKILL-9] The replacement table is complete', () => {
    const spec = fs.readFileSync(path.join(specsRoot(ROOT), 'store', 'migrate.spec.md'), 'utf8');
    const listLine = spec.split('\n').find((l) => l.includes('**The retired list**'))!;
    const names = [...listLine.slice(listLine.indexOf('):')).matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    expect(names.length).toBeGreaterThan(20);
    const rows = adjust.split('\n').filter((l) => l.trim().startsWith('|'));
    for (const n of [...names, '.cortex/', '.specflow/specs/', '.specflow/specs-business/']) {
      expect(rows.some((r) => r.includes(n)), n).toBe(true);
    }
  });

  it('[STORE-MIGRATE-SKILL-10] A replacement must exist first', () => {
    expect(adjust).toContain('`replacement not there yet`');
    expect(adjust).toContain('a `specflow/` one only when `specflow/` exists at the root, which is after `cortex specs port`');
  });

  it('[STORE-MIGRATE-SKILL-11] Every edit is reported', () => {
    expect(adjust).toContain('add `.cortex-migrate/` to the exclude file first');
    expect(adjust).toContain('file, line, term, decision, the text before and after, and a one-line reason');
  });

  it('[STORE-MIGRATE-SKILL-12] A retired skill with edits goes to the person', () => {
    const body = adjust.slice(adjust.indexOf('### A retired skill with local edits'));
    for (const n of ['`is retired but has local edits`', 'decision `open`', 'remove it, or keep that content under a new name', 'Delete nothing yourself']) expect(body, n).toContain(n);
  });

  it('[STORE-MIGRATE-SKILL-13] The Never list still holds', () => {
    const never = text.slice(text.indexOf('## Never'));
    for (const n of ['--apply', '--accept', '`.cortex/`', '`cortex/`', 'commit']) expect(never, n).toContain(n);
    expect(adjust).toContain('A person commits');
  });

  it('[STORE-MIGRATE-SKILL-14] The skill is typed only', () => {
    for (const name of ['cortex-migrate', 'cortex-register-tasks']) {
      const fm = fs.readFileSync(path.join(ROOT, 'skills', name, 'SKILL.md'), 'utf8').split('---')[1]!;
      expect(fm, name).toMatch(/^disable-model-invocation: true$/m);
      expect(fm, name).toMatch(/^name: /m);
      expect(fm, name).toMatch(/^description: \S/m);
    }
    expect(lines[2]).toMatch(/^description: '.+'$/);
  });
});
