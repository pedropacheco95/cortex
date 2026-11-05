/**
 * Atomic tests — `specflow.review-skill`, one per acceptance criterion. The
 * skill is agentic; these pin its text.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { listSkillBundles } from '../../../src/cli/scaffold.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SKILL = path.join(ROOT, 'skills', 'specflow-review', 'SKILL.md');
const MIRROR = path.join(ROOT, '.claude', 'skills', 'specflow-review', 'SKILL.md');
const text = fs.existsSync(SKILL) ? fs.readFileSync(SKILL, 'utf8') : '';
const lines = text.split('\n');
const trimmed = lines.map((l) => l.trim());

describe('specflow.review-skill', () => {
  it('The bundle exists, is mirrored and fits the budget', () => {
    expect(text).not.toBe('');
    expect(fs.readFileSync(MIRROR, 'utf8')).toBe(text);
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'measure-skill-descriptions.mjs')], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/^specflow-review\s+B\b/m);
    expect(out).toContain('OK    all');
    for (const p of ['review the spec', 'review this diff', 'here is the feedback']) expect(lines[2]).toContain(`"${p}"`);
  });

  it('3.x init and sync never install it', () => {
    expect(listSkillBundles(path.join(ROOT, 'skills'))).not.toContain('specflow-review');
  });

  it('The description and the Iron Law are exact', () => {
    expect(lines[2]).toBe(`description: 'Fresh-agent review of a spec against the code (before code, or weekly at rest) or of a diff against its criteria (on request). Read-only; findings only. "review the spec", "review this diff", "here is the feedback".'`);
    expect(text).toContain('NO FINDING WITHOUT A CRITERION OR SECTION, A LOCATION AND A PROPOSED CHANGE');
    expect(text).toContain('Violating the letter of this law is violating the spirit. If you find yourself constructing a reading under which an observation is useful without being specific, that construction is the violation.');
  });

  it('A fork is not a goldfish', () => {
    expect(text).toContain('never the conversation that led here');
    expect(text).toContain('A fork of the current session, or the current session reviewing its own work, does not count.');
  });

  it('Every goldfish is awaited before merging', () => {
    const sentence = 'Spawn every goldfish in the foreground, or wait for every one to finish, before you merge. A session that ends with a goldfish still running loses its work.';
    expect(trimmed).toContain(sentence);
    expect(text.indexOf(sentence)).toBeLessThan(text.indexOf('Merge the findings'));
  });

  it('Concern × lens splitting is kept', () => {
    expect(text).toContain('For each concern × lens, spawn one goldfish');
    for (const l of ['**Comprehension.**', '**Antagonistic.**', '**Readiness.**', '**Codebase details.**']) expect(text).toContain(l);
    expect(text).toContain('the mode, the input paths or ids of that concern, the repository root, the lens, and the finding format');
  });

  it('Diff mode is optional', () => {
    expect(text).toContain('**Spec mode**');
    expect(text).toContain('**Diff mode**, on request and never required.');
    expect(text).not.toContain('after each wave');
    expect(text).not.toContain('per wave');
  });

  it('The finding format is exact', () => {
    expect(lines).toContain('[<criterion id> | spec:<file>#<rule or section> | diff:<file>] <blocker | should | nit>');
    expect(lines).toContain('<path>:<line> — <what is wrong, one sentence> — proposed: <the change, one sentence>');
    expect(text).toContain('A finding about a rule or section rather than one criterion carries `spec:<file>#<rule or section>`. In diff mode, a finding with no criterion id is allowed only for a silent change');
  });

  it("Resolving follows the owner's lines", () => {
    const body = text.slice(text.indexOf('## Resolving'), text.indexOf('## Lenses'));
    expect(body).toContain('In an interactive session the person decides.');
    expect(body).toContain("When the run was told the user can't answer, the main session resolves each finding itself");
    expect(body).toContain('a conflict with a recorded owner decision stops the run');
    expect(text).not.toContain('nobody can answer');
  });

  it("Spec mode's inputs and the concern split are stated", () => {
    expect(text).toContain('**Spec mode**, before code and at rest. Input: the spec file path(s) and the repository root.');
    expect(text).toContain('a spec spanning more than one area is split into concerns by area');
  });

  it('The merge is stated', () => {
    expect(text).toContain('Merge the findings: drop duplicates, keep the strongest severity, sort blockers first.');
  });

  it('The lenses are defined', () => {
    expect(lines.find((l) => l.startsWith('- **Readiness.**'))).toContain('is it implementable in its wave alone');
    expect(lines.find((l) => l.startsWith('- **Antagonistic.**'))).toContain("every constant's value against every place");
  });

  it("Diff mode's questions are stated", () => {
    const body = text.slice(text.indexOf("## Diff mode's questions"), text.indexOf('## Finding format'));
    for (const n of ['covered', 'not covered', 'contradicted', 'silent change']) expect(body).toContain(n);
  });

  it('A scheduled run hands its findings to its caller', () => {
    expect(text).toContain('A scheduled run hands the list to its caller and resolves nothing.');
  });

  it('The rationalizations are kept', () => {
    const body = text.slice(text.indexOf('## Rationalizations'));
    for (const t of ['I wrote this spec, I can review it myself.', 'The code looks like it does this; no need to check.', 'Minor wording, not worth a finding.', 'The diff is large; I will review the main files.']) expect(body).toContain(t);
  });

  it('A goldfish never edits', () => {
    expect(text).toContain('The goldfish reads; it never edits a spec, a test or code.');
  });

  it('A received review is verified before it is applied', () => {
    expect(trimmed).toContain('Verify each point of a review you received against the spec, a rule or the code before applying it, and reject what does not hold, with the reason.');
    expect(text).toContain('A disagreement is settled by the spec, a rule or a command anyone can run, never by who said it');
  });
});
