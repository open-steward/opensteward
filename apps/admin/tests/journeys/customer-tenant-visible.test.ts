/**
 * Which tenant a customer belongs to, on the pages an operator actually uses.
 *
 * A customer's tenant is chosen once, at creation, and decides which Connect
 * Links may name them and which tenant owns the connections they authorise
 * (see routes/customers.ts). It was filterable on the list page but never
 * displayed, so an operator could narrow BY tenant without being able to read
 * a given customer's tenant — and on the detail page there was no way to learn
 * it at all short of the API.
 *
 * Shown as name + id, because both are load-bearing: the name is what an
 * operator recognises, the id is what appears on API keys, Connect Links and
 * `tenant_id` filters. When the tenant list cannot be fetched (its call is
 * deliberately non-fatal) the raw id is still shown rather than nothing.
 *
 * Read-only by design — there is no edit control, because the tenant cannot
 * change after creation.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetEndUser = vi.fn()
const mockListEndUsersPaged = vi.fn()
const mockListTenants = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getEndUser: mockGetEndUser,
      listEndUsersPaged: mockListEndUsersPaged,
      listTenants: mockListTenants,
      listEndUserTokens: async () => [],
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      getCompanyInfo: async () => null,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'customer-tenant-session-secret-long-enough-x'
const TENANTS = [
  { id: 'default', name: 'Default' },
  { id: 'dept-a', name: 'Department A' },
]
const CUSTOMER = {
  id: 'eu_1',
  email: 'jane@acme.test',
  displayName: 'Jane at Acme',
  tenantId: 'dept-a',
  sessions: [],
  connections: [],
}

let fastify: FastifyInstance

beforeEach(async () => {
  mockGetEndUser.mockReset().mockResolvedValue(CUSTOMER)
  mockListTenants.mockReset().mockResolvedValue(TENANTS)
  mockListEndUsersPaged
    .mockReset()
    .mockResolvedValue({ data: [CUSTOMER], meta: { page: 1, limit: 25, total: 1 } })
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

describe('the customer list shows each customer’s tenant', () => {
  it('has a Tenant column', async () => {
    const res = await page('/customers')
    expect(res.statusCode).toBe(200)
    // admin-table-sort-filter Part B made this column sortable via
    // `_table-head.ejs`, which renders a sortable header as a link rather
    // than a bare `<th>Tenant</th>` — same shape /connections' own Tenant
    // column already renders (see tenant-visible-on-activity-pages.test.ts).
    expect(res.body).toContain('>Tenant</a>')
  })

  it('names the tenant the customer belongs to', async () => {
    const res = await page('/customers')
    expect(res.body).toContain('Department A')
  })

  it('shows the tenant id too, since that is what keys and links carry', async () => {
    const res = await page('/customers')
    expect(res.body).toContain('dept-a')
  })

  it('falls back to the raw id when the tenant list could not be fetched', async () => {
    // listTenants is deliberately non-fatal on this route — an unreachable
    // admin-api must not take the customer list down. The id still identifies
    // the tenant, so show it rather than an em-dash.
    mockListTenants.mockRejectedValue(new Error('admin-api down'))
    const res = await page('/customers')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('dept-a')
  })
})

describe('the customer detail page shows the tenant', () => {
  it('names the tenant', async () => {
    const res = await page('/customers/eu_1')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Department A')
  })

  it('shows the tenant id', async () => {
    const res = await page('/customers/eu_1')
    expect(res.body).toContain('dept-a')
  })

  it('still renders when the tenant name cannot be resolved', async () => {
    mockListTenants.mockRejectedValue(new Error('admin-api down'))
    const res = await page('/customers/eu_1')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('dept-a')
  })

  it('offers no control to change it — the tenant is fixed at creation', async () => {
    const res = await page('/customers/eu_1')
    expect(res.body).not.toContain('name="tenantId"')
  })
})
