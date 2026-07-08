import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import fg from 'fast-glob';
import type { Violation } from '../types.js';
import type { ProjectIndex } from '../index-build.js';
import { resolveId, resolveRelativePath } from '../index-build.js';

/** Sidecar `kind` enum for atlas/sources/ `.meta.md` files (schema §4.4 sources contract). */
const SOURCE_META_KINDS = new Set(['transcript', 'rfp', 'slack', 'pdf', 'design-doc', 'other']);

/** True when `value` is an ISO date/datetime (YAML may parse it as a Date). */
function isIsoDate(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * B-006: raw material under `atlas/sources/` carries no schema id by design
 * (schema §4.4 sources contract) — it is exempt from the blanket id
 * requirement. The id-bearing artefact is the `<slug>.meta.md` sidecar, which
 * IS validated: `id` (`source.<slug>`), `kind` (enum), `captured` (ISO).
 */
function checkSourceMeta(filePath: string, data: Record<string, unknown>, violations: Violation[]): void {
  const id = data['id'];
  if (!id || typeof id !== 'string') {
    violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'id' }, message: 'Atlas sources sidecar missing required field "id"' });
  } else if (!/^source\.[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
    violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'id' }, message: `Atlas sources sidecar id "${id}" does not match "source.<slug>"` });
  }
  const kind = data['kind'];
  if (!kind || typeof kind !== 'string') {
    violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'kind' }, message: 'Atlas sources sidecar missing required field "kind"' });
  } else if (!SOURCE_META_KINDS.has(kind)) {
    violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'kind' }, message: `Atlas sources sidecar kind "${kind}" is not one of ${[...SOURCE_META_KINDS].join('|')}` });
  }
  const captured = data['captured'];
  if (captured === undefined || captured === null) {
    violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'captured' }, message: 'Atlas sources sidecar missing required field "captured"' });
  } else if (!isIsoDate(captured)) {
    violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'captured' }, message: 'Atlas sources sidecar "captured" is not an ISO date/datetime' });
  }
}

export async function checkAtlas(root: string, index: ProjectIndex): Promise<Violation[]> {
  const violations: Violation[] = [];
  const atlasDir = path.join(root, '.cortex', 'atlas');

  if (!fs.existsSync(atlasDir)) return violations;

  const files = await fg('**/*.md', { cwd: atlasDir, absolute: true, ignore: ['**/_index.md', '**/_overview.md'] });

  for (const filePath of files) {
    const relPath = path.relative(atlasDir, filePath);
    const underSources = relPath.split(path.sep)[0] === 'sources';

    // B-006: raw files under atlas/sources/ are exempt from the blanket id
    // requirement — only their .meta.md sidecars are id-bearing and validated.
    if (underSources && !filePath.endsWith('.meta.md')) continue;

    let data: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      data = matter(raw).data as Record<string, unknown>;
    } catch {
      continue;
    }

    if (underSources) {
      checkSourceMeta(filePath, data, violations);
      continue;
    }

    if (!data['id'] || typeof data['id'] !== 'string') {
      violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'id' }, message: 'Atlas artefact missing required field "id"' });
      continue;
    }

    const id = data['id'] as string;

    // Decision: decision.YYYY-MM-DD-slug
    if (id.startsWith('decision.')) {
      if (!data['title']) violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'title' }, message: 'Decision artefact missing required field "title"' });
      if (!data['date']) violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'date' }, message: 'Decision artefact missing required field "date"' });
    }
    // Stakeholder: stakeholder.slug
    else if (id.startsWith('stakeholder.')) {
      if (!data['name']) violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'name' }, message: 'Stakeholder artefact missing required field "name"' });
      if (!data['role']) violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'role' }, message: 'Stakeholder artefact missing required field "role"' });
    }
    // Domain: domain.term
    else if (id.startsWith('domain.')) {
      if (!data['term']) violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'term' }, message: 'Domain artefact missing required field "term"' });
      if (!data['definition']) violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'definition' }, message: 'Domain artefact missing required field "definition"' });
    }

    // Check supersedes/sources paths
    for (const key of ['supersedes', 'sources']) {
      if (data[key] && Array.isArray(data[key])) {
        for (const ref of data[key] as string[]) {
          if (!resolveRelativePath(filePath, ref) && !resolveId(index, ref)) {
            violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key }, message: `Atlas "${key}" reference "${ref}" does not resolve` });
          }
        }
      }
    }

    // Check compass_rules and related_specs
    for (const ref of (data['compass_rules'] as string[] | undefined) ?? []) {
      if (!resolveId(index, ref)) {
        violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'compass_rules' }, message: `compass_rules ID "${ref}" does not resolve` });
      }
    }
    for (const ref of (data['related_specs'] as string[] | undefined) ?? []) {
      if (!resolveId(index, ref)) {
        violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'related_specs' }, message: `related_specs ID "${ref}" does not resolve` });
      }
    }
  }

  return violations;
}
