/**
 * `cortex hooks install` (specflow.git-hooks): the git hooks that run the check.
 * Shell shims calling `cortex`. Exports the pieces `cortex sync` refreshes with.
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import type { SpecsIO } from './index.js';

export const MANAGED_LINE = '# cortex-managed: cortex hooks install rewrites this file';
const HOOKS_DIR = '.githooks';
const NOT_FOUND = 'specflow: cortex not found on PATH; the check cannot run. Install it, or use --no-verify and say so.';

function shim(name: string, body: string): string {
  return [
    '#!/bin/sh',
    MANAGED_LINE,
    `existing="$(git rev-parse --git-common-dir)/hooks/${name}"`,
    'if [ -x "$existing" ]; then',
    '  "$existing" "$@" || exit $?',
    'fi',
    body,
    '',
  ].join('\n');
}

const REFUSING_START = `if ! command -v cortex >/dev/null 2>&1; then
  echo "${NOT_FOUND}" >&2
  exit 1
fi`;

const REFRESH_INDEX = `[ -d specflow ] || exit 0
if ! command -v cortex >/dev/null 2>&1; then
  echo "specflow: warning: cortex not found on PATH; specflow/INDEX.md was not refreshed" >&2
  exit 0
fi
cortex specs index --staged || echo "specflow: warning: specflow/INDEX.md was not refreshed" >&2
exit 0`;

const HOOKS: Record<string, string> = {
  'commit-msg': `${REFUSING_START}\nexec cortex check --commit-msg "$1"`,
  'prepare-commit-msg': `if [ "$2" = "commit" ] && [ "$3" = "HEAD" ]; then
  git rev-parse HEAD > "$(git rev-parse --git-path specflow-amend)"
fi
exit 0`,
  'pre-commit': REFRESH_INDEX,
  'pre-merge-commit': REFRESH_INDEX,
};

function git(root: string, ...args: string[]): { ok: boolean; out: string } {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf-8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
}

/** The hook files an install writes: Cortex's, and a passthrough per other existing hook. */
function plannedHooks(root: string): Map<string, string> {
  const planned = new Map(Object.entries(HOOKS).map(([name, body]) => [name, shim(name, body)]));
  const dir = path.resolve(root, git(root, 'rev-parse', '--git-common-dir').out, 'hooks');
  if (!fs.existsSync(dir)) return planned;
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.endsWith('.sample') || planned.has(name)) continue;
    const mode = fs.statSync(path.join(dir, name));
    if (mode.isFile() && (mode.mode & 0o111) !== 0) planned.set(name, shim(name, 'exit 0'));
  }
  return planned;
}

/**
 * Files an install would overwrite that are not Cortex's (Rule 12). Reads only,
 * so a dry run can ask the same question.
 */
export function handWrittenHooks(root: string): string[] {
  const found: string[] = [];
  for (const name of plannedHooks(root).keys()) {
    const file = path.join(root, HOOKS_DIR, name);
    if (fs.existsSync(file) && !fs.readFileSync(file, 'utf-8').includes('# cortex-managed')) found.push(name);
  }
  return found;
}

function recordSince(root: string): void {
  const file = path.join(root, 'cortex/cortex.json');
  if (!fs.existsSync(file)) return;
  const head = git(root, 'rev-parse', '--verify', '-q', 'HEAD');
  if (!head.ok) return;
  const store = JSON.parse(fs.readFileSync(file, 'utf-8')) as { specflow?: { since?: string } };
  if (store.specflow?.since) return;
  store.specflow = { ...store.specflow, since: head.out };
  fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`);
}

export interface InstallOptions {
  /** False for sync's refresh, which writes nothing else under `cortex/` (Rule 10). */
  writeSince?: boolean;
}

export function installHooks(root = '.', options: InstallOptions = {}, io: SpecsIO = {}): number {
  const out = io.stdout ?? ((l: string) => console.log(l));
  const err = io.stderr ?? ((l: string) => console.error(l));
  if (!git(root, 'rev-parse', '--git-dir').ok) {
    err('specflow: not a git repository');
    return 1;
  }
  const current = git(root, 'config', '--local', 'core.hooksPath').out;
  if (current !== '' && current !== HOOKS_DIR) {
    err(`specflow: core.hooksPath is already ${current}; add these hooks there by hand`);
    err('  commit-msg: cortex check --commit-msg "$1"');
    err('  pre-commit and pre-merge-commit: cortex specs index --staged');
    err('  prepare-commit-msg: on an amend, write HEAD to $(git rev-parse --git-path specflow-amend)');
    return 1;
  }
  fs.mkdirSync(path.join(root, HOOKS_DIR), { recursive: true });
  for (const [name, text] of plannedHooks(root)) {
    const file = path.join(root, HOOKS_DIR, name);
    const same = fs.existsSync(file) && fs.readFileSync(file, 'utf-8') === text;
    if (!same) {
      fs.writeFileSync(file, text);
      out(`wrote ${HOOKS_DIR}/${name}`);
    }
    fs.chmodSync(file, 0o755);
  }
  if (current !== HOOKS_DIR) git(root, 'config', '--local', 'core.hooksPath', HOOKS_DIR);
  if (options.writeSince !== false) recordSince(root);
  return 0;
}
