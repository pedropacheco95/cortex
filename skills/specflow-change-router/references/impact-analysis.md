# Impact Analysis Reference

Impact in a two-layer Specflow project propagates through **four** channels. The cross-layer channel is critical — read it before acting on any spec change.

## 1. Direct dependency (`depends_on`) — within the dev layer

Grep all dev spec files for the changed spec's ID in `depends_on`:
```
grep -r "depends_on:.*changed.spec.id" .specflow/specs/
```
These dev specs explicitly depend on the changed spec. If the change alters an entity, API contract, or behavioral rule, dependents need review.

## 2. Entity sharing — within the dev layer

If the change modifies an entity (adds/removes/changes a field), find all dev specs that reference that entity:
```
grep -r "EntityName" .specflow/specs/
```
Any spec using the entity in Rules or Acceptance Criteria may be affected.

## 3. Transitive closure — within the dev layer

Dependencies chain. If A → B → C, changing C affects both B and A. Walk the full dependency graph.

## 4. Cross-layer propagation — between business and dev layers

This is the channel that catches drift. Whenever a spec changes:

### When a developer spec changes

1. Read its `implements:` frontmatter — the single business spec it serves.
2. Ask: **does that business spec's outcome / journey / metric description still match what the dev spec now does?**
   - If yes → mapping is intact, no business-side change needed.
   - If no → flag drift. Propose updating the business spec in the same change set.
3. If `implements:` is missing or empty → **unmapped**. Flag this before proceeding (see Change Router Category 9).

### When a business spec changes

1. Read its `implemented_by:` frontmatter — list of dev specs that realize it.
2. For each linked dev spec, ask: **do its rules and acceptance criteria still satisfy the new business outcome?**
   - If yes → mapping intact.
   - If no → list the dev specs that need updating; treat as a multi-spec change set.
3. If `implemented_by:` is missing or empty → **unmapped**. Either no implementation exists yet (the business spec is forward-looking — mark `status: draft`) or the link was never written (find the dev specs and add the link).

### Folder overview impact

Independent of layer, ask: does the change alter what the **group** of specs is about?

- New capability added → parent domain folder's `_overview.md` likely needs a one-line mention.
- Capability removed → same.
- Whole new domain → root `_overview.md` AND the new domain's `_overview.md`.
- Pure leaf-spec edit (rule/threshold/criterion inside one capability) → usually no overview impact.

Check both `.specflow/specs/<domain>/_overview.md` and `.specflow/specs-business/<domain>/_overview.md`.

## Risk levels

**Low risk** — Change is isolated to one leaf spec on one layer, mapping intact, no overview impact.

**Medium risk** — Change has dev-side dependents, or modifies an entity referenced by 5+ specs, or requires a counterpart update on the other layer, or touches one folder overview.

**High risk** — Change modifies a core entity, sits at the root of a deep dependency chain, requires updates across multiple business specs and their dev counterparts, or restructures a domain (overviews + multiple capabilities + cross-layer rewires).

## Execution order for changes

Always execute in this order:

1. Update spec(s) on the **originating layer** (whichever layer the change starts on).
2. Cross-layer check — update counterpart spec(s) on the other layer if drift was detected.
3. Update folder `_overview.md` files if grouping changed.
4. Coherence check — verify no circular `depends_on`, no broken `implements:` / `implemented_by:` links, no contradictions, no orphans.
5. Human reviews all updated specs (both layers + overviews).
6. Regenerate affected dev slices — tests first, then implementation.
7. Run tests for changed dev specs.
8. Run regression suite for all transitively-dependent dev specs.
9. Update `build-order.md` if the dev dependency graph changed.
