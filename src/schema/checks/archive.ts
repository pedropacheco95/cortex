/**
 * The three archive-module validator checks (build-order-v3 step 3a;
 * cortex-schema.md §4.4, Appendix A):
 *
 *  - check.archive-layout   (§4.4, error)   — `documents/<slug>/` has
 *                                             `source.*` + `metadata.yaml` +
 *                                             `extracted/`; `_index.md`,
 *                                             `register.md`, `types/` present.
 *  - check.archive-metadata (§4.4.1, error) — `metadata.yaml` frontmatter
 *                                             (`id`, `kind`→resolves,
 *                                             `ingested_at`, `version`,
 *                                             `status`, `supersedes` resolves).
 *  - check.archive-intent-register
 *                           (§4.4.3, error) — `intent-register.yaml` shape
 *                                             (`IR-NNN` unique, required
 *                                             fields, status enum) plus the
 *                                             per-status evidence links
 *                                             actually resolving.
 *  - check.archive-type     (§4.4.2, error) — `types/*.yaml` shape (`id`==stem,
 *                                             `label`, `classification`,
 *                                             `extraction.strategy`, non-empty
 *                                             `outputs`).
 *
 * All three are tolerant of the `archive/` module being entirely absent (the
 * "spine" principle every new-module check follows, schema §1) and of an
 * empty `documents/`/`types/` (nothing ingested/declared yet).
 *
 * Pure structural inspection — no LLM, no network (R-001), read-only over the
 * tree. Shape logic is NOT duplicated here: the YAML parsers and shape guards
 * come from src/archive/formats.ts (the single source of truth the future
 * `cortex-archive-ingest` skill also builds against).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Violation } from '../types.js';
import { parseArchiveMetadata, parseArchiveTypeDef, parseIntentRegister } from '../../archive/formats.js';
import type { ProjectIndex } from '../index-build.js';
import { resolveId } from '../index-build.js';

function archiveDir(root: string): string {
  return path.join(root, '.cortex', 'archive');
}

// ---------------------------------------------------------------------------
// check.archive-layout (§4.4)
// ---------------------------------------------------------------------------

export function checkArchiveLayout(root: string): Violation[] {
  const violations: Violation[] = [];
  const dir = archiveDir(root);
  if (!fs.existsSync(dir)) return violations; // module absent — tolerated

  const err = (p: string, message: string): void => {
    violations.push({ severity: 'error', check: 'check.archive-layout', clause: '§4.4', location: { path: p }, message });
  };

  if (!fs.existsSync(path.join(dir, '_index.md'))) {
    err(path.join(dir, '_index.md'), 'archive/ is missing _index.md');
  }
  if (!fs.existsSync(path.join(dir, 'register.md'))) {
    err(path.join(dir, 'register.md'), 'archive/ is missing register.md');
  }
  const typesDir = path.join(dir, 'types');
  if (!fs.existsSync(typesDir) || !fs.statSync(typesDir).isDirectory()) {
    err(typesDir, 'archive/ is missing types/');
  }

  const documentsDir = path.join(dir, 'documents');
  if (fs.existsSync(documentsDir)) {
    for (const entry of fs.readdirSync(documentsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const docDir = path.join(documentsDir, entry.name);

      const hasSource = fs
        .readdirSync(docDir, { withFileTypes: true })
        .some((f) => f.isFile() && /^source\./.test(f.name));
      if (!hasSource) err(docDir, `documents/${entry.name}/ is missing a source.<ext> file`);

      if (!fs.existsSync(path.join(docDir, 'metadata.yaml'))) {
        err(docDir, `documents/${entry.name}/ is missing metadata.yaml`);
      }

      const extractedDir = path.join(docDir, 'extracted');
      if (!fs.existsSync(extractedDir) || !fs.statSync(extractedDir).isDirectory()) {
        err(docDir, `documents/${entry.name}/ is missing extracted/`);
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// check.archive-metadata (§4.4.1)
// ---------------------------------------------------------------------------

export function checkArchiveMetadata(root: string): Violation[] {
  const violations: Violation[] = [];
  const documentsDir = path.join(archiveDir(root), 'documents');
  if (!fs.existsSync(documentsDir)) return violations; // no documents ingested yet — tolerated

  const typesDir = path.join(archiveDir(root), 'types');

  for (const entry of fs.readdirSync(documentsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const metaPath = path.join(documentsDir, slug, 'metadata.yaml');
    if (!fs.existsSync(metaPath)) continue; // check.archive-layout's job to flag absence

    const raw = fs.readFileSync(metaPath, 'utf-8');
    const parsed = parseArchiveMetadata(raw);
    if (!parsed.ok) {
      for (const e of parsed.errors ?? []) {
        violations.push({ severity: 'error', check: 'check.archive-metadata', clause: '§4.4.1', location: { path: metaPath }, message: e });
      }
      continue; // shape errors already cover id/kind/status — skip the resolution checks below
    }

    const data = parsed.value!;
    const expectedId = `archive.${slug}`;
    if (data.id !== expectedId) {
      violations.push({
        severity: 'error',
        check: 'check.archive-metadata',
        clause: '§4.4.1',
        location: { path: metaPath, key: 'id' },
        message: `metadata "id" ("${data.id}") does not match "${expectedId}" (the directory name)`,
      });
    }

    const typePath = path.join(typesDir, `${data.kind}.yaml`);
    if (!fs.existsSync(typePath)) {
      violations.push({
        severity: 'error',
        check: 'check.archive-metadata',
        clause: '§4.4.1',
        location: { path: metaPath, key: 'kind' },
        message: `"kind" ("${data.kind}") does not resolve to archive/types/${data.kind}.yaml`,
      });
    }

    if (Array.isArray(data.supersedes)) {
      for (const rel of data.supersedes) {
        const resolved = path.join(archiveDir(root), rel);
        if (!fs.existsSync(resolved)) {
          violations.push({
            severity: 'error',
            check: 'check.archive-metadata',
            clause: '§4.4.1',
            location: { path: metaPath, key: 'supersedes' },
            message: `"supersedes" path "${rel}" does not resolve`,
          });
        }
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// check.archive-type (§4.4.2)
// ---------------------------------------------------------------------------

export function checkArchiveType(root: string): Violation[] {
  const violations: Violation[] = [];
  const typesDir = path.join(archiveDir(root), 'types');
  if (!fs.existsSync(typesDir)) return violations; // module/dir absent — tolerated

  const files = fs.readdirSync(typesDir, { withFileTypes: true }).filter((f) => f.isFile() && /\.ya?ml$/.test(f.name));
  // Empty types/ (nothing declared yet) → the loop below simply does nothing.

  for (const entry of files) {
    const filePath = path.join(typesDir, entry.name);
    const stem = entry.name.replace(/\.ya?ml$/, '');
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseArchiveTypeDef(raw);
    if (!parsed.ok) {
      for (const e of parsed.errors ?? []) {
        violations.push({ severity: 'error', check: 'check.archive-type', clause: '§4.4.2', location: { path: filePath }, message: e });
      }
      continue;
    }

    const data = parsed.value!;
    if (data.id !== stem) {
      violations.push({
        severity: 'error',
        check: 'check.archive-type',
        clause: '§4.4.2',
        location: { path: filePath, key: 'id' },
        message: `type "id" ("${data.id}") does not match the filename stem "${stem}"`,
      });
    }
  }

  return violations;
}


// ---------------------------------------------------------------------------
// check.archive-intent-register (§4.4.3, new at schema 3.2)
// ---------------------------------------------------------------------------

/**
 * The intent register is OPTIONAL: a project without one validates clean (the
 * same spine tolerance the other archive checks follow). When present, its
 * shape comes from `parseIntentRegister` (single source of truth in
 * src/archive/formats.ts) and this check adds what the parser deliberately
 * cannot do — resolve the links against the project index and the tree.
 *
 * Core never judges whether a spec test SUBSUMES an anchor (that is semantic,
 * and belongs to the reconciliation Skill — RULES 3). It only checks that the
 * claim is well-formed and its references exist.
 */
export function checkArchiveIntentRegister(root: string, index: ProjectIndex): Violation[] {
  const violations: Violation[] = [];
  const filePath = path.join(archiveDir(root), 'intent-register.yaml');
  if (!fs.existsSync(filePath)) return violations; // optional artefact — tolerated

  const err = (message: string): void => {
    violations.push({
      severity: 'error',
      check: 'check.archive-intent-register',
      clause: '§4.4.3',
      location: { path: filePath },
      message,
    });
  };

  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    err('intent-register.yaml is unreadable');
    return violations;
  }

  const parsed = parseIntentRegister(raw);
  for (const message of parsed.errors ?? []) err(message);

  // Link resolution runs over whatever parsed cleanly, so a single malformed
  // entry does not hide dangling links in its siblings.
  for (const entry of parsed.value?.entries ?? []) {
    const named = `${entry.id}`;

    if (entry.landing !== undefined) {
      const [target, criterion] = entry.landing.split('#');
      if (/^R-\d{3,}$/.test(target ?? '')) {
        const ruleDir = path.join(root, '.cortex', 'compass', 'rules');
        const hit = fs.existsSync(ruleDir)
          ? fs.readdirSync(ruleDir).find((f) => f.startsWith(`${target}-`) && f.endsWith('.md'))
          : undefined;
        if (!hit) err(`${named}: landing "${entry.landing}" names no rule under compass/rules/`);
      } else {
        const specPath = resolveId(index, target ?? '');
        if (!specPath) {
          err(`${named}: landing "${entry.landing}" does not resolve to a spec id or a compass rule id`);
        } else if (criterion) {
          const content = index.pathToContent.get(specPath) ?? '';
          const headings = [...content.matchAll(/^###\s+(.+?)\s*$/gm)].map((m) => slugifyHeading(m[1] ?? ''));
          if (!headings.includes(slugifyHeading(criterion))) {
            err(`${named}: landing criterion "${criterion}" is not an acceptance-criterion heading in "${target}"`);
          }
        }
      }
    }

    if (entry.covering_spec_test !== undefined) {
      const testPath = entry.covering_spec_test.split('::')[0] ?? '';
      if (!fs.existsSync(path.resolve(root, testPath))) {
        err(`${named}: covering_spec_test path "${testPath}" does not exist`);
      }
    }

    if (entry.flagged_bug !== undefined) {
      const bugDir = path.join(root, '.cortex', 'compass', 'bugs');
      const hit = fs.existsSync(bugDir)
        ? fs.readdirSync(bugDir).find((f) => f.startsWith(`${entry.flagged_bug}-`) && f.endsWith('.md'))
        : undefined;
      if (!hit) err(`${named}: flagged_bug "${entry.flagged_bug}" names no bug under compass/bugs/`);
    }
  }

  return violations;
}

/** Compare criterion references loosely: heading text or its hyphenated slug. */
function slugifyHeading(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
