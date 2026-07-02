import * as fs from 'fs';
import * as path from 'path';
import type { Violation } from '../types.js';

export function checkLayout(root: string): Violation[] {
  const violations: Violation[] = [];
  const cortexDir = path.join(root, '.cortex');

  if (!fs.existsSync(cortexDir)) {
    return violations; // .cortex is optional; if absent, no layout violations
  }

  const expectedDirs = ['anatomy', 'cerebrum', 'atlas', 'pulse'];
  for (const dir of expectedDirs) {
    const dirPath = path.join(cortexDir, dir);
    if (fs.existsSync(dirPath)) {
      const indexPath = path.join(dirPath, '_index.md');
      if (!fs.existsSync(indexPath)) {
        violations.push({
          severity: 'error',
          check: 'check.layout',
          clause: '§1',
          location: { path: dirPath },
          message: `Directory .cortex/${dir}/ is missing _index.md`,
        });
      }
    }
  }

  // Check subdirs
  const subDirs = [
    'cerebrum/rules',
    'cerebrum/bugs',
    'atlas/decisions',
    'atlas/stakeholders',
    'atlas/domain',
  ];
  for (const sub of subDirs) {
    const subPath = path.join(cortexDir, sub);
    if (fs.existsSync(subPath)) {
      const indexPath = path.join(subPath, '_index.md');
      if (!fs.existsSync(indexPath)) {
        violations.push({
          severity: 'error',
          check: 'check.layout',
          clause: '§1',
          location: { path: subPath },
          message: `Directory .cortex/${sub}/ is missing _index.md`,
        });
      }
    }
  }

  return violations;
}

export function checkIndexPresent(root: string): Violation[] {
  const violations: Violation[] = [];
  const cortexDir = path.join(root, '.cortex');

  if (!fs.existsSync(cortexDir)) return violations;

  function walkDir(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const hasIndex = entries.some((e) => e.isFile() && e.name === '_index.md');
    if (!hasIndex) {
      violations.push({
        severity: 'error',
        check: 'check.index-present',
        clause: '§7.1',
        location: { path: dir },
        message: `Directory ${path.relative(root, dir)} is missing _index.md`,
      });
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walkDir(path.join(dir, entry.name));
      }
    }
  }

  walkDir(cortexDir);
  return violations;
}

export function checkIndexShape(root: string): Violation[] {
  const violations: Violation[] = [];
  const cortexDir = path.join(root, '.cortex');

  if (!fs.existsSync(cortexDir)) return violations;

  function walkDir(dir: string): void {
    const indexPath = path.join(dir, '_index.md');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf-8');
      if (!content.includes('Read this when:')) {
        violations.push({
          severity: 'warning',
          check: 'check.index-shape',
          clause: '§7.1',
          location: { path: indexPath },
          message: `_index.md missing "Read this when:" heading`,
        });
      }
      if (!content.includes("What's here:")) {
        violations.push({
          severity: 'warning',
          check: 'check.index-shape',
          clause: '§7.1',
          location: { path: indexPath },
          message: `_index.md missing "What's here:" heading`,
        });
      }
      // Soft token check: >300 tokens warning (approx by word count * 1.3)
      const wordCount = content.split(/\s+/).length;
      if (wordCount * 1.3 > 300) {
        violations.push({
          severity: 'warning',
          check: 'check.index-shape',
          clause: '§7.1',
          location: { path: indexPath },
          message: `_index.md may exceed 300 tokens (estimated ${Math.round(wordCount * 1.3)} tokens)`,
        });
      }
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walkDir(path.join(dir, entry.name));
      }
    }
  }

  walkDir(cortexDir);
  return violations;
}
