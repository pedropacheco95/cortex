/**
 * Shared fixtures for the core-cli.init tests.
 * Every test gets a fresh tmp project dir and an injected fake home dir —
 * the real ~/.claude is NEVER touched.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';

let counter = 0;

export function makeTmpDir(label: string): string {
  const dir = path.join(os.tmpdir(), `cortex-init-${label}-${Date.now()}-${counter++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function cleanTmp(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function gitInit(dir: string): void {
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
}

/** Recursive snapshot: relative path → file content (for "nothing written" assertions). */
export function snapshotTree(dir: string): Map<string, string> {
  const snap = new Map<string, string>();
  if (!fs.existsSync(dir)) return snap;
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else snap.set(path.relative(dir, full), fs.readFileSync(full, 'utf-8'));
    }
  };
  walk(dir);
  return snap;
}

export function writeExecutable(filePath: string, script: string): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, script, 'utf-8');
  fs.chmodSync(filePath, 0o755);
  return filePath;
}

/** Rewrites every flagged files.md row (run from the project cwd). */
const REWRITE_ALL_JS =
  'const fs=require("fs");const p=".cortex/anatomy/files.md";if(fs.existsSync(p)){let s=fs.readFileSync(p,"utf8");s=s.split("\\n").map(function(l){if(l.startsWith("|")&&/ true \\| [^|]*\\|\\s*$/.test(l)){return l.replace("(needs purpose)","Filled by stub.").replace(/ true \\| [^|]*\\|\\s*$/," false | scanner-llm |");}return l;}).join("\\n");fs.writeFileSync(p,s);}';

/** Rewrites only the FIRST flagged row, then the stub dies mid-batch. */
const REWRITE_FIRST_JS =
  'const fs=require("fs");const p=".cortex/anatomy/files.md";if(fs.existsSync(p)){let done=false;let s=fs.readFileSync(p,"utf8");s=s.split("\\n").map(function(l){if(!done&&l.startsWith("|")&&/ true \\| [^|]*\\|\\s*$/.test(l)){done=true;return l.replace("(needs purpose)","Filled by stub.").replace(/ true \\| [^|]*\\|\\s*$/," false | scanner-llm |");}return l;}).join("\\n");fs.writeFileSync(p,s);}';

/** Stub claude: records its invocation + args, rewrites all flagged purposes, exits 0. */
export function recordingStub(binDir: string, recordFile: string): string {
  return writeExecutable(
    path.join(binDir, 'claude'),
    `#!/bin/sh
echo "INVOKED" >> "${recordFile}"
for a in "$@"; do printf 'ARG:%s\\n' "$a" >> "${recordFile}"; done
node -e '${REWRITE_ALL_JS}'
exit 0
`,
  );
}

/** Stub claude: reports an authentication failure. */
export function authFailStub(binDir: string): string {
  return writeExecutable(
    path.join(binDir, 'claude'),
    `#!/bin/sh
echo "Error: not logged in. Please run /login to authenticate." >&2
exit 1
`,
  );
}

/** Stub claude: hangs far past any configured test timeout. */
export function hangingStub(binDir: string): string {
  return writeExecutable(
    path.join(binDir, 'claude'),
    `#!/bin/sh
sleep 30
`,
  );
}

/** Stub claude: rewrites one row, then dies mid-batch with a non-auth error. */
export function midBatchStub(binDir: string, recordFile: string): string {
  return writeExecutable(
    path.join(binDir, 'claude'),
    `#!/bin/sh
echo "INVOKED" >> "${recordFile}"
node -e '${REWRITE_FIRST_JS}'
echo "boom: subprocess crashed mid-batch" >&2
exit 1
`,
  );
}

/** Parse .cortex/anatomy/files.md rows → [{path, purpose, flagged}]. */
export function readFilesMdRows(root: string): { path: string; purpose: string; flagged: boolean }[] {
  const filesPath = path.join(root, '.cortex', 'anatomy', 'files.md');
  if (!fs.existsSync(filesPath)) return [];
  const rows: { path: string; purpose: string; flagged: boolean }[] = [];
  for (const line of fs.readFileSync(filesPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    // Column 7 is needs_purpose_refresh; the 8th (last) is purpose_source (§4.1).
    const flag = cells[6];
    if (flag !== 'true' && flag !== 'false') continue;
    rows.push({ path: cells[0] ?? '', purpose: cells[1] ?? '', flagged: flag === 'true' });
  }
  return rows;
}

/** Seed skill directories (each with a SKILL.md) into the project's .claude/skills/ (Rule 17). */
export function seedProjectSkills(root: string, names: string[]): void {
  for (const name of names) {
    const dir = path.join(root, '.claude', 'skills', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: test skill\n---\n\n${name}\n`, 'utf-8');
  }
}

/** Write N undocumented source files (no doc comments → needs_purpose_refresh). */
export function writeUndocumentedFiles(root: string, n: number): void {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  for (let i = 0; i < n; i++) {
    fs.writeFileSync(path.join(root, 'src', `file${i}.ts`), `export const value${i} = ${i};\n`);
  }
}
