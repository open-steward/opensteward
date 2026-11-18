/**
 * TOP pages `taobao.trades.sold.get` and `taobao.refunds.receive.get` by
 * `page_no` (1-based, default 1) and `page_size` (default 40, max 100), and
 * answers with `total_results` — or `has_next` instead when the request sets
 * `use_has_next=true` (docIds 46 and 52 on open.taobao.com). The adapter read
 * the page from `params['pageNo']`, which the router never sets, so `page_no`
 * was always 1 and page 2 repeated page 1.
 *
 * - listOrders, listTransactions, listRefunds: one TOP page is one caller page
 *   (orders and refunds 1:1, transactions projected 1:1 from trades).
 * - listCustomers: buyers de-duplicated out of trades, so one TOP page of
 *   trades is not one caller page; served through pageByRows.
 *
 * The fake below honours ONLY the documented parameters: `page_no`,
 * `page_size` (1..100, default 40) and `use_has_next`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { TmallAdapter } from '../../../../../../src/verticals/ecommerce/adapters/tmall/index'

const CREDS = {
  accessToken: 'session-tok',
  refreshToken: 'refresh-tok',
  extra: { appKey: 'key123', appSecret: 'secret456', userId: 'seller1' },
}

interface Shop {
  trades?: number
  /** buyer nick of the i-th trade (1-based); default `b<i>` */
  buyerOf?: (i: number) => string
  refunds?: number
  /**
   * Answer with neither `total_results` nor `has_next`. TOP documents one of
   * the two on every response; this exercises the adapter's fallback for a
   * response that breaks that.
   */
  omitTotal?: boolean
}

function fakeTop(shop: Shop): URLSearchParams[] {
  const calls: URLSearchParams[] = []
  function window(
    total: number,
    p: URLSearchParams,
  ): { start: number; end: number; pageNo: number; size: number } {
    const size = p.get('page_size') === null ? 40 : Number(p.get('page_size'))
    const pageNo = p.get('page_no') === null ? 1 : Number(p.get('page_no'))
    if (!Number.isInteger(size) || size < 1 || size > 100) {
      return { start: 0, end: -1, pageNo, size }
    }
    const start = (pageNo - 1) * size
    return { start, end: Math.min(start + size, total), pageNo, size }
  }
  function paging(total: number, p: URLSearchParams, end: number): Record<string, unknown> {
    if (shop.omitTotal) return {}
    return p.get('use_has_next') === 'true' ? { has_next: end < total } : { total_results: total }
  }
  const post = vi.fn(async (_url: string, body: string) => {
    const p = new URLSearchParams(body)
    calls.push(p)
    const method = p.get('method')
    if (method === 'taobao.trades.sold.get') {
      const total = shop.trades ?? 0
      const w = window(total, p)
      if (w.end < 0)
        return { data: { error_response: { code: 41, msg: 'Invalid arguments:page_size' } } }
      const trade = []
      for (let i = w.start + 1; i <= w.end; i++) {
        trade.push({
          tid: i,
          status: 'TRADE_FINISHED',
          buyer_nick: shop.buyerOf?.(i) ?? `b${i}`,
          payment: '10.00',
        })
      }
      return {
        data: { trades_sold_get_response: { trades: { trade }, ...paging(total, p, w.end) } },
      }
    }
    if (method === 'taobao.refunds.receive.get') {
      const total = shop.refunds ?? 0
      const w = window(total, p)
      if (w.end < 0)
        return { data: { error_response: { code: 41, msg: 'Invalid arguments:page_size' } } }
      const refund = []
      for (let i = w.start + 1; i <= w.end; i++) {
        refund.push({ refund_id: i, tid: i, status: 'SUCCESS', refund_fee: '1.00' })
      }
      return {
        data: { refunds_receive_get_response: { refunds: { refund }, ...paging(total, p, w.end) } },
      }
    }
    throw new Error(`unexpected TOP method ${method}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
  return calls
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

type ListFn = (a: TmallAdapter, p: QueryParams) => Promise<{ id: string }[]>

async function walk(
  list: ListFn,
  limit: number,
  pages: number,
): Promise<{
  ids: string[]
  hasMore: (boolean | undefined)[]
  sizes: number[]
  totals: (number | undefined)[]
}> {
  const adapter = new TmallAdapter()
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const sizes: number[] = []
  const totals: (number | undefined)[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    const rows = await list(adapter, params)
    ids.push(...rows.map((r) => r.id))
    sizes.push(rows.length)
    hasMore.push(readUpstreamPage(params)?.hasMore)
    totals.push(readUpstreamPage(params)?.totalCount)
  }
  return { ids, hasMore, sizes, totals }
}

const seq = (n: number, prefix = ''): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

const listOrders: ListFn = (a, p) => a.listOrders(CREDS, p)
const listTransactions: ListFn = (a, p) => a.listTransactions(CREDS, p)
const listRefunds: ListFn = (a, p) => a.listRefunds(CREDS, p)
const listCustomers: ListFn = (a, p) => a.listCustomers(CREDS, p)

describe.each([
  ['listOrders', listOrders, 'taobao.trades.sold.get', 'trades', ''],
  ['listTransactions', listTransactions, 'taobao.trades.sold.get', 'trades', 'txn_'],
  ['listRefunds', listRefunds, 'taobao.refunds.receive.get', 'refunds', ''],
] as const)('Tmall %s pages by page_no', (_name, list, method, field, prefix) => {
  it('serves 2L+1 rows over three pages, each once, in order, hasMore exact', async () => {
    const calls = fakeTop({ [field]: 7 })
    const r = await walk(list, 3, 3)
    expect(r.ids).toEqual(seq(7, prefix))
    expect(r.sizes).toEqual([3, 3, 1])
    expect(r.hasMore).toEqual([true, true, false])
    expect(r.totals).toEqual([7, 7, 7])
    const listCalls = calls.filter((c) => c.get('method') === method)
    expect(listCalls.map((c) => [c.get('page_size'), c.get('page_no')])).toEqual([
      ['3', '1'],
      ['3', '2'],
      ['3', '3'],
    ])
  })

  it('reports hasMore=false on the last page when total_results is an exact multiple', async () => {
    fakeTop({ [field]: 6 })
    const r = await walk(list, 3, 2)
    expect(r.ids).toEqual(seq(6, prefix))
    expect(r.hasMore).toEqual([true, false])
  })

  it('sends page_no=2 for the second page', async () => {
    const calls = fakeTop({ [field]: 7 })
    await list(new TmallAdapter(), withPageSink({ page: 2, limit: 3 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.get('page_no')).toBe('2')
    expect(calls[0]!.get('page_size')).toBe('3')
  })

  it('clamps a limit above 100 to page_size=100, reports it, and still serves every row', async () => {
    const calls = fakeTop({ [field]: 250 })
    const adapter = new TmallAdapter()
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 150 })
      const rows = await list(adapter, params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pageSize).toBe(100)
    }
    expect(ids).toEqual(seq(250, prefix))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.every((c) => Number(c.get('page_size')) <= 100)).toBe(true)
  })

  it('reports meta.hasMore through parseListQuery and listPage', async () => {
    fakeTop({ [field]: 7 })
    const adapter = new TmallAdapter()
    const p2 = parseListQuery({ limit: '3', page: '2' })
    const env2 = listPage(await list(adapter, p2), p2, 'tmall')
    expect(env2.data.map((r) => r.id)).toEqual(seq(7, prefix).slice(3, 6))
    expect(env2.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: '3', page: '3' })
    const env3 = listPage(await list(adapter, p3), p3, 'tmall')
    expect(env3.data.map((r) => r.id)).toEqual([`${prefix}7`])
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('Tmall listCustomers pages buyers out of trades by rows', () => {
  it('serves 2L+1 buyers over three pages, each once, in order, hasMore exact', async () => {
    fakeTop({ trades: 7 })
    const r = await walk(listCustomers, 3, 3)
    expect(r.ids).toEqual(seq(7, 'b'))
    expect(r.sizes).toEqual([3, 3, 1])
    expect(r.hasMore).toEqual([true, true, false])
  })

  it('counts de-duplicated buyers, not trades', async () => {
    // Trades 1..14, two per buyer: b1,b1,b2,b2,... → 7 buyers.
    fakeTop({ trades: 14, buyerOf: (i) => `b${Math.ceil(i / 2)}` })
    const r = await walk(listCustomers, 3, 3)
    expect(r.ids).toEqual(seq(7, 'b'))
    expect(r.hasMore).toEqual([true, true, false])
  })

  it('walks TOP pages with page_no, 100 trades at a time, whatever the caller limit', async () => {
    const calls = fakeTop({ trades: 250 })
    const r = await walk(listCustomers, 120, 3)
    expect(r.ids).toEqual(seq(250, 'b'))
    expect(r.sizes).toEqual([120, 120, 10])
    expect(r.hasMore).toEqual([true, true, false])
    const pages = calls.map((c) => [c.get('page_size'), c.get('page_no')])
    expect(pages).toContainEqual(['100', '2'])
    expect(pages).toContainEqual(['100', '3'])
    expect(calls.every((c) => c.get('page_size') === '100')).toBe(true)
  })

  it('serves a limit above 100 in full', async () => {
    fakeTop({ trades: 250 })
    const r = await walk(listCustomers, 500, 1)
    expect(r.ids).toEqual(seq(250, 'b'))
    expect(r.hasMore).toEqual([false])
  })

  it('keeps walking full TOP pages when a response carries no total_results', async () => {
    const calls = fakeTop({ trades: 250, omitTotal: true })
    const r = await walk(listCustomers, 500, 1)
    expect(r.ids).toEqual(seq(250, 'b'))
    expect(r.hasMore).toEqual([false])
    expect(calls.map((c) => c.get('page_no'))).toEqual(['1', '2', '3'])
  })

  it('never serves one connection the rows paged for another', async () => {
    const adapter = new TmallAdapter()
    const credsA = {
      accessToken: 'session-a',
      refreshToken: 'refresh-a',
      extra: { appKey: 'key123', appSecret: 'secret456', userId: 'sellerA' },
    }
    const credsB = {
      accessToken: 'session-b',
      refreshToken: 'refresh-b',
      extra: { appKey: 'key123', appSecret: 'secret456', userId: 'sellerB' },
    }
    fakeTop({ trades: 7, buyerOf: (i) => `a${i}` })
    const a1 = await adapter.listCustomers(credsA, withPageSink({ page: 1, limit: 3 }))
    expect(a1.map((c) => c.id)).toEqual(['a1', 'a2', 'a3'])
    fakeTop({ trades: 7, buyerOf: (i) => `z${i}` })
    const b2 = await adapter.listCustomers(credsB, withPageSink({ page: 2, limit: 3 }))
    expect(b2.map((c) => c.id)).toEqual(['z4', 'z5', 'z6'])
  })

  it('reports meta.hasMore through parseListQuery and listPage', async () => {
    fakeTop({ trades: 7 })
    const adapter = new TmallAdapter()
    const p = parseListQuery({ limit: '3', page: '2' })
    const env = listPage(await listCustomers(adapter, p), p, 'tmall')
    expect(env.data.map((r) => r.id)).toEqual(['b4', 'b5', 'b6'])
    expect(env.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: '3', page: '3' })
    const env3 = listPage(await listCustomers(adapter, p3), p3, 'tmall')
    expect(env3.data.map((r) => r.id)).toEqual(['b7'])
    expect(env3.meta.hasMore).toBe(false)
  })
})
