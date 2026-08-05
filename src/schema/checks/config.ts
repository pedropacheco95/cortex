import * as fs from 'fs';
import * as path from 'path';
import type { Violation } from '../types.js';
import { SUPPORTED_MAJOR, SUPPORTED_MINOR, SUPPORTED_VERSION } from '../version.js';
import { PROCESS_PROFILES, type ProcessProfile } from '../../cli/profile.js';

export interface ConfigResult {
  violations: Violation[];
  config: Record<string, unknown> | null;
  majorOk: boolean;
}

export function checkConfig(root: string): ConfigResult {
  const configPath = path.join(root, '.cortex', 'cortex.config.json');
  const violations: Violation[] = [];

  if (!fs.existsSync(configPath)) {
    violations.push({
      severity: 'error',
      check: 'check.config',
      clause: '§10',
      location: { path: configPath },
      message: '.cortex/cortex.config.json is missing',
    });
    return { violations, config: null, majorOk: false };
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e) {
    violations.push({
      severity: 'error',
      check: 'check.config',
      clause: '§10',
      location: { path: configPath },
      message: `cortex.config.json is not valid JSON: ${(e as Error).message}`,
    });
    return { violations, config: null, majorOk: false };
  }

  if (typeof config['schemaVersion'] !== 'string') {
    violations.push({
      severity: 'error',
      check: 'check.config',
      clause: '§10',
      location: { path: configPath, key: 'schemaVersion' },
      message: 'cortex.config.json missing required field "schemaVersion"',
    });
    return { violations, config, majorOk: false };
  }

  const [majorStr, minorStr] = config['schemaVersion'].split('.');
  const major = parseInt(majorStr ?? '0', 10);
  const minor = parseInt(minorStr ?? '0', 10);

  if (major > SUPPORTED_MAJOR) {
    violations.push({
      severity: 'error',
      check: 'check.config',
      clause: '§10',
      location: { path: configPath, key: 'schemaVersion' },
      message: `Unsupported schema major version ${major}; this validator supports major version ${SUPPORTED_MAJOR}. Upgrade the validator.`,
    });
    return { violations, config, majorOk: false };
  }

  if (major < SUPPORTED_MAJOR) {
    violations.push({
      severity: 'error',
      check: 'check.config',
      clause: '§10',
      location: { path: configPath, key: 'schemaVersion' },
      message: `Schema major version ${major} is below supported version ${SUPPORTED_MAJOR}. Run cortex migrate.`,
    });
    return { violations, config, majorOk: false };
  }

  // major === SUPPORTED_MAJOR
  if (minor > SUPPORTED_MINOR) {
    violations.push({
      severity: 'warning',
      check: 'check.config',
      clause: '§10',
      location: { path: configPath, key: 'schemaVersion' },
      message: `Schema minor version ${minor} is newer than supported (${SUPPORTED_VERSION}). Some features may not be validated.`,
    });
  }

  // Check for unknown keys (§10.1 v3.0 shape: schemaVersion, hooks, pulse,
  // harness, loop — the v2.0 `anatomy` block is removed and the v2.0
  // `insight` block superseded, addendum A10.0. Both legacy keys are still
  // TOLERATED here (no warning) so an unmigrated config surfaces its real
  // problems, not churn; the exclude reader honours anatomy.exclude for
  // back-compat, src/insight/exclude.ts.)
  // §10.1 v3.3: `profile` is optional with the default `specflow`. Absent is
  // not a violation; present-but-unrecognised is an error, because a typo'd
  // profile would silently schedule the wrong loop set.
  if (config['profile'] !== undefined) {
    const profile = config['profile'];
    if (typeof profile !== 'string' || !PROCESS_PROFILES.includes(profile as ProcessProfile)) {
      violations.push({
        severity: 'error',
        check: 'check.config',
        clause: '§10.1',
        location: { path: configPath, key: 'profile' },
        message: `cortex.config.json "profile" must be one of [${PROCESS_PROFILES.join(', ')}], got ${JSON.stringify(profile)}`,
      });
    }
  }

  const knownKeys = ['schemaVersion', 'profile', 'anatomy', 'hooks', 'pulse', 'insight', 'harness', 'loop'];
  for (const key of Object.keys(config)) {
    if (!knownKeys.includes(key)) {
      violations.push({
        severity: 'warning',
        check: 'check.config',
        clause: '§10',
        location: { path: configPath, key },
        message: `Unknown key "${key}" in cortex.config.json`,
      });
    }
  }

  return { violations, config, majorOk: true };
}
