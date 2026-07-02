import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import fg from 'fast-glob';
import type { Violation } from '../types.js';
import type { ProjectIndex } from '../index-build.js';
import { resolveId, resolveRelativePath } from '../index-build.js';
import { globMatchesNothing } from './cerebrum.js';

const STATUS_ENUM = ['draft', 'implementing', 'implemented'] as const;

export async function checkDevSpecs(root: string, index: ProjectIndex): Promise<Violation[]> {
  const violations: Violation[] = [];
  const specsDir = path.join(root, 'specs');

  if (!fs.existsSync(specsDir)) return violations;

  const files = await fg('**/*.spec.md', { cwd: specsDir, absolute: true });

  for (const filePath of files) {
    let data: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      data = matter(raw).data as Record<string, unknown>;
    } catch {
      continue;
    }

    if (!data['id']) {
      violations.push({ severity: 'error', check: 'check.dev-spec', clause: '§4.6', location: { path: filePath, key: 'id' }, message: 'Dev spec missing required field "id"' });
    }

    if (!data['status']) {
      violations.push({ severity: 'error', check: 'check.dev-spec', clause: '§4.6', location: { path: filePath, key: 'status' }, message: 'Dev spec missing required field "status"' });
    } else if (!STATUS_ENUM.includes(data['status'] as (typeof STATUS_ENUM)[number])) {
      violations.push({ severity: 'error', check: 'check.dev-spec', clause: '§4.6', location: { path: filePath, key: 'status' }, message: `Dev spec status "${data['status']}" not in enum [${STATUS_ENUM.join(', ')}]` });
    }

    // implements: required, exactly one value
    if (data['implements'] === undefined || data['implements'] === null) {
      violations.push({ severity: 'error', check: 'check.dev-spec', clause: '§4.6', location: { path: filePath, key: 'implements' }, message: 'Dev spec missing required field "implements" (exactly one path to a business spec)' });
    } else {
      const impl = data['implements'];
      if (Array.isArray(impl)) {
        if (impl.length !== 1) {
          violations.push({ severity: 'error', check: 'check.dev-spec', clause: '§4.6', location: { path: filePath, key: 'implements' }, message: `"implements" must be exactly one value, got ${impl.length}` });
        } else if (!resolveRelativePath(filePath, impl[0] as string)) {
          violations.push({ severity: 'error', check: 'check.dev-spec', clause: '§4.6', location: { path: filePath, key: 'implements' }, message: `implements path "${impl[0]}" does not resolve` });
        }
      } else if (typeof impl === 'string') {
        if (!resolveRelativePath(filePath, impl)) {
          violations.push({ severity: 'error', check: 'check.dev-spec', clause: '§4.6', location: { path: filePath, key: 'implements' }, message: `implements path "${impl}" does not resolve` });
        }
      } else {
        violations.push({ severity: 'error', check: 'check.dev-spec', clause: '§4.6', location: { path: filePath, key: 'implements' }, message: '"implements" must be exactly one value' });
      }
    }

    // depends_on IDs must resolve
    if (data['depends_on'] && Array.isArray(data['depends_on'])) {
      for (const dep of data['depends_on'] as string[]) {
        if (!resolveId(index, dep)) {
          violations.push({ severity: 'error', check: 'check.dev-spec', clause: '§4.6', location: { path: filePath, key: 'depends_on' }, message: `depends_on ID "${dep}" does not resolve` });
        }
      }
    }

    // governed_by IDs must resolve
    if (data['governed_by'] && Array.isArray(data['governed_by'])) {
      for (const govId of data['governed_by'] as string[]) {
        if (!resolveId(index, govId)) {
          violations.push({ severity: 'error', check: 'check.dev-spec', clause: '§4.6', location: { path: filePath, key: 'governed_by' }, message: `governed_by ID "${govId}" does not resolve` });
        }
      }
    }

    // governs (optional; semantics identical to rule governs, §4.6): list<glob>, well-formed,
    // plus Appendix A check.dev-spec-governs-resolves — every glob matches ≥1 real file (warning)
    if (data['governs'] !== undefined) {
      if (!Array.isArray(data['governs'])) {
        violations.push({ severity: 'error', check: 'check.dev-spec', clause: '§4.6', location: { path: filePath, key: 'governs' }, message: '"governs" must be a list of globs' });
      } else {
        for (const glob of data['governs'] as unknown[]) {
          if (typeof glob !== 'string') {
            violations.push({ severity: 'error', check: 'check.dev-spec', clause: '§4.6', location: { path: filePath, key: 'governs' }, message: `governs entry ${JSON.stringify(glob)} is not a string glob` });
          } else if (globMatchesNothing(root, glob)) {
            violations.push({ severity: 'warning', check: 'check.dev-spec-governs-resolves', clause: '§4.6', location: { path: filePath, key: 'governs' }, message: `governs glob "${glob}" matches no files on disk` });
          }
        }
      }
    }
  }

  return violations;
}
