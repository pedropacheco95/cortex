# project-index

The shared cross-reference resolution index (id-to-path, path-to-frontmatter) built once per validation run and threaded through every check that resolves ids or relative paths.

## Files

- src/schema/index-build.ts

## Related concepts

- validation-checks — co-members of cluster:schema-validator: buildIndex is threaded through every id-resolving check
