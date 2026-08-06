#!/usr/bin/env node
/**
 * Measure the context cost of the shipped skill listing — the guard for
 * `scaffolding.skill-listing-budget`.
 *
 * Claude Code budgets the whole skill listing at ~1% of the context window
 * (~2k tokens at 200k) and resident cost is `name` + `description` — the
 * SKILL.md body is lazy-loaded and free until the skill is invoked. This script
 * keeps EVERY shipped bundle inside its tier's ceiling: it parses both fields
 * out of each bundle's frontmatter, sums the characters, compares against the
 * same measurement taken from a git ref (default HEAD), and asserts that every
 * routed description still carries its pinned trigger phrases.
 *
 *   node scripts/measure-skill-descriptions.mjs                # all bundles, vs HEAD
 *   node scripts/measure-skill-descriptions.mjs --base <ref>
 *   node scripts/measure-skill-descriptions.mjs --cortex-only  # pre-spec narrow view
 *
 * Exits non-zero if any entry exceeds its tier ceiling, carries no tier, loses a
 * pinned phrase, or (tier D) declares one.
 *
 * The checking half is exported — `evaluate()` is pure over the rows handed to
 * it, so the negative paths can be tested against synthetic bundles rather than
 * by breaking a real one on disk.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = path.join(REPO, 'skills');

/** Rough token estimate used by the listing budget conversation: chars / 4. */
const CHARS_PER_TOKEN = 4;

/**
 * Per-tier ceiling on `name` + `description`, in characters
 * (`scaffolding.skill-listing-budget` Rule 3). `null` means exempt.
 *
 *   A — name-dispatched. Some other prompt names the bundle (SCHEDULED_TASKS'
 *       prompt bodies, specflow-entry's routing table, a sibling skill body), so
 *       the description is not what makes it reachable.
 *   B — cold-phrasing entry point. Nothing names it; the description is the only
 *       routing signal, so it keeps real trigger surface.
 *   C — specflow-entry. The mandatory gate on arbitrary phrasing; every Tier A
 *       assignment depends on it firing, so it is not shrunk to fund them.
 *   D — callable-only. Never routed into by a description matching a sentence.
 *       Reached by one of two explicit namings: the developer types `/<name>`, or
 *       a prompt Cortex itself authors names it (the scheduled-task payloads in
 *       templates.ts name `cortex-loop`). It declares NO trigger phrases —
 *       removing the trigger surface is the point, and the tokens are a
 *       consequence.
 */
export const TIER_CEILING = { A: 120, B: 250, C: null, D: 60 };

/** Every shipped bundle's tier. An unlisted bundle is a failure, not a default (Rule 7). */
export const TIERS = {
  'cortex-archive-ingest': 'A',
  'cortex-extract-insight': 'A',
  'cortex-loop': 'D',
  'cortex-register-tasks': 'A',
  'specflow-brainstorm': 'A',
  'specflow-bugs': 'A',
  'specflow-deep-onboard': 'D',
  'specflow-develop': 'A',
  'specflow-entry': 'C',
  'specflow-ingest': 'A',
  'specflow-intent-reconcile': 'A',
  'specflow-lint': 'A',
  'specflow-new-project': 'B',
  'specflow-onboard-codebase': 'A',
  'specflow-plan': 'A',
  'specflow-receive-review': 'A',
  'specflow-request-review': 'B',
  'specflow-spec-editor': 'A',
  'specflow-tests': 'A',
  'specflow-viewer': 'D',
  'verification-before-completion': 'A',
};

/**
 * Routing phrases each description MUST keep (task constraint 2: a human typing
 * the natural phrasing still reaches the skill). Checked case-insensitively as
 * substrings.
 */
export const REQUIRED_TRIGGERS = {
  // The three human-invoked-only bundles (no scheduled bundle names them in its
  // prompt body) carry broader surface, because the description is their ONLY
  // routing signal.
  'cortex-archive-ingest': ['transcript', 'rfp', 'brief', 'contract', 'add this to project memory'],
  'cortex-extract-insight': ['extract insight', 'refresh', 'map this codebase'],
  'cortex-register-tasks': ['register', 'activate', 'cortex scheduled tasks', 'claude desktop'],

  // Tier A — reachable because specflow-entry's routing table or a sibling body
  // names them, so two or three phrases is the whole surface they need.
  'specflow-brainstorm': ['I want to add', 'how should we approach'],
  'specflow-bugs': ['is broken', 'why does', 'triage'],
  'specflow-develop': ['implement this spec', 'build this slice'],
  'specflow-ingest': ['the client sent this', 'ingest this'],
  'specflow-intent-reconcile': ['pin this ask', 'did the spec keep it'],
  'specflow-lint': ['lint specs', 'validate the spec tree'],
  'specflow-onboard-codebase': ['onboard this codebase'],
  'specflow-plan': ['plan this', 'break this down', 'what are the steps'],
  'specflow-receive-review': ['here is the feedback'],
  'specflow-spec-editor': ['update the spec', 'add this criterion'],
  'specflow-tests': ['write tests', 'generate tests from specs'],
  'verification-before-completion': ['evidence gate', 'claiming work done'],

  // Tier B — nothing names them, so the description is the only way in.
  'specflow-new-project': ['new project', 'start a new', 'I want to build'],
  'specflow-request-review': ['review this', 'review the diff', 'code review'],

  // Tier C — the gate on arbitrary phrasing. Not shrunk; phrases pinned anyway so
  // a future edit cannot quietly cost it its routing.
  'specflow-entry': ['add a feature', 'fix this bug', 'change this behavior', 'what does X do'],

  // Tier D declares none, and is asserted to have none — see the Tier D check below.
  'cortex-loop': [],
  'specflow-deep-onboard': [],
  'specflow-viewer': [],
};

/**
 * Minimal frontmatter reader for the two fields that cost context. Handles both
 * shapes a SKILL.md uses: a `>-` / `|` block scalar (folded to one line, the way
 * Claude Code presents it) and a plain or quoted single-line scalar.
 */
export function parseNameAndDescription(raw) {
  const m = /^---\n([\s\S]*?\n)---\n/.exec(raw);
  if (!m) return undefined;
  const fm = m[1];
  const field = (key) => {
    const re = new RegExp(`^${key}:[ \\t]*(>-|>|\\|-|\\|)?[ \\t]*(.*)$`, 'm');
    const hit = re.exec(fm);
    if (!hit) return undefined;
    if (!hit[1]) {
      const v = hit[2].trim();
      // Unquote a single-line quoted scalar.
      if (/^"([\s\S]*)"$/.test(v)) return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      if (/^'([\s\S]*)'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
      return v;
    }
    // Block scalar: take the indented continuation lines, fold to one line.
    const after = fm.slice(hit.index + hit[0].length + 1);
    const lines = [];
    for (const line of after.split('\n')) {
      if (line.trim() === '') break;
      if (!/^\s/.test(line)) break;
      lines.push(line.trim());
    }
    return lines.join(' ');
  };
  const name = field('name');
  const description = field('description');
  return name === undefined || description === undefined ? undefined : { name, description };
}

function bundleNames() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

function readWorkingTree(bundle) {
  return fs.readFileSync(path.join(SKILLS_DIR, bundle, 'SKILL.md'), 'utf-8');
}

function readFromRef(ref, bundle) {
  try {
    return execFileSync('git', ['show', `${ref}:skills/${bundle}/SKILL.md`], {
      cwd: REPO,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined; // bundle did not exist at that ref
  }
}

/**
 * The contract check, pure over the rows it is handed.
 *
 * @param rows  `{ bundle, after, description, tier }` per bundle — `after` is
 *              name + description length.
 * @param triggers  bundle → pinned phrases; defaults to the shipped table.
 * @returns human-readable failure strings; empty means the listing conforms.
 */
export function evaluate(rows, triggers = REQUIRED_TRIGGERS) {
  const failures = [];
  for (const r of rows) {
    // An unclassified bundle is a failure, not a default — it is how a new
    // description sprawls unnoticed (Rule 7).
    if (!r.tier) {
      failures.push(`${r.bundle}: no tier in TIERS — classify it (A name-dispatched / B cold-phrasing / C gate / D callable-only)`);
      continue;
    }
    const ceiling = TIER_CEILING[r.tier];
    if (ceiling !== null && r.after > ceiling) {
      failures.push(`${r.bundle}: ${r.after} chars > tier ${r.tier} ceiling ${ceiling} (name + description)`);
    }

    const pinned = triggers[r.bundle];
    if (!pinned) {
      failures.push(`${r.bundle}: no REQUIRED_TRIGGERS entry — add one so routing stays pinned`);
      continue;
    }

    // Tier D buys its behaviour by NOT being matchable. A pinned phrase would
    // re-create the automatic routing the tier exists to remove (Rule 6).
    if (r.tier === 'D') {
      if (pinned.length > 0) {
        failures.push(`${r.bundle}: tier D declares no trigger phrases, found ${pinned.length}`);
      }
      continue;
    }

    const haystack = r.description.toLowerCase();
    for (const t of pinned) {
      if (!haystack.includes(t.toLowerCase())) failures.push(`${r.bundle}: lost trigger phrase "${t}"`);
    }
  }
  return failures;
}

/** Measure every bundle on disk into `evaluate()`-shaped rows. */
export function measureWorkingTree(dir = SKILLS_DIR) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort()
    .map((bundle) => {
      const parsed = parseNameAndDescription(fs.readFileSync(path.join(dir, bundle, 'SKILL.md'), 'utf-8'));
      if (!parsed) return { bundle, after: 0, description: '', tier: TIERS[bundle], unparseable: true };
      return {
        bundle,
        after: parsed.name.length + parsed.description.length,
        description: parsed.description,
        tier: TIERS[bundle],
      };
    });
}

// --- CLI -------------------------------------------------------------------
// Everything below runs only when this file is executed directly. Importing it
// (from the spec tests) yields the exported checks with no output and no exit code.
const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

function main(argv) {
const baseRef = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : 'HEAD';
// Every bundle is measured by default (Rule 7). `--cortex-only` restores the
// narrower pre-spec view.
const cortexOnly = argv.includes('--cortex-only');

const bundles = bundleNames().filter((b) => !cortexOnly || b.startsWith('cortex-'));

const rows = [];
let beforeTotal = 0;
let afterTotal = 0;

for (const bundle of bundles) {
  const now = parseNameAndDescription(readWorkingTree(bundle));
  if (!now) {
    console.error(`! ${bundle}: unparseable frontmatter`);
    process.exitCode = 1;
    continue;
  }
  const baseRaw = readFromRef(baseRef, bundle);
  const base = baseRaw ? parseNameAndDescription(baseRaw) : undefined;

  const after = now.name.length + now.description.length;
  const before = base ? base.name.length + base.description.length : 0;
  beforeTotal += before;
  afterTotal += after;
  rows.push({ bundle, before, after, description: now.description, tier: TIERS[bundle] });
}

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const width = Math.max(...rows.map((r) => r.bundle.length), 6);

console.log(`Skill listing cost — name + description chars (est. tokens at chars/${CHARS_PER_TOKEN})`);
console.log(`base ref: ${baseRef}\n`);
console.log(`${pad('skill', width)}  ${lpad('tier', 4)}  ${lpad('before', 8)} ${lpad('tok', 5)}  ${lpad('after', 7)} ${lpad('tok', 5)}  ${lpad('delta', 7)}`);
console.log('-'.repeat(width + 46));
for (const r of rows.sort((a, b) => b.before - a.before || a.bundle.localeCompare(b.bundle))) {
  const bt = Math.round(r.before / CHARS_PER_TOKEN);
  const at = Math.round(r.after / CHARS_PER_TOKEN);
  console.log(
    `${pad(r.bundle, width)}  ${lpad(r.tier ?? '?', 4)}  ${lpad(r.before || '—', 8)} ${lpad(r.before ? bt : '—', 5)}  ${lpad(r.after, 7)} ${lpad(at, 5)}  ${lpad(r.after - r.before, 7)}`,
  );
}
console.log('-'.repeat(width + 46));
console.log(
  `${pad('TOTAL', width)}  ${lpad('', 4)}  ${lpad(beforeTotal, 8)} ${lpad(Math.round(beforeTotal / CHARS_PER_TOKEN), 5)}  ` +
    `${lpad(afterTotal, 7)} ${lpad(Math.round(afterTotal / CHARS_PER_TOKEN), 5)}  ${lpad(afterTotal - beforeTotal, 7)}`,
);
console.log(
  `\nSaved ${beforeTotal - afterTotal} chars ≈ ${Math.round((beforeTotal - afterTotal) / CHARS_PER_TOKEN)} tokens per session, in every Cortex project.`,
);

// --- assertions ------------------------------------------------------------
const failures = evaluate(rows);

const byTier = rows.reduce((acc, r) => ((acc[r.tier ?? '?'] = (acc[r.tier ?? '?'] ?? 0) + 1), acc), {});
console.log(
  `\ntiers: ${Object.entries(byTier)
    .sort()
    .map(([t, n]) => `${t}=${n}`)
    .join('  ')}`,
);

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(`FAIL  ${f}`);
  process.exitCode = 1;
} else {
  console.log(`OK    all ${rows.length} entries within their tier ceiling and carrying their pinned phrases.`);
}
}

if (isMain) main(process.argv.slice(2));
