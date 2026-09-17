/**
 * Promotion accept side-effects (schema §4.5 Source clause, §4.5.1
 * `promotion`, §4.10.4; `insight.promotion-mechanism` Rules 5–6 as corrected
 * by B-020, 2026-09-17). A `promotion`'s `**Source:**` names the originating
 * artefact, one of exactly two kinds: an **insight** per-file entry
 * (`insight/anatomy/**`, `insight/scopes/<s>/anatomy/**` — the distil
 * graduation path) or an **archive** extraction
 * (`archive/documents/<id>/extracted/**` — the cortex-archive-ingest
 * producer). On accept the gated write lands carrying a `source:`
 * back-reference to that artefact; an insight original is additionally
 * MARKED promoted (a trailer line) — never deleted; an archive source is
 * never written to. This module owns the format details; src/pulse/review.ts
 * owns the transaction (compute here, write there — Rule 6).
 *
 * Deterministic Core (R-001): fs reads only, no LLM, no network.
 */
import * as fs from 'fs';
import * as path from 'path';

export type PromotionSourceKind = 'insight' | 'archive';

/** A resolved `**Source:**`: which kind it names and the project-relative path (`.cortex/…`). */
export interface PromotionSource {
  kind: PromotionSourceKind;
  rel: string;
}

/** The computed writes for a promotion accept (review.ts applies them atomically). */
export interface PromotionPlan {
  ok: true;
  /** Which kind of artefact the source named. */
  kind: PromotionSourceKind;
  /** Content to write to the gated target (payload + injected `source:`). */
  landedContent: string;
  /** Absolute path of the insight original to stamp; `null` for an archive source (nothing to stamp). */
  insightAbs: string | null;
  /** Insight-original content with the promoted trailer appended; `null` for an archive source. */
  nextInsight: string | null;
  /** The source artefact's project-relative path (`.cortex/…`), for messages. */
  sourceRel: string;
}

export interface PromotionRefusal {
  ok: false;
  error: string;
}

/** The refusal text for a `**Source:**` naming neither kind (Rule 5 — both shapes, never a retired path). */
export const PROMOTION_SOURCE_REFUSAL =
  '**Source:** must name the artefact being promoted — an insight entry (.cortex/insight/anatomy/**) or an archive extraction (.cortex/archive/documents/<id>/extracted/**)';

/** The gated roots an archive-sourced promotion may target (Rule 5: Rule 2's roots minus `RULES.md`). */
export const ARCHIVE_PROMOTION_ROOTS = ['.cortex/compass/', '.cortex/atlas/'] as const;

const INSIGHT_SOURCE_RE = /(\S*insight\/(?:anatomy|scopes\/[^/\s]+\/anatomy)\/\S+?\.md)/;
const ARCHIVE_SOURCE_RE = /(?:^|\s)(?:\.\/)?(?:\.cortex\/)?(archive\/documents\/[^\s/]+\/extracted\/[^\s]+?\.md)(?=[\s,;)]|$)/;

/**
 * §4.5 — resolve a `promotion`'s `**Source:**` to the artefact it names.
 * The insight alternation keeps `insight/map/` out (the 2.0 prose layout is
 * retired); the archive alternation takes the producer's own grammar
 * (`cortex-archive-ingest — archive/documents/<slug>/extracted/<file>`), with
 * or without a `.cortex/` prefix. Returns null when the text names neither.
 */
export function extractPromotionSource(sourceField: string | null): PromotionSource | null {
  if (sourceField === null) return null;
  const insight = sourceField.match(INSIGHT_SOURCE_RE);
  if (insight) {
    let p = (insight[1] as string).replace(/^\.\//, '');
    if (!p.startsWith('.cortex/')) {
      const idx = p.indexOf('insight/');
      p = '.cortex/' + p.slice(idx);
    }
    return { kind: 'insight', rel: p };
  }
  const archive = sourceField.match(ARCHIVE_SOURCE_RE);
  if (archive) return { kind: 'archive', rel: '.cortex/' + (archive[1] as string) };
  return null;
}

/** §4.10.4 promoted trailer: `_(promoted <iso-date> → <gated-target-path> via S-NNN)_`. */
export function promotedTrailer(dateIso: string, targetRel: string, id: string): string {
  return `_(promoted ${dateIso} → ${targetRel} via ${id})_`;
}

/**
 * Inject a `source:` reference into a CREATE payload's frontmatter (§6: the
 * promoted atlas/RULES entry carries a single `source:` path to the named
 * artefact). If the payload has a `---`-delimited frontmatter block, add the
 * line before its closing fence (rest of the file byte-exact); otherwise
 * prepend a minimal frontmatter. A payload that already declares a top-level
 * `source:` key — a compass rule's §4.1 `source` list, which the
 * archive-ingest template fills with the same extracted file — is returned
 * byte-identical: a second key would be a duplicate YAML mapping key and the
 * landed file would not parse.
 */
export function injectSourceFrontmatter(content: string, relSource: string): string {
  if (content.startsWith('---\n')) {
    const end = content.indexOf('\n---', 4);
    if (end !== -1) {
      if (/^source:/m.test(content.slice(4, end + 1))) return content;
      return content.slice(0, end) + `\nsource: ${relSource}` + content.slice(end);
    }
  }
  return `---\nsource: ${relSource}\n---\n\n${content}`;
}

/** Append `block` to `existing`, separated by exactly one blank line. */
function appendBlock(existing: string, block: string): string {
  if (existing.trim() === '') return block;
  return existing.replace(/\n+$/, '') + '\n\n' + block;
}

/** True when `targetRel` (project-relative) lies under one of the archive-promotion roots. */
function underArchiveRoots(root: string, targetRel: string): boolean {
  const rel = path.relative(root, path.resolve(root, targetRel)).split(path.sep).join('/');
  return ARCHIVE_PROMOTION_ROOTS.some((r) => rel.startsWith(r));
}

/**
 * Compute the promotion writes. `isCreate` selects the gated-target operation
 * (create vs append); `existingTarget` is the current target content ('' for a
 * create). A source naming neither kind, a source file that does not exist,
 * or (archive kind) a target outside compass/atlas is a transactional
 * refusal — the caller applies NOTHING (Rule 6).
 */
export function planPromotion(args: {
  root: string;
  suggestionId: string;
  targetRel: string;
  isCreate: boolean;
  block: string;
  existingTarget: string;
  sourceField: string | null;
  now?: Date;
}): PromotionPlan | PromotionRefusal {
  const source = extractPromotionSource(args.sourceField);
  if (source === null) {
    return { ok: false, error: `promotion ${args.suggestionId}: ${PROMOTION_SOURCE_REFUSAL}` };
  }
  const sourceAbs = path.resolve(args.root, source.rel);
  if (!fs.existsSync(sourceAbs)) {
    return {
      ok: false,
      error: `promotion ${args.suggestionId}: ${source.kind} source not found: ${source.rel}. Nothing changed.`,
    };
  }
  if (source.kind === 'archive' && !underArchiveRoots(args.root, args.targetRel)) {
    return {
      ok: false,
      error: `promotion ${args.suggestionId}: an archive-sourced promotion may target only ${ARCHIVE_PROMOTION_ROOTS.join(' or ')} (got ${args.targetRel}). Nothing changed.`,
    };
  }

  // `source:` back-reference. Insight kind: a path relative to the gated
  // target's directory (§6). Archive kind: the `.cortex/`-relative path the
  // payload's `provenance: derives_from` already carries — the same path
  // (Rule 5), not re-rooted.
  const targetAbs = path.resolve(args.root, args.targetRel);
  const relSource = source.kind === 'insight' ? path.relative(path.dirname(targetAbs), sourceAbs) : source.rel.replace(/^\.cortex\//, '');

  const landedContent = args.isCreate
    ? injectSourceFrontmatter(args.block, relSource)
    : // Append: land the block, then a source-reference trailer inside the body
      // (the gated file already exists; its frontmatter is not ours to rewrite).
      appendBlock(args.existingTarget, `${args.block.replace(/\n+$/, '')}\n\n_source: ${relSource}_`);

  if (source.kind === 'archive') {
    return { ok: true, kind: 'archive', landedContent, insightAbs: null, nextInsight: null, sourceRel: source.rel };
  }

  // Stamp the insight original: append the promoted trailer as its own line.
  const dateIso = (args.now ?? new Date()).toISOString().slice(0, 10);
  const trailer = promotedTrailer(dateIso, args.targetRel, args.suggestionId);
  const insightContent = fs.readFileSync(sourceAbs, 'utf-8');
  const nextInsight = insightContent.replace(/\n+$/, '') + '\n\n' + trailer + '\n';

  return { ok: true, kind: 'insight', landedContent, insightAbs: sourceAbs, nextInsight, sourceRel: source.rel };
}
