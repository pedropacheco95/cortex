import { Parser, Language } from 'web-tree-sitter';
import type { Node } from 'web-tree-sitter';
import { createRequire } from 'module';
import * as path from 'path';
import * as fs from 'fs';

const _require = createRequire(import.meta.url);
const wasmDir = path.join(
  path.dirname(_require.resolve('tree-sitter-wasms/package.json')),
  'out'
);

let _initPromise: Promise<void> | null = null;
const _parserCache = new Map<string, Parser>();

const EXT_TO_GRAMMAR: Record<string, string> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
};

async function ensureInit(): Promise<void> {
  if (!_initPromise) {
    _initPromise = Parser.init();
  }
  await _initPromise;
}

async function getParser(grammarName: string): Promise<Parser> {
  await ensureInit();
  const cached = _parserCache.get(grammarName);
  if (cached) return cached;

  const wasmPath = path.join(wasmDir, `tree-sitter-${grammarName}.wasm`);
  const wasmData = fs.readFileSync(wasmPath);
  const lang = await Language.load(wasmData);
  const parser = new Parser();
  parser.setLanguage(lang);
  _parserCache.set(grammarName, parser);
  return parser;
}

function getChildren(node: Node): Node[] {
  const children: Node[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) children.push(child);
  }
  return children;
}

function parseFirstSentence(text: string, maxLen = 120): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const firstLine = trimmed.split('\n').map(l => l.trim()).find(l => l.length > 0) ?? '';
  if (!firstLine) return '';
  const dotIdx = firstLine.indexOf('.');
  const result = dotIdx !== -1 ? firstLine.slice(0, dotIdx + 1) : firstLine;
  return result.length > maxLen ? result.slice(0, maxLen) : result;
}

function parseJSDoc(text: string): string | null {
  const cleaned = text
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .replace(/^\s*\*\s?/gm, '')
    .trim();
  const result = parseFirstSentence(cleaned);
  return result || null;
}

const TS_DECL_TYPES = new Set([
  'export_statement',
  'function_declaration',
  'class_declaration',
  'lexical_declaration',
]);

function extractTSPurpose(children: Node[]): string | null {
  const nodes = children.filter(n => n.type.trim().length > 0);
  if (nodes.length === 0) return null;

  const first = nodes[0];
  // Case 1: first node is a JSDoc block comment
  if (first && first.type === 'comment' && first.text.startsWith('/**')) {
    return parseJSDoc(first.text);
  }

  // Case 2: JSDoc immediately preceding the first declaration/export
  const firstDeclIdx = nodes.findIndex(n => TS_DECL_TYPES.has(n.type));
  if (firstDeclIdx > 0) {
    const prev = nodes[firstDeclIdx - 1];
    if (prev && prev.type === 'comment' && prev.text.startsWith('/**')) {
      return parseJSDoc(prev.text);
    }
  }

  return null;
}

function extractPythonPurpose(children: Node[]): string | null {
  // Module docstring: first expression_statement whose child(0).type === 'string'
  for (const node of children) {
    if (node.type === 'expression_statement') {
      const child0 = node.child(0);
      if (child0?.type === 'string') {
        const raw = child0.text;
        // Strip triple quotes
        const cleaned = raw.replace(/^("""|''')/, '').replace(/("""|''')$/, '').trim();
        return parseFirstSentence(cleaned) || null;
      }
      return null;
    } else if (
      node.type === 'import_statement' ||
      node.type === 'import_from_statement' ||
      node.type === 'function_definition' ||
      node.type === 'class_definition'
    ) {
      return null;
    }
  }
  return null;
}

function extractRustPurpose(children: Node[]): string | null {
  // Leading //! module-level doc comments
  const first = children[0];
  if (first && first.type === 'line_comment' && first.text.startsWith('//!')) {
    const lines: string[] = [];
    for (const node of children) {
      if (node.type === 'line_comment' && node.text.startsWith('//!')) {
        lines.push(node.text.replace(/^\/\/!\s?/, '').trim());
      } else {
        break;
      }
    }
    return parseFirstSentence(lines.join('\n')) || null;
  }

  // /// doc comment immediately above first item
  const firstItemIdx = children.findIndex(
    n => n.type !== 'line_comment' && n.type !== 'block_comment' &&
         n.type !== 'attribute_item' && n.type !== 'inner_attribute_item'
  );
  if (firstItemIdx > 0) {
    const prev = children[firstItemIdx - 1];
    if (prev && prev.type === 'line_comment' && prev.text.startsWith('///')) {
      return parseFirstSentence(prev.text.replace(/^\/\/\/\s?/, '').trim()) || null;
    }
  }

  return null;
}

function extractGoPurpose(children: Node[]): string | null {
  // Find package_clause or first top-level declaration
  const targetIdx = (() => {
    const pkgIdx = children.findIndex(n => n.type === 'package_clause');
    if (pkgIdx >= 0) return pkgIdx;
    return children.findIndex(
      n => n.type === 'function_declaration' ||
           n.type === 'type_declaration' ||
           n.type === 'method_declaration'
    );
  })();

  if (targetIdx <= 0) return null;

  // Collect consecutive // comments immediately before the target
  const commentLines: string[] = [];
  let i = targetIdx - 1;
  while (i >= 0) {
    const node = children[i];
    if (node && node.type === 'comment' && node.text.startsWith('//')) {
      commentLines.unshift(node.text.replace(/^\/\/\s?/, '').trim());
      i--;
    } else {
      break;
    }
  }

  if (commentLines.length === 0) return null;
  const firstLine = commentLines.find(l => l.length > 0) ?? '';
  return firstLine ? parseFirstSentence(firstLine) : null;
}

function extractTSImports(children: Node[]): string[] {
  const imports: string[] = [];
  for (const node of children) {
    if (node.type === 'import_statement') {
      const source = node.childForFieldName('source');
      if (source) {
        imports.push(source.text.replace(/^["']|["']$/g, ''));
      }
    }
  }
  return imports;
}

function extractTSDefinitions(children: Node[]): string[] {
  const defs: string[] = [];
  for (const node of children) {
    if (node.type === 'export_statement') {
      const decl = node.childForFieldName('declaration');
      if (decl) {
        const name = decl.childForFieldName('name');
        if (name) defs.push(name.text);
      }
    } else if (
      node.type === 'function_declaration' ||
      node.type === 'class_declaration' ||
      node.type === 'lexical_declaration'
    ) {
      const name = node.childForFieldName('name');
      if (name) defs.push(name.text);
    }
  }
  return defs;
}

function extractPythonImports(children: Node[]): string[] {
  const imports: string[] = [];
  for (const node of children) {
    if (node.type === 'import_statement' || node.type === 'import_from_statement') {
      imports.push(node.text.split('\n')[0]?.trim() ?? node.text);
    }
  }
  return imports;
}

function extractPythonDefinitions(children: Node[]): string[] {
  const defs: string[] = [];
  for (const node of children) {
    if (node.type === 'function_definition' || node.type === 'class_definition') {
      const name = node.childForFieldName('name');
      if (name) defs.push(name.text);
    }
  }
  return defs;
}

function extractRustImports(children: Node[]): string[] {
  const imports: string[] = [];
  for (const node of children) {
    if (node.type === 'use_declaration') {
      imports.push(node.text.split('\n')[0]?.trim() ?? node.text);
    }
  }
  return imports;
}

function extractRustDefinitions(children: Node[]): string[] {
  const defs: string[] = [];
  for (const node of children) {
    if (
      node.type === 'function_item' ||
      node.type === 'struct_item' ||
      node.type === 'mod_item' ||
      node.type === 'impl_item' ||
      node.type === 'enum_item' ||
      node.type === 'trait_item'
    ) {
      const name = node.childForFieldName('name');
      if (name) defs.push(name.text);
    }
  }
  return defs;
}

function extractGoImports(children: Node[]): string[] {
  const imports: string[] = [];
  for (const node of children) {
    if (node.type === 'import_declaration') {
      imports.push(node.text.split('\n')[0]?.trim() ?? node.text);
    }
  }
  return imports;
}

function extractGoDefinitions(children: Node[]): string[] {
  const defs: string[] = [];
  for (const node of children) {
    if (node.type === 'function_declaration' || node.type === 'method_declaration') {
      const name = node.childForFieldName('name');
      if (name) defs.push(name.text);
    } else if (node.type === 'type_declaration') {
      // type_declaration → type_spec → name
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child?.type === 'type_spec') {
          const name = child.childForFieldName('name');
          if (name) defs.push(name.text);
        }
      }
    }
  }
  return defs;
}

export interface ExtractResult {
  definitions: string[];
  imports: string[];
  purpose: string | null;
}

export async function extract(ext: string, source: string): Promise<ExtractResult> {
  const grammarName = EXT_TO_GRAMMAR[ext];
  if (!grammarName) {
    return { definitions: [], imports: [], purpose: null };
  }

  try {
    const parser = await getParser(grammarName);
    const tree = parser.parse(source);
    if (!tree) return { definitions: [], imports: [], purpose: null };

    const root = tree.rootNode;
    const children = getChildren(root);

    let definitions: string[] = [];
    let imports: string[] = [];
    let purpose: string | null = null;

    if (grammarName === 'typescript' || grammarName === 'tsx' || grammarName === 'javascript') {
      purpose = extractTSPurpose(children);
      imports = extractTSImports(children);
      definitions = extractTSDefinitions(children);
    } else if (grammarName === 'python') {
      purpose = extractPythonPurpose(children);
      imports = extractPythonImports(children);
      definitions = extractPythonDefinitions(children);
    } else if (grammarName === 'rust') {
      purpose = extractRustPurpose(children);
      imports = extractRustImports(children);
      definitions = extractRustDefinitions(children);
    } else if (grammarName === 'go') {
      purpose = extractGoPurpose(children);
      imports = extractGoImports(children);
      definitions = extractGoDefinitions(children);
    }

    return { definitions, imports, purpose };
  } catch {
    return { definitions: [], imports: [], purpose: null };
  }
}
