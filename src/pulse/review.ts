/**
 * The pulse review CLI — the human gate of propose-don't-mutate (spec
 * pulse.review-cli; schema §4.5). `pulse-list` shows pending suggestions,
 * `pulse-accept <S-NNN>` applies one verbatim, `pulse-reject <S-NNN>` records a
 * windowed dismissal. Discovery spans every report under
 * `.cortex/pulse/reports/` plus `suggestions.md` at the pulse root (§4.5 single
 * S-namespace; Rule 2) — a duplicate id across files is a hard error
 * (Rule 4b). Accept targets must lie inside `.cortex/compass/` or be a NEW
 * `.claude/skills/<name>/SKILL.md` (Rule 4). Deterministic Core (R-001):
 * fs/path only — no LLM, no network, no subprocess.
 */
import * as fs from 'fs';
import * as path from 'path';
import { pulseDismissedTemplate } from '../cli/templates.js';
import { openingFence, closesFence, headingLinesOutsideFences, type FenceOpen } from './fences.js';
import {
  DEFAULT_SUGGESTION_TYPE,
  isSuggestionType,
  permittedRoots,
  permittedRootsLabel,
  type SuggestionType,
} from './types.js';
import { planPromotion } from './promote.js';
import { ensureEvidenceDir } from '../atlas/evidence.js';
import { findRegistered, registerId } from '../compass/registry.js';

/** A project-relative target that is a compass rule file (pulse.review-cli Rule 7b). */
const NEW_RULE_FILE_RE = /^\.cortex\/compass\/rules\/(R-\d{3,})-([a-z0-9-]+)\.md$/;

const DEFAULT_DISMISSED_WINDOW_DAYS = 90;

/** Compass core files (schema §1) created on accept if absent; every other
 *  target MUST already exist (Rule 4). */
const COMPASS_CORE_FILES = new Set([
  'preferences.md',
  'environment.md',
  'do-not-repeat.md',
  'standing-authorities.md',
]);

type Status = 'pending' | 'accepted' | 'rejected';

/** The payload operation shape parsed from a section (§4.5.2). */
type PayloadKind = 'addition' | 'file' | 'edit';

interface Suggestion {
  id: string;
  title: string;
  /** `**Type:**` value (§4.5.1); absent → rule-candidate (v1-era tolerance). */
  type: SuggestionType;
  /** `**Source:**` provenance line (§4.5 mandatory field; shown by pulse-list). */
  source: string | null;
  target: string | null;
  /** Which of the three payload shapes the section carries (null → malformed). */
  payloadKind: PayloadKind | null;
  /** Verbatim fenced-block content for addition/file (no fences, no trailing newline). */
  block: string | null;
  /** Edit payload — the `current:` block to match byte-exact (§4.5.2). */
  current: string | null;
  /** Edit payload — the `replacement:` block. */
  replacement: string | null;
  status: Status;
  headingLine: number;
  /** Exclusive end (index of the next `## ` heading, or lines.length). */
  endLine: number;
  targetLine: number | null;
  statusLine: number | null;
}

const HEADING_RE = /^##\s+(S-\d{3,})\s*:?\s*(.*)$/;
const TYPE_RE = /^\*\*Type:\*\*\s*(.*)$/;
const SOURCE_RE = /^\*\*Source:\*\*\s*(.*)$/;
const TARGET_RE = /^\*\*Target:\*\*\s*(.*)$/;
const STATUS_RE = /^\*\*Status:\*\*\s*(.*)$/;
const PROPOSED_ADDITION_RE = /^\*\*Proposed addition:\*\*/;
const PROPOSED_FILE_RE = /^\*\*Proposed file:\*\*/;
const PROPOSED_EDIT_RE = /^\*\*Proposed edit:\*\*/;
const CURRENT_LABEL_RE = /^\s*current:\s*$/;
const REPLACEMENT_LABEL_RE = /^\s*replacement:\s*$/;

/**
 * Extract the first fenced block at/after `fromIdx` within `[fromIdx, endLine)`,
 * honouring the §4.5 longer-fence grammar (B-003): the block closes only on a
 * fence of the same character and at least the opening length, so shorter inner
 * fences round-trip byte-exact. Returns the body (no fences) and the closing
 * line index, or null when no complete block is present.
 */
function extractFencedBlock(
  lines: string[],
  fromIdx: number,
  endLine: number,
): { block: string; closeIdx: number } | null {
  let openIdx = -1;
  let open: FenceOpen | null = null;
  for (let j = fromIdx; j < endLine; j++) {
    const cand = lines[j];
    if (cand === undefined) continue;
    open = openingFence(cand);
    if (open !== null) {
      openIdx = j;
      break;
    }
  }
  if (openIdx < 0 || open === null) return null;
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
  if (closeIdx < 0) return null;
  return { block: body.join('\n'), closeIdx };
}

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

    let type: SuggestionType = DEFAULT_SUGGESTION_TYPE;
    let typeSeen = false;
    let source: string | null = null;
    let target: string | null = null;
    let targetLine: number | null = null;
    let status: Status = 'pending';
    let statusLine: number | null = null;
    let payloadKind: PayloadKind | null = null;
    let block: string | null = null;
    let current: string | null = null;
    let replacement: string | null = null;
    let payloadCount = 0;

    for (let i = headingLine + 1; i < endLine; i++) {
      const line = lines[i];
      if (line === undefined) continue;

      const typeMatch = line.match(TYPE_RE);
      if (typeMatch && !typeSeen) {
        typeSeen = true;
        const value = (typeMatch[1] ?? '').trim();
        // Unknown value stays the tolerant default (validator errors on it, §4.5.1).
        if (isSuggestionType(value)) type = value;
        continue;
      }

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

      // Payload shapes (§4.5.2): exactly one per section. A second marker outside
      // the first payload's fence makes the section ambiguous → malformed.
      const isAddition = PROPOSED_ADDITION_RE.test(line);
      const isFile = PROPOSED_FILE_RE.test(line);
      const isEdit = PROPOSED_EDIT_RE.test(line);
      if (isAddition || isFile || isEdit) {
        payloadCount++;
        if (payloadKind === null) {
          if (isEdit) {
            // Edit payload: a `current:` fenced block then a `replacement:` one.
            let ci = -1;
            for (let j = i + 1; j < endLine; j++) {
              if (CURRENT_LABEL_RE.test(lines[j] ?? '')) {
                ci = j;
                break;
              }
            }
            if (ci >= 0) {
              const cur = extractFencedBlock(lines, ci + 1, endLine);
              if (cur !== null) {
                let ri = -1;
                for (let j = cur.closeIdx + 1; j < endLine; j++) {
                  if (REPLACEMENT_LABEL_RE.test(lines[j] ?? '')) {
                    ri = j;
                    break;
                  }
                }
                if (ri >= 0) {
                  const rep = extractFencedBlock(lines, ri + 1, endLine);
                  if (rep !== null) {
                    current = cur.block;
                    replacement = rep.block;
                    payloadKind = 'edit';
                    i = rep.closeIdx; // skip past both blocks
                  }
                }
              }
            }
          } else {
            const extracted = extractFencedBlock(lines, i, endLine);
            if (extracted !== null) {
              block = extracted.block;
              payloadKind = isAddition ? 'addition' : 'file';
              i = extracted.closeIdx; // skip past the payload
            }
          }
        }
        continue;
      }
    }

    // >1 payload shape is malformed (§4.5.2 "exactly one"): drop to null.
    if (payloadCount > 1) {
      payloadKind = null;
      block = null;
      current = null;
      replacement = null;
    }

    suggestions.push({
      id,
      title,
      type,
      source,
      target,
      payloadKind,
      block,
      current,
      replacement,
      status,
      headingLine,
      endLine,
      targetLine,
      statusLine,
    });
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
 * Rule 2 — discover proposal sections across the single S-namespace: every loop
 * report under `.cortex/pulse/reports/` PLUS `suggestions.md`, which stays at
 * the pulse root (distil's user-facing output — the primary proposal source).
 * `dismissed.md` is rejection memory, not a report, so it is excluded from the
 * reports/ scan; `_index.md` and other pulse-root files are never scanned.
 */
function discoverSuggestions(root: string): SourcedSuggestion[] {
  const pulseDir = path.join(root, '.cortex', 'pulse');
  const reportsDir = path.join(pulseDir, 'reports');
  const discovered: SourcedSuggestion[] = [];

  const scanDir = (dir: string, relBase: string): void => {
    let names: string[];
    try {
      names = fs.readdirSync(dir).filter((n) => n.endsWith('.md') && n !== 'dismissed.md');
    } catch {
      return;
    }
    names.sort();
    for (const name of names) {
      const file = path.join(dir, name);
      const lines = readLines(file);
      if (lines === null) continue;
      for (const s of parseSuggestions(lines)) {
        discovered.push({ ...s, file, rel: path.join(relBase, name) });
      }
    }
  };

  scanDir(reportsDir, path.join('.cortex', 'pulse', 'reports'));

  // suggestions.md stays at the pulse root but is a first-class proposal source.
  const suggestionsFile = path.join(pulseDir, 'suggestions.md');
  const suggestionsLines = readLines(suggestionsFile);
  if (suggestionsLines !== null) {
    for (const s of parseSuggestions(suggestionsLines)) {
      discovered.push({ ...s, file: suggestionsFile, rel: path.join('.cortex', 'pulse', 'suggestions.md') });
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

/** True iff `resolved` sits strictly inside directory `baseAbs` (no `..` escape). */
function isInsideDir(baseAbs: string, resolved: string): boolean {
  const rel = path.relative(baseAbs, resolved);
  if (rel === '') return false; // the directory itself is not a writable target
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Runtime target guard (Rule 2/§4.5.1): resolve `target` and require it to land
 * inside one of the permitted roots FOR ITS TYPE — the fs-resolution counterpart
 * of the validator's string `isTargetPermitted`, off the same `permittedRoots`
 * table, so `..` escapes are caught (a path may pass the string prefix yet
 * resolve out of the subtree).
 */
function targetResolvesSafely(root: string, type: SuggestionType, target: string): boolean {
  if (path.isAbsolute(target)) return false;
  const resolved = path.resolve(root, target);
  for (const spec of permittedRoots(type)) {
    if (spec.kind === 'dir') {
      if (isInsideDir(path.resolve(root, spec.prefix), resolved)) return true;
    } else if (spec.kind === 'file') {
      if (resolved === path.resolve(root, spec.path)) return true;
    } else if (spec.kind === 'skill') {
      if (skillTargetName(root, target) !== null) return true;
    }
  }
  return false;
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

/** Count byte-exact, non-overlapping occurrences of `needle` in `hay` (§4.5.2 edit). */
function countOccurrences(hay: string, needle: string): number {
  if (needle === '') return 0;
  let count = 0;
  let idx = hay.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = hay.indexOf(needle, idx + needle.length);
  }
  return count;
}

function printSuggestion(s: Suggestion): void {
  console.log(`${s.id}: ${s.title}`);
  console.log(`  Type: ${s.type}`);
  if (s.source !== null) console.log(`  Source: ${s.source}`);
  console.log(`  Target: ${s.target}`);
  if (s.payloadKind === 'edit') {
    console.log('  Proposed edit (current → replacement):');
    for (const line of (s.current ?? '').split('\n')) console.log(`    - ${line}`);
    for (const line of (s.replacement ?? '').split('\n')) console.log(`    + ${line}`);
  } else {
    console.log(s.payloadKind === 'file' ? '  Proposed file:' : '  Proposed addition:');
    for (const line of (s.block ?? '').split('\n')) console.log(`    ${line}`);
  }
  console.log('');
}

/** A section is applicable only with a target and a well-formed payload. */
function hasPayload(s: Suggestion): boolean {
  return s.payloadKind !== null;
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
      if (s.target === null || !hasPayload(s)) {
        console.error(`Skipping malformed suggestion ${s.id}: missing Target or proposed payload.`);
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
    // Malformed addressed entry (Rule 7): cannot apply without a target + payload.
    if (suggestion.target === null || !hasPayload(suggestion)) {
      console.error(`Suggestion ${id} is malformed (missing Target or proposed payload); cannot accept.`);
      return 1;
    }
    const target = suggestion.target;
    const targetAbs = path.resolve(root, target);

    // --- Skill path (shape-based, type-agnostic — preserves v1 tolerance for
    //     legacy untyped skill suggestions). A skill target is always a create;
    //     accept never overwrites an existing skill (§4.5.1). ---
    const skillName = skillTargetName(root, target);
    if (skillName !== null) {
      if (fs.existsSync(targetAbs)) {
        console.error(`Refusing existing skill file (accept never overwrites a skill): ${target}`);
        return 1;
      }
      if (suggestion.block === null) {
        console.error(`Suggestion ${id} targets a skill but carries no create payload; cannot accept.`);
        return 1;
      }
      const nextSource = annotateStatus(sourceLines, suggestion, 'accepted').join('\n');
      fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
      fs.writeFileSync(targetAbs, suggestion.block, 'utf-8');
      fs.writeFileSync(suggestion.file, nextSource, 'utf-8');
      console.log(`Accepted ${id}: created ${target}.`);
      return 0;
    }

    // --- Type-permitted target root (§4.5.1), resolved for `..`-escape safety. ---
    if (!targetResolvesSafely(root, suggestion.type, target)) {
      console.error(
        `Refusing target outside the permitted root for type "${suggestion.type}" (${permittedRootsLabel(suggestion.type)}): ${target}`,
      );
      return 1;
    }

    // Compute EVERYTHING before the first write (Rule 6: transactional accept).
    const exists = fs.existsSync(targetAbs);
    const existing = exists ? fs.readFileSync(targetAbs, 'utf-8') : '';

    // Rule 7b (3.4 fifth revision; schema.id-registry Rule 4): a NEW
    // `.cortex/compass/rules/R-NNN-<slug>.md` target is registered in
    // compass/registry.md in the same run — after the file lands, below. If
    // the id is already on a line under a different slug, refuse now, before
    // any write. Existing targets never touch the registry.
    const newRuleFile = exists ? null : NEW_RULE_FILE_RE.exec(target);
    if (newRuleFile) {
      const taken = findRegistered(root, newRuleFile[1]!);
      if (taken && taken.slug !== newRuleFile[2] && taken.slug !== 'reserved') {
        console.error(
          `Refusing ${id}: ${newRuleFile[1]} is already registered in .cortex/compass/registry.md as "${taken.id} ${taken.slug}" (line ${taken.line}). Allocate a fresh id with \`cortex id next rule\` and re-propose. Nothing changed.`,
        );
        return 1;
      }
    }

    // Clobber / existence gates per payload shape (§4.5.2).
    if (suggestion.payloadKind === 'file') {
      if (exists) {
        console.error(`Refusing to overwrite existing file (create): ${target}. Nothing changed.`);
        return 1;
      }
    } else if (suggestion.payloadKind === 'addition') {
      // Append requires the target to exist, except a compass core file (created).
      const compassRoot = path.resolve(root, '.cortex', 'compass');
      const relFromCompass = path.relative(compassRoot, targetAbs);
      const isCore = COMPASS_CORE_FILES.has(relFromCompass);
      if (!exists && !isCore) {
        console.error(`Target file does not exist: ${target}`);
        return 1;
      }
    } else if (suggestion.payloadKind === 'edit') {
      if (!exists) {
        console.error(`Target file does not exist: ${target}`);
        return 1;
      }
    }

    // Compute the landed target content per shape. For an edit, validate the
    // byte-exact single-occurrence match BEFORE deciding to write (§4.5.2).
    let nextTarget: string;
    let opWord: string;
    if (suggestion.payloadKind === 'edit') {
      const current = suggestion.current ?? '';
      const replacement = suggestion.replacement ?? '';
      const occurrences = countOccurrences(existing, current);
      if (occurrences === 0) {
        console.error(
          `Refusing edit ${id}: the current: block does not match ${target} byte-exact (the target drifted). Nothing changed.`,
        );
        return 1;
      }
      if (occurrences > 1) {
        console.error(
          `Refusing edit ${id}: the current: block matches ${occurrences} occurrences in ${target} (ambiguous). Nothing changed.`,
        );
        return 1;
      }
      const at = existing.indexOf(current);
      nextTarget = existing.slice(0, at) + replacement + existing.slice(at + current.length);
      opWord = 'edited';
    } else {
      // addition | file (block guaranteed non-null when payloadKind is set).
      const block = suggestion.block ?? '';
      nextTarget = suggestion.payloadKind === 'file' ? block : appendBlock(existing, block);
      opWord = suggestion.payloadKind === 'file' ? 'created' : 'appended to';
    }

    // Promotion side-effects (§4.5 Source clause, §4.10.4; B-020): the gated
    // write carries a `source:` back-reference to the named artefact; an
    // insight original is marked promoted (never deleted); an archive source
    // is never written to. A source naming neither kind, a missing source
    // file, or an archive source targeting outside compass/atlas is a
    // transactional refusal (nothing written).
    let insightWrite: { abs: string; content: string } | null = null;
    let promoted = false;
    if (suggestion.type === 'promotion') {
      const plan = planPromotion({
        root,
        suggestionId: id,
        targetRel: target,
        isCreate: suggestion.payloadKind === 'file',
        block: suggestion.block ?? '',
        existingTarget: existing,
        sourceField: suggestion.source,
      });
      if (!plan.ok) {
        console.error(`Refusing ${plan.error}`);
        return 1;
      }
      nextTarget = plan.landedContent;
      promoted = true;
      if (plan.insightAbs !== null && plan.nextInsight !== null) {
        insightWrite = { abs: plan.insightAbs, content: plan.nextInsight };
      }
    }

    const nextSource = annotateStatus(sourceLines, suggestion, 'accepted').join('\n');

    // All computed — now write the (small) blast radius (Rule 7).
    // An evidence-candidate lands in atlas/evidence/, which never exists
    // without its _index.md (§4.3, 3.4 — the compass-core-file precedent).
    if (suggestion.type === 'evidence-candidate') ensureEvidenceDir(root);
    fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
    fs.writeFileSync(targetAbs, nextTarget, 'utf-8');
    if (insightWrite !== null) fs.writeFileSync(insightWrite.abs, insightWrite.content, 'utf-8');
    fs.writeFileSync(suggestion.file, nextSource, 'utf-8');
    // Rule 7b: register the new rule file's id (registry created from disk
    // first when absent — which then already lists the file just landed).
    if (newRuleFile) registerId(root, newRuleFile[1]!, newRuleFile[2]!);
    console.log(
      insightWrite !== null
        ? `Accepted ${id}: promoted to ${target}, marked the insight original.`
        : promoted
          ? `Accepted ${id}: promoted to ${target}.`
          : `Accepted ${id}: ${opWord} ${target}.`,
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
  if (suggestion.target === null || !hasPayload(suggestion)) {
    console.error(`Suggestion ${id} is malformed (missing Target or proposed payload); cannot reject.`);
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
