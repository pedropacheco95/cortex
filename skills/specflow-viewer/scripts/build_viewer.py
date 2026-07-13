#!/usr/bin/env python3
"""Build a self-contained HTML viewer for a Specflow project's spec tree.

Reads every spec.md under .specflow/specs/ (developer specs) and, when present,
.specflow/specs-business/ (business specs). Also reads folder-overview docs
(`_overview.md` preferred, `README.md` accepted) for every directory in
both trees. Parses frontmatter + sections and injects everything into
assets/template.html as a single-file artefact.

Usage:
    python3 build_viewer.py
    python3 build_viewer.py --specs-dir .specflow/specs --business-dir .specflow/specs-business --out specs.html
    python3 build_viewer.py --test-results test-results.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print("error: PyYAML is required. install with: pip install pyyaml", file=sys.stderr)
    sys.exit(2)


VALID_STATUS = {"draft", "approved", "implemented", "deprecated"}

# Filenames searched (in priority order) when looking for a folder's overview doc.
# `_overview.md` is preferred — the leading underscore keeps it visually grouped
# at the top of the folder in most file browsers, and it doesn't collide with
# a project's existing top-level README. `README.md` is accepted as a fallback
# so projects already using that convention don't need to rename.
OVERVIEW_FILENAMES = ["_overview.md", "README.md"]

# ---------------------------------------------------------------------------
# data model
# ---------------------------------------------------------------------------

@dataclass
class AcceptanceStep:
    keyword: str
    text: str


@dataclass
class AcceptanceCriterion:
    title: str
    steps: list[AcceptanceStep] = field(default_factory=list)
    raw: str = ""


@dataclass
class Entity:
    name: str
    description: str


@dataclass
class Spec:
    id: str
    domain: str
    capability: str | None
    kind: str  # "leaf" | "domain" | "index"
    tree: str  # "dev" | "business"
    path: str
    title: str
    status: str
    depends_on: list[str] = field(default_factory=list)
    # Cross-tree links. On a dev spec, `implements` lists the business
    # spec IDs (or paths) it serves. On a business spec, `implemented_by`
    # lists the dev spec IDs that fulfil it. Both directions are required —
    # the viewer surfaces "Unmapped" badges when a dev spec has no
    # corresponding business spec, so authors notice the gap.
    implements: list[str] = field(default_factory=list)
    implemented_by: list[str] = field(default_factory=list)
    intent: str = ""
    entities: list[Entity] = field(default_factory=list)
    entities_raw: str = ""
    rules: list[str] = field(default_factory=list)
    rules_raw: str = ""
    acceptance_criteria: list[AcceptanceCriterion] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    open_questions: list[str] = field(default_factory=list)
    raw_body: str = ""
    warnings: list[str] = field(default_factory=list)


@dataclass
class FolderOverview:
    """A folder-level overview doc parsed from `_overview.md` or `README.md`.

    Folder overviews answer three questions for a group of specs:
    *what is this group, what does it cover, why does it exist as a group?*
    They show up as first-class nodes in the sidebar and as the rendered
    landing page when a user clicks a folder. The first sentence of the body
    becomes the sidebar subtitle so clients get a glanceable map of the tree
    without expanding every node.
    """
    tree: str  # "dev" | "business"
    folder_path: str  # relative to the tree root, "" for root, "alpha", "alpha/billing"
    file: str  # filename actually used (`_overview.md` or `README.md`)
    title: str
    body: str  # rendered as Markdown in the viewer
    summary: str  # first sentence — sidebar subtitle


# ---------------------------------------------------------------------------
# parsing
# ---------------------------------------------------------------------------

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*$", re.MULTILINE)
BOLD_ONLY_HEADING_RE = re.compile(r"^\*\*(Intent|Entities|Rules|Acceptance Criteria|Notes)\*\*\s*:?\s*$", re.IGNORECASE | re.MULTILINE)

# keywords the acceptance-criteria parser recognises at the start of a bullet
KEYWORDS = ["Given", "When", "Then", "And when", "And then", "And given", "And", "But"]
# sort long-first so "And when" wins over "And"
KEYWORDS.sort(key=len, reverse=True)
KEYWORD_PATTERN = re.compile(
    r"^\s*[-*]\s*\*\*\s*(" + "|".join(re.escape(k) for k in KEYWORDS) + r")\s*\*\*\s*(.*)$",
    re.IGNORECASE,
)


def split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}, text
    try:
        fm = yaml.safe_load(m.group(1)) or {}
        if not isinstance(fm, dict):
            fm = {}
    except yaml.YAMLError:
        fm = {}
    return fm, text[m.end():]


def split_sections(body: str) -> tuple[str, dict[str, str]]:
    """Split body into (title, sections dict keyed by normalised heading).

    Tolerates `## Intent`, `### Intent`, `**Intent**` all as section markers.
    The first `# Title` is pulled out as the spec title.
    """
    lines = body.splitlines()
    title = ""
    # find first H1
    for i, line in enumerate(lines):
        m = re.match(r"^#\s+(.+)$", line)
        if m:
            title = m.group(1).strip()
            body = "\n".join(lines[:i] + lines[i + 1:])
            break

    # collapse `**SectionName**` markers to `## SectionName`
    body = BOLD_ONLY_HEADING_RE.sub(lambda m: f"## {m.group(1).title()}", body)

    sections: dict[str, str] = {}
    # iterate H2 headings as section boundaries (H3+ belong to the section above)
    matches = list(re.finditer(r"^(#{2})\s+(.*?)\s*$", body, re.MULTILINE))
    if not matches:
        return title, {"_preamble": body.strip()}

    # text before the first heading is preamble
    preamble = body[: matches[0].start()].strip()
    if preamble:
        sections["_preamble"] = preamble

    for idx, m in enumerate(matches):
        key = m.group(2).strip().lower()
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(body)
        sections[key] = body[start:end].strip()

    return title, sections


def parse_entities(raw: str) -> list[Entity]:
    """Parse an entities bullet list."""
    entities: list[Entity] = []
    for bullet in _split_top_level_bullets(raw):
        text = re.sub(r"^\s*[-*]\s*", "", bullet).strip()
        m = re.match(r"^\*\*(.+?)\*\*(.*)$", text, re.DOTALL)
        if m:
            name = m.group(1).strip().strip("`")
            rest = m.group(2).strip()
            rest = re.sub(r"^\s*[—–-]\s*", "", rest)
            entities.append(Entity(name=name, description=rest))
        else:
            entities.append(Entity(name="", description=text))
    return entities


def parse_rules(raw: str) -> list[str]:
    rules = []
    for bullet in _split_top_level_bullets(raw):
        text = re.sub(r"^\s*[-*\d]+\.?\s*", "", bullet).strip()
        text = re.sub(r"^[-*]\s*", "", text).strip()
        if text:
            rules.append(text)
    return rules


def parse_notes(raw: str) -> tuple[list[str], list[str]]:
    notes = []
    open_qs = []
    for bullet in _split_top_level_bullets(raw):
        text = re.sub(r"^\s*[-*\d]+\.?\s*", "", bullet).strip()
        if not text:
            continue
        if re.match(r"^OPEN\s*:", text, re.IGNORECASE):
            open_qs.append(re.sub(r"^OPEN\s*:\s*", "", text, count=1, flags=re.IGNORECASE))
        else:
            notes.append(text)
    return notes, open_qs


def parse_acceptance_criteria(raw: str) -> list[AcceptanceCriterion]:
    if not raw.strip():
        return []

    normalised_lines = []
    for line in raw.splitlines():
        bold_only = re.match(r"^\s*\*\*(.+?)\*\*\s*$", line)
        if bold_only and "Given" not in line and "When" not in line and "Then" not in line:
            normalised_lines.append(f"### {bold_only.group(1).strip()}")
        else:
            normalised_lines.append(line)
    raw = "\n".join(normalised_lines)

    criteria: list[AcceptanceCriterion] = []
    heads = list(re.finditer(r"^#{3,6}\s+(.+?)\s*$", raw, re.MULTILINE))
    if not heads:
        steps = _parse_steps(raw)
        if steps:
            criteria.append(AcceptanceCriterion(title="Criterion", steps=steps, raw=raw.strip()))
        return criteria

    for idx, h in enumerate(heads):
        title = h.group(1).strip()
        start = h.end()
        end = heads[idx + 1].start() if idx + 1 < len(heads) else len(raw)
        block = raw[start:end]
        steps = _parse_steps(block)
        criteria.append(AcceptanceCriterion(title=title, steps=steps, raw=block.strip()))
    return criteria


def _parse_steps(block: str) -> list[AcceptanceStep]:
    steps: list[AcceptanceStep] = []
    for line in block.splitlines():
        m = KEYWORD_PATTERN.match(line)
        if m:
            keyword = _canonical_keyword(m.group(1))
            text = m.group(2).strip()
            steps.append(AcceptanceStep(keyword=keyword, text=text))
    return steps


def _canonical_keyword(k: str) -> str:
    k_low = k.strip().lower()
    mapping = {
        "given": "Given",
        "when": "When",
        "then": "Then",
        "and": "And",
        "but": "But",
        "and when": "And when",
        "and then": "And then",
        "and given": "And given",
    }
    return mapping.get(k_low, k.strip().title())


def _split_top_level_bullets(raw: str) -> list[str]:
    items: list[str] = []
    current: list[str] = []
    for line in raw.splitlines():
        if re.match(r"^\s*[-*]\s+", line) or re.match(r"^\s*\d+\.\s+", line):
            stripped = line.lstrip()
            indent = len(line) - len(stripped)
            if indent <= 1:
                if current:
                    items.append("\n".join(current))
                current = [line]
            else:
                current.append(line)
        elif current:
            current.append(line)
    if current:
        items.append("\n".join(current))
    return items


def _first_sentence(text: str) -> str:
    """Pick the first prose sentence from a body, skipping headings/code/lists.

    Used as the sidebar subtitle for folder overviews — clients should be able
    to scan the tree and read each group's purpose without clicking in.
    """
    if not text:
        return ""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    for p in paras:
        if p.startswith(("#", "|", "-", "*", ">", "```")):
            continue
        # take up to first sentence-ending punctuation, capped at ~200 chars
        m = re.search(r"^(.+?[.!?])\s", p + " ")
        if m:
            return m.group(1).strip()
        return p[:200].strip()
    return ""


# ---------------------------------------------------------------------------
# spec loading
# ---------------------------------------------------------------------------

def load_spec(path: Path, root: Path, tree: str) -> Spec:
    text = path.read_text(encoding="utf-8")
    fm, body = split_frontmatter(text)
    title, sections = split_sections(body)

    rel = path.relative_to(root)
    parts = list(rel.parts)
    last = parts[-1]
    flat_business = tree == "business" and last.endswith(".business.md") and last != "spec.md"

    if last == "spec.md":
        parts = parts[:-1]
    elif last == "_index.md":
        parts = []
    elif flat_business:
        # `<domain>/<capability>.business.md` — strip filename, treat stem (minus
        # `.business`) as capability. Root-level `<capability>.business.md`
        # becomes a leaf with domain="" → bucketed under the root in the sidebar.
        stem = last[: -len(".business.md")]
        parts = parts[:-1] + [stem]

    if not parts:
        kind = "index"
        domain = ""
        capability = None
        default_id = "_index"
    elif len(parts) == 1:
        if flat_business:
            kind = "leaf"
            domain = ""
            capability = parts[0]
            default_id = parts[0]
        else:
            kind = "domain"
            domain = parts[0]
            capability = None
            default_id = domain
    else:
        kind = "leaf"
        domain = parts[0]
        capability = ".".join(parts[1:])
        default_id = f"{domain}.{capability}"

    warnings: list[str] = []

    spec_id = fm.get("id") or default_id
    status = (fm.get("status") or "draft").strip().lower()
    if status not in VALID_STATUS:
        warnings.append(f"unknown status '{status}' — defaulting to 'draft'")
        status = "draft"

    depends_on_raw = fm.get("depends_on") or []
    if isinstance(depends_on_raw, str):
        depends_on_raw = [depends_on_raw]
    depends_on = [str(d).strip() for d in depends_on_raw if str(d).strip()]

    # cross-tree links
    implements_raw = fm.get("implements") or []
    if isinstance(implements_raw, str):
        implements_raw = [implements_raw]
    implements = [str(d).strip() for d in implements_raw if str(d).strip()]

    implemented_by_raw = fm.get("implemented_by") or []
    if isinstance(implemented_by_raw, str):
        implemented_by_raw = [implemented_by_raw]
    implemented_by = [str(d).strip() for d in implemented_by_raw if str(d).strip()]

    if not title:
        title = spec_id.replace(".", " · ").replace("-", " ").title()

    intent = sections.get("intent", "").strip()
    entities_raw = sections.get("entities", "").strip()
    rules_raw = sections.get("rules", "").strip()
    ac_raw = sections.get("acceptance criteria", "").strip()
    notes_raw = sections.get("notes", "").strip()

    entities = parse_entities(entities_raw) if entities_raw else []
    rules = parse_rules(rules_raw) if rules_raw else []
    acceptance_criteria = parse_acceptance_criteria(ac_raw) if ac_raw else []
    notes, open_qs = parse_notes(notes_raw) if notes_raw else ([], [])

    # business specs intentionally have no acceptance criteria — they live
    # for outcomes, journeys, success metrics, not test contracts. Only
    # warn about missing AC on the developer tree.
    if kind == "leaf" and tree == "dev":
        if not intent:
            warnings.append("missing Intent section")
        if not acceptance_criteria:
            warnings.append("no acceptance criteria found")
        else:
            for ac in acceptance_criteria:
                keywords = {s.keyword.lower() for s in ac.steps}
                if "then" not in " ".join(keywords):
                    warnings.append(f"acceptance criterion '{ac.title}' has no Then step")

    return Spec(
        id=str(spec_id),
        domain=domain,
        capability=capability,
        kind=kind,
        tree=tree,
        path=str(rel).replace(os.sep, "/"),
        title=title,
        status=status,
        depends_on=depends_on,
        implements=implements,
        implemented_by=implemented_by,
        intent=intent,
        entities=entities,
        entities_raw=entities_raw,
        rules=rules,
        rules_raw=rules_raw,
        acceptance_criteria=acceptance_criteria,
        notes=notes,
        open_questions=open_qs,
        raw_body=body.strip(),
        warnings=warnings,
    )


def load_folder_overviews(root: Path, tree: str) -> list[FolderOverview]:
    """Walk every directory under `root` and pick up its overview doc.

    Folders without an overview are still recorded — with empty `body` —
    so the viewer can render a "no overview yet" placeholder for the gap.
    Visibility of the gap is the point: spec authors are more likely to
    write the overview when its absence is staring them in the face.
    """
    overviews: list[FolderOverview] = []
    if not root.exists():
        return overviews

    seen: set[str] = set()

    for dirpath in sorted([root] + [p for p in root.rglob("*") if p.is_dir()]):
        rel_dir = "" if dirpath == root else str(dirpath.relative_to(root)).replace(os.sep, "/")
        if rel_dir in seen:
            continue
        seen.add(rel_dir)

        chosen: tuple[Path, str] | None = None
        for fname in OVERVIEW_FILENAMES:
            candidate = dirpath / fname
            if candidate.exists() and candidate.is_file():
                chosen = (candidate, fname)
                break

        if chosen is None:
            overviews.append(FolderOverview(
                tree=tree,
                folder_path=rel_dir,
                file="",
                title=_folder_label(rel_dir, tree),
                body="",
                summary="",
            ))
            continue

        path, fname = chosen
        text = path.read_text(encoding="utf-8")
        _fm, body = split_frontmatter(text)
        title, _sections = split_sections(body)
        if not title:
            title = _folder_label(rel_dir, tree)
        # for the body shown in the right pane, keep the full raw body —
        # mdRender on the JS side handles headings/lists/code blocks.
        summary = _first_sentence(body)
        overviews.append(FolderOverview(
            tree=tree,
            folder_path=rel_dir,
            file=fname,
            title=title,
            body=body.strip(),
            summary=summary,
        ))
    return overviews


def _folder_label(rel_dir: str, tree: str) -> str:
    if not rel_dir:
        return "Business specs" if tree == "business" else "Developer specs"
    return rel_dir.split("/")[-1].replace("-", " ").replace("_", " ").title()


def load_all_specs(root: Path, tree: str) -> tuple[Spec | None, list[Spec]]:
    """Walk a single spec tree (dev or business) and parse all specs.

    Recognised filenames:
      - `spec.md`       — the standard nested layout (one folder per capability).
      - `_index.md`     — the project index at the tree root.
      - `*.business.md` — flat-layout business specs emitted by
        `specflow-new-project`. Treated as leaf specs whose `domain` is the
        parent folder (or "" at root) and whose `capability` is the filename
        stem (without `.business`). Only matched under the business tree to
        avoid surprising the dev tree, where every leaf lives under a
        capability folder by convention.

    Skips overview files (`_overview.md`, `README.md`) — those are handled
    by `load_folder_overviews`.
    """
    index: Spec | None = None
    specs: list[Spec] = []
    if not root.exists():
        return index, specs
    for path in sorted(root.rglob("*.md")):
        name = path.name
        is_business_flat = tree == "business" and name.endswith(".business.md")
        if name not in {"spec.md", "_index.md"} and not is_business_flat:
            continue
        if name in OVERVIEW_FILENAMES:
            # defensive — `_overview.md` shouldn't match the above checks but
            # guard anyway in case OVERVIEW_FILENAMES grows.
            continue
        try:
            spec = load_spec(path, root, tree)
        except Exception as exc:
            print(f"warning: failed to parse {path}: {exc}", file=sys.stderr)
            continue
        if spec.kind == "index":
            index = spec
        else:
            specs.append(spec)
    return index, specs


# ---------------------------------------------------------------------------
# tooling manifest extraction from _index.md
# ---------------------------------------------------------------------------

def extract_tooling_manifest(index: Spec | None) -> list[dict[str, str]]:
    if index is None:
        return []
    body = index.raw_body
    m = re.search(r"##+\s+tooling\s+manifest", body, re.IGNORECASE)
    if not m:
        return []
    remainder = body[m.end():]
    lines = remainder.splitlines()
    rows: list[dict[str, str]] = []
    in_table = False
    header: list[str] = []
    for line in lines:
        if line.strip().startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if not in_table:
                header = [c.lower() for c in cells]
                in_table = True
                continue
            if set("".join(cells)) <= set("-: "):
                continue
            if len(cells) >= 2:
                row = {header[i] if i < len(header) else f"col{i}": cells[i] for i in range(len(cells))}
                rows.append(row)
        elif in_table:
            break
    return rows


def extract_project_description(index: Spec | None) -> str:
    if index is None:
        return ""
    body = index.raw_body
    paras = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    for p in paras:
        if not p.startswith("#") and not p.startswith("|"):
            return p
    return ""


# ---------------------------------------------------------------------------
# link map (optional, emitted by specflow-onboard-codebase)
# ---------------------------------------------------------------------------

def load_link_map(path: Path | None) -> dict[str, Any] | None:
    """Load `link-map.md` if present — emitted by `specflow-onboard-codebase`.

    The link map is the canonical business↔dev mapping when an existing
    codebase has been reverse-engineered into specs. We prefer it over
    frontmatter when both are present, because it represents the most
    recent reconciliation pass. Per-spec `implements:` / `implemented_by:`
    frontmatter still provides authoritative defaults; the link map can
    add edges the frontmatter is missing and never *removes* an edge.

    Format expected (lenient — we just look for fenced YAML or a Markdown
    table, whichever appears first):

      ```yaml
      mappings:
        - business: outcomes.signup
          dev: [platform.auth-login, platform.auth-signup]
      ```

    Or a Markdown table with header `| Business | Dev |`.

    Returns the raw body alongside any parsed mappings so the dashboard can
    render the prose narrative the onboard skill leaves in this file.
    """
    if path is None or not path.exists():
        return None
    text = path.read_text(encoding="utf-8")

    mappings: list[dict[str, Any]] = []

    # try fenced YAML block first
    fence = re.search(r"```ya?ml\s*\n(.*?)\n```", text, re.DOTALL)
    if fence:
        try:
            data = yaml.safe_load(fence.group(1)) or {}
            raw = data.get("mappings") if isinstance(data, dict) else None
            if isinstance(raw, list):
                for entry in raw:
                    if not isinstance(entry, dict):
                        continue
                    biz = entry.get("business") or entry.get("biz")
                    devs = entry.get("dev") or entry.get("devs") or []
                    if isinstance(devs, str):
                        devs = [devs]
                    if biz:
                        mappings.append({"business": str(biz), "dev": [str(d) for d in devs]})
        except yaml.YAMLError:
            pass

    # fall back to a Markdown table (Business | Dev)
    if not mappings:
        in_table = False
        for line in text.splitlines():
            if line.strip().startswith("|"):
                cells = [c.strip() for c in line.strip().strip("|").split("|")]
                if not in_table:
                    if any("business" in c.lower() for c in cells) and any("dev" in c.lower() for c in cells):
                        in_table = True
                    continue
                if set("".join(cells)) <= set("-: "):
                    continue
                if len(cells) >= 2:
                    biz = cells[0]
                    devs = [d.strip() for d in re.split(r"[, ]+", cells[1]) if d.strip()]
                    mappings.append({"business": biz, "dev": devs})
            elif in_table:
                break

    return {"raw": text, "mappings": mappings}


def apply_link_map(specs: list[Spec], link_map: dict[str, Any] | None) -> None:
    """Fold link-map.md edges into the spec graph.

    The link map only *adds* edges — never removes — so frontmatter remains
    the source of truth for any edge it explicitly declares. Edges added
    here are recorded as warnings on both sides so the author knows where
    the ground truth came from.
    """
    if not link_map or not link_map.get("mappings"):
        return
    by_id = {s.id: s for s in specs}
    for edge in link_map["mappings"]:
        biz_id = edge.get("business")
        biz = by_id.get(biz_id)
        if biz is None or biz.tree != "business":
            continue
        for dev_id in edge.get("dev", []):
            dev = by_id.get(dev_id)
            if dev is None or dev.tree != "dev":
                continue
            if dev_id not in biz.implemented_by:
                biz.implemented_by.append(dev_id)
                biz.warnings.append(f"link-map.md added edge: implemented_by '{dev_id}'")
            if biz_id not in dev.implements:
                dev.implements.append(biz_id)
                dev.warnings.append(f"link-map.md added edge: implements '{biz_id}'")


# ---------------------------------------------------------------------------
# test results
# ---------------------------------------------------------------------------

def load_test_results(path: Path | None) -> dict[str, Any] | None:
    if path is None or not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"warning: invalid test-results JSON ({exc}) — ignoring", file=sys.stderr)
        return None
    if "results" not in data or not isinstance(data["results"], list):
        print("warning: test-results missing 'results' array — ignoring", file=sys.stderr)
        return None
    return data


# ---------------------------------------------------------------------------
# dependency + cross-link validation
# ---------------------------------------------------------------------------

def validate_dependencies(specs: list[Spec]) -> None:
    """Validate `depends_on` within each tree separately.

    Dependencies are within-tree only — a dev spec depends on other dev specs,
    a business spec on other business specs. Cross-tree links use
    `implements` / `implemented_by`.
    """
    dev_ids = {s.id for s in specs if s.tree == "dev"}
    biz_ids = {s.id for s in specs if s.tree == "business"}
    for s in specs:
        known = dev_ids if s.tree == "dev" else biz_ids
        for dep in s.depends_on:
            if dep not in known:
                s.warnings.append(f"depends_on references unknown spec '{dep}'")


def validate_and_complete_cross_links(specs: list[Spec]) -> None:
    """Reconcile `implements` / `implemented_by` across the two trees.

    Behaviour:
    1. If a dev spec has `implements: [biz.x]` but `biz.x` doesn't list this
       dev spec in `implemented_by`, the back-link is added automatically
       and a warning is recorded on the business spec — the gap is real
       (one side forgot to update) and surfacing it nudges the author.
    2. Same in the reverse direction.
    3. If a side references an ID that doesn't exist in the other tree, a
       warning is recorded and the link is dropped.
    4. Any leaf dev spec with no `implements` is flagged "Unmapped" — the
       viewer renders a visible badge so the spec author can fix it.
    """
    dev_by_id = {s.id: s for s in specs if s.tree == "dev"}
    biz_by_id = {s.id: s for s in specs if s.tree == "business"}

    # forward: dev → business
    for s in specs:
        if s.tree != "dev":
            continue
        cleaned: list[str] = []
        for biz_id in s.implements:
            biz = biz_by_id.get(biz_id)
            if biz is None:
                s.warnings.append(f"implements references unknown business spec '{biz_id}'")
                continue
            cleaned.append(biz_id)
            if s.id not in biz.implemented_by:
                biz.implemented_by.append(s.id)
                biz.warnings.append(
                    f"back-link added: dev spec '{s.id}' declares 'implements: {biz_id}' "
                    f"but this business spec did not list it under 'implemented_by'"
                )
        s.implements = cleaned

    # reverse: business → dev
    for s in specs:
        if s.tree != "business":
            continue
        cleaned: list[str] = []
        for dev_id in s.implemented_by:
            dev = dev_by_id.get(dev_id)
            if dev is None:
                s.warnings.append(f"implemented_by references unknown dev spec '{dev_id}'")
                continue
            cleaned.append(dev_id)
            if s.id not in dev.implements:
                dev.implements.append(s.id)
                dev.warnings.append(
                    f"forward-link added: business spec '{s.id}' lists this dev spec in "
                    f"'implemented_by' but 'implements' was not set here"
                )
        s.implemented_by = cleaned

    # unmapped dev specs — only meaningful if a business tree exists at all
    business_tree_present = any(s.tree == "business" for s in specs)
    if business_tree_present:
        for s in specs:
            if s.tree == "dev" and s.kind == "leaf" and not s.implements:
                # not a hard warning — it lives as a UI badge — but record it
                # in the spec health panel too so it shows up in the rollup.
                s.warnings.append("unmapped: no business spec links via 'implements:'")


# ---------------------------------------------------------------------------
# test discovery — scan source for test files referencing spec IDs or AC refs
# ---------------------------------------------------------------------------

TEST_FILE_PATTERNS = [
    re.compile(r"\.spec\.[jt]sx?$"),
    re.compile(r"\.test\.[jt]sx?$"),
    re.compile(r"\.gate\.[jt]sx?$"),
    re.compile(r"\.validation\.[jt]sx?$"),
    re.compile(r"\.certification\.[jt]sx?$"),
]

DESCRIBE_RE = re.compile(r"""(?:describe|context)\s*\(\s*(['"`])(.+?)\1""", re.DOTALL)
IT_RE = re.compile(r"""(?:it|test)\s*\(\s*(['"`])(.+?)\1""", re.DOTALL)
# pattern: test_<domain>_<capability>__<criterion_snake_case>
TEST_NAME_RE = re.compile(r"^test_(.+?)__(.+)$")


def _normalise_for_match(text: str) -> str:
    """Normalise an AC title or test suffix to a comparable form.

    Strips punctuation, lowercases, replaces whitespace/underscores/hyphens
    with single spaces, so both sides meet in the middle:
      AC:   "Matching number-of-cases row — returns normalised envelope"
      Test: "matching_row_returns_normalised_envelope"
    Both become something comparable.
    """
    text = text.lower()
    # strip markdown-style punctuation: em-dashes, backticks, parens, quotes
    text = re.sub(r"[—–`()\[\]\"':,;.!?/]", " ", text)
    # underscores and hyphens to spaces
    text = re.sub(r"[_\-]+", " ", text)
    # collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def discover_tests(
    project_root: Path,
    spec_ids: set[str],
    specs: list[Spec],
) -> list[dict[str, Any]]:
    """Walk the project for test files and link them to spec ACs.

    The matching logic understands two naming conventions:

    1. **Structured test names** (DF Pro convention):
       `test_<domain>_<capability>__<criterion_snake_case>`
       The part before `__` maps to a spec ID; the part after `__` maps to
       an acceptance criterion title (fuzzy-matched).

    2. **Describe-block spec refs**:
       `describe('<domain>.<capability> -- <Tier>', ...)` — the domain.capability
       segment is matched against spec IDs (with and without common prefixes).

    Returns a list of dicts with keys:
      spec_id, ac_ref, intent, describe, file, code, tier
    """
    # build AC lookup: spec_id → [(normalised_title, original_title)]
    ac_lookup: dict[str, list[tuple[str, str]]] = {}
    for spec in specs:
        if spec.tree != "dev":
            continue
        for ac in spec.acceptance_criteria:
            norm = _normalise_for_match(ac.title)
            ac_lookup.setdefault(spec.id, []).append((norm, ac.title))

    # build spec ID variants for flexible matching
    # e.g. "dynamic-form-pro.cardinality.update-cardinality" should match
    # describe block "cardinality.update-cardinality" (no prefix)
    id_by_suffix: dict[str, str] = {}  # suffix → canonical spec_id
    id_by_underscore: dict[str, str] = {}  # underscore variant → canonical
    for sid in spec_ids:
        # strip common project prefixes
        parts = sid.split(".")
        for i in range(len(parts)):
            suffix = ".".join(parts[i:])
            id_by_suffix.setdefault(suffix.lower(), sid)
        # underscore variant: "dynamic-form-pro.cardinality.update-cardinality"
        # → "dynamic_form_pro_cardinality_update_cardinality"
        underscore = sid.lower().replace(".", "_").replace("-", "_")
        id_by_underscore[underscore] = sid
        # also without common prefix
        for i in range(len(parts)):
            suffix_under = "_".join(parts[i:]).lower().replace("-", "_")
            id_by_underscore.setdefault(suffix_under, sid)

    discovered: list[dict[str, Any]] = []
    test_dirs = []
    for candidate in ["tests", "test", "__tests__", "src"]:
        d = project_root / candidate
        if d.is_dir():
            test_dirs.append(d)
    if not test_dirs:
        test_dirs = [project_root]

    for root_dir in test_dirs:
        for path in sorted(root_dir.rglob("*")):
            if not path.is_file():
                continue
            if not any(p.search(str(path)) for p in TEST_FILE_PATTERNS):
                continue

            try:
                source = path.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue

            rel_path = str(path.relative_to(project_root)).replace(os.sep, "/")

            # detect tier from path (tests/gate/..., tests/validation/..., etc.)
            tier = ""
            for t in ["gate", "validation", "certification"]:
                if f"/{t}/" in rel_path or rel_path.startswith(f"{t}/"):
                    tier = t
                    break

            # extract describe blocks → find spec IDs
            describes = [m.group(2) for m in DESCRIBE_RE.finditer(source)]
            file_spec_ids: set[str] = set()

            for desc in describes:
                # pattern: "<domain>.<capability> -- <Tier>"
                desc_clean = re.sub(r"\s*--\s*.*$", "", desc).strip()
                match_sid = id_by_suffix.get(desc_clean.lower())
                if match_sid:
                    file_spec_ids.add(match_sid)

            # also check file header comments for spec refs
            header = source[:500].lower()
            for sid in spec_ids:
                if sid.lower() in header:
                    file_spec_ids.add(sid)

            if not file_spec_ids:
                continue

            # extract it/test blocks
            its = list(IT_RE.finditer(source))

            for it_match in its:
                intent = it_match.group(2).strip()
                # try structured name: test_domain_cap__criterion
                name_match = TEST_NAME_RE.match(intent)

                matched_spec_id = ""
                ac_title = ""

                if name_match:
                    prefix_part = name_match.group(1)
                    criterion_part = name_match.group(2)

                    # resolve prefix to a spec ID
                    resolved = id_by_underscore.get(prefix_part.lower())
                    if resolved:
                        matched_spec_id = resolved
                    else:
                        # fall back to file-level spec IDs
                        if len(file_spec_ids) == 1:
                            matched_spec_id = next(iter(file_spec_ids))

                    # resolve criterion to an AC title via fuzzy match
                    if matched_spec_id:
                        norm_criterion = _normalise_for_match(criterion_part)
                        acs = ac_lookup.get(matched_spec_id, [])
                        best_score = 0.0
                        for norm_ac, orig_ac in acs:
                            # simple containment-based score
                            words_test = set(norm_criterion.split())
                            words_ac = set(norm_ac.split())
                            if not words_ac:
                                continue
                            overlap = len(words_test & words_ac)
                            score = overlap / max(len(words_ac), 1)
                            if score > best_score:
                                best_score = score
                                ac_title = orig_ac
                        # require at least 40% word overlap
                        if best_score < 0.4:
                            ac_title = ""
                else:
                    # no structured name — use file-level spec match
                    if len(file_spec_ids) == 1:
                        matched_spec_id = next(iter(file_spec_ids))

                if not matched_spec_id:
                    continue

                # extract code snippet around the it block (up to 30 lines)
                start = it_match.start()
                snippet = source[start:start + 2000]
                # find the closing of the it() — count braces
                brace_count = 0
                end_pos = 0
                started = False
                for ci, ch in enumerate(snippet):
                    if ch == "{":
                        brace_count += 1
                        started = True
                    elif ch == "}":
                        brace_count -= 1
                        if started and brace_count == 0:
                            end_pos = ci + 1
                            break
                code = snippet[:end_pos] if end_pos > 0 else "\n".join(snippet.split("\n")[:20])

                discovered.append({
                    "spec_id": matched_spec_id,
                    "ac_ref": ac_title.lower().strip() if ac_title else "",
                    "intent": intent,
                    "describe": describes[0] if describes else "",
                    "file": rel_path,
                    "code": code,
                    "tier": tier,
                })

    return discovered


# ---------------------------------------------------------------------------
# emit
# ---------------------------------------------------------------------------

def to_jsonable(spec: Spec) -> dict[str, Any]:
    d = asdict(spec)
    d["acceptance_criteria"] = [
        {"title": ac.title, "steps": [asdict(s) for s in ac.steps], "raw": ac.raw}
        for ac in spec.acceptance_criteria
    ]
    d["entities"] = [asdict(e) for e in spec.entities]
    return d


def build_tree_payload(index: Spec | None, specs: list[Spec], overviews: list[FolderOverview]) -> dict[str, Any]:
    """Build the per-tree slice of the payload (spec list, domain rollup, overviews).

    Each tree (dev, business) has its own sidebar, its own status counts,
    and its own folder overviews. The viewer toggles between them.
    """
    status_counts: dict[str, int] = {k: 0 for k in VALID_STATUS}
    for s in specs:
        status_counts[s.status] = status_counts.get(s.status, 0) + 1

    domains: dict[str, dict[str, Any]] = {}
    for s in specs:
        if s.kind == "leaf":
            bucket = domains.setdefault(s.domain, {"domain": s.domain, "domain_spec": None, "leaves": []})
            bucket["leaves"].append(s.id)
        elif s.kind == "domain":
            bucket = domains.setdefault(s.domain, {"domain": s.domain, "domain_spec": None, "leaves": []})
            bucket["domain_spec"] = s.id

    for d in domains.values():
        d["leaves"].sort()
    domain_list = sorted(domains.values(), key=lambda d: d["domain"])

    # group overviews by folder_path for fast lookup in the JS
    overviews_by_path = {o.folder_path: asdict(o) for o in overviews}

    return {
        "index_raw": index.raw_body if index else "",
        "index_title": index.title if index else "",
        "status_counts": status_counts,
        "domains": domain_list,
        "specs": [to_jsonable(s) for s in specs],
        "overviews": overviews_by_path,
    }


def build_payload(
    dev_index: Spec | None,
    dev_specs: list[Spec],
    dev_overviews: list[FolderOverview],
    biz_index: Spec | None,
    biz_specs: list[Spec],
    biz_overviews: list[FolderOverview],
    test_results: dict[str, Any] | None,
    link_map: dict[str, Any] | None,
    title_override: str | None,
    discovered_tests: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    project_title = title_override or (
        (dev_index and dev_index.title)
        or (biz_index and biz_index.title)
        or "Specflow Project"
    )
    project_description = (
        extract_project_description(dev_index)
        or extract_project_description(biz_index)
        or ""
    )
    tooling = extract_tooling_manifest(dev_index) or extract_tooling_manifest(biz_index)

    all_warnings: list[dict[str, str]] = []
    for s in dev_specs + biz_specs:
        for w in s.warnings:
            all_warnings.append({"spec_id": s.id, "tree": s.tree, "message": w})

    business_present = bool(biz_specs) or bool(biz_index) or any(o.body for o in biz_overviews)

    return {
        "project": {
            "title": project_title,
            "description": project_description,
            "tooling": tooling,
        },
        "trees": {
            "dev": build_tree_payload(dev_index, dev_specs, dev_overviews),
            "business": build_tree_payload(biz_index, biz_specs, biz_overviews),
        },
        # default to business when both exist — the rendered HTML is for clients,
        # and clients want the business view first.
        "default_tree": "business" if business_present else "dev",
        "business_present": business_present,
        "test_results": test_results,
        "discovered_tests": discovered_tests or [],
        "link_map": link_map,  # null if no link-map.md present
        "warnings": all_warnings,
    }


def render(template: str, payload: dict[str, Any], title: str) -> str:
    blob = json.dumps(payload, ensure_ascii=False)
    blob = blob.replace("</", "<\\/")

    out = template
    out = out.replace("<!--__TITLE__-->", _html_escape(title))
    out = out.replace("/*__SPEC_DATA__*/ null", blob)
    return out


def _html_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="Build a self-contained specs.html viewer")
    ap.add_argument("--specs-dir", default=".specflow/specs", help="path to developer specs (default: ./.specflow/specs)")
    ap.add_argument("--business-dir", default=".specflow/specs-business", help="path to business specs (default: ./.specflow/specs-business)")
    ap.add_argument("--out", default="specs.html", help="output file (default: ./specs.html)")
    ap.add_argument("--test-results", default=None, help="path to test-results.json (default: ./test-results.json if present)")
    ap.add_argument("--link-map", default=None, help="path to link-map.md (default: ./link-map.md if present)")
    ap.add_argument("--title", default=None, help="override project title")
    ap.add_argument("--discover-tests", action="store_true", default=False,
                     help="scan project for test files and link them to spec acceptance criteria")
    ap.add_argument("--tests-dir", default=None,
                     help="directory to scan for test files (default: project root)")
    args = ap.parse_args()

    dev_root = Path(args.specs_dir).resolve()
    biz_root = Path(args.business_dir).resolve()

    if not dev_root.exists() or not dev_root.is_dir():
        print(f"error: developer specs directory not found: {dev_root}", file=sys.stderr)
        return 1

    template_path = Path(__file__).resolve().parent.parent / "assets" / "template.html"
    if not template_path.exists():
        print(f"error: template not found at {template_path}", file=sys.stderr)
        return 1

    dev_index, dev_specs = load_all_specs(dev_root, "dev")
    dev_overviews = load_folder_overviews(dev_root, "dev")

    biz_present = biz_root.exists() and biz_root.is_dir()
    if biz_present:
        biz_index, biz_specs = load_all_specs(biz_root, "business")
        biz_overviews = load_folder_overviews(biz_root, "business")
    else:
        biz_index, biz_specs, biz_overviews = None, [], []

    all_specs = dev_specs + biz_specs

    # link-map.md (optional, emitted by specflow-onboard-codebase) is folded in
    # *before* cross-link validation so its added edges get the same back-link
    # reconciliation treatment as frontmatter-declared edges.
    lm_path: Path | None
    if args.link_map:
        lm_path = Path(args.link_map).resolve()
    else:
        candidate = Path.cwd() / "link-map.md"
        lm_path = candidate if candidate.exists() else None
    link_map = load_link_map(lm_path)
    apply_link_map(all_specs, link_map)

    validate_dependencies(all_specs)
    validate_and_complete_cross_links(all_specs)

    tr_path: Path | None
    if args.test_results:
        tr_path = Path(args.test_results).resolve()
    else:
        candidate = Path.cwd() / "test-results.json"
        tr_path = candidate if candidate.exists() else None
    test_results = load_test_results(tr_path)

    # test discovery — always attempt if tests/ exists, can also be forced with --discover-tests
    discovered_tests: list[dict[str, Any]] = []
    scan_root = Path(args.tests_dir).resolve() if args.tests_dir else Path.cwd()
    tests_dir_exists = (scan_root / "tests").is_dir() or (scan_root / "test").is_dir()
    if args.discover_tests or tests_dir_exists:
        dev_spec_ids = {s.id for s in dev_specs}
        discovered_tests = discover_tests(scan_root, dev_spec_ids, dev_specs)
        if discovered_tests:
            print(f"  test discovery: found {len(discovered_tests)} test→spec links across {len({t['file'] for t in discovered_tests})} files")

    payload = build_payload(
        dev_index, dev_specs, dev_overviews,
        biz_index, biz_specs, biz_overviews,
        test_results, link_map, args.title,
        discovered_tests=discovered_tests,
    )
    template = template_path.read_text(encoding="utf-8")
    html = render(template, payload, payload["project"]["title"])

    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")

    # summary
    dev_counts = payload["trees"]["dev"]["status_counts"]
    dev_counts_str = ", ".join(f"{v} {k}" for k, v in dev_counts.items() if v)
    biz_counts = payload["trees"]["business"]["status_counts"]
    biz_counts_str = ", ".join(f"{v} {k}" for k, v in biz_counts.items() if v)

    dev_overview_filled = sum(1 for o in dev_overviews if o.body)
    biz_overview_filled = sum(1 for o in biz_overviews if o.body)

    tr_note = (
        f"loaded {len(test_results['results'])} test results"
        if test_results
        else "no test-results.json"
    )
    unmapped = sum(
        1 for s in dev_specs
        if s.kind == "leaf" and not s.implements and biz_present
    )

    print(f"spec-viewer: wrote {out_path}")
    print(f"  dev specs: {len(dev_specs)} ({dev_counts_str or 'none'})")
    print(f"  dev folder overviews: {dev_overview_filled}/{len(dev_overviews)} written")
    if biz_present:
        print(f"  business specs: {len(biz_specs)} ({biz_counts_str or 'none'})")
        print(f"  business folder overviews: {biz_overview_filled}/{len(biz_overviews)} written")
        print(f"  unmapped dev specs (no `implements:`): {unmapped}")
    else:
        print(f"  business tree: not present (no .specflow/specs-business/ directory)")
    if link_map:
        print(f"  link-map.md: loaded ({len(link_map.get('mappings', []))} mappings)")
    else:
        print(f"  link-map.md: not found (cross-links come from frontmatter only)")
    print(f"  tests: {tr_note}")
    if payload["warnings"]:
        print(f"  warnings: {len(payload['warnings'])} (see 'Spec health' panel in the viewer)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
