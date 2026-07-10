/**
 * Atomic tests — the idempotent pulse-layout migration (design: pulse reorg).
 * `migratePulseLayout` moves loop reports under `reports/`, machine state
 * dotfiles under `state/` (leading dots dropped), per-session `.reads-<id>`
 * ledgers under `state/reads/<id>`, and Skill-layer extraction artefacts under
 * `extraction/`; retired-loop orphans are deleted outright, never migrated.
 * Idempotent: a second run is a no-op, and a both-exist collision keeps the
 * new location authoritative (the stale old file is deleted, not merged).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import { migratePulseLayout } from '../../../src/pulse/migrate.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`migrate-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function pulseDir(root: string): string {
  return path.join(root, '.cortex', 'pulse');
}

/** Write a pulse-relative fixture file, creating parent dirs as needed. */
function write(root: string, rel: string, content: string): void {
  const full = path.join(pulseDir(root), rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

function read(root: string, rel: string): string {
  return fs.readFileSync(path.join(pulseDir(root), rel), 'utf-8');
}

function exists(root: string, rel: string): boolean {
  return fs.existsSync(path.join(pulseDir(root), rel));
}

// ===========================================================================
describe('migratePulseLayout: flat fixture → subdivided layout', () => {
  it('moves reports/state/extraction files, deletes the orphan, leaves suggestions.md/dismissed.md at root', () => {
    const root = tmp('fresh');
    write(root, 'hygiene-report.md', 'HYGIENE\n');
    write(root, 'bug-triage.md', 'TRIAGE\n');
    write(root, '.suggestion-counter', '5\n');
    write(root, '.triage-worklist.json', '{"a":1}\n');
    write(root, '.reads-abc123', '{}\n');
    write(root, 'insight-extraction-plan.md', 'PLAN\n');
    write(root, '.purpose-worklist.json', '{}\n');
    write(root, 'suggestions.md', 'SUGGESTIONS\n');
    write(root, 'dismissed.md', 'DISMISSED\n');

    const result = migratePulseLayout(root);

    expect([...result.migrated].sort()).toEqual(
      [
        'hygiene-report.md -> reports/hygiene.md',
        'bug-triage.md -> reports/bug-triage.md',
        '.suggestion-counter -> state/suggestion-counter',
        '.triage-worklist.json -> state/triage-worklist.json',
        `.reads-abc123 -> ${path.join('state', 'reads', 'abc123')}`,
        'insight-extraction-plan.md -> extraction/plan.md',
      ].sort(),
    );
    expect(result.deleted).toEqual(['.purpose-worklist.json']);
    expect(result.superseded).toEqual([]);

    // New locations hold the migrated content.
    expect(read(root, 'reports/hygiene.md')).toBe('HYGIENE\n');
    expect(read(root, 'reports/bug-triage.md')).toBe('TRIAGE\n');
    expect(read(root, 'state/suggestion-counter')).toBe('5\n');
    expect(read(root, 'state/triage-worklist.json')).toBe('{"a":1}\n');
    expect(read(root, path.join('state', 'reads', 'abc123'))).toBe('{}\n');
    expect(read(root, 'extraction/plan.md')).toBe('PLAN\n');

    // The orphan is gone from disk entirely.
    expect(exists(root, '.purpose-worklist.json')).toBe(false);

    // Every old flat path no longer exists.
    for (const oldRel of [
      'hygiene-report.md',
      'bug-triage.md',
      '.suggestion-counter',
      '.triage-worklist.json',
      '.reads-abc123',
      'insight-extraction-plan.md',
    ]) {
      expect(exists(root, oldRel)).toBe(false);
    }

    // suggestions.md / dismissed.md are untouched at the pulse root.
    expect(read(root, 'suggestions.md')).toBe('SUGGESTIONS\n');
    expect(read(root, 'dismissed.md')).toBe('DISMISSED\n');
  });
});

// ===========================================================================
describe('migratePulseLayout: idempotent', () => {
  it('a second run returns empty migrated/deleted/superseded and leaves the tree unchanged', () => {
    const root = tmp('idempotent');
    write(root, 'hygiene-report.md', 'HYGIENE\n');
    write(root, '.suggestion-counter', '5\n');
    write(root, '.reads-xyz', '{}\n');
    write(root, 'suggestions.md', 'SUGGESTIONS\n');
    write(root, '.purpose-worklist.json', '{}\n');

    const first = migratePulseLayout(root);
    expect(first.migrated.length).toBeGreaterThan(0);

    const before = snapshotTree(pulseDir(root));
    const second = migratePulseLayout(root);
    const after = snapshotTree(pulseDir(root));

    expect(second.migrated).toEqual([]);
    expect(second.deleted).toEqual([]);
    expect(second.superseded).toEqual([]);
    expect(after).toEqual(before);
  });
});

// ===========================================================================
describe('migratePulseLayout: both-exist collision — new location wins', () => {
  it('an old flat file AND its new counterpart with different content: stale old deleted, new content preserved, reported as superseded', () => {
    const root = tmp('collision');
    // A state-artefact collision (Skill-owned extraction file).
    write(root, 'insight-l1.json', '{"old":true}\n');
    write(root, 'extraction/l1.json', '{"new":true}\n');
    // The same shape proven general for a report path too.
    write(root, 'hygiene-report.md', 'OLD HYGIENE\n');
    write(root, 'reports/hygiene.md', 'NEW HYGIENE\n');

    const result = migratePulseLayout(root);

    expect([...result.superseded].sort()).toEqual(
      ['insight-l1.json -> extraction/l1.json', 'hygiene-report.md -> reports/hygiene.md'].sort(),
    );
    expect(result.migrated).toEqual([]);

    // Stale old files are gone; the new (authoritative) content is unchanged.
    expect(exists(root, 'insight-l1.json')).toBe(false);
    expect(read(root, 'extraction/l1.json')).toBe('{"new":true}\n');
    expect(exists(root, 'hygiene-report.md')).toBe(false);
    expect(read(root, 'reports/hygiene.md')).toBe('NEW HYGIENE\n');
  });
});
