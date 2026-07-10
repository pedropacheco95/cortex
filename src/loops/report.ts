/**
 * Shared always-write pulse report writer (schema §4.5). Every deterministic
 * loop funnels its single WRITE through here: overwrite the loop's own file
 * under `.cortex/pulse/reports/` with a fresh `generated`, and nothing else —
 * the body carries an explicit "nothing this cycle" line when quiet. The
 * `dir` override lets a caller keep a root-level artefact (distil's
 * `suggestions.md`) at the pulse root while still reusing the header logic.
 */
import * as fs from 'fs';
import * as path from 'path';
import { pulseReportHeader } from '../cli/templates.js';

export function writePulseReport(
  root: string,
  filename: string,
  kind: string,
  loop: string,
  generatedIso: string,
  body: string,
  opts: { dir?: string } = {},
): string {
  const dir = opts.dir ?? path.join(root, '.cortex', 'pulse', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, filename);
  const content = pulseReportHeader(kind, loop, generatedIso) + '\n' + body.replace(/\n*$/, '\n');
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}
