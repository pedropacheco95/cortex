# Atom Extraction

This document describes how to identify every concrete unit of behavior in a codebase
and map their relationships into a graph. This is Phase 1 of onboarding — mechanical
work, not interpretive. No specs are written during this phase.

## What is an atom?

An atom is a concrete, greppable unit of behavior. Not an abstraction, not a concept —
a specific function, endpoint, model, or integration point that can be found by searching
the codebase.

### Atom types

**Endpoints** — every HTTP route, GraphQL resolver, CLI command handler, WebSocket event
handler. These are the system's external interface.

How to find them:
```
Python/Flask:     @app.route, @blueprint.route
Python/FastAPI:   @app.get, @app.post, @router.get
Python/Django:    urlpatterns, path(), re_path()
Node/Express:     app.get, app.post, router.get, router.post
Node/NestJS:      @Get(), @Post(), @Controller
Ruby/Rails:       routes.rb, get/post/put/delete declarations
Go:               http.HandleFunc, mux.Handle, gin routes
GraphQL:          resolver functions, type Query/Mutation definitions
```

**Models / tables** — every database model, migration, schema definition. These define
the data the system manages.

How to find them:
```
SQLAlchemy:       class X(Base), class X(db.Model)
Django:           class X(models.Model)
Prisma:           model X { } in schema.prisma
TypeORM:          @Entity() class X
Sequelize:        sequelize.define(), class X extends Model
Drizzle:          export const X = pgTable()
Migrations:       CREATE TABLE, ALTER TABLE, addColumn
Mongoose:         new Schema(), mongoose.model()
```

**Significant functions** — service functions, business logic functions that encode rules.
NOT pure helpers (formatters, parsers, validators that only check shape).

A function is "significant" if it:
- Is called by an endpoint and contains conditional logic
- Mutates state (database writes, queue publishes, external API calls)
- Implements a business rule (access control, pricing, scheduling logic)
- Orchestrates multiple other functions

How to find them:
```
Look in: services/, domain/, core/, business/, logic/, use_cases/
Skip:    utils/, helpers/, formatters/, parsers/ (unless they contain business rules)
```

**Workers / jobs** — background tasks, queue consumers, scheduled jobs.

How to find them:
```
Celery:           @app.task, @shared_task
Bull/BullMQ:      processor functions, queue.process()
Sidekiq:          class X include Sidekiq::Worker
Cron:             cron definitions, @Scheduled, node-cron
AWS Lambda:       handler functions in lambda directories
```

**External integrations** — calls to external APIs, SDKs, payment processors, email
services, LLM providers.

How to find them:
```
HTTP clients:     requests.get/post, axios, fetch, HttpClient
SDKs:             stripe., twilio., sendgrid., openai.
Webhook handlers: endpoints that receive callbacks from external services
```

## Extraction process

### Step 1: Scan the project structure

Before extracting atoms, understand the project:

1. Read package files (package.json, pyproject.toml, requirements.txt, Cargo.toml, go.mod)
   to determine language, framework, and dependencies.
2. Read config files (docker-compose.yml, .env.example, CI configs) to understand
   infrastructure.
3. Identify the entry points (main.py, app.ts, index.js, cmd/main.go).
4. Map the directory structure — which folders contain what kind of code.

**Agent delegation:** For monorepos or large projects, identify service boundaries first.
Each service becomes a separate extraction scope, delegated to its own agent.

### Step 2: Extract atoms

For each atom type, grep/glob the codebase systematically. Record every atom found.

**Agent delegation:** Delegate extraction based on file size:

- **Files under 1,000 lines:** can be read directly or grouped by directory (one agent
  per directory of small files).
- **Files 1,000-3,000 lines:** one dedicated agent per file. The agent reads the whole
  file and returns all atom records found in it.
- **Files over 3,000 lines:** split into line-range agents. Each agent reads a ~1,500
  line chunk and returns atoms for that range. The orchestrator merges the results.

```
# Example: splitting a 6,500-line controller
Agent 1: "Read controller.ts lines 1-1500. Return atom records for every endpoint."
Agent 2: "Read controller.ts lines 1500-3000. Return atom records."
Agent 3: "Read controller.ts lines 3000-4500. Return atom records."
Agent 4: "Read controller.ts lines 4500-6500. Return atom records."
```

**Coverage check after extraction:** Count the total endpoints/routes declared in route
files and compare against atoms extracted. If any routes are missing, identify which line
ranges they live in and spawn additional agents. Report coverage as a fraction:
"extracted 27/27 backend routes" or "extracted 19/27 — 8 routes in lines 4500-6500 need
additional agent."

Each agent returns a list of atom records (see format below).

### Step 3: Record each atom

For every atom found, record:

```markdown
## ATOM: POST /api/bookings

**Type:** endpoint
**File:** src/routes/bookings.py:45
**Function:** create_booking()
**Entities touched:**
  - READS: User (get user by ID)
  - READS: Class (check capacity)
  - WRITES: Booking (insert)
  - WRITES: Class (decrement available_spots)
**Calls:**
  - validate_booking_request() [src/services/booking.py:12]
  - check_capacity() [src/services/booking.py:34]
  - process_payment() [src/services/payment.py:89]
  - send_confirmation_email() [src/services/notifications.py:23]
**Called by:**
  - (external — this is an endpoint)
**Integrations:**
  - Stripe (via process_payment)
  - SendGrid (via send_confirmation_email)
```

### Step 4: Build the relationship graph

After all atoms are extracted, build the graph:

- **Nodes:** Every atom
- **Entity edges:** Atom A reads/writes entity X (labeled with READ or WRITE)
- **Call edges:** Atom A calls atom B (directed)
- **Integration edges:** Atom A calls external service X

**Agent delegation for atom investigation:** For atoms with complex behavior (many callers,
many callees, unclear purpose), spawn a dedicated investigation agent. The agent receives
the atom's file path and instructions to:
1. Read the full implementation
2. Trace every caller (who calls this function and why)
3. Trace every callee (what does this function call)
4. Identify what business rules are encoded in the logic
5. Return a detailed atom record with rules identified

This is especially important for "significant functions" that may encode business logic
the orchestrator would miss in a surface scan.

## Adapting to project types

| Project type | Atom focus | Notes |
|---|---|---|
| Full-stack web app | Endpoints + models + components + frontend API calls | Track the API contract between frontend and backend as call edges |
| API-only service | Endpoints + models + service functions | No frontend atoms; focus on endpoint behavior and data flow |
| CLI tool | Command handlers + processing functions + output formatters | Commands are the "endpoints"; processing pipeline is the call graph |
| Library/SDK | Public API surface + internal functions | Public functions are the "endpoints"; internal functions are significant if they encode rules |
| Monorepo | Per-service extraction | Identify service boundaries first; each service is a separate extraction scope with its own agent |
| Event-driven | Event producers + consumers + handlers | Events are edges in the graph; producers and consumers are atoms |

## What atom extraction does NOT do

- Does not interpret intent. It records what exists.
- Does not classify bugs. It notes inconsistencies for Phase 3.
- Does not write specs. It produces the graph that Phase 2 uses.
- Does not skip "boring" code. Trivial CRUD endpoints are atoms too — they might cluster
  into a domain that matters.
