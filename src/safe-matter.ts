import { createRequire } from 'module';

/**
 * gray-matter's default engines include an `eval` for `---js` frontmatter, so
 * reading a spec could run code from it. Importing this module removes every
 * engine but YAML and JSON: such a block then fails to parse like any other.
 */
const engines = createRequire(import.meta.url)('gray-matter/lib/engines.js') as Record<string, unknown>;
for (const name of Object.keys(engines)) {
  if (name !== 'yaml' && name !== 'json') delete engines[name];
}
