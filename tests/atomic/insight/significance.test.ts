/**
 * Atomic tests for the Core structural significance filter (spec
 * insight.refresh-loops Rule 2; src/insight/significance.ts): pure,
 * deterministic, no fs / no git / no LLM.
 */
import { describe, it, expect } from 'vitest';
import { classifyChange, normalizeForCompare, splitImports } from '../../../src/insight/significance.js';

const TS = 'typescript';

describe('classifyChange: deterministic no-op detectors (spec Rule 2)', () => {
  it('byte-identical content → identical', () => {
    const src = 'export function f(a: number) {\n  return a + 1;\n}\n';
    expect(classifyChange(src, src, TS).verdict).toBe('identical');
  });

  it('whitespace-reformatting only → cosmetic, never L2/L3', () => {
    const oldSrc = 'export function f(a: number) {\n  return a + 1;\n}\n';
    const newSrc = 'export function f(a: number)\n{\n    return a + 1;\n}\n';
    const r = classifyChange(oldSrc, newSrc, TS);
    expect(r.verdict).toBe('cosmetic');
  });

  it('comment-only change → cosmetic', () => {
    const oldSrc = '// the old comment\nexport const x = 1;\n';
    const newSrc = '// a brand new comment saying much more\nexport const x = 1;\n/* trailing block */\n';
    expect(classifyChange(oldSrc, newSrc, TS).verdict).toBe('cosmetic');
  });

  it('import-reordering only → cosmetic', () => {
    const oldSrc = "import { b } from './b.js';\nimport { a } from './a.js';\nexport const x = a + b;\n";
    const newSrc = "import { a } from './a.js';\nimport { b } from './b.js';\nexport const x = a + b;\n";
    const r = classifyChange(oldSrc, newSrc, TS);
    expect(r.verdict).toBe('cosmetic');
    expect(r.reason).toContain('import-reordering');
  });

  it('a URL inside a string is not eaten as a line comment', () => {
    const oldSrc = "export const u = 'https://example.com/a';\n";
    const newSrc = "export const u = 'https://example.com/b';\n";
    expect(classifyChange(oldSrc, newSrc, TS).verdict).not.toBe('cosmetic');
  });
});

describe('classifyChange: real vs significant heuristics', () => {
  it('a small genuine change (renamed local, tweaked line) → real (L2 only)', () => {
    const body = Array.from({ length: 30 }, (_, i) => `const v${i} = ${i};`).join('\n');
    const oldSrc = `${body}\nfunction helper() { return 1; }\n`;
    const newSrc = `${body}\nfunction helper() { return 2; }\n`;
    const r = classifyChange(oldSrc, newSrc, TS);
    expect(r.verdict).toBe('real');
  });

  it('a new exported function → significant-candidate (L3 due)', () => {
    const body = Array.from({ length: 30 }, (_, i) => `const v${i} = ${i};`).join('\n');
    const oldSrc = `${body}\nexport function existing() { return 1; }\n`;
    const newSrc = `${body}\nexport function existing() { return 1; }\nexport function brandNew() { return 2; }\n`;
    const r = classifyChange(oldSrc, newSrc, TS);
    expect(r.verdict).toBe('significant-candidate');
    expect(r.exportsAdded).toEqual(['brandNew']);
  });

  it('a removed export → significant-candidate', () => {
    const body = Array.from({ length: 30 }, (_, i) => `const v${i} = ${i};`).join('\n');
    const oldSrc = `${body}\nexport const gone = 1;\nexport const kept = 2;\n`;
    const newSrc = `${body}\nexport const kept = 2;\n`;
    const r = classifyChange(oldSrc, newSrc, TS);
    expect(r.verdict).toBe('significant-candidate');
    expect(r.exportsRemoved).toEqual(['gone']);
  });

  it('a large size delta without export changes → significant-candidate', () => {
    const oldSrc = 'const a = 1;\nconst b = 2;\n';
    const newSrc = oldSrc + Array.from({ length: 40 }, (_, i) => `const n${i} = ${i};`).join('\n') + '\n';
    expect(classifyChange(oldSrc, newSrc, TS).verdict).toBe('significant-candidate');
  });

  it('a mid-band rewrite (no export change, moderate churn) → uncertain (Haiku triage)', () => {
    const oldLines = Array.from({ length: 20 }, (_, i) => `const v${i} = compute(${i});`);
    const newLines = [...oldLines];
    for (let i = 0; i < 5; i++) newLines[i] = `const v${i} = recompute(${i}, extra);`;
    const r = classifyChange(oldLines.join('\n') + '\n', newLines.join('\n') + '\n', TS);
    expect(r.verdict).toBe('uncertain');
  });

  it('is deterministic — same inputs, byte-identical result objects', () => {
    const oldSrc = 'export const a = 1;\nconst b = 2;\n';
    const newSrc = 'export const a = 1;\nconst b = 3;\nconst c = 4;\n';
    expect(JSON.stringify(classifyChange(oldSrc, newSrc, TS))).toBe(JSON.stringify(classifyChange(oldSrc, newSrc, TS)));
  });
});

describe('helpers', () => {
  it('normalizeForCompare strips python hash comments', () => {
    expect(normalizeForCompare('x = 1  # note\n', 'python')).toBe(normalizeForCompare('x = 1\n', 'python'));
  });

  it('splitImports separates and sorts import lines', () => {
    const src = "import { z } from './z.js';\nconst body = 1;\nimport { a } from './a.js';\n";
    const { imports, rest } = splitImports(src, TS);
    expect(imports).toEqual(["import { a } from './a.js';", "import { z } from './z.js';"]);
    expect(rest).toEqual(['const body = 1;']);
  });
});
