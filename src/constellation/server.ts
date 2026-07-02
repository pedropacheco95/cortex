/**
 * Constellation renderer server (spec constellation.renderer, 9 rules;
 * schema §4.9; design §12.7-§12.8).
 *
 * A localhost-only, read-only Node HTTP server over `.cortex/constellation.json`:
 * re-reads the compiled map per request (Rule: a fresh scan is visible on
 * reload), filters it server-side through the five locked presets, and serves
 * the single-page Cytoscape renderer. Never writes, never invokes the
 * compiler — a stale or missing map is reported (`404` + "run cortex scan"),
 * not rebuilt (renderer Rule 3/4).
 */
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { createRequire } from 'module';
import type { AddressInfo } from 'net';
import type { Constellation, ConstellationNode } from './compile.js';
import { SPA_HTML } from './spa.js';

/** The locked preset set (renderer Rule 6) — exactly five, never extended ad hoc. */
export const PRESET_NAMES = ['default', 'anatomy-only', 'knowledge-only', 'orphans', 'domain'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

/** Default port, fixed at implementation (renderer Rule 1). */
export const DEFAULT_PORT = 4747;

export type PresetResult =
  | { ok: true; constellation: Constellation }
  | { ok: false; status: 400; error: string };

/** Domain segment of a spec node id: `spec:schema.validator` → `schema` (Rule 6). */
function domainSegment(node: ConstellationNode): string {
  const idPart = node.id.slice(node.id.indexOf(':') + 1);
  const dot = idPart.indexOf('.');
  return dot > 0 ? idPart.slice(0, dot) : idPart;
}

/**
 * Filter a compiled constellation through one of the five locked presets
 * (Rule 6) with full filter closure (Rule 7): edges are kept iff both
 * endpoints survive; groups/children are pruned to those with at least one
 * remaining node; counters are recomputed over the filtered sets
 * (`droppedRefs` passes through — it is a property of compilation, not of the
 * lens). Pure: never mutates its input, never restyles or summarises (Rule 5).
 * A `domain` value matching nothing is an honest empty lens, not an error.
 */
export function applyPreset(constellation: Constellation, preset: string, domain?: string): PresetResult {
  if (!(PRESET_NAMES as readonly string[]).includes(preset)) {
    return {
      ok: false,
      status: 400,
      error: `Unknown preset "${preset}". Valid presets: ${PRESET_NAMES.join(', ')}.`,
    };
  }
  if (preset === 'domain' && domain === undefined) {
    return {
      ok: false,
      status: 400,
      error: 'The domain preset requires a ?domain=<d> query parameter.',
    };
  }

  let keep: (node: ConstellationNode) => boolean;
  switch (preset as PresetName) {
    case 'default':
      keep = () => true;
      break;
    case 'anatomy-only':
      keep = (n) => n.module === 'anatomy';
      break;
    case 'knowledge-only':
      keep = (n) => n.module !== 'anatomy';
      break;
    case 'orphans': {
      // Zero connected edges in EITHER direction (spec Notes: deliberate
      // widening of "zero incoming"), computed over the full edge set.
      const connected = new Set<string>();
      for (const e of constellation.edges) {
        connected.add(e.from);
        connected.add(e.to);
      }
      keep = (n) => !connected.has(n.id);
      break;
    }
    case 'domain':
      keep = (n) =>
        (n.module === 'spec-dev' || n.module === 'spec-business') && domainSegment(n) === domain;
      break;
  }

  const nodes = constellation.nodes.filter(keep);
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Closure: an edge survives iff BOTH endpoints survive (Rule 7).
  const edges = constellation.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

  // Closure: children pruned to those with ≥1 remaining node; top groups
  // pruned when nothing remains under them (Rule 7).
  const usedGroups = new Set(nodes.map((n) => n.group));
  const groups = constellation.groups
    .map((g) => ({ ...g, children: g.children.filter((c) => usedGroups.has(c.id)) }))
    .filter((g) => g.children.length > 0 || usedGroups.has(g.id));

  const counters = {
    anatomy: nodes.filter((n) => n.module === 'anatomy').length,
    cerebrum: nodes.filter((n) => n.module === 'rule' || n.module === 'bug' || n.module === 'cerebrum').length,
    atlas: nodes.filter((n) => n.module === 'atlas').length,
    specs: nodes.filter((n) => n.module === 'spec-dev' || n.module === 'spec-business').length,
    edges: edges.length,
    droppedRefs: constellation.counters.droppedRefs,
  };

  return {
    ok: true,
    constellation: {
      schemaVersion: constellation.schemaVersion,
      generated: constellation.generated,
      groups,
      nodes,
      edges,
      counters,
    },
  };
}

/** Cytoscape's browser bundle, served locally from node_modules (no CDN — offline). */
const CYTOSCAPE_DIST = createRequire(import.meta.url).resolve('cytoscape/dist/cytoscape.min.js');

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2) + '\n');
}

function handleApi(root: string, url: URL, res: http.ServerResponse): void {
  const mapPath = path.join(root, '.cortex', 'constellation.json');
  // Re-read per request so a fresh scan is visible on reload (Entities: READS).
  let raw: string;
  try {
    raw = fs.readFileSync(mapPath, 'utf-8');
  } catch {
    sendJson(res, 404, {
      error: 'No compiled constellation found at .cortex/constellation.json — run cortex scan first.',
    });
    return;
  }
  let constellation: Constellation;
  try {
    constellation = JSON.parse(raw) as Constellation;
  } catch {
    sendJson(res, 500, {
      error: '.cortex/constellation.json is not valid JSON — run cortex scan to recompile it.',
    });
    return;
  }
  const preset = url.searchParams.get('preset') ?? 'default';
  const domain = url.searchParams.get('domain') ?? undefined;
  const result = applyPreset(constellation, preset, domain);
  if (!result.ok) {
    sendJson(res, result.status, { error: result.error });
    return;
  }
  // Deterministic at the contract (Rule 9): the body is a pure function of
  // the file bytes and the query — same input, byte-identical response.
  sendJson(res, 200, JSON.stringify(result.constellation, null, 2) + '\n');
}

/**
 * Build the (unlistened) HTTP server for `root`. Strictly read-only over the
 * project (Rule 3): handlers only ever read `.cortex/constellation.json` and
 * the cytoscape bundle. Exported unlistened so tests can drive it on an
 * ephemeral port; `serveConstellation` binds it for the CLI.
 */
export function createServer(root: string): http.Server {
  const absRoot = path.resolve(root);
  return http.createServer((req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed — the constellation is read-only.' });
      return;
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SPA_HTML);
    } else if (url.pathname === '/vendor/cytoscape.min.js') {
      try {
        const js = fs.readFileSync(CYTOSCAPE_DIST);
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(js);
      } catch {
        sendJson(res, 404, { error: 'cytoscape bundle not found — reinstall dependencies.' });
      }
    } else if (url.pathname === '/api/constellation') {
      handleApi(absRoot, url, res);
    } else {
      sendJson(res, 404, { error: 'Not found.' });
    }
  });
}

/**
 * `cortex constellation [--port N]` (Rule 1): bind `127.0.0.1` exclusively
 * (Rule 2 — never 0.0.0.0), print the full URL, never auto-open a browser.
 * Resolves with the listening server; the CLI awaits its `close`.
 */
export function serveConstellation(
  root: string,
  port: number = DEFAULT_PORT,
  log: (line: string) => void = console.log,
): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(root);
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      log(`Cortex constellation serving at http://127.0.0.1:${address.port} (Ctrl-C to stop)`);
      resolve(server);
    });
  });
}
