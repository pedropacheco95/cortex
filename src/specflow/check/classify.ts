/** Path classes of the check (specflow.check Rule 3; schema S12.6's generic test patterns). */
import * as path from 'path';
import picomatch from 'picomatch';
import type { TestEntry } from '../model/model.js';

export type PathClass = 'generated' | 'spec' | 'hook' | 'store' | 'test' | 'docs' | 'code';

const TEST_FOLDERS = new Set([
  'test', 'tests', '__tests__', 'test-int', 'e2e', 'fixtures', '__fixtures__', 'mocks', '__mocks__', '__snapshots__',
]);
const TEST_NAMES = [
  /\.(test|spec)\.(?!md$)[^/]+$/,
  /\.snap$/,
  /^test_.*\.py$/,
  /_test\.py$/,
  /^conftest\.py$/,
  /^pytest\.ini$/,
  /^(vitest|jest|playwright|cypress|karma|ava)\.[\w.-]*config\.[^/]+$/,
  /^(vitest|jest|playwright|cypress|karma|ava)\.config\.[^/]+$/,
  /^\.(mocharc|c8rc|nycrc)/,
];

function isGenericTest(file: string): boolean {
  if (file.split('/').slice(0, -1).some((part) => TEST_FOLDERS.has(part))) return true;
  const base = path.posix.basename(file);
  return TEST_NAMES.some((re) => re.test(base));
}

export function classifier(tests: TestEntry[]): (file: string) => PathClass {
  const declared = tests.map((t) => {
    const included = picomatch(t.include, { dot: true });
    const excluded = picomatch(t.exclude ?? [], { dot: true });
    return (f: string): boolean => included(f) && !excluded(f);
  });
  return (file) => {
    if (file === 'specflow/INDEX.md') return 'generated';
    if (file.startsWith('specflow/')) return 'spec';
    if (file.startsWith('.githooks/')) return 'hook';
    if (file.startsWith('cortex/')) return 'store';
    if (declared.some((match) => match(file)) || isGenericTest(file)) return 'test';
    if (file.endsWith('.md')) return 'docs';
    return 'code';
  };
}
