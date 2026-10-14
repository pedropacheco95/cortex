/**
 * `cortex store init` (spec store.layout Rule 5): an empty, valid 4.0 store.
 * Idempotent, never overwrites a file; `visibility` is carried over from a
 * 3.x `.cortex/cortex.config.json` when there is one (RULES.md rule 20).
 */
import * as fs from 'fs';
import * as path from 'path';
import { GITIGNORE_LINE, SCHEMA_VERSION_4, STORE_CONFIG, STORE_FOLDERS, storeDir } from './layout.js';

export interface InitResult { created: string[] }

function legacyVisibility(root: string): Record<string, unknown> | null {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf8'));
    const v = cfg?.visibility;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Append the raw-sources ignore line unless `.gitignore` already has it. */
export function ensureGitignore(root: string): boolean {
  const p = path.join(root, '.gitignore');
  const text = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  if (text.split('\n').some((l) => l.trim() === GITIGNORE_LINE || l.trim() === `/${GITIGNORE_LINE}`)) return false;
  fs.writeFileSync(p, text + (text === '' || text.endsWith('\n') ? '' : '\n') + GITIGNORE_LINE + '\n');
  return true;
}

export function storeInit(root: string): InitResult {
  const dir = storeDir(root);
  const created: string[] = [];
  for (const f of STORE_FOLDERS) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      created.push(`cortex/${f}/`);
    }
  }
  const cfgPath = path.join(dir, STORE_CONFIG);
  if (!fs.existsSync(cfgPath)) {
    const visibility = legacyVisibility(root) ?? { repo: 'unknown', allow: [] };
    fs.writeFileSync(cfgPath, JSON.stringify({ schemaVersion: SCHEMA_VERSION_4, visibility }, null, 2) + '\n');
    created.push(`cortex/${STORE_CONFIG}`);
  }
  if (ensureGitignore(root)) created.push('.gitignore');
  return { created };
}
