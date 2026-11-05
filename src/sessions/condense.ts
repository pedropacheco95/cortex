/**
 * Condensing a session transcript for `cortex-learn` (spec loops.learn-task
 * Rules 3, 4). Deterministic Core: labels who spoke, drops tool results, and
 * redacts secrets before anything is written.
 */
import { extractMessages, extractToolUses, type SessionEntry } from './read.js';
import { isHarnessText } from '../hooks/harness.js';

/** A condensed file over this many characters is split at an entry boundary. */
export const CONDENSE_PART_CHARS = 200_000;

/** A string this varied, in a long run with no words in it, is treated as a key whatever its prefix. */
export const SECRET_MIN_ENTROPY = 4.2;

function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) bits -= (n / s.length) * Math.log2(n / s.length);
  return bits;
}

/** Rule 4: `label` → pattern. Data; a match becomes `[redacted:<label>]`. */
export const SECRET_PATTERNS: readonly { label: string; pattern: RegExp; accept?: (match: string) => boolean }[] = [
  // A Bash command is cut at 200 characters, so a key may have no END line.
  { label: 'private-key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g },
  { label: 'api-key', pattern: /\bsk-[A-Za-z0-9_-]{16,}/g },
  { label: 'github-token', pattern: /\b(?:ghp_|gho_|ghs_|ghu_|ghr_|github_pat_)[A-Za-z0-9_]{16,}/g },
  { label: 'aws-key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { label: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{8,}/g },
  { label: 'bearer', pattern: /\bbearer\s+(?!\[redacted:)[A-Za-z0-9._~+/=-]{8,}/gi },
  { label: 'url-credential', pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]*:[^\s@/]+@/gi },
  {
    // The name may carry a prefix (GITHUB_TOKEN), and the value may be quoted, as in JSON.
    label: 'credential',
    pattern: /\b(?:[A-Za-z0-9]+[_-])*(?:password|passwd|secret|token|api[_-]?key)["']?\s*[=:]\s*(?!["']?\[redacted:)(?:"[^"\n]*"|'[^'\n]*'|[^\s"'`,;]+)/gi,
  },
  {
    // Tokens no prefix names. Mixed case and digits leave git hashes (lower-case hex) and most names alone.
    label: 'high-entropy',
    pattern: /(?<![A-Za-z0-9+/_-])(?=[A-Za-z0-9+_-]*[a-z])(?=[A-Za-z0-9+_-]*[A-Z])(?=[A-Za-z0-9+_-]*\d)[A-Za-z0-9+_-]{32,}={0,2}/g,
    accept: (match) => entropy(match) >= SECRET_MIN_ENTROPY,
  },
];

export function redact(text: string): { text: string; redactions: number } {
  let out = text;
  let redactions = 0;
  for (const { label, pattern, accept } of SECRET_PATTERNS) {
    out = out.replace(pattern, (match) => {
      if (accept !== undefined && !accept(match)) return match;
      redactions++;
      return `[redacted:${label}]`;
    });
  }
  return { text: out, redactions };
}

function speaker(role: 'user' | 'assistant', text: string): string {
  if (role === 'assistant') return 'ASSISTANT';
  if (text.includes('<cross-session-message')) return 'PEER';
  return isHarnessText(text) ? 'INJECTED' : 'USER';
}

export interface CondensedSession {
  /** The text of each part, in order; one part unless the session is long. */
  parts: string[];
  redactions: number;
}

export function condenseSession(entries: SessionEntry[], partChars = CONDENSE_PART_CHARS): CondensedSession {
  const blocks: string[] = [];
  let redactions = 0;
  for (const entry of entries) {
    const lines: string[] = [];
    for (const m of extractMessages([entry])) {
      lines.push(`${speaker(m.role, m.text)} ${m.timestamp ?? '-'}:\n${m.text}`);
    }
    for (const use of extractToolUses([entry])) {
      lines.push(['TOOL', use.name, use.filePath ?? use.command].filter((p) => p !== undefined).join(' '));
    }
    if (lines.length === 0) continue;
    const clean = redact(lines.join('\n'));
    redactions += clean.redactions;
    blocks.push(clean.text);
  }

  const parts: string[] = [];
  let current = '';
  for (const block of blocks) {
    const next = current === '' ? block : `${current}\n\n${block}`;
    if (next.length > partChars && current !== '') {
      parts.push(current);
      current = block;
    } else {
      current = next;
    }
  }
  if (current !== '') parts.push(current);
  return { parts, redactions };
}
