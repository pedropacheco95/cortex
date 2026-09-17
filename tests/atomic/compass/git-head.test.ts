/**
 * Atomic tests — `readHeadCommit` (`compass.bug-currency` Rule 4; plan
 * Task 2.1). Each acceptance criterion is a labelled describe whose title
 * matches the spec heading. Every case builds a fake `.git` layout by file
 * I/O in a tmp dir: the helper reads files only (R-001 — no `git`
 * subprocess), returns the first seven lowercase hex characters of the
 * 40-hex sha, and `null` on anything it cannot read.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { readHeadCommit } from '../../../src/compass/git-head.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`git-head-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

const SHA_MAIN = '2b217dfa9c3e4f5061728394a5b6c7d8e9f01234';
const SHA_OTHER = 'ABCDEF0123456789abcdef0123456789abcdef01';

function write(root: string, rel: string, content: string): void {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

describe('R-001 — Core makes no LLM calls and spawns no git', () => {
  it('git-head.ts imports no LLM SDK and no child_process', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../src/compass/git-head.ts'), 'utf-8');
    expect(src).not.toMatch(/@anthropic-ai\/sdk|openai|child_process|execSync|spawnSync/);
  });
});

describe('The helper reads a symbolic HEAD', () => {
  it('HEAD `ref: refs/heads/main` + the ref file → the first seven characters', () => {
    const root = tmp('symbolic');
    write(root, '.git/HEAD', 'ref: refs/heads/main\n');
    write(root, '.git/refs/heads/main', `${SHA_MAIN}\n`);
    expect(readHeadCommit(root)).toBe('2b217df');
  });

  it('a ref file with uppercase hex is lowercased', () => {
    const root = tmp('lower');
    write(root, '.git/HEAD', 'ref: refs/heads/feature/x\n');
    write(root, '.git/refs/heads/feature/x', `${SHA_OTHER}\n`);
    expect(readHeadCommit(root)).toBe('abcdef0');
  });
});

describe('The helper reads a packed ref, a detached head and a worktree', () => {
  it('a missing ref file falls back to packed-refs', () => {
    const root = tmp('packed');
    write(root, '.git/HEAD', 'ref: refs/heads/main\n');
    write(
      root,
      '.git/packed-refs',
      `# pack-refs with: peeled fully-peeled sorted\n${SHA_OTHER.toLowerCase()} refs/heads/other\n${SHA_MAIN} refs/heads/main\n^deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\n`,
    );
    expect(readHeadCommit(root)).toBe('2b217df');
  });

  it('a detached HEAD (bare 40-hex sha) is used as-is', () => {
    const root = tmp('detached');
    write(root, '.git/HEAD', `${SHA_MAIN}\n`);
    expect(readHeadCommit(root)).toBe('2b217df');
  });

  it('a linked worktree: `.git` is a `gitdir:` file; HEAD there; the ref in the main repo via commondir', () => {
    const base = tmp('worktree');
    const main = path.join(base, 'main');
    const wt = path.join(base, 'wt');
    fs.mkdirSync(main, { recursive: true });
    fs.mkdirSync(wt, { recursive: true });
    write(main, '.git/HEAD', 'ref: refs/heads/main\n');
    write(main, '.git/refs/heads/main', `${SHA_OTHER}\n`);
    write(main, '.git/refs/heads/wt-branch', `${SHA_MAIN}\n`);
    write(main, '.git/worktrees/wt/HEAD', 'ref: refs/heads/wt-branch\n');
    write(main, '.git/worktrees/wt/commondir', '../..\n');
    write(wt, '.git', 'gitdir: ../main/.git/worktrees/wt\n');
    expect(readHeadCommit(wt)).toBe('2b217df');
  });

  it('a linked worktree whose ref is only in the main repo\'s packed-refs', () => {
    const base = tmp('worktree-packed');
    const main = path.join(base, 'main');
    const wt = path.join(base, 'wt');
    fs.mkdirSync(main, { recursive: true });
    fs.mkdirSync(wt, { recursive: true });
    write(main, '.git/HEAD', 'ref: refs/heads/main\n');
    write(main, '.git/packed-refs', `${SHA_MAIN} refs/heads/wt-branch\n`);
    write(main, '.git/worktrees/wt/HEAD', 'ref: refs/heads/wt-branch\n');
    write(main, '.git/worktrees/wt/commondir', '../..\n');
    write(wt, '.git', `gitdir: ${path.join(main, '.git', 'worktrees', 'wt')}\n`);
    expect(readHeadCommit(wt)).toBe('2b217df');
  });

  it('a detached worktree HEAD needs no commondir', () => {
    const base = tmp('worktree-detached');
    const main = path.join(base, 'main');
    const wt = path.join(base, 'wt');
    fs.mkdirSync(main, { recursive: true });
    fs.mkdirSync(wt, { recursive: true });
    write(main, '.git/worktrees/wt/HEAD', `${SHA_MAIN}\n`);
    write(wt, '.git', 'gitdir: ../main/.git/worktrees/wt\n');
    expect(readHeadCommit(wt)).toBe('2b217df');
  });
});

describe('The helper never throws', () => {
  it('no .git at all → null', () => {
    const root = tmp('no-git');
    expect(readHeadCommit(root)).toBeNull();
  });

  it('a nonexistent root → null', () => {
    expect(readHeadCommit(path.join(tmp('gone'), 'nope', 'deeper'))).toBeNull();
  });

  it('HEAD containing garbage → null', () => {
    const root = tmp('garbage');
    write(root, '.git/HEAD', 'garbage\n');
    expect(readHeadCommit(root)).toBeNull();
  });

  it('HEAD naming a ref that exists nowhere (no ref file, no packed-refs) → null', () => {
    const root = tmp('dangling');
    write(root, '.git/HEAD', 'ref: refs/heads/nowhere\n');
    expect(readHeadCommit(root)).toBeNull();
  });

  it('HEAD naming a ref absent from an existing packed-refs → null', () => {
    const root = tmp('dangling-packed');
    write(root, '.git/HEAD', 'ref: refs/heads/nowhere\n');
    write(root, '.git/packed-refs', `${SHA_MAIN} refs/heads/main\n`);
    expect(readHeadCommit(root)).toBeNull();
  });

  it('a ref file whose content is not a 40-hex sha → null', () => {
    const root = tmp('short-sha');
    write(root, '.git/HEAD', 'ref: refs/heads/main\n');
    write(root, '.git/refs/heads/main', '2b217df\n');
    expect(readHeadCommit(root)).toBeNull();
  });

  it('a .git file that is not a gitdir: pointer → null', () => {
    const root = tmp('bad-gitdir');
    write(root, '.git', 'not a pointer\n');
    expect(readHeadCommit(root)).toBeNull();
  });

  it('a gitdir: pointer at a directory without HEAD → null', () => {
    const root = tmp('gitdir-empty');
    fs.mkdirSync(path.join(root, 'elsewhere'), { recursive: true });
    write(root, '.git', 'gitdir: elsewhere\n');
    expect(readHeadCommit(root)).toBeNull();
  });

  it('a gitdir: pointer at another gitdir: file is followed one hop only → null', () => {
    const root = tmp('gitdir-chain');
    write(root, 'hop1', 'gitdir: hop2\n'); // a file, not a dir: the second hop is not taken
    write(root, '.git', 'gitdir: hop1\n');
    expect(readHeadCommit(root)).toBeNull();
  });
});
