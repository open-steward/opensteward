/**
 * Kill Bill paging contract: listPaymentMethods.
 *
 * GET /1.0/kb/paymentMethods/pagination
 * (https://killbill.github.io/slate/payment-method.html, "List payment methods")
 * takes `offset` (long, default 0, "Starting position in list") and `limit`
 * (long, default 100, "Max number of items to return"). No maximum is
 * documented. The response is a bare JSON array; the next signal is a header
 * (https://killbill.github.io/slate/, Pagination):
 *
 *   "The header will only be present if there are additional entries to
 *    return and would include the next offset"
 *
 * i.e. X-Killbill-Pagination-NextOffset, alongside
 * X-Killbill-Pagination-TotalNbRecords.
 *
 * The fake below honours ONLY offset and limit, and sets those headers the
 * way the docs describe.
 *
 * The other list methods are pinned in list-methods.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { PageMaxBearing, QueryParams } from '@opensteward/shared'
import { KillbillAdapter } from '../../../../../../src/verticals/payments/adapters/killbill/index'

const CREDS = {
  accessToken: 'YWRtaW46cGFzc3dvcmQ=',
  extra: { serverUrl: 'https://kb.example.com', apiKey: 'bob', apiSecret: 'lazar' },
}
const PATH = '/1.0/kb/paymentMethods/pagination'
/** Documented default for `limit` when none is sent. */
const DOC_DEFAULT_LIMIT = 100

interface Req {
  path: string
  params: Record<string, unknown>
}

function rows(n: number): Array<{ paymentMethodId: string; accountId: string }> {
  return Array.from({ length: n }, (_, i) => ({
    paymentMethodId: `pm-${String(i).padStart(4, '0')}`,
    accountId: 'acc-1',
  }))
}

/** Which X-Killbill-Pagination-* headers the fake sends (e.g. a proxy stripping some). */
type HeaderMode = 'all' | 'none' | 'next-only'

function fakeUpstream(
  all: Array<Record<string, unknown>>,
  mode: HeaderMode = 'all',
): { reqs: Req[] } {
  const reqs: Req[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = { ...(config?.params ?? {}) }
    reqs.push({ path, params })
    if (path !== PATH) throw new Error(`unexpected path ${path}`)
    const offset = params['offset'] === undefined ? 0 : Number(params['offset'])
    const limit = params['limit'] === undefined ? DOC_DEFAULT_LIMIT : Number(params['limit'])
    const data = all.slice(offset, offset + limit)
    const headers: Record<string, string> = {
      'x-killbill-pagination-currentoffset': String(offset),
      'x-killbill-pagination-totalnbrecords': String(all.length),
      'x-killbill-pagination-maxnbrecords': String(all.length),
    }
    if (offset + data.length < all.length) {
      headers['x-killbill-pagination-nextoffset'] = String(offset + data.length)
    }
    if (mode === 'none') return { data, headers: {} }
    if (mode === 'next-only') {
      const next = headers['x-killbill-pagination-nextoffset']
      return {
        data,
        headers: next === undefined ? {} : { 'x-killbill-pagination-nextoffset': next },
      }
    }
    return { data, headers }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    delete: vi.fn(),
    defaults: {},
  } as never)
  return { reqs }
}

async function drive(
  L: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined>; sizes: number[] }> {
  const adapter = new KillbillAdapter()
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sizes: number[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L } as QueryParams)
    const out = await adapter.listPaymentMethods(CREDS, params)
    sizes.push(out.length)
    ids.push(...out.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore, sizes }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Kill Bill listPaymentMethods paging', () => {
  it('serves 2L+1 payment methods once each, in order, across pages 1..3 with exact hasMore', async () => {
    const L = 4
    const all = rows(2 * L + 1)
    fakeUpstream(all)
    const { ids, hasMore, sizes } = await drive(L, 3)
    expect(ids).toEqual(all.map((r) => r.paymentMethodId))
    expect(sizes).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends offset = (page - 1) * limit on page 2', async () => {
    const L = 4
    const { reqs } = fakeUpstream(rows(2 * L + 1))
    await drive(L, 2)
    expect(reqs.map((r) => r.params)).toEqual([
      { limit: L, offset: 0 },
      { limit: L, offset: L },
    ])
  })

  it('strides by the default page size when the caller sends no limit', async () => {
    const all = rows(120)
    const { reqs } = fakeUpstream(all)
    const adapter = new KillbillAdapter()
    const p1 = withPageSink({ page: 1 } as QueryParams)
    const first = await adapter.listPaymentMethods(CREDS, p1)
    const p2 = withPageSink({ page: 2 } as QueryParams)
    const second = await adapter.listPaymentMethods(CREDS, p2)
    const size = Number(reqs[0]!.params['limit'])
    expect(reqs[1]!.params['offset']).toBe(size)
    expect([...first, ...second].map((r) => r.id)).toEqual(
      all.slice(0, 2 * size).map((r) => r.paymentMethodId),
    )
  })

  it('reports an exact end when the collection is a multiple of the page size', async () => {
    const L = 4
    const all = rows(2 * L)
    fakeUpstream(all)
    const { ids, hasMore } = await drive(L, 2)
    expect(ids).toEqual(all.map((r) => r.paymentMethodId))
    expect(hasMore).toEqual([true, false])
  })

  it('reports the total from X-Killbill-Pagination-TotalNbRecords', async () => {
    fakeUpstream(rows(9))
    const params = withPageSink({ page: 1, limit: 4 } as QueryParams)
    await new KillbillAdapter().listPaymentMethods(CREDS, params)
    expect(readUpstreamPage(params)?.totalCount).toBe(9)
  })

  it('reports nothing when no pagination header arrives, leaving the router probe in charge', async () => {
    const all = rows(9)
    fakeUpstream(all, 'none')
    const params = withPageSink({ page: 1, limit: 4 } as QueryParams)
    const out = await new KillbillAdapter().listPaymentMethods(CREDS, params)
    expect(out.map((r) => r.id)).toEqual(all.slice(0, 4).map((r) => r.paymentMethodId))
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('reports hasMore from NextOffset alone when TotalNbRecords is absent', async () => {
    fakeUpstream(rows(9), 'next-only')
    const params = withPageSink({ page: 1, limit: 4 } as QueryParams)
    await new KillbillAdapter().listPaymentMethods(CREDS, params)
    const reported = readUpstreamPage(params)
    expect(reported?.hasMore).toBe(true)
    expect(reported?.totalCount).toBeUndefined()
  })

  it('forwards a large limit verbatim (no documented maximum) and serves every row once', async () => {
    const L = 250
    const all = rows(2 * L + 1)
    const { reqs } = fakeUpstream(all)
    const { ids, hasMore } = await drive(L, 3)
    expect(ids).toEqual(all.map((r) => r.paymentMethodId))
    expect(hasMore).toEqual([true, true, false])
    for (const r of reqs) expect(r.params['limit']).toBe(L)
  })

  it('declares no maxPageSize, since Kill Bill documents none', () => {
    const caps = (new KillbillAdapter() as unknown as { capabilities?: { maxPageSize?: number } })
      .capabilities
    expect(caps?.maxPageSize).toBeUndefined()
  })

  it('gives meta.hasMore through parseListQuery and listPage', async () => {
    const all = rows(7)
    fakeUpstream(all)
    const adapter = new KillbillAdapter()
    const p1 = parseListQuery({ limit: '3', page: '1' }, adapter as unknown as PageMaxBearing)
    const e1 = listPage(await adapter.listPaymentMethods(CREDS, p1), p1, 'killbill')
    expect(e1.data.map((m) => m.id)).toEqual(['pm-0000', 'pm-0001', 'pm-0002'])
    expect(e1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '3', page: '3' }, adapter as unknown as PageMaxBearing)
    const e3 = listPage(await adapter.listPaymentMethods(CREDS, p3), p3, 'killbill')
    expect(e3.data.map((m) => m.id)).toEqual(['pm-0006'])
    expect(e3.meta.hasMore).toBe(false)
  })
})
