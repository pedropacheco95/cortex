/** Atomic tests for loops.quality-task Rules 2 to 5: `cortex tasks collect quality` and the name flags. */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collectQuality, parseLint } from '../../../src/tasks/collect-quality.js';
import { nameFlags } from '../../../src/tasks/name-flags.js';
import { tasksCollect } from '../../../src/tasks/collect.js';
import { storeInit } from '../../../src/store/init.js';
import { read, textTurn, toolTurn, scheduledTaskUserTurn, writeSessionTranscript } from '../../fixtures/sessions.js';
import { baseFm, cleanRepos, commitAll, git, gitInit, snapshot, tmpRepo, writeStoreFile } from '../../fixtures/store.js';

const TODAY = '2026-11-04';
const lint = (): { exit: number; errors: number; warnings: number } => ({ exit: 0, errors: 0, warnings: 0 });
const homes: string[] = [];

function repo(label = 'q'): { root: string; home: string } {
  const root = fs.realpathSync(tmpRepo(label));
  storeInit(root);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-q-home-'));
  homes.push(home);
  return { root, home };
}

function write(root: string, rel: string, text: string): void {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

/** A spec file with the given criteria, each `[id, body]`. */
function spec(root: string, area: string, name: string, extra: { status?: string; governs?: string[]; criteria?: [string, string][] } = {}): void {
  const id = `${area}.${name}`;
  const governs = (extra.governs ?? []).map((g) => `  - "${g}"`).join('\n');
  const criteria = (extra.criteria ?? []).map(([c, body]) => `### ${c}: Criterion\n\n- **Then** ${body}\n`).join('\n');
  write(root, `specflow/impl/${area}/${name}.spec.md`,
    `---\nid: ${id}\nstatus: ${extra.status ?? 'implemented'}\n${governs ? `governs:\n${governs}\n` : ''}---\n\n# ${name}\n\n## Acceptance Criteria\n\n${criteria}`);
}

function ported(root: string): void {
  write(root, 'specflow/INDEX.md', '# Index\n');
}

function setConfig(root: string, specflow: Record<string, unknown>): void {
  const p = path.join(root, 'cortex', 'cortex.json');
  fs.writeFileSync(p, JSON.stringify({ ...JSON.parse(fs.readFileSync(p, 'utf-8')), specflow }, null, 2) + '\n');
}

function measurement(root: string, date: string, lines: string[]): void {
  writeStoreFile(root, `history/measurements/${date}-quality.md`, baseFm({ permanence: 'stable' }), `## Reviewed specs\n${lines.join('\n')}\n\n## Store use\n`);
}

const collect = (fx: { root: string; home: string }) => collectQuality({ projectRoot: fx.root, home: fx.home, today: TODAY, lint });

function session(fx: { root: string; home: string }, id: string, date: string, lines: Record<string, unknown>[], root = fx.root): void {
  const f = writeSessionTranscript(fx.home, root, id, lines);
  const t = new Date(date);
  fs.utimesSync(f, t, t);
}

afterEach(() => {
  cleanRepos();
  for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
});

describe('Collect on an unported repository states it', () => {
  it('is not ported, with usage and store filled, exit 0', () => {
    const fx = repo();
    const out: string[] = [];
    expect(tasksCollect(['quality', '--json', '--today', TODAY], fx.root, { home: fx.home, stdout: (l) => out.push(l) })).toBe(0);
    const r = JSON.parse(out.join('\n'));
    expect(r).toMatchObject({ ported: false, lint: null, coverage: null, rotation: [], area: null });
    expect(r.usage.sessions).toBe(0);
    expect(r.store.filesPerFolder).toEqual({});
  });
});

describe('Lint that did not run does not read as a pass', () => {
  it('gives null counts and says so when the output is not lint JSON', () => {
    for (const stdout of ['', 'cortex specs: unknown command lint', '{"counts":{}}', '{}']) {
      expect(parseLint(2, stdout), stdout).toEqual({ exit: 2, errors: null, warnings: null, notRun: 'cortex specs lint gave no result' });
    }
  });

  it('keeps real counts, a failing lint included', () => {
    expect(parseLint(1, '{"findings":[],"counts":{"error":2,"warning":3}}')).toEqual({ exit: 1, errors: 2, warnings: 3 });
    expect(parseLint(0, '{"findings":[],"counts":{"error":0,"warning":0}}')).toEqual({ exit: 0, errors: 0, warnings: 0 });
  });
});

describe('Coverage comes from the index', () => {
  it('counts 4 criteria, 3 tagged, and names the fourth', () => {
    const fx = repo();
    ported(fx.root);
    spec(fx.root, 'bill', 'pay', { criteria: [['BILL-PAY-1', 'a'], ['BILL-PAY-2', 'b'], ['BILL-PAY-3', 'c'], ['BILL-PAY-4', 'd']] });
    write(fx.root, 'tests/a.test.ts', "it('[BILL-PAY-1] a', () => {});\nit('[BILL-PAY-2] b', () => {});\nit('[BILL-PAY-3] c', () => {});\nit('plain', () => {});\n");
    setConfig(fx.root, { tests: [{ runner: 'vitest', include: ['tests/**/*.test.ts'] }] });
    const c = collect(fx).coverage!;
    expect(c).toEqual({ criteria: 4, tagged: 3, unverified: ['BILL-PAY-4'], untaggedTests: 1 });
  });
});

describe('The rotation prefers the never-reviewed, then the oldest', () => {
  it('gives f, g, then a and the next two oldest', () => {
    const fx = repo();
    ported(fx.root);
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) spec(fx.root, 'x', n);
    measurement(fx.root, '2026-10-01', ['- x.a 2026-09-01', '- x.b 2026-09-02', '- x.c 2026-09-03']);
    measurement(fx.root, '2026-10-08', ['- x.d 2026-10-05', '- x.e 2026-10-06', '- x.a 2026-08-01']);
    expect(collect(fx).rotation).toEqual(['x.f', 'x.g', 'x.a', 'x.b', 'x.c']);
  });

  it('takes the newest date a spec has across measurements', () => {
    const fx = repo();
    ported(fx.root);
    for (const n of ['a', 'b']) spec(fx.root, 'x', n);
    measurement(fx.root, '2026-10-01', ['- x.a 2026-09-01', '- x.b 2026-09-15']);
    measurement(fx.root, '2026-10-08', ['- x.a 2026-10-01']);
    expect(collect(fx).rotation).toEqual(['x.b', 'x.a']);
  });
});

describe('A drifted spec wins a tie', () => {
  it('puts c before b', () => {
    const fx = repo();
    gitInit(fx.root);
    ported(fx.root);
    spec(fx.root, 'x', 'b', { governs: ['src/b.ts'] });
    spec(fx.root, 'x', 'c', { governs: ['src/c.ts'] });
    write(fx.root, 'src/b.ts', '1\n');
    write(fx.root, 'src/c.ts', '1\n');
    commitAll(fx.root, 'init', '2026-10-01T12:00:00');
    write(fx.root, 'src/c.ts', '2\n');
    commitAll(fx.root, 'later', '2026-10-05T12:00:00');
    expect(collect(fx).rotation).toEqual(['x.c', 'x.b']);
  });
});

describe('Retired specs are not reviewed', () => {
  it('leaves it out', () => {
    const fx = repo();
    ported(fx.root);
    spec(fx.root, 'x', 'live');
    spec(fx.root, 'x', 'old', { status: 'retired' });
    expect(collect(fx).rotation).toEqual(['x.live']);
  });
});

describe('Usage counts come from the week\'s sessions', () => {
  it('counts one session, two reads, one readback', () => {
    const fx = repo();
    const lines = [
      toolTurn(read(path.join(fx.root, 'cortex/world/terms/a.md')), read(path.join(fx.root, 'cortex/MAP.md'))),
      textTurn('assistant', 'Filing: x → y (origin: z)'),
    ];
    session(fx, 'week', '2026-11-02T10:00:00Z', lines);
    session(fx, 'sched', '2026-11-02T10:00:00Z', [scheduledTaskUserTurn(), ...lines]);
    session(fx, 'old', '2026-10-25T10:00:00Z', lines);
    expect(collect(fx).usage).toMatchObject({ sessions: 1, cortexReads: 2, readbacks: 1 });
  });
});

describe('Digests are counted', () => {
  it('counts list items in the window only', () => {
    const fx = repo();
    const digest = '## Filed\n- a → b\n- c → d\n\n## Already there\n- e → f\n- g → h\n- i → j\n\n## Skipped\n- k: l\n';
    writeStoreFile(fx.root, 'history/sources/2026-11-02-session-a.md', baseFm({ permanence: 'stable' }), digest);
    writeStoreFile(fx.root, 'history/sources/2026-10-20-session-b.md', baseFm({ permanence: 'stable' }), digest);
    expect(collect(fx).usage).toMatchObject({ digests: 1, filed: 2, alreadyThere: 3, skipped: 1 });
  });
});

describe('Readback sessions are counted once each', () => {
  it('counts three readbacks in one session', () => {
    const fx = repo();
    session(fx, 'many', '2026-11-02T10:00:00Z', [textTurn('assistant', 'Filing: a\nUpdated: b\nProposed: c')]);
    session(fx, 'none', '2026-11-02T10:00:00Z', [textTurn('assistant', 'nothing filed')]);
    expect(collect(fx).usage).toMatchObject({ readbacks: 3, sessionsWithReadback: 1 });
  });
});

describe('A worktree read counts as a store read', () => {
  it('counts the worktree read and clears the file from filesNeverRead', () => {
    const fx = repo();
    gitInit(fx.root);
    writeStoreFile(fx.root, 'world/terms/a.md', baseFm());
    writeStoreFile(fx.root, 'world/terms/b.md', baseFm());
    commitAll(fx.root, 'init');
    const wt = path.join(fs.realpathSync(tmpRepo('wt')), 'linked');
    git(fx.root, ['worktree', 'add', '-q', wt]);
    session(fx, 's', '2026-11-02T10:00:00Z', [toolTurn(read(path.join(wt, 'cortex/world/terms/a.md')), read(path.join(fx.root, 'src/x.ts')))]);
    const r = collect(fx);
    expect(r.usage.cortexReads).toBe(1);
    expect(r.store.filesNeverRead).toBe(1);
  });
});

describe('Store shape is counted per folder', () => {
  it('keys by folder, absent when empty', () => {
    const fx = repo();
    writeStoreFile(fx.root, 'world/people/a.md', baseFm());
    writeStoreFile(fx.root, 'world/people/b.md', baseFm());
    writeStoreFile(fx.root, 'code/hooks/c.md', baseFm());
    writeStoreFile(fx.root, 'now/d.md', baseFm());
    writeStoreFile(fx.root, 'history/changes/2026-11-01-e.md', { ...baseFm(), verified: 'bad' });
    const s = collect(fx).store;
    expect(s.filesPerFolder).toEqual({ code: 1, 'world/people': 2, 'history/changes': 1, now: 1 });
    expect(s.filesWithoutVerified).toBe(1);
  });
});

describe('Area and test command are reported', () => {
  it('gives the area and the command, and null without the key', () => {
    const fx = repo();
    ported(fx.root);
    spec(fx.root, 'billing', 'refunds');
    expect(collect(fx).testCommand).toBeNull();
    setConfig(fx.root, { testCommand: 'pnpm test' });
    const r = collect(fx);
    expect(r.area).toBe('billing');
    expect(r.testCommand).toBe('pnpm test');
  });
});

describe('Collect writes nothing', () => {
  it('leaves the project byte-identical', () => {
    const fx = repo();
    ported(fx.root);
    spec(fx.root, 'x', 'a');
    const before = snapshot(fx.root);
    collect(fx);
    expect(snapshot(fx.root)).toEqual(before);
  });
});

function flagsRepo(): { root: string; dir: string; sha: string } {
  const { root } = repo('flags');
  gitInit(root);
  setConfig(root, { tests: [{ runner: 'pytest', include: ['tests/**'] }] });
  spec(root, 'api', 'users', { criteria: [['API-USERS-1', 'the handler in users.py answers']] });
  for (const f of ['src/auth/session_store.py', 'src/api/users.py', 'src/db.py', 'tests/test_a.py', 'README.md']) write(root, f, 'x = 1\n');
  commitAll(root, 'init');
  const sha = git(root, ['rev-parse', 'HEAD']).trim();
  const dir = path.join(fs.realpathSync(tmpRepo('flagwt')), 'wt');
  git(root, ['worktree', 'add', '-q', '--detach', dir, 'HEAD']);
  return { root, dir, sha };
}

describe('A file no criterion names is flagged', () => {
  it('flags the unnamed one and names the other with its criterion', () => {
    const { root, dir, sha } = flagsRepo();
    for (const f of ['src/auth/session_store.py', 'src/api/users.py', 'tests/test_a.py', 'README.md']) write(dir, f, 'x = 2\n');
    const r = nameFlags({ projectRoot: root, dir, base: sha });
    expect(r.governed).toEqual(['src/api/users.py', 'src/auth/session_store.py']);
    expect(r.flagged).toEqual(['src/auth/session_store.py']);
    expect(r.named).toEqual([{ file: 'src/api/users.py', by: ['API-USERS-1'] }]);
  });

  it('skips what the job itself deletes', () => {
    const { root, dir, sha } = flagsRepo();
    fs.rmSync(path.join(dir, 'specflow'), { recursive: true, force: true });
    fs.rmSync(path.join(dir, 'cortex'), { recursive: true, force: true });
    expect(nameFlags({ projectRoot: root, dir, base: sha }).governed).toEqual([]);
  });
});

describe('A tagged test naming the file clears the flag', () => {
  it('is not flagged', () => {
    const { root, dir, sha } = flagsRepo();
    write(root, 'tests/test_b.py', '@pytest.mark.criterion("API-USERS-1")\ndef test_x():\n    assert session_store\n');
    write(dir, 'src/auth/session_store.py', 'x = 2\n');
    expect(nameFlags({ projectRoot: root, dir, base: sha }).flagged).toEqual([]);
  });
});

describe('A short stem is not a token', () => {
  it('flags src/db.py when the block has only the word db', () => {
    const { root, dir, sha } = flagsRepo();
    spec(root, 'api', 'store', { criteria: [['API-STORE-1', 'the db answers']] });
    write(dir, 'src/db.py', 'x = 2\n');
    expect(nameFlags({ projectRoot: root, dir, base: sha }).flagged).toEqual(['src/db.py']);
  });
});

describe('Untracked files count as changed', () => {
  it('is in governed', () => {
    const { root, dir, sha } = flagsRepo();
    write(dir, 'src/new_thing.ts', 'export {};\n');
    expect(nameFlags({ projectRoot: root, dir, base: sha }).governed).toContain('src/new_thing.ts');
  });
});

describe('collect quality --flags', () => {
  it('needs --base, and prints the JSON shape', () => {
    const { root, dir, sha } = flagsRepo();
    const out: string[] = [];
    const io = { home: root, stdout: (l: string) => out.push(l), stderr: () => undefined };
    fs.writeFileSync(path.join(root, 'cortex', 'cortex.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(root, 'cortex', 'cortex.json'), 'utf-8')) }));
    expect(tasksCollect(['quality', '--flags', dir], root, io)).toBe(2);
    expect(tasksCollect(['quality', '--flags', dir, '--base', sha, '--json'], root, io)).toBe(0);
    expect(Object.keys(JSON.parse(out.join('\n'))).sort()).toEqual(['base', 'flagged', 'governed', 'named']);
  });
});

describe('The job leaves no trace (journey)', () => {
  function runJob(root: string, stubFails: boolean): void {
    const scratch = fs.realpathSync(tmpRepo('job'));
    const dir = path.join(scratch, 'cortex-quality-2026-11-04', 'ticket');
    try {
      git(root, ['worktree', 'add', '-q', '--detach', dir, 'HEAD']);
      for (const p of ['specflow', '.specflow', 'cortex', '.claude', 'CLAUDE.md', 'AGENTS.md']) fs.rmSync(path.join(dir, p), { recursive: true, force: true });
      write(dir, 'src/api/users.py', 'x = 3\n'); // the stub agent
      if (stubFails) throw new Error('stub failed midway');
      nameFlags({ projectRoot: root, dir, base: git(root, ['rev-parse', 'HEAD']).trim() });
    } catch {
      // Step (e) runs after a failure too.
    } finally {
      git(root, ['worktree', 'remove', '--force', dir]);
      git(root, ['worktree', 'prune']);
    }
  }

  it.each([[false], [true]])('stubFails=%s: only the main checkout, no new branch, no change', (stubFails) => {
    const { root, dir } = flagsRepo();
    git(root, ['worktree', 'remove', '--force', dir]);
    const branches = git(root, ['branch', '--format=%(refname)']);
    runJob(root, stubFails);
    expect(git(root, ['worktree', 'list']).trim().split('\n')).toHaveLength(1);
    expect(git(root, ['branch', '--format=%(refname)'])).toBe(branches);
    expect(git(root, ['status', '--porcelain']).trim()).toBe('');
  });
});
