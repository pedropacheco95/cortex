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
  fs.mkdirSync(path.join(root, '.cortex', 'cerebrum'), { recursive: true });
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
        entry('S-001', 'Add pnpm note', '.cortex/cerebrum/preferences.md', 'Always use pnpm.') +
        entry('S-002', 'Accepted one', '.cortex/cerebrum/environment.md', 'Already applied.', 'accepted') +
        entry('S-003', 'Dismissed one', '.cortex/cerebrum/decisions.md', 'Snoozed for now.'),
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
    expect(text).toContain('.cortex/cerebrum/preferences.md');
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
        entry('S-003', 'Dismissed one', '.cortex/cerebrum/decisions.md', 'Resurfaced text.'),
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
        entry('S-001', 'Chrome profile', '.cortex/cerebrum/environment.md', 'Chrome profile: profile-X'),
      extra: { '.cortex/cerebrum/environment.md': '# Environment\n\nOperational pointers only.\n' },
    });

    const before = snapshotTree(root);
    const code = await pulseCli('pulse-accept', ['S-001'], root);
    expect(code).toBe(0);

    const envPath = path.join(root, '.cortex', 'cerebrum', 'environment.md');
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
      path.join('.cortex', 'cerebrum', 'environment.md'),
      path.join('.cortex', 'pulse', 'suggestions.md'),
    ]);
    const keys = new Set([...before.keys(), ...after.keys()]);
    for (const key of keys) {
      if (allowed.has(key)) continue;
      expect(after.get(key)).toBe(before.get(key));
    }
  });
});

describe('Non-cerebrum target refused', () => {
  it('exits 1 naming the path and changes nothing when the target is outside .cortex/cerebrum/', async () => {
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

  it('refuses a `..` escape out of .cortex/cerebrum/', async () => {
    const root = makeProject('refuse-escape', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-002', 'Escape', '.cortex/cerebrum/../../etc/evil.md', 'nope'),
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
        entry('S-001', 'To reject', '.cortex/cerebrum/preferences.md', 'some text'),
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
        entry('S-001', 'Already', '.cortex/cerebrum/preferences.md', 'text', 'accepted'),
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
        entry('S-001', 'Already', '.cortex/cerebrum/preferences.md', 'text', 'rejected'),
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
        entry('S-001', 'Present', '.cortex/cerebrum/preferences.md', 'text'),
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

**Target:** .cortex/cerebrum/preferences.md

**Proposed addition:**

(no fenced block here)

${entry('S-003', 'Good one', '.cortex/cerebrum/preferences.md', 'valid text')}`,
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

describe('Cerebrum core files are created if absent (Rule 4)', () => {
  it('accept targeting an absent core file (standing-authorities.md) creates it with the block', async () => {
    const root = makeProject('core-create', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-001', 'New authority', '.cortex/cerebrum/standing-authorities.md', 'May bump patch versions.'),
    });

    const code = await pulseCli('pulse-accept', ['S-001'], root);
    expect(code).toBe(0);
    const target = path.join(root, '.cortex', 'cerebrum', 'standing-authorities.md');
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('May bump patch versions.');
  });

  it('accept targeting an absent NON-core cerebrum file exits 1 naming the path, nothing changed', async () => {
    const root = makeProject('non-core-absent', {
      suggestions:
        SUGGESTIONS_HEADER +
        entry('S-001', 'Nonexistent', '.cortex/cerebrum/notes/scratch.md', 'text'),
    });
    const before = snapshotTree(root);
    const code = await pulseCli('pulse-accept', ['S-001'], root);
    expect(code).toBe(1);
    expect(stderr()).toContain('.cortex/cerebrum/notes/scratch.md');
    expect(snapshotTree(root)).toEqual(before);
  });
});
