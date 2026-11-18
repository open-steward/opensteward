/**
 * Runtime config for the unified OpenSteward service.
 *
 * Single source of truth: env vars + an optional `config.yml` next to the
 * binary. One process, one config file — every vertical reads this shared
 * config.
 */
import fs from 'node:fs'
import path from 'node:path'
// js-yaml 5 removed its default export. A namespace import is the form that
// works under BOTH native ESM (docs-server compiles to nodenext) and the
// CommonJS interop the other apps emit — a default import crashes the
// former at boot with "does not provide an export named 'default'".
import * as yaml from 'js-yaml'
import { assertSecret, resolveDbConfig, type ResolvedDbConfig } from '@opensteward/shared'
import type { DataStoreMode, OpenApiServersConfig, WebhookConfig } from '@opensteward/shared'
import type { LicenseConfig } from '@opensteward/shared/licensing'

export interface DataStoreConfig {
  /**
   * `database`     — default. Local SQLite read-through cache. `?is_live=true`
   *                  forces an upstream fetch (writes back to cache).
   * `passthrough`  — every request live to upstream; nothing cached. `?is_live`
   *                  is a no-op.
   * `external`     — `database` cache plus outbound `resource.*` events
   *                  fired through the existing webhook subscription system.
   */
  mode: DataStoreMode
  /**
   * SQLite file for cached resources + sync jobs. Default: `<dirname(storePath)>/resources.db`.
   * Override via env `DATA_STORE_PATH` or YAML `dataStore.path`.
   */
  path?: string
  /**
   * `external`-mode tuning. When `batchEvents` is true, the SyncWorker emits
   * one `resource.synced` event per page (`items[]`) instead of per item.
   */
  external?: {
    batchEvents?: boolean
  }
  /**
   * Soft size budget (MB) for `resources.db`. WARN logs fire at this
   * threshold; ERROR logs fire at 10× this value. Default 100 MB warn /
   * 1000 MB error. Set to `0` to disable the monitor.
   */
  maxSizeMb?: number
  /**
   * When true, the integration-server enqueues one sync job per active
   * connection (rows with a non-null `owner_tenant_id`) on boot. Useful
   * right after flipping from `passthrough` to `database` so the cache
   * is warm before traffic arrives. Default false. No-op in
   * `passthrough` mode.
   */
  autoSyncOnBoot?: boolean
  /**
   * Stale-cache TTL in seconds. Cached rows older than this are treated
   * as a miss and re-fetched from upstream on the next read (writes go
   * back to cache as usual). When unset there is no TTL — only manual
   * invalidation (`?is_live=true`, sync, write-through, cache-clear)
   * refreshes data. Recommended for `database` mode if you don't run
   * frequent syncs. Set in seconds; converted to ms internally.
   */
  staleAfterSeconds?: number
  /**
   * SyncWorker upstream pagination size. Controls how many rows the
   * worker requests per `listX(creds, { page, limit })` call. Lower for
   * adapters that rate-limit aggressively or return huge rows; raise
   * for fast platforms with lots of small rows. Default 500.
   */
  syncPageSize?: number
}

export interface ServiceConfig {
  /** HTTP port. Default 3010. */
  port: number
  /** Bind address. Default 0.0.0.0. */
  host: string
  /** SQLite file path for the unified credential store. */
  storePath: string
  /**
   * Resolved backend for the credential-store family (CredentialStore,
   * ApiKeyStore, EndUserStore, …). DATABASE_URL → Postgres, else SQLite at
   * `storePath`. The data-store family uses `dataDb` below.
   */
  credDb: ResolvedDbConfig
  /** Resolved backend for the data-store (ResourceStore/SyncStore). */
  dataDb: ResolvedDbConfig
  /** Symmetric secret for credential encryption. */
  storeSecret: string
  /**
   * Read-only SQL access (Postgres only) — see docs/deployment/postgres-analytics.md.
   *
   *   adminDatabaseUrl  ANALYTICS_ADMIN_DATABASE_URL: a role with CREATEROLE that
   *                     owns (or may GRANT on) the store tables. Unset → manual
   *                     mode: the service only generates the SQL.
   *   rolePrefix        ANALYTICS_ROLE_PREFIX (default `os`): prefixes every role
   *                     it creates, since roles are cluster-global.
   *   readHost          ANALYTICS_READ_HOST: the host BI tools should connect to
   *                     (e.g. a read replica), shown with each new principal.
   *
   * Optional so hand-built configs (tests) need not name it; `loadConfig` always sets it.
   */
  analytics?: {
    adminDatabaseUrl?: string
    rolePrefix: string
    readHost?: string
  }
  /**
   * Destinations — scheduled exports of the data store (docs/integrate/destinations.md).
   *
   *   worker             DESTINATIONS_WORKER: `off` stops the scheduler (manual
   *                      runs from the admin API still work). Default on
   *                      whenever the data store is (mode != passthrough).
   *   intervalMs         DESTINATIONS_WORKER_INTERVAL_MS: how often the
   *                      scheduler looks for due destinations. Default 30000.
   *   allowPrivateHosts  DESTINATIONS_ALLOW_PRIVATE_HOSTS: comma-separated host
   *                      names a destination may point at even though they
   *                      resolve to private addresses (MinIO, a LAN Postgres).
   *
   * Optional so hand-built configs (tests) need not name it; `loadConfig` always sets it.
   */
  destinations?: {
    worker: boolean
    intervalMs?: number
    allowPrivateHosts: string[]
  }
  /** Optional admin secret. When set, /connections etc. require X-Admin-Secret. */
  adminSecret?: string
  /** Optional rate limit overrides. */
  rateLimitMax?: number
  /**
   * Ceiling on a single upstream platform HTTP call, in ms
   * (`UPSTREAM_TIMEOUT_MS`). Applied as the axios default, so it reaches the
   * 592 adapter clients that build an HTTP client with no timeout of their
   * own; adapters that set one explicitly keep it.
   */
  upstreamTimeoutMs?: number
  /**
   * Ceiling on a whole request handler, in ms (`HANDLER_TIMEOUT_MS`). The
   * backstop for anything the upstream timeout does not cover — a stall in
   * our own code, a lock, a pagination loop.
   */
  handlerTimeoutMs?: number
  rateLimitWindowMs?: number
  /**
   * Optional Redis URL. When set, per-API-key rate limits are tracked in
   * Redis instead of in-process — required for horizontally-scaled
   * deployments to share a single budget across replicas. Format:
   * `redis://[:password@]host:port[/db]`. When unset, the in-memory
   * limiter is used.
   */
  redisUrl?: string
  /**
   * Origins allowed to call this API from a browser. `false` (the default)
   * sends no `Access-Control-*` headers at all, which is what a Bearer-token
   * API wants: a page the operator does not control must not be able to spend
   * a victim's key and read the response.
   *
   * Set `CORS_ORIGIN` to opt in — needed for docs-server's Swagger console,
   * which is served from its own origin and so preflights every "Try it out".
   */
  corsOrigin?: boolean | string | string[]
  /**
   * Trust `X-Forwarded-*` from a reverse proxy. `false` (the secure default)
   * ignores the header, so `request.ip` is the real socket peer and IP-keyed
   * rate limits cannot be spoofed by a client setting its own header. Set
   * `TRUST_PROXY` when a proxy fronts the service: `1`/`true` trusts the whole
   * chain, and a value with a `.` or `:` is passed through as a trusted
   * IP/CIDR list. A hop count (`2`, `3`, …) is refused at boot — see
   * `parseTrustProxy`. Emitting the customer-facing `redirect_uri` host behind
   * a proxy needs either this or `PUBLIC_BASE_URL`.
   */
  trustProxy?: boolean | string
  /**
   * Webhook configuration. `callbackUrl` receives parsed events; signing
   * secrets under `adapters[vertical][platform].secret`. YAML-only — there
   * is no env-var shorthand for nested structures.
   */
  webhooks?: WebhookConfig
  /**
   * Data-store mode + path. See `DataStoreConfig` for the three modes.
   * Default: `{ mode: 'database', path: '<storePath dir>/resources.db' }`.
   */
  dataStore: DataStoreConfig
  /**
   * OpenAPI spec presentation — operator-overrideable server variables
   * (scheme / host / port / version) that flow into the `servers` block of
   * the generated and served openapi.json. Absent → compiled defaults
   * (`http://localhost:3010/v1`). See `docs/dev-api.md` for the layering
   * with admin-DB runtime overrides.
   */
  openapi?: {
    servers?: OpenApiServersConfig
  }
  /**
   * The license source (D-A: integration-server is its only reader). Env only,
   * never config.yml: a committed file must not be able to swap the license.
   * Optional so hand-built configs (tests) need not name it; buildServer then
   * looks for license.key next to the credential store.
   */
  license?: LicenseConfig
}

const DEFAULTS = {
  port: 3010,
  host: '0.0.0.0',
  storePath: './data/credentials.db',
  dataStoreMode: 'database' as DataStoreMode,
  // 30s per upstream call. Long enough for the slow report-style endpoints
  // some platforms expose, short enough that a stall is a bounded failure
  // rather than a silent multi-minute void.
  upstreamTimeoutMs: 30_000,
  // Deliberately larger than one upstream call: `withRetry` makes up to five
  // attempts on 429 with 1+2+4+8s of backoff, so a legitimately retrying
  // request needs more than a single call's budget. This is the outer bound
  // on everything, and the guarantee that no handler blocks forever.
  handlerTimeoutMs: 120_000,
}

function parseMode(raw: string | undefined): DataStoreMode | undefined {
  if (!raw) return undefined
  if (raw === 'database' || raw === 'passthrough' || raw === 'external') return raw
  throw new Error(`DATA_STORE_MODE must be one of database|passthrough|external (got "${raw}").`)
}

function parseBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined
  return raw === 'true' || raw === '1'
}

/**
 * Parse `CORS_ORIGIN` into the shape @fastify/cors expects.
 *
 * Unset or blank means `false` — no CORS headers, the safe default for a
 * public API. A comma-separated list names the origins allowed; `*` is
 * honoured because an operator fronting a genuinely public read-only
 * deployment may mean it. Trailing slashes are stripped: browsers send
 * `Origin: https://host` with no path, and @fastify/cors compares exactly, so
 * `https://host/` would silently never match.
 *
 * Note there is deliberately no way to reach @fastify/cors's `origin: true`
 * (reflect whatever arrives) from an environment variable — that is an
 * accident waiting to happen, and `*` states the same intent out loud.
 */
/**
 * Parse `TRUST_PROXY` (env) or `trustProxy` (config.yml). Unset/empty →
 * undefined, so the caller falls through to the secure default of false.
 * `true`/`1` → true; `false`/`0` → false; a value containing `.` or `:` →
 * passed through as a trusted IP/CIDR list.
 *
 * A bare hop count (`2`, `3`, …) throws. Fastify 5.12.1 removed the numeric
 * form (GHSA-3m5p-2c4r-xxw2: a hop count never inspects the connecting peer,
 * so a client that reaches the origin directly can spoof `X-Forwarded-*`), and
 * it fails CLOSED at runtime — a number is treated as "trust nothing", with no
 * warning. Passing it through would turn a working deployment into one that
 * emits the wrong `redirect_uri` host and keys every rate limit on the proxy's
 * IP. Refusing at boot names the fix instead.
 */
export function parseTrustProxy(
  raw: string | number | boolean | undefined,
): boolean | string | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw === 'boolean') return raw
  const v = String(raw).trim()
  if (v === '') return undefined
  const lower = v.toLowerCase()
  if (lower === 'true' || lower === '1') return true
  if (lower === 'false' || lower === '0') return false
  if (/^\d+$/.test(v)) {
    throw new Error(
      `TRUST_PROXY=${v}: a hop count is no longer accepted — Fastify 5.12.1 disables the numeric ` +
        'form (GHSA-3m5p-2c4r-xxw2) and fails closed, which would silently stop honouring ' +
        'X-Forwarded-*. Use `true`, or a trusted proxy IP/CIDR list such as `10.0.0.0/8,172.16.0.0/12`.',
    )
  }
  return v
}

export function parseCorsOrigin(value: string | undefined): boolean | string | string[] {
  const raw = (value ?? '').trim()
  if (!raw) return false
  const origins = raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  // A '*' anywhere in the list means every origin, not "these plus a literal
  // asterisk". @fastify/cors already collapses an array containing '*' to a
  // bare '*', so returning it here changes nothing at runtime — it just makes
  // the widening visible in this function instead of emerging from library
  // normalisation two layers away.
  if (origins.includes('*')) return '*'
  return origins.length > 0 ? origins : false
}

function loadAnalyticsConfig(): NonNullable<ServiceConfig['analytics']> {
  const adminDatabaseUrl = process.env['ANALYTICS_ADMIN_DATABASE_URL']?.trim() || undefined
  if (adminDatabaseUrl && !/^postgres(ql)?:\/\//i.test(adminDatabaseUrl)) {
    throw new Error('ANALYTICS_ADMIN_DATABASE_URL must be a postgres:// (or postgresql://) URL.')
  }
  const rolePrefix = process.env['ANALYTICS_ROLE_PREFIX']?.trim() || 'os'
  if (!/^[a-z][a-z0-9_]{0,15}$/.test(rolePrefix)) {
    throw new Error(
      'ANALYTICS_ROLE_PREFIX must be lowercase letters, digits and _, start with a letter, at most 16 chars.',
    )
  }
  const readHost = process.env['ANALYTICS_READ_HOST']?.trim() || undefined
  return { adminDatabaseUrl, rolePrefix, readHost }
}

function loadDestinationsConfig(): NonNullable<ServiceConfig['destinations']> {
  const raw = process.env['DESTINATIONS_WORKER']?.trim().toLowerCase()
  const worker = !(raw === 'off' || raw === 'false' || raw === '0')
  const interval = Number(process.env['DESTINATIONS_WORKER_INTERVAL_MS'])
  const allowPrivateHosts = (process.env['DESTINATIONS_ALLOW_PRIVATE_HOSTS'] ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return {
    worker,
    intervalMs: Number.isFinite(interval) && interval >= 1000 ? interval : undefined,
    allowPrivateHosts,
  }
}

/**
 * OPENSTEWARD_LICENSE (the token) and OPENSTEWARD_LICENSE_FILE (a path; default
 * license.key next to the credential store, P4). An empty or whitespace value is
 * unset: compose forwards an unset knob as `VAR=` (`${VAR:-}`), and an empty
 * token must not shadow the file. These are the product's only license
 * environment reads (A3.4's license-env rule pins it).
 */
export function loadLicenseConfig(storePath: string): LicenseConfig {
  const envToken = process.env['OPENSTEWARD_LICENSE']?.trim() || undefined
  const file =
    process.env['OPENSTEWARD_LICENSE_FILE']?.trim() ||
    path.join(path.dirname(storePath), 'license.key')
  return { envToken, filePath: path.resolve(file) }
}

export function loadConfig(): ServiceConfig {
  const yamlPath = process.env['CONFIG_PATH'] ?? path.resolve('./config/config.yml')
  let fromYaml: Partial<ServiceConfig> = {}
  if (fs.existsSync(yamlPath)) {
    fromYaml = (yaml.load(fs.readFileSync(yamlPath, 'utf8')) ?? {}) as Partial<ServiceConfig>
  }

  const port = Number(process.env['PORT']) || fromYaml.port || DEFAULTS.port
  const host = process.env['HOST'] ?? fromYaml.host ?? DEFAULTS.host
  const storePath = process.env['STORE_PATH'] ?? fromYaml.storePath ?? DEFAULTS.storePath
  const storeSecret = process.env['STORE_SECRET'] ?? fromYaml.storeSecret ?? ''
  const adminSecret = process.env['ADMIN_SECRET'] ?? fromYaml.adminSecret

  if (!storeSecret || storeSecret.length < 32) {
    throw new Error(
      'STORE_SECRET env var (or storeSecret in config.yml) must be at least 32 characters.',
    )
  }
  // This is the AES-256-GCM root for every credential and PII blob this service
  // stores, so it gets the same strength gate admin and admin-api already apply:
  // in production a placeholder / denylisted / low-entropy value throws rather
  // than silently encrypting with a guessable key (the shipped compose default
  // `change-me-…` is 40 chars and clears the length check above). Outside
  // production it warns and proceeds so `pnpm dev` is unaffected.
  assertSecret('STORE_SECRET', storeSecret)

  const dataStoreMode: DataStoreMode =
    parseMode(process.env['DATA_STORE_MODE']) ?? fromYaml.dataStore?.mode ?? DEFAULTS.dataStoreMode
  const dataStorePath =
    process.env['DATA_STORE_PATH'] ??
    fromYaml.dataStore?.path ??
    path.join(path.dirname(storePath), 'resources.db')
  const batchEvents =
    parseBool(process.env['DATA_STORE_EXTERNAL_BATCH_EVENTS']) ??
    fromYaml.dataStore?.external?.batchEvents
  const maxSizeMb = Number(process.env['DATA_STORE_MAX_SIZE_MB']) || fromYaml.dataStore?.maxSizeMb
  const autoSyncOnBoot =
    parseBool(process.env['DATA_STORE_AUTO_SYNC_ON_BOOT']) ??
    fromYaml.dataStore?.autoSyncOnBoot ??
    false
  const staleAfterSeconds =
    Number(process.env['DATA_STORE_STALE_AFTER_SECONDS']) || fromYaml.dataStore?.staleAfterSeconds
  const syncPageSize =
    Number(process.env['DATA_STORE_SYNC_PAGE_SIZE']) || fromYaml.dataStore?.syncPageSize

  return {
    port,
    host,
    storePath,
    // DATABASE_URL (when set) selects Postgres for BOTH families (one db,
    // table-namespaced); otherwise SQLite at the respective file paths.
    credDb: resolveDbConfig(process.env, { sqlitePath: storePath }),
    dataDb: resolveDbConfig(process.env, { sqlitePath: dataStorePath }),
    storeSecret,
    adminSecret,
    analytics: loadAnalyticsConfig(),
    destinations: loadDestinationsConfig(),
    license: loadLicenseConfig(storePath),
    rateLimitMax: Number(process.env['RATE_LIMIT_MAX']) || fromYaml.rateLimitMax,
    upstreamTimeoutMs:
      Number(process.env['UPSTREAM_TIMEOUT_MS']) || DEFAULTS.upstreamTimeoutMs,
    handlerTimeoutMs:
      Number(process.env['HANDLER_TIMEOUT_MS']) || DEFAULTS.handlerTimeoutMs,
    rateLimitWindowMs: Number(process.env['RATE_LIMIT_WINDOW_MS']) || fromYaml.rateLimitWindowMs,
    redisUrl: process.env['REDIS_URL'] ?? fromYaml.redisUrl,
    corsOrigin: parseCorsOrigin(process.env['CORS_ORIGIN']),
    trustProxy: parseTrustProxy(process.env['TRUST_PROXY']) ?? parseTrustProxy(fromYaml.trustProxy),
    webhooks: fromYaml.webhooks,
    openapi: fromYaml.openapi,
    dataStore: {
      mode: dataStoreMode,
      path: dataStorePath,
      external: batchEvents !== undefined ? { batchEvents } : undefined,
      maxSizeMb: maxSizeMb || undefined,
      autoSyncOnBoot,
      staleAfterSeconds: staleAfterSeconds || undefined,
      syncPageSize: syncPageSize || undefined,
    },
  }
}
