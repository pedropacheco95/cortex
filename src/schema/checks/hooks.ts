import * as fs from 'fs';
import * as path from 'path';
import type { Violation } from '../types.js';

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

  const preReadExpected = (config['hooks'] as Record<string, unknown> | undefined)?.['preRead'] === true;
  const hooks = settings['hooks'] as Record<string, unknown> | undefined;
  // Schema §5: the PreRead hook is a PreToolUse entry matching Read. Legacy
  // top-level PreRead/preRead keys are also accepted.
  const preToolUse = hooks?.['PreToolUse'];
  const hasPreToolUseRead =
    Array.isArray(preToolUse) &&
    preToolUse.some((e) => typeof e === 'object' && e !== null && /\bRead\b/.test(String((e as Record<string, unknown>)['matcher'] ?? '')));
  const hasPreReadHook = hooks?.['PreRead'] !== undefined || hooks?.['preRead'] !== undefined || hasPreToolUseRead;

  if (preReadExpected && !hasPreReadHook) {
    violations.push({
      severity: 'error',
      check: 'check.hook-config',
      clause: '§5',
      location: { path: settingsPath, key: 'hooks.PreRead' },
      message: 'cortex.config.json has hooks.preRead=true but .claude/settings.json is missing a PreRead hook entry',
    });
  }

  return violations;
}
