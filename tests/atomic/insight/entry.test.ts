/**
 * Atomic tests — the v3 per-file understanding entry contract
 * (src/insight/entry.ts; spec insight.storage-format Rule 2; schema §4.10.2).
 * Pure parse/guard behaviour, no fs.
 */
import { describe, it, expect } from 'vitest';
import {
  parseEntry,
  entrySections,
  isCentrality,
  isExtractionLevel,
  CENTRALITY_LEVELS,
  L3_REQUIRED_SECTIONS,
  L2_REQUIRED_SECTIONS,
} from '../../../src/insight/entry.js';

const SHA = 'a1b3c5d7e9f102132435465768798a9bacbdcedfe0f1023344556677889900aa';

function l3Entry(overrides: Record<string, string> = {}, sections?: string): string {
  const fm: Record<string, string> = {
    path: 'src/auth/session.ts',
    extracted_at: '2026-07-07T14:00:00Z',
    extraction_level: '3',
    size_lines: '620',
    size_tokens: '5400',
    centrality: 'high',
    built_at_commit: '9f2c1ab',
    source_sha256: SHA,
    ...overrides,
  };
  const fmLines = Object.entries(fm)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const body =
    sections ??
    `## Purpose

Owns the session-token lifecycle.

## Main players

- \`validateToken\` (L40–L120) — critical.

## Insights

- Clock-skew tolerant by design.

## Connections

Uses:
- src/util/log.ts: logging

## Query pointers

- If you need to change validation, also read: src/auth/keys.ts
`;
  return `---\n${fmLines}\n---\n\n${body}`;
}

describe('parseEntry — well-formed entries (AC: L3 entry matches the contract)', () => {
  it('accepts the hand-authored L3 entry from the spec', () => {
    const result = parseEntry(l3Entry());
    expect(result.ok).toBe(true);
    expect(result.value?.frontmatter.path).toBe('src/auth/session.ts');
    expect(result.value?.frontmatter.extraction_level).toBe(3);
    expect(result.value?.frontmatter.centrality).toBe('high');
    expect(result.value?.frontmatter.source_sha256).toBe(SHA);
    expect(result.value?.sections).toContain('Purpose');
    expect(result.value?.sections).toContain('Main players');
    expect(result.value?.sections).toContain('Connections');
  });

  it('File map absent below the size threshold is not an error', () => {
    const result = parseEntry(l3Entry());
    expect(result.ok).toBe(true);
    expect(result.value?.sections).not.toContain('File map');
  });

  it('AC: an L2 entry omits Main players and Insights without failing', () => {
    const raw = l3Entry(
      { extraction_level: '2', centrality: 'low' },
      `## Purpose\n\nThin logging wrapper.\n\n## Connections\n\nUsed by:\n- src/auth/session.ts: logs decisions\n`,
    );
    const result = parseEntry(raw);
    expect(result.ok).toBe(true);
    expect(result.value?.frontmatter.extraction_level).toBe(2);
  });
});

describe('parseEntry — malformed entries are rejected, naming the field', () => {
  it('rejects a missing path', () => {
    const result = parseEntry(l3Entry({ path: '' }));
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('path');
  });

  it('rejects a non-{2,3} extraction_level', () => {
    const result = parseEntry(l3Entry({ extraction_level: '4' }));
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('extraction_level');
  });

  it('rejects a centrality outside the enum', () => {
    const result = parseEntry(l3Entry({ centrality: 'extreme' }));
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('centrality');
  });

  it('rejects a source_sha256 that is not 64 hex chars', () => {
    const result = parseEntry(l3Entry({ source_sha256: 'abc123' }));
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('source_sha256');
  });

  it('rejects non-integer size fields and a missing built_at_commit', () => {
    const result = parseEntry(l3Entry({ size_lines: 'many', built_at_commit: '' }));
    expect(result.ok).toBe(false);
    const joined = result.errors?.join(' ') ?? '';
    expect(joined).toContain('size_lines');
    expect(joined).toContain('built_at_commit');
  });

  it('an L3 entry missing "## Main players" fails the section contract', () => {
    const raw = l3Entry({}, `## Purpose\n\nX.\n\n## Connections\n\nUses:\n- y\n`);
    const result = parseEntry(raw);
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('Main players');
  });

  it('an L2 entry missing "## Connections" fails the section contract', () => {
    const raw = l3Entry({ extraction_level: '2' }, `## Purpose\n\nX.\n`);
    const result = parseEntry(raw);
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('Connections');
  });
});

describe('primitive guards + section vocabulary', () => {
  it('centrality and extraction-level guards agree with their enums', () => {
    for (const c of CENTRALITY_LEVELS) expect(isCentrality(c)).toBe(true);
    expect(isCentrality('critical')).toBe(false);
    expect(isExtractionLevel(2)).toBe(true);
    expect(isExtractionLevel(3)).toBe(true);
    expect(isExtractionLevel(1)).toBe(false);
    expect(isExtractionLevel('3')).toBe(false);
  });

  it('L3 minimum is Purpose + Main players + Connections; L2 is Purpose + Connections', () => {
    expect([...L3_REQUIRED_SECTIONS]).toEqual(['Purpose', 'Main players', 'Connections']);
    expect([...L2_REQUIRED_SECTIONS]).toEqual(['Purpose', 'Connections']);
  });

  it('entrySections extracts ## headings in document order', () => {
    expect(entrySections('## Purpose\ntext\n## Connections\n### sub\n# h1\n')).toEqual([
      'Purpose',
      'Connections',
    ]);
  });
});
