/**
 * Atomic tests for atlas.ingest-skill — the shipped SKILL.md bundle.
 *
 * A Skill is a prompt artefact (spec Notes): its runtime behaviour is not
 * unit-tested. What IS mechanically pinned here is that the bundle exists at
 * the package root with the right frontmatter, and that its body literally
 * contains every element of the spec Rule 2 workflow contract plus the
 * atlas-only boundary and the specflow-ingest routing instruction.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

// tests/atomic/atlas/ → package root is three levels up.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SKILL_PATH = path.join(PKG_ROOT, 'skills', 'cortex-ingest', 'SKILL.md');

const raw = fs.readFileSync(SKILL_PATH, 'utf-8');
const parsed = matter(raw);
const body = parsed.content;

// ---------------------------------------------------------------------------
// AC "Bundle ships and init installs it" (bundle-ships half)
// ---------------------------------------------------------------------------
describe('Bundle ships and init installs it', () => {
  it('the package ships skills/cortex-ingest/SKILL.md', () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
  });

  it('frontmatter carries name: cortex-ingest', () => {
    expect(parsed.data['name']).toBe('cortex-ingest');
  });

  it('description carries invocation triggers (ingest transcript/RFP/brief, add to project memory)', () => {
    const desc = String(parsed.data['description'] ?? '');
    expect(desc).toMatch(/ingest this transcript/i);
    expect(desc).toMatch(/rfp/i);
    expect(desc).toMatch(/brief/i);
    expect(desc).toMatch(/add this to project memory/i);
  });
});

// ---------------------------------------------------------------------------
// AC "Body carries the full instructed workflow" — one assertion per element
// ---------------------------------------------------------------------------
describe('Body carries the full instructed workflow', () => {
  it('(a) index-first: read atlas/_index.md and per-directory _index.md before writing', () => {
    expect(body).toContain('atlas/_index.md');
    expect(body).toMatch(/index-first/i);
    expect(body).toContain('atlas/stakeholders/_index.md');
  });

  it('(b) verbatim source preservation with <slug>.meta.md per §4.4 (id/kind/captured/origin + enum)', () => {
    expect(body).toContain('atlas/sources/<slug>.<ext>');
    expect(body).toContain('<slug>.meta.md');
    expect(body).toContain('id: source.<slug>');
    expect(body).toContain('transcript|rfp|slack|pdf|design-doc|other');
    expect(body).toContain('captured');
    expect(body).toContain('origin');
  });

  it('(c) provenance-mandatory extraction with correct id patterns and a sources: list', () => {
    expect(body).toContain('stakeholder.<slug>');
    expect(body).toContain('decision.<YYYY-MM-DD>-<slug>');
    expect(body).toContain('domain.<term>');
    expect(body).toContain('sources:');
    expect(body).toMatch(/provenance is mandatory/i);
  });

  it('(d) atlas-only write boundary', () => {
    expect(body).toMatch(/only inside `atlas\/`/i);
  });

  it('(e) re-ingest is an update, not a duplicate', () => {
    expect(body).toMatch(/re-ingest/i);
    expect(body).toMatch(/rather than.*duplicat|not a duplicate/i);
    expect(body).toMatch(/existing.*id|check existing/i);
  });

  it('(f) post-write cortex validate run', () => {
    expect(body).toContain('cortex validate');
  });

  it('routes requirements-shaped content to specflow-ingest', () => {
    expect(body).toContain('specflow-ingest');
    expect(body).toMatch(/product requirements/i);
  });
});

// ---------------------------------------------------------------------------
// AC "Atlas-only boundary is explicit"
// ---------------------------------------------------------------------------
describe('Atlas-only boundary is explicit', () => {
  it('explicitly forbids writes outside atlas/ (never compass, anatomy, specs, pulse)', () => {
    expect(body).toMatch(/never.*compass/i);
    expect(body).toContain('anatomy');
    expect(body).toContain('specs');
    expect(body).toContain('pulse');
  });

  it('instructs surfacing rule candidates as human suggestions only', () => {
    expect(body).toMatch(/rule candidate/i);
    expect(body).toMatch(/suggestion for the human|suggestions for the human/i);
    expect(body).toMatch(/never (author|written)|surfaced, never/i);
  });
});
