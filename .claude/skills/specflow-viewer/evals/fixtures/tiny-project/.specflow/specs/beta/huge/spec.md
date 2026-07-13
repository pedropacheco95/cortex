---
id: beta.huge
status: implemented
depends_on: [alpha.onboarding, alpha.billing]
---

# Search API

## Intent

The search API accepts structured queries and returns ranked results. Exercises the viewer's handling of many acceptance criteria (12).

## Entities

- **`Query`** — user's search payload with `text`, `filters`, `sort`.
- **`Result`** — one hit with `id`, `score`, `snippet`, `entity_type`.

## Rules

1. Queries shorter than 2 chars are rejected with `400`.
2. Filters are AND-combined across fields and OR-combined within a field.
3. Pagination is cursor-based, max 100 per page.
4. Empty result sets return `200` with `[]`, not `404`.

## Acceptance Criteria

### Basic text match
- **Given** an indexed document containing "hello world"
- **When** `GET /search?q=hello`
- **Then** the document appears in the results

### Case-insensitive match
- **Given** an indexed document containing "Foo"
- **When** `GET /search?q=foo`
- **Then** the document appears in the results

### Query too short
- **Given** any corpus
- **When** `GET /search?q=a`
- **Then** the response is `400` with `code: QUERY_TOO_SHORT`

### Filter narrows results
- **Given** a corpus with documents of types A and B
- **When** `GET /search?q=*&type=A`
- **Then** only type-A documents are returned

### Multi-field AND
- **Given** a corpus with attributes `type` and `status`
- **When** `GET /search?q=*&type=A&status=open`
- **Then** only docs matching both filters are returned

### Same-field OR
- **Given** a corpus with types A, B, C
- **When** `GET /search?q=*&type=A&type=B`
- **Then** docs of type A or B are returned

### Cursor pagination
- **Given** a result set of 250 docs
- **When** the client requests page 1 with page size 100
- **Then** the response contains 100 results and a `next_cursor`

### Empty results
- **Given** a query that matches nothing
- **When** `GET /search?q=nomatch`
- **Then** the response is `200` with `results: []`

### Ranking respects recency
- **Given** two equally-relevant documents with different `updated_at`
- **When** searching for their shared keyword
- **Then** the more recently updated doc ranks higher

### Snippet includes match
- **Given** a document containing "quick brown fox"
- **When** searching for "brown"
- **Then** the `snippet` field contains "brown" with surrounding context

### Sort override
- **Given** the default relevance ranking
- **When** the client passes `sort=created_at:desc`
- **Then** results are ordered by `created_at` descending

### Rate limiting
- **Given** a client that has made 100 requests in the last minute
- **When** they issue a 101st request
- **Then** the response is `429` with a `Retry-After` header

## Notes

- Elasticsearch is the backing index.
- OPEN: do we expose score in the API or just use it for ordering?
- OPEN: faceted aggregations — is that a v2 feature?
