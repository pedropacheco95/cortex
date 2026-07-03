import * as fs from 'fs';
import * as path from 'path';
import type { Violation } from '../types.js';

/**
 * `check.hook-config` (schema §5): the Read-pair entries (PreRead + PostRead,
 * registered as `cortex hook pre-read` / `cortex hook post-read`) are present
 * in `.claude/settings.json` **together, iff** `cortex.config.json`
 * `hooks.preRead` is true — which is the default (§10.1). Detection keys on
 * the `cortex hook ` command ownership marker, so user-owned Read hooks are
 * never implicated.
 */
export function checkHookConfig(root: string, config: Record<string, unknown>): Violation[] {
  const violations: Violation[] = [];
  const settingsPath = path.join(root, '.claude', 'settings.json');

  if (!fs.existsSync(settingsPath)) return violations;

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    return violations; // can't parse settings — skip
  }

  // §10.1: hooks.preRead defaults TRUE; only an explicit false opts out.
  const preReadExpected = (config['hooks'] as Record<string, unknown> | undefined)?.['preRead'] !== false;

  const hooksJson = JSON.stringify(settings['hooks'] ?? {});
  const hasPreRead = hooksJson.includes('cortex hook pre-read');
  const hasPostRead = hooksJson.includes('cortex hook post-read');

  if (preReadExpected && !hasPreRead) {
    violations.push({
      severity: 'error',
      check: 'check.hook-config',
      clause: '§5',
      location: { path: settingsPath, key: 'hooks.PreToolUse' },
      message: 'cortex.config.json hooks.preRead is true (the default) but .claude/settings.json is missing the `cortex hook pre-read` entry',
    });
  }
  if (preReadExpected && !hasPostRead) {
    violations.push({
      severity: 'error',
      check: 'check.hook-config',
      clause: '§5',
      location: { path: settingsPath, key: 'hooks.PostToolUse' },
      message: 'cortex.config.json hooks.preRead is true (the default) but .claude/settings.json is missing the `cortex hook post-read` entry (the Read pair registers together)',
    });
  }
  if (!preReadExpected && (hasPreRead || hasPostRead)) {
    violations.push({
      severity: 'error',
      check: 'check.hook-config',
      clause: '§5',
      location: { path: settingsPath, key: 'hooks' },
      message: 'cortex.config.json hooks.preRead is false but .claude/settings.json still carries Read-pair entries (`cortex hook pre-read`/`cortex hook post-read`) — the pair is removed together with the flag',
    });
  }

  return violations;
}
