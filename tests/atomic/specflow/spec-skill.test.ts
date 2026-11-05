/**
 * Atomic tests — `specflow.spec-skill`, one per acceptance criterion. The skill
 * is agentic; these pin its text.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { listSkillBundles } from '../../../src/cli/scaffold.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SKILL = path.join(ROOT, 'skills', 'specflow-spec', 'SKILL.md');
const MIRROR = path.join(ROOT, '.claude', 'skills', 'specflow-spec', 'SKILL.md');
const text = fs.existsSync(SKILL) ? fs.readFileSync(SKILL, 'utf8') : '';
const lines = text.split('\n');

function inOrder(body: string, marks: string[]): void {
  const at = marks.map((m) => body.indexOf(m));
  expect(at.every((i) => i >= 0), JSON.stringify(at)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
}

describe('specflow.spec-skill', () => {
  it('The bundle exists, is mirrored and fits the budget', () => {
    expect(text).not.toBe('');
    expect(fs.readFileSync(MIRROR, 'utf8')).toBe(text);
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'measure-skill-descriptions.mjs')], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/^specflow-spec\s+B\b/m);
    expect(out).toContain('OK    all');
    for (const p of ['spec this', 'brainstorm', 'plan this']) expect(lines[2]).toContain(`"${p}"`);
  });

  it('3.x init and sync never install it', () => {
    expect(listSkillBundles(path.join(ROOT, 'skills'))).not.toContain('specflow-spec');
  });

  it('The description and the Iron Law are exact', () => {
    expect(lines[2]).toBe(`description: 'Turn a request that no criterion covers, or that touches more than one spec, into a spec: invariant criteria, constants, a named test per criterion, waves. Code-free. "spec this", "brainstorm", "plan this".'`);
    expect(text).toContain('NO CRITERION WITHOUT A NAMED TEST, AND NO CODE IN THIS SESSION');
    expect(text).toContain('Violating the letter of this law is violating the spirit. If you find yourself constructing a reading under which this does not apply to your case, that construction is the violation.');
  });

  it('The steps appear in order', () => {
    const body = text.slice(text.indexOf('## Steps, in order'), text.indexOf('## Owner decisions'));
    inOrder(body, ['Check for a conflict', '*Today* section with file paths', 'invariants', 'Name a test', '`not read in the code`', 'Cut the work into waves', 'Record open questions', 'Spec files only', '`specflow-review`']);
  });

  it('Both owner sentences are verbatim', () => {
    expect(lines).toContain(`If the request contradicts a rule, a 'Not this spec' line or a recorded decision the owner made, do not build it: write the spec with the conflict as an open question and stop.`);
    expect(lines).toContain(`If you were told the user can't answer during this run, don't wait: decide, write the decision and its reason under Open questions in the spec, and continue. This never applies to a conflict with a recorded owner decision; that always stops.`);
  });

  it('A promise counts as an owner decision', () => {
    const step = lines.find((l) => l.startsWith('1. **Check for a conflict.**'))!;
    for (const n of ['specflow/promises/', 'cortex/world/decisions/', '`Not this spec`']) expect(step).toContain(n);
  });

  it('Constants follow the folder rule', () => {
    const body = text.slice(text.indexOf('## Where a constant lives'), text.indexOf('## Starting from a spec request'));
    for (const n of ['`constants.md`', 'lowest folder', 'every spec using it', 'its ancestors', '`const:NAME`']) expect(body).toContain(n);
    expect(text).not.toContain('### Constants');
  });

  it('The code-free line holds', () => {
    expect(text).toContain('no plan file, no code and no test code');
    for (const n of ['fresh implementer', 'per-wave', 'diff review']) expect(text).not.toContain(n);
  });

  it('A criterion amendment commits alone', () => {
    const body = text.slice(text.indexOf('## Amending a criterion'), text.indexOf('## Spec shape'));
    for (const n of ['commit it alone with its `Specflow-Amends:` trailer', 'Never edit a test', 'rule (c)', 'a warning', 'same branch', 'tagged test']) expect(body).toContain(n);
  });

  it('The unverified mark is left to INDEX', () => {
    expect(text).toContain('`not read in the code`');
    expect(text).toContain('`specflow/INDEX.md` computes the `unverified` mark');
    expect(text).not.toContain('(unverified)');
  });

  it('A spec request is consumed only by a written spec', () => {
    const body = text.slice(text.indexOf('## Starting from a spec request'), text.indexOf('## Amending a criterion'));
    expect(body).toContain('Once the spec is committed, remove the item');
    expect(body).toContain('An ask refused for a conflict keeps its item');
  });

  it('The old paths are gone', () => {
    expect(text).toContain('specflow/INDEX.md');
    expect(text).toContain('specflow/impl/');
    expect(text).not.toMatch(/(?<!specflow\/)specs\//);
    expect(text).not.toContain('.specflow/');
  });

  it('The spec shape is shown', () => {
    const body = text.slice(text.indexOf('## Spec shape'), text.indexOf('## After review'));
    inOrder(body, ['serves:', '### Rules', '### Not this spec', '### Today', '### Acceptance Criteria', 'test:', '### Waves', '### Open questions']);
  });

  it('A conflict is committed but not reviewed', () => {
    const body = text.slice(text.indexOf('## Owner decisions'), text.indexOf('## Where a constant lives'));
    expect(body).toContain('The spec holding the conflict is committed by step 8, with the conflict under *Open questions*; `specflow-review` does not follow and no wave starts.');
  });

  it('The rationalizations are kept', () => {
    const body = text.slice(text.indexOf('## Rationalizations'));
    for (const t of ['The change is small, I can just write the code.', 'The value is obvious, I will write it in each criterion.', 'I know what the code does, no need to read it.', 'I will name the tests later.']) expect(body).toContain(t);
    expect(lines.find((l) => l.includes('The value is obvious'))).toContain('`constants.md`');
  });

  it('Every quoted ask is accounted for', () => {
    const sentence = 'Every ask quoted in the request maps to a criterion or is listed under Open questions.';
    expect(lines.map((l) => l.trim())).toContain(sentence);
    const before = text.slice(0, text.indexOf(sentence));
    expect(before).toContain('including the ask of a spec request');
    expect(text.indexOf(sentence)).toBeLessThan(text.indexOf('**Commit the spec alone.**'));
  });

  it('A conflict spec holds no criteria', () => {
    const body = text.slice(text.indexOf('## Owner decisions'), text.indexOf('## Where a constant lives'));
    expect(body).toContain('It holds *Today* and the open question, with no criteria and no waves.');
  });

  it('New criteria join the spec that covers the behaviour', () => {
    const body = text.slice(text.indexOf('## Spec shape'), text.indexOf('## After review'));
    expect(body).toContain('New criteria go in the spec that already covers the behaviour, and an `implemented` spec drops to `implementing`.');
  });
});
