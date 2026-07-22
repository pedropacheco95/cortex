/**
 * The v3 insight-module validator checks (spec insight.storage-format Rule 8;
 * cortex-schema.md Appendix A):
 *
 *  - check.insight-index          (§7.4, warning)   — the module index states
 *    the ungated trust model + names the `cortex insight` CLI.
 *  - check.insight-entry          (§4.10.2, error)  — per-file understanding
 *    entry frontmatter + section contract (replaces v2's check.insight-prose).
 *  - check.insight-scope-registry (§4.10.3, error)  — scope-registry.yaml
 *    shape, path resolution, depends_on acyclicity (asymmetry → warning).
 *  - check.insight-ledger         (§4.10.4/.5, error) — ledger.json AND
 *    reverse-index.json shapes + node-id well-formedness (one check, both files).
 *  - check.insight-graph          (§4.10.6, error)  — graph/tags/clusters
 *    shapes at the module root and per scope (dangling edge endpoint →
 *    warning; non-total-ordered serialization → warning).
 *  - check.insight-observations   (§4.10.11, new at 3.1, error) — per-entry
 *    frontmatter (kind/updated/salient/sessions) under `insight/observations/`,
 *    reusing check.provenance's claude-sessions ref shape for `sessions`
 *    members; tolerant of the whole directory being absent. `_index.md`
 *    presence/shape there is already covered by check.index-present /
 *    check.index-shape (layout.ts) — not re-checked here.
 *
 * Every check tolerates an entirely absent `insight/` module (build-order-v3
 * spine convention). A legacy v2 `insight/map/` directory on disk is
 * TOLERATED — warn at most, never error — as sanctioned interim dogfood
 * (design §8.4) until steps 5c/5e retire its producers; its contents are not
 * validated against the v3 contract.
 *
 * Pure structural inspection — no LLM, no network (R-001), read-only over the
 * tree. Shape logic is NOT duplicated here: parsers come from
 * src/insight/entry.ts and src/insight/storage.ts (the single source of truth
 * the CLI and the extraction/refresh producers also build against).
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type { Violation } from '../types.js';
import { parseEntry } from '../../insight/entry.js';
import { CLAUDE_SESSION_REF_PATTERN } from '../provenance-index.js';
import {
  parseGraphV3,
  parseTagsV3,
  parseClustersV3,
  parseLedger,
  parseReverseIndex,
  parseScopeRegistry,
  scopeRegistryAsymmetries,
  orderingIssues,
  isNodeId,
  isIsoDatetime,
} from '../../insight/storage.js';

function insightDir(root: string): string {
  return path.join(root, '.cortex', 'insight');
}

function tryJson(raw: string): Record<string, unknown> | undefined {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// check.insight-index (§7.4, warning) — redefined for the v3 verbs.
// ---------------------------------------------------------------------------

export function checkInsightIndex(root: string): Violation[] {
  const violations: Violation[] = [];
  const indexPath = path.join(insightDir(root), '_index.md');
  if (!fs.existsSync(indexPath)) return violations; // presence is check.index-present's job

  const content = fs.readFileSync(indexPath, 'utf-8');
  const lower = content.toLowerCase();

  // The trust-model line names insight as ungated/unreviewed …
  const statesTrustModel = /ungated/.test(lower) || /unreviewed/.test(lower);
  // … and points at the query CLI.
  const referencesCli = /cortex insight/.test(lower);

  if (!statesTrustModel || !referencesCli) {
    violations.push({
      severity: 'warning',
      check: 'check.insight-index',
      clause: '§7.4',
      location: { path: indexPath },
      message:
        'insight/_index.md is missing the trust-model line — it must name insight as ungated/unreviewed and reference `cortex insight`',
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// check.insight-entry (§4.10.2, error) — per-file understanding entries under
// anatomy/ and scopes/<scope>/anatomy/. Replaces v2's check.insight-prose.
// ---------------------------------------------------------------------------

function walkMarkdownFiles(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdownFiles(p, out);
    else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== '_index.md') out.push(p);
  }
}

/** Every directory that may hold per-file entries: flat `anatomy/` plus each
 *  `scopes/<scope>/anatomy/`. */
function entryDirs(root: string): string[] {
  const dirs = [path.join(insightDir(root), 'anatomy')];
  const scopesDir = path.join(insightDir(root), 'scopes');
  if (fs.existsSync(scopesDir)) {
    for (const entry of fs.readdirSync(scopesDir, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(path.join(scopesDir, entry.name, 'anatomy'));
    }
  }
  return dirs;
}

export function checkInsightEntry(root: string): Violation[] {
  const violations: Violation[] = [];
  const moduleDir = insightDir(root);
  if (!fs.existsSync(moduleDir)) return violations; // absent module tolerated

  // Legacy v2 map/ tolerance (design §8.4): warn at most, never error, and do
  // not validate its contents against the v3 contract.
  const legacyMap = path.join(moduleDir, 'map');
  if (fs.existsSync(legacyMap)) {
    violations.push({
      severity: 'warning',
      check: 'check.insight-entry',
      clause: '§4.10.1',
      location: { path: legacyMap },
      message:
        'legacy v2.0 insight/map/ is present — tolerated as sanctioned interim dogfood (design §8.4) until the v3 extraction replaces it; its contents are not validated against the v3 contract',
    });
  }

  const entryFiles: string[] = [];
  for (const dir of entryDirs(root)) walkMarkdownFiles(dir, entryFiles);

  for (const filePath of entryFiles) {
    const parsed = parseEntry(fs.readFileSync(filePath, 'utf-8'));
    if (!parsed.ok) {
      for (const err of parsed.errors ?? []) {
        violations.push({
          severity: 'error',
          check: 'check.insight-entry',
          clause: '§4.10.2',
          location: { path: filePath },
          message: err,
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// check.insight-scope-registry (§4.10.3, error; asymmetry → warning).
// ---------------------------------------------------------------------------

export function checkInsightScopeRegistry(root: string): Violation[] {
  const violations: Violation[] = [];
  const registryPath = path.join(insightDir(root), 'scope-registry.yaml');
  if (!fs.existsSync(registryPath)) return violations; // flat layout / absent module

  const parsed = parseScopeRegistry(fs.readFileSync(registryPath, 'utf-8'));
  if (!parsed.ok || !parsed.value) {
    for (const err of parsed.errors ?? ['unparseable scope-registry.yaml']) {
      violations.push({
        severity: 'error',
        check: 'check.insight-scope-registry',
        clause: '§4.10.3',
        location: { path: registryPath },
        message: err,
      });
    }
    return violations;
  }

  // Each scope path must resolve to a real project directory.
  for (const [id, scope] of Object.entries(parsed.value.scopes)) {
    const dirPath = path.join(root, scope.path);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      violations.push({
        severity: 'error',
        check: 'check.insight-scope-registry',
        clause: '§4.10.3',
        location: { path: registryPath },
        message: `scopes.${id}.path "${scope.path}" does not resolve to a project directory`,
      });
    }
  }

  // shared_by should invert depends_on — asymmetry is a warning.
  for (const asymmetry of scopeRegistryAsymmetries(parsed.value)) {
    violations.push({
      severity: 'warning',
      check: 'check.insight-scope-registry',
      clause: '§4.10.3',
      location: { path: registryPath },
      message: asymmetry,
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// check.insight-ledger (§4.10.4, §4.10.5, error) — the same check governs both
// ledger.json and reverse-index.json.
// ---------------------------------------------------------------------------

export function checkInsightLedger(root: string): Violation[] {
  const violations: Violation[] = [];
  const moduleDir = insightDir(root);
  if (!fs.existsSync(moduleDir)) return violations;

  const ledgerPath = path.join(moduleDir, 'ledger.json');
  if (fs.existsSync(ledgerPath)) {
    const parsed = parseLedger(fs.readFileSync(ledgerPath, 'utf-8'));
    if (!parsed.ok) {
      for (const err of parsed.errors ?? []) {
        violations.push({
          severity: 'error',
          check: 'check.insight-ledger',
          clause: '§4.10.4',
          location: { path: ledgerPath },
          message: err,
        });
      }
    }
  }

  const reverseIndexPath = path.join(moduleDir, 'reverse-index.json');
  if (fs.existsSync(reverseIndexPath)) {
    const parsed = parseReverseIndex(fs.readFileSync(reverseIndexPath, 'utf-8'));
    if (!parsed.ok) {
      for (const err of parsed.errors ?? []) {
        violations.push({
          severity: 'error',
          check: 'check.insight-ledger',
          clause: '§4.10.5',
          location: { path: reverseIndexPath },
          message: err,
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// check.insight-graph (§4.10.6, error; dangling endpoint → warning;
// non-total-ordered serialization → warning) — redefined for the v3 shapes.
// ---------------------------------------------------------------------------

/** Declared scope ids (for clusters.json `scope` resolution). Undefined when
 *  the registry is absent or unparseable (the sub-check is skipped —
 *  check.insight-scope-registry already reports the parse failure). */
function declaredScopeIds(root: string): Set<string> | undefined {
  const registryPath = path.join(insightDir(root), 'scope-registry.yaml');
  if (!fs.existsSync(registryPath)) return new Set();
  const parsed = parseScopeRegistry(fs.readFileSync(registryPath, 'utf-8'));
  if (!parsed.ok || !parsed.value) return undefined;
  return new Set(Object.keys(parsed.value.scopes));
}

export function checkInsightGraph(root: string): Violation[] {
  const violations: Violation[] = [];
  const moduleDir = insightDir(root);
  if (!fs.existsSync(moduleDir)) return violations;

  const err = (filePath: string, message: string): void => {
    violations.push({ severity: 'error', check: 'check.insight-graph', clause: '§4.10.6', location: { path: filePath }, message });
  };
  const warn = (filePath: string, message: string): void => {
    violations.push({ severity: 'warning', check: 'check.insight-graph', clause: '§4.10.6', location: { path: filePath }, message });
  };

  const checkGraphFile = (graphPath: string): void => {
    if (!fs.existsSync(graphPath)) return;
    const raw = fs.readFileSync(graphPath, 'utf-8');
    const parsed = parseGraphV3(raw);
    if (!parsed.ok) for (const e of parsed.errors ?? []) err(graphPath, e);

    // Uniqueness + dangling-endpoint + ordering read the raw JSON directly
    // (the parser asserts per-item shape, not cross-item relations).
    const doc = tryJson(raw);
    if (doc && Array.isArray(doc['nodes']) && Array.isArray(doc['edges'])) {
      const nodeIds = new Set<string>();
      for (const n of doc['nodes'] as unknown[]) {
        const id = (n as Record<string, unknown>)?.['id'];
        if (typeof id === 'string') {
          if (nodeIds.has(id)) err(graphPath, `duplicate node id "${id}"`);
          nodeIds.add(id);
        }
      }
      for (const e of doc['edges'] as unknown[]) {
        const edge = e as Record<string, unknown>;
        for (const endpoint of ['source', 'target'] as const) {
          const v = edge?.[endpoint];
          // Only warn for a well-formed id absent from the file's own nodes
          // (tolerant, §4.10.6); a malformed id already produced a parse error.
          if (isNodeId(v) && !nodeIds.has(v)) {
            warn(graphPath, `edge ${endpoint} "${v}" is absent from the file's own nodes (dangling endpoint)`);
          }
        }
      }
      for (const issue of orderingIssues('graph', doc)) {
        warn(graphPath, `${issue} — serialization must be deterministic and total-ordered (§4.10.6)`);
      }
    }
  };

  // Module-root graph + each scope-local graph.
  checkGraphFile(path.join(moduleDir, 'graph.json'));
  const scopesDir = path.join(moduleDir, 'scopes');
  if (fs.existsSync(scopesDir)) {
    for (const entry of fs.readdirSync(scopesDir, { withFileTypes: true })) {
      if (entry.isDirectory()) checkGraphFile(path.join(scopesDir, entry.name, 'graph.json'));
    }
  }

  // tags.json (module root).
  const tagsPath = path.join(moduleDir, 'tags.json');
  if (fs.existsSync(tagsPath)) {
    const raw = fs.readFileSync(tagsPath, 'utf-8');
    const parsed = parseTagsV3(raw);
    if (!parsed.ok) for (const e of parsed.errors ?? []) err(tagsPath, e);
    const doc = tryJson(raw);
    if (doc) {
      for (const issue of orderingIssues('tags', doc)) {
        warn(tagsPath, `${issue} — serialization must be deterministic and total-ordered (§4.10.6)`);
      }
    }
  }

  // clusters.json (module root) — cluster `scope` must be a declared scope id
  // or "global".
  const clustersPath = path.join(moduleDir, 'clusters.json');
  if (fs.existsSync(clustersPath)) {
    const raw = fs.readFileSync(clustersPath, 'utf-8');
    const parsed = parseClustersV3(raw);
    if (!parsed.ok) for (const e of parsed.errors ?? []) err(clustersPath, e);

    const doc = tryJson(raw);
    if (doc) {
      const scopeIds = declaredScopeIds(root);
      if (scopeIds !== undefined && Array.isArray(doc['clusters'])) {
        (doc['clusters'] as unknown[]).forEach((c, i) => {
          const scope = (c as Record<string, unknown>)?.['scope'];
          if (typeof scope === 'string' && scope !== '' && scope !== 'global' && !scopeIds.has(scope)) {
            err(clustersPath, `clusters[${i}].scope "${scope}" is neither a declared scope id nor "global"`);
          }
        });
      }
      for (const issue of orderingIssues('clusters', doc)) {
        warn(clustersPath, `${issue} — serialization must be deterministic and total-ordered (§4.10.6)`);
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// check.insight-observations (§4.10.11, error; new at 3.1) — the
// session-learned project-context surface, `insight/observations/`.
// ---------------------------------------------------------------------------

/** Themed entry files directly under `observations/` — excludes `_index.md`,
 *  whose own presence/shape is layout.ts's job (check.index-present /
 *  check.index-shape), not this check's. */
function observationEntryFiles(observationsDir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(observationsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== '_index.md') {
      out.push(path.join(observationsDir, entry.name));
    }
  }
  return out;
}

export function checkInsightObservations(root: string): Violation[] {
  const violations: Violation[] = [];
  const observationsDir = path.join(insightDir(root), 'observations');
  if (!fs.existsSync(observationsDir)) return violations; // §1 convention: absent directory tolerated

  for (const filePath of observationEntryFiles(observationsDir)) {
    const err = (key: string, message: string): void => {
      violations.push({ severity: 'error', check: 'check.insight-observations', clause: '§4.10.11', location: { path: filePath, key }, message });
    };

    let data: Record<string, unknown>;
    try {
      data = matter(fs.readFileSync(filePath, 'utf-8')).data as Record<string, unknown>;
    } catch (e) {
      err('frontmatter', `unparseable frontmatter: ${(e as Error).message}`);
      continue;
    }

    if (data['kind'] !== 'insight-observation') {
      err('kind', 'frontmatter "kind" must be the literal string "insight-observation"');
    }
    if (!isIsoDatetime(data['updated'])) {
      err('updated', 'frontmatter "updated" must be a non-empty ISO datetime');
    }
    if (typeof data['salient'] !== 'boolean') {
      err('salient', 'frontmatter "salient" must be a boolean');
    }
    if (!Array.isArray(data['sessions']) || data['sessions'].length === 0) {
      err('sessions', 'frontmatter "sessions" must be a non-empty list of claude-sessions/<user>/<session-id> references');
    } else {
      for (const ref of data['sessions'] as unknown[]) {
        // Reuses check.provenance's claude-sessions ref grammar (§6/A6):
        // shape-checked only, never resolved on disk.
        if (typeof ref !== 'string' || !CLAUDE_SESSION_REF_PATTERN.test(ref)) {
          err('sessions', `sessions entry ${JSON.stringify(ref)} is not a well-formed claude-sessions/<user>/<session-id> reference`);
        }
      }
    }
  }

  return violations;
}
