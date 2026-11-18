/**
 * Auto-generates docs/environment/environment-variables.md from each
 * vertical's PLATFORMS metadata. Splits platforms into OAuth (client
 * credentials set as adapter config — not env vars) and non-OAuth (key
 * supplied at connect time).
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

import { PLATFORMS as ACCOUNTING } from '../src/verticals/accounting/platforms/metadata'
import { PLATFORMS as CRM } from '../src/verticals/crm/platforms/metadata'
import { PLATFORMS as ECOMMERCE } from '../src/verticals/ecommerce/platforms/metadata'
import { PLATFORMS as LOGISTICS } from '../src/verticals/logistics/platforms/metadata'
import { PLATFORMS as DOCSIGN } from '../src/verticals/docsign/platforms/metadata'
import { PLATFORMS as PROJECTS } from '../src/verticals/projects/platforms/metadata'
import { PLATFORMS as SUPPORT } from '../src/verticals/customer-support/platforms/metadata'
import { PLATFORMS as INVENTORY } from '../src/verticals/inventory/platforms/metadata'

interface PlatformRow {
  slug: string
  name: string
  auth_type?: string
}

const SOURCES: Array<{ vertical: string; rows: readonly PlatformRow[] }> = [
  { vertical: 'accounting', rows: ACCOUNTING as unknown as PlatformRow[] },
  { vertical: 'crm', rows: CRM as unknown as PlatformRow[] },
  { vertical: 'ecommerce', rows: ECOMMERCE as unknown as PlatformRow[] },
  { vertical: 'logistics', rows: LOGISTICS as unknown as PlatformRow[] },
  { vertical: 'docsign', rows: DOCSIGN as unknown as PlatformRow[] },
  { vertical: 'projects', rows: PROJECTS as unknown as PlatformRow[] },
  { vertical: 'customer-support', rows: SUPPORT as unknown as PlatformRow[] },
  { vertical: 'inventory', rows: INVENTORY as unknown as PlatformRow[] },
]

interface OAuthRow {
  vertical: string
  slug: string
  name: string
}

const oauth: OAuthRow[] = []
const nonOauthByVertical: Record<string, string[]> = {}

for (const { vertical, rows } of SOURCES) {
  nonOauthByVertical[vertical] = []
  for (const p of [...rows].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const t = p.auth_type
    if (t === 'oauth2' || t === 'oauth2_cc') {
      oauth.push({ vertical, slug: p.slug, name: p.name })
    } else {
      nonOauthByVertical[vertical]!.push(p.slug)
    }
  }
}

// Slugs, not `<SLUG>_CLIENT_ID` / `_SECRET` pairs. This table used to list one
// env pair per OAuth platform, and nothing read any of them: client
// credentials are adapter settings (see the section this renders into). Most
// of those names were not even valid shell identifiers (`SHIPBOB-INVENTORY_…`).
const oauthRows = oauth.map((p) => `| ${p.vertical} | \`${p.slug}\` | ${p.name} |`)

const nonOauthSections = Object.entries(nonOauthByVertical)
  .filter(([, slugs]) => slugs.length > 0)
  .map(
    ([vertical, slugs]) =>
      `### ${vertical}\n\n${slugs.map((s) => `\`${s}\``).join(', ')}\n`,
  )

const output = `# Environment Variables

> **Auto-generated** from each vertical's \`src/verticals/<name>/platforms/metadata.ts\`.
> Re-generate with \`pnpm --filter integration-server run generate:env-doc\`.

## Core service

| Variable | Description |
|---|---|
| \`PORT\` | HTTP port. Default \`3010\` (also published on the host as \`3010\` by the docker-compose service). |
| \`HOST\` | Bind address. Default \`0.0.0.0\`. |
| \`STORE_PATH\` | SQLite file for the credential + adapter-settings store. Default \`./data/credentials.db\`. |
| \`STORE_SECRET\` | Symmetric encryption key for stored credentials. **≥ 32 characters required.** |
| \`DATABASE_URL\` | Optional. A \`postgres://\` (or \`postgresql://\`) connection string. Set and non-empty, the service keeps its credential store, sync jobs and resource cache in that Postgres database instead of the SQLite files (\`STORE_PATH\`, \`DATA_STORE_PATH\`); unset, it uses SQLite. Any other value fails boot rather than falling back to SQLite. admin-api and webhook-gateway read the same variable for their own databases. Read-only SQL access and Superset need it. To move an existing deployment's data, see [operations/switching-databases.md](../operations/switching-databases.md). |
| \`ADMIN_SECRET\` | Required on \`/admin/*\` routes when set. Unset + \`NODE_ENV != production\` = unrestricted (dev only). |
| \`RATE_LIMIT_MAX\` | Optional global rate-limit cap (requests per window). |
| \`RATE_LIMIT_WINDOW_MS\` | Optional global rate-limit window in milliseconds. |
| \`REDIS_URL\` | Optional. When set, per-API-key rate limits use Redis instead of an in-process token bucket — required for horizontally-scaled deployments to share one budget per key. Format: \`redis://[:password@]host:port[/db]\`. \`docker compose --profile scale up -d\` brings up a local Redis. |
| \`REFRESH_WORKER_INTERVAL_MS\` | How often the keep-alive worker ticks. Default \`900000\` (15 min), chosen so a one-hour access token is renewed before it lapses. A tick only refreshes connections whose token is near expiry, so the cost is roughly one token request per connection per token lifetime. |
| \`REFRESH_WORKER_EXPIRING_WITHIN_MS\` | Renew a token lapsing inside this window. Default \`1800000\` (30 min) — two ticks of headroom, so one missed tick does not strand a connection. Raise it to reduce token-endpoint traffic at the cost of connections sitting expired between uses. |
| \`REFRESH_WORKER_KEEP_WARM_MS\` | Cadence for grants with no access-token expiry — nothing to keep fresh, just exercised occasionally so providers that drop unused refresh tokens don't. Default \`72000000\` (20h). |
| \`SERVICE_SECRET\` | Shared secret this service presents to admin-api (as \`X-Service-Secret\`) when polling operator-tuned runtime settings — rate limits, feature flags. Mirrors \`ADMIN_SECRET\`, which authenticates the opposite direction, and is deliberately a *different* value so a compromise of one service does not open both paths. Unset means the poll is rejected and every setting falls back to its env/compiled default. Generate with \`scripts/generate-secrets.sh\`. |
| \`CORS_ORIGIN\` | Comma-separated origins allowed to call this API from a browser. Empty (default) sends no \`Access-Control-*\` headers, which is what a Bearer-token API wants. Set it to the docs-server origin to use the Swagger console's "Try it out" — that console is served from another origin, so the browser preflights every call. docker-compose defaults it to \`http://localhost:3003\`. Avoid \`*\` on any deployment whose API keys can write. |
| \`PUBLIC_BASE_URL\` | Optional canonical public URL — overrides the company-info baseUrl + \`Host\` header when emitting Connect Link / OAuth callback URLs. Set when the service is behind a custom-domain reverse proxy. |
| \`DESTINATIONS_WORKER\` | Set \`off\` to stop the destination export scheduler (Parquet to S3/GCS/Azure, or Postgres — see [integrate/destinations.md](../integrate/destinations.md)). Manual runs from the admin API still work. Default on whenever the data store is on. |
| \`DESTINATIONS_WORKER_INTERVAL_MS\` | How often the destination scheduler looks for due destinations. Default \`30000\`; each destination still runs at its own interval. |
| \`SYNC_SCHEDULER_INTERVAL_MS\` | How often the sync scheduler looks for connections whose sync schedule is due. Default \`60000\`, minimum \`5000\`. How often each connection syncs is its own schedule plus the \`data_store.sync.default_interval_minutes\` runtime setting; turn scheduling off with \`data_store.sync.scheduler_enabled\`. |
| \`DESTINATIONS_ALLOW_PRIVATE_HOSTS\` | Comma-separated host names a destination may point at although they resolve to private addresses (MinIO next to the stack, a Postgres on the LAN). Every other destination host must resolve to public addresses. |
| \`ANALYTICS_ADMIN_DATABASE_URL\` | Postgres only. A \`postgres://\` URL for a role with \`CREATEROLE\` that owns (or may \`GRANT\` on) the store tables. When set, read-only SQL access is *managed*: the service provisions the views (again on boot whenever the view catalog changed) and creates, rotates and revokes SQL principals itself. Unset = *manual* mode: it only generates the SQL. See [deployment/postgres-analytics.md](../deployment/postgres-analytics.md). |
| \`ANALYTICS_ROLE_PREFIX\` | Prefix for every Postgres role read-only SQL access creates (\`<prefix>_analytics_owner\`, \`<prefix>_sql_<name>_<id>\`, …). Roles are cluster-global, so deployments sharing a Postgres cluster need different prefixes. Default \`os\`. |
| \`ANALYTICS_READ_HOST\` | The host BI tools should connect to for read-only SQL access (e.g. a read replica), shown with each new SQL principal. |
| \`CONFIG_PATH\` | Override the default \`./config/config.yml\` location. |
| \`NODE_ENV\` | Set to \`production\` for production deployments. |

## Licensing

Read by integration-server only. admin-api reads its status from integration-server (\`GET /admin/license\`, which needs the same \`ADMIN_SECRET\` on both), and the admin console reads admin-api's \`GET /api/license\`. A missing or broken license never stops the service; it runs in community mode (1 connection, 1 tenant) and says so in its startup log. Installing and renewing: [deployment/license.md](../deployment/license.md).

| Variable | Description |
|---|---|
| \`OPENSTEWARD_LICENSE\` | The license token itself (\`v4.public.…\`). Wins over \`OPENSTEWARD_LICENSE_FILE\`, which is then ignored (with a warning when that file exists). Empty counts as unset. Keep it out of logs and CI output. |
| \`OPENSTEWARD_LICENSE_FILE\` | Path to the license file. Default: \`license.key\` next to the credential store (\`dirname(STORE_PATH)\`); docker-compose sets \`/etc/opensteward/license/license.key\`. Mount the **directory**, never the single file (a Kubernetes Secret without \`subPath\`, a compose bind mount of a folder), so a renewal applies without a restart. Must be readable by uid 1000. Empty counts as unset. |

## Admin UI & admin-api (SSO / identity)

Variables for the admin console (\`admin\` :3000) and its API (\`admin-api\` :3001),
including enterprise SSO (SAML / OIDC / LDAP) and SCIM provisioning. See
[deployment/sso-setup.md](../deployment/sso-setup.md) for the full setup walkthrough
and [architecture/sso-and-identity-providers.md](../architecture/sso-and-identity-providers.md)
for the design.

| Variable | Service | Description |
|---|---|---|
| \`JWT_SECRET\` | admin-api | Signs admin-session JWTs. **≥ 32 characters required.** |
| \`SESSION_SECRET\` | admin | Signs the admin UI session cookie. **≥ 32 characters required.** |
| \`STORE_SECRET\` | admin-api | Encrypts stored SSO provider secrets (client secret, LDAP bind password, SAML IdP cert) at rest. **Required for SSO; ≥ 32 characters.** Reuse the same value as the integration-server credential store. |
| \`SSO_PUBLIC_BASE_URL\` | admin-api + admin | Public, browser-/IdP-reachable base URL of admin-api. Where IdPs send SAML ACS & OIDC callbacks, where SCIM clients connect, and what the admin UI's "Sign in with …" links point at. Default \`http://localhost:3001\`. |
| \`ADMIN_UI_URL\` | admin-api | Public base URL of the admin UI — where admin-api redirects the post-login handoff. Default \`http://localhost:3000\`. |
| \`ADMIN_API_URL\` | admin | Server-to-server URL the admin UI uses to reach admin-api (e.g. \`http://admin-api:3001\` in Docker). |
| \`DOCS_SERVER_URL\` | admin | Browser-facing docs-server URL for cross-app links. |
| \`SUPERSET_URL\` | admin-api | Internal URL admin-api calls Apache Superset on (e.g. \`http://superset:8088\` in Docker). The embedded-Superset switch: unset or not an http(s) URL = off. \`SUPERSET_PUBLIC_URL\` (browser-facing; defaults to this) and the \`SUPERSET_SERVICE_USERNAME\` / \`_PASSWORD\` service account go with it. Postgres deployments only; see [deployment/superset.md](../deployment/superset.md). |
| \`SESSION_COOKIE_SECURE\` | admin | Whether the session and flash cookies carry \`Secure\`. Unset means \`NODE_ENV === 'production'\`, the right default for anything served over HTTPS. Set \`false\` **only** to serve the admin UI over plain HTTP to a non-\`localhost\` address — browsers will not store a \`Secure\` cookie there, so login fails silently. Doing so puts a control-plane session token on the wire in cleartext; prefer HTTPS or a tunnel. |

## OAuth adapter credentials

OAuth client credentials are **adapter settings, not environment variables**.
Each OAuth platform below reads \`clientId\`, \`clientSecret\` and
\`redirectUri\` — plus options some platforms take, such as \`scopes\` or
\`sandbox\` — from its adapter config, which is stored encrypted and survives
restarts. Set it on the platform's page in the admin UI
(\`/platforms/{vertical}/{slug}\`), or on integration-server's admin API
(\`X-Admin-Secret\`):

| Call | Effect |
|---|---|
| \`POST /admin/platforms/{vertical}/{slug}/enable\` with \`{ "config": { … } }\` | Enables the adapter. A \`config\` given here **replaces** the stored one; omit it to keep what is stored. |
| \`PUT /admin/platforms/{vertical}/{slug}/config\` with \`{ "config": { … } }\` | **Merges** into the stored config, key by key. A \`null\` value removes that key. |
| \`GET /admin/platforms/{vertical}/{slug}/config\` | Reads it back. The secret is never returned — \`hasSecret\` says whether one is set. |

Set \`redirectUri\` to exactly \`{public base URL}/auth/{vertical}/{slug}/callback\`
and register that same URL with the platform. The authorize request carries the
configured \`redirectUri\`; the token exchange sends the deployment's own
callback URL (\`PUBLIC_BASE_URL\` when set); a platform refuses an exchange whose
redirect URI differs from the authorize request's.

Apart from one deprecated fallback, no per-platform \`*_CLIENT_ID\` /
\`*_SECRET\` variable is read. Earlier versions of this page listed one for
every OAuth platform, and setting them had no effect. \`eposnow\` alone still
falls back to \`EPOSNOW_CLIENT_ID\`, \`EPOSNOW_CLIENT_SECRET\` and
\`EPOSNOW_REDIRECT_URI\` for any key its adapter config leaves unset. That
fallback is deprecated and will be removed; move the values into the adapter
config. (Compose never forwarded these variables, so under Compose the fallback
has never applied.)

| Vertical | Slug | Platform |
|---|---|---|
${oauthRows.join('\n')}

## Non-OAuth adapter slugs

These platforms take credentials at connect time (API keys, basic auth,
session tokens), so they need no client credentials in their adapter config.

${nonOauthSections.join('\n')}
`

const outDir = path.resolve(__dirname, '../../../docs/environment')
mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'environment-variables.md')
writeFileSync(outPath, output)
console.log(
  `✓ wrote ${path.relative(process.cwd(), outPath)} (${oauth.length} OAuth + ${Object.values(
    nonOauthByVertical,
  ).reduce((n, s) => n + s.length, 0)} non-OAuth adapters)`,
)
