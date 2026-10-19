/**
 * `cortex migrate [--plan <file>] [--redact <file>] [--visibility public|private] [--report <file>] [--json] [--apply|--accept] [--today YYYY-MM-DD]`
 * (spec store.migrate). Dry run by default.
 */
import { localToday } from '../types.js';
import { migrate } from './run.js';

export const MIGRATE_USAGE = 'cortex migrate [--plan <file>] [--redact <file>] [--visibility public|private] [--report <file>] [--json] [--apply|--accept] [--today YYYY-MM-DD]';

export interface MigrateCliIO { stdout?: (line: string) => void; stderr?: (line: string) => void; home?: string }

export async function migrateCli(args: string[], root = '.', io: MigrateCliIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((l: string) => console.log(l));
  const stderr = io.stderr ?? ((l: string) => console.error(l));
  const value = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const known = new Set(['--plan', '--redact', '--visibility', '--report', '--json', '--apply', '--accept', '--today']);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!known.has(a)) {
      stderr(`cortex migrate: unknown argument "${a}". Usage: ${MIGRATE_USAGE}`);
      return 2;
    }
    if (['--plan', '--redact', '--visibility', '--report', '--today'].includes(a)) i++;
  }
  if (args.includes('--apply') && args.includes('--accept')) {
    stderr('cortex migrate: --apply and --accept are separate steps');
    return 2;
  }
  const today = value('--today') ?? localToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    stderr(`cortex migrate: --today needs YYYY-MM-DD, got "${today}"`);
    return 2;
  }
  const visibility = value('--visibility');
  if (visibility !== undefined && visibility !== 'public' && visibility !== 'private') {
    stderr(`cortex migrate: --visibility needs public or private, got "${visibility}"`);
    return 2;
  }
  const r = migrate(root, {
    plan: value('--plan'), redact: value('--redact'), report: value('--report'), json: args.includes('--json'),
    apply: args.includes('--apply'), accept: args.includes('--accept'), today, visibility, home: io.home,
  });
  for (const l of r.out) (r.exitCode === 0 ? stdout : stderr)(l);
  return r.exitCode;
}
