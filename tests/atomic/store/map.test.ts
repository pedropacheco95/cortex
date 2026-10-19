/**
 * Atomic tests — `store.map` (schema Part II S8.1–S8.2), one per acceptance
 * criterion.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { storeInit } from '../../../src/store/init.js';
import { loadStore } from '../../../src/store/layout.js';
import { renderMap, TIE_BREAKER } from '../../../src/store/map.js';
import { writeMapAndBlocks } from '../../../src/store/managed-block.js';
import { validateStore } from '../../../src/store/validate.js';
import { tmpRepo, cleanRepos, writeStoreFile, baseFm } from '../../fixtures/store.js';

afterEach(cleanRepos);

function empty(): string {
  const root = tmpRepo('map');
  storeInit(root);
  return root;
}

const rule = (applies_when: string) => baseFm({ about: 'A rule', applies_when, scope: ['action'], source: 'user@2026-10-12' });

describe('store.map', () => {
  it('carries the fixed sections in order, with the tie-breaker word for word', () => {
    const map = renderMap(loadStore(empty()));
    const at = (s: string) => map.indexOf(s);
    expect(at('`code/<area>/`')).toBeGreaterThan(-1);
    expect(at('## Where to look')).toBeGreaterThan(at('`code/<area>/`'));
    expect(at('## Filing a new fact')).toBeGreaterThan(at('## Where to look'));
    expect(at('| The fact is… | Folder |')).toBeGreaterThan(at('## Filing a new fact'));
    expect(at(TIE_BREAKER)).toBeGreaterThan(at('| The fact is… | Folder |'));
    expect(TIE_BREAKER).toBe('The subject is what the fact constrains. If it constrains two, file it under the one the reader would be working in when it bites, and add an alias in the other.');
  });

  it('prints hard rules in full', () => {
    const root = empty();
    writeStoreFile(root, 'world/rules/never-push-main.md', rule('always'), 'Never push to main.\n');
    const map = renderMap(loadStore(root));
    expect(map.slice(map.indexOf('## Hard rules'))).toContain('Never push to main.');
  });

  it('does not print rules that do not always apply', () => {
    const root = empty();
    writeStoreFile(root, 'world/rules/deploys.md', rule('The agent is about to run a command that deploys to production'), 'Ask before deploying.\n');
    expect(renderMap(loadStore(root))).not.toContain('Ask before deploying.');
  });

  it('generates the cast and the terms', () => {
    const root = empty();
    writeStoreFile(root, 'world/people/rui.md', baseFm({ about: 'Ops lead at AIF' }));
    writeStoreFile(root, 'world/terms/fare.md', baseFm({ about: 'What a fare is', aliases: ['ticket price'] }));
    const map = renderMap(loadStore(root));
    expect(map).toContain('- rui: Ops lead at AIF');
    const terms = map.split('\n').find((l) => l.startsWith('Terms: '))!;
    expect(terms).toContain('fare');
    expect(terms).toContain('ticket price');
  });

  it('omits empty generated sections', () => {
    const map = renderMap(loadStore(empty()));
    expect(map).not.toContain('## Cast');
    expect(map).not.toMatch(/^Terms: /m);
    expect(map).not.toContain('## Hard rules');
  });

  it('checks the size', () => {
    const root = empty();
    // The empty map's length plus enough hard-rule lines to reach 75.
    const base = renderMap(loadStore(root)).replace(/\n$/, '').split('\n').length;
    const extra = 75 - base - 2; // "## Hard rules" heading and its blank line, plus the separator before it
    writeStoreFile(root, 'world/rules/long.md', rule('always'), Array.from({ length: extra - 1 }, (_, i) => `Line ${i + 1}.`).join('\n') + '\n');
    expect(renderMap(loadStore(root)).replace(/\n$/, '').split('\n')).toHaveLength(75);
    const hit = validateStore(root, '2026-10-14').findings.find((f) => f.check === 'check.map-size');
    expect(hit?.level).toBe('warning');
    expect(hit?.message).toContain('75 lines (limit 60)');
  });

  it('checks the staleness of MAP', () => {
    const root = empty();
    writeMapAndBlocks(root);
    writeStoreFile(root, 'world/terms/route.md', baseFm({ about: 'What a route is' }));
    const hit = validateStore(root, '2026-10-14').findings.find((f) => f.check === 'check.map-fresh');
    expect(hit?.level).toBe('warning');
    expect(hit?.message).toContain('out of date');
  });

  it('is deterministic', () => {
    const root = empty();
    writeStoreFile(root, 'world/people/rui.md', baseFm({ about: 'Ops lead at AIF' }));
    writeStoreFile(root, 'world/terms/fare.md', baseFm({ about: 'What a fare is', aliases: ['ticket price'] }));
    expect(renderMap(loadStore(root))).toBe(renderMap(loadStore(root)));
  });
});
