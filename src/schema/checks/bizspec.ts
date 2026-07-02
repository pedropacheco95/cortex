import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import fg from 'fast-glob';
import type { Violation } from '../types.js';
import type { ProjectIndex } from '../index-build.js';
import { resolveRelativePath } from '../index-build.js';

export async function checkBizSpecs(root: string, index: ProjectIndex): Promise<Violation[]> {
  const violations: Violation[] = [];
  const bizDir = path.join(root, 'specs-business');

  if (!fs.existsSync(bizDir)) return violations;

  const files = await fg('**/*.business.md', { cwd: bizDir, absolute: true });

  for (const filePath of files) {
    let raw = '';
    let data: Record<string, unknown> = {};
    let body = '';
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = matter(raw);
      data = parsed.data as Record<string, unknown>;
      body = parsed.content;
    } catch {
      continue;
    }

    if (!data['id']) {
      violations.push({ severity: 'error', check: 'check.business-spec', clause: '§4.7', location: { path: filePath, key: 'id' }, message: 'Business spec missing required field "id"' });
    }

    if (!data['status']) {
      violations.push({ severity: 'error', check: 'check.business-spec', clause: '§4.7', location: { path: filePath, key: 'status' }, message: 'Business spec missing required field "status"' });
    }

    if (!data['implemented_by'] || !Array.isArray(data['implemented_by'])) {
      violations.push({ severity: 'error', check: 'check.business-spec', clause: '§4.7', location: { path: filePath, key: 'implemented_by' }, message: 'Business spec missing required field "implemented_by" (list)' });
    } else {
      for (const ref of data['implemented_by'] as string[]) {
        if (!resolveRelativePath(filePath, ref)) {
          violations.push({ severity: 'error', check: 'check.business-spec', clause: '§4.7', location: { path: filePath, key: 'implemented_by' }, message: `implemented_by path "${ref}" does not resolve` });
        }
      }
    }

    // Body checks (warnings)
    if (/^```/m.test(body)) {
      violations.push({ severity: 'warning', check: 'check.business-spec', clause: '§4.7', location: { path: filePath }, message: 'Business spec body contains fenced code blocks' });
    }
    if (/\b(GET|POST|PUT|DELETE|PATCH)\b/.test(body)) {
      violations.push({ severity: 'warning', check: 'check.business-spec', clause: '§4.7', location: { path: filePath }, message: 'Business spec body contains HTTP verbs' });
    }
    // Match the AC marker form only (e.g. `**Given**`), not prose words — "When this works, …"
    // is the business-spec template's own recommended Outcome phrasing (§4.7).
    if (/\*\*(Given|When|Then)\*\*/.test(body)) {
      violations.push({ severity: 'warning', check: 'check.business-spec', clause: '§4.7', location: { path: filePath }, message: 'Business spec body contains Given/When/Then markers' });
    }
  }

  return violations;
}
