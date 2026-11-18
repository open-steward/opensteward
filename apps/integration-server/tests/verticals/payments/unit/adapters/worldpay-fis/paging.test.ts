/**
 * Worldpay (FIS) paging contract: listPayouts and listBalanceTransactions.
 *
 * Both endpoints page by page number, with the end given as a page count.
 *
 * GET /accountPayouts/events
 * (https://docs.worldpay.com/access/products/account-payouts/openapi/get-payouts):
 *
 *   "pageSize integer, (int32), [ 1 .. 499 ] required Positive whole number
 *    indicating the number of payouts to return in each page. … pageNumber
 *    integer, (int32), >= 1 required Positive whole number indicating which
 *    page of the statement to return."
 *
 *   and the response carries `pagination: { pageNumber, pageSize, pageCount,
 *   totalNumberOfRecords }`.
 *
 * GET /accounts/statements
 * (https://docs.worldpay.com/access/products/statements/openapi/other/getstatements):
 *
 *   "The page number of the results. Default is 1 if no value is provided. …
 *    Exact number of records per page to be shown. Max 500 items/rows. Value
 *    must be between 1-500. Default is 500 if no value is provided. … The
 *    total number of pages. … The total number of records."
 *
 *   with pageNumber / pageSize / pageCount / totalNumberOfRecords at the top
 *   level of the response, beside `accountStatementItems`.
 *
 * The fakes honour ONLY those documented parameters.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { PageMaxBearing, QueryParams } from '@opensteward/shared'
import { WorldpayFisAdapter } from '../../../../../../src/verticals/payments/adapters/worldpay-fis/index'

const CREDS = { accessToken: 'd3A6dGVzdA==', extra: { authStyle: 'basic', environment: 'try' } }
/** Documented: pageSize "[ 1 .. 499 ]". */
const PAYOUTS_MAX = 499
/** Documented: "Value must be between 1-500. Default is 500". */
const STATEMENTS_MAX = 500

function bad(message: string): Error {
  return Object.assign(new Error(message), { response: { status: 400 } })
}

function payoutIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `po_${String(i).padStart(5, '0')}`)
}

function statementIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `si_${String(i).padStart(5, '0')}`)
}

/** Fake GET for both endpoints; records every request's query. */
function fakeUpstream(payouts: string[], statements: string[]): { calls: URL[] } {
  const calls: URL[] = []
  const get = vi.fn(async (path: string) => {
    const url = new URL(path, 'https://try.access.worldpay.com')
    calls.push(url)
    const q = url.searchParams
    if (url.pathname === '/accountPayouts/events') {
      // Both documented as required.
      if (!q.has('pageSize') || !q.has('pageNumber')) throw bad('pageSize and pageNumber required')
      const size = Number(q.get('pageSize'))
      const number = Number(q.get('pageNumber'))
      if (!Number.isInteger(size) || size < 1 || size > PAYOUTS_MAX) throw bad('pageSize')
      if (!Number.isInteger(number) || number < 1) throw bad('pageNumber')
      const from = (number - 1) * size
      return {
        data: {
          items: payouts.slice(from, from + size).map((id) => ({
            payoutRequestId: id,
            amount: 100,
            currency: 'GBP',
          })),
          pagination: {
            pageNumber: number,
            pageSize: size,
            pageCount: Math.ceil(payouts.length / size),
            totalNumberOfRecords: payouts.length,
          },
        },
      }
    }
    if (url.pathname === '/accounts/statements') {
      const size = q.has('pageSize') ? Number(q.get('pageSize')) : STATEMENTS_MAX
      const number = q.has('pageNumber') ? Number(q.get('pageNumber')) : 1
      if (!Number.isInteger(size) || size < 1 || size > STATEMENTS_MAX) throw bad('pageSize')
      if (!Number.isInteger(number) || number < 1) throw bad('pageNumber')
      const from = (number - 1) * size
      return {
        data: {
          accountNumber: q.get('accountNumber'),
          pageNumber: number,
          pageSize: size,
          pageCount: Math.ceil(statements.length / size),
          totalNumberOfRecords: statements.length,
          accountStatementItems: statements.slice(from, from + size).map((id) => ({
            statementItemId: id,
            amount: 10,
            currency: 'GBP',
          })),
        },
      }
    }
    throw new Error(`unexpected path ${url.pathname}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
  return { calls }
}

type ListMethod = 'listPayouts' | 'listBalanceTransactions'

async function drive(
  method: ListMethod,
  L: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined>; params: QueryParams[] }> {
  const adapter = new WorldpayFisAdapter()
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const params: QueryParams[] = []
  for (let page = 1; page <= pages; page++) {
    const p = withPageSink({ page, limit: L, accountNumber: 'GB00001' } as QueryParams)
    const out = await adapter[method](CREDS, p)
    ids.push(...out.map((r) => r.id))
    hasMore.push(readUpstreamPage(p)?.hasMore)
    params.push(p)
  }
  return { ids, hasMore, params }
}

/** One list call, typed as the common row shape both methods return. */
async function listRows(
  adapter: WorldpayFisAdapter,
  method: ListMethod,
  params: QueryParams,
): Promise<Array<{ id: string }>> {
  return adapter[method](CREDS, params)
}

afterEach(() => {
  vi.restoreAllMocks()
})

const CASES: Array<{
  method: ListMethod
  path: string
  max: number
  ids: (n: number) => string[]
  seed: (rows: string[]) => { calls: URL[] }
}> = [
  {
    method: 'listPayouts',
    path: '/accountPayouts/events',
    max: PAYOUTS_MAX,
    ids: payoutIds,
    seed: (rows) => fakeUpstream(rows, []),
  },
  {
    method: 'listBalanceTransactions',
    path: '/accounts/statements',
    max: STATEMENTS_MAX,
    ids: statementIds,
    seed: (rows) => fakeUpstream([], rows),
  },
]

for (const c of CASES) {
  describe(`Worldpay ${c.method} paging`, () => {
    it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
      const L = 4
      const rows = c.ids(2 * L + 1)
      c.seed(rows)
      const { ids, hasMore, params } = await drive(c.method, L, 3)
      expect(ids).toEqual(rows)
      expect(hasMore).toEqual([true, true, false])
      for (const p of params) expect(readUpstreamPage(p)?.totalCount).toBe(rows.length)
    })

    it('sends pageNumber and pageSize, and page 2 carries pageNumber=2', async () => {
      const L = 4
      const { calls } = c.seed(c.ids(2 * L + 1))
      await drive(c.method, L, 2)
      expect(calls.map((u) => u.pathname)).toEqual([c.path, c.path])
      expect(calls.map((u) => u.searchParams.get('pageNumber'))).toEqual(['1', '2'])
      expect(calls.map((u) => u.searchParams.get('pageSize'))).toEqual([String(L), String(L)])
    })

    it('reports an exact end when the collection is a multiple of the page size', async () => {
      const L = 4
      const rows = c.ids(2 * L)
      c.seed(rows)
      const { ids, hasMore } = await drive(c.method, L, 2)
      expect(ids).toEqual(rows)
      expect(hasMore).toEqual([true, false])
    })

    it(`clamps a limit above ${c.max} and still serves every row`, async () => {
      const rows = c.ids(2 * c.max + 1)
      const { calls } = c.seed(rows)
      const { ids, hasMore, params } = await drive(c.method, 1000, 3)
      expect(ids).toEqual(rows)
      expect(hasMore).toEqual([true, true, false])
      for (const u of calls)
        expect(Number(u.searchParams.get('pageSize'))).toBeLessThanOrEqual(c.max)
      for (const p of params) expect(readUpstreamPage(p)?.pageSize).toBeLessThanOrEqual(c.max)
    })

    it('gives meta.hasMore through parseListQuery and listPage', async () => {
      const rows = c.ids(7)
      c.seed(rows)
      const adapter = new WorldpayFisAdapter()
      const p1 = parseListQuery({ limit: '3', page: '1' }, adapter as unknown as PageMaxBearing)
      const e1 = listPage(await listRows(adapter, c.method, p1), p1, 'worldpay-fis')
      expect(e1.data.map((r) => r.id)).toEqual(rows.slice(0, 3))
      expect(e1.meta.hasMore).toBe(true)

      const p3 = parseListQuery({ limit: '3', page: '3' }, adapter as unknown as PageMaxBearing)
      const e3 = listPage(await listRows(adapter, c.method, p3), p3, 'worldpay-fis')
      expect(e3.data.map((r) => r.id)).toEqual(rows.slice(6))
      expect(e3.meta.hasMore).toBe(false)
    })

    it('API path clamps a limit above the declared maximum', async () => {
      const { calls } = c.seed(c.ids(PAYOUTS_MAX + 5))
      const adapter = new WorldpayFisAdapter()
      const p = parseListQuery({ limit: '1000', page: '1' }, adapter as unknown as PageMaxBearing)
      const e = listPage(await listRows(adapter, c.method, p), p, 'worldpay-fis')
      expect(e.data).toHaveLength(PAYOUTS_MAX)
      expect(e.meta.hasMore).toBe(true)
      expect(calls[0]!.searchParams.get('pageSize')).toBe(String(PAYOUTS_MAX))
    })
  })
}

describe('Worldpay listBalanceTransactions keeps its statement filters', () => {
  it('still forwards accountNumber beside the paging params', async () => {
    const { calls } = fakeUpstream([], statementIds(2))
    await drive('listBalanceTransactions', 10, 1)
    expect(calls[0]!.searchParams.get('accountNumber')).toBe('GB00001')
  })

  it('forwards startDate and endDate on every page', async () => {
    const L = 2
    const { calls } = fakeUpstream([], statementIds(2 * L + 1))
    const adapter = new WorldpayFisAdapter()
    const startDate = '2026-01-01T00:00:00Z'
    const endDate = '2026-01-31T00:00:00Z'
    for (let page = 1; page <= 2; page++) {
      const p = withPageSink({
        page,
        limit: L,
        accountNumber: 'GB00001',
        startDate,
        endDate,
      } as QueryParams)
      await adapter.listBalanceTransactions(CREDS, p)
    }
    expect(calls.map((u) => u.searchParams.get('startDate'))).toEqual([startDate, startDate])
    expect(calls.map((u) => u.searchParams.get('endDate'))).toEqual([endDate, endDate])
    expect(calls.map((u) => u.searchParams.get('pageNumber'))).toEqual(['1', '2'])
  })
})
