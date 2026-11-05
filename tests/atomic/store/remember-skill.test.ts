/**
 * Atomic tests — `store.remember-skill`, one per acceptance criterion. The
 * skill is agentic; these pin its text (order, readback, origin, rules).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SKILL = path.join(ROOT, 'skills', 'cortex-remember', 'SKILL.md');
const MIRROR = path.join(ROOT, '.claude', 'skills', 'cortex-remember', 'SKILL.md');
const text = fs.readFileSync(SKILL, 'utf8');

describe('store.remember-skill', () => {
  it('[STORE-REMEMBER-SKILL-1] exists and is mirrored byte for byte', () => {
    expect(fs.readFileSync(MIRROR, 'utf8')).toBe(text);
  });

  it('[STORE-REMEMBER-SKILL-2] fits the skill-listing budget', () => {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'measure-skill-descriptions.mjs')], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/^cortex-remember\s+B\b/m);
    expect(out).toContain('OK    all');
  });

  it('[STORE-REMEMBER-SKILL-3] carries the placement procedure in order', () => {
    const steps = ['Search first', 'Append to the existing subject file', 'kind → folder table', 'tie-breaker', 'Set `verified` with a method, and `origin`', '`until:', '`cortex store validate`', 'readback'];
    const body = text.slice(text.indexOf('## Steps, in order'), text.indexOf('## Rules from the user'));
    const at = steps.map((s) => body.indexOf(s));
    expect(at.every((i) => i >= 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('[STORE-REMEMBER-SKILL-4] specifies the readback format exactly', () => {
    expect(text).toContain('`Filing: <fact> → <path> (origin: <origin>)`');
    expect(text).toContain('`Updated: <fact> → <path> (origin: <origin>)`');
  });

  it('[STORE-REMEMBER-SKILL-5] takes the origin from the session, with the stated fallbacks', () => {
    expect(text).toContain('`origin: session:<id>`');
    expect(text).toContain('$CLAUDE_CODE_SESSION_ID');
    expect(text).toContain("add your value to that file's `origin` list");
    expect(text).toContain('`origin: person:user@<today>`');
    expect(text).toContain('`origin: source:<its history/sources/ digest path>`');
    expect(text).toContain('Never write a transcript path or a URL as an origin');
  });

  it('[STORE-REMEMBER-SKILL-6] directs user rules to world/rules with a situation, source and scope', () => {
    const rules = text.slice(text.indexOf('## Rules from the user'));
    expect(rules).toContain('`world/rules/<rule>.md`');
    expect(rules).toContain('`applies_when`: one sentence describing the situation');
    expect(rules).toContain('`source: user@<today>`');
    expect(rules).toContain('`scope`:');
  });

  const afterReadback = () => text.slice(text.indexOf('**End with the readback**'));

  it('[STORE-REMEMBER-SKILL-7] writes source digests (Rule 7)', () => {
    const t = afterReadback();
    for (const p of ['`history/sources/<YYYY-MM-DD>-<slug>.md`', '`captured: <today>`', '`origin: external:', 'no URL', '`raw: history/sources/raw/<YYYY-MM-DD>-<slug>.<ext>`', 'byte for byte', '`origin: source:history/sources/<file>.md`']) expect(t, p).toContain(p);
  });

  it('[STORE-REMEMBER-SKILL-8] has a propose mode (Rule 8)', () => {
    const t = afterReadback();
    for (const p of ['`now/proposals.md`', '`## P-<YYYY-MM-DD>-<slug>: <title>`', '`until: <today + 30 days>`', '`status: pending decision`', '`Proposed: <proposal> → now/proposals.md#P-<YYYY-MM-DD>-<slug> (origin: <origin>)`', 'never approves its own proposal']) expect(t, p).toContain(p);
  });

  it('[STORE-REMEMBER-SKILL-9] writes nothing before acceptance (Rule 10)', () => {
    const pre = text.slice(0, text.indexOf('## Steps, in order'));
    expect(pre).toContain('`migration.accepted`');
    expect(pre).toContain('no `.cortex/`');
    expect(pre).toContain("This project's store is migrated but not accepted (cortex migrate --accept); nothing filed.");
  });

  const digest = text.slice(text.indexOf('## A document to keep'), text.indexOf('## Propose mode'));
  const bug = text.slice(text.indexOf('## A bug'), text.indexOf('## Never'));

  it('[STORE-REMEMBER-SKILL-10] Asks in a digest become spec requests', () => {
    expect(digest).toContain('Every ask listed in the digest is filed as one spec request');
    for (const n of ['`now/proposals.md`', '`## P-<YYYY-MM-DD>-<slug>: Spec request: <ask in ≤ 12 words>`', '`until: <today + 30 days>`', '`status: pending decision`', '`Run specflow-spec on this ask.`', 'quoted verbatim', '`source: <digest path>`']) expect(digest, n).toContain(n);
  });

  it('[STORE-REMEMBER-SKILL-11] The spec-request readback is exact', () => {
    expect(text).toContain('Spec request: <ask> → now/proposals.md#P-<YYYY-MM-DD>-<slug> (origin: source:<digest path>)');
  });

  it('[STORE-REMEMBER-SKILL-12] The skill does not judge an ask', () => {
    expect(digest).toContain('Do not judge the ask, reconcile it against the specs, or run specflow-spec');
  });

  it('[STORE-REMEMBER-SKILL-13] A digest with no asks files no item', () => {
    expect(digest).toContain('A digest with no asks files no spec request.');
  });

  it('[STORE-REMEMBER-SKILL-14] The Rule 2 steps and description are unchanged', () => {
    const steps = text.slice(text.indexOf('## Steps, in order'), text.indexOf('## Rules from the user'));
    expect(createHash('sha256').update(steps).digest('hex')).toBe('0010439c3960541834abb7a8c2e58b00ed82567b3194044fc4e62804363c923a');
    expect(text).toContain(`File one fact in this project's cortex/ store, in the one place it belongs, and show where. Use when the user says "remember this", "note that", "from now on", "file this bug", or explains something the store doesn't hold.`);
  });

  it('[STORE-REMEMBER-SKILL-15] The write gate stands alone', () => {
    const pre = text.slice(0, text.indexOf('## Steps, in order'));
    expect(pre).toContain("This project's store is migrated but not accepted (cortex migrate --accept); nothing filed.");
    expect(pre).not.toMatch(/store\.[a-z-]+|core-cli\.|specflow\.[a-z-]+/);
  });

  it('[STORE-REMEMBER-SKILL-16] The description routes a bug here', () => {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'measure-skill-descriptions.mjs')], { cwd: ROOT, encoding: 'utf8' });
    expect(text.split('---')[1]).toContain('"file this bug"');
    expect(out).toContain('OK    all');
  });

  it('[STORE-REMEMBER-SKILL-17] A bug is filed as an open pitfall', () => {
    for (const n of ['`code/<area>/<slug>.md`', '`status: open`', 'no `B-NNN` id', '`repo`', 'body lines', '`Filing:`']) expect(bug, n).toContain(n);
  });

  it('[STORE-REMEMBER-SKILL-18] A fixed bug moves to history', () => {
    for (const n of ['`history/incidents/<today>-<slug>.md`', '`aliases`', '`origin`', 'drop `status`', '`Fixed: <today>, <commit or change>`', 'remove the `code/` file', "`rg '<old path>' cortex/`", '`cortex store validate`']) expect(bug, n).toContain(n);
  });

  it('[STORE-REMEMBER-SKILL-19] The closing readback is exact', () => {
    expect(text).toContain('Closed: <bug in ≤ 12 words> → <path> (origin: <origin>)');
  });

  it('[STORE-REMEMBER-SKILL-20] A fix in flight closes nothing', () => {
    expect(bug).toContain("Only a person's word or observed evidence that the fix landed closes a bug; a fix in flight does not.");
  });
});
