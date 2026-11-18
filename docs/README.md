# Documentation

Generated reference for the unified `integration-server` API plus
hand-maintained architecture diagrams. The nine verticals (accounting,
crm, ecommerce, logistics, payments, docsign, projects, customer-support,
inventory) live behind one spec — every doc artifact covers the full surface.

> Deploying to Kubernetes? See the root README's
> [cloud section](../README.md#deploy-to-your-cloud-kubernetes) and the chart guide
> at [`deploy/helm/opensteward/README.md`](../deploy/helm/opensteward/README.md)
> (per-cloud overlays, reference IaC, and marketplace artifacts all live under `deploy/`).

## Structure

```
docs/
  admin/           — the admin console guide, page by page
  openapi/         — unified OpenAPI 3.1 spec (json + yaml)
  platforms/       — flat catalog of every platform across every vertical
  postman/         — Postman collections (unified + admin-api) + local/production/sandbox environments
  environment/     — env var documentation
  api-reference/   — markdown Unified API reference rendered from the spec
  architecture/    — hand-maintained mermaid diagrams (services, flows, …)
  security/        — threat model, hardening guide, and operator checklist
  deployment/      — custom-domain + TLS recipes, SSO and OAuth setup, Postgres analytics,
                     Superset, backup/restore, upgrading, key rotation
  integrate/       — per-platform integration walkthroughs
  operations/      — generated CLI reference + hand-maintained ops runbooks
  sdk/             — @opensteward/sdk getting-started guide
  business-cases/  — regulatory / commercial framing
  assets/          — screenshots and images referenced from the guides
```

Top-level pages: [`dev-api.md`](./dev-api.md) (the Developer Guide),
[`mcp.md`](./mcp.md) (AI agents), [`why-opensteward.md`](./why-opensteward.md),
and [`GLOSSARY.md`](./GLOSSARY.md) (canonical term definitions).

## Files

| Type | File |
|------|------|
| **Admin console guide** | [admin/README.md](./admin/README.md) — every page of the admin console: who can use it, what it does, with screenshots |
| **OpenAPI spec** | [openapi.json](./openapi/openapi.json), [openapi.yaml](./openapi/openapi.yaml) |
| **Platforms catalog** | [platforms.md](./platforms/platforms.md) |
| **Postman** | [collection](./postman/openapi.postman_collection.json), [local env](./postman/openapi-local.postman_environment.json), [prod env](./postman/openapi-production.postman_environment.json), [sandbox env](./postman/openapi-test.postman_environment.json) |
| **Environment vars** | [environment-variables.md](./environment/environment-variables.md) |
| **Unified API** | [api-reference.md](./api-reference/api-reference.md) |
| **Architecture diagrams** | [architecture/README.md](./architecture/README.md) |
| **Security guide** | [security/README.md](./security/README.md) |
| **Data classification & masking** | [security/data-classification.md](./security/data-classification.md) — field classes, masks, and the `check:field-classification` guard |
| **Data viewer & dashboards** | [architecture/data-access.md](./architecture/data-access.md) — browsing, reveal, export and native dashboards; the scope header and trust boundaries |
| **Permissions, roles & tenant scope** | [architecture/permissions-and-roles.md](./architecture/permissions-and-roles.md) — the permission catalog, custom roles, per-user and IdP-driven tenant scope, escalation guards |
| **Destinations (warehouse / lake exports)** | [integrate/destinations.md](./integrate/destinations.md) — Parquet on S3/GCS/Azure, Postgres, Snowflake, BigQuery, Databricks; masking, tombstones, at-least-once delivery |
| **Read-only SQL access (BI tools)** | [integrate/sql-access.md](./integrate/sql-access.md) — views, columns, masking, scope; setup in [deployment/postgres-analytics.md](./deployment/postgres-analytics.md) |
| **Embedded Superset dashboards** | [deployment/superset.md](./deployment/superset.md) — optional, Postgres only: guest tokens with tenant row-level security over the masked views; compose `analytics` profile and Helm |
| **CLI reference** | [operations/cli.md](./operations/cli.md) |
| **Rehearsing admin SSO locally** | [operations/sso-testing.md](./operations/sso-testing.md) — mock IdP, compose bridge, personas |
| **Local HTTPS for OAuth callbacks** | [operations/local-https.md](./operations/local-https.md) — Caddy `https` profile for providers that refuse `http://` redirect URIs |
| **SSO setup (admin console)** | [deployment/sso-setup.md](./deployment/sso-setup.md) |
| **OIDC setup (developer API)** | [deployment/oauth-clients-setup.md](./deployment/oauth-clients-setup.md) |
| **Data-erasure runbook (right to be forgotten)** | [operations/data-erasure.md](./operations/data-erasure.md) |
| **Switching the stack between SQLite and Postgres (with its data)** | [operations/switching-databases.md](./operations/switching-databases.md) — `scripts/switch-db.sh` and the per-service `db-copy` tool |
| **Custom domain + TLS** | [deployment/custom-domain.md](./deployment/custom-domain.md) — branded hosts for Connect Links and the API, TLS at your proxy, private internal services |
| **Backup + restore** | [deployment/backup-restore.md](./deployment/backup-restore.md) — `pnpm backup` / `pnpm restore` for the compose volumes and configuration |
| **Upgrade runbook** | [deployment/upgrading.md](./deployment/upgrading.md) — moving a compose deployment from version N to N+1 |
| **Installing and renewing your license** | [deployment/license.md](./deployment/license.md) — the signed license file, offline verification, states, community mode, renewal, Compose and Helm |
| **Rotating `STORE_SECRET`** | [deployment/key-rotation.md](./deployment/key-rotation.md) — offline re-encryption with `pnpm rotate-store-secret` |
| **Platform logos** | [operations/platform-logos.md](./operations/platform-logos.md) — why no logos ship, and the `none` / `cdn` / `local` modes |

## Regenerating

```bash
pnpm run docs:all                # regenerates every artifact above
pnpm run docs:openapi            # just the OpenAPI spec
pnpm run docs:screenshots        # admin-UI PNGs embedded in guides (needs a live stack)
pnpm run docs:screenshots:clean  # remove all (screenshot fixture)-tagged rows from the admin DB
pnpm run check:docs              # CI: regenerate then fail if any docs drifted
```

`docs:all` starts with the integration-server orchestrator
`pnpm --filter integration-server run generate:all`, which chains:

1. `generate-openapi` — walks each vertical's `buildSpec()`, merges into one document
2. `generate:api-reference` — markdown from the spec
3. `generate:postman` — Postman v2.1 collection + 3 environments (local, production, `/test/v1` sandbox)
4. `generate:platforms-doc` — flat 1548-row platform table
5. `generate:env-doc` — the services' own env vars, plus the OAuth platforms whose client credentials are adapter config (not env vars)

then runs the artifacts that live outside integration-server:

6. `runtime-settings:generate` — admin-api's `_runtime-settings-schema.generated.ts`
7. `docs:admin-api-openapi` + `docs:admin-api-postman` — admin-api's own spec and collection
8. `sdk:generate` + `cli:generate` — typed clients in `packages/sdk` and `packages/cli`
9. `docs:cli` — `operations/cli.md` from the built CLI
10. `docs:search-index` — the search index the docs site reads

`check:docs` runs the whole chain and fails when any output differs from what is committed.

`docs:screenshots` is separate (not part of `docs:all`) because it needs a
running docker stack to capture the admin UI. The runner lives at
`apps/admin/scripts/screenshots/`; specs in `specs.ts`, fake seed fixtures
in `seed.ts`. PNGs land in `docs/assets/screenshots/` (the admin console
guide's in `admin/`) and are referenced from guides with relative paths, such
as `![alt](../assets/screenshots/<name>.png)`, which render both on GitHub
and on the docs site. Seed data is
intentionally tagged `(screenshot fixture)` so it's obvious when reviewing
the admin DB later.

Fixtures **persist by default** — re-running `docs:screenshots` is a no-op
on the seed side (every step dedupes by label / tenant / email pattern),
so the dev admin UI keeps its populated pages between regens. Run
`docs:screenshots:clean` to wipe every `(screenshot fixture)`-tagged row
when you want a pristine DB. Match is conservative: label / tenant +
email-domain (`*.screenshot.example.local`), so non-fixture customers
that happen to share the tenant are untouched.

## Versioning

The OpenAPI spec's `info.version` is read from
`apps/integration-server/package.json`. Bump the version there and run
`pnpm run docs:all` to refresh the spec.

### Releasing

```bash
pnpm run release integration-server patch   # 1.0.0 → 1.0.1
pnpm run release integration-server minor   # 1.0.0 → 1.1.0
pnpm run release integration-server major   # 1.0.0 → 2.0.0
pnpm run release shared major               # 0.1.0 → 1.0.0 for @opensteward/shared
```

The release script bumps `package.json`, regenerates the docs, commits,
and creates a scoped git tag. It does NOT auto-push — review first, then:

```bash
git push origin main <scope>/v<version>
```

### Retrieving past versions

```bash
git tag -l 'integration-server/*'                                          # list all tags
git show integration-server/v1.0.0:docs/openapi/openapi.json               # view a past spec
git diff integration-server/v1.0.0..integration-server/v1.1.0 -- docs/     # diff between versions
```

### Tag convention

| Scope | Tag format | When to tag |
|-------|-----------|-------------|
| `integration-server` | `integration-server/vX.Y.Z` | Release of the unified service |
| `admin` | `admin/vX.Y.Z` | Release of admin panel |
| `admin-api` | `admin-api/vX.Y.Z` | Release of admin REST API |
| `webhook-gateway` | `webhook-gateway/vX.Y.Z` | Release of webhook receiver |
| `docs-server` | `docs-server/vX.Y.Z` | Release of Swagger UI server |
| `shared` | `shared/vX.Y.Z` | Breaking or notable change to `@opensteward/shared` |
| `design-system` | `design-system/vX.Y.Z` | Token / CSS / logo updates |
| `codegen` | `codegen/vX.Y.Z` | Changes to generation utilities |
