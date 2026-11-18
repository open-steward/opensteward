import { createBaseServer, createVersionRouter, openDb } from '@opensteward/shared'
import jwt from '@fastify/jwt'
import formbody from '@fastify/formbody'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import { fastifyZodOpenApiTransformers } from 'fastify-zod-openapi'
import { registerOpenApiBridge } from './openapi-setup'
import { isoifyTimestamps, enrichErrorBody, LicenseStatusUpstream } from './routes/_openapi'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { Config } from '../config'
import { AdminStore } from './db/admin-store'
import { IdentityStore } from './db/identity-store'
import { RuntimeSettingsStore } from './db/runtime-settings-store'
import { UnifiedClient } from './proxy/client'
import { Aggregator } from './proxy/aggregator'
import { HealthPoller } from './workers/health-poller'
import { AuditRetentionWorker } from './workers/audit-retention-worker'
import { requireAuth, requireRole } from './auth/jwt-auth'
import { createAccessResolver, requirePermission } from './auth/access'
import type { RouteAccessRecorder } from './auth/route-access'
import { createAuthRoutes } from './routes/auth'
import { createUsersRoutes } from './routes/users'
import { createUserAvatarRoutes } from './routes/user-avatars'
import { createVerticalsRoutes } from './routes/verticals'
import { createConnectionsRoutes } from './routes/connections'
import { createNotificationsRoutes } from './routes/notifications'
import { createAuditRoutes, createInternalAuditRoutes } from './routes/audit'
import { createPlatformsRoutes } from './routes/platforms'
import { createCompanyInfoRoutes } from './routes/company-info'
import { createEndUsersRoutes } from './routes/end-users'
import { createConnectSessionsRoutes } from './routes/connect-sessions'
import { createApiKeysRoutes } from './routes/api-keys'
import { createOAuthClientsRoutes } from './routes/oauth-clients'
import { createEndUserTokensRoutes } from './routes/end-user-tokens'
import { createWebhookSubsRoutes } from './routes/webhook-subs'
import { createSyncJobsRoutes } from './routes/sync-jobs'
import { createScopeGroupsRoutes } from './routes/scope-groups'
import { createConnectLinkTemplatesRoutes } from './routes/connect-link-templates'
import { createTenantsRoutes } from './routes/tenants'
import { createDashboardTasksRoutes } from './routes/dashboard-tasks'
import { createRuntimeSettingsRoutes } from './routes/runtime-settings'
import { createLogoRoutes } from './routes/logos'
import { LogoStore } from './db/logo-store'
import { LogoFetchWorker } from './workers/logo-fetch-worker'
import { createIdentityProvidersRoutes } from './routes/identity-providers'
import { createSsoRoutes } from './routes/sso'
import { createScimRoutes } from './routes/scim'
import { IdpProfileSync, type AvatarFetcher } from './auth/idp/profile-sync'
import { createSchemaStatusRoutes } from './routes/schema-status'
import { createLicenseRoutes } from './routes/license'
import { LicenseStatusCache, type LicenseStatusProvider } from './license/status-cache'
import { createRolesRoutes } from './routes/roles'
import { createDataRoutes } from './routes/data'
import { createDashboardsRoutes } from './routes/dashboards'
import { createDestinationsRoutes } from './routes/destinations'
import { createSqlAccessRoutes } from './routes/sql-access'
import { DashboardStore } from './db/dashboard-store'
import { SupersetDashboardStore } from './db/superset-dashboard-store'
import { SupersetClient } from './analytics/superset-client'
import { createSupersetRoutes } from './routes/superset'

export interface BuildServerOptions {
  /**
   * When true, the boot suppresses background workers and side-effecty
   * decorators that would otherwise hold the event loop open. Used by
   * `scripts/generate-admin-openapi.ts` to read `app.swagger()` without
   * starting a listener.
   */
  generatorMode?: boolean
  /**
   * Records every route's guards (`core/auth/route-access.ts`). Installed as
   * the root `onRoute` hook before any route plugin, so it sees them all. Used
   * by the route access gate (`tests/unit/route-access.test.ts`).
   */
  routeAccessRecorder?: RouteAccessRecorder
  /**
   * Replaces the SSRF-guarded network fetch of IdP profile pictures. Tests
   * pass a stub so no suite ever reaches the internet.
   */
  avatarFetcher?: AvatarFetcher
  /**
   * Where the license status comes from. Defaults to a lazy, cached read of
   * integration-server's `GET /admin/license` (core/license/status-cache.ts): no
   * fetch at boot, so generatorMode stays offline. Tests inject a fixed provider.
   */
  licenseStatus?: LicenseStatusProvider
}

export async function buildServer(config: Config, opts: BuildServerOptions = {}) {
  const fastify = await createBaseServer({
    contentSecurityPolicy: false,
    // Company-info branding bundles base64 data-URLs (logo, uploaded font up
    // to ~512KB, favicon) into a single PUT body, which can exceed the 1 MB
    // default once base64-inflated. 4 MB leaves comfortable headroom.
    bodyLimit: 4 * 1024 * 1024,
  })
  if (opts.routeAccessRecorder) fastify.addHook('onRoute', opts.routeAccessRecorder.onRoute)

  // ── Zod validator + serializer compilers ─────────────────────────────────
  // Routes that set `schema:` with Zod schemas get runtime validation on
  // body / querystring / params and JSON serialization on the response.
  // Routes without `schema:` fall back to Fastify's built-in JSON serializer.
  // The same wiring is shared with the unit-test bootstrap so tests
  // exercise the production validator stack.
  await registerOpenApiBridge(fastify)

  // Admin database. One DbHandle (SQLite or Postgres per config.db), opened by
  // the owner store and shared with the sibling stores below.
  const handle = await openDb({
    databaseUrl: config.db.databaseUrl,
    sqlitePath: config.db.sqlitePath,
    poolMax: config.db.poolMax,
  })
  const adminStore = await AdminStore.create(handle)
  // SSO / identity-provider + runtime-settings stores share the same handle.
  const identityStore = await IdentityStore.create(handle, config.storeSecret)
  // Constructed once and injected (was re-`new`-ed per request in 4 places).
  const runtimeSettings = await RuntimeSettingsStore.create(handle)
  // Platform logo bytes + the single-flight fetch job. Same borrowed handle;
  // both tables belong to AdminStore's migration namespace.
  const logoStore = await LogoStore.create(handle)
  // User dashboards (admin_store v4). Same borrowed handle.
  const dashboardStore = await DashboardStore.create(handle)
  // Embedded Superset dashboard registry (admin_store v5). Same borrowed handle.
  const supersetDashboardStore = await SupersetDashboardStore.create(handle)

  // Single proxy client against the unified OpenSteward backend. All
  // vertical filtering happens server-side (connection rows carry `vertical`;
  // adapter routes take :vertical/:slug).
  const unifiedUrl =
    process.env['INTEGRATION_SERVER_URL'] ?? config.verticals[0]?.url ?? 'http://localhost:3010'
  const unifiedClient = new UnifiedClient({
    url: unifiedUrl,
    adminSecret: process.env['ADMIN_SECRET'],
  })
  const verticalNames = config.verticals.map((v) => v.name)
  const aggregator = new Aggregator(unifiedClient, verticalNames)
  // The license is integration-server's (D-A); admin-api asks it, lazily, and caches
  // the answer. Parsing strips unknown keys, so nothing but the status passes through.
  const licenseStatus: LicenseStatusProvider =
    opts.licenseStatus ??
    new LicenseStatusCache(
      async () => LicenseStatusUpstream.parse(await unifiedClient.getLicenseStatus()),
      { log: fastify.log },
    )

  // JWT plugin. `sign.expiresIn` is load-bearing: without it `config.jwt.expiresIn`
  // would be dead config and every operator session token valid forever — deleting
  // a user would leave their issued token working. Tokens are stateless, so
  // an expiry is the only thing that bounds a leaked one.
  await fastify.register(jwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.expiresIn },
  })
  // Parse application/x-www-form-urlencoded for the SAML ACS POST.
  await fastify.register(formbody)

  // Auth decorators — used by routes via fastify.authenticate / fastify.operatorOnly / fastify.adminOnly
  fastify.decorate('authenticate', requireAuth)
  fastify.decorate('operatorOnly', requireRole('operator'))
  fastify.decorate('adminOnly', requireRole('admin'))
  // Permission + tenant-scope resolution (core/auth/access.ts). The resolver
  // is what `getAccess(request)` reads; without it every scope check reads the
  // caller as unrestricted, so it must be decorated before any route plugin.
  fastify.decorate('accessResolver', createAccessResolver(adminStore))
  fastify.decorate('requirePermission', requirePermission)

  // Single response boundary: (1) attach `type` + `requestId` to every error
  // body (uniform contract even for handlers that send `{ error }` directly),
  // and (2) normalise every timestamp field to ISO 8601 (internal storage stays
  // integer epoch-millis). Both are idempotent.
  fastify.addHook('preSerialization', async (request, reply, payload) =>
    isoifyTimestamps(enrichErrorBody(payload, reply.statusCode, String(request.id))),
  )

  // ── OpenAPI / Swagger UI ─────────────────────────────────────────────────
  // The spec is built from every route's `schema:` (Zod) via the
  // fastify-zod-openapi transformer. We do NOT hand-write any document
  // content here — the bridge walks the registered routes and emits the
  // OpenAPI 3.1 JSON on demand.
  //
  // Both /openapi.json and /docs are admin-role-gated. We do not leak the
  // route surface to unauthenticated callers.
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
    name?: string
    version?: string
  }

  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'OpenSteward Admin API',
        version: pkg.version ?? '0.0.0',
        description:
          'Operator-facing REST surface backing the admin UI. JWT-authenticated; ' +
          'every route emits an OpenAPI operation derived from its Zod validator.',
      },
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'JWT minted by POST /api/auth/login. Send as `Authorization: Bearer <token>`.',
          },
        },
      },
      security: [{ BearerAuth: [] }],
    },
    ...fastifyZodOpenApiTransformers,
    // The spec endpoint at /openapi.json is admin-only; the default
    // /documentation/json route from @fastify/swagger is disabled by
    // not setting routePrefix below and by serving the spec via a
    // dedicated handler.
    exposeRoute: false,
  } as Parameters<typeof fastifySwagger>[1])

  // Admin-gated spec + Swagger UI. The library mounts UI assets under
  // /docs/static/* by default; both the HTML and JSON endpoint live
  // behind the same role gate so unauth callers see 401, not the spec.
  await fastify.register(async (scope) => {
    scope.addHook('preHandler', requireAuth)
    scope.addHook('preHandler', requireRole('admin'))

    // The spec endpoint itself is infrastructure — exclude it from
    // the spec so it doesn't need an `operationId` and doesn't bloat
    // the generated SDK / CLI.
    scope.get('/openapi.json', { schema: { hide: true } }, async () => scope.swagger())

    await scope.register(fastifySwaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        deepLinking: true,
        docExpansion: 'list',
      },
    })
  })

  // Health endpoint — hidden from the spec; it's universal infrastructure
  // and not part of the operator surface that downstream codegen consumes.
  fastify.get('/health', { schema: { hide: true } }, async () => ({ status: 'ok' }))

  // /version — { name, version, gitSha, buildTime }. The latter two come
  // from process.env (baked at image-build time via the Dockerfile's
  // GIT_SHA / BUILD_TIME ARGs); name + version come from package.json.
  // Reading at boot keeps the value stable for the process lifetime and
  // avoids bundling the version string into the compiled output.
  await fastify.register(
    createVersionRouter({
      name: pkg.name ?? 'admin-api',
      version: pkg.version ?? '0.0.0',
    }),
  )

  // Routes
  await fastify.register(
    createAuthRoutes(adminStore, runtimeSettings, { bootstrapToken: config.bootstrapToken }),
  )
  await fastify.register(createUsersRoutes(adminStore, identityStore, runtimeSettings))
  // Not inside the users plugin: that one is admin-only, and every console
  // user may set their own picture and see everyone's.
  await fastify.register(createUserAvatarRoutes(adminStore))
  await fastify.register(createRolesRoutes(adminStore, identityStore))
  await fastify.register(createVerticalsRoutes(aggregator))
  await fastify.register(createConnectionsRoutes(aggregator, adminStore))
  await fastify.register(createNotificationsRoutes(adminStore))
  await fastify.register(createAuditRoutes(adminStore))
  await fastify.register(createInternalAuditRoutes(adminStore))
  await fastify.register(createPlatformsRoutes(aggregator, adminStore))
  await fastify.register(createCompanyInfoRoutes(adminStore))
  await fastify.register(createEndUsersRoutes(unifiedClient, adminStore))
  await fastify.register(createConnectSessionsRoutes(unifiedClient, adminStore))
  await fastify.register(createApiKeysRoutes(unifiedClient, adminStore))
  await fastify.register(createOAuthClientsRoutes(unifiedClient, adminStore))
  await fastify.register(createEndUserTokensRoutes(unifiedClient, adminStore))
  await fastify.register(createWebhookSubsRoutes(unifiedClient, adminStore))
  await fastify.register(createSyncJobsRoutes(unifiedClient, adminStore))
  await fastify.register(createScopeGroupsRoutes(adminStore))
  await fastify.register(createConnectLinkTemplatesRoutes(adminStore))
  await fastify.register(createTenantsRoutes(adminStore, licenseStatus))
  await fastify.register(createDashboardTasksRoutes(adminStore, unifiedClient))
  await fastify.register(
    createRuntimeSettingsRoutes(adminStore, unifiedClient, identityStore, runtimeSettings),
  )
  await fastify.register(createLogoRoutes(adminStore, logoStore, runtimeSettings))
  await fastify.register(createIdentityProvidersRoutes(adminStore, identityStore, config))
  // One profile sync for SSO sign-ins and SCIM, so a user's concurrent
  // picture fetches from either path are de-duplicated.
  const idpProfileSync = new IdpProfileSync(adminStore, {
    fetchAvatar: opts.avatarFetcher,
    logger: fastify.log,
  })
  await fastify.register(
    createSsoRoutes(adminStore, identityStore, config, runtimeSettings, {
      profileSync: idpProfileSync,
    }),
  )
  await fastify.register(
    createScimRoutes(adminStore, identityStore, config, { profileSync: idpProfileSync }),
  )
  await fastify.register(createSchemaStatusRoutes(adminStore))
  await fastify.register(createLicenseRoutes(licenseStatus, adminStore))
  await fastify.register(createDataRoutes(unifiedClient, adminStore, runtimeSettings))
  await fastify.register(
    createDashboardsRoutes(dashboardStore, unifiedClient, adminStore, runtimeSettings),
  )
  // Optional embedded Superset (off unless SUPERSET_URL is set).
  await fastify.register(
    createSupersetRoutes({
      store: supersetDashboardStore,
      adminStore,
      client: config.superset
        ? new SupersetClient({
            url: config.superset.url,
            username: config.superset.serviceUsername,
            password: config.superset.servicePassword,
          })
        : null,
      publicUrl: config.superset?.publicUrl ?? null,
    }),
  )
  await fastify.register(createDestinationsRoutes(unifiedClient, adminStore, runtimeSettings))
  await fastify.register(createSqlAccessRoutes(unifiedClient, adminStore))

  // Background health poller — suppressed in generator mode so
  // `scripts/generate-admin-openapi.ts` can boot the app and emit the
  // spec without holding the event loop open with a timer.
  const healthPoller = opts.generatorMode
    ? ({
        start: () => {},
        stop: () => {},
      } as unknown as HealthPoller)
    : new HealthPoller(aggregator, adminStore)

  // Background audit-log retention sweep — suppressed in generator mode for
  // the same reason as the health poller (don't hold the event loop open).
  const auditRetentionWorker = opts.generatorMode
    ? ({
        start: () => {},
        stop: () => {},
      } as unknown as AuditRetentionWorker)
    : new AuditRetentionWorker(adminStore, runtimeSettings)

  // Platform logo fetcher. Suppressed in generator mode alongside the other
  // two workers — its poll timer would hold the event loop open and
  // `pnpm docs:all` would never exit.
  const logoFetchWorker = opts.generatorMode
    ? ({
        start: () => {},
        stop: () => {},
      } as unknown as LogoFetchWorker)
    : new LogoFetchWorker({
        logoStore,
        settings: runtimeSettings,
        unifiedClient,
        adminStore,
        adminUiUrl: config.sso.adminUiUrl,
        logger: {
          info: (msg) => fastify.log.info(msg),
          warn: (msg, err) => fastify.log.warn({ err }, msg),
          error: (msg, err) => fastify.log.error({ err }, msg),
        },
      })

  return {
    fastify,
    adminStore,
    healthPoller,
    auditRetentionWorker,
    logoFetchWorker,
    idpProfileSync,
  }
}
