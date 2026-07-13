/**
 * Shared insight exclusion logic (spec insight.l1-structural; relocated from
 * `src/anatomy/exclude.ts` at build-order-v3 step 7 — anatomy deprecation).
 *
 * A path is out of insight scope when it sits under a hard-excluded segment
 * (node_modules / .git / .cortex), matches `.gitignore`, or matches the
 * config exclude list. Config key: `insight.exclude` is preferred; the legacy
 * v2 `anatomy.exclude` is still honoured for back-compat (schema §10.1 removed
 * the anatomy block at 3.0 and defers the v3 insight config keys, so both are
 * read and unioned — an engineering call recorded at step 7). Used by the L1
 * walk, the insight fast tier, and the pulse hygiene sweep so all agree on scope.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

// ignore is a CJS module with no "exports" field; its d.ts uses "export default"
// which conflicts with NodeNext esModuleInterop. Load via createRequire.
const _cjsRequire = createRequire(import.meta.url);
export interface IgnoreInstance {
  add(patterns: string | string[]): void;
  ignores(pathname: string): boolean;
}
const _ignoreFactory = _cjsRequire('ignore') as () => IgnoreInstance;

// Cortex's own meta-directories are never in insight scope: the knowledge
// layer (.cortex), the specs (.specflow), and the skill/settings bundles
// (.claude) are not codebase, so they get no insight entries or refresh churn.
export const EXCLUDED_SEGMENTS = new Set(['node_modules', '.git', '.cortex', '.specflow', '.claude']);

/** True when any path segment is hard-excluded (never indexed, ever). */
export function hasExcludedSegment(relPath: string): boolean {
  return relPath.split('/').some((s) => EXCLUDED_SEGMENTS.has(s));
}

/**
 * Build the `.gitignore` + config-exclude ignore filter for a project root.
 * Reads `insight.exclude` (preferred) unioned with the legacy `anatomy.exclude`
 * (back-compat — see the module doc). Unreadable inputs are skipped silently
 * (they only widen scope, never break it).
 */
export function buildIgnoreFilter(absRoot: string): IgnoreInstance {
  const ig = _ignoreFactory();

  const gitignorePath = path.join(absRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      ig.add(fs.readFileSync(gitignorePath, 'utf-8'));
    } catch {
      /* unreadable .gitignore: skip */
    }
  }

  const configPath = path.join(absRoot, '.cortex', 'cortex.config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      for (const blockKey of ['insight', 'anatomy']) {
        const block = config[blockKey] as Record<string, unknown> | undefined;
        if (block && Array.isArray(block['exclude'])) {
          for (const excl of block['exclude'] as unknown[]) {
            if (typeof excl === 'string') ig.add(excl);
          }
        }
      }
    } catch {
      /* ignore parse errors */
    }
  }

  return ig;
}
