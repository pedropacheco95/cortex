/**
 * Atomic tests — pulse.review-cli (spec Acceptance Criteria + Rule 7 malformed
 * handling). Each AC is a labelled describe whose title matches the spec
 * heading. Every test runs in a sandboxed tmp dir and drives `pulseCli`
 * directly with an injected `root` (the testability seam). console.log/error
 * are spied so exit codes come from the returned number and output from the
 * captured calls.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import { pulseCli } from '../../../src/pulse/review.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`pulse-atomic-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

let out: string[] = [];
let err: string[] = [];
beforeEach(() => {
  out = [];
  err = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    out.push(a.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    err.push(a.join(' '));
  });
});
const stdout = (): string => out.join('\n');
const stderr = (): string => err.join('\n');

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Write a minimal .cortex/pulse project with the given artefact contents. */
function makeProject(
  label: string,
  files: {
    suggestions?: string;
    dismissed?: string;
    config?: Record<string, unknown>;
    extra?: Record<string, string>;
  },
): string {
  const root = tmp(label);
  const pulseDir = path.join(root, '.cortex', 'pulse');
  fs.mkdirSync(pulseDir, { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'compass'), { recursive: true });
  if (files.suggestions !== undefined) {
    fs.writeFileSync(path.join(pulseDir, 'suggestions.md'), files.suggestions, 'utf-8');
  }
  if (files.dismissed !== undefined) {
    fs.writeFileSync(path.join(pulseDir, 'dismissed.md'), files.dismissed, 'utf-8');
  }
  fs.writeFileSync(
    path.join(root, '.cortex', 'cortex.config.json'),
    JSON.stringify(files.config ?? { schemaVersion: '1.0' }, null, 2),
    'utf-8',
  );
  for (const [rel, content] of Object.entries(files.extra ?? {})) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
  return root;
}

const SUGGESTIONS_HEADER = `---
kind: pulse-suggestions
generated: 2026-07-01T00:00:00Z
loop: cortex-loop-skill-suggest
---

# Suggestions

`;

function entry(id: string, title: string, target: string, block: string, status?: string): string {
  const statusLine = status ? `**Status:** ${status}\n` : '';
  return `## ${id}: ${title}

**Target:** ${target}
${statusLine}**Proposed addition:**

\`\`\`
${block}
\`\`\`

`;
}

// ---------------------------------------------------------------------------

describe('pulse-list shows pending only', () => {
  it('prints S-001 (pending) with title/target/block, and neither S-002 (accepted) nor S-003 (dismissed)', async () => {
    const root = makeProject('list-pending', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-001', 'Add pnpm note', '.cortex/compass/preferences.md', 'Always use pnpm.') +
        entry('S-002', 'Accepted one', '.cortex/compass/environment.md', 'Already applied.', 'accepted') +
        entry('S-003', 'Dismissed one', '.cortex/compass/decisions.md', 'Snoozed for now.'),
      dismissed: `---
kind: pulse-dismissed
generated: 2026-07-01T00:00:00Z
loop: cortex-init
---

## S-003

**Dismissed:** ${isoDaysFromNow(0)}
**Expires:** ${isoDaysFromNow(1)}
`,
    });

    const code = await pulseCli('pulse-list', [], root);
    expect(code).toBe(0);
    const text = stdout();
    expect(text).toContain('S-001');
    expect(text).toContain('Add pnpm note');
    expect(text).toContain('.cortex/compass/preferences.md');
    expect(text).toContain('Always use pnpm.');
    expect(text).not.toContain('S-002');
    expect(text).not.toContain('S-003');
  });
});

describe('Expired dismissal resurfaces', () => {
  it('S-003 appears as pending once its dismissal Expires is in the past', async () => {
    const root = makeProject('list-expired', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-003', 'Dismissed one', '.cortex/compass/decisions.md', 'Resurfaced text.'),
      dismissed: `---
kind: pulse-dismissed
generated: 2026-07-01T00:00:00Z
loop: cortex-init
---

## S-003

**Dismissed:** ${isoDaysFromNow(-30)}
**Expires:** ${isoDaysFromNow(-1)}
`,
    });

    const code = await pulseCli('pulse-list', [], root);
    expect(code).toBe(0);
    expect(stdout()).toContain('S-003');
    expect(stdout()).toContain('Resurfaced text.');
  });
});

describe('Accept applies the block verbatim', () => {
  it('appends the block after a blank line, annotates Status: accepted, and changes no other file', async () => {
    const root = makeProject('accept-verbatim', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-001', 'Chrome profile', '.cortex/compass/environment.md', 'Chrome profile: profile-X'),
      extra: { '.cortex/compass/environment.md': '# Environment\n\nOperational pointers only.\n' },
    });

    const before = snapshotTree(root);
    const code = await pulseCli('pulse-accept', ['S-001'], root);
    expect(code).toBe(0);

    const envPath = path.join(root, '.cortex', 'compass', 'environment.md');
    const env = fs.readFileSync(envPath, 'utf-8');
    expect(env.endsWith('Chrome profile: profile-X')).toBe(true);
    // Separated by exactly one blank line from the prior content.
    expect(env).toContain('Operational pointers only.\n\nChrome profile: profile-X');

    const suggestions = fs.readFileSync(
      path.join(root, '.cortex', 'pulse', 'suggestions.md'),
      'utf-8',
    );
    expect(suggestions).toContain('**Status:** accepted');

    // No other file changed (only environment.md and suggestions.md may move).
    const after = snapshotTree(root);
    const allowed = new Set([
      path.join('.cortex', 'compass', 'environment.md'),
      path.join('.cortex', 'pulse', 'suggestions.md'),
    ]);
    const keys = new Set([...before.keys(), ...after.keys()]);
    for (const key of keys) {
      if (allowed.has(key)) continue;
      expect(after.get(key)).toBe(before.get(key));
    }
  });
});

describe('Non-compass target refused', () => {
  it('exits 1 naming the path and changes nothing when the target is outside .cortex/compass/', async () => {
    const root = makeProject('refuse-target', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-001', 'Bad target', 'src/schema/validate.ts', 'malicious content'),
      extra: { 'src/schema/validate.ts': 'export const x = 1;\n' },
    });

    const before = snapshotTree(root);
    const code = await pulseCli('pulse-accept', ['S-001'], root);
    expect(code).toBe(1);
    expect(stderr()).toContain('src/schema/validate.ts');
    expect(snapshotTree(root)).toEqual(before);
  });

  it('refuses a `..` escape out of .cortex/compass/', async () => {
    const root = makeProject('refuse-escape', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-002', 'Escape', '.cortex/compass/../../etc/evil.md', 'nope'),
    });
    const before = snapshotTree(root);
    const code = await pulseCli('pulse-accept', ['S-002'], root);
    expect(code).toBe(1);
    expect(snapshotTree(root)).toEqual(before);
  });
});

describe('Reject records the window', () => {
  it('adds an S-001 dismissed section whose Expires is dismissedWindowDays after Dismissed', async () => {
    const root = makeProject('reject-window', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-001', 'To reject', '.cortex/compass/preferences.md', 'some text'),
      config: { schemaVersion: '1.0', pulse: { dismissedWindowDays: 30 } },
    });

    const code = await pulseCli('pulse-reject', ['S-001'], root);
    expect(code).toBe(0);

    const dismissed = fs.readFileSync(
      path.join(root, '.cortex', 'pulse', 'dismissed.md'),
      'utf-8',
    );
    expect(dismissed).toContain('kind: pulse-dismissed');
    expect(dismissed).toContain('## S-001');
    const dm = dismissed.match(/\*\*Dismissed:\*\*\s*(\S+)/);
    const em = dismissed.match(/\*\*Expires:\*\*\s*(\S+)/);
    expect(dm).not.toBeNull();
    expect(em).not.toBeNull();
    const dismissedMs = Date.parse((dm as RegExpMatchArray)[1] as string);
    const expiresMs = Date.parse((em as RegExpMatchArray)[1] as string);
    expect(expiresMs - dismissedMs).toBe(30 * 24 * 60 * 60 * 1000);

    // The suggestion is annotated rejected.
    const suggestions = fs.readFileSync(
      path.join(root, '.cortex', 'pulse', 'suggestions.md'),
      'utf-8',
    );
    expect(suggestions).toContain('**Status:** rejected');
  });
});

describe('Deciding twice is safe', () => {
  it('re-accepting an accepted id is a no-op (exit 0, zero file changes); rejecting it is a reversal error (exit 1)', async () => {
    const root = makeProject('decide-twice', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-001', 'Already', '.cortex/compass/preferences.md', 'text', 'accepted'),
    });

    const before = snapshotTree(root);
    const acceptCode = await pulseCli('pulse-accept', ['S-001'], root);
    expect(acceptCode).toBe(0);
    expect(stdout().toLowerCase()).toContain('already accepted');
    expect(snapshotTree(root)).toEqual(before);

    const rejectCode = await pulseCli('pulse-reject', ['S-001'], root);
    expect(rejectCode).toBe(1);
    expect(snapshotTree(root)).toEqual(before);
  });

  it('re-rejecting a rejected id is a no-op; accepting it is a reversal error', async () => {
    const root = makeProject('decide-twice-r', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-001', 'Already', '.cortex/compass/preferences.md', 'text', 'rejected'),
    });
    const before = snapshotTree(root);
    expect(await pulseCli('pulse-reject', ['S-001'], root)).toBe(0);
    expect(snapshotTree(root)).toEqual(before);
    expect(await pulseCli('pulse-accept', ['S-001'], root)).toBe(1);
    expect(snapshotTree(root)).toEqual(before);
  });
});

describe('Unknown id errors', () => {
  it('exits 1 naming S-999 when the suggestions file lacks it', async () => {
    const root = makeProject('unknown', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-001', 'Present', '.cortex/compass/preferences.md', 'text'),
    });
    const code = await pulseCli('pulse-accept', ['S-999'], root);
    expect(code).toBe(1);
    expect(stderr()).toContain('S-999');
  });
});

describe('Malformed entry handling (Rule 7)', () => {
  it('pulse-list skips an entry missing its Target or fenced block, with a notice, still exit 0', async () => {
    const root = makeProject('malformed-list', {
      suggestions: `${SUGGESTIONS_HEADER}## S-001: No target

**Proposed addition:**

\`\`\`
orphan block
\`\`\`

## S-002: No block

**Target:** .cortex/compass/preferences.md

**Proposed addition:**

(no fenced block here)

${entry('S-003', 'Good one', '.cortex/compass/preferences.md', 'valid text')}`,
    });

    const code = await pulseCli('pulse-list', [], root);
    expect(code).toBe(0);
    // Malformed ids are reported on stderr and excluded from the listing.
    expect(stderr()).toContain('S-001');
    expect(stderr()).toContain('S-002');
    expect(stdout()).not.toContain('S-001');
    expect(stdout()).not.toContain('S-002');
    // The well-formed one still lists.
    expect(stdout()).toContain('S-003');
    expect(stdout()).toContain('valid text');
  });

  it('pulse-accept on a malformed addressed entry exits 1 and changes nothing', async () => {
    const root = makeProject('malformed-accept', {
      suggestions: `${SUGGESTIONS_HEADER}## S-001: No target

**Proposed addition:**

\`\`\`
orphan block
\`\`\`
`,
    });
    const before = snapshotTree(root);
    const code = await pulseCli('pulse-accept', ['S-001'], root);
    expect(code).toBe(1);
    expect(stderr().toLowerCase()).toContain('malformed');
    expect(snapshotTree(root)).toEqual(before);
  });

  it('pulse-reject on a malformed addressed entry exits 1 and changes nothing', async () => {
    const root = makeProject('malformed-reject', {
      suggestions: `${SUGGESTIONS_HEADER}## S-001: No target

**Proposed addition:**

\`\`\`
orphan block
\`\`\`
`,
    });
    const before = snapshotTree(root);
    const code = await pulseCli('pulse-reject', ['S-001'], root);
    expect(code).toBe(1);
    expect(stderr().toLowerCase()).toContain('malformed');
    expect(snapshotTree(root)).toEqual(before);
  });
});

describe('Discovery spans all pulse reports', () => {
  it('pulse-list and pulse-accept both find S-004 proposed inside rule-candidates.md, and accept applies its block', async () => {
    const root = makeProject('discovery', {
      suggestions: SUGGESTIONS_HEADER + entry('S-001', 'In suggestions', '.cortex/compass/preferences.md', 'text one'),
      extra: {
        '.cortex/pulse/reports/rule-candidates.md':
          `---
kind: pulse-rule-candidates
generated: 2026-07-01T00:00:00Z
loop: cortex-loop-rule-decay
---

# Rule retirement candidates

` + entry('S-004', 'From another loop', '.cortex/compass/environment.md', 'Discovered across files.'),
        '.cortex/compass/environment.md': '# Environment\n',
      },
    });

    expect(await pulseCli('pulse-list', [], root)).toBe(0);
    expect(stdout()).toContain('S-001');
    expect(stdout()).toContain('S-004');

    expect(await pulseCli('pulse-accept', ['S-004'], root)).toBe(0);
    const env = fs.readFileSync(path.join(root, '.cortex', 'compass', 'environment.md'), 'utf-8');
    expect(env.endsWith('Discovered across files.')).toBe(true);
    // The status annotation lands in the report the section came from.
    const rcFile = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'rule-candidates.md'), 'utf-8');
    expect(rcFile).toContain('**Status:** accepted');
    const suggestions = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'suggestions.md'), 'utf-8');
    expect(suggestions).not.toContain('**Status:**');
  });

  it("dismissed.md's own S-NNN sections are rejection memory, never discovered as proposals", async () => {
    const root = makeProject('discovery-dismissed', {
      suggestions: SUGGESTIONS_HEADER + entry('S-001', 'Real one', '.cortex/compass/preferences.md', 'text'),
      dismissed: `---
kind: pulse-dismissed
generated: 2026-07-01T00:00:00Z
loop: cortex-init
---

## S-777: an old rejection

**Dismissed:** 2026-01-01T00:00:00Z
**Expires:** 2026-02-01T00:00:00Z
`,
    });
    expect(await pulseCli('pulse-list', [], root)).toBe(0);
    expect(stdout()).toContain('S-001');
    expect(stdout()).not.toContain('S-777');
    expect(stderr()).not.toContain('S-777'); // not even as a malformed-entry notice
  });
});

describe('Skill proposal accepted to a new skill only', () => {
  it('accept on S-005 targeting a nonexistent .claude/skills/my-workflow/SKILL.md creates it with the block', async () => {
    const root = makeProject('skill-new', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-005', 'my-workflow', '.claude/skills/my-workflow/SKILL.md', '---\nname: my-workflow\ndescription: Test.\n---\n\n# my-workflow\n\n1. Do it.'),
    });
    expect(await pulseCli('pulse-accept', ['S-005'], root)).toBe(0);
    const target = path.join(root, '.claude', 'skills', 'my-workflow', 'SKILL.md');
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toContain('name: my-workflow');
    const suggestions = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'suggestions.md'), 'utf-8');
    expect(suggestions).toContain('**Status:** accepted');
  });

  it('a suggestion targeting an EXISTING skill file is refused, exit 1, nothing changed', async () => {
    const root = makeProject('skill-existing', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-006', 'Overwrite attempt', '.claude/skills/already-there/SKILL.md', 'malicious overwrite'),
      extra: { '.claude/skills/already-there/SKILL.md': '---\nname: already-there\n---\n\noriginal\n' },
    });
    const before = snapshotTree(root);
    expect(await pulseCli('pulse-accept', ['S-006'], root)).toBe(1);
    expect(stderr()).toContain('.claude/skills/already-there/SKILL.md');
    expect(snapshotTree(root)).toEqual(before);
  });

  it('a skills path that is not exactly .claude/skills/<name>/SKILL.md stays refused', async () => {
    const root = makeProject('skill-shape', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-007', 'Wrong shape', '.claude/skills/rogue.md', 'nope') +
        entry('S-008', 'Nested escape', '.claude/skills/a/b/SKILL.md', 'nope'),
    });
    const before = snapshotTree(root);
    expect(await pulseCli('pulse-accept', ['S-007'], root)).toBe(1);
    expect(stderr()).toContain('.claude/skills/rogue.md');
    expect(await pulseCli('pulse-accept', ['S-008'], root)).toBe(1);
    expect(snapshotTree(root)).toEqual(before);
  });
});

describe('Duplicate id across files errors', () => {
  function makeDuplicateProject(label: string): string {
    return makeProject(label, {
      suggestions: SUGGESTIONS_HEADER + entry('S-006', 'First copy', '.cortex/compass/preferences.md', 'text A'),
      extra: {
        // skill-suggestions.md is a retired-loop orphan (deleted by the pulse
        // migration, never scanned) — a live cross-file duplicate now lands
        // under reports/, which discoverSuggestions DOES scan.
        '.cortex/pulse/reports/rule-candidates.md':
          `---
kind: pulse-rule-candidates
generated: 2026-07-01T00:00:00Z
loop: cortex-loop-rule-decay
---

# Rule retirement candidates

` + entry('S-006', 'Second copy', '.cortex/compass/environment.md', 'text B'),
        '.cortex/compass/preferences.md': '# Preferences\n',
        '.cortex/compass/environment.md': '# Environment\n',
      },
    });
  }

  it('pulse-accept on the duplicated id exits 1 naming both files, nothing changed', async () => {
    const root = makeDuplicateProject('dup-accept');
    const before = snapshotTree(root);
    expect(await pulseCli('pulse-accept', ['S-006'], root)).toBe(1);
    expect(stderr()).toContain(path.join('.cortex', 'pulse', 'suggestions.md'));
    expect(stderr()).toContain(path.join('.cortex', 'pulse', 'reports', 'rule-candidates.md'));
    expect(snapshotTree(root)).toEqual(before);
  });

  it('pulse-reject on the duplicated id exits 1 naming both files, nothing changed', async () => {
    const root = makeDuplicateProject('dup-reject');
    const before = snapshotTree(root);
    expect(await pulseCli('pulse-reject', ['S-006'], root)).toBe(1);
    expect(stderr()).toContain('S-006');
    expect(stderr()).toContain(path.join('.cortex', 'pulse', 'reports', 'rule-candidates.md'));
    expect(snapshotTree(root)).toEqual(before);
  });

  it('pulse-list also treats the duplicate as a hard error (exit 1 naming both files)', async () => {
    const root = makeDuplicateProject('dup-list');
    expect(await pulseCli('pulse-list', [], root)).toBe(1);
    expect(stderr()).toContain(path.join('.cortex', 'pulse', 'suggestions.md'));
    expect(stderr()).toContain(path.join('.cortex', 'pulse', 'reports', 'rule-candidates.md'));
  });
});

describe('Reject records the suggestion title (rejection memory text, pulse.distil Rule 3c)', () => {
  it('the dismissed.md section heading carries the rejected suggestion title', async () => {
    const root = makeProject('reject-title', {
      suggestions: SUGGESTIONS_HEADER + entry('S-001', 'use pnpm not npm', '.cortex/compass/preferences.md', 'Always pnpm.'),
    });
    expect(await pulseCli('pulse-reject', ['S-001'], root)).toBe(0);
    const dismissed = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'dismissed.md'), 'utf-8');
    expect(dismissed).toContain('## S-001: use pnpm not npm');
  });
});

describe('Compass core files are created if absent (Rule 4)', () => {
  it('accept targeting an absent core file (standing-authorities.md) creates it with the block', async () => {
    const root = makeProject('core-create', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-001', 'New authority', '.cortex/compass/standing-authorities.md', 'May bump patch versions.'),
    });

    const code = await pulseCli('pulse-accept', ['S-001'], root);
    expect(code).toBe(0);
    const target = path.join(root, '.cortex', 'compass', 'standing-authorities.md');
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('May bump patch versions.');
  });

  it('accept targeting an absent NON-core compass file exits 1 naming the path, nothing changed', async () => {
    const root = makeProject('non-core-absent', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-001', 'Nonexistent', '.cortex/compass/notes/scratch.md', 'text'),
    });
    const before = snapshotTree(root);
    const code = await pulseCli('pulse-accept', ['S-001'], root);
    expect(code).toBe(1);
    expect(stderr()).toContain('.cortex/compass/notes/scratch.md');
    expect(snapshotTree(root)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// AC — Fenced payload round-trips byte-exact (B-003 regression)
// ---------------------------------------------------------------------------
describe('Fenced payload round-trips byte-exact (B-003 regression)', () => {
  // A draft SKILL.md whose body contains a triple-backtick example — the
  // NORMAL case for skill-suggest payloads (B-003's evidence).
  const PAYLOAD = [
    '---',
    'name: fenced-workflow',
    'description: Demonstrates a fenced example.',
    '---',
    '',
    '# fenced-workflow',
    '',
    '```bash',
    'cortex validate --json',
    '```',
    '',
    'Done.',
  ].join('\n');

  /** §4.5 four-backtick outer fence around the triple-backtick payload. */
  function fencedEntry(id: string, target: string): string {
    return `## ${id}: fenced-workflow

**Target:** ${target}

**Proposed addition:**

\`\`\`\`
${PAYLOAD}
\`\`\`\`

`;
  }

  it('pulse-accept applies a four-backtick-wrapped payload byte-exact, inner fences included', async () => {
    const root = makeProject('b003-accept', {
      suggestions: SUGGESTIONS_HEADER + fencedEntry('S-030', '.claude/skills/fenced-workflow/SKILL.md'),
    });
    expect(await pulseCli('pulse-accept', ['S-030'], root)).toBe(0);
    const created = fs.readFileSync(path.join(root, '.claude', 'skills', 'fenced-workflow', 'SKILL.md'), 'utf-8');
    expect(created).toBe(PAYLOAD);
  });

  it('pulse-list prints the whole payload — the inner ``` fence does not truncate it', async () => {
    const root = makeProject('b003-list', {
      suggestions: SUGGESTIONS_HEADER + fencedEntry('S-031', '.claude/skills/fenced-workflow/SKILL.md'),
    });
    expect(await pulseCli('pulse-list', [], root)).toBe(0);
    expect(stdout()).toContain('cortex validate --json');
    expect(stdout()).toContain('Done.');
  });

  it('accept to a compass core file lands the payload byte-exact too', async () => {
    const root = makeProject('b003-compass', {
      suggestions: SUGGESTIONS_HEADER + fencedEntry('S-032', '.cortex/compass/preferences.md'),
    });
    expect(await pulseCli('pulse-accept', ['S-032'], root)).toBe(0);
    const target = fs.readFileSync(path.join(root, '.cortex', 'compass', 'preferences.md'), 'utf-8');
    expect(target).toBe(PAYLOAD);
  });
});
