/**
 * Paging for Shopgate's list methods.
 *
 * Every Shopgate Omnichannel list route pages by `limit` + `offset` and answers
 * `{ <resourceKey>: [...], meta: { limit, offset, totalItemCount } }`. The
 * first-party reference says of `offset` "The offset where to start the page"
 * (catalog, customer: https://docs.shopgate.com/omnichannel/api/catalog/operations/getproducts/)
 * and of the order service's `limit` "Items per page, for pagination, default
 * is 10, max is 100" (https://docs.shopgate.com/omnichannel/api/order/operations/getsalesorders/).
 * Catalog and customer routes allow `limit` up to 1000, the order service up
 * to 100, and the location service up to 100.
 *
 * Every method used to read `params.offset`, which the router never sets, so
 * every page sent offset=0 and page 2 repeated page 1. The client also read
 * `meta.total`, which Shopgate never returns, so no end was ever reported.
 * The fake upstream here honours only `limit` and `offset`, clamps `limit`
 * at the documented maximum, and returns the documented envelope.
 *
 * listVariants is out of scope: it flattens product rows into variants and
 * needs a rebuild, not a paging fix.
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
import { ShopgateAdapter } from '../../../../../../src/verticals/ecommerce/adapters/shopgate'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

const CREDS: Credentials = { accessToken: 'tok', extra: { merchantCode: 'TM2' } }

interface Call {
  service: string
  path: string
  params: Record<string, unknown> | undefined
}

/** Documented `limit` maximum and default per service. */
const SERVICE_LIMITS: Record<string, { max: number; dflt: number }> = {
  catalog: { max: 1000, dflt: 1000 },
  customer: { max: 1000, dflt: 100 },
  order: { max: 100, dflt: 10 },
  location: { max: 100, dflt: 100 },
}

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(i + 1))
}

function rawRow(id: string): Record<string, unknown> {
  return {
    id,
    code: id,
    orderNumber: id,
    productCode: id,
    locationCode: 'L1',
    name: `row ${id}`,
    available: 1,
  }
}

function fakeShopgate(
  rowsByPath: Record<string, number>,
  opts: { withoutTotal?: boolean } = {},
): Call[] {
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockImplementation(((config: { baseURL: string }) => {
    const service = /^https:\/\/([a-z]+)\.shopgate/.exec(config.baseURL)![1]!
    return {
      get: vi.fn(async (path: string, c?: { params?: Record<string, unknown> }) => {
        const params = c?.params
        calls.push({ service, path, params })
        const lim = SERVICE_LIMITS[service]
        const n = rowsByPath[path]
        if (!lim || n === undefined) throw new Error(`unexpected ${service}/${path}`)
        const asked = params?.['limit'] === undefined ? lim.dflt : Number(params['limit'])
        const offset = params?.['offset'] === undefined ? 0 : Number(params['offset'])
        if (!Number.isInteger(asked) || asked < 1) throw new Error(`bad limit ${asked}`)
        if (asked > lim.max) throw new Error(`${service}: limit ${asked} > ${lim.max}`)
        if (!Number.isInteger(offset) || offset < 0) throw new Error(`bad offset ${offset}`)
        const rows = ids(n)
          .slice(offset, offset + asked)
          .map(rawRow)
        const meta: Record<string, unknown> = { limit: asked, offset }
        if (!opts.withoutTotal) meta['totalItemCount'] = n
        return { data: { [path]: rows, meta } }
      }),
    }
  }) as never)
  return calls
}

type ListMethod =
  | 'listProducts'
  | 'listCollections'
  | 'listLocations'
  | 'listInventoryLevels'
  | 'listCustomers'
  | 'listOrders'
  | 'listFulfillments'
  | 'listRefunds'

function adapter(): ShopgateAdapter {
  return new ShopgateAdapter({
    clientId: 'c',
    clientSecret: 's',
    merchantCode: 'TM2',
    username: 'u',
    password: 'p',
  })
}

async function call(method: ListMethod, params: QueryParams): Promise<Array<{ id?: string }>> {
  return adapter()[method](CREDS, params) as Promise<Array<{ id?: string }>>
}

function parse(query: Record<string, string>): QueryParams {
  const routed: EcommerceAdapter = adapter()
  return parseListQuery(query, routed)
}

afterEach(() => vi.restoreAllMocks())

const CASES: Array<{
  method: ListMethod
  service: string
  path: string
  idOf: (id: string) => string
}> = [
  { method: 'listProducts', service: 'catalog', path: 'products', idOf: (i) => i },
  { method: 'listCollections', service: 'catalog', path: 'categories', idOf: (i) => i },
  { method: 'listLocations', service: 'location', path: 'locations', idOf: (i) => i },
  {
    method: 'listInventoryLevels',
    service: 'catalog',
    path: 'inventories',
    idOf: (i) => `${i}:L1`,
  },
  { method: 'listCustomers', service: 'customer', path: 'customers', idOf: (i) => i },
  { method: 'listOrders', service: 'order', path: 'orders', idOf: (i) => i },
  { method: 'listFulfillments', service: 'order', path: 'fulfillmentOrders', idOf: (i) => i },
  { method: 'listRefunds', service: 'order', path: 'returnOrders', idOf: (i) => i },
]

/** The adapter clamps every route at 100, the smallest documented maximum. */
const CLAMP = 100

for (const c of CASES) {
  describe(`ShopgateAdapter.${c.method} pages ${c.service}/${c.path} by offset`, () => {
    it('serves 2L + 1 rows once each over three pages with an exact hasMore', async () => {
      const L = 3
      const calls = fakeShopgate({ [c.path]: 2 * L + 1 })
      const seen: Array<string | undefined> = []
      const hasMore: Array<boolean | undefined> = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: L })
        seen.push(...(await call(c.method, params)).map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(ids(2 * L + 1).map(c.idOf))
      expect(hasMore).toEqual([true, true, false])
      expect(calls.map((x) => `${x.service}/${x.path}`)).toEqual(
        Array(3).fill(`${c.service}/${c.path}`),
      )
      // Page 2 carries the documented `offset`.
      expect(calls[1]!.params).toMatchObject({ limit: L, offset: L })
      expect(calls[2]!.params).toMatchObject({ limit: L, offset: 2 * L })
    })

    it('ends exactly on a collection that is a multiple of the page size', async () => {
      const L = 3
      fakeShopgate({ [c.path]: 2 * L })
      const hasMore: Array<boolean | undefined> = []
      for (let page = 1; page <= 2; page++) {
        const params = withPageSink({ page, limit: L })
        await call(c.method, params)
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(hasMore).toEqual([true, false])
    })

    it(`clamps a limit above ${CLAMP} and still serves every row`, async () => {
      const n = 2 * CLAMP + 1
      const calls = fakeShopgate({ [c.path]: n })
      const seen: Array<string | undefined> = []
      const hasMore: Array<boolean | undefined> = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: 2500 })
        seen.push(...(await call(c.method, params)).map((r) => r.id))
        const meta = readUpstreamPage(params)
        expect(meta).toMatchObject({ pageSize: CLAMP, totalCount: n })
        hasMore.push(meta?.hasMore)
      }
      expect(seen).toEqual(ids(n).map(c.idOf))
      expect(hasMore).toEqual([true, true, false])
      for (const x of calls) expect(x.params?.['limit']).toBe(CLAMP)
      expect(calls.map((x) => x.params?.['offset'])).toEqual([0, CLAMP, 2 * CLAMP])
    })

    it('reports meta.hasMore on the API path', async () => {
      fakeShopgate({ [c.path]: 5 })
      const metas = []
      for (const page of ['1', '2', '3']) {
        const params = parse({ limit: '2', page })
        const env = listPage(await call(c.method, params), params, 'shopgate')
        metas.push({ ids: env.data.map((r) => r.id), hasMore: env.meta.hasMore })
      }
      expect(metas).toEqual([
        { ids: ['1', '2'].map(c.idOf), hasMore: true },
        { ids: ['3', '4'].map(c.idOf), hasMore: true },
        { ids: ['5'].map(c.idOf), hasMore: false },
      ])
    })
  })
}

describe('ShopgateAdapter paging keeps its filters and fallbacks', () => {
  it('listRefunds forwards salesOrderNumber alongside the page', async () => {
    const calls = fakeShopgate({ returnOrders: 5 })
    await call('listRefunds', withPageSink({ page: 2, limit: 2, orderId: 'SO-1' }))
    expect(calls[0]!.params).toEqual({ limit: 2, offset: 2, salesOrderNumber: 'SO-1' })
  })

  it('listInventoryLevels forwards locationCode and productCode alongside the page', async () => {
    const calls = fakeShopgate({ inventories: 5 })
    await call(
      'listInventoryLevels',
      withPageSink({ page: 3, limit: 2, locationId: 'L9', productId: 'P9' }),
    )
    expect(calls[0]!.params).toEqual({
      limit: 2,
      offset: 4,
      locationCode: 'L9',
      productCode: 'P9',
    })
  })

  it('listOrders forwards updatedSince alongside the page', async () => {
    const calls = fakeShopgate({ orders: 5 })
    const updatedAfter = new Date('2026-01-01T00:00:00.000Z')
    await call('listOrders', withPageSink({ page: 2, limit: 2, updatedAfter }))
    expect(calls[0]!.params).toEqual({
      limit: 2,
      offset: 2,
      updatedSince: '2026-01-01T00:00:00.000Z',
    })
  })

  it('sends the default size of 50 when no limit is given', async () => {
    const calls = fakeShopgate({ orders: 120 })
    const rows = await call('listOrders', withPageSink({ page: 2 }))
    expect(calls[0]!.params).toEqual({ limit: 50, offset: 50 })
    expect(rows.map((r) => r.id)).toEqual(ids(100).slice(50))
  })

  it('falls back to the default size of 50 for a non-finite limit', async () => {
    const calls = fakeShopgate({ orders: 120 })
    const nan = withPageSink({ page: 2, limit: Number.NaN })
    const rows = await call('listOrders', nan)
    await call('listOrders', withPageSink({ page: 2, limit: Number.POSITIVE_INFINITY }))
    expect(calls.map((x) => x.params)).toEqual([
      { limit: 50, offset: 50 },
      { limit: 50, offset: 50 },
    ])
    expect(rows.map((r) => r.id)).toEqual(ids(100).slice(50))
    expect(readUpstreamPage(nan)?.pageSize).toBe(50)
  })

  it('without totalItemCount, a short page ends the list and a full one claims nothing', async () => {
    fakeShopgate({ orders: 3 }, { withoutTotal: true })
    const full = withPageSink({ page: 1, limit: 2 })
    await call('listOrders', full)
    expect(readUpstreamPage(full)?.hasMore).toBeUndefined()
    const short = withPageSink({ page: 2, limit: 2 })
    await call('listOrders', short)
    expect(readUpstreamPage(short)?.hasMore).toBe(false)
  })

  it('treats page 0 as page 1 and floors a fractional or zero limit to a valid size', async () => {
    const calls = fakeShopgate({ orders: 5 })
    await call('listOrders', withPageSink({ page: 0, limit: 2 }))
    await call('listOrders', withPageSink({ page: 2, limit: 2.7 }))
    await call('listOrders', withPageSink({ page: 1, limit: 0 }))
    expect(calls.map((x) => x.params)).toEqual([
      { limit: 2, offset: 0 },
      { limit: 2, offset: 2 },
      { limit: 1, offset: 0 },
    ])
  })
})
