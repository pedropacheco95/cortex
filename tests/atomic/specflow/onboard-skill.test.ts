/**
 * Atomic tests — `specflow.onboard-skill`, one per acceptance criterion. The
 * skill is agentic; these pin its text.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { listSkillBundles } from '../../../src/cli/scaffold.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SKILL = path.join(ROOT, 'skills', 'specflow-onboard', 'SKILL.md');
const MIRROR = path.join(ROOT, '.claude', 'skills', 'specflow-onboard', 'SKILL.md');
const text = fs.existsSync(SKILL) ? fs.readFileSync(SKILL, 'utf8') : '';
const lines = text.split('\n');
const port = text.slice(text.indexOf('## Port mode'), text.indexOf('## Onboard mode'));
const onboard = text.slice(text.indexOf('## Onboard mode'));
const para = (start: string): string => lines.find((l) => l.startsWith(start)) ?? '';

function inOrder(body: string, marks: string[]): void {
  const at = marks.map((m) => body.indexOf(m));
  expect(at.every((i) => i >= 0), JSON.stringify(at)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
}

describe('specflow.onboard-skill', () => {
  it('The bundle exists, is mirrored and fits the budget', () => {
    expect(text).not.toBe('');
    expect(fs.readFileSync(MIRROR, 'utf8')).toBe(text);
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'measure-skill-descriptions.mjs')], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/^specflow-onboard\s+B\b/m);
    expect(out).toContain('OK    all');
    for (const p of ['onboard this codebase', 'port mode']) expect(lines[2]).toContain(`"${p}"`);
  });

  it('3.x init and sync never install it', () => {
    expect(listSkillBundles(path.join(ROOT, 'skills'))).not.toContain('specflow-onboard');
  });

  it('The description is exact and names both modes', () => {
    expect(lines[2]).toBe(`description: 'Bring existing work under the specs. Port mode: turn business specs into promises and tag every test. Onboard mode: write specs from code. Proposals for approval. "onboard this codebase", "port mode".'`);
    expect(lines).toContain('## Port mode');
    expect(lines).toContain('## Onboard mode');
  });

  it('The mode choice is stated', () => {
    const body = text.slice(text.indexOf('## Which mode'), text.indexOf('## Working folder'));
    inOrder(body, ['`.specflow/` exists and `specflow/` does not', '`Run cortex specs port first.`', '`specflow/` and `.cortex-port/report.json` exist: port mode', '`specflow/` exists with no report: ask the person', 'Neither folder exists: onboard mode']);
  });

  it("Proposals stay outside the repository's history", () => {
    for (const n of ['.cortex-port/report.json', '.cortex-port/promises/', '.cortex-port/tagging/<area>.jsonl', '.cortex-port/decisions.md']) expect(text).toContain(n);
    expect(text).toContain("the repository's exclude file (`git rev-parse --git-path info/exclude`), never in `.gitignore`");
  });

  it('A promise keeps every commitment', () => {
    const p = para('**Promises.**');
    for (const n of ['keeps every commitment', 'at most 40 lines', '`P-<AREA>-<n>`', '`title`', '`## Outcome`', '`serves: [<promise id>]`', 'one entry per spec', '`implements:` is then removed', '`cortex/world/decisions/`']) expect(p).toContain(n);
  });

  it('Retired specs are left as records', () => {
    const p = para('**Retired specs are records.**');
    expect(p).toContain('A `status: retired` business spec gets no promise');
    expect(p).toContain('a retired spec gets no `serves:`');
    expect(p).toContain('is not converted: it keeps its `implements:`');
    expect(p).toContain('the person decides');
    expect(port).toContain("No line names a retired spec's criterion");
  });

  it('Every untagged test gets one proposal', () => {
    const body = port.slice(port.indexOf('**Tagging.**'), port.indexOf('**Approval, then application.**'));
    expect(body).toContain('Every untagged test gets exactly one JSON line in `.cortex-port/tagging/<area>.jsonl`');
    for (const f of ['`file`', '`name`', '`line`', '`action`', '`reason`']) expect(body).toContain(f);
    inOrder(body, ['- `tag`', '- `new-criterion`', '- `delete`']);
    expect(body).toContain('is proposed as `new-criterion`');
    expect(body).toContain('`cortex specs port --verify` exits 0: run it before asking for approval');
  });

  it('Deletion is the last resort', () => {
    expect(port).toContain('`delete`: only when the behaviour is not wanted');
    expect(port).toContain('never proposed for deletion for lack of a match');
  });

  it('Nothing is applied before approval', () => {
    const p = para('**Approval, then application.**');
    for (const n of ["Nothing is applied before the person's approval, per repository", '`.cortex-port/decisions.md`', 'Only after that does the main session apply']) expect(p).toContain(n);
  });

  it('Tags use the two conventions', () => {
    const p = para('**Approval, then application.**');
    for (const n of ['`[CRIT-ID]`', '`[A-1, B-2]`', '`@pytest.mark.criterion("CRIT-ID")`', 'one marker per id', 'adds that prefix or marker and nothing else']) expect(p).toContain(n);
  });

  it('The skill never switches on rules (b) and (c)', () => {
    const p = para('**Going live.**');
    for (const n of ['`Untagged tests: 0`', '`.untagged`', '`specflow.rules`', 'The person switches them on; this skill never does']) expect(p).toContain(n);
  });

  it('Agents are awaited', () => {
    expect(text).toContain('Every spawned agent is awaited before its output is used.');
    expect(text).toContain('one agent reads one area or one test folder');
  });

  it('Onboard mode is marked untested', () => {
    expect(onboard).toContain('This mode has not been tested. It runs on a client repository only after a blind run on one area of a repository has been reviewed.');
    expect(onboard).toContain('Ask the person to confirm that before you start');
  });

  it("Onboard mode keeps the owner's method in order", () => {
    inOrder(onboard, ['**splitter**', '**two independent elephants**', '**reconciler**', '**goldfish**', 'the person resolves', '**a test per retained criterion**']);
    expect(onboard).toContain('`.cortex-port/onboard/<concern>/`');
    expect(onboard).toContain('it commits nothing');
  });

  it('The reconciler settles nothing', () => {
    expect(onboard).toContain('lists every disagreement as an open question');
    expect(onboard).toContain('A disagreement between elephants is never settled by the reconciler.');
    expect(onboard).toContain("Only in a run told the user can't answer does the main session decide");
  });

  it('Every agent delivers through a file', () => {
    expect(text).toContain('Every spawned agent writes its output to a file under `.cortex-port/`, which the skill reads: the file is the delivery, because a hand-back can fail after the agent has finished.');
    expect(onboard).toContain('`.cortex-port/onboard/concerns.md`');
    expect(port).toContain('Each agent writes its lines straight into `.cortex-port/tagging/<area>.jsonl`.');
  });

  it('A needs-edit spec on a live promise is converted', () => {
    expect(port).toContain('A spec the report marks `needs-edit` for another reason is converted like any other: the mark is about its criteria.');
  });

  it('A test folder spanning several specs is one agent', () => {
    expect(text).toContain('A test folder that spans several specs is still one agent, which reads those specs\' criteria.');
  });

  it('A limited run says what it covered', () => {
    expect(port).toContain('A run the person limits to a slice says so in its counts, and it is finished when `cortex specs port --verify` lists none of that slice\'s files.');
  });
});
