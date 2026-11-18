/**
 * Clicking "Credentials" in the wizard rail.
 *
 * The rail is static markup: it links to a bare `/setup/wizard/configure` with
 * no adapter in the query string, because it has no access to progress. So the
 * route itself must resolve which adapter to show — one place decides, and the
 * rail link and the resume redirect cannot drift apart.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCompanyInfo = vi.fn(async () => ({ name: 'ACME' }) as unknown)
const mockGetVerticals = vi.fn(async () => [{ name: 'accounting', status: 'up', adapterCount: 1 }])
const mockListAllPlatformRows = vi.fn(async () => [] as unknown[])
const mockListPlatforms = vi.fn(async () => [] as unknown[])

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getCompanyInfo: mockGetCompanyInfo,
      getVerticals: mockGetVerticals,
      listAllPlatformRows: mockListAllPlatformRows,
      listPlatforms: mockListPlatforms,
      listApiKeys: async () => {
        return []
      },
      listWebhookSubs: async () => {
        return []
      },
      listTenants: async () => {
        return [{ id: 'default', name: 'Default' }]
      },
      listTenantDomains: async () => {
        return []
      },
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
      getPlatformConfig: async () => {
        return { clientId: null, redirectUri: null, scopes: null, hasSecret: false }
      },
      listScopeGroups: async () => {
        return []
      },
      listRuntimeSettings: async () => {
        return []
      },
      getActiveLogoFetch: async () => {
        return null
      },
      getLogoStatus: async () => {
        return { count: 0, totalBytes: 0, lastFetchedAt: null }
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'admin-wizard-credentials-secret-long-enough'
let fastify: FastifyInstance

/** What `listPlatforms(vertical)` returns for the credentials form itself. */
function adapters(rows: Array<{ slug: string; enabled: boolean; hasConfig: boolean }>) {
  mockListPlatforms.mockResolvedValue(rows)
}

/** What the progress scan sees across every vertical. */
function platformRows(rows: Array<{ slug: string; enabled: boolean; hasConfig: boolean }>) {
  mockListAllPlatformRows.mockResolvedValue(rows.map((r) => ({ vertical: 'accounting', ...r })))
}

beforeEach(async () => {
  mockGetCompanyInfo.mockResolvedValue({ name: 'ACME' })
  mockGetVerticals.mockResolvedValue([{ name: 'accounting', status: 'up', adapterCount: 1 }])
  platformRows([])
  adapters([])

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

function session(role = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))
}

/** The rail's own link: no query string, exactly as rendered. */
const openBare = () =>
  fastify.inject({
    method: 'GET',
    url: '/setup/wizard/configure',
    cookies: { session: session() },
  })

describe('the Credentials rail entry', () => {
  it('renders the form when every enabled adapter is already configured', async () => {
    // The load-bearing case. Nothing is outstanding, so there is no "next
    // unconfigured" adapter to fall back on — and the step still has to be
    // reachable, because reviewing or rotating credentials is why an operator
    // clicks it.
    platformRows([{ slug: 'fortnox', enabled: true, hasConfig: true }])
    adapters([{ slug: 'fortnox', enabled: true, hasConfig: true }])

    const res = await openBare()
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('fortnox')
  })

  it('lands on the adapter that still needs credentials', async () => {
    platformRows([
      { slug: 'fortnox', enabled: true, hasConfig: true },
      { slug: 'xero', enabled: true, hasConfig: false },
    ])
    adapters([
      { slug: 'fortnox', enabled: true, hasConfig: true },
      { slug: 'xero', enabled: true, hasConfig: false },
    ])

    const res = await openBare()
    expect(res.statusCode).toBe(200)
    // The unconfigured one, not merely the first.
    expect(res.body).toContain('xero')
  })

  it('honours an explicit adapter in the query string', async () => {
    platformRows([
      { slug: 'fortnox', enabled: true, hasConfig: true },
      { slug: 'xero', enabled: true, hasConfig: false },
    ])
    adapters([
      { slug: 'fortnox', enabled: true, hasConfig: true },
      { slug: 'xero', enabled: true, hasConfig: false },
    ])

    const res = await fastify.inject({
      method: 'GET',
      url: '/setup/wizard/configure?vertical=accounting&slug=fortnox',
      cookies: { session: session() },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('fortnox')
  })

  it('still sends you to the platform picker when nothing is enabled', async () => {
    // The one case where bouncing is right: there is genuinely nothing to
    // configure, and the picker is where you go to change that.
    platformRows([{ slug: 'fortnox', enabled: false, hasConfig: false }])

    const res = await openBare()
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/setup/wizard/platforms')
  })

  it('links the rail at exactly the URL the route accepts', async () => {
    // If the rail ever carries a query string, or the route stops accepting
    // a bare URL, this fails.
    platformRows([{ slug: 'fortnox', enabled: true, hasConfig: true }])
    adapters([{ slug: 'fortnox', enabled: true, hasConfig: true }])

    const page = await openBare()
    expect(page.body).toContain('href="/setup/wizard/configure"')
  })
})
