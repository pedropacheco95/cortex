import { validate } from './validate.js';
import type { ValidationReport } from './types.js';

function formatReport(report: ValidationReport): string {
  const lines: string[] = [];
  lines.push(`Cortex Schema Validator`);
  lines.push(`Target: ${report.target}`);
  lines.push(`Schema version: ${report.schemaVersion}`);
  lines.push(`Conformant: ${report.conformant ? 'YES' : 'NO'}`);
  lines.push(`Errors: ${report.counts.error}, Warnings: ${report.counts.warning}`);
  lines.push('');

  if (report.violations.length === 0) {
    lines.push('No violations found.');
  } else {
    for (const v of report.violations) {
      const loc = [v.location.path, v.location.key, v.location.line].filter(Boolean).join(':');
      lines.push(`[${v.severity.toUpperCase()}] ${v.check} (${v.clause})`);
      lines.push(`  ${loc}`);
      lines.push(`  ${v.message}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

export async function run(argv: string[]): Promise<number> {
  const jsonMode = argv.includes('--json');
  const args = argv.filter((a) => !a.startsWith('--'));
  const target = args[0] ?? '.';

  const report = await validate(target);

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }

  return report.conformant ? 0 : 1;
}

// Guard: only run CLI when invoked directly
const scriptUrl = import.meta.url;
const scriptPath = process.argv[1];
if (scriptPath && (scriptUrl.endsWith(scriptPath) || scriptUrl.endsWith(scriptPath.replace(/\\/g, '/')))) {
  run(process.argv.slice(2)).then(process.exit);
}
