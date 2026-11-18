/**
 * Thunes adapter: auth, the rebuilt listBalanceTransactions, and the refused methods.
 *
 * Docs (https://docs.thunes.com/money-transfer/v2/):
 * - Authentication: HTTP Basic, "user-ID: API key", "password: API secret";
 *   "Specific details relating to the endpoints will be provided upon account creation."
 * - GET /v2/money-transfer/balances: page, per_page ("default 50, max 100"),
 *   bare array body, X-Next-Page header ("Next page number (if any)").
 * - GET /v2/money-transfer/balances/{balance_id}/movements: from_date and
 *   to_date required ("to_date should be within 24 hours of from_date"),
 *   limit ("Default 100, Max 200"), cursor ("from X-Next-Cursor response header field").
 *
 * The fake server honours only those documented parameters and rejects any other.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { _resetRowPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'

const { getMock, postMock, createMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  createMock: vi.fn(),
}))

vi.mock('axios', () => {
  const instance = { get: getMock, post: postMock }
  createMock.mockImplementation(() => instance)
  const axios = { create: createMock }
  return { default: axios, ...axios }
})

import { ThunesAdapter } from '../../../../../../src/verticals/payments/adapters/thunes'
import { BalanceTransactionSchema } from '../../../../../../src/verticals/payments/schema/balance-transaction'

const adapter = new ThunesAdapter()
const CREDS: Credentials = {
  accessToken: Buffer.from('key:secret').toString('base64'),
  extra: { apiEndpoint: 'https://mt.example.test' },
}
const DAY = 24 * 60 * 60 * 1000

interface Balance {
  id: number
  currency: string
}
interface Movement {
  balance_operation_number: number
  creation_date: string
  movement_type: string
  amount: number
  currency: string
  transaction_reference_id: number
  operation: string
  balance: number
  pending_balance: number
}

function movement(n: number, currency: string, at: string): Movement {
  return {
    balance_operation_number: n,
    creation_date: at,
    movement_type: 'PAYOUT',
    amount: -1.07,
    currency,
    transaction_reference_id: 123,
    operation: 'AUTHORIZE',
    balance: 1162.56,
    pending_balance: -119.14,
  }
}

/**
 * A fake Thunes: `balances` served by page/per_page, `movements[balanceId]`
 * filtered by [from_date, to_date) and paged by limit/cursor.
 */
function serve(balances: Balance[], movements: Record<number, Movement[]>) {
  const calls: Array<{ path: string; params: Record<string, unknown> }> = []
  getMock.mockImplementation(async (path: string, cfg: { params: Record<string, unknown> }) => {
    const p = cfg.params
    calls.push({ path, params: { ...p } })
    if (path === '/v2/money-transfer/balances') {
      for (const k of Object.keys(p)) {
        if (!['page', 'per_page'].includes(k)) throw new Error(`undocumented param ${k}`)
      }
      const per = Number(p.per_page ?? 50)
      if (per > 100) throw new Error('per_page above documented max 100')
      const page = Number(p.page ?? 1)
      const rows = balances.slice((page - 1) * per, page * per)
      const headers: Record<string, string> = { 'x-page': String(page) }
      if (page * per < balances.length) headers['x-next-page'] = String(page + 1)
      return { data: rows, headers }
    }
    const m = /^\/v2\/money-transfer\/balances\/(\d+)\/movements$/.exec(path)
    if (!m) throw new Error(`undocumented path ${path}`)
    for (const k of Object.keys(p)) {
      if (!['from_date', 'to_date', 'limit', 'cursor'].includes(k)) {
        throw new Error(`undocumented param ${k}`)
      }
    }
    if (typeof p.from_date !== 'string' || typeof p.to_date !== 'string') {
      throw new Error('from_date and to_date are required')
    }
    const from = Date.parse(p.from_date)
    const to = Date.parse(p.to_date)
    if (!(to > from) || to - from > DAY)
      throw new Error('to_date must be within 24 hours of from_date')
    const limit = Number(p.limit ?? 100)
    if (limit > 200) throw new Error('limit above documented max 200')
    const offset = p.cursor ? Number(Buffer.from(String(p.cursor), 'base64').toString()) : 0
    const inWindow = (movements[Number(m[1])] ?? []).filter((r) => {
      const t = Date.parse(r.creation_date)
      return t >= from && t < to
    })
    const rows = inWindow.slice(offset, offset + limit)
    const headers: Record<string, string> = {}
    if (offset + limit < inWindow.length) {
      headers['x-next-cursor'] = Buffer.from(String(offset + limit)).toString('base64')
    }
    return { data: rows, headers }
  })
  return calls
}

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  createMock.mockClear()
  _resetRowPager()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('ThunesAdapter auth', () => {
  it('builds Basic API_KEY:API_SECRET and keeps the per-account endpoint', async () => {
    const creds = await adapter.exchangeCredentials({
      apiKey: 'key',
      apiSecret: 'secret',
      apiEndpoint: 'mt.example.test/',
    })
    expect(Buffer.from(creds.accessToken, 'base64').toString()).toBe('key:secret')
    expect(creds.extra).toEqual({ apiEndpoint: 'https://mt.example.test' })
  })

  it('requires the secret and the endpoint', async () => {
    await expect(adapter.exchangeCredentials({ apiKey: 'key', apiEndpoint: 'h' })).rejects.toThrow()
    await expect(adapter.exchangeCredentials({ apiKey: 'key', apiSecret: 's' })).rejects.toThrow()
  })

  it('sends Basic auth to the connection endpoint', async () => {
    serve([], {})
    await adapter.listBalanceTransactions(
      CREDS,
      withPageSink({ updatedAfter: new Date('2026-09-27T00:00:00Z') }),
    )
    const cfg = createMock.mock.calls[0]![0] as { baseURL: string; headers: Record<string, string> }
    expect(cfg.baseURL).toBe('https://mt.example.test')
    expect(cfg.headers.Authorization).toBe(`Basic ${CREDS.accessToken}`)
  })

  it('refuses with 501 before any request when the connection has no endpoint', async () => {
    serve([], {})
    await expect(
      adapter.listBalanceTransactions(
        { accessToken: 'x' },
        withPageSink({ updatedAfter: new Date('2026-09-27T00:00:00Z') }),
      ),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('ThunesAdapter refused methods', () => {
  it.each([
    ['listCustomers', () => adapter.listCustomers()],
    ['getCustomer', () => adapter.getCustomer()],
    ['listCharges', () => adapter.listCharges()],
    ['getCharge', () => adapter.getCharge()],
    ['listRefunds', () => adapter.listRefunds()],
    ['getBalanceTransaction', () => adapter.getBalanceTransaction()],
  ])('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(getMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
  })

  it('listBalanceTransactions without updatedAfter throws 501 naming the window and sends no request', async () => {
    serve([{ id: 1, currency: 'EUR' }], {})
    await expect(
      adapter.listBalanceTransactions(CREDS, withPageSink({ page: 1, limit: 50 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('to_date should be within 24 hours of from_date'),
    })
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('ThunesAdapter.listBalanceTransactions windowed walk', () => {
  // Today is 2026-09-27 (UTC); updatedAfter 2026-09-25T06:00Z → windows 27, 26, 25 (from 06:00).
  const since = new Date('2026-09-25T06:00:00Z')
  const balances: Balance[] = [
    { id: 1, currency: 'EUR' },
    { id: 7, currency: 'USD' },
  ]
  const movements: Record<number, Movement[]> = {
    1: [
      ...Array.from({ length: 3 }, (_, i) => movement(9000 + i, 'EUR', '2026-09-27T09:00:00Z')),
      // 250 rows in one window: the upstream pages are 200 then 50 (uneven).
      ...Array.from({ length: 250 }, (_, i) => movement(5000 + i, 'EUR', '2026-09-26T10:00:00Z')),
    ],
    7: [
      movement(100, 'USD', '2026-09-25T08:00:00Z'),
      movement(101, 'USD', '2026-09-25T23:59:59Z'),
      // Before updatedAfter: must not be requested into range.
      movement(99, 'USD', '2026-09-25T03:00:00Z'),
      // Older than the lower bound's day.
      movement(98, 'USD', '2026-09-24T12:00:00Z'),
    ],
  }
  const TOTAL = 3 + 250 + 2

  it('walks every movement once at N = 2L+1 with exact hasMore', async () => {
    const calls = serve(balances, movements)
    const L = (TOTAL - 1) / 2 // 127
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L, updatedAfter: since } as QueryParams)
      const rows = await adapter.listBalanceTransactions(CREDS, params)
      for (const r of rows) BalanceTransactionSchema.parse(r)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toHaveLength(TOTAL)
    expect(new Set(seen).size).toBe(TOTAL)
    expect(seen).not.toContain('7-99')
    expect(seen).not.toContain('7-98')
    expect(seen.slice(0, 3)).toEqual(['1-9000', '1-9001', '1-9002'])
    expect(seen.slice(-2)).toEqual(['7-100', '7-101'])
    expect(more).toEqual([true, true, false])

    const movementCalls = calls.filter((c) => c.path.endsWith('/movements'))
    expect(movementCalls.every((c) => c.params.limit === 200)).toBe(true)
    // Newest window first, UTC-day anchored; the oldest window starts at updatedAfter.
    expect(movementCalls[0]!.params).toMatchObject({
      from_date: '2026-09-27T00:00:00Z',
      to_date: '2026-09-28T00:00:00Z',
    })
    expect(movementCalls.at(-1)!.params).toMatchObject({
      from_date: '2026-09-25T06:00:00Z',
      to_date: '2026-09-26T00:00:00Z',
    })
    // The 250-row window was cursor-paged: one request carried the X-Next-Cursor value.
    expect(movementCalls.some((c) => typeof c.params.cursor === 'string')).toBe(true)
    // Balances are asked for at the documented maximum page size.
    const balanceCalls = calls.filter((c) => c.path === '/v2/money-transfer/balances')
    expect(balanceCalls.every((c) => c.params.per_page === 100)).toBe(true)
  })

  it('serves a page at an arbitrary limit identically to a fresh walk', async () => {
    serve(balances, movements)
    const a = await adapter.listBalanceTransactions(
      CREDS,
      withPageSink({ page: 2, limit: 100, updatedAfter: since } as QueryParams),
    )
    _resetRowPager()
    const all = await adapter.listBalanceTransactions(
      CREDS,
      withPageSink({ page: 1, limit: 1000, updatedAfter: since } as QueryParams),
    )
    expect(a.map((r) => r.id)).toEqual(all.slice(100, 200).map((r) => r.id))
  })

  it('walks every balance page until X-Next-Page is absent', async () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ id: i + 1, currency: 'EUR' }))
    const calls = serve(many, { 101: [movement(1, 'EUR', '2026-09-27T01:00:00Z')] })
    const rows = await adapter.listBalanceTransactions(
      CREDS,
      withPageSink({
        page: 1,
        limit: 10,
        updatedAfter: new Date('2026-09-27T00:00:00Z'),
      } as QueryParams),
    )
    const balanceCalls = calls.filter((c) => c.path === '/v2/money-transfer/balances')
    expect(balanceCalls.map((c) => c.params.page)).toEqual([1, 2])
    expect(rows.map((r) => r.id)).toEqual(['101-1'])
  })
})

describe('ThunesAdapter.listBalanceTransactions edge cases', () => {
  const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id)
  const call = (updatedAfter: Date, page = 1, limit = 10) =>
    adapter.listBalanceTransactions(
      CREDS,
      withPageSink({ page, limit, updatedAfter } as QueryParams),
    )

  it('returns [] with hasMore false and sends nothing when updatedAfter is in the future', async () => {
    serve([{ id: 1, currency: 'EUR' }], { 1: [movement(1, 'EUR', '2026-09-27T09:00:00Z')] })
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-09-28T03:00:00Z'),
    } as QueryParams)
    expect(await adapter.listBalanceTransactions(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(getMock).not.toHaveBeenCalled()
  })

  // Page 1 always reads afresh; a later page resumes from a mark cached by an
  // earlier walk on the same pager key. These cases would resume at a mark
  // whose window/balance position means a different request under the new call.

  it('does not resume from marks cached for a different updatedAfter', async () => {
    serve([{ id: 1, currency: 'EUR' }], {
      1: [
        movement(1, 'EUR', '2026-09-27T01:00:00Z'),
        movement(2, 'EUR', '2026-09-27T09:00:00Z'),
        movement(3, 'EUR', '2026-09-26T10:00:00Z'),
      ],
    })
    expect(ids(await call(new Date('2026-09-25T06:00:00Z')))).toEqual(['1-1', '1-2', '1-3'])
    // With updatedAfter 2026-09-27T05:00Z only 1-2 qualifies, so page 2 at limit 2 is empty.
    expect(ids(await call(new Date('2026-09-27T05:00:00Z'), 2, 2))).toEqual([])
  })

  it('does not resume from marks cached before UTC midnight', async () => {
    const since = new Date('2026-09-26T00:00:00Z')
    vi.setSystemTime(new Date('2026-09-27T23:59:50Z'))
    serve([{ id: 1, currency: 'EUR' }], {
      1: [
        movement(1, 'EUR', '2026-09-27T09:00:00Z'),
        movement(3, 'EUR', '2026-09-26T10:00:00Z'),
        movement(4, 'EUR', '2026-09-28T00:00:01Z'),
        movement(5, 'EUR', '2026-09-28T00:00:02Z'),
      ],
    })
    expect(ids(await call(since))).toEqual(['1-1', '1-3'])
    vi.setSystemTime(new Date('2026-09-28T00:00:10Z'))
    // Stream is now 1-4, 1-5 (28th), 1-1 (27th), 1-3 (26th).
    expect(ids(await call(since, 2, 1))).toEqual(['1-5'])
  })

  it('does not resume from marks cached for a different set of balances', async () => {
    const since = new Date('2026-09-26T00:00:00Z')
    const movements = {
      1: [movement(1, 'EUR', '2026-09-27T09:00:00Z'), movement(3, 'EUR', '2026-09-26T09:00:00Z')],
      7: [movement(2, 'USD', '2026-09-27T09:00:00Z'), movement(4, 'USD', '2026-09-26T09:00:00Z')],
    }
    serve([{ id: 7, currency: 'USD' }], movements)
    expect(ids(await call(since))).toEqual(['7-2', '7-4'])
    serve(
      [
        { id: 1, currency: 'EUR' },
        { id: 7, currency: 'USD' },
      ],
      movements,
    )
    // Stream is now 1-1, 7-2 (27th), 1-3, 7-4 (26th).
    expect(ids(await call(since, 2, 1))).toEqual(['7-2'])
  })

  it('rejects a balances body that is not the documented bare array', async () => {
    getMock.mockResolvedValue({ data: { data: [] }, headers: {} })
    await expect(call(new Date('2026-09-27T00:00:00Z'))).rejects.toThrow(
      'Thunes balances response is not the documented array of balance objects.',
    )
  })

  it('rejects a movements body that is not the documented bare array', async () => {
    getMock.mockImplementation(async (path: string) =>
      path === '/v2/money-transfer/balances'
        ? { data: [{ id: 1, currency: 'EUR' }], headers: {} }
        : { data: { data: [] }, headers: {} },
    )
    await expect(call(new Date('2026-09-27T00:00:00Z'))).rejects.toThrow(
      'Thunes movements response is not the documented array of balance movements.',
    )
  })
})
