/**
 * Paystack paging contract: all nine list methods.
 *
 * Paystack's first-party OpenAPI spec (https://github.com/PaystackOSS/openapi,
 * src/assets/openapi/paths/*.yaml) documents page-number paging on every list
 * endpoint, e.g. GET /refund:
 *   perPage: "Number of records to fetch per page"
 *   page:    "The section to retrieve"
 * Every list response carries meta { total, skipped, perPage, page, pageCount }.
 * No maximum page size is documented, so the adapter declares none.
 *
 * /transaction and /transfer name the size `per_page` in the post-2025-08 spec,
 * but the 2024 spec and the official node/python SDKs send `perPage`, which is
 * what the adapter sends. The fake honours `perPage` and `page` only.
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
import { PaystackAdapter } from '../../../../../../src/verticals/payments/adapters/paystack/index'

const CREDS = { accessToken: 'sk_test_abc' }
/** Documented default for /refund ("default: 50"); used for every path when perPage is absent. */
const UPSTREAM_DEFAULT = 50

/** The only query keys the fake reads. */
type Documented = 'page' | 'perPage'

interface Req {
  path: string
  params: Record<string, unknown>
}

function fakePaystack(
  rows: Record<string, number[]>,
  opts: { noMeta?: boolean; serverMax?: number } = {},
): { reqs: Req[] } {
  const reqs: Req[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = { ...(config?.params ?? {}) }
    reqs.push({ path, params })
    const ids = rows[path]
    if (!ids) throw new Error(`unexpected path ${path}`)
    const honoured = (k: Documented): unknown => params[k]
    const page = Number(honoured('page') ?? 1)
    const asked = Number(honoured('perPage') ?? UPSTREAM_DEFAULT)
    const size = opts.serverMax ? Math.min(asked, opts.serverMax) : asked
    const from = (page - 1) * size
    const slice = ids.slice(from, from + size)
    return {
      data: {
        status: true,
        message: 'Retrieved',
        data: slice.map((id) => ({ id })),
        ...(opts.noMeta
          ? {}
          : {
              meta: {
                total: ids.length,
                skipped: from,
                perPage: size,
                page,
                pageCount: Math.ceil(ids.length / size),
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

type ListFn =
  | 'listCustomers'
  | 'listCharges'
  | 'listRefunds'
  | 'listPlans'
  | 'listSubscriptions'
  | 'listInvoices'
  | 'listPayouts'
  | 'listDisputes'
  | 'listBalanceTransactions'

const METHODS: ReadonlyArray<readonly [ListFn, string, number]> = [
  ['listCustomers', '/customer', 1000],
  ['listCharges', '/transaction', 2000],
  ['listRefunds', '/refund', 3000],
  ['listPlans', '/plan', 4000],
  ['listSubscriptions', '/subscription', 5000],
  ['listInvoices', '/paymentrequest', 6000],
  ['listPayouts', '/transfer', 7000],
  ['listDisputes', '/dispute', 8000],
  ['listBalanceTransactions', '/balance/ledger', 9000],
]

async function drive(
  method: ListFn,
  L: number,
  pages: number,
): Promise<{ got: string[]; hasMore: Array<boolean | undefined>; sizes: number[] }> {
  const adapter = new PaystackAdapter()
  const got: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sizes: number[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L } as QueryParams)
    const out: Array<{ id: string }> = await adapter[method](CREDS, params)
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

for (const [method, path, base] of METHODS) {
  describe(`Paystack ${method} paging (page + perPage on ${path})`, () => {
    it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
      const L = 4
      const all = ids(2 * L + 1, base)
      fakePaystack({ [path]: all })
      const { got, hasMore, sizes } = await drive(method, L, 3)
      expect(got).toEqual(all.map(String))
      expect(sizes).toEqual([L, L, 1])
      expect(hasMore).toEqual([true, true, false])
    })

    it('sends page=2 and perPage=limit on the page-2 request', async () => {
      const L = 4
      const { reqs } = fakePaystack({ [path]: ids(2 * L + 1, base) })
      await drive(method, L, 2)
      expect(reqs.map((r) => r.params)).toEqual([
        { page: 1, perPage: L },
        { page: 2, perPage: L },
      ])
      for (const r of reqs) expect(r.path).toBe(path)
    })

    it('serves every row at a large limit (no documented maximum, nothing clamps)', async () => {
      // Larger than the sync worker's 500 and any plausible silent clamp.
      const all = ids(600, base)
      const { reqs } = fakePaystack({ [path]: all })
      const { got, hasMore } = await drive(method, 1000, 1)
      expect(reqs.map((r) => r.params)).toEqual([{ page: 1, perPage: 1000 }])
      expect(got).toEqual(all.map(String))
      expect(hasMore).toEqual([false])
    })

    it('treats a request with no page as page 1 (the router omits page 1)', async () => {
      const { reqs } = fakePaystack({ [path]: ids(7, base) })
      const adapter = new PaystackAdapter()
      const p = parseListQuery({ limit: '3' }, adapter as unknown as PageMaxBearing)
      expect(p.page).toBeUndefined()
      const rows: Array<{ id: string }> = await adapter[method](CREDS, p)
      expect(reqs.map((r) => r.params)).toEqual([{ page: 1, perPage: 3 }])
      const e = listPage(rows, p, 'paystack')
      expect(e.data.map((r) => r.id)).toEqual([base, base + 1, base + 2].map(String))
      expect(e.meta.hasMore).toBe(true)

      const sync = withPageSink({ limit: 4 } as QueryParams)
      await adapter[method](CREDS, sync)
      expect(reqs[1]?.params).toEqual({ page: 1, perPage: 4 })
      expect(readUpstreamPage(sync)).toMatchObject({ hasMore: true, totalCount: 7 })
    })

    it('reports the smaller size the server paged at (meta.perPage) as pageSize', async () => {
      const all = ids(5, base)
      fakePaystack({ [path]: all }, { serverMax: 2 })
      const adapter = new PaystackAdapter()
      const got: string[] = []
      const more: Array<boolean | undefined> = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: 4 } as QueryParams)
        const rows: Array<{ id: string }> = await adapter[method](CREDS, params)
        got.push(...rows.map((r) => r.id))
        const up = readUpstreamPage(params)
        expect(up?.pageSize).toBe(2)
        more.push(up?.hasMore)
        expect(listPage(rows, params, 'paystack').meta.limit).toBe(2)
      }
      expect(got).toEqual(all.map(String))
      expect(more).toEqual([true, true, false])
    })

    it('reports no pageSize when the server honours the requested size', async () => {
      fakePaystack({ [path]: ids(9, base) })
      const params = withPageSink({ page: 1, limit: 4 } as QueryParams)
      await new PaystackAdapter()[method](CREDS, params)
      expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
    })

    it('reports an exact end when the collection is a multiple of the page size', async () => {
      const L = 4
      const all = ids(2 * L, base)
      fakePaystack({ [path]: all })
      const { got, hasMore } = await drive(method, L, 2)
      expect(got).toEqual(all.map(String))
      expect(hasMore).toEqual([true, false])
    })

    it('reports totalCount from meta.total', async () => {
      fakePaystack({ [path]: ids(9, base) })
      const params = withPageSink({ page: 1, limit: 4 } as QueryParams)
      await new PaystackAdapter()[method](CREDS, params)
      expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, totalCount: 9 })
    })

    it('reports nothing when the response carries no meta', async () => {
      fakePaystack({ [path]: ids(9, base) }, { noMeta: true })
      const params = withPageSink({ page: 1, limit: 4 } as QueryParams)
      const out: Array<{ id: string }> = await new PaystackAdapter()[method](CREDS, params)
      expect(out.map((r) => r.id)).toEqual([base, base + 1, base + 2, base + 3].map(String))
      expect(readUpstreamPage(params)).toBeUndefined()
    })

    it('gives meta.hasMore through parseListQuery and listPage', async () => {
      fakePaystack({ [path]: ids(7, base) })
      const adapter = new PaystackAdapter()
      const p1 = parseListQuery({ limit: '3', page: '1' }, adapter as unknown as PageMaxBearing)
      const rows1: Array<{ id: string }> = await adapter[method](CREDS, p1)
      const e1 = listPage(rows1, p1, 'paystack')
      expect(e1.data.map((r) => r.id)).toEqual([base, base + 1, base + 2].map(String))
      expect(e1.meta.hasMore).toBe(true)

      const p3 = parseListQuery({ limit: '3', page: '3' }, adapter as unknown as PageMaxBearing)
      const rows3: Array<{ id: string }> = await adapter[method](CREDS, p3)
      const e3 = listPage(rows3, p3, 'paystack')
      expect(e3.data.map((r) => r.id)).toEqual([String(base + 6)])
      expect(e3.meta.hasMore).toBe(false)
    })
  })
}
