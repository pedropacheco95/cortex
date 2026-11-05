/** Fixture helpers for the task roster (core-cli.tasks-register Rule 13). */
import * as fs from 'fs';
import * as path from 'path';
import { STORE_V4_TASKS } from '../../src/cli/templates.js';

/** A `cortex/cortex.json` with the given `migration` value; omit it for a fresh store. */
export function writeStoreConfig(root: string, migration?: unknown): void {
  const cfg: Record<string, unknown> = { schemaVersion: '4.0' };
  if (migration !== undefined) cfg['migration'] = migration;
  fs.mkdirSync(path.join(root, 'cortex'), { recursive: true });
  fs.writeFileSync(path.join(root, 'cortex', 'cortex.json'), JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
}

/** Every skill the three tasks require, in `.claude/skills/`. */
export function installRequiredSkills(root: string, except: string[] = []): void {
  for (const skill of new Set(STORE_V4_TASKS.flatMap((t) => t.requiredSkills))) {
    if (except.includes(skill)) continue;
    const dir = path.join(root, '.claude', 'skills', skill);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${skill}\n`, 'utf-8');
  }
}

/** An accepted 4.0 project with its required skills. */
export function acceptedProject(root: string): void {
  writeStoreConfig(root, { accepted: '2026-11-05' });
  installRequiredSkills(root);
}

/** A 3.x project whose migration is not accepted. */
export function unacceptedProject(root: string): void {
  fs.mkdirSync(path.join(root, '.cortex'), { recursive: true });
  fs.writeFileSync(path.join(root, '.cortex', 'cortex.config.json'), '{}\n', 'utf-8');
  writeStoreConfig(root, { accepted: null });
}
