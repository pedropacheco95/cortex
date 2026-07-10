/**
 * `cortex loop-spec-drift` — daily content-drift detector (spec
 * loops.spec-drift, design §11.4 item 10). For each dev spec with governed
 * files, compares the spec's git last-commit date against its files' and
 * writes suspects to `.cortex/pulse/reports/spec-drift.md` — nothing else.
 * Deterministic Core (R-001): flags suspects; classification is the human's
 * (or specflow-bugs') job.
 *
 * Governed files = the spec's own `governs:` glob matches, expanded directly
 * against the working tree. (v1/v2 additionally unioned the anatomy
 * `spec_links` reverse map; anatomy retired at build-order-v3 step 7, and
 * `spec_links` was itself derived from the specs' `governs:` globs at scan
 * time — the direct expansion IS the reverse map, with no second artefact to
 * drift. Design §5.10: the spec-link role lives on in insight's Connections;
 * this loop needs only the governs ground truth.)
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { gitLastCommitEpoch, isGitRepo } from './git-info.js';
import { writePulseReport } from './report.js';
import { SPECS_GLOB } from '../paths.js';

/** Engineering-call constant (Rule 2 / Notes) — stated in the report footer. */
export const SPEC_DRIFT_GRACE_DAYS = 14;

const DAY_S = 24 * 60 * 60;

export interface NewerFile {
  path: string;
  epoch: number;
  /** Whole days after the spec's last commit. */
  daysAfterSpec: number;
}

export interface DriftSuspect {
  specId: string;
  specFile: string;
  specEpoch: number;
  newerFiles: NewerFile[];
}

export interface SpecDriftScan {
  suspects: DriftSuspect[];
  /** Governed specs with no git history — noted, not judged (Rule 3). */
  untracked: Array<{ specId: string; specFile: string }>;
  /** Ungoverned specs skipped (Rule 3). */
  skippedUngoverned: number;
  /** True when `root` is not a git repo: no spec has history to compare. */
  notARepo: boolean;
}

export async function scanSpecDrift(root: string): Promise<SpecDriftScan> {
  const scan: SpecDriftScan = { suspects: [], untracked: [], skippedUngoverned: 0, notARepo: false };
  if (!isGitRepo(root)) {
    scan.notARepo = true;
    return scan;
  }

  const specFiles = (await fg(SPECS_GLOB, { cwd: root })).sort();
  const epochCache = new Map<string, number | null>();
  const epochOf = async (rel: string): Promise<number | null> => {
    if (!epochCache.has(rel)) epochCache.set(rel, await gitLastCommitEpoch(root, rel));
    return epochCache.get(rel) ?? null;
  };

  for (const specRel of specFiles) {
    let data: Record<string, unknown> = {};
    try {
      data = matter(fs.readFileSync(path.join(root, specRel), 'utf-8')).data as Record<string, unknown>;
    } catch {
      continue;
    }
    const specId = typeof data['id'] === 'string' ? (data['id'] as string) : specRel;

    const governsRaw = data['governs'];
    const governs = Array.isArray(governsRaw)
      ? governsRaw.filter((g): g is string => typeof g === 'string')
      : typeof governsRaw === 'string'
        ? [governsRaw]
        : [];

    const governed = new Set<string>();
    for (const glob of governs) {
      try {
        for (const m of fg.sync(glob, { cwd: root, onlyFiles: true })) governed.add(m);
      } catch {
        /* malformed glob — the validator owns reporting that */
      }
    }
    governed.delete(specRel);

    // Rule 3: ungoverned specs are skipped — nothing to drift against.
    if (governed.size === 0) {
      scan.skippedUngoverned++;
      continue;
    }

    const specEpoch = await epochOf(specRel);
    if (specEpoch === null) {
      // Rule 3: outside git history — noted, not judged.
      scan.untracked.push({ specId, specFile: specRel });
      continue;
    }

    const newerFiles: NewerFile[] = [];
    for (const fileRel of [...governed].sort()) {
      const fileEpoch = await epochOf(fileRel);
      if (fileEpoch === null) continue; // untracked governed file — no date to compare
      const daysAfterSpec = Math.floor((fileEpoch - specEpoch) / DAY_S);
      if (fileEpoch - specEpoch > SPEC_DRIFT_GRACE_DAYS * DAY_S) {
        newerFiles.push({ path: fileRel, epoch: fileEpoch, daysAfterSpec });
      }
    }
    if (newerFiles.length > 0) {
      scan.suspects.push({ specId, specFile: specRel, specEpoch, newerFiles });
    }
  }
  return scan;
}

const THREE_READINGS =
  'Possible readings (design §11.4): (1) the spec is wrong or stale; (2) the implementation regressed away from the spec; (3) the code grew behaviour that needs new acceptance criteria.';

function isoDay(epoch: number): string {
  return new Date(epoch * 1000).toISOString().slice(0, 10);
}

export async function runSpecDrift(root = '.', opts: { now?: Date } = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();
  const scan = await scanSpecDrift(absRoot);

  const lines: string[] = ['# Spec drift', ''];
  if (scan.notARepo) {
    lines.push('Not a git repository — specs have no git history, so drift cannot be computed. No drift suspects this cycle.', '');
  } else {
    if (scan.suspects.length === 0) {
      lines.push('No drift suspects this cycle.', '');
    } else {
      for (const s of scan.suspects) {
        lines.push(
          `## ${s.specId}`,
          '',
          `Spec: \`${s.specFile}\`, last commit ${isoDay(s.specEpoch)}. Governed files changed after the grace window:`,
          '',
        );
        for (const f of s.newerFiles) {
          lines.push(`- \`${f.path}\` — last commit ${isoDay(f.epoch)} (${f.daysAfterSpec} days after the spec)`);
        }
        lines.push('', THREE_READINGS, '');
      }
    }
    if (scan.untracked.length > 0) {
      lines.push('## Not in git history', '');
      for (const u of scan.untracked) {
        lines.push(`- ${u.specId} (\`${u.specFile}\`) — not yet committed; noted, not judged.`);
      }
      lines.push('');
    }
  }
  lines.push(
    '---',
    '',
    `Grace window: ${SPEC_DRIFT_GRACE_DAYS} days (engineering call — code normally changes days after its spec during implementation; drift is when it keeps changing later). Ungoverned specs skipped: ${scan.skippedUngoverned}. Untracked governed files carry no date and are not compared.`,
  );

  writePulseReport(
    absRoot,
    'spec-drift.md',
    'pulse-spec-drift',
    'cortex-loop-spec-drift',
    now.toISOString(),
    lines.join('\n'),
  );
  console.log(
    `cortex loop-spec-drift: wrote .cortex/pulse/reports/spec-drift.md (${scan.suspects.length} suspect(s), ${scan.untracked.length} untracked spec(s) noted).`,
  );
  return 0;
}
