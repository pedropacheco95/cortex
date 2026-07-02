/**
 * Thin argv wrapper for `cortex init` (spec core-cli.init), the
 * `cortex hook <name>` dispatch (specs hooks.*, Rule 1),
 * `cortex constellation [--port N]` (spec constellation.renderer, Rule 1),
 * `cortex validate [path] [--json]` (atlas.ingest-skill Rule 4 rider),
 * `cortex pulse-list|pulse-accept|pulse-reject` (spec pulse.review-cli, Rule 1),
 * `cortex pulse-hygiene` (spec pulse.hygiene, Rule 1), and the deterministic
 * loops `cortex loop-rule-decay|loop-atlas-staleness|loop-onboarding-drift|`
 * `loop-spec-drift` (specs loops.*, Rule 1 each).
 */
import { init } from './init.js';

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
