/**
 * check.pulse (schema §4.5, §4.5.1, §4.5.2). Two layers:
 *
 *  - v1: pulse-artefact frontmatter header presence (`kind`/`generated`/`loop`)
 *        — warnings (transient data is not held to artefact-grade rigor).
 *  - v2: per suggestion section (`## S-NNN: …`) the typed pulse gate —
 *        `**Type:**` present + in enum (absent → rule-candidate + warning; value
 *        outside enum → error; the v3.0 enum includes `decision-candidate`,
 *        A7.4, via the shared SUGGESTION_TYPES table); `**Target:**` root
 *        permitted FOR ITS TYPE per
 *        the §4.5.1 table (wrong root → error); exactly one payload shape among
 *        `**Proposed addition:**`/`**Proposed edit:**`/`**Proposed file:**`
 *        (zero or >1 → error).
 *
 * Skips `threads/**` (3.3 third revision — the ledger is check.threads's).
 *
 * Pure structural inspection — no LLM, no network (R-001), read-only.
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import fg from 'fast-glob';
import type { Violation } from '../types.js';
import {
  SUGGESTION_TYPES,
  PAYLOAD_SHAPES,
  isTargetPermitted,
  permittedRootsLabel,
  type SuggestionType,
} from '../../pulse/types.js';

interface Section {
  id: string;
  text: string;
}

/** Split a markdown body into `## S-NNN:` suggestion sections. */
function parseSuggestionSections(body: string): Section[] {
  const lines = body.split('\n');
  const sections: Section[] = [];
  let current: { id: string; lines: string[] } | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(S-\d+)\b/);
    if (m) {
      if (current) sections.push({ id: current.id, text: current.lines.join('\n') });
      current = { id: m[1]!, lines: [] };
    } else if (current) {
      if (/^#{1,2}\s/.test(line)) {
        // a non-suggestion H1/H2 closes the current section
        sections.push({ id: current.id, text: current.lines.join('\n') });
        current = null;
      } else {
        current.lines.push(line);
      }
    }
  }
  if (current) sections.push({ id: current.id, text: current.lines.join('\n') });
  return sections;
}

function fieldValue(text: string, label: string): string | undefined {
  const re = new RegExp(`^\\s*\\*\\*${label}:\\*\\*\\s*(.+?)\\s*$`, 'm');
  const m = text.match(re);
  return m ? m[1]!.trim() : undefined;
}

export async function checkPulse(root: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const pulseDir = path.join(root, '.cortex', 'pulse');

  if (!fs.existsSync(pulseDir)) return violations;

  // threads/** is skipped: the ledger has its own check (check.threads, §4.5.3)
  // and the kind/generated/loop header rule does not apply to it.
  const files = await fg('**/*.md', { cwd: pulseDir, absolute: true, ignore: ['**/_index.md', 'threads/**'] });

  for (const filePath of files) {
    let raw: string;
    let data: Record<string, unknown> = {};
    let body = '';
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = matter(raw);
      data = parsed.data as Record<string, unknown>;
      body = parsed.content;
    } catch {
      continue;
    }

    // --- v1: frontmatter header presence (warnings). ---
    if (!data['kind']) {
      violations.push({ severity: 'warning', check: 'check.pulse', clause: '§4.5', location: { path: filePath, key: 'kind' }, message: 'Pulse artefact missing "kind" field' });
    }
    if (!data['generated']) {
      violations.push({ severity: 'warning', check: 'check.pulse', clause: '§4.5', location: { path: filePath, key: 'generated' }, message: 'Pulse artefact missing "generated" field' });
    }
    if (!data['loop']) {
      violations.push({ severity: 'warning', check: 'check.pulse', clause: '§4.5', location: { path: filePath, key: 'loop' }, message: 'Pulse artefact missing "loop" field' });
    }

    // dismissed.md carries `## S-NNN` *dismissal* records, not proposals — schema
    // §4.5 validates it "header present; loose otherwise" (transient rejection
    // memory). Exempt it from the typed-suggestion section checks.
    if (data['kind'] === 'pulse-dismissed') continue;

    // --- v2: typed suggestion sections. ---
    for (const section of parseSuggestionSections(body)) {
      // Type (§4.5.1): absent → rule-candidate + warning; outside enum → error.
      const rawType = fieldValue(section.text, 'Type');
      let effectiveType: SuggestionType = 'rule-candidate';
      if (rawType === undefined) {
        violations.push({
          severity: 'warning',
          check: 'check.pulse',
          clause: '§4.5.1',
          location: { path: filePath, key: section.id },
          message: `${section.id}: missing "**Type:**" — treated as rule-candidate (v1-era tolerance)`,
        });
      } else if (!(SUGGESTION_TYPES as readonly string[]).includes(rawType)) {
        violations.push({
          severity: 'error',
          check: 'check.pulse',
          clause: '§4.5.1',
          location: { path: filePath, key: section.id },
          message: `${section.id}: "**Type:** ${rawType}" is not one of ${SUGGESTION_TYPES.join(' | ')}`,
        });
      } else {
        effectiveType = rawType as SuggestionType;
      }

      // Target (§4.5.1): root permitted for the (effective) type.
      const target = fieldValue(section.text, 'Target');
      if (target !== undefined && !isTargetPermitted(effectiveType, target)) {
        violations.push({
          severity: 'error',
          check: 'check.pulse',
          clause: '§4.5.1',
          location: { path: filePath, key: section.id },
          message: `${section.id}: "**Target:** ${target}" is outside the permitted root for type "${effectiveType}" (permitted: ${permittedRootsLabel(effectiveType)})`,
        });
      }

      // Payload (§4.5.2): exactly one payload shape.
      const shapesPresent = PAYLOAD_SHAPES.filter((s) => section.text.includes(s));
      if (shapesPresent.length !== 1) {
        violations.push({
          severity: 'error',
          check: 'check.pulse',
          clause: '§4.5.2',
          location: { path: filePath, key: section.id },
          message:
            shapesPresent.length === 0
              ? `${section.id}: no payload shape (expected exactly one of ${PAYLOAD_SHAPES.join(', ')})`
              : `${section.id}: ${shapesPresent.length} payload shapes present (${shapesPresent.join(', ')}) — exactly one required`,
        });
      }
    }
  }

  return violations;
}
