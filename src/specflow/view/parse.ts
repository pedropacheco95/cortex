/**
 * Parsing one spec file for the viewer (specflow.viewer Rule 2): the sections
 * of its body, ported from the specflow-viewer script. The ids, tags and links
 * come from the model; only the prose is read here.
 */
import matter from 'gray-matter';

export interface Step {
  keyword: string;
  text: string;
}

export interface Entity {
  name: string;
  description: string;
}

export interface Sections {
  title: string;
  /** The body without its first heading. */
  rest: string;
  intent: string;
  entities: string;
  rules: string;
  criteria: string;
  notes: string;
}

export interface Parsed {
  fm: Record<string, unknown>;
  body: string;
  /** Why the frontmatter did not parse; null when it did. */
  error: string | null;
}

/** Frontmatter and body. The options object keeps gray-matter's cache out: a cached failure would not throw twice. */
export function parseFile(text: string): Parsed {
  try {
    const m = matter(text, {});
    return { fm: m.data as Record<string, unknown>, body: m.content, error: null };
  } catch (err) {
    const message = (err as Error).message.split('\n')[0] ?? 'unreadable';
    const open = /^---\s*\n[\s\S]*?\n---\s*(\n|$)/.exec(text);
    return { fm: {}, body: open ? text.slice(open[0].length) : text, error: message };
  }
}

/** A frontmatter value as a list of non-empty strings. */
export function listOf(value: unknown): string[] {
  const items = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return items.map((v) => String(v).trim()).filter((v) => v !== '');
}

/** Split a body at its `##` headings, outside code fences. The first `#` heading is the title. */
export function splitSections(body: string): Sections {
  const lines = body.split('\n');
  let title = '';
  let fence = false;
  const kept: string[] = [];
  let titled = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h1 = !fence && !titled ? /^#\s+(.+)$/.exec(line) : null;
    if (h1) {
      title = (h1[1] as string).trim();
      titled = true;
      continue;
    }
    // `**Intent**` on a line of its own counts as a `## Intent` heading
    const bold = !fence ? /^\*\*(Intent|Entities|Rules|Acceptance Criteria|Notes)\*\*\s*:?\s*$/i.exec(line) : null;
    kept.push(bold ? `## ${bold[1]}` : line);
  }
  const found: Record<string, string[]> = {};
  let current: string | null = null;
  fence = false;
  for (const line of kept) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h2 = fence ? null : /^##\s+(.*?)\s*$/.exec(line);
    if (h2) {
      current = (h2[1] as string).toLowerCase();
      found[current] = [];
    } else if (current !== null) {
      (found[current] as string[]).push(line);
    }
  }
  const get = (key: string): string => (found[key] ?? []).join('\n').trim();
  return {
    title,
    rest: kept.join('\n').trim(),
    intent: get('intent'),
    entities: get('entities'),
    rules: get('rules'),
    criteria: get('acceptance criteria'),
    notes: get('notes'),
  };
}

/** Whether the body carries any of the sections the page lays out. */
export function hasKnownSections(s: Sections): boolean {
  return [s.intent, s.entities, s.rules, s.criteria, s.notes].some((x) => x !== '');
}

/** Top-level list items: a `-`, `*` or `1.` line, with their indented continuation. */
function topLevelItems(raw: string): string[] {
  const items: string[] = [];
  let current: string[] = [];
  for (const line of raw.split('\n')) {
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const indent = line.length - line.trimStart().length;
      if (indent <= 1) {
        if (current.length > 0) items.push(current.join('\n'));
        current = [line];
      } else {
        current.push(line);
      }
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) items.push(current.join('\n'));
  return items;
}

const MARKER = /^\s*(?:[-*]|\d+\.)\s+/;

export function parseEntities(raw: string): Entity[] {
  return topLevelItems(raw).map((item) => {
    const text = item.replace(MARKER, '').trim();
    const m = /^\*\*(.+?)\*\*([\s\S]*)$/.exec(text);
    if (!m) return { name: '', description: text };
    return {
      name: (m[1] as string).trim().replace(/^`|`$/g, ''),
      description: (m[2] as string).trim().replace(/^[—–-]\s*/, ''),
    };
  });
}

export function parseRules(raw: string): string[] {
  return topLevelItems(raw)
    .map((item) => item.replace(MARKER, '').trim())
    .filter((t) => t !== '');
}

export function parseNotes(raw: string): { notes: string[]; open: string[] } {
  const notes: string[] = [];
  const open: string[] = [];
  for (const item of topLevelItems(raw)) {
    const text = item.replace(MARKER, '').trim();
    if (text === '') continue;
    if (/^OPEN\s*:/i.test(text)) open.push(text.replace(/^OPEN\s*:\s*/i, ''));
    else notes.push(text);
  }
  return { notes, open };
}

const KEYWORD = /^\s*[-*]\s*\*\*\s*(And when|And then|And given|Given|When|Then|And|But)\s*\*\*\s*(.*)$/i;

/** The Given/When/Then lines of one criterion. */
export function parseSteps(text: string): Step[] {
  const steps: Step[] = [];
  for (const line of text.split('\n')) {
    const m = KEYWORD.exec(line);
    if (!m) continue;
    const k = (m[1] as string).toLowerCase();
    steps.push({ keyword: k.charAt(0).toUpperCase() + k.slice(1), text: (m[2] as string).trim() });
  }
  return steps;
}

/** The first prose sentence of a body: the sidebar subtitle of a folder. */
export function firstSentence(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p !== '');
  for (const p of paragraphs) {
    if (/^(#|\||-|\*|>|```)/.test(p)) continue;
    const m = /^([\s\S]+?[.!?])\s/.exec(`${p} `);
    return m ? (m[1] as string).trim() : p.slice(0, 200).trim();
  }
  return '';
}

/** `billing-refunds` becomes `Billing Refunds`. */
export function folderLabel(dir: string, tree: 'business' | 'dev'): string {
  if (dir === '') return tree === 'business' ? 'Promises' : 'Implementation';
  const last = dir.split('/').pop() as string;
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** `billing.refunds-v2` becomes `Billing · Refunds V2`. */
export function titleFromId(id: string): string {
  return id.replace(/\./g, ' · ').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
