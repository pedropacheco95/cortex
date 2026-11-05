/**
 * Atomic tests — `specflow.store-v4-awareness`, one per acceptance
 * criterion: the 13 governed skills carry the shared dual-store paragraph
 * verbatim, mirrored; the held skills do not.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { specsRoot } from '../../../src/paths.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SPEC = fs.readFileSync(path.join(specsRoot(ROOT), 'specflow/store-v4-awareness.spec.md'), 'utf8');
const PARAGRAPH = /\n   > (\*\*Which store \(Cortex 4\.0 transition\)\.\*\*[^\n]+)\n/.exec(SPEC)![1]!;

const GOVERNED = [
  'specflow-plan', 'specflow-brainstorm', 'specflow-new-project', 'specflow-viewer', 'specflow-entry',
  'specflow-develop', 'specflow-tests', 'specflow-onboard-codebase', 'specflow-deep-onboard', 'specflow-spec-editor',
  'specflow-receive-review', 'specflow-request-review', 'verification-before-completion',
  'specflow-bugs', 'specflow-intent-reconcile', 'specflow-ingest', 'specflow-lint',
];
const WRITERS: Record<string, string[]> = {
  'specflow-bugs': ['`cortex/code/<area>/<slug>.md`', '`status: open`', '`cortex/history/incidents/', 'no `B-NNN` id'],
  'specflow-intent-reconcile': ['`cortex/history/changes/', '`kind: change-request`', '`- <YYYY-MM-DD>: <from> → <to>, <reason>`'],
  'specflow-ingest': ['`cortex-remember`', 'source-digest'],
  'specflow-lint': ['`cortex validate`'],
  'specflow-tests': ['`cortex/now/verification.md`'],
  'specflow-develop': ['now/proposals.md`'],
  'specflow-onboard-codebase': ['now/proposals.md`', 'never in `cortex/world/rules/`'],
  'specflow-deep-onboard': ['`cortex/now/deep-onboard-report.md`', '`$TMPDIR/specflow-deep-onboard/`', 'now/proposals.md`'],
  'specflow-spec-editor': ['`source: <approver>@<date>`'],
  'specflow-entry': ['specflow-bugs'],
};
const WRITE_HEAD = '**Writing to the 4.0 store.**';
const writePara = (s: string): string => {
  const t = body(s);
  const i = t.indexOf(WRITE_HEAD);
  const end = t.indexOf('\n\n', i);
  return t.slice(i, end < 0 ? undefined : end);
};
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

  it('every writing skill carries one gated write paragraph, after the Rule 1 paragraph', () => {
    for (const s of Object.keys(WRITERS)) {
      const t = body(s);
      expect(t.split(WRITE_HEAD).length - 1, s).toBe(1);
      expect(t.indexOf(WRITE_HEAD), s).toBeGreaterThan(t.indexOf(PARAGRAPH));
      expect(writePara(s), s).toContain('migration.accepted');
    }
  });

  it('the write paragraphs name the decided homes', () => {
    for (const [s, phrases] of Object.entries(WRITERS)) for (const p of phrases) expect(writePara(s), `${s}: ${p}`).toContain(p);
  });

  it('every writing skill is mirrored byte for byte', () => {
    for (const s of Object.keys(WRITERS)) expect(fs.readFileSync(path.join(ROOT, '.claude/skills', s, 'SKILL.md'), 'utf8'), s).toBe(body(s));
  });
});
