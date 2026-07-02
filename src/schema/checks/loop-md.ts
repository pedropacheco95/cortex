import * as fs from 'fs';
import * as path from 'path';
import type { Violation } from '../types.js';

export function checkLoopMd(root: string): Violation[] {
  const violations: Violation[] = [];
  const loopMdPath = path.join(root, 'loop.md');

  if (!fs.existsSync(loopMdPath)) return violations;

  const content = fs.readFileSync(loopMdPath, 'utf-8');

  if (!content.includes("Propose, don't mutate") && !content.includes('Propose, don\'t mutate')) {
    violations.push({
      severity: 'warning',
      check: 'check.loop-md',
      clause: '§9',
      location: { path: loopMdPath },
      message: "loop.md missing \"Propose, don't mutate\" clause",
    });
  }

  if (!content.includes('Stop condition:')) {
    violations.push({
      severity: 'warning',
      check: 'check.loop-md',
      clause: '§9',
      location: { path: loopMdPath },
      message: 'loop.md missing "Stop condition:" line',
    });
  }

  return violations;
}
