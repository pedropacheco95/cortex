/**
 * Shared Claude-CLI auth-failure detection (core-cli.init Rule 6 pattern).
 *
 * Extracted from src/cli/init.ts so every Core surface that spawns the Claude
 * CLI headless (cortex init's purpose pass, the writer/verifier harness) uses
 * the ONE detection contract instead of drifting copies.
 */

/** Patterns that mean a Claude CLI subprocess reported an authentication failure. */
export const AUTH_FAILURE_PATTERN =
  /not\s+logged\s+in|not\s+signed\s+in|unauthoriz|unauthenticat|authentication\s+(?:required|failed|error)|invalid\s+api\s+key|please\s+(?:log|sign)\s*in|login\s+required|\/login/i;

/** True when the combined stdout/stderr of a Claude CLI subprocess signals an auth failure. */
export function isAuthFailureOutput(output: string): boolean {
  return AUTH_FAILURE_PATTERN.test(output);
}
