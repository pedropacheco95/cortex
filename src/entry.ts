import './safe-matter.js';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

/**
 * True when this module is the program being executed, not an import
 * (core-cli.init Rule 19, B-026). Compares resolved real paths, so a symlinked
 * bin, a chain of symlinks and a path with spaces all count. A suffix test on
 * the raw strings silently did nothing through a symlink.
 */
export function isEntryPoint(moduleUrl: string, argv1: string | undefined = process.argv[1]): boolean {
  if (!argv1) return false;
  try {
    return fs.realpathSync(argv1) === fs.realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
