/**
 * The pulse review CLI — the human gate of propose-don't-mutate (spec
 * pulse.review-cli; schema §4.5). `pulse-list` shows pending suggestions,
 * `pulse-accept <S-NNN>` applies one verbatim, `pulse-reject <S-NNN>` records a
 * windowed dismissal. Discovery spans ALL `.cortex/pulse/*.md` reports (§4.5
 * single S-namespace; Rule 2) — a duplicate id across files is a hard error
 * (Rule 4b). Accept targets must lie inside `.cortex/cerebrum/` or be a NEW
 * `.claude/skills/<name>/SKILL.md` (Rule 4). Deterministic Core (R-001):
 * fs/path only — no LLM, no network, no subprocess.
 */
import * as fs from 'fs';
import * as path from 'path';
import { pulseDismissedTemplate } from '../cli/templates.js';
import { openingFence, closesFence, headingLinesOutsideFences } from './fences.js';

const DEFAULT_DISMISSED_WINDOW_DAYS = 90;

/** Cerebrum core files (schema §1) created on accept if absent; every other
 *  target MUST already exist (Rule 4). */
const CEREBRUM_CORE_FILES = new Set([
  'preferences.md',
  'environment.md',
  'do-not-repeat.md',
  'decisions.md',
  'standing-authorities.md',
]);

type Status = 'pending' | 'accepted' | 'rejected';

interface Suggestion {
  id: string;
  title: string;
  /** `**Source:**` provenance line (§4.5 mandatory field; shown by pulse-list). */
  source: string | null;
  target: string | null;
  /** Verbatim fenced-block content (no fences, no trailing newline). */
  block: string | null;
  status: Status;
  headingLine: number;
  /** Exclusive end (index of the next `## ` heading, or lines.length). */
  endLine: number;
  targetLine: number | null;
  statusLine: number | null;
}

const HEADING_RE = /^##\s+(S-\d{3,})\s*:?\s*(.*)$/;
const SOURCE_RE = /^\*\*Source:\*\*\s*(.*)$/;
const TARGET_RE = /^\*\*Target:\*\*\s*(.*)$/;
const STATUS_RE = /^\*\*Status:\*\*\s*(.*)$/;
const PROPOSED_RE = /^\*\*Proposed addition:\*\*/;

/**
 * Split `## S-NNN` section content out of a markdown file's lines.
 * Fence grammar (§4.5, B-003): the proposed block honours its opening fence's
 * length — it closes only on a fence of the same character and at least that
 * length — so payloads containing shorter fences round-trip byte-exact.
 * Exported for the parser/writer round-trip tests.
 */
export function parseSuggestions(lines: string[]): Suggestion[] {
  // Heading scan is fence-aware: a `## S-NNN`-looking line INSIDE a fenced
  // payload is payload, never a section boundary.
  const headings = headingLinesOutsideFences(lines, HEADING_RE);

  const suggestions: Suggestion[] = [];
  for (let h = 0; h < headings.length; h++) {
    const headingLine = headings[h] as number;
    const endLine = h + 1 < headings.length ? (headings[h + 1] as number) : lines.length;
    const headingText = lines[headingLine] as string;
    const match = headingText.match(HEADING_RE);
    if (!match) continue;
    const id = match[1] as string;
    const title = (match[2] ?? '').trim();

    let source: string | null = null;
    let target: string | null = null;
    let targetLine: number | null = null;
    let status: Status = 'pending';
    let statusLine: number | null = null;
    let block: string | null = null;

    for (let i = headingLine + 1; i < endLine; i++) {
      const line = lines[i];
      if (line === undefined) continue;

      const srcMatch = line.match(SOURCE_RE);
      if (srcMatch && source === null) {
        source = (srcMatch[1] ?? '').trim();
        continue;
      }

      const tMatch = line.match(TARGET_RE);
      if (tMatch && target === null) {
        target = (tMatch[1] ?? '').trim();
        targetLine = i;
        continue;
      }

      const sMatch = line.match(STATUS_RE);
      if (sMatch && statusLine === null) {
        const value = (sMatch[1] ?? '').trim().toLowerCase();
        if (value === 'accepted' || value === 'rejected' || value === 'pending') status = value;
        statusLine = i;
        continue;
      }

      if (PROPOSED_RE.test(line) && block === null) {
        // Scan forward (within the section) for the opening fence.
        let openIdx = -1;
        let open: ReturnType<typeof openingFence> = null;
        for (let j = i; j < endLine; j++) {
          const cand = lines[j];
          if (cand === undefined) continue;
          open = openingFence(cand);
          if (open !== null) {
            openIdx = j;
            break;
          }
        }
        if (openIdx >= 0 && open !== null) {
          // §4.5 fence grammar (B-003): close ONLY on a fence of the same
          // character and at least the opening length — shorter inner fences
          // are payload, extracted byte-exact.
          const body: string[] = [];
          let closeIdx = -1;
          for (let j = openIdx + 1; j < endLine; j++) {
            const cand = lines[j];
            if (cand !== undefined && closesFence(cand, open)) {
              closeIdx = j;
              break;
            }
            body.push(cand ?? '');
          }
          if (closeIdx >= 0) {
            block = body.join('\n');
            // Skip past the payload so its lines are never mistaken for
            // section field lines (Target/Status inside a payload is payload).
            i = closeIdx;
          }
        }
      }
    }

    suggestions.push({ id, title, source, target, block, status, headingLine, endLine, targetLine, statusLine });
  }
  return suggestions;
}

/** A suggestion plus the pulse report file it was discovered in (Rule 2). */
interface SourcedSuggestion extends Suggestion {
  /** Absolute path of the report file holding the section. */
  file: string;
  /** Project-relative path, for messages. */
  rel: string;
}

/**
 * Rule 2 — discover proposal sections across ALL `.cortex/pulse/*.md` reports
 * (single S-namespace). `dismissed.md` is rejection memory, not a report: its
 * `## S-NNN` sections are never proposals, so it is excluded.
 */
function discoverSuggestions(root: string): SourcedSuggestion[] {
  const pulseDir = path.join(root, '.cortex', 'pulse');
  let names: string[];
  try {
    names = fs.readdirSync(pulseDir).filter((n) => n.endsWith('.md') && n !== 'dismissed.md');
  } catch {
    return [];
  }
  names.sort();
  const discovered: SourcedSuggestion[] = [];
  for (const name of names) {
    const file = path.join(pulseDir, name);
    const lines = readLines(file);
    if (lines === null) continue;
    for (const s of parseSuggestions(lines)) {
      discovered.push({ ...s, file, rel: path.join('.cortex', 'pulse', name) });
    }
  }
  return discovered;
}

/**
 * Rule 4b — the same `S-NNN` in two pulse files is a hard error. Returns the
 * distinct files carrying `id`, when more than one.
 */
function duplicateFiles(suggestions: SourcedSuggestion[], id: string): string[] {
  const files = [...new Set(suggestions.filter((s) => s.id === id).map((s) => s.rel))];
  return files.length > 1 ? files : [];
}

interface Dismissal {
  id: string;
  expires: number | null;
}

function parseDismissals(lines: string[]): Map<string, Dismissal> {
  const map = new Map<string, Dismissal>();
  const headings = headingLinesOutsideFences(lines, HEADING_RE);
  for (let h = 0; h < headings.length; h++) {
    const headingLine = headings[h] as number;
    const endLine = h + 1 < headings.length ? (headings[h + 1] as number) : lines.length;
    const match = (lines[headingLine] as string).match(HEADING_RE);
    if (!match) continue;
    const id = match[1] as string;
    let expires: number | null = null;
    for (let i = headingLine + 1; i < endLine; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      const eMatch = line.match(/^\*\*Expires:\*\*\s*(.*)$/);
      if (eMatch) {
        const parsed = Date.parse((eMatch[1] ?? '').trim());
        if (!Number.isNaN(parsed)) expires = parsed;
      }
    }
    map.set(id, { id, expires });
  }
  return map;
}

function readLines(filePath: string): string[] | null {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8').split('\n');
}

function readDismissedWindowDays(root: string): number {
  const configPath = path.join(root, '.cortex', 'cortex.config.json');
  if (!fs.existsSync(configPath)) return DEFAULT_DISMISSED_WINDOW_DAYS;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      pulse?: { dismissedWindowDays?: unknown };
    };
    const value = config.pulse?.dismissedWindowDays;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  } catch {
    // Fall through to the default — a malformed config never blocks the gate.
  }
  return DEFAULT_DISMISSED_WINDOW_DAYS;
}

/** True iff `target` (project-relative) resolves strictly inside `.cortex/cerebrum/`. */
function isInsideCerebrum(root: string, target: string): boolean {
  if (path.isAbsolute(target)) return false;
  const cerebrumRoot = path.resolve(root, '.cortex', 'cerebrum');
  const resolved = path.resolve(root, target);
  const rel = path.relative(cerebrumRoot, resolved);
  if (rel === '') return false; // the directory itself is not a writable target
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Rule 4 (skills root) — when `target` (project-relative) is exactly
 * `.claude/skills/<name>/SKILL.md`, return the skill name; else null.
 */
function skillTargetName(root: string, target: string): string | null {
  if (path.isAbsolute(target)) return null;
  const skillsRoot = path.resolve(root, '.claude', 'skills');
  const resolved = path.resolve(root, target);
  const rel = path.relative(skillsRoot, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  if (parts.length !== 2 || parts[1] !== 'SKILL.md' || !parts[0]) return null;
  return parts[0] as string;
}

/** Insert or replace `**Status:** <status>` in the addressed section only. */
function annotateStatus(lines: string[], suggestion: Suggestion, status: Status): string[] {
  const next = lines.slice();
  const statusLineText = `**Status:** ${status}`;
  if (suggestion.statusLine !== null) {
    next[suggestion.statusLine] = statusLineText;
    return next;
  }
  // No status line yet: insert it after the Target line, else after the heading.
  const insertAfter = suggestion.targetLine !== null ? suggestion.targetLine : suggestion.headingLine;
  next.splice(insertAfter + 1, 0, statusLineText);
  return next;
}

/** Append `block` to `existing`, separated by exactly one blank line (Rule 3). */
function appendBlock(existing: string, block: string): string {
  if (existing.trim() === '') return block;
  return existing.replace(/\n+$/, '') + '\n\n' + block;
}

function printSuggestion(s: Suggestion): void {
  console.log(`${s.id}: ${s.title}`);
  if (s.source !== null) console.log(`  Source: ${s.source}`);
  console.log(`  Target: ${s.target}`);
  console.log('  Proposed addition:');
  for (const line of (s.block ?? '').split('\n')) console.log(`    ${line}`);
  console.log('');
}

export async function pulseCli(command: string, argv: string[], root = '.'): Promise<number> {
  const dismissedPath = path.join(root, '.cortex', 'pulse', 'dismissed.md');
  const suggestions = discoverSuggestions(root);

  if (command === 'pulse-list') {
    // Rule 4b: a duplicate id across files is a hard error at review time.
    const seen = new Set<string>();
    for (const s of suggestions) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const dupes = duplicateFiles(suggestions, s.id);
      if (dupes.length > 0) {
        console.error(`Duplicate suggestion id ${s.id} across pulse files: ${dupes.join(' and ')}. Nothing done.`);
        return 1;
      }
    }
    const dismissals = parseDismissals(readLines(dismissedPath) ?? []);
    const now = Date.now();

    let printed = 0;
    for (const s of suggestions) {
      if (s.target === null || s.block === null) {
        console.error(`Skipping malformed suggestion ${s.id}: missing Target or proposed block.`);
        continue;
      }
      if (s.status === 'accepted' || s.status === 'rejected') continue;
      const dismissal = dismissals.get(s.id);
      if (dismissal && dismissal.expires !== null && dismissal.expires > now) continue;
      printSuggestion(s);
      printed++;
    }
    if (printed === 0) console.log('Nothing pending.');
    return 0;
  }

  if (command !== 'pulse-accept' && command !== 'pulse-reject') {
    console.error(`Unknown command: ${command}`);
    return 1;
  }

  const id = argv[0];
  if (!id) {
    console.error(`${command} requires a suggestion id (e.g. S-001).`);
    return 1;
  }

  // Rule 4b: the addressed id in two pulse files → exit 1 naming both, no action.
  const dupes = duplicateFiles(suggestions, id);
  if (dupes.length > 0) {
    console.error(`Duplicate suggestion id ${id} across pulse files: ${dupes.join(' and ')}. Nothing done.`);
    return 1;
  }
  const suggestion = suggestions.find((s) => s.id === id);
  if (!suggestion) {
    console.error(`Unknown suggestion ${id}.`);
    return 1;
  }
  // Status annotation lands in the report file the section was discovered in.
  const sourceLines = readLines(suggestion.file) as string[];

  if (command === 'pulse-accept') {
    // Idempotence / reversal (Rule 6).
    if (suggestion.status === 'accepted') {
      console.log(`${id} already accepted; nothing to do.`);
      return 0;
    }
    if (suggestion.status === 'rejected') {
      console.error(`${id} was rejected; a decision reversal is a manual edit, not a CLI action.`);
      return 1;
    }
    // Malformed addressed entry (Rule 7): cannot apply without a target and block.
    if (suggestion.target === null || suggestion.block === null) {
      console.error(`Suggestion ${id} is malformed (missing Target or proposed block); cannot accept.`);
      return 1;
    }
    // Target roots (Rule 4): inside .cortex/cerebrum/ or a NEW .claude/skills/<name>/SKILL.md.
    const skillName = skillTargetName(root, suggestion.target);
    if (!isInsideCerebrum(root, suggestion.target) && skillName === null) {
      console.error(
        `Refusing target outside .cortex/cerebrum/ (or a new .claude/skills/<name>/SKILL.md): ${suggestion.target}`,
      );
      return 1;
    }
    const targetAbs = path.resolve(root, suggestion.target);
    if (skillName !== null) {
      // Rule 4: accept never overwrites a skill — an existing target is refused.
      if (fs.existsSync(targetAbs)) {
        console.error(`Refusing existing skill file (accept never overwrites a skill): ${suggestion.target}`);
        return 1;
      }
    } else {
      const cerebrumRoot = path.resolve(root, '.cortex', 'cerebrum');
      const relFromCerebrum = path.relative(cerebrumRoot, targetAbs);
      const isCore = CEREBRUM_CORE_FILES.has(relFromCerebrum);
      if (!fs.existsSync(targetAbs) && !isCore) {
        console.error(`Target file does not exist: ${suggestion.target}`);
        return 1;
      }
    }

    // Compute everything before touching disk (Rule 7: never half-applied).
    const existing = fs.existsSync(targetAbs) ? fs.readFileSync(targetAbs, 'utf-8') : '';
    const nextTarget = appendBlock(existing, suggestion.block);
    const nextSource = annotateStatus(sourceLines, suggestion, 'accepted').join('\n');

    fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
    fs.writeFileSync(targetAbs, nextTarget, 'utf-8');
    fs.writeFileSync(suggestion.file, nextSource, 'utf-8');
    console.log(
      skillName !== null
        ? `Accepted ${id}: created ${suggestion.target}.`
        : `Accepted ${id}: appended to ${suggestion.target}.`,
    );
    return 0;
  }

  // pulse-reject
  if (suggestion.status === 'rejected') {
    console.log(`${id} already rejected; nothing to do.`);
    return 0;
  }
  if (suggestion.status === 'accepted') {
    console.error(`${id} was accepted; a decision reversal is a manual edit, not a CLI action.`);
    return 1;
  }
  // Malformed addressed entry (Rules 1 & 7): reported, never half-applied.
  if (suggestion.target === null || suggestion.block === null) {
    console.error(`Suggestion ${id} is malformed (missing Target or proposed block); cannot reject.`);
    return 1;
  }

  const windowDays = readDismissedWindowDays(root);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresIso = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000).toISOString();

  const nextSource = annotateStatus(sourceLines, suggestion, 'rejected').join('\n');

  // Build the dismissed.md content (create with its §4.5 header if absent).
  // The section records the suggestion title — the rejection memory text the
  // proposing loops match candidate patterns against (pulse.distil Rule 3c).
  const existingDismissed = fs.existsSync(dismissedPath)
    ? fs.readFileSync(dismissedPath, 'utf-8')
    : pulseDismissedTemplate(nowIso);
  const heading = suggestion.title !== '' ? `## ${id}: ${suggestion.title}` : `## ${id}`;
  const section = `${heading}\n\n**Dismissed:** ${nowIso}\n**Expires:** ${expiresIso}\n`;
  const nextDismissed = existingDismissed.replace(/\n+$/, '') + '\n\n' + section;

  fs.mkdirSync(path.dirname(dismissedPath), { recursive: true });
  fs.writeFileSync(suggestion.file, nextSource, 'utf-8');
  fs.writeFileSync(dismissedPath, nextDismissed, 'utf-8');
  console.log(`Rejected ${id}: dismissed until ${expiresIso}.`);
  return 0;
}
