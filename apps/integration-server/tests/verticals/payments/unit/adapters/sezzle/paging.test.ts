/**
 * Sezzle list methods, paged the way the router and the sync worker ask.
 *
 * - `GET /v2/settlements/summaries` pages by row offset at a fixed size
 *   (https://docs.sezzle.com/docs/api/core/settlements/getv2summary):
 *   "Number of records to skip. Each response returns up to 30 records, so
 *   use 0 for the first 30, 30 for the next 30, and so on. Defaults to 0."
 *   It has no size parameter, the response is a bare array, and `start-date`
 *   is `required: true` ("The UTC start date for the report. Must be in
 *   yyyy-mm-dd format.").
 * - `GET /v2/customer` takes no parameters at all and returns every tokenized
 *   customer as a bare array
 *   (https://docs.sezzle.com/docs/api/tokenization/customers/getv2customerlist:
 *   "Retrieve a list of existing tokenized customers").
 *
 * The adapter used to read a non-contract `params.offset` (always offset=0)
 * and ignore params on customers, so page 2 was page 1 again on both. The
 * fakes below honour only the documented parameters.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { SezzleAdapter } from '../../../../../../src/verticals/payments/adapters/sezzle'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'

const { getMock, tokenOf } = vi.hoisted(() => ({
  getMock: vi.fn(),
  /** The access token of the client behind each `get` call, in call order. */
  tokenOf: [] as (string | undefined)[],
}))

vi.mock('../../../../../../src/verticals/payments/adapters/sezzle/client', () => ({
  SezzleClient: class {
    private readonly token: string | undefined
    constructor(creds: { accessToken?: string }) {
      this.token = creds.accessToken
    }
    get = (...args: unknown[]): unknown => {
      tokenOf.push(this.token)
      return getMock(...args)
    }
    post = vi.fn()
  },
}))

const adapter = new SezzleAdapter()
const routed: PaymentsAdapter = adapter
const CREDS: Credentials = { accessToken: 'sezzle_paging_token', extra: { environment: 'sandbox' } }
const SEZZLE_PAGE = 30
const SUMMARIES = new Set(['start-date', 'end-date', 'offset', 'currency-code'])

function rowIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `row_${i + 1}`)
}

/** Serve `n` settlement summaries, honouring only the documented parameters. */
function serveSummaries(n: number) {
  const calls: Record<string, unknown>[] = []
  const ids = rowIds(n)
  getMock.mockImplementation(async (p: string, params: Record<string, unknown> = {}) => {
    if (p !== '/settlements/summaries') throw new Error(`unexpected path ${p}`)
    calls.push({ ...params })
    for (const k of Object.keys(params)) if (!SUMMARIES.has(k)) throw new Error(`unknown ${k}`)
    const start = params['start-date']
    if (typeof start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      throw new Error('400: start-date is required (yyyy-mm-dd)')
    }
    const offset = params['offset'] === undefined ? 0 : Number(params['offset'])
    if (!Number.isInteger(offset) || offset < 0) throw new Error('invalid_offset')
    return ids.slice(offset, offset + SEZZLE_PAGE).map((uuid) => ({
      uuid,
      payout_currency: 'USD',
      payout_date: '2024-03-01T00:00:00Z',
      net_settlement_amount: 10,
      status: 'Complete',
    }))
  })
  return calls
}

/** Serve `n` tokenized customers; the endpoint takes no parameters. */
function serveCustomers(n: number) {
  const calls: (Record<string, unknown> | undefined)[] = []
  const ids = rowIds(n)
  getMock.mockImplementation(async (p: string, params?: Record<string, unknown>) => {
    if (p !== '/customer') throw new Error(`unexpected path ${p}`)
    calls.push(params)
    if (params !== undefined && Object.keys(params).length > 0) {
      throw new Error(`/v2/customer takes no parameters: ${Object.keys(params).join(',')}`)
    }
    return ids.map((uuid) => ({ uuid, first_name: 'A', last_name: 'B', email: `${uuid}@x.io` }))
  })
  return calls
}

async function call(
  method: 'listPayouts' | 'listCustomers',
  params: QueryParams,
): Promise<{ id: string }[]> {
  const fn = adapter[method].bind(adapter) as (
    c: Credentials,
    p: QueryParams,
  ) => Promise<{ id: string }[]>
  return fn(CREDS, params)
}

beforeEach(() => {
  getMock.mockReset()
  tokenOf.length = 0
  _resetRowPager()
})

describe('SezzleAdapter capabilities', () => {
  it('declares the documented 30-record page maximum', () => {
    expect(adapter.capabilities?.maxPageSize).toBe(SEZZLE_PAGE)
  })
})

describe('SezzleAdapter.listPayouts paging (offset, fixed 30)', () => {
  it('serves 2L+1 rows across three worker pages, each once and in order', async () => {
    const L = 10
    const calls = serveSummaries(2 * L + 1)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await call('listPayouts', params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(rowIds(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    // 21 rows fit in one 30-row window: pages 2 and 3 are cut from it.
    expect(calls.map((c) => c['offset'])).toEqual([0])
  })

  it('reports no more when the rows end exactly on a caller page boundary', async () => {
    const L = 10
    serveSummaries(2 * L)
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: L })
      await call('listPayouts', params)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
  })

  it('at L = 30, page 2 is fetched at offset 30 and every row is served once', async () => {
    const L = SEZZLE_PAGE
    const N = 2 * L + 1
    const calls = serveSummaries(N)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await call('listPayouts', params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(rowIds(N))
    expect(hasMore).toEqual([true, true, false])
    // One request per 30-row window, whatever the caller's page.
    expect(calls.map((c) => c['offset'])).toEqual([0, SEZZLE_PAGE, 2 * SEZZLE_PAGE])
  })

  it('a limit above 30 (the sync worker asks for 500 when uncapped) still serves every row', async () => {
    const N = 2 * SEZZLE_PAGE + 1
    const calls = serveSummaries(N)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await call('listPayouts', params)
    expect(rows.map((r) => r.id)).toEqual(rowIds(N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls.map((c) => c['offset'])).toEqual([0, SEZZLE_PAGE, 2 * SEZZLE_PAGE])
  })

  it('a call with no limit pages at the 30-row window, not the generic default', async () => {
    const N = 3 * SEZZLE_PAGE
    serveSummaries(N)
    const params = withPageSink({ page: 2 })
    const rows = await call('listPayouts', params)
    // Page 2 of 30 is rows 31..60; the generic default (100) would give none.
    expect(rows.map((r) => r.id)).toEqual(rowIds(N).slice(SEZZLE_PAGE, 2 * SEZZLE_PAGE))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('two connections on the same account do not share a walk', async () => {
    const L = 10
    // Same environment and public key, different tokens: two connections.
    const A: Credentials = { accessToken: 'token_A', extra: { environment: 'sandbox' } }
    const B: Credentials = { accessToken: 'token_B', extra: { environment: 'sandbox' } }
    const calls = serveSummaries(2 * L + 1)
    const inner = getMock.getMockImplementation()!
    getMock.mockImplementation(async (...args: unknown[]) => {
      const token = tokenOf[tokenOf.length - 1]
      const rows = (await inner(...args)) as { uuid: string }[]
      return rows.map((r) => ({ ...r, uuid: `${token}_${r.uuid}` }))
    })
    const pageA1 = await adapter.listPayouts(A, withPageSink({ page: 1, limit: L }))
    const pageB2 = await adapter.listPayouts(B, withPageSink({ page: 2, limit: L }))
    expect(pageA1.map((r) => r.id)).toEqual(rowIds(L).map((id) => `token_A_${id}`))
    expect(pageB2.map((r) => r.id)).toEqual(
      rowIds(2 * L)
        .slice(L)
        .map((id) => `token_B_${id}`),
    )
    // B fetched its own window rather than being cut from A's.
    expect(tokenOf).toEqual(['token_A', 'token_B'])
    expect(calls).toHaveLength(2)
  })

  it('sends the required start-date on every request', async () => {
    const calls = serveSummaries(3)
    await call('listPayouts', withPageSink({ page: 1, limit: 10 }))
    expect(calls[0]?.['start-date']).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const L = 10
    serveSummaries(2 * L)
    const metas = []
    for (let page = 1; page <= 2; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await call('listPayouts', params)
      metas.push(listPage(rows, params, 'sezzle').meta)
    }
    expect(metas.map((m) => m.hasMore)).toEqual([true, false])
  })

  it('API path clamps a limit above the declared maximum', async () => {
    const calls = serveSummaries(SEZZLE_PAGE + 5)
    const params = parseListQuery({ page: '2', limit: '250' }, routed)
    expect(params.limit).toBe(SEZZLE_PAGE)
    const rows = await call('listPayouts', params)
    expect(rows.map((r) => r.id)).toEqual(rowIds(SEZZLE_PAGE + 5).slice(SEZZLE_PAGE))
    expect(calls.map((c) => c['offset'])).toEqual([0, SEZZLE_PAGE])
    expect(listPage(rows, params, 'sezzle').meta.hasMore).toBe(false)
  })
})

describe('SezzleAdapter.listCustomers paging (unpaged upstream, local slice)', () => {
  it('serves 2L+1 rows across three worker pages, each once and in order', async () => {
    const L = 10
    const calls = serveCustomers(2 * L + 1)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await call('listCustomers', params)
      ids.push(...rows.map((r) => r.id))
      const report = readUpstreamPage(params)
      hasMore.push(report?.hasMore)
      expect(report?.pagedLocally).toBe(true)
    }
    expect(ids).toEqual(rowIds(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    // The documented request carries no parameters at all, page 2 included.
    expect(calls).toEqual([undefined, undefined, undefined])
  })

  it('a limit above the maximum still serves every row', async () => {
    const N = 2 * SEZZLE_PAGE + 1
    serveCustomers(N)
    const ids: string[] = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: '250' }, routed)
      expect(params.limit).toBe(SEZZLE_PAGE)
      const rows = await call('listCustomers', params)
      ids.push(...rows.map((r) => r.id))
    }
    expect(ids).toEqual(rowIds(N))
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const L = 10
    serveCustomers(2 * L)
    const metas = []
    for (let page = 1; page <= 2; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await call('listCustomers', params)
      metas.push(listPage(rows, params, 'sezzle').meta)
    }
    expect(metas.map((m) => m.hasMore)).toEqual([true, false])
    expect(metas.map((m) => m.totalCount)).toEqual([2 * L, 2 * L])
  })
})
