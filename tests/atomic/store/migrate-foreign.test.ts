/**
 * Atomic tests — `store.migrate`, foreign-store amendment (2026-10-19):
 * Rules 1–3, 6, 8, 11, 12 and 15–19, one per acceptance criterion.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { migrateCli } from '../../../src/store/migrate/cli.js';
import { readLegacyStore } from '../../../src/store/migrate/entries.js';
import { parseFile } from '../../../src/store/frontmatter.js';
import { validateStore } from '../../../src/store/validate.js';
import { hashDirectoryContent, INSTALLED_MARKER_FILENAME } from '../../../src/cli/scaffold.js';
import { tmpRepo, cleanRepos, gitInit, commitAll, git } from '../../fixtures/store.js';
import { writeLegacyStore, writeForeignStore, writeLegacySystem, BINARY } from '../../fixtures/legacy-store.js';

afterEach(cleanRepos);

const TODAY = '2026-10-19';

function foreign(label: string): string {
  const root = tmpRepo(label);
  gitInit(root);
  writeForeignStore(root);
  commitAll(root, '3.3 store');
  return root;
}

async function run(root: string, args: string[], home?: string): Promise<{ code: number; text: string }> {
  const lines: string[] = [];
  const code = await migrateCli([...args, '--today', TODAY], root, { stdout: (l) => lines.push(l), stderr: (l) => lines.push(l), home });
  return { code, text: lines.join('\n') };
}

const row = (text: string, ref: string): string => text.split('\n').find((l) => l.startsWith(`| ${ref} |`)) ?? '';
const sha = (root: string) => git(root, ['rev-parse', '--short=7', 'HEAD']).trim();
const fm = (root: string, rel: string) => parseFile(fs.readFileSync(path.join(root, 'cortex', rel), 'utf8')).frontmatter!;
const section = (text: string, heading: string): string => {
  const i = text.indexOf(`## ${heading}`);
  if (i < 0) return '';
  const j = text.indexOf('\n## ', i + 3);
  return text.slice(i, j < 0 ? undefined : j);
};

/** Every file under `dir` as bytes. */
function bytes(dir: string): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '.git') walk(p); } else out[path.relative(dir, p)] = fs.readFileSync(p);
    }
  };
  walk(dir);
  return out;
}

/** A plan that decides every unpromoted entry of the foreign fixture (the AC's plan). */
function decidingPlan(root: string): string {
  fs.writeFileSync(path.join(root, 'd.md'), '## S-901: one\n\nFirst.\n\n## S-902: two\n\nSecond.\n');
  const plan = path.join(root, 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({
    'pulse/onboarding-scratch/**': 'retired',
    'pulse/onboarding-scratch/x/RULES.md': 'world/rules/x-service.md',
    'pulse/onboarding-scratch/x/tests/t.py': 'history/sources/raw/onboarding/t.py',
    'pulse/reports/loop.md': { target: 'now/proposals.md', file: path.join(root, 'd.md') },
    'pulse/dismissed.md': 'world/decisions/dismissed-proposals.md',
    'archive/tooling/**': 'retired',
    'insight/concepts/fare.md': 'world/terms/fare.md',
  }));
  return plan;
}

describe('store.migrate foreign stores (amendment 2026-10-19)', () => {
  it('drops scoped insight by decision, grouped, with the scope count', async () => {
    const root = foreign('scoped');
    const { text } = await run(root, []);
    const legacy = readLegacyStore(root)!;
    const scoped = legacy.entries.filter((e) => e.ref.startsWith('insight/scopes/'));
    expect(scoped).toHaveLength(4);
    expect(scoped.every((e) => e.row === 'dropped')).toBe(true);
    expect(scoped.map((e) => e.group).sort()).toEqual(['anatomy', 'anatomy', 'concepts', 'graph']);
    expect(text).toContain('scopes: 2');
    expect(row(text, 'insight/scope-registry.yaml')).toContain('machinery or regenerable');
    expect(text).toMatch(/git rm -r -q --ignore-unmatch [^`]*\.cortex\/insight\/scopes[^`]* && rm -rf /);
  });

  it('retires junk files and produces nothing for empty folders', async () => {
    const root = foreign('junk');
    const { text } = await run(root, []);
    expect(row(text, '.DS_Store')).toContain('not a store file');
    expect(row(text, 'compass/._x')).toContain('not a store file');
    expect(readLegacyStore(root)!.entries.some((e) => e.ref.startsWith('compass/rules 2'))).toBe(false);
  });

  it('migrates a non-markdown atlas source with its raw, byte for byte', async () => {
    const root = foreign('html');
    const { code, text } = await run(root, ['--plan', decidingPlan(root), '--apply']);
    expect(code, text).toBe(0);
    expect(row(text, 'atlas/sources/brochure.dc.html')).toMatch(/history\/sources\/2026-10-19-brochure\.md \| review/);
    expect(fs.readFileSync(path.join(root, 'cortex/history/sources/raw/2026-10-19-brochure.dc.html'))).toEqual(fs.readFileSync(path.join(root, '.cortex/atlas/sources/brochure.dc.html')));
  });

  it('copies every raw of a document, byte for byte, without collisions', async () => {
    const root = foreign('raws');
    const { code, text } = await run(root, ['--plan', decidingPlan(root), '--apply']);
    expect(code, text).toBe(0);
    const raw = path.join(root, 'cortex/history/sources/raw/2026-02-01-contract');
    for (const f of ['source.pdf', 'source.scan.pdf', 'source/log.txt', 'source-email.md']) {
      expect(fs.readFileSync(path.join(raw, f)), f).toEqual(fs.readFileSync(path.join(root, '.cortex/archive/documents/contract', f)));
    }
    expect(fs.readFileSync(path.join(raw, 'source.pdf'))).toEqual(BINARY);
    expect(fm(root, 'history/sources/2026-02-01-contract.md')['raw']).toBe('history/sources/raw/2026-02-01-contract/');
    expect(text).toMatch(/not written: 0/);
  });

  it('a re-apply with binary raws is byte-identical', async () => {
    const root = foreign('rerun');
    const plan = decidingPlan(root);
    expect((await run(root, ['--plan', plan, '--apply'])).code).toBe(0);
    const first = bytes(path.join(root, 'cortex'));
    const again = await run(root, ['--plan', plan, '--apply']);
    expect(again.code, again.text).toBe(0);
    expect(bytes(path.join(root, 'cortex'))).toEqual(first);
  });

  it('single-raw sources keep their path', async () => {
    const root = tmpRepo('single');
    gitInit(root);
    writeLegacyStore(root);
    commitAll(root, '3.x store');
    expect((await run(root, ['--apply'])).code).toBe(0);
    expect(fs.existsSync(path.join(root, 'cortex/history/sources/raw/2026-01-02-brief.md'))).toBe(true);
  });

  it('maps bug statuses beyond the 3.x enum', async () => {
    const root = foreign('statuses');
    const { text } = await run(root, []);
    expect(row(text, 'compass/bugs/B-101-totals-rounded-twice.md')).toContain('history/incidents/2026-09-01-totals-rounded-twice.md');
    expect(row(text, 'compass/bugs/B-102-export-drops-links.md')).toMatch(/code\/exporter\/export-drops-links\.md \| review/);
    expect(row(text, 'compass/bugs/B-103-stale-cache.md')).toMatch(/code\/repo\/stale-cache\.md \| review/);
    const review = section(text, 'Review');
    expect(review).toContain('3.x status fixed-pending-deploy');
    expect(review).toContain('3.x status open-worked-around');
  });

  it('takes the area from specs when a bug has no affects', async () => {
    const root = foreign('area');
    fs.writeFileSync(path.join(root, '.cortex/compass/bugs/B-104-late.md'), "---\nid: B-104\ntitle: Late\ntype: crash\nseverity: low\nstatus: open\ndiscovered: '2026-09-04'\nspecs:\n  - billing.late\n---\n\nLate.\n");
    const { text } = await run(root, []);
    expect(row(text, 'compass/bugs/B-104-late.md')).toContain('code/billing/late.md');
  });

  it('never dates a path 0000', async () => {
    const root = foreign('nodate');
    const { text } = await run(root, []);
    expect(text).not.toContain('0000-00-00');
    expect(row(text, 'archive/documents/policy')).toMatch(/history\/sources\/\d{4}-\d{2}-\d{2}-policy\.md/);
  });

  it('retires an unknown archive folder as undecided, and copies nothing from it', async () => {
    const root = foreign('tooling');
    const { text } = await run(root, []);
    for (const f of ['archive/tooling/probe/README.md', 'archive/tooling/probe/probe.ts']) {
      expect(row(text, f)).toMatch(/not a store folder.*\| review/);
    }
    expect(section(text, 'Undecided')).toContain('archive/tooling/');
  });

  it('refuses apply while unpromoted work is undecided; regenerable never blocks', async () => {
    const root = foreign('undecided');
    const { code, text } = await run(root, ['--apply']);
    expect(code).toBe(1);
    const und = section(text, 'Undecided');
    for (const f of ['pulse/reports/loop.md', 'pulse/onboarding-scratch/x/', 'pulse/dismissed.md', 'archive/tooling/']) expect(und).toContain(f);
    expect(und).not.toContain('pulse/state');
    expect(und).not.toContain('pulse/extraction');
    expect(text).toMatch(/refusing --apply: \d+ undecided/);
    expect(fs.existsSync(path.join(root, 'cortex'))).toBe(false);
  });

  it('prints the no-loss lines', async () => {
    const root = foreign('noloss');
    const { text } = await run(root, []);
    expect(text).toMatch(/^tracked: \d+\/\d+ landed, decided: \d+, regenerable: \d+, undecided: 2$/m);
    expect(text).toMatch(/^untracked: 4\/11 landed, decided: 0, regenerable: 2, undecided: 5$/m);
  });

  it('a plan decides folders, rescues, digests and raws', async () => {
    const root = foreign('plan');
    const { code, text } = await run(root, ['--plan', decidingPlan(root), '--apply']);
    expect(code, text).toBe(0);
    expect(text).toMatch(/^tracked: .*undecided: 0$/m);
    expect(text).toMatch(/^untracked: .*undecided: 0$/m);
    expect(fs.existsSync(path.join(root, 'cortex/world/rules/x-service.md'))).toBe(true);
    expect(row(text, 'pulse/onboarding-scratch/x/notes.md')).toContain('retired by the plan file');
    expect(text).toContain('- `pulse/onboarding-scratch/**` decided 1 entr');
    expect(fs.readFileSync(path.join(root, 'cortex/history/sources/raw/onboarding/t.py'), 'utf8')).toBe('def test_x():\n    assert True\n');
    expect(section(text, 'Gitignored only')).toContain('pulse/onboarding-scratch/x/tests/t.py');
    const s = sha(root);
    const proposals = fs.readFileSync(path.join(root, 'cortex/now/proposals.md'), 'utf8');
    expect(proposals).toMatch(/## S-901: one\nuntil: 2026-11-18\nstatus: pending decision/);
    expect(proposals).toMatch(/## S-902: two\nuntil: 2026-11-18\nstatus: pending decision/);
    expect(fm(root, 'now/proposals.md')['origin']).toContain(`migrated:pulse/reports/loop.md@${s}`);
    expect(section(text, 'Digested')).toContain('pulse/reports/loop.md');
    expect(section(text, 'Pending decision')).toContain('S-902');
    expect(fm(root, 'world/terms/fare.md')['origin']).toEqual([`migrated:insight/concepts/fare.md@${s}`]);
    expect(validateStore(root, TODAY).findings.filter((f) => f.level === 'error')).toEqual([]);
  });

  it('refuses bad plans', async () => {
    const root = foreign('badplan');
    const plan = path.join(root, 'plan.json');
    const attempt = async (p: unknown, needle: string) => {
      fs.writeFileSync(plan, JSON.stringify(p));
      const r = await run(root, ['--plan', plan]);
      expect(r.code, needle).toBe(1);
      expect(r.text).toContain(needle);
    };
    await attempt({ 'pulse/onboarding-scratch/x/tests/t.py': 'code/repo/t.md' }, 'pulse/onboarding-scratch/x/tests/t.py');
    await attempt({ 'nope/**': 'retired' }, 'nope/**');
    fs.writeFileSync(path.join(root, 'fm.md'), '---\nabout: x\n---\nBody.\n');
    await attempt({ 'pulse/reports/loop.md': { target: 'now/loop.md', file: path.join(root, 'fm.md') } }, 'fm.md');
    await attempt({ 'pulse/reports/loop.md': { target: 'now/loop.md', file: path.join(root, 'missing.md') } }, 'missing.md');
  });

  it('lists concept definitions', async () => {
    const root = foreign('concepts');
    const { text } = await run(root, []);
    const c = section(text, 'Concept definitions (2)');
    expect(c).toContain('insight/concepts/fare.md: The price a passenger pays for one crossing.');
    expect(c).toContain('insight/scopes/api/concepts/crossing.md: One trip between two ports.');
  });

  it('treats dismissed memory with entries as unpromoted, a template as regenerable', async () => {
    const root = foreign('dismissed');
    expect(row((await run(root, [])).text, 'pulse/dismissed.md')).toContain('unpromoted work');
    const other = tmpRepo('dismissed-template');
    gitInit(other);
    writeLegacyStore(other);
    fs.writeFileSync(path.join(other, '.cortex/pulse/dismissed.md'), '---\nkind: pulse-dismissed\n---\n\n# Dismissed suggestions\n\nRejection memory: one entry per dismissed suggestion.\n\n(none yet)\n');
    commitAll(other, '3.x store');
    expect(row((await run(other, [])).text, 'pulse/dismissed.md')).toContain('machinery or regenerable');
  });

  it('checks unknown visibility as public, and --visibility sets it', async () => {
    const root = foreign('visibility');
    const dry = await run(root, []);
    expect(dry.code).toBe(0);
    expect(dry.text).toContain('repo: unknown (checked as public)');
    expect(section(dry.text, 'Visibility findings')).toContain('says "(private)"');
    const applied = await run(root, ['--visibility', 'public', '--plan', decidingPlan(root), '--apply']);
    expect(applied.code, applied.text).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'cortex/cortex.json'), 'utf8')).visibility.repo).toBe('public');
    expect(applied.text).toMatch(/\d+ visibility findings would be committed to a public \(or unknown-visibility\) repository; review them, or rerun with --redact <file>/);
  });

  it('the dry run names the packaged cortex-migrate skill', async () => {
    const root = foreign('skillpath');
    const { text } = await run(root, []);
    const m = /Agentic step: read (\S+\/skills\/cortex-migrate\/SKILL\.md)/.exec(text);
    expect(m).not.toBeNull();
    expect(fs.existsSync(m![1]!)).toBe(true);
  });

  it('accept retires the 3.x system around the store and deletes nothing', async () => {
    const root = foreign('accept');
    const home = tmpRepo('accept-home');
    writeLegacySystem(root, home, (dir) => hashDirectoryContent(dir, [INSTALLED_MARKER_FILENAME]));
    expect((await run(root, ['--plan', decidingPlan(root), '--apply'])).code).toBe(0);
    const before = { skills: Object.keys(bytes(path.join(root, '.claude/skills'))), tasks: bytes(path.join(home, '.claude/scheduled-tasks')), legacy: bytes(path.join(root, '.cortex')) };
    const { code, text } = await run(root, ['--accept'], home);
    expect(code, text).toBe(0);
    const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8'));
    expect(JSON.stringify(settings)).not.toContain('cortex hook');
    expect(settings.hooks.PostToolUse).toEqual([{ matcher: 'Write|Edit', hooks: [{ type: 'command', command: './scripts/format.sh' }] }]);
    expect(settings.hooks.SessionStart).toBeUndefined();
    expect(settings.permissions).toEqual({ allow: ['Bash(ls:*)'] });
    expect(fs.existsSync(path.join(root, '.claude/skills/cortex-remember/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.claude/skills/cortex-remember', INSTALLED_MARKER_FILENAME))).toBe(true);
    expect(fs.existsSync(path.join(root, '.claude/skills/cortex-migrate'))).toBe(false);
    expect(text).toMatch(/cortex-loop: unmodified/);
    expect(text).toMatch(/cortex-archive-ingest: modified or unmarked: check before removing/);
    expect(text).toMatch(/cortex-loop-hygiene: modified or unmarked: check before removing/);
    expect(text).toContain('demo-daily');
    expect(text).toContain('demo-weekly-quality');
    expect(text).not.toContain('other-daily');
    expect(text).not.toContain('demo-tickets');
    expect(text).toContain('project skills to adjust: 1');
    expect(text).toContain('- ref-skill/references/paths.md: .cortex/');
    for (const f of before.skills) expect(fs.existsSync(path.join(root, '.claude/skills', f)), f).toBe(true);
    expect(bytes(path.join(home, '.claude/scheduled-tasks'))).toEqual(before.tasks);
    expect(bytes(path.join(root, '.cortex'))).toEqual(before.legacy);
  });

  it('accept leaves a settings file without cortex hooks unwritten', async () => {
    const root = foreign('accept-nohooks');
    const home = tmpRepo('accept-nohooks-home');
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    const raw = '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"say done"}]}]}}';
    fs.writeFileSync(path.join(root, '.claude/settings.json'), raw);
    expect((await run(root, ['--plan', decidingPlan(root), '--apply'])).code).toBe(0);
    expect((await run(root, ['--accept'], home)).code).toBe(0);
    expect(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8')).toBe(raw);
  });
});

describe('store.migrate Rule 14 reaches rescued and digested text (amendment 2026-10-19)', () => {
  it('redacts a rescued unpromoted file, a digest body, and an edit on an unpromoted ref', async () => {
    const root = foreign('redact-rescue');
    fs.writeFileSync(path.join(root, '.cortex/pulse/onboarding-scratch/x/RULES.md'), '# Service rules\n\n1. Never retry an acme write blindly.\n2. Keep the (private) bucket.\n');
    const plan = decidingPlan(root);
    fs.writeFileSync(path.join(root, 'd.md'), '## S-901: one\n\nFirst, for acme.\n\n## S-902: two\n\nSecond.\n');
    const r = path.join(root, 'r.json');
    fs.writeFileSync(r, JSON.stringify({ replace: { acme: 'client-A' }, edits: { 'pulse/onboarding-scratch/x/RULES.md': [['(private)', '(tenant)']] } }));
    const { code, text } = await run(root, ['--plan', plan, '--redact', r, '--apply']);
    expect(code, text).toBe(0);
    const rules = fs.readFileSync(path.join(root, 'cortex/world/rules/x-service.md'), 'utf8');
    expect(rules).toContain('client-A');
    expect(rules).toContain('(tenant)');
    expect(rules).not.toContain('acme');
    const proposals = fs.readFileSync(path.join(root, 'cortex/now/proposals.md'), 'utf8');
    expect(proposals).toContain('First, for client-A.');
    expect(proposals).not.toContain('acme');
    const red = section(text, 'Redactions');
    expect(red).toContain('pulse/onboarding-scratch/x/RULES.md');
    expect(red).toContain('pulse/reports/loop.md');
  });

  it('rejects a proposal id that is already an alias of another file', async () => {
    const root = foreign('alias-collision');
    const plan = decidingPlan(root);
    fs.writeFileSync(path.join(root, 'd.md'), '## B-101: clash\n\nSame id as a bug.\n');
    const r = await run(root, ['--plan', plan]);
    expect(r.code).toBe(1);
    expect(r.text).toContain('B-101');
  });
});

describe('store.migrate Rule 4 amendments (2026-10-19, foreign stores)', () => {
  it('turns a session URL in a carried origin into session:, strips other URLs, and flags review', async () => {
    const root = foreign('origin-url');
    fs.writeFileSync(path.join(root, '.cortex/archive/documents/contract/metadata.yaml'), 'id: archive.contract\nkind: contract\ningested_at: 2026-02-01T10:00:00Z\norigin: "Claude Code session session_0198AbC (https://claude.ai/code/session_0198AbC) that ran the plan; mirror at https://example.org/a/b.exp (archived)"\n');
    commitAll(root, 'origin with urls');
    const { code, text } = await run(root, ['--plan', decidingPlan(root), '--apply']);
    expect(code, text).toBe(0);
    const origin = fm(root, 'history/sources/2026-02-01-contract.md')['origin'] as string[];
    expect(origin).toContain('session:session_0198AbC');
    const ext = origin.find((o) => o.startsWith('external:'))!;
    expect(ext).toBe('external:that ran the plan; mirror at (archived)');
    expect(origin.join(' ')).not.toContain('://');
    expect(row(text, 'archive/documents/contract')).toMatch(/\| review/);
    expect(section(text, 'Review')).toContain('origin URL stripped');
    expect(validateStore(root, TODAY).findings.filter((f) => f.level === 'error')).toEqual([]);
  });

  it('drops a stem alias that two migrated files would share, and lists it', async () => {
    const root = foreign('stems');
    fs.mkdirSync(path.join(root, '.cortex/pulse/onboarding-scratch/y'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex/pulse/onboarding-scratch/y/notes.md'), 'more notes\n');
    const plan = JSON.parse(fs.readFileSync(decidingPlan(root), 'utf8'));
    plan['pulse/onboarding-scratch/x/notes.md'] = 'code/repo/x-notes.md';
    plan['pulse/onboarding-scratch/y/notes.md'] = 'code/repo/y-notes.md';
    fs.writeFileSync(path.join(root, 'plan.json'), JSON.stringify(plan));
    const { code, text } = await run(root, ['--plan', path.join(root, 'plan.json'), '--apply']);
    expect(code, text).toBe(0);
    expect(fm(root, 'code/repo/x-notes.md')['aliases'] ?? []).not.toContain('notes');
    expect(fm(root, 'code/repo/y-notes.md')['aliases'] ?? []).not.toContain('notes');
    expect(fm(root, 'code/repo/x-notes.md')['origin']).toEqual([`migrated:pulse/onboarding-scratch/x/notes.md@${sha(root)}`]);
    expect(section(text, 'Dropped stem aliases (1)')).toContain('notes: code/repo/x-notes.md, code/repo/y-notes.md');
    expect(validateStore(root, TODAY).findings.filter((f) => f.check === 'check.aliases')).toEqual([]);
  });
});
