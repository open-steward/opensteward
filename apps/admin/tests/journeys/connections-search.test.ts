/**
 * Finding one connection on /connections.
 *
 * The list must show the connection id, which is the field an operator
 * actually arrives holding: it is what every `/v1/*` call needs as
 * `?connection_id=`, and what a support ticket quotes. And it must be
 * searchable, or locating a known connection means paging through the list.
 *
 * Admin-table-sort-filter Task 3 added two new, precise filter-row boxes —
 * Label and Connection id — alongside the pre-existing combined `?search=`
 * (id OR label), rather than replacing it. An earlier version of this task
 * DID narrow `?search=` onto Label only, which fix-round-1 review caught as
 * the same "URL still accepted but no longer working" failure mode ruled an
 * Important finding on /webhooks in the previous plan: admin-api's own
 * `search` param still implements id-or-label server-side
 * (apps/admin-api/src/core/routes/connections.ts), so the capability was
 * never actually gone — the admin app's forwarding just stopped using it.
 * `search` is now a HIDDEN column in `connectionsTable`
 * (routes/connections.ts) with no `<th>` of its own — an operator filters by
 * id or label precisely via the two new visible boxes, but a bookmarked
 * `?search=` still narrows by id OR label exactly as it always did.
 *
 * Two details these tests still pin, both easy to regress:
 *  - the filter reaches the API (as `search`, `f_label`, `f_id`, etc.)
 *    rather than being applied in the browser, because this list is
 *    paginated upstream and a client-side filter would only ever narrow the
 *    page in view;
 *  - the vertical filter derives from KNOWN_VERTICALS and offers all nine —
 *    a hardcoded subset would leave connections in the missing verticals
 *    impossible to filter to at all.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockListConnectionsPaged = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listConnectionsPaged: mockListConnectionsPaged,
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      getCompanyInfo: async () => {
        return null
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'connections-search-session-secret-long-enough'
const CONNECTION = {
  id: '9f8e7d6c-1111-4a2b-8c3d-000000000001',
  vertical: 'accounting',
  platform: 'fortnox',
  label: 'Acme Books',
  status: 'valid',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
}

let fastify: FastifyInstance

beforeEach(async () => {
  mockListConnectionsPaged.mockReset()
  mockListConnectionsPaged.mockResolvedValue({
    data: [CONNECTION],
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

describe('Journey: an operator looks for one connection', () => {
  it('shows the connection id in the table', async () => {
    const res = await get('/connections')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Connection id')
    expect(res.body).toContain(CONNECTION.id)
  })

  it('offers a way to copy the id, since it is pasted into API calls', async () => {
    const res = await get('/connections')
    expect(res.body).toContain('Copy connection id')
  })

  it('renders a Label box and a Connection id box for precise per-field filtering', async () => {
    const res = await get('/connections')
    expect(res.body).toContain('aria-label="Filter by Label"')
    expect(res.body).toContain('aria-label="Filter by Connection id"')
  })

  it('sends the search term to the API under admin-api\'s own `search` param, matching id or label', async () => {
    await get('/connections?search=9f8e7d6c')
    expect(mockListConnectionsPaged).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ search: '9f8e7d6c' }),
    )
  })

  it('trims a pasted search term', async () => {
    await get('/connections?search=%20%209f8e7d6c%20')
    expect(mockListConnectionsPaged).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ search: '9f8e7d6c' }),
    )
  })

  it('treats a blank search as no search at all', async () => {
    await get('/connections?search=%20')
    // Not `objectContaining({ search: undefined })`: parseTableQuery drops a
    // blank filter entirely rather than setting it to an explicit `undefined`,
    // so the honest assertion is that the key never reaches the call at all —
    // `objectContaining` with an `undefined` value does not match a call that
    // simply lacks the key.
    const [, filters] = mockListConnectionsPaged.mock.calls[0]!
    expect(filters).not.toHaveProperty('search')
  })

  it('keeps the term in the box so the operator can refine it', async () => {
    const res = await get('/connections?search=acme')
    expect(res.body).toContain('value="acme"')
  })

  it('offers every vertical in the filter, not a subset', async () => {
    const res = await get('/connections')
    for (const v of [
      'accounting',
      'crm',
      'ecommerce',
      'logistics',
      'payments',
      'docsign',
      'projects',
      'customer-support',
      'inventory',
    ]) {
      expect(res.body, `vertical missing from the filter: ${v}`).toContain(`value="${v}"`)
    }
  })

  it('names the term when a search finds nothing', async () => {
    mockListConnectionsPaged.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 50, total: 0 },
    })
    const res = await get('/connections?search=nope')
    expect(res.body).toContain('No connection matches')
    expect(res.body).toContain('nope')
  })

  it('carries the search into pagination links, as f_search — tableQs serialises every column under f_<key>, hidden or not', async () => {
    mockListConnectionsPaged.mockResolvedValue({
      data: [CONNECTION],
      meta: { page: 1, limit: 1, total: 3 },
    })
    const res = await get('/connections?search=acme')
    // NOT a bare `/f_search=acme/` match: `sortHref` (table-controls.ts,
    // via `pairs()`) already serialises every active filter into EVERY
    // sortable column header's own link, independent of pagination — this
    // page has seven sortable columns, so `f_search=acme` appears seven
    // times over even with `_pagination.ejs` deleted from the view entirely
    // (verified: that mutation still left this assertion green). The
    // combined `...&page=2` suffix is unique to `_pagination.ejs`'s own
    // `qs(p)` (`filterQs + '&page=' + p`) — no `sortHref` link ever carries
    // a `page` param, since `pairs()` never emits one.
    expect(res.body).toMatch(/f_search=acme&amp;page=2/)
  })
})
