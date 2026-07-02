import * as fs from 'fs';
import * as path from 'path';
import type { Violation } from '../types.js';

/** Schema §8 start marker — carries the schema version (`<!-- cortex:start v1.0 -->`). */
export const CORTEX_START_MARKER_RE = /<!-- cortex:start(?:\s+v(\S+))? -->/;
export const CORTEX_END_MARKER = '<!-- cortex:end -->';

/**
 * Shared §8 managed-block parse (validator + loops.onboarding-drift): is a
 * managed block present, and which version does it declare? Prefers the `v…`
 * in the start marker; tolerates a legacy `version:` line inside the block.
 */
export function readManagedBlockVersion(content: string): { present: boolean; version: string | null } {
  const m = CORTEX_START_MARKER_RE.exec(content);
  if (!m) return { present: false, version: null };
  if (m[1]) return { present: true, version: m[1] };
  const endIdx = content.indexOf(CORTEX_END_MARKER);
  const block = endIdx >= 0 ? content.slice(m.index, endIdx) : content.slice(m.index);
  const vm = block.match(/version:\s*"?([^"\s]+)"?/);
  return { present: true, version: vm?.[1] ?? null };
}

export function checkClaudeMd(root: string, config: Record<string, unknown>): Violation[] {
  const violations: Violation[] = [];
  const claudeMdPath = path.join(root, 'CLAUDE.md');

  if (!fs.existsSync(claudeMdPath)) return violations;

  const content = fs.readFileSync(claudeMdPath, 'utf-8');
  // Schema §8: the start marker carries the schema version — `<!-- cortex:start v1.0 -->`.
  // Bare `<!-- cortex:start -->` markers are tolerated (version then read from a `version:` line).
  const startMatch = CORTEX_START_MARKER_RE.exec(content);
  const endMarker = CORTEX_END_MARKER;

  const startIdx = startMatch ? startMatch.index : -1;
  const markerVersion = startMatch?.[1];
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 && endIdx === -1) {
    // No managed block — that's OK
    return violations;
  }

  if (startIdx === -1 || endIdx === -1) {
    violations.push({
      severity: 'error',
      check: 'check.claude-md',
      clause: '§8',
      location: { path: claudeMdPath },
      message: `CLAUDE.md has unmatched cortex managed block marker (missing ${startIdx === -1 ? '<!-- cortex:start -->' : '<!-- cortex:end -->'})`,
    });
    return violations;
  }

  if (startIdx > endIdx) {
    violations.push({
      severity: 'error',
      check: 'check.claude-md',
      clause: '§8',
      location: { path: claudeMdPath },
      message: 'CLAUDE.md has cortex:end before cortex:start',
    });
    return violations;
  }

  // Extract block and check version (prefer the `v…` in the start marker, per §8)
  const block = content.slice(startIdx, endIdx + endMarker.length);
  const versionMatch = markerVersion ? [markerVersion, markerVersion] : block.match(/version:\s*"?([^"\s]+)"?/);
  if (!versionMatch) {
    violations.push({
      severity: 'error',
      check: 'check.claude-md',
      clause: '§8',
      location: { path: claudeMdPath },
      message: 'CLAUDE.md cortex managed block is missing a version declaration',
    });
    return violations;
  }

  const blockVersion = versionMatch[1];
  const configVersion = config['schemaVersion'] as string | undefined;
  if (configVersion && blockVersion !== configVersion) {
    violations.push({
      severity: 'error',
      check: 'check.claude-md',
      clause: '§8',
      location: { path: claudeMdPath },
      message: `CLAUDE.md cortex block version "${blockVersion}" does not match cortex.config.json schemaVersion "${configVersion}"`,
    });
  }

  return violations;
}
