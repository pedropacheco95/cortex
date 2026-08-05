#!/usr/bin/env node
/**
 * Measure the context cost of the shipped skill listing.
 *
 * Claude Code budgets the whole skill listing at ~1% of the context window
 * (~2k tokens at 200k) and resident cost is `name` + `description` — the
 * SKILL.md body is lazy-loaded and free until the skill is invoked. This script
 * is the guard that keeps the cortex-* bundles inside that budget: it parses
 * both fields out of each bundle's frontmatter, sums the characters, compares
 * against the same measurement taken from a git ref (default HEAD), and asserts
 * that every rewritten description still carries its routing trigger phrases.
 *
 *   node scripts/measure-skill-descriptions.mjs            # vs HEAD
 *   node scripts/measure-skill-descriptions.mjs --base <ref>
 *   node scripts/measure-skill-descriptions.mjs --all      # include specflow-*
 *
 * Exits non-zero if a cortex-* entry exceeds MAX_CHARS or loses a trigger
 * phrase.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = path.join(REPO, 'skills');

/** Per-entry ceiling on `name` + `description`, in characters. */
const MAX_CHARS = 120;
/** Rough token estimate used by the listing budget conversation: chars / 4. */
const CHARS_PER_TOKEN = 4;

/**
 * Routing phrases each description MUST keep (task constraint 2: a human typing
 * the natural phrasing still reaches the skill). Checked case-insensitively as
 * substrings.
 */
const REQUIRED_TRIGGERS = {
  // The three human-invoked-only bundles (no scheduled bundle names them in its
  // prompt body) carry broader surface, because the description is their ONLY
  // routing signal.
  'cortex-archive-ingest': ['transcript', 'rfp', 'brief', 'contract', 'add this to project memory'],
  'cortex-extract-insight': ['extract insight', 'refresh', 'map this codebase'],
  'cortex-ingest': ['ingest this transcript', 'rfp', 'brief', 'add this to project memory'],
  'cortex-loop-atlas-staleness': ['run the atlas loop', 'is the atlas stale'],
  'cortex-loop-bug-triage': ['run the bug-triage loop', 'triage the open bugs'],
  'cortex-loop-insight-refresh-daily': ['run the daily insight refresh', 'refresh the insight layer'],
  'cortex-loop-insight-refresh-full': ['run the full insight refresh', 'rebuild l4'],
  'cortex-loop-onboarding-drift': ['run the onboarding-drift loop', 'is the scaffolding current'],
  'cortex-loop-rule-decay': ['run the rule-decay loop', 'which rules are stale'],
  'cortex-loop-session-observe': ['run the session-observe loop', 'what did we learn'],
  'cortex-loop-spec-drift': ['run the spec-drift loop', 'have the specs drifted'],
  'cortex-loop-test-runner': ['run the test-runner loop', 'triage the failing tests'],
  'cortex-pulse-distil': ['run the distil loop', 'what do i keep repeating'],
  'cortex-pulse-hygiene': ['run the hygiene loop', 'project health check'],
  'cortex-register-tasks': ['register', 'activate', 'cortex scheduled tasks', 'claude desktop'],
};

/**
 * Minimal frontmatter reader for the two fields that cost context. Handles both
 * shapes a SKILL.md uses: a `>-` / `|` block scalar (folded to one line, the way
 * Claude Code presents it) and a plain or quoted single-line scalar.
 */
function parseNameAndDescription(raw) {
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

const argv = process.argv.slice(2);
const baseRef = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : 'HEAD';
const includeAll = argv.includes('--all');

const bundles = bundleNames().filter((b) => includeAll || b.startsWith('cortex-'));

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
  rows.push({ bundle, before, after, description: now.description });
}

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const width = Math.max(...rows.map((r) => r.bundle.length), 6);

console.log(`Skill listing cost — name + description chars (est. tokens at chars/${CHARS_PER_TOKEN})`);
console.log(`base ref: ${baseRef}\n`);
console.log(`${pad('skill', width)}  ${lpad('before', 8)} ${lpad('tok', 5)}  ${lpad('after', 7)} ${lpad('tok', 5)}  ${lpad('delta', 7)}`);
console.log('-'.repeat(width + 40));
for (const r of rows.sort((a, b) => b.before - a.before || a.bundle.localeCompare(b.bundle))) {
  const bt = Math.round(r.before / CHARS_PER_TOKEN);
  const at = Math.round(r.after / CHARS_PER_TOKEN);
  console.log(
    `${pad(r.bundle, width)}  ${lpad(r.before || '—', 8)} ${lpad(r.before ? bt : '—', 5)}  ${lpad(r.after, 7)} ${lpad(at, 5)}  ${lpad(r.after - r.before, 7)}`,
  );
}
console.log('-'.repeat(width + 40));
console.log(
  `${pad('TOTAL', width)}  ${lpad(beforeTotal, 8)} ${lpad(Math.round(beforeTotal / CHARS_PER_TOKEN), 5)}  ` +
    `${lpad(afterTotal, 7)} ${lpad(Math.round(afterTotal / CHARS_PER_TOKEN), 5)}  ${lpad(afterTotal - beforeTotal, 7)}`,
);
console.log(
  `\nSaved ${beforeTotal - afterTotal} chars ≈ ${Math.round((beforeTotal - afterTotal) / CHARS_PER_TOKEN)} tokens per session, in every Cortex project.`,
);

// --- assertions ------------------------------------------------------------
const failures = [];
for (const r of rows) {
  if (r.after > MAX_CHARS) failures.push(`${r.bundle}: ${r.after} chars > ${MAX_CHARS} (name + description)`);
  const triggers = REQUIRED_TRIGGERS[r.bundle];
  if (!triggers) {
    failures.push(`${r.bundle}: no REQUIRED_TRIGGERS entry — add one so routing stays pinned`);
    continue;
  }
  const haystack = r.description.toLowerCase();
  for (const t of triggers) {
    if (!haystack.includes(t.toLowerCase())) failures.push(`${r.bundle}: lost trigger phrase "${t}"`);
  }
}

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.log(`FAIL  ${f}`);
  process.exitCode = 1;
} else {
  console.log(`OK    all ${rows.length} entries ≤ ${MAX_CHARS} chars and carry their trigger phrases.`);
}
