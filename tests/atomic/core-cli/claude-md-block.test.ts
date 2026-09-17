/**
 * Atomic tests — the CLAUDE.md managed block (schema §8, 3.4 fifth revision;
 * core-cli.init Rule 10, core-cli.sync Rule 3). `claudeMdBlock(projectName,
 * config)` renders the pinned role sentence, ONE generated placement
 * paragraph whose tail follows `placement.localNotesDir` and
 * `visibility.repo`, and no insight mandate. The text is pinned here, not by
 * check.claude-md (markers and version only).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { claudeMdBlock, SCHEMA_VERSION, PRESENT_MODULES } from '../../../src/cli/templates.js';
import { upsertClaudeMd } from '../../../src/cli/scaffold.js';
import { checkClaudeMd } from '../../../src/schema/checks/claude-md.js';
import { makeTmpDir, cleanTmp, makeCortexProject } from '../../fixtures/hooks-harness.js';

const ROLE_SENTENCE =
  'This applies more, not less, to sessions that dispatch, review or plan rather than edit: everything reaches them as a claim, and `compass/` is where claims are checked.';
const PLACEMENT_HEAD = '**Placement:** durable knowledge lives in `.cortex/` (tracked, except `atlas/sources/`, `pulse/` and archived raw sources).';
const TAIL_UNKNOWN = ' Repository visibility is unknown — set `visibility.repo` in `cortex.config.json`.';
const TAIL_PUBLIC = ' This repository is public: compass and atlas carry pointers, never hosts, ports or account ids (RULES.md rule 20).';
const tailNotes = (dir: string) =>
  ` \`${dir}\` is local and untracked: notes there do not travel — promote them into \`.cortex/\` instead of tracking the directory.`;

/**
 * The block is wrapped at ~90 columns like the schema §8 listing; compare
 * paragraphs with the wrap folded so the pinned sentences are matched as
 * prose, not as a particular line break.
 */
function unwrap(block: string): string {
  return block.replace(/\n(?!\n)/g, ' ');
}
function placementParagraph(block: string): string {
  const para = block.split('\n\n').find((p) => p.startsWith('**Placement:**'));
  return para === undefined ? '' : unwrap(para);
}

/**
 * The length of `claudeMdBlock('x')` rendered by the 3.4 fourth-revision
 * template (before this revision: no role sentence, no placement paragraph,
 * the insight mandate still present), measured on 2026-09-17. The plan's
 * ground rule asks the block not to grow; the pinned grammar does not fit
 * that rule — see the "size" test below, which pins the measured delta
 * instead so the overage is visible, not silent (RULES.md rule 11).
 */
const PREVIOUS_LENGTH_X = 2345;

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

describe('claudeMdBlock: the role sentence (init Rule 10a)', () => {
  it('the protocol paragraph carries the pinned sentence right after "what to read and when."', () => {
    const block = unwrap(claudeMdBlock('x'));
    expect(block).toContain(`prompts that tell you what to read and when. ${ROLE_SENTENCE} For "why" questions, grep \`compass/\``);
  });

  it('renders identically with no config argument and with an empty config', () => {
    expect(claudeMdBlock('x')).toBe(claudeMdBlock('x', {}));
  });
});

describe('claudeMdBlock: the placement paragraph (init Rule 10b, schema §8 {{PLACEMENT_TAIL}})', () => {
  it('exactly one line starts **Placement:** and it sits between the protocol and the specs paragraphs', () => {
    const block = claudeMdBlock('x');
    const lines = block.split('\n').filter((l) => l.startsWith('**Placement:**'));
    expect(lines).toHaveLength(1);
    const protocolIdx = block.indexOf('**Protocol:**');
    const placementIdx = block.indexOf('**Placement:**');
    const specsIdx = block.indexOf('Specs are the source of truth');
    expect(protocolIdx).toBeLessThan(placementIdx);
    expect(placementIdx).toBeLessThan(specsIdx);
  });

  it('no config / empty config / repo unknown → the unknown tail', () => {
    for (const config of [undefined, {}, { visibility: { repo: 'unknown' } }, { visibility: {} }]) {
      expect(placementParagraph(claudeMdBlock('x', config))).toBe(PLACEMENT_HEAD + TAIL_UNKNOWN);
    }
  });

  it('repo public → the rule-20 tail, ending "(RULES.md rule 20)."', () => {
    const para = placementParagraph(claudeMdBlock('x', { visibility: { repo: 'public' } }));
    expect(para).toBe(PLACEMENT_HEAD + TAIL_PUBLIC);
    expect(para.endsWith('(RULES.md rule 20).')).toBe(true);
  });

  it('repo private → no tail at all', () => {
    expect(placementParagraph(claudeMdBlock('x', { visibility: { repo: 'private' } }))).toBe(PLACEMENT_HEAD);
  });

  it('placement.localNotesDir set → the notes tail first, then the visibility tail', () => {
    const cfg = { placement: { localNotesDir: 'docs/notes' } };
    expect(placementParagraph(claudeMdBlock('x', cfg))).toBe(PLACEMENT_HEAD + tailNotes('docs/notes') + TAIL_UNKNOWN);
    expect(placementParagraph(claudeMdBlock('x', { ...cfg, visibility: { repo: 'public' } }))).toBe(PLACEMENT_HEAD + tailNotes('docs/notes') + TAIL_PUBLIC);
    expect(placementParagraph(claudeMdBlock('x', { ...cfg, visibility: { repo: 'private' } }))).toBe(PLACEMENT_HEAD + tailNotes('docs/notes'));
  });

  it('an empty or non-string localNotesDir renders no notes tail', () => {
    expect(placementParagraph(claudeMdBlock('x', { placement: { localNotesDir: '' } }))).toBe(PLACEMENT_HEAD + TAIL_UNKNOWN);
    expect(placementParagraph(claudeMdBlock('x', { placement: { localNotesDir: 7 } }))).toBe(PLACEMENT_HEAD + TAIL_UNKNOWN);
    expect(placementParagraph(claudeMdBlock('x', { placement: 'docs' }))).toBe(PLACEMENT_HEAD + TAIL_UNKNOWN);
  });

  it('an out-of-enum repo value renders as unknown (check.config reports it; the block never throws)', () => {
    expect(placementParagraph(claudeMdBlock('x', { visibility: { repo: 'open' } }))).toBe(PLACEMENT_HEAD + TAIL_UNKNOWN);
  });
});

describe('claudeMdBlock: the insight mandate is gone (init Rule 10c)', () => {
  it('neither "Before substantive work on any file" nor "This is not optional" appears, under any config', () => {
    for (const config of [undefined, { visibility: { repo: 'public' } }, { placement: { localNotesDir: 'n' } }]) {
      const block = claudeMdBlock('x', config);
      expect(block).not.toContain('This is not optional');
      expect(block).not.toContain('Before substantive work on any file');
      expect(block).not.toContain('Before changes touching multiple files');
    }
  });

  it('the rest of the §8 block is intact: markers, bullets, specs paragraph, modules line, the insight section', () => {
    const block = claudeMdBlock('proj');
    expect(block.startsWith(`<!-- cortex:start v${SCHEMA_VERSION} -->\n## Cortex\n\nCortex is active on **proj**.`)).toBe(true);
    expect(block.endsWith('<!-- cortex:end -->')).toBe(true);
    expect(block).toContain(`Modules present: ${PRESENT_MODULES}. Schema: ${SCHEMA_VERSION}.`);
    expect(block).toContain('## Cortex Insight');
    expect(block).toContain('Consult insight first; read the file when you need exactness.');
    expect(block).toContain('- cortex insight file <path>');
    expect(block).toContain('Also check `insight/observations/`');
  });
});

describe('claudeMdBlock: size (RULES.md rule 11)', () => {
  it('pins the measured growth over the fourth-revision template so the overage is visible', () => {
    // Removed: the three-line mandate paragraph (157 chars). Added: the role
    // sentence and the placement paragraph with the default (unknown) tail.
    // The pinned grammar costs more than the mandate removal returns; this
    // assertion records the exact delta rather than hiding it.
    const delta = claudeMdBlock('x').length - PREVIOUS_LENGTH_X;
    expect(delta).toBe(219);
    // Bounded: no rendering of the tails may push the block past this ceiling.
    const widest = claudeMdBlock('x', { visibility: { repo: 'public' }, placement: { localNotesDir: 'docs/notes' } });
    expect(widest.length).toBeLessThanOrEqual(PREVIOUS_LENGTH_X + 400);
  });
});

describe('upsertClaudeMd reads the config from disk and check.claude-md still passes', () => {
  it('renders the public tail from .cortex/cortex.config.json when no config is passed, and validates', () => {
    const root = makeTmpDir('claude-md-block');
    dirs.push(root);
    const config = { schemaVersion: SCHEMA_VERSION, visibility: { repo: 'public', allow: [] }, placement: { localNotesDir: 'docs/notes' } };
    makeCortexProject(root, { config });
    expect(upsertClaudeMd(root)).toBe('created');
    const content = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
    expect(placementParagraph(content.trimEnd())).toBe(PLACEMENT_HEAD + tailNotes('docs/notes') + TAIL_PUBLIC);
    expect(checkClaudeMd(root, config)).toEqual([]);
    // Idempotent: a second call with the same config on disk changes nothing.
    expect(upsertClaudeMd(root)).toBe('unchanged');
    // A config edit followed by a re-render refreshes the paragraph (sync Rule 3).
    fs.writeFileSync(path.join(root, '.cortex', 'cortex.config.json'), JSON.stringify({ schemaVersion: SCHEMA_VERSION, visibility: { repo: 'private' } }) + '\n');
    expect(upsertClaudeMd(root)).toBe('updated');
    expect(placementParagraph(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8').trimEnd())).toBe(PLACEMENT_HEAD);
  });

  it('a missing or unparseable config renders the unknown tail and no notes directory', () => {
    const root = makeTmpDir('claude-md-noconfig');
    dirs.push(root);
    expect(upsertClaudeMd(root)).toBe('created');
    expect(placementParagraph(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8').trimEnd())).toBe(PLACEMENT_HEAD + TAIL_UNKNOWN);
    fs.mkdirSync(path.join(root, '.cortex'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'cortex.config.json'), '{nope', 'utf-8');
    expect(upsertClaudeMd(root)).toBe('unchanged');
  });
});
