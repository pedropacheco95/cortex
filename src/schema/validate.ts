import * as fs from 'fs';
import * as path from 'path';
import type { ValidationReport, Violation } from './types.js';
import { buildIndex } from './index-build.js';
import { SUPPORTED_VERSION } from './version.js';
import { checkConfig } from './checks/config.js';
import { checkLayout, checkIndexPresent, checkIndexShape } from './checks/layout.js';
import { checkSpecsIndex, checkOverviewPresent, checkOverviewShape, checkIdMatchesPath } from './checks/specs.js';
import { checkRules, checkBugs } from './checks/compass.js';
import { checkAtlas } from './checks/atlas.js';
import { checkPulse } from './checks/pulse.js';
import { checkDevSpecs } from './checks/devspec.js';
import { checkBizSpecs, checkBusinessStatus } from './checks/bizspec.js';
import { checkScenarios } from './checks/scenario.js';
import { checkXrefSymmetry, checkXrefUnique, checkXrefAcyclic } from './checks/xref.js';
import { checkProvenance } from './checks/provenance.js';
import { checkHookConfig } from './checks/hooks.js';
import { checkClaudeMd } from './checks/claude-md.js';
import { checkLoopMd } from './checks/loop-md.js';
import { checkConstellation } from './checks/constellation.js';
import {
  checkInsightIndex,
  checkInsightEntry,
  checkInsightScopeRegistry,
  checkInsightLedger,
  checkInsightGraph,
  checkInsightObservations,
} from './checks/insight.js';
import { checkArchiveLayout, checkArchiveMetadata, checkArchiveType, checkArchiveIntentRegister } from './checks/archive.js';

export interface ValidateOptions {
  scope?: 'project' | 'tree' | 'file';
  root?: string;
}

function findProjectRoot(startPath: string): string | undefined {
  let current = fs.statSync(startPath).isDirectory() ? startPath : path.dirname(startPath);
  while (true) {
    if (fs.existsSync(path.join(current, '.cortex', 'cortex.config.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function countViolations(violations: Violation[]): { error: number; warning: number } {
  let error = 0;
  let warning = 0;
  for (const v of violations) {
    if (v.severity === 'error') error++;
    else warning++;
  }
  return { error, warning };
}

export async function validate(target: string, opts?: ValidateOptions): Promise<ValidationReport> {
  const absTarget = path.resolve(target);

  // Find project root
  const root = opts?.root ? path.resolve(opts.root) : findProjectRoot(absTarget) ?? (fs.statSync(absTarget).isDirectory() ? absTarget : path.dirname(absTarget));

  // 1. Check config first
  const configResult = checkConfig(root);

  if (!configResult.majorOk) {
    // Short-circuit: return only config violations
    const counts = countViolations(configResult.violations);
    return {
      schemaVersion: SUPPORTED_VERSION,
      target,
      conformant: counts.error === 0,
      violations: configResult.violations,
      counts,
    };
  }

  const config = configResult.config ?? {};

  // 2. Build global index
  const index = await buildIndex(root);

  // 3. Run all checks
  const allViolations: Violation[] = [...configResult.violations];

  // Layout checks
  allViolations.push(...checkLayout(root));
  allViolations.push(...checkIndexPresent(root));
  allViolations.push(...checkIndexShape(root));

  // Specs checks
  allViolations.push(...checkSpecsIndex(root));
  allViolations.push(...checkOverviewPresent(root));
  allViolations.push(...checkOverviewShape(root));
  allViolations.push(...checkIdMatchesPath(root));

  // Anatomy checks REMOVED at v3.0 (schema Appendix A: check.anatomy-files,
  // check.anatomy-graph, check.anatomy-purpose-source — module removed,
  // addendum A7.3; build-order-v3 step 7).

  // Compass checks
  allViolations.push(...checkRules(root, index));
  allViolations.push(...checkBugs(root, index));

  // Atlas checks
  allViolations.push(...await checkAtlas(root, index));

  // Pulse checks
  allViolations.push(...await checkPulse(root));

  // Dev spec checks
  allViolations.push(...await checkDevSpecs(root, index));

  // Business spec checks
  allViolations.push(...await checkBizSpecs(root, index));
  allViolations.push(...await checkBusinessStatus(root)); // §4.7 Policy A status lag

  // Scenario checks
  allViolations.push(...await checkScenarios(root, index));

  // Cross-reference checks
  allViolations.push(...await checkXrefSymmetry(root, index));
  allViolations.push(...await checkXrefUnique(root, index));
  allViolations.push(...await checkXrefAcyclic(root, index));

  // Provenance check (§6, addendum A6, new at v3.0) — tolerant of the field
  // being absent everywhere (absence means "authored directly")
  allViolations.push(...await checkProvenance(root));

  // Hook config check
  allViolations.push(...checkHookConfig(root, config));

  // CLAUDE.md check
  allViolations.push(...checkClaudeMd(root, config));

  // loop.md check
  allViolations.push(...checkLoopMd(root));

  // constellation.json check (§4.9 — only when the file exists)
  allViolations.push(...checkConstellation(root));

  // Insight-module checks (§4.10 v3, §7.4) — each tolerant of an absent
  // insight/ module. v2's check.insight-prose / check.insight-ownership are
  // REMOVED (Appendix A); check.insight-entry replaces the former.
  allViolations.push(...checkInsightIndex(root));
  allViolations.push(...checkInsightEntry(root));
  allViolations.push(...checkInsightScopeRegistry(root));
  allViolations.push(...checkInsightLedger(root));
  allViolations.push(...checkInsightGraph(root));
  allViolations.push(...checkInsightObservations(root));

  // Archive-module checks (§4.4, new at v3.0) — tolerant of an absent archive/
  allViolations.push(...checkArchiveLayout(root));
  allViolations.push(...checkArchiveMetadata(root));
  allViolations.push(...checkArchiveType(root));
  allViolations.push(...checkArchiveIntentRegister(root, index));

  // When scoped to a single file, filter violations to only those relevant to that file
  let filteredViolations = allViolations;
  if (opts?.scope === 'file') {
    const absFile = path.resolve(target);
    filteredViolations = allViolations.filter((v) => {
      // Keep violations for the specific file or config errors
      return v.location.path === absFile || v.check === 'check.config';
    });
  }

  const counts = countViolations(filteredViolations);

  return {
    schemaVersion: SUPPORTED_VERSION,
    target,
    conformant: counts.error === 0,
    violations: filteredViolations,
    counts,
  };
}
