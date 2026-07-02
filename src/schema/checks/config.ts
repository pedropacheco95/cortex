import * as fs from 'fs';
import * as path from 'path';
import type { Violation } from '../types.js';

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

  const SUPPORTED_MAJOR = 1;

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

  // major === 1
  if (minor > 0) {
    violations.push({
      severity: 'warning',
      check: 'check.config',
      clause: '§10',
      location: { path: configPath, key: 'schemaVersion' },
      message: `Schema minor version ${minor} is newer than supported (1.0). Some features may not be validated.`,
    });
  }

  // Check for unknown keys (§10.1 shape: schemaVersion, anatomy, hooks, pulse, harness, loop)
  const knownKeys = ['schemaVersion', 'anatomy', 'hooks', 'pulse', 'harness', 'loop'];
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
