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

  // §10.1 3.4 third revision: `hooks.readDefer` (boolean, default false) is the
  // PreRead row's read-deferral mode — RULES.md rule 6's one measured exception
  // (`hooks.pre-read-writeback` Rule 7). Absent or `false` is the default and
  // never a violation; a non-boolean is an ERROR (the hook treats anything but
  // boolean `true` as off, so `"yes"` would be a silent no-op without this);
  // `true` beside `hooks.preRead: false` is a WARNING — the mode lives inside
  // the Read pair's entry, which that flag removes, so it cannot fire.
  const hooks = config['hooks'];
  if (typeof hooks === 'object' && hooks !== null && !Array.isArray(hooks)) {
    const hooksBlock = hooks as Record<string, unknown>;
    const readDefer = hooksBlock['readDefer'];
    if (readDefer !== undefined) {
      if (typeof readDefer !== 'boolean') {
        violations.push({
          severity: 'error',
          check: 'check.config',
          clause: '§10.1',
          location: { path: configPath, key: 'hooks.readDefer' },
          message: `cortex.config.json "hooks.readDefer" must be a boolean, got ${JSON.stringify(readDefer)}`,
        });
      } else if (readDefer && hooksBlock['preRead'] === false) {
        violations.push({
          severity: 'warning',
          check: 'check.config',
          clause: '§10.1',
          location: { path: configPath, key: 'hooks.readDefer' },
          message:
            'hooks.readDefer is true but hooks.preRead is false — the Read pair is not registered, so the deferral mode cannot fire',
        });
      }
    }
  }

  // §10.1 3.4 fifth revision (schema.visibility Rule 1, RULES.md rule 20):
  // `visibility` { repo: public|private|unknown, allow: string[] } and
  // `placement` { localNotesDir: string } are optional objects. Absent is the
  // default and never a violation; present-but-malformed is an ERROR at the
  // offending key — a typo'd `repo` would silently leave check.visibility off.
  const VISIBILITY_REPOS = ['public', 'private', 'unknown'];
  const visibility = config['visibility'];
  if (visibility !== undefined) {
    if (typeof visibility !== 'object' || visibility === null || Array.isArray(visibility)) {
      violations.push({
        severity: 'error',
        check: 'check.config',
        clause: '§10.1',
        location: { path: configPath, key: 'visibility' },
        message: `cortex.config.json "visibility" must be an object { repo, allow }, got ${JSON.stringify(visibility)}`,
      });
    } else {
      const block = visibility as Record<string, unknown>;
      const repo = block['repo'];
      if (repo !== undefined && (typeof repo !== 'string' || !VISIBILITY_REPOS.includes(repo))) {
        violations.push({
          severity: 'error',
          check: 'check.config',
          clause: '§10.1',
          location: { path: configPath, key: 'visibility.repo' },
          message: `cortex.config.json "visibility.repo" must be one of [${VISIBILITY_REPOS.join(', ')}], got ${JSON.stringify(repo)}`,
        });
      }
      const allow = block['allow'];
      if (allow !== undefined && (!Array.isArray(allow) || !allow.every((g) => typeof g === 'string'))) {
        violations.push({
          severity: 'error',
          check: 'check.config',
          clause: '§10.1',
          location: { path: configPath, key: 'visibility.allow' },
          message: `cortex.config.json "visibility.allow" must be a list of glob strings, got ${JSON.stringify(allow)}`,
        });
      }
    }
  }
  const placement = config['placement'];
  if (placement !== undefined) {
    if (typeof placement !== 'object' || placement === null || Array.isArray(placement)) {
      violations.push({
        severity: 'error',
        check: 'check.config',
        clause: '§10.1',
        location: { path: configPath, key: 'placement' },
        message: `cortex.config.json "placement" must be an object { localNotesDir }, got ${JSON.stringify(placement)}`,
      });
    } else {
      const localNotesDir = (placement as Record<string, unknown>)['localNotesDir'];
      if (localNotesDir !== undefined && typeof localNotesDir !== 'string') {
        violations.push({
          severity: 'error',
          check: 'check.config',
          clause: '§10.1',
          location: { path: configPath, key: 'placement.localNotesDir' },
          message: `cortex.config.json "placement.localNotesDir" must be a string, got ${JSON.stringify(localNotesDir)}`,
        });
      }
    }
  }

  const knownKeys = ['schemaVersion', 'profile', 'anatomy', 'hooks', 'pulse', 'insight', 'harness', 'loop', 'visibility', 'placement'];
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
