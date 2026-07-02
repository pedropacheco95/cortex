import { scan } from './scan.js';

export async function run(argv: string[]): Promise<number> {
  const full = argv.includes('--full');
  const args = argv.filter(a => !a.startsWith('--'));
  const target = args[0] ?? '.';

  try {
    const result = await scan(target, { full });
    console.log(`Cortex Anatomy Scanner`);
    console.log(`Root: ${result.root}`);
    console.log(`Files scanned: ${result.files.length}`);
    console.log(`Graph edges: ${result.graph.edges.length}`);
    console.log(`Layers: ${Object.keys(result.layers).join(', ')}`);
    return 0;
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    return 1;
  }
}

// Guard: only run CLI when invoked directly
const scriptUrl = import.meta.url;
const scriptPath = process.argv[1];
if (scriptPath && (scriptUrl.endsWith(scriptPath) || scriptUrl.endsWith(scriptPath.replace(/\\/g, '/')))) {
  run(process.argv.slice(2)).then(process.exit);
}
