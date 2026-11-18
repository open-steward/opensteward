/**
 * Snipcart list paging.
 *
 * Products, customers and orders page by offset
 * (https://docs.snipcart.com/v3/api-reference/products):
 *   "offset ... Number of items to skip. ... limit ... Maximum number of items
 *   to return."
 * and answer with `{ totalItems, offset, limit, items }`. No maximum `limit`
 * is documented (only a default of 20), so the adapter declares none and
 * forwards the caller's exact limit.
 *
 * Discounts do not page at all
 * (https://docs.snipcart.com/v3/api-reference/discounts):
 *   "Returns every discount on your account (no pagination — the full list is
 *   returned as a JSON array)."
 *
 * Before this, every list sent `offset = params.offset ?? 0` and never read
 * `page`, so page 2 re-sent offset 0; the client also clamped `limit` to an
 * undocumented 200; and discounts were read as an `{ items }` envelope from a
 * bare array, so every account listed none.
 *
 * The fake below honours only the documented parameters: `limit` and `offset`
 * on the paged collections (plus `from`, which the adapter sends for
 * `updatedAfter`), and none on discounts.
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
import { SnipcartAdapter } from '../../../../../../src/verticals/ecommerce/adapters/snipcart/index'

const PAGED = new Set(['limit', 'offset', 'from'])
const creds = { accessToken: 'snip_test' }

type Row = Record<string, unknown>

function fakeSnipcart(collections: Record<string, Row[]>) {
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    const all = collections[path]
    if (!all) throw new Error(`unexpected path ${path}`)
    if (path === 'discounts') {
      if (Object.keys(params).length > 0)
        throw new Error(`discounts takes no query parameters: ${Object.keys(params).join(', ')}`)
      return { data: all }
    }
    const extra = Object.keys(params).filter((k) => !PAGED.has(k))
    if (extra.length > 0) throw new Error(`undocumented query parameter(s): ${extra.join(', ')}`)
    const limit = Number(params.limit ?? 20)
    const offset = Number(params.offset ?? 0)
    return {
      data: {
        totalItems: all.length,
        offset,
        limit,
        items: all.slice(offset, offset + limit),
      },
    }
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

const adapter = () => new SnipcartAdapter()

type Method = 'listProducts' | 'listCustomers' | 'listOrders' | 'listDiscounts'

function setup(method: Method, n: number) {
  const ids = Array.from({ length: n }, (_, i) => `id-${1000 + i}`)
  const rows: Row[] = ids.map((id) => {
    switch (method) {
      case 'listProducts':
        return { id, name: `P ${id}` }
      case 'listCustomers':
        return { id, email: `${id}@example.com` }
      case 'listOrders':
        return { token: id }
      case 'listDiscounts':
        return { id, name: `D ${id}`, trigger: 'Code', code: id, type: 'Rate', rate: 5 }
    }
  })
  const path = {
    listProducts: 'products',
    listCustomers: 'customers',
    listOrders: 'orders',
    listDiscounts: 'discounts',
  }[method]
  return { ...fakeSnipcart({ [path]: rows }), ids }
}

const METHODS: Method[] = ['listProducts', 'listCustomers', 'listOrders', 'listDiscounts']
const OFFSET_METHODS = ['listProducts', 'listCustomers', 'listOrders'] as const

describe('snipcart list paging', () => {
  it('declares no maximum page size (none is documented)', () => {
    expect(
      (adapter() as { capabilities?: { maxPageSize?: number } }).capabilities?.maxPageSize,
    ).toBeUndefined()
  })

  describe.each(METHODS)('%s', (method) => {
    it.each([1, 3, 7])(
      'N = 2L+1 at limit %i: pages 1..3 serve every id once, hasMore exact',
      async (L) => {
        const { ids } = setup(method, 2 * L + 1)
        const seen: string[] = []
        const hasMore: Array<boolean | undefined> = []
        for (let k = 1; k <= 3; k++) {
          const params = withPageSink({ page: k, limit: L })
          const rows = await adapter()[method](creds, params)
          expect(rows.length).toBe(k < 3 ? L : 1)
          seen.push(...rows.map((r) => r.id))
          hasMore.push(readUpstreamPage(params)?.hasMore)
        }
        expect(seen).toEqual(ids)
        expect(hasMore).toEqual([true, true, false])
      },
    )

    it('a limit of 500 (above the old undocumented 200 clamp) serves every row once', async () => {
      const { ids, get } = setup(method, 2 * 500 + 1)
      const seen: string[] = []
      let more = true
      let pages = 0
      for (let k = 1; more && k <= 10; k++) {
        const params = withPageSink({ page: k, limit: 500 })
        const rows = await adapter()[method](creds, params)
        pages++
        seen.push(...rows.map((r) => r.id))
        more = readUpstreamPage(params)?.hasMore === true
      }
      expect(more).toBe(false)
      expect(pages).toBe(3)
      expect(seen).toEqual(ids)
      if (method !== 'listDiscounts') {
        expect(get.mock.calls.every(([, cfg]) => cfg?.params?.limit === 500)).toBe(true)
      }
    })

    it('through the API path, parseListQuery then listPage gives the right meta.hasMore', async () => {
      setup(method, 5)
      const p1: QueryParams = withPageSink(parseListQuery({ page: '1', limit: '2' }))
      const env1 = listPage<{ id: string }>(await adapter()[method](creds, p1), p1, 'snipcart')
      expect(env1.data).toHaveLength(2)
      expect(env1.meta.hasMore).toBe(true)
      const p3: QueryParams = withPageSink(parseListQuery({ page: '3', limit: '2' }))
      const env3 = listPage<{ id: string }>(await adapter()[method](creds, p3), p3, 'snipcart')
      expect(env3.data).toHaveLength(1)
      expect(env3.meta.hasMore).toBe(false)
    })
  })

  describe.each(OFFSET_METHODS)('%s offset request', (method) => {
    it('the page-2 request carries the documented offset and the exact limit', async () => {
      const L = 3
      const { get } = setup(method, 2 * L + 1)
      await adapter()[method](creds, withPageSink({ page: 2, limit: L }))
      expect(get).toHaveBeenCalledTimes(1)
      expect(get.mock.calls[0]![1]?.params).toMatchObject({ offset: L, limit: L })
    })

    it('reports Snipcart totalItems as totalCount', async () => {
      setup(method, 7)
      const params = withPageSink({ page: 1, limit: 3 })
      await adapter()[method](creds, params)
      expect(readUpstreamPage(params)?.totalCount).toBe(7)
    })
  })

  it('listDiscounts reads the bare array with no paging parameters and pages it locally', async () => {
    const { get, ids } = setup('listDiscounts', 5)
    const params = withPageSink({ page: 2, limit: 2 })
    const rows = await adapter().listDiscounts(creds, params)
    expect(rows.map((r) => r.id)).toEqual(ids.slice(2, 4))
    expect(get.mock.calls[0]![1]?.params).toBeUndefined()
    const meta = readUpstreamPage(params)
    expect(meta?.pagedLocally).toBe(true)
    expect(meta?.totalCount).toBe(5)
  })
})

/** A stub that answers every GET with `respond(path, params)`. */
function stubSnipcart(respond: (path: string, params: Record<string, unknown>) => unknown) {
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => ({
    data: respond(path, cfg?.params ?? {}),
  }))
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get }
}

const rowsOf = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `id-${1000 + from + i}`, name: 'x' }))

describe('snipcart offset paging edge cases', () => {
  it('without a caller limit, sends the documented default of 20 and derives the offset from it', async () => {
    const { get } = stubSnipcart(() => ({ totalItems: 0, offset: 0, limit: 20, items: [] }))
    await adapter().listProducts(creds, withPageSink({ page: 2 }))
    expect(get.mock.calls[0]![1]?.params).toEqual({ limit: 20, offset: 20 })
  })

  it('updatedAfter is still sent as `from`, alongside the page-derived offset', async () => {
    const { get } = stubSnipcart(() => ({ totalItems: 0, offset: 0, limit: 5, items: [] }))
    const updatedAfter = new Date('2026-01-02T03:04:05.000Z')
    await adapter().listOrders(creds, withPageSink({ page: 3, limit: 5, updatedAfter }))
    expect(get.mock.calls[0]![1]?.params).toEqual({
      limit: 5,
      offset: 10,
      from: '2026-01-02T03:04:05.000Z',
    })
  })

  it('a short page still short of totalItems reports hasMore from the rows served, not the limit', async () => {
    // offset 3, limit 3, total 5, upstream served 1 row: 3 + 1 < 5.
    stubSnipcart(() => ({ totalItems: 5, offset: 3, limit: 3, items: rowsOf(1, 3) }))
    const params = withPageSink({ page: 2, limit: 3 })
    await adapter().listCustomers(creds, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(readUpstreamPage(params)?.totalCount).toBe(5)
  })

  it('a missing totalItems is not read as 0: a full page reports more, and no total', async () => {
    stubSnipcart(() => ({ offset: 0, limit: 3, items: rowsOf(3) }))
    const params = withPageSink({ page: 1, limit: 3 })
    const rows = await adapter().listProducts(creds, params)
    const up = readUpstreamPage(params)
    expect(up?.totalCount).toBeUndefined()
    expect(up?.hasMore).toBe(true)
    const env = listPage(rows, params, 'snipcart')
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBeNull()
  })

  it('a missing totalItems with a short page reports the end', async () => {
    stubSnipcart(() => ({ offset: 0, limit: 3, items: rowsOf(2) }))
    const params = withPageSink({ page: 1, limit: 3 })
    await adapter().listProducts(creds, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('an empty page ends the walk even when totalItems still claims more rows', async () => {
    stubSnipcart(() => ({ totalItems: 50, offset: 20, limit: 10, items: [] }))
    const params = withPageSink({ page: 3, limit: 10 })
    const rows = await adapter().listOrders(creds, params)
    expect(rows).toEqual([])
    const env = listPage(rows, params, 'snipcart')
    expect(env.meta.hasMore).toBe(false)
  })
})

describe('snipcart listRefunds', () => {
  // "Returns every refund issued against the order identified by token." —
  // https://docs.snipcart.com/v3/api-reference/refunds (bare array, no query
  // parameters).
  function refundsFake(n: number) {
    const ids = Array.from({ length: n }, (_, i) => `rf-${100 + i}`)
    const { get } = stubSnipcart((path, params) => {
      if (path !== 'orders/ord-1/refunds') throw new Error(`unexpected path ${path}`)
      if (Object.keys(params).length > 0)
        throw new Error(`refunds takes no query parameters: ${Object.keys(params).join(', ')}`)
      return ids.map((id) => ({ id, amount: 1.5 }))
    })
    return { get, ids }
  }

  it.each([1, 3, 7])(
    'N = 2L+1 at limit %i: pages 1..3 serve every refund once, hasMore exact',
    async (L) => {
      const { ids, get } = refundsFake(2 * L + 1)
      const seen: string[] = []
      const hasMore: Array<boolean | undefined> = []
      for (let k = 1; k <= 3; k++) {
        const params = withPageSink({ page: k, limit: L, order_id: 'ord-1' } as QueryParams)
        const rows = await adapter().listRefunds(creds, params)
        expect(rows.length).toBe(k < 3 ? L : 1)
        expect(rows.every((r) => r.orderId === 'ord-1')).toBe(true)
        seen.push(...rows.map((r) => r.id))
        const up = readUpstreamPage(params)
        hasMore.push(up?.hasMore)
        expect(up?.pagedLocally).toBe(true)
        expect(up?.totalCount).toBe(2 * L + 1)
      }
      expect(seen).toEqual(ids)
      expect(hasMore).toEqual([true, true, false])
      expect(get.mock.calls.every(([, cfg]) => cfg?.params === undefined)).toBe(true)
    },
  )

  it('still requires an order id', async () => {
    refundsFake(1)
    await expect(adapter().listRefunds(creds, withPageSink({ page: 1, limit: 2 }))).rejects.toThrow(
      /order_id/,
    )
  })
})
