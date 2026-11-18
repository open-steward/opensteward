/**
 * Paging for Centra's Order API list methods, against the first-party
 * reference (https://centra.dev/legacy/order-api/api-reference):
 *
 * - GET <base>/products and GET <base>/stock: `limit` — "You will get this
 *   amount of products, and a "next" parameter in return if there are
 *   multiple pages." The response example carries `"next": "?limit=10&page=3"`
 *   ("Will contain a URL to the next page."), so the next page is `page`.
 *   Get stock returns its rows under `products` too.
 * - GET <base>/customers: "Offset how far in to start returning customers."
 * - GET <base>/orders: "Offset how far in to start returning orders."
 * - GET <base>/shipments: the same offset, and a limit that is "a positive
 *   value between 1 and 100."
 * - GET <base>/returns: `page` — "Number of page of results to return."
 *
 * Every method used to send `limit` only (plus an `offset` the router never
 * sets), so page 2 repeated page 1. The fake below honours only the
 * documented parameters of each endpoint.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { CentraAdapter } from '../../../../../../src/verticals/ecommerce/adapters/centra'

const CREDS: Credentials = {
  accessToken: 'key',
  extra: { baseUrl: 'https://brand.centra.example/api/order-api' },
}
/** The size the adapter sends at most (documented for shipments only). */
const MAX = 100

interface Call {
  path: string
  params: Record<string, unknown>
  /** The API-Authorization key the request was sent with. */
  token: string
}

type Mode = 'next-page' | 'offset' | 'page'

interface Endpoint {
  mode: Mode
  key: string
  rows: Array<Record<string, unknown>>
  max?: number
  /**
   * next-page only: upstream page numbers advance by this much, so the
   * documented `next` ("?limit=10&page=3") is the only way to find page 2.
   * Any other page number is rejected.
   */
  stride?: number
}

let calls: Call[] = []
/** Endpoints per API key; `*` serves every key. */
let endpoints: Record<string, Record<string, Endpoint>> = {}

function respond(token: string, path: string, params: Record<string, unknown> = {}) {
  calls.push({ path, params: { ...params }, token })
  const ep = (endpoints[token] ?? endpoints['*'])?.[path]
  if (!ep) throw new Error(`unexpected path ${path} for key ${token}`)
  const limit = params['limit'] === undefined ? 20 : Number(params['limit'])
  if (!Number.isInteger(limit) || limit < 1 || (ep.max !== undefined && limit > ep.max))
    throw new Error(`${path}: limit ${String(params['limit'])} out of range`)
  // Honour the documented `modified` filter on rows that carry `modified`.
  const since = params['modified'] as string | undefined
  const rows =
    since === undefined ? ep.rows : ep.rows.filter((r) => String(r['modified'] ?? '') >= since)
  const stride = ep.stride ?? 1
  let start = 0
  if (ep.mode === 'offset') start = Number(params['offset'] ?? 0)
  else {
    const index = (Number(params['page'] ?? 1) - 1) / (ep.mode === 'next-page' ? stride : 1)
    if (!Number.isInteger(index)) throw new Error(`${path}: no page ${String(params['page'])}`)
    start = index * limit
  }
  const slice = rows.slice(start, start + limit)
  const more = start + limit < rows.length
  const body: Record<string, unknown> = { status: 'ok', [ep.key]: slice }
  if (ep.mode === 'next-page' && more) {
    body['next'] = `?limit=${limit}&page=${Number(params['page'] ?? 1) + stride}`
  }
  return { data: body }
}

function serveKeys(byToken: Record<string, Record<string, Endpoint>>) {
  endpoints = byToken
  vi.spyOn(axios, 'create').mockImplementation(((config: { headers: Record<string, string> }) => ({
    get: vi.fn(async (path: string, c?: { params?: Record<string, unknown> }) =>
      respond(config.headers['API-Authorization'] ?? '', path, c?.params),
    ),
  })) as never)
}

function serve(e: Record<string, Endpoint>) {
  serveKeys({ '*': e })
}

type ListMethod =
  | 'listProducts'
  | 'listVariants'
  | 'listInventoryLevels'
  | 'listCustomers'
  | 'listOrders'
  | 'listFulfillments'
  | 'listRefunds'

function call(
  method: ListMethod,
  params: QueryParams,
  creds: Credentials = CREDS,
): Promise<Array<{ id: string }>> {
  const adapter = new CentraAdapter()
  return adapter[method](creds, params) as Promise<Array<{ id: string }>>
}

async function drive(method: ListMethod, limit: number, maxPages = 50) {
  const seen: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= maxPages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await call(method, params)
    seen.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
    if (hasMore.at(-1) === false) break
  }
  return { seen, hasMore }
}

beforeEach(() => {
  calls = []
  _resetRowPager()
})
afterEach(() => vi.restoreAllMocks())

// ── 1:1 methods ─────────────────────────────────────────────────────────────

interface Case {
  method: ListMethod
  path: string
  mode: Mode
  key: string
  row: (i: number) => Record<string, unknown>
  id: (i: number) => string
  /** The documented request parameter that moves on page 2, and its value at limit 3. */
  pageKey: 'page' | 'offset'
  page2: number
  max?: number
}

const CASES: Case[] = [
  {
    method: 'listVariants',
    path: 'products',
    mode: 'next-page',
    key: 'products',
    row: (i) => ({ productId: 1000 + i, variantId: 2000 + i, stockItemId: 3000 + i, sku: `s${i}` }),
    id: (i) => String(3000 + i),
    pageKey: 'page',
    page2: 2,
  },
  {
    method: 'listInventoryLevels',
    path: 'stock',
    mode: 'next-page',
    key: 'products',
    row: (i) => ({ productId: 1, variantId: 2, stockItemId: 500 + i, availableStock: i }),
    id: (i) => `${500 + i}:default`,
    pageKey: 'page',
    page2: 2,
  },
  {
    method: 'listCustomers',
    path: 'customers',
    mode: 'offset',
    key: 'customers',
    row: (i) => ({ customerId: 100 + i, email: `c${i}@example.test` }),
    id: (i) => String(100 + i),
    pageKey: 'offset',
    page2: 3,
  },
  {
    method: 'listOrders',
    path: 'orders',
    mode: 'offset',
    key: 'orders',
    row: (i) => ({ orderId: 200 + i }),
    id: (i) => String(200 + i),
    pageKey: 'offset',
    page2: 3,
  },
  {
    method: 'listFulfillments',
    path: 'shipments',
    mode: 'offset',
    key: 'shipments',
    row: (i) => ({ shipmentId: 300 + i, orderId: 1 }),
    id: (i) => String(300 + i),
    pageKey: 'offset',
    page2: 3,
    max: 100,
  },
  {
    method: 'listRefunds',
    path: 'returns',
    mode: 'page',
    key: 'returns',
    row: (i) => ({ returnId: 400 + i, orderId: 1 }),
    id: (i) => String(400 + i),
    pageKey: 'page',
    page2: 2,
  },
]

function serveCase(c: Case, n: number) {
  serve({
    [c.path]: {
      mode: c.mode,
      key: c.key,
      rows: Array.from({ length: n }, (_, i) => c.row(i)),
      ...(c.max !== undefined ? { max: c.max } : {}),
    },
  })
}

describe.each(CASES)('centra $method paging', (c) => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serveCase(c, 2 * L + 1)
    const seen: string[] = []
    const more: boolean[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(c.method, params)
      seen.push(...rows.map((r) => r.id))
      // Reported, or (with no documented next signal) a short page is the end.
      more.push(readUpstreamPage(params)?.hasMore ?? rows.length === L)
    }
    expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => c.id(i)))
    expect(more).toEqual([true, true, false])
  })

  it(`sends the documented ${c.pageKey} on page 2`, async () => {
    serveCase(c, 7)
    await call(c.method, withPageSink({ page: 2, limit: 3 }))
    const last = calls.at(-1)!
    expect(last.path).toBe(c.path)
    expect(Number(last.params[c.pageKey])).toBe(c.page2)
    expect(Number(last.params['limit'])).toBe(3)
  })

  it('clamps a limit above 100 and still serves every row', async () => {
    const N = 2 * MAX + 5
    serveCase(c, N)
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 150 })
      const rows = await call(c.method, params)
      seen.push(...rows.map((r) => r.id))
      expect(Number(calls.at(-1)!.params['limit'])).toBe(MAX)
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      if ((readUpstreamPage(params)?.hasMore ?? rows.length === MAX) === false) break
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => c.id(i)))
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serveCase(c, 7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await call(c.method, params), params, 'centra')
    expect(out.data.map((r) => r.id)).toEqual([c.id(3), c.id(4), c.id(5)])
    expect(out.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '3' })
    const tail = listPage(await call(c.method, last), last, 'centra')
    expect(tail.data.map((r) => r.id)).toEqual([c.id(6)])
    expect(tail.meta.hasMore).toBe(false)
  })
})

// ── listProducts: stock-item rows folded into products ──────────────────────

/**
 * One upstream row per stock item. Products p0..p6 with 1, 2, 1, 3, 1, 2, 1
 * stock items: 11 rows, so upstream pages of any size split some products.
 */
const ITEMS_PER_PRODUCT = [1, 2, 1, 3, 1, 2, 1]
function productRows(counts: number[]) {
  const rows: Array<Record<string, unknown>> = []
  counts.forEach((n, p) => {
    for (let k = 0; k < n; k++) {
      rows.push({ productId: 10 + p, variantId: 100 * (p + 1), stockItemId: 1000 * (p + 1) + k })
    }
  })
  return rows
}

function serveProducts(counts: number[]) {
  serve({ products: { mode: 'next-page', key: 'products', rows: productRows(counts) } })
}

describe('centra listProducts paging', () => {
  it('serves 2L+1 products across pages 1..3, each once, whole, with exact hasMore', async () => {
    serveProducts(ITEMS_PER_PRODUCT)
    const adapter = new CentraAdapter()
    const seen: string[] = []
    const variants: number[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 3 })
      const rows = await adapter.listProducts(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      variants.push(...rows.map((r) => r.variants?.length ?? 0))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['10', '11', '12', '13', '14', '15', '16'])
    expect(variants).toEqual(ITEMS_PER_PRODUCT)
    expect(hasMore).toEqual([true, true, false])
  })

  it('keeps a product whole when its stock items straddle upstream pages', async () => {
    // One product with 250 stock items spans three upstream pages of 100.
    serveProducts([1, 250, 1])
    const { seen } = await drive('listProducts', 1)
    expect(seen).toEqual(['10', '11', '12'])
    const params = withPageSink({ page: 2, limit: 1 })
    _resetRowPager()
    const [big] = await new CentraAdapter().listProducts(CREDS, params)
    expect(big?.variants).toHaveLength(250)
  })

  it('follows the documented `next` page on the second upstream request', async () => {
    serveProducts(Array.from({ length: 150 }, () => 1))
    await call('listProducts', withPageSink({ page: 2, limit: 100 }))
    const pages = calls.filter((c) => c.path === 'products').map((c) => Number(c.params['page']))
    expect(pages).toEqual([1, 2])
  })

  it('serves every product at a limit above 100', async () => {
    const counts = Array.from({ length: 205 }, (_, i) => (i % 3) + 1)
    serveProducts(counts)
    const { seen, hasMore } = await drive('listProducts', 150)
    expect(seen).toEqual(counts.map((_, i) => String(10 + i)))
    expect(hasMore).toEqual([true, false])
    for (const c of calls) expect(Number(c.params['limit'])).toBeLessThanOrEqual(MAX)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serveProducts(ITEMS_PER_PRODUCT)
    const params = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await call('listProducts', params), params, 'centra')
    expect(out.data.map((r) => r.id)).toEqual(['13', '14', '15'])
    expect(out.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '3' })
    const tail = listPage(await call('listProducts', last), last, 'centra')
    expect(tail.data.map((r) => r.id)).toEqual(['16'])
    expect(tail.meta.hasMore).toBe(false)
  })
})

// ── End signals, pager keys and filters ─────────────────────────────────────

describe('centra paging: the documented `next` is the end signal for products and stock', () => {
  it.each(['listVariants', 'listInventoryLevels'] as const)(
    '%s ends on a full last page because `next` is absent',
    async (method) => {
      const c = CASES.find((x) => x.method === method)!
      serveCase(c, 6)
      const { seen, hasMore } = await drive(method, 3)
      expect(seen).toEqual(Array.from({ length: 6 }, (_, i) => c.id(i)))
      expect(hasMore).toEqual([true, false])
    },
  )

  it('listProducts follows a `next` that skips page numbers', async () => {
    serve({
      products: {
        mode: 'next-page',
        key: 'products',
        rows: productRows(Array.from({ length: 150 }, () => 1)),
        stride: 4,
      },
    })
    const { seen, hasMore } = await drive('listProducts', 100)
    expect(seen).toEqual(Array.from({ length: 150 }, (_, i) => String(10 + i)))
    expect(hasMore).toEqual([true, false])
    expect([...new Set(calls.map((c) => Number(c.params['page'])))]).toEqual([1, 5])
  })

  it('listProducts stops on a full upstream page without `next`', async () => {
    serveProducts(Array.from({ length: 200 }, () => 1))
    const { seen, hasMore } = await drive('listProducts', 100)
    expect(seen).toHaveLength(200)
    expect(hasMore).toEqual([true, false])
    expect(calls.every((c) => Number(c.params['page']) <= 2)).toBe(true)
  })
})

describe('centra listProducts pager key', () => {
  const CREDS_B: Credentials = { ...CREDS, accessToken: 'key-b' }

  function productsFrom(firstId: number, n: number) {
    return Array.from({ length: n }, (_, i) => ({
      productId: firstId + i,
      variantId: 1,
      stockItemId: 10_000 + firstId + i,
    }))
  }

  it('is per connection: two keys on one base URL never share rows', async () => {
    serveKeys({
      key: { products: { mode: 'next-page', key: 'products', rows: productsFrom(10, 7) } },
      'key-b': { products: { mode: 'next-page', key: 'products', rows: productsFrom(50, 7) } },
    })
    // Page 3 continues forward from where key A's page 2 stopped, which is
    // exactly when the pager serves its buffered upstream page. That buffer
    // holds key A's rows, so key B must never reach it.
    const a = await call('listProducts', withPageSink({ page: 2, limit: 3 }))
    expect(a.map((r) => r.id)).toEqual(['13', '14', '15'])
    const b = await call('listProducts', withPageSink({ page: 3, limit: 3 }), CREDS_B)
    expect(b.map((r) => r.id)).toEqual(['56'])
    expect(calls.at(-1)!.token).toBe('key-b')
  })

  it('separates walks by updatedAfter and sends it as `modified`', async () => {
    // Products 11..16 changed after the cutoff, product 10 before it.
    const rows = productsFrom(10, 7).map((r, i) => ({
      ...r,
      modified: i < 1 ? '2026-01-01 00:00:00' : '2026-06-01 00:00:00',
    }))
    serve({ products: { mode: 'next-page', key: 'products', rows } })
    const all = await call('listProducts', withPageSink({ page: 2, limit: 2 }))
    expect(all.map((r) => r.id)).toEqual(['12', '13'])

    // Page 3 of the filtered walk must not continue the unfiltered one.
    const since = new Date('2026-05-01T00:00:00Z')
    const recent = await call(
      'listProducts',
      withPageSink({ page: 3, limit: 2, updatedAfter: since }),
    )
    expect(recent.map((r) => r.id)).toEqual(['15', '16'])
    expect(calls.at(-1)!.params['modified']).toBe('2026-05-01')
  })
})

describe('centra paging keeps the filters it re-plumbed', () => {
  it('listFulfillments sends `order`', async () => {
    serveCase(
      CASES.find((c) => c.method === 'listFulfillments')!,
      7,
    )
    await call('listFulfillments', withPageSink({ page: 2, limit: 3, order_id: '9' }))
    expect(calls.at(-1)!.params).toMatchObject({ order: '9', offset: 3 })
  })

  it('listRefunds sends `order`', async () => {
    serveCase(
      CASES.find((c) => c.method === 'listRefunds')!,
      7,
    )
    await call('listRefunds', withPageSink({ page: 2, limit: 3, orderId: '9' }))
    expect(calls.at(-1)!.params).toMatchObject({ order: '9', page: 2 })
  })

  it('listVariants sends `product`', async () => {
    serveCase(
      CASES.find((c) => c.method === 'listVariants')!,
      7,
    )
    await call('listVariants', withPageSink({ page: 2, limit: 3, productId: '7' }))
    expect(calls.at(-1)!.params).toMatchObject({ product: '7', page: 2 })
  })

  // Pins the filter the list methods already sent before the paging fix; it
  // does not claim `modified` is the documented name for every endpoint.
  it.each(['listCustomers', 'listOrders', 'listRefunds'] as const)(
    '%s forwards updatedAfter as `modified`',
    async (method) => {
      serveCase(
        CASES.find((c) => c.method === method)!,
        7,
      )
      const since = new Date('2026-05-01T00:00:00Z')
      await call(method, withPageSink({ page: 1, limit: 3, updatedAfter: since }))
      expect(calls.at(-1)!.params['modified']).toBe('2026-05-01')
    },
  )
})
