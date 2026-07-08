import matter from 'gray-matter';
import fg from 'fast-glob';
import * as fs from 'fs';
import * as path from 'path';
import { SPECS_GLOB, BUSINESS_GLOB } from '../paths.js';

export interface ProjectIndex {
  // id -> absolute file path
  idToPath: Map<string, string>;
  // absolute path -> frontmatter data
  pathToData: Map<string, Record<string, unknown>>;
  // absolute path -> file content
  pathToContent: Map<string, string>;
  root: string;
}

export async function buildIndex(root: string): Promise<ProjectIndex> {
  const idToPath = new Map<string, string>();
  const pathToData = new Map<string, Record<string, unknown>>();
  const pathToContent = new Map<string, string>();

  const patterns = [
    SPECS_GLOB,
    BUSINESS_GLOB,
    '.cortex/cerebrum/rules/R-*.md',
    '.cortex/cerebrum/bugs/B-*.md',
    '.cortex/atlas/**/*.md',
    'tests/scenario/specs/*.md',
  ];

  const files = await fg(patterns, { cwd: root, absolute: true, dot: true });

  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, 'utf-8');
      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;
      pathToData.set(file, data);
      pathToContent.set(file, raw);
      if (typeof data['id'] === 'string' && data['id']) {
        idToPath.set(data['id'], file);
      }
    } catch {
      // skip unreadable files
    }
  }

  return { idToPath, pathToData, pathToContent, root };
}

export function resolveId(index: ProjectIndex, id: string): string | undefined {
  return index.idToPath.get(id);
}

export function resolveRelativePath(fromFile: string, relativePath: string): string | undefined {
  const resolved = path.resolve(path.dirname(fromFile), relativePath);
  return fs.existsSync(resolved) ? resolved : undefined;
}
