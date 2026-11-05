/** Rules (a), (d) and (e) over one change set (specflow.check Rules 6, 9, 10, 17). */
import type { PathClass } from './classify.js';
import type { ItemChange } from './items.js';

export interface Refusal {
  letter: string;
  line: string;
}

const MAX_NAMED = 8;

function named(list: string[]): string {
  const shown = list.slice(0, MAX_NAMED).join(', ');
  return list.length > MAX_NAMED ? `${shown} …` : shown;
}

/** Valid `Specflow-Amends:` trailers as `<spec-id>#<item>` (schema S10). */
export function amendTrailers(message: string): Map<string, string> {
  const found = new Map<string, string>();
  const text = message.split(/^# -+ >8 -+$/m)[0] as string;
  const kept = text.split('\n').filter((l) => !l.startsWith('#')).join('\n').trim();
  const paragraphs = kept.split(/\n\s*\n/);
  if (paragraphs.length < 2) return found; // a trailer follows the subject
  for (const line of (paragraphs[paragraphs.length - 1] as string).split('\n')) {
    const m = /^Specflow-Amends:\s*(\S+#\S+)\s+(?:—|--|-)\s+\S/.exec(line);
    if (m) found.set(m[1] as string, line);
  }
  return found;
}

const itemName = (i: ItemChange): string => `${i.spec}#${i.item}`;

export function trailerFor(i: ItemChange, trailers: Map<string, string>): string | undefined {
  return trailers.get(itemName(i)) ?? (i.retiring ? trailers.get(`${i.spec}#retired`) : undefined);
}

export function judge(
  paths: string[],
  classOf: (file: string) => PathClass,
  items: ItemChange[],
  message: string,
): Refusal[] {
  const refusals: Refusal[] = [];
  const counted = paths.filter((p) => classOf(p) !== 'generated');
  const code = counted.filter((p) => classOf(p) === 'code');
  const hasTest = counted.some((p) => classOf(p) === 'test');
  if (code.length > 0 && !hasTest) {
    refusals.push({
      letter: 'a',
      line: `- rule (a) code-needs-test: changes code or config with no test change: ${named(code)}. Change or add the test that proves it.`,
    });
  }
  if (items.length > 0 && code.length > 0) {
    refusals.push({
      letter: 'd',
      line: `- rule (d) spec-commit-alone: changes spec rules or criteria (${named([...new Set(items.map(itemName))])}) together with code or config (${named(code)}). Commit the spec change on its own, before or after the code.`,
    });
  }
  const trailers = amendTrailers(message);
  const missing = items.filter((i) => i.change !== 'added' && !trailerFor(i, trailers));
  if (missing.length > 0) {
    refusals.push({
      letter: 'e',
      line: `- rule (e) amend-needs-trailer: changes existing spec text with no trailer for: ${named(missing.map(itemName))}. Add one line each: Specflow-Amends: <spec-id>#<item> — <reason>`,
    });
  }
  return refusals;
}
