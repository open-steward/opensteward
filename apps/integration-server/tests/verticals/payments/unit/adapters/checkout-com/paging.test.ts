/**
 * Checkout.com listDisputes, paged the way the router and the sync worker ask.
 *
 * GET /disputes pages by offset (https://api-reference.checkout.com/tag/Disputes,
 * "Get disputes"): "You can use the optional parameters below to skip or limit
 * results." `limit` is integer [1 .. 250], default 50; `skip` is integer >= 0,
 * default 0; the response carries `total_count` beside `data`.
 *
 * The adapter used to send a bare GET /disputes, so every page was the
 * upstream's first 50 again. The fake below honours only `skip` and `limit`,
 * and refuses a limit outside 1..250.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { CheckoutComAdapter } from '../../../../../../src/verticals/payments/adapters/checkout-com'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/checkout-com/client', () => ({
  CheckoutComClient: class {
    get = getMock
    post = vi.fn()
  },
}))

const adapter = new CheckoutComAdapter()
const routed: PaymentsAdapter = adapter
const CREDS: Credentials = { accessToken: 'tok_paging' }
const MAX = 250
const UPSTREAM_DEFAULT = 50
const DOCUMENTED = new Set(['skip', 'limit'])

function rowIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `dsp_${i + 1}`)
}

/** Serve `n` disputes, honouring only `skip` and `limit`. */
function serve(n: number, { withTotal = true }: { withTotal?: boolean } = {}) {
  const calls: Record<string, unknown>[] = []
  const ids = rowIds(n)
  getMock.mockImplementation(async (path: string, params: Record<string, unknown> = {}) => {
    if (path !== '/disputes') throw new Error(`unexpected path ${path}`)
    calls.push({ ...params })
    const limit = params['limit'] === undefined ? UPSTREAM_DEFAULT : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX) {
      throw new Error(`invalid limit: ${String(params['limit'])}`)
    }
    const skip = params['skip'] === undefined ? 0 : Number(params['skip'])
    if (!Number.isInteger(skip) || skip < 0) throw new Error('invalid skip')
    return {
      limit,
      skip,
      ...(withTotal ? { total_count: ids.length } : {}),
      data: ids
        .slice(skip, skip + limit)
        .map((id) => ({ id, amount: 1000, currency: 'GBP', status: 'evidence_required' })),
    }
  })
  return calls
}

beforeEach(() => {
  getMock.mockReset()
})

describe('CheckoutComAdapter.listDisputes paging', () => {
  it('serves 2L+1 rows across three worker pages, each once and in order', async () => {
    const L = 10
    const calls = serve(2 * L + 1)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listDisputes(CREDS, params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(rowIds(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls[1]).toEqual({ limit: L, skip: L })
    for (const c of calls) for (const k of Object.keys(c)) expect(DOCUMENTED.has(k), k).toBe(true)
  })

  it('reports the end from total_count when rows end on a page boundary', async () => {
    const L = 10
    serve(2 * L)
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: L })
      await adapter.listDisputes(CREDS, params)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
  })

  it('without total_count, a full page reports no end and the next page is still fetched', async () => {
    const L = 10
    const calls = serve(L + 3, { withTotal: false })
    const ids: string[] = []
    const reports: (boolean | undefined)[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listDisputes(CREDS, params)
      ids.push(...rows.map((r) => r.id))
      const report = readUpstreamPage(params)
      reports.push(report?.hasMore)
      expect(report?.pageSize).toBe(L)
      expect(report?.totalCount).toBeUndefined()
    }
    expect(reports).toEqual([undefined, undefined])
    expect(ids).toEqual(rowIds(L + 3))
    expect(calls).toEqual([
      { limit: L, skip: 0 },
      { limit: L, skip: L },
    ])
  })

  it('clamps a limit above 250 and still serves every row', async () => {
    const N = 2 * MAX + 1
    const calls = serve(N)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await adapter.listDisputes(CREDS, params)
      ids.push(...rows.map((r) => r.id))
      const report = readUpstreamPage(params)
      hasMore.push(report?.hasMore)
      expect(report?.pageSize).toBe(MAX)
    }
    expect(ids).toEqual(rowIds(N))
    expect(hasMore).toEqual([true, true, false])
    expect(calls).toEqual([
      { limit: MAX, skip: 0 },
      { limit: MAX, skip: MAX },
      { limit: MAX, skip: 2 * MAX },
    ])
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const L = 10
    serve(2 * L)
    const metas = []
    for (let page = 1; page <= 2; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await routed.listDisputes!(CREDS, params)
      metas.push(listPage(rows, params, 'checkout-com').meta)
    }
    expect(metas.map((m) => m.hasMore)).toEqual([true, false])
    expect(metas.map((m) => m.totalCount)).toEqual([2 * L, 2 * L])
  })

  it('API path: a routed limit above 250 is sent as 250 and judged at 250', async () => {
    const N = MAX + 5
    const calls = serve(N)
    const params = parseListQuery({ page: '1', limit: '500' }, routed)
    const rows = await routed.listDisputes!(CREDS, params)
    expect(calls).toEqual([{ limit: MAX, skip: 0 }])
    expect(rows.map((r) => r.id)).toEqual(rowIds(N).slice(0, MAX))
    expect(listPage(rows, params, 'checkout-com').meta.hasMore).toBe(true)
  })

  it.each([
    ['a limit of 0', 0, 1],
    ['a negative limit', -5, 1],
    ['a fractional limit', 2.5, 2],
    ['a NaN limit', Number.NaN, 1],
  ])('sends a valid limit for %s', async (_label, limit, sent) => {
    const calls = serve(5)
    const params = withPageSink({ page: 1, limit })
    const rows = await adapter.listDisputes(CREDS, params)
    expect(calls).toEqual([{ limit: sent, skip: 0 }])
    expect(rows).toHaveLength(sent)
  })

  it('uses the upstream default of 50 when no limit is given', async () => {
    const calls = serve(3)
    await adapter.listDisputes(CREDS, { page: 2 } as QueryParams)
    expect(calls).toEqual([{ limit: UPSTREAM_DEFAULT, skip: UPSTREAM_DEFAULT }])
  })
})

/**
 * GET /financial-actions needs payment_id ("Required if `action_id` is not
 * used") or action_id (https://api-reference.checkout.com/tag/Financial-actions),
 * so there is no unfiltered balance-transaction list to page.
 */
describe('CheckoutComAdapter.listBalanceTransactions', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    getMock.mockResolvedValue({ data: [] })
    const params = withPageSink({ page: 1, limit: 10 })
    await expect(adapter.listBalanceTransactions(CREDS, params)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(getMock).not.toHaveBeenCalled()
    expect(readUpstreamPage(params)).toBeUndefined()
  })
})
