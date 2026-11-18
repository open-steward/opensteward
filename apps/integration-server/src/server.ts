/**
 * Unified OpenSteward server.
 *
 * Boots one Fastify app that serves:
 *   - Control plane (auth, connections, health) at the root, vertical-aware
 *     via `/auth/{vertical}/{platform}/...`
 *   - Per-vertical resource routes at `/v1/{vertical}/...`, mounted a second
 *     time behind the end-user middleware at `/v1/me/{vertical}/...`
 *   - Inbound platform webhooks and the sandbox (test-mode) surface.
 */
import {
  AdapterSettingsStore,
  ApiKeyStore,
  CircuitBreaker,
  ConnectSessionStore,
  CredentialStore,
  EndUserStore,
  HostInfoFetcher,
  TenantDomainFetcher,
  ResourceStore,
  SyncStore,
  SyncWorker,
  createAdminCacheRouter,
  createAdminSyncRouter,
  createDataStoreMetricsRouter,
  UnifiedAdapterRegistry,
  WebhookDeliveryStore,
  WebhookRetryWorker,
  WebhookSubscriptionStore,
  createBaseServer,
  registerIdempotency,
  createApiKeysAdminRouter,
  createConnectAdminRouter,
  createConnectionsDevRouter,
  createWebhookSubsDevRouter,
  OAuthClientStore,
  createAdminOAuthRouter,
  createConnectRouter,
  createCustomersRouter,
  createWebhookSubsAdminRouter,
  redisLimiter,
  setRateLimiter,
  redisRefreshLock,
  setRefreshLock,
  RuntimeSettingsClient,
  SETTING,
  DEFAULT_SYNC_INTERVAL_MINUTES,
  createSyncStateResolver,
  type RateLimitConfigSource,
  type McpEnabledSource,
  EndUserTokenStore,
  createUnifiedEndUserAuthMiddleware,
  createEndUserRouter,
  createEndUserTokensAdminRouter,
  createUnifiedAdminPlatformsRouter,
  createUnifiedAuthMiddleware,
  createUnifiedAuthRouter,
  createUnifiedConnectionsRouter,
  createUnifiedHealthRouter,
  createVersionRouter,
  createUnifiedPlatformsRouter,
  createUnifiedWebhooksRouter,
  InboundEventStore,
  createWebhookConsumer,
  createInboundEventsRouter,
  createSandboxAuthMiddleware,
  createSandboxMetaRouter,
  createSandboxSyncRouter,
  createSandboxKeysRouter,
  createSandboxControlPlaneRouter,
  createSandboxAuthRouter,
  createSandboxOidcRouter,
  createMockIssuerKeys,
  SANDBOX_ISSUER_PATH,
  resolvePublicBaseUrl,
  requireTenantKey,
  requireEndUserToken,
  type ConnectionWriteGuard,
  adminGuard,
  SandboxStore,
  SandboxNotFoundError,
  SandboxQuotaError,
  wellKnownAcmePlugin,
  mergeServerVariables,
  type OpenApiServerVariable,
  type PlatformEntry,
  type WebhookHandler,
  type UnsupportedPlatform,
} from '@opensteward/shared'
import { dirname, join } from 'node:path'
import axios from 'axios'
import { createNormalizerVersion } from './normalizer-version'
import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'
import { designSystemRoot } from '@opensteward/design-system'
import staticPlugin from '@fastify/static'
import { readFileSync } from 'fs'
import { resolve as resolvePath } from 'path'
import { PLATFORMS as ACCOUNTING_PLATFORMS } from './verticals/accounting/platforms/metadata'
import { PLATFORMS as CRM_PLATFORMS } from './verticals/crm/platforms/metadata'
import { PLATFORMS as ECOMMERCE_PLATFORMS } from './verticals/ecommerce/platforms/metadata'
import { PLATFORMS as LOGISTICS_PLATFORMS } from './verticals/logistics/platforms/metadata'
import { PLATFORMS as PAYMENTS_PLATFORMS } from './verticals/payments/platforms/metadata'
import { PLATFORMS as DOCSIGN_PLATFORMS } from './verticals/docsign/platforms/metadata'
import { PLATFORMS as PROJECTS_PLATFORMS } from './verticals/projects/platforms/metadata'
import { PLATFORMS as CS_PLATFORMS } from './verticals/customer-support/platforms/metadata'
import { PLATFORMS as INV_PLATFORMS } from './verticals/inventory/platforms/metadata'
// Curated per-platform OAuth scopes (read-only + full catalog), merged into the
// platform metadata below so the Connect Link read-only policy + admin scope
// picker have data without bloating the hand-maintained metadata files.
import {
  READ_SCOPES as ACC_READ,
  RECOMMENDED_SCOPES_EXTRA as ACC_REC,
} from './verticals/accounting/platforms/read-scopes.generated'
import {
  READ_SCOPES as CRM_READ,
  RECOMMENDED_SCOPES_EXTRA as CRM_REC,
} from './verticals/crm/platforms/read-scopes.generated'
import {
  READ_SCOPES as ECOM_READ,
  RECOMMENDED_SCOPES_EXTRA as ECOM_REC,
} from './verticals/ecommerce/platforms/read-scopes.generated'
import {
  READ_SCOPES as LOG_READ,
  RECOMMENDED_SCOPES_EXTRA as LOG_REC,
} from './verticals/logistics/platforms/read-scopes.generated'
import {
  READ_SCOPES as PAY_READ,
  RECOMMENDED_SCOPES_EXTRA as PAY_REC,
} from './verticals/payments/platforms/read-scopes.generated'
import {
  READ_SCOPES as DOC_READ,
  RECOMMENDED_SCOPES_EXTRA as DOC_REC,
} from './verticals/docsign/platforms/read-scopes.generated'
import {
  READ_SCOPES as PRO_READ,
  RECOMMENDED_SCOPES_EXTRA as PRO_REC,
} from './verticals/projects/platforms/read-scopes.generated'
import {
  READ_SCOPES as CS_READ,
  RECOMMENDED_SCOPES_EXTRA as CS_REC,
} from './verticals/customer-support/platforms/read-scopes.generated'
import {
  READ_SCOPES as INV_READ,
  RECOMMENDED_SCOPES_EXTRA as INV_REC,
} from './verticals/inventory/platforms/read-scopes.generated'
import { WEBHOOK_HANDLERS as ACCOUNTING_WEBHOOKS } from './verticals/accounting/webhooks'
import { WEBHOOK_HANDLERS as CRM_WEBHOOKS } from './verticals/crm/webhooks'
import { WEBHOOK_HANDLERS as ECOMMERCE_WEBHOOKS } from './verticals/ecommerce/webhooks'
import { WEBHOOK_HANDLERS as LOGISTICS_WEBHOOKS } from './verticals/logistics/webhooks'
import { WEBHOOK_HANDLERS as PAYMENTS_WEBHOOKS } from './verticals/payments/webhooks'
import { WEBHOOK_HANDLERS as DOCSIGN_WEBHOOKS } from './verticals/docsign/webhooks'
import { WEBHOOK_HANDLERS as PROJECTS_WEBHOOKS } from './verticals/projects/webhooks'
import { WEBHOOK_HANDLERS as CS_WEBHOOKS } from './verticals/customer-support/webhooks'
import { WEBHOOK_HANDLERS as INV_WEBHOOKS } from './verticals/inventory/webhooks'
import type { ServiceConfig } from './config'
import { createSandboxAdapter } from './sandbox/adapter'
import { SANDBOX_VERTICALS, sandboxSpecsFor } from './sandbox/manifest'
import { createSandboxSyncSimulator } from './sandbox/simulate-sync'
import {
  buildAccountingRegistry,
  createAccountingPlugin,
  VERTICAL as ACCOUNTING_VERTICAL,
} from './verticals/accounting'
import { buildCrmRegistry, createCrmPlugin, VERTICAL as CRM_VERTICAL } from './verticals/crm'
import {
  buildEcommerceRegistry,
  createEcommercePlugin,
  VERTICAL as ECOMMERCE_VERTICAL,
} from './verticals/ecommerce'
import {
  buildLogisticsRegistry,
  createLogisticsPlugin,
  VERTICAL as LOGISTICS_VERTICAL,
} from './verticals/logistics'
import {
  buildPaymentsRegistry,
  createPaymentsPlugin,
  VERTICAL as PAYMENTS_VERTICAL,
} from './verticals/payments'
import {
  buildDocsignRegistry,
  createDocsignPlugin,
  VERTICAL as DOCSIGN_VERTICAL,
} from './verticals/docsign'
import {
  buildProjectsRegistry,
  createProjectsPlugin,
  VERTICAL as PROJECTS_VERTICAL,
} from './verticals/projects'
import {
  buildSupportRegistry,
  createSupportPlugin,
  VERTICAL as CS_VERTICAL,
} from './verticals/customer-support'
import {
  buildInventoryRegistry,
  createInventoryPlugin,
  VERTICAL as INV_VERTICAL,
} from './verticals/inventory'
import { TokenRefresher as AccountingTokenRefresher } from './verticals/accounting/sync/token-refresher'
import { TokenRefresher as CrmTokenRefresher } from './verticals/crm/sync/token-refresher'
import { TokenRefresher as EcommerceTokenRefresher } from './verticals/ecommerce/sync/token-refresher'
import { TokenRefresher as LogisticsTokenRefresher } from './verticals/logistics/sync/token-refresher'
import { TokenRefresher as PaymentsTokenRefresher } from './verticals/payments/sync/token-refresher'
import { TokenRefresher as DocsignTokenRefresher } from './verticals/docsign/sync/token-refresher'
import { TokenRefresher as ProjectsTokenRefresher } from './verticals/projects/sync/token-refresher'
import { TokenRefresher as SupportTokenRefresher } from './verticals/customer-support/sync/token-refresher'
import { TokenRefresher as InventoryTokenRefresher } from './verticals/inventory/sync/token-refresher'
import { createRefreshResource } from './webhooks/refresh-resource'
import { WEBHOOK_REFRESH_MAP as PAYMENTS_REFRESH_MAP } from './verticals/payments/sync/webhook-refresh-map'
import { WEBHOOK_REFRESH_MAP as ACCOUNTING_REFRESH_MAP } from './verticals/accounting/sync/webhook-refresh-map'
import { LISTABLE_RESOURCES as ACCOUNTING_LISTABLES } from './verticals/accounting/sync/listable-resources'
import { LISTABLE_RESOURCES as CRM_LISTABLES } from './verticals/crm/sync/listable-resources'
import { LISTABLE_RESOURCES as ECOMMERCE_LISTABLES } from './verticals/ecommerce/sync/listable-resources'
import { LISTABLE_RESOURCES as LOGISTICS_LISTABLES } from './verticals/logistics/sync/listable-resources'
import { LISTABLE_RESOURCES as PAYMENTS_LISTABLES } from './verticals/payments/sync/listable-resources'
import { LISTABLE_RESOURCES as DOCSIGN_LISTABLES } from './verticals/docsign/sync/listable-resources'
import { LISTABLE_RESOURCES as PROJECTS_LISTABLES } from './verticals/projects/sync/listable-resources'
import { LISTABLE_RESOURCES as CS_LISTABLES } from './verticals/customer-support/sync/listable-resources'
import { LISTABLE_RESOURCES as INV_LISTABLES } from './verticals/inventory/sync/listable-resources'
import { startDataStoreMaintenance } from './data-store-maintenance'
import { createDataAccessRouter } from './data-access/router'
import { createDestinationsRouter } from './data-access/destinations-router'
import {
  UNCLASSIFIED,
  getClassification,
  listableResources,
} from './data-access/classification-registry'
import {
  DestinationStore,
  DestinationWorker,
  createHostGuard,
  createSink,
  type SinkFactory,
} from '@opensteward/destinations'
import { deriveMaskKey } from '@opensteward/shared'
import { AnalyticsService } from './analytics/provisioner'
import { createAnalyticsRouter } from './analytics/router'
import { RefreshKeepAliveWorker } from './workers/refresh-keep-alive-worker'
import { SyncScheduler } from './workers/sync-scheduler'
import { unavailableReasonResolver } from './workers/unavailable-reasons'
import { attachAdapterErrorHandler, emitTenantEvent, openDb, type DbHandle } from '@opensteward/shared'
import { LicenseManager, LicenseStateStore, featureRefusal } from '@opensteward/shared/licensing'
import {
  ConnectionLicenseGuard,
  createAdminLicenseRouter,
  createCapabilitiesRouter,
  createVerticalLicenseGate,
} from './licensing'

export interface BuildServerResult {
  fastify: Awaited<ReturnType<typeof createBaseServer>>
  store: CredentialStore
  registry: UnifiedAdapterRegistry
  /** Developer API keys. Exposed so tests can mint one without a second store. */
  apiKeys: ApiKeyStore
  /** Issuers + registered clients for OIDC bearer tokens on /v1/*. */
  oauthClients: OAuthClientStore
  /** Started by the bootstrapper after fastify.listen(); stop on shutdown. */
  webhookWorker: WebhookRetryWorker
  /** Resource cache (one shared instance, undefined in passthrough mode). */
  resourceStore?: ResourceStore
  /**
   * Identifies the normalizer that produced a cached record. Exposed because
   * anything seeding the cache directly — a test, a migration, an operator
   * tool — has to stamp the same version the readers require, or its rows are
   * correctly ignored.
   */
  normalizerVersion: (vertical: string, platform: string) => string
  /** Per-vertical sync workers; the bootstrapper starts/stops them. */
  syncWorkers: Array<{ start(): void | Promise<void>; stop(): Promise<void> }>
  /** Enqueues the syncs each connection's schedule says are due. Undefined in
   *  passthrough mode. Start after the sync workers; stop on shutdown. */
  syncScheduler?: { start(): void; stop(): Promise<void> }
  /** Background cleanup timer (sync_jobs gc + size monitoring). Stop on shutdown. */
  dataStoreMaintenance?: { stop(): void }
  /** Daily refresh-keep-alive worker. Stop on shutdown. */
  refreshKeepAliveWorker?: { start(): void; stop(): void }
  /**
   * Destination export scheduler. Undefined in passthrough mode or with
   * `DESTINATIONS_WORKER=off`. Start after the sync workers; stop on shutdown.
   */
  destinationWorker?: { start(): void; stop(): Promise<void> }
  /** The license (D-A). Its hourly tick and directory watch stop on fastify.close(). */
  license: LicenseManager
  /** Close the shared DbHandle(s). Call on shutdown after fastify.close(). */
  closeStores: () => Promise<void>
}

export async function buildServer(config: ServiceConfig): Promise<BuildServerResult> {
  // Construct the optional Redis client BEFORE createBaseServer so we
  // can hand it to @fastify/rate-limit as well as to our per-API-key
  // limiter. Lazy import keeps single-replica deploys ioredis-free.
  let rateLimitRedis: import('ioredis').Redis | undefined
  if (config.redisUrl) {
    const RedisMod = await import('ioredis')
    const RedisCtor = (
      RedisMod as unknown as {
        default: new (url: string, opts?: Record<string, unknown>) => import('ioredis').Redis
      }
    ).default
    rateLimitRedis = new RedisCtor(config.redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: false,
    })
  }

  // Ceiling on every upstream platform call, installed BEFORE the first
  // adapter client is constructed.
  //
  // 592 of the 1,545 adapter clients call `axios.create()` with no `timeout`,
  // Xero's among them, so a platform that accepts the connection and goes
  // quiet blocks that request forever. `withRetry` does not save it: the retry
  // count is bounded but each of the five attempts is not, so the total is
  // still unbounded. That is what produced a silent four-minute void with no
  // status, no error and no log line, twice, at two different endpoints.
  //
  // Set on the axios DEFAULT rather than in each client: `axios.create()`
  // merges the defaults present at creation time, and adapters build their
  // client per request, so this reaches all 592 without touching them.
  // An adapter that sets its own `timeout` explicitly still wins — the 789
  // that do are deliberately left alone.
  if (config.upstreamTimeoutMs && config.upstreamTimeoutMs > 0) {
    axios.defaults.timeout = config.upstreamTimeoutMs
  }

  const fastify = await createBaseServer({
    rateLimitMax: config.rateLimitMax,
    rateLimitWindow: config.rateLimitWindowMs,
    // Outer bound on everything, including stalls the upstream timeout cannot
    // see (a lock, a pagination loop, a bug in our own code).
    handlerTimeoutMs: config.handlerTimeoutMs,
    // Off unless the deployment names its origins (CORS_ORIGIN). docs-server's
    // Swagger console lives on another origin, so without this every "Try it
    // out" is blocked by the browser before it reaches us.
    corsOrigin: config.corsOrigin,
    // Honour X-Forwarded-* when behind a TLS-terminating reverse proxy
    // (Caddy, Traefik, nginx). OFF by default: trusting the header
    // unconditionally would let a client set its own X-Forwarded-For and
    // spoof `request.ip`, defeating every IP-keyed rate limit. Operators
    // behind a proxy set TRUST_PROXY (a CIDR list is safer than `true`;
    // hop counts are refused, see parseTrustProxy); emitting the
    // customer-facing redirect_uri host then needs that or PUBLIC_BASE_URL.
    trustProxy: config.trustProxy ?? false,
    // Multi-replica: share the per-IP bucket across instances. Without
    // this each replica counts independently and an attacker's effective
    // budget multiplies by the replica count.
    rateLimitRedis,
    // admin-api reaches us from one container IP with no X-Forwarded-For, so
    // without this every operator's every admin page view shares a single
    // per-IP bucket — the stack throttles its own UI. Traffic holding the
    // deployment secret is already authenticated by adminGuard; anonymous
    // traffic stays limited.
    rateLimitAllowSecret: config.adminSecret,
  })

  // The ONLY error handler on the live surface. Registered at the root so it
  // covers every `/v1/*` vertical route; the sandbox mount registers its own
  // handler on its own scope, and Fastify's nearest-handler rule leaves that
  // one in charge there.
  //
  // Without this, an unhandled adapter throw reached Fastify's default handler,
  // which replies with `err.statusCode || err.status` — and axios sets `.status`
  // from the UPSTREAM response. Fortnox rejecting a request became a 400 from
  // us, telling the caller THEY sent something wrong.
  attachAdapterErrorHandler(fastify)

  // Idempotency-Key honoured on POST/PATCH/PUT/DELETE. Multi-replica deploys
  // share the cache via Redis; single-replica falls back to in-memory.
  registerIdempotency(fastify, rateLimitRedis)

  if (rateLimitRedis) {
    rateLimitRedis.on('error', (err: unknown) =>
      fastify.log.warn({ err }, 'redis rate-limit client error'),
    )
  }

  // Single credential store. Holds connections from every vertical; each
  // row carries its own `vertical` column so cross-vertical lookups stay
  // isolated (e.g. bexio in accounting vs bexio in crm).
  // One DbHandle (SQLite or Postgres per config.credDb) shared by the whole
  // credential-store family; the boot layer owns it and closes it on shutdown.
  const credHandle = await openDb({
    databaseUrl: config.credDb.databaseUrl,
    sqlitePath: config.credDb.sqlitePath,
    poolMax: config.credDb.poolMax,
  })
  const store = await CredentialStore.create(credHandle, config.storeSecret)

  // ── License: integration-server is the only process that reads it (D-A) ──
  // Evaluated before any route is registered, so every gate below sees it.
  // Nothing here can fail the boot: a missing or broken license, or a failed
  // clock-state migration, runs in community mode with a logged reason.
  let licenseState: LicenseStateStore | undefined
  try {
    licenseState = await LicenseStateStore.create(credHandle)
  } catch (err) {
    fastify.log.error(
      { err },
      'license: clock-rollback state unavailable; continuing without rollback protection',
    )
  }
  const license = await LicenseManager.create({
    // Absolute, like loadLicenseConfig's: a hand-built config may carry a relative storePath.
    config: config.license ?? { filePath: resolvePath(dirname(config.storePath), 'license.key') },
    stateStore: licenseState,
    logger: {
      info: (msg, fields) => fastify.log.info(fields ?? {}, msg),
      warn: (msg, fields) => fastify.log.warn(fields ?? {}, msg),
      error: (msg, fields) => fastify.log.error(fields ?? {}, msg),
    },
  })
  license.start()
  fastify.addHook('onClose', () => license.stop())

  // ── License enforcement on connections (P5/P6) ───────────────────────────
  // The create guard is the authority: every create path funnels through
  // CredentialStore.create. The write gate keeps connections beyond the limit
  // readable but read-only. The cached allow-list drops on every local create
  // or delete and on any license change; a refusal is always re-checked fresh.
  const connectionGuard = new ConnectionLicenseGuard({ store, license })
  store.setCreateGuard((intent) => connectionGuard.assertCanCreate(intent.vertical))
  store.onCreate(() => connectionGuard.invalidate())
  store.onDelete(() => connectionGuard.invalidate())
  license.onChange(() => connectionGuard.invalidate())
  const connectionWriteGuard: ConnectionWriteGuard = async (connectionId) =>
    (await connectionGuard.writeRefusal(connectionId))?.toBody().error ?? null
  const assertCanCreateConnection = (vertical: string): Promise<void> =>
    connectionGuard.assertCanCreate(vertical)
  const verticalGate = createVerticalLicenseGate(license)

  // Single adapter-settings store — one row per (vertical, slug) so colliding
  // slugs (e.g. bexio in accounting + crm) get distinct enabled/config rows.
  const settingsStore = await AdapterSettingsStore.create(credHandle, config.storeSecret, {
    salt: 'opensteward-adapter-settings',
  })

  // Connect-link end-users (external customers). Encrypted PII at rest.
  const endUsers = await EndUserStore.create(credHandle, config.storeSecret)
  // Connect-link sessions (the tokenised email landing pages).
  const connectSessions = await ConnectSessionStore.create(credHandle)
  // Tenant-scoped developer API keys for the public /v1/customers + /v1/{vertical}/* surface.
  const apiKeys = await ApiKeyStore.create(credHandle, config.storeSecret)
  // Issuers and registered clients for OIDC bearer tokens on the same
  // surface. Holds no secret — a resource server verifies with the issuer's
  // published public keys — so it takes no store secret.
  const oauthClients = await OAuthClientStore.create(credHandle)
  // Signing key for the sandbox test issuer (/test/oidc). In memory only: a
  // restart invalidates every test token, which for a one-hour credential
  // minted for rehearsal is the right trade.
  const sandboxIssuerKeys = await createMockIssuerKeys()
  // End-user tokens (eut_*) for the /v1/me/* AI-agent surface.
  const endUserTokens = await EndUserTokenStore.create(credHandle, config.storeSecret)
  // Boot-time scope normalisation: any key with a vertical touch scope but
  // neither `*` nor `vertical:write` gets `vertical:write` appended
  // (idempotent — the `v_write_migrated_at` marker skips every row it has
  // already processed).
  const writeMigration = await apiKeys.migrateVerticalWriteScopes()
  if (writeMigration.upgraded > 0) {
    fastify.log.info(
      `api-keys: added missing 'vertical:write' scope to ${writeMigration.upgraded} key(s). Skipped ${writeMigration.skipped}.`,
    )
  }
  // Outbound webhook subscriptions per tenant.
  const webhookSubs = await WebhookSubscriptionStore.create(credHandle, config.storeSecret)
  // Durable queue + retry state for webhook deliveries.
  // Slug → display name for the human-readable webhook formats (Slack, Teams).
  // The map is filled once the platform catalogue is assembled below; the
  // resolver closes over it rather than over `platforms` so a delivery that
  // fires mid-boot reads an empty map instead of hitting a temporal dead zone.
  // Unresolved slugs render as the slug, which is correct if less pretty.
  const platformDisplayNames = new Map<string, string>()
  const resolvePlatformName = (slug: string): string | undefined => platformDisplayNames.get(slug)
  // (vertical:slug) → unsupported-platform info + display name, for the auth
  // and admin-platforms routers, both of which are registered before the
  // merged `platforms` array is assembled below. Same closure-over-a-map
  // pattern as `platformDisplayNames` just above: the resolver is handed to
  // `createUnifiedAuthRouter`/`createUnifiedAdminPlatformsRouter` now, and the
  // map is filled once the catalogue is built, before any request can arrive.
  const unsupportedByKey = new Map<string, UnsupportedPlatform & { name?: string }>()
  const resolveUnsupported = (
    vertical: string,
    slug: string,
  ): (UnsupportedPlatform & { name?: string }) | undefined => unsupportedByKey.get(`${vertical}:${slug}`)

  const webhookDeliveries = await WebhookDeliveryStore.create(credHandle)
  // Canonical stream + idempotency ledger for verified INBOUND platform events.
  const inboundEvents = await InboundEventStore.create(credHandle)
  // Sandbox storage lives on the credential handle, not the data handle: the
  // latter is only opened when `dataStoreMode !== 'passthrough'`, and test mode
  // has to work in every deployment shape.
  const sandboxStore = await SandboxStore.create(credHandle)

  // Per-API-key rate limit backend. Reuses the redis client we built
  // above for @fastify/rate-limit so both buckets share one connection.
  if (rateLimitRedis) {
    setRateLimiter(
      redisLimiter(rateLimitRedis, {
        onError: (err) =>
          fastify.log.warn({ err }, 'redis rate-limit consume failed; failing open'),
      }),
    )
    fastify.log.info({ redisUrl: config.redisUrl }, 'rate-limit backend: redis')
    // Cross-replica refresh lock on the same client — prevents two pods from
    // refreshing the same connection's (rotating) token concurrently, which
    // would mark the loser's connection wrongly expired.
    setRefreshLock(
      redisRefreshLock(rateLimitRedis, {
        onError: (err) => fastify.log.warn({ err }, 'redis refresh-lock op failed; failing open'),
      }),
    )
    fastify.log.info('refresh-lock backend: redis')
  } else {
    fastify.log.info('rate-limit backend: in-memory (single-process)')
    fastify.log.info('refresh-lock backend: in-process (single-replica)')
  }

  // Cached fetcher for the host's public branding (admin-api). 60s TTL
  // covers the Connect Link page without putting load on admin-api.
  const hostInfo = new HostInfoFetcher({
    adminApiUrl: process.env['ADMIN_API_URL'],
    cacheMs: 60_000,
  })

  // Custom domain → tenant resolver. Same 60 s cached-fetch pattern as
  // hostInfo; falls back to the 'default' tenant when a host isn't mapped or
  // admin-api is unreachable, so deployments without custom domains are
  // unaffected.
  const tenantDomains = new TenantDomainFetcher({
    adminApiUrl: process.env['ADMIN_API_URL'],
    cacheMs: 60_000,
  })
  // Resolve the incoming Host to a tenant before routing/auth. Stored as a
  // distinct property (NOT request.tenantId, which the API-key middleware sets)
  // so the two can be cross-checked in auth.
  //
  // Probes skip it: the lookup asks admin-api, and compose starts admin-api
  // only once this service's /health passes, so a probe that waited on
  // admin-api could never pass (tests/integration/health-admin-api-down.test.ts).
  const PROBE_PATH = /^\/(?:health|version)(?:[/?]|$)/
  fastify.addHook('onRequest', async (request) => {
    if (PROBE_PATH.test(request.url)) return
    ;(request as { hostTenantId?: string }).hostTenantId = await tenantDomains.resolve(
      request.hostname,
    )
  })

  // Runtime-tunable settings (admin-configurable). 60 s TTL cache; reads
  // fall back to .env / hard-coded defaults when admin-api is unreachable
  // or when a key hasn't been seeded. The inventory lives in admin-api's
  // runtime-settings-store.ts.
  const runtimeSettings = new RuntimeSettingsClient({
    adminApiUrl: process.env['ADMIN_API_URL'] ?? null,
    // Without this the poll is unauthenticated and admin-api answers 401 every
    // minute, so operator-tuned rate limits and feature flags never arrive.
    serviceSecret: process.env['SERVICE_SECRET'] ?? null,
    ttlMs: 60_000,
    logger: { warn: (msg, err) => fastify.log.warn({ err }, `[runtime-settings] ${msg}`) },
  })
  await runtimeSettings.start()

  // Best-effort audit forwarding: connection lifecycle events happen in THIS
  // process (OAuth callback, credential form, dev delete), but the audit
  // trail lives in admin-api's database — so the events are forwarded over
  // the same service-secret channel the settings poll uses; a missing
  // URL or secret, or a down admin-api, silently skips (an audit forwarder
  // must never break a connection operation).
  {
    const adminApiUrl = (process.env['ADMIN_API_URL'] ?? '').replace(/\/+$/, '')
    const serviceSecret = process.env['SERVICE_SECRET'] ?? ''
    const forwardAudit = (
      action: 'connection.create' | 'connection.delete',
      info: { id: string; platform: string; vertical: string | null; tenantId: string | null },
    ): void => {
      if (!adminApiUrl || !serviceSecret) return
      void fetch(`${adminApiUrl}/api/internal/audit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-service-secret': serviceSecret,
        },
        body: JSON.stringify({
          action,
          targetId: info.id,
          vertical: info.vertical,
          detail: { platform: info.platform, tenantId: info.tenantId },
        }),
      }).catch((err) => fastify.log.debug({ err }, 'audit forward failed'))
    }
    store.onCreate((row) => forwardAudit('connection.create', row))
    store.onDelete((row) =>
      forwardAudit('connection.delete', {
        id: row.id,
        platform: row.platform,
        vertical: row.vertical ?? null,
        tenantId: row.tenantId ?? null,
      }),
    )
  }

  // Cache-invalidation webhook the admin-api hits on save. Without this,
  // edits take up to 60 s (TTL) to apply — fine for steady state but
  // confusing during interactive operator changes. Admin-secret-gated
  // so only the trusted admin-api can poke it.
  fastify.post('/internal/runtime-settings/refresh', async (request, reply) => {
    const adminSecret = process.env['ADMIN_SECRET']
    const provided = (request.headers['x-admin-secret'] ?? '') as string
    if (adminSecret && provided !== adminSecret) {
      return reply.status(401).send({ error: { code: 'UNAUTHENTICATED' } })
    }
    try {
      await runtimeSettings.refresh()
      return { status: 'ok' }
    } catch (err) {
      fastify.log.warn({ err }, '[runtime-settings] refresh webhook failed')
      return reply.status(500).send({ error: { code: 'REFRESH_FAILED' } })
    }
  })

  // Per-request resolver: live-reads the budget from the cache, branches
  // on `mcp:read` scope so MCP traffic gets its own (configurable) bucket.
  // Falls back to the .env-tier defaults if the cache is cold or the
  // admin DB hasn't been seeded yet.
  const envApiKeyMax = numericEnv('RATE_LIMIT_MAX') ?? 600
  const envApiKeyWindow = numericEnv('RATE_LIMIT_WINDOW_MS') ?? 60_000
  const envMcpTenantMax = numericEnv('RATE_LIMIT_MCP_TENANT_PER_MIN') ?? envApiKeyMax
  const envMcpEndUserMax = numericEnv('RATE_LIMIT_MCP_END_USER_PER_MIN') ?? 60
  const apiKeyRateLimitResolver: RateLimitConfigSource = (request) => {
    const scopes = (request as unknown as { apiKeyScopes?: string[] }).apiKeyScopes ?? []
    const isMcp = scopes.includes('mcp:read')
    return {
      max: isMcp
        ? runtimeSettings.getNumber(SETTING.RATE_LIMIT_MCP_TENANT_PER_MIN, envMcpTenantMax)
        : runtimeSettings.getNumber(SETTING.RATE_LIMIT_API_KEY_PER_MIN, envApiKeyMax),
      windowMs: runtimeSettings.getNumber(SETTING.RATE_LIMIT_API_KEY_WINDOW_MS, envApiKeyWindow),
    }
  }

  // End-user mode resolver. Bucket is keyed on `end_user:<id>` (set in
  // the middleware), so the budget here is per-end-user, not per-token.
  const endUserRateLimitResolver: RateLimitConfigSource = () => ({
    max: runtimeSettings.getNumber(SETTING.RATE_LIMIT_MCP_END_USER_PER_MIN, envMcpEndUserMax),
    windowMs: runtimeSettings.getNumber(SETTING.RATE_LIMIT_API_KEY_WINDOW_MS, envApiKeyWindow),
  })

  // Public /connect/{token} surface — unauthenticated, so the budget is keyed
  // on client IP inside the router. This is the brute-force-token-guessing
  // guard behind the `rate_limit.connect_link.per_minute` setting.
  const connectLinkRateLimitResolver: RateLimitConfigSource = () => ({
    max: runtimeSettings.getNumber(SETTING.RATE_LIMIT_CONNECT_LINK_PER_MIN, 30),
    windowMs: 60_000,
  })

  // Deployment defaults for newly minted Connect Links, applied by the
  // creation routers only when the request leaves the field unset.
  const connectLinkDefaults = () => ({
    expiryHours: runtimeSettings.getNumber(SETTING.CONNECT_LINK_DEFAULT_EXPIRY_HOURS, 72),
    oneTimeDefault: runtimeSettings.getBoolean(SETTING.CONNECT_LINK_ONE_TIME_DEFAULT, false),
  })
  // Emergency kill switch for AI-agent traffic AND the license's `mcp` feature
  // (P10): the setting can switch MCP off, never on. Both are read per request
  // (not once at boot), so an operator flipping `features.mcp_enabled` in the
  // admin UI takes effect on the next settings poll, and a license change
  // applies without a redeploy. A refusal names which of the two said no.
  const mcpEnabledResolver: McpEnabledSource = () => {
    if (!runtimeSettings.getBoolean(SETTING.FEATURES_MCP_ENABLED, true)) return false
    const entitlements = license.entitlements()
    if (entitlements.has('mcp')) return true
    const { code, message } = featureRefusal(entitlements.status(), 'mcp')
    return { code, message }
  }

  // Whether a vertical's upstream payload may be kept. Off by default for the
  // two verticals whose payload carries financial identifiers the canonical
  // schema does not expose; every other vertical is unaffected. Read per
  // request, so an operator's flip lands on the next settings poll.
  const rawPayloadEnabled = (vertical: string): boolean => {
    if (vertical === 'payments') {
      return runtimeSettings.getBoolean(SETTING.DATA_STORE_RAW_PAYLOAD_PAYMENTS, false)
    }
    if (vertical === 'accounting') {
      return runtimeSettings.getBoolean(SETTING.DATA_STORE_RAW_PAYLOAD_ACCOUNTING, false)
    }
    return true
  }

  // Identifies the normalizer that produced a cached record, so a transform
  // change invalidates exactly the rows it affects. Resolved from this
  // module's own location so it works against `dist/` in the container and
  // `src/` under vitest.
  const normalizerVersion = createNormalizerVersion({
    verticalsDir: join(__dirname, 'verticals'),
    onError: (vertical, platform, err) =>
      fastify.log.warn(
        { vertical, platform, err },
        'could not fingerprint the normalizer; falling back to the deploy id',
      ),
  })

  // Which developer credentials this deployment accepts. Read per request for
  // the same reason as the MCP kill switch: an operator turning one off wants
  // it to take effect on the next settings poll, not on the next deploy.
  // Neither gates `X-Admin-Secret`, which is the operator path back in.
  // Each falls back to an .env-tier default when the settings cache is cold or
  // the admin DB has not been seeded — the same layering the rate limits use.
  // That is also how a deployment provisioned from infrastructure-as-code turns
  // OAuth on from first boot, before anyone has opened the admin UI.
  const envApiKeysEnabled = process.env['AUTH_DEV_API_KEYS_ENABLED'] !== '0'
  const envOauthEnabled = process.env['AUTH_DEV_OAUTH_ENABLED'] === '1'
  const apiKeysEnabledResolver = (): boolean =>
    runtimeSettings.getBoolean(SETTING.AUTH_DEV_API_KEYS_ENABLED, envApiKeysEnabled)
  const oauthEnabledResolver = (): boolean =>
    runtimeSettings.getBoolean(SETTING.AUTH_DEV_OAUTH_ENABLED, envOauthEnabled)

  // Resolver used by the auth + connect routers when they need to emit
  // an absolute URL (OAuth redirect_uri, link URL, etc.). Pulls the host's
  // operator-set baseUrl from the cached company-info subset.
  const getCompanyBaseUrl = async (): Promise<string | null> => (await hostInfo.get()).baseUrl

  // Unified registry. Each vertical's AdapterRegistry registers itself in
  // the buildXRegistry helpers below.
  const registry = new UnifiedAdapterRegistry()

  // Per-vertical adapter registries. Each call hydrates from the settings
  // store and registers itself in the unified registry.
  const accountingRegistry = buildAccountingRegistry({ unifiedRegistry: registry, settingsStore })
  const crmRegistry = buildCrmRegistry({ unifiedRegistry: registry, settingsStore })
  const ecommerceRegistry = buildEcommerceRegistry({ unifiedRegistry: registry, settingsStore })
  const logisticsRegistry = buildLogisticsRegistry({ unifiedRegistry: registry, settingsStore })
  const paymentsRegistry = buildPaymentsRegistry({ unifiedRegistry: registry, settingsStore })
  const docsignRegistry = buildDocsignRegistry({ unifiedRegistry: registry, settingsStore })
  const projectsRegistry = buildProjectsRegistry({ unifiedRegistry: registry, settingsStore })
  const supportRegistry = buildSupportRegistry({ unifiedRegistry: registry, settingsStore })
  const inventoryRegistry = buildInventoryRegistry({ unifiedRegistry: registry, settingsStore })

  // The deployment sync interval, read per call so an admin's change applies
  // within one settings poll. Shared by the scheduler and the connection API's
  // "next sync", which must agree.
  const syncDefaultIntervalMinutes = (): number =>
    runtimeSettings.getNumber(
      SETTING.DATA_STORE_SYNC_DEFAULT_INTERVAL_MINUTES,
      DEFAULT_SYNC_INTERVAL_MINUTES,
    )

  // Data-store layer. When `mode != passthrough`, open one shared SQLite
  // file (`resources.db` next to credentials.db) and instantiate one
  // ResourceStore + one SyncStore + one SyncWorker per vertical, all
  // sharing the same DB handle. In `passthrough` mode, none of this runs
  // and the vertical plugins behave as a thin live proxy.
  const dataStoreMode = config.dataStore.mode
  let resourceStore: ResourceStore | undefined
  let syncStore: SyncStore | undefined
  let dataHandle: DbHandle | undefined
  let dataStoreMaintenance: { stop(): void } | undefined
  const syncWorkers: Array<{ start(): void | Promise<void>; stop(): Promise<void> }> = []
  let syncScheduler: SyncScheduler | undefined

  if (dataStoreMode !== 'passthrough') {
    const resourcePath = config.dataStore.path!
    // Separate DbHandle for the data-store (its own SQLite file; same Postgres
    // db as the credential family when DATABASE_URL is set).
    dataHandle = await openDb({
      databaseUrl: config.dataDb.databaseUrl,
      sqlitePath: config.dataDb.sqlitePath,
      poolMax: config.dataDb.poolMax,
    })
    resourceStore = await ResourceStore.create(dataHandle, { rawPayloadEnabled })
    syncStore = await SyncStore.create(dataHandle)
    // Fill `changed_at` on rows written before it existed. Reads already treat
    // NULL as `updated_at`, so boot does not wait on this; it only makes the
    // change index usable for `changesSince`.
    void resourceStore
      .backfillChangedAt()
      .then((n) => {
        if (n > 0) fastify.log.info(`data-store: backfilled changed_at on ${n} row(s)`)
      })
      .catch((err: unknown) => {
        fastify.log.warn(
          { err },
          'data-store: changed_at backfill failed; reads fall back to updated_at',
        )
      })
    fastify.log.info(`data-store mode: ${dataStoreMode}, path: ${resourcePath}`)

    // Cascade: when a connection is deleted, drop its cached resource rows
    // and its sync-job history. Fires from both delete paths — the admin
    // route and the developer-facing DELETE /v1/connections/:id.
    store.onDelete(async (row) => {
      if (!row.vertical) return
      if (resourceStore) await resourceStore.deleteConnection(row.vertical, row.platform, row.id)
      if (syncStore) await syncStore.deleteForConnection(row.vertical, row.id)
    })

    // Per-vertical SyncWorkers. Each is bound to its vertical's adapter
    // type, listable resources, and TokenRefresher. All share the same
    // ResourceStore + SyncStore.
    const breaker = new CircuitBreaker()
    const externalHooks =
      dataStoreMode === 'external'
        ? {
            webhookSubs,
            webhookDeliveries,
          }
        : undefined
    const syncBatchEvents = config.dataStore.external?.batchEvents
    const syncPageSize = config.dataStore.syncPageSize
    const baseConfig =
      syncBatchEvents !== undefined || syncPageSize !== undefined
        ? {
            ...(syncBatchEvents !== undefined ? { batchEvents: syncBatchEvents } : {}),
            ...(syncPageSize !== undefined ? { pageSize: syncPageSize } : {}),
          }
        : undefined

    // Cleanup hook for one-time Connect Links: when the post-OAuth sync
    // succeeds, look up the consuming session, and if it was minted with
    // `oneTimeOnly: true`, emit `connect_link.disposed` and delete the
    // connection. Failed syncs leave the connection alive so the customer
    // can retry within the session's expiry window.
    const onJobComplete = async (
      job: { id: string; vertical: string; platform: string; connectionId: string },
      status: 'completed' | 'failed',
    ): Promise<void> => {
      if (status !== 'completed') return
      const session = await connectSessions.getByConnectionId(job.connectionId)
      if (!session?.oneTimeOnly) return
      try {
        await emitTenantEvent(
          webhookSubs,
          session.tenantId,
          'connect_link.disposed',
          {
            connection_id: job.connectionId,
            vertical: job.vertical,
            platform: job.platform,
            session_id: session.id,
            disposed_at: Date.now(),
          },
          { deliveries: webhookDeliveries, resolvePlatformName },
        )
      } catch (err) {
        fastify.log.warn({ err }, 'connect_link.disposed emit failed')
      }
      try {
        await store.deleteById(job.connectionId)
        fastify.log.info(
          `one-time link disposed: connection ${job.connectionId} (${job.vertical}/${job.platform}) deleted`,
        )
      } catch (err) {
        fastify.log.error(
          { err, connectionId: job.connectionId },
          'one-time disposal: deleteById failed',
        )
      }
    }

    // Every worker gets `normalizerVersion` — the fingerprint every router above
    // filters on. Without it no reader ever serves a synced row (see
    // SyncWorkerOptions.normalizerVersion).
    syncWorkers.push(
      new SyncWorker({
        vertical: ACCOUNTING_VERTICAL,
        unavailableReason: unavailableReasonResolver(ACCOUNTING_VERTICAL),
        syncStore,
        credentialStore: store,
        registry: accountingRegistry,
        circuitBreaker: breaker,
        resourceStore,
        rawPayloadEnabled,
        normalizerVersion,
        tokenRefresher: new AccountingTokenRefresher(store),
        listableResources: ACCOUNTING_LISTABLES,
        config: baseConfig,
        external: externalHooks,
        onJobComplete,
      }),
      new SyncWorker({
        vertical: CRM_VERTICAL,
        unavailableReason: unavailableReasonResolver(CRM_VERTICAL),
        syncStore,
        credentialStore: store,
        registry: crmRegistry,
        circuitBreaker: breaker,
        resourceStore,
        rawPayloadEnabled,
        normalizerVersion,
        tokenRefresher: new CrmTokenRefresher(store),
        listableResources: CRM_LISTABLES,
        config: baseConfig,
        external: externalHooks,
        onJobComplete,
      }),
      new SyncWorker({
        vertical: ECOMMERCE_VERTICAL,
        unavailableReason: unavailableReasonResolver(ECOMMERCE_VERTICAL),
        syncStore,
        credentialStore: store,
        registry: ecommerceRegistry,
        circuitBreaker: breaker,
        resourceStore,
        rawPayloadEnabled,
        normalizerVersion,
        tokenRefresher: new EcommerceTokenRefresher(store),
        listableResources: ECOMMERCE_LISTABLES,
        config: baseConfig,
        external: externalHooks,
        onJobComplete,
      }),
      new SyncWorker({
        vertical: LOGISTICS_VERTICAL,
        unavailableReason: unavailableReasonResolver(LOGISTICS_VERTICAL),
        syncStore,
        credentialStore: store,
        registry: logisticsRegistry,
        circuitBreaker: breaker,
        resourceStore,
        rawPayloadEnabled,
        normalizerVersion,
        tokenRefresher: new LogisticsTokenRefresher(store),
        listableResources: LOGISTICS_LISTABLES,
        config: baseConfig,
        external: externalHooks,
        onJobComplete,
      }),
      new SyncWorker({
        vertical: PAYMENTS_VERTICAL,
        unavailableReason: unavailableReasonResolver(PAYMENTS_VERTICAL),
        syncStore,
        credentialStore: store,
        registry: paymentsRegistry,
        circuitBreaker: breaker,
        resourceStore,
        rawPayloadEnabled,
        normalizerVersion,
        tokenRefresher: new PaymentsTokenRefresher(store),
        listableResources: PAYMENTS_LISTABLES,
        config: baseConfig,
        external: externalHooks,
        onJobComplete,
      }),
      new SyncWorker({
        vertical: DOCSIGN_VERTICAL,
        unavailableReason: unavailableReasonResolver(DOCSIGN_VERTICAL),
        syncStore,
        credentialStore: store,
        registry: docsignRegistry,
        circuitBreaker: breaker,
        resourceStore,
        rawPayloadEnabled,
        normalizerVersion,
        tokenRefresher: new DocsignTokenRefresher(store),
        listableResources: DOCSIGN_LISTABLES,
        config: baseConfig,
        external: externalHooks,
        onJobComplete,
      }),
      new SyncWorker({
        vertical: PROJECTS_VERTICAL,
        unavailableReason: unavailableReasonResolver(PROJECTS_VERTICAL),
        syncStore,
        credentialStore: store,
        registry: projectsRegistry,
        circuitBreaker: breaker,
        resourceStore,
        rawPayloadEnabled,
        normalizerVersion,
        tokenRefresher: new ProjectsTokenRefresher(store),
        listableResources: PROJECTS_LISTABLES,
        config: baseConfig,
        external: externalHooks,
        onJobComplete,
      }),
      new SyncWorker({
        vertical: CS_VERTICAL,
        unavailableReason: unavailableReasonResolver(CS_VERTICAL),
        syncStore,
        credentialStore: store,
        registry: supportRegistry,
        circuitBreaker: breaker,
        resourceStore,
        rawPayloadEnabled,
        normalizerVersion,
        tokenRefresher: new SupportTokenRefresher(store),
        listableResources: CS_LISTABLES,
        config: baseConfig,
        external: externalHooks,
        onJobComplete,
      }),
      new SyncWorker({
        vertical: INV_VERTICAL,
        unavailableReason: unavailableReasonResolver(INV_VERTICAL),
        syncStore,
        credentialStore: store,
        registry: inventoryRegistry,
        circuitBreaker: breaker,
        resourceStore,
        rawPayloadEnabled,
        normalizerVersion,
        tokenRefresher: new InventoryTokenRefresher(store),
        listableResources: INV_LISTABLES,
        config: baseConfig,
        external: externalHooks,
        onJobComplete,
      }),
    )

    // Scheduled syncs. One per process; replicas need no coordination (see
    // SyncScheduler). The breaker is this process's: a connection it has
    // tripped is left alone until the cooldown lets a request through.
    syncScheduler = new SyncScheduler({
      store,
      syncStore,
      defaultIntervalMinutes: syncDefaultIntervalMinutes,
      // Fails open: until a settings poll has reached admin-api this reads the
      // default, on. A deployment that switches scheduling off is only
      // guaranteed off once admin-api has been reached.
      enabled: () => runtimeSettings.getBoolean(SETTING.DATA_STORE_SYNC_SCHEDULER_ENABLED, true),
      isCircuitOpen: (connectionId) => breaker.peek(connectionId),
      // P8: a vertical the license does not include is not scheduled.
      verticalEntitled: (vertical) => license.entitlements().has(`vertical:${vertical}`),
      intervalMs: numericEnv('SYNC_SCHEDULER_INTERVAL_MS'),
      logger: {
        info: (m) => fastify.log.info(`[sync-scheduler] ${m}`),
        warn: (m) => fastify.log.warn(`[sync-scheduler] ${m}`),
        error: (m) => fastify.log.error(`[sync-scheduler] ${m}`),
      },
    })

    // Background maintenance — daily cleanup of completed sync_jobs older
    // than 30 days, plus periodic disk-size monitoring on resources.db.
    dataStoreMaintenance = startDataStoreMaintenance({
      logger: fastify.log,
      syncStore,
      resourceDbPath: resourcePath,
      maxSizeMb: config.dataStore.maxSizeMb,
    })

    // Admin-secret-gated cache control endpoint.
    await fastify.register(createAdminCacheRouter({ store, resourceStore }))

    // Admin-secret-gated cross-vertical sync-jobs index (powers the
    // admin UI's /sync-jobs page + setup wizard's "Sync now" button).
    await fastify.register(createAdminSyncRouter({ syncStore, credentialStore: store }))

    // Public metrics endpoint for Prometheus / ops scraping.
    await fastify.register(
      createDataStoreMetricsRouter({
        resourceStore,
        syncStore,
        resourceDbPath: resourcePath,
        mode: dataStoreMode === 'external' ? 'external' : 'database',
      }),
    )

    // Optional cold-start warm-up: enqueue one sync per active connection
    // so the cache is warm before traffic arrives. Skips connections
    // without owner_tenant_id (admin-tooling-created rows carry no owner
    // tenant) since they have no tenant to scope the sync against.
    if (config.dataStore.autoSyncOnBoot) {
      const verticals = [
        ACCOUNTING_VERTICAL,
        CRM_VERTICAL,
        ECOMMERCE_VERTICAL,
        LOGISTICS_VERTICAL,
        PAYMENTS_VERTICAL,
        DOCSIGN_VERTICAL,
        PROJECTS_VERTICAL,
        CS_VERTICAL,
        INV_VERTICAL,
      ]
      let enqueued = 0
      for (const v of verticals) {
        for (const row of await store.findByVertical(v)) {
          if (!row.ownerTenantId) continue
          // Trigger only means never automatically — a boot warm-up included.
          if (row.syncMode === 'trigger_only') continue
          const { created } = await syncStore.createIfIdle({
            vertical: v,
            connectionId: row.id,
            platform: row.platform,
            tenantId: row.ownerTenantId,
            origin: 'boot',
          })
          if (created) enqueued++
        }
      }
      fastify.log.info(`auto-sync-on-boot: enqueued ${enqueued} sync job(s)`)
    }
  } else {
    fastify.log.info(
      'data-store mode: passthrough (no resource cache; set DATA_STORE_MODE=database to enable)',
    )
  }

  // Internal data-access surface for the admin data viewer (via admin-api).
  // Registered in every mode: in passthrough it answers 409 DATA_STORE_DISABLED
  // rather than 404, so the viewer can say why there is nothing to browse.
  await fastify.register(
    createDataAccessRouter({
      credentialStore: store,
      resourceStore,
      syncStore,
      storeSecret: config.storeSecret,
    }),
  )

  // Destinations — scheduled exports of the data store to an operator's lake
  // or warehouse (`/admin/destinations/*`, via admin-api). Registered in every
  // mode (passthrough answers 409); the store and worker need the data store.
  // Hosts are SSRF-checked unless allow-listed (DESTINATIONS_ALLOW_PRIVATE_HOSTS).
  const destinationHostGuard = createHostGuard(config.destinations?.allowPrivateHosts ?? [])
  const destinationSinks: SinkFactory = (dest, secrets) =>
    createSink(dest.type, dest.config, secrets, { hostGuard: destinationHostGuard })
  let destinationStore: DestinationStore | undefined
  let destinationWorker: DestinationWorker | undefined
  if (dataHandle && resourceStore) {
    const feed = resourceStore
    destinationStore = await DestinationStore.create(dataHandle, config.storeSecret)
    destinationWorker = new DestinationWorker({
      store: destinationStore,
      feed,
      connections: store,
      // Every listable type, plus any type a read-through cached without a
      // sync (unclassified → masked as PII by the fallback below).
      resourceTypes: async () => [
        ...listableResources(),
        ...(await feed.countsByConnection()).map((c) => ({
          vertical: c.vertical,
          resourceType: c.resourceType,
        })),
      ],
      classificationFor: (v, t) => getClassification(v, t) ?? UNCLASSIFIED,
      sinkFactory: destinationSinks,
      hmacKey: deriveMaskKey(config.storeSecret),
      intervalMs: config.destinations?.intervalMs,
      logger: fastify.log,
    })
    // A manual run (POST …/run) may still be writing when the server closes;
    // wait for it before the data handle goes.
    const worker = destinationWorker
    fastify.addHook('onClose', () => worker.stop())
  }
  await fastify.register(
    createDestinationsRouter({
      store: destinationStore,
      runner: destinationWorker,
      sinkFactory: destinationSinks,
      hostGuard: destinationHostGuard,
    }),
  )

  // Read-only SQL access (Postgres only; `/admin/analytics/*`, via admin-api).
  // Registered in every mode so SQLite answers 409 POSTGRES_REQUIRED. With
  // ANALYTICS_ADMIN_DATABASE_URL set, re-provisions in the background when the
  // view catalog changed since the last deploy.
  const analytics = await AnalyticsService.create({
    dialect: config.credDb.dialect,
    databaseUrl: config.credDb.databaseUrl,
    handle: credHandle,
    storeSecret: config.storeSecret,
    config: config.analytics ?? { rolePrefix: 'os' },
    logger: fastify.log,
  })
  await fastify.register(createAnalyticsRouter({ service: analytics }))
  fastify.addHook('onClose', () => analytics.close())
  void analytics.provisionOnBoot()

  // Control plane — vertical-agnostic surface.
  await fastify.register(
    createUnifiedAuthRouter({
      store,
      registry,
      connectSessions,
      webhookSubs,
      webhookDeliveries,
      syncStore,
      getCompanyBaseUrl,
      // Lets `POST /auth/{vertical}/{platform}/connect` accept a tenant dev
      // key as well as the admin secret. The tenant is then taken from the
      // key, never the body.
      apiKeys,
      getUnsupported: resolveUnsupported,
      assertCanCreateConnection,
    }),
  )
  // Operator connection surface. Documented at `/admin/connections*` (where
  // every other X-Admin-Secret route lives), which frees the tenant dev
  // surface `/v1/connections*` to strip to `/connections` in the spec and
  // inherit both the live and sandbox servers — so a test key can list/get
  // connections from Swagger's Servers dropdown and the SDK's `mode:'test'`.
  // The bare `/connections` mount is an undocumented alias serving the same
  // router.
  // `sync` on every admin connection response — computed exactly as the
  // scheduler computes it, so "Next sync" is what will happen. Absent in
  // passthrough mode, where nothing syncs.
  const syncState = syncStore
    ? createSyncStateResolver({ syncStore, defaultIntervalMinutes: syncDefaultIntervalMinutes })
    : undefined
  await fastify.register(createUnifiedConnectionsRouter({ store, syncState }), { prefix: '/admin' })
  await fastify.register(createUnifiedConnectionsRouter({ store, syncState }))
  await fastify.register(
    createUnifiedHealthRouter({
      registry,
      dataStoreStatus: () =>
        dataStoreMode === 'passthrough'
          ? { mode: 'passthrough', syncWorkers: 0 }
          : { mode: dataStoreMode, path: config.dataStore.path, syncWorkers: syncWorkers.length },
    }),
  )

  // /version — { name, version, gitSha, buildTime }. See note in
  // apps/admin-api/src/core/server.ts. Reads package.json from cwd
  // (works under `tsx watch` locally and under the Dockerfile's
  // WORKDIR /app/apps/integration-server in production).
  const pkg = JSON.parse(readFileSync(resolvePath(process.cwd(), 'package.json'), 'utf8')) as {
    name?: string
    version?: string
  }
  await fastify.register(
    createVersionRouter({
      name: pkg.name ?? 'integration-server',
      version: pkg.version ?? '0.0.0',
    }),
  )

  // Public surface for Swagger UI's Servers dropdown. Resolves three sources
  // — compiled defaults < config.yml < admin-DB (runtime_settings json rows
  // under category 'openapi') — into a single ResolvedServerVariables shape
  // the docs-server can pass straight into buildServersBlock. No auth: the
  // values are the public URLs of this deployment.
  fastify.get('/openapi/server-variables', async () => {
    const fromAdmin = {
      scheme: runtimeSettings.getJson<OpenApiServerVariable | null>('openapi.servers.scheme', null),
      host: runtimeSettings.getJson<OpenApiServerVariable | null>('openapi.servers.host', null),
      port: runtimeSettings.getJson<OpenApiServerVariable | null>('openapi.servers.port', null),
      version: runtimeSettings.getJson<OpenApiServerVariable | null>(
        'openapi.servers.version',
        null,
      ),
    }
    const pruned: Record<string, OpenApiServerVariable> = {}
    for (const [name, value] of Object.entries(fromAdmin)) {
      if (value && typeof value === 'object') pruned[name] = value
    }
    return mergeServerVariables(config.openapi?.servers, pruned)
  })

  // Fast no-op for misrouted ACME challenges. We never participate in cert
  // issuance — the reverse proxy owns that. See docs/deployment/custom-domain.md.
  await fastify.register(wellKnownAcmePlugin)

  // Design-system static assets, used by the Connect Link hosted pages.
  await fastify.register(staticPlugin, {
    root: designSystemRoot,
    prefix: '/design/',
    decorateReply: false,
  })

  // Flat platform metadata across every vertical. Each source array already
  // carries the per-row shape; we tag each with its vertical and merge in the
  // curated read-only / catalog scopes from the generated maps.
  const READ_BY_VERTICAL: Record<string, Record<string, readonly string[]>> = {
    accounting: ACC_READ,
    crm: CRM_READ,
    ecommerce: ECOM_READ,
    logistics: LOG_READ,
    payments: PAY_READ,
    docsign: DOC_READ,
    projects: PRO_READ,
    'customer-support': CS_READ,
    inventory: INV_READ,
  }
  const REC_BY_VERTICAL: Record<string, Record<string, readonly string[]>> = {
    accounting: ACC_REC,
    crm: CRM_REC,
    ecommerce: ECOM_REC,
    logistics: LOG_REC,
    payments: PAY_REC,
    docsign: DOC_REC,
    projects: PRO_REC,
    'customer-support': CS_REC,
    inventory: INV_REC,
  }
  function tagAndMerge<T extends { slug: string; name: string }>(
    p: T,
    vertical: string,
  ): PlatformEntry {
    const read = READ_BY_VERTICAL[vertical]?.[p.slug]
    const recExtra = REC_BY_VERTICAL[vertical]?.[p.slug]
    return {
      ...p,
      vertical,
      ...(recExtra && recExtra.length > 0 ? { recommendedScopes: recExtra } : {}),
      ...(read && read.length > 0 ? { readScopes: read } : {}),
    }
  }
  const platforms: PlatformEntry[] = [
    ...ACCOUNTING_PLATFORMS.map((p) => tagAndMerge(p, 'accounting')),
    ...CRM_PLATFORMS.map((p) => tagAndMerge(p, 'crm')),
    ...ECOMMERCE_PLATFORMS.map((p) => tagAndMerge(p, 'ecommerce')),
    ...LOGISTICS_PLATFORMS.map((p) => tagAndMerge(p, 'logistics')),
    ...PAYMENTS_PLATFORMS.map((p) => tagAndMerge(p, 'payments')),
    ...DOCSIGN_PLATFORMS.map((p) => tagAndMerge(p, 'docsign')),
    ...PROJECTS_PLATFORMS.map((p) => tagAndMerge(p, 'projects')),
    ...CS_PLATFORMS.map((p) => tagAndMerge(p, 'customer-support')),
    ...INV_PLATFORMS.map((p) => tagAndMerge(p, 'inventory')),
  ]
  for (const p of platforms) {
    if (p.name) platformDisplayNames.set(p.slug, p.name)
    if (p.unsupported) unsupportedByKey.set(`${p.vertical}:${p.slug}`, { ...p.unsupported, name: p.name })
  }
  // The platform catalog was historically served unauthenticated while the
  // spec declared ApiKeyAuth; runtime now matches the spec. Bearer callers go
  // through the standard dev-key gate (live mode — a test key belongs on
  // /test/v1/platforms); everything else falls back to the admin guard, which
  // keeps admin-api's X-Admin-Secret catalog fetch (and the explicit
  // OST_ALLOW_UNAUTH_ADMIN local-dev opt-in) working. Same Bearer-wins
  // precedence as the POST /auth connect route.
  const platformsKeyGuard = requireTenantKey({
    apiKeys,
    rateLimit: apiKeyRateLimitResolver,
    mcpEnabled: mcpEnabledResolver,
  })
  const platformsAuth: preHandlerAsyncHookHandler = async (request, reply) => {
    const authHeader = request.headers['authorization']
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return platformsKeyGuard(request, reply)
    }
    if (!adminGuard(request, reply)) return reply
  }
  await fastify.register(
    createUnifiedPlatformsRouter({ platforms, settingsStore, preHandler: platformsAuth }),
  )

  // Index platforms by (vertical, slug) → recommendedScopes so the admin UI
  // can render a per-platform scope picker without each app embedding its
  // own copy of the metadata. Same-shape index for `supportsScopeOverride`
  // so the Connect Link form can disable the scope-group dropdown for
  // adapters that ignore per-link scopes (Salesforce, Bitrix24, etc.).
  const recommendedScopesIndex = new Map<string, string[]>()
  const scopeOverrideIndex = new Map<string, boolean>()
  const readScopesIndex = new Map<string, string[]>()
  for (const p of platforms) {
    const rec = (p as { recommendedScopes?: unknown }).recommendedScopes
    if (Array.isArray(rec) && rec.length > 0) {
      recommendedScopesIndex.set(`${p.vertical}:${p.slug}`, rec.map(String))
    }
    const sso = (p as { supportsScopeOverride?: unknown }).supportsScopeOverride
    if (typeof sso === 'boolean') {
      scopeOverrideIndex.set(`${p.vertical}:${p.slug}`, sso)
    }
    const read = (p as { readScopes?: unknown }).readScopes
    if (Array.isArray(read) && read.length > 0) {
      readScopesIndex.set(`${p.vertical}:${p.slug}`, read.map(String))
    }
  }
  await fastify.register(
    createUnifiedAdminPlatformsRouter({
      registry,
      settingsStore,
      getRecommendedScopes: (vertical, slug) =>
        recommendedScopesIndex.get(`${vertical}:${slug}`) ?? null,
      getSupportsScopeOverride: (vertical: string, slug: string) =>
        scopeOverrideIndex.get(`${vertical}:${slug}`) ?? true,
      getReadScopes: (vertical: string, slug: string) =>
        readScopesIndex.get(`${vertical}:${slug}`) ?? null,
      getUnsupported: resolveUnsupported,
    }),
  )

  // Connect Links — public hosted UI + JSON, plus admin CRUD for sessions
  // and end-users. Both gated upstream by either token (public) or
  // X-Admin-Secret (admin).
  await fastify.register(
    createConnectRouter({
      store,
      registry,
      sessions: connectSessions,
      endUsers,
      hostInfo,
      platforms,
      getCompanyBaseUrl,
      rateLimit: connectLinkRateLimitResolver,
      assertCanCreateConnection,
    }),
  )
  await fastify.register(
    createConnectAdminRouter({
      store,
      endUsers,
      sessions: connectSessions,
      getCompanyBaseUrl,
      getTenantBaseUrl: (tenantId) => tenantDomains.domainForTenant(tenantId),
      linkDefaults: connectLinkDefaults,
    }),
  )

  // Developer-facing customer + connect-link API. Tenant-scoped via Bearer key.
  await fastify.register(
    createCustomersRouter({
      apiKeys,
      oauth: oauthClients,
      apiKeysEnabled: apiKeysEnabledResolver,
      oauthEnabled: oauthEnabledResolver,
      endUsers,
      sessions: connectSessions,
      credentials: store,
      webhookSubs,
      webhookDeliveries,
      getCompanyBaseUrl,
      rateLimit: apiKeyRateLimitResolver,
      mcpEnabled: mcpEnabledResolver,
      linkDefaults: connectLinkDefaults,
    }),
  )

  // Admin-secret-gated mint / list / revoke for the dev keys above. Proxied
  // by admin-api so the admin UI can manage keys via JWT auth.
  await fastify.register(createApiKeysAdminRouter({ apiKeys }))
  await fastify.register(createEndUserTokensAdminRouter({ tokens: endUserTokens }))
  await fastify.register(
    createWebhookSubsAdminRouter({
      subs: webhookSubs,
      deliveries: webhookDeliveries,
      resolvePlatformName,
    }),
  )

  // Tenant-scoped /v1/connections — dev keys can list/get/rename/revoke
  // their own connections (rows whose owner_tenant_id matches the key).
  await fastify.register(
    createConnectionsDevRouter({
      apiKeys,
      oauth: oauthClients,
      apiKeysEnabled: apiKeysEnabledResolver,
      oauthEnabled: oauthEnabledResolver,
      credentials: store,
      rateLimit: apiKeyRateLimitResolver,
      registry,
      mcpEnabled: mcpEnabledResolver,
    }),
  )

  // Tenant-scoped /v1/webhook-subscriptions — dev keys manage their own
  // outbound webhook endpoints (webhooks:read / webhooks:write scopes)
  // without an operator round-trip. Same store, same SSRF guard, same
  // delivery pipeline as the admin surface.
  await fastify.register(
    createWebhookSubsDevRouter({
      apiKeys,
      oauth: oauthClients,
      apiKeysEnabled: apiKeysEnabledResolver,
      oauthEnabled: oauthEnabledResolver,
      subs: webhookSubs,
      deliveries: webhookDeliveries,
      rateLimit: apiKeyRateLimitResolver,
      mcpEnabled: mcpEnabledResolver,
      resolvePlatformName,
    }),
  )

  // Inbound webhook normalisation.
  const webhookHandlers: Record<string, Record<string, WebhookHandler>> = {
    accounting: ACCOUNTING_WEBHOOKS,
    crm: CRM_WEBHOOKS,
    ecommerce: ECOMMERCE_WEBHOOKS,
    logistics: LOGISTICS_WEBHOOKS,
    payments: PAYMENTS_WEBHOOKS,
    docsign: DOCSIGN_WEBHOOKS,
    projects: PROJECTS_WEBHOOKS,
    'customer-support': CS_WEBHOOKS,
    inventory: INV_WEBHOOKS,
  }
  // In-process sink for verified inbound events: append to the canonical
  // stream (idempotent), bridge to the outbound system as `platform.event`,
  // and (when a data-store cache exists) refresh just the affected resource.
  const refreshResource = resourceStore
    ? createRefreshResource({
        registry,
        resourceStore,
        store,
        refreshMaps: {
          payments: PAYMENTS_REFRESH_MAP,
          accounting: ACCOUNTING_REFRESH_MAP,
        },
        logger: fastify.log,
      })
    : undefined
  const webhookConsumer = createWebhookConsumer({
    store,
    subs: webhookSubs,
    deliveries: webhookDeliveries,
    inboundEvents,
    refreshResource,
    logger: fastify.log,
  })
  await fastify.register(
    createUnifiedWebhooksRouter({
      handlers: webhookHandlers,
      store,
      config: config.webhooks,
      consumer: webhookConsumer,
    }),
  )
  // Customer-facing inbound event stream.
  await fastify.register(
    createInboundEventsRouter({
      apiKeys,
      oauth: oauthClients,
      apiKeysEnabled: apiKeysEnabledResolver,
      oauthEnabled: oauthEnabledResolver,
      events: inboundEvents,
      rateLimit: apiKeyRateLimitResolver,
      mcpEnabled: mcpEnabledResolver,
    }),
  )

  // Operator read of whether OIDC bearer auth could admit anybody. admin-api
  // asks before letting an operator switch API keys off.
  await fastify.register(createAdminOAuthRouter({ oauth: oauthClients }))

  // Operator read of the evaluated license (D-A): admin-api's /api/license.
  await fastify.register(
    createAdminLicenseRouter({ license, countConnections: () => store.count() }),
  )

  // What answers for a caller: the verticals this server runs that the
  // license includes (P7). Read per request, so a renewal or a lapse applies
  // at once. GET /v1/capabilities takes any tenant credential, no scope; an
  // mcp:read key also passes the MCP guard (P10).
  const entitledVerticals = (candidates: readonly string[]): string[] =>
    candidates.filter((v) => license.entitlements().has(`vertical:${v}`)).sort()
  await fastify.register(
    createCapabilitiesRouter({
      path: '/v1/capabilities',
      preHandler: requireTenantKey({
        apiKeys,
        oauth: oauthClients,
        apiKeysEnabled: apiKeysEnabledResolver,
        oauthEnabled: oauthEnabledResolver,
        rateLimit: apiKeyRateLimitResolver,
        mcpEnabled: mcpEnabledResolver,
      }),
      enabledVerticals: () => entitledVerticals(registry.verticals()),
    }),
  )

  // One auth middleware shared by every vertical scope. Accepts either
  // X-Admin-Secret (operator override) or a tenant-scoped Bearer key whose
  // tenant owns the requested connection_id.
  const authMiddleware = createUnifiedAuthMiddleware({
    store,
    registry,
    apiKeys,
    oauth: oauthClients,
    apiKeysEnabled: apiKeysEnabledResolver,
    oauthEnabled: oauthEnabledResolver,
    sessions: connectSessions,
    mcpEnabled: mcpEnabledResolver,
    connectionWriteGuard,
  })

  // End-user-scoped variant of the unified middleware: accepts only
  // `eut_*` bearers, verifies the requested connection belongs to the
  // end-user (via connect_sessions.end_user_id), rate-limit bucket
  // `end_user:<id>`, mcp:read read-only enforcement built-in. Mounted
  // under /v1/me/{vertical}/* below — only the preHandler differs from
  // the tenant-mode mount.
  const endUserAuthMiddleware = createUnifiedEndUserAuthMiddleware({
    store,
    registry,
    tokens: endUserTokens,
    sessions: connectSessions,
    rateLimit: endUserRateLimitResolver,
    mcpEnabled: mcpEnabledResolver,
    connectionWriteGuard,
  })

  // External-mode plumbing for outbound `resource.*` events. Only forwarded
  // when the mode is `external`; otherwise the plugins skip the emitter.
  const externalEventStores =
    dataStoreMode === 'external'
      ? { webhookSubs, webhookDeliveries }
      : { webhookSubs: undefined, webhookDeliveries: undefined }

  // Stale-cache TTL: convert seconds → ms for the helpers. Undefined =
  // no TTL (manual invalidation only).
  const cacheMaxAgeMs =
    config.dataStore.staleAfterSeconds !== undefined
      ? config.dataStore.staleAfterSeconds * 1000
      : undefined

  // Vertical resource routes. Each plugin attaches the auth middleware as a
  // `preHandler` and mounts that vertical's routers.
  await fastify.register(
    createAccountingPlugin({
      authMiddleware,
      licenseGate: verticalGate,
      mode: dataStoreMode,
      resourceStore,
      syncStore,
      cacheMaxAgeMs,
      rawPayloadEnabled,
        normalizerVersion,
      ...externalEventStores,
    }),
    { prefix: `/v1/${ACCOUNTING_VERTICAL}` },
  )
  await fastify.register(
    createCrmPlugin({
      authMiddleware,
      licenseGate: verticalGate,
      mode: dataStoreMode,
      resourceStore,
      syncStore,
      cacheMaxAgeMs,
      rawPayloadEnabled,
        normalizerVersion,
      ...externalEventStores,
    }),
    { prefix: `/v1/${CRM_VERTICAL}` },
  )
  await fastify.register(
    createEcommercePlugin({
      authMiddleware,
      licenseGate: verticalGate,
      mode: dataStoreMode,
      resourceStore,
      syncStore,
      cacheMaxAgeMs,
      rawPayloadEnabled,
        normalizerVersion,
      ...externalEventStores,
    }),
    { prefix: `/v1/${ECOMMERCE_VERTICAL}` },
  )
  await fastify.register(
    createLogisticsPlugin({
      authMiddleware,
      licenseGate: verticalGate,
      mode: dataStoreMode,
      resourceStore,
      syncStore,
      cacheMaxAgeMs,
      rawPayloadEnabled,
        normalizerVersion,
      ...externalEventStores,
    }),
    { prefix: `/v1/${LOGISTICS_VERTICAL}` },
  )
  await fastify.register(
    createPaymentsPlugin({
      authMiddleware,
      licenseGate: verticalGate,
      mode: dataStoreMode,
      resourceStore,
      syncStore,
      cacheMaxAgeMs,
      rawPayloadEnabled,
        normalizerVersion,
      ...externalEventStores,
    }),
    { prefix: `/v1/${PAYMENTS_VERTICAL}` },
  )
  await fastify.register(
    createDocsignPlugin({
      authMiddleware,
      licenseGate: verticalGate,
      mode: dataStoreMode,
      resourceStore,
      syncStore,
      cacheMaxAgeMs,
      rawPayloadEnabled,
        normalizerVersion,
      ...externalEventStores,
    }),
    { prefix: `/v1/${DOCSIGN_VERTICAL}` },
  )
  await fastify.register(
    createProjectsPlugin({
      authMiddleware,
      licenseGate: verticalGate,
      mode: dataStoreMode,
      resourceStore,
      syncStore,
      cacheMaxAgeMs,
      rawPayloadEnabled,
        normalizerVersion,
      ...externalEventStores,
    }),
    { prefix: `/v1/${PROJECTS_VERTICAL}` },
  )
  await fastify.register(
    createSupportPlugin({
      authMiddleware,
      licenseGate: verticalGate,
      mode: dataStoreMode,
      resourceStore,
      syncStore,
      cacheMaxAgeMs,
      rawPayloadEnabled,
        normalizerVersion,
      ...externalEventStores,
    }),
    { prefix: `/v1/${CS_VERTICAL}` },
  )
  await fastify.register(
    createInventoryPlugin({
      authMiddleware,
      licenseGate: verticalGate,
      mode: dataStoreMode,
      resourceStore,
      syncStore,
      cacheMaxAgeMs,
      rawPayloadEnabled,
        normalizerVersion,
      ...externalEventStores,
    }),
    { prefix: `/v1/${INV_VERTICAL}` },
  )

  // ── End-user mode (eut_* tokens) ─────────────────────────────────────────
  // Same per-vertical plugins, mounted a second time under /v1/me/{vertical}
  // with the end-user auth middleware. The plugins themselves are vertical-
  // agnostic — the only difference is the preHandler that resolves the
  // request to one customer's connections instead of the whole tenant.
  if (runtimeSettings.getBoolean(SETTING.FEATURES_END_USER_MODE_ENABLED, true)) {
    // /v1/me + /v1/me/connections — the customer-level surface
    await fastify.register(
      createEndUserRouter({
        tokens: endUserTokens,
        endUsers,
        sessions: connectSessions,
        credentials: store,
        rateLimit: endUserRateLimitResolver,
        mcpEnabled: mcpEnabledResolver,
      }),
    )

    // The verticals mounted under /v1/me below. /v1/me/capabilities answers
    // with these ∩ the license (P7): a vertical this surface does not serve is
    // not a capability here, whatever the license says.
    // tests/licensing/capabilities.test.ts pins this list to the mounts.
    const END_USER_VERTICALS = [
      ACCOUNTING_VERTICAL,
      CRM_VERTICAL,
      ECOMMERCE_VERTICAL,
      LOGISTICS_VERTICAL,
      PAYMENTS_VERTICAL,
    ]
    await fastify.register(
      createCapabilitiesRouter({
        path: '/v1/me/capabilities',
        preHandler: requireEndUserToken({
          tokens: endUserTokens,
          rateLimit: endUserRateLimitResolver,
          mcpEnabled: mcpEnabledResolver,
        }),
        enabledVerticals: () => entitledVerticals(END_USER_VERTICALS),
      }),
    )

    // /v1/me/{vertical}/{resource}/* — same plugins as above, end-user auth
    await fastify.register(
      createAccountingPlugin({
        authMiddleware: endUserAuthMiddleware,
        licenseGate: verticalGate,
        mode: dataStoreMode,
        rawPayloadEnabled,
        normalizerVersion,
        resourceStore,
        syncStore,
        cacheMaxAgeMs,
        ...externalEventStores,
      }),
      { prefix: `/v1/me/${ACCOUNTING_VERTICAL}` },
    )
    await fastify.register(
      createCrmPlugin({
        authMiddleware: endUserAuthMiddleware,
        licenseGate: verticalGate,
        mode: dataStoreMode,
        rawPayloadEnabled,
        normalizerVersion,
        resourceStore,
        syncStore,
        cacheMaxAgeMs,
        ...externalEventStores,
      }),
      { prefix: `/v1/me/${CRM_VERTICAL}` },
    )
    await fastify.register(
      createEcommercePlugin({
        authMiddleware: endUserAuthMiddleware,
        licenseGate: verticalGate,
        mode: dataStoreMode,
        rawPayloadEnabled,
        normalizerVersion,
        resourceStore,
        syncStore,
        cacheMaxAgeMs,
        ...externalEventStores,
      }),
      { prefix: `/v1/me/${ECOMMERCE_VERTICAL}` },
    )
    await fastify.register(
      createLogisticsPlugin({
        authMiddleware: endUserAuthMiddleware,
        licenseGate: verticalGate,
        mode: dataStoreMode,
        rawPayloadEnabled,
        normalizerVersion,
        resourceStore,
        syncStore,
        cacheMaxAgeMs,
        ...externalEventStores,
      }),
      { prefix: `/v1/me/${LOGISTICS_VERTICAL}` },
    )
    await fastify.register(
      createPaymentsPlugin({
        authMiddleware: endUserAuthMiddleware,
        licenseGate: verticalGate,
        mode: dataStoreMode,
        rawPayloadEnabled,
        normalizerVersion,
        resourceStore,
        syncStore,
        cacheMaxAgeMs,
        ...externalEventStores,
      }),
      { prefix: `/v1/me/${PAYMENTS_VERTICAL}` },
    )
  }

  // ── Test mode (osk_test_* keys) ──────────────────────────────────────────
  // The same vertical plugins a third time, with a sandbox preHandler that
  // substitutes a synthetic adapter instead of resolving a real connection.
  //
  // `mode: 'passthrough'` is load-bearing rather than incidental. It makes
  // `cachedList`/`cachedGet` call the adapter directly and `writeThrough`/
  // `cachedDelete` no-ops, which is exactly right here: the sandbox adapter is
  // the fetch AND owns its own storage, so the cache helpers should be
  // transparent. It also skips the `/sync` router (nothing upstream to sync
  // from) and leaves `dataStoreEvents` unset, so test traffic fires no
  // outbound webhooks.
  //
  // Unlike the end-user mount, the feature flag is NOT evaluated here. Gating
  // at mount time means a flip needs a restart and answers 404 rather than the
  // 503 this setting documents, so the check lives in the middleware and is
  // re-read per request (within one settings poll).
  const testModeEnabledResolver = (): boolean =>
    runtimeSettings.getBoolean(SETTING.FEATURES_TEST_MODE_ENABLED, true)

  const sandboxAdapterFor = (vertical: string, tenantId: string): unknown =>
    createSandboxAdapter({
      vertical,
      tenantId,
      // Sandbox connections have no upstream platform; naming it plainly is
      // better than borrowing a real slug the caller never connected.
      platform: 'sandbox',
      store: sandboxStore,
      // Per vertical — each mount must receive its own vertical's specs, or
      // one vertical's resources would silently be served under another
      // vertical's routes.
      specs: sandboxSpecsFor(vertical),
    })

  /** One vertical's plugin, wired for the sandbox. */
  const SANDBOX_PLUGINS: Record<string, (mw: preHandlerAsyncHookHandler) => FastifyPluginAsync> = {
    [ACCOUNTING_VERTICAL]: (authMiddleware) =>
      createAccountingPlugin({ authMiddleware, licenseGate: verticalGate, mode: 'passthrough' }),
    [CRM_VERTICAL]: (authMiddleware) =>
      createCrmPlugin({ authMiddleware, licenseGate: verticalGate, mode: 'passthrough' }),
    [DOCSIGN_VERTICAL]: (authMiddleware) =>
      createDocsignPlugin({ authMiddleware, licenseGate: verticalGate, mode: 'passthrough' }),
    [PAYMENTS_VERTICAL]: (authMiddleware) =>
      createPaymentsPlugin({ authMiddleware, licenseGate: verticalGate, mode: 'passthrough' }),
    [CS_VERTICAL]: (authMiddleware) =>
      createSupportPlugin({ authMiddleware, licenseGate: verticalGate, mode: 'passthrough' }),
    [ECOMMERCE_VERTICAL]: (authMiddleware) =>
      createEcommercePlugin({ authMiddleware, licenseGate: verticalGate, mode: 'passthrough' }),
    [INV_VERTICAL]: (authMiddleware) =>
      createInventoryPlugin({ authMiddleware, licenseGate: verticalGate, mode: 'passthrough' }),
    [LOGISTICS_VERTICAL]: (authMiddleware) =>
      createLogisticsPlugin({ authMiddleware, licenseGate: verticalGate, mode: 'passthrough' }),
    [PROJECTS_VERTICAL]: (authMiddleware) =>
      createProjectsPlugin({ authMiddleware, licenseGate: verticalGate, mode: 'passthrough' }),
  }

  // One encapsulating plugin so the sandbox error mapping is SCOPED to the
  // sandbox. Fastify resolves a route's error handler from the context it was
  // registered in, so a handler set on the root afterwards would neither reach
  // these routes nor be appropriate — it would change error behaviour for the
  // live API too.
  await fastify.register(
    async (sandbox) => {
      // The sandbox adapter raises domain errors with no HTTP status of their
      // own; map them here rather than teaching 13 routers about them.
      sandbox.setErrorHandler(async (rawErr, request, reply) => {
        const err = rawErr as Error & { statusCode?: number }
        if (err instanceof SandboxNotFoundError) {
          return reply
            .status(404)
            .send({ error: { code: 'RESOURCE_NOT_FOUND', message: err.message } })
        }
        if (err instanceof SandboxQuotaError) {
          return reply
            .status(403)
            .send({ error: { code: 'SANDBOX_QUOTA_EXCEEDED', message: err.message } })
        }
        request.log.error({ err }, 'sandbox request failed')
        return reply
          .status(err.statusCode ?? 500)
          .send({ error: { code: 'INTERNAL', message: 'Internal Server Error' } })
      })

      // Each vertical gets the same plugin the live surface mounts, with the
      // sandbox preHandler substituted. The middleware is per-vertical because
      // it validates the connection id against `sandboxConnectionId(tenant,
      // vertical)` — one shared instance would accept the wrong vertical's id.
      // Tokens from the deployment's own test issuer, accepted by every
      // sandbox surface beside test keys, under the same auth.dev_oauth_enabled
      // switch /v1/* honours.
      const sandboxOauth = {
        store: oauthClients,
        keys: sandboxIssuerKeys,
        enabled: oauthEnabledResolver,
      }

      for (const vertical of SANDBOX_VERTICALS) {
        const plugin = SANDBOX_PLUGINS[vertical]
        if (!plugin) continue
        await sandbox.register(
          plugin(
            createSandboxAuthMiddleware({
              apiKeys,
              vertical,
              adapterFor: sandboxAdapterFor,
              testModeEnabled: testModeEnabledResolver,
              rateLimit: apiKeyRateLimitResolver,
              mcpEnabled: mcpEnabledResolver,
              oauth: sandboxOauth,
            }),
          ),
          { prefix: `/${vertical}` },
        )
        // Simulated /sync beside the resource routes. The live plugins skip
        // their sync router in passthrough mode (nothing upstream to sync
        // from), so this simulator is the pre-production surface for sync
        // semantics. It seeds fresh fixture rows instead of pulling
        // anything, and never dials callback_url (no-egress). It sits beside
        // the plugin, not inside it, so it takes the license gate itself: an
        // unentitled vertical's simulated sync is refused like the live one.
        await sandbox.register(
          createSandboxSyncRouter({
            apiKeys,
            store: sandboxStore,
            vertical,
            simulateUpstream: createSandboxSyncSimulator(sandboxStore, vertical),
            testModeEnabled: testModeEnabledResolver,
            oauth: sandboxOauth,
            rateLimit: apiKeyRateLimitResolver,
            licenseGate: verticalGate(vertical),
          }),
          { prefix: `/${vertical}` },
        )
      }

      await sandbox.register(
        createSandboxMetaRouter({
          apiKeys,
          store: sandboxStore,
          verticals: SANDBOX_VERTICALS,
          testModeEnabled: testModeEnabledResolver,
          rateLimit: apiKeyRateLimitResolver,
          oauth: sandboxOauth,
        }),
      )

      // Self-serve sandbox keys — POST /test/v1/keys, unauthenticated, OFF
      // until the operator flips auth.sandbox_self_serve_enabled. The mint is
      // IP-rate-limited and every key lands in a throwaway tenant with a
      // 7-day expiry; see the router for the full abuse budget.
      await sandbox.register(
        createSandboxKeysRouter({
          apiKeys,
          selfServeEnabled: () =>
            runtimeSettings.getBoolean(SETTING.AUTH_SANDBOX_SELF_SERVE_ENABLED, false),
          testModeEnabled: testModeEnabledResolver,
        }),
      )

      // Test-mode control plane: customers, connections, webhook-subscriptions
      // and events under /test/v1, pre-seeded with deterministic mock data so a
      // test key can exercise every developer endpoint (not just the vertical
      // resource routes). No egress — see the router's header.
      await sandbox.register(
        createSandboxControlPlaneRouter({
          apiKeys,
          verticals: SANDBOX_VERTICALS,
          testModeEnabled: testModeEnabledResolver,
          rateLimit: apiKeyRateLimitResolver,
          getCompanyBaseUrl,
          oauth: sandboxOauth,
          enabledVerticals: () => entitledVerticals(registry.verticals()),
        }),
      )

      // Mock OAuth ceremony + hosted mock connect pages. Unauthenticated by
      // design (browser ceremony, like live /auth GETs and /connect/*) — a
      // SIBLING of the bearer-authenticated routers, still test-mode-gated
      // and IP-rate-limited. Branding is injected as a VALUE so the sandbox
      // subtree stays egress-free. No egress — see the router's header.
      await sandbox.register(
        createSandboxAuthRouter({
          verticals: SANDBOX_VERTICALS,
          testModeEnabled: testModeEnabledResolver,
          rateLimit: connectLinkRateLimitResolver,
          getHostBranding: () => hostInfo.get(),
        }),
      )
    },
    { prefix: '/test/v1' },
  )

  // The sandbox test issuer: discovery, JWKS and a client_credentials token
  // endpoint under /test/oidc. Its tokens are the OIDC counterpart of test
  // keys — minted here, against a test key, accepted on /test/v1/* only — so
  // the bearer-token flow can be rehearsed with no identity provider. The
  // issuer URL is the public base, so it matches what an operator registers
  // on /oauth-clients. No egress — see the router's header.
  await fastify.register(
    createSandboxOidcRouter({
      apiKeys,
      oauth: oauthClients,
      keys: sandboxIssuerKeys,
      issuerUrl: async (request) =>
        resolvePublicBaseUrl(request, { companyBaseUrl: await getCompanyBaseUrl() }) +
        SANDBOX_ISSUER_PATH,
      testModeEnabled: testModeEnabledResolver,
    }),
    { prefix: SANDBOX_ISSUER_PATH },
  )

  // Outbound webhook retry worker. The bootstrapper starts/stops it.
  const webhookWorker = new WebhookRetryWorker({
    deliveries: webhookDeliveries,
    subscriptions: webhookSubs,
    logger: fastify.log,
    // Retention for the two payload stores that otherwise grow forever —
    // delivered/dead outbound bodies and raw inbound platform payloads both
    // carry customer PII verbatim. Live-read so the operator's setting
    // applies without a restart; 0 (the default) keeps everything.
    retention: {
      deliveryDays: () => runtimeSettings.getNumber(SETTING.WEBHOOKS_DELIVERY_RETENTION_DAYS, 0),
      inboundEvents,
      inboundDays: () =>
        runtimeSettings.getNumber(SETTING.WEBHOOKS_INBOUND_EVENT_RETENTION_DAYS, 0),
    },
  })

  // Daily proactive refresh of every active OAuth connection. Keeps
  // rotating-refresh providers (Xero, HubSpot, Microsoft, QuickBooks, …)
  // alive even when the customer is idle. On hard failure (invalid_grant)
  // marks the row as authorization-expired and emits a tenant webhook
  // event so admins can wire Slack/Teams alerts via /webhooks subscriptions.
  const refreshWorkerEnabled = process.env['REFRESH_WORKER_ENABLED'] !== 'false'
  const refreshKeepAliveWorker = refreshWorkerEnabled
    ? new RefreshKeepAliveWorker({
        store,
        registry,
        intervalMs: numericEnv('REFRESH_WORKER_INTERVAL_MS'),
        skipWindowMs: numericEnv('REFRESH_WORKER_SKIP_WINDOW_MS'),
        expiringWithinMs: numericEnv('REFRESH_WORKER_EXPIRING_WITHIN_MS'),
        keepWarmMs: numericEnv('REFRESH_WORKER_KEEP_WARM_MS'),
        deadRetryMs: numericEnv('REFRESH_WORKER_DEAD_RETRY_MS'),
        batchSize: numericEnv('REFRESH_WORKER_BATCH_SIZE'),
        perConnectionDelayMs: numericEnv('REFRESH_WORKER_BATCH_DELAY_MS'),
        onAuthorizationExpired: (row) => {
          if (!row.ownerTenantId || !row.vertical) return
          emitTenantEvent(
            webhookSubs,
            row.ownerTenantId,
            'connection.authorization_expired',
            {
              connection_id: row.id,
              vertical: row.vertical,
              platform: row.platform,
              tenant_id: row.tenantId,
              owner_tenant_id: row.ownerTenantId,
              label: row.label,
              failed_at: Date.now(),
            },
            { deliveries: webhookDeliveries, resolvePlatformName },
          )
        },
        // invalid_client: the platform's OAuth client credentials were rejected.
        // Distinct event so subscribers can alert the operator to fix the
        // client id/secret rather than telling customers to re-authorize.
        onPlatformCredentialsInvalid: (row) => {
          if (!row.ownerTenantId || !row.vertical) return
          emitTenantEvent(
            webhookSubs,
            row.ownerTenantId,
            'connection.platform_credentials_invalid',
            {
              connection_id: row.id,
              vertical: row.vertical,
              platform: row.platform,
              tenant_id: row.tenantId,
              owner_tenant_id: row.ownerTenantId,
              label: row.label,
              failed_at: Date.now(),
            },
            { deliveries: webhookDeliveries, resolvePlatformName },
          )
        },
        logger: fastify.log,
      })
    : undefined

  return {
    fastify,
    store,
    registry,
    apiKeys,
    oauthClients,
    webhookWorker,
    resourceStore,
    normalizerVersion,
    syncWorkers,
    syncScheduler,
    dataStoreMaintenance,
    refreshKeepAliveWorker,
    destinationWorker: config.destinations?.worker === false ? undefined : destinationWorker,
    license,
    // Close the two shared DbHandles (credential family + data-store). The
    // stores are borrowers; the boot layer owns handle lifecycle.
    closeStores: async () => {
      await credHandle.close()
      if (dataHandle) await dataHandle.close()
    },
  }
}

function numericEnv(name: string): number | undefined {
  const v = process.env[name]
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
