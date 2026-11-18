/**
 * Which tenant each connection, Connect Link and sync job belongs to, on the
 * pages an operator reads them from.
 *
 * /customers gained this first; the activity pages still showed nothing. A
 * multi-tenant deployment lists every tenant's connections in one table, and
 * the tenant is what decides whose developer keys may use a connection, who a
 * Connect Link was minted for, and whose data a sync job pulled — so an
 * operator had to open the API to answer "whose is this?" for any row.
 *
 * Rendered the same way everywhere (views/_tenant.ejs): name + id, because
 * both are load-bearing — the name is what an operator recognises, the id is
 * what appears on keys, links and `tenant_id` filters. The tenant list is
 * fetched non-fatally on each route, so the raw id still shows when the name
 * cannot be resolved, rather than nothing.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockListConnectionsPaged = vi.fn()
const mockGetConnection = vi.fn()
const mockListConnectSessions = vi.fn()
const mockListSyncJobsPaged = vi.fn()
const mockListTenants = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listConnectionsPaged: mockListConnectionsPaged,
      getConnection: mockGetConnection,
      listConnectSessions: mockListConnectSessions,
      listSyncJobsPaged: mockListSyncJobsPaged,
      listTenants: mockListTenants,
      getDataStoreMetrics: async () => null,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      getCompanyInfo: async () => null,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'tenant-activity-session-secret-long-enough-x'
const TENANTS = [
  { id: 'default', name: 'Default' },
  { id: 'dept-a', name: 'Department A' },
]
const CONNECTION = {
  id: 'c0ffee00-0000-4000-8000-000000000001',
  platform: 'xero',
  vertical: 'accounting',
  tenantId: 'dept-a',
  label: 'Acme books',
  status: 'valid',
  expiresAt: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T10:00:00.000Z',
  lastRefreshAt: null,
  lastRefreshStatus: null,
  lastRefreshError: null,
}
const LINK = {
  id: 's-1',
  token: 'tok',
  tenantId: 'dept-a',
  endUserId: null,
  label: 'Q3 pull — Acme',
  allowedPlatforms: [],
  allowedVerticals: [],
  status: 'active',
  oneTimeOnly: false,
  url: 'https://api.example/connect/tok',
  expiresAt: '2026-12-01T00:00:00.000Z',
  createdAt: '2026-08-01T10:00:00.000Z',
}
const JOB = {
  id: 'edff6c32-db2b-4a37-8e09-54c3fca8e0c2',
  vertical: 'accounting',
  platform: 'xero',
  connectionId: CONNECTION.id,
  tenantId: 'dept-a',
  status: 'completed',
  progress: null,
  error: null,
  createdAt: '2026-08-01T10:00:00.000Z',
}

let fastify: FastifyInstance

beforeEach(async () => {
  mockListTenants.mockReset().mockResolvedValue(TENANTS)
  mockListConnectionsPaged
    .mockReset()
    .mockResolvedValue({ data: [CONNECTION], meta: { page: 1, limit: 50, total: 1 } })
  mockGetConnection.mockReset().mockResolvedValue(CONNECTION)
  mockListConnectSessions.mockReset().mockResolvedValue([LINK])
  mockListSyncJobsPaged
    .mockReset()
    .mockResolvedValue({ data: [JOB], meta: { page: 1, limit: 50, total: 1 } })
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

afterEach(async () => await fastify?.close())

function page(url: string) {
  const cookie = fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
  return fastify.inject({ method: 'GET', url, cookies: { session: cookie } })
}

const TABLES = [
  // Every one of these gained sort/filter across the admin-table-sort-filter
  // plans (/connections and /connect-links in Task 3, /sync-jobs in Plan 3
  // Part E): _table-head.ejs renders a sortable column's header as a link,
  // not a bare <th>Tenant</th>. No table on this list keeps the literal
  // markup any more.
  { name: 'connections', url: '/connections', tenantHeader: '>Tenant</a>' },
  { name: 'connect links', url: '/connect-links', tenantHeader: '>Tenant</a>' },
  { name: 'sync jobs', url: '/sync-jobs', tenantHeader: '>Tenant</a>' },
]

for (const { name, url, tenantHeader } of TABLES) {
  describe(`the ${name} table shows each row’s tenant`, () => {
    it('has a Tenant column', async () => {
      const res = await page(url)
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain(tenantHeader)
    })

    it('names the tenant, and shows the id keys and links carry', async () => {
      const res = await page(url)
      expect(res.body).toContain('Department A')
      expect(res.body).toContain('dept-a')
    })

    it('falls back to the raw id when the tenant list could not be fetched', async () => {
      mockListTenants.mockRejectedValue(new Error('admin-api down'))
      const res = await page(url)
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('dept-a')
      expect(res.body).not.toContain('Department A')
    })
  })
}

describe('the connection detail page shows the tenant', () => {
  const url = `/connections/${CONNECTION.vertical}/${CONNECTION.id}`

  it('names the tenant and shows its id', async () => {
    const res = await page(url)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Tenant')
    expect(res.body).toContain('Department A')
    expect(res.body).toContain('dept-a')
  })

  it('still renders, with the id, when the tenant name cannot be resolved', async () => {
    mockListTenants.mockRejectedValue(new Error('admin-api down'))
    const res = await page(url)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('dept-a')
  })

  it('offers no control to change it — the owner is fixed when the connection is made', async () => {
    const res = await page(url)
    expect(res.body).not.toContain('name="tenantId"')
  })
})

describe('a row with no tenant', () => {
  it('shows a dash rather than an empty cell', async () => {
    mockListConnectionsPaged.mockResolvedValue({
      data: [{ ...CONNECTION, tenantId: null }],
      meta: { page: 1, limit: 50, total: 1 },
    })
    const res = await page('/connections')
    expect(res.statusCode).toBe(200)
    // Scoped to the table BODY, not the whole page: admin-table-sort-filter
    // Task 3 added a Tenant filter <select> to /connections, populated from
    // the full tenant list (same as /connect-links and /webhooks already
    // do) — so 'dept-a' now legitimately appears once on the page, as a
    // filter OPTION, even though no ROW displays it here.
    const body = res.body.slice(res.body.indexOf('<tbody>'))
    expect(body).not.toContain('dept-a')
    expect(body).toMatch(/<td style="font-size: var\(--text-xs\)">\s*<span class="muted">—<\/span>/)
  })
})
