# IlmSaathi

IlmSaathi is a women-focused, India-first learning marketplace for live one-to-one classes. Learning is age-inclusive; educators must be 18 or older and approved. The platform also includes a database-controlled subject catalogue, protected booking flows, and English/Hindi/Urdu-ready interfaces.

This repository is a TypeScript MERN modular monolith:

- React + Vite PWA in apps/web
- Node.js + Express API in apps/api
- MongoDB as the single source of truth
- Shared runtime schemas and types in packages
- npm workspaces on Node.js 22

The product brief originally proposed Next.js and Supabase. The owner's explicit MERN request takes precedence; the brief's security, privacy, authorization, verification, and state-machine requirements remain product invariants.

## Quick start on Windows

With Node.js 22, npm 10+ and MongoDB Community Server already installed, the shortest Docker-free path is:

```powershell
Set-Location C:\Projects\Learning-App
npm ci
npm run env:generate
npm run dev:native
```

This uses a project-owned MongoDB `rs0` instance on port 27018, so an existing default MongoDB Windows service on port 27017 can remain untouched.

For the all-container workflow, install [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/) and start its engine.

Recommended all-container workflow:

```powershell
Set-Location C:\Projects\Learning-App
.\scripts\setup.ps1 -Mode Docker -Start
```

The first run creates a private .env, installs workspace dependencies in a Docker volume, starts MongoDB, waits for the database, waits for the API readiness endpoint, and finally waits for the web app.

| Service       | Local URL                              | Health contract                             |
| ------------- | -------------------------------------- | ------------------------------------------- |
| Web           | http://localhost:5173                  | GET /                                       |
| API           | http://localhost:4000                  | GET /api/health/live                        |
| API readiness | http://localhost:4000/api/health/ready | Returns success only after MongoDB is ready |
| MongoDB       | 127.0.0.1:27017                        | Authenticated ping inside Compose           |

Stop services without deleting data:

```powershell
docker compose down
```

See [Local setup](docs/local-setup.md) for native development, macOS/Linux commands, environment rotation, and database troubleshooting.

For a cloud development environment with Node and the MongoDB replica set prepared automatically, follow [GitHub Codespaces setup](docs/codespaces-setup.md).

## Repository layout

```text
apps/
  api/                 Express API and background jobs
  web/                 React/Vite PWA
packages/
  shared/              Cross-tier schemas, state definitions and DTO types
scripts/
  doctor.mjs           Prerequisite, environment and connectivity checks
  generate-env.mjs     Local secret and Mongo URI generation
  run-workspaces.mjs   Dependency-free workspace orchestration
  setup.ps1            Idempotent Windows setup
docs/
  architecture/        Architecture decisions
  deployment.md        Staging and production runbook
  local-setup.md       Local operating guide
  product-roadmap.md   Delivery phases and monetization gates
  threat-model.md      Security boundaries and mitigations
compose.yaml           Health-gated local stack
```

## Common commands

| Command                    | Purpose                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------- |
| npm run env:generate       | Create .env once without revealing secrets                                          |
| npm run dev:native         | Start project MongoDB rs0, seed data, API and web without Docker                    |
| npm run dev:codespaces     | Seed and start API/web against the private Codespaces MongoDB rs0 service           |
| npm run db:native:status   | Check the project-owned native MongoDB instance                                     |
| npm run db:native:stop     | Stop native MongoDB while retaining local data                                      |
| npm run doctor             | Check Node, npm, files, env, ports, Mongo reachability and API readiness            |
| npm run smoke:local        | Verify real auth, database, onboarding and educator transaction flow, then clean up |
| npm run dev                | Run every workspace dev script concurrently                                         |
| npm run lint               | Lint all workspaces that expose a lint script                                       |
| npm run typecheck          | Typecheck all workspaces                                                            |
| npm test                   | Run workspace unit and integration tests                                            |
| npm run build              | Build production artifacts                                                          |
| npm run format:check       | Verify formatting                                                                   |
| docker compose up --wait   | Start the local stack and wait for health                                           |
| docker compose logs -f api | Follow API and database-readiness diagnostics                                       |

## Database connection contract

The root .env is the only local environment source:

- The generated local MONGODB_URI uses 127.0.0.1 and is for processes running on the host; an Atlas development URI may replace it intentionally.
- MONGODB_URI_DOCKER uses the Compose service name mongo and is injected into the API container as MONGODB_URI.
- Mongo credentials are generated once. The generator never overwrites .env unless --force is explicit.
- Compose does not start the API until MongoDB passes an authenticated ping.
- The web service does not start until GET /api/health/ready succeeds.
- The API must keep liveness separate from readiness, use a single connection pool, and shut down cleanly.

Local Compose and the native Mongo helper both use a single-node replica set because registration and educator decisions use transactions. Managed production MongoDB must provide replication, backups and TLS.

## Security invariants

- Roles and approval state are server-owned; hiding UI is never authorization.
- Pending educators never appear in public search.
- State changes use allow-listed transitions and append immutable history.
- Verification files remain private and use short-lived, authorized access.
- Meeting links are available only to booking participants in a controlled window.
- Passwords, tokens, OTPs, document paths and payment secrets never enter logs or analytics.
- Payment and webhook processing is signature-verified and idempotent.
- Learning has no age limit; educators must be 18 or older. Child accounts remain a production launch gate until verified parent/guardian consent and child-specific privacy and safeguarding controls are complete.
- The MVP does not provide unrestricted chat or native video.

Read [Threat model](docs/threat-model.md) and [Architecture ADR](docs/architecture/0001-mern-modular-monolith.md) before changing authentication, roles, files, booking transitions or payments.

## Production

compose.yaml is a development stack, not a production deployment. Production uses separate web and API deployables plus a managed MongoDB cluster, environment-specific secrets, TLS, backups, monitoring and controlled promotion. Follow [Deployment](docs/deployment.md).

## Current delivery scope

The implementation follows secure vertical slices. Foundation and CI come first, followed by authentication/authorization, educator approval and approved-only discovery. Booking and payments are gated until cross-account and privilege-escalation tests pass. See [Product roadmap](docs/product-roadmap.md).
