# Glossary

> Canonical definitions for the terms that show up across docs, code, and admin UI. When a doc uses one of these terms, treat the definition here as authoritative.

For the full five-layer auth model (with the relationships between operator, admin user, developer key, end-user, and connection), see [docs/architecture/auth-and-tenancy.md](./architecture/auth-and-tenancy.md).

---

## Operator

The organisation deploying OpenSteward on their own infrastructure. The operator owns the deployment, holds the secrets, and is the legal data controller for everything the system reads.

There is exactly **one** operator per deployment (`company_info` row, id=1). The operator has no formal authentication of its own — it *is* the deployer. AdminUsers authenticate on the operator's behalf.

Used in docs as the second-person subject. Anchor: [auth-and-tenancy.md § Operator](./architecture/auth-and-tenancy.md#chart-11--five-layer-auth-model).

## AdminUser

A human who authenticates to admin-api with username + password (bcrypt-hashed), or through SSO. Base roles: `admin`, `operator`, `viewer`, optionally refined by a [custom role](#custom-role). JWT-authenticated via `POST /api/auth/login`. Stored in admin-api's `admin.db`.

AdminUsers manage developer keys, customers, connections, and Connect Links on the operator's behalf. By default they act for the whole operator (every tenant); an admin can restrict one to some tenants with an [access scope](#access-scope-tenant-scope).

## Developer key

The Bearer credential a developer backend uses to call `/v1/*`. Format `osk_<tenant-suffix>_<random-hex>`. Scope-gated (e.g. `customers:read`, `vertical:accounting`, `vertical:write`). Tenant-scoped (one key authorises one deployment tenant). Stored hashed (scrypt) with a 12-char prefix index for fast lookup. Plaintext is returned **once** on mint and never again.

Default preset (`SAFE_DEFAULT_SCOPES` in `apps/admin/src/core/routes/api-keys-defaults.ts`) is **read-only** — it omits every `vertical:write` scope. See [read-only-by-default](#read-only-by-default).

## Tenant

A logical isolation boundary inside the operator's deployment. One tenant per deployment is the common case; multi-tenant setups partition customers, connections, and resources per tenant. Tenant identity rides on:

- the developer key (`tenant_id` column on `developer_api_keys`)
- the customer row (`tenant_id` column on `customers`)
- the connection row (**two** columns — see below)

## End-user / customer

Both terms refer to the operator's external user — the SMB whose books the operator is reading, the policyholder filing a claim, the borrower the operator is underwriting. Never logs in to the admin UI. Receives a Connect Link in their email, opens it, consents on the upstream platform (Xero, FedEx, Stripe…), and a connection is created in the operator's deployment.

In code and the admin UI the term is **customer** (`/v1/customers`, `customers` table). In long-form docs both "customer" and "end-user" appear — they are the same person. Identified by `(tenant_id, email)`.

## Connection

One OAuth authorisation between the operator's deployment and one upstream platform on behalf of one customer. Stored in the `credentials` table.

Two tenant columns:

- `tenant_id` — the **upstream** platform's tenant identifier (e.g. a Xero organisation id, a Fortnox company id). Set by the OAuth callback.
- `owner_tenant_id` — the **deployment** tenant (the operator's tenant the developer key was scoped to). Set at OAuth callback from the request context.

The pair `(vertical, platform, tenant_id, label)` is unique. The `label` lets one customer connect, e.g., two Stripe accounts under the same upstream tenant.

## Vertical

A domain of integrations. The nine verticals are **accounting**, **crm**, **ecommerce**, **logistics**, **payments**, **docsign**, **projects**, **customer-support**, **inventory**. Each vertical has its own canonical schema (a `Contact` in CRM is not a `Contact` in accounting), its own router, and its own adapter tree.

Verticals are intentionally siloed at the schema level — there is no cross-vertical canonical model. Cross-cutting concerns (auth, webhook signing, retry, transform helpers) are shared in `packages/shared/` instead.

## Adapter

The bridge between one upstream platform's API and a vertical's canonical schema. Lives at `apps/integration-server/src/verticals/<vertical>/adapters/<slug>/`. Each adapter contributes:

- `index.ts` — the adapter object implementing the vertical's `*Adapter` interface
- `auth.ts` — OAuth flow / API key handling
- `client.ts` — HTTP client with retry
- `transform/*.ts` — canonicalisation functions per resource
- `webhook.ts` *(optional)* — signature verification for inbound webhooks

1,548 adapters ship across all nine verticals: 281 accounting, 152 CRM, 176 ecommerce, 320 logistics, 159 payments, 116 docsign, 116 projects, 105 customer-support, 123 inventory. Each is registered in the vertical's `platforms/metadata.ts` (the source of truth used by `pnpm --filter integration-server run generate:platforms-doc`). Reference adapters: accounting → fortnox, crm → nutshell, ecommerce → shopify, logistics → easypost, payments → stripe, docsign → docusign, projects → asana, customer-support → zendesk, inventory → cin7-core. No platform logos ship with OpenSteward; the catalog shows monogram tiles unless the operator picks a logo source (see [platform logos](./operations/platform-logos.md)).

## Platform

The upstream third-party SaaS (Stripe, Xero, Salesforce, FedEx…). One platform corresponds to one adapter `<slug>` inside one vertical. Some companies appear in multiple verticals (e.g. Square is in payments **and** ecommerce) — each surface gets its own adapter.

## Connect Link

A tokenised, single-use OAuth consent flow hosted by the integration-server at `/connect/<token>`. The operator mints a link from the admin UI's `/connect-links` page (or a developer mints one with `POST /v1/customers/{id}/connect-links`), sends the URL to a customer; the customer opens it, signs in to the upstream platform, and the connection lands in the operator's deployment. Branded with the operator's company info.

The token in the path *is* the credential — the route carries no header. A session is `active` until it is consumed (`consumed_at` set, `connection_id` populated) or its TTL passes (`expired`, computed at read time). Revoking backdates `expires_at` so expiry and revocation share one code path. Default TTL 7 days, maximum 90.

Three link modes, named `linkMode` on the admin form (minting requires the `operator` role or higher):

- **Pinned** — `vertical` **and** `platform` both named at mint time. Skips the picker and lands the customer straight in that adapter's OAuth. Both fields are required; a link naming only one of them is not pinned to anything.
- **Customer picks adapter** — the picker appears, restricted to whatever `allowedVerticals` / `allowedPlatforms` the link allows.
- **Self-register** — no customer bound at mint time; the landing page captures an email and `POST /connect/:token/customer` creates and binds the end-user before the picker. Operator surface only (`POST /admin/connect-sessions` with `allowSelfRegister: true`, or the admin form) — the developer route always mints against a customer already in the path.

Also per-link: `oneTimeOnly` (auto-deletes the connection after the first sync), `redirectUrl`, a starting [sync schedule](#sync-schedule) for the connection it creates, and a scope policy (below). Reusable templates live in admin-api's `connect_link_templates` table. See [docs/architecture/connect-links.md](./architecture/connect-links.md).

## Scope group

A named, reusable bundle of one platform's **upstream OAuth** scopes — a `(vertical, platform, name, scopes[])` row in admin-api's `scope_groups` table, managed on the admin UI's `/scope-groups` page. Applied at Connect Link mint time so an operator can say "this link asks Xero for read access to invoices only" without retyping the platform's scope strings. Distinct from the developer-key scopes above (`customers:read`, `vertical:write`, …), which gate OpenSteward's own API.

## Scope policy (read-only link)

How a Connect Link decides which **upstream OAuth** scopes to request. Stored as `scope_policy` on the connect session and resolved per-platform at OAuth-start, so a link that allows several platforms still means the same thing on each. The default depends on where the link is minted: the admin console's form defaults to `platform_default`, the developer API (`POST /v1/customers/{id}/connect-links`) to `read_only`.

- `read_only` — request the chosen platform's curated `readScopes` from its `metadata.ts`, falling back to the platform default where none are catalogued. This is what "read-only link" means.
- `platform_default` — send no scope override; the platform / OAuth-app default applies, which may include write scopes.
- `custom` — send the explicit `scopes` array on the session. Setting `scopes` on the developer route implies this policy.

`check:read-scopes` fails the build if a platform's `readScopes` entry is not also in that platform's `recommendedScopes` catalogue — the net that keeps a write scope out of a "read-only" set.

## Sync schedule

How often a connection's data is re-read from its platform into the data store. Every connection has one of four modes (`syncMode` on `GET /v1/connections/{id}`): `default` — every deployment interval (the `data_store.sync.default_interval_minutes` runtime setting, 6 hours unless changed); `custom` — its own interval, 15 minutes to 30 days; `trigger_only` — never automatically, not even after connecting; `once` — one sync when the connection is made. The integration-server's `SyncScheduler` enqueues due syncs every 60 s; a failed `default` or `custom` sync is retried after 15 minutes, doubling, never later than the interval, and a failed one-time sync is not retried. Operators set a schedule on the connection's admin page or as the starting schedule on a Connect Link; it is read-only on the developer API. Kill switch: `data_store.sync.scheduler_enabled`. See [dev-api.md §7](./dev-api.md#sync-schedules).

## Keep-alive refresh

The background renewal performed by `RefreshKeepAliveWorker` (`apps/integration-server/src/workers/refresh-keep-alive-worker.ts`). The on-request refresh in the auth middleware only fires when someone makes a call, so an idle connection would lapse past a provider's idle cap (60–100 days) without this. The worker ticks every 15 minutes by default, renews tokens lapsing within the next 30 minutes, exercises grants that carry no access-token expiry every 20 hours, and retries hard-expired rows weekly in case the customer re-authorized elsewhere.

Consequence for readers of the API: **a lapsed `expiresAt` is not a fault.** Read it alongside `lastRefreshStatus` — `ok` means healthy, `expired` and `platform_error` are the ones that need a human.

## Allow-secret exemption

The `rateLimitAllowSecret` option on `createBaseServer`, wired to `ADMIN_SECRET`. A request presenting a matching `X-Admin-Secret` (constant-time compared) is exempt from the global per-source-IP rate limit. Sibling services inside the compose network all arrive from one container IP with no `X-Forwarded-For`, so without it a deployment throttles its own admin UI long before an outside caller notices. An unset `ADMIN_SECRET` exempts nothing — the guard cannot fall open on a missing value. The per-API-key budget is unaffected.

## MCP server

`@opensteward/mcp-server`. An npm-distributed binary that exposes the unified API to AI agents (Claude Desktop, Cursor, Continue, Cline, gemini-cli) over the Model Context Protocol. **Read-only**: `list_*` / `get_*` tools only, no `create_*` / `update_*` / `delete_*` ever. Two auth modes:

- **Tenant mode** — `Bearer os_<developer-key>`: agent acts as the operator inside one tenant; sees every connection in that tenant.
- **End-user mode** — `Bearer eut_<end-user-token>`: agent acts as one customer; only sees connections that customer authorised. Used for customer-facing AI surfaces.

Runs per-agent via `npx`, not in the main `docker compose up`.

## Read-only by default

The deliberate posture of the default developer-key preset: `SAFE_DEFAULT_SCOPES` carries a `vertical:<v>` touch scope for each of the nine verticals plus `vertical:read`, and omits `vertical:write`. A freshly-minted key can read every vertical, manage customers, and consume Connect Link consents — but cannot push writes back to upstream systems.

Enabling write requires explicitly adding the `vertical:write` scope at mint time, which means minting from the admin UI (**All access** or **Custom**). The `mint-api-key` CLI takes no scope flag and always mints an all-access (`*`) key.

The compliance frame (see [business-cases](./business-cases/README.md)) leans on this default — a read-only data fetcher does not, by itself, extend an operator's regulatory perimeter.

## Bootstrap token

A high-entropy random string set via the `BOOTSTRAP_TOKEN` environment variable (generate with `./scripts/generate-secrets.sh`). When set, `POST /api/auth/setup` requires a matching `X-Bootstrap-Token` header (constant-time compared; `401` otherwise), gating first-run admin creation on a fresh or wiped deployment; the admin UI setup wizard prompts for it. When unset there is no token gate — the setup route is then guarded only by the empty-user-table check (returns `409` once an admin exists), so set `BOOTSTRAP_TOKEN` for any internet-exposed deployment and keep it set. See finding 4.1 in [`security/README.md`](./security/README.md).

## Data store mode

The integration-server has a resource cache (`resources.db`) populated by per-vertical SyncWorkers. Three modes via `dataStore.mode` in config or `DATA_STORE_MODE` in the environment:

- `database` (**default**) — read-through cache; a miss goes upstream and writes back. `?is_live=true` on a request bypasses the read, not the write-back.
- `passthrough` — never cache; every `/v1/*` request hits the upstream platform. The `/sync` routes are not mounted in this mode.
- `external` — everything `database` does, **plus** a signed `resource.synced` / `resource.updated` / `resource.deleted` outbound webhook on every cache write, so the operator can hydrate their own database.

## Owner tenant

Synonym for the `owner_tenant_id` column on a connection — the deployment tenant the connection belongs to. Distinct from `tenant_id` which is the upstream platform's tenant. Used wherever the connection's logical owner inside the deployment matters (rate-limit bucketing, audit logs, webhook routing).

## Permission

A named capability an AdminUser holds, such as `data:read`, `data:read_pii`, `destinations:manage` or `roles:manage`. The catalog is defined in code (`packages/shared/src/auth/permissions.ts`, `GET /api/permissions`); each built-in role carries a fixed set and a custom role lists its own. admin-api checks the permission on every call (`requirePermission`); the admin UI only hides what the user cannot use. Not the same as a developer key's *scopes* (`vertical:write`, …), which gate `/v1/*`. See [permissions-and-roles.md](./architecture/permissions-and-roles.md).

## Custom role

A role an admin defines: a name, a **base role** (`viewer`, `operator` or `admin`) and a list of [permissions](#permission). `users.role` keeps holding the base role, so everything that checks roles keeps working; permission checks read the custom role's list. Built-in roles cannot be edited, and a role in use cannot be deleted.

## Access scope (tenant scope)

Which deployment tenants — and optionally which verticals within each — an AdminUser may see. `all` (the default) or `restricted` to a list; set by an admin (`manual`) or by identity-provider scope rules at SSO sign-in (`idp`). Out-of-scope connections, sync jobs and records answer `404`; surfaces that are not tenant-scoped yet answer `403 SCOPE_RESTRICTED`. Matched against a connection's [owner tenant](#owner-tenant). Distinct from a developer key's API *scopes*.

## Field classification

The sensitivity label on each stored field, per resource type: `public`, `internal`, `pii`, `financial` or `secret`, with a mask (`email`, `phone`, `name`, `address`, `redact`, `hmac`) for masked classes. It drives masking in the data viewer, exports, destinations and SQL views: `secret` is always removed, `pii` masked unless revealed with `data:read_pii`, `financial` masked when `data_access.mask_financial` is on. Defined in `verticals/<v>/schema/classification.ts`; reference in [security/data-classification.md](./security/data-classification.md).

## Destination

A warehouse or lake that OpenSteward exports synced records to on a schedule: Parquet files on S3, GCS or Azure Blob, or tables in Postgres, Snowflake, BigQuery or Databricks. Changes only, delivered at least once, masked by classification unless `includePii` was approved; deletions follow as [tombstones](#tombstone). Configured by users with `destinations:manage`. See [integrate/destinations.md](./integrate/destinations.md).

## Tombstone

A row in `resource_tombstones` recording that a record, a connection's records, a vertical or the whole store left the data store. It carries identifiers and a time, no record contents, and is the delete feed [destinations](#destination) read.

## SQL principal

A read-only Postgres login created for a BI tool or notebook through read-only SQL access (Postgres deployments only). Username `os_sql_<label>_<suffix>`; it sees only the `os_analytics` views (masked) — or `os_analytics_pii` for an unmasked principal — filtered to the tenants and verticals it was granted, never the base tables. The password is shown once. See [integrate/sql-access.md](./integrate/sql-access.md).

## Audit log

Append-only record of admin-API actions stored in admin-api's `admin.db`. Captures who did what when (user id, action, resource id, timestamp). Surfaced in admin → Audit log. Not the same as the integration-server's request log.

---

## See also

- [docs/architecture/auth-and-tenancy.md](./architecture/auth-and-tenancy.md) — the five-layer auth model in chart form
- [docs/dev-api.md](./dev-api.md) — developer-facing walkthrough using the terms above
- [docs/business-cases/README.md](./business-cases/README.md) — terms used in the regulatory framing
