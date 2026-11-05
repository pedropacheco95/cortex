/**
 * `cortex specs view` (specflow.viewer): one self-contained HTML page of the
 * promises and the specs, with the index's tags and `unverified` marks.
 * Deterministic and offline: same tree, same bytes, nothing fetched.
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { type SpecflowConfig, buildModel, readConfig } from '../model/model.js';
import { workTree } from '../model/tree.js';
import type { SpecsIO } from '../index.js';
import { buildPayload } from './payload.js';

const DEFAULT_OUT = 'specs.html';
const TEMPLATE = new URL('../../../assets/viewer-template.html', import.meta.url);

function htmlEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** JSON safe inside a script element: no `</script>`, no `<!--`, no line separators. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/<\//g, '<\\/')
    .replace(/<!--/g, '<\\u0021--')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Rule 9: keep the default output out of git. Never fails the command. */
function excludeOutput(root: string, out: string): void {
  try {
    const git = (...args: string[]): string | null => {
      const r = spawnSync('git', args, { cwd: root, encoding: 'utf-8' });
      return r.status === 0 ? r.stdout.trim() : null;
    };
    const top = git('rev-parse', '--show-toplevel');
    const gitPath = git('rev-parse', '--git-path', 'info/exclude');
    if (top === null || gitPath === null) return;
    const rel = path.relative(fs.realpathSync(top), path.join(fs.realpathSync(root), path.basename(out)));
    const line = `/${rel.split(path.sep).join('/')}`;
    const file = path.resolve(root, gitPath);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
    if (current.split('\n').includes(line)) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${current === '' || current.endsWith('\n') ? '' : '\n'}${line}\n`);
  } catch {
    // no git, or a read-only .git: the page is still written
  }
}

export function specsView(args: string[], root = '.', io: SpecsIO = {}): number {
  const stdout = io.stdout ?? ((l: string) => console.log(l));
  const stderr = io.stderr ?? ((l: string) => console.error(l));
  let out: string | undefined;
  let title: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg !== '--out' && arg !== '--title') {
      stderr(`specflow: unknown argument ${arg}`);
      return 2;
    }
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) {
      stderr(`specflow: ${arg} needs a value`);
      return 2;
    }
    if (arg === '--out') out = value;
    else title = value;
    i += 1;
  }
  if (!fs.existsSync(path.join(root, 'specflow'))) {
    stderr('specflow: no specflow/ folder here');
    return 1;
  }

  const tree = workTree(root);
  let config: SpecflowConfig = {};
  try {
    config = readConfig(tree);
  } catch (err) {
    stderr(`specflow: warning: cortex/cortex.json does not parse (${(err as Error).message}); no tests were read`);
  }
  if ((config.tests ?? []).length === 0) {
    stderr('specflow: warning: specflow.tests is not set; no tests were read');
  }
  const model = buildModel(tree, config);
  const heading = title ?? path.basename(path.resolve(root));
  const payload = buildPayload(tree, model, heading, stderr);

  const template = fs.readFileSync(TEMPLATE, 'utf-8');
  const html = template
    .split('<!--__TITLE__-->')
    .join(htmlEscape(heading))
    .replace('/*__SPEC_DATA__*/ null', () => scriptJson(payload));

  const target = path.resolve(root, out ?? DEFAULT_OUT);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
  if (out === undefined) excludeOutput(root, DEFAULT_OUT);

  const n = payload.counts;
  stdout(`specs view: wrote ${target} · ${n['specs']} specs · ${n['criteria']} criteria · ${n['unverified']} unverified`);
  return 0;
}
