import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import formbody from '@fastify/formbody'
import view from '@fastify/view'
import staticPlugin from '@fastify/static'
import ejs from 'ejs'
import { readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import {
  createVersionRouter,
  brandingHead,
  buildLoggerConfig,
  registerLogoProxy,
  type HostBranding,
} from '@opensteward/shared'
import { designSystemRoot } from '@opensteward/design-system'
import type { Config } from '../config'
import { AdminApiClient } from './proxy/admin-api-client'
import { statusPill, navLinkAttrs, jsonForScript, avatar } from './views/helpers'
import { sortHref, tableQs } from './views/table-controls'
import { createLoginRoutes } from './routes/login'
import { createSetupRoutes } from './routes/setup'
import { createDashboardRoutes } from './routes/dashboard'
import { createConnectionsRoutes } from './routes/connections'
import { createPlatformsDataRoutes } from './routes/platforms-data'
import { platformHasGuide } from './routes/platform-catalog'
import { createAuditRoutes } from './routes/audit'
import { createUsersRoutes } from './routes/users'
import { createUserProfileRoutes, AVATAR_PATH } from './routes/user-profile'
import { createNotificationsRoutes, formatUnreadCount } from './routes/notifications'
import { createWizardRoutes } from './routes/wizard'
import { createCompanyInfoRoutes } from './routes/company-info'
import { createConnectLinksRoutes } from './routes/connect-links'
import { createCustomersRoutes } from './routes/customers'
import { createApiKeysRoutes } from './routes/api-keys'
import { createOAuthClientsRoutes } from './routes/oauth-clients'
import { createWebhooksRoutes } from './routes/webhooks'
import { createSyncJobsRoutes } from './routes/sync-jobs'
import { createPlatformsRoutes } from './routes/platforms'
import { createScopeGroupsRoutes } from './routes/scope-groups'
import { createConnectLinkTemplatesRoutes } from './routes/connect-link-templates'
import { createTenantsRoutes } from './routes/tenants'
import { createSettingsRoutes } from './routes/settings'
import { createVersionInfoCollector } from './version-info'
import { licenseAlert, type LicenseAlert } from './license-view'
import { createIdentityProvidersRoutes } from './routes/identity-providers'
import { createSsoRoutes } from './routes/sso'
import type { SessionUser } from './auth/middleware'
import { SESSION_COOKIE_ATTRIBUTES } from './auth/session-cookie'
import { csrfProtection, generateCsrfToken } from './auth/csrf'
import { registerFlash } from './flash'
import type { CompanyInfoRecord, MyAccess } from './proxy/admin-api-client'
import { createRolesRoutes } from './routes/roles'
import { createDataRoutes } from './routes/data'
import { createDashboardsRoutes } from './routes/dashboards'
import { createSupersetRoutes } from './routes/superset'
import { createDestinationsRoutes } from './routes/destinations'
import { createSqlAccessRoutes } from './routes/sql-access'
import { permissionsForBuiltin, PERMISSIONS } from '@opensteward/shared'

declare module 'fastify' {
  interface FastifyRequest {
    /** Loaded by a preHandler hook for authenticated requests; null if unset. */
    companyInfo?: CompanyInfoRecord | null
  }
}

export async function buildServer(config: Config) {
  // 4 MB body limit (vs Fastify's 1 MB default): the company-info form posts
  // base64 data-URLs for the logo, an uploaded font (~512KB), and a favicon as
  // url-encoded fields, which can exceed 1 MB once base64-inflated.
  // `buildLoggerConfig`, not a bare `logger: true`: it layers in the shared
  // LOG_REDACT_PATHS so session cookies, auth headers and credential-bearing
  // upstream errors are censored here the same way they are in every other
  // service. This app builds its own Fastify instance rather than calling
  // createBaseServer (it registers rate-limiting per-route, not globally),
  // so it must apply buildLoggerConfig itself — a bare `logger: true` would
  // lose the shared redaction.
  const fastify = Fastify({ logger: buildLoggerConfig(true), bodyLimit: 4 * 1024 * 1024 })

  // Admin API client — all data flows through the Admin API
  const adminApiClient = new AdminApiClient(config.admin_api.url)

  // Plugins
  await fastify.register(cookie, { secret: config.session.secret })
  // Baseline security headers on the operator console (X-Content-Type-Options,
  // X-Frame-Options, Referrer-Policy, HSTS in production, …). This app builds
  // its own Fastify instance rather than createBaseServer, so helmet must be
  // registered here directly. CSP is off — a strict nonce-based policy across
  // every EJS view would be breakage-prone, and the inline-script XSS sinks
  // are neutralized by jsonForScript; the cross-origin isolation policies are
  // disabled so same-origin asset loads (design CSS, logos) are unaffected.
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
  })
  await fastify.register(formbody)
  await fastify.register(rateLimit, { global: false }) // applied per-route, not globally
  await fastify.register(view, {
    engine: { ejs },
    root: join(__dirname, '..', '..', 'views'),
    layout: 'layout.ejs',
    defaultContext: {
      // The existing templates begin with
      //   <% layout('../layout', { title: 'X' }); locals.title = ('X') -%>
      // The first call is an ejs-mate-style no-op kept for visual continuity
      // with the source; the second statement is what actually puts the title
      // into the data object that @fastify/view re-uses when rendering the
      // outer layout.ejs. The shim below absorbs the `layout(...)` call so it
      // doesn't ReferenceError.
      layout: () => {},
      // statusPill(status) — single source of truth for status badges across
      // every list/detail view. See views/helpers.ts.
      statusPill,
      // navLinkAttrs(href, path) — marks the sidebar entry for the current
      // page, including aria-current. See views/helpers.ts.
      navLinkAttrs,
      // jsonForScript(x) — the ONLY safe way to embed a value inside an inline
      // <script>. `<%- JSON.stringify(x) %>` does not neutralize `</script>`
      // and is a reflected/stored XSS. See views/helpers.ts.
      jsonForScript,
      // sortHref(state, spec, key) — where a sortable column header points.
      // A plain link: no-interpolation-in-inline-js.test.ts bans an on* handler
      // carrying EJS output. See views/table-controls.ts.
      sortHref,
      // tableQs(state, spec) — a table's sort/filter state as a query string,
      // for views/_pagination.ejs to append `&page=N` to. Wired here rather
      // than deferred to the task that first calls it from a view: a helper
      // missing from defaultContext is undefined at render time, not a
      // TypeScript error. See views/table-controls.ts.
      tableQs,
      // avatar(person, size?, label?) — a user's picture, or their initials
      // when they have none. See views/helpers.ts.
      avatar,
    },
  })
  // Auto-extract page titles from each view's leading `layout(..., { title: 'X' })`.
  // @fastify/view rebuilds the data object for the inner + layout renders
  // (see `withLayout` / `viewEjs` in node_modules/@fastify/view/index.js), so
  // mutations the inner template makes to `locals` don't reach the layout.
  // Instead we hoist the title out of the .ejs source text and feed it as a
  // top-level `title` field on the data object — which the layout reads
  // natively. Routes can still pass `title` explicitly to override (or to
  // handle dynamic titles like `customer.email`).
  const viewsRoot = join(__dirname, '..', '..', 'views')
  const titleCache = new Map<string, string>()
  function extractTitleFromView(viewName: string): string | undefined {
    const cached = titleCache.get(viewName)
    if (cached !== undefined) return cached || undefined
    try {
      const abs = join(viewsRoot, viewName.endsWith('.ejs') ? viewName : `${viewName}.ejs`)
      const head = readFileSync(abs, 'utf8').slice(0, 400)
      const m =
        /<%\s*layout\([^,]+,\s*\{\s*title:\s*'([^']+)'\s*\}\s*\)/.exec(head) ??
        /<%\s*layout\([^,]+,\s*\{\s*title:\s*"([^"]+)"\s*\}\s*\)/.exec(head)
      const title = m ? m[1] : ''
      titleCache.set(viewName, title)
      return title || undefined
    } catch {
      titleCache.set(viewName, '')
      return undefined
    }
  }
  fastify.addHook('preHandler', (request, reply, done) => {
    const orig = reply.view.bind(reply)
    reply.view = ((page: string, data?: Record<string, unknown>, opts?: unknown) => {
      const merged = { ...(data ?? {}) }
      if (merged.title === undefined) {
        const t = extractTitleFromView(page)
        if (t) merged.title = t
      }
      return orig(page, merged, opts as undefined)
    }) as typeof reply.view
    done()
  })

  await fastify.register(staticPlugin, {
    root: join(__dirname, '..', '..', 'public'),
    prefix: '/public/',
  })
  await fastify.register(staticPlugin, {
    root: designSystemRoot,
    prefix: '/design/',
    decorateReply: false,
  })
  // Vendored browser libraries, served same-origin so the dashboards' strict
  // CSP (`script-src 'self'`) can load them. Only the one file is exposed —
  // not the rest of the package directory.
  await fastify.register(staticPlugin, {
    root: dirname(require.resolve('echarts/dist/echarts.min.js')),
    prefix: '/vendor/',
    decorateReply: false,
    allowedPath: (pathName) => pathName === '/echarts.min.js',
    maxAge: '1d',
  })
  // The Apache Superset embedded SDK (UMD build, global `supersetEmbeddedSdk`)
  // for the optional embedded dashboards. Its file is `bundle/index.js`, so it
  // is served under a stable name by an explicit route — again only that one
  // file — rather than a second static mount on the same prefix.
  const supersetSdkPath = require.resolve('@superset-ui/embedded-sdk/bundle/index.js')
  let supersetSdk: Buffer | null = null
  fastify.get('/vendor/superset-embedded-sdk.js', async (_request, reply) => {
    supersetSdk ??= readFileSync(supersetSdkPath)
    return reply
      .type('application/javascript; charset=utf-8')
      .header('Cache-Control', 'public, max-age=86400')
      .send(supersetSdk)
  })

  // Platform logos. Served from the admin-api database first (logos fetched
  // from Platforms → Logos), falling back to <repo>/docs/platforms/logos for
  // deployments that used the CLI fetcher.
  //
  // Registered unconditionally: gating the mount on a boot-time existsSync
  // would never serve a logo set that appears later — a fetch, a mounted
  // volume, a docker cp — until a restart.
  const platformLogosRoot = join(__dirname, '..', '..', '..', '..', 'docs', 'platforms', 'logos')
  registerLogoProxy(fastify, { diskRoot: platformLogosRoot })

  // Session deserialization — parse signed cookie into request.sessionUser.
  //
  // A cookie that does not verify is CLEARED, not merely ignored. The CSRF
  // token is an HMAC over the raw cookie value (`auth/csrf.ts`), so a browser
  // that keeps sending a cookie this process cannot verify — signed under a
  // rotated SESSION_SECRET, or by a container since replaced — is a browser
  // whose next POST can fail CSRF for reasons the operator cannot see. Seen
  // 2026-09-12 after a full-stack redeploy: login answered
  // `{"error":"Invalid or missing CSRF token"}` until the cookie was cleared
  // by hand. Cleared with the attributes the login route sets it with, or the
  // browser treats the deletion as a different cookie and keeps the old one.
  fastify.addHook('preHandler', (request, reply, done) => {
    const raw = request.cookies['session']
    if (raw) {
      const unsigned = request.unsignCookie(raw)
      let accepted = false
      if (unsigned.valid && unsigned.value) {
        try {
          const parsed = JSON.parse(unsigned.value)
          request.sessionUser = parsed as SessionUser
          accepted = true
        } catch {
          /* invalid cookie data — cleared below */
        }
      }
      if (!accepted) reply.clearCookie('session', SESSION_COOKIE_ATTRIBUTES)
    }
    done()
  })

  // Effective permissions + tenant scope for the signed-in user, from
  // admin-api's `GET /api/auth/me`. Loaded from the database there, so a role
  // or scope change made after sign-in shows up here within the cache window
  // without a re-login. Cached per session token for 30s: every page and
  // every POST needs it (navigation, `requirePermission`), and one `/me` per
  // request would double the admin-api traffic of a busy console. Falls back
  // to the built-in set of the session's role when admin-api is unreachable
  // or predates the permission model — admin-api enforces the real answer on
  // every call either way; this only decides what the UI offers.
  const ACCESS_TTL_MS = 30_000
  const accessCache = new Map<string, { expiresAt: number; access: MyAccess | null }>()
  fastify.addHook('preHandler', async (request) => {
    const user = request.sessionUser
    if (!user?.token || skipsShellData(request.url)) return
    const now = Date.now()
    let hit = accessCache.get(user.token)
    if (!hit || hit.expiresAt <= now) {
      let access: MyAccess | null = null
      try {
        access = await adminApiClient.getMyAccess(user.token)
      } catch {
        access = null
      }
      if (accessCache.size >= 500) {
        const oldest = accessCache.keys().next().value
        if (oldest !== undefined) accessCache.delete(oldest)
      }
      hit = { expiresAt: now + ACCESS_TTL_MS, access }
      accessCache.set(user.token, hit)
    }
    if (hit.access) {
      user.permissions = hit.access.permissions
      user.scope = hit.access.scope
      user.roleName = hit.access.roleName
      user.avatarVersion = hit.access.avatarVersion ?? null
    } else {
      const held = permissionsForBuiltin(user.role)
      user.permissions = PERMISSIONS.filter((p) => held.has(p))
      user.scope = { mode: 'all', grants: [] }
      user.roleName = user.role
    }
  })

  // The login page is never served from cache. Its CSRF token is bound to the
  // session cookie at render time; a cached copy resubmits a token minted for
  // a cookie that may since have been cleared or replaced. Covers the local
  // form, its failure re-renders and the `/login/sso/…` hops alike.
  fastify.addHook('onRequest', (request, reply, done) => {
    if (
      request.url === '/login' ||
      request.url.startsWith('/login/') ||
      request.url.startsWith('/login?')
    ) {
      reply.header('Cache-Control', 'no-store')
    }
    done()
  })

  // CSRF protection — validates token on POST/PUT/DELETE
  fastify.addHook('preHandler', csrfProtection(config.session.secret))

  // Make CSRF token available to all views — written to reply.locals so every
  // EJS template sees `csrfToken` without each route having to thread it.
  fastify.addHook('preHandler', (request, reply, done) => {
    const sessionCookie = request.cookies['session'] ?? ''
    const token = generateCsrfToken(sessionCookie, config.session.secret)
    ;(request as any).csrfToken = token
    const locals = ((reply as any).locals ??= {})
    locals.csrfToken = token
    done()
  })

  // Flash messages — the one mechanism for reporting an action's outcome.
  // Registered here, after the csrfToken hook and before the two async
  // admin-api-calling hooks below, so a message still renders on a page where
  // those short-circuit or fail. See core/flash.ts.
  registerFlash(fastify)

  // First-run guard — redirect to setup if Admin API has no users
  fastify.addHook('preHandler', async (request, reply) => {
    // `/data/platforms/logos` and the logo-status poll are exempt for cost,
    // not for auth: hasUsers() is an uncached HTTP call to admin-api, one
    // catalog page issues 100+ logo requests, and the status endpoint is
    // polled for the length of a fetch. Both carry their own gating.
    if (
      request.url.startsWith('/setup') ||
      request.url.startsWith('/public') ||
      request.url.startsWith('/design') ||
      request.url.startsWith('/vendor/') ||
      request.url.startsWith('/data/platforms/logos') ||
      request.url.startsWith('/platforms/logos/status') ||
      request.url === '/health' ||
      request.url === '/version' ||
      request.url === '/api/version-info' ||
      // Pictures, for cost: a users table issues one request per row.
      AVATAR_PATH.test(request.url)
    ) {
      return
    }
    try {
      const hasUsers = await adminApiClient.hasUsers()
      if (!hasUsers) {
        return reply.redirect('/setup/init')
      }
    } catch {
      // If Admin API is unreachable, continue (login will fail anyway)
    }
  })

  // Routes that never render the signed-in shell: the unauthenticated pages
  // (login, /setup/init), assets, the JSON endpoints, and the authenticated
  // fragments a page fetches after it has drawn (the platforms catalog JSON,
  // the logo-progress poll and panel on both the platforms tab and the
  // wizard). The layout-level admin-api reads below (company info, unread
  // count) skip these — the user has no token yet, or nothing they fetch
  // would be shown. The wizard pages at /setup/wizard/* ARE authenticated
  // and DO need both; only their fragments are listed here.
  function skipsShellData(url: string): boolean {
    return (
      url.startsWith('/login') ||
      url.startsWith('/setup/init') ||
      url.startsWith('/public') ||
      url.startsWith('/design') ||
      url.startsWith('/vendor/') ||
      url.startsWith('/data/platforms/') ||
      url.startsWith('/platforms/logos/status') ||
      url === '/platforms/logos/panel' ||
      url === '/setup/wizard/logos/status' ||
      url === '/setup/wizard/logos/panel' ||
      url === '/health' ||
      url === '/version' ||
      url === '/api/version-info' ||
      // A profile picture renders no shell.
      AVATAR_PATH.test(url)
    )
  }

  // Load company info into request context for layout-level branding.
  fastify.addHook('preHandler', async (request) => {
    request.companyInfo = null
    if (skipsShellData(request.url)) return
    if (!request.sessionUser?.token) return
    try {
      request.companyInfo = await adminApiClient.getCompanyInfo(request.sessionUser.token)
    } catch {
      request.companyInfo = null
    }
  })

  // Inject `companyInfo` into reply.locals so every view sees it via the
  // layout's `typeof companyInfo !== 'undefined'` check, without needing to
  // thread it through every route handler. We MUTATE rather than reassign so
  // @fastify/view's captured reference picks up the value.
  fastify.addHook('preHandler', (request, reply, done) => {
    const locals = ((reply as any).locals ??= {})
    locals.companyInfo = request.companyInfo ?? null
    // Pre-render the operator's branding <head> fragment (favicon, font,
    // accent overrides) so the layout can apply it to the admin UI itself —
    // not just the Connect Link pages. Same helper, same tokens.
    const c = request.companyInfo
    locals.brandingHead = c
      ? brandingHead({
          name: c.name ?? null,
          logoDataUrl: c.logoDataUrl ?? null,
          primaryColor: c.primaryColor ?? null,
          secondaryColor: c.secondaryColor ?? null,
          fontFamily: c.fontFamily ?? null,
          fontDataUrl: c.fontDataUrl ?? null,
          fontUrl: c.fontUrl ?? null,
          faviconDataUrl: c.faviconDataUrl ?? null,
          hideAttribution: c.hideAttribution ?? false,
          supportEmail: c.supportEmail ?? null,
          privacyPolicyUrl: c.privacyPolicyUrl ?? null,
          termsOfServiceUrl: c.termsOfServiceUrl ?? null,
          baseUrl: c.baseUrl ?? null,
        } satisfies HostBranding)
      : ''
    // Browser-facing docs-server URL for cross-app links. Admin views
    // (wizard step 5 / configure-page guide callout) prefix `/guides/*`
    // hrefs with this so the link works from the user's browser, where
    // admin and docs-server live on different origins.
    locals.docsServerUrl = config.docs_server.url
    // Whether a platform actually has an integration guide. Only ~80 of
    // 1,545 platforms have one, so the credentials partial must gate its
    // guide card on this — linking unconditionally would offer every other
    // platform a prominent card that 404s. Injected here rather than passed
    // per-route because the partial is included from two places (the platform
    // detail page and wizard step 4) and a route that forgot it would take a
    // default, whichever default that is, and be wrong.
    locals.hasIntegrationGuide = platformHasGuide
    // Path only — the sidebar highlights a section, and a query string would
    // make /platforms?tab=logos a different "page" from /platforms.
    locals.currentPath = request.url.split('?')[0]
    done()
  })

  // Unread-notification count for the header bell, on every signed-in page.
  // Server-rendered so the number is the same one every other page shows, and
  // best-effort so an admin-api outage costs the badge and never the page:
  // `null` renders a bell with no count, and the layout's label says nothing
  // about "0 unread" — unknown is not zero. The number is admin-api's own
  // (`GET /api/notifications/unread-count`: exact, `credential_expiring` left
  // out in SQL), so this costs one small read rather than a 50-row page to
  // count over here. GET only: a POST renders no shell, and paying a
  // round-trip on every write for a header it never draws would be waste.
  // The signed-out shell has no header, hence the token check.
  fastify.addHook('preHandler', async (request, reply) => {
    const locals = ((reply as any).locals ??= {})
    locals.unreadNotifications = null
    if (request.method !== 'GET' || skipsShellData(request.url)) return
    const token = request.sessionUser?.token
    if (!token) return
    try {
      locals.unreadNotifications = formatUnreadCount(
        await adminApiClient.getUnreadNotificationCount(token),
      )
    } catch {
      locals.unreadNotifications = null
    }
  })

  // License banner (EXPIRING, GRACE, DEGRADED, INVALID, MISSING), admins only:
  // GET /api/license is admin-only and nobody else can act on it. One
  // deployment-wide answer, cached 60 s after an answer and 15 s after an outage.
  // A 401/403 belongs to this session (expired, demoted), not to the deployment,
  // so it is never cached — it would hide the banner from every other admin. A
  // failure costs the banner, never the page — and so does a 200 whose record
  // the alert cannot be built from (version skew), which is cached like an
  // outage: the alert is built inside the same try. Skipped for non-GET
  // requests, pages without the shell, the JSON endpoints and the System page
  // (which shows its own alert).
  let licenseBannerCache: { until: number; banner: LicenseAlert | null } | null = null
  fastify.addHook('preHandler', async (request, reply) => {
    const locals = ((reply as any).locals ??= {})
    locals.licenseBanner = null
    if (request.method !== 'GET' || skipsShellData(request.url) || request.url.startsWith('/api/'))
      return
    const user = request.sessionUser
    if (!user?.token || user.role !== 'admin' || request.url.split('?')[0] === '/settings/system')
      return
    const now = Date.now()
    if (!licenseBannerCache || licenseBannerCache.until <= now) {
      try {
        const banner = licenseAlert(await adminApiClient.getLicense(user.token))
        licenseBannerCache = { until: now + 60_000, banner }
      } catch (err) {
        const status = (err as { response?: { status?: number } } | null)?.response?.status
        if (status === 401 || status === 403) return
        licenseBannerCache = { until: now + 15_000, banner: null }
      }
    }
    locals.licenseBanner = licenseBannerCache.banner
  })

  // Health endpoint (no auth required)
  fastify.get('/health', async () => ({ status: 'ok' }))

  // /version — { name, version, release, gitSha, buildTime }. JSON, no auth.
  // See apps/admin-api/src/core/server.ts for the cwd-relative
  // package.json read rationale.
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
    name?: string
    version?: string
  }
  await fastify.register(
    createVersionRouter({
      name: pkg.name ?? 'admin',
      version: pkg.version ?? '0.0.0',
    }),
  )

  // /api/version-info — every service's /version, fanned in here so the
  // browser stays same-origin (the admin UI lives on a different host than the
  // backend in real deployments). Best-effort: a downstream timeout yields a
  // `null` for that service, not a 500 — the footer should never blank out the
  // rest of the UI because admin-api was slow. The System page reads the same
  // collector directly; see ./version-info.ts.
  const collectVersionInfo = createVersionInfoCollector({
    adminApiUrl: config.admin_api.url,
    pkg,
  })
  fastify.get('/api/version-info', async () => collectVersionInfo())

  // Routes
  // Registered BEFORE the route plugins below, and that order is load-bearing:
  // Fastify copies the parent's error handler into each child context at
  // registration time, so a handler set after `fastify.register(...)` never runs
  // for those routes.
  fastify.setErrorHandler((err, request, reply) => {
    const e = err as {
      statusCode?: number
      requestId?: string
      response?: { status?: number; data?: { error?: unknown } }
    }
    const status = e.response?.status ?? e.statusCode ?? 500
    if (status === 401) return reply.redirect('/login')
    const apiError = e.response?.data?.error
    const message =
      (typeof apiError === 'string' ? apiError : undefined) ??
      (apiError && typeof apiError === 'object' && 'message' in apiError
        ? String((apiError as { message?: unknown }).message)
        : undefined) ??
      (err instanceof Error ? err.message : undefined) ??
      'Something went wrong.'
    request.log.error({ err, requestId: e.requestId }, 'admin UI request failed')
    return reply.status(status >= 400 && status < 600 ? status : 500).view('error.ejs', {
      user: request.sessionUser ?? null,
      status,
      message,
      requestId: e.requestId ?? null,
    })
  })

  await fastify.register(createSetupRoutes(adminApiClient))
  await fastify.register(createLoginRoutes(adminApiClient, config.session.secret))
  await fastify.register(createDashboardRoutes(adminApiClient))
  await fastify.register(createConnectionsRoutes(adminApiClient))
  await fastify.register(createPlatformsDataRoutes(adminApiClient))
  await fastify.register(createAuditRoutes(adminApiClient))
  await fastify.register(createUsersRoutes(adminApiClient))
  await fastify.register(
    createUserProfileRoutes(adminApiClient, {
      forgetSessionAccess: (token) => accessCache.delete(token),
    }),
  )
  await fastify.register(createRolesRoutes(adminApiClient))
  await fastify.register(createDataRoutes(adminApiClient))
  await fastify.register(createDashboardsRoutes(adminApiClient))
  await fastify.register(createSupersetRoutes(adminApiClient))
  await fastify.register(createDestinationsRoutes(adminApiClient))
  await fastify.register(createSqlAccessRoutes(adminApiClient))
  await fastify.register(createNotificationsRoutes(adminApiClient))
  await fastify.register(createWizardRoutes(adminApiClient))
  await fastify.register(createCompanyInfoRoutes(adminApiClient))
  await fastify.register(createConnectLinksRoutes(adminApiClient))
  await fastify.register(createCustomersRoutes(adminApiClient))
  await fastify.register(createApiKeysRoutes(adminApiClient))
  await fastify.register(createOAuthClientsRoutes(adminApiClient))
  await fastify.register(createWebhooksRoutes(adminApiClient))
  await fastify.register(createSyncJobsRoutes(adminApiClient))
  await fastify.register(
    createPlatformsRoutes(adminApiClient, { docsServerUrl: config.docs_server.url }),
  )
  await fastify.register(createScopeGroupsRoutes(adminApiClient))
  await fastify.register(createConnectLinkTemplatesRoutes(adminApiClient))
  await fastify.register(createTenantsRoutes(adminApiClient))
  await fastify.register(createSettingsRoutes(adminApiClient, collectVersionInfo))
  await fastify.register(createIdentityProvidersRoutes(adminApiClient, config))
  await fastify.register(createSsoRoutes(adminApiClient, config))

  // Friendly error page. A failed upstream admin-API call (or any thrown route
  // error) renders `error.ejs` with the correlation id (`requestId`, surfaced by
  // the proxy interceptor) so operators can quote it to support. A 401 from the
  // API means the session is stale → bounce to login.

  return { fastify }
}
