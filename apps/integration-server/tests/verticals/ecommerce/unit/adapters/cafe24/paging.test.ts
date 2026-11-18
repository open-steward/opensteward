/**
 * Cafe24 list paging: 1-based `page` + caller's `limit` → Cafe24's `offset` +
 * `limit` query parameters, clamped to the 100-row request limit.
 *
 * From each endpoint's first-party parameter schema on apidocs.cafe24.com
 * (GET /api/v2/admin/products, /categories, /orders, /coupons):
 *
 *   offset: "Start location of list\n\nSet the start location of search result."
 *           {type:"integer",minimum:0,maximum:5e3,default:0}   (products; categories and
 *           coupons 8e3, orders 15e3)
 *   limit:  "Limit\n\nSet the maximum number of search result.\n Example) input '10' shows
 *           only '10' result" {type:"integer",minimum:1,maximum:100,default:10} (products and
 *           categories; orders maximum 1e3, coupons maximum 500 default 100)
 *
 * and https://apidocs.cafe24.com/en/docs/guide/how-to-use-get-api:
 *   "Use limit and offset parameters to retrieve data in pages." and "offset = (P - 1) * L".
 *
 * Every rendered endpoint page says "Request Limit 100items", which is the
 * adapter's clamp. The list envelope is only `{ <resource>: [...] }`, with no
 * total or next link, so a short page ends the list.
 *
 * Not covered here: listCustomers, listLocations and listRefunds, rebuilt onto
 * /customersprivacy, /shippingorigins and /refunds (see rebuilt-reads.test.ts),
 * and the parent-scoped lists, which take a required parent id.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  effectivePageSize,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'
import { Cafe24Adapter } from '../../../../../../src/verticals/ecommerce/adapters/cafe24/index'

const CREDS = { accessToken: 'cafe24_test' }
/** "Request Limit 100items" on every rendered endpoint page. */
const MAX = 100

interface Endpoint {
  /** Path relative to the admin base URL. */
  path: string
  /** Envelope key of the list. */
  key: string
  /** Row id field. */
  idField: string
  /** Documented schema maxima and defaults. */
  limitMax: number
  limitDefault: number
  offsetMax: number
}

/**
 * A fake Cafe24 that honours ONLY the documented `limit` and `offset` query
 * parameters (and ignores every other one). Out-of-range values are refused
 * with a 422 rather than silently corrected.
 */
function fakeCafe24(ep: Endpoint, total: number) {
  const sent: { limit: number; offset: number }[] = []
  /** Every query sent, verbatim, so filters can be checked alongside paging. */
  const queries: Record<string, unknown>[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    if (path !== ep.path) throw Object.assign(new Error(`unexpected ${path}`), { status: 404 })
    const p = config?.params ?? {}
    queries.push({ ...p })
    const limit = p['limit'] === undefined ? ep.limitDefault : p['limit']
    const offset = p['offset'] === undefined ? 0 : p['offset']
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > ep.limitMax) {
      throw Object.assign(new Error(`limit out of range: ${String(limit)}`), { status: 422 })
    }
    if (
      typeof offset !== 'number' ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > ep.offsetMax
    ) {
      throw Object.assign(new Error(`offset out of range: ${String(offset)}`), { status: 422 })
    }
    sent.push({ limit, offset })
    const rows = Array.from({ length: total }, (_, i) => ({
      [ep.idField]: i + 1,
      product_name: `p${i + 1}`,
      category_name: `c${i + 1}`,
      coupon_name: `d${i + 1}`,
    }))
    return { data: { [ep.key]: rows.slice(offset, offset + limit) } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as unknown as ReturnType<typeof axios.create>)
  return { sent, queries }
}

type Row = { id: string }

const METHODS = [
  {
    name: 'listProducts',
    ep: {
      path: 'products',
      key: 'products',
      idField: 'product_no',
      limitMax: 100,
      limitDefault: 10,
      offsetMax: 5000,
    },
    call: (a: Cafe24Adapter, p: QueryParams): Promise<Row[]> => a.listProducts(CREDS, p),
  },
  {
    name: 'listCollections',
    ep: {
      path: 'categories',
      key: 'categories',
      idField: 'category_no',
      limitMax: 100,
      limitDefault: 10,
      offsetMax: 8000,
    },
    call: (a: Cafe24Adapter, p: QueryParams): Promise<Row[]> => a.listCollections(CREDS, p),
  },
  {
    name: 'listOrders',
    ep: {
      path: 'orders',
      key: 'orders',
      idField: 'order_id',
      limitMax: 1000,
      limitDefault: 10,
      offsetMax: 15000,
    },
    call: (a: Cafe24Adapter, p: QueryParams): Promise<Row[]> => a.listOrders(CREDS, p),
  },
  {
    name: 'listDiscounts',
    ep: {
      path: 'coupons',
      key: 'coupons',
      idField: 'coupon_no',
      limitMax: 500,
      limitDefault: 100,
      offsetMax: 8000,
    },
    call: (a: Cafe24Adapter, p: QueryParams): Promise<Row[]> => a.listDiscounts(CREDS, p),
  },
] as const

const adapter = () =>
  new Cafe24Adapter({
    clientId: 'id',
    clientSecret: 'secret',
    redirectUri: 'https://x.test/cb',
    mallId: 'mall',
  })

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

afterEach(() => vi.restoreAllMocks())

describe.each(METHODS)('cafe24 $name paging', ({ name, ep, call }) => {
  it.each([10, 7])(
    'N = 2L + 1 rows driven like the sync (limit %i) serve every id once, in order, with exact hasMore',
    async (limit) => {
      const n = 2 * limit + 1
      fakeCafe24(ep, n)
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const k of [1, 2, 3]) {
        const params = withPageSink({ page: k, limit })
        seen.push(...(await call(adapter(), params)).map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(ids(1, n))
      expect(hasMore).toEqual([true, true, false])
    },
  )

  it('page 2 sends offset = (P - 1) * L with the caller limit', async () => {
    const { sent } = fakeCafe24(ep, 50)
    const rows = await call(adapter(), withPageSink({ page: 2, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(ids(11, 10))
    expect(sent).toEqual([{ limit: 10, offset: 10 }])
  })

  it('a limit above the 100-row request limit is clamped and still serves every row', async () => {
    const limit = 250
    const n = 2 * MAX + 1
    const { sent } = fakeCafe24(ep, n)
    const seen: string[] = []
    for (let k = 1; k <= 10; k++) {
      const params = withPageSink({ page: k, limit })
      const page = (await call(adapter(), params)).map((r) => r.id)
      expect(page.length).toBeLessThanOrEqual(effectivePageSize(params, limit))
      expect(effectivePageSize(params, limit)).toBe(MAX)
      seen.push(...page)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(ids(1, n))
    expect(sent).toEqual([
      { limit: MAX, offset: 0 },
      { limit: MAX, offset: MAX },
      { limit: MAX, offset: 2 * MAX },
    ])
  })

  it('the API path (parseListQuery then listPage) reports meta.hasMore', async () => {
    fakeCafe24(ep, 25)
    const a = adapter()
    const p2 = parseListQuery({ page: '2', limit: '10' }, a as EcommerceAdapter)
    const env2 = listPage(await call(a, p2), p2, 'cafe24')
    expect(env2.data.map((r) => r.id)).toEqual(ids(11, 10))
    expect(env2.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ page: '3', limit: '10' }, a as EcommerceAdapter)
    const env3 = listPage(await call(a, p3), p3, 'cafe24')
    expect(env3.data.map((r) => r.id)).toEqual(ids(21, 5))
    expect(env3.meta.hasMore).toBe(false)
  })

  it('a paged request still carries the updatedAfter filter (and products still embed variants)', async () => {
    const { queries } = fakeCafe24(ep, 30)
    const updatedAfter = new Date('2026-01-02T03:04:05.000Z')
    const rows = await call(adapter(), withPageSink({ page: 2, limit: 10, updatedAfter }))
    expect(rows.map((r) => r.id)).toEqual(ids(11, 10))
    expect(queries).toHaveLength(1)
    expect(queries[0]).toMatchObject({
      limit: 10,
      offset: 10,
      updated_start_date: '2026-01-02T03:04:05.000Z',
    })
    if (name === 'listProducts') expect(queries[0]).toMatchObject({ embed: 'variants,options' })
  })

  it.each([
    ['missing', undefined, 50],
    ['zero', 0, 50],
    ['negative', -5, 50],
    ['non-finite', Number.NaN, 50],
    ['fractional', 12.7, 12],
  ] as const)(
    'a %s limit falls back to a whole, in-range page size',
    async (_label, limit, expected) => {
      const { sent } = fakeCafe24(ep, 200)
      const params = withPageSink({ page: 2, ...(limit === undefined ? {} : { limit }) })
      const rows = await call(adapter(), params)
      expect(sent).toEqual([{ limit: expected, offset: expected }])
      expect(rows.map((r) => r.id)).toEqual(ids(expected + 1, expected))
      expect(readUpstreamPage(params)?.pageSize).toBe(expected)
    },
  )
})
