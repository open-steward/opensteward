/**
 * Stax Payments paging contract: listInvoices, listPaymentMethods.
 *
 * Both lists are Laravel page-number paginators (data, current_page,
 * last_page, next_page_url, per_page, total).
 *
 * GET /invoice (https://docs.staxpayments.com/reference/get-all-invoices):
 *   "Use `per_page` and `page` query parameters to customize pagination."
 *   No maximum is documented.
 *
 * GET /payment-method
 * (https://docs.staxpayments.com/reference/get-all-payment-methods-for-a-merchant):
 *   per_page: "Used to indicate how many records you want to fetch per page.
 *   The maximum is 200 and the minimum is 1. Defaults to 20." The response
 *   example links "payment-method?page=1".
 *
 * The fake below honours ONLY `page` and `per_page`: any other query
 * parameter (the adapter used to send `limit`) is refused, and so is a
 * `per_page` above the documented 200 on /payment-method.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { PageMaxBearing, QueryParams } from '@opensteward/shared'
import { StaxPaymentsAdapter } from '../../../../../../src/verticals/payments/adapters/stax-payments/index'

const CREDS = { accessToken: 'stax_key_a' }
const BASE = 'https://apiprod.fattlabs.com'
/** GET /self: "currency": ["USD"] (https://docs.staxpayments.com/reference/get-self-and-teams-info). */
const SELF = { merchant: { id: 'dd36b936-1eb7-4ece-bebc-b514c6a36ebd', currency: ['USD'] } }

type ListFn = 'listInvoices' | 'listPaymentMethods'

const ENDPOINTS: Record<ListFn, { path: string; max: number | undefined; dflt: number }> = {
  listInvoices: { path: '/invoice', max: undefined, dflt: 25 },
  listPaymentMethods: { path: '/payment-method', max: 200, dflt: 20 },
}

const METHODS = Object.keys(ENDPOINTS) as ListFn[]

interface Req {
  path: string
  params: Record<string, unknown> | undefined
}

function fakeLists(collections: Record<string, string[]>): { reqs: Req[] } {
  const reqs: Req[] = []
  const get = vi.fn(async (p: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params
    // listInvoices reads the merchant currency; that request is not a page.
    if (p === '/self') return { data: SELF }
    reqs.push({ path: p, params: params ? { ...params } : undefined })
    const ids = collections[p]
    const ep = Object.values(ENDPOINTS).find((e) => e.path === p)
    if (!ids || !ep) throw new Error(`unexpected path ${p}`)
    for (const k of Object.keys(params ?? {})) {
      if (k !== 'page' && k !== 'per_page') throw new Error(`undocumented query parameter ${k}`)
    }
    const page = params?.page === undefined ? 1 : Number(params.page)
    if (!Number.isInteger(page) || page < 1) throw new Error(`bad page ${String(params?.page)}`)
    const perPage = params?.per_page === undefined ? ep.dflt : Number(params.per_page)
    if (!Number.isInteger(perPage) || perPage < 1) throw new Error(`bad per_page ${perPage}`)
    if (ep.max !== undefined && perPage > ep.max)
      throw new Error(`per_page ${perPage} above documented maximum ${ep.max}`)
    const lastPage = Math.max(1, Math.ceil(ids.length / perPage))
    const from = (page - 1) * perPage
    return {
      data: {
        current_page: page,
        data: ids.slice(from, from + perPage).map((id) => ({ id, total: 1 })),
        first_page_url: `${BASE}${p}?page=1`,
        from: from + 1,
        last_page: lastPage,
        last_page_url: `${BASE}${p}?page=${lastPage}`,
        next_page_url: page < lastPage ? `${BASE}${p}?page=${page + 1}` : null,
        path: `${BASE}${p}`,
        per_page: perPage,
        prev_page_url: page > 1 ? `${BASE}${p}?page=${page - 1}` : null,
        to: Math.min(from + perPage, ids.length),
        total: ids.length,
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
  return { reqs }
}

function fakeList(path: string, ids: string[]): { reqs: Req[] } {
  return fakeLists({ [path]: ids })
}

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `row-${String(i).padStart(4, '0')}`)
}

async function drive(
  method: ListFn,
  L: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined>; sizes: number[] }> {
  const adapter = new StaxPaymentsAdapter()
  const out: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sizes: number[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L } as QueryParams)
    const rows = await adapter[method](CREDS, params)
    sizes.push(rows.length)
    out.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids: out, hasMore, sizes }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(METHODS)('Stax Payments %s paging', (method) => {
  const { path } = ENDPOINTS[method]

  it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
    const L = 7
    const all = ids(2 * L + 1)
    fakeList(path, all)
    const { ids: got, hasMore, sizes } = await drive(method, L, 3)
    expect(got).toEqual(all)
    expect(sizes).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('reports an exact end when the collection is a multiple of the page size', async () => {
    const L = 5
    const all = ids(2 * L)
    fakeList(path, all)
    const { ids: got, hasMore } = await drive(method, L, 2)
    expect(got).toEqual(all)
    expect(hasMore).toEqual([true, false])
  })

  it('sends the documented `page` and `per_page` keys on the request behind caller page 2', async () => {
    const L = 7
    const { reqs } = fakeList(path, ids(2 * L + 1))
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = await new StaxPaymentsAdapter()[method](CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(2 * L + 1).slice(L, 2 * L))
    expect(reqs).toHaveLength(1)
    expect(reqs[0]!.params).toEqual({ page: 2, per_page: L })
    expect(readUpstreamPage(params)?.totalCount).toBe(2 * L + 1)
  })

  it('clamps a limit above the router maximum and still serves every row', async () => {
    const all = ids(1201)
    fakeList(path, all)
    const adapter = new StaxPaymentsAdapter()
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 10; page++) {
      const p = parseListQuery(
        { limit: '5000', page: String(page) },
        adapter as unknown as PageMaxBearing,
      )
      expect(p.limit).toBe(500)
      const rows = await adapter[method](CREDS, p)
      const env = listPage<{ id: string }>(rows, p, 'stax-payments')
      expect(env.data.length).toBeLessThanOrEqual(500)
      got.push(...env.data.map((r) => r.id))
      more.push(env.meta.hasMore ?? undefined)
      if (env.meta.hasMore === false) break
    }
    expect(got).toEqual(all)
    expect(more.at(-1)).toBe(false)
    expect(more.slice(0, -1).every((m) => m === true)).toBe(true)
  })

  it('gives meta.hasMore through parseListQuery and listPage', async () => {
    const all = ids(7)
    fakeList(path, all)
    const adapter = new StaxPaymentsAdapter()
    const p1 = parseListQuery({ limit: '3', page: '1' }, adapter as unknown as PageMaxBearing)
    const e1 = listPage<{ id: string }>(await adapter[method](CREDS, p1), p1, 'stax-payments')
    expect(e1.data.map((r) => r.id)).toEqual(all.slice(0, 3))
    expect(e1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '3', page: '3' }, adapter as unknown as PageMaxBearing)
    const e3 = listPage<{ id: string }>(await adapter[method](CREDS, p3), p3, 'stax-payments')
    expect(e3.data.map((r) => r.id)).toEqual(all.slice(6))
    expect(e3.meta.hasMore).toBe(false)
  })

  it('asks for the adapter default page size when the caller sends no limit', async () => {
    const all = ids(120)
    const { reqs } = fakeList(path, all)
    const params = withPageSink({} as QueryParams)
    const rows = await new StaxPaymentsAdapter()[method](CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(all.slice(0, 50))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(reqs[0]!.params).toEqual({ page: 1, per_page: 50 })
  })
})

describe('Stax Payments listPaymentMethods above the 200-row maximum', () => {
  it('sends per_page 200 for a larger limit, reports that page size, and serves every row once', async () => {
    const L = 500
    const all = ids(2 * L + 1)
    const { reqs } = fakeList('/payment-method', all)
    const adapter = new StaxPaymentsAdapter()
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 6; page++) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await adapter.listPaymentMethods(CREDS, params)
      got.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pageSize).toBe(200)
    }
    expect(got).toEqual(all)
    expect(more).toEqual([true, true, true, true, true, false])
    expect(reqs.map((r) => r.params)).toEqual(
      [1, 2, 3, 4, 5, 6].map((page) => ({ page, per_page: 200 })),
    )
  })

  it('publishes meta.limit 200 through the router envelope', async () => {
    fakeList('/payment-method', ids(450))
    const adapter = new StaxPaymentsAdapter()
    const p = parseListQuery({ limit: '300', page: '2' }, adapter as unknown as PageMaxBearing)
    const env = listPage<{ id: string }>(
      await adapter.listPaymentMethods(CREDS, p),
      p,
      'stax-payments',
    )
    expect(env.data.map((r) => r.id)).toEqual(ids(450).slice(200, 400))
    expect(env.meta.limit).toBe(200)
    expect(env.meta.hasMore).toBe(true)
  })

  it('reports no page size when the limit is within the maximum', async () => {
    fakeList('/payment-method', ids(10))
    const params = withPageSink({ page: 1, limit: 200 } as QueryParams)
    await new StaxPaymentsAdapter().listPaymentMethods(CREDS, params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })
})

describe('Stax Payments listInvoices has no documented maximum', () => {
  it('sends a 500-row limit as per_page 500', async () => {
    const { reqs } = fakeList('/invoice', ids(3))
    const params = withPageSink({ page: 1, limit: 500 } as QueryParams)
    await new StaxPaymentsAdapter().listInvoices(CREDS, params)
    expect(reqs[0]!.params).toEqual({ page: 1, per_page: 500 })
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })
})

describe.each(METHODS)('Stax Payments %s end signal fallbacks', (method) => {
  const { path } = ENDPOINTS[method]

  function fakeEnvelope(body: Record<string, unknown>): void {
    const get = vi.fn(async (p: string) => {
      if (p === '/self') return { data: SELF }
      if (p !== path) throw new Error(`unexpected path ${p}`)
      return {
        data: {
          data: [
            { id: 'a', total: 1 },
            { id: 'b', total: 1 },
          ],
          ...body,
        },
      }
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
  }

  async function reportedHasMore(page: number): Promise<boolean | undefined> {
    const params = withPageSink({ page, limit: 2 } as QueryParams)
    await new StaxPaymentsAdapter()[method](CREDS, params)
    return readUpstreamPage(params)?.hasMore
  }

  it('trusts next_page_url over a disagreeing last_page', async () => {
    fakeEnvelope({ current_page: 1, last_page: 1, next_page_url: `${BASE}${path}?page=2` })
    expect(await reportedHasMore(1)).toBe(true)
    fakeEnvelope({ current_page: 1, last_page: 5, next_page_url: null })
    expect(await reportedHasMore(1)).toBe(false)
  })

  it('falls back to current_page < last_page when next_page_url is absent', async () => {
    fakeEnvelope({ current_page: 2, last_page: 3 })
    expect(await reportedHasMore(2)).toBe(true)
    fakeEnvelope({ current_page: 3, last_page: 3 })
    expect(await reportedHasMore(3)).toBe(false)
  })

  it('uses the requested page when the envelope omits current_page', async () => {
    fakeEnvelope({ last_page: 3 })
    expect(await reportedHasMore(2)).toBe(true)
    fakeEnvelope({ last_page: 3 })
    expect(await reportedHasMore(3)).toBe(false)
  })

  it('reports no hasMore when the envelope carries no end signal', async () => {
    fakeEnvelope({})
    expect(await reportedHasMore(1)).toBeUndefined()
  })
})
