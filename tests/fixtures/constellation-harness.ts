/**
 * Shared fixtures for the constellation.compiler tests. Builds handcrafted
 * knowledge surfaces (files.md, layers.md, rules, bugs, atlas artefacts, the
 * two spec trees, scenario specs) inside sandboxed tmp projects and reads the
 * compiled `.cortex/constellation.json` back for JSON-property assertions.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Constellation } from '../../src/constellation/compile.js';

export { makeTmpDir, cleanTmp, makeCortexProject, writeRule, writeFilesMd } from './hooks-harness.js';

/** One well-formed files.md data row (schema §4.1 column order). */
export function filesRow(relPath: string, tokens: number, specLinks = '-'): string {
  return `| ${relPath} | Fixture purpose for ${relPath}. | ${tokens} | ${'a'.repeat(64)} | 2026-06-30T14:00:00.000Z | ${specLinks} | false | scanner-llm |`;
}

/** layers.md: an H2 per layer with `- path` bullets (schema §4.1). */
export function writeLayersMd(root: string, layers: Record<string, string[]>): string {
  const p = path.join(root, '.cortex', 'anatomy', 'layers.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const sections = Object.entries(layers).map(
    ([layer, files]) => `## ${layer}\n\n${files.map((f) => `- ${f}`).join('\n')}`,
  );
  fs.writeFileSync(p, sections.join('\n\n') + '\n', 'utf-8');
  return p;
}

function writeArtefact(absPath: string, frontmatter: string, body: string): string {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, `---\n${frontmatter.trim()}\n---\n\n${body}`, 'utf-8');
  return absPath;
}

/** Dev spec at specs/<relPath> with raw frontmatter YAML lines. */
export function writeDevSpec(root: string, relPath: string, frontmatter: string, body = '# Spec\n'): string {
  return writeArtefact(path.join(root, 'specs', relPath), frontmatter, body);
}

/** Business spec at specs-business/<relPath> with raw frontmatter YAML lines. */
export function writeBizSpec(root: string, relPath: string, frontmatter: string, body = '# Outcome\n'): string {
  return writeArtefact(path.join(root, 'specs-business', relPath), frontmatter, body);
}

/** Bug ledger entry at .cortex/cerebrum/bugs/<filename>. */
export function writeBug(root: string, filename: string, frontmatter: string, body = '# Bug\n'): string {
  return writeArtefact(path.join(root, '.cortex', 'cerebrum', 'bugs', filename), frontmatter, body);
}

/** Atlas artefact at .cortex/atlas/<relPath>. */
export function writeAtlas(root: string, relPath: string, frontmatter: string, body = '# Artefact\n'): string {
  return writeArtefact(path.join(root, '.cortex', 'atlas', relPath), frontmatter, body);
}

/** Cerebrum core file (preferences.md, environment.md, …). */
export function writeCerebrumCoreFile(root: string, filename: string): string {
  const p = path.join(root, '.cortex', 'cerebrum', filename);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `# ${filename}\n\nFixture content.\n`, 'utf-8');
  return p;
}

/** Scenario test spec at tests/scenario/specs/<name>.md with a covers: list. */
export function writeScenarioSpec(root: string, name: string, covers: string[]): string {
  const fm = `name: ${name}\ncovers:\n${covers.map((c) => `  - ${c}`).join('\n')}`;
  return writeArtefact(path.join(root, 'tests', 'scenario', 'specs', `${name}.md`), fm, '# Scenario\n');
}

export function constellationPath(root: string): string {
  return path.join(root, '.cortex', 'constellation.json');
}

export function readConstellation(root: string): Constellation {
  return JSON.parse(fs.readFileSync(constellationPath(root), 'utf-8')) as Constellation;
}

/** The file bytes with the `generated` line removed (determinism assertions). */
export function withoutGeneratedLine(content: string): string {
  return content
    .split('\n')
    .filter((l) => !/^\s*"generated":/.test(l))
    .join('\n');
}
