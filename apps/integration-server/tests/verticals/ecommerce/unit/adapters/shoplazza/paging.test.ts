/**
 * Shoplazza list paging (Admin REST API 2025-06).
 *
 * Every 2025-06 list answers `{ code, message, data: { ..., <resource>: [...] } }`
 * and pages one of two ways (https://www.shoplazza.dev/api/202506/...):
 *
 * - cursor only, products and orders:
 *     products: "Page cursor for cursor-based pagination" | "Limit per page,
 *     maximum 250" (`per_page`) | "Whether more records follow this page
 *     (cursor pagination)." (`data.has_more`)
 *     orders: "Cursor for pagination" | "A limit on the number of objects to
 *     return. Range: 1-250 (default is 10)" (`page_size`)
 * - page number, collections, locations, inventory_levels, customers and
 *   price_rules: "Page number (1-based). Mutually exclusive with cursor" with
 *   `page_size` (collections "Range: 1-100", customers and price_rules 250,
 *   locations and inventory_levels no stated maximum).
 *
 * Before this, every list sent `limit` (documented on none of them), never
 * sent `page` or a cursor, and read `cursor` / `has_more` / rows at the top
 * level of the body rather than under `data`, so page 2 was page 1.
 *
 * The fake serves ONLY the documented parameters of each endpoint and throws
 * on anything else, clamps the size to the documented maximum as a platform
 * does, and answers with the `data` envelope.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { ShoplazzaAdapter } from '../../../../../../src/verticals/ecommerce/adapters/shoplazza/index'

/** The adapter's `updatedAfter` filter; tolerated (not honoured) by the fake. */
const ADAPTER_FILTER = 'updated_at_min'

interface Spec {
  mode: 'cursor' | 'page'
  size: 'per_page' | 'page_size'
  max: number | undefined
  extra?: string[]
  total?: boolean
}

/** Documented paging per endpoint, from the 2025-06 reference pages. */
const SPECS: Record<string, Spec> = {
  products: { mode: 'cursor', size: 'per_page', max: 250 },
  orders: { mode: 'cursor', size: 'page_size', max: 250 },
  collections: { mode: 'page', size: 'page_size', max: 100, total: true },
  locations: { mode: 'page', size: 'page_size', max: undefined, total: true },
  inventory_levels: {
    mode: 'page',
    size: 'page_size',
    max: undefined,
    extra: ['location_ids', 'inventory_item_ids'],
  },
  customers: { mode: 'page', size: 'page_size', max: 250 },
  price_rules: { mode: 'page', size: 'page_size', max: 250 },
}

type Row = Record<string, unknown> & { id: number }

/** listVariants walks products at the documented `per_page` maximum. */
const VARIANT_UPSTREAM_SIZE = 250

let tokenSeq = 0
/** A fresh connection per test, so no pager walk is shared across tests. */
const creds = () => ({ accessToken: `shoplazza_test_${++tokenSeq}` })

const encode = (offset: number) => Buffer.from(`o:${offset}`).toString('base64')
const decode = (cursor: string) =>
  Number(Buffer.from(cursor, 'base64').toString('utf8').replace(/^o:/, ''))

function fakeShoplazza(
  collections: Record<string, Row[]>,
  variantsByProduct: Record<string, Row[]> = {},
) {
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    const pv = /^products\/([^/]+)\/variants$/.exec(path)
    if (pv) {
      // Documents only the path param: no query params at all.
      if (Object.keys(params).length > 0)
        throw new Error(`undocumented query parameter(s): ${Object.keys(params).join(', ')}`)
      return { data: { code: 'Success', data: { variants: variantsByProduct[pv[1]!] ?? [] } } }
    }
    if (/^price_rules\/[^/]+\/discount_codes$/.test(path)) {
      return { data: { code: 'Success', data: { discount_code: [] } } }
    }
    const spec = SPECS[path]
    const all = collections[path]
    if (!spec || !all) throw new Error(`unexpected path ${path}`)
    const allowed = new Set([
      spec.size,
      spec.mode === 'cursor' ? 'cursor' : 'page',
      ...(spec.extra ?? []),
      ADAPTER_FILTER,
    ])
    const extra = Object.keys(params).filter((k) => !allowed.has(k))
    if (extra.length > 0) throw new Error(`undocumented query parameter(s): ${extra.join(', ')}`)
    const asked = Number(params[spec.size] ?? 10)
    const size = spec.max === undefined ? asked : Math.min(asked, spec.max)
    const offset =
      spec.mode === 'cursor'
        ? params.cursor
          ? decode(String(params.cursor))
          : 0
        : (Number(params.page ?? 1) - 1) * size
    const rows = all.slice(offset, offset + size)
    const hasMore = offset + rows.length < all.length
    const data: Record<string, unknown> = { [path]: rows, has_more: hasMore }
    // A cursor comes back even on the last page, so `has_more` alone must end the walk.
    if (spec.mode === 'cursor') data.cursor = encode(offset + size)
    if (spec.total) data.total = all.length
    return { data: { code: 'Success', message: 'ok', data } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get }
}

afterEach(() => vi.restoreAllMocks())

const adapter = () =>
  new ShoplazzaAdapter({
    clientId: 'c',
    clientSecret: 's',
    redirectUri: 'https://x/cb',
    shop: 'teststore',
  })

type Method =
  | 'listProducts'
  | 'listVariants'
  | 'listCollections'
  | 'listLocations'
  | 'listInventoryLevels'
  | 'listCustomers'
  | 'listOrders'
  | 'listDiscounts'

const RESOURCE: Record<Method, string> = {
  listProducts: 'products',
  listVariants: 'products',
  listCollections: 'collections',
  listLocations: 'locations',
  listInventoryLevels: 'inventory_levels',
  listCustomers: 'customers',
  listOrders: 'orders',
  listDiscounts: 'price_rules',
}

/** Products holding `n` variants in all, spread 0..3 per product, ending on an empty product. */
function productsWithVariants(n: number): { products: Row[]; ids: string[] } {
  const spread = [2, 0, 1, 3, 0, 1]
  const products: Row[] = []
  const ids: string[] = []
  let vid = 5000
  let p = 0
  while (ids.length < n) {
    const want = Math.min(spread[p % spread.length]!, n - ids.length)
    const variants = Array.from({ length: want }, () => ({ id: vid++, price: '1.00' }))
    ids.push(...variants.map((v) => String(v.id)))
    products.push({ id: 9000 + p, title: `p${p}`, variants })
    p++
  }
  products.push({ id: 9000 + p, title: `p${p}`, variants: [] })
  return { products, ids }
}

function setup(method: Method, n: number) {
  if (method === 'listVariants') {
    const { products, ids } = productsWithVariants(n)
    return { ...fakeShoplazza({ products }), ids }
  }
  const rows: Row[] = Array.from({ length: n }, (_, i) =>
    method === 'listInventoryLevels'
      ? { id: 1000 + i, inventory_item_id: 1000 + i, location_id: 7 }
      : { id: 1000 + i },
  )
  const ids = rows.map((r) => (method === 'listInventoryLevels' ? `${r.id}:7` : String(r.id)))
  return { ...fakeShoplazza({ [RESOURCE[method]]: rows }), ids }
}

const METHODS: Method[] = [
  'listProducts',
  'listVariants',
  'listCollections',
  'listLocations',
  'listInventoryLevels',
  'listCustomers',
  'listOrders',
  'listDiscounts',
]

const listCallsOf = (get: ReturnType<typeof fakeShoplazza>['get'], method: Method) =>
  get.mock.calls.filter(([p]) => p === RESOURCE[method])

describe('shoplazza list paging', () => {
  describe.each(METHODS)('%s', (method) => {
    it.each([1, 3, 7])(
      'N = 2L+1 at limit %i: pages 1..3 serve every id once, hasMore exact',
      async (L) => {
        const { ids } = setup(method, 2 * L + 1)
        const c = creds()
        const seen: string[] = []
        const hasMore: Array<boolean | undefined> = []
        for (let k = 1; k <= 3; k++) {
          const params = withPageSink({ page: k, limit: L })
          const rows = await adapter()[method](c, params)
          expect(rows.length).toBe(k < 3 ? L : 1)
          seen.push(...rows.map((r) => String(r.id)))
          hasMore.push(readUpstreamPage(params)?.hasMore)
        }
        expect(seen).toEqual(ids)
        expect(hasMore).toEqual([true, true, false])
      },
    )

    it('the page-2 request carries the documented key', async () => {
      const L = 3
      const { get } = setup(method, 2 * L + 1)
      // A fresh connection, so no pager can answer from a remembered walk.
      await adapter()[method](creds(), withPageSink({ page: 2, limit: L }))
      const calls = listCallsOf(get, method)
      const spec = SPECS[RESOURCE[method]]!
      expect(calls.length).toBeGreaterThan(0)
      // Variants are cut from products pages of the documented maximum, which
      // the caller's limit does not size; every other list sends the limit.
      const sent = method === 'listVariants' ? VARIANT_UPSTREAM_SIZE : L
      expect(calls.every(([, cfg]) => cfg?.params?.[spec.size] === sent)).toBe(true)
      if (spec.mode === 'page') {
        expect(calls.map(([, cfg]) => cfg?.params?.page)).toEqual([2])
      } else if (method === 'listVariants') {
        // All 7 variants sit in the first products page of 250: one request,
        // no cursor. The cross-page walk is pinned by its own test below.
        expect(calls.map(([, cfg]) => cfg?.params?.cursor)).toEqual([undefined])
      } else {
        // Page 2 is reached by walking: page 1 with no cursor, then the cursor it returned.
        expect(calls[0]![1]?.params?.cursor).toBeUndefined()
        const last = calls[calls.length - 1]![1]?.params?.cursor
        expect(typeof last).toBe('string')
        expect(decode(String(last))).toBeGreaterThan(0)
      }
    })

    it('a limit above the maximum is clamped and still serves every row once', async () => {
      const spec = SPECS[RESOURCE[method]]!
      const cap = spec.max ?? 250
      const { ids, get } = setup(method, 2 * cap + 1)
      const c = creds()
      const seen: string[] = []
      let more = true
      for (let k = 1; more && k <= 10; k++) {
        const params = withPageSink({ page: k, limit: 500 })
        const rows = await adapter()[method](c, params)
        seen.push(...rows.map((r) => String(r.id)))
        more = readUpstreamPage(params)?.hasMore === true
        if (method !== 'listVariants') expect(readUpstreamPage(params)?.pageSize).toBe(cap)
      }
      expect(more).toBe(false)
      expect(seen).toEqual(ids)
      expect(listCallsOf(get, method).every(([, cfg]) => cfg?.params?.[spec.size] === cap)).toBe(
        true,
      )
    })

    it('through the API path, parseListQuery then listPage gives the right meta.hasMore', async () => {
      setup(method, 5)
      const c = creds()
      const p1: QueryParams = parseListQuery({ page: '1', limit: '2' })
      const env1 = listPage<unknown>(await adapter()[method](c, p1), p1, 'shoplazza')
      expect(env1.data).toHaveLength(2)
      expect(env1.meta.hasMore).toBe(true)
      const p3: QueryParams = parseListQuery({ page: '3', limit: '2' })
      const env3 = listPage<unknown>(await adapter()[method](c, p3), p3, 'shoplazza')
      expect(env3.data).toHaveLength(1)
      expect(env3.meta.hasMore).toBe(false)
    })
  })

  it('reports the documented total where the endpoint returns one', async () => {
    setup('listCollections', 7)
    const params = withPageSink({ page: 1, limit: 3 })
    await adapter().listCollections(creds(), params)
    expect(readUpstreamPage(params)?.totalCount).toBe(7)
  })

  it('does not report a page size when the limit was not clamped', async () => {
    setup('listCustomers', 7)
    const params = withPageSink({ page: 1, limit: 3 })
    await adapter().listCustomers(creds(), params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('listInventoryLevels keeps its documented filters on every page', async () => {
    const { get } = setup('listInventoryLevels', 5)
    await adapter().listInventoryLevels(
      creds(),
      withPageSink({ page: 2, limit: 2, location_ids: '7', inventory_item_ids: '1000' }),
    )
    const [, cfg] = listCallsOf(get, 'listInventoryLevels')[0]!
    expect(cfg?.params).toEqual({
      page: 2,
      page_size: 2,
      location_ids: '7',
      inventory_item_ids: '1000',
    })
  })

  it('listProducts keeps two connections on one shop apart', async () => {
    const L = 2
    fakeShoplazza({ products: Array.from({ length: 5 }, (_, i) => ({ id: 100 + i })) })
    await adapter().listProducts(creds(), withPageSink({ page: 1, limit: L }))
    const { get } = fakeShoplazza({
      products: Array.from({ length: 5 }, (_, i) => ({ id: 200 + i })),
    })
    const rows = await adapter().listProducts(creds(), withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['202', '203'])
    // The new connection walked from page 1, not from the other's cursor.
    expect(get.mock.calls[0]?.[1]?.params?.cursor).toBeUndefined()
  })

  it('listVariants cuts caller pages across several products pages', async () => {
    // More products than one products page holds, so the cut crosses upstream pages.
    const { ids, get } = setup('listVariants', 2 * VARIANT_UPSTREAM_SIZE + 1)
    const c = creds()
    const L = 70
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let k = 1; k <= Math.ceil(ids.length / L); k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await adapter().listVariants(c, params)
      seen.push(...rows.map((r) => String(r.id)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(hasMore.slice(0, -1).every((h) => h === true)).toBe(true)
    expect(hasMore[hasMore.length - 1]).toBe(false)
    const cursors = listCallsOf(get, 'listVariants').map(([, cfg]) => cfg?.params?.cursor)
    expect(cursors[0]).toBeUndefined()
    expect(cursors.slice(1).every((cur) => typeof cur === 'string')).toBe(true)
  })

  describe('listVariants for one product (no paging params documented)', () => {
    const variants = Array.from({ length: 5 }, (_, i) => ({ id: 3000 + i, price: '1.00' }))

    it('pages the product’s variants locally: pages 1..3 serve every id once, hasMore exact', async () => {
      const { get } = fakeShoplazza({}, { '42': variants })
      const c = creds()
      const seen: string[] = []
      const meta: Array<ReturnType<typeof readUpstreamPage>> = []
      for (let k = 1; k <= 3; k++) {
        const params = withPageSink({ page: k, limit: 2, productId: '42' })
        const rows = await adapter().listVariants(c, params)
        expect(rows.length).toBe(k < 3 ? 2 : 1)
        seen.push(...rows.map((r) => String(r.id)))
        meta.push(readUpstreamPage(params))
      }
      expect(seen).toEqual(variants.map((v) => String(v.id)))
      expect(meta.map((m) => m?.hasMore)).toEqual([true, true, false])
      expect(meta.every((m) => m?.pagedLocally === true && m?.totalCount === 5)).toBe(true)
      expect(get.mock.calls.every(([p]) => p === 'products/42/variants')).toBe(true)
    })
  })

  // listLocations never sent a filter and still does not (pinned below).
  describe.each(METHODS.filter((m) => m !== 'listLocations'))('%s with updatedAfter', (method) => {
    const since = new Date('2026-01-02T03:04:05.000Z')
    const other = new Date('2026-05-06T07:08:09.000Z')

    it('sends updated_at_min on every request of the walk', async () => {
      const { get } = setup(method, 7)
      const c = creds()
      for (let k = 1; k <= 3; k++) {
        await adapter()[method](c, withPageSink({ page: k, limit: 3, updatedAfter: since }))
      }
      const calls = listCallsOf(get, method)
      expect(calls.length).toBeGreaterThan(0)
      expect(calls.every(([, cfg]) => cfg?.params?.[ADAPTER_FILTER] === since.toISOString())).toBe(
        true,
      )
    })

    it('a walk under another updatedAfter on one connection starts its own walk', async () => {
      const { get } = setup(method, 7)
      const c = creds()
      await adapter()[method](c, withPageSink({ page: 1, limit: 2, updatedAfter: since }))
      await adapter()[method](c, withPageSink({ page: 2, limit: 2, updatedAfter: since }))
      get.mockClear()
      await adapter()[method](c, withPageSink({ page: 2, limit: 2, updatedAfter: other }))
      const calls = listCallsOf(get, method)
      // Nothing is served from the other filter's walk: the new filter is fetched.
      expect(calls.length).toBeGreaterThan(0)
      expect(calls.every(([, cfg]) => cfg?.params?.[ADAPTER_FILTER] === other.toISOString())).toBe(
        true,
      )
      const spec = SPECS[RESOURCE[method]]!
      if (spec.mode === 'cursor') expect(calls[0]![1]?.params?.cursor).toBeUndefined()
    })
  })

  it('listVariants under another updatedAfter does not resume another filter’s products walk', async () => {
    // Page 2 at this limit starts in the second products page, so the walk needs a cursor.
    setup('listVariants', 2 * VARIANT_UPSTREAM_SIZE + 1)
    const c = creds()
    const L = 300
    const since = new Date('2026-01-02T03:04:05.000Z')
    const other = new Date('2026-05-06T07:08:09.000Z')
    await adapter().listVariants(c, withPageSink({ page: 1, limit: L, updatedAfter: since }))
    await adapter().listVariants(c, withPageSink({ page: 2, limit: L, updatedAfter: since }))
    const { get } = fakeShoplazza({
      products: productsWithVariants(2 * VARIANT_UPSTREAM_SIZE + 1).products,
    })
    await adapter().listVariants(c, withPageSink({ page: 2, limit: L, updatedAfter: other }))
    const calls = listCallsOf(get, 'listVariants')
    expect(calls[0]![1]?.params?.cursor).toBeUndefined()
    expect(calls.every(([, cfg]) => cfg?.params?.[ADAPTER_FILTER] === other.toISOString())).toBe(
      true,
    )
  })

  it('listLocations sends no filter', async () => {
    const { get } = setup('listLocations', 5)
    await adapter().listLocations(
      creds(),
      withPageSink({ page: 1, limit: 2, updatedAfter: new Date() }),
    )
    expect(listCallsOf(get, 'listLocations')[0]![1]?.params).toEqual({ page: 1, page_size: 2 })
  })

  it.each(['listProducts', 'listOrders'] as const)(
    '%s: walks at two limits on one connection do not share cursors',
    async (method) => {
      const { ids } = setup(method, 12)
      const c = creds()
      await adapter()[method](c, withPageSink({ page: 1, limit: 2 }))
      await adapter()[method](c, withPageSink({ page: 2, limit: 2 }))
      const rows = await adapter()[method](c, withPageSink({ page: 2, limit: 3 }))
      expect(rows.map((r) => String(r.id))).toEqual(ids.slice(3, 6))
    },
  )
})
