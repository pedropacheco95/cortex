import * as fs from 'fs';
import * as path from 'path';
import type { Violation } from '../types.js';

export function checkLayout(root: string): Violation[] {
  const violations: Violation[] = [];
  const cortexDir = path.join(root, '.cortex');

  if (!fs.existsSync(cortexDir)) {
    return violations; // .cortex is optional; if absent, no layout violations
  }

  // Schema §1 (v3.0): the five modules — `anatomy/` (and `cerebrum/`) no
  // longer exist; every module dir is present-tolerant (checked only when it
  // exists), so archive-less projects still validate clean.
  const expectedDirs = ['compass', 'atlas', 'archive', 'insight', 'pulse'];
  for (const dir of expectedDirs) {
    const dirPath = path.join(cortexDir, dir);
    if (fs.existsSync(dirPath)) {
      const indexPath = path.join(dirPath, '_index.md');
      if (!fs.existsSync(indexPath)) {
        violations.push({
          severity: 'error',
          check: 'check.layout',
          clause: '§1',
          location: { path: dirPath },
          message: `Directory .cortex/${dir}/ is missing _index.md`,
        });
      }
    }
  }

  // Check subdirs
  const subDirs = [
    'compass/rules',
    'compass/bugs',
    'atlas/decisions',
    'atlas/stakeholders',
    'atlas/domain',
    'atlas/evidence', // 3.4 — present-tolerant like the rest; its _index.md required when it exists
  ];
  for (const sub of subDirs) {
    const subPath = path.join(cortexDir, sub);
    if (fs.existsSync(subPath)) {
      const indexPath = path.join(subPath, '_index.md');
      if (!fs.existsSync(indexPath)) {
        violations.push({
          severity: 'error',
          check: 'check.layout',
          clause: '§1',
          location: { path: subPath },
          message: `Directory .cortex/${sub}/ is missing _index.md`,
        });
      }
    }
  }

  return violations;
}

export function checkIndexPresent(root: string): Violation[] {
  const violations: Violation[] = [];
  const cortexDir = path.join(root, '.cortex');

  if (!fs.existsSync(cortexDir)) return violations;

  // §4.10.1 (v3): insight's content directories are data trees, not navigable
  // module indexes — the schema §1 layout lists an `_index.md` only at the
  // insight module root. Exempt the whole `anatomy/`, `concepts/`, and
  // `scopes/` subtrees (per-file entries path-mirror the source tree). The
  // legacy v2 `insight/map/` stays exempt too — tolerated on disk as interim
  // dogfood (design §8.4) until the v3 extraction replaces it.
  const insightRoot = path.join(cortexDir, 'insight');
  const insightDataRoots = [
    path.join(insightRoot, 'anatomy'),
    path.join(insightRoot, 'concepts'),
    path.join(insightRoot, 'scopes'),
    path.join(insightRoot, 'map'),
  ];
  // §4.4: `archive/documents/` (and every `<slug>/`, `<slug>/extracted/` below
  // it) and `archive/types/` are data directories, not navigable module
  // indexes — the schema §1 layout tree lists no `_index.md` anywhere under
  // either (only `archive/_index.md` itself is required). Exempt the whole
  // `documents/` subtree and the `types/` directory, mirroring insight's data trees.
  const archiveDocuments = path.join(cortexDir, 'archive', 'documents');
  const archiveTypes = path.join(cortexDir, 'archive', 'types');
  // §4.5 (B-008): everything under `pulse/` is transient/generated working state
  // (loop reports, machine state, extraction fragments — reports/, state/,
  // state/reads/, extraction/, extraction/fragments/, …), not navigable module
  // indexes. Exempt the WHOLE pulse subtree from the `_index.md` requirement.
  // `pulse/` itself is the module root and still requires `_index.md` — only its
  // descendants are exempt (note `startsWith(pulseRoot + path.sep)`, not `=== pulseRoot`).
  const pulseRoot = path.join(cortexDir, 'pulse');

  function walkDir(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const hasIndex = entries.some((e) => e.isFile() && e.name === '_index.md');
    const exempt =
      insightDataRoots.some((d) => dir === d || dir.startsWith(d + path.sep)) ||
      dir === archiveTypes ||
      dir === archiveDocuments ||
      dir.startsWith(archiveDocuments + path.sep) ||
      dir.startsWith(pulseRoot + path.sep);
    if (!hasIndex && !exempt) {
      violations.push({
        severity: 'error',
        check: 'check.index-present',
        clause: '§7.1',
        location: { path: dir },
        message: `Directory ${path.relative(root, dir)} is missing _index.md`,
      });
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walkDir(path.join(dir, entry.name));
      }
    }
  }

  walkDir(cortexDir);
  return violations;
}

export function checkIndexShape(root: string): Violation[] {
  const violations: Violation[] = [];
  const cortexDir = path.join(root, '.cortex');

  if (!fs.existsSync(cortexDir)) return violations;

  // §7.4 (v3): `insight/_index.md` is LOCKED template text (design §5.13) that
  // deliberately does not carry the §7.1 `Read this when:` / `What's here:`
  // headings — its shape is owned by check.insight-index instead. Exempt it
  // from the two heading checks (the <300-token budget still applies).
  const insightIndex = path.join(cortexDir, 'insight', '_index.md');

  function walkDir(dir: string): void {
    const indexPath = path.join(dir, '_index.md');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf-8');
      const headingExempt = indexPath === insightIndex;
      if (!headingExempt && !content.includes('Read this when:')) {
        violations.push({
          severity: 'warning',
          check: 'check.index-shape',
          clause: '§7.1',
          location: { path: indexPath },
          message: `_index.md missing "Read this when:" heading`,
        });
      }
      if (!headingExempt && !content.includes("What's here:")) {
        violations.push({
          severity: 'warning',
          check: 'check.index-shape',
          clause: '§7.1',
          location: { path: indexPath },
          message: `_index.md missing "What's here:" heading`,
        });
      }
      // Soft token check: >300 tokens warning (approx by word count * 1.3)
      const wordCount = content.split(/\s+/).length;
      if (wordCount * 1.3 > 300) {
        violations.push({
          severity: 'warning',
          check: 'check.index-shape',
          clause: '§7.1',
          location: { path: indexPath },
          message: `_index.md may exceed 300 tokens (estimated ${Math.round(wordCount * 1.3)} tokens)`,
        });
      }
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walkDir(path.join(dir, entry.name));
      }
    }
  }

  walkDir(cortexDir);
  return violations;
}
