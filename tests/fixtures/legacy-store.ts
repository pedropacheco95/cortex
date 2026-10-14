/**
 * A 3.x `.cortex/` fixture for `store.migrate`: one of each kind the
 * acceptance criteria name. Neutral names only (RULES.md rule 20).
 */
import * as fs from 'fs';
import * as path from 'path';

function w(root: string, rel: string, text: string): void {
  const p = path.join(root, '.cortex', rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

export function writeLegacyStore(root: string): void {
  w(root, 'cortex.config.json', JSON.stringify({ schemaVersion: '3.4', visibility: { repo: 'private', allow: [] }, hooks: { preRead: true } }, null, 2));
  w(root, '_index.md', '# Index\n');
  w(root, 'compass/rules/R-001-core-no-llm-calls.md', '---\nid: R-001\ntitle: Core makes no LLM calls\nsource:\n  - ../../../RULES.md\ngoverns:\n  - "src/schema/**/*.ts"\nprovenance:\n  - derives_from: atlas/decisions/2026-07-07-tiering.md\n---\n\nNever import an LLM SDK in Core.\n');
  w(root, 'compass/bugs/B-001-path-noise.md', '---\nid: B-001\ntitle: Pre-write warns on path match alone\ntype: wrong-rule\nseverity: medium\nstatus: resolved\naffects:\n  - hooks.pre-write\n  - src/hooks/pre-write.ts\nopened: 2026-07-02T00:00:00Z\nresolved: 2026-07-02T23:00:00Z\n---\n\nThe hook warned on every path match.\n');
  w(root, 'compass/bugs/B-002-orphaned-workspace.md', '---\nid: B-002\ntitle: Harness leaves an orphaned workspace\ntype: crash\nseverity: low\nstatus: open\naffects:\n  - harness.run\nopened: 2026-07-03T00:00:00Z\n---\n\nThe temp workspace survives a crash.\n');
  w(root, 'compass/preferences.md', '---\nkind: compass-preferences\n---\n\n# Preferences\n\n- Use pnpm for every package operation.\n- Keep commits small.\n- Tests come first.\n');
  w(root, 'compass/registry.md', '# Id registry\n\nR-001 core-no-llm-calls\nB-001 path-noise\nB-002 orphaned-workspace\n');
  w(root, 'atlas/decisions/2026-07-07-tiering.md', '---\nid: decision.2026-07-07-tiering\ntitle: Scheduled bundles use model tiering\ndate: 2026-07-07T12:00:00Z\nprovenance:\n  - derives_from: archive/documents/brief/extracted/summary.md\n  - derives_from: atlas/decisions/2026-01-01-gone.md\n---\n\nOn 2026-07-07 we chose tiering because cost matters.\n');
  w(root, 'atlas/decisions/2026-07-08-single-home.md', '---\nid: decision.2026-07-08-single-home\ntitle: Decisions have a single home\ndate: 2026-07-08T12:00:00Z\n---\n\nDecisions live in one folder.\n');
  w(root, 'atlas/domain/fare.md', '---\nid: domain.fare\nterm: fare\ndefinition: The price of one crossing.\naliases:\n  - ticket price\n---\n');
  w(root, 'atlas/evidence/2026-09-15-usage.md', '---\nid: evidence.2026-09-15-usage\ntitle: Usage over 54 sessions\ndate: 2026-09-15T15:48:10Z\nfindings:\n  - metric: searches\n    value: 54\n---\n\nFifty-four sessions measured.\n');
  w(root, 'archive/documents/brief/metadata.yaml', 'id: archive.brief\nkind: brief\ningested_at: 2026-01-02T10:00:00Z\norigin: "a partner team, shared by the user"\n');
  w(root, 'archive/documents/brief/source.md', '# The brief\n\nRaw text.\n');
  w(root, 'archive/documents/brief/extracted/summary.md', '# Summary\n\nThe brief asks for two things.\n');
  w(root, 'archive/intent-register.yaml', 'entries:\n  - id: IR-001\n    stated_intent: "add the presence filter"\n    date: 2026-08-05\n    status: reconciled\n    landing: discipline.hardening#A directory without a bundle\n');
  w(root, 'insight/observations/jev-evaluation.md', '---\nkind: insight-observation\nupdated: 2026-08-20T16:40:02Z\n---\n\nThe evaluator runs nightly.\n');
  w(root, 'insight/anatomy/src/a.ts.md', 'a\n');
  w(root, 'insight/anatomy/src/b.ts.md', 'b\n');
  w(root, 'insight/anatomy/src/c.ts.md', 'c\n');
  w(root, 'insight/concepts/one.md', '1\n');
  w(root, 'insight/concepts/two.md', '2\n');
  w(root, 'insight/graph.json', '{}\n');
  w(root, 'pulse/suggestions.md', '---\nkind: pulse-suggestions\n---\n\n# Distil suggestions\n\n## S-021: Headless commands hang\n\n**Pattern:** run them backgrounded.\n\n### Detail\nPoll with a timeout.\n\n```\n## not a heading\n```\n');
  w(root, 'pulse/reports/hygiene.md', 'report\n');
}

/** Extra 3.x files for the Rule 13 (sessions/sources) and Rule 14 (redaction) criteria. */
export function writeLegacyExtras(root: string): void {
  w(root, 'insight/observations/nightly-runs.md', '---\nkind: insight-observation\nupdated: 2026-08-21T10:00:00Z\nsessions:\n  - claude-sessions/someone/abc12345\n---\n\nNightly runs finish by six.\n');
  w(root, 'atlas/sources/brief-notes.md', 'raw notes\n');
  w(root, 'atlas/sources/brief-notes.meta.md', '---\nid: source.brief-notes\nkind: notes\ncaptured: 2026-01-03T09:00:00Z\norigin: "a call with the user"\n---\n\nNotes from the call.\n');
  w(root, 'atlas/domain/crossing.md', '---\nid: domain.crossing\nterm: crossing\ndefinition: One ferry trip.\nsources:\n  - ../sources/brief-notes.md\n---\n');
  w(root, 'compass/bugs/B-003-acme-sync.md', '---\nid: B-003\ntitle: Sync failed on the acme project\ntype: crash\nseverity: low\nstatus: resolved\naffects:\n  - core-cli.sync\nopened: 2026-07-05T00:00:00Z\n---\n\nFound running sync against acme.\n');
  w(root, 'compass/environment.md', '# Environment\n\nRemote: example.invalid/repo (private).\n');
}
