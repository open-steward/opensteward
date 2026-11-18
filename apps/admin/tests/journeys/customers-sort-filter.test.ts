/**
 * Journey: sorting and per-column filtering on /customers, and the fix for
 * the bug this whole feature exists to close — the 51st customer being
 * unreachable from the admin UI (admin-api's `/api/end-users?page=` used to
 * ask upstream for the page with NO limit and read `all.length` as the
 * total, which silently capped both at `EndUserStore.list`'s own 50-row
 * default).
 *
 * The single most important assertion in this file is the first one: that
 * sort/dir/filters reach `apiClient.listEndUsersPaged` — i.e. admin-api,
 * which the store paginates at the SQL layer — rather than being applied to
 * the 50-ish rows already sitting in this route. A route that quietly
 * filtered/sorted the fetched page locally instead would still pass every
 * OTHER assertion below (the rendered filter values, the aria-labels, the
 * "No customers match" text) while silently narrowing only the page in
 * hand — this is the test that would catch that regression and no other
 * test here would.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockListEndUsersPaged = vi.fn()
const mockListTenants = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listEndUsersPaged: mockListEndUsersPaged,
      listTenants: mockListTenants,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      getCompanyInfo: async () => null,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'customers-sort-filter-session-secret-long-enough'
const TENANTS = [
  { id: 'default', name: 'Default' },
  { id: 'acme', name: 'Acme' },
]
const CUSTOMER = {
  id: 'eu_1',
  email: 'jane@acme.example',
  displayName: 'Jane Doe',
  externalReference: 'crm-100',
  tenantId: 'acme',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
}

let fastify: FastifyInstance

beforeEach(async () => {
  mockListTenants.mockReset().mockResolvedValue(TENANTS)
  mockListEndUsersPaged.mockReset().mockResolvedValue({
    data: [CUSTOMER],
    meta: { page: 1, limit: 50, total: 1 },
  })
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

function get(url: string) {
  const cookie = fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
  return fastify.inject({ method: 'GET', url, cookies: { session: cookie } })
}

describe('Journey: sorting and filtering the customers table', () => {
  it('forwards sort, dir and every per-column filter to admin-api rather than applying them locally', async () => {
    await get(
      '/customers?sort=email&dir=desc&f_email=jane&f_displayName=Doe&f_externalReference=crm&f_tenantId=acme&f_q=free-text',
    )
    expect(mockListEndUsersPaged).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({
        sort: 'email',
        dir: 'desc',
        email: 'jane',
        displayName: 'Doe',
        externalReference: 'crm',
        tenantId: 'acme',
        q: 'free-text',
      }),
    )
  })

  it('renders a precise filter box for each SQL-addressable column', async () => {
    const res = await get('/customers')
    expect(res.body).toContain('aria-label="Filter by Email"')
    expect(res.body).toContain('aria-label="Filter by Display name"')
    expect(res.body).toContain('aria-label="Filter by External ref"')
    expect(res.body).toContain('aria-label="Filter by Tenant"')
  })

  it('makes every sortable column header a link carrying its sort key', async () => {
    const res = await get('/customers')
    expect(res.body).toMatch(/href="\/customers\?sort=email&amp;dir=asc"/)
    expect(res.body).toMatch(/href="\/customers\?sort=created&amp;dir=asc"/)
  })

  it('a bookmarked ?q= still narrows through the hidden legacy column', async () => {
    await get('/customers?q=jane')
    expect(mockListEndUsersPaged).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ q: 'jane' }),
    )
  })

  it('carries an active filter into the pagination link', async () => {
    mockListEndUsersPaged.mockResolvedValue({
      data: [CUSTOMER],
      meta: { page: 1, limit: 1, total: 3 },
    })
    const res = await get('/customers?f_email=jane')
    // NOT a bare `/f_email=jane/` match: every sortable column header link
    // (`sortHref` → `pairs()` in table-controls.ts) already serialises every
    // active filter into its own href, regardless of pagination — with five
    // sortable columns on this page, `f_email=jane` appears there five times
    // over even with `_pagination.ejs` deleted entirely from the view. The
    // combined `...&page=2` suffix is unique to `_pagination.ejs`'s own
    // `qs(p)` (`filterQs + '&page=' + p`): no `sortHref` link ever carries a
    // `page` param, since `pairs()` never emits one.
    expect(res.body).toMatch(/f_email=jane&amp;page=2/)
  })

  it('names the filter when it matches nothing, rather than reading as an empty install', async () => {
    mockListEndUsersPaged.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 50, total: 0 },
    })
    const res = await get('/customers?f_email=nope')
    expect(res.body).toContain('No customers match your filters')
    expect(res.body).not.toContain('No customers yet')
  })

  it('still shows the filter row and a Clear control when a filter matches nothing', async () => {
    mockListEndUsersPaged.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 50, total: 0 },
    })
    const res = await get('/customers?f_email=nope')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('aria-label="Filter by Email"')
    // Anchored to the href, NOT a bare toContain('Clear'): the no-results
    // empty state in customers/index.ejs carries its own "Clear filters"
    // anchor, so deleting the top-level Clear control entirely left the bare
    // text match green. Same repair Part C and Part D made in their own files.
    expect(res.body).toContain('href="/customers">Clear<')
    // The empty state's OWN Clear-filters anchor, which was unpinned:
    // /connections asserts its equivalent, /customers did not, so pointing
    // this href anywhere else left the file green. Both controls are on
    // screen in this state and both must lead back to an unfiltered list.
    expect(res.body).toContain('href="/customers">Clear filters</a>')
  })

  // The bug this whole feature exists to close, exercised end to end: page 2
  // of a set bigger than the store's old 50-row default must render real
  // rows, and the header count must reflect the true total, not 50.
  it('the 51st customer is reachable: page 2 renders rows and the header count exceeds 50', async () => {
    mockListEndUsersPaged.mockResolvedValue({
      data: [{ ...CUSTOMER, id: 'eu_page2' }],
      meta: { page: 2, limit: 50, total: 55 },
    })
    const res = await get('/customers?page=2')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('eu_page2')
    expect(res.body).toContain('55 customers')
    // The route must have actually asked for page 2 — not silently re-shown
    // page 1's own request.
    expect(mockListEndUsersPaged).toHaveBeenCalledWith('jwt', expect.objectContaining({ page: 2 }))
  })

  // A bookmarked `?tenantId=` must not be silently dropped when the tenant
  // list itself can't be fetched — see the `tenantsUnavailable` doc comment
  // on `customersTable` (routes/customers.ts). Computing `showTenantFilter`
  // from `tenants.length` alone can't tell "this deployment has one tenant"
  // apart from "the fetch failed", and a failed fetch also leaves `tenants`
  // at `[]` — collapsing the two builds the Tenant column with NO `filter`
  // at all, so `parseTableQuery` never even looks at its `legacy: 'tenantId'`
  // alias, and the filter is dropped without a trace on screen.
  it('still forwards a bookmarked ?tenantId= filter when listTenants itself fails', async () => {
    mockListTenants.mockRejectedValue(new Error('admin-api unreachable'))
    await get('/customers?tenantId=dept-a')
    expect(mockListEndUsersPaged).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ tenantId: 'dept-a' }),
    )
  })
})
