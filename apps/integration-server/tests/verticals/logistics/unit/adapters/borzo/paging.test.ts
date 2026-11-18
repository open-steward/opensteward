/**
 * Borzo `listOrders` (GET /orders) pages by offset + count:
 * https://borzodelivery.com/in/business-api/doc  ("List of orders")
 *   "offset integer Number of orders to skip for paginaton. Default value: 0 ."
 *   "count integer Maximum number of orders to be returned. Cannot be higher
 *    than 50. Default value: 10 ."
 *   "orders_count integer Total number of found orders for pagination."
 *
 * Before this, the adapter sent a bare GET: every caller page got the first
 * 10 orders, so page 2 repeated page 1 and nothing past order 10 was reachable.
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
import { BorzoAdapter } from '../../../../../../src/verticals/logistics/adapters/borzo/index'

const CREDS = { accessToken: 'borzo_test' }
const CALL_BUDGET = 20
const DOC_MAX = 50
const DOC_DEFAULT = 10

function orders(n: number) {
  // The list is documented as sorted by order_id, descending.
  return Array.from({ length: n }, (_, i) => ({
    order_id: n - i,
    order_name: `ORD-${n - i}`,
    status: 'new',
    points: [],
  }))
}

/**
 * A fake Borzo that honours ONLY the documented paging parameters: `offset`
 * (default 0) and `count` (default 10, refused above 50), answering with
 * `orders` and the `orders_count` total. Any other parameter is refused.
 */
function fakeBorzo(total: number, opts: { omitTotal?: boolean } = {}) {
  const all = orders(total)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    if (path !== '/orders') throw new Error(`unexpected path ${path}`)
    const params = cfg?.params ?? {}
    for (const k of Object.keys(params)) {
      if (k !== 'offset' && k !== 'count') throw new Error(`undocumented param ${k}`)
    }
    const offset = Number(params.offset ?? 0)
    const count = Number(params.count ?? DOC_DEFAULT)
    if (count > DOC_MAX) throw new Error(`count ${count} is above the documented maximum`)
    return {
      data: {
        is_successful: true,
        orders: all.slice(offset, offset + count),
        ...(opts.omitTotal ? {} : { orders_count: all.length }),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

/** Ids in the order Borzo serves them: `total` down to 1. */
function ids(total: number, start: number, count: number): string[] {
  return orders(total)
    .slice(start, start + count)
    .map((o) => String(o.order_id))
}

const list = (p: QueryParams) => new BorzoAdapter().listOrders(CREDS, p)

afterEach(() => vi.restoreAllMocks())

describe('borzo listOrders paging (offset + count)', () => {
  it('with 2L+1 rows, pages 1..3 at limit L return every order once, in order, hasMore exact', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeBorzo(N)
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'borzo')
      seen.push(...env.data.map((o) => o.id!))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)).toEqual(expect.objectContaining({ totalCount: N }))
    }
    expect(seen).toEqual(ids(N, 0, N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented offset and count', async () => {
    const { get } = fakeBorzo(20)
    await list(withPageSink({ page: 2, limit: 7 }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![1]).toEqual({ params: { offset: 7, count: 7 } })
  })

  it('a limit above the documented maximum of 50 is clamped, and the stride follows the clamp', async () => {
    const { get } = fakeBorzo(120)
    const p1 = withPageSink({ page: 1, limit: 500 })
    const env1 = listPage(await list(p1), p1, 'borzo')
    expect(env1.data).toHaveLength(DOC_MAX)
    expect(env1.data.map((o) => o.id)).toEqual(ids(120, 0, DOC_MAX))
    expect(env1.meta.hasMore).toBe(true)
    expect(readUpstreamPage(p1)).toEqual(expect.objectContaining({ pageSize: DOC_MAX }))

    const p2 = withPageSink({ page: 2, limit: 500 })
    const env2 = listPage(await list(p2), p2, 'borzo')
    expect(env2.data.map((o) => o.id)).toEqual(ids(120, DOC_MAX, DOC_MAX))
    expect(get.mock.calls.map((c) => c[1])).toEqual([
      { params: { offset: 0, count: DOC_MAX } },
      { params: { offset: DOC_MAX, count: DOC_MAX } },
    ])
  })

  it('declares the documented maximum so the router asks for no more than Borzo serves', () => {
    expect(new BorzoAdapter().capabilities.maxPageSize).toBe(DOC_MAX)
  })

  it('a page past the end is empty and reports no more', async () => {
    fakeBorzo(5)
    const params = withPageSink({ page: 3, limit: 5 })
    const env = listPage(await list(params), params, 'borzo')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakeBorzo(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'borzo')
    expect(env.data.map((o) => o.id)).toEqual(ids(7, 3, 3))
    expect(env.meta.hasMore).toBe(true)
  })

  it('with exactly 2L rows, the full last page reports no more from orders_count', async () => {
    const L = 4
    const N = 2 * L
    const { get } = fakeBorzo(N)
    const hasMore: boolean[] = []
    const reported: Array<boolean | undefined> = []
    for (let k = 1; k <= 2; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'borzo')
      expect(env.data.map((o) => o.id)).toEqual(ids(N, (k - 1) * L, L))
      hasMore.push(env.meta.hasMore as boolean)
      // The sync worker reads the adapter's own reported hasMore, not the envelope.
      reported.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
    expect(reported).toEqual([true, false])
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('without orders_count, a full page reads as more and a short page as the end', async () => {
    fakeBorzo(7, { omitTotal: true })
    const p1 = withPageSink({ page: 1, limit: 4 })
    const env1 = listPage(await list(p1), p1, 'borzo')
    expect(env1.data.map((o) => o.id)).toEqual(ids(7, 0, 4))
    expect(env1.meta.hasMore).toBe(true)
    const p2 = withPageSink({ page: 2, limit: 4 })
    const env2 = listPage(await list(p2), p2, 'borzo')
    expect(env2.data.map((o) => o.id)).toEqual(ids(7, 4, 3))
    expect(env2.meta.hasMore).toBe(false)
  })

  it('with no limit, it asks for the adapter default of 20 (within the documented 50)', async () => {
    const { get } = fakeBorzo(30)
    const params = withPageSink({ page: 1 })
    const env = listPage(await list(params), params, 'borzo')
    expect(get.mock.calls[0]![1]).toEqual({ params: { offset: 0, count: 20 } })
    expect(env.data).toHaveLength(20)
  })
})
