/**
 * Spec-level tests — insight.promotion-mechanism (the typed pulse gate + the
 * promotion accept side-effects). Drives `pulseCli` directly with an injected
 * `root` (the testability seam used by the atomic review-cli suite). Each AC in
 * the spec becomes a labelled test with concrete S-ids and fixture .cortex
 * trees. console.log/error are spied so exit codes come from the returned
 * number and output from the captured calls.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import { pulseCli } from '../../../src/pulse/review.js';
import { PROMOTED_TRAILER_PATTERN } from '../../../src/insight/formats.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`promotion-${label}`);
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

/** Write a .cortex/pulse project; `extra` seeds arbitrary project-relative files. */
function makeProject(
  label: string,
  files: { suggestions?: string; dismissed?: string; extra?: Record<string, string> },
): string {
  const root = tmp(label);
  const pulseDir = path.join(root, '.cortex', 'pulse');
  fs.mkdirSync(pulseDir, { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'compass'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.cortex', 'cortex.config.json'),
    JSON.stringify({ schemaVersion: '2.0', pulse: { dismissedWindowDays: 90 } }, null, 2),
    'utf-8',
  );
  if (files.suggestions !== undefined) {
    fs.writeFileSync(path.join(pulseDir, 'suggestions.md'), files.suggestions, 'utf-8');
  }
  if (files.dismissed !== undefined) {
    fs.writeFileSync(path.join(pulseDir, 'dismissed.md'), files.dismissed, 'utf-8');
  }
  for (const [rel, content] of Object.entries(files.extra ?? {})) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
  return root;
}

const HEADER = `---
kind: pulse-suggestions
generated: 2026-07-06T00:00:00Z
loop: cortex-loop-insight-gaps
---

# Suggestions

`;

const INSIGHT_PROSE = (topic: string, body: string): string =>
  `---\nkind: insight-prose\nupdated: 2026-07-01T00:00:00Z\ntopic: ${topic}\n---\n\n${body}\n`;

// ---------------------------------------------------------------------------
// AC: each type accepts to the right target with the right operation
// ---------------------------------------------------------------------------
describe('Each type accepts to the right target with the right operation', () => {
  it('S-050 rule-candidate appends to .cortex/compass/preferences.md', async () => {
    const root = makeProject('s050', {
      suggestions:
        HEADER +
        `## S-050: prefer pnpm

**Type:** rule-candidate
**Source:** distil; sessions s1
**Target:** .cortex/compass/preferences.md

**Proposed addition:**

\`\`\`
Always use pnpm, never npm.
\`\`\`
`,
      extra: { '.cortex/compass/preferences.md': '# Preferences\n\nExisting note.\n' },
    });

    expect(await pulseCli('pulse-accept', ['S-050'], root)).toBe(0);
    const prefs = fs.readFileSync(path.join(root, '.cortex', 'compass', 'preferences.md'), 'utf-8');
    expect(prefs).toContain('Existing note.\n\nAlways use pnpm, never npm.');
    expect(prefs.endsWith('Always use pnpm, never npm.')).toBe(true);
  });

  it('S-051 gated-layer-update byte-range-replaces in a compass rule file', async () => {
    const RULE = `---
id: R-014
title: No camelCase columns
---

# R-014 No camelCase columns

Columns MUST be snake_case in old style.
`;
    const root = makeProject('s051', {
      suggestions:
        HEADER +
        `## S-051: tighten R-014

**Type:** gated-layer-update
**Source:** insight-gaps; sessions s2
**Target:** .cortex/compass/rules/R-014-no-camelcase-columns.md

**Proposed edit:**

current:

\`\`\`
Columns MUST be snake_case in old style.
\`\`\`

replacement:

\`\`\`
Columns MUST be snake_case; camelCase is a check.rule error.
\`\`\`
`,
      extra: { '.cortex/compass/rules/R-014-no-camelcase-columns.md': RULE },
    });

    expect(await pulseCli('pulse-accept', ['S-051'], root)).toBe(0);
    const rule = fs.readFileSync(
      path.join(root, '.cortex', 'compass', 'rules', 'R-014-no-camelcase-columns.md'),
      'utf-8',
    );
    expect(rule).toContain('Columns MUST be snake_case; camelCase is a check.rule error.');
    expect(rule).not.toContain('snake_case in old style');
    // Byte-range replace: everything else is byte-identical.
    expect(rule.startsWith('---\nid: R-014')).toBe(true);
  });

  it('S-052 user-directed-capture appends to .cortex/insight/map/conventions.md', async () => {
    const root = makeProject('s052', {
      suggestions:
        HEADER +
        `## S-052: remember the naming convention

**Type:** user-directed-capture
**Source:** insight-gaps signal 5; sessions s3
**Target:** .cortex/insight/map/conventions.md

**Proposed addition:**

\`\`\`
Test files use the .spec.test.ts suffix.
\`\`\`
`,
      extra: {
        '.cortex/insight/map/conventions.md': INSIGHT_PROSE('conventions', '## Naming\n\nExisting convention.'),
      },
    });

    expect(await pulseCli('pulse-accept', ['S-052'], root)).toBe(0);
    const conv = fs.readFileSync(path.join(root, '.cortex', 'insight', 'map', 'conventions.md'), 'utf-8');
    expect(conv.endsWith('Test files use the .spec.test.ts suffix.')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC: an edit against drifted content refuses cleanly
// ---------------------------------------------------------------------------
describe('An edit against drifted content refuses cleanly', () => {
  it('S-053 exits 1, changes nothing, and stays pending when current: no longer matches', async () => {
    const root = makeProject('s053', {
      suggestions:
        HEADER +
        `## S-053: fix a RULES.md line

**Type:** gated-layer-update
**Source:** insight-gaps; sessions s4
**Target:** RULES.md

**Proposed edit:**

current:

\`\`\`
The old rule text that has since drifted.
\`\`\`

replacement:

\`\`\`
The corrected rule text.
\`\`\`
`,
      extra: { 'RULES.md': '# Rules\n\nThe rule text was rewritten by hand.\n' },
    });

    const before = snapshotTree(root);
    expect(await pulseCli('pulse-accept', ['S-053'], root)).toBe(1);
    expect(stderr().toLowerCase()).toContain('drift');
    expect(snapshotTree(root)).toEqual(before);
    // Still pending (no Status annotation written).
    const sugg = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'suggestions.md'), 'utf-8');
    expect(sugg).not.toContain('**Status:** accepted');
  });
});

// ---------------------------------------------------------------------------
// AC: an ambiguous edit refuses
// ---------------------------------------------------------------------------
describe('An ambiguous edit refuses', () => {
  it('S-054 exits 1 (ambiguous) and applies nothing when current: matches twice', async () => {
    const root = makeProject('s054', {
      suggestions:
        HEADER +
        `## S-054: ambiguous edit

**Type:** gated-layer-update
**Source:** insight-gaps; sessions s5
**Target:** .cortex/compass/rules/R-020-x.md

**Proposed edit:**

current:

\`\`\`
duplicated line
\`\`\`

replacement:

\`\`\`
changed line
\`\`\`
`,
      extra: {
        '.cortex/compass/rules/R-020-x.md': '# R-020\n\nduplicated line\n\nmiddle\n\nduplicated line\n',
      },
    });

    const before = snapshotTree(root);
    expect(await pulseCli('pulse-accept', ['S-054'], root)).toBe(1);
    expect(stderr().toLowerCase()).toContain('ambiguous');
    expect(snapshotTree(root)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// AC: a promotion lands the gated write, the lineage, and the promoted marker
// ---------------------------------------------------------------------------
describe('A promotion lands the gated write, the lineage, and the promoted marker', () => {
  it('S-055 creates the atlas decision with a source: back-ref and marks deploy.md promoted (not deleted)', async () => {
    const DEPLOY = INSIGHT_PROSE(
      'deploy',
      '## Deploy\n\nDeploys run via the runbook script. _(observed 2026-06-01, signal 2, sessions: s1, s2)_',
    );
    const TARGET_REL = '.cortex/atlas/decisions/2026-07-06-deploy-runbook.md';
    const root = makeProject('s055', {
      suggestions:
        HEADER +
        `## S-055: promote the deploy runbook

**Type:** promotion
**Source:** insight-gaps; promoting .cortex/insight/map/deploy.md; sessions s1, s2
**Target:** ${TARGET_REL}

**Proposed file:**

\`\`\`
---
id: decision.2026-07-06-deploy-runbook
title: Deploy runbook
date: 2026-07-06T00:00:00Z
---

On 2026-07-06 we captured the deploy runbook as a durable decision.
\`\`\`
`,
      extra: { '.cortex/insight/map/deploy.md': DEPLOY },
    });

    expect(await pulseCli('pulse-accept', ['S-055'], root)).toBe(0);

    // (a) the atlas decision is created carrying a source: back-ref to insight/map/deploy.md
    const atlasAbs = path.join(root, TARGET_REL);
    expect(fs.existsSync(atlasAbs)).toBe(true);
    const atlas = fs.readFileSync(atlasAbs, 'utf-8');
    expect(atlas).toContain('source:');
    expect(atlas).toContain('insight/map/deploy.md');
    expect(atlas).toContain('On 2026-07-06 we captured the deploy runbook');

    // (b) deploy.md gains the promoted trailer naming the target + S-055
    const deployAbs = path.join(root, '.cortex', 'insight', 'map', 'deploy.md');
    expect(fs.existsSync(deployAbs)).toBe(true); // (c) NOT deleted
    const deploy = fs.readFileSync(deployAbs, 'utf-8');
    expect(deploy).toContain('Deploys run via the runbook script.'); // original preserved
    const trailerLine = deploy
      .split('\n')
      .find((l) => l.startsWith('_(promoted'));
    expect(trailerLine).toBeDefined();
    expect(PROMOTED_TRAILER_PATTERN.test(trailerLine as string)).toBe(true);
    expect(trailerLine).toContain(TARGET_REL);
    expect(trailerLine).toContain('via S-055');
  });
});

// ---------------------------------------------------------------------------
// AC: a promotion with a missing insight source refuses transactionally
// ---------------------------------------------------------------------------
describe('A promotion with a missing insight source refuses transactionally', () => {
  it('S-056 exits 1, lands no gated write, stamps no marker, stays pending', async () => {
    const TARGET_REL = '.cortex/atlas/decisions/2026-07-06-orphan.md';
    const root = makeProject('s056', {
      suggestions:
        HEADER +
        `## S-056: promote a nonexistent insight file

**Type:** promotion
**Source:** insight-gaps; promoting .cortex/insight/map/nonexistent.md; sessions s9
**Target:** ${TARGET_REL}

**Proposed file:**

\`\`\`
---
id: decision.2026-07-06-orphan
title: Orphan
date: 2026-07-06T00:00:00Z
---

Body.
\`\`\`
`,
    });

    const before = snapshotTree(root);
    expect(await pulseCli('pulse-accept', ['S-056'], root)).toBe(1);
    expect(fs.existsSync(path.join(root, TARGET_REL))).toBe(false);
    expect(snapshotTree(root)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// AC: promotion and gated-layer-update may not target insight
// ---------------------------------------------------------------------------
describe('promotion and gated-layer-update may not target insight', () => {
  it('S-057 promotion targeting .cortex/insight/map/setup.md is refused, naming the path', async () => {
    const root = makeProject('s057', {
      suggestions:
        HEADER +
        `## S-057: promote into insight (illegal)

**Type:** promotion
**Source:** insight-gaps; promoting .cortex/insight/map/setup.md; sessions s10
**Target:** .cortex/insight/map/setup.md

**Proposed addition:**

\`\`\`
some content
\`\`\`
`,
      extra: { '.cortex/insight/map/setup.md': INSIGHT_PROSE('setup', '## Setup\n\nExisting.') },
    });

    const before = snapshotTree(root);
    expect(await pulseCli('pulse-accept', ['S-057'], root)).toBe(1);
    expect(stderr()).toContain('.cortex/insight/map/setup.md');
    expect(snapshotTree(root)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// AC: the shared gate still governs the typed types
// ---------------------------------------------------------------------------
describe('The shared gate still governs the typed types', () => {
  it('S-058 present in two pulse files is a duplicate-id hard error naming both', async () => {
    const SECTION = (label: string, target: string) =>
      `## S-058: ${label}

**Type:** rule-candidate
**Source:** distil; sessions s11
**Target:** ${target}

**Proposed addition:**

\`\`\`
text
\`\`\`
`;
    const root = makeProject('s058', {
      suggestions: HEADER + SECTION('first copy', '.cortex/compass/preferences.md'),
      extra: {
        '.cortex/pulse/rule-candidates.md':
          `---
kind: pulse-rule-candidates
generated: 2026-07-06T00:00:00Z
loop: cortex-loop-rule-decay
---

# Rule candidates

` + SECTION('second copy', '.cortex/compass/environment.md'),
      },
    });

    const before = snapshotTree(root);
    expect(await pulseCli('pulse-accept', ['S-058'], root)).toBe(1);
    expect(stderr()).toContain(path.join('.cortex', 'pulse', 'suggestions.md'));
    expect(stderr()).toContain(path.join('.cortex', 'pulse', 'rule-candidates.md'));
    expect(snapshotTree(root)).toEqual(before);
  });

  it('S-059 rejected in dismissed.md with a future Expires stays suppressed in pulse-list', async () => {
    const root = makeProject('s059', {
      suggestions:
        HEADER +
        `## S-059: a suppressed candidate

**Type:** rule-candidate
**Source:** distil; sessions s12
**Target:** .cortex/compass/preferences.md

**Proposed addition:**

\`\`\`
suppressed text
\`\`\`
`,
      dismissed: `---
kind: pulse-dismissed
generated: 2026-07-06T00:00:00Z
loop: cortex-init
---

## S-059: a suppressed candidate

**Dismissed:** ${isoDaysFromNow(-1)}
**Expires:** ${isoDaysFromNow(30)}
`,
    });

    expect(await pulseCli('pulse-list', [], root)).toBe(0);
    expect(stdout()).not.toContain('S-059');
    expect(stdout().toLowerCase()).toContain('nothing pending');
  });
});

// ---------------------------------------------------------------------------
// Regression: list surfaces the Type; a typed suggestion lists cleanly
// ---------------------------------------------------------------------------
describe('pulse-list surfaces the Type for typed suggestions', () => {
  it('shows Type: promotion in the listing', async () => {
    const root = makeProject('list-type', {
      suggestions:
        HEADER +
        `## S-060: promote something

**Type:** promotion
**Source:** insight-gaps; promoting .cortex/insight/map/deploy.md
**Target:** .cortex/atlas/decisions/2026-07-06-x.md

**Proposed file:**

\`\`\`
body
\`\`\`
`,
    });
    expect(await pulseCli('pulse-list', [], root)).toBe(0);
    expect(stdout()).toContain('S-060');
    expect(stdout()).toContain('Type: promotion');
  });
});
