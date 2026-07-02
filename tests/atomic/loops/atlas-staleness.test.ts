/**
 * Atomic tests — loops.atlas-staleness signals in isolation (Rule 2's three
 * signals; Rule 3's empty-atlas clean run). Sandboxed tmp fixtures; source
 * ages come from `.meta.md` `captured` or backdated mtimes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import {
  daysAgoIso,
  writeAt,
  ruleMd,
  decisionMd,
  setMtimeDaysAgo,
} from '../../fixtures/loops-harness.js';
import { scanAtlasStaleness, ATLAS_STALE_AGE_DAYS } from '../../../src/loops/atlas-staleness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`atlas-atomic-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

const DECISION_REL = '.cortex/atlas/decisions/2025-12-01-choose-x.md';

/** A rule whose source cites the fixture decision. */
function citeRule(root: string): void {
  writeAt(root, 'src/app.ts', 'export {};\n');
  writeAt(
    root,
    '.cortex/cerebrum/rules/R-201-citer.md',
    ruleMd('R-201', { source: ['../../atlas/decisions/2025-12-01-choose-x.md'], governs: ['src/**/*.ts'] }),
  );
}

describe('signal (a): old cited decisions → re-verify', () => {
  it(`a decision older than ${ATLAS_STALE_AGE_DAYS} days cited by a rule is flagged, naming the citing rule`, async () => {
    const root = tmp('reverify');
    writeAt(root, DECISION_REL, decisionMd('2025-12-01-choose-x', daysAgoIso(200)));
    citeRule(root);
    const scan = await scanAtlasStaleness(root);
    expect(scan.reverify).toHaveLength(1);
    expect(scan.reverify[0]?.id).toBe('decision.2025-12-01-choose-x');
    expect(scan.reverify[0]?.citers).toContain('rule R-201');
  });

  it('an old decision cited by NOTHING is not a re-verify candidate', async () => {
    const root = tmp('uncited');
    writeAt(root, DECISION_REL, decisionMd('2025-12-01-choose-x', daysAgoIso(200)));
    const scan = await scanAtlasStaleness(root);
    expect(scan.reverify).toEqual([]);
  });

  it('a fresh cited decision (10 days) stays silent', async () => {
    const root = tmp('fresh');
    writeAt(root, DECISION_REL, decisionMd('2025-12-01-choose-x', daysAgoIso(10)));
    citeRule(root);
    const scan = await scanAtlasStaleness(root);
    expect(scan.reverify).toEqual([]);
  });

  it('an atlas entry citing the old decision via sources: also counts as a citer', async () => {
    const root = tmp('atlas-citer');
    writeAt(root, DECISION_REL, decisionMd('2025-12-01-choose-x', daysAgoIso(200)));
    writeAt(
      root,
      '.cortex/atlas/decisions/2026-05-01-follow-up.md',
      decisionMd('2026-05-01-follow-up', daysAgoIso(30), ['supersedes:', '  - 2025-12-01-choose-x.md']),
    );
    const scan = await scanAtlasStaleness(root);
    expect(scan.reverify).toHaveLength(1);
    expect(scan.reverify[0]?.citers).toContain('atlas decision.2026-05-01-follow-up');
  });
});

describe('signal (b): old orphan sources → archive', () => {
  it('a 200-day-old source (mtime) referenced by nothing is an archive candidate', async () => {
    const root = tmp('archive');
    const src = writeAt(root, '.cortex/atlas/sources/old-brief.txt', 'raw material\n');
    setMtimeDaysAgo(src, 200);
    const scan = await scanAtlasStaleness(root);
    expect(scan.archive).toHaveLength(1);
    expect(scan.archive[0]?.file).toBe('.cortex/atlas/sources/old-brief.txt');
  });

  it('an old source still referenced by a decision is not archived', async () => {
    const root = tmp('referenced');
    const src = writeAt(root, '.cortex/atlas/sources/old-brief.txt', 'raw material\n');
    setMtimeDaysAgo(src, 200);
    writeAt(
      root,
      '.cortex/atlas/decisions/2026-06-01-uses-brief.md',
      decisionMd('2026-06-01-uses-brief', daysAgoIso(20), ['sources:', '  - ../sources/old-brief.txt']),
    );
    const scan = await scanAtlasStaleness(root);
    expect(scan.archive).toEqual([]);
  });

  it("the sibling meta's captured date wins over mtime", async () => {
    const root = tmp('meta-captured');
    writeAt(root, '.cortex/atlas/sources/fresh-mtime.txt', 'raw\n'); // mtime = now
    writeAt(
      root,
      '.cortex/atlas/sources/fresh-mtime.meta.md',
      `---\nid: source.fresh-mtime\nkind: other\ncaptured: ${daysAgoIso(200)}\n---\n`,
    );
    const scan = await scanAtlasStaleness(root);
    expect(scan.archive).toHaveLength(1);
    expect(scan.archive[0]?.file).toBe('.cortex/atlas/sources/fresh-mtime.txt');
  });
});

describe('signal (c): dead cross-references', () => {
  it('a decision whose sources: names a deleted file is a dead-link finding naming both ends', async () => {
    const root = tmp('dead-source-ref');
    writeAt(
      root,
      '.cortex/atlas/decisions/2026-06-01-dead.md',
      decisionMd('2026-06-01-dead', daysAgoIso(5), ['sources:', '  - ../sources/vanished.txt']),
    );
    const scan = await scanAtlasStaleness(root);
    expect(scan.deadLinks).toHaveLength(1);
    expect(scan.deadLinks[0]?.from).toBe('decision.2026-06-01-dead');
    expect(scan.deadLinks[0]?.ref).toBe('../sources/vanished.txt');
  });

  it('an unresolvable cerebrum_rules id is a dead-link finding', async () => {
    const root = tmp('dead-rule-ref');
    writeAt(
      root,
      '.cortex/atlas/decisions/2026-06-01-rule.md',
      decisionMd('2026-06-01-rule', daysAgoIso(5), ['cerebrum_rules:', '  - R-999']),
    );
    const scan = await scanAtlasStaleness(root);
    expect(scan.deadLinks).toHaveLength(1);
    expect(scan.deadLinks[0]?.key).toBe('cerebrum_rules');
    expect(scan.deadLinks[0]?.ref).toBe('R-999');
  });
});

describe('Rule 3: an empty atlas is a clean run', () => {
  it('only _index.md files → empty, no candidates', async () => {
    const root = tmp('empty');
    writeAt(root, '.cortex/atlas/_index.md', '# Atlas — index\n');
    writeAt(root, '.cortex/atlas/decisions/_index.md', '# Decisions — index\n');
    writeAt(root, '.cortex/atlas/sources/_index.md', '# Sources — index\n');
    const scan = await scanAtlasStaleness(root);
    expect(scan.empty).toBe(true);
    expect(scan.reverify).toEqual([]);
    expect(scan.archive).toEqual([]);
    expect(scan.deadLinks).toEqual([]);
  });

  it('a missing atlas dir is also empty', async () => {
    const root = tmp('missing');
    const scan = await scanAtlasStaleness(root);
    expect(scan.empty).toBe(true);
  });
});
