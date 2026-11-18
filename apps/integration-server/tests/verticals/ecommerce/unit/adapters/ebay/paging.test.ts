/**
 * Paging for eBay's Sell REST list methods, against the first-party docs.
 *
 * - GET /sell/inventory/v1/inventory_item (listProducts, listInventoryLevels):
 *   https://developer.ebay.com/develop/api/sell/inventory_api.md —
 *   `limit` "should be an integer from `1` to `200`"; `offset` "sets the page
 *   number to retrieve. The first page of records has a value of `0`, the
 *   second page of records has a value of `1`"; `next` "will only be returned
 *   if there are additional inventory items to view". A 0-based PAGE INDEX,
 *   not a record offset.
 * - GET /sell/inventory/v1/location (listLocations): `offset` is "the number
 *   of locations to skip"; `limit` has no documented maximum (the adapter
 *   keeps its 200 cap).
 * - GET /sell/fulfillment/v1/order (listOrders): `offset` "the number of
 *   orders to skip"; "If a requested limit is more than 200, the call fails".
 * - GET /sell/finances/v1/transaction (listTransactions): record offset;
 *   `limit` maximum 1000 on the request, 200 on the response schema.
 * - GET /sell/marketing/v1/promotion (listDiscounts): record offset, `limit`
 *   maximum 200, `marketplace_id` required.
 *
 * Every one of these used to read `params.offset`, which the router never
 * sets, so every page sent offset=0 and page 2 repeated page 1. The fake
 * upstream honours only the documented parameters and rejects a limit past
 * each endpoint's maximum.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { EbayAdapter } from '../../../../../../src/verticals/ecommerce/adapters/ebay/index'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

const CREDS: Credentials = { accessToken: 'tok', extra: {} }

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

type Mechanism = 'page-index' | 'record-offset'

interface Endpoint {
  key: string
  mechanism: Mechanism
  max: number
  row: (i: number) => Record<string, unknown>
  requires?: string
}

const ENDPOINTS: Record<string, Endpoint> = {
  '/sell/inventory/v1/inventory_item': {
    key: 'inventoryItems',
    mechanism: 'page-index',
    max: 200,
    row: (i) => ({ sku: `sku-${i}`, product: { title: `Item ${i}` } }),
  },
  '/sell/inventory/v1/location': {
    key: 'locations',
    mechanism: 'record-offset',
    max: Infinity,
    row: (i) => ({ merchantLocationKey: `loc-${i}` }),
  },
  '/sell/fulfillment/v1/order': {
    key: 'orders',
    mechanism: 'record-offset',
    max: 200,
    row: (i) => ({ orderId: `order-${i}` }),
  },
  '/sell/finances/v1/transaction': {
    key: 'transactions',
    mechanism: 'record-offset',
    max: 1000,
    row: (i) => ({ transactionId: `tx-${i}` }),
  },
  '/sell/marketing/v1/promotion': {
    key: 'promotions',
    mechanism: 'record-offset',
    max: 200,
    row: (i) => ({ promotionId: `promo-${i}`, promotionName: `P${i}` }),
    requires: 'marketplace_id',
  },
}

function fakeEbay(n: number): Call[] {
  const calls: Call[] = []
  const respond = (path: string, params: Record<string, unknown> | undefined) => {
    calls.push({ path, params })
    const ep = ENDPOINTS[path]
    if (!ep) throw new Error(`unexpected path ${path}`)
    if (ep.requires && !params?.[ep.requires]) throw new Error(`${path}: ${ep.requires} required`)
    const limit = Number(params?.['limit'] ?? 25)
    const offset = Number(params?.['offset'] ?? 0)
    if (!Number.isInteger(limit) || limit < 1 || limit > ep.max)
      throw new Error(`${path}: limit ${limit} outside 1..${ep.max}`)
    if (!Number.isInteger(offset) || offset < 0) throw new Error(`${path}: bad offset ${offset}`)
    const start = ep.mechanism === 'page-index' ? offset * limit : offset
    const rows = Array.from({ length: n }, (_, i) => ep.row(i))
    const page = rows.slice(start, start + limit)
    const more = start + limit < n
    const nextOffset = ep.mechanism === 'page-index' ? offset + 1 : offset + limit
    return {
      data: {
        [ep.key]: page,
        total: n,
        limit,
        ...(ep.mechanism === 'page-index' ? { size: Math.ceil(n / limit) } : { offset }),
        ...(more
          ? { next: `https://api.ebay.com${path}?limit=${limit}&offset=${nextOffset}` }
          : {}),
      },
    }
  }
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get: vi.fn(async (path: string, c?: { params?: Record<string, unknown> }) =>
      respond(path, c?.params),
    ),
  })) as never)
  return calls
}

type ListMethod =
  | 'listProducts'
  | 'listInventoryLevels'
  | 'listLocations'
  | 'listOrders'
  | 'listTransactions'
  | 'listDiscounts'

async function call(method: ListMethod, params: QueryParams): Promise<Array<{ id: string }>> {
  const adapter = new EbayAdapter()
  return adapter[method](CREDS, params) as Promise<Array<{ id: string }>>
}

async function drive(method: ListMethod, limit: number, pages: number) {
  const seen: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const totals: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await call(method, params)
    seen.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
    totals.push(readUpstreamPage(params)?.totalCount)
  }
  return { seen, hasMore, totals }
}

function parse(query: Record<string, string>): QueryParams {
  const routed: EcommerceAdapter = new EbayAdapter()
  return parseListQuery(query, routed)
}

afterEach(() => vi.restoreAllMocks())

const CASES: Array<{
  method: ListMethod
  path: string
  rowIds: (n: number) => string[]
  /** The `offset` eBay documents for the page after the first, at size L. */
  page2Offset: (L: number) => number
  /** The largest `limit` the adapter sends this endpoint. */
  cap: number
}> = [
  {
    method: 'listProducts',
    path: '/sell/inventory/v1/inventory_item',
    rowIds: (n) => Array.from({ length: n }, (_, i) => `sku-${i}`),
    page2Offset: () => 1,
    cap: 200,
  },
  {
    method: 'listInventoryLevels',
    path: '/sell/inventory/v1/inventory_item',
    rowIds: (n) => Array.from({ length: n }, (_, i) => `sku-${i}:ebay-default`),
    page2Offset: () => 1,
    cap: 200,
  },
  {
    method: 'listLocations',
    path: '/sell/inventory/v1/location',
    rowIds: (n) => Array.from({ length: n }, (_, i) => `loc-${i}`),
    page2Offset: (L) => L,
    cap: 200,
  },
  {
    method: 'listOrders',
    path: '/sell/fulfillment/v1/order',
    rowIds: (n) => Array.from({ length: n }, (_, i) => `order-${i}`),
    page2Offset: (L) => L,
    cap: 200,
  },
  {
    method: 'listTransactions',
    path: '/sell/finances/v1/transaction',
    rowIds: (n) => Array.from({ length: n }, (_, i) => `tx-${i}`),
    page2Offset: (L) => L,
    cap: 200,
  },
  {
    method: 'listDiscounts',
    path: '/sell/marketing/v1/promotion',
    rowIds: (n) => Array.from({ length: n }, (_, i) => `promo-${i}`),
    page2Offset: (L) => L,
    cap: 200,
  },
]

for (const c of CASES) {
  describe(`EbayAdapter.${c.method} pages ${c.path}`, () => {
    it('serves 2L + 1 rows once each over three pages with an exact hasMore', async () => {
      const L = 3
      const calls = fakeEbay(2 * L + 1)
      const { seen, hasMore, totals } = await drive(c.method, L, 3)
      expect(seen).toEqual(c.rowIds(2 * L + 1))
      expect(hasMore).toEqual([true, true, false])
      // eBay's `total` is the whole collection; it is reported on every page.
      expect(totals).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
      expect(calls.map((x) => x.path)).toEqual([c.path, c.path, c.path])
      expect(calls[0]!.params).toMatchObject({ limit: L, offset: 0 })
      // Page 2 carries the documented `offset`.
      expect(calls[1]!.params).toMatchObject({ limit: L, offset: c.page2Offset(L) })
    })

    it('ends exactly on a collection that is a multiple of the page size', async () => {
      const L = 3
      const calls = fakeEbay(2 * L)
      const { seen, hasMore } = await drive(c.method, L, 2)
      expect(seen).toEqual(c.rowIds(2 * L))
      expect(hasMore).toEqual([true, false])
      expect(calls).toHaveLength(2)
    })

    it(`clamps a limit above ${c.cap} and still serves every row`, async () => {
      const n = 2 * c.cap + 1
      const calls = fakeEbay(n)
      const seen: string[] = []
      const hasMore: Array<boolean | undefined> = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: 500 })
        seen.push(...(await call(c.method, params)).map((r) => r.id))
        expect(readUpstreamPage(params)).toMatchObject({ pageSize: c.cap })
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(c.rowIds(n))
      expect(hasMore).toEqual([true, true, false])
      for (const x of calls) expect(x.params?.['limit']).toBe(c.cap)
    })

    it('reports meta.hasMore on the API path', async () => {
      fakeEbay(5)
      const metas = []
      for (const page of ['1', '2', '3']) {
        const params = parse({ limit: '2', page })
        const env = listPage(await call(c.method, params), params, 'ebay')
        metas.push({ ids: env.data.map((r) => r.id), hasMore: env.meta.hasMore })
      }
      const all = c.rowIds(5)
      expect(metas).toEqual([
        { ids: all.slice(0, 2), hasMore: true },
        { ids: all.slice(2, 4), hasMore: true },
        { ids: all.slice(4), hasMore: false },
      ])
    })
  })
}

describe('EbayAdapter list methods keep their filters', () => {
  it('listOrders forwards filter alongside the page', async () => {
    const calls = fakeEbay(5)
    await call(
      'listOrders',
      withPageSink({ page: 2, limit: 2, filter: 'orderfulfillmentstatus:{NOT_STARTED}' }),
    )
    expect(calls[0]!.params).toEqual({
      limit: 2,
      offset: 2,
      filter: 'orderfulfillmentstatus:{NOT_STARTED}',
    })
  })

  it('listTransactions forwards filter alongside the page', async () => {
    const calls = fakeEbay(5)
    await call(
      'listTransactions',
      withPageSink({ page: 2, limit: 2, filter: 'transactionType:{SALE}' }),
    )
    expect(calls[0]!.params).toEqual({ limit: 2, offset: 2, filter: 'transactionType:{SALE}' })
  })

  it('listDiscounts forwards marketplace_id alongside the page', async () => {
    const calls = fakeEbay(5)
    await call('listDiscounts', withPageSink({ page: 2, limit: 2, marketplaceId: 'EBAY_GB' }))
    expect(calls[0]!.params).toEqual({ limit: 2, offset: 2, marketplace_id: 'EBAY_GB' })
  })

  it('sends the default size of 25 when no limit is given', async () => {
    const calls = fakeEbay(60)
    const rows = await call('listProducts', withPageSink({ page: 2 }))
    expect(calls[0]!.params).toEqual({ limit: 25, offset: 1 })
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 25 }, (_, i) => `sku-${25 + i}`))
  })

  it('listTransactions treats a 204 No Content as an empty last page', async () => {
    // Finances documents 204 when nothing matches; axios hands back an empty
    // body (''), which has no `next`, so the page is empty and the end.
    const calls: Call[] = []
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(async (path: string, c?: { params?: Record<string, unknown> }) => {
        calls.push({ path, params: c?.params })
        return { status: 204, data: '' }
      }),
    })) as never)
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await call('listTransactions', params)
    expect(rows).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
    expect(calls).toEqual([
      { path: '/sell/finances/v1/transaction', params: { limit: 10, offset: 0 } },
    ])
  })
})
