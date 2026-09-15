/**
 * Shared fixtures for the `cortex thread` verb tests (`pulse.threads` Rules
 * 10–13). Seeds a sandboxed tmp project with ledger files written through the
 * real writer, plus the gated directories `promote` reads (`compass/bugs/`,
 * `atlas/decisions/`). Never touches the real repo.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Thread } from '../../src/pulse/threads.js';
import { writeThread, parseThreadFile } from '../../src/pulse/threads.js';
import { readThreadRaw } from './threads.js';

/** Write every thread through the real writer; returns the absolute paths written. */
export function seedThreads(root: string, threads: Thread[]): string[] {
  return threads.map((t) => writeThread(root, t));
}

/** The parsed ledger file for `id`, or null when absent/unparseable. */
export function readThread(root: string, id: string): Thread | null {
  const raw = readThreadRaw(root, id);
  return raw === null ? null : parseThreadFile(raw);
}

/** A minimal schema-valid bug file at `.cortex/compass/bugs/<id>-<slug>.md`. */
export function seedBug(root: string, id: string, slug: string): string {
  const dir = path.join(root, '.cortex', 'compass', 'bugs');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}-${slug}.md`);
  fs.writeFileSync(
    file,
    [
      '---',
      `id: ${id}`,
      `title: ${slug}`,
      'type: test-defect',
      'severity: low',
      'status: open',
      'affects:',
      '  - RULES.md',
      '---',
      '',
      `# ${id} — ${slug}`,
      '',
    ].join('\n'),
    'utf-8',
  );
  return file;
}

/** Create an empty project-relative file so a `bears_on` entry resolves on disk. */
export function touchProjectFile(root: string, rel: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, '', 'utf-8');
}

/** Names of the `.md` files under `.cortex/<rel>` (empty when the dir is absent). */
export function gatedFiles(root: string, rel: string): string[] {
  const dir = path.join(root, '.cortex', ...rel.split('/'));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
}
