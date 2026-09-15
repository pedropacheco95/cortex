/**
 * Atomic tests — schema.bears-on Rules 1–3 (schema §6): shape classification,
 * resolution by kind through the project index / insight layouts / clause
 * index / project tree, and the fixed severity table. Sandboxed tmp roots.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  GATED_KINDS,
  classifyRef,
  normalisePathRef,
  refSeverity,
  resolveRef,
  type RefKind,
} from '../../../src/schema/refs.js';
import { buildIndex, type ProjectIndex } from '../../../src/schema/index-build.js';
import { loadClauseIndex, type ClauseIndex } from '../../../src/schema/clauses.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/hooks-harness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`refs-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function write(root: string, rel: string, body: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf-8');
  return abs;
}

function artefact(id: string, extra = ''): string {
  return `---\nid: ${id}\ntitle: ${id}\n${extra}---\n\n# ${id}\n`;
}

/** The AC project: one of every gated kind, both insight layouts, a file, a directory, a schema doc. */
async function acProject(): Promise<{ root: string; index: ProjectIndex; clauses: ClauseIndex }> {
  const root = tmp('ac');
  write(root, '.cortex/cortex.config.json', JSON.stringify({ schemaVersion: '3.4' }));
  write(root, '.cortex/compass/rules/R-001-core-no-llm-calls.md', artefact('R-001'));
  write(root, '.cortex/compass/bugs/B-014-version-lag.md', artefact('B-014'));
  write(root, '.cortex/atlas/domain/insight.md', artefact('domain.insight', 'term: insight\ndefinition: x\n'));
  write(root, '.cortex/atlas/decisions/2026-09-15-x.md', artefact('decision.2026-09-15-x', 'date: 2026-09-15T00:00:00Z\n'));
  write(root, '.specflow/specs/pulse/usage.spec.md', artefact('pulse.usage', 'status: implemented\n'));
  write(
    root,
    '.specflow/specs-business/schema/contributor-trusts-project-knowledge.business.md',
    artefact('schema.contributor-trusts-project-knowledge'),
  );
  write(root, '.cortex/insight/concepts/hook-safety.md', '# hook-safety\n');
  write(root, '.cortex/insight/scopes/cli/concepts/verb-dispatch.md', '# verb-dispatch\n');
  write(root, 'src/pulse/usage.ts', 'export {};\n');
  fs.mkdirSync(path.join(root, 'src', 'hooks'), { recursive: true });
  write(root, 'cortex-schema.md', '## 5. Hooks\n\n## 6. Cross-reference\n\n### 6.2 Clauses\n');
  const index = await buildIndex(root);
  const clauses = loadClauseIndex(root);
  return { root, index, clauses };
}

describe('AC: every shape classifies to exactly one kind (Rule 1)', () => {
  const table: [string, RefKind][] = [
    ['R-001', 'rule'],
    ['B-014', 'bug'],
    ['domain.insight', 'domain'],
    ['concept:hook-safety', 'concept'],
    ['schema:§5', 'clause'],
    ['src/pulse/usage.ts', 'path'],
    ['.cortex/compass/rules/R-001-core-no-llm-calls.md', 'path'],
    ['pulse.usage', 'id'],
  ];

  it.each(table)('%s → %s', (ref, kind) => {
    expect(classifyRef(ref)).toBe(kind);
  });

  it('the order matters only where shapes overlap: a path containing R-001 is a path; domain.x is not an id', () => {
    expect(classifyRef('src/R-001')).toBe('path');
    expect(classifyRef('./R-001')).toBe('path');
    expect(classifyRef('domain.x')).toBe('domain');
    expect(classifyRef('decision.2026-09-15-x')).toBe('id');
  });

  it('a malformed schema: string is not a clause — it falls through to id (the carrier reports it malformed)', () => {
    expect(classifyRef('schema:§ 5')).toBe('id');
    expect(classifyRef('schema:6')).toBe('id');
  });

  it('two-digit rule and bug numbers are not rule/bug shapes', () => {
    expect(classifyRef('R-01')).toBe('id');
    expect(classifyRef('B-1')).toBe('id');
  });

  it('the gated kinds are exactly rule, bug, domain and id', () => {
    expect([...GATED_KINDS].sort()).toEqual(['bug', 'domain', 'id', 'rule']);
  });
});

describe('AC: gated refs resolve through the project index (Rule 2)', () => {
  it('the five resolve with target equal to their file paths, and R-999 does not', async () => {
    const { root, index, clauses } = await acProject();
    const expected: [string, string][] = [
      ['R-001', '.cortex/compass/rules/R-001-core-no-llm-calls.md'],
      ['B-014', '.cortex/compass/bugs/B-014-version-lag.md'],
      ['domain.insight', '.cortex/atlas/domain/insight.md'],
      ['pulse.usage', '.specflow/specs/pulse/usage.spec.md'],
      [
        'schema.contributor-trusts-project-knowledge',
        '.specflow/specs-business/schema/contributor-trusts-project-knowledge.business.md',
      ],
    ];
    for (const [ref, target] of expected) {
      const r = resolveRef(root, index, clauses, ref);
      expect(r.resolved, ref).toBe(true);
      expect(r.target, ref).toBe(target);
    }
    const miss = resolveRef(root, index, clauses, 'R-999');
    expect(miss).toEqual({ kind: 'rule', resolved: false });
  });

  it('any indexed id resolves as kind id — a decision id included (Notes: the whole index, not just specs)', async () => {
    const { root, index, clauses } = await acProject();
    const r = resolveRef(root, index, clauses, 'decision.2026-09-15-x');
    expect(r.kind).toBe('id');
    expect(r.resolved).toBe(true);
    expect(r.target).toBe('.cortex/atlas/decisions/2026-09-15-x.md');
  });
});

describe('AC: a concept resolves from either insight layout (Rule 2)', () => {
  it('flat and scoped concepts resolve, a missing one does not', async () => {
    const { root, index, clauses } = await acProject();
    const flat = resolveRef(root, index, clauses, 'concept:hook-safety');
    expect(flat).toEqual({ kind: 'concept', resolved: true, target: '.cortex/insight/concepts/hook-safety.md' });
    const scoped = resolveRef(root, index, clauses, 'concept:verb-dispatch');
    expect(scoped).toEqual({ kind: 'concept', resolved: true, target: '.cortex/insight/scopes/cli/concepts/verb-dispatch.md' });
    expect(resolveRef(root, index, clauses, 'concept:missing')).toEqual({ kind: 'concept', resolved: false });
  });

  it('a project with no insight/ at all does not resolve and raises no exception', async () => {
    const root = tmp('no-insight');
    write(root, '.cortex/cortex.config.json', '{}');
    const index = await buildIndex(root);
    const clauses = loadClauseIndex(root);
    let r: ReturnType<typeof resolveRef> | undefined;
    expect(() => {
      r = resolveRef(root, index, clauses, 'concept:hook-safety');
    }).not.toThrow();
    expect(r).toEqual({ kind: 'concept', resolved: false });
  });
});

describe('AC: a clause resolves through the clause index (Rule 2)', () => {
  it('schema:§6.2 resolves and schema:§99 does not', async () => {
    const { root, index, clauses } = await acProject();
    expect(resolveRef(root, index, clauses, 'schema:§6.2')).toEqual({ kind: 'clause', resolved: true, target: '6.2' });
    expect(resolveRef(root, index, clauses, 'schema:§99')).toEqual({ kind: 'clause', resolved: false });
  });
});

describe('AC: a path resolves as a file or a directory, never outside the project (Rule 2)', () => {
  it('src/pulse/usage.ts and ./src/hooks/ resolve; src/gone.ts, ../etc/passwd and /etc/passwd do not', async () => {
    const { root, index, clauses } = await acProject();
    expect(resolveRef(root, index, clauses, 'src/pulse/usage.ts')).toEqual({ kind: 'path', resolved: true, target: 'src/pulse/usage.ts' });
    expect(resolveRef(root, index, clauses, './src/hooks/')).toEqual({ kind: 'path', resolved: true, target: 'src/hooks/' });
    expect(resolveRef(root, index, clauses, 'src/gone.ts')).toEqual({ kind: 'path', resolved: false });
    expect(resolveRef(root, index, clauses, '../etc/passwd')).toEqual({ kind: 'path', resolved: false });
    expect(resolveRef(root, index, clauses, '/etc/passwd')).toEqual({ kind: 'path', resolved: false });
  });

  it('a .. segment in the middle never resolves even when the walk would land inside the project', async () => {
    const { root, index, clauses } = await acProject();
    expect(resolveRef(root, index, clauses, 'src/hooks/../pulse/usage.ts').resolved).toBe(false);
  });

  it('normalisePathRef strips a leading ./ and turns backslashes into /', () => {
    expect(normalisePathRef('./src/hooks/')).toBe('src/hooks/');
    expect(normalisePathRef('src\\pulse\\usage.ts')).toBe('src/pulse/usage.ts');
    expect(normalisePathRef('.\\src\\x.ts')).toBe('src/x.ts');
    expect(normalisePathRef('src/x.ts')).toBe('src/x.ts');
  });
});

describe('Rule 3: severity by kind, fixed for every carrier', () => {
  it.each<[RefKind, 'error' | 'warning']>([
    ['rule', 'error'],
    ['bug', 'error'],
    ['domain', 'error'],
    ['id', 'error'],
    ['concept', 'warning'],
    ['clause', 'warning'],
    ['path', 'warning'],
  ])('%s → %s', (kind, severity) => {
    expect(refSeverity(kind)).toBe(severity);
  });
});
