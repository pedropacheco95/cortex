/**
 * Shared fixtures for the `atlas.evidence` tests: a tmp copy of the valid
 * fixture project made validate()-clean for evidence producers — a numbered
 * `cortex-schema.md` (so `schema:§5` resolves) and a `pulse.usage` dev spec
 * (so the usage evidence's `bears_on` resolves through the project index).
 * Sandboxed tmp roots only; never the real repo.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VALID_FIXTURE = path.resolve(HERE, 'valid');

export function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

export function writeFile(root: string, rel: string, body: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf-8');
  return abs;
}

/** A schema document whose §5 and §6/§6.2 headings resolve as clauses. */
export function seedSchemaDoc(root: string): void {
  writeFile(root, 'cortex-schema.md', '## 5. Hooks\n\n## 6. Cross-reference conventions\n\n### 6.2 Addressable schema clauses\n');
}

/** A `pulse.usage` dev spec wired into the fixture's one business spec (xref-symmetric). */
export function seedUsageSpec(root: string): void {
  writeFile(
    root,
    '.specflow/specs/pulse/usage.spec.md',
    '---\nid: pulse.usage\nstatus: draft\nimplements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md\n---\n\n# Usage\n\nThe usage report.\n',
  );
  writeFile(root, '.specflow/specs/pulse/_overview.md', "## What this is\n\nPulse specs.\n\n## What it covers\n\nUsage.\n\n## Why it's grouped this way\n\nPulse.\n");
  const biz = path.join(root, '.specflow', 'specs-business', 'schema', 'contributor-trusts-project-knowledge.business.md');
  fs.writeFileSync(
    biz,
    fs.readFileSync(biz, 'utf-8').replace('  - ../../specs/schema/validator.spec.md\n', '  - ../../specs/schema/validator.spec.md\n  - ../../specs/pulse/usage.spec.md\n'),
    'utf-8',
  );
}

/** A tmp copy of the valid fixture, schema doc and usage spec seeded. Caller removes it. */
export function evidenceProject(label: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `cortex-evidence-${label}-`)));
  copyDir(VALID_FIXTURE, root);
  seedSchemaDoc(root);
  seedUsageSpec(root);
  return root;
}

/** A fake injected home for transcript fixtures. Caller removes it. */
export function evidenceHome(label: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `cortex-evidence-home-${label}-`)));
}
