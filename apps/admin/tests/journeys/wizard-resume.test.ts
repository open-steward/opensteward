/**
 * Returning to the setup wizard resumes where setup actually stands.
 *
 * Returning to `/setup/wizard` redirects to the first incomplete step and the
 * rail ticks what is done — anything less is indistinguishable from a fresh
 * install even with branding saved and platforms enabled.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCompanyInfo = vi.fn(async () => null as unknown)
const mockGetVerticals = vi.fn(async () => [{ name: 'accounting', status: 'up', adapterCount: 0 }])
// One call answers every vertical, and each row names its own vertical —
// per-vertical calls would cost nine requests a page view.
const mockListAllPlatformRows = vi.fn(async () => [] as unknown[])
const mockListConnections = vi.fn(async () => [] as unknown[])
const mockListApiKeys = vi.fn(async () => [] as unknown[])
const mockListWebhookSubs = vi.fn(async () => [] as unknown[])

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getCompanyInfo: mockGetCompanyInfo,
      getVerticals: mockGetVerticals,
      listAllPlatformRows: mockListAllPlatformRows,
      listConnections: mockListConnections,
      listApiKeys: mockListApiKeys,
      listWebhookSubs: mockListWebhookSubs,
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      getDataStoreMetrics: async () => {
        return {
          mode: 'database',
          rows: { total: 0 },
          db_size_mb: 0,
          sync_jobs: { pending: 0, running: 0 },
        }
      },
      listTenants: async () => {
        return [{ id: 'default', name: 'Default' }]
      },
      listTenantDomains: async () => {
        return []
      },
      getPlatformConfig: async () => {
        return null
      },
      // The logos step reads these; the wizard walk below visits every step,
      // so they must be stubbed.
      listRuntimeSettings: async () => {
        return []
      },
      getActiveLogoFetch: async () => {
        return null
      },
      getLogoStatus: async () => {
        return { count: 0, totalBytes: 0, lastFetchedAt: null }
      },
      listScopeGroups: async () => {
        return []
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'admin-wizard-resume-secret-must-be-long'
let fastify: FastifyInstance

/** Branding saved, one platform enabled, credentials still missing. */
function midSetup() {
  mockGetCompanyInfo.mockResolvedValue({ name: 'ACME' })
  mockGetVerticals.mockResolvedValue([{ name: 'accounting', status: 'up', adapterCount: 1 }])
  mockListAllPlatformRows.mockResolvedValue([
    { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: false },
  ])
}

/** The rail markup only, so page-body links don't muddy the assertions. */
function rail(body: string): string {
  const start = body.indexOf('<aside class="wizard-rail">')
  return start === -1 ? '' : body.slice(start, body.indexOf('</aside>', start))
}

/** Each step's rendered status, in rail order. */
function railStatuses(body: string): string[] {
  return [...rail(body).matchAll(/wizard-rail__item--(done|current|upcoming)/g)].map((m) => m[1])
}

function session(role = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))
}

beforeEach(async () => {
  mockGetCompanyInfo.mockResolvedValue(null)
  mockGetVerticals.mockResolvedValue([{ name: 'accounting', status: 'up', adapterCount: 0 }])
  mockListAllPlatformRows.mockResolvedValue([])
  mockListConnections.mockResolvedValue([])
  mockListApiKeys.mockResolvedValue([])
  mockListWebhookSubs.mockResolvedValue([])

  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: 'http://localhost:3001' },
    docs_server: { url: 'http://localhost:3003' },
    sso: { publicBaseUrl: 'http://localhost:3000' },
  })
  fastify = built.fastify
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
})

describe('Journey: an operator returns to a half-finished wizard', () => {
  it('resumes at the credentials step', async () => {
    // Deliberately bare: the route resolves the adapter, so the resume
    // redirect and the rail's own link land in the same place. Which adapter
    // it picks is covered in wizard-credentials-step.test.ts.
    midSetup()
    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard',
      cookies: { session: session() },
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/setup/wizard/configure')
  })

  it('still renders step 1 on a fresh deployment', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard',
      cookies: { session: session() },
    })
    expect(res.statusCode).toBe(200)
  })

  it('lets the rail link back to step 1 without bouncing out again', async () => {
    // Without the escape hatch the rail's own "Data store" link would redirect
    // straight back to the resume target — an infinite loop.
    midSetup()
    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard?stay=1',
      cookies: { session: session() },
    })
    expect(res.statusCode).toBe(200)
  })

  it('never resumes a non-admin into the admin-only steps', async () => {
    midSetup()
    mockListAllPlatformRows.mockResolvedValue([
      { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true },
    ])
    mockListConnections.mockResolvedValue([{ id: 'c1' }])
    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard',
      cookies: { session: session('operator') },
    })
    expect(res.statusCode).toBe(200)
  })

  it('ticks a finished step that sits ahead of the one being viewed', async () => {
    // Done-ness must derive from saved state, not position — a position-only
    // rail could never mark a later step done however much was saved. Platforms
    // is step 3 and finished; the operator is back on step 2.
    midSetup()
    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard/company-info',
      cookies: { session: session() },
    })
    expect(railStatuses(res.body)).toEqual([
      'done', // data-store
      'current', // company-info — current wins over done for the step in view
      'upcoming', // logos — optional and untouched
      'done', // platforms — enabled, and ahead of the current step
      'upcoming', // configure
      'upcoming', // tenants — optional, and never a resume target
      'upcoming', // api-key
      'upcoming', // webhooks
    ])
  })

  it('leaves an unfinished REQUIRED step ahead unclickable', async () => {
    // api-key, not webhooks: webhooks is optional outside external mode, and
    // optional steps are linkable whatever their state — see the test below.
    midSetup()
    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard/company-info',
      cookies: { session: session() },
    })
    expect(rail(res.body)).not.toContain('href="/setup/wizard/api-key"')
  })

  it('links an optional step even when it is untouched', async () => {
    // The property that makes optional steps reachable at all. They are skipped
    // as resume targets and only go done if the operator acts, so "upcoming" is
    // their resting state — a rail that will not link them leaves no route to
    // them.
    midSetup()
    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard/company-info',
      cookies: { session: session() },
    })
    for (const href of ['/setup/wizard/logos', '/setup/wizard/tenants', '/setup/wizard/webhooks']) {
      expect(rail(res.body)).toContain(`href="${href}"`)
    }
  })

  it('every step the resume scan skips is reachable from the rail', async () => {
    // The invariant behind both tests above, stated once: a step that
    // firstIncomplete will never send you to must be clickable, or it cannot be
    // reached at all.
    midSetup()
    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard/company-info',
      cookies: { session: session() },
    })
    const markup = rail(res.body)
    for (const href of ['/setup/wizard/logos', '/setup/wizard/tenants']) {
      // An <a> carrying the href, not a <span> that merely mentions it.
      expect(markup).toMatch(new RegExp(`<a[^>]*href="${href.replace(/\//g, '\\/')}"`))
    }
  })

  it('links a finished step ahead so the operator can jump to it', async () => {
    midSetup()
    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard/company-info',
      cookies: { session: session() },
    })
    // Inside the rail specifically — the page body also carries a "Skip for
    // now" link to the same href.
    expect(rail(res.body)).toContain('href="/setup/wizard/platforms"')
  })

  describe('setup can be finished with nothing connected', () => {
    /** Branding, one platform enabled AND configured. No customer has connected. */
    function readyButUnconnected() {
      mockGetCompanyInfo.mockResolvedValue({ name: 'ACME' })
      mockGetVerticals.mockResolvedValue([{ name: 'accounting', status: 'up', adapterCount: 1 }])
      mockListAllPlatformRows.mockResolvedValue([
        { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true },
      ])
      mockListConnections.mockResolvedValue([])
    }

    const enter = () =>
      fastify.inject({ method: 'GET', url: '/setup/wizard', cookies: { session: session() } })

    it('resumes to the API key step, not a step needing a customer', async () => {
      // Nothing between configure and api-key may depend on a third party: a
      // step derived from `connections.length > 0` would never go done on a
      // deployment nobody had connected to — and if it were not skipped like
      // the logos and webhooks steps, every re-entry would land back on it.
      readyButUnconnected()
      const res = await enter()
      expect(res.statusCode).toBe(302)
      expect(res.headers.location).toBe('/setup/wizard/api-key')
    })

    it('reaches a finished state once the key is minted', async () => {
      // firstIncomplete must actually reach null. Webhooks are optional outside
      // external mode, so nothing is left that needs a third party.
      readyButUnconnected()
      mockListApiKeys.mockResolvedValue([{ id: 'k1' }])
      const res = await enter()
      // No redirect: nothing outstanding, so step 1 renders.
      expect(res.statusCode).toBe(200)
    })

    it('never resumes into a step an admin cannot finish alone', async () => {
      // Walk the whole wizard forward and assert no landing page is a dead end.
      readyButUnconnected()
      for (const url of [
        '/setup/wizard?stay=1',
        '/setup/wizard/company-info',
        '/setup/wizard/logos',
        '/setup/wizard/platforms',
        '/setup/wizard/tenants',
        '/setup/wizard/api-key',
        '/setup/wizard/webhooks',
      ]) {
        const res = await fastify.inject({ method: 'GET', url, cookies: { session: session() } })
        expect([200, 302], `${url} is a dead end`).toContain(res.statusCode)
      }
    })

    it('has no verify step left to reach', async () => {
      // A bookmarked URL should fail visibly rather than render a stale view.
      readyButUnconnected()
      for (const url of ['/setup/wizard/verify', '/setup/wizard/verify/sync']) {
        const res = await fastify.inject({ method: 'GET', url, cookies: { session: session() } })
        expect(res.statusCode).toBe(404)
      }
    })

    it('renders eight rail steps, none of them Verify', async () => {
      readyButUnconnected()
      const res = await fastify.inject({
        method: 'GET',
        url: '/setup/wizard/company-info',
        cookies: { session: session() },
      })
      expect(railStatuses(res.body)).toHaveLength(8)
      expect(rail(res.body)).not.toContain('/setup/wizard/verify')
    })
  })
})
