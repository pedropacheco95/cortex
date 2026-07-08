/**
 * The `cortex insight` command surface (spec insight.cli; cortex-schema.md
 * §4.10.5) — four deterministic, read-only subcommands over `insight/map/`:
 *   query <topic>          lexical grouped search across prose/tags/clusters
 *   get <file>             a map/-relative file verbatim
 *   neighbors <node-id>    graph traversal; --kind <edge-kind>, --depth <n>
 *   list                   every prose file and cluster
 * All support `--json` (stable, deterministically ordered — identical input +
 * args → byte-identical output). Exit codes: 0 on success (incl. an honest
 * empty result); 1 on `get` unknown/escaping file, `neighbors` unknown node-id,
 * or a malformed `map/` artefact. Deterministic Core (R-001): the engine
 * (insight/query.ts) does the work; this layer only parses argv, renders, and
 * sets exit codes. Reads only `insight/map/`; writes nothing.
 */
import * as path from 'path';
import {
  queryInsight,
  getFile,
  neighbors,
  listInsight,
  InsightArtefactError,
  EDGE_KINDS,
  type EdgeKind,
  type QueryResult,
  type NeighborsResult,
  type ListResult,
} from './query.js';

function mapDirOf(root: string): string {
  return path.join(root, '.cortex', 'insight', 'map');
}

/** First non-flag argument after the subcommand (the topic / file / node-id). */
function firstPositional(argv: string[]): string | undefined {
  return argv.find((a) => !a.startsWith('-'));
}

// ---------------------------------------------------------------------------
// Human-readable renderers.
// ---------------------------------------------------------------------------

function renderQuery(r: QueryResult): string {
  const lines: string[] = [];
  const total = r.sections.length + r.nodes.length + r.clusters.length;
  if (total === 0) {
    return `No insight matches "${r.topic}".`;
  }
  if (r.sections.length > 0) {
    lines.push('Prose sections:');
    for (const s of r.sections) {
      lines.push(`  ${s.file} ## ${s.heading ?? '(preamble)'}`);
      if (s.snippet) lines.push(`    ${s.snippet}`);
    }
  }
  if (r.nodes.length > 0) {
    lines.push('Nodes (by tag):');
    for (const n of r.nodes) lines.push(`  ${n.id} [${n.tags.join(', ')}]`);
  }
  if (r.clusters.length > 0) {
    lines.push('Clusters:');
    for (const c of r.clusters) lines.push(`  ${c.id} — ${c.label}`);
  }
  return lines.join('\n');
}

function renderNeighbors(r: NeighborsResult): string {
  const lines: string[] = [];
  const scope = r.kind !== null ? `, kind ${r.kind}` : '';
  lines.push(`${r.node} — neighbors (depth ${r.depth}${scope}):`);
  if (r.edges.length === 0) {
    lines.push('  (no matching edges — isolated in this view)');
    return lines.join('\n');
  }
  for (const e of r.edges) {
    lines.push(`  ${e.from} --[${e.kind}, ${e.confidence}]--> ${e.to}`);
    lines.push(`    rationale: ${e.rationale}`);
  }
  return lines.join('\n');
}

function renderList(r: ListResult): string {
  const lines: string[] = [];
  lines.push('Prose files:');
  if (r.files.length === 0) lines.push('  (none)');
  else for (const f of r.files) lines.push(`  ${f}`);
  lines.push('Clusters:');
  if (r.clusters.length === 0) lines.push('  (none)');
  else for (const c of r.clusters) lines.push(`  ${c.id} — ${c.label}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Dispatch.
// ---------------------------------------------------------------------------

export async function insightCli(subcommand: string | undefined, argv: string[], root = '.'): Promise<number> {
  const json = argv.includes('--json');
  const mapDir = mapDirOf(root);

  try {
    switch (subcommand) {
      case 'query': {
        const topic = firstPositional(argv);
        if (topic === undefined) {
          console.error('cortex insight query: a <topic> is required.');
          return 1;
        }
        const result = queryInsight(mapDir, topic);
        if (json) {
          console.log(JSON.stringify({ command: 'query', ...result }, null, 2));
        } else {
          console.log(renderQuery(result));
        }
        return 0;
      }

      case 'get': {
        const name = firstPositional(argv);
        if (name === undefined) {
          console.error('cortex insight get: a <file> is required.');
          return 1;
        }
        const result = getFile(mapDir, name);
        if (!result.found) {
          console.error(`cortex insight get: ${result.error}`);
          return 1;
        }
        if (json) {
          console.log(
            JSON.stringify({ command: 'get', file: name, content: (result.bytes as Buffer).toString('utf-8') }, null, 2),
          );
        } else {
          // Verbatim: emit exactly the file bytes, no added newline or reformat.
          process.stdout.write(result.bytes as Buffer);
        }
        return 0;
      }

      case 'neighbors': {
        const nodeId = firstPositional(argv);
        if (nodeId === undefined) {
          console.error('cortex insight neighbors: a <node-id> is required.');
          return 1;
        }
        let kind: EdgeKind | undefined;
        const kindIdx = argv.indexOf('--kind');
        if (kindIdx >= 0) {
          const value = argv[kindIdx + 1];
          if (!value || !(EDGE_KINDS as readonly string[]).includes(value)) {
            console.error(`cortex insight neighbors: --kind must be one of ${EDGE_KINDS.join(' | ')}.`);
            return 1;
          }
          kind = value as EdgeKind;
        }
        let depth = 1;
        const depthIdx = argv.indexOf('--depth');
        if (depthIdx >= 0) {
          const parsed = Number(argv[depthIdx + 1]);
          if (!Number.isInteger(parsed) || parsed < 1) {
            console.error('cortex insight neighbors: --depth must be a positive integer.');
            return 1;
          }
          depth = parsed;
        }
        const result = neighbors(mapDir, nodeId, { ...(kind !== undefined ? { kind } : {}), depth });
        if (!result.found) {
          console.error(`cortex insight neighbors: ${result.error}`);
          return 1;
        }
        if (json) {
          const { error: _error, ...payload } = result;
          console.log(JSON.stringify({ command: 'neighbors', ...payload }, null, 2));
        } else {
          console.log(renderNeighbors(result));
        }
        return 0;
      }

      case 'list': {
        const result = listInsight(mapDir);
        if (json) {
          console.log(JSON.stringify({ command: 'list', ...result }, null, 2));
        } else {
          console.log(renderList(result));
        }
        return 0;
      }

      default:
        console.error(
          `cortex insight: unknown subcommand ${subcommand ?? '(none)'} — expected query | get | neighbors | list.`,
        );
        return 1;
    }
  } catch (err) {
    if (err instanceof InsightArtefactError) {
      console.error(`cortex insight: ${err.message}`);
      return 1;
    }
    console.error(`cortex insight: ${(err as Error).message}`);
    return 1;
  }
}
