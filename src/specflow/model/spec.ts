/**
 * Parsing one spec's text (specflow.index Rules 2 to 4; specflow.check Rule 5).
 * By text only: frontmatter, the Acceptance Criteria section, numbered rules.
 */
import matter from 'gray-matter';

export const CRITERION_ID = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*-[0-9]+$/;
const ID_HEADING = /^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[0-9]+): (.*)$/;

export interface Heading {
  level: number;
  title: string;
  line: number;
}

export interface Criterion {
  id: string | null;
  title: string;
  /** Its heading and body, as written. */
  text: string;
}

export function frontmatter(text: string): Record<string, unknown> {
  try {
    return matter(text).data as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Headings outside code fences, with their 0-based line. */
export function headings(lines: string[]): Heading[] {
  const found: Heading[] = [];
  let fence = false;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) return;
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (m) found.push({ level: (m[1] as string).length, title: m[2] as string, line: i });
  });
  return found;
}

/** The criteria of a spec: the headings one level below its Acceptance Criteria heading. */
export function parseCriteria(text: string): Criterion[] {
  const lines = text.split('\n');
  const all = headings(lines);
  const at = all.findIndex((h) => h.title === 'Acceptance Criteria' && (h.level === 2 || h.level === 3));
  if (at < 0) return [];
  const section = all[at] as Heading;
  const after = all.slice(at + 1);
  const close = after.find((h) => h.level <= section.level);
  const end = close ? close.line : lines.length;
  const own = after.filter((h) => h.line < end && h.level === section.level + 1);
  return own.map((h, i) => {
    const next = own[i + 1];
    const stop = next ? next.line : end;
    const m = ID_HEADING.exec(h.title);
    return {
      id: m ? (m[1] as string) : null,
      title: m ? (m[2] as string) : h.title,
      text: lines.slice(h.line, stop).join('\n').trimEnd(),
    };
  });
}

/** The prefix of a spec's criterion ids: `core-cli.init` gives `CORE-CLI-INIT`. */
export function criterionPrefix(specId: string): string {
  return specId.toUpperCase().replace(/[^A-Z0-9]+/g, '-');
}
