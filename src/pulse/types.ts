/**
 * The typed pulse gate's shared type→policy contract (schema §4.5.1, §4.5.2).
 * The five `**Type:**` values, the three payload-operation shapes, and the
 * per-type permitted `**Target:**` roots — extracted so the runtime accept
 * (src/pulse/review.ts) and the validator (src/schema/checks/pulse.ts) share
 * ONE copy of the policy and cannot drift.
 *
 * The string-level `isTargetPermitted` here is the STRUCTURAL policy the
 * validator uses; the runtime additionally resolves paths for `..`-escape
 * safety off the same `permittedRoots(type)` table (review.ts).
 *
 * Pure module: no fs, no LLM, no network (R-001).
 */

/** The five suggestion types (§4.5.1). */
export const SUGGESTION_TYPES = [
  'rule-candidate',
  'skill-proposal',
  'promotion',
  'gated-layer-update',
  'user-directed-capture',
] as const;
export type SuggestionType = (typeof SUGGESTION_TYPES)[number];

/** Absent `**Type:**` → rule-candidate (v1-era tolerance, §4.5.1). */
export const DEFAULT_SUGGESTION_TYPE: SuggestionType = 'rule-candidate';

/** The three payload-operation shape markers (§4.5.2). */
export const PAYLOAD_SHAPES = ['**Proposed addition:**', '**Proposed edit:**', '**Proposed file:**'] as const;

export function isSuggestionType(v: unknown): v is SuggestionType {
  return typeof v === 'string' && (SUGGESTION_TYPES as readonly string[]).includes(v);
}

/**
 * A permitted-root matcher for a type. `dir` is a project-relative directory
 * prefix (trailing slash); `file` is an exact project-relative path; `skill`
 * is a NEW `.claude/skills/<name>/SKILL.md`.
 */
export type RootSpec =
  | { kind: 'dir'; prefix: string }
  | { kind: 'file'; path: string }
  | { kind: 'skill' };

const COMPASS: RootSpec = { kind: 'dir', prefix: '.cortex/compass/' };
const ATLAS: RootSpec = { kind: 'dir', prefix: '.cortex/atlas/' };
const INSIGHT_MAP: RootSpec = { kind: 'dir', prefix: '.cortex/insight/map/' };
const RULES: RootSpec = { kind: 'file', path: 'RULES.md' };
const SKILL: RootSpec = { kind: 'skill' };

/** Per-type permitted `**Target:**` roots (§4.5.1 table). */
export function permittedRoots(type: SuggestionType): RootSpec[] {
  switch (type) {
    case 'rule-candidate':
      return [COMPASS];
    case 'skill-proposal':
      return [SKILL];
    case 'promotion':
    case 'gated-layer-update':
      // compass / atlas / RULES.md — never insight/map (insight is ungated).
      return [COMPASS, ATLAS, RULES];
    case 'user-directed-capture':
      // the only type that MAY target insight (§4.5.1 note).
      return [COMPASS, ATLAS, INSIGHT_MAP, RULES];
  }
}

/**
 * §4.5.1 structural check — is `target` inside a permitted root for `type`?
 * Pure string policy (the validator's authority); the runtime resolves paths
 * against the same table for `..`-escape safety.
 */
export function isTargetPermitted(type: SuggestionType, target: string): boolean {
  const t = target.replace(/^\.\//, '').trim();
  for (const spec of permittedRoots(type)) {
    if (spec.kind === 'dir' && t.startsWith(spec.prefix)) return true;
    if (spec.kind === 'file' && t === spec.path) return true;
    if (spec.kind === 'skill' && t.startsWith('.claude/skills/') && t.endsWith('/SKILL.md')) return true;
  }
  return false;
}

/** Human-readable permitted-root summary for a type (error messages). */
export function permittedRootsLabel(type: SuggestionType): string {
  switch (type) {
    case 'rule-candidate':
      return '.cortex/compass/';
    case 'skill-proposal':
      return 'a new .claude/skills/<name>/SKILL.md';
    case 'promotion':
    case 'gated-layer-update':
      return '.cortex/compass/, .cortex/atlas/, RULES.md';
    case 'user-directed-capture':
      return '.cortex/compass/, .cortex/atlas/, .cortex/insight/map/, RULES.md';
  }
}
