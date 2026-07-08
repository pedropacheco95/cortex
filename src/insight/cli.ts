/**
 * The `cortex insight` command surface (spec insight.cli; cortex-schema.md
 * §4.10.8) — three deterministic, read-only subcommands over `.cortex/insight/`:
 *   file <path>        the rich per-file understanding entry (L3 or L2)
 *   concept <name>     files touching a concept + related concepts
 *   element <query>    an atomic element (plain name or path#name); reports
 *                      "no rich entry" for non-main-players, pointing at the
 *                      file entry
 * All support `--json` (stable, deterministically ordered — identical input +
 * args → byte-identical output). The scoped-vs-flat layout difference is
 * hidden by the engine (insight/query.ts). Exit codes: 0 on a found result
 * (including element's explicit "no rich entry" answer); 1 on a miss, an
 * absent insight module, a malformed artefact, or a retired/unknown verb.
 * Supersedes the v2 verbs `query | get | neighbors | list` (retired in v3 —
 * invoking one prints a pointed migration message). Deterministic Core
 * (RULES 3): the engine does the work; this layer only parses argv, renders,
 * and sets exit codes. Reads only `.cortex/insight/`; writes nothing.
 */
import {
  fileQuery,
  conceptQuery,
  elementQuery,
  InsightArtefactError,
  type FileQueryResult,
  type ConceptQueryResult,
  type ElementQueryResult,
  type ElementMatch,
} from './query.js';

const V3_VERBS = 'file | concept | element';
const RETIRED_VERBS = new Set(['query', 'get', 'neighbors', 'list']);

/** First non-flag argument after the subcommand (the path / name / query). */
function firstPositional(argv: string[]): string | undefined {
  return argv.find((a) => !a.startsWith('-'));
}

// ---------------------------------------------------------------------------
// Human-readable renderers.
// ---------------------------------------------------------------------------

function renderFile(r: FileQueryResult): string {
  const fm = r.entry!.frontmatter;
  const lines: string[] = [];
  lines.push(`${r.path} — L${fm.extraction_level} entry (centrality ${fm.centrality}, ${fm.size_lines} lines)`);
  lines.push(`entry: ${r.entryFile}${r.scope ? ` (scope ${r.scope})` : ''}`);
  lines.push('');
  for (const [title, content] of Object.entries(r.sections ?? {})) {
    lines.push(`## ${title}`);
    lines.push('');
    lines.push(content);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function renderConcept(r: ConceptQueryResult): string {
  const lines: string[] = [];
  const from = r.source === 'global' ? 'global' : r.source ? `scope ${r.source}` : 'graph only (no concept doc)';
  lines.push(`concept: ${r.slug} — ${from}`);
  if (r.doc !== undefined) {
    lines.push('');
    lines.push(r.doc.trimEnd());
  }
  lines.push('');
  lines.push('Files touching this concept:');
  if (!r.files || r.files.length === 0) lines.push('  (none in the graph)');
  else for (const f of r.files) lines.push(`  ${f.path} — ${f.edge_type}: ${f.evidence}`);
  lines.push('Related concepts:');
  if (!r.related || r.related.length === 0) lines.push('  (none in the graph)');
  else for (const c of r.related) lines.push(`  ${c.slug} — ${c.edge_type}: ${c.evidence}`);
  return lines.join('\n');
}

function renderElementMatch(m: ElementMatch): string {
  const lines: string[] = [];
  if (m.rich) {
    lines.push(`${m.name} — ${m.file}`);
    lines.push(m.description ?? '');
  } else {
    lines.push(`${m.name} — ${m.file}`);
    lines.push(
      `  no rich entry: not identified as a main player during extraction. ` +
        `See \`cortex insight file ${m.file}\` for the file's entry.`,
    );
  }
  if (m.connections.length > 0) {
    lines.push('  Connections:');
    for (const c of m.connections) {
      const arrow = c.direction === 'out' ? '->' : '<-';
      lines.push(`    ${arrow} ${c.other} [${c.edge_type}, ${c.confidence}] ${c.evidence}`);
    }
  }
  if (m.pointers !== undefined && m.pointers !== '') {
    lines.push('  Query pointers:');
    for (const line of m.pointers.split('\n')) lines.push(`    ${line}`);
  }
  return lines.join('\n');
}

function renderElement(r: ElementQueryResult): string {
  return (r.matches ?? []).map(renderElementMatch).join('\n\n');
}

// ---------------------------------------------------------------------------
// JSON payloads — stable field order, engine-sorted arrays (§4.10.8 `--json`).
// ---------------------------------------------------------------------------

function fileJson(r: FileQueryResult): unknown {
  return {
    command: 'file',
    found: true,
    path: r.path,
    entry_file: r.entryFile,
    scope: r.scope ?? null,
    frontmatter: {
      path: r.entry!.frontmatter.path,
      extracted_at: r.entry!.frontmatter.extracted_at,
      extraction_level: r.entry!.frontmatter.extraction_level,
      size_lines: r.entry!.frontmatter.size_lines,
      size_tokens: r.entry!.frontmatter.size_tokens,
      centrality: r.entry!.frontmatter.centrality,
      built_at_commit: r.entry!.frontmatter.built_at_commit,
      source_sha256: r.entry!.frontmatter.source_sha256,
    },
    sections: r.sections ?? {},
  };
}

function conceptJson(r: ConceptQueryResult): unknown {
  return {
    command: 'concept',
    found: true,
    name: r.name,
    slug: r.slug,
    source: r.source ?? null,
    doc_file: r.docFile ?? null,
    doc: r.doc ?? null,
    files: r.files ?? [],
    related: r.related ?? [],
  };
}

function elementJson(r: ElementQueryResult): unknown {
  return {
    command: 'element',
    found: true,
    query: r.query,
    matches: (r.matches ?? []).map((m) => ({
      node: m.node,
      name: m.name,
      file: m.file,
      rich: m.rich,
      description: m.description ?? null,
      connections: m.connections,
      pointers: m.pointers ?? null,
    })),
  };
}

function missJson(command: string, key: string, value: string, error: string): unknown {
  return { command, found: false, [key]: value, error };
}

// ---------------------------------------------------------------------------
// Dispatch.
// ---------------------------------------------------------------------------

export async function insightCli(subcommand: string | undefined, argv: string[], root = '.'): Promise<number> {
  const json = argv.includes('--json');

  const miss = (command: string, key: string, value: string, error: string): number => {
    if (json) console.log(JSON.stringify(missJson(command, key, value, error), null, 2));
    else console.error(`cortex insight ${command}: ${error}`);
    return 1;
  };

  try {
    switch (subcommand) {
      case 'file': {
        const sourcePath = firstPositional(argv);
        if (sourcePath === undefined) {
          console.error('cortex insight file: a <path> is required.');
          return 1;
        }
        const result = fileQuery(root, sourcePath);
        if (!result.found) return miss('file', 'path', result.path, result.error ?? 'not found');
        if (json) console.log(JSON.stringify(fileJson(result), null, 2));
        else console.log(renderFile(result));
        return 0;
      }

      case 'concept': {
        const name = firstPositional(argv);
        if (name === undefined) {
          console.error('cortex insight concept: a <name> is required.');
          return 1;
        }
        const result = conceptQuery(root, name);
        if (!result.found) return miss('concept', 'name', result.name, result.error ?? 'not found');
        if (json) console.log(JSON.stringify(conceptJson(result), null, 2));
        else console.log(renderConcept(result));
        return 0;
      }

      case 'element': {
        const query = firstPositional(argv);
        if (query === undefined) {
          console.error('cortex insight element: a <query> is required (a name, or path#name).');
          return 1;
        }
        const result = elementQuery(root, query);
        if (!result.found) return miss('element', 'query', result.query, result.error ?? 'not found');
        if (json) console.log(JSON.stringify(elementJson(result), null, 2));
        else console.log(renderElement(result));
        return 0;
      }

      default: {
        if (subcommand !== undefined && RETIRED_VERBS.has(subcommand)) {
          console.error(
            `cortex insight ${subcommand}: retired in v3 — the v2 verbs query | get | neighbors | list ` +
              `no longer exist. Use ${V3_VERBS} (schema §4.10.8).`,
          );
          return 1;
        }
        console.error(`cortex insight: unknown subcommand ${subcommand ?? '(none)'} — expected ${V3_VERBS}.`);
        return 1;
      }
    }
  } catch (err) {
    if (err instanceof InsightArtefactError) {
      console.error(`cortex insight: ${err.message}`);
      return 1;
    }
    console.error(`cortex insight: ${(err as Error).message}`);
    return 1;
  }
}
