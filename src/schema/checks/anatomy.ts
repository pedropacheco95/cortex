import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type { Violation } from '../types.js';
import type { ProjectIndex } from '../index-build.js';

export function checkAnatomyFiles(root: string, index: ProjectIndex): Violation[] {
  const violations: Violation[] = [];
  const filesPath = path.join(root, '.cortex', 'anatomy', 'files.md');

  if (!fs.existsSync(filesPath)) return violations;

  const raw = fs.readFileSync(filesPath, 'utf-8');
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;

  if (data['kind'] !== 'anatomy-files') {
    violations.push({
      severity: 'error',
      check: 'check.anatomy-files',
      clause: '§4.1',
      location: { path: filesPath, key: 'kind' },
      message: 'anatomy/files.md header must have kind: anatomy-files',
    });
  }

  if (!data['last_full_scan']) {
    violations.push({
      severity: 'error',
      check: 'check.anatomy-files',
      clause: '§4.1',
      location: { path: filesPath, key: 'last_full_scan' },
      message: 'anatomy/files.md header missing last_full_scan',
    });
  }

  // Check table rows: each must have 7 columns
  const lines = parsed.content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim().startsWith('|')) {
      const cols = line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (cols.length !== 7 && !line.includes('---')) {
        violations.push({
          severity: 'error',
          check: 'check.anatomy-files',
          clause: '§4.1',
          location: { path: filesPath, line: i + 1 },
          message: `Table row has ${cols.length} columns, expected 7`,
        });
      }
      // Check sha256 (column index 3, 0-based after filtering) per schema §4.1
      if (cols.length >= 4 && !line.includes('---')) {
        const sha = (cols[3] ?? '').trim();
        if (sha && sha !== 'sha256' && !/^[0-9a-f]{64}$/.test(sha)) {
          violations.push({
            severity: 'error',
            check: 'check.anatomy-files',
            clause: '§4.1',
            location: { path: filesPath, line: i + 1 },
            message: `sha256 "${sha}" is not a valid 64-character hex string`,
          });
        }
      }
    }
  }

  return violations;
}

export function checkAnatomyGraph(root: string): Violation[] {
  const violations: Violation[] = [];
  const graphPath = path.join(root, '.cortex', 'anatomy', 'graph.json');

  if (!fs.existsSync(graphPath)) return violations;

  let graph: Record<string, unknown>;
  try {
    graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
  } catch (e) {
    violations.push({
      severity: 'warning',
      check: 'check.anatomy-graph',
      clause: '§4.1',
      location: { path: graphPath },
      message: `anatomy/graph.json is not valid JSON: ${(e as Error).message}`,
    });
    return violations;
  }

  if (!graph['nodes'] || !graph['edges']) {
    violations.push({
      severity: 'warning',
      check: 'check.anatomy-graph',
      clause: '§4.1',
      location: { path: graphPath },
      message: 'anatomy/graph.json must have "nodes" and "edges" fields',
    });
    return violations;
  }

  // Check node paths
  const nodes = graph['nodes'] as Array<Record<string, unknown>>;
  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      if (typeof node['path'] === 'string') {
        const nodePath = path.resolve(root, node['path']);
        if (!fs.existsSync(nodePath)) {
          violations.push({
            severity: 'warning',
            check: 'check.anatomy-graph',
            clause: '§4.1',
            location: { path: graphPath },
            message: `Node path "${node['path']}" does not exist on disk`,
          });
        }
      }
    }
  }

  return violations;
}
