# Security Guide & Threat Model

**Audience:** Operators deploying this repository.
**Last reviewed:** 2026-08-24

This document maps the attack surface of `OpenSteward`, documents the hardening controls the platform ships with, and prescribes the steps that remain the operator's responsibility. It is **not** a guarantee of security, and it does **not** replace a real third-party penetration test for production deployments. Treat it as a starting checklist.

---

## 1. Scope & Threat Model

### In scope
- All applications under `apps/` (`admin`, `admin-api`, `integration-server`, `webhook-gateway`, `docs-server`, `mcp-server`).
- Shared middleware under `packages/shared/`.
- Default `docker-compose.yml` deployment topology.

### Assumed adversaries
| Adversary | Capability |
|-----------|------------|
| Unauthenticated internet attacker | Can reach any public port. Probes endpoints, scrapes responses, attempts brute force. |
| Compromised tenant / API-key holder | Holds a valid API key. Tries to escalate scope or reach other tenants' data. |
| Malicious SaaS upstream | A platform that this server integrates with returns hostile responses, webhooks, or OAuth payloads. |
| Insider with read access to host | Reads SQLite files, env vars, container filesystems. |
| Compromised CI / supply chain | Injects malicious code via dependency update. |

### Target operator profile

The hardening trade-offs in this document assume this deployment profile:

| Trait | Assumption |
|-------|------------|
| Hosting | Self-hosted in their own AWS / GCP / Azure VPC (or on-prem Kubernetes). |
| Skill level | Mid-sized engineering team, has SRE function, comfortable with docker-compose or Helm. |
| Secrets | Has a secrets manager available (AWS Secrets Manager, Vault, GCP SM, or Doppler). |
| Observability | Has a log aggregator (CloudWatch, Loki, Datadog, Elastic) and an alerting tool. |
| TLS | Has an ingress/ALB or a reverse proxy ready (Caddy / nginx / Traefik / cloud LB). |
| Patch cadence | Monthly. |
| Dev workflow | Engineers run the stack locally via `docker compose up` or `pnpm dev:*`. Must continue to work. |

A hard constraint follows from that last row: the `localhost` developer workflow stays one command (`docker compose up` / `pnpm dev`) — no mandatory secrets-manager call, no required TLS cert, no required Redis at dev time. Every production gate therefore carries a documented dev-mode escape valve; §4.21 tabulates them.

### Out of scope
- Physical attacks on hosting infrastructure.
- Social engineering against operators.
- Attacks against the upstream SaaS platforms themselves.

---

## 2. Trust Boundaries

```
                          INTERNET
                              │
                              ▼
                ┌─────────────────────────┐
                │  Reverse Proxy (TLS)    │  ← operator must add
                │  Caddy / nginx / Traefik│
                └─────────────────────────┘
                  │      │       │      │
       ┌──────────┘      │       │      └──────────────┐
       ▼                 ▼       ▼                     ▼
┌──────────────┐  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐
│ admin :3000  │  │integration-  │  │webhook-       │  │ docs-server  │
│ (UI + forms) │  │server :3010  │  │gateway :3004  │  │ :3003        │
└──────┬───────┘  └──────┬───────┘  └──────┬────────┘  └──────────────┘
       │                 │                 │
       │                 │                 │  forward
       ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌───────────────┐
│ admin-api    │  │  SQLite      │  │  Verticals    │
│ :3001        │  │  volumes     │  │ (in proc)     │
│ INTERNAL     │  └──────────────┘  └───────────────┘
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  SQLite      │
│  admin-data  │
└──────────────┘
                   ┌──────────────┐
                   │ mcp-server   │  ← stdio only, no HTTP
                   └──────────────┘
```

**Key boundaries:**
- `admin-api` (port 3001) must **never** be exposed publicly. It is reached only by sibling containers on the internal Docker network — the `admin` UI, plus `integration-server` and `docs-server` over the `X-Service-Secret` channel (runtime-settings polls; integration-server also forwards audit events). **One exception:** if you configure SSO or SCIM, the IdP and the operator's browser have to reach `/api/sso/{slug}/login`, `/api/sso/{slug}/callback`, `/api/sso/{slug}/acs` and `/scim/v2/*` on `SSO_PUBLIC_BASE_URL`. Publish *those path prefixes only* through the reverse proxy — never the whole service. See [`../deployment/sso-setup.md`](../deployment/sso-setup.md).
- SQLite volumes must not be reachable from outside the host. Treat them as secrets.
- The reverse proxy is the only TLS termination point. The Node services speak plaintext HTTP.

---

## 3. Attack Surface Inventory

| Service | Port | Exposure | Auth | Key endpoints |
|---------|------|----------|------|---------------|
| `admin` | 3000 | Public | Signed session cookie (HttpOnly, SameSite=strict) + CSRF token | `/login`, `/logout`, `/customers*`, `/connections*`, `/connect-links*`, `/api-keys*`, `/tenants*`, `/identity-providers*`, `/webhooks*`, `/settings*`, `/roles*`, `/data*` (stored records), `/dashboards*`, `/destinations*`, `/sql-access*` |
| `admin-api` | 3001 | **Internal only**, except the SSO/SCIM prefixes below | JWT (jose) + bcrypt password; `X-Service-Secret` (`SERVICE_SECRET`) for sibling-service calls — the runtime-settings poll and the `POST /api/internal/audit` ingest (connection.create/delete rows written as user `system`); bearer SCIM token on `/scim/v2/*`; the SSO initiation/callback routes are unauthenticated by design | `/api/auth/login`, `/api/auth/setup`, `/api/users*`, `/api/roles*`, `/api/connections*`, `/api/api-keys*`, `/api/data*`, `/api/dashboards*`, `/api/destinations*`, `/api/sql-access*`, `/api/analytics/superset/*`, `/api/internal/audit`, `/api/internal/superset/dashboards` (service secret), `/api/sso/{slug}/{login,callback,acs,ldap-login}`, `/scim/v2/*` |
| `integration-server` | 3010 | Public | API key (scrypt-hashed) with scopes, or an OIDC bearer token from an operator-registered issuer resolving to the same (tenant, scopes) principal — opt-in, refused with `OAUTH_DISABLED` unless `auth.dev_oauth_enabled` is on; per-credential kill switches `auth.dev_api_keys_enabled` / `auth.dev_oauth_enabled`, read live (see [`../deployment/oauth-clients-setup.md`](../deployment/oauth-clients-setup.md)) | `/v1/{vertical}/{resource}`, `/v1/webhook-subscriptions*` (tenant-scoped CRUD + test-send + secret rotation; `webhooks:read` for GETs, `webhooks:write` for the rest; 20-per-tenant quota), `/auth/{vertical}/{platform}/connect`, `/auth/.../callback`, `/webhooks/{vertical}/{platform}`, `/test/v1/{vertical}/{resource}` (sandbox — `osk_test_` keys only, no upstream egress, gated by `features.test_mode_enabled`), `POST /test/v1/keys` (unauthenticated self-serve mint — OFF by default behind `auth.sandbox_self_serve_enabled`, IP-limited 3/hour; keys land in throwaway `sandbox-*` tenants with 7-day expiry and are refused by `/v1/*`) |
| `webhook-gateway` | 3004 | Public | Per-platform signature (delegated to vertical) | `POST /webhooks/:platform`, `GET /webhooks/log`, `GET /webhooks/dlq`, `POST /webhooks/dlq/:id/retry` |
| `docs-server` | 3003 | Public (read-only) | None | `/guides/:platform`, `/openapi`, `/search-index.json`, static assets |
| `mcp-server` | — | stdio | MCP client transport | n/a |

**Code references:**
- Login + setup: `apps/admin-api/src/core/routes/auth.ts:7`, `apps/admin-api/src/core/routes/auth.ts:28`
- JWT verify + role check: `apps/admin-api/src/core/auth/jwt-auth.ts`
- API-key + scope middleware: `packages/shared/src/control-plane/auth-middleware.ts`
- Bearer resolution (`osk_` key or OIDC token): `packages/shared/src/control-plane/credential-resolver.ts`
- Self-serve sandbox keys: `packages/shared/src/control-plane/sandbox-keys-router.ts`
- Developer webhook subscriptions: `packages/shared/src/control-plane/webhook-subs-dev-router.ts`
- Service-to-service guard (`X-Service-Secret`): `apps/admin-api/src/core/auth/service-auth.ts`
- Audit ingest (`X-Service-Secret`): `apps/admin-api/src/core/routes/audit.ts:299`, forwarder in `apps/integration-server/src/server.ts:409`
- Webhook intake: `apps/webhook-gateway/src/core/server.ts:13`
- DLQ + log endpoints: `apps/webhook-gateway/src/core/server.ts:65`, `:70`, `:75`

---

## 4. Posture by Category

Each entry states the risk, the location in code, and either the control that addresses it or the guidance left to the operator, with a severity label for the underlying risk: 🟥 high · 🟧 medium · 🟨 low · 🟩 informational.

### What remains open

Most of §4 describes controls the platform ships with. The open items are: per-route body limits and a per-platform content-type allow-list on webhook intake (4.3, 4.10); a per-adapter audit that every OAuth `state` comes from the shared `randomBytes` helper (4.13); a redaction helper for the audit log's free-form `detail` field (4.14); and SIEM / log-shipping integration guidance beyond §5.6 (4.14). A recurring lesson is baked into the CI gates in 4.20: the defects that reach a deployed stack tend to live in the *join* between individually-correct files — a secret generated, documented and set, but never forwarded to the process that reads it — so those gates check the joins mechanically rather than relying on review.

### 4.1 Authentication

🟩 **bcrypt with SALT_ROUNDS=12** — `apps/admin-api/src/core/auth/jwt-auth.ts`. Modern and acceptable.

🟩 **`/api/auth/setup` is gated against DB-reset takeover** — `apps/admin-api/src/core/routes/auth.ts`. The route gates on `store.hasUsers()`, so on a fresh (or wiped/restored-empty) admin DB the first caller could otherwise claim the admin account. When the admin-api is started with a `BOOTSTRAP_TOKEN`, `POST /api/auth/setup` requires a matching `X-Bootstrap-Token` header (constant-time compare via `timingSafeEqual`; `401` otherwise), so with the token kept set, a wiped/restored-empty DB cannot be claimed without it. The admin UI setup wizard (`/setup/init`) prompts for the token and forwards it. Unset = no token gate (dev/local default), so the empty-table `409` is the only guard — set `BOOTSTRAP_TOKEN` for any internet-exposed deployment. The first-run probe never creates an admin account.
- **Note:** keep `BOOTSTRAP_TOKEN` set after setup (do not unset it) so a later DB wipe stays gated. No `.setup-complete` marker is used — the token + empty-table check are sufficient and avoid writable-filesystem state.
- `docker-compose.yml` forwards `BOOTSTRAP_TOKEN` into admin-api, and `check:secret-passthrough` (4.20) fails the build if any generated secret stops reaching its service.

🟧 **`ADMIN_SECRET` is compared in constant time** — the `x-admin-secret` header check goes through `safeStrEqual()` (`packages/shared/src/util/safe-equal.ts`, `crypto.timingSafeEqual` on equal-length buffers) in both `packages/shared/src/control-plane/auth-middleware.ts` and `admin-guard.ts`, so a near-miss header cannot be used as a timing oracle.

🟨 **Login throttling and lockout.** Login is rate-limited at 5 attempts / 60 s per IP, and — because per-IP limiting alone does not throttle credential stuffing distributed across many IPs — the `LoginLockout` class (`apps/admin-api/src/core/auth/lockout.ts`) adds per-username lockout: 10 failures in 15 min → 1 h temporary lockout; 25 cumulative → permanent until an admin runs `manualUnlock()`. Each lockout emits `user.lockout.*` audit entries. `OST_DISABLE_LOCKOUT=1` opts out in dev.

### 4.2 Authorization

🟩 **Permissions plus tenant scope for console users.** Three built-in roles (`admin` / `operator` / `viewer`, `jwt-auth.ts`) remain the base, and on top of them sit fine-grained permissions (`connections:*`, `data:read`, `data:read_pii`, `data:export`, `dashboards:*`, `destinations:manage`, `sql_access:manage`, `roles:manage`, `users:manage`, `settings:manage`), custom roles, and a per-user **tenant scope** (all tenants, or a list of tenants and verticals), set by an admin or by IdP scope rules at SSO sign-in. Both are resolved from the database on every request (`core/auth/access.ts`, cached 15 s), so a change bites without a new sign-in. Escalation is refused: nobody grants a permission, base role or tenant they do not hold, or changes their own role. A restricted user gets `404` for another tenant's connection, and `403 SCOPE_RESTRICTED` on surfaces that are not tenant-scoped yet. See [permissions-and-roles.md](../architecture/permissions-and-roles.md).
- New IdPs default to **no tenants** until an admin sets a default scope or adds scope rules, so wiring up SSO does not by itself open every tenant to every federated user. IdPs that existed before scoping keep `all`.
- `pnpm check:route-access` (4.20) boots admin-api and fails when a route has no authentication guard and is not on its reasoned public allow-list, or when a data-access route does not check its documented permission.

🟩 **Tenant isolation** via `connectionBelongsToTenant()` in `auth-middleware.ts`. Verify on every write endpoint during code review.

🟥 **Admin routes fail closed in containers.** `adminGuard` (`packages/shared/src/control-plane/admin-guard.ts`) and `auth-middleware.ts` both fall through **open** when `ADMIN_SECRET` is unset and `NODE_ENV !== 'production'` — a deliberate local-dev convenience. The published images set `ENV NODE_ENV=production` in the Dockerfile's runtime stage, so every consumer of the image inherits the safe default (compose, Helm, the marketplace artifacts), not only operators who read the compose file. With `NODE_ENV=production` and no `ADMIN_SECRET`, admin routes fail closed with `403 ADMIN_DISABLED`.
- **Operator consequence:** `ADMIN_SECRET` is required in a container deployment. Unset means every admin route answers `403`, not that it is open. The dev fall-through applies only to a host-run `pnpm dev`, where `NODE_ENV` is unset.
- `docker-compose.yml` forwards `ADMIN_SECRET` to admin-api's `environment:` block; `check:secret-passthrough` (4.20) enforces that class of passthrough for every generated secret.

🟩 **Viewers can read the Connect section; they cannot change anything.** The admin page routers hook `requireAuth`, and each of the 18 write routes declares its own `requireRole('operator')` — per route, so a `POST` added later is not silently covered by a blanket hook. Creation forms stay operator-only.
- **Worth knowing when you assign the `viewer` role:** a Connect Link token is a **bearer credential**, and viewers can see one. Holding it is enough to complete an OAuth connection as the pending customer — `GET /api/connect-sessions` returns tokens to any authenticated user — so treat `viewer` as "can read every credential-shaped string the UI shows", not as "harmless".

🟧 **The scope-vs-method matrix is exhaustively tested.** API-key scope checks live in `auth-middleware.ts:154-178`. `packages/shared/tests/auth/authz-matrix.test.ts` enumerates 11 grant variants × 5 required scopes, 20 cross-vertical isolation cases, and 15 two-axis (touch + verb) cases — a `*:read` key is asserted to be rejected on write endpoints in every vertical.

### 4.3 Input Validation

🟧 **`connection_id` query params are format-checked at the middleware.** `isValidUuid()` (`packages/shared/src/util/uuid.ts`) is applied in both the unified and end-user middlewares, rejecting malformed input with `400 CONNECTION_ID_INVALID` before the credential-store lookup — malformed values never reach DB lookups or surface in error logs.

🟧 **Webhook payloads stored raw** — `webhook-gateway/src/core/server.ts:13`. The body is buffered and forwarded without schema validation, bounded only by the global 1 MB limit; there is no per-platform size limit or content-type allow-list. A malformed JSON or oversized payload may crash a vertical handler.
- **Operator guidance:** where a platform warrants it, apply per-path body limits and content-type restrictions at the reverse proxy.

🟩 **Zod used** for `CompanyInfoSchema` and several admin-api endpoints. Extend to all write endpoints.

### 4.4 Webhook Signature Verification

🟥 **Signature verification is delegated to each vertical — and fails closed.** The gateway preserves `webhook-signature`, `stripe-signature`, etc., but does not itself verify. Shared verifier helpers — `verifyStripeStyleSignature` (with replay window) and `verifyGithubStyleSignature` — live in `packages/shared/src/webhook.ts` and are used by the vertical handlers. The unified router returns **501 fail-closed** when no handler is registered for a platform, so an adapter that ships no verifier cannot silently accept unsigned bodies. The CI guard `scripts/check-webhook-verifiers.ts` runs in `.github/workflows/security-audit.yml` on every PR that touches an adapter webhook file and keeps the registered count at 100%.

### 4.5 Command Execution

🟧 **Child processes are invoked shell-free.** Filesystem probing in `apps/integration-server/src/data-store-maintenance.ts` runs `execFileSync('df', ['-T', path])` with an explicit try/catch fall-through to `execFileSync('mount', [])` — no shell, no quoting — so shell metacharacters in an operator-configured `STORE_PATH` cannot reach a shell even when the env var is set from untrusted automation.

🟨 **The codegen logo scraper uses `fetch()`, not a shell.** `packages/codegen/src/scrape-logos.ts` fetches with native `fetch()` + `AbortSignal.timeout(10_000)` — build-time only, and no URL is ever interpolated into a shell string.

### 4.6 SQL Injection

🟩 All queries are parameterized via better-sqlite3 prepared statements. Dynamic WHERE clauses still push placeholders + args separately. No action.

### 4.7 Secrets Management

🟥 **Weak or placeholder secrets are refused at boot.** `assertSecret()` in `packages/shared/src/auth/secrets.ts` rejects denylisted placeholders (the compose defaults, "changeme", "password", etc.) and enforces a Shannon-entropy floor of 3.5 bits/char (`MIN_ENTROPY_BITS_PER_CHAR`). The floor catches low-entropy values; the exact-match denylist is what catches the repo's own prose placeholders, which measure 3.56–3.78 bits/char and would clear the floor. Production fails fast with a readable error naming the env var; dev downgrades to `console.warn` so `localhost` keeps booting. `scripts/generate-secrets.sh` prints fresh 64-char base64 values for every required secret env var. Never commit `.env` files — `.gitignore` covers `.env*`.
- For secret-manager integration options (Vault, AWS Secrets Manager, GCP SM, Doppler, 1Password Connect), see §5.4.

🟩 No hard-coded secrets found in source.

🟥 **Env always outranks a mounted `config.yml` for secrets.** Each app loads config as `{ ...defaults, ...parsed }` from a `config/config.yml` that docker-compose mounts into the container. That file is a local-dev fallback so a bare `pnpm dev` boots without an `.env` — it is not a place for production values, and for secret-bearing keys the env var always wins, validated through `assertSecret()` whichever source the value came from:
- `admin` resolves `assertSecret('SESSION_SECRET', process.env.SESSION_SECRET || parsed.session?.secret)` — production throws on a placeholder, development warns.
- `admin-api` is conditional rather than `??`-shaped — `jwt: process.env.JWT_SECRET ? defaults.jwt : (parsed.jwt ?? defaults.jwt)` — so only the env value reaches `assertSecret`; a production container is covered because `defaults` is built eagerly and an unset `JWT_SECRET` fails the boot before YAML is ever consulted.
- The same env-first inversion applies to `sso.publicBaseUrl` / `sso.adminUiUrl`. `STORE_SECRET` resolves env-first everywhere.

The stakes if this precedence ever inverts: a correctly-configured deployment silently runs on a value committed to the repo, and anyone able to reach the admin UI can forge an admin session cookie signed with the public placeholder. Playbook probe 14c exercises exactly this.
- **Operator check:** if you mount `config.yml` files, grep them for anything that looks like a secret. They are local-dev fallbacks, not a place to put production values.

🟧 **`STORE_SECRET` rotation is documented and tooled.** Rotating `STORE_SECRET` invalidates all stored OAuth credentials unless they are re-encrypted, so `pnpm rotate-store-secret` (`packages/shared/src/scripts/rotate-store-secret.ts`) decrypts every registered encrypted column with the old secret and re-encrypts with the new one inside a per-file transaction, for SQLite (`--db`) or Postgres (`--database-url`). It is an **offline** tool: services must be stopped, the tool refuses to run against a db with a fresh `-wal`/`-shm` sibling, and each file is snapshotted to `.pre-rotation.bak` first. The set of rotated columns is registered in `packages/shared/src/sqlite/encrypted-blobs.ts`. Two hash-only tables (`developer_api_keys`, `end_user_tokens`) mix `STORE_SECRET` into their KDF salt and are **invalidated** by rotation — plan to re-issue. Runbook: [`../deployment/key-rotation.md`](../deployment/key-rotation.md).

### 4.8 CSRF

🟩 Admin UI uses signed token middleware (`apps/admin/src/core/auth/csrf.ts`).

🟧 **Login cookie flags.** The login cookie (set by the admin app) is `HttpOnly` + `Signed` + `SameSite=Strict` + `Secure` (production only, so cookies still work on `http://localhost:3000`). A regression test in `apps/admin/tests/unit/routes/login-cookie.test.ts` fails the build if any flag silently weakens. `admin-api` itself is headless JSON; `SameSite=Strict` is the CSRF defence, and CORS does not reflect arbitrary origins (see 4.9).

### 4.9 CORS

🟩 Default `origin: false` (disabled) in `createBaseServer` (`packages/shared/src/server/create-server.ts`). integration-server opts in via `CORS_ORIGIN` — a comma-separated origin list, needed only when a browser client such as docs-server's Swagger console calls the API directly. `parseCorsOrigin()` deliberately offers **no** way to reach `@fastify/cors`'s `origin: true` (reflect whatever arrives) from an env var; `*` is honoured because an operator fronting a genuinely public read-only deployment may mean it, and it states that intent out loud. Trailing slashes are stripped, since browsers send `Origin:` with no path and the comparison is exact.

🟩 **`/admin/*` is excluded from CORS unconditionally**, whatever `CORS_ORIGIN` says — a CORS delegator forces `origin: false` on that prefix. That is what stops script on an allow-listed origin reading admin JSON.

Operators enabling browser clients must:
- Use an explicit allow-list, never `*`, unless the deployment really is public and read-only.
- Disable credentials unless the origin is fully trusted.
- Document allowed origins in deployment notes.

### 4.10 Rate Limiting & DoS

🟩 Global 600 req/min via `@fastify/rate-limit`, plus per-API-key tier in `auth-middleware.ts:92`.

🟩 **Two documented exemptions from the global per-IP bucket**, both in `createBaseServer`'s `allowList`:
- Static-asset prefixes (`/design/`, `/specs/`, `/data/`, `/public/`, `/health` by default) — one admin page load can fire 50+ asset requests; the page renders themselves still count.
- Requests presenting a matching `X-Admin-Secret`, when the service is constructed with `rateLimitAllowSecret`. This exists because the admin UI proxies many requests from one source IP and would otherwise throttle itself — the 429 then surfaces to the operator as a 500. The comparison is `timingSafeEqual` and length-guarded, and **no configured secret means no match**: it never falls open.

🟧 **Multi-instance deployments need shared rate-limit state.** `createBaseServer` accepts a `rateLimitRedis` option; when `REDIS_URL` is set, integration-server constructs a single ioredis client and shares it between the global per-IP bucket (`@fastify/rate-limit`) and the per-API-key bucket (`redisLimiter`). The `scale` profile in compose adds Redis; outside compose, wiring `REDIS_URL` when running more than one replica is the operator's job — without it, each replica keeps its own in-memory buckets and rate-limit accuracy degrades.

🟨 **1 MB body limit is global.** Per-route body limits are not configurable in the application. Some webhook payloads (e.g., bulk batch events) may legitimately exceed 1 MB, and raising the limit globally widens the DoS surface for every route including login.
- **Operator guidance:** keep the global limit where it is and apply looser or tighter per-path limits at the reverse proxy where a specific platform requires it.

### 4.11 TLS / Transport

🟥 **No TLS termination in default compose.** All apps speak plaintext HTTP. Without a reverse proxy, credentials, cookies, and API keys cross the network in cleartext.
- **Recommendation:** require a reverse proxy. See Section 5.1.

### 4.12 SQLite at Rest

🟧 **SQLite files unencrypted.** Volumes contain hashed passwords, encrypted OAuth tokens, API-key hashes, audit logs.
- **Recommendation:**
  - Host disk encryption (LUKS, FileVault, EBS encryption, GCE PD encryption).
  - Restrictive file permissions (`chmod 600`, container UID-owned).
  - Encrypted off-site backups; verify restore quarterly.
  - Consider SQLCipher if disk encryption is not available.

### 4.13 OAuth Token Storage

🟩 `CredentialStore` encrypts tokens with `STORE_SECRET` (AES-GCM via `jose`).

🟧 **Key rotation for `STORE_SECRET`** is documented and tooled — see 4.7 and [`../deployment/key-rotation.md`](../deployment/key-rotation.md).

🟧 **OAuth `state` must be unguessable and bound to the session.** The shared `state` helper generates it via `randomBytes`. What is not mechanically enforced is that every adapter routes through it: when adding or auditing an adapter, verify its `auth.ts` uses the shared helper rather than rolling its own — `Math.random()` is the failure mode to look for. Inspect `apps/integration-server/src/verticals/*/adapters/*/auth.ts`.

🟨 **`redirect_uri` is allow-listed.** An arbitrary accepted `redirect_uri` would let an attacker intercept the authorization code, so `validateRedirectUri()` (`packages/shared/src/control-plane/redirect-uri-validator.ts`) requires a caller-supplied `?redirect_uri=` to match the deployment origin and the canonical `/auth/{vertical}/{platform}/callback` path; `UnifiedAuthRouterOptions.extraAllowedRedirectHosts` covers split deployments. Mismatches are rejected with `400 INVALID_REDIRECT_URI`.

### 4.14 Logging & PII

🟧 **`AdminStore.writeAudit()` accepts a free-form `detail` field** — callers can accidentally log secrets. No redaction helper strips fields named `password`, `token`, `secret`, `authorization`, `api_key` before write; until one exists, treat `detail` as a place secrets must never be put, and review new `writeAudit` callers for it.

The Fastify logger side **is** centralised. `LOG_REDACT_PATHS` and `buildLoggerConfig()` live in `packages/shared/src/server/create-server.ts`; `createBaseServer` applies them, and any app building its own Fastify instance must pass `logger: buildLoggerConfig(true)`. Censor value is `[Redacted]`.
  - **Inbound:** `req.headers.authorization`, `req.headers.cookie`, `req.headers["x-admin-secret"]`, `req.headers["x-api-key"]`, `req.headers["x-bootstrap-token"]`, `res.headers["set-cookie"]`.
  - **Outbound, via a logged error:** every adapter client bakes the connection's live token into its axios instance (`axios.create({ headers: { Authorization: … } })`), so every `AxiosError` it throws carries that token on `err.config.headers`. integration-server installs no error handler, so Fastify's default one logs `{ req, res, err }` and pino's err serializer copies the error's own enumerable `config` / `request` / `response` onto the line verbatim — without redaction, an ordinary upstream 5xx, timeout or rate-limit on **any** adapter would print a reusable OAuth token and the outbound request body to container stdout. The redaction list therefore covers `err.config.headers`/`auth`/`params`/`data`, `err.request`, `err.response.config`/`request`/`headers`, and the same three under `err.cause` (axios wraps an underlying failure there and pino's serializer walks it). It is scoped to the sub-fields that carry secrets, so `config.url`, `config.method` and `response.status` still log.
  - Redaction rather than a `setErrorHandler` **on purpose**: it also covers the sync and refresh workers, whose errors never reach the request lifecycle. An app writing its own `Fastify({ logger: true })` would silently opt out of all of this — `pnpm check:server-logging` fails the build if any service does (see 4.20).

🟧 **No structured log shipping by default.** Operators get container stdout; shipping it to a SIEM (Loki, Datadog, ELK, CloudWatch) is the operator's responsibility. See §5.6 for what to alert on.

### 4.15 Dependencies & Supply Chain

🟩 Major deps current (Fastify 5, jose 6, bcrypt 6, zod 4, better-sqlite3 12).

🟨 **Dependency currency is automated; images are signed, npm packages are not.** `.github/workflows/security-audit.yml` runs `pnpm audit --prod --audit-level=high` on every PR / push / weekly cron and fails on high/critical advisories. `.github/dependabot.yml` opens weekly PRs for npm + GitHub Actions + Docker.

Container images **are** signed: `.github/workflows/images.yml` runs `cosign sign` (keyless, via Sigstore OIDC) on the published digest and `cosign attest --type spdxjson` over the SPDX SBOM generated for that same digest, so an operator can verify both the image and its component list. The run summary prints the `cosign verify` recipe.

What is **not** provided is **npm provenance** on the published npm packages (`@opensteward/sdk`, `/mcp-server` and `/license-token`). `--provenance` is deliberately omitted in `publish-npm.yml` because npm rejects provenance from a private repository; it should be enabled once the repo is public.

### 4.16 Container Hardening

🟧 **Containers run non-root, carry no build toolchain, and have an opt-in hardening overlay.** The Dockerfile builds on `node:24-alpine` and drops to `USER node`. Ownership is set as files land, via `COPY --chown=node:node`, with a single `chown` on the app's `data/` directory — the runtime stage deliberately does *not* `chown -R /app`, which rewrote every file and doubled those layers.

The runtime image also carries **no compiler toolchain and no package manager**: `python3`/`make`/`g++` stay in the builder stage, and `npm`, `npx`, `pnpm`, `corepack` and yarn are removed in the same layer that uses them. `better-sqlite3` and `bcrypt` resolve musl prebuilds at `require()` time, so nothing is compiled at runtime. Measured on integration-server with the same Trivy configuration `images.yml` gates on: **73 → 2 fixable HIGH/CRITICAL findings** (3 CRITICAL → 0), and **271 MB → 74 MB** compressed pull. Of the 73 removed, 69 were tooling — 59 in two cached copies of pnpm under `/root/.cache/node/corepack`, 10 in the bundled `npm`. Zero came from `/app/node_modules`, then or now: the project's own production dependencies scan clean, and the scanner retains full visibility of all of them. `which gcc g++ make python3 pnpm npm npx cc` returns nothing.

The [`docker-compose.hardening.yml`](../../docker-compose.hardening.yml) overlay adds `read_only` rootfs, tmpfs `/tmp`, `no-new-privileges`, `cap_drop: ALL` for every service, and removes `admin-api`'s public port mapping so it is only reachable on the internal Docker network (see §5.2).
🟧 **A passing Trivy gate does not mean Node's TLS is patched, and this is the most important caveat in this section.** The runtime stage upgrades Alpine's `libcrypto3`/`libssl3` to 3.5.8-r0, which takes the scan to zero fixable HIGH/CRITICAL. But **Node links OpenSSL statically**, and `node:24-alpine` currently bundles **3.5.7** — the version carrying CVE-2026-14456. Verified in the built image:

```
ldd $(command -v node) | grep -i ssl   ->  nothing (statically linked)
node -p process.versions.openssl       ->  3.5.7    (unpatched)
apk list -I libcrypto3                 ->  3.5.8-r0 (patched, and not what Node uses)
```

Only `/usr/bin/ssl_client` and `/sbin/apk` link the system libraries. **Every outbound adapter call — to all 1,548 platforms — goes through Node's bundled copy, which Trivy has never scanned**, before or after this change, because a statically linked library is not an apk package. The honest reading of a green gate is "no *scannable* fixable HIGH/CRITICAL remains". Track the base image for a Node build against OpenSSL ≥ 3.5.8; do not treat the gate as the signal.

- **Remaining operator work:** pin base images by digest and rebuild periodically for upstream CVE patches (§5.8). This is now the *dominant* source of image findings rather than a footnote — `node:24-alpine` is a moving tag, and because the runtime stage no longer refreshes the full `apk` index, the scan result is largely a function of whichever base digest the build happened to pull. Two builds a week apart can produce different gate results from identical source; that was observed during this work, not theorised.

### 4.17 SSRF

🟩 Outbound URLs in webhook gateway are sourced from configured platform records, not from request bodies.

🟧 **Tenant-supplied webhook destinations go through `safeFetch()`** (`packages/shared/src/net/safe-fetch.ts`). It DNS-resolves the target and rejects `10/8`, `172.16/12`, `192.168/16`, `127/8`, **`169.254/16` (cloud metadata)**, `0/8`, `100.64/10`, `::1`, `fc00::/7`, `fe80::/10`, and IPv4-mapped IPv6 of any of the above, re-validating on every HTTP redirect. It is the default `fetchImpl` in `deliverOne` (event-emitter) and `WebhookRetryWorker` — both consume tenant-supplied subscription URLs, and tenants can register destination URLs themselves via `/v1/webhook-subscriptions` without operator involvement, which is exactly why the guard exists. `OST_ALLOW_PRIVATE_HOSTS=1` opts out in dev so adapters can hit a mock server on localhost. The `redirect_uri` half is covered in 4.13.

🟧 **`callback_url` on `POST /v1/{vertical}/sync` is validated twice.** The worker POSTs the finished job to the caller-supplied URL, retrying with backoff — unchecked, that would aim the deployment's own network position at cloud instance metadata (`169.254.169.254`), a sibling service on the compose network (`admin-api:3001`), or anything else reachable from inside but not outside. `packages/shared/src/data-store/callback-url.ts` guards it in two layers, because a hostname check alone is not enough: `validateCallbackUrl()` runs at enqueue for a clear `400 INVALID_CALLBACK_URL`, and `assertResolvesToPublicAddress()` re-resolves immediately before the request, because a name can resolve elsewhere by the time a background job runs. A callback URL must be `https`, must not embed credentials, and must not be (or resolve to) `0/8`, `10/8`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`, `100.64/10`, multicast/reserved, `::1`, `fe80::/10`, `fc00::/7`, an IPv4-mapped form of any of those, or `localhost`/`*.localhost`. Supplying a `callback_url` at all requires `vertical:write`, while the sync itself needs only read (a sync enqueues a job and upserts into the local cache; it mutates nothing upstream) — keeping the outbound-POST primitive away from read-only keys. Plaintext http is refused — `validateCallbackUrl` can permit it, but nothing wires that option through, deliberately.

### 4.18 mcp-server

🟨 mcp-server has no HTTP listener (stdio transport), so it cannot be reached over the network. But it runs with full credentials.
- **Recommendation:** treat the MCP client as a high-privilege actor. Log every tool invocation. Sandbox the host process. If MCP is ever exposed over WebSocket/HTTP, add the same auth model as `integration-server`.

### 4.19 docs-server

🟨 Public, read-only. `marked` parses trusted markdown only. Static assets served from disk.
- **Recommendation:**
  - Confirm `/guides/:platform` does not allow `..` or absolute paths. Validate against a known platform list.
  - Set `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

### 4.20 Security CI gates

Static, read-only checks that fail the build on a class of drift the test suite cannot see.

The first two live in `.github/workflows/security-audit.yml`, which is **path-filtered** — it triggers only on PRs touching `package.json` / `pnpm-lock.yaml` or an adapter's webhook / factory / metadata files, plus a Monday 07:00 UTC cron so a CVE filed against a pinned version surfaces even in a quiet week. The rest are steps in `.github/workflows/test.yml`, which runs on **every** PR with no path filter. `check:secret-passthrough` and `check:server-logging` each have a `:soft` variant (`pnpm check:<name>:soft`) that reports without failing, for local use.

| Gate | Fails when | Why it exists |
|------|-----------|---------------|
| `pnpm audit --prod --audit-level=high` | any high/critical advisory in production deps | see 4.15 |
| `pnpm check:webhook-verifiers` | a platform with a webhook handler has no registered verifier | see 4.4 |
| `pnpm check:secret-passthrough` | a secret `scripts/generate-secrets.sh` mints never reaches the service that reads it | A generated secret can be documented and set by the operator yet never forwarded into the container that reads it, silently leaving the control it guards permanently off — admin passthroughs answering `403`, or first-run setup running ungated. The defect is findable by reading no single file: the generator, the reader and the compose file are each correct alone. The check is the join: for every `VAR=$(gen)` in the generator, it reads which apps consume it from `.env.example`'s generated `read by:` annotations and requires `docker-compose.yml` to forward it to each of those services. A second rule covers non-secret operator knobs read from a service's own `config.ts` (`RATE_LIMIT_MAX`) — the shape where a mounted `config.yml` wins unconditionally and changing the value in `.env` does nothing. |
| `pnpm check:server-logging` | a service constructs a Fastify instance outside `buildLoggerConfig` | `LOG_REDACT_PATHS` only protects loggers built by `buildLoggerConfig`. An app writing its own `Fastify({ logger: true })` silently opts out of redaction for auth headers, cookies and upstream errors. See 4.14. |
| `pnpm check:route-access` | an admin-api route has no authentication guard and is not on the reasoned `PUBLIC_ROUTES` allow-list; a data-access route checks no permission, or not its documented one; a fail-closed `SCOPE_RESTRICTED` route omits its `403` from OpenAPI | A route added without `fastify.authenticate` is reachable by anyone who can reach admin-api, and a data route without `requirePermission` hands stored records to every signed-in viewer. The gate boots the real server and reads the tag each guard function carries, so plugin-level hooks count. See 4.2. |
| `pnpm check:field-classification` | a stored resource type has no field classification, or a field named like personal data is classified `public`/`internal` without an allow-list entry | Masking in the viewer, exports, destinations and SQL views is driven by classification; a missing or wrong entry serves personal data in clear. See 4.22. |
| `pnpm check:analytics-catalog` | the SQL view catalog changes without an update to `catalog.lock.json` | BI tools query those columns; a silent breaking change is a data-availability incident, and the lock also records which columns exist in the masked and unmasked schemas. |

### 4.21 Production gates and their dev-mode escape valves

`localhost` stays one command (`docker compose up` / `pnpm dev`) because every production gate degrades deliberately in dev. Quick reference:

| Control | Production mode | Dev mode (`NODE_ENV !== 'production'`) |
|--------|-----------------|----------------------------------------|
| `BOOTSTRAP_TOKEN` gate on `/api/auth/setup` | set the token; the header is then required | token unset by default — the empty-table `409` is the only guard |
| Login lockout | enforced | enforced; opt out via `OST_DISABLE_LOCKOUT=1` |
| Webhook verifier registration | 501 fail-closed when no handler is registered | same — no dev bypass |
| Secret entropy gate (`assertSecret`) | hard fail at boot | downgraded to `console.warn` |
| SSRF private-IP block (`safeFetch`) | enforced | bypassed via `OST_ALLOW_PRIVATE_HOSTS=1` |
| Redis rate limit | when `REDIS_URL` set | in-memory fallback |
| `Secure` cookie flag | on | off (so `http://localhost` cookies work) |
| Admin routes with `ADMIN_SECRET` unset | fail closed `403 ADMIN_DISABLED` (images set `NODE_ENV=production`) | fall through open (host-run `pnpm dev` convenience) |
| Container `read_only` rootfs | via the hardening overlay | default compose unchanged |

### 4.22 Data access: viewer, exports, destinations, SQL access, Superset

The console can show, export and ship the records OpenSteward has synced. Each path is gated by a permission and the caller's tenant scope (4.2), and each masks personal data by default. Architecture: [data-access.md](../architecture/data-access.md).

🟧 **Masking follows field classification.** Every stored field is classified `public`, `internal`, `pii`, `financial` or `secret` per resource type (`verticals/<v>/schema/classification.ts`; generated reference in [data-classification.md](./data-classification.md)). `secret` fields are removed for everyone; `pii` fields are masked unless revealed; `financial` fields are masked only when `data_access.mask_financial` is on; the raw upstream payload (`metadata`/`raw`) counts as PII; a resource type with no classification is served fully masked. Filters and search are refused on fields the caller cannot see unmasked, so a filter cannot answer the question a mask refuses. Masking is applied in integration-server — the only service that can read `resources` — not in admin-api, so a permission bug upstream cannot yield unmasked data.
- **Residual risk:** free-text fields (notes, descriptions, line-item text) are usually `internal` and can still contain personal data your customers typed. Review the classification for the resource types you expose, and prefer masked SQL principals and destinations.
- **Reveal** (`data:read_pii`) is a CSRF-protected `POST`, audited as `data.pii_reveal` **before** the record is returned, and served `Cache-Control: no-store`. Exports are audited as `data.export`.

🟧 **Destinations copy data outside the deployment.** Rows are masked by classification unless the destination has `includePii`, which needs `data:read_pii` and records the approving user. Credentials are encrypted with `STORE_SECRET` (`destinations.encrypted_secrets`, rotated by `rotate-store-secret`) and never returned by the API. Target hosts go through `assertPublicHost` (4.17); private hosts must be allow-listed with `DESTINATIONS_ALLOW_PRIVATE_HOSTS`. Files written to a lake **cannot be retracted** by OpenSteward — see [data-erasure.md](../operations/data-erasure.md#destinations).

🟧 **Read-only SQL access trust model (Postgres only).** A SQL principal is a Postgres login that sees only views: one per resource type, owned by a `NOLOGIN` role and created `WITH (security_barrier)`, filtered by a `SECURITY DEFINER` `visible()` function keyed on `session_user` (so `SET ROLE` cannot widen it). Readers have no grant on any base table — table-level RLS was rejected because it would still expose the unmasked `data` column. Masked principals read `os_analytics`; unmasked ones (`os_analytics_pii`) need `data:read_pii` to create. Each login has a `statement_timeout`, a connection limit and optional `VALID UNTIL`; the password is shown once and only a SCRAM verifier is kept; rotate and revoke end open sessions.
- **What you are trusting:** anyone holding a principal's password can read every row its scope allows, from wherever Postgres is reachable. Treat it as a database credential: require TLS, restrict the listener to your BI hosts, set an expiry, and point `ANALYTICS_READ_HOST` at a read replica so analytics load cannot starve the application.
- **Provisioning privilege:** managed mode gives integration-server `ANALYTICS_ADMIN_DATABASE_URL`, a role with `CREATEROLE`. If that is more than you want the application to hold, use manual mode: the console renders the DDL for a DBA to run. See [postgres-analytics.md](../deployment/postgres-analytics.md).

🟧 **Embedded Superset is a separate application (optional, Postgres only).** Operators never log in to it: the console mints a 5-minute **guest token** per page view (`POST /api/analytics/superset/guest-token`, audited `superset.guest_token`) whose row-level-security clause is the caller's tenant scope; tenant ids and verticals are validated and quoted, and a caller restricted to no tenants gets `403 SCOPE_EMPTY` rather than an unfiltered token. Superset connects as a masked SQL principal, so it never sees unmasked PII; its guest role has no SQL Lab or dataset permission; its CSP allows only the admin origin in `frame-ancestors`, and the admin page's `frame-src` allows only the Superset origin. Authors sign in to Superset directly (OIDC). Keep Superset on the pinned version, patched, and not publicly reachable beyond what the browser needs for `/embedded/*`. See [superset.md](../deployment/superset.md).

🟨 **Admin UI Content-Security-Policy is per route.** The data, dashboards, destinations, SQL access and Superset pages send a strict policy (`script-src 'self'`, no inline script or handler, `frame-ancestors 'none'`; `apps/admin/src/core/csp.ts`). The rest of the console still runs without a CSP because older views carry inline handlers; add one at the reverse proxy only after testing every page.

---

## 5. Deployment-Dependent Recommendations

How you deploy this determines a large fraction of the threat model. The Node code can be perfect and you still get owned by a missing TLS proxy.

### 5.1 TLS Termination — Required

Run a reverse proxy in front. Example Caddy config:

```caddy
admin.example.com {
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "interest-cohort=()"
        -Server
    }
    reverse_proxy admin:3000 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }
}

api.example.com {
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    }
    reverse_proxy integration-server:3010
}

webhooks.example.com {
    reverse_proxy webhook-gateway:3004 {
        # Webhooks need raw body; don't rewrite
        header_up X-Forwarded-Proto {scheme}
    }
}

docs.example.com {
    reverse_proxy docs-server:3003
}
```

- Use Caddy's automatic Let's Encrypt or terminate at an ALB / Cloudflare with origin certs.
- Do not expose `admin-api:3001` via the proxy. Keep it on the internal Docker network only.

### 5.2 Docker Hardening Overlay

Drop in `docker-compose.hardening.yml` and merge:

```yaml
services:
  admin:
    user: "1000:1000"
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    restart: unless-stopped

  admin-api:
    user: "1000:1000"
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    # Internal-only network
    networks:
      - internal
    ports: []  # never publish

  integration-server:
    user: "1000:1000"
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL

  webhook-gateway:
    user: "1000:1000"
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL

  docs-server:
    user: "1000:1000"
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL

networks:
  internal:
    internal: true
```

Run as: `docker compose -f docker-compose.yml -f docker-compose.hardening.yml up -d`.

### 5.3 Network Segmentation

- `admin-api` must bind to the internal network only. The `internal: true` flag above prevents external routing.
- Optionally restrict the admin UI to an IP allow-list via the reverse proxy (`@allowed` matcher in Caddy, `allow`/`deny` in nginx).
- Use a WAF (Cloudflare, AWS WAF) on public-facing services.
- If you enable read-only SQL access, expose Postgres (or its read replica) only to the BI hosts that need it, never publicly. If you embed Superset, publish only what the operator's browser needs; its metadata database stays internal.

### 5.4 Secrets Injection

Pick one, never use the docker-compose defaults:

| Mechanism | Use when |
|-----------|----------|
| Docker secrets / file mounts | Simple self-hosted; secrets on disk readable only by container |
| HashiCorp Vault + agent sidecar | Multi-app, audit trail, dynamic secrets |
| AWS/GCP Secrets Manager | Cloud-native |
| Doppler / 1Password Connect | SaaS team workflows |
| SOPS-encrypted env file | GitOps; commit encrypted, decrypt at deploy |

Mandatory env vars (must be set per-deployment; see `docs/environment/environment-variables.md` for the full catalog):
- `SESSION_SECRET` — ≥32 random bytes
- `JWT_SECRET` — ≥32 random bytes
- `STORE_SECRET` — ≥32 random bytes
- `ADMIN_SECRET` — ≥32 random bytes. **Required in a container deployment:** the images set `NODE_ENV=production`, so leaving it unset makes every admin route answer `403 ADMIN_DISABLED` (see 4.2). Only a host-run `pnpm dev` may omit it.
- `SERVICE_SECRET` — ≥32 random bytes. Presented by integration-server to admin-api as `X-Service-Secret` when polling operator-tuned runtime settings and when forwarding connection.create/connection.delete audit events to `POST /api/internal/audit` (best-effort — a missing secret or down admin-api skips the audit write silently). Deliberately a *different* value from `ADMIN_SECRET`, which authenticates the opposite direction, so a compromise of one service does not open both paths. Unset (or under 16 chars) means the poll is rejected and every setting falls back to its env/compiled default — it never falls open.
- `BOOTSTRAP_TOKEN` — see 4.1. **Keep it set** after setup — unsetting it re-opens `POST /api/auth/setup` the moment the admin table is empty again.
- Per-adapter OAuth client IDs/secrets — never commit

`scripts/generate-secrets.sh` prints all six in `.env` form (64 base64 chars each, from `openssl rand -base64 48`). To mint one by hand:
```bash
openssl rand -base64 48
```
Whichever mechanism you pick, the value has to reach the *process*: a secret set in `.env` but not forwarded in `docker-compose.yml` leaves the control it guards off, silently. `pnpm check:secret-passthrough` (4.20) enforces that for the secrets this repo generates.

### 5.5 Backups

- The bundled `pnpm backup` / `pnpm restore` tools snapshot every named volume plus `.env` and the per-service `config.yml` files into one tarball with a manifest. Runbook: [`../deployment/backup-restore.md`](../deployment/backup-restore.md).
- Backups contain `.env` and the encrypted stores. Treat a backup tarball as equivalent to the deployment's secrets, and encrypt it before it leaves the host.
- Snapshot SQLite volumes at least daily. Use `sqlite3 .backup` for online snapshots; do not copy raw files while the server runs.
- Encrypt backups before they leave the host (`age`, `gpg`, or KMS-encrypted S3).
- Test restore quarterly. An untested backup is not a backup.
- Retain audit logs separately from primary data, with longer retention.

### 5.6 Logging Pipeline

- Ship container stdout to a SIEM. Do **not** log request bodies.
- Alert on:
  - `>10` 401s from a single IP in 60 s
  - `/api/auth/setup` called after first setup
  - audit log gap (zero events in 24 h on a busy system)
  - new API key with admin scope
  - bulk DLQ retries
- Retain audit logs ≥1 year.

### 5.7 Multi-Tenant Operation

If you host multiple tenants on one deployment:
- Each tenant gets its own API key with scoped permissions.
- Quarterly review of audit log: who accessed what.
- Document tenant isolation guarantees and limits.
- Confirm `connectionBelongsToTenant()` covers every write endpoint via end-to-end tests.

### 5.8 Update Cadence

- Pin base images by digest, not tag.
- Monthly patch window: rebuild containers, redeploy.
- Subscribe to security advisories for Fastify, jose, bcrypt, better-sqlite3, Node.js LTS.

---

## 6. Pen-Test Playbook

A tester engaged against a real deployment should at minimum probe:

| # | Vector | Where | Expected behavior |
|---|--------|-------|-------------------|
| 1 | Login brute force | `POST /api/auth/login` | Rate limit kicks in after 5 attempts / 60 s. Should also lock per-username. |
| 2 | JWT tampering | Any authenticated request | Reject `alg: none`, reject swapped keys, reject expired tokens, reject without `kid`. |
| 3 | `/api/auth/setup` re-init | After wiping `admin-data` volume | Rejected with `401` when `BOOTSTRAP_TOKEN` is set (requires `X-Bootstrap-Token`); empty-table `409` otherwise. See 4.1. |
| 4 | Cross-tenant access | Swap `connection_id` in any `/v1/...` request | 403. Verify on every write endpoint. |
| 5 | API key scope escalation | Use `*:read` key on a write endpoint | 403. |
| 6 | Webhook replay | Re-post a captured webhook with same signature | Vertical should reject by timestamp or idempotency key. |
| 7 | Webhook signature bypass | Strip signature header | Should reject (see 4.4). |
| 8 | Path traversal | `GET /guides/../../etc/passwd` on docs-server | Must reject. |
| 9 | SSRF | OAuth callback or adapter URL pointing at `169.254.169.254`, `127.0.0.1` | Reject. |
| 9b | SSRF via sync callback | `POST /v1/{vertical}/sync` with `callback_url` at `http://169.254.169.254/`, `http://admin-api:3001/`, or a public name whose DNS record points inside | `400 INVALID_CALLBACK_URL` at enqueue, and a second resolve-and-reject immediately before the outbound POST. See 4.17. |
| 10 | Open redirect | OAuth `redirect_uri=https://evil.example/` | Must enforce allow-list. |
| 11 | Cookie flags | Inspect Set-Cookie | `HttpOnly`, `Secure`, `SameSite=Strict` on session; signed. |
| 12 | Header injection | Webhook forwarding with `\r\n` in path | Fastify sanitizes; confirm. |
| 13 | SQLite leak | Direct filesystem access to data volumes | UID-restricted. Container UID 1000 only. |
| 14 | `ADMIN_SECRET` timing | Measure response time on near-miss header | Constant-time comparison (see 4.1). |
| 14b | Unauthenticated admin surface | `GET /admin/...` with no header, and with a wrong one, against a container-deployed stack | `403` both times. A `200` means `NODE_ENV` is not `production` in the image (see 4.2). |
| 14c | Forged session cookie | Sign an admin session cookie with the placeholder secret from the mounted `apps/admin/config/config.yml` | Redirect to `/login`. Authenticating means the deployment resolved its session secret from YAML, not env (see 4.7). |
| 14d | Credential in logs | Force any adapter call to fail (revoke the upstream token, point the adapter at a dead host) and read container stdout | No `Authorization` value, no outbound body. `[Redacted]` in their place (see 4.14). |
| 15 | Rate-limit bypass | Multiple IPs (`X-Forwarded-For` spoofing) | Trust only the immediate proxy; configure `trustProxy`. |
| 16 | Body size DoS | 100 MB POST | 413 at proxy + 413 at Fastify. |
| 17 | Slowloris / slow body | Drip-feed body bytes | Proxy must close idle/slow connections. |
| 18 | Dependency CVE | `pnpm audit` + Snyk | No high/critical at deploy time. |
| 19 | Open ports | `nmap` the host | Only 80/443 public. `3001` must be internal. |
| 20 | Container escape | If a vertical adapter crashes/exploits | `cap_drop: ALL`, `no-new-privileges`, read-only rootfs limit blast radius. |

---

## 7. Vulnerability Disclosure

Report security issues through **GitHub Security Advisories** on the `open-steward/opensteward` repository:

1. Navigate to the [Security tab](https://github.com/open-steward/opensteward/security/advisories/new).
2. Click "Report a vulnerability".
3. Provide a clear, reproducible report.

We aim to acknowledge within 5 business days. Please do not file public issues for security problems. We follow a coordinated 90-day disclosure window unless a shorter timeline is required by exploit activity.

---

## 8. Pre-Production Operator Checklist

Copy this into your deployment runbook. Do not skip items.

### Secrets
- [ ] `SESSION_SECRET`, `JWT_SECRET`, `STORE_SECRET`, `ADMIN_SECRET`, `SERVICE_SECRET` each ≥32 random bytes, unique per environment (`scripts/generate-secrets.sh` prints all of them)
- [ ] Each of those actually forwarded to the service that reads it — confirm with `docker compose config`, not by reading `.env`. `pnpm check:secret-passthrough` covers this in CI
- [ ] No mounted `config/config.yml` carries a real or placeholder secret; env is the only source in production
- [ ] Set `BOOTSTRAP_TOKEN` to gate `POST /api/auth/setup` (required as `X-Bootstrap-Token`); keep it set so a later DB wipe stays gated — see finding 4.1
- [ ] Adapter OAuth client secrets stored in a secret manager, not in `.env`
- [ ] `.env*` in `.gitignore`; verify with `git check-ignore`

### Network
- [ ] TLS reverse proxy in front (Caddy / nginx / Traefik / ALB)
- [ ] HSTS, security headers configured at proxy
- [ ] `admin-api:3001` not published to host or public network
- [ ] WAF or IP allow-list on `/admin*`
- [ ] `trustProxy` configured to trust only the reverse proxy

### Containers
- [ ] Non-root `USER` in all images
- [ ] `read_only: true` + tmpfs for `/tmp`
- [ ] `cap_drop: ALL`, `no-new-privileges: true`
- [ ] Base images pinned by digest
- [ ] Image scanner in CI (Trivy / Grype)

### Data
- [ ] Field classification reviewed for the resource types you store (free-text fields can hold personal data) — see [data-classification.md](./data-classification.md)
- [ ] `data:read_pii` held only by the people who need to reveal personal data; tenant scope set for users who serve one customer
- [ ] Destinations with `includePii` and unmasked SQL principals reviewed; SQL principals have an expiry
- [ ] Host disk encryption enabled
- [ ] SQLite volumes UID-restricted (`chmod 600`)
- [ ] Daily encrypted backups, off-site
- [ ] Restore tested in last 90 days

### Monitoring
- [ ] Container logs shipped to SIEM
- [ ] Alert on auth failure spikes, `/api/auth/setup` post-bootstrap, new admin API keys
- [ ] Audit log retention ≥1 year
- [ ] On-call rotation in place

### Code & Dependencies
- [ ] Dependabot/Renovate enabled
- [ ] `pnpm audit` in CI, fail on high/critical
- [ ] GitHub Actions pinned to SHAs
- [ ] Branch protection on `main`, required reviews, signed commits

### Application
- [ ] Bootstrap admin account created with a strong unique password + MFA where possible
- [ ] Bootstrap admin account created (setup then returns `409`; with `BOOTSTRAP_TOKEN` set, the endpoint also requires `X-Bootstrap-Token` — see finding 4.1)
- [ ] Per-tenant API keys provisioned with least-privilege scopes
- [ ] `auth.sandbox_self_serve_enabled` confirmed disabled unless you intend public self-serve sandbox keys (`POST /test/v1/keys` is unauthenticated when it is on)
- [ ] Webhook signature verifiers registered for every active platform
- [ ] Adapter redirect URIs allow-listed

### Documentation
- [ ] Secret rotation runbook written and tested
- [ ] Incident response runbook published to team
- [ ] Tenant-isolation guarantees documented and shared with customers

---

*This document is a starting point, not a finish line. Re-audit on each major release and after any change to authentication, authorization, or webhook handling.*
