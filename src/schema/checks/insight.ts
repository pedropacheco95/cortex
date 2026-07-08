/**
 * The four insight-module validator checks (schema.validator-insight-checks):
 *
 *  - check.insight-index    (§7.4, warning)  — the module index states the
 *                                              ungated trust model + names the CLI.
 *  - check.insight-prose    (§4.10.1/.4)     — `insight/map/*.md` frontmatter,
 *                                              `## Corrections` log shape, promoted
 *                                              trailer shape.
 *  - check.insight-graph    (§4.10.2)        — graph/tags/clusters JSON shapes.
 *  - check.insight-ownership(§4.10.3, error) — `insight/map/` write-lane: only
 *                                              `.md` + the three named `.json`;
 *                                              no `_index.md`.
 *
 * Pure structural inspection — no LLM, no network (R-001), read-only over the
 * tree. Shape logic is NOT duplicated here: the JSON parsers and prose
 * frontmatter guard come from src/insight/formats.ts (the single source of
 * truth the CLI and the loops also build against).
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type { Violation } from '../types.js';
import {
  parseGraph,
  parseTags,
  parseClusters,
  parseProseFrontmatter,
  isNodeId,
  PROMOTED_TRAILER_PATTERN,
} from '../../insight/formats.js';

const PERMITTED_JSON_BASENAMES = ['graph.json', 'tags.json', 'clusters.json'] as const;

function insightDir(root: string): string {
  return path.join(root, '.cortex', 'insight');
}

// ---------------------------------------------------------------------------
// check.insight-index (§7.4, warning)
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
// check.insight-prose (§4.10.1, §4.10.4)
// ---------------------------------------------------------------------------

const ISO_DATE_BOLD = /\*\*\d{4}-\d{2}-\d{2}\*\*/;

export function checkInsightProse(root: string): Violation[] {
  const violations: Violation[] = [];
  const mapDir = path.join(insightDir(root), 'map');
  if (!fs.existsSync(mapDir)) return violations;

  const mdFiles = fs
    .readdirSync(mapDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== '_index.md')
    .map((e) => path.join(mapDir, e.name));

  for (const filePath of mdFiles) {
    const raw = fs.readFileSync(filePath, 'utf-8');

    // Frontmatter (kind + updated) — missing/malformed is an error naming the field.
    const fm = parseProseFrontmatter(raw);
    if (!fm.ok) {
      for (const err of fm.errors ?? []) {
        violations.push({
          severity: 'error',
          check: 'check.insight-prose',
          clause: '§4.10.1',
          location: { path: filePath },
          message: err,
        });
      }
    }

    const body = matter(raw).content;
    const lines = body.split('\n');

    // At most one `## Corrections` heading; the log entries carry the markers.
    const correctionHeadings: number[] = [];
    lines.forEach((l, i) => {
      if (/^##\s+Corrections\s*$/.test(l.trim())) correctionHeadings.push(i);
    });

    if (correctionHeadings.length > 1) {
      violations.push({
        severity: 'warning',
        check: 'check.insight-prose',
        clause: '§4.10.1',
        location: { path: filePath },
        message: `more than one "## Corrections" heading (${correctionHeadings.length}) — at most one per file`,
      });
    }

    if (correctionHeadings.length >= 1) {
      const start = correctionHeadings[0]! + 1;
      // The section runs to the next H1/H2 heading (or EOF).
      let end = lines.length;
      for (let i = start; i < lines.length; i++) {
        if (/^#{1,2}\s/.test(lines[i]!)) {
          end = i;
          break;
        }
      }
      const items = groupListItems(lines.slice(start, end));
      for (const item of items) {
        const hasDate = ISO_DATE_BOLD.test(item);
        const hasWas = item.includes('_was:_');
        const hasNow = item.includes('_now:_');
        if (!hasDate || !hasWas || !hasNow) {
          const missing = [
            !hasDate ? '**<iso-date>**' : null,
            !hasWas ? '_was:_' : null,
            !hasNow ? '_now:_' : null,
          ]
            .filter(Boolean)
            .join(', ');
          violations.push({
            severity: 'warning',
            check: 'check.insight-prose',
            clause: '§4.10.1',
            location: { path: filePath },
            message: `malformed "## Corrections" entry — missing marker(s): ${missing}`,
          });
        }
      }
    }

    // Promoted trailer (§4.10.4): when present it names an S-id and a path.
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('_(promoted') && !PROMOTED_TRAILER_PATTERN.test(t)) {
        violations.push({
          severity: 'warning',
          check: 'check.insight-prose',
          clause: '§4.10.4',
          location: { path: filePath },
          message: 'malformed promoted trailer — expected `_(promoted <iso-date> → <path> via S-NNN)_`',
        });
      }
    }
  }

  return violations;
}

/**
 * Group markdown list items in a slice of lines. A new item starts at a
 * `-`/`*` bullet; subsequent non-blank, non-bullet, non-heading lines are its
 * continuation.
 */
function groupListItems(lines: string[]): string[] {
  const items: string[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      if (current) items.push(current.join('\n'));
      current = [line];
    } else if (current !== null) {
      if (line.trim() === '' || /^#{1,6}\s/.test(line)) {
        // blank line / heading does not terminate the item on its own, but a
        // heading is already excluded by the caller's slice; keep continuation.
        current.push(line);
      } else {
        current.push(line);
      }
    }
  }
  if (current) items.push(current.join('\n'));
  return items;
}

// ---------------------------------------------------------------------------
// check.insight-graph (§4.10.2)
// ---------------------------------------------------------------------------

export function checkInsightGraph(root: string): Violation[] {
  const violations: Violation[] = [];
  const mapDir = path.join(insightDir(root), 'map');
  if (!fs.existsSync(mapDir)) return violations;

  const err = (filePath: string, message: string): void => {
    violations.push({ severity: 'error', check: 'check.insight-graph', clause: '§4.10.2', location: { path: filePath }, message });
  };
  const warn = (filePath: string, message: string): void => {
    violations.push({ severity: 'warning', check: 'check.insight-graph', clause: '§4.10.2', location: { path: filePath }, message });
  };

  // graph.json
  const graphPath = path.join(mapDir, 'graph.json');
  if (fs.existsSync(graphPath)) {
    const raw = fs.readFileSync(graphPath, 'utf-8');
    const parsed = parseGraph(raw);
    if (!parsed.ok) for (const e of parsed.errors ?? []) err(graphPath, e);

    // Uniqueness + dangling-endpoint checks read the raw JSON directly (parseGraph
    // asserts node-id shape, not uniqueness or membership).
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
        for (const endpoint of ['from', 'to'] as const) {
          const v = edge?.[endpoint];
          // Only warn for a well-formed id that is absent from the file's own
          // nodes (tolerant, like the constellation's dropped-ref handling); a
          // malformed id already produced a parseGraph error.
          if (isNodeId(v) && !nodeIds.has(v)) {
            warn(graphPath, `edge ${endpoint} "${v}" is absent from the file's own nodes (dangling endpoint)`);
          }
        }
      }
    }
  }

  // tags.json
  const tagsPath = path.join(mapDir, 'tags.json');
  if (fs.existsSync(tagsPath)) {
    const parsed = parseTags(fs.readFileSync(tagsPath, 'utf-8'));
    if (!parsed.ok) for (const e of parsed.errors ?? []) err(tagsPath, e);
  }

  // clusters.json
  const clustersPath = path.join(mapDir, 'clusters.json');
  if (fs.existsSync(clustersPath)) {
    const parsed = parseClusters(fs.readFileSync(clustersPath, 'utf-8'));
    if (!parsed.ok) for (const e of parsed.errors ?? []) err(clustersPath, e);
  }

  return violations;
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
// check.insight-ownership (§4.10.3, error)
// ---------------------------------------------------------------------------

export function checkInsightOwnership(root: string): Violation[] {
  const violations: Violation[] = [];
  const mapDir = path.join(insightDir(root), 'map');
  if (!fs.existsSync(mapDir)) return violations;

  const fail = (message: string, name: string): void => {
    violations.push({
      severity: 'error',
      check: 'check.insight-ownership',
      clause: '§4.10.3',
      location: { path: path.join(mapDir, name) },
      message,
    });
  };

  for (const entry of fs.readdirSync(mapDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const name = entry.name;

    if (name === '_index.md') {
      fail('insight/map/ must not carry an _index.md (§4.10.3)', name);
      continue;
    }

    const ext = path.extname(name);
    if (ext === '.md') continue; // prose — always permitted
    if (ext === '.json') {
      if (!(PERMITTED_JSON_BASENAMES as readonly string[]).includes(name)) {
        fail(
          `insight/map/${name} is not a permitted .json basename (only ${PERMITTED_JSON_BASENAMES.join(', ')})`,
          name,
        );
      }
      continue;
    }
    fail(`insight/map/${name} has a disallowed extension "${ext}" (only .md and the three named .json permitted)`, name);
  }

  return violations;
}
