# Environment Provisioning

This document describes how to create a sandbox environment for testing a Specflow project.
The goal is a fully isolated, reproducible environment where the application can run end-to-end
with all its dependencies, independent of any external service.

## Principle

The test environment must be self-contained. Every dependency the application needs — database,
cache, queue, object storage, third-party API — runs locally in the sandbox or is replaced by
a faithful mock. Nothing reaches the internet. Nothing depends on state from a previous run.

## Assessment Phase

Before creating anything, the agent reads the project and produces an environment manifest.
This is the analysis step — no files are created yet.

### What to scan

1. **`.specflow/specs/_index.md`** — the Stack section lists frameworks, languages, databases, and
   deployment targets. This is the primary source.
2. **Existing infrastructure files** — `docker-compose.yml`, `Dockerfile`, `.env`, CI configs.
   If these exist, the test environment extends them rather than replacing them.
3. **Spec entities** — which database(s) are needed, what schemas must exist.
4. **Spec rules referencing external services** — payment processors, email providers, LLM APIs,
   file storage. Each needs a mock or stub in the sandbox.
5. **`package.json` / `requirements.txt` / equivalent** — runtime dependencies that imply
   infrastructure needs (e.g., `redis` package implies a Redis instance).

### Environment manifest

The agent produces a manifest (internal working document, not a deliverable) listing:

```
Infrastructure components:
  - [component]: [version] — [why needed]
  - e.g., PostgreSQL 16 — primary data store per .specflow/specs/_index.md
  - e.g., Redis 7 — Celery broker per .specflow/specs/_index.md

External service mocks:
  - [service]: [mock strategy]
  - e.g., OpenRouter API — mock server returning fixture responses
  - e.g., Stripe — stripe-mock container

Application services:
  - [service]: [how to build/run]
  - e.g., FastAPI backend — Dockerfile from existing, or generate
  - e.g., React frontend — Dockerfile from existing, or generate
  - e.g., Celery worker — same image as backend, different entrypoint

Environment variables:
  - [var]: [test value]
  - All secrets set to test values, all URLs point to sandbox services
```

## Provisioning Strategy

### When infrastructure files already exist

If the project has a `docker-compose.yml` and `Dockerfile`(s), create a test overlay:

1. **`docker-compose.test.yml`** — extends the existing compose file with test-specific
   configuration. Overrides ports to avoid conflicts. Adds mock services. Sets environment
   variables to test values. Adds health checks if missing.

2. **`.env.test`** — environment file with all variables set to sandbox-safe values.
   Database URLs point to the test compose services. API keys are test/mock values.
   No real credentials.

3. **Test entrypoint script** (`scripts/test-env.sh`) — orchestrates: start compose,
   wait for health checks, run seed script, execute tests, tear down.

### When infrastructure files do not exist

If the project has no Docker setup, the agent creates everything from scratch:

1. **Dockerfiles** — one per application service. Use multi-stage builds. Keep images minimal.
   The agent reads the project's package manager and framework to determine the base image
   and build steps.

2. **`docker-compose.test.yml`** — defines all services, networks, and volumes for testing.
   Does not assume a production compose file exists.

3. **`.env.test`** — same as above.

4. **Test entrypoint script** — same as above, but also handles first-time setup
   (database creation, migration running).

### What the agent generates

Regardless of starting point, the agent ensures these files exist in the project:

```
docker-compose.test.yml     # Test environment definition
.env.test                   # Test environment variables
scripts/
├── test-env-up.sh          # Start sandbox, wait for health, seed data
├── test-env-down.sh        # Tear down sandbox, clean volumes
├── test-env-seed.sh        # Run seed script against sandbox DB
└── test-env-run.sh         # Execute a specific test layer
```

## Docker Compose Test File Structure

The compose file follows this pattern:

```yaml
# docker-compose.test.yml

services:
  # --- Infrastructure ---
  db-test:
    image: postgres:16-alpine     # or mysql, mongo — matches project stack
    environment:
      POSTGRES_DB: testdb
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
    ports:
      - "5433:5432"               # offset port to avoid conflicts
    volumes:
      - test-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U testuser -d testdb"]
      interval: 2s
      timeout: 5s
      retries: 10

  cache-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 2s
      timeout: 5s
      retries: 10

  # --- Mock services (only if specs reference external APIs) ---
  mock-api:
    build:
      context: ./tests/mocks
      dockerfile: Dockerfile.mockserver
    ports:
      - "9090:9090"

  # --- Application services ---
  backend-test:
    build:
      context: .
      dockerfile: Dockerfile       # reuse existing or generated
    environment:
      DATABASE_URL: postgresql://testuser:testpass@db-test:5432/testdb
      REDIS_URL: redis://cache-test:6379/0
      EXTERNAL_API_URL: http://mock-api:9090  # points to mock
    depends_on:
      db-test:
        condition: service_healthy
      cache-test:
        condition: service_healthy
    # No port mapping needed — tests run inside the network

  worker-test:
    build:
      context: .
      dockerfile: Dockerfile
    command: celery -A app worker   # or equivalent
    environment:
      DATABASE_URL: postgresql://testuser:testpass@db-test:5432/testdb
      REDIS_URL: redis://cache-test:6379/0
    depends_on:
      db-test:
        condition: service_healthy
      cache-test:
        condition: service_healthy

volumes:
  test-db-data:

networks:
  default:
    name: specflow-test-net
```

This is a template. The agent adapts it to the actual project stack. A Next.js + Supabase
project looks different from a FastAPI + Postgres project. The structure stays the same:
infrastructure first, mocks second, application services third.

## Mock Services

When specs reference external services (payment APIs, LLM providers, email services, SMS
gateways), the sandbox needs mock versions.

### Mock strategy selection

| External service type | Mock approach |
|----------------------|---------------|
| REST API with simple request/response | WireMock or custom mock server returning fixture JSON |
| LLM / AI API | Mock server with fixture responses per prompt pattern |
| Payment processor | Official test containers if available (stripe-mock), else WireMock |
| Email / SMS | In-memory capture server (Mailhog, fake SMS endpoint) |
| Object storage (S3-compatible) | MinIO container |
| OAuth / auth provider | Mock endpoint returning test tokens |

### Mock response fixtures

Mock responses are derived from spec acceptance criteria. If a criterion says "Then the API
returns a coaching analysis with 3 recommendations," the mock LLM response fixture contains
exactly that structure. Mock fixtures live in `tests/mocks/fixtures/` and are committed.

## Health Check Protocol

The test entrypoint script must wait for all services to be healthy before running tests.
The wait logic follows this sequence:

1. Start `docker compose -f docker-compose.test.yml up -d`
2. For each service with a healthcheck, poll until healthy or timeout (60s default)
3. Run database migrations against the test database
4. Execute the seed script
5. Run the requested test layer
6. Tear down with `docker compose -f docker-compose.test.yml down -v`

The `-v` flag on teardown removes volumes, ensuring a clean state for the next run.

## Test Entrypoint Scripts

### `scripts/test-env-up.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.test.yml"
ENV_FILE=".env.test"
TIMEOUT=60

echo "Starting test environment..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo "Waiting for services..."
elapsed=0
until docker compose -f "$COMPOSE_FILE" ps --format json | \
      python3 -c "import sys,json; services=json.loads(sys.stdin.read()); \
      sys.exit(0 if all(s.get('Health','') == 'healthy' or s.get('State') == 'running' \
      for s in services) else 1)" 2>/dev/null; do
  sleep 2
  elapsed=$((elapsed + 2))
  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    echo "ERROR: Services did not become healthy within ${TIMEOUT}s"
    docker compose -f "$COMPOSE_FILE" logs
    exit 1
  fi
done

echo "Running migrations..."
# Adapt to the project's migration tool:
#   Alembic:  docker compose -f "$COMPOSE_FILE" exec backend-test python -m alembic upgrade head
#   Prisma:   docker compose -f "$COMPOSE_FILE" exec backend-test npx prisma migrate deploy
#   Knex:     docker compose -f "$COMPOSE_FILE" exec backend-test npx knex migrate:latest
#   Django:   docker compose -f "$COMPOSE_FILE" exec backend-test python manage.py migrate
#   Strapi:   (auto-syncs on start — no migration command needed)
docker compose -f "$COMPOSE_FILE" exec backend-test <MIGRATION_COMMAND>

echo "Seeding test data..."
./scripts/test-env-seed.sh

echo "Test environment ready."
```

### `scripts/test-env-down.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.test.yml"

echo "Tearing down test environment..."
docker compose -f "$COMPOSE_FILE" down -v --remove-orphans
echo "Done."
```

### `scripts/test-env-run.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

LAYER="${1:?Usage: test-env-run.sh <atomic|spec|journey|scenario>}"
COMPOSE_FILE="docker-compose.test.yml"

case "$LAYER" in
  atomic)
    echo "Running Atomic tests (one per criterion, mocked)..."
    # Atomic tests run outside Docker — they mock all dependencies
    pytest tests/atomic/ -v --tb=short -q  # Adapt: jest, vitest, go test, etc.
    ;;
  spec)
    echo "Running Spec tests (all criteria per spec, sequenced)..."
    # Spec tests also run outside Docker by default
    pytest tests/spec/ -v --tb=short -q  # Adapt: jest, vitest, go test, etc.
    ;;
  journey)
    echo "Running Journey tests (business spec journeys, real infra)..."
    # Journey tests run against the Docker services
    ./scripts/test-env-up.sh
    pytest tests/journey/ -v --tb=short -q  # Adapt: jest, vitest, go test, etc.
    RESULT=$?
    ./scripts/test-env-down.sh
    exit $RESULT
    ;;
  scenario)
    echo "Running Scenario tests (cross-journey workflows, full sandbox)..."
    # Scenario tests run full app in sandbox
    ./scripts/test-env-up.sh
    pytest tests/scenario/ -v --tb=short -q  # Adapt: jest, vitest, go test, etc.
    RESULT=$?
    ./scripts/test-env-down.sh
    exit $RESULT
    ;;
  *)
    echo "Unknown layer: $LAYER"
    echo "Usage: test-env-run.sh <atomic|spec|journey|scenario>"
    exit 1
    ;;
esac
```

These are templates. The agent adapts the test runner command (`pytest`, `vitest`, `jest`,
`go test`, etc.) to the project's test framework. The structure — up, seed, run, down —
stays the same regardless of stack. Atomic and spec layers run without Docker; journey and
scenario layers start the sandbox first.

## Adapting to the Project Stack

The provisioning process is stack-aware. Here are the key decision points:

| Decision | Depends on |
|----------|-----------|
| Base Docker images | Language and framework from .specflow/specs/_index.md Stack section |
| Database service | Entity definitions in specs — relational vs document vs key-value |
| Migration command | Framework's migration tool (Alembic, Prisma, Knex, Django, etc.) |
| Test runner command | Test framework from project dependencies |
| Port offsets | What ports the project already uses |
| Mock service type | What external services the specs reference |

The agent should not assume any particular stack. It reads the project and adapts.

## When to Re-provision

The test environment needs updating when:

- A new external service dependency appears in a spec (add a mock)
- The database type changes (rare, but replace the DB service)
- A new application service is added (new worker type, new microservice)
- Environment variables are added or renamed

The agent should check the environment manifest against the current spec tree whenever
scenario tests are about to run, and flag if the environment is stale.
