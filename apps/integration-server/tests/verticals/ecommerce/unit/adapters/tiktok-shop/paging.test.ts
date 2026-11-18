/**
 * TikTok Shop's 202309 list endpoints page by an opaque `page_token`, returned
 * as `next_page_token`. Every doc below is TikTok's own
 * (partner.tiktokshop.com, document ids in brackets):
 *
 *   - Search Products  POST /product/202309/products/search  [6503081a56e2bb0289dd6d7d]
 *   - Get Order List   POST /order/202309/orders/search      [650aa8094a0bb702c06df242]
 *   - Search Returns   POST /return_refund/202309/returns/search [650ab69edefece02be70785b]
 *   - Get Payments     GET  /finance/202309/payments         [650a6784bace3e02b756fe6d]
 *
 * all take `page_size` and `page_token` as QUERY parameters: "An opaque token
 * used to retrieve the next page of a paginated result set. Retrieve this
 * value from the result of the `next_page_token` from a previous response.
 * It is not needed for the first page." Products, orders and payments allow
 * page_size 1-100; returns allow 10-50 (default 10).
 *
 *   - Search Promotion Activities POST /promotion/202309/activities/search
 *     [650acfbaf1fd3102b9315a3a] takes them in the BODY: page_size `[0, 100]`
 *     (50 by default), and page_token "Use `""` for the first page"; the last
 *     page's next_page_token is "".
 *   - Get Warehouse List GET /logistics/202309/warehouses [650aa418defece02be6e66b6]
 *     has no paging: "This API retrieves all warehouse information associated
 *     with the seller."
 *
 * The adapter used to put page_size/page_token in the POST body and read the
 * token from `params.cursor`, which the router never sets, so page 2 repeated
 * page 1 on every list.
 *
 * The fake sits at axios.create, the seam the client builds on, and runs the
 * client's real signing interceptor, so what it sees is what TikTok would.
 * It honours ONLY the documented parameters, in the documented place.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { TikTokShopAdapter } from '../../../../../../src/verticals/ecommerce/adapters/tiktok-shop/index'

const CREDS = {
  accessToken: 'tok',
  refreshToken: 'ref',
  extra: { appKey: 'ak', appSecret: 'as', shopCipher: 'shop-1' },
}

interface Call {
  method: 'GET' | 'POST'
  path: string
  query: Record<string, unknown>
  body: Record<string, unknown> | undefined
}

type Interceptor = (cfg: { url: string; params?: Record<string, unknown>; data?: unknown }) => {
  params?: Record<string, unknown>
}

const encode = (i: number): string => Buffer.from(`off:${i}`).toString('base64')
const decode = (c: string): number => Number(Buffer.from(c, 'base64').toString().slice(4))

interface Sizes {
  products?: number
  orders?: number
  returns?: number
  payments?: number
  activities?: number
  warehouses?: number
}

/**
 * The SKUs of product `pK` in the fake: K % 3 of them (0, 1 or 2), and SKU j
 * stocked in j warehouses. So products yield 0, 1 or 3 inventory rows each,
 * and upstream pages yield uneven row counts.
 */
function fakeSkus(productId: string): {
  id: string
  warehouse_inventory: {
    warehouse_id: string
    available_quantity: number
    committed_quantity: number
  }[]
}[] {
  const k = Number(productId.slice(1))
  return Array.from({ length: k % 3 }, (_, j) => ({
    id: `${productId}-s${j + 1}`,
    warehouse_inventory: Array.from({ length: j + 1 }, (_, w) => ({
      warehouse_id: `w${w + 1}`,
      available_quantity: k + w,
      committed_quantity: w,
    })),
  }))
}

/** Inventory row ids, in stream order, for products p1..pN. */
function inventoryIds(products: number): string[] {
  const out: string[] = []
  for (let k = 1; k <= products; k++) {
    for (const sku of fakeSkus(`p${k}`)) {
      for (const wh of sku.warehouse_inventory) out.push(`${sku.id}:${wh.warehouse_id}`)
    }
  }
  return out
}

/** One page of `total` rows named `${prefix}${i}`, 1-based. */
function slice(
  prefix: string,
  total: number,
  token: unknown,
  rawSize: unknown,
  { min, max, dflt, required }: { min: number; max: number; dflt: number; required?: boolean },
): { rows: { id: string }[]; next: string } {
  if (required && rawSize === undefined) throw new Error(`${prefix}: page_size is required`)
  const size = rawSize === undefined ? dflt : Number(rawSize)
  if (!Number.isInteger(size) || size < min || size > max) {
    throw new Error(`${prefix}: page_size ${String(rawSize)} outside ${min}..${max}`)
  }
  const start = token === undefined || token === '' ? 0 : decode(String(token))
  const end = Math.min(start + size, total)
  const rows = []
  for (let i = start; i < end; i++) rows.push({ id: `${prefix}${i + 1}` })
  return { rows, next: end < total ? encode(end) : '' }
}

function fakeTikTok(sizes: Sizes): Call[] {
  const calls: Call[] = []
  let interceptor: Interceptor = (c) => c
  const sign = (path: string, params: Record<string, unknown> | undefined, data: unknown) =>
    interceptor({ url: path, params, data }).params ?? {}

  const post = vi.fn(
    async (path: string, body?: unknown, cfg?: { params?: Record<string, unknown> }) => {
      const query = sign(path, cfg?.params, body)
      const b = (body ?? undefined) as Record<string, unknown> | undefined
      calls.push({ method: 'POST', path, query, body: b })
      if (path === '/product/202309/products/search') {
        const { rows, next } = slice(
          'p',
          sizes.products ?? 0,
          query['page_token'],
          query['page_size'],
          {
            min: 1,
            max: 100,
            dflt: 100,
            required: true,
          },
        )
        return {
          data: {
            code: 0,
            data: { products: rows, total_count: sizes.products, next_page_token: next },
          },
        }
      }
      if (path === '/product/202309/inventory/search') {
        // Documented body: product_ids (Max IDs: 100) or sku_ids (Max IDs: 600),
        // sku_ids taking precedence. No paging parameters anywhere.
        if (query['page_size'] !== undefined || query['page_token'] !== undefined) {
          throw new Error('inventory/search: no paging parameters are documented')
        }
        const keys = Object.keys(b ?? {})
        if (keys.some((k) => k !== 'product_ids' && k !== 'sku_ids')) {
          throw new Error(`inventory/search: undocumented body field in ${keys.join(',')}`)
        }
        const skuIds = b?.['sku_ids'] as string[] | undefined
        const productIds = b?.['product_ids'] as string[] | undefined
        if (skuIds) {
          if (skuIds.length > 600) throw new Error('inventory/search: more than 600 sku_ids')
          const inventory = skuIds.map((sid) => {
            const pid = sid.split('-')[0]!
            return { product_id: pid, skus: fakeSkus(pid).filter((x) => x.id === sid) }
          })
          return { data: { code: 0, data: { inventory } } }
        }
        if (!productIds?.length) throw new Error('inventory/search: no ids')
        if (productIds.length > 100) throw new Error('inventory/search: more than 100 product_ids')
        const inventory = productIds.map((pid) => ({ product_id: pid, skus: fakeSkus(pid) }))
        return { data: { code: 0, data: { inventory } } }
      }
      if (path === '/order/202309/orders/search') {
        const { rows, next } = slice(
          'o',
          sizes.orders ?? 0,
          query['page_token'],
          query['page_size'],
          {
            min: 1,
            max: 100,
            dflt: 20,
            required: true,
          },
        )
        return {
          data: {
            code: 0,
            data: { orders: rows, total_count: sizes.orders, next_page_token: next },
          },
        }
      }
      if (path === '/return_refund/202309/returns/search') {
        const { rows, next } = slice(
          'r',
          sizes.returns ?? 0,
          query['page_token'],
          query['page_size'],
          {
            min: 10,
            max: 50,
            dflt: 10,
          },
        )
        return {
          data: {
            code: 0,
            data: { return_orders: rows, total_count: sizes.returns, next_page_token: next },
          },
        }
      }
      if (path === '/promotion/202309/activities/search') {
        const { rows, next } = slice(
          'd',
          sizes.activities ?? 0,
          b?.['page_token'],
          b?.['page_size'],
          {
            min: 0,
            max: 100,
            dflt: 50,
          },
        )
        return {
          data: {
            code: 0,
            data: { activities: rows, total_count: sizes.activities, next_page_token: next },
          },
        }
      }
      throw new Error(`unexpected POST ${path}`)
    },
  )

  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const query = sign(path, cfg?.params, undefined)
    calls.push({ method: 'GET', path, query, body: undefined })
    const product = /^\/product\/202309\/products\/(p\d+)$/.exec(path)
    if (product) return { data: { code: 0, data: { id: product[1], title: product[1] } } }
    if (path === '/order/202309/orders') {
      // Get Order Detail: query `ids`, comma-separated, "Max count: 50".
      const idList = String(query['ids'] ?? '')
        .split(',')
        .filter(Boolean)
      if (idList.length === 0 || idList.length > 50) throw new Error('orders: ids 1..50 required')
      return { data: { code: 0, data: { orders: idList.map((id) => ({ id })) } } }
    }
    if (path === '/finance/202309/payments') {
      const { rows, next } = slice(
        't',
        sizes.payments ?? 0,
        query['page_token'],
        query['page_size'],
        {
          min: 1,
          max: 100,
          dflt: 20,
        },
      )
      return { data: { code: 0, data: { payments: rows, next_page_token: next } } }
    }
    if (path === '/logistics/202309/warehouses') {
      const warehouses = []
      for (let i = 0; i < (sizes.warehouses ?? 0); i++) warehouses.push({ id: `w${i + 1}` })
      return { data: { code: 0, data: { warehouses } } }
    }
    throw new Error(`unexpected GET ${path}`)
  })

  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post,
    interceptors: {
      request: {
        use: (fn: Interceptor) => {
          interceptor = fn
        },
      },
    },
  } as never)
  return calls
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

type ListMethod =
  | 'listProducts'
  | 'listOrders'
  | 'listRefunds'
  | 'listTransactions'
  | 'listDiscounts'
  | 'listLocations'

async function call(
  method: ListMethod,
  params: QueryParams,
  adapter = new TikTokShopAdapter(),
): Promise<string[]> {
  const rows = (await adapter[method](CREDS, params)) as { id: string }[]
  return rows.map((r) => r.id)
}

async function walk(
  method: ListMethod,
  limit: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: (boolean | undefined)[]; sizes: number[] }> {
  const adapter = new TikTokShopAdapter()
  const out: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const sizes: number[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    const got = await call(method, params, adapter)
    out.push(...got)
    sizes.push(got.length)
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids: out, hasMore, sizes }
}

const ids = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

const searches = (calls: Call[], path: string): Call[] => calls.filter((c) => c.path === path)

async function apiPage(method: ListMethod, limit: number, page: number) {
  const p = parseListQuery({ limit: String(limit), page: String(page) })
  const got = (await new TikTokShopAdapter()[method](CREDS, p)) as { id: string }[]
  return listPage(got, p, 'tiktok-shop')
}

// ── Cursor methods: one upstream page is one caller page ─────────────────────

interface CursorCase {
  method: ListMethod
  prefix: string
  size: keyof Sizes
  path: string
  /** Where page_size and page_token travel. */
  where: 'query' | 'body'
  max: number
}

const CURSOR_CASES: CursorCase[] = [
  {
    method: 'listProducts',
    prefix: 'p',
    size: 'products',
    path: '/product/202309/products/search',
    where: 'query',
    max: 100,
  },
  {
    method: 'listOrders',
    prefix: 'o',
    size: 'orders',
    path: '/order/202309/orders/search',
    where: 'query',
    max: 100,
  },
  {
    method: 'listTransactions',
    prefix: 't',
    size: 'payments',
    path: '/finance/202309/payments',
    where: 'query',
    max: 100,
  },
  {
    method: 'listDiscounts',
    prefix: 'd',
    size: 'activities',
    path: '/promotion/202309/activities/search',
    where: 'body',
    max: 100,
  },
]

/** A query string carries text; read page_size back as the number it names. */
const paging = (c: Call, where: 'query' | 'body'): Record<string, unknown> => {
  const src = (where === 'query' ? c.query : c.body) ?? {}
  return src['page_size'] === undefined ? src : { ...src, page_size: Number(src['page_size']) }
}

for (const tc of CURSOR_CASES) {
  describe(`TikTok Shop ${tc.method} pages by page_token`, () => {
    it('serves 2L+1 rows over three pages, each once, in order, hasMore exact', async () => {
      const calls = fakeTikTok({ [tc.size]: 7 })
      const r = await walk(tc.method, 3, 3)
      expect(r.ids).toEqual(ids(tc.prefix, 7))
      expect(r.sizes).toEqual([3, 3, 1])
      expect(r.hasMore).toEqual([true, true, false])
      const s = searches(calls, tc.path)
      expect(s).toHaveLength(3)
      expect(s.map((c) => paging(c, tc.where)['page_size'])).toEqual([3, 3, 3])
    })

    it('ends exactly on a full last page: 2L rows read hasMore [true, false]', async () => {
      fakeTikTok({ [tc.size]: 6 })
      const r = await walk(tc.method, 3, 2)
      expect(r.ids).toEqual(ids(tc.prefix, 6))
      expect(r.hasMore).toEqual([true, false])
    })

    it(`the page-2 request carries page 1's next_page_token as page_token in the ${tc.where}`, async () => {
      const calls = fakeTikTok({ [tc.size]: 7 })
      await walk(tc.method, 3, 2)
      const s = searches(calls, tc.path)
      expect(paging(s[0]!, tc.where)['page_token'] || undefined).toBeUndefined()
      expect(paging(s[1]!, tc.where)).toMatchObject({ page_size: 3, page_token: encode(3) })
    })

    it('a cold page 2 walks the token chain rather than repeating page 1', async () => {
      fakeTikTok({ [tc.size]: 7 })
      const params = withPageSink({ page: 2, limit: 3 })
      expect(await call(tc.method, params)).toEqual(ids(tc.prefix, 7).slice(3, 6))
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
    })

    it(`clamps a limit above ${tc.max} to page_size ${tc.max}, reports it, and serves every row`, async () => {
      const n = 2 * tc.max + 1
      const calls = fakeTikTok({ [tc.size]: n })
      const r = await walk(tc.method, 150, 3)
      expect(r.ids).toEqual(ids(tc.prefix, n))
      expect(r.sizes).toEqual([tc.max, tc.max, 1])
      expect(r.hasMore).toEqual([true, true, false])
      expect(searches(calls, tc.path).map((c) => paging(c, tc.where)['page_size'])).toEqual([
        tc.max,
        tc.max,
        tc.max,
      ])
      const params = withPageSink({ page: 1, limit: 150 })
      await call(tc.method, params)
      expect(readUpstreamPage(params)?.pageSize).toBe(tc.max)
    })

    it('reports meta.hasMore through parseListQuery and listPage', async () => {
      fakeTikTok({ [tc.size]: 7 })
      const env2 = await apiPage(tc.method, 3, 2)
      expect(env2.data.map((r) => r.id)).toEqual(ids(tc.prefix, 7).slice(3, 6))
      expect(env2.meta.hasMore).toBe(true)
      const env3 = await apiPage(tc.method, 3, 3)
      expect(env3.data.map((r) => r.id)).toEqual(ids(tc.prefix, 7).slice(6))
      expect(env3.meta.hasMore).toBe(false)
    })

    it('two connections keep separate token walks', async () => {
      const calls = fakeTikTok({ [tc.size]: 7 })
      const adapter = new TikTokShopAdapter()
      await adapter[tc.method](CREDS, withPageSink({ page: 1, limit: 3 }))
      calls.length = 0
      const credsB = { ...CREDS, accessToken: 'tok-b', refreshToken: 'ref-b' }
      const rows = (await adapter[tc.method](credsB, withPageSink({ page: 2, limit: 3 }))) as {
        id: string
      }[]
      expect(rows.map((r) => r.id)).toEqual(ids(tc.prefix, 7).slice(3, 6))
      const s = searches(calls, tc.path)
      expect(s).toHaveLength(2)
      expect(paging(s[0]!, tc.where)['page_token'] || undefined).toBeUndefined()
    })
  })
}

describe('TikTok Shop listOrders reads the list response, with no time window invented', () => {
  it('an unfiltered walk sends an empty filter body: no create_time window, no lookback', async () => {
    const calls = fakeTikTok({ orders: 7 })
    await walk('listOrders', 3, 3)
    const s = searches(calls, '/order/202309/orders/search')
    expect(s).toHaveLength(3)
    for (const c of s) expect(c.body).toEqual({})
  })

  it('makes no per-order request: Get Order List returns the orders themselves', async () => {
    const calls = fakeTikTok({ orders: 7 })
    await walk('listOrders', 3, 3)
    expect(calls.filter((c) => c.path !== '/order/202309/orders/search')).toEqual([])
  })

  it('sends updatedAfter as update_time_ge on every page of the walk', async () => {
    const calls = fakeTikTok({ orders: 7 })
    const adapter = new TikTokShopAdapter()
    const since = new Date('2026-09-01T00:00:00Z')
    for (let k = 1; k <= 3; k++) {
      await adapter.listOrders(CREDS, {
        ...withPageSink({ page: k, limit: 3 }),
        updatedAfter: since,
      })
    }
    const s = searches(calls, '/order/202309/orders/search')
    expect(s.map((c) => c.body)).toEqual(
      Array(3).fill({ update_time_ge: Math.floor(since.getTime() / 1000) }),
    )
  })

  it('throws on an error envelope instead of reading it as the end of the list', async () => {
    const adapter = new TikTokShopAdapter()
    const spy = vi.spyOn(axios, 'create').mockReturnValue({
      post: async () => ({ data: { code: 105001, message: 'Invalid page_size', data: {} } }),
      get: async () => ({ data: {} }),
      interceptors: { request: { use: () => undefined } },
    } as never)
    await expect(adapter.listOrders(CREDS, withPageSink({ page: 1, limit: 3 }))).rejects.toThrow(
      /Get Order List failed: code 105001/,
    )
    spy.mockRestore()
  })
})

describe('TikTok Shop getOrder reads Get Order Detail by ids', () => {
  it('sends GET /order/202309/orders with query ids, not an id path', async () => {
    const calls = fakeTikTok({})
    const order = await new TikTokShopAdapter().getOrder(CREDS, 'o42')
    expect(order.id).toBe('o42')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/order/202309/orders' })
    expect(calls[0]!.query['ids']).toBe('o42')
  })
})

/**
 * A client whose calls to `failPath` answer with a documented error envelope
 * (`code` non-zero); Search Products answers with one product, and anything
 * else with `respond` or an empty success.
 */
function envelopeFake(
  failPath: string,
  respond: (path: string) => unknown = () => ({ code: 0, data: {} }),
): string[] {
  const seen: string[] = []
  const reply = (path: string) => {
    seen.push(path)
    if (path === failPath) {
      return { data: { code: 12019008, message: 'Product id is invalid', data: {} } }
    }
    if (path === '/product/202309/products/search') {
      return { data: { code: 0, data: { products: [{ id: 'p1' }], next_page_token: '' } } }
    }
    return { data: respond(path) }
  }
  vi.spyOn(axios, 'create').mockReturnValue({
    post: async (path: string) => reply(path),
    get: async (path: string) => reply(path),
    interceptors: { request: { use: () => undefined } },
  } as never)
  return seen
}

describe('TikTok Shop reads an error envelope as an error, never as an empty result', () => {
  it('listInventoryLevels throws when Search Products fails, instead of ending the walk', async () => {
    const seen = envelopeFake('/product/202309/products/search')
    const params = withPageSink({ page: 1, limit: 5 })
    await expect(new TikTokShopAdapter().listInventoryLevels(CREDS, params)).rejects.toThrow(
      /Search Products failed: code 12019008/,
    )
    expect(readUpstreamPage(params)).toBeUndefined()
    expect(seen).toEqual(['/product/202309/products/search'])
  })

  it('listInventoryLevels throws when Inventory Search fails, instead of serving no rows', async () => {
    envelopeFake('/product/202309/inventory/search')
    const params = withPageSink({ page: 1, limit: 5 })
    await expect(new TikTokShopAdapter().listInventoryLevels(CREDS, params)).rejects.toThrow(
      /Inventory Search failed: code 12019008/,
    )
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('getInventoryLevel throws the envelope error, not a not-found', async () => {
    envelopeFake('/product/202309/inventory/search')
    await expect(new TikTokShopAdapter().getInventoryLevel(CREDS, 'p1-s1:w1')).rejects.toThrow(
      /Inventory Search failed: code 12019008/,
    )
  })

  it('getOrder throws the envelope error, not a not-found', async () => {
    envelopeFake('/order/202309/orders')
    await expect(new TikTokShopAdapter().getOrder(CREDS, 'o1')).rejects.toThrow(
      /Get Order Detail failed: code 12019008/,
    )
  })
})

describe('TikTok Shop getOrder returns the order it asked for', () => {
  it('picks the order whose id matches, not whichever comes first', async () => {
    envelopeFake('none', () => ({ code: 0, data: { orders: [{ id: 'other' }, { id: 'o42' }] } }))
    expect((await new TikTokShopAdapter().getOrder(CREDS, 'o42')).id).toBe('o42')
  })

  it('throws when the response does not carry the requested id', async () => {
    envelopeFake('none', () => ({ code: 0, data: { orders: [{ id: 'other' }] } }))
    await expect(new TikTokShopAdapter().getOrder(CREDS, 'o42')).rejects.toThrow(
      /no order found for id 'o42'/,
    )
  })
})

// ── listInventoryLevels: Search Products pages → Inventory Search, cut by rows ──

describe('TikTok Shop listInventoryLevels walks products into Inventory Search', () => {
  const SEARCH = '/product/202309/products/search'
  const INV = '/product/202309/inventory/search'

  async function walkInventory(limit: number, pages: number) {
    const adapter = new TikTokShopAdapter()
    const out: string[] = []
    const hasMore: (boolean | undefined)[] = []
    const sizes: number[] = []
    for (let k = 1; k <= pages; k++) {
      const params = withPageSink({ page: k, limit })
      const got = (await adapter.listInventoryLevels(CREDS, params)).map((r) => r.id)
      out.push(...got)
      sizes.push(got.length)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    return { ids: out, hasMore, sizes }
  }

  it('serves 2L+1 rows over three pages from one upstream page, each once, hasMore exact', async () => {
    // p1: 1 row, p2: 3 rows, p3: 0, p4: 1 → 5 rows.
    const calls = fakeTikTok({ products: 4 })
    const r = await walkInventory(2, 3)
    expect(r.ids).toEqual(inventoryIds(4))
    expect(r.ids).toHaveLength(5)
    expect(r.sizes).toEqual([2, 2, 1])
    expect(r.hasMore).toEqual([true, true, false])
    expect(searches(calls, SEARCH)).toHaveLength(1)
    expect(searches(calls, INV)).toHaveLength(1)
  })

  it('serves 2L+1 rows across uneven upstream pages, every row once, in order', async () => {
    // 151 products over two Search Products pages (100 + 51), rows 0/1/3 per product.
    const all = inventoryIds(151)
    expect(all.length % 2).toBe(1)
    const L = (all.length - 1) / 2
    const calls = fakeTikTok({ products: 151 })
    const r = await walkInventory(L, 3)
    expect(r.ids).toEqual(all)
    expect(new Set(r.ids).size).toBe(all.length)
    expect(r.sizes).toEqual([L, L, 1])
    expect(r.hasMore).toEqual([true, true, false])
    const s = searches(calls, SEARCH)
    expect(s).toHaveLength(2)
    expect(s[0]!.query['page_token']).toBeUndefined()
    expect(s[1]!.query['page_token']).toBe(encode(100))
    // Each products page's ids, and only those, go to Inventory Search.
    const inv = searches(calls, INV)
    expect(inv.map((c) => (c.body!['product_ids'] as string[]).length)).toEqual([100, 51])
    expect(inv[1]!.body).toEqual({ product_ids: ids('p', 151).slice(100) })
  })

  it('sends Search Products its maximum page_size of 100 whatever the caller asks', async () => {
    const calls = fakeTikTok({ products: 4 })
    await walkInventory(1, 1)
    await walkInventory(500, 1)
    expect(new Set(searches(calls, SEARCH).map((c) => c.query['page_size']))).toEqual(
      new Set(['100']),
    )
  })

  it('reports meta.hasMore through parseListQuery and listPage', async () => {
    fakeTikTok({ products: 4 })
    const p2 = parseListQuery({ limit: '2', page: '2' })
    const env2 = listPage(
      await new TikTokShopAdapter().listInventoryLevels(CREDS, p2),
      p2,
      'tiktok-shop',
    )
    expect(env2.data.map((r) => r.id)).toEqual(inventoryIds(4).slice(2, 4))
    expect(env2.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: '2', page: '3' })
    const env3 = listPage(
      await new TikTokShopAdapter().listInventoryLevels(CREDS, p3),
      p3,
      'tiktok-shop',
    )
    expect(env3.meta.hasMore).toBe(false)
  })

  it("a second connection makes its own requests instead of reading the first one's rows", async () => {
    const calls = fakeTikTok({ products: 4 })
    const adapter = new TikTokShopAdapter()
    await adapter.listInventoryLevels(CREDS, withPageSink({ page: 1, limit: 2 }))
    calls.length = 0
    const rows = await adapter.listInventoryLevels(CREDS_B, withPageSink({ page: 2, limit: 2 }))
    expect(rows.map((r) => r.id)).toEqual(inventoryIds(4).slice(2, 4))
    expect(searches(calls, SEARCH)).toHaveLength(1)
  })

  it('an empty shop is one Search Products request and no Inventory Search', async () => {
    const calls = fakeTikTok({ products: 0 })
    const params = withPageSink({ page: 1, limit: 5 })
    expect(await new TikTokShopAdapter().listInventoryLevels(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(searches(calls, INV)).toHaveLength(0)
  })

  it('getInventoryLevel reads one SKU back by sku_ids and picks its warehouse', async () => {
    const calls = fakeTikTok({})
    const level = await new TikTokShopAdapter().getInventoryLevel(CREDS, 'p5-s2:w2')
    expect(level).toMatchObject({
      id: 'p5-s2:w2',
      variantId: 'p5-s2',
      locationId: 'w2',
      available: 6,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.body).toEqual({ sku_ids: ['p5-s2'] })
  })

  it('getInventoryLevel refuses an id without a warehouse, sending nothing', async () => {
    const calls = fakeTikTok({})
    await expect(new TikTokShopAdapter().getInventoryLevel(CREDS, 'p5-s2')).rejects.toThrow(
      /skuId:warehouseId/,
    )
    expect(calls).toHaveLength(0)
  })
})

// ── listRefunds: returns take page_size 10-50, so the caller's page is cut ──

describe('TikTok Shop listRefunds pages by rows over page_token', () => {
  const PATH = '/return_refund/202309/returns/search'

  it('serves 2L+1 rows over three pages, each once, in order, hasMore exact', async () => {
    const calls = fakeTikTok({ returns: 7 })
    const r = await walk('listRefunds', 3, 3)
    expect(r.ids).toEqual(ids('r', 7))
    expect(r.sizes).toEqual([3, 3, 1])
    expect(r.hasMore).toEqual([true, true, false])
    // A limit of 3 is below the documented minimum of 10: never sent.
    expect(searches(calls, PATH).map((c) => c.query['page_size'])).toEqual(['50'])
  })

  it('serves 2L+1 rows across upstream pages, the second carrying page_token', async () => {
    const calls = fakeTikTok({ returns: 61 })
    const r = await walk('listRefunds', 30, 3)
    expect(r.ids).toEqual(ids('r', 61))
    expect(r.sizes).toEqual([30, 30, 1])
    expect(r.hasMore).toEqual([true, true, false])
    const s = searches(calls, PATH)
    expect(s).toHaveLength(2)
    expect(s[0]!.query['page_token']).toBeUndefined()
    expect(s[1]!.query).toMatchObject({ page_size: '50', page_token: encode(50) })
    expect(s.every((c) => c.body?.['page_token'] === undefined)).toBe(true)
  })

  it('a limit above 50 is served from 50-row upstream pages, every row once', async () => {
    const calls = fakeTikTok({ returns: 241 })
    const r = await walk('listRefunds', 120, 3)
    expect(r.ids).toEqual(ids('r', 241))
    expect(r.sizes).toEqual([120, 120, 1])
    expect(r.hasMore).toEqual([true, true, false])
    expect(new Set(searches(calls, PATH).map((c) => c.query['page_size']))).toEqual(new Set(['50']))
  })

  it('reports meta.hasMore through parseListQuery and listPage', async () => {
    fakeTikTok({ returns: 7 })
    const env2 = await apiPage('listRefunds', 3, 2)
    expect(env2.data.map((r) => r.id)).toEqual(ids('r', 7).slice(3, 6))
    expect(env2.meta.hasMore).toBe(true)
    const env3 = await apiPage('listRefunds', 3, 3)
    expect(env3.data.map((r) => r.id)).toEqual(ids('r', 7).slice(6))
    expect(env3.meta.hasMore).toBe(false)
  })
})

// ── listLocations: the warehouse list is unpaginated, so it is sliced ───────

describe('TikTok Shop listLocations slices the whole warehouse list', () => {
  it('serves 2L+1 rows over three pages, each once, in order, hasMore exact', async () => {
    const calls = fakeTikTok({ warehouses: 7 })
    const r = await walk('listLocations', 3, 3)
    expect(r.ids).toEqual(ids('w', 7))
    expect(r.sizes).toEqual([3, 3, 1])
    expect(r.hasMore).toEqual([true, true, false])
    expect(calls.every((c) => c.query['page_size'] === undefined)).toBe(true)
  })

  it('reports meta.hasMore through parseListQuery and listPage', async () => {
    fakeTikTok({ warehouses: 7 })
    const env2 = await apiPage('listLocations', 3, 2)
    expect(env2.data.map((r) => r.id)).toEqual(ids('w', 7).slice(3, 6))
    expect(env2.meta.hasMore).toBe(true)
    const env3 = await apiPage('listLocations', 3, 3)
    expect(env3.meta.hasMore).toBe(false)
  })

  it('getLocation still finds a warehouse past the first page', async () => {
    fakeTikTok({ warehouses: 150 })
    const loc = await new TikTokShopAdapter().getLocation(CREDS, 'w150')
    expect(loc.id).toBe('w150')
  })
})

// ── Pager keys: a memoised token is reused only under the same key ──────────

const CREDS_B = { ...CREDS, accessToken: 'tok-b', refreshToken: 'ref-b' }

for (const tc of CURSOR_CASES) {
  describe(`TikTok Shop ${tc.method} keys its token walk by page size`, () => {
    it("a page 2 at a different limit walks afresh and serves that limit's rows", async () => {
      const calls = fakeTikTok({ [tc.size]: 12 })
      const adapter = new TikTokShopAdapter()
      await adapter[tc.method](CREDS, withPageSink({ page: 1, limit: 3 }))
      calls.length = 0
      const rows = (await adapter[tc.method](CREDS, withPageSink({ page: 2, limit: 5 }))) as {
        id: string
      }[]
      expect(rows.map((r) => r.id)).toEqual(ids(tc.prefix, 12).slice(5, 10))
      const s = searches(calls, tc.path)
      expect(s).toHaveLength(2)
      expect(paging(s[0]!, tc.where)['page_token'] || undefined).toBeUndefined()
      expect(s.map((c) => paging(c, tc.where)['page_size'])).toEqual([5, 5])
    })
  })
}

describe('TikTok Shop reports total_count where the endpoint returns it', () => {
  for (const tc of CURSOR_CASES.filter((c) => c.method !== 'listTransactions')) {
    it(`${tc.method} reports totalCount from total_count`, async () => {
      fakeTikTok({ [tc.size]: 7 })
      const params = withPageSink({ page: 1, limit: 3 })
      await call(tc.method, params)
      expect(readUpstreamPage(params)?.totalCount).toBe(7)
    })
  }
})

describe('TikTok Shop listDiscounts sends page_token "" on the first page', () => {
  it('the page-1 body carries page_token as the empty string, as documented', async () => {
    const calls = fakeTikTok({ activities: 7 })
    await call('listDiscounts', withPageSink({ page: 1, limit: 3 }))
    const s = searches(calls, '/promotion/202309/activities/search')
    expect(s).toHaveLength(1)
    expect(s[0]!.body).toHaveProperty('page_token', '')
  })
})

describe('TikTok Shop listOrders keys its walk by updatedAfter', () => {
  it("a page 2 under a different updatedAfter re-walks under that filter's window", async () => {
    const calls = fakeTikTok({ orders: 7 })
    const adapter = new TikTokShopAdapter()
    const a = new Date('2026-09-01T00:00:00Z')
    const b = new Date('2026-09-10T00:00:00Z')
    await adapter.listOrders(CREDS, { ...withPageSink({ page: 1, limit: 3 }), updatedAfter: a })
    calls.length = 0
    const rows = await adapter.listOrders(CREDS, {
      ...withPageSink({ page: 2, limit: 3 }),
      updatedAfter: b,
    })
    expect(rows.map((r) => r.id)).toEqual(ids('o', 7).slice(3, 6))
    const s = searches(calls, '/order/202309/orders/search')
    expect(s).toHaveLength(2)
    expect(s[0]!.query['page_token']).toBeUndefined()
    const bSecs = Math.floor(b.getTime() / 1000)
    expect(s.map((c) => c.body!['update_time_ge'])).toEqual([bSecs, bSecs])
  })
})

describe('TikTok Shop listRefunds keeps rows per connection', () => {
  const PATH = '/return_refund/202309/returns/search'

  it("a second connection makes its own request instead of reading the first's rows", async () => {
    const calls = fakeTikTok({ returns: 7 })
    const adapter = new TikTokShopAdapter()
    await adapter.listRefunds(CREDS, withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    const rows = await adapter.listRefunds(CREDS_B, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(ids('r', 7).slice(3, 6))
    const s = searches(calls, PATH)
    expect(s).toHaveLength(1)
    expect(s[0]!.query['page_token']).toBeUndefined()
  })

  it('a call with no limit (getRefund) serves 50 rows, one upstream page', async () => {
    fakeTikTok({ returns: 120 })
    const rows = await new TikTokShopAdapter().listRefunds(CREDS, {} as QueryParams)
    expect(rows.map((r) => r.id)).toEqual(ids('r', 50))
  })
})
