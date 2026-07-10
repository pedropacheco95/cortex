/**
 * Atomic tests — the shared S-id allocator (schema §4.5 single S-namespace;
 * pulse.distil Rule 4 / loops.skill-suggest Rule 4). The counter file
 * `pulse/state/suggestion-counter` is a plain integer that persists like
 * dismissed.md: monotonic, never reused, missing file starts at 0.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import {
  allocateSuggestionIds,
  readSuggestionCounter,
  SUGGESTION_COUNTER_FILE,
} from '../../../src/pulse/suggestion-ids.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`suggestion-ids-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function counterPath(root: string): string {
  return path.join(root, '.cortex', 'pulse', 'state', SUGGESTION_COUNTER_FILE);
}

describe('Shared S-id allocator (schema §4.5)', () => {
  it('a missing counter file starts at 0: first allocation yields S-001…', () => {
    const root = tmp('fresh');
    expect(readSuggestionCounter(root)).toBe(0);
    expect(allocateSuggestionIds(root, 2)).toEqual(['S-001', 'S-002']);
  });

  it('persists the advanced counter as a plain integer', () => {
    const root = tmp('persist');
    allocateSuggestionIds(root, 3);
    expect(fs.readFileSync(counterPath(root), 'utf-8').trim()).toBe('3');
    expect(readSuggestionCounter(root)).toBe(3);
  });

  it('continues from an existing counter value (never reuses an id)', () => {
    const root = tmp('continue');
    fs.mkdirSync(path.dirname(counterPath(root)), { recursive: true });
    fs.writeFileSync(counterPath(root), '7', 'utf-8');
    expect(allocateSuggestionIds(root, 2)).toEqual(['S-008', 'S-009']);
    expect(readSuggestionCounter(root)).toBe(9);
  });

  it('sequential allocations by two different loops never collide', () => {
    const root = tmp('two-loops');
    const distilIds = allocateSuggestionIds(root, 2); // "distil"
    const skillIds = allocateSuggestionIds(root, 2); // "skill-suggest"
    const all = [...distilIds, ...skillIds];
    expect(new Set(all).size).toBe(4);
    expect(skillIds).toEqual(['S-003', 'S-004']);
  });

  it('n <= 0 allocates nothing and leaves the counter untouched', () => {
    const root = tmp('zero');
    expect(allocateSuggestionIds(root, 0)).toEqual([]);
    expect(allocateSuggestionIds(root, -1)).toEqual([]);
    expect(fs.existsSync(counterPath(root))).toBe(false);
  });

  it('a malformed counter file degrades to 0 rather than throwing', () => {
    const root = tmp('malformed');
    fs.mkdirSync(path.dirname(counterPath(root)), { recursive: true });
    fs.writeFileSync(counterPath(root), 'not-a-number', 'utf-8');
    expect(readSuggestionCounter(root)).toBe(0);
    expect(allocateSuggestionIds(root, 1)).toEqual(['S-001']);
  });

  it('ids grow past three digits without wrapping', () => {
    const root = tmp('big');
    fs.mkdirSync(path.dirname(counterPath(root)), { recursive: true });
    fs.writeFileSync(counterPath(root), '999', 'utf-8');
    expect(allocateSuggestionIds(root, 2)).toEqual(['S-1000', 'S-1001']);
  });
});
