/**
 * Zalando zDirect paging contract: listOrders and listLocations.
 *
 * listOrders — GET /merchants/{merchantId}/orders
 * (https://developers.merchants.zalando.com/docs/orders-api-get-orders.html):
 *   page[number]: "Which page number to return (uses zero-based counting)." Default 0.
 *   page[size]:   "Number of orders returned in a single page." Default 50, 1..1000.
 * The response is JSON:API (OrdersTopLevel {links, data, meta}); links.next is
 * "The next page of data." and is absent on the last page. There is no total.
 *
 * listLocations — GET /merchants/{merchantId}/logistic-centers
 * (https://developers.merchants.zalando.com/docs/logistic-centers.html):
 *   "Use the following call to get the list of all the Logistic Centers using the API:"
 * Its only parameter is the path merchantId; the response is {items: [...]},
 * the whole collection. It is paged locally.
 *
 * The fakes below honour ONLY those documented parameters.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  MAX_PAGE_LIMIT,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { ZalandoAdapter } from '../../../../../../src/verticals/ecommerce/adapters/zalando/index'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

const MERCHANT = '11111111-2222-3333-4444-555555555555'
const CREDS = { accessToken: 'zal_test' }
/** Documented: page[size] "Possible values 1..1000". */
const ORDERS_MAX = 1000

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

function newAdapter(): ZalandoAdapter {
  return new ZalandoAdapter({ clientId: 'cid', clientSecret: 'secret', merchantId: MERCHANT })
}

function fakeOrders(
  count: number,
  opts: { nullNextOnLastPage?: boolean } = {},
): { calls: Call[]; ids: string[] } {
  const ids = Array.from({ length: count }, (_, i) => `1030${String(i).padStart(5, '0')}`)
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    calls.push({ path, params: cfg?.params })
    if (path !== `/merchants/${MERCHANT}/orders`) throw new Error(`unexpected path ${path}`)
    const p = cfg?.params ?? {}
    const number = p['page[number]'] === undefined ? 0 : Number(p['page[number]'])
    const size = p['page[size]'] === undefined ? 50 : Number(p['page[size]'])
    if (!Number.isInteger(size) || size < 1 || size > ORDERS_MAX) {
      throw Object.assign(new Error(`page[size] ${size} out of 1..${ORDERS_MAX}`), {
        response: { status: 400 },
      })
    }
    const slice = ids.slice(number * size, number * size + size)
    const more = (number + 1) * size < ids.length
    return {
      data: {
        links: {
          self: `https://api.merchants.zalando.com${path}?page[number]=${number}`,
          ...(more
            ? { next: `https://api.merchants.zalando.com${path}?page[number]=${number + 1}` }
            : opts.nullNextOnLastPage
              ? { next: null }
              : {}),
        },
        data: slice.map((id) => ({
          type: 'Order',
          id: `uuid-${id}`,
          attributes: { order_number: id, order_status: 'CREATED', currency: 'EUR' },
        })),
        meta: { number_of_results: slice.length },
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
  return { calls, ids }
}

function fakeLogisticCenters(count: number): { calls: Call[]; ids: string[] } {
  const ids = Array.from({ length: count }, (_, i) => `lc-${String(i).padStart(3, '0')}`)
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    calls.push({ path, params: cfg?.params })
    if (path !== `/merchants/${MERCHANT}/logistic-centers`) {
      throw new Error(`unexpected path ${path}`)
    }
    // Documented: no query parameters; every logistic center, every time.
    return {
      data: {
        items: ids.map((id) => ({
          logistic_center_id: id,
          name: `Warehouse ${id}`,
          type: 'OUTBOUND_WAREHOUSE',
        })),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
  return { calls, ids }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Zalando listOrders paging', () => {
  it('serves 2L+1 orders once each, in order, across pages 1..3 with exact hasMore', async () => {
    const L = 4
    const { ids } = fakeOrders(2 * L + 1)
    const adapter = newAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await adapter.listOrders(CREDS, params)
      seen.push(...rows.map((o) => o.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(hasMore).toEqual([true, true, false])
  })

  it('an exact multiple (2L rows) reports hasMore=false on the full last page', async () => {
    const L = 4
    const { ids } = fakeOrders(2 * L)
    const adapter = newAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await adapter.listOrders(CREDS, params)
      expect(rows).toHaveLength(L)
      seen.push(...rows.map((o) => o.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(hasMore).toEqual([true, false])
  })

  it('a null links.next on the last page reads as the end', async () => {
    const L = 3
    fakeOrders(2 * L + 1, { nullNextOnLastPage: true })
    const params = withPageSink({ page: 3, limit: L } as QueryParams)
    const rows = await newAdapter().listOrders(CREDS, params)
    expect(rows).toHaveLength(1)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('does not report a pageSize when the limit is within the documented maximum', async () => {
    fakeOrders(10)
    const params = withPageSink({ page: 1, limit: 5 } as QueryParams)
    await newAdapter().listOrders(CREDS, params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('forwards the updatedAfter filter on every page alongside the paging params', async () => {
    // Pins the existing filter param. Renaming it to the documented
    // last_updated_after is a separate, non-paging change.
    const { calls } = fakeOrders(5)
    const since = new Date('2026-01-01T00:00:00Z')
    const adapter = newAdapter()
    for (const page of [1, 2]) {
      await adapter.listOrders(CREDS, withPageSink({ page, limit: 2, updatedAfter: since }))
    }
    expect(calls.map((c) => c.params?.['updated_at_from'])).toEqual([
      since.toISOString(),
      since.toISOString(),
    ])
    expect(calls.map((c) => c.params?.['page[number]'])).toEqual([0, 1])
  })

  it('page 2 sends page[number]=1 (zero-based) and page[size]=limit', async () => {
    const L = 3
    const { calls, ids } = fakeOrders(2 * L + 1)
    const rows = await newAdapter().listOrders(CREDS, withPageSink({ page: 2, limit: L }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toMatchObject({ 'page[number]': 1, 'page[size]': L })
    expect(rows.map((o) => o.id)).toEqual(ids.slice(L, 2 * L))
  })

  it('a limit above the documented maximum is clamped and still serves every row', async () => {
    const N = 2 * ORDERS_MAX + 1
    const { calls, ids } = fakeOrders(N)
    const adapter = newAdapter()
    const seen: string[] = []
    let page = 1
    for (;;) {
      const params = withPageSink({ page, limit: ORDERS_MAX * 3 } as QueryParams)
      const rows = await adapter.listOrders(CREDS, params)
      expect(rows.length).toBeLessThanOrEqual(ORDERS_MAX)
      expect(readUpstreamPage(params)?.pageSize).toBe(ORDERS_MAX)
      seen.push(...rows.map((o) => o.id))
      if (!readUpstreamPage(params)?.hasMore) break
      page++
      expect(page).toBeLessThan(10)
    }
    expect(page).toBe(3)
    expect(seen).toEqual(ids)
    for (const c of calls) expect(c.params?.['page[size]']).toBe(ORDERS_MAX)
  })

  it('through the router clamp, a huge limit still walks every row', async () => {
    const N = 2 * MAX_PAGE_LIMIT + 1
    const { ids } = fakeOrders(N)
    const adapter: EcommerceAdapter = newAdapter()
    const seen: string[] = []
    let page = 1
    for (;;) {
      const params = parseListQuery(
        { limit: String(MAX_PAGE_LIMIT * 5), page: String(page) },
        adapter,
      )
      expect(params.limit).toBe(MAX_PAGE_LIMIT)
      seen.push(...(await adapter.listOrders!(CREDS, params)).map((o) => o.id))
      if (!readUpstreamPage(params)?.hasMore) break
      page++
      expect(page).toBeLessThan(10)
    }
    expect(page).toBe(3)
    expect(seen).toEqual(ids)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const { ids } = fakeOrders(5)
    const adapter: EcommerceAdapter = newAdapter()

    const p1 = parseListQuery({ limit: '2', page: '1' }, adapter)
    const r1 = listPage(await adapter.listOrders!(CREDS, p1), p1, 'zalando')
    expect(r1.data.map((o) => o.id)).toEqual(ids.slice(0, 2))
    expect(r1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '2', page: '3' }, adapter)
    const r3 = listPage(await adapter.listOrders!(CREDS, p3), p3, 'zalando')
    expect(r3.data.map((o) => o.id)).toEqual(ids.slice(4))
    expect(r3.meta.hasMore).toBe(false)
  })
})

describe('Zalando listLocations paging', () => {
  it('serves 2L+1 logistic centers once each, in order, across pages 1..3 with exact hasMore', async () => {
    const L = 4
    const { ids } = fakeLogisticCenters(2 * L + 1)
    const adapter = newAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await adapter.listLocations(CREDS, params)
      seen.push(...rows.map((l) => l.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)).toMatchObject({ pagedLocally: true, totalCount: 2 * L + 1 })
    }
    expect(seen).toEqual(ids)
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 sends no query parameters (none are documented)', async () => {
    const L = 3
    const { calls, ids } = fakeLogisticCenters(2 * L + 1)
    const rows = await newAdapter().listLocations(
      CREDS,
      withPageSink({ page: 2, limit: L, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
    )
    expect(calls).toHaveLength(1)
    expect(Object.keys(calls[0]!.params ?? {})).toEqual([])
    expect(rows.map((l) => l.id)).toEqual(ids.slice(L, 2 * L))
  })

  it('a limit above the maximum is clamped and still serves every row', async () => {
    const N = 2 * MAX_PAGE_LIMIT + 1
    const { ids } = fakeLogisticCenters(N)
    const adapter: EcommerceAdapter = newAdapter()
    const seen: string[] = []
    let page = 1
    for (;;) {
      const params = parseListQuery(
        { limit: String(MAX_PAGE_LIMIT * 5), page: String(page) },
        adapter,
      )
      expect(params.limit).toBe(MAX_PAGE_LIMIT)
      const rows = await adapter.listLocations!(CREDS, params)
      expect(rows.length).toBeLessThanOrEqual(MAX_PAGE_LIMIT)
      seen.push(...rows.map((l) => l.id))
      if (!readUpstreamPage(params)?.hasMore) break
      page++
      expect(page).toBeLessThan(10)
    }
    expect(page).toBe(3)
    expect(seen).toEqual(ids)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const { ids } = fakeLogisticCenters(5)
    const adapter: EcommerceAdapter = newAdapter()

    const p1 = parseListQuery({ limit: '2', page: '1' }, adapter)
    const r1 = listPage(await adapter.listLocations!(CREDS, p1), p1, 'zalando')
    expect(r1.data.map((l) => l.id)).toEqual(ids.slice(0, 2))
    expect(r1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '2', page: '3' }, adapter)
    const r3 = listPage(await adapter.listLocations!(CREDS, p3), p3, 'zalando')
    expect(r3.data.map((l) => l.id)).toEqual(ids.slice(4))
    expect(r3.meta.hasMore).toBe(false)
  })
})
