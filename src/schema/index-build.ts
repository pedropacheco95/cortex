import matter from 'gray-matter';
import fg from 'fast-glob';
import * as fs from 'fs';
import * as path from 'path';
import { SPECS_GLOB, BUSINESS_GLOB } from '../paths.js';

export interface ProjectIndex {
  // id -> absolute file path (only ids carried by exactly one file; a
  // duplicated id is absent here so resolveId finds nothing — Rule 12, B-019)
  idToPath: Map<string, string>;
  // id -> every absolute file path that carries it, in glob order (§6 global
  // rule 1: check.xref-unique reads this; length > 1 is a duplicate)
  idToFiles: Map<string, string[]>;
  // absolute path -> frontmatter data
  pathToData: Map<string, Record<string, unknown>>;
  // absolute path -> file content
  pathToContent: Map<string, string>;
  root: string;
}

export async function buildIndex(root: string): Promise<ProjectIndex> {
  const idToPath = new Map<string, string>();
  const idToFiles = new Map<string, string[]>();
  const pathToData = new Map<string, Record<string, unknown>>();
  const pathToContent = new Map<string, string>();

  const patterns = [
    SPECS_GLOB,
    BUSINESS_GLOB,
    '.cortex/compass/rules/R-*.md',
    '.cortex/compass/bugs/B-*.md',
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
        const id = data['id'];
        const files = idToFiles.get(id);
        if (files === undefined) {
          idToFiles.set(id, [file]);
          idToPath.set(id, file);
        } else {
          files.push(file);
          idToPath.delete(id); // never resolve a duplicated id to an arbitrary file
        }
      }
    } catch {
      // skip unreadable files
    }
  }

  return { idToPath, idToFiles, pathToData, pathToContent, root };
}

export function resolveId(index: ProjectIndex, id: string): string | undefined {
  return index.idToPath.get(id);
}

export function resolveRelativePath(fromFile: string, relativePath: string): string | undefined {
  const resolved = path.resolve(path.dirname(fromFile), relativePath);
  return fs.existsSync(resolved) ? resolved : undefined;
}
