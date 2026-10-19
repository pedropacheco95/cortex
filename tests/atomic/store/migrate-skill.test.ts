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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SKILL = path.join(ROOT, 'skills', 'cortex-migrate', 'SKILL.md');
const MIRROR = path.join(ROOT, '.claude', 'skills', 'cortex-migrate', 'SKILL.md');
const text = fs.existsSync(SKILL) ? fs.readFileSync(SKILL, 'utf8') : '';

describe('store.migrate-skill', () => {
  it('exists, is mirrored byte for byte, and fits the budget', () => {
    expect(text).not.toBe('');
    expect(fs.readFileSync(MIRROR, 'utf8')).toBe(text);
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'measure-skill-descriptions.mjs')], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/^cortex-migrate\s+B\b/m);
    expect(out).toContain('OK    all');
  });

  it('carries the steps in order', () => {
    const body = text.slice(text.indexOf('## Steps, in order'), text.indexOf('## Deciding'));
    const steps = ['--json', 'unpromoted work', 'one-line reason', '`plan.json`', '`decisions.md`', '--plan .cortex-migrate/plan.json', '`undecided: 0`'];
    const at = steps.map((s) => body.indexOf(s));
    expect(at.every((i) => i >= 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('states the plan forms and the knowledge rules', () => {
    for (const f of ['"retired"', '"history/sources/raw/', '{ "target":', '"file":', '/**']) expect(text, f).toContain(f);
    expect(text).toMatch(/unanswered question[^\n]*never retired/i);
    expect(text).toMatch(/pending proposal/i);
    expect(text).toMatch(/tests[^\n]*only as raw[^\n]*or as a digest/i);
    expect(text).toMatch(/records both statements with their refs/);
  });

  it('has a Never list naming apply, accept, both stores and commits', () => {
    const never = text.slice(text.indexOf('## Never'));
    for (const n of ['--apply', '--accept', '`.cortex/`', '`cortex/`', 'commit']) expect(never, n).toContain(n);
  });

  it('is never installed by the 3.x init or sync', () => {
    const listed = listSkillBundles(path.join(ROOT, 'skills'));
    expect(listed).not.toContain('cortex-migrate');
    expect(listed).not.toContain('cortex-remember');
  });
});
