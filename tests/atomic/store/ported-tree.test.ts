/**
 * Atomic tests — code that names the spec tree, on a ported project: a `Spec:`
 * trailer resolves under `specflow/`, and the scheduled lint's filter sees it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { cleanRepos, tmpRepo } from '../../fixtures/store.js';
import { validateStore } from '../../../src/store/validate.js';
import { isSpecTreeViolation } from '../../../src/loops/lint-scheduled.js';
import type { Violation } from '../../../src/schema/types.js';

afterEach(cleanRepos);

function ported(): string {
  const root = tmpRepo('ported');
  const git = (...a: string[]) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  fs.mkdirSync(path.join(root, 'cortex'));
  fs.writeFileSync(path.join(root, 'cortex/cortex.json'), '{"schemaVersion":"4.0"}');
  fs.mkdirSync(path.join(root, 'specflow/impl/billing'), { recursive: true });
  fs.writeFileSync(path.join(root, 'specflow/impl/billing/refunds.spec.md'), '---\nid: billing.refunds\nstatus: draft\n---\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'one\n\nSpec: billing.refunds\n');
  git('commit', '-q', '--allow-empty', '-m', 'two\n\nSpec: billing.gone\n');
  return root;
}

describe('code that names the spec tree, on a ported project', () => {
  it('a Spec: trailer resolves under specflow/, and one naming nothing still warns', () => {
    const findings = validateStore(ported(), '2026-11-05').findings.filter((f) => f.check === 'check.trailers');
    expect(findings).toHaveLength(1);
    expect(JSON.stringify(findings[0])).toContain('billing.gone');
  });

  it('the scheduled lint counts a finding under specflow/ as spec tree', () => {
    const root = ported();
    const at = (p: string): Violation => ({ severity: 'error', check: 'c', clause: 'x', location: { path: path.join(root, p) }, message: 'm' });
    expect(isSpecTreeViolation(root, at('specflow/impl/billing/refunds.spec.md'))).toBe(true);
    expect(isSpecTreeViolation(root, at('specflow/promises/billing/x.business.md'))).toBe(true);
    expect(isSpecTreeViolation(root, at('src/a.ts'))).toBe(false);
  });
});
