/**
 * Spec tests for insight.module-contract — updated at build-order-v3 step 5b
 * to the v3 storage contract (init scaffolds the v3 flat layout: anatomy/ +
 * concepts/, no map/, and the locked §7.4 v3 _index.md), and again at step 7
 * (anatomy deprecation): the legacy v2 formats module (src/insight/formats.ts)
 * was deleted along with its interim consumers, so the v2 prose/JSON
 * format-guard describes are gone. Runs against fresh tmp dirs, never the
 * live repo. Every test executes under `pnpm test`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { init } from '../../../src/cli/init.js';
import { INSIGHT_INDEX_TEMPLATE } from '../../../src/cli/templates.js';
import { scaffoldInsight } from '../../../src/insight/scaffold.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';

const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const };

// ---------------------------------------------------------------------------
// AC: Init scaffolds the module committed
// ---------------------------------------------------------------------------

describe('AC: init scaffolds the insight module committed', () => {
  let root: string;
  let home: string;
  beforeAll(async () => {
    root = makeTmpDir('insight-scaffold-proj');
    home = makeTmpDir('insight-scaffold-home');
    await init(root, { noLlm: true, home, ...DARWIN });
  }, TEST_TIMEOUT);
  afterAll(() => {
    cleanTmp(root);
    cleanTmp(home);
  });

  it('creates insight/_index.md and the empty flat anatomy/ + concepts/ dirs (v3 — no map/)', () => {
    const insightDir = path.join(root, '.cortex', 'insight');
    expect(fs.existsSync(path.join(insightDir, '_index.md'))).toBe(true);
    for (const dir of ['anatomy', 'concepts']) {
      const p = path.join(insightDir, dir);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.statSync(p).isDirectory()).toBe(true);
      // Empty — no seeded entries, concepts, or JSON (extraction owns first content).
      expect(fs.readdirSync(p)).toHaveLength(0);
    }
    // The v2 map/ is no longer scaffolded for new projects.
    expect(fs.existsSync(path.join(insightDir, 'map'))).toBe(false);
  });

  it('anatomy/ and concepts/ carry no _index.md of their own', () => {
    expect(fs.existsSync(path.join(root, '.cortex', 'insight', 'anatomy', '_index.md'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.cortex', 'insight', 'concepts', '_index.md'))).toBe(false);
  });

  it('.gitignore does NOT list .cortex/insight/ (committed, not gitignored)', () => {
    const gitignore = path.join(root, '.gitignore');
    const lines = fs.existsSync(gitignore)
      ? fs.readFileSync(gitignore, 'utf-8').split('\n').map((l) => l.trim())
      : [];
    expect(lines).not.toContain('.cortex/insight/');
    expect(lines.some((l) => l.startsWith('.cortex/insight'))).toBe(false);
  });

  it('scaffoldInsight is idempotent — re-run preserves the existing _index.md', () => {
    const indexPath = path.join(root, '.cortex', 'insight', '_index.md');
    const before = fs.readFileSync(indexPath, 'utf-8');
    const result = scaffoldInsight(path.join(root, '.cortex'));
    expect(result.indexWritten).toBe(false);
    expect(fs.readFileSync(indexPath, 'utf-8')).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// AC: The index states the ungated trust model
// ---------------------------------------------------------------------------

describe('AC: insight/_index.md states the ungated trust model (v3 locked template, §7.4)', () => {
  it('names insight as ungated and inferred-not-curated', () => {
    expect(INSIGHT_INDEX_TEMPLATE.toLowerCase()).toContain('ungated');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('Inferred, not');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('the gated layer wins');
  });

  it('references the v3 cortex insight verbs as the query surface', () => {
    expect(INSIGHT_INDEX_TEMPLATE).toContain('cortex insight file <path>');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('cortex insight concept <name>');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('cortex insight element <query>');
  });

  it('describes the v3 layout — anatomy/ entries, concepts/, the JSON trio, scope registry', () => {
    expect(INSIGHT_INDEX_TEMPLATE).toContain('anatomy/');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('concepts/');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('graph.json / tags.json / clusters.json');
    expect(INSIGHT_INDEX_TEMPLATE).toContain('scope-registry.yaml');
  });
});
