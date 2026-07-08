/**
 * check.constellation — `.cortex/constellation.json` shape (schema §4.9).
 *
 * Runs only when the file exists (it is compiled+regenerable, gitignored):
 * valid JSON; all required top-level keys; node ids unique; every node
 * `group` resolves to a declared group/child id; every edge endpoint
 * resolves to an emitted node id; `module` in enum. Severity: error.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Violation } from '../types.js';

const REQUIRED_KEYS = ['schemaVersion', 'generated', 'groups', 'nodes', 'edges', 'counters'] as const;

const MODULE_ENUM = ['anatomy', 'rule', 'bug', 'compass', 'atlas', 'spec-dev', 'spec-business'];

export function checkConstellation(root: string): Violation[] {
  const violations: Violation[] = [];
  const filePath = path.join(root, '.cortex', 'constellation.json');

  // Only when the file exists (§4.9) — absence is not a violation.
  if (!fs.existsSync(filePath)) return violations;

  const fail = (message: string, key?: string): void => {
    violations.push({
      severity: 'error',
      check: 'check.constellation',
      clause: '§4.9',
      location: { path: filePath, ...(key !== undefined ? { key } : {}) },
      message,
    });
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    fail(`constellation.json is not valid JSON: ${(err as Error).message}`);
    return violations;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    fail('constellation.json must be a JSON object');
    return violations;
  }
  const doc = parsed as Record<string, unknown>;

  // All top-level fields required (§4.9).
  for (const key of REQUIRED_KEYS) {
    if (!(key in doc)) fail(`missing required top-level key "${key}"`, key);
  }

  const groups = Array.isArray(doc['groups']) ? (doc['groups'] as unknown[]) : [];
  const nodes = Array.isArray(doc['nodes']) ? (doc['nodes'] as unknown[]) : [];
  const edges = Array.isArray(doc['edges']) ? (doc['edges'] as unknown[]) : [];

  // Declared group + child ids (nodes may reference either).
  const groupIds = new Set<string>();
  for (const g of groups) {
    if (typeof g !== 'object' || g === null) continue;
    const group = g as Record<string, unknown>;
    if (typeof group['id'] === 'string') groupIds.add(group['id']);
    const children = Array.isArray(group['children']) ? (group['children'] as unknown[]) : [];
    for (const c of children) {
      if (typeof c === 'object' && c !== null && typeof (c as Record<string, unknown>)['id'] === 'string') {
        groupIds.add((c as Record<string, unknown>)['id'] as string);
      }
    }
  }

  // Nodes: unique ids, resolvable group, module in enum.
  const nodeIds = new Set<string>();
  for (const n of nodes) {
    if (typeof n !== 'object' || n === null) continue;
    const node = n as Record<string, unknown>;
    const id = node['id'];
    if (typeof id !== 'string' || !id) {
      fail('node without a string "id"', 'nodes');
      continue;
    }
    if (nodeIds.has(id)) {
      fail(`duplicate node id "${id}"`, 'nodes');
    }
    nodeIds.add(id);
    const group = node['group'];
    if (typeof group !== 'string' || !groupIds.has(group)) {
      fail(`node "${id}" group "${String(group)}" does not resolve to a declared group/child id`, 'nodes');
    }
    const moduleName = node['module'];
    if (typeof moduleName !== 'string' || !MODULE_ENUM.includes(moduleName)) {
      fail(`node "${id}" module "${String(moduleName)}" is not in the §4.9 enum (${MODULE_ENUM.join(' | ')})`, 'nodes');
    }
  }

  // Edges: both endpoints resolve to emitted node ids.
  for (const e of edges) {
    if (typeof e !== 'object' || e === null) continue;
    const edge = e as Record<string, unknown>;
    for (const endpoint of ['from', 'to'] as const) {
      const value = edge[endpoint];
      if (typeof value !== 'string' || !nodeIds.has(value)) {
        fail(`edge ${endpoint} "${String(value)}" does not resolve to an emitted node id`, 'edges');
      }
    }
  }

  return violations;
}
