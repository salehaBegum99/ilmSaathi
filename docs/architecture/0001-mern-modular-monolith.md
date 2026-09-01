# ADR 0001: MERN modular monolith with server-owned authorization

- Status: Accepted
- Date: 2026-08-29
- Decision owners: Product and engineering

## Context

IlmSaathi is a greenfield marketplace for women to find approved educators and request live one-to-one classes. Learning is age-inclusive, while educators must be adults. It handles identity data, educator evidence, protected meeting information and eventually payments. The private pilot must be inexpensive to operate, fast to change and difficult to misconfigure locally.

The supplied implementation brief recommended Next.js, Supabase PostgreSQL, Supabase Auth and pnpm. The product owner explicitly requested a MERN structure similar to the Ledgzo engineering approach. That direct request controls the technology decision. Product constraints from the brief still control security and behaviour.

MongoDB does not provide Supabase-style browser-facing row-level security. IlmSaathi therefore must never expose the database to the browser. Every read and mutation crosses the API trust boundary and a server authorization policy.

## Decision

Use a TypeScript npm-workspace modular monolith:

~~~text
React/Vite PWA  --->  Express REST API  --->  MongoDB
       |                    |
       +---- shared Zod contracts ------+
                            |
                    private object storage,
                    email, meetings, payments
~~~

Deploy the web and API independently but develop them in one repository. Keep one API process and one database for the MVP. Background work starts in the API deployment or a separately invoked worker using the same service layer; do not create microservices or a message broker until measured load requires them.

### Runtime boundaries

- apps/web renders public, learner, educator and administration experiences. It may perform optimistic route guards but owns no authority.
- apps/api validates input, authenticates the session, applies policy checks, executes state transitions, returns minimal DTOs and writes audit events.
- packages/shared contains Zod schemas, allow-listed states and transport types. It contains no secrets or database models.
- MongoDB is private to the API. Browser credentials can never connect to it.
- Private files live in private object storage. MongoDB stores randomized object keys and review metadata, not public evidence URLs.

### Authentication

- Passwords use an adaptive password hash; raw passwords never persist.
- Access tokens are short-lived and accepted only with fixed algorithm, issuer and audience.
- Refresh credentials are random, revocable sessions stored as hashes and sent only in HttpOnly cookies.
- Cookie-authenticated mutations require CSRF protection and strict CORS origin allow-listing.
- Privileged routes load current roles from the database; roles from request bodies or stale browser state are ignored.
- Administrator actions require TOTP MFA freshness and append tamper-evident audit events.
- Email verification, recovery and abuse limits remain required before a real beta.

Authentication proves identity, role policy grants capability, and educator review grants publication. These are independent.

### Authorization replacement for RLS

Because MongoDB is server-only, the compensating control set is:

1. Database network access permits only the API/operations boundary.
2. Controllers never call Mongoose models directly; scoped repositories/data-access methods are the query boundary.
3. Every service method receives authenticated actor context and calls a centralized policy.
4. Public educator queries use an intentional public projection and enforce approved plus published state in the database query.
5. Private-record queries include ownership/participation scope, not a fetch-then-hide pattern.
6. Sensitive mutations use conditional filters that include current state and ownership to prevent time-of-check/time-of-use races.
7. API authorization tests prove cross-account denial and privilege-escalation denial.

No client-side check can substitute for these controls.

### Domain model

Initial collections:

- users, refresh_sessions, user_roles and consent_events
- subjects
- educator_applications, educator_application_history and educator_profiles
- verification_documents and verification_document_access_logs
- availability_rules
- booking_requests, bookings and booking_status_history
- meeting_links and reviews
- notifications
- blocks, reports, moderation_cases and moderation_case_history
- admin_audit_logs
- payment_orders, payment_events and refunds when payment work begins

Important rules:

- ObjectId values identify database records; public identifiers may use generated opaque IDs where enumeration matters.
- All timestamps are UTC. User and booking timezone snapshots are retained for display and scheduling.
- Subject identifiers reference the database-controlled catalogue. Free-text public subjects are rejected.
- Public educator DTOs are allow-listed and never derived by removing a few fields from a private document.
- Provider event IDs and idempotency keys have unique indexes.
- Records that carry decisions retain actor, reason, timestamp and prior/current state.

### State transitions and consistency

Educator application:

~~~text
draft -> submitted -> under_review -> approved -> suspended
                          |
                          +-> changes_requested -> submitted
                          +-> rejected
~~~

Booking:

~~~text
requested -> accepted -> payment_pending -> confirmed -> completed
    |           |              |                |
    +-----------+--------------+----------------+-> allowed terminal/exception states
~~~

Transitions are commands, not arbitrary status patches. The API verifies current state, actor, role, participation, time window and payment state. A conditional atomic update prevents two actors from winning the same transition.

For the MVP, history can be embedded with the aggregate when bounded, making current state and appended history one atomic document update. High-volume or legally retained history uses a separate append-only collection and an idempotent command record. Code must not assume multi-document transactions in local development.

Production Atlas provides a replicated topology. If a feature truly needs a multi-document transaction, first add a reliable local replica-set profile, CI coverage and retry handling; then record a new ADR.

### API and health contracts

- REST endpoints use /api.
- GET /api/health/live reports process liveness without requiring MongoDB.
- GET /api/health/ready pings MongoDB and returns failure while dependencies are unavailable.
- Startup retries MongoDB with bounded exponential backoff and jitter.
- One Mongoose connection pool is reused for the process.
- Shutdown stops accepting traffic and drains/disconnects within the configured grace period.

### Deployment

- Local: health-gated Docker Compose or fully native Node.js with the project-owned rs0 MongoDB helper.
- Preview/staging: isolated API/web environments and isolated MongoDB database/user.
- Production: static web hosting, Node.js API service and managed MongoDB with TLS, backups and least-privilege access.
- Production secrets are injected by the hosting platforms; local .env is never uploaded.

## Consequences

Benefits:

- One repository and shared validation keep the first product coherent.
- Web, API and database can scale independently without premature service boundaries.
- Mongo documents fit profiles, catalogues and aggregate state histories.
- Health-gated setup removes most first-run database races.
- Server-only data access makes authority auditable in one tier.

Costs and risks:

- Authorization must be rigorously implemented and tested because the database is not enforcing per-user RLS.
- Relational reporting and complex payment reconciliation need deliberate indexes and projections.
- A standalone local MongoDB cannot exercise transactions.
- Custom authentication and MFA demand ongoing security maintenance.
- Vite SPA deployment requires correct fallback and API routing.

## Rejected alternatives

- Next.js plus Supabase: technically credible and present in the brief, but conflicts with the owner's MERN requirement.
- Direct browser access to MongoDB/Atlas Data API: rejected because it weakens the single authorization boundary.
- Microservices, Kubernetes, GraphQL and a message broker: rejected as operational complexity without MVP evidence.
- Building video infrastructure: rejected; meeting links remain protected references to an external provider.
- Native mobile apps: rejected for the pilot; the installable PWA is the mobile surface.

## Review triggers

Revisit this decision when any of these occurs:

- authorization query duplication becomes difficult to prove correct;
- booking/payment consistency requires multi-document transactions;
- worker load materially affects request latency;
- reporting workloads compete with transactional traffic;
- residency, audit or regulatory requirements require a different storage boundary;
- native apps or multi-region operation enter an approved roadmap.

## References

- [MongoDB Node.js connection targets](https://www.mongodb.com/docs/drivers/node/current/connect/connection-targets/)
- [MongoDB connection pools](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/)
- [Docker Compose startup order and health conditions](https://docs.docker.com/compose/how-tos/startup-order/)
- [Node.js release policy](https://nodejs.org/en/about/previous-releases)
