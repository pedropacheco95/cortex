import * as fs from 'fs';
import * as path from 'path';
import type { Violation } from '../types.js';
import { REGISTRY_FILE, parseRegistry, filesOnDisk, kindOfId, type IdKind } from '../../compass/registry.js';

/**
 * check.id-registry — schema Appendix A (3.4 fifth revision; §4.1, §4.2,
 * §10.4; spec schema.id-registry Rule 5). `compass/registry.md` against the
 * `R-*.md` / `B-*.md` files in `compass/rules/` and `compass/bugs/`:
 *   - registry absent while at least one rule or bug file exists → one
 *     warning naming `cortex sync` (the migration); nothing at all → silent;
 *   - a line that is neither blank, a `#` comment nor `<id> <slug>` → error
 *     with the line number;
 *   - the same id on two lines → error naming both line numbers;
 *   - a file whose id is on no line → error naming the file and
 *     `cortex id next <kind>` (the collision this check exists to catch);
 *   - a line whose id has no file → warning (another branch, or reserved);
 *   - a line out of ascending order within its kind, or a rule line below a
 *     bug line → warning (hand-edited; nothing wrong yet).
 * Read-only. The slug is never compared to the filename (it is informational).
 */
const CHECK = 'check.id-registry';
const CLAUSE: Record<IdKind, string> = { rule: '§4.1', bug: '§4.2' };

function clauseFor(id: string): string {
  return id.startsWith('B') ? CLAUSE.bug : CLAUSE.rule;
}

export function checkIdRegistry(root: string): Violation[] {
  const violations: Violation[] = [];
  const registryAbs = path.join(root, REGISTRY_FILE);
  const rules = filesOnDisk(root, 'rule');
  const bugs = filesOnDisk(root, 'bug');
  const files = [...rules, ...bugs];

  let text: string;
  try {
    text = fs.readFileSync(registryAbs, 'utf-8');
  } catch {
    if (files.length > 0) {
      violations.push({
        severity: 'warning',
        check: CHECK,
        clause: '§10.4',
        location: { path: registryAbs },
        message: `compass/registry.md is absent while ${files.length} rule/bug file(s) exist; run \`cortex sync\` to create it from the files on disk (schema §10.4)`,
      });
    }
    return violations;
  }

  const parsed = parseRegistry(text);

  for (const m of parsed.malformed) {
    violations.push({
      severity: 'error',
      check: CHECK,
      clause: clauseFor(m.text.trim()),
      location: { path: registryAbs, line: m.line },
      message: `registry line ${m.line} is malformed: "${m.text}" (expected \`<id> <slug>\`, e.g. R-001 core-no-llm-calls)`,
    });
  }

  for (const d of parsed.duplicates) {
    violations.push({
      severity: 'error',
      check: CHECK,
      clause: clauseFor(d.id),
      location: { path: registryAbs, line: d.lines[0] },
      message: `${d.id} is registered ${d.lines.length} times (lines ${d.lines.join(' and ')}); an id is issued once`,
    });
  }

  const registered = new Set(parsed.lines.map((l) => l.id));
  for (const f of files) {
    if (registered.has(f.id)) continue;
    const kind = kindOfId(f.id) ?? 'rule';
    violations.push({
      severity: 'error',
      check: CHECK,
      clause: CLAUSE[kind],
      location: { path: f.file },
      message: `${f.id} (${path.relative(root, f.file)}) is not in compass/registry.md; allocate ids with \`cortex id next ${kind}\` and append its line`,
    });
  }

  const onDisk = new Set(files.map((f) => f.id));
  const seenIds = new Set<string>();
  let lastNumber: Record<IdKind, number> = { rule: 0, bug: 0 };
  let bugSeen = false;
  for (const l of parsed.lines) {
    const kind = kindOfId(l.id) ?? 'rule';
    if (!onDisk.has(l.id)) {
      violations.push({
        severity: 'warning',
        check: CHECK,
        clause: CLAUSE[kind],
        location: { path: registryAbs, line: l.line },
        message: `${l.id} is registered (line ${l.line}) but no ${kind} file carries it — reserved, or on another branch`,
      });
    }
    const n = parseInt(l.id.slice(2), 10);
    if (kind === 'bug') bugSeen = true;
    if (kind === 'rule' && bugSeen) {
      violations.push({
        severity: 'warning',
        check: CHECK,
        clause: CLAUSE.rule,
        location: { path: registryAbs, line: l.line },
        message: `${l.id} (line ${l.line}) is a rule line below a bug line; rules precede bugs`,
      });
    } else if (!seenIds.has(l.id) && n < lastNumber[kind]) {
      violations.push({
        severity: 'warning',
        check: CHECK,
        clause: CLAUSE[kind],
        location: { path: registryAbs, line: l.line },
        message: `${l.id} (line ${l.line}) is out of ascending order within its kind`,
      });
    }
    seenIds.add(l.id);
    lastNumber = { ...lastNumber, [kind]: Math.max(lastNumber[kind], n) };
  }

  return violations;
}
