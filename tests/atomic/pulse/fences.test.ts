/**
 * Atomic tests — the §4.5 fence grammar (B-003 fix): writer fence-length
 * selection (`chooseOuterFence`), parser fence matching (`openingFence` /
 * `closesFence`), and the pure parser/writer round-trip — a payload emitted
 * by the writer half is extracted byte-exact by the parser half, for payloads
 * containing 3- and 4-backtick runs. Pure string functions; no fs.
 */
import { describe, it, expect } from 'vitest';
import {
  openingFence,
  closesFence,
  longestBacktickRun,
  chooseOuterFence,
  headingLinesOutsideFences,
} from '../../../src/pulse/fences.js';
import { parseSuggestions } from '../../../src/pulse/review.js';

describe('chooseOuterFence — writers pick a fence strictly longer than any inner run', () => {
  it('a payload without fences gets the minimum three-backtick fence', () => {
    expect(chooseOuterFence('plain text\nno fences here')).toBe('```');
  });

  it('inline single backticks still yield a three-backtick fence', () => {
    expect(chooseOuterFence('use `cortex validate` daily')).toBe('```');
  });

  it('a payload with a triple-backtick fence gets a four-backtick outer fence', () => {
    const payload = '# Draft\n\n```bash\necho hi\n```\n';
    expect(longestBacktickRun(payload)).toBe(3);
    expect(chooseOuterFence(payload)).toBe('````');
  });

  it('a payload with a four-backtick fence gets a five-backtick outer fence', () => {
    const payload = 'outer doc\n\n````\ninner with ```\n````\n';
    expect(longestBacktickRun(payload)).toBe(4);
    expect(chooseOuterFence(payload)).toBe('`````');
  });
});

describe('openingFence / closesFence — parser honours the opening length', () => {
  it('a shorter fence does not close a longer opening fence', () => {
    const open = openingFence('````');
    expect(open).toEqual({ char: '`', length: 4 });
    expect(closesFence('```', open!)).toBe(false);
    expect(closesFence('````', open!)).toBe(true);
    expect(closesFence('`````', open!)).toBe(true);
  });

  it('a tilde fence never closes a backtick fence (and vice versa)', () => {
    const backtick = openingFence('```')!;
    expect(closesFence('~~~', backtick)).toBe(false);
    const tilde = openingFence('~~~')!;
    expect(closesFence('```', tilde)).toBe(false);
    expect(closesFence('~~~~', tilde)).toBe(true);
  });

  it('an info string is allowed on the opening fence but not the closing one', () => {
    expect(openingFence('```markdown')).toEqual({ char: '`', length: 3 });
    expect(closesFence('``` trailing junk', openingFence('```')!)).toBe(false);
    expect(closesFence('```   ', openingFence('```')!)).toBe(true);
  });

  it('headingLinesOutsideFences skips heading-looking lines inside a fenced payload', () => {
    const lines = ['## S-001: real', '````', '## S-002: payload, not a section', '````', '## S-003: real'];
    expect(headingLinesOutsideFences(lines, /^##\s+(S-\d{3,})/)).toEqual([0, 4]);
  });
});

/** Emulate the §4.5 writer half: one proposal section around `payload`. */
function writerSection(payload: string): string {
  const fence = chooseOuterFence(payload);
  return [
    '## S-101: round-trip',
    '',
    '**Source:** fences-test',
    '**Target:** .cortex/compass/preferences.md',
    '',
    '**Proposed addition:**',
    '',
    fence,
    payload,
    fence,
  ].join('\n');
}

describe('Parser/writer round-trip (B-003) — payload extracted byte-exact', () => {
  it('a payload containing a triple-backtick fence round-trips byte-exact', () => {
    const payload = '---\nname: demo\n---\n\n```bash\ncortex validate\n```\n\ndone';
    const parsed = parseSuggestions(writerSection(payload).split('\n'));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.block).toBe(payload);
  });

  it('a payload containing a four-backtick fence round-trips byte-exact', () => {
    const payload = 'Explain fences:\n\n````\nan example that itself shows ```\n````\n\nend';
    const parsed = parseSuggestions(writerSection(payload).split('\n'));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.block).toBe(payload);
  });

  it('field- and heading-looking lines inside the payload stay payload', () => {
    const payload = '## S-999: not a section\n**Target:** not-a-field\n```\ninner\n```';
    const parsed = parseSuggestions(writerSection(payload).split('\n'));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.id).toBe('S-101');
    expect(parsed[0]!.target).toBe('.cortex/compass/preferences.md');
    expect(parsed[0]!.block).toBe(payload);
  });
});
