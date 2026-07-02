/**
 * The pulse review CLI — the human gate of propose-don't-mutate (spec
 * pulse.review-cli; schema §4.5). `pulse-list` shows pending suggestions,
 * `pulse-accept <S-NNN>` applies one verbatim, `pulse-reject <S-NNN>` records a
 * windowed dismissal. Deterministic Core (R-001): fs/path only — no LLM, no
 * network, no subprocess.
 */
import * as fs from 'fs';
import * as path from 'path';
import { pulseDismissedTemplate } from '../cli/templates.js';

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
const TARGET_RE = /^\*\*Target:\*\*\s*(.*)$/;
const STATUS_RE = /^\*\*Status:\*\*\s*(.*)$/;
const PROPOSED_RE = /^\*\*Proposed addition:\*\*/;
const FENCE_RE = /^\s*(```|~~~)/;

/** Split `## S-NNN` section content out of a markdown file's lines. */
function parseSuggestions(lines: string[]): Suggestion[] {
  const headings: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && HEADING_RE.test(line)) headings.push(i);
  }

  const suggestions: Suggestion[] = [];
  for (let h = 0; h < headings.length; h++) {
    const headingLine = headings[h] as number;
    const endLine = h + 1 < headings.length ? (headings[h + 1] as number) : lines.length;
    const headingText = lines[headingLine] as string;
    const match = headingText.match(HEADING_RE);
    if (!match) continue;
    const id = match[1] as string;
    const title = (match[2] ?? '').trim();

    let target: string | null = null;
    let targetLine: number | null = null;
    let status: Status = 'pending';
    let statusLine: number | null = null;
    let block: string | null = null;

    for (let i = headingLine + 1; i < endLine; i++) {
      const line = lines[i];
      if (line === undefined) continue;

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
        for (let j = i; j < endLine; j++) {
          const cand = lines[j];
          if (cand !== undefined && FENCE_RE.test(cand)) {
            openIdx = j;
            break;
          }
        }
        if (openIdx >= 0) {
          const body: string[] = [];
          let closed = false;
          for (let j = openIdx + 1; j < endLine; j++) {
            const cand = lines[j];
            if (cand !== undefined && FENCE_RE.test(cand)) {
              closed = true;
              break;
            }
            body.push(cand ?? '');
          }
          if (closed) block = body.join('\n');
        }
      }
    }

    suggestions.push({ id, title, target, block, status, headingLine, endLine, targetLine, statusLine });
  }
  return suggestions;
}

interface Dismissal {
  id: string;
  expires: number | null;
}

function parseDismissals(lines: string[]): Map<string, Dismissal> {
  const map = new Map<string, Dismissal>();
  const headings: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && HEADING_RE.test(line)) headings.push(i);
  }
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
  console.log(`  Target: ${s.target}`);
  console.log('  Proposed addition:');
  for (const line of (s.block ?? '').split('\n')) console.log(`    ${line}`);
  console.log('');
}

export async function pulseCli(command: string, argv: string[], root = '.'): Promise<number> {
  const suggestionsPath = path.join(root, '.cortex', 'pulse', 'suggestions.md');
  const dismissedPath = path.join(root, '.cortex', 'pulse', 'dismissed.md');

  if (command === 'pulse-list') {
    const lines = readLines(suggestionsPath);
    if (lines === null) {
      console.log('Nothing pending.');
      return 0;
    }
    const suggestions = parseSuggestions(lines);
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

  const lines = readLines(suggestionsPath);
  if (lines === null) {
    console.error(`Unknown suggestion ${id} (no suggestions file).`);
    return 1;
  }
  const suggestions = parseSuggestions(lines);
  const suggestion = suggestions.find((s) => s.id === id);
  if (!suggestion) {
    console.error(`Unknown suggestion ${id}.`);
    return 1;
  }

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
    // Cerebrum-only target (Rule 4).
    if (!isInsideCerebrum(root, suggestion.target)) {
      console.error(`Refusing target outside .cortex/cerebrum/: ${suggestion.target}`);
      return 1;
    }
    const targetAbs = path.resolve(root, suggestion.target);
    const cerebrumRoot = path.resolve(root, '.cortex', 'cerebrum');
    const relFromCerebrum = path.relative(cerebrumRoot, targetAbs);
    const isCore = CEREBRUM_CORE_FILES.has(relFromCerebrum);
    if (!fs.existsSync(targetAbs) && !isCore) {
      console.error(`Target file does not exist: ${suggestion.target}`);
      return 1;
    }

    // Compute everything before touching disk (Rule 7: never half-applied).
    const existing = fs.existsSync(targetAbs) ? fs.readFileSync(targetAbs, 'utf-8') : '';
    const nextTarget = appendBlock(existing, suggestion.block);
    const nextSuggestions = annotateStatus(lines, suggestion, 'accepted').join('\n');

    fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
    fs.writeFileSync(targetAbs, nextTarget, 'utf-8');
    fs.writeFileSync(suggestionsPath, nextSuggestions, 'utf-8');
    console.log(`Accepted ${id}: appended to ${suggestion.target}.`);
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

  const nextSuggestions = annotateStatus(lines, suggestion, 'rejected').join('\n');

  // Build the dismissed.md content (create with its §4.5 header if absent).
  const existingDismissed = fs.existsSync(dismissedPath)
    ? fs.readFileSync(dismissedPath, 'utf-8')
    : pulseDismissedTemplate(nowIso);
  const section = `## ${id}\n\n**Dismissed:** ${nowIso}\n**Expires:** ${expiresIso}\n`;
  const nextDismissed = existingDismissed.replace(/\n+$/, '') + '\n\n' + section;

  fs.mkdirSync(path.dirname(dismissedPath), { recursive: true });
  fs.writeFileSync(suggestionsPath, nextSuggestions, 'utf-8');
  fs.writeFileSync(dismissedPath, nextDismissed, 'utf-8');
  console.log(`Rejected ${id}: dismissed until ${expiresIso}.`);
  return 0;
}
