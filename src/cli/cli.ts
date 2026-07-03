#!/usr/bin/env node
/**
 * Thin argv wrapper for `cortex init` (spec core-cli.init), the
 * `cortex hook <name>` dispatch (specs hooks.*, Rule 1),
 * `cortex constellation [--port N]` (spec constellation.renderer, Rule 1),
 * `cortex validate [path] [--json]` (atlas.ingest-skill Rule 4 rider),
 * `cortex pulse-list|pulse-accept|pulse-reject` (spec pulse.review-cli, Rule 1),
 * `cortex pulse-hygiene` (spec pulse.hygiene, Rule 1), the deterministic
 * loops `cortex loop-rule-decay|loop-atlas-staleness|loop-onboarding-drift|`
 * `loop-spec-drift|loop-specflow-lint|loop-specflow-verify` (specs loops.*,
 * Rule 1 each), the two collect/judge/propose loops
 * `cortex pulse-distil [--collect|--propose <f>|--no-llm]` (spec pulse.distil,
 * Rule 1) and `cortex loop-skill-suggest [--propose <f>]`
 * (spec loops.skill-suggest, Rule 1), the collect/judge/report loop
 * `cortex loop-bug-triage [--collect|--report <f>|--no-llm]`
 * (spec loops.bug-triage, Rule 1), and the two anatomy refresh tiers:
 * `cortex anatomy-refresh-fast` — the exact string the installed git
 * post-commit hook calls (core-cli.init Rule 12 / GIT_HOOK_INVOCATION) —
 * with `cortex loop-anatomy-refresh --fast` as its identical design-§15
 * alias (spec anatomy.refresh-fast, Rule 1), and
 * `cortex loop-anatomy-refresh --deep [--collect|--apply <f>|--no-llm]`
 * (spec anatomy.refresh-deep, Rule 1), the code-writing test-runner loop
 * `cortex loop-test-runner [--tier ...|--trigger ...|--collect|`
 * `--fix-stage <f>|--no-llm]` with its design-§15 manual alias
 * `cortex test-run` (spec loops.test-runner, Rule 1), plus
 * `cortex tasks rename` — the one-time legacy→scoped scheduled-task
 * migration (core-cli.task-scoping Rule 4).
 */
import { init } from './init.js';

/** Shared flag parsing for the collect/judge/propose-or-report-or-apply loops. */
function parseLoopFlags(
  command: string,
  rest: string[],
  fileFlag: '--propose' | '--report' | '--apply' = '--propose',
  fileNoun = 'candidates',
): { collect: boolean; noLlm: boolean; file?: string; timeoutMs?: number } | null {
  const collect = rest.includes('--collect');
  const noLlm = rest.includes('--no-llm');
  const fileIdx = rest.indexOf(fileFlag);
  let file: string | undefined;
  if (fileIdx >= 0) {
    file = rest[fileIdx + 1];
    if (!file || file.startsWith('-')) {
      console.error(`cortex ${command}: ${fileFlag} requires a ${fileNoun} JSON file path.`);
      return null;
    }
  }
  let timeoutMs: number | undefined;
  const timeoutIdx = rest.indexOf('--timeout-ms');
  if (timeoutIdx >= 0) {
    const parsed = Number(rest[timeoutIdx + 1]);
    if (Number.isFinite(parsed) && parsed > 0) timeoutMs = parsed;
  }
  return {
    collect,
    noLlm,
    ...(file !== undefined ? { file } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}

export async function run(argv: string[]): Promise<number> {
  // `cortex hook <name>` — names match init's settings.json registrations.
  if (argv[0] === 'hook') {
    const { main } = await import('../hooks/cli.js');
    return main(argv.slice(1));
  }

  // `cortex validate [path] [--json]` — wires the schema validator's existing
  // run(); exit 0 conformant / 1 not (atlas.ingest-skill Rule 4).
  if (argv[0] === 'validate') {
    const { run: validateRun } = await import('../schema/cli.js');
    return validateRun(argv.slice(1));
  }

  // `cortex pulse-list|pulse-accept|pulse-reject` — the pulse review gate
  // (pulse.review-cli Rule 1).
  if (argv[0] === 'pulse-list' || argv[0] === 'pulse-accept' || argv[0] === 'pulse-reject') {
    const { pulseCli } = await import('../pulse/review.js');
    return pulseCli(argv[0], argv.slice(1));
  }

  // `cortex pulse-hygiene` + the four deterministic loops — each writes only
  // its own pulse report and exits 0 on clean runs (schema §4.5 always-write).
  if (argv[0] === 'pulse-hygiene') {
    try {
      const { runHygiene } = await import('../pulse/hygiene.js');
      return await runHygiene('.');
    } catch (err) {
      console.error(`cortex pulse-hygiene: ${(err as Error).message}`);
      return 1;
    }
  }
  if (argv[0] === 'loop-rule-decay') {
    try {
      const { runRuleDecay } = await import('../loops/rule-decay.js');
      return await runRuleDecay('.');
    } catch (err) {
      console.error(`cortex loop-rule-decay: ${(err as Error).message}`);
      return 1;
    }
  }
  if (argv[0] === 'loop-atlas-staleness') {
    try {
      const { runAtlasStaleness } = await import('../loops/atlas-staleness.js');
      return await runAtlasStaleness('.');
    } catch (err) {
      console.error(`cortex loop-atlas-staleness: ${(err as Error).message}`);
      return 1;
    }
  }
  if (argv[0] === 'loop-onboarding-drift') {
    try {
      const { runOnboardingDrift } = await import('../loops/onboarding-drift.js');
      return await runOnboardingDrift('.');
    } catch (err) {
      console.error(`cortex loop-onboarding-drift: ${(err as Error).message}`);
      return 1;
    }
  }
  // `cortex pulse-distil [--collect|--propose <file>|--no-llm]` — the weekly
  // session-distillation loop (pulse.distil Rule 1).
  if (argv[0] === 'pulse-distil') {
    const flags = parseLoopFlags('pulse-distil', argv.slice(1));
    if (flags === null) return 1;
    try {
      const { runDistil } = await import('../pulse/distil.js');
      const { file, ...rest } = flags;
      return await runDistil('.', { ...rest, ...(file !== undefined ? { proposeFile: file } : {}) });
    } catch (err) {
      console.error(`cortex pulse-distil: ${(err as Error).message}`);
      return 1;
    }
  }
  // `cortex loop-skill-suggest [--propose <file>]` — the workflow-mining
  // sibling (loops.skill-suggest Rule 1; same modes as pulse-distil).
  if (argv[0] === 'loop-skill-suggest') {
    const flags = parseLoopFlags('loop-skill-suggest', argv.slice(1));
    if (flags === null) return 1;
    try {
      const { runSkillSuggest } = await import('../loops/skill-suggest.js');
      const { file, ...rest } = flags;
      return await runSkillSuggest('.', { ...rest, ...(file !== undefined ? { proposeFile: file } : {}) });
    } catch (err) {
      console.error(`cortex loop-skill-suggest: ${(err as Error).message}`);
      return 1;
    }
  }
  // `cortex loop-bug-triage [--collect|--report <file>|--no-llm]` — the daily
  // bug-ledger triage loop (loops.bug-triage Rule 1; collect/judge/report).
  if (argv[0] === 'loop-bug-triage') {
    const flags = parseLoopFlags('loop-bug-triage', argv.slice(1), '--report', 'results');
    if (flags === null) return 1;
    try {
      const { runBugTriage } = await import('../loops/bug-triage.js');
      const { file, ...rest } = flags;
      return await runBugTriage('.', { ...rest, ...(file !== undefined ? { reportFile: file } : {}) });
    } catch (err) {
      console.error(`cortex loop-bug-triage: ${(err as Error).message}`);
      return 1;
    }
  }
  // `cortex loop-specflow-lint` — the daily structural spec-lint record
  // (loops.lint-scheduled Rule 1; exit 0 clean or dirty).
  if (argv[0] === 'loop-specflow-lint') {
    try {
      const { runLintScheduled } = await import('../loops/lint-scheduled.js');
      return await runLintScheduled('.');
    } catch (err) {
      console.error(`cortex loop-specflow-lint: ${(err as Error).message}`);
      return 1;
    }
  }
  // `cortex loop-specflow-verify` — the daily owed-tests coverage record
  // (loops.verify-scheduled Rule 1; exit 0 regardless).
  if (argv[0] === 'loop-specflow-verify') {
    try {
      const { runVerifyScheduled } = await import('../loops/verify-scheduled.js');
      return await runVerifyScheduled('.');
    } catch (err) {
      console.error(`cortex loop-specflow-verify: ${(err as Error).message}`);
      return 1;
    }
  }
  // `cortex anatomy-refresh-fast` — the exact command the installed git
  // post-commit hook calls (anatomy.refresh-fast Rule 1). Hook-safe: the
  // runner degrades internally and always exits 0.
  if (argv[0] === 'anatomy-refresh-fast') {
    const { runRefreshFast } = await import('../anatomy/refresh-fast.js');
    return await runRefreshFast('.');
  }
  // `cortex loop-anatomy-refresh --fast|--deep [...]` — the design-§15 form.
  // --fast dispatches identically to `anatomy-refresh-fast`; --deep is the
  // collect/judge/apply purpose-filler (anatomy.refresh-deep Rule 1).
  if (argv[0] === 'loop-anatomy-refresh') {
    const rest = argv.slice(1);
    const fast = rest.includes('--fast');
    const deep = rest.includes('--deep');
    if (fast === deep) {
      console.error('cortex loop-anatomy-refresh: exactly one of --fast or --deep is required.');
      return 1;
    }
    if (fast) {
      const { runRefreshFast } = await import('../anatomy/refresh-fast.js');
      return await runRefreshFast('.');
    }
    const flags = parseLoopFlags('loop-anatomy-refresh', rest, '--apply', 'results');
    if (flags === null) return 1;
    try {
      const { runRefreshDeep } = await import('../anatomy/refresh-deep.js');
      const { file, ...restFlags } = flags;
      return await runRefreshDeep('.', { ...restFlags, ...(file !== undefined ? { applyFile: file } : {}) });
    } catch (err) {
      console.error(`cortex loop-anatomy-refresh: ${(err as Error).message}`);
      return 1;
    }
  }
  // `cortex loop-test-runner [--tier ...|--trigger ...|--collect|--fix-stage <f>|--no-llm]`
  // — the code-writing loop (loops.test-runner Rule 1). `cortex test-run` is
  // the manual alias (design §15): identical flags, default trigger `manual`.
  if (argv[0] === 'loop-test-runner' || argv[0] === 'test-run') {
    const command = argv[0];
    try {
      const { parseTestRunnerFlags, runTestRunner } = await import('../loops/test-runner.js');
      const flags = parseTestRunnerFlags(command, argv.slice(1), command === 'test-run' ? 'manual' : 'scheduled');
      if (flags === null) return 1;
      const { fixStageFile, timeoutMs, ...rest } = flags;
      return await runTestRunner('.', {
        ...rest,
        ...(fixStageFile !== undefined ? { fixStageFile } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      });
    } catch (err) {
      console.error(`cortex ${command}: ${(err as Error).message}`);
      return 1;
    }
  }
  if (argv[0] === 'loop-spec-drift') {
    try {
      const { runSpecDrift } = await import('../loops/spec-drift.js');
      return await runSpecDrift('.');
    } catch (err) {
      console.error(`cortex loop-spec-drift: ${(err as Error).message}`);
      return 1;
    }
  }

  // `cortex constellation [--port N]` — localhost-only read-only renderer
  // server (constellation.renderer Rules 1-2). Prints the URL, never opens a
  // browser; runs until Ctrl-C (nothing persists).
  if (argv[0] === 'constellation') {
    const { serveConstellation, DEFAULT_PORT } = await import('../constellation/server.js');
    let port = DEFAULT_PORT;
    const portIdx = argv.indexOf('--port');
    if (portIdx >= 0) {
      const parsed = Number(argv[portIdx + 1]);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
        console.error('cortex constellation: --port requires an integer between 0 and 65535');
        return 1;
      }
      port = parsed;
    }
    try {
      const server = await serveConstellation('.', port);
      await new Promise<void>((resolve) => server.once('close', resolve));
      return 0;
    } catch (err) {
      console.error(`cortex constellation: ${(err as Error).message}`);
      return 1;
    }
  }

  // `cortex tasks rename` — move legacy-named scheduled tasks in
  // ~/.claude/scheduled-tasks/ to this project's §9.1 scoped names
  // (core-cli.task-scoping Rule 4; idempotent, exit 0).
  if (argv[0] === 'tasks') {
    if (argv[1] === 'rename') {
      const { tasksRename } = await import('./task-scoping.js');
      const os = await import('os');
      const result = tasksRename(os.homedir(), process.cwd());
      console.log(result.output);
      return result.exitCode;
    }
    console.error('cortex tasks: unknown subcommand — expected `cortex tasks rename`.');
    return 1;
  }

  // Otherwise argv is everything after `cortex init`.
  const force = argv.includes('--force');
  const yes = argv.includes('--yes') || argv.includes('-y');
  const noLlm = argv.includes('--no-llm');
  const partial = argv.includes('--partial');

  let timeoutMs: number | undefined;
  const timeoutIdx = argv.indexOf('--timeout-ms');
  if (timeoutIdx >= 0) {
    const parsed = Number(argv[timeoutIdx + 1]);
    if (Number.isFinite(parsed) && parsed > 0) timeoutMs = parsed;
  }

  const positional = argv.filter((a, i) => !a.startsWith('-') && i !== timeoutIdx + 1);
  const target = positional[0] ?? '.';

  try {
    const { exitCode, summary } = await init(target, {
      force,
      yes,
      noLlm,
      partial,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    });
    if (exitCode === 1 || exitCode === 2) {
      console.error(summary);
    } else {
      console.log(summary);
    }
    return exitCode;
  } catch (err) {
    console.error(`cortex init: ${(err as Error).message}`);
    return 1;
  }
}

// Guard: only run CLI when invoked directly.
const scriptUrl = import.meta.url;
const scriptPath = process.argv[1];
if (scriptPath && (scriptUrl.endsWith(scriptPath) || scriptUrl.endsWith(scriptPath.replace(/\\/g, '/')))) {
  run(process.argv.slice(2)).then(process.exit);
}
