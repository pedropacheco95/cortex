#!/usr/bin/env node
/**
 * Thin argv wrapper for `cortex init` (spec core-cli.init), `cortex sync`
 * (spec core-cli.sync — the existing-project repair/upgrade path init's own
 * refusal message now names), the `cortex hook <name>` dispatch (specs hooks.*, Rule 1),
 * `cortex constellation [--port N]` (spec constellation.renderer, Rule 1),
 * `cortex insight file|concept|element [--json]` — the read-only insight
 * query surface (spec insight.cli, Rule 1; §4.10.8),
 * `cortex validate [path] [--json]` (atlas.ingest-skill Rule 4 rider),
 * `cortex pulse-list|pulse-accept|pulse-reject` (spec pulse.review-cli, Rule 1),
 * `cortex pulse-hygiene` (spec pulse.hygiene, Rule 1), `cortex usage` — the
 * read-side adoption report over session transcripts (spec pulse.usage,
 * Rule 1), `cortex thread list|drop|close|promote` — the human verbs over
 * the threads ledger (spec pulse.threads, Rules 11–12), the deterministic
 * loops `cortex loop-rule-decay|loop-atlas-staleness|loop-onboarding-drift|`
 * `loop-spec-drift|loop-specflow-lint|loop-specflow-verify` (specs loops.*,
 * Rule 1 each), the two collect/judge/propose loops
 * `cortex pulse-distil [--collect|--propose <f>|--no-llm]` (spec pulse.distil,
 * Rule 1 — now also carrying the retired skill-suggest loop's workflow-mining
 * lens, emitting `skill-proposal` suggestions), the collect/judge/report loop
 * `cortex loop-bug-triage [--collect|--report <f>|--no-llm]`
 * (spec loops.bug-triage, Rule 1), the three insight-refresh tiers
 * `cortex insight-refresh-fast` — the exact string the installed git
 * post-commit hook calls (core-cli.init Rule 12 / GIT_HOOK_INVOCATION,
 * with `cortex loop-insight-refresh --fast` as its alias) plus
 * `cortex loop-insight-refresh --daily [--collect|--apply]` and
 * `cortex loop-insight-refresh --full [--collect|--report]`
 * (spec insight.refresh-loops, Rule 1 each), the session-observation loop
 * `cortex loop-session-observe [--collect|--apply [--proposals <f>]]`
 * (spec insight.session-observe, Rule 1), the code-writing test-runner loop
 * `cortex loop-test-runner [--tier ...|--trigger ...|--collect|`
 * `--fix-stage <f>|--no-llm]` with its design-§15 manual alias
 * `cortex test-run` (spec loops.test-runner, Rule 1), plus
 * `cortex tasks rename` — the one-time legacy→scoped scheduled-task
 * migration (core-cli.task-scoping Rule 4) — and `cortex tasks
 * register|verify` — writing/verifying this project's five scheduled-task
 * bundle entries in the Desktop app's scheduled-tasks.json registry
 * (core-cli.tasks-register, B-009 option 1), and the pull side of recall
 * `cortex why <ref> [--json]` / `cortex recall <word…> [--kind k]` (spec
 * recall.why, Rule 1), and `cortex id next rule|bug [--slug <slug>]` — the
 * human allocator over the append-only id registry (spec schema.id-registry,
 * Rule 3).
 *
 * Invocation gate (core-cli.init Rule 18, B-018): `init` runs only on the
 * literal verb `init`; every other unmatched first argument, `--help`, `-h`
 * and a bare `cortex` print the usage text to stdout and exit 2 having
 * written nothing. The usage text is rendered from USAGE_TABLE below; the
 * line after this paragraph is its mirror, asserted equal by
 * tests/atomic/core-cli/dispatch.test.ts so the two cannot drift.
 *
 * Verbs: init, sync, validate, scan, insight, why, recall, usage, thread, id, hook, constellation, tasks, pulse-list, pulse-accept, pulse-reject, pulse-hygiene, pulse-distil, loop-rule-decay, loop-atlas-staleness, loop-onboarding-drift, loop-bug-triage, loop-specflow-lint, loop-specflow-verify, loop-spec-drift, loop-test-runner, test-run, insight-refresh-fast, loop-insight-refresh, loop-session-observe
 */
import { init } from './init.js';
import { PROCESS_PROFILES, isProcessProfile, type ProcessProfile } from './profile.js';

/**
 * Every live verb the dispatcher matches, with a one-line synopsis — the
 * single source of the usage text (core-cli.init Rule 18). Retired verbs
 * (`loop-skill-suggest`, `anatomy-refresh-fast`, `loop-anatomy-refresh`,
 * `loop-insight-gaps`) still match below with a pointed message but are not
 * usage. Order: the everyday verbs first, then loops.
 */
const USAGE_TABLE: readonly (readonly [verb: string, synopsis: string])[] = [
  ['init', 'init [target] [--force] [--yes] [--no-llm] [--partial] [--profile <name>] [--timeout-ms <n>]'],
  ['sync', 'sync [target] [--yes]'],
  ['validate', 'validate [path] [--json]'],
  ['scan', 'scan'],
  ['insight', 'insight file|concept|element <query> [--json]'],
  ['why', 'why <ref> [--json]'],
  ['recall', 'recall <word…> [--kind decision|evidence|thread|observation]'],
  ['usage', 'usage [--record]'],
  ['thread', 'thread list|drop|close|promote …'],
  ['id', 'id next rule|bug [--slug <slug>]'],
  ['hook', 'hook <name>'],
  ['constellation', 'constellation [--port <n>]'],
  ['tasks', 'tasks rename|plan|register|verify'],
  ['pulse-list', 'pulse-list'],
  ['pulse-accept', 'pulse-accept <id>'],
  ['pulse-reject', 'pulse-reject <id>'],
  ['pulse-hygiene', 'pulse-hygiene'],
  ['pulse-distil', 'pulse-distil [--collect|--propose <f>|--no-llm]'],
  ['loop-rule-decay', 'loop-rule-decay'],
  ['loop-atlas-staleness', 'loop-atlas-staleness'],
  ['loop-onboarding-drift', 'loop-onboarding-drift'],
  ['loop-bug-triage', 'loop-bug-triage [--collect|--report <f>|--no-llm]'],
  ['loop-specflow-lint', 'loop-specflow-lint'],
  ['loop-specflow-verify', 'loop-specflow-verify'],
  ['loop-spec-drift', 'loop-spec-drift'],
  ['loop-test-runner', 'loop-test-runner [--tier …|--trigger …|--collect|--fix-stage <f>|--no-llm]'],
  ['test-run', 'test-run [same flags as loop-test-runner]'],
  ['insight-refresh-fast', 'insight-refresh-fast'],
  ['loop-insight-refresh', 'loop-insight-refresh --fast|--daily|--full [--collect|--apply|--report]'],
  ['loop-session-observe', 'loop-session-observe [--collect|--apply [--proposals <f>]]'],
];

/** The verb names, in usage order — what the header docblock's `Verbs:` line mirrors. */
export const USAGE_VERBS: readonly string[] = USAGE_TABLE.map(([verb]) => verb);

/** Exit code for every path that ran nothing: usage, help, an unrecognised verb (Rule 18). */
const USAGE_EXIT = 2;

/**
 * The usage text (core-cli.init Rule 18). With `unrecognised`, the first line
 * names it; the rest is the same for every path. Deterministic — no
 * environment, no package version.
 */
export function usageText(unrecognised?: string): string {
  const lines: string[] = [];
  if (unrecognised !== undefined) lines.push(`cortex: unrecognised argument "${unrecognised}" — nothing ran.`);
  lines.push('Usage: cortex <verb> [options]', '', 'Verbs:');
  for (const [, synopsis] of USAGE_TABLE) lines.push(`  cortex ${synopsis}`);
  lines.push('', 'Run `cortex init` to set up a project; `cortex --help` prints this text.');
  return lines.join('\n');
}

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

/**
 * The pulse/loop verbs that read or write under `.cortex/pulse/`. A single
 * `migratePulseLayout` runs once at the top of the dispatch for any of these,
 * before routing into the specific loop — the invasive alternative is a call
 * duplicated inside every loop's entry function. Hooks are deliberately absent:
 * they self-heal one file at a time (renameIfLegacy) and must not pay for a
 * full-tree scan on their latency-critical paths.
 */
const PULSE_LOOP_COMMANDS = new Set([
  'pulse-list',
  'pulse-accept',
  'pulse-reject',
  'pulse-hygiene',
  'pulse-distil',
  'loop-rule-decay',
  'loop-atlas-staleness',
  'loop-onboarding-drift',
  'loop-bug-triage',
  'loop-specflow-lint',
  'loop-specflow-verify',
  'loop-test-runner',
  'test-run',
  'loop-spec-drift',
  'insight-refresh-fast',
  'loop-insight-refresh',
  'loop-session-observe',
  'usage',
  'thread',
]);

export async function run(argv: string[]): Promise<number> {
  // `cortex hook <name>` — names match init's settings.json registrations.
  if (argv[0] === 'hook') {
    const { main } = await import('../hooks/cli.js');
    return main(argv.slice(1));
  }

  // Single migration chokepoint (pulse reorg): fold any legacy flat
  // `.cortex/pulse/` layout into reports/ + state/ once, before routing into a
  // pulse/loop command. Best-effort — never blocks the loop it precedes.
  if (argv[0] !== undefined && PULSE_LOOP_COMMANDS.has(argv[0])) {
    try {
      const { migratePulseLayout } = await import('../pulse/migrate.js');
      migratePulseLayout('.');
    } catch {
      /* migration is best-effort — a failure never blocks the command */
    }
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
  // `cortex usage` — the read-side adoption report (spec pulse.usage, Rule 1):
  // counts how often Cortex was actually consulted, from session transcripts
  // that already exist. No instrumentation, no runtime cost.
  if (argv[0] === 'usage') {
    try {
      const { runUsage } = await import('../pulse/usage.js');
      // `--record` also writes the run as an atlas evidence file (pulse.usage
      // Rule 12 / atlas.evidence Rule 5): a user-invoked verb is a human act.
      return await runUsage('.', { record: argv.includes('--record') });
    } catch (err) {
      console.error(`cortex usage: ${(err as Error).message}`);
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
  // `cortex loop-skill-suggest` — RETIRED at v3.0 (owner decision): the
  // standalone workflow-mining loop is gone. Its judgment folds into
  // `cortex-pulse-distil` as an extra lens — a workflow-shaped cross-session
  // pattern is emitted as a `skill-proposal` pulse suggestion on distil's
  // existing collect/propose bookends. Pointed message so the verb never falls
  // through to `cortex init <target>`.
  if (argv[0] === 'loop-skill-suggest') {
    console.error(
      'cortex loop-skill-suggest: retired in v3 — skill-suggest has been folded into pulse-distil\'s ' +
        'workflow-mining lens (workflow-shaped patterns become `skill-proposal` suggestions). ' +
        'Run `cortex pulse-distil` instead (or the cortex-pulse-distil skill).',
    );
    return 1;
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
  // `cortex anatomy-refresh-fast` — RETIRED at build-order-v3 step 7 (anatomy
  // deprecation, design §5.10): the post-commit git hook consolidates onto
  // `cortex insight-refresh-fast`. A STALE git hook still calling this verb
  // must never disturb a commit, so it exits 0 silently on stdout-suppressed
  // hook invocations — the pointed message goes to stderr.
  if (argv[0] === 'anatomy-refresh-fast') {
    console.error(
      'cortex anatomy-refresh-fast: retired in v3 — anatomy is absorbed into insight (design §5.10). ' +
        'The post-commit fast tier is `cortex insight-refresh-fast`; re-run `cortex init --force` to refresh the git hook.',
    );
    return 0; // hook-safe: a stale post-commit hook must never fail the commit
  }
  // `cortex loop-anatomy-refresh` — RETIRED at build-order-v3 step 7. Pointed
  // message so the verb never falls through to `cortex init <target>`.
  if (argv[0] === 'loop-anatomy-refresh') {
    console.error(
      'cortex loop-anatomy-refresh: retired in v3 — anatomy is absorbed into insight (design §5.10). ' +
        'Fast tier: `cortex insight-refresh-fast` (git post-commit hook). Deep/daily maintenance: the insight refresh ' +
        'loops — `cortex loop-insight-refresh --daily|--full` with the cortex-loop-insight-refresh-* skills.',
    );
    return 1;
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
  // `cortex insight-refresh-fast` — the exact command the installed git
  // post-commit hook calls for the insight fast tier (insight.refresh-loops
  // Rule 1; schema §9.1 — cortex-loop-insight-refresh-fast is the git hook,
  // not a scheduled task). Hook-safe: degrades internally, always exits 0.
  if (argv[0] === 'insight-refresh-fast') {
    const { runInsightRefreshFast } = await import('../insight/refresh-fast.js');
    return await runInsightRefreshFast('.');
  }
  // `cortex loop-insight-refresh --fast|--daily|--full [...]` — the three v3
  // insight-refresh tiers (insight.refresh-loops Rule 1). --fast dispatches
  // identically to `insight-refresh-fast`; --daily is collect/judge/apply
  // (the judgment middle is the shipped daily skill); --full is
  // collect/regenerate/report (the regeneration middle is the full skill).
  // The v2 `cortex loop-insight-refresh [--collect|--apply <f>]` node-set
  // maintainer is retired (design §8.3) — a tier flag is now required.
  if (argv[0] === 'loop-insight-refresh') {
    const rest = argv.slice(1);
    const fast = rest.includes('--fast');
    const daily = rest.includes('--daily');
    const full = rest.includes('--full');
    if (Number(fast) + Number(daily) + Number(full) !== 1) {
      console.error(
        'cortex loop-insight-refresh: exactly one of --fast, --daily, or --full is required ' +
          '(the v2 tierless form is retired — schema §9.1, design §8.3).',
      );
      return 1;
    }
    try {
      if (fast) {
        const { runInsightRefreshFast } = await import('../insight/refresh-fast.js');
        return await runInsightRefreshFast('.');
      }
      const collect = rest.includes('--collect');
      if (daily) {
        const { runRefreshDaily } = await import('../insight/refresh-daily.js');
        return await runRefreshDaily('.', { collect, apply: rest.includes('--apply') });
      }
      const { runRefreshFull } = await import('../insight/refresh-full.js');
      return await runRefreshFull('.', { collect, report: rest.includes('--report') });
    } catch (err) {
      console.error(`cortex loop-insight-refresh: ${(err as Error).message}`);
      return 1;
    }
  }

  // `cortex loop-session-observe [--collect|--apply [--proposals <f>]]` — the
  // v3 session-observation loop (spec insight.session-observe, Rule 1; design
  // §9). --collect reuses the shared distil corpus and emits the unobserved-
  // sessions worklist; --apply audits the skill's ungated enrichments, lands
  // gated candidates as typed pulse proposals, and advances the observed
  // state. The judgment middle is the shipped skill — Core never runs it.
  if (argv[0] === 'loop-session-observe') {
    const rest = argv.slice(1);
    const collect = rest.includes('--collect');
    const apply = rest.includes('--apply');
    let proposalsFile: string | undefined;
    const pIdx = rest.indexOf('--proposals');
    if (pIdx >= 0) {
      proposalsFile = rest[pIdx + 1];
      if (!proposalsFile || proposalsFile.startsWith('-')) {
        console.error('cortex loop-session-observe: --proposals requires a candidates JSON file path.');
        return 1;
      }
    }
    try {
      const { runSessionObserve } = await import('../insight/session-observe.js');
      return await runSessionObserve('.', {
        collect,
        apply,
        ...(proposalsFile !== undefined ? { proposalsFile } : {}),
      });
    } catch (err) {
      console.error(`cortex loop-session-observe: ${(err as Error).message}`);
      return 1;
    }
  }

  // `cortex loop-insight-gaps` — RETIRED at v3 (design §8.3, §9): the v2
  // session-observation mechanism is gone; its role re-homes to
  // `cortex-loop-session-observe` (build-order-v3 step 6). Pointed message so
  // the verb never falls through to `cortex init <target>`.
  if (argv[0] === 'loop-insight-gaps') {
    console.error(
      'cortex loop-insight-gaps: retired in v3 — the session-observation role moved to ' +
        'cortex-loop-session-observe (design §9); the five-gap-signal mechanism no longer exists.',
    );
    return 1;
  }

  // `cortex scan` — recompile the curated citation graph to
  // `.cortex/constellation.json` (schema §4.9). v3 note (build-order-v3 step
  // 7): the v1/v2 anatomy scan half is retired with the anatomy module; the
  // verb keeps its constellation-compiler half so the renderer's
  // "run cortex scan" contract still holds.
  if (argv[0] === 'scan') {
    try {
      const { compile } = await import('../constellation/compile.js');
      const constellation = await compile('.');
      // 3.4: the recall index is compiled after the constellation (schema
      // §4.11; recall.recall-index Rule 11) — the second regenerable file.
      const { writeRecallIndex } = await import('../recall/index.js');
      const recall = await writeRecallIndex('.');
      // recall.index-blocks Rule 6: the generated blocks in the two atlas
      // indexes are rewritten from the in-process index, after it is written.
      const { writeRecallIndexBlocks } = await import('../recall/index-blocks.js');
      const blocks = writeRecallIndexBlocks('.', recall);
      console.log(
        `cortex scan: wrote .cortex/constellation.json (${constellation.nodes.length} node(s), ${constellation.edges.length} edge(s), ${constellation.counters.droppedRefs} dropped ref(s)); ` +
          `recall index: ${recall.counters.subjects} subject(s), ${recall.counters.entries} ${recall.counters.entries === 1 ? 'entry' : 'entries'}; ` +
          `index blocks: ${blocks.written.length} written.`,
      );
      return 0;
    } catch (err) {
      console.error(`cortex scan: ${(err as Error).message}`);
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

  // `cortex thread list|drop|close|promote …` — the human verbs over the
  // threads ledger (pulse.threads Rule 11; promote is Rule 12's draft of a
  // gated file, the thread counterpart of pulse-accept). Runs under the
  // PULSE_LOOP_COMMANDS chokepoint above like the other pulse verbs.
  if (argv[0] === 'thread') {
    const { threadCli } = await import('../pulse/thread-cli.js');
    return threadCli(argv.slice(1));
  }

  // `cortex id next rule|bug [--slug <slug>]` — allocate the next R-NNN/B-NNN
  // by appending one line to `.cortex/compass/registry.md` and print the id
  // alone on stdout so a skill or shell can capture it (schema.id-registry
  // Rule 3). Bad grammar → one usage line on stderr, exit 2, nothing written;
  // no `.cortex/` → exit 1 naming `cortex init`.
  if (argv[0] === 'id') {
    const usage = 'Usage: cortex id next rule|bug [--slug <slug>]';
    const rest = argv.slice(1);
    const kind = rest[1];
    if (rest[0] !== 'next' || (kind !== 'rule' && kind !== 'bug')) {
      console.error(usage);
      return USAGE_EXIT;
    }
    let slug: string | undefined;
    for (let i = 2; i < rest.length; i++) {
      const value = rest[i + 1];
      if (rest[i] === '--slug' && slug === undefined && value !== undefined && !value.startsWith('-')) {
        slug = value;
        i++;
        continue;
      }
      console.error(usage);
      return USAGE_EXIT;
    }
    const fs = await import('fs');
    const path = await import('path');
    if (!fs.existsSync(path.join(process.cwd(), '.cortex', 'cortex.config.json'))) {
      console.error('cortex id: no .cortex/ found in the current directory — run `cortex init` first.');
      return 1;
    }
    try {
      const { allocateId } = await import('../compass/registry.js');
      console.log(allocateId('.', kind, slug));
      return 0;
    } catch (err) {
      console.error(`cortex id: ${(err as Error).message}`);
      return 1;
    }
  }

  // `cortex why <ref> [--json]` / `cortex recall <word…> [--kind k]` — the
  // pull side of recall over `.cortex/recall-index.json` (recall.why Rules
  // 1–7). Index-only, read-only; the verb is passed through so the module
  // owns both grammars. Never reaches the Rule 18 gate below.
  if (argv[0] === 'why' || argv[0] === 'recall') {
    const { recallCli } = await import('../recall/cli.js');
    return recallCli(argv, '.');
  }

  // `cortex insight file|concept|element [--json]` — the deterministic,
  // read-only query surface over `.cortex/insight/` (insight.cli Rules 1–3,
  // §4.10.8). No LLM at query time, no network, no writes. The v2 verbs
  // query|get|neighbors|list are retired (pointed migration message).
  if (argv[0] === 'insight') {
    const { insightCli } = await import('../insight/cli.js');
    return insightCli(argv[1], argv.slice(2));
  }

  // `cortex tasks rename` — move legacy-named scheduled tasks in
  // ~/.claude/scheduled-tasks/ to this project's §9.1 scoped names
  // (core-cli.task-scoping Rule 4; idempotent, exit 0).
  // `cortex tasks plan [--json]` — print the desired registration plan (the
  //   authoritative source the cortex-register-tasks skill consumes).
  // `cortex tasks register|verify` — the guarded direct-write fallback /
  //   read-only verification against the Desktop app's scheduled-tasks.json
  //   registry (core-cli.tasks-register; B-009 final mechanism). The real
  //   home, app-support root, and Desktop-app process check are supplied ONLY
  //   here — the functions take them as parameters so tests run against
  //   fixtures with injected fakes.
  if (argv[0] === 'tasks') {
    if (argv[1] === 'rename') {
      const { tasksRename } = await import('./task-scoping.js');
      const os = await import('os');
      const result = tasksRename(os.homedir(), process.cwd());
      console.log(result.output);
      return result.exitCode;
    }
    if (argv[1] === 'plan') {
      const { tasksPlan } = await import('./tasks-register.js');
      const os = await import('os');
      const result = tasksPlan({ projectRoot: process.cwd(), home: os.homedir() }, argv.includes('--json'));
      console.log(result.output);
      return result.exitCode;
    }
    if (argv[1] === 'register' || argv[1] === 'verify') {
      const { registerTasks, verifyTasks, desktopAppRunning } = await import('./tasks-register.js');
      const os = await import('os');
      const path = await import('path');
      const home = os.homedir();
      const opts = {
        projectRoot: process.cwd(),
        home,
        appSupportDir: path.join(home, 'Library', 'Application Support', 'Claude'),
      };
      const result =
        argv[1] === 'register'
          ? registerTasks({ ...opts, isDesktopAppRunning: desktopAppRunning })
          : verifyTasks(opts);
      if (result.exitCode === 0) console.log(result.output);
      else console.error(result.output);
      return result.exitCode;
    }
    console.error('cortex tasks: unknown subcommand — expected `cortex tasks rename|plan|register|verify`.');
    return 1;
  }

  // `cortex sync` — repair/upgrade an EXISTING project (spec core-cli.sync).
  // No --force flag (Rule 12: every write is a merge/append/judgment-gated
  // upgrade, never an unconditional overwrite).
  if (argv[0] === 'sync') {
    const yes = argv.includes('--yes') || argv.includes('-y');
    const positional = argv.slice(1).filter((a) => !a.startsWith('-'));
    const target = positional[0] ?? '.';
    try {
      const { sync } = await import('./sync.js');
      const onProgress = (message: string): void => {
        process.stderr.write(`cortex sync: ${message}\n`);
      };
      const { exitCode, summary } = await sync(target, { yes, onProgress });
      if (exitCode === 0) console.log(summary);
      else console.error(summary);
      return exitCode;
    } catch (err) {
      console.error(`cortex sync: ${(err as Error).message}`);
      return 1;
    }
  }

  // `cortex init [target] […]` — ONLY on the literal verb (core-cli.init Rule
  // 18, B-018). The verb is stripped before init's own flags and target are
  // parsed, so index 0 of `rest` is a real positional — the old fall-through
  // parsed the whole argv and kept the verb out of the target only because an
  // absent `--timeout-ms`/`--profile` made `indexOf(-1) + 1 === 0` exclude it.
  if (argv[0] === 'init') {
    const rest = argv.slice(1);
    const force = rest.includes('--force');
    const yes = rest.includes('--yes') || rest.includes('-y');
    const noLlm = rest.includes('--no-llm');
    const partial = rest.includes('--partial');

    // `--profile <name>` (spec core-cli.init-profile Rule 2). Omitted → the
    // default; an unrecognised value is a usage error, never a silent fallback,
    // because a typo would quietly schedule the wrong loop set.
    let profile: ProcessProfile | undefined;
    const profileIdx = rest.indexOf('--profile');
    if (profileIdx >= 0) {
      const value = rest[profileIdx + 1];
      if (!isProcessProfile(value)) {
        process.stderr.write(
          `cortex init: unknown --profile ${value === undefined ? '(missing value)' : `"${value}"`}. ` +
            `Valid profiles: ${PROCESS_PROFILES.join(', ')}. Nothing was written.\n`,
        );
        return 2;
      }
      profile = value;
    }

    let timeoutMs: number | undefined;
    const timeoutIdx = rest.indexOf('--timeout-ms');
    if (timeoutIdx >= 0) {
      const parsed = Number(rest[timeoutIdx + 1]);
      if (Number.isFinite(parsed) && parsed > 0) timeoutMs = parsed;
    }

    const positional = rest.filter(
      (a, i) =>
        !a.startsWith('-') && (timeoutIdx < 0 || i !== timeoutIdx + 1) && (profileIdx < 0 || i !== profileIdx + 1),
    );
    const target = positional[0] ?? '.';

    try {
      const { exitCode, summary } = await init(target, {
        force,
        yes,
        noLlm,
        partial,
        ...(profile !== undefined ? { profile } : {}),
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

  // Rule 18's terminal branches: nothing ran, nothing is written, exit 2.
  // `--help`, `-h` and a bare `cortex` print the plain usage; any other
  // unmatched first argument (a mistyped verb, `--version`, …) is named on
  // the first line. Bare `cortex` is NOT an init alias (owner decision).
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    console.log(usageText());
    return USAGE_EXIT;
  }
  console.log(usageText(argv[0]));
  return USAGE_EXIT;
}

// Guard: only run CLI when invoked directly.
const scriptUrl = import.meta.url;
const scriptPath = process.argv[1];
if (scriptPath && (scriptUrl.endsWith(scriptPath) || scriptUrl.endsWith(scriptPath.replace(/\\/g, '/')))) {
  run(process.argv.slice(2)).then(process.exit);
}
