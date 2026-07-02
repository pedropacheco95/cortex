import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import fg from 'fast-glob';
import type { Violation } from '../types.js';
import type { ProjectIndex } from '../index-build.js';
import { resolveId } from '../index-build.js';

export async function checkScenarios(root: string, index: ProjectIndex): Promise<Violation[]> {
  const violations: Violation[] = [];
  const scenarioDir = path.join(root, 'tests', 'scenario', 'specs');

  if (!fs.existsSync(scenarioDir)) return violations;

  const files = await fg('**/*.md', { cwd: scenarioDir, absolute: true });

  for (const filePath of files) {
    let data: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      data = matter(raw).data as Record<string, unknown>;
    } catch {
      continue;
    }

    const expectedName = path.basename(filePath, '.md');
    if (typeof data['name'] !== 'string' || data['name'] !== expectedName) {
      violations.push({
        severity: 'error',
        check: 'check.covers-resolves',
        clause: '§4.8',
        location: { path: filePath, key: 'name' },
        message: `Scenario spec "name" "${data['name']}" does not match filename "${expectedName}"`,
      });
    }

    if (data['covers'] && Array.isArray(data['covers'])) {
      for (const coveredId of data['covers'] as string[]) {
        if (!resolveId(index, coveredId)) {
          violations.push({
            severity: 'error',
            check: 'check.covers-resolves',
            clause: '§4.8',
            location: { path: filePath, key: 'covers' },
            message: `covers ID "${coveredId}" does not resolve to a business spec`,
          });
        }
      }
    }
  }

  return violations;
}
