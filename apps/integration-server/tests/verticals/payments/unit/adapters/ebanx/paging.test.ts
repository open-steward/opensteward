/**
 * EBANX listPayouts, paged the way the router and the sync worker ask.
 *
 * POST /ws/payout/search pages by page number
 * (https://docs.ebanx.com/docs/payout/general/consult-payout): "You can also
 * control how many Payouts you want per page (up to 50 records), and which
 * page the API should return." The request body carries `per_page` and a
 * 1-based `page`; the response carries `records`, `total_pages`, `per_page`
 * and `page` — typed as strings in the OpenAPI examples.
 *
 * The adapter used to forward `per_page` but never `page`, so page 2 was page
 * 1 again. The fake below honours only the documented body fields and
 * refuses a `per_page` outside 1..50.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { EbanxAdapter } from '../../../../../../src/verticals/payments/adapters/ebanx'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/ebanx/client', () => ({
  EbanxClient: class {
    post = postMock
  },
}))

const adapter = new EbanxAdapter()
const routed: PaymentsAdapter = adapter
const CREDS: Credentials = { accessToken: 'ebanx-paging-key' }
const EBANX_MAX = 50
const DOCUMENTED = new Set(['date_from', 'date_to', 'status', 'per_page', 'page'])

function rowIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `PAYOUT-${i + 1}`)
}

/** Serve `n` payouts, honouring only the documented search fields. */
function serve(n: number) {
  const calls: Record<string, unknown>[] = []
  const ids = rowIds(n)
  postMock.mockImplementation(async (path: string, body: Record<string, unknown> = {}) => {
    if (path !== '/ws/payout/search') throw new Error(`unexpected path ${path}`)
    calls.push({ ...body })
    for (const k of Object.keys(body)) {
      if (!DOCUMENTED.has(k)) return { type: 'error', message: `unknown field ${k}` }
    }
    const perPage = body['per_page'] === undefined ? EBANX_MAX : Number(body['per_page'])
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > EBANX_MAX) {
      return { type: 'error', message: `invalid per_page ${String(body['per_page'])}` }
    }
    const page = body['page'] === undefined ? 1 : Number(body['page'])
    if (!Number.isInteger(page) || page < 1) {
      return { type: 'error', message: `invalid page ${String(body['page'])}` }
    }
    const start = (page - 1) * perPage
    return {
      type: 'success',
      records: String(ids.length),
      total_pages: String(Math.ceil(ids.length / perPage)),
      per_page: String(perPage),
      page: String(page),
      payouts: ids.slice(start, start + perPage).map((uid) => ({
        uid,
        status: 'PA',
        request_amount: '10.00',
        request_currency: 'BRL',
      })),
    }
  })
  return calls
}

async function list(params: QueryParams): Promise<{ id: string }[]> {
  return adapter.listPayouts(CREDS, params)
}

beforeEach(() => {
  postMock.mockReset()
})

describe('EbanxAdapter.listPayouts paging', () => {
  it('serves 2L+1 rows across three worker pages, each once and in order', async () => {
    const L = 10
    const calls = serve(2 * L + 1)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(rowIds(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls[1]).toMatchObject({ per_page: L, page: 2 })
  })

  it('reports the upstream count, not a full-page guess, when rows end on a page boundary', async () => {
    const L = 10
    serve(2 * L)
    const reports = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: L })
      await list(params)
      reports.push(readUpstreamPage(params))
    }
    expect(reports.map((r) => r?.hasMore)).toEqual([true, false])
    expect(reports.map((r) => r?.totalCount)).toEqual([2 * L, 2 * L])
  })

  it('clamps a limit above 50 and still serves every row', async () => {
    const N = 2 * EBANX_MAX + 1
    const calls = serve(N)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await list(params)
      ids.push(...rows.map((r) => r.id))
      const report = readUpstreamPage(params)
      hasMore.push(report?.hasMore)
      expect(report?.pageSize).toBe(EBANX_MAX)
    }
    expect(ids).toEqual(rowIds(N))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c['per_page'])).toEqual([EBANX_MAX, EBANX_MAX, EBANX_MAX])
    expect(calls.map((c) => c['page'])).toEqual([1, 2, 3])
  })

  it('declares the documented maximum, so the router caps the caller page at 50', () => {
    expect(adapter.capabilities.maxPageSize).toBe(EBANX_MAX)
    expect(parseListQuery({ limit: '250' }, routed).limit).toBe(EBANX_MAX)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const L = 10
    serve(2 * L + 1)
    const metas = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await list(params)
      metas.push(listPage(rows, params, 'ebanx').meta)
    }
    expect(metas.map((m) => m.hasMore)).toEqual([true, true, false])
    expect(metas.map((m) => m.totalCount)).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
  })

  it('sends a valid page and per_page for malformed direct-call params', async () => {
    const calls = serve(5)
    await list(withPageSink({ page: 0, limit: 0 }))
    await list({} as QueryParams)
    expect(calls.map((c) => [c['page'], c['per_page']])).toEqual([
      [1, 1],
      [1, EBANX_MAX],
    ])
  })

  it('floors fractional direct-call page and limit to whole numbers', async () => {
    const calls = serve(30)
    await list(withPageSink({ page: 2.7, limit: 10.9 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ page: 2, per_page: 10 })
  })
})
