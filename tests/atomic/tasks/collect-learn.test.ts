/**
 * Atomic tests for loops.learn-task Rules 2, 3, 4: which sessions are listed,
 * how they are condensed, and what redaction removes.
 *
 * FIXTURES ONLY: a fake home and tmp repositories.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { LEARN_MAX_SESSIONS, collectLearn } from '../../../src/tasks/collect-learn.js';
import { CONDENSE_PART_CHARS, condenseSession } from '../../../src/sessions/condense.js';
import { parseSessionJsonl, projectSlug } from '../../../src/sessions/read.js';
import { tasksCollect } from '../../../src/tasks/collect.js';
import {
  editTool, rawAssistantTurn, scheduledTaskUserTurn, skillBaseDirUserTurn, textTurn, toolResultTurn, writeSessionTranscript,
} from '../../fixtures/sessions.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { acceptedProject, unacceptedProject } from '../../fixtures/task-store.js';
import { snapshot } from '../../fixtures/store.js';

const NOW = new Date('2026-11-04T12:00:00Z');
const TODAY = '2026-11-04';
const dirs: string[] = [];
const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 3_600_000);

function fixture(): { root: string; home: string; tmp: string } {
  const root = fs.realpathSync(makeTmpDir('learn-root'));
  const home = makeTmpDir('learn-home');
  const tmp = makeTmpDir('learn-tmp');
  dirs.push(root, home, tmp);
  acceptedProject(root);
  return { root, home, tmp };
}

function session(home: string, root: string, id: string, modified: Date, lines: Record<string, unknown>[] = [textTurn('user', 'hello')]): void {
  const file = writeSessionTranscript(home, root, id, lines);
  fs.utimesSync(file, modified, modified);
}

function collect(fx: { root: string; home: string; tmp: string }, extra: { all?: boolean } = {}) {
  return collectLearn({ projectRoot: fx.root, home: fx.home, now: NOW, today: TODAY, tmpDir: fx.tmp, ...extra });
}

const ids = (r: { sessions: { id: string }[] }): string[] => r.sessions.map((s) => s.id);

afterEach(() => {
  for (const d of dirs.splice(0)) cleanTmp(d);
});

describe('Collect lists only unmined, finished, recent sessions', () => {
  it('holds exactly a; with --all, a and d', () => {
    const fx = fixture();
    session(fx.home, fx.root, 'a', hoursAgo(72));
    session(fx.home, fx.root, 'b', hoursAgo(72));
    session(fx.home, fx.root, 'c', hoursAgo(0.5));
    session(fx.home, fx.root, 'd', hoursAgo(480));
    const sources = path.join(fx.root, 'cortex', 'history', 'sources');
    fs.mkdirSync(sources, { recursive: true });
    fs.writeFileSync(path.join(sources, '2026-11-01-session-b.md'), 'digest\n', 'utf-8');
    expect(ids(collect(fx))).toEqual(['a']);
    expect(ids(collect(fx, { all: true }))).toEqual(['d', 'a']);
  });
});

describe('Scheduled sessions are not mined', () => {
  it('lists neither the skill preamble nor the task tag', () => {
    const fx = fixture();
    session(fx.home, fx.root, 'skill', hoursAgo(72), [skillBaseDirUserTurn()]);
    session(fx.home, fx.root, 'task', hoursAgo(72), [scheduledTaskUserTurn()]);
    session(fx.home, fx.root, 'plain', hoursAgo(72));
    expect(ids(collect(fx))).toEqual(['plain']);
  });
});

describe('Worktree sessions are included, other projects are not', () => {
  it('lists the root and the worktree, not a slug sharing the prefix', () => {
    const fx = fixture();
    const git = (...args: string[]): void => {
      execFileSync('git', ['-C', fx.root, ...args], { stdio: 'ignore' });
    };
    git('init', '-q');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'x');
    const wt = fs.realpathSync(makeTmpDir('learn-wt-parent'));
    dirs.push(wt);
    const linked = path.join(wt, 'linked');
    git('worktree', 'add', '-q', linked);
    session(fx.home, fx.root, 'in-root', hoursAgo(72));
    session(fx.home, linked, 'in-worktree', hoursAgo(71));
    session(fx.home, `${fx.root}-other`, 'elsewhere', hoursAgo(70));
    expect(ids(collect(fx))).toEqual(['in-root', 'in-worktree']);
  });
});

describe('The per-run limit is honest', () => {
  it('lists the 10 oldest and says 3 remain', () => {
    const fx = fixture();
    for (let i = 0; i < 13; i++) session(fx.home, fx.root, `s${String(i).padStart(2, '0')}`, hoursAgo(100 - i));
    const r = collect(fx);
    expect(LEARN_MAX_SESSIONS).toBe(10);
    expect(ids(r)).toEqual(Array.from({ length: 10 }, (_, i) => `s${String(i).padStart(2, '0')}`));
    expect(r.remaining).toBe(3);
  });
});

describe('An out directory inside the project is refused', () => {
  it('exits 1 and writes nothing', () => {
    const fx = fixture();
    session(fx.home, fx.root, 'a', hoursAgo(72));
    const before = snapshot(fx.root);
    const code = tasksCollect(
      ['learn', '--out', path.join(fx.root, 'tmp'), '--now', NOW.toISOString()],
      fx.root,
      { home: fx.home, tmpDir: fx.tmp, stdout: () => undefined, stderr: () => undefined },
    );
    expect(code).toBe(1);
    expect(snapshot(fx.root)).toEqual(before);
  });
});

describe('Collect leaves the repository untouched', () => {
  it('changes nothing under the project or the transcripts, and writes under the default out dir', () => {
    const fx = fixture();
    session(fx.home, fx.root, 'a', hoursAgo(72));
    const root = snapshot(fx.root);
    const home = snapshot(fx.home);
    const r = collect(fx);
    expect(snapshot(fx.root)).toEqual(root);
    expect(snapshot(fx.home)).toEqual(home);
    expect(r.outDir).toBe(path.join(fx.tmp, 'cortex-learn', TODAY));
    expect(r.sessions[0]!.parts).toEqual([path.join(r.outDir, 'a.md')]);
    expect(fs.existsSync(r.sessions[0]!.parts[0]!)).toBe(true);
  });
});

describe('collect output and dispatch', () => {
  it('prints the JSON shape, exit 0 also when nothing qualifies', () => {
    const fx = fixture();
    const out: string[] = [];
    const code = tasksCollect(['learn', '--json', '--now', NOW.toISOString()], fx.root, {
      home: fx.home, tmpDir: fx.tmp, stdout: (l) => out.push(l), stderr: () => undefined,
    });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('\n'))).toMatchObject({ today: TODAY, remaining: 0, sessions: [] });
  });

  it('--today sets the horizon without moving the quiet window', () => {
    const fx = fixture();
    session(fx.home, fx.root, 'old', hoursAgo(480));
    const out: string[] = [];
    tasksCollect(['learn', '--json', '--now', NOW.toISOString(), '--today', '2026-10-20'], fx.root, {
      home: fx.home, tmpDir: fx.tmp, stdout: (l) => out.push(l), stderr: () => undefined,
    });
    expect(JSON.parse(out.join('\n')).sessions.map((s: { id: string }) => s.id)).toEqual(['old']);
  });

  it('Collect rejects an unknown task: exit 2 and the Rule 16 usage line', () => {
    const fx = fixture();
    const err: string[] = [];
    expect(tasksCollect(['daily'], fx.root, { stdout: () => undefined, stderr: (l) => err.push(l) })).toBe(2);
    expect(err).toEqual(['Usage: cortex tasks <collect|heartbeat> <learn|fresh|quality>']);
  });

  it('refuses on the 3.x roster with the Rule 13 message and writes nothing', () => {
    const root = makeTmpDir('learn-3x');
    dirs.push(root);
    unacceptedProject(root);
    const before = snapshot(root);
    const err: string[] = [];
    expect(tasksCollect(['learn'], root, { stdout: () => undefined, stderr: (l) => err.push(l) })).toBe(1);
    expect(err[0]).toContain('no 4.0 tasks until its store is accepted');
    expect(snapshot(root)).toEqual(before);
  });
});

function entries(lines: Record<string, unknown>[]) {
  return parseSessionJsonl(lines.map((l) => JSON.stringify(l)).join('\n')).entries;
}

describe('Condensing labels who spoke', () => {
  it('gives one block each, in transcript order, and drops tool results', () => {
    const text = condenseSession(entries([
      textTurn('user', 'please fix it'),
      textTurn('user', 'relay\n<cross-session-message from="x">peer says</cross-session-message>'),
      textTurn('user', '<system-reminder>injected</system-reminder>'),
      rawAssistantTurn([{ type: 'text', text: 'on it' }, { type: 'tool_use', id: 't', name: 'Edit', input: { file_path: 'a.ts' } }], '2026-11-01T00:00:00Z'),
      toolResultTurn('RESULT-TEXT'),
    ])).parts.join('\n');
    const at = ['USER ', 'PEER ', 'INJECTED ', 'ASSISTANT ', 'TOOL Edit a.ts'].map((s) => text.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const label of ['USER ', 'PEER ', 'INJECTED ', 'ASSISTANT ']) {
      expect(text.match(new RegExp(`^${label}`, 'gm'))).toHaveLength(1);
    }
    expect(text).not.toContain('RESULT-TEXT');
  });

  it('gives - for a missing timestamp', () => {
    const { timestamp: _t, ...noStamp } = textTurn('user', 'hi') as Record<string, unknown>;
    expect(condenseSession(entries([noStamp])).parts[0]).toContain('USER -:\nhi');
  });

  it('a tool with no path or command is its bare name', () => {
    const turn = rawAssistantTurn([{ type: 'tool_use', id: 't', name: 'Grep', input: { pattern: 'x' } }]);
    expect(condenseSession(entries([turn])).parts[0]).toBe('TOOL Grep');
    expect(editTool('b.ts').name).toBe('Edit');
  });
});

describe('Long sessions split at an entry boundary', () => {
  it('makes three parts, none over the limit, no entry cut', () => {
    const body = 'x'.repeat(49_990);
    const turns = Array.from({ length: 9 }, (_, i) => textTurn('user', `${i}:${body}`));
    const { parts } = condenseSession(entries(turns));
    expect(CONDENSE_PART_CHARS).toBe(200_000);
    expect(parts).toHaveLength(3);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(200_000);
    const joined = parts.join('\n\n');
    for (let i = 0; i < 9; i++) expect(joined).toContain(`${i}:${body}`);
  });

  it('collect names split files <id>-part<n>.md', () => {
    const fx = fixture();
    const body = 'y'.repeat(120_000);
    session(fx.home, fx.root, 'big', hoursAgo(72), [textTurn('user', body), textTurn('user', body)]);
    const r = collect(fx);
    expect(r.sessions[0]!.parts.map((p) => path.basename(p))).toEqual(['big-part1.md', 'big-part2.md']);
  });
});

describe('Secrets are redacted before writing', () => {
  it('holds the labels, neither original, and counts 2', () => {
    const fx = fixture();
    const token = `ghp_${'a'.repeat(36)}`;
    session(fx.home, fx.root, 'sec', hoursAgo(72), [textTurn('user', `use ${token} and password: hunter2 here`)]);
    const r = collect(fx);
    const written = fs.readFileSync(r.sessions[0]!.parts[0]!, 'utf-8');
    expect(written).toContain('[redacted:github-token]');
    expect(written).toContain('[redacted:credential]');
    expect(written).not.toContain(token);
    expect(written).not.toContain('hunter2');
    expect(r.sessions[0]!.redactions).toBe(2);
  });

  it('redacts each listed kind, tool lines included', () => {
    const samples: [string, string][] = [
      ['private-key', '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----'],
      ['api-key', `sk-${'b'.repeat(30)}`],
      ['aws-key', 'AKIAABCDEFGHIJKLMNOP'],
      ['slack-token', 'xoxb-1234567890-abcdef'],
      ['bearer', 'Bearer abcdefgh12345678'],
    ];
    for (const [label, secret] of samples) {
      const c = condenseSession(entries([textTurn('user', `value ${secret} end`)]));
      expect(c.parts[0], label).toContain(`[redacted:${label}]`);
      expect(c.parts[0], label).not.toContain(secret);
    }
    const turn = rawAssistantTurn([{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'curl -u token=abc123 x' } }]);
    expect(condenseSession(entries([turn])).parts[0]).toBe('TOOL Bash curl -u [redacted:credential] x');
  });

  it('a credential around a token counts once', () => {
    const c = condenseSession(entries([textTurn('user', `token: ghp_${'c'.repeat(36)}`)]));
    expect(c.redactions).toBe(1);
  });
});

describe('fixtures', () => {
  it('projectSlug keeps the slug of a sibling distinct', () => {
    expect(projectSlug('/a/b')).not.toBe(projectSlug('/a/b-other'));
  });
});
