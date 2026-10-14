/**
 * Rules as first-class files (schema Part II S4; spec store.rules): the rule
 * model, `check.rule`, the deterministic `check.applies-when` lint, and the
 * `always` rules MAP prints in full. Nothing here pushes a rule (Rule 5).
 */
import { stringList, type Store, type StoreFile } from './layout.js';
import { finding, type Finding } from './types.js';

export const RULE_SCOPES = ['user-message', 'agent-answer', 'action', 'session-end'] as const;
export type RuleScope = (typeof RULE_SCOPES)[number];

export interface Rule {
  path: string;
  about: string;
  appliesWhen: string;
  scope: string[];
  match: { commands: string[]; paths: string[] };
  source: string;
  verified: string;
  text: string;
}

const isRuleFile = (f: StoreFile): boolean => f.folder === 'world/rules';

export function loadRules(store: Store): Rule[] {
  return store.files.filter(isRuleFile).map((f) => {
    const fm = f.frontmatter ?? {};
    const match = (fm['match'] ?? {}) as Record<string, unknown>;
    return {
      path: f.path,
      about: String(fm['about'] ?? ''),
      appliesWhen: String(fm['applies_when'] ?? ''),
      scope: stringList(fm['scope']),
      match: { commands: stringList(match['commands']), paths: stringList(match['paths']) },
      source: String(fm['source'] ?? ''),
      verified: String(fm['verified'] ?? ''),
      text: f.body.trim(),
    };
  });
}

export function checkRules(store: Store): Finding[] {
  const out: Finding[] = [];
  for (const f of store.files.filter(isRuleFile)) {
    const fm = f.frontmatter;
    if (!fm) continue;
    const err = (msg: string): void => { out.push(finding('error', 'check.rule', f.path, msg)); };
    const aw = fm['applies_when'];
    if (aw === undefined) err('missing applies_when');
    else if (typeof aw !== 'string' || aw.trim() === '') err('applies_when must be a sentence, or always');
    const scope = fm['scope'];
    if (scope === undefined) err('missing scope');
    else if (!Array.isArray(scope) || scope.length === 0) err('scope must be a non-empty list');
    else for (const s of scope) if (!(RULE_SCOPES as readonly string[]).includes(String(s))) err(`scope value ${String(s)} is not one of ${RULE_SCOPES.join(', ')}`);
    const src = fm['source'];
    if (src === undefined) err('missing source');
    else if (typeof src !== 'string' || !/^[^@\s]+@\d{4}-\d{2}-\d{2}$/.test(src)) err(`source ${JSON.stringify(src)} is not <who>@<YYYY-MM-DD>`);
    const match = fm['match'];
    if (match !== undefined) {
      if (match === null || typeof match !== 'object' || Array.isArray(match)) err('match must be { commands: [...], paths: [...] }');
      else {
        const m = match as Record<string, unknown>;
        if (m['commands'] !== undefined) {
          if (!Array.isArray(m['commands'])) err('match.commands must be a list');
          else for (const c of m['commands']) {
            try {
              new RegExp(String(c));
            } catch {
              err(`match.commands entry ${JSON.stringify(c)} does not compile as a regular expression`);
            }
          }
        }
        if (m['paths'] !== undefined && (!Array.isArray(m['paths']) || !m['paths'].every((p) => typeof p === 'string'))) err('match.paths must be a list of strings');
      }
    }
    if (f.body.trim() === '') err('the rule text (body) is empty');
  }
  return out;
}

export const APPLIES_WHEN_STARTS = ['The agent', 'The user', 'A session', 'When', 'Before', 'After', 'While'];
/** Topic phrasings; `about` is matched as a word but not in "about to", which describes a situation. */
const TOPIC_PHRASES: { label: string; re: RegExp }[] = [
  { label: 'about', re: /\babout\b(?!\s+to\b)/i },
  { label: 'related to', re: /\brelated to\b/i },
  { label: 'regarding', re: /\bregarding\b/i },
  { label: 'anything to do with', re: /\banything to do with\b/i },
];

/** The S4 description lint for one value; empty when it passes. */
export function appliesWhenProblems(value: string): string[] {
  const v = value.trim();
  if (v === 'always') return [];
  const problems: string[] = [];
  const words = v.split(/\s+/).filter(Boolean).length;
  if (words < 6 || words > 60) problems.push(`${words} words (6–60)`);
  if (!APPLIES_WHEN_STARTS.some((s) => v === s || v.startsWith(`${s} `))) problems.push(`it does not start with an actor or a condition (${APPLIES_WHEN_STARTS.join(', ')})`);
  for (const t of TOPIC_PHRASES) if (t.re.test(v)) problems.push(`it uses the topic phrasing "${t.label}"`);
  return problems;
}

export function checkAppliesWhen(store: Store): Finding[] {
  const out: Finding[] = [];
  for (const f of store.files.filter(isRuleFile)) {
    const aw = f.frontmatter?.['applies_when'];
    if (typeof aw !== 'string') continue;
    const problems = appliesWhenProblems(aw);
    if (problems.length) out.push(finding('warning', 'check.applies-when', f.path, `applies_when should describe a situation: ${problems.join('; ')}`));
  }
  return out;
}

export function alwaysRules(store: Store): Rule[] {
  return loadRules(store).filter((r) => r.appliesWhen.trim() === 'always').sort((a, b) => a.path.localeCompare(b.path));
}
