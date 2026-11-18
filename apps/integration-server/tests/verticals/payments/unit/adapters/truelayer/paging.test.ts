/**
 * TrueLayer list methods, paged the way the router and sync worker ask.
 *
 * Charges and payouts are rows of GET /v3/merchant-accounts/{id}/transactions
 * (https://docs.truelayer.com/reference/merchant-account-get-transactions).
 * Its documented parameters are the `{id}` path parameter and the `from`,
 * `to` (both required), `cursor` and `type` ("Filters transactions by
 * payments or payouts.") query parameters. "The range between `from` and `to`
 * cannot be more than 31 days if there are more than 2,000 transactions."
 * Pages end when "the response no longer contains the
 * `pagination.next_cursor` object"
 * (https://docs.truelayer.com/docs/get-your-merchant-account-transactions-or-payment-sources).
 *
 * The fake honours only those parameters and rejects any other.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetRowPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { TrueLayerAdapter } from '../../../../../../src/verticals/payments/adapters/truelayer'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { PayoutSchema } from '../../../../../../src/verticals/payments/schema/payout'
import {
  EXTERNAL_PAYMENT,
  MERCHANT_ACCOUNT_PAYMENT,
  PAYMENT_SETTLED,
  PAYOUT,
  PAYOUT_TRANSACTION,
  REFUND_TRANSACTION,
} from './fixtures/documented'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/truelayer/client', () => ({
  TrueLayerClient: class {
    get = getMock
  },
}))

const adapter = new TrueLayerAdapter()
const MA = '200552da-13da-43c5-a9ba-04ee1502ac57'
const CREDS: Credentials = {
  accessToken: 'tok',
  extra: { clientId: 'client', clientSecret: 'secret', merchantAccountId: MA },
}
const CREDS_NO_ACCOUNT: Credentials = {
  accessToken: 'tok',
  extra: { clientId: 'client', clientSecret: 'secret' },
}
const PATH = `/v3/merchant-accounts/${MA}/transactions`
const DOCUMENTED = new Set(['from', 'to', 'cursor', 'type'])
const NOW = '2024-04-17T13:42:32Z'
const AFTER = new Date('2024-02-10T00:00:00Z')
const DAY = 86_400_000

type Row = Record<string, unknown>
/** One window's upstream pages, keyed by the window's `from`. */
type Windows = Record<string, Row[][]>

function serve(windows: Windows) {
  const calls: Record<string, unknown>[] = []
  getMock.mockImplementation(
    async (p: string, q: Record<string, unknown>, h: Record<string, string>) => {
      expect(p).toBe(PATH)
      for (const k of Object.keys(q))
        expect(DOCUMENTED.has(k), `undocumented param ${k}`).toBe(true)
      expect(h).toEqual({ 'tl-enable-pagination': 'true' })
      const from = Date.parse(q.from as string)
      const to = Date.parse(q.to as string)
      expect(to - from).toBeGreaterThan(0)
      expect(to - from).toBeLessThanOrEqual(31 * DAY)
      expect(from).toBeGreaterThanOrEqual(AFTER.getTime())
      calls.push(q)
      const pages = windows[q.from as string] ?? [[]]
      const i = q.cursor === undefined ? 0 : Number(String(q.cursor).replace('c', ''))
      const next = i + 1 < pages.length ? { next_cursor: `c${i + 1}` } : {}
      return { items: pages[i] ?? [], pagination: next }
    },
  )
  return calls
}

beforeEach(() => {
  getMock.mockReset()
  _resetRowPager()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
})
afterEach(() => vi.useRealTimers())

const charge = (n: number): Row => ({
  ...MERCHANT_ACCOUNT_PAYMENT,
  id: `TX_${n}`,
  payment_id: `ROW_${n}`,
})
const payout = (n: number): Row => ({
  ...PAYOUT_TRANSACTION,
  id: `ROW_${n}`,
  payout_id: `ROW_${n}`,
})

const CASES = [
  ['listCharges', 'payment', charge, [EXTERNAL_PAYMENT], ChargeSchema],
  ['listPayouts', 'payout', payout, [REFUND_TRANSACTION], PayoutSchema],
] as const

describe.each(CASES)('%s', (method, type, row, others, Schema) => {
  const call = (creds: Credentials, params: QueryParams) =>
    (adapter[method] as (c: Credentials, p: QueryParams) => Promise<{ id: string }[]>).call(
      adapter,
      creds,
      params,
    )

  /**
   * 9 matching rows: April in two uneven upstream pages with other row
   * types mixed in, March empty, February (cut at updatedAfter) in one page.
   */
  const WINDOWS: Windows = {
    '2024-04-01T00:00:00Z': [
      [row(1), ...others, row(2), row(3)],
      [row(4), ...others],
    ],
    '2024-03-01T00:00:00Z': [[]],
    '2024-02-10T00:00:00Z': [[row(5), row(6), row(7), row(8), row(9)]],
  }

  it('refuses without a merchant account id and sends nothing', async () => {
    serve(WINDOWS)
    await expect(
      call(CREDS_NO_ACCOUNT, { page: 1, limit: 4, updatedAfter: AFTER }),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(getMock).not.toHaveBeenCalled()
  })

  it('refuses an unfiltered call (from/to are required) and sends nothing', async () => {
    serve(WINDOWS)
    const err = await call(CREDS, { page: 1, limit: 4 }).catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(String((err as Error).message)).toMatch(/updatedAfter/)
    expect(getMock).not.toHaveBeenCalled()
  })

  it('walks UTC calendar months newest-first down to updatedAfter', async () => {
    const calls = serve(WINDOWS)
    const params = withPageSink({ page: 1, limit: 100, updatedAfter: AFTER })
    await call(CREDS, params)
    expect(calls).toEqual([
      { from: '2024-04-01T00:00:00Z', to: NOW, type },
      { from: '2024-04-01T00:00:00Z', to: NOW, type, cursor: 'c1' },
      { from: '2024-03-01T00:00:00Z', to: '2024-04-01T00:00:00Z', type },
      { from: '2024-02-10T00:00:00Z', to: '2024-03-01T00:00:00Z', type },
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves N = 2L+1 rows over three pages, every id once, hasMore exact', async () => {
    serve(WINDOWS)
    const L = 4
    const seen: string[] = []
    const ends: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L, updatedAfter: AFTER })
      const rows = await call(CREDS, params)
      for (const r of rows) Schema.parse(r)
      seen.push(...rows.map((r) => r.id))
      ends.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `ROW_${i + 1}`))
    expect(new Set(seen).size).toBe(2 * L + 1)
    expect(ends).toEqual([true, true, false])
  })

  it('keys the walk by its lower bound: a new updatedAfter never resumes an old walk', async () => {
    serve(WINDOWS)
    const first = await call(CREDS, withPageSink({ page: 1, limit: 4, updatedAfter: AFTER }))
    expect(first.map((r) => r.id)).toEqual(['ROW_1', 'ROW_2', 'ROW_3', 'ROW_4'])
    // With lower bound 2024-04-01 the collection is April only (rows 1-4), so
    // page 2 is empty; resuming the Feb-10 walk would serve rows 5-8.
    const params = withPageSink({
      page: 2,
      limit: 4,
      updatedAfter: new Date('2024-04-01T00:00:00Z'),
    })
    const rows = await call(CREDS, params)
    expect(rows).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('stops at updatedAfter inside the current month', async () => {
    const calls = serve({ '2024-04-15T00:00:00Z': [[row(1)]] })
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2024-04-15T00:00:00Z'),
    })
    const rows = await call(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['ROW_1'])
    expect(calls).toEqual([{ from: '2024-04-15T00:00:00Z', to: NOW, type }])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('get methods', () => {
  it('getCharge reads GET /v3/payments/{id}', async () => {
    getMock.mockResolvedValue(PAYMENT_SETTLED)
    const c = await adapter.getCharge(CREDS, PAYMENT_SETTLED.id)
    expect(getMock).toHaveBeenCalledWith(`/v3/payments/${PAYMENT_SETTLED.id}`)
    expect(ChargeSchema.parse(c).id).toBe(PAYMENT_SETTLED.id)
  })

  it('getPayout reads GET /v3/payouts/{id}', async () => {
    getMock.mockResolvedValue(PAYOUT)
    const p = await adapter.getPayout(CREDS, PAYOUT.id)
    expect(getMock).toHaveBeenCalledWith(`/v3/payouts/${PAYOUT.id}`)
    expect(PayoutSchema.parse(p).id).toBe(PAYOUT.id)
  })
})
