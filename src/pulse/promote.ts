/**
 * Promotion accept side-effects (schema §4.5.1 `promotion`, §4.10.4). When a
 * `promotion` suggestion is accepted, the gated write lands carrying a
 * `source:` back-reference to the insight file it graduated from, and the
 * insight original is MARKED promoted (a trailer line) — never deleted. This
 * module owns the format details; src/pulse/review.ts owns the transaction
 * (compute here, write there — Rule 6, transactional accept).
 *
 * Deterministic Core (R-001): fs reads only, no LLM, no network.
 */
import * as fs from 'fs';
import * as path from 'path';

/** The computed writes for a promotion accept (review.ts applies them atomically). */
export interface PromotionPlan {
  ok: true;
  /** Content to write to the gated target (payload + injected `source:`). */
  landedContent: string;
  /** Absolute path of the insight original to stamp. */
  insightAbs: string;
  /** Insight-original content with the promoted trailer appended. */
  nextInsight: string;
  /** The insight source path (project-relative), for messages. */
  insightRel: string;
}

export interface PromotionRefusal {
  ok: false;
  error: string;
}

/**
 * §4.5 — a `promotion`'s `**Source:**` MUST name the insight file being
 * promoted. Extract the first insight file path — the v2 prose layout
 * (`.cortex/insight/map/<...>.md`) or a v3 per-file entry
 * (`.cortex/insight/anatomy/<...>.md` / `.cortex/insight/scopes/<s>/anatomy/<...>.md`,
 * where `cortex-loop-session-observe` enriches) — from the free provenance
 * text and normalise it project-relative. Returns null when absent.
 */
export function extractInsightSource(sourceField: string | null): string | null {
  if (sourceField === null) return null;
  const m = sourceField.match(/(\S*insight\/(?:map|anatomy|scopes\/[^/\s]+\/anatomy)\/\S+?\.md)/);
  if (!m) return null;
  let p = (m[1] as string).replace(/^\.\//, '');
  if (!p.startsWith('.cortex/')) {
    const idx = p.indexOf('insight/');
    p = '.cortex/' + p.slice(idx);
  }
  return p;
}

/** §4.10.4 promoted trailer: `_(promoted <iso-date> → <gated-target-path> via S-NNN)_`. */
export function promotedTrailer(dateIso: string, targetRel: string, id: string): string {
  return `_(promoted ${dateIso} → ${targetRel} via ${id})_`;
}

/**
 * Inject a `source:` reference into a CREATE payload's frontmatter (§6: the
 * promoted atlas/RULES entry carries a single `source:` path to the insight
 * prose). If the payload has a `---`-delimited frontmatter block, add the line
 * before its closing fence (rest of the file byte-exact); otherwise prepend a
 * minimal frontmatter.
 */
export function injectSourceFrontmatter(content: string, relSource: string): string {
  if (content.startsWith('---\n')) {
    const end = content.indexOf('\n---', 4);
    if (end !== -1) {
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

/**
 * Compute the promotion writes. `isCreate` selects the gated-target operation
 * (create vs append); `existingTarget` is the current target content ('' for a
 * create). A missing/unnamed insight source is a transactional refusal — the
 * caller applies NOTHING (Rule 6).
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
  const insightRel = extractInsightSource(args.sourceField);
  if (insightRel === null) {
    return {
      ok: false,
      error: `promotion ${args.suggestionId}: **Source:** must name the insight file being promoted (.cortex/insight/map/<topic>.md or an anatomy entry .md).`,
    };
  }
  const insightAbs = path.resolve(args.root, insightRel);
  if (!fs.existsSync(insightAbs)) {
    return {
      ok: false,
      error: `promotion ${args.suggestionId}: insight source not found: ${insightRel}. Nothing changed.`,
    };
  }

  // `source:` back-reference — a path relative to the gated target's directory (§6).
  const targetAbs = path.resolve(args.root, args.targetRel);
  const relSource = path.relative(path.dirname(targetAbs), insightAbs);

  const landedContent = args.isCreate
    ? injectSourceFrontmatter(args.block, relSource)
    : // Append: land the block, then a source-reference trailer inside the body
      // (the gated file already exists; its frontmatter is not ours to rewrite).
      appendBlock(args.existingTarget, `${args.block.replace(/\n+$/, '')}\n\n_source: ${relSource}_`);

  // Stamp the insight original: append the promoted trailer as its own line.
  const dateIso = (args.now ?? new Date()).toISOString().slice(0, 10);
  const trailer = promotedTrailer(dateIso, args.targetRel, args.suggestionId);
  const insightContent = fs.readFileSync(insightAbs, 'utf-8');
  const nextInsight = insightContent.replace(/\n+$/, '') + '\n\n' + trailer + '\n';

  return { ok: true, landedContent, insightAbs, nextInsight, insightRel };
}
