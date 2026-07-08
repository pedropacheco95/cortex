/**
 * Spec-level tests — constellation.renderer. One labeled describe per spec AC
 * (10 in total), driving the real HTTP server on an ephemeral 127.0.0.1 port
 * over a real compiled fixture (`scan()` → `compile()` in a sandboxed tmp
 * project). Visual behaviour is deliberately untested here (journey tier,
 * deferred — spec Notes).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type * as http from 'http';
import type { AddressInfo } from 'net';
import { createServer, serveConstellation, PRESET_NAMES } from '../../../src/constellation/server.js';
import { scan } from '../../../src/anatomy/scan.js';
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
  writeCerebrumCoreFile,
  readConstellation,
} from '../../fixtures/constellation-harness.js';

const TEST_TIMEOUT = 30_000;

/**
 * Scannable project covering every module: src files in two layers plus a
 * fully unreferenced `src/lone.ts`, a rule governing src/schema only, a bug,
 * an atlas artefact, a cerebrum core file, and dev+business specs in the
 * `schema` and `hooks` domains.
 */
function rendererFixture(root: string): void {
  makeCortexProject(root);
  fs.mkdirSync(path.join(root, 'src', 'schema'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'schema', 'validate.ts'),
    '/** Validates artefacts against the schema. */\nexport const v = 1;\n',
  );
  fs.writeFileSync(path.join(root, 'src', 'lone.ts'), '/** Referenced by nothing. */\nexport const l = 1;\n');
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
  writeAtlas(root, 'decisions/D-001.md', `id: D-001\ntitle: Fixture decision\ncerebrum_rules:\n  - R-001`);
  writeCerebrumCoreFile(root, 'preferences.md');
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
  await scan(root); // real compile: scan invokes the constellation compiler
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

  it('GET / returns HTML with the Cytoscape container and a switcher naming the six presets', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('id="cy"'); // the Cytoscape container element
    expect(html).toContain('id="presets"');
    // The five v1 filtering lenses …
    for (const name of PRESET_NAMES) {
      expect(html).toContain(`data-preset="${name}"`);
    }
    // … plus the v2 serve-time insight overlay (spec constellation.insight-preset).
    expect(html).toContain('data-preset="insight"');
    expect(html.match(/data-preset="/g)).toHaveLength(6); // exactly six, no extras
  });

  it('serves the cytoscape bundle locally from node_modules (no CDN — offline)', async () => {
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain('src="/vendor/cytoscape.min.js"');
    expect(html).not.toMatch(/https?:\/\//); // no external references at all
    const res = await fetch(`${base}/vendor/cytoscape.min.js`);
    expect(res.status).toBe(200);
    expect((await res.text()).length).toBeGreaterThan(10_000);
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
});

// ===========================================================================
// AC 3: anatomy-only lens
// ===========================================================================

describe('AC renderer.3: anatomy-only lens', () => {
  it('every node is anatomy, every edge has both endpoints in-set, empty groups are absent', async () => {
    const { status, body } = await api('?preset=anatomy-only');
    expect(status).toBe(200);
    expect(body.nodes.length).toBeGreaterThan(0);
    for (const node of body.nodes) expect(node.module).toBe('anatomy');
    const ids = new Set(body.nodes.map((n) => n.id));
    for (const edge of body.edges) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
    }
    const usedGroups = new Set(body.nodes.map((n) => n.group));
    for (const group of body.groups) {
      expect(group.children.length).toBeGreaterThan(0);
      for (const child of group.children) expect(usedGroups.has(child.id)).toBe(true);
    }
    expect(body.groups.map((g) => g.id)).not.toContain('specs');
    expect(body.groups.map((g) => g.id)).not.toContain('cerebrum');
  });
});

// ===========================================================================
// AC 4: knowledge-only lens
// ===========================================================================

describe('AC renderer.4: knowledge-only lens', () => {
  it('no anatomy node; rule, bug, cerebrum, atlas, and both spec modules are all present', async () => {
    const { status, body } = await api('?preset=knowledge-only');
    expect(status).toBe(200);
    const modules = new Set(body.nodes.map((n) => n.module));
    expect(modules.has('anatomy')).toBe(false);
    for (const m of ['rule', 'bug', 'cerebrum', 'atlas', 'spec-dev', 'spec-business']) {
      expect(modules.has(m as never)).toBe(true);
    }
  });
});

// ===========================================================================
// AC 5: orphans lens surfaces only disconnected nodes
// ===========================================================================

describe('AC renderer.5: orphans lens surfaces only disconnected nodes', () => {
  it('contains the edge-less anatomy:src/lone.ts, not the connected spec:schema.validator; edges empty', async () => {
    // Fixture sanity: lone.ts truly has zero edges; the validator spec has some.
    expect(compiled.edges.some((e) => e.from === 'anatomy:src/lone.ts' || e.to === 'anatomy:src/lone.ts')).toBe(false);
    expect(compiled.edges.some((e) => e.from === 'spec:schema.validator' || e.to === 'spec:schema.validator')).toBe(true);

    const { status, body } = await api('?preset=orphans');
    expect(status).toBe(200);
    const ids = body.nodes.map((n) => n.id);
    expect(ids).toContain('anatomy:src/lone.ts');
    expect(ids).not.toContain('spec:schema.validator');
    expect(body.edges).toEqual([]);
  });
});

// ===========================================================================
// AC 6: domain lens is parameterized and exact
// ===========================================================================

describe('AC renderer.6: domain lens is parameterized and exact', () => {
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
// AC 7: Unknown preset rejected
// ===========================================================================

describe('AC renderer.7: unknown preset rejected', () => {
  it('?preset=pretty → 400 naming the five valid presets', async () => {
    const { status, body } = await api('?preset=pretty');
    expect(status).toBe(400);
    for (const name of PRESET_NAMES) expect(body.error).toContain(name);
  });
});

// ===========================================================================
// AC 8: Missing map reported plainly
// ===========================================================================

describe('AC renderer.8: missing map reported plainly', () => {
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
// AC 9: Serving is read-only
// ===========================================================================

describe('AC renderer.9: serving is read-only', () => {
  it(
    'a request sequence across all presets creates, modifies, and deletes nothing under the project root',
    async () => {
      const before = snapshotTree(root);
      await fetch(`${base}/`);
      await fetch(`${base}/vendor/cytoscape.min.js`);
      for (const preset of PRESET_NAMES) {
        await fetch(`${base}/api/constellation?preset=${preset}&domain=schema`);
      }
      await fetch(`${base}/api/constellation?preset=bogus`);
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
// AC 10: Deterministic responses
// ===========================================================================

describe('AC renderer.10: deterministic responses', () => {
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
