# Contributing to OpenSteward

Thanks for contributing. This document covers how to add a new adapter, fix a bug, or improve the project.

---

## License of contributions

OpenSteward is source-available under a split license — see [`LICENSE`](./LICENSE). Most of the project is under the Elastic License 2.0 plus an Additional Use Grant; the client packages (`packages/sdk`, `packages/cli`, `apps/mcp-server`) are under Apache-2.0.

**Contributing requires signing a CLA.** Add yourself to [`.github/cla-signatures.json`](./.github/cla-signatures.json) in the same pull request as your first contribution — that commit, authored by you, is the signature. The `cla` check verifies it and tells you exactly what to add if you forget (`pnpm check:cla` runs it locally). You sign once; it covers everything you contribute after. The full text and the reasoning behind it are in [`CLA.md`](./CLA.md).

The short version: **you keep the copyright to your contribution.** The CLA is not an assignment. What it adds is permission for the project to license your contribution under any terms — which is what makes it possible to sell commercial licenses, and to relicense the project more permissively later. Without it, a single merged patch would leave a file the project cannot license coherently.

Please make sure you have the right to submit anything you contribute (for example, that your employer has not claimed rights to the work).

The project name and logo are not covered by the license or the CLA — see [`TRADEMARKS.md`](./TRADEMARKS.md).

---

## Table of contents

1. [Getting started](#1-getting-started)
2. [Project structure](#2-project-structure)
3. [Adding a new adapter](#3-adding-a-new-adapter)
4. [Writing transforms](#4-writing-transforms)
5. [Adding webhook support](#5-adding-webhook-support)
6. [Writing tests](#6-writing-tests)
7. [Updating generated files](#7-updating-generated-files)
8. [Pull request checklist](#8-pull-request-checklist)
9. [Shared package](#9-shared-package-openstewardshared)
10. [Code style](#10-code-style)
11. [Docker build resources and tuning](#11-docker-build-resources-and-tuning)

---

## 1. Getting started

This is a **pnpm workspaces + Turborepo monorepo**.

```bash
git clone https://github.com/open-steward/opensteward
cd opensteward
pnpm install
# MUST run before any app. integration-server needs `shared`, `destinations`
# AND `design-system` (it imports `designSystemRoot` at runtime, and `dist/` is
# gitignored); docs-server's typecheck needs `platforms-ui` on top; and
# `tests/integration/sdk-wire.test.ts` resolves the SDK's *built* dist entry,
# so it fails collection unbuilt — and editing `packages/sdk/src` without
# rebuilding tests the old dist. Build all six (license-token first: shared
# compiles against it) before `pnpm -r test` or `pnpm -r run typecheck`.
pnpm --filter @opensteward/license-token --filter @opensteward/shared --filter @opensteward/destinations \
     --filter @opensteward/design-system --filter @opensteward/platforms-ui \
     --filter @opensteward/sdk run build
```

Or build everything in dependency order with `pnpm run build` (Turbo orders
all 14 tasks via `^build`, so this can't go stale) — but not `pnpm -r run build`,
which ignores the graph and starts apps before their workspace dependencies.

### The pnpm version floor is load-bearing — don't lower it

`packageManager` pins **`pnpm@9.15.9`**, and it cannot go below roughly 9.1
without breaking lockfile regeneration outright. The root manifest cross-aliases
two scoped packages:

```json
"@typescript/native": "npm:typescript@^7.0.2",
"typescript": "npm:@typescript/typescript6@^6.0.2"
```

pnpm 9.0.0 does not honour an `npm:` alias under a *scoped* name. It fetches the
literal package name and dies before writing anything:

```
ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@typescript%2Fnative: Not Found - 404
```

The trap is that it only fires when re-resolution actually happens. With an
up-to-date lockfile pnpm short-circuits and everything looks fine — so `pnpm
install` on a clean checkout passes, and the failure only shows up the moment
someone changes a dependency. That is every version bump, Dependabot's security
updates included.

If you need to move this pin, change a dependency range first and confirm
`pnpm install --lockfile-only` still completes. A pin that only works when
nothing has changed is not a working pin.

Set up local config files for the four services that read one (docs-server has none):

```bash
for app in admin admin-api webhook-gateway integration-server; do
  cp apps/$app/config/config.example.yml apps/$app/config/config.yml 2>/dev/null || true
done
```

Run the unified service in dev mode:

```bash
pnpm --filter integration-server run dev   # :3010 — handles every vertical
```

Common workspace commands:

```bash
pnpm -r test                                          # all tests (~110k)
pnpm -r run typecheck                                 # typecheck everything
pnpm -r run lint                                      # lint everything
pnpm --filter integration-server test                 # only the integration-server suite
pnpm --filter @opensteward/shared test           # shared-package tests
pnpm test:pg                                          # Postgres-backed suites in a throwaway container (needs Docker)
pnpm run test:e2e                                     # Playwright browser journeys — needs a running stack
pnpm run docs:all                                     # regenerate all generated docs
pnpm run check:docs                                   # CI: fail if generated docs are stale
```

Or `cd` into a specific app and use `pnpm run …` directly.

---

## 2. Project structure

The whole adapter surface lives in **one** service, `apps/integration-server/`, with each domain (accounting, crm, ecommerce, logistics, payments, docsign, projects, customer-support, inventory) under `src/verticals/<name>/`. Auxiliary apps (admin UI, admin API, docs server, webhook gateway) ship as siblings.

```
apps/
  admin/                  — Admin frontend (:3000)
  admin-api/              — Admin REST API (:3001)
  docs-server/            — Swagger UI for the unified spec (:3003)
  webhook-gateway/        — Inbound webhook receiver with retries (:3004)
  integration-server/     — Unified integration service (:3010)
    src/
      index.ts            — entry: loadConfig + buildServer + listen
      config.ts           — YAML loader, env-var overrides
      server.ts           — wires control plane + every vertical
      verticals/
        <name>/
          index.ts        — buildXRegistry + createXPlugin
          adapter/        — vertical-specific Adapter interface
          adapters/       — one directory per platform
          router/         — Fastify route handlers (one file per resource)
          schema/         — canonical Zod schemas
          platforms/      — platform metadata + logos
          webhooks.ts     — WEBHOOK_HANDLERS map
          openapi.ts      — buildSpec() — vertical's slice of the unified spec
    scripts/              — generate-openapi, generate-postman, etc.
    tests/
      verticals/<name>/   — unit tests per vertical
      integration/        — opt-in live API tests (skip without credentials)
packages/
  shared/                 — @opensteward/shared — control plane, store, schemas
  design-system/          — @opensteward/design-system — tokens, CSS, brand logos
  platforms-ui/           — @opensteward/platforms-ui — shared platform-browse UI
  codegen/                — @opensteward/codegen — logo fetcher utilities
  destinations/           — @opensteward/destinations — warehouse/lake exports (Parquet sinks, Postgres, export worker)
  sdk/                    — @opensteward/sdk — typed clients (generated from the specs)
  license-token/          — @opensteward/license-token — license token contract (PASETO v4.public)
  cli/                    — @opensteward/cli — the `os` binary (generated from the specs)
e2e/                      — @opensteward/e2e — Playwright browser journeys (`pnpm run test:e2e`)
docs/                     — Generated docs (openapi, postman, platforms, env, api-reference)
                            + hand-written architecture diagrams
scripts/                  — Release + CI checks
```

| Vertical | Adapter interface | Reference adapter | Adapter count |
|----------|------------------|-------------------|---------------|
| Accounting | `AccountingAdapter` | `fortnox/` | 281 |
| CRM | `CrmAdapter` | `nutshell/` | 152 |
| Ecommerce | `EcommerceAdapter` | `shopify/` | 176 |
| Logistics | `LogisticsAdapter` | `easypost/` | 320 |
| Payments | `PaymentsAdapter` | `stripe/` | 159 |
| Docsign | `DocsignAdapter` | `docusign/` | 116 |
| Projects | `ProjectsAdapter` | `asana/` | 116 |
| Customer Support | `CustomerSupportAdapter` | `zendesk/` | 105 |
| Inventory | `InventoryAdapter` | `cin7-core/` | 123 |

All **1,548 platforms** are covered across these 9 verticals. No platform logos are committed: `docs/platforms/logos/` is gitignored, and the catalog renders monogram tiles unless an operator chooses a logo source. See [platform logos](./docs/operations/platform-logos.md).

---

## 3. Adding a new adapter

Add adapters under `apps/integration-server/src/verticals/<vertical>/adapters/<slug>/`. Use the reference adapter for the vertical as a starting template (`cp -r` and rename).

> **First time?** Read [`docs/architecture/adapter-walkthrough.md`](./docs/architecture/adapter-walkthrough.md) first — it walks the Fortnox adapter file-by-file with the rationale behind each pattern. The steps below are the canonical checklist; the walkthrough is the worked example you can copy from.

### 3.1 Create the adapter directory

```
apps/integration-server/src/verticals/<vertical>/adapters/<slug>/
  index.ts        # Adapter class (implements <Vertical>Adapter)
  auth.ts         # OAuth / API-key auth implementation
  client.ts       # HTTP client (axios wrapper)
  constants.ts    # Base URL, scopes, endpoint paths
  transform/      # One file per resource type
  webhook.ts      # Optional — exports a WebhookHandler if the platform supports webhooks
```

### 3.2 Implement the adapter interface

```typescript
// apps/integration-server/src/verticals/accounting/adapters/<slug>/index.ts
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'

export class MyAdapter implements AccountingAdapter {
  readonly platform = '<slug>'
  readonly version = '1'

  // Auth (required)
  getAuthUrl(state: string): string { ... }
  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> { ... }
  async refreshCredentials(creds: Credentials): Promise<Credentials> { ... }

  // Resources (all optional — return 501 automatically if omitted)
  async listInvoices(creds: Credentials, params: QueryParams) { ... }
  // ...
}
```

All resource methods are optional. Unimplemented methods return `501 Not Implemented` automatically — you do not need to add any fallback.

### 3.3 Register in the vertical's factory map

Add an entry to `apps/integration-server/src/verticals/<vertical>/adapter/factories.ts`:

```typescript
import { MyAdapter } from '../adapters/<slug>'

export const ADAPTER_FACTORIES: Record<string, AdapterFactory<AccountingAdapter>> = {
  // ...existing entries
  '<slug>': (config) => new MyAdapter(config as MyAdapterConfig),
}
```

### 3.4 Add platform metadata

Add an entry to `apps/integration-server/src/verticals/<vertical>/platforms/metadata.ts`. Every field on `PlatformMetadata` is required unless the interface marks it optional — `slug`, `name`, `description`, `website`, `category`, `primary_color`, `auth_type`, `hq_country`, `docs_url`, `pricing_url`, `founded_year` — so an incomplete entry fails typecheck. The optional ones vary slightly by vertical but always include `recommendedScopes` and `readScopes` (must be a subset of the former; see `pnpm check:read-scopes`); six of the nine verticals also declare `supportsScopeOverride` (projects, customer-support and inventory do not). The OpenAPI generator, `docs/platforms/platforms.md` and the admin platform picker all pull from this list.

### 3.5 Wire webhook handler (optional)

If the platform supports webhooks and you wrote a `webhook.ts`, add it to `apps/integration-server/src/verticals/<vertical>/webhooks.ts`:

```typescript
import { myPlatformWebhook } from './adapters/<slug>/webhook'

export const WEBHOOK_HANDLERS: Record<string, WebhookHandler> = {
  // ...existing entries
  '<slug>': myPlatformWebhook,
}
```

Inbound webhooks then hit `POST /webhooks/<vertical>/<slug>`.

### 3.6 Enable + configure the adapter at runtime

Either via the admin UI (`/platforms/<vertical>/<slug>`), or against integration-server directly: `POST /admin/platforms/<vertical>/<slug>/enable`, then `PUT /admin/platforms/<vertical>/<slug>/config` with the credentials (a merge — omitted keys keep their stored value). Both are `X-Admin-Secret`-gated.

---

## 4. Writing transforms

Transforms are **pure functions** — no side effects, no API calls.

```typescript
// apps/integration-server/src/verticals/accounting/adapters/<slug>/transform/invoice.ts
import type { Invoice } from '../../../schema/invoice'
import { toIsoDatetime, toSlug } from '@opensteward/shared'

export function transformInvoice(raw: MyPlatformInvoice): Invoice {
  return {
    id: String(raw.Id),
    invoiceNumber: raw.InvoiceNumber,
    currency: raw.Currency ?? undefined,
    totalAmount: parseDecimal(raw.TotalAmount),
    createdAt: toIsoDatetime(raw.CreatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
```

### Shared helpers (`@opensteward/shared`)

| Helper | Purpose |
|--------|---------|
| `toIsoDatetime(input)` | Coerce strings / numbers / Dates into a strict ISO 8601 string with `.000Z`, or undefined |
| `toSlug(input)` | URL-safe slug — lowercase, hyphen-separated, alphanumerics only |
| `Iso4217Currency`, `Iso3166Alpha2` | Zod schemas for currency / country codes |
| `verifyHmacSha256` | HMAC verification helper for webhooks |

### Rules

- Every canonical object **must** set `metadata: raw as Record<string, unknown>`. Never filter or modify the raw object.
- Use `snake_case` in JSON wire format, `camelCase` in TypeScript.
- Datetime fields must be strict ISO strings — wrap raw inputs with `toIsoDatetime()` to normalise.
- Never throw from a transform — return `undefined` for missing optional fields.

---

## 5. Adding webhook support

Create `apps/integration-server/src/verticals/<vertical>/adapters/<slug>/webhook.ts` exporting a `WebhookHandler`:

```typescript
import type { WebhookHandler } from '@opensteward/shared'
import { verifyHmacSha256 } from '@opensteward/shared'

export const myPlatformWebhook: WebhookHandler = {
  verifyWebhook(payload, headers, secret) {
    const sig = headers['x-my-platform-signature'] ?? ''
    return verifyHmacSha256(payload, secret, sig, 'hex')
  },
  parseWebhookEvents(payload) {
    return [{
      platform: '<slug>',
      type: 'invoice.created',
      resourceType: 'invoice',
      action: 'created',
      resourceId: String((payload as { entityId: string }).entityId),
      payload,
    }]
  },
}
```

Wire it into `webhooks.ts` (Step 3.5). Configure the signing secret via `webhooks.adapters.<vertical>.<slug>.secret` in `apps/integration-server/config/config.yml`.

| Platform auth style | Verification helper |
|---------------------|---------------------|
| HMAC-SHA256 (base64) | `verifyHmacSha256(payload, secret, sig, 'base64')` |
| HMAC-SHA256 (hex) | `verifyHmacSha256(payload, secret, sig, 'hex')` |
| Bearer / shared token | `crypto.timingSafeEqual(...)` (always use timing-safe comparison for secrets) |

---

## 6. Writing tests

> For the big picture — the three test layers (transform unit · journey regression · CI guards), what each is for, and how CI runs them — see [docs/architecture/testing.md](./docs/architecture/testing.md). This section is the how-to for the most common case: a transform unit test.

Each transform file must have a corresponding test file:

```
apps/integration-server/tests/verticals/<vertical>/unit/adapters/<slug>/transform/<resource>.test.ts
```

Use a factory that returns a **complete** raw platform object, then assert each canonical field and verify that `metadata` is the unmodified raw object.

```typescript
import { describe, it, expect } from 'vitest'
import { transformInvoice } from '../../../../../../../src/verticals/accounting/adapters/<slug>/transform/invoice'

function makeInvoice(overrides = {}) {
  return { Id: 42, InvoiceNumber: 'INV-001', Currency: 'SEK', ...overrides }
}

describe('transformInvoice', () => {
  it('maps canonical fields', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('42')
    expect(result.invoiceNumber).toBe('INV-001')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeInvoice({ Currency: undefined })
    expect(transformInvoice(raw).currency).toBeUndefined()
  })
})
```

```bash
pnpm --filter integration-server test                 # all unit tests
pnpm --filter integration-server test <slug>          # filter by name
```

### Integration tests (opt-in)

Live-API integration suites live under `apps/integration-server/tests/integration/`:

- `multi-vertical.test.ts` — exercises the unified server with a real Fastify instance, tests connection lifecycle, adapter enable/disable, bexio cross-vertical isolation, etc. Always runs.
- `data-store-modes.test.ts` — end-to-end wiring of the three `DATA_STORE_MODE` values (`database` / `passthrough` / `external`). Always runs.
- `openapi-server-variables.test.ts` — `GET /openapi/server-variables` resolution order. Always runs.
- `sdk-wire.test.ts` — drives the generated SDK's URLs through the real router (`fetch` redirected into `fastify.inject`). Resolves the *built* `@opensteward/sdk` entry, so build it first — and rebuild after editing `packages/sdk/src`. Always runs.
- `spec-routes.test.ts` — every operation in `docs/openapi/openapi.json` must be a mounted route (with an exact-set `KNOWN_GAPS` allowlist). Always runs.
- `auth-connect-post.test.ts` — headless `POST /auth/{vertical}/{platform}/connect` for static-credential adapters: admin gate, field contract, credential round-trip. Always runs.
- `fortnox/` — live Fortnox sandbox tests. Skipped unless you drop a `.tokens.json` next to `setup.ts` (see the file header for the format).
- `easypost.test.ts` — live EasyPost test-mode API. Skipped unless `EASYPOST_TEST_API_KEY` is set.

### Postgres-backed tests (`pnpm test:pg`)

Every store runs on SQLite by default and on Postgres when `DATABASE_URL` is set. `pnpm test` only exercises SQLite: the Postgres leg of each dual-backend suite runs only when `TEST_DATABASE_URL` is set. `pnpm test:pg` sets it for you — it starts a throwaway `postgres:16-alpine` container (unique name, `127.0.0.1` on a free port, `--rm`, data on a tmpfs so no volume is ever created), waits for it, runs every Postgres-capable suite against it, and removes it (`docker rm -f -v`) on every exit path, Ctrl-C included:

- `@opensteward/shared`, `@opensteward/destinations`, `admin-api` and `webhook-gateway` through `turbo run test --concurrency=1` — the suites reset Postgres per file on one shared database, so two workspaces must never run at once;
- integration-server's files that read `TEST_DATABASE_URL` (found by grep — today SQL access and metrics), never its full adapter suite.

```bash
pnpm test:pg                              # every suite (~2 min)
pnpm test:pg admin-api shared             # only these (shared, destinations, admin-api, webhook-gateway, integration-server)
pnpm test:pg admin-api -- admin-store     # anything after -- goes to vitest
TEST_PG_KEEP=1 pnpm test:pg admin-api     # leave the container up; prints TEST_DATABASE_URL and how to remove it
```

CI's `test-postgres` job runs the same script against its service container (`TEST_PG_URL`), so a green `pnpm test:pg` locally is the same check. It needs Docker and nothing else; it touches no other container or volume. `TEST_PG_URL` points it at an existing Postgres instead — the suites **drop its `public` schema**, so it refuses a database named `opensteward` or one whose `public._schema_migrations` has rows unless `TEST_PG_FORCE=1`.

### E2E browser tests (Playwright, opt-in)

The `e2e/` workspace (`@opensteward/e2e`) runs Playwright journeys against an **already-running** stack — it starts nothing, and every spec skips if nothing is listening. Run it with `pnpm run test:e2e` from the repo root. Three tiers:

- **Tier 1 — zero config**: public-surface journeys (connect pages, health, docs portal). Only needs a running stack.
- **Tier 2 — admin login**: gated on `OS_E2E_ADMIN_USER` / `OS_E2E_ADMIN_PASSWORD` (falls back to the root `.env`'s `ADMIN_USER` / `ADMIN_USER_PASSWORD`).
- **Tier 3 — platform credentials**: the real OAuth click-through — no specs ship at this tier.

The script is deliberately `test:e2e`, not `test`, so `pnpm -r test` never drives a browser — which is also why the ~110k count above excludes it. See [`e2e/README.md`](./e2e/README.md).

### Adapter verification

The catalog ships 1,548 adapters. Nearly all of them were scaffolded and have never been run against the API they claim to speak to. Presenting them identically over-claims, so each platform may declare how far it has actually been taken:

| Tier | What it means |
|---|---|
| *(field absent)* | Scaffolded. Generated, never exercised. Where almost the whole catalog sits. |
| `unit-tested` | Transform and factory tests exist and pass. |
| `verified` | **Our adapter** was driven against the platform's real API: its sandbox or test mode, or a live tenant. |

A sandbox and a live tenant count the same, because a platform's sandbox serves the same API as its production. Say which one you used in the evidence. (Until November 2026 these were two tiers, `sandbox-verified` and `production-verified`.)

The emphasis on *our adapter* is the whole distinction. Calling a vendor's API by hand — with curl, Postman, or their own MCP server — proves the **vendor's** API works. It says nothing about this repo's auth, client, or transforms. Only a call that went through the adapter earns a rung above `unit-tested`.

Two files move together, and `pnpm check:adapter-verification` fails if they disagree:

1. **The tier** goes on the platform entry in `src/verticals/<vertical>/platforms/metadata.ts` as `verification: '<tier>'`. This is what reaches `platforms.json`, the admin picker chip and the docs table.
2. **The evidence** goes in [`scripts/adapter-verification-audit.json`](./scripts/adapter-verification-audit.json), keyed `vertical/slug`, carrying `tier`, `verifiedAt` (the date the run happened), `verifiedBy` and an `evidence` string that says what was actually run. Same split `readScopes` has with `read-scopes-audit.json`: the shipped value in metadata, the provenance in a ledger.

Then regenerate. The generator rewrites `platforms.md`, `platforms.json` and the README's count of verified adapters, so nothing is updated by hand:

```bash
pnpm --filter integration-server run generate:platforms-doc
pnpm check:adapter-verification
```

`verifiedAt` is load-bearing, and it is **the date the evidence was produced** — the day the sync job ran, not the day you wrote the entry up. The guard compares it against the adapter directory's last commit and warns when the code has moved on, because a verification badge on an adapter rewritten since is worse than no badge. Re-verify and bump the date rather than editing the date alone.

Using the write-up date instead quietly defeats the check. Run a sync on the 10th, let the adapter change on the 15th, record it on the 16th, and a write-up date hides that intervening commit — the warning never fires and the badge is already stale on the day it lands. If the two dates differ, the run's date goes in `verifiedAt`; mention the write-up date in `evidence` if it matters.

Lowering a tier needs no ceremony — if a claim no longer holds, drop it. An absent field is always a safe, honest state.

---

## 7. Updating generated files

After changing **Zod schemas** or **platform metadata**:

```bash
pnpm run docs:all
```

This regenerates:
- `docs/openapi/openapi.{json,yaml}` — unified OpenAPI spec
- `docs/openapi/admin-api.openapi.json` — the operator-API spec
- `docs/api-reference/api-reference.md` — markdown Unified API reference
- `docs/postman/openapi.postman_collection.json` + 2 environments
- `docs/platforms/platforms.md` — platform catalog
- `docs/environment/environment-variables.md` — env-var documentation
- `.env.example` — the file operators copy to create `.env`
- `docs/operations/cli.md` — the `os` CLI reference
- `packages/sdk/src/generated/**` and `packages/cli/src/generated/**` — SDK types
  and CLI subcommands, derived from the two specs above
- `apps/admin-api/src/core/routes/_runtime-settings-schema.generated.ts`

**Never hand-edit any of those.** Edit the source they are generated from
(a Zod schema, a route definition, `platforms/metadata.ts`) and re-run
`pnpm run docs:all`.

CI runs `pnpm run check:docs` to fail any PR that has stale generated docs.

Commit all generated files with your changes.

---

## 8. Pull request checklist

Before opening a PR:

- [ ] `pnpm -r run typecheck` passes with no errors
- [ ] `pnpm -r run lint` passes with no errors
- [ ] `pnpm -r test` passes with no failures
- [ ] `pnpm run check:docs` passes (generated docs match committed copies)
- [ ] All transforms set `metadata: raw as Record<string, unknown>`
- [ ] Platform metadata entry added for new adapters (with logo if appropriate)
- [ ] Test factory covers at least: happy path, `metadata` passthrough, missing optional fields

### Static guards CI runs

These are cheap, read-only checks that fail the build on drift Vitest cannot
see. Run the one that covers what you touched — most have a `:soft` variant
that reports instead of failing (`check:guides` and `check:openapi-examples`
do not).

| Gate | Fails when |
|------|-----------|
| `pnpm check:adapter-parity` | a slug in `platforms/metadata.ts` has no constructor in that vertical's `adapter/factories.ts` (the list-but-can't-connect state) |
| `pnpm check:transform-tests` | a new adapter ships a transform with no matching test, or a baselined one loses its test |
| `pnpm check:transform-schema-assertions` | a transform test never parses its output against the canonical schema |
| `pnpm check:adapter-declarations` | an adapter's `adapters/<slug>/metadata.ts` lists a resource under `unavailableResources` while its `index.ts` defines an interface method for it (declared available but unimplemented is backlog, reported not failed; `--report` lists it). Not the `platforms/metadata.ts` that `check:adapter-parity` reads. Only evaluates adapters that have a `metadata.ts` — 737 of 1,548 do not and are ratcheted separately in `adapter-metadata-missing-baseline.json`; a new adapter without one fails the gate |
| `pnpm check:clone-signatures` | a non-reference adapter's `index.ts`/`client.ts`/`constants.ts` still calls a reference adapter's vendor-specific path — Asana's `/tasks/{id}/stories`, Zendesk's `/tickets.json`, Cin7 Core's `/productList`, etc. (it was scaffolded from the reference adapter and never pointed at its own vendor's real API). Reference adapters excluded; payments' `/charges` is a sweep, reported under `--report` only, never a failure |
| `pnpm check:field-classification` | a listable resource type (`sync/listable-resources.ts`) has no entry in its vertical's `schema/classification.ts`, a classified path names a field the schema lacks, or a top-level field named like personal data (`email`, `phone`, `first_name`, `address`, `iban`, `tax_id`, `birth…`, `ssn`) is left `public`/`internal` without an `ALLOWLIST` entry — see [data classification](docs/security/data-classification.md) |
| `pnpm check:route-access` | an admin-api route has no authentication guard (JWT, service secret or SCIM token) and is not on the reasoned `PUBLIC_ROUTES` allow-list in `apps/admin-api/tests/unit/route-access.test.ts`; a data-access route (data, dashboards, destinations, SQL access, Superset, roles) checks no permission or not its documented one; or a fail-closed `SCOPE_RESTRICTED` route omits its `403` from OpenAPI. Guard with `fastify.authenticate` plus `requirePermission(...)` — both are recognised whether attached per route or with `addHook` |
| `pnpm check:paging-contract` | a list method newly ignores `page` (page 2 repeats page 1), starts page 1 one page in, moves its position by neither 1 nor the limit, answers page 2 empty after asking for only one page, asks for more than the caller's limit, or sends a page size that does not follow the caller's limit — measured by running every adapter's `list*` methods against a request recorder (needs a built `@opensteward/shared`). A fifth call at the router's ceiling (`limit=500`) fails a method that newly sends fewer rows than the router asks it for (`<method> serves <n> of <asked>`): declare `capabilities.maxPageSize`, or report the smaller size with `reportUpstreamPage(params, { pageSize })`. Also fails when a baselined method stops failing, until `--update` banks it, and when a method the gate could measure becomes unmeasurable; three strict baselines (failing, unmeasured, and the ceiling clamps). On an adapter that declares `capabilities.maxPageSize` it fails a `fixed-size`, `page1-skips`, `page-stride`, `first-page-only` or `over-asks` method even when baselined — the sync takes a page shorter than that maximum as the end of the collection, so there is nothing to bank; an unpaged method there that still sends a constant size (`per_page=25` beside a constant `page=1`) fails as `fixed-size` too. There are two ways past it, each listed with its evidence: `DECLARED_MAX_ALLOWLIST` in the script, one method per entry with its reason, and a `local-page` verdict (below). **A new adapter scaffolded from its vertical's reference adapter inherits that adapter's paging verdicts under its own slug and fails its first run** (most reference adapters carry some): fix the new adapter's paging, and bank with `--update` only as a last resort. `--soft` still fails when the harness itself is broken (a request escaped the recorder, too little was measured); a list the platform cannot serve that throws `statusCode: 501, code: 'NOT_SUPPORTED'` before sending anything, on every probe call, passes as `refused` and is left out of that coverage share. `--only=<vertical>/<slug> --json=<path>` shows the exact requests. A list whose upstream page is not the caller's page (a fixed batch, rows flattened out of parents, an unpaginated endpoint) pages through `pageByRows` or `pageLocally` from `@opensteward/shared`, which report `pagedLocally` and pass as `local-page` (never a declared-max violation). A hand-rolled window may report it too only when its tests prove it serves every row once, and is then listed in `LOCAL_PAGE_REPORTERS` in the script with that test (a full sweep fails on an unlisted one); a window that pages at less than `limit` reports that `pageSize` as well — see [adapter-walkthrough § pageByRows and pageLocally](docs/architecture/adapter-walkthrough.md#when-one-upstream-page-is-not-one-caller-page--pagebyrows-and-pagelocally) |
| `pnpm check:webhook-verifiers` | an adapter ships a `webhook.ts` that its vertical's `WEBHOOK_HANDLERS` map never imports |
| `pnpm check:read-scopes` | a `readScopes` entry names a scope recorded as non-existent in `scripts/read-scopes-audit.json` (the per-platform provider-doc verdicts `scripts/check-read-scopes.ts` validates against), sits outside that platform's `recommendedScopes` catalogue, or sits on a platform with no read-only mode |
| `pnpm check:adapter-verification` | a platform declares a `verification` tier with no entry in `scripts/adapter-verification-audit.json` (or vice versa), the two disagree, an audit entry is missing `verifiedAt`/`verifiedBy`/`evidence`, or the README tally is stale. Warns — never fails — when the adapter has commits newer than its `verifiedAt`, which is how a badge that has quietly stopped being true gets noticed |
| `pnpm check:secret-passthrough` | a secret `scripts/generate-secrets.sh` mints never reaches the service that reads it |
| `pnpm check:server-logging` | a service builds a Fastify instance outside `buildLoggerConfig`, and so outside `LOG_REDACT_PATHS` |
| `pnpm check:guides` | a `docs/integrate/` guide has bad frontmatter, an unresolvable platform slug, a missing required H2, or a screenshot that isn't on disk |
| `pnpm check:openapi-examples` | a leaf component property in either generated spec carries no `example` |
| `pnpm check:warning-gates <gate>` | the ratcheted counts for `typecheck-tests`, `lint` or `prettier` go up (or down without `--update`) |

---

## 9. Shared package (`@opensteward/shared`)

Cross-cutting primitives live in `packages/shared/` and are published as `@opensteward/shared` within the monorepo. The package provides:

| Module | What it provides |
|--------|-----------------|
| `auth/store` | `CredentialStore` — AES-256-GCM encrypted credential storage over either backend (better-sqlite3 or Postgres via Kysely) |
| `auth/oauth` | OAuth state helpers (`generateState`, `storePendingState`, `consumePendingState`, `isTokenExpired`) |
| `adapter/{registry,settings-store,unified-registry}` | `AdapterRegistry` keyed by `(vertical, slug)`; the unified facade composes per-vertical registries |
| `control-plane/*` | Shared Fastify routers — auth, connections, health, platforms, admin-adapters, webhooks |
| `schemas/{iso,connection,…}` | Shared Zod primitives + canonical schemas |
| `circuit-breaker` | Per-connection circuit breaker (closed / open / half-open) |
| `webhook` | HMAC-SHA256 verification + helpers |
| `server/create-server` | `createBaseServer()` factory with security headers, CORS, rate limiting; `buildLoggerConfig()` + `LOG_REDACT_PATHS`, which every service must log through |

### When to add to shared

Move code to `@opensteward/shared` when **two or more verticals or apps** need the same logic. Don't pre-emptively extract — wait until the second consumer emerges. After adding to shared, rebuild it (`pnpm --filter "@opensteward/shared..." run build`) before running consumers.

---

## 10. Code style

- **TypeScript strict mode** — no `any`, no implicit returns
- **snake_case** in JSON, **camelCase** in TypeScript
- Keep transforms as flat, readable functions — avoid helper classes
- No side effects or API calls inside transforms
- Format with Prettier (`pnpm --filter <name> run format`) before committing
- ESLint rules are enforced in CI — fix all warnings, not just errors

### Two TypeScript compilers, on purpose

`tsc` and `tsc6` are both real and both current. Do not collapse them into one
dependency.

- **`tsc` is TypeScript 7** — the native Go port, aliased in every
  `package.json` as `"@typescript/native": "npm:typescript@^7.0.2"`. Every
  workspace's `build` and `typecheck` script runs it. It is roughly 5x faster
  than 6 on this repo and reports the same diagnostics.
- **`tsc6` is TypeScript 6** — aliased as
  `"typescript": "npm:@typescript/typescript6@^6.0.2"`, so the *name*
  `typescript` deliberately resolves to the 6.x package. TypeScript 7.0 ships
  no programmatic JS API (promised for 7.1), and three things here need one:
  `typescript-eslint` (peer range `<6.1.0`), `openapi-typescript` (drives the
  SDK/CLI codegen behind `docs:all` and therefore `check:docs`), and
  `scripts/backfill-schema-assertions.ts`.

Revisit when 7.1 ships the API and those three adopt it.

---

## 11. Docker build resources and tuning

`docker compose build --no-cache` of the whole stack is the heaviest thing this
repo asks of a machine. The numbers below were measured on a Docker Desktop VM
with **4 vCPU / 7.75 GiB**, sampling `/proc/stat` and `/proc/meminfo` inside the
VM every 2s across a full `build --no-cache` + `up -d --force-recreate`.

"Peak" is the VM-wide high-water mark of `MemTotal - MemAvailable`. "Marginal"
subtracts the idle baseline measured immediately before each run, and is the
figure to size against — the absolute number moves with whatever else is
running and with accumulated page cache.

### Pick a profile

Two setups, both measured end to end. Choose one when you set the project up;
you can change it later from Docker Desktop → Settings → Resources.

#### Lean — 3 vCPU, 4 GiB

For laptops, or when Docker is sharing the machine with everything else.
Verified: the full `build --no-cache` of all six images completes in **65s**
with a **3.13 GiB** peak against 3.83 GiB usable — about 0.7 GiB spare. Nothing
to configure; the default parallel build is the right one at this size.

#### Fast — 4+ vCPU, 8 GiB

For a workstation, or when you rebuild often. The build is CPU-bound in every
configuration measured — it saturated every core at 3 and at 4 vCPU — so
**vCPU is the lever for speed**. Give it as many cores as you can spare.

**Memory past ~6 GiB buys nothing.** The build's working set is roughly 1-2 GiB
above whatever the VM already holds, and it does not grow with the allocation —
giving it more RAM produces a higher peak, not a bigger build. Extra memory only
becomes reclaimable page cache. Spend the budget on cores, and on headroom for
whatever else you run beside the stack.

### What it costs, measured

| VM setting | usable | build mode | build | peak | marginal | headroom |
|---|---|---|---|---|---|---|
| 4 vCPU / 8 GiB | 7.75 GiB | parallel | 76s | 4.88 GiB | 2.03 | 2.87 GiB |
| 4 vCPU / 8 GiB | 7.75 GiB | `COMPOSE_PARALLEL_LIMIT=1` | 88s | 4.44 | 1.86 | 3.31 |
| 3 vCPU / 5 GiB | 4.80 GiB | parallel | 70s | 3.49 | 1.62 | 1.31 |
| 3 vCPU / 5 GiB | 4.80 GiB | `COMPOSE_PARALLEL_LIMIT=1` | 60s | 3.03 | ~1.5 | 1.77 |
| **3 vCPU / 4 GiB** | 3.83 GiB | **parallel** | **65s** | **3.13** | 1.61 | 0.70 |
| 3 vCPU / 4 GiB | 3.83 GiB | `COMPOSE_PARALLEL_LIMIT=1` | 76s | 3.15 | 1.47 | 0.68 |
| 3 vCPU / 4 GiB | 3.83 GiB | parallel (repeat) | 75s | 3.06 | 0.94 | 0.77 |

Deploy (`up -d --force-recreate`) held at 63-65s in every run and is excluded.
Every run had the compose stack **running** during the build, worth roughly
1 GiB of container RSS in the baseline; building with the stack down lands
lower. Before the integration-server typecheck was split into project
references, the 4 vCPU parallel build peaked at **5.44 GiB** with a **4.04 GiB**
marginal cost.

**Size against the marginal column, not the peak.** The peak falls as you give
the VM less memory — 4.88 → 3.49 → 3.13 GiB across the three sizes — because
there is less room for reclaimable page cache, not because the build got
smaller. Across seven runs the marginal cost ranged **0.94-2.03 GiB**, with no
trend against the allocation — the spread reflects how much the baseline
happened to be holding when each run started, not a change in the build. Use
the range, not a point estimate: an earlier draft of this section quoted
"1.5-1.6 GiB" from the middle of that cluster, which reads far more precise than
the data supports. An earlier draft also sized off the peak and wrongly
concluded the parallel build would not fit in 5 GiB.

**Do not read the build column across VM sizes.** The 3 vCPU rows came in
*faster* than the 4 vCPU ones despite saturating every core, because those runs
followed a Docker restart with a cold page cache and a fresh daemon, and because
the `pnpm install` steps are registry-bound and vary by tens of seconds between
runs. Timing comparisons are only meaningful within one VM size, back to back.

### Serializing the build

```bash
COMPOSE_PARALLEL_LIMIT=1 docker compose build --no-cache
```

**Neither profile above needs this.** It is worth knowing about in exactly one
situation: a VM around 5-6 GiB, where it lowered the peak from 3.49 to 3.03 GiB
for 12 extra seconds — or a CI runner with a hard memory cap. At 4 GiB the two
modes are indistinguishable on both axes: peaks of 3.13 and 3.06 GiB parallel
against 3.15 serialized, and builds of 65s and 75s parallel against 76s
serialized. Two parallel samples span 10s, which is wider than the gap between
the modes, so neither is measurably faster — pick either. At 8 GiB the peak is
not a constraint.

Building one service per invocation serializes harder and reached the lowest
peak measured, 3.79 GiB at 4 vCPU / 8 GiB — but each invocation is its own
BuildKit session, so the shared dependency-install stage is not reused across
them and five installs run instead of one, which is most of why it took 171s:

```bash
for svc in sso-dev-idp webhook-gateway docs-server admin admin-api integration-server; do
  docker compose --profile sso-dev build --no-cache "$svc"
done
```

Serializing is **not** a blanket win. Before the typecheck was split, it
measured *worse* on both axes (127s / 6.05 GiB against 74s / 5.44 GiB) — each
image still carried a 4.1 GB compile, so lengthening the build changed nothing
about the peak. It only pays once the per-image footprint is small.

### Hard floors

- **4 GiB is the tested floor.** It works, with ~0.7 GiB spare. The true floor
  is probably lower now that the compile needs ~850 MB rather than 4.1 GB, but
  it has not been measured and 0.7 GiB is already thin.
- **Do not cut below 3 vCPU.** CPU starvation *raises* peak memory: `--cpus=1`
  produced the highest compile RSS of any configuration tried (4,420 MB) and
  tripled the wall clock, because the Go GC needs CPU to keep pace with
  allocation. Reduce concurrency, never clock.
- **Shrinking the VM caps usage; it does not reduce it.** A build that no longer
  fits is OOM-killed, which surfaces as a `SIGKILL` from `tsc` and an
  `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` — not as an out-of-memory message.

### Why integration-server compiles the way it does

`Dockerfile` builds it with `tsc -b --builders 1 --singleThreaded` under
`GOGC=10`, and the comment block there carries the full measurement table. The
short version, as peak RSS of the `tsc` process:

| | peak RSS |
|---|---|
| one 18,645-file program (what it used to be) | ~4,142 MB |
| per-vertical project references, `tsc -b --builders 1` | ~1,266 MB |
| …plus `--singleThreaded GOGC=10` | **852 MB** |
| plain `tsc -b` (projects built concurrently) | 4,401 MB — **worse than not splitting** |

`--builders 1` is load-bearing. `tsc` is the native Go binary, so `GOGC` and
`GOMEMLIMIT` apply and `NODE_OPTIONS` does nothing.

Starving the build of CPU is counterproductive: `--cpus=1` measured *higher*
peak RSS (4,420 MB) and 3x the wall clock, because the Go GC needs CPU to keep
up with allocation. Reduce concurrency, not clock.

### Things that look like wins and are not

- **`pnpm -r run build`** ignores Turbo's `^build` graph and starts apps before
  their workspace dependencies finish. Use `pnpm run build`.
- **Deduplicating the five `pnpm install` runs** (they share one stage now)
  removed 88% of install *work* and did not reduce peak memory — it removed the
  stagger that had been keeping the five compile phases from overlapping. Keep
  it for the cache behaviour, not for memory.
- **Shrinking the Docker VM** caps usage, it does not reduce it. A build that
  does not fit gets OOM-killed, which surfaces as a `SIGKILL` from `tsc`.

### Reproducing these measurements

Sample the VM, not the host — on macOS the host process RSS does not reflect
what is happening inside the Docker VM:

```bash
docker run --rm --privileged --pid=host alpine:3.22 sh -c \
  'while :; do date +%s; head -1 /proc/stat; grep -E "^(MemTotal|MemAvailable):" /proc/meminfo; sleep 2; done'
```

For a single process, `VmHWM` in `/proc/<pid>/status` gives exact peak RSS, and
`/sys/fs/cgroup/memory.peak` gives it per container.
