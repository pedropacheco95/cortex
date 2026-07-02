/**
 * Thin argv wrapper for `cortex init` (spec core-cli.init), plus the
 * `cortex hook <name>` dispatch (specs hooks.*, Rule 1).
 */
import { init } from './init.js';

export async function run(argv: string[]): Promise<number> {
  // `cortex hook <name>` — names match init's settings.json registrations.
  if (argv[0] === 'hook') {
    const { main } = await import('../hooks/cli.js');
    return main(argv.slice(1));
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
