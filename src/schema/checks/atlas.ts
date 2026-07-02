import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import fg from 'fast-glob';
import type { Violation } from '../types.js';
import type { ProjectIndex } from '../index-build.js';
import { resolveId, resolveRelativePath } from '../index-build.js';

export async function checkAtlas(root: string, index: ProjectIndex): Promise<Violation[]> {
  const violations: Violation[] = [];
  const atlasDir = path.join(root, '.cortex', 'atlas');

  if (!fs.existsSync(atlasDir)) return violations;

  const files = await fg('**/*.md', { cwd: atlasDir, absolute: true, ignore: ['**/_index.md', '**/_overview.md'] });

  for (const filePath of files) {
    let data: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      data = matter(raw).data as Record<string, unknown>;
    } catch {
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

    // Check cerebrum_rules and related_specs
    for (const ref of (data['cerebrum_rules'] as string[] | undefined) ?? []) {
      if (!resolveId(index, ref)) {
        violations.push({ severity: 'error', check: 'check.atlas', clause: '§4.4', location: { path: filePath, key: 'cerebrum_rules' }, message: `cerebrum_rules ID "${ref}" does not resolve` });
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
