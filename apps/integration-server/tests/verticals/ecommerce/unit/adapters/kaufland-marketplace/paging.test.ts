/**
 * Paging for Kaufland Marketplace's list methods, against the first-party
 * OpenAPI spec (https://sellerapi.kaufland.com/swagger.json) and the REST
 * guide (https://sellerapi.kaufland.com/?page=rest-api): "Each response which
 * returns a Collection contains an additional object pagination in the body
 * which provides information about offset, limit & total."
 *
 * - GET /units (listProducts, listInventoryLevels): `limit` max 100, `offset`.
 * - GET /categories (listCollections): `limit` max 100, `offset`.
 * - GET /warehouses (listLocations): `limit` max 30, `offset`.
 * - GET /orders (listOrders), GET /order-units (listFulfillments): `limit`
 *   max 100, `offset`.
 * - GET /vouchers (listDiscounts): `limit` 1..100, `offset` "must be a
 *   multiple of `limit`".
 *
 * Every method used to read `params.offset`, which the router never sets (and
 * listLocations sent nothing at all), so page 2 repeated page 1. The fake
 * upstream honours only `limit` and `offset` and rejects a limit past each
 * endpoint's maximum.
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
import { KauflandMarketplaceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/kaufland-marketplace'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

const CREDS: Credentials = { accessToken: 'client-key', extra: { secretKey: 'secret-key' } }

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

type Fixture = 'units' | 'categories' | 'warehouses' | 'orders' | 'orderUnits' | 'vouchers'

type FakeOptions = Partial<Record<Fixture, number>> & {
  /** Leave `pagination` out of the envelope (it is optional in the spec). */
  withoutPagination?: boolean
  /** Make GET /warehouses fail. */
  warehousesFail?: boolean
}

interface Endpoint {
  max: number
  dflt: number
  multipleOfLimit?: boolean
  rows: Array<Record<string, unknown>>
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1)
}

function fakeKaufland(opts: FakeOptions): Call[] {
  const calls: Call[] = []
  const endpoints: Record<string, Endpoint> = {
    units: {
      max: 100,
      dflt: 30,
      rows: range(opts.units ?? 0).map((i) => ({
        id_unit: i,
        id_product: 1000 + i,
        id_warehouse: 7,
      })),
    },
    categories: {
      max: 100,
      dflt: 20,
      rows: range(opts.categories ?? 0).map((i) => ({ id_category: i, name: `c${i}` })),
    },
    warehouses: {
      max: 30,
      dflt: 30,
      rows: range(opts.warehouses ?? 0).map((i) => ({ id_warehouse: i, name: `w${i}` })),
    },
    orders: {
      max: 100,
      dflt: 30,
      rows: range(opts.orders ?? 0).map((i) => ({ id_order: `o${i}` })),
    },
    'order-units': {
      max: 100,
      dflt: 30,
      rows: range(opts.orderUnits ?? 0).map((i) => ({
        id_order_unit: i,
        id_order: `o${i}`,
        status: 'sent',
      })),
    },
    vouchers: {
      max: 100,
      dflt: 30,
      multipleOfLimit: true,
      rows: range(opts.vouchers ?? 0).map((i) => ({ id_voucher: i, code: `v${i}` })),
    },
  }

  const respond = (path: string, params: Record<string, unknown> | undefined) => {
    calls.push({ path, params })
    if (path === 'warehouses' && opts.warehousesFail) throw new Error('boom')
    const ep = endpoints[path]
    if (!ep) throw new Error(`unexpected path ${path}`)
    const limit = Number(params?.['limit'] ?? ep.dflt)
    const offset = Number(params?.['offset'] ?? 0)
    if (!Number.isInteger(limit) || limit < 1 || limit > ep.max)
      throw new Error(`${path}: limit ${limit} outside 1..${ep.max}`)
    if (!Number.isInteger(offset) || offset < 0) throw new Error(`${path}: offset ${offset}`)
    if (ep.multipleOfLimit && offset % limit !== 0)
      throw new Error(`${path}: offset ${offset} is not a multiple of limit ${limit}`)
    const page = ep.rows.slice(offset, offset + limit)
    return {
      data: {
        data: page,
        ...(opts.withoutPagination ? {} : { pagination: { offset, limit, total: ep.rows.length } }),
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

function parse(query: Record<string, string>): QueryParams {
  const routed: EcommerceAdapter = new KauflandMarketplaceAdapter()
  return parseListQuery(query, routed)
}

type ListMethod =
  | 'listProducts'
  | 'listInventoryLevels'
  | 'listCollections'
  | 'listLocations'
  | 'listOrders'
  | 'listFulfillments'
  | 'listDiscounts'

async function call(method: ListMethod, params: QueryParams): Promise<Array<{ id: string }>> {
  const adapter = new KauflandMarketplaceAdapter()
  return adapter[method](CREDS, params) as Promise<Array<{ id: string }>>
}

async function drive(method: ListMethod, limit: number, pages: number) {
  const seen: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await call(method, params)
    seen.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, hasMore }
}

afterEach(() => vi.restoreAllMocks())

const CASES: Array<{
  method: ListMethod
  path: string
  fixture: Fixture
  rowIds: (n: number) => string[]
  max: number
}> = [
  {
    method: 'listProducts',
    path: 'units',
    fixture: 'units',
    rowIds: (n) => range(n).map((i) => String(1000 + i)),
    max: 100,
  },
  {
    method: 'listInventoryLevels',
    path: 'units',
    fixture: 'units',
    rowIds: (n) => range(n).map((i) => `${i}:7`),
    max: 100,
  },
  {
    method: 'listCollections',
    path: 'categories',
    fixture: 'categories',
    rowIds: (n) => range(n).map(String),
    max: 100,
  },
  {
    method: 'listLocations',
    path: 'warehouses',
    fixture: 'warehouses',
    rowIds: (n) => range(n).map(String),
    max: 30,
  },
  {
    method: 'listOrders',
    path: 'orders',
    fixture: 'orders',
    rowIds: (n) => range(n).map((i) => `o${i}`),
    max: 100,
  },
  {
    method: 'listFulfillments',
    path: 'order-units',
    fixture: 'orderUnits',
    rowIds: (n) => range(n).map(String),
    max: 100,
  },
  {
    method: 'listDiscounts',
    path: 'vouchers',
    fixture: 'vouchers',
    rowIds: (n) => range(n).map(String),
    max: 100,
  },
]

for (const c of CASES) {
  describe(`KauflandMarketplaceAdapter.${c.method} pages /${c.path} by offset`, () => {
    it('serves 2L + 1 rows once each over three pages with an exact hasMore', async () => {
      const L = 3
      const calls = fakeKaufland({ [c.fixture]: 2 * L + 1 })
      const { seen, hasMore } = await drive(c.method, L, 3)
      expect(seen).toEqual(c.rowIds(2 * L + 1))
      expect(hasMore).toEqual([true, true, false])
      expect(calls.map((x) => x.path)).toEqual([c.path, c.path, c.path])
      // Page 2 carries the documented `offset`.
      expect(calls[1]!.params).toMatchObject({ limit: L, offset: L })
      expect(calls[2]!.params).toMatchObject({ limit: L, offset: 2 * L })
    })

    it('ends exactly on a collection that is a multiple of the page size', async () => {
      const L = 3
      const calls = fakeKaufland({ [c.fixture]: 2 * L })
      const { seen, hasMore } = await drive(c.method, L, 2)
      expect(seen).toEqual(c.rowIds(2 * L))
      expect(hasMore).toEqual([true, false])
      expect(calls).toHaveLength(2)
    })

    it(`clamps a limit above ${c.max} and still serves every row`, async () => {
      const n = 2 * c.max + 1
      const calls = fakeKaufland({ [c.fixture]: n })
      const seen: string[] = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: c.max * 3 })
        seen.push(...(await call(c.method, params)).map((r) => r.id))
        expect(readUpstreamPage(params)).toMatchObject({ pageSize: c.max })
      }
      expect(seen).toEqual(c.rowIds(n))
      for (const x of calls) expect(x.params?.['limit']).toBe(c.max)
    })

    it('reports meta.hasMore on the API path', async () => {
      fakeKaufland({ [c.fixture]: 5 })
      const metas = []
      for (const page of ['1', '2', '3']) {
        const params = parse({ limit: '2', page })
        const env = listPage(await call(c.method, params), params, 'kaufland-marketplace')
        metas.push({ n: env.data.length, hasMore: env.meta.hasMore })
      }
      expect(metas).toEqual([
        { n: 2, hasMore: true },
        { n: 2, hasMore: true },
        { n: 1, hasMore: false },
      ])
    })

    it('without a pagination object, ends on a short page and does not guess on a full one', async () => {
      fakeKaufland({ [c.fixture]: 4, withoutPagination: true })
      const { seen, hasMore } = await drive(c.method, 2, 3)
      expect(seen).toEqual(c.rowIds(4))
      expect(hasMore).toEqual([undefined, undefined, false])
    })
  })
}

describe('KauflandMarketplaceAdapter.listLocations synthetic default', () => {
  it('returns the default location on page 1 when there are no warehouses', async () => {
    fakeKaufland({ warehouses: 0 })
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await call('listLocations', params)
    expect(rows.map((r) => r.id)).toEqual(['default'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('reports the size it sent (30) when the default stands in for a larger limit', async () => {
    const calls = fakeKaufland({ warehouses: 0 })
    const params = withPageSink({ page: 1, limit: 500 })
    expect((await call('listLocations', params)).map((r) => r.id)).toEqual(['default'])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, pageSize: 30 })
    expect(calls[0]!.params).toMatchObject({ limit: 30, offset: 0 })
  })

  it('does not fabricate the default location on an empty page past the end', async () => {
    fakeKaufland({ warehouses: 2 })
    const params = withPageSink({ page: 2, limit: 2 })
    expect(await call('listLocations', params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('throws when a later page fails instead of inventing the default location', async () => {
    fakeKaufland({ warehousesFail: true })
    const params = withPageSink({ page: 2, limit: 10 })
    await expect(call('listLocations', params)).rejects.toThrow('boom')
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('falls back to the default location when page 1 fails', async () => {
    fakeKaufland({ warehousesFail: true })
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await call('listLocations', params)
    expect(rows.map((r) => r.id)).toEqual(['default'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('KauflandMarketplaceAdapter reports pagination.total', () => {
  for (const c of CASES) {
    it(`${c.method} reports totalCount from pagination.total`, async () => {
      fakeKaufland({ [c.fixture]: 7 })
      const params = withPageSink({ page: 2, limit: 3 })
      await call(c.method, params)
      expect(readUpstreamPage(params)).toMatchObject({ totalCount: 7, hasMore: true })
      const routed = parse({ limit: '3', page: '1' })
      const env = listPage(await call(c.method, routed), routed, 'kaufland-marketplace')
      expect(env.meta.totalCount).toBe(7)
    })
  }
})

describe('KauflandMarketplaceAdapter offset paging keeps its filters and size fallbacks', () => {
  const since = new Date('2026-01-02T03:04:05.000Z')

  for (const method of ['listProducts', 'listInventoryLevels'] as const) {
    it(`${method} forwards updatedAfter as ts_updated_from_iso`, async () => {
      const calls = fakeKaufland({ units: 5 })
      await call(method, withPageSink({ page: 2, limit: 2, updatedAfter: since }))
      expect(calls[0]!.params).toMatchObject({
        limit: 2,
        offset: 2,
        ts_updated_from_iso: since.toISOString(),
      })
    })
  }

  it('listOrders forwards updatedAfter as ts_units_updated_from_iso only', async () => {
    const calls = fakeKaufland({ orders: 5 })
    await call('listOrders', withPageSink({ page: 2, limit: 2, updatedAfter: since }))
    expect(calls[0]!.params).toMatchObject({
      limit: 2,
      offset: 2,
      ts_units_updated_from_iso: since.toISOString(),
    })
    expect(calls[0]!.params).not.toHaveProperty('ts_updated_from_iso')
  })

  it('listCollections forwards the caller storefront', async () => {
    const calls = fakeKaufland({ categories: 5 })
    await call('listCollections', withPageSink({ page: 2, limit: 2, storefront: 'cz' }))
    expect(calls[0]!.params).toEqual({ limit: 2, offset: 2, storefront: 'cz' })
  })

  it('listFulfillments still asks for sent order-units', async () => {
    const calls = fakeKaufland({ orderUnits: 5 })
    await call('listFulfillments', withPageSink({ page: 2, limit: 2 }))
    expect(calls[0]!.params).toMatchObject({
      status: 'sent',
      limit: 2,
      offset: 2,
      storefront: 'de',
    })
  })

  it('sends the default size of 30 when no limit is given', async () => {
    const calls = fakeKaufland({ orders: 70 })
    const rows = await call('listOrders', withPageSink({ page: 2 }))
    expect(calls[0]!.params).toMatchObject({ limit: 30, offset: 30 })
    expect(rows.map((r) => r.id)).toEqual(
      range(60)
        .slice(30)
        .map((i) => `o${i}`),
    )
  })

  it('sends a whole-number size for a fractional limit', async () => {
    const calls = fakeKaufland({ vouchers: 10 })
    await call('listDiscounts', withPageSink({ page: 2, limit: 2.5 }))
    expect(calls[0]!.params).toMatchObject({ limit: 2, offset: 2 })
  })
})
