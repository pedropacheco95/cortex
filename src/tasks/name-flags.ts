/**
 * The name flags (spec loops.quality-task Rule 5): which changed files no
 * criterion or tagged test names. A flag is not a finding; a reviewer reads it
 * against the spec text. No path is hardcoded: layout comes from `specflow.tests`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { buildModel, readConfig, selectTestFiles, testCases } from '../specflow/model/model.js';
import { workTree } from '../specflow/model/tree.js';

/** The folders that are not code. `.claude/` is one the silent-spec job deletes, so it always shows as changed. */
const NOT_GOVERNED = ['specflow/', '.specflow/', 'cortex/', '.githooks/', '.claude/'];
const MAX_NAMED_BY = 3;

export interface NameFlags {
  base: string;
  governed: string[];
  flagged: string[];
  named: { file: string; by: string[] }[];
}

function git(dir: string, args: string[]): string[] {
  const out = execFileSync('git', ['-C', dir, ...args], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 });
  return out.split('\n').filter((l) => l.length > 0);
}

export function tokensOf(file: string): string[] {
  const base = path.posix.basename(file);
  const ext = path.posix.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  const tokens = [file, base];
  if (/[_-]/.test(stem) || stem.length >= 8) tokens.push(stem);
  if (ext === '.py') tokens.push(file.slice(0, -ext.length).split('/').join('.'));
  return tokens;
}

function names(text: string, tokens: string[]): boolean {
  return tokens.some((t) => new RegExp(`(?<!\\w)${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`).test(text));
}

export function nameFlags(opts: { projectRoot: string; dir: string; base: string }): NameFlags {
  const root = path.resolve(opts.projectRoot);
  const dir = path.resolve(opts.dir);
  const changed = [...new Set([...git(dir, ['diff', '--name-only', opts.base]), ...git(dir, ['ls-files', '--others', '--exclude-standard'])])].sort();

  const tree = workTree(root);
  const config = readConfig(tree);
  const tests = selectTestFiles(changed, config.tests ?? []);
  const governed = changed.filter((f) => !NOT_GOVERNED.some((d) => f.startsWith(d)) && !f.endsWith('.md') && !tests.has(f));

  const criteria = buildModel(tree, config).specs.flatMap((s) => s.criteria);
  const taggedFiles = [...new Set(testCases(tree, config).filter((c) => c.tags.length > 0).map((c) => c.file))];
  const texts = new Map(taggedFiles.map((f) => [f, fs.readFileSync(path.join(root, f), 'utf-8')]));

  const flagged: string[] = [];
  const named: NameFlags['named'] = [];
  for (const file of governed) {
    const tokens = tokensOf(file);
    const by = [
      ...criteria.filter((c) => names(c.text, tokens)).map((c) => c.id),
      ...taggedFiles.filter((f) => names(texts.get(f) as string, tokens)),
    ];
    if (by.length === 0) flagged.push(file);
    else named.push({ file, by: by.slice(0, MAX_NAMED_BY) });
  }
  return { base: opts.base, governed, flagged, named };
}
