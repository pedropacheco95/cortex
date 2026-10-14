/**
 * Atomic tests — `store.rules` (schema Part II S4), one per acceptance
 * criterion.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { storeInit } from '../../../src/store/init.js';
import { loadStore } from '../../../src/store/layout.js';
import { alwaysRules, loadRules } from '../../../src/store/rules.js';
import { validateStore } from '../../../src/store/validate.js';
import { tmpRepo, cleanRepos, writeStoreFile, baseFm } from '../../fixtures/store.js';

afterEach(cleanRepos);

const S4_EXAMPLE = `---
about: State your degree of uncertainty in answers
applies_when: "The agent is giving the user a factual claim, diagnosis, explanation, recommendation or estimate"
scope: [user-message, agent-answer, action]
match: { commands: [], paths: [] }
source: user@2026-10-12
origin: session:3f2a9c1e-7b4d-4e8a-9f60-2c1d5e8b7a94
verified: 2026-10-12 (told)
permanence: stable
---
End every substantive answer with an explicit confidence and what would change your mind.
`;

function rule(extra: Record<string, unknown>, body = 'Do the thing.\n'): Record<string, unknown> {
  return { fm: baseFm({ about: 'A rule', applies_when: 'The agent is about to run a command that deploys to production', scope: ['action'], source: 'user@2026-10-12', ...extra }), body };
}

function store(entries: Record<string, { fm: Record<string, unknown>; body: string } | ReturnType<typeof rule>>): string {
  const root = tmpRepo('rules');
  storeInit(root);
  for (const [rel, e] of Object.entries(entries)) writeStoreFile(root, rel, (e as { fm: Record<string, unknown> }).fm, (e as { body: string }).body);
  return root;
}

const findings = (root: string, check: string) => validateStore(root, '2026-10-14').findings.filter((f) => f.check === check);

describe('store.rules', () => {
  it('a well-formed rule loads with its fields and text', () => {
    const root = tmpRepo('s4');
    storeInit(root);
    fs.writeFileSync(path.join(root, 'cortex/world/rules/state-your-uncertainty.md'), S4_EXAMPLE);
    const [r] = loadRules(loadStore(root));
    expect(r!.scope).toEqual(['user-message', 'agent-answer', 'action']);
    expect(r!.text.startsWith('End every substantive answer')).toBe(true);
    expect(validateStore(root, '2026-10-14').findings).toEqual([]);
  });

  it('missing applies_when is an error', () => {
    const r = rule({});
    delete (r['fm'] as Record<string, unknown>)['applies_when'];
    const root = store({ 'world/rules/deploys.md': r });
    const hit = findings(root, 'check.rule')[0];
    expect(hit).toMatchObject({ level: 'error', path: 'world/rules/deploys.md' });
  });

  it('an unknown scope value is an error', () => {
    const root = store({ 'world/rules/deploys.md': rule({ scope: ['prompt'] }) });
    const hit = findings(root, 'check.rule')[0];
    expect(hit?.level).toBe('error');
    expect(hit?.message).toContain('prompt');
  });

  it('a bad command regex is an error', () => {
    const root = store({ 'world/rules/deploys.md': rule({ match: { commands: ['git push (--force'] } }) });
    expect(findings(root, 'check.rule')[0]?.level).toBe('error');
  });

  it('a topic-style description is linted', () => {
    const root = store({ 'world/rules/deploys.md': rule({ applies_when: 'Anything about deployments' }) });
    const hit = findings(root, 'check.applies-when')[0];
    expect(hit?.level).toBe('warning');
    expect(hit?.message).toMatch(/does not start with an actor or a condition/);
    expect(hit?.message).toMatch(/topic phrasing "about"/);
  });

  it('a situation-style description passes the lint', () => {
    const root = store({ 'world/rules/deploys.md': rule({ applies_when: 'The agent is about to run a command that deploys to production' }) });
    expect(findings(root, 'check.applies-when')).toEqual([]);
  });

  it('always rules are listed for the map', () => {
    const root = store({
      'world/rules/never-push-main.md': rule({ applies_when: 'always' }, 'Never push to main.\n'),
      'world/rules/deploys.md': rule({}),
    });
    const hard = alwaysRules(loadStore(root));
    expect(hard.map((r) => r.path)).toEqual(['world/rules/never-push-main.md']);
    expect(hard[0]!.text).toBe('Never push to main.');
  });
});
