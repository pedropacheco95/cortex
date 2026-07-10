/**
 * PreWrite hook — PreToolUse on Write|Edit (spec hooks.pre-write).
 *
 * Rule 4 (revised per B-001) is two-stage: predicate-bearing rules (`check:`
 * of kind regex/grep) warn ONLY when the predicate fires on the proposed
 * content within their `applies_to` scope (default `governs`) — a governed
 * path whose content passes is a silent pass. Predicateless rules (`check`
 * absent, or kind `none`/`ast` — nothing the hook can evaluate) warn on
 * `governs` path match, the conservative fallback. Emits one schema §5
 * warning line per matching rule inside the pinned allow-envelope. Never
 * blocks: no `deny`, no `ask`, no `updatedInput`, never exit 2 (Rule 2).
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import picomatch from 'picomatch';
import { appendHookError } from './errors.js';
import type { HookRunResult, HookRunOptions } from './session-start.js';

const HOOK_NAME = 'pre-write';

function silent(): HookRunResult {
  return { exitCode: 0, stdout: '' };
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') return [value];
  return [];
}

/** First non-empty, non-heading body line → the §5 {{ONE_LINE_GUIDANCE}}. */
function guidanceLine(body: string): string {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || /^---+$/.test(trimmed)) continue;
    return trimmed.replace(/\s+/g, ' ').slice(0, 160);
  }
  return '';
}

function pathMatchesAny(globs: string[], relPath: string): boolean {
  return globs.some((glob) => {
    try {
      return picomatch(glob)(relPath);
    } catch {
      return false; // malformed glob never matches (check.rule owns flagging it)
    }
  });
}

export async function run(stdinJson: unknown, opts?: HookRunOptions): Promise<HookRunResult> {
  try {
    const stdin = (typeof stdinJson === 'object' && stdinJson !== null ? stdinJson : {}) as Record<
      string,
      unknown
    >;
    const root = path.resolve(
      typeof stdin['cwd'] === 'string' && stdin['cwd'] ? stdin['cwd'] : (opts?.cwd ?? process.cwd()),
    );
    const now = opts?.now ?? new Date();

    const toolInput = (stdin['tool_input'] ?? {}) as Record<string, unknown>;
    const filePath = toolInput['file_path'];
    if (typeof filePath !== 'string' || filePath.length === 0) return silent();

    // Rule 6: missing .cortex/ or empty rules/ → zero-overhead silence.
    const rulesDir = path.join(root, '.cortex', 'compass', 'rules');
    if (!fs.existsSync(rulesDir)) return silent();
    let ruleFiles: string[];
    try {
      ruleFiles = fs
        .readdirSync(rulesDir)
        .filter((f) => /^R-.*\.md$/.test(f))
        .sort();
    } catch {
      return silent();
    }
    if (ruleFiles.length === 0) return silent();

    // Rule 4: relativise the (absolute) target path against the project root.
    const relPath = path.relative(root, path.resolve(root, filePath)).replace(/\\/g, '/');

    // Proposed content: Write → `content`, Edit → `new_string` (Rule 4).
    const toolName = stdin['tool_name'];
    const proposedRaw = toolName === 'Edit' ? toolInput['new_string'] : toolInput['content'];
    const proposed = typeof proposedRaw === 'string' ? proposedRaw : '';

    const warnings: string[] = [];
    let malformedCount = 0;

    for (const ruleFile of ruleFiles) {
      const ruleRel = `.cortex/compass/rules/${ruleFile}`;
      let data: Record<string, unknown>;
      let body: string;
      try {
        const parsed = matter(fs.readFileSync(path.join(rulesDir, ruleFile), 'utf-8'));
        data = parsed.data as Record<string, unknown>;
        body = parsed.content;
        if (typeof data['id'] !== 'string' || data['id'].length === 0) {
          throw new Error('frontmatter has no `id`');
        }
      } catch (err) {
        // Rule 6: skip this rule, keep evaluating the others.
        malformedCount++;
        appendHookError(root, { hook: HOOK_NAME, file: ruleRel, failure: (err as Error).message }, now);
        continue;
      }

      // §4.2: status defaults to active; retired rules are skipped (Rule 4).
      if (data['status'] === 'retired') continue;

      const governs = toStringList(data['governs']);

      // Rule 4 (revised per B-001), two-stage: the warning decision depends on
      // whether the rule is mechanically checkable.
      const check = data['check'];
      const checkObj = check && typeof check === 'object' ? (check as Record<string, unknown>) : undefined;
      const kind = checkObj?.['kind'];
      const pattern = checkObj?.['pattern'];
      const evaluable = (kind === 'regex' || kind === 'grep') && typeof pattern === 'string';

      let warn = false;
      if (evaluable) {
        // Predicate-bearing rule: warn ONLY when the predicate fires on the
        // proposed content within its applies_to scope (default governs).
        // A governed path whose content passes is a SILENT pass — path match
        // alone never warns for these rules (B-001 resolution).
        const appliesTo = toStringList(checkObj?.['applies_to']);
        const scopeGlobs = appliesTo.length > 0 ? appliesTo : governs;
        if (pathMatchesAny(scopeGlobs, relPath)) {
          try {
            const matched = new RegExp(pattern as string).test(proposed);
            // `expect: absent` (the default): a match is the violation.
            warn = checkObj?.['expect'] === 'present' ? !matched : matched;
          } catch (err) {
            appendHookError(
              root,
              { hook: HOOK_NAME, file: ruleRel, failure: `check.pattern invalid: ${(err as Error).message}` },
              now,
            );
          }
        }
      } else {
        // Predicateless rule (`check` absent, kind none/ast, or no evaluable
        // pattern): the hook cannot verify content mechanically, so surfacing
        // the rule on a governs path match is the correct conservative
        // behaviour (ast content enforcement belongs to the test layer).
        warn = pathMatchesAny(governs, relPath);
      }

      if (!warn) continue;

      // Warning line per schema §5 — ID + title + source so the warning can be
      // challenged, not just obeyed (Rule 5).
      const id = data['id'] as string;
      const title = typeof data['title'] === 'string' && data['title'] ? data['title'] : '(untitled rule)';
      const sources = toStringList(data['source']);
      const sourceCell = sources.length > 0 ? sources.join(', ') : '(no source recorded)';
      const guidance = guidanceLine(body);
      warnings.push(
        `⚠ Cortex ${id} may apply to ${relPath}: ${title}.\n  Source: ${sourceCell}.${guidance ? ` ${guidance}` : ''}`,
      );
    }

    // Rule 3: no matching rule → exit 0, empty stdout — the common case.
    if (warnings.length === 0) return silent();

    // Rule 6: degradation line rides along only when other output is emitted.
    if (malformedCount > 0) {
      warnings.push(
        `⚠ Cortex: ${malformedCount} rule file(s) could not be parsed and were skipped — see .cortex/pulse/reports/hook-errors.md.`,
      );
    }

    return {
      exitCode: 0,
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          additionalContext: warnings.join('\n'),
        },
      }),
    };
  } catch (err) {
    // Warn-never-block, self-applied: any internal crash degrades to silence.
    try {
      appendHookError(path.resolve(opts?.cwd ?? process.cwd()), {
        hook: HOOK_NAME,
        file: '(unknown)',
        failure: (err as Error).message,
      });
    } catch {
      /* swallowed */
    }
    return silent();
  }
}
