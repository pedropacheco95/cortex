/**
 * Shared content-measure helpers (relocated from `src/anatomy/files-md.ts` at
 * build-order-v3 step 7 — anatomy deprecation): the project-wide chars/4
 * token estimate (schema §5 / design §6.3) and the source-body sha256 used
 * across hooks, loops, and insight staleness comparisons.
 */
import * as crypto from 'crypto';

export function computeSha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Token estimate per schema §5 / design §6.3: chars/4, rounded up. */
export function computeTokens(content: string): number {
  return Math.ceil(content.length / 4);
}
