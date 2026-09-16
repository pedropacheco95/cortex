/**
 * Atomic tests — the shared string-level harness predicate (`hooks.prompt-route`
 * Rule 4 "Harness prompts never fire", the predicate half; `hooks.session-end`
 * Rule 7 preamble; `pulse.distil` Rule 11(a) scheduled markers). One module,
 * `src/hooks/harness.ts`, so the session-end extractors and the prompt router
 * cannot disagree about what a human said.
 */
import { describe, it, expect } from 'vitest';
import {
  HARNESS_MARKERS,
  HARNESS_SCAN_CHARS,
  SCHEDULED_SKILL_PREAMBLE,
  SCHEDULED_TASK_TAG,
  isHarnessText,
  isScheduledPromptText,
  isHarnessPrompt,
} from '../../../src/hooks/harness.js';
import { HARNESS_MARKERS as SESSION_END_MARKERS, isHarnessInjected } from '../../../src/hooks/session-end.js';
import { sessionKind } from '../../../src/pulse/distil.js';

describe('the constants are pinned as the specs quote them', () => {
  it('HARNESS_MARKERS is the 2026-09-15 list and session-end re-exports the same array', () => {
    expect(HARNESS_MARKERS).toEqual([
      '<teammate-message',
      '<system-reminder',
      '<task-notification',
      '[SYSTEM NOTIFICATION',
      '<bash-input>',
      '<bash-stdout>',
      '<command-name>',
      '<local-command',
    ]);
    expect(SESSION_END_MARKERS).toBe(HARNESS_MARKERS);
    expect(HARNESS_SCAN_CHARS).toBe(300);
  });

  it('the scheduled markers are the pulse.distil Rule 11 strings', () => {
    expect(SCHEDULED_SKILL_PREAMBLE).toBe('Base directory for this skill:');
    expect(SCHEDULED_TASK_TAG).toBe('<scheduled-task');
  });
});

describe('isHarnessText — the string form of isHarnessInjected (session-end Rule 7 preamble)', () => {
  it('fires on a leading < or [ after trimming, and on a marker within the first 300 characters', () => {
    expect(isHarnessText('<teammate-message teammate_id="x">approved</teammate-message>')).toBe(true);
    expect(isHarnessText('  \n[SYSTEM NOTIFICATION] go ahead')).toBe(true);
    expect(isHarnessText('<system-reminder>ship it</system-reminder>')).toBe(true);
    expect(isHarnessText('Another Claude session sent a message:\n<teammate-message teammate_id="x">approved, go ahead</teammate-message>')).toBe(true);
    expect(isHarnessText('Note from the harness\n[SYSTEM NOTIFICATION] proceed')).toBe(true);
  });

  it('does not fire on a marker past the scan window, on plain prose, or on the scheduled preamble', () => {
    expect(isHarnessText('x'.repeat(301) + '\n<teammate-message>late marker</teammate-message>')).toBe(false);
    expect(isHarnessText('Approved.')).toBe(false);
    expect(isHarnessText('proceed with <the plan>')).toBe(false);
    expect(isHarnessText('')).toBe(false);
    // The skill preamble starts with `B`, so it is NOT harness text — session-end
    // keeps seeing it as a user message (the two predicates stay separate).
    expect(isHarnessText('Base directory for this skill: /x\n\ncounter state root')).toBe(false);
  });

  it('isHarnessInjected still equals role === user && isHarnessText(text)', () => {
    const msg = (role: 'user' | 'assistant', text: string) => ({ role, text });
    expect(isHarnessInjected(msg('user', '<system-reminder>ship it</system-reminder>'))).toBe(true);
    expect(isHarnessInjected(msg('assistant', '<cortex:finding kind="conclusion">x</cortex:finding>'))).toBe(false);
    expect(isHarnessInjected(msg('user', 'Base directory for this skill: /x\n\nRun the daily loop.'))).toBe(false);
    expect(isHarnessInjected(msg('user', 'Approved.'))).toBe(false);
  });
});

describe('isScheduledPromptText — pulse.distil Rule 11(a) as a string predicate', () => {
  it('fires on the skill preamble at the start (after leading whitespace) and on the scheduled-task tag anywhere', () => {
    expect(isScheduledPromptText('Base directory for this skill: /Users/x/.claude/skills/cortex-loop\n\nRun the daily loop.')).toBe(true);
    expect(isScheduledPromptText('\n  Base directory for this skill: /x')).toBe(true);
    expect(isScheduledPromptText('<scheduled-task name="cortex-daily" file="/x.md">run the bundle</scheduled-task>')).toBe(true);
    expect(isScheduledPromptText('run it\n<scheduled-task name="x">bundle</scheduled-task>')).toBe(true);
  });

  it('does not fire on a preamble that is not at the start, or on plain prose', () => {
    expect(isScheduledPromptText('see: Base directory for this skill: /x')).toBe(false);
    expect(isScheduledPromptText('state/ please')).toBe(false);
    expect(isScheduledPromptText('')).toBe(false);
  });

  it('sessionKind still classifies the preamble and the tag as scheduled', () => {
    expect(sessionKind([{ role: 'user', text: 'Base directory for this skill: /x\n\nRun.' }])).toBe('scheduled');
    expect(sessionKind([{ role: 'user', text: '<scheduled-task name="d">run</scheduled-task>' }])).toBe('scheduled');
    expect(sessionKind([{ role: 'user', text: 'state/ please' }])).toBe('interactive');
  });
});

describe('isHarnessPrompt — what hooks.prompt-route Rule 4 is silent for', () => {
  it('AC "Harness-injected prompts never fire": the four prompt shapes are harness-shaped', () => {
    expect(isHarnessPrompt('Another Claude session sent a message:\n<teammate-message teammate_id="x">counter state root</teammate-message>')).toBe(true);
    expect(isHarnessPrompt('<system-reminder>counter state root</system-reminder>')).toBe(true);
    expect(isHarnessPrompt('Base directory for this skill: /x\n\ncounter state root')).toBe(true);
    expect(isHarnessPrompt('[SYSTEM NOTIFICATION] counter state root')).toBe(true);
  });

  it('a plain human line is not', () => {
    expect(isHarnessPrompt('state/ please')).toBe(false);
    expect(isHarnessPrompt("let's pick up T-003 now")).toBe(false);
    expect(isHarnessPrompt('where should the counter live, state or root?')).toBe(false);
  });

  it('is exactly isHarnessText || isScheduledPromptText', () => {
    for (const text of ['<x', '[x', 'Base directory for this skill: /x', 'a <scheduled-task', 'hello', 'x'.repeat(400) + '<system-reminder']) {
      expect(isHarnessPrompt(text)).toBe(isHarnessText(text) || isScheduledPromptText(text));
    }
  });
});
