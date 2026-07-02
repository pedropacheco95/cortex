import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import fg from 'fast-glob';
import type { Violation } from '../types.js';

export async function checkPulse(root: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const pulseDir = path.join(root, '.cortex', 'pulse');

  if (!fs.existsSync(pulseDir)) return violations;

  const files = await fg('**/*.md', { cwd: pulseDir, absolute: true, ignore: ['**/_index.md'] });

  for (const filePath of files) {
    let data: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      data = matter(raw).data as Record<string, unknown>;
    } catch {
      continue;
    }

    if (!data['kind']) {
      violations.push({ severity: 'warning', check: 'check.pulse', clause: '§4.5', location: { path: filePath, key: 'kind' }, message: 'Pulse artefact missing "kind" field' });
    }
    if (!data['generated']) {
      violations.push({ severity: 'warning', check: 'check.pulse', clause: '§4.5', location: { path: filePath, key: 'generated' }, message: 'Pulse artefact missing "generated" field' });
    }
    if (!data['loop']) {
      violations.push({ severity: 'warning', check: 'check.pulse', clause: '§4.5', location: { path: filePath, key: 'loop' }, message: 'Pulse artefact missing "loop" field' });
    }
  }

  return violations;
}
