/**
 * Temp-root helpers for validator tests that plant compass rules and bugs
 * (schema.validator Rules 12–14, wave follow-up A). Mirrors the local
 * `makeTmpFixture`/`cleanup` pair in tests/atomic/schema/validator.test.ts —
 * a copy of tests/fixtures/valid under os.tmpdir(), removed by the caller.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { registerId } from '../../src/compass/registry.js';

export const VALID_FIXTURE = path.resolve('/Users/pedropacheco1/Documents/Projetos/cortex/tests/fixtures/valid');
export const REPO_ROOT = path.resolve('/Users/pedropacheco1/Documents/Projetos/cortex');

function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

export function makeTmpFixture(testName: string): string {
  const tmpDir = path.join(os.tmpdir(), `cortex-test-${testName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  copyDir(VALID_FIXTURE, tmpDir);
  return tmpDir;
}

export function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function rulesDir(root: string): string {
  return path.join(root, '.cortex', 'compass', 'rules');
}

export function bugsDir(root: string): string {
  return path.join(root, '.cortex', 'compass', 'bugs');
}

/**
 * Register a planted file's id in the fixture copy's `compass/registry.md`
 * (schema.id-registry Rule 5: a file whose id is on no line is an error), so
 * a test that plants files to exercise OTHER checks stays conformant. A second
 * file with the same id (the B-019 duplicate scenario) is a registry conflict
 * and is simply not registered again — the id is already on a line.
 */
function registerPlanted(root: string, filename: string, id: string): void {
  const slug = filename.replace(/^[RB]-\d{3,}-?/, '').replace(/\.md$/, '');
  registerId(root, id, slug || 'reserved');
}

/**
 * A compass rule that is individually valid under check.rule: a resolving
 * `source:` (the fixture's atlas decision) and a `governs:` glob that matches
 * the fixture's one dev spec. `h1` defaults to `# <id> — <title>`. The id is
 * registered in the registry unless `register: false` (to plant a file the
 * registry does not know about).
 */
export function writeRule(root: string, filename: string, id: string, opts: { title?: string; h1?: string | null; register?: boolean } = {}): string {
  const title = opts.title ?? `Rule ${id}`;
  const h1 = opts.h1 === undefined ? `# ${id} — ${title}` : opts.h1;
  const filePath = path.join(rulesDir(root), filename);
  fs.mkdirSync(rulesDir(root), { recursive: true });
  fs.writeFileSync(
    filePath,
    `---\nid: ${id}\ntitle: ${title}\nsource:\n  - ../../atlas/decisions/2026-07-01-sample-decision.md\ngoverns:\n  - ".specflow/specs/**/*.spec.md"\n---\n\n${h1 === null ? '' : `${h1}\n\n`}Body of ${id}.\n`,
  );
  if (opts.register !== false) registerPlanted(root, filename, id);
  return filePath;
}

/** A compass bug that is individually valid under check.bug. `h1` defaults to `# <id> — <title>`; registered unless `register: false`. */
export function writeBug(root: string, filename: string, id: string, opts: { title?: string; h1?: string | null; register?: boolean } = {}): string {
  const title = opts.title ?? `Bug ${id}`;
  const h1 = opts.h1 === undefined ? `# ${id} — ${title}` : opts.h1;
  const filePath = path.join(bugsDir(root), filename);
  fs.mkdirSync(bugsDir(root), { recursive: true });
  fs.writeFileSync(
    filePath,
    `---\nid: ${id}\ntitle: ${title}\ntype: incomplete-rule\nseverity: low\nstatus: open\naffects:\n  - schema.validator\n---\n\n${h1 === null ? '' : `${h1}\n\n`}Body of ${id}.\n`,
  );
  if (opts.register !== false) registerPlanted(root, filename, id);
  return filePath;
}

/** Overwrite a compass `_index.md` with a §7.1-shaped body whose "What's here" is `whatsHere`. */
export function writeCompassIndex(dir: string, whatsHere: string): string {
  const indexPath = path.join(dir, '_index.md');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(indexPath, `# Index\n\n**Read this when:** navigating this directory.\n\n**What's here:**\n${whatsHere}\n\n**How to navigate:** see parent index.\n`);
  return indexPath;
}
