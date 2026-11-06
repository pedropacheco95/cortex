/**
 * Spec-level test — `core-cli.init` Rule 21: `pnpm install` on a clean clone
 * exits 0 only while `pnpm-workspace.yaml` decides every dependency build
 * script. The lockfile marks none of them, so the installed packages are read.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const VIRTUAL_STORE = path.join(ROOT, 'node_modules', '.pnpm');
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall'];

function packageDirs(modules: string): string[] {
  return fs.readdirSync(modules).flatMap((entry) =>
    entry.startsWith('@')
      ? fs.readdirSync(path.join(modules, entry)).map((name) => path.join(modules, entry, name))
      : [path.join(modules, entry)],
  );
}

function packagesWithBuildScripts(): string[] {
  const names = new Set<string>();
  for (const entry of fs.readdirSync(VIRTUAL_STORE)) {
    const modules = path.join(VIRTUAL_STORE, entry, 'node_modules');
    if (!fs.existsSync(modules)) continue;
    for (const dir of packageDirs(modules)) {
      const manifest = path.join(dir, 'package.json');
      if (fs.lstatSync(dir).isSymbolicLink() || !fs.existsSync(manifest)) continue;
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf-8')) as { name: string; scripts?: Record<string, string> };
      if (INSTALL_SCRIPTS.some((s) => pkg.scripts?.[s]) || fs.existsSync(path.join(dir, 'binding.gyp'))) names.add(pkg.name);
    }
  }
  return [...names].sort();
}

function allowBuilds(): string[] {
  const text = fs.readFileSync(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf-8');
  const block = /^allowBuilds:\n((?:[ \t]+.*\n)*)/m.exec(text)?.[1] ?? '';
  return block.split('\n').flatMap((l) => /^\s+['"]?([^'":]+)['"]?:/.exec(l)?.[1] ?? []).sort();
}

describe('core-cli.init Rule 21: a source install is clean', () => {
  it('[CORE-CLI-INIT-55] every dependency with a build script is decided', () => {
    const scripted = packagesWithBuildScripts();
    expect(scripted.length).toBeGreaterThan(0);
    expect(scripted.filter((name) => !allowBuilds().includes(name))).toEqual([]);
  });
});
