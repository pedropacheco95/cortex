/**
 * PostWrite hook — PostToolUse on Write|Edit (spec hooks.post-write; schema §5
 * v3.0 row: "Nothing").
 *
 * The v2.0 anatomy writeback (tokens/sha256/last_seen/needs_purpose_refresh on
 * an `anatomy/files.md` row) was removed with the anatomy module at
 * build-order-v3 step 7 (design §5.10; schema §5, addendum A7.3). Schema 3.0
 * specifies NO replacement side-effect: intra-commit change tracking is owned
 * by the post-commit insight fast tier (`cortex insight-refresh-fast`), which
 * flags changed files against the staleness ledger. The hook stays registered
 * (its registration is part of init's settings.json contract) and is a pure
 * no-op: always exit 0, always empty stdout — Claude never hears from it and
 * it never writes.
 */
import type { HookRunResult, HookRunOptions } from './session-start.js';

const SILENT: HookRunResult = { exitCode: 0, stdout: '' };

export async function run(_stdinJson: unknown, _opts?: HookRunOptions): Promise<HookRunResult> {
  return SILENT;
}
