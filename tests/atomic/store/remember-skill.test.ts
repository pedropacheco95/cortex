/**
 * Atomic tests — `store.remember-skill`, one per acceptance criterion. The
 * skill is agentic; these pin its text (order, readback, origin, rules).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SKILL = path.join(ROOT, 'skills', 'cortex-remember', 'SKILL.md');
const MIRROR = path.join(ROOT, '.claude', 'skills', 'cortex-remember', 'SKILL.md');
const text = fs.readFileSync(SKILL, 'utf8');

describe('store.remember-skill', () => {
  it('exists and is mirrored byte for byte', () => {
    expect(fs.readFileSync(MIRROR, 'utf8')).toBe(text);
  });

  it('fits the skill-listing budget', () => {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'measure-skill-descriptions.mjs')], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/^cortex-remember\s+B\b/m);
    expect(out).toContain('OK    all');
  });

  it('carries the placement procedure in order', () => {
    const steps = ['Search first', 'Append to the existing subject file', 'kind → folder table', 'tie-breaker', 'Set `verified` with a method, and `origin`', '`until:', '`cortex store validate`', 'readback'];
    const body = text.slice(text.indexOf('## Steps, in order'), text.indexOf('## Rules from the user'));
    const at = steps.map((s) => body.indexOf(s));
    expect(at.every((i) => i >= 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('specifies the readback format exactly', () => {
    expect(text).toContain('`Filing: <fact> → <path> (origin: <origin>)`');
    expect(text).toContain('`Updated: <fact> → <path> (origin: <origin>)`');
  });

  it('takes the origin from the session, with the stated fallbacks', () => {
    expect(text).toContain('`origin: session:<id>`');
    expect(text).toContain('$CLAUDE_CODE_SESSION_ID');
    expect(text).toContain("add your value to that file's `origin` list");
    expect(text).toContain('`origin: person:user@<today>`');
    expect(text).toContain('`origin: source:<its history/sources/ digest path>`');
    expect(text).toContain('Never write a transcript path or a URL as an origin');
  });

  it('directs user rules to world/rules with a situation, source and scope', () => {
    const rules = text.slice(text.indexOf('## Rules from the user'));
    expect(rules).toContain('`world/rules/<rule>.md`');
    expect(rules).toContain('`applies_when`: one sentence describing the situation');
    expect(rules).toContain('`source: user@<today>`');
    expect(rules).toContain('`scope`:');
  });
});
