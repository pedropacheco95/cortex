/**
 * `cortex specs index` (specflow.index): writes `specflow/INDEX.md` from the
 * working tree, or with `--staged` from the git index, or prints the model.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { buildModel, readConfig } from './model/model.js';
import { modelJson, renderIndex } from './model/render.js';
import { type Tree, gitTree, workTree } from './model/tree.js';

const INDEX_FILE = 'specflow/INDEX.md';

export interface SpecsIO {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export function specsIndex(args: string[], root = '.', io: SpecsIO = {}): number {
  const stdout = io.stdout ?? ((l: string) => console.log(l));
  const stderr = io.stderr ?? ((l: string) => console.error(l));
  const unknown = args.find((a) => a !== '--staged' && a !== '--json');
  if (unknown !== undefined) {
    stderr(`specflow: unknown argument ${unknown}`);
    return 2;
  }
  if (!fs.existsSync(path.join(root, 'specflow'))) {
    stderr('specflow: no specflow/ folder here');
    return 1;
  }
  const staged = args.includes('--staged');
  const tree: Tree = staged ? gitTree(root, '') : workTree(root);
  const config = readConfig(tree);
  if ((config.tests ?? []).length === 0) {
    stderr('specflow: warning: specflow.tests is not set; no tests were read');
  }
  const model = buildModel(tree, config);
  if (args.includes('--json')) {
    stdout(JSON.stringify(modelJson(model), null, 2));
    return 0;
  }
  const text = renderIndex(model);
  if (staged) {
    if (tree.read(INDEX_FILE) === text) return 0;
    fs.writeFileSync(path.join(root, INDEX_FILE), text);
    execFileSync('git', ['add', INDEX_FILE], { cwd: root });
    return 0;
  }
  fs.writeFileSync(path.join(root, INDEX_FILE), text);
  return 0;
}
