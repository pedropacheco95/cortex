/**
 * `cortex init` at 4.0 (spec core-cli.init Rule 20): the one setup command. It
 * runs `cortex store init`, then the update route of `cortex sync`. Every check
 * runs before the first write. `init()` in init.ts stays for tests that build
 * 3.x fixtures; no CLI path reaches it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { packageRoot } from './scaffold.js';
import { packageRefusal, platformRefusal, storeGate, updateRoute, type UpdateOptions, type UpdateResult } from './update.js';
import { storeInit } from '../store/init.js';

export interface SetupOptions extends UpdateOptions {
  /** The store step and the route, replaced in tests. */
  initStore?: (root: string) => { created: string[] };
  update?: (target: string, opts: UpdateOptions) => Promise<UpdateResult>;
}

const IGNORED_FLAGS = ['--force', '--yes', '-y', '--no-llm', '--partial'];
const IGNORED_WITH_VALUE = ['--profile', '--timeout-ms'];

/** The first non-flag argument is the project. The values of the last two flags are never read as it. */
export function parseInitArgs(args: string[]): { target: string; ignored: string[] } | { unknown: string } {
  const ignored: string[] = [];
  let target: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (IGNORED_WITH_VALUE.includes(a)) {
      ignored.push(a);
      i++;
    } else if (IGNORED_FLAGS.includes(a)) ignored.push(a);
    else if (a.startsWith('-')) return { unknown: a };
    else target ??= a;
  }
  return { target: target ?? '.', ignored };
}

/** Step 2: the root of the store this path sits in, walking up from it. */
function enclosingStore(target: string): string | null {
  for (let dir = target; ; dir = path.dirname(dir)) {
    const name = path.basename(dir);
    if (name === '.cortex' && fs.existsSync(path.join(dir, 'cortex.config.json'))) return path.dirname(dir);
    if (name === 'cortex' && fs.existsSync(path.join(dir, 'cortex.json'))) return path.dirname(dir);
    if (path.dirname(dir) === dir) return null;
  }
}

export async function setupProject(target: string, opts: SetupOptions = {}): Promise<UpdateResult> {
  const root = path.resolve(target);
  const offPlatform = platformRefusal('init', opts.platform ?? process.platform);
  if (offPlatform) return offPlatform;
  const store = enclosingStore(root);
  if (store !== null) return { exitCode: 2, out: [`cortex init: refused — this is inside the Cortex store of ${store}; run cortex init there. Nothing was written.`] };
  const gate = storeGate(root, 'init');
  if (gate !== 'route' && gate !== 'new') return gate;
  const lacks = packageRefusal('init', opts.packageDir ?? packageRoot());
  if (lacks) return lacks;

  const { initStore = storeInit, update = updateRoute, ...route } = opts;
  if (gate === 'route') return update(root, route);
  let created: string[];
  try {
    created = initStore(root).created;
  } catch (err) {
    return { exitCode: 1, out: [`cortex init: ${(err as Error).message}`] };
  }
  const result = await update(root, route);
  return { exitCode: result.exitCode, out: [`created: ${created.join(', ')}`, ...result.out] };
}
