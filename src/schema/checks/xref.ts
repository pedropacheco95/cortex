import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import fg from 'fast-glob';
import type { Violation } from '../types.js';
import type { ProjectIndex } from '../index-build.js';
import { resolveId, resolveRelativePath } from '../index-build.js';

export async function checkXrefSymmetry(root: string, index: ProjectIndex): Promise<Violation[]> {
  const violations: Violation[] = [];
  const specsDir = path.join(root, 'specs');

  if (!fs.existsSync(specsDir)) return violations;

  const devFiles = await fg('**/*.spec.md', { cwd: specsDir, absolute: true });

  for (const devFilePath of devFiles) {
    let devData: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(devFilePath, 'utf-8');
      devData = matter(raw).data as Record<string, unknown>;
    } catch {
      continue;
    }

    if (!devData['implements']) continue;

    const implRef = Array.isArray(devData['implements']) ? devData['implements'][0] : devData['implements'];
    if (typeof implRef !== 'string') continue;

    const bizFilePath = resolveRelativePath(devFilePath, implRef);
    if (!bizFilePath) continue; // unresolved path - already caught by devspec check

    // Parse the business spec
    let bizData: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(bizFilePath, 'utf-8');
      bizData = matter(raw).data as Record<string, unknown>;
    } catch {
      continue;
    }

    const implementedBy = bizData['implemented_by'];
    if (!Array.isArray(implementedBy)) {
      violations.push({
        severity: 'error',
        check: 'check.xref-symmetry',
        clause: '§6',
        location: { path: bizFilePath, key: 'implemented_by' },
        message: `Asymmetric cross-reference: "${path.relative(root, devFilePath)}" implements "${path.relative(root, bizFilePath)}", but "${path.relative(root, bizFilePath)}" does not have an implemented_by list`,
      });
      continue;
    }

    const resolvedImplementedBy = (implementedBy as string[]).map((ref) => resolveRelativePath(bizFilePath, ref)).filter((v): v is string => v !== undefined);

    if (!resolvedImplementedBy.includes(devFilePath)) {
      violations.push({
        severity: 'error',
        check: 'check.xref-symmetry',
        clause: '§6',
        location: { path: bizFilePath, key: 'implemented_by' },
        message: `Asymmetric cross-reference: "${path.relative(root, devFilePath)}" implements "${path.relative(root, bizFilePath)}", but the reverse link is missing. Both files must reference each other.`,
      });
    }
  }

  return violations;
}

export async function checkXrefUnique(root: string, index: ProjectIndex): Promise<Violation[]> {
  const violations: Violation[] = [];

  // Scan for duplicates by reading all spec files
  const allSpecFiles = [
    ...await fg('specs/**/*.spec.md', { cwd: root, absolute: true }),
    ...await fg('specs-business/**/*.business.md', { cwd: root, absolute: true }),
  ];

  const idToFiles = new Map<string, string[]>();
  for (const filePath of allSpecFiles) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = matter(raw).data as Record<string, unknown>;
      const id = data['id'];
      if (typeof id === 'string' && id) {
        if (!idToFiles.has(id)) idToFiles.set(id, []);
        idToFiles.get(id)!.push(filePath);
      }
    } catch {
      continue;
    }
  }

  for (const [id, files] of idToFiles) {
    if (files.length > 1) {
      violations.push({
        severity: 'error',
        check: 'check.xref-unique',
        clause: '§6',
        location: { path: files[0]! },
        message: `Duplicate ID "${id}" found in: ${files.map((f) => path.relative(root, f)).join(', ')}`,
      });
    }
  }

  return violations;
}

export async function checkXrefAcyclic(root: string, index: ProjectIndex): Promise<Violation[]> {
  const violations: Violation[] = [];

  async function checkTree(treeGlob: string): Promise<void> {
    const files = await fg(treeGlob, { cwd: root, absolute: true });
    const deps = new Map<string, string[]>();

    for (const filePath of files) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = matter(raw).data as Record<string, unknown>;
        const id = data['id'] as string | undefined;
        if (!id) continue;
        const dependsOn = (data['depends_on'] as string[] | undefined) ?? [];
        deps.set(id, dependsOn);
      } catch {
        continue;
      }
    }

    // Detect cycles using DFS
    const visited = new Set<string>();
    const inStack = new Set<string>();

    function dfs(node: string, stack: string[]): string[] | null {
      if (inStack.has(node)) {
        const cycleStart = stack.indexOf(node);
        return stack.slice(cycleStart).concat(node);
      }
      if (visited.has(node)) return null;
      visited.add(node);
      inStack.add(node);
      for (const dep of deps.get(node) ?? []) {
        const cycle = dfs(dep, [...stack, node]);
        if (cycle) return cycle;
      }
      inStack.delete(node);
      return null;
    }

    const reportedCycles = new Set<string>();
    for (const id of deps.keys()) {
      const cycle = dfs(id, []);
      if (cycle) {
        const cycleKey = cycle.slice().sort().join(',');
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          const filePath = index.idToPath.get(id) ?? id;
          violations.push({
            severity: 'error',
            check: 'check.xref-acyclic',
            clause: '§6',
            location: { path: typeof filePath === 'string' ? filePath : id },
            message: `Dependency cycle detected: ${cycle.join(' → ')}`,
          });
        }
      }
    }
  }

  await checkTree('specs/**/*.spec.md');
  await checkTree('specs-business/**/*.business.md');

  return violations;
}
