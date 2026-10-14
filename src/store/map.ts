/**
 * `MAP.md` generation (schema Part II S8.1–S8.2; spec store.map). Sections
 * 1–3 are fixed template text; the hard rules, cast and terms are generated
 * from the store, so MAP cannot drift. Deterministic: identical stores give
 * byte-identical maps.
 */
import { fileStem, stringList, type Store } from './layout.js';
import { alwaysRules } from './rules.js';
import { finding, type Finding } from './types.js';

export const MAP_LINE_LIMIT = 60;

/** S8.2 tie-breaker, word for word. */
export const TIE_BREAKER =
  'The subject is what the fact constrains. If it constrains two, file it under the one the reader would be working in when it bites, and add an alias in the other.';

export const READBACK_FORMAT = 'Filing: <fact> → <path> (origin: <origin>)';

const MODULES_SECTION = [
  '# Cortex map',
  '',
  "This project keeps its knowledge in `cortex/`: plain markdown, one subject per file. This map is the only part loaded every session; read the rest when you need it.",
  '',
  '- `code/<area>/`: how to work in one code area (pitfalls, commands, conventions, why the code is this way). Goes stale with the code.',
  '- `world/`: people, orgs, terms, systems, agreements, decisions and rules. Goes stale with people and the outside world.',
  '- `history/`: dated and append-only: sources, changes, incidents, measurements. Never stale.',
  '- `now/`: true only for now; every item carries `until:` and expires on that date.',
];

const TRIGGERS_SECTION = [
  '## Where to look',
  '',
  '- An unknown term → `world/terms/`',
  '- A person or a role → `world/people/`, `world/orgs/`',
  '- An error message → grep its literal text in `cortex/`',
  '- "Why is it like this?" → `world/decisions/` and `history/`',
  '- "What is happening now?" → `now/`',
  '- "How do we work?" → `world/rules/`',
];

const PLACEMENT_SECTION = [
  '## Filing a new fact',
  '',
  "1. Search first: `rg -i '<word>' cortex/`, and `rg '^about:' cortex/` as the index.",
  '2. If a file for the subject exists, append the fact to it.',
  '3. Otherwise create one, in the folder the table below gives.',
  '4. Apply the tie-breaker below when the fact fits two subjects.',
  '5. One fact lives in exactly one file. Link to it; never restate it.',
  '6. Set `verified: <YYYY-MM-DD> (observed|told|inferred)` and `origin` (where the fact came from).',
  `7. End with the readback line \`${READBACK_FORMAT}\`.`,
  '',
  '| The fact is… | Folder |',
  '|---|---|',
  '| how to work in a code area: pitfall, command, convention, why the code is this way | `code/<area>/` |',
  '| who someone is, or an organisation | `world/people/`, `world/orgs/` |',
  '| what a word means here | `world/terms/` |',
  '| an external system, environment, service or account pointer | `world/systems/` |',
  '| an agreement with a client, partner or the user | `world/agreements/` |',
  '| the current answer to a question, and why | `world/decisions/` |',
  '| how we work (a rule the user set) | `world/rules/` |',
  '| something that happened: a change, incident, measurement or ingested document | `history/<kind>/` |',
  '| true only for now: sprint, leave, status, risk, open question, idea | `now/` |',
  '',
  `Tie-breaker: ${TIE_BREAKER}`,
];

function about(store: Store, rel: string): string {
  const f = store.files.find((x) => x.path === rel);
  const a = f?.frontmatter?.['about'];
  return typeof a === 'string' ? a.trim() : '';
}

export function renderMap(store: Store): string {
  const sections: string[][] = [MODULES_SECTION, TRIGGERS_SECTION, PLACEMENT_SECTION];
  const hard = alwaysRules(store);
  if (hard.length) {
    sections.push(['## Hard rules', '', ...hard.map((r) => `- ${r.text.split('\n').map((l, i) => (i === 0 ? l : l === '' ? '' : `  ${l}`)).join('\n')}`)]);
  }
  const cast = store.files
    .filter((f) => f.folder === 'world/people' || f.folder === 'world/orgs')
    .map((f) => f.path)
    .sort((a, b) => fileStem(a).localeCompare(fileStem(b)) || a.localeCompare(b));
  if (cast.length) sections.push(['## Cast', '', ...cast.map((p) => `- ${fileStem(p)}: ${about(store, p)}`)]);
  const terms = new Set<string>();
  for (const f of store.files.filter((x) => x.folder === 'world/terms')) {
    terms.add(fileStem(f.path));
    for (const a of stringList(f.frontmatter?.['aliases'])) terms.add(a.trim());
  }
  if (terms.size) sections.push([`Terms: ${[...terms].filter(Boolean).sort((a, b) => a.localeCompare(b)).join(', ')}`]);
  return sections.map((s) => s.join('\n')).join('\n\n') + '\n';
}

export function lineCount(text: string): number {
  return text.replace(/\n$/, '').split('\n').length;
}

export function checkMapSize(store: Store): Finding[] {
  const n = lineCount(renderMap(store));
  return n > MAP_LINE_LIMIT ? [finding('warning', 'check.map-size', 'MAP.md', `MAP is ${n} lines (limit ${MAP_LINE_LIMIT})`)] : [];
}
