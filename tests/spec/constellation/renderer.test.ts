/**
 * Spec-level tests — constellation.renderer (§4.9 v3.0). One labeled describe
 * per spec AC, driving the real HTTP server on an ephemeral 127.0.0.1 port
 * over a real compiled fixture (`compile()` in a sandboxed tmp project —
 * v3: `cortex scan` IS the compiler; the anatomy scan half is retired).
 * The locked preset set is now default | orphans | domain; the anatomy-only /
 * knowledge-only lenses and the v2 serve-time `insight` overlay are retired
 * (unknown-preset 400). Visual behaviour is deliberately untested here
 * (journey tier, deferred — spec Notes).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type * as http from 'http';
import type { AddressInfo } from 'net';
import { createServer, serveConstellation, PRESET_NAMES } from '../../../src/constellation/server.js';
import { compile } from '../../../src/constellation/compile.js';
import type { Constellation } from '../../../src/constellation/compile.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeRule,
  writeDevSpec,
  writeBizSpec,
  writeBug,
  writeAtlas,
  writeCompassCoreFile,
  readConstellation,
} from '../../fixtures/constellation-harness.js';

const TEST_TIMEOUT = 30_000;

/**
 * Project covering every v3 module: a rule governing src/schema (globs emit
 * nothing — files are not nodes), a bug, an atlas artefact, a fully
 * unreferenced compass core file (the orphan), and dev+business specs in the
 * `schema` and `hooks` domains.
 */
function rendererFixture(root: string): void {
  makeCortexProject(root);
  writeRule(
    root,
    'R-001-pure-core.md',
    `id: R-001\ntitle: Pure core\nsource:\n  - ../bugs/B-001-fixture.md\ngoverns:\n  - "src/schema/**"`,
  );
  writeBug(
    root,
    'B-001-fixture.md',
    `id: B-001\ntitle: Fixture bug\ntype: test-defect\nseverity: low\nstatus: open\naffects:\n  - R-001`,
  );
  writeAtlas(root, 'decisions/D-001.md', `id: D-001\ntitle: Fixture decision\ncompass_rules:\n  - R-001`);
  writeCompassCoreFile(root, 'preferences.md'); // referenced by nothing — the orphan
  writeDevSpec(
    root,
    'schema/validator.spec.md',
    `id: schema.validator\nstatus: draft\nimplements: ../../specs-business/schema/trust.business.md\ngoverned_by:\n  - R-001`,
  );
  writeBizSpec(
    root,
    'schema/trust.business.md',
    `id: schema.trust\nstatus: draft\nimplemented_by:\n  - ../../specs/schema/validator.spec.md`,
  );
  writeDevSpec(
    root,
    'hooks/session-start.spec.md',
    `id: hooks.session-start\nstatus: draft\nimplements: ../../specs-business/hooks/awareness.business.md`,
  );
  writeBizSpec(
    root,
    'hooks/awareness.business.md',
    `id: hooks.awareness\nstatus: draft\nimplemented_by:\n  - ../../specs/hooks/session-start.spec.md`,
  );
}

/** content-hash snapshot of every file under root (read-only assertions). */
function snapshotTree(root: string): Map<string, string> {
  const snapshot = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) {
        snapshot.set(
          path.relative(root, abs),
          crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'),
        );
      }
    }
  };
  walk(root);
  return snapshot;
}

let root: string;
let server: http.Server;
let base: string;
let compiled: Constellation;
const extraServers: http.Server[] = [];
const extraDirs: string[] = [];

async function listen(s: http.Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    s.once('error', reject);
    s.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

function closeAll(servers: http.Server[]): Promise<unknown> {
  return Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  );
}

beforeAll(async () => {
  root = makeTmpDir('spec-renderer');
  rendererFixture(root);
  await compile(root); // the real compiler output (what `cortex scan` writes)
  compiled = readConstellation(root);
  server = createServer(root);
  base = await listen(server);
}, TEST_TIMEOUT);

afterAll(async () => {
  await closeAll([server, ...extraServers]);
  cleanTmp(root);
  while (extraDirs.length > 0) cleanTmp(extraDirs.pop() as string);
});

async function api(query: string): Promise<{ status: number; body: Constellation & { error?: string } }> {
  const res = await fetch(`${base}/api/constellation${query}`);
  return { status: res.status, body: (await res.json()) as Constellation & { error?: string } };
}

// ===========================================================================
// AC 1: Server starts, binds localhost, serves the SPA skeleton
// ===========================================================================

describe('AC renderer.1: server starts, binds localhost, serves the SPA skeleton', () => {
  it(
    'serveConstellation prints http://127.0.0.1:<port> and the socket is bound to 127.0.0.1 only',
    async () => {
      const lines: string[] = [];
      const s = await serveConstellation(root, 0, (l) => lines.push(l));
      extraServers.push(s);
      const address = s.address() as AddressInfo;
      expect(address.address).toBe('127.0.0.1'); // never 0.0.0.0 (Rule 2)
      expect(lines.join('\n')).toContain(`http://127.0.0.1:${address.port}`);
    },
    TEST_TIMEOUT,
  );

  it('GET / returns HTML with the canvas, the chrome landmarks, and a switcher naming exactly the three presets', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    // The canvas the map renders into (replaces the v2 Cytoscape container).
    expect(html).toContain('<canvas id="constellation"');
    // Chrome landmarks (stable id hooks documented in the renderer spec).
    for (const id of ['id="stats"', 'id="search"', 'id="presets"', 'id="breadcrumb"', 'id="legend"', 'id="zoom-controls"', 'id="hint"']) {
      expect(html).toContain(id);
    }
    // The three v3 filtering lenses …
    for (const name of PRESET_NAMES) {
      expect(html).toContain(`data-preset="${name}"`);
    }
    // … and nothing else: the retired anatomy lenses and the v2 insight
    // overlay button are gone (build-order-v3 step 7 + step-10 disposition).
    expect(html).not.toContain('data-preset="insight"');
    expect(html).not.toContain('data-preset="anatomy-only"');
    expect(html).not.toContain('data-preset="knowledge-only"');
    expect(html.match(/data-preset="/g)).toHaveLength(3); // exactly three, no extras
  });

  it('is self-contained: no external <script src>, and the only external resource is the Google Fonts <link>', async () => {
    const html = await (await fetch(`${base}/`)).text();
    // Zero external scripts — all logic (incl. the embedded lod.ts functions) is inline.
    expect(html).not.toMatch(/<script\b[^>]*\bsrc=/i);
    // Every absolute URL points at Google Fonts and nowhere else (no CDN, no telemetry).
    const urls = html.match(/https?:\/\/[^"')\s]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toMatch(/fonts\.(googleapis|gstatic)\.com/);
    // Exactly one loaded stylesheet: the fonts CSS (fallback stacks keep it readable offline).
    expect(html.match(/rel="stylesheet"/g) ?? []).toHaveLength(1);
  });
});

// ===========================================================================
// AC 2: default preset returns the full compiled map
// ===========================================================================

describe('AC renderer.2: default preset returns the full compiled map', () => {
  it('exactly N nodes, E edges, and the §4.9 top-level keys', async () => {
    const { status, body } = await api('?preset=default');
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['counters', 'edges', 'generated', 'groups', 'nodes', 'schemaVersion']);
    expect(body.nodes).toHaveLength(compiled.nodes.length);
    expect(body.edges).toHaveLength(compiled.edges.length);
    expect(body.counters).toEqual(compiled.counters);
  });

  it('counters carry the v3 shape: compass/atlas/specs/edges/droppedRefs, no anatomy key', async () => {
    const { body } = await api('?preset=default');
    expect(Object.keys(body.counters)).toEqual(['compass', 'atlas', 'specs', 'edges', 'droppedRefs']);
  });
});

// ===========================================================================
// AC 3 (v3): retired presets are rejected like any unknown preset
// ===========================================================================

describe('AC renderer.3 (v3): retired presets are rejected like any unknown preset', () => {
  it('?preset=anatomy-only, ?preset=knowledge-only, ?preset=insight → 400 naming the three valid presets', async () => {
    for (const retired of ['anatomy-only', 'knowledge-only', 'insight']) {
      const { status, body } = await api(`?preset=${retired}`);
      expect(status).toBe(400);
      expect(body.error).toContain('default, orphans, domain');
    }
  });
});

// ===========================================================================
// AC 4: orphans lens surfaces only disconnected nodes
// ===========================================================================

describe('AC renderer.4: orphans lens surfaces only disconnected nodes', () => {
  it('contains the edge-less compass:preferences.md, not the connected spec:schema.validator; edges empty', async () => {
    // Fixture sanity: preferences.md truly has zero edges; the validator spec has some.
    expect(
      compiled.edges.some((e) => e.from === 'compass:preferences.md' || e.to === 'compass:preferences.md'),
    ).toBe(false);
    expect(compiled.edges.some((e) => e.from === 'spec:schema.validator' || e.to === 'spec:schema.validator')).toBe(true);

    const { status, body } = await api('?preset=orphans');
    expect(status).toBe(200);
    const ids = body.nodes.map((n) => n.id);
    expect(ids).toContain('compass:preferences.md');
    expect(ids).not.toContain('spec:schema.validator');
    expect(body.edges).toEqual([]);
    // Closure: only groups/children still holding an orphan survive.
    const usedGroups = new Set(body.nodes.map((n) => n.group));
    for (const group of body.groups) {
      expect(group.children.length).toBeGreaterThan(0);
      for (const child of group.children) expect(usedGroups.has(child.id)).toBe(true);
    }
  });
});

// ===========================================================================
// AC 5: domain lens is parameterized and exact
// ===========================================================================

describe('AC renderer.5: domain lens is parameterized and exact', () => {
  it('domain=schema → only spec-dev/spec-business nodes whose id domain segment is schema', async () => {
    const { status, body } = await api('?preset=domain&domain=schema');
    expect(status).toBe(200);
    expect(body.nodes.map((n) => n.id).sort()).toEqual(['business:schema.trust', 'spec:schema.validator']);
    for (const node of body.nodes) {
      expect(['spec-dev', 'spec-business']).toContain(node.module);
    }
  });

  it('missing domain parameter → 400', async () => {
    const { status, body } = await api('?preset=domain');
    expect(status).toBe(400);
    expect(body.error).toMatch(/domain/);
  });

  it('domain=nonexistent → 200 with empty nodes and edges (honest empty lens)', async () => {
    const { status, body } = await api('?preset=domain&domain=nonexistent');
    expect(status).toBe(200);
    expect(body.nodes).toEqual([]);
    expect(body.edges).toEqual([]);
  });
});

// ===========================================================================
// AC 6: Unknown preset rejected
// ===========================================================================

describe('AC renderer.6: unknown preset rejected', () => {
  it('?preset=pretty → 400 naming the three valid presets', async () => {
    const { status, body } = await api('?preset=pretty');
    expect(status).toBe(400);
    for (const name of PRESET_NAMES) expect(body.error).toContain(name);
  });
});

// ===========================================================================
// AC 7: Missing map reported plainly
// ===========================================================================

describe('AC renderer.7: missing map reported plainly', () => {
  it(
    'no .cortex/constellation.json → 404 telling the user to run cortex scan',
    async () => {
      const bare = makeTmpDir('spec-renderer-nomap');
      extraDirs.push(bare);
      makeCortexProject(bare);
      const s = createServer(bare);
      extraServers.push(s);
      const bareBase = await listen(s);
      const res = await fetch(`${bareBase}/api/constellation?preset=default`);
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('cortex scan');
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
// AC 8: Serving is read-only
// ===========================================================================

describe('AC renderer.8: serving is read-only', () => {
  it(
    'a request sequence across all presets creates, modifies, and deletes nothing under the project root',
    async () => {
      const before = snapshotTree(root);
      await fetch(`${base}/`);
      for (const preset of PRESET_NAMES) {
        await fetch(`${base}/api/constellation?preset=${preset}&domain=schema`);
      }
      await fetch(`${base}/api/constellation?preset=bogus`);
      await fetch(`${base}/api/constellation?preset=insight`); // retired-preset 400 path
      await fetch(`${base}/api/constellation?preset=domain`); // 400 path
      await fetch(`${base}/no-such-route`);
      const after = snapshotTree(root);
      expect([...after.keys()]).toEqual([...before.keys()]); // nothing created/deleted
      expect(Object.fromEntries(after)).toEqual(Object.fromEntries(before)); // nothing modified
    },
    TEST_TIMEOUT,
  );
});

// ===========================================================================
// AC 9: Deterministic responses
// ===========================================================================

describe('AC renderer.9: deterministic responses', () => {
  it('the same query twice over an unchanged constellation.json → byte-identical bodies', async () => {
    for (const query of ['?preset=default', '?preset=orphans', '?preset=domain&domain=schema']) {
      const first = Buffer.from(await (await fetch(`${base}/api/constellation${query}`)).arrayBuffer());
      const second = Buffer.from(await (await fetch(`${base}/api/constellation${query}`)).arrayBuffer());
      expect(first.equals(second)).toBe(true);
    }
  });

  it('re-reads the file per request: an edited constellation.json is visible without restart (Entities: READS)', async () => {
    const mapPath = path.join(root, '.cortex', 'constellation.json');
    const original = fs.readFileSync(mapPath, 'utf-8');
    try {
      const doctored = JSON.parse(original) as Constellation;
      doctored.schemaVersion = '9.9';
      fs.writeFileSync(mapPath, JSON.stringify(doctored, null, 2) + '\n');
      const { body } = await api('?preset=default');
      expect(body.schemaVersion).toBe('9.9');
    } finally {
      fs.writeFileSync(mapPath, original);
    }
  });
});
