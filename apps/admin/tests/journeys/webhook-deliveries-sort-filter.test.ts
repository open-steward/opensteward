/**
 * Journey: sorting and per-column filtering on /webhooks/:id/deliveries, and
 * the fix for the bug this whole feature exists to close — a delivery past
 * row 50 being unreachable (admin-api's own
 * `/api/webhook-subscriptions/:id/deliveries` used to ask upstream with only
 * `{ status }` and no `limit`/`offset`, so `WebhookDeliveryStore.listForSubscription`
 * returned its own 50-row default and `meta.total = all.length` was that
 * truncated count).
 *
 * Unlike every other absorbed table in this app, this page was NEVER on the
 * shared table contract before Plan 3 Part C — a bespoke `<form>` and a
 * hand-written `<thead>`, an empty state reading a flat "No deliveries
 * match." regardless of whether a filter was active, and no Clear control at
 * all. This file is the guard for the conversion, mirroring
 * customers-sort-filter.test.ts (Plan 3 Part B) and table-sort-filter.test.ts
 * (Plan 1/2).
 *
 * The single most important assertion is the first one: that sort/dir/every
 * filter reach `apiClient.listWebhookDeliveriesPaged` — i.e. admin-api, which
 * the store paginates at the SQL layer — rather than being applied to the
 * page already in hand. A route that quietly filtered/sorted the fetched
 * page locally instead would still pass every OTHER assertion below while
 * silently narrowing only the page in hand.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockListWebhookDeliveriesPaged = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listWebhookDeliveriesPaged: mockListWebhookDeliveriesPaged,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'webhook-deliveries-sort-filter-secret-long-enough'

const DELIVERY = {
  id: 'del_1',
  subscriptionId: 'whs_1',
  eventId: 'evt_1',
  eventType: 'customer.created',
  url: 'https://hooks.example.test/x',
  status: 'pending' as const,
  attempts: 0,
  nextAttemptAt: '2026-08-01T00:00:00.000Z',
  deliveredAt: null,
  lastStatus: null,
  lastError: null,
  createdAt: '2026-08-01T00:00:00.000Z',
}

let fastify: FastifyInstance

beforeEach(async () => {
  mockListWebhookDeliveriesPaged.mockReset().mockResolvedValue({
    data: [DELIVERY],
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

function get(url: string, role: 'admin' | 'operator' = 'admin') {
  const cookie = fastify.signCookie(
    JSON.stringify({ id: 'u1', username: role, role, token: 'jwt' }),
  )
  return fastify.inject({ method: 'GET', url, cookies: { session: cookie } })
}

describe('Journey: sorting and filtering the deliveries table', () => {
  it('forwards sort, dir and every per-column filter to admin-api rather than applying them locally', async () => {
    await get(
      '/webhooks/whs_1/deliveries?sort=status&dir=desc&f_eventType=customer&f_eventId=evt&f_status=dead&page=2',
    )
    expect(mockListWebhookDeliveriesPaged).toHaveBeenCalledWith(
      'jwt',
      'whs_1',
      expect.objectContaining({
        sort: 'status',
        dir: 'desc',
        eventType: 'customer',
        eventId: 'evt',
        status: 'dead',
        page: 2,
      }),
    )
  })

  it('renders a precise filter box for Event and Event id, and an enum select for Status', async () => {
    const res = await get('/webhooks/whs_1/deliveries')
    expect(res.body).toContain('aria-label="Filter by Event"')
    expect(res.body).toContain('aria-label="Filter by Event id"')
    expect(res.body).toContain('aria-label="Filter by Status"')
    expect(res.body).toContain('<option value="pending"')
    expect(res.body).toContain('<option value="delivered"')
    expect(res.body).toContain('<option value="dead"')
  })

  it('makes every sortable column header a link carrying its sort key', async () => {
    const res = await get('/webhooks/whs_1/deliveries')
    expect(res.body).toMatch(/href="\/webhooks\/whs_1\/deliveries\?sort=eventType&amp;dir=asc"/)
    expect(res.body).toMatch(/href="\/webhooks\/whs_1\/deliveries\?sort=eventId&amp;dir=asc"/)
    expect(res.body).toMatch(/href="\/webhooks\/whs_1\/deliveries\?sort=status&amp;dir=asc"/)
    expect(res.body).toMatch(/href="\/webhooks\/whs_1\/deliveries\?sort=attempts&amp;dir=asc"/)
  })

  // This page's ONLY filter before this feature — preserved under its old
  // bare name so a bookmarked link keeps working.
  it('a bookmarked ?status= still narrows through the hidden legacy alias', async () => {
    await get('/webhooks/whs_1/deliveries?status=dead')
    expect(mockListWebhookDeliveriesPaged).toHaveBeenCalledWith(
      'jwt',
      'whs_1',
      expect.objectContaining({ status: 'dead' }),
    )
  })

  it('names the filter when it matches nothing, rather than the old flat "No deliveries match." message', async () => {
    mockListWebhookDeliveriesPaged.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 50, total: 0 },
    })
    const res = await get('/webhooks/whs_1/deliveries?f_eventType=nope')
    expect(res.body).toContain('No delivery matches')
    expect(res.body).toContain('nope')
    expect(res.body).not.toContain('No deliveries match.')
  })

  // Six tables shipped this exact bug earlier in this work: a flat "no
  // results" message with no Clear control, indistinguishable from "this
  // deployment has nothing at all" and with no way back short of
  // hand-editing the URL. The filter row and Clear button must render
  // OUTSIDE the empty branch.
  it('still shows the filter row and a Clear control when a filter matches nothing', async () => {
    mockListWebhookDeliveriesPaged.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 50, total: 0 },
    })
    const res = await get('/webhooks/whs_1/deliveries?f_eventType=nope')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('aria-label="Filter by Event"')
    // Anchored to the exact href + exact text, not a bare `.toContain('Clear')`
    // — that bare form is satisfied by the EMPTY STATE's OWN "Clear filters"
    // anchor (deliveries.ejs, inside the `hasFilters` branch) even when the
    // row rendered OUTSIDE that branch (deliveries.ejs's top-of-page Search/
    // Clear row) is deleted entirely — the exact regression this test's own
    // comment above says it exists to catch, and which a bare `.toContain`
    // does not.
    expect(res.body).toContain('href="/webhooks/whs_1/deliveries">Clear<')
    expect(res.body).not.toContain('No deliveries match.')
  })

  /**
   * Regression pin for the conditional-Replay-column hazard: `deliveriesTable`
   * is built per-request from the signed-in user's role, so an admin gets a
   * trailing Replay column an operator does not.
   *
   * This must clear two bars a weaker version of this test does not:
   *
   * 1. The fixture must be a `dead` row. Replay renders only for
   *    `status === 'dead'` (`deliveries.ejs`) — against a `pending` fixture,
   *    `not.toContain('>Replay<')` is true whether or not the column exists
   *    at all, so it cannot distinguish "no column" from "column present,
   *    button just didn't render this row".
   * 2. The two header counts must be compared to EACH OTHER, not merely to
   *    their own row's cell count. `expect(rowCellCount).toBe(headerCount)`
   *    on both roles independently is satisfied even if BOTH roles get the
   *    same (wrong) column list — e.g. `columns.push({key:'actions',…})`
   *    made unconditional, so an operator also gets the Replay `<th>` — since
   *    that mutation still keeps each role's own thead/tbody internally
   *    consistent. Only `operatorHeaderCount === adminHeaderCount - 1`
   *    catches that the column list itself differs by role.
   */
  it('gives an admin exactly one more header cell (Replay) than an operator, on a dead row', async () => {
    mockListWebhookDeliveriesPaged.mockResolvedValue({
      data: [{ ...DELIVERY, status: 'dead', lastError: 'boom' }],
      meta: { page: 1, limit: 50, total: 1 },
    })

    const headerCount = (body: string) => {
      const headerRow = body.match(/<tr class="table__headers[^"]*">([\s\S]*?)<\/tr>/)
      expect(headerRow).not.toBeNull()
      return (headerRow![1].match(/<th/g) ?? []).length
    }
    const rowCellCount = (body: string) => {
      const firstBodyRow = body.match(/<tbody>[\s\S]*?<tr>([\s\S]*?)<\/tr>/)
      expect(firstBodyRow).not.toBeNull()
      return (firstBodyRow![1].match(/<td/g) ?? []).length
    }

    const operatorRes = await get('/webhooks/whs_1/deliveries', 'operator')
    const adminRes = await get('/webhooks/whs_1/deliveries', 'admin')
    expect(operatorRes.statusCode).toBe(200)
    expect(adminRes.statusCode).toBe(200)

    const operatorHeaderCount = headerCount(operatorRes.body)
    const adminHeaderCount = headerCount(adminRes.body)
    // A positive lower bound: without it, a template that renders NO `<th>`
    // at all for either role (a totally broken thead) would still pass
    // every comparison below via `0 === 0`.
    expect(operatorHeaderCount).toBeGreaterThan(0)
    expect(adminHeaderCount).toBeGreaterThan(0)

    // thead/tbody agree, for each role independently...
    expect(rowCellCount(operatorRes.body)).toBe(operatorHeaderCount)
    expect(rowCellCount(adminRes.body)).toBe(adminHeaderCount)
    // ...AND the column LIST itself differs by exactly the Replay column.
    expect(operatorHeaderCount).toBe(adminHeaderCount - 1)

    expect(operatorRes.body).not.toContain('>Replay<')
    expect(adminRes.body).toContain('>Replay<')
  })

  // The bug this whole feature exists to close, exercised end to end at this
  // layer too: page 2 of a set bigger than the store's old 50-row default
  // must render real rows, and the header count must reflect the true total.
  it('the 51st delivery is reachable: page 2 renders rows and the header count exceeds 50', async () => {
    mockListWebhookDeliveriesPaged.mockResolvedValue({
      data: [{ ...DELIVERY, id: 'del_page2', eventId: 'evt_page2' }],
      meta: { page: 2, limit: 50, total: 55 },
    })
    const res = await get('/webhooks/whs_1/deliveries?page=2')
    expect(res.statusCode).toBe(200)
    // `eventId`, not `id` — the delivery's own id is only ever rendered
    // inside the admin-only Replay form's action attribute, and only for a
    // `dead` row (deliveries.ejs); this fixture stays `pending`, so `eventId`
    // (rendered in its own cell unconditionally) is what proves this row —
    // not merely SOME row — reached the page.
    expect(res.body).toContain('evt_page2')
    expect(res.body).toMatch(/Showing 51–55 of 55|Showing 51-55 of 55/)
    expect(mockListWebhookDeliveriesPaged).toHaveBeenCalledWith(
      'jwt',
      'whs_1',
      expect.objectContaining({ page: 2 }),
    )
  })
})
