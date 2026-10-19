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
  w(root, 'pulse/state/hygiene.json', '{}\n');
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

/** Bytes for a binary raw (a NUL and a 0xff byte, invalid UTF-8). */
export const BINARY = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0xfe, 0x0a]);

function wb(root: string, rel: string, data: Buffer | string): void {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}

/**
 * A foreign 3.3 store with the shapes real projects hold that this
 * repository's store did not (store.migrate amendment 2026-10-19): scoped
 * insight, junk files, non-markdown and multi-file raws, an unknown archive
 * folder, bug statuses outside the 3.x enum, unpromoted pulse work, and a
 * 3.x config without `visibility`. `.gitignore` mirrors a 3.x project's, so
 * committing leaves pulse/ and raw sources untracked.
 */
export function writeForeignStore(root: string): void {
  wb(root, '.gitignore', '.cortex/atlas/sources/\n.cortex/pulse/\n.cortex/constellation.json\n.cortex/archive/documents/*/source.*\n');
  w(root, 'cortex.config.json', JSON.stringify({ schemaVersion: '3.3', hooks: { preRead: true }, loop: { enabled: false } }, null, 2));
  w(root, '_index.md', '# Index\n');
  wb(root, '.cortex/.DS_Store', BINARY);
  w(root, 'compass/._x', 'resource fork\n');
  fs.mkdirSync(path.join(root, '.cortex/compass/rules 2'), { recursive: true });
  w(root, 'compass/environment.md', '# Environment\n\nRemote: example.invalid/repo (private).\n');
  w(root, 'compass/bugs/B-101-totals-rounded-twice.md', "---\nid: B-101\ntitle: Totals rounded twice\ntype: wrong-output\nseverity: medium\nstatus: fixed-verified\ndiscovered: '2026-09-01'\nspecs:\n  - billing.totals\n---\n\nRounded at line and at sum.\n");
  w(root, 'compass/bugs/B-102-export-drops-links.md', "---\nid: B-102\ntitle: Export drops links\ntype: missing-criterion\nseverity: high\nstatus: fixed-pending-deploy\ndiscovered: '2026-09-02'\narea: export service (writer)\naffects:\n  - exporter.writer\n---\n\nLinks without a mapping are skipped.\n");
  w(root, 'compass/bugs/B-103-stale-cache.md', "---\nid: B-103\ntitle: Stale cache after deploy\ntype: crash\nseverity: low\nstatus: open-worked-around\ndiscovered: '2026-09-03'\n---\n\nRestart clears it.\n");
  w(root, 'atlas/domain/port.md', '---\nid: domain.port\nterm: port\ndefinition: A harbour the ferry calls at.\n---\n');
  w(root, 'atlas/sources/brochure.dc.html', '<html><body>Brochure</body></html>\n');
  w(root, 'archive/documents/contract/metadata.yaml', 'id: archive.contract\nkind: contract\ningested_at: 2026-02-01T10:00:00Z\n');
  wb(root, '.cortex/archive/documents/contract/source.pdf', BINARY);
  wb(root, '.cortex/archive/documents/contract/source.scan.pdf', Buffer.concat([BINARY, Buffer.from([1])]));
  w(root, 'archive/documents/contract/source/log.txt', 'log line\n');
  w(root, 'archive/documents/contract/source-email.md', 'The email.\n');
  w(root, 'archive/documents/contract/extracted/summary.md', '# Summary\n\nThe contract sets two dates.\n');
  wb(root, '.cortex/archive/documents/policy/source.docx', BINARY);
  w(root, 'archive/documents/policy/extracted/summary.md', '# Summary\n\nThe policy.\n');
  w(root, 'archive/tooling/probe/README.md', '# Probe\n\nRuns the export twice.\n');
  w(root, 'archive/tooling/probe/probe.ts', 'export const probe = 1;\n');
  w(root, 'insight/scope-registry.yaml', 'scopes:\n  api:\n    path: api\n  web:\n    path: web\n');
  w(root, 'insight/concepts/fare.md', '# Fare\n\nThe price a passenger pays for one crossing.\n');
  w(root, 'insight/scopes/api/anatomy/src/a.ts.md', 'a\n');
  w(root, 'insight/scopes/api/concepts/crossing.md', '# Crossing\n\nOne trip between two ports.\n');
  w(root, 'insight/scopes/api/graph.json', '{}\n');
  w(root, 'insight/scopes/web/anatomy 2/src/b.ts.md', 'b\n');
  w(root, 'pulse/reports/loop.md', '# Loop report\n\n## S-901: one\n\nFirst.\n');
  w(root, 'pulse/onboarding-scratch/x/RULES.md', '# Service rules\n\n1. Never retry a write blindly.\n');
  w(root, 'pulse/onboarding-scratch/x/notes.md', 'scratch notes\n');
  w(root, 'pulse/onboarding-scratch/x/tests/t.py', 'def test_x():\n    assert True\n');
  w(root, 'pulse/state/s.json', '{}\n');
  w(root, 'pulse/extraction/e.json', '{}\n');
  w(root, 'pulse/dismissed.md', '---\nkind: pulse-dismissed\n---\n\n# Dismissed suggestions\n\n## S-050: drop the cache\n\n**Dismissed:** 2026-09-01T00:00:00Z\nThe cache is load-bearing.\n');
}

/** The 3.x system around a store: settings hooks, skill bundles, scheduled-task payloads under `home`. */
export function writeLegacySystem(root: string, home: string, markerFor: (dir: string) => string): void {
  const hook = (cmd: string) => ({ type: 'command', command: cmd });
  wb(root, '.claude/settings.json', JSON.stringify({
    permissions: { allow: ['Bash(ls:*)'] },
    hooks: {
      SessionStart: [{ hooks: [hook('cortex hook session-start')] }],
      PreToolUse: [{ matcher: 'Write|Edit', hooks: [hook('cortex hook pre-write')] }, { matcher: 'Read', hooks: [hook('cortex hook pre-read')] }],
      PostToolUse: [{ matcher: 'Write|Edit', hooks: [hook('cortex hook post-write'), hook('./scripts/format.sh')] }, { matcher: 'Read', hooks: [hook('cortex hook post-read')] }],
    },
  }, null, 2) + '\n');
  wb(root, '.claude/skills/cortex-loop/SKILL.md', '---\nname: cortex-loop\n---\nLoop.\n');
  wb(root, '.claude/skills/cortex-loop/.cortex-installed.json', JSON.stringify({ sha256: markerFor(path.join(root, '.claude/skills/cortex-loop')) }));
  wb(root, '.claude/skills/cortex-archive-ingest/SKILL.md', '---\nname: cortex-archive-ingest\n---\nIngest.\n');
  wb(root, '.claude/skills/cortex-loop-hygiene/SKILL.md', '---\nname: cortex-loop-hygiene\n---\nHygiene.\n');
  wb(root, '.claude/skills/cortex-loop-hygiene/.cortex-installed.json', JSON.stringify({ sha256: 'f'.repeat(64) }));
  wb(root, '.claude/skills/specflow-bugs/SKILL.md', '---\nname: specflow-bugs\n---\nFile bugs in .cortex/compass/bugs/.\n');
  wb(root, '.claude/skills/own-skill/SKILL.md', '---\nname: own-skill\n---\nUnrelated.\n');
  const task = (name: string, marker: string | null) => wb(home, `.claude/scheduled-tasks/${name}/SKILL.md`, `---\nname: ${name}\n---\n${marker ? `<!-- cortex-project-root: ${marker} -->\n` : ''}Run.\n`);
  task('demo-daily', path.resolve(root));
  task('demo-weekly-quality', path.resolve(root));
  task('other-daily', '/somewhere/else');
  task('demo-tickets', null);
}
