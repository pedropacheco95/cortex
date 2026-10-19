/**
 * Atomic tests — `specflow.store-v4-awareness`, one per acceptance
 * criterion: the 13 governed skills carry the shared dual-store paragraph
 * verbatim, mirrored; the held skills do not.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SPEC = fs.readFileSync(path.join(ROOT, '.specflow/specs/specflow/store-v4-awareness.spec.md'), 'utf8');
const PARAGRAPH = /\n   > (\*\*Which store \(Cortex 4\.0 transition\)\.\*\*[^\n]+)\n/.exec(SPEC)![1]!;

const GOVERNED = [
  'specflow-plan', 'specflow-brainstorm', 'specflow-new-project', 'specflow-viewer', 'specflow-entry',
  'specflow-develop', 'specflow-tests', 'specflow-onboard-codebase', 'specflow-deep-onboard', 'specflow-spec-editor',
  'specflow-receive-review', 'specflow-request-review', 'verification-before-completion',
];
const HELD = ['specflow-bugs', 'specflow-intent-reconcile', 'specflow-ingest', 'specflow-lint'];
const body = (s: string) => fs.readFileSync(path.join(ROOT, 'skills', s, 'SKILL.md'), 'utf8');

describe('specflow.store-v4-awareness', () => {
  it('the spec paragraph names the 4.0 reads and the write limits', () => {
    for (const p of ['cortex/MAP.md', 'cortex/world/rules/', 'match.paths', 'cortex/world/terms/', 'cortex/code/<area>/', 'cortex store validate', 'migration.accepted', 'cortex-remember']) expect(PARAGRAPH).toContain(p);
  });

  it('every governed skill carries the paragraph verbatim, once', () => {
    for (const s of GOVERNED) expect(body(s).split(PARAGRAPH).length - 1, s).toBe(1);
  });

  it('every governed skill is mirrored byte for byte', () => {
    for (const s of GOVERNED) expect(fs.readFileSync(path.join(ROOT, '.claude/skills', s, 'SKILL.md'), 'utf8'), s).toBe(body(s));
  });

  it('the held skills are untouched', () => {
    for (const s of HELD) expect(body(s), s).not.toContain('Which store (Cortex 4.0 transition)');
  });
});
