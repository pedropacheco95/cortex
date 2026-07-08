/**
 * Constellation insight overlay composer (spec constellation.insight-preset;
 * schema §4.9 insight preset; R-001).
 *
 * Pure, serve-time composition — NO fs, NO server, NO writes, NO LLM. Given the
 * curated §4.9 `constellation.json` graph plus the ungated insight overlay
 * (`insight/map/graph.json` inferred edges + `clusters.json` domain clusters),
 * it produces the curated graph UNCHANGED with an additional `overlay` block:
 * inferred edges marked dashed (a data marker the existing Cytoscape layer
 * styles — never a new renderer) and clusters as background-region groupings.
 *
 * Join, not merge (Rule 3): the overlay is keyed on the SHARED constellation
 * node ids. An inferred edge whose endpoint is not a curated node, or a cluster
 * member absent from the curated node set, is dropped-and-counted (tolerant,
 * like the compiler's dropped-ref handling), never an error. Absent insight
 * files → an honest EMPTY overlay (Rule 2), not an error. Deterministic
 * (Rule 7): overlay edges and clusters are sorted stably, so identical inputs
 * yield a byte-identical body.
 */
import type { Constellation } from './compile.js';
import type { Confidence, InsightGraph, ClustersFile } from '../insight/formats.js';

/**
 * An inferred edge lifted onto the curated graph. `inferred`/`style` are the
 * data markers the Cytoscape layer keys its dashed styling off (schema §4.9:
 * dashed, subordinate to solid curated edges); `confidence` MAY drive
 * weight/opacity (a renderer detail, carried but never required).
 */
export interface OverlayEdge {
  from: string;
  to: string;
  kind: string;
  confidence: Confidence;
  rationale: string;
  inferred: true;
  style: 'dashed';
}

/**
 * A tag cluster as a background-region grouping over its curated members
 * (schema §4.9: Cytoscape compound/parent styling — same library, no new
 * renderer). `members` are only the resolvable (curated) node ids.
 */
export interface OverlayCluster {
  id: string;
  label: string;
  members: string[];
  rationale: string;
}

export interface InsightOverlay {
  /** Inferred edges over curated nodes, sorted by (from, to, kind). */
  inferredEdges: OverlayEdge[];
  /** Clusters over curated members, sorted by id; members sorted. */
  clusters: OverlayCluster[];
  /** Dropped-and-counted tolerances (join misses), never errors. */
  dropped: {
    /** Inferred edges with ≥1 endpoint absent from the curated node set. */
    edges: number;
    /** Cluster members absent from the curated node set. */
    clusterMembers: number;
    /** Clusters left with zero resolvable members after the join. */
    clusters: number;
  };
}

/** The curated §4.9 graph carrying the serve-time insight overlay. */
export type InsightConstellation = Constellation & { overlay: InsightOverlay };

function compareOverlayEdges(a: OverlayEdge, b: OverlayEdge): number {
  if (a.from !== b.from) return a.from < b.from ? -1 : 1;
  if (a.to !== b.to) return a.to < b.to ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  return 0;
}

/**
 * Compose the serve-time insight overlay onto the curated graph. `curated` is
 * returned untouched (its §4.9 shape and byte-determinism are the contract);
 * the overlay is an additive block. `insightGraph`/`clusters` are `null` when
 * their files are absent or unparseable — an empty overlay, not an error.
 */
export function composeInsightOverlay(
  curated: Constellation,
  insightGraph: InsightGraph | null,
  clusters: ClustersFile | null,
): InsightConstellation {
  const curatedIds = new Set(curated.nodes.map((n) => n.id));

  let droppedEdges = 0;
  const inferredEdges: OverlayEdge[] = [];
  for (const edge of insightGraph?.edges ?? []) {
    // Join on the shared node ids (Rule 3): both endpoints must be curated.
    if (!curatedIds.has(edge.from) || !curatedIds.has(edge.to)) {
      droppedEdges++;
      continue;
    }
    inferredEdges.push({
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      confidence: edge.confidence,
      rationale: edge.rationale,
      inferred: true,
      style: 'dashed',
    });
  }
  inferredEdges.sort(compareOverlayEdges);

  let droppedMembers = 0;
  let droppedClusters = 0;
  const overlayClusters: OverlayCluster[] = [];
  for (const cluster of clusters?.clusters ?? []) {
    const members: string[] = [];
    for (const m of cluster.members) {
      if (curatedIds.has(m)) members.push(m);
      else droppedMembers++;
    }
    // A cluster with no resolvable members is itself dropped-and-counted.
    if (members.length === 0) {
      droppedClusters++;
      continue;
    }
    members.sort();
    overlayClusters.push({
      id: cluster.id,
      label: cluster.label,
      members,
      rationale: cluster.rationale,
    });
  }
  overlayClusters.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    ...curated,
    overlay: {
      inferredEdges,
      clusters: overlayClusters,
      dropped: { edges: droppedEdges, clusterMembers: droppedMembers, clusters: droppedClusters },
    },
  };
}
