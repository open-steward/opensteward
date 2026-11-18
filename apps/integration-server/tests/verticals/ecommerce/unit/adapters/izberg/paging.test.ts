/**
 * Paging for IZBERG's list methods.
 *
 * Every IZBERG list resource is a Tastypie list: `?limit=N&offset=N`, answered
 * with `{ meta: { limit, offset, total_count, next, previous }, objects }`.
 * The first-party public spec (https://docs-api.izberg-marketplace.com/swagger.json,
 * on GET /v1/product/) says: "Returns a paginated list of products. The
 * response follows the Tastypie envelope: `{ meta: { limit, offset,
 * total_count, next, previous }, objects: [...] }`. Maximum `limit` is 40."
 *
 * The live server clamps `limit` silently, per resource: productoffer at 40,
 * user at 50, merchant_order / refund / transaction at 100. A page asked for
 * past that comes back short, and striding the next offset by the size asked
 * for would skip the rows in between.
 *
 * Every method used to read `params.offset`, which the router never sets, so
 * every page sent offset=0 and page 2 repeated page 1. The fake upstream here
 * honours only `limit` and `offset`, clamps `limit` silently the way the live
 * server does, and returns the Tastypie envelope.
 *
 * listCollections refuses with 501 (see collections-and-auth.test.ts).
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
import { IzbergAdapter } from '../../../../../../src/verticals/ecommerce/adapters/izberg'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

const CREDS: Credentials = { accessToken: 'seller-token' }

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

/** Per-resource silent clamps observed on the live server. */
const CLAMP: Record<string, number> = {
  'productoffer/': 40,
  'user/': 50,
  'merchant_order/': 100,
  'refund/': 100,
  'transaction/': 100,
}

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(i + 1))
}

function fakeIzberg(
  rowsByPath: Record<string, number>,
  opts: { withoutMeta?: boolean; withoutNext?: boolean } = {},
): Call[] {
  const calls: Call[] = []
  const respond = (path: string, params: Record<string, unknown> | undefined) => {
    calls.push({ path, params })
    const max = CLAMP[path]
    if (max === undefined) throw new Error(`unexpected path ${path}`)
    const n = rowsByPath[path] ?? 0
    const rows = ids(n).map((id) => ({ id: Number(id), name: `row ${id}` }))
    // Tastypie: an absent limit is the resource default, a larger one is clamped.
    const asked = Number(params?.['limit'] ?? 20)
    const limit = Math.min(asked, max)
    const offset = Number(params?.['offset'] ?? 0)
    if (!Number.isInteger(limit) || limit < 1) throw new Error(`${path}: bad limit ${asked}`)
    if (!Number.isInteger(offset) || offset < 0) throw new Error(`${path}: bad offset ${offset}`)
    const objects = rows.slice(offset, offset + limit)
    const more = offset + limit < n
    if (opts.withoutMeta) return { data: { objects } }
    if (opts.withoutNext) return { data: { objects, meta: { limit, offset, total_count: n } } }
    return {
      data: {
        objects,
        meta: {
          limit,
          offset,
          total_count: n,
          next: more ? `/v1/${path}?limit=${limit}&offset=${offset + limit}` : null,
          previous: offset > 0 ? `/v1/${path}?limit=${limit}&offset=0` : null,
        },
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
  'listProducts' | 'listCustomers' | 'listOrders' | 'listRefunds' | 'listTransactions'

async function call(method: ListMethod, params: QueryParams): Promise<Array<{ id?: string }>> {
  const adapter = new IzbergAdapter()
  return adapter[method](CREDS, params) as Promise<Array<{ id?: string }>>
}

function parse(query: Record<string, string>): QueryParams {
  const routed: EcommerceAdapter = new IzbergAdapter()
  return parseListQuery(query, routed)
}

async function drive(method: ListMethod, limit: number, pages: number) {
  const seen: Array<string | undefined> = []
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

const CASES: Array<{ method: ListMethod; path: string; max: number }> = [
  { method: 'listProducts', path: 'productoffer/', max: 40 },
  { method: 'listCustomers', path: 'user/', max: 50 },
  { method: 'listOrders', path: 'merchant_order/', max: 100 },
  { method: 'listRefunds', path: 'refund/', max: 100 },
  { method: 'listTransactions', path: 'transaction/', max: 100 },
]

for (const c of CASES) {
  describe(`IzbergAdapter.${c.method} pages /v1/${c.path} by offset`, () => {
    it('serves 2L + 1 rows once each over three pages with an exact hasMore', async () => {
      const L = 3
      const calls = fakeIzberg({ [c.path]: 2 * L + 1 })
      const { seen, hasMore } = await drive(c.method, L, 3)
      expect(seen).toEqual(ids(2 * L + 1))
      expect(hasMore).toEqual([true, true, false])
      expect(calls.map((x) => x.path)).toEqual([c.path, c.path, c.path])
      // Page 2 carries the documented `offset`.
      expect(calls[1]!.params).toMatchObject({ limit: L, offset: L })
      expect(calls[2]!.params).toMatchObject({ limit: L, offset: 2 * L })
    })

    it('ends exactly on a collection that is a multiple of the page size', async () => {
      const L = 3
      fakeIzberg({ [c.path]: 2 * L })
      const { seen, hasMore } = await drive(c.method, L, 2)
      expect(seen).toEqual(ids(2 * L))
      expect(hasMore).toEqual([true, false])
    })

    it(`clamps a limit above ${c.max} and still serves every row`, async () => {
      const n = 2 * c.max + 1
      const calls = fakeIzberg({ [c.path]: n })
      const seen: Array<string | undefined> = []
      const hasMore: Array<boolean | undefined> = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: 250 })
        seen.push(...(await call(c.method, params)).map((r) => r.id))
        const meta = readUpstreamPage(params)
        expect(meta).toMatchObject({ pageSize: c.max })
        hasMore.push(meta?.hasMore)
      }
      expect(seen).toEqual(ids(n))
      expect(hasMore).toEqual([true, true, false])
      for (const x of calls) expect(x.params?.['limit']).toBe(c.max)
      expect(calls.map((x) => x.params?.['offset'])).toEqual([0, c.max, 2 * c.max])
    })

    it('reports meta.hasMore on the API path', async () => {
      fakeIzberg({ [c.path]: 5 })
      const metas = []
      for (const page of ['1', '2', '3']) {
        const params = parse({ limit: '2', page })
        const env = listPage(await call(c.method, params), params, 'izberg')
        metas.push({ ids: env.data.map((r) => r.id), hasMore: env.meta.hasMore })
      }
      expect(metas).toEqual([
        { ids: ['1', '2'], hasMore: true },
        { ids: ['3', '4'], hasMore: true },
        { ids: ['5'], hasMore: false },
      ])
    })
  })
}

describe('IzbergAdapter paging keeps its filters and fallbacks', () => {
  it('listRefunds forwards merchant_order alongside the page', async () => {
    const calls = fakeIzberg({ 'refund/': 5 })
    await call('listRefunds', withPageSink({ page: 2, limit: 2, orderId: 'mo-1' }))
    expect(calls[0]!.params).toEqual({ limit: 2, offset: 2, merchant_order: 'mo-1' })
  })

  it('listTransactions forwards order alongside the page', async () => {
    const calls = fakeIzberg({ 'transaction/': 5 })
    await call('listTransactions', withPageSink({ page: 2, limit: 2, order_id: 'o-1' }))
    expect(calls[0]!.params).toEqual({ limit: 2, offset: 2, order: 'o-1' })
  })

  it('listOrders forwards updated_at__gte alongside the page', async () => {
    const calls = fakeIzberg({ 'merchant_order/': 5 })
    const updatedAfter = new Date('2026-01-01T00:00:00.000Z')
    await call('listOrders', withPageSink({ page: 3, limit: 2, updatedAfter }))
    expect(calls[0]!.params).toEqual({
      limit: 2,
      offset: 4,
      updated_at__gte: '2026-01-01T00:00:00.000Z',
    })
  })

  it('sends the default size of 20 when no limit is given', async () => {
    const calls = fakeIzberg({ 'merchant_order/': 50 })
    const rows = await call('listOrders', withPageSink({ page: 2 }))
    expect(calls[0]!.params).toEqual({ limit: 20, offset: 20 })
    expect(rows.map((r) => r.id)).toEqual(ids(40).slice(20))
  })

  it('reports no hasMore when the envelope carries no meta', async () => {
    fakeIzberg({ 'merchant_order/': 4 }, { withoutMeta: true })
    const params = withPageSink({ page: 1, limit: 2 })
    await call('listOrders', params)
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })

  it('falls back to meta.total_count for hasMore when meta.next is absent', async () => {
    // Exactly two pages: page 2 ends on total_count, so it must not claim more.
    fakeIzberg({ 'merchant_order/': 4 }, { withoutNext: true })
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: 2 })
      await call('listOrders', params)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
  })

  it('listRefunds also reads the order_id spelling', async () => {
    const calls = fakeIzberg({ 'refund/': 5 })
    await call('listRefunds', withPageSink({ page: 1, limit: 2, order_id: 'mo-2' }))
    expect(calls[0]!.params).toEqual({ limit: 2, offset: 0, merchant_order: 'mo-2' })
  })

  it('listTransactions also reads the orderId spelling', async () => {
    const calls = fakeIzberg({ 'transaction/': 5 })
    await call('listTransactions', withPageSink({ page: 1, limit: 2, orderId: 'o-2' }))
    expect(calls[0]!.params).toEqual({ limit: 2, offset: 0, order: 'o-2' })
  })

  it('treats page 0 as page 1 and floors a fractional or zero limit to a valid size', async () => {
    const calls = fakeIzberg({ 'merchant_order/': 5 })
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
