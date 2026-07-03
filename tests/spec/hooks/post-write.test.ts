/**
 * Spec-level tests — hooks.post-write (split from the combined
 * tests/spec/hooks/hooks.test.ts per the schema §3 one-file-per-leaf
 * convention; describe blocks moved verbatim, zero behavioural change).
 *
 * End-to-end over tmp fixture projects with a real files.md produced by the
 * anatomy scanner, driven through the `cortex hook <name>` dispatch (runHook)
 * with raw stdin JSON. One describe per spec AC — 7 in total.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { runHook } from '../../../src/hooks/cli.js';
import { scan } from '../../../src/anatomy/scan.js';
import { validate } from '../../../src/schema/validate.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  readFilesMdRows,
  hookErrorsPath,
} from '../../fixtures/hooks-harness.js';

const TEST_TIMEOUT = 30_000;
const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`spec-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function sha(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function stdinJson(fields: Record<string, unknown>): string {
  return JSON.stringify({ session_id: 'spec-session', ...fields });
}

/** Scanned fixture: real src files + a real files.md written by the scanner. */
async function makeScannedProject(label: string): Promise<string> {
  const root = tmp(label);
  makeCortexProject(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'a.ts'),
    '/** Handles the A concern for the fixture project. */\nexport const a = 1;\n',
  );
  fs.writeFileSync(
    path.join(root, 'src', 'b.ts'),
    '/** Handles the B concern for the fixture project. */\nexport const b = 2;\n',
  );
  await scan(root);
  return root;
}

function postWriteStdin(root: string, filePath: string): string {
  return stdinJson({
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: filePath, content: '(hook reads disk, not this)' },
    cwd: root,
  });
}

describe('AC post-write.1: changed file’s row is refreshed and flagged', () => {
  it(
    'Write changes src/a.ts to 400 chars → tokens 100, new sha256, new last_seen, flag true',
    async () => {
      const root = await makeScannedProject('po1');
      const before = readFilesMdRows(root).find((r) => r.path === 'src/a.ts');
      expect(before?.flagged).toBe(false); // doc comment gave it a purpose
      const newContent = 'y'.repeat(400);
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), newContent);

      const result = await runHook('post-write', postWriteStdin(root, path.join(root, 'src/a.ts')));
      expect(result).toEqual({ exitCode: 0, stdout: '' });

      const after = readFilesMdRows(root).find((r) => r.path === 'src/a.ts');
      expect(after?.tokens).toBe(100);
      expect(after?.sha256).toBe(sha(newContent));
      expect(after?.lastSeen).not.toBe(before?.lastSeen);
      expect(Number.isNaN(Date.parse(after?.lastSeen ?? ''))).toBe(false);
      expect(after?.flagged).toBe(true);
    },
    TEST_TIMEOUT,
  );
});

describe('AC post-write.2: unchanged content leaves the row untouched', () => {
  it(
    'sha256 already matches disk → files.md byte-identical (flag and last_seen included)',
    async () => {
      const root = await makeScannedProject('po2');
      const filesMd = path.join(root, '.cortex', 'anatomy', 'files.md');
      const before = fs.readFileSync(filesMd, 'utf-8');
      await runHook('post-write', postWriteStdin(root, path.join(root, 'src/a.ts')));
      expect(fs.readFileSync(filesMd, 'utf-8')).toBe(before);
    },
    TEST_TIMEOUT,
  );
});

describe('AC post-write.3: new file appended with placeholder', () => {
  it(
    'Write creating src/new.ts → placeholder row, flag true, check.anatomy-files passes',
    async () => {
      const root = await makeScannedProject('po3');
      fs.writeFileSync(path.join(root, 'src', 'new.ts'), 'export const fresh = true;\n');
      await runHook('post-write', postWriteStdin(root, path.join(root, 'src/new.ts')));

      const added = readFilesMdRows(root).find((r) => r.path === 'src/new.ts');
      expect(added).toBeDefined();
      expect(added?.purpose).toBe('(needs purpose)');
      expect(added?.flagged).toBe(true);

      const report = await validate(root, { root });
      const anatomyErrors = report.violations.filter(
        (v) => v.check === 'check.anatomy-files' && v.severity === 'error',
      );
      expect(anatomyErrors).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

describe('AC post-write.4: excluded paths are a no-op', () => {
  it(
    '.gitignore lists dist/ → Write to dist/out.js leaves files.md byte-identical',
    async () => {
      const root = await makeScannedProject('po4');
      fs.writeFileSync(path.join(root, '.gitignore'), 'dist/\n');
      fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(root, 'dist', 'out.js'), 'compiled output');
      const filesMd = path.join(root, '.cortex', 'anatomy', 'files.md');
      const before = fs.readFileSync(filesMd, 'utf-8');
      await runHook('post-write', postWriteStdin(root, path.join(root, 'dist/out.js')));
      expect(fs.readFileSync(filesMd, 'utf-8')).toBe(before);
    },
    TEST_TIMEOUT,
  );
});

describe('AC post-write.5: unscanned project is fully silent', () => {
  it('.cortex/ without anatomy/files.md → exit 0, empty stdout, no file, no pulse entry', async () => {
    const root = tmp('po5');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'x');
    const result = await runHook('post-write', postWriteStdin(root, path.join(root, 'src/a.ts')));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(path.join(root, '.cortex', 'anatomy', 'files.md'))).toBe(false);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });
});

describe('AC post-write.6: corrupt files.md is never destroyed', () => {
  it(
    'truncated table → byte-identical, exit 0, hook-errors names the hook and the parse failure',
    async () => {
      const root = await makeScannedProject('po6');
      const filesMd = path.join(root, '.cortex', 'anatomy', 'files.md');
      // Truncate mid-row: the last row loses its trailing cells.
      const truncated = fs.readFileSync(filesMd, 'utf-8').slice(0, -80);
      fs.writeFileSync(filesMd, truncated);
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'changed content');

      const result = await runHook('post-write', postWriteStdin(root, path.join(root, 'src/a.ts')));
      expect(result).toEqual({ exitCode: 0, stdout: '' });
      expect(fs.readFileSync(filesMd, 'utf-8')).toBe(truncated);
      const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
      expect(log).toContain('hook: post-write');
      expect(log).toContain('files.md');
    },
    TEST_TIMEOUT,
  );
});

describe('AC post-write.7: no graph or purpose work in the fast tier', () => {
  it(
    'a Write adding an import → graph.json byte-identical, purpose text unchanged, only the flag flips',
    async () => {
      const root = await makeScannedProject('po7');
      const graphPath = path.join(root, '.cortex', 'anatomy', 'graph.json');
      const graphBefore = fs.readFileSync(graphPath, 'utf-8');
      const purposeBefore = readFilesMdRows(root).find((r) => r.path === 'src/a.ts')?.purpose;

      fs.writeFileSync(
        path.join(root, 'src', 'a.ts'),
        '/** Handles the A concern for the fixture project. */\nimport { b } from "./b.js";\nexport const a = b;\n',
      );
      await runHook('post-write', postWriteStdin(root, path.join(root, 'src/a.ts')));

      expect(fs.readFileSync(graphPath, 'utf-8')).toBe(graphBefore);
      const after = readFilesMdRows(root).find((r) => r.path === 'src/a.ts');
      expect(after?.purpose).toBe(purposeBefore);
      expect(after?.flagged).toBe(true);
    },
    TEST_TIMEOUT,
  );
});
