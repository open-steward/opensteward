/**
 * Paging for Allegro's list methods, against its first-party OpenAPI spec
 * (https://developer.allegro.pl/swagger.yaml).
 *
 * - GET /sale/offers (listProducts, listInventoryLevels): `offset` is "Index
 *   of the first returned offer from all search results", `limit` 1..1000.
 * - GET /order/checkout-forms (listOrders): `offset` "Index of first returned
 *   checkout-form from all search results", `limit` 1..100, and `totalCount`
 *   "Number of all objects of requested status(es) available (regardless of
 *   the provided limit and offset)".
 * - GET /payments/payment-operations (listTransactions): `offset` "Index of
 *   the first returned payment operation from all search results", `limit`
 *   1..50, offset at most 10000.
 * - GET /sale/categories (listCollections): only `parent.id`; returns the
 *   whole child list of one category, with no count or cursor.
 *
 * Every offset method used to read `params.offset`, which the router never
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
import { AllegroAdapter } from '../../../../../../src/verticals/ecommerce/adapters/allegro'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

const CREDS: Credentials = { accessToken: 'tok', extra: { environment: 'sandbox' } }

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

interface FakeOptions {
  offers?: number
  orders?: number
  operations?: number
  categories?: number
  /** Leave totalCount out of the /sale/offers envelope (it is optional there). */
  offersWithoutTotal?: boolean
}

interface OffsetEndpoint {
  key: string
  max: number
  dflt: number
  maxOffset?: number
  rows: Array<{ id: string }>
  withTotal: boolean
}

function ids(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i}`)
}

function fakeAllegro(opts: FakeOptions): Call[] {
  const calls: Call[] = []
  const endpoints: Record<string, OffsetEndpoint> = {
    '/sale/offers': {
      key: 'offers',
      max: 1000,
      dflt: 20,
      maxOffset: 9_999_999,
      rows: ids('offer', opts.offers ?? 0).map((id) => ({ id, name: id })),
      withTotal: !opts.offersWithoutTotal,
    },
    '/order/checkout-forms': {
      key: 'checkoutForms',
      max: 100,
      dflt: 100,
      rows: ids('order', opts.orders ?? 0).map((id) => ({ id })),
      withTotal: true,
    },
    '/payments/payment-operations': {
      key: 'paymentOperations',
      max: 50,
      dflt: 50,
      maxOffset: 10_000,
      rows: ids('op', opts.operations ?? 0).map((id) => ({ id })),
      withTotal: true,
    },
  }
  const categories = ids('cat', opts.categories ?? 0).map((id) => ({ id, name: id }))

  const respond = (path: string, params: Record<string, unknown> | undefined) => {
    calls.push({ path, params })
    if (path === '/sale/categories') {
      // Documented parameters: `parent.id` only. No paging of any kind.
      return { data: { categories } }
    }
    const ep = endpoints[path]
    if (!ep) throw new Error(`unexpected path ${path}`)
    const limit = Number(params?.['limit'] ?? ep.dflt)
    const offset = Number(params?.['offset'] ?? 0)
    if (!Number.isInteger(limit) || limit < 1 || limit > ep.max)
      throw new Error(`${path}: limit ${limit} outside 1..${ep.max}`)
    if (!Number.isInteger(offset) || offset < 0 || offset > (ep.maxOffset ?? Infinity))
      throw new Error(`${path}: offset ${offset} out of range`)
    const page = ep.rows.slice(offset, offset + limit)
    return {
      data: {
        [ep.key]: page,
        count: page.length,
        ...(ep.withTotal ? { totalCount: ep.rows.length } : {}),
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
  const routed: EcommerceAdapter = new AllegroAdapter()
  return parseListQuery(query, routed)
}

type ListMethod =
  'listProducts' | 'listInventoryLevels' | 'listOrders' | 'listTransactions' | 'listCollections'

async function call(method: ListMethod, params: QueryParams): Promise<Array<{ id: string }>> {
  const adapter = new AllegroAdapter()
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

const OFFSET_CASES: Array<{
  method: ListMethod
  path: string
  fixture: keyof FakeOptions
  rowIds: (n: number) => string[]
  max: number
}> = [
  {
    method: 'listProducts',
    path: '/sale/offers',
    fixture: 'offers',
    rowIds: (n) => ids('offer', n),
    max: 1000,
  },
  {
    method: 'listInventoryLevels',
    path: '/sale/offers',
    fixture: 'offers',
    rowIds: (n) => ids('offer', n).map((id) => `${id}:allegro-default`),
    max: 1000,
  },
  {
    method: 'listOrders',
    path: '/order/checkout-forms',
    fixture: 'orders',
    rowIds: (n) => ids('order', n),
    max: 100,
  },
  {
    method: 'listTransactions',
    path: '/payments/payment-operations',
    fixture: 'operations',
    rowIds: (n) => ids('op', n),
    max: 50,
  },
]

for (const c of OFFSET_CASES) {
  describe(`AllegroAdapter.${c.method} pages ${c.path} by offset`, () => {
    it('serves 2L + 1 rows once each over three pages with an exact hasMore', async () => {
      const L = 3
      const calls = fakeAllegro({ [c.fixture]: 2 * L + 1 })
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
      const calls = fakeAllegro({ [c.fixture]: 2 * L })
      const { seen, hasMore } = await drive(c.method, L, 2)
      expect(seen).toEqual(c.rowIds(2 * L))
      // A full last page is not "more" when the platform says how many exist.
      expect(hasMore).toEqual([true, false])
      expect(calls).toHaveLength(2)
    })

    it(`clamps a limit above ${c.max} and still serves every row`, async () => {
      const n = 2 * c.max + 1
      const calls = fakeAllegro({ [c.fixture]: n })
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
      fakeAllegro({ [c.fixture]: 5 })
      const metas = []
      for (const page of ['1', '2', '3']) {
        const params = parse({ limit: '2', page })
        const env = listPage(await call(c.method, params), params, 'allegro')
        metas.push({ n: env.data.length, hasMore: env.meta.hasMore })
      }
      expect(metas).toEqual([
        { n: 2, hasMore: true },
        { n: 2, hasMore: true },
        { n: 1, hasMore: false },
      ])
    })
  })
}

describe('AllegroAdapter.listProducts without a totalCount', () => {
  it('ends on a short page and does not guess on a full one', async () => {
    fakeAllegro({ offers: 4, offersWithoutTotal: true })
    const { seen, hasMore } = await drive('listProducts', 2, 3)
    expect(seen).toEqual(ids('offer', 4))
    expect(hasMore).toEqual([undefined, undefined, false])
  })
})

describe('AllegroAdapter.listCollections pages the whole child list locally', () => {
  it('serves 2L + 1 categories once each over three pages', async () => {
    const L = 3
    const calls = fakeAllegro({ categories: 2 * L + 1 })
    const { seen, hasMore } = await drive('listCollections', L, 3)
    expect(seen).toEqual(ids('cat', 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    for (const x of calls) expect(x.params ?? {}).toEqual({})
  })

  it('reports meta.hasMore on the API path', async () => {
    fakeAllegro({ categories: 5 })
    const out = []
    for (const page of ['1', '2', '3']) {
      const params = parse({ limit: '2', page })
      const env = listPage(await call('listCollections', params), params, 'allegro')
      out.push({ ids: env.data.map((r) => r.id), hasMore: env.meta.hasMore })
    }
    expect(out).toEqual([
      { ids: ['cat-0', 'cat-1'], hasMore: true },
      { ids: ['cat-2', 'cat-3'], hasMore: true },
      { ids: ['cat-4'], hasMore: false },
    ])
  })

  it('still forwards parent.id', async () => {
    const calls = fakeAllegro({ categories: 2 })
    await call('listCollections', withPageSink({ page: 1, limit: 10, parentId: 'p-1' }))
    expect(calls[0]!.params).toEqual({ 'parent.id': 'p-1' })
  })
})

describe('AllegroAdapter.listTransactions at the documented offset ceiling (10000)', () => {
  it('ends on the last page the platform accepts and never asks past it', async () => {
    const calls = fakeAllegro({ operations: 10_060 })
    const hasMore: Array<boolean | undefined> = []
    const counts: number[] = []
    for (const page of [200, 201, 202]) {
      const params = withPageSink({ page, limit: 50 })
      counts.push((await call('listTransactions', params)).length)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(counts).toEqual([50, 50, 0])
    expect(hasMore).toEqual([true, false, false])
    expect(calls.map((x) => x.params?.['offset'])).toEqual([9950, 10_000])
  })

  it('reports meta.hasMore false at the ceiling on the API path', async () => {
    fakeAllegro({ operations: 10_060 })
    const params = parse({ limit: '50', page: '201' })
    const env = listPage(await call('listTransactions', params), params, 'allegro')
    expect(env.data).toHaveLength(50)
    expect(env.meta.hasMore).toBe(false)
  })
})

describe('AllegroAdapter offset paging keeps its filters and size fallbacks', () => {
  it('listProducts forwards search as name alongside the page', async () => {
    const calls = fakeAllegro({ offers: 5 })
    await call('listProducts', withPageSink({ page: 2, limit: 2, search: 'lamp' }))
    expect(calls[0]!.params).toEqual({ limit: 2, offset: 2, name: 'lamp' })
  })

  it('listOrders forwards status alongside the page', async () => {
    const calls = fakeAllegro({ orders: 5 })
    await call('listOrders', withPageSink({ page: 2, limit: 2, status: 'READY_FOR_PROCESSING' }))
    expect(calls[0]!.params).toEqual({ limit: 2, offset: 2, status: 'READY_FOR_PROCESSING' })
  })

  it('sends the default size of 25 when no limit is given', async () => {
    const calls = fakeAllegro({ orders: 60 })
    const rows = await call('listOrders', withPageSink({ page: 2 }))
    expect(calls[0]!.params).toEqual({ limit: 25, offset: 25 })
    expect(rows.map((r) => r.id)).toEqual(ids('order', 50).slice(25))
  })

  it('sends a whole-number size for a fractional limit', async () => {
    const calls = fakeAllegro({ orders: 10 })
    await call('listOrders', withPageSink({ page: 2, limit: 2.5 }))
    expect(calls[0]!.params).toEqual({ limit: 2, offset: 2 })
  })
})
