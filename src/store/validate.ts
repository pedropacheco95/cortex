/**
 * `cortex store validate` (schema Part II S11; spec store.validate): runs
 * every 4.0 check and returns its findings. Exit 1 on any error.
 */
import { loadStore, type Store } from './layout.js';
import { checkAliases, checkChange, checkDecision, checkFrontmatter, checkLinks, checkNaming, checkStoreConfig, checkStoreLayout } from './checks/structure.js';
import { checkNearDuplicate } from './checks/near-duplicate.js';
import { checkAppendOnly, checkTrailers } from './checks/git-checks.js';
import { checkStoreVisibility } from './checks/visibility.js';
import { checkAppliesWhen, checkRules } from './rules.js';
import { checkNowUntil, checkStale } from './freshness.js';
import { checkMapSize } from './map.js';
import { checkMapFresh } from './managed-block.js';
import { localToday, type Finding } from './types.js';

export const NO_STORE_MESSAGE = 'no 4.0 store (cortex/cortex.json not found)';

export function validateLoaded(store: Store, today = localToday()): Finding[] {
  return [
    ...checkStoreConfig(store),
    ...checkStoreLayout(store),
    ...checkFrontmatter(store),
    ...checkNaming(store),
    ...checkRules(store),
    ...checkAppliesWhen(store),
    ...checkDecision(store),
    ...checkChange(store),
    ...checkNowUntil(store, today),
    ...checkNearDuplicate(store),
    ...checkAliases(store),
    ...checkLinks(store),
    ...checkAppendOnly(store),
    ...checkStale(store),
    ...checkMapSize(store),
    ...checkMapFresh(store),
    ...checkStoreVisibility(store),
    ...checkTrailers(store),
  ];
}

export interface ValidateResult { exists: boolean; findings: Finding[]; exitCode: number }

export function validateStore(root: string, today = localToday()): ValidateResult {
  const store = loadStore(root);
  if (!store.exists) return { exists: false, findings: [], exitCode: 1 };
  const findings = validateLoaded(store, today);
  return { exists: true, findings, exitCode: findings.some((f) => f.level === 'error') ? 1 : 0 };
}

export function formatFinding(f: Finding): string {
  return `${f.level} ${f.check} ${f.path}: ${f.message}`;
}
