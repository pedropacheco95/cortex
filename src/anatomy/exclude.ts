/**
 * Shared anatomy exclusion logic (spec anatomy.scanner; hooks.post-write Rule 6).
 *
 * A path is out of anatomy scope when it sits under a hard-excluded segment
 * (node_modules / .git / .cortex), matches `.gitignore`, or matches
 * `cortex.config.json` `anatomy.exclude`. Used by the scanner's listing filter
 * and by the PostWrite hook's no-op check so the two agree on scope.
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

export const EXCLUDED_SEGMENTS = new Set(['node_modules', '.git', '.cortex']);

/** True when any path segment is hard-excluded (never indexed, ever). */
export function hasExcludedSegment(relPath: string): boolean {
  return relPath.split('/').some((s) => EXCLUDED_SEGMENTS.has(s));
}

/**
 * Build the `.gitignore` + `anatomy.exclude` ignore filter for a project root.
 * Unreadable inputs are skipped silently (they only widen scope, never break it).
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
      const anatomy = config['anatomy'] as Record<string, unknown> | undefined;
      if (anatomy && Array.isArray(anatomy['exclude'])) {
        for (const excl of anatomy['exclude'] as unknown[]) {
          if (typeof excl === 'string') ig.add(excl);
        }
      }
    } catch {
      /* ignore parse errors */
    }
  }

  return ig;
}
