/**
 * Global Payments list methods, paged the way the router and sync worker ask.
 *
 * GP-API lists page by `page` ("1 means the first page, 2 the second and so
 * on") and `page_size` (maximum 1000), and end on a short page: "If
 * current_page_size is less than the page_size using in the querystring then
 * this is the final page for that search." `total_record_count` is "returned
 * on the first page only". Charges are GET /transactions?type=SALE, payouts
 * GET /settlement/deposits, which requires `account_name`.
 * (https://developer.globalpayments.com/api/transactions,
 *  https://developer.globalpayments.com/api/settlement-reporting)
 *
 * The fake honours only documented parameters and rejects any other.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { GlobalPaymentsAdapter } from '../../../../../../src/verticals/payments/adapters/global-payments'
import { TRANSACTION, DEPOSIT } from './fixtures/documented'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/global-payments/client', () => ({
  GlobalPaymentsClient: class {
    get = getMock
  },
}))

const adapter = new GlobalPaymentsAdapter()
const CREDS: Credentials = { accessToken: 'tok', extra: { appId: 'app', appKey: 'key' } }
const CREDS_WITH_ACCOUNT: Credentials = {
  accessToken: 'tok',
  extra: { appId: 'app', appKey: 'key', accountName: 'Settlement Reporting' },
}

const DOCUMENTED: Record<string, Set<string>> = {
  '/transactions': new Set(['page', 'page_size', 'order', 'order_by', 'type']),
  '/settlement/deposits': new Set(['page', 'page_size', 'order', 'order_by', 'account_name']),
}

function serve(path: string, key: 'transactions' | 'deposits', n: number, withTotal = true) {
  const calls: Record<string, unknown>[] = []
  getMock.mockImplementation(async (p: string, q: Record<string, unknown>) => {
    expect(p).toBe(path)
    for (const k of Object.keys(q))
      expect(DOCUMENTED[path]!.has(k), `undocumented param ${k}`).toBe(true)
    calls.push(q)
    const page = q.page as number
    const size = q.page_size as number
    expect(Number.isInteger(page) && page >= 1).toBe(true)
    expect(size >= 1 && size <= 1000).toBe(true)
    const start = (page - 1) * size
    const ids = Array.from(
      { length: Math.max(0, Math.min(size, n - start)) },
      (_, i) => `ROW_${start + i + 1}`,
    )
    const base = key === 'transactions' ? TRANSACTION : DEPOSIT
    return {
      ...(withTotal && page === 1 ? { total_record_count: n } : {}),
      current_page_size: ids.length,
      paging: { page, page_size: size },
      [key]: ids.map((id) => ({ ...base, id })),
    }
  })
  return calls
}

beforeEach(() => {
  getMock.mockReset()
})

const CASES = [
  ['listCharges', '/transactions', 'transactions', CREDS],
  ['listPayouts', '/settlement/deposits', 'deposits', CREDS_WITH_ACCOUNT],
] as const

describe.each(CASES)('%s', (method, path, key, creds) => {
  const call = (params: QueryParams) =>
    (adapter[method] as (c: Credentials, p: QueryParams) => Promise<{ id: string }[]>).call(
      adapter,
      creds,
      params,
    )

  it('sends the caller page and limit with the documented parameters', async () => {
    const calls = serve(path, key, 3)
    await call({ page: 2, limit: 7 })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      page: 2,
      page_size: 7,
      order: 'ASC',
      order_by: 'TIME_CREATED',
    })
    if (method === 'listCharges') expect(calls[0]!.type).toBe('SALE')
    else expect(calls[0]!.account_name).toBe('Settlement Reporting')
  })

  it('walks N = 2L+1 rows: every id once, end reported on the short page', async () => {
    const L = 4
    serve(path, key, 2 * L + 1, false)
    const seen: string[] = []
    const ends: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(params)
      seen.push(...rows.map((r) => r.id))
      ends.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `ROW_${i + 1}`))
    expect(new Set(seen).size).toBe(2 * L + 1)
    // Full pages prove nothing either way; the short one is the documented end.
    expect(ends).toEqual([undefined, undefined, false])
  })

  it('reports the first-page total_record_count', async () => {
    serve(path, key, 9)
    const params = withPageSink({ page: 1, limit: 4 })
    await call(params)
    expect(readUpstreamPage(params)).toEqual({ totalCount: 9 })
  })

  it('clamps to the documented maximum of 1000 and reports the size sent', async () => {
    const calls = serve(path, key, 0)
    const params = withPageSink({ page: 1, limit: 5000 })
    await call(params)
    expect(calls[0]!.page_size).toBe(1000)
    expect(readUpstreamPage(params)?.pageSize).toBe(1000)
  })

  it('declares the documented maximum', () => {
    expect(adapter.capabilities.maxPageSize).toBe(1000)
  })
})

describe('listPayouts without an account name', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(adapter.listPayouts(CREDS, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('account_name'),
    })
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('single reads', () => {
  it('getCharge reads GET /transactions/{id}', async () => {
    getMock.mockResolvedValueOnce({ ...TRANSACTION, status: 'CAPTURED' })
    const charge = await adapter.getCharge(CREDS, 'TRN_M2lwGiHmpKsrWAtF8sHX3ouWlbqU0Y')
    expect(getMock).toHaveBeenCalledWith('/transactions/TRN_M2lwGiHmpKsrWAtF8sHX3ouWlbqU0Y')
    expect(charge.status).toBe('succeeded')
  })

  it('getCharge refuses a REFUND transaction as not a charge', async () => {
    getMock.mockResolvedValueOnce({ ...TRANSACTION, type: 'REFUND' })
    await expect(adapter.getCharge(CREDS, 'TRN_1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getPayout reads GET /settlement/deposits/{id}', async () => {
    getMock.mockResolvedValueOnce(DEPOSIT)
    const payout = await adapter.getPayout(CREDS, 'DEP_2342423423')
    expect(getMock).toHaveBeenCalledWith('/settlement/deposits/DEP_2342423423')
    expect(payout.amount).toBe(500)
  })
})
