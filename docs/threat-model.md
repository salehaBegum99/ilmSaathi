# IlmSaathi threat model

Status: Phase 0 baseline. Revisit before private beta, before payments and after any material trust-boundary change.

This is an engineering threat model, not a legal or safeguarding certification.

## Security objectives

1. A user can access only her own private data and bookings in which she participates.
2. An educator cannot approve herself, edit reviewer decisions or become public before approval.
3. A moderator sees only assigned/policy-authorized cases; only restricted administrators assign privileged roles.
4. Identity and qualification evidence never receives a permanent public URL.
5. Booking, moderation and payment transitions cannot skip required states or be replayed.
6. Meeting links are disclosed only to eligible participants during the allowed window.
7. Sensitive administrator actions are attributable, MFA-gated and auditable.
8. Secrets and sensitive personal data do not enter source control, logs or analytics.

## Assets

- Account credentials, access sessions, refresh sessions and MFA seeds
- Personal profiles, educator age attestations, guardian-consent records and consent history
- Educator claims, verification evidence and reviewer decisions
- Availability, bookings, meeting links and reviews
- Reports, blocks, moderation records and reporter identity
- Payment orders, provider events, refunds and payout metadata
- Administrator audit trail and encryption/HMAC keys
- Source code, CI credentials, deployment credentials and backups

## Actors

- Anonymous visitor
- Learner
- Pending or approved educator
- Moderator
- Administrator
- Support/operations engineer
- External email, storage, meeting, analytics and payment provider
- Automated bot, credential-stuffer, abusive insider or compromised account

## Trust boundaries

~~~text
Browser / installed PWA
        |
        | TLS, CORS, cookies, CSRF
        v
Express API and policy layer
   |          |            |
   |          |            +--> external providers and signed webhooks
   |          +--> private object storage
   +--> private MongoDB

CI/CD and operators cross a separate privileged boundary into deployment secrets.
~~~

The web bundle is untrusted input. Anything in VITE_ variables is public. MongoDB and provider secrets exist only beyond the API boundary.

## Threats and required mitigations

| Threat | Example | Required mitigation and test |
| --- | --- | --- |
| Account takeover | Credential stuffing or stolen refresh cookie | Strong password policy, rate limits, breached-password review, hashed/revocable refresh sessions, rotation, secure cookies, session list/revocation, recovery alerts |
| Token forgery | Algorithm confusion or wrong audience | Fixed JWT algorithm, issuer and audience; short TTL; key rotation procedure; negative token tests |
| CSRF | Malicious site submits a cookie-authenticated mutation | SameSite cookie, exact CORS allow-list, CSRF token on mutations, Origin/Content-Type checks |
| Privilege escalation | User submits role=admin | Ignore client role/approval fields; protected role service; current database role check; audit; ordinary-user escalation test |
| Educator self-approval | Pending educator patches application status | Command-specific reviewer policy, conditional current-state update, MFA for admin decision, history event |
| IDOR/BOLA | Learner guesses another booking ID | Ownership/participant condition inside repository query; return indistinguishable not-found/forbidden policy; cross-account tests |
| Over-broad public DTO | Private email/document key appears in search | Allow-listed public projection; contract snapshot test; pending/suspended exclusion test |
| NoSQL injection | Operator-shaped JSON enters a query | Zod schemas strip/reject unknown fields, never spread request filters, Mongoose sanitize/filter allow-list, query tests |
| Stored XSS | Biography includes active HTML/script | Store plain text or sanitize with one reviewed policy; React escaping; CSP; malicious biography tests |
| Verification-file abuse | Executable renamed as image or public evidence URL | Extension plus MIME signature and size checks, randomized key, private bucket, malware/quarantine workflow, authorized short-lived access, access audit |
| Meeting-link leakage | Link appears in logs or before confirmation | Encrypt or tightly protect value, minimal DTO, participant and time-window policy, redact logs, revoke/rotate support |
| OTP/recovery abuse | Email bombing, enumeration, replay | Generic responses, token hash and expiry, one-time consume, per-user/IP/device limits, resend cooldown, CAPTCHA before public launch |
| MFA replay | Reuse last TOTP code | Encrypt seed, record last accepted counter, enforce AAL freshness, recovery-code process, MFA-negative tests |
| State-machine bypass | requested jumps directly to completed | Command allow-list, actor/role/current-state/payment/time predicates, conditional update, immutable history |
| Race/double booking | Two requests reserve same slot | Unique/overlap guard, atomic conditional update, idempotency key, concurrency tests |
| Webhook forgery/replay | Fake successful Razorpay callback | Verify raw-body signature server-side, unique provider event ID, idempotent processor, reconcile against provider |
| Report retaliation/privacy | Report target reads reporter narrative | Separate private report projection, moderator assignment policy, access audit |
| Sensitive logging | Token or document path in error context | Structured redaction, no request-body dumps, production log tests, privacy review of monitoring and analytics |
| Supply-chain compromise | Malicious dependency lifecycle script | Committed lockfile, npm ci, least-privilege CI token, dependency review/audit, pinned action majors, no production secrets in untrusted PRs |
| Database outage | API accepts requests before Mongo is ready | Retry/backoff, readiness ping, bufferCommands disabled, bounded timeouts, fail closed, graceful shutdown |
| Data loss/ransomware | Deleted production collection | Managed backups, point-in-time recovery where available, restore drill, separate backup credentials, audited destructive operations |
| Abuse/harassment | Unrestricted contact exchange | Block/report flows, no unrestricted chat, contact minimization, moderation SLA and suspension controls |

## Authorization invariants

Every server mutation follows:

~~~text
parse and validate input
  -> authenticate current session
  -> load current server-owned roles/state
  -> authorize action and resource relationship
  -> perform conditional/idempotent write
  -> append history/audit event
  -> return minimal DTO
~~~

The application fails closed if role, ownership, state or MFA evidence is missing.

## Administrator controls

- No public administrator registration.
- Bootstrap/invitation is an explicit protected operation and is disabled or separately authorized in production.
- Admin routes require administrator role plus current TOTP assurance where specified.
- Role assignments, educator decisions, document access, suspensions and payment actions include actor, target, reason and request-security context in the audit trail.
- Audit integrity uses a server-held HMAC chain or equivalent tamper-evident design; the HMAC key is not stored with audit records.
- Operators receive least privilege and separate production identities. Shared accounts are prohibited.

## Privacy and safety controls

- Learning is age-inclusive; educators must attest that they are 18 or older.
- Child accounts stay disabled in production until verifiable parent/guardian consent, age-appropriate notices, restricted contact, reporting/escalation and child-data handling controls are implemented and reviewed.
- Do not track or behaviourally monitor children or serve them targeted advertising.
- Collect only fields with a documented purpose and retention rule.
- Do not use production identities, evidence, messages or religious-learning details in development, tests, demos or analytics.
- Analytics events use opaque IDs and coarse product actions, not emails, phone numbers, document keys or meeting URLs.
- No class recording by default.
- Account correction/deletion requests and statutory record-retention exceptions require an operations workflow.
- India privacy, consumer, payment and marketplace obligations require qualified legal review before launch.

## Verification plan before private beta

- Authentication tests cover login, logout, expiry, refresh rotation/reuse, recovery, rate limits and CSRF.
- Authorization tests use at least two learners and two educators to prove cross-account denial.
- Pending/rejected/suspended educators never appear in public query results.
- Ordinary users cannot assign privileged roles or approve applications.
- Non-MFA admin sessions cannot open evidence or execute protected mutations.
- File tests include extension mismatch, bad signature, oversized object and unauthorized signed-URL request.
- Booking tests cover every valid and invalid transition plus concurrent acceptance.
- Logs and error monitoring are inspected for token, password, email, document path and meeting-link leakage.
- Backup restoration is demonstrated into an isolated environment.
- Dependency audit and secret scanning pass in CI.

## Residual risks and gates

- Custom authentication creates maintenance risk; commission an external review before public launch.
- Local standalone MongoDB does not test transaction semantics; do not introduce transaction-dependent code silently.
- Malware scanning, production email delivery, CAPTCHA, object storage and payment providers require external accounts and cannot be considered complete from repository code alone.
- Safeguarding and verification labels require written operational policy and trained reviewers, not only software.
- A production launch is blocked until monitoring, backups, restore drill, incident response, abuse response and legal review have named owners.
