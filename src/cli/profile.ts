/**
 * The process profile (schema §10.1, spec `core-cli.init-profile`).
 *
 * Which build process a project runs. Cortex Core is process-agnostic
 * (design/plan §0.1): the profile is RECORDED, never enforced. Its single
 * consumer is scheduled-task writing, which scopes Bucket-3 spec-loop members
 * out when the profile is not `specflow`; Bucket-1 knowledge loops are
 * scheduled under every profile.
 *
 * Pure constants and one lookup; no I/O, no LLM (RULES 3).
 */
import * as fs from 'fs';
import * as path from 'path';

/** The profiles a project may declare (schema §10.1). */
export const PROCESS_PROFILES = ['specflow', 'superpowers'] as const;
export type ProcessProfile = (typeof PROCESS_PROFILES)[number];

/** The default when the config predates the field or omits it (schema §10.1). */
export const DEFAULT_PROFILE: ProcessProfile = 'specflow';

export function isProcessProfile(v: unknown): v is ProcessProfile {
  return typeof v === 'string' && (PROCESS_PROFILES as readonly string[]).includes(v);
}

/**
 * The profile a project declares, or the default. Never throws: an unreadable
 * or malformed config degrades to the default, and `check.config` is what
 * reports the malformation.
 */
export function readProfile(root: string): ProcessProfile {
  try {
    const raw = fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    return isProcessProfile(config['profile']) ? config['profile'] : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}
