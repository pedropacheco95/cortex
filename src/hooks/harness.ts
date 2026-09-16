/**
 * The shared string-level harness predicate — what Claude Code (not the human)
 * wrote into a user-role slot. One module, three predicates, so the hooks that
 * must agree about "what the human said" cannot drift:
 *
 *   - `isHarnessText(text)`        — `hooks.session-end` Rule 7 preamble, the
 *                                    string form of `isHarnessInjected` (which
 *                                    calls this one). Teammate messages, system
 *                                    reminders, task notifications, `!`-shell
 *                                    echoes. NOT the scheduled preamble: the
 *                                    session-end extractors keep seeing a
 *                                    scheduled session's first prompt as text.
 *   - `isScheduledPromptText(text)` — `pulse.distil` Rule 11(a)'s two markers as
 *                                    a string predicate (the skill preamble at
 *                                    the start, the scheduled-task tag anywhere).
 *   - `isHarnessPrompt(text)`      — `hooks.prompt-route` Rule 4: either of the
 *                                    above. A scheduled session's prompt is
 *                                    harness-shaped by construction, so the
 *                                    router is silent there too.
 *
 * Pure string inspection; nothing here touches a file (R-001).
 */

/**
 * `hooks.session-end` Rule 7 preamble: the harness wrappers Claude Code writes
 * as user-role entries, as observed 2026-09-15 (externally owned; spec Notes).
 * Re-exported by `src/hooks/session-end.ts`, where the spec names it.
 */
export const HARNESS_MARKERS = [
  '<teammate-message',
  '<system-reminder',
  '<task-notification',
  '[SYSTEM NOTIFICATION',
  '<bash-input>',
  '<bash-stdout>',
  '<command-name>',
  '<local-command',
];

/** Rule 7 preamble / prompt-route Rule 4: how far into a text a marker is looked for. */
export const HARNESS_SCAN_CHARS = 300;

/** `pulse.distil` Rule 11(a): the first user line of a skill-driven scheduled session starts with this. */
export const SCHEDULED_SKILL_PREAMBLE = 'Base directory for this skill:';
/** `pulse.distil` Rule 11(a): the tag Claude Desktop wraps a scheduled task's prompt in. */
export const SCHEDULED_TASK_TAG = '<scheduled-task';

/**
 * A text is harness-injected when its trimmed form starts with `<` or `[`, or
 * when its first HARNESS_SCAN_CHARS characters contain any HARNESS_MARKERS entry
 * (teammate reports arrive as a prose line with the tag on the next line).
 */
export function isHarnessText(text: string): boolean {
  const first = text.trimStart()[0];
  if (first === '<' || first === '[') return true;
  const head = text.slice(0, HARNESS_SCAN_CHARS);
  return HARNESS_MARKERS.some((marker) => head.includes(marker));
}

/** The scheduled-session markers: the skill preamble at the (trimmed) start, or the task tag anywhere. */
export function isScheduledPromptText(text: string): boolean {
  return text.trimStart().startsWith(SCHEDULED_SKILL_PREAMBLE) || text.includes(SCHEDULED_TASK_TAG);
}

/** `hooks.prompt-route` Rule 4: a prompt the router must be silent for. */
export function isHarnessPrompt(text: string): boolean {
  return isHarnessText(text) || isScheduledPromptText(text);
}
