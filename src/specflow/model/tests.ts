/**
 * Finding test cases and their tags by text (specflow.index Rules 5 to 7).
 * No runner is executed and no Python is needed.
 */
import { CRITERION_ID } from './spec.js';

export interface TestCase {
  file: string;
  name: string;
  line: number;
  skipped: boolean;
  tags: string[];
  /** A name built at run time with no static tag: counted, not a case (Rule 5). */
  dynamic?: boolean;
  /** The case's source, whitespace collapsed: what the check compares. */
  body?: string;
}

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

const CASE_WORDS = new Set(['it', 'test', 'xit', 'xtest', 'fit']);
const CASE_MODIFIERS = new Set(['skip', 'todo', 'only', 'concurrent', 'sequential', 'fails', 'failing', 'each', 'for', 'skipIf', 'runIf']);
/** Modifiers called first, whose result takes the name: `it.each(rows)('name', …)`. */
const CURRIED = new Set(['each', 'for', 'skipIf', 'runIf']);
/** Curried modifiers that expand the case, so an untagged name is only counted. */
const EXPANDING = new Set(['each', 'for']);
const REGEX_MAY_FOLLOW = '(,=:[!&|?{};\n';

function tagsOf(name: string): string[] {
  const m = /^\[([^\]]*)\]/.exec(name);
  if (!m) return [];
  const ids = (m[1] as string).split(',').map((s) => s.trim());
  return ids.every((id) => CRITERION_ID.test(id)) ? ids : [];
}

function skipString(src: string, at: number): number {
  const quote = src[at];
  let i = at + 1;
  while (i < src.length && src[i] !== quote && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
  return i + 1;
}

function skipTemplate(src: string, at: number): number {
  let i = at + 1;
  while (i < src.length && src[i] !== '`') {
    if (src[i] === '\\') {
      i += 2;
    } else if (src[i] === '$' && src[i + 1] === '{') {
      let depth = 1;
      i += 2;
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth += 1;
        if (src[i] === '}') depth -= 1;
        if (src[i] === '`') i = skipTemplate(src, i);
        else if (src[i] === "'" || src[i] === '"') i = skipString(src, i);
        else i += 1;
      }
    } else {
      i += 1;
    }
  }
  return i + 1;
}

function skipRegex(src: string, at: number): number {
  let i = at + 1;
  let inClass = false;
  while (i < src.length && src[i] !== '\n') {
    if (src[i] === '\\') {
      i += 2;
      continue;
    }
    if (src[i] === '[') inClass = true;
    if (src[i] === ']') inClass = false;
    if (src[i] === '/' && !inClass) return i + 1;
    i += 1;
  }
  return i;
}

function skipGap(src: string, at: number): number {
  let i = at;
  for (;;) {
    while (i < src.length && /\s/.test(src.charAt(i))) i += 1;
    if (src.startsWith('//', i)) {
      const eol = src.indexOf('\n', i);
      i = eol < 0 ? src.length : eol;
    } else if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i);
      i = end < 0 ? src.length : end + 2;
    } else {
      return i;
    }
  }
}

interface Name {
  text: string;
  /** Holds `${…}`, so only its static start can be trusted. */
  built: boolean;
}

function nameAt(src: string, at: number): Name | null {
  const quote = src[at];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  const end = quote === '`' ? skipTemplate(src, at) : skipString(src, at);
  const body = src.slice(at + 1, end - 1);
  if (quote === '`' && body.includes('${')) return { text: body, built: true };
  return { text: body.replace(/\\(.)/g, '$1'), built: false };
}

/** Past the call that opens at `at`, skipping strings and comments inside it. */
function skipCall(src: string, at: number): number {
  let depth = 0;
  let i = at;
  while (i < src.length) {
    const c = src.charAt(i);
    if (src.startsWith('//', i) || src.startsWith('/*', i)) i = skipGap(src, i);
    else if (c === "'" || c === '"') i = skipString(src, i);
    else if (c === '`') i = skipTemplate(src, i);
    else {
      if (c === '(') depth += 1;
      if (c === ')') depth -= 1;
      i += 1;
      if (depth === 0) return i;
    }
  }
  return i;
}

/** Cases of a vitest, jest or node test file. */
export function scanJsCases(file: string, src: string): TestCase[] {
  const cases: TestCase[] = [];
  const parens: boolean[] = [];
  let nextParenSkips = false;
  let line = 1;
  let counted = 0;
  const lineAt = (at: number): number => {
    for (; counted < at; counted += 1) if (src[counted] === '\n') line += 1;
    return line;
  };
  let prev = '\n';
  let i = 0;
  while (i < src.length) {
    const c = src.charAt(i);
    if (src.startsWith('//', i) || src.startsWith('/*', i)) {
      i = skipGap(src, i);
      continue;
    }
    if (c === "'" || c === '"') {
      i = skipString(src, i);
      prev = c;
      continue;
    }
    if (c === '`') {
      i = skipTemplate(src, i);
      prev = c;
      continue;
    }
    if (c === '/' && REGEX_MAY_FOLLOW.includes(prev)) {
      i = skipRegex(src, i);
      prev = '/';
      continue;
    }
    if (c === '(') {
      parens.push(nextParenSkips);
      nextParenSkips = false;
    } else if (c === ')') {
      parens.pop();
    }
    if (/[A-Za-z_$]/.test(c)) {
      const start = i;
      const m = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/.exec(src.slice(i, i + 200));
      const chain = (m as RegExpExecArray)[0];
      i += chain.length;
      const [word = '', ...mods] = chain.split('.');
      const each = mods.some((x) => CURRIED.has(x));
      const expands = mods.some((x) => EXPANDING.has(x));
      const taggedEach = each && src[skipGap(src, i)] === '`';
      if (prev !== '.' && (src[skipGap(src, i)] === '(' || taggedEach)) {
        if (word === 'describe' && (mods.includes('skip') || mods.includes('todo'))) {
          nextParenSkips = true;
        }
        if (CASE_WORDS.has(word) && mods.every((x) => CASE_MODIFIERS.has(x))) {
          const open = skipGap(src, i);
          const nameCall = each ? skipGap(src, taggedEach ? skipTemplate(src, open) : skipCall(src, open)) : open;
          const name = src[nameCall] === '(' ? nameAt(src, skipGap(src, nameCall + 1)) : null;
          const tags = tagsOf(name?.text ?? '');
          cases.push({
            file,
            name: name?.text ?? '',
            line: lineAt(start),
            skipped: word.startsWith('x') || mods.includes('skip') || mods.includes('todo') || parens.includes(true),
            tags,
            dynamic: tags.length === 0 && (name === null || name.built || expands),
            body: collapse(src.slice(start, src[nameCall] === '(' ? skipCall(src, nameCall) : nameCall)),
          });
        }
      }
      prev = 'a';
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    else if (c === '\n' && prev === '\n') prev = '\n';
    i += 1;
  }
  return cases;
}

/** Cases of a pytest file: module-level or class-level `def test_*`. */
export function scanPytestCases(file: string, src: string): TestCase[] {
  const cases: TestCase[] = [];
  const lines = src.split('\n');
  const scopes: { indent: number; isClass: boolean }[] = [];
  let decorators: string[] = [];
  let triple: string | null = null;
  for (let n = 0; n < lines.length; n += 1) {
    const raw = lines[n] as string;
    if (triple) {
      if (raw.includes(triple)) triple = null;
      continue;
    }
    const text = raw.trim();
    if (text === '') continue;
    const indent = raw.length - raw.trimStart().length;
    while (scopes.length > 0 && (scopes[scopes.length - 1] as { indent: number }).indent >= indent) scopes.pop();
    if (text.startsWith('#')) continue;
    if (text.startsWith('@')) {
      let deco = text;
      let open = (deco.match(/\(/g) ?? []).length - (deco.match(/\)/g) ?? []).length;
      while (open > 0 && n + 1 < lines.length) {
        n += 1;
        deco += ` ${(lines[n] as string).trim()}`;
        open = (deco.match(/\(/g) ?? []).length - (deco.match(/\)/g) ?? []).length;
      }
      decorators.push(deco);
      continue;
    }
    const def = /^(?:async\s+)?def\s+(\w+)\s*\(/.exec(text);
    const cls = /^class\s+\w+/.test(text);
    if (def) {
      const name = def[1] as string;
      if (name.startsWith('test_') && scopes.every((s) => s.isClass)) {
        const tags: string[] = [];
        for (const d of decorators) {
          if (!d.startsWith('@pytest.mark.criterion')) continue;
          for (const m of d.matchAll(/["']([^"']+)["']/g)) tags.push(m[1] as string);
        }
        let last = n + 1;
        while (last < lines.length) {
          const next = lines[last] as string;
          if (next.trim() !== '' && next.length - next.trimStart().length <= indent) break;
          last += 1;
        }
        cases.push({
          file,
          name,
          line: n + 1,
          skipped: decorators.some((d) => /^@pytest\.mark\.skip(if)?\b/.test(d)),
          tags,
          body: collapse(lines.slice(n, last).join('\n')),
        });
      }
      scopes.push({ indent, isClass: false });
    } else if (cls) {
      scopes.push({ indent, isClass: true });
    } else {
      const t = /("""|''')/.exec(text);
      if (t && text.split(t[1] as string).length === 2) triple = t[1] as string;
    }
    decorators = [];
  }
  return cases;
}
