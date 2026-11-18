/**
 * Quickbutik list paging: 1-based `page` + caller's `limit` → Quickbutik's
 * `offset` + `limit` query parameters on GET /v1/products and GET /v1/orders,
 * and a local slice of GET /v1/categories, which does not page.
 *
 * From https://quickbutik.dev/api-v1/products/get-products:
 *   limit:  "The maximum number of rows returned. The default is 100, and the
 *            value may not exceed 500"
 *   offset: "The amount of rows to skip before returning. This can be used to
 *            loop through all objects if there are more than the limit allows
 *            to be returned"
 * and openapi.yaml's ProductNotFound: "Note that empty search results return
 * 404 rather than 200 with an empty array."
 *
 * From https://quickbutik.dev/api-v1/orders/get-orders:
 *   offset: "Number of records to skip for pagination"
 *   limit:  "Maximum number of records to return (max 1000)"
 *
 * From https://quickbutik.dev/api-v1/categories/get-categories, the only query
 * parameter is category_id: "Optional. Enter if you would like to fetch data
 * from a specific category_id". The 200 body is `{ "results": ... }`.
 *
 * Neither paged list returns a total or a cursor, so a short page ends it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  effectivePageSize,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'
import { QuickbutikAdapter } from '../../../../../../src/verticals/ecommerce/adapters/quickbutik/index'

const CREDS = { accessToken: 'qb_test' }

const PRODUCTS_MAX = 500
const PRODUCTS_DEFAULT = 100
const ORDERS_MAX = 1000
const ORDERS_DEFAULT = 1000

function notFound(): Error {
  return Object.assign(new Error('Request failed with status code 404'), {
    isAxiosError: true,
    response: { status: 404, data: { error: 'not found' } },
  })
}

function unprocessable(msg: string): Error {
  return Object.assign(new Error(msg), {
    isAxiosError: true,
    response: { status: 422, data: { error: msg } },
  })
}

/**
 * A fake Quickbutik that honours ONLY the documented `limit` and `offset` on
 * /products and /orders (anything out of range is refused, not corrected),
 * answers an empty result with 404, and returns every category on /categories
 * whatever it is sent.
 */
function fakeQuickbutik(
  total: { products?: number; orders?: number; categories?: number },
  opts: { failAtOffset?: { offset: number; error: () => Error }; categoriesBody?: unknown } = {},
) {
  const sent: { path: string; limit?: number; offset?: number }[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const p = config?.params ?? {}
    if (path === '/categories') {
      sent.push({ path })
      if (opts.categoriesBody !== undefined) return { data: opts.categoriesBody }
      const results = Array.from({ length: total.categories ?? 0 }, (_, i) => ({
        category_id: i + 1,
        name: `Category ${i + 1}`,
      }))
      return { data: { results } }
    }
    const [max, dflt, n] =
      path === '/products'
        ? [PRODUCTS_MAX, PRODUCTS_DEFAULT, total.products ?? 0]
        : path === '/orders'
          ? [ORDERS_MAX, ORDERS_DEFAULT, total.orders ?? 0]
          : [0, 0, 0]
    if (max === 0) throw notFound()
    const limit = p['limit'] === undefined ? dflt : p['limit']
    const offset = p['offset'] === undefined ? 0 : p['offset']
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > max) {
      throw unprocessable(`limit out of range: ${String(limit)}`)
    }
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
      throw unprocessable(`offset out of range: ${String(offset)}`)
    }
    sent.push({ path, limit, offset })
    if (opts.failAtOffset && opts.failAtOffset.offset === offset) throw opts.failAtOffset.error()
    const ids = Array.from({ length: n }, (_, i) => i + 1).slice(offset, offset + limit)
    if (ids.length === 0) throw notFound()
    if (path === '/products') {
      return { data: { product: ids.map((id) => ({ id, title: `Product ${id}` })) } }
    }
    return { data: ids.map((id) => ({ order_id: id, status: '1' })) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as unknown as ReturnType<typeof axios.create>)
  return { sent }
}

const adapter = () => new QuickbutikAdapter()

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

type ListMethod = 'listProducts' | 'listOrders' | 'listCollections'

async function drive(method: ListMethod, limit: number, pages: number[]) {
  const seen: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (const k of pages) {
    const params = withPageSink({ page: k, limit })
    const rows = await adapter()[method](CREDS, params)
    seen.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, hasMore }
}

afterEach(() => vi.restoreAllMocks())

describe.each([
  ['listProducts', '/products', 'products', PRODUCTS_MAX],
  ['listOrders', '/orders', 'orders', ORDERS_MAX],
] as const)('quickbutik %s paging', (method, path, key, max) => {
  it.each([10, 7])(
    'N = 2L + 1 rows driven like the sync (limit %i) serve every id once, in order, with exact hasMore',
    async (limit) => {
      const n = 2 * limit + 1
      fakeQuickbutik({ [key]: n })
      const { seen, hasMore } = await drive(method, limit, [1, 2, 3])
      expect(seen).toEqual(ids(1, n))
      expect(hasMore).toEqual([true, true, false])
    },
  )

  it('page 2 sends offset = (page - 1) * limit with the caller limit', async () => {
    const { sent } = fakeQuickbutik({ [key]: 50 })
    const rows = await adapter()[method](CREDS, withPageSink({ page: 2, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(ids(11, 10))
    expect(sent).toEqual([{ path, limit: 10, offset: 10 }])
  })

  it('a page past the end, which Quickbutik answers with 404, is an empty last page', async () => {
    fakeQuickbutik({ [key]: 20 })
    const { seen, hasMore } = await drive(method, 10, [1, 2, 3])
    expect(seen).toEqual(ids(1, 20))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a non-404 error past page 1 is rethrown, not read as the end of the list', async () => {
    fakeQuickbutik(
      { [key]: 50 },
      { failAtOffset: { offset: 10, error: () => unprocessable('boom') } },
    )
    const params = withPageSink({ page: 2, limit: 10 })
    await expect(adapter()[method](CREDS, params)).rejects.toThrow()
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })

  it('a 404 on page 1 still throws (only a 404 past a full page is an empty last page)', async () => {
    fakeQuickbutik({ [key]: 0 })
    await expect(adapter()[method](CREDS, withPageSink({ page: 1, limit: 10 }))).rejects.toThrow()
  })

  it(`a limit above the ${max}-row maximum is clamped and still serves every row`, async () => {
    const limit = max + 250
    const n = 2 * max + 1
    const { sent } = fakeQuickbutik({ [key]: n })
    const seen: string[] = []
    for (let k = 1; k <= 10; k++) {
      const params = withPageSink({ page: k, limit })
      const page = (await adapter()[method](CREDS, params)).map((r) => r.id)
      expect(effectivePageSize(params, limit)).toBe(max)
      expect(page.length).toBeLessThanOrEqual(max)
      seen.push(...page)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(ids(1, n))
    expect(sent).toEqual([
      { path, limit: max, offset: 0 },
      { path, limit: max, offset: max },
      { path, limit: max, offset: 2 * max },
    ])
  })

  it('the API path (parseListQuery then listPage) reports meta.hasMore', async () => {
    fakeQuickbutik({ [key]: 25 })
    const a = adapter()
    const p2 = parseListQuery({ page: '2', limit: '10' }, a as EcommerceAdapter)
    const rows2: { id: string }[] = await a[method](CREDS, p2)
    const env2 = listPage(rows2, p2, 'quickbutik')
    expect(env2.data.map((r) => r.id)).toEqual(ids(11, 10))
    expect(env2.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ page: '3', limit: '10' }, a as EcommerceAdapter)
    const rows3: { id: string }[] = await a[method](CREDS, p3)
    const env3 = listPage(rows3, p3, 'quickbutik')
    expect(env3.data.map((r) => r.id)).toEqual(ids(21, 5))
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('quickbutik listCollections paging (unpaginated upstream, sliced locally)', () => {
  it.each([10, 7])(
    'N = 2L + 1 categories driven like the sync (limit %i) serve every id once, in order, with exact hasMore',
    async (limit) => {
      const n = 2 * limit + 1
      const { sent } = fakeQuickbutik({ categories: n })
      const { seen, hasMore } = await drive('listCollections', limit, [1, 2, 3])
      expect(seen).toEqual(ids(1, n))
      expect(hasMore).toEqual([true, true, false])
      expect(sent).toEqual([
        { path: '/categories' },
        { path: '/categories' },
        { path: '/categories' },
      ])
    },
  )

  it('reports the whole collection as the total and marks the page as sliced locally', async () => {
    fakeQuickbutik({ categories: 21 })
    const params = withPageSink({ page: 2, limit: 10 })
    const rows = await adapter().listCollections(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(11, 10))
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 21,
      hasMore: true,
      pagedLocally: true,
    })
  })

  it('a single category under results (the documented CategoriesSuccess shape) is one row', async () => {
    fakeQuickbutik({}, { categoriesBody: { results: { category_id: 7, name: 'Only' } } })
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await adapter().listCollections(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['7'])
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 1, hasMore: false })
  })

  it('an id-keyed object of categories under results is unwrapped into rows', async () => {
    const results = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [
        String(i + 1),
        { category_id: i + 1, name: `C${i + 1}` },
      ]),
    )
    fakeQuickbutik({}, { categoriesBody: { results } })
    const { seen, hasMore } = await drive('listCollections', 10, [1, 2])
    expect(seen).toEqual(ids(1, 15))
    expect(hasMore).toEqual([true, false])
  })

  it('a limit above the router maximum still serves every category', async () => {
    fakeQuickbutik({ categories: 1201 })
    const { seen, hasMore } = await drive('listCollections', 600, [1, 2, 3])
    expect(seen).toEqual(ids(1, 1201))
    expect(hasMore).toEqual([true, true, false])
  })

  it('the API path (parseListQuery then listPage) reports meta.hasMore', async () => {
    fakeQuickbutik({ categories: 25 })
    const a = adapter()
    const p2 = parseListQuery({ page: '2', limit: '10' }, a as EcommerceAdapter)
    const env2 = listPage(await a.listCollections(CREDS, p2), p2, 'quickbutik')
    expect(env2.data.map((r) => r.id)).toEqual(ids(11, 10))
    expect(env2.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ page: '3', limit: '10' }, a as EcommerceAdapter)
    const env3 = listPage(await a.listCollections(CREDS, p3), p3, 'quickbutik')
    expect(env3.data.map((r) => r.id)).toEqual(ids(21, 5))
    expect(env3.meta.hasMore).toBe(false)
  })
})
