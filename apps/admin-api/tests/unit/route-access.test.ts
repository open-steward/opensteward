/**
 * Route access gate.
 *
 * Boots the real admin-api (the same generator-mode boot as
 * `scripts/generate-admin-openapi.ts`) with a route-access recorder, then
 * asserts, from the guards every route actually carries:
 *
 *   1. every route authenticates the caller, unless it is on the explicit
 *      PUBLIC_ROUTES allow-list below, each entry with its reason;
 *   2. every route on a data-access surface (data, dashboards, destinations,
 *      SQL access, embedded Superset, roles, permissions) checks a permission,
 *      and the permission it checks is the one documented for it in
 *      docs/architecture/permissions-and-roles.md;
 *   3. every route that fails closed for tenant-restricted callers
 *      (`denyRestrictedScope`) declares that 403 in the OpenAPI document.
 *
 * Guards are recognised by the tag `core/auth/route-access.ts` puts on them,
 * so it does not matter whether a route attaches its guard itself or inherits
 * it from a plugin-level `addHook`. A new route that uses neither
 * `fastify.authenticate`, `requireRole`, `requirePermission`, the service
 * secret nor the SCIM token fails here — add a guard, or, if it is meant to be
 * reachable without one, an allow-list entry with the reason.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Permission } from '@opensteward/shared'
import { buildServer } from '../../src/core/server'
import type { Config } from '../../src/config'
import { createRouteAccessRecorder, type RouteAccessRecord } from '../../src/core/auth/route-access'

/** Routes reachable without an admin JWT, service secret or SCIM token. */
const PUBLIC_ROUTES: Record<string, string> = {
  'GET /health': 'Liveness probe for the orchestrator; returns a constant.',
  'GET /version': 'Build metadata (name, version, git sha) for support and probes.',
  'POST /api/auth/login':
    'Password sign-in; this is how a JWT is obtained. Rate-limited and lockout-protected.',
  'GET /api/auth/has-users':
    'The login page asks whether to show first-run setup; returns a single boolean.',
  'POST /api/auth/setup':
    'First-run admin bootstrap: refuses once any user exists, needs BOOTSTRAP_TOKEN when configured, and is loopback-only without one.',
  'GET /api/company-info/public':
    'Branding (name, logo, colour) for the hosted Connect Link page, fetched server-to-server by integration-server.',
  'GET /api/tenant-domains/public':
    'The custom-domain → tenant map integration-server reads to resolve a Connect Link host.',
  'GET /data/platform-logos/config':
    'Public platform-logo bytes for the connect pages and docs portal.',
  'GET /data/platform-logos/manifest.json': 'Public platform-logo manifest (see logos.ts).',
  'GET /data/platform-logos/:file': 'Public platform-logo bytes (see logos.ts).',
  'GET /api/sso/login-options':
    'The login page lists the enabled identity providers before sign-in.',
  'GET /api/sso/:slug/login':
    'Starts an OIDC/SAML sign-in by redirecting to the identity provider.',
  'GET /api/sso/:slug/callback':
    'OIDC redirect target; the IdP response is the credential (state + PKCE checked).',
  'POST /api/sso/:slug/acs':
    'SAML assertion consumer service; the signed assertion is the credential.',
  'POST /api/sso/:slug/ldap-login': 'LDAP bind sign-in; the directory password is the credential.',
  'POST /api/sso/handoff/exchange':
    'Swaps a single-use, short-lived SSO handoff code for a JWT; rate-limited.',
}

/** Data-access surfaces: every route here must check a permission. */
const PERMISSION_SURFACES = [
  /^\/api\/data(\/|$)/,
  /^\/api\/dashboards(\/|$)/,
  /^\/api\/destinations(\/|$)/,
  /^\/api\/sql-access(\/|$)/,
  /^\/api\/analytics\/superset(\/|$)/,
  /^\/api\/roles(\/|$)/,
  /^\/api\/permissions$/,
  /^\/api\/users\/:id\/(role|scope)$/,
]

/** Routes on those surfaces that intentionally check no permission. */
const NO_PERMISSION_ROUTES: Record<string, string> = {
  'GET /api/permissions':
    'The static permission catalog (names and descriptions only); any signed-in user may read it so the UI can label roles.',
}

/**
 * Routes whose effect is deployment-wide (every tenant) and which a
 * non-admin can reach. Each must carry `denyRestrictedScope`: a user limited
 * to some tenants must not change what every tenant gets. Admin-only routes
 * need no entry — admins are always unrestricted (`loadAccess`).
 */
const INSTANCE_WIDE: Record<string, string> = {
  'GET /api/verticals/:vertical/platforms/:slug/config': 'Platform credentials and settings are shared by every tenant.',
  'PUT /api/verticals/:vertical/platforms/:slug/config': 'Platform credentials and settings are shared by every tenant.',
  'POST /api/verticals/:vertical/platforms/:slug/enable': 'Enabling a platform enables it for every tenant.',
  'POST /api/verticals/:vertical/platforms/:slug/disable': 'Disabling a platform disables it for every tenant.',
  'POST /api/scope-groups': 'OAuth scope presets are shared by every tenant.',
  'PUT /api/scope-groups/:id': 'OAuth scope presets are shared by every tenant.',
  'DELETE /api/scope-groups/:id': 'OAuth scope presets are shared by every tenant.',
  'POST /api/notifications/:id/acknowledge': 'Acknowledging clears the notice for everyone.',
  'POST /api/notifications/acknowledge-all': 'Acknowledging clears the notice for everyone.',
  'POST /api/dashboard-tasks/dismissals': 'A dismissal is deployment-wide.',
  'DELETE /api/dashboard-tasks/dismissals/:key': 'A dismissal is deployment-wide.',
  'POST /api/roles': 'Roles are shared by users in every tenant.',
  'PATCH /api/roles/:id': 'Roles are shared by users in every tenant.',
  'DELETE /api/roles/:id': 'Roles are shared by users in every tenant.',
  'PATCH /api/analytics/superset/dashboards/:id':
    'A registered Superset dashboard is shared by every tenant; who sees it is deployment-wide.',
}

/**
 * The permission each data-access route must check, from the tables in
 * docs/architecture/permissions-and-roles.md. `any` means holding one of the
 * listed permissions suffices; otherwise every listed one is required.
 */
function expectedPermissions(
  method: string,
  url: string,
): { all: Permission[] } | { any: Permission[] } | null {
  if (url === '/api/data/connections/:id/resources/:type/export') return { all: ['data:export'] }
  if (url.endsWith('/reveal')) return { all: ['data:read', 'data:read_pii'] }
  if (url.startsWith('/api/data/')) return { all: ['data:read'] }
  if (method === 'PATCH' && url === '/api/analytics/superset/dashboards/:id') {
    return { all: ['dashboards:share_all'] }
  }
  // The dashboard filter's connection list is connection data: both are required.
  if (method === 'GET' && url === '/api/dashboards/connections') {
    return { all: ['dashboards:view', 'connections:read'] }
  }
  if (url.startsWith('/api/dashboards') || url.startsWith('/api/analytics/superset')) {
    return {
      all: [
        method === 'GET' || url.endsWith('/guest-token') ? 'dashboards:view' : 'dashboards:edit',
      ],
    }
  }
  if (url.startsWith('/api/destinations')) return { all: ['destinations:manage'] }
  if (url === '/api/sql-access/catalog') return { all: ['data:read'] }
  if (url.startsWith('/api/sql-access')) return { all: ['sql_access:manage'] }
  if (url.startsWith('/api/roles')) {
    return method === 'GET' ? { any: ['roles:manage', 'users:manage'] } : { all: ['roles:manage'] }
  }
  if (/^\/api\/users\/:id\/(role|scope)$/.test(url)) return { all: ['users:manage'] }
  return null
}

function testConfig(): Config {
  const placeholder = 'route-access-placeholder-secret-with-enough-entropy-for-tests'
  return {
    server: { port: 0, host: '127.0.0.1' },
    jwt: { secret: placeholder, expiresIn: '24h' },
    db: { dialect: 'sqlite', sqlitePath: ':memory:', poolMax: 1 },
    verticals: [],
    storeSecret: placeholder,
    sso: { publicBaseUrl: 'http://localhost:3001', adminUiUrl: 'http://localhost:3000' },
  }
}

const key = (r: Pick<RouteAccessRecord, 'method' | 'url'>) => `${r.method} ${r.url}`

let fastify: FastifyInstance
let routes: RouteAccessRecord[]

beforeAll(async () => {
  const recorder = createRouteAccessRecorder()
  const built = await buildServer(testConfig(), {
    generatorMode: true,
    routeAccessRecorder: recorder,
  })
  fastify = built.fastify
  await fastify.ready()
  // HEAD routes are Fastify's automatic mirrors of GET routes and carry the
  // same hooks; checking the GET covers them.
  routes = recorder.collect().filter((r) => r.method !== 'HEAD')
})

afterAll(async () => {
  await fastify?.close()
})

describe('route access gate', () => {
  it('sees the whole route table, including plugin-level guards', () => {
    expect(routes.length).toBeGreaterThan(150)
    // /api/data/* inherits `authenticate` from a plugin-level addHook and
    // carries its permission on the route: both must be visible.
    const summary = routes.find((r) => key(r) === 'GET /api/data/summary')
    expect(summary?.guards.map((g) => g.kind)).toEqual(
      expect.arrayContaining(['jwt', 'permission']),
    )
    expect(routes.find((r) => key(r) === 'POST /api/auth/login')?.authenticated).toBe(false)
  })

  it('authenticates every route not on the public allow-list', () => {
    const unguarded = routes.filter((r) => !r.authenticated && !(key(r) in PUBLIC_ROUTES)).map(key)
    expect(
      unguarded,
      'these routes have no authentication guard — add fastify.authenticate / requirePermission, ' +
        'or list them in PUBLIC_ROUTES with the reason',
    ).toEqual([])
  })

  it('keeps the public allow-list exact', () => {
    const byKey = new Map(routes.map((r) => [key(r), r]))
    const stale = Object.keys(PUBLIC_ROUTES).filter((k) => {
      const r = byKey.get(k)
      return !r || r.authenticated
    })
    expect(stale, 'allow-listed routes that no longer exist or are now authenticated').toEqual([])
  })

  it('checks a permission on every data-access route', () => {
    const surface = routes.filter((r) => PERMISSION_SURFACES.some((re) => re.test(r.url)))
    expect(surface.length).toBeGreaterThan(40)
    const missing = surface
      .filter((r) => r.permissions.length === 0 && !(key(r) in NO_PERMISSION_ROUTES))
      .map(key)
    expect(missing, 'data-access routes without a requirePermission guard').toEqual([])
  })

  it('checks the documented permission on every data-access route', () => {
    const wrong: string[] = []
    for (const r of routes) {
      if (!PERMISSION_SURFACES.some((re) => re.test(r.url))) continue
      if (key(r) in NO_PERMISSION_ROUTES) continue
      const want = expectedPermissions(r.method, r.url)
      if (!want) {
        wrong.push(`${key(r)}: no expected permission declared in this test`)
        continue
      }
      const guards = r.guards.filter((g) => g.kind === 'permission')
      if ('any' in want) {
        const ok = guards.some(
          (g) => g.any && [...(g.permissions ?? [])].sort().join() === [...want.any].sort().join(),
        )
        if (!ok) wrong.push(`${key(r)}: expected any of ${want.any.join(', ')}`)
      } else {
        const required = new Set(
          guards
            .filter((g) => !g.any || g.permissions?.length === 1)
            .flatMap((g) => g.permissions ?? []),
        )
        const lacking = want.all.filter((p) => !required.has(p))
        if (lacking.length) wrong.push(`${key(r)}: does not require ${lacking.join(', ')}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('guards the avatar routes by sign-in alone; the handler decides self vs users:manage', () => {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const r = routes.find((x) => key(x) === `${method} /api/users/:id/avatar`)
      expect(r?.authenticated, method).toBe(true)
      // No role or permission guard on purpose: every console user may set
      // their own picture and see everyone's. Setting or removing another
      // user's needs users:manage, checked in routes/user-avatars.ts — moving
      // these under the admin-only users plugin would lock viewers out.
      expect(r?.guards.map((g) => g.kind), method).toEqual(['jwt'])
    }
  })

  it('keeps the no-permission allow-list exact', () => {
    const byKey = new Map(routes.map((r) => [key(r), r]))
    const stale = Object.keys(NO_PERMISSION_ROUTES).filter((k) => {
      const r = byKey.get(k)
      return !r || r.permissions.length > 0 || !r.authenticated
    })
    expect(stale).toEqual([])
  })

  it('refuses tenant-restricted callers on every instance-wide route', () => {
    const missing = routes
      .filter((r) => key(r) in INSTANCE_WIDE)
      .filter((r) => !r.guards.some((g) => g.kind === 'scope-deny'))
      .map(key)
    expect(missing, 'instance-wide routes without denyRestrictedScope').toEqual([])
  })

  it('keeps the instance-wide list exact', () => {
    const known = new Set(routes.map(key))
    expect(Object.keys(INSTANCE_WIDE).filter((k) => !known.has(k))).toEqual([])
  })

  it('declares 403 in OpenAPI on every route that fails closed for restricted scope', () => {
    const doc = (
      fastify as unknown as {
        swagger: () => {
          paths?: Record<string, Record<string, { responses?: Record<string, unknown> }>>
        }
      }
    ).swagger()
    const missing: string[] = []
    for (const r of routes) {
      if (r.hidden || !r.guards.some((g) => g.kind === 'scope-deny')) continue
      const oaPath = r.url.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
      const op = doc.paths?.[oaPath]?.[r.method.toLowerCase()]
      if (!op) continue
      if (!op.responses || !('403' in op.responses)) missing.push(key(r))
    }
    expect(missing, 'fail-closed routes whose schema.response lacks 403').toEqual([])
  })
})
