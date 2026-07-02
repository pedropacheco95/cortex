import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type { Violation } from '../types.js';

export function checkSpecsIndex(root: string): Violation[] {
  const violations: Violation[] = [];
  const specsIndexPath = path.join(root, 'specs', '_index.md');

  if (!fs.existsSync(specsIndexPath)) {
    violations.push({
      severity: 'error',
      check: 'check.specs-index',
      clause: '§7.2',
      location: { path: specsIndexPath },
      message: 'specs/_index.md is missing',
    });
    return violations;
  }

  const content = fs.readFileSync(specsIndexPath, 'utf-8');
  const required = ['Read this when:', '## Domains', '## Dependency Graph', '## Build Order'];
  for (const heading of required) {
    if (!content.includes(heading)) {
      violations.push({
        severity: 'error',
        check: 'check.specs-index',
        clause: '§7.2',
        location: { path: specsIndexPath },
        message: `specs/_index.md missing required section "${heading}"`,
      });
    }
  }

  return violations;
}

export function checkOverviewPresent(root: string): Violation[] {
  const violations: Violation[] = [];

  function checkTree(treePath: string): void {
    if (!fs.existsSync(treePath)) return;
    const entries = fs.readdirSync(treePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.')) {
        const dirPath = path.join(treePath, entry.name);
        const overviewPath = path.join(dirPath, '_overview.md');
        if (!fs.existsSync(overviewPath)) {
          violations.push({
            severity: 'error',
            check: 'check.overview-present',
            clause: '§2.2',
            location: { path: dirPath },
            message: `Directory ${path.relative(root, dirPath)} is missing _overview.md`,
          });
        }
        checkTree(dirPath);
      }
    }
  }

  checkTree(path.join(root, 'specs'));
  checkTree(path.join(root, 'specs-business'));

  return violations;
}

export function checkOverviewShape(root: string): Violation[] {
  const violations: Violation[] = [];

  function checkFile(filePath: string, isBusiness: boolean): void {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    const required = ['## What this is', '## What it covers', "## Why it's grouped this way"];
    for (const heading of required) {
      if (!content.includes(heading)) {
        violations.push({
          severity: 'warning',
          check: 'check.overview-shape',
          clause: '§7.3',
          location: { path: filePath },
          message: `_overview.md missing required heading "${heading}"`,
        });
      }
    }

    if (isBusiness) {
      // Business-tree overviews must not contain file paths or IDs except under "## Related groups"
      const relatedGroupsIdx = content.indexOf('## Related groups');
      const beforeRelated = relatedGroupsIdx >= 0 ? content.slice(0, relatedGroupsIdx) : content;
      // Check for file path-like patterns (e.g., specs/... or .spec.md) or ID patterns (word.word)
      if (/\bspecs[/-]|\bspecs-business[/-]|\.spec\.md|\.business\.md/.test(beforeRelated)) {
        violations.push({
          severity: 'warning',
          check: 'check.overview-shape',
          clause: '§7.3',
          location: { path: filePath },
          message: 'Business _overview.md contains file paths or IDs outside "## Related groups" section',
        });
      }
    }
  }

  function walkTree(treePath: string, isBusiness: boolean): void {
    if (!fs.existsSync(treePath)) return;
    const entries = fs.readdirSync(treePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '_overview.md') {
        checkFile(path.join(treePath, entry.name), isBusiness);
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walkTree(path.join(treePath, entry.name), isBusiness);
      }
    }
  }

  walkTree(path.join(root, 'specs'), false);
  walkTree(path.join(root, 'specs-business'), true);

  return violations;
}

export function checkIdMatchesPath(root: string): Violation[] {
  const violations: Violation[] = [];

  function checkTree(treePath: string, suffix: string, strip: string): void {
    if (!fs.existsSync(treePath)) return;
    const allFiles = getAllFiles(treePath, suffix);
    for (const filePath of allFiles) {
      const rel = path.relative(treePath, filePath);
      const expectedId = rel.replace(/\\/g, '/').replace(new RegExp(`\\.${strip}\\.md$`), '').replace(/\//g, '.');
      let data: Record<string, unknown> = {};
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        data = matter(raw).data as Record<string, unknown>;
      } catch {
        continue;
      }
      const actualId = data['id'];
      if (typeof actualId === 'string' && actualId !== expectedId) {
        violations.push({
          severity: 'error',
          check: 'check.id-matches-path',
          clause: '§2.2',
          location: { path: filePath, key: 'id' },
          message: `id "${actualId}" does not match expected "${expectedId}" (derived from path)`,
        });
      }
    }
  }

  checkTree(path.join(root, 'specs'), '.spec.md', 'spec');
  checkTree(path.join(root, 'specs-business'), '.business.md', 'business');

  return violations;
}

function getAllFiles(dir: string, suffix: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      results.push(...getAllFiles(fullPath, suffix));
    } else if (entry.isFile() && entry.name.endsWith(suffix)) {
      results.push(fullPath);
    }
  }
  return results;
}
