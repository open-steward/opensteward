#!/usr/bin/env node
/**
 * `generate-env-example` — keep `.env.example` in sync with every
 * `process.env.<NAME>` reference across the codebase.
 *
 * Greps the repo for `process.env.X` / `process.env['X']` accesses,
 * categorizes each var as required vs optional based on a small allowlist,
 * collects the file paths where it's read, and emits a `.env.example`
 * file at the repo root.
 *
 * Run with `tsx scripts/generate-env-example.ts`. The output is the
 * git-tracked `.env.example`; `pnpm doctor` diffs the operator's `.env`
 * against it. Edit the metadata maps below (`REQUIRED`, `DESCRIPTIONS`)
 * to add a new env var, then re-run.
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, relative, resolve } from 'path'

const REPO_ROOT = resolve(__dirname, '..')

/**
 * Env vars the runtime treats as REQUIRED. Every one of these is checked
 * by `assertSecret()` or referenced unconditionally in a config loader.
 * Anything not in this list is treated as OPTIONAL in `.env.example`.
 */
const REQUIRED = new Set<string>(['STORE_SECRET', 'JWT_SECRET', 'SESSION_SECRET'])

/**
 * Human-readable one-liner for each env var. Keys absent here get a
 * placeholder description so the file still generates.
 */
const DESCRIPTIONS: Record<string, string> = {
  STORE_SECRET:
    'AES-256-GCM key for encrypted-at-rest blobs (OAuth tokens, PII, SSO secrets). At least 32 random chars.',
  JWT_SECRET: 'HMAC key for admin-api JWTs. At least 32 random chars.',
  JWT_EXPIRES_IN:
    'Optional. Lifetime of an admin-api operator session token, as an ms/zeit string (e.g. 12h, 7d). Defaults to 24h. Tokens are stateless, so this is what bounds a leaked one — shorten it if operators sign in from shared machines.',
  SESSION_SECRET: 'Cookie session-store secret used by admin. At least 32 random chars.',
  ADMIN_SECRET:
    'Optional. Bearer token gating the control-plane admin endpoints. May be unset in dev.',
  BOOTSTRAP_TOKEN:
    'Gates first-run admin creation: POST /api/auth/setup requires it as X-Bootstrap-Token. Set this before the first `docker compose up` in any deployment reachable by anyone else — while it is unset and no admin exists yet, whoever posts a username and password first becomes the admin. Ignored once setup has completed (the endpoint returns 409).',
  LOGO_SOURCE:
    'Optional. none|cdn|local — where platform logos come from. Defaults to none (brand-tinted monogram tiles, no external requests, no account, works air-gapped). cdn hotlinks Brandfetch and needs BRANDFETCH_CLIENT_ID; local serves logos you fetched to docs/platforms/logos. Logos are not shipped with OpenSteward — see docs/operations/platform-logos.md.',
  BRANDFETCH_CLIENT_ID:
    'Optional. Brandfetch client ID, needed for LOGO_SOURCE=cdn and by `pnpm --filter integration-server fetch:logos` to populate LOGO_SOURCE=local. Free at https://brandfetch.com/developers. Not a secret — Brandfetch designed it to be embedded in public <img> tags.',
  BRANDFETCH_REFERER:
    'Optional. Referer header sent on Brandfetch CDN requests by the logo-fetch script. Should match the origin registered for your Brandfetch app.',
  NODE_ENV:
    'production|development|test. Drives strictness of assertSecret + cookie security flags.',
  UPSTREAM_TIMEOUT_MS:
    'Optional. Ceiling in ms on a single upstream platform HTTP call. Default 30000. Applied as the axios default so it also covers the 592 adapter clients that set no timeout of their own; an adapter with an explicit timeout keeps it. Without this a platform that accepts the connection and goes quiet blocks the request forever.',
  HANDLER_TIMEOUT_MS:
    'Optional. Ceiling in ms on a whole request handler, after which the caller gets 504 REQUEST_TIMEOUT (an upstream call that times out on its own gives 504 UPSTREAM_TIMEOUT). Default 120000 — deliberately larger than one upstream call, because withRetry makes up to five attempts on HTTP 429 with 1+2+4+8s of backoff. This is the outer bound guaranteeing no request hangs indefinitely.',
  PORT: 'TCP port the service listens on. Overrides config.yml.',
  HOST: 'Bind address. Defaults to 0.0.0.0.',
  CONFIG_PATH: 'Override path to config.yml. Defaults to ./config/config.yml relative to cwd.',
  STORE_PATH:
    'Override path to the integration-server credentials SQLite file. Defaults to ./data/credentials.db.',
  ADMIN_API_URL: 'In-network URL of admin-api (used by other services for host-info lookups).',
  ADMIN_UI_URL: 'Browser-facing URL of the admin app. Where the post-SSO handoff lands.',
  DOCS_SERVER_URL: 'Browser-facing URL of docs-server. Used by admin to render cross-app links.',
  SSO_PUBLIC_BASE_URL: 'Public base URL where IdPs send SAML ACS / OIDC callbacks and SCIM hits.',
  SESSION_COOKIE_SECURE:
    "Whether the admin session and flash cookies carry `Secure`. Leave empty: that means NODE_ENV === 'production', which is correct for anything served over HTTPS. Set false ONLY to serve the admin UI over plain HTTP to an address that is not localhost — a browser will not store a Secure cookie there, so login silently bounces back to the login page. It puts a control-plane session token on the wire in cleartext, so prefer HTTPS, or a tunnel that puts the far end back on its own localhost.",
  INTEGRATION_SERVER_URL: 'In-network URL of integration-server.',
  PUBLIC_BASE_URL:
    'Optional canonical public URL of integration-server (overrides company-info baseUrl + Host header).',
  CORS_ORIGIN:
    'Comma-separated origins allowed to call the API from a browser. Empty (default) sends no CORS headers. Required for docs-server\'s Swagger "Try it out", which is cross-origin.',
  REDIS_URL:
    'Optional. Enables shared rate-limit buckets across multiple integration-server replicas.',
  RATE_LIMIT_MAX: 'Max requests per window. Overrides config.yml.',
  RATE_LIMIT_WINDOW_MS: 'Rate-limit window in ms.',
  AUTH_DEV_API_KEYS_ENABLED:
    'Set "0" to refuse osk_ developer keys on /v1/*. Only the boot-time default — the admin UI setting auth.dev_api_keys_enabled overrides it and is read per request. Does not affect X-Admin-Secret.',
  AUTH_DEV_OAUTH_ENABLED:
    'Set "1" to accept OIDC bearer tokens on /v1/* from issuers registered under Admin -> OAuth clients. Only the boot-time default; auth.dev_oauth_enabled overrides it. Lets an infrastructure-as-code deployment start with OAuth on before anyone opens the admin UI.',
  SERVICE_SECRET:
    'Shared secret sibling services present as X-Service-Secret to read runtime settings from admin-api. Distinct from ADMIN_SECRET, which authenticates the opposite direction. Unset means services cannot read settings and fall back to their own defaults.',
  REFRESH_WORKER_EXPIRING_WITHIN_MS:
    'Renew an access token lapsing within this window. Default 1800000 (30 min). Raise to cut token-endpoint traffic; connections then spend longer showing as expired between uses.',
  REFRESH_WORKER_KEEP_WARM_MS:
    'How often to exercise a grant that has no access-token expiry. Default 72000000 (20h).',
  REFRESH_WORKER_ENABLED: 'Set "false" to disable the background credential-refresh worker.',
  DATA_STORE_MODE: 'database | passthrough | external. Default database.',
  DATA_STORE_PATH: 'SQLite file for the resource cache.',
  DATA_STORE_EXTERNAL_BATCH_EVENTS:
    'When true, sync emits one event per page instead of one per resource (external mode).',
  DATA_STORE_MAX_SIZE_MB:
    'Soft size budget (MB) for resources.db. WARN at this value, ERROR at 10x.',
  DATA_STORE_AUTO_SYNC_ON_BOOT:
    'Cold-start warm-up: enqueue one sync job per active connection at boot.',
  DATA_STORE_STALE_AFTER_SECONDS: 'TTL for cached rows. Unset = manual invalidation only.',
  DATA_STORE_SYNC_PAGE_SIZE: 'Upstream pagination size for sync jobs. Default 500.',
  ANALYTICS_ADMIN_DATABASE_URL:
    'Optional, Postgres only. A postgres:// URL for a role with CREATEROLE that owns (or may GRANT on) the store tables. When set, integration-server provisions the read-only SQL views (re-provisioning on boot when the view catalog changed) and creates, rotates and revokes SQL principals itself. Unset = manual mode: it only generates the SQL for an operator to run. See docs/deployment/postgres-analytics.md.',
  ANALYTICS_ROLE_PREFIX:
    'Optional. Prefix for every Postgres role read-only SQL access creates (<prefix>_analytics_owner, <prefix>_sql_<name>_<id>, …). Roles are cluster-global, so deployments sharing a Postgres cluster need different prefixes. Lowercase, starts with a letter, at most 16 chars. Default os.',
  ANALYTICS_READ_HOST:
    'Optional. The host BI tools should connect to for read-only SQL access (e.g. a read replica), shown with each new SQL principal. Unset = the admin UI shows no host.',
  DESTINATIONS_WORKER:
    'Optional. Set "off" to stop the destination export scheduler (warehouse/lake exports; manual runs from the admin API still work). Default on whenever the data store is on. See docs/integrate/destinations.md.',
  DESTINATIONS_WORKER_INTERVAL_MS:
    'Optional. How often (ms) the destination scheduler looks for due destinations. Default 30000; each destination still runs at its own interval.',
  SYNC_SCHEDULER_INTERVAL_MS:
    "Optional. How often (ms) the sync scheduler looks for connections whose sync schedule is due. Default 60000, minimum 5000. The schedules themselves are the data_store.sync.* runtime settings and each connection's own mode.",
  DESTINATIONS_ALLOW_PRIVATE_HOSTS:
    'Optional. Comma-separated host names a destination may point at even though they resolve to private addresses — MinIO next to the stack, a Postgres on the LAN. Every other destination host must resolve to public addresses (SSRF guard).',
  SUPERSET_URL:
    'Optional. Internal URL admin-api (and the superset-bootstrap job) use to reach Apache Superset, e.g. http://superset:8088. Embedded Superset dashboards are off while this is empty. Postgres deployments only — see docs/deployment/superset.md.',
  SUPERSET_PUBLIC_URL:
    'Optional. Browser-facing Superset URL the admin UI frames dashboards from (iframe src and CSP frame-src), e.g. https://bi.example.com. Defaults to SUPERSET_URL, which is only right when both are the same host.',
  SUPERSET_SERVICE_USERNAME:
    'Superset service account admin-api logs in as to mint guest tokens, and the bootstrap job uses to create the database connection, datasets and dashboards. Created by deploy/superset/bootstrap-roles.py. Compose defaults it to opensteward-service.',
  SUPERSET_SERVICE_PASSWORD:
    'Password of the Superset service account (at least 16 characters). scripts/generate-secrets.sh mints one. Must be the same value on admin-api, superset-init and superset-bootstrap.',
  SUPERSET_SECRET_KEY:
    "Superset's own SECRET_KEY (sessions, encrypted database passwords). Read by deploy/superset/superset_config.py, not by OpenSteward. scripts/generate-secrets.sh mints one; never change it after first boot.",
  OPENSTEWARD_ADMIN_ORIGIN:
    "The admin UI origin(s), comma-separated, allowed to embed Superset: Superset's CSP frame-ancestors and CORS, and the allowed domain of each embedded dashboard. Compose derives it from ADMIN_UI_URL.",
  OPENSTEWARD_RELEASE:
    "Overrides the release every service reports on /version and the admin's System page shows. Unset, it is read from the VERSION file each image carries (the repo's own, from a checkout). Leave unset unless you repackage the images yourself.",
  OPENSTEWARD_LICENSE:
    'Optional. The OpenSteward license itself (a v4.public.… token), for platforms where mounting a file is awkward. Wins over OPENSTEWARD_LICENSE_FILE, which is then ignored (with a warning when that file exists). Read by integration-server only; keep it out of logs and CI output. Empty counts as unset. No license means community mode (1 connection, 1 tenant); the service never refuses to start. See docs/deployment/license.md.',
  OPENSTEWARD_LICENSE_FILE:
    'Optional. Path to the license file. Default: license.key next to the credential store (dirname of STORE_PATH); docker-compose sets /etc/opensteward/license/license.key. Mount its DIRECTORY, never the single file (a Kubernetes Secret volume without subPath, a compose bind mount of a folder), so a renewed license is picked up without a restart. It must be readable by uid 1000. Empty counts as unset.',
  SUPERSET_DB_URI:
    'Optional, superset-bootstrap only. A full SQLAlchemy URI (postgresql+psycopg2://…) Superset should use for the analytics views, instead of the read-only SQL principal the job creates and rotates itself. It should still be a masked, read-only login.',
  SUPERSET_ANALYTICS_DB_HOST:
    'Optional, superset-bootstrap only. Host Superset uses to reach the analytics views (e.g. postgres, or a read replica). Default: the host in DATABASE_URL, else ANALYTICS_READ_HOST.',
  SUPERSET_ANALYTICS_DB_PORT:
    "Optional, superset-bootstrap only. Port for SUPERSET_ANALYTICS_DB_HOST. Default 5432 (or DATABASE_URL's).",
  SUPERSET_ANALYTICS_DB_NAME:
    'Optional, superset-bootstrap only. Database holding the analytics views. Default: the database in DATABASE_URL, else the one integration-server reports.',
  SUPERSET_ANALYTICS_DB_SSLMODE:
    "Optional, superset-bootstrap only. libpq sslmode for Superset's connection to the analytics views (e.g. require).",
  SUPERSET_ASSETS_DIR:
    'Optional, superset-bootstrap only. Directory of dashboard bundles (*.zip exported from Superset) to import on every run. Default deploy/superset/assets/dashboards.',
  SUPERSET_BOOTSTRAP_TIMEOUT_MS:
    'Optional, superset-bootstrap only. How long to wait for Superset to become healthy and the analytics views to be provisioned. Default 600000 (10 min).',
  DATABASE_URL:
    "Optional. postgres:// URL selecting the Postgres backend for the stateful services (unset = SQLite). Read-only SQL access and embedded Superset need it. superset-bootstrap also reads its host and database as the default target for Superset's connection.",
  OST_ALLOW_PRIVATE_HOSTS:
    'Dev only. Set to "1" to let safe-fetch reach private IP ranges (e.g. localhost adapters).',
  OST_DISABLE_LOCKOUT: 'Dev only. Set to "1" to bypass admin-api login lockout.',
  OST_DOCS_REPO_URL: 'Public repo URL used by docs-server when rendering "edit on GitHub" links.',
  OST_DOCS_BRANCH: 'Branch used for the same edit-on-GitHub links. Defaults to main.',
  APPFOLIO_DATABASE: 'Appfolio adapter — tenant database identifier.',
  EASYPOST_TEST_API_KEY: 'EasyPost adapter — test-mode API key for integration tests.',
  EPOSNOW_CLIENT_ID:
    'Deprecated. Epos Now OAuth client ID, read only when the eposnow adapter config has no clientId (unset or blank). Set clientId in the adapter config instead; this fallback will be removed. docker-compose.yml does not pass it to integration-server.',
  EPOSNOW_CLIENT_SECRET:
    'Deprecated. Epos Now OAuth client secret, read only when the eposnow adapter config has no clientSecret (unset or blank). Set clientSecret in the adapter config instead; this fallback will be removed. docker-compose.yml does not pass it to integration-server.',
  EPOSNOW_REDIRECT_URI:
    'Deprecated. Epos Now OAuth redirect URI, read only when the eposnow adapter config has no redirectUri (unset or blank). Set redirectUri in the adapter config instead; this fallback will be removed. docker-compose.yml does not pass it to integration-server.',
  ADMIN_URL: 'Dev script only — base URL of the admin app for screenshot automation.',
  INTEGRATION_URL: 'Dev script only — base URL of integration-server for screenshot automation.',
  ADMIN_USER:
    'Dev script only — admin username the screenshot automation (`pnpm docs:screenshots`) signs in with.',
  ADMIN_USER_PASSWORD: 'Dev script only — password for ADMIN_USER in the screenshot automation.',
  ADMIN_PASS:
    'Dev script only — older name for ADMIN_USER_PASSWORD, still accepted by the screenshot automation.',
  ENV_FILE:
    'Dev script only — dotenv file the screenshot automation reads ADMIN_USER / ADMIN_USER_PASSWORD from. Default: the first .env above the script that sets ADMIN_USER (the repo root .env).',
  DEBUG_MCP_E2E: 'MCP-server test — enable verbose end-to-end logging.',
}

/** Roots we walk for `process.env.<NAME>` references. */
const ROOTS = ['apps', 'packages', 'scripts']

/** Path-segment fragments that disqualify a file from the scan. */
const SKIP_FRAGMENTS = ['node_modules', '/dist/', '.test.ts', '.test.tsx', '/tests/', '__tests__']

interface EnvHit {
  /** Posix-style path relative to repo root. */
  path: string
  line: number
}

function walk(dir: string, out: string[]): void {
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (SKIP_FRAGMENTS.some((s) => full.includes(s))) continue
    if (e.isDirectory()) {
      walk(full, out)
    } else if (e.isFile() && /\.(ts|tsx|js|mjs|cjs)$/.test(e.name)) {
      out.push(full)
    }
  }
}

/**
 * Match `process.env.NAME`, `process.env['NAME']` / `process.env["NAME"]`, and
 * reads routed through the `numericEnv('NAME')` helper.
 *
 * Without matching the helper, every knob read through `numericEnv()` — the
 * whole `REFRESH_WORKER_*` family that tunes token-refresh cadence — would be
 * missing from `.env.example`, the one file an operator copies when setting a
 * deployment up.
 */
const ENV_RE =
  /(?:process\.env(?:\.([A-Z_][A-Z0-9_]*)|\[['"]([A-Z_][A-Z0-9_]*)['"]\])|numericEnv\(['"]([A-Z_][A-Z0-9_]*)['"]\))/g

export function collectEnvUsage(): Map<string, EnvHit[]> {
  const files: string[] = []
  for (const root of ROOTS) walk(join(REPO_ROOT, root), files)
  const hits = new Map<string, EnvHit[]>()
  for (const file of files) {
    let content: string
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      ENV_RE.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = ENV_RE.exec(lines[i])) !== null) {
        const name = match[1] ?? match[2] ?? match[3]
        if (!name) continue
        const arr = hits.get(name) ?? []
        const rel = relative(REPO_ROOT, file).split(/\\|\//).join('/')
        arr.push({ path: rel, line: i + 1 })
        hits.set(name, arr)
      }
    }
  }
  return hits
}

function dedupePaths(hits: EnvHit[]): string[] {
  const set = new Set<string>()
  for (const h of hits) set.add(h.path)
  return [...set].sort()
}

export function renderEnvExample(usage: Map<string, EnvHit[]>): string {
  const names = [...usage.keys()].sort()
  const required = names.filter((n) => REQUIRED.has(n))
  const optional = names.filter((n) => !REQUIRED.has(n))

  const lines: string[] = []
  lines.push('# OpenSteward .env.example')
  lines.push('#')
  lines.push('# Generated by `tsx scripts/generate-env-example.ts`. Lists every env var')
  lines.push('# the codebase reads. Copy to `.env` (gitignored) and fill in values.')
  lines.push('#')
  lines.push('# `pnpm doctor` diffs your `.env` against this file: missing requireds')
  lines.push('# fail the doctor, missing optionals warn.')
  lines.push('')
  lines.push('# ── Required ───────────────────────────────────────────────────────')
  lines.push('# These MUST be set in production. assertSecret() rejects placeholders,')
  lines.push('# short values, and low-entropy strings — see packages/shared/src/auth/secrets.ts.')
  lines.push('')
  for (const name of required) {
    lines.push(...renderEntry(name, usage.get(name) ?? [], true))
    lines.push('')
  }

  lines.push('# ── Optional ───────────────────────────────────────────────────────')
  lines.push('# Either has a sane runtime default or is feature-gated. Doctor warns')
  lines.push('# if any are unset; the runtime continues.')
  lines.push('')
  for (const name of optional) {
    lines.push(...renderEntry(name, usage.get(name) ?? [], false))
    lines.push('')
  }

  return lines.join('\n').trimEnd() + '\n'
}

function renderEntry(name: string, hits: EnvHit[], required: boolean): string[] {
  const desc = DESCRIPTIONS[name] ?? '(no description — add one in scripts/generate-env-example.ts)'
  const flag = required ? 'REQUIRED' : 'optional'
  const paths = dedupePaths(hits)
  const out: string[] = []
  out.push(`# ${name} — ${flag}`)
  // Hard-wrap the description at ~78 chars for git diffability.
  for (const chunk of wrap(desc, 78)) out.push(`#   ${chunk}`)
  if (paths.length > 0) {
    out.push(
      `#   read by: ${paths.slice(0, 4).join(', ')}${paths.length > 4 ? ` (+${paths.length - 4} more)` : ''}`,
    )
  }
  out.push(`${name}=`)
  return out
}

function wrap(s: string, width: number): string[] {
  const words = s.split(/\s+/)
  const out: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur.length === 0) {
      cur = w
    } else if (cur.length + 1 + w.length > width) {
      out.push(cur)
      cur = w
    } else {
      cur += ' ' + w
    }
  }
  if (cur) out.push(cur)
  return out
}

function main(): void {
  const usage = collectEnvUsage()
  const content = renderEnvExample(usage)
  const outPath = join(REPO_ROOT, '.env.example')
  writeFileSync(outPath, content, 'utf8')
  process.stdout.write(`wrote ${relative(REPO_ROOT, outPath)} — ${usage.size} env vars\n`)
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  (process.argv[1].endsWith('generate-env-example.ts') ||
    process.argv[1].endsWith('generate-env-example.js') ||
    process.argv[1].endsWith('generate-env-example'))
if (isMain) {
  try {
    main()
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  }
}
