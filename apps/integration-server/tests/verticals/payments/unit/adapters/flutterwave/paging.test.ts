/**
 * Flutterwave paging contract: listPayouts, listPlans, listSubscriptions.
 *
 * GET /v3/transfers (https://developer.flutterwave.com/reference/get-all-transfers.md)
 * documents both paging params:
 *   page:      "This allows you fetch from a specific page e.g. setting 1 retrieves the first page."
 *   page_size: "The number of query results to return per page. If unspecified, this would
 *               default to 10 items per page."
 *
 * GET /v3/payment-plans (https://developer.flutterwave.com/reference/get-payment-plans.md) and
 * GET /v3/subscriptions (https://developer.flutterwave.com/reference/get-all-subscriptions.md)
 * document `page` only ("This is the page number to retrieve e.g. setting 1 retrieves the
 * first page"), and no page size. Each response carries
 * meta.page_info { total, current_page, total_pages }.
 *
 * The fake below honours ONLY those documented parameters: page_size on /transfers, and a
 * fixed upstream page on /payment-plans and /subscriptions whatever else is sent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { PageMaxBearing, QueryParams } from '@opensteward/shared'
import { FlutterwaveAdapter } from '../../../../../../src/verticals/payments/adapters/flutterwave/index'

const CREDS = { accessToken: 'FLWSECK_TEST-abc' }
/** /transfers default when page_size is unspecified. */
const TRANSFERS_DEFAULT = 10
/** The fixed page the undocumented-size endpoints serve. Not stated in the docs; any size must work. */
const FIXED = 10

const DOCUMENTED: Record<string, readonly string[]> = {
  '/transfers': ['page', 'page_size'],
  '/payment-plans': ['page'],
  '/subscriptions': ['page'],
}

interface Req {
  path: string
  params: Record<string, unknown>
}

function fakeFlutterwave(
  rows: Record<string, number[]>,
  opts: { fixed?: number; noPageInfo?: boolean } = {},
): { reqs: Req[] } {
  const reqs: Req[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = { ...(config?.params ?? {}) }
    reqs.push({ path, params })
    const ids = rows[path]
    const documented = DOCUMENTED[path]
    if (!ids || !documented) throw new Error(`unexpected path ${path}`)
    const honoured = (k: string): unknown => (documented.includes(k) ? params[k] : undefined)
    // noPageInfo models an upstream that ignores `page` and omits page_info:
    // every request returns the first page again.
    const page = opts.noPageInfo ? 1 : Number(honoured('page') ?? 1)
    const size =
      path === '/transfers'
        ? Number(honoured('page_size') ?? TRANSFERS_DEFAULT)
        : (opts.fixed ?? FIXED)
    const from = (page - 1) * size
    const slice = ids.slice(from, from + size)
    return {
      data: {
        status: 'success',
        data: slice.map((id) => ({ id })),
        ...(opts.noPageInfo
          ? {}
          : {
              meta: {
                page_info: {
                  total: ids.length,
                  current_page: page,
                  total_pages: Math.ceil(ids.length / size),
                },
              },
            }),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
  return { reqs }
}

function ids(n: number, base: number): number[] {
  return Array.from({ length: n }, (_, i) => base + i)
}

type ListFn = 'listPayouts' | 'listPlans' | 'listSubscriptions'

async function drive(
  method: ListFn,
  L: number,
  pages: number,
): Promise<{ got: string[]; hasMore: Array<boolean | undefined>; sizes: number[] }> {
  const adapter = new FlutterwaveAdapter()
  const got: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sizes: number[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L } as QueryParams)
    const out = await adapter[method](CREDS, params)
    sizes.push(out.length)
    got.push(...out.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { got, hasMore, sizes }
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

describe('Flutterwave listPayouts paging (page + page_size)', () => {
  it('serves 2L+1 transfers once each, in order, across pages 1..3 with exact hasMore', async () => {
    const L = 4
    const all = ids(2 * L + 1, 500)
    fakeFlutterwave({ '/transfers': all })
    const { got, hasMore, sizes } = await drive('listPayouts', L, 3)
    expect(got).toEqual(all.map(String))
    expect(sizes).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends page=2 and page_size=limit on the page-2 request', async () => {
    const L = 4
    const { reqs } = fakeFlutterwave({ '/transfers': ids(2 * L + 1, 500) })
    await drive('listPayouts', L, 2)
    expect(reqs.map((r) => r.params)).toEqual([
      { page: 1, page_size: L },
      { page: 2, page_size: L },
    ])
  })

  it('serves every row at a large limit (no documented maximum)', async () => {
    const all = ids(25, 500)
    fakeFlutterwave({ '/transfers': all })
    const { got, hasMore } = await drive('listPayouts', 1000, 1)
    expect(got).toEqual(all.map(String))
    expect(hasMore).toEqual([false])
  })

  it('reports totalCount and totalPages from meta.page_info', async () => {
    fakeFlutterwave({ '/transfers': ids(9, 500) })
    const params = withPageSink({ page: 1, limit: 4 } as QueryParams)
    await new FlutterwaveAdapter().listPayouts(CREDS, params)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, totalCount: 9, totalPages: 3 })
  })

  it('reports nothing when the response carries no page_info', async () => {
    fakeFlutterwave({ '/transfers': ids(9, 500) }, { noPageInfo: true })
    const params = withPageSink({ page: 1, limit: 4 } as QueryParams)
    const out = await new FlutterwaveAdapter().listPayouts(CREDS, params)
    expect(out.map((r) => r.id)).toEqual(['500', '501', '502', '503'])
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('reports an exact end when the collection is a multiple of the page size', async () => {
    const L = 4
    const all = ids(2 * L, 500)
    fakeFlutterwave({ '/transfers': all })
    const { got, hasMore } = await drive('listPayouts', L, 2)
    expect(got).toEqual(all.map(String))
    expect(hasMore).toEqual([true, false])
  })

  it('gives meta.hasMore through parseListQuery and listPage', async () => {
    fakeFlutterwave({ '/transfers': ids(7, 500) })
    const adapter = new FlutterwaveAdapter()
    const p1 = parseListQuery({ limit: '3', page: '1' }, adapter as unknown as PageMaxBearing)
    const e1 = listPage(await adapter.listPayouts(CREDS, p1), p1, 'flutterwave')
    expect(e1.data.map((r) => r.id)).toEqual(['500', '501', '502'])
    expect(e1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '3', page: '3' }, adapter as unknown as PageMaxBearing)
    const e3 = listPage(await adapter.listPayouts(CREDS, p3), p3, 'flutterwave')
    expect(e3.data.map((r) => r.id)).toEqual(['506'])
    expect(e3.meta.hasMore).toBe(false)
  })
})

for (const [method, path, base] of [
  ['listPlans', '/payment-plans', 7000],
  ['listSubscriptions', '/subscriptions', 9000],
] as const) {
  describe(`Flutterwave ${method} paging (page only, fixed upstream size)`, () => {
    it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
      const L = 4
      const all = ids(2 * L + 1, base)
      fakeFlutterwave({ [path]: all })
      const { got, hasMore, sizes } = await drive(method, L, 3)
      expect(got).toEqual(all.map(String))
      expect(sizes).toEqual([L, L, 1])
      expect(hasMore).toEqual([true, true, false])
    })

    it('serves 2L+1 rows once each when L crosses upstream pages', async () => {
      const L = 15
      const all = ids(2 * L + 1, base)
      fakeFlutterwave({ [path]: all })
      const { got, hasMore, sizes } = await drive(method, L, 3)
      expect(got).toEqual(all.map(String))
      expect(sizes).toEqual([L, L, 1])
      expect(hasMore).toEqual([true, true, false])
    })

    it('sends the documented page key on the page-2 upstream request', async () => {
      const L = 15
      const { reqs } = fakeFlutterwave({ [path]: ids(2 * L + 1, base) })
      await drive(method, L, 2)
      // Exactly `page`: the undocumented page_size must not come back, or the
      // upstream size would follow a limit the pager key leaves out.
      expect(reqs.map((r) => r.params)).toEqual([
        { page: 1 },
        { page: 2 },
        { page: 3 },
        { page: 4 },
      ])
      for (const r of reqs) expect(r.path).toBe(path)
    })

    it('serves a page asked for cold, with no earlier page in memory', async () => {
      const L = 15
      const all = ids(2 * L + 1, base)
      fakeFlutterwave({ [path]: all })
      const params = withPageSink({ page: 2, limit: L } as QueryParams)
      const out = await new FlutterwaveAdapter()[method](CREDS, params)
      expect(out.map((r) => r.id)).toEqual(all.slice(L, 2 * L).map(String))
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
    })

    it('serves every row at a limit far above the upstream page', async () => {
      const all = ids(37, base)
      fakeFlutterwave({ [path]: all })
      const { got, hasMore } = await drive(method, 1000, 1)
      expect(got).toEqual(all.map(String))
      expect(hasMore).toEqual([false])
    })

    it('serves every row once whatever the fixed upstream size is', async () => {
      const L = 4
      const all = ids(2 * L + 1, base)
      fakeFlutterwave({ [path]: all }, { fixed: 3 })
      const { got, hasMore } = await drive(method, L, 3)
      expect(got).toEqual(all.map(String))
      expect(hasMore).toEqual([true, true, false])
    })

    it('gives meta.hasMore through parseListQuery and listPage', async () => {
      fakeFlutterwave({ [path]: ids(7, base) })
      const adapter = new FlutterwaveAdapter()
      const p1 = parseListQuery({ limit: '3', page: '1' }, adapter as unknown as PageMaxBearing)
      const rows1: Array<{ id: string }> = await adapter[method](CREDS, p1)
      const e1 = listPage(rows1, p1, 'flutterwave')
      expect(e1.data.map((r) => r.id)).toEqual([base, base + 1, base + 2].map(String))
      expect(e1.meta.hasMore).toBe(true)

      const p3 = parseListQuery({ limit: '3', page: '3' }, adapter as unknown as PageMaxBearing)
      const rows3: Array<{ id: string }> = await adapter[method](CREDS, p3)
      const e3 = listPage(rows3, p3, 'flutterwave')
      expect(e3.data.map((r) => r.id)).toEqual([String(base + 6)])
      expect(e3.meta.hasMore).toBe(false)
    })

    it('takes a page with no page_info as the last, without re-walking a repeated page', async () => {
      const all = ids(25, base)
      const { reqs } = fakeFlutterwave({ [path]: all }, { noPageInfo: true })
      const params = withPageSink({ page: 1, limit: 1000 } as QueryParams)
      const out = await new FlutterwaveAdapter()[method](CREDS, params)
      expect(reqs).toHaveLength(1)
      expect(out.map((r) => r.id)).toEqual(all.slice(0, FIXED).map(String))
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('never serves one connection the rows another connection fetched', async () => {
      const L = 4
      const a = ids(2 * L + 1, base)
      const b = ids(2 * L + 1, base + 100)
      const adapter = new FlutterwaveAdapter()
      fakeFlutterwave({ [path]: a })
      await adapter[method]({ accessToken: 'FLWSECK_TEST-a' }, withPageSink({ page: 1, limit: L }))
      vi.restoreAllMocks()
      fakeFlutterwave({ [path]: b })
      const out = await adapter[method](
        { accessToken: 'FLWSECK_TEST-b' },
        withPageSink({ page: 2, limit: L }),
      )
      expect(out.map((r) => r.id)).toEqual(b.slice(L, 2 * L).map(String))
    })
  })
}

describe('Flutterwave plans and subscriptions keep separate pager state', () => {
  it('never serves listSubscriptions the plan rows a listPlans walk cached', async () => {
    const L = 4
    const plans = ids(2 * L + 1, 7000)
    const subs = ids(2 * L + 1, 9000)
    fakeFlutterwave({ '/payment-plans': plans, '/subscriptions': subs })
    const adapter = new FlutterwaveAdapter()
    await adapter.listPlans(CREDS, withPageSink({ page: 1, limit: L } as QueryParams))
    const out = await adapter.listSubscriptions(
      CREDS,
      withPageSink({ page: 2, limit: L } as QueryParams),
    )
    expect(out.map((r) => r.id)).toEqual(subs.slice(L, 2 * L).map(String))
  })
})
