/**
 * Wish v3 reads: paging contract and request shape.
 *
 * Every /api/v2 path answers 404; the first-party v3 OpenAPI (behind
 * https://merchant.wish.com/documentation/api/v3/reference, server
 * "https://merchant.wish.com") documents:
 *   GET /api/v3/products  limit [1..1000] default 50, updated_at_min/_max,
 *                         sort_by default "updated_at.desc"; no offset.
 *   GET /api/v3/orders    limit [1..500] default 50, updated_at_min/_max,
 *                         sort_by default "updated_at.desc"; no offset.
 *   GET /api/v3/products/{id}  Product, with `variations` (the only source of
 *                         variations and their per-warehouse inventories).
 * Its "Pagination" section pages by `limit` plus `{attribute}_max` taken from
 * the last row of the previous page. Whether `updated_at_max` is inclusive is
 * not documented, so the fake below runs both readings.
 *
 * The fake honours only those documented parameters. Every response is the
 * documented envelope: "Each response will have the following top level
 * attributes: message, code and data."
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { WishAdapter } from '../../../../../../src/verticals/ecommerce/adapters/wish/index'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../src/verticals/ecommerce/schema/product'
import { OrderSchema } from '../../../../../../src/verticals/ecommerce/schema/order'
import { InventoryLevelSchema } from '../../../../../../src/verticals/ecommerce/schema/inventory'

const CREDS = { accessToken: 'wish-token', refreshToken: 'wish-refresh' }
const CONFIG = { clientId: 'cid', clientSecret: 'secret', redirectUri: 'https://app.example/cb' }
const DOCUMENTED_LIST_PARAMS = ['limit', 'sort_by', 'updated_at_max', 'updated_at_min']
const DOCUMENTED_PRODUCT_PARAMS = [...DOCUMENTED_LIST_PARAMS, 'statuses']
/** GET /api/v3/products `statuses` enum. */
const ALL_STATUSES = [
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'REMOVED_BY_WISH',
  'REMOVED_BY_MERCHANT',
]

interface Row {
  id: string
  updated_at: string
  [key: string]: unknown
}

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

/**
 * How the fake reads `updated_at_max`: at millisecond precision, including or
 * excluding its bound, or (`second-exclusive`) keeping only whole seconds of
 * both the bound and the row and excluding the bound.
 */
type MaxMode = 'inclusive' | 'exclusive' | 'second-exclusive'

const BASE_MS = Date.parse('2026-03-01T00:00:00.000Z')

/** `n` rows, newest first; every third pair shares one millisecond, so ties cross page boundaries. */
function makeRows(n: number, prefix: string, extra: (i: number) => Record<string, unknown>): Row[] {
  const rows: Row[] = []
  let ms = BASE_MS
  for (let i = 0; i < n; i++) {
    if (i % 3 !== 1) ms -= 1000
    rows.push({
      id: `${prefix}${String(i).padStart(4, '0')}`,
      updated_at: new Date(ms).toISOString(),
      ...extra(i),
    })
  }
  return rows
}

function envelope(data: unknown) {
  return { data: { message: '', code: 0, data } }
}

/**
 * A fake Wish v3 host: sorts by updated_at desc and honours only documented
 * params. Ties sort by id asc, or (`tieOrder: 'alternating'`) by id desc on
 * every other list request, as a server with no stable tiebreak could.
 * Products honour `statuses` with its documented default, "PENDING_REVIEW +
 * APPROVED".
 */
function fakeWish(opts: {
  products?: Row[]
  orders?: Row[]
  details?: Map<string, Record<string, unknown>>
  mode?: MaxMode
  tieOrder?: 'stable' | 'alternating'
}) {
  const calls: Call[] = []
  const creates: Array<{ paramsSerializer?: unknown }> = []
  const mode = opts.mode ?? 'inclusive'
  let listCalls = 0
  const statusFilter = (rows: Row[], params: Record<string, unknown>) => {
    const sent = params['statuses']
    if (sent !== undefined) {
      if (!Array.isArray(sent) || sent.length === 0) throw new Error('statuses must be an array')
      for (const v of sent)
        if (!ALL_STATUSES.includes(String(v))) throw new Error(`bad status ${v}`)
    }
    const allowed = (sent as string[] | undefined) ?? ['PENDING_REVIEW', 'APPROVED']
    return rows.filter((r) => r['status'] === undefined || allowed.includes(String(r['status'])))
  }
  const list = (rows: Row[], params: Record<string, unknown>, max: number) => {
    const flip = opts.tieOrder === 'alternating' && listCalls++ % 2 === 1
    const limit = params['limit'] === undefined ? 50 : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > max) throw new Error(`bad limit ${limit}`)
    if (params['sort_by'] !== undefined && params['sort_by'] !== 'updated_at.desc')
      throw new Error(`unexpected sort_by ${String(params['sort_by'])}`)
    const lo =
      params['updated_at_min'] === undefined
        ? -Infinity
        : Date.parse(String(params['updated_at_min']))
    const hi =
      params['updated_at_max'] === undefined
        ? Infinity
        : Date.parse(String(params['updated_at_max']))
    return rows
      .filter((r) => {
        const t = Date.parse(r.updated_at)
        if (t < lo) return false
        if (mode === 'inclusive') return t <= hi
        if (mode === 'exclusive') return t < hi
        return Math.floor(t / 1000) < Math.floor(hi / 1000)
      })
      .sort(
        (a, b) =>
          Date.parse(b.updated_at) - Date.parse(a.updated_at) || (a.id < b.id !== flip ? -1 : 1),
      )
      .slice(0, limit)
  }
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params
    calls.push({ path, params })
    if (path === '/api/v3/products')
      return envelope(list(statusFilter(opts.products ?? [], params ?? {}), params ?? {}, 1000))
    if (path === '/api/v3/orders') return envelope(list(opts.orders ?? [], params ?? {}, 500))
    const m = /^\/api\/v3\/products\/([^/]+)$/.exec(path)
    if (m && opts.details?.has(decodeURIComponent(m[1]!))) {
      if (params !== undefined) throw new Error('product detail takes no query params')
      return envelope(opts.details.get(decodeURIComponent(m[1]!)))
    }
    throw new Error(`unexpected path in test: ${path}`)
  })
  vi.spyOn(axios, 'create').mockImplementation(((cfg: unknown) => {
    creates.push(cfg as { paramsSerializer?: unknown })
    return { get, post: vi.fn(), defaults: {} }
  }) as never)
  return { get, calls, creates }
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

async function walk<T extends { id: string }>(
  fn: (params: QueryParams) => Promise<T[]>,
  limit: number,
  pages: number,
  extra: Partial<QueryParams> = {},
): Promise<{ ids: string[]; hasMore: (boolean | undefined)[]; rows: T[] }> {
  const ids: string[] = []
  const rows: T[] = []
  const hasMore: (boolean | undefined)[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ ...extra, page, limit } as QueryParams)
    const got = await fn(params)
    expect(got.length).toBeLessThanOrEqual(limit)
    ids.push(...got.map((r) => r.id))
    rows.push(...got)
    hasMore.push(readUpstreamPage(params)?.hasMore)
    expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
  }
  return { ids, hasMore, rows }
}

// ── Products ────────────────────────────────────────────────────────────────

/** Every fifth product is REJECTED, which the `statuses` default would hide. */
const shallowProduct = (i: number) => ({
  name: `Product ${i}`,
  state: 'ACTIVE',
  status: i % 5 === 3 ? 'REJECTED' : 'APPROVED',
  created_at: '2026-01-01T00:00:00.000Z',
})

describe('Wish listProducts (GET /api/v3/products)', () => {
  for (const mode of ['inclusive', 'exclusive'] as const) {
    it(`serves 2L+1 products once each across pages 1..3, exact hasMore (updated_at_max ${mode})`, async () => {
      for (const L of [2, 3, 10, 17]) {
        _resetCursorPager()
        const products = makeRows(2 * L + 1, 'p', shallowProduct)
        fakeWish({ products, mode })
        const adapter = new WishAdapter(CONFIG)
        const { ids, hasMore, rows } = await walk((p) => adapter.listProducts(CREDS, p), L, 3)
        expect(ids).toEqual(products.map((p) => p.id))
        expect(new Set(ids).size).toBe(ids.length)
        expect(hasMore).toEqual([true, true, false])
        for (const r of rows) ProductSchema.parse(r)
        vi.restoreAllMocks()
      }
    })
  }

  it('sends only documented params to the documented host, path and auth header', async () => {
    const products = makeRows(25, 'p', shallowProduct)
    const { calls, creates } = fakeWish({ products })
    const adapter = new WishAdapter(CONFIG)
    await walk((p) => adapter.listProducts(CREDS, p), 10, 3)
    expect(creates[0]).toMatchObject({
      baseURL: 'https://merchant.wish.com',
      headers: { Authorization: 'Bearer wish-token' },
    })
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) {
      expect(c.path).toBe('/api/v3/products')
      for (const k of Object.keys(c.params ?? {})) expect(DOCUMENTED_PRODUCT_PARAMS).toContain(k)
      expect(c.params?.['limit']).toBe(10)
      expect(c.params?.['sort_by']).toBe('updated_at.desc')
      expect(c.params?.['statuses']).toEqual(ALL_STATUSES)
    }
    // No `style`/`explode` is declared, so the array goes out as OpenAPI's
    // query default (form, exploded): statuses=A&statuses=B.
    expect(
      axios.getUri({
        url: '/api/v3/products',
        params: { statuses: ['APPROVED', 'REJECTED'] },
        paramsSerializer: creates[0]!.paramsSerializer as never,
      }),
    ).toBe('/api/v3/products?statuses=APPROVED&statuses=REJECTED')
    expect(calls[0]!.params?.['updated_at_max']).toBeUndefined()
    // Page 2 starts from the last row of page 1, one millisecond past it.
    const p2 = calls.find((c) => c.params?.['updated_at_max'] !== undefined)!
    expect(p2.params?.['updated_at_max']).toBe(
      new Date(Date.parse(products[9]!.updated_at) + 1).toISOString(),
    )
  })

  it('sends updatedAfter as updated_at_min in ISO date-time', async () => {
    const products = makeRows(12, 'p', shallowProduct)
    const cut = products[5]!.updated_at
    const { calls } = fakeWish({ products })
    const adapter = new WishAdapter(CONFIG)
    const params = withPageSink({ page: 1, limit: 50, updatedAfter: new Date(cut) } as QueryParams)
    const rows = await adapter.listProducts(CREDS, params)
    expect(calls[0]!.params?.['updated_at_min']).toBe(cut)
    expect(rows.map((r) => r.id)).toEqual(
      products.filter((p) => p.updated_at >= cut).map((p) => p.id),
    )
  })

  it('clamps a limit above the documented 1000 and still serves every row', async () => {
    const products = makeRows(1203, 'p', shallowProduct)
    const { calls } = fakeWish({ products })
    const adapter = new WishAdapter(CONFIG)
    const params = withPageSink({ page: 1, limit: 1500 } as QueryParams)
    const rows = await adapter.listProducts(CREDS, params)
    expect(calls.every((c) => c.params?.['limit'] === 1000)).toBe(true)
    expect(rows.map((r) => r.id)).toEqual(products.map((p) => p.id).slice(0, 1203))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const products = makeRows(25, 'p', shallowProduct)
    fakeWish({ products })
    const adapter = new WishAdapter(CONFIG)
    const p1 = parseListQuery({ limit: '10', page: '1' })
    const r1 = listPage(await adapter.listProducts(CREDS, p1), p1, 'wish')
    expect(r1.data.map((d) => d.id)).toEqual(products.slice(0, 10).map((p) => p.id))
    expect(r1.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: '10', page: '3' })
    const r3 = listPage(await adapter.listProducts(CREDS, p3), p3, 'wish')
    expect(r3.data.map((d) => d.id)).toEqual(products.slice(20).map((p) => p.id))
    expect(r3.meta.hasMore).toBe(false)
  })

  it('asks again at a doubled limit to get past a tie as long as the page', async () => {
    const products = Array.from({ length: 7 }, (_, i) => ({
      id: `p${i}`,
      updated_at: '2026-03-01T00:00:00.000Z',
      ...shallowProduct(i),
    }))
    const { calls } = fakeWish({ products })
    const adapter = new WishAdapter(CONFIG)
    const { ids, hasMore } = await walk((p) => adapter.listProducts(CREDS, p), 3, 3)
    expect(ids).toEqual(products.map((p) => p.id))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params?.['limit'])).toContain(6)
  })

  it('refuses to loop when more rows than the documented maximum share one millisecond', async () => {
    const products = Array.from({ length: 1001 }, (_, i) => ({
      id: `p${String(i).padStart(4, '0')}`,
      updated_at: '2026-03-01T00:00:00.000Z',
      ...shallowProduct(i),
    }))
    fakeWish({ products })
    const adapter = new WishAdapter(CONFIG)
    await expect(
      adapter.listProducts(CREDS, withPageSink({ page: 2, limit: 1000 } as QueryParams)),
    ).rejects.toThrow(/more than 1000 rows fall within one updated_at_max step/)
  })

  it('a response that is not the documented envelope is an error, not an empty list', async () => {
    const get = vi.fn(async () => ({ data: { access_token: 'x' } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
    const adapter = new WishAdapter(CONFIG)
    await expect(
      adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 10 } as QueryParams)),
    ).rejects.toThrow(/envelope/)
  })

  it('code 0 without data is an error, not an empty list', async () => {
    const get = vi.fn(async () => ({ data: { code: 0, message: '' } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
    const adapter = new WishAdapter(CONFIG)
    await expect(
      adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 10 } as QueryParams)),
    ).rejects.toThrow(/without data/)
  })

  it('serves each row once when the server returns ties in a different order on each request', async () => {
    const products = Array.from({ length: 7 }, (_, i) => ({
      id: `p${i}`,
      updated_at: '2026-03-01T00:00:00.000Z',
      ...shallowProduct(0),
    }))
    fakeWish({ products, tieOrder: 'alternating' })
    const adapter = new WishAdapter(CONFIG)
    const { ids, hasMore } = await walk((p) => adapter.listProducts(CREDS, p), 3, 3)
    expect([...ids].sort()).toEqual(products.map((p) => p.id))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a walk under updatedAfter does not lend its end to an unfiltered walk', async () => {
    const products = makeRows(12, 'p', shallowProduct)
    fakeWish({ products })
    const adapter = new WishAdapter(CONFIG)
    const since = new Date(products[4]!.updated_at)
    const filtered = products.filter((p) => p.updated_at >= products[4]!.updated_at)
    const f = await walk((p) => adapter.listProducts(CREDS, p), 2, Math.ceil(filtered.length / 2), {
      updatedAfter: since,
    })
    expect(f.ids).toEqual(filtered.map((p) => p.id))
    expect(f.hasMore.at(-1)).toBe(false)
    const params = withPageSink({ page: 4, limit: 2 } as QueryParams)
    const rows = await adapter.listProducts(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(products.slice(6, 8).map((p) => p.id))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('a non-zero code is an error', async () => {
    const get = vi.fn(async () => ({
      data: { code: 1009, message: 'The access token does not exist', data: {} },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
    const adapter = new WishAdapter(CONFIG)
    await expect(
      adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 10 } as QueryParams)),
    ).rejects.toThrow(/1009/)
  })

  it('getProduct reads GET /api/v3/products/{id}', async () => {
    const details = new Map<string, Record<string, unknown>>([
      [
        '5d30f60e0a6fc464f4f376b0',
        { id: '5d30f60e0a6fc464f4f376b0', name: 'Widget', variations: [] },
      ],
    ])
    const { calls } = fakeWish({ details })
    const adapter = new WishAdapter(CONFIG)
    const p = await adapter.getProduct(CREDS, '5d30f60e0a6fc464f4f376b0')
    expect(calls).toEqual([
      { path: '/api/v3/products/5d30f60e0a6fc464f4f376b0', params: undefined },
    ])
    expect(ProductSchema.parse(p).id).toBe('5d30f60e0a6fc464f4f376b0')
  })

  it('uses the documented sandbox host when configured', async () => {
    const { creates } = fakeWish({ products: [] })
    const adapter = new WishAdapter({ ...CONFIG, sandbox: true })
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 5 } as QueryParams))
    expect(creates[0]).toMatchObject({ baseURL: 'https://sandbox.merchant.wish.com' })
  })
})

// ── Orders ──────────────────────────────────────────────────────────────────

const order = (i: number) => ({
  state: 'APPROVED',
  product_information: {
    id: `prod${i}`,
    variation_id: `var${i}`,
    name: `Item ${i}`,
    sku: `SKU-${i}`,
  },
  order_payment: {
    general_payment_details: {
      product_price: { amount: 9.5, currency_code: 'USD' },
      product_quantity: 1,
    },
  },
})

describe('Wish listOrders (GET /api/v3/orders)', () => {
  for (const mode of ['inclusive', 'exclusive', 'second-exclusive'] as const) {
    it(`serves 2L+1 orders once each across pages 1..3, exact hasMore (updated_at_max ${mode})`, async () => {
      for (const L of [2, 3, 10, 17]) {
        _resetCursorPager()
        const orders = makeRows(2 * L + 1, 'o', order)
        fakeWish({ orders, mode })
        const adapter = new WishAdapter(CONFIG)
        const { ids, hasMore, rows } = await walk((p) => adapter.listOrders(CREDS, p), L, 3)
        expect(ids).toEqual(orders.map((o) => o.id))
        expect(hasMore).toEqual([true, true, false])
        for (const r of rows) OrderSchema.parse(r)
        vi.restoreAllMocks()
      }
    })
  }

  it('sends only documented params; limit clamped to the documented 500; updatedAfter as updated_at_min', async () => {
    const orders = makeRows(30, 'o', order)
    const { calls } = fakeWish({ orders })
    const adapter = new WishAdapter(CONFIG)
    const since = new Date(orders[20]!.updated_at)
    const params = withPageSink({ page: 1, limit: 800, updatedAfter: since } as QueryParams)
    const rows = await adapter.listOrders(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(orders.slice(0, 21).map((o) => o.id))
    for (const c of calls) {
      expect(c.path).toBe('/api/v3/orders')
      for (const k of Object.keys(c.params ?? {})) expect(DOCUMENTED_LIST_PARAMS).toContain(k)
      expect(c.params?.['limit']).toBe(500)
      expect(c.params?.['updated_at_min']).toBe(since.toISOString())
    }
  })

  it('asks for page 2 from the start of the second after the last row', async () => {
    const orders = makeRows(9, 'o', order).map((o, i) => ({
      ...o,
      updated_at: new Date(Date.parse(o.updated_at) + 250 + i).toISOString(),
    }))
    const { calls } = fakeWish({ orders })
    const adapter = new WishAdapter(CONFIG)
    await walk((p) => adapter.listOrders(CREDS, p), 4, 2)
    const lastMs = Date.parse(orders[3]!.updated_at)
    const p2 = calls.find((c) => c.params?.['updated_at_max'] !== undefined)!
    expect(p2.params?.['updated_at_max']).toBe(
      new Date((Math.floor(lastMs / 1000) + 1) * 1000).toISOString(),
    )
  })

  it('walks at one page size do not lend their positions to another page size', async () => {
    const orders = makeRows(13, 'o', order)
    fakeWish({ orders })
    const adapter = new WishAdapter(CONFIG)
    const seq: Array<[number, number, number, number]> = [
      [1, 2, 0, 2],
      [2, 3, 3, 6],
      [3, 2, 4, 6],
      [3, 3, 6, 9],
      [4, 3, 9, 12],
      [7, 2, 12, 13],
      [5, 3, 12, 13],
      [6, 2, 10, 12],
    ]
    for (const [page, limit, from, to] of seq) {
      const params = withPageSink({ page, limit } as QueryParams)
      const rows = await adapter.listOrders(CREDS, params)
      expect(
        rows.map((r) => r.id),
        `page ${page} limit ${limit}`,
      ).toEqual(orders.slice(from, to).map((o) => o.id))
      expect(readUpstreamPage(params)?.hasMore).toBe(to < orders.length)
    }
  })

  it('getOrder reads GET /api/v3/orders/{id}', async () => {
    const get = vi.fn(async () => envelope({ id: 'ord1', ...order(1) }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
    const adapter = new WishAdapter(CONFIG)
    const o = await adapter.getOrder(CREDS, 'ord1')
    expect(get).toHaveBeenCalledWith('/api/v3/orders/ord1', undefined)
    expect(OrderSchema.parse(o).id).toBe('ord1')
  })
})

// ── Variants and inventory: flattened from product details ─────────────────

/** 61 products (two upstream pages of 50), 0–3 variations each; a variation has 1–2 warehouses. */
function catalog() {
  const counts = Array.from({ length: 61 }, (_, i) => [1, 3, 0, 2][i % 4]!)
  const products = makeRows(61, 'p', shallowProduct)
  const details = new Map<string, Record<string, unknown>>()
  const variationIds: string[] = []
  const levelIds: string[] = []
  products.forEach((p, i) => {
    const variations = Array.from({ length: counts[i]! }, (_, v) => {
      const id = `${p.id}v${v}`
      variationIds.push(id)
      const inventories = [{ warehouse_id: 'wh1', inventory: v + 1 }]
      if (v % 2 === 1) inventories.push({ warehouse_id: 'wh2', inventory: 0 })
      for (const inv of inventories) levelIds.push(`${id}:${inv.warehouse_id}`)
      return {
        id,
        product_id: p.id,
        sku: `${id}-sku`,
        price: { amount: 12.25, currency_code: 'EUR' },
        options: [{ name: 'SIZE', value: 'M' }],
        inventories,
      }
    })
    details.set(p.id, { ...p, variations })
  })
  return { products, details, variationIds, levelIds }
}

describe('Wish listVariants (flattened from GET /api/v3/products/{id})', () => {
  it('serves every variation once, pages 1..3 of 2L+1, exact hasMore, over uneven upstream pages', async () => {
    const { products, details, variationIds } = catalog()
    const rows = variationIds.length % 2 === 1 ? variationIds : variationIds.slice(0, -1)
    const L = (rows.length - 1) / 2
    // Drop the last variation from the details when the total is even, so the stream is 2L+1.
    if (rows.length !== variationIds.length) {
      const lastId = variationIds[variationIds.length - 1]!
      for (const d of details.values()) {
        const v = d['variations'] as Array<{ id: string }>
        d['variations'] = v.filter((x) => x.id !== lastId)
      }
    }
    const { calls } = fakeWish({ products, details })
    const adapter = new WishAdapter(CONFIG)
    const got = await walk((p) => adapter.listVariants(CREDS, p), L, 3)
    expect(got.ids).toEqual(rows)
    expect(got.hasMore).toEqual([true, true, false])
    for (const r of got.rows) ProductVariantSchema.parse(r)
    const lists = calls.filter((c) => c.path === '/api/v3/products')
    expect(lists.length).toBe(2)
    for (const c of lists) {
      for (const k of Object.keys(c.params ?? {})) expect(DOCUMENTED_PRODUCT_PARAMS).toContain(k)
      expect(c.params?.['limit']).toBe(50)
    }
  })

  it('getVariant refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    const { get } = fakeWish({})
    const adapter = new WishAdapter(CONFIG)
    await expect(adapter.getVariant(CREDS, 'v1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('Wish listInventoryLevels (flattened from GET /api/v3/products/{id})', () => {
  it('serves every variation × warehouse once, pages 1..3 of 2L+1, exact hasMore', async () => {
    const { products, details, levelIds } = catalog()
    let ids = levelIds
    if (ids.length % 2 === 0) {
      // Drop the second warehouse of the last variation that has one.
      const drop = [...ids].reverse().find((id) => id.endsWith(':wh2'))!
      ids = ids.filter((id) => id !== drop)
      const variationId = drop.split(':')[0]!
      for (const d of details.values()) {
        for (const v of d['variations'] as Array<{
          id: string
          inventories: Array<{ warehouse_id: string }>
        }>) {
          if (v.id === variationId)
            v.inventories = v.inventories.filter((x) => x.warehouse_id !== 'wh2')
        }
      }
    }
    const L = (ids.length - 1) / 2
    fakeWish({ products, details })
    const adapter = new WishAdapter(CONFIG)
    const got = await walk((p) => adapter.listInventoryLevels(CREDS, p), L, 3)
    expect(got.ids).toEqual(ids)
    expect(got.hasMore).toEqual([true, true, false])
    for (const r of got.rows) InventoryLevelSchema.parse(r)
  })

  it('getInventoryLevel refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    const { get } = fakeWish({})
    const adapter = new WishAdapter(CONFIG)
    await expect(adapter.getInventoryLevel(CREDS, 'v1:wh1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
  })
})
