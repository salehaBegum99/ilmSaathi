# API service

Express/Mongoose API for the secure registration-to-educator-approval slice.

## Local requirements

- Node.js 22 and npm 10 or newer.
- MongoDB running as a single-node replica set. Registration and educator decisions use
  transactions intentionally; a default standalone MongoDB Windows service is not equivalent.
- A root environment created with `npm run env:generate`. The generator safely creates the Mongo
  URIs and independent JWT, CSRF, audit-HMAC and MFA secrets without printing them.

From the workspace root, `npm run dev:native` starts a project-owned local replica set, builds
`@learning-platform/shared`, seeds the catalogue, and starts this API plus the web app.
`/api/health/live` confirms the process is running; `/api/health/ready` performs a MongoDB ping and
is the endpoint deployment platforms should use for readiness.

The browser must first call `GET /api/v1/auth/csrf` with credentials enabled. Its response includes
the CSRF token plus the server's current Terms and Privacy versions; registration must echo those
versions so separately deployed web and API builds cannot drift. For every POST, PUT, PATCH or
DELETE, echo the returned/readable CSRF cookie value in `x-csrf-token`. Access and refresh tokens
are never returned to JavaScript; both are HTTP-only cookies. Production web and API hosts should
be same-site subdomains, or cookies must be deliberately configured with `SameSite=None` and TLS.

## Bootstrap operations

Seeded subjects are catalogue-controlled. The seed is idempotent and refuses production unless
`ALLOW_PRODUCTION_SEED=true` is supplied deliberately.

There is no public administrator registration. For the one-time bootstrap, supply
`ALLOW_ADMIN_BOOTSTRAP=true`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` only to the
CLI process, then run the `bootstrap:admin` script. Enrol the printed TOTP URI immediately and
remove the bootstrap variables. Re-running against an existing email is refused.

## Security boundaries

- Routes never accept role, owner, approval or publication fields from public clients.
- Services repeat role/ownership/AAL2 checks; repositories always scope private reads to the
  authenticated owner.
- Public discovery reads an explicit projection from `public_educators`, not private profiles or
  application records.
- Admin review transitions, public publication, immutable history, and audit events share a Mongo
  transaction.
- A signed CSRF token is additionally bound to each authenticated session. Refresh secrets rotate
  atomically, and a detected mismatch revokes the session.
